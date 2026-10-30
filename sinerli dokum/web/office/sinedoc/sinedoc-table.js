/**
 * Sinerli Dokum — alat tabel, status ribbon, menu konteks, panel, dan mode tampilan.
 */
(function (global) {
    'use strict';

    var App = global.SineDoc;
    var C = App.cmd;
    var editor = App.editor;

    // ========================================================== grid tabel
    function realRows(table) {
        return Array.prototype.filter.call(table.rows, function (r) { return !r.classList.contains('sd-row-gap') && r.closest('table') === table; });
    }

    function grid(table) {
        var rows = realRows(table);
        var g = rows.map(function () { return []; });
        rows.forEach(function (row, r) {
            var c = 0;
            Array.prototype.forEach.call(row.cells, function (cell) {
                while (g[r][c]) c++;
                for (var dr = 0; dr < (cell.rowSpan || 1); dr++) {
                    if (!g[r + dr]) continue;
                    for (var dc = 0; dc < (cell.colSpan || 1); dc++) g[r + dr][c + dc] = cell;
                }
                c += cell.colSpan || 1;
            });
        });
        var cols = g.reduce(function (m, row) { return Math.max(m, row.length); }, 0);
        return { rows: rows, g: g, cols: cols };
    }

    function posOf(G, cell) {
        for (var r = 0; r < G.g.length; r++) for (var c = 0; c < G.g[r].length; c++) if (G.g[r][c] === cell) return { r: r, c: c };
        return { r: 0, c: 0 };
    }

    function currentCell() {
        var r = App.range();
        return r ? App.closestInEditor(r.startContainer, 'td,th') : null;
    }
    C.currentCell = currentCell;

    function newCell(tag) {
        var c = document.createElement(tag || 'td');
        c.innerHTML = '<br>';
        return c;
    }

    function tableOp(fn) {
        var cell = currentCell();
        if (!cell) { SO.toast('d_not_in_table', { type: 'warn' }); return; }
        var table = cell.closest('table');
        App.change(function () {
            SDLayout.removeGaps(table);
            fn(cell, table, grid(table));
        });
    }

    C.tableTab = function (cell, back) {
        var table = cell.closest('table');
        var cells = SO.$$('td,th', table).filter(function (c) { return c.closest('table') === table && !c.closest('tr.sd-row-gap'); });
        var i = cells.indexOf(cell);
        var target = cells[i + (back ? -1 : 1)];
        if (!target && !back) {
            C.rowInsert(false);
            var cellsAfter = SO.$$('td,th', table).filter(function (c) { return c.closest('table') === table && !c.closest('tr.sd-row-gap'); });
            target = cellsAfter[i + 1];
        }
        if (target) {
            var r = document.createRange();
            r.selectNodeContents(target);
            getSelection().removeAllRanges();
            getSelection().addRange(r);
            App.rememberRange();
        }
    };

    C.rowInsert = function (above) {
        tableOp(function (cell, table, G) {
            var p = posOf(G, cell);
            var target = above ? p.r : p.r + (cell.rowSpan || 1) - 1;
            var ref = G.rows[target];
            var tr = document.createElement('tr');
            var done = new Set();
            for (var c = 0; c < G.cols; c++) {
                var gc = G.g[target][c];
                if (!gc) { tr.appendChild(newCell('td')); continue; }
                if (done.has(gc)) continue;
                var gp = posOf(G, gc);
                var spans = above ? gp.r < target : gp.r + gc.rowSpan - 1 > target;
                if (spans) { gc.rowSpan += 1; done.add(gc); c += gc.colSpan - 1; continue; }
                var nc = newCell(gc.tagName === 'TH' && !above ? 'td' : gc.tagName.toLowerCase());
                if (gc.colSpan > 1) nc.colSpan = gc.colSpan;
                tr.appendChild(nc);
                done.add(gc);
                c += gc.colSpan - 1;
            }
            if (above) ref.before(tr); else ref.after(tr);
            if (tr.cells[0]) C.placeCaret(tr.cells[0]);
        });
    };

    C.colInsert = function (left) {
        tableOp(function (cell, table, G) {
            var p = posOf(G, cell);
            var target = left ? p.c : p.c + (cell.colSpan || 1) - 1;
            var done = new Set();
            for (var r = 0; r < G.rows.length; r++) {
                var gc = G.g[r][target];
                if (!gc) { G.rows[r].appendChild(newCell('td')); continue; }
                if (done.has(gc)) continue;
                done.add(gc);
                var gp = posOf(G, gc);
                var spans = left ? gp.c < target : gp.c + gc.colSpan - 1 > target;
                if (spans) { gc.colSpan += 1; continue; }
                var nc = newCell(gc.tagName.toLowerCase());
                if (gc.rowSpan > 1) nc.rowSpan = gc.rowSpan;
                if (left) gc.before(nc); else gc.after(nc);
            }
            SO.$$('td,th', table).forEach(function (c) { if (c.style.width) c.style.width = ''; });
        });
    };

    C.rowDelete = function () {
        tableOp(function (cell, table, G) {
            var p = posOf(G, cell);
            var r = p.r;
            if (G.rows.length === 1) { table.remove(); return; }
            var row = G.rows[r];
            var done = new Set();
            for (var c = 0; c < G.cols; c++) {
                var gc = G.g[r][c];
                if (!gc || done.has(gc)) continue;
                done.add(gc);
                var gp = posOf(G, gc);
                if (gp.r < r) { gc.rowSpan -= 1; continue; }
                if (gc.rowSpan > 1 && G.rows[r + 1]) {
                    // Sel yang merentang ke bawah dipindah ke baris berikutnya.
                    gc.rowSpan -= 1;
                    var nextRow = G.rows[r + 1];
                    var before = null;
                    Array.prototype.some.call(nextRow.cells, function (nc) { if (posOf(G, nc).c > gp.c) { before = nc; return true; } return false; });
                    nextRow.insertBefore(gc, before);
                }
            }
            row.remove();
            var focus = G.rows[r + 1] || G.rows[r - 1];
            if (focus && focus.cells[0]) C.placeCaret(focus.cells[0]);
        });
    };

    C.colDelete = function () {
        tableOp(function (cell, table, G) {
            var p = posOf(G, cell);
            if (G.cols === 1) { table.remove(); return; }
            var done = new Set();
            for (var r = 0; r < G.rows.length; r++) {
                var gc = G.g[r][p.c];
                if (!gc || done.has(gc)) continue;
                done.add(gc);
                if (gc.colSpan > 1) gc.colSpan -= 1; else gc.remove();
            }
            G.rows.forEach(function (row) { if (!row.cells.length) row.remove(); });
            if (!realRows(table).length) table.remove();
            SO.$$('td,th', table).forEach(function (c) { c.style.width = ''; });
        });
    };

    C.tableDelete = function () {
        var cell = currentCell();
        if (!cell) return;
        var table = cell.closest('table');
        App.change(function () {
            var next = table.nextElementSibling || table.previousElementSibling;
            table.remove();
            if (next) C.placeCaret(next);
        });
    };

    C.tableSelect = function () {
        var cell = currentCell();
        if (!cell) return;
        var table = cell.closest('table');
        var cells = SO.$$('td,th', table);
        App.cellSel = { table: table, cells: cells };
        cells.forEach(function (c) { c.classList.add('sd-cell-sel'); });
    };

    function selectedCells() {
        if (App.cellSel && App.cellSel.cells && App.cellSel.cells[0] && App.cellSel.cells[0].isConnected) return App.cellSel.cells;
        var c = currentCell();
        return c ? [c] : [];
    }
    C.selectedCells = selectedCells;

    C.clearCellSel = function () {
        SO.$$('.sd-cell-sel', editor).forEach(function (c) { c.classList.remove('sd-cell-sel'); });
        App.cellSel = null;
    };

    C.merge = function () {
        var cells = selectedCells();
        if (cells.length < 2) { SO.toast('d_merge_hint', { type: 'warn' }); return; }
        var table = cells[0].closest('table');
        App.change(function () {
            SDLayout.removeGaps(table);
            var G = grid(table);
            var r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
            cells.forEach(function (cell) {
                var p = posOf(G, cell);
                r1 = Math.min(r1, p.r); c1 = Math.min(c1, p.c);
                r2 = Math.max(r2, p.r + cell.rowSpan - 1); c2 = Math.max(c2, p.c + cell.colSpan - 1);
            });
            var inRect = new Set();
            for (var r = r1; r <= r2; r++) for (var c = c1; c <= c2; c++) if (G.g[r] && G.g[r][c]) inRect.add(G.g[r][c]);
            var target = G.g[r1][c1];
            inRect.forEach(function (cell) {
                if (cell === target) return;
                if (cell.textContent.trim() || cell.querySelector('img,table')) {
                    if (target.textContent.trim()) target.appendChild(document.createElement('br'));
                    while (cell.firstChild) target.appendChild(cell.firstChild);
                }
                cell.remove();
            });
            target.colSpan = c2 - c1 + 1;
            target.rowSpan = r2 - r1 + 1;
            SO.$$('br', target).forEach(function (br) { if (br === target.firstChild && target.childNodes.length > 1) br.remove(); });
            // Baris yang kosong setelah digabung dihapus agar tidak ada baris "hantu".
            realRows(table).forEach(function (row, idx) {
                if (row.cells.length) return;
                var G2 = grid(table);
                var seen = new Set();
                (G2.g[idx] || []).forEach(function (gc) { if (gc && !seen.has(gc)) { seen.add(gc); gc.rowSpan = Math.max(1, gc.rowSpan - 1); } });
                row.remove();
            });
            C.clearCellSel();
            C.placeCaret(target);
        });
    };

    C.split = function () {
        var cell = currentCell();
        if (!cell) return;
        if (cell.colSpan === 1 && cell.rowSpan === 1) {
            SO.form({
                title: 'd_split_cell',
                fields: [{ type: 'row', fields: [{ name: 'cols', label: 'd_columns', type: 'number', min: 1, max: 10, value: 2 }, { name: 'rows', label: 'd_rows', type: 'number', min: 1, max: 1, value: 1 }] }]
            }).then(function (v) {
                if (!v || (v.cols || 1) < 2) return;
                tableOp(function (c, table, G) {
                    var p = posOf(G, c);
                    var n = v.cols;
                    // Sel lain di kolom yang sama melebar supaya grid tetap rapi.
                    var done = new Set([c]);
                    for (var r = 0; r < G.rows.length; r++) {
                        var gc = G.g[r][p.c];
                        if (gc && !done.has(gc)) { gc.colSpan += n - 1; done.add(gc); }
                    }
                    for (var i = 1; i < n; i++) c.after(newCell(c.tagName.toLowerCase()));
                });
            });
            return;
        }
        tableOp(function (c, table, G) {
            var p = posOf(G, c);
            var rs = c.rowSpan, cs = c.colSpan;
            c.rowSpan = 1;
            c.colSpan = 1;
            for (var dc = 1; dc < cs; dc++) c.after(newCell(c.tagName.toLowerCase()));
            for (var dr = 1; dr < rs; dr++) {
                var row = G.rows[p.r + dr];
                if (!row) continue;
                var before = null;
                Array.prototype.some.call(row.cells, function (x) { if (posOf(G, x).c > p.c) { before = x; return true; } return false; });
                for (var k = 0; k < cs; k++) row.insertBefore(newCell(c.tagName.toLowerCase()), before);
            }
        });
    };

    C.headerRow = function () {
        tableOp(function (cell, table, G) {
            var first = G.rows[0];
            var toTh = Array.prototype.some.call(first.cells, function (c) { return c.tagName === 'TD'; });
            Array.prototype.slice.call(first.cells).forEach(function (c) {
                var n = document.createElement(toTh ? 'th' : 'td');
                Array.prototype.forEach.call(c.attributes, function (a) { n.setAttribute(a.name, a.value); });
                while (c.firstChild) n.appendChild(c.firstChild);
                c.replaceWith(n);
            });
        });
    };

    C.tableBorders = function () { tableOp(function (cell, table) { table.classList.toggle('sd-noborder'); if (!table.className) table.removeAttribute('class'); }); };

    C.cellShading = function (color) {
        var cells = selectedCells();
        if (!cells.length) return;
        App.change(function () { cells.forEach(function (c) { c.style.backgroundColor = color || ''; if (!c.getAttribute('style')) c.removeAttribute('style'); }); });
    };

    C.cellVAlign = function (v) {
        var cells = selectedCells();
        App.change(function () { cells.forEach(function (c) { c.style.verticalAlign = v === 'top' ? '' : v; if (!c.getAttribute('style')) c.removeAttribute('style'); }); });
    };

    C.distributeCols = function () {
        tableOp(function (cell, table, G) {
            SO.$$('td,th', table).forEach(function (c) { c.style.width = ''; if (!c.getAttribute('style')) c.removeAttribute('style'); });
            table.style.tableLayout = '';
        });
    };

    C.autofit = function (mode) {
        tableOp(function (cell, table) {
            if (mode === 'content') { table.style.tableLayout = 'auto'; table.style.width = 'auto'; }
            else { table.style.tableLayout = ''; table.style.width = ''; }
            if (!table.getAttribute('style')) table.removeAttribute('style');
        });
    };

    var TABLE_STYLES = {
        plain: null,
        blue: { head: '#2B579A', headText: '#FFFFFF', band: '#DAE3F3' },
        green: { head: '#1D7044', headText: '#FFFFFF', band: '#E2EFDA' },
        orange: { head: '#C55A11', headText: '#FFFFFF', band: '#FBE5D6' },
        gray: { head: '#595959', headText: '#FFFFFF', band: '#EDEDED' },
        light: { head: '#F2F2F2', headText: '#000000', band: '#FAFAFA' }
    };
    C.TABLE_STYLES = TABLE_STYLES;

    C.tableStyle = function (name) {
        var st = TABLE_STYLES[name];
        tableOp(function (cell, table, G) {
            G.rows.forEach(function (row, ri) {
                Array.prototype.slice.call(row.cells).forEach(function (c) {
                    c.style.backgroundColor = '';
                    c.style.color = '';
                    if (!st) { if (!c.getAttribute('style')) c.removeAttribute('style'); return; }
                    if (ri === 0) {
                        if (c.tagName === 'TD') {
                            var th = document.createElement('th');
                            Array.prototype.forEach.call(c.attributes, function (a) { th.setAttribute(a.name, a.value); });
                            while (c.firstChild) th.appendChild(c.firstChild);
                            c.replaceWith(th);
                            c = th;
                        }
                        c.style.backgroundColor = st.head;
                        c.style.color = st.headText;
                    } else if (ri % 2 === 0) {
                        c.style.backgroundColor = st.band;
                    }
                    if (!c.getAttribute('style')) c.removeAttribute('style');
                });
            });
        });
    };

    C.tableProps = function () {
        var cell = currentCell();
        if (!cell) return;
        var table = cell.closest('table');
        var tw = table.style.width || '100%';
        SO.form({
            title: 'd_table_props',
            fields: [
                { type: 'row', fields: [
                    { name: 'width', label: 'd_table_width_pct', type: 'number', min: 10, max: 100, value: /%$/.test(tw) ? parseFloat(tw) : 100 },
                    { name: 'align', label: 'd_alignment', type: 'select', value: table.style.marginLeft === 'auto' && table.style.marginRight === 'auto' ? 'center' : table.style.marginLeft === 'auto' ? 'right' : 'left', options: [{ value: 'left', label: 'd_align_left' }, { value: 'center', label: 'd_align_center' }, { value: 'right', label: 'd_align_right' }] }
                ] },
                { type: 'row', fields: [
                    { name: 'cellWidth', label: 'd_cell_width_pct', type: 'number', min: 0, max: 100, value: parseFloat(cell.style.width) || '' },
                    { name: 'pad', label: 'd_cell_padding', type: 'number', min: 0, max: 30, value: parseFloat(cell.style.padding) || '' }
                ] },
                { name: 'border', label: 'd_show_borders', type: 'checkbox', value: !table.classList.contains('sd-noborder') }
            ]
        }).then(function (v) {
            if (!v) return;
            App.change(function () {
                table.style.width = v.width && v.width < 100 ? v.width + '%' : '';
                table.style.marginLeft = v.align === 'center' || v.align === 'right' ? 'auto' : '';
                table.style.marginRight = v.align === 'center' ? 'auto' : '';
                table.classList.toggle('sd-noborder', !v.border);
                if (!table.className) table.removeAttribute('class');
                var G = grid(table);
                var p = posOf(G, cell);
                G.rows.forEach(function (row, r) {
                    var gc = G.g[r][p.c];
                    if (gc && gc.colSpan === 1) gc.style.width = v.cellWidth ? v.cellWidth + '%' : '';
                });
                SO.$$('td,th', table).forEach(function (c) {
                    c.style.padding = v.pad ? v.pad + 'px' : '';
                    if (!c.getAttribute('style')) c.removeAttribute('style');
                });
                if (!table.getAttribute('style')) table.removeAttribute('style');
            });
        });
    };

    // Seleksi sel dengan seret mouse.
    (function cellDragSelection() {
        var anchor = null;
        editor.addEventListener('mousedown', function (e) {
            C.clearCellSel();
            anchor = e.button === 0 ? e.target.closest && e.target.closest('td,th') : null;
            if (anchor && !editor.contains(anchor)) anchor = null;
        });
        editor.addEventListener('mousemove', function (e) {
            if (!anchor || !(e.buttons & 1)) return;
            var over = e.target.closest && e.target.closest('td,th');
            if (!over || over === anchor || over.closest('table') !== anchor.closest('table')) {
                if (over === anchor && App.cellSel) C.clearCellSel();
                return;
            }
            var table = anchor.closest('table');
            var G = grid(table);
            var a = posOf(G, anchor), b = posOf(G, over);
            var r1 = Math.min(a.r, b.r), r2 = Math.max(a.r, b.r), c1 = Math.min(a.c, b.c), c2 = Math.max(a.c, b.c);
            var set = new Set();
            for (var r = r1; r <= r2; r++) for (var c = c1; c <= c2; c++) if (G.g[r] && G.g[r][c]) set.add(G.g[r][c]);
            SO.$$('.sd-cell-sel', table).forEach(function (x) { if (!set.has(x)) x.classList.remove('sd-cell-sel'); });
            set.forEach(function (x) { x.classList.add('sd-cell-sel'); });
            App.cellSel = { table: table, cells: Array.from(set) };
        });
        document.addEventListener('mouseup', function () { anchor = null; });
    })();

    // Pegangan ubah lebar kolom.
    (function columnResize() {
        var handles = [];
        var activeTable = null;
        var dragging = false;
        function clear() { handles.forEach(function (h) { h.remove(); }); handles = []; activeTable = null; }
        function show(table) {
            if (dragging) return;
            clear();
            var G = grid(table);
            var first = G.rows[0];
            if (!first || Array.prototype.some.call(first.cells, function (c) { return c.colSpan > 1; }) || first.cells.length < 2) return;
            activeTable = table;
            var cr = App.canvas.getBoundingClientRect();
            var tr = table.getBoundingClientRect();
            var cells = Array.prototype.slice.call(first.cells);
            cells.slice(0, -1).forEach(function (cell, i) {
                var r = cell.getBoundingClientRect();
                var h = SO.el('div', { class: 'sd-colresize' });
                h.style.left = ((r.right - cr.left) / App.zoom) + 'px';
                h.style.top = ((tr.top - cr.top) / App.zoom) + 'px';
                h.style.height = (tr.height / App.zoom) + 'px';
                h.addEventListener('pointerdown', function (e) { startDrag(e, h, table, cells, i); });
                App.overlay.appendChild(h);
                handles.push(h);
            });
        }
        function startDrag(e, h, table, cells, i) {
            e.preventDefault();
            dragging = true;
            h.classList.add('is-drag');
            h.setPointerCapture(e.pointerId);
            var tableW = table.getBoundingClientRect().width;
            var widths = cells.map(function (c) { return c.getBoundingClientRect().width; });
            var startX = e.clientX;
            if (!App.lastSnap) App.lastSnap = App.takeSnap();
            function move(ev) {
                var dx = ev.clientX - startX;
                var a = Math.max(24 * App.zoom, widths[i] + dx);
                var b = Math.max(24 * App.zoom, widths[i] + widths[i + 1] - a);
                a = widths[i] + widths[i + 1] - b;
                cells.forEach(function (c, k) {
                    var w = k === i ? a : k === i + 1 ? b : widths[k];
                    c.style.width = (w / tableW * 100).toFixed(2) + '%';
                });
                var cr = App.canvas.getBoundingClientRect();
                h.style.left = ((cells[i].getBoundingClientRect().right - cr.left) / App.zoom) + 'px';
            }
            function up() {
                h.removeEventListener('pointermove', move);
                h.removeEventListener('pointerup', up);
                dragging = false;
                clear();
                App.afterChange();
            }
            h.addEventListener('pointermove', move);
            h.addEventListener('pointerup', up);
        }
        editor.addEventListener('mouseover', function (e) {
            var t = e.target.closest && e.target.closest('table');
            if (t && editor.contains(t) && t !== activeTable) show(t);
        });
        App.scroller.addEventListener('mouseleave', function () { if (!dragging) clear(); });
        document.addEventListener('keydown', function () { if (!dragging) clear(); });
        App.scroller.addEventListener('scroll', function () { if (!dragging) clear(); });
    })();

    // ======================================================= ribbon state
    function qs(cmd) { try { return document.queryCommandState(cmd); } catch (e) { return false; } }

    C.updateRibbon = function () {
        var rb = App.ribbon;
        if (!rb) return;
        var r = App.range();
        rb.setDisabled('undo', !App.history.canUndo());
        rb.setDisabled('redo', !App.history.canRedo());
        rb.setActive('showMarks', !!App.settings.showMarks);
        rb.setActive('track', App.track);
        rb.setActive('spell', App.settings.spellcheck !== false);
        rb.setActive('readOnly', App.readOnly);
        rb.setActive('ruler', !document.getElementById('sdRulerWrap').classList.contains('is-hidden'));
        rb.setActive('navPane', !document.getElementById('sdNavPane').hidden);
        rb.setActive('commentPane', !document.getElementById('sdCommentPane').hidden);
        rb.setActive('painter', !!App.painter);
        rb.setActive('orientation', App.settings.orientation === 'landscape');
        if (!r) return;
        var inEditorFocus = App.inEditor(getSelection().anchorNode);
        if (inEditorFocus) {
            ['bold', 'italic', 'underline', 'strikeThrough', 'subscript', 'superscript'].forEach(function (c) { rb.setActive(c, qs(c)); });
        }
        var node = r.startContainer.nodeType === 1 ? (r.startContainer.childNodes[r.startOffset] && r.startContainer.childNodes[r.startOffset].nodeType === 1 ? r.startContainer.childNodes[r.startOffset] : r.startContainer) : r.startContainer.parentNode;
        if (!node || !App.inEditor(node)) return;
        var cs = getComputedStyle(node);
        var fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
        rb.setValue('fontName', fam, fam);
        rb.setValue('fontSize', Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2);
        var block = App.closestInEditor(node, 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th,div') || node;
        var ta = getComputedStyle(block).textAlign;
        if (ta === 'start') ta = 'left';
        ['left', 'center', 'right', 'justify'].forEach(function (a) { rb.setActive('align_' + a, ta === a); });
        var li = App.closestInEditor(node, 'li');
        var list = li && li.parentNode;
        rb.setActive('bullets', !!(list && list.tagName === 'UL' && !list.classList.contains('sd-checklist')));
        rb.setActive('numbering', !!(list && list.tagName === 'OL'));
        rb.setActive('checklist', !!(list && list.classList.contains('sd-checklist')));
        rb.setValue('blockStyle', C.currentBlockStyle());
        var lh = block.style ? block.style.lineHeight : '';
        rb.setValue('lineSpacing', lh);
        var inTable = !!App.closestInEditor(node, 'td,th');
        rb.showContextual('table', inTable, false);
        rb.showContextual('picture', !!App.selectedImg, true);
        if (App.cmd.onSelectionForComments) App.cmd.onSelectionForComments(node);
    };

    // ======================================================= context menu
    C.clipboard = function (action) {
        App.restoreRange();
        if (action === 'cut' || action === 'copy') {
            var ok = C.exec(action);
            if (!ok) SO.toast('d_clipboard_hint', { type: 'warn', vars: { key: SO.keyLabel(action === 'cut' ? 'Mod+X' : 'Mod+C') } });
            else if (action === 'cut') App.afterChange();
            return;
        }
        var plain = action === 'pastePlain';
        if (navigator.clipboard && navigator.clipboard.read && !plain) {
            navigator.clipboard.read().then(function (items) {
                var item = items[0];
                if (!item) return;
                var type = item.types.indexOf('text/html') !== -1 ? 'text/html' : item.types.filter(function (t) { return /^image\//.test(t); })[0] || (item.types.indexOf('text/plain') !== -1 ? 'text/plain' : null);
                if (!type) return;
                return item.getType(type).then(function (blob) {
                    if (/^image\//.test(type)) return App.insertImageFiles([new File([blob], 'paste', { type: type })]);
                    return blob.text().then(function (txt) {
                        App.restoreRange();
                        App.change(function () {
                            if (type === 'text/html') {
                                var tmp = document.createElement('div');
                                tmp.innerHTML = SDIO.sanitize(txt, { trusted: /class="sd-/.test(txt) });
                                App.adoptImages(tmp);
                                C.exec('insertHTML', tmp.innerHTML);
                            } else C.exec('insertText', txt);
                        });
                    });
                });
            }).catch(function () { SO.toast('d_clipboard_hint', { type: 'warn', vars: { key: SO.keyLabel('Mod+V') } }); });
            return;
        }
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(function (txt) {
                App.restoreRange();
                App.change(function () {
                    if (txt.indexOf('\n') === -1) C.exec('insertText', txt);
                    else C.exec('insertHTML', SDIO.textToHtml(txt));
                });
            }).catch(function () { SO.toast('d_clipboard_hint', { type: 'warn', vars: { key: SO.keyLabel('Mod+Shift+V') } }); });
        } else {
            SO.toast('d_clipboard_hint', { type: 'warn', vars: { key: SO.keyLabel('Mod+V') } });
        }
    };

    C.contextMenu = function (e) {
        var t = e.target;
        var inTable = t.closest && t.closest('td,th');
        var img = t.tagName === 'IMG' ? t : null;
        if (img) App.selectImage(img);
        var sel = getSelection();
        var hasSel = sel.rangeCount && !sel.isCollapsed;
        var link = t.closest && t.closest('a[href]');
        var items = [
            { label: 'd_cut', icon: 'fa-scissors', key: 'Mod+X', disabled: !hasSel, onClick: function () { C.clipboard('cut'); } },
            { label: 'd_copy', icon: 'fa-copy', key: 'Mod+C', disabled: !hasSel, onClick: function () { C.clipboard('copy'); } },
            { label: 'd_paste', icon: 'fa-paste', key: 'Mod+V', onClick: function () { C.clipboard('paste'); } },
            { label: 'd_paste_plain', icon: 'fa-file-lines', key: 'Mod+Shift+V', onClick: function () { C.clipboard('pastePlain'); } },
            { sep: true }
        ];
        if (img) {
            items.push({ label: 'd_wrap_text', icon: 'fa-align-left', submenu: [
                { label: 'd_wrap_inline', onClick: function () { C.imgWrap('inline'); } },
                { label: 'd_wrap_left', onClick: function () { C.imgWrap('left'); } },
                { label: 'd_wrap_right', onClick: function () { C.imgWrap('right'); } },
                { label: 'd_wrap_center', onClick: function () { C.imgWrap('center'); } }
            ] });
            items.push({ label: 'd_image_size', icon: 'fa-up-right-and-down-left-from-center', onClick: C.imgSize });
            items.push({ label: 'd_alt_text', icon: 'fa-closed-captioning', onClick: C.imgAlt });
            items.push({ label: 'd_replace_image', icon: 'fa-image', onClick: C.imgReplace });
            items.push({ label: 'c_delete', icon: 'fa-trash', danger: true, onClick: C.imgDelete });
            items.push({ sep: true });
        }
        if (inTable) {
            items.push({ label: 'd_insert', icon: 'fa-plus', submenu: [
                { label: 'd_row_above', icon: 'fa-arrow-up', onClick: function () { C.rowInsert(true); } },
                { label: 'd_row_below', icon: 'fa-arrow-down', onClick: function () { C.rowInsert(false); } },
                { label: 'd_col_left', icon: 'fa-arrow-left', onClick: function () { C.colInsert(true); } },
                { label: 'd_col_right', icon: 'fa-arrow-right', onClick: function () { C.colInsert(false); } }
            ] });
            items.push({ label: 'c_delete', icon: 'fa-minus', submenu: [
                { label: 'd_delete_row', onClick: C.rowDelete },
                { label: 'd_delete_col', onClick: C.colDelete },
                { label: 'd_delete_table', danger: true, onClick: C.tableDelete }
            ] });
            items.push({ label: 'd_merge_cells', icon: 'fa-object-group', disabled: selectedCells().length < 2, onClick: C.merge });
            items.push({ label: 'd_split_cell', icon: 'fa-object-ungroup', onClick: C.split });
            items.push({ label: 'd_table_props', icon: 'fa-sliders', onClick: C.tableProps });
            items.push({ sep: true });
        }
        items.push({ label: link ? 'd_edit_link' : 'd_insert_link', icon: 'fa-link', key: 'Mod+K', onClick: C.link });
        if (link) {
            items.push({ label: 'd_open_link', icon: 'fa-arrow-up-right-from-square', onClick: function () { global.open(link.href, '_blank', 'noopener'); } });
            items.push({ label: 'd_remove_link', icon: 'fa-link-slash', onClick: C.unlink });
        }
        items.push({ label: 'd_new_comment', icon: 'fa-comment-medical', key: 'Mod+Alt+M', disabled: !C.addComment, onClick: function () { C.addComment(); } });
        items.push({ sep: true });
        items.push({ label: 'd_paragraph', icon: 'fa-paragraph', onClick: C.paragraphDialog });
        items.push({ label: 'd_clear_format', icon: 'fa-text-slash', onClick: C.clearFormat });
        SO.contextMenu(e, items);
    };

    // ============================================================ panes
    C.togglePane = function (id, force) {
        var pane = document.getElementById(id);
        var show = typeof force === 'boolean' ? force : pane.hidden;
        if (show && global.innerWidth <= 768) {
            ['sdNavPane', 'sdFindPane', 'sdCommentPane'].forEach(function (p) { if (p !== id) document.getElementById(p).hidden = true; });
        }
        if (show && id !== 'sdNavPane') {
            ['sdFindPane', 'sdCommentPane'].forEach(function (p) { if (p !== id) document.getElementById(p).hidden = true; });
        }
        pane.hidden = !show;
        if (show) {
            if (id === 'sdNavPane' && C.renderNav) C.renderNav();
            if (id === 'sdFindPane' && C.renderFind) C.renderFind();
            if (id === 'sdCommentPane' && C.renderComments) C.renderComments();
        } else if (id === 'sdFindPane' && C.clearFind) C.clearFind();
        setTimeout(function () { global.dispatchEvent(new Event('resize')); }, 0);
        C.updateRibbon();
    };

    C.toggleRuler = function () {
        var w = document.getElementById('sdRulerWrap');
        w.classList.toggle('is-hidden');
        try { localStorage.setItem('sd_ruler', w.classList.contains('is-hidden') ? '0' : '1'); } catch (e) {}
        App.drawRuler();
        C.updateRibbon();
    };

    C.toggleMarks = function () {
        App.settings.showMarks = !App.settings.showMarks;
        editor.classList.toggle('show-marks', App.settings.showMarks);
        C.updateRibbon();
    };

    function exitButton(label, onExit) {
        var b = SO.el('button', { type: 'button', class: 'so-btn is-primary sd-exit-mode', html: '<i class="fas fa-compress"></i>' + SO.esc(SO.t(label)) });
        b.addEventListener('click', onExit);
        document.body.appendChild(b);
        return b;
    }

    C.focusMode = function (on) {
        var active = document.body.classList.contains('sd-focus');
        on = typeof on === 'boolean' ? on : !active;
        document.body.classList.toggle('sd-focus', on);
        if (C._focusBtn) { C._focusBtn.remove(); C._focusBtn = null; }
        if (on) C._focusBtn = exitButton('d_exit_focus', function () { C.focusMode(false); });
        if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
        if (!on && document.fullscreenElement) document.exitFullscreen().catch(function () {});
        setTimeout(function () { global.dispatchEvent(new Event('resize')); }, 60);
    };

    C.readMode = function (on) {
        var active = document.body.classList.contains('sd-read');
        on = typeof on === 'boolean' ? on : !active;
        document.body.classList.toggle('sd-read', on);
        if (C._readBtn) { C._readBtn.remove(); C._readBtn = null; }
        if (on) {
            C._readWasRO = App.readOnly;
            C.setReadOnly(true, true);
            C._readBtn = exitButton('d_exit_read', function () { C.readMode(false); });
        } else {
            C.setReadOnly(!!C._readWasRO, true);
        }
        setTimeout(function () { global.dispatchEvent(new Event('resize')); }, 60);
    };

    C.setReadOnly = function (on, silent) {
        App.readOnly = !!on;
        editor.setAttribute('contenteditable', on ? 'false' : 'true');
        editor.classList.toggle('is-readonly', !!on);
        if (!silent) SO.toast(on ? 'd_readonly_on' : 'd_readonly_off', { type: 'info' });
        C.updateRibbon();
    };

    C.zoomDialog = function () {
        SO.form({
            title: 'c_zoom',
            fields: [{ name: 'z', label: 'c_zoom_percent', type: 'number', min: 25, max: 300, step: 5, value: Math.round(App.zoom * 100) }]
        }).then(function (v) { if (v && v.z) App.setZoom(v.z / 100); });
    };

    C.gotoPage = function () {
        SO.prompt('d_goto_page_label', String(App.currentPage()), { type: 'number', title: 'd_goto_page' }).then(function (v) {
            var n = parseInt(v, 10);
            if (!n) return;
            n = SO.clamp(n, 1, App.pageCount);
            var g = App.geometry();
            var stage = document.getElementById('sdStage');
            App.scroller.scrollTo({ top: stage.offsetTop + (n - 1) * g.pitch * App.zoom, behavior: 'smooth' });
        });
    };
})(window);
