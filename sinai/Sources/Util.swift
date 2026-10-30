// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Foundation
import Compression

/// Serialises a value into a JS expression of the form `{"v": <value>}`.
enum JSONBridge {
    static func wrap(_ value: Any?) -> String {
        let obj: [String: Any] = ["v": sanitize(value ?? NSNull())]
        guard let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
              var s = String(data: data, encoding: .utf8) else { return "{\"v\":null}" }
        s = s.replacingOccurrences(of: "\u{2028}", with: "\\u2028")
             .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        return s
    }

    static func quote(_ s: String) -> String {
        let w = wrap(s)
        // strip {"v": ... }
        return String(w.dropFirst(5).dropLast(1))
    }

    private static func sanitize(_ v: Any) -> Any {
        switch v {
        case let d as [String: Any]: return d.mapValues { sanitize($0) }
        case let a as [Any]: return a.map { sanitize($0) }
        case let n as Double: return n.isFinite ? n : NSNull()
        case let s as String: return s
        case is NSNull, is NSNumber, is Int, is Int32, is Int64, is Bool: return v
        case let u as URL: return u.path
        case let d as Date: return d.timeIntervalSince1970 * 1000
        default: return String(describing: v)
        }
    }
}

/// Accumulates bytes and only releases complete UTF-8 sequences.
final class UTF8Chunker {
    private var pending: [UInt8] = []

    func append(_ data: Data) -> String {
        pending.append(contentsOf: data)
        guard !pending.isEmpty else { return "" }
        var cut = pending.count
        var i = pending.count - 1
        var cont = 0
        while i >= 0 && cont < 4 {
            let b = pending[i]
            if b & 0xC0 == 0x80 { cont += 1; i -= 1; continue }
            let need: Int
            if b & 0x80 == 0 { need = 1 }
            else if b & 0xE0 == 0xC0 { need = 2 }
            else if b & 0xF0 == 0xE0 { need = 3 }
            else if b & 0xF8 == 0xF0 { need = 4 }
            else { need = 1 }
            if cont + 1 < need { cut = i }
            break
        }
        let head = Array(pending[0..<cut])
        pending.removeFirst(cut)
        return String(decoding: head, as: UTF8.self)
    }

    func flush() -> String {
        let s = String(decoding: pending, as: UTF8.self)
        pending.removeAll()
        return s
    }
}

enum Paths {
    static func expand(_ p: String) -> String {
        let e = (p as NSString).expandingTildeInPath
        return (e as NSString).standardizingPath
    }

