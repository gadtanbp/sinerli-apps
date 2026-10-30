// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Cocoa
import Contacts
import EventKit
import Photos
import UserNotifications
import AVFoundation

// MARK: - Personal data (Contacts, Calendar, Reminders, Photos)

/// Read/write access to the user's own data through Apple's frameworks. Every
/// call is user-approved in the UI; macOS also asks for permission once.
enum PIM {
    static let events = EKEventStore()
    static let contacts = CNContactStore()
    private static let iso: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f }()

    static func date(_ any: Any?) -> Date? {
        guard let s = any as? String, !s.isEmpty else { return nil }
        if let d = iso.date(from: s) { return d }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        for fmt in ["yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd HH:mm", "yyyy-MM-dd"] {
            f.dateFormat = fmt
            if let d = f.date(from: s) { return d }
        }
        return nil
    }
    static func str(_ d: Date?) -> String { d.map { iso.string(from: $0) } ?? "" }

    static func status(_ kind: String) -> String {
        switch kind {
        case "contacts":
            switch CNContactStore.authorizationStatus(for: .contacts) { case .authorized: return "granted"; case .notDetermined: return "ask"; default: return "denied" }
        case "calendar", "reminders":
            let s = EKEventStore.authorizationStatus(for: kind == "calendar" ? .event : .reminder)
            switch s { case .authorized: return "granted"; case .notDetermined: return "ask"; default: return s.rawValue >= 3 ? "granted" : "denied" }
        case "photos":
            let s = PHPhotoLibrary.authorizationStatus()
            switch s { case .authorized: return "granted"; case .notDetermined: return "ask"; default: return s.rawValue == 4 ? "granted" : "denied" }
        case "microphone", "camera":
            switch AVCaptureDevice.authorizationStatus(for: kind == "camera" ? .video : .audio) { case .authorized: return "granted"; case .notDetermined: return "ask"; default: return "denied" }
        default: return "unknown"
        }
    }

    static func requestAccess(_ kind: String, done: @escaping (Bool) -> Void) {
        switch kind {
        case "contacts": contacts.requestAccess(for: .contacts) { ok, _ in done(ok) }
        case "calendar": events.requestAccess(to: .event) { ok, _ in done(ok) }
        case "reminders": events.requestAccess(to: .reminder) { ok, _ in done(ok) }
        case "photos": PHPhotoLibrary.requestAuthorization { s in done(s == .authorized || s.rawValue == 4) }
        case "microphone": AVCaptureDevice.requestAccess(for: .audio, completionHandler: done)
        case "camera": AVCaptureDevice.requestAccess(for: .video, completionHandler: done)
        default: done(false)
        }
    }

    private static func ensure(_ kind: String) throws {
        let sem = DispatchSemaphore(value: 0)
        var ok = status(kind) == "granted"
        if !ok && status(kind) == "ask" { requestAccess(kind) { g in ok = g; sem.signal() }; _ = sem.wait(timeout: .now() + 120) }
        guard ok else {
            let pane = ["contacts": "Contacts", "calendar": "Calendars", "reminders": "Reminders", "photos": "Photos"][kind] ?? kind
            throw BridgeError("Akses \(pane) belum diizinkan. Buka System Settings → Privacy & Security → \(pane), lalu aktifkan Sinai.")
        }
    }

    // Contacts
    static func searchContacts(_ p: [String: Any]) throws -> [[String: Any]] {
        try ensure("contacts")
        let q = (p["query"] as? String ?? "").trimmingCharacters(in: .whitespaces)
        let limit = min((p["limit"] as? Int) ?? 20, 100)
        let keys: [CNKeyDescriptor] = [CNContactGivenNameKey, CNContactFamilyNameKey, CNContactOrganizationNameKey, CNContactJobTitleKey,
                                       CNContactPhoneNumbersKey, CNContactEmailAddressesKey, CNContactBirthdayKey, CNContactNoteKey,
                                       CNContactPostalAddressesKey, CNContactIdentifierKey].map { $0 as CNKeyDescriptor }
        var found: [CNContact] = []
        if !q.isEmpty, let byName = try? contacts.unifiedContacts(matching: CNContact.predicateForContacts(matchingName: q), keysToFetch: keys) {
            found = byName
        }
        if found.count < limit {
            let ql = q.lowercased()
            let req = CNContactFetchRequest(keysToFetch: keys)
            try? contacts.enumerateContacts(with: req) { c, stop in
                if found.count >= limit { stop.pointee = true; return }
                if found.contains(where: { $0.identifier == c.identifier }) { return }
                let hay = ([c.organizationName] + c.emailAddresses.map { $0.value as String } + c.phoneNumbers.map { $0.value.stringValue }).joined(separator: " ").lowercased()
                if ql.isEmpty || hay.contains(ql) { found.append(c) }
            }
        }
        return found.prefix(limit).map { c in
            var o: [String: Any] = ["id": c.identifier, "name": [c.givenName, c.familyName].filter { !$0.isEmpty }.joined(separator: " ")]
            if !c.organizationName.isEmpty { o["organization"] = c.organizationName }
            if !c.jobTitle.isEmpty { o["jobTitle"] = c.jobTitle }
            o["phones"] = c.phoneNumbers.map { $0.value.stringValue }
            o["emails"] = c.emailAddresses.map { $0.value as String }
            if let b = c.birthday, let m = b.month, let d = b.day { o["birthday"] = String(format: "%02d-%02d", m, d) + (b.year.map { "-\($0)" } ?? "") }
            if let a = c.postalAddresses.first { o["address"] = CNPostalAddressFormatter.string(from: a.value, style: .mailingAddress).replacingOccurrences(of: "\n", with: ", ") }
            return o
        }
    }

    static func createContact(_ p: [String: Any]) throws -> [String: Any] {
        try ensure("contacts")
        let c = CNMutableContact()
        c.givenName = p["givenName"] as? String ?? ""
        c.familyName = p["familyName"] as? String ?? ""
        c.organizationName = p["organization"] as? String ?? ""
        if let ph = p["phone"] as? String, !ph.isEmpty { c.phoneNumbers = [CNLabeledValue(label: CNLabelPhoneNumberMobile, value: CNPhoneNumber(stringValue: ph))] }
        if let em = p["email"] as? String, !em.isEmpty { c.emailAddresses = [CNLabeledValue(label: CNLabelHome, value: em as NSString)] }
        if let n = p["note"] as? String { c.note = n }
        guard !(c.givenName + c.familyName + c.organizationName).isEmpty else { throw BridgeError("Nama kontak wajib diisi") }
        let save = CNSaveRequest()
        save.add(c, toContainerWithIdentifier: nil)
        try contacts.execute(save)
        return ["id": c.identifier]
    }

    // Calendar
    static func listEvents(_ p: [String: Any]) throws -> [[String: Any]] {
        try ensure("calendar")
        let from = date(p["from"]) ?? Calendar.current.startOfDay(for: Date())
        let to = date(p["to"]) ?? from.addingTimeInterval(7 * 86400)
        guard to > from, to.timeIntervalSince(from) <= 400 * 86400 else { throw BridgeError("Rentang tanggal tidak valid (maks. 400 hari)") }
        let q = (p["query"] as? String ?? "").lowercased()
        let pred = events.predicateForEvents(withStart: from, end: to, calendars: nil)
        return events.events(matching: pred).filter { q.isEmpty || ($0.title ?? "").lowercased().contains(q) || ($0.location ?? "").lowercased().contains(q) }
            .prefix(300).map { e in
                var o: [String: Any] = ["title": e.title ?? "", "start": str(e.startDate), "end": str(e.endDate), "allDay": e.isAllDay, "calendar": e.calendar?.title ?? ""]
                if let l = e.location, !l.isEmpty { o["location"] = l }
                if let n = e.notes, !n.isEmpty { o["notes"] = String(n.prefix(500)) }
                return o
            }
    }

    static func createEvent(_ p: [String: Any]) throws -> [String: Any] {
        try ensure("calendar")
        guard let title = p["title"] as? String, !title.isEmpty, let start = date(p["start"]) else { throw BridgeError("title dan start wajib diisi") }
        let e = EKEvent(eventStore: events)
        e.title = title
        e.startDate = start
        e.endDate = date(p["end"]) ?? start.addingTimeInterval(3600)
        e.isAllDay = (p["allDay"] as? Bool) ?? false
        e.location = p["location"] as? String
        e.notes = p["notes"] as? String
        if let name = p["calendar"] as? String, let cal = events.calendars(for: .event).first(where: { $0.title == name && $0.allowsContentModifications }) { e.calendar = cal }
        else { e.calendar = events.defaultCalendarForNewEvents }
        guard e.calendar != nil else { throw BridgeError("Tidak ada kalender yang bisa ditulisi") }
        try events.save(e, span: .thisEvent, commit: true)
        return ["id": e.eventIdentifier ?? "", "calendar": e.calendar.title]
    }

    // Reminders
    static func listReminders(_ p: [String: Any]) throws -> [[String: Any]] {
        try ensure("reminders")
        let all = (p["includeCompleted"] as? Bool) ?? false
        let pred = all ? events.predicateForReminders(in: nil) : events.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: nil)
        let sem = DispatchSemaphore(value: 0)
        var out: [[String: Any]] = []
        events.fetchReminders(matching: pred) { list in
            out = (list ?? []).prefix(300).map { r in
                var o: [String: Any] = ["title": r.title ?? "", "completed": r.isCompleted, "list": r.calendar?.title ?? "", "priority": r.priority]
                if let d = r.dueDateComponents?.date { o["due"] = str(d) }
                if let n = r.notes, !n.isEmpty { o["notes"] = String(n.prefix(400)) }
                return o
            }
            sem.signal()
        }
        _ = sem.wait(timeout: .now() + 30)
        return out
    }

    static func createReminder(_ p: [String: Any]) throws -> [String: Any] {
        try ensure("reminders")
        guard let title = p["title"] as? String, !title.isEmpty else { throw BridgeError("title wajib diisi") }
        let r = EKReminder(eventStore: events)
        r.title = title
        r.notes = p["notes"] as? String
        if let d = date(p["due"]) { r.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: d) }
        if let name = p["list"] as? String, let cal = events.calendars(for: .reminder).first(where: { $0.title == name }) { r.calendar = cal }
        else { r.calendar = events.defaultCalendarForNewReminders() }
        guard r.calendar != nil else { throw BridgeError("Tidak ada daftar pengingat yang bisa ditulisi") }
        try events.save(r, commit: true)
        return ["id": r.calendarItemIdentifier, "list": r.calendar.title]
    }

    // Photos
    static func recentPhotos(_ p: [String: Any]) throws -> [[String: Any]] {
        try ensure("photos")
        let opts = PHFetchOptions()
        opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        opts.fetchLimit = min((p["limit"] as? Int) ?? 12, 60)
        if (p["favorites"] as? Bool) == true { opts.predicate = NSPredicate(format: "isFavorite == YES") }
        let assets = PHAsset.fetchAssets(with: .image, options: opts)
        var out: [[String: Any]] = []
        let ro = PHImageRequestOptions()
        ro.isSynchronous = true
        ro.deliveryMode = .highQualityFormat
        ro.isNetworkAccessAllowed = true
        let size = CGSize(width: 512, height: 512)
        assets.enumerateObjects { a, _, _ in
            var o: [String: Any] = ["id": a.localIdentifier, "date": str(a.creationDate), "width": a.pixelWidth, "height": a.pixelHeight, "favorite": a.isFavorite]
            PHImageManager.default().requestImage(for: a, targetSize: size, contentMode: .aspectFit, options: ro) { img, _ in
                if let i = img, let cg = Ingest.cgImage(i), let e = Ingest.encode(cg, maxDim: 512) { o["thumb"] = e["data"]; o["mime"] = e["mime"] }
            }
            out.append(o)
        }
        return out
    }

    static func exportPhoto(_ p: [String: Any]) throws -> [String: Any] {
        try ensure("photos")
        guard let id = p["id"] as? String, let a = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else { throw BridgeError("Foto tidak ditemukan") }
        let ro = PHImageRequestOptions()
        ro.isSynchronous = true
        ro.isNetworkAccessAllowed = true
        ro.version = .current
        var data: Data?, uti: String?
        PHImageManager.default().requestImageDataAndOrientation(for: a, options: ro) { d, u, _, _ in data = d; uti = u }
        guard let d = data else { throw BridgeError("Foto tidak bisa diambil (mungkin masih di iCloud)") }
        let ext = uti.flatMap { UTTypeCopyPreferredTagWithClass($0 as CFString, kUTTagClassFilenameExtension)?.takeRetainedValue() as String? } ?? "jpg"
        let url = Recorder.tempURL(ext, prefix: "foto")
        try d.write(to: url)
        return ["path": url.path]
    }

    static func saveToPhotos(_ p: [String: Any]) throws -> Bool {
        try ensure("photos")
        guard let path = p["path"] as? String else { throw BridgeError("path wajib diisi") }
        let url = URL(fileURLWithPath: Paths.expand(path))
        guard FileManager.default.fileExists(atPath: url.path) else { throw BridgeError("File tidak ditemukan") }
        try PHPhotoLibrary.shared().performChangesAndWait {
            let video = ["mov", "mp4", "m4v"].contains(url.pathExtension.lowercased())
            if video { PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url) }
            else { PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: url) }
        }
        return true
    }
}

