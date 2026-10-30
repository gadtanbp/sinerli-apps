/**
 * Sinerli Hitara — objek melayang: grafik (Chart.js) dan gambar.
 * Posisi disimpan dalam piksel lembar (zoom 100%) di sheet.charts / sheet.images.
 */
(function (global) {
    'use strict';

    var App = global.SineEX, F = global.SXF;
    var C = App.cmd;
    var PALETTE = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9E480E', '#636363', '#997300', '#1D7044', '#C4462A'];
    var CHART_TYPES = [
        ['column', 'fa-chart-column', 'x_ch_column'], ['bar', 'fa-chart-bar', 'x_ch_bar'], ['line', 'fa-chart-line', 'x_ch_line'], ['area', 'fa-chart-area', 'x_ch_area'],
        ['pie', 'fa-chart-pie', 'x_ch_pie'], ['doughnut', 'fa-circle-notch', 'x_ch_doughnut'], ['scatter', 'fa-braille', 'x_ch_scatter'], ['radar', 'fa-spider', 'x_ch_radar']
    ];
    C.CHART_TYPES = CHART_TYPES;
    var instances = {};
    App.selObj = null;

    function sheet() { return App.sheet(); }
    function allObjects(sh) { return sh.charts.map(function (c) { return { o: c, kind: 'chart' }; }).concat(sh.images.map(function (i) { return { o: i, kind: 'image' }; })); }
    function findObj(id) {
        var sh = sheet();
        var hit = null;
        allObjects(sh).forEach(function (x) { if (x.o.id === id) hit = x; });
        return hit;
    }

    // ================================================================ data
    function chartData(ch) {
        var p = F.parseRange(ch.range || '');
        if (!p) return null;
        var sh = p.sheet ? App.wb.sheetByName(p.sheet) : sheet();
        if (!sh) return null;
        var b = sh.bounds();
        var r2 = Math.min(p.r2, Math.max(b.r2, p.r1)), c2 = Math.min(p.c2, Math.max(b.c2, p.c1));
        var grid = [];
        for (var r = p.r1; r <= r2; r++) {
            if (sh.rows.filtered[r] || sh.rows.hidden[r]) continue;
            var row = [];
            for (var c = p.c1; c <= c2; c++) row.push({ v: App.wb.value(sh, r, c), t: App.wb.display(sh, r, c).text });
            grid.push(row);
        }
        if (!grid.length) return null;
        if (ch.byRow) grid = grid[0].map(function (_, c) { return grid.map(function (row) { return row[c]; }); });
        var h = grid.length, w = grid[0].length;
        var num = function (x) { return x && typeof x.v === 'number'; };
        var headerRow = grid[0].some(function (x) { return x && typeof x.v === 'string'; }) && h > 1;
        var headerCol = grid.slice(headerRow ? 1 : 0).every(function (row) { return !num(row[0]) || w === 1; }) && w > 1;
        if (ch.type === 'scatter') headerCol = false;
        var labels = [], series = [];
        var startR = headerRow ? 1 : 0, startC = headerCol ? 1 : 0;
        for (var i = startR; i < h; i++) labels.push(headerCol ? grid[i][0].t : String(i - startR + 1));
        for (var j = startC; j < w; j++) {
            series.push({
                name: headerRow ? grid[0][j].t : SO.t('x_series') + ' ' + (j - startC + 1),
                values: grid.slice(startR).map(function (row) { return num(row[j]) ? row[j].v : null; })
            });
        }
        return { labels: labels, series: series };
    }

    function buildConfig(ch) {
        var d = chartData(ch) || { labels: [], series: [] };
        var type = ch.type || 'column';
        var jsType = { column: 'bar', bar: 'bar', line: 'line', area: 'line', pie: 'pie', doughnut: 'doughnut', scatter: 'scatter', radar: 'radar' }[type] || 'bar';
        var pieLike = type === 'pie' || type === 'doughnut';
        var datasets;
        if (type === 'scatter') {
            var xs = d.series[0] ? d.series[0].values : [];
            datasets = d.series.slice(1).map(function (s, i) {
                return { label: s.name, data: s.values.map(function (y, k) { return { x: xs[k], y: y }; }).filter(function (pt) { return pt.x !== null && pt.y !== null; }), backgroundColor: PALETTE[i % PALETTE.length], pointRadius: 4 };
            });
        } else if (pieLike) {
            var s0 = d.series[0] || { name: '', values: [] };
            datasets = [{ label: s0.name, data: s0.values, backgroundColor: d.labels.map(function (_, i) { return PALETTE[i % PALETTE.length]; }), borderColor: '#fff', borderWidth: 2 }];
        } else {
            datasets = d.series.map(function (s, i) {
                var col = PALETTE[i % PALETTE.length];
                return {
                    label: s.name, data: s.values, backgroundColor: type === 'area' ? col + '55' : type === 'radar' ? col + '33' : col,
                    borderColor: col, borderWidth: type === 'line' || type === 'area' || type === 'radar' ? 2 : 0,
                    fill: type === 'area' ? (ch.stacked ? (i ? '-1' : 'origin') : 'origin') : type === 'radar', tension: ch.smooth ? 0.35 : 0,
                    pointRadius: type === 'line' ? 3 : 2, spanGaps: true, borderRadius: jsType === 'bar' ? 2 : 0
                };
            });
        }
        var legend = ch.legend || (pieLike || datasets.length > 1 ? 'bottom' : 'none');
        var fmt = function (v) { return typeof v === 'number' ? F.general(F.roundTo(v, 6)) : v; };
        var cfg = {
            type: jsType,
            data: { labels: type === 'scatter' ? undefined : d.labels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
                indexAxis: type === 'bar' ? 'y' : 'x',
                plugins: {
                    legend: { display: legend !== 'none', position: legend === 'none' ? 'bottom' : legend, labels: { boxWidth: 12, font: { family: 'Inter, Arial, sans-serif', size: 11 } } },
                    title: { display: !!ch.title, text: ch.title || '', font: { family: 'Inter, Arial, sans-serif', size: 14, weight: '600' }, color: '#333', padding: { top: 6, bottom: 8 } },
                    tooltip: { callbacks: { label: function (c) { var v = c.parsed && typeof c.parsed === 'object' ? (type === 'bar' ? c.parsed.x : c.parsed.y !== undefined ? c.parsed.y : c.parsed) : c.parsed; if (pieLike) v = c.parsed; return (c.dataset.label ? c.dataset.label + ': ' : '') + fmt(v); } } }
                }
            }
        };
        if (!pieLike && type !== 'radar') {
            var valueTicks = { font: { size: 10 }, callback: function (v) { return typeof v === 'number' ? v.toLocaleString(SO.locale(), { maximumFractionDigits: 6 }) : v; } };
            var catTicks = { font: { size: 10 } };
            var horizontal = type === 'bar';
            cfg.options.scales = {
                x: { stacked: !!ch.stacked && type !== 'scatter', grid: { color: '#eee', display: horizontal || type === 'scatter' }, ticks: horizontal || type === 'scatter' ? valueTicks : catTicks },
                y: { stacked: !!ch.stacked && type !== 'scatter', grid: { color: '#eee', display: !horizontal }, ticks: horizontal ? catTicks : valueTicks, beginAtZero: type !== 'scatter' }
            };
            if (ch.xTitle) cfg.options.scales.x.title = { display: true, text: ch.xTitle };
            if (ch.yTitle) cfg.options.scales.y.title = { display: true, text: ch.yTitle };
        }
        return { cfg: cfg, empty: !d.series.length };
    }

    // ============================================================ render
    C.renderObjects = function () {
        var box = App.el.objects;
        Object.keys(instances).forEach(function (id) { try { instances[id].destroy(); } catch (e) {} delete instances[id]; });
        box.innerHTML = '';
        if (!App.wb) return;
        var sh = sheet();
        var needChart = sh.charts.length > 0;
        allObjects(sh).forEach(function (x) { box.appendChild(makeEl(x.o, x.kind)); });
        if (needChart) SO.load('chart').then(function () { sh.charts.forEach(drawChart); C.layoutObjects(); }).catch(function (e) { SO.toast(e.message, { type: 'error' }); });
        C.layoutObjects();
    };

    function makeEl(o, kind) {
        var div = SO.el('div', { class: 'sx-obj' + (kind === 'image' ? ' is-image' : '') + (App.selObj === o.id ? ' is-selected' : ''), dataset: { id: o.id, kind: kind } });
        if (kind === 'image') {
            var rec = App.assets.get(o.asset);
            div.appendChild(SO.el('img', { src: rec ? rec.url : '', alt: '', draggable: 'false' }));
        } else {
            div.appendChild(SO.el('canvas'));
        }
        ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(function (h) {
            var hd = SO.el('div', { class: 'sx-h', dataset: { h: h } });
            div.appendChild(hd);
        });
        var tools = SO.el('div', { class: 'sx-obj-tools' });
        if (kind === 'chart') {
            var edit = SO.el('button', { type: 'button', html: '<i class="fas fa-pen"></i>', title: SO.t('x_edit_chart') });
            edit.addEventListener('click', function (e) { e.stopPropagation(); C.chartDialog(o); });
            tools.appendChild(edit);
        }
        var del = SO.el('button', { type: 'button', html: '<i class="fas fa-trash"></i>', title: SO.t('c_delete') });
        del.addEventListener('click', function (e) { e.stopPropagation(); C.deleteObject(o.id); });
        tools.appendChild(del);
        div.appendChild(tools);
        div.addEventListener('pointerdown', function (e) { startObjDrag(e, o, div); });
        div.addEventListener('dblclick', function () { if (kind === 'chart') C.chartDialog(o); });
        div.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            selectObj(o.id);
            SO.contextMenu(e, [
                kind === 'chart' ? { label: 'x_edit_chart', icon: 'fa-pen', onClick: function () { C.chartDialog(o); } } : null,
                kind === 'chart' ? { label: 'x_download_png', icon: 'fa-download', onClick: function () { C.downloadChart(o); } } : null,
                { label: 'x_bring_front', icon: 'fa-layer-group', onClick: function () { C.arrange(o.id, 1); } },
                { label: 'x_send_back', icon: 'fa-clone', onClick: function () { C.arrange(o.id, -1); } },
                { sep: true },
                { label: 'c_delete', icon: 'fa-trash', danger: true, onClick: function () { C.deleteObject(o.id); } }
            ].filter(Boolean));
        });
        return div;
    }

    function drawChart(ch) {
        var el = App.el.objects.querySelector('[data-id="' + ch.id + '"]');
        if (!el || !global.Chart) return;
        var built = buildConfig(ch);
        var old = el.querySelector('.sx-obj-empty');
        if (old) old.remove();
        if (built.empty) el.appendChild(SO.el('div', { class: 'sx-obj-empty', text: SO.t('x_chart_no_data') }));
        if (instances[ch.id]) {
            var inst = instances[ch.id];
            if (inst.config.type !== built.cfg.type) { inst.destroy(); delete instances[ch.id]; }
            else { inst.data = built.cfg.data; inst.options = built.cfg.options; inst.update('none'); return; }
        }
        instances[ch.id] = new global.Chart(el.querySelector('canvas').getContext('2d'), built.cfg);
    }

    C.refreshCharts = function () {
        if (!App.wb || !global.Chart) return;
        sheet().charts.forEach(drawChart);
    };
    C.refreshChartsSoon = SO.debounce(C.refreshCharts, 150);

    C.layoutObjects = function () {
        if (!App.wb) return;
        var sh = sheet();
        var g = App.geom();
        var box = App.el.objects;
        box.style.left = g.hw + 'px';
        box.style.top = g.hh + 'px';
        box.style.right = '0';
        box.style.bottom = '0';
        box.style.overflow = 'hidden';
        allObjects(sh).forEach(function (x) {
            var el = box.querySelector('[data-id="' + x.o.id + '"]');
            if (!el) return;
            var o = x.o;
            el.style.left = Math.round(o.x * g.z - g.sx) + 'px';
            el.style.top = Math.round(o.y * g.z - g.sy) + 'px';
            el.style.width = Math.round(o.w * g.z) + 'px';
            el.style.height = Math.round(o.h * g.z) + 'px';
            if (o.z !== undefined) el.style.zIndex = o.z;
        });
    };

    function selectObj(id) {
        App.selObj = id;
        SO.$$('.sx-obj', App.el.objects).forEach(function (el) { el.classList.toggle('is-selected', el.dataset.id === id); });
        C.updateObjectTab();
    }
    C.deselectObjects = function () { if (App.selObj) selectObj(null); };
    C.updateObjectTab = function () {
        if (!App.ribbon) return;
        var x = App.selObj ? findObj(App.selObj) : null;
        App.ribbon.showContextual('chart', !!(x && x.kind === 'chart'), true);
    };

    function startObjDrag(e, o, el) {
        if (e.button !== 0) return;
        e.stopPropagation();
        if (App.editing && !App.commitEdit(null)) return;
        selectObj(o.id);
        var handle = e.target.dataset && e.target.dataset.h;
        if (e.target.closest('.sx-obj-tools')) return;
        e.preventDefault();
        var sh = sheet();
        var z = sh.zoom;
        var start = { x: e.clientX, y: e.clientY, ox: o.x, oy: o.y, ow: o.w, oh: o.h };
        var moved = false;
        el.setPointerCapture(e.pointerId);
        function move(ev) {
            var dx = (ev.clientX - start.x) / z, dy = (ev.clientY - start.y) / z;
            if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return;
            if (!moved) { moved = true; App._selBefore = App.captureSel(); App.wb.begin('object'); App.wb.recordMeta(sh); }
            if (!handle) { o.x = Math.max(0, Math.round(start.ox + dx)); o.y = Math.max(0, Math.round(start.oy + dy)); }
            else {
                var ratio = start.ow / Math.max(1, start.oh);
                if (handle.indexOf('e') !== -1) o.w = Math.max(40, Math.round(start.ow + dx));
                if (handle.indexOf('s') !== -1) o.h = Math.max(30, Math.round(start.oh + dy));
                if (handle.indexOf('w') !== -1) { var nw = Math.max(40, Math.round(start.ow - dx)); o.x = start.ox + start.ow - nw; o.w = nw; }
                if (handle.indexOf('n') !== -1) { var nh = Math.max(30, Math.round(start.oh - dy)); o.y = start.oy + start.oh - nh; o.h = nh; }
                if (ev.shiftKey && handle.length === 2) { o.h = Math.round(o.w / ratio); }
            }
            C.layoutObjects();
        }
        function up() {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
            if (moved) App.wb.commit();
        }
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
    }

    C.deleteObject = function (id) {
        var sh = sheet();
        App.change('object-delete', function () {
            App.wb.recordMeta(sh);
            sh.charts = sh.charts.filter(function (c) { return c.id !== id; });
            sh.images = sh.images.filter(function (i) { return i.id !== id; });
        });
        if (App.selObj === id) App.selObj = null;
        C.renderObjects();
        C.updateObjectTab();
        App.focusGrid();
    };

    C.arrange = function (id, dir) {
        var sh = sheet();
        var list = allObjects(sh).map(function (x) { return x.o; });
        var zs = list.map(function (o) { return o.z || 0; });
        App.change('object-arrange', function () {
            App.wb.recordMeta(sh);
            var target = findObj(id).o;
            target.z = dir > 0 ? Math.max.apply(null, zs) + 1 : Math.min.apply(null, zs) - 1;
        });
        C.layoutObjects();
    };

    document.addEventListener('keydown', function (e) {
        if (!App.selObj || SO.isDialogOpen()) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || (t.tagName === 'TEXTAREA' && App.editing))) return;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); C.deleteObject(App.selObj); }
        else if (e.key === 'Escape') { C.deselectObjects(); }
        else if (/^Arrow/.test(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            var x = findObj(App.selObj);
            if (!x) return;
            var step = e.shiftKey ? 10 : 1;
            App.change('object', function () {
                App.wb.recordMeta(sheet());
                if (e.key === 'ArrowLeft') x.o.x = Math.max(0, x.o.x - step);
                if (e.key === 'ArrowRight') x.o.x += step;
                if (e.key === 'ArrowUp') x.o.y = Math.max(0, x.o.y - step);
                if (e.key === 'ArrowDown') x.o.y += step;
            });
            C.layoutObjects();
        }
    }, true);

    // ============================================================ sisip
    function placeNearSelection(w, h) {
        var sh = sheet();
        var rg = App.selRange();
        // Hindari menutupi data di sekitar seleksi (mis. baris total di bawahnya).
        var region = C.currentRegion(true);
        rg = { r1: rg.r1, c1: rg.c1, r2: Math.max(Math.min(rg.r2, sh.rows.count - 1), region.r2), c2: Math.max(Math.min(rg.c2, sh.cols.count - 1), region.c2) };
        var c2 = Math.min(rg.c2, sh.cols.count - 1);
        var x = sh.cols.pos(Math.min(c2 + 1, sh.cols.count - 1)) + 16;
        var y = sh.rows.pos(Math.min(rg.r1, sh.rows.count - 1));
        var g = App.geom();
        var viewRight = (g.sx + g.W - g.hw) / g.z;
        if (x + w > viewRight) {
            // Tidak muat di kanan: letakkan di bawah data bila terlihat, kalau tidak di tepi kanan layar.
            var yBelow = sh.rows.pos(Math.min(Math.min(rg.r2, sh.rows.count - 2) + 1, sh.rows.count - 1)) + 16;
            var viewBottom = (g.sy + g.H - g.hh) / g.z;
            if (yBelow + h <= viewBottom) { x = sh.cols.pos(rg.c1) + 8; y = yBelow; }
            else x = Math.max(g.sx / g.z + 20, viewRight - w - 20);
        }
        return { x: Math.round(x), y: Math.round(y) };
    }

    C.insertChart = function (type) {
        var sh = sheet();
        var rg = App.selRange();
        if (rg.r1 === rg.r2 && rg.c1 === rg.c2) rg = C.currentRegion();
        rg = { r1: rg.r1, c1: rg.c1, r2: Math.min(rg.r2, Math.max(sh.bounds().r2, rg.r1)), c2: Math.min(rg.c2, Math.max(sh.bounds().c2, rg.c1)) };
        var hasNum = false;
        for (var r = rg.r1; r <= rg.r2 && !hasNum; r++) for (var c = rg.c1; c <= rg.c2; c++) if (typeof App.wb.value(sh, r, c) === 'number') { hasNum = true; break; }
        if (!hasNum) { SO.toast('x_chart_select_data', { type: 'warn', ms: 4500 }); return; }
        var pos = placeNearSelection(480, 300);
        var ch = { id: SO.uid('ch'), type: type || 'column', range: F.quoteSheet(sh.name) + '!' + F.rangeAddr(rg.r1, rg.c1, rg.r2, rg.c2), x: pos.x, y: pos.y, w: 480, h: 300, title: '', legend: '' };
        App.change('chart-add', function () { App.wb.recordMeta(sh); sh.charts.push(ch); });
        App.selObj = ch.id;
        C.renderObjects();
        C.updateObjectTab();
    };

    C.insertImageFile = function (file) {
        var sh = sheet();
        var busy = SO.busy('x_inserting_image');
        SO.prepareImage(file, 1600).then(function (res) {
            busy.done();
            var rec = App.assets.addDataUrl(res.dataUrl);
            var w = res.width || 320, h = res.height || 240;
            var scale = Math.min(1, 480 / w, 360 / h);
            var pos = placeNearSelection(w * scale, h * scale);
            var im = { id: SO.uid('im'), asset: rec.id, x: pos.x, y: pos.y, w: Math.round(w * scale), h: Math.round(h * scale) };
            App.change('image-add', function () { App.wb.recordMeta(sh); sh.images.push(im); });
            App.selObj = im.id;
            C.renderObjects();
        }).catch(function (e) { busy.done(); SO.toast(e.message || 'c_err_image', { type: 'error' }); });
    };
    C.insertImage = function () { SO.pickFile('image/*').then(function (f) { if (f) C.insertImageFile(f); }); };

    C.chartDialog = function (ch) {
        var sh = sheet();
        var isNew = !ch;
        var draft = SO.deepClone(ch || { type: 'column', range: F.quoteSheet(sh.name) + '!' + F.rangeAddr(App.selRange().r1, App.selRange().c1, Math.min(App.selRange().r2, sh.rows.count - 1), Math.min(App.selRange().c2, sh.cols.count - 1)), title: '', legend: '' });
        SO.dialog({
            title: isNew ? 'x_insert_chart' : 'x_edit_chart', width: 560,
            body: function (body, dlg) {
                var types = SO.el('div', { class: 'sx-chart-types' });
                CHART_TYPES.forEach(function (t) {
                    var b = SO.el('button', { type: 'button', class: draft.type === t[0] ? 'is-active' : '', html: '<i class="fas ' + t[1] + '"></i><span>' + SO.esc(SO.t(t[2])) + '</span>' });
                    b.addEventListener('click', function () { draft.type = t[0]; SO.$$('button', types).forEach(function (x) { x.classList.toggle('is-active', x === b); }); });
                    types.appendChild(b);
                });
                body.appendChild(types);
                var form = SO.el('div', { class: 'so-form' });
                var mk = function (label, input) { return SO.el('div', { class: 'so-field' }, SO.el('label', { text: SO.t(label) }), input); };
                var range = SO.el('input', { class: 'so-input', type: 'text', value: draft.range, spellcheck: 'false' });
                var title = SO.el('input', { class: 'so-input', type: 'text', value: draft.title || '' });
                var legend = SO.el('select', { class: 'so-select' });
                [['', 'x_auto'], ['top', 'x_top'], ['bottom', 'x_bottom'], ['right', 'x_right'], ['left', 'x_left'], ['none', 'x_none']].forEach(function (x) { legend.appendChild(SO.el('option', { value: x[0], text: SO.t(x[1]) })); });
                legend.value = draft.legend || '';
                var xt = SO.el('input', { class: 'so-input', type: 'text', value: draft.xTitle || '' });
                var yt = SO.el('input', { class: 'so-input', type: 'text', value: draft.yTitle || '' });
                var byRow = SO.el('input', { type: 'checkbox' }); byRow.checked = !!draft.byRow;
                var stacked = SO.el('input', { type: 'checkbox' }); stacked.checked = !!draft.stacked;
                var smooth = SO.el('input', { type: 'checkbox' }); smooth.checked = !!draft.smooth;
                form.appendChild(mk('x_data_range', range));
                form.appendChild(mk('x_chart_title', title));
                form.appendChild(SO.el('div', { class: 'so-form-row' }, mk('x_legend', legend), mk('x_axis_x_title', xt), mk('x_axis_y_title', yt)));
                form.appendChild(SO.el('label', { class: 'so-field is-inline' }, byRow, SO.el('span', { text: SO.t('x_series_in_rows') })));
                form.appendChild(SO.el('label', { class: 'so-field is-inline' }, stacked, SO.el('span', { text: SO.t('x_stacked') })));
                form.appendChild(SO.el('label', { class: 'so-field is-inline' }, smooth, SO.el('span', { text: SO.t('x_smooth_lines') })));
                body.appendChild(form);
                dlg._read = function () {
                    draft.range = range.value.trim();
                    draft.title = title.value.trim();
                    draft.legend = legend.value;
                    draft.xTitle = xt.value.trim();
                    draft.yTitle = yt.value.trim();
                    draft.byRow = byRow.checked;
                    draft.stacked = stacked.checked;
                    draft.smooth = smooth.checked;
                };
            },
            enterSubmits: false,
            buttons: [{ label: 'c_cancel', value: null }, { label: 'c_ok', primary: true, value: 'ok', onClick: function (dlg) {
                dlg._read();
                var p = F.parseRange(draft.range);
                if (!p || (p.sheet && !App.wb.sheetByName(p.sheet))) { SO.toast('x_invalid_ref', { type: 'error' }); return false; }
                if (!p.sheet) draft.range = F.quoteSheet(sh.name) + '!' + draft.range.replace(/\$/g, '');
            } }]
        }).then(function (v) {
            if (v !== 'ok') return;
            App.change('chart', function () {
                App.wb.recordMeta(sh);
                if (isNew) {
                    var pos = placeNearSelection(480, 300);
                    draft.id = SO.uid('ch'); draft.x = pos.x; draft.y = pos.y; draft.w = 480; draft.h = 300;
                    sh.charts.push(draft);
                } else {
                    var target = sh.charts.filter(function (c) { return c.id === ch.id; })[0];
                    if (target) Object.assign(target, draft);
                }
            });
            if (isNew) App.selObj = draft.id;
            C.renderObjects();
            C.updateObjectTab();
        });
    };

    C.chartCmd = function (action, value) {
        var x = App.selObj ? findObj(App.selObj) : null;
        if (!x || x.kind !== 'chart') return;
        var ch = x.o;
        var sh = sheet();
        if (action === 'edit') { C.chartDialog(ch); return; }
        if (action === 'png') { C.downloadChart(ch); return; }
        if (action === 'delete') { C.deleteObject(ch.id); return; }
        App.change('chart', function () {
            App.wb.recordMeta(sh);
            if (action === 'type') ch.type = value;
            if (action === 'legend') ch.legend = value;
            if (action === 'switch') ch.byRow = !ch.byRow;
            if (action === 'stacked') ch.stacked = !ch.stacked;
        });
        C.renderObjects();
    };

    C.chartTitle = function () {
        var x = App.selObj ? findObj(App.selObj) : null;
        if (!x || x.kind !== 'chart') return;
        SO.prompt('x_chart_title', x.o.title || '').then(function (t) {
            if (t === null) return;
            App.change('chart', function () { App.wb.recordMeta(sheet()); x.o.title = t; });
            C.renderObjects();
        });
    };

    C.downloadChart = function (ch) {
        var inst = instances[ch.id];
        if (!inst) return;
        var src = inst.canvas;
        var c = document.createElement('canvas');
        c.width = src.width; c.height = src.height;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(src, 0, 0);
        c.toBlob(function (b) { SO.download(b, SO.safeName(ch.title || App.getTitle(), 'chart') + '.png', 'image/png'); });
    };

    C.chartImage = function (ch) {
        var inst = instances[ch.id];
        if (!inst) return null;
        var src = inst.canvas;
        var c = document.createElement('canvas');
        c.width = src.width; c.height = src.height;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(src, 0, 0);
        return c.toDataURL('image/png');
    };

    C.onSheetChange = function () { App.selObj = null; C.updateObjectTab(); };
})(window);
