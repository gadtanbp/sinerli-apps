// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    var controller: WebViewController?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let w = UIWindow(frame: UIScreen.main.bounds)
        let vc = WebViewController()
        w.rootViewController = vc
        w.makeKeyAndVisible()
        window = w
        controller = vc
        return true
    }

    /// "Buka di Sinai" / Bagikan dari aplikasi lain: salin ke sandbox lalu serahkan ke halaman.
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        guard url.isFileURL, let c = controller else { return false }
        if let f = c.bridge.sandbox.importFile(url, folder: "dibagikan") { c.bridge.sharedFiles([f.path]) }
        return true
    }
}

/// Layar tunggal Sinai: WKWebView memuat UI dari sinai://app/ (isi aplikasi, bukan
/// jaringan). Bridge hanya menerima pesan dari frame utama berasal sinai://app,
/// jadi pratinjau artifact (sinai-preview://, iframe sandbox) tidak bisa menyentuh native.
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private(set) var web: WKWebView!
    private(set) var bridge: NativeBridge!
    let assets = AppAssets()
    private var bottom: NSLayoutConstraint!

    override func loadView() {
        let root = UIView()
        root.backgroundColor = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.08, green: 0.086, blue: 0.12, alpha: 1) : UIColor(red: 0.93, green: 0.94, blue: 0.97, alpha: 1) }
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(AppScheme(assets: assets), forURLScheme: "sinai")
        cfg.setURLSchemeHandler(PreviewScheme(assets: assets), forURLScheme: "sinai-preview")
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = .all
        cfg.preferences.javaScriptCanOpenWindowsAutomatically = false
        cfg.websiteDataStore = .nonPersistent()
        let w = WKWebView(frame: .zero, configuration: cfg)
        bridge = NativeBridge(controller: self)
        cfg.userContentController.add(WeakScriptHandler(bridge), name: "sinaiNative")
        w.navigationDelegate = self
        w.uiDelegate = self
        w.isOpaque = false
        w.backgroundColor = .clear
        w.scrollView.backgroundColor = .clear
        w.scrollView.contentInsetAdjustmentBehavior = .never   // CSS env(safe-area-inset-*) yang mengatur jarak
        w.scrollView.isScrollEnabled = false                     // UI punya area gulir sendiri
        w.scrollView.bounces = false
        w.allowsLinkPreview = false
        #if DEBUG
        if #available(iOS 16.4, *) { w.isInspectable = true }
        #endif
        w.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(w)
        bottom = w.bottomAnchor.constraint(equalTo: root.bottomAnchor)
        NSLayoutConstraint.activate([
            w.topAnchor.constraint(equalTo: root.topAnchor), w.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            w.trailingAnchor.constraint(equalTo: root.trailingAnchor), bottom,
        ])
        web = w
        view = root
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        if !Brand.intact {
            web.loadHTMLString("<meta name=viewport content='width=device-width'><body style='font:15px -apple-system;padding:40px;color:#c33'>Sinai telah dimodifikasi dan tidak dapat dijalankan. Pasang ulang dari sinerli.com/sinai.</body>", baseURL: nil)
            return
        }
        // Keyboard: perkecil area web agar kolom tulis tetap terlihat.
        NotificationCenter.default.addObserver(self, selector: #selector(keyboard(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(keyboard(_:)), name: UIResponder.keyboardWillHideNotification, object: nil)
        web.load(URLRequest(url: URL(string: "sinai://app/index.html")!))
    }

    @objc private func keyboard(_ n: Notification) {
        guard let end = (n.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue else { return }
        let local = view.convert(end, from: nil)
        let overlap = n.name == UIResponder.keyboardWillHideNotification ? 0 : max(0, view.bounds.maxY - local.minY)
        bottom.constant = -overlap
        let dur = (n.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
        UIView.animate(withDuration: dur) { self.view.layoutIfNeeded() }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { statusStyle }
    var statusStyle: UIStatusBarStyle = .default { didSet { setNeedsStatusBarAppearanceUpdate() } }

    // Tautan keluar dibuka di Safari; aplikasi tidak pernah meninggalkan sinai://app.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else { decisionHandler(.cancel); return }
        let main = action.targetFrame?.isMainFrame ?? true
        if scheme == "sinai" || scheme == "sinai-preview" || scheme == "about" || scheme == "blob" || scheme == "data" {
            decisionHandler(main && scheme != "sinai" ? .cancel : .allow)
            return
        }
        if main || action.navigationType == .linkActivated {
            if ["http", "https", "mailto", "tel"].contains(scheme) { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)   // sumber daya di dalam iframe pratinjau (CDN, gambar)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, ["http", "https", "mailto"].contains(url.scheme?.lowercased() ?? "") { UIApplication.shared.open(url) }
        return nil
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
}

final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ t: WKScriptMessageHandler) { target = t }
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(ucc, didReceive: message)
    }
}
