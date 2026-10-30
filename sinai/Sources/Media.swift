// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Cocoa
import AVFoundation
import Speech
#if canImport(ScreenCaptureKit)
import ScreenCaptureKit
#endif

/// Live dictation: microphone → speech recognition, streaming partial text.
/// On-device recognition is used whenever the language supports it; otherwise
/// the request is restarted every ~50 s (server requests are limited to a minute).
final class Dictation {
    static let shared = Dictation()
    var emit: ((String, [String: Any]) -> Void)?

    private let engine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var committed = ""
    private var partial = ""
    private var running = false
    private var restartTimer: Timer?
    private var lastLevel = Date.distantPast

    var isRunning: Bool { running }

    func start(locale: String, done: @escaping (Result<[String: Any], Error>) -> Void) {
        if running { done(.success(["running": true])); return }
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                done(.failure(BridgeError("Izin Pengenalan Ucapan belum diberikan. Buka System Settings → Privacy & Security → Speech Recognition, lalu aktifkan Sinai."))); return
            }
            AVCaptureDevice.requestAccess(for: .audio) { ok in
                DispatchQueue.main.async {
                    guard ok else { done(.failure(BridgeError("Izin mikrofon ditolak. Buka System Settings → Privacy & Security → Microphone, lalu aktifkan Sinai."))); return }
                    do { done(.success(try self.begin(locale: locale))) } catch { done(.failure(error)) }
                }
            }
        }
    }

    private func begin(locale: String) throws -> [String: Any] {
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: locale)) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US")), rec.isAvailable else {
            throw BridgeError("Pengenalan ucapan tidak tersedia untuk bahasa ini saat ini")
        }
        recognizer = rec
        committed = ""; partial = ""
        let input = engine.inputNode
        let fmt = input.outputFormat(forBus: 0)
        guard fmt.sampleRate > 0, fmt.channelCount > 0 else { throw BridgeError("Mikrofon tidak ditemukan") }
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: fmt) { [weak self] buf, _ in
            guard let self = self else { return }
            self.request?.append(buf)
            if Date().timeIntervalSince(self.lastLevel) > 0.08, let ch = buf.floatChannelData?[0] {
                self.lastLevel = Date()
                var sum: Float = 0
                let n = Int(buf.frameLength)
                for i in 0..<n { sum += ch[i] * ch[i] }
                let rms = n > 0 ? sqrt(sum / Float(n)) : 0
                self.emit?("dictation.level", ["level": Double(min(1, rms * 12))])
            }
        }
        newRequest()
        engine.prepare()
        try engine.start()
        running = true
        if !rec.supportsOnDeviceRecognition {
            restartTimer = Timer.scheduledTimer(withTimeInterval: 50, repeats: true) { [weak self] _ in self?.rollover() }
        }
        return ["running": true, "onDevice": rec.supportsOnDeviceRecognition, "locale": rec.locale.identifier]
    }

    private func newRequest() {
        guard let rec = recognizer else { return }
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        if rec.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
        request = req
        partial = ""
        task = rec.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self else { return }
            if let r = result {
                DispatchQueue.main.async {
                    guard req === self.request else { return }
                    self.partial = r.bestTranscription.formattedString
                    self.emit?("dictation.text", ["text": self.fullText, "final": false])
                }
            }
            if error != nil || (result?.isFinal ?? false) {
                DispatchQueue.main.async {
                    guard req === self.request, self.running else { return }
                    // The recognizer ended this segment (silence / limit): keep going.
                    self.commitPartial()
                    self.newRequest()
                }
            }
        }
    }

    private var fullText: String {
        [committed, partial].filter { !$0.isEmpty }.joined(separator: committed.isEmpty || partial.isEmpty ? "" : " ")
    }

    private func commitPartial() {
        if !partial.isEmpty { committed = fullText; partial = "" }
    }

    private func rollover() {
        guard running else { return }
        request?.endAudio()
        commitPartial()
        newRequest()
    }

    func stop() -> [String: Any] {
        guard running else { return ["text": fullText] }
        running = false
        restartTimer?.invalidate(); restartTimer = nil
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        request?.endAudio()
        let text = fullText
        let t = task
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { t?.cancel() }
        request = nil
        emit?("dictation.text", ["text": text, "final": true])
        return ["text": text]
    }
}

/// Audio, screen and system-audio recordings saved to temporary files the
/// composer then attaches like any other file.
final class Recorder: NSObject {
    static let shared = Recorder()
    var emit: ((String, [String: Any]) -> Void)?

    private final class Session {
        let id: String, kind: String, url: URL
        let started = Date()
        var audio: AVAudioRecorder?
        var process: Process?
        var input: FileHandle?
        var system: AnyObject?
        var timer: Timer?
        init(id: String, kind: String, url: URL) { self.id = id; self.kind = kind; self.url = url }
    }
    private var sessions: [String: Session] = [:]

