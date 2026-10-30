// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Cocoa
import WebKit
import PDFKit
import AVFoundation

/// Real files the AI produces on request (documents, decks, videos), written
/// into the Sinai output folder and then shown in the canvas.
enum Outputs {
    static func destination(_ raw: Any?) throws -> URL {
        guard let s = raw as? String, !s.isEmpty else { throw BridgeError("outPath wajib diisi") }
        let path = Paths.expand(s)
        try FileOps.guardWritable(path)
        let url = URL(fileURLWithPath: path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        return url
    }
}

// MARK: - HTML → paginated PDF

/// Renders HTML off-screen and prints it to a PDF file with real page breaks
/// (A4/Letter). If printing yields nothing usable, the rendered page is sliced
/// into pages instead, so a PDF is always produced.
final class HTMLToPDF: NSObject, WKNavigationDelegate {
    private static var active: [HTMLToPDF] = []
    private let window: NSWindow
    private let webView: WKWebView
    private let out: URL
    private let paper: NSSize
    private let margin: CGFloat
    private let done: (Result<String, Error>) -> Void
    private var finished = false

    static func make(_ p: [String: Any], done: @escaping (Result<String, Error>) -> Void) {
        do {
            let out = try Outputs.destination(p["outPath"])
            let landscape = (p["landscape"] as? Bool) ?? false
            var paper = (p["paper"] as? String ?? "a4").lowercased() == "letter" ? NSSize(width: 612, height: 792) : NSSize(width: 595, height: 842)
            if landscape { paper = NSSize(width: paper.height, height: paper.width) }
            let job = HTMLToPDF(html: p["html"] as? String ?? "", out: out, paper: paper,
                                margin: CGFloat((p["margin"] as? Double) ?? 40), done: done)
            active.append(job)
        } catch { done(.failure(error)) }
    }

    private init(html: String, out: URL, paper: NSSize, margin: CGFloat, done: @escaping (Result<String, Error>) -> Void) {
        self.out = out; self.paper = paper; self.margin = margin; self.done = done
        let width = paper.width - 2 * margin
        let frame = NSRect(x: 0, y: 0, width: width, height: paper.height)
        window = NSWindow(contentRect: NSRect(x: -30000, y: -30000, width: width, height: paper.height), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        webView = WKWebView(frame: frame, configuration: PreviewSchemeHandler.configuration())
        super.init()
        window.contentView = webView
        window.orderBack(nil)
        webView.navigationDelegate = self
        let key = "pdf-" + UUID().uuidString
        PreviewStore.put(key, html)
        webView.load(URLRequest(url: URL(string: "sinai-preview://p/\(key)")!))
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) { [weak self] in self?.finish(.failure(BridgeError("Waktu habis saat membuat PDF"))) }
    }

    private func finish(_ r: Result<String, Error>) {
        guard !finished else { return }
        finished = true
        window.orderOut(nil)
        HTMLToPDF.active.removeAll { $0 === self }
        done(r)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(.failure(error)) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(.failure(error)) }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Let scripts (marked, mermaid, fonts) settle before printing.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { self.render() }
    }

    private func render() {
        if #available(macOS 11.0, *) {
            try? FileManager.default.removeItem(at: out)
            let info = NSPrintInfo(dictionary: [.jobDisposition: NSPrintInfo.JobDisposition.save, .jobSavingURL: out])
            info.paperSize = paper
            info.topMargin = margin; info.bottomMargin = margin; info.leftMargin = margin; info.rightMargin = margin
            info.horizontalPagination = .fit
            info.verticalPagination = .automatic
            info.isHorizontallyCentered = false
            info.isVerticallyCentered = false
            let op = webView.printOperation(with: info)
            op.showsPrintPanel = false
            op.showsProgressPanel = false
            op.view?.frame = webView.bounds
            op.runModal(for: window, delegate: self, didRun: #selector(printed(_:success:contextInfo:)), contextInfo: nil)
        } else {
            sliceFallback()
        }
    }

