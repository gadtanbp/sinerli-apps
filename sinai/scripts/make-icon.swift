// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Renders the Sinai app icon from the logo image into an .iconset, using the
// macOS icon grid (824/1024 rounded tile) with a soft liquid-glass sheen. The
// logo (a transparent emblem) sits on a light tile, aspect-fitted with margin.
// Usage: swift scripts/make-icon.swift <output.iconset> <logo.jpg|png>
import Cocoa

let args = CommandLine.arguments
let out = args.count > 1 ? args[1] : "AppIcon.iconset"
guard args.count > 2, let logo = NSImage(contentsOfFile: args[2]) else {
    FileHandle.standardError.write("logo image not found\n".data(using: .utf8)!)
    exit(1)
}
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

func render(_ px: Int) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current!.imageInterpolation = .high
    let s = CGFloat(px)
    let ctx = NSGraphicsContext.current!.cgContext

    let inset = s * 100 / 1024
    let tile = NSRect(x: inset, y: inset, width: s - inset * 2, height: s - inset * 2)
    let radius = tile.width * 0.225
    let path = NSBezierPath(roundedRect: tile, xRadius: radius, yRadius: radius)

    // Drop shadow
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -s * 0.012), blur: s * 0.028,
                  color: NSColor(calibratedWhite: 0, alpha: 0.38).cgColor)
    NSColor.white.setFill()
    path.fill()
    ctx.restoreGState()
    ctx.saveGState()
    path.addClip()
    NSGradient(colors: [NSColor(calibratedRed: 1, green: 1, blue: 1, alpha: 1),
                        NSColor(calibratedRed: 0.90, green: 0.97, blue: 0.96, alpha: 1)])!.draw(in: tile, angle: -90)
    ctx.restoreGState()

    // Logo, aspect-fitted into the tile with a small margin
    ctx.saveGState()
    path.addClip()
    let lw = logo.size.width, lh = logo.size.height
    let scale = min(tile.width / lw, tile.height / lh) * 0.96
    let dw = lw * scale, dh = lh * scale
    logo.draw(in: NSRect(x: tile.midX - dw / 2, y: tile.midY - dh / 2, width: dw, height: dh),
              from: .zero, operation: .sourceOver, fraction: 1)

    // Liquid-glass sheen on the upper half
    let sheen = NSBezierPath(ovalIn: NSRect(x: tile.minX - tile.width * 0.3, y: tile.midY + tile.height * 0.06,
                                            width: tile.width * 1.6, height: tile.height * 1.0))
    ctx.saveGState()
    sheen.addClip()
    NSGradient(colors: [NSColor(calibratedWhite: 1, alpha: 0.16), NSColor(calibratedWhite: 1, alpha: 0.0)])!
        .draw(in: tile, angle: -90)
    ctx.restoreGState()
    // Gentle vignette at the bottom for depth
    NSGradient(colors: [NSColor(calibratedWhite: 0, alpha: 0.0), NSColor(calibratedWhite: 0, alpha: 0.05)])!
        .draw(in: NSRect(x: tile.minX, y: tile.minY, width: tile.width, height: tile.height * 0.35), angle: -90)
    ctx.restoreGState()

    // Glass rim
    let rim = NSBezierPath(roundedRect: tile.insetBy(dx: s * 0.003, dy: s * 0.003), xRadius: radius, yRadius: radius)
    rim.lineWidth = max(1, s * 0.005)
    NSColor(calibratedWhite: 0, alpha: 0.08).setStroke()
    rim.stroke()

    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

let sizes: [(String, Int)] = [
    ("icon_16x16", 16), ("icon_16x16@2x", 32), ("icon_32x32", 32), ("icon_32x32@2x", 64),
    ("icon_128x128", 128), ("icon_128x128@2x", 256), ("icon_256x256", 256), ("icon_256x256@2x", 512),
    ("icon_512x512", 512), ("icon_512x512@2x", 1024),
]
for (name, px) in sizes {
    try! render(px).write(to: URL(fileURLWithPath: "\(out)/\(name).png"))
}
print("icon written to \(out)")