// MARK: - Apple apps through fixed AppleScript templates

/// Only these scripts can run. User values are passed as `argv`, never pasted
/// into the script text, so they cannot inject AppleScript.
enum AppScripts {
    private static var modernMessages: Bool { ProcessInfo.processInfo.isOperatingSystemAtLeast(OperatingSystemVersion(majorVersion: 11, minorVersion: 0, patchVersion: 0)) }

    static func source(_ name: String) -> String? {
        switch name {
        case "mail.compose":
            return """
            on run argv
              set theTo to item 1 of argv
              set theCc to item 2 of argv
              set theSubject to item 3 of argv
              set theBody to item 4 of argv
              set sendNow to item 5 of argv
              tell application "Mail"
                set m to make new outgoing message with properties {subject:theSubject, content:theBody & return, visible:true}
                tell m
                  repeat with a in paragraphs of theTo
                    if (length of a) > 0 then make new to recipient at end of to recipients with properties {address:(a as text)}
                  end repeat
                  repeat with a in paragraphs of theCc
                    if (length of a) > 0 then make new cc recipient at end of cc recipients with properties {address:(a as text)}
                  end repeat
                end tell
                if (count of argv) > 5 then
                  repeat with i from 6 to count of argv
                    tell content of m to make new attachment with properties {file name:(POSIX file (item i of argv))} at after last paragraph
                  end repeat
                end if
                if sendNow is "1" then
                  delay 1
                  send m
                  return "sent"
                end if
                activate
                return "draft"
              end tell
            end run
            """
        case "messages.send":
            return modernMessages ? """
            on run argv
              tell application "Messages"
                set svc to 1st account whose service type = iMessage
                send (item 2 of argv) to participant (item 1 of argv) of svc
              end tell
              return "sent"
            end run
            """ : """
            on run argv
              tell application "Messages"
                set svc to 1st service whose service type = iMessage
                send (item 2 of argv) to buddy (item 1 of argv) of svc
              end tell
              return "sent"
            end run
            """
        case "notes.create":
            return """
            on run argv
              tell application "Notes"
                set n to make new note with properties {name:(item 1 of argv), body:(item 2 of argv)}
                return name of n
              end tell
            end run
            """
        case "notes.search":
            return """
            on run argv
              set q to item 1 of argv
              set out to ""
              tell application "Notes"
                set found to (notes whose name contains q)
                repeat with n in found
                  set out to out & "### " & (name of n) & linefeed & (plaintext of n) & linefeed & linefeed
                  if (length of out) > 60000 then exit repeat
                end repeat
              end tell
              return out
            end run
            """
        case "music":
            return """
            on run argv
              set act to item 1 of argv
              tell application "Music"
                if act is "play" then
                  play
                else if act is "pause" then
                  pause
                else if act is "next" then
                  next track
                else if act is "previous" then
                  previous track
                else if act is "search" then
                  set res to (search library playlist 1 for (item 2 of argv))
                  set out to ""
                  repeat with t in res
                    set out to out & (name of t) & " — " & (artist of t) & linefeed
                  end repeat
                  return out
                else if act is "playTrack" then
                  set res to (search library playlist 1 for (item 2 of argv))
                  if (count of res) is 0 then return "not found"
                  play item 1 of res
                end if
                if player state is stopped then return "stopped"
                set t to current track
                return (player state as text) & tab & (name of t) & tab & (artist of t) & tab & (album of t)
              end tell
            end run
            """
        default: return nil
        }
    }

