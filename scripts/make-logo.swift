// Sinerli Apps — logo aplikasi (ubin membulat bergradasi + glyph).
// swift scripts/make-logo.swift <out.png> <#warna> <glyph>
import AppKit
let a = CommandLine.arguments
let out = a[1], hex = a[2].replacingOccurrences(of: "#", with: ""), glyph = a[3]
let v = UInt32(hex, radix: 16)!
let base = NSColor(red: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: 1)
let size: CGFloat = 1024
let img = NSImage(size: NSSize(width: size, height: size))
img.lockFocus()
let ctx = NSGraphicsContext.current!.cgContext
let rect = CGRect(x: 72, y: 72, width: size - 144, height: size - 144)
ctx.addPath(CGPath(roundedRect: rect, cornerWidth: 220, cornerHeight: 220, transform: nil)); ctx.clip()
let top = base.blended(withFraction: 0.25, of: .white)!, bottom = base.blended(withFraction: 0.3, of: .black)!
let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [top.cgColor, bottom.cgColor] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(g, start: CGPoint(x: 0, y: size), end: CGPoint(x: size, y: 0), options: [])
ctx.setFillColor(NSColor(white: 1, alpha: 0.10).cgColor)
ctx.fillEllipse(in: CGRect(x: -200, y: size * 0.45, width: size * 1.1, height: size * 0.9))
let style = NSMutableParagraphStyle(); style.alignment = .center
let font = NSFont.systemFont(ofSize: 520, weight: .bold)
let attr: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white, .paragraphStyle: style]
let s = NSAttributedString(string: glyph, attributes: attr)
let b = s.boundingRect(with: NSSize(width: size, height: size), options: [.usesLineFragmentOrigin])
s.draw(in: CGRect(x: 0, y: (size - b.height) / 2 - 10, width: size, height: b.height))
img.unlockFocus()
let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