    static var support: URL {
        #if DEBUG
        if let dev = ProcessInfo.processInfo.environment["SINAI_SUPPORT_DIR"] {
            let dir = URL(fileURLWithPath: dev, isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            return dir
        }
        #endif
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        let dir = base.appendingPathComponent("Sinai", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Resolves a path inside the app support dir, refusing anything that escapes it.
    static func inSupport(_ rel: String) -> URL? {
        let parts = rel.split(separator: "/").map(String.init)
        guard !rel.hasPrefix("/"), !rel.hasPrefix("~"), !parts.contains(".."), !parts.contains(".") else { return nil }
        return parts.isEmpty ? support : support.appendingPathComponent(parts.joined(separator: "/"))
    }
}

func shellQuote(_ s: String) -> String {
    return "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'"
}

/// Drains whatever is currently readable from a pipe without blocking.
func drainNonBlocking(_ fd: Int32) -> Data {
    let flags = fcntl(fd, F_GETFL)
    _ = fcntl(fd, F_SETFL, flags | O_NONBLOCK)
    var out = Data()
    var buf = [UInt8](repeating: 0, count: 65536)
    while true {
        let n = read(fd, &buf, buf.count)
        if n > 0 { out.append(buf, count: n) } else { break }
    }
    return out
}

/// Runs a short-lived helper process and returns its output.
@discardableResult
func runSync(_ launchPath: String, _ args: [String], cwd: String? = nil, timeout: Double = 10,
             env: [String: String]? = nil) -> (code: Int32, out: String, err: String) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: launchPath)
    p.arguments = args
    if let cwd = cwd { p.currentDirectoryURL = URL(fileURLWithPath: cwd) }
    if let env = env { p.environment = env }
    p.standardInput = FileHandle.nullDevice
    let o = Pipe(), e = Pipe()
    p.standardOutput = o
    p.standardError = e
    var outData = Data(), errData = Data()
    let lock = NSLock()
    o.fileHandleForReading.readabilityHandler = { h in
        let d = h.availableData
        if d.isEmpty { h.readabilityHandler = nil } else { lock.lock(); outData.append(d); lock.unlock() }
    }
    e.fileHandleForReading.readabilityHandler = { h in
        let d = h.availableData
        if d.isEmpty { h.readabilityHandler = nil } else { lock.lock(); errData.append(d); lock.unlock() }
    }
    let sem = DispatchSemaphore(value: 0)
    p.terminationHandler = { _ in sem.signal() }
    do { try p.run() } catch { return (-1, "", error.localizedDescription) }
    if sem.wait(timeout: .now() + timeout) == .timedOut {
        p.terminate()
        _ = sem.wait(timeout: .now() + 1)
    }
    Thread.sleep(forTimeInterval: 0.02)
    o.fileHandleForReading.readabilityHandler = nil
    e.fileHandleForReading.readabilityHandler = nil
    lock.lock()
    outData.append(drainNonBlocking(o.fileHandleForReading.fileDescriptor))
    errData.append(drainNonBlocking(e.fileHandleForReading.fileDescriptor))
    let out = String(decoding: outData, as: UTF8.self)
    let err = String(decoding: errData, as: UTF8.self)
    lock.unlock()
    return (p.isRunning ? -1 : p.terminationStatus, out, err)
}

/// Process environment for commands the agent runs: the user's login PATH plus
/// settings that keep tools non-interactive.
final class Env {
    static let shared = Env()
    private let lock = NSLock()
    private var _path = "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin"
    private(set) var resolved = false

    var path: String { lock.lock(); defer { lock.unlock() }; return _path }

    var userShell: String {
        if let pw = getpwuid(getuid()), let sh = pw.pointee.pw_shell { return String(cString: sh) }
        return "/bin/zsh"
    }

    func resolveLoginPath() {
        DispatchQueue.global(qos: .utility).async {
            let shell = self.userShell
            let marker = "__SINAI_PATH__"
            let r = runSync(shell, ["-ilc", "printf '%s' \"\(marker)$PATH\(marker)\""], timeout: 6)
            var merged: [String] = []
            if let a = r.out.range(of: marker), let b = r.out.range(of: marker, range: a.upperBound..<r.out.endIndex) {
                merged = String(r.out[a.upperBound..<b.lowerBound]).split(separator: ":").map(String.init)
            }
            for extra in ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
                where !merged.contains(extra) { merged.append(extra) }
            self.lock.lock()
            self._path = merged.filter { !$0.isEmpty }.joined(separator: ":")
            self.resolved = true
            self.lock.unlock()
        }
    }

    func environment(extra: [String: String] = [:]) -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = path
        env["HOME"] = NSHomeDirectory()
        if env["LANG"] == nil { env["LANG"] = "en_US.UTF-8" }
        env["TERM"] = "dumb"
        env["NO_COLOR"] = "1"
        env["CLICOLOR"] = "0"
        env["GIT_PAGER"] = "cat"
        env["PAGER"] = "cat"
        env["GIT_TERMINAL_PROMPT"] = "0"
        env["HOMEBREW_NO_ENV_HINTS"] = "1"
        env["SINAI"] = "1"
        for k in ["SINAI_DEBUG_PORT", "SINAI_WEB_ROOT", "SINAI_SECRET_STORE", "SINAI_SUPPORT_DIR"] { env.removeValue(forKey: k) }
        for (k, v) in extra { env[k] = v }
        return env
    }
}

/// Minimal ZIP writer (store + deflate) for generating .xlsx/.pptx/.zip in
/// memory. Entries use UTF-8 names; Office readers accept stored entries.
enum Zip {
    private static let table: [UInt32] = {
        (0..<256).map { i -> UInt32 in
            var c = UInt32(i)
            for _ in 0..<8 { c = (c & 1) != 0 ? 0xedb88320 ^ (c >> 1) : c >> 1 }
            return c
        }
    }()

