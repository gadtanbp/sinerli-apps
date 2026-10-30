// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Cocoa
import WebKit
import PDFKit

/// In-memory documents for the artifact canvas. They are served from the
/// separate `sinai-preview://` scheme into sandboxed iframes, so artifact code
/// never shares an origin with the app and cannot reach the native bridge.
enum PreviewStore {
    private static var docs: [String: String] = [:]
    private static var order: [String] = []
    private static let lock = NSLock()

    static func put(_ key: String, _ html: String) {
        lock.lock(); defer { lock.unlock() }
        if docs[key] == nil { order.append(key) }
        docs[key] = html
        while order.count > 80 { docs.removeValue(forKey: order.removeFirst()) }
    }

    static func get(_ key: String) -> String? {
        lock.lock(); defer { lock.unlock() }
        return docs[key]
    }

    /// Files the page asked to show (generated outputs). Only registered paths
    /// are served, under random keys, so nothing else on disk is reachable.
    private static var files: [String: String] = [:]

    static func putFile(_ path: String) -> String {
        lock.lock(); defer { lock.unlock() }
        if let k = files.first(where: { $0.value == path })?.key { return k }
        let k = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        files[k] = path
        return k
    }

    static func file(_ key: String) -> String? {
        lock.lock(); defer { lock.unlock() }
        return files[key]
    }

    /// Project folders opened in the Sinai browser (live view). Only files
    /// inside a registered root are served, under `sinai-preview://site/<key>/`.
    private static var sites: [String: String] = [:]

    static func putSite(_ root: String) -> String {
        lock.lock(); defer { lock.unlock() }
        if let k = sites.first(where: { $0.value == root })?.key { return k }
        let k = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased().prefix(16)
        sites[String(k)] = root
        return String(k)
    }

    static func site(_ key: String) -> String? {
        lock.lock(); defer { lock.unlock() }
        return sites[key]
    }
}

/// Script injected into HTML pages of the live view: forwards console output,
/// errors and navigation to the Sinai browser panel (postMessage to parent).
let kSiteBridge = "<script>(function(){if(window.__gxSite)return;window.__gxSite=1;function s(m){try{m.__gxSite=1;parent.postMessage(m,'*')}catch(e){}}" +
    "['log','info','warn','error'].forEach(function(l){var o=console[l];console[l]=function(){try{s({type:'console',level:l,text:[].map.call(arguments,function(a){try{return typeof a==='object'?JSON.stringify(a):String(a)}catch(e){return String(a)}}).join(' ').slice(0,2000)})}catch(e){}return o.apply(console,arguments)}});" +
    "addEventListener('error',function(e){s({type:'console',level:'error',text:String(e.message||e)+(e.filename?' ('+e.filename.split('/').pop()+':'+e.lineno+')':'')})});" +
    "addEventListener('unhandledrejection',function(e){var r=e.reason;s({type:'console',level:'error',text:'Unhandled: '+(r&&r.message||r)})});" +
    "addEventListener('load',function(){s({type:'nav',url:location.href,title:document.title})});})();</script>"

final class PreviewSchemeHandler: NSObject, WKURLSchemeHandler {
    private let libRoot: URL