    static func tempURL(_ ext: String, prefix: String = "rekaman") -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sinai-media", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd 'at' HH.mm.ss"
        return dir.appendingPathComponent("\(prefix) \(f.string(from: Date())).\(ext)")
    }

    func start(kind: String, mic: Bool, done: @escaping (Result<[String: Any], Error>) -> Void) {
        switch kind {
        case "audio":
            AVCaptureDevice.requestAccess(for: .audio) { ok in
                DispatchQueue.main.async {
                    guard ok else { done(.failure(BridgeError("Izin mikrofon ditolak. Aktifkan Sinai di System Settings → Privacy & Security → Microphone."))); return }
                    do { done(.success(try self.startAudio())) } catch { done(.failure(error)) }
                }
            }
        case "screen":
            DispatchQueue.main.async { do { done(.success(try self.startScreen(mic: mic))) } catch { done(.failure(error)) } }
        case "system":
            startSystemAudio(done: done)
        default:
            done(.failure(BridgeError("Jenis rekaman tidak dikenal")))
        }
    }

    private func register(_ s: Session) -> [String: Any] {
        sessions[s.id] = s
        s.timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self, weak s] _ in
            guard let s = s else { return }
            var level = 0.0
            if let a = s.audio { a.updateMeters(); level = Double(max(0, min(1, (a.averagePower(forChannel: 0) + 55) / 55))) }
            self?.emit?("record.tick", ["id": s.id, "seconds": Date().timeIntervalSince(s.started), "level": level])
        }
        return ["id": s.id, "kind": s.kind]
    }

    private func startAudio() throws -> [String: Any] {
        let url = Recorder.tempURL("m4a")
        let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1,
                                       AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue]
        let rec = try AVAudioRecorder(url: url, settings: settings)
        rec.isMeteringEnabled = true
        guard rec.record() else { throw BridgeError("Perekaman audio gagal dimulai") }
        let s = Session(id: UUID().uuidString, kind: "audio", url: url)
        s.audio = rec
        return register(s)
    }

    /// Full-screen recording through the system `screencapture` tool. macOS asks
    /// for Screen Recording permission the first time.
    private func startScreen(mic: Bool) throws -> [String: Any] {
        let url = Recorder.tempURL("mov", prefix: "rekaman layar")
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        p.arguments = ["-v", "-x", "-k", "-V", "3600"] + (mic ? ["-g"] : []) + [url.path]
        let inPipe = Pipe()
        p.standardInput = inPipe
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        try p.run()
        let s = Session(id: UUID().uuidString, kind: "screen", url: url)
        s.process = p
        s.input = inPipe.fileHandleForWriting
        return register(s)
    }

    private func startSystemAudio(done: @escaping (Result<[String: Any], Error>) -> Void) {
        #if canImport(ScreenCaptureKit)
        if #available(macOS 13.0, *) {
            let url = Recorder.tempURL("m4a", prefix: "audio sistem")
            let cap = SystemAudioCapture(url: url)
            cap.start { err in
                DispatchQueue.main.async {
                    if let e = err { done(.failure(e)); return }
                    let s = Session(id: UUID().uuidString, kind: "system", url: url)
                    s.system = cap
                    done(.success(self.register(s)))
                }
            }
            return
        }
        #endif
        done(.failure(BridgeError("Merekam audio sistem membutuhkan macOS 13 Ventura atau lebih baru.")))
    }

    func stop(id: String, cancel: Bool, done: @escaping (Result<[String: Any]?, Error>) -> Void) {
        guard let s = sessions.removeValue(forKey: id) else { done(.success(nil)); return }
        s.timer?.invalidate()
        let finish: () -> Void = {
            let duration = Date().timeIntervalSince(s.started)
            if cancel { try? FileManager.default.removeItem(at: s.url); done(.success(nil)); return }
            guard FileManager.default.fileExists(atPath: s.url.path) else {
                done(.failure(BridgeError(s.kind == "screen" ? "Rekaman layar tidak tersimpan. Pastikan Sinai diizinkan di System Settings → Privacy & Security → Screen Recording." : "Rekaman tidak tersimpan")))
                return
            }
            done(.success(["path": s.url.path, "duration": duration, "kind": s.kind]))
        }
        if let a = s.audio { a.stop(); finish(); return }
        if let p = s.process {
            if p.isRunning {
                s.input?.write(Data("q\n".utf8))
                DispatchQueue.global().async {
                    let deadline = Date().addingTimeInterval(8)
                    while p.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.1) }
                    if p.isRunning { p.interrupt() }
                    Thread.sleep(forTimeInterval: 0.6)
                    DispatchQueue.main.async(execute: finish)
                }
            } else { finish() }
            return
        }
        #if canImport(ScreenCaptureKit)
        if #available(macOS 13.0, *), let cap = s.system as? SystemAudioCapture {
            cap.stop { DispatchQueue.main.async(execute: finish) }
            return
        }
        #endif
        finish()
    }

    func stopAll() {
        for id in Array(sessions.keys) { stop(id: id, cancel: true) { _ in } }
    }

    // MARK: still screenshots

    /// mode: "interactive" (selection or window, like ⇧⌘4), "window", "screen".
    static func screenshot(mode: String, done: @escaping (Result<String?, Error>) -> Void) {
        let url = tempURL("png", prefix: "tangkapan layar")
        var args = ["-x"]
        switch mode {
        case "window": args += ["-i", "-w", "-o"]
        case "screen": args += ["-m"]
        default: args += ["-i"]
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let r = runSync("/usr/sbin/screencapture", args + [url.path], timeout: 600)
            DispatchQueue.main.async {
                if FileManager.default.fileExists(atPath: url.path) { done(.success(url.path)) }
                else if r.code != 0 && !r.err.isEmpty { done(.failure(BridgeError("Tangkapan layar gagal: \(r.err.prefix(200))"))) }
                else { done(.success(nil)) } // cancelled with Esc
            }
        }
    }
}

