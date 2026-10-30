// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Foundation

/// HTTP for the web layer. Requests go through URLSession so the page is never
/// subject to CORS, and streaming bodies are delivered line-aligned (SSE friendly).
final class HTTPClient: NSObject, URLSessionDataDelegate {
    var emit: ((String, [String: Any]) -> Void)?

    private final class StreamState {
        let id: String
        var status = 0
        var isError = false
        var buffer: [UInt8] = []
        init(id: String) { self.id = id }
    }

    private let queue: OperationQueue = {
        let q = OperationQueue()
        q.maxConcurrentOperationCount = 1
        q.name = "sinai.http"
        return q
    }()
    private var streamSession: URLSession!
    private let plainSession: URLSession
    private var states: [Int: StreamState] = [:]
    private var tasksById: [String: URLSessionTask] = [:]

    override init() {
        let plain = URLSessionConfiguration.ephemeral
        plain.timeoutIntervalForRequest = 120
        plain.timeoutIntervalForResource = 600
        plainSession = URLSession(configuration: plain)
        super.init()
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 900       // reasoning models can be silent for a long time
        cfg.timeoutIntervalForResource = 4 * 3600
        cfg.urlCache = nil
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        streamSession = URLSession(configuration: cfg, delegate: self, delegateQueue: queue)
    }

    private func makeRequest(_ p: [String: Any]) throws -> URLRequest {
        guard let s = p["url"] as? String, let url = URL(string: s),
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else {
            throw BridgeError("URL tidak valid")
        }
        var req = URLRequest(url: url)
        req.httpMethod = (p["method"] as? String)?.uppercased() ?? "GET"
        if let headers = p["headers"] as? [String: Any] {
            for (k, v) in headers { req.setValue("\(v)", forHTTPHeaderField: k) }
        }
        if req.value(forHTTPHeaderField: "User-Agent") == nil {
            req.setValue("Sinai/1.0 (Macintosh)", forHTTPHeaderField: "User-Agent")
        }
        if let body = p["body"] as? String { req.httpBody = body.data(using: .utf8) }
        if let t = p["timeout"] as? Double, t > 0 { req.timeoutInterval = t }
        return req
    }

    // MARK: Streaming

    func stream(id: String, params: [String: Any]) throws {
        let req = try makeRequest(params)
        queue.addOperation {
            let task = self.streamSession.dataTask(with: req)
            self.states[task.taskIdentifier] = StreamState(id: id)
            self.tasksById[id] = task
            task.resume()
        }
    }

    func abort(id: String) {
        queue.addOperation { self.tasksById[id]?.cancel() }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        if let st = states[dataTask.taskIdentifier], let http = response as? HTTPURLResponse {
            st.status = http.statusCode
            st.isError = http.statusCode >= 400
            var headers: [String: String] = [:]
            for (k, v) in http.allHeaderFields { headers["\(k)".lowercased()] = "\(v)" }
            emit?("http.head", ["id": st.id, "status": st.status, "headers": headers])
        }
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let st = states[dataTask.taskIdentifier] else { return }
        st.buffer.append(contentsOf: data)
        if st.isError { return }
        if let nl = st.buffer.lastIndex(of: 10) {
            let chunk = Array(st.buffer[0...nl])
            st.buffer.removeFirst(nl + 1)
            emit?("http.data", ["id": st.id, "data": String(decoding: chunk, as: UTF8.self)])
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let st = states.removeValue(forKey: task.taskIdentifier) else { return }
        tasksById[st.id] = nil
        if let e = error as NSError? {
            if e.code == NSURLErrorCancelled {
                emit?("http.done", ["id": st.id, "status": st.status, "aborted": true])
            } else {
                emit?("http.fail", ["id": st.id, "error": e.localizedDescription, "code": e.code])
            }
            return
        }
        let rest = String(decoding: st.buffer, as: UTF8.self)
        if st.isError {
            emit?("http.done", ["id": st.id, "status": st.status, "body": rest])
        } else {
            if !rest.isEmpty { emit?("http.data", ["id": st.id, "data": rest]) }
            emit?("http.done", ["id": st.id, "status": st.status])
        }
    }

    // MARK: One-shot

    func request(_ params: [String: Any], completion: @escaping (Result<[String: Any], Error>) -> Void) {
        let req: URLRequest
        do { req = try makeRequest(params) } catch { completion(.failure(error)); return }
        let wantBase64 = (params["binary"] as? Bool) ?? false
        let maxBytes = (params["maxBytes"] as? Int) ?? 8_000_000
        plainSession.dataTask(with: req) { data, response, error in
            if let error = error { completion(.failure(error)); return }
            let http = response as? HTTPURLResponse
            var headers: [String: String] = [:]
            for (k, v) in http?.allHeaderFields ?? [:] { headers["\(k)".lowercased()] = "\(v)" }
            var body = data ?? Data()
            let truncated = body.count > maxBytes
            if truncated { body = body.prefix(maxBytes) }
            var out: [String: Any] = [
                "status": http?.statusCode ?? 0,
                "headers": headers,
                "url": http?.url?.absoluteString ?? req.url?.absoluteString ?? "",
                "truncated": truncated,
            ]
            if wantBase64 {
                out["base64"] = body.base64EncodedString()
            } else {
                var text: String? = nil
                if let name = response?.textEncodingName {
                    let cf = CFStringConvertIANACharSetNameToEncoding(name as CFString)
                    if cf != kCFStringEncodingInvalidId {
                        text = String(data: body, encoding: String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(cf)))
                    }
                }
                out["body"] = text ?? String(data: body, encoding: .utf8) ?? String(decoding: body, as: UTF8.self)
            }
            completion(.success(out))
        }.resume()
    }
}
