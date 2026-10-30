/**
 * Sinerli Hitara — interaksi: mouse & sentuh, keyboard, penyuntingan sel, formula bar,
 * mode tunjuk rujukan, pelengkap otomatis fungsi, isian otomatis (fill),
 * serta salin/potong/tempel.
 */
(function (global) {
    'use strict';

    var App = global.SineEX, F = global.SXF, M = global.SXM;
    var el = App.el;
    var editor = el.editor, formula = el.formula, scroll = el.scroll;

    function sheet() { return App.sheet(); }
    function gridPoint(e) {
        var r = el.grid.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top, rect: r };
    }

    // ========================================================= editor
    App.startEdit = function (mode, text, opts) {
        opts = opts || {};
        var sh = sheet();
        if (App.editing) return;
        if (sh.protected) { SO.toast('x_sheet_protected', { type: 'warn' }); editor.value = ''; return; }
        var a = App.sel.active;
        var original = App.wb.editText(sh, a.r, a.c);
        App.editing = { r: a.r, c: a.c, sheetId: sh.id, mode: mode, original: original, point: null };
        if (App.clipboard) App.clipboard.marquee = false;
        var s = App.wb.styleAt(sh, a.r, a.c);
        editor.classList.add('is-editing');
        editor.style.font = App.fontFor(s, sh.zoom);
        editor.style.color = s.fc || '#000';
        editor.style.background = s.bg || '#fff';
        editor.style.textAlign = s.ha === 'center' || s.ha === 'right' ? s.ha : 'left';
        editor.value = text !== undefined && text !== null ? text : original;
        App.positionEditor();
        var end = editor.value.length;
        if (!opts.keepCaret) { try { editor.setSelectionRange(end, end); } catch (e) {} }
        if (document.activeElement !== editor && !opts.fromFormula) editor.focus({ preventScroll: true });
        formula.value = editor.value;
        document.getElementById('sxFxCancel').disabled = false;
        document.getElementById('sxFxEnter').disabled = false;
        App.updateEditAids();
        App.updateStatus();
        App.requestRender();
    };

    App.positionEditor = function () {
        var sh = sheet();
        if (!App.wb) return;
        if (!App.editing) {
            var r0 = App.cellRect(App.sel.active.r, App.sel.active.c);
            editor.style.left = SO.clamp(r0.x, 0, el.grid.clientWidth - 2) + 'px';
            editor.style.top = SO.clamp(r0.y, 0, el.grid.clientHeight - 2) + 'px';
            editor.style.width = '2px';
            editor.style.height = '2px';
            return;
        }
        var ed = App.editing;
        if (ed.sheetId !== sh.id) { editor.style.left = '-9999px'; return; }
        var rect = App.cellRect(ed.r, ed.c);
        var s = App.wb.styleAt(sh, ed.r, ed.c);
        var font = App.fontFor(s, sh.zoom);
        var maxW = el.grid.clientWidth - rect.x - 6;
        var lines = editor.value.split('\n');
        var ctx = App._measureCtx || (App._measureCtx = document.createElement('canvas').getContext('2d'));
        ctx.font = font;
        var textW = 0;
        lines.forEach(function (ln) { textW = Math.max(textW, ctx.measureText(ln + 'MM').width); });
        var w = Math.min(Math.max(rect.w + 1, textW + 10), Math.max(rect.w + 1, maxW));
        var lineH = (s.fs || 10) * 96 / 72 * sh.zoom * 1.25;
        var wrapLines = s.wr ? App.wrapLines(editor.value, w - 10, font).length : lines.length;
        var h = Math.max(rect.h + 1, wrapLines * lineH + 6);
        editor.style.left = Math.max(0, rect.x - 1) + 'px';
        editor.style.top = Math.max(0, rect.y - 1) + 'px';
        editor.style.width = w + 'px';
        editor.style.height = Math.min(h, el.grid.clientHeight - rect.y) + 'px';
        editor.style.whiteSpace = s.wr ? 'pre-wrap' : 'pre';
        if (!el.ac.hidden) positionAc();
    };

    function parenBalance(text) {
        var q = false, n = 0;
        for (var i = 0; i < text.length; i++) {
            if (text[i] === '"') q = !q;
            else if (!q && text[i] === '(') n++;
            else if (!q && text[i] === ')') n--;
        }
        return n;
    }

    /** Menyimpan isi editor. dir: 'down'|'up'|'right'|'left'|null. fill: isi semua sel terpilih. */
    App.commitEdit = function (dir, fill) {
        var ed = App.editing;
        if (!ed) return true;
        var sh = App.wb.sheetById(ed.sheetId);
        var text = editor.value;
        if (text.charAt(0) === '=' && text.length > 1) {
            var bal = parenBalance(text);
            if (bal > 0) text += ')'.repeat(bal);
            try { F.parse(text.slice(1).replace(/;/g, ',')); } catch (e) {
                SO.toast('x_formula_error', { type: 'error', ms: 4000 });
                editor.focus();
                return false;
            }
        }
        if (App.cmd.validateInput && text !== ed.original) {
            var check = App.cmd.validateInput(sh, ed.r, ed.c, text);
            if (check && !check.ok) {
                if (check.style === 'stop' || !check.style) {
                    SO.alert(check.message || 'x_dv_invalid', check.title || 'x_dv_title').then(function () { editor.focus(); try { editor.select(); } catch (e) {} });
                    return false;
                }
                SO.toast(check.message || 'x_dv_invalid', { type: 'warn' });
            }
        }
        App.editing = null;
        hideEditAids();
        editor.classList.remove('is-editing');
        editor.value = '';
        document.getElementById('sxFxCancel').disabled = true;
        document.getElementById('sxFxEnter').disabled = true;
        if (text !== ed.original || fill) {
            App.change('edit', function () {
                if (fill && App.sel.ranges.length) {
                    App.sel.ranges.forEach(function (rg) {
                        for (var r = rg.r1; r <= rg.r2; r++) for (var c = rg.c1; c <= rg.c2; c++) {
                            var t = text.charAt(0) === '=' ? '=' + F.shiftFormula(text.slice(1), r - ed.r, c - ed.c) : text;
                            App.wb.setInput(sh, r, c, t);
                        }
                    });
                } else {
                    App.wb.setInput(sh, ed.r, ed.c, text);
                    var cell = sh.cell(ed.r, ed.c);
                    // Teks multi-baris otomatis membungkus.
                    if (text.indexOf('\n') !== -1 && !(cell && cell.s && cell.s.wr)) App.wb.setStyle(sh, ed.r, ed.c, ed.r, ed.c, { wr: true });
                }
            });
            if (App.cmd.autoFitRowAfterEdit) App.cmd.autoFitRowAfterEdit(sh, ed.r);
        }
        if (dir) App.moveActive(dir);
        App.updateFormulaBar();
        App.positionEditor();
        App.focusGrid();
        App.updateStatus();
        App.requestRender();
        return true;
    };

    App.cancelEdit = function () {
        if (!App.editing) return;
        App.editing = null;
        hideEditAids();
        editor.classList.remove('is-editing');
        editor.value = '';
        document.getElementById('sxFxCancel').disabled = true;
        document.getElementById('sxFxEnter').disabled = true;
        App.updateFormulaBar();
        App.positionEditor();
        App.focusGrid();
        App.updateStatus();
        App.requestRender();
    };

    // --------------------------------------------- rujukan, pelengkap, petunjuk
    function hideEditAids() {
        App.editRefs = [];
        el.ac.hidden = true;
        el.hint.hidden = true;
        acState = null;
    }

    App.updateEditAids = function () {
        var ed = App.editing;
        if (!ed) return;
        var text = editor.value;
        if (text.charAt(0) !== '=') { App.editRefs = []; el.ac.hidden = true; el.hint.hidden = true; App.requestRender(); return; }
        var sh = sheet();
        var colorIdx = 0, seen = {};
        App.editRefs = F.refsIn(text.slice(1)).filter(function (rf) {
            return !rf.sheet || rf.sheet.toLowerCase() === sh.name.toLowerCase();
        }).map(function (rf) {
            var k = rf.r1 + ':' + rf.c1 + ':' + rf.r2 + ':' + rf.c2;
            if (seen[k] === undefined) seen[k] = colorIdx++;
            return { r1: rf.r1, c1: rf.c1, r2: Math.min(rf.r2, sh.rows.count - 1), c2: Math.min(rf.c2, sh.cols.count - 1), color: App.REF_COLORS[seen[k] % App.REF_COLORS.length], sheetId: sh.id };
        });
        updateAutocomplete();
        updateHint();
        App.requestRender();
    };

    var acState = null;
    function fnDesc(name) {
        var k = 'x_fn_' + name.toLowerCase().replace(/\./g, '_');
        if (SO.has(k)) return SO.t(k);
        var info = F.FN_INFO.filter(function (x) { return x[0] === name; })[0];
        return info ? info[2] : '';
    }
    function updateAutocomplete() {
        var text = editor.value;
        var caret = editor.selectionStart;
        var before = text.slice(0, caret);
        var m = /(^=|[=(,;+\-*/^&<>:\s])([A-Za-z][A-Za-z0-9.]*)$/.exec(before);
        if (!m || (text.charAt(caret) && /[A-Za-z0-9(]/.test(text.charAt(caret)))) { el.ac.hidden = true; acState = null; return; }
        var prefix = m[2].toUpperCase();
        if (/^[A-Z]{1,3}\d+$/.test(prefix)) { el.ac.hidden = true; acState = null; return; }
        var order = F.FN_INFO.map(function (x) { return x[0]; });
        var names = Object.keys(F.FN).filter(function (n) { return n.indexOf(prefix) === 0; });
        names.sort(function (a, b) {
            var ia = order.indexOf(a), ib = order.indexOf(b);
            if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
            return a < b ? -1 : 1;
        });
        Object.keys(App.wb.names).forEach(function (n) { if (n.indexOf(prefix) === 0) names.push(n); });
        names = names.slice(0, 12);
        if (!names.length || (names.length === 1 && names[0] === prefix)) { el.ac.hidden = true; acState = null; return; }
        acState = { items: names, index: 0, start: caret - m[2].length, end: caret };
        el.ac.innerHTML = '';
        names.forEach(function (n, i) {
            var isName = !F.FN[n];
            var it = SO.el('div', { class: 'sx-ac-item' + (i === 0 ? ' is-active' : ''), dataset: { i: i } });
            it.appendChild(SO.el('b', { text: n }));
            it.appendChild(SO.el('span', { text: isName ? SO.t('x_defined_name') : fnDesc(n) }));
            it.addEventListener('mousedown', function (e) { e.preventDefault(); acState.index = i; acceptAc(); });
            el.ac.appendChild(it);
        });
        el.ac.hidden = false;
        positionAc();
    }
    function positionAc() {
        var ed = App.editing;
        if (!ed) return;
        var eb = document.activeElement === formula ? formula.getBoundingClientRect() : editor.getBoundingClientRect();
        var gr = el.grid.getBoundingClientRect();
        var x = eb.left - gr.left, y = eb.bottom - gr.top + 2;
        if (y + 200 > gr.height) y = Math.max(0, eb.top - gr.top - Math.min(240, el.ac.offsetHeight) - 2);
        el.ac.style.left = Math.max(0, Math.min(x, gr.width - 260)) + 'px';
        el.ac.style.top = Math.max(0, y) + 'px';
    }
    function moveAc(d) {
        if (!acState) return;
        acState.index = (acState.index + d + acState.items.length) % acState.items.length;
        SO.$$('.sx-ac-item', el.ac).forEach(function (it, i) { it.classList.toggle('is-active', i === acState.index); if (i === acState.index) it.scrollIntoView({ block: 'nearest' }); });
    }
    function acceptAc() {
        if (!acState) return;
        var name = acState.items[acState.index];
        var isFn = !!F.FN[name];
        var src = document.activeElement === formula ? formula : editor;
        var text = src.value;
        var ins = name + (isFn ? '(' : '');
        src.value = text.slice(0, acState.start) + ins + text.slice(acState.end);
        var pos = acState.start + ins.length;
        src.setSelectionRange(pos, pos);
        if (src === formula) editor.value = formula.value; else formula.value = editor.value;
        el.ac.hidden = true;
        acState = null;
        App.positionEditor();
        App.updateEditAids();
    }

    function updateHint() {
        var src = document.activeElement === formula ? formula : editor;
        var text = src.value, caret = src.selectionStart;
        var depth = 0, q = false, argIdx = 0, fnName = null;
        for (var i = caret - 1; i >= 0; i--) {
            var ch = text[i];
            if (ch === '"') { q = !q; continue; }
            if (q) continue;
            if (ch === ')') depth++;
            else if (ch === '(') {
                if (depth === 0) {
                    var m = /([A-Za-z][A-Za-z0-9.]*)\s*$/.exec(text.slice(0, i));
                    fnName = m ? m[1].toUpperCase() : null;
                    break;
                }
                depth--;
            } else if ((ch === ',' || ch === ';') && depth === 0) argIdx++;
        }
        var info = fnName && F.FN_INFO.filter(function (x) { return x[0] === fnName; })[0];
        if (!info || !el.ac.hidden) { el.hint.hidden = true; return; }
        var syn = info[2];
        var inner = syn.slice(syn.indexOf('(') + 1, syn.lastIndexOf(')'));
        var args = inner.split(/,\s*/);
        var html = SO.esc(fnName) + '(' + args.map(function (a, i) {
            var cur = i === argIdx || (a.indexOf('…') !== -1 && argIdx >= i);
            return cur ? '<b>' + SO.esc(a) + '</b>' : SO.esc(a);
        }).join(', ') + ')';
        el.hint.innerHTML = html;
        el.hint.hidden = false;
        var eb = src.getBoundingClientRect();
        var gr = el.grid.getBoundingClientRect();
        el.hint.style.left = Math.max(0, Math.min(eb.left - gr.left, gr.width - el.hint.offsetWidth - 4)) + 'px';
        var y = eb.bottom - gr.top + 2;
        el.hint.style.top = (src === formula ? 2 : y) + 'px';
    }

    // ------------------------------------------------------ mode tunjuk
    function canPoint() {
        var ed = App.editing;
        if (!ed) return false;
        var src = document.activeElement === formula ? formula : editor;
        var text = src.value;
        if (text.charAt(0) !== '=') return false;
        var caret = src.selectionStart;
        if (src.selectionEnd !== caret) return false;
        if (ed.point && ed.point.end === caret) return true;
        var before = text.slice(0, caret).replace(/\s+$/, '');
        return /[=(,;+\-*/^&<>:]$/.test(before);
    }

    function refTextFor(anchor, cur) {
        var r1 = Math.min(anchor.r, cur.r), r2 = Math.max(anchor.r, cur.r);
        var c1 = Math.min(anchor.c, cur.c), c2 = Math.max(anchor.c, cur.c);
        var sh = sheet();
        var m = sh.mergeAt(r1, c1);
        if (r1 === r2 && c1 === c2 && m) { r2 = m.r2; c2 = m.c2; }
        return F.rangeAddr(r1, c1, r2, c2);
    }

    function pointSet(anchor, cur) {
        var ed = App.editing;
        var src = document.activeElement === formula ? formula : editor;
        var text = src.value;
        var start, end;
        if (ed.point) { start = ed.point.start; end = ed.point.end; }
        else { start = end = src.selectionStart; }
        var ref = refTextFor(anchor, cur);
        src.value = text.slice(0, start) + ref + text.slice(end);
        var pos = start + ref.length;
        src.setSelectionRange(pos, pos);
        ed.point = { start: start, end: pos, anchor: anchor, cur: cur };
        if (src === formula) editor.value = formula.value; else formula.value = editor.value;
        App.positionEditor();
        App.updateEditAids();
        App.scrollIntoView(cur);
        App.updateStatus();
    }

    function pointMove(dr, dc, extend) {
        var ed = App.editing;
        var base = ed.point ? ed.point.cur : { r: ed.r, c: ed.c };
        var cur = { r: SO.clamp(base.r + dr, 0, F.MAX_ROWS - 1), c: SO.clamp(base.c + dc, 0, F.MAX_COLS - 1) };
        var anchor = extend && ed.point ? ed.point.anchor : cur;
        pointSet(anchor, cur);
    }

    // =============================================================== gerak
    App.moveActive = function (dir) {
        var sh = sheet();
        var rg = App.selRange();
        var a = App.sel.active;
        var multi = App.sel.ranges.length > 1 || rg.r1 !== rg.r2 || rg.c1 !== rg.c2;
        var m = sh.mergeAt(a.r, a.c);
        if (multi && !(m && m.r1 === rg.r1 && m.c1 === rg.c1 && m.r2 === rg.r2 && m.c2 === rg.c2)) {
            // Bergerak di dalam seleksi (Enter/Tab di Excel).
            var r = a.r, c = a.c;
            var step = function () {
                if (dir === 'down') { r++; if (r > rg.r2) { r = rg.r1; c++; if (c > rg.c2) c = rg.c1; } }
                else if (dir === 'up') { r--; if (r < rg.r1) { r = rg.r2; c--; if (c < rg.c1) c = rg.c2; } }
                else if (dir === 'right') { c++; if (c > rg.c2) { c = rg.c1; r++; if (r > rg.r2) r = rg.r1; } }
                else { c--; if (c < rg.c1) { c = rg.c2; r--; if (r < rg.r1) r = rg.r2; } }
            };
            var guard = 0;
            do { step(); var mm = sh.mergeAt(r, c); if (!mm || (mm.r1 === r && mm.c1 === c)) break; } while (guard++ < 10000);
            App.sel.active = { r: r, c: c };
            App.onSelectionChanged({ focusCell: { r: r, c: c } });
            return;
        }
        var dr = dir === 'down' ? 1 : dir === 'up' ? -1 : 0, dc = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
        // Seperti Excel: Tab beberapa kali lalu Enter kembali ke kolom awal baris berikutnya.
        var ret = App._tabRet && App._tabRet.at.r === a.r && App._tabRet.at.c === a.c ? App._tabRet : null;
        App._tabRet = null;
        App.moveBy(dr, dc, false, false);
        if (dc) {
            App._tabRet = { c: ret ? ret.c : a.c, at: { r: App.sel.active.r, c: App.sel.active.c } };
        } else if (dir === 'down' && ret && ret.c !== App.sel.active.c) {
            App.select(App.sel.active.r, ret.c);
        }
    };

    function nextVisible(axis, i, d) {
        var n = i + d;
        while (n >= 0 && n < axis.count && axis.size(n) === 0) n += d;
        return SO.clamp(n, 0, axis.count - 1);
    }

    function hasValue(sh, r, c) {
        var v = App.wb.value(sh, r, c);
        return v !== null && v !== undefined && v !== '';
    }

    /** Lompatan Ctrl+panah ke tepi blok data. */
    function dataEdge(sh, r, c, dr, dc) {
        var b = sh.bounds();
        var maxR = Math.max(b.r2, r), maxC = Math.max(b.c2, c);
        var nr = r + dr, nc = c + dc;
        var inside = function (rr, cc) { return rr >= 0 && cc >= 0 && rr <= (dr > 0 ? maxR : F.MAX_ROWS - 1) && cc <= (dc > 0 ? maxC : F.MAX_COLS - 1); };
        if (!inside(nr, nc)) return { r: dr > 0 ? Math.max(r, Math.min(F.MAX_ROWS - 1, sh.rows.count - 1)) : dr < 0 ? 0 : r, c: dc > 0 ? Math.max(c, sh.cols.count - 1) : dc < 0 ? 0 : c };
        if (hasValue(sh, r, c) && hasValue(sh, nr, nc)) {
            while (inside(nr + dr, nc + dc) && hasValue(sh, nr + dr, nc + dc)) { nr += dr; nc += dc; }
            return { r: nr, c: nc };
        }
        while (inside(nr, nc) && !hasValue(sh, nr, nc)) { nr += dr; nc += dc; }
        if (!inside(nr, nc)) return { r: dr > 0 ? Math.max(r, maxR) : dr < 0 ? 0 : r, c: dc > 0 ? Math.max(c, maxC) : dc < 0 ? 0 : c };
        return { r: nr, c: nc };
    }

    App.moveBy = function (dr, dc, extend, jump) {
        var sh = sheet();
        var from = extend ? (App._extendCur || App.sel.active) : App.sel.active;
        var m = sh.mergeAt(from.r, from.c);
        var r = from.r, c = from.c;
        if (jump) {
            var edge = dataEdge(sh, r, c, dr, dc);
            r = edge.r; c = edge.c;
        } else {
            if (dr > 0 && m) r = m.r2;
            if (dc > 0 && m) c = m.c2;
            if (dr) r = nextVisible(sh.rows, r, dr);
            if (dc) c = nextVisible(sh.cols, c, dc);
        }
        App.ensureCapacity(r + 40, c + 10);
        if (extend) {
            App._extendCur = { r: r, c: c };
            App.extendTo(r, c);
        } else {
            App._extendCur = null;
            App.select(r, c);
        }
    };

    // ========================================================== keyboard
    function onNavKey(e) {
        var sh = sheet();
        var combo = SO.onKeyCombo(e);
        var fn = App.shortcuts[combo];
        if (fn) { if (fn(e) !== false) { e.preventDefault(); return; } }
        var mod = SO.mod(e);
        switch (e.key) {
            case 'ArrowUp': e.preventDefault(); App.moveBy(-1, 0, e.shiftKey, mod); return;
            case 'ArrowDown':
                if (e.altKey && App.cmd.pickFromList) { e.preventDefault(); App.cmd.pickFromList(); return; }
                e.preventDefault(); App.moveBy(1, 0, e.shiftKey, mod); return;
            case 'ArrowLeft': e.preventDefault(); App.moveBy(0, -1, e.shiftKey, mod); return;
            case 'ArrowRight': e.preventDefault(); App.moveBy(0, 1, e.shiftKey, mod); return;
            case 'Tab': e.preventDefault(); App.moveActive(e.shiftKey ? 'left' : 'right'); return;
            case 'Enter':
                e.preventDefault();
                if (mod) { App.startEdit('edit'); return; }
                App.moveActive(e.shiftKey ? 'up' : 'down');
                return;
            case 'Home':
                e.preventDefault();
                if (mod) App.select(sh.freeze.r, sh.freeze.c); else if (e.shiftKey) App.extendTo(App.sel.active.r, 0); else App.select(App.sel.active.r, 0);
                return;
            case 'End':
                if (mod) { e.preventDefault(); var b = sh.bounds(); App.select(Math.max(0, b.r2), Math.max(0, b.c2)); }
                return;
            case 'PageDown': case 'PageUp':
                e.preventDefault();
                var rowsPage = Math.max(1, Math.floor((scroll.clientHeight - App.headerH()) / (sh.rows.def * sh.zoom)) - 1);
                if (e.altKey) {
                    var colsPage = Math.max(1, Math.floor((scroll.clientWidth - App.headerW()) / (sh.cols.def * sh.zoom)) - 1);
                    App.moveBy(0, e.key === 'PageDown' ? colsPage : -colsPage, e.shiftKey, false);
                } else {
                    scroll.scrollTop += (e.key === 'PageDown' ? 1 : -1) * rowsPage * sh.rows.def * sh.zoom;
                    App.moveBy(e.key === 'PageDown' ? rowsPage : -rowsPage, 0, e.shiftKey, false);
                }
                return;
            case 'F2': e.preventDefault(); App.startEdit('edit'); return;
            case 'Delete': e.preventDefault(); App.cmd.clear('contents'); return;
            case 'Backspace':
                e.preventDefault();
                if (sh.protected) { SO.toast('x_sheet_protected', { type: 'warn' }); return; }
                App.change('clear', function () { App.wb.setInput(sh, App.sel.active.r, App.sel.active.c, ''); });
                App.startEdit('enter', '');
                return;
            case 'Escape':
                if (App.clipboard && App.clipboard.marquee) { App.clipboard.marquee = false; App.requestRender(); }
                if (App.cmd.deselectObjects) App.cmd.deselectObjects();
                return;
            case ' ':
                if (e.shiftKey && !mod) { e.preventDefault(); var rg = App.selRange(); App.select(rg.r1, 0, rg.r2, F.MAX_COLS - 1, { active: App.sel.active }); return; }
                if (mod && !e.shiftKey) { e.preventDefault(); var rg2 = App.selRange(); App.select(0, rg2.c1, F.MAX_ROWS - 1, rg2.c2, { active: App.sel.active }); return; }
                break;
        }
        if (mod && (e.key === ';' || e.code === 'Semicolon')) {
            e.preventDefault();
            var d = new Date();
            App.startEdit('enter', e.shiftKey ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : (F.dmyOrder === 'mdy' ? (d.getMonth() + 1) + '/' + d.getDate() : d.getDate() + '/' + (d.getMonth() + 1)) + '/' + d.getFullYear());
        }
    }

    function onEditKey(e) {
        var ed = App.editing;
        var src = e.currentTarget;
        var mod = SO.mod(e);
        if (!el.ac.hidden && acState) {
            if (e.key === 'ArrowDown') { e.preventDefault(); moveAc(1); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); moveAc(-1); return; }
            if (e.key === 'Tab' || (e.key === 'Enter' && !e.altKey && !mod && !e.shiftKey)) { e.preventDefault(); acceptAc(); return; }
            if (e.key === 'Escape') { e.preventDefault(); el.ac.hidden = true; acState = null; return; }
        }
        switch (e.key) {
            case 'Enter':
                if (e.altKey || (e.ctrlKey && SO.isMac && !e.metaKey)) {
                    e.preventDefault();
                    var p = src.selectionStart;
                    src.value = src.value.slice(0, p) + '\n' + src.value.slice(src.selectionEnd);
                    src.setSelectionRange(p + 1, p + 1);
                    syncFrom(src);
                    return;
                }
                e.preventDefault();
                App.commitEdit(mod ? null : (e.shiftKey ? 'up' : 'down'), mod);
                return;
            case 'Tab':
                e.preventDefault();
                App.commitEdit(e.shiftKey ? 'left' : 'right');
                return;
            case 'Escape':
                e.preventDefault();
                App.cancelEdit();
                return;
            case 'F2':
                e.preventDefault();
                ed.mode = ed.mode === 'edit' ? 'enter' : 'edit';
                ed.point = null;
                App.updateStatus();
                return;
            case 'F4':
                e.preventDefault();
                var res = F.cycleAbsolute(src.value, src.selectionStart);
                if (res) { src.value = res.text; src.setSelectionRange(res.caret, res.caret); syncFrom(src); }
                return;
            case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
                var dr = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
                var dc = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
                if (ed.mode === 'enter' || (ed.point && ed.mode !== 'edit')) {
                    if (canPoint()) { e.preventDefault(); pointMove(dr, dc, e.shiftKey); return; }
                    if (src === editor && ed.mode === 'enter') {
                        e.preventDefault();
                        App.commitEdit(e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : e.key === 'ArrowLeft' ? 'left' : 'right');
                    }
                }
                return;
        }
        if (mod && (e.key === 'z' || e.key === 'Z')) { /* biarkan undo bawaan textarea */ }
    }

    function syncFrom(src) {
        if (src === formula) editor.value = formula.value; else formula.value = editor.value;
        if (App.editing) App.editing.point = null;
        App.positionEditor();
        App.updateEditAids();
    }

    // ---------------------------------------------------- event editor
    editor.addEventListener('keydown', function (e) {
        if (e.isComposing || e.keyCode === 229) return;
        if (App.editing) onEditKey(e); else onNavKey(e);
    });
    editor.addEventListener('compositionstart', function () {
        if (!App.editing) App.startEdit('enter', '', { keepCaret: true });
    });
    editor.addEventListener('input', function () {
        if (!App.editing) {
            var v = editor.value;
            editor.value = '';
            if (!v) return;
            App.startEdit('enter', v);
            return;
        }
        syncFrom(editor);
    });
    editor.addEventListener('click', function () { if (App.editing) { App.editing.point = null; updateHint(); } });
    editor.addEventListener('keyup', function (e) { if (App.editing && /Arrow|Home|End/.test(e.key)) updateHint(); });
    editor.addEventListener('blur', function (e) {
        if (!App.editing) return;
        var to = e.relatedTarget;
        if (to === formula || (to && (to.closest('.sx-ac') || to.closest('.so-dialog') || to.closest('.so-menu')))) return;
        setTimeout(function () {
            if (App.editing && document.activeElement !== editor && document.activeElement !== formula && !SO.isDialogOpen()) App.commitEdit(null);
        }, 0);
    });

    formula.addEventListener('focus', function () {
        if (!App.editing) {
            if (sheet().protected) { formula.blur(); SO.toast('x_sheet_protected', { type: 'warn' }); return; }
            var pos = formula.selectionStart;
            App.startEdit('edit', undefined, { fromFormula: true, keepCaret: true });
            try { formula.setSelectionRange(pos, pos); } catch (e) {}
        }
    });
    formula.addEventListener('input', function () { if (App.editing) syncFrom(formula); });
    formula.addEventListener('keydown', function (e) { if (App.editing && !e.isComposing) onEditKey(e); });
    formula.addEventListener('keyup', function () { if (App.editing) updateHint(); });
    formula.addEventListener('blur', function (e) {
        var to = e.relatedTarget;
        if (!App.editing || to === editor) return;
        setTimeout(function () {
            if (App.editing && document.activeElement !== editor && document.activeElement !== formula && !SO.isDialogOpen()) App.commitEdit(null);
        }, 0);
    });
    document.getElementById('sxFxCancel').addEventListener('mousedown', function (e) { e.preventDefault(); App.cancelEdit(); });
    document.getElementById('sxFxEnter').addEventListener('mousedown', function (e) { e.preventDefault(); App.commitEdit(null); });
    document.getElementById('sxFxExpand').addEventListener('click', function () {
        formula.classList.toggle('is-expanded');
        this.innerHTML = '<i class="fas fa-chevron-' + (formula.classList.contains('is-expanded') ? 'up' : 'down') + '"></i>';
        global.dispatchEvent(new Event('resize'));
    });

    el.namebox.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            var v = el.namebox.value.trim();
            if (!App.gotoRef(v)) {
                if (/^[A-Za-z_À-￿][\w.À-￿]*$/.test(v) && !/^[A-Za-z]{1,3}\d+$/.test(v) && App.cmd.defineName) {
                    App.cmd.defineName(v, App.selRange());
                } else SO.toast('x_invalid_ref', { type: 'error' });
            }
            App.updateNameBox();
            App.focusGrid();
        } else if (e.key === 'Escape') { App.updateNameBox(); App.focusGrid(); }
    });
    el.namebox.addEventListener('focus', function () { el.namebox.select(); });
    document.getElementById('sxNameBoxBtn').addEventListener('click', function () { if (App.cmd.namesMenu) App.cmd.namesMenu(el.namebox.parentNode); });

    // ============================================================ mouse
    var drag = null;
    var autoScrollTimer = null;
    var noteTimer = null;

    function stopAuto() { clearInterval(autoScrollTimer); autoScrollTimer = null; }

    function autoScroll(e) {
        var p = gridPoint(e);
        var dx = 0, dy = 0, edge = 24;
        if (p.x < App.headerW() + 4) dx = -1; else if (p.x > p.rect.width - edge) dx = 1;
        if (p.y < App.headerH() + 4) dy = -1; else if (p.y > p.rect.height - edge) dy = 1;
        if (!dx && !dy) { stopAuto(); return; }
        if (autoScrollTimer) return;
        autoScrollTimer = setInterval(function () {
            scroll.scrollLeft += dx * 24;
            scroll.scrollTop += dy * 24;
            if (drag && drag.lastEvent) onDragMove(drag.lastEvent);
        }, 40);
    }

    function selectHeader(hit, e, kind) {
        var a = App.sel.anchor;
        if (kind === 'col') {
            if (e.shiftKey) App.select(0, Math.min(a.c, hit.c), F.MAX_ROWS - 1, Math.max(a.c, hit.c), { anchor: a, active: App.sel.active, scroll: false });
            else App.select(0, hit.c, F.MAX_ROWS - 1, hit.c, { add: SO.mod(e), active: { r: 0, c: hit.c }, anchor: { r: 0, c: hit.c }, scroll: false });
        } else {
            if (e.shiftKey) App.select(Math.min(a.r, hit.r), 0, Math.max(a.r, hit.r), F.MAX_COLS - 1, { anchor: a, active: App.sel.active, scroll: false });
            else App.select(hit.r, 0, hit.r, F.MAX_COLS - 1, { add: SO.mod(e), active: { r: hit.r, c: 0 }, anchor: { r: hit.r, c: 0 }, scroll: false });
        }
    }

    function onDragMove(e) {
        if (!drag) return;
        drag.lastEvent = e;
        var p = gridPoint(e);
        var hit = App.hitTest(SO.clamp(p.x, App.headerW() + 1, p.rect.width - 1), SO.clamp(p.y, App.headerH() + 1, p.rect.height - 1));
        if (drag.type === 'select') {
            if (hit.r !== drag.lastR || hit.c !== drag.lastC) {
                drag.lastR = hit.r; drag.lastC = hit.c;
                App.extendTo(hit.r, hit.c, { scroll: false });
            }
        } else if (drag.type === 'col') {
            var ch = App.hitTest(SO.clamp(p.x, App.headerW() + 1, p.rect.width - 1), 2);
            App.select(0, Math.min(drag.start, ch.c), F.MAX_ROWS - 1, Math.max(drag.start, ch.c), { anchor: { r: 0, c: drag.start }, active: { r: 0, c: drag.start }, scroll: false, add: drag.add });
            if (drag.add) App.sel.ranges.splice(App.sel.ranges.length - 2, 1);
        } else if (drag.type === 'row') {
            var rh = App.hitTest(2, SO.clamp(p.y, App.headerH() + 1, p.rect.height - 1));
            App.select(Math.min(drag.start, rh.r), 0, Math.max(drag.start, rh.r), F.MAX_COLS - 1, { anchor: { r: drag.start, c: 0 }, active: { r: drag.start, c: 0 }, scroll: false, add: drag.add });
            if (drag.add) App.sel.ranges.splice(App.sel.ranges.length - 2, 1);
        } else if (drag.type === 'point') {
            pointSet(drag.anchor, { r: hit.r, c: hit.c });
        } else if (drag.type === 'resize-col') {
            var sh = sheet();
            var w = Math.max(0, Math.round((p.x - drag.startX) / sh.zoom + drag.startSize));
            drag.cols.forEach(function (c) { if (w < 2) sh.cols.hidden[c] = true; else { delete sh.cols.hidden[c]; sh.cols.sizes[c] = w; } });
            sh.cols.invalidate();
            App.updateScrollSize();
            App.requestRender();
            showSizeTip(e, SO.t('x_width') + ': ' + w + ' px');
            return;
        } else if (drag.type === 'resize-row') {
            var sh2 = sheet();
            var h = Math.max(0, Math.round((p.y - drag.startY) / sh2.zoom + drag.startSize));
            drag.rows.forEach(function (r) { if (h < 2) sh2.rows.hidden[r] = true; else { delete sh2.rows.hidden[r]; sh2.rows.sizes[r] = h; } });
            sh2.rows.invalidate();
            App.updateScrollSize();
            App.requestRender();
            showSizeTip(e, SO.t('x_height') + ': ' + h + ' px');
            return;
        } else if (drag.type === 'fill') {
            var src = drag.src;
            var tr = hit.r, tc = hit.c;
            var dRows = tr > src.r2 ? tr - src.r2 : tr < src.r1 ? tr - src.r1 : 0;
            var dCols = tc > src.c2 ? tc - src.c2 : tc < src.c1 ? tc - src.c1 : 0;
            var prev = null;
            if (Math.abs(dRows) >= Math.abs(dCols) && dRows) prev = dRows > 0 ? { r1: src.r1, c1: src.c1, r2: tr, c2: src.c2 } : { r1: tr, c1: src.c1, r2: src.r2, c2: src.c2 };
            else if (dCols) prev = dCols > 0 ? { r1: src.r1, c1: src.c1, r2: src.r2, c2: tc } : { r1: src.r1, c1: tc, r2: src.r2, c2: src.c2 };
            App.fillPreview = prev;
            App.requestRender();
        }
        autoScroll(e);
    }

    var sizeTip = null;
    function showSizeTip(e, text) {
        if (!sizeTip) { sizeTip = SO.el('div', { class: 'so-tooltip' }); document.body.appendChild(sizeTip); }
        sizeTip.textContent = text;
        sizeTip.style.left = (e.clientX + 14) + 'px';
        sizeTip.style.top = (e.clientY + 14) + 'px';
    }

    function endDrag(e) {
        if (!drag) return;
        stopAuto();
        var d = drag;
        drag = null;
        if (sizeTip) { sizeTip.remove(); sizeTip = null; }
        if (d.type === 'resize-col' || d.type === 'resize-row') {
            App.wb.commit();
        } else if (d.type === 'fill') {
            var prev = App.fillPreview;
            App.fillPreview = null;
            if (prev) {
                App.change('fill', function () { App.fillRange(d.src, prev, e && e.altKey); });
                App.select(prev.r1, prev.c1, prev.r2, prev.c2, { active: App.sel.active, anchor: { r: prev.r1, c: prev.c1 }, scroll: false });
            }
            App.requestRender();
        } else if (d.type === 'point') {
            App.editing && (document.activeElement === formula ? formula : editor).focus();
        }
        App.updateStatus();
    }

    scroll.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch') { touchStart(e); return; }
        if (e.target !== scroll && e.target !== el.size) return;
        var p = gridPoint(e);
        // Klik pada area batang gulir bawaan.
        if (p.x > scroll.clientWidth || p.y > scroll.clientHeight) return;
        var hit = App.hitTest(p.x, p.y);
        SO.closeMenus();
        if (App.cmd.deselectObjects) App.cmd.deselectObjects();
        if (e.button === 2) {
            if (hit.area === 'cell' && !inSelection(hit.r, hit.c)) App.select(hit.r, hit.c, hit.r, hit.c, { scroll: false });
            if (hit.area === 'colhead' && !(App.selRange().r1 === 0 && App.selRange().r2 >= F.MAX_ROWS - 1 && hit.c >= App.selRange().c1 && hit.c <= App.selRange().c2)) selectHeader(hit, e, 'col');
            if (hit.area === 'rowhead' && !(App.selRange().c1 === 0 && App.selRange().c2 >= F.MAX_COLS - 1 && hit.r >= App.selRange().r1 && hit.r <= App.selRange().r2)) selectHeader(hit, e, 'row');
            return;
        }
        if (e.button !== 0) return;
        if (App.editing) {
            if (hit.area === 'cell' && canPoint()) {
                e.preventDefault();
                var cur = { r: hit.r, c: hit.c };
                var anchor = e.shiftKey && App.editing.point ? App.editing.point.anchor : cur;
                if (!e.shiftKey && App.editing.point && !(App.editing.point.end === (document.activeElement === formula ? formula : editor).selectionStart)) App.editing.point = null;
                pointSet(anchor, cur);
                drag = { type: 'point', anchor: anchor };
                scroll.setPointerCapture(e.pointerId);
                return;
            }
            if (!App.commitEdit(null)) { e.preventDefault(); return; }
        }
        e.preventDefault();
        App.focusGrid();
        scroll.setPointerCapture(e.pointerId);
        if (hit.resizeCol !== undefined) {
            var sh = sheet();
            var rg0 = App.selRange();
            var cols = rg0.r1 === 0 && rg0.r2 >= F.MAX_ROWS - 1 && hit.resizeCol >= rg0.c1 && hit.resizeCol <= rg0.c2 ? range(rg0.c1, rg0.c2) : [hit.resizeCol];
            App._selBefore = App.captureSel();
            App.wb.begin('resize');
            App.wb.recordMeta(sh);
            drag = { type: 'resize-col', cols: cols, startX: p.x, startSize: sh.cols.rawSize(hit.resizeCol) * (sh.cols.hidden[hit.resizeCol] ? 0 : 1) };
            return;
        }
        if (hit.resizeRow !== undefined) {
            var sh2 = sheet();
            var rg1 = App.selRange();
            var rows = rg1.c1 === 0 && rg1.c2 >= F.MAX_COLS - 1 && hit.resizeRow >= rg1.r1 && hit.resizeRow <= rg1.r2 ? range(rg1.r1, rg1.r2) : [hit.resizeRow];
            App._selBefore = App.captureSel();
            App.wb.begin('resize');
            App.wb.recordMeta(sh2);
            drag = { type: 'resize-row', rows: rows, startY: p.y, startSize: sh2.rows.rawSize(hit.resizeRow) * (sh2.rows.hidden[hit.resizeRow] ? 0 : 1) };
            return;
        }
        if (hit.area === 'corner') { App.select(0, 0, F.MAX_ROWS - 1, F.MAX_COLS - 1, { active: App.sel.active, scroll: false }); return; }
        if (hit.area === 'colhead') { selectHeader(hit, e, 'col'); drag = { type: 'col', start: e.shiftKey ? App.sel.anchor.c : hit.c, add: SO.mod(e) }; return; }
        if (hit.area === 'rowhead') { selectHeader(hit, e, 'row'); drag = { type: 'row', start: e.shiftKey ? App.sel.anchor.r : hit.r, add: SO.mod(e) }; return; }
        if (hit.fillHandle && !sheet().protected) { drag = { type: 'fill', src: Object.assign({}, App.selRange()) }; return; }
        var link = sheet().cell(hit.r, hit.c);
        if (link && link.link && SO.mod(e)) { App.cmd.openLink(link.link); return; }
        if (e.shiftKey) App.extendTo(hit.r, hit.c, { scroll: false });
        else App.select(hit.r, hit.c, hit.r, hit.c, { add: SO.mod(e) && !App.editing, scroll: false });
        drag = { type: 'select', lastR: hit.r, lastC: hit.c };
    });

    function range(a, b) { var out = []; for (var i = a; i <= b; i++) out.push(i); return out; }
    function inSelection(r, c) {
        return App.sel.ranges.some(function (rg) { return r >= rg.r1 && r <= rg.r2 && c >= rg.c1 && c <= rg.c2; });
    }

    scroll.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        if (drag) { onDragMove(e); return; }
        var p = gridPoint(e);
        if (p.x > scroll.clientWidth || p.y > scroll.clientHeight) return;
        var hit = App.hitTest(p.x, p.y);
        scroll.classList.toggle('is-col-resize', hit.resizeCol !== undefined);
        scroll.classList.toggle('is-row-resize', hit.resizeRow !== undefined);
        scroll.classList.toggle('is-header-col', hit.area === 'colhead' && hit.resizeCol === undefined);
        scroll.classList.toggle('is-header-row', hit.area === 'rowhead' && hit.resizeRow === undefined);
        scroll.classList.toggle('is-fill', !!hit.fillHandle && !App.editing);
        // Catatan sel.
        clearTimeout(noteTimer);
        var cell = hit.area === 'cell' ? sheet().cell(hit.r, hit.c) : null;
        if (cell && (cell.note || cell.link)) {
            noteTimer = setTimeout(function () {
                var rc = App.cellRect(hit.r, hit.c);
                el.notePop.innerHTML = cell.note ? '<b>' + SO.esc(SO.t('x_note')) + '</b>' + SO.esc(cell.note) : '<b>' + SO.esc(cell.link) + '</b>' + SO.esc(SO.t('x_link_hint', { key: SO.keyLabel('Mod') }).replace('Ctrl+', 'Ctrl'));
                el.notePop.hidden = false;
                el.notePop.style.left = Math.min(rc.x + rc.w + 4, el.grid.clientWidth - 250) + 'px';
                el.notePop.style.top = Math.max(0, rc.y) + 'px';
            }, 350);
        } else el.notePop.hidden = true;
    });
    scroll.addEventListener('pointerup', function (e) {
        if (e.pointerType === 'touch') { touchEnd(e); return; }
        endDrag(e);
    });
    scroll.addEventListener('pointercancel', function () { stopAuto(); drag = null; App.fillPreview = null; });
    scroll.addEventListener('pointerleave', function () { el.notePop.hidden = true; clearTimeout(noteTimer); });
    scroll.addEventListener('lostpointercapture', function (e) { if (drag) endDrag(e); });

    scroll.addEventListener('dblclick', function (e) {
        var p = gridPoint(e);
        var hit = App.hitTest(p.x, p.y);
        if (hit.resizeCol !== undefined) { App.cmd.autoFit('col', [hit.resizeCol]); return; }
        if (hit.resizeRow !== undefined) { App.cmd.autoFit('row', [hit.resizeRow]); return; }
        if (hit.area !== 'cell') return;
        if (hit.fillHandle) { App.fillDownToData(); return; }
        if (App.editing) return;
        App.select(hit.r, hit.c, hit.r, hit.c, { scroll: false });
        App.startEdit('edit');
    });

    scroll.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        var p = gridPoint(e);
        var hit = App.hitTest(p.x, p.y);
        if (App.cmd.contextMenu) App.cmd.contextMenu(e, hit);
    });

    // Sentuh: geser tetap menggulir, ketuk memilih, ketuk dua kali mengedit.
    var touch = null, lastTap = 0;
    function touchStart(e) { touch = { x: e.clientX, y: e.clientY, t: Date.now(), sx: scroll.scrollLeft, sy: scroll.scrollTop }; }
    function touchEnd(e) {
        if (!touch) return;
        var moved = Math.abs(e.clientX - touch.x) > 8 || Math.abs(e.clientY - touch.y) > 8 || Math.abs(scroll.scrollLeft - touch.sx) > 4 || Math.abs(scroll.scrollTop - touch.sy) > 4;
        touch = null;
        if (moved) return;
        var p = gridPoint(e);
        var hit = App.hitTest(p.x, p.y);
        if (App.editing && !App.commitEdit(null)) return;
        if (hit.area === 'colhead') { selectHeader(hit, e, 'col'); return; }
        if (hit.area === 'rowhead') { selectHeader(hit, e, 'row'); return; }
        if (hit.area === 'corner') { App.select(0, 0, F.MAX_ROWS - 1, F.MAX_COLS - 1); return; }
        var now = Date.now();
        var same = App.sel.active.r === hit.r && App.sel.active.c === hit.c;
        App.select(hit.r, hit.c, hit.r, hit.c, { scroll: false });
        if (same && now - lastTap < 450) App.startEdit('edit');
        lastTap = now;
    }

    scroll.addEventListener('scroll', function () {
        var sh = sheet();
        if (scroll.scrollTop + scroll.clientHeight > scroll.scrollHeight - 300 && sh.rows.count < F.MAX_ROWS) { sh.rows.count = Math.min(F.MAX_ROWS, sh.rows.count + 500); sh.rows.invalidate(); App.updateScrollSize(); }
        if (scroll.scrollLeft + scroll.clientWidth > scroll.scrollWidth - 300 && sh.cols.count < F.MAX_COLS) { sh.cols.count = Math.min(F.MAX_COLS, sh.cols.count + 10); sh.cols.invalidate(); App.updateScrollSize(); }
        el.notePop.hidden = true;
        App.requestRender();
    }, { passive: true });
    el.grid.addEventListener('wheel', function (e) {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        App.setZoom(sheet().zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });
    global.addEventListener('resize', SO.debounce(function () { App.updateScrollSize(); App.requestRender(); }, 60));

    // ================================================================ fill
    var SEQS = null;
    function seqLists() {
        if (SEQS) return SEQS;
        var lists = [];
        ['id-ID', 'en-US'].forEach(function (loc) {
            ['long', 'short'].forEach(function (style) {
                var months = [], days = [];
                for (var m = 0; m < 12; m++) months.push(new Intl.DateTimeFormat(loc, { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2020, m, 1))).replace(/\.$/, ''));
                for (var d = 0; d < 7; d++) days.push(new Intl.DateTimeFormat(loc, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + d))).replace(/\.$/, ''));
                lists.push(months, days);
            });
        });
        lists.push(['Q1', 'Q2', 'Q3', 'Q4'], ['Kuartal 1', 'Kuartal 2', 'Kuartal 3', 'Kuartal 4']);
        SEQS = lists;
        return lists;
    }

    /** Menghasilkan nilai untuk isian ke-k (k mulai 0 setelah sumber) dari barisan sumber. */
    function seriesFor(sh, cells, positions, reverse) {
        var n = cells.length;
        var vals = cells.map(function (c) { return c && c.f === undefined ? c.v : undefined; });
        var hasFormula = cells.some(function (c) { return c && c.f !== undefined; });
        if (!hasFormula && vals.every(function (v) { return typeof v === 'number'; })) {
            var isDate = cells.some(function (c) { return c && c.s && F.isDateFormat(c.s.nf); });
            if (n === 1) {
                if (!isDate) return function () { return vals[0]; };
                return function (k) { return vals[0] + (reverse ? -(k + 1) : k + 1); };
            }
            var step = (vals[n - 1] - vals[0]) / (n - 1);
            // Tanggal dengan selisih bulan yang sama (mis. tanggal 1 tiap bulan).
            if (isDate) {
                var d0 = F.serialToDate(vals[0]), d1 = F.serialToDate(vals[1]);
                var monthStep = (d1.y - d0.y) * 12 + d1.m - d0.m;
                if (monthStep && d0.d === d1.d) {
                    return function (k) {
                        var last = F.serialToDate(vals[reverse ? 0 : n - 1]);
                        var total = last.y * 12 + last.m - 1 + monthStep * (reverse ? -(k + 1) : k + 1);
                        return F.dateToSerial(Math.floor(total / 12), total % 12 + 1, last.d);
                    };
                }
            }
            return function (k) { return F.roundTo(reverse ? vals[0] - step * (k + 1) : vals[n - 1] + step * (k + 1), 10); };
        }
        if (!hasFormula && vals.every(function (v) { return typeof v === 'string'; })) {
            var lists = seqLists();
            for (var li = 0; li < lists.length; li++) {
                var idx = vals.map(function (v) { return lists[li].map(function (x) { return x.toLowerCase(); }).indexOf(v.toLowerCase()); });
                if (idx.every(function (x) { return x !== -1; })) {
                    var L = lists[li];
                    var st = n > 1 ? ((idx[n - 1] - idx[0]) / (n - 1)) : 1;
                    var upper = vals[0] === vals[0].toUpperCase();
                    return function (k) {
                        var i = reverse ? idx[0] - st * (k + 1) : idx[n - 1] + st * (k + 1);
                        var s = L[((Math.round(i) % L.length) + L.length) % L.length];
                        return upper ? s.toUpperCase() : s;
                    };
                }
            }
            var tm = vals.map(function (v) { return /^(.*?)(\d+)(\D*)$/.exec(v); });
            if (tm.every(Boolean) && tm.every(function (m) { return m[1] === tm[0][1] && m[3] === tm[0][3]; })) {
                var nums = tm.map(function (m) { return parseInt(m[2], 10); });
                var pad = tm[0][2].length;
                var st2 = n > 1 ? (nums[n - 1] - nums[0]) / (n - 1) : 1;
                return function (k) {
                    var v = Math.round(reverse ? nums[0] - st2 * (k + 1) : nums[n - 1] + st2 * (k + 1));
                    var digits = String(Math.abs(v));
                    if (tm[0][2].charAt(0) === '0') digits = digits.padStart(pad, '0');
                    return tm[0][1] + (v < 0 ? '-' : '') + digits + tm[0][3];
                };
            }
        }
        return null;
    }

    /** Mengisi dest dari src (dest memuat src). copyOnly memaksa salin tanpa deret. */
    App.fillRange = function (src, dest, copyOnly) {
        var sh = sheet(), wb = App.wb;
        var vertical = dest.c1 === src.c1 && dest.c2 === src.c2;
        var reverse = vertical ? dest.r1 < src.r1 : dest.c1 < src.c1;
        var lines = vertical ? range(src.c1, src.c2) : range(src.r1, src.r2);
        lines.forEach(function (line) {
            var srcPos = vertical ? range(src.r1, src.r2) : range(src.c1, src.c2);
            var cells = srcPos.map(function (p) { return M.cloneCell(vertical ? sh.cell(p, line) : sh.cell(line, p)); });
            var gen = copyOnly ? null : seriesFor(sh, cells, srcPos, reverse);
            var targets = vertical
                ? (reverse ? range(dest.r1, src.r1 - 1).reverse() : range(src.r2 + 1, dest.r2))
                : (reverse ? range(dest.c1, src.c1 - 1).reverse() : range(src.c2 + 1, dest.c2));
            targets.forEach(function (t, k) {
                var si = reverse ? (srcPos.length - 1 - (k % srcPos.length)) : k % srcPos.length;
                var base = cells[si];
                var sp = srcPos[si];
                var next = base ? M.clone(base) : {};
                var tr = vertical ? t : line, tc = vertical ? line : t;
                if (base && base.f !== undefined) {
                    next.f = F.shiftFormula(base.f, vertical ? t - sp : 0, vertical ? 0 : t - sp);
                } else if (gen) {
                    next.v = gen(k);
                    delete next.f;
                }
                wb.setCell(sh, tr, tc, M.reviveCell(next));
            });
        });
    };

    App.fillDownToData = function () {
        var sh = sheet();
        var rg = App.selRange();
        var probe = rg.c1 > 0 ? rg.c1 - 1 : rg.c2 + 1;
        var r = rg.r2;
        while (r + 1 < F.MAX_ROWS && App.wb.value(sh, r + 1, probe) !== null) r++;
        if (r === rg.r2) return;
        var dest = { r1: rg.r1, c1: rg.c1, r2: r, c2: rg.c2 };
        App.change('fill', function () { App.fillRange(rg, dest); });
        App.select(dest.r1, dest.c1, dest.r2, dest.c2, { active: App.sel.active, scroll: false });
    };

    App.fillDirection = function (dir) {
        var rg = App.selRange();
        if (dir === 'down' && rg.r2 > rg.r1) App.change('fill', function () { App.fillRange({ r1: rg.r1, c1: rg.c1, r2: rg.r1, c2: rg.c2 }, rg, true); });
        if (dir === 'right' && rg.c2 > rg.c1) App.change('fill', function () { App.fillRange({ r1: rg.r1, c1: rg.c1, r2: rg.r2, c2: rg.c1 }, rg, true); });
    };

    // ========================================================== clipboard
    function selectionTSV(rg) {
        var sh = sheet();
        var b = sh.bounds();
        var r2 = Math.min(rg.r2, Math.max(b.r2, rg.r1)), c2 = Math.min(rg.c2, Math.max(b.c2, rg.c1));
        var lines = [], html = '<table>';
        for (var r = rg.r1; r <= r2; r++) {
            if (sh.rows.filtered[r]) continue;
            var row = [];
            html += '<tr>';
            for (var c = rg.c1; c <= c2; c++) {
                var d = App.wb.display(sh, r, c);
                var t = d.text;
                row.push(/[\t\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t);
                var s = App.wb.styleAt(sh, r, c);
                var css = [];
                if (s.b) css.push('font-weight:bold');
                if (s.i) css.push('font-style:italic');
                if (s.fc) css.push('color:' + s.fc);
                if (s.bg) css.push('background:' + s.bg);
                if (d.align && d.align !== 'left') css.push('text-align:' + d.align);
                html += '<td' + (css.length ? ' style="' + css.join(';') + '"' : '') + '>' + SO.esc(t) + '</td>';
            }
            html += '</tr>';
            lines.push(row.join('\t'));
        }
        return { text: lines.join('\n'), html: html + '</table>' };
    }

    App.copySelection = function (cut, e) {
        if (App.sel.ranges.length > 1) { SO.toast('x_multi_copy', { type: 'warn' }); return false; }
        var rg = App.selRange();
        var sh = sheet();
        var b = sh.styledBounds();
        var eff = { r1: rg.r1, c1: rg.c1, r2: Math.min(rg.r2, Math.max(b.r2, rg.r1)), c2: Math.min(rg.c2, Math.max(b.c2, rg.c1)) };
        App.clipboard = { block: App.wb.copyBlock(sh, eff.r1, eff.c1, eff.r2, eff.c2), range: eff, sheetId: sh.id, cut: !!cut, marquee: true };
        var data = selectionTSV(eff);
        App.clipboard.text = data.text;
        if (e && e.clipboardData) {
            e.clipboardData.setData('text/plain', data.text);
            e.clipboardData.setData('text/html', data.html);
            e.preventDefault();
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(data.text).catch(function () {});
        }
        startMarch();
        App.requestRender();
        return true;
    };

    var marchTimer = null;
    function startMarch() {
        clearInterval(marchTimer);
        marchTimer = setInterval(function () {
            if (!App.clipboard || !App.clipboard.marquee) { clearInterval(marchTimer); App.requestRender(); return; }
            App.marchOffset = ((App.marchOffset || 0) + 1) % 16;
            App.requestRender();
        }, 90);
    }

    /** Menempel dari papan klip internal. mode: all|values|formulas|formats */
    App.pasteInternal = function (mode) {
        var cb = App.clipboard;
        if (!cb) return false;
        var sh = sheet();
        var rg = App.selRange();
        var block = cb.block;
        var fitsMultiple = (rg.r2 - rg.r1 + 1) % block.h === 0 && (rg.c2 - rg.c1 + 1) % block.w === 0 && (rg.r2 - rg.r1 + 1 > block.h || rg.c2 - rg.c1 + 1 > block.w);
        App.change('paste', function () {
            if (cb.cut) {
                var srcSheet = App.wb.sheetById(cb.sheetId);
                App.wb.recordAll();
                var dr = rg.r1 - cb.range.r1, dc = rg.c1 - cb.range.c1;
                if (srcSheet) for (var r = cb.range.r1; r <= cb.range.r2; r++) for (var c = cb.range.c1; c <= cb.range.c2; c++) App.wb.setCell(srcSheet, r, c, null);
                App.wb.pasteBlock(sh, rg.r1, rg.c1, block, 'all', { cut: true });
                // Rumus lain yang merujuk sel yang dipindahkan ikut diperbarui.
                if (srcSheet) App.wb.sheets.forEach(function (s2) {
                    s2.cells.forEach(function (cell) {
                        if (cell.f === undefined) return;
                        var nf = F.rewrite(cell.f, function (tk) {
                            var tsName = tk.sheet || s2.name;
                            if (tsName.toLowerCase() !== srcSheet.name.toLowerCase()) return null;
                            var r1 = tk.t === 'ref' ? tk.r : tk.r1, c1 = tk.t === 'ref' ? tk.c : tk.c1, r2 = tk.t === 'ref' ? tk.r : tk.r2, c2 = tk.t === 'ref' ? tk.c : tk.c2;
                            if (r1 < cb.range.r1 || r2 > cb.range.r2 || c1 < cb.range.c1 || c2 > cb.range.c2) return null;
                            var pre = (tk.sheet || srcSheet !== sh) ? F.quoteSheet(sh.name) + '!' : '';
                            if (tk.t === 'ref') return pre + F.addr(r1 + dr, c1 + dc, tk.absR, tk.absC);
                            return pre + F.addr(r1 + dr, c1 + dc, tk.absR1, tk.absC1) + ':' + F.addr(r2 + dr, c2 + dc, tk.absR2, tk.absC2);
                        });
                        if (nf !== cell.f) { cell.f = nf; delete cell.ast; }
                    });
                });
            } else {
                App.wb.pasteBlock(sh, rg.r1, rg.c1, block, mode || 'all', fitsMultiple ? { fillH: rg.r2 - rg.r1 + 1, fillW: rg.c2 - rg.c1 + 1 } : null);
            }
        });
        var h = fitsMultiple ? rg.r2 - rg.r1 + 1 : block.h, w = fitsMultiple ? rg.c2 - rg.c1 + 1 : block.w;
        App.select(rg.r1, rg.c1, rg.r1 + h - 1, rg.c1 + w - 1, { active: { r: rg.r1, c: rg.c1 }, scroll: false });
        if (cb.cut) App.clipboard = null;
        return true;
    };

    function parseHtmlTable(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var table = doc.querySelector('table');
        if (!table) return null;
        var rows = [];
        Array.prototype.forEach.call(table.rows, function (tr) {
            var row = [];
            Array.prototype.forEach.call(tr.cells, function (td) {
                var st = td.getAttribute('style') || '';
                var style = {};
                var fw = /font-weight:\s*(bold|[6-9]00)/i.test(st) || td.querySelector('b,strong');
                if (fw) style.b = true;
                if (/font-style:\s*italic/i.test(st) || td.querySelector('i,em')) style.i = true;
                var col = /(?:^|;)\s*color:\s*([^;]+)/i.exec(st);
                if (col && SO.toHex(col[1]) && SO.toHex(col[1]) !== '#000000') style.fc = SO.toHex(col[1]);
                var bg = /background(?:-color)?:\s*([^;]+)/i.exec(st);
                if (bg && SO.toHex(bg[1]) && SO.toHex(bg[1]) !== '#FFFFFF') style.bg = SO.toHex(bg[1]);
                var text = td.innerText !== undefined ? td.textContent.replace(/ /g, ' ') : '';
                row.push({ text: text.replace(/\r?\n$/, ''), style: style, colspan: td.colSpan || 1 });
                for (var k = 1; k < (td.colSpan || 1); k++) row.push({ text: '', style: {} });
            });
            rows.push(row);
        });
        return rows;
    }

    function parseTSV(text) {
        var rows = [], row = [], cur = '', q = false;
        for (var i = 0; i < text.length; i++) {
            var ch = text[i];
            if (q) {
                if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
                else cur += ch;
            } else if (ch === '"' && cur === '') q = true;
            else if (ch === '\t') { row.push(cur); cur = ''; }
            else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
            else cur += ch;
        }
        if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
        return rows;
    }

    App.pasteExternal = function (text, html) {
        var sh = sheet();
        var rg = App.selRange();
        var grid = html ? parseHtmlTable(html) : null;
        if (!grid) grid = parseTSV(text || '').map(function (r) { return r.map(function (t) { return { text: t, style: {} }; }); });
        if (!grid.length) return;
        if (grid.length * (grid[0] || []).length > 500000) { SO.toast('x_paste_too_big', { type: 'error' }); return; }
        App.change('paste', function () {
            grid.forEach(function (row, i) {
                row.forEach(function (cellData, j) {
                    var r = rg.r1 + i, c = rg.c1 + j;
                    if (r >= F.MAX_ROWS || c >= F.MAX_COLS) return;
                    App.wb.setInput(sh, r, c, cellData.text);
                    if (Object.keys(cellData.style).length) App.wb.setStyle(sh, r, c, r, c, cellData.style);
                });
            });
        });
        var h = grid.length, w = Math.max.apply(null, grid.map(function (r) { return r.length; }));
        App.select(rg.r1, rg.c1, rg.r1 + h - 1, rg.c1 + Math.max(1, w) - 1, { active: { r: rg.r1, c: rg.c1 }, scroll: false });
    };

    editor.addEventListener('copy', function (e) { if (!App.editing) App.copySelection(false, e); });
    editor.addEventListener('cut', function (e) {
        if (App.editing) return;
        if (sheet().protected) { e.preventDefault(); SO.toast('x_sheet_protected', { type: 'warn' }); return; }
        App.copySelection(true, e);
    });
    editor.addEventListener('paste', function (e) {
        if (App.editing) return;
        e.preventDefault();
        if (sheet().protected) { SO.toast('x_sheet_protected', { type: 'warn' }); return; }
        var cd = e.clipboardData;
        var files = Array.prototype.slice.call((cd && cd.files) || []).filter(function (f) { return /^image\//.test(f.type); });
        var text = cd ? cd.getData('text/plain') : '';
        var html = cd ? cd.getData('text/html') : '';
        if (files.length && !text) { if (App.cmd.insertImageFile) App.cmd.insertImageFile(files[0]); return; }
        // Isi papan klip masih sama dengan yang kita salin → pakai versi internal (rumus & format).
        if (App.clipboard && (text === App.clipboard.text || (!text && !html))) { App.pasteInternal('all'); return; }
        App.clipboard = null;
        App.pasteExternal(text, /<table/i.test(html) ? html : null);
    });

    App.shortcuts = {};
    App.bindKey = function (combo, fn) { combo.split(' / ').forEach(function (c) { App.shortcuts[c] = fn; }); };

    document.addEventListener('keydown', function (e) {
        // Pintasan global saat fokus bukan di grid (mis. setelah klik ribbon).
        if (SO.isDialogOpen() || (App.backstage && App.backstage.isOpen())) return;
        var t = e.target;
        if (t === editor || t === formula || t === el.namebox) return;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
        var combo = SO.onKeyCombo(e);
        if (App.shortcuts[combo] && /^Mod\+|^F\d/.test(combo)) { if (App.shortcuts[combo](e) !== false) e.preventDefault(); return; }
        if (!SO.$('.so-menu') && (e.key.length === 1 || /^(Arrow|Enter|Tab|Delete|Backspace|F2|Page|Home|End)/.test(e.key)) && !e.altKey) {
            App.focusGrid();
            if (e.key.length !== 1 || SO.mod(e)) { onNavKey(e); }
        }
    });
})(window);
