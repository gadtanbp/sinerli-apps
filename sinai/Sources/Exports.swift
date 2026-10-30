// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
import Cocoa
import WebKit
import PDFKit
import ImageIO

/// Producing files the user can keep or send: Office documents (via textutil),
/// spreadsheets and slide decks (minimal Open XML), image conversions, archives,
/// PDF editing (merge/split/watermark), printing and the macOS share sheet.
enum Exports {

    // MARK: save helpers

    /// Saves `data` either to an explicit `savePath` (no dialog) or through a
    /// Save panel. A savePath is only honoured when it resolves to a normal
    /// location the user can write — never inside the Sinai app bundle.
    static func deliver(_ data: Data, suggestedName: String, savePath: String?, parent: NSWindow?,
                        done: @escaping (Result<String?, Error>) -> Void) {
        if let raw = savePath, !raw.isEmpty {
            let path = Paths.expand(raw)
            do {
                try FileOps.guardWritable(path)
                let url = URL(fileURLWithPath: path)
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try data.write(to: url, options: .atomic)
                done(.success(path))
            } catch { done(.failure(error)) }
            return
        }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedName
        panel.canCreateDirectories = true
        let handler: (NSApplication.ModalResponse) -> Void = { r in
            guard r == .OK, let url = panel.url else { done(.success(nil)); return }
            do { try data.write(to: url, options: .atomic); done(.success(url.path)) } catch { done(.failure(error)) }
        }
        if let w = parent { panel.beginSheetModal(for: w, completionHandler: handler) } else { panel.begin(completionHandler: handler) }
    }

    // MARK: Office documents (docx / doc / rtf / odt / html / txt) via textutil

    static func document(_ p: [String: Any], parent: NSWindow?, done: @escaping (Result<String?, Error>) -> Void) {
        let format = (p["format"] as? String ?? "docx").lowercased()
        let valid = ["docx", "doc", "rtf", "rtfd", "odt", "html", "txt", "wordml", "webarchive"]
        guard valid.contains(format) else { done(.failure(BridgeError("Format dokumen tidak didukung: \(format)"))); return }
        let html = p["html"] as? String ?? ""
        let name = (p["name"] as? String ?? "dokumen")
        DispatchQueue.global(qos: .userInitiated).async {
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sinai-doc-\(UUID().uuidString.prefix(8))", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(at: dir) }
            let input = dir.appendingPathComponent("in.html")
            let output = dir.appendingPathComponent("out." + (format == "wordml" ? "xml" : format))
            do {
                try html.write(to: input, atomically: true, encoding: .utf8)
                let r = runSync("/usr/bin/textutil", ["-convert", format, "-encoding", "UTF-8", "-output", output.path, input.path], timeout: 60)
                guard r.code == 0, let data = try? Data(contentsOf: output) else {
                    throw BridgeError("Konversi ke \(format.uppercased()) gagal" + (r.err.isEmpty ? "" : ": " + r.err.prefix(200)))
                }
                DispatchQueue.main.async { deliver(data, suggestedName: name + "." + format, savePath: p["savePath"] as? String, parent: parent, done: done) }
            } catch { DispatchQueue.main.async { done(.failure(error)) } }
        }
    }

    // MARK: spreadsheets (xlsx / csv)

    private static func xmlEsc(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
         .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
    }
    private static func colName(_ i: Int) -> String {
        var n = i, s = ""
        repeat { s = String(UnicodeScalar(65 + n % 26)!) + s; n = n / 26 - 1 } while n >= 0
        return s
    }