    static func run(_ p: [String: Any]) throws -> [String: Any] {
        guard let name = p["name"] as? String, let src = source(name) else { throw BridgeError("Skrip tidak dikenal") }
        let args = (p["args"] as? [Any] ?? []).map { "\($0)" }
        var lines: [String] = []
        for l in src.split(separator: "\n", omittingEmptySubsequences: false) { lines += ["-e", String(l)] }
        let r = runSync("/usr/bin/osascript", lines + args, timeout: (p["timeout"] as? Double) ?? 60)
        if r.code != 0 {
            let e = r.err.trimmingCharacters(in: .whitespacesAndNewlines)
            if e.contains("-1743") || e.lowercased().contains("not authorized") {
                throw BridgeError("macOS belum mengizinkan Sinai mengontrol aplikasi ini. Buka System Settings → Privacy & Security → Automation, lalu aktifkan Sinai untuk aplikasi tersebut.")
            }
            throw BridgeError(e.isEmpty ? "AppleScript gagal (kode \(r.code))" : e)
        }
        return ["result": r.out.trimmingCharacters(in: .whitespacesAndNewlines)]
    }
}

// MARK: - Shortcuts

enum ShortcutsBridge {
    static var available: Bool { FileManager.default.isExecutableFile(atPath: "/usr/bin/shortcuts") }

