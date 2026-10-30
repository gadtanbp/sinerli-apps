// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// On-device perception for models that cannot see or hear: Apple Vision scene
// classification, people/face/animal detection, salient objects, barcodes,
// text and dominant colours for images; SoundAnalysis sound classification
// for audio (music, speech, applause, animals, vehicles…).
import Cocoa
import Vision
import AVFoundation
import SoundAnalysis

extension Ingest {

    private static func position(_ r: CGRect) -> String {
        let x = r.midX, y = 1 - r.midY   // Vision uses a bottom-left origin
        let h = x < 0.34 ? "kiri" : x > 0.66 ? "kanan" : "tengah"
        let v = y < 0.34 ? "atas" : y > 0.66 ? "bawah" : "tengah"
        let size = r.width * r.height
        let s = size > 0.35 ? "besar" : size > 0.08 ? "sedang" : "kecil"
        return (h == "tengah" && v == "tengah" ? "tengah" : "\(v)-\(h)") + ", \(s)"
    }

    private static func dominantColors(_ cg: CGImage) -> [String] {
        let w = 40, h = 40
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return [] }
        ctx.interpolationQuality = .medium
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        guard let data = ctx.data else { return [] }
        let px = data.bindMemory(to: UInt8.self, capacity: w * h * 4)
        var buckets: [Int: (n: Int, r: Int, g: Int, b: Int)] = [:]
        for i in 0..<(w * h) {
            let r = Int(px[i * 4]), g = Int(px[i * 4 + 1]), b = Int(px[i * 4 + 2])
            let key = (r / 43) * 36 + (g / 43) * 6 + (b / 43)
            var e = buckets[key] ?? (0, 0, 0, 0)
            e.n += 1; e.r += r; e.g += g; e.b += b
            buckets[key] = e
        }
        return buckets.values.sorted { $0.n > $1.n }.prefix(5).map { e in
            String(format: "#%02X%02X%02X (%d%%)", e.r / e.n, e.g / e.n, e.b / e.n, e.n * 100 / (w * h))
        }
    }

    static func analyzeImage(_ p: [String: Any]) throws -> [String: Any] {
        var cg: CGImage?
        if let b64 = p["base64"] as? String, let d = Data(base64Encoded: b64) { if let i = NSImage(data: d) { cg = cgImage(i) } }
        else { cg = decodeAnyImage(try url(p)) }
        guard let image = cg else { throw BridgeError("Gambar tidak bisa dibaca") }
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        let classify = VNClassifyImageRequest()
        let faces = VNDetectFaceRectanglesRequest()
        let humans = VNDetectHumanRectanglesRequest()
        let animals = VNRecognizeAnimalsRequest()
        let barcodes = VNDetectBarcodesRequest()
        let saliency = VNGenerateObjectnessBasedSaliencyImageRequest()
        let text = VNRecognizeTextRequest()
        text.recognitionLevel = .accurate
        text.usesLanguageCorrection = true
        try? handler.perform([classify, faces, humans, animals, barcodes, saliency, text])

        var out: [String: Any] = ["width": image.width, "height": image.height]
        let labels = (classify.results ?? []).filter { $0.confidence > 0.12 }.prefix(15)
            .map { ["label": $0.identifier.replacingOccurrences(of: "_", with: " "), "confidence": Double(Int($0.confidence * 100)) / 100] }
        out["labels"] = Array(labels)
        out["faces"] = (faces.results ?? []).map { position($0.boundingBox) }
        out["people"] = (humans.results ?? []).map { position($0.boundingBox) }
        out["animals"] = (animals.results ?? []).map { a in
            (a.labels.first?.identifier ?? "hewan") + " (" + position(a.boundingBox) + ")"
        }
        out["barcodes"] = (barcodes.results ?? []).compactMap { b in
            b.payloadStringValue.map { "\(b.symbology.rawValue.replacingOccurrences(of: "VNBarcodeSymbology", with: "")): \($0)" }
        }
        if let s = saliency.results?.first, let objs = s.salientObjects {
            out["objects"] = objs.prefix(6).map { position($0.boundingBox) }
        }
        let sorted = (text.results ?? []).sorted { a, b in
            abs(a.boundingBox.midY - b.boundingBox.midY) > 0.01 ? a.boundingBox.midY > b.boundingBox.midY : a.boundingBox.minX < b.boundingBox.minX
        }
        out["text"] = sorted.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
        out["colors"] = dominantColors(image)
        return out
    }

    // MARK: sound classification

    final class SoundObserver: NSObject, SNResultsObserving {
        var segments: [(label: String, start: Double, end: Double, conf: Double)] = []
        func request(_ request: SNRequest, didProduce result: SNResult) {
            guard let r = result as? SNClassificationResult, let top = r.classifications.first, top.confidence > 0.5 else { return }
            let start = r.timeRange.start.seconds, end = r.timeRange.end.seconds
            if let last = segments.last, last.label == top.identifier, start - last.end < 1.6 {
                segments[segments.count - 1].end = end
                segments[segments.count - 1].conf = max(last.conf, top.confidence)
            } else {
                segments.append((top.identifier, start, end, top.confidence))
            }
        }
    }

    static func classifySound(_ p: [String: Any]) throws -> [String: Any] {
        guard #available(macOS 12.0, *) else { return ["unsupported": true] }
        let u = try url(p)
        let analyzer = try SNAudioFileAnalyzer(url: u)
        let req = try SNClassifySoundRequest(classifierIdentifier: .version1)
        req.windowDuration = CMTime(seconds: 1.5, preferredTimescale: 48000)
        let obs = SoundObserver()
        try analyzer.add(req, withObserver: obs)
        analyzer.analyze()
        let segs = obs.segments.filter { $0.end - $0.start >= 1.0 }.prefix(80).map {
            ["label": $0.label.replacingOccurrences(of: "_", with: " "), "start": Int($0.start), "end": Int($0.end), "confidence": Double(Int($0.conf * 100)) / 100] as [String: Any]
        }
        var totals: [String: Double] = [:]
        obs.segments.forEach { totals[$0.label, default: 0] += $0.end - $0.start }
        let top = totals.sorted { $0.value > $1.value }.prefix(8).map { ["label": $0.key.replacingOccurrences(of: "_", with: " "), "seconds": Int($0.value)] as [String: Any] }
        return ["segments": Array(segs), "top": Array(top)]
    }
}
