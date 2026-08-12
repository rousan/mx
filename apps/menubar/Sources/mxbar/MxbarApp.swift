import SwiftUI

/// The menubar app entry point.
///
/// A single `MenuBarExtra` scene rendered in `.window` style, so clicking the
/// menubar glyph opens a small popover (rather than a plain dropdown menu). The
/// app has no `WindowGroup`, and the delegate forces the accessory activation
/// policy, so it lives entirely in the menubar with no Dock icon.
@main
struct MxbarApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var store = WorksStore()

  var body: some Scene {
    MenuBarExtra {
      ContentView()
        .environmentObject(store)
    } label: {
      // Menubar glyph. Menubar images render as monochrome templates, so we use
      // a system symbol here (the full-color mx mark lives in the popover header).
      Image(systemName: "square.stack.3d.up")
    }
    .menuBarExtraStyle(.window)
  }
}

/// Sets the accessory activation policy so the app shows only in the menubar
/// (the packaged `.app` also declares `LSUIElement`, but this covers running the
/// bare `swift run` binary during development).
final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
  }
}