    override init() {
        var r = Bundle.main.resourceURL!.appendingPathComponent("web/preview-lib", isDirectory: true)
        #if DEBUG
        if let dev = ProcessInfo.processInfo.environment["SINAI_WEB_ROOT"] {
            r = URL(fileURLWithPath: dev, isDirectory: true).appendingPathComponent("preview-lib", isDirectory: true)
        }
        #endif
        libRoot = r
        super.init()
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let parts = url.path.split(separator: "/").map(String.init)
        var data: Data? = nil
        var mime = "text/html; charset=utf-8"
        if url.host == "file", let key = parts.first, let path = PreviewStore.file(key) {
            serveFile(task, url: url, path: path)
            return
        }
        if url.host == "site", let key = parts.first, let root = PreviewStore.site(key) {
            serveSite(task, url: url, root: root, rel: Array(parts.dropFirst()))
            return
        }
        if url.host == "p", let key = parts.first, let html = PreviewStore.get(key) {
            data = Data(html.utf8)
        } else if url.host == "lib", !parts.isEmpty, !parts.contains(".."), !parts.contains(".") {
            data = try? Data(contentsOf: libRoot.appendingPathComponent(parts.joined(separator: "/")))
            mime = url.pathExtension == "css" ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8"
        }
        guard let body = data else {
            task.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
            return
        }
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": mime, "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*",
        ])!
        task.didReceive(resp)
        task.didReceive(body)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    /// Static file server for a project folder (live view). Directories serve
    /// index.html; HTML gets the console bridge so errors show in Sinai.
    private func serveSite(_ task: WKURLSchemeTask, url: URL, root: String, rel: [String]) {
        if rel.contains("..") {
            task.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorNoPermissionsToReadFile)); return
        }
        let base = URL(fileURLWithPath: root, isDirectory: true).standardizedFileURL
        var target = rel.reduce(base) { $0.appendingPathComponent($1) }.standardizedFileURL
        guard target.path == base.path || target.path.hasPrefix(base.path + "/") else {
            task.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorNoPermissionsToReadFile)); return
        }
        var isDir: ObjCBool = false
        if FileManager.default.fileExists(atPath: target.path, isDirectory: &isDir), isDir.boolValue {
            target = target.appendingPathComponent("index.html")
        } else if !FileManager.default.fileExists(atPath: target.path), target.pathExtension.isEmpty,
                  FileManager.default.fileExists(atPath: target.path + ".html") {
            target = URL(fileURLWithPath: target.path + ".html")
        }
        let ext = target.pathExtension.lowercased()
        if ext == "html" || ext == "htm" {
            guard let data = FileManager.default.contents(atPath: target.path) else {
                let msg = "<!doctype html><meta charset=utf-8><body style='font:14px -apple-system;padding:40px;color:#555'><h3>404 — tidak ditemukan</h3><code>/\(rel.joined(separator: "/"))</code>" + kSiteBridge
                let resp = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"])!
                task.didReceive(resp); task.didReceive(Data(msg.utf8)); task.didFinish(); return
            }
            var html = String(decoding: data, as: UTF8.self)
            if let r = html.range(of: "<head[^>]*>", options: [.regularExpression, .caseInsensitive]) {
                html.insert(contentsOf: kSiteBridge, at: r.upperBound)
            } else { html = kSiteBridge + html }
            let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
                "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"])!
            task.didReceive(resp); task.didReceive(Data(html.utf8)); task.didFinish()
            return
        }
        serveFile(task, url: url, path: target.path)
    }

    static func mimeType(_ ext: String) -> String {
        [
            "pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif",
            "svg": "image/svg+xml", "webp": "image/webp", "heic": "image/heic", "mp4": "video/mp4", "m4v": "video/mp4",
            "mov": "video/quicktime", "m4a": "audio/mp4", "mp3": "audio/mpeg", "wav": "audio/wav", "html": "text/html; charset=utf-8",
            "txt": "text/plain; charset=utf-8", "csv": "text/csv; charset=utf-8", "md": "text/plain; charset=utf-8",
            "htm": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8",
            "css": "text/css; charset=utf-8", "json": "application/json; charset=utf-8", "wasm": "application/wasm",
            "woff": "font/woff", "woff2": "font/woff2", "ttf": "font/ttf", "otf": "font/otf", "ico": "image/x-icon", "avif": "image/avif",
            "webm": "video/webm", "ogg": "audio/ogg", "glb": "model/gltf-binary", "gltf": "model/gltf+json", "obj": "text/plain; charset=utf-8",
            "stl": "model/stl", "ply": "application/octet-stream", "fbx": "application/octet-stream", "xml": "application/xml; charset=utf-8",
        ][ext.lowercased()] ?? "application/octet-stream"
    }

    /// Serves a registered file, honouring Range requests so <video> can seek.
    private func serveFile(_ task: WKURLSchemeTask, url: URL, path: String) {
        guard let fh = FileHandle(forReadingAtPath: path),
              let attrs = try? FileManager.default.attributesOfItem(atPath: path),
              let size = (attrs[.size] as? NSNumber)?.int64Value else {
            task.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
            return
        }
        defer { fh.closeFile() }
        let mime = PreviewSchemeHandler.mimeType((path as NSString).pathExtension)
        var start: Int64 = 0, end: Int64 = size - 1, partial = false
        if let range = task.request.value(forHTTPHeaderField: "Range"), range.hasPrefix("bytes=") {
            let spec = range.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
            if spec.count == 2 {
                if let a = Int64(spec[0]) { start = a; if let b = Int64(spec[1]) { end = min(b, size - 1) } }
                else if let b = Int64(spec[1]) { start = max(0, size - b) }
                partial = true
            }
        }
        if size == 0 { start = 0; end = -1 }
        guard start <= end + 1 else {
            task.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorBadServerResponse)); return
        }
        let length = end - start + 1
        var headers = ["Content-Type": mime, "Accept-Ranges": "bytes", "Content-Length": String(length), "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"]
        if partial { headers["Content-Range"] = "bytes \(start)-\(end)/\(size)" }
        let resp = HTTPURLResponse(url: url, statusCode: partial ? 206 : 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(resp)
        fh.seek(toFileOffset: UInt64(start))
        var remaining = length
        while remaining > 0 {
            let chunk = fh.readData(ofLength: Int(min(remaining, 1 << 20)))
            if chunk.isEmpty { break }
            task.didReceive(chunk)
            remaining -= Int64(chunk.count)
        }
        task.didFinish()
    }

    static func configuration() -> WKWebViewConfiguration {
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(PreviewSchemeHandler(), forURLScheme: "sinai-preview")
        cfg.websiteDataStore = .nonPersistent()
        return cfg
    }
}

/// Renders a stored preview off-screen and saves it as PNG or PDF.
final class PreviewExporter: NSObject, WKNavigationDelegate {
    private static var active: [PreviewExporter] = []
    private let window: NSWindow
    private let webView: WKWebView
    private let format: String
    private let name: String
    private let pageHeight: CGFloat
    private let pages: Int
    private weak var parent: NSWindow?
    private let done: (Result<String?, Error>) -> Void

