// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Cocoa
import CommonCrypto

/// Ownership notice. The strings are stored encoded and verified against
/// checksums, so they cannot be found or patched as plain text in the binary.
enum Brand {
    private static let key: [UInt8] = [0x9e, 0x3b, 0xd4, 0x71, 0xc2, 0x58, 0xe7, 0x0d, 0xa6]
    private static let ownerBytes: [UInt8] = [0x36, 0x45, 0xfc, 0xce, 0xdf, 0x21, 0x04, 0xac, 0x80, 0x21, 0x6c, 0x9f, 0xff, 0x34, 0x08]
    private static let labelBytes: [UInt8] = [0xb3, 0x8d, 0xb8, 0xfd, 0xdf, 0x2b, 0x50, 0xb5, 0xce, 0x46, 0x75, 0xd3, 0xd4, 0x30, 0x0a, 0x23,
                                              0x98, 0x39]
    private static let legalBytes: [UInt8] = [0x32, 0x4b, 0xe8, 0xc3, 0xcc, 0x26, 0x43, 0xbc, 0xd4, 0x46, 0xcf, 0x5a, 0xb3, 0x63, 0x56, 0x7d,
                                              0xcb, 0x77, 0x18, 0x17, 0xae, 0x18, 0x09, 0x73, 0x56, 0x72, 0x5e, 0x73, 0x3e, 0x49, 0x29, 0x66,
                                              0x5a, 0x4f, 0x33, 0x24, 0x41, 0x2c, 0x1c, 0x2c, 0x73, 0x44, 0xe0, 0x4c, 0x7f, 0x22, 0xdb, 0x72,
                                              0x44, 0x48, 0xa8, 0xc5, 0x24, 0x57, 0xd5]
    private static let ownerSum: UInt64 = 0x1f54753f972257b1
    private static let labelSum: UInt64 = 0xf5c6ff922a1a5e22
    private static let legalSum: UInt64 = 0x9cfe2daeca9cdcab

    private static func decode(_ b: [UInt8]) -> String {
        var out = [UInt8]()
        out.reserveCapacity(b.count)
        for (i, x) in b.enumerated() {
            out.append(x ^ key[(i * 7 + 3) % key.count] ^ UInt8((i * 31) & 0xff))
        }
        return String(decoding: out, as: UTF8.self)
    }

    static func fnv1a(_ s: String) -> UInt64 {
        var h: UInt64 = 0xcbf29ce484222325
        for b in s.utf8 { h ^= UInt64(b); h = h &* 0x100000001b3 }
        return h
    }

    /// "Gadtan x Gallen"
    static let owner = decode(ownerBytes)
    /// "© Gadtan x Gallen"
    static let label = decode(labelBytes)
    /// "Copyright © 2026 Gadtan x Gallen. All rights reserved."
    static let legal = decode(legalBytes)

    static var isIntact: Bool {
        fnv1a(owner) == ownerSum && fnv1a(label) == labelSum && fnv1a(legal) == legalSum
            && label.hasSuffix(owner) && legal.contains(owner)
    }
}

/// Launch-time tamper checks: the notice itself, the bundle's copyright entry
/// and a SHA-256 manifest of the bundled web UI computed at build time.
enum Integrity {
    static func sha256Hex(_ data: Data) -> String {
        var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes { buf in _ = CC_SHA256(buf.baseAddress, CC_LONG(data.count), &digest) }
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    /// Same algorithm as build.sh: sorted "relative/path:sha256\n" lines, hashed.
    static func webDigest(_ root: URL) -> String? {
        let base = root.resolvingSymlinksInPath().path
        guard let en = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey]) else { return nil }
        var entries: [(String, String)] = []
        for case let url as URL in en {
            guard (try? url.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true,
                  url.lastPathComponent != ".DS_Store" else { continue }
            let p = url.resolvingSymlinksInPath().path
            guard p.hasPrefix(base + "/"), let data = try? Data(contentsOf: url) else { return nil }
            entries.append((String(p.dropFirst(base.count + 1)), sha256Hex(data)))
        }
        entries.sort { $0.0.utf8.lexicographicallyPrecedes($1.0.utf8) }
        return sha256Hex(Data(entries.map { "\($0.0):\($0.1)\n" }.joined().utf8))
    }

    static func enforce() {
        guard Brand.isIntact else { fail("Pemberitahuan hak cipta aplikasi telah diubah.") }
        let plist = Bundle.main.object(forInfoDictionaryKey: "NSHumanReadableCopyright") as? String ?? ""
        guard plist.contains(Brand.owner) else { fail("Informasi hak cipta pada aplikasi telah diubah.") }
        #if DEBUG
        if ProcessInfo.processInfo.environment["SINAI_WEB_ROOT"] != nil { return }
        #endif
        guard kWebIntegrity != "dev" else { return }
        let web = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
        guard webDigest(web) == kWebIntegrity else { fail("File aplikasi telah dimodifikasi.") }
    }

    static func fail(_ reason: String) -> Never {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Sinai tidak dapat dibuka"
        alert.informativeText = reason + " Silakan pasang ulang Sinai dari sumber resminya.\n\n" + (Brand.isIntact ? Brand.legal : "")
        alert.addButton(withTitle: "Keluar")
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
        exit(1)
    }
}

/// Native copyright label drawn by AppKit above the web view, so nothing in the
/// web UI (HTML, CSS, scripts, settings) can hide or remove it. Clicks pass through.
final class CopyrightLabel: NSTextField {
    private var guardTimer: Timer?

    convenience init() {
        self.init(labelWithString: Brand.label)
        font = NSFont.systemFont(ofSize: 9, weight: .regular)
        textColor = NSColor.tertiaryLabelColor
        alphaValue = CopyrightLabel.alpha
        alignment = .right
        isSelectable = false
        translatesAutoresizingMaskIntoConstraints = false
        setAccessibilityLabel(Brand.legal)
    }

    /// Sengaja samar: tetap terbaca, tapi tidak mengganggu isi jendela.
    static let alpha: CGFloat = 0.6

    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    /// Re-asserts the label every few seconds in case anything changed it.
    func startGuard(in host: NSView) {
        guardTimer?.invalidate()
        guardTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self, weak host] _ in
            guard let self = self, let host = host else { return }
            if !Brand.isIntact { Integrity.fail("Pemberitahuan hak cipta aplikasi telah diubah.") }
            if self.stringValue != Brand.label { self.stringValue = Brand.label }
            if self.isHidden { self.isHidden = false }
            if abs(self.alphaValue - CopyrightLabel.alpha) > 0.01 { self.alphaValue = CopyrightLabel.alpha }
            if self.superview !== host || host.subviews.last !== self {
                self.removeFromSuperview()
                host.addSubview(self)
                NSLayoutConstraint.activate([
                    self.trailingAnchor.constraint(equalTo: host.trailingAnchor, constant: -10),
                    self.bottomAnchor.constraint(equalTo: host.bottomAnchor, constant: -4),
                ])
            }
        }
    }
}