    static func spreadsheet(_ p: [String: Any], parent: NSWindow?, done: @escaping (Result<String?, Error>) -> Void) {
        let format = (p["format"] as? String ?? "xlsx").lowercased()
        let name = p["name"] as? String ?? "data"
        var sheets = p["sheets"] as? [[String: Any]] ?? []
        if sheets.isEmpty, let rows = p["rows"] { sheets = [["name": "Sheet1", "rows": rows]] }
        guard !sheets.isEmpty else { done(.failure(BridgeError("Tidak ada data untuk diekspor"))); return }

        if format == "csv" || format == "tsv" {
            let sep = format == "tsv" ? "\t" : ","
            let rows = sheets.first?["rows"] as? [[Any]] ?? []
            let text = rows.map { row in row.map { c in
                let v = "\(c)"
                return (format == "csv" && v.contains(where: { ",\"\n".contains($0) })) ? "\"" + v.replacingOccurrences(of: "\"", with: "\"\"") + "\"" : v
            }.joined(separator: sep) }.joined(separator: "\r\n")
            deliver(Data((text).utf8), suggestedName: name + "." + format, savePath: p["savePath"] as? String, parent: parent, done: done)
            return
        }
        guard format == "xlsx" else { done(.failure(BridgeError("Format spreadsheet tidak didukung: \(format)"))); return }

        var sheetXmls: [(String, String)] = []
        var wbSheets = "", wbRels = "", contentOverrides = "", wbRelId = 0
        for (i, sheet) in sheets.enumerated() {
            let sname = (sheet["name"] as? String ?? "Sheet\(i + 1)").replacingOccurrences(of: "[]*?:/\\", with: "_")
            let rows = sheet["rows"] as? [[Any]] ?? []
            let header = (sheet["header"] as? Bool) ?? true
            var widths: [Int] = []
            var body = ""
            for (r, row) in rows.enumerated() {
                var cells = ""
                let style = header && r == 0 ? " s=\"1\"" : ""
                for (c, val) in row.enumerated() {
                    let ref = colName(c) + String(r + 1)
                    let shown: String
                    if let num = val as? NSNumber, !(val is Bool), CFGetTypeID(num) == CFNumberGetTypeID() {
                        cells += "<c r=\"\(ref)\"\(style)><v>\(num)</v></c>"
                        shown = "\(num)"
                    } else {
                        let s = "\(val)"
                        shown = s
                        cells += s.isEmpty ? "" : "<c r=\"\(ref)\"\(style) t=\"inlineStr\"><is><t xml:space=\"preserve\">\(xmlEsc(s))</t></is></c>"
                    }
                    while widths.count <= c { widths.append(8) }
                    widths[c] = max(widths[c], min(60, shown.count + 2))
                }
                body += "<row r=\"\(r + 1)\">\(cells)</row>"
            }
            let cols = widths.isEmpty ? "" : "<cols>" + widths.enumerated().map { "<col min=\"\($0.offset + 1)\" max=\"\($0.offset + 1)\" width=\"\($0.element)\" customWidth=\"1\"/>" }.joined() + "</cols>"
            let freeze = header && rows.count > 1 ? "<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>" : ""
            let xml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">\(freeze)\(cols)<sheetData>\(body)</sheetData></worksheet>"
            sheetXmls.append(("xl/worksheets/sheet\(i + 1).xml", xml))
            wbRelId += 1
            wbSheets += "<sheet name=\"\(xmlEsc(String(sname.prefix(31))))\" sheetId=\"\(i + 1)\" r:id=\"rId\(wbRelId)\"/>"
            wbRels += "<Relationship Id=\"rId\(wbRelId)\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet\(i + 1).xml\"/>"
            contentOverrides += "<Override PartName=\"/xl/worksheets/sheet\(i + 1).xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
        }
        var files: [(String, String)] = []
        files.append(("[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>\(contentOverrides)</Types>"))
        files.append(("_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>"))
        files.append(("xl/workbook.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets>\(wbSheets)</sheets></workbook>"))
        wbRelId += 1
        wbRels += "<Relationship Id=\"rId\(wbRelId)\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>"
        files.append(("xl/_rels/workbook.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\(wbRels)</Relationships>"))
        files.append(("xl/styles.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><fonts count=\"2\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"11\"/><color rgb=\"FFFFFFFF\"/><name val=\"Calibri\"/></font></fonts><fills count=\"3\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF4F46E5\"/><bgColor indexed=\"64\"/></patternFill></fill></fills><borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs><cellXfs count=\"2\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/><xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"0\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\"/></cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>"))
        files += sheetXmls
        do {
            let data = try Zip.create(textFiles: files)
            deliver(data, suggestedName: name + ".xlsx", savePath: p["savePath"] as? String, parent: parent, done: done)
        } catch { done(.failure(error)) }
    }

