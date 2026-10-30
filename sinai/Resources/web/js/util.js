/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Shared helpers: DOM, formatting, paths, diffing, HTML→text. */
(function () {
  'use strict';

  var ICONS = {
    plus: 'M12 5v14M5 12h14',
    chat: 'M20 12a8 8 0 0 1-11.5 7.2L4 20l1-4.2A8 8 0 1 1 20 12z',
    code: 'M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5l-3 14',
    search: 'M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM20 20l-4.3-4.3',
    settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
    sidebar: 'M5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5zM9.5 4.5v15',
    arrowUp: 'M12 19V5.5M5.5 12L12 5.5 18.5 12',
    arrowDown: 'M12 5v13.5M5.5 12l6.5 6.5 6.5-6.5',
    stop: 'M7.5 7.5h9v9h-9z',
    clip: 'M20 11.5l-8 8a5 5 0 0 1-7-7l8.3-8.3a3.3 3.3 0 0 1 4.7 4.7l-8.3 8.3a1.6 1.6 0 0 1-2.3-2.3l7.6-7.6',
    globe: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17zM3.5 12h17M12 3.5c2.3 2.5 3.5 5.3 3.5 8.5s-1.2 6-3.5 8.5c-2.3-2.5-3.5-5.3-3.5-8.5s1.2-6 3.5-8.5z',
    chevronDown: 'M6.5 9.5l5.5 5.5 5.5-5.5',
    chevronRight: 'M9.5 6.5l5.5 5.5-5.5 5.5',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    x: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
    copy: 'M9 9h10.5v10.5H9zM5 15V4.5h10.5',
    refresh: 'M19.5 11A7.5 7.5 0 0 0 6 6.6L4.5 8M4.5 4v4h4M4.5 13A7.5 7.5 0 0 0 18 17.4l1.5-1.4M19.5 20v-4h-4',
    edit: 'M4.5 19.5h4l10.5-10.5-4-4L4.5 15.5v4zM13 7l4 4',
    trash: 'M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5h9L17.5 7M9.5 7V4.5h5V7',
    folder: 'M3.5 7.5A2 2 0 0 1 5.5 5.5h3.8l2 2h7.2a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
    file: 'M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5zM13.5 3.5v5h5',
    fileEdit: 'M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h4M13.5 3.5v5h5v3M13 20.5v-2.5l5-5 2.5 2.5-5 5z',
    filePlus: 'M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5zM13.5 3.5v5h5M12 11.5v6M9 14.5h6',
    terminal: 'M5 16.5l5-4.5-5-4.5M12.5 18h7',
    sparkle: 'M12 3.5l1.7 5 5 1.8-5 1.7-1.7 5-1.7-5-5-1.7 5-1.8zM18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
    bulb: 'M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z',
    eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
    wrench: 'M14.5 4.5a4.5 4.5 0 0 0-4.2 6.1L4 16.9V20h3.1l6.3-6.3a4.5 4.5 0 0 0 6.1-4.2l-2.8 2.8-2.7-.6-.6-2.7z',
    list: 'M10 6.5h10M10 12h10M10 17.5h10M4 6.5l1.2 1.2L7.5 5.4M4 12l1.2 1.2L7.5 10.9M4 17.5l1.2 1.2 2.3-2.3',
    alert: 'M12 4l9 16H3zM12 10v4.5M12 17.5v.01',
    shield: 'M12 3.5l7.5 3v5.5c0 4.3-3.2 7.7-7.5 8.5-4.3-.8-7.5-4.2-7.5-8.5V6.5z',
    shieldOff: 'M12 3.5l7.5 3v5.5c0 4.3-3.2 7.7-7.5 8.5-4.3-.8-7.5-4.2-7.5-8.5V6.5zM9 12l2 2 4-4',
    key: 'M15.5 4a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9zM12.3 11.7L4 20M7 17l2.5 2.5M9.5 14.5l2 2',
    sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4',
    external: 'M14 4.5h5.5V10M19.5 4.5l-8.5 8.5M18 13.5v5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    play: 'M7.5 5.5l11 6.5-11 6.5z',
    download: 'M12 4v11.5M6.5 10l5.5 5.5 5.5-5.5M4.5 20h15',
    more: 'M6 12h.01M12 12h.01M18 12h.01',
    image: 'M4.5 5h15v14h-15zM4.5 16l4.5-4.5 4 4 2-2 4.5 4.5M15 9.5h.01',
    zap: 'M13 2.5L5 13.5h6l-1 8 8-11h-6z',
    layers: 'M12 3.5l8.5 4.5-8.5 4.5L3.5 8zM3.5 12.5l8.5 4.5 8.5-4.5',
    cpu: 'M7.5 7.5h9v9h-9zM10 3.5v4M14 3.5v4M10 16.5v4M14 16.5v4M3.5 10h4M3.5 14h4M16.5 10h4M16.5 14h4',
    user: 'M12 11.5a3.75 3.75 0 1 0 0-7.5a3.75 3.75 0 1 0 0 7.5zM4.5 20.5a7.5 7.5 0 0 1 15 0',
    branch: 'M6.5 4v11M17.5 9.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 1 0 0 5zM6.5 20.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 1 0 0 5zM17.5 9.5a8.5 8.5 0 0 1-8.5 8',
    brain: 'M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.5A3 3 0 0 0 7 18a2.5 2.5 0 0 0 5 .5v-12a2.5 2.5 0 0 0-3-2zM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.5A3 3 0 0 1 17 18a2.5 2.5 0 0 1-5 .5',
    pin: 'M9 4.5h6l-1 5 3 3v1.5H7V12.5l3-3zM12 14v6',
    info: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17zM12 11v5M12 8v.01',
    keyboard: 'M3.5 6.5h17v11h-17zM7 10h.01M10 10h.01M13 10h.01M16 10h.01M7.5 14h9',
    trash2: 'M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12',
    monitor: 'M3.5 5h17v11h-17zM8.5 20h7M12 16v4',
    tablet: 'M6.5 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM11 17.5h2',
    phone: 'M8 3.5h8a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM11 17.5h2',
    palette: 'M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.7-.8 1.7-1.6 0-1.3-1-1.5-1-2.6 0-.9.7-1.5 1.6-1.5h2.2a4 4 0 0 0 4-4c0-4.1-3.8-7.3-8.5-7.3zM7.5 12h.01M9.5 8h.01M14.5 8h.01',
    plug: 'M9 3.5v4M15 3.5v4M7 7.5h10v3a5 5 0 0 1-10 0zM12 15.5v5',
    box: 'M12 3l8.5 4.5v9L12 21l-8.5-4.5v-9zM3.5 7.5L12 12l8.5-4.5M12 12v9',
    pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
    history: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 4.5V9H9M12 8v4.5l3 2',
    memory: 'M12 3.5c-3 0-5.5 2-5.5 5 0 1.6.7 2.7 1.6 3.6.8.8 1.4 1.6 1.4 2.9v.5h5v-.5c0-1.3.6-2.1 1.4-2.9.9-.9 1.6-2 1.6-3.6 0-3-2.5-5-5.5-5zM9.5 19h5M10.5 21.5h3',
    target: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17zM12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 11.5v1',
    rocket: 'M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5M14 4.5c3 0 5.5 2.5 5.5 5.5L12 17.5l-5-5zM9.5 10l-4 .5-2 2.5 4 1M14 14.5l-.5 4-2.5 2-1-4M15 9a1 1 0 1 0 0-.01',
    mic: 'M12 4a2.5 2.5 0 0 0-2.5 2.5v5a2.5 2.5 0 0 0 5 0v-5A2.5 2.5 0 0 0 12 4zM6 11a6 6 0 0 0 12 0M12 17v3M9 20.5h6',
    camera: 'M4.5 8h3l1.5-2h6L16.5 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 11a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
    record: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17zM12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7z',
    share: 'M16.5 8a2.5 2.5 0 1 0-2.4-3.1L8.9 7.6a2.5 2.5 0 1 0 0 4.8l5.2 2.7a2.5 2.5 0 1 0 .8-1.5L9.7 11a2.5 2.5 0 0 0 0-1.9l5-2.6A2.5 2.5 0 0 0 16.5 8z',
    print: 'M7 9V4h10v5M7 18H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z',
    scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M3.5 12h17',
    bell: 'M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9zM10 19a2 2 0 0 0 4 0',
  };

  function icon(name, cls) {
    var d = ICONS[name] || ICONS.info;
    var sw = name === 'more' ? 3 : 1.8;
    var fill = name === 'stop' ? 'currentColor' : 'none';
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="' + fill + '" stroke="currentColor" stroke-width="' + sw +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  function hydrateIcons(root) {
    (root || document).querySelectorAll('i[data-icon]').forEach(function (i) {
      i.outerHTML = icon(i.getAttribute('data-icon'), i.className);
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* h('div.a.b', {onclick, title, html}, children...) */
  function h(sel, props) {
    var m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
    var el = document.createElement((m && m[1]) || 'div');
    if (m && m[2]) {
      m[2].replace(/([.#])([\w-]+)/g, function (_, t, v) {
        if (t === '.') el.classList.add(v); else el.id = v;
      });
    }
    var start = 2;
    if (props instanceof Node || Array.isArray(props) || typeof props === 'string' || typeof props === 'number') { start = 1; props = null; }
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'value') el.value = v;
        else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = start; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }

  function uid(prefix) {
    return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function debounce(fn, ms) {
    var t = null;
    var f = function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, ms);
    };
    f.flush = function () { if (t) { clearTimeout(t); t = null; fn(); } };
    return f;
  }

  function throttle(fn, ms) {
    var last = 0, timer = null;
    return function () {
      var now = Date.now(), wait = ms - (now - last);
      if (wait <= 0) { last = now; fn(); }
      else if (!timer) timer = setTimeout(function () { timer = null; last = Date.now(); fn(); }, wait);
    };
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function dateGroup(ts) {
    var d = new Date(ts), now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ts >= start) return 'Hari ini';
    if (ts >= start - 864e5) return 'Kemarin';
    if (ts >= start - 7 * 864e5) return '7 hari terakhir';
    if (ts >= start - 30 * 864e5) return '30 hari terakhir';
    return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  }

  function fmtTokens(n) {
    if (!n) return '0';
    if (n < 1000) return String(n);
    if (n < 1e6) return (n / 1000).toFixed(n < 1e4 ? 1 : 0) + 'k';
    return (n / 1e6).toFixed(2) + 'M';
  }

  function fmtDuration(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + ' dtk';
    return Math.floor(s / 60) + ' mnt ' + (s % 60) + ' dtk';
  }

  function estimateTokens(s) { return Math.ceil((s || '').length / 3.6); }

  function truncateMiddle(s, max) {
    s = s || '';
    if (s.length <= max) return s;
    var head = Math.floor(max * 0.35), tail = max - head;
    return s.slice(0, head) + '\n\n… [' + (s.length - max) + ' karakter dipotong] …\n\n' + s.slice(s.length - tail);
  }

  // ---- paths ("/"-separated everywhere; Windows paths look like C:/Users/…) ----
  function toSlash(p) { return String(p == null ? '' : p).replace(/\\/g, '/'); }
  // Drive ("C:") or UNC ("//server/share") prefix, else "".
  function rootOf(p) {
    var m = /^([A-Za-z]:)(\/|$)/.exec(p);
    if (m) return m[1] + '/';
    m = /^\/\/[^/]+\/[^/]+/.exec(p);
    if (m) return m[0] + '/';
    return p.charAt(0) === '/' ? '/' : '';
  }
  function isAbs(p) { p = toSlash(p); return !!rootOf(p) || /^[A-Za-z]:$/.test(p); }
  function normalize(p) {
    p = toSlash(p);
    if (/^[A-Za-z]:$/.test(p)) p += '/';
    var root = rootOf(p);
    var rest = root ? p.slice(root.length) : p;
    var out = [];
    rest.split('/').forEach(function (seg) {
      if (!seg || seg === '.') return;
      if (seg === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!root) out.push('..'); }
      else out.push(seg);
    });
    return (root + out.join('/')) || (root || '.');
  }
  function resolvePath(base, p, home) {
    p = toSlash(String(p || '').trim());
    if (!p) return base;
    if (p === '~' || p.slice(0, 2) === '~/') p = (home || '') + p.slice(1);
    if (!isAbs(p)) p = (base || home || '/') + '/' + p;
    return normalize(p);
  }
  function basename(p) { p = toSlash(p).replace(/\/+$/, ''); return p.slice(p.lastIndexOf('/') + 1); }
  function dirname(p) {
    p = toSlash(p).replace(/\/+$/, '');
    var root = rootOf(p + '/');
    var i = p.lastIndexOf('/');
    if (root && root !== '/' && i < root.length) return root;
    return i <= 0 ? '/' : p.slice(0, i);
  }
  function samePath(a, b) {
    a = toSlash(a); b = toSlash(b);
    return isWin() ? a.toLowerCase() === b.toLowerCase() : a === b;
  }
  function startsWithPath(p, prefix) {
    p = toSlash(p); prefix = toSlash(prefix);
    return isWin() ? p.toLowerCase().indexOf(prefix.toLowerCase()) === 0 : p.indexOf(prefix) === 0;
  }
  function relPath(from, to) {
    if (!from) return to;
    if (samePath(to, from)) return '.';
    if (startsWithPath(to, from + '/')) return to.slice(from.length + 1);
    return to;
  }
  function tildify(p, home) { return home && p && startsWithPath(p, home) ? '~' + toSlash(p).slice(home.length) : p; }

  // ---- platform (macOS host = Swift app; Windows/Linux host = Electron app) ----
  function osFamily() {
    var i = (window.Store && window.Store.info) || {};
    if (i.osFamily) return i.osFamily;
    if (i.platform === 'win32') return 'windows';
    if (i.platform === 'linux') return 'linux';
    return 'macos';
  }
  function isMac() { return osFamily() === 'macos'; }
  function isWin() { return osFamily() === 'windows'; }
  /** Android & iOS: host ponsel (mobile/), tanpa shell dan sistem berkas komputer. */
  function isMobile() { var f = osFamily(); return f === 'android' || f === 'ios'; }
  function feature(name) {
    var f = ((window.Store && window.Store.info) || {}).features;
    return f ? f[name] !== false : true; // the macOS host has every feature
  }
  /** Shortcut glyphs (⌘ ⇧ ⌥ ↵) become Ctrl+Shift+… on Windows/Linux. */
  function kbd(s) {
    s = String(s == null ? '' : s);
    if (isMac()) return s;
    var MOD = { '⇧': 'Shift+', '⌥': 'Alt+', '⌃': 'Ctrl+' };
    s = s.replace(/([⇧⌥⌃]*)⌘(.)/g, function (m, mods, key) {
      return 'Ctrl+' + mods.split('').map(function (c) { return MOD[c] || ''; }).join('') + (key === '↵' ? 'Enter' : key.toUpperCase());
    });
    s = s.replace(/⇧↵/g, 'Shift+Enter').replace(/↵/g, 'Enter');
    return s;
  }
  /** UI wording that names macOS parts (Finder, Keychain, "Mac") adapted to the running OS. */
  function plat(s) {
    s = kbd(s);
    if (isMac()) return s;
    if (isMobile()) {
      var os = osFamily() === 'ios' ? 'iOS' : 'Android';
      return s
        .replace(/macOS Keychain/g, os === 'iOS' ? 'iOS Keychain' : 'Android Keystore (terenkripsi)')
        .replace(/Quick Look \(tampilan asli macOS\)/g, 'Buka dengan aplikasi lain')
        .replace(/Tampilkan di Finder/g, 'Bagikan')
        .replace(/Finder/g, 'aplikasi Files')
        .replace(/di Mac Anda/g, 'di perangkat ini')
        .replace(/Mac ini/g, 'perangkat ini')
        .replace(/Notifikasi macOS/g, 'Notifikasi')
        .replace(/untuk macOS/g, 'untuk ' + os);
    }
    var win = isWin();
    return s
      .replace(/macOS Keychain/g, win ? 'Windows (terenkripsi DPAPI)' : 'keyring sistem')
      .replace(/Quick Look \(tampilan asli macOS\)/g, 'Buka dengan aplikasi bawaan')
      .replace(/Finder/g, win ? 'File Explorer' : 'pengelola file')
      .replace(/\bTrash\b/g, win ? 'Recycle Bin' : 'Tempat Sampah')
      .replace(/di Mac Anda/g, 'di komputer Anda')
      .replace(/Mac ini/g, 'komputer ini')
      .replace(/diputar Mac/g, 'diputar komputer')
      .replace(/Notifikasi macOS/g, 'Notifikasi sistem')
      .replace(/untuk macOS/g, 'untuk ' + (win ? 'Windows' : 'Linux'));
  }
  function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

  // ---- line diff (Myers) ----
  function myers(a, b) {
    var n = a.length, m = b.length;
    if (!n) return b.map(function (s) { return { t: '+', s: s }; });
    if (!m) return a.map(function (s) { return { t: '-', s: s }; });
    var max = n + m, off = max + 1, v = new Int32Array(2 * max + 3), trace = [];
    var limit = Math.min(max, 1200), found = false, d;
    for (d = 0; d <= limit; d++) {
      trace.push(v.slice());
      for (var k = -d; k <= d; k += 2) {
        var x = (k === -d || (k !== d && v[k - 1 + off] < v[k + 1 + off])) ? v[k + 1 + off] : v[k - 1 + off] + 1;
        var y = x - k;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        v[k + off] = x;
        if (x >= n && y >= m) { found = true; break; }
      }
      if (found) break;
    }
    if (!found) {
      return a.map(function (s) { return { t: '-', s: s }; }).concat(b.map(function (s) { return { t: '+', s: s }; }));
    }
    var out = [], X = n, Y = m;
    for (var dd = trace.length - 1; dd >= 0; dd--) {
      var vv = trace[dd], kk = X - Y;
      var prevK = (kk === -dd || (kk !== dd && vv[kk - 1 + off] < vv[kk + 1 + off])) ? kk + 1 : kk - 1;
      var prevX = vv[prevK + off], prevY = prevX - prevK;
      while (X > prevX && Y > prevY) { out.push({ t: '=', s: a[X - 1] }); X--; Y--; }
      if (dd > 0) {
        if (X === prevX) { out.push({ t: '+', s: b[Y - 1] }); Y--; }
        else { out.push({ t: '-', s: a[X - 1] }); X--; }
      }
    }
    return out.reverse();
  }

  function diffLines(oldText, newText) {
    var a0 = String(oldText || ''), b0 = String(newText || '');
    if (a0.slice(-1) === '\n' && b0.slice(-1) === '\n' || !a0 && b0.slice(-1) === '\n') { a0 = a0.replace(/\n$/, ''); b0 = b0.replace(/\n$/, ''); }
    var A = a0 ? a0.split('\n') : [], B = b0 ? b0.split('\n') : [];
    var s = 0;
    while (s < A.length && s < B.length && A[s] === B[s]) s++;
    var ea = A.length - 1, eb = B.length - 1;
    while (ea >= s && eb >= s && A[ea] === B[eb]) { ea--; eb--; }
    var mid = myers(A.slice(s, ea + 1), B.slice(s, eb + 1));
    var pre = A.slice(0, s).map(function (x) { return { t: '=', s: x }; });
    var post = A.slice(ea + 1).map(function (x) { return { t: '=', s: x }; });
    var ops = pre.concat(mid, post);
    var o = 1, nn = 1, adds = 0, dels = 0;
    ops.forEach(function (op) {
      if (op.t === '=') { op.o = o++; op.n = nn++; }
      else if (op.t === '-') { op.o = o++; dels++; }
      else { op.n = nn++; adds++; }
    });
    return { ops: ops, adds: adds, dels: dels };
  }

  /* Collapses unchanged runs to `ctx` lines around changes. */
  function diffHunks(ops, ctx, startLine) {
    ctx = ctx == null ? 3 : ctx;
    var keep = new Array(ops.length).fill(false);
    ops.forEach(function (op, i) {
      if (op.t !== '=') for (var j = Math.max(0, i - ctx); j <= Math.min(ops.length - 1, i + ctx); j++) keep[j] = true;
    });
    var out = [], skipped = 0;
    ops.forEach(function (op, i) {
      if (keep[i]) {
        if (skipped) { out.push({ gap: skipped }); skipped = 0; }
        var no = op.t === '-' ? op.o : op.n;
        out.push({ t: op.t, s: op.s, no: no != null ? no + (startLine ? startLine - 1 : 0) : '' });
      } else skipped++;
    });
    if (skipped) out.push({ gap: skipped });
    return out;
  }

  // ---- HTML → readable text (for web_fetch) ----
  function htmlToText(html, baseUrl) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript,svg,iframe,template,form,button,select,canvas,video,audio,[aria-hidden="true"],nav,footer').forEach(function (n) { n.remove(); });
    var title = (doc.title || '').trim();
    var root = doc.querySelector('main, article, [role="main"]') || doc.body || doc.documentElement;
    var out = [];
    function abs(href) { try { return new URL(href, baseUrl).href; } catch (e) { return href; } }
    function walk(node) {
      if (node.nodeType === 3) { out.push(node.nodeValue.replace(/\s+/g, ' ')); return; }
      if (node.nodeType !== 1) return;
      var tag = node.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) { out.push('\n\n' + '#'.repeat(+tag[1]) + ' ' + node.textContent.trim().replace(/\s+/g, ' ') + '\n\n'); return; }
      if (tag === 'pre') { out.push('\n```\n' + node.textContent.replace(/\n+$/, '') + '\n```\n'); return; }
      if (tag === 'br') { out.push('\n'); return; }
      if (tag === 'a') {
        var t = node.textContent.trim().replace(/\s+/g, ' ');
        var href = node.getAttribute('href');
        if (t && href && !/^(javascript|#)/i.test(href)) out.push('[' + t + '](' + abs(href) + ')');
        else if (t) out.push(t);
        return;
      }
      if (tag === 'img') { var alt = node.getAttribute('alt'); if (alt) out.push('[gambar: ' + alt + ']'); return; }
      if (tag === 'li') out.push('\n- ');
      if (tag === 'tr') out.push('\n| ');
      if (/^(p|div|section|article|ul|ol|table|blockquote|header|dl|dt|dd|figure|figcaption)$/.test(tag)) out.push('\n');
      for (var c = node.firstChild; c; c = c.nextSibling) walk(c);
      if (tag === 'td' || tag === 'th') out.push(' | ');
      if (/^(p|div|section|article|ul|ol|table|blockquote|header)$/.test(tag)) out.push('\n');
    }
    walk(root);
    var text = out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
    return { title: title, text: text };
  }

  function parseJSONLoose(s) {
    if (s == null) return null;
    if (typeof s === 'object') return s;
    s = String(s).trim();
    if (!s) return {};
    try { return JSON.parse(s); } catch (e) { /* repair below */ }
    var t = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(t); } catch (e) { /* continue */ }
    // close unbalanced braces/brackets/strings (truncated output)
    var stack = [], inStr = false, escp = false;
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (inStr) { if (escp) escp = false; else if (c === '\\') escp = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
      else if (c === '}' || c === ']') stack.pop();
    }
    var fixed = t + (inStr ? '"' : '') + stack.reverse().join('');
    try { return JSON.parse(fixed); } catch (e) { return null; }
  }

  function extractJSONObject(text) {
    var m = String(text || '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    return parseJSONLoose(m[0]);
  }

  window.U = {
    icon: icon, hydrateIcons: hydrateIcons, esc: esc, h: h, uid: uid, debounce: debounce, throttle: throttle,
    sleep: sleep, dateGroup: dateGroup, fmtTokens: fmtTokens, fmtDuration: fmtDuration, estimateTokens: estimateTokens,
    truncateMiddle: truncateMiddle, normalize: normalize, resolvePath: resolvePath, basename: basename, dirname: dirname,
    relPath: relPath, tildify: tildify, shq: shq, isAbs: isAbs, toSlash: toSlash, samePath: samePath, startsWithPath: startsWithPath,
    osFamily: osFamily, isMac: isMac, isWin: isWin, isMobile: isMobile, feature: feature, kbd: kbd, plat: plat, diffLines: diffLines, diffHunks: diffHunks, htmlToText: htmlToText,
    parseJSONLoose: parseJSONLoose, extractJSONObject: extractJSONObject,
  };
})();
