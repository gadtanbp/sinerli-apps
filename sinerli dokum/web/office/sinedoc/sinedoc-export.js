/**
 * Sinerli Dokum — ekspor DOCX (pustaka docx 8.5) dan PDF (html2canvas + jsPDF).
 * Konversi berjalan atas salinan HTML bersih dari editor.
 */
(function (global) {
    'use strict';

    var TWIP_PER_MM = 56.6929;
    var TWIP_PER_PX = 15;

    function hex(c) {
        var h = SO.toHex(c);
        return h ? h.slice(1) : null;
    }

    function pxFromCss(v, basePx) {
        if (!v) return null;
        var n = parseFloat(v);
        if (isNaN(n)) return null;
        if (/pt$/.test(v)) return n / 0.75;
        if (/em$/.test(v)) return n * (basePx || 14.67);
        if (/%$/.test(v)) return n / 100 * (basePx || 14.67);
        if (/cm$/.test(v)) return n * 37.795;
        if (/mm$/.test(v)) return n * 3.7795;
        if (/in$/.test(v)) return n * 96;
        var named = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32, 'xxx-large': 48 };
        if (named[v]) return named[v];
        return n;
    }

    var HIGHLIGHT_NAMES = {
        FFFF00: 'yellow', '00FF00': 'green', '00FFFF': 'cyan', FF00FF: 'magenta', '0000FF': 'blue', FF0000: 'red',
        '000080': 'darkBlue', '008080': 'darkCyan', '008000': 'darkGreen', '800080': 'darkMagenta', '800000': 'darkRed',
        '808000': 'darkYellow', '808080': 'darkGray', C0C0C0: 'lightGray', '000000': 'black'
    };

    /**
     * @param app {editor, settings, getTitle(), comments, notes}
     */
    function exportDocx(app) {
        return SO.load('docx').then(function (D) {
            var root = document.createElement('div');
            root.innerHTML = SDLayout.cleanHtml(app.editor);
            // Ukuran tampil gambar diambil dari editor asli (salinan belum ter-layout).
            var liveImgs = app.editor.querySelectorAll('img');
            var cloneImgs = root.querySelectorAll('img');
            var jobs = [];
            var imageData = [];
            Array.prototype.forEach.call(cloneImgs, function (img, i) {
                var live = liveImgs[i];
                var w = live ? live.getBoundingClientRect().width / (app.zoom || 1) : 200;
                var h = live ? live.getBoundingClientRect().height / (app.zoom || 1) : 150;
                img.setAttribute('data-exp', i);
                jobs.push(SO.toPngDataUrl(live ? live.src : img.src).then(function (res) {
                    imageData[i] = { data: res.dataUrl, w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
                }).catch(function () { imageData[i] = null; }));
            });
            var hfDivs = [];
            var hf = app.settings.hf || {};
            ['header', 'footer', 'firstHeader', 'firstFooter', 'evenHeader', 'evenFooter'].forEach(function (k) {
                var div = document.createElement('div');
                div.innerHTML = hf[k] || '';
                hfDivs[k] = div;
            });
            var eqJobs = SO.$$('.sd-eq', root).map(function (eq) { return eq; });
            return Promise.all(jobs).then(function () {
                return build(D, app, root, imageData, hfDivs, eqJobs);
            });
        });
    }

    function build(D, app, root, imageData, hfDivs) {
        var s = app.settings;
        var footnotes = {};
        var fnIndex = 0;
        var changeId = 1;
        var instanceCounter = 0;
        var author = SO.ctx.name || 'Sinerli Dokum';

        function runsFrom(node, style, out, opts) {
            out = out || [];
            node.childNodes.forEach(function (n) {
                if (n.nodeType === 3) {
                    var text = n.textContent;
                    if (!text) return;
                    var parts = text.split('\n');
                    parts.forEach(function (part, i) {
                        if (i > 0) out.push(new D.TextRun({ break: 1 }));
                        if (!part) return;
                        var ro = runOpts(style, part);
                        if (style.del) out.push(new D.DeletedTextRun(Object.assign(ro, { id: changeId++, author: style.author || author, date: style.date || new Date().toISOString() })));
                        else if (style.ins) out.push(new D.InsertedTextRun(Object.assign(ro, { id: changeId++, author: style.author || author, date: style.date || new Date().toISOString() })));
                        else out.push(new D.TextRun(ro));
                    });
                    return;
                }
                if (n.nodeType !== 1) return;
                var t = n.tagName;
                if (t === 'BR') { out.push(new D.TextRun({ break: 1 })); return; }
                if (t === 'IMG') {
                    var im = imageData[+n.getAttribute('data-exp')];
                    if (im) {
                        var maxW = contentWidthPx();
                        var w = im.w, h = im.h;
                        if (w > maxW) { h = h * maxW / w; w = maxW; }
                        out.push(new D.ImageRun({ data: im.data, transformation: { width: w, height: h } }));
                    }
                    return;
                }
                if (n.classList.contains('sd-field')) {
                    var f = n.getAttribute('data-field');
                    if (f === 'page') out.push(new D.TextRun(Object.assign(runOpts(style, ''), { children: [D.PageNumber.CURRENT] })));
                    else if (f === 'pages') out.push(new D.TextRun(Object.assign(runOpts(style, ''), { children: [D.PageNumber.TOTAL_PAGES] })));
                    else out.push(new D.TextRun(runOpts(style, n.textContent)));
                    return;
                }
                if (n.classList.contains('sd-fn')) {
                    var noteId = n.getAttribute('data-fn');
                    var note = (app.notes || []).filter(function (x) { return x.id === noteId; })[0];
                    fnIndex++;
                    footnotes[fnIndex] = { children: [new D.Paragraph({ children: [new D.TextRun({ text: note ? note.text : '', size: 18 })] })] };
                    out.push(new D.FootnoteReferenceRun(fnIndex));
                    return;
                }
                if (n.classList.contains('sd-eq')) {
                    out.push(new D.TextRun(Object.assign(runOpts(style, n.getAttribute('data-latex') || n.textContent), { font: 'Cambria Math', italics: true })));
                    return;
                }
                var ns = Object.assign({}, style);
                var cs = n.style;
                if (t === 'B' || t === 'STRONG' || t === 'TH') ns.bold = true;
                if (t === 'I' || t === 'EM') ns.italics = true;
                if (t === 'U') ns.underline = true;
                if (t === 'S' || t === 'STRIKE') ns.strike = true;
                if (t === 'SUP') ns.sup = true;
                if (t === 'SUB') ns.sub = true;
                if (t === 'CODE') ns.font = 'Consolas';
                if (t === 'MARK') ns.highlight = 'FFFF00';
                if (t === 'DEL' && n.classList.contains('sd-del')) { ns.del = true; ns.author = n.getAttribute('data-author'); ns.date = n.getAttribute('data-time'); }
                if (t === 'INS' && n.classList.contains('sd-ins')) { ns.ins = true; ns.author = n.getAttribute('data-author'); ns.date = n.getAttribute('data-time'); }
                if (cs.fontWeight) ns.bold = cs.fontWeight === 'bold' || parseInt(cs.fontWeight, 10) >= 600;
                if (cs.fontStyle) ns.italics = cs.fontStyle === 'italic';
                var deco = cs.textDecorationLine || cs.textDecoration || '';
                if (/underline/.test(deco)) ns.underline = true;
                if (/line-through/.test(deco)) ns.strike = true;
                if (cs.color) ns.color = hex(cs.color);
                if (cs.backgroundColor) ns.highlight = hex(cs.backgroundColor);
                if (cs.fontSize) { var px = pxFromCss(cs.fontSize, style.sizePx); if (px) ns.sizePx = px; }
                if (cs.fontFamily) ns.font = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
                if (cs.verticalAlign === 'super') ns.sup = true;
                if (cs.verticalAlign === 'sub') ns.sub = true;
                if (t === 'A' && n.getAttribute('href') && !opts) {
                    var linkRuns = runsFrom(n, Object.assign(ns, { color: ns.color || '0563C1', underline: true }), [], { inLink: true });
                    out.push(new D.ExternalHyperlink({ link: n.getAttribute('href'), children: linkRuns }));
                    return;
                }
                runsFrom(n, ns, out, opts);
            });
            return out;
        }

        function runOpts(st, text) {
            var o = { text: text };
            if (st.bold) o.bold = true;
            if (st.italics) o.italics = true;
            if (st.underline) o.underline = { type: D.UnderlineType.SINGLE };
            if (st.strike) o.strike = true;
            if (st.sup) o.superScript = true;
            if (st.sub) o.subScript = true;
            if (st.color) o.color = st.color;
            if (st.highlight) {
                if (HIGHLIGHT_NAMES[st.highlight]) o.highlight = HIGHLIGHT_NAMES[st.highlight];
                else o.shading = { type: D.ShadingType.CLEAR, color: 'auto', fill: st.highlight };
            }
            if (st.sizePx) o.size = Math.round(st.sizePx * 0.75 * 2);
            if (st.font) o.font = st.font;
            return o;
        }

        function contentWidthPx() {
            var g = SDLayout.geometry(s);
            return g.contentW;
        }

        function paraOpts(el, extra) {
            var o = Object.assign({}, extra || {});
            var cs = el.style;
            var align = cs.textAlign || el.getAttribute('align');
            if (align === 'center') o.alignment = D.AlignmentType.CENTER;
            else if (align === 'right') o.alignment = D.AlignmentType.RIGHT;
            else if (align === 'justify') o.alignment = D.AlignmentType.JUSTIFIED;
            var spacing = {};
            if (cs.lineHeight) {
                var lh = parseFloat(cs.lineHeight);
                if (!isNaN(lh)) {
                    if (/px|pt/.test(cs.lineHeight)) { spacing.line = Math.round(pxFromCss(cs.lineHeight) * TWIP_PER_PX); spacing.lineRule = D.LineRuleType ? D.LineRuleType.EXACT : 'exact'; }
                    else spacing.line = Math.round(lh * 240);
                }
            }
            if (cs.marginTop) spacing.before = Math.round((pxFromCss(cs.marginTop) || 0) * TWIP_PER_PX);
            if (cs.marginBottom) spacing.after = Math.round((pxFromCss(cs.marginBottom) || 0) * TWIP_PER_PX);
            if (Object.keys(spacing).length) o.spacing = Object.assign(o.spacing || {}, spacing);
            var indent = {};
            if (cs.marginLeft) indent.left = Math.round((pxFromCss(cs.marginLeft) || 0) * TWIP_PER_PX);
            if (cs.textIndent) {
                var ti = pxFromCss(cs.textIndent) || 0;
                if (ti >= 0) indent.firstLine = Math.round(ti * TWIP_PER_PX);
                else { indent.hanging = Math.round(-ti * TWIP_PER_PX); }
            }
            if (Object.keys(indent).length) o.indent = Object.assign(o.indent || {}, indent);
            return o;
        }

        function baseStyleOf(el) {
            var st = {};
            var cs = el.style;
            if (cs.color) st.color = hex(cs.color);
            if (cs.fontSize) st.sizePx = pxFromCss(cs.fontSize);
            if (cs.fontFamily) st.font = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
            if (cs.fontWeight) st.bold = parseInt(cs.fontWeight, 10) >= 600 || cs.fontWeight === 'bold';
            return st;
        }

        function emptyRuns(runs) { return runs.length ? runs : [new D.TextRun('')]; }

        function blocksFrom(container, ctx) {
            ctx = ctx || {};
            var out = [];
            var inlineBuf = document.createElement('p');
            function flushInline() {
                if (!inlineBuf.childNodes.length) return;
                if (inlineBuf.textContent.trim() || inlineBuf.querySelector('img')) {
                    out.push(new D.Paragraph(paraOpts(container, { children: runsFrom(inlineBuf, ctx.style || {}) })));
                }
                inlineBuf = document.createElement('p');
            }
            Array.prototype.slice.call(container.childNodes).forEach(function (n) {
                if (n.nodeType === 3 || (n.nodeType === 1 && /^(SPAN|B|I|U|S|A|STRONG|EM|SUB|SUP|BR|IMG|CODE|MARK|INS|DEL|FONT|SMALL)$/.test(n.tagName) && !n.classList.contains('sd-eq'))) {
                    inlineBuf.appendChild(n.cloneNode(true));
                    return;
                }
                if (n.nodeType !== 1) return;
                flushInline();
                var t = n.tagName;
                var style = Object.assign({}, ctx.style || {}, baseStyleOf(n));
                if (n.classList.contains('sd-page-break')) { out.push(new D.Paragraph({ children: [new D.PageBreak()] })); return; }
                if (n.classList.contains('sd-notes')) return;
                if (n.classList.contains('sd-toc')) {
                    SO.$$('.sd-toc-title', n).forEach(function (tt) {
                        out.push(new D.Paragraph({ children: [new D.TextRun({ text: tt.textContent, bold: true, size: 32, color: '2F5496' })], spacing: { after: 120 } }));
                    });
                    SO.$$('.sd-toc-row', n).forEach(function (row) {
                        var lvl = +((row.className.match(/lvl-(\d)/) || [0, 1])[1]);
                        out.push(new D.Paragraph({
                            children: [new D.TextRun({ text: row.querySelector('.t-text').textContent, bold: lvl === 1 }), new D.TextRun({ text: '\t' + row.querySelector('.t-page').textContent })],
                            tabStops: [{ type: D.TabStopType.RIGHT, position: Math.round(contentWidthPx() * TWIP_PER_PX), leader: D.LeaderType.DOT }],
                            indent: { left: (lvl - 1) * 320 }, spacing: { after: 60 }
                        }));
                    });
                    return;
                }
                if (/^H[1-6]$/.test(t)) {
                    var lv = Math.min(6, +t[1]);
                    out.push(new D.Paragraph(paraOpts(n, { heading: D.HeadingLevel['HEADING_' + lv], children: emptyRuns(runsFrom(n, style)) })));
                    return;
                }
                if (t === 'P') {
                    var extra = {};
                    if (n.classList.contains('sd-title')) extra.heading = D.HeadingLevel.TITLE;
                    if (n.classList.contains('sd-subtitle')) extra.style = 'Subtitle';
                    if (n.classList.contains('sd-nospace')) extra.spacing = { after: 0, before: 0 };
                    if (ctx.quote) { extra.indent = { left: 480, right: 480 }; style.italics = true; style.color = style.color || '404040'; }
                    if (ctx.box) { extra.border = boxBorder(); extra.shading = { type: D.ShadingType.CLEAR, color: 'auto', fill: 'F3F7FD' }; }
                    out.push(new D.Paragraph(paraOpts(n, Object.assign(extra, { children: emptyRuns(runsFrom(n, style)) }))));
                    return;
                }
                if (t === 'PRE') {
                    n.textContent.split('\n').forEach(function (line) {
                        out.push(new D.Paragraph({ children: [new D.TextRun({ text: line || ' ', font: 'Consolas', size: 20 })], shading: { type: D.ShadingType.CLEAR, color: 'auto', fill: 'F4F4F4' }, spacing: { after: 0 } }));
                    });
                    return;
                }
                if (t === 'BLOCKQUOTE') { out = out.concat(blocksFrom(n, { style: style, quote: true })); return; }
                if (t === 'HR') { out.push(new D.Paragraph({ children: [], border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: 'A6A6A6', space: 1 } } })); return; }
                if (t === 'UL' || t === 'OL') { out = out.concat(listFrom(n, 0, style, null)); return; }
                if (t === 'TABLE') { var tb = tableFrom(n, style); if (tb) out.push(tb); out.push(new D.Paragraph({ children: [], spacing: { after: 0 } })); return; }
                if (n.classList.contains('sd-eq')) {
                    out.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: n.getAttribute('data-latex') || n.textContent, font: 'Cambria Math', italics: true })] }));
                    return;
                }
                if (n.classList.contains('sd-box')) { out = out.concat(blocksFrom(n, { style: style, box: true })); return; }
                // DIV umum / kolom / figure: turunkan ke anak-anaknya.
                out = out.concat(blocksFrom(n, { style: style, quote: ctx.quote, box: ctx.box }));
            });
            flushInline();
            return out;
        }

        function boxBorder() {
            var b = { style: D.BorderStyle.SINGLE, size: 6, color: '8EAADB', space: 4 };
            return { top: b, bottom: b, left: b, right: b };
        }

        function listFrom(list, level, style, instance) {
            var out = [];
            var ordered = list.tagName === 'OL';
            var checklist = list.classList.contains('sd-checklist');
            var inst = instance;
            if (inst == null || level === 0) inst = ++instanceCounter;
            Array.prototype.forEach.call(list.children, function (li) {
                if (li.tagName !== 'LI') return;
                var clone = li.cloneNode(true);
                SO.$$(':scope > ul, :scope > ol', clone).forEach(function (x) { x.remove(); });
                var runs = runsFrom(clone, style);
                if (checklist) runs.unshift(new D.TextRun({ text: (li.getAttribute('data-checked') === 'true' ? '☑' : '☐') + ' ' }));
                var popts = paraOpts(li, { children: emptyRuns(runs) });
                if (checklist) popts.indent = { left: 360 * (level + 1) };
                else popts.numbering = { reference: ordered ? 'sd-numbers' : 'sd-bullets', level: Math.min(8, level), instance: inst };
                popts.spacing = Object.assign({ after: 40 }, popts.spacing || {});
                out.push(new D.Paragraph(popts));
                Array.prototype.forEach.call(li.children, function (c) {
                    if (c.tagName === 'UL' || c.tagName === 'OL') out = out.concat(listFrom(c, level + 1, style, inst));
                });
            });
            return out;
        }

        function tableFrom(table, style) {
            var rows = Array.prototype.filter.call(table.rows, function (r) { return !r.classList.contains('sd-row-gap'); });
            if (!rows.length) return null;
            var noBorder = table.classList.contains('sd-noborder');
            var none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
            var line = { style: D.BorderStyle.SINGLE, size: 4, color: 'A6A6A6' };
            var b = noBorder ? none : line;
            var cols = 0;
            rows.forEach(function (r) { var c = 0; Array.prototype.forEach.call(r.cells, function (cell) { c += cell.colSpan || 1; }); cols = Math.max(cols, c); });
            var totalTw = Math.round(contentWidthPx() * TWIP_PER_PX);
            return new D.Table({
                width: { size: 100, type: D.WidthType.PERCENTAGE },
                columnWidths: new Array(cols).fill(Math.round(totalTw / Math.max(1, cols))),
                borders: { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b },
                rows: rows.map(function (r, ri) {
                    return new D.TableRow({
                        tableHeader: ri === 0 && r.cells[0] && r.cells[0].tagName === 'TH',
                        children: Array.prototype.map.call(r.cells, function (cell) {
                            var st = Object.assign({}, style, baseStyleOf(cell));
                            if (cell.tagName === 'TH') st.bold = true;
                            var kids = blocksFrom(cell, { style: st });
                            var co = {
                                children: kids.length ? kids : [new D.Paragraph('')],
                                margins: { top: 40, bottom: 40, left: 80, right: 80 }
                            };
                            if (cell.colSpan > 1) co.columnSpan = cell.colSpan;
                            if (cell.rowSpan > 1) co.rowSpan = cell.rowSpan;
                            var bg = hex(cell.style.backgroundColor) || (cell.tagName === 'TH' && !noBorder ? 'F2F2F2' : null);
                            if (bg) co.shading = { type: D.ShadingType.CLEAR, color: 'auto', fill: bg };
                            var va = cell.style.verticalAlign;
                            if (va === 'middle') co.verticalAlign = D.VerticalAlign.CENTER;
                            if (va === 'bottom') co.verticalAlign = D.VerticalAlign.BOTTOM;
                            if (cell.style.width && /%$/.test(cell.style.width)) co.width = { size: parseFloat(cell.style.width), type: D.WidthType.PERCENTAGE };
                            return new D.TableCell(co);
                        })
                    });
                })
            });
        }

        function hfChildren(div) {
            var kids = blocksFrom(div, {});
            return kids.length ? kids : [new D.Paragraph('')];
        }

        var bodyChildren = blocksFrom(root, {});
        if (!bodyChildren.length) bodyChildren.push(new D.Paragraph(''));

        var size = SDLayout.PAGE_SIZES[s.size] || { w: 210, h: 297 };
        var hf = s.hf || {};
        var section = {
            properties: {
                page: {
                    size: { width: Math.round(size.w * TWIP_PER_MM), height: Math.round(size.h * TWIP_PER_MM), orientation: s.orientation === 'landscape' ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT },
                    margin: {
                        top: Math.round(s.margins.top * TWIP_PER_MM), bottom: Math.round(s.margins.bottom * TWIP_PER_MM),
                        left: Math.round(s.margins.left * TWIP_PER_MM), right: Math.round(s.margins.right * TWIP_PER_MM),
                        header: Math.round((s.headerDist || 12.5) * TWIP_PER_MM), footer: Math.round((s.footerDist || 12.5) * TWIP_PER_MM)
                    },
                    pageNumbers: hf.startAt && hf.startAt !== 1 ? { start: hf.startAt } : undefined
                },
                titlePage: !!hf.differentFirst
            },
            headers: { default: new D.Header({ children: hfChildren(hfDivs.header) }) },
            footers: { default: new D.Footer({ children: hfChildren(hfDivs.footer) }) },
            children: bodyChildren
        };
        if (hf.differentFirst) {
            section.headers.first = new D.Header({ children: hfChildren(hfDivs.firstHeader) });
            section.footers.first = new D.Footer({ children: hfChildren(hfDivs.firstFooter) });
        }
        if (hf.differentOddEven) {
            section.headers.even = new D.Header({ children: hfChildren(hfDivs.evenHeader) });
            section.footers.even = new D.Footer({ children: hfChildren(hfDivs.evenFooter) });
        }

        var bulletChars = ['•', '◦', '▪'];
        var numFormats = [D.LevelFormat.DECIMAL, D.LevelFormat.LOWER_LETTER, D.LevelFormat.LOWER_ROMAN];
        var docOpts = {
            creator: author,
            title: app.getTitle(),
            description: 'Sinerli Dokum - Sinerli',
            evenAndOddHeaderAndFooters: !!hf.differentOddEven,
            styles: {
                default: {
                    document: { run: { font: 'Arial', size: 22 }, paragraph: { spacing: { after: 120, line: 276 } } },
                    heading1: { run: { size: 40, bold: true, color: '1F3864' }, paragraph: { spacing: { before: 240, after: 120 } } },
                    heading2: { run: { size: 32, bold: true, color: '2F5496' }, paragraph: { spacing: { before: 200, after: 100 } } },
                    heading3: { run: { size: 26, bold: true, color: '1F3864' }, paragraph: { spacing: { before: 160, after: 80 } } },
                    heading4: { run: { size: 22, bold: true, italics: true, color: '2F5496' }, paragraph: { spacing: { before: 160, after: 80 } } },
                    title: { run: { size: 56 }, paragraph: { spacing: { after: 80 } } },
                    hyperlink: { run: { color: '0563C1', underline: { type: D.UnderlineType.SINGLE } } }
                },
                paragraphStyles: [{ id: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', run: { size: 30, color: '595959' }, paragraph: { spacing: { after: 200 } } }]
            },
            numbering: {
                config: [
                    { reference: 'sd-bullets', levels: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (l) { return { level: l, format: D.LevelFormat.BULLET, text: bulletChars[l % 3], alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 420 * (l + 1), hanging: 280 } } } }; }) },
                    { reference: 'sd-numbers', levels: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (l) { return { level: l, format: numFormats[l % 3], text: '%' + (l + 1) + '.', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 420 * (l + 1), hanging: 320 } } } }; }) }
                ]
            },
            footnotes: footnotes,
            sections: [section]
        };
        if (s.pageColor && hex(s.pageColor) && hex(s.pageColor) !== 'FFFFFF') docOpts.background = { color: hex(s.pageColor) };
        var document_ = new D.Document(docOpts);
        return D.Packer.toBlob(document_);
    }

    /** PDF: tiap halaman dirender html2canvas lalu disusun jsPDF. */
    function exportPdf(app, onProgress) {
        return Promise.all([SO.load('html2canvas'), SO.load('jspdf')]).then(function (libs) {
            var html2canvas = libs[0];
            var jsPDF = libs[1].jsPDF;
            var g = app.geometry();
            var host = document.createElement('div');
            host.className = 'sd-export-host';
            document.body.appendChild(host);
            SDLayout.buildPrintPages(host, app.editor, app.hfLayer, app.pagesEl, app.pageCount, g, { hideComments: true });
            var pages = Array.prototype.slice.call(host.children);
            var wmm = g.pageW / SDLayout.MM, hmm = g.pageH / SDLayout.MM;
            var pdf = new jsPDF({ orientation: wmm > hmm ? 'l' : 'p', unit: 'mm', format: [wmm, hmm], compress: true });
            pdf.setProperties({ title: app.getTitle(), creator: 'Sinerli Dokum - Sinerli' });
            var i = 0;
            function next() {
                if (i >= pages.length) {
                    host.remove();
                    return pdf.output('blob');
                }
                if (onProgress) onProgress(i + 1, pages.length);
                return html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false }).then(function (canvas) {
                    if (i > 0) pdf.addPage([wmm, hmm], wmm > hmm ? 'l' : 'p');
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, wmm, hmm, undefined, 'FAST');
                    i++;
                    return next();
                });
            }
            return next().catch(function (err) { host.remove(); throw err; });
        });
    }

    /** Gambar mini halaman pertama untuk kartu projek di Dashboard. */
    function thumbnail(app) {
        return SO.load('html2canvas').then(function (html2canvas) {
            var g = app.geometry();
            var host = document.createElement('div');
            host.className = 'sd-export-host';
            document.body.appendChild(host);
            SDLayout.buildPrintPages(host, app.editor, app.hfLayer, app.pagesEl, app.pageCount, g, { pages: [0], hideComments: true });
            var page = host.firstChild;
            return html2canvas(page, { scale: 400 / g.pageW, backgroundColor: '#ffffff', useCORS: true, logging: false }).then(function (canvas) {
                host.remove();
                return canvas.toDataURL('image/jpeg', 0.72);
            }, function (e) { host.remove(); throw e; });
        });
    }

    global.SDExport = { docx: exportDocx, pdf: exportPdf, thumbnail: thumbnail };
})(window);
