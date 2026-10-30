/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Right-hand panel.
   Chat & Design: the artifact canvas (live preview, code, versions, element
   picker, export).  Code: Claude-Code-style tabs — File explorer, Changes,
   Terminal and a dev-server Preview. */
(function () {
  'use strict';
  var h = U.h;
  var Panel = {};
  var els = {};
  var conv = null;
  var st = {
    open: false, artId: null, vIdx: null, view: 'preview', userView: false, device: 'desktop', inspect: false,
    errors: [], frameKey: '', seenFiles: new Set(), codeTab: 'files', file: null, expanded: new Set(), tree: new Map(), git: {}, hidden: false,
    term: { log: '', history: [], hIdx: -1, job: null, cwd: null }, previewUrl: 'http://localhost:3000',
  };
  var DEVICES = { desktop: null, tablet: 834, mobile: 390 };

  function fnv(s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); }

  Panel.init = function () {
    els.panel = document.getElementById('panel');
    els.head = document.getElementById('panel-head');
    els.body = document.getElementById('panel-body');
    els.resizer = document.getElementById('panel-resizer');
    els.toggle = document.getElementById('btn-panel');
    els.toggle.innerHTML = U.icon('sidebar');
    els.toggle.addEventListener('click', function () { Panel.toggle(); });
    els.resizer.addEventListener('mousedown', startResize);
    window.addEventListener('message', onFrameMessage);
    window.addEventListener('resize', U.throttle(applyWidth, 100));
  };

  function mode() { return conv ? conv.mode : UI.state.mode; }
  Panel.isOpen = function () { return st.open; };

  function widthKey() { return 'panelWidth_' + mode(); }
  function applyWidth() {
    var def = mode() === 'design' ? Math.round(window.innerWidth * 0.58) : mode() === 'code' ? 460 : Math.round(window.innerWidth * 0.48);
    var w = Store.settings[widthKey()] || def;
    var sb = document.getElementById('app').classList.contains('sb-collapsed') ? 0 : 290;
    w = Math.max(340, Math.min(w, window.innerWidth - sb - 360));
    els.panel.style.width = w + 'px';
  }

  function startResize(e) {
    e.preventDefault();
    document.body.classList.add('resizing');
    function move(ev) {
      var w = window.innerWidth - ev.clientX - 8;
      Store.settings[widthKey()] = w;
      applyWidth();
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove('resizing');
      Store.saveSettings();
      UI.syncDrag();
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function setOpen(open) {
    st.open = open;
    els.panel.hidden = !open;
    els.toggle.classList.toggle('on', open);
    document.getElementById('app').classList.toggle('panel-open', open);
    if (open) applyWidth();
    setTimeout(UI.syncDrag, 30);
  }

  Panel.toggle = function () {
    setOpen(!st.open);
    if (mode() === 'code') Store.setSetting('codePanelOpen', st.open);
    if (st.open) render();
  };

  /* Called whenever the visible conversation changes. */
  Panel.attach = function (c) {
    conv = c;
    st.errors = [];
    st.frameKey = '';
    st.vIdx = null;
    st.userView = false;
    st.inspect = false;
    st.file = null;
    st.tree = new Map();
    st.git = {};
    st.term.cwd = c.workspace || null;
    st.nChanges = null;
    st.browser = false;
    var arts = Artifacts.collect(c).list;
    st.artId = arts.length ? arts[arts.length - 1].id : null;
    arts.forEach(function (a) { if (a.type === 'file') a.versions.forEach(function (v) { st.seenFiles.add(v.file.path); }); });
    if (c.mode === 'design') setOpen(true);
    else if (c.mode === 'code') setOpen(!!Store.settings.codePanelOpen);
    else setOpen(false);
    els.toggle.title = c.mode === 'code' ? 'Panel file, perubahan & terminal' : 'Kanvas artifact';
    if (st.open) render();
    if (c.mode === 'code' && c.workspace) refreshGit();
  };

  /* Conversation content changed (streaming etc.). */
  Panel.update = U.throttle(function () {
    if (!conv) return;
    if (conv.mode === 'code') {
      var nch = sessionChanges().length;
      if (nch !== st.nChanges) { if (st.nChanges != null && st.open && st.codeTab === 'preview') Browser.filesChanged(); st.nChanges = nch; }
      if (st.open && st.codeTab === 'changes') render();
      return;
    }
    var col = Artifacts.collect(conv);
    // A file just created during this run: show it right away.
    if (Engine.isRunning(conv.id)) {
      var newest = null;
      col.list.forEach(function (a) {
        if (a.type !== 'file') return;
        var fv = a.versions[a.versions.length - 1];
        if (fv && !st.seenFiles.has(fv.file.path) && (!newest || fv.file.createdAt > newest.v.file.createdAt)) newest = { a: a, v: fv };
      });
      if (newest) {
        st.seenFiles.add(newest.v.file.path);
        st.artId = newest.a.id;
        st.vIdx = null;
        if (Store.settings.autoOpenCanvas !== false) setOpen(true);
      }
    }
    var latest = col.list[col.list.length - 1];
    if (latest && latest.type !== 'file') {
      var v = latest.versions[latest.versions.length - 1];
      var fresh = v && (v.streaming || latest.editing) && v.msgId === lastAssistantId();
      if (fresh && (st.artId !== latest.id || !st.open)) {
        st.artId = latest.id;
        st.vIdx = null;
        if (Store.settings.autoOpenCanvas !== false) setOpen(true);
      }
    }
    if (st.open) render();
  }, 250);

  function lastAssistantId() {
    for (var i = conv.messages.length - 1; i >= 0; i--) if (conv.messages[i].role === 'assistant') return conv.messages[i].id;
    return null;
  }

  Panel.openArtifact = function (id, versionIdx) {
    if (!conv) return;
    if (conv.mode === 'code') return;
    st.artId = id;
    st.vIdx = versionIdx == null ? null : versionIdx;
    st.userView = false;
    setOpen(true);
    render();
  };

  function render() {
    if (!st.open || !conv) return;
    var mb = els.panel.querySelector('.mirror-bar'); if (mb) mb.remove();
    if (conv.mode === 'code') renderCode(); else renderCanvas();
  }
  Panel.render = render;

  // ================================================================ canvas

  function currentArtifact() {
    var col = Artifacts.collect(conv);
    var art = col.byId[st.artId] || col.list[col.list.length - 1] || null;
    if (!art) return { col: col };
    var n = art.versions.length;
    var idx = st.vIdx == null ? n - 1 : Math.min(st.vIdx, n - 1);
    // while the newest version streams, keep previewing the last complete one
    var shown = idx;
    while (shown > 0 && !art.versions[shown].complete) shown--;
    return { col: col, art: art, idx: idx, shownIdx: shown, version: art.versions[idx], shown: art.versions[shown] };
  }

  /* Browser (live view) inside the Chat/Design canvas. */
  function renderBrowserCanvas() {
    var mb = els.panel.querySelector('.mirror-bar'); if (mb) mb.remove();
    els.panel.className = 'panel canvas';
    els.head.innerHTML = '';
    els.head.appendChild(h('button.ph-title.no-drag', { html: '<span class="flip" style="display:inline-flex">' + U.icon('chevronRight') + '</span>' + U.icon('globe') + '<span>Browser</span>', title: 'Kembali ke kanvas', onclick: function () { st.browser = false; st.frameKey = ''; render(); } }));
    els.head.appendChild(h('div.ph-spacer'));
    els.head.appendChild(iconBtn('x', 'Tutup', function () { Panel.toggle(); }));
    els.body.innerHTML = '';
    st.frameKey = '';
    var url = st.pendingUrl; st.pendingUrl = null;
    Browser.mount(els.body, { key: 'canvas-' + conv.id, workspace: conv.workspace || '', url: url, onSendErrors: function (text) { Chat.insertText(text); } });
    UI.syncDrag();
  }

  Panel.openBrowser = function (url) {
    if (!conv) return;
    if (conv.mode === 'code') { st.codeTab = 'preview'; } else st.browser = true;
    st.pendingUrl = url || null;
    setOpen(true);
    render();
  };

  function renderCanvas() {
    if (st.browser) { renderBrowserCanvas(); return; }
    var c = currentArtifact();
    var art = c.art;
    els.head.innerHTML = '';
    els.panel.className = 'panel canvas';
    if (!art) {
      els.head.appendChild(h('div.ph-title', { html: U.icon('layers') + '<span>Kanvas</span>' }));
      els.head.appendChild(h('div.ph-spacer'));
      els.head.appendChild(iconBtn('refresh', 'Cermin dari konektor (Canva, Figma, Notion…)', function () { Mirror.dialog(conv); }));
      els.head.appendChild(iconBtn('globe', 'Browser (live view)', function () { Panel.openBrowser(); }));
      els.head.appendChild(iconBtn('x', 'Tutup', function () { Panel.toggle(); }));
      els.body.innerHTML = '';
      els.body.appendChild(canvasEmpty());
      st.frameKey = '';
      renderMirrorBar();
      UI.syncDrag();
      return;
    }
    if (art.type === 'file') { renderFileCanvas(c); return; }
    var T = Artifacts.TYPES[art.type] || Artifacts.TYPES.html;
    var generating = !c.version.complete || !!art.editing;
    var view = st.view;
    if (!st.userView) view = generating && !c.shown.complete ? 'code' : (T.visual ? 'preview' : 'code');
    if (art.type === 'code') view = 'code';

    // header
    var titleBtn = h('button.ph-title.no-drag', { html: U.icon(T.icon) + '<span>' + U.esc(art.title) + '</span>' + (c.col.list.length > 1 ? U.icon('chevronDown') : ''), title: art.id });
    titleBtn.addEventListener('click', function () {
      if (c.col.list.length < 2) return;
      UI.menu(titleBtn, c.col.list.map(function (a) {
        return { label: a.title, sub: (Artifacts.TYPES[a.type] || {}).label + ' · ' + a.versions.length + ' versi', icon: (Artifacts.TYPES[a.type] || {}).icon, check: a.id === art.id,
          onClick: function () { Panel.openArtifact(a.id); } };
      }), { width: 300 });
    });
    els.head.appendChild(titleBtn);
    if (art.versions.length > 1) {
      els.head.appendChild(h('div.vnav',
        iconBtn('chevronRight', 'Versi sebelumnya', function () { st.vIdx = Math.max(0, c.idx - 1); render(); }, 'flip'),
        h('span', { text: 'v' + (c.idx + 1) + ' / ' + art.versions.length }),
        iconBtn('chevronRight', 'Versi berikutnya', function () { st.vIdx = c.idx + 1 >= art.versions.length - 1 ? null : c.idx + 1; render(); })));
    }
    if (generating) els.head.appendChild(h('span.ph-status', { html: '<span class="spin"></span>' + (art.editing ? 'Mengedit…' : 'Membuat…') }));
    els.head.appendChild(h('div.ph-spacer'));
    if (T.visual && art.type !== 'code') {
      var seg = h('div.seg.sm.no-drag');
      [['preview', 'Pratinjau'], ['code', 'Kode']].forEach(function (o) {
        seg.appendChild(h('button' + (view === o[0] ? '.on' : ''), { text: o[1], onclick: function () { st.view = o[0]; st.userView = true; render(); } }));
      });
      els.head.appendChild(seg);
    }
    if (view === 'preview' && (art.type === 'html' || art.type === 'react')) {
      var dv = iconBtn(st.device === 'mobile' ? 'phone' : st.device === 'tablet' ? 'tablet' : 'monitor', 'Ukuran layar', function () {
        UI.menu(dv, [['desktop', 'Desktop', 'monitor'], ['tablet', 'Tablet (834px)', 'tablet'], ['mobile', 'Ponsel (390px)', 'phone']].map(function (d) {
          return { label: d[1], icon: d[2], check: st.device === d[0], onClick: function () { st.device = d[0]; st.frameKey = ''; render(); } };
        }), { align: 'end' });
      });
      els.head.appendChild(dv);
      var ins = iconBtn('target', 'Pilih elemen untuk diubah', function () {
        st.inspect = !st.inspect;
        ins.classList.toggle('on', st.inspect);
        postFrame({ __gxCmd: 'inspect', on: st.inspect });
        if (st.inspect) UI.toast('Klik elemen di pratinjau untuk menambahkannya ke pesan', { icon: 'target' });
      });
      if (st.inspect) ins.classList.add('on');
      els.head.appendChild(ins);
    }
    var ex = iconBtn('download', 'Ekspor', function () { exportMenu(ex, art, c.shown || c.version); });
    els.head.appendChild(ex);
    var more = iconBtn('more', 'Lainnya', function () {
      var items = [{ label: 'Browser (live view)', icon: 'globe', onClick: function () { Panel.openBrowser(); } },
        { label: 'Cermin dari Canva/Figma/Notion…', icon: 'refresh', onClick: function () { Mirror.dialog(conv); } },
        'sep', { label: 'Salin kode', icon: 'copy', onClick: function () { Native.call('app.copy', { text: c.version.content }).then(function () { UI.toast('Kode disalin'); }); } }];
      if (T.visual) {
        items.unshift({ label: 'Muat ulang pratinjau', icon: 'refresh', onClick: function () { st.frameKey = ''; render(); } });
        items.push({ label: 'Buka di Browser Sinai', icon: 'globe', onClick: function () {
          Native.call('preview.put', { key: 'bw-' + fnv(c.shown.content), html: Artifacts.document(art, c.shown.content, {}) }).then(function (u) { Panel.openBrowser(u); });
        } });
        items.push({ label: 'Buka di jendela terpisah', icon: 'external', onClick: function () {
          Native.call('app.preview', { key: 'win-' + fnv(c.shown.content), html: Artifacts.document(art, c.shown.content, {}), title: art.title + ' — Sinai' });
        } });
      }
      if (art.versions.length > 1 && c.idx < art.versions.length - 1) items.push({ label: 'Kembali ke versi terbaru', icon: 'history', onClick: function () { st.vIdx = null; render(); } });
      UI.menu(more, items, { align: 'end', width: 240 });
    });
    els.head.appendChild(more);
    els.head.appendChild(iconBtn('x', 'Tutup kanvas', function () { Panel.toggle(); }));

    // body
    if (view === 'code') {
      st.frameKey = '';
      els.body.innerHTML = '';
      els.body.appendChild(codeView(c.version.content, langFor(art)));
      if (generating) { var pre = els.body.querySelector('.cv-code'); if (pre) pre.scrollTop = pre.scrollHeight; }
    } else if (art.type === 'markdown') {
      st.frameKey = '';
      els.body.innerHTML = '';
      els.body.appendChild(h('div.doc-wrap', h('article.doc-page.md', { html: MD.render(c.shown.content, { streaming: !c.shown.complete }) })));
    } else {
      renderFrame(art, c.shown);
    }
    renderErrors(art);
    renderMirrorBar();
    UI.syncDrag();
  }

  function renderMirrorBar() {
    var old = els.panel.querySelector('.mirror-bar');
    if (old) old.remove();
    var b = window.Mirror && conv && conv.mirror ? Mirror.bar(conv) : null;
    if (b) els.body.parentNode.insertBefore(b, els.body);
  }

  // ---------------------------------------------------------------- generated files

  var FILE_ICON = { document: 'file', presentation: 'play', spreadsheet: 'list', image: 'image', video: 'play', text: 'file' };

  function fileActions(f) {
    return {
      quicklook: function () { Native.call('app.quicklook', { path: f.path }); },
      open: function () { Native.call('app.openPath', { path: f.path }).then(function (ok) { if (!ok) UI.toast('Tidak ada aplikasi untuk membuka file ini', { error: true }); }); },
      reveal: function () { Native.call('app.reveal', { path: f.path }); },
      saveAs: function () { Native.call('file.saveAs', { path: f.path, name: f.name }).then(function (p) { if (p) UI.toast('Disimpan: ' + U.basename(p)); }).catch(function (e) { UI.toast(e.message, { error: true }); }); },
      share: function () { Native.call('export.share', { paths: [f.path] }).catch(function (e) { UI.toast(e.message, { error: true }); }); },
      copyPath: function () { Native.call('app.copy', { text: f.path }).then(function () { UI.toast('Path disalin'); }); },
    };
  }
  Panel.fileActions = fileActions;

  function renderFileCanvas(c) {
    var art = c.art, v = c.version, f = v.file;
    var act = fileActions(f);
    els.panel.className = 'panel canvas';
    els.head.innerHTML = '';
    var titleBtn = h('button.ph-title.no-drag', { html: U.icon(FILE_ICON[f.kind] || 'file') + '<span>' + U.esc(f.name) + '</span>' + (c.col.list.length > 1 ? U.icon('chevronDown') : ''), title: f.path });
    titleBtn.addEventListener('click', function () {
      if (c.col.list.length < 2) return;
      UI.menu(titleBtn, c.col.list.map(function (a) {
        var last = a.versions[a.versions.length - 1];
        return { label: a.type === 'file' ? last.file.name : a.title, sub: a.type === 'file' ? (Outputs.FORMAT_LABEL[last.file.format] || last.file.format) + ' · ' + Outputs.fmtSize(last.file.size) : (Artifacts.TYPES[a.type] || {}).label + ' · ' + a.versions.length + ' versi',
          icon: a.type === 'file' ? FILE_ICON[last.file.kind] || 'file' : (Artifacts.TYPES[a.type] || {}).icon, check: a.id === art.id, onClick: function () { Panel.openArtifact(a.id); } };
      }), { width: 320 });
    });
    els.head.appendChild(titleBtn);
    if (art.versions.length > 1) {
      els.head.appendChild(h('div.vnav',
        iconBtn('chevronRight', 'Versi sebelumnya', function () { st.vIdx = Math.max(0, c.idx - 1); render(); }, 'flip'),
        h('span', { text: 'v' + (c.idx + 1) + ' / ' + art.versions.length }),
        iconBtn('chevronRight', 'Versi berikutnya', function () { st.vIdx = c.idx + 1 >= art.versions.length - 1 ? null : c.idx + 1; render(); })));
    }
    els.head.appendChild(h('span.fmt-badge', { text: (f.format || '').toUpperCase() }));
    els.head.appendChild(h('div.ph-spacer'));
    // Files designed in code (HTML + CSS) can be edited and rebuilt right here.
    var src = v.args && (v.args.html || v.args.content);
    var coded = f.source === 'html' && typeof src === 'string';
    if (coded) {
      var fseg = h('div.seg.sm.no-drag');
      [['preview', 'Pratinjau'], ['code', 'Kode']].forEach(function (o) {
        fseg.appendChild(h('button' + ((st.fileView || 'preview') === o[0] ? '.on' : ''), { text: o[1], onclick: function () { st.fileView = o[0]; st.frameKey = ''; render(); } }));
      });
      els.head.appendChild(fseg);
    }
    if (U.isMac()) els.head.appendChild(iconBtn('eye', 'Quick Look (tampilan asli macOS)', act.quicklook));
    els.head.appendChild(h('button.btn.sm.primary.no-drag', { html: U.icon('external') + '<span>Buka</span>', title: 'Buka dengan aplikasi default', onclick: act.open }));
    var more = iconBtn('more', 'Lainnya', function () {
      UI.menu(more, [
        { label: 'Simpan sebagai…', icon: 'download', onClick: act.saveAs },
        U.feature('share') ? { label: 'Bagikan…', sub: 'AirDrop, Mail, Pesan…', icon: 'share', onClick: act.share } : null,
        { label: U.plat('Tampilkan di Finder'), icon: 'folder', onClick: act.reveal },
        { label: 'Salin path', icon: 'copy', onClick: act.copyPath },
        'sep',
        { label: 'Muat ulang pratinjau', icon: 'refresh', onClick: function () { st.frameKey = ''; render(); } },
      ].filter(Boolean), { align: 'end', width: 250 });
    });
    els.head.appendChild(more);
    els.head.appendChild(iconBtn('x', 'Tutup kanvas', function () { Panel.toggle(); }));

    if (coded && st.fileView === 'code') { renderFileCode(c, src); UI.syncDrag(); return; }
    var key = conv.id + '-file-' + fnv(f.path + ':' + f.size + ':' + (f.createdAt || ''));
    if (st.frameKey === key && (els.body.querySelector('iframe') || st.fileLoading === key)) { UI.syncDrag(); return; }
    st.frameKey = key;
    st.fileLoading = key;
    els.body.innerHTML = '';
    var info = h('div.file-info', { html: U.icon(FILE_ICON[f.kind] || 'file') + '<span>' + U.esc(Outputs.FORMAT_LABEL[f.format] || f.format) + ' · ' + Outputs.fmtSize(f.size || 0) +
      (f.slides ? ' · ' + f.slides + ' slide' : '') + (f.duration ? ' · ' + Math.round(f.duration) + ' dtk' : '') + (f.rows ? ' · ' + f.rows + ' baris' : '') + '</span>' });
    var loading = h('div.cv-empty', h('div.status-line', { html: '<span class="spin"></span>Menyiapkan pratinjau…' }));
    els.body.appendChild(info);
    els.body.appendChild(loading);
    Outputs.previewHtml(f, v.args).then(function (html) {
      if (st.fileLoading === key) st.fileLoading = null;
      if (st.frameKey !== key) return;
      return Native.call('preview.put', { key: key, html: html }).then(function (url) {
        if (st.frameKey !== key) return;
        var frame = h('iframe.cv-frame', { sandbox: 'allow-scripts allow-modals allow-popups allow-popups-to-escape-sandbox', title: f.name });
        frame.src = url + '?t=' + Date.now();
        loading.replaceWith(h('div.cv-stage', frame));
        els.frame = frame;
      });
    }).catch(function (e) {
      if (st.fileLoading === key) st.fileLoading = null;
      if (st.frameKey !== key) return;
      loading.replaceWith(h('div.cv-empty', h('div.cv-empty-icon', { html: U.icon('alert') }), h('h3', { text: 'Pratinjau gagal' }), h('p', { text: e.message }),
        U.isMac() ? h('button.btn', { html: U.icon('eye') + 'Quick Look', onclick: act.quicklook }) : null));
    });
    UI.syncDrag();
  }

  /* Source editor for a code-designed file: edit HTML/CSS, then rebuild the same file. */
  function renderFileCode(c, src) {
    var v = c.version, f = v.file;
    st.frameKey = '';
    els.body.innerHTML = '';
    var ta = h('textarea.fc-src', { spellcheck: false, value: src });
    ta.value = src;
    var status = h('span.fc-status');
    var apply = h('button.btn.sm.primary', { html: U.icon('refresh') + '<span>Terapkan</span>', title: 'Buat ulang ' + (f.format || '').toUpperCase() + ' dari kode ini (⌘S)' });
    apply.addEventListener('click', async function () {
      if (ta.value === src) { st.fileView = 'preview'; render(); return; }
      apply.disabled = true;
      status.innerHTML = '<span class="spin"></span>Membuat ulang file…';
      try {
        var block = findFileCall(v.msgId, f);
        var args = Object.assign({}, v.args, { content: ta.value });
        delete args.html;
        var res = await Outputs.create(args, { conv: conv, overwritePath: f.path, progress: function (p) { status.textContent = p.output || ''; } });
        if (block) { block.args = Object.assign({}, block.args, { content: ta.value }); delete block.args.html; block.display = res.display; }
        Store.saveConv(conv);
        st.fileView = 'preview';
        UI.toast('File diperbarui: ' + res.display.name);
        render();
      } catch (e) {
        apply.disabled = false;
        status.textContent = '';
        UI.toast(e.message || String(e), { error: true });
      }
    });
    var reset = h('button.btn.sm', { text: 'Batalkan', onclick: function () { ta.value = src; } });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') { e.preventDefault(); var a = ta.selectionStart; ta.setRangeText('  ', a, ta.selectionEnd, 'end'); }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); apply.click(); }
    });
    els.body.appendChild(h('div.fc-wrap', h('div.fc-bar', h('span.fc-hint', { text: 'Ubah HTML/CSS desainnya lalu Terapkan (⌘S) — atau minta AI mengubahnya di chat.' }), status, h('div.ph-spacer'), reset, apply), ta));
  }
  function findFileCall(msgId, f) {
    var m = conv.messages.find(function (x) { return x.id === msgId; });
    return m && (m.content || []).find(function (b) { return b.type === 'tool_call' && b.name === 'create_file' && b.display === f; });
  }

  function canvasEmpty() {
    var design = conv.mode === 'design';
    var box = h('div.cv-empty',
      h('div.cv-empty-icon', { html: U.icon(design ? 'sparkle' : 'layers') }),
      h('h3', { text: design ? 'Kanvas desain' : 'Belum ada artifact' }),
      h('p', { text: design ? 'Jelaskan apa yang ingin Anda buat — halaman web, aplikasi, dashboard, slide, poster, diagram, logo. Hasilnya tampil hidup di sini dan bisa Anda revisi, klik elemen untuk mengubahnya, lalu ekspor ke PNG, PDF, atau HTML.'
        : 'Saat Sinai membuat halaman web, aplikasi, scene 3D, diagram, dokumen, atau slide, hasilnya muncul di sini.' }),
      h('div.cv-empty-actions',
        h('button.btn', { html: U.icon('refresh') + '<span>Cermin dari Canva/Figma/Notion…</span>', onclick: function () { Mirror.dialog(conv); } }),
        h('button.btn', { html: U.icon('globe') + '<span>Buka Browser</span>', onclick: function () { Panel.openBrowser(); } })));
    return box;
  }

  function langFor(art) {
    return { html: 'xml', react: 'javascript', svg: 'xml', mermaid: 'plaintext', markdown: 'markdown', slides: 'markdown', board: 'json', '3d': 'javascript' }[art.type] || (art.language || 'plaintext');
  }

  function codeView(src, lang) {
    var lines = String(src || '').split('\n');
    var html = MD.highlight(String(src || ''), lang === 'plaintext' ? '' : lang);
    var gutter = lines.map(function (_, i) { return i + 1; }).join('\n');
    return h('div.cv-code', h('pre.gutter', { text: gutter }), h('pre.src', h('code', { html: html })));
  }

  /* Board yang diedit pengguna (geser/tambah/ubah) menimpa versi terakhir dari AI sampai AI membuat versi baru. */
  function boardEdit(art, version) {
    var e = art.type === 'board' && conv.boardEdits && conv.boardEdits[art.id];
    return e && e.n === art.versions.length && version === art.versions[art.versions.length - 1] ? e.json : null;
  }

  function renderFrame(art, version) {
    var html = Artifacts.document(art, boardEdit(art, version) || version.content, {});
    var width = DEVICES[st.device];
    var key = conv.id + '-' + art.id + '-' + fnv(html) + '-' + st.device;
    if (st.frameKey === key && els.body.querySelector('iframe')) return;
    st.frameKey = key;
    st.errors = [];
    var stage = h('div.cv-stage' + (width ? '.device' : ''));
    var frame = h('iframe.cv-frame', { sandbox: 'allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads allow-pointer-lock', title: art.title });
    if (width) frame.style.width = width + 'px';
    stage.appendChild(frame);
    els.body.innerHTML = '';
    els.body.appendChild(stage);
    els.frame = frame;
    Native.call('preview.put', { key: key, html: html }).then(function (url) {
      if (st.frameKey === key) frame.src = url + '?t=' + Date.now();
    });
  }

  function postFrame(msg) {
    if (els.frame && els.frame.contentWindow) els.frame.contentWindow.postMessage(msg, '*');
  }

  function onFrameMessage(e) {
    if (!els.frame || e.source !== els.frame.contentWindow) return;
    var d = e.data || {};
    if (!d.__gx) return;
    if (d.type === 'ready' && st.inspect) postFrame({ __gxCmd: 'inspect', on: true });
    else if (d.type === 'error') {
      if (st.errors.indexOf(d.message) < 0 && st.errors.length < 5) st.errors.push(String(d.message).slice(0, 600));
      var c = currentArtifact();
      if (c.art) renderErrors(c.art);
    } else if (d.type === 'board' && typeof d.json === 'string') {
      var cb = currentArtifact();
      if (!cb.art || cb.art.type !== 'board' || cb.idx !== cb.art.versions.length - 1) return;
      conv.boardEdits = conv.boardEdits || {};
      conv.boardEdits[cb.art.id] = { n: cb.art.versions.length, json: d.json };
      st.frameKey = conv.id + '-' + cb.art.id + '-' + fnv(Artifacts.document(cb.art, d.json, {})) + '-' + st.device; // jangan muat ulang iframe
      Store.saveConv(conv);
      Chat.setContext({
        kind: 'board', key: cb.art.id, label: 'Board "' + cb.art.title + '" (diedit)',
        text: '[Board "' + cb.art.title + '" (id: ' + cb.art.id + ') sudah diedit pengguna di kanvas. Ini isi terbarunya — jadikan dasar bila mengubah board ini, pakai id yang sama]\n```json\n' + Board.summary(d.json) + '\n```',
      });
    } else if (d.type === 'pick') {
      var c2 = currentArtifact();
      Chat.addContext({
        kind: 'element', label: d.selector.split(' > ').pop() + (d.text ? ' — "' + d.text.slice(0, 40) + '"' : ''),
        text: '[Elemen yang dipilih pada artifact "' + (c2.art ? c2.art.title : '') + '" (id: ' + (c2.art ? c2.art.id : '') + ')]\nSelector: ' + d.selector +
          (d.text ? '\nTeks: ' + d.text : '') + '\nHTML:\n```html\n' + d.html + '\n```',
      });
    }
  }

  function renderErrors(art) {
    var old = els.body.querySelector('.cv-errors');
    if (old) old.remove();
    if (!st.errors.length) return;
    var bar = h('div.cv-errors',
      h('div.cv-err-text', { html: U.icon('alert') + '<span>' + U.esc(st.errors[0]) + (st.errors.length > 1 ? ' (+' + (st.errors.length - 1) + ')' : '') + '</span>' }),
      h('button.btn.sm', { text: 'Perbaiki dengan AI', onclick: function () {
        var msg = 'Artifact "' + art.title + '" menampilkan error saat dijalankan:\n```\n' + st.errors.join('\n') + '\n```\nTolong perbaiki.';
        st.errors = [];
        Chat.sendText(msg);
      } }),
      iconBtn('x', 'Abaikan', function () { st.errors = []; bar.remove(); }));
    els.body.appendChild(bar);
  }

  function exportMenu(anchor, art, version) {
    var T = Artifacts.TYPES[art.type];
    // Nama file dari model (```python main.py / create_file filename), selain itu judulnya.
    var name = String(art.filename ? art.filename.replace(/\.\w{1,8}$/, '') : art.fence || /^(kode|file)-/.test(art.id) ? art.title : art.id)
      .replace(/[\\/:*?"<>|]+/g, '-').trim() || art.id;
    var items = [];
    function save(content, ext) {
      Native.call('dialog.save', { name: name + '.' + ext, content: content }).then(function (p) { if (p) UI.toast('Disimpan: ' + U.basename(p)); });
    }
    function render(format) {
      var slides = art.type === 'slides';
      var html = Artifacts.document(art, version.content, { print: slides });
      UI.toast('Menyiapkan ' + format.toUpperCase() + '…', { icon: 'download' });
      Native.call('preview.export', {
        key: 'export-' + fnv(html), html: html, format: format, name: name,
        width: slides ? 1280 : art.type === 'markdown' ? 900 : (DEVICES[st.device] || 1280),
        pages: slides ? Artifacts.slideCount(version.content) : 0, pageHeight: 720,
      }).then(function (p) { if (p) UI.toast('Disimpan: ' + U.basename(p)); }).catch(function (e) { UI.toast(e.message, { error: true }); });
    }
    if (T.visual) {
      items.push({ label: 'Unduh PNG', sub: 'Gambar seluruh halaman', icon: 'image', onClick: function () { render('png'); } });
      items.push({ label: 'Unduh PDF', sub: art.type === 'slides' ? 'Satu halaman per slide' : 'Dokumen PDF', icon: 'file', onClick: function () { render('pdf'); } });
      items.push({ label: 'Simpan sebagai HTML', sub: 'Satu file, bisa dibuka di browser', icon: 'globe', onClick: function () { save(Artifacts.document(art, version.content, { export: true }), 'html'); } });
    }
    if (art.type === 'markdown') {
      items.push({ label: 'Word (.docx)', icon: 'file', onClick: function () {
        Native.call('export.document', { html: markdownHtml(version.content), format: 'docx', name: name }).then(toastSaved).catch(toastErr);
      } });
      items.push({ label: 'Rich Text (.rtf)', icon: 'file', onClick: function () {
        Native.call('export.document', { html: markdownHtml(version.content), format: 'rtf', name: name }).then(toastSaved).catch(toastErr);
      } });
    }
    if (art.type === 'slides') {
      items.push({ label: 'PowerPoint (.pptx)', icon: 'play', onClick: function () {
        // Ponsel: PPTX dari mesin desain slide Sinai (sama dengan create_file), dikemas di host-mobile.js.
        (U.isMobile() ? Native.call('export.zip', { files: Deck.pptxFiles(version.content), name: name, ext: 'pptx' })
          : Native.call('export.slides', { slides: parseSlides(version.content), name: name })).then(toastSaved).catch(toastErr);
      } });
    }
    if (art.type === 'svg') {
      items.push({ label: 'Konversi ke PNG/JPEG…', icon: 'image', onClick: function () {
        Native.call('fs.writeTemp', { name: name + '.svg', base64: btoa(unescape(encodeURIComponent(version.content))) }).then(function (t) {
          Native.call('export.image', { path: t.path, format: 'png', name: name }).then(toastSaved).catch(toastErr);
        });
      } });
    }
    // Jadikan file sungguhan lewat mesin create_file (PPTX/DOCX/PDF/XLSX… sesuai permintaan).
    function makeFile(args) {
      UI.toast('Membuat ' + String(args.format).toUpperCase() + '…', { icon: 'download' });
      Outputs.create(Object.assign({ filename: name, title: art.title }, args), { conv: conv }).then(function (r) {
        var f = r.display;
        return Native.call('file.saveAs', { path: f.path, name: f.name }).then(toastSaved);
      }).catch(toastErr);
    }
    if (art.args && art.args.format) {
      var req = art.args, src = art.type === 'html' || art.type === 'svg' ? { html: version.content, content: undefined } : { content: version.content, html: undefined };
      items.unshift({ label: 'Buat file .' + String(req.format).toLowerCase(), sub: 'Format yang diminta', icon: 'filePlus', onClick: function () { makeFile(Object.assign({}, req, src)); } });
    }
    if (art.type === 'html' && HtmlDeck.isDeck(version.content) && !(art.args && art.args.format === 'pptx')) {
      items.push({ label: 'PowerPoint (.pptx)', sub: 'Slide yang bisa diedit', icon: 'play', onClick: function () { makeFile({ kind: 'presentation', format: 'pptx', html: version.content }); } });
    }
    if (art.type === 'code') {
      items.push({ label: 'Unduh PDF', sub: 'Kode sebagai dokumen PDF', icon: 'file', onClick: function () { render('pdf'); } });
      items.push({ label: 'Teks biasa (.txt)', icon: 'file', onClick: function () { save(version.content, 'txt'); } });
    }
    var srcExt = art.filename && /\.(\w{1,8})$/.test(art.filename) ? art.filename.split('.').pop() : Artifacts.extFor(art);
    items.push({ label: (art.type === 'code' ? 'Simpan file (.' : 'Simpan sumber (.') + srcExt + ')', icon: 'code', onClick: function () { save(version.content, srcExt); } });
    items.push('sep');
    if (T.visual) items.push({ label: 'Cetak…', icon: 'print', onClick: function () { Native.call('export.print', { html: Artifacts.document(art, version.content, { export: true }), name: name }).catch(toastErr); } });
    if (U.feature('share')) items.push({ label: 'Bagikan sumber…', icon: 'share', onClick: function () { Native.call('export.share', { text: version.content }).catch(toastErr); } });
    else items.push({ label: 'Salin sumber', icon: 'copy', onClick: function () { Native.call('app.copy', { text: version.content }).then(function () { UI.toast('Disalin'); }); } });
    UI.menu(anchor, items, { align: 'end', width: 260 });
  }

  function toastSaved(p) { if (p) UI.toast('Disimpan: ' + U.basename(p)); }
  function toastErr(e) { UI.toast(e.message, { error: true }); }
  function markdownHtml(md) {
    return '<!doctype html><html><head><meta charset="utf-8"></head><body>' + MD.render(String(md || '')) + '</body></html>';
  }
  function parseSlides(src) {
    return String(src || '').split(/\n-{3,}\s*\n/).map(function (block) {
      var lines = block.trim().split('\n');
      var title = '', bullets = [];
      lines.forEach(function (l) {
        var hm = /^#{1,3}\s+(.*)/.exec(l);
        if (hm && !title) { title = hm[1].trim(); return; }
        var b = l.replace(/^[-*+]\s+/, '').replace(/^#+\s*/, '').trim();
        if (b) bullets.push(b);
      });
      return { title: title, bullets: bullets };
    });
  }

  function iconBtn(icon, title, fn, cls) {
    return h('button.icon-btn.no-drag' + (cls ? '.' + cls : ''), { title: title, html: U.icon(icon), onclick: function (e) { e.stopPropagation(); fn(e); } });
  }

  // ================================================================ code mode

  function renderCode() {
    var mb = els.panel.querySelector('.mirror-bar'); if (mb) mb.remove();
    els.panel.className = 'panel code';
    els.head.innerHTML = '';
    var tabs = h('div.ptabs.no-drag');
    [['files', 'File', 'folder'], ['changes', 'Perubahan', 'fileEdit'], ['terminal', 'Terminal', 'terminal'], ['preview', 'Browser', 'globe']].forEach(function (t) {
      var n = t[0] === 'changes' ? sessionChanges().length : 0;
      tabs.appendChild(h('button' + (st.codeTab === t[0] ? '.on' : ''), { html: U.icon(t[2]) + '<span>' + t[1] + '</span>' + (n ? '<em>' + n + '</em>' : ''), onclick: function () { st.codeTab = t[0]; render(); } }));
    });
    els.head.appendChild(tabs);
    els.head.appendChild(h('div.ph-spacer'));
    els.head.appendChild(iconBtn('x', 'Tutup panel', function () { Panel.toggle(); }));
    els.body.innerHTML = '';
    if (!conv.workspace && st.codeTab !== 'preview') {
      els.body.appendChild(h('div.cv-empty', h('div.cv-empty-icon', { html: U.icon('folder') }), h('h3', { text: 'Belum ada folder proyek' }),
        h('button.btn.primary', { text: 'Pilih folder', onclick: function () { Chat.pickWorkspace().then(function () { Panel.attach(conv); }); } })));
      UI.syncDrag();
      return;
    }
    if (st.codeTab === 'files') renderFiles();
    else if (st.codeTab === 'changes') renderChanges();
    else if (st.codeTab === 'terminal') renderTerminal();
    else renderDevPreview();
    UI.syncDrag();
  }

  // ---------------------------------------------------------------- files

  function refreshGit() {
    if (!conv || !conv.workspace) return;
    Native.call('exec.sync', { command: Store.info.posixShell === false ? 'git status --porcelain=v1 -uall 2>$null | Select-Object -First 2000' : 'git status --porcelain=v1 -uall 2>/dev/null | head -2000', cwd: conv.workspace, timeout: 10 }).then(function (r) {
      var map = {};
      (r.stdout || '').split('\n').forEach(function (l) {
        if (l.length < 4) return;
        var code = l.slice(0, 2).trim() || 'M', p = l.slice(3).replace(/^"|"$/g, '');
        if (p.indexOf(' -> ') >= 0) p = p.split(' -> ')[1];
        map[conv.workspace + '/' + p] = code === '??' ? 'U' : code[0];
      });
      st.git = map;
      if (st.open && st.codeTab === 'files') renderFiles();
    });
  }

  function changedPaths() {
    var out = {};
    sessionChanges().forEach(function (c) { out[c.path] = c.created ? 'A' : 'M'; });
    Object.keys(st.git).forEach(function (p) { if (!out[p]) out[p] = st.git[p]; });
    return out;
  }

  async function loadDir(path) {
    var r = await Native.call('fs.list', { path: path, depth: 1, hidden: st.hidden, limit: 2000 });
    var entries = r.entries.map(function (e) { return { name: e.path, path: path + '/' + e.path, dir: e.dir, size: e.size }; });
    entries.sort(function (a, b) { return a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true }); });
    st.tree.set(path, entries);
    return entries;
  }

  function fileIcon(name, dir) {
    if (dir) return 'folder';
    if (/\.(png|jpe?g|gif|webp|svg|heic|ico)$/i.test(name)) return 'image';
    if (/\.(js|ts|jsx|tsx|py|rb|go|rs|swift|java|kt|c|cc|cpp|h|cs|php|sh|vue|svelte|html?|css|scss|json|ya?ml|toml|sql)$/i.test(name)) return 'code';
    return 'file';
  }

  async function renderFiles() {
    if (st.file) return renderFileViewer();
    var root = conv.workspace;
    var box = h('div.ftree');
    var bar = h('div.pbar',
      h('span.pbar-title', { html: U.icon('folder') + '<b>' + U.esc(U.basename(root)) + '</b>', title: root }),
      h('div.ph-spacer'),
      iconBtn('eye', st.hidden ? 'Sembunyikan file tersembunyi' : 'Tampilkan file tersembunyi', function () { st.hidden = !st.hidden; st.tree = new Map(); renderFiles(); }),
      iconBtn('refresh', 'Muat ulang', function () { st.tree = new Map(); refreshGit(); renderFiles(); }),
      iconBtn('external', U.plat('Tampilkan di Finder'), function () { Native.call('app.reveal', { path: root }); }));
    els.body.innerHTML = '';
    els.body.appendChild(bar);
    els.body.appendChild(box);
    var changed = changedPaths();
    async function addDir(path, depth) {
      var entries = st.tree.get(path) || await loadDir(path).catch(function () { return []; });
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var badge = changed[e.path] || (e.dir && Object.keys(changed).some(function (p) { return p.indexOf(e.path + '/') === 0; }) ? '•' : '');
        var open = e.dir && st.expanded.has(e.path);
        var row = h('div.frow' + (e.dir ? '.dir' : '') + (badge ? '.chg' : ''), { style: { paddingLeft: (10 + depth * 14) + 'px' }, title: e.path });
        row.innerHTML = (e.dir ? U.icon('chevronRight', 'fchev' + (open ? ' open' : '')) : '<span class="fchev-sp"></span>') + U.icon(fileIcon(e.name, e.dir)) +
          '<span class="fname">' + U.esc(e.name) + '</span>' + (badge ? '<span class="fbadge b-' + (badge === '•' ? 'dot' : badge) + '">' + badge + '</span>' : '');
        (function (entry) {
          row.addEventListener('click', function () {
            if (entry.dir) { if (st.expanded.has(entry.path)) st.expanded.delete(entry.path); else st.expanded.add(entry.path); renderFiles(); }
            else { st.file = entry.path; renderFileViewer(); }
          });
          row.addEventListener('contextmenu', function (ev) {
            ev.preventDefault();
            UI.menu(row, [
              { label: 'Sebut di chat (@)', icon: 'chat', onClick: function () { Chat.insertMention(U.relPath(conv.workspace, entry.path)); } },
              { label: U.plat('Tampilkan di Finder'), icon: 'external', onClick: function () { Native.call('app.reveal', { path: entry.path }); } },
              { label: 'Buka dengan app default', icon: 'play', onClick: function () { Native.call('app.openPath', { path: entry.path }); } },
              { label: 'Salin path', icon: 'copy', onClick: function () { Native.call('app.copy', { text: entry.path }); } },
            ]);
          });
        })(e);
        box.appendChild(row);
        if (open) await addDir(e.path, depth + 1);
      }
    }
    await addDir(root, 0);
    if (!box.childNodes.length) box.appendChild(h('div.conv-empty', { text: 'Folder kosong' }));
  }

  async function renderFileViewer() {
    var path = st.file;
    var rel = U.relPath(conv.workspace, path);
    els.body.innerHTML = '';
    var bar = h('div.pbar',
      iconBtn('chevronRight', 'Kembali ke daftar file', function () { st.file = null; renderFiles(); }, 'flip'),
      h('span.pbar-title', { html: '<code>' + U.esc(rel) + '</code>', title: path }),
      h('div.ph-spacer'),
      /\.html?$/i.test(path) ? iconBtn('globe', 'Buka di Browser (live view)', function () { Panel.openBrowser(path); }) : null,
      iconBtn('chat', 'Sebut di chat (@)', function () { Chat.insertMention(rel); }),
      iconBtn('play', 'Buka dengan app default', function () { Native.call('app.openPath', { path: path }); }),
      iconBtn('external', U.plat('Tampilkan di Finder'), function () { Native.call('app.reveal', { path: path }); }));
    els.body.appendChild(bar);
    var holder = h('div.fview', h('div.status-line', { html: '<span class="spin"></span>Memuat…' }));
    els.body.appendChild(holder);
    try {
      if (Artifacts.MODEL_EXT.test(path)) { // 3D model: interactive viewer (three.js, offline)
        var murl = await Native.call('preview.file', { path: path });
        var mkey = 'model-' + fnv(path) + '-' + Date.now();
        var murlSite = murl;
        if (/\.gltf$/i.test(path)) { // .gltf references sibling .bin/textures: serve the folder
          murlSite = await Native.call('preview.site', { root: path.replace(/[\\\/][^\\\/]*$/, '') }).then(function (b) { return b + encodeURIComponent(U.basename(path)); }).catch(function () { return murl; });
        }
        var mhtml = Artifacts.modelViewer(murlSite, path.split('.').pop().toLowerCase(), U.basename(path));
        var murl2 = await Native.call('preview.put', { key: mkey, html: mhtml });
        holder.innerHTML = '';
        holder.classList.add('v3d-wrap');
        var mf = h('iframe.cv-frame', { sandbox: 'allow-scripts allow-pointer-lock', src: murl2 });
        mf.style.width = '100%'; mf.style.minHeight = '420px';
        holder.appendChild(mf);
        return;
      }
      if (/\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|ico|icns|avif)$/i.test(path)) {
        var img = await Native.call('image.prepare', { path: path, maxDim: 1600, png: true });
        holder.innerHTML = '';
        holder.appendChild(h('div.fimg', h('img', { src: 'data:' + img.mime + ';base64,' + img.data }), h('div.hint', { text: img.origWidth + ' × ' + img.origHeight + ' px' })));
        return;
      }
      var info = await Native.call('file.info', { path: path });
      holder.innerHTML = '';
      if (!info.isText && info.size > 0) {
        holder.appendChild(h('div.cv-empty', h('div.cv-empty-icon', { html: U.icon('file') }), h('h3', { text: info.kind || 'File biner' }),
          h('p', { text: (info.size / 1024).toFixed(1) + ' KB — tidak bisa ditampilkan sebagai teks.' }),
          h('button.btn', { text: 'Buka dengan app default', onclick: function () { Native.call('app.openPath', { path: path }); } })));
        return;
      }
      var t = await Native.call('file.text', { path: path, maxBytes: 400000 });
      var ext = (path.split('.').pop() || '').toLowerCase();
      var lang = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', rb: 'ruby', rs: 'rust',
        go: 'go', swift: 'swift', java: 'java', kt: 'kotlin', c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', sh: 'bash', zsh: 'bash',
        html: 'xml', htm: 'xml', xml: 'xml', vue: 'xml', svg: 'xml', css: 'css', scss: 'scss', less: 'less', json: 'json', yml: 'yaml', yaml: 'yaml', md: 'markdown',
        sql: 'sql', toml: 'ini', ini: 'ini', lua: 'lua', r: 'r', pl: 'perl', m: 'objectivec', mm: 'objectivec', makefile: 'makefile', diff: 'diff' }[ext] || '';
      holder.appendChild(codeView(t.text + (t.truncated ? '\n… [file terlalu besar, sisanya tidak ditampilkan]' : ''), lang));
    } catch (e) {
      holder.innerHTML = '';
      holder.appendChild(h('div.err-box', { text: e.message }));
    }
  }

  // ---------------------------------------------------------------- changes

  function sessionChanges() {
    if (!conv) return [];
    var map = {}, order = [];
    var home = Store.info.home, cwd = conv.workspace || home;
    conv.messages.forEach(function (m) {
      if (m.role !== 'assistant') return;
      (m.content || []).forEach(function (b) {
        if (b.type !== 'tool_call' || b.state !== 'done') return;
        var a = b.args || {};
        var p = a.path || a.to;
        if (!p || ['write_file', 'edit_file', 'delete_path', 'move_path'].indexOf(b.name) < 0) return;
        var abs = U.resolvePath(cwd, p, home);
        var e = map[abs];
        if (!e) { e = map[abs] = { path: abs, rel: U.relPath(conv.workspace, abs), adds: 0, dels: 0, edits: [], created: false, deleted: false }; order.push(abs); }
        if (b.display && b.display.type === 'diff') { e.adds += b.display.adds; e.dels += b.display.dels; e.edits.push(b.display); if (b.display.created && e.edits.length === 1) e.created = true; }
        if (b.name === 'delete_path') e.deleted = true;
      });
    });
    return order.map(function (k) { return map[k]; });
  }
  Panel.sessionChanges = sessionChanges;

  function renderChanges() {
    var list = sessionChanges();
    var box = h('div.changes');
    els.body.appendChild(h('div.pbar', h('span.pbar-title', { html: U.icon('fileEdit') + '<b>' + list.length + ' file diubah di sesi ini</b>' }), h('div.ph-spacer'),
      list.length ? iconBtn('download', 'Ekspor ringkasan perubahan', function () { exportChanges(list); }) : null,
      list.length ? h('button.btn.sm.danger.no-drag', { text: 'Kembalikan semua', title: 'Pulihkan file ke kondisi sebelum sesi ini', onclick: function () { App.rewindCode(conv, null); } }) : null));
    els.body.appendChild(box);
    if (!list.length) { box.appendChild(h('div.conv-empty', { text: 'Belum ada file yang diubah agen di sesi ini.' })); return; }
    list.forEach(function (c) {
      var open = st.expanded.has('chg:' + c.path);
      var row = h('div.chg-row' + (open ? '.open' : ''),
        h('div.chg-head', { html: U.icon('chevronRight', 'fchev' + (open ? ' open' : '')) + '<span class="fname">' + U.esc(c.rel) + '</span>' +
          (c.deleted ? '<span class="fbadge b-D">D</span>' : c.created ? '<span class="fbadge b-A">A</span>' : '') +
          '<span class="ts"><span class="add">+' + c.adds + '</span> <span class="del">−' + c.dels + '</span></span>',
          onclick: function () { if (open) st.expanded.delete('chg:' + c.path); else st.expanded.add('chg:' + c.path); render(); } }));
      if (open) {
        var body = h('div.chg-body', h('div.status-line', { html: '<span class="spin"></span>Memuat diff…' }));
        row.appendChild(body);
        Native.call('exec.sync', { command: Store.info.posixShell === false ? "git diff --no-color HEAD -- '" + String(c.path).replace(/'/g, "''") + "' 2>$null" : 'git diff --no-color HEAD -- ' + U.shq(c.path) + ' 2>/dev/null || true', cwd: conv.workspace, timeout: 10 }).then(function (r) {
          body.innerHTML = '';
          if (r.stdout && r.stdout.trim()) body.appendChild(unifiedDiff(r.stdout));
          else c.edits.forEach(function (d) { body.appendChild(Chat.diffView(d)); });
          body.appendChild(h('div.row', { style: { padding: '8px 12px' } },
            h('button.btn.sm', { text: 'Buka file', onclick: function () { st.codeTab = 'files'; st.file = c.path; render(); } }),
            h('button.btn.sm', { text: 'Sebut di chat', onclick: function () { Chat.insertMention(c.rel); } })));
        });
      }
      box.appendChild(row);
    });
  }

  function exportChanges(list) {
    var out = ['# Perubahan file — ' + (conv.title || 'sesi Sinai'), '', (conv.workspace || ''), ''];
    list.forEach(function (c) {
      out.push('## ' + c.rel + (c.deleted ? ' (dihapus)' : c.created ? ' (baru)' : '') + '  +' + c.adds + ' −' + c.dels, '', '```diff');
      c.edits.forEach(function (d) {
        (d.hunks || []).forEach(function (ln) {
          if (ln.gap) out.push('@@ … ' + ln.gap + ' baris tidak berubah …');
          else out.push((ln.t === '+' ? '+' : ln.t === '-' ? '-' : ' ') + ln.s);
        });
      });
      out.push('```', '');
    });
    out.push('---', '_Diekspor dari Sinai — ' + App.copyright() + '_');
    Native.call('dialog.save', { name: 'perubahan-' + (conv.title || 'sesi').replace(/[^\w-]+/g, '-').slice(0, 40) + '.md', content: out.join('\n') })
      .then(function (p) { if (p) UI.toast('Disimpan: ' + U.basename(p)); });
  }

  function unifiedDiff(text) {
    var box = h('div.diff');
    var o = 0, n = 0;
    text.split('\n').forEach(function (l) {
      if (/^(diff --git|index |--- |\+\+\+ |new file|deleted file)/.test(l)) return;
      var m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(l);
      if (m) { o = +m[1]; n = +m[2]; box.appendChild(h('div.gap', { text: l })); return; }
      if (l[0] === '+') box.appendChild(h('div.ln.add', h('span.no', { text: String(n++) }), h('span.tx', { text: l.slice(1) })));
      else if (l[0] === '-') box.appendChild(h('div.ln.del', h('span.no', { text: String(o++) }), h('span.tx', { text: l.slice(1) })));
      else if (l[0] === ' ') { box.appendChild(h('div.ln.ctx', h('span.no', { text: String(n) }), h('span.tx', { text: l.slice(1) }))); o++; n++; }
    });
    return box;
  }

  // ---------------------------------------------------------------- terminal

  function stripAnsi(s) { return String(s).replace(/\u001b\[[0-9;?]*[ -\/]*[@-~]/g, '').replace(/\u001b[\]P][^\u0007\u001b]*(\u0007|\u001b\\)?/g, '').replace(/[\u0007\u000f\u000e]/g, ''); }

  function renderTerminal() {
    var t = st.term;
    if (!t.cwd) t.cwd = conv.workspace;
    var out = h('pre.term-out', { text: t.log || 'Terminal Sinai — perintah dijalankan di ' + U.tildify(t.cwd, Store.info.home) + '\nKetik "clear" untuk membersihkan. Saat sebuah perintah meminta input (y/n, kata sandi aplikasi, REPL), ketik jawabannya lalu tekan Enter.\n' });
    var input = h('input.term-in', { placeholder: 'Ketik perintah lalu tekan Enter', spellcheck: false, autocomplete: 'off' });
    var promptEl = h('span.term-prompt', { text: U.basename(t.cwd) + ' $' });
    var stop = h('button.btn.sm.no-drag', { text: 'Hentikan', onclick: function () { if (t.job) t.job.kill(); } });
    stop.hidden = !t.job;
    var bar = h('div.pbar',
      h('span.pbar-title', { html: U.icon('terminal') + '<b>Terminal</b>' }), h('div.ph-spacer'),
      iconBtn('download', 'Ekspor output terminal', function () {
        if (!t.log.trim()) { UI.toast('Terminal masih kosong', { error: true }); return; }
        Native.call('dialog.save', { name: 'terminal-' + U.basename(t.cwd) + '.txt', content: t.log }).then(function (p) { if (p) UI.toast('Disimpan: ' + U.basename(p)); });
      }),
      iconBtn('trash', 'Bersihkan', function () { t.log = ''; out.textContent = ''; }));
    els.body.appendChild(bar);
    els.body.appendChild(h('div.term', out, h('div.term-line', promptEl, input, stop)));
    out.scrollTop = out.scrollHeight;
    function write(s) { t.log = (t.log + stripAnsi(s)).slice(-300000); out.textContent = t.log; out.scrollTop = out.scrollHeight; }
    input.addEventListener('keydown', async function (e) {
      // While a job runs, Enter feeds the line to its stdin (answer prompts / REPL).
      if (t.job) {
        if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); t.job.interrupt(); write('^C\n'); return; }
        if (e.key === 'd' && e.ctrlKey) { e.preventDefault(); t.job.closeInput(); return; }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var line = input.value;
        input.value = '';
        write(line + '\n');
        t.job.write(line + '\n');
        return;
      }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (t.history.length) { t.hIdx = Math.max(0, (t.hIdx < 0 ? t.history.length : t.hIdx) - 1); input.value = t.history[t.hIdx]; } return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); if (t.hIdx >= 0) { t.hIdx++; input.value = t.history[t.hIdx] || ''; if (t.hIdx >= t.history.length) t.hIdx = -1; } return; }
      if (e.key !== 'Enter') return;
      var cmd = input.value.trim();
      input.value = '';
      if (!cmd) return;
      t.history.push(cmd); t.hIdx = -1;
      if (cmd === 'clear') { t.log = ''; out.textContent = ''; return; }
      write((t.log && !/\n$/.test(t.log) ? '\n' : '') + '$ ' + cmd + '\n');
      var cd = /^cd(?:\s+(.+))?$/.exec(cmd);
      if (cd) {
        var target = U.resolvePath(t.cwd, (cd[1] || '~').replace(/^["']|["']$/g, ''), Store.info.home);
        var s = await Native.call('fs.stat', { path: target });
        if (s.exists && s.isDir) { t.cwd = target; promptEl.textContent = U.basename(t.cwd) + ' $'; } else write('cd: folder tidak ditemukan: ' + target + '\n');
        return;
      }
      stop.hidden = false;
      input.placeholder = 'Perintah berjalan — ketik input lalu Enter (Ctrl-C hentikan)';
      t.job = Native.exec({ command: cmd, cwd: t.cwd, timeout: 3600, interactive: true }, function (stream, data) { write(data); });
      var r = await t.job.promise.catch(function (err) { return { code: -1, error: err.message }; });
      t.job = null;
      if (r.error) write(r.error + '\n');
      if (r.code) write('[exit ' + r.code + (r.killed ? ', dihentikan' : r.timedOut ? ', melewati batas waktu' : '') + ']\n');
      stop.hidden = true;
      input.placeholder = 'Ketik perintah lalu tekan Enter';
      refreshGit();
    });
    setTimeout(function () { input.focus(); }, 30);
  }

  // ---------------------------------------------------------------- dev preview

  function renderDevPreview() {
    var url = st.pendingUrl; st.pendingUrl = null;
    Browser.mount(els.body, { key: 'code-' + conv.id, workspace: conv.workspace || '', url: url, onSendErrors: function (text) { Chat.insertText ? Chat.insertText(text) : Chat.setContext({ kind: 'browser', key: 'browser-errors', label: 'Error live view', text: text }); } });
  }

  /* Live view of a dev server / local page (open_preview tool). */
  Panel.openPreview = function (url, c) {
    if (!conv || (c && c.id !== conv.id)) return false;
    Panel.openBrowser(url);
    return true;
  };

  Panel.openFile = function (path) {
    if (!conv || conv.mode !== 'code') return;
    st.codeTab = 'files';
    st.file = path;
    setOpen(true);
    render();
  };

  window.Panel = Panel;
})();
