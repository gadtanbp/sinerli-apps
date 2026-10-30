/* Sinerli Rupa — Copyright © 2026 Gadtan x Gallen. All rights reserved.
 * Antarmuka: beranda, bar atas & mode, panel kiri (lapisan/halaman/aset),
 * inspektor kanan, dok alat, menu konteks, ekspor, prototipe, komentar. */
(function () {
  'use strict';
  var doc = document, esc = SN.esc, T = SN.t;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var MODES = {
    photo: { c: '#e8590c', tools: ['select', 'hand', '|', 'marquee', 'emarquee', 'lasso', 'wand', '|', 'brush', 'eraser', 'clone', 'dodge', 'burn', 'fillbucket', '|', 'crop', 'eyedrop', 'text', 'rect'] },
    vector: { c: '#7c3aed', tools: ['select', 'hand', '|', 'pen', 'pencil', '|', 'rect', 'ellipse', 'polygon', 'star', 'line', 'arrow', '|', 'text', 'eyedrop'] },
    board: { c: '#d9a400', tools: ['select', 'hand', '|', 'sticky', 'rect', 'ellipse', 'polygon', 'text', '|', 'conn', 'marker', 'highlighter', '|', 'frame', 'comment'] },
    ui: { c: '#0f9f8f', tools: ['select', 'hand', '|', 'frame', 'rect', 'ellipse', 'line', 'text', 'pen', '|', 'conn', 'comment', 'eyedrop'] }
  };
  var ICON = { select: '➤', hand: '✋', marquee: '⬚', emarquee: '◌', lasso: '➰', wand: '✨', brush: '🖌', eraser: '⌫', clone: '⎘', dodge: '◐', burn: '◑', fillbucket: '🪣', crop: '⌗', eyedrop: '💧', text: 'T', rect: '▭', ellipse: '◯', polygon: '⬡', star: '☆', line: '╱', arrow: '↗', pen: '✒', pencil: '✏', sticky: '🗒', conn: '⤳', marker: '🖍', highlighter: '🖊', frame: '#', comment: '💬' };
  RT.keymap = { v: 'select', h: 'hand', m: 'marquee', l: 'lasso', w: 'wand', b: 'brush', e: 'eraser', j: 'clone', o: 'ellipse', r: 'rect', p: 'pen', Sp: 'pencil', t: 'text', s: 'sticky', c: 'conn', f: 'frame', k: 'crop', i: 'eyedrop', g: 'fillbucket', Sl: 'arrow', x: 'line', Sc: 'comment', y: 'polygon', Ss: 'star' };
  var STICKY = ['#ffe58a', '#ffc6a8', '#ffb3c7', '#d7c4ff', '#b6dcff', '#b8f2d0', '#e6e6e6', '#ffffff'];
  var FONTS = ['Inter', 'system-ui', 'Georgia', 'Times New Roman', 'Arial', 'Helvetica', 'Verdana', 'Trebuchet MS', 'Courier New', 'Menlo', 'Palatino', 'Garamond', 'Futura', 'Avenir', 'Segoe UI', 'Roboto', 'Noto Sans', 'Ubuntu', 'Comic Sans MS', 'Impact'];
  var BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
  var PRESETS = [
    ['iphone', 'iPhone 15', 393, 852], ['android', 'Android', 412, 915], ['tablet', 'iPad', 820, 1180], ['desktop', 'Desktop', 1440, 1024], ['web', 'Web 1920', 1920, 1080],
    ['ig', 'Instagram 1:1', 1080, 1080], ['story', 'Story 9:16', 1080, 1920], ['slide', 'Slide 16:9', 1920, 1080], ['a4', 'A4', 794, 1123], ['icon', 'Ikon 512', 512, 512]
  ];
  var FX_PRESETS = { none: {}, vivid: { saturate: 35, contrast: 12 }, mono: { grayscale: 1, contrast: 10 }, vintage: { sepia: 1, contrast: -8, vignette: 35 }, cool: { temp: -25, saturate: 5 }, warm: { temp: 25, brightness: 4 }, drama: { contrast: 40, saturate: -20, vignette: 45 }, fade: { contrast: -25, brightness: 8, saturate: -15 } };
  var mode = SN.store.get('r_mode', 'vector');
  var leftTab = 'layers';

  /* ====================================================== beranda */
  async function home() {
    if (RD.room) { RD.room.leave(); RD.room = null; }
    if (RD.status === 'saving') await RD.save();
    RD.file = null;
    var root = $('#rRoot');
    root.innerHTML = '<div class="r-home"><header class="r-home-top"><div class="r-logo">◆</div><b>Sinerli Rupa</b><span style="flex:1"></span><button class="r-btn" data-a="open">' + esc(T('r_open_file')) + '</button><span id="rHomeAcct"></span></header>' +
      '<section class="r-home-sec"><h2>' + esc(T('r_new')) + '</h2><div class="r-presets">' +
      [['blank', '◻', T('r_p_blank'), T('r_p_blank_d')], ['photo', '🖼', T('r_p_photo'), T('r_p_photo_d')], ['vector', '✒', T('r_p_vector'), '1024 × 1024'], ['board', '🗒', T('r_p_board'), T('r_p_board_d')], ['iphone', '📱', 'iPhone 15', '393 × 852'], ['desktop', '🖥', 'Desktop', '1440 × 1024'], ['ig', '◼', 'Instagram', '1080 × 1080'], ['slide', '▶', T('r_p_slide'), '1920 × 1080'], ['flow', '⤳', T('r_p_flow'), T('r_p_flow_d')], ['mind', '✺', T('r_p_mind'), T('r_p_mind_d')], ['kanban', '▥', 'Kanban', T('r_p_kanban_d')], ['retro', '↺', T('r_p_retro'), T('r_p_retro_d')]]
        .map(function (p) { return '<button class="r-preset" data-preset="' + p[0] + '"><i>' + p[1] + '</i><b>' + esc(p[2]) + '</b><small>' + esc(p[3]) + '</small></button>'; }).join('') + '</div></section>' +
      '<section class="r-home-sec"><h2>' + esc(T('r_recent')) + '</h2><div class="r-files" id="rFiles"><div class="sn-spinner"></div></div></section></div>';
    SN.ui.accountButton($('#rHomeAcct'));
    root.onclick = async function (e) {
      var p = e.target.closest('[data-preset]'), f = e.target.closest('[data-file]'), a = e.target.closest('[data-a]'), del = e.target.closest('[data-del]');
      if (del) { e.stopPropagation(); if (await SN.ui.confirm(T('r_delete_q'))) { await SN.Docs.remove(del.dataset.del); listFiles(); } return; }
      if (p) return createFrom(p.dataset.preset);
      if (f) return openFile(JSON.parse(f.dataset.file));
      if (a && a.dataset.a === 'open') return openLocal();
    };
    listFiles();
  }
  async function listFiles() {
    var box = $('#rFiles'); if (!box) return;
    var list = await RD.list();
    box.innerHTML = list.length ? list.map(function (f) {
      return '<div class="r-file" data-file="' + esc(JSON.stringify({ id: f.id, name: f.name, share: f.share, shared: f.shared })) + '"><div class="r-file-th"' + (f.thumbnail ? ' style="background-image:url(&quot;' + esc(f.thumbnail) + '&quot;)"' : '') + '></div><div class="r-file-m"><b>' + esc(f.name) + '</b><small>' + esc(f.shared ? T('r_shared') : new Date(f.lastModified || f.created_at || Date.now()).toLocaleDateString(SN.lang === 'id' ? 'id-ID' : 'en-US')) + '</small></div>' + (f.shared ? '' : '<button class="r-ib" data-del="' + esc(f.filename) + '" title="' + esc(T('r_delete')) + '">🗑</button>') + '</div>';
    }).join('') : '<p class="r-muted">' + esc(T('r_no_files')) + '</p>';
  }
  async function createFrom(preset) {
    await RD.newFile(T('r_untitled'));
    editor();
    var P = PRESETS.find(function (p) { return p[0] === preset; });
    RD.batch(function () {
      if (P) { mode = /iphone|android|tablet|desktop|web/.test(preset) ? 'ui' : 'vector'; RD.add({ type: 'frame', name: P[1], x: 0, y: 0, w: P[2], h: P[3], fill: '#ffffff', clip: true }); }
      if (preset === 'vector') { mode = 'vector'; RD.add({ type: 'frame', name: T('r_artboard'), x: 0, y: 0, w: 1024, h: 1024, fill: '#ffffff', clip: true }); }
      if (preset === 'board' || preset === 'flow' || preset === 'mind' || preset === 'kanban' || preset === 'retro') { mode = 'board'; if (preset !== 'board') boardTemplate(preset, 0, 0); }
      if (preset === 'photo') mode = 'photo';
      if (preset === 'blank') mode = 'vector';
    });
    RD.undo = [];
    setMode(mode);
    fitSoon();
    if (preset === 'photo') NE_pickImage();
  }
  /** Muat-semua setelah tata letak panel selesai (dua frame). */
  function fitSoon() { requestAnimationFrame(function () { requestAnimationFrame(function () { RR.resize(); RT.zoomFit(); }); }); }
  function NE_pickImage() {
    var i = doc.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true;
    i.onchange = function () { Array.prototype.forEach.call(i.files, function (f, k) { RT.insertImage(f, k * 40, k * 40); }); setTimeout(RT.zoomFit, 400); };
    i.click();
  }
  async function openFile(f) {
    $('#rRoot').innerHTML = '<div class="sn-spinner" style="margin-top:30vh"></div>';
    try { await RD.open(f); } catch (e) { SN.ui.toast(e.message, 'err'); return home(); }
    editor(); fitSoon();
  }
  function openLocal() {
    var i = doc.createElement('input'); i.type = 'file'; i.accept = '.rupa,application/json,image/*,.svg';
    i.onchange = async function () {
      var f = i.files[0]; if (!f) return;
      if (/\.rupa$|json/.test(f.name)) {
        try { var data = JSON.parse(await f.text()); await RD.open({ name: f.name.replace(/\.rupa$/, '') }, data); RD.dirty(); RD.save(); editor(); setTimeout(RT.zoomFit, 30); } catch (e) { SN.ui.toast(T('r_bad_file'), 'err'); }
        return;
      }
      await RD.newFile(f.name.replace(/\.[^.]+$/, '')); editor();
      if (/svg/.test(f.type)) { setMode('vector'); RT.importSVG(await f.text(), 0, 0); } else { setMode('photo'); RT.insertImage(f, 0, 0); }
      setTimeout(RT.zoomFit, 400);
    };
    i.click();
  }

  /* ====================================================== editor */
  function editor() {
    var root = $('#rRoot');
    root.innerHTML =
      '<div class="r-app">' +
      '<header class="r-top">' +
        '<button class="r-ib" id="rHome" title="' + esc(T('r_home')) + '">⌂</button>' +
        '<button class="r-ib" id="rMenu" title="' + esc(T('r_menu')) + '">☰</button>' +
        '<input class="r-name" id="rName" spellcheck="false">' +
        '<span class="r-sync" id="rSync"></span>' +
        '<nav class="r-modes" id="rModes">' + Object.keys(MODES).map(function (m) { return '<button data-mode="' + m + '" style="--mc:' + MODES[m].c + '">' + esc(T('r_mode_' + m)) + '</button>'; }).join('') + '</nav>' +
        '<span style="flex:1"></span>' +
        '<div class="sn-presence" id="rPeers"></div>' +
        '<button class="r-ib" id="rUndo" title="⌘Z">↶</button><button class="r-ib" id="rRedo" title="⌘⇧Z">↷</button>' +
        '<button class="r-zoom" id="rZoom">100%</button>' +
        '<button class="r-ib" id="rPlay" title="' + esc(T('r_present')) + '">▶</button>' +
        '<button class="r-ib r-mob" id="rTogL" title="' + esc(T('r_tab_layers')) + '">▤</button><button class="r-ib r-mob" id="rTogR" title="' + esc(T('r_layer')) + '">⚙</button>' +
        '<button class="r-btn r-btn-p" id="rShare">' + esc(T('sn_share')) + '</button><span id="rAcct"></span>' +
      '</header>' +
      '<aside class="r-left" id="rLeft"><nav class="r-tabs">' + ['layers', 'pages', 'assets'].map(function (t) { return '<button data-tab="' + t + '">' + esc(T('r_tab_' + t)) + '</button>'; }).join('') + '</nav><div class="r-left-body" id="rLeftBody"></div></aside>' +
      '<main class="r-stage" id="rStage"><canvas id="rCanvas"></canvas><div class="r-pins" id="rPins"></div>' +
        '<div class="r-dock" id="rDock"></div><div class="r-hint" id="rHint"></div></main>' +
      '<aside class="r-right" id="rRight"></aside>' +
      '</div>';
    SN.ui.accountButton($('#rAcct'));
    var cv = $('#rCanvas');
    RR.init(cv); RT.init(cv);
    $('#rName').value = RD.file.name;
    $('#rName').onchange = function () { RD.file.name = this.value.trim() || T('r_untitled'); RD.dirty(); };
    $('#rHome').onclick = home;
    $('#rMenu').onclick = function (e) { mainMenu(e.currentTarget); };
    $('#rModes').onclick = function (e) { var b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); };
    $('#rUndo').onclick = function () { RD.doUndo(); RT.afterHistory(); };
    $('#rRedo').onclick = function () { RD.doRedo(); RT.afterHistory(); };
    $('#rZoom').onclick = function (e) { zoomMenu(e.currentTarget); };
    $('#rPlay').onclick = present;
    $('#rShare').onclick = function () { SN.shareDialog(RD.file.id); };
    $('#rTogL').onclick = function () { $('#rLeft').classList.toggle('is-hidden'); $('#rRight').classList.add('is-hidden'); };
    $('#rTogR').onclick = function () { $('#rRight').classList.toggle('is-hidden'); $('#rLeft').classList.add('is-hidden'); };
    $('#rLeft').querySelector('.r-tabs').onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) { leftTab = b.dataset.tab; left(); } };
    setMode(mode);
    left(); right(); status(RD.status);
    if (innerWidth < 760) { $('#rLeft').classList.add('is-hidden'); $('#rRight').classList.add('is-hidden'); }
  }
  function setMode(m) {
    mode = MODES[m] ? m : 'vector';
    SN.store.set('r_mode', mode);
    RT.mode = mode;
    doc.documentElement.style.setProperty('--r-mode', MODES[mode].c);
    var nav = $('#rModes'); if (nav) nav.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.mode === mode); });
    RR.showSize = mode !== 'board';
    if (MODES[mode].tools.indexOf(RT.tool) < 0) RT.setTool('select');
    dock(); right(); RR.draw();
  }
  function dock() {
    var d = $('#rDock'); if (!d) return;
    var o = RT.opts;
    d.innerHTML = MODES[mode].tools.map(function (t) { return t === '|' ? '<span class="r-dock-sep"></span>' : '<button data-tool="' + t + '" class="' + (RT.tool === t ? 'is-on' : '') + '" title="' + esc(T('r_t_' + t)) + keyHint(t) + '">' + ICON[t] + '</button>'; }).join('') +
      '<span class="r-dock-sep"></span>' +
      (mode === 'board' ? STICKY.map(function (c) { return '<button class="r-sw' + (o.sticky === c ? ' is-on' : '') + '" data-sticky="' + c + '" style="background:' + c + '"></button>'; }).join('') :
        '<label class="r-sw-wrap" title="' + esc(T(mode === 'photo' ? 'r_color' : 'r_fill')) + '"><input type="color" data-o="' + (mode === 'photo' ? 'color' : 'fill') + '" value="' + esc(toHex(mode === 'photo' ? o.color : o.fill)) + '"></label>' +
        (mode === 'photo' ? '<label class="r-dock-range" title="' + esc(T('r_brush_size')) + '"><input type="range" min="1" max="300" data-o="size" value="' + Math.round(o.size) + '"><span>' + Math.round(o.size) + '</span></label><label class="r-dock-range" title="' + esc(T('r_hardness')) + '"><input type="range" min="0" max="100" data-o="hardness" value="' + Math.round(o.hardness * 100) + '"></label><label class="r-dock-range" title="' + esc(T('r_opacity')) + '"><input type="range" min="5" max="100" data-o="bopacity" value="' + Math.round(o.bopacity * 100) + '"></label>'
          : '<label class="r-sw-wrap" title="' + esc(T('r_stroke')) + '" style="--ring:1"><input type="color" data-o="stroke" value="' + esc(toHex(o.stroke)) + '"></label><label class="r-dock-range" title="' + esc(T('r_stroke_w')) + '"><input type="range" min="0" max="40" data-o="sw" value="' + o.sw + '"><span>' + o.sw + '</span></label>')) +
      (mode === 'board' ? '<span class="r-dock-sep"></span><button data-act="tpl" title="' + esc(T('r_templates')) + '">▦</button><button data-act="timer" title="' + esc(T('r_timer')) + '">⏱</button><button data-act="vote" title="' + esc(T('r_vote')) + '">👍</button>' : '');
    d.onclick = function (e) {
      var b = e.target.closest('[data-tool]'), s = e.target.closest('[data-sticky]'), a = e.target.closest('[data-act]');
      if (b) RT.setTool(b.dataset.tool);
      if (s) { RT.opts.sticky = s.dataset.sticky; if (RR.sel.length) RD.batch(function () { RR.sel.forEach(function (id) { var n = RD.get(id); if (n.type === 'sticky') RD.set(id, { fill: s.dataset.sticky }); }); }); dock(); }
      if (a && a.dataset.act === 'tpl') templateMenu(a);
      if (a && a.dataset.act === 'timer') timerMenu(a);
      if (a && a.dataset.act === 'vote') vote();
    };
    d.oninput = function (e) {
      var k = e.target.dataset.o; if (!k) return;
      var v = e.target.type === 'range' ? +e.target.value : e.target.value;
      if (k === 'hardness' || k === 'bopacity') v = v / 100;
      RT.opts[k] = v;
      var sp = e.target.parentNode.querySelector('span'); if (sp) sp.textContent = e.target.value;
      if ((k === 'fill' || k === 'stroke' || k === 'sw') && RR.sel.length) RD.batch(function () { RR.sel.forEach(function (id) { var n = RD.get(id); var f = {}; f[k === 'fill' && n.type === 'text' ? 'color' : k] = v; if (k === 'sw' && n.stroke === 'none') f.stroke = RT.opts.stroke; RD.set(id, f); }); });
      if (k === 'color' && RR.sel.length) RD.batch(function () { RR.sel.forEach(function (id) { var n = RD.get(id); if (n.type === 'text') RD.set(id, { color: v }); }); });
    };
  }
  function keyHint(t) { var k = Object.keys(RT.keymap).find(function (x) { return RT.keymap[x] === t; }); return k ? ' (' + (k[0] === 'S' && k.length === 2 ? '⇧' + k[1].toUpperCase() : k.toUpperCase()) + ')' : ''; }
  function toHex(c) { if (!c || typeof c !== 'string' || c === 'none') return '#000000'; if (/^#[0-9a-f]{6}$/i.test(c)) return c; if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map(function (x) { return x + x; }).join(''); var d = doc.createElement('canvas').getContext('2d'); d.fillStyle = c; var v = d.fillStyle; return /^#/.test(v) ? v : '#000000'; }
  RD.on('tool', function () { dock(); hint(); });
  RD.on('opts', dock);
  function hint() {
    var h = $('#rHint'); if (!h) return;
    var t = RT.tool, msg = T('r_h_' + t);
    h.textContent = msg === 'r_h_' + t ? '' : msg;
    h.hidden = !h.textContent;
  }

  /* ====================================================== panel kiri */
  function left() {
    var box = $('#rLeftBody'); if (!box) return;
    $('#rLeft').querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('is-on', b.dataset.tab === leftTab); });
    if (leftTab === 'pages') {
      box.innerHTML = RD.pages().map(function (p) { return '<div class="r-row' + (p.id === RD.page ? ' is-on' : '') + '" data-page="' + p.id + '"><span>▢</span><span class="r-row-t">' + esc(p.name) + '</span><button class="r-ib" data-pmenu="' + p.id + '">⋯</button></div>'; }).join('') + '<button class="r-add" data-addpage>＋ ' + esc(T('r_add_page')) + '</button>';
    } else if (leftTab === 'assets') {
      var comps = RD.nodes(null).length, all = Object.keys(RD.ents).map(function (k) { return RD.ents[k]; }).filter(function (n) { return n.kind === 'node' && !n._del && n.comp; });
      var colors = {};
      Object.keys(RD.ents).forEach(function (k) { var n = RD.ents[k]; if (n.kind === 'node' && !n._del) [n.fill, n.stroke, n.color].forEach(function (c) { if (typeof c === 'string' && /^#/.test(c)) colors[c.toLowerCase()] = (colors[c.toLowerCase()] || 0) + 1; }); });
      var top = Object.keys(colors).sort(function (a, b) { return colors[b] - colors[a]; }).slice(0, 24);
      box.innerHTML = '<div class="r-sec-h">' + esc(T('r_components')) + '</div>' + (all.length ? all.map(function (c) { return '<div class="r-row" data-comp="' + c.id + '" draggable="true" title="' + esc(T('r_drag_instance')) + '"><span>❖</span><span class="r-row-t">' + esc(c.name || T('r_component')) + '</span><button class="r-ib" data-inst="' + c.id + '">＋</button></div>'; }).join('') : '<p class="r-muted r-pad">' + esc(T('r_no_components')) + '</p>') +
        '<div class="r-sec-h">' + esc(T('r_doc_colors')) + '</div><div class="r-swatches">' + top.map(function (c) { return '<button style="background:' + c + '" data-color="' + c + '" title="' + c + '"></button>'; }).join('') + '</div>' +
        '<div class="r-sec-h">' + esc(T('r_templates')) + '</div>' + ['flow', 'mind', 'kanban', 'retro', 'journey', 'swot'].map(function (t) { return '<div class="r-row" data-tpl="' + t + '"><span>▦</span><span class="r-row-t">' + esc(T('r_p_' + t)) + '</span></div>'; }).join('');
    } else {
      var rows = [];
      (function walk(parent, d) { RD.nodes(undefined, parent).slice().reverse().forEach(function (n) { rows.push(row(n, d)); if (n._open !== false && (n.type === 'frame' || n.type === 'group') && RD.children(n.id).length && RR.layersOpen[n.id] !== false) walk(n.id, d + 1); }); })('', 0);
      box.innerHTML = rows.length ? rows.join('') : '<p class="r-muted r-pad">' + esc(T('r_no_layers')) + '</p>';
    }
    function row(n, d) {
      var kids = RD.children(n.id).length;
      return '<div class="r-row' + (RR.sel.indexOf(n.id) >= 0 ? ' is-on' : '') + (n.visible === false ? ' is-hidden' : '') + '" data-node="' + n.id + '" style="--d:' + d + '" draggable="true">' +
        (kids ? '<button class="r-tw" data-tw="' + n.id + '">' + (RR.layersOpen[n.id] === false ? '▸' : '▾') + '</button>' : '<span class="r-tw"></span>') +
        '<span class="r-ly-ic">' + (n.comp ? '❖' : n.instOf ? '◇' : ICON[n.type] || { image: '🖼', raster: '▦', path: '✒', group: '▣', conn: '⤳', frame: '#', sticky: '🗒' }[n.type] || '▭') + '</span><span class="r-row-t">' + esc(n.name || T('r_t_' + n.type)) + '</span>' +
        '<button class="r-ib r-ly-btn" data-lock="' + n.id + '">' + (n.locked ? '🔒' : '·') + '</button><button class="r-ib r-ly-btn" data-eye="' + n.id + '">' + (n.visible === false ? '◡' : '👁') + '</button></div>';
    }
  }
  RR.layersOpen = {};
  doc.addEventListener('click', function (e) {
    var lb = e.target.closest('#rLeftBody'); if (!lb) return;
    var eye = e.target.closest('[data-eye]'), lock = e.target.closest('[data-lock]'), tw = e.target.closest('[data-tw]'), node = e.target.closest('[data-node]');
    if (eye) { var n = RD.get(eye.dataset.eye); RD.set(n.id, { visible: n.visible === false }); return left(); }
    if (lock) { var n2 = RD.get(lock.dataset.lock); RD.set(n2.id, { locked: !n2.locked }); return left(); }
    if (tw) { RR.layersOpen[tw.dataset.tw] = RR.layersOpen[tw.dataset.tw] === false; return left(); }
    if (node) { RT.select([node.dataset.node], e.shiftKey || e.metaKey); return; }
    var pg = e.target.closest('[data-page]'), pm = e.target.closest('[data-pmenu]');
    if (pm) { pageMenu(pm, pm.dataset.pmenu); return; }
    if (pg) { RD.page = pg.dataset.page; RT.select([]); left(); RT.zoomFit(); return; }
    if (e.target.closest('[data-addpage]')) { var id = RG.uid('pg'); RD.set(id, { kind: 'page', name: T('r_page') + ' ' + (RD.pages().length + 1), _o: SN.Collab.between(RD.pages().slice(-1)[0]._o, '') }); RD.page = id; left(); RR.fit(null); return; }
    var inst = e.target.closest('[data-inst]');
    if (inst) { var c = RR.toWorld(RR.size().w / 2, RR.size().h / 2); var nid = RD.instantiate(inst.dataset.inst, c.x, c.y); RT.select([nid]); return; }
    var col = e.target.closest('[data-color]');
    if (col) { RD.batch(function () { RR.sel.forEach(function (id) { var n = RD.get(id); RD.set(id, n.type === 'text' ? { color: col.dataset.color } : { fill: col.dataset.color }); }); }); RT.opts.fill = col.dataset.color; dock(); return; }
    var tpl = e.target.closest('[data-tpl]');
    if (tpl) { var w = RR.toWorld(RR.size().w / 2, RR.size().h / 2); RD.batch(function () { boardTemplate(tpl.dataset.tpl, w.x - 400, w.y - 250); }); setMode('board'); return; }
  });
  doc.addEventListener('dblclick', function (e) {
    var node = e.target.closest('#rLeftBody [data-node]'), pg = e.target.closest('#rLeftBody [data-page]');
    if (node) { var n = RD.get(node.dataset.node); SN.ui.prompt(T('r_rename'), n.name || '').then(function (v) { if (v !== null) { RD.set(n.id, { name: v }); left(); } }); }
    if (pg) { var p = RD.get(pg.dataset.page); SN.ui.prompt(T('r_rename'), p.name).then(function (v) { if (v) { RD.set(p.id, { name: v }); left(); } }); }
  });
  // seret lapisan untuk mengubah urutan / memasukkan ke frame
  var dragLayer = null;
  doc.addEventListener('dragstart', function (e) { var r = e.target.closest && e.target.closest('#rLeftBody [data-node], #rLeftBody [data-comp]'); if (!r) return; dragLayer = r.dataset.node || ('comp:' + r.dataset.comp); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragLayer); });
  doc.addEventListener('dragover', function (e) { var r = e.target.closest && e.target.closest('#rLeftBody [data-node]'); if (r && dragLayer && dragLayer.indexOf('comp:') !== 0) { e.preventDefault(); doc.querySelectorAll('.r-row.drop-b,.r-row.drop-a,.r-row.drop-in').forEach(function (x) { x.classList.remove('drop-b', 'drop-a', 'drop-in'); }); var b = r.getBoundingClientRect(), y = e.clientY - b.top, t = RD.get(r.dataset.node); r.classList.add(y < b.height * 0.3 ? 'drop-b' : (y > b.height * 0.7 || !(t.type === 'frame' || t.type === 'group')) ? 'drop-a' : 'drop-in'); } if (e.target.closest && e.target.closest('#rCanvas') && dragLayer && dragLayer.indexOf('comp:') === 0) e.preventDefault(); });
  doc.addEventListener('drop', function (e) {
    if (!dragLayer) return;
    var id = dragLayer; dragLayer = null;
    if (id.indexOf('comp:') === 0 && e.target.closest('#rCanvas')) { e.preventDefault(); e.stopPropagation(); var r0 = $('#rCanvas').getBoundingClientRect(), w = RR.toWorld(e.clientX - r0.left, e.clientY - r0.top); RT.select([RD.instantiate(id.slice(5), w.x, w.y)]); return; }
    var r = e.target.closest('#rLeftBody [data-node]'); if (!r || r.dataset.node === id) return;
    e.preventDefault();
    var t = RD.get(r.dataset.node), how = r.classList.contains('drop-in') ? 'in' : r.classList.contains('drop-b') ? 'above' : 'below';
    for (var p = t; p; p = RD.get(p.parent)) if (p.id === id) return;
    RD.batch(function () {
      if (how === 'in') RD.set(id, { parent: t.id, _o: SN.Collab.between(RD.topOrder(t.id), '') });
      else {
        var sib = RD.nodes(undefined, t.parent || '').filter(function (s) { return s.id !== id; }), i = sib.findIndex(function (s) { return s.id === t.id; });
        // daftar lapisan ditampilkan atas = depan
        var o = how === 'above' ? SN.Collab.between(t._o, sib[i + 1] ? sib[i + 1]._o : '') : SN.Collab.between(sib[i - 1] ? sib[i - 1]._o : '', t._o);
        RD.set(id, { parent: t.parent || '', _o: o });
      }
    });
    left(); RR.draw();
  });
  function pageMenu(anchor, pid) {
    menu(anchor, [['rename', T('r_rename')], ['dup', T('r_duplicate')], ['bg', T('r_page_bg')], ['-'], ['del', T('r_delete')]], function (k) {
      var p = RD.get(pid);
      if (k === 'rename') SN.ui.prompt(T('r_rename'), p.name).then(function (v) { if (v) { RD.set(pid, { name: v }); left(); } });
      if (k === 'dup') { var np = RG.uid('pg'); RD.batch(function () { RD.set(np, { kind: 'page', name: p.name + ' 2', _o: SN.Collab.between(p._o, '') }); var old = RD.page; RD.page = np; var map = {}; RD.drawOrder(old).forEach(function (n) { var f = JSON.parse(JSON.stringify(n)); delete f.id; f.page = np; f.parent = map[n.parent] || ''; map[n.id] = RD.add(f); }); }); left(); }
      if (k === 'bg') { var i = doc.createElement('input'); i.type = 'color'; i.value = toHex(p.bg || '#eef0f4'); i.oninput = function () { RD.set(pid, { bg: i.value }); }; i.click(); }
      if (k === 'del' && RD.pages().length > 1) SN.ui.confirm(T('r_delete_page_q')).then(function (ok) { if (!ok) return; RD.batch(function () { RD.nodes(pid).forEach(function (n) { RD.set(n.id, { _del: 1 }); }); RD.set(pid, { _del: 1 }); }); RD.page = RD.pages()[0].id; left(); RR.draw(); });
    });
  }

  /* ====================================================== inspektor */
  var num = function (k, label, v, step, extra) { return '<label class="r-f"><span>' + label + '</span><input type="number" data-k="' + k + '" value="' + (v == null ? '' : Math.round(v * 100) / 100) + '" step="' + (step || 1) + '"' + (extra || '') + '></label>'; };
  var color = function (k, v, allowNone) { var isStr = typeof v === 'string' || v == null; return '<div class="r-colrow"><label class="r-sw-wrap"><input type="color" data-k="' + k + '" value="' + esc(toHex(isStr ? v : (v.stops && v.stops[0] && v.stops[0][1]))) + '"></label><input class="r-hex" data-hex="' + k + '" value="' + esc(isStr ? (v || 'none') : (v.type || '')) + '">' + (allowNone ? '<button class="r-ib" data-none="' + k + '" title="' + esc(T('r_none')) + '">⊘</button>' : '') + '</div>'; };
  var card = function (title, body, id) { return '<section class="r-card"' + (id ? ' data-card="' + id + '"' : '') + '><h4>' + esc(title) + '</h4>' + body + '</section>'; };
  function right() {
    var box = $('#rRight'); if (!box) return;
    var nodes = RR.sel.map(RD.get).filter(Boolean);
    var n = nodes[0], H = [];
    if (!n) {
      var pg = RD.get(RD.page);
      H.push(card(T('r_page'), '<div class="r-colrow"><label class="r-sw-wrap"><input type="color" data-page-bg value="' + esc(toHex(pg && pg.bg || (RR.dark ? '#16181d' : '#eef0f4'))) + '"></label><button class="r-btn" data-a="pagebgreset">' + esc(T('r_reset')) + '</button></div>' +
        '<label class="r-chk"><input type="checkbox" data-a="grid"' + (RR.showGrid ? ' checked' : '') + '> ' + esc(T('r_grid')) + '</label><label class="r-chk"><input type="checkbox" data-a="lgrid"' + (RR.layoutGrid ? ' checked' : '') + '> ' + esc(T('r_layout_grids')) + '</label><label class="r-chk"><input type="checkbox" data-a="snap"' + (RT.noSnap ? '' : ' checked') + '> ' + esc(T('r_snap')) + '</label>'));
      if (mode === 'ui' || mode === 'vector') H.push(card(T('r_frame_presets'), '<div class="r-presets-sm">' + PRESETS.map(function (p) { return '<button data-frame="' + p[0] + '">' + esc(p[1]) + '<small>' + p[2] + '×' + p[3] + '</small></button>'; }).join('') + '</div>'));
      if (mode === 'photo') H.push(card(T('r_photo_start'), '<button class="r-btn r-w100" data-a="addimage">🖼 ' + esc(T('r_add_image')) + '</button><button class="r-btn r-w100" data-a="newlayer">▦ ' + esc(T('r_new_layer')) + '</button><p class="r-muted">' + esc(T('r_photo_tip')) + '</p>'));
      if (mode === 'board') H.push(card(T('r_board'), '<button class="r-btn r-w100" data-a="tplmenu">▦ ' + esc(T('r_templates')) + '</button><p class="r-muted">' + esc(T('r_board_tip')) + '</p>'));
      H.push(card(T('r_export'), exportBody()));
      box.innerHTML = H.join('');
      return;
    }
    var multi = nodes.length > 1, b = multi ? RG.union(nodes.map(RG.bounds)) : n;
    if (multi) H.push(card(T('r_align'), '<div class="r-btns">' + [['l', '⇤'], ['ch', '⇔'], ['r', '⇥'], ['t', '⤒'], ['cv', '⇕'], ['b', '⤓'], ['dh', '⋯'], ['dv', '⋮']].map(function (a) { return '<button class="r-ib" data-align="' + a[0] + '" title="' + esc(T('r_al_' + a[0])) + '">' + a[1] + '</button>'; }).join('') + '</div>' +
      (nodes.every(isShape) ? '<div class="r-btns" style="margin-top:6px">' + [['union', '⊕'], ['difference', '⊖'], ['intersection', '⊗'], ['xor', '⊘']].map(function (a) { return '<button class="r-ib" data-bool="' + a[0] + '" title="' + esc(T('r_bool_' + a[0])) + '">' + a[1] + '</button>'; }).join('') + '</div>' : '') +
      '<div class="r-btns" style="margin-top:6px"><button class="r-btn" data-a="group">' + esc(T('r_group')) + ' ⌘G</button>' + (nodes.length > 1 ? '<button class="r-btn" data-a="mkframe">' + esc(T('r_frame_sel')) + '</button>' : '') + '</div>'));
    else H.push('<div class="r-sel-h"><input class="r-name-in" data-k="name" value="' + esc(n.name || T('r_t_' + n.type)) + '"><small>' + esc(T('r_t_' + n.type)) + (n.comp ? ' · ' + T('r_component') : n.instOf ? ' · ' + T('r_instance') : '') + '</small></div>');
    if (!(n.type === 'conn' && !multi)) H.push(card(T('r_transform'), '<div class="r-grid2">' + num('x', 'X', b.x) + num('y', 'Y', b.y) + num('w', 'W', b.w, 1, ' min="1"') + num('h', 'H', b.h, 1, ' min="1"') + (!multi ? num('rot', '⟳', n.rot || 0) + num('radius', '◜', n.radius || 0, 1, ' min="0"') : '') + '</div>' +
      '<div class="r-btns" style="margin-top:6px"><button class="r-ib" data-a="flipx" title="' + esc(T('r_flip_h')) + '">⇋</button><button class="r-ib" data-a="flipy" title="' + esc(T('r_flip_v')) + '">⇵</button><button class="r-ib" data-a="rot90" title="90°">⟳</button><button class="r-ib" data-a="front" title="' + esc(T('r_front')) + '">⤒</button><button class="r-ib" data-a="back" title="' + esc(T('r_back')) + '">⤓</button></div>'));
    if (!multi) {
      H.push(card(T('r_layer'), '<div class="r-grid2"><label class="r-f"><span>%</span><input type="range" min="0" max="100" data-k="opacity" value="' + Math.round((n.opacity == null ? 1 : n.opacity) * 100) + '"></label><label class="r-f"><select data-k="blend">' + BLENDS.map(function (m) { return '<option value="' + m + '"' + ((n.blend || 'normal') === m ? ' selected' : '') + '>' + esc(T('r_bl_' + m.replace('-', '_'))) + '</option>'; }).join('') + '</select></label></div>'));
      if (n.type === 'text' || (mode === 'board' && n.type !== 'conn' && n.type !== 'image' && n.type !== 'raster' && n.type !== 'frame') || n.type === 'sticky') H.push(card(T('r_text'), textBody(n)));
      if (n.type !== 'image' && n.type !== 'raster' && n.type !== 'text' && n.type !== 'group' && n.type !== 'conn') H.push(card(T('r_fill'), fillBody(n)));
      if (n.type === 'text') H.push(card(T('r_text_color'), color('color', n.color || '#111111')));
      if (n.type !== 'group' && n.type !== 'text' && n.type !== 'sticky') H.push(card(T('r_stroke'), color('stroke', n.stroke || 'none', true) + '<div class="r-grid2">' + num('sw', T('r_width'), n.sw || 0, 0.5, ' min="0"') + '<label class="r-f"><select data-k="dash"><option value="">━━</option><option value="dash"' + (n.dash === 'dash' ? ' selected' : '') + '>╍╍</option><option value="dot"' + (n.dash === 'dot' ? ' selected' : '') + '>┈┈</option></select></label></div>'));
      if (n.type === 'polygon' || n.type === 'star') H.push(card(T('r_shape'), '<div class="r-grid2">' + num('sides', T('r_sides'), n.sides || 5, 1, ' min="3" max="40"') + (n.type === 'star' ? num('inner', T('r_inner'), n.inner || 0.45, 0.05, ' min="0.05" max="1"') : '') + '</div>'));
      if (n.type === 'conn') H.push(card(T('r_t_conn'), '<div class="r-btns">' + ['straight', 'elbow', 'curve'].map(function (s) { return '<button class="r-btn' + ((n.style || 'curve') === s ? ' is-on' : '') + '" data-cstyle="' + s + '">' + esc(T('r_cs_' + s)) + '</button>'; }).join('') + '</div>' + color('stroke', n.stroke || '#5b6175') + '<div class="r-grid2">' + num('sw', T('r_width'), n.sw || 2, 0.5) + '</div><label class="r-chk"><input type="checkbox" data-bool-k="startArrow"' + (n.startArrow ? ' checked' : '') + '> ' + esc(T('r_start_arrow')) + '</label><label class="r-chk"><input type="checkbox" data-bool-k="endArrow"' + (n.endArrow !== false ? ' checked' : '') + '> ' + esc(T('r_end_arrow')) + '</label><label class="r-f"><span>' + esc(T('r_label')) + '</span><input data-k="text" value="' + esc(n.text || '') + '"></label>'));
      if (n.type === 'image' || n.type === 'raster') H.push(card(T('r_adjust'), adjustBody(n), 'adjust'), card(T('r_image'), '<div class="r-btns"><button class="r-btn" data-a="crop">⌗ ' + esc(T('r_t_crop')) + '</button><button class="r-btn" data-a="autofix">✦ ' + esc(T('r_auto')) + '</button><button class="r-btn" data-a="bake">' + esc(T('r_bake')) + '</button><button class="r-btn" data-a="replace">' + esc(T('r_replace')) + '</button><button class="r-btn" data-a="natural">1:1</button></div>' +
        (RR.maskCanvas && RR.maskCanvas.id === n.id ? '<div class="r-sec-h">' + esc(T('r_selection')) + '</div><div class="r-btns">' + [['delete', 'r_sel_delete'], ['fill', 'r_sel_fill'], ['copy', 'r_sel_copy'], ['cut', 'r_sel_cut'], ['crop', 'r_sel_crop'], ['invert', 'r_sel_invert'], ['deselect', 'r_sel_none']].map(function (x) { return '<button class="r-btn" data-mask="' + x[0] + '">' + esc(T(x[1])) + '</button>'; }).join('') + '</div>' : '')));
      if (n.type === 'frame') H.push(card(T('r_frame'), '<div class="r-presets-sm">' + PRESETS.slice(0, 6).map(function (p) { return '<button data-fsize="' + p[0] + '">' + esc(p[1]) + '</button>'; }).join('') + '</div><label class="r-chk"><input type="checkbox" data-bool-k="clip"' + (n.clip !== false ? ' checked' : '') + '> ' + esc(T('r_clip')) + '</label><label class="r-chk"><input type="checkbox" data-bool-k="section"' + (n.section ? ' checked' : '') + '> ' + esc(T('r_section')) + '</label>'),
        card(T('r_autolayout'), layoutBody(n)), card(T('r_layout_grid'), '<label class="r-chk"><input type="checkbox" data-a="fgrid"' + (n.grid ? ' checked' : '') + '> ' + esc(T('r_columns')) + '</label>' + (n.grid ? '<div class="r-grid2">' + num('grid.cols', T('r_cols'), n.grid.cols || 12) + num('grid.gutter', T('r_gutter'), n.grid.gutter || 20) + num('grid.margin', T('r_margin'), n.grid.margin || 20) + '</div>' : '')));
      if (n.type !== 'conn' && n.type !== 'group') H.push(card(T('r_effects'), '<label class="r-chk"><input type="checkbox" data-a="shadow"' + (n.shadow && n.shadow.on ? ' checked' : '') + '> ' + esc(T('r_shadow')) + '</label>' + (n.shadow && n.shadow.on ? '<div class="r-grid2">' + num('shadow.x', 'X', n.shadow.x || 0) + num('shadow.y', 'Y', n.shadow.y == null ? 4 : n.shadow.y) + num('shadow.blur', T('r_blur'), n.shadow.blur || 12, 1, ' min="0"') + '</div>' + color('shadow.color', n.shadow.color || '#00000040') : '') + '<div class="r-grid2">' + num('lblur', T('r_layer_blur'), n.lblur || 0, 1, ' min="0"') + '</div>'));
      if (n.type === 'sticky') H.push(card(T('r_t_sticky'), '<div class="r-swatches">' + STICKY.map(function (c) { return '<button style="background:' + c + '" data-k-fill="' + c + '"></button>'; }).join('') + '</div><button class="r-btn" data-a="vote1">👍 ' + esc(T('r_vote')) + ' (' + Object.keys(n.votes || {}).length + ')</button>'));
      if (mode === 'ui' || n.type === 'frame') H.push(card(T('r_prototype'), protoBody(n)));
      if (mode === 'ui') H.push(card(T('r_inspect'), '<pre class="r-code">' + esc(cssOf(n)) + '</pre><button class="r-btn" data-a="copycss">' + esc(T('r_copy_css')) + '</button>'));
      H.push(card(T('r_component'), n.comp ? '<p class="r-muted">' + esc(T('r_is_master')) + '</p><button class="r-btn" data-a="sync">' + esc(T('r_sync_inst')) + '</button>' : n.instOf ? '<button class="r-btn" data-a="detach">' + esc(T('r_detach')) + '</button><button class="r-btn" data-a="gomaster">' + esc(T('r_go_master')) + '</button>' : '<button class="r-btn" data-a="mkcomp">❖ ' + esc(T('r_make_comp')) + ' ⌘⌥K</button>'));
      if (isShape(n) && mode === 'vector') H.push(card(T('r_vector'), '<button class="r-btn" data-a="editpts">✒ ' + esc(T('r_edit_points')) + '</button><button class="r-btn" data-a="outline">' + esc(T('r_outline')) + '</button>'));
    }
    H.push(card(T('r_export'), exportBody()));
    box.innerHTML = H.join('');
  }
  function isShape(n) { return /^(rect|ellipse|polygon|star|path|line|arrow)$/.test(n.type); }
  function textBody(n) {
    return '<label class="r-f"><select data-k="font">' + FONTS.map(function (f) { return '<option value="' + esc(f) + ', system-ui, sans-serif"' + (String(n.font || 'Inter').split(',')[0] === f ? ' selected' : '') + ' style="font-family:' + esc(f) + '">' + esc(f) + '</option>'; }).join('') + '</select></label>' +
      '<div class="r-grid2"><label class="r-f"><span>' + esc(T('r_size')) + '</span><input type="number" data-k="fsize" value="' + Math.round(n.fsize || 16) + '" min="4"></label><label class="r-f"><select data-k="fweight">' + [300, 400, 500, 600, 700, 800, 900].map(function (w) { return '<option' + ((n.fweight || 400) == w ? ' selected' : '') + '>' + w + '</option>'; }).join('') + '</select></label>' +
      '<label class="r-f"><span>↕</span><input type="number" data-k="lh" value="' + (n.lh || 1.3) + '" step="0.05" min="0.6"></label><label class="r-f"><span>↔</span><input type="number" data-k="ls" value="' + (n.ls || 0) + '" step="0.1"></label></div>' +
      '<div class="r-btns">' + [['left', '⯇'], ['center', '≡'], ['right', '⯈']].map(function (a) { return '<button class="r-ib' + ((n.align || (n.type === 'text' ? 'left' : 'center')) === a[0] ? ' is-on' : '') + '" data-k-align="' + a[0] + '">' + a[1] + '</button>'; }).join('') +
      '<button class="r-ib' + (n.italic ? ' is-on' : '') + '" data-tog="italic"><i>I</i></button><button class="r-ib' + (n.underline ? ' is-on' : '') + '" data-tog="underline"><u>U</u></button><button class="r-ib' + (n.strike ? ' is-on' : '') + '" data-tog="strike"><s>S</s></button></div>' +
      (n.type !== 'text' ? color('color', n.color || '#1b1e2b') : '');
  }
  function fillBody(n) {
    var f = n.fill, kind = !f || f === 'none' ? 'none' : typeof f === 'string' ? 'solid' : f.type;
    var h = '<div class="r-btns">' + ['none', 'solid', 'linear', 'radial'].map(function (k) { return '<button class="r-btn' + (kind === k ? ' is-on' : '') + '" data-fillkind="' + k + '">' + esc(T('r_fk_' + k)) + '</button>'; }).join('') + '</div>';
    if (kind === 'solid') h += '<div class="r-colrow"><label class="r-sw-wrap"><input type="color" data-k="fill" value="' + esc(toHex(f)) + '"></label><input class="r-hex" data-hex="fill" value="' + esc(f) + '"></div>';
    if (kind === 'linear' || kind === 'radial') h += '<div class="r-grad" style="background:linear-gradient(90deg,' + f.stops.map(function (s) { return s[1] + ' ' + s[0] * 100 + '%'; }).join(',') + ')"></div>' + f.stops.map(function (s, i) { return '<div class="r-colrow"><label class="r-sw-wrap"><input type="color" data-stop="' + i + '" value="' + esc(toHex(s[1])) + '"></label><input type="range" min="0" max="100" data-stoppos="' + i + '" value="' + Math.round(s[0] * 100) + '"></div>'; }).join('') + (kind === 'linear' ? '<label class="r-f"><span>∠</span><input type="number" data-gangle value="' + Math.round(Math.atan2((f.y2 == null ? 1 : f.y2) - (f.y1 || 0), (f.x2 == null ? 1 : f.x2) - (f.x1 || 0)) * 180 / Math.PI) + '"></label>' : '');
    return h;
  }
  function adjustBody(n) {
    var fx = n.fx || {}, sl = function (k, min, max) { return '<label class="r-f r-slider"><span>' + esc(T('r_fx_' + k)) + '</span><input type="range" min="' + min + '" max="' + max + '" data-fx="' + k + '" value="' + (fx[k] || 0) + '"><em>' + (fx[k] || 0) + '</em></label>'; };
    return '<div class="r-btns r-fxp">' + Object.keys(FX_PRESETS).map(function (p) { return '<button class="r-btn" data-fxp="' + p + '">' + esc(T('r_fxp_' + p)) + '</button>'; }).join('') + '</div>' +
      sl('exposure', -100, 100) + sl('brightness', -100, 100) + sl('contrast', -100, 100) + sl('saturate', -100, 100) + sl('temp', -100, 100) + sl('tint', -100, 100) + sl('hue', -180, 180) + sl('vignette', 0, 100) + sl('blur', 0, 40) + sl('sharpen', 0, 100) +
      '<div class="r-btns">' + ['grayscale', 'sepia', 'invert'].map(function (k) { return '<button class="r-btn' + (fx[k] ? ' is-on' : '') + '" data-fxt="' + k + '">' + esc(T('r_fx_' + k)) + '</button>'; }).join('') + '</div>';
  }
  function layoutBody(n) {
    var L = n.layout || {};
    return '<div class="r-btns">' + [['', T('r_none')], ['h', '→ ' + T('r_horizontal')], ['v', '↓ ' + T('r_vertical')]].map(function (d) { return '<button class="r-btn' + ((L.dir || '') === d[0] ? ' is-on' : '') + '" data-ldir="' + d[0] + '">' + esc(d[1]) + '</button>'; }).join('') + '</div>' +
      (L.dir ? '<div class="r-grid2"><label class="r-f"><span>' + esc(T('r_gap')) + '</span><input type="number" data-l="gap" value="' + (L.gap || 0) + '"></label><label class="r-f"><span>' + esc(T('r_padding')) + '</span><input type="number" data-l="pad" value="' + (L.pad || 0) + '"></label></div><div class="r-btns">' + ['start', 'center', 'end'].map(function (a) { return '<button class="r-btn' + ((L.align || 'start') === a ? ' is-on' : '') + '" data-lalign="' + a + '">' + esc(T('r_la_' + a)) + '</button>'; }).join('') + '</div><label class="r-chk"><input type="checkbox" data-lhug' + (L.hug ? ' checked' : '') + '> ' + esc(T('r_hug')) + '</label>' : '');
  }
  function protoBody(n) {
    var frames = RD.nodes().filter(function (f) { return f.type === 'frame' && !f.parent && f.id !== n.id; });
    return '<label class="r-f"><span>' + esc(T('r_on_click')) + '</span><select data-k="link"><option value="">—</option>' + frames.map(function (f) { return '<option value="' + f.id + '"' + (n.link === f.id ? ' selected' : '') + '>' + esc(f.name || T('r_frame')) + '</option>'; }).join('') + '<option value="__back"' + (n.link === '__back' ? ' selected' : '') + '>← ' + esc(T('r_back_nav')) + '</option></select></label>' +
      '<label class="r-f"><span>' + esc(T('r_transition')) + '</span><select data-k="trans">' + ['instant', 'dissolve', 'slide'].map(function (t) { return '<option value="' + t + '"' + ((n.trans || 'dissolve') === t ? ' selected' : '') + '>' + esc(T('r_tr_' + t)) + '</option>'; }).join('') + '</select></label>' +
      (n.type === 'frame' && !n.parent ? '<label class="r-chk"><input type="checkbox" data-a="startframe"' + (RD.get(RD.page).start === n.id ? ' checked' : '') + '> ' + esc(T('r_start_frame')) + '</label>' : '');
  }
  function cssOf(n) {
    var out = ['width: ' + Math.round(n.w) + 'px;', 'height: ' + Math.round(n.h) + 'px;'];
    if (typeof n.fill === 'string' && n.fill !== 'none') out.push((n.type === 'text' ? 'background' : 'background') + ': ' + n.fill + ';');
    if (n.fill && n.fill.type === 'linear') out.push('background: linear-gradient(' + n.fill.stops.map(function (s) { return s[1] + ' ' + Math.round(s[0] * 100) + '%'; }).join(', ') + ');');
    if (n.radius) out.push('border-radius: ' + n.radius + 'px;');
    if (n.stroke && n.stroke !== 'none' && n.sw) out.push('border: ' + n.sw + 'px ' + (n.dash ? 'dashed' : 'solid') + ' ' + n.stroke + ';');
    if (n.opacity != null && n.opacity < 1) out.push('opacity: ' + n.opacity + ';');
    if (n.shadow && n.shadow.on) out.push('box-shadow: ' + (n.shadow.x || 0) + 'px ' + (n.shadow.y == null ? 4 : n.shadow.y) + 'px ' + (n.shadow.blur || 12) + 'px ' + (n.shadow.color || 'rgba(0,0,0,.25)') + ';');
    if (n.type === 'text') { out.push('font-family: ' + (n.font || 'Inter') + ';', 'font-size: ' + (n.fsize || 16) + 'px;', 'font-weight: ' + (n.fweight || 400) + ';', 'line-height: ' + (n.lh || 1.3) + ';', 'color: ' + (n.color || '#111') + ';'); if (n.ls) out.push('letter-spacing: ' + n.ls + 'px;'); }
    if (n.layout && n.layout.dir) out.push('display: flex;', 'flex-direction: ' + (n.layout.dir === 'h' ? 'row' : 'column') + ';', 'gap: ' + (n.layout.gap || 0) + 'px;', 'padding: ' + (n.layout.pad || 0) + 'px;');
    if (n.rot) out.push('transform: rotate(' + Math.round(n.rot) + 'deg);');
    return out.join('\n');
  }
  function exportBody() {
    var f = SN.store.get('r_exp_fmt', 'png'), s = SN.store.get('r_exp_scale', '2');
    return '<div class="r-grid2"><label class="r-f"><select data-exp="fmt">' + ['png', 'jpg', 'webp', 'svg', 'pdf'].map(function (x) { return '<option' + (f === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label><label class="r-f"><select data-exp="scale">' + ['0.5', '1', '2', '3', '4'].map(function (x) { return '<option value="' + x + '"' + (s === x ? ' selected' : '') + '>' + x + '×</option>'; }).join('') + '</select></label></div>' +
      '<button class="r-btn r-btn-p r-w100" data-a="export">⬇ ' + esc(T(RR.sel.length ? 'r_export_sel' : 'r_export_page')) + '</button><button class="r-btn r-w100" data-a="savefile">' + esc(T('r_save_local')) + '</button>';
  }

  /* ---------------------------------------------------------- event inspektor */
  function setSel(fields, each) {
    RD.batch(function () {
      RR.sel.forEach(function (id) { var n = RD.get(id); if (!n) return; var f = typeof fields === 'function' ? fields(n) : fields; if (f) { if (f.w != null || f.h != null || f.x != null || f.y != null) RD.resize(id, Object.assign({ x: n.x, y: n.y, w: n.w, h: n.h }, f), n.type === 'group'); else RD.set(id, f); } });
      RT.afterTransform();
    });
    RR.draw();
  }
  function deepSet(n, path, v) { var parts = path.split('.'); if (parts.length === 1) { var o = {}; o[path] = v; return o; } var obj = JSON.parse(JSON.stringify(n[parts[0]] || {})); obj[parts[1]] = v; var r = {}; r[parts[0]] = obj; return r; }
  doc.addEventListener('change', function (e) {
    var t = e.target; if (!t.closest('#rRight')) return;
    var nodes = RR.sel.map(RD.get).filter(Boolean);
    if (t.dataset.k) {
      var k = t.dataset.k, v = t.type === 'number' ? parseFloat(t.value) : t.type === 'range' ? +t.value : t.value;
      if (k === 'opacity') v = v / 100;
      if (nodes.length > 1 && /^(x|y|w|h)$/.test(k)) { var b = RG.union(nodes.map(RG.bounds)), d = v - b[k]; if (k === 'x') RD.batch(function () { RD.moveBy(RR.sel, d, 0); }); else if (k === 'y') RD.batch(function () { RD.moveBy(RR.sel, 0, d); }); else { var s = v / b[k]; RD.batch(function () { nodes.forEach(function (n) { var f = {}; f[k] = n[k] * s; f[k === 'w' ? 'x' : 'y'] = b[k === 'w' ? 'x' : 'y'] + (n[k === 'w' ? 'x' : 'y'] - b[k === 'w' ? 'x' : 'y']) * s; RD.resize(n.id, Object.assign({ x: n.x, y: n.y, w: n.w, h: n.h }, f), true); }); }); } RR.draw(); right(); return; }
      setSel(function (n) {
        var f = deepSet(n, k, v);
        if (k === 'fsize' || k === 'font' || k === 'fweight' || k === 'lh' || k === 'ls') { if (n.type === 'text' && n.autoW !== false) { var m = RR.measureText(Object.assign({}, n, f)); f.w = m.w; f.h = m.h; } }
        if (k === 'stroke' && !n.sw) f.sw = 2;
        return f;
      });
      if (k === 'name' || k === 'link') left();
      right(); return;
    }
    if (t.dataset.hex) { var hv = t.value.trim(); setSel(function (n) { return deepSet(n, t.dataset.hex, hv); }); right(); return; }
    if (t.dataset.boolK) { var bk = t.dataset.boolK; setSel(function () { var o = {}; o[bk] = t.checked; return o; }); if (bk === 'clip' || bk === 'section') RR.draw(); return; }
    if (t.dataset.exp) { SN.store.set('r_exp_' + t.dataset.exp, t.value); return; }
    if (t.dataset.l) { setSel(function (n) { var L = Object.assign({}, n.layout); L[t.dataset.l] = +t.value; return { layout: L }; }); RR.sel.forEach(RD.layout); RR.draw(); return; }
    if (t.hasAttribute('data-lhug')) { setSel(function (n) { return { layout: Object.assign({}, n.layout, { hug: t.checked }) }; }); RR.sel.forEach(RD.layout); return; }
    if (t.hasAttribute('data-page-bg')) { RD.set(RD.page, { bg: t.value }); RR.draw(); return; }
    if (t.hasAttribute('data-gangle')) { var ang = +t.value * Math.PI / 180; setSel(function (n) { var f = JSON.parse(JSON.stringify(n.fill)); f.x1 = 0.5 - Math.cos(ang) / 2; f.y1 = 0.5 - Math.sin(ang) / 2; f.x2 = 0.5 + Math.cos(ang) / 2; f.y2 = 0.5 + Math.sin(ang) / 2; return { fill: f }; }); return; }
    if (t.dataset.a === 'grid') { RR.showGrid = t.checked; RR.draw(); }
    if (t.dataset.a === 'lgrid') { RR.layoutGrid = t.checked; RR.draw(); }
    if (t.dataset.a === 'snap') RT.noSnap = !t.checked;
    if (t.dataset.a === 'shadow') { setSel(function (n) { return { shadow: Object.assign({ x: 0, y: 4, blur: 12, color: '#00000040' }, n.shadow, { on: t.checked }) }; }); right(); }
    if (t.dataset.a === 'fgrid') { setSel(function () { return { grid: t.checked ? { cols: 12, gutter: 20, margin: 20 } : null }; }); RR.layoutGrid = RR.layoutGrid || t.checked; right(); }
    if (t.dataset.a === 'startframe') { RD.set(RD.page, { start: t.checked ? RR.sel[0] : '' }); }
    if (t.dataset.fx) { var ek = t.dataset.fx; setSel(function (n) { var fx = Object.assign({}, n.fx); fx[ek] = +t.value; return { fx: fx }; }); right(); }
  });
  doc.addEventListener('input', function (e) {
    var t = e.target; if (!t.closest || !t.closest('#rRight')) return;
    if (t.type === 'color' && t.dataset.k) { setSelLive(function (n) { var f = deepSet(n, t.dataset.k, t.value); if (t.dataset.k === 'stroke' && !n.sw) f.sw = 2; return f; }); }
    if (t.type === 'range' && t.dataset.k === 'opacity') setSelLive({ opacity: +t.value / 100 });
    if (t.dataset.fx) { var em = t.parentNode.querySelector('em'); if (em) em.textContent = t.value; }
    if (t.dataset.stop || t.dataset.stoppos) { var i = +(t.dataset.stop || t.dataset.stoppos); setSelLive(function (n) { var f = JSON.parse(JSON.stringify(n.fill)); if (t.dataset.stop) f.stops[i][1] = t.value; else f.stops[i][0] = +t.value / 100; return { fill: f }; }); }
  });
  var liveTimer = null;
  function setSelLive(f) { RD.begin(); RR.sel.forEach(function (id) { var n = RD.get(id); RD.set(id, typeof f === 'function' ? f(n) : f); }); RD.end(); RR.draw(); clearTimeout(liveTimer); liveTimer = setTimeout(right, 400); }
  doc.addEventListener('click', function (e) {
    var t = e.target; if (!t.closest('#rRight')) return;
    var b = t.closest('button'); if (!b) return;
    var d = b.dataset, nodes = RR.sel.map(RD.get).filter(Boolean), n = nodes[0];
    if (d.align) return align(d.align);
    if (d.bool) { var r = RG.boolean(d.bool, nodes); if (!r) { SN.ui.toast(T('r_bool_fail'), 'warn'); return; } var id; RD.batch(function () { id = RD.add({ type: 'path', x: r.x, y: r.y, w: r.w, h: r.h, d: r.d, fill: n.fill || RT.opts.fill, stroke: n.stroke, sw: n.sw, evenodd: d.bool === 'xor', name: T('r_bool_' + d.bool), parent: n.parent || '' }); RD.remove(RR.sel); }); RT.select([id]); return; }
    if (d.fillkind) { setSel(function (x) { var c = typeof x.fill === 'string' && x.fill !== 'none' ? x.fill : '#e8590c'; return { fill: d.fillkind === 'none' ? 'none' : d.fillkind === 'solid' ? (typeof x.fill === 'string' && x.fill !== 'none' ? x.fill : RT.opts.fill) : { type: d.fillkind, stops: [[0, c], [1, '#ffd43b']], x1: 0, y1: 0, x2: 1, y2: 1 } }; }); right(); return; }
    if (d.none) { setSel(function () { var o = {}; o[d.none] = 'none'; return o; }); right(); return; }
    if (d.kAlign) { setSel({ align: d.kAlign }); right(); return; }
    if (d.tog) { setSel(function (x) { var o = {}; o[d.tog] = !x[d.tog]; return o; }); right(); return; }
    if (d.kFill) { setSel({ fill: d.kFill }); return; }
    if (d.cstyle) { setSel({ style: d.cstyle }); right(); return; }
    if (d.ldir !== undefined) { setSel(function (x) { return { layout: d.ldir ? Object.assign({ gap: 12, pad: 16, align: 'start' }, x.layout, { dir: d.ldir }) : null }; }); RR.sel.forEach(RD.layout); right(); return; }
    if (d.lalign) { setSel(function (x) { return { layout: Object.assign({}, x.layout, { align: d.lalign }) }; }); RR.sel.forEach(RD.layout); right(); return; }
    if (d.fxp) { setSel({ fx: Object.assign({}, FX_PRESETS[d.fxp]) }); right(); return; }
    if (d.fxt) { setSel(function (x) { var fx = Object.assign({}, x.fx); fx[d.fxt] = fx[d.fxt] ? 0 : 1; return { fx: fx }; }); right(); return; }
    if (d.mask) { RT.maskOp(d.mask); right(); return; }
    if (d.frame) { var P = PRESETS.find(function (p) { return p[0] === d.frame; }), c = RR.toWorld(RR.size().w / 2, RR.size().h / 2), fid = RD.add({ type: 'frame', name: P[1], x: c.x - P[2] / 2, y: c.y - P[3] / 2, w: P[2], h: P[3], fill: '#ffffff', clip: true }); RT.select([fid]); RT.zoomSel(); return; }
    if (d.fsize) { var P2 = PRESETS.find(function (p) { return p[0] === d.fsize; }); setSel({ w: P2[2], h: P2[3] }); right(); return; }
    var a = d.a;
    if (a === 'pagebgreset') { RD.set(RD.page, { bg: '' }); RR.draw(); right(); }
    if (a === 'addimage') NE_pickImage();
    if (a === 'newlayer') { RT.rasterTarget(RR.toWorld(RR.size().w / 2, RR.size().h / 2), true); RT.setTool('brush'); }
    if (a === 'tplmenu') templateMenu(b);
    if (a === 'group') { var g = RD.group(RR.sel); if (g) RT.select([g]); }
    if (a === 'mkframe') { var bb = RG.union(nodes.map(RG.bounds)), fr; RD.batch(function () { fr = RD.add({ type: 'frame', name: T('r_frame'), x: bb.x - 16, y: bb.y - 16, w: bb.w + 32, h: bb.h + 32, fill: '#ffffff', clip: true, _o: SN.Collab.between('', (RD.nodes(undefined, '')[0] || {})._o || '') }); nodes.forEach(function (x) { RD.set(x.id, { parent: fr }); }); }); RT.select([fr]); }
    if (a === 'flipx') setSel(function (x) { return { flipX: !x.flipX }; });
    if (a === 'flipy') setSel(function (x) { return { flipY: !x.flipY }; });
    if (a === 'rot90') setSel(function (x) { return { rot: ((x.rot || 0) + 90) % 360 }; });
    if (a === 'front') RD.reorder(RR.sel, 'front');
    if (a === 'back') RD.reorder(RR.sel, 'back');
    if (a === 'crop') RT.setTool('crop');
    if (a === 'autofix') autoFix(n);
    if (a === 'bake') bake(n);
    if (a === 'replace') { var i = doc.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = function () { var f = i.files[0]; if (!f) return; var r2 = new FileReader(); r2.onload = function () { RD.set(n.id, { src: r2.result }); RR.invalidate(n.id); }; r2.readAsDataURL(f); }; i.click(); }
    if (a === 'natural') { var im = RR.image(n.src); if (im) setSel({ w: im.naturalWidth, h: im.naturalHeight }); }
    if (a === 'vote1') vote();
    if (a === 'copycss') { navigator.clipboard.writeText(cssOf(n)); SN.ui.toast(T('r_copied')); }
    if (a === 'mkcomp') makeComponent();
    if (a === 'sync') RD.syncInstances(n.id);
    if (a === 'detach') RD.set(n.id, { instOf: null });
    if (a === 'gomaster') { var m = RD.get(n.instOf); if (m) { if (m.page !== RD.page) { RD.page = m.page; left(); } RT.select([m.id]); RT.zoomSel(); } }
    if (a === 'editpts') RT.enterNodeEdit(n.id);
    if (a === 'outline') outlineStroke(n);
    if (a === 'export') exportNow();
    if (a === 'savefile') SN.saveFile((RD.file.name || 'rupa') + '.rupa', new Blob([JSON.stringify(RD.snapshot())], { type: 'application/json' }));
    right();
  });
  function align(k) {
    var nodes = RR.sel.map(RD.get).filter(Boolean); if (nodes.length < 2) return;
    var b = RG.union(nodes.map(RG.bounds));
    RD.batch(function () {
      if (k === 'dh' || k === 'dv') {
        var s = nodes.slice().sort(function (p, q) { return k === 'dh' ? p.x - q.x : p.y - q.y; }), total = s.reduce(function (a, n) { return a + (k === 'dh' ? n.w : n.h); }, 0), gap = ((k === 'dh' ? b.w : b.h) - total) / (s.length - 1), pos = k === 'dh' ? b.x : b.y;
        s.forEach(function (n) { var d = pos - (k === 'dh' ? n.x : n.y); RD.moveBy([n.id], k === 'dh' ? d : 0, k === 'dh' ? 0 : d); pos += (k === 'dh' ? n.w : n.h) + gap; });
        return;
      }
      nodes.forEach(function (n) {
        var nb = RG.bounds(n), dx = 0, dy = 0;
        if (k === 'l') dx = b.x - nb.x; if (k === 'r') dx = b.x + b.w - nb.x - nb.w; if (k === 'ch') dx = b.x + b.w / 2 - nb.x - nb.w / 2;
        if (k === 't') dy = b.y - nb.y; if (k === 'b') dy = b.y + b.h - nb.y - nb.h; if (k === 'cv') dy = b.y + b.h / 2 - nb.y - nb.h / 2;
        RD.moveBy([n.id], dx, dy);
      });
    });
    RR.draw();
  }
  function makeComponent() {
    var nodes = RR.sel.map(RD.get).filter(Boolean); if (!nodes.length) return;
    var id = nodes.length === 1 && (nodes[0].type === 'frame' || nodes[0].type === 'group') ? nodes[0].id : null;
    RD.batch(function () {
      if (!id) { var b = RG.union(nodes.map(RG.bounds)); id = RD.add({ type: 'frame', x: b.x, y: b.y, w: b.w, h: b.h, fill: 'none', clip: false, parent: nodes[0].parent || '' }); nodes.forEach(function (n) { RD.set(n.id, { parent: id }); }); }
      if (RD.get(id).type === 'group') RD.set(id, { type: 'frame', fill: 'none', clip: false });
      RD.set(id, { comp: true, name: RD.get(id).name && RD.get(id).name !== T('r_group') ? RD.get(id).name : T('r_component') + ' ' + (Object.keys(RD.ents).filter(function (k) { return RD.ents[k].comp && !RD.ents[k]._del; }).length) });
    });
    RT.select([id]); SN.ui.toast(T('r_comp_made')); leftTab = 'assets'; left();
  }
  RD.on('makeComponent', makeComponent);
  function outlineStroke(n) {
    if (!n.sw || !n.stroke || n.stroke === 'none') return;
    var rings = RG.flatten(n, 12), w = n.sw / 2, polys = [];
    rings.forEach(function (r) { for (var i = 1; i < r.length; i++) { var a = r[i - 1], b = r[i], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * w, ny = dx / l * w; polys.push([[[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]]]); } });
    var res; try { res = polygonClipping.union.apply(null, polys); } catch (e) { return; }
    var xs = [], ys = []; res.forEach(function (p) { p.forEach(function (r) { r.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); }); }); });
    var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys), W = Math.max(1, Math.max.apply(null, xs) - x), Hh = Math.max(1, Math.max.apply(null, ys) - y);
    var d = []; res.forEach(function (p) { p.forEach(function (r) { d.push({ closed: true, pts: r.slice(0, -1).map(function (q) { return { x: (q[0] - x) / W, y: (q[1] - y) / Hh }; }) }); }); });
    RD.batch(function () { var id = RD.add({ type: 'path', x: x, y: y, w: W, h: Hh, d: d, fill: n.stroke, stroke: 'none', sw: 0, name: (n.name || '') + ' outline', parent: n.parent || '' }); RT.select([id]); });
  }
  function autoFix(n) {
    var el = RR.image(n.src); if (!el) return;
    var c = doc.createElement('canvas'), s = Math.min(1, 256 / Math.max(el.naturalWidth, el.naturalHeight)); c.width = Math.max(1, el.naturalWidth * s); c.height = Math.max(1, el.naturalHeight * s);
    var g = c.getContext('2d'); g.drawImage(el, 0, 0, c.width, c.height);
    var d = g.getImageData(0, 0, c.width, c.height).data, sum = 0, lo = 255, hi = 0, sat = 0;
    for (var i = 0; i < d.length; i += 4) { var l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; sum += l; lo = Math.min(lo, l); hi = Math.max(hi, l); sat += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); }
    var cnt = d.length / 4, mean = sum / cnt, ms = sat / cnt;
    RD.set(n.id, { fx: Object.assign({}, n.fx, { brightness: Math.round((128 - mean) / 4), contrast: Math.round(Math.max(0, (200 - (hi - lo)) / 3)), saturate: Math.round(Math.max(0, (60 - ms) / 2)) }) });
    right();
  }
  /** Terapkan penyesuaian permanen ke piksel (seperti "rasterize"). */
  function bake(n) {
    var el = RR.image(n.src); if (!el) return;
    var c = doc.createElement('canvas'); c.width = el.naturalWidth; c.height = el.naturalHeight;
    var g = c.getContext('2d'); g.drawImage(el, 0, 0);
    if (n.fx) RR.applyFx(g, c.width, c.height, n.fx);
    RD.batch(function () { RD.set(n.id, { fx: null }); RT.commitRaster(n.id, c); });
  }

  /* ====================================================== ekspor */
  function exportNow() {
    var fmt = SN.store.get('r_exp_fmt', 'png'), scale = +SN.store.get('r_exp_scale', '2');
    var ids = RR.sel.length ? RR.sel.slice() : null;
    var nodes = ids ? ids.map(RD.get) : RD.nodes(undefined, '');
    if (!nodes.length) { SN.ui.toast(T('r_nothing'), 'warn'); return; }
    var box = RG.union(nodes.map(RG.bounds));
    var name = (ids && nodes.length === 1 ? nodes[0].name : RD.file.name) || 'rupa';
    if (fmt === 'svg') { SN.saveFile(name + '.svg', new Blob([toSVG(nodes, box)], { type: 'image/svg+xml' })); return; }
    if (fmt === 'pdf') {
      var frames = ids ? nodes : (RD.nodes(undefined, '').filter(function (n) { return n.type === 'frame'; }).length ? RD.nodes(undefined, '').filter(function (n) { return n.type === 'frame'; }) : [{ x: box.x, y: box.y, w: box.w, h: box.h, id: null }]);
      var pdf = null;
      frames.forEach(function (f) {
        var b = RG.bounds(f), c = RR.renderArea(b, Math.min(3, scale), { bg: '#ffffff', ids: f.id ? [f.id] : null });
        var orient = b.w > b.h ? 'l' : 'p';
        if (!pdf) pdf = new jspdf.jsPDF({ unit: 'px', format: [b.w, b.h], orientation: orient, hotfixes: ['px_scaling'] }); else pdf.addPage([b.w, b.h], orient);
        pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, b.w, b.h);
      });
      SN.saveFile(name + '.pdf', pdf.output('blob'));
      return;
    }
    var bg = fmt === 'jpg' ? '#ffffff' : null;
    var c2 = RR.renderArea(box, scale, { ids: ids, bg: bg });
    c2.toBlob(function (blob) { SN.saveFile(name + '.' + fmt, blob); }, fmt === 'jpg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png', 0.92);
  }
  function toSVG(nodes, box) {
    var out = [], defs = [], gid = 0;
    var paintAttr = function (n, k) {
      var v = n[k]; if (!v || v === 'none') return 'none';
      if (typeof v === 'string') return v;
      var id = 'g' + (++gid);
      defs.push(v.type === 'radial' ? '<radialGradient id="' + id + '">' + v.stops.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"/>'; }).join('') + '</radialGradient>' : '<linearGradient id="' + id + '" x1="' + (v.x1 || 0) + '" y1="' + (v.y1 || 0) + '" x2="' + (v.x2 == null ? 1 : v.x2) + '" y2="' + (v.y2 == null ? 1 : v.y2) + '">' + v.stops.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"/>'; }).join('') + '</linearGradient>');
      return 'url(#' + id + ')';
    };
    var pathD = function (n) {
      var parts = [];
      RG.shapePath(n).forEach(function (sp) {
        var p = sp.pts, X = function (v) { return (n.x + v * n.w).toFixed(2); }, Y = function (v) { return (n.y + v * n.h).toFixed(2); };
        if (!p.length) return;
        parts.push('M' + X(p[0].x) + ' ' + Y(p[0].y));
        var seg = function (a, b) { if (a.ox == null && b.ix == null) parts.push('L' + X(b.x) + ' ' + Y(b.y)); else parts.push('C' + X(a.ox == null ? a.x : a.ox) + ' ' + Y(a.oy == null ? a.y : a.oy) + ' ' + X(b.ix == null ? b.x : b.ix) + ' ' + Y(b.iy == null ? b.y : b.iy) + ' ' + X(b.x) + ' ' + Y(b.y)); };
        for (var i = 1; i < p.length; i++) seg(p[i - 1], p[i]);
        if (sp.closed) { seg(p[p.length - 1], p[0]); parts.push('Z'); }
      });
      return parts.join(' ');
    };
    var all = [];
    nodes.forEach(function (n) { all.push(n); RD.descendants(n.id).forEach(function (d) { all.push(d); }); });
    all.sort(function (a, b) { var o = RD.drawOrder(); return o.indexOf(a) - o.indexOf(b); });
    all.forEach(function (n) {
      if (n.visible === false) return;
      var tr = n.rot ? ' transform="rotate(' + n.rot + ' ' + (n.x + n.w / 2) + ' ' + (n.y + n.h / 2) + ')"' : '';
      var common = ' opacity="' + (n.opacity == null ? 1 : n.opacity) + '"' + tr;
      var st = ' stroke="' + paintAttr(n, 'stroke') + '" stroke-width="' + (n.sw || 0) + '"';
      if (n.type === 'image' || n.type === 'raster') out.push('<image href="' + n.src + '" x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" preserveAspectRatio="none"' + common + '/>');
      else if (n.type === 'text' || n.type === 'sticky') {
        if (n.type === 'sticky') out.push('<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" fill="' + (n.fill || '#ffe58a') + '"' + common + '/>');
        var lines = RR.textLines(n, doc.createElement('canvas').getContext('2d')), lh = (n.fsize || 16) * (n.lh || 1.3);
        out.push('<text font-family="' + SN.esc(n.font || 'Inter') + '" font-size="' + (n.fsize || 16) + '" font-weight="' + (n.fweight || 400) + '" fill="' + (n.color || '#111') + '"' + common + '>' + lines.map(function (l, i) { return '<tspan x="' + (n.x + (n.type === 'sticky' ? 12 : 0)) + '" y="' + (n.y + (n.type === 'sticky' ? 12 : 0) + (i + 0.8) * lh) + '">' + SN.esc(l) + '</tspan>'; }).join('') + '</text>');
      }
      else if (n.type === 'group' || n.type === 'conn') { if (n.type === 'conn') { var cp = RD.connPoints(n); if (cp) out.push('<polyline points="' + cp.pts.map(function (p) { return p.join(','); }).join(' ') + '" fill="none" stroke="' + (n.stroke || '#5b6175') + '" stroke-width="' + (n.sw || 2) + '"/>'); } }
      else if (n.type === 'rect' || n.type === 'frame') out.push('<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="' + (n.radius || 0) + '" fill="' + paintAttr(n, 'fill') + '"' + st + common + '/>');
      else if (n.type === 'ellipse') out.push('<ellipse cx="' + (n.x + n.w / 2) + '" cy="' + (n.y + n.h / 2) + '" rx="' + n.w / 2 + '" ry="' + n.h / 2 + '" fill="' + paintAttr(n, 'fill') + '"' + st + common + '/>');
      else out.push('<path d="' + pathD(n) + '" fill="' + (n.type === 'line' || n.type === 'arrow' ? 'none' : paintAttr(n, 'fill')) + '"' + (n.evenodd ? ' fill-rule="evenodd"' : '') + st + ' stroke-linecap="round" stroke-linejoin="round"' + common + '/>');
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [box.x, box.y, box.w, box.h].map(function (v) { return Math.round(v * 100) / 100; }).join(' ') + '" width="' + Math.round(box.w) + '" height="' + Math.round(box.h) + '">' + (defs.length ? '<defs>' + defs.join('') + '</defs>' : '') + out.join('') + '</svg>';
  }

  /* ====================================================== menu */
  function menu(anchor, items, cb, at) {
    closeMenu();
    var el = SN.el('div', { class: 'r-menu' });
    el.innerHTML = items.map(function (it) { return it[0] === '-' ? '<hr>' : '<button data-k="' + it[0] + '"' + (it[3] ? ' disabled' : '') + '><span>' + esc(it[1]) + '</span>' + (it[2] ? '<kbd>' + esc(it[2]) + '</kbd>' : '') + '</button>'; }).join('');
    doc.body.appendChild(el);
    var r = at || anchor.getBoundingClientRect();
    el.style.left = Math.max(6, Math.min(r.left || r.x, innerWidth - el.offsetWidth - 6)) + 'px';
    el.style.top = Math.max(6, Math.min((r.bottom || r.y) + 4, innerHeight - el.offsetHeight - 6)) + 'px';
    el.onclick = function (e) { var b = e.target.closest('[data-k]'); if (!b) return; closeMenu(); cb(b.dataset.k); };
    openMenu = el;
  }
  var openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  doc.addEventListener('pointerdown', function (e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }, true);
  function mainMenu(anchor) {
    menu(anchor, [['new', T('r_new_file')], ['open', T('r_open_file')], ['save', T('r_save_cloud'), '⌘S'], ['local', T('r_save_local')], ['dup', T('r_dup_file')], ['-'], ['img', T('r_add_image')], ['svg', T('r_import_svg')], ['-'], ['export', T('r_export')], ['history', T('r_history')], ['-'], ['panels', T('r_toggle_panels')], ['keys', T('r_shortcuts')]], async function (k) {
      if (k === 'new') home();
      if (k === 'open') openLocal();
      if (k === 'save') { await RD.save(true); SN.ui.toast(T('sn_saved')); }
      if (k === 'local') SN.saveFile((RD.file.name || 'rupa') + '.rupa', new Blob([JSON.stringify(RD.snapshot())], { type: 'application/json' }));
      if (k === 'dup') { var snap = JSON.parse(JSON.stringify(RD.snapshot())); await RD.open({ name: RD.file.name + ' (2)' }, snap); RD.save(); editor(); }
      if (k === 'img') NE_pickImage();
      if (k === 'svg') { var i = doc.createElement('input'); i.type = 'file'; i.accept = '.svg,image/svg+xml'; i.onchange = async function () { var c = RR.toWorld(RR.size().w / 2, RR.size().h / 2); RT.importSVG(await i.files[0].text(), c.x, c.y); }; i.click(); }
      if (k === 'export') exportNow();
      if (k === 'history') history();
      if (k === 'panels') { $('#rLeft').classList.toggle('is-hidden'); $('#rRight').classList.toggle('is-hidden'); setTimeout(RR.resize, 10); }
      if (k === 'keys') shortcuts();
    });
  }
  async function history() {
    var bd = SN.el('div', { class: 'sn-modal-bd' }, '<div class="sn-modal"><h3 style="margin:0 0 10px">' + esc(T('r_history')) + '</h3><div class="r-hist"><div class="sn-spinner"></div></div><div class="sn-modal-act"><button class="sn-btn" data-x>' + esc(T('sn_close')) + '</button></div></div>');
    doc.body.appendChild(bd);
    bd.onclick = async function (e) {
      if (e.target === bd || e.target.closest('[data-x]')) bd.remove();
      var v = e.target.closest('[data-vid]');
      if (v && await SN.ui.confirm(T('r_restore_q'))) {
        try { var r = await SN.api('api/projects.php?action=version&vid=' + v.dataset.vid); var c = r.version.content; if (typeof c === 'string') c = JSON.parse(c); bd.remove(); var f = RD.file; await RD.open(f, c); RD.dirty(); editor(); RT.zoomFit(); } catch (x) { SN.ui.toast(x.message, 'err'); }
      }
    };
    try {
      var r = await SN.api('api/projects.php?action=versions&id=' + RD.file.id);
      var list = r.versions || [];
      bd.querySelector('.r-hist').innerHTML = list.length ? list.map(function (v) { return '<button class="r-row" data-vid="' + v.id + '"><span class="r-row-t">' + esc(new Date(v.created_at || v.at).toLocaleString(SN.lang === 'id' ? 'id-ID' : 'en-US')) + '</span><small>' + esc(v.reason || '') + '</small></button>'; }).join('') : '<p class="r-muted">' + esc(T('r_no_history')) + '</p>';
    } catch (e) { bd.querySelector('.r-hist').innerHTML = '<p class="r-muted">' + esc(T('r_no_history')) + '</p>'; }
  }
  function shortcuts() {
    var rows = [['V', 'r_t_select'], ['H / Space', 'r_t_hand'], ['R', 'r_t_rect'], ['O', 'r_t_ellipse'], ['P', 'r_t_pen'], ['⇧P', 'r_t_pencil'], ['T', 'r_t_text'], ['F', 'r_t_frame'], ['S', 'r_t_sticky'], ['C', 'r_t_conn'], ['B', 'r_t_brush'], ['E', 'r_t_eraser'], ['M', 'r_t_marquee'], ['L', 'r_t_lasso'], ['W', 'r_t_wand'], ['K', 'r_t_crop'], ['I', 'r_t_eyedrop'], ['⌘G / ⌘⇧G', 'r_group'], ['⌘D', 'r_duplicate'], ['⌘[ ]', 'r_order'], ['⇧1 / ⇧2', 'r_zoom_fit'], ['[ ]', 'r_brush_size'], ['Alt+drag', 'r_dup_drag'], ['Enter', 'r_edit_points']];
    var bd = SN.el('div', { class: 'sn-modal-bd' }, '<div class="sn-modal" style="width:min(520px,100%)"><h3 style="margin:0 0 10px">' + esc(T('r_shortcuts')) + '</h3><div class="r-keys">' + rows.map(function (r) { return '<kbd>' + esc(r[0]) + '</kbd><span>' + esc(T(r[1])) + '</span>'; }).join('') + '</div><div class="sn-modal-act"><button class="sn-btn" data-x>' + esc(T('sn_close')) + '</button></div></div>');
    doc.body.appendChild(bd);
    bd.onclick = function (e) { if (e.target === bd || e.target.closest('[data-x]')) bd.remove(); };
  }
  function zoomMenu(anchor) {
    menu(anchor, [['in', T('r_zoom_in'), '⌘+'], ['out', T('r_zoom_out'), '⌘−'], ['fit', T('r_zoom_fit'), '⇧1'], ['sel', T('r_zoom_sel'), '⇧2'], ['100', '100%', '⌘1'], ['50', '50%'], ['200', '200%']], function (k) {
      var s = RR.size();
      if (k === 'in') RR.zoomAt(s.w / 2, s.h / 2, 1.25); if (k === 'out') RR.zoomAt(s.w / 2, s.h / 2, 0.8);
      if (k === 'fit') RT.zoomFit(); if (k === 'sel') RT.zoomSel();
      if (/^\d+$/.test(k)) RR.zoomAt(s.w / 2, s.h / 2, (+k / 100) / RR.view.z);
    });
  }
  RD.on('context', function (p) {
    var has = RR.sel.length, one = RD.get(RR.sel[0]);
    var items = has ? [['copy', T('r_copy'), '⌘C'], ['dup', T('r_duplicate'), '⌘D'], ['del', T('r_delete'), '⌫'], ['-'], ['front', T('r_front'), '⌘⇧]'], ['up', T('r_forward'), '⌘]'], ['down', T('r_backward'), '⌘['], ['back', T('r_back'), '⌘⇧['], ['-'], ['group', T('r_group'), '⌘G'], ['ungroup', T('r_ungroup'), '⌘⇧G'], ['frame', T('r_frame_sel')], ['comp', T('r_make_comp'), '⌘⌥K'], ['-'], ['lock', one && one.locked ? T('r_unlock') : T('r_lock')], ['hide', T('r_hide')], ['zoom', T('r_zoom_sel'), '⇧2'], ['png', T('r_copy_png')]]
      : [['paste', T('r_paste'), '⌘V'], ['all', T('r_select_all'), '⌘A'], ['-'], ['img', T('r_add_image')], ['sticky', T('r_t_sticky')], ['comment', T('r_t_comment')], ['fit', T('r_zoom_fit'), '⇧1']];
    menu(null, items, function (k) {
      if (k === 'copy') doc.execCommand('copy');
      if (k === 'paste') navigator.clipboard.readText().then(function (t) { var ev = new ClipboardEvent('paste', { clipboardData: new DataTransfer() }); ev.clipboardData.setData('text/plain', t); doc.dispatchEvent(ev); }).catch(function () { SN.ui.toast('⌘V'); });
      if (k === 'dup') RT.select(RD.duplicate(RR.sel, 20, 20));
      if (k === 'del') { RD.remove(RR.sel); RT.select([]); }
      if (k === 'front' || k === 'back' || k === 'up' || k === 'down') RD.reorder(RR.sel, k);
      if (k === 'group') { var g = RD.group(RR.sel); if (g) RT.select([g]); }
      if (k === 'ungroup') RR.sel.slice().forEach(function (id) { RT.select(RD.ungroup(id)); });
      if (k === 'frame') { var b = RG.union(RR.sel.map(RD.get).map(RG.bounds)), ids = RR.sel.slice(), fr; RD.batch(function () { fr = RD.add({ type: 'frame', name: T('r_frame'), x: b.x - 16, y: b.y - 16, w: b.w + 32, h: b.h + 32, fill: '#ffffff', clip: true, _o: SN.Collab.between('', (RD.nodes(undefined, '')[0] || {})._o || '') }); ids.forEach(function (id) { RD.set(id, { parent: fr }); }); }); RT.select([fr]); }
      if (k === 'comp') makeComponent();
      if (k === 'lock') RD.batch(function () { RR.sel.forEach(function (id) { RD.set(id, { locked: !RD.get(id).locked }); }); });
      if (k === 'hide') RD.batch(function () { RR.sel.forEach(function (id) { RD.set(id, { visible: false }); }); });
      if (k === 'zoom') RT.zoomSel();
      if (k === 'png') { var bb = RG.union(RR.sel.map(RD.get).map(RG.bounds)); RR.renderArea(bb, 2, { ids: RR.sel }).toBlob(function (bl) { try { navigator.clipboard.write([new ClipboardItem({ 'image/png': bl })]); SN.ui.toast(T('r_copied')); } catch (e) { SN.ui.toast(e.message, 'err'); } }); }
      if (k === 'all') RT.select(RD.nodes(undefined, '').map(function (n) { return n.id; }));
      if (k === 'img') NE_pickImage();
      if (k === 'sticky') { var id = RD.add({ type: 'sticky', x: p.world.x - 100, y: p.world.y - 100, w: 200, h: 200, fill: RT.opts.sticky, text: '', fsize: 18, author: SN.ctx.name || '' }); RT.select([id]); RT.editText(id, true); }
      if (k === 'comment') RD.emit('comment', p.world);
      if (k === 'fit') RT.zoomFit();
      left(); RR.draw();
    }, { left: p.x, bottom: p.y });
  });

  /* ====================================================== papan: template, timer, vote */
  function boardTemplate(kind, x, y) {
    var add = function (f) { return RD.add(Object.assign({ fsize: 16, color: '#1b1e2b' }, f)); };
    var conn = function (a, b, label) { return RD.add({ type: 'conn', from: { id: a, side: 'auto' }, to: { id: b, side: 'auto' }, style: 'elbow', stroke: '#5b6175', sw: 2, endArrow: true, text: label || '', x: 0, y: 0, w: 1, h: 1 }); };
    var sec = function (name, sx, sy, w, h, fill) { return add({ type: 'frame', section: true, name: name, x: sx, y: sy, w: w, h: h, fill: fill || 'rgba(120,120,140,.08)', clip: false, radius: 16 }); };
    if (kind === 'flow') {
      var s = add({ type: 'ellipse', x: x, y: y, w: 160, h: 70, fill: '#b8f2d0', text: T('r_fl_start') });
      var p1 = add({ type: 'rect', x: x, y: y + 130, w: 160, h: 80, radius: 10, fill: '#b6dcff', text: T('r_fl_process') });
      var dd = add({ type: 'polygon', sides: 4, x: x - 10, y: y + 270, w: 180, h: 120, fill: '#ffe58a', text: T('r_fl_decision') });
      var p2 = add({ type: 'rect', x: x + 260, y: y + 290, w: 160, h: 80, radius: 10, fill: '#b6dcff', text: T('r_fl_process') + ' 2' });
      var e = add({ type: 'ellipse', x: x, y: y + 450, w: 160, h: 70, fill: '#ffb3c7', text: T('r_fl_end') });
      conn(s, p1); conn(p1, dd); conn(dd, e, T('r_yes')); conn(dd, p2, T('r_no'));
    }
    if (kind === 'mind') {
      var c = add({ type: 'ellipse', x: x + 300, y: y + 200, w: 200, h: 90, fill: '#d7c4ff', text: T('r_mm_center'), fsize: 20, fweight: 700 });
      [[-260, -150], [300, -150], [-260, 150], [300, 150], [20, -230], [20, 230]].forEach(function (o, i) { var b = add({ type: 'rect', radius: 40, x: x + 310 + o[0], y: y + 215 + o[1], w: 180, h: 60, fill: STICKY[i % STICKY.length], text: T('r_mm_idea') + ' ' + (i + 1) }); RD.add({ type: 'conn', from: { id: c, side: 'auto' }, to: { id: b, side: 'auto' }, style: 'curve', stroke: '#8a8fa3', sw: 2, endArrow: false, x: 0, y: 0, w: 1, h: 1 }); });
    }
    if (kind === 'kanban') ['r_kb_todo', 'r_kb_doing', 'r_kb_review', 'r_kb_done'].forEach(function (k, i) { var f = sec(T(k), x + i * 300, y, 280, 640); for (var j = 0; j < 2; j++) RD.add({ type: 'sticky', parent: f, x: x + i * 300 + 40, y: y + 50 + j * 220, w: 200, h: 190, fill: STICKY[i], text: '', fsize: 16 }); });
    if (kind === 'retro') [['r_rt_well', '#b8f2d0'], ['r_rt_improve', '#ffc6a8'], ['r_rt_actions', '#b6dcff']].forEach(function (k, i) { sec(T(k[0]), x + i * 380, y, 360, 560, k[1] + '55'); });
    if (kind === 'journey') ['r_jr_aware', 'r_jr_consider', 'r_jr_buy', 'r_jr_use', 'r_jr_loyal'].forEach(function (k, i) { sec(T(k), x + i * 260, y, 240, 480); RD.add({ type: 'sticky', x: x + i * 260 + 20, y: y + 60, w: 200, h: 160, fill: STICKY[i % 6], text: '' }); });
    if (kind === 'swot') [['S', '#b8f2d0'], ['W', '#ffc6a8'], ['O', '#b6dcff'], ['T', '#ffb3c7']].forEach(function (k, i) { sec(T('r_swot_' + k[0]), x + (i % 2) * 420, y + Math.floor(i / 2) * 340, 400, 320, k[1] + '66'); });
  }
  function templateMenu(anchor) {
    menu(anchor, ['flow', 'mind', 'kanban', 'retro', 'journey', 'swot'].map(function (k) { return [k, T('r_p_' + k)]; }), function (k) {
      var w = RR.toWorld(RR.size().w / 2, RR.size().h / 2);
      RD.batch(function () { boardTemplate(k, w.x - 400, w.y - 250); });
      RT.zoomFit();
    });
  }
  function timerMenu(anchor) {
    menu(anchor, [['1', '1 ' + T('r_min')], ['3', '3 ' + T('r_min')], ['5', '5 ' + T('r_min')], ['10', '10 ' + T('r_min')], ['0', T('r_stop')]], function (k) { RD.set('timer', { kind: 'timer', endAt: +k ? Date.now() + +k * 60000 : 0, by: SN.ctx.name || SN.ctx.email }); });
  }
  function vote() {
    var ids = RR.sel.filter(function (id) { var n = RD.get(id); return n && n.type === 'sticky'; });
    if (!ids.length) { SN.ui.toast(T('r_vote_hint')); return; }
    RD.batch(function () { ids.forEach(function (id) { var n = RD.get(id), v = Object.assign({}, n.votes); if (v[SN.ctx.email]) delete v[SN.ctx.email]; else v[SN.ctx.email] = 1; RD.set(id, { votes: v }); }); });
    right();
  }
  setInterval(function () {
    var t = RD.get('timer'), el = $('#rTimer');
    if (!t || !t.endAt || t.endAt < Date.now() - 4000) { if (el) el.remove(); return; }
    if (!el) { el = SN.el('div', { id: 'rTimer', class: 'r-timer' }); ($('#rStage') || doc.body).appendChild(el); }
    var left2 = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
    el.textContent = '⏱ ' + Math.floor(left2 / 60) + ':' + String(left2 % 60).padStart(2, '0');
    el.classList.toggle('is-done', !left2);
  }, 500);

  /* ====================================================== komentar */
  RD.on('comment', async function (w) {
    var body = await SN.ui.prompt(T('r_comment_prompt'), '');
    if (!body) return;
    RD.set(RG.uid('c'), { kind: 'cmt', page: RD.page, x: w.x, y: w.y, body: body, by: SN.ctx.email, name: SN.ctx.name || SN.ctx.email, at: Date.now(), replies: [] });
    pins();
    if (RT.tool === 'comment') RT.setTool('select');
  });
  function pins() {
    var box = $('#rPins'); if (!box) return;
    var list = Object.keys(RD.ents).map(function (k) { return RD.ents[k]; }).filter(function (c) { return c.kind === 'cmt' && !c._del && c.page === RD.page && !c.resolved; });
    box.innerHTML = list.map(function (c) { var p = RR.toScreen(c.x, c.y); return '<button class="r-pin" data-cmt="' + c.id + '" style="left:' + p.x + 'px;top:' + p.y + 'px" title="' + esc(c.name + ': ' + c.body) + '">' + esc((c.name || '?').charAt(0).toUpperCase()) + (c.replies && c.replies.length ? '<i>' + (c.replies.length + 1) + '</i>' : '') + '</button>'; }).join('');
  }
  doc.addEventListener('click', function (e) {
    var p = e.target.closest('.r-pin'); if (!p) return;
    var c = RD.get(p.dataset.cmt);
    var bd = SN.el('div', { class: 'sn-modal-bd' }, '<div class="sn-modal"><div class="r-thread">' + [{ name: c.name, body: c.body, at: c.at }].concat(c.replies || []).map(function (r) { return '<div><b>' + esc(r.name) + '</b> <small>' + esc(new Date(r.at).toLocaleString()) + '</small><p>' + esc(r.body) + '</p></div>'; }).join('') + '</div><input class="sn-input" placeholder="' + esc(T('r_reply')) + '"><div class="sn-modal-act"><button class="sn-btn" data-r>' + esc(T('r_resolve')) + '</button><button class="sn-btn" data-x>' + esc(T('sn_close')) + '</button><button class="sn-btn sn-btn-primary" data-s>' + esc(T('r_send')) + '</button></div></div>');
    doc.body.appendChild(bd);
    bd.onclick = function (ev) {
      if (ev.target === bd || ev.target.closest('[data-x]')) bd.remove();
      if (ev.target.closest('[data-r]')) { RD.set(c.id, { resolved: true }); bd.remove(); pins(); }
      if (ev.target.closest('[data-s]')) { var v = bd.querySelector('input').value.trim(); if (v) { RD.set(c.id, { replies: (c.replies || []).concat([{ name: SN.ctx.name || SN.ctx.email, body: v, at: Date.now() }]) }); } bd.remove(); pins(); }
    };
    bd.querySelector('input').focus();
  });

  /* ====================================================== prototipe / presentasi */
  function present() {
    var frames = RD.nodes(undefined, '').filter(function (n) { return n.type === 'frame' && !n.section; }).sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    if (!frames.length) { SN.ui.toast(T('r_need_frame'), 'warn'); return; }
    var pg = RD.get(RD.page), cur = frames.find(function (f) { return f.id === pg.start; }) || (RR.sel[0] && frames.find(function (f) { return f.id === RR.sel[0]; })) || frames[0], stack = [];
    var ov = SN.el('div', { class: 'r-present' }, '<canvas></canvas><div class="r-present-bar"><button data-p="prev">‹</button><span></span><button data-p="next">›</button><button data-p="x">✕</button></div>');
    doc.body.appendChild(ov);
    var c = ov.querySelector('canvas'), g = c.getContext('2d'), hot = [];
    function show(f, trans) {
      var W = innerWidth, H = innerHeight - 48, s = Math.min(W / f.w, H / f.h), dprr = Math.min(2, devicePixelRatio || 1);
      var img = RR.renderArea({ x: f.x, y: f.y, w: f.w, h: f.h }, s * dprr, { ids: [f.id], bg: '#ffffff' });
      c.width = W * dprr; c.height = H * dprr; c.style.width = W + 'px'; c.style.height = H + 'px';
      var ox = (W - f.w * s) / 2, oy = (H - f.h * s) / 2;
      var draw = function (a, dx) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height); g.globalAlpha = a; g.drawImage(img, (ox + dx) * dprr, oy * dprr); g.globalAlpha = 1; };
      var t0 = performance.now();
      (function anim(t) { var k = Math.min(1, (t - t0) / 260); if (trans === 'instant') k = 1; draw(trans === 'dissolve' ? k : 1, trans === 'slide' ? (1 - k) * W * 0.3 : 0); if (k < 1) requestAnimationFrame(anim); })(t0);
      hot = RD.descendants(f.id).filter(function (n) { return n.link; }).map(function (n) { var b = RG.bounds(n); return { n: n, x: ox + (b.x - f.x) * s, y: oy + (b.y - f.y) * s, w: b.w * s, h: b.h * s }; });
      if (f.link) hot.push({ n: f, x: ox, y: oy, w: f.w * s, h: f.h * s });
      ov.querySelector('span').textContent = (f.name || '') + ' · ' + (frames.indexOf(f) + 1) + '/' + frames.length;
      cur = f;
    }
    show(cur, 'instant');
    c.onmousemove = function (e) { c.style.cursor = hot.some(function (h) { return e.clientX >= h.x && e.clientX <= h.x + h.w && e.clientY >= h.y && e.clientY <= h.y + h.h; }) ? 'pointer' : 'default'; };
    c.onclick = function (e) {
      var h = hot.filter(function (h2) { return e.clientX >= h2.x && e.clientX <= h2.x + h2.w && e.clientY >= h2.y && e.clientY <= h2.y + h2.h; }).pop();
      if (!h) return;
      if (h.n.link === '__back') { var b = stack.pop(); if (b) show(b, h.n.trans || 'dissolve'); return; }
      var t = RD.get(h.n.link); if (t) { stack.push(cur); show(t, h.n.trans || 'dissolve'); }
    };
    var nav = function (d) { var i = frames.indexOf(cur) + d; if (frames[i]) show(frames[i], 'slide'); };
    var keyh = function (e) { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight' || e.key === ' ') nav(1); if (e.key === 'ArrowLeft') nav(-1); };
    function close() { ov.remove(); doc.removeEventListener('keydown', keyh, true); }
    doc.addEventListener('keydown', keyh, true);
    ov.querySelector('.r-present-bar').onclick = function (e) { var b = e.target.closest('[data-p]'); if (!b) return; if (b.dataset.p === 'x') close(); else nav(b.dataset.p === 'next' ? 1 : -1); };
    if (ov.requestFullscreen) ov.requestFullscreen().catch(function () {});
  }

  /* ====================================================== status & kolaborator */
  function status(s) { var el = $('#rSync'); if (!el) return; el.className = 'r-sync is-' + s; el.textContent = T({ ok: 'sn_saved', saving: 'sn_saving', offline: 'r_offline', error: 'sn_save_err' }[s] || 'sn_saved'); }
  RD.on('status', status);
  var follow = null;
  RD.on('presence', function (peers) {
    RR.peers = peers; RR.draw();
    var el = $('#rPeers'); if (!el) return;
    el.innerHTML = peers.slice(0, 6).map(function (p) { return '<span style="background:' + esc(p.color) + ';' + (follow === p.client_id ? 'box-shadow:0 0 0 2px var(--r-mode)' : '') + '" data-follow="' + esc(p.client_id) + '" title="' + esc((p.display_name || p.user_email) + ' — ' + T('r_follow')) + '">' + esc((p.display_name || p.user_email || '?').charAt(0).toUpperCase()) + '</span>'; }).join('');
    if (follow) { var f = peers.find(function (p) { return p.client_id === follow; }); if (f && f.cursor && f.cursor.view) { if (f.cursor.page && f.cursor.page !== RD.page && RD.get(f.cursor.page)) { RD.page = f.cursor.page; left(); } RR.view = Object.assign({}, f.cursor.view); RR.draw(); } }
  });
  doc.addEventListener('click', function (e) { var f = e.target.closest('[data-follow]'); if (!f) return; follow = follow === f.dataset.follow ? null : f.dataset.follow; SN.ui.toast(T(follow ? 'r_following' : 'r_unfollow')); });
  RD.on('canvasdown', function () { if (follow) { follow = null; } });
  var selTimer = null;
  RD.on('select', function () { left(); clearTimeout(selTimer); selTimer = setTimeout(right, 30); });
  var leftTimer = null;
  RD.on('change', function (d) {
    clearTimeout(leftTimer); leftTimer = setTimeout(left, d.local ? 250 : 120);
    if (!d.local) { clearTimeout(selTimer); selTimer = setTimeout(function () { if (!$('#rRight') || !$('#rRight').contains(doc.activeElement)) right(); }, 120); }
    RR.draw(); pins();
  });
  RD.on('view', function () { pins(); var z = $('#rZoom'); if (z) z.textContent = Math.round(RR.view.z * 100) + '%'; });
  RD.on('history', function () { left(); right(); });
  RD.on('readonly', function () { SN.ui.toast(T('r_readonly'), 'warn'); });
  RD.on('mask', right);
  SN.on('lang', function () { if (RD.file) { editor(); } else home(); });
  SN.on('theme', function () { RR.draw(); });

  SN.on('share-link', async function (token) {
    try { var r = await SN.Docs.openShared(token), p = r.project || r; await openFile({ id: p.id, name: p.name, share: token, shared: true }); }
    catch (e) { SN.ui.toast(e.message, 'err'); }
  });

  /* ====================================================== mulai */
  SN.ready.then(function () {
    var root = doc.body.insertBefore(SN.el('div', { id: 'rRoot' }), doc.body.firstChild);
    home();
  });
})();
