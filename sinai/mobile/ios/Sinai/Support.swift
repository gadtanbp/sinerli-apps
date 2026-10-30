// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import UIKit
import WebKit
import Security

// MARK: - Aset UI, pratinjau & berkas bertoken

/// Pratinjau artifact (HTML di memori) dan berkas yang boleh dibaca halaman lewat token acak.
final class AppAssets {
    private var docs: [String: String] = [:]
    private var order: [String] = []
    private var files: [String: URL] = [:]
    private let lock = NSLock()
    let web = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)

    func putPreview(_ key: String, _ html: String) -> String {
        let k = key.replacingOccurrences(of: "[^A-Za-z0-9_.-]", with: "_", options: .regularExpression)
        lock.lock(); defer { lock.unlock() }
        if docs[k] == nil { order.append(k) }
        docs[k] = html
        while order.count > 80 { docs.removeValue(forKey: order.removeFirst()) }
        return "sinai-preview://p/" + k
    }

    func preview(_ key: String) -> String? { lock.lock(); defer { lock.unlock() }; return docs[key] }

    func fileToken(_ f: URL) -> String {
        lock.lock(); defer { lock.unlock() }
        if let k = files.first(where: { $0.value == f })?.key { return k }
        let k = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        files[k] = f
        if files.count > 400, let first = files.keys.first { files.removeValue(forKey: first) }
        return k
    }

    func file(_ key: String) -> URL? { lock.lock(); defer { lock.unlock() }; return files[key] }

    static func mime(_ ext: String) -> String {
        [
            "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8",
            "css": "text/css; charset=utf-8", "json": "application/json", "svg": "image/svg+xml", "png": "image/png",
            "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp", "heic": "image/heic",
            "pdf": "application/pdf", "wasm": "application/wasm", "mp4": "video/mp4", "m4v": "video/mp4", "mov": "video/quicktime",
            "webm": "video/webm", "mp3": "audio/mpeg", "m4a": "audio/mp4", "wav": "audio/wav", "txt": "text/plain; charset=utf-8",
            "md": "text/plain; charset=utf-8", "csv": "text/csv; charset=utf-8", "woff2": "font/woff2", "ttf": "font/ttf",
        ][ext.lowercased()] ?? "application/octet-stream"
    }

    static func respond(_ task: WKURLSchemeTask, _ url: URL, _ data: Data, _ mime: String, extra: [String: String] = [:]) {
        var h = ["Content-Type": mime, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"]
        h.merge(extra) { $1 }
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: h)!)
        task.didReceive(data)
        task.didFinish()
    }

    static func notFound(_ task: WKURLSchemeTask) {
        task.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
    }

    /// Berkas dengan dukungan Range (video bisa digeser).
    static func serveFile(_ task: WKURLSchemeTask, url: URL, file: URL, extra: [String: String] = [:]) {
        guard let fh = try? FileHandle(forReadingFrom: file),
              let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.int64Value else { notFound(task); return }
        defer { try? fh.close() }
        var start: Int64 = 0, end: Int64 = max(0, size - 1), partial = false
        if let r = task.request.value(forHTTPHeaderField: "Range"), r.hasPrefix("bytes=") {
            let se = r.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
            if se.count == 2 {
                if let a = Int64(se[0]) { start = a; if let b = Int64(se[1]) { end = min(b, size - 1) } } else if let b = Int64(se[1]) { start = max(0, size - b) }
                partial = true
            }
        }
        guard start <= end || size == 0 else { notFound(task); return }
        fh.seek(toFileOffset: UInt64(start))
        let data = size == 0 ? Data() : fh.readData(ofLength: Int(end - start + 1))
        var h = ["Content-Type": mime(file.pathExtension), "Accept-Ranges": "bytes", "Content-Length": String(data.count), "Cache-Control": "no-store"]
        if partial { h["Content-Range"] = "bytes \(start)-\(end)/\(size)" }
        h.merge(extra) { $1 }
        task.didReceive(HTTPURLResponse(url: url, statusCode: partial ? 206 : 200, httpVersion: "HTTP/1.1", headerFields: h)!)
        task.didReceive(data)
        task.didFinish()
    }
}

