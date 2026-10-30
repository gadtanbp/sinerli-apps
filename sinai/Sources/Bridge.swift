// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Cocoa
import WebKit

struct BridgeError: LocalizedError {
    let message: String
    init(_ m: String) { message = m }
    var errorDescription: String? { message }
}

/// Receives `{id, method, params}` messages from the page and answers through
/// `window.__gx.resolve/reject`. Events are batched into `window.__gx.events`.
final class Bridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    weak var controller: MainWindowController?
    let http = HTTPClient()

    private var pendingEvents: [String] = []
    private var flushScheduled = false
    private let eventLock = NSLock()

    init(controller: MainWindowController) {
        self.controller = controller
        super.init()
        http.emit = { [weak self] name, payload in self?.emit(name, payload) }
        MCPHost.shared.emit = { [weak self] name, payload in self?.emit(name, payload) }
        Dictation.shared.emit = { [weak self] name, payload in self?.emit(name, payload) }
        Recorder.shared.emit = { [weak self] name, payload in self?.emit(name, payload) }
        NetExtra.shared.emit = { [weak self] name, payload in self?.emit(name, payload) }
        WatchFolders.shared.emit = { [weak self] name, payload in self?.emit(name, payload) }
        WebhookServer.shared.emit = { [weak self] name, payload in self?.emit(name, payload) }
        OAuthLoopback.shared.emit = { [weak self] name, payload in self?.emit(name, payload) }
        SelfUpdate.shared.emit = { [weak self] name, payload in self?.emit(name, payload) }
    }

    // MARK: Outgoing

    private func eval(_ js: String) {
        if Thread.isMainThread {
            webView?.evaluateJavaScript(js, completionHandler: nil)
        } else {
            DispatchQueue.main.async { self.webView?.evaluateJavaScript(js, completionHandler: nil) }
        }
    }

    private func resolve(_ id: String, _ value: Any?) {
        eval("window.__gx&&window.__gx.resolve(\(JSONBridge.quote(id)),\(JSONBridge.wrap(value)))")
    }

    private func reject(_ id: String, _ error: Error) {
        let msg = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        eval("window.__gx&&window.__gx.reject(\(JSONBridge.quote(id)),\(JSONBridge.quote(msg)))")
    }

    func emit(_ name: String, _ payload: [String: Any]) {
        let item = "[\(JSONBridge.quote(name)),\(JSONBridge.wrap(payload))]"
        eventLock.lock()
        pendingEvents.append(item)
        let schedule = !flushScheduled
        flushScheduled = true
        eventLock.unlock()
        if schedule {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.016) { self.flushEvents() }
        }
    }

    private func flushEvents() {
        eventLock.lock()
        let items = pendingEvents
        pendingEvents.removeAll()
        flushScheduled = false
        eventLock.unlock()
        guard !items.isEmpty else { return }
        eval("window.__gx&&window.__gx.events([\(items.joined(separator: ","))])")
    }

    // MARK: Incoming

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        // Only the app's own top-level page may use the bridge.
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "sinai",
              let body = message.body as? [String: Any],
              let id = body["id"] as? String,
              let method = body["method"] as? String else { return }
        let params = (body["params"] as? [String: Any]) ?? [:]
        handle(id: id, method: method, params: params)
    }

    private func background(_ id: String, _ work: @escaping () throws -> Any?) {
        DispatchQueue.global(qos: .userInitiated).async {
            do { self.resolve(id, try work()) } catch { self.reject(id, error) }
        }
    }

    /// Resolves a save/export result: a path on success, nil if the user cancelled.
    private func deliverResult(_ id: String, _ r: Result<String?, Error>) {
        switch r {
        case .success(let path): resolve(id, path)
        case .failure(let e): reject(id, e)
        }
    }

    private func handle(id: String, method: String, params p: [String: Any]) {
        switch method {

        // App & window
        case "app.info":
            let info = ProcessInfo.processInfo
            let v = info.operatingSystemVersion
            var arch = "x86_64"
            #if arch(arm64)
            arch = "arm64"
            #endif
            resolve(id, [
                "version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0",
                "build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1",
                "macos": "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)",
                "arch": arch,
                "home": NSHomeDirectory(),
                "user": NSUserName(),
                "fullName": NSFullUserName(),
                "host": info.hostName,
                "shell": Env.shared.userShell,
                "path": Env.shared.path,
                "supportDir": Paths.support.path,
                "reduceTransparency": NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency,
                "locale": Locale.preferredLanguages.first ?? "id",
                "copyright": Brand.label,
                "owner": Brand.owner,
                "legal": Brand.legal,
                "osFamily": "macos",
                "platform": "darwin",
                "updateKind": "dmg",
            ] as [String: Any])
        case "app.setDragRegions":
            controller?.setDragRegions(drag: p["drag"] as? [[Double]] ?? [], noDrag: p["noDrag"] as? [[Double]] ?? [])
            resolve(id, true)
        case "app.setGlass":
            controller?.setGlass(p["mode"] as? String ?? "glass")
            resolve(id, true)
        case "app.setAppearance":
            switch p["mode"] as? String {
            case "light": NSApp.appearance = NSAppearance(named: .aqua)
            case "dark": NSApp.appearance = NSAppearance(named: .darkAqua)
            default: NSApp.appearance = nil
            }
            resolve(id, true)
        case "app.attention":
            if !NSApp.isActive { NSApp.requestUserAttention(.informationalRequest) }
            resolve(id, true)
        case "app.openURL":
            guard let s = p["url"] as? String, let url = URL(string: s),
                  let scheme = url.scheme?.lowercased(), ["http", "https", "mailto"].contains(scheme) else {
                reject(id, BridgeError("URL tidak diizinkan")); return
            }
            NSWorkspace.shared.open(url)
            resolve(id, true)
        case "app.reveal":
            guard let s = p["path"] as? String else { reject(id, BridgeError("path wajib")); return }
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: Paths.expand(s))])
            resolve(id, true)
        case "app.openPath":
            guard let s = p["path"] as? String else { reject(id, BridgeError("path wajib")); return }
            resolve(id, NSWorkspace.shared.open(URL(fileURLWithPath: Paths.expand(s))))
        case "app.preview":
            let key = p["key"] as? String ?? UUID().uuidString
            if let html = p["html"] as? String { PreviewStore.put(key, html) }
            PreviewWindow.show(key: key, title: p["title"] as? String ?? "Pratinjau")
            resolve(id, true)
        case "preview.put":
            let key = p["key"] as? String ?? UUID().uuidString
            PreviewStore.put(key, p["html"] as? String ?? "")
            resolve(id, "sinai-preview://p/" + key)
        case "preview.export":
            let key = p["key"] as? String ?? ""
            if let html = p["html"] as? String { PreviewStore.put(key, html) }
            let exporter = PreviewExporter(key: key, format: p["format"] as? String ?? "png",
                                width: CGFloat(p["width"] as? Double ?? 1280), pageHeight: CGFloat(p["pageHeight"] as? Double ?? 720),
                                pages: p["pages"] as? Int ?? 0, name: p["name"] as? String ?? "artifact",
                                parent: controller?.window) { r in
                switch r {
                case .success(let path): self.resolve(id, path)
                case .failure(let e): self.reject(id, e)
                }
            }
            exporter.outPath = p["outPath"] as? String
            #if DEBUG
            exporter.debugSavePath = p["debugSavePath"] as? String
            #endif

        // Files of any type
        case "file.info": background(id) { try Ingest.info(p) }
        case "file.text": background(id) { try Ingest.readText(p) }
        case "image.prepare": background(id) { try Ingest.image(p) }
        case "image.ocr": background(id) { try Ingest.ocr(p) }
        case "pdf.read": background(id) { try Ingest.pdf(p) }
        case "zip.list": background(id) { try Ingest.zipList(p) }
        case "zip.read": background(id) { try Ingest.zipRead(p) }
        case "media.info": background(id) { try Ingest.media(p) }
        case "media.transcribe":
            Ingest.transcribe(p) { r in
                switch r {
                case .success(let v): self.resolve(id, v)
                case .failure(let e): self.reject(id, e)
                }
            }
        case "fs.writeTemp": background(id) { try Ingest.writeTemp(p) }
        case "clipboard.files": resolve(id, Ingest.clipboardFiles())

        // MCP servers (stdio)
        case "mcp.start":
            do {
                try MCPHost.shared.start(id: p["id"] as? String ?? "", command: p["command"] as? String ?? "",
                                         args: p["args"] as? [String] ?? [], env: p["env"] as? [String: String] ?? [:],
                                         cwd: p["cwd"] as? String)
                resolve(id, true)
            } catch { reject(id, error) }
        case "mcp.send":
            do { try MCPHost.shared.send(id: p["id"] as? String ?? "", line: p["line"] as? String ?? ""); resolve(id, true) } catch { reject(id, error) }
        case "mcp.stop":
            MCPHost.shared.stop(id: p["id"] as? String ?? "")
            resolve(id, true)
        case "app.copy":
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(p["text"] as? String ?? "", forType: .string)
            resolve(id, true)
        case "app.quit":
            NSApp.terminate(nil)
        case "file.saveAs":
            guard let raw = p["path"] as? String, let data = try? Data(contentsOf: URL(fileURLWithPath: Paths.expand(raw))) else {
                reject(id, BridgeError("File tidak ditemukan")); return
            }
            Exports.deliver(data, suggestedName: p["name"] as? String ?? (raw as NSString).lastPathComponent, savePath: nil, parent: controller?.window) { self.deliverResult(id, $0) }
        case "app.quicklook":
            let paths = (p["paths"] as? [String]) ?? [(p["path"] as? String) ?? ""]
            (NSApp.delegate as? AppDelegate)?.quickLook(paths)
            resolve(id, true)
        case "preview.file":
            guard let raw = p["path"] as? String else { reject(id, BridgeError("path wajib")); return }
            let path = Paths.expand(raw)
            var isDir: ObjCBool = false
            guard FileManager.default.fileExists(atPath: path, isDirectory: &isDir), !isDir.boolValue else { reject(id, BridgeError("File tidak ditemukan")); return }
            let key = PreviewStore.putFile(path)
            resolve(id, "sinai-preview://file/\(key)/" + ((path as NSString).lastPathComponent.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "file"))
        case "preview.site":
            guard let raw = p["root"] as? String else { reject(id, BridgeError("root wajib")); return }
            let root = Paths.expand(raw)
            var isDir: ObjCBool = false
            guard FileManager.default.fileExists(atPath: root, isDirectory: &isDir), isDir.boolValue else { reject(id, BridgeError("Folder tidak ditemukan")); return }
            resolve(id, "sinai-preview://site/\(PreviewStore.putSite(root))/")
        case "pdf.fromHTML":
            HTMLToPDF.make(p) { r in switch r { case .success(let v): self.resolve(id, v); case .failure(let e): self.reject(id, e) } }
        case "video.make":
            let job = p["job"] as? String ?? id
            VideoMaker.make(p, progress: { [weak self] f in self?.emit("video.progress", ["job": job, "progress": f]) }) { r in
                switch r { case .success(let v): self.resolve(id, v); case .failure(let e): self.reject(id, e) }
            }
        case "app.pendingOpens":
            let paths = controller?.pendingOpens ?? []
            controller?.pendingOpens = []
            resolve(id, paths)

        // Dialogs
        case "dialog.openFolder":
            let panel = NSOpenPanel()
            panel.canChooseDirectories = true
            panel.canChooseFiles = false
            panel.canCreateDirectories = true
            panel.allowsMultipleSelection = false
            panel.message = p["message"] as? String ?? "Pilih folder proyek"
            panel.prompt = "Pilih"
            runPanel(panel) { urls in self.resolve(id, urls.first?.path) }
        case "dialog.openFiles":
            let panel = NSOpenPanel()
            panel.canChooseFiles = true
            panel.canChooseDirectories = false
            panel.allowsMultipleSelection = (p["multiple"] as? Bool) ?? true
            panel.prompt = "Lampirkan"
            runPanel(panel) { urls in self.resolve(id, urls.map { $0.path }) }
        case "dialog.save":
            let panel = NSSavePanel()
            panel.nameFieldStringValue = p["name"] as? String ?? "export.md"
            panel.canCreateDirectories = true
            let content = p["content"] as? String ?? ""
            let done: (NSApplication.ModalResponse) -> Void = { r in
                guard r == .OK, let url = panel.url else { self.resolve(id, nil); return }
                do { try content.write(to: url, atomically: true, encoding: .utf8); self.resolve(id, url.path) }
                catch { self.reject(id, error) }
            }
            if let w = controller?.window { panel.beginSheetModal(for: w, completionHandler: done) } else { panel.begin(completionHandler: done) }

        // App data store (Application Support/Sinai)
        case "store.read":
            background(id) {
                guard let url = Paths.inSupport(p["name"] as? String ?? "") else { throw BridgeError("Nama tidak valid") }
                guard FileManager.default.fileExists(atPath: url.path) else { return nil }
                return try String(contentsOf: url, encoding: .utf8)
            }
        case "store.write":
            background(id) {
                guard let url = Paths.inSupport(p["name"] as? String ?? "") else { throw BridgeError("Nama tidak valid") }
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try (p["content"] as? String ?? "").write(to: url, atomically: true, encoding: .utf8)
                return true
            }
        case "store.delete":
            background(id) {
                guard let url = Paths.inSupport(p["name"] as? String ?? ""), url.path != Paths.support.path else {
                    throw BridgeError("Nama tidak valid")
                }
                try? FileManager.default.removeItem(at: url)
                return true
            }
        case "store.list":
            background(id) {
                guard let url = Paths.inSupport(p["dir"] as? String ?? "") else { throw BridgeError("Nama tidak valid") }
                return (try? FileManager.default.contentsOfDirectory(atPath: url.path)) ?? []
            }

        // Secrets
        case "secret.get":
            background(id) { Secrets.get(p["key"] as? String ?? "") }
        case "secret.set":
            background(id) { try Secrets.set(p["key"] as? String ?? "", p["value"] as? String); return true }
        case "secret.keys":
            background(id) { Secrets.keys() }

        // File system (agent tools)
        case "fs.read": background(id) { try FileOps.read(p) }
        case "fs.write": background(id) { try FileOps.write(p) }
        case "fs.stat": background(id) { FileOps.stat(p) }
        case "fs.list": background(id) { try FileOps.list(p) }
        case "fs.glob": background(id) { try FileOps.glob(p) }
        case "fs.mkdir": background(id) { try FileOps.mkdir(p) }
        case "fs.trash": background(id) { try FileOps.trash(p) }
        case "fs.move": background(id) { try FileOps.move(p) }
        case "doc.extractText": background(id) { try FileOps.extractText(p) }

        // Shell
        case "exec.start":
            let jobId = p["id"] as? String ?? id
            do {
                let pid = try ShellRunner.shared.start(
                    id: jobId,
                    command: p["command"] as? String ?? "",
                    cwd: p["cwd"] as? String,
                    timeout: p["timeout"] as? Double ?? 120,
                    admin: p["admin"] as? Bool ?? false,
                    interactive: p["interactive"] as? Bool ?? false,
                    pty: p["pty"] as? Bool ?? false,
                    cols: p["cols"] as? Int ?? 120,
                    rows: p["rows"] as? Int ?? 32,
                    output: { [weak self] stream, text in self?.emit("exec.out", ["id": jobId, "stream": stream, "data": text]) },
                    exit: { [weak self] info in self?.emit("exec.exit", info) })
                resolve(id, ["pid": Int(pid)])
            } catch { reject(id, error) }
        case "exec.kill":
            ShellRunner.shared.kill(id: p["id"] as? String ?? "")
            resolve(id, true)
        case "exec.write":
            resolve(id, ShellRunner.shared.write(id: p["id"] as? String ?? "", data: p["data"] as? String ?? ""))
        case "exec.closeInput":
            ShellRunner.shared.closeInput(id: p["id"] as? String ?? "")
            resolve(id, true)
        case "exec.resize":
            ShellRunner.shared.resize(id: p["id"] as? String ?? "", cols: p["cols"] as? Int ?? 120, rows: p["rows"] as? Int ?? 32)
            resolve(id, true)
        case "exec.interrupt":
            ShellRunner.shared.interrupt(id: p["id"] as? String ?? "")
            resolve(id, true)

        // Live dictation (microphone → text)
        case "dictation.start":
            Dictation.shared.start(locale: p["locale"] as? String ?? "id-ID") { r in
                switch r { case .success(let v): self.resolve(id, v); case .failure(let e): self.reject(id, e) }
            }
        case "dictation.stop":
            resolve(id, Dictation.shared.stop())

        // Recording (audio / screen / system audio) & screenshots
        case "record.start":
            Recorder.shared.start(kind: p["kind"] as? String ?? "audio", mic: p["mic"] as? Bool ?? true) { r in
                switch r { case .success(let v): self.resolve(id, v); case .failure(let e): self.reject(id, e) }
            }
        case "record.stop":
            Recorder.shared.stop(id: p["id"] as? String ?? "", cancel: p["cancel"] as? Bool ?? false) { r in
                switch r { case .success(let v): self.resolve(id, v); case .failure(let e): self.reject(id, e) }
            }
        case "screen.shot":
            Recorder.screenshot(mode: p["mode"] as? String ?? "interactive") { r in
                switch r { case .success(let v): self.resolve(id, v); case .failure(let e): self.reject(id, e) }
            }
        case "window.snapshot":
            controller?.webView.takeSnapshot(with: nil) { img, err in
                guard let img = img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
                      let png = rep.representation(using: .png, properties: [:]) else { self.reject(id, err ?? BridgeError("Snapshot gagal")); return }
                let url = Recorder.tempURL("png", prefix: "jendela Sinai")
                do { try png.write(to: url); self.resolve(id, url.path) } catch { self.reject(id, error) }
            }
        case "camera.open":
            CameraPanel.open(parent: controller?.window) { r in
                switch r { case .success(let v): self.resolve(id, v); case .failure(let e): self.reject(id, e) }
            }

        // Richer file readers
        case "file.prepare": background(id) { try Ingest.prepare(p) }
        case "file.thumbnail": background(id) { try Ingest.thumbnail(p) }
        case "image.meta": background(id) { try Ingest.imageMeta(p) }
        case "archive.list": background(id) { try Ingest.archiveList(p) }
        case "archive.extract": background(id) { try Ingest.archiveExtract(p) }
        case "archive.clean": background(id) { try Ingest.cleanTemp(p) }
        case "audio.stats": background(id) { try Ingest.audioStats(p) }
        case "image.analyze": background(id) { try Ingest.analyzeImage(p) }
        case "audio.classify": background(id) { try Ingest.classifySound(p) }
        case "media.transcribeLong":
            Ingest.transcribeLong(p, progress: { [weak self] i, n in self?.emit("transcribe.progress", ["done": i, "total": n]) }) { r in
                switch r { case .success(let v): self.resolve(id, v); case .failure(let e): self.reject(id, e) }
            }

        // Exports
        case "export.document": Exports.document(p, parent: controller?.window) { self.deliverResult(id, $0) }
        case "export.spreadsheet": Exports.spreadsheet(p, parent: controller?.window) { self.deliverResult(id, $0) }
        case "export.slides": Exports.slides(p, parent: controller?.window) { self.deliverResult(id, $0) }
        case "export.image": Exports.convertImage(p, parent: controller?.window) { self.deliverResult(id, $0) }
        case "export.zip": Exports.zipExport(p, parent: controller?.window) { self.deliverResult(id, $0) }
        case "pdf.edit": Exports.pdfEdit(p, parent: controller?.window) { self.deliverResult(id, $0) }
        case "export.share":
            Exports.share(p, parent: controller?.window) { r in switch r { case .success(let v): self.resolve(id, v); case .failure(let e): self.reject(id, e) } }
        case "export.print":
            Exports.printHTML(p, parent: controller?.window) { r in switch r { case .success(let v): self.resolve(id, v); case .failure(let e): self.reject(id, e) } }
        case "backup.create": Backup.create(p, parent: controller?.window) { self.deliverResult(id, $0) }

        // Personal data (Contacts, Calendar, Reminders, Photos) — user-approved
        case "pim.status": resolve(id, PIM.status(p["kind"] as? String ?? ""))
        case "pim.request":
            PIM.requestAccess(p["kind"] as? String ?? "") { ok in self.resolve(id, ok) }
        case "contacts.search": background(id) { try PIM.searchContacts(p) }
        case "contacts.create": background(id) { try PIM.createContact(p) }
        case "calendar.list": background(id) { try PIM.listEvents(p) }
        case "calendar.create": background(id) { try PIM.createEvent(p) }
        case "reminders.list": background(id) { try PIM.listReminders(p) }
        case "reminders.create": background(id) { try PIM.createReminder(p) }
        case "photos.recent": background(id) { try PIM.recentPhotos(p) }
        case "photos.export": background(id) { try PIM.exportPhoto(p) }
        case "photos.save": background(id) { try PIM.saveToPhotos(p) }

        // Apple apps (Mail/Messages/Notes/Music) via fixed scripts, and Shortcuts
        case "apple.script": background(id) { try AppScripts.run(p) }
        case "shortcuts.list": background(id) { try ShortcutsBridge.list() }
        case "shortcuts.run": background(id) { try ShortcutsBridge.run(p) }

        // Networking: upload, cookies, dev-server scan, WebSocket
        case "net.upload":
            NetExtra.shared.upload(p, id: p["id"] as? String ?? id) { r in switch r { case .success(let v): self.resolve(id, v); case .failure(let e): self.reject(id, e) } }
        case "net.cookies": resolve(id, NetExtra.shared.cookies(p))
        case "net.clearCookies": resolve(id, NetExtra.shared.clearCookies())
        case "net.scanDev": NetExtra.shared.scanDevServers(p) { self.resolve(id, $0) }
        case "ws.connect":
            do { try NetExtra.shared.wsConnect(p, id: p["id"] as? String ?? ""); resolve(id, true) } catch { reject(id, error) }
        case "ws.send":
            NetExtra.shared.wsSend(id: p["id"] as? String ?? "", text: p["text"] as? String, base64: p["base64"] as? String) { e in
                if let e = e { self.reject(id, e) } else { self.resolve(id, true) }
            }
        case "ws.close":
            NetExtra.shared.wsClose(id: p["id"] as? String ?? "")
            resolve(id, true)

        // Automation: notifications, watch folders, webhook, backup
        case "notify.show": resolve(id, Notifier.notify(p))
        case "watch.start":
            do { try WatchFolders.shared.start(id: p["id"] as? String ?? "", path: p["path"] as? String ?? ""); resolve(id, true) } catch { reject(id, error) }
        case "watch.stop":
            WatchFolders.shared.stop(id: p["id"] as? String ?? "")
            resolve(id, true)
        case "webhook.start":
            do { resolve(id, Int(try WebhookServer.shared.start(port: UInt16(p["port"] as? Int ?? 8765), secret: p["secret"] as? String ?? ""))) } catch { reject(id, error) }
        case "webhook.stop":
            WebhookServer.shared.stop()
            resolve(id, true)
        case "oauth.listen":
            OAuthLoopback.shared.start(port: UInt16(p["port"] as? Int ?? 0)) { r in
                switch r { case .success(let port): self.resolve(id, port); case .failure(let e): self.reject(id, e) }
            }
        case "exec.sync":
            background(id) {
                let r = runSync("/bin/zsh", ["-c", p["command"] as? String ?? ""],
                                cwd: (p["cwd"] as? String).map(Paths.expand),
                                timeout: p["timeout"] as? Double ?? 15,
                                env: Env.shared.environment())
                return ["code": Int(r.code), "stdout": r.out, "stderr": r.err] as [String: Any]
            }

        // Pembaruan dari Sinerli
        case "update.download":
            SelfUpdate.shared.download(p) { r in
                switch r {
                case .success(let path): self.resolve(id, path)
                case .failure(let e): self.reject(id, e)
                }
            }
        case "update.install":
            background(id) { try SelfUpdate.install(dmgPath: Paths.expand(p["path"] as? String ?? "")) }

        // HTTP
        case "http.stream":
            do { try http.stream(id: p["id"] as? String ?? id, params: p); resolve(id, true) } catch { reject(id, error) }
        case "http.abort":
            http.abort(id: p["id"] as? String ?? "")
            resolve(id, true)
        case "http.request":
            http.request(p) { result in
                switch result {
                case .success(let v): self.resolve(id, v)
                case .failure(let e): self.reject(id, e)
                }
            }

        default:
            reject(id, BridgeError("Metode tidak dikenal: \(method)"))
        }
    }

    private func runPanel(_ panel: NSOpenPanel, _ done: @escaping ([URL]) -> Void) {
        if let w = controller?.window {
            panel.beginSheetModal(for: w) { r in done(r == .OK ? panel.urls : []) }
        } else {
            panel.begin { r in done(r == .OK ? panel.urls : []) }
        }
    }
}

/// Avoids the retain cycle WKUserContentController creates with its handlers.
final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ t: WKScriptMessageHandler) { target = t }
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(ucc, didReceive: message)
    }
}
