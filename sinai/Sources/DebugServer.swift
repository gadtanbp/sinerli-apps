// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
#if DEBUG
import Cocoa
import Network
import WebKit

/// Development-only automation endpoint (compiled out of release builds).
/// Enabled with SINAI_DEBUG_PORT; listens on 127.0.0.1 only.
///   POST /eval      body = async JS function body, returns JSON result
///   GET  /snapshot  PNG of the web view
final class DebugServer {
    private static var instance: DebugServer?
    private let listener: NWListener
    private weak var controller: MainWindowController?

    static func startIfRequested(controller: MainWindowController) {
        guard let s = ProcessInfo.processInfo.environment["SINAI_DEBUG_PORT"], let port = NWEndpoint.Port(s) else { return }
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: port)
        params.allowLocalEndpointReuse = true
        guard let l = try? NWListener(using: params) else { NSLog("Sinai debug server failed"); return }
        let srv = DebugServer(listener: l, controller: controller)
        instance = srv
        l.newConnectionHandler = { [weak srv] c in srv?.accept(c) }
        l.start(queue: .main)
        NSLog("Sinai debug server on 127.0.0.1:%@", s)
    }

    private init(listener: NWListener, controller: MainWindowController) {
        self.listener = listener
        self.controller = controller
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
                let parts = (lines.first ?? "").split(separator: " ")
                var length = 0
                for l in lines where l.lowercased().hasPrefix("content-length:") {
                    length = Int(l.split(separator: ":")[1].trimmingCharacters(in: .whitespaces)) ?? 0
                }
                let body = buf[range.upperBound...]
                if body.count >= length {
                    self.route(c, method: parts.count > 0 ? String(parts[0]) : "GET",
                               path: parts.count > 1 ? String(parts[1]) : "/",
                               body: String(decoding: body.prefix(length), as: UTF8.self))
                    return
                }
            }
            if done || err != nil { c.cancel(); return }
            self.receive(c, buf)
        }
    }

    private func reply(_ c: NWConnection, _ status: Int, _ type: String, _ body: Data) {
        var head = "HTTP/1.1 \(status) OK\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n"
        if status != 200 { head = head.replacingOccurrences(of: " OK", with: " ERR") }
        var out = Data(head.utf8)
        out.append(body)
        c.send(content: out, completion: .contentProcessed { _ in c.cancel() })
    }

    private func route(_ c: NWConnection, method: String, path: String, body: String) {
        guard let wv = controller?.webView else { reply(c, 500, "text/plain", Data("no webview".utf8)); return }
        switch path {
        case "/eval":
            if #available(macOS 11.0, *) {
                wv.callAsyncJavaScript(body, arguments: [:], in: nil, in: .page) { result in
                    switch result {
                    case .success(let v): self.reply(c, 200, "application/json", Data(JSONBridge.wrap(v).utf8))
                    case .failure(let e): self.reply(c, 500, "text/plain", Data("\(e)".utf8))
                    }
                }
            } else {
                reply(c, 500, "text/plain", Data("needs macOS 11".utf8))
            }
        case "/snapshot":
            wv.takeSnapshot(with: nil) { img, _ in
                guard let img = img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
                      let png = rep.representation(using: .png, properties: [:]) else {
                    self.reply(c, 500, "text/plain", Data("snapshot failed".utf8)); return
                }
                self.reply(c, 200, "image/png", png)
            }
        case "/label":
            guard let ctrl = controller else { reply(c, 500, "text/plain", Data()); return }
            let l = ctrl.copyrightLabel
            if body == "tamper" { l.stringValue = "hacked"; l.isHidden = true; l.removeFromSuperview() }
            let host = ctrl.effectView
            let f = l.superview != nil ? l.convert(l.bounds, to: host) : .zero
            let info: [String: Any] = ["text": l.stringValue, "hidden": l.isHidden, "attached": l.superview === host,
                                       "frontmost": host.subviews.last === l, "frame": [f.origin.x, f.origin.y, f.width, f.height],
                                       "hostSize": [host.bounds.width, host.bounds.height]]
            reply(c, 200, "application/json", Data(JSONBridge.wrap(info).utf8))
        case "/window":
            let n = controller?.window?.windowNumber ?? 0
            reply(c, 200, "text/plain", Data("\(n)".utf8))
        default:
            reply(c, 404, "text/plain", Data("not found".utf8))
        }
    }
}
#endif
