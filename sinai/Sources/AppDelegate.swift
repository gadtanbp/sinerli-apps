// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Cocoa
import Quartz

final class AppDelegate: NSObject, NSApplicationDelegate, QLPreviewPanelDataSource {
    var main: MainWindowController!
    private var quickLookURLs: [URL] = []

    // MARK: Quick Look (true rendering of PPTX/DOCX/XLSX/PDF/MP4 by macOS)

    func quickLook(_ paths: [String]) {
        quickLookURLs = paths.map { URL(fileURLWithPath: Paths.expand($0)) }.filter { FileManager.default.fileExists(atPath: $0.path) }
        guard !quickLookURLs.isEmpty, let panel = QLPreviewPanel.shared() else { return }
        if QLPreviewPanel.sharedPreviewPanelExists() && panel.isVisible { panel.reloadData() }
        else { panel.makeKeyAndOrderFront(nil) }
    }

    override func acceptsPreviewPanelControl(_ panel: QLPreviewPanel!) -> Bool { true }
    override func beginPreviewPanelControl(_ panel: QLPreviewPanel!) { panel.dataSource = self; panel.reloadData() }
    override func endPreviewPanelControl(_ panel: QLPreviewPanel!) { panel.dataSource = nil }
    func numberOfPreviewItems(in panel: QLPreviewPanel!) -> Int { quickLookURLs.count }
    func previewPanel(_ panel: QLPreviewPanel!, previewItemAt index: Int) -> QLPreviewItem! { quickLookURLs[index] as NSURL }

