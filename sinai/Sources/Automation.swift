// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Cocoa
import UserNotifications
import Network

/// User notifications for finished work and reminders. Falls back to a bezel
/// NSUserNotification-style alert only when the modern API is unavailable.
enum Notifier {
    private static var authed = false
    private static var asked = false

    static func request() {
        guard !asked else { return }
        asked = true
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { ok, _ in authed = ok }
    }

    static func notify(_ p: [String: Any]) -> Bool {
        request()
        let content = UNMutableNotificationContent()
        content.title = p["title"] as? String ?? "Sinai"
        if let b = p["body"] as? String { content.body = b }
        content.sound = (p["sound"] as? Bool) == false ? nil : .default
        let req = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
        return true
    }
}

/// Watches folders and reports files added/changed, so the agent (or the user)
/// can act on new files automatically. Fired events are debounced.
final class WatchFolders {
    static let shared = WatchFolders()
    var emit: ((String, [String: Any]) -> Void)?

    private final class Watch {
        let id: String
        let path: String
        var stream: FSEventStreamRef?
        var known: Set<String>
        init(id: String, path: String, known: Set<String>) { self.id = id; self.path = path; self.known = known }
    }
    private var watches: [String: Watch] = [:]
    private let lock = NSLock()

    func start(id: String, path: String) throws {
        let expanded = Paths.expand(path)
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: expanded, isDirectory: &isDir), isDir.boolValue else {
            throw BridgeError("Folder tidak ditemukan: \(expanded)")
        }
        stop(id: id)
        let known = Set((try? FileManager.default.contentsOfDirectory(atPath: expanded)) ?? [])
        let watch = Watch(id: id, path: expanded, known: known)
        var ctx = FSEventStreamContext(version: 0, info: Unmanaged.passUnretained(self).toOpaque(), retain: nil, release: nil, copyDescription: nil)
        let callback: FSEventStreamCallback = { _, info, count, _, _, _ in
            guard let info = info else { return }
            let me = Unmanaged<WatchFolders>.fromOpaque(info).takeUnretainedValue()
            me.rescanAll()
        }
        guard let stream = FSEventStreamCreate(kCFAllocatorDefault, callback, &ctx, [expanded] as CFArray,
                                               FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 0.8,
                                               UInt32(kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagNoDefer)) else {
            throw BridgeError("Tidak bisa memantau folder ini")
        }
        watch.stream = stream
        FSEventStreamSetDispatchQueue(stream, DispatchQueue.main)
        FSEventStreamStart(stream)
        lock.lock(); watches[id] = watch; lock.unlock()
    }

    private func rescanAll() {
        lock.lock(); let all = Array(watches.values); lock.unlock()
        for w in all {
            let now = Set((try? FileManager.default.contentsOfDirectory(atPath: w.path)) ?? [])
            let added = now.subtracting(w.known).filter { !$0.hasPrefix(".") }
            w.known = now
            for name in added.sorted() {
                emit?("watch.file", ["id": w.id, "path": (w.path as NSString).appendingPathComponent(name), "name": name])
            }
        }
    }

    func stop(id: String) {
        lock.lock(); let w = watches.removeValue(forKey: id); lock.unlock()
        if let s = w?.stream { FSEventStreamStop(s); FSEventStreamInvalidate(s); FSEventStreamRelease(s) }
    }

    func stopAll() {
        lock.lock(); let ids = Array(watches.keys); lock.unlock()
        ids.forEach { stop(id: $0) }
    }
}

/// A webhook receiver bound to 127.0.0.1 only. External services cannot reach
/// it; it is meant for local tools and scripts to poke Sinai. Each request body
/// is delivered to the page as an event. A shared secret header is required.
final class WebhookServer {
    static let shared = WebhookServer()
    var emit: ((String, [String: Any]) -> Void)?
    private var listener: NWListener?
    private(set) var port: UInt16 = 0
    private var secret = ""

    func start(port requested: UInt16, secret: String) throws -> UInt16 {
        stop()
        guard !secret.isEmpty else { throw BridgeError("Webhook memerlukan secret (token) agar aman") }
        self.secret = secret
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: requested) ?? .any)
        params.allowLocalEndpointReuse = true
        let l = try NWListener(using: params)
        listener = l
        l.newConnectionHandler = { [weak self] c in self?.accept(c) }
        l.stateUpdateHandler = { [weak self] st in
            if case .ready = st, let p = l.port { self?.port = p.rawValue; self?.emit?("webhook.ready", ["port": Int(p.rawValue)]) }
        }
        l.start(queue: .main)
        return requested
    }

    private func accept(_ c: NWConnection) {
        c.start(queue: .main)
        receive(c, Data())
    }

    private func receive(_ c: NWConnection, _ acc: Data) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] data, _, done, err in
            guard let self = self else { return }
            var buf = acc
            if let d = data { buf.append(d) }
            if let range = buf.range(of: Data("\r\n\r\n".utf8)) {
                let head = String(decoding: buf[..<range.lowerBound], as: UTF8.self)
                let lines = head.components(separatedBy: "\r\n")
                let reqLine = (lines.first ?? "").split(separator: " ")
                var length = 0, token = "", path = reqLine.count > 1 ? String(reqLine[1]) : "/"
                for l in lines {
                    let low = l.lowercased()
                    if low.hasPrefix("content-length:") { length = Int(l.split(separator: ":")[1].trimmingCharacters(in: .whitespaces)) ?? 0 }
                    if low.hasPrefix("x-sinai-token:") { token = l.split(separator: ":", maxSplits: 1)[1].trimmingCharacters(in: .whitespaces) }
                }
                let body = buf[range.upperBound...]
                if body.count >= length {
                    let ok = !self.secret.isEmpty && token == self.secret
                    if ok {
                        self.emit?("webhook.hit", ["path": path, "body": String(decoding: body.prefix(length), as: UTF8.self)])
                    }
                    let status = ok ? "200 OK" : "401 Unauthorized"
                    let payload = ok ? "{\"ok\":true}" : "{\"ok\":false}"
                    let resp = "HTTP/1.1 \(status)\r\nContent-Type: application/json\r\nContent-Length: \(payload.utf8.count)\r\nConnection: close\r\n\r\n\(payload)"
                    c.send(content: Data(resp.utf8), completion: .contentProcessed { _ in c.cancel() })
                    return
                }
            }
            if done || err != nil { c.cancel(); return }
            self.receive(c, buf)
        }
    }

    func stop() {
        listener?.cancel()
        listener = nil
        port = 0
    }
}