    @objc private func printed(_ op: NSPrintOperation, success: Bool, contextInfo: UnsafeMutableRawPointer?) {
        if success, let doc = PDFDocument(url: out), doc.pageCount > 0, !(doc.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || pageHasInk(doc) {
            finish(.success(out.path))
        } else {
            sliceFallback()
        }
    }

    /// A page with images but no text (e.g. a chart) still counts as content.
    private func pageHasInk(_ doc: PDFDocument) -> Bool {
        guard let page = doc.page(at: 0) else { return false }
        let img = page.thumbnail(of: NSSize(width: 120, height: 170), for: .mediaBox)
        guard let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return false }
        var dark = 0
        for x in stride(from: 0, to: rep.pixelsWide, by: 3) {
            for y in stride(from: 0, to: rep.pixelsHigh, by: 3) {
                if let c = rep.colorAt(x: x, y: y), c.brightnessComponent < 0.9 { dark += 1 }
            }
        }
        return dark > 3
    }

    /// Fallback: one tall page from the rendered web view, cut into paper-sized pages.
    private func sliceFallback() {
        let produce: (Data?) -> Void = { data in
            guard let data = data, let single = PDFDocument(data: data)?.page(at: 0) else {
                self.finish(.failure(BridgeError("PDF gagal dibuat"))); return
            }
            let out = HTMLToPDF.slice(single, paper: self.paper, margin: self.margin)
            do { try out.write(to: self.out, options: .atomic); self.finish(.success(self.out.path)) } catch { self.finish(.failure(error)) }
        }
        webView.evaluateJavaScript("Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)") { v, _ in
            let h = CGFloat((v as? NSNumber)?.doubleValue ?? Double(self.paper.height))
            self.webView.frame.size.height = min(max(h, 100), 60000)
            if #available(macOS 11.0, *) {
                self.webView.createPDF(configuration: WKPDFConfiguration()) { r in
                    if case .success(let d) = r { produce(d) } else { produce(nil) }
                }
            } else {
                self.webView.takeSnapshot(with: nil) { img, _ in
                    guard let img = img, let page = PDFPage(image: img) else { produce(nil); return }
                    let d = PDFDocument(); d.insert(page, at: 0)
                    produce(d.dataRepresentation())
                }
            }
        }
    }

    static func slice(_ single: PDFPage, paper: NSSize, margin: CGFloat) -> Data {
        let src = single.bounds(for: .mediaBox)
        let contentW = paper.width - 2 * margin, contentH = paper.height - 2 * margin
        let scale = contentW / max(src.width, 1)
        let perPage = contentH / scale
        let count = max(1, Int(ceil(src.height / perPage)))
        let data = NSMutableData()
        var box = CGRect(origin: .zero, size: paper)
        guard let consumer = CGDataConsumer(data: data as CFMutableData), let ctx = CGContext(consumer: consumer, mediaBox: &box, nil) else { return Data() }
        for i in 0..<count {
            ctx.beginPDFPage(nil)
            ctx.saveGState()
            ctx.clip(to: CGRect(x: margin, y: margin, width: contentW, height: contentH))
            ctx.translateBy(x: margin, y: margin)
            ctx.scaleBy(x: scale, y: scale)
            ctx.translateBy(x: -src.minX, y: -(src.maxY - CGFloat(i + 1) * perPage))
            single.draw(with: .mediaBox, to: ctx)
            ctx.restoreGState()
            ctx.endPDFPage()
        }
        ctx.closePDF()
        return data as Data
    }
}

// MARK: - Images → MP4 video (with fades and optional narration)

