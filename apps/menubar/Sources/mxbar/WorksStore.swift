import Foundation
import Combine

/// One active work as shown in the popover.
struct Work: Identifiable, Equatable {
  var id: String { path }
  let name: String
  let path: String
  let worktreeCount: Int

  /// The work folder path, abbreviated with a leading tilde for display.
  var displayPath: String { (path as NSString).abbreviatingWithTildeInPath }
}

/// The subset of `work.json` this viewer reads. mx owns the full schema; we only
/// need the display name, the archived flag, and the worktree count.
private struct WorkManifest: Decodable {
  let name: String?
  let isArchived: Bool?
  let worktrees: [Worktree]?
  struct Worktree: Decodable {}
}

/// Loads the runtime's active works and keeps them fresh.
///
/// Works are read straight from `<runtime>/works/*/work.json` (no dependency on
/// the `mx` binary or the shell `PATH`). A directory watch on `works/` refreshes
/// the list live when works are created or removed; the view also reloads each
/// time the popover opens, which covers in-place changes like archiving.
final class WorksStore: ObservableObject {
  @Published private(set) var works: [Work] = []
  @Published private(set) var runtimeMissing = false

  private var dirSource: DispatchSourceFileSystemObject?
  private var dirFD: Int32 = -1

  init() {
    reload()
    startWatching()
  }

  deinit { stopWatching() }

  /// Re-scan the runtime's `works/` folder for active (non-archived) works.
  func reload() {
    let runtime = Runtime.path()
    guard FileManager.default.fileExists(atPath: runtime + "/.mx-root") else {
      runtimeMissing = true
      works = []
      return
    }
    runtimeMissing = false

    let fm = FileManager.default
    let worksDir = runtime + "/works"
    let entries = (try? fm.contentsOfDirectory(atPath: worksDir)) ?? []

    var result: [Work] = []
    for entry in entries where !entry.hasPrefix(".") {
      let dir = worksDir + "/" + entry
      var isDir: ObjCBool = false
      guard fm.fileExists(atPath: dir, isDirectory: &isDir), isDir.boolValue else { continue }

      var name = entry
      var archived = false
      var worktreeCount = 0
      if let data = fm.contents(atPath: dir + "/work.json"),
        let manifest = try? JSONDecoder().decode(WorkManifest.self, from: data)
      {
        if let n = manifest.name, !n.isEmpty { name = n }
        archived = manifest.isArchived ?? false
        worktreeCount = manifest.worktrees?.count ?? 0
      }

      if archived { continue }
      result.append(Work(name: name, path: dir, worktreeCount: worktreeCount))
    }

    works = result.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  /// Watch the `works/` directory for child add/remove so the list stays live
  /// even while the popover is open.
  private func startWatching() {
    stopWatching()
    let worksDir = Runtime.path() + "/works"
    dirFD = open(worksDir, O_EVTONLY)
    guard dirFD >= 0 else { return }

    let source = DispatchSource.makeFileSystemObjectSource(
      fileDescriptor: dirFD,
      eventMask: [.write, .delete, .rename],
      queue: .main
    )
    source.setEventHandler { [weak self] in self?.reload() }
    source.setCancelHandler { [weak self] in
      if let fd = self?.dirFD, fd >= 0 { close(fd) }
      self?.dirFD = -1
    }
    dirSource = source
    source.resume()
  }

  private func stopWatching() {
    dirSource?.cancel()
    dirSource = nil
  }
}
