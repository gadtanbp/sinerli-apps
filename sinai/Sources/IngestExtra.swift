// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Cocoa
import AVFoundation
import Speech
import QuickLookThumbnailing
import ImageIO
import PDFKit

/// More readers: files that need preparing first (symlinks, iCloud placeholders,
/// offline network volumes), archives of any kind (encrypted, nested), images
/// macOS cannot decode directly, long recordings and audio analysis.
extension Ingest {

    /// Runs `work` on a background queue and gives up after `seconds` (offline
    /// network volumes can block file-system calls for minutes).
    static func withTimeout<T>(_ seconds: Double, _ work: @escaping () -> T) -> T? {
        let sem = DispatchSemaphore(value: 0)
        var result: T?
        DispatchQueue.global(qos: .userInitiated).async { result = work(); sem.signal() }
        return sem.wait(timeout: .now() + seconds) == .timedOut ? nil : result
    }

    // MARK: prepare (symlink / iCloud / offline volume)

    static func prepare(_ p: [String: Any]) throws -> [String: Any] {
        guard let raw = p["path"] as? String else { throw BridgeError("path wajib diisi") }
        var path = Paths.expand(raw)
        var out: [String: Any] = ["requested": path]
        let fm = FileManager.default

        // Legacy iCloud placeholder: ".Name.ext.icloud" stands for "Name.ext".
        let name = (path as NSString).lastPathComponent
        if name.hasPrefix("."), name.hasSuffix(".icloud"), name.count > 8 {
            let real = String(name.dropFirst().dropLast(7))
            path = ((path as NSString).deletingLastPathComponent as NSString).appendingPathComponent(real)
            out["icloudStub"] = true
        }

        guard let exists = withTimeout(6, { fm.fileExists(atPath: path) || fm.fileExists(atPath: raw) }) else {
            throw BridgeError("Drive tidak merespons — kemungkinan drive jaringan sedang offline atau terputus: \(path)")
        }
        if !exists && out["icloudStub"] == nil {
            // A dangling symlink reports "does not exist"; explain it properly.
            if let dest = try? fm.destinationOfSymbolicLink(atPath: path) {
                throw BridgeError("Symlink rusak: \(path) menunjuk ke \(dest) yang tidak ada.")
            }
            throw BridgeError("File tidak ditemukan: \(path)")
        }

        if let attrs = try? fm.attributesOfItem(atPath: path), (attrs[.type] as? FileAttributeType) == .typeSymbolicLink {
            let resolved = URL(fileURLWithPath: path).resolvingSymlinksInPath().path
            out["symlink"] = true
            out["linkTarget"] = (try? fm.destinationOfSymbolicLink(atPath: path)) ?? resolved
            guard fm.fileExists(atPath: resolved) else {
                throw BridgeError("Symlink rusak: \(path) → \(out["linkTarget"] ?? resolved)")
            }
            path = resolved
        }

        let url = URL(fileURLWithPath: path)
        let keys: Set<URLResourceKey> = [.isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey, .volumeIsLocalKey, .volumeNameKey]
        let vals = withTimeout(6, { try? url.resourceValues(forKeys: keys) }) ?? nil
        if let v = vals {
            out["network"] = v.volumeIsLocal == false
            out["volume"] = v.volumeName ?? ""
            if v.isUbiquitousItem == true {
                out["icloud"] = true
                if v.ubiquitousItemDownloadingStatus != .current || out["icloudStub"] != nil {
                    try? fm.startDownloadingUbiquitousItem(at: url)
                    let wait = min(max((p["wait"] as? Double) ?? 90, 1), 600)
                    let deadline = Date().addingTimeInterval(wait)
                    var done = false
                    while Date() < deadline {
                        var u = url
                        u.removeAllCachedResourceValues()
                        let st = try? u.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
                        if st?.ubiquitousItemDownloadingStatus == .current && fm.fileExists(atPath: path) { done = true; break }
                        Thread.sleep(forTimeInterval: 0.5)
                    }
                    if !done {
                        throw BridgeError("File iCloud \"\(url.lastPathComponent)\" belum selesai diunduh. Pastikan Mac terhubung ke internet lalu coba lagi (unduhan tetap berjalan di latar belakang).")
                    }
                    out["downloaded"] = true
                }
            }
        }
        out["path"] = path
        return out
    }

