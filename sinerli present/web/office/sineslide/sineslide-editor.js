/**
 * Sinerli Present — interaksi kanvas: seleksi, marquee, pindah/ubah ukuran/putar
 * dengan panduan cerdas, ujung garis, mode gambar, edit teks & sel tabel,
 * keyboard, papan klip sistem, seret-lepas berkas, dan menu konteks.
 */
(function (global) {
    'use strict';

    var App = global.SineSlide, M = global.SSM, R = global.SSR;
    var C = App.cmd;
    var el = App.el;

    App.nodeFor = function (id) { return el.host.querySelector('.ss-el[data-id="' + id + '"]:not(.is-child)'); };

    function isTextual(e) { return e && (e.type === 'text' || e.type === 'shape'); }
    C.isTextual = isTextual;

    // ============================================================ overlay
    var HANDLES = [['nw', -1, -1], ['n', 0, -1], ['ne', 1, -1], ['e', 1, 0], ['se', 1, 1], ['s', 0, 1], ['sw', -1, 1], ['w', -1, 0]];

    function frameFor(e, z, cls) {
        var f = SO.el('div', { class: 'ss-frame ' + (cls || '') });
        Object.assign(f.style, { left: e.x * z + 'px', top: e.y * z + 'px', width: Math.max(1, e.w * z) + 'px', height: Math.max(1, e.h * z) + 'px', transform: e.rot ? 'rotate(' + e.rot + 'deg)' : '' });
        return f;
    }

    App.drawOverlay = function () {
        var ov = el.overlay;
        if (!App.deck) return;
        var z = App.zoom;
        ov.innerHTML = '';
        Object.assign(ov.style, { width: App.deck.size.w * z + 'px', height: App.deck.size.h * z + 'px' });
        ov.classList.toggle('show-grid', !!App.showGrid);
        if (App.showGrid) ov.style.backgroundSize = (App.gridSize || 40) * z + 'px ' + (App.gridSize || 40) * z + 'px';
        if (App.showGuides) {
            ov.appendChild(SO.el('div', { class: 'ss-static-guide is-v', style: { left: App.deck.size.w * z / 2 + 'px' } }));
            ov.appendChild(SO.el('div', { class: 'ss-static-guide is-h', style: { top: App.deck.size.h * z / 2 + 'px' } }));
        }
        var sel = App.selected();
        if (!sel.length) return;
        var editing = App.editing;
        if (sel.length === 1) {
            var e = sel[0];
            if (e.type === 'line') {
                var lf = SO.el('div', { class: 'ss-line-frame' });
                ov.appendChild(lf);
                if (!e.locked) {
                    [['p1', e.x1, e.y1], ['p2', e.x2, e.y2]].forEach(function (p) {
                        ov.appendChild(SO.el('div', { class: 'ss-handle is-point', dataset: { handle: p[0] }, style: { left: p[1] * z + 'px', top: p[2] * z + 'px' } }));
                    });
                }
                return;
            }
            var f = frameFor(e, z, editing ? 'is-editing' : '');
            if (e.locked) f.classList.add('is-locked');
            if (!e.locked) {
                var canRotate = e.type !== 'table' && e.type !== 'video';
                HANDLES.forEach(function (h) { f.appendChild(SO.el('div', { class: 'ss-handle is-' + h[0], dataset: { handle: h[0] } })); });
                if (canRotate) {
                    f.appendChild(SO.el('div', { class: 'ss-rot-stem' }));
                    f.appendChild(SO.el('div', { class: 'ss-handle is-rot', dataset: { handle: 'rot' }, 'data-tip': 's_rotate', html: '<i class="fas fa-rotate-right"></i>' }));
                }
                if (editing) ['t', 'r', 'b', 'l'].forEach(function (side) { f.appendChild(SO.el('div', { class: 'ss-move-edge is-' + side, dataset: { handle: 'move' } })); });
                if (e.type === 'shape' && (e.shape === 'roundRect') && !editing) {
                    var adj = e.adj == null ? 0.1667 : e.adj;
                    f.appendChild(SO.el('div', { class: 'ss-handle is-adj', dataset: { handle: 'adj' }, style: { left: Math.min(e.w, e.h) * adj * z + 'px' }, 'data-tip': 's_adjust' }));
                }
            }
            ov.appendChild(f);
            return;
        }
        sel.forEach(function (e) {
            if (e.type === 'line') {
                var b = { x: e.x, y: e.y, w: e.w, h: e.h };
                ov.appendChild(frameFor(b, z, 'is-multi'));
            } else ov.appendChild(frameFor(e, z, 'is-multi'));
        });
        if (sel.some(function (e) { return e.locked; })) return;
        var bb = M.bbox(sel);
        var gf = frameFor(bb, z, 'is-group');
        HANDLES.forEach(function (h) { gf.appendChild(SO.el('div', { class: 'ss-handle is-' + h[0], dataset: { handle: h[0] } })); });
        ov.appendChild(gf);
    };

    function drawGuides(guides) {
        SO.$$('.ss-guide', el.overlay).forEach(function (g) { g.remove(); });
        var z = App.zoom;
        (guides || []).forEach(function (g) {
            var d = SO.el('div', { class: 'ss-guide ' + (g.axis === 'x' ? 'is-v' : 'is-h') });
            if (g.axis === 'x') Object.assign(d.style, { left: g.pos * z + 'px', top: g.from * z + 'px', height: Math.max(1, (g.to - g.from) * z) + 'px' });
            else Object.assign(d.style, { top: g.pos * z + 'px', left: g.from * z + 'px', width: Math.max(1, (g.to - g.from) * z) + 'px' });
            el.overlay.appendChild(d);
        });
    }

    // ============================================================ snap
    /** Menjepret kotak b (x,y,w,h) ke tepi/tengah slide & elemen lain. */
    function snapBox(b, ignoreIds, axes) {
        if (App.snapOff) return { dx: 0, dy: 0, guides: [] };
        var W = App.deck.size.w, H = App.deck.size.h;
        var th = 6 / App.zoom;
        var xs = [{ v: 0, f: 0, t: H }, { v: W / 2, f: 0, t: H }, { v: W, f: 0, t: H }];
        var ys = [{ v: 0, f: 0, t: W }, { v: H / 2, f: 0, t: W }, { v: H, f: 0, t: W }];
        App.slide().els.forEach(function (e) {
            if (ignoreIds.indexOf(e.id) !== -1 || e.hidden) return;
            var r = M.rotatedBox(e);
            [r.x, r.x + r.w / 2, r.x + r.w].forEach(function (v) { xs.push({ v: v, f: Math.min(r.y, b.y), t: Math.max(r.y + r.h, b.y + b.h) }); });
            [r.y, r.y + r.h / 2, r.y + r.h].forEach(function (v) { ys.push({ v: v, f: Math.min(r.x, b.x), t: Math.max(r.x + r.w, b.x + b.w) }); });
        });
        if (App.showGrid && App.snapGrid !== false) {
            var gs = App.gridSize || 40;
            xs.push({ v: Math.round(b.x / gs) * gs, f: 0, t: H, grid: true });
            ys.push({ v: Math.round(b.y / gs) * gs, f: 0, t: W, grid: true });
        }
        var best = function (points, cands) {
            var out = null;
            points.forEach(function (p) {
                cands.forEach(function (c) {
                    var d = c.v - p;
                    if (Math.abs(d) <= th && (!out || Math.abs(d) < Math.abs(out.d))) out = { d: d, pos: c.v, from: c.f, to: c.t, grid: c.grid };
                });
            });
            return out;
        };
        var res = { dx: 0, dy: 0, guides: [] };
        var bx = axes.x ? best([b.x, b.x + b.w / 2, b.x + b.w], xs) : null;
        var by = axes.y ? best([b.y, b.y + b.h / 2, b.y + b.h], ys) : null;
        if (bx) { res.dx = bx.d; if (!bx.grid) res.guides.push({ axis: 'x', pos: bx.pos, from: bx.from, to: bx.to }); }
        if (by) { res.dy = by.d; if (!by.grid) res.guides.push({ axis: 'y', pos: by.pos, from: by.from, to: by.to }); }
        return res;
    }

    // ============================================================ drag
    var drag = null;

    function startMove(ev, ids) {
        var s = App.slide();
        var items = ids.map(function (id) { return M.findEl(s, id); }).filter(function (e) { return e && !e.locked; });
        if (!items.length) return;
        drag = {
            kind: 'move', startX: ev.clientX, startY: ev.clientY, moved: false, alt: ev.altKey,
            items: items.map(function (e) { return { e: e, x: e.x, y: e.y, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, node: App.nodeFor(e.id) }; }),
            box: M.bbox(items)
        };
    }

    function applyMove(ev) {
        var z = App.zoom;
        var dx = (ev.clientX - drag.startX) / z, dy = (ev.clientY - drag.startY) / z;
        if (!drag.moved && Math.hypot(dx * z, dy * z) < 4) return;
        if (!drag.moved) { drag.moved = true; document.body.classList.add('ss-dragging'); }
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        var b = { x: drag.box.x + dx, y: drag.box.y + dy, w: drag.box.w, h: drag.box.h };
        var sn = ev.ctrlKey || ev.metaKey ? { dx: 0, dy: 0, guides: [] } : snapBox(b, drag.items.map(function (it) { return it.e.id; }), { x: !ev.shiftKey || dx !== 0, y: !ev.shiftKey || dy !== 0 });
        dx += sn.dx; dy += sn.dy;
        drag.dx = dx; drag.dy = dy;
        drag.items.forEach(function (it) {
            if (!it.node) return;
            it.node.style.left = (it.x + dx) + 'px';
            it.node.style.top = (it.y + dy) + 'px';
        });
        SO.$$('.ss-frame, .ss-handle.is-point', el.overlay).forEach(function (f) { f.style.visibility = 'hidden'; });
        drawGuides(sn.guides);
    }

    function commitMove(ev) {
        document.body.classList.remove('ss-dragging');
        drawGuides([]);
        if (!drag.moved) return false;
        var dx = Math.round(drag.dx || 0), dy = Math.round(drag.dy || 0);
        var dup = ev.ctrlKey || ev.metaKey;
        App.change(dup ? 'duplicate' : 'move', function () {
            var s = App.slide();
            if (dup) {
                // Ctrl+seret = gandakan (seperti PowerPoint).
                var ids = [];
                drag.items.forEach(function (it) {
                    var c = M.cloneEl(it.e);
                    shiftEl(c, dx, dy);
                    s.els.push(c);
                    ids.push(c.id);
                });
                App.sel = ids;
                return;
            }
            drag.items.forEach(function (it) { shiftEl(it.e, dx, dy); });
        });
        return true;
    }

    function shiftEl(e, dx, dy) {
        if (e.type === 'line') { e.x1 += dx; e.x2 += dx; e.y1 += dy; e.y2 += dy; M.syncLineBox(e); }
        else { e.x = Math.round(e.x + dx); e.y = Math.round(e.y + dy); }
    }
    C.shiftEl = shiftEl;

    function startResize(ev, handle) {
        var sel = App.selected().filter(function (e) { return !e.locked; });
        if (!sel.length) return;
        var h = HANDLES.filter(function (x) { return x[0] === handle; })[0];
        drag = { kind: sel.length > 1 ? 'resizeMulti' : 'resize', handle: h, startX: ev.clientX, startY: ev.clientY, moved: false };
        if (sel.length > 1) {
            drag.box = M.bbox(sel);
            drag.items = sel.map(function (e) { return { e: e, o: M.clone(e) }; });
        } else {
            drag.e = sel[0];
            drag.o = M.clone(sel[0]);
        }
    }

    function replaceNode(e) {
        var node = App.nodeFor(e.id);
        var n = R.elementNode(e, App.pal(), { mode: 'edit' });
        if (node && n) { node.replaceWith(n); R.fitText(n); }
        return n;
    }

    function applyResize(ev) {
        var z = App.zoom;
        var dx = (ev.clientX - drag.startX) / z, dy = (ev.clientY - drag.startY) / z;
        if (!drag.moved && Math.hypot(dx * z, dy * z) < 2) return;
        drag.moved = true;
        var hx = drag.handle[1], hy = drag.handle[2];
        if (drag.kind === 'resizeMulti') {
            var b = drag.box;
            var nw = Math.max(10, b.w + hx * dx), nh = Math.max(10, b.h + hy * dy);
            if (hx && hy && !ev.shiftKey) { var k = Math.max(nw / b.w, nh / b.h); nw = b.w * k; nh = b.h * k; }
            var nx = hx < 0 ? b.x + b.w - nw : b.x, ny = hy < 0 ? b.y + b.h - nh : b.y;
            var sx = nw / b.w, sy = nh / b.h;
            drag.items.forEach(function (it) {
                var e = it.e, o = it.o;
                if (e.type === 'line') {
                    e.x1 = nx + (o.x1 - b.x) * sx; e.x2 = nx + (o.x2 - b.x) * sx; e.y1 = ny + (o.y1 - b.y) * sy; e.y2 = ny + (o.y2 - b.y) * sy;
                    M.syncLineBox(e);
                } else {
                    e.x = nx + (o.x - b.x) * sx; e.y = ny + (o.y - b.y) * sy; e.w = Math.max(4, o.w * sx); e.h = Math.max(4, o.h * sy);
                }
                replaceNode(e);
            });
            App.drawOverlay();
            return;
        }
        var e = drag.e, o = drag.o;
        var rad = (o.rot || 0) * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
        var ldx = dx * cos + dy * sin, ldy = -dx * sin + dy * cos;
        var w = Math.max(8, o.w + hx * ldx), h = Math.max(8, o.h + hy * ldy);
        var keep = (e.type === 'image' || e.type === 'icon' || e.type === 'video' || e.type === 'math' || e.lockRatio) ? !ev.shiftKey : ev.shiftKey;
        if (keep && hx && hy) {
            var ratio = o.w / o.h;
            if (Math.abs(ldx) / o.w > Math.abs(ldy) / o.h) h = w / ratio; else w = h * ratio;
        }
        if (ev.altKey) {
            // Alt = ubah ukuran dari pusat.
            var cx0 = o.x + o.w / 2, cy0 = o.y + o.h / 2;
            if (hx) w = Math.max(8, o.w + 2 * hx * ldx);
            if (hy) h = Math.max(8, o.h + 2 * hy * ldy);
            e.x = cx0 - w / 2; e.y = cy0 - h / 2;
        } else {
            var lcx = hx * (w - o.w) / 2, lcy = hy * (h - o.h) / 2;
            var cx = o.x + o.w / 2 + lcx * cos - lcy * sin, cy = o.y + o.h / 2 + lcx * sin + lcy * cos;
            e.x = cx - w / 2; e.y = cy - h / 2;
        }
        e.w = w; e.h = h;
        if (!o.rot && !ev.ctrlKey) {
            var box = { x: e.x, y: e.y, w: e.w, h: e.h };
            var sn = snapBox(box, [e.id], { x: hx !== 0, y: hy !== 0 });
            if (hx > 0) e.w += sn.dx; else if (hx < 0) { e.x += sn.dx; e.w -= sn.dx; }
            if (hy > 0) e.h += sn.dy; else if (hy < 0) { e.y += sn.dy; e.h -= sn.dy; }
            drawGuides(sn.guides);
        }
        replaceNode(e);
        App.drawOverlay();
    }

    function commitResize() {
        drawGuides([]);
        if (!drag.moved) return;
        var finals = drag.kind === 'resizeMulti' ? drag.items.map(function (it) { return { e: it.e, v: M.clone(it.e), o: it.o }; }) : [{ e: drag.e, v: M.clone(drag.e), o: drag.o }];
        // Kembalikan ke nilai awal lalu terapkan lewat App.change agar tercatat di riwayat.
        finals.forEach(function (f) { Object.assign(f.e, f.o); });
        App.change('resize', function () {
            finals.forEach(function (f) {
                ['x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2'].forEach(function (k) { if (f.v[k] !== undefined) f.e[k] = Math.round(f.v[k] * 10) / 10; });
                if (f.e.type === 'text' && f.e.autofit === 'grow') f.e._grown = false;
            });
        });
    }

    function startRotate(ev) {
        var e = App.selected()[0];
        if (!e || e.locked) return;
        var r = App.slideRect();
        drag = { kind: 'rotate', e: e, o: e.rot || 0, cx: r.left + (e.x + e.w / 2) * App.zoom, cy: r.top + (e.y + e.h / 2) * App.zoom, moved: false };
    }
    function applyRotate(ev) {
        drag.moved = true;
        var ang = Math.atan2(ev.clientY - drag.cy, ev.clientX - drag.cx) * 180 / Math.PI + 90;
        if (ev.shiftKey) ang = Math.round(ang / 15) * 15;
        else [0, 90, 180, 270, 360, -90].forEach(function (s) { if (Math.abs(ang - s) < 3) ang = s; });
        ang = ((Math.round(ang) % 360) + 360) % 360;
        drag.e.rot = ang;
        var node = App.nodeFor(drag.e.id);
        if (node) node.style.transform = ang ? 'rotate(' + ang + 'deg)' : '';
        App.drawOverlay();
        showTip(ev, ang + '°');
    }
    function commitRotate() {
        hideTip();
        if (!drag.moved) return;
        var v = drag.e.rot;
        drag.e.rot = drag.o;
        App.change('rotate', function () { drag.e.rot = v; });
    }

    function startPoint(ev, which) {
        var e = App.selected()[0];
        if (!e || e.locked) return;
        drag = { kind: 'point', e: e, which: which, o: M.clone(e), moved: false };
    }
    function applyPoint(ev) {
        drag.moved = true;
        var p = App.toSlide(ev.clientX, ev.clientY);
        var e = drag.e;
        var ox = drag.which === 'p1' ? e.x2 : e.x1, oy = drag.which === 'p1' ? e.y2 : e.y1;
        if (ev.shiftKey) {
            var ang = Math.round(Math.atan2(p.y - oy, p.x - ox) / (Math.PI / 4)) * (Math.PI / 4);
            var len = Math.hypot(p.x - ox, p.y - oy);
            p = { x: ox + Math.cos(ang) * len, y: oy + Math.sin(ang) * len };
        } else if (!ev.ctrlKey) {
            var sn = snapBox({ x: p.x, y: p.y, w: 0, h: 0 }, [e.id], { x: true, y: true });
            p.x += sn.dx; p.y += sn.dy;
            drawGuides(sn.guides);
        }
        if (drag.which === 'p1') { e.x1 = p.x; e.y1 = p.y; } else { e.x2 = p.x; e.y2 = p.y; }
        M.syncLineBox(e);
        replaceNode(e);
        App.drawOverlay();
    }
    function commitPoint() {
        drawGuides([]);
        if (!drag.moved) return;
        var v = M.clone(drag.e);
        Object.assign(drag.e, drag.o);
        App.change('line', function () { ['x1', 'y1', 'x2', 'y2'].forEach(function (k) { drag.e[k] = Math.round(v[k]); }); M.syncLineBox(drag.e); });
    }

    function startAdj(ev) {
        var e = App.selected()[0];
        drag = { kind: 'adj', e: e, o: e.adj, startX: ev.clientX, moved: false };
    }
    function applyAdj(ev) {
        drag.moved = true;
        var p = App.toSlide(ev.clientX, ev.clientY);
        var e = drag.e;
        var local = p.x - e.x;
        e.adj = SO.clamp(local / Math.min(e.w, e.h), 0, 0.5);
        replaceNode(e);
        App.drawOverlay();
    }
    function commitAdj() {
        if (!drag.moved) return;
        var v = drag.e.adj;
        drag.e.adj = drag.o;
        App.change('adjust', function () { drag.e.adj = Math.round(v * 1000) / 1000; });
    }

    function startMarquee(ev) {
        var p = App.toSlide(ev.clientX, ev.clientY);
        drag = { kind: 'marquee', x: p.x, y: p.y, add: ev.shiftKey || ev.ctrlKey || ev.metaKey, base: App.sel.slice(), box: SO.el('div', { class: 'ss-marquee' }) };
        el.overlay.appendChild(drag.box);
    }
    function applyMarquee(ev) {
        var p = App.toSlide(ev.clientX, ev.clientY);
        var z = App.zoom;
        var x = Math.min(p.x, drag.x), y = Math.min(p.y, drag.y), w = Math.abs(p.x - drag.x), h = Math.abs(p.y - drag.y);
        Object.assign(drag.box.style, { left: x * z + 'px', top: y * z + 'px', width: w * z + 'px', height: h * z + 'px' });
        drag.rect = { x: x, y: y, w: w, h: h };
    }
    function commitMarquee() {
        drag.box.remove();
        var r = drag.rect;
        if (!r || (r.w < 3 && r.h < 3)) return;
        var ids = App.slide().els.filter(function (e) {
            if (e.hidden || e.locked) return false;
            var b = M.rotatedBox(e);
            return b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;
        }).map(function (e) { return e.id; });
        App.select(drag.add ? drag.base.concat(ids.filter(function (id) { return drag.base.indexOf(id) === -1; })) : ids);
    }

    // Mode gambar (sisip bentuk/kotak teks dengan menyeret).
    C.beginDraw = function (spec) {
        if (App.editing) C.endEdit();
        App.drawMode = spec;
        document.body.classList.add('ss-drawmode');
        SO.toast('s_draw_hint', { ms: 2600 });
    };
    C.cancelDraw = function () {
        App.drawMode = null;
        document.body.classList.remove('ss-drawmode');
    };
    function startDraw(ev) {
        var p = App.toSlide(ev.clientX, ev.clientY);
        drag = { kind: 'draw', x: p.x, y: p.y, spec: App.drawMode, box: SO.el('div', { class: 'ss-marquee is-draw' }) };
        el.overlay.appendChild(drag.box);
    }
    function applyDraw(ev) {
        var p = App.toSlide(ev.clientX, ev.clientY);
        var z = App.zoom;
        var w = p.x - drag.x, h = p.y - drag.y;
        if (ev.shiftKey && drag.spec.type !== 'line') { var m = Math.max(Math.abs(w), Math.abs(h)); w = m * Math.sign(w || 1); h = m * Math.sign(h || 1); }
        drag.w = w; drag.h = h;
        if (drag.spec.type === 'line') {
            if (ev.shiftKey) { var ang = Math.round(Math.atan2(h, w) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(w, h); drag.w = w = Math.cos(ang) * len; drag.h = h = Math.sin(ang) * len; }
            drag.box.className = 'ss-draw-line';
            var len2 = Math.hypot(w, h) * z;
            Object.assign(drag.box.style, { left: drag.x * z + 'px', top: drag.y * z + 'px', width: len2 + 'px', height: '0', transform: 'rotate(' + Math.atan2(h, w) + 'rad)' });
            return;
        }
        Object.assign(drag.box.style, { left: Math.min(drag.x, drag.x + w) * z + 'px', top: Math.min(drag.y, drag.y + h) * z + 'px', width: Math.abs(w) * z + 'px', height: Math.abs(h) * z + 'px' });
    }
    function commitDraw() {
        drag.box.remove();
        var spec = drag.spec;
        C.cancelDraw();
        var w = drag.w || 0, h = drag.h || 0;
        var small = Math.abs(w) < 6 && Math.abs(h) < 6;
        var e;
        if (spec.type === 'line') {
            if (small) { w = 200; h = 0; }
            e = M.line(drag.x, drag.y, drag.x + w, drag.y + h, spec.arrow);
            if (spec.elbow) e.line.dash = 'solid';
        } else {
            var dw = spec.type === 'text' ? 320 : 180, dh = spec.type === 'text' ? 60 : 180;
            var x = small ? drag.x - dw / 2 : Math.min(drag.x, drag.x + w), y = small ? drag.y - dh / 2 : Math.min(drag.y, drag.y + h);
            var ww = small ? dw : Math.max(10, Math.abs(w)), hh = small ? dh : Math.max(10, Math.abs(h));
            if (spec.type === 'text') {
                e = M.textBox(x, y, ww, hh, '');
                if (small) e.autofit = 'grow';
            } else {
                e = M.shape(spec.shape || 'rect', x, y, ww, hh);
                if (App.defaultShapeStyle) Object.assign(e, M.clone(App.defaultShapeStyle));
            }
        }
        App.change('insert', function () { App.slide().els.push(e); App.sel = [e.id]; });
        if (e.type === 'text') C.startEdit(e.id, { caret: 'end' });
    }

    // ======================================================= penunjuk
    function onPointerDown(ev) {
        if (ev.button !== 0 && ev.pointerType === 'mouse') return;
        if (App.view !== 'normal') return;
        var target = ev.target;
        if (App.drawMode) { ev.preventDefault(); startDraw(ev); capture(ev); return; }
        var handle = target.closest && target.closest('[data-handle]');
        if (handle) {
            ev.preventDefault();
            var hk = handle.dataset.handle;
            if (hk === 'rot') startRotate(ev);
            else if (hk === 'p1' || hk === 'p2') startPoint(ev, hk);
            else if (hk === 'adj') startAdj(ev);
            else if (hk === 'move') startMove(ev, App.sel);
            else startResize(ev, hk);
            capture(ev);
            return;
        }
        var node = target.closest && target.closest('.ss-el');
        while (node && node.classList.contains('is-child')) node = node.parentNode.closest('.ss-el');
        if (App.editing) {
            var inEdit = App.editing.node && App.editing.node.contains(target);
            if (inEdit && (target.closest('[contenteditable="true"]') || (App.editing.table && target.closest('.ss-cell')))) {
                if (App.editing.table && !target.closest('[contenteditable="true"]')) { ev.preventDefault(); C.editCell(target.closest('.ss-cell'), ev); }
                return;
            }
            C.endEdit();
        }
        if (App.painter && node) { ev.preventDefault(); C.applyPainter(node.dataset.id); return; }
        if (node) {
            var id = node.dataset.id;
            var e = App.elById(id);
            if (!e) return;
            ev.preventDefault();
            if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
                if (App.sel.indexOf(id) !== -1 && !(ev.ctrlKey || ev.metaKey) && ev.shiftKey) App.select([id], { toggle: true });
                else if (App.sel.indexOf(id) === -1) App.select([id], { add: true });
                else if (ev.shiftKey) App.select([id], { toggle: true });
            } else if (App.sel.indexOf(id) === -1) App.select([id]);
            if (App.sel.indexOf(id) !== -1) startMove(ev, App.sel);
            capture(ev);
            focusCanvas();
            return;
        }
        ev.preventDefault();
        if (!(ev.shiftKey || ev.ctrlKey || ev.metaKey)) App.select([]);
        startMarquee(ev);
        capture(ev);
        focusCanvas();
    }

    var capturedId = null, captureEl = null;
    function capture(ev) {
        captureEl = el.wrap;
        try { captureEl.setPointerCapture(ev.pointerId); capturedId = ev.pointerId; } catch (e) {}
    }
    function release() {
        if (captureEl && capturedId != null) { try { captureEl.releasePointerCapture(capturedId); } catch (e) {} }
        capturedId = null;
    }

    function onPointerMove(ev) {
        if (!drag) return;
        switch (drag.kind) {
            case 'move': applyMove(ev); break;
            case 'resize': case 'resizeMulti': applyResize(ev); break;
            case 'rotate': applyRotate(ev); break;
            case 'point': applyPoint(ev); break;
            case 'adj': applyAdj(ev); break;
            case 'marquee': applyMarquee(ev); break;
            case 'draw': applyDraw(ev); break;
        }
    }
    function onPointerUp(ev) {
        if (!drag) return;
        var d = drag;
        release();
        switch (d.kind) {
            case 'move':
                var moved = commitMove(ev);
                if (!moved) {
                    // Klik pada elemen teks terpilih = mulai edit di posisi klik (seperti PowerPoint).
                    var only = App.selected();
                    if (only.length === 1 && d.wasSelected && !(ev.shiftKey || ev.ctrlKey || ev.metaKey) && (isTextual(only[0]) || only[0].type === 'table') && !only[0].locked) {
                        C.startEdit(only[0].id, { point: { x: ev.clientX, y: ev.clientY } });
                    }
                    App.drawOverlay();
                }
                break;
            case 'resize': case 'resizeMulti': commitResize(); break;
            case 'rotate': commitRotate(); break;
            case 'point': commitPoint(); break;
            case 'adj': commitAdj(); break;
            case 'marquee': commitMarquee(); break;
            case 'draw': commitDraw(); break;
        }
        drag = null;
    }

    el.wrap.addEventListener('pointerdown', function (ev) {
        var node = ev.target.closest && ev.target.closest('.ss-el');
        var id = node && node.dataset.id;
        var wasSelected = id && App.sel.length === 1 && App.sel[0] === id;
        onPointerDown(ev);
        if (drag && drag.kind === 'move') drag.wasSelected = wasSelected;
    });
    el.wrap.addEventListener('pointermove', onPointerMove);
    el.wrap.addEventListener('pointerup', onPointerUp);
    el.wrap.addEventListener('pointercancel', function () { if (drag && drag.box) drag.box.remove(); drag = null; document.body.classList.remove('ss-dragging'); drawGuides([]); App.renderStage(); });

    el.wrap.addEventListener('dblclick', function (ev) {
        if (App.view !== 'normal') return;
        var node = ev.target.closest && ev.target.closest('.ss-el');
        while (node && node.classList.contains('is-child')) node = node.parentNode.closest('.ss-el');
        if (!node) return;
        var e = App.elById(node.dataset.id);
        if (!e || e.locked) return;
        if (isTextual(e) || e.type === 'table') { if (!App.editing) C.startEdit(e.id, { point: { x: ev.clientX, y: ev.clientY }, word: true }); return; }
        if (e.type === 'image' && !e.asset) { C.insertImage(e.id); return; }
        if (e.type === 'image') { C.openFormatPane(); return; }
        if (e.type === 'chart') { C.chartDataDialog(e.id); return; }
        if (e.type === 'math') { C.equationDialog(e.id); return; }
        if (e.type === 'video') { C.videoDialog(e.id); return; }
        if (e.type === 'icon') { C.iconDialog(e.id); return; }
    });

    function focusCanvas() { if (document.activeElement !== el.wrap) el.wrap.focus({ preventScroll: true }); }
    C.focusCanvas = focusCanvas;

    // tooltip sudut
    var tipEl = null;
    function showTip(ev, text) {
        if (!tipEl) { tipEl = SO.el('div', { class: 'ss-drag-tip' }); document.body.appendChild(tipEl); }
        tipEl.textContent = text;
        tipEl.style.left = ev.clientX + 16 + 'px';
        tipEl.style.top = ev.clientY + 16 + 'px';
        tipEl.hidden = false;
    }
    function hideTip() { if (tipEl) tipEl.hidden = true; }

    // ========================================================= edit teks
    function placeCaret(target, opts) {
        var sel = window.getSelection();
        var range = null;
        if (opts.point && document.caretRangeFromPoint) {
            range = document.caretRangeFromPoint(opts.point.x, opts.point.y);
            if (range && !target.contains(range.startContainer)) range = null;
        } else if (opts.point && document.caretPositionFromPoint) {
            var pos = document.caretPositionFromPoint(opts.point.x, opts.point.y);
            if (pos && target.contains(pos.offsetNode)) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true); }
        }
        if (!range) {
            range = document.createRange();
            range.selectNodeContents(target);
            if (opts.caret !== 'all') range.collapse(false);
        }
        sel.removeAllRanges();
        sel.addRange(range);
        if (opts.word && sel.modify && range.collapsed) {
            try { sel.modify('move', 'backward', 'word'); sel.modify('extend', 'forward', 'word'); } catch (e) {}
        }
    }

    C.startEdit = function (id, opts) {
        opts = opts || {};
        var e = App.elById(id);
        if (!e || e.locked) return;
        if (App.editing) C.endEdit();
        if (App.sel.length !== 1 || App.sel[0] !== id) { App.sel = [id]; }
        var node = App.nodeFor(id);
        if (!node) { App.renderStage(); node = App.nodeFor(id); }
        if (!node) return;
        if (e.type === 'table') {
            App.editing = { id: id, node: node, table: true, cell: null };
            App.drawOverlay();
            var cellNode = null;
            if (opts.point) {
                var hit = document.elementFromPoint(opts.point.x, opts.point.y);
                cellNode = hit && hit.closest && hit.closest('.ss-cell');
            }
            C.editCell(cellNode || node.querySelector('.ss-cell'), opts);
            return;
        }
        var tx = node.querySelector('.ss-tx');
        if (!tx) return;
        tx.classList.remove('is-empty');
        tx.style.transform = '';
        tx.style.width = '';
        if (e.ph && M.isEmptyHtml(e.html)) tx.innerHTML = e.ph === 'body' ? '<ul><li><br></li></ul>' : '<div><br></div>';
        if (!tx.innerHTML) tx.innerHTML = '<div><br></div>';
        tx.contentEditable = 'true';
        tx.spellcheck = true;
        node.classList.add('is-editing');
        App.editing = { id: id, node: node, tx: tx, start: e.html };
        tx.focus({ preventScroll: true });
        placeCaret(tx, opts);
        try { document.execCommand('styleWithCSS', false, true); } catch (err) {}
        App.drawOverlay();
        C.updateRibbonSoon();
    };

    C.editCell = function (cellNode, opts) {
        opts = opts || {};
        var ed = App.editing;
        if (!ed || !ed.table || !cellNode) return;
        if (ed.tx && ed.tx !== cellNode) { C.commitText(); ed.tx.contentEditable = 'false'; ed.tx.parentNode.classList.remove('is-cell-editing'); }
        cellNode.contentEditable = 'true';
        cellNode.parentNode.classList.add('is-cell-editing');
        ed.tx = cellNode;
        ed.cell = { r: +cellNode.dataset.r, c: +cellNode.dataset.c };
        cellNode.focus({ preventScroll: true });
        placeCaret(cellNode, opts.point ? opts : { caret: opts.caret || 'end' });
        C.updateRibbonSoon();
    };

    var commitTimer = null;
    C.commitTextSoon = function () {
        clearTimeout(commitTimer);
        commitTimer = setTimeout(C.commitText, 450);
        growToFit();
    };

    function growToFit() {
        var ed = App.editing;
        if (!ed || ed.table) return;
        var e = App.elById(ed.id);
        if (!e || e.autofit !== 'grow') return;
        var box = ed.tx.parentNode;
        var need = ed.tx.scrollHeight + parseFloat(box.style.paddingTop || 0) + parseFloat(box.style.paddingBottom || 0);
        if (need > e.h + 0.5) {
            ed.node.style.height = need + 'px';
            ed.growH = need;
            var svg = ed.node.querySelector('.ss-shape');
            if (svg) { svg.setAttribute('height', need); svg.setAttribute('viewBox', '0 0 ' + e.w + ' ' + need); }
            var tmp = Object.assign({}, e, { h: need });
            var frame = el.overlay.querySelector('.ss-frame');
            if (frame) frame.style.height = tmp.h * App.zoom + 'px';
        }
    }

    C.commitText = function () {
        clearTimeout(commitTimer);
        var ed = App.editing;
        if (!ed || !ed.tx) return;
        var e = App.elById(ed.id);
        if (!e) return;
        var html = M.sanitize(ed.tx.innerHTML);
        if (M.isEmptyHtml(html) && !/<(ul|ol)/i.test(html)) html = '';
        if (ed.table) {
            var cell = e.cells[ed.cell.r] && e.cells[ed.cell.r][ed.cell.c];
            if (!cell || cell.html === html) return;
            App.change('typing', function () { cell.html = html; }, { merge: 'cell:' + ed.id + ':' + ed.cell.r + ':' + ed.cell.c, render: 'thumb' });
            return;
        }
        var grow = ed.growH && ed.growH > e.h ? Math.ceil(ed.growH) : null;
        if (e.html === html && !grow) return;
        App.change('typing', function () { e.html = html; if (grow) e.h = grow; }, { merge: 'text:' + ed.id, render: 'thumb' });
    };

    C.endEdit = function (skipCommit) {
        var ed = App.editing;
        if (!ed) return;
        if (!skipCommit) C.commitText();
        if (ed.tx) ed.tx.contentEditable = 'false';
        App.editing = null;
        var sel = window.getSelection();
        if (sel && ed.node && ed.node.contains(sel.anchorNode)) sel.removeAllRanges();
        var e = App.elById(ed.id);
        // Kotak teks kosong yang baru dibuat dihapus saat keluar edit.
        if (e && e.type === 'text' && !e.ph && !skipCommit && M.isEmptyHtml(e.html) && (!e.fill || e.fill.type === 'none') && (!e.line || e.line.type === 'none')) {
            App.change('delete', function () { var s = App.slide(); s.els = s.els.filter(function (x) { return x.id !== e.id; }); App.sel = []; });
        }
        // Tinggi kotak teks tumbuh/menyusut mengikuti isi.
        if (e && e.type === 'text' && e.autofit === 'grow' && !skipCommit) fitGrowHeight(e);
        App.renderStage();
        App.refreshThumbSoon(App.cur);
        focusCanvas();
        C.updateRibbonSoon();
    };

    function fitGrowHeight(e) {
        var probe = R.elementNode(Object.assign({}, e, { h: 10 }), App.pal(), { mode: 'thumb' });
        probe.style.visibility = 'hidden';
        el.host.firstChild && el.host.firstChild.appendChild(probe);
        var box = probe.querySelector('.ss-text'), tx = probe.querySelector('.ss-tx');
        var need = tx ? Math.ceil(tx.scrollHeight + parseFloat(box.style.paddingTop || 0) + parseFloat(box.style.paddingBottom || 0)) : e.h;
        probe.remove();
        if (need && Math.abs(need - e.h) > 1) App.change('autofit', function () { e.h = Math.max(20, need); }, { merge: 'text:' + e.id });
    }
    C.fitGrowHeight = fitGrowHeight;

    // Pintasan yang tetap aktif saat mengetik di dalam kotak teks.
    var EDIT_GLOBAL = { 'Mod+S': 1, 'Mod+P': 1, 'F5': 1, 'Shift+F5': 1, 'Mod+M': 1, 'Mod+Z': 1, 'Mod+Y': 1, 'Mod+Shift+Z': 1 };
    function onEditKey(ev) {
        var ed = App.editing;
        if (!ed) return;
        var combo = SO.onKeyCombo(ev);
        if (EDIT_GLOBAL[combo] && App.shortcuts && App.shortcuts[combo]) { ev.preventDefault(); ev.stopPropagation(); App.shortcuts[combo](ev); return; }
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); var id = ed.id; C.endEdit(); App.select([id]); return; }
        if (ed.table && ev.key === 'Tab') {
            ev.preventDefault();
            var e = App.elById(ed.id);
            var r = ed.cell.r, c = ed.cell.c;
            var cols = e.cells[0].length, rows = e.cells.length;
            var idx = r * cols + c + (ev.shiftKey ? -1 : 1);
            if (idx >= rows * cols) { C.commitText(); C.tableOp('rowBelow'); idx = rows * cols; }
            idx = SO.clamp(idx, 0, e.cells.length * cols - 1);
            var nr = Math.floor(idx / cols), nc = idx % cols;
            var node = App.nodeFor(ed.id);
            C.editCell(node.querySelector('.ss-cell[data-r="' + nr + '"][data-c="' + nc + '"]'), { caret: 'all' });
            return;
        }
        if (ev.key === 'Tab') {
            ev.preventDefault();
            document.execCommand(ev.shiftKey ? 'outdent' : 'indent');
            C.commitTextSoon();
            return;
        }
        if (SO.mod(ev) && !ev.shiftKey && !ev.altKey) {
            var k = ev.key.toLowerCase();
            if (k === 'b' || k === 'i' || k === 'u') { ev.preventDefault(); C.textCmd(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline'); return; }
            if (k === 'l' || k === 'e' || k === 'r' || k === 'j') { ev.preventDefault(); C.align(k === 'l' ? 'left' : k === 'e' ? 'center' : k === 'r' ? 'right' : 'justify'); return; }
            if (k === ']' || k === '[') { ev.preventDefault(); C.fontSizeStep(k === ']' ? 1 : -1); return; }
            if (k === 'a') return;
            if (k === 'k') { ev.preventDefault(); C.linkDialog(); return; }
        }
        if (SO.mod(ev) && ev.shiftKey && (ev.key === '>' || ev.key === '<' || ev.code === 'Period' || ev.code === 'Comma')) { ev.preventDefault(); C.fontSizeStep(ev.key === '>' || ev.code === 'Period' ? 1 : -1); }
    }
    el.host.addEventListener('keydown', onEditKey, true);
    el.host.addEventListener('input', function () { if (App.editing) C.commitTextSoon(); });
    el.host.addEventListener('paste', function (ev) {
        if (!App.editing) return;
        ev.preventDefault();
        ev.stopPropagation();
        var cd = ev.clipboardData;
        var html = cd.getData('text/html'), text = cd.getData('text/plain');
        var files = Array.prototype.slice.call(cd.files || []).filter(function (f) { return /^image\//.test(f.type); });
        if (files.length && !text) { C.endEdit(); C.insertImageFile(files[0]); return; }
        if (html) {
            html = html.replace(/^[\s\S]*<!--StartFragment-->/, '').replace(/<!--EndFragment-->[\s\S]*$/, '');
            document.execCommand('insertHTML', false, M.sanitize(html));
        } else if (text) {
            document.execCommand('insertText', false, text);
        }
        C.commitTextSoon();
    });
    el.host.addEventListener('click', function (ev) {
        var a = ev.target.closest && ev.target.closest('a[href]');
        if (a && App.editing && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
    });
    document.addEventListener('selectionchange', function () { if (App.editing) C.updateRibbonSoon(); });

    // ========================================================= keyboard
    function inField(t) {
        return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    }

    document.addEventListener('keydown', function (ev) {
        if (SO.isDialogOpen() || (App.backstage && App.backstage.isOpen()) || App.showing) return;
        if (App.drawMode && ev.key === 'Escape') { C.cancelDraw(); return; }
        if (App.painter && ev.key === 'Escape') { C.cancelPainter(); return; }
        var t = ev.target;
        if (App.editing || inField(t)) return;
        var combo = SO.onKeyCombo(ev);
        var fn = App.shortcuts && App.shortcuts[combo];
        if (t.closest && t.closest('.so-ribbon, .so-menu, .so-pane, #soTitlebar')) {
            // Fokus di ribbon/panel: hanya pintasan dengan Ctrl/⌘ atau tombol F.
            if (fn && (SO.mod(ev) || /^F\d+$/.test(ev.key))) { if (fn(ev) !== false) ev.preventDefault(); }
            return;
        }
        var inList = t.closest && t.closest('#ssSlideList, #ssSorter');
        if (fn) { if (fn(ev) !== false) ev.preventDefault(); return; }
        var mod = SO.mod(ev);
        if (inList || (!App.sel.length && App.view === 'normal') || App.view === 'sorter') {
            if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight' || ev.key === 'PageDown') { ev.preventDefault(); App.goto(App.cur + 1); return; }
            if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); App.goto(App.cur - 1); return; }
            if (ev.key === 'Home') { ev.preventDefault(); App.goto(0); return; }
            if (ev.key === 'End') { ev.preventDefault(); App.goto(App.deck.slides.length - 1); return; }
            if ((ev.key === 'Delete' || ev.key === 'Backspace') && (inList || App.view === 'sorter')) { ev.preventDefault(); C.deleteSlide(); return; }
            if (ev.key === 'Enter' && inList) { ev.preventDefault(); C.newSlide(); return; }
        }
        if (App.view !== 'normal') return;
        var sel = App.selected();
        if (!sel.length) return;
        switch (ev.key) {
            case 'Delete': case 'Backspace': ev.preventDefault(); C.deleteSelection(); return;
            case 'Escape': ev.preventDefault(); App.select([]); return;
            case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
                ev.preventDefault();
                var step = mod || ev.altKey ? 1 : ev.shiftKey ? 40 : 8;
                var dx = ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0, dy = ev.key === 'ArrowUp' ? -step : ev.key === 'ArrowDown' ? step : 0;
                App.change('nudge', function () { sel.forEach(function (e) { if (!e.locked) shiftEl(e, dx, dy); }); }, { merge: 'nudge' });
                return;
            case 'Enter': case 'F2':
                if (sel.length === 1 && (isTextual(sel[0]) || sel[0].type === 'table')) { ev.preventDefault(); C.startEdit(sel[0].id, { caret: ev.key === 'F2' ? 'end' : 'all' }); }
                return;
            case 'Tab':
                ev.preventDefault();
                var els = App.slide().els.filter(function (e) { return !e.hidden; });
                if (!els.length) return;
                var i = els.map(function (e) { return e.id; }).indexOf(App.sel[App.sel.length - 1]);
                App.select([els[(i + (ev.shiftKey ? -1 : 1) + els.length) % els.length].id]);
                return;
        }
        // Mengetik saat satu bentuk terpilih langsung mengganti teksnya.
        if (ev.key.length === 1 && !mod && !ev.altKey && sel.length === 1 && isTextual(sel[0]) && !sel[0].locked) {
            C.startEdit(sel[0].id, { caret: 'all' });
        }
    });

    // ========================================================= papan klip
    var CLIP_MIME = 'web application/x-sineslide';
    function clipPayload() {
        var list = App.el.list.contains(document.activeElement) || App.view === 'sorter';
        if (list || !App.sel.length) return { kind: 'slides', slides: [M.clone(App.slide())], size: App.deck.size };
        return { kind: 'els', els: M.clone(App.selected()), size: App.deck.size };
    }
    function assetMapFor(payload) {
        var fake = { slides: payload.kind === 'slides' ? payload.slides : [{ els: payload.els }] };
        return App.assets.exportMap(M.assetIds(fake));
    }
    C.copy = function (cut) {
        if (App.editing) { document.execCommand(cut ? 'cut' : 'copy'); return; }
        var payload = clipPayload();
        App.clip = payload;
        assetMapFor(payload).then(function (map) { payload.assets = map; });
        var text = payload.kind === 'els' ? payload.els.map(function (e) { return M.htmlToText(e.html || ''); }).filter(Boolean).join('\n') : M.slideTitle(payload.slides[0]);
        try { navigator.clipboard.writeText(text || ' ').catch(function () {}); } catch (e) {}
        if (cut) { if (payload.kind === 'els') C.deleteSelection(); else C.deleteSlide(); }
    };

    C.pasteClip = function (payload) {
        if (!payload) return;
        if (payload.assets) App.assets.importMap(payload.assets);
        if (payload.kind === 'slides') {
            App.change('paste-slide', function () {
                payload.slides.forEach(function (s, k) { App.deck.slides.splice(App.cur + 1 + k, 0, M.cloneSlide(s)); });
                App.cur += 1;
                App.sel = [];
            }, { render: 'all' });
            return;
        }
        var s = App.slide();
        var sameSlideIds = payload.els.every(function (e) { return !!M.findEl(s, e.id); });
        App.change('paste', function () {
            var ids = [];
            payload.els.forEach(function (e) {
                var c = M.cloneEl(e);
                if (sameSlideIds) shiftEl(c, 20, 20);
                s.els.push(c);
                ids.push(c.id);
            });
            App.sel = ids;
        });
        payload.els.forEach(function (e) { if (sameSlideIds) shiftEl(e, 20, 20); });
    };

    C.paste = function (mode) {
        if (App.editing) {
            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(function (t) { document.execCommand('insertText', false, t); C.commitTextSoon(); }).catch(function () { SO.toast('s_clipboard_blocked', { type: 'warn' }); });
            }
            return;
        }
        if (App.clip) { C.pasteClip(App.clip); return; }
        if (navigator.clipboard && navigator.clipboard.read) {
            navigator.clipboard.read().then(function (items) {
                var img = null;
                items.forEach(function (it) { it.types.forEach(function (tp) { if (!img && /^image\//.test(tp)) img = it.getType(tp); }); });
                if (img) return img.then(function (blob) { C.insertImageFile(new File([blob], 'paste.png', { type: blob.type })); });
                return navigator.clipboard.readText().then(function (t) { if (t) C.insertTextBox(t); });
            }).catch(function () { SO.toast('s_clipboard_blocked', { type: 'warn' }); });
        }
    };

    document.addEventListener('copy', function (ev) {
        if (App.editing || inField(ev.target) || SO.isDialogOpen() || App.showing) return;
        if (!App.sel.length && !App.el.list.contains(document.activeElement) && App.view !== 'sorter') return;
        ev.preventDefault();
        var payload = clipPayload();
        App.clip = payload;
        assetMapFor(payload).then(function (map) { payload.assets = map; });
        ev.clipboardData.setData('text/plain', payload.kind === 'els' ? payload.els.map(function (e) { return M.htmlToText(e.html || ''); }).filter(Boolean).join('\n') || ' ' : M.slideTitle(payload.slides[0]) || ' ');
        try { ev.clipboardData.setData(CLIP_MIME, JSON.stringify({ kind: payload.kind, stamp: payload.stamp = Date.now() })); } catch (e) {}
    });
    document.addEventListener('cut', function (ev) {
        if (App.editing || inField(ev.target) || SO.isDialogOpen() || App.showing) return;
        if (!App.sel.length && !App.el.list.contains(document.activeElement) && App.view !== 'sorter') return;
        ev.preventDefault();
        C.copy(true);
    });
    document.addEventListener('paste', function (ev) {
        if (App.editing || inField(ev.target) || SO.isDialogOpen() || App.showing) return;
        var cd = ev.clipboardData;
        var files = Array.prototype.slice.call(cd.files || []);
        var img = files.filter(function (f) { return /^image\//.test(f.type); })[0];
        var text = cd.getData('text/plain');
        var internal = cd.types && Array.prototype.indexOf.call(cd.types, CLIP_MIME) !== -1;
        ev.preventDefault();
        if (internal && App.clip) { C.pasteClip(App.clip); return; }
        if (img) { C.insertImageFile(img); return; }
        var html = cd.getData('text/html');
        if (App.clip && !text.trim()) { C.pasteClip(App.clip); return; }
        if (/^https?:\/\/\S+$/i.test(text.trim()) && R.youtubeId(text.trim())) { C.insertVideo(text.trim()); return; }
        if (html || text) { App.clip = null; C.insertTextBox(text, html); }
    });

    // ========================================================= seret berkas
    ['dragover', 'drop'].forEach(function (type) {
        el.wrap.addEventListener(type, function (ev) {
            if (!ev.dataTransfer || Array.prototype.indexOf.call(ev.dataTransfer.types || [], 'Files') === -1) return;
            ev.preventDefault();
            if (type === 'dragover') { ev.dataTransfer.dropEffect = 'copy'; return; }
            var files = Array.prototype.slice.call(ev.dataTransfer.files || []);
            var p = App.toSlide(ev.clientX, ev.clientY);
            files.forEach(function (f, i) {
                if (/^image\//.test(f.type)) C.insertImageFile(f, { x: p.x + i * 20, y: p.y + i * 20 });
                else if (/\.(pptx|sineslide)$/i.test(f.name)) C.importFile(f);
            });
        });
    });

    // ========================================================= menu konteks
    el.wrap.addEventListener('contextmenu', function (ev) {
        if (App.view !== 'normal') return;
        if (App.editing && App.editing.node && App.editing.node.contains(ev.target)) {
            SO.contextMenu(ev, C.textContextMenu());
            return;
        }
        var node = ev.target.closest && ev.target.closest('.ss-el');
        while (node && node.classList.contains('is-child')) node = node.parentNode.closest('.ss-el');
        if (node) {
            if (App.sel.indexOf(node.dataset.id) === -1) App.select([node.dataset.id]);
            SO.contextMenu(ev, C.elementContextMenu());
        } else {
            App.select([]);
            SO.contextMenu(ev, C.slideContextMenu());
        }
    });

    // ========================================================= panel slide
    var listDrag = null;
    el.list.addEventListener('pointerdown', function (ev) {
        var item = ev.target.closest('.ss-thumb');
        if (!item || ev.button !== 0) return;
        el.list.focus({ preventScroll: true });
        var i = +item.dataset.index;
        App.goto(i);
        listDrag = { from: i, startY: ev.clientY, active: false, id: ev.pointerId };
    });
    el.list.addEventListener('pointermove', function (ev) {
        if (!listDrag) return;
        if (!listDrag.active && Math.abs(ev.clientY - listDrag.startY) < 6) return;
        if (!listDrag.active) {
            listDrag.active = true;
            try { el.list.setPointerCapture(listDrag.id); } catch (e) {}
            listDrag.marker = SO.el('div', { class: 'ss-drop-marker' });
            el.list.appendChild(listDrag.marker);
            el.list.classList.add('is-dragging');
        }
        var items = SO.$$('.ss-thumb', el.list);
        var to = items.length;
        for (var k = 0; k < items.length; k++) {
            var r = items[k].getBoundingClientRect();
            if (ev.clientY < r.top + r.height / 2) { to = k; break; }
        }
        listDrag.to = to;
        var ref = items[to] || items[items.length - 1];
        var top = ref ? (items[to] ? ref.offsetTop - 5 : ref.offsetTop + ref.offsetHeight + 3) : 0;
        listDrag.marker.style.top = top + 'px';
        var lr = el.list.getBoundingClientRect();
        if (ev.clientY < lr.top + 30) el.list.scrollTop -= 12;
        else if (ev.clientY > lr.bottom - 30) el.list.scrollTop += 12;
    });
    function endListDrag() {
        if (!listDrag) return;
        var d = listDrag;
        listDrag = null;
        el.list.classList.remove('is-dragging');
        if (d.marker) d.marker.remove();
        if (!d.active || d.to == null) return;
        var to = d.to > d.from ? d.to - 1 : d.to;
        if (to !== d.from) C.moveSlide(d.from, to);
    }
    el.list.addEventListener('pointerup', endListDrag);
    el.list.addEventListener('pointercancel', endListDrag);
    el.list.addEventListener('contextmenu', function (ev) {
        var item = ev.target.closest('.ss-thumb');
        if (item) App.goto(+item.dataset.index);
        SO.contextMenu(ev, item ? C.thumbContextMenu() : [{ label: 's_new_slide', icon: 'fa-square-plus', onClick: function () { C.newSlide(); } }]);
    });
    el.list.addEventListener('dblclick', function (ev) { if (!ev.target.closest('.ss-thumb')) C.newSlide(); });

    // penyortir slide
    var sortDragFrom = null;
    el.sorter.addEventListener('click', function (ev) {
        var item = ev.target.closest('.ss-sort-item');
        if (item) App.goto(+item.dataset.index);
    });
    el.sorter.addEventListener('dblclick', function (ev) {
        var item = ev.target.closest('.ss-sort-item');
        if (item) { App.goto(+item.dataset.index); App.setView('normal'); }
    });
    el.sorter.addEventListener('dragstart', function (ev) {
        var item = ev.target.closest('.ss-sort-item');
        if (!item) return;
        sortDragFrom = +item.dataset.index;
        ev.dataTransfer.effectAllowed = 'move';
        try { ev.dataTransfer.setData('text/plain', String(sortDragFrom)); } catch (e) {}
    });
    el.sorter.addEventListener('dragover', function (ev) { if (sortDragFrom != null) ev.preventDefault(); });
    el.sorter.addEventListener('drop', function (ev) {
        if (sortDragFrom == null) return;
        ev.preventDefault();
        var item = ev.target.closest('.ss-sort-item');
        var to = item ? +item.dataset.index : App.deck.slides.length - 1;
        if (item) { var r = item.getBoundingClientRect(); if (ev.clientX > r.left + r.width / 2 && to < sortDragFrom) to++; else if (ev.clientX < r.left + r.width / 2 && to > sortDragFrom) to--; }
        var from = sortDragFrom;
        sortDragFrom = null;
        if (to !== from) C.moveSlide(from, to);
    });
    el.sorter.addEventListener('contextmenu', function (ev) {
        var item = ev.target.closest('.ss-sort-item');
        if (!item) return;
        App.goto(+item.dataset.index);
        SO.contextMenu(ev, C.thumbContextMenu());
    });

    // ========================================================= catatan
    el.notesText.addEventListener('input', SO.debounce(function () {
        var s = App.slide();
        var v = el.notesText.value;
        if (s && s.notes !== v) App.change('notes', function () { s.notes = v; }, { merge: 'notes:' + s.id, render: 'none' });
    }, 400));
    (function () {
        var start = null;
        el.notesResize.addEventListener('pointerdown', function (ev) {
            start = { y: ev.clientY, h: el.notes.offsetHeight };
            el.notesResize.setPointerCapture(ev.pointerId);
        });
        el.notesResize.addEventListener('pointermove', function (ev) {
            if (!start) return;
            var h = SO.clamp(start.h - (ev.clientY - start.y), 60, Math.max(80, el.main.clientHeight * 0.6));
            el.notes.style.height = h + 'px';
        });
        el.notesResize.addEventListener('pointerup', function () {
            if (!start) return;
            start = null;
            try { localStorage.setItem('ss_notes_h', String(el.notes.offsetHeight)); } catch (e) {}
            if (App.fitMode) App.setZoom(0, true);
        });
    })();

    // Zoom dengan Ctrl+roda.
    el.wrap.addEventListener('wheel', function (ev) {
        if (!(ev.ctrlKey || ev.metaKey)) return;
        ev.preventDefault();
        App.setZoom(App.zoom * (ev.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });
})(window);
