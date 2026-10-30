/**
 * Sinerli Present — impor/ekspor: PPTX (PptxGenJS + transisi via JSZip), PDF,
 * gambar PNG/JPG (satu atau semua slide dalam ZIP), kerangka teks, berkas
 * .sineslide; impor PPTX (JSZip + DOMParser); cetak & handout; thumbnail cloud.
 */
(function (global) {
    'use strict';

    var App = global.SineSlide, M = global.SSM, R = global.SSR;
    var C = App.cmd;
    var EMU = 9525;

    function noHash(hex) { return String(hex || '#000000').replace('#', '').toUpperCase(); }
    function inch(px) { return px / 96; }

    // ================================================== persiapan render
    /** Menunggu grafik, persamaan, font, dan gambar siap sebelum rasterisasi. */
    function prepare(slides) {
        var pal = App.pal();
        var jobs = [];
        var needMath = false;
        slides.forEach(function (s) {
            s.els.forEach(function (e) {
                var list = e.type === 'group' ? e.children : [e];
                list.forEach(function (x) {
                    if (x.type === 'chart') jobs.push(R.chartImage(x, pal));
                    if (x.type === 'math') needMath = true;
                });
            });
        });
        if (needMath) jobs.push(SO.load('katex').catch(function () {}));
        if (document.fonts && document.fonts.ready) jobs.push(document.fonts.ready);
        jobs.push(document.fonts ? document.fonts.load('900 32px "Font Awesome 6 Free"').catch(function () {}) : null);
        return Promise.all(jobs);
    }

    function offscreenHost(w, h) {
        var host = SO.el('div', { class: 'ss-offscreen', style: { position: 'fixed', left: '-20000px', top: '0', width: w + 'px', height: h + 'px', overflow: 'hidden', pointerEvents: 'none' } });
        document.body.appendChild(host);
        return host;
    }
    function waitImages(root) {
        return Promise.all(SO.$$('img', root).map(function (img) {
            if (img.complete && img.naturalWidth) return null;
            return new Promise(function (res) { img.onload = img.onerror = res; setTimeout(res, 4000); });
        }));
    }

    /** Merender satu slide ke canvas (html2canvas). opts: {scale, bgOnly} */
    C.slideCanvas = function (slide, index, opts) {
        opts = opts || {};
        var deck = App.deck;
        var W = deck.size.w, H = deck.size.h;
        return Promise.all([SO.load('html2canvas'), prepare([slide])]).then(function (res) {
            var h2c = res[0];
            var host = offscreenHost(W, H);
            var s = opts.bgOnly ? Object.assign({}, slide, { els: [] }) : slide;
            var node = R.renderSlide(opts.bgOnly ? Object.assign({}, deck, { footer: {} }) : deck, s, { mode: 'export', index: index });
            host.appendChild(node);
            R.fitText(node);
            return waitImages(node).then(function () {
                return h2c(node, { scale: opts.scale || 1, backgroundColor: null, useCORS: true, logging: false, width: W, height: H, windowWidth: W, windowHeight: H });
            }).finally(function () { host.remove(); });
        });
    };

    C.thumbnail = function () {
        var s = App.deck.slides.filter(function (x) { return !x.hidden; })[0] || App.deck.slides[0];
        return C.slideCanvas(s, 0, { scale: 400 / App.deck.size.w }).then(function (cv) { return cv.toDataURL('image/jpeg', 0.82); }).catch(function () { return null; });
    };

    // ======================================================= teks → run
    function cssColor(v) { return v ? SO.toHex(v) : null; }
    function ptOf(v) {
        if (!v) return null;
        var n = parseFloat(v);
        if (/pt$/.test(v)) return n;
        if (/px$/.test(v)) return n * 0.75;
        if (/em$/.test(v)) return null;
        return null;
    }
    /** HTML teks slide → larik run PptxGenJS. */
    function htmlRuns(html, st, pal) {
        var d = document.createElement('div');
        d.innerHTML = html || '';
        var paras = [];
        var pushPara = function (node, list, level) { paras.push({ node: node, list: list, level: level }); };
        (function scan(node, list, level) {
            var inline = [];
            var flush = function () {
                if (!inline.length) return;
                var wrap = document.createElement('div');
                inline.forEach(function (n) { wrap.appendChild(n.cloneNode(true)); });
                pushPara(wrap, list, level);
                inline = [];
            };
            Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
                if (ch.nodeType === 1 && (ch.tagName === 'UL' || ch.tagName === 'OL')) {
                    flush();
                    Array.prototype.slice.call(ch.children).forEach(function (li) {
                        var nested = Array.prototype.slice.call(li.children).filter(function (x) { return x.tagName === 'UL' || x.tagName === 'OL'; });
                        var own = li.cloneNode(true);
                        SO.$$('ul, ol', own).forEach(function (x) { x.remove(); });
                        pushPara(own, ch.tagName, level + 1);
                        nested.forEach(function (n) { var holder = document.createElement('div'); holder.appendChild(n.cloneNode(true)); scan(holder, list, level + 1); });
                    });
                } else if (ch.nodeType === 1 && (ch.tagName === 'DIV' || ch.tagName === 'P' || ch.tagName === 'LI')) {
                    flush();
                    if (SO.$$('div, p, ul, ol', ch).length) scan(ch, list, level); else pushPara(ch, list, level);
                } else inline.push(ch);
            });
            flush();
        })(d, null, 0);
        if (!paras.length) return [{ text: '', options: {} }];
        var runs = [];
        paras.forEach(function (p, pi) {
            var pRuns = [];
            var align = p.node.style && p.node.style.textAlign;
            (function walk(node, fmt) {
                Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
                    if (ch.nodeType === 3) {
                        if (!ch.nodeValue) return;
                        pRuns.push({ text: ch.nodeValue.replace(/​/g, ''), options: Object.assign({}, fmt) });
                        return;
                    }
                    if (ch.nodeType !== 1) return;
                    if (ch.tagName === 'BR') { pRuns.push({ text: '', options: Object.assign({}, fmt, { softBreakBefore: false, breakLine: true }) }); return; }
                    var f = Object.assign({}, fmt);
                    var t = ch.tagName;
                    if (t === 'B' || t === 'STRONG') f.bold = true;
                    if (t === 'I' || t === 'EM') f.italic = true;
                    if (t === 'U') f.underline = { style: 'sng' };
                    if (t === 'S' || t === 'STRIKE') f.strike = 'sngStrike';
                    if (t === 'SUP') f.superscript = true;
                    if (t === 'SUB') f.subscript = true;
                    if (t === 'A' && ch.getAttribute('href')) {
                        var href = ch.getAttribute('href');
                        var m = /^#slide-(.+)$/.exec(href);
                        if (m) { var idx = App.deck.slides.map(function (s) { return s.id; }).indexOf(m[1]); if (idx >= 0) f.hyperlink = { slide: idx + 1 }; }
                        else f.hyperlink = { url: href };
                    }
                    var cs = ch.style;
                    if (cs) {
                        if (cs.fontWeight && (cs.fontWeight === 'bold' || +cs.fontWeight >= 600)) f.bold = true;
                        if (cs.fontWeight && (cs.fontWeight === 'normal' || +cs.fontWeight === 400)) f.bold = false;
                        if (cs.fontStyle === 'italic') f.italic = true;
                        var deco = cs.textDecorationLine || cs.textDecoration || '';
                        if (/underline/.test(deco)) f.underline = { style: 'sng' };
                        if (/line-through/.test(deco)) f.strike = 'sngStrike';
                        if (cs.color) f.color = noHash(cssColor(cs.color));
                        if (cs.backgroundColor && cssColor(cs.backgroundColor)) f.highlight = noHash(cssColor(cs.backgroundColor));
                        if (cs.fontFamily) f.fontFace = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
                        var pt = ptOf(cs.fontSize);
                        if (pt) f.fontSize = pt;
                    }
                    walk(ch, f);
                });
            })(p.node, {});
            if (!pRuns.length) pRuns.push({ text: '', options: {} });
            var first = pRuns[0].options;
            if (align) first.align = align === 'justify' ? 'justify' : align;
            if (p.list) {
                first.bullet = p.list === 'OL' ? { type: 'number' } : true;
                first.indentLevel = Math.max(0, p.level - 1);
            } else if (p.level > 1) first.indentLevel = p.level - 1;
            var ml = p.node.style && parseFloat(p.node.style.marginLeft);
            if (ml) first.indentLevel = Math.round(ml / 24);
            if (pi < paras.length - 1) pRuns[pRuns.length - 1].options.breakLine = true;
            runs = runs.concat(pRuns);
        });
        return runs;
    }
    C.htmlRuns = htmlRuns;

    // ======================================================= rasterisasi
    function iconPng(e, pal) {
        var i = document.createElement('i');
        i.className = 'fas ' + e.icon;
        i.style.position = 'fixed';
        i.style.left = '-9999px';
        document.body.appendChild(i);
        var content = getComputedStyle(i, '::before').content.replace(/["']/g, '');
        i.remove();
        var size = Math.round(Math.min(e.w, e.h) * 2);
        var cv = document.createElement('canvas');
        cv.width = Math.round(e.w * 2); cv.height = Math.round(e.h * 2);
        var ctx = cv.getContext('2d');
        ctx.fillStyle = M.color(e.color, pal) || pal.accent1;
        ctx.font = '900 ' + Math.round(size * 0.86) + 'px "Font Awesome 6 Free"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(content, cv.width / 2, cv.height / 2);
        return cv.toDataURL('image/png');
    }

    function imageData(e) {
        return App.assets.dataUrl(e.asset).then(function (src) {
            if (!src) return null;
            var fx = e.fx || {}, cr = e.crop || {};
            var simple = !e.mask && !Object.keys(fx).length && !(cr.l || cr.t || cr.r || cr.b);
            if (simple) return src;
            return SO.loadImage(src).then(function (img) {
                var iw = img.naturalWidth, ih = img.naturalHeight;
                var sx = (cr.l || 0) * iw, sy = (cr.t || 0) * ih;
                var sw = iw * (1 - (cr.l || 0) - (cr.r || 0)), sh = ih * (1 - (cr.t || 0) - (cr.b || 0));
                var k = Math.min(1, 2400 / Math.max(sw, sh));
                var cv = document.createElement('canvas');
                cv.width = Math.max(1, Math.round(sw * k)); cv.height = Math.max(1, Math.round(sh * k));
                var ctx = cv.getContext('2d');
                if (e.mask && e.mask !== 'rect' && global.Path2D) {
                    var p = new Path2D(M.shapePath(e.mask, cv.width, cv.height, e.adj));
                    ctx.clip(p);
                }
                var filters = [];
                if (fx.bright) filters.push('brightness(' + (1 + fx.bright / 100) + ')');
                if (fx.contrast) filters.push('contrast(' + (1 + fx.contrast / 100) + ')');
                if (fx.sat != null && fx.sat !== 100) filters.push('saturate(' + fx.sat / 100 + ')');
                if (fx.gray) filters.push('grayscale(1)');
                if (fx.sepia) filters.push('sepia(.8)');
                if (fx.blur) filters.push('blur(' + fx.blur * k + 'px)');
                if (filters.length) ctx.filter = filters.join(' ');
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
                return cv.toDataURL('image/png');
            });
        });
    }

    function nodePng(e) {
        return SO.load('html2canvas').then(function (h2c) {
            var host = offscreenHost(e.w + 20, e.h + 20);
            var node = R.elementNode(Object.assign({}, e, { x: 0, y: 0, rot: 0 }), App.pal(), { mode: 'export' });
            host.appendChild(node);
            return h2c(node, { scale: 2, backgroundColor: null, logging: false }).then(function (cv) { host.remove(); return cv.toDataURL('image/png'); }, function (err) { host.remove(); throw err; });
        });
    }

    C.saveElementImage = function (id) {
        var e = App.elById(id);
        if (!e) return;
        var name = SO.safeName(C.elName(e));
        (e.type === 'image' ? imageData(e) : nodePng(e)).then(function (url) { if (url) SO.download(SO.dataUrlToBlob(url), name + '.png'); })
            .catch(function (err) { SO.toast(err.message || 'c_err_generic', { type: 'error' }); });
    };

    // ============================================================= PPTX
    var ARROW = { arrow: 'triangle', open: 'arrow', oval: 'oval', diamond: 'diamond' };
    var DASH = { solid: 'solid', dash: 'dash', dot: 'sysDot', dashDot: 'dashDot', longDash: 'lgDash' };

    function fillOpt(fill, pal) {
        if (!fill || fill.type === 'none') return null;
        var color = M.color(fill.color, pal) || pal.accent1;
        var o = { color: noHash(color) };
        if (fill.opacity != null && fill.opacity < 1) o.transparency = Math.round((1 - fill.opacity) * 100);
        return o;
    }
    function lineOpt(line, pal) {
        if (!line || line.type === 'none') return null;
        return { color: noHash(M.color(line.color, pal) || pal.text), width: line.w || 1, dashType: DASH[line.dash] || 'solid' };
    }
    function shadowOpt(sh) {
        if (!sh) return null;
        if (sh === true) sh = {};
        return { type: 'outer', blur: Math.max(0, (sh.blur == null ? 8 : sh.blur) * 0.75), offset: Math.max(0, (sh.dist == null ? 4 : sh.dist) * 0.75), angle: sh.angle == null ? 45 : sh.angle, color: noHash(sh.color || '#000000'), opacity: sh.opacity == null ? 0.35 : sh.opacity };
    }

    function flatten(els) {
        var out = [];
        els.forEach(function (e) {
            if (e.hidden) return;
            if (e.type !== 'group') { out.push(e); return; }
            var sx = e.gw ? e.w / e.gw : 1, sy = e.gh ? e.h / e.gh : 1;
            flatten(e.children.map(function (c) {
                var k = M.clone(c);
                if (k.type === 'line') { k.x1 = e.x + k.x1 * sx; k.x2 = e.x + k.x2 * sx; k.y1 = e.y + k.y1 * sy; k.y2 = e.y + k.y2 * sy; M.syncLineBox(k); }
                else { k.x = e.x + k.x * sx; k.y = e.y + k.y * sy; k.w *= sx; k.h *= sy; }
                return k;
            })).forEach(function (k) { out.push(k); });
        });
        return out;
    }

    function addElement(pptx, sl, e, pal, jobs) {
        var box = { x: inch(e.x), y: inch(e.y), w: inch(Math.max(1, e.w)), h: inch(Math.max(1, e.h)) };
        if (e.rot) box.rotate = e.rot;
        if (e.flipH) box.flipH = true;
        if (e.flipV) box.flipV = true;
        var st = e.st || {};
        var textOpts = function () {
            var ins = e.inset || { l: 9.6, t: 4.8, r: 9.6, b: 4.8 };
            var o = {
                fontFace: M.font(st.ff, pal), fontSize: st.fs || 18, color: noHash(M.color(st.color, pal) || pal.text),
                bold: !!st.b, italic: !!st.i, underline: st.u ? { style: 'sng' } : undefined, strike: st.s ? 'sngStrike' : undefined,
                align: st.align || 'left', valign: st.valign === 'middle' ? 'middle' : st.valign === 'bottom' ? 'bottom' : 'top',
                margin: [ins.l * 0.75, ins.r * 0.75, ins.b * 0.75, ins.t * 0.75],
                lineSpacingMultiple: st.lh && st.lh !== 1 ? st.lh : undefined,
                fit: e.autofit === 'shrink' ? 'shrink' : e.autofit === 'grow' ? 'resize' : 'none',
                charSpacing: st.ls || undefined
            };
            if (st.hl) o.highlight = noHash(M.color(st.hl, pal));
            return o;
        };
        switch (e.type) {
            case 'text': case 'shape':
                var hasText = e.html && !M.isEmptyHtml(e.html);
                var o = Object.assign({}, box, textOpts());
                var fill = fillOpt(e.fill, pal), line = lineOpt(e.line, pal);
                if (fill) o.fill = fill;
                if (line) o.line = line;
                if (e.shadow) o.shadow = shadowOpt(e.shadow);
                if (e.link) o.hyperlink = /^#slide-/.test(e.link) ? { slide: App.deck.slides.map(function (s) { return s.id; }).indexOf(e.link.slice(7)) + 1 } : { url: e.link };
                if (e.type === 'shape' || fill || line) {
                    o.shape = pptx.ShapeType && pptx.ShapeType[e.shape || 'rect'] ? pptx.ShapeType[e.shape || 'rect'] : (e.shape || 'rect');
                    if (e.shape === 'roundRect') o.rectRadius = inch(Math.min(e.w, e.h) * (e.adj == null ? 0.1667 : e.adj));
                }
                if (e.type === 'text' && !fill && !line) o.isTextBox = true;
                if (e.fill && e.fill.type === 'gradient') o.fill = { color: noHash(M.color(e.fill.color, pal)) };
                sl.addText(hasText ? htmlRuns(e.html, st, pal) : '', o);
                break;
            case 'line':
                var ln = e.line || {};
                sl.addShape(pptx.ShapeType ? pptx.ShapeType.line : 'line', {
                    x: inch(Math.min(e.x1, e.x2)), y: inch(Math.min(e.y1, e.y2)), w: inch(Math.max(1, Math.abs(e.x2 - e.x1))), h: inch(Math.max(0, Math.abs(e.y2 - e.y1))),
                    flipH: e.x2 < e.x1, flipV: e.y2 < e.y1,
                    line: { color: noHash(M.color(ln.color, pal) || pal.text), width: ln.w || 2, dashType: DASH[ln.dash] || 'solid', beginArrowType: ARROW[ln.head] || undefined, endArrowType: ARROW[ln.tail] || undefined }
                });
                break;
            case 'image':
                if (!e.asset) break;
                jobs.push(imageData(e).then(function (data) {
                    if (!data) return;
                    var io = Object.assign({}, box, { data: data });
                    if (e.opacity != null && e.opacity < 1) io.transparency = Math.round((1 - e.opacity) * 100);
                    if (e.alt) io.altText = e.alt;
                    if (e.link) io.hyperlink = { url: e.link };
                    return function () { sl.addImage(io); };
                }));
                return;
            case 'table':
                var ts = e.tstyle || {};
                var main = M.color(ts.color, pal) || pal.accent1;
                var light = M.isDark(pal.bg) ? SO.tint(main, -0.55) : SO.tint(main, 0.82);
                var lighter = M.isDark(pal.bg) ? SO.tint(main, -0.7) : SO.tint(main, 0.92);
                var rows = e.cells.map(function (row, r) {
                    var out = [];
                    row.forEach(function (cell, c) {
                        if (cell.hide) return;
                        var head = (ts.header && r === 0) || (ts.firstCol && c === 0);
                        var bg = cell.fill ? M.color(cell.fill, pal) : head ? main : ts.banded ? (r % 2 ? lighter : light) : null;
                        var co = { align: cell.align || st.align || 'left', valign: cell.valign || 'middle', bold: head || !!st.b, color: noHash(cell.color ? M.color(cell.color, pal) : head && bg && M.isDark(bg) ? '#FFFFFF' : M.color(st.color, pal) || pal.text) };
                        if (bg) co.fill = { color: noHash(bg) };
                        if (cell.cs > 1) co.colspan = cell.cs;
                        if (cell.rs > 1) co.rowspan = cell.rs;
                        out.push({ text: cell.html && !M.isEmptyHtml(cell.html) ? htmlRuns(cell.html, st, pal) : '', options: co });
                    });
                    return out;
                });
                sl.addTable(rows, {
                    x: box.x, y: box.y, w: box.w, colW: e.colW.map(function (w) { return box.w * w; }), rowH: e.cells.map(function () { return box.h / e.cells.length; }),
                    fontFace: M.font(st.ff, pal), fontSize: st.fs || 16, margin: 4,
                    border: ts.borders === 'none' ? { type: 'none' } : { type: 'solid', pt: 1, color: noHash(M.color(ts.border, pal) || main) }
                });
                break;
            case 'chart':
                var kind = e.chart;
                var CT = pptx.ChartType || pptx.charts || {};
                var type = kind === 'line' ? CT.line : kind === 'area' ? CT.area : kind === 'pie' ? CT.pie : kind === 'doughnut' ? CT.doughnut : kind === 'radar' ? CT.radar : kind === 'scatter' ? CT.scatter : CT.bar;
                var series = (e.data.series || []).map(function (s) { return { name: s.name, labels: e.data.labels, values: s.values.map(function (v) { return v == null ? 0 : +v; }) }; });
                if (kind === 'scatter') series = [{ name: 'X', values: e.data.labels.map(function (l, i) { return +l || i + 1; }) }].concat(series.map(function (s) { return { name: s.name, values: s.values }; }));
                var copts = Object.assign({}, box, {
                    chartColors: R.chartColors(e, pal).map(noHash), showLegend: e.legend !== 'none', legendPos: { bottom: 'b', right: 'r', top: 't', left: 'l' }[e.legend] || 'b',
                    showTitle: !!e.title, title: e.title || undefined, titleColor: noHash(pal.text), titleFontFace: pal.fontB,
                    catAxisLabelColor: noHash(pal.muted), valAxisLabelColor: noHash(pal.muted), legendColor: noHash(pal.text), legendFontFace: pal.fontB,
                    dataLabelColor: noHash(kind === 'pie' || kind === 'doughnut' ? '#FFFFFF' : pal.text), showValue: !!e.labels
                });
                if (type === CT.bar) { copts.barDir = kind === 'bar' || kind === 'stackedBar' ? 'bar' : 'col'; if (kind === 'stacked' || kind === 'stackedBar') copts.barGrouping = 'stacked'; }
                if (kind === 'doughnut') copts.holeSize = 55;
                try { sl.addChart(type, kind === 'pie' || kind === 'doughnut' ? series.slice(0, 1) : series, copts); } catch (err) { console.warn('[Sinerli Present] grafik pptx', err); }
                break;
            case 'icon':
                jobs.push(Promise.resolve(iconPng(e, pal)).then(function (data) { return function () { sl.addImage(Object.assign({}, box, { data: data })); }; }));
                return;
            case 'math':
                jobs.push(nodePng(e).then(function (data) { return function () { sl.addImage(Object.assign({}, box, { data: data })); }; }).catch(function () { return null; }));
                return;
            case 'video':
                var yt = R.youtubeId(e.url);
                if (yt && sl.addMedia) {
                    try { sl.addMedia(Object.assign({}, box, { type: 'online', link: 'https://www.youtube.com/embed/' + yt })); break; } catch (err) {}
                }
                sl.addText('▶ ' + (e.url || ''), Object.assign({}, box, { fill: { color: '1F1F1F' }, color: 'FFFFFF', fontSize: 16, align: 'center', valign: 'middle', hyperlink: e.url ? { url: e.url } : undefined }));
                break;
        }
    }

    var TRANSITION_XML = {
        fade: function () { return '<p:fade/>'; },
        morph: function () { return '<p:fade/>'; },
        push: function (d) { return '<p:push dir="' + d + '"/>'; },
        wipe: function (d) { return '<p:wipe dir="' + d + '"/>'; },
        split: function (d) { return '<p:split orient="' + (d === 'u' || d === 'd' ? 'horz' : 'vert') + '" dir="out"/>'; },
        cover: function (d) { return '<p:cover dir="' + d + '"/>'; },
        reveal: function (d) { return '<p:pull dir="' + d + '"/>'; },
        zoom: function () { return '<p:zoom/>'; },
        flip: function () { return '<p:fade thruBlk="1"/>'; },
        cube: function (d) { return '<p:push dir="' + d + '"/>'; }
    };

    function postProcessPptx(blob, slides) {
        var need = slides.some(function (s) { return s.transition && ((s.transition.type && s.transition.type !== 'none') || s.transition.after != null || s.transition.noClick); });
        if (!need) return Promise.resolve(blob);
        return SO.load('jszip').then(function (JSZip) { return JSZip.loadAsync(blob); }).then(function (zip) {
            return Promise.all(slides.map(function (s, i) {
                var tr = s.transition;
                if (!tr) return null;
                var path = 'ppt/slides/slide' + (i + 1) + '.xml';
                var f = zip.file(path);
                if (!f) return null;
                return f.async('string').then(function (xml) {
                    var dir = { left: 'l', right: 'r', up: 'u', down: 'd' }[tr.dir || 'left'] || 'l';
                    var dur = tr.dur == null ? 0.7 : tr.dur;
                    var attrs = ' spd="' + (dur < 0.5 ? 'fast' : dur > 1 ? 'slow' : 'med') + '"';
                    if (tr.noClick) attrs += ' advClick="0"';
                    if (tr.after != null && tr.after !== '') attrs += ' advTm="' + Math.round(+tr.after * 1000) + '"';
                    var inner = tr.type && tr.type !== 'none' && TRANSITION_XML[tr.type] ? TRANSITION_XML[tr.type](dir) : '';
                    var node = '<p:transition' + attrs + '>' + inner + '</p:transition>';
                    xml = xml.indexOf('<p:timing') !== -1 ? xml.replace('<p:timing', node + '<p:timing') : xml.replace('</p:sld>', node + '</p:sld>');
                    zip.file(path, xml);
                });
            })).then(function () { return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE' }); });
        }).catch(function (err) { console.warn('[Sinerli Present] transisi pptx', err); return blob; });
    }

    C.buildPptx = function (onProgress) {
        var deck = App.deck, pal = App.pal();
        return Promise.all([SO.load('pptx'), prepare(deck.slides)]).then(function (res) {
            var PptxGenJS = res[0];
            var pptx = new PptxGenJS();
            pptx.defineLayout({ name: 'SINESLIDE', width: inch(deck.size.w), height: inch(deck.size.h) });
            pptx.layout = 'SINESLIDE';
            pptx.title = App.getTitle();
            pptx.author = SO.ctx.name || SO.ctx.email || 'Sinerli Present';
            pptx.company = 'Sinerli';
            pptx.theme = { headFontFace: pal.fontH, bodyFontFace: pal.fontB };
            return deck.slides.reduce(function (p, s, i) {
                return p.then(function () {
                    if (onProgress) onProgress(i + 1, deck.slides.length);
                    var sl = pptx.addSlide();
                    if (s.hidden) sl.hidden = true;
                    var bg = s.bg;
                    var decor = pal.decor && pal.decor !== 'none' && !s.hideDecor;
                    var bgJob;
                    if ((!bg && !pal.bg2 && !decor) || (bg && bg.type === 'solid' && !decor)) {
                        sl.background = { color: noHash(bg ? M.color(bg.color, pal) : pal.bg) };
                        bgJob = Promise.resolve();
                    } else {
                        bgJob = C.slideCanvas(s, i, { bgOnly: true, scale: 1.5 }).then(function (cv) { sl.background = { data: cv.toDataURL('image/jpeg', 0.9) }; })
                            .catch(function () { sl.background = { color: noHash(pal.bg) }; });
                    }
                    return bgJob.then(function () {
                        var jobs = [];
                        // Elemen async (gambar/ikon) ditunggu satu per satu agar urutan tumpukan terjaga.
                        return flatten(s.els).reduce(function (q, e) {
                            return q.then(function () {
                                var before = jobs.length;
                                addElement(pptx, sl, e, pal, jobs);
                                if (jobs.length > before) return jobs[jobs.length - 1].then(function (add) { if (typeof add === 'function') add(); });
                            });
                        }, Promise.resolve()).then(function () {
                            var ft = deck.footer || {};
                            if (ft.show && !(ft.skipTitle && s.layout === 'title')) {
                                var fo = { fontFace: pal.fontB, fontSize: Math.max(9, Math.round(12 * deck.size.w / 1280)), color: noHash(pal.muted), y: inch(deck.size.h * 0.925), h: inch(deck.size.h * 0.055) };
                                if (ft.date) sl.addText(ft.dateText || new Intl.DateTimeFormat(SO.locale(), { dateStyle: 'medium' }).format(new Date()), Object.assign({ x: inch(deck.size.w * 0.06), w: inch(deck.size.w * 0.25), align: 'left' }, fo));
                                if (ft.text) sl.addText(ft.text, Object.assign({ x: inch(deck.size.w * 0.33), w: inch(deck.size.w * 0.34), align: 'center' }, fo));
                                if (ft.num) sl.addText(String(i + 1), Object.assign({ x: inch(deck.size.w * 0.69), w: inch(deck.size.w * 0.25), align: 'right' }, fo));
                            }
                            if (s.notes) sl.addNotes(s.notes);
                        });
                    });
                });
            }, Promise.resolve()).then(function () {
                return pptx.write({ outputType: 'blob', compression: true });
            }).then(function (blob) { return postProcessPptx(blob, deck.slides); });
        });
    };

    // ============================================================= ekspor
    C.exportAs = function (fmt) {
        if (App.editing) C.endEdit();
        var name = SO.safeName(App.getTitle(), 'Sinerli Present');
        var busy = SO.busy('s_exporting');
        var fail = function (err) { busy.done(); console.error(err); SO.toast(err && err.message ? err.message : 'c_err_generic', { type: 'error' }); };
        var ok = function () { busy.done(); SO.toast('s_exported', { type: 'success' }); };
        var deck = App.deck;
        if (fmt === 'pptx') {
            C.buildPptx(function (i, n) { busy.set(SO.t('s_exporting_n', { n: i, total: n })); }).then(function (blob) { SO.download(blob, name + '.pptx'); ok(); }).catch(fail);
            return;
        }
        if (fmt === 'pdf') {
            SO.load('jspdf').then(function (lib) {
                var W = deck.size.w * 0.75, H = deck.size.h * 0.75;
                var pdf = new lib.jsPDF({ orientation: W >= H ? 'landscape' : 'portrait', unit: 'pt', format: [W, H], compress: true });
                var slides = deck.slides.map(function (s, i) { return { s: s, i: i }; }).filter(function (x) { return !x.s.hidden; });
                return slides.reduce(function (p, x, k) {
                    return p.then(function () {
                        busy.set(SO.t('s_exporting_n', { n: k + 1, total: slides.length }));
                        return C.slideCanvas(x.s, x.i, { scale: 2 }).then(function (cv) {
                            if (k) pdf.addPage([W, H], W >= H ? 'landscape' : 'portrait');
                            pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, H, undefined, 'FAST');
                        });
                    });
                }, Promise.resolve()).then(function () { SO.download(pdf.output('blob'), name + '.pdf'); ok(); });
            }).catch(fail);
            return;
        }
        if (fmt === 'png' || fmt === 'jpg') {
            C.slideCanvas(App.slide(), App.cur, { scale: 1.5 }).then(function (cv) {
                cv.toBlob(function (b) { SO.download(b, name + ' - ' + (App.cur + 1) + '.' + fmt); ok(); }, fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92);
            }).catch(fail);
            return;
        }
        if (fmt === 'png-all') {
            SO.load('jszip').then(function (JSZip) {
                var zip = new JSZip();
                return deck.slides.reduce(function (p, s, i) {
                    return p.then(function () {
                        busy.set(SO.t('s_exporting_n', { n: i + 1, total: deck.slides.length }));
                        return C.slideCanvas(s, i, { scale: 1.5 }).then(function (cv) {
                            return new Promise(function (res) { cv.toBlob(function (b) { zip.file(SO.t('s_slide') + ' ' + String(i + 1).padStart(2, '0') + '.png', b); res(); }, 'image/png'); });
                        });
                    });
                }, Promise.resolve()).then(function () { return zip.generateAsync({ type: 'blob' }); }).then(function (blob) { SO.download(blob, name + '.zip'); ok(); });
            }).catch(fail);
            return;
        }
        if (fmt === 'txt') {
            var out = [];
            deck.slides.forEach(function (s, i) {
                out.push(SO.t('s_slide') + ' ' + (i + 1) + (s.hidden ? ' (' + SO.t('s_hidden') + ')' : ''));
                s.els.forEach(function (e) {
                    var t = e.html ? M.htmlToText(e.html) : e.cells ? e.cells.map(function (r) { return r.map(function (c) { return M.htmlToText(c.html); }).join('\t'); }).join('\n') : '';
                    if (t) out.push(t);
                });
                if (s.notes) out.push('[' + SO.t('s_notes') + '] ' + s.notes);
                out.push('');
            });
            busy.done();
            SO.download(out.join('\n'), name + '.txt', 'text/plain;charset=utf-8');
            return;
        }
        if (fmt === 'sineslide') {
            App.serialize().then(function (data) { SO.download(JSON.stringify(data), name + '.sineslide', 'application/json'); ok(); }).catch(fail);
            return;
        }
        busy.done();
    };

    // ============================================================= impor
    function kids(n, name) { return n ? Array.prototype.filter.call(n.childNodes, function (c) { return c.nodeType === 1 && (!name || c.localName === name); }) : []; }
    function kid(n, name) { return kids(n, name)[0] || null; }
    function find(n, pathStr) { var cur = n; pathStr.split('/').forEach(function (p) { cur = cur ? kid(cur, p) : null; }); return cur; }
    function deep(n, name) { if (!n) return []; return Array.prototype.slice.call(n.getElementsByTagNameNS('*', name)); }
    function attr(n, a) { return n ? n.getAttribute(a) : null; }
    function xmlDoc(text) { return new DOMParser().parseFromString(text, 'application/xml'); }
    function resolvePath(base, target) {
        if (target.charAt(0) === '/') return target.slice(1);
        var parts = base.split('/');
        parts.pop();
        target.split('/').forEach(function (p) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); });
        return parts.join('/');
    }
    function relsPath(p) { var i = p.lastIndexOf('/'); return p.slice(0, i) + '/_rels/' + p.slice(i + 1) + '.rels'; }

    function hsl(hex) {
        var c = SO.hexToRgb(hex) || [0, 0, 0];
        var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
        if (mx !== mn) {
            var d = mx - mn;
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
            h /= 6;
        }
        return [h, s, l];
    }
    function fromHsl(h, s, l) {
        var f = function (p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
        if (!s) return SO.rgbToHex(l * 255, l * 255, l * 255);
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        return SO.rgbToHex(f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255);
    }

    function Importer(zip) { this.zip = zip; this.cache = {}; this.assets = {}; }
    Importer.prototype.xml = function (path) {
        var self = this;
        if (this.cache[path]) return this.cache[path];
        var f = this.zip.file(path);
        this.cache[path] = f ? f.async('string').then(xmlDoc) : Promise.resolve(null);
        return this.cache[path];
    };
    Importer.prototype.rels = function (path) {
        return this.xml(relsPath(path)).then(function (doc) {
            var map = {};
            if (doc) kids(doc.documentElement, 'Relationship').forEach(function (r) { map[attr(r, 'Id')] = { target: resolvePath(path, attr(r, 'Target')), type: attr(r, 'Type') || '', external: attr(r, 'TargetMode') === 'External', raw: attr(r, 'Target') }; });
            return map;
        });
    };
    Importer.prototype.color = function (parent) {
        if (!parent) return null;
        var fillEl = kid(parent, 'solidFill') || (parent.localName === 'solidFill' ? parent : null);
        var src = fillEl ? kids(fillEl)[0] : null;
        if (!src && /Clr$/.test(parent.localName)) src = parent;
        if (!src) return null;
        var hex = null;
        var map = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
        if (src.localName === 'srgbClr') hex = '#' + attr(src, 'val');
        else if (src.localName === 'schemeClr') hex = this.theme[map[attr(src, 'val')] || attr(src, 'val')] || null;
        else if (src.localName === 'sysClr') hex = '#' + (attr(src, 'lastClr') || '000000');
        else if (src.localName === 'prstClr') hex = SO.toHex(attr(src, 'val')) || '#000000';
        if (!hex) return null;
        var alpha = null;
        var h = hsl(hex);
        kids(src).forEach(function (m) {
            var v = +attr(m, 'val') / 100000;
            if (m.localName === 'lumMod') h[2] *= v;
            if (m.localName === 'lumOff') h[2] += v;
            if (m.localName === 'tint') h[2] = h[2] + (1 - h[2]) * (1 - v);
            if (m.localName === 'shade') h[2] *= v;
            if (m.localName === 'alpha') alpha = v;
        });
        hex = fromHsl(h[0], h[1], SO.clamp(h[2], 0, 1)).toUpperCase();
        return { hex: hex, alpha: alpha };
    };
    Importer.prototype.image = function (rels, rid) {
        var self = this;
        var rel = rels[rid];
        if (!rel || rel.external) return Promise.resolve(null);
        if (this.assets[rel.target]) return Promise.resolve(this.assets[rel.target]);
        var f = this.zip.file(rel.target);
        if (!f) return Promise.resolve(null);
        var ext = rel.target.split('.').pop().toLowerCase();
        var mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }[ext];
        if (!mime) return Promise.resolve(null);
        return f.async('base64').then(function (b64) {
            var rec = App.assets.addDataUrl('data:' + mime + ';base64,' + b64);
            self.assets[rel.target] = rec ? rec.id : null;
            return self.assets[rel.target];
        });
    };

    function xfrmOf(spPr) {
        var x = spPr ? kid(spPr, 'xfrm') : null;
        if (!x) return null;
        var off = kid(x, 'off'), ext = kid(x, 'ext');
        if (!off || !ext) return null;
        return {
            x: +attr(off, 'x') / EMU, y: +attr(off, 'y') / EMU, w: +attr(ext, 'cx') / EMU, h: +attr(ext, 'cy') / EMU,
            rot: (+attr(x, 'rot') || 0) / 60000, flipH: attr(x, 'flipH') === '1', flipV: attr(x, 'flipV') === '1'
        };
    }

    Importer.prototype.placeholderInfo = function (layoutDoc, masterDoc, ph) {
        var type = attr(ph, 'type') || 'body', idx = attr(ph, 'idx');
        var match = function (doc) {
            if (!doc) return null;
            var sps = deep(doc, 'sp');
            var hit = null;
            sps.forEach(function (sp) {
                var p = find(sp, 'nvSpPr/nvPr/ph');
                if (!p || hit) return;
                var t = attr(p, 'type') || 'body';
                if ((idx != null && attr(p, 'idx') === idx && (t === type || type === 'body' || t === 'body')) || (t === type && (type === 'title' || type === 'ctrTitle' || type === 'subTitle'))) hit = sp;
            });
            if (!hit) sps.forEach(function (sp) { var p = find(sp, 'nvSpPr/nvPr/ph'); if (!hit && p && (attr(p, 'type') || 'body') === (type === 'ctrTitle' ? 'title' : type === 'subTitle' ? 'body' : type)) hit = sp; });
            return hit;
        };
        var lsp = match(layoutDoc), msp = match(masterDoc);
        return {
            xfrm: xfrmOf(lsp && kid(lsp, 'spPr')) || xfrmOf(msp && kid(msp, 'spPr')),
            bodyPr: (lsp && find(lsp, 'txBody/bodyPr')) || (msp && find(msp, 'txBody/bodyPr')),
            lvl1: (lsp && find(lsp, 'txBody/lstStyle/lvl1pPr')) || (msp && find(msp, 'txBody/lstStyle/lvl1pPr'))
        };
    };

    Importer.prototype.textBody = function (txBody, defaults) {
        var self = this;
        var sizes = {};
        var paras = kids(txBody, 'p');
        var htmlParts = [];
        var listOpen = null;
        var normAutofit = find(txBody, 'bodyPr/normAutofit');
        var fontScale = normAutofit && attr(normAutofit, 'fontScale') ? +attr(normAutofit, 'fontScale') / 100000 : 1;
        var runsInfo = [];
        paras.forEach(function (p) {
            var pPr = kid(p, 'pPr');
            var algn = attr(pPr, 'algn');
            var lvl = +(attr(pPr, 'lvl') || 0);
            var listType = null;
            if (pPr && kid(pPr, 'buAutoNum')) listType = 'ol';
            else if (pPr && kid(pPr, 'buChar')) listType = 'ul';
            else if (!(pPr && kid(pPr, 'buNone')) && defaults.bullets) listType = 'ul';
            var inner = '';
            var hasText = false;
            kids(p).forEach(function (r) {
                if (r.localName === 'br') { inner += '<br>'; return; }
                if (r.localName !== 'r' && r.localName !== 'fld') return;
                var t = kid(r, 't');
                var text = t ? t.textContent : '';
                if (!text) return;
                hasText = true;
                var rPr = kid(r, 'rPr');
                var css = [];
                var sz = attr(rPr, 'sz') ? +attr(rPr, 'sz') / 100 : null;
                if (sz) { sz = Math.round(sz * fontScale * 2) / 2; sizes[sz] = (sizes[sz] || 0) + text.length; }
                var col = rPr ? self.color(rPr) : null;
                var latin = rPr ? kid(rPr, 'latin') : null;
                var face = latin ? attr(latin, 'typeface') : null;
                if (face === '+mj-lt') face = self.fonts.h; else if (face === '+mn-lt') face = self.fonts.b;
                runsInfo.push({ sz: sz, col: col && col.hex, face: face, len: text.length });
                var open = '', close = '';
                if (attr(rPr, 'b') === '1') { open += '<b>'; close = '</b>' + close; }
                if (attr(rPr, 'i') === '1') { open += '<i>'; close = '</i>' + close; }
                if (attr(rPr, 'u') && attr(rPr, 'u') !== 'none') { open += '<u>'; close = '</u>' + close; }
                if (attr(rPr, 'strike') && attr(rPr, 'strike') !== 'noStrike') { open += '<s>'; close = '</s>' + close; }
                var base = +(attr(rPr, 'baseline') || 0);
                if (base > 0) { open += '<sup>'; close = '</sup>' + close; } else if (base < 0) { open += '<sub>'; close = '</sub>' + close; }
                if (sz) css.push('font-size: ' + sz + 'pt');
                if (col) css.push('color: ' + col.hex);
                if (face) css.push('font-family: ' + face);
                var link = rPr ? kid(rPr, 'hlinkClick') : null;
                var href = link && defaults.rels && defaults.rels[attr(link, 'r:id') || link.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')];
                var seg = SO.esc(text);
                if (css.length) seg = '<span style="' + css.join('; ') + '">' + seg + '</span>';
                seg = open + seg + close;
                if (href && href.external) seg = '<a href="' + SO.esc(href.raw) + '">' + seg + '</a>';
                inner += seg;
            });
            var style = [];
            if (algn) style.push('text-align: ' + ({ l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' }[algn] || 'left'));
            if (lvl && !listType) style.push('margin-left: ' + lvl * 24 + 'pt');
            if (lvl && listType) style.push('margin-left: ' + lvl * 24 + 'pt');
            var styleAttr = style.length ? ' style="' + style.join('; ') + '"' : '';
            if (listType && (hasText || paras.length === 1)) {
                if (listOpen !== listType) { if (listOpen) htmlParts.push('</' + listOpen + '>'); htmlParts.push('<' + listType + '>'); listOpen = listType; }
                htmlParts.push('<li' + styleAttr + '>' + (inner || '<br>') + '</li>');
            } else {
                if (listOpen) { htmlParts.push('</' + listOpen + '>'); listOpen = null; }
                htmlParts.push('<div' + styleAttr + '>' + (inner || '<br>') + '</div>');
            }
        });
        if (listOpen) htmlParts.push('</' + listOpen + '>');
        var html = htmlParts.join('');
        // Ukuran/warna/font dominan menjadi gaya kotak; run yang sama dibersihkan.
        var dom = function (key) {
            var cnt = {};
            runsInfo.forEach(function (r) { if (r[key] != null) cnt[r[key]] = (cnt[r[key]] || 0) + r.len; });
            var best = null;
            Object.keys(cnt).forEach(function (k) { if (best === null || cnt[k] > cnt[best]) best = k; });
            return best;
        };
        var st = {};
        var fs = dom('sz'), col = dom('col'), face = dom('face');
        st.fs = fs ? +fs : Math.round(defaults.fs * fontScale * 2) / 2;
        if (col) st.color = col; else if (defaults.color) st.color = defaults.color;
        if (face) st.ff = face; else st.ff = defaults.heading ? 'theme:heading' : 'theme:body';
        var clean = document.createElement('div');
        clean.innerHTML = html;
        SO.$$('span[style]', clean).forEach(function (sp) {
            if (fs && sp.style.fontSize === fs + 'pt') sp.style.removeProperty('font-size');
            if (col && SO.toHex(sp.style.color) === col) sp.style.removeProperty('color');
            if (face && sp.style.fontFamily.replace(/["']/g, '') === face) sp.style.removeProperty('font-family');
        });
        var align = null;
        var firstDiv = clean.querySelector('[style*="text-align"]');
        if (firstDiv && SO.$$('div, li', clean).every(function (n) { return n.style.textAlign === firstDiv.style.textAlign; })) {
            align = firstDiv.style.textAlign;
            SO.$$('div, li', clean).forEach(function (n) { n.style.removeProperty('text-align'); });
        }
        if (align) st.align = align;
        return { html: M.sanitize(clean.innerHTML), st: st, autofit: normAutofit ? 'shrink' : find(txBody, 'bodyPr/spAutoFit') ? 'grow' : 'none' };
    };

    Importer.prototype.shapeEl = function (sp, ctx) {
        var self = this;
        var spPr = kid(sp, 'spPr');
        var ph = find(sp, 'nvSpPr/nvPr/ph');
        var phInfo = ph ? this.placeholderInfo(ctx.layout, ctx.master, ph) : null;
        var xf = xfrmOf(spPr) || (phInfo && phInfo.xfrm);
        if (!xf) return null;
        xf = ctx.tf(xf);
        var prstEl = spPr ? kid(spPr, 'prstGeom') : null;
        var prst = prstEl ? attr(prstEl, 'prst') : 'rect';
        var known = M.SHAPES.some(function (s) { return s[0] === prst; });
        var fillC = spPr && kid(spPr, 'solidFill') ? self.color(spPr) : null;
        var grad = spPr ? kid(spPr, 'gradFill') : null;
        var noFill = spPr && kid(spPr, 'noFill');
        var styleFill = !fillC && !noFill && !grad ? find(sp, 'style/fillRef') : null;
        if (styleFill && +attr(styleFill, 'idx') > 0) fillC = self.color(styleFill);
        var ln = spPr ? kid(spPr, 'ln') : null;
        var lineC = ln && !kid(ln, 'noFill') ? self.color(ln) : null;
        if (!lineC && ln && !kid(ln, 'noFill') && !kid(ln, 'solidFill')) { var lr = find(sp, 'style/lnRef'); if (lr && +attr(lr, 'idx') > 0) lineC = self.color(lr); }
        if (!ln) { var lr2 = find(sp, 'style/lnRef'); if (lr2 && +attr(lr2, 'idx') > 0) lineC = self.color(lr2); }
        var txBody = kid(sp, 'txBody');
        var phType = ph ? (attr(ph, 'type') || 'body') : null;
        var isTitle = phType === 'title' || phType === 'ctrTitle';
        var defFs = 18;
        if (phInfo && phInfo.lvl1 && find(phInfo.lvl1, 'defRPr') && attr(find(phInfo.lvl1, 'defRPr'), 'sz')) defFs = +attr(find(phInfo.lvl1, 'defRPr'), 'sz') / 100;
        else if (ph) defFs = isTitle ? (phType === 'ctrTitle' ? 54 : 40) : phType === 'subTitle' ? 24 : 24;
        var hasGeom = (prst && prst !== 'rect') || fillC || grad || lineC;
        var e;
        if (hasGeom) {
            e = M.shape(known ? prst : 'rect', xf.x, xf.y, xf.w, xf.h);
            e.fill = grad ? (function () { var gs = deep(grad, 'gs'); var c1 = self.color(gs[0]), c2 = self.color(gs[gs.length - 1]); var lin = kid(grad, 'lin'); return { type: 'gradient', color: c1 ? c1.hex : '#FFFFFF', color2: c2 ? c2.hex : '#000000', angle: lin ? (+attr(lin, 'ang') / 60000 + 90) % 360 : 90 }; })()
                : fillC ? { type: 'solid', color: fillC.hex, opacity: fillC.alpha != null ? fillC.alpha : undefined } : { type: 'none' };
            e.line = lineC ? { type: 'solid', color: lineC.hex, w: ln && attr(ln, 'w') ? +attr(ln, 'w') / 12700 : 1, dash: dashOf(ln) } : { type: 'none' };
            e.st = Object.assign({}, M.DEFAULT_TEXT, { align: 'center', valign: 'middle', color: 'theme:text' });
            if (e.fill.type === 'solid' && M.isDark(e.fill.color)) e.st.color = '#FFFFFF';
        } else {
            e = M.textBox(xf.x, xf.y, xf.w, xf.h, '');
            e.autofit = 'none';
        }
        e.rot = Math.round(xf.rot) || 0;
        if (xf.flipH) e.flipH = true;
        if (xf.flipV) e.flipV = true;
        var name = find(sp, 'nvSpPr/cNvPr');
        if (name && attr(name, 'name') && !ph) e.name = attr(name, 'name');
        if (txBody) {
            var bodyPr = kid(txBody, 'bodyPr') || (phInfo && phInfo.bodyPr);
            var anchor = attr(bodyPr, 'anchor') || (phInfo && attr(phInfo.bodyPr, 'anchor'));
            var tb = self.textBody(txBody, { fs: defFs, heading: isTitle, bullets: ph && !isTitle && phType !== 'subTitle' && phType !== 'ctrTitle' && phType !== 'dt' && phType !== 'ftr' && phType !== 'sldNum', rels: ctx.rels, color: hasGeom ? e.st.color : null });
            e.html = tb.html;
            Object.assign(e.st, tb.st);
            if (anchor) e.st.valign = anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top';
            else if (isTitle) e.st.valign = 'middle';
            if (bodyPr && (attr(bodyPr, 'lIns') || attr(bodyPr, 'tIns'))) {
                var g = function (a, d) { return attr(bodyPr, a) != null ? +attr(bodyPr, a) / EMU : d; };
                e.inset = { l: g('lIns', 9.6), t: g('tIns', 4.8), r: g('rIns', 9.6), b: g('bIns', 4.8) };
            }
            if (tb.autofit !== 'none') e.autofit = tb.autofit;
            if (ph && !hasGeom) e.autofit = 'shrink';
        }
        if (ph && (phType === 'dt' || phType === 'ftr' || phType === 'sldNum') && M.isEmptyHtml(e.html)) return null;
        if (ph && !hasGeom) {
            e.ph = isTitle ? 'title' : phType === 'subTitle' ? 'subtitle' : 'body';
            if (e.ph === 'title') e.st.ff = e.st.ff === 'theme:body' ? 'theme:heading' : e.st.ff;
        }
        if (!hasGeom && M.isEmptyHtml(e.html) && !ph) return null;
        return e;
    };

    function dashOf(ln) {
        var d = ln ? kid(ln, 'prstDash') : null;
        var v = d ? attr(d, 'val') : 'solid';
        return /dashDot/.test(v) ? 'dashDot' : /lgDash/.test(v) ? 'longDash' : /dash/i.test(v) ? 'dash' : /dot/i.test(v) ? 'dot' : 'solid';
    }

    Importer.prototype.spTree = function (tree, ctx, out) {
        var self = this;
        var jobs = [];
        kids(tree).forEach(function (n) {
            var name = n.localName;
            if (name === 'AlternateContent') {
                var alt = kid(n, 'Fallback') || kid(n, 'Choice');
                if (alt) jobs.push(self.spTree(alt, ctx, out));
                return;
            }
            var slot = out.length;
            out.push(null);
            if (name === 'sp') { out[slot] = self.shapeEl(n, ctx); return; }
            if (name === 'cxnSp') {
                var xf = xfrmOf(kid(n, 'spPr'));
                if (!xf) return;
                xf = ctx.tf(xf);
                var ln = find(n, 'spPr/ln');
                var col = ln ? self.color(ln) : null;
                if (!col) { var lr = find(n, 'style/lnRef'); col = lr ? self.color(lr) : null; }
                var x1 = xf.flipH ? xf.x + xf.w : xf.x, x2 = xf.flipH ? xf.x : xf.x + xf.w, y1 = xf.flipV ? xf.y + xf.h : xf.y, y2 = xf.flipV ? xf.y : xf.y + xf.h;
                var e = M.line(x1, y1, x2, y2);
                var endType = function (tag) { var t = ln ? attr(kid(ln, tag), 'type') : null; return !t || t === 'none' ? 'none' : t === 'arrow' ? 'open' : t === 'oval' ? 'oval' : t === 'diamond' ? 'diamond' : 'arrow'; };
                e.line = { type: 'solid', color: col ? col.hex : '#000000', w: ln && attr(ln, 'w') ? +attr(ln, 'w') / 12700 : 1, dash: dashOf(ln), head: endType('headEnd'), tail: endType('tailEnd') };
                out[slot] = e;
                return;
            }
            if (name === 'pic') {
                var pxf = xfrmOf(kid(n, 'spPr'));
                var ph = find(n, 'nvPicPr/nvPr/ph');
                if (!pxf && ph) { var info = self.placeholderInfo(ctx.layout, ctx.master, ph); pxf = info.xfrm; }
                if (!pxf) return;
                pxf = ctx.tf(pxf);
                var blip = deep(n, 'blip')[0];
                var rid = blip ? (blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed')) : null;
                jobs.push(self.image(ctx.rels, rid).then(function (asset) {
                    if (!asset) return;
                    var im = M.image(asset, pxf.x, pxf.y, pxf.w, pxf.h);
                    im.rot = Math.round(pxf.rot) || 0;
                    if (pxf.flipH) im.flipH = true;
                    if (pxf.flipV) im.flipV = true;
                    var src = deep(n, 'srcRect')[0];
                    if (src) {
                        var g = function (a) { return Math.max(0, (+attr(src, a) || 0) / 100000); };
                        if (g('l') || g('t') || g('r') || g('b')) im.crop = { l: g('l'), t: g('t'), r: g('r'), b: g('b') };
                    }
                    var geom = find(n, 'spPr/prstGeom');
                    if (geom && attr(geom, 'prst') !== 'rect' && M.SHAPES.some(function (s) { return s[0] === attr(geom, 'prst'); })) im.mask = attr(geom, 'prst');
                    var nm = find(n, 'nvPicPr/cNvPr');
                    if (nm && attr(nm, 'descr')) im.alt = attr(nm, 'descr');
                    out[slot] = im;
                }));
                return;
            }
            if (name === 'graphicFrame') {
                var gxf = find(n, 'xfrm');
                var gx = gxf ? ctx.tf({ x: +attr(kid(gxf, 'off'), 'x') / EMU, y: +attr(kid(gxf, 'off'), 'y') / EMU, w: +attr(kid(gxf, 'ext'), 'cx') / EMU, h: +attr(kid(gxf, 'ext'), 'cy') / EMU, rot: 0 }) : null;
                if (!gx) return;
                var tbl = deep(n, 'tbl')[0];
                if (tbl) { out[slot] = self.tableEl(tbl, gx, ctx); return; }
                var chartRef = deep(n, 'chart')[0];
                if (chartRef) {
                    var crid = chartRef.getAttribute('r:id') || chartRef.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
                    var rel = ctx.rels[crid];
                    if (rel) jobs.push(self.xml(rel.target).then(function (doc) { if (doc) out[slot] = self.chartEl(doc, gx); }));
                }
                return;
            }
            if (name === 'grpSp') {
                var gp = find(n, 'grpSpPr/xfrm');
                if (!gp) return;
                var off = kid(gp, 'off'), ext = kid(gp, 'ext'), choff = kid(gp, 'chOff'), chext = kid(gp, 'chExt');
                var outer = ctx.tf({ x: +attr(off, 'x') / EMU, y: +attr(off, 'y') / EMU, w: +attr(ext, 'cx') / EMU, h: +attr(ext, 'cy') / EMU, rot: 0 });
                var cx = +attr(choff, 'x') / EMU, cy = +attr(choff, 'y') / EMU, cw = (+attr(chext, 'cx') / EMU) || 1, chh = (+attr(chext, 'cy') / EMU) || 1;
                var sx = outer.w / cw, sy = outer.h / chh;
                var sub = Object.assign({}, ctx, { tf: function (b) { return Object.assign({}, b, { x: outer.x + (b.x - cx) * sx, y: outer.y + (b.y - cy) * sy, w: b.w * sx, h: b.h * sy }); } });
                var inner = [];
                jobs.push(self.spTree(n, sub, inner).then(function () { out[slot] = inner.filter(Boolean); }));
            }
        });
        return Promise.all(jobs);
    };

    Importer.prototype.tableEl = function (tbl, gx, ctx) {
        var self = this;
        var cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map(function (g) { return +attr(g, 'w') / EMU; });
        var total = cols.reduce(function (a, b) { return a + b; }, 0) || 1;
        var trs = kids(tbl, 'tr');
        var e = M.table(trs.length || 1, cols.length || 1, gx.x, gx.y, gx.w, gx.h);
        e.colW = cols.map(function (c) { return c / total; });
        var tblPr = kid(tbl, 'tblPr');
        e.tstyle.header = attr(tblPr, 'firstRow') === '1';
        e.tstyle.banded = attr(tblPr, 'bandRow') === '1';
        e.tstyle.firstCol = attr(tblPr, 'firstCol') === '1';
        var sizes = [];
        trs.forEach(function (tr, r) {
            kids(tr, 'tc').forEach(function (tc, c) {
                if (!e.cells[r] || !e.cells[r][c]) return;
                var cell = e.cells[r][c];
                if (attr(tc, 'hMerge') === '1' || attr(tc, 'vMerge') === '1') cell.hide = true;
                if (+attr(tc, 'gridSpan') > 1) cell.cs = +attr(tc, 'gridSpan');
                if (+attr(tc, 'rowSpan') > 1) cell.rs = +attr(tc, 'rowSpan');
                var tx = kid(tc, 'txBody');
                if (tx) { var tb = self.textBody(tx, { fs: 18, rels: ctx.rels }); cell.html = tb.html; sizes.push(tb.st.fs); if (tb.st.align) cell.align = tb.st.align; if (tb.st.color) cell.color = tb.st.color; }
                var tcPr = kid(tc, 'tcPr');
                var fc = tcPr && kid(tcPr, 'solidFill') ? self.color(tcPr) : null;
                if (fc) cell.fill = fc.hex;
                if (tcPr && attr(tcPr, 'anchor')) cell.valign = attr(tcPr, 'anchor') === 'ctr' ? 'middle' : attr(tcPr, 'anchor') === 'b' ? 'bottom' : 'top';
            });
        });
        if (sizes.length) e.st.fs = sizes.sort(function (a, b) { return a - b; })[Math.floor(sizes.length / 2)];
        return e;
    };

    Importer.prototype.chartEl = function (doc, gx) {
        var plot = deep(doc, 'plotArea')[0];
        if (!plot) return null;
        var node = kids(plot).filter(function (k) { return /Chart$/.test(k.localName); })[0];
        if (!node) return null;
        var kindMap = { lineChart: 'line', line3DChart: 'line', areaChart: 'area', area3DChart: 'area', pieChart: 'pie', pie3DChart: 'pie', doughnutChart: 'doughnut', radarChart: 'radar', scatterChart: 'scatter' };
        var kind = kindMap[node.localName] || 'column';
        if (/bar/i.test(node.localName)) {
            var dir = attr(kid(node, 'barDir'), 'val');
            var grouping = attr(kid(node, 'grouping'), 'val');
            kind = dir === 'bar' ? (grouping === 'stacked' || grouping === 'percentStacked' ? 'stackedBar' : 'bar') : (grouping === 'stacked' || grouping === 'percentStacked' ? 'stacked' : 'column');
        }
        var e = M.chart(kind, gx.x, gx.y, gx.w, gx.h);
        var pts = function (n) { return deep(n, 'pt').map(function (p) { return { i: +attr(p, 'idx'), v: kid(p, 'v') ? kid(p, 'v').textContent : '' }; }); };
        var labels = [];
        e.data.series = kids(node, 'ser').map(function (ser, si) {
            var name = deep(kid(ser, 'tx'), 'v')[0];
            var cat = kid(ser, 'cat') || kid(ser, 'xVal');
            if (cat && !labels.length) pts(cat).forEach(function (p) { labels[p.i] = p.v; });
            var val = kid(ser, 'val') || kid(ser, 'yVal');
            var values = [];
            if (val) pts(val).forEach(function (p) { values[p.i] = p.v === '' ? null : +p.v; });
            return { name: name ? name.textContent : SO.t('s_series') + ' ' + (si + 1), values: values.map(function (v) { return v == null ? null : v; }) };
        });
        var n = Math.max.apply(null, [labels.length].concat(e.data.series.map(function (s) { return s.values.length; })));
        e.data.labels = [];
        for (var i = 0; i < n; i++) e.data.labels.push(labels[i] != null ? labels[i] : String(i + 1));
        e.data.series.forEach(function (s) { while (s.values.length < n) s.values.push(null); });
        var title = deep(deep(doc, 'title')[0], 't').map(function (t) { return t.textContent; }).join('');
        e.title = title;
        var legend = deep(doc, 'legendPos')[0];
        e.legend = deep(doc, 'legend').length ? ({ b: 'bottom', r: 'right', t: 'top', l: 'left' }[attr(legend, 'val')] || 'right') : 'none';
        return e;
    };

    Importer.prototype.background = function (docs, rels) {
        var self = this;
        for (var i = 0; i < docs.length; i++) {
            var d = docs[i];
            if (!d) continue;
            var bg = deep(d.doc, 'bg')[0];
            if (!bg) continue;
            var pr = kid(bg, 'bgPr');
            if (pr) {
                if (kid(pr, 'solidFill')) { var c = self.color(pr); if (c) return Promise.resolve({ type: 'solid', color: c.hex }); }
                var grad = kid(pr, 'gradFill');
                if (grad) { var gs = deep(grad, 'gs'); var c1 = self.color(gs[0]), c2 = self.color(gs[gs.length - 1]); return Promise.resolve({ type: 'gradient', color: c1 ? c1.hex : '#FFFFFF', color2: c2 ? c2.hex : '#FFFFFF', angle: 135 }); }
                var blip = deep(pr, 'blip')[0];
                if (blip) {
                    var rid = blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
                    return self.image(d.rels, rid).then(function (asset) { return asset ? { type: 'image', image: asset, fit: 'cover' } : null; });
                }
            }
            var ref = kid(bg, 'bgRef');
            if (ref) { var rc = self.color(ref); if (rc) return Promise.resolve({ type: 'solid', color: rc.hex }); }
        }
        return Promise.resolve(null);
    };

    Importer.prototype.run = function () {
        var self = this;
        return Promise.all([this.xml('ppt/presentation.xml'), this.rels('ppt/presentation.xml')]).then(function (res) {
            var pres = res[0], prels = res[1];
            if (!pres) throw new Error(SO.t('s_import_bad_pptx'));
            var sz = deep(pres, 'sldSz')[0];
            var W = sz ? Math.round(+attr(sz, 'cx') / EMU) : 1280, H = sz ? Math.round(+attr(sz, 'cy') / EMU) : 720;
            var themeRel = Object.keys(prels).map(function (k) { return prels[k]; }).filter(function (r) { return /theme$/.test(r.type); })[0];
            return self.xml(themeRel ? themeRel.target : 'ppt/theme/theme1.xml').then(function (theme) {
                self.theme = {};
                self.fonts = { h: 'Calibri', b: 'Calibri' };
                if (theme) {
                    var scheme = deep(theme, 'clrScheme')[0];
                    kids(scheme).forEach(function (c) {
                        var v = kids(c)[0];
                        if (!v) return;
                        self.theme[c.localName] = '#' + (attr(v, 'val') && v.localName === 'srgbClr' ? attr(v, 'val') : attr(v, 'lastClr') || '000000');
                    });
                    var major = find(deep(theme, 'majorFont')[0], 'latin'), minor = find(deep(theme, 'minorFont')[0], 'latin');
                    if (major && attr(major, 'typeface')) self.fonts.h = attr(major, 'typeface');
                    if (minor && attr(minor, 'typeface')) self.fonts.b = attr(minor, 'typeface');
                }
                var deck = M.newDeck('16:9', 'office');
                M.resizeDeck(deck, W, H, 'fit');
                deck.slides = [];
                deck.theme = {
                    id: 'office', variant: 0, decor: 'none',
                    colors: { bg: self.theme.lt1 || '#FFFFFF', text: self.theme.dk1 || '#000000', title: self.theme.dk1 || '#000000', accents: [1, 2, 3, 4, 5, 6].map(function (i) { return self.theme['accent' + i] || null; }).filter(Boolean) },
                    fonts: { h: self.fonts.h, b: self.fonts.b, custom: true }
                };
                var ids = deep(deep(pres, 'sldIdLst')[0], 'sldId').map(function (s) { return s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'); });
                return ids.reduce(function (p, rid, i) {
                    return p.then(function () {
                        var rel = prels[rid];
                        if (!rel) return;
                        if (self.onProgress) self.onProgress(i + 1, ids.length);
                        return self.slide(rel.target, W, H).then(function (s) { if (s) deck.slides.push(s); });
                    });
                }, Promise.resolve()).then(function () {
                    if (!deck.slides.length) deck.slides.push(M.newSlide('title', W, H));
                    return deck;
                });
            });
        });
    };

    Importer.prototype.slide = function (path, W, H) {
        var self = this;
        return Promise.all([this.xml(path), this.rels(path)]).then(function (res) {
            var doc = res[0], rels = res[1];
            if (!doc) return null;
            var layoutRel = Object.keys(rels).map(function (k) { return rels[k]; }).filter(function (r) { return /slideLayout$/.test(r.type); })[0];
            var notesRel = Object.keys(rels).map(function (k) { return rels[k]; }).filter(function (r) { return /notesSlide$/.test(r.type); })[0];
            var layoutP = layoutRel ? Promise.all([self.xml(layoutRel.target), self.rels(layoutRel.target)]) : Promise.resolve([null, {}]);
            return layoutP.then(function (lres) {
                var layout = lres[0], lrels = lres[1];
                var masterRel = Object.keys(lrels).map(function (k) { return lrels[k]; }).filter(function (r) { return /slideMaster$/.test(r.type); })[0];
                var masterP = masterRel ? Promise.all([self.xml(masterRel.target), self.rels(masterRel.target)]) : Promise.resolve([null, {}]);
                return masterP.then(function (mres) {
                    var master = mres[0], mrels = mres[1];
                    var slide = { id: M.uid('s'), layout: 'blank', els: [], notes: '', anims: [] };
                    if (attr(doc.documentElement, 'show') === '0') slide.hidden = true;
                    var ctx = { rels: rels, layout: layout, master: master, tf: function (b) { return b; } };
                    var tree = deep(doc, 'spTree')[0];
                    var out = [];
                    var jobs = [tree ? self.spTree(tree, ctx, out) : null];
                    jobs.push(self.background([{ doc: doc, rels: rels }, layout && { doc: layout, rels: lrels }, master && { doc: master, rels: mrels }], rels).then(function (bg) { if (bg) slide.bg = bg; }));
                    if (notesRel) jobs.push(self.xml(notesRel.target).then(function (nd) {
                        if (!nd) return;
                        deep(nd, 'sp').forEach(function (sp) {
                            var ph = find(sp, 'nvSpPr/nvPr/ph');
                            if (ph && attr(ph, 'type') === 'body') slide.notes = kids(kid(sp, 'txBody'), 'p').map(function (p) { return deep(p, 't').map(function (t) { return t.textContent; }).join(''); }).join('\n').trim();
                        });
                    }));
                    var tr = deep(doc, 'transition')[0];
                    if (tr) {
                        var inner = kids(tr)[0];
                        var map = { fade: 'fade', push: 'push', wipe: 'wipe', split: 'split', cover: 'cover', pull: 'reveal', zoom: 'zoom', cut: 'none', randomBar: 'wipe', dissolve: 'fade' };
                        slide.transition = { type: inner ? map[inner.localName] || 'fade' : 'none', dur: attr(tr, 'spd') === 'fast' ? 0.4 : attr(tr, 'spd') === 'slow' ? 1.2 : 0.7, dir: { l: 'left', r: 'right', u: 'up', d: 'down' }[attr(inner, 'dir')] || 'left' };
                        if (attr(tr, 'advTm')) slide.transition.after = +attr(tr, 'advTm') / 1000;
                        if (attr(tr, 'advClick') === '0') slide.transition.noClick = true;
                    }
                    return Promise.all(jobs).then(function () {
                        var flat = [];
                        (function add(list) { list.forEach(function (x) { if (Array.isArray(x)) add(x); else if (x) flat.push(x); }); })(out);
                        slide.els = flat;
                        var phs = flat.map(function (e) { return e.ph; });
                        slide.layout = phs.indexOf('subtitle') !== -1 ? 'title' : phs.indexOf('title') !== -1 && phs.indexOf('body') !== -1 ? 'titleContent' : phs.indexOf('title') !== -1 ? 'titleOnly' : 'blank';
                        return slide;
                    });
                });
            });
        });
    };

    C.importPptx = function (file) {
        var busy = SO.busy('s_importing');
        return SO.load('jszip').then(function (JSZip) { return JSZip.loadAsync(file); }).then(function (zip) {
            var imp = new Importer(zip);
            imp.onProgress = function (i, n) { busy.set(SO.t('s_importing_n', { n: i, total: n })); };
            return imp.run();
        }).then(function (deck) {
            busy.done();
            return deck;
        }).catch(function (err) {
            busy.done();
            console.error(err);
            throw err;
        });
    };

    C.importFile = function (file) {
        if (!file) return;
        var name = file.name.replace(/\.[^.]+$/, '');
        var ext = (file.name.split('.').pop() || '').toLowerCase();
        var open = function (content) {
            App.session.newKey();
            App.loadDocument(content, name);
            App.session.markDirty();
            SO.toast('s_imported', { type: 'success' });
        };
        if (ext === 'pptx') {
            C.importPptx(file).then(function (deck) { open(Object.assign(deck, { assets: {} })); }).catch(function (err) { SO.toast(err.message || 's_import_bad_pptx', { type: 'error', ms: 6000 }); });
            return;
        }
        if (ext === 'ppt') { SO.alert('s_import_ppt_legacy'); return; }
        if (ext === 'sineslide' || ext === 'json') {
            SO.readFile(file, 'text').then(function (t) {
                var data = JSON.parse(t);
                if (!data || data.app !== 'sineslide') throw new Error(SO.t('s_import_bad_file'));
                open(data);
            }).catch(function (err) { SO.toast(err.message || 's_import_bad_file', { type: 'error' }); });
            return;
        }
        if (/^image\//.test(file.type)) { C.insertImageFile(file); return; }
        SO.toast('s_import_bad_file', { type: 'error' });
    };

    // ============================================================ cetak
    C.print = function () {
        if (App.editing) C.endEdit();
        SO.form({
            title: 's_print', width: 440, okLabel: 's_print_btn',
            fields: [
                { name: 'layout', label: 's_print_layout', type: 'select', value: App._printLayout || 'full', options: [
                    { value: 'full', label: 's_print_full' }, { value: 'notes', label: 's_print_notes' }, { value: 'h1', label: 's_print_h1' }, { value: 'h2', label: 's_print_h2' },
                    { value: 'h3', label: 's_print_h3' }, { value: 'h4', label: 's_print_h4' }, { value: 'h6', label: 's_print_h6' }, { value: 'h9', label: 's_print_h9' }
                ] },
                { name: 'range', label: 's_print_range', type: 'select', value: 'all', options: [{ value: 'all', label: 's_print_all' }, { value: 'current', label: 's_print_current' }] },
                { name: 'hidden', label: 's_print_hidden', type: 'checkbox', value: false },
                { name: 'frame', label: 's_print_frame', type: 'checkbox', value: true }
            ]
        }).then(function (v) {
            if (!v) return;
            App._printLayout = v.layout;
            buildPrint(v);
        });
    };

    function buildPrint(v) {
        var deck = App.deck;
        var root = document.getElementById('ssPrintRoot');
        root.innerHTML = '';
        var list = deck.slides.map(function (s, i) { return { s: s, i: i }; }).filter(function (x) { return (v.range === 'current' ? x.i === App.cur : true) && (v.hidden || !x.s.hidden); });
        if (!list.length) { SO.toast('s_all_hidden', { type: 'warn' }); return; }
        var landscape = v.layout === 'full' ? deck.size.w >= deck.size.h : false;
        var style = document.getElementById('ssPrintStyle') || SO.el('style', { id: 'ssPrintStyle' });
        style.textContent = '@page { size: A4 ' + (landscape ? 'landscape' : 'portrait') + '; margin: 10mm; }';
        document.head.appendChild(style);
        var PW = landscape ? 1047 : 718, PH = landscape ? 718 : 1047; // area cetak A4 dikurangi margin (96 dpi)
        var place = function (parent, x, sw, sh) {
            var scale = Math.min(sw / deck.size.w, sh / deck.size.h);
            var box = SO.el('div', { class: 'ss-print-slide' + (v.frame ? ' is-framed' : ''), style: { width: deck.size.w * scale + 'px', height: deck.size.h * scale + 'px' } });
            var node = R.renderSlide(deck, x.s, { mode: 'export', index: x.i });
            node.style.transform = 'scale(' + scale + ')';
            node.style.transformOrigin = '0 0';
            box.appendChild(node);
            parent.appendChild(box);
            return box;
        };
        var page = function () { var p = SO.el('div', { class: 'ss-print-page', style: { width: PW + 'px', height: PH + 'px' } }); root.appendChild(p); return p; };
        var header = function (p, n) {
            var h = SO.el('div', { class: 'ss-print-head' });
            h.appendChild(SO.el('span', { text: App.getTitle() }));
            h.appendChild(SO.el('span', { text: String(n) }));
            p.appendChild(h);
        };
        if (v.layout === 'full') {
            list.forEach(function (x) { var p = page(); p.classList.add('is-center'); place(p, x, PW, PH); });
        } else if (v.layout === 'notes') {
            list.forEach(function (x) {
                var p = page();
                header(p, x.i + 1);
                var top = SO.el('div', { class: 'ss-print-notes-slide' });
                p.appendChild(top);
                place(top, x, PW * 0.86, PH * 0.44);
                p.appendChild(SO.el('div', { class: 'ss-print-notes-text', text: x.s.notes || '' }));
            });
        } else {
            var per = +v.layout.slice(1);
            var cols = per === 1 ? 1 : per <= 4 && per !== 3 ? (per === 2 ? 1 : 2) : per === 3 ? 1 : per === 6 ? 2 : 3;
            var rows = Math.ceil(per / cols);
            for (var k = 0; k < list.length; k += per) {
                var p2 = page();
                header(p2, Math.floor(k / per) + 1);
                var grid = SO.el('div', { class: 'ss-print-grid' + (per === 3 ? ' is-lines' : ''), style: { gridTemplateColumns: 'repeat(' + cols + ', 1fr)', gridTemplateRows: 'repeat(' + rows + ', 1fr)' } });
                p2.appendChild(grid);
                list.slice(k, k + per).forEach(function (x) {
                    var cell = SO.el('div', { class: 'ss-print-cell' });
                    grid.appendChild(cell);
                    var cw = (PW - 40) / cols * (per === 3 ? 0.5 : 0.94), ch = (PH - 70) / rows * 0.9;
                    place(cell, x, cw, ch);
                    if (per === 3) { var lines = SO.el('div', { class: 'ss-print-lines' }); for (var l = 0; l < 7; l++) lines.appendChild(SO.el('div')); cell.appendChild(lines); }
                });
            }
        }
        root.classList.add('is-building');
        var busy = SO.busy('s_preparing_print');
        prepare(list.map(function (x) { return x.s; })).then(function () {
            R.fitText(root);
            return waitImages(root);
        }).then(function () {
            busy.done();
            root.classList.remove('is-building');
            var cleanup = function () { root.innerHTML = ''; global.removeEventListener('afterprint', cleanup); };
            global.addEventListener('afterprint', cleanup);
            global.print();
        }).catch(function (err) { busy.done(); root.classList.remove('is-building'); SO.toast(err.message || 'c_err_generic', { type: 'error' }); });
    }
})(window);
