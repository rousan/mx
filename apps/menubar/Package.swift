// swift-tools-version:5.9
import PackageDescription

/// mxbar — a tiny macOS menubar app that lists your active mx works.
///
/// Built as an SPM executable (no Xcode project needed); `build.sh` wraps the
/// release binary into a proper `mxbar.app` bundle with an `LSUIElement`
/// Info.plist so it runs as a menubar-only accessory with no Dock icon.
let package = Package(
  name: "mxbar",
  platforms: [.macOS(.v13)],
  targets: [
    .executableTarget(name: "mxbar", path: "Sources/mxbar")
  ]
)