enum VideoMaker {
    /// frames: [{path, duration, y?, h?}] — y/h crop a strip out of a tall image.
    /// narration: per-scene text spoken with a macOS system voice; a scene lasts
    /// at least as long as its narration.
    static func make(_ p: [String: Any], progress: @escaping (Double) -> Void, done: @escaping (Result<[String: Any], Error>) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            do { done(.success(try build(p, progress: progress))) } catch { done(.failure(error)) }
        }
    }

    private static func build(_ p: [String: Any], progress: (Double) -> Void) throws -> [String: Any] {
        let out = try Outputs.destination(p["outPath"])
        let width = max(320, min((p["width"] as? Int) ?? 1280, 3840)) & ~1
        let height = max(240, min((p["height"] as? Int) ?? 720, 2160)) & ~1
        let fps = max(10, min((p["fps"] as? Int) ?? 30, 60))
        let fade = max(0, min((p["fade"] as? Double) ?? 0.6, 2))
        let frames = p["frames"] as? [[String: Any]] ?? []
        guard !frames.isEmpty, frames.count <= 120 else { throw BridgeError("Video perlu 1–120 adegan") }

        // Load scene images (cropping strips of a tall render when requested).
        var cache: [String: CGImage] = [:]
        var scenes: [(CGImage, Double)] = []
        for f in frames {
            guard let path = f["path"] as? String else { continue }
            let full: CGImage
            if let c = cache[path] { full = c } else {
                guard let img = Ingest.decodeAnyImage(URL(fileURLWithPath: Paths.expand(path))) else { throw BridgeError("Gambar adegan tidak terbaca") }
                cache[path] = img; full = img
            }
            var img = full
            if let y = f["y"] as? Double, let h = f["h"] as? Double, let baseW = f["baseWidth"] as? Double, baseW > 0 {
                let k = Double(full.width) / baseW
                let rect = CGRect(x: 0, y: (y * k).rounded(), width: Double(full.width), height: (h * k).rounded())
                if let c = full.cropping(to: rect) { img = c }
            }
            scenes.append((img, max(0.5, min((f["duration"] as? Double) ?? 4, 120))))
        }
        guard !scenes.isEmpty else { throw BridgeError("Tidak ada adegan untuk video") }

        // Optional narration.
        let narration = p["narration"] as? [String] ?? []
        let lang = p["voice"] as? String ?? "id-ID"
        var audio: [URL?] = Array(repeating: nil, count: scenes.count)
        let tmpDir = FileManager.default.temporaryDirectory.appendingPathComponent("sinai-video-\(UUID().uuidString.prefix(8))", isDirectory: true)
        try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tmpDir) }
        if !narration.isEmpty {
            if #available(macOS 10.15, *) {
                for i in 0..<scenes.count where i < narration.count {
                    let text = narration[i].trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !text.isEmpty else { continue }
                    let url = tmpDir.appendingPathComponent("n\(i).caf")
                    if let secs = speak(text, lang: lang, to: url) {
                        audio[i] = url
                        scenes[i].1 = max(scenes[i].1, secs + 0.8)
                    }
                    progress(0.25 * Double(i + 1) / Double(scenes.count))
                }
            }
        }

        // Write the picture track.
        let videoURL = audio.contains(where: { $0 != nil }) ? tmpDir.appendingPathComponent("v.mp4") : out
        try? FileManager.default.removeItem(at: videoURL)
        let writer = try AVAssetWriter(outputURL: videoURL, fileType: .mp4)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: width * height * 4],
        ])
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height])
        guard writer.canAdd(input) else { throw BridgeError("Encoder video tidak tersedia") }
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? BridgeError("Video gagal dimulai") }
        writer.startSession(atSourceTime: .zero)

        let totalFrames = scenes.reduce(0) { $0 + Int(($1.1 * Double(fps)).rounded()) }
        var frameIndex: Int64 = 0
        var starts: [Double] = []
        var previous: CGImage? = nil
        for (i, scene) in scenes.enumerated() {
            starts.append(Double(frameIndex) / Double(fps))
            let n = max(1, Int((scene.1 * Double(fps)).rounded()))
            let fadeFrames = previous == nil ? 0 : min(n / 2, Int(fade * Double(fps)))
            guard let still = pixelBuffer(adaptor, width, height, [(scene.0, 1)]) else { throw BridgeError("Gagal menyiapkan bingkai video") }
            for k in 0..<n {
                var buf = still
                if k < fadeFrames, let prev = previous {
                    let a = CGFloat(k + 1) / CGFloat(fadeFrames + 1)
                    if let b = pixelBuffer(adaptor, width, height, [(prev, 1), (scene.0, a)]) { buf = b }
                }
                while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
                if !adaptor.append(buf, withPresentationTime: CMTime(value: frameIndex, timescale: CMTimeScale(fps))) {
                    throw writer.error ?? BridgeError("Gagal menulis bingkai video")
                }
                frameIndex += 1
                if frameIndex % 15 == 0 { progress(0.25 + 0.6 * Double(frameIndex) / Double(max(totalFrames, 1))) }
            }
            previous = scene.0
            _ = i
        }
        input.markAsFinished()
        let sem = DispatchSemaphore(value: 0)
        writer.finishWriting { sem.signal() }
        sem.wait()
        guard writer.status == .completed else { throw writer.error ?? BridgeError("Video gagal disimpan") }

        // Mix narration in.
        if videoURL != out {
            let comp = AVMutableComposition()
            let vAsset = AVURLAsset(url: videoURL)
            guard let vSrc = vAsset.tracks(withMediaType: .video).first,
                  let vTrack = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
                  let aTrack = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
                throw BridgeError("Gagal menggabungkan narasi")
            }
            try vTrack.insertTimeRange(CMTimeRange(start: .zero, duration: vAsset.duration), of: vSrc, at: .zero)
            for (i, a) in audio.enumerated() {
                guard let a = a else { continue }
                let asset = AVURLAsset(url: a)
                guard let src = asset.tracks(withMediaType: .audio).first else { continue }
                try? aTrack.insertTimeRange(CMTimeRange(start: .zero, duration: asset.duration), of: src, at: CMTime(seconds: starts[i] + 0.3, preferredTimescale: 600))
            }
            try? FileManager.default.removeItem(at: out)
            guard let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality) else { throw BridgeError("Ekspor video tidak tersedia") }
            ex.outputURL = out
            ex.outputFileType = .mp4
            let s2 = DispatchSemaphore(value: 0)
            ex.exportAsynchronously { s2.signal() }
            s2.wait()
            guard ex.status == .completed else { throw ex.error ?? BridgeError("Gagal menyimpan video bernarasi") }
        }
        progress(1)
        let duration = Double(frameIndex) / Double(fps)
        return ["path": out.path, "duration": duration, "scenes": scenes.count, "narrated": audio.contains(where: { $0 != nil })]
    }

    /// Draws one or more images (with opacity) aspect-fit on black.
    private static func pixelBuffer(_ adaptor: AVAssetWriterInputPixelBufferAdaptor, _ w: Int, _ h: Int, _ layers: [(CGImage, CGFloat)]) -> CVPixelBuffer? {
        var pb: CVPixelBuffer?
        if let pool = adaptor.pixelBufferPool { CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb) }
        if pb == nil { CVPixelBufferCreate(nil, w, h, kCVPixelFormatType_32ARGB, nil, &pb) }
        guard let buf = pb else { return nil }
        CVPixelBufferLockBaseAddress(buf, [])
        defer { CVPixelBufferUnlockBaseAddress(buf, []) }
        guard let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: w, height: h, bitsPerComponent: 8,
                                  bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue) else { return nil }
        ctx.setFillColor(NSColor.black.cgColor)
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        ctx.interpolationQuality = .high
        for (img, alpha) in layers {
            let s = min(Double(w) / Double(img.width), Double(h) / Double(img.height))
            let dw = Double(img.width) * s, dh = Double(img.height) * s
            ctx.setAlpha(alpha)
            ctx.draw(img, in: CGRect(x: (Double(w) - dw) / 2, y: (Double(h) - dh) / 2, width: dw, height: dh))
        }
        return buf
    }

    /// Speaks text to an audio file with a system voice; returns its length.
    @available(macOS 10.15, *)
    private static func speak(_ text: String, lang: String, to url: URL) -> Double? {
        let synth = AVSpeechSynthesizer()
        let utt = AVSpeechUtterance(string: text)
        utt.voice = AVSpeechSynthesisVoice(language: lang) ?? AVSpeechSynthesisVoice(language: "en-US")
        var file: AVAudioFile?
        var frames: AVAudioFramePosition = 0
        var rate = 22050.0
        let sem = DispatchSemaphore(value: 0)
        var ended = false
        synth.write(utt) { buffer in
            guard let pcm = buffer as? AVAudioPCMBuffer else { return }
            if pcm.frameLength == 0 { if !ended { ended = true; sem.signal() }; return }
            if file == nil {
                rate = pcm.format.sampleRate
                file = try? AVAudioFile(forWriting: url, settings: pcm.format.settings, commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved)
            }
            try? file?.write(from: pcm)
            frames += AVAudioFramePosition(pcm.frameLength)
        }
        _ = sem.wait(timeout: .now() + 90)
        file = nil
        _ = synth
        return frames > 0 ? Double(frames) / rate : nil
    }
}