#if canImport(ScreenCaptureKit)
/// Records what the Mac is playing (a meeting, a stream) via ScreenCaptureKit.
@available(macOS 13.0, *)
final class SystemAudioCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    private let url: URL
    private var stream: SCStream?
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var started = false
    private let queue = DispatchQueue(label: "sinai.systemaudio")

    init(url: URL) { self.url = url }

    func start(_ done: @escaping (Error?) -> Void) {
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { content, error in
            guard let display = content?.displays.first else {
                done(BridgeError("Izin Screen Recording diperlukan untuk merekam audio sistem. Aktifkan Sinai di System Settings → Privacy & Security → Screen Recording, lalu buka ulang Sinai." + (error.map { " (\($0.localizedDescription))" } ?? "")))
                return
            }
            let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
            let cfg = SCStreamConfiguration()
            cfg.capturesAudio = true
            cfg.excludesCurrentProcessAudio = true
            cfg.sampleRate = 48000
            cfg.channelCount = 2
            cfg.width = 2
            cfg.height = 2
            cfg.minimumFrameInterval = CMTime(value: 1, timescale: 1)
            do {
                let w = try AVAssetWriter(outputURL: self.url, fileType: .m4a)
                let inp = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                    AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48000, AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 128000])
                inp.expectsMediaDataInRealTime = true
                w.add(inp)
                self.writer = w; self.input = inp
                let s = SCStream(filter: filter, configuration: cfg, delegate: self)
                try s.addStreamOutput(self, type: .audio, sampleHandlerQueue: self.queue)
                self.stream = s
                s.startCapture { err in done(err) }
            } catch { done(error) }
        }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, sb.isValid, let w = writer, let inp = input else { return }
        if !started {
            guard w.startWriting() else { return }
            w.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(sb))
            started = true
        }
        if inp.isReadyForMoreMediaData { inp.append(sb) }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {}

    func stop(_ done: @escaping () -> Void) {
        let finish = {
            self.queue.async {
                guard let w = self.writer, self.started else { done(); return }
                self.input?.markAsFinished()
                w.finishWriting { done() }
            }
        }
        if let s = stream { s.stopCapture { _ in finish() } } else { finish() }
    }
}
#endif

/// A small camera window with live preview: take a photo or record a clip.
final class CameraPanel: NSObject, NSWindowDelegate, AVCapturePhotoCaptureDelegate, AVCaptureFileOutputRecordingDelegate {
    private static var current: CameraPanel?
    private let window: NSPanel
    private let session = AVCaptureSession()
    private let photoOut = AVCapturePhotoOutput()
    private let movieOut = AVCaptureMovieFileOutput()
    private var done: ((Result<String?, Error>) -> Void)?
    private let shutter = NSButton(title: "Ambil foto", target: nil, action: nil)
    private let recordBtn = NSButton(title: "Rekam video", target: nil, action: nil)
    private let status = NSTextField(labelWithString: "")
    private var tick: Timer?

    static func open(parent: NSWindow?, done: @escaping (Result<String?, Error>) -> Void) {
        if let c = current { c.window.makeKeyAndOrderFront(nil); done(.failure(BridgeError("Jendela kamera sudah terbuka"))); return }
        AVCaptureDevice.requestAccess(for: .video) { ok in
            DispatchQueue.main.async {
                guard ok else { done(.failure(BridgeError("Izin kamera ditolak. Aktifkan Sinai di System Settings → Privacy & Security → Camera."))); return }
                guard AVCaptureDevice.default(for: .video) != nil else { done(.failure(BridgeError("Kamera tidak ditemukan"))); return }
                let c = CameraPanel(done: done)
                current = c
                c.show(parent: parent)
            }
        }
    }

