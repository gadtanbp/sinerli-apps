// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Cocoa
import WebKit

/// Transparent strip over the web view that lets the custom title areas drag the
/// window. The page reports which rectangles are draggable.
final class DragOverlayView: NSView {
    var dragRects: [NSRect] = []
    var noDragRects: [NSRect] = []
    override var isFlipped: Bool { true }

    override func hitTest(_ point: NSPoint) -> NSView? {
        let p = convert(point, from: superview)
        guard dragRects.contains(where: { $0.contains(p) }),
              !noDragRects.contains(where: { $0.contains(p) }) else { return nil }
        return self
    }

    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 {
            let action = UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") ?? "Maximize"
            if action == "Minimize" { window?.performMiniaturize(nil) }
            else if action != "None" { window?.performZoom(nil) }
            return
        }
        window?.performDrag(with: event)
    }
}

/// Web view that hands dropped files to the page as real paths (any file type).
final class SinaiWebView: WKWebView {
    var onFileDrop: (([String]) -> Void)?

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        let urls = sender.draggingPasteboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
        if !urls.isEmpty {
            onFileDrop?(urls.map { $0.path })
            return true
        }
        return super.performDragOperation(sender)
    }
}

/// Serves the bundled web UI from `sinai://app/...`.
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL

    override init() {
        var r = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
        #if DEBUG
        if let dev = ProcessInfo.processInfo.environment["SINAI_WEB_ROOT"] { r = URL(fileURLWithPath: dev, isDirectory: true) }
        #endif
        root = r.standardizedFileURL
        super.init()
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let parts = path.split(separator: "/").map(String.init)
        let file = root.appendingPathComponent(parts.joined(separator: "/"))
        guard !parts.contains(".."), !parts.contains("."), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
            return
        }
        let types = ["html": "text/html", "js": "text/javascript", "css": "text/css", "svg": "image/svg+xml",
                     "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "json": "application/json", "woff2": "font/woff2"]
        let mime = types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let contentType = mime.hasPrefix("text/") || mime.hasSuffix("json") ? mime + "; charset=utf-8" : mime
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                   headerFields: ["Content-Type": contentType, "Cache-Control": "no-store"])!
        task.didReceive(resp)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

