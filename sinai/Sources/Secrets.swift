// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Foundation
import Security

/// API keys live in a single Keychain item (a JSON dictionary), so macOS asks
/// for access at most once per app build instead of once per key.
enum Secrets {
    private static let service = "app.sinai.secrets"
    private static let account = "api-keys"
    private static let lock = NSLock()
    private static var cache: [String: String]? = nil

    private static var useFile: Bool {
        ProcessInfo.processInfo.environment["SINAI_SECRET_STORE"] == "file"
    }
    private static var fileURL: URL { Paths.support.appendingPathComponent("secrets.json") }

    static func get(_ key: String) -> String? {
        lock.lock(); defer { lock.unlock() }
        return loadLocked()[key]
    }

    static func set(_ key: String, _ value: String?) throws {
        lock.lock(); defer { lock.unlock() }
        var all = loadLocked()
        if let v = value, !v.isEmpty { all[key] = v } else { all.removeValue(forKey: key) }
        try saveLocked(all)
        cache = all
    }

    static func keys() -> [String] {
        lock.lock(); defer { lock.unlock() }
        return Array(loadLocked().keys)
    }

    private static func loadLocked() -> [String: String] {
        if let c = cache { return c }
        var result: [String: String] = [:]
        if useFile {
            if let d = try? Data(contentsOf: fileURL), let obj = try? JSONSerialization.jsonObject(with: d) as? [String: String] {
                result = obj
            }
        } else {
            let q: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
                kSecReturnData as String: true,
                kSecMatchLimit as String: kSecMatchLimitOne,
            ]
            var item: CFTypeRef?
            if SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let d = item as? Data,
               let obj = try? JSONSerialization.jsonObject(with: d) as? [String: String] {
                result = obj
            }
        }
        cache = result
        return result
    }

    private static func saveLocked(_ all: [String: String]) throws {
        let data = try JSONSerialization.data(withJSONObject: all, options: [])
        if useFile {
            try data.write(to: fileURL, options: [.atomic])
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: fileURL.path)
            return
        }
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let upd: [String: Any] = [kSecValueData as String: data]
        var status = SecItemUpdate(q as CFDictionary, upd as CFDictionary)
        if status == errSecItemNotFound {
            var add = q
            add[kSecValueData as String] = data
            add[kSecAttrLabel as String] = "Sinai API Keys"
            status = SecItemAdd(add as CFDictionary, nil)
        }
        if status != errSecSuccess {
            throw BridgeError("Gagal menyimpan ke Keychain (kode \(status))")
        }
    }
}
