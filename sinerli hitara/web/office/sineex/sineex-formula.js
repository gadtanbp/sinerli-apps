/**
 * Sinerli Hitara — inti mesin rumus: alamat sel, galat, tokenizer, parser, evaluator,
 * koersi tipe, parsing input, format angka/tanggal, dan penggeseran rujukan.
 * Pustaka fungsi (SUM, VLOOKUP, …) ada di sineex-functions.js.
 *
 * Bisa dimuat di peramban (window.SXF) maupun Node (module.exports) untuk uji.
 */
(function (root) {
    'use strict';

    var F = {};
    var MAX_ROWS = 1048576, MAX_COLS = 16384;
    F.MAX_ROWS = MAX_ROWS;
    F.MAX_COLS = MAX_COLS;

    // ============================================================ alamat
    F.colName = function (c) {
        var s = '';
        c = c + 1;
        while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
        return s;
    };
    F.colIndex = function (name) {
        var n = 0;
        name = name.toUpperCase();
        for (var i = 0; i < name.length; i++) n = n * 26 + (name.charCodeAt(i) - 64);
        return n - 1;
    };
    F.addr = function (r, c, absR, absC) { return (absC ? '$' : '') + F.colName(c) + (absR ? '$' : '') + (r + 1); };
    F.rangeAddr = function (r1, c1, r2, c2) {
        return r1 === r2 && c1 === c2 ? F.addr(r1, c1) : F.addr(r1, c1) + ':' + F.addr(r2, c2);
    };
    F.parseAddr = function (s) {
        var m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(String(s).trim());
        if (!m) return null;
        var c = F.colIndex(m[1]), r = parseInt(m[2], 10) - 1;
        if (c >= MAX_COLS || r < 0 || r >= MAX_ROWS) return null;
        return { r: r, c: c };
    };
    F.parseRange = function (s) {
        s = String(s).trim();
        var sheet = null;
        var sm = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(s);
        if (sm) { sheet = (sm[1] || sm[2]).replace(/''/g, "'"); s = sm[3]; }
        var parts = s.split(':');
        var a = F.parseAddr(parts[0]);
        if (!a) {
            var col = /^\$?([A-Za-z]{1,3})$/.exec(parts[0]);
            var col2 = parts[1] && /^\$?([A-Za-z]{1,3})$/.exec(parts[1]);
            if (col && col2) return { sheet: sheet, r1: 0, c1: F.colIndex(col[1]), r2: MAX_ROWS - 1, c2: F.colIndex(col2[1]) };
            var row = /^\$?(\d+)$/.exec(parts[0]);
            var row2 = parts[1] && /^\$?(\d+)$/.exec(parts[1]);
            if (row && row2) return { sheet: sheet, r1: +row[1] - 1, c1: 0, r2: +row2[1] - 1, c2: MAX_COLS - 1 };
            return null;
        }
        var b = parts[1] ? F.parseAddr(parts[1]) : a;
        if (!b) return null;
        return { sheet: sheet, r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) };
    };
    F.quoteSheet = function (name) {
        return /^[A-Za-z_\u00C0-\uFFFF][\w.\u00C0-\uFFFF]*$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) ? name : "'" + name.replace(/'/g, "''") + "'";
    };

    // ============================================================= galat
    function XErr(code) { this.code = code; }
    XErr.prototype.toString = function () { return this.code; };
    F.XErr = XErr;
    var ERR = {};
    ['#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#N/A', '#NUM!', '#NULL!', '#CIRC!', '#SPILL!', '#CALC!'].forEach(function (c) { ERR[c] = new XErr(c); });
    F.ERR = ERR;
    F.E = {
        DIV0: ERR['#DIV/0!'], VALUE: ERR['#VALUE!'], REF: ERR['#REF!'], NAME: ERR['#NAME?'], NA: ERR['#N/A'],
        NUM: ERR['#NUM!'], NULL: ERR['#NULL!'], CIRC: ERR['#CIRC!'], SPILL: ERR['#SPILL!'], CALC: ERR['#CALC!']
    };
    F.isErr = function (v) { return v instanceof XErr; };

    // ========================================================== nilai larik
    /** Larik 2D hasil rumus (mis. =A1:A3*2, SEQUENCE). */
    function Arr(rows) { this.rows = rows; }
    Arr.prototype.h = function () { return this.rows.length; };
    Arr.prototype.w = function () { return this.rows.length ? this.rows[0].length : 0; };
    Arr.prototype.get = function (r, c) {
        var h = this.h(), w = this.w();
        if (h === 1) r = 0;
        if (w === 1) c = 0;
        if (r >= h || c >= w) return F.E.NA;
        var v = this.rows[r][c];
        return v === undefined ? null : v;
    };
    F.Arr = Arr;

    /** Rujukan rentang yang belum dievaluasi. */
    function RangeRef(sheetId, r1, c1, r2, c2) {
        this.sheetId = sheetId;
        this.r1 = r1; this.c1 = c1; this.r2 = r2; this.c2 = c2;
    }
    RangeRef.prototype.h = function () { return this.r2 - this.r1 + 1; };
    RangeRef.prototype.w = function () { return this.c2 - this.c1 + 1; };
    F.RangeRef = RangeRef;

    // ========================================================= tokenizer
    var ERR_RE = /^#(DIV\/0!|VALUE!|REF!|NAME\?|N\/A|NUM!|NULL!|CIRC!|SPILL!|CALC!)/i;
    var NUM_RE = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/;
    var CELL_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_.(!])/;
    var COLRANGE_RE = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(!])/;
    var ROWRANGE_RE = /^(\$?)(\d{1,7}):(\$?)(\d{1,7})(?![\d.A-Za-z_(])/;
    var IDENT_RE = /^[A-Za-z_\\\u00C0-\uFFFF][A-Za-z0-9_.\u00C0-\uFFFF]*/;
    var SHEET_RE = /^(?:'((?:[^']|'')+)'|([A-Za-z_\u00C0-\uFFFF][A-Za-z0-9_.\u00C0-\uFFFF]*))!/;

    function tokenize(src) {
        var out = [];
        var i = 0;
        var n = src.length;
        var braceDepth = 0;
        while (i < n) {
            var ch = src[i];
            var rest = src.slice(i);
            if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
            var start = i;
            if (ch === '"') {
                var j = i + 1, s = '';
                while (j < n) {
                    if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
                    s += src[j++];
                }
                if (j >= n) throw new SyntaxError('unterminated string');
                out.push({ t: 'str', v: s, s: start, e: j + 1 });
                i = j + 1;
                continue;
            }
            var em = ERR_RE.exec(rest);
            if (em) { out.push({ t: 'err', v: '#' + em[1].toUpperCase(), s: start, e: i + em[0].length }); i += em[0].length; continue; }

            // Rujukan dengan nama sheet opsional.
            var sheet = null, after = rest, offs = 0;
            var smm = SHEET_RE.exec(rest);
            if (smm) {
                var tail = rest.slice(smm[0].length);
                if (CELL_RE.test(tail) || COLRANGE_RE.test(tail) || ROWRANGE_RE.test(tail) || /^#REF!/i.test(tail)) {
                    sheet = (smm[1] !== undefined ? smm[1].replace(/''/g, "'") : smm[2]);
                    after = tail;
                    offs = smm[0].length;
                }
            }
            if (sheet !== null && /^#REF!/i.test(after)) {
                out.push({ t: 'err', v: '#REF!', s: start, e: i + offs + 5 });
                i += offs + 5;
                continue;
            }
            var cm = CELL_RE.exec(after);
            if (cm && F.colIndex(cm[2]) < MAX_COLS && +cm[4] >= 1 && +cm[4] <= MAX_ROWS) {
                var len = cm[0].length;
                var t1 = { t: 'ref', sheet: sheet, c: F.colIndex(cm[2]), r: +cm[4] - 1, absC: !!cm[1], absR: !!cm[3] };
                var more = after.slice(len);
                var rm = /^:(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_.(!])/.exec(more);
                if (rm && F.colIndex(rm[2]) < MAX_COLS && +rm[4] >= 1 && +rm[4] <= MAX_ROWS) {
                    len += rm[0].length;
                    out.push({
                        t: 'range', sheet: sheet, kind: 'cell',
                        r1: t1.r, c1: t1.c, absR1: t1.absR, absC1: t1.absC,
                        r2: +rm[4] - 1, c2: F.colIndex(rm[2]), absR2: !!rm[3], absC2: !!rm[1],
                        s: start, e: i + offs + len
                    });
                } else {
                    t1.s = start; t1.e = i + offs + len;
                    out.push(t1);
                }
                i += offs + len;
                continue;
            }
            var ccm = COLRANGE_RE.exec(after);
            if (ccm && F.colIndex(ccm[2]) < MAX_COLS && F.colIndex(ccm[4]) < MAX_COLS) {
                out.push({ t: 'range', sheet: sheet, kind: 'col', r1: 0, c1: F.colIndex(ccm[2]), absR1: false, absC1: !!ccm[1], r2: MAX_ROWS - 1, c2: F.colIndex(ccm[4]), absR2: false, absC2: !!ccm[3], s: start, e: i + offs + ccm[0].length });
                i += offs + ccm[0].length;
                continue;
            }
            var rrm = ROWRANGE_RE.exec(after);
            if (rrm && (sheet !== null || !out.length || /^(op|\(|,|;)$/.test(out[out.length - 1].t))) {
                out.push({ t: 'range', sheet: sheet, kind: 'row', r1: +rrm[2] - 1, c1: 0, absR1: !!rrm[1], absC1: false, r2: +rrm[4] - 1, c2: MAX_COLS - 1, absR2: !!rrm[3], absC2: false, s: start, e: i + offs + rrm[0].length });
                i += offs + rrm[0].length;
                continue;
            }
            var nm = NUM_RE.exec(rest);
            if (nm) { out.push({ t: 'num', v: parseFloat(nm[0]), s: start, e: i + nm[0].length }); i += nm[0].length; continue; }
            var im = IDENT_RE.exec(rest);
            if (im) {
                var word = im[0];
                var j2 = i + word.length;
                while (j2 < n && src[j2] === ' ') j2++;
                if (src[j2] === '(') { out.push({ t: 'func', v: word.toUpperCase().replace(/^_XLFN\./, ''), s: start, e: i + word.length }); i += word.length; continue; }
                var up = word.toUpperCase();
                if (up === 'TRUE' || up === 'FALSE') { out.push({ t: 'bool', v: up === 'TRUE', s: start, e: i + word.length }); i += word.length; continue; }
                out.push({ t: 'name', v: word, s: start, e: i + word.length });
                i += word.length;
                continue;
            }
            var two = src.substr(i, 2);
            if (two === '<=' || two === '>=' || two === '<>') { out.push({ t: 'op', v: two, s: start, e: i + 2 }); i += 2; continue; }
            if ('+-*/^&=<>%'.indexOf(ch) !== -1) { out.push({ t: 'op', v: ch, s: start, e: i + 1 }); i++; continue; }
            if (ch === '(' || ch === ')') { out.push({ t: ch, s: start, e: i + 1 }); i++; continue; }
            if (ch === '{') { braceDepth++; out.push({ t: '{', s: start, e: i + 1 }); i++; continue; }
            if (ch === '}') { braceDepth--; out.push({ t: '}', s: start, e: i + 1 }); i++; continue; }
            if (ch === ',' || ch === ';') {
                out.push({ t: braceDepth > 0 ? (ch === ';' ? 'rowsep' : ',') : ',', s: start, e: i + 1 });
                i++;
                continue;
            }
            if (ch === ':') { out.push({ t: 'op', v: ':', s: start, e: i + 1 }); i++; continue; }
            throw new SyntaxError('unexpected ' + ch);
        }
        return out;
    }
    F.tokenize = tokenize;

    // ============================================================ parser
    var BIN_PREC = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5, ':': 8 };

    function parse(src) {
        var toks = tokenize(src);
        var pos = 0;
        function peek() { return toks[pos]; }
        function next() { return toks[pos++]; }
        function expect(t) {
            var k = next();
            if (!k || k.t !== t) throw new SyntaxError('expected ' + t);
            return k;
        }
        function primary() {
            var k = next();
            if (!k) throw new SyntaxError('unexpected end');
            switch (k.t) {
                case 'num': return { type: 'num', v: k.v };
                case 'str': return { type: 'str', v: k.v };
                case 'bool': return { type: 'bool', v: k.v };
                case 'err': return { type: 'err', v: k.v };
                case 'ref': return { type: 'ref', sheet: k.sheet, r: k.r, c: k.c, absR: k.absR, absC: k.absC };
                case 'range': return { type: 'range', sheet: k.sheet, r1: k.r1, c1: k.c1, r2: k.r2, c2: k.c2, kind: k.kind };
                case 'name': return { type: 'name', v: k.v };
                case 'op':
                    if (k.v === '-' || k.v === '+') { var arg = unary(); return { type: 'unary', op: k.v, arg: arg }; }
                    throw new SyntaxError('unexpected operator');
                case '(':
                    var e = expr(0);
                    expect(')');
                    return { type: 'paren', arg: e };
                case 'func':
                    expect('(');
                    var args = [];
                    if (peek() && peek().t === ')') { next(); return { type: 'func', name: k.v, args: args }; }
                    for (;;) {
                        if (peek() && (peek().t === ',' || peek().t === ')')) args.push({ type: 'missing' });
                        else args.push(expr(0));
                        var sep = next();
                        if (!sep) throw new SyntaxError('unclosed function');
                        if (sep.t === ')') break;
                        if (sep.t !== ',') throw new SyntaxError('expected , or )');
                    }
                    return { type: 'func', name: k.v, args: args };
                case '{':
                    var rows = [[]];
                    for (;;) {
                        var item = unary();
                        rows[rows.length - 1].push(item);
                        var s2 = next();
                        if (!s2) throw new SyntaxError('unclosed array');
                        if (s2.t === '}') break;
                        if (s2.t === 'rowsep') rows.push([]);
                        else if (s2.t !== ',') throw new SyntaxError('bad array');
                    }
                    return { type: 'array', rows: rows };
            }
            throw new SyntaxError('unexpected token');
        }
        function postfix() {
            var node = primary();
            while (peek() && peek().t === 'op' && peek().v === '%') { next(); node = { type: 'pct', arg: node }; }
            return node;
        }
        function unary() {
            var k = peek();
            if (k && k.t === 'op' && (k.v === '-' || k.v === '+')) {
                next();
                return { type: 'unary', op: k.v, arg: unary() };
            }
            return postfix();
        }
        function expr(minPrec) {
            var left = unary();
            for (;;) {
                var k = peek();
                if (!k || k.t !== 'op' || BIN_PREC[k.v] === undefined) break;
                var prec = BIN_PREC[k.v];
                if (prec < minPrec) break;
                next();
                // Semua operator biner Excel rata kiri (2^3^2 = 64).
                var right = expr(prec + 1);
                left = { type: 'bin', op: k.v, left: left, right: right };
            }
            return left;
        }
        var tree = expr(0);
        if (pos < toks.length) throw new SyntaxError('unexpected trailing token');
        return tree;
    }
    F.parse = parse;

    // ========================================================== koersi
    F.isBlank = function (v) { return v === null || v === undefined; };

    F.numberFromString = function (s) {
        var t = String(s).trim();
        if (t === '') return null;
        if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?%?$/.test(t)) {
            var pct = t.slice(-1) === '%';
            var v = parseFloat(pct ? t.slice(0, -1) : t);
            return pct ? v / 100 : v;
        }
        var d = F.parseDateText(t);
        if (d !== null) return d;
        return null;
    };

    /** Angka dari nilai apa pun; melempar XErr bila tidak bisa. */
    F.toNum = function (v) {
        if (typeof v === 'number') return v;
        if (v === null || v === undefined) return 0;
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (v instanceof XErr) throw v;
        if (typeof v === 'string') {
            var n = F.numberFromString(v);
            if (n === null) throw F.E.VALUE;
            return n;
        }
        throw F.E.VALUE;
    };
    F.toStr = function (v) {
        if (v === null || v === undefined) return '';
        if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
        if (typeof v === 'number') return F.numToText(v);
        if (v instanceof XErr) throw v;
        return String(v);
    };
    F.toBool = function (v) {
        if (typeof v === 'boolean') return v;
        if (v === null || v === undefined) return false;
        if (typeof v === 'number') return v !== 0;
        if (v instanceof XErr) throw v;
        var u = String(v).toUpperCase();
        if (u === 'TRUE') return true;
        if (u === 'FALSE') return false;
        throw F.E.VALUE;
    };
    /** Representasi teks angka ala Excel (tanpa format lokal). */
    F.numToText = function (n) {
        if (!isFinite(n)) return '#NUM!';
        if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
        var s = String(parseFloat(n.toPrecision(15)));
        if (/e/.test(s)) { var p = n.toExponential(10).replace(/\.?0+e/, 'E').replace('e', 'E'); return p.replace(/E\+?(-?)(\d)$/, 'E$1+0$2').replace('E+-', 'E-'); }
        return s;
    };

    // ========================================================== tanggal
    var EPOCH = Date.UTC(1899, 11, 30);
    F.dateToSerial = function (y, m, d, hh, mm, ss) {
        return (Date.UTC(y, m - 1, d) - EPOCH) / 86400000 + ((hh || 0) * 3600 + (mm || 0) * 60 + (ss || 0)) / 86400;
    };
    F.serialToDate = function (serial) {
        var days = Math.floor(serial);
        var frac = serial - days;
        var dt = new Date(EPOCH + days * 86400000);
        var secs = Math.round(frac * 86400);
        if (secs >= 86400) { secs -= 86400; dt = new Date(dt.getTime() + 86400000); }
        return {
            y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay(),
            H: Math.floor(secs / 3600), M: Math.floor(secs / 60) % 60, S: secs % 60, ms: 0
        };
    };
    F.nowSerial = function () {
        var n = new Date();
        return F.dateToSerial(n.getFullYear(), n.getMonth() + 1, n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds());
    };

    var MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    var MONTHS_ID = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'];
    function monthFromName(s) {
        s = s.toLowerCase().slice(0, 3);
        var i = MONTHS_EN.indexOf(s);
        if (i === -1) i = MONTHS_ID.indexOf(s);
        if (i === -1 && s === 'ags') i = 7;
        return i === -1 ? null : i + 1;
    }
    function validDate(y, m, d) { return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); }

    F.dmyOrder = 'dmy';
    /** Mengenali teks tanggal/waktu; mengembalikan serial atau null. */
    F.parseDateText = function (t) {
        t = String(t).trim();
        var m, y, mo, d, time = 0;
        var tm = /(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(t);
        if (tm) {
            var hh = +tm[1];
            if (tm[4]) { if (hh === 12) hh = 0; if (/pm/i.test(tm[4])) hh += 12; }
            if (hh > 23 || +tm[2] > 59 || (tm[3] && +tm[3] > 59)) return null;
            time = (hh * 3600 + +tm[2] * 60 + (tm[3] ? +tm[3] : 0)) / 86400;
            t = t.slice(0, tm.index).trim();
            if (!t) return time;
        }
        if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
        else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(t))) {
            y = +m[3]; if (y < 100) y += y < 30 ? 2000 : 1900;
            if (F.dmyOrder === 'mdy') { mo = +m[1]; d = +m[2]; } else { d = +m[1]; mo = +m[2]; }
            if (!validDate(y, mo, d) && validDate(y, d, mo)) { var tmp = mo; mo = d; d = tmp; }
        }
        else if ((m = /^(\d{1,2})[\s-]+([A-Za-z]{3,})\.?[\s-]+(\d{2}|\d{4})$/.exec(t))) {
            d = +m[1]; mo = monthFromName(m[2]); y = +m[3]; if (y < 100) y += y < 30 ? 2000 : 1900;
        }
        else if ((m = /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t))) {
            mo = monthFromName(m[1]); d = +m[2]; y = +m[3];
        }
        else return null;
        if (!mo || !validDate(y, mo, d) || y < 1900 || y > 9999) return null;
        return F.dateToSerial(y, mo, d) + time;
    };

    // ======================================================= lokal angka
    F.locale = { decimal: ',', group: '.', code: 'id-ID' };
    F.setLocale = function (lang) {
        if (lang === 'id') F.locale = { decimal: ',', group: '.', code: 'id-ID' };
        else if (lang === 'zh') F.locale = { decimal: '.', group: ',', code: 'zh-CN' };
        else F.locale = { decimal: '.', group: ',', code: 'en-US' };
        F.dmyOrder = lang === 'en' ? 'mdy' : 'dmy';
        monthNameCache = {};
    };

    /**
     * Menafsirkan ketikan pengguna di sel. Mengembalikan {v, fmt} dengan fmt
     * opsional (mis. tanggal atau persen) yang disarankan untuk sel tersebut.
     */
    F.parseInput = function (raw) {
        if (raw === null || raw === undefined) return { v: null };
        var s = String(raw);
        if (s === '') return { v: null };
        if (s.charAt(0) === "'") return { v: s.slice(1), text: true };
        var t = s.trim();
        var up = t.toUpperCase();
        if (up === 'TRUE' || up === 'BENAR') return { v: true };
        if (up === 'FALSE' || up === 'SALAH') return { v: false };
        if (ERR[up]) return { v: ERR[up] };
        var L = F.locale;
        var cur = null;
        var cm = /^(-?)\s*(Rp\.?|\$|€|£|¥|US\$)\s*(.+)$/i.exec(t);
        if (cm) { cur = cm[2]; t = cm[1] + cm[3]; }
        var pct = false;
        if (/%$/.test(t)) { pct = true; t = t.slice(0, -1).trim(); }
        var numText = null;
        var g = L.group === '.' ? '\\.' : ',';
        var dsep = L.decimal === ',' ? ',' : '\\.';
        var grouped = new RegExp('^[+-]?\\d{1,3}(' + g + '\\d{3})+(' + dsep + '\\d+)?$');
        var plainLocal = new RegExp('^[+-]?\\d+(' + dsep + '\\d+)?$');
        if (grouped.test(t)) numText = t.split(L.group).join('').replace(L.decimal, '.');
        else if (plainLocal.test(t)) numText = t.replace(L.decimal, '.');
        else if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(t)) numText = t;
        if (numText !== null) {
            var v = parseFloat(numText);
            if (!isFinite(v)) return { v: s };
            if (pct) return { v: v / 100, fmt: /[.,]\d/.test(t) ? '0.00%' : '0%' };
            if (cur) {
                var sym = /^rp/i.test(cur) ? 'Rp' : cur;
                return { v: v, fmt: '"' + sym + (sym === 'Rp' ? ' ' : '') + '"#,##0' + (/[.,]\d{2}$/.test(t) && L.decimal !== '.' ? ',00' : (/\.\d{2}$/.test(t) ? '.00' : '')).replace(',', '.') };
            }
            if (/[eE]/.test(numText)) return { v: v, fmt: '0.00E+00' };
            return { v: v, fmt: grouped.test(t) ? '#,##0' + (/[.,]\d+$/.test(t) && t.lastIndexOf(L.decimal) > t.lastIndexOf(L.group) ? '.00' : '') : undefined };
        }
        if (!pct && !cur) {
            var ser = F.parseDateText(s);
            if (ser !== null) {
                var hasTime = /\d:\d/.test(s);
                var hasDate = /\d[-/.]\d|[A-Za-z]{3}/.test(s);
                return { v: ser, fmt: hasDate && hasTime ? 'dd/mm/yyyy hh:mm' : hasTime ? (/:\d\d:\d\d/.test(s) ? 'hh:mm:ss' : 'hh:mm') : (F.dmyOrder === 'mdy' ? 'm/d/yyyy' : 'dd/mm/yyyy') };
            }
        }
        return { v: s };
    };

    // ============================================================ format
    var monthNameCache = {};
    function monthName(m, style) {
        var key = m + style + F.locale.code;
        if (!monthNameCache[key]) {
            try { monthNameCache[key] = new Intl.DateTimeFormat(F.locale.code, { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2020, m - 1, 1))); }
            catch (e) { monthNameCache[key] = MONTHS_EN[m - 1]; }
        }
        return monthNameCache[key];
    }
    function dayName(dow, style) {
        var key = 'd' + dow + style + F.locale.code;
        if (!monthNameCache[key]) {
            try { monthNameCache[key] = new Intl.DateTimeFormat(F.locale.code, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + dow))); }
            catch (e) { monthNameCache[key] = String(dow); }
        }
        return monthNameCache[key];
    }

    function splitSections(fmt) {
        var out = [], cur = '', q = false, b = false;
        for (var i = 0; i < fmt.length; i++) {
            var ch = fmt[i];
            if (ch === '"' && !b) q = !q;
            else if (ch === '[' && !q) b = true;
            else if (ch === ']' && !q) b = false;
            else if (ch === '\\' && !q) { cur += ch + (fmt[i + 1] || ''); i++; continue; }
            if (ch === ';' && !q && !b) { out.push(cur); cur = ''; continue; }
            cur += ch;
        }
        out.push(cur);
        return out;
    }

    var fmtCache = {};
    function compile(fmt) {
        if (fmtCache[fmt]) return fmtCache[fmt];
        var sections = splitSections(fmt).map(function (sec) {
            var color = null, cond = null;
            sec = sec.replace(/\[(Red|Blue|Green|Black|White|Yellow|Magenta|Cyan|Merah|Biru|Hijau|Color\d+)\]/gi, function (m, c) {
                var map = { red: '#C00000', merah: '#C00000', blue: '#0070C0', biru: '#0070C0', green: '#00B050', hijau: '#00B050', black: '#000000', white: '#FFFFFF', yellow: '#BF9000', magenta: '#C000C0', cyan: '#00B0F0' };
                color = map[c.toLowerCase()] || null;
                return '';
            });
            sec = sec.replace(/\[([<>=]+)(-?[\d.]+)\]/, function (m, op, val) { cond = { op: op, v: parseFloat(val) }; return ''; });
            var elapsed = /\[(h+|m+|s+)\]/i.test(sec);
            var stripped = sec.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
            var hasDigitPat = /[0#?]/.test(stripped);
            var hasDateTok = /[dyhs]|AM\/PM|A\/P/i.test(stripped) || (/m/i.test(stripped) && !hasDigitPat);
            var isDate = !/General/i.test(sec) && (elapsed || (hasDateTok && !hasDigitPat) || (/[hs]/i.test(stripped) && /s\.0/i.test(stripped)));
            return { raw: sec, color: color, cond: cond, isDate: isDate, isText: sec.indexOf('@') !== -1 && !/[0#?]/.test(stripped) };
        });
        fmtCache[fmt] = sections;
        return sections;
    }

    function groupInt(s, sep) {
        return s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    }

    function formatNumberSection(v, sec) {
        var f = sec.raw;
        var pct = (f.replace(/"[^"]*"|\\./g, '').match(/%/g) || []).length;
        if (pct) v = v * Math.pow(100, pct);
        // Pisahkan teks harfiah di depan/belakang dari pola angka.
        var tokens = [];
        var i = 0;
        while (i < f.length) {
            var ch = f[i];
            if (ch === '"') { var j = f.indexOf('"', i + 1); if (j === -1) j = f.length; tokens.push({ lit: f.slice(i + 1, j) }); i = j + 1; continue; }
            if (ch === '\\') { tokens.push({ lit: f[i + 1] || '' }); i += 2; continue; }
            if (ch === '_') { tokens.push({ lit: ' ' }); i += 2; continue; }
            if (ch === '*') { i += 2; continue; }
            if ('0#?.,Ee+-/%'.indexOf(ch) !== -1 || /\d/.test(ch)) { tokens.push({ pat: ch }); i++; continue; }
            if (ch === '@') { tokens.push({ lit: '' }); i++; continue; }
            tokens.push({ lit: ch });
            i++;
        }
        var first = -1, last = -1;
        tokens.forEach(function (tk, idx) { if (tk.pat && '0#?'.indexOf(tk.pat) !== -1) { if (first === -1) first = idx; last = idx; } });
        if (first === -1) {
            return { text: tokens.map(function (tk) { return tk.lit !== undefined ? tk.lit : tk.pat; }).join(''), neg: false };
        }
        var pattern = tokens.slice(first, last + 1).map(function (tk) { return tk.pat || tk.lit; }).join('');
        var prefix = tokens.slice(0, first).map(function (tk) { return tk.lit !== undefined ? tk.lit : tk.pat; }).join('');
        var suffix = tokens.slice(last + 1).map(function (tk) { return tk.lit !== undefined ? tk.lit : tk.pat; }).join('');
        var L = F.locale;
        var neg = v < 0;
        var a = Math.abs(v);
        var body;
        // Pecahan: "# ?/?" atau "?/??"
        var frac = /^(#+|0+)?\s*(\?+|0+)\/(\?+|\d+)$/.exec(pattern);
        var sci = /^([0#.]+)E([+-])(0+)$/i.exec(pattern);
        if (frac) {
            var whole = frac[1] ? Math.floor(a) : 0;
            var rem = a - whole;
            var maxDen = /^\d+$/.test(frac[3]) ? +frac[3] : Math.pow(10, frac[3].length) - 1;
            var best = [0, 1], bestErr = Infinity;
            if (/^\d+$/.test(frac[3])) { best = [Math.round(rem * maxDen), maxDen]; }
            else {
                for (var den = 1; den <= maxDen; den++) {
                    var num = Math.round(rem * den);
                    var er = Math.abs(rem - num / den);
                    if (er < bestErr - 1e-12) { bestErr = er; best = [num, den]; }
                }
            }
            if (best[0] === best[1] && best[1] !== 0 && frac[1]) { whole += 1; best[0] = 0; }
            body = (frac[1] ? (whole || best[0] === 0 ? String(whole) : '') : '') + (best[0] ? (frac[1] && whole ? ' ' : '') + best[0] + '/' + best[1] : '');
            if (!body) body = '0';
        } else if (sci) {
            var mantPat = sci[1];
            var dec = mantPat.indexOf('.') === -1 ? 0 : mantPat.length - mantPat.indexOf('.') - 1;
            var exp = a === 0 ? 0 : Math.floor(Math.log10(a));
            var mant = a / Math.pow(10, exp);
            if (+mant.toFixed(dec) >= 10) { mant /= 10; exp += 1; }
            body = mant.toFixed(dec).replace('.', L.decimal) + 'E' + (exp < 0 ? '-' : sci[2] === '+' ? '+' : '') + String(Math.abs(exp)).padStart(sci[3].length, '0');
        } else {
            var dot = pattern.indexOf('.');
            var intPat = dot === -1 ? pattern : pattern.slice(0, dot);
            var decPat = dot === -1 ? '' : pattern.slice(dot + 1);
            var grouping = intPat.indexOf(',') !== -1;
            // Koma di ujung pola bilangan bulat = skala per seribu.
            var scaleMatch = /,+$/.exec(intPat);
            if (scaleMatch && !decPat) { a = a / Math.pow(1000, scaleMatch[0].length); intPat = intPat.slice(0, -scaleMatch[0].length); grouping = intPat.indexOf(',') !== -1; }
            var decMax = decPat.replace(/[^0#?]/g, '').length;
            var decMin = decPat.replace(/[^0]/g, '').length;
            var fixed = a.toFixed(decMax);
            var parts = fixed.split('.');
            var ip = parts[0], dp = parts[1] || '';
            while (dp.length > decMin && dp.charAt(dp.length - 1) === '0') dp = dp.slice(0, -1);
            var intMin = intPat.replace(/[^0]/g, '').length;
            if (ip === '0' && intMin === 0) ip = '';
            while (ip.length < intMin) ip = '0' + ip;
            if (grouping) ip = groupInt(ip, L.group);
            body = ip + (dp.length ? L.decimal + dp : (decPat.replace(/[^0#?]/g, '').length && decMin ? L.decimal : ''));
            if (!body) body = '0';
        }
        return { text: prefix + body + suffix, neg: neg };
    }

    function formatDateSection(v, sec) {
        var f = sec.raw;
        if (v < 0) return '#'.repeat(8);
        var dt = F.serialToDate(v);
        var hasAmPm = /AM\/PM|A\/P/i.test(f);
        var out = '';
        var i = 0;
        var tokens = [];
        while (i < f.length) {
            var ch = f[i];
            if (ch === '"') { var j = f.indexOf('"', i + 1); if (j === -1) j = f.length; tokens.push({ lit: f.slice(i + 1, j) }); i = j + 1; continue; }
            if (ch === '\\') { tokens.push({ lit: f[i + 1] || '' }); i += 2; continue; }
            var el = /^\[(h+|m+|s+)\]/i.exec(f.slice(i));
            if (el) { tokens.push({ el: el[1].toLowerCase() }); i += el[0].length; continue; }
            var ap = /^(AM\/PM|A\/P)/i.exec(f.slice(i));
            if (ap) { tokens.push({ ap: ap[0] }); i += ap[0].length; continue; }
            var run = /^(y+|m+|d+|h+|s+)/i.exec(f.slice(i));
            if (run) { tokens.push({ t: run[0].toLowerCase() }); i += run[0].length; continue; }
            if (ch === '.' && /^\.0+/.test(f.slice(i)) && tokens.length && tokens[tokens.length - 1].t && tokens[tokens.length - 1].t[0] === 's') {
                var z = /^\.0+/.exec(f.slice(i))[0];
                tokens.push({ frac: z.length - 1 });
                i += z.length;
                continue;
            }
            tokens.push({ lit: ch === '_' ? ' ' : ch });
            i++;
        }
        // "m" setelah h atau sebelum s adalah menit.
        tokens.forEach(function (tk, idx) {
            if (!tk.t || tk.t[0] !== 'm' || tk.t.length > 2) return;
            var prev = null, nxt = null;
            for (var a = idx - 1; a >= 0; a--) if (tokens[a].t || tokens[a].el) { prev = tokens[a]; break; }
            for (var b = idx + 1; b < tokens.length; b++) if (tokens[b].t || tokens[b].el) { nxt = tokens[b]; break; }
            if ((prev && ((prev.t && prev.t[0] === 'h') || (prev.el && prev.el[0] === 'h'))) || (nxt && ((nxt.t && nxt.t[0] === 's') || (nxt.el && nxt.el[0] === 's')))) tk.minute = true;
        });
        var totalSecs = Math.round(v * 86400);
        tokens.forEach(function (tk) {
            if (tk.lit !== undefined) { out += tk.lit; return; }
            if (tk.el) {
                if (tk.el[0] === 'h') out += String(Math.floor(totalSecs / 3600)).padStart(tk.el.length, '0');
                else if (tk.el[0] === 'm') out += String(Math.floor(totalSecs / 60)).padStart(tk.el.length, '0');
                else out += String(totalSecs).padStart(tk.el.length, '0');
                return;
            }
            if (tk.ap) {
                var pm = dt.H >= 12;
                out += tk.ap.length > 3 ? (pm ? 'PM' : 'AM') : (pm ? 'P' : 'A');
                return;
            }
            if (tk.frac !== undefined) {
                var fr = v * 86400 - Math.floor(v * 86400);
                out += F.locale.decimal + fr.toFixed(tk.frac).slice(2);
                return;
            }
            var t = tk.t;
            switch (t[0]) {
                case 'y': out += t.length <= 2 ? String(dt.y).slice(-2) : String(dt.y); break;
                case 'm':
                    if (tk.minute) out += t.length === 2 ? String(dt.M).padStart(2, '0') : String(dt.M);
                    else if (t.length === 1) out += dt.m;
                    else if (t.length === 2) out += String(dt.m).padStart(2, '0');
                    else if (t.length === 3) out += monthName(dt.m, 'short').replace(/\.$/, '');
                    else if (t.length === 5) out += monthName(dt.m, 'narrow');
                    else out += monthName(dt.m, 'long');
                    break;
                case 'd':
                    if (t.length === 1) out += dt.d;
                    else if (t.length === 2) out += String(dt.d).padStart(2, '0');
                    else if (t.length === 3) out += dayName(dt.dow, 'short');
                    else out += dayName(dt.dow, 'long');
                    break;
                case 'h':
                    var h = hasAmPm ? ((dt.H % 12) || 12) : dt.H;
                    out += t.length >= 2 ? String(h).padStart(2, '0') : String(h);
                    break;
                case 's': out += t.length >= 2 ? String(dt.S).padStart(2, '0') : String(dt.S); break;
            }
        });
        return out;
    }

    /** Menampilkan nilai sel sesuai format. Mengembalikan {text, color}. */
    F.format = function (v, fmt) {
        if (v === null || v === undefined) return { text: '' };
        if (v instanceof XErr) return { text: v.code, error: true };
        if (typeof v === 'boolean') return { text: v ? 'TRUE' : 'FALSE' };
        if (fmt === '@') return { text: typeof v === 'number' ? F.numToText(v) : String(v) };
        if (typeof v === 'string') {
            if (fmt && fmt !== 'General') {
                var secs = compile(fmt);
                var ts = secs[3] || secs.filter(function (x) { return x.isText; })[0];
                if (ts) return { text: ts.raw.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1').replace('@', v), color: ts.color };
            }
            return { text: v };
        }
        if (!isFinite(v)) return { text: '#NUM!', error: true };
        if (!fmt || fmt === 'General') return { text: F.general(v) };
        var sections = compile(fmt);
        var sec;
        if (sections[0].cond || (sections[1] && sections[1].cond)) {
            sec = sections.filter(function (s) {
                if (!s.cond) return false;
                var c = s.cond;
                return c.op === '>' ? v > c.v : c.op === '>=' ? v >= c.v : c.op === '<' ? v < c.v : c.op === '<=' ? v <= c.v : c.op === '=' ? v === c.v : v !== c.v;
            })[0] || sections.filter(function (s) { return !s.cond; })[0] || sections[0];
        } else if (v < 0 && sections.length > 1) sec = sections[1];
        else if (v === 0 && sections.length > 2) sec = sections[2];
        else sec = sections[0];
        if (!sec) return { text: F.general(v) };
        if (/^\s*General\s*$/i.test(sec.raw)) return { text: F.general(v), color: sec.color };
        if (sec.isDate) return { text: formatDateSection(v, sec), color: sec.color };
        var usingNegSection = v < 0 && sections.length > 1 && sec === sections[1];
        var r = formatNumberSection(usingNegSection ? Math.abs(v) : v, sec);
        var text = r.text;
        if (r.neg && !usingNegSection && /[1-9]/.test(text)) text = '-' + text;
        return { text: text, color: sec.color };
    };

    /** Format "General" dengan pemisah desimal lokal. */
    F.general = function (v) {
        if (Number.isInteger(v) && Math.abs(v) < 1e11) return String(v);
        var a = Math.abs(v);
        var s;
        if (a !== 0 && (a >= 1e11 || a < 1e-9)) {
            s = v.toExponential(5).replace(/\.?0+e/, 'e');
            s = s.replace(/e([+-])(\d)$/, 'E$10$2').replace(/e/, 'E');
        } else {
            s = String(parseFloat(v.toPrecision(11)));
            if (/e/.test(s)) s = parseFloat(v.toPrecision(11)).toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
        }
        return s.replace('.', F.locale.decimal);
    };

    F.isDateFormat = function (fmt) {
        if (!fmt || fmt === 'General' || fmt === '@') return false;
        return compile(fmt)[0].isDate;
    };

    // ======================================================== evaluator
    F.FN = {};

    /** Nilai fungsi LAMBDA: parameter + badan rumus + konteks tempat dibuat. */
    function Lambda(params, body, ctx) { this.params = params; this.body = body; this.ctx = ctx; }
    Lambda.prototype.invoke = function (values) {
        if (values.length > this.params.length) throw F.E.VALUE;
        var vars = Object.assign({}, this.ctx.vars || {});
        var omitted = Object.assign({}, this.ctx.omitted || {});
        for (var i = 0; i < this.params.length; i++) {
            var v = i < values.length ? values[i] : null;
            vars[this.params[i]] = v;
            omitted[this.params[i]] = v === null || v === undefined;
        }
        var child = Object.create(this.ctx);
        child.vars = vars;
        child.omitted = omitted;
        child.depth = (this.ctx.depth || 0) + 1;
        if (child.depth > 200) throw F.E.CALC;
        return F.evaluate(this.body, child);
    };
    F.Lambda = Lambda;

    function binaryScalar(op, a, b) {
        if (a instanceof XErr) return a;
        if (b instanceof XErr) return b;
        switch (op) {
            case '+': return F.toNum(a) + F.toNum(b);
            case '-': return F.toNum(a) - F.toNum(b);
            case '*': return F.toNum(a) * F.toNum(b);
            case '/': var d = F.toNum(b); if (d === 0) return F.E.DIV0; return F.toNum(a) / d;
            case '^':
                var base = F.toNum(a), ex = F.toNum(b);
                if (base === 0 && ex === 0) return F.E.NUM;
                var pw = Math.pow(base, ex);
                return isFinite(pw) ? pw : F.E.NUM;
            case '&': return F.toStr(a) + F.toStr(b);
            default: return compare(op, a, b);
        }
    }

    function typeRank(v) {
        if (typeof v === 'number') return 1;
        if (typeof v === 'string') return 2;
        if (typeof v === 'boolean') return 3;
        return 0;
    }

    function compare(op, a, b) {
        if (a === null || a === undefined) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
        if (b === null || b === undefined) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
        var c;
        var ra = typeRank(a), rb = typeRank(b);
        if (ra !== rb) c = ra < rb ? -1 : 1;
        else if (ra === 2) {
            var x = a.toLowerCase(), y = b.toLowerCase();
            c = x < y ? -1 : x > y ? 1 : 0;
        } else {
            var na = +a, nb = +b;
            c = Math.abs(na - nb) < 1e-12 * Math.max(1, Math.abs(na)) ? 0 : na < nb ? -1 : 1;
        }
        switch (op) {
            case '=': return c === 0;
            case '<>': return c !== 0;
            case '<': return c < 0;
            case '>': return c > 0;
            case '<=': return c <= 0;
            case '>=': return c >= 0;
        }
        return F.E.VALUE;
    }
    F.compare = compare;

    function wrapCatch(fn) {
        try { return fn(); } catch (e) { if (e instanceof XErr) return e; throw e; }
    }

    /** Mengubah RangeRef/Arr menjadi Arr (dievaluasi). */
    F.toArr = function (v, ctx) {
        if (v instanceof Arr) return v;
        if (v instanceof RangeRef) return new Arr(ctx.rangeValues(v));
        return new Arr([[v]]);
    };

    /** Nilai skalar dari hasil evaluasi (rentang 1×1 → nilainya). */
    F.scalar = function (v, ctx) {
        if (v instanceof RangeRef) {
            if (v.h() === 1 && v.w() === 1) return ctx.getCell(v.sheetId, v.r1, v.c1);
            // Irisan implisit dengan baris/kolom sel aktif.
            if (v.w() === 1 && ctx.row >= v.r1 && ctx.row <= v.r2 && ctx.sheetId === v.sheetId) return ctx.getCell(v.sheetId, ctx.row, v.c1);
            if (v.h() === 1 && ctx.col >= v.c1 && ctx.col <= v.c2 && ctx.sheetId === v.sheetId) return ctx.getCell(v.sheetId, v.r1, ctx.col);
            return F.E.VALUE;
        }
        if (v instanceof Arr) return v.get(0, 0);
        return v;
    };

    // Batas sel hasil operasi larik. A1:A5000*TRANSPOSE(A1:A5000) = 25 juta sel,
    // masing-masing dengan closure + try/catch → tab membeku lalu kehabisan memori.
    F.MAX_ARRAY = 2000000;

    function elementwise(a, b, fn, ctx) {
        var A = a instanceof Arr || a instanceof RangeRef ? F.toArr(a, ctx) : null;
        var B = b instanceof Arr || b instanceof RangeRef ? F.toArr(b, ctx) : null;
        if (!A && !B) return fn(a, b);
        var h = Math.max(A ? A.h() : 1, B ? B.h() : 1);
        var w = Math.max(A ? A.w() : 1, B ? B.w() : 1);
        if (h * w > F.MAX_ARRAY) throw F.E.NUM;
        var rows = [];
        for (var r = 0; r < h; r++) {
            var row = [];
            for (var c = 0; c < w; c++) {
                var x = A ? A.get(r, c) : a;
                var y = B ? B.get(r, c) : b;
                row.push(wrapCatch(function () { return fn(x, y); }));
            }
            rows.push(row);
        }
        return new Arr(rows);
    }
    F.elementwise = elementwise;

    F.evaluate = function (node, ctx) {
        switch (node.type) {
            case 'num': return node.v;
            case 'str': return node.v;
            case 'bool': return node.v;
            case 'err': return ERR[node.v] || F.E.VALUE;
            case 'missing': return null;
            case 'paren': return F.evaluate(node.arg, ctx);
            case 'ref': {
                var sid = node.sheet ? ctx.sheetByName(node.sheet) : ctx.sheetId;
                if (sid === null || sid === undefined) return F.E.REF;
                return new RangeRef(sid, node.r, node.c, node.r, node.c);
            }
            case 'range': {
                var sid2 = node.sheet ? ctx.sheetByName(node.sheet) : ctx.sheetId;
                if (sid2 === null || sid2 === undefined) return F.E.REF;
                var r1 = Math.min(node.r1, node.r2), r2 = Math.max(node.r1, node.r2);
                var c1 = Math.min(node.c1, node.c2), c2 = Math.max(node.c1, node.c2);
                return new RangeRef(sid2, r1, c1, r2, c2);
            }
            case 'name': {
                // Variabel LET/LAMBDA lebih dulu daripada nama rentang buku kerja.
                if (ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, node.v.toUpperCase())) return ctx.vars[node.v.toUpperCase()];
                var res = ctx.resolveName ? ctx.resolveName(node.v) : null;
                if (res === null || res === undefined) return F.E.NAME;
                return res;
            }
            case 'array':
                return new Arr(node.rows.map(function (row) {
                    return row.map(function (n) { return F.scalar(F.evaluate(n, ctx), ctx); });
                }));
            case 'unary': {
                var v = F.evaluate(node.arg, ctx);
                return elementwise(v, null, function (x) {
                    if (x instanceof XErr) return x;
                    var num = F.toNum(x);
                    return node.op === '-' ? -num : num;
                }, ctx);
            }
            case 'pct': {
                var pv = F.evaluate(node.arg, ctx);
                return elementwise(pv, null, function (x) { if (x instanceof XErr) return x; return F.toNum(x) / 100; }, ctx);
            }
            case 'bin': {
                if (node.op === ':') {
                    var L = F.evaluate(node.left, ctx), R = F.evaluate(node.right, ctx);
                    if (L instanceof RangeRef && R instanceof RangeRef && L.sheetId === R.sheetId) {
                        return new RangeRef(L.sheetId, Math.min(L.r1, R.r1), Math.min(L.c1, R.c1), Math.max(L.r2, R.r2), Math.max(L.c2, R.c2));
                    }
                    return F.E.VALUE;
                }
                var a = F.evaluate(node.left, ctx);
                var b = F.evaluate(node.right, ctx);
                if (a instanceof RangeRef && a.h() === 1 && a.w() === 1) a = F.scalar(a, ctx);
                if (b instanceof RangeRef && b.h() === 1 && b.w() === 1) b = F.scalar(b, ctx);
                return elementwise(a, b, function (x, y) { return binaryScalar(node.op, x, y); }, ctx);
            }
            case 'func': {
                var def = F.FN[node.name];
                if (!def || (ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, node.name))) {
                    // Nama berisi LAMBDA dipanggil seperti fungsi: =KALI2(A1).
                    var lam = ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, node.name) ? ctx.vars[node.name] : (ctx.resolveName ? ctx.resolveName(node.name) : null);
                    if (!(lam instanceof Lambda)) return def ? F.E.VALUE : F.E.NAME;
                    return wrapCatch(function () { return lam.invoke(node.args.map(function (n) { return F.evaluate(n, ctx); })); });
                }
                if (def.min !== undefined && node.args.length < def.min) return F.E.VALUE;
                if (def.max !== undefined && node.args.length > def.max) return F.E.VALUE;
                if (def.volatile && ctx.markVolatile) ctx.markVolatile();
                return wrapCatch(function () {
                    if (def.lazy) return def.fn(node.args, ctx, function (n) { return F.evaluate(n, ctx); });
                    var args = node.args.map(function (n) { return F.evaluate(n, ctx); });
                    return def.fn(args, ctx);
                });
            }
        }
        return F.E.VALUE;
    };

    // ====================================================== geser rujukan
    function refText(sheet, r, c, absR, absC) {
        if (r < 0 || c < 0 || r >= MAX_ROWS || c >= MAX_COLS) return (sheet ? F.quoteSheet(sheet) + '!' : '') + '#REF!';
        return (sheet ? F.quoteSheet(sheet) + '!' : '') + F.addr(r, c, absR, absC);
    }

    /**
     * Menulis ulang rumus dengan mengganti token rujukan.
     * mapper(tok) mengembalikan teks pengganti atau null (biarkan).
     */
    F.rewrite = function (formula, mapper) {
        var toks;
        try { toks = tokenize(formula); } catch (e) { return formula; }
        var out = '';
        var pos = 0;
        toks.forEach(function (tk) {
            if (tk.t !== 'ref' && tk.t !== 'range') return;
            var rep = mapper(tk);
            if (rep === null || rep === undefined) return;
            out += formula.slice(pos, tk.s) + rep;
            pos = tk.e;
        });
        return out + formula.slice(pos);
    };

    /** Huruf besar untuk rujukan, nama fungsi, dan TRUE/FALSE (=sum(a1) → =SUM(A1)). */
    F.canonical = function (formula) {
        var toks;
        try { toks = tokenize(formula); } catch (e) { return formula; }
        var out = '', pos = 0;
        toks.forEach(function (tk) {
            var rep = null, raw = formula.slice(tk.s, tk.e);
            if (tk.t === 'ref' || tk.t === 'range' || tk.t === 'err') {
                var bang = raw.lastIndexOf('!');
                rep = tk.t === 'err' ? raw.toUpperCase() : raw.slice(0, bang + 1) + raw.slice(bang + 1).toUpperCase();
            } else if (tk.t === 'func' || tk.t === 'bool') {
                rep = raw.toUpperCase();
            }
            if (rep === null || rep === raw) return;
            out += formula.slice(pos, tk.s) + rep;
            pos = tk.e;
        });
        return out + formula.slice(pos);
    };

    /** Salin/isi: geser rujukan relatif sejauh (dr, dc). */
    F.shiftFormula = function (formula, dr, dc) {
        if (!dr && !dc) return formula;
        return F.rewrite(formula, function (tk) {
            if (tk.t === 'ref') {
                return refText(tk.sheet, tk.absR ? tk.r : tk.r + dr, tk.absC ? tk.c : tk.c + dc, tk.absR, tk.absC);
            }
            var sheetP = tk.sheet ? F.quoteSheet(tk.sheet) + '!' : '';
            if (tk.kind === 'col') {
                var a = tk.absC1 ? tk.c1 : tk.c1 + dc, b = tk.absC2 ? tk.c2 : tk.c2 + dc;
                if (a < 0 || b < 0 || a >= MAX_COLS || b >= MAX_COLS) return sheetP + '#REF!';
                return sheetP + (tk.absC1 ? '$' : '') + F.colName(a) + ':' + (tk.absC2 ? '$' : '') + F.colName(b);
            }
            if (tk.kind === 'row') {
                var ra = tk.absR1 ? tk.r1 : tk.r1 + dr, rb = tk.absR2 ? tk.r2 : tk.r2 + dr;
                if (ra < 0 || rb < 0 || ra >= MAX_ROWS || rb >= MAX_ROWS) return sheetP + '#REF!';
                return sheetP + (tk.absR1 ? '$' : '') + (ra + 1) + ':' + (tk.absR2 ? '$' : '') + (rb + 1);
            }
            var r1 = tk.absR1 ? tk.r1 : tk.r1 + dr, c1 = tk.absC1 ? tk.c1 : tk.c1 + dc;
            var r2 = tk.absR2 ? tk.r2 : tk.r2 + dr, c2 = tk.absC2 ? tk.c2 : tk.c2 + dc;
            if (Math.min(r1, r2, c1, c2) < 0 || Math.max(r1, r2) >= MAX_ROWS || Math.max(c1, c2) >= MAX_COLS) return sheetP + '#REF!';
            return sheetP + F.addr(r1, c1, tk.absR1, tk.absC1) + ':' + F.addr(r2, c2, tk.absR2, tk.absC2);
        });
    };

    /**
     * Sisip/hapus baris atau kolom. axis 'row'|'col', at = indeks, count > 0 sisip,
     * count < 0 hapus. targetSheet = nama sheet yang diubah; formulaSheet = sheet rumus.
     */
    F.adjustFormula = function (formula, axis, at, count, targetSheet, formulaSheet) {
        var lower = function (s) { return String(s || '').toLowerCase(); };
        return F.rewrite(formula, function (tk) {
            var sheetName = tk.sheet || formulaSheet;
            if (lower(sheetName) !== lower(targetSheet)) return null;
            var sheetP = tk.sheet ? F.quoteSheet(tk.sheet) + '!' : '';
            function moveIdx(i) {
                if (count > 0) return i >= at ? i + count : i;
                var delEnd = at - count - 1;
                if (i < at) return i;
                if (i > delEnd) return i + count;
                return null;
            }
            if (tk.t === 'ref') {
                var idx = axis === 'row' ? tk.r : tk.c;
                var ni = moveIdx(idx);
                if (ni === null) return sheetP + '#REF!';
                if (ni === idx) return null;
                return axis === 'row' ? refText(tk.sheet, ni, tk.c, tk.absR, tk.absC) : refText(tk.sheet, tk.r, ni, tk.absR, tk.absC);
            }
            if ((axis === 'row' && tk.kind === 'col') || (axis === 'col' && tk.kind === 'row')) return null;
            var a = axis === 'row' ? tk.r1 : tk.c1;
            var b = axis === 'row' ? tk.r2 : tk.c2;
            var na, nb;
            if (count > 0) {
                na = a >= at ? a + count : a;
                nb = b >= at ? b + count : b;
            } else {
                var delStart = at, delEnd2 = at - count - 1;
                if (a >= delStart && b <= delEnd2) return sheetP + '#REF!';
                na = a < delStart ? a : (a > delEnd2 ? a + count : delStart);
                nb = b < delStart ? b : (b > delEnd2 ? b + count : delStart - 1);
            }
            if (na === a && nb === b) return null;
            if (tk.kind === 'col') return sheetP + (tk.absC1 ? '$' : '') + F.colName(na) + ':' + (tk.absC2 ? '$' : '') + F.colName(nb);
            if (tk.kind === 'row') return sheetP + (tk.absR1 ? '$' : '') + (na + 1) + ':' + (tk.absR2 ? '$' : '') + (nb + 1);
            if (axis === 'row') return sheetP + F.addr(na, tk.c1, tk.absR1, tk.absC1) + ':' + F.addr(nb, tk.c2, tk.absR2, tk.absC2);
            return sheetP + F.addr(tk.r1, na, tk.absR1, tk.absC1) + ':' + F.addr(tk.r2, nb, tk.absR2, tk.absC2);
        });
    };

    F.renameSheetInFormula = function (formula, oldName, newName) {
        return F.rewrite(formula, function (tk) {
            if (!tk.sheet || tk.sheet.toLowerCase() !== oldName.toLowerCase()) return null;
            var p = F.quoteSheet(newName) + '!';
            if (tk.t === 'ref') return p + F.addr(tk.r, tk.c, tk.absR, tk.absC);
            if (tk.kind === 'col') return p + (tk.absC1 ? '$' : '') + F.colName(tk.c1) + ':' + (tk.absC2 ? '$' : '') + F.colName(tk.c2);
            if (tk.kind === 'row') return p + (tk.absR1 ? '$' : '') + (tk.r1 + 1) + ':' + (tk.absR2 ? '$' : '') + (tk.r2 + 1);
            return p + F.addr(tk.r1, tk.c1, tk.absR1, tk.absC1) + ':' + F.addr(tk.r2, tk.c2, tk.absR2, tk.absC2);
        });
    };

    /** Daftar rujukan beserta posisinya (untuk pewarnaan saat mengedit rumus). */
    F.refsIn = function (formula) {
        var toks;
        try { toks = tokenize(formula); } catch (e) { return []; }
        return toks.filter(function (t) { return t.t === 'ref' || t.t === 'range'; }).map(function (t) {
            return t.t === 'ref'
                ? { sheet: t.sheet, r1: t.r, c1: t.c, r2: t.r, c2: t.c, s: t.s, e: t.e }
                : { sheet: t.sheet, r1: Math.min(t.r1, t.r2), c1: Math.min(t.c1, t.c2), r2: Math.max(t.r1, t.r2), c2: Math.max(t.c1, t.c2), s: t.s, e: t.e };
        });
    };

    /** Mengganti F4: A1 → $A$1 → A$1 → $A1 → A1 pada rujukan di posisi kursor. */
    F.cycleAbsolute = function (formula, caret) {
        var toks;
        try { toks = tokenize(formula); } catch (e) { return null; }
        var tk = toks.filter(function (t) { return (t.t === 'ref' || t.t === 'range') && caret >= t.s && caret <= t.e; })[0];
        if (!tk) return null;
        var next = function (absR, absC) {
            if (!absR && !absC) return [true, true];
            if (absR && absC) return [true, false];
            if (absR && !absC) return [false, true];
            return [false, false];
        };
        var sheetP = tk.sheet ? F.quoteSheet(tk.sheet) + '!' : '';
        var rep;
        if (tk.t === 'ref') {
            var n = next(tk.absR, tk.absC);
            rep = sheetP + F.addr(tk.r, tk.c, n[0], n[1]);
        } else if (tk.kind === 'cell') {
            var n1 = next(tk.absR1, tk.absC1);
            rep = sheetP + F.addr(tk.r1, tk.c1, n1[0], n1[1]) + ':' + F.addr(tk.r2, tk.c2, n1[0], n1[1]);
        } else return null;
        return { text: formula.slice(0, tk.s) + rep + formula.slice(tk.e), caret: tk.s + rep.length };
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = F;
    else root.SXF = F;
})(typeof window !== 'undefined' ? window : globalThis);
