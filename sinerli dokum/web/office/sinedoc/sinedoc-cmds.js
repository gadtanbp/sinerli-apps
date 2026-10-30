/**
 * Sinerli Dokum — perintah pengeditan: huruf, paragraf, daftar, sisipan, gambar,
 * tautan, tata letak halaman, header/footer, daftar isi, catatan kaki.
 */
(function (global) {
    'use strict';

    var App = global.SineDoc;
    var C = App.cmd;
    var editor = App.editor;

    function exec(command, value) {
        try { return document.execCommand(command, false, value); } catch (e) { return false; }
    }
    C.exec = exec;

    /** Perintah execCommand standar sebagai satu langkah undo. */
    C.simple = function (command, value) {
        App.restoreRange();
        App.change(function () {
            exec('styleWithCSS', true);
            exec(command, value);
        });
    };

    // ============================================================== font
    C.fontName = function (name) {
        name = String(name || '').trim();
        if (!name) return;
        App.restoreRange();
        App.change(function () { exec('styleWithCSS', true); exec('fontName', name); });
    };

    C.fontSize = function (val) {
        var pt = parseFloat(String(val).replace(',', '.'));
        if (!pt || pt < 1 || pt > 400) { SO.toast('d_err_font_size', { type: 'error' }); C.updateRibbon(); return; }
        var sel = App.restoreRange();
        var size = pt + 'pt';
        App.change(function () {
            exec('styleWithCSS', true);
            exec('fontSize', '7');
            SO.$$('span[style*="xxx-large"], font[size="7"]', editor).forEach(function (el) {
                el.style.fontSize = size;
                el.removeAttribute('size');
            });
            App.pendingFontSize = sel.isCollapsed ? size : null;
        });
        if (App.ribbon) App.ribbon.setValue('fontSize', pt);
    };

    C.currentFontSize = function () {
        var r = App.range();
        if (!r) return App.settings.defaultSize;
        var node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
        if (!App.inEditor(node)) return App.settings.defaultSize;
        return Math.round(parseFloat(getComputedStyle(node).fontSize) * 0.75 * 2) / 2;
    };

    C.growFont = function (dir) {
        var cur = C.currentFontSize();
        var sizes = SO.FONT_SIZES;
        var next = cur;
        if (dir > 0) { next = sizes.filter(function (s) { return s > cur; })[0] || cur + 10; }
        else { var smaller = sizes.filter(function (s) { return s < cur; }); next = smaller.length ? smaller[smaller.length - 1] : Math.max(1, cur - 1); }
        C.fontSize(next);
    };

    C.foreColor = function (c) { C.simple('foreColor', !c || c === 'auto' ? '#000000' : c); };
    C.hiliteColor = function (c) { C.simple('hiliteColor', c || 'transparent'); };

    C.clearFormat = function () {
        App.restoreRange();
        App.change(function () {
            exec('removeFormat');
            exec('unlink');
            App.selectedBlocks().forEach(function (b) {
                if (/^(TD|TH)$/.test(b.tagName)) return;
                ['textAlign', 'lineHeight', 'marginLeft', 'marginRight', 'textIndent', 'marginBottom', 'marginTop'].forEach(function (p) { if (!b.hasAttribute('data-sd-push') || p !== 'marginTop') b.style[p] = ''; });
                if (!b.getAttribute('style')) b.removeAttribute('style');
            });
        });
    };

    /** Memecah batas seleksi supaya seleksi terdiri atas node teks utuh. */
    C.splitSelectionText = function (range) {
        var sc = range.startContainer, so = range.startOffset, ec = range.endContainer, eo = range.endOffset;
        if (ec.nodeType === 3 && eo > 0 && eo < ec.length) ec.splitText(eo);
        if (sc.nodeType === 3 && so > 0 && so < sc.length) {
            var n = sc.splitText(so);
            if (ec === sc) { ec = n; eo = eo - so; }
            sc = n; so = 0;
        }
        range.setStart(sc, so);
        range.setEnd(ec, ec.nodeType === 3 ? Math.min(eo, ec.length) : eo);
        var nodes = [];
        var root = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        var t;
        while ((t = walker.nextNode())) {
            if (!t.length || !range.intersectsNode(t)) continue;
            if (t === range.startContainer && range.startOffset >= t.length) continue;
            if (t === range.endContainer && range.endOffset === 0) continue;
            if (t.parentNode.closest('[contenteditable="false"], .sd-gap')) continue;
            nodes.push(t);
        }
        return nodes;
    };

    C.changeCase = function (mode) {
        var sel = App.restoreRange();
        if (sel.isCollapsed) {
            try { sel.modify('move', 'backward', 'word'); sel.modify('extend', 'forward', 'word'); } catch (e) {}
        }
        var r = App.range();
        if (!r || r.collapsed) return;
        App.change(function () {
            var nodes = C.splitSelectionText(r);
            var full = nodes.map(function (n) { return n.data; }).join('');
            var out;
            var loc = SO.locale();
            if (mode === 'upper') out = full.toLocaleUpperCase(loc);
            else if (mode === 'lower') out = full.toLocaleLowerCase(loc);
            else if (mode === 'title') out = full.toLocaleLowerCase(loc).replace(/(^|[\s\-(“"'])(\p{L})/gu, function (m, a, b) { return a + b.toLocaleUpperCase(loc); });
            else if (mode === 'sentence') out = full.toLocaleLowerCase(loc).replace(/(^\s*|[.!?]\s+)(\p{L})/gu, function (m, a, b) { return a + b.toLocaleUpperCase(loc); });
            else out = full.split('').map(function (ch) { var u = ch.toLocaleUpperCase(loc); return ch === u ? ch.toLocaleLowerCase(loc) : u; }).join('');
            if (out.length === full.length) {
                var pos = 0;
                nodes.forEach(function (n) { n.data = out.substr(pos, n.data.length); pos += n.data.length; });
            } else {
                nodes.forEach(function (n) { n.data = mode === 'upper' ? n.data.toLocaleUpperCase(loc) : n.data.toLocaleLowerCase(loc); });
            }
            if (nodes.length) {
                var nr = document.createRange();
                nr.setStart(nodes[0], 0);
                var last = nodes[nodes.length - 1];
                nr.setEnd(last, last.length);
                getSelection().removeAllRanges();
                getSelection().addRange(nr);
            }
        });
    };

    // ========================================================= paragraphs
    C.align = function (a) {
        var map = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' };
        if (App.selectedImg) {
            var img = App.selectedImg;
            App.change(function () {
                img.classList.remove('sd-img-left', 'sd-img-right', 'sd-img-center');
                var p = img.closest('p,li,td,th,div,h1,h2,h3,h4');
                if (p && p !== editor) p.style.textAlign = a === 'justify' ? 'left' : a;
            });
            return;
        }
        C.simple(map[a]);
    };

    C.setBlockStyle = function (prop, value) {
        App.restoreRange();
        var blocks = App.selectedBlocks();
        if (!blocks.length) return;
        App.change(function () {
            blocks.forEach(function (b) {
                if (prop === 'marginTop' && b.hasAttribute('data-sd-push')) { b.setAttribute('data-sd-mt', value); return; }
                b.style[prop] = value;
                if (!b.getAttribute('style')) b.removeAttribute('style');
            });
        });
    };

    C.lineSpacing = function (v) { C.setBlockStyle('lineHeight', v ? String(v) : ''); };

    C.toggleSpace = function (which) {
        var blocks = App.selectedBlocks();
        if (!blocks.length) return;
        var prop = which === 'before' ? 'marginTop' : 'marginBottom';
        var cur = which === 'before' ? (blocks[0].getAttribute('data-sd-mt') || blocks[0].style.marginTop) : blocks[0].style.marginBottom;
        C.setBlockStyle(prop, cur && parseFloat(cur) > 0 ? '0pt' : '12pt');
    };

    C.indent = function (dir) {
        App.restoreRange();
        var r = App.range();
        if (r && App.closestInEditor(r.startContainer, 'li')) {
            App.change(function () { exec(dir > 0 ? 'indent' : 'outdent'); });
            return;
        }
        var blocks = App.selectedBlocks().filter(function (b) { return !/^(TD|TH)$/.test(b.tagName); });
        App.change(function () {
            blocks.forEach(function (b) {
                var cur = parseFloat(b.style.marginLeft) || 0;
                var next = Math.min(Math.max(0, cur + dir * 48), Math.max(0, App.geometry().contentW - 96));
                b.style.marginLeft = next ? next + 'px' : '';
                if (!b.getAttribute('style')) b.removeAttribute('style');
            });
        });
    };

    C.paragraphDialog = function () {
        App.rememberRange();
        var blocks = App.selectedBlocks();
        var b = blocks[0];
        if (!b) return;
        var cs = getComputedStyle(b);
        var pxToCm = function (px) { return Math.round((parseFloat(px) || 0) / 37.795 * 100) / 100; };
        var ti = parseFloat(b.style.textIndent) || 0;
        var lh = b.style.lineHeight || '';
        SO.form({
            title: 'd_paragraph', width: 480,
            fields: [
                { name: 'align', label: 'd_alignment', type: 'select', value: cs.textAlign === 'start' ? 'left' : cs.textAlign, options: [{ value: 'left', label: 'd_align_left' }, { value: 'center', label: 'd_align_center' }, { value: 'right', label: 'd_align_right' }, { value: 'justify', label: 'd_align_justify' }] },
                { type: 'row', fields: [
                    { name: 'left', label: 'd_indent_left_cm', type: 'number', step: 0.1, min: 0, value: pxToCm(b.style.marginLeft) },
                    { name: 'right', label: 'd_indent_right_cm', type: 'number', step: 0.1, min: 0, value: pxToCm(b.style.marginRight) }
                ] },
                { type: 'row', fields: [
                    { name: 'special', label: 'd_special_indent', type: 'select', value: ti > 0 ? 'first' : ti < 0 ? 'hanging' : 'none', options: [{ value: 'none', label: 'd_none' }, { value: 'first', label: 'd_first_line' }, { value: 'hanging', label: 'd_hanging' }] },
                    { name: 'by', label: 'd_by_cm', type: 'number', step: 0.1, min: 0, value: pxToCm(Math.abs(ti)) || 1.27 }
                ] },
                { type: 'row', fields: [
                    { name: 'before', label: 'd_space_before_pt', type: 'number', min: 0, step: 1, value: Math.round((parseFloat(b.getAttribute('data-sd-mt') || (b.hasAttribute('data-sd-push') ? '0' : cs.marginTop)) || 0) * 0.75) },
                    { name: 'after', label: 'd_space_after_pt', type: 'number', min: 0, step: 1, value: Math.round((parseFloat(cs.marginBottom) || 0) * 0.75) }
                ] },
                { name: 'line', label: 'd_line_spacing', type: 'select', value: lh || '', options: [{ value: '', label: 'd_default' }, { value: '1', text: '1.0' }, { value: '1.15', text: '1.15' }, { value: '1.5', text: '1.5' }, { value: '2', text: '2.0' }, { value: '2.5', text: '2.5' }, { value: '3', text: '3.0' }] }
            ]
        }).then(function (v) {
            if (!v) return;
            App.restoreRange();
            App.change(function () {
                blocks.forEach(function (el) {
                    el.style.textAlign = v.align === 'left' ? '' : v.align;
                    el.style.marginLeft = v.left ? (v.left * 37.795).toFixed(1) + 'px' : '';
                    el.style.marginRight = v.right ? (v.right * 37.795).toFixed(1) + 'px' : '';
                    var by = (v.by || 0) * 37.795;
                    el.style.textIndent = v.special === 'first' ? by.toFixed(1) + 'px' : v.special === 'hanging' ? (-by).toFixed(1) + 'px' : '';
                    if (v.special === 'hanging' && !v.left) el.style.marginLeft = by.toFixed(1) + 'px';
                    var mt = v.before != null ? v.before + 'pt' : '';
                    if (el.hasAttribute('data-sd-push')) el.setAttribute('data-sd-mt', mt); else el.style.marginTop = mt;
                    el.style.marginBottom = v.after != null ? v.after + 'pt' : '';
                    el.style.lineHeight = v.line || '';
                    if (!el.getAttribute('style')) el.removeAttribute('style');
                });
            });
        });
    };

    var STYLE_TAG = { p: 'P', nospace: 'P', title: 'P', subtitle: 'P', h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', quote: 'BLOCKQUOTE', code: 'PRE' };

    C.blockStyle = function (v) {
        var tag = STYLE_TAG[v];
        if (!tag) return;
        App.restoreRange();
        var blocks = App.selectedBlocks();
        if (!blocks.length) return;
        App.change(function () {
            var saved = SDLayout.saveSelection(editor);
            blocks.forEach(function (b) {
                if (b.tagName === 'LI') return;
                var host = b;
                if (/^(TD|TH)$/.test(b.tagName)) {
                    host = document.createElement('p');
                    while (b.firstChild) host.appendChild(b.firstChild);
                    b.appendChild(host);
                }
                var el = host;
                if (host.tagName !== tag) {
                    el = document.createElement(tag);
                    Array.prototype.forEach.call(host.attributes, function (a) { el.setAttribute(a.name, a.value); });
                    while (host.firstChild) el.appendChild(host.firstChild);
                    host.replaceWith(el);
                }
                el.classList.remove('sd-title', 'sd-subtitle', 'sd-nospace');
                if (v === 'title' || v === 'subtitle' || v === 'nospace') el.classList.add('sd-' + v);
                if (!el.className) el.removeAttribute('class');
                if (!el.firstChild) el.innerHTML = '<br>';
                var parent = el.parentNode;
                if (parent && parent.tagName === 'BLOCKQUOTE' && v !== 'quote' && parent !== editor) {
                    parent.parentNode.insertBefore(el, parent);
                    if (!parent.textContent.trim() && !parent.querySelector('img')) parent.remove();
                }
            });
            SDLayout.restoreSelection(editor, saved);
        });
    };

    C.currentBlockStyle = function () {
        var r = App.range();
        if (!r) return 'p';
        var b = App.closestInEditor(r.startContainer, 'p,h1,h2,h3,h4,h5,h6,blockquote,pre');
        if (!b) return 'p';
        if (b.tagName === 'P') {
            if (b.classList.contains('sd-title')) return 'title';
            if (b.classList.contains('sd-subtitle')) return 'subtitle';
            if (b.classList.contains('sd-nospace')) return 'nospace';
            return b.closest('blockquote') ? 'quote' : 'p';
        }
        return { H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h4', H5: 'h4', H6: 'h4', BLOCKQUOTE: 'quote', PRE: 'code' }[b.tagName];
    };

    // ============================================================= lists
    function currentList() {
        var r = App.range();
        var li = r && App.closestInEditor(r.startContainer, 'li');
        return li ? li.parentNode : null;
    }

    function styleList(list, style) {
        if (!list) return;
        if (!style) { list.style.listStyleType = ''; }
        else if (/^[a-z-]+$/.test(style)) list.style.listStyleType = style;
        else list.style.listStyleType = '"' + style + '  "';
        if (!list.getAttribute('style')) list.removeAttribute('style');
    }

    C.bullets = function (style) {
        App.restoreRange();
        App.change(function () {
            var list = currentList();
            var isPlainUl = list && list.tagName === 'UL' && !list.classList.contains('sd-checklist');
            if (isPlainUl && style === undefined) { exec('insertUnorderedList'); return; }
            if (list && list.classList.contains('sd-checklist')) {
                list.classList.remove('sd-checklist');
                if (!list.className) list.removeAttribute('class');
                SO.$$(':scope > li', list).forEach(function (l) { l.removeAttribute('data-checked'); });
            } else if (!isPlainUl) exec('insertUnorderedList');
            styleList(currentList(), style);
        });
    };

    C.numbering = function (style) {
        App.restoreRange();
        App.change(function () {
            var list = currentList();
            var isOl = list && list.tagName === 'OL';
            if (isOl && style === undefined) { exec('insertOrderedList'); return; }
            if (!isOl) exec('insertOrderedList');
            styleList(currentList(), style);
        });
    };

    C.checklist = function () {
        App.restoreRange();
        App.change(function () {
            var list = currentList();
            if (list && list.classList.contains('sd-checklist')) { exec('insertUnorderedList'); return; }
            if (!list || list.tagName !== 'UL') exec('insertUnorderedList');
            list = currentList();
            if (!list) return;
            if (list.tagName === 'OL') return;
            list.classList.add('sd-checklist');
            list.style.listStyleType = '';
            if (!list.getAttribute('style')) list.removeAttribute('style');
            SO.$$(':scope > li', list).forEach(function (l) { if (!l.hasAttribute('data-checked')) l.setAttribute('data-checked', 'false'); });
        });
    };

    C.restartNumbering = function () {
        var list = currentList();
        if (!list || list.tagName !== 'OL') return;
        SO.prompt('d_start_at', list.getAttribute('start') || '1', { type: 'number' }).then(function (v) {
            if (v == null) return;
            App.change(function () {
                var n = parseInt(v, 10);
                if (n > 1) list.setAttribute('start', n); else list.removeAttribute('start');
            });
        });
    };

    // ============================================================ insert
    function topLevelOf(node) {
        var n = node && (node.nodeType === 1 ? node : node.parentNode);
        while (n && n.parentNode && n.parentNode !== editor) n = n.parentNode;
        return n && n.parentNode === editor ? n : null;
    }
    C.topLevelOf = topLevelOf;

    function placeCaret(el, atEnd) {
        var r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(!atEnd);
        var sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        App.rememberRange();
    }
    C.placeCaret = placeCaret;

    /** Menyisipkan blok tingkat atas setelah blok yang memuat kursor. */
    function insertBlockAfterCaret(nodes, focusNode) {
        var r = App.range();
        var top = r ? topLevelOf(r.startContainer) : null;
        if (r && r.startContainer === editor) top = editor.childNodes[Math.max(0, r.startOffset - 1)] || null;
        var anchor = top;
        var emptyTop = top && /^(P|H[1-6])$/.test(top.tagName) && !top.textContent.trim() && !top.querySelector('img');
        nodes.forEach(function (n) {
            if (emptyTop && anchor === top) { top.replaceWith(n); anchor = n; emptyTop = false; }
            else if (anchor) { anchor.after(n); anchor = n; }
            else { editor.appendChild(n); anchor = n; }
        });
        if (focusNode) placeCaret(focusNode);
    }
    C.insertBlockAfterCaret = insertBlockAfterCaret;

    /**
     * Menyisipkan elemen inline (rujukan catatan kaki, rumus) tepat di kursor.
     * execCommand('insertHTML') menaruh elemen DI LUAR blok bila kursor berada
     * di batas elemen (mis. akhir judul), jadi dipakai Range langsung.
     */
    C.insertInline = function (node) {
        App.restoreRange();
        var r = App.range();
        if (!r) return;
        r.deleteContents();
        var c = r.startContainer;
        if (c === editor) {
            var blk = editor.childNodes[r.startOffset] || editor.childNodes[r.startOffset - 1];
            if (!blk || blk.nodeType !== 1 || blk.getAttribute('contenteditable') === 'false') {
                blk = SO.el('p');
                editor.insertBefore(blk, editor.childNodes[r.startOffset] || null);
            }
            r.selectNodeContents(blk);
            r.collapse(r.startOffset === 0);
        }
        SO.$$('br', r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode).forEach(function (br) {
            if (br.parentNode && br.parentNode.childNodes.length === 1) br.remove();
        });
        r.insertNode(node);
        var after = node.nextSibling;
        if (!after || (after.nodeType === 1 && /^(BR)$/.test(after.tagName))) {
            after = document.createTextNode('\u200B');
            node.after(after);
        }
        var nr = document.createRange();
        if (after.nodeType === 3) nr.setStart(after, after.data.charAt(0) === '\u200B' ? 1 : 0);
        else nr.setStartAfter(node);
        nr.collapse(true);
        getSelection().removeAllRanges();
        getSelection().addRange(nr);
        App.rememberRange();
    };

    C.pageBreak = function () {
        App.restoreRange();
        App.change(function () {
            var r = App.range();
            var block = r && App.closestInEditor(r.startContainer, 'p,h1,h2,h3,h4,pre,blockquote');
            var pb = SO.el('div', { class: 'sd-page-break', contenteditable: 'false', 'data-label': SO.t('d_page_break') });
            // Pecah paragraf di posisi kursor bila kursor di tengah teks.
            if (block && block.parentNode === editor && r.collapsed) {
                var tail = document.createRange();
                tail.setStart(r.startContainer, r.startOffset);
                tail.setEnd(block, block.childNodes.length);
                var frag = tail.extractContents();
                var next = document.createElement(block.tagName === 'PRE' ? 'PRE' : 'P');
                next.appendChild(frag);
                if (!next.textContent && !next.querySelector('img')) next.innerHTML = '<br>';
                if (!block.textContent && !block.querySelector('img')) block.innerHTML = '<br>';
                block.after(pb);
                pb.after(next);
                placeCaret(next);
                return;
            }
            var p = SO.el('p', { html: '<br>' });
            insertBlockAfterCaret([pb, p], p);
        });
    };

    C.blankPage = function () {
        App.restoreRange();
        App.change(function () {
            var p1 = SO.el('p', { html: '<br>' });
            var p2 = SO.el('p', { html: '<br>' });
            insertBlockAfterCaret([
                SO.el('div', { class: 'sd-page-break', contenteditable: 'false', 'data-label': SO.t('d_page_break') }), p1,
                SO.el('div', { class: 'sd-page-break', contenteditable: 'false', 'data-label': SO.t('d_page_break') }), p2
            ], p1);
        });
    };

    C.hr = function () {
        App.restoreRange();
        App.change(function () {
            var p = SO.el('p', { html: '<br>' });
            insertBlockAfterCaret([document.createElement('hr'), p], p);
        });
    };

    C.textBox = function () {
        App.restoreRange();
        var r = App.range();
        var text = r && !r.collapsed ? r.cloneContents() : null;
        App.change(function () {
            var inner = SO.el('p');
            if (text && text.textContent.trim()) inner.appendChild(text); else inner.textContent = SO.t('d_textbox_hint');
            var box = SO.el('div', { class: 'sd-box' }, inner);
            if (text && text.textContent.trim()) exec('delete');
            insertBlockAfterCaret([box, SO.el('p', { html: '<br>' })], inner);
            if (!text) { var rr = document.createRange(); rr.selectNodeContents(inner); getSelection().removeAllRanges(); getSelection().addRange(rr); }
        });
    };

    C.insertTable = function (rows, cols) {
        rows = SO.clamp(rows | 0, 1, 200);
        cols = SO.clamp(cols | 0, 1, 30);
        App.restoreRange();
        App.change(function () {
            var table = document.createElement('table');
            var tbody = document.createElement('tbody');
            for (var i = 0; i < rows; i++) {
                var tr = document.createElement('tr');
                for (var j = 0; j < cols; j++) { var td = document.createElement('td'); td.innerHTML = '<br>'; tr.appendChild(td); }
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            var r = App.range();
            var cell = r && App.closestInEditor(r.startContainer, 'td,th');
            if (cell) {
                // Tabel bersarang di dalam sel.
                cell.appendChild(table);
                placeCaret(table.rows[0].cells[0]);
                return;
            }
            insertBlockAfterCaret([table, SO.el('p', { html: '<br>' })], table.rows[0].cells[0]);
        });
    };

    C.insertTableDialog = function () {
        SO.form({
            title: 'd_insert_table',
            fields: [{ type: 'row', fields: [
                { name: 'cols', label: 'd_columns', type: 'number', min: 1, max: 30, value: 3 },
                { name: 'rows', label: 'd_rows', type: 'number', min: 1, max: 200, value: 3 }
            ] }]
        }).then(function (v) { if (v) C.insertTable(v.rows || 1, v.cols || 1); });
    };

    C.tablePicker = function () {
        return [{
            custom: function (box, close) {
                box.className = 'so-tablepick';
                var grid = SO.el('div', { class: 'so-tablepick-grid' });
                var label = SO.el('div', { class: 'so-tablepick-label', text: SO.t('d_insert_table') });
                var cells = [];
                for (var r = 0; r < 8; r++) for (var c = 0; c < 10; c++) {
                    var s = SO.el('span', { dataset: { r: r, c: c } });
                    cells.push(s);
                    grid.appendChild(s);
                }
                grid.addEventListener('mousemove', function (e) {
                    var t = e.target.closest('span');
                    if (!t) return;
                    var R = +t.dataset.r, Cc = +t.dataset.c;
                    cells.forEach(function (x) { x.classList.toggle('on', +x.dataset.r <= R && +x.dataset.c <= Cc); });
                    label.textContent = (Cc + 1) + ' × ' + (R + 1) + ' ' + SO.t('d_table');
                });
                grid.addEventListener('mousedown', function (e) { e.preventDefault(); });
                grid.addEventListener('click', function (e) {
                    var t = e.target.closest('span');
                    if (!t) return;
                    close();
                    C.insertTable(+t.dataset.r + 1, +t.dataset.c + 1);
                });
                box.appendChild(grid);
                box.appendChild(label);
            }
        }, { sep: true },
        { label: 'd_insert_table_dialog', icon: 'fa-table', onClick: C.insertTableDialog }];
    };

    C.dateTime = function () {
        var d = new Date();
        var loc = SO.locale();
        var fmts = [
            new Intl.DateTimeFormat(loc, { dateStyle: 'full' }).format(d),
            new Intl.DateTimeFormat(loc, { dateStyle: 'long' }).format(d),
            new Intl.DateTimeFormat(loc, { dateStyle: 'short' }).format(d),
            d.toISOString().slice(0, 10),
            new Intl.DateTimeFormat(loc, { timeStyle: 'short' }).format(d),
            new Intl.DateTimeFormat(loc, { dateStyle: 'long', timeStyle: 'short' }).format(d)
        ];
        return fmts.map(function (f) {
            return { text: f, onClick: function () { App.restoreRange(); App.change(function () { exec('insertText', f); }); } };
        });
    };

    // ============================================================== links
    function normalizeUrl(u) {
        u = String(u || '').trim();
        if (!u) return '';
        if (/^(https?:|mailto:|tel:|#)/i.test(u)) return u;
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) return 'mailto:' + u;
        if (/^(javascript|data|vbscript):/i.test(u)) return '';
        return 'https://' + u;
    }

    C.link = function () {
        App.restoreRange();
        var r = App.range();
        var a = r && App.closestInEditor(r.startContainer, 'a');
        var text = a ? a.textContent : (r ? r.toString() : '');
        SO.form({
            title: a ? 'd_edit_link' : 'd_insert_link',
            fields: [
                { name: 'text', label: 'd_link_text', value: text },
                { name: 'url', label: 'd_link_url', value: a ? a.getAttribute('href') : '', placeholder: 'https://', spellcheck: false }
            ],
            validate: function (v) { return normalizeUrl(v.url) ? null : 'd_err_url'; }
        }).then(function (v) {
            if (!v) return;
            var url = normalizeUrl(v.url);
            App.restoreRange();
            App.change(function () {
                if (a) {
                    a.setAttribute('href', url);
                    if (v.text && v.text !== a.textContent) a.textContent = v.text;
                    return;
                }
                var sel = getSelection();
                if (!sel.isCollapsed && (!v.text || v.text === text)) {
                    exec('createLink', url);
                    SO.$$('a[href="' + CSS.escape(url) + '"]', editor).forEach(function (x) { x.target = '_blank'; x.rel = 'noopener noreferrer'; });
                } else {
                    exec('insertHTML', '<a href="' + SO.esc(url) + '" target="_blank" rel="noopener noreferrer">' + SO.esc(v.text || url) + '</a>&nbsp;');
                }
            });
        });
    };

    C.unlink = function () {
        App.restoreRange();
        var r = App.range();
        var a = r && App.closestInEditor(r.startContainer, 'a');
        App.change(function () {
            if (a && getSelection().isCollapsed) {
                var nr = document.createRange();
                nr.selectNodeContents(a);
                getSelection().removeAllRanges();
                getSelection().addRange(nr);
            }
            exec('unlink');
        });
    };

    // ============================================================= images
    C.insertImage = function () {
        SO.pickFile('image/*', true).then(function (files) { if (files && files.length) App.insertImageFiles(files); });
    };

    C.insertImageUrl = function () {
        App.rememberRange();
        SO.prompt('d_image_url', '', { placeholder: 'https://', title: 'd_image_from_url' }).then(function (url) {
            url = normalizeUrl(url);
            if (!url || !/^https?:/.test(url)) return;
            var busy = SO.busy('d_inserting_image');
            fetch(url, { mode: 'cors' }).then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.blob();
            }).then(function (blob) {
                busy.done();
                if (!/^image\//.test(blob.type)) throw new Error(SO.t('c_err_image'));
                return App.insertImageFiles([new File([blob], 'image', { type: blob.type })]);
            }).catch(function () {
                busy.done();
                // Server gambar menolak CORS: tetap sisipkan sebagai tautan gambar.
                App.restoreRange();
                App.change(function () { exec('insertHTML', '<img src="' + SO.esc(url) + '" alt="" style="max-width:100%">'); });
                SO.toast('d_image_external_warn', { type: 'warn', ms: 6000 });
            });
        });
    };

    function withImg(fn) {
        var img = App.selectedImg;
        if (!img) return;
        App.change(function () { fn(img); });
        App.updateOverlay();
    }

    C.imgWrap = function (mode) {
        withImg(function (img) {
            img.classList.remove('sd-img-left', 'sd-img-right', 'sd-img-center');
            if (mode !== 'inline') img.classList.add('sd-img-' + mode);
        });
    };
    C.imgToggle = function (cls) { withImg(function (img) { img.classList.toggle('sd-img-' + cls); }); };
    C.imgAlt = function () {
        var img = App.selectedImg;
        if (!img) return;
        SO.prompt('d_alt_text', img.getAttribute('alt') || '', { title: 'd_alt_text', type: 'text' }).then(function (v) {
            if (v == null) return;
            App.change(function () { img.setAttribute('alt', v); });
        });
    };
    C.imgSize = function () {
        var img = App.selectedImg;
        if (!img) return;
        var r = img.getBoundingClientRect();
        var w = Math.round(r.width / App.zoom), h = Math.round(r.height / App.zoom);
        SO.form({
            title: 'd_image_size',
            fields: [{ type: 'row', fields: [
                { name: 'w', label: 'd_width_px', type: 'number', min: 10, value: w },
                { name: 'h', label: 'd_height_px', type: 'number', min: 10, value: h }
            ] }, { name: 'lock', label: 'd_lock_ratio', type: 'checkbox', value: true }],
            onBuild: function (dlg, inputs) {
                var ratio = w / Math.max(1, h);
                inputs.w.addEventListener('input', function () { if (inputs.lock.checked) inputs.h.value = Math.round(inputs.w.value / ratio); });
                inputs.h.addEventListener('input', function () { if (inputs.lock.checked) inputs.w.value = Math.round(inputs.h.value * ratio); });
            }
        }).then(function (v) {
            if (!v) return;
            withImg(function (el) {
                el.style.width = Math.min(v.w, App.geometry().contentW) + 'px';
                el.style.height = v.lock ? '' : v.h + 'px';
            });
        });
    };
    C.imgReset = function () { withImg(function (img) { img.style.width = Math.min(img.naturalWidth || 300, App.geometry().contentW) + 'px'; img.style.height = ''; }); };
    C.imgReplace = function () {
        var img = App.selectedImg;
        if (!img) return;
        SO.pickFile('image/*').then(function (f) {
            if (!f) return;
            SO.prepareImage(f, 2000).then(function (res) {
                var rec = App.assets.addDataUrl(res.dataUrl);
                App.change(function () { img.src = rec.url; img.setAttribute('data-asset', rec.id); img.style.height = ''; });
                setTimeout(App.updateOverlay, 60);
            });
        });
    };
    C.imgTransform = function (op) {
        var img = App.selectedImg;
        if (!img) return;
        SO.loadImage(img.src).then(function (im) {
            var c = document.createElement('canvas');
            var w = im.naturalWidth, h = im.naturalHeight;
            var rotate = op === 'rotl' || op === 'rotr';
            c.width = rotate ? h : w;
            c.height = rotate ? w : h;
            var ctx = c.getContext('2d');
            if (op === 'rotr') { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
            else if (op === 'rotl') { ctx.translate(0, w); ctx.rotate(-Math.PI / 2); }
            else if (op === 'fliph') { ctx.translate(w, 0); ctx.scale(-1, 1); }
            else if (op === 'flipv') { ctx.translate(0, h); ctx.scale(1, -1); }
            ctx.drawImage(im, 0, 0);
            var rec = App.assets.addDataUrl(c.toDataURL('image/png'));
            var rr = img.getBoundingClientRect();
            var dispW = rr.width / App.zoom, dispH = rr.height / App.zoom;
            App.change(function () {
                img.src = rec.url;
                img.setAttribute('data-asset', rec.id);
                if (rotate) img.style.width = Math.min(Math.round(dispH), App.geometry().contentW) + 'px';
                else img.style.width = Math.round(dispW) + 'px';
                img.style.height = '';
            });
            setTimeout(App.updateOverlay, 60);
        }).catch(function () { SO.toast('d_err_image_edit', { type: 'error' }); });
    };
    C.imgDelete = function () {
        var img = App.selectedImg;
        if (!img) return;
        App.deselectImage();
        App.change(function () { img.remove(); });
    };

    // ============================================================== page
    C.setSettings = function (patch) {
        App.change(function () {
            Object.keys(patch).forEach(function (k) {
                if (k === 'margins' || k === 'hf') App.settings[k] = Object.assign({}, App.settings[k], patch[k]);
                else App.settings[k] = patch[k];
            });
        }, { allowReadOnly: false });
        App.layoutNow();
    };

    C.MARGIN_PRESETS = {
        normal: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
        narrow: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 },
        moderate: { top: 25.4, bottom: 25.4, left: 19.05, right: 19.05 },
        wide: { top: 25.4, bottom: 25.4, left: 50.8, right: 50.8 },
        indo: { top: 40, bottom: 30, left: 40, right: 30 }
    };

    C.margins = function (preset) {
        if (preset === 'custom') { C.pageSetup('margins'); return; }
        C.setSettings({ margins: C.MARGIN_PRESETS[preset] });
    };

    C.pageSetup = function () {
        var s = App.settings;
        var sizes = Object.keys(SDLayout.PAGE_SIZES).map(function (k) {
            var z = SDLayout.PAGE_SIZES[k];
            return { value: k, text: k.toUpperCase().replace('LETTER', 'Letter').replace('LEGAL', 'Legal') + ' (' + z.w + ' × ' + z.h + ' mm)' };
        });
        SO.form({
            title: 'd_page_setup', width: 500,
            fields: [
                { type: 'row', fields: [
                    { name: 'size', label: 'd_paper_size', type: 'select', value: s.size, options: sizes },
                    { name: 'orientation', label: 'd_orientation', type: 'select', value: s.orientation, options: [{ value: 'portrait', label: 'd_portrait' }, { value: 'landscape', label: 'd_landscape' }] }
                ] },
                { type: 'html', html: '<div style="font-weight:500;color:var(--so-muted);font-size:12.5px;margin-top:4px">' + SO.esc(SO.t('d_margins_mm')) + '</div>' },
                { type: 'row', fields: [
                    { name: 'top', label: 'd_top', type: 'number', min: 0, max: 100, step: 0.1, value: s.margins.top },
                    { name: 'bottom', label: 'd_bottom', type: 'number', min: 0, max: 100, step: 0.1, value: s.margins.bottom },
                    { name: 'left', label: 'd_left', type: 'number', min: 0, max: 100, step: 0.1, value: s.margins.left },
                    { name: 'right', label: 'd_right', type: 'number', min: 0, max: 100, step: 0.1, value: s.margins.right }
                ] },
                { type: 'row', fields: [
                    { name: 'headerDist', label: 'd_header_dist', type: 'number', min: 0, max: 80, step: 0.5, value: s.headerDist },
                    { name: 'footerDist', label: 'd_footer_dist', type: 'number', min: 0, max: 80, step: 0.5, value: s.footerDist }
                ] }
            ],
            validate: function (v) {
                var z = SDLayout.PAGE_SIZES[v.size];
                var w = v.orientation === 'landscape' ? z.h : z.w;
                var h = v.orientation === 'landscape' ? z.w : z.h;
                if ((v.left || 0) + (v.right || 0) > w - 30 || (v.top || 0) + (v.bottom || 0) > h - 30) return 'd_err_margins';
                return null;
            }
        }).then(function (v) {
            if (!v) return;
            C.setSettings({
                size: v.size, orientation: v.orientation,
                margins: { top: v.top || 0, bottom: v.bottom || 0, left: v.left || 0, right: v.right || 0 },
                headerDist: v.headerDist || 0, footerDist: v.footerDist || 0
            });
        });
    };

    C.watermark = function (v) {
        if (v === 'custom') {
            SO.prompt('d_watermark_text', App.settings.watermark || '', { title: 'd_watermark' }).then(function (t) {
                if (t == null) return;
                C.setSettings({ watermark: t.trim().slice(0, 40) });
            });
            return;
        }
        C.setSettings({ watermark: v ? SO.t(v) : '' });
    };

    C.pageBorder = function () {
        var b = App.settings.border || {};
        SO.form({
            title: 'd_page_borders',
            fields: [
                { name: 'style', label: 'd_border_style', type: 'select', value: b.style || 'none', options: [{ value: 'none', label: 'd_none' }, { value: 'solid', label: 'd_border_solid' }, { value: 'double', label: 'd_border_double' }, { value: 'dashed', label: 'd_border_dashed' }, { value: 'dotted', label: 'd_border_dotted' }] },
                { type: 'row', fields: [
                    { name: 'width', label: 'd_border_width', type: 'number', min: 1, max: 12, value: b.width || 2 },
                    { name: 'color', label: 'd_color', type: 'color', value: b.color || '#1f3864' },
                    { name: 'offset', label: 'd_border_offset', type: 'number', min: 0, max: 120, value: b.offset || 28 }
                ] }
            ]
        }).then(function (v) {
            if (!v) return;
            C.setSettings({ border: v.style === 'none' ? null : { style: v.style, width: v.width || 1, color: v.color, offset: v.offset || 0 } });
        });
    };

    C.pageColor = function (c) { C.setSettings({ pageColor: c || '#ffffff' }); };

    C.columns = function (n, rule) {
        App.restoreRange();
        var r = App.range();
        if (!r) return;
        App.change(function () {
            var saved = SDLayout.saveSelection(editor);
            var existing = App.closestInEditor(r.startContainer, '.sd-cols');
            if (existing) {
                if (n === 1) {
                    while (existing.firstChild) existing.parentNode.insertBefore(existing.firstChild, existing);
                    existing.remove();
                } else {
                    existing.setAttribute('data-cols', n);
                    existing.classList.toggle('has-rule', !!rule);
                }
                SDLayout.restoreSelection(editor, saved);
                return;
            }
            if (n === 1) return;
            var first = topLevelOf(r.startContainer), last = topLevelOf(r.endContainer);
            if (!first) return;
            var wrap = SO.el('div', { class: 'sd-cols' + (rule ? ' has-rule' : ''), 'data-cols': n });
            first.before(wrap);
            var node = first;
            while (node) {
                var next = node.nextSibling;
                wrap.appendChild(node);
                if (node === last || !last) break;
                node = next;
            }
            if (!wrap.nextElementSibling) wrap.after(SO.el('p', { html: '<br>' }));
            SDLayout.restoreSelection(editor, saved);
        });
    };

    // ====================================================== header/footer
    function fieldSpan(f) {
        return '<span class="sd-field" data-field="' + f + '" contenteditable="false">' + (f === 'page' ? '1' : f === 'pages' ? '1' : f === 'date' ? '—' : '…') + '</span>';
    }
    C.fieldSpan = fieldSpan;

    C.pageNumbers = function (pos) {
        var hf = Object.assign({}, App.settings.hf);
        var strip = function (html) {
            var d = document.createElement('div');
            d.innerHTML = html || '';
            SO.$$('p[data-pn="1"]', d).forEach(function (p) { p.remove(); });
            SO.$$('.sd-field[data-field="page"], .sd-field[data-field="pages"]', d).forEach(function (f) { f.remove(); });
            return d.textContent.trim() || d.querySelector('.sd-field,img') ? d.innerHTML : '';
        };
        hf.header = strip(hf.header);
        hf.footer = strip(hf.footer);
        if (pos !== 'none') {
            var parts = pos.split('-');
            var align = parts[1];
            var inner = parts[0] === 'xofy'
                ? SO.esc(SO.t('d_page_x_of_y')).replace('{page}', fieldSpan('page')).replace('{pages}', fieldSpan('pages'))
                : fieldSpan('page');
            if (parts[0] === 'xofy') align = 'center';
            var html = '<p data-pn="1" style="text-align:' + align + '">' + inner + '</p>';
            if (parts[0] === 'top') hf.header = (hf.header || '') + html;
            else hf.footer = (hf.footer || '') + html;
        }
        C.setSettings({ hf: hf });
    };

    C.editHeaderFooter = function (which, pageIndex) {
        var s = App.settings;
        var hf = Object.assign({}, s.hf);
        var variant = 'default';
        if (hf.differentFirst && pageIndex === 0) variant = 'first';
        else if (hf.differentOddEven && pageIndex % 2 === 1) variant = 'even';
        var keys = { 'default': ['header', 'footer'], first: ['firstHeader', 'firstFooter'], even: ['evenHeader', 'evenFooter'] };
        var editors = {};

        function toolbar(target) {
            var bar = SO.el('div', { style: { display: 'flex', gap: '2px', flexWrap: 'wrap', marginBottom: '4px' } });
            [
                ['fa-bold', function () { exec('bold'); }, 'd_bold'], ['fa-italic', function () { exec('italic'); }, 'd_italic'], ['fa-underline', function () { exec('underline'); }, 'd_underline'],
                ['fa-align-left', function () { exec('justifyLeft'); }, 'd_align_left'], ['fa-align-center', function () { exec('justifyCenter'); }, 'd_align_center'], ['fa-align-right', function () { exec('justifyRight'); }, 'd_align_right'],
                ['fa-hashtag', function () { exec('insertHTML', fieldSpan('page')); }, 'd_field_page'],
                ['fa-layer-group', function () { exec('insertHTML', fieldSpan('pages')); }, 'd_field_pages'],
                ['fa-calendar-day', function () { exec('insertHTML', fieldSpan('date')); }, 'd_field_date'],
                ['fa-heading', function () { exec('insertHTML', fieldSpan('title')); }, 'd_field_title']
            ].forEach(function (b) {
                var btn = SO.el('button', { type: 'button', class: 'so-rb', 'data-tip': b[2], html: '<i class="fas ' + b[0] + '"></i>' });
                btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
                btn.addEventListener('click', function () {
                    if (!target().contains(getSelection().anchorNode)) { target().focus(); placeCaret(target().lastElementChild || target(), true); }
                    b[1]();
                });
                bar.appendChild(btn);
            });
            return bar;
        }

        function makeEditor(html) {
            var ed = SO.el('div', { contenteditable: 'true', class: 'sd-hf-edit', style: { border: '1px solid var(--so-border-strong)', borderRadius: '6px', padding: '8px 10px', minHeight: '56px', background: '#fff', fontFamily: SO.fontStack(s.defaultFont), fontSize: '10pt', outline: 'none', whiteSpace: 'pre-wrap' } });
            ed.innerHTML = html || '<p><br></p>';
            ed.addEventListener('focus', function () { ed.style.borderColor = 'var(--so-accent)'; });
            ed.addEventListener('blur', function () { ed.style.borderColor = ''; });
            return ed;
        }

        SO.dialog({
            title: 'd_header_footer', width: 640,
            body: function (body) {
                var tabs = SO.el('div', { class: 'so-tabs-inline' });
                var panels = {};
                ['default', 'first', 'even'].forEach(function (v) {
                    var tb = SO.el('button', { type: 'button', text: SO.t('d_hf_' + v), dataset: { v: v } });
                    tb.addEventListener('click', function () { selectTab(v); });
                    tabs.appendChild(tb);
                    var panel = SO.el('div', { class: 'so-form' });
                    var he = makeEditor(hf[keys[v][0]]);
                    var fe = makeEditor(hf[keys[v][1]]);
                    editors[v] = { header: he, footer: fe };
                    var hfld = SO.el('div', { class: 'so-field' }, SO.el('label', { text: SO.t('d_header') }), toolbar(function () { return document.activeElement === fe ? fe : he; }), he);
                    var ffld = SO.el('div', { class: 'so-field' }, SO.el('label', { text: SO.t('d_footer') }), toolbar(function () { return document.activeElement === he ? he : fe; }), fe);
                    panel.appendChild(hfld);
                    panel.appendChild(ffld);
                    panels[v] = panel;
                    body.appendChild(panel);
                });
                body.insertBefore(tabs, body.firstChild);
                var opts = SO.el('div', { class: 'so-form', style: { marginTop: '14px' } });
                var cbFirst = SO.el('input', { type: 'checkbox' });
                cbFirst.checked = !!hf.differentFirst;
                var cbEven = SO.el('input', { type: 'checkbox' });
                cbEven.checked = !!hf.differentOddEven;
                var start = SO.el('input', { type: 'number', class: 'so-input', min: 0, value: hf.startAt || 1, style: { width: '90px' } });
                opts.appendChild(SO.el('label', { class: 'so-field is-inline' }, cbFirst, SO.el('span', { text: SO.t('d_hf_diff_first') })));
                opts.appendChild(SO.el('label', { class: 'so-field is-inline' }, cbEven, SO.el('span', { text: SO.t('d_hf_diff_odd_even') })));
                opts.appendChild(SO.el('label', { class: 'so-field is-inline' }, SO.el('span', { text: SO.t('d_start_page_number') }), start));
                body.appendChild(opts);
                function refreshTabs() {
                    SO.$$('button', tabs).forEach(function (b) {
                        var v = b.dataset.v;
                        b.hidden = (v === 'first' && !cbFirst.checked) || (v === 'even' && !cbEven.checked);
                    });
                    if ((variant === 'first' && !cbFirst.checked) || (variant === 'even' && !cbEven.checked)) selectTab('default');
                }
                function selectTab(v) {
                    variant = v;
                    SO.$$('button', tabs).forEach(function (b) { b.classList.toggle('is-active', b.dataset.v === v); });
                    Object.keys(panels).forEach(function (k) { panels[k].hidden = k !== v; });
                    setTimeout(function () { var ed = editors[v][which === 'footer' ? 'footer' : 'header']; ed.focus(); placeCaret(ed.lastElementChild || ed, true); }, 80);
                }
                cbFirst.addEventListener('change', refreshTabs);
                cbEven.addEventListener('change', refreshTabs);
                body._opts = { cbFirst: cbFirst, cbEven: cbEven, start: start };
                refreshTabs();
                selectTab(variant);
            },
            enterSubmits: false,
            buttons: [
                { label: 'c_cancel', value: null },
                { label: 'c_ok', primary: true, value: 'ok' }
            ],
            onOpen: function (dlg) { C._hfDlg = dlg; }
        }).then(function (v) {
            if (v !== 'ok') return;
            var body = C._hfDlg.body;
            var o = body._opts;
            var clean = function (ed) {
                var html = SDIO.sanitize(ed.innerHTML, { trusted: true });
                var d = document.createElement('div');
                d.innerHTML = html;
                return d.textContent.trim() || d.querySelector('.sd-field,img') ? html : '';
            };
            var next = Object.assign({}, App.settings.hf, {
                header: clean(editors['default'].header), footer: clean(editors['default'].footer),
                firstHeader: clean(editors.first.header), firstFooter: clean(editors.first.footer),
                evenHeader: clean(editors.even.header), evenFooter: clean(editors.even.footer),
                differentFirst: o.cbFirst.checked, differentOddEven: o.cbEven.checked,
                startAt: Math.max(0, parseInt(o.start.value, 10) || 1)
            });
            C.setSettings({ hf: next });
        });
    };

    C.removeHeaderFooter = function (which) {
        var hf = Object.assign({}, App.settings.hf);
        if (which === 'header') { hf.header = ''; hf.firstHeader = ''; hf.evenHeader = ''; }
        else { hf.footer = ''; hf.firstFooter = ''; hf.evenFooter = ''; }
        C.setSettings({ hf: hf });
    };

    // =============================================================== TOC
    C.headings = function (maxLevel) {
        maxLevel = maxLevel || 4;
        return SO.$$('h1,h2,h3,h4', editor).filter(function (h) {
            return +h.tagName[1] <= maxLevel && !h.closest('.sd-toc,[contenteditable="false"]') && h.textContent.trim();
        });
    };

    function ensureHid(h, seen) {
        var id = h.getAttribute('data-hid');
        if (!id || seen[id]) { id = SO.uid('h'); h.setAttribute('data-hid', id); }
        seen[id] = true;
        return id;
    }

    C.pageOf = function (el) {
        var g = App.geometry();
        var y = (el.getBoundingClientRect().top - editor.getBoundingClientRect().top) / App.zoom;
        return Math.max(0, Math.floor((y + 1) / g.pitch)) + ((App.settings.hf && App.settings.hf.startAt) || 1);
    };

    C.renderToc = function (toc) {
        var levels = +toc.getAttribute('data-levels') || 3;
        var seen = {};
        SO.$$('h1,h2,h3,h4', editor).forEach(function (h) { if (h.getAttribute('data-hid')) { if (seen[h.getAttribute('data-hid')]) h.removeAttribute('data-hid'); else seen[h.getAttribute('data-hid')] = true; } });
        seen = {};
        var hs = C.headings(levels);
        var html = '<div class="sd-toc-title">' + SO.esc(toc.getAttribute('data-title') || SO.t('d_toc_title')) + '</div>';
        if (!hs.length) html += '<div class="sd-toc-empty">' + SO.esc(SO.t('d_toc_empty')) + '</div>';
        hs.forEach(function (h) {
            var id = ensureHid(h, seen);
            html += '<div class="sd-toc-row lvl-' + h.tagName[1] + '" data-target="' + id + '"><span class="t-text">' + SO.esc(h.textContent.trim()) + '</span><span class="t-dots"></span><span class="t-page">' + C.pageOf(h) + '</span></div>';
        });
        toc.innerHTML = html;
    };

    C.refreshTocPages = function () {
        SO.$$('.sd-toc .sd-toc-row', editor).forEach(function (row) {
            var h = editor.querySelector('[data-hid="' + row.getAttribute('data-target') + '"]');
            if (!h) return;
            var p = String(C.pageOf(h));
            var el = row.querySelector('.t-page');
            if (el.textContent !== p) el.textContent = p;
        });
        if (C.renderNav && !document.getElementById('sdNavPane').hidden) C.renderNavSoon();
    };

    C.insertToc = function (levels) {
        App.restoreRange();
        App.change(function () {
            var existing = editor.querySelector('.sd-toc');
            if (existing) { existing.setAttribute('data-levels', levels || 3); C.renderToc(existing); return; }
            var toc = SO.el('div', { class: 'sd-toc', contenteditable: 'false', 'data-toc': '1', 'data-levels': levels || 3 });
            var p = SO.el('p', { html: '<br>' });
            insertBlockAfterCaret([toc, p], p);
            C.renderToc(toc);
        });
        App.layoutNow();
        C.refreshTocPages();
    };

    C.updateToc = function () {
        var tocs = SO.$$('.sd-toc', editor);
        if (!tocs.length) { SO.toast('d_toc_none', { type: 'warn' }); return; }
        App.change(function () { tocs.forEach(C.renderToc); });
        App.layoutNow();
        C.refreshTocPages();
        SO.toast('d_toc_updated', { type: 'success' });
    };

    C.removeToc = function () {
        var tocs = SO.$$('.sd-toc', editor);
        if (!tocs.length) return;
        App.change(function () { tocs.forEach(function (t) { t.remove(); }); });
    };

    C.gotoHeading = function (hid) {
        var h = editor.querySelector('[data-hid="' + hid + '"]');
        if (!h) { C.updateToc(); return; }
        App.scrollToElement(h);
        editor.focus({ preventScroll: true });
        placeCaret(h);
    };

    // =========================================================== notes
    C.renderNotes = function () {
        var refs = SO.$$('.sd-fn', editor);
        var block = editor.querySelector(':scope > .sd-notes');
        C._noteCount = refs.length;
        if (!refs.length) { if (block) block.remove(); return; }
        if (!block) block = SO.el('div', { class: 'sd-notes', contenteditable: 'false' });
        if (block !== editor.lastElementChild) editor.appendChild(block);
        var html = '';
        refs.forEach(function (ref, i) {
            var id = ref.getAttribute('data-fn');
            var note = App.notes.filter(function (n) { return n.id === id; })[0];
            if (!note) { note = { id: id, text: '' }; App.notes.push(note); }
            if (ref.textContent !== String(i + 1)) ref.textContent = String(i + 1);
            html += '<div class="sd-notes-item"><b>' + (i + 1) + '</b><span>' + SO.esc(note.text || '…') + '</span></div>';
        });
        if (block.innerHTML !== html) block.innerHTML = html;
        var prev = block.previousElementSibling;
        if (!prev || prev.getAttribute('contenteditable') === 'false' || prev.tagName === 'TABLE') block.before(SO.el('p', { html: '<br>' }));
    };

    C.insertNote = function () {
        App.restoreRange();
        var id = SO.uid('fn');
        App.change(function () {
            App.notes.push({ id: id, text: '' });
            C.insertInline(SO.el('sup', { class: 'sd-fn', 'data-fn': id, contenteditable: 'false', text: '*' }));
            C.renderNotes();
        });
        C.editNote(id, true);
    };

    C.editNote = function (id, isNew) {
        var note = App.notes.filter(function (n) { return n.id === id; })[0];
        if (!note) return;
        SO.dialog({
            title: 'd_footnote', width: 480,
            body: '<div class="so-field"><label>' + SO.esc(SO.t('d_footnote_text')) + '</label><textarea class="so-input" rows="4" id="sdNoteText"></textarea></div>',
            onOpen: function (dlg) { dlg.$('#sdNoteText').value = note.text || ''; },
            enterSubmits: false,
            buttons: [
                { label: 'c_delete', danger: false, value: 'del' },
                { label: 'c_cancel', value: null },
                { label: 'c_ok', primary: true, value: 'ok', onClick: function (dlg) { C._noteVal = dlg.$('#sdNoteText').value; } }
            ]
        }).then(function (v) {
            if (v === 'ok') {
                App.change(function () { note.text = C._noteVal.trim(); C.renderNotes(); });
            } else if (v === 'del' || (isNew && v === null && !note.text)) {
                App.change(function () {
                    SO.$$('.sd-fn[data-fn="' + id + '"]', editor).forEach(function (r) { r.remove(); });
                    App.notes = App.notes.filter(function (n) { return n.id !== id; });
                    C.renderNotes();
                });
            }
        });
    };

    C.onEditorInput = function () {
        var n = editor.querySelectorAll('.sd-fn').length;
        if (n !== C._noteCount) C.renderNotes();
        if (C.findRefreshSoon && !document.getElementById('sdFindPane').hidden) C.findRefreshSoon();
        if (C.renderNavSoon && !document.getElementById('sdNavPane').hidden) C.renderNavSoon();
        if (C.commentsRefreshSoon && !document.getElementById('sdCommentPane').hidden) C.commentsRefreshSoon();
    };
})(window);
