/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Board: kanvas multi fungsi (whiteboard, mindmap, kanban, moodboard, flow,
   peta perjalanan, rencana, brainstorm, dashboard ringan) sebagai artifact
   type="board". Model menulis JSON; Sinai menata, menggambar dan membuatnya
   bisa digeser, di-zoom dan diedit langsung. Perubahan pengguna dikirim ke
   panel (type "board") supaya AI membaca versi terbaru di pesan berikutnya.

   Bentuk JSON:
   { "title": "...", "background": "dots|grid|plain", "layout": "auto|mindmap|flow",
     "items": [ { "id", "type", "x", "y", "w", "h", "color", "parent", ... } ],
     "edges": [ { "from", "to", "label", "style": "arrow|line|dashed" } ] }
   type: note, text, shape (shape: rect|ellipse|diamond|pill), card, frame,
         image (src), list (items: [{text, done}]), kanban (columns: [{title, cards: []}]),
         table (rows: [[...]]), chart (kind: bar|line|pie, labels, values), link (url). */
(function () {
  'use strict';

  /** JSON longgar dari model: buang pagar kode, koma berlebih, komentar. */
  function parse(src) {
    var s = String(src || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return normalize(JSON.parse(s)); } catch (e) { /* coba perbaiki */ }
    var fixed = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1');
    try { return normalize(JSON.parse(fixed)); } catch (e2) { return { error: e2.message, title: 'Board', items: [], edges: [] }; }
  }

  function normalize(b) {
    if (Array.isArray(b)) b = { items: b };
    b = b && typeof b === 'object' ? b : {};
    var items = Array.isArray(b.items) ? b.items : Array.isArray(b.nodes) ? b.nodes : [];
    var seen = {};
    items = items.filter(function (it) { return it && typeof it === 'object'; }).map(function (it, i) {
      var o = Object.assign({}, it);
      o.id = String(o.id || 'i' + (i + 1));
      if (seen[o.id]) o.id += '_' + i;
      seen[o.id] = 1;
      o.type = String(o.type || (o.columns ? 'kanban' : o.rows ? 'table' : o.values ? 'chart' : o.src ? 'image' : o.shape ? 'shape' : 'note')).toLowerCase();
      if (o.text == null && o.label != null) o.text = o.label;
      return o;
    });
    var edges = (Array.isArray(b.edges) ? b.edges : Array.isArray(b.links) ? b.links : []).filter(function (e) { return e && e.from != null && e.to != null; })
      .map(function (e) { return Object.assign({}, e, { from: String(e.from), to: String(e.to) }); });
    return { title: String(b.title || 'Board'), background: b.background || 'dots', layout: b.layout || 'auto', items: items, edges: edges };
  }

  function json(b) { return JSON.stringify(b, null, 2); }

  // Ukuran bawaan per jenis (dipakai tata letak otomatis bila x/y/w/h tidak ada).
  var SIZE = { note: [220, 150], text: [320, 60], shape: [180, 90], card: [260, 150], frame: [640, 420], image: [280, 200],
    list: [260, 200], kanban: [720, 340], table: [420, 180], chart: [420, 260], link: [260, 70] };

  /** Lengkapi posisi: mindmap (pohon dari `parent`), flow (berdasar edges), atau grid. */
  function layout(b) {
    b.items.forEach(function (it) {
      var d = SIZE[it.type] || SIZE.note;
      if (!(it.w > 0)) it.w = d[0];
      if (!(it.h > 0)) it.h = it.type === 'kanban' ? Math.max(d[1], 120 + 64 * Math.max.apply(null, [1].concat((it.columns || []).map(function (c) { return (c.cards || []).length; })))) : d[1];
    });
    var missing = b.items.filter(function (it) { return typeof it.x !== 'number' || typeof it.y !== 'number'; });
    if (!missing.length) return b;
    var byId = {};
    b.items.forEach(function (it) { byId[it.id] = it; });
    var hasParent = b.items.some(function (it) { return it.parent && byId[it.parent]; });
    if (b.layout === 'mindmap' || hasParent) {
      // Pohon horizontal; tepi otomatis dari parent.
      var kids = {};
      b.items.forEach(function (it) { if (it.parent && byId[it.parent]) (kids[it.parent] = kids[it.parent] || []).push(it); });
      var roots = b.items.filter(function (it) { return !(it.parent && byId[it.parent]); });
      var y = 0;
      var place = function (it, depth) {
        var ch = kids[it.id] || [];
        if (typeof it.x !== 'number') it.x = depth * 300;
        if (!ch.length) { if (typeof it.y !== 'number') it.y = y; y += it.h + 30; return; }
        var start = y;
        ch.forEach(function (c) { place(c, depth + 1); });
        if (typeof it.y !== 'number') it.y = (start + y - 30) / 2 - it.h / 2;
      };
      roots.forEach(function (r) { place(r, 0); y += 40; });
      b.items.forEach(function (it) {
        if (it.parent && byId[it.parent] && !b.edges.some(function (e) { return e.from === it.parent && e.to === it.id; })) b.edges.push({ from: it.parent, to: it.id, style: 'line', auto: true });
      });
      return b;
    }
    if (b.layout === 'flow' && b.edges.length) {
      // Lapisan dari kiri ke kanan mengikuti panah.
      var level = {};
      b.items.forEach(function (it) { level[it.id] = 0; });
      for (var pass = 0; pass < b.items.length; pass++) {
        var moved = false;
        b.edges.forEach(function (e) { if (level[e.from] != null && level[e.to] != null && level[e.to] <= level[e.from]) { level[e.to] = level[e.from] + 1; moved = true; } });
        if (!moved) break;
      }
      var rows = {};
      missing.forEach(function (it) {
        var l = level[it.id] || 0;
        rows[l] = (rows[l] || 0);
        it.x = l * 300; it.y = rows[l]; rows[l] += it.h + 50;
      });
      return b;
    }
    // Grid: baris dengan lebar maks ±1400px.
    var x = 0, yy = 0, rowH = 0;
    b.items.forEach(function (it) {
      if (typeof it.x === 'number' && typeof it.y === 'number') { yy = Math.max(yy, it.y + it.h + 40 - rowH); return; }
    });
    missing.forEach(function (it) {
      if (x > 0 && x + it.w > 1400) { x = 0; yy += rowH + 40; rowH = 0; }
      it.x = x; it.y = yy;
      x += it.w + 40; rowH = Math.max(rowH, it.h);
    });
    return b;
  }

  /* Runtime di dalam iframe (diserialisasi dengan toString — jangan pakai variabel luar). */
  function runtime(B, opts) {
    var COLORS = { yellow: '#fff3b0', blue: '#dbeafe', green: '#dcfce7', pink: '#fce7f3', purple: '#ede9fe', orange: '#ffedd5', red: '#fee2e2', gray: '#f1f5f9', white: '#ffffff', teal: '#ccfbf1' };
    var col = function (c, d) { return COLORS[c] || (c && /^#|^rgb|^hsl/.test(c) ? c : d); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var md = function (s) {
      return esc(s).replace(/^### (.*)$/gm, '<b class="h3">$1</b>').replace(/^## (.*)$/gm, '<b class="h2">$1</b>').replace(/^# (.*)$/gm, '<b class="h1">$1</b>')
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>').replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/^[-•] (.*)$/gm, '• $1').replace(/\n/g, '<br>');
    };
    var send = function (m) { try { m.__gx = 1; parent.postMessage(m, '*'); } catch (e) { /* ignore */ } };
    var root = document.getElementById('board'), world = document.getElementById('world'), svg = document.getElementById('edges');
    var view = { x: 40, y: 70, z: 1 }, sel = null, timer = null;
    var byId = function (id) { return B.items.filter(function (i) { return i.id === id; })[0]; };

    function changed() {
      clearTimeout(timer);
      timer = setTimeout(function () { send({ type: 'board', json: JSON.stringify(B) }); }, 500);
    }
    function apply() { world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.z + ')'; root.style.backgroundPosition = view.x + 'px ' + view.y + 'px'; root.style.backgroundSize = 24 * view.z + 'px ' + 24 * view.z + 'px'; document.getElementById('zoom').textContent = Math.round(view.z * 100) + '%'; }

    function chart(it) {
      var vals = (it.values || []).map(Number), labels = it.labels || [], w = it.w - 24, h = it.h - 56, max = Math.max.apply(null, [1].concat(vals));
      var pal = ['#6366f1', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#ec4899'];
      var out = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '">';
      if (it.kind === 'pie') {
        var sum = vals.reduce(function (a, b) { return a + b; }, 0) || 1, a0 = -Math.PI / 2, r = Math.min(w / 2 - 70, h / 2 - 6), cx = r + 6, cy = h / 2;
        vals.forEach(function (v, i) {
          var a1 = a0 + v / sum * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0;
          out += '<path d="M' + cx + ',' + cy + 'L' + (cx + r * Math.cos(a0)) + ',' + (cy + r * Math.sin(a0)) + 'A' + r + ',' + r + ' 0 ' + big + ' 1 ' + (cx + r * Math.cos(a1)) + ',' + (cy + r * Math.sin(a1)) + 'Z" fill="' + pal[i % 8] + '"/>';
          out += '<rect x="' + (2 * r + 20) + '" y="' + (8 + i * 18) + '" width="10" height="10" rx="2" fill="' + pal[i % 8] + '"/><text x="' + (2 * r + 36) + '" y="' + (17 + i * 18) + '" font-size="11">' + esc(labels[i] || '') + ' (' + Math.round(v / sum * 100) + '%)</text>';
          a0 = a1;
        });
      } else if (it.kind === 'line') {
        var step = vals.length > 1 ? (w - 20) / (vals.length - 1) : 0, pts = vals.map(function (v, i) { return (10 + i * step) + ',' + (h - 20 - v / max * (h - 34)); });
        out += '<polyline fill="none" stroke="#6366f1" stroke-width="2.5" points="' + pts.join(' ') + '"/>';
        pts.forEach(function (p, i) { var c = p.split(','); out += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="3.5" fill="#6366f1"/><text x="' + c[0] + '" y="' + (h - 4) + '" font-size="10" text-anchor="middle">' + esc(labels[i] || '') + '</text>'; });
      } else {
        var bw = (w - 10) / Math.max(1, vals.length);
        vals.forEach(function (v, i) {
          var bh = v / max * (h - 34);
          out += '<rect x="' + (5 + i * bw + bw * 0.15) + '" y="' + (h - 20 - bh) + '" width="' + bw * 0.7 + '" height="' + bh + '" rx="4" fill="' + pal[i % 8] + '"/>' +
            '<text x="' + (5 + i * bw + bw / 2) + '" y="' + (h - 24 - bh) + '" font-size="10" text-anchor="middle">' + esc(v) + '</text>' +
            '<text x="' + (5 + i * bw + bw / 2) + '" y="' + (h - 5) + '" font-size="10" text-anchor="middle">' + esc(labels[i] || '') + '</text>';
        });
      }
      return out + '</svg>';
    }

    function inner(it) {
      var t = it.type;
      if (t === 'image') return '<img src="' + esc(it.src) + '" alt="' + esc(it.text || '') + '" draggable="false">' + (it.text ? '<div class="cap" data-edit="text">' + esc(it.text) + '</div>' : '');
      if (t === 'frame') return '<div class="ftitle" data-edit="title">' + esc(it.title || it.text || 'Bagian') + '</div>';
      if (t === 'card') return (it.tag ? '<span class="tag">' + esc(it.tag) + '</span>' : '') + '<div class="ctitle" data-edit="title">' + esc(it.title || it.text || '') + '</div><div class="cbody" data-edit="body">' + md(it.body || '') + '</div>';
      if (t === 'list') return '<div class="ctitle" data-edit="title">' + esc(it.title || 'Daftar') + '</div>' + (it.items || []).map(function (x, i) {
        var o = typeof x === 'string' ? { text: x } : x;
        return '<label class="li"><input type="checkbox" data-i="' + i + '"' + (o.done ? ' checked' : '') + '><span>' + esc(o.text) + '</span></label>';
      }).join('');
      if (t === 'kanban') return (it.title ? '<div class="ctitle">' + esc(it.title) + '</div>' : '') + '<div class="cols">' + (it.columns || []).map(function (c, ci) {
        return '<div class="kcol" data-c="' + ci + '"><div class="khead">' + esc(c.title) + ' <small>' + (c.cards || []).length + '</small></div>' + (c.cards || []).map(function (k, ki) {
          return '<div class="kcard" draggable="true" data-c="' + ci + '" data-k="' + ki + '">' + md(typeof k === 'string' ? k : (k.text || k.title || '')) + '</div>';
        }).join('') + '</div>';
      }).join('') + '</div>';
      if (t === 'table') return (it.title ? '<div class="ctitle">' + esc(it.title) + '</div>' : '') + '<table>' + (it.rows || []).map(function (r, ri) {
        return '<tr>' + (r || []).map(function (c) { return ri === 0 ? '<th>' + esc(c) + '</th>' : '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</table>';
      if (t === 'chart') return '<div class="ctitle">' + esc(it.title || it.text || 'Grafik') + '</div>' + chart(it);
      if (t === 'link') return '<a href="' + esc(it.url) + '" target="_blank" rel="noopener">🔗 ' + esc(it.text || it.url) + '</a>';
      return '<div class="txt" data-edit="text">' + md(it.text || '') + '</div>';
    }

    function el(it) {
      var d = document.createElement('div');
      d.className = 'item t-' + it.type + (it.type === 'shape' ? ' s-' + (it.shape || 'rect') : '') + (sel === it.id ? ' sel' : '');
      d.dataset.id = it.id;
      d.style.cssText = 'left:' + it.x + 'px;top:' + it.y + 'px;width:' + it.w + 'px;' + (it.type === 'text' ? 'min-height:' + it.h + 'px;' : 'height:' + it.h + 'px;');
      var bg = { note: col(it.color, '#fff3b0'), shape: col(it.color, '#e0e7ff'), frame: col(it.color, 'rgba(99,102,241,.05)'), text: 'transparent' }[it.type] || col(it.color, '#fff');
      d.style.background = bg;
      if (it.type === 'text' && it.size) d.style.fontSize = it.size + 'px';
      d.innerHTML = inner(it) + '<span class="rz"></span>';
      return d;
    }

    function center(it) { return { x: it.x + it.w / 2, y: it.y + it.h / 2 }; }
    function edgePoint(it, toward) {
      var c = center(it), dx = toward.x - c.x, dy = toward.y - c.y;
      if (!dx && !dy) return c;
      var sx = (it.w / 2) / Math.abs(dx || 1e-9), sy = (it.h / 2) / Math.abs(dy || 1e-9), s = Math.min(sx, sy);
      return { x: c.x + dx * s, y: c.y + dy * s };
    }
    function drawEdges() {
      var out = '<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#64748b"/></marker></defs>';
      B.edges.forEach(function (e) {
        var a = byId(e.from), b = byId(e.to);
        if (!a || !b) return;
        var p = edgePoint(a, center(b)), q = edgePoint(b, center(a)), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        var horiz = Math.abs(q.x - p.x) > Math.abs(q.y - p.y);
        var d = horiz ? 'M' + p.x + ',' + p.y + ' C' + mx + ',' + p.y + ' ' + mx + ',' + q.y + ' ' + q.x + ',' + q.y : 'M' + p.x + ',' + p.y + ' C' + p.x + ',' + my + ' ' + q.x + ',' + my + ' ' + q.x + ',' + q.y;
        out += '<path d="' + d + '" fill="none" stroke="' + (e.color || '#64748b') + '" stroke-width="2"' + (e.style === 'dashed' ? ' stroke-dasharray="6 5"' : '') + (e.style === 'line' ? '' : ' marker-end="url(#ar)"') + '/>';
        if (e.label) out += '<text x="' + mx + '" y="' + (my - 6) + '" text-anchor="middle" class="elabel">' + esc(e.label) + '</text>';
      });
      svg.innerHTML = out;
    }

    function render() {
      world.querySelectorAll('.item').forEach(function (n) { n.remove(); });
      // Frame di bawah item lain.
      B.items.slice().sort(function (a, b) { return (a.type === 'frame' ? 0 : 1) - (b.type === 'frame' ? 0 : 1); }).forEach(function (it) { world.appendChild(el(it)); });
      drawEdges();
    }

    function fit() {
      if (!B.items.length) { view = { x: 40, y: 70, z: 1 }; apply(); return; }
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      B.items.forEach(function (i) { x0 = Math.min(x0, i.x); y0 = Math.min(y0, i.y); x1 = Math.max(x1, i.x + i.w); y1 = Math.max(y1, i.y + i.h); });
      var W = root.clientWidth, H = root.clientHeight - 56;
      var z = Math.max(0.2, Math.min(1.2, Math.min((W - 60) / (x1 - x0 || 1), (H - 60) / (y1 - y0 || 1))));
      view = { z: z, x: (W - (x1 - x0) * z) / 2 - x0 * z, y: 56 + (H - (y1 - y0) * z) / 2 - y0 * z };
      apply();
    }

    // ---- interaksi: geser kanvas, geser/ubah ukuran item, edit teks, zoom
    var drag = null;
    root.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.tools') || e.target.isContentEditable || /INPUT|A/.test(e.target.tagName) || e.target.closest('.kcard')) return;
      var item = e.target.closest('.item');
      if (item) {
        sel = item.dataset.id;
        world.querySelectorAll('.item.sel').forEach(function (n) { n.classList.remove('sel'); });
        item.classList.add('sel');
        var it = byId(sel);
        drag = { kind: e.target.classList.contains('rz') ? 'resize' : 'move', it: it, node: item, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, ow: it.w, oh: it.h };
      } else {
        sel = null;
        world.querySelectorAll('.item.sel').forEach(function (n) { n.classList.remove('sel'); });
        drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
      }
      root.setPointerCapture(e.pointerId);
    });
    root.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (drag.kind === 'pan') { view.x = drag.ox + dx; view.y = drag.oy + dy; apply(); return; }
      if (drag.kind === 'move') { drag.it.x = Math.round(drag.ox + dx / view.z); drag.it.y = Math.round(drag.oy + dy / view.z); drag.node.style.left = drag.it.x + 'px'; drag.node.style.top = drag.it.y + 'px'; }
      else { drag.it.w = Math.max(60, Math.round(drag.ow + dx / view.z)); drag.it.h = Math.max(36, Math.round(drag.oh + dy / view.z)); drag.node.style.width = drag.it.w + 'px'; drag.node.style.height = drag.it.h + 'px'; }
      drag.moved = true;
      drawEdges();
    });
    root.addEventListener('pointerup', function () { if (drag && drag.moved && drag.kind !== 'pan') { if (drag.it.type === 'chart') render(); changed(); } drag = null; });
    root.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 40 && !e.deltaX) {
        var r = root.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, z = Math.max(0.15, Math.min(3, view.z * Math.exp(-e.deltaY * 0.0015)));
        view.x = mx - (mx - view.x) * z / view.z; view.y = my - (my - view.y) * z / view.z; view.z = z;
      } else { view.x -= e.deltaX; view.y -= e.deltaY; }
      apply();
    }, { passive: false });

    // Edit teks: klik ganda.
    root.addEventListener('dblclick', function (e) {
      var f = e.target.closest('[data-edit]'), item = e.target.closest('.item');
      if (!item) { add('note', (e.clientX - view.x) / view.z, (e.clientY - view.y) / view.z); return; }
      if (!f) return;
      var it = byId(item.dataset.id), key = f.dataset.edit;
      f.contentEditable = 'true';
      f.textContent = it[key] || '';
      f.focus();
      document.execCommand && document.execCommand('selectAll', false, null);
      f.addEventListener('blur', function done() {
        f.removeEventListener('blur', done);
        f.contentEditable = 'false';
        it[key] = f.innerText.replace(/\n$/, '');
        render(); changed();
      });
    });
    root.addEventListener('change', function (e) {
      var item = e.target.closest('.item');
      if (!item || e.target.type !== 'checkbox') return;
      var it = byId(item.dataset.id), i = +e.target.dataset.i, o = it.items[i];
      it.items[i] = typeof o === 'string' ? { text: o, done: e.target.checked } : Object.assign({}, o, { done: e.target.checked });
      changed();
    });
    // Kanban: seret kartu antar kolom.
    var kd = null;
    root.addEventListener('dragstart', function (e) { var k = e.target.closest('.kcard'); if (!k) return; kd = { id: k.closest('.item').dataset.id, c: +k.dataset.c, k: +k.dataset.k }; e.dataTransfer.effectAllowed = 'move'; });
    root.addEventListener('dragover', function (e) { if (kd && e.target.closest('.kcol')) e.preventDefault(); });
    root.addEventListener('drop', function (e) {
      var c = e.target.closest('.kcol');
      if (!kd || !c) return;
      e.preventDefault();
      var it = byId(kd.id), to = +c.dataset.c;
      if (c.closest('.item').dataset.id !== kd.id) { kd = null; return; }
      var card = it.columns[kd.c].cards.splice(kd.k, 1)[0];
      (it.columns[to].cards = it.columns[to].cards || []).push(card);
      kd = null; render(); changed();
    });
    document.addEventListener('keydown', function (e) {
      if (document.activeElement && document.activeElement.isContentEditable) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        B.items = B.items.filter(function (i) { return i.id !== sel; });
        B.edges = B.edges.filter(function (x) { return x.from !== sel && x.to !== sel; });
        sel = null; render(); changed();
      }
    });

    var n = 0;
    function add(type, x, y) {
      var id = 'u' + Date.now().toString(36) + (n++);
      var base = { note: { w: 220, h: 150, text: 'Catatan baru', color: 'yellow' }, text: { w: 320, h: 60, text: 'Teks', size: 22 }, shape: { w: 180, h: 90, shape: 'rect', text: 'Bentuk' },
        list: { w: 260, h: 160, title: 'Daftar', items: [{ text: 'Tugas', done: false }] } }[type];
      var W = root.clientWidth, H = root.clientHeight;
      var it = Object.assign({ id: id, type: type, x: Math.round(x != null ? x : (W / 2 - view.x) / view.z - 100), y: Math.round(y != null ? y : (H / 2 - view.y) / view.z - 60) }, base);
      if (sel && byId(sel) && type !== 'text') B.edges.push({ from: sel, to: id });
      B.items.push(it);
      sel = id; render(); changed();
    }
    document.querySelectorAll('[data-add]').forEach(function (b) { b.onclick = function () { add(b.dataset.add); }; });
    document.getElementById('fit').onclick = fit;
    document.getElementById('zin').onclick = function () { view.z = Math.min(3, view.z * 1.2); apply(); };
    document.getElementById('zout').onclick = function () { view.z = Math.max(0.15, view.z / 1.2); apply(); };
    document.getElementById('dl').onclick = function () {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(B, null, 2)], { type: 'application/json' }));
      a.download = (B.title || 'board').replace(/[^\w-]+/g, '-') + '.json';
      a.click();
    };
    if (opts.readonly) document.querySelector('.tools .edit').style.display = 'none';
    render();
    fit();
    window.addEventListener('resize', fit);
  }

  var CSS = 'html,body{margin:0;height:100%;overflow:hidden;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;color:#1e293b}' +
    '#board{position:fixed;inset:0;background-color:#f8fafc;cursor:grab;touch-action:none;user-select:none}#board:active{cursor:grabbing}' +
    '#board.bg-dots{background-image:radial-gradient(#cbd5e1 1px,transparent 1px)}#board.bg-grid{background-image:linear-gradient(#e2e8f0 1px,transparent 1px),linear-gradient(90deg,#e2e8f0 1px,transparent 1px)}' +
    '#world{position:absolute;left:0;top:0;transform-origin:0 0}#edges{position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none}.elabel{font-size:12px;fill:#475569;paint-order:stroke;stroke:#f8fafc;stroke-width:4px}' +
    '.item{position:absolute;box-sizing:border-box;border-radius:12px;padding:12px 14px;box-shadow:0 1px 2px rgba(15,23,42,.06),0 6px 18px rgba(15,23,42,.08);overflow:hidden;cursor:move}' +
    '.item.sel{outline:2px solid #6366f1;outline-offset:2px}.rz{position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,rgba(99,102,241,.5) 50%);border-radius:0 0 10px 0;opacity:0}.item:hover .rz,.item.sel .rz{opacity:1}' +
    '.t-note{transform:rotate(-.4deg);border-radius:4px 4px 14px 4px}.t-text{box-shadow:none;padding:4px;font-size:18px}.t-text .txt{font-weight:600}' +
    '.t-shape{display:flex;align-items:center;justify-content:center;text-align:center;font-weight:600}.s-ellipse{border-radius:50%}.s-pill{border-radius:999px}.s-diamond{clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);box-shadow:none}' +
    '.t-frame{box-shadow:none;border:1.5px dashed #a5b4fc;border-radius:16px}.ftitle{font-weight:700;color:#4f46e5;font-size:13px;letter-spacing:.02em;text-transform:uppercase}' +
    '.t-image{padding:0}.t-image img{width:100%;height:100%;object-fit:cover;display:block}.cap{position:absolute;left:0;right:0;bottom:0;padding:6px 10px;background:rgba(15,23,42,.6);color:#fff;font-size:12px}' +
    '.ctitle{font-weight:700;font-size:15px;margin-bottom:6px}.cbody{color:#475569;font-size:13px}.tag{float:right;font-size:11px;background:#eef2ff;color:#4f46e5;padding:1px 8px;border-radius:999px}' +
    '.li{display:flex;gap:8px;align-items:flex-start;padding:3px 0;cursor:default}.li input{margin-top:3px}.li input:checked+span{text-decoration:line-through;color:#94a3b8}' +
    '.cols{display:flex;gap:10px;height:calc(100% - 4px)}.kcol{flex:1;background:#f1f5f9;border-radius:10px;padding:8px;overflow:auto}.khead{font-weight:700;font-size:13px;margin-bottom:8px}.khead small{color:#94a3b8;font-weight:500}' +
    '.kcard{background:#fff;border-radius:8px;padding:8px 10px;margin-bottom:8px;box-shadow:0 1px 2px rgba(0,0,0,.08);cursor:grab;font-size:13px}' +
    'table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{border:1px solid #e2e8f0;padding:5px 8px;text-align:left}th{background:#f8fafc}' +
    '.t-link a{color:#4f46e5;font-weight:600;text-decoration:none}.h1{font-size:1.5em;display:block}.h2{font-size:1.25em;display:block}.h3{display:block}code{font:12px ui-monospace,Menlo,monospace;background:rgba(0,0,0,.06);padding:0 4px;border-radius:4px}' +
    '.top{position:fixed;left:12px;right:12px;top:10px;display:flex;align-items:center;gap:10px;pointer-events:none}.top h1{margin:0;font-size:15px;font-weight:700;background:rgba(255,255,255,.9);padding:6px 12px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}' +
    '.tools{margin-left:auto;display:flex;gap:4px;background:rgba(255,255,255,.95);padding:4px;border-radius:12px;box-shadow:0 2px 10px rgba(15,23,42,.12);pointer-events:auto;flex-wrap:wrap}' +
    '.tools button{border:0;background:none;padding:6px 9px;border-radius:8px;font:12px -apple-system,sans-serif;cursor:pointer;color:#334155}.tools button:hover{background:#eef2ff}.tools .edit{display:flex;gap:4px}#zoom{min-width:40px;text-align:center;font:12px -apple-system,sans-serif;align-self:center;color:#64748b}' +
    '.err{position:fixed;left:12px;bottom:12px;background:#fee2e2;color:#991b1b;padding:8px 12px;border-radius:8px;font-size:12px}' +
    '@media print{.tools{display:none}}';

  /** Dokumen HTML lengkap untuk satu versi board. */
  function html(src, opts) {
    opts = opts || {};
    var b = layout(typeof src === 'string' ? parse(src) : normalize(src));
    var data = JSON.stringify(b).replace(/</g, '\\u003c');
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + (opts.boot || '') +
      '<title>' + U.esc(b.title) + '</title><style>' + CSS + '</style></head><body>' +
      '<div id="board" class="bg-' + (b.background === 'grid' ? 'grid' : b.background === 'plain' ? 'plain' : 'dots') + '"><div id="world"><svg id="edges"></svg></div></div>' +
      '<div class="top"><h1>' + U.esc(b.title) + '</h1><div class="tools"><span class="edit">' +
      '<button data-add="note" title="Catatan">＋ Catatan</button><button data-add="text" title="Teks">＋ Teks</button><button data-add="shape" title="Bentuk">＋ Bentuk</button><button data-add="list" title="Daftar">＋ Daftar</button></span>' +
      '<button id="zout" title="Perkecil">−</button><span id="zoom">100%</span><button id="zin" title="Perbesar">＋</button><button id="fit" title="Muat semua">Muat</button><button id="dl" title="Unduh JSON">JSON</button></div></div>' +
      (b.error ? '<div class="err">JSON board tidak valid: ' + U.esc(b.error) + '</div>' : '') +
      '<script>(' + runtime.toString() + ')(' + data + ',' + JSON.stringify({ readonly: !!opts.export }) + ')<\/script></body></html>';
  }

  /** Ringkasan teks board untuk konteks AI (hemat token dibanding JSON penuh bila besar). */
  function summary(src) {
    var b = typeof src === 'string' ? parse(src) : normalize(src);
    return json({ title: b.title, layout: b.layout, background: b.background, items: b.items, edges: b.edges.filter(function (e) { return !e.auto; }) });
  }

  window.Board = { parse: parse, html: html, layout: layout, summary: summary, TYPES: Object.keys(SIZE) };
})();
