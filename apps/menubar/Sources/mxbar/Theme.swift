import SwiftUI

extension Color {
  /// Build a color from a 24-bit RGB hex literal, e.g. `Color(hex: 0x0d9488)`.
  init(hex: UInt) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xff) / 255,
      green: Double((hex >> 8) & 0xff) / 255,
      blue: Double(hex & 0xff) / 255,
      opacity: 1
    )
  }

  /// The mx brand teal, used sparingly for accents (count badges, small marks).
  static let mxAccent = Color(hex: 0x0d9488)
}

/// The multi-pastel mx mark (three strokes fanning from a source node into three
/// end dots), drawn to match the site's logo. Colors are intentional here — this
/// renders inside the popover, not as a menubar template glyph.
struct LogoView: View {
  var size: CGFloat = 20

  var body: some View {
    Canvas { ctx, canvasSize in
      let s = canvasSize.width / 33.0
      func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }

      let teal = Color(hex: 0x2dd4bf)
      let amber = Color(hex: 0xfbbf24)
      let rose = Color(hex: 0xfb7185)
      let violet = Color(hex: 0xa78bfa)

      func stroke(_ from: CGPoint, _ to: CGPoint, _ color: Color) {
        var path = Path()
        path.move(to: from)
        path.addLine(to: to)
        ctx.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: 2.8 * s, lineCap: .round))
      }
      stroke(p(9, 14), p(26, 6), teal)
      stroke(p(9, 14), p(26, 14), amber)
      stroke(p(9, 14), p(26, 22), rose)

      func dot(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ color: Color) {
        let rect = CGRect(x: (x - r) * s, y: (y - r) * s, width: 2 * r * s, height: 2 * r * s)
        ctx.fill(Path(ellipseIn: rect), with: .color(color))
      }
      dot(7, 14, 3.8, violet)
      dot(26, 6, 3.4, teal)
      dot(26, 14, 3.4, amber)
      dot(26, 22, 3.4, rose)
    }
    .frame(width: size, height: size * 28 / 33)
  }
}
