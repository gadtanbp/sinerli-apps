/**
 * Sinerli Hitara — perintah sel: format huruf/perataan/angka/border, gaya sel, sisip/hapus,
 * ukuran baris-kolom, freeze pane, operasi sheet, tautan & catatan, menu konteks,
 * dialog Format Sel, dan status ribbon.
 */
(function (global) {
    'use strict';

    var App = global.SineEX, F = global.SXF, M = global.SXM;
    var C = App.cmd;

    function sheet() { return App.sheet(); }
    /**
     * Seleksi seluruh kolom/baris (Ctrl+A, klik header) dipotong ke area yang
     * dipakai ATAU terlihat, bukan ke jumlah baris tampilan. Dulu Ctrl+A → Tebal
     * di lembar 20.000 baris menulis 1 juta sel kosong (tab membeku ±4 detik,
     * +160 MB, lalu autosave ikut menyerialkan semuanya). Semua sel yang sudah
     * ada tetap tercakup karena styledBounds() meliputi setiap sel.
     */
    function clampRange(rg) {
        var sh = sheet();
        var r2 = Math.min(rg.r2, sh.rows.count - 1), c2 = Math.min(rg.c2, sh.cols.count - 1);
        var wholeCols = rg.r1 === 0 && rg.r2 >= F.MAX_ROWS - 1, wholeRows = rg.c1 === 0 && rg.c2 >= F.MAX_COLS - 1;
        if (wholeCols || wholeRows) {
            var b = sh.styledBounds(), g = App.geom();
            if (wholeCols) r2 = Math.min(r2, Math.max(b.r2, sh.rows.indexAt((g.sy + g.H) / g.z), rg.r1));
            if (wholeRows) c2 = Math.min(c2, Math.max(b.c2, sh.cols.indexAt((g.sx + g.W) / g.z), rg.c1));
        }
        return { r1: rg.r1, c1: rg.c1, r2: r2, c2: c2 };
    }
    function activeStyle() { return App.wb.styleAt(sheet(), App.sel.active.r, App.sel.active.c); }

    /** Menerapkan patch gaya ke semua rentang terpilih. */
    C.style = function (patch, label) {
        if (App.editing) App.commitEdit(null);
        App.change(label || 'format', function () {
            App.sel.ranges.forEach(function (rg0) {
                var rg = clampRange(rg0);
                App.wb.setStyle(sheet(), rg.r1, rg.c1, rg.r2, rg.c2, patch);
            });
        });
    };

    C.toggle = function (key) {
        var on = !activeStyle()[key];
        var p = {};
        p[key] = on ? true : null;
        C.style(p);
    };

    C.fontName = function (v) { if (v) C.style({ ff: String(v).trim() }); };
    C.fontSize = function (v) {
        var n = parseFloat(String(v).replace(',', '.'));
        if (!n || n < 1 || n > 409) { SO.toast('x_err_font_size', { type: 'error' }); C.updateRibbon(); return; }
        C.style({ fs: n });
        C.autoFitRows();
    };
    C.growFont = function (d) {
        var cur = activeStyle().fs || 10;
        var list = SO.FONT_SIZES;
        var next = d > 0 ? (list.filter(function (s) { return s > cur; })[0] || cur + 10) : (list.filter(function (s) { return s < cur; }).pop() || Math.max(1, cur - 1));
        C.fontSize(next);
    };
    C.foreColor = function (c) { C.style({ fc: c && c !== 'auto' ? c : null }); };
    C.fillColor = function (c) { C.style({ bg: c || null }); };
    C.align = function (h) { C.style({ ha: activeStyle().ha === h && h !== 'general' ? null : (h === 'general' ? null : h) }); };
    C.valign = function (v) { C.style({ va: v === 'bottom' ? null : v }); };
    C.wrap = function () { var on = !activeStyle().wr; C.style({ wr: on ? true : null }); if (on) C.autoFitRows(); };
    C.indent = function (d) {
        C.style(function (s) { var n = Math.max(0, (s.ind || 0) + d); if (n) s.ind = n; else delete s.ind; if (!s.ha && d > 0) s.ha = 'left'; return s; });
    };

    // ============================================================ merge
    C.merge = function (mode) {
        var sh = sheet();
        var rg = clampRange(App.selRange());
        if (mode === 'unmerge') {
            App.change('unmerge', function () { App.wb.unmerge(sh, rg.r1, rg.c1, rg.r2, rg.c2); });
            App.select(rg.r1, rg.c1, rg.r2, rg.c2, { active: App.sel.active, scroll: false });
            return;
        }
        if (rg.r1 === rg.r2 && rg.c1 === rg.c2) return;
        var existing = sh.mergeAt(rg.r1, rg.c1);
        if (mode === 'center' && existing && existing.r1 === rg.r1 && existing.c1 === rg.c1 && existing.r2 === rg.r2 && existing.c2 === rg.c2) { C.merge('unmerge'); return; }
        var filled = 0;
        for (var r = rg.r1; r <= rg.r2; r++) for (var c = rg.c1; c <= rg.c2; c++) if (App.wb.value(sh, r, c) !== null) filled++;
        var go = function () {
            App.change('merge', function () {
                if (mode === 'across') {
                    for (var rr = rg.r1; rr <= rg.r2; rr++) App.wb.merge(sh, rr, rg.c1, rr, rg.c2);
                } else {
                    App.wb.merge(sh, rg.r1, rg.c1, rg.r2, rg.c2);
                    if (mode === 'center') App.wb.setStyle(sh, rg.r1, rg.c1, rg.r1, rg.c1, { ha: 'center', va: rg.r2 > rg.r1 ? 'middle' : null });
                }
            });
            App.select(rg.r1, rg.c1, rg.r2, rg.c2, { active: { r: rg.r1, c: rg.c1 }, scroll: false });
        };
        if (filled > 1) SO.confirm('x_merge_warning').then(function (ok) { if (ok) go(); });
        else go();
    };

    // ========================================================== border
    var LINE = function (style, color) { return { s: style || 'thin', c: color || C.borderColor || '#000000' }; };
    C.borderColor = '#000000';
    C.borderStyle = 'thin';

    /** kind: all|outside|inside|top|bottom|left|right|none|thickOutside|thickBottom|doubleBottom|topBottom */
    C.border = function (kind) {
        var sh = sheet();
        App.change('border', function () {
            App.sel.ranges.forEach(function (rg0) {
                var rg = clampRange(rg0);
                var st = C.borderStyle;
                App.wb.setStyle(sh, rg.r1, rg.c1, rg.r2, rg.c2, function (s, r, c) {
                    var bd = Object.assign({}, s.bd || {});
                    var top = r === rg.r1, bottom = r === rg.r2, left = c === rg.c1, right = c === rg.c2;
                    switch (kind) {
                        case 'none': bd = {}; break;
                        case 'all': bd = { t: LINE(st), b: LINE(st), l: LINE(st), r: LINE(st) }; break;
                        case 'outside':
                        case 'thickOutside':
                            var ls = kind === 'thickOutside' ? 'medium' : st;
                            if (top) bd.t = LINE(ls); if (bottom) bd.b = LINE(ls); if (left) bd.l = LINE(ls); if (right) bd.r = LINE(ls);
                            break;
                        case 'inside':
                            if (!bottom) bd.b = LINE(st); if (!right) bd.r = LINE(st);
                            break;
                        case 'top': if (top) bd.t = LINE(st); break;
                        case 'bottom': if (bottom) bd.b = LINE(st); break;
                        case 'left': if (left) bd.l = LINE(st); break;
                        case 'right': if (right) bd.r = LINE(st); break;
                        case 'thickBottom': if (bottom) bd.b = LINE('medium'); break;
                        case 'doubleBottom': if (bottom) bd.b = LINE('double'); break;
                        case 'topBottom': if (top) bd.t = LINE(st); if (bottom) bd.b = LINE(st); break;
                        case 'topThickBottom': if (top) bd.t = LINE(st); if (bottom) bd.b = LINE('medium'); break;
                    }
                    // Hapus garis sel tetangga agar "Tanpa Batas" benar-benar bersih.
                    if (kind === 'none') delete s.bd; else s.bd = bd;
                    return s;
                });
                if (kind === 'none') {
                    if (rg.r1 > 0) App.wb.setStyle(sh, rg.r1 - 1, rg.c1, rg.r1 - 1, rg.c2, function (s) { if (s.bd) { delete s.bd.b; if (!Object.keys(s.bd).length) delete s.bd; } return s; });
                    if (rg.c1 > 0) App.wb.setStyle(sh, rg.r1, rg.c1 - 1, rg.r2, rg.c1 - 1, function (s) { if (s.bd) { delete s.bd.r; if (!Object.keys(s.bd).length) delete s.bd; } return s; });
                }
            });
        });
    };

    C.borderMenu = function () {
        var items = [
            ['bottom', 'x_bd_bottom', 'fa-square-caret-down' ], ['top', 'x_bd_top', 'fa-border-top-left'], ['left', 'x_bd_left', 'fa-square-caret-left'], ['right', 'x_bd_right', 'fa-square-caret-right'],
            ['sep'], ['none', 'x_bd_none', 'fa-border-none'], ['all', 'x_bd_all', 'fa-border-all'], ['outside', 'x_bd_outside', 'fa-square'], ['inside', 'x_bd_inside', 'fa-table-cells'],
            ['thickOutside', 'x_bd_thick_outside', 'fa-square-full'], ['sep'], ['thickBottom', 'x_bd_thick_bottom', 'fa-grip-lines'], ['doubleBottom', 'x_bd_double_bottom', 'fa-equals'],
            ['topBottom', 'x_bd_top_bottom', 'fa-bars'], ['topThickBottom', 'x_bd_top_thick_bottom', 'fa-bars-staggered']
        ].map(function (x) { return x[0] === 'sep' ? { sep: true } : { label: x[1], icon: x[2], onClick: function () { C.border(x[0]); } }; });
        items.push({ sep: true });
        items.push({ label: 'x_bd_color', icon: 'fa-palette', onClick: function () { SO.colorPicker(SO.$('.so-ribbon .so-panel.is-active') || document.body, { value: C.borderColor, onPick: function (c) { C.borderColor = c || '#000000'; SO.toast('x_bd_color_set'); } }); } });
        items.push({ label: 'x_bd_style', icon: 'fa-pen-ruler', submenu: [['thin', 'x_ls_thin'], ['medium', 'x_ls_medium'], ['thick', 'x_ls_thick'], ['dashed', 'x_ls_dashed'], ['dotted', 'x_ls_dotted'], ['double', 'x_ls_double']].map(function (x) {
            return { label: x[1], checked: C.borderStyle === x[0], onClick: function () { C.borderStyle = x[0]; } };
        }) });
        items.push({ label: 'x_more_borders', icon: 'fa-sliders', onClick: function () { C.formatCells('border'); } });
        return items;
    };

    // ===================================================== format angka
    C.NUMBER_FORMATS = [
        { id: 'general', label: 'x_nf_general', fmt: 'General', icon: 'fa-hashtag' },
        { id: 'number', label: 'x_nf_number', fmt: '#,##0.00', icon: 'fa-0' },
        { id: 'currency', label: 'x_nf_currency', fmt: '"Rp "#,##0', icon: 'fa-money-bill' },
        { id: 'accounting', label: 'x_nf_accounting', fmt: '_("Rp"* #,##0_);_("Rp"* (#,##0);_("Rp"* "-"_);_(@_)', icon: 'fa-file-invoice-dollar' },
        { id: 'short_date', label: 'x_nf_short_date', fmt: 'dd/mm/yyyy', icon: 'fa-calendar-day' },
        { id: 'long_date', label: 'x_nf_long_date', fmt: 'dddd, d mmmm yyyy', icon: 'fa-calendar' },
        { id: 'time', label: 'x_nf_time', fmt: 'hh:mm:ss', icon: 'fa-clock' },
        { id: 'percent', label: 'x_nf_percent', fmt: '0.00%', icon: 'fa-percent' },
        { id: 'fraction', label: 'x_nf_fraction', fmt: '# ?/?', icon: 'fa-divide' },
        { id: 'scientific', label: 'x_nf_scientific', fmt: '0.00E+00', icon: 'fa-superscript' },
        { id: 'text', label: 'x_nf_text', fmt: '@', icon: 'fa-font' }
    ];

    C.numberFormat = function (fmt) {
        if (fmt === 'more') { C.formatCells('number'); return; }
        var f = C.NUMBER_FORMATS.filter(function (x) { return x.id === fmt; })[0];
        var code = f ? f.fmt : fmt;
        if (F.dmyOrder === 'mdy' && code === 'dd/mm/yyyy') code = 'm/d/yyyy';
        if (SO.lang() !== 'id' && /Rp/.test(code) && f) code = code.replace(/"Rp "/, '"$"').replace(/"Rp"/g, '"$"');
        C.style({ nf: code === 'General' ? null : code });
    };

    function decimalsOf(fmt) {
        var m = /\.([0#]+)/.exec(fmt || '');
        return m ? m[1].length : 0;
    }
    C.decimals = function (d) {
        var sh = sheet();
        var a = App.sel.active;
        var v = App.wb.value(sh, a.r, a.c);
        C.style(function (s) {
            var fmt = s.nf || 'General';
            if (F.isDateFormat(fmt) || fmt === '@') return s;
            if (fmt === 'General') {
                var txt = typeof v === 'number' ? F.numToText(v) : '0';
                var cur = (txt.split('.')[1] || '').length;
                var n = Math.max(0, cur + d);
                s.nf = n ? '0.' + '0'.repeat(n) : '0';
                return s;
            }
            var dec = decimalsOf(fmt);
            var nd = Math.max(0, dec + d);
            s.nf = fmt.split(';').map(function (sec) {
                if (/\.[0#]+/.test(sec)) return sec.replace(/\.[0#]+/, nd ? '.' + '0'.repeat(nd) : '');
                return sec.replace(/(0)(?![0#])(?!.*0)/, nd ? '0.' + '0'.repeat(nd) : '0');
            }).join(';');
            return s;
        });
    };
    C.thousands = function () { C.style({ nf: '#,##0.00' }); };

    C.currentFormatName = function () {
        var nf = activeStyle().nf || 'General';
        var f = C.NUMBER_FORMATS.filter(function (x) { return x.fmt === nf || (x.id === 'short_date' && nf === 'm/d/yyyy') || (x.id === 'currency' && /^"(Rp |\$)"#,##0$/.test(nf)); })[0];
        if (f) return SO.t(f.label);
        if (F.isDateFormat(nf)) return SO.t('x_nf_date');
        if (/%/.test(nf)) return SO.t('x_nf_percent');
        if (/[0#]/.test(nf)) return SO.t(/Rp|\$|€/.test(nf) ? 'x_nf_currency' : 'x_nf_number');
        return SO.t('x_nf_custom');
    };

    // ======================================================= gaya sel
    C.CELL_STYLES = {
        normal: { label: 'x_cs_normal', s: null },
        good: { label: 'x_cs_good', s: { bg: '#C6EFCE', fc: '#006100' } },
        bad: { label: 'x_cs_bad', s: { bg: '#FFC7CE', fc: '#9C0006' } },
        neutral: { label: 'x_cs_neutral', s: { bg: '#FFEB9C', fc: '#9C5700' } },
        title: { label: 'x_cs_title', s: { fs: 18, fc: '#1F3864', b: true } },
        heading1: { label: 'x_cs_heading1', s: { fs: 15, b: true, fc: '#1F3864', bd: { b: { s: 'thick', c: '#4472C4' } } } },
        heading2: { label: 'x_cs_heading2', s: { fs: 13, b: true, fc: '#1F3864', bd: { b: { s: 'medium', c: '#A9C4EB' } } } },
        total: { label: 'x_cs_total', s: { b: true, bd: { t: { s: 'thin', c: '#4472C4' }, b: { s: 'double', c: '#4472C4' } } } },
        input: { label: 'x_cs_input', s: { bg: '#FFCC99', fc: '#3F3F76', bd: { t: { s: 'thin', c: '#7F7F7F' }, b: { s: 'thin', c: '#7F7F7F' }, l: { s: 'thin', c: '#7F7F7F' }, r: { s: 'thin', c: '#7F7F7F' } } } },
        output: { label: 'x_cs_output', s: { bg: '#F2F2F2', fc: '#3F3F3F', b: true, bd: { t: { s: 'thin', c: '#3F3F3F' }, b: { s: 'thin', c: '#3F3F3F' }, l: { s: 'thin', c: '#3F3F3F' }, r: { s: 'thin', c: '#3F3F3F' } } } },
        calc: { label: 'x_cs_calculation', s: { bg: '#F2F2F2', fc: '#FA7D00', b: true, bd: { t: { s: 'thin', c: '#7F7F7F' }, b: { s: 'thin', c: '#7F7F7F' }, l: { s: 'thin', c: '#7F7F7F' }, r: { s: 'thin', c: '#7F7F7F' } } } },
        note: { label: 'x_cs_note', s: { bg: '#FFFFCC', bd: { t: { s: 'thin', c: '#B2B2B2' }, b: { s: 'thin', c: '#B2B2B2' }, l: { s: 'thin', c: '#B2B2B2' }, r: { s: 'thin', c: '#B2B2B2' } } } },
        accent1: { label: 'x_cs_accent1', s: { bg: '#4472C4', fc: '#FFFFFF' } },
        accent2: { label: 'x_cs_accent2', s: { bg: '#1D7044', fc: '#FFFFFF' } }
    };

    C.cellStyle = function (id) {
        var cs = C.CELL_STYLES[id];
        if (!cs) return;
        C.style(function (s) {
            ['bg', 'fc', 'b', 'i', 'u', 'fs', 'bd'].forEach(function (k) { delete s[k]; });
            if (cs.s) Object.assign(s, SO.deepClone(cs.s));
            return s;
        }, 'cell-style');
    };

    C.TABLE_STYLES = [
        { id: 'green', head: '#1D7044', band: '#E2EFDA', label: 'x_ts_green' },
        { id: 'blue', head: '#4472C4', band: '#D9E1F2', label: 'x_ts_blue' },
        { id: 'orange', head: '#C65911', band: '#FCE4D6', label: 'x_ts_orange' },
        { id: 'gray', head: '#595959', band: '#EDEDED', label: 'x_ts_gray' },
        { id: 'gold', head: '#BF8F00', band: '#FFF2CC', label: 'x_ts_gold' },
        { id: 'purple', head: '#7030A0', band: '#E4DFEC', label: 'x_ts_purple' }
    ];

    /** Format sebagai tabel: judul berwarna, baris berselang, garis, dan filter. */
    C.formatAsTable = function (id) {
        var ts = C.TABLE_STYLES.filter(function (t) { return t.id === id; })[0] || C.TABLE_STYLES[0];
        var rg = C.currentRegion();
        if (!rg) return;
        var sh = sheet();
        App.change('table', function () {
            App.wb.setStyle(sh, rg.r1, rg.c1, rg.r2, rg.c2, function (s, r) {
                var line = { s: 'thin', c: SO.tint(ts.head, 0.45) };
                s.bd = { t: line, b: line, l: line, r: line };
                if (r === rg.r1) { s.bg = ts.head; s.fc = '#FFFFFF'; s.b = true; }
                else if ((r - rg.r1) % 2 === 0) { s.bg = ts.band; delete s.fc; }
                else { delete s.bg; }
                return s;
            });
            App.wb.recordMeta(sh);
            sh.filter = { r1: rg.r1, c1: rg.c1, r2: rg.r2, c2: rg.c2, crit: {} };
        });
        App.select(rg.r1, rg.c1, rg.r2, rg.c2, { active: App.sel.active, scroll: false });
    };

    /** Wilayah data berdekatan di sekitar sel aktif (seperti Ctrl+A di Excel). */
    /** Blok data di sekitar sel aktif. grow: kembangkan juga dari seleksi multi-sel. */
    C.currentRegion = function (grow) {
        var sh = sheet();
        var rg = App.selRange();
        if (rg.r1 !== rg.r2 || rg.c1 !== rg.c2) {
            if (!grow) return clampRange(rg);
            rg = clampRange(rg);
        }
        var r1 = rg.r1, r2 = rg.r2, c1 = rg.c1, c2 = rg.c2;
        var has = function (r, c) { return r >= 0 && c >= 0 && App.wb.value(sh, r, c) !== null; };
        if (!has(r1, c1)) {
            var near = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(function (d) { return has(r1 + d[0], c1 + d[1]); });
            if (!near) return { r1: r1, c1: c1, r2: r2, c2: c2 };
        }
        var grown = true, guard = 0;
        while (grown && guard++ < 500) {
            grown = false;
            var rowHas = function (r) { for (var c = c1 - 1; c <= c2 + 1; c++) if (has(r, c)) return true; return false; };
            var colHas = function (c) { for (var r = r1 - 1; r <= r2 + 1; r++) if (has(r, c)) return true; return false; };
            if (r1 > 0 && rowHas(r1 - 1)) { r1--; grown = true; }
            if (r2 < F.MAX_ROWS - 1 && rowHas(r2 + 1)) { r2++; grown = true; }
            if (c1 > 0 && colHas(c1 - 1)) { c1--; grown = true; }
            if (c2 < F.MAX_COLS - 1 && colHas(c2 + 1)) { c2++; grown = true; }
        }
        return { r1: r1, c1: c1, r2: r2, c2: c2 };
    };

    C.selectAll = function () {
        var rg = App.selRange();
        var cr = C.currentRegion();
        if (cr && (cr.r1 !== rg.r1 || cr.r2 !== rg.r2 || cr.c1 !== rg.c1 || cr.c2 !== rg.c2) && !(rg.r1 === 0 && rg.r2 >= F.MAX_ROWS - 1)) App.select(cr.r1, cr.c1, cr.r2, cr.c2, { active: App.sel.active });
        else App.select(0, 0, F.MAX_ROWS - 1, F.MAX_COLS - 1, { active: App.sel.active });
    };

    // =========================================================== hapus isi
    C.clear = function (what) {
        var sh = sheet();
        App.change('clear', function () {
            App.sel.ranges.forEach(function (rg0) {
                var rg = clampRange(rg0);
                var b = sh.styledBounds();
                var r2 = Math.min(rg.r2, b.r2), c2 = Math.min(rg.c2, b.c2);
                for (var r = rg.r1; r <= r2; r++) for (var c = rg.c1; c <= c2; c++) {
                    var cell = sh.cell(r, c);
                    if (!cell) continue;
                    var n = M.cloneCell(cell);
                    if (what === 'all') n = null;
                    else if (what === 'formats') delete n.s;
                    else if (what === 'contents') { delete n.f; delete n.v; }
                    else if (what === 'notes') delete n.note;
                    else if (what === 'links') { delete n.link; if (n.s) { delete n.s.u; if (n.s.fc === '#0563C1') delete n.s.fc; } }
                    App.wb.setCell(sh, r, c, M.reviveCell(n));
                }
                if (what === 'all' || what === 'formats') {
                    App.wb.recordMeta(sh);
                    sh.merges = sh.merges.filter(function (m) { return m.r2 < rg.r1 || m.r1 > rg.r2 || m.c2 < rg.c1 || m.c1 > rg.c2; });
                }
            });
        });
    };

    // ====================================================== struktur
    function fullRows(rg) { return rg.c1 === 0 && rg.c2 >= F.MAX_COLS - 1; }
    function fullCols(rg) { return rg.r1 === 0 && rg.r2 >= F.MAX_ROWS - 1; }

    C.insertRows = function (below) {
        var rg = App.selRange();
        var n = rg.r2 - rg.r1 + 1;
        var at = below ? rg.r2 + 1 : rg.r1;
        App.change('insert-rows', function () { App.wb.shift(sheet(), 'row', at, n); });
        App.select(at, fullRows(rg) ? 0 : rg.c1, at + n - 1, fullRows(rg) ? F.MAX_COLS - 1 : rg.c2, { scroll: false });
    };
    C.insertCols = function (right) {
        var rg = App.selRange();
        var n = rg.c2 - rg.c1 + 1;
        var at = right ? rg.c2 + 1 : rg.c1;
        App.change('insert-cols', function () { App.wb.shift(sheet(), 'col', at, n); });
        App.select(fullCols(rg) ? 0 : rg.r1, at, fullCols(rg) ? F.MAX_ROWS - 1 : rg.r2, at + n - 1, { scroll: false });
    };
    C.deleteRows = function () {
        var rg = App.selRange();
        App.change('delete-rows', function () { App.wb.shift(sheet(), 'row', rg.r1, -(Math.min(rg.r2, sheet().rows.count - 1) - rg.r1 + 1)); });
        App.select(rg.r1, rg.c1, rg.r1, rg.c1);
    };
    C.deleteCols = function () {
        var rg = App.selRange();
        App.change('delete-cols', function () { App.wb.shift(sheet(), 'col', rg.c1, -(Math.min(rg.c2, sheet().cols.count - 1) - rg.c1 + 1)); });
        App.select(rg.r1, rg.c1, rg.r1, rg.c1);
    };

    /** Sisip/hapus sel dengan menggeser (dialog). */
    C.cellsDialog = function (insert) {
        var rg = App.selRange();
        if (fullRows(rg)) { if (insert) C.insertRows(); else C.deleteRows(); return; }
        if (fullCols(rg)) { if (insert) C.insertCols(); else C.deleteCols(); return; }
        SO.form({
            title: insert ? 'x_insert_cells' : 'x_delete_cells',
            fields: [{ name: 'mode', label: '', type: 'select', value: insert ? 'down' : 'up', options: insert
                ? [{ value: 'right', label: 'x_shift_right' }, { value: 'down', label: 'x_shift_down' }, { value: 'row', label: 'x_entire_row' }, { value: 'col', label: 'x_entire_col' }]
                : [{ value: 'left', label: 'x_shift_left' }, { value: 'up', label: 'x_shift_up' }, { value: 'row', label: 'x_entire_row' }, { value: 'col', label: 'x_entire_col' }] }]
        }).then(function (v) {
            if (!v) return;
            if (v.mode === 'row') { if (insert) C.insertRows(); else C.deleteRows(); return; }
            if (v.mode === 'col') { if (insert) C.insertCols(); else C.deleteCols(); return; }
            C.shiftCells(rg, v.mode, insert);
        });
    };

    C.shiftCells = function (rg0, mode, insert) {
        var sh = sheet(), wb = App.wb;
        var rg = clampRange(rg0);
        var h = rg.r2 - rg.r1 + 1, w = rg.c2 - rg.c1 + 1;
        var b = sh.styledBounds();
        function copyCell(fr, fc, tr, tc) {
            var src = M.cloneCell(sh.cell(fr, fc));
            if (src && src.f !== undefined) src.f = F.shiftFormula(src.f, tr - fr, tc - fc);
            wb.setCell(sh, tr, tc, M.reviveCell(src));
        }
        App.change('shift-cells', function () {
            wb.recordAll();
            var r, c;
            if (mode === 'down' || mode === 'up') {
                var lastR = Math.max(b.r2, rg.r2) + (insert ? 0 : h);
                for (c = rg.c1; c <= rg.c2; c++) {
                    if (insert) {
                        for (r = lastR; r >= rg.r1; r--) copyCell(r, c, r + h, c);
                        for (r = rg.r1; r < rg.r1 + h; r++) wb.setCell(sh, r, c, null);
                    } else {
                        for (r = rg.r1; r <= lastR; r++) copyCell(r + h, c, r, c);
                    }
                }
            } else {
                var lastC = Math.max(b.c2, rg.c2) + (insert ? 0 : w);
                for (r = rg.r1; r <= rg.r2; r++) {
                    if (insert) {
                        for (c = lastC; c >= rg.c1; c--) copyCell(r, c, r, c + w);
                        for (c = rg.c1; c < rg.c1 + w; c++) wb.setCell(sh, r, c, null);
                    } else {
                        for (c = rg.c1; c <= lastC; c++) copyCell(r, c + w, r, c);
                    }
                }
            }
        });
    };

    C.hide = function (axis, hide) {
        var sh = sheet();
        var rg = App.selRange();
        App.change('hide', function () {
            App.wb.recordMeta(sh);
            if (axis === 'row') {
                var r2 = Math.min(rg.r2, sh.rows.count - 1);
                var from = hide ? rg.r1 : Math.max(0, rg.r1 - 1), to = hide ? r2 : r2 + 1;
                for (var r = from; r <= to; r++) { if (hide) sh.rows.hidden[r] = true; else delete sh.rows.hidden[r]; }
                sh.rows.invalidate();
            } else {
                var c2 = Math.min(rg.c2, sh.cols.count - 1);
                var fromC = hide ? rg.c1 : Math.max(0, rg.c1 - 1), toC = hide ? c2 : c2 + 1;
                for (var c = fromC; c <= toC; c++) { if (hide) sh.cols.hidden[c] = true; else delete sh.cols.hidden[c]; }
                sh.cols.invalidate();
            }
        });
    };

    C.sizeDialog = function (axis) {
        var sh = sheet();
        var rg = App.selRange();
        var cur = axis === 'row' ? sh.rows.rawSize(App.sel.active.r) : sh.cols.rawSize(App.sel.active.c);
        SO.form({
            title: axis === 'row' ? 'x_row_height' : 'x_col_width',
            fields: [{ name: 'v', label: axis === 'row' ? 'x_height_px' : 'x_width_px', type: 'number', min: 0, max: axis === 'row' ? 800 : 2000, value: cur }]
        }).then(function (v) {
            if (!v || v.v === null) return;
            App.change('resize', function () {
                App.wb.recordMeta(sh);
                var ax = axis === 'row' ? sh.rows : sh.cols;
                var a = axis === 'row' ? rg.r1 : rg.c1, b = Math.min(axis === 'row' ? rg.r2 : rg.c2, ax.count - 1);
                for (var i = a; i <= b; i++) { if (v.v < 2) ax.hidden[i] = true; else { delete ax.hidden[i]; ax.sizes[i] = Math.round(v.v); } }
                ax.invalidate();
            });
        });
    };

    C.defaultWidth = function () {
        var sh = sheet();
        SO.prompt('x_default_col_width', sh.cols.def, { type: 'number' }).then(function (v) {
            var n = parseInt(v, 10);
            if (!n || n < 10) return;
            App.change('resize', function () { App.wb.recordMeta(sh); sh.cols.def = n; sh.cols.invalidate(); });
        });
    };

    var measureCtx = document.createElement('canvas').getContext('2d');
    C.autoFit = function (axis, indices) {
        var sh = sheet();
        var b = sh.bounds();
        App.change('autofit', function () {
            App.wb.recordMeta(sh);
            indices.forEach(function (i) {
                if (axis === 'col') {
                    var maxW = 0;
                    for (var r = 0; r <= Math.min(b.r2, 20000); r++) {
                        if (sh.rows.isHidden(r) || sh.mergeAt(r, i)) continue;
                        var d = App.wb.display(sh, r, i);
                        if (!d.text) continue;
                        var s = App.wb.styleAt(sh, r, i);
                        if (s.wr) continue;
                        measureCtx.font = App.fontFor(s, 1);
                        maxW = Math.max(maxW, measureCtx.measureText(d.text).width + 10 + (s.ind || 0) * 9);
                    }
                    delete sh.cols.hidden[i];
                    if (maxW) sh.cols.sizes[i] = Math.min(1200, Math.ceil(maxW)); else delete sh.cols.sizes[i];
                } else {
                    var maxH = 0;
                    for (var c = 0; c <= Math.min(b.c2, 500); c++) {
                        var cell = sh.cell(i, c);
                        if (!cell) continue;
                        var st = cell.s || {};
                        var fsPx = (st.fs || 10) * 96 / 72;
                        var lines = 1;
                        if (st.wr) {
                            var dd = App.wb.display(sh, i, c);
                            var m = sh.mergeAt(i, c);
                            if (m && m.r2 > m.r1) continue;
                            var w = m ? sh.cols.pos(m.c2 + 1) - sh.cols.pos(m.c1) : sh.cols.rawSize(c);
                            lines = App.wrapLines(dd.text, Math.max(4, w - 8), App.fontFor(st, 1)).length;
                        }
                        maxH = Math.max(maxH, lines * fsPx * 1.2 + 5);
                    }
                    delete sh.rows.hidden[i];
                    if (maxH > sh.rows.def) sh.rows.sizes[i] = Math.ceil(maxH); else delete sh.rows.sizes[i];
                }
            });
            (axis === 'col' ? sh.cols : sh.rows).invalidate();
        });
    };

    C.autoFitSelection = function (axis) {
        var rg = App.selRange();
        var sh = sheet();
        var out = [];
        var a = axis === 'col' ? rg.c1 : rg.r1;
        var b = Math.min(axis === 'col' ? rg.c2 : rg.r2, axis === 'col' ? Math.max(sh.bounds().c2, rg.c1) : Math.max(sh.bounds().r2, rg.r1));
        for (var i = a; i <= b; i++) out.push(i);
        C.autoFit(axis, out);
    };

    /** Tinggi baris menyesuaikan setelah pembungkusan/ukuran huruf berubah (tanpa langkah undo baru). */
    C.autoFitRows = function () {
        var sh = sheet();
        var rg = clampRange(App.selRange());
        if (rg.r2 - rg.r1 > 500) return;
        for (var r = rg.r1; r <= rg.r2; r++) C.autoFitRowAfterEdit(sh, r);
        App.updateScrollSize();
        App.requestRender();
    };
    C.autoFitRowAfterEdit = function (sh, r) {
        if (sh.rows.sizes[r] !== undefined && !sh.rows._auto) {
            // Tinggi manual dipertahankan kecuali ditandai otomatis.
            if (!(sh.rows._autoRows && sh.rows._autoRows[r])) return;
        }
        var maxH = 0;
        sh.cells.forEach(function (cell, k) {
            var p = M.unkey(k);
            if (p.r !== r) return;
            var st = cell.s || {};
            var m = sh.mergeAt(r, p.c);
            if (m && m.r2 > m.r1) return;
            var fsPx = (st.fs || 10) * 96 / 72;
            var lines = 1;
            if (st.wr) {
                var w = m ? sh.cols.pos(m.c2 + 1) - sh.cols.pos(m.c1) : sh.cols.rawSize(p.c);
                lines = App.wrapLines(App.wb.display(sh, r, p.c).text, Math.max(4, w - 8), App.fontFor(st, 1)).length;
            }
            maxH = Math.max(maxH, lines * fsPx * 1.2 + 5);
        });
        sh.rows._autoRows = sh.rows._autoRows || {};
        if (maxH > sh.rows.def + 0.5) { sh.rows.sizes[r] = Math.ceil(maxH); sh.rows._autoRows[r] = true; }
        else if (sh.rows._autoRows[r]) { delete sh.rows.sizes[r]; delete sh.rows._autoRows[r]; }
        sh.rows.invalidate();
    };

    // ======================================================= freeze
    C.freeze = function (mode) {
        var sh = sheet();
        var a = App.sel.active;
        App.change('view-freeze', function () {
            App.wb.recordMeta(sh);
            if (mode === 'none') sh.freeze = { r: 0, c: 0 };
            else if (mode === 'row') sh.freeze = { r: 1, c: 0 };
            else if (mode === 'col') sh.freeze = { r: 0, c: 1 };
            else sh.freeze = (sh.freeze.r || sh.freeze.c) ? { r: 0, c: 0 } : { r: a.r, c: a.c };
        });
        App.el.scroll.scrollTop = 0;
        App.el.scroll.scrollLeft = 0;
        App.updateScrollSize();
        App.requestRender();
    };

    // ======================================================== sheet
    C.addSheet = function () {
        if (App.editing) App.commitEdit(null);
        var idx;
        App.change('sheet-add', function () {
            App.wb.recordAll();
            var s = App.wb.addSheet(SO.t('x_default_sheet') + (App.wb.sheets.length + 1), App.wb.active + 1);
            idx = App.wb.sheets.indexOf(s);
        });
        App.activateSheet(idx);
    };

    C.renameSheetInline = function (i) {
        var tab = App.el.tabs.children[i];
        var sh = App.wb.sheets[i];
        if (!tab || !sh) return;
        var input = SO.el('input', { type: 'text', value: sh.name, maxlength: 31 });
        tab.textContent = '';
        tab.appendChild(input);
        input.focus();
        input.select();
        var done = false;
        var finish = function (save) {
            if (done) return;
            done = true;
            var name = input.value.trim().replace(/[\\/?*[\]:]/g, '');
            if (save && name && name !== sh.name) {
                var other = App.wb.sheetByName(name);
                if (other && other !== sh) { SO.toast('x_sheet_name_taken', { type: 'error' }); }
                else App.change('sheet-rename', function () { App.wb.renameSheet(sh, name); });
            }
            App.renderTabs();
            App.focusGrid();
        };
        input.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
        input.addEventListener('blur', function () { finish(true); });
        input.addEventListener('click', function (e) { e.stopPropagation(); });
    };

    C.deleteSheet = function (i) {
        if (App.wb.sheets.length <= 1) { SO.toast('x_last_sheet', { type: 'warn' }); return; }
        var sh = App.wb.sheets[i];
        SO.confirm('x_delete_sheet_confirm', { danger: true, okLabel: 'c_delete', vars: { name: sh.name } }).then(function (ok) {
            if (!ok) return;
            App.change('sheet-delete', function () { App.wb.deleteSheet(sh); });
            App.activateSheet(Math.min(i, App.wb.sheets.length - 1));
        });
    };

    C.sheetMenu = function (e, i) {
        e.preventDefault();
        var sh = App.wb.sheets[i];
        if (i !== App.wb.active) App.activateSheet(i);
        SO.contextMenu(e, [
            { label: 'x_new_sheet', icon: 'fa-plus', onClick: C.addSheet },
            { label: 'x_rename_sheet', icon: 'fa-pen', onClick: function () { C.renameSheetInline(App.wb.active); } },
            { label: 'x_duplicate_sheet', icon: 'fa-copy', onClick: function () { var ni; App.change('sheet-dup', function () { ni = App.wb.sheets.indexOf(App.wb.duplicateSheet(App.sheet())); }); App.activateSheet(ni); } },
            { label: 'x_move_left', icon: 'fa-arrow-left', disabled: i === 0, onClick: function () { App.change('sheet-move', function () { App.wb.moveSheet(i, i - 1); }); App.renderTabs(); } },
            { label: 'x_move_right', icon: 'fa-arrow-right', disabled: i >= App.wb.sheets.length - 1, onClick: function () { App.change('sheet-move', function () { App.wb.moveSheet(i, i + 1); }); App.renderTabs(); } },
            { label: 'x_tab_color', icon: 'fa-palette', onClick: function () {
                SO.colorPicker({ x: e.clientX, y: e.clientY }, { value: sh.tabColor, allowNone: true, onPick: function (c) { App.change('sheet-color', function () { App.wb.recordMeta(sh); sh.tabColor = c; }); App.renderTabs(); } });
            } },
            { label: sh.protected ? 'x_unprotect_sheet' : 'x_protect_sheet', icon: sh.protected ? 'fa-lock-open' : 'fa-lock', onClick: C.toggleProtect },
            { sep: true },
            { label: 'c_delete', icon: 'fa-trash', danger: true, disabled: App.wb.sheets.length <= 1, onClick: function () { C.deleteSheet(App.wb.active); } }
        ]);
    };

    C.sheetListMenu = function (anchor) {
        SO.menu(anchor, App.wb.sheets.map(function (sh, i) {
            return { text: sh.name, checked: i === App.wb.active, onClick: function () { App.activateSheet(i); } };
        }));
    };

    C.toggleProtect = function () {
        var sh = sheet();
        App.wb.change('protect', function () { App.wb.recordMeta(sh); sh.protected = !sh.protected; });
        App.renderTabs();
        SO.toast(sh.protected ? 'x_sheet_protected_on' : 'x_sheet_protected_off');
        App.updateFormulaBar();
    };

    C.viewToggle = function (key) {
        var sh = sheet();
        App.wb.change('view-' + key, function () { App.wb.recordMeta(sh); sh[key] = !sh[key]; });
        App.updateScrollSize();
        App.requestRender();
    };

    // =================================================== tautan & catatan
    C.openLink = function (href) {
        if (/^#/.test(href)) { App.gotoRef(href.slice(1)); return; }
        if (/^(https?:|mailto:|tel:)/i.test(href)) global.open(href, '_blank', 'noopener');
    };

    C.link = function () {
        var sh = sheet();
        var a = App.sel.active;
        var cell = sh.cell(a.r, a.c);
        SO.form({
            title: cell && cell.link ? 'x_edit_link' : 'x_insert_link',
            fields: [
                { name: 'text', label: 'x_link_text', value: App.wb.display(sh, a.r, a.c).text },
                { name: 'url', label: 'x_link_url', value: cell && cell.link ? cell.link : '', placeholder: 'https:// · #Sheet1!A1', spellcheck: false }
            ],
            validate: function (v) { return v.url.trim() ? null : 'x_err_url'; }
        }).then(function (v) {
            if (!v) return;
            var url = v.url.trim();
            if (!/^(https?:|mailto:|tel:|#)/i.test(url)) url = /^[^\s@]+@[^\s@]+$/.test(url) ? 'mailto:' + url : 'https://' + url;
            App.change('link', function () {
                if (v.text && (!cell || cell.f === undefined)) App.wb.setInput(sh, a.r, a.c, v.text);
                var c2 = M.cloneCell(sh.cell(a.r, a.c)) || {};
                c2.link = url;
                c2.s = Object.assign({}, c2.s || {}, { u: true, fc: (c2.s && c2.s.fc) || '#0563C1' });
                App.wb.setCell(sh, a.r, a.c, M.reviveCell(c2));
            });
        });
    };

    C.note = function () {
        var sh = sheet();
        var a = App.sel.active;
        var cell = sh.cell(a.r, a.c);
        SO.dialog({
            title: cell && cell.note ? 'x_edit_note' : 'x_new_note', width: 420,
            body: '<div class="so-field"><label>' + SO.esc(SO.ctx.name || SO.t('x_note')) + '</label><textarea class="so-input" rows="5" id="sxNoteText"></textarea></div>',
            onOpen: function (dlg) { dlg.$('#sxNoteText').value = (cell && cell.note) || ''; },
            enterSubmits: false,
            buttons: [
                cell && cell.note ? { label: 'c_delete', value: 'del' } : null,
                { label: 'c_cancel', value: null },
                { label: 'c_save', primary: true, value: 'ok', onClick: function (dlg) { C._note = dlg.$('#sxNoteText').value; } }
            ].filter(Boolean)
        }).then(function (v) {
            if (v !== 'ok' && v !== 'del') return;
            App.change('note', function () {
                var c2 = M.cloneCell(sh.cell(a.r, a.c)) || {};
                if (v === 'del' || !C._note.trim()) delete c2.note; else c2.note = C._note.trim();
                App.wb.setCell(sh, a.r, a.c, M.reviveCell(c2));
            });
        });
    };

    // ========================================================== menu konteks
    C.contextMenu = function (e, hit) {
        var sh = sheet();
        var cell = hit.area === 'cell' ? sh.cell(App.sel.active.r, App.sel.active.c) : null;
        var clip = [
            { label: 'x_cut', icon: 'fa-scissors', key: 'Mod+X', onClick: function () { C.clipboardCmd('cut'); } },
            { label: 'x_copy', icon: 'fa-copy', key: 'Mod+C', onClick: function () { C.clipboardCmd('copy'); } },
            { label: 'x_paste', icon: 'fa-paste', key: 'Mod+V', onClick: function () { C.clipboardCmd('paste'); } },
            { label: 'x_paste_special', icon: 'fa-clipboard-list', disabled: !App.clipboard, submenu: [
                { label: 'x_paste_values', onClick: function () { App.pasteInternal('values'); } },
                { label: 'x_paste_formulas', onClick: function () { App.pasteInternal('formulas'); } },
                { label: 'x_paste_formats', onClick: function () { App.pasteInternal('formats'); } }
            ] },
            { sep: true }
        ];
        var items;
        if (hit.area === 'colhead') {
            items = clip.concat([
                { label: 'x_insert_cols', icon: 'fa-plus', onClick: function () { C.insertCols(false); } },
                { label: 'x_delete_cols', icon: 'fa-minus', onClick: C.deleteCols },
                { label: 'x_clear_contents', icon: 'fa-eraser', onClick: function () { C.clear('contents'); } },
                { sep: true },
                { label: 'x_col_width', icon: 'fa-arrows-left-right', onClick: function () { C.sizeDialog('col'); } },
                { label: 'x_autofit_col', icon: 'fa-text-width', onClick: function () { C.autoFitSelection('col'); } },
                { label: 'x_hide', icon: 'fa-eye-slash', onClick: function () { C.hide('col', true); } },
                { label: 'x_unhide', icon: 'fa-eye', onClick: function () { C.hide('col', false); } }
            ]);
        } else if (hit.area === 'rowhead') {
            items = clip.concat([
                { label: 'x_insert_rows', icon: 'fa-plus', onClick: function () { C.insertRows(false); } },
                { label: 'x_delete_rows', icon: 'fa-minus', onClick: C.deleteRows },
                { label: 'x_clear_contents', icon: 'fa-eraser', onClick: function () { C.clear('contents'); } },
                { sep: true },
                { label: 'x_row_height', icon: 'fa-arrows-up-down', onClick: function () { C.sizeDialog('row'); } },
                { label: 'x_autofit_row', icon: 'fa-text-height', onClick: function () { C.autoFitSelection('row'); } },
                { label: 'x_hide', icon: 'fa-eye-slash', onClick: function () { C.hide('row', true); } },
                { label: 'x_unhide', icon: 'fa-eye', onClick: function () { C.hide('row', false); } }
            ]);
        } else {
            items = clip.concat([
                { label: 'x_insert', icon: 'fa-plus', submenu: [
                    { label: 'x_insert_cells', onClick: function () { C.cellsDialog(true); } },
                    { label: 'x_insert_rows', onClick: function () { C.insertRows(false); } },
                    { label: 'x_insert_cols', onClick: function () { C.insertCols(false); } }
                ] },
                { label: 'c_delete', icon: 'fa-minus', submenu: [
                    { label: 'x_delete_cells', onClick: function () { C.cellsDialog(false); } },
                    { label: 'x_delete_rows', onClick: C.deleteRows },
                    { label: 'x_delete_cols', onClick: C.deleteCols }
                ] },
                { label: 'x_clear_contents', icon: 'fa-eraser', key: 'Delete', onClick: function () { C.clear('contents'); } },
                { sep: true },
                { label: 'x_sort', icon: 'fa-arrow-down-a-z', submenu: [
                    { label: 'x_sort_asc', icon: 'fa-arrow-down-a-z', onClick: function () { C.sortQuick(false); } },
                    { label: 'x_sort_desc', icon: 'fa-arrow-down-z-a', onClick: function () { C.sortQuick(true); } },
                    { label: 'x_custom_sort', icon: 'fa-sliders', onClick: function () { C.sortDialog(); } }
                ] },
                { label: 'x_filter', icon: 'fa-filter', onClick: function () { C.toggleFilter(); } },
                { sep: true },
                { label: cell && cell.note ? 'x_edit_note' : 'x_new_note', icon: 'fa-note-sticky', onClick: C.note },
                { label: cell && cell.link ? 'x_edit_link' : 'x_insert_link', icon: 'fa-link', key: 'Mod+K', onClick: C.link },
                cell && cell.link ? { label: 'x_open_link', icon: 'fa-arrow-up-right-from-square', onClick: function () { C.openLink(cell.link); } } : null,
                cell && cell.link ? { label: 'x_remove_link', icon: 'fa-link-slash', onClick: function () { C.clear('links'); } } : null,
                { label: 'x_format_cells', icon: 'fa-table-list', key: 'Mod+1', onClick: function () { C.formatCells('number'); } },
                { label: 'x_define_name', icon: 'fa-tag', onClick: function () { C.nameDialog(); } }
            ]);
        }
        SO.contextMenu(e, items.filter(Boolean));
    };

    C.clipboardCmd = function (action) {
        if (action === 'copy' || action === 'cut') {
            if (action === 'cut' && sheet().protected) { SO.toast('x_sheet_protected', { type: 'warn' }); return; }
            App.copySelection(action === 'cut');
            return;
        }
        if (App.clipboard) { App.pasteInternal('all'); return; }
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(function (t) { App.pasteExternal(t, null); }).catch(function () { SO.toast('x_clipboard_hint', { type: 'warn', vars: { key: SO.keyLabel('Mod+V') } }); });
        } else SO.toast('x_clipboard_hint', { type: 'warn', vars: { key: SO.keyLabel('Mod+V') } });
    };

    // ======================================================= Format Sel
    var FORMAT_CATS = [
        { id: 'general', label: 'x_nf_general' }, { id: 'number', label: 'x_nf_number' }, { id: 'currency', label: 'x_nf_currency' },
        { id: 'accounting', label: 'x_nf_accounting' }, { id: 'date', label: 'x_nf_date' }, { id: 'time', label: 'x_nf_time' },
        { id: 'percent', label: 'x_nf_percent' }, { id: 'fraction', label: 'x_nf_fraction' }, { id: 'scientific', label: 'x_nf_scientific' },
        { id: 'text', label: 'x_nf_text' }, { id: 'custom', label: 'x_nf_custom' }
    ];

    function buildFormat(cat, o) {
        var dec = o.dec > 0 ? '.' + '0'.repeat(o.dec) : '';
        var sym = o.sym || '';
        var q = sym ? '"' + sym + (o.space ? ' ' : '') + '"' : '';
        switch (cat) {
            case 'general': return 'General';
            case 'number':
                var base = (o.sep ? '#,##0' : '0') + dec;
                return o.neg === 'red' ? base + ';[Red]' + base : o.neg === 'paren' ? base + ';(' + base + ')' : o.neg === 'redparen' ? base + ';[Red](' + base + ')' : base;
            case 'currency':
                var cb = q + '#,##0' + dec;
                return o.neg === 'red' ? cb + ';[Red]-' + cb : o.neg === 'paren' ? cb + ';(' + cb + ')' : cb;
            case 'accounting': return '_(' + (q || '') + '* #,##0' + dec + '_);_(' + (q || '') + '* (#,##0' + dec + ');_(' + (q || '') + '* "-"??_);_(@_)';
            case 'date': return o.date || 'dd/mm/yyyy';
            case 'time': return o.time || 'hh:mm';
            case 'percent': return '0' + dec + '%';
            case 'fraction': return o.frac || '# ?/?';
            case 'scientific': return '0' + (o.dec > 0 ? dec : '.00') + 'E+00';
            case 'text': return '@';
            case 'custom': return o.custom || 'General';
        }
        return 'General';
    }

    function guessCategory(nf) {
        if (!nf || nf === 'General') return 'general';
        if (nf === '@') return 'text';
        if (/^_\(/.test(nf)) return 'accounting';
        if (F.isDateFormat(nf)) return /[dy]|mmm/i.test(nf) ? 'date' : 'time';
        if (/%/.test(nf)) return 'percent';
        if (/E\+/i.test(nf)) return 'scientific';
        if (/\?\/\?/.test(nf)) return 'fraction';
        if (/"[^"]*"/.test(nf) && /[0#]/.test(nf)) return 'currency';
        if (/^[#,0.]+(;.*)?$/.test(nf.replace(/\[Red\]|[()-]/g, ''))) return 'number';
        return 'custom';
    }

    C.formatCells = function (tab) {
        var sh = sheet();
        var a = App.sel.active;
        var s = SO.deepClone(App.wb.styleAt(sh, a.r, a.c));
        var sample = App.wb.value(sh, a.r, a.c);
        if (typeof sample !== 'number') sample = 1234.5678;
        var state = { nf: s.nf || 'General', cat: guessCategory(s.nf), dec: decimalsOf(s.nf) || 2, sep: /,/.test(s.nf || '#,##0'), sym: SO.lang() === 'id' ? 'Rp' : '$', neg: 'minus', date: s.nf && F.isDateFormat(s.nf) ? s.nf : 'dd/mm/yyyy', time: 'hh:mm', frac: '# ?/?', custom: s.nf || 'General' };
        var bd = SO.deepClone(s.bd || {});
        var borderStyle = 'thin', borderColor = '#000000';
        SO.dialog({
            title: 'x_format_cells', width: 560,
            body: function (body, dlg) {
                var tabs = SO.el('div', { class: 'so-tabs-inline' });
                var panels = {};
                [['number', 'x_tab_number'], ['align', 'x_tab_alignment'], ['font', 'x_tab_font'], ['border', 'x_tab_border'], ['fill', 'x_tab_fill']].forEach(function (t) {
                    var b = SO.el('button', { type: 'button', text: SO.t(t[1]), dataset: { t: t[0] } });
                    b.addEventListener('click', function () { show(t[0]); });
                    tabs.appendChild(b);
                    panels[t[0]] = SO.el('div', { class: 'so-form' });
                });
                body.appendChild(tabs);
                function show(id) {
                    SO.$$('button', tabs).forEach(function (b) { b.classList.toggle('is-active', b.dataset.t === id); });
                    Object.keys(panels).forEach(function (k) { panels[k].hidden = k !== id; });
                }
                // --- angka
                var pn = panels.number;
                var catSel = SO.el('select', { class: 'so-select' });
                FORMAT_CATS.forEach(function (c) { catSel.appendChild(SO.el('option', { value: c.id, text: SO.t(c.label) })); });
                catSel.value = state.cat;
                var opts = SO.el('div', { class: 'so-form' });
                var preview = SO.el('div', { class: 'sx-fmt-preview' });
                pn.appendChild(SO.el('div', { class: 'so-field' }, SO.el('label', { text: SO.t('x_category') }), catSel));
                pn.appendChild(SO.el('div', { class: 'so-field' }, SO.el('label', { text: SO.t('x_sample') }), preview));
                pn.appendChild(opts);
                function field(label, input) { return SO.el('div', { class: 'so-field' }, SO.el('label', { text: SO.t(label) }), input); }
                function renderOpts() {
                    opts.innerHTML = '';
                    var cat = catSel.value;
                    if (['number', 'currency', 'accounting', 'percent', 'scientific'].indexOf(cat) !== -1) {
                        var dec = SO.el('input', { class: 'so-input', type: 'number', min: 0, max: 15, value: state.dec });
                        dec.addEventListener('input', function () { state.dec = +dec.value || 0; update(); });
                        opts.appendChild(field('x_decimals', dec));
                    }
                    if (cat === 'number') {
                        var sep = SO.el('input', { type: 'checkbox' });
                        sep.checked = state.sep;
                        sep.addEventListener('change', function () { state.sep = sep.checked; update(); });
                        opts.appendChild(SO.el('label', { class: 'so-field is-inline' }, sep, SO.el('span', { text: SO.t('x_use_1000_sep') })));
                    }
                    if (cat === 'currency' || cat === 'accounting') {
                        var sym = SO.el('select', { class: 'so-select' });
                        ['Rp', '$', '€', '£', '¥', 'RM', 'S$', ''].forEach(function (x) { sym.appendChild(SO.el('option', { value: x, text: x || SO.t('x_none') })); });
                        sym.value = state.sym;
                        sym.addEventListener('change', function () { state.sym = sym.value; update(); });
                        opts.appendChild(field('x_symbol', sym));
                    }
                    if (cat === 'number' || cat === 'currency') {
                        var neg = SO.el('select', { class: 'so-select' });
                        [['minus', '-1234'], ['red', '1234 (' + SO.t('x_red') + ')'], ['paren', '(1234)'], ['redparen', '(1234) ' + SO.t('x_red')]].forEach(function (x) { neg.appendChild(SO.el('option', { value: x[0], text: x[1] })); });
                        neg.value = state.neg;
                        neg.addEventListener('change', function () { state.neg = neg.value; update(); });
                        opts.appendChild(field('x_negative_numbers', neg));
                    }
                    if (cat === 'date' || cat === 'time') {
                        var list = cat === 'date' ? ['dd/mm/yyyy', 'd/m/yyyy', 'yyyy-mm-dd', 'd mmm yyyy', 'd mmmm yyyy', 'dddd, d mmmm yyyy', 'mmm-yy', 'mmmm yyyy', 'dd/mm/yyyy hh:mm', 'm/d/yyyy'] : ['hh:mm', 'hh:mm:ss', 'h:mm AM/PM', 'h:mm:ss AM/PM', '[h]:mm:ss', 'mm:ss.0'];
                        var ds = SO.el('select', { class: 'so-select' });
                        list.forEach(function (x) { ds.appendChild(SO.el('option', { value: x, text: F.format(46280.5625, x).text + '   —   ' + x })); });
                        ds.value = cat === 'date' ? state.date : state.time;
                        ds.addEventListener('change', function () { state[cat] = ds.value; update(); });
                        opts.appendChild(field('x_type', ds));
                    }
                    if (cat === 'fraction') {
                        var fs = SO.el('select', { class: 'so-select' });
                        [['# ?/?', 'x_frac_1'], ['# ??/??', 'x_frac_2'], ['# ?/2', 'x_frac_half'], ['# ?/4', 'x_frac_quarter'], ['# ?/10', 'x_frac_tenth']].forEach(function (x) { fs.appendChild(SO.el('option', { value: x[0], text: SO.t(x[1]) })); });
                        fs.value = state.frac;
                        fs.addEventListener('change', function () { state.frac = fs.value; update(); });
                        opts.appendChild(field('x_type', fs));
                    }
                    if (cat === 'custom') {
                        var cu = SO.el('input', { class: 'so-input', type: 'text', value: state.custom, spellcheck: 'false' });
                        cu.addEventListener('input', function () { state.custom = cu.value; update(); });
                        var presets = SO.el('select', { class: 'so-select' });
                        ['General', '0', '0.00', '#,##0', '#,##0.00', '"Rp "#,##0', '0%', '0.00%', 'dd/mm/yyyy', 'hh:mm', '#,##0;[Red]-#,##0', '0.00E+00', '# ?/?', '@', '#,##0,"K"', '#,##0.0,,"Jt"', '"Rp "#,##0;[Red]"Rp "-#,##0;"-"'].forEach(function (x) { presets.appendChild(SO.el('option', { value: x, text: x })); });
                        presets.addEventListener('change', function () { cu.value = presets.value; state.custom = presets.value; update(); });
                        opts.appendChild(field('x_format_code', cu));
                        opts.appendChild(field('x_presets', presets));
                    }
                    update();
                }
                function update() {
                    state.cat = catSel.value;
                    state.nf = buildFormat(state.cat, state);
                    var v = state.cat === 'text' ? String(sample) : (state.cat === 'date' || state.cat === 'time') && sample < 1 ? 46280.5625 : sample;
                    var r;
                    try { r = F.format(v, state.nf); } catch (e) { r = { text: '#' }; }
                    preview.textContent = r.text;
                    preview.style.color = r.color || '';
                }
                catSel.addEventListener('change', renderOpts);
                renderOpts();

                // --- perataan
                var pa = panels.align;
                var ha = SO.el('select', { class: 'so-select' });
                [['', 'x_general'], ['left', 'x_left'], ['center', 'x_center'], ['right', 'x_right'], ['justify', 'x_justify']].forEach(function (x) { ha.appendChild(SO.el('option', { value: x[0], text: SO.t(x[1]) })); });
                ha.value = s.ha || '';
                var va = SO.el('select', { class: 'so-select' });
                [['top', 'x_top'], ['middle', 'x_middle'], ['', 'x_bottom']].forEach(function (x) { va.appendChild(SO.el('option', { value: x[0], text: SO.t(x[1]) })); });
                va.value = s.va || '';
                var ind = SO.el('input', { class: 'so-input', type: 'number', min: 0, max: 15, value: s.ind || 0 });
                var wr = SO.el('input', { type: 'checkbox' });
                wr.checked = !!s.wr;
                pa.appendChild(SO.el('div', { class: 'so-form-row' }, field('x_horizontal', ha), field('x_vertical', va), field('x_indent', ind)));
                pa.appendChild(SO.el('label', { class: 'so-field is-inline' }, wr, SO.el('span', { text: SO.t('x_wrap_text') })));
                // --- huruf
                var pf = panels.font;
                var ff = SO.el('select', { class: 'so-select' });
                SO.FONTS.forEach(function (f) { ff.appendChild(SO.el('option', { value: f, text: f })); });
                ff.value = s.ff || 'Arial';
                var fsz = SO.el('input', { class: 'so-input', type: 'number', min: 1, max: 409, step: 0.5, value: s.fs || 10 });
                var fc = SO.el('input', { class: 'so-input', type: 'color', value: (s.fc || '#000000').toLowerCase() });
                var fb = SO.el('input', { type: 'checkbox' }); fb.checked = !!s.b;
                var fi = SO.el('input', { type: 'checkbox' }); fi.checked = !!s.i;
                var fu = SO.el('select', { class: 'so-select' });
                [['', 'x_none'], ['1', 'x_underline_single'], ['double', 'x_underline_double']].forEach(function (x) { fu.appendChild(SO.el('option', { value: x[0], text: SO.t(x[1]) })); });
                fu.value = s.u === 'double' ? 'double' : s.u ? '1' : '';
                var fst = SO.el('input', { type: 'checkbox' }); fst.checked = !!s.st;
                pf.appendChild(SO.el('div', { class: 'so-form-row' }, field('x_font', ff), field('x_size', fsz), field('x_color', fc)));
                pf.appendChild(field('x_underline', fu));
                pf.appendChild(SO.el('label', { class: 'so-field is-inline' }, fb, SO.el('span', { text: SO.t('x_bold') })));
                pf.appendChild(SO.el('label', { class: 'so-field is-inline' }, fi, SO.el('span', { text: SO.t('x_italic') })));
                pf.appendChild(SO.el('label', { class: 'so-field is-inline' }, fst, SO.el('span', { text: SO.t('x_strike') })));
                // --- garis
                var pb = panels.border;
                var bsSel = SO.el('select', { class: 'so-select' });
                [['thin', 'x_ls_thin'], ['medium', 'x_ls_medium'], ['thick', 'x_ls_thick'], ['dashed', 'x_ls_dashed'], ['dotted', 'x_ls_dotted'], ['double', 'x_ls_double']].forEach(function (x) { bsSel.appendChild(SO.el('option', { value: x[0], text: SO.t(x[1]) })); });
                var bcol = SO.el('input', { class: 'so-input', type: 'color', value: '#000000' });
                bsSel.addEventListener('change', function () { borderStyle = bsSel.value; });
                bcol.addEventListener('input', function () { borderColor = bcol.value.toUpperCase(); });
                pb.appendChild(SO.el('div', { class: 'so-form-row' }, field('x_bd_style', bsSel), field('x_bd_color', bcol)));
                var bgrid = SO.el('div', { class: 'sx-border-grid' });
                var prevBox = SO.el('div', { class: 'sx-border-preview', text: SO.t('x_text_sample') });
                function paintPreview() {
                    var css = function (side) { var x = bd[side]; return x ? (x.s === 'medium' ? 2 : x.s === 'thick' ? 3 : x.s === 'double' ? 3 : 1) + 'px ' + (x.s === 'dashed' ? 'dashed' : x.s === 'dotted' ? 'dotted' : x.s === 'double' ? 'double' : 'solid') + ' ' + x.c : '1px dashed #ddd'; };
                    prevBox.style.borderTop = css('t'); prevBox.style.borderBottom = css('b'); prevBox.style.borderLeft = css('l'); prevBox.style.borderRight = css('r');
                }
                [['none', 'fa-border-none', 'x_bd_none'], ['outline', 'fa-square', 'x_bd_outside'], ['t', 'fa-border-top-left', 'x_bd_top'], ['b', 'fa-square-caret-down', 'x_bd_bottom'], ['l', 'fa-square-caret-left', 'x_bd_left'], ['r', 'fa-square-caret-right', 'x_bd_right'], ['all', 'fa-border-all', 'x_bd_all']].forEach(function (x) {
                    var btn = SO.el('button', { type: 'button', html: '<i class="fas ' + x[1] + '"></i><span>' + SO.esc(SO.t(x[2])) + '</span>', title: SO.t(x[2]) });
                    btn.addEventListener('click', function () {
                        var line = { s: borderStyle, c: borderColor };
                        if (x[0] === 'none') bd = {};
                        else if (x[0] === 'outline' || x[0] === 'all') bd = { t: line, b: line, l: line, r: line, _all: x[0] === 'all' };
                        else bd[x[0]] = bd[x[0]] && bd[x[0]].s === borderStyle && bd[x[0]].c === borderColor ? undefined : line;
                        paintPreview();
                    });
                    bgrid.appendChild(btn);
                });
                pb.appendChild(bgrid);
                pb.appendChild(prevBox);
                paintPreview();
                // --- isian
                var pfl = panels.fill;
                var bgc = SO.el('input', { class: 'so-input', type: 'color', value: (s.bg || '#ffffff').toLowerCase() });
                var nobg = SO.el('input', { type: 'checkbox' }); nobg.checked = !s.bg;
                bgc.addEventListener('input', function () { nobg.checked = false; });
                pfl.appendChild(field('x_fill_color', bgc));
                pfl.appendChild(SO.el('label', { class: 'so-field is-inline' }, nobg, SO.el('span', { text: SO.t('x_no_fill') })));

                Object.keys(panels).forEach(function (k) { body.appendChild(panels[k]); });
                show(tab || 'number');
                dlg._collect = function () {
                    return {
                        nf: state.nf === 'General' ? null : state.nf,
                        ha: ha.value || null, va: va.value || null, ind: +ind.value || null, wr: wr.checked || null,
                        ff: ff.value === 'Arial' ? null : ff.value, fs: +fsz.value === 10 ? null : +fsz.value || null,
                        fc: fc.value.toUpperCase() === '#000000' ? null : fc.value.toUpperCase(), b: fb.checked || null, i: fi.checked || null,
                        u: fu.value === 'double' ? 'double' : fu.value ? true : null, st: fst.checked || null,
                        bg: nobg.checked ? null : bgc.value.toUpperCase(), bd: bd
                    };
                };
            },
            enterSubmits: false,
            buttons: [{ label: 'c_cancel', value: null }, { label: 'c_ok', primary: true, value: 'ok', onClick: function (dlg) { C._fmt = dlg._collect(); } }]
        }).then(function (v) {
            if (v !== 'ok') return;
            var patch = C._fmt;
            var bdPatch = patch.bd;
            delete patch.bd;
            var sh2 = sheet();
            App.change('format', function () {
                App.sel.ranges.forEach(function (rg0) {
                    var rg = clampRange(rg0);
                    App.wb.setStyle(sh2, rg.r1, rg.c1, rg.r2, rg.c2, function (st, r, c) {
                        Object.keys(patch).forEach(function (k) { if (patch[k] === null) delete st[k]; else st[k] = patch[k]; });
                        var keys = Object.keys(bdPatch).filter(function (k) { return k !== '_all'; });
                        if (!keys.length) { delete st.bd; return st; }
                        var nb = Object.assign({}, st.bd || {});
                        var edge = { t: r === rg.r1, b: r === rg.r2, l: c === rg.c1, r: c === rg.c2 };
                        ['t', 'b', 'l', 'r'].forEach(function (side) {
                            if (!(side in bdPatch)) return;
                            if (bdPatch._all || edge[side]) { if (bdPatch[side]) nb[side] = bdPatch[side]; else delete nb[side]; }
                        });
                        st.bd = nb;
                        return st;
                    });
                });
            });
            C.autoFitRows();
        });
    };

    // ======================================================= status ribbon
    var ribbonTimer = null;
    C.updateRibbonSoon = function () { clearTimeout(ribbonTimer); ribbonTimer = setTimeout(C.updateRibbon, 40); };
    C.updateRibbon = function () {
        var rb = App.ribbon;
        if (!rb || !App.wb) return;
        var s = activeStyle();
        var sh = sheet();
        rb.setValue('fontName', s.ff || 'Arial', s.ff || 'Arial');
        rb.setValue('fontSize', s.fs || 10);
        rb.setActive('bold', !!s.b);
        rb.setActive('italic', !!s.i);
        rb.setActive('underline', !!s.u);
        rb.setActive('strike', !!s.st);
        ['left', 'center', 'right'].forEach(function (h) { rb.setActive('align_' + h, s.ha === h); });
        rb.setActive('valign_top', s.va === 'top');
        rb.setActive('valign_middle', s.va === 'middle');
        rb.setActive('valign_bottom', !s.va || s.va === 'bottom');
        rb.setActive('wrap', !!s.wr);
        var rg = App.selRange();
        var m = sh.mergeAt(rg.r1, rg.c1);
        rb.setActive('mergeCenter', !!(m && m.r1 === rg.r1 && m.c1 === rg.c1 && m.r2 === rg.r2 && m.c2 === rg.c2));
        rb.setValue('numberFormat', null, C.currentFormatName());
        rb.setActive('showGrid', sh.showGrid);
        rb.setActive('showHeaders', sh.showHeaders);
        rb.setActive('showFormulas', sh.showFormulas);
        rb.setActive('protect', sh.protected);
        rb.setActive('filter', !!sh.filter);
        rb.setDisabled('undo', !App.history.canUndo());
        rb.setDisabled('redo', !App.history.canRedo());
        if (C.updateObjectTab) C.updateObjectTab();
    };
})(window);