    // MARK: slide decks (pptx)

    static func slides(_ p: [String: Any], parent: NSWindow?, done: @escaping (Result<String?, Error>) -> Void) {
        let name = p["name"] as? String ?? "presentasi"
        let decks = p["slides"] as? [[String: Any]] ?? []
        guard !decks.isEmpty else { done(.failure(BridgeError("Tidak ada slide untuk diekspor"))); return }
        // 16:9 deck with a simple theme. Items: [{text, level, bullet}].
        let W = 12192000, H = 6858000
        let themeOpts = p["theme"] as? [String: Any] ?? [:]
        func hex(_ v: Any?, _ d: String) -> String {
            let s = (v as? String ?? d).replacingOccurrences(of: "#", with: "").uppercased()
            return s.count == 6 && s.allSatisfy({ $0.isHexDigit }) ? s : d
        }
        let bg = hex(themeOpts["background"], "FFFFFF"), fg = hex(themeOpts["text"], "1E2236"), accent = hex(themeOpts["accent"], "4F46E5")
        func run(_ text: String, size: Int, bold: Bool, color: String) -> String {
            "<a:r><a:rPr lang=\"id-ID\" sz=\"\(size * 100)\" b=\"\(bold ? 1 : 0)\" dirty=\"0\"><a:solidFill><a:srgbClr val=\"\(color)\"/></a:solidFill><a:latin typeface=\"Arial\"/></a:rPr><a:t>\(xmlEsc(text))</a:t></a:r>"
        }
        func shape(_ id: Int, x: Int, y: Int, w: Int, h: Int, fill: String?, body: String, anchor: String = "t") -> String {
            let fillXml = fill.map { "<a:solidFill><a:srgbClr val=\"\($0)\"/></a:solidFill>" } ?? "<a:noFill/>"
            return "<p:sp><p:nvSpPr><p:cNvPr id=\"\(id)\" name=\"s\(id)\"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"\(x)\" y=\"\(y)\"/><a:ext cx=\"\(w)\" cy=\"\(h)\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom>\(fillXml)<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap=\"square\" lIns=\"0\" rIns=\"0\" anchor=\"\(anchor)\"><a:normAutofit/></a:bodyPr><a:lstStyle/>\(body.isEmpty ? "<a:p/>" : body)</p:txBody></p:sp>"
        }
        func items(of s: [String: Any]) -> [(String, Int, Bool)] {
            if let list = s["items"] as? [[String: Any]] {
                return list.map { ("\($0["text"] ?? "")", max(0, min(($0["level"] as? Int) ?? 0, 4)), ($0["bullet"] as? Bool) ?? true) }
            }
            if let bullets = s["bullets"] as? [Any] { return bullets.map { ("\($0)", 0, true) } }
            if let body = s["body"] as? String { return body.split(separator: "\n").map { (String($0), 0, false) } }
            return []
        }
        var slideFiles: [(String, String)] = [], slideRels: [(String, String)] = []
        var presSheets = "", presRels = "", overrides = "", relId = 1
        for (i, s) in decks.enumerated() {
            let n = i + 1
            let title = s["title"] as? String ?? ""
            let list = items(of: s)
            let isCover = i == 0 && ((s["cover"] as? Bool) ?? (list.count <= 2))
            var shapes = shape(2, x: 0, y: 0, w: W, h: H, fill: isCover ? accent : bg, body: "")
            if isCover {
                shapes += shape(3, x: 914400, y: 2057400, w: W - 1828800, h: 1600200, fill: nil, body: "<a:p>\(run(title, size: 48, bold: true, color: "FFFFFF"))</a:p>", anchor: "b")
                let sub = list.map { $0.0 }.joined(separator: "\n")
                if !sub.isEmpty {
                    let paras = sub.split(separator: "\n").map { "<a:p>\(run(String($0), size: 22, bold: false, color: "E8E9FF"))</a:p>" }.joined()
                    shapes += shape(4, x: 914400, y: 3840480, w: W - 1828800, h: 1371600, fill: nil, body: paras)
                }
            } else {
                shapes += shape(3, x: 0, y: 0, w: W, h: 91440, fill: accent, body: "")
                if !title.isEmpty { shapes += shape(4, x: 685800, y: 411480, w: W - 1371600, h: 1005840, fill: nil, body: "<a:p>\(run(title, size: 34, bold: true, color: fg))</a:p>", anchor: "b") }
                let paras = list.map { item -> String in
                    let size = max(14, 22 - item.1 * 3)
                    let marL = 342900 + item.1 * 457200
                    let bu = item.2 ? "<a:buClr><a:srgbClr val=\"\(accent)\"/></a:buClr><a:buFont typeface=\"Arial\"/><a:buChar char=\"\(item.1 == 0 ? "•" : "–")\"/>" : "<a:buNone/>"
                    return "<a:p><a:pPr marL=\"\(item.2 ? marL : item.1 * 457200)\" indent=\"\(item.2 ? -342900 : 0)\"><a:spcBef><a:spcPts val=\"600\"/></a:spcBef>\(bu)</a:pPr>\(run(item.0, size: size, bold: false, color: fg))</a:p>"
                }.joined()
                if !paras.isEmpty { shapes += shape(5, x: 685800, y: 1600200, w: W - 1371600, h: H - 2286000, fill: nil, body: paras) }
                shapes += shape(6, x: W - 1371600, y: H - 548640, w: 914400, h: 365760, fill: nil, body: "<a:p><a:pPr algn=\"r\"/>\(run("\(n)", size: 12, bold: false, color: "8A8FA8"))</a:p>")
            }
            let xml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><p:sld xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>\(shapes)</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"
            slideFiles.append(("ppt/slides/slide\(n).xml", xml))
            slideRels.append(("ppt/slides/_rels/slide\(n).xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout1.xml\"/></Relationships>"))
            relId += 1
            presSheets += "<p:sldId id=\"\(255 + n)\" r:id=\"rId\(relId)\"/>"
            presRels += "<Relationship Id=\"rId\(relId)\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide\" Target=\"slides/slide\(n).xml\"/>"
            overrides += "<Override PartName=\"/ppt/slides/slide\(n).xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slide+xml\"/>"
        }
        let master = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><p:sldMaster xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/><p:sldLayoutIdLst><p:sldLayoutId id=\"2147483649\" r:id=\"rId1\"/></p:sldLayoutIdLst></p:sldMaster>"
        let layout = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><p:sldLayout xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" type=\"blank\" preserve=\"1\"><p:cSld name=\"Blank\"><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>"
        let theme = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><a:theme xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" name=\"Office\"><a:themeElements><a:clrScheme name=\"Office\"><a:dk1><a:sysClr val=\"windowText\" lastClr=\"000000\"/></a:dk1><a:lt1><a:sysClr val=\"window\" lastClr=\"FFFFFF\"/></a:lt1><a:dk2><a:srgbClr val=\"44546A\"/></a:dk2><a:lt2><a:srgbClr val=\"E7E6E6\"/></a:lt2><a:accent1><a:srgbClr val=\"4472C4\"/></a:accent1><a:accent2><a:srgbClr val=\"ED7D31\"/></a:accent2><a:accent3><a:srgbClr val=\"A5A5A5\"/></a:accent3><a:accent4><a:srgbClr val=\"FFC000\"/></a:accent4><a:accent5><a:srgbClr val=\"5B9BD5\"/></a:accent5><a:accent6><a:srgbClr val=\"70AD47\"/></a:accent6><a:hlink><a:srgbClr val=\"0563C1\"/></a:hlink><a:folHlink><a:srgbClr val=\"954F72\"/></a:folHlink></a:clrScheme><a:fontScheme name=\"Office\"><a:majorFont><a:latin typeface=\"Calibri Light\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:majorFont><a:minorFont><a:latin typeface=\"Arial\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:minorFont></a:fontScheme><a:fmtScheme name=\"Office\"><a:fillStyleLst><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>"
        var files: [(String, String)] = []
        files.append(("[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\"/><Override PartName=\"/ppt/slideMasters/slideMaster1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml\"/><Override PartName=\"/ppt/slideLayouts/slideLayout1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml\"/><Override PartName=\"/ppt/theme/theme1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.theme+xml\"/>\(overrides)</Types>"))
        files.append(("_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"ppt/presentation.xml\"/></Relationships>"))
        files.append(("ppt/presentation.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><p:presentation xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"><p:sldMasterIdLst><p:sldMasterId id=\"2147483648\" r:id=\"rId1\"/></p:sldMasterIdLst><p:sldIdLst>\(presSheets)</p:sldIdLst><p:sldSz cx=\"12192000\" cy=\"6858000\"/><p:notesSz cx=\"6858000\" cy=\"9144000\"/></p:presentation>"))
        files.append(("ppt/_rels/presentation.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster\" Target=\"slideMasters/slideMaster1.xml\"/>\(presRels)</Relationships>"))
        files.append(("ppt/slideMasters/slideMaster1.xml", master))
        files.append(("ppt/slideMasters/_rels/slideMaster1.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout\" Target=\"../slideLayouts/slideLayout1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme\" Target=\"../theme/theme1.xml\"/></Relationships>"))
        files.append(("ppt/slideLayouts/slideLayout1.xml", layout))
        files.append(("ppt/slideLayouts/_rels/slideLayout1.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster\" Target=\"../slideMasters/slideMaster1.xml\"/></Relationships>"))
        files.append(("ppt/theme/theme1.xml", theme))
        files += slideFiles
        files += slideRels
        do {
            let data = try Zip.create(textFiles: files)
            deliver(data, suggestedName: name + ".pptx", savePath: p["savePath"] as? String, parent: parent, done: done)
        } catch { done(.failure(error)) }
    }