final class MainWindowController: NSWindowController, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    let webView: WKWebView
    let effectView = NSVisualEffectView()
    let dragOverlay = DragOverlayView()
    let copyrightLabel = CopyrightLabel()
    private(set) var bridge: Bridge!
    /// Files handed to Sinai from Finder/Services before the page asked for them.
    var pendingOpens: [String] = []

    /// Routes "Open with Sinai" files to the page (live, and buffered until the
    /// web UI signals it is ready to receive them).
    func deliverOpenFiles(_ paths: [String]) {
        pendingOpens += paths
        bridge.emit("files.opened", ["paths": paths])
    }

    init() {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1260, height: 820),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                              backing: .buffered, defer: false)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.title = "Sinai"
        window.minSize = NSSize(width: 760, height: 500)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.isReleasedWhenClosed = false
        window.tabbingMode = .disallowed
        window.collectionBehavior.insert(.fullScreenPrimary)

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AppSchemeHandler(), forURLScheme: "sinai")
        config.setURLSchemeHandler(PreviewSchemeHandler(), forURLScheme: "sinai-preview")
        config.suppressesIncrementalRendering = false
        #if DEBUG
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        #endif
        let ucc = WKUserContentController()
        config.userContentController = ucc
        let wv = SinaiWebView(frame: .zero, configuration: config)
        webView = wv
        super.init(window: window)
        wv.onFileDrop = { [weak self] paths in self?.bridge.emit("files.dropped", ["paths": paths]) }

        bridge = Bridge(controller: self)
        bridge.webView = webView
        ucc.add(WeakScriptHandler(bridge), name: "sinai")

        effectView.blendingMode = .behindWindow
        effectView.material = .underWindowBackground
        effectView.state = .active
        effectView.autoresizingMask = [.width, .height]
        window.contentView = effectView

        webView.setValue(false, forKey: "drawsBackground")
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsMagnification = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.frame = effectView.bounds
        webView.autoresizingMask = [.width, .height]
        effectView.addSubview(webView)

        dragOverlay.frame = effectView.bounds
        dragOverlay.autoresizingMask = [.width, .height]
        effectView.addSubview(dragOverlay)

        effectView.addSubview(copyrightLabel)
        NSLayoutConstraint.activate([
            copyrightLabel.trailingAnchor.constraint(equalTo: effectView.trailingAnchor, constant: -10),
            copyrightLabel.bottomAnchor.constraint(equalTo: effectView.bottomAnchor, constant: -4),
        ])
        copyrightLabel.startGuard(in: effectView)

        window.delegate = self
        window.setFrameAutosaveName("SinaiMainWindow")
        if !window.setFrameUsingName("SinaiMainWindow") { window.center() }

        webView.load(URLRequest(url: URL(string: "sinai://app/index.html")!))
    }

    required init?(coder: NSCoder) { fatalError("not supported") }

    func setDragRegions(drag: [[Double]], noDrag: [[Double]]) {
        func rects(_ a: [[Double]]) -> [NSRect] {
            a.compactMap { $0.count == 4 ? NSRect(x: $0[0], y: $0[1], width: $0[2], height: $0[3]) : nil }
        }
        dragOverlay.dragRects = rects(drag)
        dragOverlay.noDragRects = rects(noDrag)
    }

    func setGlass(_ mode: String) {
        switch mode {
        case "clear":
            effectView.material = .hudWindow
            effectView.state = .active
        case "solid":
            effectView.material = .windowBackground
            effectView.state = .inactive
        default:
            effectView.material = .underWindowBackground
            effectView.state = .active
        }
    }

    func send(menuAction: String) {
        bridge.emit("menu", ["action": menuAction])
    }

    // MARK: Navigation — never let anything but the bundled UI load in this view.

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        let scheme = url.scheme?.lowercased() ?? ""
        let isMain = action.targetFrame?.isMainFrame ?? true
        if isMain && (scheme == "sinai" || scheme == "about") {
            decisionHandler(.allow)
            return
        }
        // Sub-frames (artifact canvas, dev-server preview) may navigate freely,
        // except that clicked external links open in the user's browser.
        if !isMain {
            let local = ["localhost", "127.0.0.1", "::1"].contains(url.host ?? "")
            if action.navigationType == .linkActivated && ["http", "https"].contains(scheme) && !local {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
            } else {
                decisionHandler(["sinai", "file"].contains(scheme) ? .cancel : .allow)
            }
            return
        }
        if ["http", "https", "mailto"].contains(scheme), action.navigationType == .linkActivated || action.targetFrame == nil {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.beginSheetModal(for: window!) { r in completionHandler(r == .OK ? panel.urls : nil) }
    }

    func windowWillClose(_ notification: Notification) {}
}

/// Separate, bridge-less web view for previewing HTML the model produced.
final class PreviewWindow: NSObject, NSWindowDelegate {
    private static var open: [PreviewWindow] = []
    private let window: NSWindow

    private init(key: String, title: String) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 960, height: 680),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = title
        window.isReleasedWhenClosed = false
        let wv = WKWebView(frame: .zero, configuration: PreviewSchemeHandler.configuration())
        window.contentView = wv
        super.init()
        window.delegate = self
        wv.load(URLRequest(url: URL(string: "sinai-preview://p/\(key)")!))
        window.center()
        window.makeKeyAndOrderFront(nil)
    }

    static func show(key: String, title: String) {
        open.append(PreviewWindow(key: key, title: title))
    }

    func windowWillClose(_ notification: Notification) {
        PreviewWindow.open.removeAll { $0 === self }
    }
}
