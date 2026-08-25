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

/// Center the popover window horizontally under the tray icon, with its top at
/// the icon's bottom edge — so the window's centered arrow points right at the
/// icon. `rect` is the tray icon's screen rect from the click event.
fn position_under_icon(win: &tauri::WebviewWindow, rect: &tauri::Rect) {
    let scale = win.scale_factor().unwrap_or(1.0);
    let icon_pos = rect.position.to_physical::<f64>(scale);
    let icon_size = rect.size.to_physical::<f64>(scale);
    let icon_center_x = icon_pos.x + icon_size.width / 2.0;
    let icon_bottom_y = icon_pos.y + icon_size.height;

    let win_w = win.outer_size().map(|s| s.width as f64).unwrap_or(320.0 * scale);
    let x = icon_center_x - win_w / 2.0;
    let y = icon_bottom_y;

    let _ = win.set_position(tauri::PhysicalPosition::new(x.max(0.0), y.max(0.0)));
}

/// Make the popover float above everything, including fullscreen Spaces.
///
/// A normal macOS window stays behind a fullscreen app's Space. Setting the
/// NSWindow's collection behavior to `CanJoinAllSpaces | FullScreenAuxiliary`
/// (and raising it to the status-window level) lets the popover appear over a
/// fullscreen app, the way system menubar popovers do.
#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn make_panel_over_fullscreen(win: &tauri::WebviewWindow) {
    use cocoa::appkit::{NSWindow, NSWindowCollectionBehavior};
    use cocoa::base::id;

    if let Ok(ns_window) = win.ns_window() {
        let ns_window = ns_window as id;
        unsafe {
            ns_window.setCollectionBehavior_(
                NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                    | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary,
            );
            // NSStatusWindowLevel (25) — above normal and fullscreen content.
            ns_window.setLevel_(25);
        }
    }
}

fn main() {
    tauri::Builder::default()
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
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                // Center the popover under the tray icon so the
                                // arrow points at the icon's bottom edge.
                                position_under_icon(&win, &rect);
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Dismiss the popover when it loses focus (a click elsewhere).
            if let Some(win) = app.get_webview_window("main") {
                // Let the popover appear over other Spaces, including fullscreen
                // apps — a normal window otherwise stays behind a fullscreen Space.
                #[cfg(target_os = "macos")]
                {
                    let _ = win.set_visible_on_all_workspaces(true);
                    make_panel_over_fullscreen(&win);
                }

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