    // MARK: image conversion

    static func convertImage(_ p: [String: Any], parent: NSWindow?, done: @escaping (Result<String?, Error>) -> Void) {
        let format = (p["format"] as? String ?? "jpeg").lowercased()
        let uti: CFString
        switch format {
        case "jpg", "jpeg": uti = "public.jpeg" as CFString
        case "png": uti = "public.png" as CFString
        case "tiff", "tif": uti = "public.tiff" as CFString
        case "gif": uti = "com.compuserve.gif" as CFString
        case "bmp": uti = "com.microsoft.bmp" as CFString
        case "heic": uti = "public.heic" as CFString
        case "pdf", "pdf-a", "pdfa": uti = "com.adobe.pdf" as CFString
        default: done(.failure(BridgeError("Format gambar \(format) tidak didukung encoder macOS. Pilih JPEG, PNG, HEIC, TIFF, GIF, BMP, atau PDF."))); return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            var cg: CGImage?
            if let b64 = p["base64"] as? String, let d = Data(base64Encoded: b64), let src = CGImageSourceCreateWithData(d as CFData, nil) {
                cg = CGImageSourceCreateImageAtIndex(src, 0, nil)
            } else if let path = p["path"] as? String {
                cg = Ingest.decodeAnyImage(URL(fileURLWithPath: Paths.expand(path)))
            }
            guard let image = cg else { DispatchQueue.main.async { done(.failure(BridgeError("Gambar sumber tidak bisa dibaca"))) }; return }
            let out = NSMutableData()
            guard let dest = CGImageDestinationCreateWithData(out, uti, 1, nil) else {
                DispatchQueue.main.async { done(.failure(BridgeError("Encoder \(format) tidak tersedia"))) }; return
            }
            var opts: [CFString: Any] = [:]
            if format == "jpg" || format == "jpeg" || format == "heic" { opts[kCGImageDestinationLossyCompressionQuality] = (p["quality"] as? Double) ?? 0.9 }
            CGImageDestinationAddImage(dest, image, opts as CFDictionary)
            guard CGImageDestinationFinalize(dest) else {
                DispatchQueue.main.async { done(.failure(BridgeError("Konversi gambar gagal"))) }; return
            }
            let ext = format == "pdf-a" || format == "pdfa" ? "pdf" : (format == "jpeg" ? "jpg" : format)
            DispatchQueue.main.async { deliver(out as Data, suggestedName: (p["name"] as? String ?? "gambar") + "." + ext, savePath: p["savePath"] as? String, parent: parent, done: done) }
        }
    }

