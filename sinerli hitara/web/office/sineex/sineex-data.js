/**
 * Sinerli Hitara — alat data: urut, filter, format bersyarat, validasi data, nama rentang,
 * cari & ganti, hapus duplikat, teks ke kolom, ringkasan pivot, goal seek,
 * AutoSum, dan dialog Sisipkan Fungsi.
 */
(function (global) {
    'use strict';

    var App = global.SineEX, F = global.SXF, M = global.SXM;
    var C = App.cmd;

    function sheet() { return App.sheet(); }
    function rangesOverlap(a, b) { return !(a.r2 < b.r1 || a.r1 > b.r2 || a.c2 < b.c1 || a.c1 > b.c2); }
    function inRange(rg, r, c) { return r >= rg.r1 && r <= rg.r2 && c >= rg.c1 && c <= rg.c2; }
    function clampToData(rg) {
        var sh = sheet();
        var b = sh.bounds();
        return { r1: rg.r1, c1: rg.c1, r2: Math.min(rg.r2, Math.max(b.r2, rg.r1)), c2: Math.min(rg.c2, Math.max(b.c2, rg.c1)) };
    }
    function colOptions(rg, hasHeader) {
        var sh = sheet();
        var out = [];
        for (var c = rg.c1; c <= rg.c2; c++) {
            var head = hasHeader ? App.wb.display(sh, rg.r1, c).text : '';
            out.push({ value: c, text: SO.t('x_column') + ' ' + F.colName(c) + (head ? ' — ' + head : '') });
        }
        return out;
    }
    function detectHeader(rg) {
        var sh = sheet();
        if (rg.r2 <= rg.r1) return false;
        var textTop = 0, numBelow = 0, styledTop = 0;
        for (var c = rg.c1; c <= rg.c2; c++) {
            var v = App.wb.value(sh, rg.r1, c), v2 = App.wb.value(sh, rg.r1 + 1, c);
            if (typeof v === 'string') textTop++;
            if (typeof v2 === 'number') numBelow++;
            if (App.wb.styleAt(sh, rg.r1, c).b) styledTop++;
        }
        var w = rg.c2 - rg.c1 + 1;
        return textTop === w && (numBelow > 0 || styledTop > 0) || styledTop === w;
    }

    // ============================================================== urut
    C.sortQuick = function (desc) {
        var sh = sheet();
        var rg = C.currentRegion();
        if (!rg) return;
        var a = App.sel.active;
        var header = sh.filter && sh.filter.r1 === rg.r1 ? true : detectHeader(rg);
        var r1 = header ? rg.r1 + 1 : rg.r1;
        if (r1 > rg.r2) return;
        var col = SO.clamp(a.c, rg.c1, rg.c2);
        App.change('sort', function () { App.wb.sortRange(sh, r1, rg.c1, rg.r2, rg.c2, [{ c: col, desc: !!desc }]); });
        if (sh.filter) C.applyFilter();
    };

    C.sortDialog = function () {
        var sh = sheet();
        var rg = C.currentRegion();
        if (!rg) return;
        var header = detectHeader(rg);
        var levels = [{ c: SO.clamp(App.sel.active.c, rg.c1, rg.c2), desc: false }];
        SO.dialog({
            title: 'x_custom_sort', width: 520,
            body: function (body) {
                var hdr = SO.el('input', { type: 'checkbox' });
                hdr.checked = header;
                var list = SO.el('div');
                var info = SO.el('p', { style: { margin: '0 0 10px', color: 'var(--so-muted)', fontSize: '12.5px' } });
                function render() {
                    info.textContent = SO.t('x_sort_range', { range: F.rangeAddr(rg.r1, rg.c1, rg.r2, rg.c2) });
                    list.innerHTML = '';
                    levels.forEach(function (lv, i) {
                        var row = SO.el('div', { class: 'sx-sort-level' });
                        var cs = SO.el('select', { class: 'so-select' });
                        colOptions(rg, hdr.checked).forEach(function (o) { cs.appendChild(SO.el('option', { value: o.value, text: o.text })); });
                        cs.value = lv.c;
                        cs.addEventListener('change', function () { lv.c = +cs.value; });
                        var os = SO.el('select', { class: 'so-select', html: '<option value="asc">' + SO.esc(SO.t('x_order_asc')) + '</option><option value="desc">' + SO.esc(SO.t('x_order_desc')) + '</option>' });
                        os.value = lv.desc ? 'desc' : 'asc';
                        os.addEventListener('change', function () { lv.desc = os.value === 'desc'; });
                        var del = SO.el('button', { type: 'button', class: 'so-btn is-sm', html: '<i class="fas fa-trash"></i>', disabled: levels.length === 1 });
                        del.addEventListener('click', function () { levels.splice(i, 1); render(); });
                        row.appendChild(SO.el('div', { class: 'so-field' }, SO.el('label', { text: SO.t(i === 0 ? 'x_sort_by' : 'x_then_by') }), cs));
                        row.appendChild(SO.el('div', { class: 'so-field' }, SO.el('label', { text: SO.t('x_order') }), os));
                        row.appendChild(del);
                        list.appendChild(row);
                    });
                }
                hdr.addEventListener('change', render);
                var add = SO.el('button', { type: 'button', class: 'so-btn is-sm', html: '<i class="fas fa-plus"></i>' + SO.esc(SO.t('x_add_level')) });
                add.addEventListener('click', function () { if (levels.length < 6) { levels.push({ c: rg.c1, desc: false }); render(); } });
                body.appendChild(info);
                body.appendChild(SO.el('label', { class: 'so-field is-inline', style: { marginBottom: '10px' } }, hdr, SO.el('span', { text: SO.t('x_has_header') })));
                body.appendChild(list);
                body.appendChild(add);
                body._hdr = hdr;
                render();
                C._sortBody = body;
            },
            buttons: [{ label: 'c_cancel', value: null }, { label: 'c_ok', primary: true, value: 'ok' }]
        }).then(function (v) {
            if (v !== 'ok') return;
            var r1 = C._sortBody._hdr.checked ? rg.r1 + 1 : rg.r1;
            if (r1 > rg.r2) return;
            App.change('sort', function () { App.wb.sortRange(sh, r1, rg.c1, rg.r2, rg.c2, levels); });
            if (sh.filter) C.applyFilter();
        });
    };

    // ============================================================ filter
    C.toggleFilter = function () {
        var sh = sheet();
        if (sh.filter) {
            App.change('filter-off', function () {
                App.wb.recordMeta(sh);
                sh.filter = null;
                sh.rows.filtered = {};
                sh.rows.invalidate();
            });
            App.updateScrollSize();
            return;
        }
        var rg = C.currentRegion();
        if (!rg || (rg.r1 === rg.r2 && App.wb.value(sh, rg.r1, rg.c1) === null)) { SO.toast('x_filter_need_data', { type: 'warn' }); return; }
        App.change('filter-on', function () {
            App.wb.recordMeta(sh);
            sh.filter = { r1: rg.r1, c1: rg.c1, r2: rg.r2, c2: rg.c2, crit: {} };
        });
    };

    function cellKeyText(sh, r, c) {
        var t = App.wb.display(sh, r, c).text;
        return t;
    }

    function passesCond(v, text, cond) {
        if (!cond) return true;
        var n = typeof v === 'number' ? v : null;
        var a = cond.v1, b = cond.v2;
        var low = String(text).toLowerCase(), q = String(a == null ? '' : a).toLowerCase();
        switch (cond.op) {
            case 'eq': return n !== null && F.numberFromString(a) !== null ? n === F.numberFromString(a) : low === q;
            case 'ne': return n !== null && F.numberFromString(a) !== null ? n !== F.numberFromString(a) : low !== q;
            case 'gt': return n !== null && n > +a;
            case 'ge': return n !== null && n >= +a;
            case 'lt': return n !== null && n < +a;
            case 'le': return n !== null && n <= +a;
            case 'between': return n !== null && n >= Math.min(+a, +b) && n <= Math.max(+a, +b);
            case 'contains': return low.indexOf(q) !== -1;
            case 'notcontains': return low.indexOf(q) === -1;
            case 'begins': return low.indexOf(q) === 0;
            case 'ends': return low.slice(-q.length) === q;
            case 'top': case 'bottom': return cond._set ? cond._set.has(v) : true;
            case 'above': return n !== null && n > cond._avg;
            case 'below': return n !== null && n < cond._avg;
            case 'blank': return text === '';
            case 'nonblank': return text !== '';
        }
        return true;
    }

    C.applyFilter = function () {
        var sh = sheet();
        var f = sh.filter;
        if (!f) return;
        // Wilayah filter tumbuh mengikuti data baru di bawahnya.
        var b = sh.bounds();
        var r2 = f.r2;
        while (r2 < b.r2) {
            var any = false;
            for (var c0 = f.c1; c0 <= f.c2; c0++) if (App.wb.value(sh, r2 + 1, c0) !== null) { any = true; break; }
            if (!any) break;
            r2++;
        }
        f.r2 = r2;
        Object.keys(f.crit).forEach(function (k) {
            var cr = f.crit[k];
            if (!cr.cond) return;
            var c = +k;
            var nums = [];
            for (var r = f.r1 + 1; r <= f.r2; r++) { var v = App.wb.value(sh, r, c); if (typeof v === 'number') nums.push(v); }
            if (cr.cond.op === 'top' || cr.cond.op === 'bottom') {
                nums.sort(function (x, y) { return cr.cond.op === 'top' ? y - x : x - y; });
                cr.cond._set = new Set(nums.slice(0, Math.max(1, +cr.cond.v1 || 10)));
            }
            if (cr.cond.op === 'above' || cr.cond.op === 'below') cr.cond._avg = nums.length ? nums.reduce(function (s, x) { return s + x; }, 0) / nums.length : 0;
        });
        sh.rows.filtered = {};
        for (var r = f.r1 + 1; r <= f.r2; r++) {
            var ok = Object.keys(f.crit).every(function (k) {
                var cr = f.crit[k];
                var c = +k;
                var text = cellKeyText(sh, r, c);
                if (cr.values && cr.values.indexOf(text) === -1) return false;
                return passesCond(App.wb.value(sh, r, c), text, cr.cond);
            });
            if (!ok) sh.rows.filtered[r] = true;
        }
        sh.rows.invalidate();
        App.updateScrollSize();
        App.requestRender();
        App.updateStatus();
    };

    C.clearFilters = function () {
        var sh = sheet();
        if (!sh.filter) return;
        App.change('filter-clear', function () { App.wb.recordMeta(sh); sh.filter.crit = {}; });
        C.applyFilter();
    };

    C.filterPopup = function (anchor, c) {
        var sh = sheet();
        var f = sh.filter;
        var cr = SO.deepClone(f.crit[c] || {});
        var counts = {};
        var order = [];
        for (var r = f.r1 + 1; r <= Math.min(f.r2, f.r1 + 20000); r++) {
            var t = cellKeyText(sh, r, c);
            if (counts[t] === undefined) { counts[t] = 0; order.push(t); }
            counts[t]++;
        }
        order.sort(function (a, b) {
            if (a === '') return 1;
            if (b === '') return -1;
            var na = F.numberFromString(a.replace(/[.,](?=\d{3})/g, '')), nb = F.numberFromString(b.replace(/[.,](?=\d{3})/g, ''));
            if (na !== null && nb !== null) return na - nb;
            return a.localeCompare(b, SO.locale(), { numeric: true });
        });
        SO.menu(anchor, [
            { label: 'x_sort_asc', icon: 'fa-arrow-down-a-z', onClick: function () { App.change('sort', function () { App.wb.sortRange(sh, f.r1 + 1, f.c1, f.r2, f.c2, [{ c: c }]); }); C.applyFilter(); } },
            { label: 'x_sort_desc', icon: 'fa-arrow-down-z-a', onClick: function () { App.change('sort', function () { App.wb.sortRange(sh, f.r1 + 1, f.c1, f.r2, f.c2, [{ c: c, desc: true }]); }); C.applyFilter(); } },
            { sep: true },
            { label: 'x_clear_filter_col', icon: 'fa-filter-circle-xmark', disabled: !f.crit[c], onClick: function () { App.change('filter', function () { App.wb.recordMeta(sh); delete f.crit[c]; }); C.applyFilter(); } },
            { label: 'x_condition_filter', icon: 'fa-sliders', submenu: [
                ['eq', 'x_op_eq'], ['ne', 'x_op_ne'], ['gt', 'x_op_gt'], ['ge', 'x_op_ge'], ['lt', 'x_op_lt'], ['le', 'x_op_le'], ['between', 'x_op_between'],
                ['contains', 'x_op_contains'], ['notcontains', 'x_op_notcontains'], ['begins', 'x_op_begins'], ['ends', 'x_op_ends'],
                ['top', 'x_op_top10'], ['above', 'x_op_above_avg'], ['below', 'x_op_below_avg']
            ].map(function (x) {
                return { label: x[1], onClick: function () { conditionDialog(c, x[0]); } };
            }) },
            { sep: true },
            {
                custom: function (box, close) {
                    box.className = 'sx-filter-pop';
                    var search = SO.el('input', { class: 'so-input', type: 'search', placeholder: SO.t('x_search') });
                    var values = SO.el('div', { class: 'sx-filter-values' });
                    var allowed = cr.values ? new Set(cr.values) : null;
                    var checks = [];
                    var allCb = SO.el('input', { type: 'checkbox' });
                    values.appendChild(SO.el('label', {}, allCb, SO.el('span', { text: SO.t('x_select_all') })));
                    order.slice(0, 2000).forEach(function (t) {
                        var cb = SO.el('input', { type: 'checkbox', value: t });
                        cb.checked = !allowed || allowed.has(t);
                        var lab = SO.el('label', { title: t }, cb, SO.el('span', { text: (t === '' ? SO.t('x_blanks') : t) + '  (' + counts[t] + ')' }));
                        checks.push({ cb: cb, lab: lab, t: t });
                        values.appendChild(lab);
                    });
                    var syncAll = function () { allCb.checked = checks.every(function (x) { return x.cb.checked || x.lab.hidden; }); };
                    syncAll();
                    allCb.addEventListener('change', function () { checks.forEach(function (x) { if (!x.lab.hidden) x.cb.checked = allCb.checked; }); });
                    values.addEventListener('change', function (e) { if (e.target !== allCb) syncAll(); });
                    search.addEventListener('input', function () {
                        var q = search.value.toLowerCase();
                        checks.forEach(function (x) { x.lab.hidden = q && x.t.toLowerCase().indexOf(q) === -1; });
                        syncAll();
                    });
                    search.addEventListener('keydown', function (e) { e.stopPropagation(); });
                    var actions = SO.el('div', { class: 'sx-filter-actions' });
                    var ok = SO.el('button', { type: 'button', class: 'so-btn is-sm is-primary', text: SO.t('c_ok') });
                    var cancel = SO.el('button', { type: 'button', class: 'so-btn is-sm', text: SO.t('c_cancel') });
                    cancel.addEventListener('click', close);
                    ok.addEventListener('click', function () {
                        var q = search.value;
                        var sel = checks.filter(function (x) { return x.cb.checked && !x.lab.hidden; }).map(function (x) { return x.t; });
                        var all = !q && sel.length === checks.length;
                        close();
                        App.change('filter', function () {
                            App.wb.recordMeta(sh);
                            if (all) delete f.crit[c];
                            else f.crit[c] = { values: sel };
                        });
                        C.applyFilter();
                    });
                    actions.appendChild(cancel);
                    actions.appendChild(ok);
                    box.appendChild(search);
                    box.appendChild(values);
                    box.appendChild(actions);
                    setTimeout(function () { search.focus(); }, 30);
                }
            }
        ], { minWidth: 260 });
    };

    function conditionDialog(c, op) {
        var sh = sheet();
        var needTwo = op === 'between';
        var noValue = op === 'above' || op === 'below';
        SO.form({
            title: 'x_condition_filter',
            intro: SO.t('x_column') + ' ' + F.colName(c),
            fields: noValue ? [{ type: 'html', html: '<p>' + SO.esc(SO.t(op === 'above' ? 'x_op_above_avg' : 'x_op_below_avg')) + '</p>' }] : [
                { name: 'v1', label: op === 'top' ? 'x_items_count' : 'x_value', value: op === 'top' ? 10 : '' },
                needTwo ? { name: 'v2', label: 'x_and_value', value: '' } : null
            ].filter(Boolean)
        }).then(function (v) {
            if (!v) return;
            App.change('filter', function () {
                App.wb.recordMeta(sh);
                sh.filter.crit[c] = { cond: { op: op, v1: v.v1, v2: v.v2 } };
            });
            C.applyFilter();
        });
    }

    /** Tombol panah filter & dropdown validasi di atas kanvas. */
    C.layoutCellButtons = function () {
        var layer = App.el.layer;
        var sh = sheet();
        var keep = [];
        var place = function (id, r, c, icon, active, onClick) {
            var rect = App.cellRect(r, c);
            var g = App.geom();
            if (rect.x + rect.w < g.hw || rect.y + rect.h < g.hh || rect.x > g.W || rect.y > g.H) return;
            if (c >= sh.freeze.c && rect.x + rect.w - 18 < g.hw + g.fw) return;
            if (r >= sh.freeze.r && rect.y < g.hh + g.fh - 2) return;
            var btn = layer.querySelector('[data-btn="' + id + '"]');
            if (!btn) {
                btn = SO.el('button', { type: 'button', class: 'sx-cellbtn', dataset: { btn: id } });
                btn.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
                layer.appendChild(btn);
            }
            btn.onclick = function (e) { e.stopPropagation(); onClick(btn); };
            btn.innerHTML = '<i class="fas ' + icon + '"></i>';
            btn.classList.toggle('is-active', !!active);
            btn.style.left = (rect.x + rect.w - 19) + 'px';
            btn.style.top = (rect.y + rect.h - 19) + 'px';
            keep.push(id);
        };
        if (sh.filter) {
            for (var c = sh.filter.c1; c <= sh.filter.c2; c++) {
                (function (cc) {
                    var crit = sh.filter.crit[cc];
                    place('f' + cc, sh.filter.r1, cc, crit ? 'fa-filter' : 'fa-caret-down', !!crit, function (btn) { C.filterPopup(btn, cc); });
                })(c);
            }
        }
        var a = App.sel.active;
        var rule = C.dvRuleAt(sh, a.r, a.c);
        if (rule && rule.type === 'list' && rule.dropdown !== false && !App.editing) {
            place('dv', a.r, a.c, 'fa-caret-down', false, function (btn) { C.pickFromList(btn); });
            var dvb = layer.querySelector('[data-btn="dv"]');
            if (dvb) { var rc = App.cellRect(a.r, a.c); dvb.style.left = (rc.x + rc.w + 1) + 'px'; }
        }
        SO.$$('.sx-cellbtn', layer).forEach(function (b) { if (keep.indexOf(b.dataset.btn) === -1) b.remove(); });
    };

    // ================================================== format bersyarat
    var cfCache = { calc: -1, map: new Map() };

    function ruleStats(sh, rule) {
        if (rule._calc === App.wb.calcId && rule._sheetId === sh.id) return rule._stats;
        var nums = [], counts = {};
        rule.ranges.forEach(function (rg0) {
            var rg = clampToData(rg0);
            for (var r = rg.r1; r <= rg.r2; r++) for (var c = rg.c1; c <= rg.c2; c++) {
                var v = App.wb.value(sh, r, c);
                if (typeof v === 'number') nums.push(v);
                if (v !== null && v !== '') { var k = typeof v === 'string' ? 's:' + v.toLowerCase() : 'v:' + String(v); counts[k] = (counts[k] || 0) + 1; }
            }
        });
        var sorted = nums.slice().sort(function (a, b) { return a - b; });
        var st = {
            min: sorted.length ? sorted[0] : 0, max: sorted.length ? sorted[sorted.length - 1] : 0,
            avg: nums.length ? nums.reduce(function (s, x) { return s + x; }, 0) / nums.length : 0,
            sorted: sorted, counts: counts
        };
        if (rule.type === 'scale3' || rule.type === 'icons') st.mid = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
        rule._stats = st;
        rule._calc = App.wb.calcId;
        rule._sheetId = sh.id;
        return st;
    }

    function mix(c1, c2, t) {
        var a = SO.hexToRgb(c1), b = SO.hexToRgb(c2);
        return SO.rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    }

    function ruleMatch(sh, rule, r, c, v) {
        var st;
        switch (rule.type) {
            case 'cell':
                if (typeof v !== 'number' && rule.op !== 'eq' && rule.op !== 'ne') return false;
                var a = F.numberFromString(String(rule.v1)), b = F.numberFromString(String(rule.v2));
                if (a === null && (rule.op === 'eq' || rule.op === 'ne')) return (String(v === null ? '' : v).toLowerCase() === String(rule.v1).toLowerCase()) === (rule.op === 'eq');
                switch (rule.op) {
                    case 'gt': return v > a; case 'ge': return v >= a; case 'lt': return v < a; case 'le': return v <= a;
                    case 'eq': return v === a; case 'ne': return v !== a;
                    case 'between': return v >= Math.min(a, b) && v <= Math.max(a, b);
                    case 'notbetween': return v < Math.min(a, b) || v > Math.max(a, b);
                }
                return false;
            case 'text':
                var t = App.wb.display(sh, r, c).text.toLowerCase(), q = String(rule.v1 || '').toLowerCase();
                if (rule.op === 'contains') return t.indexOf(q) !== -1;
                if (rule.op === 'notcontains') return t.indexOf(q) === -1;
                if (rule.op === 'begins') return t.indexOf(q) === 0;
                if (rule.op === 'ends') return t.slice(-q.length) === q;
                return false;
            case 'blank': return v === null || v === '';
            case 'error': return v instanceof F.XErr;
            case 'dup': case 'unique':
                if (v === null || v === '') return false;
                st = ruleStats(sh, rule);
                var k = typeof v === 'string' ? 's:' + v.toLowerCase() : 'v:' + String(v);
                return rule.type === 'dup' ? st.counts[k] > 1 : st.counts[k] === 1;
            case 'top':
                if (typeof v !== 'number') return false;
                st = ruleStats(sh, rule);
                var n = rule.percent ? Math.max(1, Math.floor(st.sorted.length * (+rule.v1 || 10) / 100)) : (+rule.v1 || 10);
                var arr = st.sorted;
                return rule.bottom ? v <= arr[Math.min(arr.length - 1, n - 1)] : v >= arr[Math.max(0, arr.length - n)];
            case 'avg':
                if (typeof v !== 'number') return false;
                st = ruleStats(sh, rule);
                return rule.op === 'below' ? v < st.avg : v > st.avg;
            case 'formula':
                var rg = rule.ranges[0];
                var f = F.shiftFormula(String(rule.formula || '').replace(/^=/, ''), r - rg.r1, c - rg.c1);
                try {
                    var res = F.scalar(F.evaluate(F.parse(f), App.wb.ctxFor(sh, r, c)), App.wb.ctxFor(sh, r, c));
                    return res === true || (typeof res === 'number' && res !== 0);
                } catch (e) { return false; }
        }
        return false;
    }

    C.cfStyle = function (sh, r, c) {
        if (!sh.cf.length) return null;
        if (cfCache.calc !== App.wb.calcId || cfCache.sheet !== sh.id || cfCache.size !== sh.cf.length) { cfCache = { calc: App.wb.calcId, sheet: sh.id, size: sh.cf.length, map: new Map() }; }
        var key = r * 16384 + c;
        if (cfCache.map.has(key)) return cfCache.map.get(key);
        var out = null;
        var v;
        for (var i = 0; i < sh.cf.length; i++) {
            var rule = sh.cf[i];
            if (!rule.ranges.some(function (rg) { return inRange(rg, r, c); })) continue;
            if (v === undefined) v = App.wb.value(sh, r, c);
            if (rule.type === 'bar') {
                if (typeof v !== 'number' || (out && out.bar)) continue;
                var st = ruleStats(sh, rule);
                var lo = Math.min(0, st.min), span = st.max - lo || 1;
                out = out || {};
                out.bar = { pct: SO.clamp((v - lo) / span, 0, 1), color: rule.color || '#638EC6' };
                continue;
            }
            if (rule.type === 'scale2' || rule.type === 'scale3') {
                if (typeof v !== 'number' || (out && out.bg)) continue;
                var s2 = ruleStats(sh, rule);
                var cols = rule.colors;
                var bg;
                if (rule.type === 'scale2') bg = mix(cols[0], cols[1], s2.max === s2.min ? 0.5 : (v - s2.min) / (s2.max - s2.min));
                else if (v <= s2.mid) bg = mix(cols[0], cols[1], s2.mid === s2.min ? 1 : (v - s2.min) / (s2.mid - s2.min));
                else bg = mix(cols[1], cols[2], s2.max === s2.mid ? 0 : (v - s2.mid) / (s2.max - s2.mid));
                out = out || {};
                out.bg = bg;
                continue;
            }
            if (rule.type === 'icons') {
                if (typeof v !== 'number' || (out && out.icon)) continue;
                var s3 = ruleStats(sh, rule);
                var third = (s3.max - s3.min) / 3;
                var level = v >= s3.max - third ? 2 : v <= s3.min + third ? 0 : 1;
                var sets = { arrows: [['▼', '#C00000'], ['►', '#BF8F00'], ['▲', '#00B050']], traffic: [['●', '#C00000'], ['●', '#FFC000'], ['●', '#00B050']], stars: [['☆', '#A6A6A6'], ['★', '#F4D27A'], ['★', '#FFB000']], flags: [['⚑', '#C00000'], ['⚑', '#FFC000'], ['⚑', '#00B050']] };
                var ic = (sets[rule.icons] || sets.arrows)[level];
                out = out || {};
                out.icon = { ch: ic[0], color: ic[1] };
                continue;
            }
            if (ruleMatch(sh, rule, r, c, v)) {
                out = out || {};
                var s = rule.style || {};
                if (s.bg && !out.bg) out.bg = s.bg;
                if (s.fc && !out.fc) out.fc = s.fc;
                if (s.b) out.b = true;
                if (s.i) out.i = true;
                if (rule.stop) break;
            }
        }
        cfCache.map.set(key, out);
        return out;
    };

    var CF_PRESETS = {
        red: { bg: '#FFC7CE', fc: '#9C0006', label: 'x_cf_red' },
        yellow: { bg: '#FFEB9C', fc: '#9C5700', label: 'x_cf_yellow' },
        green: { bg: '#C6EFCE', fc: '#006100', label: 'x_cf_green' },
        redText: { fc: '#C00000', label: 'x_cf_red_text' },
        redFill: { bg: '#FF9999', label: 'x_cf_red_fill' },
        bold: { b: true, fc: '#1F3864', label: 'x_cf_bold' }
    };

    function addRule(rule) {
        var sh = sheet();
        rule.id = SO.uid('cf');
        rule.ranges = App.sel.ranges.map(function (rg) { return clampToData(rg); });
        App.change('cf', function () { App.wb.recordMeta(sh); sh.cf.push(rule); });
    }

    C.cfRuleDialog = function (type, op) {
        var labels = { gt: 'x_cf_gt', lt: 'x_cf_lt', between: 'x_cf_between', eq: 'x_cf_eq', contains: 'x_cf_text_contains', dup: 'x_cf_duplicates', unique: 'x_cf_unique', top: 'x_cf_top10', bottom: 'x_cf_bottom10', toppct: 'x_cf_top10pct', above: 'x_cf_above_avg', below: 'x_cf_below_avg', formula: 'x_cf_formula', blank: 'x_cf_blank', error: 'x_cf_error' };
        var presetOpts = Object.keys(CF_PRESETS).map(function (k) { return { value: k, label: CF_PRESETS[k].label }; }).concat([{ value: 'custom', label: 'x_cf_custom_format' }]);
        var fields = [];
        var noVal = op === 'dup' || op === 'unique' || op === 'above' || op === 'below' || op === 'blank' || op === 'error';
        if (op === 'formula') fields.push({ name: 'v1', label: 'x_cf_formula_label', value: '=', spellcheck: false, hint: 'x_cf_formula_hint' });
        else if (!noVal) fields.push({ name: 'v1', label: op === 'top' || op === 'bottom' || op === 'toppct' ? 'x_items_count' : 'x_value', value: op === 'top' || op === 'bottom' || op === 'toppct' ? 10 : '' });
        if (op === 'between') fields.push({ name: 'v2', label: 'x_and_value', value: '' });
        fields.push({ type: 'row', fields: [
            { name: 'preset', label: 'x_cf_format_with', type: 'select', value: op === 'unique' || op === 'above' ? 'green' : 'red', options: presetOpts },
            { name: 'color', label: 'x_fill_color', type: 'color', value: '#FFD966' }
        ] });
        SO.form({ title: labels[op] || 'x_cond_format', fields: fields }).then(function (v) {
            if (!v) return;
            var style = v.preset === 'custom' ? { bg: v.color.toUpperCase() } : SO.deepClone(CF_PRESETS[v.preset]);
            delete style.label;
            var rule = { style: style };
            if (op === 'gt' || op === 'lt' || op === 'eq' || op === 'between') Object.assign(rule, { type: 'cell', op: op, v1: v.v1, v2: v.v2 });
            else if (op === 'contains') Object.assign(rule, { type: 'text', op: 'contains', v1: v.v1 });
            else if (op === 'dup' || op === 'unique') rule.type = op;
            else if (op === 'top' || op === 'bottom' || op === 'toppct') Object.assign(rule, { type: 'top', v1: v.v1, bottom: op === 'bottom', percent: op === 'toppct' });
            else if (op === 'above' || op === 'below') Object.assign(rule, { type: 'avg', op: op });
            else if (op === 'formula') Object.assign(rule, { type: 'formula', formula: v.v1 });
            else if (op === 'blank' || op === 'error') rule.type = op;
            if (op === 'formula') { try { F.parse(String(v.v1).replace(/^=/, '')); } catch (e) { SO.toast('x_formula_error', { type: 'error' }); return; } }
            addRule(rule);
        });
    };

    C.cfMenu = function () {
        var rule = function (op) { return function () { C.cfRuleDialog(null, op); }; };
        return [
            { label: 'x_cf_highlight', icon: 'fa-highlighter', submenu: [
                { label: 'x_cf_gt', onClick: rule('gt') }, { label: 'x_cf_lt', onClick: rule('lt') }, { label: 'x_cf_between', onClick: rule('between') },
                { label: 'x_cf_eq', onClick: rule('eq') }, { label: 'x_cf_text_contains', onClick: rule('contains') }, { label: 'x_cf_duplicates', onClick: rule('dup') },
                { label: 'x_cf_unique', onClick: rule('unique') }, { label: 'x_cf_blank', onClick: rule('blank') }, { label: 'x_cf_error', onClick: rule('error') }
            ] },
            { label: 'x_cf_topbottom', icon: 'fa-ranking-star', submenu: [
                { label: 'x_cf_top10', onClick: rule('top') }, { label: 'x_cf_top10pct', onClick: rule('toppct') }, { label: 'x_cf_bottom10', onClick: rule('bottom') },
                { label: 'x_cf_above_avg', onClick: rule('above') }, { label: 'x_cf_below_avg', onClick: rule('below') }
            ] },
            { label: 'x_cf_databars', icon: 'fa-chart-bar', submenu: [['#638EC6', 'x_color_blue'], ['#63BE7B', 'x_color_green'], ['#FF555A', 'x_color_red'], ['#FFB628', 'x_color_orange'], ['#8EC3FF', 'x_color_lightblue'], ['#D6007B', 'x_color_purple']].map(function (x) {
                return { label: x[1], labelHtml: '<span style="display:inline-block;width:40px;height:10px;background:linear-gradient(90deg,' + x[0] + ',' + SO.tint(x[0], 0.7) + ');margin-right:8px;border-radius:2px"></span>' + SO.esc(SO.t(x[1])), onClick: function () { addRule({ type: 'bar', color: x[0] }); } };
            }) },
            { label: 'x_cf_colorscales', icon: 'fa-palette', submenu: [
                [['#F8696B', '#FFEB84', '#63BE7B'], 'x_cs_ryg'], [['#63BE7B', '#FFEB84', '#F8696B'], 'x_cs_gyr'], [['#FFFFFF', '#63BE7B'], 'x_cs_wg'], [['#FFFFFF', '#5A8AC6'], 'x_cs_wb'], [['#F8696B', '#FFFFFF', '#5A8AC6'], 'x_cs_rwb']
            ].map(function (x) {
                return { label: x[1], labelHtml: '<span style="display:inline-block;width:40px;height:10px;background:linear-gradient(90deg,' + x[0].join(',') + ');margin-right:8px;border-radius:2px"></span>' + SO.esc(SO.t(x[1])), onClick: function () { addRule({ type: x[0].length === 3 ? 'scale3' : 'scale2', colors: x[0] }); } };
            }) },
            { label: 'x_cf_iconsets', icon: 'fa-icons', submenu: [
                ['arrows', [['▲', '#00B050'], ['►', '#BF8F00'], ['▼', '#C00000']]], ['traffic', [['●', '#00B050'], ['●', '#FFC000'], ['●', '#C00000']]],
                ['stars', [['★', '#FFB000'], ['★', '#F4D27A'], ['☆', '#A6A6A6']]], ['flags', [['⚑', '#00B050'], ['⚑', '#FFC000'], ['⚑', '#C00000']]]
            ].map(function (x) {
                var html = x[1].map(function (ic) { return '<span style="color:' + ic[1] + ';font-size:15px;display:inline-block;width:22px;text-align:center">' + ic[0] + '</span>'; }).join('');
                return { text: x[0], labelHtml: html, onClick: function () { addRule({ type: 'icons', icons: x[0] }); } };
            }) },
            { sep: true },
            { label: 'x_cf_new_formula', icon: 'fa-square-root-variable', onClick: rule('formula') },
            { label: 'x_cf_clear_selection', icon: 'fa-eraser', onClick: function () { C.cfClear(false); } },
            { label: 'x_cf_clear_sheet', icon: 'fa-trash', onClick: function () { C.cfClear(true); } },
            { label: 'x_cf_manage', icon: 'fa-list-check', onClick: C.cfManage }
        ];
    };

    C.cfClear = function (all) {
        var sh = sheet();
        App.change('cf-clear', function () {
            App.wb.recordMeta(sh);
            if (all) sh.cf = [];
            else sh.cf = sh.cf.filter(function (rule) {
                rule.ranges = rule.ranges.filter(function (rg) { return !App.sel.ranges.some(function (s) { return rangesOverlap(rg, s); }); });
                return rule.ranges.length;
            });
        });
    };

    function ruleText(rule) {
        var rng = rule.ranges.map(function (rg) { return F.rangeAddr(rg.r1, rg.c1, rg.r2, rg.c2); }).join(', ');
        var t;
        switch (rule.type) {
            case 'cell': t = SO.t('x_op_' + rule.op) + ' ' + rule.v1 + (rule.op === 'between' ? ' – ' + rule.v2 : ''); break;
            case 'text': t = SO.t('x_op_contains') + ' "' + rule.v1 + '"'; break;
            case 'top': t = SO.t(rule.bottom ? 'x_cf_bottom10' : rule.percent ? 'x_cf_top10pct' : 'x_cf_top10') + ' (' + rule.v1 + ')'; break;
            case 'avg': t = SO.t(rule.op === 'below' ? 'x_cf_below_avg' : 'x_cf_above_avg'); break;
            case 'formula': t = rule.formula; break;
            case 'bar': t = SO.t('x_cf_databars'); break;
            case 'scale2': case 'scale3': t = SO.t('x_cf_colorscales'); break;
            case 'icons': t = SO.t('x_cf_iconsets'); break;
            default: t = SO.t('x_cf_' + ({ dup: 'duplicates', unique: 'unique', blank: 'blank', error: 'error' }[rule.type] || rule.type));
        }
        return { text: t, range: rng };
    }

    C.cfManage = function () {
        var sh = sheet();
        SO.dialog({
            title: 'x_cf_manage', width: 520,
            body: function (body) {
                function render() {
                    body.innerHTML = '';
                    if (!sh.cf.length) { body.appendChild(SO.el('div', { class: 'so-empty-note', text: SO.t('x_cf_none') })); return; }
                    var list = SO.el('div', { class: 'sx-rule-list' });
                    sh.cf.forEach(function (rule, i) {
                        var info = ruleText(rule);
                        var st = rule.style || {};
                        var sw = SO.el('span', { class: 'sw', text: 'Aa', style: { background: st.bg || (rule.colors ? 'linear-gradient(90deg,' + rule.colors.join(',') + ')' : rule.color || '#fff'), color: st.fc || '#000', fontWeight: st.b ? '700' : '400' } });
                        var row = SO.el('div', { class: 'sx-rule' }, sw, SO.el('div', { class: 'rt', html: SO.esc(info.text) + '<small>' + SO.esc(info.range) + '</small>' }));
                        var up = SO.el('button', { type: 'button', class: 'so-btn is-sm', html: '<i class="fas fa-arrow-up"></i>', disabled: i === 0 });
                        var del = SO.el('button', { type: 'button', class: 'so-btn is-sm', html: '<i class="fas fa-trash"></i>' });
                        up.addEventListener('click', function () { App.change('cf', function () { App.wb.recordMeta(sh); var x = sh.cf.splice(i, 1)[0]; sh.cf.splice(i - 1, 0, x); }); render(); });
                        del.addEventListener('click', function () { App.change('cf', function () { App.wb.recordMeta(sh); sh.cf.splice(i, 1); }); render(); });
                        row.appendChild(up);
                        row.appendChild(del);
                        list.appendChild(row);
                    });
                    body.appendChild(list);
                }
                render();
            },
            buttons: [{ label: 'c_close', primary: true }]
        });
    };

    // ==================================================== validasi data
    C.dvRuleAt = function (sh, r, c) {
        for (var i = sh.dv.length - 1; i >= 0; i--) {
            if (sh.dv[i].ranges.some(function (rg) { return inRange(rg, r, c); })) return sh.dv[i];
        }
        return null;
    };

    function listItems(sh, rule) {
        var src = String(rule.list || '');
        if (src.charAt(0) === '=') {
            var p = F.parseRange(src.slice(1).replace(/\$/g, ''));
            if (p) {
                var s2 = p.sheet ? App.wb.sheetByName(p.sheet) : sh;
                if (!s2) return [];
                var ref = new F.RangeRef(s2.id, p.r1, p.c1, p.r2, p.c2);
                var out = [];
                App.wb.rangeValues(ref).forEach(function (row) { row.forEach(function (v) { if (v !== null && v !== '') out.push(F.format(v, null).text); }); });
                return out;
            }
            var named = App.wb.resolveName(src.slice(1), sh);
            if (named instanceof F.RangeRef) {
                var o2 = [];
                App.wb.rangeValues(named).forEach(function (row) { row.forEach(function (v) { if (v !== null) o2.push(String(v)); }); });
                return o2;
            }
        }
        return src.split(/[,;]/).map(function (x) { return x.trim(); }).filter(Boolean);
    }
    C.listItems = listItems;

    C.validateInput = function (sh, r, c, text) {
        var rule = C.dvRuleAt(sh, r, c);
        if (!rule || text.charAt(0) === '=') return null;
        var msg = { ok: false, style: rule.errorStyle || 'stop', title: rule.errorTitle || 'x_dv_title', message: rule.errorMsg || 'x_dv_invalid' };
        if (text === '') return rule.allowBlank === false ? msg : null;
        var p = F.parseInput(text);
        var v = p.v;
        var cmp = function (x) {
            var a = F.numberFromString(String(rule.v1)), b = F.numberFromString(String(rule.v2));
            if (rule.type === 'date') { a = F.parseDateText(rule.v1); b = F.parseDateText(rule.v2); }
            switch (rule.op || 'between') {
                case 'between': return x >= Math.min(a, b) && x <= Math.max(a, b);
                case 'notbetween': return x < Math.min(a, b) || x > Math.max(a, b);
                case 'eq': return x === a; case 'ne': return x !== a;
                case 'gt': return x > a; case 'ge': return x >= a; case 'lt': return x < a; case 'le': return x <= a;
            }
            return true;
        };
        switch (rule.type) {
            case 'list':
                var items = listItems(sh, rule).map(function (x) { return x.toLowerCase(); });
                return items.indexOf(String(text).trim().toLowerCase()) !== -1 ? null : msg;
            case 'whole': return typeof v === 'number' && Number.isInteger(v) && cmp(v) ? null : msg;
            case 'decimal': return typeof v === 'number' && cmp(v) ? null : msg;
            case 'date': return typeof v === 'number' && p.fmt && F.isDateFormat(p.fmt) && cmp(Math.floor(v)) ? null : msg;
            case 'textlen': return cmp(String(text).length) ? null : msg;
            case 'custom':
                try {
                    var cell = sh.cell(r, c);
                    var old = cell ? M.cloneCell(cell) : null;
                    var ctx = App.wb.ctxFor(sh, r, c);
                    var rg = rule.ranges[0];
                    var f = F.shiftFormula(String(rule.formula || '').replace(/^=/, ''), r - rg.r1, c - rg.c1);
                    sh.cells.set(M.key(r, c), { v: v });
                    App.wb.calcId++;
                    var res = F.scalar(F.evaluate(F.parse(f), ctx), ctx);
                    if (old) sh.cells.set(M.key(r, c), M.reviveCell(old)); else sh.cells.delete(M.key(r, c));
                    App.wb.recalc();
                    return res === true || (typeof res === 'number' && res !== 0) ? null : msg;
                } catch (e) { return msg; }
        }
        return null;
    };

    C.dvDialog = function () {
        var sh = sheet();
        var a = App.sel.active;
        var cur = C.dvRuleAt(sh, a.r, a.c) || {};
        SO.form({
            title: 'x_data_validation', width: 520,
            fields: [
                { type: 'row', fields: [
                    { name: 'type', label: 'x_dv_allow', type: 'select', value: cur.type || 'list', options: [
                        { value: 'any', label: 'x_dv_any' }, { value: 'list', label: 'x_dv_list' }, { value: 'whole', label: 'x_dv_whole' }, { value: 'decimal', label: 'x_dv_decimal' },
                        { value: 'date', label: 'x_dv_date' }, { value: 'textlen', label: 'x_dv_textlen' }, { value: 'custom', label: 'x_dv_custom' }
                    ] },
                    { name: 'op', label: 'x_dv_data', type: 'select', value: cur.op || 'between', options: [
                        { value: 'between', label: 'x_op_between' }, { value: 'notbetween', label: 'x_op_notbetween' }, { value: 'eq', label: 'x_op_eq' }, { value: 'ne', label: 'x_op_ne' },
                        { value: 'gt', label: 'x_op_gt' }, { value: 'ge', label: 'x_op_ge' }, { value: 'lt', label: 'x_op_lt' }, { value: 'le', label: 'x_op_le' }
                    ] }
                ] },
                { name: 'list', label: 'x_dv_source', value: cur.list || '', placeholder: 'x_dv_source_ph', spellcheck: false },
                { type: 'row', fields: [{ name: 'v1', label: 'x_dv_min', value: cur.v1 || '' }, { name: 'v2', label: 'x_dv_max', value: cur.v2 || '' }] },
                { name: 'formula', label: 'x_cf_formula_label', value: cur.formula || '=', spellcheck: false },
                { name: 'allowBlank', label: 'x_dv_ignore_blank', type: 'checkbox', value: cur.allowBlank !== false },
                { name: 'errorStyle', label: 'x_dv_error_style', type: 'select', value: cur.errorStyle || 'stop', options: [{ value: 'stop', label: 'x_dv_stop' }, { value: 'warning', label: 'x_dv_warning' }, { value: 'info', label: 'x_dv_info' }] },
                { name: 'errorMsg', label: 'x_dv_error_msg', value: cur.errorMsg || '' }
            ],
            onChange: function (v, dlg, inputs) {
                var t = v.type;
                inputs.list.closest('.so-field').hidden = t !== 'list';
                inputs.op.closest('.so-field').hidden = ['whole', 'decimal', 'date', 'textlen'].indexOf(t) === -1;
                inputs.v1.closest('.so-form-row').hidden = ['whole', 'decimal', 'date', 'textlen'].indexOf(t) === -1;
                inputs.v2.closest('.so-field').hidden = ['between', 'notbetween'].indexOf(v.op) === -1;
                inputs.formula.closest('.so-field').hidden = t !== 'custom';
            }
        }).then(function (v) {
            if (!v) return;
            App.change('dv', function () {
                App.wb.recordMeta(sh);
                sh.dv = sh.dv.filter(function (rule) {
                    rule.ranges = rule.ranges.filter(function (rg) { return !App.sel.ranges.some(function (s) { return rangesOverlap(rg, s); }); });
                    return rule.ranges.length;
                });
                if (v.type !== 'any') sh.dv.push({
                    id: SO.uid('dv'), ranges: App.sel.ranges.map(function (rg) { return { r1: rg.r1, c1: rg.c1, r2: Math.min(rg.r2, sh.rows.count - 1), c2: Math.min(rg.c2, sh.cols.count - 1) }; }),
                    type: v.type, op: v.op, v1: v.v1, v2: v.v2, list: v.list, formula: v.formula, allowBlank: v.allowBlank,
                    errorStyle: v.errorStyle, errorMsg: v.errorMsg
                });
            });
        });
    };

    C.pickFromList = function (anchor) {
        var sh = sheet();
        var a = App.sel.active;
        var rule = C.dvRuleAt(sh, a.r, a.c);
        var items;
        if (rule && rule.type === 'list') items = listItems(sh, rule);
        else {
            // Tanpa validasi: tawarkan nilai unik dari kolom yang sama (Alt+↓).
            var seen = {};
            items = [];
            var b = sh.bounds();
            for (var r = 0; r <= Math.min(b.r2, 5000); r++) {
                var v = App.wb.value(sh, r, a.c);
                if (typeof v === 'string' && v && !seen[v.toLowerCase()] && r !== a.r) { seen[v.toLowerCase()] = 1; items.push(v); }
            }
            items.sort(function (x, y) { return x.localeCompare(y, SO.locale()); });
        }
        if (!items.length) return;
        var rect = App.cellRect(a.r, a.c);
        var gr = App.el.grid.getBoundingClientRect();
        SO.menu(anchor && anchor.getBoundingClientRect ? anchor : { left: gr.left + rect.x, right: gr.left + rect.x + rect.w, top: gr.top + rect.y, bottom: gr.top + rect.y + rect.h }, items.slice(0, 500).map(function (t) {
            return { text: t, onClick: function () { App.change('edit', function () { App.wb.setInput(sh, a.r, a.c, t); }); App.focusGrid(); } };
        }), { minWidth: Math.max(160, rect.w), focus: true, className: 'so-menu-list' });
    };

    // ======================================================== nama rentang
    function refForRange(sh, rg) {
        return F.quoteSheet(sh.name) + '!' + F.addr(rg.r1, rg.c1, true, true) + (rg.r1 === rg.r2 && rg.c1 === rg.c2 ? '' : ':' + F.addr(Math.min(rg.r2, sh.rows.count - 1), Math.min(rg.c2, sh.cols.count - 1), true, true));
    }
    function validName(n) { return /^[A-Za-z_À-￿][\w.À-￿]*$/.test(n) && !/^[A-Za-z]{1,3}\d+$/.test(n) && !F.FN[n.toUpperCase()] && !/^(TRUE|FALSE|R|C)$/i.test(n); }

    C.defineName = function (name, rg) {
        if (!validName(name)) { SO.toast('x_invalid_name', { type: 'error' }); return; }
        App.change('name', function () { App.wb.recordAll(); App.wb.names[name.toUpperCase()] = refForRange(sheet(), rg); });
        SO.toast('x_name_defined', { type: 'success', vars: { name: name.toUpperCase() } });
    };

    C.nameDialog = function () {
        var sh = sheet();
        SO.form({
            title: 'x_define_name',
            fields: [{ name: 'name', label: 'x_name', value: '' }, { name: 'ref', label: 'x_refers_to', value: '=' + refForRange(sh, App.selRange()), spellcheck: false }],
            validate: function (v) { return validName(v.name.trim()) ? null : 'x_invalid_name'; }
        }).then(function (v) {
            if (!v) return;
            App.change('name', function () { App.wb.recordAll(); App.wb.names[v.name.trim().toUpperCase()] = v.ref.replace(/^=/, ''); });
        });
    };

    C.nameManager = function () {
        SO.dialog({
            title: 'x_name_manager', width: 520,
            body: function (body) {
                function render() {
                    body.innerHTML = '';
                    var names = Object.keys(App.wb.names).sort();
                    if (!names.length) { body.appendChild(SO.el('div', { class: 'so-empty-note', text: SO.t('x_no_names') })); return; }
                    var list = SO.el('div', { class: 'sx-rule-list' });
                    names.forEach(function (n) {
                        var row = SO.el('div', { class: 'sx-rule' }, SO.el('i', { class: 'fas fa-tag', style: { color: 'var(--so-accent)' } }), SO.el('div', { class: 'rt', html: '<b>' + SO.esc(n) + '</b><small>=' + SO.esc(App.wb.names[n]) + '</small>' }));
                        var go = SO.el('button', { type: 'button', class: 'so-btn is-sm', html: '<i class="fas fa-location-arrow"></i>' });
                        var del = SO.el('button', { type: 'button', class: 'so-btn is-sm', html: '<i class="fas fa-trash"></i>' });
                        go.addEventListener('click', function () { SO.$('.so-overlay .so-dialog-close').click(); App.gotoRef(n); });
                        del.addEventListener('click', function () { App.change('name', function () { App.wb.recordAll(); delete App.wb.names[n]; }); render(); });
                        row.appendChild(go);
                        row.appendChild(del);
                        list.appendChild(row);
                    });
                    body.appendChild(list);
                }
                render();
            },
            buttons: [{ label: 'x_define_name', value: 'new' }, { label: 'c_close', primary: true }]
        }).then(function (v) { if (v === 'new') C.nameDialog(); });
    };

    C.namesMenu = function (anchor) {
        var names = Object.keys(App.wb.names).sort();
        SO.menu(anchor, (names.length ? names.map(function (n) { return { text: n, icon: 'fa-tag', onClick: function () { App.gotoRef(n); } }; }) : [{ label: 'x_no_names', disabled: true }])
            .concat([{ sep: true }, { label: 'x_define_name', icon: 'fa-plus', onClick: C.nameDialog }, { label: 'x_name_manager', icon: 'fa-list', onClick: C.nameManager }]), { minWidth: 200 });
    };

    // ======================================================== cari & ganti
    C.findDialog = function (replace) {
        var state = { idx: -1, results: [] };
        SO.dialog({
            title: 'x_find_replace', width: 520,
            body: function (body, dlg) {
                body.innerHTML =
                    '<div class="so-form">' +
                    '<div class="so-field"><label>' + SO.esc(SO.t('x_find_what')) + '</label><input class="so-input" id="sxFindQ" type="text" autocomplete="off"></div>' +
                    '<div class="so-field"><label>' + SO.esc(SO.t('x_replace_with')) + '</label><input class="so-input" id="sxFindR" type="text" autocomplete="off"></div>' +
                    '<div class="so-form-row">' +
                    '<div class="so-field"><label>' + SO.esc(SO.t('x_within')) + '</label><select class="so-select" id="sxFindIn"><option value="sheet">' + SO.esc(SO.t('x_this_sheet')) + '</option><option value="book">' + SO.esc(SO.t('x_workbook')) + '</option></select></div>' +
                    '<div class="so-field"><label>' + SO.esc(SO.t('x_look_in')) + '</label><select class="so-select" id="sxFindLook"><option value="values">' + SO.esc(SO.t('x_values')) + '</option><option value="formulas">' + SO.esc(SO.t('x_formulas')) + '</option></select></div></div>' +
                    '<label class="so-field is-inline"><input type="checkbox" id="sxFindCase"><span>' + SO.esc(SO.t('x_match_case')) + '</span></label>' +
                    '<label class="so-field is-inline"><input type="checkbox" id="sxFindWhole"><span>' + SO.esc(SO.t('x_entire_cell')) + '</span></label>' +
                    '<div class="sd-find-count" id="sxFindCount" style="color:var(--so-muted);font-size:12px"></div>' +
                    '<div class="sx-rule-list" id="sxFindList" style="max-height:180px;overflow:auto"></div></div>';
                var q = dlg.$('#sxFindQ');
                var sel = App.wb.display(sheet(), App.sel.active.r, App.sel.active.c).text;
                q.value = C._lastFind || '';
                if (!q.value && sel && sel.length < 60) q.value = sel;
                function search() {
                    var needle = q.value;
                    var mc = dlg.$('#sxFindCase').checked, whole = dlg.$('#sxFindWhole').checked;
                    var look = dlg.$('#sxFindLook').value;
                    var sheets = dlg.$('#sxFindIn').value === 'book' ? App.wb.sheets : [sheet()];
                    state.results = [];
                    if (!needle) { render(); return; }
                    var n = mc ? needle : needle.toLowerCase();
                    sheets.forEach(function (sh) {
                        var keys = Array.from(sh.cells.keys()).sort(function (x, y) { return x - y; });
                        keys.forEach(function (k) {
                            var p = M.unkey(k);
                            var cell = sh.cells.get(k);
                            var text = look === 'formulas' ? App.wb.editText(sh, p.r, p.c) : App.wb.display(sh, p.r, p.c).text;
                            if (!text) return;
                            var t = mc ? text : text.toLowerCase();
                            if (whole ? t === n : t.indexOf(n) !== -1) state.results.push({ sheet: sh, r: p.r, c: p.c, text: text, formula: cell.f !== undefined });
                        });
                    });
                    state.idx = -1;
                    render();
                }
                function render() {
                    dlg.$('#sxFindCount').textContent = q.value ? SO.t('x_found_n', { n: state.results.length }) : '';
                    var list = dlg.$('#sxFindList');
                    list.innerHTML = '';
                    state.results.slice(0, 300).forEach(function (res, i) {
                        var row = SO.el('button', { type: 'button', class: 'sx-rule', style: { textAlign: 'left', background: i === state.idx ? 'var(--so-accent-soft)' : '#fff', cursor: 'pointer' } });
                        row.innerHTML = '<div class="rt"><b>' + SO.esc(res.sheet.name + '!' + F.addr(res.r, res.c)) + '</b><small>' + SO.esc(res.text.slice(0, 80)) + '</small></div>';
                        row.addEventListener('click', function () { goto(i); });
                        list.appendChild(row);
                    });
                }
                function goto(i) {
                    if (!state.results.length) return;
                    state.idx = (i + state.results.length) % state.results.length;
                    var res = state.results[state.idx];
                    var si = App.wb.sheets.indexOf(res.sheet);
                    if (si !== App.wb.active) App.activateSheet(si);
                    App.select(res.r, res.c);
                    render();
                }
                q.addEventListener('input', SO.debounce(search, 200));
                ['#sxFindCase', '#sxFindWhole', '#sxFindLook', '#sxFindIn'].forEach(function (s) { dlg.$(s).addEventListener('change', search); });
                dlg._next = function () { if (!state.results.length) search(); goto(state.idx + 1); };
                dlg._replaceAll = function () {
                    var needle = q.value, rep = dlg.$('#sxFindR').value;
                    if (!needle || !state.results.length) return;
                    var mc = dlg.$('#sxFindCase').checked, whole = dlg.$('#sxFindWhole').checked;
                    var re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), mc ? 'g' : 'gi');
                    var count = 0;
                    App.change('replace', function () {
                        state.results.forEach(function (res) {
                            if (res.sheet.protected) return;
                            var src = App.wb.editText(res.sheet, res.r, res.c);
                            var next = whole ? rep : src.replace(re, rep);
                            if (next !== src) { App.wb.setInput(res.sheet, res.r, res.c, next); count++; }
                        });
                    });
                    SO.toast('x_replaced_n', { type: 'success', vars: { n: count } });
                    search();
                };
                dlg._replaceOne = function () {
                    var res = state.results[state.idx];
                    if (!res) { dlg._next(); return; }
                    var needle = q.value, rep = dlg.$('#sxFindR').value;
                    var mc = dlg.$('#sxFindCase').checked, whole = dlg.$('#sxFindWhole').checked;
                    var src = App.wb.editText(res.sheet, res.r, res.c);
                    var re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), mc ? '' : 'i');
                    App.change('replace', function () { App.wb.setInput(res.sheet, res.r, res.c, whole ? rep : src.replace(re, rep)); });
                    var keep = state.idx;
                    search();
                    goto(keep);
                };
                q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); C._lastFind = q.value; dlg._next(); } });
                search();
                if (replace) setTimeout(function () { dlg.$('#sxFindR').focus(); }, 60);
            },
            enterSubmits: false,
            buttons: [
                { label: 'x_replace_all', onClick: function (dlg) { dlg._replaceAll(); return false; } },
                { label: 'x_replace', onClick: function (dlg) { dlg._replaceOne(); return false; } },
                { label: 'x_find_next', primary: true, onClick: function (dlg) { C._lastFind = dlg.$('#sxFindQ').value; dlg._next(); return false; } }
            ]
        });
    };

    // =================================================== alat data lain
    C.removeDuplicates = function () {
        var sh = sheet();
        var rg = C.currentRegion();
        if (!rg || rg.r2 <= rg.r1) { SO.toast('x_filter_need_data', { type: 'warn' }); return; }
        var header = detectHeader(rg);
        SO.dialog({
            title: 'x_remove_duplicates', width: 440,
            body: function (body) {
                var hdr = SO.el('input', { type: 'checkbox' }); hdr.checked = header;
                body.appendChild(SO.el('label', { class: 'so-field is-inline', style: { marginBottom: '10px' } }, hdr, SO.el('span', { text: SO.t('x_has_header') })));
                var box = SO.el('div', { class: 'sx-filter-values', style: { maxHeight: '220px' } });
                var cbs = [];
                function render() {
                    box.innerHTML = '';
                    cbs = [];
                    colOptions(rg, hdr.checked).forEach(function (o) {
                        var cb = SO.el('input', { type: 'checkbox', value: o.value });
                        cb.checked = true;
                        cbs.push(cb);
                        box.appendChild(SO.el('label', {}, cb, SO.el('span', { text: o.text })));
                    });
                }
                hdr.addEventListener('change', render);
                render();
                body.appendChild(box);
                C._dup = function () { return { header: hdr.checked, cols: cbs.filter(function (c) { return c.checked; }).map(function (c) { return +c.value; }) }; };
            },
            buttons: [{ label: 'c_cancel', value: null }, { label: 'c_ok', primary: true, value: 'ok', onClick: function () { C._dupRes = C._dup(); } }]
        }).then(function (v) {
            if (v !== 'ok' || !C._dupRes.cols.length) return;
            var cfg = C._dupRes;
            var start = cfg.header ? rg.r1 + 1 : rg.r1;
            var seen = {}, keep = [], removed = 0;
            for (var r = start; r <= rg.r2; r++) {
                var key = cfg.cols.map(function (c) { var v2 = App.wb.value(sh, r, c); return typeof v2 === 'string' ? v2.toLowerCase() : String(v2); }).join('\u0001');
                if (seen[key]) { removed++; continue; }
                seen[key] = true;
                keep.push(r);
            }
            if (!removed) { SO.alert('x_no_duplicates'); return; }
            App.change('remove-dup', function () {
                var rows = keep.map(function (r) { var row = []; for (var c = rg.c1; c <= rg.c2; c++) row.push(M.cloneCell(sh.cell(r, c))); return row; });
                for (var i = start; i <= rg.r2; i++) for (var c = rg.c1; c <= rg.c2; c++) {
                    var src = rows[i - start];
                    App.wb.setCell(sh, i, c, src ? M.reviveCell(src[c - rg.c1]) : null);
                }
            });
            SO.alert(SO.t('x_dup_removed', { n: removed, kept: keep.length }));
        });
    };

    C.textToColumns = function () {
        var sh = sheet();
        var rg = App.selRange();
        if (rg.c1 !== rg.c2) { SO.toast('x_ttc_one_col', { type: 'warn' }); return; }
        rg = clampToData(rg);
        SO.form({
            title: 'x_text_to_columns',
            fields: [
                { name: 'delim', label: 'x_delimiter', type: 'select', value: 'comma', options: [{ value: 'tab', label: 'x_delim_tab' }, { value: 'comma', label: 'x_delim_comma' }, { value: 'semicolon', label: 'x_delim_semicolon' }, { value: 'space', label: 'x_delim_space' }, { value: 'other', label: 'x_delim_other' }] },
                { name: 'other', label: 'x_delim_other', value: '|' },
                { name: 'merge', label: 'x_treat_consecutive', type: 'checkbox', value: true }
            ]
        }).then(function (v) {
            if (!v) return;
            var d = { tab: '\t', comma: ',', semicolon: ';', space: ' ' }[v.delim] || v.other || ',';
            App.change('text-to-columns', function () {
                for (var r = rg.r1; r <= rg.r2; r++) {
                    var t = App.wb.display(sh, r, rg.c1).text;
                    if (!t) continue;
                    var parts = t.split(d);
                    if (v.merge) parts = parts.filter(function (p, i) { return p !== '' || i === 0; });
                    parts.forEach(function (p, i) { App.wb.setInput(sh, r, rg.c1 + i, p.trim()); });
                }
            });
        });
    };

    C.pivot = function () {
        var sh = sheet();
        var rg = C.currentRegion();
        if (!rg || rg.r2 <= rg.r1 || !detectHeader(rg) && typeof App.wb.value(sh, rg.r1, rg.c1) !== 'string') { SO.toast('x_pivot_need_header', { type: 'warn' }); return; }
        var cols = colOptions(rg, true);
        SO.form({
            title: 'x_pivot', width: 480, intro: 'x_pivot_intro',
            fields: [
                { name: 'row', label: 'x_pivot_rows', type: 'select', value: rg.c1, options: cols },
                { name: 'col', label: 'x_pivot_cols', type: 'select', value: '', options: [{ value: '', label: 'x_none' }].concat(cols) },
                { type: 'row', fields: [
                    { name: 'val', label: 'x_pivot_values', type: 'select', value: rg.c2, options: cols },
                    { name: 'agg', label: 'x_pivot_agg', type: 'select', value: 'sum', options: [{ value: 'sum', label: 'x_agg_sum' }, { value: 'count', label: 'x_agg_count' }, { value: 'avg', label: 'x_agg_avg' }, { value: 'min', label: 'x_agg_min' }, { value: 'max', label: 'x_agg_max' }] }
                ] }
            ]
        }).then(function (v) {
            if (!v) return;
            var rowC = +v.row, colC = v.col === '' ? null : +v.col, valC = +v.val;
            var groups = {}, rowKeys = [], colKeys = [];
            for (var r = rg.r1 + 1; r <= rg.r2; r++) {
                if (sh.rows.filtered[r]) continue;
                var rk = App.wb.display(sh, r, rowC).text || SO.t('x_blanks');
                var ck = colC === null ? '' : (App.wb.display(sh, r, colC).text || SO.t('x_blanks'));
                if (rowKeys.indexOf(rk) === -1) rowKeys.push(rk);
                if (colKeys.indexOf(ck) === -1) colKeys.push(ck);
                var g = groups[rk + '\u0001' + ck] = groups[rk + '\u0001' + ck] || [];
                var val = App.wb.value(sh, r, valC);
                g.push(val);
            }
            var agg = function (list) {
                if (!list) return null;
                var nums = list.filter(function (x) { return typeof x === 'number'; });
                switch (v.agg) {
                    case 'count': return list.filter(function (x) { return x !== null && x !== ''; }).length;
                    case 'avg': return nums.length ? nums.reduce(function (s, x) { return s + x; }, 0) / nums.length : null;
                    case 'min': return nums.length ? Math.min.apply(null, nums) : null;
                    case 'max': return nums.length ? Math.max.apply(null, nums) : null;
                    default: return nums.reduce(function (s, x) { return s + x; }, 0);
                }
            };
            var sortKeys = function (arr) { return arr.sort(function (a, b) { return String(a).localeCompare(String(b), SO.locale(), { numeric: true }); }); };
            sortKeys(rowKeys); sortKeys(colKeys);
            var newIdx;
            App.change('pivot', function () {
                App.wb.recordAll();
                var ps = App.wb.addSheet(SO.t('x_pivot_sheet'), App.wb.active + 1);
                newIdx = App.wb.sheets.indexOf(ps);
                var head = App.wb.display(sh, rg.r1, rowC).text;
                var aggLabel = SO.t({ sum: 'x_agg_sum', count: 'x_agg_count', avg: 'x_agg_avg', min: 'x_agg_min', max: 'x_agg_max' }[v.agg]) + ' ' + App.wb.display(sh, rg.r1, valC).text;
                App.wb.setInput(ps, 0, 0, aggLabel);
                App.wb.setStyle(ps, 0, 0, 0, 0, { b: true, fs: 12 });
                App.wb.setInput(ps, 2, 0, head);
                colKeys.forEach(function (ck, j) { App.wb.setInput(ps, 2, 1 + j, colC === null ? SO.t('x_total') : ck); });
                if (colC !== null) App.wb.setInput(ps, 2, 1 + colKeys.length, SO.t('x_grand_total'));
                var lastCol = colC !== null ? 1 + colKeys.length : colKeys.length;
                rowKeys.forEach(function (rk, i) {
                    var rr = 3 + i;
                    App.wb.setInput(ps, rr, 0, rk);
                    var all = [];
                    colKeys.forEach(function (ck, j) {
                        var list = groups[rk + '\u0001' + ck];
                        if (list) all = all.concat(list);
                        var val = agg(list);
                        if (val !== null) ps.cells.set(M.key(rr, 1 + j), { v: F.roundTo(val, 10) });
                    });
                    if (colC !== null) { var tv = agg(all); if (tv !== null) ps.cells.set(M.key(rr, lastCol), { v: F.roundTo(tv, 10) }); }
                });
                var totalRow = 3 + rowKeys.length;
                App.wb.setInput(ps, totalRow, 0, SO.t('x_grand_total'));
                colKeys.forEach(function (ck, j) {
                    var colVals = [];
                    rowKeys.forEach(function (rk) { colVals = colVals.concat(groups[rk + '\u0001' + ck] || []); });
                    var gv = agg(colVals);
                    if (gv !== null) ps.cells.set(M.key(totalRow, 1 + j), { v: F.roundTo(gv, 10) });
                });
                if (colC !== null) {
                    var everything = [];
                    Object.keys(groups).forEach(function (k) { everything = everything.concat(groups[k]); });
                    var gt = agg(everything);
                    if (gt !== null) ps.cells.set(M.key(totalRow, lastCol), { v: F.roundTo(gt, 10) });
                }
                App.wb.setStyle(ps, 2, 0, 2, lastCol, { b: true, bg: '#1D7044', fc: '#FFFFFF' });
                App.wb.setStyle(ps, totalRow, 0, totalRow, lastCol, { b: true, bd: { t: { s: 'thin', c: '#1D7044' } } });
                App.wb.setStyle(ps, 3, 1, totalRow, lastCol, { nf: v.agg === 'count' ? '#,##0' : '#,##0.##' });
                ps.cols.sizes[0] = 160;
                ps.cols.invalidate();
            });
            App.activateSheet(newIdx);
        });
    };

    C.goalSeek = function () {
        var sh = sheet();
        SO.form({
            title: 'x_goal_seek',
            fields: [
                { name: 'set', label: 'x_gs_set_cell', value: F.addr(App.sel.active.r, App.sel.active.c) },
                { name: 'to', label: 'x_gs_to_value', type: 'number', step: 'any', value: '' },
                { name: 'by', label: 'x_gs_by_changing', value: '' }
            ]
        }).then(function (v) {
            if (!v) return;
            var s = F.parseAddr(v.set), b = F.parseAddr(v.by);
            if (!s || !b || v.to === null) { SO.toast('x_invalid_ref', { type: 'error' }); return; }
            var setCell = sh.cell(s.r, s.c);
            if (!setCell || setCell.f === undefined) { SO.toast('x_gs_need_formula', { type: 'error' }); return; }
            var byCell = sh.cell(b.r, b.c);
            if (byCell && byCell.f !== undefined) { SO.toast('x_gs_need_value', { type: 'error' }); return; }
            var target = v.to;
            var original = byCell ? byCell.v : null;
            var evalAt = function (x) {
                sh.cells.set(M.key(b.r, b.c), Object.assign({}, sh.cell(b.r, b.c) || {}, { v: x }));
                App.wb.recalc();
                var y = App.wb.value(sh, s.r, s.c);
                return typeof y === 'number' ? y - target : NaN;
            };
            var x0 = typeof original === 'number' ? original : 0, x1 = x0 ? x0 * 1.1 : 1;
            var f0 = evalAt(x0), f1 = evalAt(x1), found = null;
            for (var i = 0; i < 100 && !isNaN(f0) && !isNaN(f1); i++) {
                if (Math.abs(f1) < 1e-9) { found = x1; break; }
                var d = f1 - f0;
                if (d === 0) { x1 += 1; f1 = evalAt(x1); continue; }
                var x2 = x1 - f1 * (x1 - x0) / d;
                x0 = x1; f0 = f1; x1 = x2; f1 = evalAt(x1);
            }
            // Pulihkan dulu, lalu terapkan hasil sebagai langkah undo.
            if (byCell) sh.cells.set(M.key(b.r, b.c), byCell); else sh.cells.delete(M.key(b.r, b.c));
            App.wb.recalc();
            if (found === null && !(Math.abs(f1) < 1e-6)) { SO.alert('x_gs_not_found'); App.requestRender(); return; }
            var result = found !== null ? found : x1;
            App.change('goal-seek', function () { App.wb.setInput(sh, b.r, b.c, F.numToText(F.roundTo(result, 10))); });
            SO.toast('x_gs_done', { type: 'success', vars: { v: F.general(F.roundTo(result, 6)) } });
        });
    };

    // =========================================================== AutoSum
    C.autoSum = function (fn) {
        fn = fn || 'SUM';
        var sh = sheet();
        if (App.editing) App.commitEdit(null);
        var rg = App.selRange();
        var isNum = function (r, c) { return typeof App.wb.value(sh, r, c) === 'number'; };
        if (rg.r1 === rg.r2 && rg.c1 === rg.c2) {
            var r = rg.r1, c = rg.c1;
            var top = r - 1;
            while (top >= 0 && isNum(top, c)) top--;
            if (top < r - 1) { App.startEdit('enter', '=' + fn + '(' + F.rangeAddr(top + 1, c, r - 1, c) + ')'); return; }
            var left = c - 1;
            while (left >= 0 && isNum(r, left)) left--;
            if (left < c - 1) { App.startEdit('enter', '=' + fn + '(' + F.rangeAddr(r, left + 1, r, c - 1) + ')'); return; }
            App.startEdit('enter', '=' + fn + '()');
            try { App.el.editor.setSelectionRange(fn.length + 2, fn.length + 2); } catch (e) {}
            return;
        }
        rg = clampToData(rg);
        App.change('autosum', function () {
            for (var cc = rg.c1; cc <= rg.c2; cc++) {
                var lastEmpty = App.wb.value(sh, rg.r2, cc) === null && rg.r2 > rg.r1;
                var endR = lastEmpty ? rg.r2 - 1 : rg.r2;
                var target = lastEmpty ? rg.r2 : rg.r2 + 1;
                App.wb.setInput(sh, target, cc, '=' + fn + '(' + F.rangeAddr(rg.r1, cc, endR, cc) + ')');
            }
        });
    };

    // ==================================================== Sisipkan Fungsi
    C.insertFunction = function (category) {
        var cats = [['all', 'x_fncat_all'], ['recent', 'x_fncat_recent'], ['math', 'x_fncat_math'], ['stat', 'x_fncat_stat'], ['logic', 'x_fncat_logic'], ['text', 'x_fncat_text'], ['lookup', 'x_fncat_lookup'], ['date', 'x_fncat_date'], ['finance', 'x_fncat_finance'], ['info', 'x_fncat_info']];
        var recent = [];
        try { recent = JSON.parse(localStorage.getItem('sx_recent_fn') || '[]'); } catch (e) {}
        var chosen = null;
        var wasEditing = !!App.editing;
        SO.dialog({
            title: 'x_insert_function', width: 520,
            body: function (body, dlg) {
                var search = SO.el('input', { class: 'so-input', type: 'search', placeholder: SO.t('x_search_function') });
                var catSel = SO.el('select', { class: 'so-select' });
                cats.forEach(function (c) { catSel.appendChild(SO.el('option', { value: c[0], text: SO.t(c[1]) })); });
                catSel.value = category || (recent.length ? 'recent' : 'all');
                var list = SO.el('div', { class: 'sx-fn-list' });
                var syn = SO.el('div', { class: 'sx-fn-syntax' });
                var desc = SO.el('div', { class: 'sx-fn-desc' });
                function names() {
                    var q = search.value.trim().toUpperCase();
                    var cat = catSel.value;
                    var all = Object.keys(F.FN).sort();
                    var info = {};
                    F.FN_INFO.forEach(function (x) { info[x[0]] = x; });
                    return all.filter(function (n) {
                        if (q) return n.indexOf(q) !== -1 || (SO.has('x_fn_' + n.toLowerCase().replace(/\./g, '_')) && SO.t('x_fn_' + n.toLowerCase().replace(/\./g, '_')).toUpperCase().indexOf(q) !== -1);
                        if (cat === 'all') return true;
                        if (cat === 'recent') return recent.indexOf(n) !== -1;
                        return info[n] && info[n][1] === cat;
                    });
                }
                function select(n, btn) {
                    chosen = n;
                    SO.$$('button', list).forEach(function (b) { b.classList.toggle('is-active', b === btn); });
                    var info = F.FN_INFO.filter(function (x) { return x[0] === n; })[0];
                    syn.textContent = info ? info[2] : n + '(…)';
                    var k = 'x_fn_' + n.toLowerCase().replace(/\./g, '_');
                    desc.textContent = SO.has(k) ? SO.t(k) : '';
                }
                function render() {
                    list.innerHTML = '';
                    var arr = names();
                    if (catSel.value === 'recent' && !search.value) arr = recent.filter(function (n) { return F.FN[n]; });
                    arr.forEach(function (n, i) {
                        var b = SO.el('button', { type: 'button', text: n });
                        b.addEventListener('click', function () { select(n, b); });
                        b.addEventListener('dblclick', function () { select(n, b); dlg.$('[data-primary]').click(); });
                        list.appendChild(b);
                        if (i === 0) select(n, b);
                    });
                    if (!arr.length) { chosen = null; syn.textContent = ''; desc.textContent = SO.t('x_no_functions'); }
                }
                search.addEventListener('input', render);
                catSel.addEventListener('change', render);
                search.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (chosen) dlg.$('[data-primary]').click(); } });
                body.appendChild(SO.el('div', { class: 'so-form-row' }, search, catSel));
                body.appendChild(list);
                body.appendChild(syn);
                body.appendChild(desc);
                render();
            },
            enterSubmits: false,
            buttons: [{ label: 'c_cancel', value: null }, { label: 'c_ok', primary: true, value: 'ok' }]
        }).then(function (v) {
            if (v !== 'ok' || !chosen) return;
            recent = [chosen].concat(recent.filter(function (n) { return n !== chosen; })).slice(0, 10);
            try { localStorage.setItem('sx_recent_fn', JSON.stringify(recent)); } catch (e) {}
            if (wasEditing && App.editing) {
                var ed = App.el.editor;
                var p = ed.selectionStart;
                ed.value = ed.value.slice(0, p) + chosen + '(' + ed.value.slice(ed.selectionEnd);
                ed.focus();
                ed.setSelectionRange(p + chosen.length + 1, p + chosen.length + 1);
                App.el.formula.value = ed.value;
                App.updateEditAids();
            } else {
                App.startEdit('enter', '=' + chosen + '(');
            }
        });
    };
})(window);