    private init(done: @escaping (Result<String?, Error>) -> Void) {
        self.done = done
        window = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 640, height: 520), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        super.init()
        window.title = "Kamera — Sinai"
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.minSize = NSSize(width: 420, height: 380)
    }

    private func show(parent: NSWindow?) {
        session.beginConfiguration()
        session.sessionPreset = .high
        if let cam = AVCaptureDevice.default(for: .video), let inp = try? AVCaptureDeviceInput(device: cam), session.canAddInput(inp) { session.addInput(inp) }
        if let mic = AVCaptureDevice.default(for: .audio), let inp = try? AVCaptureDeviceInput(device: mic), session.canAddInput(inp) { session.addInput(inp) }
        if session.canAddOutput(photoOut) { session.addOutput(photoOut) }
        if session.canAddOutput(movieOut) { session.addOutput(movieOut) }
        session.commitConfiguration()

        let content = NSView(frame: window.contentRect(forFrameRect: window.frame))
        content.wantsLayer = true
        content.layer?.backgroundColor = NSColor.black.cgColor
        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspect
        preview.frame = content.bounds.insetBy(dx: 0, dy: 26).offsetBy(dx: 0, dy: 26)
        preview.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]
        content.layer?.addSublayer(preview)
        shutter.target = self; shutter.action = #selector(takePhoto)
        shutter.bezelStyle = .rounded; shutter.keyEquivalent = "\r"
        recordBtn.target = self; recordBtn.action = #selector(toggleRecord)
        recordBtn.bezelStyle = .rounded
        let cancel = NSButton(title: "Batal", target: self, action: #selector(cancelPanel))
        cancel.bezelStyle = .rounded; cancel.keyEquivalent = "\u{1b}"
        status.textColor = .white
        let bar = NSStackView(views: [status, NSView(), cancel, recordBtn, shutter])
        bar.orientation = .horizontal
        bar.edgeInsets = NSEdgeInsets(top: 8, left: 12, bottom: 8, right: 12)
        bar.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(bar)
        NSLayoutConstraint.activate([bar.leadingAnchor.constraint(equalTo: content.leadingAnchor), bar.trailingAnchor.constraint(equalTo: content.trailingAnchor),
                                     bar.bottomAnchor.constraint(equalTo: content.bottomAnchor)])
        window.contentView = content
        if let p = parent { let f = p.frame; window.setFrameOrigin(NSPoint(x: f.midX - 320, y: f.midY - 260)) } else { window.center() }
        window.makeKeyAndOrderFront(nil)
        DispatchQueue.global(qos: .userInitiated).async { self.session.startRunning() }
    }

    @objc private func takePhoto() {
        guard !movieOut.isRecording else { return }
        shutter.isEnabled = false
        photoOut.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        DispatchQueue.main.async {
            guard error == nil, let data = photo.fileDataRepresentation() else { self.finish(.failure(error ?? BridgeError("Foto gagal diambil"))); return }
            let url = Recorder.tempURL("jpg", prefix: "foto kamera")
            var out = data
            if let img = NSImage(data: data), let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
               let jpg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.9]) { out = jpg }
            do { try out.write(to: url); self.finish(.success(url.path)) } catch { self.finish(.failure(error)) }
        }
    }

    @objc private func toggleRecord() {
        if movieOut.isRecording { movieOut.stopRecording(); recordBtn.isEnabled = false; return }
        let url = Recorder.tempURL("mov", prefix: "video kamera")
        movieOut.startRecording(to: url, recordingDelegate: self)
        recordBtn.title = "Selesai"
        shutter.isEnabled = false
        let start = Date()
        tick = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            let s = Int(Date().timeIntervalSince(start))
            self?.status.stringValue = String(format: "● %02d:%02d", s / 60, s % 60)
        }
    }

    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo url: URL, from connections: [AVCaptureConnection], error: Error?) {
        DispatchQueue.main.async {
            let ok = FileManager.default.fileExists(atPath: url.path)
            self.finish(ok ? .success(url.path) : .failure(error ?? BridgeError("Video gagal direkam")))
        }
    }

    @objc private func cancelPanel() {
        if movieOut.isRecording { movieOut.stopRecording(); done = nil }
        finish(.success(nil))
    }

    private func finish(_ r: Result<String?, Error>) {
        tick?.invalidate()
        let d = done
        done = nil
        window.orderOut(nil)
        DispatchQueue.global().async { self.session.stopRunning() }
        CameraPanel.current = nil
        d?(r)
    }

    func windowWillClose(_ notification: Notification) {
        if done != nil { finish(.success(nil)) }
    }
}
