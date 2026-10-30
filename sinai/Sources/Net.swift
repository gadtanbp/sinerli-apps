// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Foundation
import Network

/// Extra networking: multipart/large file uploads, a persistent cookie jar,
/// local dev-server detection, and outgoing WebSocket connections.
final class NetExtra: NSObject, URLSessionTaskDelegate {
    static let shared = NetExtra()
    var emit: ((String, [String: Any]) -> Void)?

    private let cookieStorage = HTTPCookieStorage.shared
    private lazy var uploadSession: URLSession = {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.httpCookieStorage = cookieStorage
        cfg.httpCookieAcceptPolicy = .always
        cfg.timeoutIntervalForRequest = 300
        cfg.timeoutIntervalForResource = 3600
        return URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
    }()
    private var sockets: [String: URLSessionWebSocketTask] = [:]
    private let lock = NSLock()

    // MARK: multipart / large upload

    /// Uploads files and fields as multipart/form-data, streaming from disk so
    /// large files do not load into memory. Reports progress events.
    func upload(_ p: [String: Any], id: String, done: @escaping (Result<[String: Any], Error>) -> Void) {
        guard let urlStr = p["url"] as? String, let url = URL(string: urlStr),
              ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
            done(.failure(BridgeError("URL tidak valid"))); return
        }
        let boundary = "SinaiBoundary\(UUID().uuidString)"
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("sinai-upload-\(UUID().uuidString).bin")
        guard FileManager.default.createFile(atPath: tmp.path, contents: nil) else { done(.failure(BridgeError("Gagal menyiapkan unggahan"))); return }
        do {
            let handle = try FileHandle(forWritingTo: tmp)
            defer { try? handle.close() }
            func write(_ s: String) { handle.write(Data(s.utf8)) }
            for (k, v) in (p["fields"] as? [String: Any] ?? [:]) {
                write("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(k)\"\r\n\r\n\(v)\r\n")
            }
            for f in (p["files"] as? [[String: Any]] ?? []) {
                let field = f["field"] as? String ?? "file"
                var filename = f["filename"] as? String ?? "file"
                let mime = f["mime"] as? String ?? "application/octet-stream"
                write("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(field)\"; filename=\"\(filename)\"\r\nContent-Type: \(mime)\r\n\r\n")
                if let path = f["path"] as? String {
                    let fileURL = URL(fileURLWithPath: Paths.expand(path))
                    filename = fileURL.lastPathComponent
                    let reader = try FileHandle(forReadingFrom: fileURL)
                    defer { try? reader.close() }
                    while case let chunk = reader.readData(ofLength: 1 << 20), !chunk.isEmpty { handle.write(chunk) }
                } else if let b64 = f["base64"] as? String, let d = Data(base64Encoded: b64) {
                    handle.write(d)
                }
                write("\r\n")
            }
            write("--\(boundary)--\r\n")
        } catch { try? FileManager.default.removeItem(at: tmp); done(.failure(error)); return }

