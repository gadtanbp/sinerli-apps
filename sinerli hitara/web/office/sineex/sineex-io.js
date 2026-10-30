/**
 * Sinerli Hitara — impor/ekspor: XLSX (SheetJS + gaya dibaca langsung dari XML),
 * CSV/TSV, ODS, PDF, cetak, cadangan .sineex, dan thumbnail kartu projek.
 */
(function (global) {
    'use strict';

    var App = global.SineEX, F = global.SXF, M = global.SXM;
    var C = App.cmd;

    var BORDER_OUT = { thin: 'thin', medium: 'medium', thick: 'thick', dashed: 'dashed', dotted: 'dotted', double: 'double', hair: 'hair' };
    var BORDER_IN = { thin: 'thin', medium: 'medium', thick: 'thick', dashed: 'dashed', dotted: 'dotted', double: 'double', hair: 'hair', mediumDashed: 'dashed', dashDot: 'dashed', mediumDashDot: 'dashed', dashDotDot: 'dotted', slantDashDot: 'dashed' };
    var BUILTIN_NUMFMT = {
        0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
        14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'hh:mm', 21: 'hh:mm:ss', 22: 'dd/mm/yyyy hh:mm',
        37: '#,##0;(#,##0)', 38: '#,##0;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@'
    };
    var ERR_CODES = { '#NULL!': 0x00, '#DIV/0!': 0x07, '#VALUE!': 0x0F, '#REF!': 0x17, '#NAME?': 0x1D, '#NUM!': 0x24, '#N/A': 0x2A };

    function rgbHex(node) {
        if (!node) return null;
        var rgb = node.getAttribute('rgb');
        if (rgb) return '#' + rgb.slice(-6).toUpperCase();
        var theme = node.getAttribute('theme');
        if (theme !== null) {
            var themeColors = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];
            var base = themeColors[+theme] || null;
            var tint = parseFloat(node.getAttribute('tint') || '0');
            return base && tint ? SO.tint(base, tint) : base;
        }
        var idx = node.getAttribute('indexed');
        if (idx !== null) {
            var indexed = { 8: '#000000', 9: '#FFFFFF', 10: '#FF0000', 11: '#00FF00', 12: '#0000FF', 13: '#FFFF00', 14: '#FF00FF', 15: '#00FFFF', 16: '#800000', 17: '#008000', 18: '#000080', 19: '#808000', 20: '#800080', 21: '#008080', 22: '#C0C0C0', 23: '#808080' };
            return indexed[+idx] || null;
        }
        return null;
    }

    function kids(el, name) { return el ? Array.prototype.filter.call(el.children, function (n) { return n.localName === name; }) : []; }
    function kid(el, name) { return kids(el, name)[0] || null; }

    /** Membaca gaya per sel langsung dari XML xlsx (SheetJS versi komunitas hanya membaca isian). */
    function readXlsxStyles(buf) {
        return SO.load('jszip').then(function (JSZip) { return JSZip.loadAsync(buf); }).then(function (zip) {
            var parse = function (path) {
                var f = zip.file(path);
                return f ? f.async('string').then(function (t) { return new DOMParser().parseFromString(t, 'application/xml'); }) : Promise.resolve(null);
            };
            return Promise.all([parse('xl/workbook.xml'), parse('xl/_rels/workbook.xml.rels'), parse('xl/styles.xml')]).then(function (docs) {
                var wbx = docs[0], rels = docs[1], styles = docs[2];
                var out = { sheets: [], xfs: [] };
                if (styles) {
                    var numFmts = {};
                    kids(kid(styles.documentElement, 'numFmts'), 'numFmt').forEach(function (n) { numFmts[n.getAttribute('numFmtId')] = n.getAttribute('formatCode'); });
                    var fontEls = kids(kid(styles.documentElement, 'fonts'), 'font');
                    // Font bawaan buku kerja (font 0) dianggap gaya standar, bukan format sel.
                    var baseSz = fontEls[0] && kid(fontEls[0], 'sz') ? parseFloat(kid(fontEls[0], 'sz').getAttribute('val')) : 11;
                    var baseName = fontEls[0] && kid(fontEls[0], 'name') ? kid(fontEls[0], 'name').getAttribute('val') : 'Calibri';
                    var fonts = fontEls.map(function (f) {
                        var s = {};
                        if (kid(f, 'b') && kid(f, 'b').getAttribute('val') !== '0') s.b = true;
                        if (kid(f, 'i') && kid(f, 'i').getAttribute('val') !== '0') s.i = true;
                        if (kid(f, 'u')) s.u = kid(f, 'u').getAttribute('val') === 'double' ? 'double' : true;
                        if (kid(f, 'strike') && kid(f, 'strike').getAttribute('val') !== '0') s.st = true;
                        var sz = kid(f, 'sz');
                        if (sz) { var n = parseFloat(sz.getAttribute('val')); if (n && n !== 10 && n !== baseSz) s.fs = n; }
                        var nm = kid(f, 'name');
                        if (nm && nm.getAttribute('val') && nm.getAttribute('val') !== baseName && !/^(Arial|Calibri)$/i.test(nm.getAttribute('val'))) s.ff = nm.getAttribute('val');
                        var col = rgbHex(kid(f, 'color'));
                        if (col && col !== '#000000') s.fc = col;
                        return s;
                    });
                    var fills = kids(kid(styles.documentElement, 'fills'), 'fill').map(function (f) {
                        var p = kid(f, 'patternFill');
                        if (!p || p.getAttribute('patternType') === 'none' || !p.getAttribute('patternType')) return null;
                        return rgbHex(kid(p, 'fgColor')) || rgbHex(kid(p, 'bgColor'));
                    });
                    var borders = kids(kid(styles.documentElement, 'borders'), 'border').map(function (b) {
                        var bd = {};
                        [['left', 'l'], ['right', 'r'], ['top', 't'], ['bottom', 'b']].forEach(function (x) {
                            var e = kid(b, x[0]);
                            if (e && e.getAttribute('style') && BORDER_IN[e.getAttribute('style')]) bd[x[1]] = { s: BORDER_IN[e.getAttribute('style')], c: rgbHex(kid(e, 'color')) || '#000000' };
                        });
                        return Object.keys(bd).length ? bd : null;
                    });
                    out.xfs = kids(kid(styles.documentElement, 'cellXfs'), 'xf').map(function (xf) {
                        var s = Object.assign({}, fonts[+xf.getAttribute('fontId') || 0] || {});
                        var fill = fills[+xf.getAttribute('fillId') || 0];
                        if (fill) s.bg = fill;
                        var bd = borders[+xf.getAttribute('borderId') || 0];
                        if (bd) s.bd = bd;
                        var nid = xf.getAttribute('numFmtId');
                        var nf = numFmts[nid] || BUILTIN_NUMFMT[nid];
                        if (nf && nf !== 'General') s.nf = nf;
                        var al = kid(xf, 'alignment');
                        if (al) {
                            var h = al.getAttribute('horizontal');
                            if (h && h !== 'general') s.ha = h === 'centerContinuous' ? 'center' : h === 'fill' || h === 'distributed' ? 'justify' : h;
                            var v = al.getAttribute('vertical');
                            if (v === 'center') s.va = 'middle'; else if (v === 'top') s.va = 'top';
                            if (al.getAttribute('wrapText') === '1' || al.getAttribute('wrapText') === 'true') s.wr = true;
                            if (+al.getAttribute('indent')) s.ind = +al.getAttribute('indent');
                        }
                        return Object.keys(s).length ? s : null;
                    });
                }
                if (!wbx || !rels) return out;
                var relMap = {};
                kids(rels.documentElement, 'Relationship').forEach(function (r) { relMap[r.getAttribute('Id')] = r.getAttribute('Target'); });
                var sheetEls = kids(kid(wbx.documentElement, 'sheets'), 'sheet');
                return Promise.all(sheetEls.map(function (se) {
                    var rid = se.getAttribute('r:id') || se.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
                    var target = relMap[rid] || '';
                    var path = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
                    return parse(path).then(function (doc) {
                        var info = { name: se.getAttribute('name'), cells: {}, freeze: null, tabColor: null, showGrid: true };
                        if (!doc) return info;
                        var root = doc.documentElement;
                        var sv = kid(kid(root, 'sheetViews'), 'sheetView');
                        if (sv) {
                            if (sv.getAttribute('showGridLines') === '0') info.showGrid = false;
                            var pane = kid(sv, 'pane');
                            if (pane && /frozen/.test(pane.getAttribute('state') || '')) info.freeze = { r: Math.round(+pane.getAttribute('ySplit') || 0), c: Math.round(+pane.getAttribute('xSplit') || 0) };
                        }
                        var pr = kid(root, 'sheetPr');
                        if (pr && kid(pr, 'tabColor')) info.tabColor = rgbHex(kid(pr, 'tabColor'));
                        var data = kid(root, 'sheetData');
                        kids(data, 'row').forEach(function (row) {
                            kids(row, 'c').forEach(function (c) {
                                var s = c.getAttribute('s');
                                if (s && +s > 0) info.cells[c.getAttribute('r')] = +s;
                            });
                        });
                        return info;
                    });
                })).then(function (list) { out.sheets = list; return out; });
            });
        }).catch(function (e) { console.warn('[Sinerli Hitara] gaya xlsx gagal dibaca', e); return { sheets: [], xfs: [] }; });
    }

    function importWorkbook(XLSX, buf, ext) {
        var wbx = XLSX.read(buf, { type: 'array', cellFormula: true, cellNF: true, cellStyles: true, cellDates: false, cellText: false });
        var stylesP = ext === 'xlsx' || ext === 'xlsm' ? readXlsxStyles(buf) : Promise.resolve({ sheets: [], xfs: [] });
        return stylesP.then(function (st) {
            var wb = new M.Workbook();
            wbx.SheetNames.forEach(function (name, si) {
                var ws = wbx.Sheets[name];
                var sh = wb.addSheet(name);
                var styleInfo = st.sheets[si] || { cells: {} };
                if (!ws['!ref']) return;
                var range = XLSX.utils.decode_range(ws['!ref']);
                sh.rows.count = Math.max(1000, range.e.r + 100);
                sh.cols.count = Math.max(52, range.e.c + 10);
                Object.keys(ws).forEach(function (addr) {
                    if (addr.charAt(0) === '!') return;
                    var c = ws[addr];
                    var p = F.parseAddr(addr);
                    if (!p) return;
                    var cell = {};
                    if (c.f) cell.f = String(c.f).replace(/_xlfn\./gi, '').replace(/_xlws\./gi, '');
                    else if (c.t === 'n') cell.v = c.v;
                    else if (c.t === 's' || c.t === 'str') cell.v = c.v === '' ? null : String(c.v);
                    else if (c.t === 'b') cell.v = !!c.v;
                    else if (c.t === 'e') cell.v = F.ERR[c.w] || F.E.VALUE;
                    else if (c.t === 'd') { var d = new Date(c.v); cell.v = F.dateToSerial(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()); }
                    var xfIdx = styleInfo.cells[addr];
                    var style = xfIdx !== undefined && st.xfs[xfIdx] ? SO.deepClone(st.xfs[xfIdx]) : {};
                    if (!style.nf && c.z && c.z !== 'General') style.nf = String(c.z);
                    if (!style.bg && c.s && c.s.fgColor && c.s.fgColor.rgb && c.s.patternType === 'solid') style.bg = '#' + String(c.s.fgColor.rgb).slice(-6).toUpperCase();
                    if (style.nf) style.nf = style.nf.replace(/\\\//g, '/').replace(/;@$/, '');
                    if (Object.keys(style).length) cell.s = style;
                    if (c.l && c.l.Target) cell.link = c.l.Target;
                    if (c.c && c.c.length) cell.note = c.c.map(function (x) { return x.t; }).join('\n');
                    if (cell.f !== undefined || cell.v !== undefined || cell.s || cell.link || cell.note) sh.cells.set(M.key(p.r, p.c), cell);
                });
                (ws['!merges'] || []).forEach(function (m) { sh.merges.push({ r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c }); });
                (ws['!cols'] || []).forEach(function (col, i) {
                    if (!col) return;
                    if (col.hidden) sh.cols.hidden[i] = true;
                    // Lebar Excel dalam karakter (font standar ±7px per karakter + 5px bantalan).
                    var px = col.width ? Math.round(col.width * 7 + 5) : col.wch ? Math.round(col.wch * 7 + 5) : col.wpx || null;
                    if (px) sh.cols.sizes[i] = px;
                });
                (ws['!rows'] || []).forEach(function (row, i) {
                    if (!row) return;
                    if (row.hidden) sh.rows.hidden[i] = true;
                    var px = row.hpx || (row.hpt ? Math.round(row.hpt * 96 / 72) : null);
                    if (px) sh.rows.sizes[i] = Math.round(px);
                });
                if (ws['!autofilter'] && ws['!autofilter'].ref) {
                    var ar = XLSX.utils.decode_range(ws['!autofilter'].ref);
                    sh.filter = { r1: ar.s.r, c1: ar.s.c, r2: ar.e.r, c2: ar.e.c, crit: {} };
                }
                if (styleInfo.freeze) sh.freeze = styleInfo.freeze;
                if (styleInfo.tabColor) sh.tabColor = styleInfo.tabColor;
                if (styleInfo.showGrid === false) sh.showGrid = false;
                sh.rows.invalidate();
                sh.cols.invalidate();
            });
            if (wbx.Workbook && wbx.Workbook.Names) {
                wbx.Workbook.Names.forEach(function (n) { if (n.Name && n.Ref && !/^_xlnm/.test(n.Name)) wb.names[n.Name.toUpperCase()] = n.Ref; });
            }
            if (!wb.sheets.length) wb.addSheet('Sheet1');
            wb.recalc();
            return wb;
        });
    }

    function detectDelimiter(text) {
        var sample = text.split(/\r?\n/).slice(0, 10).join('\n');
        var counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
        var q = false;
        for (var i = 0; i < sample.length; i++) {
            var ch = sample[i];
            if (ch === '"') q = !q;
            else if (!q && counts[ch] !== undefined) counts[ch]++;
        }
        return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0] || ',';
    }

    function parseDelimited(text, d) {
        var rows = [], row = [], cur = '', q = false;
        for (var i = 0; i < text.length; i++) {
            var ch = text[i];
            if (q) {
                if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
                else cur += ch;
            } else if (ch === '"' && cur === '') q = true;
            else if (ch === d) { row.push(cur); cur = ''; }
            else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
            else cur += ch;
        }
        if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
        return rows;
    }

    C.importFile = function (file) {
        var name = file.name.replace(/\.[^.]+$/, '');
        var ext = (file.name.split('.').pop() || '').toLowerCase();
        var busy = SO.busy('c_opening');
        var done = function (wb) {
            busy.done();
            App.session.newKey();
            App.loadDocument(wb.toJSON(), name);
            App.session.markDirty();
            SO.toast('x_imported', { type: 'success' });
        };
        var fail = function (e) { busy.done(); console.error(e); SO.toast(e.message || 'c_err_load', { type: 'error' }); };
        if (ext === 'sineex' || ext === 'json') {
            SO.readFile(file, 'text').then(function (t) {
                var data = JSON.parse(t);
                if (!data || data.app !== 'sineex') throw new Error(SO.t('c_err_wrong_type'));
                busy.done();
                App.session.newKey();
                App.loadDocument(data, data.name || name);
                App.session.markDirty();
            }).catch(fail);
            return;
        }
        if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
            SO.readFile(file, 'text').then(function (t) {
                t = t.replace(/^﻿/, '');
                var d = ext === 'tsv' ? '\t' : detectDelimiter(t);
                var rows = parseDelimited(t, d);
                var wb = new M.Workbook();
                var sh = wb.addSheet(name.slice(0, 31) || 'Sheet1');
                // Pemisah titik koma = CSV gaya Indonesia (koma desimal).
                var prevLocale = F.locale;
                if (d === ';') F.setLocale('id');
                rows.forEach(function (row, r) { row.forEach(function (v, c) { if (v !== '') wb.setInput(sh, r, c, v); }); });
                if (d === ';') F.locale = prevLocale;
                F.setLocale(SO.lang());
                wb.recalc();
                done(wb);
            }).catch(fail);
            return;
        }
        if (['xlsx', 'xlsm', 'xls', 'ods', 'xlsb', 'fods'].indexOf(ext) === -1) { busy.done(); SO.toast(SO.t('x_err_format', { ext: '.' + ext }), { type: 'error' }); return; }
        Promise.all([SO.load('xlsx'), SO.readFile(file, 'arraybuffer')]).then(function (res) {
            return importWorkbook(res[0], new Uint8Array(res[1]), ext);
        }).then(done).catch(fail);
    };

    // ============================================================= ekspor
    function styleOut(s) {
        if (!s) return undefined;
        var o = {};
        var font = {};
        font.name = s.ff || 'Arial';
        font.sz = s.fs || 10;
        if (s.b) font.bold = true;
        if (s.i) font.italic = true;
        if (s.u) font.underline = true;
        if (s.st) font.strike = true;
        if (s.fc) font.color = { rgb: s.fc.slice(1).toUpperCase() };
        o.font = font;
        if (s.bg) o.fill = { patternType: 'solid', fgColor: { rgb: s.bg.slice(1).toUpperCase() } };
        var al = {};
        if (s.ha) al.horizontal = s.ha;
        if (s.va) al.vertical = s.va === 'middle' ? 'center' : s.va;
        if (s.wr) al.wrapText = true;
        if (s.ind) al.indent = s.ind;
        if (Object.keys(al).length) o.alignment = al;
        if (s.bd) {
            o.border = {};
            [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']].forEach(function (x) {
                var b = s.bd[x[0]];
                if (b && b.s) o.border[x[1]] = { style: BORDER_OUT[b.s] || 'thin', color: { rgb: (b.c || '#000000').slice(1).toUpperCase() } };
            });
        }
        if (s.nf) o.numFmt = s.nf;
        return o;
    }

    function buildXlsx(XLSX) {
        var wbOut = XLSX.utils.book_new();
        var freezeInfo = [];
        App.wb.sheets.forEach(function (sh) {
            var ws = {};
            var maxR = 0, maxC = 0;
            sh.cells.forEach(function (cell, k) {
                var p = M.unkey(k);
                var addr = F.addr(p.r, p.c);
                var v = App.wb.value(sh, p.r, p.c);
                var o = {};
                if (v === null || v === undefined) { o.t = 's'; o.v = ''; if (!cell.s && !cell.link && !cell.note) return; }
                else if (typeof v === 'number') { o.t = 'n'; o.v = v; }
                else if (typeof v === 'boolean') { o.t = 'b'; o.v = v; }
                else if (v instanceof F.XErr) { o.t = 'e'; o.v = ERR_CODES[v.code] !== undefined ? ERR_CODES[v.code] : 0x0F; o.w = ERR_CODES[v.code] !== undefined ? v.code : '#VALUE!'; }
                else { o.t = 's'; o.v = String(v); }
                if (cell.f !== undefined) o.f = cell.f;
                if (cell.s) { o.s = styleOut(cell.s); if (cell.s.nf) o.z = cell.s.nf; }
                if (cell.link) o.l = { Target: cell.link };
                if (cell.note) o.c = [{ a: SO.ctx.name || 'Sinerli Hitara', t: cell.note }];
                ws[addr] = o;
                if (p.r > maxR) maxR = p.r;
                if (p.c > maxC) maxC = p.c;
            });
            // Nilai tumpahan (spill) ditulis sebagai nilai biasa agar tampil di Excel lama.
            sh.spillOwner.forEach(function (owner, k) {
                var p = M.unkey(k);
                var addr = F.addr(p.r, p.c);
                if (ws[addr] && ws[addr].f !== undefined) return;
                var v = App.wb.value(sh, p.r, p.c);
                if (v === null || v === undefined) return;
                ws[addr] = typeof v === 'number' ? { t: 'n', v: v } : typeof v === 'boolean' ? { t: 'b', v: v } : { t: 's', v: String(v) };
                if (p.r > maxR) maxR = p.r;
                if (p.c > maxC) maxC = p.c;
            });
            ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, maxR), c: Math.max(0, maxC) } });
            if (sh.merges.length) ws['!merges'] = sh.merges.map(function (m) { return { s: { r: m.r1, c: m.c1 }, e: { r: m.r2, c: m.c2 } }; });
            var cols = [];
            for (var c = 0; c <= Math.max(maxC, sh.freeze.c); c++) cols.push({ width: Math.max(0, Math.round((sh.cols.rawSize(c) - 5) / 7 * 256) / 256), hidden: !!sh.cols.hidden[c] });
            ws['!cols'] = cols;
            var rows = [];
            for (var r = 0; r <= maxR; r++) rows.push(sh.rows.sizes[r] !== undefined || sh.rows.hidden[r] ? { hpx: sh.rows.rawSize(r), hidden: !!sh.rows.hidden[r] } : null);
            ws['!rows'] = rows;
            if (sh.filter) ws['!autofilter'] = { ref: F.rangeAddr(sh.filter.r1, sh.filter.c1, sh.filter.r2, sh.filter.c2) };
            ws['!margins'] = { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };
            XLSX.utils.book_append_sheet(wbOut, ws, sh.name.slice(0, 31));
            freezeInfo.push({ freeze: sh.freeze, grid: sh.showGrid, tab: sh.tabColor });
        });
        var names = Object.keys(App.wb.names);
        if (names.length) {
            wbOut.Workbook = wbOut.Workbook || {};
            wbOut.Workbook.Names = names.map(function (n) { return { Name: n, Ref: String(App.wb.names[n]).replace(/^=/, '') }; });
        }
        var arr = XLSX.write(wbOut, { bookType: 'xlsx', type: 'array', cellStyles: true, compression: true });
        return { data: arr, freeze: freezeInfo };
    }

    /** Menambahkan freeze pane, gridline, dan warna tab ke XML sheet hasil SheetJS. */
    function postProcessXlsx(data, info) {
        var needs = info.some(function (x) { return x.freeze.r || x.freeze.c || !x.grid || x.tab; });
        if (!needs) return Promise.resolve(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        return SO.load('jszip').then(function (JSZip) { return JSZip.loadAsync(data); }).then(function (zip) {
            return Promise.all(info.map(function (x, i) {
                var path = 'xl/worksheets/sheet' + (i + 1) + '.xml';
                var f = zip.file(path);
                if (!f) return null;
                return f.async('string').then(function (xml) {
                    var attrs = 'workbookViewId="0"' + (x.grid ? '' : ' showGridLines="0"') + (i === App.wb.active ? ' tabSelected="1"' : '');
                    var pane = '';
                    if (x.freeze.r || x.freeze.c) {
                        var active = x.freeze.r && x.freeze.c ? 'bottomRight' : x.freeze.r ? 'bottomLeft' : 'topRight';
                        pane = '<pane' + (x.freeze.c ? ' xSplit="' + x.freeze.c + '"' : '') + (x.freeze.r ? ' ySplit="' + x.freeze.r + '"' : '') + ' topLeftCell="' + F.addr(x.freeze.r, x.freeze.c) + '" activePane="' + active + '" state="frozen"/>';
                    }
                    var view = '<sheetViews><sheetView ' + attrs + (pane ? '>' + pane + '</sheetView>' : '/>') + '</sheetViews>';
                    if (/<sheetViews[\s\S]*?<\/sheetViews>/.test(xml)) xml = xml.replace(/<sheetViews[\s\S]*?<\/sheetViews>/, view);
                    else if (/<sheetViews\/>/.test(xml)) xml = xml.replace('<sheetViews/>', view);
                    else xml = xml.replace(/(<dimension[^>]*\/>)/, '$1' + view);
                    if (x.tab) {
                        var tab = '<tabColor rgb="FF' + x.tab.slice(1).toUpperCase() + '"/>';
                        if (/<sheetPr[^>]*\/>/.test(xml)) xml = xml.replace(/<sheetPr([^>]*)\/>/, '<sheetPr$1>' + tab + '</sheetPr>');
                        else if (/<sheetPr[^>]*>/.test(xml)) xml = xml.replace(/<sheetPr([^>]*)>/, '<sheetPr$1>' + tab);
                        else xml = xml.replace(/(<worksheet[^>]*>)/, '$1<sheetPr>' + tab + '</sheetPr>');
                    }
                    zip.file(path, xml);
                });
            })).then(function () { return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' }); });
        });
    }

    function csvText(sh, delim) {
        var b = sh.bounds();
        var lines = [];
        for (var r = 0; r <= b.r2; r++) {
            var row = [];
            for (var c = 0; c <= b.c2; c++) {
                var v = App.wb.value(sh, r, c);
                var s = App.wb.styleAt(sh, r, c);
                var t;
                if (typeof v === 'number' && !(s.nf && F.isDateFormat(s.nf))) t = delim === ';' ? String(v).replace('.', ',') : String(v);
                else t = App.wb.display(sh, r, c).text;
                if (t.indexOf(delim) !== -1 || /["\n\r]/.test(t)) t = '"' + t.replace(/"/g, '""') + '"';
                row.push(t);
            }
            lines.push(row.join(delim));
        }
        return '﻿' + lines.join('\r\n') + '\r\n';
    }

    // --------------------------------------------------------- cetak/PDF
    var PAPER = { a4: [210, 297], letter: [215.9, 279.4], legal: [215.9, 355.6], f4: [215, 330], a3: [297, 420], a5: [148, 210] };
    var MARGIN_MM = { normal: 19, narrow: 10, wide: 25 };

    function printArea(sh) {
        var ps = sh.pageSetup || {};
        if (ps.area) { var p = F.parseRange(ps.area); if (p) return p; }
        var bv = sh.bounds();
        var r2 = Math.max(bv.r2, 0), c2 = Math.max(bv.c2, 0);
        sh.charts.concat(sh.images).forEach(function (o) {
            r2 = Math.max(r2, sh.rows.indexAt(o.y + o.h));
            c2 = Math.max(c2, sh.cols.indexAt(o.x + o.w));
        });
        return { r1: 0, c1: 0, r2: r2, c2: c2 };
    }

    /** Membuat halaman cetak berupa tabel HTML. Mengembalikan elemen halaman. */
    C.buildPrintPages = function (host, sheets) {
        host.innerHTML = '';
        var pages = [];
        sheets.forEach(function (sh) {
            var ps = sh.pageSetup || {};
            var paper = PAPER[ps.size] || PAPER.a4;
            var land = ps.orientation === 'landscape';
            var pw = (land ? paper[1] : paper[0]) * 96 / 25.4, ph = (land ? paper[0] : paper[1]) * 96 / 25.4;
            var margin = (MARGIN_MM[ps.margins] || 19) * 96 / 25.4;
            var cw = pw - margin * 2, chH = ph - margin * 2 - 22;
            var area = printArea(sh);
            var colList = [], totalW = 0;
            for (var c = area.c1; c <= area.c2; c++) if (!sh.cols.isHidden(c)) { colList.push(c); totalW += sh.cols.rawSize(c); }
            var rowList = [];
            for (var r = area.r1; r <= area.r2; r++) if (!sh.rows.isHidden(r)) rowList.push(r);
            var headW = ps.headings ? 34 : 0;
            var scale = ps.fit === 'none' ? 1 : Math.min(1, (cw - headW) / Math.max(1, totalW));
            if (ps.fit === 'page') {
                var totalH = rowList.reduce(function (s, rr) { return s + sh.rows.rawSize(rr); }, 0);
                scale = Math.min(scale, chH / Math.max(1, totalH));
            }
            // Pecah kolom per halaman bila tidak dipaskan.
            var colChunks = [[]], acc = 0;
            colList.forEach(function (cc) {
                var w = sh.cols.rawSize(cc) * scale;
                if (acc + w > cw - headW && colChunks[colChunks.length - 1].length) { colChunks.push([]); acc = 0; }
                colChunks[colChunks.length - 1].push(cc);
                acc += w;
            });
            var rowChunks = [[]], accH = 0;
            rowList.forEach(function (rr) {
                var h = sh.rows.rawSize(rr) * scale;
                if (accH + h > chH && rowChunks[rowChunks.length - 1].length) { rowChunks.push([]); accH = 0; }
                rowChunks[rowChunks.length - 1].push(rr);
                accH += h;
            });
            var pageNo = 0;
            rowChunks.forEach(function (rows) {
                colChunks.forEach(function (cols) {
                    pageNo++;
                    var page = SO.el('div', { class: 'sx-print-page', style: { width: pw + 'px', height: ph + 'px', padding: margin + 'px', boxSizing: 'border-box', background: '#fff', position: 'relative', overflow: 'hidden' } });
                    page.appendChild(SO.el('div', { class: 'sx-print-head' }, SO.el('span', { text: App.getTitle() + ' — ' + sh.name }), SO.el('span', { text: String(pageNo) })));
                    var table = SO.el('table', { class: 'sx-print-table' + (ps.grid ? ' has-grid' : ''), style: { transformOrigin: '0 0' } });
                    var colgroup = SO.el('colgroup');
                    if (headW) colgroup.appendChild(SO.el('col', { style: { width: headW + 'px' } }));
                    cols.forEach(function (cc) { colgroup.appendChild(SO.el('col', { style: { width: Math.round(sh.cols.rawSize(cc) * scale) + 'px' } })); });
                    table.appendChild(colgroup);
                    table.style.width = Math.round(cols.reduce(function (s, cc) { return s + sh.cols.rawSize(cc) * scale; }, headW)) + 'px';
                    if (ps.headings) {
                        var hr = SO.el('tr', {}, SO.el('td', { style: { background: '#f2f2f2' } }));
                        cols.forEach(function (cc) { hr.appendChild(SO.el('td', { text: F.colName(cc), style: { background: '#f2f2f2', textAlign: 'center', fontSize: '8pt' } })); });
                        table.appendChild(hr);
                    }
                    var covered = {};
                    rows.forEach(function (rr) {
                        var tr = SO.el('tr', { style: { height: Math.round(sh.rows.rawSize(rr) * scale) + 'px' } });
                        if (ps.headings) tr.appendChild(SO.el('td', { text: String(rr + 1), style: { background: '#f2f2f2', textAlign: 'center', fontSize: '8pt' } }));
                        cols.forEach(function (cc) {
                            if (covered[rr + ':' + cc]) return;
                            var m = sh.mergeAt(rr, cc);
                            var td = SO.el('td');
                            if (m) {
                                if (m.r1 !== rr || m.c1 !== cc) {
                                    if (!(m.r1 < rows[0] && rr === rows[0] && cc === Math.max(m.c1, cols[0])) && !(m.c1 < cols[0] && cc === cols[0] && rr === Math.max(m.r1, rows[0]))) return;
                                }
                                var rs = rows.filter(function (x) { return x >= m.r1 && x <= m.r2; }).length;
                                var cs = cols.filter(function (x) { return x >= m.c1 && x <= m.c2; }).length;
                                if (rs > 1) td.rowSpan = rs;
                                if (cs > 1) td.colSpan = cs;
                                rows.forEach(function (x) { cols.forEach(function (y) { if (x >= m.r1 && x <= m.r2 && y >= m.c1 && y <= m.c2) covered[x + ':' + y] = true; }); });
                            }
                            var sr = m ? m.r1 : rr, sc = m ? m.c1 : cc;
                            var d = App.wb.display(sh, sr, sc);
                            var s = App.wb.styleAt(sh, sr, sc);
                            var cfs = C.cfStyle ? C.cfStyle(sh, sr, sc) : null;
                            td.textContent = d.text;
                            var st = td.style;
                            st.fontSize = ((s.fs || 10) * scale) + 'pt';
                            if (s.ff) st.fontFamily = SO.fontStack(s.ff);
                            if (s.b || (cfs && cfs.b)) st.fontWeight = '700';
                            if (s.i) st.fontStyle = 'italic';
                            if (s.u || s.st) st.textDecoration = (s.u ? 'underline ' : '') + (s.st ? 'line-through' : '');
                            st.color = d.color || (cfs && cfs.fc) || s.fc || '#000';
                            if ((cfs && cfs.bg) || s.bg) st.background = (cfs && cfs.bg) || s.bg;
                            st.textAlign = d.align === 'justify' ? 'justify' : d.align;
                            st.verticalAlign = s.va === 'middle' ? 'middle' : s.va === 'top' ? 'top' : 'bottom';
                            if (s.wr) td.className = 'wrap';
                            if (s.bd) {
                                var css = function (b) { return b ? (b.s === 'medium' ? 2 : b.s === 'thick' ? 3 : b.s === 'double' ? 3 : 1) + 'px ' + (b.s === 'dashed' ? 'dashed' : b.s === 'dotted' ? 'dotted' : b.s === 'double' ? 'double' : 'solid') + ' ' + (b.c || '#000') : ''; };
                                if (s.bd.t) st.borderTop = css(s.bd.t);
                                if (s.bd.b) st.borderBottom = css(s.bd.b);
                                if (s.bd.l) st.borderLeft = css(s.bd.l);
                                if (s.bd.r) st.borderRight = css(s.bd.r);
                            }
                            tr.appendChild(td);
                        });
                        table.appendChild(tr);
                    });
                    page.appendChild(table);
                    // Grafik & gambar pada halaman ini.
                    var top0 = sh.rows.pos(rows[0]), left0 = sh.cols.pos(cols[0]);
                    var bottom0 = sh.rows.pos(rows[rows.length - 1] + 1), right0 = sh.cols.pos(cols[cols.length - 1] + 1);
                    sh.charts.concat(sh.images).forEach(function (o) {
                        if (o.y >= bottom0 || o.y + o.h <= top0 || o.x >= right0 || o.x + o.w <= left0) return;
                        var src = o.asset ? (App.assets.get(o.asset) || {}).url : C.chartImage ? C.chartImage(o) : null;
                        if (!src) return;
                        page.appendChild(SO.el('img', { src: src, style: { position: 'absolute', left: (margin + headW + (o.x - left0) * scale) + 'px', top: (margin + 22 + (ps.headings ? 18 : 0) + (o.y - top0) * scale) + 'px', width: o.w * scale + 'px', height: o.h * scale + 'px' } }));
                    });
                    host.appendChild(page);
                    pages.push({ el: page, w: pw, h: ph, land: land, paper: paper });
                });
            });
        });
        return pages;
    };

    C.print = function () {
        if (App.editing) App.commitEdit(null);
        var root = document.getElementById('sxPrintRoot');
        var pages = C.buildPrintPages(root, [App.sheet()]);
        if (!pages.length) return;
        var p0 = pages[0];
        var style = document.getElementById('sxPageStyle');
        if (!style) { style = document.createElement('style'); style.id = 'sxPageStyle'; document.head.appendChild(style); }
        var w = p0.land ? p0.paper[1] : p0.paper[0], h = p0.land ? p0.paper[0] : p0.paper[1];
        style.textContent = '@page { size: ' + w + 'mm ' + h + 'mm; margin: 0; }';
        global.addEventListener('afterprint', function () { root.innerHTML = ''; }, { once: true });
        setTimeout(function () { global.print(); }, 80);
    };

    C.exportAs = function (fmt) {
        if (App.editing) App.commitEdit(null);
        var name = SO.safeName(App.getTitle(), 'Sinerli Hitara');
        var busy;
        var fail = function (e) { if (busy) busy.done(); console.error(e); SO.toast((e && e.message) || 'x_err_export', { type: 'error' }); };
        if (fmt === 'xlsx' || fmt === 'ods') {
            busy = SO.busy('x_exporting');
            SO.load('xlsx').then(function (XLSX) {
                if (fmt === 'ods') {
                    var built = buildXlsx(XLSX);
                    var wb2 = XLSX.read(built.data, { type: 'array', cellStyles: true, cellFormula: true });
                    var ods = XLSX.write(wb2, { bookType: 'ods', type: 'array' });
                    return new Blob([ods], { type: 'application/vnd.oasis.opendocument.spreadsheet' });
                }
                var res = buildXlsx(XLSX);
                return postProcessXlsx(res.data, res.freeze);
            }).then(function (blob) {
                busy.done();
                SO.download(blob, name + '.' + fmt);
                var hasObjects = App.wb.sheets.some(function (s) { return s.charts.length || s.images.length; });
                SO.toast(hasObjects && fmt === 'xlsx' ? 'x_export_no_charts' : 'x_exported', { type: hasObjects ? 'warn' : 'success', ms: hasObjects ? 6000 : 2800 });
            }).catch(fail);
        } else if (fmt === 'csv' || fmt === 'csv-semicolon' || fmt === 'tsv') {
            var d = fmt === 'tsv' ? '\t' : fmt === 'csv' ? ',' : ';';
            SO.download(csvText(App.sheet(), d), name + (App.wb.sheets.length > 1 ? ' - ' + SO.safeName(App.sheet().name) : '') + (fmt === 'tsv' ? '.tsv' : '.csv'), 'text/csv;charset=utf-8');
        } else if (fmt === 'pdf') {
            busy = SO.busy('x_exporting');
            Promise.all([SO.load('html2canvas'), SO.load('jspdf')]).then(function (libs) {
                var host = SO.el('div', { style: { position: 'fixed', left: '-100000px', top: '0' } });
                document.body.appendChild(host);
                var pages = C.buildPrintPages(host, [App.sheet()]);
                if (!pages.length) { host.remove(); throw new Error(SO.t('x_nothing_to_print')); }
                var p0 = pages[0];
                var w = p0.land ? p0.paper[1] : p0.paper[0], h = p0.land ? p0.paper[0] : p0.paper[1];
                var pdf = new libs[1].jsPDF({ orientation: p0.land ? 'l' : 'p', unit: 'mm', format: [w, h], compress: true });
                var i = 0;
                var next = function () {
                    if (i >= pages.length) { host.remove(); return pdf.output('blob'); }
                    busy.set(SO.t('x_pdf_progress', { i: i + 1, n: pages.length }));
                    return libs[0](pages[i].el, { scale: 2, backgroundColor: '#ffffff', logging: false }).then(function (canvas) {
                        if (i > 0) pdf.addPage([w, h], p0.land ? 'l' : 'p');
                        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h, undefined, 'FAST');
                        i++;
                        return next();
                    });
                };
                return next().catch(function (e) { host.remove(); throw e; });
            }).then(function (blob) { busy.done(); SO.download(blob, name + '.pdf'); SO.toast('x_exported', { type: 'success' }); }).catch(fail);
        } else if (fmt === 'html') {
            var root = SO.el('div');
            C.buildPrintPages(root, [App.sheet()]);
            var tables = SO.$$('table', root).map(function (t) { return t.outerHTML; }).join('<br>');
            var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + SO.esc(App.getTitle()) + '</title><style>table{border-collapse:collapse;font-family:Arial,sans-serif;margin:16px}td{padding:2px 4px;border:1px solid #ddd;white-space:nowrap}td.wrap{white-space:pre-wrap}</style></head><body>' + tables + '</body></html>';
            SO.download(html, name + '.html', 'text/html;charset=utf-8');
        } else if (fmt === 'sineex') {
            App.serialize().then(function (data) {
                data.name = App.getTitle();
                SO.download(JSON.stringify(data), name + '.sineex', 'application/json');
            }).catch(fail);
        }
    };

    /** Thumbnail kartu Dashboard: potongan kiri atas lembar aktif. */
    C.thumbnail = function () {
        var sh = App.wb.sheets[0];
        var W = 400, H = 250;
        var cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);
        var z = 0.62, hw = 18, hh = 13;
        ctx.fillStyle = '#f3f3f3';
        ctx.fillRect(0, 0, W, hh);
        ctx.fillRect(0, 0, hw, H);
        ctx.font = '8px Arial';
        ctx.textBaseline = 'middle';
        var x = hw;
        var cols = [];
        for (var c = 0; x < W && c < 40; c++) { var w = sh.cols.size(c) * z; if (!w) continue; cols.push({ c: c, x: x, w: w }); x += w; }
        var y = hh;
        var rows = [];
        for (var r = 0; y < H && r < 60; r++) { var h = sh.rows.size(r) * z; if (!h) continue; rows.push({ r: r, y: y, h: h }); y += h; }
        ctx.strokeStyle = '#e3e3e3';
        ctx.beginPath();
        cols.forEach(function (cc) { ctx.moveTo(Math.round(cc.x + cc.w) + 0.5, hh); ctx.lineTo(Math.round(cc.x + cc.w) + 0.5, H); });
        rows.forEach(function (rr) { ctx.moveTo(hw, Math.round(rr.y + rr.h) + 0.5); ctx.lineTo(W, Math.round(rr.y + rr.h) + 0.5); });
        ctx.stroke();
        rows.forEach(function (rr) {
            cols.forEach(function (cc) {
                var s = App.wb.styleAt(sh, rr.r, cc.c);
                if (s.bg) { ctx.fillStyle = s.bg; ctx.fillRect(cc.x, rr.y, cc.w, rr.h); }
                var d = App.wb.display(sh, rr.r, cc.c);
                if (!d.text) return;
                ctx.save();
                ctx.beginPath();
                ctx.rect(cc.x, rr.y, cc.w, rr.h);
                ctx.clip();
                ctx.font = (s.b ? 'bold ' : '') + Math.max(6, (s.fs || 10) * 1.33 * z) + 'px Arial';
                ctx.fillStyle = s.fc || '#222';
                ctx.textAlign = d.align === 'right' ? 'right' : d.align === 'center' ? 'center' : 'left';
                ctx.fillText(d.text, d.align === 'right' ? cc.x + cc.w - 2 : d.align === 'center' ? cc.x + cc.w / 2 : cc.x + 2, rr.y + rr.h / 2);
                ctx.restore();
            });
        });
        ctx.fillStyle = '#1D7044';
        ctx.fillRect(0, H - 4, W, 4);
        return cv.toDataURL('image/jpeg', 0.75);
    };
})(window);
