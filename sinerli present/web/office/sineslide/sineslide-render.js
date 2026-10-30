/**
 * Sinerli Present — perender slide ke DOM. Dipakai editor, thumbnail, tayangan
 * slide, cetak, dan ekspor gambar/PDF. Semua slide dibangun pada ukuran asli
 * (mis. 1280×720) lalu diskalakan dengan CSS transform.
 */
(function (global) {
    'use strict';

    var M = global.SSM;
    var R = global.SSR = {};
    var NS = 'http://www.w3.org/2000/svg';
    var gradSeq = 0;

    R.assets = null; // SO.Assets, diisi aplikasi.

    function div(cls, style) {
        var d = document.createElement('div');
        if (cls) d.className = cls;
        if (style) Object.assign(d.style, style);
        return d;
    }
    function px(n) { return (Math.round(n * 100) / 100) + 'px'; }

    var palCache = { key: '', pal: null };
    R.pal = function (deck) {
        var key = JSON.stringify(deck.theme || {});
        if (palCache.key !== key) { palCache.key = key; palCache.pal = M.resolveTheme(deck.theme); }
        return palCache.pal;
    };

    // ================================================================ isian
    function rgba(hex, alpha) {
        var c = SO.hexToRgb(hex) || [0, 0, 0];
        return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (alpha == null ? 1 : alpha) + ')';
    }
    R.rgba = rgba;
    /** CSS background untuk isian {type:'solid'|'gradient'|'image'|'none'}. */
    function fillCss(fill, pal) {
        if (!fill || fill.type === 'none') return 'transparent';
        var a = fill.opacity == null ? 1 : fill.opacity;
        if (fill.type === 'gradient') {
            return 'linear-gradient(' + (fill.angle == null ? 90 : fill.angle) + 'deg, ' + rgba(M.color(fill.color, pal) || pal.accent1, a) + ', ' + rgba(M.color(fill.color2, pal) || pal.accent2, a) + ')';
        }
        return rgba(M.color(fill.color, pal) || pal.accent1, a);
    }
    R.fillCss = fillCss;

    function dashArray(dash, w) {
        var u = Math.max(1, w);
        switch (dash) {
            case 'dash': return (u * 4) + ' ' + (u * 3);
            case 'dot': return u + ' ' + (u * 2);
            case 'dashDot': return (u * 4) + ' ' + (u * 2) + ' ' + u + ' ' + (u * 2);
            case 'longDash': return (u * 8) + ' ' + (u * 3);
        }
        return '';
    }
    R.dashArray = dashArray;

    /** Bayangan sebagai filter SVG supaya ikut terbawa saat ekspor gambar/PDF. */
    function svgShadow(svg, sh) {
        if (!sh) return;
        if (sh === true) sh = {};
        var id = 'sssh' + (++gradSeq);
        var d = sh.dist == null ? 4 : sh.dist, b = sh.blur == null ? 8 : sh.blur, ang = (sh.angle == null ? 45 : sh.angle) * Math.PI / 180;
        var defs = svgEl('defs');
        var f = svgEl('filter', { id: id, x: '-30%', y: '-30%', width: '170%', height: '170%' });
        f.appendChild(svgEl('feDropShadow', {
            dx: Math.round(Math.cos(ang) * d * 100) / 100, dy: Math.round(Math.sin(ang) * d * 100) / 100,
            stdDeviation: Math.max(0, b / 2), 'flood-color': sh.color || '#000000', 'flood-opacity': sh.opacity == null ? 0.35 : sh.opacity
        }));
        defs.appendChild(f);
        svg.insertBefore(defs, svg.firstChild);
        svg.style.overflow = 'visible';
        return 'url(#' + id + ')';
    }

    function shadowCss(sh) {
        if (!sh) return '';
        if (sh === true) sh = {};
        var d = sh.dist == null ? 4 : sh.dist, b = sh.blur == null ? 8 : sh.blur, ang = (sh.angle == null ? 45 : sh.angle) * Math.PI / 180;
        return 'drop-shadow(' + px(Math.cos(ang) * d) + ' ' + px(Math.sin(ang) * d) + ' ' + px(b) + ' ' + rgba(sh.color || '#000000', sh.opacity == null ? 0.35 : sh.opacity) + ')';
    }

    // ============================================================ latar
    R.backgroundCss = function (deck, slide) {
        var pal = R.pal(deck);
        var bg = slide && slide.bg;
        if (bg && bg.type === 'solid') return { background: M.color(bg.color, pal) || pal.bg };
        if (bg && bg.type === 'gradient') return { background: 'linear-gradient(' + (bg.angle == null ? 135 : bg.angle) + 'deg, ' + (M.color(bg.color, pal) || pal.bg) + ', ' + (M.color(bg.color2, pal) || pal.accent1) + ')' };
        if (bg && bg.type === 'image' && bg.image && R.assets) {
            var url = R.assets.url(bg.image);
            var fit = bg.fit || 'cover';
            return {
                background: (M.color(bg.color, pal) || pal.bg) + ' url("' + url + '") ' + (fit === 'tile' ? 'repeat left top / auto' : 'no-repeat center / ' + fit)
            };
        }
        if (pal.bg2) return { background: 'linear-gradient(135deg, ' + pal.bg + ', ' + pal.bg2 + ')' };
        return { background: pal.bg };
    };

    // ============================================================ elemen
    function textLayer(e, pal, opts) {
        var st = e.st || {};
        var ins = e.inset || { l: 9.6, t: 4.8, r: 9.6, b: 4.8 };
        var box = div('ss-text', {
            paddingLeft: px(ins.l), paddingRight: px(ins.r), paddingTop: px(ins.t), paddingBottom: px(ins.b),
            justifyContent: st.valign === 'middle' ? 'center' : st.valign === 'bottom' ? 'flex-end' : 'flex-start'
        });
        var tx = div('ss-tx', {
            fontFamily: SO.fontStack(M.font(st.ff, pal)), fontSize: (st.fs || 18) + 'pt', color: M.color(st.color, pal) || pal.text,
            fontWeight: st.b ? '700' : '', fontStyle: st.i ? 'italic' : '', textDecoration: [st.u ? 'underline' : '', st.s ? 'line-through' : ''].join(' ').trim(),
            textAlign: st.align || 'left', lineHeight: String(st.lh || 1.15), letterSpacing: st.ls ? st.ls + 'pt' : '',
            textTransform: st.caps ? 'uppercase' : ''
        });
        if (st.shadow) tx.style.textShadow = '1px 2px 4px rgba(0,0,0,.35)';
        if (st.hl) tx.style.backgroundColor = M.color(st.hl, pal);
        tx.innerHTML = e.html || '';
        if (e.autofit === 'shrink') box.dataset.fit = 'shrink';
        if (e.ph && opts.mode === 'edit' && M.isEmptyHtml(e.html)) {
            tx.classList.add('is-empty');
            tx.dataset.hint = SO.t(e.ph === 'title' ? 's_ph_title' : e.ph === 'subtitle' ? 's_ph_subtitle' : e.ph === 'heading' ? 's_ph_heading' : e.ph === 'caption' ? 's_ph_caption' : 's_ph_body');
        } else if (e.ph && opts.mode !== 'edit' && M.isEmptyHtml(e.html)) {
            tx.innerHTML = '';
        }
        box.appendChild(tx);
        return box;
    }

    function svgEl(tag, attrs) {
        var n = document.createElementNS(NS, tag);
        Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null && attrs[k] !== '') n.setAttribute(k, attrs[k]); });
        return n;
    }

    function shapeLayer(e, pal, shapeId) {
        var w = Math.max(1, e.w), h = Math.max(1, e.h);
        var svg = svgEl('svg', { class: 'ss-shape', width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'none' });
        var fill = e.fill || { type: 'none' };
        var fillAttr = 'none', fillOpacity = null;
        if (fill.type === 'solid') { fillAttr = M.color(fill.color, pal) || pal.accent1; fillOpacity = fill.opacity; }
        else if (fill.type === 'gradient') {
            var gid = 'ssg' + (++gradSeq);
            var defs = svgEl('defs');
            var ang = ((fill.angle == null ? 90 : fill.angle) - 90) * Math.PI / 180;
            var g = svgEl('linearGradient', { id: gid, x1: 0.5 - Math.cos(ang) / 2, y1: 0.5 - Math.sin(ang) / 2, x2: 0.5 + Math.cos(ang) / 2, y2: 0.5 + Math.sin(ang) / 2 });
            g.appendChild(svgEl('stop', { offset: '0', 'stop-color': M.color(fill.color, pal) || pal.accent1, 'stop-opacity': fill.opacity }));
            g.appendChild(svgEl('stop', { offset: '1', 'stop-color': M.color(fill.color2, pal) || pal.accent2, 'stop-opacity': fill.opacity }));
            defs.appendChild(g);
            svg.appendChild(defs);
            fillAttr = 'url(#' + gid + ')';
        }
        var line = e.line || { type: 'none' };
        var sw = line.type === 'none' ? 0 : (line.w || 1) * 96 / 72;
        var path = svgEl('path', {
            d: M.shapePath(shapeId, w, h, e.adj), fill: fillAttr, 'fill-opacity': fillOpacity, 'fill-rule': 'evenodd',
            stroke: sw ? M.color(line.color, pal) || pal.text : 'none', 'stroke-width': sw || null, 'stroke-dasharray': sw ? dashArray(line.dash, sw) || null : null,
            'stroke-linejoin': 'round'
        });
        if (e.flipH || e.flipV) path.setAttribute('transform', 'translate(' + (e.flipH ? w : 0) + ' ' + (e.flipV ? h : 0) + ') scale(' + (e.flipH ? -1 : 1) + ' ' + (e.flipV ? -1 : 1) + ')');
        svg.appendChild(path);
        var fx = svgShadow(svg, e.shadow);
        if (fx) path.setAttribute('filter', fx);
        return svg;
    }

    function markerPath(kind, x, y, angle, size) {
        var a = angle, s = size;
        var pt = function (dx, dy) { return (x + dx * Math.cos(a) - dy * Math.sin(a)) + ' ' + (y + dx * Math.sin(a) + dy * Math.cos(a)); };
        if (kind === 'arrow' || kind === 'triangle') return 'M' + pt(0, 0) + ' L' + pt(-s * 2.2, -s * 1.2) + ' L' + pt(-s * 2.2, s * 1.2) + ' Z';
        if (kind === 'open') return 'M' + pt(-s * 2.4, -s * 1.3) + ' L' + pt(0, 0) + ' L' + pt(-s * 2.4, s * 1.3);
        if (kind === 'oval') return 'M' + pt(-s, 0) + ' A' + s + ' ' + s + ' 0 1 0 ' + pt(s, 0) + ' A' + s + ' ' + s + ' 0 1 0 ' + pt(-s, 0) + ' Z';
        if (kind === 'diamond') return 'M' + pt(-s * 1.4, 0) + ' L' + pt(0, -s * 1.4) + ' L' + pt(s * 1.4, 0) + ' L' + pt(0, s * 1.4) + ' Z';
        return '';
    }

    function lineNode(e, pal) {
        var pad = 20;
        var x1 = e.x1 - e.x + pad, y1 = e.y1 - e.y + pad, x2 = e.x2 - e.x + pad, y2 = e.y2 - e.y + pad;
        var W = e.w + pad * 2, H = e.h + pad * 2;
        var svg = svgEl('svg', { class: 'ss-line-svg', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H });
        svg.style.left = px(-pad); svg.style.top = px(-pad);
        var ln = e.line || {};
        var sw = Math.max(0.5, (ln.w || 2) * 96 / 72);
        var color = M.color(ln.color, pal) || pal.text;
        var ang = Math.atan2(y2 - y1, x2 - x1);
        var ms = Math.max(3, sw * 1.6);
        // Garis dipendekkan agar ujung panah tidak tertutup garis tebal.
        var sx1 = x1, sy1 = y1, sx2 = x2, sy2 = y2;
        if (ln.tail && ln.tail !== 'none' && ln.tail !== 'open' && ln.tail !== 'oval') { sx2 -= Math.cos(ang) * ms * 1.8; sy2 -= Math.sin(ang) * ms * 1.8; }
        if (ln.head && ln.head !== 'none' && ln.head !== 'open' && ln.head !== 'oval') { sx1 += Math.cos(ang) * ms * 1.8; sy1 += Math.sin(ang) * ms * 1.8; }
        svg.appendChild(svgEl('path', { d: 'M' + sx1 + ' ' + sy1 + ' L' + sx2 + ' ' + sy2, stroke: color, 'stroke-width': sw, 'stroke-dasharray': dashArray(ln.dash, sw) || null, 'stroke-linecap': ln.dash && ln.dash !== 'solid' ? 'butt' : 'round', fill: 'none' }));
        [['tail', x2, y2, ang], ['head', x1, y1, ang + Math.PI]].forEach(function (m) {
            var kind = ln[m[0]];
            if (!kind || kind === 'none') return;
            svg.appendChild(svgEl('path', { d: markerPath(kind, m[1], m[2], m[3], ms), fill: kind === 'open' ? 'none' : color, stroke: color, 'stroke-width': kind === 'open' ? sw : 1, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        });
        var lfx = svgShadow(svg, e.shadow);
        if (lfx) SO.$$('path', svg).forEach(function (p) { p.setAttribute('filter', lfx); });
        return svg;
    }

    function imageNode(e, pal, opts) {
        var wrap = div('ss-img');
        if (!e.asset) {
            if (opts.mode === 'edit') {
                wrap.classList.add('is-placeholder');
                wrap.innerHTML = '<i class="fas fa-image"></i><span>' + SO.esc(SO.t('s_ph_picture')) + '</span>';
            }
            return wrap;
        }
        var url = R.assets ? R.assets.url(e.asset) : '';
        var img = document.createElement('img');
        img.alt = e.alt || '';
        img.draggable = false;
        img.src = url;
        var cr = e.crop || { l: 0, t: 0, r: 0, b: 0 };
        var cw = Math.max(0.05, 1 - cr.l - cr.r), ch = Math.max(0.05, 1 - cr.t - cr.b);
        Object.assign(img.style, { width: (100 / cw) + '%', height: (100 / ch) + '%', left: (-cr.l / cw * 100) + '%', top: (-cr.t / ch * 100) + '%' });
        var filters = [];
        var fx = e.fx || {};
        if (fx.bright) filters.push('brightness(' + (1 + fx.bright / 100) + ')');
        if (fx.contrast) filters.push('contrast(' + (1 + fx.contrast / 100) + ')');
        if (fx.sat != null && fx.sat !== 100) filters.push('saturate(' + fx.sat / 100 + ')');
        if (fx.gray) filters.push('grayscale(1)');
        if (fx.sepia) filters.push('sepia(.8)');
        if (fx.blur) filters.push('blur(' + fx.blur + 'px)');
        if (filters.length) img.style.filter = filters.join(' ');
        if (e.flipH || e.flipV) img.style.transform = 'scale(' + (e.flipH ? -1 : 1) + ',' + (e.flipV ? -1 : 1) + ')';
        wrap.appendChild(img);
        if (e.mask && e.mask !== 'rect') wrap.style.clipPath = 'path("' + M.shapePath(e.mask, e.w, e.h, e.adj) + '")';
        if (e.line && e.line.type !== 'none') {
            var svg = svgEl('svg', { class: 'ss-shape ss-img-border', width: e.w, height: e.h, viewBox: '0 0 ' + e.w + ' ' + e.h, preserveAspectRatio: 'none' });
            var sw = (e.line.w || 1) * 96 / 72;
            svg.appendChild(svgEl('path', { d: M.shapePath(e.mask && e.mask !== 'rect' ? e.mask : 'rect', e.w, e.h, e.adj), fill: 'none', stroke: M.color(e.line.color, pal) || pal.text, 'stroke-width': sw * 2, 'stroke-dasharray': dashArray(e.line.dash, sw) || null }));
            svg.style.clipPath = wrap.style.clipPath;
            return [wrap, svg];
        }
        return wrap;
    }

    function tableNode(e, pal, opts) {
        var ts = e.tstyle || {};
        var st = e.st || {};
        var main = M.color(ts.color, pal) || pal.accent1;
        var border = M.color(ts.border, pal) || main;
        var table = document.createElement('table');
        table.className = 'ss-table';
        Object.assign(table.style, {
            fontFamily: SO.fontStack(M.font(st.ff, pal)), fontSize: (st.fs || 16) + 'pt', color: M.color(st.color, pal) || pal.text
        });
        var cg = document.createElement('colgroup');
        (e.colW || []).forEach(function (w) { var c = document.createElement('col'); c.style.width = (w * 100) + '%'; cg.appendChild(c); });
        table.appendChild(cg);
        var rows = e.cells.length;
        var light = M.isDark(pal.bg) ? SO.tint(main, -0.55) : SO.tint(main, 0.82);
        var lighter = M.isDark(pal.bg) ? SO.tint(main, -0.7) : SO.tint(main, 0.92);
        e.cells.forEach(function (row, r) {
            var tr = document.createElement('tr');
            tr.style.height = ((e.rowH && e.rowH[r]) ? e.rowH[r] * 100 : 100 / rows) + '%';
            row.forEach(function (cell, c) {
                if (cell.hide) return;
                var td = document.createElement('td');
                if (cell.cs > 1) td.colSpan = cell.cs;
                if (cell.rs > 1) td.rowSpan = cell.rs;
                var isHead = (ts.header && r === 0) || (ts.firstCol && c === 0);
                var bg = cell.fill ? M.color(cell.fill, pal) : isHead ? main : ts.banded ? (r % 2 ? lighter : light) : 'transparent';
                td.style.background = bg;
                td.style.borderColor = border;
                td.style.borderWidth = ts.borders === 'none' ? '0' : '1px';
                if (isHead) { td.style.color = M.isDark(bg) ? '#FFFFFF' : pal.text; td.style.fontWeight = '700'; }
                if (cell.color) td.style.color = M.color(cell.color, pal);
                td.style.textAlign = cell.align || st.align || 'left';
                td.style.verticalAlign = cell.valign || 'middle';
                var inner = div('ss-cell');
                inner.dataset.r = r;
                inner.dataset.c = c;
                inner.innerHTML = cell.html || '';
                td.appendChild(inner);
                tr.appendChild(td);
            });
            table.appendChild(tr);
        });
        return table;
    }

    // ============================================================ grafik
    var chartCache = {};
    var chartQueue = {};
    function chartKey(e, pal) { return JSON.stringify([e.chart, e.data, e.title, e.legend, e.labels, e.w, e.h, e.colors, pal.accent1, pal.accent2, pal.accent3, pal.accent4, pal.accent5, pal.accent6, pal.text, pal.fontB]); }
    R.chartColors = function (e, pal) {
        return e.colors && e.colors.length ? e.colors.map(function (c) { return M.color(c, pal); }) : [pal.accent1, pal.accent2, pal.accent3, pal.accent4, pal.accent5, pal.accent6];
    };
    function drawChart(e, pal, key) {
        if (chartQueue[key]) return chartQueue[key];
        chartQueue[key] = SO.load('chart').then(function (Chart) {
            var canvas = document.createElement('canvas');
            var W = Math.max(60, Math.round(e.w)), H = Math.max(40, Math.round(e.h));
            canvas.width = W * 2; canvas.height = H * 2;
            canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
            var host = div('', { position: 'fixed', left: '-10000px', top: '0', width: W + 'px', height: H + 'px' });
            host.appendChild(canvas);
            document.body.appendChild(host);
            var colors = R.chartColors(e, pal);
            var kind = e.chart;
            var pie = kind === 'pie' || kind === 'doughnut';
            var type = kind === 'column' || kind === 'bar' || kind === 'stacked' || kind === 'stackedBar' ? 'bar' : kind === 'area' ? 'line' : kind === 'scatter' ? 'scatter' : kind === 'radar' ? 'radar' : pie ? kind : 'line';
            var series = (e.data && e.data.series) || [];
            var datasets = (pie ? series.slice(0, 1) : series).map(function (s, i) {
                var col = colors[i % colors.length];
                var ds = { label: s.name, data: (s.values || []).map(function (v) { return v === '' || v == null ? null : +v; }), borderColor: pie ? pal.bg : col, backgroundColor: pie ? (e.data.labels || []).map(function (_, j) { return colors[j % colors.length]; }) : (kind === 'area' ? rgba(col, 0.35) : col), borderWidth: pie ? 2 : kind === 'line' || kind === 'area' || kind === 'radar' ? 3 : 0, fill: kind === 'area', tension: 0.25, pointRadius: kind === 'line' || kind === 'radar' ? 3 : 0 };
                if (kind === 'scatter') ds.data = (s.values || []).map(function (v, j) { return { x: +(e.data.labels[j]) || j + 1, y: +v }; });
                return ds;
            });
            var font = { family: M.font('theme:body', pal), size: Math.max(10, Math.min(18, W / 42)) };
            var tickColor = M.isDark(pal.bg) ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.65)';
            var gridColor = M.isDark(pal.bg) ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.08)';
            var cfg = {
                type: type,
                data: { labels: kind === 'scatter' ? undefined : (e.data.labels || []), datasets: datasets },
                options: {
                    responsive: false, animation: false, devicePixelRatio: 2, maintainAspectRatio: false,
                    indexAxis: kind === 'bar' || kind === 'stackedBar' ? 'y' : 'x',
                    layout: { padding: 8 },
                    plugins: {
                        legend: { display: e.legend !== 'none', position: e.legend && e.legend !== 'none' ? e.legend : 'bottom', labels: { color: tickColor, font: font, boxWidth: 14 } },
                        title: { display: !!e.title, text: e.title || '', color: M.color('theme:text', pal), font: { family: font.family, size: font.size * 1.35, weight: '600' } },
                        tooltip: { enabled: false }
                    }
                }
            };
            if (!pie && kind !== 'radar') {
                cfg.options.scales = {
                    x: { stacked: kind === 'stacked' || kind === 'stackedBar', ticks: { color: tickColor, font: font }, grid: { color: gridColor, display: kind === 'bar' || kind === 'stackedBar' || kind === 'scatter' } },
                    y: { stacked: kind === 'stacked' || kind === 'stackedBar', ticks: { color: tickColor, font: font }, grid: { color: gridColor, display: !(kind === 'bar' || kind === 'stackedBar') }, beginAtZero: kind !== 'scatter' }
                };
            }
            if (kind === 'radar') cfg.options.scales = { r: { angleLines: { color: gridColor }, grid: { color: gridColor }, pointLabels: { color: tickColor, font: font }, ticks: { display: false } } };
            if (e.labels && global.Chart) {
                cfg.plugins = [{
                    id: 'ssLabels',
                    afterDatasetsDraw: function (chart) {
                        var ctx = chart.ctx;
                        ctx.save();
                        ctx.fillStyle = pie ? '#FFFFFF' : tickColor;
                        ctx.font = '600 ' + font.size + 'px ' + font.family;
                        ctx.textAlign = 'center';
                        chart.data.datasets.forEach(function (ds, i) {
                            chart.getDatasetMeta(i).data.forEach(function (bar, j) {
                                var v = ds.data[j];
                                if (v == null) return;
                                var p = bar.tooltipPosition();
                                ctx.fillText(typeof v === 'object' ? v.y : (+v).toLocaleString(SO.locale()), p.x, pie ? p.y : p.y - 6);
                            });
                        });
                        ctx.restore();
                    }
                }];
            }
            var chart;
            try { chart = new Chart(canvas, cfg); } catch (err) { host.remove(); throw err; }
            var url = canvas.toDataURL('image/png');
            chart.destroy();
            host.remove();
            chartCache[key] = url;
            SO.$$('img[data-chart-key]').forEach(function (img) { if (img.dataset.chartKey === key) { img.src = url; img.hidden = false; if (img.nextSibling) img.nextSibling.remove(); } });
            if (R.onAsyncRender) R.onAsyncRender();
            return url;
        }).catch(function (err) { console.warn('[Sinerli Present] grafik', err); delete chartQueue[key]; });
        return chartQueue[key];
    }
    R.chartImage = function (e, pal) {
        var key = chartKey(e, pal);
        if (chartCache[key]) return Promise.resolve(chartCache[key]);
        return drawChart(e, pal, key);
    };
    function chartNode(e, pal) {
        var wrap = div('ss-chart');
        var key = chartKey(e, pal);
        var img = document.createElement('img');
        img.draggable = false;
        img.dataset.chartKey = key;
        wrap.appendChild(img);
        if (chartCache[key]) img.src = chartCache[key];
        else {
            img.hidden = true;
            var ph = div('ss-chart-wait');
            ph.innerHTML = '<i class="fas fa-chart-column"></i>';
            wrap.appendChild(ph);
            drawChart(e, pal, key);
        }
        return wrap;
    }

    // ============================================================ lainnya
    function youtubeId(url) {
        var m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url || '');
        return m ? m[1] : null;
    }
    R.youtubeId = youtubeId;
    function videoNode(e, pal, opts) {
        var wrap = div('ss-video');
        var yt = youtubeId(e.url);
        if (opts.mode === 'show') {
            if (yt) {
                var fr = document.createElement('iframe');
                fr.src = 'https://www.youtube-nocookie.com/embed/' + yt + '?rel=0';
                fr.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture';
                fr.allowFullscreen = true;
                fr.setAttribute('frameborder', '0');
                wrap.appendChild(fr);
            } else if (/^https?:\/\/[^\s]+\.(mp4|webm|ogg)(\?|$)/i.test(e.url || '')) {
                var v = document.createElement('video');
                v.src = e.url; v.controls = true; v.preload = 'metadata';
                wrap.appendChild(v);
            } else if (/^https?:\/\//i.test(e.url || '')) {
                var fr2 = document.createElement('iframe');
                fr2.src = e.url;
                fr2.setAttribute('frameborder', '0');
                fr2.allowFullscreen = true;
                wrap.appendChild(fr2);
            }
            return wrap;
        }
        if (yt) wrap.style.backgroundImage = 'url("https://i.ytimg.com/vi/' + yt + '/hqdefault.jpg")';
        wrap.innerHTML = '<span class="ss-video-play"><i class="fas fa-play"></i></span>';
        return wrap;
    }

    function mathNode(e, pal) {
        var wrap = div('ss-math', { fontSize: ((e.st && e.st.fs) || 28) + 'pt', color: M.color(e.st && e.st.color, pal) || pal.text });
        var inner = div('ss-math-in');
        wrap.appendChild(inner);
        if (global.katex) {
            try { global.katex.render(e.latex || '', inner, { throwOnError: false, displayMode: true }); } catch (err) { inner.textContent = e.latex; }
        } else {
            inner.textContent = e.latex || '';
            inner.dataset.latex = e.latex || '';
            SO.load('katex').then(function (katex) {
                SO.$$('.ss-math-in[data-latex]').forEach(function (n) {
                    try { katex.render(n.dataset.latex, n, { throwOnError: false, displayMode: true }); } catch (err) {}
                    n.removeAttribute('data-latex');
                });
                if (R.onAsyncRender) R.onAsyncRender();
            }).catch(function () {});
        }
        return wrap;
    }

    function iconNode(e, pal) {
        var wrap = div('ss-icon', { fontSize: px(Math.min(e.w, e.h) * 0.86), color: M.color(e.color, pal) || pal.accent1 });
        wrap.innerHTML = '<i class="fas ' + SO.esc(e.icon || 'fa-star') + '"></i>';
        if (e.shadow) wrap.style.filter = shadowCss(e.shadow);
        if (e.flipH || e.flipV) wrap.firstChild.style.transform = 'scale(' + (e.flipH ? -1 : 1) + ',' + (e.flipV ? -1 : 1) + ')';
        return wrap;
    }

    /** Membangun node satu elemen (posisi absolut dalam koordinat slide). */
    R.elementNode = function (e, pal, opts) {
        opts = opts || {};
        if (e.hidden) return null;
        var node = div('ss-el ss-t-' + e.type, { left: px(e.x), top: px(e.y), width: px(Math.max(1, e.w)), height: px(Math.max(1, e.h)) });
        node.dataset.id = e.id;
        if (e.rot) node.style.transform = 'rotate(' + e.rot + 'deg)';
        if (e.opacity != null && e.opacity < 1) node.style.opacity = e.opacity;
        if (e.link && opts.mode === 'show') node.dataset.link = e.link;
        switch (e.type) {
            case 'text':
                if ((e.fill && e.fill.type !== 'none') || (e.line && e.line.type !== 'none') || e.shadow) node.appendChild(shapeLayer(e, pal, e.shape || 'rect'));
                node.appendChild(textLayer(e, pal, opts));
                break;
            case 'shape':
                node.appendChild(shapeLayer(e, pal, e.shape));
                node.appendChild(textLayer(e, pal, opts));
                break;
            case 'line':
                node.appendChild(lineNode(e, pal));
                break;
            case 'image':
                var im = imageNode(e, pal, opts);
                if (Array.isArray(im)) im.forEach(function (n) { node.appendChild(n); }); else node.appendChild(im);
                if (e.shadow) node.style.filter = shadowCss(e.shadow);
                break;
            case 'table': node.appendChild(tableNode(e, pal, opts)); break;
            case 'chart': node.appendChild(chartNode(e, pal)); break;
            case 'icon': node.appendChild(iconNode(e, pal)); break;
            case 'video': node.appendChild(videoNode(e, pal, opts)); break;
            case 'math': node.appendChild(mathNode(e, pal)); break;
            case 'group':
                var sx = e.gw ? e.w / e.gw : 1, sy = e.gh ? e.h / e.gh : 1;
                (e.children || []).forEach(function (c) {
                    var cc = M.clone(c);
                    if (cc.type === 'line') {
                        cc.x1 *= sx; cc.x2 *= sx; cc.y1 *= sy; cc.y2 *= sy;
                        M.syncLineBox(cc);
                    } else { cc.x *= sx; cc.y *= sy; cc.w *= sx; cc.h *= sy; }
                    var cn = R.elementNode(cc, pal, opts);
                    if (cn) { cn.classList.add('is-child'); node.appendChild(cn); }
                });
                break;
        }
        return node;
    };

    function footerNodes(deck, slide, index, pal) {
        var ft = deck.footer || {};
        if (!ft.show && !ft.num && !ft.date && !ft.text) return [];
        if (ft.skipTitle && slide.layout === 'title') return [];
        var W = deck.size.w, H = deck.size.h;
        var out = [];
        var style = { fontFamily: SO.fontStack(pal.fontB), fontSize: Math.max(9, Math.round(12 * W / 1280)) + 'pt', color: pal.muted };
        var mk = function (cls, x, w, align, text) {
            var n = div('ss-footer ' + cls, Object.assign({ left: px(x), top: px(H * 0.925), width: px(w), height: px(H * 0.055), textAlign: align }, style));
            n.textContent = text;
            out.push(n);
        };
        if (ft.date) mk('is-date', W * 0.06, W * 0.25, 'left', ft.dateText || new Intl.DateTimeFormat(SO.locale(), { dateStyle: 'medium' }).format(new Date()));
        if (ft.text) mk('is-text', W * 0.33, W * 0.34, 'center', ft.text);
        if (ft.num) mk('is-num', W * 0.69, W * 0.25, 'right', String(index + 1));
        return out;
    }

    /** Slide lengkap (belum dipasang). opts: {mode:'edit'|'thumb'|'show'|'export', index} */
    R.renderSlide = function (deck, slide, opts) {
        opts = opts || {};
        var pal = R.pal(deck);
        var W = deck.size.w, H = deck.size.h;
        var root = div('ss-slide', { width: W + 'px', height: H + 'px' });
        Object.assign(root.style, R.backgroundCss(deck, slide));
        root.dataset.slide = slide.id;
        if (slide.bg && slide.bg.type === 'image' && slide.bg.opacity != null && slide.bg.opacity < 1) {
            root.style.background = M.color(slide.bg.color, pal) || pal.bg;
            var bgi = div('ss-bg-img', R.backgroundCss(deck, slide));
            bgi.style.opacity = slide.bg.opacity;
            root.appendChild(bgi);
        }
        var decor = pal.decor && M.DECOR[pal.decor] && !slide.hideDecor && slide.layout !== 'blank' ? M.DECOR[pal.decor](W, H, pal, M.layoutKind(slide.layout)) : '';
        if (decor) {
            var d = div('ss-decor');
            d.innerHTML = '<svg xmlns="' + NS + '" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' + decor + '</svg>';
            root.appendChild(d);
        }
        slide.els.forEach(function (e) {
            var n = R.elementNode(e, pal, opts);
            if (n) root.appendChild(n);
        });
        footerNodes(deck, slide, opts.index || 0, pal).forEach(function (n) { root.appendChild(n); });
        return root;
    };

    /** Menyusutkan teks yang meluap pada placeholder (autofit). */
    // Semua kotak diukur bersama: tulis semua → baca semua → tulis semua per
    // iterasi. Dulu tiap kotak menulis gaya lalu langsung membaca tingginya, jadi
    // setiap kotak memaksa reflow seluruh panel; undo di dek 150 slide (≈300
    // kotak teks di thumbnail) membekukan halaman hampir 4 detik.
    R.fitText = function (root) {
        var items = [];
        SO.$$('.ss-text[data-fit="shrink"]', root).forEach(function (box) {
            var tx = box.firstChild;
            if (!tx || tx.isContentEditable) return;
            tx.style.transform = '';
            tx.style.width = '';
            items.push({ box: box, tx: tx, scale: 1 });
        });
        items = items.filter(function (it) {
            var box = it.box;
            it.avail = box.clientHeight - parseFloat(box.style.paddingTop || 0) - parseFloat(box.style.paddingBottom || 0);
            return it.avail > 0;
        });
        for (var i = 0; i < 4 && items.length; i++) {
            items = items.filter(function (it) { it.h = it.tx.scrollHeight; return it.h * it.scale > it.avail + 1; });
            items.forEach(function (it) {
                var box = it.box, tx = it.tx;
                it.scale = Math.max(0.35, it.scale * it.avail / (it.h * it.scale));
                tx.style.transformOrigin = box.style.justifyContent === 'center' ? 'left center' : box.style.justifyContent === 'flex-end' ? 'left bottom' : 'left top';
                tx.style.transform = 'scale(' + it.scale + ')';
                tx.style.width = (100 / it.scale) + '%';
            });
        }
    };

    /** Memasang slide ke kontainer dengan skala tertentu. */
    R.mount = function (container, deck, slide, opts) {
        opts = opts || {};
        container.innerHTML = '';
        var node = R.renderSlide(deck, slide, opts);
        if (opts.scale != null && opts.scale !== 1) {
            node.style.transform = 'scale(' + opts.scale + ')';
            node.style.transformOrigin = '0 0';
        }
        container.appendChild(node);
        R.fitText(node);
        return node;
    };

    /** Thumbnail: kotak berukuran width px berisi slide yang diskalakan. */
    R.thumb = function (deck, slide, index, width) {
        var scale = width / deck.size.w;
        var box = div('ss-thumb-canvas', { width: px(width), height: px(deck.size.h * scale) });
        var node = R.renderSlide(deck, slide, { mode: 'thumb', index: index });
        node.style.transform = 'scale(' + scale + ')';
        node.style.transformOrigin = '0 0';
        box.appendChild(node);
        return box;
    };
})(window);
