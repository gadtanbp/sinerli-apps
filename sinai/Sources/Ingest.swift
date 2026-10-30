// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Cocoa
import PDFKit
import Vision
import AVFoundation
import Speech
import ImageIO

/// Reading every kind of file the user may attach: images in any format macOS
/// can decode (HEIC, TIFF, PSD, WebP…), PDFs (text, page images, OCR for scans),
/// zip-based documents, audio/video (metadata, key frames, transcription).
enum Ingest {
    // MARK: helpers

    static func url(_ p: [String: Any]) throws -> URL {
        guard let raw = p["path"] as? String else { throw BridgeError("path wajib diisi") }
        let path = Paths.expand(raw)
        guard FileManager.default.fileExists(atPath: path) else { throw BridgeError("File tidak ditemukan: \(path)") }
        return URL(fileURLWithPath: path)
    }

    static func cgImage(_ img: NSImage) -> CGImage? {
        var r = NSRect(origin: .zero, size: img.size)
        return img.cgImage(forProposedRect: &r, context: nil, hints: nil)
    }

    /// Downscales to `maxDim` and encodes as JPEG (or PNG when transparency matters).
    static func encode(_ cg: CGImage, maxDim: Int, preferPNG: Bool = false) -> [String: Any]? {
        let w = cg.width, h = cg.height
        let s = min(1.0, Double(maxDim) / Double(max(w, h)))
        let nw = max(1, Int(Double(w) * s)), nh = max(1, Int(Double(h) * s))
        let hasAlpha = ![.none, .noneSkipFirst, .noneSkipLast].contains(cg.alphaInfo)
        let png = preferPNG && hasAlpha
        guard let ctx = CGContext(data: nil, width: nw, height: nh, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        if !png { ctx.setFillColor(NSColor.white.cgColor); ctx.fill(CGRect(x: 0, y: 0, width: nw, height: nh)) }
        ctx.interpolationQuality = .high
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: nw, height: nh))
        guard let out = ctx.makeImage() else { return nil }
        let rep = NSBitmapImageRep(cgImage: out)
        guard let data = png ? rep.representation(using: .png, properties: [:])
                             : rep.representation(using: .jpeg, properties: [.compressionFactor: 0.86]) else { return nil }
        return ["mime": png ? "image/png" : "image/jpeg", "data": data.base64EncodedString(), "width": nw, "height": nh,
                "origWidth": w, "origHeight": h]
    }

    // MARK: file info

    static func info(_ p: [String: Any]) throws -> [String: Any] {
        let u = try url(p)
        let vals = try? u.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey, .typeIdentifierKey, .localizedTypeDescriptionKey, .isPackageKey])
        var isText = false
        if vals?.isDirectory != true, let fh = FileHandle(forReadingAtPath: u.path) {
            let head = fh.readData(ofLength: 8192)
            fh.closeFile()
            isText = !head.contains(0) && (String(data: head, encoding: .utf8) != nil || head.count < 8192 || String(data: head.dropLast(4), encoding: .utf8) != nil)
            if !isText, head.count >= 2, (head[0] == 0xFF && head[1] == 0xFE) || (head[0] == 0xFE && head[1] == 0xFF) { isText = true }
        }
        return [
            "path": u.path, "name": u.lastPathComponent, "ext": u.pathExtension.lowercased(),
            "isDir": vals?.isDirectory ?? false, "isPackage": vals?.isPackage ?? false, "size": vals?.fileSize ?? 0,
            "uti": vals?.typeIdentifier ?? "", "kind": vals?.localizedTypeDescription ?? "", "isText": isText,
        ]
    }

    /// Text in any common encoding (UTF-8/16, Latin-1, Windows-1252…).
    static func readText(_ p: [String: Any]) throws -> [String: Any] {
        let u = try url(p)
        let max = (p["maxBytes"] as? Int) ?? 2_000_000
        guard let fh = FileHandle(forReadingAtPath: u.path) else { throw BridgeError("Tidak bisa membuka file") }
        defer { fh.closeFile() }
        let data = fh.readData(ofLength: max)
        var enc: UInt = 0
        var used: String? = nil
        if let s = String(data: data, encoding: .utf8) { used = s }
        else {
            var conv: NSString?
            enc = NSString.stringEncoding(for: data, encodingOptions: nil, convertedString: &conv, usedLossyConversion: nil)
            used = conv as String?
        }
        return ["text": used ?? String(decoding: data, as: UTF8.self), "truncated": data.count >= max, "encoding": enc]
    }

    // MARK: images

    static func image(_ p: [String: Any]) throws -> [String: Any] {
        let maxDim = (p["maxDim"] as? Int) ?? 1600
        var cg: CGImage?
        if let b64 = p["base64"] as? String, let d = Data(base64Encoded: b64) {
            if let i = NSImage(data: d) { cg = cgImage(i) }
            if cg == nil, let src = CGImageSourceCreateWithData(d as CFData, nil) { cg = CGImageSourceCreateImageAtIndex(src, 0, nil) }
        } else {
            cg = decodeAnyImage(try url(p))
        }
        guard let image = cg, let out = encode(image, maxDim: maxDim, preferPNG: (p["png"] as? Bool) ?? false) else {
            throw BridgeError("Format gambar ini tidak bisa dibaca oleh macOS (dekoder tidak tersedia). Ekspor ke PNG/JPEG/TIFF dari aplikasi asalnya lalu lampirkan lagi.")
        }
        return out
    }

    // MARK: OCR (Vision)

    static func recognize(_ cg: CGImage) -> String {
        let req = VNRecognizeTextRequest()
        req.recognitionLevel = .accurate
        req.usesLanguageCorrection = true
        if #available(macOS 13.0, *) { req.automaticallyDetectsLanguage = true }
        let handler = VNImageRequestHandler(cgImage: cg, options: [:])
        try? handler.perform([req])
        let obs: [VNRecognizedTextObservation] = req.results ?? []
        // top-to-bottom, then left-to-right
        let sorted = obs.sorted { a, b in
            abs(a.boundingBox.midY - b.boundingBox.midY) > 0.01 ? a.boundingBox.midY > b.boundingBox.midY : a.boundingBox.minX < b.boundingBox.minX
        }
        return sorted.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    }

    static func ocr(_ p: [String: Any]) throws -> [String: Any] {
        var cg: CGImage?
        if let b64 = p["base64"] as? String, let d = Data(base64Encoded: b64) { if let i = NSImage(data: d) { cg = cgImage(i) } }
        else { cg = decodeAnyImage(try url(p)) }
        guard let image = cg else { throw BridgeError("Gambar tidak bisa dibaca") }
        return ["text": recognize(image)]
    }

    // MARK: PDF

    static func pdfPageImage(_ page: PDFPage, maxDim: Int) -> CGImage? {
        let box = page.bounds(for: .mediaBox)
        let scale = min(3.0, Double(maxDim) / Double(max(box.width, box.height)))
        let size = NSSize(width: box.width * CGFloat(scale), height: box.height * CGFloat(scale))
        let thumb = page.thumbnail(of: size, for: .mediaBox)
        return cgImage(thumb)
    }

    static func pdf(_ p: [String: Any]) throws -> [String: Any] {
        let u = try url(p)
        let doc = try openPDF(u, password: p["password"] as? String)
        let maxPages = (p["maxPages"] as? Int) ?? 400
        var parts: [String] = []
        var textChars = 0
        let n = min(doc.pageCount, maxPages)
        for i in 0..<n {
            let t = doc.page(at: i)?.string ?? ""
            textChars += t.trimmingCharacters(in: .whitespacesAndNewlines).count
            parts.append("--- Halaman \(i + 1) ---\n" + t)
        }
        var out: [String: Any] = ["pages": doc.pageCount, "text": parts.joined(separator: "\n\n"), "textChars": textChars]
        if let title = doc.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String { out["title"] = title }
        // Scanned document: OCR the pages.
        let scanned = n > 0 && textChars < 40 * n
        out["scanned"] = scanned
        if scanned && (p["ocr"] as? Bool ?? true) {
            var o: [String] = []
            for i in 0..<min(n, (p["ocrPages"] as? Int) ?? 30) {
                if let pg = doc.page(at: i), let cg = pdfPageImage(pg, maxDim: 2000) {
                    o.append("--- Halaman \(i + 1) (OCR) ---\n" + recognize(cg))
                }
            }
            out["text"] = o.joined(separator: "\n\n")
            out["ocr"] = true
        }
        if let want = p["images"] as? Int, want > 0 {
            var imgs: [[String: Any]] = []
            for i in 0..<min(n, want) {
                if let pg = doc.page(at: i), let cg = pdfPageImage(pg, maxDim: 1400), let e = encode(cg, maxDim: 1400) { imgs.append(e) }
            }
            out["images"] = imgs
        }
        return out
    }

    // MARK: zip containers (docx/xlsx/pptx/odf/iWork/jar…)

    static func zipList(_ p: [String: Any]) throws -> [String: Any] {
        let u = try url(p)
        let r = runSync("/usr/bin/unzip", ["-Z1", u.path], timeout: 30)
        if r.code != 0 { throw BridgeError("Bukan arsip zip yang valid") }
        return ["entries": r.out.split(separator: "\n").map(String.init)]
    }

    static func zipRead(_ p: [String: Any]) throws -> [String: Any] {
        let u = try url(p)
        guard let entry = p["entry"] as? String else { throw BridgeError("entry wajib diisi") }
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
        proc.arguments = ["-p", u.path, entry]
        let out = Pipe()
        proc.standardOutput = out
        proc.standardError = FileHandle.nullDevice
        try proc.run()
        let data = out.fileHandleForReading.readDataToEndOfFile()
        proc.waitUntilExit()
        let limit = (p["maxBytes"] as? Int) ?? 20_000_000
        let d = data.prefix(limit)
        if (p["base64"] as? Bool) == true { return ["base64": d.base64EncodedString(), "size": data.count] }
        return ["text": String(data: d, encoding: .utf8) ?? String(decoding: d, as: UTF8.self), "size": data.count]
    }

    // MARK: audio / video

    static func media(_ p: [String: Any]) throws -> [String: Any] {
        let u = try url(p)
        let asset = AVURLAsset(url: u)
        var out: [String: Any] = ["duration": CMTimeGetSeconds(asset.duration)]
        if let v = asset.tracks(withMediaType: .video).first {
            let s = v.naturalSize.applying(v.preferredTransform)
            out["video"] = ["width": abs(s.width), "height": abs(s.height), "fps": v.nominalFrameRate] as [String: Any]
        }
        out["audio"] = !asset.tracks(withMediaType: .audio).isEmpty
        var meta: [String: String] = [:]
        for item in asset.commonMetadata {
            if let k = item.commonKey?.rawValue, let v = item.stringValue { meta[k] = v }
        }
        out["metadata"] = meta
        if let req = p["frames"] as? Int, req > 0, out["video"] != nil {
            let count = min(req, 60)
            let gen = AVAssetImageGenerator(asset: asset)
            gen.appliesPreferredTrackTransform = true
            gen.maximumSize = CGSize(width: 1280, height: 1280)
            let dur = CMTimeGetSeconds(asset.duration)
            var frames: [[String: Any]] = []
            for i in 0..<count {
                let t = CMTime(seconds: dur * (Double(i) + 0.5) / Double(count), preferredTimescale: 600)
                if let cg = try? gen.copyCGImage(at: t, actualTime: nil), var e = encode(cg, maxDim: 1280) {
                    e["time"] = CMTimeGetSeconds(t)
                    frames.append(e)
                }
            }
            out["frames"] = frames
        }
        return out
    }

    /// Speech-to-text with Apple's Speech framework (on-device when available).
    static func transcribe(_ p: [String: Any], done: @escaping (Result<[String: Any], Error>) -> Void) {
        let u: URL
        do { u = try url(p) } catch { done(.failure(error)); return }
        let localeId = (p["locale"] as? String) ?? Locale.current.identifier
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                done(.failure(BridgeError("Izin Pengenalan Ucapan belum diberikan (System Settings → Privacy & Security → Speech Recognition)."))); return
            }
            DispatchQueue.main.async {
                let rec = SFSpeechRecognizer(locale: Locale(identifier: localeId)) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
                guard let r = rec, r.isAvailable else { done(.failure(BridgeError("Pengenalan ucapan tidak tersedia untuk bahasa ini"))); return }
                let req = SFSpeechURLRecognitionRequest(url: u)
                req.shouldReportPartialResults = false
                var onDevice = false
                if #available(macOS 10.15, *), r.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true; onDevice = true }
                var finished = false
                r.recognitionTask(with: req) { result, error in
                    if finished { return }
                    if let result = result, result.isFinal {
                        finished = true
                        done(.success(["text": result.bestTranscription.formattedString, "onDevice": onDevice, "locale": r.locale.identifier]))
                    } else if let error = error {
                        finished = true
                        done(.failure(error))
                    }
                }
            }
        }
    }

    // MARK: temp files & clipboard

    static func writeTemp(_ p: [String: Any]) throws -> [String: Any] {
        guard let b64 = p["base64"] as? String, let data = Data(base64Encoded: b64) else { throw BridgeError("data tidak valid") }
        let name = ((p["name"] as? String) ?? "file").replacingOccurrences(of: "/", with: "_")
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sinai-\(UUID().uuidString.prefix(8))", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let u = dir.appendingPathComponent(name)
        try data.write(to: u)
        return ["path": u.path]
    }

    static func clipboardFiles() -> [String] {
        let objs = NSPasteboard.general.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL]
        return (objs ?? []).map { $0.path }
    }
}