    init(key: String, format: String, width: CGFloat, pageHeight: CGFloat, pages: Int, name: String,
         parent: NSWindow?, done: @escaping (Result<String?, Error>) -> Void) {
        self.format = format
        self.name = name
        self.pageHeight = pageHeight
        self.pages = pages
        self.parent = parent
        self.done = done
        window = NSWindow(contentRect: NSRect(x: -30000, y: -30000, width: width, height: max(pageHeight, 800)),
                          styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: max(pageHeight, 800)), configuration: PreviewSchemeHandler.configuration())
        super.init()
        window.contentView = webView
        window.orderBack(nil)
        webView.navigationDelegate = self
        webView.load(URLRequest(url: URL(string: "sinai-preview://p/\(key)")!))
        PreviewExporter.active.append(self)
    }

    private func finish(_ r: Result<String?, Error>) {
        window.orderOut(nil)
        PreviewExporter.active.removeAll { $0 === self }
        done(r)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(.failure(error)) }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // give scripts (React, Tailwind, Mermaid) time to render
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            webView.evaluateJavaScript("(function(){var b=document.body;var h=b?Math.max(b.scrollHeight,Math.ceil(b.getBoundingClientRect().bottom)):0;return h||document.documentElement.scrollHeight})()") { v, _ in
                let h = min(CGFloat((v as? NSNumber)?.doubleValue ?? 800), 30000)
                let total = self.pages > 0 ? self.pageHeight * CGFloat(self.pages) : max(h, 200)
                var f = self.window.frame
                f.size.height = total
                self.window.setFrame(f, display: true)
                self.webView.frame = NSRect(x: 0, y: 0, width: f.width, height: total)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.capture(total: total) }
            }
        }
    }

    private func capture(total: CGFloat) {
        let width = webView.frame.width
        let rects: [NSRect] = pages > 0
            ? (0..<pages).map { NSRect(x: 0, y: CGFloat($0) * pageHeight, width: width, height: pageHeight) }
            : [NSRect(x: 0, y: 0, width: width, height: total)]
        if format == "png" {
            let cfg = WKSnapshotConfiguration()
            cfg.rect = rects.count == 1 ? rects[0] : NSRect(x: 0, y: 0, width: width, height: total)
            webView.takeSnapshot(with: cfg) { img, err in
                guard let img = img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
                      let png = rep.representation(using: .png, properties: [:]) else {
                    self.finish(.failure(err ?? BridgeError("Gagal membuat gambar"))); return
                }
                self.save(png, ext: "png")
            }
            return
        }
        let doc = PDFDocument()
        func next(_ i: Int) {
            guard i < rects.count else {
                guard let data = doc.dataRepresentation() else { finish(.failure(BridgeError("Gagal membuat PDF"))); return }
                save(data, ext: "pdf")
                return
            }
            let add: (PDFDocument?) -> Void = { part in
                if let part = part { for p in 0..<part.pageCount { if let pg = part.page(at: p) { doc.insert(pg, at: doc.pageCount) } } }
                next(i + 1)
            }
            if #available(macOS 11.0, *) {
                let cfg = WKPDFConfiguration()
                cfg.rect = rects[i]
                webView.createPDF(configuration: cfg) { res in
                    if case .success(let d) = res { add(PDFDocument(data: d)) } else { add(nil) }
                }
            } else {
                let cfg = WKSnapshotConfiguration()
                cfg.rect = rects[i]
                webView.takeSnapshot(with: cfg) { img, _ in
                    let d = PDFDocument()
                    if let img = img, let page = PDFPage(image: img) { d.insert(page, at: 0) }
                    add(d)
                }
            }
        }
        next(0)
    }

    var debugSavePath: String?

    /// When set, the result is written here (no Save panel). Used for files the
    /// AI generates into the Sinai output folder.
    var outPath: String?

    private func save(_ data: Data, ext: String) {
        if let raw = outPath {
            let p = Paths.expand(raw)
            do {
                try FileOps.guardWritable(p)
                try FileManager.default.createDirectory(at: URL(fileURLWithPath: p).deletingLastPathComponent(), withIntermediateDirectories: true)
                try data.write(to: URL(fileURLWithPath: p), options: .atomic)
                finish(.success(p))
            } catch { finish(.failure(error)) }
            return
        }
        if let p = debugSavePath {
            do { try data.write(to: URL(fileURLWithPath: p)); finish(.success(p)) } catch { finish(.failure(error)) }
            return
        }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = name + "." + ext
        panel.canCreateDirectories = true
        let handler: (NSApplication.ModalResponse) -> Void = { r in
            guard r == .OK, let url = panel.url else { self.finish(.success(nil)); return }
            do { try data.write(to: url); self.finish(.success(url.path)) } catch { self.finish(.failure(error)) }
        }
        if let w = parent { panel.beginSheetModal(for: w, completionHandler: handler) } else { panel.begin(completionHandler: handler) }
    }
}