/// sinai://app/... → UI web di bundel aplikasi; sinai://app/__file/<token>/<nama> → berkas terdaftar.
final class AppScheme: NSObject, WKURLSchemeHandler {
    let assets: AppAssets
    init(assets: AppAssets) { self.assets = assets }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, url.host == "app" else { AppAssets.notFound(task); return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let parts = path.split(separator: "/").map(String.init)
        if parts.first == "__file", parts.count >= 2, let f = assets.file(parts[1]) { AppAssets.serveFile(task, url: url, file: f); return }
        guard !parts.contains(".."), !parts.contains("."), let data = try? Data(contentsOf: assets.web.appendingPathComponent(parts.joined(separator: "/"))) else {
            AppAssets.notFound(task); return
        }
        AppAssets.respond(task, url, data, AppAssets.mime((path as NSString).pathExtension))
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// sinai-preview:// → asal terpisah untuk iframe pratinjau artifact (tanpa bridge).
final class PreviewScheme: NSObject, WKURLSchemeHandler {
    let assets: AppAssets
    init(assets: AppAssets) { self.assets = assets }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let parts = url.path.split(separator: "/").map(String.init)
        let cors = ["Access-Control-Allow-Origin": "*"]
        switch url.host {
        case "p":
            guard let key = parts.first, let html = assets.preview(key) else { AppAssets.notFound(task); return }
            AppAssets.respond(task, url, Data(html.utf8), "text/html; charset=utf-8", extra: cors)
        case "lib":
            guard !parts.isEmpty, !parts.contains(".."), !parts.contains("."),
                  let data = try? Data(contentsOf: assets.web.appendingPathComponent("preview-lib").appendingPathComponent(parts.joined(separator: "/"))) else { AppAssets.notFound(task); return }
            AppAssets.respond(task, url, data, AppAssets.mime(url.pathExtension), extra: cors)
        case "file":
            guard let key = parts.first, let f = assets.file(key) else { AppAssets.notFound(task); return }
            AppAssets.serveFile(task, url: url, file: f, extra: cors)
        default:
            AppAssets.notFound(task)
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// MARK: - Sandbox berkas

/// Hanya folder milik aplikasi: Documents/home, Application Support/support, Caches.
final class Sandbox {
    let home: URL, support: URL, cache: URL, temp: URL
    private let roots: [String]

    init() {
        let fm = FileManager.default
        home = fm.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("home", isDirectory: true)
        support = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Sinai", isDirectory: true)
        cache = fm.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        temp = cache.appendingPathComponent("tmp", isDirectory: true)
        for d in [home, support, temp] { try? fm.createDirectory(at: d, withIntermediateDirectories: true) }
        roots = [home.deletingLastPathComponent(), support.deletingLastPathComponent(), cache].map { $0.resolvingSymlinksInPath().standardizedFileURL.path }
    }

    func guardPath(_ path: String) throws -> URL {
        guard !path.isEmpty else { throw BridgeError("path wajib diisi") }
        let u = (path.hasPrefix("/") ? URL(fileURLWithPath: path) : home.appendingPathComponent(path)).resolvingSymlinksInPath().standardizedFileURL
        let p = u.path
        guard roots.contains(where: { p == $0 || p.hasPrefix($0 + "/") }) else { throw BridgeError("Di luar folder aplikasi: \(path)") }
        return u
    }

    func existing(_ path: String) throws -> URL {
        let u = try guardPath(path)
        var dir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: u.path, isDirectory: &dir), !dir.boolValue else { throw BridgeError("File tidak ditemukan: \(path)") }
        return u
    }

    private func storeURL(_ name: String) throws -> URL {
        guard !name.isEmpty, !name.contains(".."), !name.hasPrefix("/") else { throw BridgeError("Nama tidak valid") }
        return support.appendingPathComponent(name)
    }

    func storeRead(_ name: String) throws -> Any? {
        let u = try storeURL(name)
        guard let d = try? Data(contentsOf: u) else { return nil }
        return String(decoding: d, as: UTF8.self)
    }

    func storeWrite(_ name: String, _ content: String) throws {
        let u = try storeURL(name)
        try FileManager.default.createDirectory(at: u.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(content.utf8).write(to: u, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func storeDelete(_ name: String) throws {
        let u = try storeURL(name)
        if u.standardizedFileURL == support.standardizedFileURL { throw BridgeError("Nama tidak valid") }
        try? FileManager.default.removeItem(at: u)
    }

    func storeList(_ dir: String) throws -> [String] {
        let u = dir.isEmpty ? support : try storeURL(dir)
        return ((try? FileManager.default.contentsOfDirectory(atPath: u.path)) ?? []).filter { !$0.hasPrefix(".") }
    }

    func readBytes(_ path: String, offset: Int64, length: Int64) throws -> [String: Any] {
        let u = try existing(path)
        let attrs = try FileManager.default.attributesOfItem(atPath: u.path)
        let size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
        let n = length > 0 ? min(length, max(0, size - offset)) : max(0, size - offset)
        guard n <= 300 * 1_048_576 else { throw BridgeError("Berkas terlalu besar untuk dibaca sekaligus") }
        let fh = try FileHandle(forReadingFrom: u)
        defer { try? fh.close() }
        fh.seek(toFileOffset: UInt64(offset))
        let d = fh.readData(ofLength: Int(n))
        return ["base64": d.base64EncodedString(), "size": size, "mtime": ((attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0) * 1000]
    }

    func writeBytes(_ path: String, _ data: Data, append: Bool) throws -> [String: Any] {
        let u = try guardPath(path)
        try FileManager.default.createDirectory(at: u.deletingLastPathComponent(), withIntermediateDirectories: true)
        if append, let fh = try? FileHandle(forWritingTo: u) {
            fh.seekToEndOfFile()
            fh.write(data)
            try? fh.close()
        } else {
            try data.write(to: u, options: .atomic)
        }
        let size = ((try? FileManager.default.attributesOfItem(atPath: u.path))?[.size] as? NSNumber)?.intValue ?? data.count
        return ["path": u.path, "bytes": size]
    }

    func stat(_ path: String) -> [String: Any] {
        guard let u = try? guardPath(path) else { return ["exists": false, "path": path] }
        var dir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: u.path, isDirectory: &dir), let a = try? FileManager.default.attributesOfItem(atPath: u.path) else { return ["exists": false, "path": u.path] }
        return ["exists": true, "path": u.path, "isDir": dir.boolValue, "size": dir.boolValue ? 0 : ((a[.size] as? NSNumber)?.int64Value ?? 0),
                "mtime": ((a[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0) * 1000]
    }

    func listDir(_ path: String) throws -> [String: Any] {
        let u = try guardPath(path)
        let items = try FileManager.default.contentsOfDirectory(at: u, includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey, .contentModificationDateKey])
        return ["entries": items.map { f -> [String: Any] in
            let v = try? f.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey, .contentModificationDateKey])
            return ["name": f.lastPathComponent, "dir": v?.isDirectory ?? false, "size": v?.fileSize ?? 0, "mtime": (v?.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1000]
        }]
    }

    func mkdir(_ path: String) throws { try FileManager.default.createDirectory(at: try guardPath(path), withIntermediateDirectories: true) }

    func remove(_ path: String) throws {
        let u = try guardPath(path)
        if [home, support, cache].contains(where: { $0.standardizedFileURL.path == u.path }) || roots.contains(u.path) { throw BridgeError("Menolak menghapus folder ini") }
        try FileManager.default.removeItem(at: u)
    }

    func move(_ from: String, _ to: String) throws {
        let a = try guardPath(from), b = try guardPath(to)
        guard !FileManager.default.fileExists(atPath: b.path) else { throw BridgeError("Tujuan sudah ada") }
        try FileManager.default.createDirectory(at: b.deletingLastPathComponent(), withIntermediateDirectories: true)
        try FileManager.default.moveItem(at: a, to: b)
    }

    /// Salin berkas dari pemilih dokumen / aplikasi lain ke Caches/<folder>/<waktu>/.
    func importFile(_ src: URL, folder: String) -> URL? {
        let scoped = src.startAccessingSecurityScopedResource()
        defer { if scoped { src.stopAccessingSecurityScopedResource() } }
        let dir = cache.appendingPathComponent(folder, isDirectory: true).appendingPathComponent(String(Int(Date().timeIntervalSince1970 * 1000)), isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var name = src.lastPathComponent.replacingOccurrences(of: "[\\\\/:*?\"<>|]", with: "_", options: .regularExpression)
        if name.isEmpty || name.hasPrefix(".") { name = "berkas" + name }
        let dst = dir.appendingPathComponent(name)
        do { try FileManager.default.copyItem(at: src, to: dst); return dst } catch { return nil }
    }
}

// MARK: - Keychain

/// API key, token Sinerli & token konektor: satu item Keychain (JSON), hanya di perangkat ini.
enum Keychain {
    private static let service = "com.sinerli.sinai.secrets"
    private static let account = "secrets"
    private static let lock = NSLock()
    private static var cache: [String: String]?

    static func get(_ key: String) -> String? { lock.lock(); defer { lock.unlock() }; return load()[key] }
    static func keys() -> [String] { lock.lock(); defer { lock.unlock() }; return Array(load().keys) }

    static func set(_ key: String, _ value: String?) throws {
        lock.lock(); defer { lock.unlock() }
        guard !key.isEmpty else { throw BridgeError("key wajib diisi") }
        var all = load()
        if let v = value, !v.isEmpty { all[key] = v } else { all.removeValue(forKey: key) }
        let data = try JSONSerialization.data(withJSONObject: all)
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        var status = SecItemUpdate(q as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var add = q
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly   // tidak ikut cadangan iCloud / pindah perangkat
            status = SecItemAdd(add as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw BridgeError("Gagal menyimpan ke Keychain (kode \(status))") }
        cache = all
    }

    private static func load() -> [String: String] {
        if let c = cache { return c }
        var item: CFTypeRef?
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
                                kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: [String: String] = [:]
        if SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let d = item as? Data, let o = try? JSONSerialization.jsonObject(with: d) as? [String: String] { out = o }
        cache = out
        return out
    }
}

// MARK: - HTTP (kontrak sama dengan Sources/HTTPClient.swift)

final class NativeHTTP: NSObject, URLSessionDataDelegate {
    var emit: ((String, [String: Any]) -> Void)?
    private final class State { let id: String; var status = 0; var isError = false; var buffer: [UInt8] = []; init(id: String) { self.id = id } }
    private let queue: OperationQueue = { let q = OperationQueue(); q.maxConcurrentOperationCount = 1; return q }()
    private var streamSession: URLSession!
    private let plain: URLSession
    private var states: [Int: State] = [:]
    private var tasks: [String: URLSessionTask] = [:]

    override init() {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 120
        plain = URLSession(configuration: c)
        super.init()
        let s = URLSessionConfiguration.ephemeral
        s.timeoutIntervalForRequest = 900
        s.timeoutIntervalForResource = 4 * 3600
        s.urlCache = nil
        streamSession = URLSession(configuration: s, delegate: self, delegateQueue: queue)
    }

    private func make(_ p: [String: Any]) throws -> URLRequest {
        guard let s = p["url"] as? String, let url = URL(string: s), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { throw BridgeError("URL tidak valid") }
        var r = URLRequest(url: url)
        r.httpMethod = (p["method"] as? String)?.uppercased() ?? "GET"
        for (k, v) in (p["headers"] as? [String: Any]) ?? [:] { r.setValue("\(v)", forHTTPHeaderField: k) }
        if r.value(forHTTPHeaderField: "User-Agent") == nil {
            r.setValue("Sinai/\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") (iOS)", forHTTPHeaderField: "User-Agent")
        }
        if let b = p["body"] as? String, r.httpMethod != "GET" { r.httpBody = Data(b.utf8) }
        if let t = p["timeout"] as? Double, t > 0 { r.timeoutInterval = t }
        return r
    }

    func request(_ p: [String: Any], done: @escaping (Result<[String: Any], Error>) -> Void) {
        let req: URLRequest
        do { req = try make(p) } catch { done(.failure(error)); return }
        let max = p["maxBytes"] as? Int ?? 8_000_000
        plain.dataTask(with: req) { data, resp, err in
            if let err = err { done(.failure(BridgeError(err.localizedDescription))); return }
            let h = resp as? HTTPURLResponse
            var headers: [String: String] = [:]
            for (k, v) in h?.allHeaderFields ?? [:] { headers["\(k)".lowercased()] = "\(v)" }
            var body = data ?? Data()
            let truncated = body.count > max
            if truncated { body = body.prefix(max) }
            var out: [String: Any] = ["status": h?.statusCode ?? 0, "headers": headers, "url": h?.url?.absoluteString ?? "", "truncated": truncated]
            if p["binary"] as? Bool == true { out["base64"] = body.base64EncodedString() } else { out["body"] = String(decoding: body, as: UTF8.self) }
            done(.success(out))
        }.resume()
    }

    func stream(id: String, params: [String: Any]) throws {
        let req = try make(params)
        queue.addOperation {
            let t = self.streamSession.dataTask(with: req)
            self.states[t.taskIdentifier] = State(id: id)
            self.tasks[id] = t
            t.resume()
        }
    }

    func abort(id: String) { queue.addOperation { self.tasks[id]?.cancel() } }

    func urlSession(_ s: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        if let st = states[dataTask.taskIdentifier], let h = response as? HTTPURLResponse {
            st.status = h.statusCode
            st.isError = h.statusCode >= 400
            var headers: [String: String] = [:]
            for (k, v) in h.allHeaderFields { headers["\(k)".lowercased()] = "\(v)" }
            emit?("http.head", ["id": st.id, "status": st.status, "headers": headers])
        }
        completionHandler(.allow)
    }

    func urlSession(_ s: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let st = states[dataTask.taskIdentifier] else { return }
        st.buffer.append(contentsOf: data)
        if st.isError { return }
        if let nl = st.buffer.lastIndex(of: 10) {
            let chunk = Array(st.buffer[0...nl])
            st.buffer.removeFirst(nl + 1)
            emit?("http.data", ["id": st.id, "data": String(decoding: chunk, as: UTF8.self)])
        }
    }

    func urlSession(_ s: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let st = states.removeValue(forKey: task.taskIdentifier) else { return }
        tasks[st.id] = nil
        if let e = error as NSError? {
            if e.code == NSURLErrorCancelled { emit?("http.done", ["id": st.id, "status": st.status, "aborted": true]) }
            else { emit?("http.fail", ["id": st.id, "error": e.localizedDescription, "code": e.code]) }
            return
        }
        let rest = String(decoding: st.buffer, as: UTF8.self)
        if st.isError { emit?("http.done", ["id": st.id, "status": st.status, "body": rest]) }
        else {
            if !rest.isEmpty { emit?("http.data", ["id": st.id, "data": rest]) }
            emit?("http.done", ["id": st.id, "status": st.status])
        }
    }
}

// MARK: - HTML → PDF / PNG

final class Renderer: NSObject, WKNavigationDelegate {
    private var web: WKWebView?
    private var job: (() -> Void)?

    func render(_ p: [String: Any], out: URL, in host: UIView, assets: AppAssets, done: @escaping (Result<String, Error>) -> Void) {
        guard web == nil else { done(.failure(BridgeError("Render lain sedang berjalan, coba lagi sebentar."))); return }
        let pdf = (p["format"] as? String ?? "pdf") != "png"
        let width = CGFloat((p["width"] as? NSNumber)?.doubleValue ?? 0)
        let cssW: CGFloat, cssH: CGFloat
        if width > 0 { cssW = width; cssH = CGFloat((p["pageHeight"] as? NSNumber)?.doubleValue ?? 720) }
        else {
            let letter = p["paper"] as? String == "letter", land = p["landscape"] as? Bool ?? false
            let w: CGFloat = letter ? 816 : 794, h: CGFloat = letter ? 1056 : 1123
            cssW = land ? h : w; cssH = land ? w : h
        }
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(PreviewScheme(assets: assets), forURLScheme: "sinai-preview")
        cfg.websiteDataStore = .nonPersistent()
        let w = WKWebView(frame: CGRect(x: -cssW - 4000, y: 0, width: cssW, height: cssH), configuration: cfg)
        w.isOpaque = true
        w.backgroundColor = .white
        w.navigationDelegate = self
        host.insertSubview(w, at: 0)
        web = w
        let finish: (Result<String, Error>) -> Void = { [weak self] r in
            w.removeFromSuperview()
            self?.web = nil
            self?.job = nil
            done(r)
        }
        job = {
            w.evaluateJavaScript("Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)") { h, _ in
                let contentH = max(cssH, CGFloat((h as? NSNumber)?.doubleValue ?? Double(cssH)))
                if pdf {
                    let cfg = WKPDFConfiguration()
                    w.frame.size.height = contentH
                    cfg.rect = CGRect(x: 0, y: 0, width: cssW, height: contentH)
                    w.createPDF(configuration: cfg) { r in
                        switch r {
                        case .success(let long):
                            do { try Renderer.paginate(long, pageW: cssW, pageH: cssH, maxPages: (p["pages"] as? Int) ?? 0).write(to: out, options: .atomic); finish(.success(out.path)) }
                            catch { finish(.failure(error)) }
                        case .failure(let e): finish(.failure(BridgeError("Gagal membuat PDF: " + e.localizedDescription)))
                        }
                    }
                } else {
                    let c = WKSnapshotConfiguration()
                    w.frame.size.height = min(contentH, 16000)
                    c.rect = CGRect(x: 0, y: 0, width: cssW, height: w.frame.height)
                    c.snapshotWidth = NSNumber(value: Double(cssW))
                    w.takeSnapshot(with: c) { img, err in
                        guard let png = img?.pngData() else { finish(.failure(BridgeError("Gagal membuat gambar: " + (err?.localizedDescription ?? "")))); return }
                        do { try png.write(to: out, options: .atomic); finish(.success(out.path)) } catch { finish(.failure(error)) }
                    }
                }
            }
        }
        try? FileManager.default.createDirectory(at: out.deletingLastPathComponent(), withIntermediateDirectories: true)
        w.loadHTMLString(p["html"] as? String ?? "", baseURL: URL(string: "sinai-preview://p/render"))
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in if self?.web === w, let j = self?.job { self?.job = nil; j() } }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Beri waktu font, gambar, Tailwind/Mermaid selesai.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { [weak self] in if let j = self?.job { self?.job = nil; j() } }
    }

    /// PDF satu halaman panjang → halaman berukuran tetap (A4/Letter/slide).
    static func paginate(_ data: Data, pageW: CGFloat, pageH: CGFloat, maxPages: Int) throws -> Data {
        guard let src = CGPDFDocument(CGDataProvider(data: data as CFData)!), let page = src.page(at: 1) else { throw BridgeError("PDF kosong") }
        let box = page.getBoxRect(.mediaBox)
        let scale = box.width / pageW
        var count = Int(ceil(box.height / (pageH * scale)))
        if maxPages > 0 { count = min(count, maxPages) }
        count = max(1, min(count, 400))
        let pw = pageW * 0.75, ph = pageH * 0.75
        let out = NSMutableData()
        var media = CGRect(x: 0, y: 0, width: pw, height: ph)
        guard let consumer = CGDataConsumer(data: out as CFMutableData), let ctx = CGContext(consumer: consumer, mediaBox: &media, nil) else { throw BridgeError("PDF gagal dibuat") }
        let k = pw / box.width
        for i in 0..<count {
            ctx.beginPDFPage(nil)
            ctx.saveGState()
            ctx.scaleBy(x: k, y: k)
            // PDF berorigin kiri-bawah: geser agar potongan ke-i berada di halaman.
            ctx.translateBy(x: 0, y: -(box.height - CGFloat(i + 1) * pageH * scale))
            ctx.drawPDFPage(page)
            ctx.restoreGState()
            ctx.endPDFPage()
        }
        ctx.closePDF()
        return out as Data
    }
}

// MARK: - Hak cipta

/// Data & algoritma sama dengan Sources/Brand.swift (terenkode + checksum).
enum Brand {
    private static let key: [UInt8] = [0x9e, 0x3b, 0xd4, 0x71, 0xc2, 0x58, 0xe7, 0x0d, 0xa6]
    private static let ownerBytes: [UInt8] = [0x36, 0x45, 0xfc, 0xce, 0xdf, 0x21, 0x04, 0xac, 0x80, 0x21, 0x6c, 0x9f, 0xff, 0x34, 0x08]
    private static let labelBytes: [UInt8] = [0xb3, 0x8d, 0xb8, 0xfd, 0xdf, 0x2b, 0x50, 0xb5, 0xce, 0x46, 0x75, 0xd3, 0xd4, 0x30, 0x0a, 0x23, 0x98, 0x39]
    private static let legalBytes: [UInt8] = [0x32, 0x4b, 0xe8, 0xc3, 0xcc, 0x26, 0x43, 0xbc, 0xd4, 0x46, 0xcf, 0x5a, 0xb3, 0x63, 0x56, 0x7d,
                                              0xcb, 0x77, 0x18, 0x17, 0xae, 0x18, 0x09, 0x73, 0x56, 0x72, 0x5e, 0x73, 0x3e, 0x49, 0x29, 0x66,
                                              0x5a, 0x4f, 0x33, 0x24, 0x41, 0x2c, 0x1c, 0x2c, 0x73, 0x44, 0xe0, 0x4c, 0x7f, 0x22, 0xdb, 0x72,
                                              0x44, 0x48, 0xa8, 0xc5, 0x24, 0x57, 0xd5]
    private static let ownerSum: UInt64 = 0x1f54753f972257b1
    private static let labelSum: UInt64 = 0xf5c6ff922a1a5e22
    private static let legalSum: UInt64 = 0x9cfe2daeca9cdcab

    private static func decode(_ b: [UInt8]) -> String {
        String(decoding: b.enumerated().map { $0.element ^ key[($0.offset * 7 + 3) % key.count] ^ UInt8(($0.offset * 31) & 0xff) }, as: UTF8.self)
    }
    private static func fnv1a(_ s: String) -> UInt64 {
        var h: UInt64 = 0xcbf29ce484222325
        for b in s.utf8 { h ^= UInt64(b); h = h &* 0x100000001b3 }
        return h
    }

    static let owner = decode(ownerBytes)
    static let label = decode(labelBytes)
    static let legal = decode(legalBytes)
    static var intact: Bool { fnv1a(owner) == ownerSum && fnv1a(label) == labelSum && fnv1a(legal) == legalSum && label.hasSuffix(owner) && legal.contains(owner) }
}