    static func list() throws -> [String] {
        guard available else { throw BridgeError("App Shortcuts membutuhkan macOS 12 Monterey atau lebih baru.") }
        let r = runSync("/usr/bin/shortcuts", ["list"], timeout: 20)
        if r.code != 0 { throw BridgeError(r.err.isEmpty ? "Gagal membaca daftar Shortcuts" : r.err) }
        return r.out.split(separator: "\n").map(String.init).filter { !$0.isEmpty }
    }

    static func run(_ p: [String: Any]) throws -> [String: Any] {
        guard available else { throw BridgeError("App Shortcuts membutuhkan macOS 12 Monterey atau lebih baru.") }
        guard let name = p["name"] as? String, !name.isEmpty else { throw BridgeError("Nama shortcut wajib diisi") }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sinai-sc-\(UUID().uuidString.prefix(8))", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        var args = ["run", name]
        if let input = p["input"] as? String, !input.isEmpty {
            let f = dir.appendingPathComponent("input.txt")
            try input.write(to: f, atomically: true, encoding: .utf8)
            args += ["--input-path", f.path]
        } else if let path = p["inputPath"] as? String {
            args += ["--input-path", Paths.expand(path)]
        }
        let outFile = dir.appendingPathComponent("output")
        args += ["--output-path", outFile.path]
        let r = runSync("/usr/bin/shortcuts", args, timeout: min((p["timeout"] as? Double) ?? 120, 900))
        if r.code != 0 { throw BridgeError(r.err.isEmpty ? "Shortcut gagal (kode \(r.code))" : r.err.trimmingCharacters(in: .whitespacesAndNewlines)) }
        var out: [String: Any] = ["ok": true]
        if let d = try? Data(contentsOf: outFile) {
            if let s = String(data: d, encoding: .utf8) { out["output"] = String(s.prefix(100_000)) }
            else {
                let keep = Recorder.tempURL("bin", prefix: "hasil shortcut")
                try? d.write(to: keep)
                out["outputPath"] = keep.path
            }
        }
        return out
    }
}
