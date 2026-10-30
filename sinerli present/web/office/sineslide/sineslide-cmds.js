/**
 * Sinerli Present — perintah: format teks & paragraf, format bentuk, susunan
 * (urutan, perataan, grup, putar), slide (baru, gandakan, sembunyikan, tata
 * letak), desain (tema, varian, font, latar), transisi, animasi, sisip dasar,
 * menu konteks, dan sinkron status ribbon.
 */
(function (global) {
    'use strict';

    var App = global.SineSlide, M = global.SSM, R = global.SSR;
    var C = App.cmd;

    function textualSel() { return App.selected().filter(function (e) { return C.isTextual(e) || e.type === 'table'; }); }
    function editingText() { return App.editing && App.editing.tx; }
    function selectionInEditor() {
        var ed = App.editing;
        var sel = window.getSelection();
        return ed && ed.tx && sel.rangeCount && ed.tx.contains(sel.anchorNode) ? sel : null;
    }
    function afterInline() { C.commitTextSoon(); C.updateRibbonSoon(); }

    /** Membersihkan properti gaya inline tertentu dari HTML (untuk format seluruh kotak). */
    C.stripInline = function (html, props, tags) {
        if (!html) return html;
        var d = document.createElement('div');
        d.innerHTML = html;
        SO.$$('[style]', d).forEach(function (n) {
            props.forEach(function (p) { n.style.removeProperty(p); });
            if (!n.getAttribute('style')) n.removeAttribute('style');
        });
        (tags || []).forEach(function (tag) {
            SO.$$(tag, d).forEach(function (n) { var f = document.createDocumentFragment(); while (n.firstChild) f.appendChild(n.firstChild); n.replaceWith(f); });
        });
        SO.$$('span:not([style])', d).forEach(function (n) { var f = document.createDocumentFragment(); while (n.firstChild) f.appendChild(n.firstChild); n.replaceWith(f); });
        return d.innerHTML;
    };

    function applyWhole(label, fn) {
        var els = textualSel();
        if (!els.length) return false;
        App.change(label, function () {
            els.forEach(function (e) {
                e.st = e.st || {};
                fn(e);
                if (e.type === 'table') e.cells.forEach(function (row) { row.forEach(function (cell) { if (fn.cell) fn.cell(cell); }); });
            });
        });
        return true;
    }

    // ============================================================ teks
    var STATE_KEY = { bold: 'b', italic: 'i', underline: 'u', strikeThrough: 's' };
    var STATE_CSS = { bold: ['font-weight'], italic: ['font-style'], underline: ['text-decoration', 'text-decoration-line'], strikeThrough: ['text-decoration', 'text-decoration-line'] };
    var STATE_TAGS = { bold: ['b', 'strong'], italic: ['i', 'em'], underline: ['u'], strikeThrough: ['s', 'strike'] };

    C.textCmd = function (cmd) {
        if (editingText()) {
            document.execCommand('styleWithCSS', false, cmd === 'subscript' || cmd === 'superscript' ? false : true);
            document.execCommand(cmd);
            document.execCommand('styleWithCSS', false, true);
            afterInline();
            return;
        }
        if (cmd === 'subscript' || cmd === 'superscript') return;
        var key = STATE_KEY[cmd];
        var first = textualSel()[0];
        if (!first) return;
        var on = !(first.st && first.st[key]);
        var fn = function (e) { e.st[key] = on || undefined; if (e.html) e.html = C.stripInline(e.html, STATE_CSS[cmd], STATE_TAGS[cmd]); };
        fn.cell = function (cell) { if (cell.html) cell.html = C.stripInline(cell.html, STATE_CSS[cmd], STATE_TAGS[cmd]); };
        applyWhole(cmd, fn);
    };

    function selectNodes(nodes) {
        if (!nodes.length) return;
        var r = document.createRange();
        r.setStartBefore(nodes[0]);
        r.setEndAfter(nodes[nodes.length - 1]);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
    }

    C.fontName = function (name) {
        if (!name) return;
        if (editingText()) {
            var sel = selectionInEditor();
            if (sel && !sel.isCollapsed) { document.execCommand('styleWithCSS', false, true); document.execCommand('fontName', false, name); afterInline(); return; }
        }
        if (App.editing) { var id = App.editing.id; C.endEdit(); App.select([id]); }
        var fn = function (e) { e.st.ff = name; if (e.html) e.html = C.stripInline(e.html, ['font-family']); };
        fn.cell = function (cell) { if (cell.html) cell.html = C.stripInline(cell.html, ['font-family']); };
        applyWhole('font', fn);
    };

    C.fontSize = function (pt) {
        pt = parseFloat(pt);
        if (!pt || pt < 1 || pt > 400) return;
        var ed = App.editing;
        if (editingText()) {
            var sel = selectionInEditor();
            if (sel && !sel.isCollapsed) {
                document.execCommand('styleWithCSS', false, false);
                document.execCommand('fontSize', false, '7');
                document.execCommand('styleWithCSS', false, true);
                var spans = [];
                SO.$$('font[size="7"]', ed.tx).forEach(function (f) {
                    var sp = document.createElement('span');
                    sp.style.fontSize = pt + 'pt';
                    while (f.firstChild) sp.appendChild(f.firstChild);
                    f.replaceWith(sp);
                    SO.$$('[style]', sp).forEach(function (n) { n.style.removeProperty('font-size'); });
                    spans.push(sp);
                });
                SO.$$('span[style*="xxx-large"]', ed.tx).forEach(function (sp) { sp.style.fontSize = pt + 'pt'; spans.push(sp); });
                selectNodes(spans);
                afterInline();
                return;
            }
            var id = ed.id; C.endEdit(); App.select([id]);
        }
        var fn = function (e) { e.st.fs = pt; if (e.html) e.html = C.stripInline(e.html, ['font-size']); if (e.type === 'text' && e.autofit === 'grow') e._fit = true; };
        fn.cell = function (cell) { if (cell.html) cell.html = C.stripInline(cell.html, ['font-size']); };
        applyWhole('font-size', fn);
        App.selected().forEach(function (e) { if (e._fit) { delete e._fit; C.fitGrowHeight(e); } });
    };

    var SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
    C.fontSizeStep = function (dir) {
        var cur = C.currentStyle().fs || 18;
        var next = dir > 0 ? SIZES.filter(function (s) { return s > cur + 0.01; })[0] || cur + 8 : SIZES.filter(function (s) { return s < cur - 0.01; }).pop() || Math.max(1, cur - 1);
        C.fontSize(next);
    };

    C.fontColor = function (color) {
        if (color === 'auto') color = 'theme:text';
        if (editingText()) {
            var sel = selectionInEditor();
            if (sel && !sel.isCollapsed) { document.execCommand('styleWithCSS', false, true); document.execCommand('foreColor', false, M.color(color, App.pal())); afterInline(); return; }
            var id = App.editing.id; C.endEdit(); App.select([id]);
        }
        var fn = function (e) { e.st.color = color; if (e.html) e.html = C.stripInline(e.html, ['color']); };
        fn.cell = function (cell) { delete cell.color; if (cell.html) cell.html = C.stripInline(cell.html, ['color']); };
        applyWhole('font-color', fn);
    };

    C.highlight = function (color) {
        if (editingText()) {
            document.execCommand('styleWithCSS', false, true);
            document.execCommand('hiliteColor', false, color || 'transparent');
            afterInline();
            return;
        }
        applyWhole('highlight', function (e) { e.st.hl = color || undefined; if (e.html) e.html = C.stripInline(e.html, ['background-color']); });
    };

    C.clearFormat = function () {
        if (editingText()) { document.execCommand('removeFormat'); afterInline(); return; }
        var fn = function (e) {
            ['b', 'i', 'u', 's', 'hl', 'shadow', 'caps', 'ls'].forEach(function (k) { delete e.st[k]; });
            if (e.html) e.html = C.stripInline(e.html, ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'letter-spacing', 'text-transform'], ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup']);
        };
        fn.cell = function (cell) { if (cell.html) cell.html = C.stripInline(cell.html, ['color', 'background-color', 'font-family', 'font-size'], ['b', 'strong', 'i', 'em', 'u']); };
        applyWhole('clear-format', fn);
    };

    function transformText(html, mode) {
        var d = document.createElement('div');
        d.innerHTML = html;
        var walker = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
        var first = true, n;
        while ((n = walker.nextNode())) {
            var t = n.nodeValue;
            if (mode === 'upper') t = t.toLocaleUpperCase(SO.locale());
            else if (mode === 'lower') t = t.toLocaleLowerCase(SO.locale());
            else if (mode === 'title') t = t.toLocaleLowerCase(SO.locale()).replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toLocaleUpperCase(SO.locale()); });
            else if (mode === 'sentence') { t = t.toLocaleLowerCase(SO.locale()); if (first && /\S/.test(t)) { t = t.replace(/\S/, function (c) { return c.toLocaleUpperCase(SO.locale()); }); first = false; } t = t.replace(/([.!?]\s+)(\S)/g, function (m, a, b) { return a + b.toLocaleUpperCase(SO.locale()); }); }
            else if (mode === 'toggle') t = t.split('').map(function (c) { var u = c.toLocaleUpperCase(SO.locale()); return c === u ? c.toLocaleLowerCase(SO.locale()) : u; }).join('');
            n.nodeValue = t;
        }
        return d.innerHTML;
    }
    C.changeCase = function (mode) {
        if (editingText()) {
            var sel = selectionInEditor();
            if (sel && !sel.isCollapsed) {
                var txt = sel.toString();
                var d = document.createElement('div');
                d.textContent = txt;
                var out = transformText(d.innerHTML, mode);
                var tmp = document.createElement('div'); tmp.innerHTML = out;
                document.execCommand('insertText', false, tmp.textContent);
                afterInline();
                return;
            }
            var id = App.editing.id; C.endEdit(); App.select([id]);
        }
        applyWhole('case', function (e) { if (e.html) e.html = transformText(e.html, mode); });
    };

    C.align = function (a) {
        if (editingText()) {
            document.execCommand('styleWithCSS', false, true);
            document.execCommand({ left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' }[a]);
            afterInline();
            return;
        }
        var fn = function (e) { e.st.align = a; if (e.html) e.html = C.stripInline(e.html, ['text-align']); };
        fn.cell = function (cell) { delete cell.align; };
        applyWhole('align', fn);
    };
    C.valign = function (v) {
        var els = App.selected().filter(function (e) { return C.isTextual(e) || e.type === 'table'; });
        if (App.editing && App.editing.table && App.editing.cell) {
            var t = App.elById(App.editing.id);
            var cell = t.cells[App.editing.cell.r][App.editing.cell.c];
            C.endEdit();
            App.change('valign', function () { cell.valign = v; });
            return;
        }
        if (App.editing) C.commitText();
        App.change('valign', function () { els.forEach(function (e) { if (e.type === 'table') e.cells.forEach(function (r) { r.forEach(function (c) { c.valign = v; }); }); else { e.st = e.st || {}; e.st.valign = v; } }); });
        if (App.editing) { var n = App.editing.node.querySelector('.ss-text'); if (n) n.style.justifyContent = v === 'middle' ? 'center' : v === 'bottom' ? 'flex-end' : 'flex-start'; }
    };
    C.lineSpacing = function (lh) {
        if (App.editing) C.commitText();
        var els = textualSel();
        App.change('line-spacing', function () { els.forEach(function (e) { e.st = e.st || {}; e.st.lh = +lh; if (e.html) e.html = C.stripInline(e.html, ['line-height']); }); }, { render: App.editing ? 'thumb' : 'slide' });
        if (App.editing) App.editing.tx.style.lineHeight = String(lh);
    };

    function listify(html, tag) {
        var d = document.createElement('div');
        d.innerHTML = html || '';
        var hasSame = d.querySelector(tag);
        var lines = [];
        var collect = function (node) {
            Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
                if (ch.nodeType === 1 && /^(UL|OL)$/.test(ch.tagName)) { SO.$$('li', ch).forEach(function (li) { lines.push(li.innerHTML); }); return; }
                if (ch.nodeType === 1 && /^(DIV|P|LI)$/.test(ch.tagName)) { lines.push(ch.innerHTML); return; }
                if (ch.nodeType === 1 && ch.tagName === 'BR') { lines.push(''); return; }
                var last = lines.length ? lines.pop() : '';
                lines.push(last + (ch.nodeType === 3 ? SO.esc(ch.nodeValue) : ch.outerHTML));
            });
        };
        collect(d);
        if (!lines.length) lines = [''];
        if (hasSame || !tag) return lines.map(function (l) { return '<div>' + (l || '<br>') + '</div>'; }).join('');
        return '<' + tag + '>' + lines.map(function (l) { return '<li>' + (l || '<br>') + '</li>'; }).join('') + '</' + tag + '>';
    }
    C.bullets = function (tag, style) {
        if (editingText() && !App.editing.table) {
            document.execCommand(tag === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
            if (style) SO.$$(tag, App.editing.tx).forEach(function (l) { l.style.listStyleType = style; });
            afterInline();
            return;
        }
        var els = App.selected().filter(C.isTextual);
        App.change('bullets', function () {
            els.forEach(function (e) {
                e.html = listify(e.html, tag);
                if (style) { var d = document.createElement('div'); d.innerHTML = e.html; SO.$$(tag, d).forEach(function (l) { l.setAttribute('style', 'list-style-type: ' + style); }); e.html = M.sanitize(d.innerHTML); }
            });
        });
    };
    C.indent = function (dir) {
        if (editingText()) { document.execCommand(dir > 0 ? 'indent' : 'outdent'); afterInline(); return; }
        var els = App.selected().filter(C.isTextual);
        App.change('indent', function () {
            els.forEach(function (e) {
                var d = document.createElement('div');
                d.innerHTML = e.html || '';
                SO.$$('div, p, li', d).forEach(function (n) {
                    var cur = parseFloat(n.style.marginLeft) || 0;
                    var next = Math.max(0, cur + dir * 24);
                    n.style.marginLeft = next ? next + 'pt' : '';
                    if (!n.getAttribute('style')) n.removeAttribute('style');
                });
                e.html = M.sanitize(d.innerHTML);
            });
        });
    };
    C.textEffect = function (key) {
        if (App.editing) C.commitText();
        var first = textualSel()[0];
        if (!first) return;
        var on = !(first.st && first.st[key]);
        applyWhole('text-effect', function (e) { e.st[key] = on || undefined; });
    };

    /** Gaya efektif di posisi kursor / elemen terpilih (untuk ribbon). */
    C.currentStyle = function () {
        var pal = App.pal();
        var ed = App.editing;
        var sel = selectionInEditor();
        if (ed && sel) {
            var node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentNode : sel.anchorNode;
            if (node && ed.tx.contains(node)) {
                var cs = getComputedStyle(node);
                var ff = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
                var out = {
                    ff: ff, fs: Math.round(parseFloat(cs.fontSize) * 72 / 96 * 2) / 2, color: SO.toHex(cs.color),
                    b: document.queryCommandState('bold'), i: document.queryCommandState('italic'), u: document.queryCommandState('underline'), s: document.queryCommandState('strikeThrough'),
                    sub: document.queryCommandState('subscript'), sup: document.queryCommandState('superscript'),
                    align: cs.textAlign === 'start' ? 'left' : cs.textAlign === 'end' ? 'right' : cs.textAlign,
                    ul: document.queryCommandState('insertUnorderedList'), ol: document.queryCommandState('insertOrderedList')
                };
                // Transform autofit memperkecil ukuran terukur; kembalikan ke nilai asli.
                return out;
            }
        }
        var e = textualSel()[0] || App.selected()[0];
        if (!e || !e.st) return {};
        var st = e.st;
        return {
            ff: M.font(st.ff, pal), fs: st.fs, color: M.color(st.color, pal), b: !!st.b, i: !!st.i, u: !!st.u, s: !!st.s, align: st.align || 'left',
            ul: /<ul/i.test(e.html || ''), ol: /<ol/i.test(e.html || '')
        };
    };

    // ============================================================ bentuk
    function shapeSel() { return App.selected().filter(function (e) { return e.type !== 'group' || true; }); }
    C.shapeFill = function (color) {
        var els = shapeSel().filter(function (e) { return e.type === 'shape' || e.type === 'text' || e.type === 'icon'; });
        if (!els.length) return;
        if (App.editing) C.commitText();
        App.change('fill', function () {
            els.forEach(function (e) {
                if (e.type === 'icon') { e.color = color || 'theme:accent1'; return; }
                e.fill = color ? { type: 'solid', color: color, opacity: e.fill && e.fill.opacity } : { type: 'none' };
            });
        }, { render: App.editing ? 'thumb' : 'slide' });
        if (App.editing) { var id = App.editing.id; C.endEdit(); App.select([id]); }
    };
    C.shapeOutline = function (color) {
        var els = shapeSel().filter(function (e) { return e.type === 'shape' || e.type === 'text' || e.type === 'line' || e.type === 'image'; });
        if (!els.length) return;
        if (App.editing) { var id = App.editing.id; C.endEdit(); App.select([id]); }
        App.change('outline', function () {
            els.forEach(function (e) {
                if (!color && e.type === 'line') return;
                e.line = Object.assign({}, e.line || {}, color ? { type: 'solid', color: color, w: (e.line && e.line.w) || (e.type === 'line' ? 2 : 1) } : { type: 'none' });
            });
        });
    };
    C.outlineWidth = function (w) {
        var els = App.selected().filter(function (e) { return e.line; });
        App.change('outline-width', function () { els.forEach(function (e) { e.line = Object.assign({ type: 'solid', color: 'theme:text' }, e.line, { w: +w }); if (e.line.type === 'none') e.line.type = 'solid'; }); });
    };
    C.outlineDash = function (d) {
        var els = App.selected().filter(function (e) { return e.line; });
        App.change('outline-dash', function () { els.forEach(function (e) { e.line = Object.assign({ type: 'solid', color: 'theme:text', w: 1 }, e.line, { dash: d }); if (e.line.type === 'none') e.line.type = 'solid'; }); });
    };
    C.lineEnds = function (which, kind) {
        var els = App.selected().filter(function (e) { return e.type === 'line'; });
        App.change('arrows', function () { els.forEach(function (e) { e.line[which] = kind; }); });
    };
    C.shadow = function (preset) {
        var els = App.selected();
        if (!els.length) return;
        App.change('shadow', function () {
            els.forEach(function (e) {
                if (e.type === 'text' || e.type === 'table') { if (e.type === 'text' && (!e.fill || e.fill.type === 'none')) { e.st = e.st || {}; e.st.shadow = preset !== 'none' || undefined; return; } }
                if (preset === 'none') delete e.shadow;
                else e.shadow = { outer: { dist: 4, blur: 8, angle: 45, opacity: 0.35 }, soft: { dist: 0, blur: 18, angle: 90, opacity: 0.3 }, hard: { dist: 6, blur: 0, angle: 45, opacity: 0.45 }, below: { dist: 10, blur: 16, angle: 90, opacity: 0.28 } }[preset] || { dist: 4, blur: 8 };
            });
        });
    };
    C.opacity = function (v) {
        var els = App.selected();
        App.change('opacity', function () { els.forEach(function (e) { e.opacity = v >= 1 ? undefined : v; }); }, { merge: 'opacity' });
    };
    C.changeShape = function (shape) {
        var els = App.selected().filter(function (e) { return e.type === 'shape' || e.type === 'text' || e.type === 'image'; });
        if (!els.length) return;
        App.change('change-shape', function () {
            els.forEach(function (e) {
                if (e.type === 'image') { e.mask = shape; return; }
                if (e.type === 'text') { e.type = 'shape'; e.fill = e.fill && e.fill.type !== 'none' ? e.fill : { type: 'solid', color: 'theme:accent1' }; e.autofit = 'none'; }
                e.shape = shape;
                delete e.adj;
            });
        });
    };
    /** Gaya cepat: [isian, garis, warna teks] per aksen tema. */
    C.QUICK_STYLES = (function () {
        var out = [];
        for (var i = 1; i <= 6; i++) {
            var a = 'theme:accent' + i;
            out.push({ id: 'solid' + i, fill: { type: 'solid', color: a }, line: { type: 'solid', color: a, w: 1 }, text: '#FFFFFF' });
        }
        for (var j = 1; j <= 6; j++) {
            var b = 'theme:accent' + j;
            out.push({ id: 'outline' + j, fill: { type: 'solid', color: 'theme:bg' }, line: { type: 'solid', color: b, w: 2 }, text: b });
        }
        for (var k = 1; k <= 6; k++) {
            var c = 'theme:accent' + k;
            out.push({ id: 'soft' + k, fill: { type: 'solid', color: c, opacity: 0.2 }, line: { type: 'none' }, text: c });
        }
        for (var m = 1; m <= 6; m++) {
            out.push({ id: 'grad' + m, fill: { type: 'gradient', color: 'theme:accent' + m, color2: 'theme:accent' + (m % 6 + 1), angle: 135 }, line: { type: 'none' }, text: '#FFFFFF', shadow: { dist: 4, blur: 10, angle: 90, opacity: 0.3 } });
        }
        return out;
    })();
    C.quickStyle = function (id) {
        var qs = C.QUICK_STYLES.filter(function (q) { return q.id === id; })[0];
        var els = App.selected().filter(function (e) { return e.type === 'shape' || e.type === 'text'; });
        if (!qs || !els.length) return;
        if (App.editing) { var eid = App.editing.id; C.endEdit(); App.select([eid]); }
        App.change('quick-style', function () {
            els.forEach(function (e) {
                e.fill = M.clone(qs.fill); e.line = M.clone(qs.line);
                if (qs.shadow) e.shadow = M.clone(qs.shadow); else delete e.shadow;
                e.st = e.st || {};
                e.st.color = qs.text;
                if (e.html) e.html = C.stripInline(e.html, ['color']);
            });
        });
    };
    C.setDefaultShape = function () {
        var e = App.selected()[0];
        if (!e || e.type !== 'shape') return;
        App.defaultShapeStyle = { fill: M.clone(e.fill), line: M.clone(e.line), st: M.clone(e.st), shadow: M.clone(e.shadow) };
        SO.toast('s_default_shape_set', { type: 'success' });
    };

    // ============================================================ susun
    C.order = function (mode) {
        var s = App.slide();
        var ids = App.sel.slice();
        if (!ids.length) return;
        App.change('order', function () {
            var picked = s.els.filter(function (e) { return ids.indexOf(e.id) !== -1; });
            var rest = s.els.filter(function (e) { return ids.indexOf(e.id) === -1; });
            if (mode === 'front') s.els = rest.concat(picked);
            else if (mode === 'back') s.els = picked.concat(rest);
            else if (mode === 'forward') {
                for (var i = s.els.length - 2; i >= 0; i--) if (ids.indexOf(s.els[i].id) !== -1 && ids.indexOf(s.els[i + 1].id) === -1) { var t = s.els[i]; s.els[i] = s.els[i + 1]; s.els[i + 1] = t; }
            } else if (mode === 'backward') {
                for (var j = 1; j < s.els.length; j++) if (ids.indexOf(s.els[j].id) !== -1 && ids.indexOf(s.els[j - 1].id) === -1) { var u = s.els[j]; s.els[j] = s.els[j - 1]; s.els[j - 1] = u; }
            }
        });
    };

    C.alignEls = function (mode) {
        var els = App.selected().filter(function (e) { return !e.locked; });
        if (!els.length) return;
        var W = App.deck.size.w, H = App.deck.size.h;
        var ref = els.length > 1 && !App.alignToSlide ? M.bbox(els) : { x: 0, y: 0, w: W, h: H };
        App.change('align-objects', function () {
            els.forEach(function (e) {
                var b = M.rotatedBox(e);
                var dx = 0, dy = 0;
                if (mode === 'left') dx = ref.x - b.x;
                if (mode === 'center') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
                if (mode === 'right') dx = ref.x + ref.w - (b.x + b.w);
                if (mode === 'top') dy = ref.y - b.y;
                if (mode === 'middle') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
                if (mode === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
                C.shiftEl(e, dx, dy);
            });
        });
    };
    C.distribute = function (axis) {
        var els = App.selected().filter(function (e) { return !e.locked; });
        if (els.length < 3 && !App.alignToSlide) { SO.toast('s_distribute_need3', { type: 'warn' }); return; }
        var key = axis === 'h' ? 'x' : 'y', size = axis === 'h' ? 'w' : 'h';
        var boxes = els.map(function (e) { return { e: e, b: M.rotatedBox(e) }; }).sort(function (a, b) { return a.b[key] - b.b[key]; });
        var start = App.alignToSlide ? 0 : boxes[0].b[key];
        var end = App.alignToSlide ? App.deck.size[size] : boxes[boxes.length - 1].b[key] + boxes[boxes.length - 1].b[size];
        var total = boxes.reduce(function (s, x) { return s + x.b[size]; }, 0);
        var gap = (end - start - total) / (boxes.length - 1 || 1);
        App.change('distribute', function () {
            var pos = start;
            boxes.forEach(function (x) {
                var d = pos - x.b[key];
                C.shiftEl(x.e, key === 'x' ? d : 0, key === 'y' ? d : 0);
                pos += x.b[size] + gap;
            });
        });
    };

    C.group = function () {
        var s = App.slide();
        var els = App.selected();
        if (els.length < 2) return;
        if (els.some(function (e) { return e.type === 'table' || e.type === 'video'; })) { SO.toast('s_group_unsupported', { type: 'warn' }); return; }
        var bb = M.bbox(els.map(function (e) { return Object.assign({}, e, { rot: 0 }); }));
        App.change('group', function () {
            var idx = Math.max.apply(null, els.map(function (e) { return s.els.indexOf(e); }));
            var g = { id: M.uid('g'), type: 'group', x: Math.round(bb.x), y: Math.round(bb.y), w: Math.round(bb.w), h: Math.round(bb.h), gw: Math.round(bb.w), gh: Math.round(bb.h), rot: 0, children: [] };
            s.els.forEach(function (e) {
                if (App.sel.indexOf(e.id) === -1) return;
                var c = M.clone(e);
                if (c.type === 'line') { c.x1 -= g.x; c.x2 -= g.x; c.y1 -= g.y; c.y2 -= g.y; M.syncLineBox(c); }
                else { c.x -= g.x; c.y -= g.y; }
                delete c.ph;
                g.children.push(c);
            });
            var remaining = s.els.filter(function (e) { return App.sel.indexOf(e.id) === -1; });
            var insertAt = Math.min(remaining.length, idx - (els.length - 1));
            remaining.splice(Math.max(0, insertAt), 0, g);
            // Animasi anak dipindah ke grup.
            (s.anims || []).forEach(function (a) { if (App.sel.indexOf(a.el) !== -1) a.el = g.id; });
            var seen = {};
            s.anims = (s.anims || []).filter(function (a) { var k = a.el + a.effect; if (a.el === g.id && seen[k]) return false; seen[k] = true; return true; });
            s.els = remaining;
            App.sel = [g.id];
        });
    };
    C.ungroup = function () {
        var s = App.slide();
        var groups = App.selected().filter(function (e) { return e.type === 'group'; });
        if (!groups.length) return;
        App.change('ungroup', function () {
            var newSel = [];
            groups.forEach(function (g) {
                var sx = g.gw ? g.w / g.gw : 1, sy = g.gh ? g.h / g.gh : 1;
                var idx = s.els.indexOf(g);
                var kids = g.children.map(function (c) {
                    var k = M.clone(c);
                    if (k.type === 'line') { k.x1 = g.x + k.x1 * sx; k.x2 = g.x + k.x2 * sx; k.y1 = g.y + k.y1 * sy; k.y2 = g.y + k.y2 * sy; M.syncLineBox(k); }
                    else { k.x = Math.round(g.x + k.x * sx); k.y = Math.round(g.y + k.y * sy); k.w = Math.round(k.w * sx); k.h = Math.round(k.h * sy); }
                    newSel.push(k.id);
                    return k;
                });
                s.els.splice.apply(s.els, [idx, 1].concat(kids));
                s.anims = (s.anims || []).filter(function (a) { return a.el !== g.id; });
            });
            App.sel = newSel;
        });
    };

    C.rotate = function (mode) {
        var els = App.selected().filter(function (e) { return !e.locked; });
        if (!els.length) return;
        App.change('rotate', function () {
            els.forEach(function (e) {
                if (mode === 'flipH' || mode === 'flipV') {
                    if (e.type === 'line') { if (mode === 'flipH') { var t = e.x1; e.x1 = e.x2; e.x2 = t; } else { var u = e.y1; e.y1 = e.y2; e.y2 = u; } return; }
                    e[mode] = !e[mode] || undefined;
                    return;
                }
                if (e.type === 'line') return;
                e.rot = (((e.rot || 0) + (+mode)) % 360 + 360) % 360;
            });
        });
    };

    C.toggleLock = function () {
        var els = App.selected();
        if (!els.length) return;
        var on = !els[0].locked;
        App.change('lock', function () { els.forEach(function (e) { e.locked = on || undefined; }); });
    };

    C.deleteSelection = function () {
        var ids = App.sel.slice();
        if (!ids.length) return;
        var s = App.slide();
        if (App.editing) C.endEdit(true);
        App.change('delete', function () {
            s.els = s.els.filter(function (e) {
                if (ids.indexOf(e.id) === -1) return true;
                // Menghapus placeholder berisi = mengosongkan isinya dulu (seperti PowerPoint).
                if (e.ph && e.html && !M.isEmptyHtml(e.html) && ids.length === 1) { e.html = e.ph === 'body' ? '<ul><li></li></ul>' : ''; return true; }
                if (e.ph === 'picture' && e.asset && ids.length === 1) { e.asset = null; return true; }
                return false;
            });
            s.anims = (s.anims || []).filter(function (a) { return !!M.findEl(s, a.el); });
            App.sel = App.sel.filter(function (id) { return !!M.findEl(s, id); });
        });
    };

    C.duplicate = function () {
        if (App.el.list.contains(document.activeElement) || !App.sel.length) { C.duplicateSlide(); return; }
        var s = App.slide();
        App.change('duplicate', function () {
            var ids = [];
            App.selected().forEach(function (e) { var c = M.cloneEl(e); C.shiftEl(c, 20, 20); s.els.push(c); ids.push(c.id); });
            App.sel = ids;
        });
    };

    C.selectAll = function () {
        if (App.editing) { document.execCommand('selectAll'); return; }
        App.select(App.slide().els.filter(function (e) { return !e.hidden && !e.locked; }).map(function (e) { return e.id; }));
    };

    // ============================================================ slide
    C.newSlide = function (layout) {
        if (App.editing) C.endEdit();
        var cur = App.slide();
        if (!layout) layout = cur ? (cur.layout === 'title' ? 'titleContent' : cur.layout === 'section' ? 'titleContent' : cur.layout) : 'titleContent';
        App.change('new-slide', function () {
            var s = M.newSlide(layout, App.deck.size.w, App.deck.size.h);
            App.deck.slides.splice(App.cur + 1, 0, s);
            App.cur += 1;
            App.sel = [];
        }, { render: 'all' });
        App.syncNotes();
    };
    C.duplicateSlide = function () {
        App.change('duplicate-slide', function () {
            App.deck.slides.splice(App.cur + 1, 0, M.cloneSlide(App.slide()));
            App.cur += 1;
            App.sel = [];
        }, { render: 'all' });
    };
    C.deleteSlide = function () {
        if (App.deck.slides.length <= 1) {
            App.change('delete-slide', function () { App.deck.slides = [M.newSlide('blank', App.deck.size.w, App.deck.size.h)]; App.cur = 0; App.sel = []; }, { render: 'all' });
            return;
        }
        App.change('delete-slide', function () {
            App.deck.slides.splice(App.cur, 1);
            App.cur = Math.min(App.cur, App.deck.slides.length - 1);
            App.sel = [];
        }, { render: 'all' });
    };
    C.hideSlide = function () {
        var s = App.slide();
        App.change('hide-slide', function () { s.hidden = !s.hidden || undefined; }, { render: 'thumbs' });
    };
    C.moveSlide = function (from, to) {
        if (from === to || to < 0 || to >= App.deck.slides.length) return;
        App.change('move-slide', function () {
            var s = App.deck.slides.splice(from, 1)[0];
            App.deck.slides.splice(to, 0, s);
            App.cur = to;
        }, { render: 'all' });
    };

    /** Terapkan tata letak: isi placeholder lama dipindah ke placeholder baru yang sejenis. */
    C.setLayout = function (layout) {
        var s = App.slide();
        if (App.editing) C.endEdit();
        App.change('layout', function () {
            var fresh = M.layoutElements(layout, App.deck.size.w, App.deck.size.h);
            var oldPh = s.els.filter(function (e) { return e.ph; });
            var used = [];
            fresh.forEach(function (n) {
                var match = oldPh.filter(function (o) { return used.indexOf(o) === -1 && (o.ph === n.ph || (/(body|caption)/.test(o.ph) && /(body|caption)/.test(n.ph))); })[0];
                if (!match && n.ph === 'subtitle') match = oldPh.filter(function (o) { return used.indexOf(o) === -1 && o.ph === 'body'; })[0];
                if (match) {
                    used.push(match);
                    if (match.type === 'image' && n.type === 'image') n.asset = match.asset;
                    else if (match.html && !M.isEmptyHtml(match.html)) n.html = match.html;
                    n.id = match.id;
                }
            });
            var others = s.els.filter(function (e) { return !e.ph; });
            // Placeholder berisi yang tidak punya pasangan tetap dipertahankan sebagai kotak teks biasa.
            oldPh.forEach(function (o) {
                if (used.indexOf(o) !== -1) return;
                if ((o.html && !M.isEmptyHtml(o.html)) || (o.type === 'image' && o.asset)) { delete o.ph; others.push(o); }
            });
            s.els = fresh.concat(others);
            s.layout = layout;
            s.anims = (s.anims || []).filter(function (a) { return !!M.findEl(s, a.el); });
            App.sel = [];
        });
    };
    C.resetSlide = function () {
        var s = App.slide();
        App.change('reset-slide', function () {
            var fresh = M.layoutElements(s.layout, App.deck.size.w, App.deck.size.h);
            s.els.forEach(function (e) {
                if (!e.ph) return;
                var f = fresh.filter(function (n) { return n.ph === e.ph && !n._used; })[0];
                if (!f) return;
                f._used = true;
                ['x', 'y', 'w', 'h', 'st', 'fill', 'line', 'autofit'].forEach(function (k) { e[k] = M.clone(f[k]); });
                e.rot = 0;
                if (e.html) e.html = C.stripInline(e.html, ['color', 'font-family', 'font-size', 'text-align']);
            });
            fresh.forEach(function (f) { delete f._used; });
            delete s.bg;
            delete s.hideDecor;
        });
    };

    // ============================================================ desain
    C.setTheme = function (id) {
        App.change('theme', function () {
            var keepFonts = App.deck.theme.fonts;
            App.deck.theme = { id: id, variant: 0 };
            if (keepFonts && keepFonts.custom) App.deck.theme.fonts = keepFonts;
        }, { render: 'all' });
    };
    C.setVariant = function (i) {
        App.change('variant', function () { App.deck.theme.variant = +i; delete App.deck.theme.colors; }, { render: 'all' });
    };
    C.setThemeFonts = function (h, b) {
        App.change('theme-fonts', function () { App.deck.theme.fonts = h ? { h: h, b: b || h, custom: true } : undefined; }, { render: 'all' });
    };
    C.setThemeColor = function (key, color) {
        App.change('theme-color', function () {
            var c = App.deck.theme.colors = Object.assign({}, App.deck.theme.colors || {});
            if (/^accent\d$/.test(key)) { c.accents = (c.accents || []).slice(); c.accents[+key.slice(6) - 1] = color; }
            else c[key] = color;
        }, { render: 'all' });
    };
    C.toggleDecor = function () {
        var s = App.slide();
        App.change('decor', function () { s.hideDecor = !s.hideDecor || undefined; });
    };
    C.setBackground = function (bg, all) {
        App.change('background', function () {
            (all ? App.deck.slides : [App.slide()]).forEach(function (s) { if (bg) s.bg = M.clone(bg); else delete s.bg; });
        }, { render: all ? 'all' : 'slide' });
    };

    // ============================================================ transisi
    C.setTransition = function (type) {
        var s = App.slide();
        App.change('transition', function () {
            if (type === 'none') { if (s.transition) { s.transition.type = 'none'; } return; }
            s.transition = Object.assign({ dur: 0.7, dir: 'left' }, s.transition || {}, { type: type });
        }, { render: 'thumbs' });
        if (type !== 'none' && App.show && App.show.previewTransition) App.show.previewTransition(App.cur);
    };
    C.transitionOpt = function (key, value) {
        var s = App.slide();
        App.change('transition-option', function () {
            s.transition = Object.assign({ type: 'fade', dur: 0.7 }, s.transition || {});
            if (value === null || value === '' || (typeof value === 'number' && isNaN(value))) delete s.transition[key];
            else s.transition[key] = value;
        }, { render: 'thumbs', merge: 'tr-' + key });
    };
    C.applyTransitionAll = function () {
        var t = App.slide().transition;
        App.change('transition-all', function () { App.deck.slides.forEach(function (s) { s.transition = t ? M.clone(t) : null; }); }, { render: 'all' });
        SO.toast('s_applied_all', { type: 'success' });
    };

    // ============================================================ animasi
    C.addAnim = function (effect, replace) {
        var s = App.slide();
        var els = App.selected();
        if (!els.length) { SO.toast('s_select_object_first', { type: 'warn' }); return; }
        var info = M.animInfo(effect);
        App.change('animation', function () {
            s.anims = s.anims || [];
            els.forEach(function (e, i) {
                if (replace !== false) s.anims = s.anims.filter(function (a) { return !(a.el === e.id && M.animInfo(a.effect) && M.animInfo(a.effect).kind === info.kind); });
                s.anims.push({ id: M.uid('a'), el: e.id, effect: effect, trigger: i === 0 ? 'click' : 'with', dur: effect === 'appear' || effect === 'disappear' ? 0 : 0.6, delay: 0, dir: 'bottom' });
            });
        }, { render: 'thumbs' });
        if (App.show && App.show.previewAnims) App.show.previewAnims(els.map(function (e) { return e.id; }));
    };
    C.removeAnims = function (ids) {
        var s = App.slide();
        App.change('remove-animation', function () {
            s.anims = (s.anims || []).filter(function (a) { return ids ? ids.indexOf(a.id) === -1 : App.sel.indexOf(a.el) === -1; });
        }, { render: 'thumbs' });
    };
    C.animOpt = function (key, value, animIds) {
        var s = App.slide();
        var list = (s.anims || []).filter(function (a) { return animIds ? animIds.indexOf(a.id) !== -1 : App.sel.indexOf(a.el) !== -1; });
        if (!list.length) return;
        App.change('animation-option', function () { list.forEach(function (a) { a[key] = value; }); }, { render: 'none', merge: 'anim-' + key });
        if (C.refreshPane) C.refreshPane();
    };
    C.moveAnim = function (id, dir) {
        var s = App.slide();
        var i = (s.anims || []).map(function (a) { return a.id; }).indexOf(id);
        var j = i + dir;
        if (i < 0 || j < 0 || j >= s.anims.length) return;
        App.change('animation-order', function () { var t = s.anims[i]; s.anims[i] = s.anims[j]; s.anims[j] = t; }, { render: 'none' });
        if (C.refreshPane) C.refreshPane();
    };

    // ======================================================= sisip dasar
    C.insertTextBox = function (text, html) {
        var W = App.deck.size.w, H = App.deck.size.h;
        var content = html ? M.sanitize(html.replace(/^[\s\S]*<!--StartFragment-->/, '').replace(/<!--EndFragment-->[\s\S]*$/, '')) : (text ? M.textToHtml(text) : '');
        var e = M.textBox(W * 0.25, H * 0.4, W * 0.5, 60, content);
        App.change('insert-text', function () { App.slide().els.push(e); App.sel = [e.id]; });
        if (content) C.fitGrowHeight(e); else C.startEdit(e.id, { caret: 'end' });
    };

    C.insertImageFile = function (file, pos) {
        var busy = SO.busy('s_inserting_image');
        return SO.prepareImage(file, 2000).then(function (res) {
            busy.done();
            var rec = App.assets.addDataUrl(res.dataUrl);
            var W = App.deck.size.w, H = App.deck.size.h;
            var w = res.width || 400, h = res.height || 300;
            var s = App.slide();
            var ph = pos && pos.phId ? M.findEl(s, pos.phId) : s.els.filter(function (e) { return e.ph === 'picture' && !e.asset; })[0];
            App.change('insert-image', function () {
                if (ph) {
                    ph.asset = rec.id;
                    // Isi placeholder dengan pangkas tengah agar proporsi gambar terjaga.
                    var rImg = w / h, rBox = ph.w / ph.h;
                    if (rImg > rBox) { var cut = (1 - rBox / rImg) / 2; ph.crop = { l: cut, r: cut, t: 0, b: 0 }; }
                    else { var cut2 = (1 - rImg / rBox) / 2; ph.crop = { l: 0, r: 0, t: cut2, b: cut2 }; }
                    App.sel = [ph.id];
                    return;
                }
                var scale = Math.min(1, (W * 0.7) / w, (H * 0.7) / h);
                var ew = w * scale, eh = h * scale;
                var x = pos && pos.x != null ? pos.x - ew / 2 : (W - ew) / 2, y = pos && pos.y != null ? pos.y - eh / 2 : (H - eh) / 2;
                var e = M.image(rec.id, x, y, ew, eh);
                s.els.push(e);
                App.sel = [e.id];
            });
        }).catch(function (err) { busy.done(); SO.toast(err.message || 'c_err_image', { type: 'error' }); });
    };
    C.insertImage = function (phId) {
        SO.pickFile('image/*', true).then(function (files) {
            if (!files) return;
            (Array.isArray(files) ? files : [files]).reduce(function (p, f, i) {
                return p.then(function () { return C.insertImageFile(f, i === 0 && phId ? { phId: phId } : null); });
            }, Promise.resolve());
        });
    };
    C.replaceImage = function () {
        var e = App.selected().filter(function (x) { return x.type === 'image'; })[0];
        if (!e) return;
        SO.pickFile('image/*').then(function (f) {
            if (!f) return;
            SO.prepareImage(Array.isArray(f) ? f[0] : f, 2000).then(function (res) {
                var rec = App.assets.addDataUrl(res.dataUrl);
                App.change('replace-image', function () {
                    e.asset = rec.id;
                    e.h = Math.round(e.w * (res.height / res.width));
                    delete e.crop;
                });
            });
        });
    };
    C.resetImage = function () {
        var els = App.selected().filter(function (x) { return x.type === 'image'; });
        App.change('reset-image', function () { els.forEach(function (e) { delete e.crop; delete e.fx; delete e.mask; delete e.shadow; e.line = { type: 'none' }; e.rot = 0; delete e.flipH; delete e.flipV; delete e.opacity; }); });
    };
    C.imageFx = function (key, value) {
        var els = App.selected().filter(function (x) { return x.type === 'image'; });
        if (!els.length) return;
        App.change('image-fx', function () { els.forEach(function (e) { e.fx = Object.assign({}, e.fx || {}); if (value === null || value === 0 || value === false) delete e.fx[key]; else e.fx[key] = value; }); }, { merge: 'fx-' + key });
    };

    C.insertDateText = function () {
        var d = new Intl.DateTimeFormat(SO.locale(), { dateStyle: 'long' }).format(new Date());
        if (App.editing && App.editing.tx) { document.execCommand('insertText', false, d); C.commitTextSoon(); return; }
        C.insertTextBox(d);
    };
    C.insertSymbolText = function (ch) {
        if (App.editing && App.editing.tx) { document.execCommand('insertText', false, ch); C.commitTextSoon(); return; }
        C.insertTextBox(ch);
    };

    // ============================================================ pelukis format
    C.painter = function (sticky) {
        var e = App.selected()[0];
        if (!e) { SO.toast('s_select_object_first', { type: 'warn' }); return; }
        App.painter = { st: M.clone(e.st), fill: M.clone(e.fill), line: M.clone(e.line), shadow: M.clone(e.shadow), opacity: e.opacity, fx: M.clone(e.fx), sticky: !!sticky, type: e.type };
        document.body.classList.add('ss-painter');
        if (App.ribbon) App.ribbon.setActive('painter', true);
    };
    C.applyPainter = function (id) {
        var p = App.painter;
        var e = App.elById(id);
        if (!p || !e) return;
        App.change('format-painter', function () {
            if (p.st && e.st) { e.st = Object.assign({}, e.st, p.st); if (e.html) e.html = C.stripInline(e.html, ['color', 'font-family', 'font-size', 'font-weight', 'font-style']); }
            if (p.fill && e.fill && e.type !== 'image') e.fill = M.clone(p.fill);
            if (p.line && (e.line || e.type !== 'table')) e.line = M.clone(p.line);
            if (p.shadow) e.shadow = M.clone(p.shadow); else delete e.shadow;
            if (p.fx && e.type === 'image') e.fx = M.clone(p.fx);
            e.opacity = p.opacity;
            App.sel = [id];
        });
        if (!p.sticky) C.cancelPainter();
    };
    C.cancelPainter = function () {
        App.painter = null;
        document.body.classList.remove('ss-painter');
        if (App.ribbon) App.ribbon.setActive('painter', false);
    };

    // ============================================================ menu konteks
    C.textContextMenu = function () {
        return [
            { label: 's_cut', icon: 'fa-scissors', key: 'Mod+X', onClick: function () { document.execCommand('cut'); C.commitTextSoon(); } },
            { label: 'c_copy_cmd', icon: 'fa-copy', key: 'Mod+C', onClick: function () { document.execCommand('copy'); } },
            { label: 's_paste', icon: 'fa-paste', key: 'Mod+V', onClick: function () { C.paste(); } },
            { sep: true },
            { label: 's_font_dialog', icon: 'fa-font', onClick: function () { C.fontDialog(); } },
            { label: 's_link', icon: 'fa-link', key: 'Mod+K', onClick: function () { C.linkDialog(); } },
            { label: 's_bullets', icon: 'fa-list-ul', onClick: function () { C.bullets('ul'); } },
            { label: 's_numbering', icon: 'fa-list-ol', onClick: function () { C.bullets('ol'); } },
            { sep: true },
            { label: 's_translate_case', icon: 'fa-font', submenu: [
                { label: 's_case_sentence', onClick: function () { C.changeCase('sentence'); } }, { label: 's_case_lower', onClick: function () { C.changeCase('lower'); } },
                { label: 's_case_upper', onClick: function () { C.changeCase('upper'); } }, { label: 's_case_title', onClick: function () { C.changeCase('title'); } }, { label: 's_case_toggle', onClick: function () { C.changeCase('toggle'); } }
            ] },
            { label: 's_clear_format', icon: 'fa-text-slash', onClick: C.clearFormat }
        ];
    };

    C.orderMenu = function () {
        return [
            { label: 's_bring_front', icon: 'fa-layer-group', onClick: function () { C.order('front'); } },
            { label: 's_bring_forward', icon: 'fa-arrow-up', onClick: function () { C.order('forward'); } },
            { label: 's_send_backward', icon: 'fa-arrow-down', onClick: function () { C.order('backward'); } },
            { label: 's_send_back', icon: 'fa-layer-group', onClick: function () { C.order('back'); } }
        ];
    };
    C.alignMenu = function () {
        return [
            { label: 's_align_left', icon: 'fa-align-left', onClick: function () { C.alignEls('left'); } },
            { label: 's_align_center', icon: 'fa-align-center', onClick: function () { C.alignEls('center'); } },
            { label: 's_align_right', icon: 'fa-align-right', onClick: function () { C.alignEls('right'); } },
            { sep: true },
            { label: 's_align_top', icon: 'fa-arrow-up', onClick: function () { C.alignEls('top'); } },
            { label: 's_align_middle', icon: 'fa-arrows-up-down', onClick: function () { C.alignEls('middle'); } },
            { label: 's_align_bottom', icon: 'fa-arrow-down', onClick: function () { C.alignEls('bottom'); } },
            { sep: true },
            { label: 's_distribute_h', icon: 'fa-arrows-left-right', onClick: function () { C.distribute('h'); } },
            { label: 's_distribute_v', icon: 'fa-arrows-up-down', onClick: function () { C.distribute('v'); } },
            { sep: true },
            { label: 's_align_to_slide', checked: !!App.alignToSlide, onClick: function () { App.alignToSlide = true; } },
            { label: 's_align_selected', checked: !App.alignToSlide, onClick: function () { App.alignToSlide = false; } }
        ];
    };
    C.rotateMenu = function () {
        return [
            { label: 's_rotate_right', icon: 'fa-rotate-right', onClick: function () { C.rotate(90); } },
            { label: 's_rotate_left', icon: 'fa-rotate-left', onClick: function () { C.rotate(-90); } },
            { label: 's_flip_v', icon: 'fa-arrows-up-down', onClick: function () { C.rotate('flipV'); } },
            { label: 's_flip_h', icon: 'fa-arrows-left-right', onClick: function () { C.rotate('flipH'); } },
            { sep: true },
            { label: 's_size_position', icon: 'fa-up-right-and-down-left-from-center', onClick: function () { C.openFormatPane('size'); } }
        ];
    };

    C.elementContextMenu = function () {
        var sel = App.selected();
        var one = sel.length === 1 ? sel[0] : null;
        var items = [
            { label: 's_cut', icon: 'fa-scissors', key: 'Mod+X', onClick: function () { C.copy(true); } },
            { label: 'c_copy_cmd', icon: 'fa-copy', key: 'Mod+C', onClick: function () { C.copy(false); } },
            { label: 's_paste', icon: 'fa-paste', key: 'Mod+V', disabled: !App.clip, onClick: function () { C.paste(); } },
            { label: 's_duplicate', icon: 'fa-clone', key: 'Mod+D', onClick: C.duplicate },
            { sep: true }
        ];
        if (one && (C.isTextual(one) || one.type === 'table')) items.push({ label: 's_edit_text', icon: 'fa-pen', onClick: function () { C.startEdit(one.id, { caret: 'end' }); } });
        if (one && one.type === 'image') {
            items.push({ label: 's_change_picture', icon: 'fa-image', onClick: C.replaceImage });
            items.push({ label: 's_save_as_picture', icon: 'fa-download', onClick: function () { C.saveElementImage(one.id); } });
        }
        if (one && one.type === 'chart') items.push({ label: 's_edit_data', icon: 'fa-table', onClick: function () { C.chartDataDialog(one.id); } });
        if (sel.length > 1) items.push({ label: 's_group', icon: 'fa-object-group', key: 'Mod+G', onClick: C.group });
        if (sel.some(function (e) { return e.type === 'group'; })) items.push({ label: 's_ungroup', icon: 'fa-object-ungroup', key: 'Mod+Shift+G', onClick: C.ungroup });
        items.push({ label: 's_arrange', icon: 'fa-layer-group', submenu: C.orderMenu() });
        items.push({ label: 's_align', icon: 'fa-align-center', submenu: C.alignMenu() });
        items.push({ label: 's_rotate', icon: 'fa-rotate', submenu: C.rotateMenu() });
        items.push({ sep: true });
        items.push({ label: 's_link', icon: 'fa-link', key: 'Mod+K', onClick: function () { C.linkDialog(); } });
        items.push({ label: 's_add_animation', icon: 'fa-wand-magic-sparkles', onClick: function () { App.ribbon.select('animations'); } });
        items.push({ label: one && one.locked ? 's_unlock' : 's_lock', icon: one && one.locked ? 'fa-lock-open' : 'fa-lock', onClick: C.toggleLock });
        items.push({ label: 's_format_object', icon: 'fa-sliders', onClick: function () { C.openFormatPane(); } });
        items.push({ sep: true });
        items.push({ label: 'c_delete', icon: 'fa-trash', danger: true, onClick: C.deleteSelection });
        return items;
    };

    C.layoutMenu = function (apply) {
        return M.LAYOUTS.map(function (l) {
            return { label: 's_layout_' + l, labelHtml: '<span class="ss-layout-mini">' + C.layoutPreview(l) + '</span>' + SO.esc(SO.t('s_layout_' + l)), checked: apply && App.slide() && App.slide().layout === l, onClick: function () { if (apply) C.setLayout(l); else C.newSlide(l); } };
        });
    };
    /** Pratinjau kecil tata letak (SVG). */
    C.layoutPreview = function (layout) {
        var W = 64, H = 36;
        var els = M.layoutElements(layout, 1280, 720);
        var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '"><rect x=".5" y=".5" width="' + (W - 1) + '" height="' + (H - 1) + '" fill="#fff" stroke="#c8c6c4"/>';
        els.forEach(function (e) {
            var x = e.x / 1280 * W, y = e.y / 720 * H, w = e.w / 1280 * W, h = e.h / 720 * H;
            if (e.ph === 'title') out += '<rect x="' + (x + 1) + '" y="' + (y + h / 2 - 1.6) + '" width="' + Math.max(2, w - 2) + '" height="3.2" rx="1" fill="#8a8886"/>';
            else if (e.ph === 'picture') out += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#e1dfdd"/>';
            else { for (var k = 0; k < Math.min(4, Math.floor(h / 4)); k++) out += '<rect x="' + (x + 1) + '" y="' + (y + 2 + k * 4) + '" width="' + Math.max(2, (w - 2) * (k % 2 ? 0.7 : 0.9)) + '" height="1.6" fill="#c8c6c4"/>'; }
        });
        return out + '</svg>';
    };

    C.slideContextMenu = function () {
        return [
            { label: 's_paste', icon: 'fa-paste', key: 'Mod+V', disabled: !App.clip, onClick: function () { C.paste(); } },
            { sep: true },
            { label: 's_layout', icon: 'fa-table-columns', submenu: function () { return C.layoutMenu(true); } },
            { label: 's_reset_slide', icon: 'fa-arrows-rotate', onClick: C.resetSlide },
            { label: 's_format_background', icon: 'fa-fill-drip', onClick: function () { C.openFormatPane('background'); } },
            { label: 's_hide_decor', icon: 'fa-shapes', checked: !!App.slide().hideDecor, onClick: C.toggleDecor },
            { sep: true },
            { label: 's_new_slide', icon: 'fa-square-plus', key: 'Mod+M', onClick: function () { C.newSlide(); } },
            { label: App.slide().hidden ? 's_unhide_slide' : 's_hide_slide', icon: 'fa-eye-slash', onClick: C.hideSlide },
            { label: 's_add_comment', icon: 'fa-comment', onClick: function () { C.commentsPane(true); } },
            { label: 's_grid_guides', icon: 'fa-table-cells', submenu: [
                { label: 's_gridlines', checked: !!App.showGrid, onClick: function () { C.toggleView('grid'); } },
                { label: 's_guides', checked: !!App.showGuides, onClick: function () { C.toggleView('guides'); } },
                { label: 's_snap', checked: !App.snapOff, onClick: function () { C.toggleView('snap'); } }
            ] }
        ];
    };

    C.thumbContextMenu = function () {
        var s = App.slide();
        return [
            { label: 's_cut', icon: 'fa-scissors', onClick: function () { App.el.list.focus(); App.sel = []; C.copy(true); } },
            { label: 'c_copy_cmd', icon: 'fa-copy', onClick: function () { App.el.list.focus(); App.sel = []; C.copy(false); } },
            { label: 's_paste', icon: 'fa-paste', disabled: !(App.clip && App.clip.kind === 'slides'), onClick: function () { C.pasteClip(App.clip); } },
            { sep: true },
            { label: 's_new_slide', icon: 'fa-square-plus', onClick: function () { C.newSlide(); } },
            { label: 's_duplicate_slide', icon: 'fa-clone', onClick: C.duplicateSlide },
            { label: 's_delete_slide', icon: 'fa-trash', onClick: C.deleteSlide },
            { sep: true },
            { label: 's_layout', icon: 'fa-table-columns', submenu: function () { return C.layoutMenu(true); } },
            { label: 's_reset_slide', icon: 'fa-arrows-rotate', onClick: C.resetSlide },
            { label: 's_format_background', icon: 'fa-fill-drip', onClick: function () { C.openFormatPane('background'); } },
            { label: 's_move_up', icon: 'fa-arrow-up', disabled: App.cur === 0, onClick: function () { C.moveSlide(App.cur, App.cur - 1); } },
            { label: 's_move_down', icon: 'fa-arrow-down', disabled: App.cur >= App.deck.slides.length - 1, onClick: function () { C.moveSlide(App.cur, App.cur + 1); } },
            { label: s.hidden ? 's_unhide_slide' : 's_hide_slide', icon: 'fa-eye-slash', onClick: C.hideSlide }
        ];
    };

    // ============================================================ tampilan
    C.toggleView = function (what) {
        if (what === 'grid') App.showGrid = !App.showGrid;
        if (what === 'guides') App.showGuides = !App.showGuides;
        if (what === 'snap') App.snapOff = !App.snapOff;
        try { localStorage.setItem('ss_view', JSON.stringify({ grid: !!App.showGrid, guides: !!App.showGuides, snapOff: !!App.snapOff })); } catch (e) {}
        App.drawOverlay();
        C.updateRibbonSoon();
    };

    // ============================================================ ribbon
    C.updateRibbon = function () {
        var rb = App.ribbon;
        if (!rb || !App.deck) return;
        var sel = App.selected();
        var one = sel.length === 1 ? sel[0] : null;
        var st = C.currentStyle();
        var pal = App.pal();
        var hasText = App.editing || sel.some(function (e) { return C.isTextual(e) || e.type === 'table'; });
        rb.setValue('fontName', st.ff || pal.fontB, st.ff === pal.fontH ? st.ff + ' (' + SO.t('s_headings') + ')' : st.ff === pal.fontB ? (st.ff || pal.fontB) + ' (' + SO.t('s_body') + ')' : st.ff);
        rb.setValue('fontSize', st.fs || '');
        ['bold', 'italic', 'underline', 'strikeThrough'].forEach(function (c) { rb.setActive(c, !!st[STATE_KEY[c]]); });
        rb.setActive('subscript', !!st.sub);
        rb.setActive('superscript', !!st.sup);
        ['left', 'center', 'right', 'justify'].forEach(function (a) { rb.setActive('align_' + a, (st.align || 'left') === a && hasText); });
        rb.setActive('bullets', !!st.ul);
        rb.setActive('numbering', !!st.ol);
        ['fontName', 'fontSize', 'bold', 'italic', 'underline', 'strikeThrough', 'fontColor', 'highlight', 'align_left', 'align_center', 'align_right', 'align_justify', 'bullets', 'numbering', 'growFont', 'shrinkFont', 'clearFormat', 'changeCase', 'lineSpacing', 'indentMore', 'indentLess', 'textDirection', 'valign']
            .forEach(function (c) { rb.setDisabled(c, !hasText); });
        rb.setDisabled('subscript', !App.editing);
        rb.setDisabled('superscript', !App.editing);
        ['shapeFill', 'shapeOutline', 'shapeEffects', 'arrange', 'alignObjects', 'rotateMenu', 'deleteSel', 'lockObj'].forEach(function (c) { rb.setDisabled(c, !sel.length); });
        rb.setDisabled('group', sel.length < 2);
        rb.setDisabled('ungroup', !sel.some(function (e) { return e.type === 'group'; }));
        rb.setActive('painter', !!App.painter);
        rb.setActive('toggleGrid', !!App.showGrid);
        rb.setActive('toggleGuides', !!App.showGuides);
        rb.setActive('toggleRuler', !App.snapOff);
        rb.setActive('toggleNotes', !App.el.notes.hidden);
        var s = App.slide();
        rb.setActive('hideSlide', !!(s && s.hidden));
        rb.setValue('transitionGallery', s && s.transition ? s.transition.type : 'none');
        rb.setValue('trDuration', s && s.transition && s.transition.dur != null ? s.transition.dur : 0.7);
        rb.setValue('trAfter', s && s.transition && s.transition.after != null ? s.transition.after : '');
        rb.setValue('trOnClick', !(s && s.transition && s.transition.noClick));
        rb.setValue('themeGallery', App.deck.theme.id);
        if (rb.reg.variantGallery) rb.reg.variantGallery.forEach(function (g) { g.render(); });
        rb.setValue('variantGallery', String(App.deck.theme.variant || 0));
        var anims = (s && s.anims || []).filter(function (a) { return App.sel.indexOf(a.el) !== -1; });
        rb.setValue('animGallery', anims.length ? anims[0].effect : '');
        rb.setDisabled('animGallery', !sel.length);
        rb.setDisabled('animOptions', !anims.length);
        rb.setDisabled('animTrigger', !anims.length);
        rb.setDisabled('animDuration', !anims.length);
        rb.setDisabled('animDelay', !anims.length);
        rb.setDisabled('removeAnim', !anims.length);
        if (anims.length) {
            rb.setValue('animTrigger', anims[0].trigger);
            rb.setValue('animDuration', anims[0].dur);
            rb.setValue('animDelay', anims[0].delay || 0);
        }
        // Tab kontekstual.
        var shapeLike = sel.length && sel.every(function (e) { return e.type === 'shape' || e.type === 'text' || e.type === 'line' || e.type === 'icon' || e.type === 'group' || e.type === 'math'; });
        var autoSel = !App._lastSelKey || App._lastSelKey !== App.sel.join(',');
        App._lastSelKey = App.sel.join(',');
        rb.showContextual('shapeFormat', !!shapeLike, false);
        rb.showContextual('pictureFormat', !!(one && one.type === 'image'), false);
        rb.showContextual('tableDesign', !!(one && one.type === 'table'), autoSel && one && one.type === 'table' && !App.editing);
        rb.showContextual('chartDesign', !!(one && one.type === 'chart'), autoSel && one && one.type === 'chart');
        if (one && one.type === 'table' && one.tstyle) {
            rb.setValue('tblHeader', !!one.tstyle.header);
            rb.setValue('tblBanded', !!one.tstyle.banded);
            rb.setValue('tblFirstCol', !!one.tstyle.firstCol);
        }
        if (one && one.type === 'chart') rb.setValue('chartLabels', !!one.labels);
        App.updateStatus();
    };
    var ribbonTimer = null;
    C.updateRibbonSoon = function () {
        if (ribbonTimer) return;
        ribbonTimer = requestAnimationFrame(function () { ribbonTimer = null; C.updateRibbon(); });
    };
})(window);
