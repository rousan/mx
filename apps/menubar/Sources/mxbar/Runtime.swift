import Foundation

/// Locates the mx runtime on disk.
///
/// A GUI app does not inherit the shell's environment, so a `$MX_RUNTIME` set in
/// a shell profile is usually invisible here — the resolution order therefore
/// prefers an explicit user preference, then the (rarely-present) environment
/// variable, then the `~/mx` default. This mirrors the CLI's own discovery order
/// minus the `--runtime` flag.
enum Runtime {
  /// UserDefaults key holding an optional custom runtime path.
  static let defaultsKey = "MXRuntimePath"

  /// The absolute path to the runtime folder (tilde-expanded).
  static func path() -> String {
    if let p = UserDefaults.standard.string(forKey: defaultsKey), !p.isEmpty {
      return (p as NSString).expandingTildeInPath
    }
    if let e = ProcessInfo.processInfo.environment["MX_RUNTIME"], !e.isEmpty {
      return (e as NSString).expandingTildeInPath
    }
    return ("~/mx" as NSString).expandingTildeInPath
  }

  /// Whether the resolved path is actually an mx runtime (has the `.mx-root` marker).
  static func exists() -> Bool {
    FileManager.default.fileExists(atPath: path() + "/.mx-root")
  }

  /// The runtime path shown in the footer, abbreviated with a leading tilde.
  static func displayPath() -> String {
    (path() as NSString).abbreviatingWithTildeInPath
  }
}