    // MARK: archive (zip) export of several files

    static func zipExport(_ p: [String: Any], parent: NSWindow?, done: @escaping (Result<String?, Error>) -> Void) {
        let name = p["name"] as? String ?? "sinai-ekspor"
        let items = p["files"] as? [[String: Any]] ?? []
        guard !items.isEmpty else { done(.failure(BridgeError("Tidak ada file untuk diarsipkan"))); return }
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                var entries: [(String, Data)] = []
                var used = Set<String>()
                for (i, it) in items.enumerated() {
                    var ename = (it["name"] as? String ?? "file-\(i)").replacingOccurrences(of: "..", with: "_")
                    while used.contains(ename) { ename = "\(i)-" + ename }
                    used.insert(ename)
                    if let path = it["path"] as? String {
                        let data = try Data(contentsOf: URL(fileURLWithPath: Paths.expand(path)))
                        entries.append((ename, data))
                    } else if let b64 = it["base64"] as? String, let d = Data(base64Encoded: b64) {
                        entries.append((ename, d))
                    } else if let content = it["content"] as? String {
                        entries.append((ename, Data(content.utf8)))
                    }
                }
                let data = try Zip.create(files: entries)
                DispatchQueue.main.async { deliver(data, suggestedName: name + ".zip", savePath: p["savePath"] as? String, parent: parent, done: done) }
            } catch { DispatchQueue.main.async { done(.failure(error)) } }
        }
    }

    // MARK: PDF editing

    static func pdfEdit(_ p: [String: Any], parent: NSWindow?, done: @escaping (Result<String?, Error>) -> Void) {
        let op = p["op"] as? String ?? ""
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                func load(_ path: String) throws -> PDFDocument {
                    let doc = try Ingest.openPDF(URL(fileURLWithPath: Paths.expand(path)), password: p["password"] as? String)
                    return doc
                }
                let result: Data
                var suggested = (p["name"] as? String ?? "pdf") + ".pdf"
                switch op {
                case "merge":
                    guard let paths = p["paths"] as? [String], paths.count >= 1 else { throw BridgeError("Daftar PDF kosong") }
                    let merged = PDFDocument()
                    for path in paths {
                        let d = try load(path)
                        for i in 0..<d.pageCount { if let pg = d.page(at: i) { merged.insert(pg, at: merged.pageCount) } }
                    }
                    guard let data = merged.dataRepresentation() else { throw BridgeError("Gagal menggabungkan PDF") }
                    result = data
                case "split":
                    guard let path = p["path"] as? String else { throw BridgeError("path wajib diisi") }
                    let doc = try load(path)
                    let ranges = pageRanges(p["pages"], total: doc.pageCount)
                    let out = PDFDocument()
                    for i in ranges { if let pg = doc.page(at: i) { out.insert(pg, at: out.pageCount) } }
                    guard out.pageCount > 0, let data = out.dataRepresentation() else { throw BridgeError("Tidak ada halaman yang dipilih") }
                    result = data
                case "watermark", "stamp":
                    guard let path = p["path"] as? String else { throw BridgeError("path wajib diisi") }
                    let doc = try load(path)
                    let text = p["text"] as? String ?? "RAHASIA"
                    let opacity = CGFloat((p["opacity"] as? Double) ?? 0.18)
                    let diagonal = (p["diagonal"] as? Bool) ?? (op == "watermark")
                    stampPDF(doc, text: text, opacity: opacity, diagonal: diagonal)
                    guard let data = doc.dataRepresentation() else { throw BridgeError("Gagal menulis watermark") }
                    result = data
                case "encrypt":
                    guard let path = p["path"] as? String, let pw = p["newPassword"] as? String, !pw.isEmpty else { throw BridgeError("path dan newPassword wajib diisi") }
                    let doc = try load(path)
                    guard let data = doc.dataRepresentation(options: [PDFDocumentWriteOption.userPasswordOption: pw, PDFDocumentWriteOption.ownerPasswordOption: (p["ownerPassword"] as? String ?? pw)]) else { throw BridgeError("Gagal mengenkripsi PDF") }
                    result = data
                default:
                    throw BridgeError("Operasi PDF tidak dikenal: \(op)")
                }
                if p["name"] == nil, let src = (p["path"] as? String) ?? (p["paths"] as? [String])?.first {
                    suggested = (src as NSString).lastPathComponent.replacingOccurrences(of: ".pdf", with: "") + "-" + op + ".pdf"
                }
                DispatchQueue.main.async { deliver(result, suggestedName: suggested, savePath: p["savePath"] as? String, parent: parent, done: done) }
            } catch { DispatchQueue.main.async { done(.failure(error)) } }
        }
    }

    private static func pageRanges(_ any: Any?, total: Int) -> [Int] {
        guard let spec = any as? String, !spec.trimmingCharacters(in: .whitespaces).isEmpty else { return Array(0..<total) }
        var out: [Int] = []
        for part in spec.split(separator: ",") {
            let t = part.trimmingCharacters(in: .whitespaces)
            if t.contains("-") {
                let b = t.split(separator: "-")
                if b.count == 2, let a = Int(b[0]), let z = Int(b[1]) { for i in min(a, z)...max(a, z) where i >= 1 && i <= total { out.append(i - 1) } }
            } else if let i = Int(t), i >= 1, i <= total { out.append(i - 1) }
        }
        return out
    }

    private static func stampPDF(_ doc: PDFDocument, text: String, opacity: CGFloat, diagonal: Bool) {
        for i in 0..<doc.pageCount {
            guard let page = doc.page(at: i) else { continue }
            let bounds = page.bounds(for: .mediaBox)
            let annot = WatermarkAnnotation(bounds: bounds, text: text, opacity: opacity, diagonal: diagonal)
            page.addAnnotation(annot)
        }
    }

    // MARK: share sheet & reveal

    static func share(_ p: [String: Any], parent: NSWindow?, done: @escaping (Result<Bool, Error>) -> Void) {
        var items: [Any] = []
        for path in (p["paths"] as? [String] ?? []) { items.append(URL(fileURLWithPath: Paths.expand(path))) }
        if let text = p["text"] as? String, !text.isEmpty { items.append(text) }
        if let url = p["url"] as? String, let u = URL(string: url) { items.append(u) }
        guard !items.isEmpty else { done(.failure(BridgeError("Tidak ada yang bisa dibagikan"))); return }
        DispatchQueue.main.async {
            guard let window = parent, let content = window.contentView else { done(.failure(BridgeError("Jendela tidak tersedia"))); return }
            let picker = NSSharingServicePicker(items: items)
            let rect = NSRect(x: content.bounds.midX - 1, y: content.bounds.maxY - 60, width: 2, height: 2)
            picker.show(relativeTo: rect, of: content, preferredEdge: .minY)
            done(.success(true))
        }
    }

    // MARK: printing

    static func printHTML(_ p: [String: Any], parent: NSWindow?, done: @escaping (Result<Bool, Error>) -> Void) {
        DispatchQueue.main.async {
            _ = HTMLPrinter(html: p["html"] as? String ?? "", jobTitle: p["name"] as? String ?? "Sinai", parent: parent, done: done)
        }
    }
}