    static func crc32(_ data: Data) -> UInt32 {
        var c: UInt32 = 0xffffffff
        for b in data { c = table[Int((c ^ UInt32(b)) & 0xff)] ^ (c >> 8) }
        return c ^ 0xffffffff
    }

    /// Raw DEFLATE via Apple's Compression framework; nil if it would not shrink.
    private static func deflate(_ input: Data) -> Data? {
        guard input.count > 64 else { return nil }
        let dstCap = input.count
        let dst = UnsafeMutablePointer<UInt8>.allocate(capacity: dstCap)
        defer { dst.deallocate() }
        let produced = input.withUnsafeBytes { (src: UnsafeRawBufferPointer) -> Int in
            guard let base = src.bindMemory(to: UInt8.self).baseAddress else { return 0 }
            return compression_encode_buffer(dst, dstCap, base, input.count, nil, COMPRESSION_ZLIB)
        }
        guard produced > 0, produced < input.count else { return nil }
        return Data(bytes: dst, count: produced)
    }

    private static func le16(_ v: UInt16) -> [UInt8] { [UInt8(v & 0xff), UInt8(v >> 8)] }
    private static func le32(_ v: UInt32) -> [UInt8] { [UInt8(v & 0xff), UInt8((v >> 8) & 0xff), UInt8((v >> 16) & 0xff), UInt8((v >> 24) & 0xff)] }

    static func create(textFiles: [(String, String)]) throws -> Data {
        try create(files: textFiles.map { ($0.0, Data($0.1.utf8)) })
    }

    static func create(files: [(String, Data)]) throws -> Data {
        var out = Data()
        var central = Data()
        var offset: UInt32 = 0
        // DOS date/time (fixed, 2026-01-01 00:00)
        let dosTime = UInt16(0)
        let dosDate = UInt16(((2026 - 1980) << 9) | (1 << 5) | 1)
        for (rawName, data) in files {
            let name = Array(rawName.utf8)
            let crc = crc32(data)
            let compressed = deflate(data)
            let method: UInt16 = compressed != nil ? 8 : 0
            let payload = compressed ?? data
            var local = Data()
            local.append(contentsOf: le32(0x04034b50))
            local.append(contentsOf: le16(20))
            local.append(contentsOf: le16(0x0800)) // UTF-8 flag
            local.append(contentsOf: le16(method))
            local.append(contentsOf: le16(dosTime))
            local.append(contentsOf: le16(dosDate))
            local.append(contentsOf: le32(crc))
            local.append(contentsOf: le32(UInt32(payload.count)))
            local.append(contentsOf: le32(UInt32(data.count)))
            local.append(contentsOf: le16(UInt16(name.count)))
            local.append(contentsOf: le16(0))
            local.append(contentsOf: name)
            local.append(payload)

            var cd = Data()
            cd.append(contentsOf: le32(0x02014b50))
            cd.append(contentsOf: le16(20))
            cd.append(contentsOf: le16(20))
            cd.append(contentsOf: le16(0x0800))
            cd.append(contentsOf: le16(method))
            cd.append(contentsOf: le16(dosTime))
            cd.append(contentsOf: le16(dosDate))
            cd.append(contentsOf: le32(crc))
            cd.append(contentsOf: le32(UInt32(payload.count)))
            cd.append(contentsOf: le32(UInt32(data.count)))
            cd.append(contentsOf: le16(UInt16(name.count)))
            cd.append(contentsOf: le16(0))
            cd.append(contentsOf: le16(0))
            cd.append(contentsOf: le16(0))
            cd.append(contentsOf: le16(0))
            cd.append(contentsOf: le32(0))
            cd.append(contentsOf: le32(offset))
            cd.append(contentsOf: name)
            central.append(cd)

            out.append(local)
            offset += UInt32(local.count)
        }
        let centralOffset = offset
        out.append(central)
        var end = Data()
        end.append(contentsOf: le32(0x06054b50))
        end.append(contentsOf: le16(0))
        end.append(contentsOf: le16(0))
        end.append(contentsOf: le16(UInt16(files.count)))
        end.append(contentsOf: le16(UInt16(files.count)))
        end.append(contentsOf: le32(UInt32(central.count)))
        end.append(contentsOf: le32(centralOffset))
        end.append(contentsOf: le16(0))
        out.append(end)
        return out
    }
}
