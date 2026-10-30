// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Foundation

/// Runs local MCP servers (stdio transport): one long-lived process per server,
/// newline-delimited JSON-RPC in both directions. The protocol itself is spoken
/// by the web layer; this class only moves lines.
final class MCPHost {
    static let shared = MCPHost()
    var emit: ((String, [String: Any]) -> Void)?

    private final class Server {
        let process: Process
        let stdin: FileHandle
        var buffer = Data()
        init(_ p: Process, _ i: FileHandle) { process = p; stdin = i }
    }

    private var servers: [String: Server] = [:]
    private let lock = NSLock()

    func start(id: String, command: String, args: [String], env: [String: String], cwd: String?) throws {
        stop(id: id)
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        p.arguments = [command] + args
        p.environment = Env.shared.environment(extra: env)
        p.currentDirectoryURL = URL(fileURLWithPath: cwd.map(Paths.expand) ?? NSHomeDirectory())
        let inPipe = Pipe(), outPipe = Pipe(), errPipe = Pipe()
        p.standardInput = inPipe
        p.standardOutput = outPipe
        p.standardError = errPipe
        let server = Server(p, inPipe.fileHandleForWriting)

        outPipe.fileHandleForReading.readabilityHandler = { [weak self, weak server] h in
            let d = h.availableData
            guard let self = self, let server = server else { return }
            if d.isEmpty { h.readabilityHandler = nil; return }
            server.buffer.append(d)
            while let nl = server.buffer.firstIndex(of: 10) {
                let line = server.buffer.subdata(in: server.buffer.startIndex..<nl)
                server.buffer.removeSubrange(server.buffer.startIndex...nl)
                let s = String(decoding: line, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
                if !s.isEmpty { self.emit?("mcp.message", ["id": id, "line": s]) }
            }
        }
        errPipe.fileHandleForReading.readabilityHandler = { [weak self] h in
            let d = h.availableData
            if d.isEmpty { h.readabilityHandler = nil; return }
            self?.emit?("mcp.log", ["id": id, "text": String(decoding: d, as: UTF8.self)])
        }
        p.terminationHandler = { [weak self] proc in
            self?.lock.lock(); self?.servers[id] = nil; self?.lock.unlock()
            self?.emit?("mcp.exit", ["id": id, "code": Int(proc.terminationStatus)])
        }
        try p.run()
        lock.lock(); servers[id] = server; lock.unlock()
    }

    func send(id: String, line: String) throws {
        lock.lock(); let s = servers[id]; lock.unlock()
        guard let server = s else { throw BridgeError("Server MCP tidak berjalan") }
        server.stdin.write(Data((line + "\n").utf8))
    }

    func stop(id: String) {
        lock.lock(); let s = servers.removeValue(forKey: id); lock.unlock()
        guard let server = s, server.process.isRunning else { return }
        try? server.stdin.close()
        server.process.terminate()
        let pid = server.process.processIdentifier
        DispatchQueue.global().asyncAfter(deadline: .now() + 2) { if Darwin.kill(pid, 0) == 0 { Darwin.kill(pid, SIGKILL) } }
    }

    func stopAll() {
        lock.lock(); let ids = Array(servers.keys); lock.unlock()
        ids.forEach { stop(id: $0) }
    }
}