/// A diagonal / tiled text watermark drawn on every PDF page.
final class WatermarkAnnotation: PDFAnnotation {
    private let text: String
    private let op: CGFloat
    private let diagonal: Bool
    init(bounds: NSRect, text: String, opacity: CGFloat, diagonal: Bool) {
        self.text = text; self.op = opacity; self.diagonal = diagonal
        super.init(bounds: bounds, forType: .stamp, withProperties: nil)
    }
    required init?(coder: NSCoder) { fatalError() }
    override func draw(with box: PDFDisplayBox, in context: CGContext) {
        guard let page = page else { return }
        let b = page.bounds(for: box)
        context.saveGState()
        let size = max(18, min(b.width, b.height) / CGFloat(max(6, text.count)) * 1.4)
        let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.boldSystemFont(ofSize: size),
                                                     .foregroundColor: NSColor.gray.withAlphaComponent(op)]
        let str = NSAttributedString(string: text, attributes: attrs)
        let ts = str.size()
        if diagonal {
            context.translateBy(x: b.midX, y: b.midY)
            context.rotate(by: .pi / 5)
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
            str.draw(at: NSPoint(x: -ts.width / 2, y: -ts.height / 2))
            NSGraphicsContext.restoreGraphicsState()
        } else {
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
            str.draw(at: NSPoint(x: b.maxX - ts.width - 24, y: 24))
            NSGraphicsContext.restoreGraphicsState()
        }
        context.restoreGState()
    }
}

