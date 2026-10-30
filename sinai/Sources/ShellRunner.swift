// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Foundation
import Darwin

/// Runs shell commands for the agent and the terminal panel, streaming
/// stdout/stderr back to the page. Jobs can optionally keep stdin open (answer
/// prompts, feed a REPL) or run on a pseudo-terminal so tools see a real TTY
/// (colours, line editing). The PTY is never the controlling terminal, so
/// programs that read passwords from /dev/tty (sudo, ssh) cannot be fed by Sinai.
final class ShellRunner {
    static let shared = ShellRunner()

    private final class Job {
        let process: Process
        var timedOut = false
        var killed = false
        var stdin: FileHandle?
        var master: Int32 = -1
        init(_ p: Process) { process = p }
    }

    private let lock = NSLock()
    private var jobs: [String: Job] = [:]

    func start(id: String, command: String, cwd: String?, timeout: Double, admin: Bool,
               interactive: Bool = false, pty: Bool = false, cols: Int = 120, rows: Int = 32,
               output: @escaping (String, String) -> Void,
               exit: @escaping ([String: Any]) -> Void) throws -> Int32 {
        let p = Process()
        var workDir = NSHomeDirectory()
        if let cwd = cwd, !cwd.isEmpty {
            var isDir: ObjCBool = false
            let expanded = Paths.expand(cwd)
            if FileManager.default.fileExists(atPath: expanded, isDirectory: &isDir), isDir.boolValue {
                workDir = expanded
            } else {
                throw BridgeError("Folder kerja tidak ditemukan: \(cwd)")
            }
        }
        let usePty = pty && !admin
        if admin {
            // Runs through the standard macOS administrator prompt; the password is
            // typed by the user into the system dialog and never seen by the app.
            let inner = "export PATH=\(shellQuote(Env.shared.path)); cd \(shellQuote(workDir)) && { \(command)\n} 2>&1"
            let escaped = inner.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
            p.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            p.arguments = ["-e", "do shell script \"\(escaped)\" with administrator privileges without altering line endings"]
        } else {
            p.executableURL = URL(fileURLWithPath: FileManager.default.fileExists(atPath: "/bin/zsh") ? "/bin/zsh" : "/bin/bash")
            p.arguments = ["-c", command]
        }
        p.currentDirectoryURL = URL(fileURLWithPath: workDir)
        var env = Env.shared.environment()
        if usePty {
            env["TERM"] = "xterm-256color"
            env.removeValue(forKey: "NO_COLOR")
            env["CLICOLOR"] = "1"
            env["COLUMNS"] = String(cols)
            env["LINES"] = String(rows)
        }
        p.environment = env

        let job = Job(p)
        let serial = DispatchQueue(label: "sinai.exec.\(id)")
        let outChunk = UTF8Chunker(), errChunk = UTF8Chunker()
        var outPipe: Pipe? = nil, errPipe: Pipe? = nil
        var masterHandle: FileHandle? = nil
        var slaveHandle: FileHandle? = nil

        if usePty {
            var master: Int32 = -1, slave: Int32 = -1
            var ws = winsize(ws_row: UInt16(max(4, min(rows, 500))), ws_col: UInt16(max(20, min(cols, 1000))), ws_xpixel: 0, ws_ypixel: 0)
            guard openpty(&master, &slave, nil, nil, &ws) == 0 else { throw BridgeError("Tidak bisa membuat terminal semu (pty)") }
            _ = fcntl(master, F_SETFD, FD_CLOEXEC)
            job.master = master
            let sh = FileHandle(fileDescriptor: slave, closeOnDealloc: true)
            slaveHandle = sh
            p.standardInput = sh
            p.standardOutput = sh
            p.standardError = sh
            let mh = FileHandle(fileDescriptor: master, closeOnDealloc: false)
            masterHandle = mh
            job.stdin = mh
            mh.readabilityHandler = { h in
                let d = h.availableData
                if d.isEmpty { h.readabilityHandler = nil; return }
                serial.async { let s = outChunk.append(d); if !s.isEmpty { output("stdout", s) } }
            }
        } else {
            if interactive {
                let inPipe = Pipe()
                p.standardInput = inPipe
                job.stdin = inPipe.fileHandleForWriting
            } else {
                p.standardInput = FileHandle.nullDevice
            }
            let o = Pipe(), e = Pipe()
            outPipe = o; errPipe = e
            p.standardOutput = o
            p.standardError = e
            o.fileHandleForReading.readabilityHandler = { h in
                let d = h.availableData
                if d.isEmpty { h.readabilityHandler = nil; return }
                serial.async { let s = outChunk.append(d); if !s.isEmpty { output("stdout", s) } }
            }
            e.fileHandleForReading.readabilityHandler = { h in
                let d = h.availableData
                if d.isEmpty { h.readabilityHandler = nil; return }
                serial.async { let s = errChunk.append(d); if !s.isEmpty { output("stderr", s) } }
            }
        }

        p.terminationHandler = { [weak self] proc in
            DispatchQueue.global().asyncAfter(deadline: .now() + 0.08) {
                var restOut = Data(), restErr = Data()
                if let o = outPipe, let e = errPipe {
                    o.fileHandleForReading.readabilityHandler = nil
                    e.fileHandleForReading.readabilityHandler = nil
                    restOut = drainNonBlocking(o.fileHandleForReading.fileDescriptor)
                    restErr = drainNonBlocking(e.fileHandleForReading.fileDescriptor)
                } else if let mh = masterHandle {
                    mh.readabilityHandler = nil
                    restOut = drainNonBlocking(mh.fileDescriptor)
                }
                serial.async {
                    var s = outChunk.append(restOut) + outChunk.flush()
                    if !s.isEmpty { output("stdout", s) }
                    s = errChunk.append(restErr) + errChunk.flush()
                    if !s.isEmpty { output("stderr", s) }
                    self?.lock.lock(); self?.jobs[id] = nil; self?.lock.unlock()
                    if job.master >= 0 { close(job.master); job.master = -1 }
                    try? job.stdin?.close()
                    job.stdin = nil
                    exit([
                        "id": id,
                        "code": Int(proc.terminationStatus),
                        "signal": proc.terminationReason == .uncaughtSignal,
                        "timedOut": job.timedOut,
                        "killed": job.killed,
                    ])
                }
            }
        }

        do {
            try p.run()
        } catch {
            if job.master >= 0 { masterHandle?.readabilityHandler = nil; close(job.master) }
            throw error
        }
        // The child owns the slave side now.
        try? slaveHandle?.close()
        lock.lock(); jobs[id] = job; lock.unlock()

        if timeout > 0 {
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { [weak self] in
                guard let self = self else { return }
                self.lock.lock(); let j = self.jobs[id]; self.lock.unlock()
                if let j = j, j.process.isRunning {
                    j.timedOut = true
                    self.killTree(j.process.processIdentifier)
                }
            }
        }
        return p.processIdentifier
    }

