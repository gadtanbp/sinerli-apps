/**
 * Sinerli Hitara — status aplikasi: buku kerja aktif, seleksi, riwayat, tab sheet,
 * kotak nama, status bar, zoom, dan serialisasi.
 * Gambar kanvas: sineex-render.js · interaksi: sineex-input.js.
 */
(function (global) {
    'use strict';

    var F = global.SXF, M = global.SXM;
    var $ = SO.$;

    var App = global.SineEX = {
        F: F, M: M,
        wb: null,
        sel: { ranges: [{ r1: 0, c1: 0, r2: 0, c2: 0 }], active: { r: 0, c: 0 }, anchor: { r: 0, c: 0 } },
        editing: null,
        clipboard: null,
        cmd: {},
        assets: new SO.Assets(),
        el: {
            grid: $('#sxGrid'), canvas: $('#sxCanvas'), scroll: $('#sxScroll'), size: $('#sxScrollSize'),
            layer: $('#sxLayer'), objects: $('#sxObjects'), editor: $('#sxEditor'), formula: $('#sxFormula'),
            namebox: $('#sxNameBox'), tabs: $('#sxTabs'), ac: $('#sxAc'), hint: $('#sxHint'), notePop: $('#sxNotePop')
        }
    };

    App.sheet = function () { return App.wb.activeSheet(); };

    App.history = new SO.History({
        limit: 300,
        onChange: function () {
            if (App.shell) App.shell.setHistory(App.history.canUndo(), App.history.canRedo());
            if (App.ribbon) { App.ribbon.setDisabled('undo', !App.history.canUndo()); App.ribbon.setDisabled('redo', !App.history.canRedo()); }
        }
    });

    // ========================================================== seleksi
    function clampR(r) { return SO.clamp(r, 0, F.MAX_ROWS - 1); }
    function clampC(c) { return SO.clamp(c, 0, F.MAX_COLS - 1); }

    /** Memperluas rentang agar sel gabungan tidak terpotong. */
    App.expandMerges = function (rg) {
        var sh = App.sheet();
        var out = { r1: Math.min(rg.r1, rg.r2), c1: Math.min(rg.c1, rg.c2), r2: Math.max(rg.r1, rg.r2), c2: Math.max(rg.c1, rg.c2) };
        if (!sh.merges.length) return out;
        var changed = true, guard = 0;
        while (changed && guard++ < 20) {
            changed = false;
            sh.merges.forEach(function (m) {
                if (m.r2 < out.r1 || m.r1 > out.r2 || m.c2 < out.c1 || m.c1 > out.c2) return;
                if (m.r1 < out.r1) { out.r1 = m.r1; changed = true; }
                if (m.c1 < out.c1) { out.c1 = m.c1; changed = true; }
                if (m.r2 > out.r2) { out.r2 = m.r2; changed = true; }
                if (m.c2 > out.c2) { out.c2 = m.c2; changed = true; }
            });
        }
        return out;
    };

    App.selRange = function () { return App.sel.ranges[App.sel.ranges.length - 1]; };

    App.select = function (r1, c1, r2, c2, opts) {
        opts = opts || {};
        if (r2 === undefined) { r2 = r1; c2 = c1; }
        var rg = App.expandMerges({ r1: clampR(r1), c1: clampC(c1), r2: clampR(r2), c2: clampC(c2) });
        var active = opts.active || { r: clampR(r1), c: clampC(c1) };
        var m = App.sheet().mergeAt(active.r, active.c);
        if (m) active = { r: m.r1, c: m.c1 };
        if (opts.add) App.sel.ranges.push(rg);
        else App.sel.ranges = [rg];
        App.sel.active = active;
        App.sel.anchor = opts.anchor || { r: clampR(r1), c: clampC(c1) };
        App.onSelectionChanged(opts);
    };

    /** Memperluas rentang terakhir dari jangkar ke (r, c). */
    App.extendTo = function (r, c, opts) {
        var a = App.sel.anchor;
        var rg = App.expandMerges({ r1: a.r, c1: a.c, r2: clampR(r), c2: clampC(c) });
        App.sel.ranges[App.sel.ranges.length - 1] = rg;
        App.onSelectionChanged(Object.assign({ focusCell: { r: clampR(r), c: clampC(c) } }, opts || {}));
    };

    App.onSelectionChanged = function (opts) {
        opts = opts || {};
        if (opts.scroll !== false) App.scrollIntoView(opts.focusCell || App.sel.active);
        App.updateNameBox();
        if (!App.editing) App.updateFormulaBar();
        App.requestRender();
        App.updateStatusSoon();
        if (App.cmd.updateRibbon) App.cmd.updateRibbonSoon();
        if (App.cmd.onSelection) App.cmd.onSelection();
    };

    App.eachSelected = function (fn) {
        App.sel.ranges.forEach(function (rg) {
            for (var r = rg.r1; r <= rg.r2; r++) for (var c = rg.c1; c <= rg.c2; c++) fn(r, c, rg);
        });
    };

    App.addrText = function (rg) {
        if (rg.r1 === 0 && rg.r2 >= F.MAX_ROWS - 1) return F.colName(rg.c1) + ':' + F.colName(rg.c2);
        if (rg.c1 === 0 && rg.c2 >= F.MAX_COLS - 1) return (rg.r1 + 1) + ':' + (rg.r2 + 1);
        return F.rangeAddr(rg.r1, rg.c1, rg.r2, rg.c2);
    };

    App.updateNameBox = function () {
        if (document.activeElement === App.el.namebox) return;
        var rg = App.selRange();
        var sh = App.sheet();
        var m = sh.mergeAt(rg.r1, rg.c1);
        var single = m ? (m.r1 === rg.r1 && m.c1 === rg.c1 && m.r2 === rg.r2 && m.c2 === rg.c2) : (rg.r1 === rg.r2 && rg.c1 === rg.c2);
        var text = single ? F.addr(App.sel.active.r, App.sel.active.c) : App.addrText(rg);
        Object.keys(App.wb.names).forEach(function (n) {
            var p = F.parseRange(String(App.wb.names[n]).replace(/[$=]/g, ''));
            if (p && (!p.sheet || p.sheet.toLowerCase() === sh.name.toLowerCase()) && p.r1 === rg.r1 && p.c1 === rg.c1 && p.r2 === rg.r2 && p.c2 === rg.c2) text = n;
        });
        App.el.namebox.value = text;
    };

    App.updateFormulaBar = function () {
        var a = App.sel.active;
        var sh = App.sheet();
        var owner = sh.spillOwner.get(M.key(a.r, a.c));
        var txt = App.wb.editText(sh, a.r, a.c);
        if (!txt && owner !== undefined) {
            var p = M.unkey(owner);
            var oc = sh.cell(p.r, p.c);
            txt = oc && oc.f ? '=' + oc.f : '';
            App.el.formula.classList.add('is-ghost');
        } else App.el.formula.classList.remove('is-ghost');
        App.el.formula.value = txt;
        App.el.formula.readOnly = !!sh.protected;
    };

    // ============================================================ gulir
    App.headerW = function () {
        var sh = App.sheet();
        var z = sh.zoom;
        if (!sh.showHeaders) return 0;
        var digits = String(Math.min(F.MAX_ROWS, sh.rows.count)).length;
        return Math.max(34, Math.round((10 + digits * 8) * Math.max(0.8, Math.min(z, 1.4))));
    };
    App.headerH = function () { var sh = App.sheet(); return sh.showHeaders ? Math.round(22 * Math.max(0.85, Math.min(sh.zoom, 1.4))) : 0; };

    App.scrollIntoView = function (cell) {
        var sh = App.sheet();
        var z = sh.zoom;
        var sc = App.el.scroll;
        var hw = App.headerW(), hh = App.headerH();
        var fw = sh.cols.pos(sh.freeze.c) * z, fh = sh.rows.pos(sh.freeze.r) * z;
        var viewW = sc.clientWidth - hw - fw, viewH = sc.clientHeight - hh - fh;
        if (cell.c >= sh.freeze.c) {
            var x1 = sh.cols.pos(cell.c) * z - fw, x2 = x1 + sh.cols.size(cell.c) * z;
            if (x1 < sc.scrollLeft) sc.scrollLeft = x1;
            else if (x2 > sc.scrollLeft + viewW) sc.scrollLeft = Math.min(x1, x2 - viewW);
        }
        if (cell.r >= sh.freeze.r) {
            var y1 = sh.rows.pos(cell.r) * z - fh, y2 = y1 + sh.rows.size(cell.r) * z;
            if (y1 < sc.scrollTop) sc.scrollTop = y1;
            else if (y2 > sc.scrollTop + viewH) sc.scrollTop = Math.min(y1, y2 - viewH);
        }
        // Tambah baris/kolom virtual saat mendekati ujung.
        App.ensureCapacity(cell.r + 60, cell.c + 12);
    };

    App.ensureCapacity = function (rows, cols) {
        var sh = App.sheet();
        var grew = false;
        if (rows > sh.rows.count && sh.rows.count < F.MAX_ROWS) { sh.rows.count = Math.min(F.MAX_ROWS, Math.max(rows, sh.rows.count + 500)); sh.rows.invalidate(); grew = true; }
        if (cols > sh.cols.count && sh.cols.count < F.MAX_COLS) { sh.cols.count = Math.min(F.MAX_COLS, Math.max(cols, sh.cols.count + 10)); sh.cols.invalidate(); grew = true; }
        if (grew) App.updateScrollSize();
    };

    App.updateScrollSize = function () {
        var sh = App.sheet();
        var z = sh.zoom;
        App.el.size.style.width = Math.ceil(App.headerW() + Math.min(sh.cols.total() * z, 8e6)) + 'px';
        App.el.size.style.height = Math.ceil(App.headerH() + Math.min(sh.rows.total() * z, 1.5e7)) + 'px';
    };

    // =========================================================== render
    var renderQueued = false;
    App.requestRender = function () {
        if (renderQueued) return;
        renderQueued = true;
        requestAnimationFrame(function () {
            renderQueued = false;
            if (App.draw) App.draw();
            if (App.positionEditor) App.positionEditor();
            if (App.cmd.layoutObjects) App.cmd.layoutObjects();
            if (App.cmd.layoutCellButtons) App.cmd.layoutCellButtons();
        });
    };

    // ========================================================== riwayat
    App.change = function (label, fn) {
        if (App.sheet().protected && !/^(sheet|protect|view)/.test(label)) { SO.toast('x_sheet_protected', { type: 'warn' }); return false; }
        App._selBefore = App.captureSel();
        App.wb.change(label, fn);
        return true;
    };

    App.captureSel = function () {
        return { sheet: App.wb.active, sel: SO.deepClone(App.sel) };
    };
    App.applySel = function (snap) {
        if (!snap) return;
        if (snap.sheet < App.wb.sheets.length) App.wb.active = snap.sheet;
        App.sel = SO.deepClone(snap.sel);
        App.renderTabs();
        App.updateScrollSize();
        App.onSelectionChanged({ scroll: true });
    };

    function hookWorkbook(wb) {
        wb.on(function (type, data) {
            if (type === 'commit' && data) {
                var before = App._selBefore, after = App.captureSel();
                App.history.push({
                    label: data.label,
                    undo: function () { data.undo(); App.applySel(before); App.afterData(true); },
                    redo: function () { data.redo(); App.applySel(after); App.afterData(true); }
                });
            }
            if (type === 'change') App.afterData(data && data.history);
        });
    }

    App.afterData = function (fromHistory) {
        if (App.wb.circular && !App._circWarned) { App._circWarned = true; SO.toast('x_circular_warning', { type: 'warn', ms: 5000 }); }
        if (!App.wb.circular) App._circWarned = false;
        App.updateScrollSize();
        App.requestRender();
        if (!App.editing) App.updateFormulaBar();
        App.updateStatusSoon();
        if (App.cmd.refreshCharts) App.cmd.refreshChartsSoon();
        if (App.session) App.session.markDirty();
        if (App.cmd.updateRibbon) App.cmd.updateRibbonSoon();
        if (fromHistory) App.renderTabs();
    };

    App.undo = function () { if (App.editing) App.cancelEdit(); App.history.undo(); };
    App.redo = function () { if (App.editing) App.cancelEdit(); App.history.redo(); };

    // =========================================================== sheet
    App.activateSheet = function (idx) {
        if (App.editing) App.commitEdit();
        if (idx < 0 || idx >= App.wb.sheets.length) return;
        var prev = App.sheet();
        prev._sel = SO.deepClone(App.sel);
        prev._scroll = { x: App.el.scroll.scrollLeft, y: App.el.scroll.scrollTop };
        App.wb.active = idx;
        var sh = App.sheet();
        App.sel = sh._sel ? SO.deepClone(sh._sel) : { ranges: [{ r1: 0, c1: 0, r2: 0, c2: 0 }], active: { r: 0, c: 0 }, anchor: { r: 0, c: 0 } };
        App.updateScrollSize();
        App.el.scroll.scrollLeft = sh._scroll ? sh._scroll.x : 0;
        App.el.scroll.scrollTop = sh._scroll ? sh._scroll.y : 0;
        App.renderTabs();
        App.syncZoomUi();
        App.onSelectionChanged({ scroll: false });
        if (App.cmd.renderObjects) App.cmd.renderObjects();
        if (App.cmd.onSheetChange) App.cmd.onSheetChange();
    };

    App.renderTabs = function () {
        var box = App.el.tabs;
        box.innerHTML = '';
        App.wb.sheets.forEach(function (sh, i) {
            var t = SO.el('button', { type: 'button', class: 'sx-tab' + (i === App.wb.active ? ' is-active' : ''), draggable: 'true', dataset: { idx: i }, title: sh.name });
            t.appendChild(document.createTextNode(sh.name));
            if (sh.protected) t.appendChild(SO.el('i', { class: 'fas fa-lock' }));
            if (sh.tabColor) t.appendChild(SO.el('span', { class: 'sx-tab-color', style: { background: sh.tabColor } }));
            t.addEventListener('click', function () { if (i !== App.wb.active) App.activateSheet(i); App.focusGrid(); });
            t.addEventListener('dblclick', function () { App.cmd.renameSheetInline(i); });
            t.addEventListener('contextmenu', function (e) { App.cmd.sheetMenu(e, i); });
            t.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/sx-sheet', String(i)); e.dataTransfer.effectAllowed = 'move'; });
            t.addEventListener('dragover', function (e) { if (Array.prototype.indexOf.call(e.dataTransfer.types, 'text/sx-sheet') !== -1) { e.preventDefault(); t.classList.add('is-drop-before'); } });
            t.addEventListener('dragleave', function () { t.classList.remove('is-drop-before'); });
            t.addEventListener('drop', function (e) {
                e.preventDefault();
                t.classList.remove('is-drop-before');
                var from = +e.dataTransfer.getData('text/sx-sheet');
                if (isNaN(from) || from === i) return;
                App.change('sheet-move', function () { App.wb.moveSheet(from, from < i ? i - 1 : i); });
                App.renderTabs();
            });
            box.appendChild(t);
        });
        var active = box.querySelector('.is-active');
        if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    // ============================================================= zoom
    App.setZoom = function (z) {
        var sh = App.sheet();
        z = SO.clamp(Math.round(z * 100) / 100, 0.25, 4);
        if (z === sh.zoom) return;
        var sc = App.el.scroll;
        var rx = sc.scrollLeft / sh.zoom, ry = sc.scrollTop / sh.zoom;
        sh.zoom = z;
        App.updateScrollSize();
        sc.scrollLeft = rx * z;
        sc.scrollTop = ry * z;
        App.syncZoomUi();
        App.requestRender();
        if (App.session) App.session.markDirty();
    };
    App.syncZoomUi = function () {
        var z = App.sheet().zoom;
        $('#sxZoomRange').value = Math.round(z * 100);
        $('#sxZoomVal').textContent = Math.round(z * 100) + '%';
    };

    // ========================================================== status
    var statusTimer = null;
    App.updateStatusSoon = function () {
        clearTimeout(statusTimer);
        statusTimer = setTimeout(App.updateStatus, 80);
    };
    App.updateStatus = function () {
        var mode = App.editing ? (App.editing.point ? 'x_mode_point' : App.editing.mode === 'edit' ? 'x_mode_edit' : 'x_mode_enter') : 'x_mode_ready';
        $('#sxStMode').textContent = SO.t(mode);
        var sh = App.sheet();
        var sum = 0, count = 0, nums = 0, min = Infinity, max = -Infinity;
        var cells = 0;
        var b = sh.bounds();
        App.sel.ranges.forEach(function (rg) {
            var r2 = Math.min(rg.r2, b.r2), c2 = Math.min(rg.c2, b.c2);
            for (var r = rg.r1; r <= r2 && cells < 300000; r++) {
                if (sh.rows.isHidden(r)) continue;
                for (var c = rg.c1; c <= c2 && cells < 300000; c++) {
                    cells++;
                    var v = App.wb.value(sh, r, c);
                    if (v === null || v === undefined || v === '') continue;
                    count++;
                    if (typeof v === 'number') { nums++; sum += v; if (v < min) min = v; if (v > max) max = v; }
                }
            }
        });
        var el = $('#sxStAgg');
        var single = App.sel.ranges.length === 1 && App.selRange().r1 === App.selRange().r2 && App.selRange().c1 === App.selRange().c2;
        if (single || count < 2) { el.textContent = ''; return; }
        var nf = (App.wb.styleAt(sh, App.sel.active.r, App.sel.active.c).nf) || 'General';
        var fmt = function (v) { return F.format(F.roundTo(v, 10), nf === '@' ? 'General' : nf).text; };
        var parts = [];
        if (nums) parts.push(SO.t('x_st_average') + ': ' + fmt(sum / nums));
        parts.push(SO.t('x_st_count') + ': ' + SO.fmtNum(count));
        if (nums) { parts.push(SO.t('x_st_sum') + ': ' + fmt(sum)); }
        if (nums > 1 && App.statusExtra) { parts.push('Min: ' + fmt(min)); parts.push('Max: ' + fmt(max)); }
        el.textContent = parts.join('    ');
    };

    // ======================================================= kotak nama
    App.gotoRef = function (text) {
        text = String(text || '').trim();
        if (!text) return false;
        var name = App.wb.names[text.toUpperCase()];
        var target = name ? String(name).replace(/^=/, '') : text;
        var p = F.parseRange(target.replace(/\$/g, ''));
        if (!p) return false;
        if (p.sheet) {
            var sh = App.wb.sheetByName(p.sheet);
            if (!sh) return false;
            var idx = App.wb.sheets.indexOf(sh);
            if (idx !== App.wb.active) App.activateSheet(idx);
        }
        App.ensureCapacity(p.r2 + 1 > F.MAX_ROWS - 1 ? 0 : p.r2 + 50, p.c2 + 1 > F.MAX_COLS - 1 ? 0 : p.c2 + 5);
        App.select(p.r1, p.c1, p.r2, p.c2);
        return true;
    };

    // ====================================================== serialisasi
    App.serialize = function () {
        var data = App.wb.toJSON();
        var ids = [];
        App.wb.sheets.forEach(function (sh) { sh.images.forEach(function (im) { if (im.asset && ids.indexOf(im.asset) === -1) ids.push(im.asset); }); });
        return App.assets.exportMap(ids).then(function (map) {
            data.assets = map;
            data.sel = { sheet: App.wb.active, sel: App.sel };
            return data;
        });
    };

    App.loadDocument = function (content, name) {
        if (App.editing) App.cancelEdit();
        if (content && content.app !== 'sineex' && !content.sheets) content = null;
        App.assets.importMap((content && content.assets) || {});
        var wb = content ? M.Workbook.fromJSON(content) : null;
        if (!wb) { wb = new M.Workbook(); wb.addSheet(SO.t('x_default_sheet') + '1'); wb.recalc(); }
        App.wb = wb;
        hookWorkbook(wb);
        App.history.clear();
        App.clipboard = null;
        if (content && content.sel && content.sel.sel) {
            App.wb.active = Math.min(content.sel.sheet || 0, wb.sheets.length - 1);
            App.sel = content.sel.sel;
        } else {
            App.sel = { ranges: [{ r1: 0, c1: 0, r2: 0, c2: 0 }], active: { r: 0, c: 0 }, anchor: { r: 0, c: 0 } };
        }
        if (App.shell) App.shell.setName(name || SO.t('c_untitled'));
        App.el.scroll.scrollLeft = 0;
        App.el.scroll.scrollTop = 0;
        App.updateScrollSize();
        App.renderTabs();
        App.syncZoomUi();
        App.onSelectionChanged({ scroll: true });
        if (App.cmd.renderObjects) App.cmd.renderObjects();
        App.updateStatus();
    };

    App.focusGrid = function () {
        if (App.editing) return;
        if (App.el.editor && document.activeElement !== App.el.editor) App.el.editor.focus({ preventScroll: true });
    };

    F.setLocale(SO.lang());
    SO.onLang(function () {
        F.setLocale(SO.lang());
        if (App.wb) { App.wb.calcId++; App.wb.recalc(); App.requestRender(); App.updateFormulaBar(); App.updateStatus(); }
    });
})(window);