    private var pendingOpen: [String] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        Integrity.enforce()
        Env.shared.resolveLoginPath()
        NSApp.mainMenu = buildMenu()
        NSApp.servicesProvider = self
        main = MainWindowController()
        main.showWindow(nil)
        main.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if !pendingOpen.isEmpty {
            let paths = pendingOpen; pendingOpen = []
            main.deliverOpenFiles(paths)
        }
        #if DEBUG
        DebugServer.startIfRequested(controller: main)
        #endif
    }

    // MARK: Finder "Open with Sinai" / drag onto the Dock icon

    func application(_ sender: NSApplication, openFiles filenames: [String]) {
        openPaths(filenames)
        sender.reply(toOpenOrPrint: .success)
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        openPaths(urls.filter { $0.isFileURL }.map { $0.path })
    }

    private func openPaths(_ paths: [String]) {
        guard !paths.isEmpty else { return }
        if main == nil { pendingOpen += paths; return }
        if main.window?.isVisible != true { main.showWindow(nil) }
        NSApp.activate(ignoringOtherApps: true)
        main.deliverOpenFiles(paths)
    }

    // MARK: Services menu ("Kirim ke Sinai" / "Tanyakan ke Sinai")

    @objc func sinaiHandleFiles(_ pboard: NSPasteboard, userData: String?, error: AutoreleasingUnsafeMutablePointer<NSString>) {
        let urls = pboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
        openPaths(urls.map { $0.path })
    }

    @objc func sinaiHandleText(_ pboard: NSPasteboard, userData: String?, error: AutoreleasingUnsafeMutablePointer<NSString>) {
        guard let text = pboard.string(forType: .string), !text.isEmpty else { return }
        if main.window?.isVisible != true { main.showWindow(nil) }
        NSApp.activate(ignoringOtherApps: true)
        main.bridge.emit("text.shared", ["text": text])
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { main.showWindow(nil) }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        ShellRunner.shared.killAll()
        MCPHost.shared.stopAll()
        Recorder.shared.stopAll()
        WatchFolders.shared.stopAll()
        WebhookServer.shared.stop()
        NetExtra.shared.closeAll()
    }

    @objc func menuAction(_ sender: NSMenuItem) {
        guard let action = sender.representedObject as? String else { return }
        if main.window?.isVisible != true { main.showWindow(nil) }
        main.send(menuAction: action)
    }

    @objc func showAbout(_ sender: Any?) {
        let credits = NSMutableAttributedString(string: "AI Chat & Coding Agent untuk macOS\n", attributes: [
            .font: NSFont.systemFont(ofSize: 11), .foregroundColor: NSColor.secondaryLabelColor])
        credits.append(NSAttributedString(string: Brand.label, attributes: [
            .font: NSFont.systemFont(ofSize: 11, weight: .semibold), .foregroundColor: NSColor.labelColor]))
        let para = NSMutableParagraphStyle()
        para.alignment = .center
        credits.addAttribute(.paragraphStyle, value: para, range: NSRange(location: 0, length: credits.length))
        NSApp.orderFrontStandardAboutPanel(options: [.credits: credits, .applicationName: "Sinai"])
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc func showMainWindow(_ sender: Any?) {
        main.showWindow(nil)
    }

    private func item(_ title: String, _ action: String, _ key: String = "", _ mods: NSEvent.ModifierFlags = [.command]) -> NSMenuItem {
        let it = NSMenuItem(title: title, action: #selector(menuAction(_:)), keyEquivalent: key)
        it.keyEquivalentModifierMask = mods
        it.representedObject = action
        it.target = self
        return it
    }

    private func buildMenu() -> NSMenu {
        let bar = NSMenu()

        let appItem = NSMenuItem(); bar.addItem(appItem)
        let appMenu = NSMenu(title: "Sinai")
        let about = NSMenuItem(title: "Tentang Sinai", action: #selector(showAbout(_:)), keyEquivalent: "")
        about.target = self
        appMenu.addItem(about)
        appMenu.addItem(.separator())
        appMenu.addItem(item("Pengaturan…", "settings", ","))
        appMenu.addItem(.separator())
        let services = NSMenuItem(title: "Services", action: nil, keyEquivalent: "")
        services.submenu = NSMenu(); NSApp.servicesMenu = services.submenu
        appMenu.addItem(services)
        appMenu.addItem(.separator())
        appMenu.addItem(NSMenuItem(title: "Sembunyikan Sinai", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h"))
        let hideOthers = NSMenuItem(title: "Sembunyikan Lainnya", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthers)
        appMenu.addItem(NSMenuItem(title: "Tampilkan Semua", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: ""))
        appMenu.addItem(.separator())
        appMenu.addItem(NSMenuItem(title: "Keluar dari Sinai", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        appItem.submenu = appMenu

        let fileItem = NSMenuItem(); bar.addItem(fileItem)
        let file = NSMenu(title: "File")
        file.addItem(item("Chat Baru", "newChat", "n"))
        file.addItem(item("Sesi Coding Baru", "newCode", "n", [.command, .shift]))
        file.addItem(item("Desain Baru", "newDesign", "n", [.command, .option]))
        file.addItem(item("Buka Folder Proyek…", "openFolder", "o"))
        file.addItem(.separator())
        file.addItem(item("Ekspor Percakapan…", "export", "e", [.command, .shift]))
        file.addItem(.separator())
        file.addItem(NSMenuItem(title: "Tutup Jendela", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w"))
        fileItem.submenu = file

        let editItem = NSMenuItem(); bar.addItem(editItem)
        let edit = NSMenu(title: "Edit")
        edit.addItem(NSMenuItem(title: "Undo", action: Selector(("undo:")), keyEquivalent: "z"))
        let redo = NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(redo)
        edit.addItem(.separator())
        edit.addItem(NSMenuItem(title: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        edit.addItem(NSMenuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        edit.addItem(NSMenuItem(title: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        edit.addItem(NSMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        edit.addItem(.separator())
        edit.addItem(item("Cari Percakapan", "search", "k"))
        editItem.submenu = edit

        let viewItem = NSMenuItem(); bar.addItem(viewItem)
        let view = NSMenu(title: "Tampilan")
        view.addItem(item("Tampilkan/Sembunyikan Sidebar", "toggleSidebar", "\\"))
        view.addItem(item("Tampilkan/Sembunyikan Panel", "togglePanel", "b", [.command, .option]))
        view.addItem(item("Pilih Model…", "modelPicker", "m", [.command, .shift]))
        view.addItem(.separator())
        view.addItem(item("Perbesar Teks", "zoomIn", "="))
        view.addItem(item("Perkecil Teks", "zoomOut", "-"))
        view.addItem(item("Ukuran Teks Normal", "zoomReset", "0"))
        view.addItem(.separator())
        let fs = NSMenuItem(title: "Layar Penuh", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fs.keyEquivalentModifierMask = [.command, .control]
        view.addItem(fs)
        viewItem.submenu = view

        let winItem = NSMenuItem(); bar.addItem(winItem)
        let win = NSMenu(title: "Window")
        win.addItem(NSMenuItem(title: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"))
        win.addItem(NSMenuItem(title: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: ""))
        win.addItem(.separator())
        let showMain = NSMenuItem(title: "Sinai", action: #selector(showMainWindow(_:)), keyEquivalent: "0")
        showMain.target = self
        win.addItem(showMain)
        winItem.submenu = win
        NSApp.windowsMenu = win

        let helpItem = NSMenuItem(); bar.addItem(helpItem)
        let help = NSMenu(title: "Help")
        help.addItem(item("Pintasan Keyboard", "shortcuts", "/"))
        helpItem.submenu = help
        NSApp.helpMenu = help

        return bar
    }
}