    /// Writes to the job's stdin (or PTY). Returns false when the job has no open input.
    func write(id: String, data: String) -> Bool {
        lock.lock(); let j = jobs[id]; lock.unlock()
        guard let job = j, job.process.isRunning, let h = job.stdin else { return false }
        h.write(Data(data.utf8))
        return true
    }

    func closeInput(id: String) {
        lock.lock(); let j = jobs[id]; lock.unlock()
        guard let job = j else { return }
        if job.master >= 0 {
            // EOF on a terminal is ^D
            job.stdin?.write(Data([4]))
        } else {
            try? job.stdin?.close()
            job.stdin = nil
        }
    }

    func resize(id: String, cols: Int, rows: Int) {
        lock.lock(); let j = jobs[id]; lock.unlock()
        guard let job = j, job.master >= 0 else { return }
        var ws = winsize(ws_row: UInt16(max(4, min(rows, 500))), ws_col: UInt16(max(20, min(cols, 1000))), ws_xpixel: 0, ws_ypixel: 0)
        _ = ioctl(job.master, TIOCSWINSZ, &ws)
        Darwin.kill(job.process.processIdentifier, SIGWINCH)
    }

    /// Sends Ctrl-C to an interactive job (SIGINT to the process tree).
    func interrupt(id: String) {
        lock.lock(); let j = jobs[id]; lock.unlock()
        guard let job = j, job.process.isRunning else { return }
        let pid = job.process.processIdentifier
        DispatchQueue.global().async {
            for p in self.descendants(of: pid) + [pid] { Darwin.kill(p, SIGINT) }
        }
    }

    func isRunning(id: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return jobs[id]?.process.isRunning ?? false
    }

    func kill(id: String) {
        lock.lock(); let j = jobs[id]; lock.unlock()
        guard let job = j, job.process.isRunning else { return }
        job.killed = true
        killTree(job.process.processIdentifier)
    }

    func killAll() {
        lock.lock(); let all = Array(jobs.values); lock.unlock()
        for j in all where j.process.isRunning { killTree(j.process.processIdentifier) }
    }

    private func descendants(of pid: Int32) -> [Int32] {
        let r = runSync("/usr/bin/pgrep", ["-P", String(pid)], timeout: 3)
        let kids = r.out.split(separator: "\n").compactMap { Int32($0.trimmingCharacters(in: .whitespaces)) }
        return kids + kids.flatMap { descendants(of: $0) }
    }

    private func killTree(_ pid: Int32) {
        DispatchQueue.global().async {
            let all = self.descendants(of: pid) + [pid]
            for p in all { Darwin.kill(p, SIGTERM) }
            DispatchQueue.global().asyncAfter(deadline: .now() + 2) {
                for p in all where Darwin.kill(p, 0) == 0 { Darwin.kill(p, SIGKILL) }
            }
        }
    }
}
