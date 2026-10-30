/* Sinerli Rupa — Copyright © 2026 Gadtan x Gallen. All rights reserved.
 *
 * Mesin Rupa: satu dokumen untuk foto (lapisan raster), vektor (path bezier),
 * papan alur (sticky, konektor) dan desain UI (frame, auto-layout, komponen,
 * prototipe). Semua objek adalah entitas LWW (lihat SN.Collab) sehingga satu
 * kanvas bisa diedit banyak orang sekaligus.
 *
 *   RD  dokumen: entitas, halaman, undo/redo, simpan cloud, kolaborasi
 *   RG  geometri: transformasi, bounds, hit-test, path bezier, boolean
 *   RR  renderer Canvas2D dengan culling, cache gambar & filter
 */
(function (global) {
  'use strict';
  var TYPE = 'rupa';

  /* ================================================================= RG */
  var RG = global.RG = {};
  RG.uid = function (p) { var b = new Uint8Array(7); crypto.getRandomValues(b); return (p || 'n') + Array.from(b, function (x) { return (x % 36).toString(36); }).join(''); };
  RG.rad = function (d) { return d * Math.PI / 180; };
  RG.rot = function (x, y, cx, cy, deg) {
    if (!deg) return { x: x, y: y };
    var a = RG.rad(deg), c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  };
  /** Sudut-sudut node (dengan rotasi) di koordinat dunia. */
  RG.corners = function (n) {
    var cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    return [[n.x, n.y], [n.x + n.w, n.y], [n.x + n.w, n.y + n.h], [n.x, n.y + n.h]].map(function (p) { return RG.rot(p[0], p[1], cx, cy, n.rot || 0); });
  };
  RG.bounds = function (n) {
    if (!n.rot) return { x: n.x, y: n.y, w: n.w, h: n.h };
    var c = RG.corners(n), xs = c.map(function (p) { return p.x; }), ys = c.map(function (p) { return p.y; });
    var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    return { x: x, y: y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y };
  };
  RG.union = function (list) {
    if (!list.length) return null;
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    list.forEach(function (b) { x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };
  RG.inter = function (a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; };
  /** Titik dunia → koordinat lokal node (tanpa rotasi). */
  RG.toLocal = function (n, x, y) { return RG.rot(x, y, n.x + n.w / 2, n.y + n.h / 2, -(n.rot || 0)); };

  /* --- path: d = [{pts:[{x,y,ix,iy,ox,oy}], closed}] dalam koordinat 0..1 relatif terhadap kotak node */
  RG.pathTo = function (ctx, d, n) {
    (d || []).forEach(function (sp) {
      var p = sp.pts; if (!p || !p.length) return;
      var X = function (v) { return n.x + v * n.w; }, Y = function (v) { return n.y + v * n.h; };
      ctx.moveTo(X(p[0].x), Y(p[0].y));
      var seg = function (a, b) {
        if (a.ox == null && b.ix == null) ctx.lineTo(X(b.x), Y(b.y));
        else ctx.bezierCurveTo(X(a.ox == null ? a.x : a.ox), Y(a.oy == null ? a.y : a.oy), X(b.ix == null ? b.x : b.ix), Y(b.iy == null ? b.y : b.iy), X(b.x), Y(b.y));
      };
      for (var i = 1; i < p.length; i++) seg(p[i - 1], p[i]);
      if (sp.closed) { seg(p[p.length - 1], p[0]); ctx.closePath(); }
    });
  };
  /** Bentuk dasar → path (untuk edit titik & boolean). */
  RG.shapePath = function (n) {
    var k = 0.5523, P = function (x, y, ix, iy, ox, oy) { return { x: x, y: y, ix: ix, iy: iy, ox: ox, oy: oy }; };
    switch (n.type) {
      case 'rect': case 'frame': case 'sticky':
        var r = Math.min(n.radius || 0, n.w / 2, n.h / 2);
        if (!r) return [{ closed: true, pts: [P(0, 0), P(1, 0), P(1, 1), P(0, 1)] }];
        var rx = r / n.w, ry = r / n.h, c = 1 - k;
        return [{ closed: true, pts: [P(rx, 0, rx * c, 0), P(1 - rx, 0, null, null, 1 - rx * c, 0), P(1, ry, 1, ry * c), P(1, 1 - ry, null, null, 1, 1 - ry * c), P(1 - rx, 1, 1 - rx * c, 1), P(rx, 1, null, null, rx * c, 1), P(0, 1 - ry, 0, 1 - ry * c), P(0, ry, null, null, 0, ry * c)].map(function (q, i, arr) { return q; }) }];
      case 'ellipse':
        return [{ closed: true, pts: [P(0.5, 0, 0.5 - k / 2, 0, 0.5 + k / 2, 0), P(1, 0.5, 1, 0.5 - k / 2, 1, 0.5 + k / 2), P(0.5, 1, 0.5 + k / 2, 1, 0.5 - k / 2, 1), P(0, 0.5, 0, 0.5 + k / 2, 0, 0.5 - k / 2)] }];
      case 'polygon': case 'star':
        var sides = Math.max(3, n.sides || (n.type === 'star' ? 5 : 6)), pts = [], inner = n.inner || 0.45, total = n.type === 'star' ? sides * 2 : sides;
        for (var i = 0; i < total; i++) {
          var a = -Math.PI / 2 + i * 2 * Math.PI / total, rr = n.type === 'star' && i % 2 ? inner : 1;
          pts.push(P(0.5 + Math.cos(a) * 0.5 * rr, 0.5 + Math.sin(a) * 0.5 * rr));
        }
        return [{ closed: true, pts: pts }];
      case 'line': case 'arrow':
        return [{ closed: false, pts: [P(n.flipLine ? 0 : 0, n.flipLine ? 1 : 0), P(1, n.flipLine ? 0 : 1)] }];
      case 'path': return n.d || [];
    }
    return [{ closed: true, pts: [P(0, 0), P(1, 0), P(1, 1), P(0, 1)] }];
  };
  /** Ratakan path bezier menjadi poligon dunia (untuk boolean & hit-test). */
  RG.flatten = function (n, steps) {
    steps = steps || 12;
    var d = RG.shapePath(n), cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    return d.map(function (sp) {
      var out = [], p = sp.pts;
      var W = function (u, v) { var q = RG.rot(n.x + u * n.w, n.y + v * n.h, cx, cy, n.rot || 0); return [q.x, q.y]; };
      var seg = function (a, b) {
        if (a.ox == null && b.ix == null) { out.push(W(b.x, b.y)); return; }
        var x0 = a.x, y0 = a.y, x1 = a.ox == null ? a.x : a.ox, y1 = a.oy == null ? a.y : a.oy, x2 = b.ix == null ? b.x : b.ix, y2 = b.iy == null ? b.y : b.iy, x3 = b.x, y3 = b.y;
        for (var i = 1; i <= steps; i++) {
          var t = i / steps, m = 1 - t;
          out.push(W(m * m * m * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x3, m * m * m * y0 + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y3));
        }
      };
      if (!p.length) return out;
      out.push(W(p[0].x, p[0].y));
      for (var i = 1; i < p.length; i++) seg(p[i - 1], p[i]);
      if (sp.closed) seg(p[p.length - 1], p[0]);
      return out;
    });
  };
  /** Operasi boolean (union | difference | intersection | xor) atas node-node bentuk. */
  RG.boolean = function (op, nodes) {
    if (!global.polygonClipping || nodes.length < 2) return null;
    var polys = nodes.map(function (n) { return RG.flatten(n, 16).filter(function (r) { return r.length > 2; }).map(function (r) { var c = r.slice(); c.push(r[0]); return c; }); });
    var res;
    try { res = polygonClipping[op].apply(null, polys); } catch (e) { return null; }
    if (!res || !res.length) return null;
    var xs = [], ys = [];
    res.forEach(function (poly) { poly.forEach(function (ring) { ring.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); }); });
    var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys), w = Math.max(1, Math.max.apply(null, xs) - x), h = Math.max(1, Math.max.apply(null, ys) - y);
    var d = [];
    res.forEach(function (poly) { poly.forEach(function (ring) { d.push({ closed: true, pts: ring.slice(0, -1).map(function (p) { return { x: (p[0] - x) / w, y: (p[1] - y) / h }; }) }); }); });
    return { x: x, y: y, w: w, h: h, d: d };
  };
  RG.pointInPoly = function (x, y, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  RG.distSeg = function (px, py, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l)) : 0;
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  };
  /** Penyederhanaan Ramer–Douglas–Peucker untuk goresan pensil. */
  RG.simplify = function (pts, eps) {
    if (pts.length < 3) return pts;
    var dmax = 0, idx = 0, a = pts[0], b = pts[pts.length - 1];
    for (var i = 1; i < pts.length - 1; i++) { var d = RG.distSeg(pts[i][0], pts[i][1], a, b); if (d > dmax) { dmax = d; idx = i; } }
    if (dmax > eps) { var l = RG.simplify(pts.slice(0, idx + 1), eps), r = RG.simplify(pts.slice(idx), eps); return l.slice(0, -1).concat(r); }
    return [a, b];
  };
  /** Titik dunia → path halus (Catmull-Rom → bezier) dinormalisasi ke kotaknya. */
  RG.smoothPath = function (pts, closed) {
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys), w = Math.max(1, Math.max.apply(null, xs) - x), h = Math.max(1, Math.max.apply(null, ys) - y);
    var N = function (p) { return [(p[0] - x) / w, (p[1] - y) / h]; };
    var q = pts.map(N), out = [];
    for (var i = 0; i < q.length; i++) {
      var p0 = q[i - 1] || (closed ? q[q.length - 1] : q[i]), p1 = q[i], p2 = q[i + 1] || (closed ? q[0] : q[i]);
      var tx = (p2[0] - p0[0]) / 6, ty = (p2[1] - p0[1]) / 6;
      out.push({ x: p1[0], y: p1[1], ix: p1[0] - tx, iy: p1[1] - ty, ox: p1[0] + tx, oy: p1[1] + ty });
    }
    return { x: x, y: y, w: w, h: h, d: [{ closed: !!closed, pts: out }] };
  };

  /* ================================================================= RD */
  var RD = global.RD = { ents: {}, page: '', file: null, room: null, listeners: {}, undo: [], redo: [], tx: null, readonly: false, status: 'ok' };
  RD.on = function (ev, cb) { (RD.listeners[ev] = RD.listeners[ev] || []).push(cb); };
  RD.emit = function (ev, d) { (RD.listeners[ev] || []).forEach(function (cb) { try { cb(d); } catch (e) { console.error(e); } }); };
  RD.get = function (id) { var e = RD.ents[id]; return e && !e._del ? e : null; };
  RD.byO = function (a, b) { return (a._o || '') < (b._o || '') ? -1 : (a._o || '') > (b._o || '') ? 1 : (a.id < b.id ? -1 : 1); };
  RD.pages = function () { return Object.keys(RD.ents).map(function (k) { return RD.ents[k]; }).filter(function (e) { return e.kind === 'page' && !e._del; }).sort(RD.byO); };
  /** Node di halaman (opsional: anak dari parent tertentu), urut z (bawah → atas). */
  RD.nodes = function (page, parent) {
    page = page || RD.page;
    return Object.keys(RD.ents).map(function (k) { return RD.ents[k]; }).filter(function (e) { return e.kind === 'node' && !e._del && e.page === page && (parent === undefined || (e.parent || '') === parent); }).sort(RD.byO);
  };
  /** Urutan gambar: induk sebelum anak, sesuai z. */
  RD.drawOrder = function (page) {
    var out = [], all = RD.nodes(page), kids = {};
    all.forEach(function (n) { (kids[n.parent || ''] = kids[n.parent || ''] || []).push(n); });
    (function walk(p) { (kids[p] || []).forEach(function (n) { out.push(n); walk(n.id); }); })('');
    return out;
  };
  RD.children = function (id) { return RD.nodes(undefined, id); };
  RD.descendants = function (id) { var out = []; (function w(x) { RD.children(x).forEach(function (c) { out.push(c); w(c.id); }); })(id); return out; };
  RD.topOrder = function (parent) { var s = RD.nodes(undefined, parent || ''); return s.length ? s[s.length - 1]._o : ''; };

  /** Ubah field. Dicatat ke undo (kecuali opt.noUndo), dikirim ke kolaborator, dan dijadwalkan simpan. */
  RD.set = function (id, fields, opt) {
    if (RD.readonly) return;
    opt = opt || {};
    var e = RD.ents[id] || (RD.ents[id] = { id: id });
    var before = {}, after = {}, changed = false;
    Object.keys(fields).forEach(function (k) {
      var v = fields[k];
      if (e[k] === v || (typeof v === 'object' && v !== null && JSON.stringify(e[k]) === JSON.stringify(v))) return;
      before[k] = e[k] === undefined ? null : JSON.parse(JSON.stringify(e[k]));
      after[k] = v;
      e[k] = v; changed = true;
      if (RD.room && !opt.local) RD.room.set(id, k, v);
    });
    if (!changed) return;
    if (!opt.noUndo) {
      if (RD.tx) RD.tx.push({ id: id, before: before, after: after });
      else { RD.undo.push([{ id: id, before: before, after: after }]); RD.redo = []; trimUndo(); }
    }
    if (!opt.local) RD.dirty();
    RD.emit('change', { ids: [id], local: true });
  };
  function trimUndo() { if (RD.undo.length > 200) RD.undo.shift(); }
  RD.begin = function () { if (!RD.tx) RD.tx = []; RD.txDepth = (RD.txDepth || 0) + 1; };
  RD.end = function () {
    if (!RD.tx) return;
    if (--RD.txDepth > 0) return;
    var t = RD.tx; RD.tx = null;
    if (t.length) { RD.undo.push(t); RD.redo = []; trimUndo(); }
  };
  RD.batch = function (fn) { RD.begin(); try { fn(); } finally { RD.end(); } };
  function applyStep(step, dir) {
    step.slice().reverse().forEach(function (c) {
      var f = {}, src = dir === 'undo' ? c.before : c.after;
      Object.keys(src).forEach(function (k) { f[k] = src[k] === null && dir === 'undo' && k !== '_del' ? undefined : src[k]; });
      if (dir === 'undo' && c.before._del === null && c.after._del) f._del = 0;
      RD.set(c.id, f, { noUndo: true });
    });
  }
  RD.doUndo = function () { var s = RD.undo.pop(); if (!s) return false; applyStep(s, 'undo'); RD.redo.push(s); RD.emit('history'); return true; };
  RD.doRedo = function () { var s = RD.redo.pop(); if (!s) return false; s.forEach(function (c) { RD.set(c.id, c.after, { noUndo: true }); }); RD.undo.push(s); RD.emit('history'); return true; };

  RD.add = function (fields) {
    var id = RG.uid('n');
    RD.set(id, Object.assign({ kind: 'node', page: RD.page, parent: '', _o: SN.Collab.between(RD.topOrder(fields.parent || ''), ''), x: 0, y: 0, w: 100, h: 100, rot: 0, opacity: 1, visible: true, locked: false, by: SN.ctx.email }, fields));
    return id;
  };
  RD.remove = function (ids) {
    RD.batch(function () {
      ids.forEach(function (id) {
        RD.descendants(id).forEach(function (c) { RD.set(c.id, { _del: 1 }); });
        RD.set(id, { _del: 1 });
        // konektor yang menempel ikut dihapus
        RD.nodes().forEach(function (n) { if (n.type === 'conn' && ((n.from && n.from.id === id) || (n.to && n.to.id === id))) RD.set(n.id, { _del: 1 }); });
      });
    });
  };
  /** Geser node beserta turunannya. */
  RD.moveBy = function (ids, dx, dy) {
    var seen = {};
    ids.forEach(function (id) {
      [RD.get(id)].concat(RD.descendants(id)).forEach(function (n) {
        if (!n || seen[n.id]) return; seen[n.id] = 1;
        RD.set(n.id, { x: n.x + dx, y: n.y + dy });
      });
    });
  };
  /** Ubah kotak node; anak (frame/grup) diskalakan bila opt.scaleKids. */
  RD.resize = function (id, box, scaleKids) {
    var n = RD.get(id); if (!n) return;
    if (scaleKids || n.type === 'group') {
      var sx = box.w / (n.w || 1), sy = box.h / (n.h || 1);
      RD.descendants(id).forEach(function (c) {
        if (n.type === 'frame' && !scaleKids) return;
        RD.set(c.id, { x: box.x + (c.x - n.x) * sx, y: box.y + (c.y - n.y) * sy, w: Math.max(1, c.w * sx), h: Math.max(1, c.h * sy), fsize: c.fsize ? c.fsize * Math.min(sx, sy) : c.fsize });
      });
    }
    RD.set(id, box);
  };
  RD.duplicate = function (ids, dx, dy) {
    var map = {}, out = [];
    RD.batch(function () {
      ids.forEach(function (id) {
        var copy = function (n, parent) {
          var f = JSON.parse(JSON.stringify(n)); delete f.id;
          f.x += dx; f.y += dy; f.parent = parent; f._o = SN.Collab.between(n._o, nextO(n));
          var nid = RD.add(f); map[n.id] = nid;
          RD.children(n.id).forEach(function (c) { copy(c, nid); });
          return nid;
        };
        var n = RD.get(id); if (n) out.push(copy(n, n.parent || ''));
      });
      // konektor dalam salinan menunjuk ke salinan
      Object.keys(map).forEach(function (old) {
        var c = RD.get(map[old]);
        if (c.type === 'conn') RD.set(c.id, { from: c.from && map[c.from.id] ? Object.assign({}, c.from, { id: map[c.from.id] }) : c.from, to: c.to && map[c.to.id] ? Object.assign({}, c.to, { id: map[c.to.id] }) : c.to });
      });
    });
    return out;
  };
  function nextO(n) { var s = RD.nodes(n.page, n.parent || ''), i = s.findIndex(function (x) { return x.id === n.id; }); return s[i + 1] ? s[i + 1]._o : ''; }
  RD.reorder = function (ids, how) {
    RD.batch(function () {
      ids.forEach(function (id) {
        var n = RD.get(id), sib = RD.nodes(n.page, n.parent || '').filter(function (s) { return s.id !== id; }), i = RD.nodes(n.page, n.parent || '').findIndex(function (s) { return s.id === id; });
        var o;
        if (how === 'front') o = SN.Collab.between(sib.length ? sib[sib.length - 1]._o : '', '');
        else if (how === 'back') o = SN.Collab.between('', sib.length ? sib[0]._o : '');
        else if (how === 'up') { if (i >= sib.length) return; o = SN.Collab.between(sib[i]._o, sib[i + 1] ? sib[i + 1]._o : ''); }
        else { if (i <= 0) return; o = SN.Collab.between(sib[i - 2] ? sib[i - 2]._o : '', sib[i - 1]._o); }
        RD.set(id, { _o: o });
      });
    });
  };
  RD.group = function (ids) {
    var nodes = ids.map(RD.get).filter(Boolean); if (nodes.length < 2) return null;
    var b = RG.union(nodes.map(RG.bounds)), top = nodes.slice().sort(RD.byO).pop();
    var gid;
    RD.batch(function () {
      gid = RD.add({ type: 'group', name: SN.t('r_group'), x: b.x, y: b.y, w: b.w, h: b.h, parent: top.parent || '', _o: SN.Collab.between(top._o, nextO(top)) });
      nodes.sort(RD.byO).forEach(function (n, i) { RD.set(n.id, { parent: gid, _o: SN.Collab.between(i ? RD.topOrder(gid) : '', '') }); });
    });
    return gid;
  };
  RD.ungroup = function (id) {
    var g = RD.get(id); if (!g || (g.type !== 'group' && g.type !== 'frame')) return [];
    var kids = RD.children(id);
    RD.batch(function () {
      var o = g._o;
      kids.forEach(function (k) { o = SN.Collab.between(o, nextO(g)); RD.set(k.id, { parent: g.parent || '', _o: o }); });
      if (g.type === 'group') RD.set(id, { _del: 1 });
    });
    return kids.map(function (k) { return k.id; });
  };
  /** Batas grup mengikuti isinya. */
  RD.fitGroup = function (id) {
    var g = RD.get(id); if (!g || g.type !== 'group') return;
    var kids = RD.children(id); if (!kids.length) { RD.set(id, { _del: 1 }); return; }
    var b = RG.union(kids.map(RG.bounds));
    RD.set(id, { x: b.x, y: b.y, w: b.w, h: b.h }, { noUndo: !!RD.tx ? false : true });
  };
  /** Auto-layout frame (seperti flex): susun anak berurutan. */
  RD.layout = function (id) {
    var f = RD.get(id); if (!f || !f.layout || !f.layout.dir) return;
    var L = f.layout, pad = L.pad || 0, gap = L.gap || 0, kids = RD.children(id).filter(function (k) { return k.visible !== false && k.type !== 'conn'; });
    var pos = (L.dir === 'h' ? f.x : f.y) + pad, cross = 0;
    kids.forEach(function (k) { cross = Math.max(cross, L.dir === 'h' ? k.h : k.w); });
    var total = kids.reduce(function (a, k) { return a + (L.dir === 'h' ? k.w : k.h); }, 0) + gap * Math.max(0, kids.length - 1) + pad * 2;
    kids.forEach(function (k) {
      var f2 = {};
      var avail = (L.dir === 'h' ? f.h : f.w) - pad * 2, sz = L.dir === 'h' ? k.h : k.w;
      var off = L.align === 'center' ? (avail - sz) / 2 : L.align === 'end' ? avail - sz : 0;
      if (L.dir === 'h') { f2.x = pos; f2.y = f.y + pad + (L.hug ? 0 : off); pos += k.w + gap; }
      else { f2.y = pos; f2.x = f.x + pad + (L.hug ? 0 : off); pos += k.h + gap; }
      if (k.x !== f2.x || k.y !== f2.y) { var dx = f2.x - k.x, dy = f2.y - k.y; RD.descendants(k.id).forEach(function (c) { RD.set(c.id, { x: c.x + dx, y: c.y + dy }); }); RD.set(k.id, f2); }
    });
    if (L.hug && kids.length) RD.set(id, L.dir === 'h' ? { w: total, h: cross + pad * 2 } : { h: total, w: cross + pad * 2 });
  };
  /** Komponen: instance mengikuti master (kecuali teks yang diubah di instance). */
  RD.syncInstances = function (masterId) {
    var m = RD.get(masterId); if (!m || !m.comp) return;
    var mk = [m].concat(RD.descendants(masterId));
    var VIS = ['fill', 'stroke', 'sw', 'radius', 'opacity', 'font', 'fsize', 'fweight', 'color', 'align', 'src', 'fx', 'shadow', 'd', 'sides', 'inner', 'visible', 'grad'];
    RD.nodes().filter(function (n) { return n.instOf === masterId; }).forEach(function (inst) {
      var ik = [inst].concat(RD.descendants(inst.id));
      mk.forEach(function (src, i) {
        var dst = ik.find(function (x) { return x.src === src.id; }) || (i === 0 ? inst : null);
        if (!dst) return;
        var f = {};
        VIS.forEach(function (k) { if (src[k] !== undefined && JSON.stringify(src[k]) !== JSON.stringify(dst[k])) f[k] = src[k]; });
        if (src.type === 'text' && !dst.textOverride && src.text !== dst.text) f.text = src.text;
        if (i > 0) { var sx = inst.w / (m.w || 1), sy = inst.h / (m.h || 1); f.w = src.w * sx; f.h = src.h * sy; f.x = inst.x + (src.x - m.x) * sx; f.y = inst.y + (src.y - m.y) * sy; }
        if (Object.keys(f).length) RD.set(dst.id, f, { noUndo: true });
      });
    });
  };
  RD.instantiate = function (masterId, x, y) {
    var m = RD.get(masterId); if (!m) return null;
    var ids = RD.duplicate([masterId], x - m.x, y - m.y), inst = RD.get(ids[0]);
    RD.set(inst.id, { comp: false, instOf: masterId, src: masterId, name: (m.name || SN.t('r_component')) });
    var mk = RD.descendants(masterId), ik = RD.descendants(inst.id);
    ik.forEach(function (n, i) { if (mk[i]) RD.set(n.id, { src: mk[i].id }); });
    return inst.id;
  };

  /* ---------------------------------------------------------- konektor */
  RD.anchor = function (end) {
    if (!end) return null;
    if (!end.id) return { x: end.x, y: end.y };
    var n = RD.get(end.id); if (!n) return { x: end.x || 0, y: end.y || 0 };
    var b = RG.bounds(n), s = end.side || 'auto';
    var pts = { t: [b.x + b.w / 2, b.y], r: [b.x + b.w, b.y + b.h / 2], b: [b.x + b.w / 2, b.y + b.h], l: [b.x, b.y + b.h / 2], c: [b.x + b.w / 2, b.y + b.h / 2] };
    var p = pts[s] || pts.c;
    return { x: p[0], y: p[1], side: s, box: b };
  };
  /** Titik-titik garis konektor (lurus / siku / lengkung) dengan sisi otomatis. */
  RD.connPoints = function (c) {
    var a = RD.anchor(c.from), b = RD.anchor(c.to);
    if (!a || !b) return null;
    var pick = function (end, other) {
      if (!end || !end.id || (end.side && end.side !== 'auto')) return RD.anchor(end);
      var n = RD.get(end.id); if (!n) return RD.anchor(end);
      var bb = RG.bounds(n), cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2, dx = other.x - cx, dy = other.y - cy;
      var side = Math.abs(dx) / (bb.w || 1) > Math.abs(dy) / (bb.h || 1) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'b' : 't');
      return RD.anchor({ id: end.id, side: side });
    };
    var A = pick(c.from, b), B = pick(c.to, A);
    if (c.style === 'elbow') {
      var hv = A.side === 'l' || A.side === 'r';
      var mid = hv ? [[(A.x + B.x) / 2, A.y], [(A.x + B.x) / 2, B.y]] : [[A.x, (A.y + B.y) / 2], [B.x, (A.y + B.y) / 2]];
      return { pts: [[A.x, A.y]].concat(mid, [[B.x, B.y]]), A: A, B: B };
    }
    return { pts: [[A.x, A.y], [B.x, B.y]], A: A, B: B, curve: c.style === 'curve' };
  };

  /* ---------------------------------------------------------- simpan & kolaborasi */
  var saveTimer = null, saving = false, again = false;
  function setStatus(s) { if (RD.status !== s) { RD.status = s; RD.emit('status', s); } }
  RD.dirty = function () { clearTimeout(saveTimer); saveTimer = setTimeout(RD.save, 3000); setStatus('saving'); RD.emit('dirty'); };
  RD.snapshot = function () { var st = RD.room ? RD.room.state() : { clocks: RD._clocks || {}, since: RD._since || 0 }; return { v: 1, app: 'rupa', ents: RD.ents, clocks: st.clocks, since: st.since }; };
  RD.save = async function (manual) {
    clearTimeout(saveTimer);
    if (!RD.file || RD.readonly) return;
    if (saving) { again = true; return; }
    saving = true;
    try {
      var thumb = global.RR && RR.thumbnail ? RR.thumbnail() : undefined;
      var r = await SN.Docs.save({ id: RD.file.id || undefined, filename: RD.file.filename || undefined, name: RD.file.name, type: TYPE, content: RD.snapshot(), thumbnail: thumb, force: true, share_token: RD.file.share || undefined, reason: manual ? 'manual' : 'auto' });
      var first = !RD.file.id;
      RD.file.id = r.id; RD.file.filename = r.filename;
      if (first) join();
      setStatus('ok');
    } catch (e) {
      setStatus(e.network ? 'offline' : 'error');
      saveTimer = setTimeout(RD.save, e.network ? 8000 : 20000);
    } finally { saving = false; if (again) { again = false; RD.save(); } }
  };
  RD.list = async function () {
    var mine = [], shared = [];
    try { mine = await SN.Docs.list(TYPE); } catch (e) {}
    try { var s = await SN.Docs.sharedWithMe(); shared = (s.projects || s.items || []).filter(function (p) { return p.type === TYPE; }).map(function (p) { return Object.assign({}, p, { share: p.token || p.share_token, shared: true }); }); } catch (e) {}
    return mine.concat(shared);
  };
  RD.open = async function (file, content) {
    if (RD.room) { RD.room.leave(); RD.room = null; }
    RD.file = file; RD.readonly = false; RD.undo = []; RD.redo = [];
    var c = content;
    if (!c && file.id) { var p = await SN.Docs.load(file.id, file.share); c = p.content || {}; file.filename = p.filename; file.name = p.name; }
    c = c || {};
    RD.ents = c.ents || {};
    Object.keys(RD.ents).forEach(function (k) { RD.ents[k].id = k; });
    RD._clocks = c.clocks || {}; RD._since = c.since || 0;
    if (!RD.pages().length) RD.set(RG.uid('pg'), { kind: 'page', name: SN.t('r_page') + ' 1', _o: 'i', bg: '' }, { noUndo: true, local: !file.id });
    RD.page = RD.pages()[0].id;
    if (file.id) join();
    RD.emit('open', file);
  };
  RD.newFile = async function (name, preset) {
    await RD.open({ name: name || SN.t('r_untitled') }, null);
    RD.save();
    return RD.file;
  };
  function join() {
    RD.room = SN.Collab.join({
      docId: RD.file.id, share: RD.file.share, clocks: RD._clocks, since: RD._since,
      onOps: function (changes) {
        changes.forEach(function (c) { var e = RD.ents[c.id] || (RD.ents[c.id] = { id: c.id }); e[c.k] = c.v; if (global.RR) RR.invalidate(c.id); });
        RD.emit('change', { ids: changes.map(function (c) { return c.id; }), local: false });
      },
      onPresence: function (peers) { RD.emit('presence', peers); },
      onStatus: function (s) { if (s === 'readonly' || s === 'denied') { RD.readonly = true; RD.emit('readonly'); } if (s === 'offline') setStatus('offline'); else if (RD.status === 'offline') setStatus('ok'); }
    });
  }
  global.addEventListener('beforeunload', function () { if (RD.status === 'saving') RD.save(); });

  /* ================================================================= RR */
  var RR = global.RR = { view: { x: 0, y: 0, z: 1 }, sel: [], hover: null, overlay: [], imgs: {}, fxCache: {}, peers: [], showGrid: false, layoutGrid: false };
  var cv, ctx, dpr = 1, raf = 0, dirtyAll = true;
  RR.init = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    var ro = new ResizeObserver(function () { RR.resize(); }); ro.observe(cv.parentNode);
    RR.resize();
  };
  RR.resize = function () {
    dpr = Math.min(2, global.devicePixelRatio || 1);
    var r = cv.parentNode.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    RR.draw();
  };
  RR.size = function () { return { w: cv.width / dpr, h: cv.height / dpr }; };
  RR.toWorld = function (sx, sy) { var v = RR.view; return { x: (sx - v.x) / v.z, y: (sy - v.y) / v.z }; };
  RR.toScreen = function (x, y) { var v = RR.view; return { x: x * v.z + v.x, y: y * v.z + v.y }; };
  RR.invalidate = function (id) { if (id && RR.fxCache[id]) delete RR.fxCache[id]; RR.draw(); };
  RR.draw = function () { if (!raf) raf = requestAnimationFrame(frame); };
  RR.drawNow = frame;

  function img(src, id) {
    if (!src) return null;
    var c = RR.imgs[src];
    if (c) return c.ok ? c.el : null;
    c = RR.imgs[src] = { el: new Image(), ok: false };
    c.el.onload = function () { c.ok = true; RR.draw(); RD.emit('imgload', id); };
    c.el.src = src;
    return null;
  }
  RR.image = img;
  /** Gambar dengan penyesuaian (kecerahan, kontras, saturasi, …) dihitung per-piksel & di-cache — sama di semua platform. */
  function filtered(n, el) {
    var fx = n.fx; if (!fx || !Object.keys(fx).some(function (k) { return fx[k]; })) return el;
    var key = n.src.length + ':' + n.src.slice(-32) + JSON.stringify(fx);
    var c = RR.fxCache[n.id];
    if (c && c.key === key) return c.canvas;
    var w = el.naturalWidth || el.width, h = el.naturalHeight || el.height, s = Math.min(1, 2048 / Math.max(w, h));
    var can = document.createElement('canvas'); can.width = Math.max(1, Math.round(w * s)); can.height = Math.max(1, Math.round(h * s));
    var g = can.getContext('2d', { willReadFrequently: true });
    g.drawImage(el, 0, 0, can.width, can.height);
    RR.applyFx(g, can.width, can.height, fx);
    RR.fxCache[n.id] = { key: key, canvas: can };
    return can;
  }
  RR.applyFx = function (g, w, h, fx) {
    var im = g.getImageData(0, 0, w, h), d = im.data;
    var br = (fx.brightness || 0) * 2.55, ct = (fx.contrast || 0) / 100 + 1, sat = (fx.saturate || 0) / 100 + 1, hue = (fx.hue || 0) * Math.PI / 180, ex = Math.pow(2, (fx.exposure || 0) / 50);
    var temp = (fx.temp || 0) * 0.6, tint = (fx.tint || 0) * 0.6, vig = (fx.vignette || 0) / 100;
    var cosH = Math.cos(hue), sinH = Math.sin(hue);
    var cx = w / 2, cy = h / 2, maxd = Math.hypot(cx, cy);
    for (var i = 0; i < d.length; i += 4) {
      var r = d[i] * ex, gg = d[i + 1] * ex, b = d[i + 2] * ex;
      r += br + temp; gg += br + tint; b += br - temp;
      r = (r - 128) * ct + 128; gg = (gg - 128) * ct + 128; b = (b - 128) * ct + 128;
      var l = 0.299 * r + 0.587 * gg + 0.114 * b;
      r = l + (r - l) * sat; gg = l + (gg - l) * sat; b = l + (b - l) * sat;
      if (hue) {
        var nr = r * (0.299 + 0.701 * cosH + 0.168 * sinH) + gg * (0.587 - 0.587 * cosH + 0.330 * sinH) + b * (0.114 - 0.114 * cosH - 0.497 * sinH);
        var ng = r * (0.299 - 0.299 * cosH - 0.328 * sinH) + gg * (0.587 + 0.413 * cosH + 0.035 * sinH) + b * (0.114 - 0.114 * cosH + 0.292 * sinH);
        var nb = r * (0.299 - 0.3 * cosH + 1.25 * sinH) + gg * (0.587 - 0.588 * cosH - 1.05 * sinH) + b * (0.114 + 0.886 * cosH - 0.203 * sinH);
        r = nr; gg = ng; b = nb;
      }
      if (fx.grayscale) { var y = 0.299 * r + 0.587 * gg + 0.114 * b; r = gg = b = y; }
      if (fx.sepia) { var sr = r * 0.393 + gg * 0.769 + b * 0.189, sg = r * 0.349 + gg * 0.686 + b * 0.168, sb = r * 0.272 + gg * 0.534 + b * 0.131; r = sr; gg = sg; b = sb; }
      if (fx.invert) { r = 255 - r; gg = 255 - gg; b = 255 - b; }
      if (vig) { var px = (i / 4) % w, py = Math.floor(i / 4 / w), f = 1 - vig * Math.pow(Math.hypot(px - cx, py - cy) / maxd, 2); r *= f; gg *= f; b *= f; }
      d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
    g.putImageData(im, 0, 0);
    if (fx.blur > 0) { var tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; var tg = tmp.getContext('2d'); tg.drawImage(g.canvas, 0, 0); RR.boxBlur(g, tmp, w, h, Math.round(fx.blur)); }
    if (fx.sharpen > 0) RR.sharpen(g, w, h, fx.sharpen / 100);
  };
  RR.boxBlur = function (g, src, w, h, r) {
    if ('filter' in g && CSS.supports && CSS.supports('filter', 'blur(1px)')) { g.clearRect(0, 0, w, h); g.filter = 'blur(' + r + 'px)'; g.drawImage(src, 0, 0); g.filter = 'none'; return; }
    // cadangan tanpa ctx.filter: perkecil-perbesar berulang
    var s = Math.max(1, r), tw = Math.max(1, Math.round(w / s)), th = Math.max(1, Math.round(h / s)), t = document.createElement('canvas');
    t.width = tw; t.height = th; var tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(src, 0, 0, tw, th);
    g.clearRect(0, 0, w, h); g.imageSmoothingQuality = 'high'; g.drawImage(t, 0, 0, w, h);
  };
  RR.sharpen = function (g, w, h, amt) {
    var im = g.getImageData(0, 0, w, h), d = im.data, o = new Uint8ClampedArray(d);
    for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) for (var c = 0; c < 3; c++) {
      var i = (y * w + x) * 4 + c;
      var v = o[i] * (1 + 4 * amt) - amt * (o[i - 4] + o[i + 4] + o[i - w * 4] + o[i + w * 4]);
      d[i] = v;
    }
    g.putImageData(im, 0, 0);
  };

  var checkerPat = null;
  function checker(g) {
    if (!checkerPat) { var c = document.createElement('canvas'); c.width = c.height = 16; var x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#d9dbe0'; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8); checkerPat = c; }
    return g.createPattern(checkerPat, 'repeat');
  }
  function RT_MODE() { return global.RT && RT.mode; }
  function paint(n, kind) {
    var v = n[kind];
    if (!v || v === 'none') return null;
    if (typeof v === 'string') return v;
    if (v.type === 'linear' || v.type === 'radial') {
      var g = v.type === 'linear' ? ctx.createLinearGradient(n.x + n.w * (v.x1 || 0), n.y + n.h * (v.y1 || 0), n.x + n.w * (v.x2 == null ? 1 : v.x2), n.y + n.h * (v.y2 == null ? 1 : v.y2))
        : ctx.createRadialGradient(n.x + n.w / 2, n.y + n.h / 2, 0, n.x + n.w / 2, n.y + n.h / 2, Math.max(n.w, n.h) / 2);
      (v.stops || []).forEach(function (s) { try { g.addColorStop(s[0], s[1]); } catch (e) {} });
      return g;
    }
    return null;
  }
  function textLines(n, g) {
    g.font = (n.italic ? 'italic ' : '') + (n.fweight || 400) + ' ' + (n.fsize || 16) + 'px ' + (n.font || 'Inter, system-ui, sans-serif');
    var words = String(n.text || '').split('\n'), lines = [], maxW = n.autoW ? Infinity : Math.max(4, n.w - (n.type === 'sticky' ? 24 : n.type === 'text' ? 0 : 16));
    words.forEach(function (para) {
      var cur = '';
      para.split(/(\s+)/).forEach(function (wd) {
        var test = cur + wd;
        if (g.measureText(test).width > maxW && cur.trim()) { lines.push(cur); cur = wd.replace(/^\s+/, ''); } else cur = test;
      });
      lines.push(cur);
    });
    return lines;
  }
  RR.textLines = textLines;
  RR.measureText = function (n) {
    var g = ctx || document.createElement('canvas').getContext('2d');
    var lines = textLines(Object.assign({}, n, { autoW: true }), g), lh = (n.fsize || 16) * (n.lh || 1.3);
    var w = Math.max.apply(null, lines.map(function (l) { return g.measureText(l).width; }).concat([4]));
    return { w: Math.ceil(w + 2), h: Math.ceil(lines.length * lh) };
  };
  function drawText(n, g, box) {
    var lines = textLines(n, g), fs = n.fsize || 16, lh = fs * (n.lh || 1.3);
    g.fillStyle = n.color || (n.type === 'sticky' ? '#2b2b2b' : '#111');
    g.textBaseline = 'top';
    var al = n.align || (n.type === 'sticky' || n.type === 'rect' || n.type === 'ellipse' || n.type === 'polygon' ? 'center' : 'left');
    var pad = n.type === 'text' ? 0 : n.type === 'sticky' ? 12 : 8;
    var th = lines.length * lh, top = box.y + (n.type === 'text' ? 0 : n.valign === 'top' ? pad : Math.max(pad, (box.h - th) / 2));
    if (n.ls) { try { g.letterSpacing = n.ls + 'px'; } catch (e) {} }
    lines.forEach(function (l, i) {
      var w = g.measureText(l).width, x = al === 'center' ? box.x + (box.w - w) / 2 : al === 'right' ? box.x + box.w - w - (n.type === 'text' ? 0 : pad) : box.x + (n.type === 'text' ? 0 : pad);
      g.fillText(l, x, top + i * lh + (lh - fs) / 2);
      if (n.underline) g.fillRect(x, top + i * lh + (lh + fs) / 2, w, Math.max(1, fs / 14));
      if (n.strike) g.fillRect(x, top + i * lh + lh / 2, w, Math.max(1, fs / 14));
    });
    if (n.ls) { try { g.letterSpacing = '0px'; } catch (e) {} }
  }

  /** Gambar satu node ke konteks g (dipakai kanvas, ekspor, thumbnail). */
  RR.drawNode = function (g, n, opt) {
    opt = opt || {};
    if (n.visible === false || n._del) return;
    if (opt.editing === n.id && n.type === 'text') return;
    g.save();
    g.globalAlpha *= n.opacity == null ? 1 : n.opacity;
    if (n.blend && n.blend !== 'normal') g.globalCompositeOperation = n.blend;
    var cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    if (n.rot) { g.translate(cx, cy); g.rotate(RG.rad(n.rot)); g.translate(-cx, -cy); }
    if (n.flipX || n.flipY) { g.translate(cx, cy); g.scale(n.flipX ? -1 : 1, n.flipY ? -1 : 1); g.translate(-cx, -cy); }
    if (n.shadow && n.shadow.on) { g.shadowColor = n.shadow.color || 'rgba(0,0,0,.25)'; g.shadowBlur = n.shadow.blur || 12; g.shadowOffsetX = n.shadow.x || 0; g.shadowOffsetY = n.shadow.y == null ? 4 : n.shadow.y; }
    if (n.lblur) { try { g.filter = 'blur(' + n.lblur + 'px)'; } catch (e) {} }
    var fill = paint(n, 'fill'), stroke = paint(n, 'stroke'), sw = n.sw || 0;
    var path = function () { g.beginPath(); if (n.type === 'rect' || n.type === 'frame' || n.type === 'sticky') { var r = Math.min(n.radius || 0, n.w / 2, n.h / 2); if (g.roundRect && r) g.roundRect(n.x, n.y, n.w, n.h, r); else g.rect(n.x, n.y, n.w, n.h); } else RG.pathTo(g, RG.shapePath(n), n); };
    if (n.dash) g.setLineDash(n.dash === 'dot' ? [Math.max(1, sw), sw * 2] : [sw * 4, sw * 2.5]);
    g.lineJoin = n.join || 'round'; g.lineCap = n.cap || 'round';
    switch (n.type) {
      case 'image': case 'raster':
        var live = RR.rasters[n.id] && RR.rasters[n.id].live;   // sedang dilukis: tampilkan kanvas kerja
        var el = live ? RR.rasters[n.id].canvas : img(n.src, n.id);
        if (el) {
          var src = live ? el : filtered(n, el);
          g.save();
          if (n.radius) { g.beginPath(); if (g.roundRect) g.roundRect(n.x, n.y, n.w, n.h, n.radius); else g.rect(n.x, n.y, n.w, n.h); g.clip(); }
          // Papan catur di belakang lapisan yang bisa transparan (hanya di editor, tidak ikut ekspor).
          if (!opt.export && (n.type === 'raster' || /^data:image\/(png|webp)/.test(n.src || '')) && RT_MODE() === 'photo') { g.save(); g.fillStyle = checker(g); g.fillRect(n.x, n.y, n.w, n.h); g.restore(); }
          var cr = n.crop;   // {x,y,w,h} 0..1 dari gambar sumber
          var sw0 = src.naturalWidth || src.width, sh0 = src.naturalHeight || src.height;
          if (cr) g.drawImage(src, cr.x * sw0, cr.y * sh0, cr.w * sw0, cr.h * sh0, n.x, n.y, n.w, n.h); else g.drawImage(src, n.x, n.y, n.w, n.h);
          g.restore();
        } else if (!opt.export) { g.fillStyle = 'rgba(128,128,128,.15)'; g.fillRect(n.x, n.y, n.w, n.h); }
        if (stroke && sw) { g.strokeStyle = stroke; g.lineWidth = sw; g.strokeRect(n.x, n.y, n.w, n.h); }
        break;
      case 'text':
        g.shadowColor = n.shadow && n.shadow.on ? g.shadowColor : 'transparent';
        if (fill && n.bgText) { g.fillStyle = fill; g.fillRect(n.x - 4, n.y - 2, n.w + 8, n.h + 4); }
        drawText(n, g, n);
        break;
      case 'sticky':
        g.shadowColor = 'rgba(0,0,0,.16)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
        path(); g.fillStyle = fill || '#ffe58a'; g.fill();
        g.shadowColor = 'transparent';
        drawText(n, g, n);
        if (n.author && RR.view.z > 0.4) { g.font = '500 10px Inter, sans-serif'; g.fillStyle = 'rgba(0,0,0,.45)'; g.textBaseline = 'bottom'; g.fillText(n.author, n.x + 10, n.y + n.h - 6); }
        if (n.votes && Object.keys(n.votes).length) { var vc = Object.keys(n.votes).length; g.fillStyle = '#e8590c'; g.beginPath(); g.arc(n.x + n.w - 14, n.y + 14, 10, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = '700 11px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(vc, n.x + n.w - 14, n.y + 14); g.textAlign = 'left'; }
        break;
      case 'conn':
        var cp = RD.connPoints(n); if (!cp) break;
        g.strokeStyle = stroke || '#5b6175'; g.lineWidth = sw || 2;
        g.beginPath(); g.moveTo(cp.pts[0][0], cp.pts[0][1]);
        if (cp.curve) { var a = cp.pts[0], b = cp.pts[1], hv = cp.A.side === 'l' || cp.A.side === 'r', dd = Math.max(40, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.5); g.bezierCurveTo(a[0] + (hv ? (cp.A.side === 'r' ? dd : -dd) : 0), a[1] + (hv ? 0 : (cp.A.side === 'b' ? dd : -dd)), b[0] + ((cp.B.side === 'r') ? dd : cp.B.side === 'l' ? -dd : 0), b[1] + (cp.B.side === 'b' ? dd : cp.B.side === 't' ? -dd : 0), b[0], b[1]); }
        else cp.pts.slice(1).forEach(function (p) { g.lineTo(p[0], p[1]); });
        g.stroke();
        var tip = function (p, q) { var ang = Math.atan2(p[1] - q[1], p[0] - q[0]), L = 8 + (sw || 2) * 2; g.setLineDash([]); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] - L * Math.cos(ang - 0.45), p[1] - L * Math.sin(ang - 0.45)); g.lineTo(p[0] - L * Math.cos(ang + 0.45), p[1] - L * Math.sin(ang + 0.45)); g.closePath(); g.fillStyle = g.strokeStyle; g.fill(); };
        var P = cp.pts;
        if (n.endArrow !== false) tip(P[P.length - 1], cp.curve ? [P[1][0] + (cp.B.side === 'r' ? 30 : cp.B.side === 'l' ? -30 : 0), P[1][1] + (cp.B.side === 'b' ? 30 : cp.B.side === 't' ? -30 : 0)] : P[P.length - 2]);
        if (n.startArrow) tip(P[0], P[1]);
        if (n.text) { var mi = Math.floor((P.length - 1) / 2), m1 = P[mi], m2 = P[mi + 1] || m1, mx = (m1[0] + m2[0]) / 2, my = (m1[1] + m2[1]) / 2; g.font = '500 13px Inter, sans-serif'; var tw = g.measureText(n.text).width; g.fillStyle = opt.export ? '#fff' : (RR.bg || '#fff'); g.fillRect(mx - tw / 2 - 5, my - 10, tw + 10, 20); g.fillStyle = RR.dark && !opt.export ? '#d6d8e0' : '#333'; g.textBaseline = 'middle'; g.fillText(n.text, mx - tw / 2, my); }
        break;
      case 'group': break;
      case 'frame':
        g.save(); g.shadowColor = 'transparent';
        path(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke && sw) { g.strokeStyle = stroke; g.lineWidth = sw; g.stroke(); }
        g.restore();
        if (!opt.export && !opt.noLabel && !n.parent) { g.save(); g.font = '500 ' + (12 / RR.view.z) + 'px Inter, sans-serif'; g.fillStyle = n.section ? (n.fill || '#888') : (RR.dark ? '#a3a8b8' : '#6b7080'); g.textBaseline = 'bottom'; g.fillText((n.comp ? '❖ ' : n.instOf ? '◇ ' : '') + (n.name || SN.t('r_frame')), n.x, n.y - 4 / RR.view.z); g.restore(); }
        break;
      case 'arrow': case 'line':
        g.strokeStyle = stroke || '#1b1e2b'; g.lineWidth = sw || 2;
        path(); g.stroke();
        if (n.type === 'arrow') { var s0 = RG.shapePath(n)[0].pts, e1 = { x: n.x + s0[1].x * n.w, y: n.y + s0[1].y * n.h }, e0 = { x: n.x + s0[0].x * n.w, y: n.y + s0[0].y * n.h }, an = Math.atan2(e1.y - e0.y, e1.x - e0.x), L2 = 10 + (sw || 2) * 2; g.setLineDash([]); g.beginPath(); g.moveTo(e1.x, e1.y); g.lineTo(e1.x - L2 * Math.cos(an - 0.45), e1.y - L2 * Math.sin(an - 0.45)); g.lineTo(e1.x - L2 * Math.cos(an + 0.45), e1.y - L2 * Math.sin(an + 0.45)); g.closePath(); g.fillStyle = g.strokeStyle; g.fill(); }
        break;
      default:
        path();
        if (fill) { g.fillStyle = fill; g.fill(n.evenodd ? 'evenodd' : 'nonzero'); }
        g.shadowColor = 'transparent';
        if (stroke && sw) { g.strokeStyle = stroke; g.lineWidth = sw; g.stroke(); }
        if (n.text) drawText(n, g, n);
    }
    g.restore();
  };

  /** Klip frame untuk anak-anaknya. */
  function clipChain(g, n) {
    var p = RD.get(n.parent), chain = [];
    while (p) { if (p.type === 'frame' && p.clip !== false) chain.unshift(p); p = RD.get(p.parent); }
    chain.forEach(function (f) { g.beginPath(); var r = Math.min(f.radius || 0, f.w / 2, f.h / 2); if (g.roundRect && r) g.roundRect(f.x, f.y, f.w, f.h, r); else g.rect(f.x, f.y, f.w, f.h); g.clip(); });
  }
  RR.rasters = {};   // id → {canvas} lapisan yang sedang dilukis

  function frame() {
    raf = 0;
    if (!ctx) return;
    var v = RR.view, W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var pg = RD.get(RD.page);
    RR.dark = document.documentElement.getAttribute('data-sn-theme') === 'dark';
    RR.bg = (pg && pg.bg) || (RR.dark ? '#16181d' : '#eef0f4');
    ctx.fillStyle = RR.bg; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(v.z * dpr, 0, 0, v.z * dpr, v.x * dpr, v.y * dpr);
    var view = { x: -v.x / v.z, y: -v.y / v.z, w: W / dpr / v.z, h: H / dpr / v.z };
    if (RR.showGrid || v.z > 6) drawGrid(view);
    RD.drawOrder().forEach(function (n) {
      if (n.type !== 'conn' && !RG.inter(RG.bounds(n), view) && n.type !== 'group') return;
      ctx.save();
      if (n.parent) clipChain(ctx, n);
      RR.drawNode(ctx, n, { editing: RR.editing });
      ctx.restore();
      if (n.type === 'frame' && RR.layoutGrid && n.grid) drawLayoutGrid(n);
    });
    drawOverlay();
    if (RR.onAfterDraw) RR.onAfterDraw(ctx, v);
  }
  function drawGrid(view) {
    var step = RR.gridSize || 8; while (step * RR.view.z < 8) step *= 2;
    ctx.save(); ctx.lineWidth = 1 / RR.view.z; ctx.strokeStyle = RR.dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
    ctx.beginPath();
    for (var x = Math.floor(view.x / step) * step; x < view.x + view.w; x += step) { ctx.moveTo(x, view.y); ctx.lineTo(x, view.y + view.h); }
    for (var y = Math.floor(view.y / step) * step; y < view.y + view.h; y += step) { ctx.moveTo(view.x, y); ctx.lineTo(view.x + view.w, y); }
    ctx.stroke(); ctx.restore();
  }
  function drawLayoutGrid(f) {
    var g = f.grid, cols = g.cols || 12, gut = g.gutter || 20, mar = g.margin || 20, cw = (f.w - mar * 2 - gut * (cols - 1)) / cols;
    ctx.save(); ctx.fillStyle = 'rgba(232, 89, 12, .08)';
    for (var i = 0; i < cols; i++) ctx.fillRect(f.x + mar + i * (cw + gut), f.y, cw, f.h);
    ctx.restore();
  }
  function drawOverlay() {
    var z = RR.view.z, acc = getComputedStyle(document.documentElement).getPropertyValue('--r-mode').trim() || '#e8590c';
    ctx.save();
    ctx.lineWidth = 1.5 / z;
    if (RR.hover && RR.sel.indexOf(RR.hover) < 0) { var hn = RD.get(RR.hover); if (hn && hn.type !== 'conn') { ctx.strokeStyle = acc; outline(hn); } }
    // seleksi
    var selNodes = RR.sel.map(RD.get).filter(Boolean);
    selNodes.forEach(function (n) { ctx.strokeStyle = acc; if (n.type === 'conn') { var cp = RD.connPoints(n); if (cp) { ctx.setLineDash([4 / z, 3 / z]); ctx.beginPath(); ctx.moveTo(cp.pts[0][0], cp.pts[0][1]); cp.pts.slice(1).forEach(function (p) { ctx.lineTo(p[0], p[1]); }); ctx.stroke(); ctx.setLineDash([]); [cp.pts[0], cp.pts[cp.pts.length - 1]].forEach(function (p) { handle(p[0], p[1], true); }); } } else outline(n); });
    if (RR.handles && selNodes.length && !RR.nodeEdit) {
      var hb = RR.handles();
      if (hb) {
        ctx.strokeStyle = acc;
        if (selNodes.length > 1 || hb.rot === undefined) { ctx.setLineDash([3 / z, 3 / z]); ctx.strokeRect(hb.x, hb.y, hb.w, hb.h); ctx.setLineDash([]); }
        hb.points.forEach(function (p) { handle(p.x, p.y); });
        if (hb.rotHandle) { ctx.beginPath(); ctx.arc(hb.rotHandle.x, hb.rotHandle.y, 4.5 / z, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); }
        // label ukuran
        if (RR.showSize !== false) { var b = RG.union(selNodes.map(RG.bounds)), label = Math.round(b.w) + ' × ' + Math.round(b.h); ctx.font = '600 ' + (11 / z) + 'px Inter, sans-serif'; var tw = ctx.measureText(label).width; ctx.fillStyle = acc; var lx = b.x + b.w / 2 - tw / 2 - 5 / z, ly = b.y + b.h + 8 / z; if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(lx, ly, tw + 10 / z, 17 / z, 4 / z); ctx.fill(); } else ctx.fillRect(lx, ly, tw + 10 / z, 17 / z); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(label, lx + 5 / z, ly + 8.5 / z); }
      }
    }
    // overlay alat (marquee, garis bantu, pratinjau pena, dst.)
    RR.overlay.forEach(function (o) { try { o(ctx, z, acc); } catch (e) {} });
    // kursor kolaborator
    RR.peers.forEach(function (p) {
      var c = p.cursor; if (!c || c.page !== RD.page || c.x == null) return;
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1 / z, 1 / z);
      ctx.fillStyle = p.color || '#888'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 16); ctx.lineTo(4.5, 12); ctx.lineTo(8, 19); ctx.lineTo(10.5, 18); ctx.lineTo(7, 11); ctx.lineTo(12.5, 11); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      var name = p.display_name || p.user_email || '';
      ctx.font = '600 11px Inter, sans-serif'; var tw2 = ctx.measureText(name).width;
      ctx.fillRect(12, 18, tw2 + 10, 18); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(name, 17, 27);
      if (c.sel && c.sel.length) { ctx.restore(); ctx.save(); ctx.strokeStyle = p.color || '#888'; ctx.lineWidth = 2 / z; c.sel.forEach(function (id) { var n = RD.get(id); if (n) outline(n); }); }
      ctx.restore();
    });
    ctx.restore();
    function outline(n) { var c = RG.corners(n); ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y); c.slice(1).forEach(function (p) { ctx.lineTo(p.x, p.y); }); ctx.closePath(); ctx.stroke(); }
    function handle(x, y, round) { var s = 7 / z; ctx.fillStyle = '#fff'; ctx.lineWidth = 1.5 / z; ctx.beginPath(); if (round) ctx.arc(x, y, s / 1.6, 0, Math.PI * 2); else ctx.rect(x - s / 2, y - s / 2, s, s); ctx.fill(); ctx.stroke(); }
  }

  /** Hit-test: node teratas di titik dunia (x,y). opt.deep = masuk ke dalam grup. */
  RR.hit = function (x, y, opt) {
    opt = opt || {};
    var list = RD.drawOrder().reverse(), tol = 5 / RR.view.z;
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (n.visible === false || (n.locked && !opt.locked)) continue;
      if (opt.skip && opt.skip.indexOf(n.id) >= 0) continue;
      if (hitNode(n, x, y, tol)) {
        // klik di dalam frame tanpa mengenai anak memilih frame hanya bila di label/tepi atau frame tak berisi
        if (!opt.deep) { var top = n, p = RD.get(n.parent); while (p) { if (p.type === 'group' || (p.type === 'frame' && opt.frameAsGroup)) top = p; p = RD.get(p.parent); } return top; }
        return n;
      }
    }
    return null;
  };
  function hitNode(n, x, y, tol) {
    if (n.type === 'group') return false;
    if (n.type === 'conn') { var cp = RD.connPoints(n); if (!cp) return false; for (var i = 1; i < cp.pts.length; i++) if (RG.distSeg(x, y, cp.pts[i - 1], cp.pts[i]) < tol + (n.sw || 2)) return true; return false; }
    var p = RG.toLocal(n, x, y);
    if (p.x < n.x - tol || p.x > n.x + n.w + tol || p.y < n.y - tol || p.y > n.y + n.h + tol) return false;
    if (n.type === 'frame' && n.parent === '' && RD.children(n.id).length) return true;
    if (n.type === 'path' || n.type === 'line' || n.type === 'arrow' || n.type === 'polygon' || n.type === 'star' || n.type === 'ellipse') {
      var rings = RG.flatten(n, 8);
      var filled = n.fill && n.fill !== 'none' && n.type !== 'line' && n.type !== 'arrow';
      if (filled && rings.some(function (r) { return RG.pointInPoly(x, y, r); })) return true;
      var lim = tol + (n.sw || 1) / 2 + 2 / RR.view.z;
      return rings.some(function (r) { for (var i = 1; i < r.length; i++) if (RG.distSeg(x, y, r[i - 1], r[i]) < lim) return true; return false; });
    }
    return true;
  }
  RR.inRect = function (r) {
    return RD.nodes(undefined, '').filter(function (n) { return n.visible !== false && !n.locked && RG.inter(RG.bounds(n), r) && (n.type !== 'frame' || (r.x <= n.x && r.y <= n.y && r.x + r.w >= n.x + n.w && r.y + r.h >= n.y + n.h)); })
      .concat(RD.nodes().filter(function (n) { var p = RD.get(n.parent); return p && p.type === 'frame' && !p.parent && n.visible !== false && !n.locked && r.x <= n.x && r.y <= n.y && r.x + r.w >= n.x + n.w && r.y + r.h >= n.y + n.h && !(r.x <= p.x && r.y <= p.y && r.x + r.w >= p.x + p.w && r.y + r.h >= p.y + p.h); }));
  };

  /** Render node/area ke kanvas baru (ekspor PNG/JPG, thumbnail). */
  RR.renderArea = function (box, scale, opt) {
    opt = opt || {};
    var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(box.w * scale)); c.height = Math.max(1, Math.round(box.h * scale));
    var g = c.getContext('2d');
    if (opt.bg) { g.fillStyle = opt.bg; g.fillRect(0, 0, c.width, c.height); }
    g.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
    var only = opt.ids ? {} : null;
    if (opt.ids) opt.ids.forEach(function (id) { only[id] = 1; RD.descendants(id).forEach(function (d) { only[d.id] = 1; }); });
    RD.drawOrder().forEach(function (n) { if (only && !only[n.id]) return; g.save(); if (n.parent) clipChain(g, n); RR.drawNode(g, n, { export: true, noLabel: true }); g.restore(); });
    return c;
  };
  RR.thumbnail = function () {
    var ns = RD.nodes(); if (!ns.length) return undefined;
    var b = RG.union(ns.map(RG.bounds)); if (!b || !b.w) return undefined;
    var s = Math.min(1, 480 / Math.max(b.w, b.h));
    try { return RR.renderArea(b, s, { bg: RR.bg || '#fff' }).toDataURL('image/jpeg', 0.7); } catch (e) { return undefined; }
  };
  RR.fit = function (box, pad) {
    var s = RR.size(); pad = pad == null ? 60 : pad;
    if (!box || !box.w) { RR.view = { x: s.w / 2, y: s.h / 2, z: 1 }; RR.draw(); return; }
    var z = Math.min(8, Math.max(0.02, Math.min((s.w - pad * 2) / box.w, (s.h - pad * 2) / box.h)));
    RR.view = { z: z, x: s.w / 2 - (box.x + box.w / 2) * z, y: s.h / 2 - (box.y + box.h / 2) * z };
    RR.draw(); RD.emit('view');
  };
  RR.zoomAt = function (sx, sy, factor) {
    var v = RR.view, z = Math.min(64, Math.max(0.02, v.z * factor));
    var w = RR.toWorld(sx, sy);
    RR.view = { z: z, x: sx - w.x * z, y: sy - w.y * z };
    RR.draw(); RD.emit('view');
  };
})(window);
