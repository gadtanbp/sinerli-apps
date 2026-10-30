/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Sinai Browser: live view of coding results, like a small browser inside the
   panel. Opens dev servers (localhost), project files/folders (served from the
   sinai-preview://site/ scheme, no server needed), https sites and artifacts.
   Back/forward, device sizes, console capture, auto-reload when the agent
   changes files, and "send errors to the agent". */
(function () {
  'use strict';
  var h = U.h;
  var Browser = {};
  var DEVICES = { desktop: null, laptop: 1280, tablet: 834, mobile: 390 };
  var states = {};
  var cur = null; // { st, frame, box } of the mounted view

  function state(key) {
    if (!states[key]) states[key] = { url: '', history: [], idx: -1, device: 'desktop', rotate: false, zoom: 1, auto: true, logs: [], showLog: false, sites: {} };
    return states[key];
  }
  Browser.state = state;

  function iconBtn(icon, title, fn, cls) {
    return h('button.icon-btn.no-drag' + (cls ? '.' + cls : ''), { title: title, html: U.icon(icon), onclick: function (e) { e.stopPropagation(); fn(e); } });
  }

  function isPath(u) { return /^(file:\/\/|\/|~\/|[A-Za-z]:[\\\/])/.test(u); }

  /* Turns what the user typed into something the frame can load. */
  async function resolve(input, ws, st) {
    var u = String(input || '').trim();
    if (!u) return '';
    if (/^sinai-preview:/.test(u)) return u;
    if (/^file:\/\//i.test(u)) u = decodeURI(u.replace(/^file:\/\//i, ''));
    if (!/^[a-z]+:\/\//i.test(u) && !isPath(u) && ws && !/^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(u) && !/^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(u)) {
      u = ws.replace(/[\\\/]+$/, '') + '/' + u.replace(/^\.\//, ''); // relative to the project
    }
    if (isPath(u)) {
      var p = u.replace(/\\/g, '/');
      if (p.indexOf('~/') === 0 && Store.info.home) p = Store.info.home + p.slice(1);
      var info = await Native.call('fs.stat', { path: p }).catch(function () { return null; });
      var root, rel;
      var wsN = ws ? ws.replace(/\\/g, '/').replace(/\/+$/, '') : '';
      if (wsN && (p === wsN || p.indexOf(wsN + '/') === 0)) { root = wsN; rel = p.slice(wsN.length + 1); }
      else if (info && info.isDir) { root = p.replace(/\/+$/, ''); rel = ''; }
      else { root = p.replace(/\/[^\/]*$/, '') || '/'; rel = p.split('/').pop(); }
      return siteUrl(root, rel, st);
    }
    if (!/^[a-z]+:\/\//i.test(u)) u = (/^(localhost|127\.|\[::1\])/i.test(u) ? 'http://' : 'https://') + u;
    return u;
  }

  async function siteUrl(root, rel, st) {
    var base = st.sites[root];
    if (!base) {
      try { base = await Native.call('preview.site', { root: root }); }
      catch (e) { return inlineFallback(root, rel); }
      st.sites[root] = base;
    }
    return base + String(rel || '').split('/').map(encodeURIComponent).join('/');
  }

  /* Hosts without preview.site (older mobile builds): bundle the page with its
     local CSS/JS inlined so it still renders. */
  async function inlineFallback(root, rel) {
    var file = root + '/' + (rel && !/\/$/.test(rel) ? rel : (rel || '') + 'index.html');
    var html = (await Native.call('fs.read', { path: file })).content || '';
    var dir = file.replace(/\/[^\/]*$/, '');
    async function read(ref) {
      if (/^(https?:|data:|\/\/)/.test(ref)) return null;
      try { return (await Native.call('fs.read', { path: dir + '/' + ref.replace(/^\.\//, '').split(/[?#]/)[0] })).content; } catch (e) { return null; }
    }
    var links = html.match(/<link[^>]+rel=["']?stylesheet[^>]*>/gi) || [];
    for (var i = 0; i < links.length; i++) {
      var m = /href=["']([^"']+)["']/i.exec(links[i]);
      var css = m && await read(m[1]);
      if (css != null) html = html.replace(links[i], '<style>' + css + '</style>');
    }
    var scripts = html.match(/<script[^>]+src=["'][^"']+["'][^>]*><\/script>/gi) || [];
    for (var j = 0; j < scripts.length; j++) {
      var s = /src=["']([^"']+)["']/i.exec(scripts[j]);
      var js = s && await read(s[1]);
      if (js != null) html = html.replace(scripts[j], '<script' + (/type=["']module["']/i.test(scripts[j]) ? ' type="module"' : '') + '>' + js.replace(/<\/script/gi, '<\\/script') + '</script>');
    }
    return Native.call('preview.put', { key: 'site-' + Date.now(), html: html });
  }

  function label(u) {
    if (!u) return '';
    var m = /^sinai-preview:\/\/site\/[^\/]+\/(.*)$/.exec(u);
    if (m) {
      for (var root in (cur && cur.st.sites) || {}) if (u.indexOf(cur.st.sites[root]) === 0) return root + '/' + decodeURIComponent(m[1]);
      return '/' + decodeURIComponent(m[1]);
    }
    if (/^sinai-preview:\/\/p\//.test(u)) return 'sinai://artifact';
    return u;
  }

  function addLog(st, level, text) {
    st.logs.push({ level: level, text: String(text).slice(0, 2000), t: Date.now() });
    if (st.logs.length > 300) st.logs.splice(0, st.logs.length - 300);
  }

  window.addEventListener('message', function (e) {
    if (!cur || !cur.frame || e.source !== cur.frame.contentWindow) return;
    var d = e.data || {};
    if (!d.__gxSite && !d.__gx) return;
    if (d.type === 'console') addLog(cur.st, d.level, d.text);
    else if (d.type === 'error') addLog(cur.st, 'error', d.message);
    else if (d.type === 'nav' && d.url && d.url !== cur.st.url && cur.st.url.indexOf('sinai-preview://site/') === 0) {
      push(cur.st, d.url); if (cur.input) cur.input.value = label(d.url);
    }
    paintLog();
  });

  function push(st, url) {
    if (st.history[st.idx] === url) return;
    st.history = st.history.slice(0, st.idx + 1);
    st.history.push(url);
    if (st.history.length > 50) st.history.shift();
    st.idx = st.history.length - 1;
    st.url = url;
  }

  function load(url, noHistory) {
    if (!cur) return;
    var st = cur.st;
    if (!noHistory) push(st, url); else st.url = url;
    st.logs = [];
    cur.input.value = label(url);
    // A fresh frame per navigation: some engines refuse to re-navigate a frame
    // that showed a cross-origin site, and it drops the old page's state cleanly.
    var nf = makeFrame();
    cur.frame.replaceWith(nf);
    cur.frame = nf;
    applyDevice();
    nf.src = url + (url.indexOf('sinai-preview://') === 0 ? (url.indexOf('?') < 0 ? '?' : '&') + '_gx=' + Date.now() : '');
    cur.loading.hidden = false;
    cur.hint.hidden = true;
    clearTimeout(cur.slowT);
    if (/^https?:\/\//.test(url) && !/^https?:\/\/(localhost|127\.|\[::1\])/.test(url)) {
      cur.slowT = setTimeout(function () { if (cur && cur.hint) cur.hint.hidden = false; }, 4000);
    }
    paintNav(); paintLog();
  }

  Browser.go = async function (input) {
    if (!cur) return;
    try {
      var url = await resolve(input, cur.opts.workspace, cur.st);
      if (url) load(url);
    } catch (e) { UI.toast(e.message, { error: true }); }
  };

  Browser.reload = function () { if (cur && cur.st.url) load(cur.st.url, true); };

  /* The agent changed files: reload project pages (dev servers usually hot-reload themselves). */
  Browser.filesChanged = U.debounce(function () {
    if (cur && cur.st.auto && cur.st.url && cur.st.url.indexOf('sinai-preview://site/') === 0 && document.body.contains(cur.frame)) Browser.reload();
  }, 700);

  function paintNav() {
    if (!cur) return;
    cur.back.disabled = cur.st.idx <= 0;
    cur.fwd.disabled = cur.st.idx >= cur.st.history.length - 1;
  }

  function paintLog() {
    if (!cur) return;
    var st = cur.st;
    var errs = st.logs.filter(function (l) { return l.level === 'error'; }).length;
    cur.logBtn.innerHTML = U.icon('terminal') + (errs ? '<em class="bw-badge">' + errs + '</em>' : '');
    cur.logBtn.classList.toggle('on', st.showLog);
    cur.log.hidden = !st.showLog;
    if (!st.showLog) return;
    cur.logList.innerHTML = '';
    if (!st.logs.length) cur.logList.appendChild(h('div.bw-log-empty', { text: 'Konsol kosong. Log, peringatan, dan error halaman tampil di sini.' }));
    st.logs.forEach(function (l) { cur.logList.appendChild(h('div.bw-log-row.' + l.level, { text: l.text })); });
    cur.logList.scrollTop = cur.logList.scrollHeight;
  }

  function applyDevice() {
    var st = cur.st, w = DEVICES[st.device];
    var f = cur.frame;
    cur.stage.classList.toggle('device', !!w);
    if (w) {
      var ww = st.rotate ? Math.round(w * (st.device === 'mobile' ? 2.16 : 1.37)) : w;
      f.style.width = ww + 'px';
      f.style.height = st.device === 'mobile' && !st.rotate ? '844px' : st.device === 'tablet' && !st.rotate ? '1112px' : '';
    } else { f.style.width = ''; f.style.height = ''; }
    f.style.transform = st.zoom !== 1 ? 'scale(' + st.zoom + ')' : '';
    f.style.transformOrigin = 'top center';
  }

  function makeFrame() {
    var f = h('iframe.cv-frame.dev', { sandbox: 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads allow-pointer-lock', allow: 'fullscreen; clipboard-read; clipboard-write; xr-spatial-tracking; gamepad' });
    f.addEventListener('load', function () { if (cur && cur.frame === f) { cur.loading.hidden = true; clearTimeout(cur.slowT); } });
    return f;
  }

  /* Mounts the browser into `box`. opts: { key, workspace, url, onSendErrors(text) } */
  Browser.mount = function (box, opts) {
    opts = opts || {};
    var st = state(opts.key || 'global');
    var input = h('input.inp.mono.bw-url', { value: '', placeholder: opts.workspace ? 'index.html, localhost:5173, atau https://…' : 'localhost:3000 atau https://…', spellcheck: false });
    var loading = h('div.bw-loading', { hidden: true });
    var frame = makeFrame();
    var stage = h('div.cv-stage.bw-stage', frame, loading);
    var hint = h('div.bw-hint', { hidden: true },
      h('span', { text: 'Halaman kosong? Beberapa situs menolak ditampilkan di dalam aplikasi.' }),
      h('button.btn.sm', { text: 'Buka di browser', onclick: function () { Native.call('app.openURL', { url: st.url }); } }),
      h('button.icon-btn', { html: U.icon('x'), onclick: function () { hint.hidden = true; } }));
    var logList = h('div.bw-log-list');
    var log = h('div.bw-log', { hidden: true },
      h('div.bw-log-head', h('b', { text: 'Konsol' }), h('div.ph-spacer'),
        h('button.btn.sm', { text: 'Kirim error ke agen', onclick: function () {
          var errs = st.logs.filter(function (l) { return l.level === 'error' || l.level === 'warn'; });
          if (!errs.length) { UI.toast('Tidak ada error/peringatan di konsol'); return; }
          var text = 'Live view (' + label(st.url) + ') menampilkan error berikut. Perbaiki sampai konsol bersih:\n```\n' + errs.map(function (l) { return '[' + l.level + '] ' + l.text; }).join('\n').slice(0, 6000) + '\n```';
          if (opts.onSendErrors) opts.onSendErrors(text);
        } }),
        h('button.btn.sm', { text: 'Bersihkan', onclick: function () { st.logs = []; paintLog(); } })),
      logList);
    var back = iconBtn('chevronRight', 'Kembali', function () { if (st.idx > 0) { st.idx--; load(st.history[st.idx], true); } }, 'flip');
    var fwd = iconBtn('chevronRight', 'Maju', function () { if (st.idx < st.history.length - 1) { st.idx++; load(st.history[st.idx], true); } });
    var dv = iconBtn('monitor', 'Ukuran layar', function () {
      UI.menu(dv, [['desktop', 'Penuh', 'monitor'], ['laptop', 'Laptop (1280px)', 'monitor'], ['tablet', 'Tablet (834px)', 'tablet'], ['mobile', 'Ponsel (390px)', 'phone']].map(function (d) {
        return { label: d[1], icon: d[2], check: st.device === d[0], onClick: function () { st.device = d[0]; applyDevice(); } };
      }).concat(['sep',
        { label: 'Putar (landscape)', icon: 'refresh', check: st.rotate, onClick: function () { st.rotate = !st.rotate; applyDevice(); } },
        { label: 'Zoom 50%', check: st.zoom === 0.5, onClick: function () { st.zoom = 0.5; applyDevice(); } },
        { label: 'Zoom 75%', check: st.zoom === 0.75, onClick: function () { st.zoom = 0.75; applyDevice(); } },
        { label: 'Zoom 100%', check: st.zoom === 1, onClick: function () { st.zoom = 1; applyDevice(); } }]), { align: 'end', width: 220 });
    });
    var logBtn = iconBtn('terminal', 'Konsol halaman', function () { st.showLog = !st.showLog; paintLog(); });
    var more = iconBtn('more', 'Lainnya', function () {
      var items = [
        { label: 'Muat ulang otomatis saat file berubah', icon: 'refresh', check: st.auto, onClick: function () { st.auto = !st.auto; } },
        { label: 'Buka di browser sistem', icon: 'external', onClick: function () {
          var u = st.url;
          if (/^sinai-preview:\/\/site\//.test(u)) { UI.toast('Halaman file proyek: jalankan dev server untuk membukanya di browser sistem', { icon: 'globe' }); return; }
          if (u) Native.call('app.openURL', { url: u });
        } },
      ];
      if (opts.workspace) items.unshift({ label: 'Buka index.html proyek', icon: 'file', onClick: function () { Browser.go(opts.workspace + '/index.html'); } });
      items.push({ label: 'Deteksi dev server', icon: 'scan', onClick: function () {
        Native.call('net.scanDev', {}).then(function (r) {
          if (!r.servers.length) { UI.toast('Tidak ada dev server aktif di port umum', { error: true }); return; }
          UI.menu(more, [{ title: 'Server terdeteksi' }].concat(r.servers.map(function (s) { return { label: s.url, icon: 'globe', onClick: function () { Browser.go(s.url); } }; })), { align: 'end', width: 240 });
        }).catch(function (e) { UI.toast(e.message, { error: true }); });
      } });
      UI.menu(more, items, { align: 'end', width: 290 });
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') Browser.go(input.value); });
    input.addEventListener('focus', function () { input.select(); });
    var bar = h('div.pbar.bw-bar', back, fwd, iconBtn('refresh', 'Muat ulang', function () { Browser.reload(); }), input, dv, logBtn, more);
    box.appendChild(h('div.bw', bar, hint, stage, log));
    cur = { st: st, frame: frame, stage: stage, input: input, back: back, fwd: fwd, logBtn: logBtn, log: log, logList: logList, loading: loading, hint: hint, opts: opts };
    applyDevice();
    var start = opts.url || st.url;
    if (start) { if (start === st.url) { input.value = label(start); frame.src = start; paintNav(); paintLog(); } else Browser.go(start); }
    else if (opts.workspace) {
      Native.call('fs.stat', { path: opts.workspace + '/index.html' }).then(function (i) { if (i && i.exists && !i.isDir) Browser.go(opts.workspace + '/index.html'); }).catch(function () {});
      paintNav();
    } else paintNav();
    paintLog();
  };

  /* Recent console output of the mounted page (used by the QA agent). */
  Browser.logs = function () { return cur ? { url: label(cur.st.url), logs: cur.st.logs.slice(-80) } : null; };
  Browser.resolve = function (u, ws, key) { return resolve(u, ws, state(key || 'global')); };

  window.Browser = Browser;
})();
