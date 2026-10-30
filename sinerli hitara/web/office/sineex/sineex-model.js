/**
 * Sinerli Hitara — model data: Workbook, Sheet, Axis (ukuran baris/kolom), rekalkulasi,
 * spill larik dinamis, transaksi undo, operasi struktur, dan serialisasi.
 * Tidak menyentuh DOM; bisa diuji di Node.
 */
(function (root) {
    'use strict';

    var F = (typeof module !== 'undefined' && module.exports) ? require('./sineex-formula.js') : root.SXF;
    var COLS = F.MAX_COLS;
    function key(r, c) { return r * COLS + c; }
    function unkey(k) { return { r: Math.floor(k / COLS), c: k % COLS }; }
    function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

    // =============================================================== Axis
    function Axis(count, def) {
        this.count = count;
        this.def = def;
        this.sizes = {};
        this.hidden = {};
        this.filtered = {};
        this._cache = null;
    }
    Axis.prototype.invalidate = function () { this._cache = null; };
    Axis.prototype.isHidden = function (i) { return !!(this.hidden[i] || this.filtered[i]); };
    Axis.prototype.rawSize = function (i) { return this.sizes[i] !== undefined ? this.sizes[i] : this.def; };
    Axis.prototype.size = function (i) { return this.isHidden(i) ? 0 : this.rawSize(i); };
    Axis.prototype.build = function () {
        var idx = {};
        Object.keys(this.sizes).forEach(function (k) { idx[k] = 1; });
        Object.keys(this.hidden).forEach(function (k) { idx[k] = 1; });
        Object.keys(this.filtered).forEach(function (k) { idx[k] = 1; });
        var list = Object.keys(idx).map(Number).filter(function (i) { return i < this.count; }, this).sort(function (a, b) { return a - b; });
        var cum = [], acc = 0;
        for (var j = 0; j < list.length; j++) { acc += this.size(list[j]) - this.def; cum.push(acc); }
        this._cache = { list: list, cum: cum };
        return this._cache;
    };
    /** Posisi piksel awal indeks i. */
    Axis.prototype.pos = function (i) {
        var c = this._cache || this.build();
        var lo = 0, hi = c.list.length - 1, n = -1;
        while (lo <= hi) { var mid = (lo + hi) >> 1; if (c.list[mid] < i) { n = mid; lo = mid + 1; } else hi = mid - 1; }
        return i * this.def + (n >= 0 ? c.cum[n] : 0);
    };
    Axis.prototype.total = function () { return this.pos(this.count); };
    /** Indeks pada posisi piksel. */
    Axis.prototype.indexAt = function (px) {
        if (px <= 0) return 0;
        var lo = 0, hi = this.count - 1;
        while (lo < hi) {
            var mid = (lo + hi + 1) >> 1;
            if (this.pos(mid) <= px) lo = mid; else hi = mid - 1;
        }
        while (lo < this.count - 1 && this.size(lo) === 0 && this.pos(lo + 1) <= px) lo++;
        return lo;
    };
    function shiftMap(map, at, n) {
        var out = {};
        Object.keys(map).forEach(function (k) {
            var i = +k;
            if (n > 0) out[i >= at ? i + n : i] = map[k];
            else if (i < at) out[i] = map[k];
            else if (i >= at - n) out[i + n] = map[k];
        });
        return out;
    }
    Axis.prototype.insert = function (at, n) {
        this.sizes = shiftMap(this.sizes, at, n);
        this.hidden = shiftMap(this.hidden, at, n);
        this.filtered = shiftMap(this.filtered, at, n);
        this.count += n;
        this.invalidate();
    };
    Axis.prototype.remove = function (at, n) {
        this.sizes = shiftMap(this.sizes, at, -n);
        this.hidden = shiftMap(this.hidden, at, -n);
        this.filtered = shiftMap(this.filtered, at, -n);
        this.count = Math.max(1, this.count - n);
        this.invalidate();
    };
    Axis.prototype.toJSON = function () { return { count: this.count, def: this.def, sizes: this.sizes, hidden: Object.keys(this.hidden).map(Number) }; };
    Axis.fromJSON = function (o, dCount, dDef) {
        var a = new Axis((o && o.count) || dCount, (o && o.def) || dDef);
        if (o) {
            a.sizes = o.sizes || {};
            (o.hidden || []).forEach(function (i) { a.hidden[i] = true; });
        }
        return a;
    };

    // ============================================================== Sheet
    var sheetSeq = 1;
    function Sheet(name) {
        this.id = sheetSeq++;
        this.name = name;
        this.cells = new Map();
        this.rows = new Axis(1000, 22);
        this.cols = new Axis(52, 96);
        this.merges = [];
        this.freeze = { r: 0, c: 0 };
        this.filter = null;
        this.cf = [];
        this.dv = [];
        this.charts = [];
        this.images = [];
        this.showGrid = true;
        this.showHeaders = true;
        this.showFormulas = false;
        this.tabColor = null;
        this.zoom = 1;
        this.protected = false;
        this.pageSetup = { orientation: 'portrait', size: 'a4', fit: 'width', grid: false, headings: false, area: null, margins: 'normal' };
        this.spill = new Map();
        this.spillOwner = new Map();
        this.spillPrev = new Map();
        this._bounds = null;
    }
    Sheet.prototype.cell = function (r, c) { return this.cells.get(key(r, c)); };
    Sheet.prototype.bounds = function () {
        if (this._bounds) return this._bounds;
        var r2 = -1, c2 = -1;
        this.cells.forEach(function (cell, k) {
            if (cell.f === undefined && (cell.v === null || cell.v === undefined)) return;
            var p = unkey(k);
            if (p.r > r2) r2 = p.r;
            if (p.c > c2) c2 = p.c;
        });
        this.spill.forEach(function (sp) { r2 = Math.max(r2, sp.r + sp.h - 1); c2 = Math.max(c2, sp.c + sp.w - 1); });
        this._bounds = { r2: r2, c2: c2 };
        return this._bounds;
    };
    Sheet.prototype.styledBounds = function () {
        var r2 = -1, c2 = -1;
        this.cells.forEach(function (cell, k) { var p = unkey(k); if (p.r > r2) r2 = p.r; if (p.c > c2) c2 = p.c; });
        return { r2: r2, c2: c2 };
    };
    Sheet.prototype.mergeAt = function (r, c) {
        for (var i = 0; i < this.merges.length; i++) {
            var m = this.merges[i];
            if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) return m;
        }
        return null;
    };
    Sheet.prototype.meta = function () {
        return {
            name: this.name, rows: this.rows.toJSON(), cols: this.cols.toJSON(), merges: this.merges, freeze: this.freeze,
            filter: this.filter, cf: this.cf, dv: this.dv, charts: this.charts, images: this.images,
            showGrid: this.showGrid, showHeaders: this.showHeaders, showFormulas: this.showFormulas, tabColor: this.tabColor, zoom: this.zoom, protected: this.protected,
            pageSetup: this.pageSetup
        };
    };
    Sheet.prototype.applyMeta = function (m) {
        this.name = m.name;
        this.rows = Axis.fromJSON(m.rows, 1000, 22);
        this.cols = Axis.fromJSON(m.cols, 52, 96);
        this.merges = clone(m.merges) || [];
        this.freeze = clone(m.freeze) || { r: 0, c: 0 };
        this.filter = clone(m.filter) || null;
        this.cf = clone(m.cf) || [];
        this.dv = clone(m.dv) || [];
        this.charts = clone(m.charts) || [];
        this.images = clone(m.images) || [];
        this.showGrid = m.showGrid !== false;
        this.showHeaders = m.showHeaders !== false;
        this.showFormulas = !!m.showFormulas;
        this.tabColor = m.tabColor || null;
        this.zoom = m.zoom || 1;
        this.protected = !!m.protected;
        this.pageSetup = Object.assign({ orientation: 'portrait', size: 'a4', fit: 'width', grid: false, headings: false, area: null, margins: 'normal' }, clone(m.pageSetup) || {});
    };

    function cloneCell(cell) {
        if (!cell) return null;
        var o = {};
        if (cell.f !== undefined) o.f = cell.f; else if (cell.v !== undefined && cell.v !== null) o.v = cell.v instanceof F.XErr ? { e: cell.v.code } : cell.v;
        if (cell.s) o.s = clone(cell.s);
        if (cell.note) o.note = cell.note;
        if (cell.link) o.link = cell.link;
        return o;
    }
    function reviveCell(o) {
        if (!o) return null;
        var c = {};
        if (o.f !== undefined) c.f = o.f;
        else if (o.v !== undefined) c.v = o.v && typeof o.v === 'object' && o.v.e ? (F.ERR[o.v.e] || F.E.VALUE) : o.v;
        if (o.s) c.s = clone(o.s);
        if (o.note) c.note = o.note;
        if (o.link) c.link = o.link;
        return c;
    }

    // =========================================================== Workbook
    function Workbook() {
        this.sheets = [];
        this.active = 0;
        this.names = {};
        this.calcId = 0;
        this.tx = null;
        this.listeners = [];
        this.volatileFound = false;
    }
    Workbook.prototype.on = function (fn) { this.listeners.push(fn); };
    Workbook.prototype.emit = function (type, data) { this.listeners.forEach(function (fn) { fn(type, data); }); };

    Workbook.prototype.activeSheet = function () { return this.sheets[this.active]; };
    Workbook.prototype.sheetById = function (id) { for (var i = 0; i < this.sheets.length; i++) if (this.sheets[i].id === id) return this.sheets[i]; return null; };
    Workbook.prototype.sheetByName = function (name) {
        var low = String(name).toLowerCase();
        for (var i = 0; i < this.sheets.length; i++) if (this.sheets[i].name.toLowerCase() === low) return this.sheets[i];
        return null;
    };
    Workbook.prototype.uniqueName = function (base) {
        var name = base, n = 1;
        while (this.sheetByName(name)) name = base.replace(/\s*\d*$/, '') + ' ' + (++n);
        return name;
    };
    Workbook.prototype.addSheet = function (name, index) {
        var s = new Sheet(this.uniqueName(name || 'Sheet1'));
        if (index === undefined) this.sheets.push(s); else this.sheets.splice(index, 0, s);
        return s;
    };

    // --------------------------------------------------------- transaksi
    Workbook.prototype.begin = function (label) {
        if (this.tx) { this.tx.depth++; return this.tx; }
        this.tx = { label: label, depth: 1, cells: new Map(), meta: new Map(), wb: null };
        return this.tx;
    };
    Workbook.prototype.recordCell = function (sheet, k) {
        if (!this.tx) return;
        var m = this.tx.cells.get(sheet.id);
        if (!m) { m = new Map(); this.tx.cells.set(sheet.id, m); }
        if (!m.has(k)) m.set(k, cloneCell(sheet.cells.get(k)));
    };
    Workbook.prototype.recordMeta = function (sheet) {
        if (this.tx && !this.tx.meta.has(sheet.id)) this.tx.meta.set(sheet.id, clone(sheet.meta()));
    };
    /** Operasi besar (sisip/hapus baris, urut, tambah sheet): simpan seluruh buku kerja. */
    Workbook.prototype.recordAll = function () {
        if (this.tx && !this.tx.wb) this.tx.wb = this.snapshot();
    };
    Workbook.prototype.commit = function () {
        var tx = this.tx;
        if (!tx) return null;
        if (--tx.depth > 0) return null;
        this.tx = null;
        var self = this;
        var entry;
        if (tx.wb) {
            var before = tx.wb, after = this.snapshot();
            entry = { label: tx.label, undo: function () { self.restore(before); }, redo: function () { self.restore(after); } };
        } else {
            var cellAfter = new Map(), metaAfter = new Map();
            var changed = false;
            tx.cells.forEach(function (m, sid) {
                var sh = self.sheetById(sid);
                var am = new Map();
                m.forEach(function (b, k) {
                    var a = cloneCell(sh.cells.get(k));
                    if (JSON.stringify(a) !== JSON.stringify(b)) changed = true;
                    am.set(k, a);
                });
                cellAfter.set(sid, am);
            });
            tx.meta.forEach(function (b, sid) {
                var a = clone(self.sheetById(sid).meta());
                if (JSON.stringify(a) !== JSON.stringify(b)) changed = true;
                metaAfter.set(sid, a);
            });
            if (!changed) { this.recalc(); this.emit('change', { label: tx.label, noop: true }); return null; }
            var apply = function (cells, metas) {
                cells.forEach(function (m, sid) {
                    var sh = self.sheetById(sid);
                    if (!sh) return;
                    m.forEach(function (c, k) { var rc = reviveCell(c); if (rc) sh.cells.set(k, rc); else sh.cells.delete(k); });
                    sh._bounds = null;
                });
                metas.forEach(function (m, sid) { var sh = self.sheetById(sid); if (sh) sh.applyMeta(m); });
                self.recalc();
                self.emit('change', { history: true });
            };
            entry = { label: tx.label, undo: function () { apply(tx.cells, tx.meta); }, redo: function () { apply(cellAfter, metaAfter); } };
        }
        this.recalc();
        this.emit('change', { label: tx.label });
        this.emit('commit', entry);
        return entry;
    };
    Workbook.prototype.change = function (label, fn) {
        this.begin(label);
        try { fn(); } finally { this.commit(); }
    };

    // ---------------------------------------------------------- sel
    Workbook.prototype.setCell = function (sheet, r, c, cell) {
        var k = key(r, c);
        this.recordCell(sheet, k);
        if (!cell || (cell.f === undefined && (cell.v === null || cell.v === undefined) && !cell.s && !cell.note && !cell.link)) sheet.cells.delete(k);
        else {
            delete cell.ast;
            delete cell.calc;
            sheet.cells.set(k, cell);
        }
        sheet._bounds = null;
        if (r >= sheet.rows.count - 50) { this.recordMeta(sheet); sheet.rows.count = Math.min(F.MAX_ROWS, r + 500); sheet.rows.invalidate(); }
        if (c >= sheet.cols.count - 5) { this.recordMeta(sheet); sheet.cols.count = Math.min(F.MAX_COLS, c + 20); sheet.cols.invalidate(); }
    };

    /** Menulis ketikan pengguna ke sel (angka, teks, rumus, tanggal, …). */
    Workbook.prototype.setInput = function (sheet, r, c, text) {
        var old = sheet.cell(r, c);
        var cell = { s: old && old.s ? clone(old.s) : undefined, note: old && old.note, link: old && old.link };
        if (text === null || text === undefined || text === '') {
            this.setCell(sheet, r, c, cell.s || cell.note || cell.link ? cell : null);
            return;
        }
        text = String(text);
        if (text.charAt(0) === '=' && text.length > 1 && !(cell.s && cell.s.nf === '@')) {
            cell.f = F.canonical(normalizeFormula(text.slice(1)));
        } else if (cell.s && cell.s.nf === '@') {
            cell.v = text;
        } else {
            var p = F.parseInput(text);
            cell.v = p.v;
            if (p.fmt && (!cell.s || !cell.s.nf || cell.s.nf === 'General' || (F.isDateFormat(p.fmt) && !F.isDateFormat(cell.s.nf)))) {
                cell.s = Object.assign({}, cell.s || {}, { nf: p.fmt });
            }
        }
        this.setCell(sheet, r, c, cell);
    };

    /**
     * Rumus gaya Excel Indonesia (=ROUND(A1*0,5;2)) dinormalkan: bila ada titik koma
     * sebagai pemisah argumen, koma di antara angka dianggap desimal.
     */
    function normalizeFormula(f) {
        var hasSemi = false, q = false, depth = 0, i;
        for (i = 0; i < f.length; i++) {
            if (f[i] === '"') q = !q;
            else if (!q && f[i] === '{') depth++;
            else if (!q && f[i] === '}') depth--;
            else if (!q && depth === 0 && f[i] === ';') { hasSemi = true; break; }
        }
        if (!hasSemi) return f;
        var out = '';
        q = false; depth = 0;
        for (i = 0; i < f.length; i++) {
            var ch = f[i];
            if (ch === '"') q = !q;
            if (!q && ch === '{') depth++;
            if (!q && ch === '}') depth--;
            if (!q && depth === 0 && ch === ',' && /\d/.test(f[i - 1] || '') && /\d/.test(f[i + 1] || '')) { out += '.'; continue; }
            if (!q && depth === 0 && ch === ';') { out += ','; continue; }
            out += ch;
        }
        return out;
    }

    Workbook.prototype.editText = function (sheet, r, c) {
        var cell = sheet.cell(r, c);
        if (!cell) return '';
        if (cell.f !== undefined) return '=' + cell.f;
        var v = cell.v;
        if (v === null || v === undefined) return '';
        if (v instanceof F.XErr) return v.code;
        if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
        if (typeof v === 'number') {
            var nf = cell.s && cell.s.nf;
            if (nf && F.isDateFormat(nf)) {
                var dt = F.serialToDate(v);
                var hasTime = /h|s/i.test(nf);
                var hasDate = /[dy]/i.test(nf) || /m{3,}/i.test(nf);
                var d = F.dmyOrder === 'mdy' ? dt.m + '/' + dt.d + '/' + dt.y : dt.d + '/' + dt.m + '/' + dt.y;
                var t = String(dt.H).padStart(2, '0') + ':' + String(dt.M).padStart(2, '0') + (dt.S ? ':' + String(dt.S).padStart(2, '0') : '');
                return hasDate && hasTime ? d + ' ' + t : hasTime && !hasDate ? t : d;
            }
            if (nf && /%/.test(nf)) return F.general(F.roundTo(v * 100, 10)) + '%';
            return F.general(v);
        }
        if (cell.s && cell.s.nf === '@') return v;
        // Teks yang akan terbaca sebagai angka/rumus saat diketik ulang diberi apostrof.
        if (/^[=]/.test(v) || typeof F.parseInput(v).v !== 'string') return "'" + v;
        return v;
    };

    Workbook.prototype.setStyle = function (sheet, r1, c1, r2, c2, patch) {
        for (var r = r1; r <= r2; r++) {
            for (var c = c1; c <= c2; c++) {
                var k = key(r, c);
                this.recordCell(sheet, k);
                var cell = sheet.cells.get(k);
                var s = Object.assign({}, cell && cell.s ? cell.s : {});
                if (typeof patch === 'function') s = patch(s, r, c) || s;
                else Object.keys(patch).forEach(function (p) { if (patch[p] === null || patch[p] === undefined) delete s[p]; else s[p] = patch[p]; });
                Object.keys(s).forEach(function (p) { if (s[p] === null || s[p] === undefined || s[p] === false && p !== 'lk') delete s[p]; });
                if (!cell) { if (!Object.keys(s).length) continue; cell = {}; sheet.cells.set(k, cell); }
                if (Object.keys(s).length) cell.s = s; else delete cell.s;
                if (cell.f === undefined && (cell.v === null || cell.v === undefined) && !cell.s && !cell.note && !cell.link) sheet.cells.delete(k);
            }
        }
    };

    Workbook.prototype.styleAt = function (sheet, r, c) {
        var cell = sheet.cell(r, c);
        return (cell && cell.s) || {};
    };

    // -------------------------------------------------------- nilai/kalkulasi
    Workbook.prototype.ctxFor = function (sheet, r, c) {
        var self = this;
        return {
            sheetId: sheet.id, row: r, col: c,
            getCell: function (sid, rr, cc) { return self.valueById(sid, rr, cc); },
            rangeValues: function (ref) { return self.rangeValues(ref); },
            rangeFirstCol: function (ref, g) { return self.rangeFirstCol(ref, g); },
            sheetByName: function (name) { var s = self.sheetByName(name); return s ? s.id : null; },
            resolveName: function (name) { return self.resolveName(name, sheet); },
            isRowHidden: function (sid, rr, includeManual) { var sh = self.sheetById(sid); return sh ? (!!sh.rows.filtered[rr] || (includeManual && !!sh.rows.hidden[rr])) : false; },
            isSubtotalCell: function (sid, rr, cc) { var sh = self.sheetById(sid); var cl = sh && sh.cell(rr, cc); return !!(cl && cl.f && /SUBTOTAL\s*\(/i.test(cl.f)); },
            isFormula: function (sid, rr, cc) { var sh = self.sheetById(sid); var cl = sh && sh.cell(rr, cc); return !!(cl && cl.f !== undefined); },
            formulaText: function (sid, rr, cc) { var sh = self.sheetById(sid); var cl = sh && sh.cell(rr, cc); return cl && cl.f !== undefined ? '=' + cl.f : null; },
            sheetIndex: function (sid) { for (var i = 0; i < self.sheets.length; i++) if (self.sheets[i].id === sid) return i + 1; return null; },
            sheetCount: function () { return self.sheets.length; },
            markVolatile: function () { self.volatileFound = true; }
        };
    };

    Workbook.prototype.resolveName = function (name, sheet) {
        var def = this.names[String(name).toUpperCase()];
        if (def === undefined) return null;
        var ref = typeof def === 'string' ? def : def.ref;
        var p = F.parseRange(ref.replace(/^=/, ''));
        if (!p) {
            var n = F.numberFromString(ref.replace(/^=/, ''));
            if (n !== null) return n;
            // Nama berisi rumus (mis. =LAMBDA(x, x*2) atau =Lembar1!A1*2).
            var src = ref.replace(/^=/, '');
            if (/^"[^"]*"$/.test(src)) return src.slice(1, -1);
            var key = '#name:' + String(name).toUpperCase();
            if (evalStack.indexOf(key) !== -1) return F.E.CIRC;
            var ast;
            try { ast = F.parse(src); } catch (e) { return src; }
            if (ast.type === 'name') return src;
            evalStack.push(key);
            try { return F.evaluate(ast, this.ctxFor(sheet || this.sheets[0], 0, 0)); } finally { evalStack.pop(); }
        }
        var sh = p.sheet ? this.sheetByName(p.sheet) : sheet;
        if (!sh) return F.E.REF;
        return new F.RangeRef(sh.id, p.r1, p.c1, p.r2, p.c2);
    };

    Workbook.prototype.valueById = function (sid, r, c) {
        var sh = this.sheetById(sid);
        return sh ? this.value(sh, r, c) : F.E.REF;
    };

    Workbook.prototype.rangeValues = function (ref) {
        var sh = this.sheetById(ref.sheetId);
        if (!sh) throw F.E.REF;
        var b = sh.bounds();
        var r2 = Math.min(ref.r2, Math.max(b.r2, ref.r1)), c2 = Math.min(ref.c2, Math.max(b.c2, ref.c1));
        var h = ref.r2 - ref.r1 + 1, w = ref.c2 - ref.c1 + 1;
        // Rentang seluruh kolom/baris dipotong ke area terpakai.
        if (h > 100000) h = Math.max(0, r2 - ref.r1 + 1);
        if (w > 5000) w = Math.max(0, c2 - ref.c1 + 1);
        if (h * w > 5000000) throw F.E.NUM;
        // Selama recalc(), rentang yang sama dibaca sekali saja. Tanpa ini 3.000
        // VLOOKUP ke A1:B3000 = 18 juta pembacaan sel per edit (±4 detik main
        // thread di laptop, jauh lebih lama di HP → "Page Unresponsive").
        // Kuncinya memuat h/w hasil potongan, jadi rentang yang ikut membesar
        // karena tumpahan baru tetap dibaca ulang. Baris di-share (fungsi tidak
        // pernah memutasinya), larik luarnya disalin.
        var rc = this._rangeCache, ck;
        if (rc) {
            ck = sh.id + ':' + ref.r1 + ':' + ref.c1 + ':' + h + ':' + w;
            var hit = rc.get(ck);
            if (hit) return hit.slice();
        }
        var circBefore = this.circular, circHere = true;
        this.circular = false;
        var out = new Array(Math.max(h, 1));
        try {
            for (var i = 0; i < Math.max(h, 1); i++) {
                var row = new Array(Math.max(w, 1));
                for (var j = 0; j < Math.max(w, 1); j++) row[j] = h && w ? this.value(sh, ref.r1 + i, ref.c1 + j) : null;
                out[i] = row;
            }
            circHere = this.circular;
        } finally {
            this.circular = circBefore || this.circular;
        }
        // Rentang yang memuat sel yang sedang dihitung (melingkar) tidak disimpan.
        if (rc && !circHere) rc.set(ck, out);
        return rc ? out.slice() : out;
    };

    /**
     * Kolom pertama rentang (kunci VLOOKUP/XLOOKUP/MATCH vertikal). Selama
     * recalc() disimpan bersama rentangnya supaya ribuan pencarian ke tabel yang
     * sama tidak menyalin kolom kunci berulang-ulang. Hasilnya hanya dibaca.
     */
    Workbook.prototype.rangeFirstCol = function (ref, g) {
        g = g || this.rangeValues(ref);
        var cc = this._rangeCache && this._colCache;
        // Objek baris dibuat sekali per entri cache rentang (tidak pernah dipakai
        // bersama rentang lain), jadi baris pertamanya bisa jadi kunci.
        var hit = cc && g.length ? cc.get(g[0]) : null;
        if (hit && hit.length === g.length) return hit;
        var col = new Array(g.length);
        for (var i = 0; i < g.length; i++) col[i] = g[i][0];
        if (cc && g.length) cc.set(g[0], col);
        return col;
    };

    var evalStack = [];
    Workbook.prototype.value = function (sheet, r, c) {
        var k = key(r, c);
        var cell = sheet.cells.get(k);
        if (!cell || (cell.f === undefined && (cell.v === null || cell.v === undefined))) {
            var owner = sheet.spillOwner.get(k);
            if (owner === undefined) {
                var hint = sheet.spillPrev.get(k);
                if (hint !== undefined) {
                    var hp = unkey(hint);
                    var hc = sheet.cells.get(hint);
                    if (hc && hc.f !== undefined && hc.calc !== this.calcId) { this.value(sheet, hp.r, hp.c); owner = sheet.spillOwner.get(k); }
                }
            }
            if (owner !== undefined) {
                var sp = sheet.spill.get(owner);
                var op = unkey(owner);
                if (sp && sp.arr) return sp.arr.get(r - op.r, c - op.c);
            }
            return null;
        }
        if (cell.f === undefined) return cell.v;
        if (cell.calc === this.calcId) return cell.v;
        var sk = sheet.id + ':' + k;
        if (evalStack.indexOf(sk) !== -1) { this.circular = true; return F.E.CIRC; }
        if (evalStack.length > 2000) return F.E.CALC;
        evalStack.push(sk);
        var result;
        try {
            if (!cell.ast) {
                try { cell.ast = F.parse(cell.f); } catch (e) { cell.ast = { type: 'err', v: '#NAME?' }; cell.parseError = true; }
            }
            result = F.evaluate(cell.ast, this.ctxFor(sheet, r, c));
            // Rujukan dievaluasi selagi sel ini masih di tumpukan, supaya =A1 ↔ =A2 terdeteksi melingkar.
            if (result instanceof F.RangeRef) {
                if (result.h() === 1 && result.w() === 1) result = this.valueById(result.sheetId, result.r1, result.c1);
                else result = new F.Arr(this.rangeValues(result));
            }
        } catch (e) {
            result = e instanceof F.XErr ? e : F.E.VALUE;
            if (!(e instanceof F.XErr) && typeof console !== 'undefined') console.warn('[Sinerli Hitara] eval', cell.f, e);
        }
        evalStack.pop();
        if (result instanceof F.Arr) {
            var h = result.h(), w = result.w();
            if (h === 1 && w === 1) result = result.get(0, 0);
            else result = this.registerSpill(sheet, r, c, result);
        } else if (sheet.spill.has(k)) {
            this.clearSpill(sheet, k);
        }
        if (result === null || result === undefined) result = 0;
        else if (result instanceof F.Lambda) result = F.E.CALC;
        cell.v = result;
        cell.calc = this.calcId;
        return result;
    };

    Workbook.prototype.clearSpill = function (sheet, k) {
        var sp = sheet.spill.get(k);
        if (!sp) return;
        for (var i = 0; i < sp.h; i++) for (var j = 0; j < sp.w; j++) {
            var tk = key(sp.r + i, sp.c + j);
            if (sheet.spillOwner.get(tk) === k) sheet.spillOwner.delete(tk);
        }
        sheet.spill.delete(k);
    };

    Workbook.prototype.registerSpill = function (sheet, r, c, arr) {
        var k = key(r, c);
        this.clearSpill(sheet, k);
        var h = arr.h(), w = arr.w();
        for (var i = 0; i < h; i++) for (var j = 0; j < w; j++) {
            if (!i && !j) continue;
            var tk = key(r + i, c + j);
            var tc = sheet.cells.get(tk);
            var ownerK = sheet.spillOwner.get(tk);
            if ((tc && (tc.f !== undefined || (tc.v !== null && tc.v !== undefined))) || (ownerK !== undefined && ownerK !== k) || r + i >= F.MAX_ROWS || c + j >= F.MAX_COLS) {
                sheet.spill.set(k, { r: r, c: c, h: 1, w: 1, blocked: true });
                return F.E.SPILL;
            }
        }
        sheet.spill.set(k, { r: r, c: c, h: h, w: w, arr: arr });
        for (var a = 0; a < h; a++) for (var b = 0; b < w; b++) if (a || b) sheet.spillOwner.set(key(r + a, c + b), k);
        sheet._bounds = null;
        var v0 = arr.get(0, 0);
        return v0 === null ? 0 : v0;
    };

    Workbook.prototype.recalc = function () {
        try {
            this._recalc();
        } finally {
            this._rangeCache = this._colCache = null;
        }
    };
    Workbook.prototype._recalc = function () {
        var self = this;
        for (var iter = 0; iter < 3; iter++) {
            this.calcId++;
            this._rangeCache = new Map();
            this._colCache = new Map();
            this.circular = false;
            this.volatileFound = false;
            var prevSig = [];
            this.sheets.forEach(function (sh) {
                sh.spillPrev = sh.spillOwner;
                prevSig.push(Array.from(sh.spill.keys()).join(',') + '|' + Array.from(sh.spill.values()).map(function (s) { return s.h + 'x' + s.w; }).join(','));
                sh.spill = new Map();
                sh.spillOwner = new Map();
                sh._bounds = null;
            });
            this.sheets.forEach(function (sh) {
                sh.cells.forEach(function (cell, k) {
                    if (cell.f !== undefined && cell.calc !== self.calcId) { var p = unkey(k); self.value(sh, p.r, p.c); }
                });
            });
            var changed = false;
            this.sheets.forEach(function (sh, i) {
                var sig = Array.from(sh.spill.keys()).join(',') + '|' + Array.from(sh.spill.values()).map(function (s) { return s.h + 'x' + s.w; }).join(',');
                if (sig !== prevSig[i]) changed = true;
                sh.spillPrev = new Map();
            });
            if (!changed) break;
            // Tumpahan berubah bentuk: hitung sekali lagi dengan peta yang baru.
            this.sheets.forEach(function (sh) { sh.spillPrev = sh.spillOwner; });
        }
    };

    /** Teks tampilan sel + warna/perataan bawaan. */
    Workbook.prototype.display = function (sheet, r, c) {
        var cell = sheet.cell(r, c);
        var v = this.value(sheet, r, c);
        var s = (cell && cell.s) || {};
        if (sheet.showFormulas && cell && cell.f !== undefined) return { text: '=' + cell.f, align: 'left', v: v };
        var f = F.format(v, s.nf);
        var align = s.ha || (typeof v === 'number' ? 'right' : typeof v === 'boolean' || v instanceof F.XErr ? 'center' : 'left');
        return { text: f.text, color: f.color, error: f.error, align: align, v: v };
    };

    // ------------------------------------------------------- struktur
    function adjustRange(rg, axis, at, n) {
        var a = axis === 'row' ? 'r' : 'c';
        var lo = rg[a + '1'], hi = rg[a + '2'];
        if (n > 0) {
            if (lo >= at) lo += n;
            if (hi >= at) hi += n;
        } else {
            var end = at - n - 1;
            if (lo >= at && hi <= end) return null;
            lo = lo < at ? lo : (lo > end ? lo + n : at);
            hi = hi < at ? hi : (hi > end ? hi + n : at - 1);
            if (hi < lo) return null;
        }
        var out = Object.assign({}, rg);
        out[a + '1'] = lo;
        out[a + '2'] = hi;
        return out;
    }
    F.adjustRangeObj = adjustRange;

    /** Sisip (n>0) atau hapus (n<0) baris/kolom beserta semua rujukan rumus. */
    Workbook.prototype.shift = function (sheet, axis, at, n) {
        var self = this;
        this.recordAll();
        var moved = new Map();
        sheet.cells.forEach(function (cell, k) {
            var p = unkey(k);
            var idx = axis === 'row' ? p.r : p.c;
            var ni;
            if (n > 0) ni = idx >= at ? idx + n : idx;
            else {
                if (idx >= at && idx < at - n) return;
                ni = idx >= at - n ? idx + n : idx;
            }
            var nk = axis === 'row' ? key(ni, p.c) : key(p.r, ni);
            if ((axis === 'row' && ni >= F.MAX_ROWS) || (axis === 'col' && ni >= F.MAX_COLS)) return;
            moved.set(nk, cell);
        });
        sheet.cells = moved;
        if (axis === 'row') { if (n > 0) sheet.rows.insert(at, n); else sheet.rows.remove(at, -n); }
        else { if (n > 0) sheet.cols.insert(at, n); else sheet.cols.remove(at, -n); }
        sheet.merges = sheet.merges.map(function (m) { return adjustRange(m, axis, at, n); }).filter(function (m) { return m && (m.r2 > m.r1 || m.c2 > m.c1); });
        sheet.cf.forEach(function (rule) { rule.ranges = rule.ranges.map(function (rg) { return adjustRange(rg, axis, at, n); }).filter(Boolean); });
        sheet.cf = sheet.cf.filter(function (rule) { return rule.ranges.length; });
        sheet.dv.forEach(function (rule) { rule.ranges = rule.ranges.map(function (rg) { return adjustRange(rg, axis, at, n); }).filter(Boolean); });
        sheet.dv = sheet.dv.filter(function (rule) { return rule.ranges.length; });
        if (sheet.filter) { var fr = adjustRange(sheet.filter, axis, at, n); sheet.filter = fr ? Object.assign(sheet.filter, fr) : null; }
        if (axis === 'row' && sheet.freeze.r > at) sheet.freeze.r = Math.max(at, sheet.freeze.r + n);
        if (axis === 'col' && sheet.freeze.c > at) sheet.freeze.c = Math.max(at, sheet.freeze.c + n);
        sheet.charts.forEach(function (ch) {
            var p = F.parseRange(ch.range);
            if (!p) return;
            var ps = p.sheet ? self.sheetByName(p.sheet) : null;
            if (ps && ps !== sheet) return;
            var nr = adjustRange(p, axis, at, n);
            if (nr) ch.range = (p.sheet ? F.quoteSheet(p.sheet) + '!' : '') + F.rangeAddr(nr.r1, nr.c1, nr.r2, nr.c2);
        });
        // Rumus di SEMUA sheet yang merujuk sheet ini.
        this.sheets.forEach(function (sh) {
            sh.cells.forEach(function (cell) {
                if (cell.f === undefined) return;
                var nf = F.adjustFormula(cell.f, axis, at, n, sheet.name, sh.name);
                if (nf !== cell.f) { cell.f = nf; delete cell.ast; }
            });
            sh.charts.forEach(function (ch) {
                if (sh === sheet) return;
                var p = F.parseRange(ch.range);
                if (p && p.sheet && p.sheet.toLowerCase() === sheet.name.toLowerCase()) {
                    var nr = adjustRange(p, axis, at, n);
                    if (nr) ch.range = F.quoteSheet(p.sheet) + '!' + F.rangeAddr(nr.r1, nr.c1, nr.r2, nr.c2);
                }
            });
        });
        Object.keys(this.names).forEach(function (nm) {
            var def = self.names[nm];
            var nf = F.adjustFormula(def, axis, at, n, sheet.name, '');
            self.names[nm] = nf;
        });
        sheet._bounds = null;
    };

    Workbook.prototype.renameSheet = function (sheet, name) {
        var old = sheet.name;
        this.recordAll();
        sheet.name = name;
        var self = this;
        this.sheets.forEach(function (sh) {
            sh.cells.forEach(function (cell) {
                if (cell.f === undefined) return;
                var nf = F.renameSheetInFormula(cell.f, old, name);
                if (nf !== cell.f) { cell.f = nf; delete cell.ast; }
            });
            sh.charts.forEach(function (ch) { ch.range = F.renameSheetInFormula(ch.range, old, name); });
        });
        Object.keys(this.names).forEach(function (nm) { self.names[nm] = F.renameSheetInFormula(self.names[nm], old, name); });
    };

    Workbook.prototype.deleteSheet = function (sheet) {
        if (this.sheets.length <= 1) return false;
        this.recordAll();
        var idx = this.sheets.indexOf(sheet);
        this.sheets.splice(idx, 1);
        var name = sheet.name.toLowerCase();
        this.sheets.forEach(function (sh) {
            sh.cells.forEach(function (cell) {
                if (cell.f === undefined) return;
                var nf = F.rewrite(cell.f, function (tk) { return tk.sheet && tk.sheet.toLowerCase() === name ? '#REF!' : null; });
                if (nf !== cell.f) { cell.f = nf; delete cell.ast; }
            });
        });
        this.active = Math.min(this.active, this.sheets.length - 1);
        return true;
    };

    Workbook.prototype.duplicateSheet = function (sheet) {
        this.recordAll();
        var copy = new Sheet(this.uniqueName(sheet.name + ' (2)'));
        var m = clone(sheet.meta());
        m.name = copy.name;
        copy.applyMeta(m);
        copy.charts.forEach(function (ch) { ch.id = 'ch' + Math.random().toString(36).slice(2, 9); });
        sheet.cells.forEach(function (cell, k) { copy.cells.set(k, reviveCell(cloneCell(cell))); });
        this.sheets.splice(this.sheets.indexOf(sheet) + 1, 0, copy);
        return copy;
    };

    Workbook.prototype.moveSheet = function (from, to) {
        this.recordAll();
        var s = this.sheets.splice(from, 1)[0];
        this.sheets.splice(to, 0, s);
        this.active = to;
    };

    // --------------------------------------------------- merge & urut
    Workbook.prototype.merge = function (sheet, r1, c1, r2, c2, keepAll) {
        this.recordMeta(sheet);
        var self = this;
        sheet.merges = sheet.merges.filter(function (m) { return m.r2 < r1 || m.r1 > r2 || m.c2 < c1 || m.c1 > c2; });
        if (r1 === r2 && c1 === c2) return;
        var texts = [];
        for (var r = r1; r <= r2; r++) for (var c = c1; c <= c2; c++) {
            if (r === r1 && c === c1) continue;
            var cell = sheet.cell(r, c);
            if (cell && (cell.f !== undefined || (cell.v !== null && cell.v !== undefined))) {
                if (keepAll) texts.push(F.format(self.value(sheet, r, c), cell.s && cell.s.nf).text);
                var copy = cloneCell(cell);
                delete copy.f; delete copy.v;
                self.setCell(sheet, r, c, reviveCell(copy));
            }
        }
        if (keepAll && texts.length) {
            var first = F.format(this.value(sheet, r1, c1), this.styleAt(sheet, r1, c1).nf).text;
            this.setInput(sheet, r1, c1, [first].concat(texts).filter(Boolean).join(' '));
        }
        sheet.merges.push({ r1: r1, c1: c1, r2: r2, c2: c2 });
    };
    Workbook.prototype.unmerge = function (sheet, r1, c1, r2, c2) {
        this.recordMeta(sheet);
        sheet.merges = sheet.merges.filter(function (m) { return m.r2 < r1 || m.r1 > r2 || m.c2 < c1 || m.c1 > c2; });
    };

    /** Mengurutkan baris dalam rentang. keys: [{c, desc}] (indeks kolom absolut). */
    Workbook.prototype.sortRange = function (sheet, r1, c1, r2, c2, keys, opts) {
        opts = opts || {};
        var self = this;
        var rows = [];
        for (var r = r1; r <= r2; r++) {
            var cells = [];
            for (var c = c1; c <= c2; c++) cells.push(cloneCell(sheet.cell(r, c)));
            rows.push({ r: r, cells: cells, keys: keys.map(function (kk) { return self.value(sheet, r, kk.c); }) });
        }
        rows.sort(function (a, b) {
            for (var i = 0; i < keys.length; i++) {
                var x = a.keys[i], y = b.keys[i];
                var xb = x === null || x === '' , yb = y === null || y === '';
                if (xb && yb) continue;
                if (xb) return 1;
                if (yb) return -1;
                var cmp;
                if (keys[i].custom) {
                    var ia = keys[i].custom.indexOf(String(x)), ib = keys[i].custom.indexOf(String(y));
                    cmp = (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
                } else if (opts.caseSensitive && typeof x === 'string' && typeof y === 'string') cmp = x < y ? -1 : x > y ? 1 : 0;
                else cmp = F.compare('<', x, y) ? -1 : F.compare('>', x, y) ? 1 : 0;
                if (cmp) return keys[i].desc ? -cmp : cmp;
            }
            return a.r - b.r;
        });
        rows.forEach(function (row, i) {
            var targetR = r1 + i;
            var dr = targetR - row.r;
            row.cells.forEach(function (cell, j) {
                var c = cloneCell(cell);
                if (c && c.f !== undefined && dr) c.f = F.shiftFormula(c.f, dr, 0);
                self.setCell(sheet, targetR, c1 + j, reviveCell(c));
            });
        });
    };

    // ------------------------------------------------------ salin/tempel
    /** Mengambil blok sel untuk papan klip internal. */
    Workbook.prototype.copyBlock = function (sheet, r1, c1, r2, c2) {
        var out = { r1: r1, c1: c1, h: r2 - r1 + 1, w: c2 - c1 + 1, sheetId: sheet.id, cells: [], merges: [], values: [] };
        for (var r = r1; r <= r2; r++) {
            var row = [], vals = [];
            for (var c = c1; c <= c2; c++) {
                row.push(cloneCell(sheet.cell(r, c)));
                vals.push(this.display(sheet, r, c).text);
            }
            out.cells.push(row);
            out.values.push(vals);
        }
        sheet.merges.forEach(function (m) {
            if (m.r1 >= r1 && m.r2 <= r2 && m.c1 >= c1 && m.c2 <= c2) out.merges.push({ r1: m.r1 - r1, c1: m.c1 - c1, r2: m.r2 - r1, c2: m.c2 - c1 });
        });
        return out;
    };

    /** mode: 'all' | 'values' | 'formulas' | 'formats' */
    Workbook.prototype.pasteBlock = function (sheet, r0, c0, block, mode, opts) {
        opts = opts || {};
        var self = this;
        mode = mode || 'all';
        this.recordMeta(sheet);
        var reps = opts.fillH && opts.fillW ? { h: Math.max(1, Math.floor(opts.fillH / block.h)), w: Math.max(1, Math.floor(opts.fillW / block.w)) } : { h: 1, w: 1 };
        for (var ry = 0; ry < reps.h; ry++) for (var rx = 0; rx < reps.w; rx++) {
            for (var i = 0; i < block.h; i++) for (var j = 0; j < block.w; j++) {
                var src = block.cells[i][j];
                var tr = r0 + ry * block.h + i, tc = c0 + rx * block.w + j;
                if (tr >= F.MAX_ROWS || tc >= F.MAX_COLS) continue;
                var cur = cloneCell(sheet.cell(tr, tc)) || {};
                var next;
                if (mode === 'formats') {
                    next = Object.assign({}, cur);
                    if (src && src.s) next.s = clone(src.s); else delete next.s;
                } else if (mode === 'values') {
                    next = Object.assign({}, cur);
                    delete next.f;
                    var srcSheet = self.sheetById(block.sheetId);
                    var val = src && src.f !== undefined && srcSheet ? self.value(srcSheet, block.r1 + i, block.c1 + j) : src ? src.v : null;
                    if (val instanceof F.XErr) next.v = { e: val.code };
                    else if (val === null || val === undefined) delete next.v;
                    else next.v = val;
                } else {
                    next = src ? clone(src) : {};
                    if (mode === 'formulas') { if (cur.s) next.s = cur.s; else delete next.s; }
                    if (next.f !== undefined && !opts.cut) next.f = F.shiftFormula(next.f, tr - (block.r1 + i), tc - (block.c1 + j));
                }
                self.setCell(sheet, tr, tc, reviveCell(next));
            }
            if (mode === 'all') {
                block.merges.forEach(function (m) {
                    sheet.merges.push({ r1: r0 + ry * block.h + m.r1, c1: c0 + rx * block.w + m.c1, r2: r0 + ry * block.h + m.r2, c2: c0 + rx * block.w + m.c2 });
                });
            }
        }
    };

    // ------------------------------------------------------- serialisasi
    Workbook.prototype.snapshot = function () {
        return {
            active: this.active,
            names: clone(this.names),
            sheets: this.sheets.map(function (sh) {
                var cells = [];
                sh.cells.forEach(function (cell, k) { cells.push([k, cloneCell(cell)]); });
                return { id: sh.id, meta: clone(sh.meta()), cells: cells };
            })
        };
    };
    Workbook.prototype.restore = function (snap) {
        this.sheets = snap.sheets.map(function (s) {
            var sh = new Sheet(s.meta.name);
            sh.id = s.id;
            sh.applyMeta(s.meta);
            s.cells.forEach(function (pair) { sh.cells.set(pair[0], reviveCell(pair[1])); });
            return sh;
        });
        this.names = clone(snap.names) || {};
        this.active = Math.min(snap.active, this.sheets.length - 1);
        this.recalc();
        this.emit('change', { history: true, structure: true });
    };

    /** Format simpan: alamat A1 sebagai kunci, tabel gaya dideduplikasi. */
    Workbook.prototype.toJSON = function () {
        var styles = [], styleIdx = {};
        var sheets = this.sheets.map(function (sh) {
            var cells = {};
            sh.cells.forEach(function (cell, k) {
                var p = unkey(k);
                var o = cloneCell(cell);
                if (!o) return;
                if (o.s) {
                    var sk = JSON.stringify(o.s);
                    if (styleIdx[sk] === undefined) { styleIdx[sk] = styles.length; styles.push(o.s); }
                    o.s = styleIdx[sk];
                }
                cells[F.addr(p.r, p.c)] = o;
            });
            return Object.assign({ cells: cells }, clone(sh.meta()));
        });
        return { app: 'sineex', version: 1, active: this.active, names: clone(this.names), styles: styles, sheets: sheets };
    };

    Workbook.fromJSON = function (data) {
        var wb = new Workbook();
        if (!data || !data.sheets || !data.sheets.length) {
            wb.addSheet('Sheet1');
            return wb;
        }
        var styles = data.styles || [];
        data.sheets.forEach(function (sd) {
            var sh = new Sheet(sd.name || 'Sheet');
            sh.applyMeta(sd);
            Object.keys(sd.cells || {}).forEach(function (a) {
                var p = F.parseAddr(a);
                if (!p) return;
                var o = sd.cells[a];
                if (typeof o.s === 'number') o.s = styles[o.s];
                var c = reviveCell(o);
                if (c) sh.cells.set(key(p.r, p.c), c);
                if (p.r >= sh.rows.count) sh.rows.count = p.r + 100;
                if (p.c >= sh.cols.count) sh.cols.count = p.c + 10;
            });
            sh.rows.invalidate();
            sh.cols.invalidate();
            wb.sheets.push(sh);
        });
        wb.names = data.names || {};
        wb.active = Math.min(data.active || 0, wb.sheets.length - 1);
        wb.recalc();
        return wb;
    };

    var SXM = { Workbook: Workbook, Sheet: Sheet, Axis: Axis, key: key, unkey: unkey, cloneCell: cloneCell, reviveCell: reviveCell, clone: clone };
    if (typeof module !== 'undefined' && module.exports) module.exports = SXM;
    else root.SXM = SXM;
})(typeof window !== 'undefined' ? window : globalThis);