    // MARK: images macOS cannot open directly

    /// NSImage → ImageIO (incl. embedded RAW previews) → Quick Look → sips.
    static func decodeAnyImage(_ url: URL) -> CGImage? {
        if let img = NSImage(contentsOf: url), let cg = cgImage(img), cg.width > 1 { return cg }
        if let src = CGImageSourceCreateWithURL(url as CFURL, nil) {
            if let cg = CGImageSourceCreateImageAtIndex(src, 0, nil), cg.width > 1 { return cg }
            let opts: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                         kCGImageSourceThumbnailMaxPixelSize: 3000,
                                         kCGImageSourceCreateThumbnailWithTransform: true]
            if let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) { return cg }
        }
        if let cg = quickLookImage(url, size: 1600) { return cg }
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("sinai-\(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: tmp) }
        if runSync("/usr/bin/sips", ["-s", "format", "png", url.path, "--out", tmp.path], timeout: 40).code == 0,
           let img = NSImage(contentsOf: tmp) { return cgImage(img) }
        return nil
    }

    static func quickLookImage(_ url: URL, size: CGFloat) -> CGImage? {
        let sem = DispatchSemaphore(value: 0)
        var out: CGImage?
        let req = QLThumbnailGenerator.Request(fileAt: url, size: CGSize(width: size, height: size), scale: 1, representationTypes: .thumbnail)
        QLThumbnailGenerator.shared.generateBestRepresentation(for: req) { rep, _ in
            out = rep?.cgImage
            sem.signal()
        }
        _ = sem.wait(timeout: .now() + 30)
        return out
    }

    static func thumbnail(_ p: [String: Any]) throws -> [String: Any] {
        let u = try url(p)
        let size = CGFloat((p["size"] as? Double) ?? 1200)
        guard let cg = quickLookImage(u, size: size), let e = encode(cg, maxDim: Int(size), preferPNG: true) else {
            throw BridgeError("Pratinjau Quick Look tidak tersedia untuk file ini")
        }
        return e
    }

    /// Camera / format metadata. GPS position is reported as present but never returned.
    static func imageMeta(_ p: [String: Any]) throws -> [String: Any] {
        let u = try url(p)
        guard let src = CGImageSourceCreateWithURL(u as CFURL, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] else { return [:] }
        var out: [String: Any] = [:]
        out["format"] = (CGImageSourceGetType(src) as String?) ?? ""
        out["frames"] = CGImageSourceGetCount(src)
        if let w = props[kCGImagePropertyPixelWidth] { out["width"] = w }
        if let h = props[kCGImagePropertyPixelHeight] { out["height"] = h }
        if let m = props[kCGImagePropertyColorModel] { out["colorModel"] = m }
        if let pr = props[kCGImagePropertyProfileName] { out["profile"] = pr }
        if let d = props[kCGImagePropertyDepth] { out["bitDepth"] = d }
        if let t = props[kCGImagePropertyTIFFDictionary] as? [CFString: Any] {
            if let v = t[kCGImagePropertyTIFFMake] { out["make"] = v }
            if let v = t[kCGImagePropertyTIFFModel] { out["model"] = v }
            if let v = t[kCGImagePropertyTIFFSoftware] { out["software"] = v }
        }
        if let e = props[kCGImagePropertyExifDictionary] as? [CFString: Any] {
            if let v = e[kCGImagePropertyExifLensModel] { out["lens"] = v }
            if let v = e[kCGImagePropertyExifExposureTime] as? Double { out["exposure"] = v >= 1 ? "\(v) s" : "1/\(Int((1 / v).rounded())) s" }
            if let v = e[kCGImagePropertyExifFNumber] { out["aperture"] = "f/\(v)" }
            if let v = (e[kCGImagePropertyExifISOSpeedRatings] as? [Any])?.first { out["iso"] = v }
            if let v = e[kCGImagePropertyExifFocalLength] { out["focalLength"] = "\(v) mm" }
            if let v = e[kCGImagePropertyExifDateTimeOriginal] { out["taken"] = v }
        }
        if props[kCGImagePropertyGPSDictionary] != nil { out["gps"] = "ada (disembunyikan demi privasi)" }
        return out
    }

    // MARK: PDF passwords

    static func openPDF(_ u: URL, password: String?) throws -> PDFDocument {
        guard let doc = PDFDocument(url: u) else { throw BridgeError("PDF tidak bisa dibuka (file rusak atau bukan PDF)") }
        if doc.isLocked {
            guard let pw = password, !pw.isEmpty else { throw BridgeError("PDF_LOCKED: PDF ini dilindungi kata sandi.") }
            guard doc.unlock(withPassword: pw) else { throw BridgeError("PDF_LOCKED: Kata sandi PDF salah.") }
        }
        return doc
    }

    // MARK: archives (zip, 7z, rar, tar.*, encrypted zip) via libarchive

    private static func bsdtar(_ args: [String], password: String?, timeout: Double = 60) -> (code: Int32, out: String, err: String) {
        // Always pass a passphrase so libarchive never waits for one on a terminal.
        let pw = (password?.isEmpty == false) ? password! : "sinai-\(UUID().uuidString)"
        return runSync("/usr/bin/bsdtar", args + ["--passphrase", pw], timeout: timeout)
    }

    private static func archiveError(_ err: String) -> BridgeError {
        let e = err.lowercased()
        if e.contains("passphrase") || e.contains("encrypt") || e.contains("decrypt") {
            return BridgeError("ARCHIVE_PASSWORD: Arsip ini terenkripsi" + (e.contains("incorrect") ? " dan kata sandinya salah." : " — kata sandi diperlukan."))
        }
        if e.contains("unrecognized archive format") || e.contains("not supported") {
            return BridgeError("Format arsip ini tidak didukung macOS (libarchive). Untuk RAR5 terbaru, pasang `unar` (brew install unar) lalu minta agen mengekstraknya.")
        }
        return BridgeError("Gagal membaca arsip: " + err.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))
    }

    static func archiveList(_ p: [String: Any]) throws -> [String: Any] {
        let u = try url(p)
        let r = bsdtar(["-tvf", u.path], password: p["password"] as? String, timeout: 60)
        if r.code != 0 && r.out.isEmpty { throw archiveError(r.err) }
        var entries: [[String: Any]] = []
        var total = 0
        for line in r.out.split(separator: "\n") {
            // perms links owner group size Mon DD HH:MM|YYYY name…
            let parts = line.split(separator: " ", omittingEmptySubsequences: true)
            guard parts.count >= 9 else { continue }
            let size = Int(parts[4]) ?? 0
            let name = parts[8...].joined(separator: " ")
            let isDir = parts[0].hasPrefix("d")
            let isLink = parts[0].hasPrefix("l")
            total += size
            entries.append(["name": isLink ? (name.components(separatedBy: " -> ").first ?? name) : name,
                            "size": size, "dir": isDir, "link": isLink])
            if entries.count >= 20000 { break }
        }
        return ["entries": entries, "totalBytes": total, "partial": r.code != 0, "warning": r.code != 0 ? String(r.err.prefix(300)) : ""]
    }

    /// Extracts into a private temp folder with limits against archive bombs.
    /// Symlinks in the result are removed so nothing can point outside it.
    static func archiveExtract(_ p: [String: Any]) throws -> [String: Any] {
        let u = try url(p)
        let maxBytes = (p["maxBytes"] as? Int) ?? 400_000_000
        let maxEntries = (p["maxEntries"] as? Int) ?? 8000
        let listing = try archiveList(p)
        let entries = listing["entries"] as? [[String: Any]] ?? []
        if entries.count > maxEntries { throw BridgeError("Arsip berisi \(entries.count) item — melebihi batas aman \(maxEntries).") }
        if (listing["totalBytes"] as? Int ?? 0) > maxBytes { throw BridgeError("Isi arsip terlalu besar untuk diekstrak otomatis (\((listing["totalBytes"] as? Int ?? 0) / 1_000_000) MB).") }

        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sinai-arc-\(UUID().uuidString.prefix(10))", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let pw = (p["password"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "sinai-\(UUID().uuidString)"
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/bsdtar")
        proc.arguments = ["-xf", u.path, "-C", dir.path, "--no-same-owner", "--passphrase", pw]
        proc.standardInput = FileHandle.nullDevice
        proc.standardOutput = FileHandle.nullDevice
        let errPipe = Pipe()
        proc.standardError = errPipe
        try proc.run()
        var exceeded = false
        let started = Date()
        while proc.isRunning {
            Thread.sleep(forTimeInterval: 0.4)
            if directorySize(dir) > maxBytes || Date().timeIntervalSince(started) > 300 {
                exceeded = true
                proc.terminate()
                break
            }
        }
        proc.waitUntilExit()
        let err = String(decoding: errPipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
        if exceeded {
            try? FileManager.default.removeItem(at: dir)
            throw BridgeError("Ekstraksi dihentikan: ukuran hasil melebihi batas aman (kemungkinan arsip bom).")
        }
        // Any non-zero exit means the extraction was incomplete or wrong (e.g. a
        // bad password writes zeroed bytes), so never hand back possibly corrupt data.
        if proc.terminationStatus != 0 {
            try? FileManager.default.removeItem(at: dir)
            throw archiveError(err)
        }
        removeSymlinks(dir)
        return ["dir": dir.path, "warning": proc.terminationStatus != 0 ? String(err.prefix(300)) : ""]
    }

    static func directorySize(_ dir: URL) -> Int {
        var total = 0
        if let en = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: [.fileSizeKey], options: [], errorHandler: { _, _ in true }) {
            for case let f as URL in en { total += (try? f.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) ?? 0 }
        }
        return total
    }

    static func removeSymlinks(_ dir: URL) {
        guard let en = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: [.isSymbolicLinkKey], options: [], errorHandler: { _, _ in true }) else { return }
        for case let f as URL in en {
            if (try? f.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true { try? FileManager.default.removeItem(at: f) }
        }
    }

    /// Deletes a temp folder this app created (never anything else).
    static func cleanTemp(_ p: [String: Any]) throws -> Bool {
        guard let raw = p["path"] as? String else { return false }
        let path = URL(fileURLWithPath: Paths.expand(raw)).standardizedFileURL.path
        let tmp = FileManager.default.temporaryDirectory.standardizedFileURL.path
        let last = (path as NSString).lastPathComponent
        guard path.hasPrefix(tmp + "/"), last.hasPrefix("sinai-") else { throw BridgeError("Hanya folder sementara Sinai yang boleh dihapus") }
        try? FileManager.default.removeItem(atPath: path)
        return true
    }

    // MARK: long recordings: chunked transcription with timestamps

    private static func exportAudioChunk(_ asset: AVAsset, start: Double, length: Double) -> URL? {
        guard let ex = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else { return nil }
        let out = FileManager.default.temporaryDirectory.appendingPathComponent("sinai-chunk-\(UUID().uuidString).m4a")
        ex.outputURL = out
        ex.outputFileType = .m4a
        ex.timeRange = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600), duration: CMTime(seconds: length, preferredTimescale: 600))
        let sem = DispatchSemaphore(value: 0)
        ex.exportAsynchronously { sem.signal() }
        _ = sem.wait(timeout: .now() + 120)
        return ex.status == .completed ? out : nil
    }

    private static func recognize(_ url: URL, recognizer: SFSpeechRecognizer, onDevice: Bool) -> (String, [(Double, String)], String?) {
        let req = SFSpeechURLRecognitionRequest(url: url)
        req.shouldReportPartialResults = false
        if onDevice { req.requiresOnDeviceRecognition = true }
        let sem = DispatchSemaphore(value: 0)
        var text = "", segs: [(Double, String)] = [], err: String? = nil, finished = false
        let task = recognizer.recognitionTask(with: req) { result, error in
            if finished { return }
            if let r = result, r.isFinal {
                finished = true
                text = r.bestTranscription.formattedString
                segs = r.bestTranscription.segments.map { ($0.timestamp, $0.substring) }
                sem.signal()
            } else if let e = error {
                finished = true
                err = e.localizedDescription
                sem.signal()
            }
        }
        if sem.wait(timeout: .now() + 180) == .timedOut { task.cancel(); err = "waktu habis" }
        return (text, segs, err)
    }

    static func stamp(_ s: Double) -> String {
        let t = Int(s.rounded(.down))
        return t >= 3600 ? String(format: "%d:%02d:%02d", t / 3600, (t / 60) % 60, t % 60) : String(format: "%02d:%02d", t / 60, t % 60)
    }

    /// Splits long audio/video into ~55 s pieces (server recognition is limited to
    /// about a minute) and returns a transcript with [mm:ss] timestamps.
    static func transcribeLong(_ p: [String: Any], progress: @escaping (Int, Int) -> Void,
                               done: @escaping (Result<[String: Any], Error>) -> Void) {
        let u: URL
        do { u = try url(p) } catch { done(.failure(error)); return }
        let localeId = (p["locale"] as? String) ?? Locale.current.identifier
        let maxSeconds = min((p["maxSeconds"] as? Double) ?? 3 * 3600, 6 * 3600)
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                done(.failure(BridgeError("Izin Pengenalan Ucapan belum diberikan (System Settings → Privacy & Security → Speech Recognition)."))); return
            }
            DispatchQueue.global(qos: .userInitiated).async {
                guard let rec = SFSpeechRecognizer(locale: Locale(identifier: localeId)) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US")), rec.isAvailable else {
                    done(.failure(BridgeError("Pengenalan ucapan tidak tersedia untuk bahasa ini"))); return
                }
                rec.queue = OperationQueue()
                let onDevice = rec.supportsOnDeviceRecognition
                let asset = AVURLAsset(url: u)
                let duration = CMTimeGetSeconds(asset.duration)
                guard duration.isFinite, duration > 0 else { done(.failure(BridgeError("Durasi media tidak terbaca"))); return }
                guard !asset.tracks(withMediaType: .audio).isEmpty else { done(.failure(BridgeError("Media ini tidak memiliki trek audio"))); return }
                let limit = min(duration, maxSeconds)
                let chunk = onDevice ? 300.0 : 55.0
                let count = Int((limit / chunk).rounded(.up))
                var lines: [String] = [], errors: [String] = []
                for i in 0..<count {
                    progress(i, count)
                    let start = Double(i) * chunk
                    let len = min(chunk, limit - start)
                    if len < 0.5 { break }
                    let piece = count == 1 && duration <= chunk ? u : exportAudioChunk(asset, start: start, length: len)
                    guard let file = piece else { errors.append("bagian \(stamp(start)) gagal diekspor"); continue }
                    let (text, segs, err) = recognize(file, recognizer: rec, onDevice: onDevice)
                    if file != u { try? FileManager.default.removeItem(at: file) }
                    if let e = err, text.isEmpty { if !e.lowercased().contains("no speech") { errors.append("\(stamp(start)): \(e)") }; continue }
                    // Group words into ~15 s lines with timestamps.
                    var cur = "", curStart = -1.0
                    for (t, w) in segs {
                        if curStart < 0 { curStart = t }
                        if t - curStart > 15, !cur.isEmpty { lines.append("[\(stamp(start + curStart))] " + cur); cur = ""; curStart = t }
                        cur += (cur.isEmpty ? "" : " ") + w
                    }
                    if !cur.isEmpty { lines.append("[\(stamp(start + max(0, curStart)))] " + cur) }
                    else if !text.isEmpty { lines.append("[\(stamp(start))] " + text) }
                }
                progress(count, count)
                done(.success(["text": lines.joined(separator: "\n"), "onDevice": onDevice, "locale": rec.locale.identifier,
                               "duration": duration, "covered": limit, "errors": errors]))
            }
        }
    }

    // MARK: audio analysis (loudness, silence, clipping)

    static func audioStats(_ p: [String: Any]) throws -> [String: Any] {
        let u = try url(p)
        let asset = AVURLAsset(url: u)
        guard let track = asset.tracks(withMediaType: .audio).first else { throw BridgeError("Tidak ada trek audio") }
        let reader = try AVAssetReader(asset: asset)
        let rate = 8000.0
        let settings: [String: Any] = [AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true,
                                       AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false,
                                       AVSampleRateKey: rate, AVNumberOfChannelsKey: 1]
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
        reader.add(output)
        guard reader.startReading() else { throw BridgeError("Audio tidak bisa dibaca") }
        let maxSeconds = (p["maxSeconds"] as? Double) ?? 4 * 3600
        var perSecond: [Double] = []
        var acc = 0.0, n = 0, peak: Float = 0, clipped = 0
        while let buf = output.copyNextSampleBuffer(), let block = CMSampleBufferGetDataBuffer(buf) {
            var length = 0
            var ptr: UnsafeMutablePointer<Int8>? = nil
            guard CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &ptr) == noErr, let base = ptr else { continue }
            let count = length / 4
            base.withMemoryRebound(to: Float.self, capacity: count) { f in
                for i in 0..<count {
                    let s = f[i]
                    let a = abs(s)
                    if a > peak { peak = a }
                    if a >= 0.999 { clipped += 1 }
                    acc += Double(s * s); n += 1
                    if n >= Int(rate) { perSecond.append(sqrt(acc / Double(n))); acc = 0; n = 0 }
                }
            }
            if Double(perSecond.count) >= maxSeconds { reader.cancelReading(); break }
        }
        if n > 0 { perSecond.append(sqrt(acc / Double(n))) }
        func db(_ x: Double) -> Double { x <= 0.000_01 ? -100 : 20 * log10(x) }
        let dbs = perSecond.map(db)
        let silentThreshold = -45.0
        var segments: [[String: Any]] = []
        var curSilent: Bool? = nil, segStart = 0
        for (i, d) in dbs.enumerated() {
            let s = d < silentThreshold
            if curSilent == nil { curSilent = s; segStart = i }
            else if s != curSilent {
                if i - segStart >= 2 { segments.append(["from": stamp(Double(segStart)), "to": stamp(Double(i)), "kind": curSilent! ? "hening" : "suara"]) }
                curSilent = s; segStart = i
            }
        }
        if let c = curSilent { segments.append(["from": stamp(Double(segStart)), "to": stamp(Double(dbs.count)), "kind": c ? "hening" : "suara"]) }
        let loud = dbs.filter { $0 > silentThreshold }
        let avg = loud.isEmpty ? -100 : loud.reduce(0, +) / Double(loud.count)
        // Coarse loudness timeline (10 s buckets)
        var timeline: [String] = []
        stride(from: 0, to: dbs.count, by: 10).forEach { i in
            let slice = dbs[i..<min(dbs.count, i + 10)]
            let m = slice.reduce(0, +) / Double(slice.count)
            timeline.append("\(stamp(Double(i))) \(Int(m.rounded())) dB")
        }
        return ["seconds": dbs.count, "averageDb": (avg * 10).rounded() / 10, "peakDb": (db(Double(peak)) * 10).rounded() / 10,
                "silentRatio": dbs.isEmpty ? 0 : Double(dbs.filter { $0 < silentThreshold }.count) / Double(dbs.count),
                "clippedSamples": clipped, "segments": Array(segments.prefix(400)), "timeline": Array(timeline.prefix(720))]
    }
}
