// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Foundation
import PDFKit

/// File system operations used by the agent tools.
enum FileOps {
    /// Directories that are listed but never descended into.
    static let heavyDirs: Set<String> = [
        "node_modules", ".git", ".svn", ".hg", "__pycache__", ".venv", "venv", ".next", ".nuxt",
        ".cache", "Pods", "DerivedData", ".build", ".gradle", ".idea", ".turbo", ".parcel-cache",
        "vendor", "target", ".terraform", "bower_components", ".DS_Store",
    ]

    /// The running Sinai.app bundle is read-only for every tool.
    static func guardWritable(_ path: String) throws {
        let bundle = Bundle.main.bundleURL.resolvingSymlinksInPath().path
        let target = URL(fileURLWithPath: path).resolvingSymlinksInPath().path
        if target == bundle || target.hasPrefix(bundle + "/") {
            throw BridgeError("Tidak diizinkan: file aplikasi Sinai dilindungi dan tidak boleh diubah.")
        }
    }

    static func read(_ p: [String: Any]) throws -> [String: Any] {
        guard let raw = p["path"] as? String else { throw BridgeError("path wajib diisi") }
        let path = Paths.expand(raw)
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: path, isDirectory: &isDir) else {
            throw BridgeError("File tidak ditemukan: \(path)")
        }
        if isDir.boolValue { throw BridgeError("Path adalah folder, bukan file: \(path)") }
        let attrs = try FileManager.default.attributesOfItem(atPath: path)
        let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
        let maxBytes = (p["maxBytes"] as? Int) ?? 4_000_000
        guard let fh = FileHandle(forReadingAtPath: path) else { throw BridgeError("Tidak bisa membuka file: \(path)") }
        defer { fh.closeFile() }
        let data = fh.readData(ofLength: maxBytes)
        let binary = data.prefix(8000).contains(0)
        var out: [String: Any] = [
            "path": path, "size": size, "truncated": size > maxBytes, "binary": binary,
            "mtime": ((attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0) * 1000,
        ]
        if (p["base64"] as? Bool) == true {
            out["base64"] = data.base64EncodedString()
        } else if !binary {
            out["content"] = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) ?? ""
        }
        return out
    }

    static func write(_ p: [String: Any]) throws -> [String: Any] {
        guard let raw = p["path"] as? String, let content = p["content"] as? String else {
            throw BridgeError("path dan content wajib diisi")
        }
        let path = Paths.expand(raw)
        try guardWritable(path)
        let url = URL(fileURLWithPath: path)
        let existed = FileManager.default.fileExists(atPath: path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = content.data(using: .utf8) ?? Data()
        if existed {
            // Keep permissions/xattrs of the original file by writing in place.
            try data.write(to: url, options: [])
        } else {
            try data.write(to: url, options: [.atomic])
        }
        return ["path": path, "created": !existed, "bytes": data.count]
    }

    static func stat(_ p: [String: Any]) -> [String: Any] {
        guard let raw = p["path"] as? String else { return ["exists": false] }
        let path = Paths.expand(raw)
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: path, isDirectory: &isDir) else { return ["exists": false, "path": path] }
        let attrs = (try? FileManager.default.attributesOfItem(atPath: path)) ?? [:]
        return [
            "exists": true, "path": path, "isDir": isDir.boolValue,
            "size": (attrs[.size] as? NSNumber)?.intValue ?? 0,
            "mtime": ((attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0) * 1000,
        ]
    }

    static func list(_ p: [String: Any]) throws -> [String: Any] {
        guard let raw = p["path"] as? String else { throw BridgeError("path wajib diisi") }
        let root = Paths.expand(raw)
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: root, isDirectory: &isDir), isDir.boolValue else {
            throw BridgeError("Folder tidak ditemukan: \(root)")
        }
        let maxDepth = max(1, min((p["depth"] as? Int) ?? 2, 8))
        let limit = (p["limit"] as? Int) ?? 400
        let hidden = (p["hidden"] as? Bool) ?? false
        var entries: [[String: Any]] = []
        var truncated = false
        let fm = FileManager.default

        func walk(_ dir: String, _ rel: String, _ depth: Int) {
            guard !truncated else { return }
            guard let names = try? fm.contentsOfDirectory(atPath: dir) else { return }
            for name in names.sorted(by: { $0.localizedStandardCompare($1) == .orderedAscending }) {
                if entries.count >= limit { truncated = true; return }
                if name == ".DS_Store" { continue }
                if !hidden && name.hasPrefix(".") && name != ".env.example" && name != ".gitignore" && name != ".github" { continue }
                let full = (dir as NSString).appendingPathComponent(name)
                let relPath = rel.isEmpty ? name : rel + "/" + name
                var d: ObjCBool = false
                fm.fileExists(atPath: full, isDirectory: &d)
                var e: [String: Any] = ["path": relPath, "dir": d.boolValue, "depth": depth]
                if d.boolValue {
                    if heavyDirs.contains(name) { e["skipped"] = true; entries.append(e); continue }
                    entries.append(e)
                    if depth < maxDepth { walk(full, relPath, depth + 1) }
                } else {
                    let attrs = try? fm.attributesOfItem(atPath: full)
                    e["size"] = (attrs?[.size] as? NSNumber)?.intValue ?? 0
                    entries.append(e)
                }
            }
        }
        walk(root, "", 1)
        return ["root": root, "entries": entries, "truncated": truncated]
    }

    /// Converts a glob (supports **, *, ?, {a,b}, [abc]) into an anchored regex.
    static func globRegex(_ pattern: String) -> NSRegularExpression? {
        var rx = "^"
        let chars = Array(pattern)
        var i = 0
        var inBrace = 0
        while i < chars.count {
            let c = chars[i]
            switch c {
            case "*":
                if i + 1 < chars.count && chars[i + 1] == "*" {
                    if i + 2 < chars.count && chars[i + 2] == "/" { rx += "(?:.*/)?"; i += 3; continue }
                    rx += ".*"; i += 2; continue
                }
                rx += "[^/]*"
            case "?": rx += "[^/]"
            case "{": rx += "(?:"; inBrace += 1
            case "}": rx += inBrace > 0 ? ")" : "\\}"; inBrace = max(0, inBrace - 1)
            case ",": rx += inBrace > 0 ? "|" : ","
            case "[":
                if let close = chars[(i + 1)...].firstIndex(of: "]") {
                    var cls = String(chars[(i + 1)..<close])
                    if cls.hasPrefix("!") { cls = "^" + cls.dropFirst() }
                    rx += "[" + cls + "]"
                    i = close + 1
                    continue
                }
                rx += "\\["
            case ".", "(", ")", "+", "|", "^", "$", "\\": rx += "\\" + String(c)
            default: rx += String(c)
            }
            i += 1
        }
        rx += "$"
        return try? NSRegularExpression(pattern: rx, options: [])
    }

    static func glob(_ p: [String: Any]) throws -> [String: Any] {
        guard let rootRaw = p["root"] as? String, let pattern = p["pattern"] as? String else {
            throw BridgeError("root dan pattern wajib diisi")
        }
        let root = Paths.expand(rootRaw)
        let limit = (p["limit"] as? Int) ?? 200
        var pat = pattern
        if pat.hasPrefix("./") { pat.removeFirst(2) }
        let matchBasename = !pat.contains("/")
        guard let rx = globRegex(pat) else { throw BridgeError("Pola glob tidak valid") }
        let wantsHeavy = heavyDirs.contains { pat.contains($0) }
        let fm = FileManager.default
        guard let en = fm.enumerator(at: URL(fileURLWithPath: root),
                                      includingPropertiesForKeys: [.isDirectoryKey, .contentModificationDateKey],
                                      options: [], errorHandler: { _, _ in true }) else {
            throw BridgeError("Folder tidak ditemukan: \(root)")
        }
        var results: [(String, Double)] = []
        var scanned = 0
        let rootLen = URL(fileURLWithPath: root).standardizedFileURL.path.count + 1
        while let obj = en.nextObject() as? URL {
            scanned += 1
            if scanned > 300_000 { break }
            let name = obj.lastPathComponent
            let vals = try? obj.resourceValues(forKeys: [.isDirectoryKey, .contentModificationDateKey])
            if vals?.isDirectory == true {
                if !wantsHeavy && heavyDirs.contains(name) { en.skipDescendants() }
                continue
            }
            let full = obj.standardizedFileURL.path
            guard full.count > rootLen else { continue }
            let rel = String(full.dropFirst(rootLen))
            let target = matchBasename ? name : rel
            if rx.firstMatch(in: target, options: [], range: NSRange(target.startIndex..., in: target)) != nil {
                results.append((rel, vals?.contentModificationDate?.timeIntervalSince1970 ?? 0))
            }
        }
        results.sort { $0.1 > $1.1 }
        let truncated = results.count > limit
        return ["root": root, "files": results.prefix(limit).map { $0.0 }, "total": results.count, "truncated": truncated]
    }

    static func mkdir(_ p: [String: Any]) throws -> [String: Any] {
        guard let raw = p["path"] as? String else { throw BridgeError("path wajib diisi") }
        let path = Paths.expand(raw)
        try guardWritable(path)
        try FileManager.default.createDirectory(atPath: path, withIntermediateDirectories: true)
        return ["path": path]
    }

    static func trash(_ p: [String: Any]) throws -> [String: Any] {
        guard let raw = p["path"] as? String else { throw BridgeError("path wajib diisi") }
        let path = Paths.expand(raw)
        guard path != "/" && path != NSHomeDirectory() else { throw BridgeError("Menolak memindahkan path ini ke Trash") }
        try guardWritable(path)
        var result: NSURL?
        try FileManager.default.trashItem(at: URL(fileURLWithPath: path), resultingItemURL: &result)
        return ["path": path, "trashedTo": result?.path ?? ""]
    }

    static func move(_ p: [String: Any]) throws -> [String: Any] {
        guard let a = p["from"] as? String, let b = p["to"] as? String else { throw BridgeError("from dan to wajib diisi") }
        let from = Paths.expand(a), to = Paths.expand(b)
        try guardWritable(from)
        try guardWritable(to)
        try FileManager.default.createDirectory(at: URL(fileURLWithPath: to).deletingLastPathComponent(), withIntermediateDirectories: true)
        try FileManager.default.moveItem(atPath: from, toPath: to)
        return ["from": from, "to": to]
    }

    /// Extracts plain text from PDF / Word / RTF / HTML documents.
    static func extractText(_ p: [String: Any]) throws -> [String: Any] {
        var path = (p["path"] as? String).map(Paths.expand)
        var tempURL: URL? = nil
        if path == nil, let b64 = p["base64"] as? String, let data = Data(base64Encoded: b64) {
            let ext = (p["ext"] as? String) ?? "bin"
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("sinai-\(UUID().uuidString).\(ext)")
            try data.write(to: url)
            tempURL = url
            path = url.path
        }
        defer { if let t = tempURL { try? FileManager.default.removeItem(at: t) } }
        guard let file = path else { throw BridgeError("path atau base64 wajib diisi") }
        let ext = (file as NSString).pathExtension.lowercased()
        if ext == "pdf" {
            let doc = try Ingest.openPDF(URL(fileURLWithPath: file), password: p["password"] as? String)
            return ["text": doc.string ?? "", "pages": doc.pageCount]
        }
        let r = runSync("/usr/bin/textutil", ["-convert", "txt", "-stdout", file], timeout: 30)
        if r.code != 0 { throw BridgeError("Tidak bisa mengekstrak teks: \(r.err)") }
        return ["text": r.out]
    }
}
