/**
 * Sinerli Present — objek khusus: tabel (sisip, baris/kolom, gabung sel, lebar
 * kolom), grafik & editor data, ikon, SmartArt, simbol, persamaan (KaTeX),
 * dan video.
 */
(function (global) {
    'use strict';

    var App = global.SineSlide, M = global.SSM, R = global.SSR;
    var C = App.cmd;

    function centerBox(w, h) { return { x: (App.deck.size.w - w) / 2, y: (App.deck.size.h - h) / 2 }; }
    function insertEls(label, els, opts) {
        if (App.editing) C.endEdit();
        App.change(label, function () {
            var s = App.slide();
            els.forEach(function (e) { s.els.push(e); });
            App.sel = els.map(function (e) { return e.id; });
        });
        if (opts && opts.edit) C.startEdit(els[0].id, { caret: 'end' });
    }

    // ============================================================= tabel
    C.tableGridMenu = function () {
        return [{
            custom: function (box, close) {
                box.className = 'ss-table-grid';
                var label = SO.el('div', { class: 'ss-table-grid-label', text: SO.t('s_insert_table') });
                var grid = SO.el('div', { class: 'ss-table-grid-cells' });
                var R0 = 8, C0 = 10;
                for (var r = 0; r < R0; r++) for (var c = 0; c < C0; c++) {
                    (function (r, c) {
                        var cell = SO.el('button', { type: 'button', dataset: { r: r, c: c } });
                        cell.addEventListener('mouseenter', function () {
                            SO.$$('button', grid).forEach(function (b) { b.classList.toggle('is-on', +b.dataset.r <= r && +b.dataset.c <= c); });
                            label.textContent = (c + 1) + ' × ' + (r + 1) + ' ' + SO.t('s_table');
                        });
                        cell.addEventListener('mousedown', function (e) { e.preventDefault(); });
                        cell.addEventListener('click', function () { close(); C.insertTable(r + 1, c + 1); });
                        grid.appendChild(cell);
                    })(r, c);
                }
                box.appendChild(label);
                box.appendChild(grid);
            }
        }, { sep: true }, { label: 's_insert_table_dialog', icon: 'fa-table', onClick: C.tableDialog }];
    };
    C.tableDialog = function () {
        SO.form({ title: 's_insert_table', width: 360, fields: [{ type: 'row', fields: [{ name: 'c', label: 's_columns', type: 'number', min: 1, max: 30, value: 5 }, { name: 'r', label: 's_rows', type: 'number', min: 1, max: 60, value: 4 }] }] })
            .then(function (v) { if (v) C.insertTable(SO.clamp(v.r || 1, 1, 60), SO.clamp(v.c || 1, 1, 30)); });
    };
    C.insertTable = function (rows, cols) {
        var W = App.deck.size.w;
        var w = Math.min(W * 0.84, cols * 190), h = Math.min(App.deck.size.h * 0.7, rows * 46);
        var p = centerBox(w, h);
        var e = M.table(rows, cols, p.x, p.y, w, h);
        insertEls('insert-table', [e]);
    };

    function tableCtx() {
        var ed = App.editing;
        var e = ed && ed.table ? App.elById(ed.id) : App.selected().filter(function (x) { return x.type === 'table'; })[0];
        if (!e) return null;
        return { e: e, r: ed && ed.cell ? ed.cell.r : 0, c: ed && ed.cell ? ed.cell.c : 0, editing: !!(ed && ed.table) };
    }
    function clearMerges(e) { e.cells.forEach(function (row) { row.forEach(function (c) { delete c.cs; delete c.rs; delete c.hide; }); }); }

    C.tableOp = function (op, value) {
        var t = tableCtx();
        if (!t) return;
        var e = t.e, r = t.r, c = t.c;
        if (App.editing) C.endEdit();
        var rows = e.cells.length, cols = e.cells[0].length;
        var newRow = function () { var a = []; for (var i = 0; i < cols; i++) a.push({ html: '' }); return a; };
        App.change('table-' + op, function () {
            switch (op) {
                case 'rowAbove': case 'rowBelow':
                    clearMerges(e);
                    e.cells.splice(op === 'rowAbove' ? r : r + 1, 0, newRow());
                    e.h += e.h / rows;
                    delete e.rowH;
                    break;
                case 'colLeft': case 'colRight':
                    clearMerges(e);
                    var at = op === 'colLeft' ? c : c + 1;
                    e.cells.forEach(function (row) { row.splice(at, 0, { html: '' }); });
                    e.colW.splice(at, 0, 1 / cols);
                    var tot = e.colW.reduce(function (a, b) { return a + b; }, 0);
                    e.colW = e.colW.map(function (w) { return w / tot; });
                    e.w = Math.min(App.deck.size.w, e.w * (cols + 1) / cols);
                    break;
                case 'delRow':
                    if (rows <= 1) { removeEl(e); return; }
                    clearMerges(e);
                    e.cells.splice(r, 1);
                    e.h = Math.max(30, e.h - e.h / rows);
                    delete e.rowH;
                    break;
                case 'delCol':
                    if (cols <= 1) { removeEl(e); return; }
                    clearMerges(e);
                    e.cells.forEach(function (row) { row.splice(c, 1); });
                    var removed = e.colW.splice(c, 1)[0];
                    e.colW = e.colW.map(function (w) { return w / (1 - removed); });
                    e.w = Math.max(40, e.w * (1 - removed));
                    break;
                case 'delTable': removeEl(e); break;
                case 'header': case 'banded': case 'firstCol':
                    e.tstyle[op] = value === undefined ? !e.tstyle[op] : !!value;
                    break;
                case 'distributeCols': e.colW = e.colW.map(function () { return 1 / cols; }); break;
                case 'distributeRows': delete e.rowH; break;
                case 'mergeRight':
                    var cell = e.cells[r][c];
                    var span = cell.cs || 1;
                    if (c + span >= cols) return;
                    var next = e.cells[r][c + span];
                    if (next.html && !M.isEmptyHtml(next.html)) cell.html = (cell.html || '') + ' ' + next.html;
                    next.hide = true; next.html = '';
                    cell.cs = span + (next.cs || 1);
                    break;
                case 'mergeDown':
                    var cell2 = e.cells[r][c];
                    var rs = cell2.rs || 1;
                    if (r + rs >= rows) return;
                    for (var k = 0; k < (cell2.cs || 1); k++) { var below = e.cells[r + rs][c + k]; if (k === 0 && below.html && !M.isEmptyHtml(below.html)) cell2.html = (cell2.html || '') + '<div>' + below.html + '</div>'; below.hide = true; below.html = ''; }
                    cell2.rs = rs + 1;
                    break;
                case 'split':
                    var cell3 = e.cells[r][c];
                    for (var rr = r; rr < r + (cell3.rs || 1); rr++) for (var cc = c; cc < c + (cell3.cs || 1); cc++) if (rr !== r || cc !== c) delete e.cells[rr][cc].hide;
                    delete cell3.cs; delete cell3.rs;
                    break;
                case 'cellFill':
                    if (t.editing) { if (value) e.cells[r][c].fill = value; else delete e.cells[r][c].fill; }
                    else e.cells.forEach(function (row) { row.forEach(function (x) { if (value) x.fill = value; else delete x.fill; }); });
                    break;
                case 'tableColor': e.tstyle.color = value || 'theme:accent1'; break;
                case 'border': e.tstyle.border = value || e.tstyle.color; e.tstyle.borders = value === null ? 'none' : undefined; break;
            }
        });
        if (t.editing && App.elById(e.id)) {
            var node = App.nodeFor(e.id);
            var rr2 = SO.clamp(op === 'rowBelow' ? r + 1 : r, 0, e.cells.length - 1), cc2 = SO.clamp(op === 'colRight' ? c + 1 : c, 0, e.cells[0].length - 1);
            if (node) { App.editing = null; C.startEdit(e.id, {}); C.editCell(node.querySelector('.ss-cell[data-r="' + rr2 + '"][data-c="' + cc2 + '"]'), { caret: 'end' }); }
        }
    };
    function removeEl(e) {
        var s = App.slide();
        s.els = s.els.filter(function (x) { return x !== e; });
        App.sel = [];
    }

    // Pegangan lebar kolom tabel.
    var baseDraw = App.drawOverlay;
    App.drawOverlay = function () {
        baseDraw();
        var sel = App.selected();
        if (sel.length !== 1 || sel[0].type !== 'table' || sel[0].locked || sel[0].rot) return;
        var e = sel[0], z = App.zoom, acc = 0;
        e.colW.slice(0, -1).forEach(function (w, i) {
            acc += w;
            var h = SO.el('div', { class: 'ss-col-handle', dataset: { col: i }, style: { left: (e.x + e.w * acc) * z + 'px', top: e.y * z + 'px', height: e.h * z + 'px' } });
            App.el.overlay.appendChild(h);
        });
    };
    App.el.overlay.addEventListener('pointerdown', function (ev) {
        var h = ev.target.closest('.ss-col-handle');
        if (!h) return;
        ev.preventDefault();
        ev.stopPropagation();
        var e = App.selected()[0];
        var i = +h.dataset.col;
        var start = ev.clientX, orig = e.colW.slice();
        h.setPointerCapture(ev.pointerId);
        var move = function (mv) {
            var d = (mv.clientX - start) / App.zoom / e.w;
            var a = SO.clamp(orig[i] + d, 0.03, orig[i] + orig[i + 1] - 0.03);
            e.colW[i] = a;
            e.colW[i + 1] = orig[i] + orig[i + 1] - a;
            var node = App.nodeFor(e.id);
            if (node) SO.$$('col', node).forEach(function (col, k) { col.style.width = e.colW[k] * 100 + '%'; });
            h.style.left = (e.x + e.w * e.colW.slice(0, i + 1).reduce(function (x, y) { return x + y; }, 0)) * App.zoom + 'px';
        };
        var up = function () {
            h.removeEventListener('pointermove', move);
            h.removeEventListener('pointerup', up);
            var final = e.colW.slice();
            e.colW = orig;
            App.change('column-width', function () { e.colW = final; });
        };
        h.addEventListener('pointermove', move);
        h.addEventListener('pointerup', up);
    }, true);

    // ============================================================ grafik
    C.CHART_TYPES = [['column', 's_ch_column', 'fa-chart-column'], ['stacked', 's_ch_stacked', 'fa-chart-simple'], ['bar', 's_ch_bar', 'fa-chart-bar'], ['line', 's_ch_line', 'fa-chart-line'],
        ['area', 's_ch_area', 'fa-chart-area'], ['pie', 's_ch_pie', 'fa-chart-pie'], ['doughnut', 's_ch_doughnut', 'fa-circle-notch'], ['radar', 's_ch_radar', 'fa-bullseye'], ['scatter', 's_ch_scatter', 'fa-braille']];
    C.insertChart = function (kind) {
        var w = App.deck.size.w * 0.6, h = App.deck.size.h * 0.62;
        var p = centerBox(w, h);
        var e = M.chart(kind || 'column', p.x, p.y, w, h);
        e.data.series.forEach(function (s, i) { s.name = SO.t('s_series') + ' ' + (i + 1); });
        e.data.labels = [SO.t('s_category') + ' 1', SO.t('s_category') + ' 2', SO.t('s_category') + ' 3', SO.t('s_category') + ' 4'];
        if (kind === 'pie' || kind === 'doughnut') e.legend = 'right';
        insertEls('insert-chart', [e]);
        C.chartDataDialog(e.id);
    };
    C.chartOpt = function (key, value) {
        var els = App.selected().filter(function (e) { return e.type === 'chart'; });
        if (!els.length) return;
        App.change('chart-' + key, function () { els.forEach(function (e) { e[key] = value; }); });
    };
    function parseNum(v) {
        v = String(v).trim();
        if (!v) return null;
        if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
        else v = v.replace(',', '.');
        var n = parseFloat(v);
        return isNaN(n) ? null : n;
    }
    C.chartDataDialog = function (id) {
        var e = App.elById(id);
        if (!e) return;
        var draft = { chart: e.chart, title: e.title || '', legend: e.legend || 'bottom', labels: !!e.labels, data: M.clone(e.data) };
        SO.dialog({
            title: 's_edit_chart', width: 720,
            body: function (body) {
                var top = SO.el('div', { class: 'so-form-row' });
                var type = SO.el('select', { class: 'so-select' });
                C.CHART_TYPES.forEach(function (t) { type.appendChild(SO.el('option', { value: t[0], text: SO.t(t[1]) })); });
                type.value = draft.chart;
                type.addEventListener('change', function () { draft.chart = type.value; });
                var title = SO.el('input', { class: 'so-input', type: 'text', value: draft.title, placeholder: SO.t('s_chart_title_ph') });
                title.addEventListener('input', function () { draft.title = title.value; });
                var legend = SO.el('select', { class: 'so-select' });
                [['bottom', 's_legend_bottom'], ['right', 's_legend_right'], ['top', 's_legend_top'], ['left', 's_legend_left'], ['none', 's_legend_none']].forEach(function (x) { legend.appendChild(SO.el('option', { value: x[0], text: SO.t(x[1]) })); });
                legend.value = draft.legend;
                legend.addEventListener('change', function () { draft.legend = legend.value; });
                [[type, 's_chart_type'], [title, 's_chart_title'], [legend, 's_legend']].forEach(function (x) { var f = SO.el('div', { class: 'so-field' }); f.appendChild(SO.el('label', { text: SO.t(x[1]) })); f.appendChild(x[0]); top.appendChild(f); });
                body.appendChild(top);
                var lbl = SO.el('label', { class: 'so-field is-inline', style: { margin: '10px 0' } });
                var cb = SO.el('input', { type: 'checkbox' }); cb.checked = draft.labels;
                cb.addEventListener('change', function () { draft.labels = cb.checked; });
                lbl.appendChild(cb); lbl.appendChild(SO.el('span', { text: SO.t('s_data_labels') }));
                body.appendChild(lbl);
                var wrap = SO.el('div', { class: 'ss-data-grid' });
                body.appendChild(wrap);
                var tools = SO.el('div', { class: 'ss-btn-row' });
                [['s_add_row', 'fa-plus', function () { draft.data.labels.push(''); draft.data.series.forEach(function (s) { s.values.push(null); }); render(); }],
                    ['s_add_series', 'fa-plus', function () { draft.data.series.push({ name: SO.t('s_series') + ' ' + (draft.data.series.length + 1), values: draft.data.labels.map(function () { return null; }) }); render(); }],
                    ['s_remove_row', 'fa-minus', function () { if (draft.data.labels.length > 1) { draft.data.labels.pop(); draft.data.series.forEach(function (s) { s.values.pop(); }); render(); } }],
                    ['s_remove_series', 'fa-minus', function () { if (draft.data.series.length > 1) { draft.data.series.pop(); render(); } }],
                    ['s_paste_data', 'fa-paste', pasteData]
                ].forEach(function (b) { var x = SO.el('button', { type: 'button', class: 'so-btn is-sm', html: '<i class="fas ' + b[1] + '"></i> ' + SO.esc(SO.t(b[0])) }); x.addEventListener('click', b[2]); tools.appendChild(x); });
                body.appendChild(tools);
                function render() {
                    wrap.innerHTML = '';
                    var table = SO.el('table');
                    var head = SO.el('tr');
                    head.appendChild(SO.el('th'));
                    draft.data.series.forEach(function (s) {
                        var th = SO.el('th');
                        var i = SO.el('input', { type: 'text', value: s.name });
                        i.addEventListener('input', function () { s.name = i.value; });
                        th.appendChild(i);
                        head.appendChild(th);
                    });
                    table.appendChild(head);
                    draft.data.labels.forEach(function (l, r) {
                        var tr = SO.el('tr');
                        var th = SO.el('th');
                        var li = SO.el('input', { type: 'text', value: l });
                        li.addEventListener('input', function () { draft.data.labels[r] = li.value; });
                        th.appendChild(li);
                        tr.appendChild(th);
                        draft.data.series.forEach(function (s) {
                            var td = SO.el('td');
                            var vi = SO.el('input', { type: 'text', inputmode: 'decimal', value: s.values[r] == null ? '' : String(s.values[r]).replace('.', SO.lang() === 'id' ? ',' : '.') });
                            vi.addEventListener('input', function () { s.values[r] = parseNum(vi.value); });
                            td.appendChild(vi);
                            tr.appendChild(td);
                        });
                        table.appendChild(tr);
                    });
                    wrap.appendChild(table);
                }
                function pasteData() {
                    SO.form({ title: 's_paste_data', width: 520, intro: 's_paste_data_hint', fields: [{ name: 'tsv', type: 'textarea', rows: 10, value: '' }] }).then(function (v) {
                        if (!v || !v.tsv.trim()) return;
                        var lines = v.tsv.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return l.split(/\t|;/); });
                        if (lines.length < 2 || lines[0].length < 2) { SO.toast('s_paste_data_bad', { type: 'warn' }); return; }
                        draft.data.series = lines[0].slice(1).map(function (n, i) { return { name: n.trim(), values: lines.slice(1).map(function (row) { return parseNum(row[i + 1] || ''); }) }; });
                        draft.data.labels = lines.slice(1).map(function (row) { return row[0].trim(); });
                        render();
                    });
                }
                render();
            },
            buttons: [{ label: 'c_cancel', value: null }, { label: 'c_ok', primary: true, value: 'ok' }],
            enterSubmits: false
        }).then(function (v) {
            if (v !== 'ok') return;
            App.change('chart-data', function () { e.chart = draft.chart; e.title = draft.title; e.legend = draft.legend; e.labels = draft.labels; e.data = draft.data; });
        });
    };

    // ============================================================= ikon
    var ICONS = {
        s_ic_business: ['briefcase', 'chart-line', 'chart-pie', 'chart-column', 'arrow-trend-up', 'arrow-trend-down', 'coins', 'money-bill-wave', 'sack-dollar', 'handshake', 'building', 'city', 'store', 'cart-shopping', 'tag', 'percent', 'calculator', 'scale-balanced', 'gavel', 'bullseye', 'trophy', 'medal', 'award', 'rocket', 'lightbulb', 'puzzle-piece', 'chess', 'gauge-high', 'timeline', 'sitemap'],
        s_ic_people: ['user', 'users', 'user-tie', 'people-group', 'person-chalkboard', 'person-running', 'person-walking', 'graduation-cap', 'school', 'face-smile', 'face-frown', 'thumbs-up', 'thumbs-down', 'heart', 'hand', 'comments', 'comment-dots', 'bell', 'envelope', 'phone'],
        s_ic_tech: ['laptop', 'desktop', 'mobile-screen', 'tablet-screen-button', 'code', 'terminal', 'database', 'server', 'laptop-code', 'wifi', 'cloud', 'network-wired', 'code-branch', 'gear', 'gears', 'wrench', 'screwdriver-wrench', 'shield-halved', 'lock', 'key', 'keyboard', 'computer-mouse', 'camera', 'microphone', 'headphones', 'robot', 'microchip', 'satellite-dish', 'globe', 'link'],
        s_ic_nature: ['sun', 'moon', 'cloud', 'bolt', 'droplet', 'fire', 'leaf', 'tree', 'mountain', 'water', 'earth-asia', 'seedling', 'recycle', 'paw', 'dog', 'cat', 'fish', 'star', 'snowflake', 'wind'],
        s_ic_objects: ['house', 'car', 'bicycle', 'plane', 'truck', 'box', 'boxes-stacked', 'map', 'map-location-dot', 'compass', 'route', 'book', 'book-open', 'pencil', 'pen', 'clipboard-list', 'calendar-check', 'clock', 'hourglass-half', 'gift', 'cake-candles', 'music', 'utensils', 'mug-hot', 'pizza-slice', 'apple-whole', 'hospital', 'stethoscope', 'heart-pulse', 'pills', 'dna', 'flask', 'atom', 'brain'],
        s_ic_symbols: ['check', 'xmark', 'circle-check', 'circle-xmark', 'circle-exclamation', 'circle-info', 'circle-question', 'triangle-exclamation', 'flag', 'plus', 'minus', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'repeat', 'shuffle', 'infinity', 'quote-left', 'quote-right', 'magnifying-glass', 'filter', 'list-check', 'share-nodes', 'download', 'upload', 'print', 'eye', 'location-dot', 'hashtag']
    };
    C.ICONS = ICONS;
    C.iconDialog = function (replaceId) {
        var chosen = null;
        SO.dialog({
            title: replaceId ? 's_change_icon' : 's_insert_icon', width: 640,
            body: function (body, dlg) {
                var search = SO.el('input', { class: 'so-input', type: 'search', placeholder: SO.t('s_icon_search_ph'), style: { width: '100%', height: '34px', marginBottom: '10px' } });
                var chips = SO.el('div', { class: 'ss-chips' });
                var grid = SO.el('div', { class: 'ss-icon-grid' });
                var cat = 'all';
                var cats = [['all', 's_ic_all']].concat(Object.keys(ICONS).map(function (k) { return [k, k]; }));
                cats.forEach(function (c) {
                    var b = SO.el('button', { type: 'button', class: c[0] === cat ? 'is-active' : '', text: SO.t(c[1]) });
                    b.addEventListener('click', function () { cat = c[0]; SO.$$('button', chips).forEach(function (x) { x.classList.toggle('is-active', x === b); }); render(); });
                    chips.appendChild(b);
                });
                function render() {
                    grid.innerHTML = '';
                    var q = search.value.trim().toLowerCase();
                    var seen = {};
                    Object.keys(ICONS).forEach(function (k) {
                        if (cat !== 'all' && k !== cat) return;
                        ICONS[k].forEach(function (name) {
                            if (seen[name] || (q && name.indexOf(q) === -1 && SO.t(k).toLowerCase().indexOf(q) === -1)) return;
                            seen[name] = true;
                            var b = SO.el('button', { type: 'button', title: name, html: '<i class="fas fa-' + name + '"></i>' });
                            b.addEventListener('click', function () { chosen = name; SO.$$('button', grid).forEach(function (x) { x.classList.toggle('is-active', x === b); }); });
                            b.addEventListener('dblclick', function () { chosen = name; dlg.$('[data-primary]').click(); });
                            grid.appendChild(b);
                        });
                    });
                    if (!grid.children.length) grid.appendChild(SO.el('div', { class: 'so-empty-note', text: SO.t('s_no_results') }));
                }
                search.addEventListener('input', render);
                body.appendChild(search);
                body.appendChild(chips);
                body.appendChild(grid);
                render();
            },
            buttons: [{ label: 'c_cancel', value: null }, { label: replaceId ? 'c_ok' : 's_insert', primary: true, value: 'ok' }]
        }).then(function (v) {
            if (v !== 'ok' || !chosen) return;
            if (replaceId) { var e = App.elById(replaceId); if (e) App.change('icon', function () { e.icon = 'fa-' + chosen; }); return; }
            var s = 140, p = centerBox(s, s);
            insertEls('insert-icon', [M.icon('fa-' + chosen, p.x, p.y, s)]);
        });
    };

    // =========================================================== SmartArt
    C.SMARTART = [['process', 's_sa_process', 'fa-arrow-right-long'], ['cycle', 's_sa_cycle', 'fa-arrows-rotate'], ['list', 's_sa_list', 'fa-list-ul'], ['pyramid', 's_sa_pyramid', 'fa-mountain'],
        ['hierarchy', 's_sa_hierarchy', 'fa-sitemap'], ['matrix', 's_sa_matrix', 'fa-table-cells-large'], ['timeline', 's_sa_timeline', 'fa-timeline'], ['venn', 's_sa_venn', 'fa-circle-half-stroke']];
    function saShape(shape, x, y, w, h, text, accent, st) {
        var e = M.shape(shape, x, y, w, h);
        e.fill = { type: 'solid', color: 'theme:accent' + accent };
        e.line = { type: 'solid', color: 'theme:bg', w: 1.5 };
        e.html = text ? '<div>' + SO.esc(text) + '</div>' : '';
        e.st = Object.assign(e.st, { fs: 16, b: true }, st || {});
        return e;
    }
    C.insertSmartArt = function (kind) {
        var W = App.deck.size.w, H = App.deck.size.h;
        var t = function (i) { return SO.t('s_sa_item') + ' ' + i; };
        var els = [];
        var cx = W / 2, cy = H * 0.56;
        switch (kind) {
            case 'process':
                var n = 4, w = W * 0.2, h = H * 0.2, gap = -W * 0.015, x0 = (W - (n * w + (n - 1) * gap)) / 2;
                for (var i = 0; i < n; i++) els.push(saShape(i === 0 ? 'homePlate' : 'chevron', x0 + i * (w + gap), cy - h / 2, w, h, t(i + 1), (i % 6) + 1));
                break;
            case 'cycle':
                var r = H * 0.24, s = H * 0.19;
                for (var j = 0; j < 5; j++) {
                    var a = -Math.PI / 2 + j * 2 * Math.PI / 5;
                    els.push(saShape('ellipse', cx + Math.cos(a) * r - s / 2, cy + Math.sin(a) * r - s / 2, s, s, t(j + 1), (j % 6) + 1, { fs: 14 }));
                    var a2 = a + Math.PI / 5;
                    var arrow = M.shape('rightArrow', cx + Math.cos(a2) * r * 1.02 - 16, cy + Math.sin(a2) * r * 1.02 - 11, 32, 22);
                    arrow.rot = Math.round((a2 * 180 / Math.PI + 90 + 360) % 360);
                    arrow.fill = { type: 'solid', color: 'theme:muted' }; arrow.line = { type: 'none' };
                    els.push(arrow);
                }
                break;
            case 'list':
                for (var k = 0; k < 4; k++) {
                    els.push(saShape('roundRect', W * 0.2, H * 0.27 + k * H * 0.165, W * 0.14, H * 0.13, String(k + 1), (k % 6) + 1, { fs: 26 }));
                    var body = saShape('roundRect', W * 0.35, H * 0.27 + k * H * 0.165, W * 0.45, H * 0.13, t(k + 1), (k % 6) + 1, { align: 'left', b: false, color: 'theme:text' });
                    body.fill = { type: 'solid', color: 'theme:accent' + ((k % 6) + 1), opacity: 0.15 }; body.line = { type: 'none' };
                    els.push(body);
                }
                break;
            case 'pyramid':
                var levels = 4, ph = H * 0.62 / levels, base = W * 0.5;
                for (var p = 0; p < levels; p++) {
                    var wTop = base * p / levels, wBot = base * (p + 1) / levels;
                    var sh = saShape(p === 0 ? 'triangle' : 'trapezoid', cx - wBot / 2, H * 0.28 + p * ph, wBot, ph - 4, t(p + 1), (p % 6) + 1, { fs: 15 });
                    if (p > 0) sh.adj = (wBot - wTop) / 2 / Math.min(wBot, ph);
                    els.push(sh);
                }
                break;
            case 'hierarchy':
                var bw = W * 0.17, bh = H * 0.12, topY = H * 0.26;
                els.push(saShape('roundRect', cx - bw / 2, topY, bw, bh, t(1), 1));
                var ly = topY + bh + H * 0.06, left = W * 0.19, span = W * 0.62 - bw;
                els.push(lineEl(cx, topY + bh, cx, ly));
                els.push(lineEl(left + bw / 2, ly, left + span + bw / 2, ly));
                for (var q = 0; q < 3; q++) {
                    var kx = left + q * span / 2;
                    els.push(lineEl(kx + bw / 2, ly, kx + bw / 2, ly + H * 0.06));
                    els.push(saShape('roundRect', kx, ly + H * 0.06, bw, bh, t(q + 2), 2));
                }
                break;
            case 'matrix':
                var mw = W * 0.26, mh = H * 0.28;
                for (var m = 0; m < 4; m++) els.push(saShape('roundRect', cx - mw - 6 + (m % 2) * (mw + 12), H * 0.24 + Math.floor(m / 2) * (mh + 12), mw, mh, t(m + 1), m + 1, { fs: 20 }));
                break;
            case 'timeline':
                els.push(lineEl(W * 0.08, cy, W * 0.92, cy, 'arrow'));
                for (var d = 0; d < 5; d++) {
                    var dx = W * 0.14 + d * W * 0.18;
                    els.push(saShape('ellipse', dx - 14, cy - 14, 28, 28, '', (d % 6) + 1));
                    var lab = M.textBox(dx - W * 0.08, d % 2 ? cy + 26 : cy - 96, W * 0.16, 70, '<div><b>' + (2022 + d) + '</b></div><div>' + SO.esc(t(d + 1)) + '</div>', { align: 'center', fs: 14, valign: d % 2 ? 'top' : 'bottom' });
                    lab.autofit = 'none';
                    els.push(lab);
                }
                break;
            case 'venn':
                var vr = H * 0.25;
                [[cx - vr * 0.6, cy - vr * 0.35], [cx + vr * 0.6, cy - vr * 0.35], [cx, cy + vr * 0.55]].forEach(function (c, i) {
                    var v = saShape('ellipse', c[0] - vr, c[1] - vr, vr * 2, vr * 2, t(i + 1), i + 1, { valign: i === 2 ? 'bottom' : 'top', fs: 18 });
                    v.fill.opacity = 0.55;
                    v.inset = { l: 30, r: 30, t: i === 2 ? 20 : 60, b: i === 2 ? 60 : 20 };
                    els.push(v);
                });
                break;
        }
        insertEls('insert-smartart', els);
    };
    function lineEl(x1, y1, x2, y2, arrow) {
        var l = M.line(x1, y1, x2, y2, arrow);
        l.line.color = 'theme:muted';
        l.line.w = 2;
        return l;
    }

    // ============================================================ simbol
    var SYMBOLS = '© ® ™ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ √ ∑ ∏ ∫ ∂ ∆ ∇ π Ω µ α β γ δ ε θ λ σ φ ψ ω € £ ¥ ₹ ₩ Rp ¢ § ¶ • · … ← → ↑ ↓ ↔ ⇒ ⇔ ★ ☆ ✓ ✗ ♥ ♦ ♣ ♠ ☀ ☁ ☂ ☎ ✉ ✈ ⚑ ⚠ ♪ ♫ ½ ¼ ¾ ¹ ² ³ ‰ ∈ ∉ ∩ ∪ ⊂ ⊃ ∀ ∃ ¬ ∧ ∨ “ ” ‘ ’ « » — – ‹ › ¿ ¡'.split(' ');
    C.symbolDialog = function () {
        var sel = window.getSelection();
        var saved = App.editing && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        SO.dialog({
            title: 's_symbol', width: 520,
            body: function (body, dlg) {
                var grid = SO.el('div', { class: 'ss-symbol-grid' });
                SYMBOLS.forEach(function (ch) {
                    var b = SO.el('button', { type: 'button', text: ch });
                    b.addEventListener('click', function () {
                        dlg.close(null);
                        if (App.editing && saved) { App.editing.tx.focus(); sel.removeAllRanges(); sel.addRange(saved); }
                        C.insertSymbolText(ch);
                    });
                    grid.appendChild(b);
                });
                body.appendChild(grid);
            },
            buttons: [{ label: 'c_close', value: null }]
        });
    };

    // ========================================================= persamaan
    var EQ_PRESETS = [['s_eq_quadratic', 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}'], ['s_eq_pythagoras', 'a^2 + b^2 = c^2'], ['s_eq_sum', '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}'], ['s_eq_integral', '\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)'],
        ['s_eq_euler', 'e^{i\\pi} + 1 = 0'], ['s_eq_binomial', '(x+y)^n = \\sum_{k=0}^{n} \\binom{n}{k} x^{n-k} y^k'], ['s_eq_matrix', 'A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'], ['s_eq_limit', '\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1']];
    C.equationDialog = function (id) {
        var e = id ? App.elById(id) : null;
        var latex = e ? e.latex : EQ_PRESETS[0][1];
        SO.dialog({
            title: e ? 's_edit_equation' : 's_insert_equation', width: 620,
            body: function (body) {
                var chips = SO.el('div', { class: 'ss-chips' });
                var ta = SO.el('textarea', { class: 'so-input ss-latex', rows: 3, spellcheck: 'false' });
                ta.value = latex;
                var prev = SO.el('div', { class: 'ss-eq-preview' });
                EQ_PRESETS.forEach(function (p) {
                    var b = SO.el('button', { type: 'button', text: SO.t(p[0]) });
                    b.addEventListener('click', function () { ta.value = p[1]; draw(); });
                    chips.appendChild(b);
                });
                function draw() {
                    latex = ta.value;
                    SO.load('katex').then(function (k) {
                        try { k.render(latex || '\\;', prev, { throwOnError: false, displayMode: true }); } catch (err) { prev.textContent = err.message; }
                    }).catch(function () { prev.textContent = latex; });
                }
                ta.addEventListener('input', SO.debounce(draw, 150));
                body.appendChild(chips);
                body.appendChild(SO.el('div', { class: 'so-field-hint', text: SO.t('s_latex_hint'), style: { margin: '8px 0 4px' } }));
                body.appendChild(ta);
                body.appendChild(prev);
                draw();
            },
            buttons: [{ label: 'c_cancel', value: null }, { label: e ? 'c_ok' : 's_insert', primary: true, value: 'ok' }],
            enterSubmits: false
        }).then(function (v) {
            if (v !== 'ok' || !latex.trim()) return;
            SO.load('katex').catch(function () {}).then(function () {
                var fs = e ? e.st.fs : 32;
                var probe = SO.el('div', { class: 'ss-math', style: { position: 'fixed', left: '-9999px', top: '0', fontSize: fs + 'pt', whiteSpace: 'nowrap' } });
                document.body.appendChild(probe);
                try { global.katex.render(latex, probe, { throwOnError: false, displayMode: true }); } catch (err) { probe.textContent = latex; }
                var w = Math.ceil(probe.scrollWidth) + 24, h = Math.ceil(probe.scrollHeight) + 16;
                probe.remove();
                if (e) { App.change('equation', function () { e.latex = latex; e.w = Math.max(e.w, w); e.h = Math.max(40, h); }); return; }
                var p = centerBox(w, h);
                var m = M.math(latex, p.x, p.y, w, h);
                m.st.fs = fs;
                insertEls('insert-equation', [m]);
            });
        });
    };

    // ============================================================ video
    C.videoDialog = function (id) {
        var e = id ? App.elById(id) : null;
        SO.form({
            title: e ? 's_edit_video' : 's_insert_video', width: 480, intro: 's_video_intro',
            fields: [{ name: 'url', label: 's_video_url', type: 'text', value: e ? e.url : '', placeholder: 'https://www.youtube.com/watch?v=…' }],
            validate: function (v) { return /^https?:\/\/\S+$/i.test(v.url.trim()) ? null : 's_video_bad_url'; }
        }).then(function (v) {
            if (!v) return;
            if (e) { App.change('video', function () { e.url = v.url.trim(); }); return; }
            C.insertVideo(v.url.trim());
        });
    };
    C.insertVideo = function (url) {
        var w = App.deck.size.w * 0.6, h = w * 9 / 16;
        var p = centerBox(w, h);
        insertEls('insert-video', [M.video(url, p.x, p.y, w, h)]);
    };
})(window);
