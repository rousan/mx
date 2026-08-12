import AppKit
import SwiftUI

/// The popover shown when the menubar glyph is clicked: a header, the list of
/// active works (name + path), and a footer with the runtime path and controls.
struct ContentView: View {
  @EnvironmentObject private var store: WorksStore

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header
      Divider()

      if store.runtimeMissing {
        missingState
      } else if store.works.isEmpty {
        emptyState
      } else {
        worksList
      }

      Divider()
      footer
    }
    .frame(width: 300)
    // Reload whenever the popover opens; the directory watch keeps it live while open.
    .onAppear { store.reload() }
  }

  private var header: some View {
    HStack(spacing: 8) {
      LogoView(size: 18)
      Text("mx")
        .font(.system(size: 15, weight: .bold))
      Text("active works")
        .font(.system(size: 11))
        .foregroundStyle(.secondary)
      Spacer()
      if !store.works.isEmpty {
        Text("\(store.works.count)")
          .font(.system(size: 11, weight: .semibold, design: .monospaced))
          .foregroundStyle(Color.mxAccent)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 11)
  }

  private var worksList: some View {
    ScrollView {
      VStack(spacing: 2) {
        ForEach(store.works) { work in
          WorkRow(work: work)
        }
      }
      .padding(.horizontal, 6)
      .padding(.vertical, 6)
    }
    .frame(maxHeight: 360)
  }

  private var emptyState: some View {
    VStack(spacing: 6) {
      Text("No active works")
        .font(.system(size: 13, weight: .medium))
      Text("Create one with  mx work new <name>")
        .font(.system(size: 11, design: .monospaced))
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 26)
  }

  private var missingState: some View {
    VStack(spacing: 6) {
      Text("No mx runtime found")
        .font(.system(size: 13, weight: .medium))
      Text(Runtime.displayPath())
        .font(.system(size: 11, design: .monospaced))
        .foregroundStyle(.secondary)
      Text("Run  mx init  to create one.")
        .font(.system(size: 11))
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 22)
    .padding(.horizontal, 14)
    .multilineTextAlignment(.center)
  }

  private var footer: some View {
    HStack(spacing: 8) {
      Button {
        store.reload()
      } label: {
        Image(systemName: "arrow.clockwise")
      }
      .buttonStyle(.plain)
      .help("Refresh")

      Text(Runtime.displayPath())
        .font(.system(size: 10))
        .foregroundStyle(.tertiary)
        .lineLimit(1)
        .truncationMode(.middle)

      Spacer()

      Button("Quit") {
        NSApp.terminate(nil)
      }
      .buttonStyle(.plain)
      .font(.system(size: 11))
      .foregroundStyle(.secondary)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 9)
  }
}

/// One work row: the work name, its tilde-abbreviated path, a faint worktree
/// count, and hover-revealed actions (reveal in Finder, copy path). Clicking the
/// row reveals the work folder in Finder.
struct WorkRow: View {
  let work: Work
  @State private var hovering = false

  var body: some View {
    HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 2) {
        Text(work.name)
          .font(.system(size: 13, weight: .semibold))
          .lineLimit(1)
        Text(work.displayPath)
          .font(.system(size: 11))
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .truncationMode(.middle)
      }

      Spacer(minLength: 6)

      if hovering {
        Button(action: reveal) {
          Image(systemName: "folder")
        }
        .buttonStyle(.plain)
        .help("Reveal in Finder")

        Button(action: copyPath) {
          Image(systemName: "doc.on.doc")
        }
        .buttonStyle(.plain)
        .help("Copy path")
      } else if work.worktreeCount > 0 {
        Text("\(work.worktreeCount)")
          .font(.system(size: 10, design: .monospaced))
          .foregroundStyle(.tertiary)
          .help("\(work.worktreeCount) worktree\(work.worktreeCount == 1 ? "" : "s")")
      }
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 7)
    .background(hovering ? Color.primary.opacity(0.07) : Color.clear)
    .clipShape(RoundedRectangle(cornerRadius: 7))
    .contentShape(Rectangle())
    .onHover { hovering = $0 }
    .onTapGesture(perform: reveal)
  }

  /// Open the work folder in Finder (selected in its parent).
  private func reveal() {
    NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: work.path)])
  }

  /// Copy the work's absolute path to the clipboard.
  private func copyPath() {
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    pasteboard.setString(work.path, forType: .string)
  }
}
