// Prevent an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_positioner::{Position, WindowExt};

/// One active work shown in the popover.
#[derive(Serialize)]
struct Work {
    name: String,
    path: String,
    worktrees: usize,
}

/// The result of scanning the runtime for active works.
#[derive(Serialize)]
struct WorksResult {
    runtime_path: String,
    runtime_missing: bool,
    works: Vec<Work>,
}

/// Resolve the mx runtime directory.
///
/// GUI apps don't inherit the shell environment, so `$MX_RUNTIME` (usually set in
/// a shell profile) is rarely visible — but we still honor it when present,
/// then fall back to `~/mx`, mirroring the CLI's discovery order.
fn runtime_dir() -> PathBuf {
    if let Ok(p) = std::env::var("MX_RUNTIME") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    dirs::home_dir().unwrap_or_default().join("mx")
}

/// List the runtime's active (non-archived) works, read straight from
/// `<runtime>/works/*/work.json`. No dependency on the `mx` binary.
#[tauri::command]
fn list_works() -> WorksResult {
    let runtime = runtime_dir();
    let runtime_path = runtime.to_string_lossy().to_string();

    if !runtime.join(".mx-root").exists() {
        return WorksResult {
            runtime_path,
            runtime_missing: true,
            works: Vec::new(),
        };
    }

    let mut works = Vec::new();
    if let Ok(entries) = fs::read_dir(runtime.join("works")) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let dir_name = entry.file_name().to_string_lossy().to_string();
            if dir_name.starts_with('.') {
                continue;
            }

            let mut name = dir_name;
            let mut archived = false;
            let mut worktrees = 0usize;

            if let Ok(text) = fs::read_to_string(path.join("work.json")) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(n) = v.get("name").and_then(|x| x.as_str()) {
                        if !n.is_empty() {
                            name = n.to_string();
                        }
                    }
                    archived = v.get("isArchived").and_then(|x| x.as_bool()).unwrap_or(false);
                    worktrees = v
                        .get("worktrees")
                        .and_then(|x| x.as_array())
                        .map(|a| a.len())
                        .unwrap_or(0);
                }
            }

            if archived {
                continue;
            }
            works.push(Work {
                name,
                path: path.to_string_lossy().to_string(),
                worktrees,
            });
        }
    }

    works.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    WorksResult {
        runtime_path,
        runtime_missing: false,
        works,
    }
}

/// Open a work folder in the OS file manager.
#[tauri::command]
fn reveal_path(path: String) {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(&path).spawn();
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(&path).spawn();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(&path).spawn();
}

/// Quit the app (from the popover's Quit button).
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .invoke_handler(tauri::generate_handler![list_works, reveal_path, quit])
        .setup(|app| {
            // Menubar-only: no Dock icon on macOS.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Right-click menu with a Quit item.
            let quit_item = MenuItem::with_id(app, "quit", "Quit mx", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_item])?;

            // A transparent, mark-only glyph for the menubar. On macOS
            // `icon_as_template` renders it monochrome from its alpha; on
            // Windows/Linux it shows in color.
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;

            let _tray = TrayIconBuilder::with_id("mxbar-tray")
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    let app = tray.app_handle();
                    // Feed the event to the positioner so TrayCenter knows where the icon is.
                    tauri_plugin_positioner::on_tray_event(app, &event);

                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.move_window(Position::TrayCenter);
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Dismiss the popover when it loses focus (a click elsewhere).
            if let Some(win) = app.get_webview_window("main") {
                let dismiss = win.clone();
                win.on_window_event(move |event| {
                    if let WindowEvent::Focused(false) = event {
                        let _ = dismiss.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running mxbar");
}