/// OAuth redirect receiver for one-click connectors (RFC 8252 loopback
/// redirect). Bound to 127.0.0.1 only; each GET is handed to the page, which
/// accepts it only when its `state` matches a flow it started.
final class OAuthLoopback {
    static let shared = OAuthLoopback()
    var emit: ((String, [String: Any]) -> Void)?
    private var listener: NWListener?
    private(set) var port: UInt16 = 0
    private var waiting: [(Result<Int, Error>) -> Void] = []

    func start(port requested: UInt16, done: @escaping (Result<Int, Error>) -> Void) {
        if listener != nil, port != 0 { done(.success(Int(port))); return }
        waiting.append(done)
        if listener != nil { return }
        do {
            let params = NWParameters.tcp
            params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: requested) ?? .any)
            params.allowLocalEndpointReuse = true
            let l = try NWListener(using: params)
            listener = l
            l.newConnectionHandler = { [weak self] c in self?.accept(c) }
            l.stateUpdateHandler = { [weak self] st in
                guard let self = self else { return }
                switch st {
                case .ready:
                    self.port = l.port?.rawValue ?? 0
                    self.finish(.success(Int(self.port)))
                case .failed(let e):
                    self.listener = nil; self.port = 0
                    self.finish(.failure(BridgeError("Port login lokal tidak bisa dibuka: \(e.localizedDescription)")))
                default: break
                }
            }
            l.start(queue: .main)
        } catch {
            listener = nil
            finish(.failure(error))
        }
    }

    private func finish(_ r: Result<Int, Error>) {
        let list = waiting
        waiting = []
        list.forEach { $0(r) }
    }

    private func accept(_ c: NWConnection) {
        c.start(queue: .main)
        c.receive(minimumIncompleteLength: 1, maximumLength: 1 << 16) { [weak self] data, _, _, _ in
            let head = String(decoding: data ?? Data(), as: UTF8.self)
            let parts = (head.components(separatedBy: "\r\n").first ?? "").split(separator: " ")
            let target = parts.count > 1 ? String(parts[1]) : "/"
            let isCallback = target.hasPrefix("/callback")
            if isCallback { self?.emit?("oauth.callback", ["url": "http://127.0.0.1" + target]) }
            let html = isCallback
                ? "<!doctype html><meta charset=utf-8><title>Sinai</title><body style=\"font:16px -apple-system,Segoe UI,sans-serif;display:grid;place-items:center;height:90vh;color:#1b1c2b\"><div style=\"text-align:center\"><div style=\"font-size:44px\">✓</div><h2>Terhubung ke Sinai</h2><p>Anda boleh menutup tab ini dan kembali ke aplikasi.</p></div><script>setTimeout(function(){window.close()},1200)</script>"
                : "Not found"
            let resp = "HTTP/1.1 \(isCallback ? "200 OK" : "404 Not Found")\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: \(html.utf8.count)\r\nConnection: close\r\n\r\n\(html)"
            c.send(content: Data(resp.utf8), completion: .contentProcessed { _ in c.cancel() })
        }
    }
}

/// Backup: zips the whole Application Support/Sinai folder (conversations,
/// settings, projects — not the Keychain) so the user can keep or restore it.
enum Backup {
    static func create(_ p: [String: Any], parent: NSWindow?, done: @escaping (Result<String?, Error>) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let root = Paths.support
                var entries: [(String, Data)] = []
                if let en = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles]) {
                    let base = root.path
                    for case let f as URL in en {
                        guard (try? f.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true else { continue }
                        let rel = f.path.hasPrefix(base + "/") ? String(f.path.dropFirst(base.count + 1)) : f.lastPathComponent
                        if rel.hasPrefix("backup-") { continue }
                        if let d = try? Data(contentsOf: f) { entries.append((rel, d)) }
                    }
                }
                let data = try Zip.create(files: entries)
                let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
                DispatchQueue.main.async {
                    Exports.deliver(data, suggestedName: "Sinai-backup-\(f.string(from: Date())).zip", savePath: p["savePath"] as? String, parent: parent, done: done)
                }
            } catch { DispatchQueue.main.async { done(.failure(error)) } }
        }
    }
}
