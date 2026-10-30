/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* UI primitives: overlays (popover, menu, modal), toasts, appearance and the
   window-drag regions reported to the native shell. */
(function () {
  'use strict';
  var h = U.h;
  var root = function () { return document.getElementById('overlay-root'); };
  var openOverlays = [];

  var UI = {
    state: { mode: 'chat', conv: null },
    $: function (s, el) { return (el || document).querySelector(s); },
    $$: function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); },
  };

  // ---------------------------------------------------------------- toasts
  UI.toast = function (text, opts) {
    opts = opts || {};
    var el = h('div.toast.glass-pop' + (opts.error ? '.err' : ''), { html: U.icon(opts.error ? 'alert' : (opts.icon || 'check')) + '<span>' + U.esc(text) + '</span>' });
    document.getElementById('toast-root').appendChild(el);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 300); }, opts.ms || (opts.error ? 5000 : 2200));
  };

  // ---------------------------------------------------------------- overlays
  function pushOverlay(o) { openOverlays.push(o); UI.syncDrag(); }
  function popOverlay(o) {
    var i = openOverlays.indexOf(o);
    if (i >= 0) openOverlays.splice(i, 1);
    UI.syncDrag();
  }
  UI.hasOverlay = function () { return openOverlays.length > 0; };
  UI.closeTopOverlay = function () {
    var o = openOverlays[openOverlays.length - 1];
    if (o && o.dismissible !== false) { o.close(); return true; }
    return false;
  };

  /* Positions `el` next to `anchor`, preferring above (composer) or below. */
  UI.popover = function (anchor, el, opts) {
    opts = opts || {};
    el.classList.add('popover', 'glass-pop');
    var catcher = h('div', { style: { position: 'fixed', inset: '0' } });
    root().appendChild(catcher);
    root().appendChild(el);
    var r = anchor.getBoundingClientRect();
    var W = window.innerWidth, H = window.innerHeight;
    var w = el.offsetWidth, ht = el.offsetHeight;
    var left = opts.align === 'end' ? r.right - w : r.left;
    left = Math.max(8, Math.min(W - w - 8, left));
    var top;
    // Content that is filled in later (async) measures ~0 now: decide by where the
    // anchor sits instead, so a popover from the composer never drops off-screen.
    var lowHalf = r.top + r.height / 2 > H / 2;
    var above = opts.placement === 'top' || (opts.placement !== 'bottom' && (r.bottom + ht + 8 > H || (ht < 40 && lowHalf)));
    el.style.left = left + 'px';
    if (above) {
      // Ditambatkan dari bawah: isi yang dimuat belakangan tumbuh ke atas, tidak keluar layar.
      el.style.top = 'auto';
      el.style.bottom = Math.max(8, H - r.top + 6) + 'px';
      el.style.maxHeight = Math.max(160, r.top - 14) + 'px';
      el.style.overflowY = 'auto';
    } else {
      top = Math.min(H - ht - 8, r.bottom + 6);
      el.style.top = Math.max(8, top) + 'px';
      el.style.maxHeight = Math.max(160, H - Math.max(8, top) - 8) + 'px';
      el.style.overflowY = 'auto';
    }
    var o = {
      el: el,
      close: function () {
        if (o.closed) return;
        o.closed = true;
        el.remove(); catcher.remove();
        document.removeEventListener('keydown', onKey, true);
        popOverlay(o);
        if (opts.onClose) opts.onClose();
      },
    };
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); o.close(); } }
    document.addEventListener('keydown', onKey, true);
    catcher.addEventListener('mousedown', function () { o.close(); });
    pushOverlay(o);
    return o;
  };

  /* items: {label, sub, icon, danger, check, onClick} | 'sep' | {title} */
  UI.menu = function (anchor, items, opts) {
    var el = h('div.menu');
    var o;
    items.forEach(function (it) {
      if (it === 'sep') { el.appendChild(h('div.menu-sep')); return; }
      if (it.title) { el.appendChild(h('div.menu-title', { text: it.title })); return; }
      var b = h('button.menu-item' + (it.danger ? '.danger' : ''), {
        html: (it.icon ? U.icon(it.icon) : '') + '<span class="lbl">' + U.esc(it.label) + (it.sub ? '<span class="sub">' + U.esc(it.sub) + '</span>' : '') + '</span>' + (it.check ? '<span class="check">' + U.icon('check') + '</span>' : ''),
        onclick: function () { o.close(); if (it.onClick) it.onClick(); },
      });
      if (it.disabled) b.disabled = true;
      el.appendChild(b);
    });
    if (opts && opts.width) el.style.width = opts.width + 'px';
    o = UI.popover(anchor, el, opts);
    return o;
  };

  UI.modal = function (el, opts) {
    opts = opts || {};
    var scrim = h('div.scrim');
    el.classList.add('glass-pop');
    scrim.appendChild(el);
    root().appendChild(scrim);
    var o = {
      el: el, dismissible: opts.dismissible !== false,
      close: function () {
        if (o.closed) return;
        o.closed = true;
        scrim.remove();
        document.removeEventListener('keydown', onKey, true);
        popOverlay(o);
        if (opts.onClose) opts.onClose();
      },
    };
    function onKey(e) {
      if (e.key === 'Escape' && o.dismissible && openOverlays[openOverlays.length - 1] === o) { e.preventDefault(); o.close(); }
    }
    document.addEventListener('keydown', onKey, true);
    scrim.addEventListener('mousedown', function (e) { if (e.target === scrim && o.dismissible) o.close(); });
    pushOverlay(o);
    return o;
  };

  UI.confirm = function (opts) {
    return new Promise(function (resolve) {
      var m;
      var done = function (v) { resolve(v); m.close(); }; // resolve first: close() fires onClose (cancel)
      var el = h('div.modal.small',
        h('div.modal-head', h('h3', { text: opts.title || 'Konfirmasi' })),
        h('div.modal-body', h('p', { style: { margin: '0', color: 'var(--text-2)' }, text: opts.body || '' })),
        h('div.modal-foot',
          h('button.btn.ghost', { text: opts.cancel || 'Batal', onclick: function () { done(false); } }),
          h('button.btn' + (opts.danger ? '.danger' : '.primary'), { text: opts.ok || 'Lanjutkan', onclick: function () { done(true); } })));
      m = UI.modal(el, { onClose: function () { resolve(false); } });
    });
  };

  UI.prompt = function (opts) {
    return new Promise(function (resolve) {
      var m, inp = h('input.inp', { value: opts.value || '', placeholder: opts.placeholder || '' });
      var done = function (v) { resolve(v); m.close(); }; // resolve first: close() fires onClose (cancel)
      var el = h('div.modal.small',
        h('div.modal-head', h('h3', { text: opts.title || '' })),
        h('div.modal-body', inp),
        h('div.modal-foot',
          h('button.btn.ghost', { text: 'Batal', onclick: function () { done(null); } }),
          h('button.btn.primary', { text: opts.ok || 'Simpan', onclick: function () { done(inp.value.trim()); } })));
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(inp.value.trim()); });
      m = UI.modal(el, { onClose: function () { resolve(null); } });
      setTimeout(function () { inp.focus(); inp.select(); }, 30);
    });
  };

  // ---------------------------------------------------------------- appearance
  /* Mode ringan: perangkat lemah (≤ 4 inti CPU atau ≤ 4 GB RAM) atau dipilih pengguna. */
  UI.weakDevice = function () {
    var cores = navigator.hardwareConcurrency || 8, mem = navigator.deviceMemory || 8;
    return cores <= 4 || mem <= 4 || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  UI.isLite = function () {
    var p = (Store.settings.appearance || {}).perf || 'auto';
    return p === 'lite' || (p === 'auto' && UI.weakDevice());
  };

  UI.applyAppearance = function () {
    var a = Store.settings.appearance || {};
    var rootEl = document.documentElement;
    if (a.theme === 'light' || a.theme === 'dark') rootEl.setAttribute('data-theme', a.theme); else rootEl.removeAttribute('data-theme');
    var glass = a.glass || 'glass';
    if (Store.info.reduceTransparency) glass = 'solid';
    var lite = UI.isLite();
    if (lite && glass !== 'solid' && a.perf !== 'full') glass = 'solid';
    rootEl.classList.toggle('lite', lite);
    rootEl.setAttribute('data-glass', glass);
    rootEl.style.setProperty('--accent', a.accent || '#6e6bff');
    rootEl.style.setProperty('--fs', (a.fontSize || 14) + 'px');
    Native.call('app.setAppearance', { mode: a.theme || 'system' }).catch(function () {});
    Native.call('app.setGlass', { mode: glass }).catch(function () {});
  };

  // ---------------------------------------------------------------- window drag regions
  var lastDrag = '';
  UI.syncDrag = U.throttle(function () {
    var drag = [], noDrag = [];
    if (!openOverlays.length) {
      UI.$$('.drag').forEach(function (d) {
        var r = d.getBoundingClientRect();
        if (r.width && r.height) drag.push([r.left, r.top, r.width, r.height]);
        UI.$$('button, input, a, select, textarea, .no-drag', d).forEach(function (n) {
          var q = n.getBoundingClientRect();
          if (q.width && q.height) noDrag.push([q.left - 2, q.top - 2, q.width + 4, q.height + 4]);
        });
      });
    }
    var key = JSON.stringify([drag, noDrag]);
    if (key === lastDrag) return;
    lastDrag = key;
    Native.call('app.setDragRegions', { drag: drag, noDrag: noDrag }).catch(function () {});
  }, 120);

  window.addEventListener('resize', function () { UI.syncDrag(); });

  window.UI = UI;
})();
