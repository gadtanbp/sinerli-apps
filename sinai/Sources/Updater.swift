// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Cocoa
import CommonCrypto

/// Pembaruan dari Sinerli: unduh installer, cocokkan SHA-256 dari manifest,
/// lalu pasang Sinai.app baru menggantikan yang lama dan buka ulang.
final class SelfUpdate: NSObject, URLSessionDownloadDelegate {
    static let shared = SelfUpdate()
    var emit: ((String, [String: Any]) -> Void)?

    private var session: URLSession!
    private var jobs: [Int: (job: String, sha: String, name: String, done: (Result<String, Error>) -> Void)] = [:]
    private let lock = NSLock()

    override init() {
        super.init()
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 120
        cfg.timeoutIntervalForResource = 6 * 3600
        session = URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
    }

    static var downloadDir: URL {
        let base = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Downloads")
        let dir = base.appendingPathComponent("Pembaruan Sinai", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Mengunduh `url` ke ~/Downloads/Pembaruan Sinai. Selesai hanya bila SHA-256 cocok.
    func download(_ p: [String: Any], done: @escaping (Result<String, Error>) -> Void) {
        guard let s = p["url"] as? String, let url = URL(string: s), url.scheme?.lowercased() == "https" || url.host == "localhost" || url.host == "127.0.0.1" else {
            done(.failure(BridgeError("Alamat unduhan pembaruan tidak valid."))); return
        }
        let sha = (p["sha256"] as? String ?? "").lowercased()
        guard sha.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
            done(.failure(BridgeError("Manifest pembaruan tidak memuat SHA-256."))); return
        }
        let name = ((p["name"] as? String) ?? "Sinai-update.dmg").replacingOccurrences(of: "/", with: "_")
        var req = URLRequest(url: url)
        req.setValue("Sinai-Updater (Macintosh)", forHTTPHeaderField: "User-Agent")
        let task = session.downloadTask(with: req)
        lock.lock()
        jobs[task.taskIdentifier] = (p["job"] as? String ?? "update", sha, name, done)
        lock.unlock()
        task.resume()
    }

    func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didWriteData _: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        lock.lock(); let j = jobs[downloadTask.taskIdentifier]; lock.unlock()
        guard let j = j else { return }
        emit?("update.progress", ["job": j.job, "received": totalBytesWritten, "total": max(0, totalBytesExpectedToWrite)])
    }

    func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        lock.lock(); let j = jobs.removeValue(forKey: downloadTask.taskIdentifier); lock.unlock()
        guard let j = j else { return }
        let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { j.done(.failure(BridgeError("Server pembaruan menjawab HTTP \(status)."))); return }
        guard let digest = SelfUpdate.sha256(of: location), digest == j.sha else {
            j.done(.failure(BridgeError("Berkas pembaruan rusak atau tidak cocok (SHA-256 berbeda). Coba lagi.")))
            return
        }
        let dest = SelfUpdate.downloadDir.appendingPathComponent(j.name)
        try? FileManager.default.removeItem(at: dest)
        do { try FileManager.default.moveItem(at: location, to: dest); j.done(.success(dest.path)) }
        catch { j.done(.failure(error)) }
    }

    func urlSession(_ s: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let error = error else { return }
        lock.lock(); let j = jobs.removeValue(forKey: task.taskIdentifier); lock.unlock()
        j?.done(.failure(BridgeError("Unduhan pembaruan gagal: " + error.localizedDescription)))
    }

    static func sha256(of url: URL) -> String? {
        guard let fh = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? fh.close() }
        var ctx = CC_SHA256_CTX()
        CC_SHA256_Init(&ctx)
        while true {
            let chunk = fh.readData(ofLength: 1 << 20)
            if chunk.isEmpty { break }
            chunk.withUnsafeBytes { _ = CC_SHA256_Update(&ctx, $0.baseAddress, CC_LONG(chunk.count)) }
        }
        var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        CC_SHA256_Final(&digest, &ctx)
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    /// Memasang DMG yang sudah diverifikasi: salin Sinai.app ke folder sementara,
    /// lalu skrip kecil menunggu Sinai keluar, mengganti bundle lama, dan membukanya lagi.
    /// Bila folder aplikasi tidak bisa ditulis, DMG dibuka agar pengguna menyeret manual.
    static func install(dmgPath: String) throws -> [String: Any] {
        let fm = FileManager.default
        guard fm.fileExists(atPath: dmgPath) else { throw BridgeError("Berkas pembaruan tidak ditemukan.") }
        let target = Bundle.main.bundleURL
        let parent = target.deletingLastPathComponent()
        guard target.pathExtension == "app", fm.isWritableFile(atPath: parent.path), !target.path.hasPrefix("/Volumes/") else {
            NSWorkspace.shared.open(URL(fileURLWithPath: dmgPath))
            return ["mode": "manual"]
        }
        let work = fm.temporaryDirectory.appendingPathComponent("sinai-update-\(UUID().uuidString)", isDirectory: true)
        let mount = work.appendingPathComponent("mnt", isDirectory: true)
        try fm.createDirectory(at: mount, withIntermediateDirectories: true)
        let a = runSync("/usr/bin/hdiutil", ["attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mount.path, dmgPath], timeout: 120)
        guard a.code == 0 else { throw BridgeError("DMG pembaruan tidak bisa dibuka: " + a.err.prefix(200)) }
        defer { runSync("/usr/bin/hdiutil", ["detach", mount.path, "-force"], timeout: 60) }
        guard let app = (try? fm.contentsOfDirectory(atPath: mount.path))?.first(where: { $0.hasSuffix(".app") }) else {
            throw BridgeError("DMG pembaruan tidak berisi aplikasi.")
        }
        let staged = work.appendingPathComponent(app)
        let c = runSync("/usr/bin/ditto", [mount.appendingPathComponent(app).path, staged.path], timeout: 300)
        guard c.code == 0 else { throw BridgeError("Gagal menyalin pembaruan: " + c.err.prefix(200)) }
        guard Bundle(url: staged)?.bundleIdentifier == Bundle.main.bundleIdentifier else {
            throw BridgeError("Isi DMG bukan aplikasi Sinai.")
        }
        let script = work.appendingPathComponent("install.sh")
        let q = { (s: String) in "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'" }
        let sh = """
        #!/bin/sh
        while kill -0 \(ProcessInfo.processInfo.processIdentifier) 2>/dev/null; do sleep 0.3; done
        rm -rf \(q(target.path)).old
        mv \(q(target.path)) \(q(target.path)).old && mv \(q(staged.path)) \(q(target.path)) || { rm -rf \(q(target.path)); mv \(q(target.path)).old \(q(target.path)); }
        xattr -dr com.apple.quarantine \(q(target.path)) 2>/dev/null
        rm -rf \(q(target.path)).old \(q(work.path))
        open \(q(target.path))
        """
        try sh.write(to: script, atomically: true, encoding: .utf8)
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/sh")
        p.arguments = [script.path]
        p.standardInput = FileHandle.nullDevice
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        try p.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { NSApp.terminate(nil) }
        return ["mode": "restart"]
    }
}
