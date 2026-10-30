// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import UIKit
import WebKit
import AuthenticationServices
import UniformTypeIdentifiers
import UserNotifications

struct BridgeError: LocalizedError {
    let message: String
    init(_ m: String) { message = m }
    var errorDescription: String? { message }
}

/// Menerima {id, method, params} dari mobile/web/host-mobile.js dan menjawab lewat
/// window.__gxn({id, ok, v|err}); event: window.__gxn({events: [[nama, data]]}).
/// Kontrak sama dengan host Android (mobile/android/.../Bridge.java).
final class NativeBridge: NSObject, WKScriptMessageHandler, UIDocumentPickerDelegate, ASWebAuthenticationPresentationContextProviding {
    weak var controller: WebViewController?
    let sandbox = Sandbox()
    let http = NativeHTTP()
    let renderer = Renderer()
    private var pickId: String?
    private var authSession: ASWebAuthenticationSession?
    private var pendingOpens: [String] = []
    private var pendingEvents: [String] = []
    private var flushScheduled = false
    private let lock = NSLock()

    init(controller: WebViewController) {
        self.controller = controller
        super.init()
        http.emit = { [weak self] name, payload in self?.emit(name, payload) }
    }

    // MARK: keluar

    private func eval(_ js: String) {
        DispatchQueue.main.async { self.controller?.web.evaluateJavaScript(js, completionHandler: nil) }
    }

    private static func json(_ obj: Any) -> String {
        guard JSONSerialization.isValidJSONObject(obj), let d = try? JSONSerialization.data(withJSONObject: obj), var s = String(data: d, encoding: .utf8) else { return "null" }
        s = s.replacingOccurrences(of: "\u{2028}", with: "\\u2028").replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        return s
    }

    func reply(_ id: String, _ v: Any?) { eval("window.__gxn&&window.__gxn(" + NativeBridge.json(["id": id, "ok": true, "v": v ?? NSNull()] as [String: Any]) + ")") }
    func fail(_ id: String, _ e: Error) {
        let msg = (e as? LocalizedError)?.errorDescription ?? e.localizedDescription
        eval("window.__gxn&&window.__gxn(" + NativeBridge.json(["id": id, "ok": false, "err": msg] as [String: Any]) + ")")
    }

    func emit(_ name: String, _ payload: [String: Any]) {
        lock.lock()
        pendingEvents.append(NativeBridge.json([name, payload] as [Any]))
        let schedule = !flushScheduled
        flushScheduled = true
        lock.unlock()
        if schedule { DispatchQueue.main.asyncAfter(deadline: .now() + 0.016) { self.flush() } }
    }

    private func flush() {
        lock.lock()
        let items = pendingEvents
        pendingEvents.removeAll()
        flushScheduled = false
        lock.unlock()
        if !items.isEmpty { eval("window.__gxn&&window.__gxn({events:[" + items.joined(separator: ",") + "]})") }
    }

