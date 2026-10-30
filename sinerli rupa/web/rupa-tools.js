/* Sinerli Rupa — Copyright © 2026 Gadtan x Gallen. All rights reserved.
 * RT — alat kanvas & interaksi pointer/keyboard/sentuh. */
(function (global) {
  'use strict';
  var doc = document;
  var RT = global.RT = { tool: 'select', opts: { fill: '#e8590c', stroke: '#1b1e2b', sw: 2, color: '#1b1e2b', size: 24, hardness: 0.8, bopacity: 1, sticky: '#ffe58a', tolerance: 32, font: 'Inter', fsize: 24 } };
  var cv, wrap, ptr = {}, act = null, spaceDown = false, lastCursorSent = 0;
  var SHAPES = { rect: 1, ellipse: 1, polygon: 1, star: 1, line: 1, arrow: 1, frame: 1 };

  RT.init = function (canvas) {
    cv = canvas; wrap = canvas.parentNode;
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('dblclick', dbl);
    cv.addEventListener('wheel', wheel, { passive: false });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); var w = world(e); var h = RR.hit(w.x, w.y); if (h && RR.sel.indexOf(h.id) < 0) RT.select([h.id]); RD.emit('context', { x: e.clientX, y: e.clientY, world: w }); });
    cv.addEventListener('pointerleave', function () { RR.hover = null; RR.draw(); });
    doc.addEventListener('keydown', key);
    doc.addEventListener('keyup', function (e) { if (e.code === 'Space') { spaceDown = false; setCursor(); } });
    cv.addEventListener('dragover', function (e) { e.preventDefault(); });
    cv.addEventListener('drop', function (e) { e.preventDefault(); var w = world(e); Array.prototype.forEach.call(e.dataTransfer.files || [], function (f, i) { if (/^image\//.test(f.type)) RT.insertImage(f, w.x + i * 30, w.y + i * 30); else if (/svg/.test(f.type)) f.text().then(function (t) { RT.importSVG(t, w.x, w.y); }); }); });
    doc.addEventListener('paste', paste);
    doc.addEventListener('copy', copy);
    doc.addEventListener('cut', function (e) { if (copy(e)) { RD.remove(RR.sel); RT.select([]); } });
  };
  function world(e) { var r = cv.getBoundingClientRect(); return RR.toWorld(e.clientX - r.left, e.clientY - r.top); }
  function screen(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  RT.setTool = function (t) {
    if (RT.editingText) RT.endText();
    if (act && act.type === 'pen') finishPen();
    if (RR.nodeEdit && t !== 'select') { RR.nodeEdit = null; }
    RT.tool = t; setCursor(); RD.emit('tool', t); RR.draw();
  };
  function setCursor() {
    var c = { select: 'default', hand: 'grab', text: 'text', pen: 'crosshair', pencil: 'crosshair', marker: 'crosshair', brush: 'crosshair', eraser: 'crosshair', clone: 'crosshair', dodge: 'crosshair', burn: 'crosshair', eyedrop: 'copy', comment: 'cell', marquee: 'crosshair', lasso: 'crosshair', wand: 'crosshair', crop: 'crosshair' }[RT.tool] || 'crosshair';
    cv.style.cursor = spaceDown ? 'grab' : c;
  }
  RT.select = function (ids, add) {
    var s = add ? RR.sel.slice() : [];
    ids.forEach(function (id) { var i = s.indexOf(id); if (add && i >= 0) s.splice(i, 1); else if (i < 0) s.push(id); });
    RR.sel = s.filter(function (id) { return RD.get(id); });
    if (RR.nodeEdit && RR.sel.indexOf(RR.nodeEdit.id) < 0) RR.nodeEdit = null;
    RD.emit('select', RR.sel);
    sendCursor(null, true);
    RR.draw();
  };
  function sendCursor(w, force) {
    if (!RD.room) return;
    var now = Date.now();
    if (!force && now - lastCursorSent < 45) return;
    lastCursorSent = now;
    RT.lastCursor = w || RT.lastCursor || {};
    RD.room.setCursor({ page: RD.page, x: Math.round(RT.lastCursor.x || 0), y: Math.round(RT.lastCursor.y || 0), sel: RR.sel.slice(0, 20), view: RR.view });
  }

  /* ====================================================== pegangan seleksi */
  RR.handles = function () {
    var nodes = RR.sel.map(RD.get).filter(function (n) { return n && n.type !== 'conn'; });
    if (!nodes.length) return null;
    var z = RR.view.z;
    if (nodes.length === 1 && nodes[0].rot) {
      var n = nodes[0], c = RG.corners(n), mid = function (a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
      var pts = [c[0], mid(c[0], c[1]), c[1], mid(c[1], c[2]), c[2], mid(c[2], c[3]), c[3], mid(c[3], c[0])];
      var top = mid(c[0], c[1]), cx = n.x + n.w / 2, cy = n.y + n.h / 2, ang = RG.rad(n.rot), off = 22 / z;
      return { points: pts, rot: n.rot, rotHandle: { x: top.x + Math.sin(ang) * off, y: top.y - Math.cos(ang) * off }, x: n.x, y: n.y, w: n.w, h: n.h, single: n };
    }
    var b = RG.union(nodes.map(RG.bounds));
    var P = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]].map(function (p) { return { x: b.x + b.w * p[0], y: b.y + b.h * p[1] }; });
    var lineLike = nodes.length === 1 && (nodes[0].type === 'line' || nodes[0].type === 'arrow');
    return { points: lineLike ? [P[0], P[4]] : P, x: b.x, y: b.y, w: b.w, h: b.h, rotHandle: { x: b.x + b.w / 2, y: b.y - 22 / z }, single: nodes.length === 1 ? nodes[0] : null };
  };
  function hitHandle(w) {
    var h = RR.handles(); if (!h) return null;
    var tol = 7 / RR.view.z;
    if (h.rotHandle && Math.hypot(w.x - h.rotHandle.x, w.y - h.rotHandle.y) < tol + 2 / RR.view.z) return { kind: 'rot', h: h };
    for (var i = 0; i < h.points.length; i++) if (Math.abs(w.x - h.points[i].x) < tol && Math.abs(w.y - h.points[i].y) < tol) return { kind: 'size', i: h.points.length === 2 ? (i ? 4 : 0) : i, h: h };
    return null;
  }

  /* ====================================================== snapping */
  function snapLines(exclude) {
    var xs = [], ys = [], view = RR.size(), tl = RR.toWorld(0, 0), br = RR.toWorld(view.w, view.h);
    var vb = { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
    RD.nodes().forEach(function (n) {
      if (exclude[n.id] || n.visible === false || n.type === 'conn') return;
      var b = RG.bounds(n); if (!RG.inter(b, vb)) return;
      xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    });
    return { xs: xs, ys: ys };
  }
  function snap(box, lines, alt) {
    if (alt || RT.noSnap) return { dx: 0, dy: 0, gx: [], gy: [] };
    var th = 6 / RR.view.z, best = { dx: 0, dy: 0, gx: [], gy: [] }, bx = Infinity, by = Infinity;
    [box.x, box.x + box.w / 2, box.x + box.w].forEach(function (v) { lines.xs.forEach(function (l) { var d = l - v; if (Math.abs(d) < th && Math.abs(d) < Math.abs(bx)) { bx = d; } }); });
    [box.y, box.y + box.h / 2, box.y + box.h].forEach(function (v) { lines.ys.forEach(function (l) { var d = l - v; if (Math.abs(d) < th && Math.abs(d) < Math.abs(by)) { by = d; } }); });
    if (bx !== Infinity) best.dx = bx; if (by !== Infinity) best.dy = by;
    if (RR.showGrid && bx === Infinity) { var g = RR.gridSize || 8; best.dx = Math.round(box.x / g) * g - box.x; }
    if (RR.showGrid && by === Infinity) { var g2 = RR.gridSize || 8; best.dy = Math.round(box.y / g2) * g2 - box.y; }
    var nb = { x: box.x + best.dx, y: box.y + best.dy, w: box.w, h: box.h };
    [nb.x, nb.x + nb.w / 2, nb.x + nb.w].forEach(function (v) { if (lines.xs.some(function (l) { return Math.abs(l - v) < 0.5; })) best.gx.push(v); });
    [nb.y, nb.y + nb.h / 2, nb.y + nb.h].forEach(function (v) { if (lines.ys.some(function (l) { return Math.abs(l - v) < 0.5; })) best.gy.push(v); });
    return best;
  }
  function guidesOverlay(g) {
    return function (ctx, z) {
      ctx.save(); ctx.strokeStyle = '#ff3d71'; ctx.lineWidth = 1 / z; ctx.setLineDash([4 / z, 3 / z]);
      g.gx.forEach(function (x) { ctx.beginPath(); ctx.moveTo(x, -1e6); ctx.lineTo(x, 1e6); ctx.stroke(); });
      g.gy.forEach(function (y) { ctx.beginPath(); ctx.moveTo(-1e6, y); ctx.lineTo(1e6, y); ctx.stroke(); });
      ctx.restore();
    };
  }

  /* ====================================================== pointer */
  function down(e) {
    // Cegah mousedown bawaan memindahkan fokus (textarea teks baru tetap fokus).
    e.preventDefault();
    var ae = doc.activeElement;
    if (ae && ae !== doc.body && ae.tagName !== 'TEXTAREA' && ae.blur) ae.blur();
    cv.setPointerCapture(e.pointerId);
    ptr[e.pointerId] = screen(e);
    if (Object.keys(ptr).length === 2) { startPinch(); return; }
    if (RT.editingText && e.target === cv) RT.endText();
    var w = world(e), s = screen(e);
    RD.emit('canvasdown');
    if (e.button === 1 || spaceDown || RT.tool === 'hand') { act = { type: 'pan', sx: s.x, sy: s.y, vx: RR.view.x, vy: RR.view.y }; cv.style.cursor = 'grabbing'; return; }
    if (e.button === 2) return;
    if (RD.readonly && RT.tool !== 'comment') { act = { type: 'pan', sx: s.x, sy: s.y, vx: RR.view.x, vy: RR.view.y }; return; }
    var t = RT.tool;
    if (t === 'select') return downSelect(e, w);
    if (SHAPES[t]) { act = { type: 'draw', shape: t, x0: w.x, y0: w.y, id: null }; return; }
    if (t === 'text') { createText(w); return; }
    if (t === 'sticky') { createSticky(w); return; }
    if (t === 'pen') return downPen(e, w);
    if (t === 'pencil' || t === 'marker' || t === 'highlighter') { act = { type: 'pencil', pts: [[w.x, w.y]] }; RR.overlay.push(pencilOverlay); return; }
    if (t === 'conn') { var from = RR.hit(w.x, w.y, { deep: true }); act = { type: 'conn', from: from ? { id: from.id, side: 'auto' } : { x: w.x, y: w.y }, to: { x: w.x, y: w.y } }; RR.overlay.push(connOverlay); return; }
    if (t === 'brush' || t === 'eraser' || t === 'clone' || t === 'dodge' || t === 'burn') return downPaint(e, w);
    if (t === 'marquee' || t === 'emarquee' || t === 'lasso') return downSelArea(e, w);
    if (t === 'wand') return wand(w, e.shiftKey);
    if (t === 'crop') return downCrop(w);
    if (t === 'eyedrop') return eyedrop(w, e.altKey);
    if (t === 'comment') { RD.emit('comment', { x: w.x, y: w.y }); return; }
    if (t === 'fillbucket') return bucket(w);
  }
  function move(e) {
    if (ptr[e.pointerId]) ptr[e.pointerId] = screen(e);
    if (pinch) { doPinch(); return; }
    var w = world(e);
    sendCursor(w);
    RT.mouse = w;
    if (!act) { hoverUpdate(w, e); return; }
    var s = screen(e);
    switch (act.type) {
      case 'pan': RR.view.x = act.vx + s.x - act.sx; RR.view.y = act.vy + s.y - act.sy; RR.draw(); RD.emit('view'); break;
      case 'move': moveDrag(w, e); break;
      case 'size': sizeDrag(w, e); break;
      case 'rot': rotDrag(w, e); break;
      case 'marquee': act.x1 = w.x; act.y1 = w.y; RR.draw(); break;
      case 'draw': drawDrag(w, e); break;
      case 'pencil': act.pts.push([w.x, w.y]); RR.draw(); break;
      case 'conn': var h = RR.hit(w.x, w.y, { deep: true, skip: act.from.id ? [act.from.id] : [] }); act.to = h ? { id: h.id, side: 'auto' } : { x: w.x, y: w.y }; act.hoverTarget = h && h.id; RR.draw(); break;
      case 'pen': if (act.dragging) { var p = act.pts[act.pts.length - 1]; p.ox = w.x; p.oy = w.y; p.ix = 2 * p.x - w.x; p.iy = 2 * p.y - w.y; } act.mouse = w; RR.draw(); break;
      case 'nodeedit': nodeDrag(w, e); break;
      case 'paint': paintMove(w, e); break;
      case 'selarea': act.pts.push([w.x, w.y]); act.x1 = w.x; act.y1 = w.y; RR.draw(); break;
      case 'crop': cropDrag(w, e); break;
    }
  }
  function up(e) {
    delete ptr[e.pointerId];
    if (pinch) { if (Object.keys(ptr).length < 2) pinch = null; return; }
    if (!act) return;
    var a = act; act = null;
    var w = world(e);
    switch (a.type) {
      case 'pan': setCursor(); break;
      case 'move': RR.overlay = []; if (a.moved) endMove(a, w); else if (a.clickSelect) RT.select([a.clickSelect]); RD.end(); RD.emit('select', RR.sel); break;
      case 'size': case 'rot': RR.overlay = []; RD.end(); afterTransform(); RD.emit('select', RR.sel); break;
      case 'marquee': endMarquee(a, e.shiftKey); break;
      case 'draw': endDraw(a); break;
      case 'pencil': RR.overlay = []; endPencil(a); break;
      case 'conn': RR.overlay = []; endConn(a); break;
      case 'pen': if (a.dragging) { a.dragging = false; act = a; } else act = a; break;
      case 'nodeedit': RD.end(); act = null; break;
      case 'paint': paintEnd(a); break;
      case 'selarea': endSelArea(a, e.shiftKey); break;
      case 'crop': act = a; a.dragging = false; break;
    }
    RR.draw();
  }
  function hoverUpdate(w, e) {
    if (RT.tool !== 'select' && RT.tool !== 'conn') { if (RR.hover) { RR.hover = null; RR.draw(); } return; }
    var hh = hitHandle(w);
    if (RT.tool === 'select' && hh) {
      if (hh.kind === 'rot') cv.style.cursor = 'grab';
      else { var cur = ['nwse', 'ns', 'nesw', 'ew', 'nwse', 'ns', 'nesw', 'ew'][hh.i]; cv.style.cursor = cur + '-resize'; }
      return;
    }
    if (RT.tool === 'select' && !spaceDown) cv.style.cursor = 'default';
    var h = RR.hit(w.x, w.y, { deep: e.metaKey || e.ctrlKey });
    var id = h ? h.id : null;
    if (id !== RR.hover) { RR.hover = id; RR.draw(); }
  }

  /* ---------------------------------------------------------- pilih/geser */
  function downSelect(e, w) {
    if (RR.nodeEdit) { if (downNodeEdit(e, w)) return; RR.nodeEdit = null; RD.emit('nodeedit', null); }
    var hh = hitHandle(w);
    if (hh) {
      var nodes = RR.sel.map(RD.get).filter(Boolean);
      RD.begin();
      act = { type: hh.kind === 'rot' ? 'rot' : 'size', i: hh.i, h: hh.h, start: w, orig: nodes.map(function (n) { return JSON.parse(JSON.stringify(n)); }), box: { x: hh.h.x, y: hh.h.y, w: hh.h.w, h: hh.h.h } };
      if (hh.kind === 'rot') { var b = act.box; act.cx = b.x + b.w / 2; act.cy = b.y + b.h / 2; act.a0 = Math.atan2(w.y - act.cy, w.x - act.cx); }
      return;
    }
    var hit = RR.hit(w.x, w.y, { deep: e.metaKey || e.ctrlKey });
    // klik pada bagian frame kosong di dalam frame besar → mulai marquee bila frame tidak terpilih
    if (hit && hit.type === 'frame' && !hit.parent && RR.sel.indexOf(hit.id) < 0 && !e.shiftKey && !onFrameLabel(hit, w) && RD.children(hit.id).length) {
      var inner = RR.hit(w.x, w.y, { deep: true });
      if (inner && inner.id !== hit.id) hit = inner; else { act = { type: 'marquee', x0: w.x, y0: w.y, x1: w.x, y1: w.y }; RR.overlay = [marqueeOverlay]; return; }
    }
    if (!hit) {
      if (!e.shiftKey) RT.select([]);
      act = { type: 'marquee', x0: w.x, y0: w.y, x1: w.x, y1: w.y, add: e.shiftKey };
      RR.overlay = [marqueeOverlay];
      return;
    }
    var clickSelect = null;
    if (e.shiftKey) RT.select([hit.id], true);
    else if (RR.sel.indexOf(hit.id) < 0) RT.select([hit.id]);
    else clickSelect = hit.id;   // klik ulang di seleksi ganda tanpa geser → pilih satu
    if (RR.sel.length < 2) clickSelect = null;
    var ids = RR.sel.filter(function (id) { var n = RD.get(id); return n && !n.locked; });
    if (!ids.length) return;
    RD.begin();
    if (e.altKey) { ids = RD.duplicate(ids, 0, 0); RT.select(ids); }
    var exclude = {};
    ids.forEach(function (id) { exclude[id] = 1; RD.descendants(id).forEach(function (d) { exclude[d.id] = 1; }); });
    act = { type: 'move', start: w, last: { x: 0, y: 0 }, ids: ids, lines: snapLines(exclude), box: RG.union(ids.map(function (id) { return RG.bounds(RD.get(id)); })), moved: false, clickSelect: clickSelect };
  }
  function onFrameLabel(f, w) { return w.y < f.y && w.y > f.y - 18 / RR.view.z && w.x >= f.x && w.x <= f.x + f.w; }
  function moveDrag(w, e) {
    var dx = w.x - act.start.x, dy = w.y - act.start.y;
    if (!act.moved && Math.hypot(dx, dy) * RR.view.z < 3) return;
    act.moved = true;
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    var box = { x: act.box.x + dx, y: act.box.y + dy, w: act.box.w, h: act.box.h };
    var s = snap(box, act.lines, e.altKey && e.metaKey);
    dx += s.dx; dy += s.dy;
    RD.moveBy(act.ids, dx - act.last.x, dy - act.last.y);
    act.last = { x: dx, y: dy };
    RR.overlay = [guidesOverlay(s)];
    // sorot frame tujuan
    var target = frameAt(w, act.ids);
    act.target = target;
    if (target) RR.overlay.push(function (ctx, z, acc) { ctx.save(); ctx.strokeStyle = acc; ctx.lineWidth = 2 / z; ctx.strokeRect(target.x, target.y, target.w, target.h); ctx.restore(); });
  }
  function frameAt(w, exclude) {
    var ex = {}; exclude.forEach(function (id) { ex[id] = 1; RD.descendants(id).forEach(function (d) { ex[d.id] = 1; }); });
    var list = RD.drawOrder().reverse();
    for (var i = 0; i < list.length; i++) { var n = list[i]; if (n.type === 'frame' && !ex[n.id] && n.visible !== false && w.x >= n.x && w.x <= n.x + n.w && w.y >= n.y && w.y <= n.y + n.h) return n; }
    return null;
  }
  function endMove(a, w) {
    // masuk/keluar frame
    var target = a.target ? a.target.id : '';
    a.ids.forEach(function (id) {
      var n = RD.get(id); if (!n || n.type === 'conn') return;
      var cur = RD.get(n.parent);
      if (cur && cur.type === 'group') return;
      if ((n.parent || '') !== target && !(n.type === 'frame' && !target)) RD.set(id, { parent: target, _o: SN.Collab.between(RD.topOrder(target), '') });
      else if (n.type === 'frame' && target && n.parent !== target) RD.set(id, { parent: target, _o: SN.Collab.between(RD.topOrder(target), '') });
    });
    afterTransform();
  }
  function afterTransform() {
    var parents = {};
    RR.sel.forEach(function (id) { var n = RD.get(id); if (n && n.parent) parents[n.parent] = 1; if (n && n.comp) RD.syncInstances(id); var m = n && RD.get(n.parent); while (m) { if (m.comp) RD.syncInstances(m.id); m = RD.get(m.parent); } });
    Object.keys(parents).forEach(function (p) { var g = RD.get(p); if (g && g.type === 'group') RD.fitGroup(p); if (g && g.layout && g.layout.dir) RD.layout(p); });
  }
  RT.afterTransform = afterTransform;
  function sizeDrag(w, e) {
    var b = act.box, i = act.i, ax = [0, 0.5, 1, 1, 1, 0.5, 0, 0][i], ay = [0, 0, 0, 0.5, 1, 1, 1, 0.5][i];
    var single = act.orig.length === 1 ? act.orig[0] : null;
    if (single && single.rot) {
      // ubah ukuran dalam ruang lokal node yang diputar
      var n = single, lp = RG.toLocal(n, w.x, w.y), x1 = n.x, y1 = n.y, x2 = n.x + n.w, y2 = n.y + n.h;
      if (ax === 0) x1 = Math.min(lp.x, x2 - 1); if (ax === 1) x2 = Math.max(lp.x, x1 + 1);
      if (ay === 0) y1 = Math.min(lp.y, y2 - 1); if (ay === 1) y2 = Math.max(lp.y, y1 + 1);
      // pertahankan sudut lawan di tempat
      var opp = RG.rot(ax === 0 ? n.x + n.w : ax === 1 ? n.x : n.x + n.w / 2, ay === 0 ? n.y + n.h : ay === 1 ? n.y : n.y + n.h / 2, n.x + n.w / 2, n.y + n.h / 2, n.rot);
      var nw = x2 - x1, nh = y2 - y1, nb = { x: x1, y: y1, w: nw, h: nh, rot: n.rot };
      var opp2 = RG.rot(ax === 0 ? x2 : ax === 1 ? x1 : x1 + nw / 2, ay === 0 ? y2 : ay === 1 ? y1 : y1 + nh / 2, x1 + nw / 2, y1 + nh / 2, n.rot);
      nb.x += opp.x - opp2.x; nb.y += opp.y - opp2.y;
      RD.resize(n.id, { x: nb.x, y: nb.y, w: nb.w, h: nb.h }, e.altKey);
      return;
    }
    var nx1 = b.x, ny1 = b.y, nx2 = b.x + b.w, ny2 = b.y + b.h;
    if (ax === 0) nx1 = w.x; if (ax === 1) nx2 = w.x;
    if (ay === 0) ny1 = w.y; if (ay === 1) ny2 = w.y;
    var lineLike = single && (single.type === 'line' || single.type === 'arrow');
    var keep = (e.shiftKey || (single && (single.type === 'image' || single.type === 'raster') && !e.shiftKey && RT.lockImageRatio !== false)) && !lineLike && ax !== 0.5 && ay !== 0.5;
    if (single && (single.type === 'image' || single.type === 'raster') && e.shiftKey) keep = false;
    if (keep) {
      var ratio = b.w / b.h, nw2 = nx2 - nx1, nh2 = ny2 - ny1;
      if (Math.abs(nw2) / ratio > Math.abs(nh2)) { nh2 = Math.sign(nh2 || 1) * Math.abs(nw2) / ratio; if (ay === 0) ny1 = ny2 - nh2; else ny2 = ny1 + nh2; }
      else { nw2 = Math.sign(nw2 || 1) * Math.abs(nh2) * ratio; if (ax === 0) nx1 = nx2 - nw2; else nx2 = nx1 + nw2; }
    }
    if (e.altKey) { var cx = b.x + b.w / 2, cy = b.y + b.h / 2; if (ax !== 0.5) { var hw = Math.abs((ax === 0 ? nx1 : nx2) - cx); nx1 = cx - hw; nx2 = cx + hw; } if (ay !== 0.5) { var hh = Math.abs((ay === 0 ? ny1 : ny2) - cy); ny1 = cy - hh; ny2 = cy + hh; } }
    var flipX = nx2 < nx1, flipY = ny2 < ny1;
    var nb2 = { x: Math.min(nx1, nx2), y: Math.min(ny1, ny2), w: Math.max(1, Math.abs(nx2 - nx1)), h: Math.max(1, Math.abs(ny2 - ny1)) };
    if (lineLike) { RD.set(single.id, { x: nb2.x, y: nb2.y, w: nb2.w, h: nb2.h, flipLine: (flipX !== flipY) ? !single.flipLine : !!single.flipLine }); return; }
    var sx = nb2.w / b.w, sy = nb2.h / b.h;
    act.orig.forEach(function (o) {
      var f = { x: nb2.x + (o.x - b.x) * sx, y: nb2.y + (o.y - b.y) * sy, w: Math.max(1, o.w * sx), h: Math.max(1, o.h * sy) };
      if (o.type === 'text' && act.orig.length === 1 && (ax === 0.5 || ay === 0.5) === false) { f.fsize = Math.max(4, (o.fsize || 16) * sy); }
      if (o.type === 'text' && ax !== 0.5 && ay === 0.5) { f.autoW = false; f.h = RR.measureText(Object.assign({}, o, { w: f.w, autoW: false })).h; }
      RD.resize(o.id, f, act.orig.length > 1 || e.metaKey || o.type === 'group');
    });
  }
  function rotDrag(w, e) {
    var a = Math.atan2(w.y - act.cy, w.x - act.cx), deg = (a - act.a0) * 180 / Math.PI;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    act.orig.forEach(function (o) {
      var c = RG.rot(o.x + o.w / 2, o.y + o.h / 2, act.cx, act.cy, deg);
      var r = ((o.rot || 0) + deg) % 360; if (e.shiftKey) r = Math.round(r / 15) * 15;
      RD.set(o.id, { rot: r, x: c.x - o.w / 2, y: c.y - o.h / 2 });
    });
    RR.overlay = [function (ctx, z) { ctx.save(); ctx.font = '600 ' + 11 / z + 'px Inter'; ctx.fillStyle = '#ff3d71'; ctx.fillText(Math.round((act && act.orig[0].rot || 0) + deg) + '°', w.x + 12 / z, w.y); ctx.restore(); }];
  }
  function marqueeOverlay(ctx, z, acc) {
    if (!act || act.type !== 'marquee') return;
    var x = Math.min(act.x0, act.x1), y = Math.min(act.y0, act.y1), w = Math.abs(act.x1 - act.x0), h = Math.abs(act.y1 - act.y0);
    ctx.save(); ctx.fillStyle = acc + '22'; ctx.strokeStyle = acc; ctx.lineWidth = 1 / z; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); ctx.restore();
  }
  function endMarquee(a, add) {
    RR.overlay = [];
    var r = { x: Math.min(a.x0, a.x1), y: Math.min(a.y0, a.y1), w: Math.abs(a.x1 - a.x0), h: Math.abs(a.y1 - a.y0) };
    if (r.w * RR.view.z < 3 && r.h * RR.view.z < 3) return;
    RT.select(RR.inRect(r).map(function (n) { return n.id; }), add);
  }

  /* ---------------------------------------------------------- gambar bentuk */
  function drawDrag(w, e) {
    var x0 = act.x0, y0 = act.y0, x1 = w.x, y1 = w.y;
    var lineLike = act.shape === 'line' || act.shape === 'arrow';
    if (e.shiftKey && !lineLike) { var s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * s; y1 = y0 + Math.sign(y1 - y0 || 1) * s; }
    if (e.shiftKey && lineLike) { var ang = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * Math.PI / 4, len = Math.hypot(x1 - x0, y1 - y0); x1 = x0 + Math.cos(ang) * len; y1 = y0 + Math.sin(ang) * len; }
    if (e.altKey) { x0 = 2 * act.x0 - x1; y0 = 2 * act.y0 - y1; }
    var box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.max(1, Math.abs(x1 - x0)), h: Math.max(1, Math.abs(y1 - y0)) };
    if (!act.id) { RD.begin(); act.id = RD.add(shapeDefaults(act.shape, box)); RT.select([act.id]); }
    var f = Object.assign({}, box);
    if (lineLike) f.flipLine = (x1 < x0) !== (y1 < y0);
    RD.set(act.id, f);
  }
  function shapeDefaults(shape, box) {
    var o = RT.opts, base = Object.assign({ type: shape, name: SN.t('r_t_' + shape) }, box);
    if (shape === 'frame') return Object.assign(base, { fill: '#ffffff', clip: true, name: SN.t('r_frame') + ' ' + (RD.nodes().filter(function (n) { return n.type === 'frame'; }).length + 1), parent: '' });
    if (shape === 'line' || shape === 'arrow') return Object.assign(base, { stroke: o.stroke, sw: o.sw, fill: 'none' });
    var f = Object.assign(base, { fill: o.fill, stroke: o.sw ? o.stroke : 'none', sw: RT.mode === 'board' ? 0 : 0 });
    if (shape === 'star') f.sides = 5, f.inner = 0.45;
    if (shape === 'polygon') f.sides = 6;
    if (RT.mode === 'board') { f.color = '#1b1e2b'; f.fsize = 16; f.text = ''; f.fill = o.fill; }
    return f;
  }
  function endDraw(a) {
    if (!a.id) {
      // klik tanpa seret: bentuk ukuran bawaan
      var size = a.shape === 'frame' ? { w: 390, h: 844 } : a.shape === 'line' || a.shape === 'arrow' ? { w: 160, h: 1 } : { w: 120, h: 120 };
      RD.begin(); a.id = RD.add(shapeDefaults(a.shape, { x: a.x0, y: a.y0, w: size.w, h: size.h })); RT.select([a.id]);
    }
    var n = RD.get(a.id);
    // frame baru menelan objek yang ada di dalamnya
    if (n && n.type === 'frame') RD.nodes(undefined, '').forEach(function (o) { if (o.id !== n.id && o.type !== 'frame' && o.x >= n.x && o.y >= n.y && o.x + o.w <= n.x + n.w && o.y + o.h <= n.y + n.h) RD.set(o.id, { parent: n.id }); });
    // objek di atas frame → masuk frame
    if (n && n.type !== 'frame') { var f = frameAt({ x: n.x + n.w / 2, y: n.y + n.h / 2 }, [n.id]); if (f) RD.set(n.id, { parent: f.id, _o: SN.Collab.between(RD.topOrder(f.id), '') }); }
    RD.end();
    if (!RT.keepTool) RT.setTool('select');
  }

  /* ---------------------------------------------------------- teks */
  var ta = null;
  function createText(w) {
    RD.begin();
    var id = RD.add({ type: 'text', x: w.x, y: w.y, w: 10, h: (RT.opts.fsize || 24) * 1.3, text: '', autoW: true, font: RT.opts.font + ', system-ui, sans-serif', fsize: RT.opts.fsize || 24, fweight: 400, color: RT.opts.color, name: SN.t('r_t_text') });
    var f = frameAt(w, [id]); if (f) RD.set(id, { parent: f.id });
    RT.select([id]);
    RT.editText(id, true);
  }
  RT.editText = function (id, isNew) {
    var n = RD.get(id); if (!n) return;
    RT.endText();
    if (!isNew) RD.begin();
    RT.editingText = id; RR.editing = n.type === 'text' ? id : null;
    ta = doc.createElement('textarea');
    ta.className = 'r-text-edit';
    ta.value = n.text || '';
    ta.spellcheck = true;
    wrap.appendChild(ta);
    var place = function () {
      var m = RD.get(id); if (!m) return;
      var p = RR.toScreen(m.x, m.y), z = RR.view.z, inside = m.type !== 'text';
      var pad = m.type === 'sticky' ? 12 : inside ? 8 : 0;
      Object.assign(ta.style, {
        left: p.x + 'px', top: p.y + 'px', width: Math.max(20, (m.autoW ? m.w + 40 : m.w)) * z + 'px', height: Math.max(m.h, (m.fsize || 16) * 1.4) * z + 'px',
        font: (m.italic ? 'italic ' : '') + (m.fweight || 400) + ' ' + (m.fsize || 16) * z + 'px ' + (m.font || 'Inter, sans-serif'), lineHeight: (m.lh || 1.3), color: m.color || '#111',
        textAlign: m.align || (inside ? 'center' : 'left'), padding: pad * z + 'px', transform: m.rot ? 'rotate(' + m.rot + 'deg)' : '', transformOrigin: 'center',
        background: inside ? 'transparent' : 'transparent', display: inside && m.type !== 'sticky' ? 'flex' : ''
      });
      if (inside) { ta.style.paddingTop = Math.max(pad, (m.h - RR.textLines(m, cv.getContext('2d')).length * (m.fsize || 16) * (m.lh || 1.3)) / 2) * z + 'px'; }
    };
    place();
    ta.addEventListener('input', function () {
      var m = RD.get(id), f = { text: ta.value };
      if (m.type === 'text') { var meas = RR.measureText(Object.assign({}, m, { text: ta.value || ' ' })); if (m.autoW !== false) { f.w = meas.w; f.h = meas.h; } else f.h = RR.measureText(Object.assign({}, m, { text: ta.value || ' ', autoW: false })).h; }
      if (m.type === 'sticky' && !m.author) f.author = SN.ctx.name || '';
      if (m.src && m.type === 'text') f.textOverride = true;
      RD.set(id, f);
      place();
    });
    ta.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); RT.endText(); } });
    RT._placeText = place;
    setTimeout(function () { ta.focus(); if (!isNew) ta.select(); }, 0);
    RR.draw();
  };
  RT.endText = function () {
    if (!RT.editingText) return;
    var id = RT.editingText; RT.editingText = null; RR.editing = null; RT._placeText = null;
    if (ta) { ta.remove(); ta = null; }
    var n = RD.get(id);
    if (n && n.type === 'text' && !String(n.text || '').trim()) RD.set(id, { _del: 1 });
    RD.end();
    if (n && n.instOf === undefined) { var m = RD.get(n.parent); while (m) { if (m.comp) RD.syncInstances(m.id); m = RD.get(m.parent); } }
    afterTransform();
    if (!RT.keepTool && (RT.tool === 'text' || RT.tool === 'sticky')) RT.setTool('select');
    RR.draw(); RD.emit('select', RR.sel);
  };
  RD.on('view', function () { if (RT._placeText) RT._placeText(); });
  function createSticky(w) {
    RD.begin();
    var id = RD.add({ type: 'sticky', x: w.x - 100, y: w.y - 100, w: 200, h: 200, fill: RT.opts.sticky, text: '', fsize: 18, color: '#2b2b2b', author: SN.ctx.name || '', name: SN.t('r_t_sticky') });
    RT.select([id]); RT.editText(id, true);
  }

  /* ---------------------------------------------------------- pena & edit titik */
  function downPen(e, w) {
    if (!act || act.type !== 'pen') act = { type: 'pen', pts: [], mouse: w };
    var p0 = act.pts[0], tol = 8 / RR.view.z;
    if (p0 && act.pts.length > 2 && Math.hypot(w.x - p0.x, w.y - p0.y) < tol) { finishPen(true); return; }
    act.pts.push({ x: w.x, y: w.y }); act.dragging = true;
    if (RR.overlay.indexOf(penOverlay) < 0) RR.overlay.push(penOverlay);
  }
  function penOverlay(ctx, z, acc) {
    if (!act || act.type !== 'pen') return;
    var p = act.pts; if (!p.length) return;
    ctx.save(); ctx.strokeStyle = acc; ctx.lineWidth = 1.5 / z; ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
    var seg = function (a, b) { if (a.ox == null && b.ix == null) ctx.lineTo(b.x, b.y); else ctx.bezierCurveTo(a.ox == null ? a.x : a.ox, a.oy == null ? a.y : a.oy, b.ix == null ? b.x : b.ix, b.iy == null ? b.y : b.iy, b.x, b.y); };
    for (var i = 1; i < p.length; i++) seg(p[i - 1], p[i]);
    if (act.mouse && !act.dragging) seg(p[p.length - 1], act.mouse);
    ctx.stroke();
    p.forEach(function (q, i) {
      if (q.ox != null) { ctx.beginPath(); ctx.moveTo(q.ix, q.iy); ctx.lineTo(q.ox, q.oy); ctx.stroke(); [[q.ix, q.iy], [q.ox, q.oy]].forEach(function (h) { ctx.beginPath(); ctx.arc(h[0], h[1], 3 / z, 0, 7); ctx.fillStyle = acc; ctx.fill(); }); }
      ctx.fillStyle = i === 0 ? acc : '#fff'; ctx.fillRect(q.x - 3.5 / z, q.y - 3.5 / z, 7 / z, 7 / z); ctx.strokeRect(q.x - 3.5 / z, q.y - 3.5 / z, 7 / z, 7 / z);
    });
    ctx.restore();
  }
  function finishPen(closed) {
    var a = act; act = null;
    RR.overlay = RR.overlay.filter(function (o) { return o !== penOverlay; });
    if (!a || a.pts.length < 2) { RR.draw(); return; }
    var xs = [], ys = [];
    a.pts.forEach(function (p) { xs.push(p.x); ys.push(p.y); if (p.ox != null) { xs.push(p.ox, p.ix); ys.push(p.oy, p.iy); } });
    var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys), w = Math.max(1, Math.max.apply(null, xs) - x), h = Math.max(1, Math.max.apply(null, ys) - y);
    var N = function (v, o, s) { return v == null ? undefined : (v - o) / s; };
    var pts = a.pts.map(function (p) { return { x: N(p.x, x, w), y: N(p.y, y, h), ix: N(p.ix, x, w), iy: N(p.iy, y, h), ox: N(p.ox, x, w), oy: N(p.oy, y, h) }; });
    var id = RD.add({ type: 'path', x: x, y: y, w: w, h: h, d: [{ closed: !!closed, pts: pts }], fill: closed ? RT.opts.fill : 'none', stroke: RT.opts.stroke, sw: RT.opts.sw || 2, name: SN.t('r_t_path') });
    RT.select([id]);
    RR.draw();
  }
  RT.finishPen = function () { if (act && act.type === 'pen') finishPen(false); };
  /** Mode edit titik untuk path (bentuk dasar diubah ke path dulu). */
  RT.enterNodeEdit = function (id) {
    var n = RD.get(id); if (!n || n.type === 'text' || n.type === 'image' || n.type === 'raster' || n.type === 'frame' || n.type === 'group' || n.type === 'sticky' || n.type === 'conn') return;
    if (n.type !== 'path') { RD.set(id, { type: 'path', d: RG.shapePath(n), rot: n.rot }); }
    RR.nodeEdit = { id: id, sel: -1, sp: 0 };
    RD.emit('nodeedit', id);
    if (RR.overlay.indexOf(nodeOverlay) < 0) RR.overlay.push(nodeOverlay);
    RR.draw();
  };
  function nodeOverlay(ctx, z, acc) {
    var ne = RR.nodeEdit; if (!ne) return;
    var n = RD.get(ne.id); if (!n) { RR.nodeEdit = null; return; }
    var W = function (u, v) { return RG.rot(n.x + u * n.w, n.y + v * n.h, n.x + n.w / 2, n.y + n.h / 2, n.rot || 0); };
    ctx.save(); ctx.lineWidth = 1 / z; ctx.strokeStyle = acc;
    (n.d || []).forEach(function (sp, si) {
      sp.pts.forEach(function (p, i) {
        var a = W(p.x, p.y), on = ne.sp === si && ne.sel === i;
        [['ix', 'iy'], ['ox', 'oy']].forEach(function (k) { if (p[k[0]] == null) return; var h = W(p[k[0]], p[k[1]]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(h.x, h.y); ctx.stroke(); ctx.beginPath(); ctx.arc(h.x, h.y, 3.2 / z, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); });
        ctx.fillStyle = on ? acc : '#fff'; ctx.fillRect(a.x - 4 / z, a.y - 4 / z, 8 / z, 8 / z); ctx.strokeRect(a.x - 4 / z, a.y - 4 / z, 8 / z, 8 / z);
      });
    });
    ctx.restore();
  }
  function downNodeEdit(e, w) {
    var ne = RR.nodeEdit, n = RD.get(ne.id); if (!n) return false;
    var tol = 7 / RR.view.z, L = RG.toLocal(n, w.x, w.y), u = (L.x - n.x) / n.w, v = (L.y - n.y) / n.h;
    var hit = null;
    (n.d || []).forEach(function (sp, si) {
      sp.pts.forEach(function (p, i) {
        [['x', 'y', 'a'], ['ix', 'iy', 'i'], ['ox', 'oy', 'o']].forEach(function (k) {
          if (p[k[0]] == null || hit) return;
          if (Math.abs((p[k[0]] - u) * n.w) < tol && Math.abs((p[k[1]] - v) * n.h) < tol) hit = { si: si, i: i, part: k[2] };
        });
      });
    });
    if (!hit) {
      // klik di garis → sisipkan titik
      var best = null;
      RG.flatten(n, 10).forEach(function (ring, si) { for (var j = 1; j < ring.length; j++) { var d = RG.distSeg(w.x, w.y, ring[j - 1], ring[j]); if (d < tol && (!best || d < best.d)) best = { d: d, si: si, seg: Math.floor((j - 1) / 10) }; } });
      if (best) {
        var d = JSON.parse(JSON.stringify(n.d)), sp = d[best.si], idx = best.seg + 1;
        sp.pts.splice(idx, 0, { x: u, y: v });
        RD.set(n.id, { d: d }); ne.sp = best.si; ne.sel = idx; RR.draw(); return true;
      }
      return false;
    }
    ne.sp = hit.si; ne.sel = hit.i;
    RD.begin();
    act = { type: 'nodeedit', hit: hit, alt: e.altKey };
    RR.draw();
    return true;
  }
  function nodeDrag(w, e) {
    var ne = RR.nodeEdit, n = RD.get(ne.id); if (!n) return;
    var L = RG.toLocal(n, w.x, w.y), u = (L.x - n.x) / n.w, v = (L.y - n.y) / n.h;
    var d = JSON.parse(JSON.stringify(n.d)), p = d[act.hit.si].pts[act.hit.i];
    if (act.hit.part === 'a') {
      var dx = u - p.x, dy = v - p.y; p.x = u; p.y = v;
      ['ix', 'ox'].forEach(function (k) { if (p[k] != null) p[k] += dx; }); ['iy', 'oy'].forEach(function (k) { if (p[k] != null) p[k] += dy; });
    } else {
      var a = act.hit.part, b = a === 'i' ? 'o' : 'i';
      p[a + 'x'] = u; p[a + 'y'] = v;
      if (!e.altKey && !act.alt && p[b + 'x'] != null) { p[b + 'x'] = 2 * p.x - u; p[b + 'y'] = 2 * p.y - v; }
    }
    RD.set(n.id, { d: d });
  }
  /** Normalisasi kotak path setelah edit titik supaya bounds tetap pas. */
  RT.normalizePath = function (id) {
    var n = RD.get(id); if (!n || n.type !== 'path' || n.rot) return;
    var xs = [], ys = [];
    n.d.forEach(function (sp) { sp.pts.forEach(function (p) { xs.push(p.x); ys.push(p.y); if (p.ox != null) xs.push(p.ox, p.ix); if (p.oy != null) ys.push(p.oy, p.iy); }); });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys), x1 = Math.max.apply(null, xs), y1 = Math.max.apply(null, ys);
    if (Math.abs(x0) < 1e-6 && Math.abs(y0) < 1e-6 && Math.abs(x1 - 1) < 1e-6 && Math.abs(y1 - 1) < 1e-6) return;
    var sx = (x1 - x0) || 1, sy = (y1 - y0) || 1;
    var M = function (vv, o, s) { return vv == null ? vv : (vv - o) / s; };
    var d = n.d.map(function (sp) { return { closed: sp.closed, pts: sp.pts.map(function (p) { return { x: M(p.x, x0, sx), y: M(p.y, y0, sy), ix: M(p.ix, x0, sx), iy: M(p.iy, y0, sy), ox: M(p.ox, x0, sx), oy: M(p.oy, y0, sy) }; }) }; });
    RD.set(id, { d: d, x: n.x + x0 * n.w, y: n.y + y0 * n.h, w: Math.max(1, sx * n.w), h: Math.max(1, sy * n.h) }, { noUndo: true });
  };

  /* ---------------------------------------------------------- pensil & konektor */
  function pencilOverlay(ctx, z) {
    if (!act || act.type !== 'pencil') return;
    var o = RT.opts, hl = RT.tool === 'highlighter';
    ctx.save(); ctx.strokeStyle = hl ? 'rgba(255, 214, 10, .45)' : o.stroke; ctx.lineWidth = RT.tool === 'marker' ? Math.max(4, o.sw * 2) : hl ? 18 : o.sw; ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath(); act.pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke(); ctx.restore();
  }
  function endPencil(a) {
    if (a.pts.length < 2) return;
    var pts = RG.simplify(a.pts, 1.5 / RR.view.z);
    if (pts.length < 2) pts = a.pts;
    var closed = pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 10 / RR.view.z && RT.tool === 'pencil';
    var sp = RG.smoothPath(pts, false);
    var hl = RT.tool === 'highlighter';
    var id = RD.add({ type: 'path', x: sp.x, y: sp.y, w: sp.w, h: sp.h, d: sp.d, fill: 'none', stroke: hl ? 'rgba(255, 214, 10, .45)' : RT.opts.stroke, sw: RT.tool === 'marker' ? Math.max(4, RT.opts.sw * 2) : hl ? 18 : RT.opts.sw, name: SN.t(RT.tool === 'pencil' ? 'r_t_pencil' : 'r_t_marker'), closedHint: closed });
    if (!RT.keepTool && RT.mode !== 'board') RT.select([id]);
  }
  function connOverlay(ctx, z, acc) {
    if (!act || act.type !== 'conn') return;
    var fake = { type: 'conn', from: act.from, to: act.to, style: RT.opts.connStyle || 'curve', stroke: acc, sw: 2 };
    RR.drawNode(ctx, fake);
    if (act.hoverTarget) { var n = RD.get(act.hoverTarget); if (n) { ctx.save(); ctx.strokeStyle = acc; ctx.lineWidth = 2 / z; var b = RG.bounds(n); ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.restore(); } }
  }
  function endConn(a) {
    if (!a.to.id && !a.from.id && Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y) < 10) return;
    var id = RD.add({ type: 'conn', from: a.from, to: a.to, style: RT.opts.connStyle || 'curve', stroke: RT.mode === 'board' ? '#5b6175' : RT.opts.stroke, sw: 2, endArrow: true, x: 0, y: 0, w: 1, h: 1, name: SN.t('r_t_conn') });
    RT.select([id]);
  }
  /** Konektor ikut: perbarui kotak konektor untuk culling/seleksi. */
  RD.on('change', function () { /* konektor dihitung saat digambar */ });

  /* ---------------------------------------------------------- lapisan raster */
  function rasterTarget(w, create) {
    var sel = RR.sel.map(RD.get).filter(function (n) { return n && (n.type === 'image' || n.type === 'raster'); });
    if (sel.length) return sel[0];
    var h = RR.hit(w.x, w.y, { deep: true });
    if (h && (h.type === 'image' || h.type === 'raster')) { RT.select([h.id]); return h; }
    if (!create) return null;
    // lapisan kosong baru seukuran frame/area pandang
    var f = frameAt(w, []), s = RR.size(), tl = RR.toWorld(0, 0), br = RR.toWorld(s.w, s.h);
    var box = f ? { x: f.x, y: f.y, w: f.w, h: f.h } : { x: Math.round(tl.x), y: Math.round(tl.y), w: Math.round(br.x - tl.x), h: Math.round(br.y - tl.y) };
    var scale = Math.min(1, 3000 / Math.max(box.w, box.h)) * Math.min(2, Math.max(1, RR.view.z));
    var c = doc.createElement('canvas'); c.width = Math.max(1, Math.round(box.w * scale)); c.height = Math.max(1, Math.round(box.h * scale));
    var src = c.toDataURL('image/png');
    RR.imgs[src] = { el: c, ok: true };
    var id = RD.add(Object.assign({ type: 'raster', src: src, name: SN.t('r_t_layer') + ' ' + (RD.nodes().filter(function (n) { return n.type === 'raster'; }).length + 1), parent: f ? f.id : '' }, box));
    RT.select([id]);
    return RD.get(id);
  }
  RT.rasterTarget = rasterTarget;
  function layerCanvas(n) {
    var r = RR.rasters[n.id];
    if (r) return r.canvas;
    var el = RR.image(n.src, n.id); if (!el) return null;
    var c = doc.createElement('canvas'); c.width = el.naturalWidth || el.width; c.height = el.naturalHeight || el.height;
    c.getContext('2d').drawImage(el, 0, 0);
    RR.rasters[n.id] = { canvas: c };
    return c;
  }
  function toPixel(n, c, w) { var L = RG.toLocal(n, w.x, w.y); return { x: (n.flipX ? n.x + n.w - L.x : L.x - n.x) / n.w * c.width, y: (n.flipY ? n.y + n.h - L.y : L.y - n.y) / n.h * c.height }; }
  function downPaint(e, w) {
    var n = rasterTarget(w, RT.tool === 'brush');
    if (!n) { SN.ui.toast(SN.t('r_need_image'), 'warn'); return; }
    if (n.crop) { SN.ui.toast(SN.t('r_cropped_paint'), 'warn'); return; }
    var c = layerCanvas(n); if (!c) return;
    var p = toPixel(n, c, w);
    if (RT.tool === 'clone' && e.altKey) { RT.cloneSrc = { id: n.id, x: p.x, y: p.y }; SN.ui.toast(SN.t('r_clone_set')); return; }
    if (RT.tool === 'clone' && (!RT.cloneSrc || RT.cloneSrc.id !== n.id)) { SN.ui.toast(SN.t('r_clone_need'), 'warn'); return; }
    var base = doc.createElement('canvas'); base.width = c.width; base.height = c.height; base.getContext('2d').drawImage(c, 0, 0);
    var stroke = doc.createElement('canvas'); stroke.width = c.width; stroke.height = c.height;
    act = { type: 'paint', id: n.id, c: c, base: base, stroke: stroke, last: p, scale: c.width / n.w, cloneOff: RT.cloneSrc ? { x: RT.cloneSrc.x - p.x, y: RT.cloneSrc.y - p.y } : null };
    RR.rasters[n.id].live = true;
    dab(p);
    composite();
  }
  function dab(p) {
    var o = RT.opts, g = act.stroke.getContext('2d'), r = Math.max(0.5, o.size * act.scale / 2 / Math.max(0.25, RR.view.z) * RR.view.z / RR.view.z);
    r = Math.max(0.5, o.size / 2 * act.scale);
    var from = act.last, dist = Math.hypot(p.x - from.x, p.y - from.y), step = Math.max(1, r * 0.25), n = Math.max(1, Math.ceil(dist / step));
    for (var i = 0; i <= n; i++) {
      var x = from.x + (p.x - from.x) * i / n, y = from.y + (p.y - from.y) * i / n;
      if (RT.tool === 'clone') {
        g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
        g.drawImage(act.base, act.cloneOff.x, act.cloneOff.y); g.restore();
        continue;
      }
      var grad = g.createRadialGradient(x, y, 0, x, y, r), col = RT.tool === 'dodge' ? '#ffffff' : RT.tool === 'burn' ? '#000000' : RT.tool === 'eraser' ? '#000000' : o.color;
      var rgb = hexRgb(col), hard = Math.min(0.99, o.hardness);
      grad.addColorStop(0, 'rgba(' + rgb + ',1)'); grad.addColorStop(hard, 'rgba(' + rgb + ',1)'); grad.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    act.last = p;
  }
  function composite() {
    var g = act.c.getContext('2d'), o = RT.opts;
    var st = act.stroke;
    var mask = RR.maskCanvas && RR.maskCanvas.id === act.id ? RR.maskCanvas.canvas : null;
    if (mask) { var t = doc.createElement('canvas'); t.width = st.width; t.height = st.height; var tg = t.getContext('2d'); tg.drawImage(st, 0, 0); tg.globalCompositeOperation = 'destination-in'; tg.drawImage(mask, 0, 0, st.width, st.height); st = t; }
    g.save(); g.globalCompositeOperation = 'copy'; g.drawImage(act.base, 0, 0); g.restore();
    g.save();
    g.globalAlpha = RT.tool === 'dodge' || RT.tool === 'burn' ? 0.25 * o.bopacity : o.bopacity;
    g.globalCompositeOperation = RT.tool === 'eraser' ? 'destination-out' : RT.tool === 'dodge' || RT.tool === 'burn' ? 'soft-light' : 'source-over';
    g.drawImage(st, 0, 0);
    g.restore();
    RR.draw();
  }
  function paintMove(w) { var n = RD.get(act.id); var p = toPixel(n, act.c, w); dab(p); composite(); }
  function paintEnd(a) {
    var n = RD.get(a.id); if (!n) return;
    commitRaster(n.id, a.c);
  }
  /** Simpan isi kanvas lapisan ke node (PNG/WebP) tanpa kedip. */
  function commitRaster(id, canvas) {
    var url;
    try { url = canvas.toDataURL('image/webp', 0.94); if (url.indexOf('image/webp') < 0) url = canvas.toDataURL('image/png'); } catch (e) { return; }
    var im = new Image();
    im.onload = function () { RR.imgs[url] = { el: im, ok: true }; RD.set(id, { src: url }); if (RR.rasters[id]) RR.rasters[id].live = false; delete RR.rasters[id]; RR.invalidate(id); };
    im.src = url;
  }
  RT.commitRaster = commitRaster;
  RT.layerCanvas = layerCanvas;
  function hexRgb(h) { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join(''); var n = parseInt(h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(','); }

  /* ---------------------------------------------------------- seleksi piksel */
  function downSelArea(e, w) {
    var n = rasterTarget(w, false);
    if (!n) { SN.ui.toast(SN.t('r_need_image'), 'warn'); return; }
    act = { type: 'selarea', id: n.id, x0: w.x, y0: w.y, x1: w.x, y1: w.y, pts: [[w.x, w.y]], add: e.shiftKey, sub: e.altKey };
    RR.overlay = [selAreaOverlay, maskOverlay];
  }
  function selAreaOverlay(ctx, z, acc) {
    if (!act || act.type !== 'selarea') return;
    ctx.save(); ctx.strokeStyle = acc; ctx.lineWidth = 1 / z; ctx.setLineDash([4 / z, 3 / z]); ctx.beginPath();
    if (RT.tool === 'lasso') { act.pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); }
    else if (RT.tool === 'emarquee') ctx.ellipse((act.x0 + act.x1) / 2, (act.y0 + act.y1) / 2, Math.abs(act.x1 - act.x0) / 2, Math.abs(act.y1 - act.y0) / 2, 0, 0, 7);
    else ctx.rect(Math.min(act.x0, act.x1), Math.min(act.y0, act.y1), Math.abs(act.x1 - act.x0), Math.abs(act.y1 - act.y0));
    ctx.stroke(); ctx.restore();
  }
  function maskOverlay(ctx, z) {
    var m = RR.maskCanvas; if (!m) return;
    var n = RD.get(m.id); if (!n) return;
    if (!m.tint) {
      var t = doc.createElement('canvas'); t.width = m.canvas.width; t.height = m.canvas.height; var g = t.getContext('2d');
      g.fillStyle = 'rgba(232, 89, 12, .35)'; g.fillRect(0, 0, t.width, t.height); g.globalCompositeOperation = 'destination-in'; g.drawImage(m.canvas, 0, 0);
      m.tint = t;
    }
    ctx.save(); var cx = n.x + n.w / 2, cy = n.y + n.h / 2; if (n.rot) { ctx.translate(cx, cy); ctx.rotate(RG.rad(n.rot)); ctx.translate(-cx, -cy); }
    ctx.drawImage(m.tint, n.x, n.y, n.w, n.h); ctx.restore();
  }
  RT.maskOverlay = maskOverlay;
  function ensureMask(n) {
    var c = layerCanvas(n); if (!c) return null;
    if (!RR.maskCanvas || RR.maskCanvas.id !== n.id) { var m = doc.createElement('canvas'); m.width = c.width; m.height = c.height; RR.maskCanvas = { id: n.id, canvas: m }; }
    RR.maskCanvas.tint = null;
    return RR.maskCanvas.canvas;
  }
  function endSelArea(a) {
    var n = RD.get(a.id); if (!n) return;
    var mask = ensureMask(n); if (!mask) return;
    var g = mask.getContext('2d'), c = mask;
    if (!a.add && !a.sub) g.clearRect(0, 0, c.width, c.height);
    g.save(); g.globalCompositeOperation = a.sub ? 'destination-out' : 'source-over'; g.fillStyle = '#000'; g.beginPath();
    var P = function (x, y) { return toPixel(n, c, { x: x, y: y }); };
    if (RT.tool === 'lasso') a.pts.forEach(function (p, i) { var q = P(p[0], p[1]); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
    else { var p0 = P(Math.min(a.x0, a.x1), Math.min(a.y0, a.y1)), p1 = P(Math.max(a.x0, a.x1), Math.max(a.y0, a.y1)); if (RT.tool === 'emarquee') g.ellipse((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, Math.abs(p1.x - p0.x) / 2, Math.abs(p1.y - p0.y) / 2, 0, 0, 7); else g.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y); }
    g.closePath(); g.fill(); g.restore();
    RR.overlay = [maskOverlay];
    RD.emit('mask');
  }
  function wand(w, add) {
    var n = rasterTarget(w, false); if (!n) { SN.ui.toast(SN.t('r_need_image'), 'warn'); return; }
    var c = layerCanvas(n); if (!c) return;
    var p = toPixel(n, c, w), W = c.width, H = c.height, sx = Math.floor(p.x), sy = Math.floor(p.y);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
    var data = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    var mask = ensureMask(n), mg = mask.getContext('2d'), md = add ? mg.getImageData(0, 0, W, H) : mg.createImageData(W, H);
    var i0 = (sy * W + sx) * 4, r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2], a0 = data[i0 + 3], tol = RT.opts.tolerance;
    var seen = new Uint8Array(W * H), stack = [sx + sy * W];
    while (stack.length) {
      var k = stack.pop(); if (seen[k]) continue; seen[k] = 1;
      var j = k * 4;
      if (Math.abs(data[j] - r0) + Math.abs(data[j + 1] - g0) + Math.abs(data[j + 2] - b0) + Math.abs(data[j + 3] - a0) > tol * 3) continue;
      md.data[j + 3] = 255;
      var x = k % W, y = (k / W) | 0;
      if (x > 0) stack.push(k - 1); if (x < W - 1) stack.push(k + 1); if (y > 0) stack.push(k - W); if (y < H - 1) stack.push(k + W);
    }
    mg.putImageData(md, 0, 0);
    RR.maskCanvas.tint = null;
    RR.overlay = [maskOverlay];
    RD.emit('mask'); RR.draw();
  }
  function bucket(w) {
    var n = rasterTarget(w, false); if (!n) { SN.ui.toast(SN.t('r_need_image'), 'warn'); return; }
    wand(w, false);
    RT.maskOp('fill');
    RR.maskCanvas = null; RR.overlay = [];
  }
  /** Operasi atas seleksi piksel: hapus, isi, salin ke lapisan baru, balik, potong. */
  RT.maskOp = function (op) {
    var m = RR.maskCanvas; if (!m) { SN.ui.toast(SN.t('r_no_selection'), 'warn'); return; }
    var n = RD.get(m.id), c = layerCanvas(n); if (!c) return;
    var g = c.getContext('2d');
    if (op === 'invert') { var t = doc.createElement('canvas'); t.width = c.width; t.height = c.height; var tg = t.getContext('2d'); tg.fillRect(0, 0, t.width, t.height); tg.globalCompositeOperation = 'destination-out'; tg.drawImage(m.canvas, 0, 0); m.canvas = t; m.tint = null; RR.draw(); return; }
    if (op === 'deselect') { RR.maskCanvas = null; RR.overlay = []; RR.draw(); return; }
    if (op === 'all') { var mg = m.canvas.getContext('2d'); mg.fillRect(0, 0, m.canvas.width, m.canvas.height); m.tint = null; RR.draw(); return; }
    if (op === 'delete') { g.save(); g.globalCompositeOperation = 'destination-out'; g.drawImage(m.canvas, 0, 0); g.restore(); commitRaster(n.id, c); }
    if (op === 'fill') { var f = doc.createElement('canvas'); f.width = c.width; f.height = c.height; var fg = f.getContext('2d'); fg.fillStyle = RT.opts.color; fg.fillRect(0, 0, f.width, f.height); fg.globalCompositeOperation = 'destination-in'; fg.drawImage(m.canvas, 0, 0); g.drawImage(f, 0, 0); commitRaster(n.id, c); }
    if (op === 'copy' || op === 'cut' || op === 'crop') {
      var bb = maskBounds(m.canvas); if (!bb) return;
      var out = doc.createElement('canvas'); out.width = bb.w; out.height = bb.h; var og = out.getContext('2d');
      og.drawImage(c, -bb.x, -bb.y); og.globalCompositeOperation = 'destination-in'; og.drawImage(m.canvas, -bb.x, -bb.y);
      var sx = n.w / c.width, sy = n.h / c.height;
      var box = { x: n.x + bb.x * sx, y: n.y + bb.y * sy, w: bb.w * sx, h: bb.h * sy };
      if (op === 'crop') {
        var cc = doc.createElement('canvas'); cc.width = bb.w; cc.height = bb.h; cc.getContext('2d').drawImage(c, -bb.x, -bb.y);
        RD.batch(function () { RD.set(n.id, box); });
        commitRaster(n.id, cc); RR.maskCanvas = null; RR.overlay = []; return;
      }
      var url = out.toDataURL('image/png');
      var id;
      RD.batch(function () { id = RD.add(Object.assign({ type: 'raster', src: url, name: SN.t('r_t_layer'), parent: n.parent || '', _o: SN.Collab.between(n._o, '') }, box)); });
      if (op === 'cut') { g.save(); g.globalCompositeOperation = 'destination-out'; g.drawImage(m.canvas, 0, 0); g.restore(); commitRaster(n.id, c); }
      RR.maskCanvas = null; RR.overlay = []; RT.select([id]);
    }
    RR.draw();
  };
  function maskBounds(m) {
    var d = m.getContext('2d').getImageData(0, 0, m.width, m.height).data, x0 = m.width, y0 = m.height, x1 = -1, y1 = -1;
    for (var y = 0; y < m.height; y++) for (var x = 0; x < m.width; x++) if (d[(y * m.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /* ---------------------------------------------------------- crop */
  function downCrop(w) {
    var n = rasterTarget(w, false); if (!n) { SN.ui.toast(SN.t('r_need_image'), 'warn'); return; }
    if (!act || act.type !== 'crop' || act.id !== n.id) act = { type: 'crop', id: n.id, box: { x: n.x, y: n.y, w: n.w, h: n.h } };
    act.dragging = true; act.start = w;
    var b = act.box, tol = 10 / RR.view.z;
    act.edge = { l: Math.abs(w.x - b.x) < tol, r: Math.abs(w.x - b.x - b.w) < tol, t: Math.abs(w.y - b.y) < tol, b: Math.abs(w.y - b.y - b.h) < tol };
    act.orig = Object.assign({}, b);
    if (RR.overlay.indexOf(cropOverlay) < 0) RR.overlay.push(cropOverlay);
  }
  function cropDrag(w) {
    if (!act.dragging) return;
    var n = RD.get(act.id), o = act.orig, e = act.edge, b = Object.assign({}, o), dx = w.x - act.start.x, dy = w.y - act.start.y;
    if (!e.l && !e.r && !e.t && !e.b) { b.x = Math.min(Math.max(n.x, o.x + dx), n.x + n.w - o.w); b.y = Math.min(Math.max(n.y, o.y + dy), n.y + n.h - o.h); }
    if (e.l) { b.x = Math.max(n.x, Math.min(o.x + dx, o.x + o.w - 4)); b.w = o.x + o.w - b.x; }
    if (e.r) b.w = Math.max(4, Math.min(o.w + dx, n.x + n.w - o.x));
    if (e.t) { b.y = Math.max(n.y, Math.min(o.y + dy, o.y + o.h - 4)); b.h = o.y + o.h - b.y; }
    if (e.b) b.h = Math.max(4, Math.min(o.h + dy, n.y + n.h - o.y));
    act.box = b; RR.draw();
  }
  function cropOverlay(ctx, z, acc) {
    if (!act || act.type !== 'crop') return;
    var n = RD.get(act.id), b = act.box; if (!n) return;
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.rect(n.x, n.y, n.w, n.h); ctx.rect(b.x + b.w, b.y, -b.w, b.h); ctx.fill('evenodd');
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 / z; ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.lineWidth = 0.6 / z; for (var i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(b.x + b.w * i / 3, b.y); ctx.lineTo(b.x + b.w * i / 3, b.y + b.h); ctx.moveTo(b.x, b.y + b.h * i / 3); ctx.lineTo(b.x + b.w, b.y + b.h * i / 3); ctx.stroke(); }
    ctx.restore();
  }
  RT.applyCrop = function () {
    if (!act || act.type !== 'crop') return false;
    var a = act; act = null; RR.overlay = RR.overlay.filter(function (o) { return o !== cropOverlay; });
    var n = RD.get(a.id), c = layerCanvas(n); if (!c || n.rot) { RR.draw(); return true; }
    var sx = c.width / n.w, sy = c.height / n.h, b = a.box;
    var out = doc.createElement('canvas'); out.width = Math.max(1, Math.round(b.w * sx)); out.height = Math.max(1, Math.round(b.h * sy));
    out.getContext('2d').drawImage(c, -(b.x - n.x) * sx, -(b.y - n.y) * sy);
    RD.set(n.id, { x: b.x, y: b.y, w: b.w, h: b.h });
    commitRaster(n.id, out);
    RT.setTool('select');
    return true;
  };
  RT.cancelTool = function () { if (act && (act.type === 'crop' || act.type === 'pen')) { if (act.type === 'pen') { finishPen(false); return; } act = null; RR.overlay = []; RR.draw(); return true; } return false; };

  /* ---------------------------------------------------------- pipet */
  function eyedrop(w, toStroke) {
    var c = RR.renderArea({ x: w.x, y: w.y, w: 1, h: 1 }, 1, { bg: RR.bg });
    var d = c.getContext('2d').getImageData(0, 0, 1, 1).data;
    var hex = '#' + [d[0], d[1], d[2]].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
    if (RR.sel.length) RD.batch(function () { RR.sel.forEach(function (id) { var n = RD.get(id); RD.set(id, n.type === 'text' ? { color: hex } : toStroke ? { stroke: hex } : { fill: hex }); }); });
    RT.opts.color = hex; if (toStroke) RT.opts.stroke = hex; else RT.opts.fill = hex;
    RD.emit('opts'); SN.ui.toast(hex.toUpperCase());
  }

  /* ---------------------------------------------------------- klik ganda */
  function dbl(e) {
    var w = world(e);
    if (RT.tool === 'pen') { finishPen(false); return; }
    if (RT.tool === 'crop') { RT.applyCrop(); return; }
    var n = RR.hit(w.x, w.y, { deep: true });
    if (!n) return;
    if (RR.sel.indexOf(n.id) < 0) { var top = RR.hit(w.x, w.y); if (top && top.type === 'group' && RR.sel.indexOf(top.id) >= 0) { RT.select([n.id]); return; } }
    if (n.type === 'text' || n.type === 'sticky' || ((n.type === 'rect' || n.type === 'ellipse' || n.type === 'polygon') && RT.mode === 'board')) { RT.select([n.id]); RT.editText(n.id); return; }
    if (n.type === 'conn') { SN.ui.prompt(SN.t('r_conn_label'), n.text || '').then(function (v) { if (v !== null) RD.set(n.id, { text: v }); }); return; }
    if (n.type === 'image' || n.type === 'raster') { RT.select([n.id]); RT.setTool('crop'); downCrop(w); act.dragging = false; return; }
    if (n.type === 'frame' || n.type === 'group') { var inner = RD.children(n.id).reverse().find(function (c) { var b = RG.bounds(c); return w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h; }); if (inner) RT.select([inner.id]); return; }
    RT.select([n.id]); RT.enterNodeEdit(n.id);
  }

  /* ---------------------------------------------------------- zoom & sentuh */
  function wheel(e) {
    e.preventDefault();
    var s = screen(e);
    if (e.ctrlKey || e.metaKey) RR.zoomAt(s.x, s.y, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025)));
    else { RR.view.x -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX; RR.view.y -= e.shiftKey && !e.deltaX ? 0 : e.deltaY; RR.draw(); RD.emit('view'); }
  }
  var pinch = null;
  function startPinch() {
    act = null; RR.overlay = RR.overlay.filter(function (o) { return o === nodeOverlay || o === maskOverlay; });
    var p = Object.keys(ptr).map(function (k) { return ptr[k]; });
    pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), c: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, view: Object.assign({}, RR.view) };
    if (RD.tx) RD.end();
  }
  function doPinch() {
    var p = Object.keys(ptr).map(function (k) { return ptr[k]; }); if (p.length < 2) return;
    var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), c = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
    var z = Math.min(64, Math.max(0.02, pinch.view.z * d / pinch.d)), wx = (pinch.c.x - pinch.view.x) / pinch.view.z, wy = (pinch.c.y - pinch.view.y) / pinch.view.z;
    RR.view = { z: z, x: c.x - wx * z, y: c.y - wy * z };
    RR.draw(); RD.emit('view');
  }

  /* ---------------------------------------------------------- keyboard */
  function key(e) {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable=true]')) return;
    var mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (e.code === 'Space' && !spaceDown) { spaceDown = true; setCursor(); e.preventDefault(); return; }
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) RD.doRedo(); else RD.doUndo(); afterHistory(); return; }
    if (mod && k === 'y') { e.preventDefault(); RD.doRedo(); afterHistory(); return; }
    if (mod && k === 'a') { e.preventDefault(); if (RR.maskCanvas) RT.maskOp('all'); else RT.select(RD.nodes(undefined, '').filter(function (n) { return !n.locked && n.visible !== false; }).map(function (n) { return n.id; })); return; }
    if (mod && k === 'd') { e.preventDefault(); if (RR.maskCanvas) { RT.maskOp('deselect'); return; } RT.select(RD.duplicate(RR.sel, 20, 20)); return; }
    if (mod && k === 'g') { e.preventDefault(); if (e.shiftKey) RR.sel.slice().forEach(function (id) { RT.select(RD.ungroup(id)); }); else { var g = RD.group(RR.sel); if (g) RT.select([g]); } return; }
    if (mod && k === 's') { e.preventDefault(); RD.save(true); SN.ui.toast(SN.t('sn_saved')); return; }
    if (mod && k === ']') { e.preventDefault(); RD.reorder(RR.sel, e.shiftKey ? 'front' : 'up'); return; }
    if (mod && k === '[') { e.preventDefault(); RD.reorder(RR.sel, e.shiftKey ? 'back' : 'down'); return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); var s = RR.size(); RR.zoomAt(s.w / 2, s.h / 2, 1.25); return; }
    if (mod && k === '-') { e.preventDefault(); var s2 = RR.size(); RR.zoomAt(s2.w / 2, s2.h / 2, 0.8); return; }
    if (mod && k === '0') { e.preventDefault(); RT.zoomFit(); return; }
    if (mod && k === '1') { e.preventDefault(); var s3 = RR.size(); RR.zoomAt(s3.w / 2, s3.h / 2, 1 / RR.view.z); return; }
    if (mod && e.altKey && k === 'k') { e.preventDefault(); RD.emit('makeComponent'); return; }
    if (mod) return;
    if (e.shiftKey && k === '1') { RT.zoomFit(); return; }
    if (e.shiftKey && k === '2') { RT.zoomSel(); return; }
    if (k === 'escape') {
      if (RT.cancelTool()) return;
      if (RR.nodeEdit) { RT.normalizePath(RR.nodeEdit.id); RR.nodeEdit = null; RR.overlay = []; RD.emit('nodeedit', null); RR.draw(); return; }
      if (RR.maskCanvas) { RT.maskOp('deselect'); return; }
      if (RT.tool !== 'select') { RT.setTool('select'); return; }
      var first = RD.get(RR.sel[0]); if (first && first.parent) { RT.select([first.parent]); return; }
      RT.select([]); return;
    }
    if (k === 'enter') {
      if (RT.applyCrop()) return;
      if (act && act.type === 'pen') { finishPen(false); return; }
      var one = RD.get(RR.sel[0]); if (one && (one.type === 'text' || one.type === 'sticky')) { e.preventDefault(); RT.editText(one.id); return; }
      if (one && (one.type === 'group' || one.type === 'frame')) { var kids = RD.children(one.id); if (kids.length) RT.select(kids.map(function (c) { return c.id; })); return; }
      if (one) { RT.enterNodeEdit(one.id); return; }
    }
    if (k === 'backspace' || k === 'delete') {
      e.preventDefault();
      if (RR.maskCanvas) { RT.maskOp('delete'); return; }
      if (RR.nodeEdit && RR.nodeEdit.sel >= 0) { var ne = RR.nodeEdit, pn = RD.get(ne.id), d = JSON.parse(JSON.stringify(pn.d)); if (d[ne.sp].pts.length > 2) { d[ne.sp].pts.splice(ne.sel, 1); RD.set(ne.id, { d: d }); ne.sel = -1; } return; }
      var del = RR.sel.filter(function (id) { var n = RD.get(id); return n && !n.locked; });
      var parents = del.map(function (id) { return RD.get(id).parent; }).filter(Boolean);
      RD.remove(del); RT.select([]);
      parents.forEach(function (p) { var g = RD.get(p); if (g && g.type === 'group') RD.fitGroup(p); if (g && g.layout && g.layout.dir) RD.layout(p); });
      return;
    }
    if (k.indexOf('arrow') === 0 && RR.sel.length) {
      e.preventDefault();
      var step = e.shiftKey ? 10 : 1, dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
      RD.batch(function () { RD.moveBy(RR.sel.filter(function (id) { return !RD.get(id).locked; }), dx, dy); afterTransform(); });
      return;
    }
    if (k === '[' || k === ']') { RT.opts.size = Math.max(1, Math.min(500, RT.opts.size * (k === ']' ? 1.2 : 0.83))); RD.emit('opts'); return; }
    var map = RT.keymap && RT.keymap[e.shiftKey ? 'S' + k : k];
    if (map) { e.preventDefault(); RT.setTool(map); }
  }
  function afterHistory() { RR.sel = RR.sel.filter(function (id) { return RD.get(id); }); RR.rasters = {}; RR.fxCache = {}; RD.emit('select', RR.sel); RR.draw(); }
  RT.afterHistory = afterHistory;
  RT.zoomFit = function () { var ns = RD.nodes(); RR.fit(ns.length ? RG.union(ns.map(RG.bounds)) : null); };
  RT.zoomSel = function () { var ns = RR.sel.map(RD.get).filter(Boolean); if (ns.length) RR.fit(RG.union(ns.map(RG.bounds))); };

  /* ---------------------------------------------------------- salin/tempel/impor */
  function copy(e) {
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable=true]')) return false;
    if (!RR.sel.length) return false;
    var all = [];
    RR.sel.forEach(function (id) { var n = RD.get(id); if (!n) return; all.push(n); RD.descendants(id).forEach(function (d) { all.push(d); }); });
    e.clipboardData.setData('text/plain', JSON.stringify({ rupa: 1, nodes: all, roots: RR.sel }));
    e.preventDefault();
    return true;
  }
  function paste(e) {
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable=true]')) return;
    var cd = e.clipboardData;
    var file = Array.prototype.find.call(cd.files || [], function (f) { return /^image\//.test(f.type); });
    var center = RT.mouse || RR.toWorld(RR.size().w / 2, RR.size().h / 2);
    if (file) { e.preventDefault(); RT.insertImage(file, center.x, center.y); return; }
    var txt = cd.getData('text/plain');
    if (!txt) return;
    e.preventDefault();
    var data = null; try { data = JSON.parse(txt); } catch (x) {}
    if (data && data.rupa) {
      var map = {}, roots = [];
      var b = RG.union(data.nodes.filter(function (n) { return data.roots.indexOf(n.id) >= 0; }).map(RG.bounds));
      var dx = RT.mouse ? center.x - b.x - b.w / 2 : 20, dy = RT.mouse ? center.y - b.y - b.h / 2 : 20;
      RD.batch(function () {
        data.nodes.forEach(function (n) { map[n.id] = RG.uid('n'); });
        data.nodes.forEach(function (n) {
          var f = JSON.parse(JSON.stringify(n)); delete f.id;
          f.page = RD.page; f.x += dx; f.y += dy; f.parent = map[n.parent] || (data.roots.indexOf(n.id) >= 0 ? '' : n.parent || '');
          if (data.roots.indexOf(n.id) >= 0) { f._o = SN.Collab.between(RD.topOrder(''), ''); roots.push(map[n.id]); }
          if (f.type === 'conn') { if (f.from && map[f.from.id]) f.from.id = map[f.from.id]; if (f.to && map[f.to.id]) f.to.id = map[f.to.id]; }
          RD.set(map[n.id], Object.assign({ kind: 'node' }, f));
        });
      });
      RT.select(roots);
      return;
    }
    if (/^\s*<svg[\s>]/i.test(txt)) { RT.importSVG(txt, center.x, center.y); return; }
    var id = RD.add({ type: RT.mode === 'board' ? 'sticky' : 'text', x: center.x, y: center.y, w: RT.mode === 'board' ? 200 : 10, h: RT.mode === 'board' ? 200 : 30, text: txt.slice(0, 5000), autoW: RT.mode !== 'board', fsize: RT.mode === 'board' ? 18 : 20, fill: RT.mode === 'board' ? RT.opts.sticky : undefined, color: '#1b1e2b' });
    var n = RD.get(id); if (n.type === 'text') { var m = RR.measureText(n); RD.set(id, { w: m.w, h: m.h }); }
    RT.select([id]);
  }
  RT.insertImage = function (file, x, y) {
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      var max = 2560, s = Math.min(1, max / Math.max(im.width, im.height)), c = doc.createElement('canvas');
      c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      var src = c.toDataURL(file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif' ? 'image/png' : 'image/jpeg', 0.9);
      var vw = RR.size().w / RR.view.z * 0.6, k = Math.min(1, vw / c.width);
      var w = c.width * k, h = c.height * k;
      var f = frameAt({ x: x, y: y }, []);
      var id = RD.add({ type: 'image', src: src, x: x - w / 2, y: y - h / 2, w: w, h: h, name: file.name || SN.t('r_t_image'), parent: f ? f.id : '' });
      RT.select([id]);
    };
    im.src = url;
  };
  /** Impor SVG dasar: path, rect, circle, ellipse, line, polyline, polygon, text. */
  RT.importSVG = function (txt, cx, cy) {
    var d = new DOMParser().parseFromString(txt, 'image/svg+xml'), svg = d.querySelector('svg'); if (!svg) return;
    var host = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); host.style.cssText = 'position:absolute;left:-99999px;top:0'; host.innerHTML = svg.innerHTML;
    var vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    doc.body.appendChild(host);
    var ids = [];
    RD.batch(function () {
      host.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text').forEach(function (el) {
        var st = getComputedStyle(el), fill = el.getAttribute('fill') || st.fill, stroke = el.getAttribute('stroke') || st.stroke, sw = parseFloat(el.getAttribute('stroke-width') || st.strokeWidth) || 0;
        var norm = function (c) { return !c || c === 'none' || /url\(/.test(c) ? (c === 'none' ? 'none' : '#000') : c; };
        if (el.tagName === 'text') { var b0 = el.getBBox(); ids.push(RD.add({ type: 'text', x: b0.x, y: b0.y, w: b0.width, h: b0.height, text: el.textContent, fsize: parseFloat(st.fontSize) || 16, color: norm(fill), autoW: true })); return; }
        var len = el.getTotalLength ? el.getTotalLength() : 0; if (!len) return;
        var n = Math.min(600, Math.max(8, Math.round(len / 3))), pts = [];
        var ctm = el.getCTM();
        for (var i = 0; i <= n; i++) { var p = el.getPointAtLength(len * i / n); if (ctm) p = p.matrixTransform(ctm); pts.push([p.x, p.y]); }
        pts = RG.simplify(pts, 0.4);
        var closed = /rect|circle|ellipse|polygon/.test(el.tagName) || /z\s*$/i.test(el.getAttribute('d') || '');
        var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
        var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys), w = Math.max(1, Math.max.apply(null, xs) - x), h = Math.max(1, Math.max.apply(null, ys) - y);
        ids.push(RD.add({ type: 'path', x: x, y: y, w: w, h: h, d: [{ closed: closed, pts: pts.map(function (p) { return { x: (p[0] - x) / w, y: (p[1] - y) / h }; }) }], fill: closed ? norm(fill) : 'none', stroke: norm(stroke), sw: sw, name: el.id || el.tagName }));
      });
      if (ids.length) {
        var b = RG.union(ids.map(function (id) { return RG.bounds(RD.get(id)); }));
        RD.moveBy(ids, cx - b.x - b.w / 2, cy - b.y - b.h / 2);
        var g = ids.length > 1 ? RD.group(ids) : ids[0];
        if (g && ids.length > 1) RD.set(g, { name: 'SVG' });
        ids = [g];
      }
    });
    host.remove();
    RT.select(ids.filter(Boolean));
  };
})(window);