        var req = URLRequest(url: url)
        req.httpMethod = (p["method"] as? String ?? "POST").uppercased()
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        for (k, v) in (p["headers"] as? [String: Any] ?? [:]) { req.setValue("\(v)", forHTTPHeaderField: k) }
        let task = uploadSession.uploadTask(with: req, fromFile: tmp) { data, response, error in
            try? FileManager.default.removeItem(at: tmp)
            if let e = error { done(.failure(e)); return }
            let http = response as? HTTPURLResponse
            var headers: [String: String] = [:]
            for (k, v) in http?.allHeaderFields ?? [:] { headers["\(k)".lowercased()] = "\(v)" }
            let body = data ?? Data()
            done(.success(["status": http?.statusCode ?? 0, "headers": headers,
                           "body": String(data: body.prefix(4_000_000), encoding: .utf8) ?? "", "size": body.count]))
        }
        task.taskDescription = id
        task.resume()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard let id = task.taskDescription else { return }
        emit?("upload.progress", ["id": id, "sent": totalBytesSent, "total": totalBytesExpectedToSend])
    }

    func cookies(_ p: [String: Any]) -> [String: Any] {
        if let urlStr = p["url"] as? String, let url = URL(string: urlStr) {
            let list = cookieStorage.cookies(for: url) ?? []
            return ["cookies": list.map { ["name": $0.name, "value": $0.value, "domain": $0.domain, "path": $0.path] }]
        }
        return ["count": cookieStorage.cookies?.count ?? 0]
    }

    func clearCookies() -> Bool {
        (cookieStorage.cookies ?? []).forEach { cookieStorage.deleteCookie($0) }
        return true
    }

    // MARK: dev-server detection

    /// Scans common local development ports and reports which are listening.
    func scanDevServers(_ p: [String: Any], done: @escaping ([String: Any]) -> Void) {
        let ports = (p["ports"] as? [Int]) ?? [3000, 3001, 4200, 5000, 5173, 5174, 8000, 8080, 8081, 8888, 9000, 4321, 1313, 3333, 19006, 24678, 11434, 1234]
        let group = DispatchGroup()
        let q = DispatchQueue(label: "sinai.portscan", attributes: .concurrent)
        var open: [Int] = []
        let olock = NSLock()
        for port in ports {
            group.enter()
            q.async {
                if self.isListening(host: "127.0.0.1", port: UInt16(port), timeout: 0.4) {
                    olock.lock(); open.append(port); olock.unlock()
                }
                group.leave()
            }
        }
        group.notify(queue: .main) {
            open.sort()
            // Probe HTTP title for each open port
            let out = open.map { port -> [String: Any] in ["port": port, "url": "http://localhost:\(port)"] }
            done(["servers": out])
        }
    }

    private func isListening(host: String, port: UInt16, timeout: TimeInterval) -> Bool {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return false }
        defer { close(fd) }
        var tv = timeval(tv_sec: Int(timeout), tv_usec: Int32((timeout - floor(timeout)) * 1_000_000))
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        inet_pton(AF_INET, host, &addr.sin_addr)
        let r = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        return r == 0
    }

    // MARK: outgoing WebSocket

    func wsConnect(_ p: [String: Any], id: String) throws {
        guard let urlStr = p["url"] as? String, let url = URL(string: urlStr),
              ["ws", "wss", "http", "https"].contains(url.scheme?.lowercased() ?? "") else {
            throw BridgeError("URL WebSocket tidak valid (gunakan ws:// atau wss://)")
        }
        var req = URLRequest(url: url)
        for (k, v) in (p["headers"] as? [String: Any] ?? [:]) { req.setValue("\(v)", forHTTPHeaderField: k) }
        let task = uploadSession.webSocketTask(with: req)
        lock.lock(); sockets[id] = task; lock.unlock()
        task.resume()
        receive(id: id, task: task)
        emit?("ws.open", ["id": id])
    }

    private func receive(id: String, task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure(let e):
                self.lock.lock(); let live = self.sockets[id] != nil; self.sockets[id] = nil; self.lock.unlock()
                if live { self.emit?("ws.close", ["id": id, "error": e.localizedDescription]) }
            case .success(let msg):
                switch msg {
                case .string(let s): self.emit?("ws.message", ["id": id, "text": s])
                case .data(let d): self.emit?("ws.message", ["id": id, "base64": d.base64EncodedString()])
                @unknown default: break
                }
                self.lock.lock(); let t = self.sockets[id]; self.lock.unlock()
                if let t = t { self.receive(id: id, task: t) }
            }
        }
    }

    func wsSend(id: String, text: String?, base64: String?, done: @escaping (Error?) -> Void) {
        lock.lock(); let task = sockets[id]; lock.unlock()
        guard let t = task else { done(BridgeError("WebSocket tidak terhubung")); return }
        let msg: URLSessionWebSocketTask.Message
        if let b = base64, let d = Data(base64Encoded: b) { msg = .data(d) } else { msg = .string(text ?? "") }
        t.send(msg) { done($0) }
    }

    func wsClose(id: String) {
        lock.lock(); let task = sockets.removeValue(forKey: id); lock.unlock()
        task?.cancel(with: .goingAway, reason: nil)
        emit?("ws.close", ["id": id])
    }

    func closeAll() {
        lock.lock(); let all = Array(sockets.values); sockets.removeAll(); lock.unlock()
        all.forEach { $0.cancel(with: .goingAway, reason: nil) }
    }
}