    // MARK: masuk

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == "sinai", message.frameInfo.securityOrigin.host == "app",
              let body = message.body as? [String: Any], let id = body["id"] as? String, let method = body["method"] as? String else { return }
        let p = (body["params"] as? [String: Any]) ?? [:]
        handle(id, method, p)
    }

    private func bg(_ id: String, _ work: @escaping () throws -> Any?) {
        DispatchQueue.global(qos: .userInitiated).async {
            do { self.reply(id, try work()) } catch { self.fail(id, error) }
        }
    }

    private func handle(_ id: String, _ method: String, _ p: [String: Any]) {
        let str = { (k: String) in p[k] as? String ?? "" }
        switch method {
        case "app.info": reply(id, info())
        case "app.openURL":
            guard let u = URL(string: str("url")), ["http", "https", "mailto"].contains(u.scheme?.lowercased() ?? "") else { fail(id, BridgeError("URL tidak diizinkan")); return }
            UIApplication.shared.open(u)
            reply(id, true)
        case "app.copy": UIPasteboard.general.string = str("text"); reply(id, true)
        case "app.share": share(id, p)
        case "app.open": share(id, p)   // iOS: lembar Bagikan juga menawarkan "Buka di…"
        case "app.pendingOpens": reply(id, pendingOpens); pendingOpens = []
        case "app.background": reply(id, true)
        case "app.setAppearance":
            let mode = str("mode")
            controller?.overrideUserInterfaceStyle = mode == "dark" ? .dark : mode == "light" ? .light : .unspecified
            let dark = mode == "dark" || (mode != "light" && controller?.traitCollection.userInterfaceStyle == .dark)
            controller?.statusStyle = dark ? .lightContent : .darkContent
            reply(id, true)
        case "notify.show": notify(p); reply(id, true)

        case "store.read": bg(id) { try self.sandbox.storeRead(str("name")) }
        case "store.write": bg(id) { try self.sandbox.storeWrite(str("name"), str("content")); return true }
        case "store.delete": bg(id) { try self.sandbox.storeDelete(str("name")); return true }
        case "store.list": bg(id) { try self.sandbox.storeList(str("dir")) }

        case "secret.get": bg(id) { Keychain.get(str("key")) }
        case "secret.set": bg(id) { try Keychain.set(str("key"), p["value"] as? String); return true }
        case "secret.keys": bg(id) { Keychain.keys() }

        case "fs.readBytes": bg(id) { try self.sandbox.readBytes(str("path"), offset: (p["offset"] as? NSNumber)?.int64Value ?? 0, length: (p["length"] as? NSNumber)?.int64Value ?? 0) }
        case "fs.writeBytes": bg(id) { try self.sandbox.writeBytes(str("path"), Data(base64Encoded: str("base64")) ?? Data(), append: p["append"] as? Bool ?? false) }
        case "fs.stat": bg(id) { self.sandbox.stat(str("path")) }
        case "fs.listDir": bg(id) { try self.sandbox.listDir(str("path")) }
        case "fs.mkdir": bg(id) { try self.sandbox.mkdir(str("path")); return true }
        case "fs.remove": bg(id) { try self.sandbox.remove(str("path")); return true }
        case "fs.move": bg(id) { try self.sandbox.move(str("from"), str("to")); return true }
        case "file.url": bg(id) {
            let f = try self.sandbox.existing(str("path"))
            return "sinai://app/__file/" + self.controller!.assets.fileToken(f) + "/" + (f.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "berkas")
        }
        case "preview.put": reply(id, controller?.assets.putPreview(str("key"), str("html")))
        case "preview.file": bg(id) {
            let f = try self.sandbox.existing(str("path"))
            return "sinai-preview://file/" + self.controller!.assets.fileToken(f) + "/" + (f.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "berkas")
        }
        case "render":
            guard let c = controller, let out = try? sandbox.guardPath(str("outPath")) else { fail(id, BridgeError("outPath tidak valid")); return }
            renderer.render(p, out: out, in: c.view, assets: c.assets) { r in
                switch r { case .success(let path): self.reply(id, path); case .failure(let e): self.fail(id, e) }
            }

        case "dialog.openFiles": pick(id, multiple: p["multiple"] as? Bool ?? true)
        case "oauth.start": oauth(id, p)

        case "http.request": http.request(p) { r in switch r { case .success(let v): self.reply(id, v); case .failure(let e): self.fail(id, e) } }
        case "http.stream": do { try http.stream(id: str("id"), params: p); reply(id, true) } catch { fail(id, error) }
        case "http.abort": http.abort(id: str("id")); reply(id, true)

        case "update.download", "update.install":
            fail(id, BridgeError("Pembaruan iOS dipasang lewat App Store / TestFlight."))
        default:
            fail(id, BridgeError("Metode native tidak dikenal: \(method)"))
        }
    }

    private func info() -> [String: Any] {
        let d = UIDevice.current
        var sys = utsname()
        uname(&sys)
        let model = withUnsafePointer(to: &sys.machine) { $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) } }
        return [
            "version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0",
            "build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1",
            "osFamily": "ios", "platform": "ios",
            "os": "\(d.systemName) \(d.systemVersion)", "osVersion": d.systemVersion,
            "deviceModel": d.model + (model.isEmpty ? "" : " (\(model))"),
            "arch": "arm64",
            "home": sandbox.home.path, "supportDir": sandbox.support.path, "tempDir": sandbox.temp.path, "cacheDir": sandbox.cache.path,
            "user": "", "fullName": "", "host": d.name,
            "locale": Locale.preferredLanguages.first ?? "id",
            "reduceTransparency": UIAccessibility.isReduceTransparencyEnabled,
            "updateKind": "ipa",
            "copyright": Brand.label, "owner": Brand.owner, "legal": Brand.legal,
        ]
    }

    // MARK: bagikan

    private func share(_ id: String, _ p: [String: Any]) {
        var items: [Any] = []
        if let path = p["path"] as? String, !path.isEmpty {
            guard let f = try? sandbox.existing(path) else { fail(id, BridgeError("File tidak ditemukan")); return }
            items.append(f)
        } else {
            items.append(p["text"] as? String ?? "")
        }
        guard let c = controller else { fail(id, BridgeError("Tidak ada jendela")); return }
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = c.view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: c.view.bounds.midX, y: c.view.bounds.maxY - 80, width: 1, height: 1)
        c.present(sheet, animated: true)
        reply(id, true)
    }

    // MARK: pemilih berkas

    private func pick(_ id: String, multiple: Bool) {
        if let old = pickId { reply(old, [String]()) }
        pickId = id
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: true)
        picker.allowsMultipleSelection = multiple
        picker.delegate = self
        controller?.present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let id = pickId else { return }
        pickId = nil
        bg(id) { urls.compactMap { self.sandbox.importFile($0, folder: "lampiran")?.path } }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        if let id = pickId { pickId = nil; reply(id, [String]()) }
    }

    // MARK: OAuth (Sinerli Connect & konektor)

    private func oauth(_ id: String, _ p: [String: Any]) {
        guard let url = URL(string: p["url"] as? String ?? ""), url.scheme?.lowercased() == "https" || url.host == "localhost" || url.host == "127.0.0.1" else {
            fail(id, BridgeError("Alamat login harus https.")); return
        }
        let scheme = p["scheme"] as? String ?? "com.sinerli.sinai"
        let s = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] cb, err in
            guard let self = self else { return }
            self.authSession = nil
            if let cb = cb { self.reply(id, cb.absoluteString) }
            else if let e = err as? ASWebAuthenticationSessionError, e.code == .canceledLogin { self.fail(id, BridgeError("Login dibatalkan.")) }
            else { self.fail(id, err ?? BridgeError("Login gagal.")) }
        }
        s.presentationContextProvider = self
        s.prefersEphemeralWebBrowserSession = false   // pakai sesi Safari: bila sudah masuk Sinerli, cukup sekali ketuk
        authSession = s
        if !s.start() { authSession = nil; fail(id, BridgeError("Tidak bisa membuka halaman login.")) }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        controller?.view.window ?? ASPresentationAnchor()
    }

    // MARK: dibagikan ke Sinai

    func sharedFiles(_ paths: [String]) {
        pendingOpens += paths
        emit("files.opened", ["paths": paths])
    }

    // MARK: notifikasi

    private func notify(_ p: [String: Any]) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { ok, _ in
            guard ok else { return }
            let c = UNMutableNotificationContent()
            c.title = p["title"] as? String ?? "Sinai"
            c.body = p["body"] as? String ?? ""
            center.add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil))
        }
    }
}