/// Renders HTML off-screen, then runs the standard macOS print panel.
final class HTMLPrinter: NSObject, WKNavigationDelegate {
    private static var active: [HTMLPrinter] = []
    private let webView: WKWebView
    private let jobTitle: String
    private weak var parent: NSWindow?
    private let done: (Result<Bool, Error>) -> Void

    init(html: String, jobTitle: String, parent: NSWindow?, done: @escaping (Result<Bool, Error>) -> Void) {
        self.jobTitle = jobTitle
        self.parent = parent
        self.done = done
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 816, height: 1056))
        super.init()
        webView.navigationDelegate = self
        HTMLPrinter.active.append(self)
        webView.loadHTMLString(html, baseURL: nil)
    }

    private func finish(_ r: Result<Bool, Error>) {
        HTMLPrinter.active.removeAll { $0 === self }
        done(r)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(.failure(error)) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(.failure(error)) }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            let info = NSPrintInfo.shared
            info.horizontalPagination = .automatic
            info.verticalPagination = .automatic
            info.isHorizontallyCentered = false
            info.isVerticallyCentered = false
            let op: NSPrintOperation
            if #available(macOS 11.0, *) {
                op = webView.printOperation(with: info)
            } else {
                op = NSPrintOperation(view: webView, printInfo: info)
            }
            op.jobTitle = self.jobTitle
            op.showsPrintPanel = true
            op.showsProgressPanel = true
            if let w = self.parent {
                op.runModal(for: w, delegate: self, didRun: nil, contextInfo: nil)
                self.finish(.success(true))
            } else {
                let ok = op.run()
                self.finish(.success(ok))
            }
        }
    }
}
