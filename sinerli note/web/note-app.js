/* Sinerli Note — Copyright © 2026 Gadtan x Gallen. All rights reserved.
 * Kerangka aplikasi: rel workspace, sidebar pohon halaman, bar atas,
 * pencarian, sampah, template, komentar, peek baris database, ekspor/impor. */
(function () {
  'use strict';
  var doc = document, esc = SN.esc;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var cur = null, hist = [], fwd = [], peekId = null, cmtPanel = null;
  var expanded = {};
  try { expanded = JSON.parse(SN.store.get('n_expanded', '{}')) || {}; } catch (e) {}
  function favKey() { return 'n_fav_' + (NS.ws && (NS.ws.id || NS.ws.localId)); }
  function favs() { try { return JSON.parse(SN.store.get(favKey(), '[]')) || []; } catch (e) { return []; } }
  function setFavs(a) { SN.store.set(favKey(), JSON.stringify(a)); }

  /* ====================================================== kerangka */
  function shell() {
    var root = $('#nRoot') || doc.body.insertBefore(SN.el('div', { id: 'nRoot' }), doc.body.firstChild);
    root.innerHTML =
      '<div class="n-app">' +
      '<nav class="n-rail" id="nRail"></nav>' +
      '<aside class="n-side" id="nSide">' +
        '<div class="n-side-head"><button class="n-ws-name" id="nWsName"></button><button class="n-ib" id="nSideClose" data-sn-tip="n_hide_sidebar">«</button></div>' +
        '<div class="n-side-acts">' +
          '<button class="n-side-item" id="nSearchBtn"><i>⌕</i><span data-sn-t="n_search"></span><kbd>⌘K</kbd></button>' +
          '<button class="n-side-item" id="nNewBtn"><i>✎</i><span data-sn-t="n_new_page"></span><kbd>⌘N</kbd></button>' +
        '</div>' +
        '<div class="n-side-scroll" id="nTree"></div>' +
        '<div class="n-side-foot"><button class="n-side-item" id="nTrashBtn" style="flex:1"><i>🗑</i><span data-sn-t="n_trash"></span></button><button class="n-ib" id="nImportBtn" data-sn-tip="n_import">⬆</button><span id="nAcct"></span></div>' +
        '<div class="n-side-resize" id="nResize"></div>' +
      '</aside>' +
      '<main class="n-main" id="nMain">' +
        '<header class="n-top"><button class="n-ib n-hamb" id="nHamb">☰</button><button class="n-ib" id="nSideOpen" hidden>»</button>' +
          '<button class="n-ib" id="nBack" data-sn-tip="n_back">‹</button><button class="n-ib" id="nFwd" data-sn-tip="n_forward">›</button>' +
          '<div class="n-crumbs" id="nCrumbs"></div>' +
          '<span class="n-sync" id="nSync"></span><div class="sn-presence" id="nPeers"></div>' +
          '<button class="n-btn" id="nShare"><span data-sn-t="sn_share"></span></button>' +
          '<button class="n-ib" id="nCmtBtn" data-sn-tip="n_comments">💬</button><button class="n-ib" id="nFav" data-sn-tip="n_favorite">☆</button><button class="n-ib" id="nMore" data-sn-tip="n_more">⋯</button>' +
        '</header>' +
        '<div class="n-scroll" id="nScroll"><div id="nPage"></div></div>' +
      '</main></div>';
    SN.applyI18n();
    SN.ui.accountButton($('#nAcct'));
    var w = +SN.store.get('n_side_w', 0); if (w) $('#nSide').style.setProperty('--side-w', w + 'px');
    if (SN.store.get('n_side_hidden') === '1' && innerWidth > 820) toggleSide(false);
    if (innerWidth <= 820) $('#nSide').classList.add('is-hidden');
    bindShell();
  }
  function toggleSide(show) {
    var s = $('#nSide');
    if (show === undefined) show = s.classList.contains('is-hidden');
    s.classList.toggle('is-hidden', !show);
    $('#nSideOpen').hidden = show || innerWidth <= 820;
    if (innerWidth > 820) SN.store.set('n_side_hidden', show ? '0' : '1');
  }

  /* ====================================================== rel workspace */
  function rail() {
    var r = $('#nRail');
    r.innerHTML = NS.wsList.map(function (w) { return '<button class="n-ws-dot' + (NS.ws && String(NS.ws.id) === String(w.id) ? ' is-on' : '') + '" data-ws="' + w.id + '" style="background:' + w.color + '" title="' + esc(w.name) + (w.shared ? ' · ' + SN.t('n_shared') : '') + '">' + esc((w.name || '?').trim().charAt(0).toUpperCase()) + '</button>'; }).join('') +
      '<button class="n-rail-btn" id="nWsAdd" title="' + esc(SN.t('n_ws_new')) + '">＋</button><button class="n-rail-btn" id="nWsJoin" title="' + esc(SN.t('n_ws_join')) + '">⇲</button><span class="n-rail-sp"></span>';
    $('#nWsName').textContent = NS.ws ? NS.ws.name : '';
  }

  /* ====================================================== pohon halaman */
  function tree() {
    var box = $('#nTree');
    var f = favs().filter(function (id) { var p = NS.page(id); return p && !NS.isTrashed(p); });
    var row = function (p, d) {
      var kids = NS.childPages(p.id).filter(function (c) { return !c.trashed; });
      var isDbRows = p.isDb;
      var open = expanded[p.id] && !isDbRows;
      var h = '<div class="n-tree-row' + (p.id === cur ? ' is-cur' : '') + '" data-id="' + p.id + '" style="--d:' + d + '" draggable="true">' +
        '<button class="n-tw" data-tw="' + p.id + '">' + (isDbRows ? '' : open ? '▾' : '▸') + '</button><span class="n-tree-ic">' + esc(NS.icon(p)) + '</span><span class="n-tree-t">' + esc(NS.title(p)) + '</span>' +
        '<span class="n-row-acts"><button class="n-ib" data-pm="' + p.id + '">⋯</button>' + (isDbRows ? '' : '<button class="n-ib" data-padd="' + p.id + '">＋</button>') + '</span></div>';
      if (open) h += kids.length ? kids.map(function (c) { return row(c, d + 1); }).join('') : '<div class="n-empty-tree" style="--d:' + d + '">' + esc(SN.t('n_no_pages')) + '</div>';
      return h;
    };
    var roots = NS.childPages('').filter(function (p) { return !p.trashed; });
    box.innerHTML = (f.length ? '<div class="n-sec"><div class="n-sec-h"><span data-sn-t="n_favorites"></span></div>' + f.map(function (id) { return row(NS.page(id), 0); }).join('') + '</div>' : '') +
      '<div class="n-sec"><div class="n-sec-h"><span>' + esc(NS.ws && NS.ws.shared ? SN.t('n_shared') : SN.t('n_pages')) + '</span><button class="n-ib" data-padd="">＋</button></div>' +
      (roots.length ? roots.map(function (p) { return row(p, 0); }).join('') : '<div class="n-empty-tree">' + esc(SN.t('n_no_pages')) + '</div>') + '</div>' +
      '<div class="n-sec"><div class="n-sec-h"><span data-sn-t="n_templates"></span></div><button class="n-side-item" id="nTplBtn"><i>✦</i><span data-sn-t="n_browse_templates"></span></button></div>';
    SN.applyI18n(box);
  }
  function expandTo(pid) { NS.path(pid).slice(0, -1).forEach(function (p) { expanded[p.id] = 1; }); SN.store.set('n_expanded', JSON.stringify(expanded)); }

  /* ====================================================== navigasi */
  function go(pid, noHist) {
    var p = NS.page(pid);
    if (!p) return;
    NE.flush();
    if (cur && cur !== pid && !noHist) { hist.push(cur); fwd = []; }
    cur = pid;
    closePeek();
    SN.store.set('n_last_' + (NS.ws && NS.ws.id), pid);
    expandTo(pid);
    renderPage();
    tree();
    $('#nScroll').scrollTop = 0;
    if (innerWidth <= 820) $('#nSide').classList.add('is-hidden');
    if (NS.room) NS.room.setCursor({ page: pid, block: '' });
  }
  function renderPage() {
    var host = $('#nPage');
    if (!cur || !NS.page(cur) || NS.isTrashed(NS.page(cur))) {
      var first = NS.childPages('').find(function (p) { return !p.trashed; });
      if (first && cur !== first.id) { cur = first.id; return renderPage(); }
      cur = null;
      host.innerHTML = '<div class="n-welcome"><h1>' + esc(SN.t('n_empty_ws')) + '</h1><p>' + esc(SN.t('n_empty_ws_sub')) + '</p><button class="n-btn n-btn-p" id="nFirstPage">' + esc(SN.t('n_new_page')) + '</button></div>';
      $('#nFirstPage').onclick = function () { go(NS.newPage('')); };
      crumbs(); return;
    }
    NE.render(host, cur, { templates: templatesBlock });
    crumbs();
    var p = NS.page(cur);
    $('#nFav').textContent = favs().indexOf(cur) >= 0 ? '★' : '☆';
    doc.title = NS.title(p) + ' · Sinerli Note';
  }
  function crumbs() {
    var c = $('#nCrumbs');
    var path = cur ? NS.path(cur) : [];
    c.innerHTML = path.map(function (p, i) { return (i ? '<span class="n-crumb-sep">/</span>' : '') + '<button class="n-crumb" data-go="' + p.id + '">' + esc(NS.icon(p)) + ' ' + esc(NS.title(p)) + '</button>'; }).join('') +
      (cur && NS.page(cur).locked ? '<span class="n-crumb-sep">🔒</span>' : '');
    $('#nBack').disabled = !hist.length; $('#nFwd').disabled = !fwd.length;
  }

  /* ====================================================== template */
  var TPLS = ['blank', 'meeting', 'todo', 'docs', 'journal', 'roadmap', 'wiki', 'reading'];
  var TPL_ICON = { blank: '📄', meeting: '🗓', todo: '✅', docs: '📘', journal: '📓', roadmap: '🗺', wiki: '🏛', reading: '📚' };
  function templatesBlock(pid) {
    var w = SN.el('div');
    w.innerHTML = '<div class="n-start-h">' + esc(SN.t('n_start_with')) + '</div><div class="n-tpls">' + TPLS.map(function (t) { return '<button class="n-tpl" data-tpl="' + t + '"><i>' + TPL_ICON[t] + '</i><b>' + esc(SN.t('n_tpl_' + t)) + '</b><small>' + esc(SN.t('n_tpld_' + t)) + '</small></button>'; }).join('') + '</div>';
    w.addEventListener('click', function (e) { var b = e.target.closest('[data-tpl]'); if (b) { applyTemplate(pid, b.dataset.tpl); renderPage(); tree(); } });
    return w;
  }
  function applyTemplate(pid, t) {
    var add = function (type, html, extra, parent) { return NS.newBlock(pid, parent || '', null, Object.assign({ type: type, html: html || '' }, extra || {})); };
    var T = function (k) { return SN.t('n_tx_' + k); };
    var today = new Date().toLocaleDateString(SN.lang === 'id' ? 'id-ID' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    NS.set(pid, { icon: TPL_ICON[t], title: t === 'journal' ? today : t === 'blank' ? '' : SN.t('n_tpl_' + t) });
    if (t === 'blank') { add('text', ''); return; }
    if (t === 'meeting') { add('callout', T('meeting_info'), { icon: '📍', bg: 'blue' }); add('h2', T('agenda')); add('number', ''); add('h2', T('notes')); add('bullet', ''); add('h2', T('actions')); add('todo', ''); }
    if (t === 'todo') { add('h3', T('today')); add('todo', ''); add('todo', ''); add('h3', T('later')); add('todo', ''); add('toggle', T('done_items')); }
    if (t === 'docs') { add('toc'); add('h1', T('overview')); add('text', T('overview_tx')); add('h2', T('goals')); add('bullet', ''); add('h2', T('spec')); add('text', ''); add('code', '', { lang: 'javascript' }); add('h2', T('faq')); add('toggle', T('question')); }
    if (t === 'journal') { add('callout', T('mood'), { icon: '🌤', bg: 'yellow' }); add('h3', T('grateful')); add('number', ''); add('h3', T('highlights')); add('text', ''); add('h3', T('tomorrow')); add('todo', ''); }
    if (t === 'roadmap' || t === 'reading') {
      var db = NS.newPage(pid, NS.dbTemplate('tasks'));
      NS.set(db, { title: SN.t('n_tpl_' + t), icon: TPL_ICON[t] });
      add('text', T(t + '_tx'));
      add('dblink', '', { ref: db });
      NS.seedRows(db, 'tasks');
      var d = NS.page(db);
      var v = JSON.parse(JSON.stringify(d.views)); if (t === 'roadmap') v.unshift(v.splice(1, 1)[0]); else v.push({ id: 'v4', name: SN.t('n_view_gallery'), type: 'gallery' });
      NS.set(db, { views: v });
    }
    if (t === 'wiki') { add('callout', T('wiki_tx'), { icon: '🏛', bg: 'purple' }); var c = add('cols'); ['onboarding', 'process', 'tools'].slice(0, 2).forEach(function (k) { var col = add('col', '', null, c); NS.newBlock(pid, col, null, { type: 'h3', html: T(k) }); NS.newBlock(pid, col, null, { type: 'page', ref: NS.newPage(pid, { title: T(k), icon: '📄' }) }); }); }
  }
  function templateGallery() {
    var m = modal('<div class="n-modal-h"><span>' + esc(SN.t('n_templates')) + '</span><button class="n-ib" data-x>✕</button></div><div class="n-modal-b"><div class="n-tpls">' + TPLS.map(function (t) { return '<button class="n-tpl" data-tpl="' + t + '"><i>' + TPL_ICON[t] + '</i><b>' + esc(SN.t('n_tpl_' + t)) + '</b><small>' + esc(SN.t('n_tpld_' + t)) + '</small></button>'; }).join('') + '</div></div>');
    m.addEventListener('click', function (e) { var b = e.target.closest('[data-tpl]'); if (!b) return; closeModal(); var id = NS.newPage(''); applyTemplate(id, b.dataset.tpl); go(id); });
  }

  /* ====================================================== modal umum */
  var modalEl = null;
  function modal(html, wide) {
    closeModal();
    modalEl = SN.el('div', { class: 'n-modal-bd' }, '<div class="n-modal"' + (wide ? ' style="width:min(820px,100%)"' : '') + '>' + html + '</div>');
    doc.body.appendChild(modalEl);
    modalEl.addEventListener('mousedown', function (e) { if (e.target === modalEl) closeModal(); });
    modalEl.addEventListener('click', function (e) { if (e.target.closest('[data-x]')) closeModal(); });
    return modalEl.firstChild;
  }
  function closeModal() { if (modalEl) { modalEl.remove(); modalEl = null; } }

  /* ====================================================== pencarian */
  function search() {
    var m = modal('<input class="n-modal-in" placeholder="' + esc(SN.t('n_search_ph')) + '"><div class="n-modal-list"></div>');
    var inp = m.querySelector('input'), list = m.querySelector('.n-modal-list'), idx = 0, res = [];
    var paint = function () {
      var q = inp.value.trim().toLowerCase();
      var pages = NS.allPages().filter(function (p) { return !NS.isTrashed(p); });
      res = pages.map(function (p) {
        var t = NS.title(p).toLowerCase(), body = q ? NS.pageText(p.id).toLowerCase() : '';
        var score = !q ? (p.edited || p.created || 0) : t.indexOf(q) === 0 ? 3e13 : t.indexOf(q) >= 0 ? 2e13 : body.indexOf(q) >= 0 ? 1e13 : -1;
        var snip = q && body.indexOf(q) >= 0 ? NS.pageText(p.id).substr(Math.max(0, body.indexOf(q) - 30), 90) : NS.path(p.id).slice(0, -1).map(NS.title).join(' / ');
        return { p: p, s: score + (p.edited || 0) / 1e3, snip: snip };
      }).filter(function (r) { return r.s >= 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 40);
      idx = Math.min(idx, Math.max(0, res.length - 1));
      list.innerHTML = (!q ? '<div class="n-pop-h">' + esc(SN.t('n_recent')) + '</div>' : '') + (res.length ? res.map(function (r, i) { return '<div class="n-res' + (i === idx ? ' is-act' : '') + '" data-i="' + i + '"><span>' + esc(NS.icon(r.p)) + '</span><div><b>' + esc(NS.title(r.p)) + '</b><small>' + esc(r.snip) + '</small></div></div>'; }).join('') : '<div class="n-pop-h">' + esc(SN.t('n_no_result')) + '</div>');
    };
    paint();
    inp.focus();
    inp.addEventListener('input', function () { idx = 0; paint(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + res.length) % Math.max(1, res.length); paint(); var a = list.querySelector('.is-act'); if (a) a.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter' && res[idx]) { closeModal(); go(res[idx].p.id); }
      if (e.key === 'Escape') closeModal();
    });
    list.addEventListener('click', function (e) { var r = e.target.closest('[data-i]'); if (r) { closeModal(); go(res[+r.dataset.i].p.id); } });
  }

  /* ====================================================== sampah */
  function trash() {
    var m = modal('<div class="n-modal-h"><span>🗑 ' + esc(SN.t('n_trash')) + '</span><button class="n-ib" data-x>✕</button></div><div class="n-modal-b"></div>');
    var b = m.querySelector('.n-modal-b');
    var paint = function () {
      var t = NS.allPages().filter(function (p) { return p.trashed; }).sort(function (a, b2) { return b2.trashed - a.trashed; });
      b.innerHTML = t.length ? t.map(function (p) { return '<div class="n-trash-row"><span>' + esc(NS.icon(p)) + ' ' + esc(NS.title(p)) + ' <small style="color:var(--n-faint)">' + esc(NE.ago(p.trashed)) + '</small></span><button class="n-btn" data-restore="' + p.id + '">' + esc(SN.t('n_restore')) + '</button><button class="n-btn" data-destroy="' + p.id + '" style="color:var(--c-red)">' + esc(SN.t('n_delete_forever')) + '</button></div>'; }).join('') : '<p style="color:var(--n-faint)">' + esc(SN.t('n_trash_empty')) + '</p>';
    };
    paint();
    b.addEventListener('click', async function (e) {
      var r = e.target.closest('[data-restore]'), d = e.target.closest('[data-destroy]');
      if (r) { NS.restorePage(r.dataset.restore); paint(); tree(); }
      if (d && await SN.ui.confirm(SN.t('n_delete_forever_q'))) { NS.destroyPage(d.dataset.destroy); paint(); tree(); }
    });
  }

  /* ====================================================== menu halaman */
  function pageMenu(anchor, pid) {
    var p = NS.page(pid); if (!p) return;
    var isFav = favs().indexOf(pid) >= 0;
    var el = NE.popAt(anchor,
      NE.mi('data-m="fav"', isFav ? '★' : '☆', SN.t(isFav ? 'n_unfavorite' : 'n_favorite'), '', '', true) +
      NE.mi('data-m="dup"', '⧉', SN.t('n_duplicate'), '', '', true) + NE.mi('data-m="rename"', '✎', SN.t('n_rename'), '', '', true) +
      NE.mi('data-m="move"', '↪', SN.t('n_move_to'), '', '', true) + NE.mi('data-m="link"', '🔗', SN.t('n_copy_link'), '', '', true) +
      '<div class="n-sep"></div>' + NE.mi('data-m="del"', '🗑', SN.t('n_move_trash'), '', '', true).replace('n-mi', 'n-mi is-danger'));
    el.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-m]'); if (!b) return;
      NE.closePop();
      var m = b.dataset.m;
      if (m === 'fav') { var f = favs(); setFavs(isFav ? f.filter(function (x) { return x !== pid; }) : f.concat([pid])); tree(); renderPage(); }
      if (m === 'dup') { var n = NS.duplicatePage(pid); tree(); go(n); }
      if (m === 'rename') { var v = await SN.ui.prompt(SN.t('n_rename'), p.title || ''); if (v !== null) { NS.set(pid, { title: v }); tree(); if (pid === cur) renderPage(); } }
      if (m === 'move') movePicker({ page: pid });
      if (m === 'link') { navigator.clipboard.writeText('sinerli-note://open?ws=' + NS.ws.id + '&page=' + pid); SN.ui.toast(SN.t('n_copied')); }
      if (m === 'del') { NS.trashPage(pid); SN.ui.toast(SN.t('n_trashed')); if (pid === cur || NS.path(cur).some(function (x) { return x.id === pid; })) { cur = p.parent && NS.page(p.parent) ? p.parent : null; renderPage(); } tree(); }
    });
  }
  function movePicker(what) {
    var m = modal('<input class="n-modal-in" placeholder="' + esc(SN.t('n_move_to_ph')) + '"><div class="n-modal-list"></div>');
    var inp = m.querySelector('input'), list = m.querySelector('.n-modal-list');
    var paint = function () {
      var q = inp.value.toLowerCase();
      var pages = NS.allPages().filter(function (p) { return !NS.isTrashed(p) && p.id !== what.page && !(what.page && NS.path(p.id).some(function (x) { return x.id === what.page; })) && NS.title(p).toLowerCase().indexOf(q) >= 0 && !(what.block && p.isDb); });
      list.innerHTML = (what.page ? '<div class="n-res" data-to=""><span>⌂</span><div><b>' + esc(SN.t('n_root')) + '</b></div></div>' : '') + pages.slice(0, 50).map(function (p) { return '<div class="n-res" data-to="' + p.id + '"><span>' + esc(NS.icon(p)) + '</span><div><b>' + esc(NS.title(p)) + '</b><small>' + esc(NS.path(p.id).slice(0, -1).map(NS.title).join(' / ')) + '</small></div></div>'; }).join('');
    };
    paint(); inp.focus();
    inp.addEventListener('input', paint);
    list.addEventListener('click', function (e) {
      var r = e.target.closest('[data-to]'); if (!r) return;
      closeModal();
      if (what.page) { NS.movePage(what.page, r.dataset.to); tree(); renderPage(); }
      if (what.block) { NE.moveBlockToPage(what.block, r.dataset.to); }
      SN.ui.toast(SN.t('n_moved'));
    });
  }
  function moreMenu(anchor) {
    var p = NS.page(cur); if (!p) return;
    var el = NE.popAt(anchor,
      '<div class="n-pop-h">' + esc(SN.t('n_style')) + '</div><div class="sn-seg" style="margin:0 4px 6px">' + [['', 'Default'], ['serif', 'Serif'], ['mono', 'Mono']].map(function (f) { return '<button data-font="' + f[0] + '" class="' + ((p.font || '') === f[0] ? 'is-on' : '') + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      NE.mi('data-m="small"', p.small ? '✓' : 'a', SN.t('n_small_text'), '', '', true) + NE.mi('data-m="full"', p.full ? '✓' : '↔', SN.t('n_full_width'), '', '', true) +
      NE.mi('data-m="lock"', p.locked ? '🔓' : '🔒', SN.t(p.locked ? 'n_unlock' : 'n_lock'), '', '', true) + '<div class="n-sep"></div>' +
      NE.mi('data-m="dup"', '⧉', SN.t('n_duplicate'), '', '', true) + NE.mi('data-m="move"', '↪', SN.t('n_move_to'), '', '', true) +
      NE.mi('data-m="md"', '⬇', SN.t('n_export_md'), '', '', true) + NE.mi('data-m="html"', '⬇', SN.t('n_export_html'), '', '', true) + NE.mi('data-m="pdf"', '⬇', SN.t('n_export_pdf'), '', '', true) +
      NE.mi('data-m="import"', '⬆', SN.t('n_import_md'), '', '', true) + NE.mi('data-m="ws"', '⚙', SN.t('n_ws_settings'), '', '', true) + '<div class="n-sep"></div>' +
      NE.mi('data-m="del"', '🗑', SN.t('n_move_trash'), '', '', true).replace('n-mi', 'n-mi is-danger') +
      '<div class="n-pop-h" style="text-transform:none;font-weight:400">' + esc(SN.t('n_words', { n: wordCount(cur) })) + (p.edited ? ' · ' + esc(SN.t('n_edited_by', { who: p.ebyName || '', when: NE.ago(p.edited) })) : '') + '</div>');
    el.addEventListener('click', function (e) {
      var f = e.target.closest('[data-font]');
      if (f) { NS.set(cur, { font: f.dataset.font }); NE.closePop(); renderPage(); return; }
      var b = e.target.closest('[data-m]'); if (!b) return;
      NE.closePop();
      var m = b.dataset.m;
      if (m === 'small') NS.set(cur, { small: !p.small });
      if (m === 'full') NS.set(cur, { full: !p.full });
      if (m === 'lock') NS.set(cur, { locked: !p.locked });
      if (m === 'dup') { go(NS.duplicatePage(cur)); return; }
      if (m === 'move') { movePicker({ page: cur }); return; }
      if (m === 'md') SN.saveFile(safeName(NS.title(p)) + '.md', new Blob([NE.pageMarkdown(cur)], { type: 'text/markdown' }));
      if (m === 'html') SN.saveFile(safeName(NS.title(p)) + '.html', new Blob([exportHtml(cur)], { type: 'text/html' }));
      if (m === 'pdf') exportPdf();
      if (m === 'import') importMd(cur);
      if (m === 'ws') wsSettings();
      if (m === 'del') { NS.trashPage(cur); cur = p.parent && NS.page(p.parent) ? p.parent : null; tree(); }
      renderPage();
    });
  }
  function wordCount(pid) { var t = NS.pageText(pid).trim(); return t ? t.split(/\s+/).length : 0; }
  function safeName(s) { return String(s || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80); }
  function exportHtml(pid) {
    var page = $('#nPage').cloneNode(true);
    page.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
    page.querySelectorAll('.nb-gut, .n-head-acts, .n-addline, .ndb-tools, .n-cover-acts').forEach(function (n) { n.remove(); });
    var css = Array.prototype.map.call(doc.styleSheets, function (s) { try { return Array.prototype.map.call(s.cssRules, function (r) { return r.cssText; }).join('\n'); } catch (e) { return ''; } }).join('\n');
    return '<!doctype html><html lang="' + SN.lang + '" data-sn-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(NS.title(NS.page(pid))) + '</title><style>' + css + ' body{overflow:auto}</style></head><body>' + page.innerHTML + '</body></html>';
  }
  async function exportPdf() {
    SN.ui.toast(SN.t('n_exporting'));
    var page = $('#nPage .n-page');
    try {
      var canvas = await html2canvas(page, { scale: 1.6, backgroundColor: getComputedStyle(doc.body).backgroundColor, useCORS: true });
      var pdf = new jspdf.jsPDF({ unit: 'pt', format: 'a4' });
      var W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), m = 28;
      var w = W - m * 2, scale = w / canvas.width, sliceH = Math.floor((H - m * 2) / scale);
      for (var y = 0, n = 0; y < canvas.height; y += sliceH, n++) {
        var c = doc.createElement('canvas'); c.width = canvas.width; c.height = Math.min(sliceH, canvas.height - y);
        c.getContext('2d').drawImage(canvas, 0, -y);
        if (n) pdf.addPage();
        pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', m, m, w, c.height * scale);
      }
      SN.saveFile(safeName(NS.title(NS.page(cur))) + '.pdf', pdf.output('blob'));
    } catch (e) { SN.ui.toast(e.message, 'err'); }
  }
  async function importMd(parent) {
    var f = await NE.pickFile('.md,.markdown,.txt,text/markdown,text/plain');
    if (!f) return;
    var txt = await f.text();
    var lines = txt.split('\n'), title = f.name.replace(/\.(md|markdown|txt)$/i, '');
    if (/^#\s+/.test(lines[0])) { title = lines.shift().replace(/^#\s+/, ''); }
    var pid = NS.newPage(parent || '', { title: title, icon: '📄' });
    NE.parseMarkdown(lines.join('\n')).forEach(function (b) { NS.newBlock(pid, '', null, b); });
    tree(); go(pid);
    SN.ui.toast(SN.t('n_imported'));
  }
  function wsSettings() {
    var m = modal('<div class="n-modal-h"><span>⚙ ' + esc(SN.t('n_ws_settings')) + '</span><button class="n-ib" data-x>✕</button></div><div class="n-modal-b">' +
      '<label class="sn-panel-lbl">' + esc(SN.t('n_ws_name')) + '</label><input class="sn-input" id="nWsRename" value="' + esc(NS.ws.name) + '">' +
      '<label class="sn-panel-lbl">' + esc(SN.t('n_stats')) + '</label><p style="margin:0;color:var(--n-muted)">' + esc(SN.t('n_stats_tx', { pages: NS.allPages().filter(function (p) { return !p.trashed; }).length, size: Math.round(JSON.stringify(NS.ents).length / 1024) })) + '</p>' +
      '<div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap"><button class="n-btn" data-a="share">' + esc(SN.t('sn_share')) + '</button><button class="n-btn" data-a="export">' + esc(SN.t('n_export_ws')) + '</button>' + (NS.ws.shared ? '' : '<button class="n-btn" data-a="del" style="color:var(--c-red)">' + esc(SN.t('n_ws_delete')) + '</button>') + '</div></div>');
    m.querySelector('#nWsRename').addEventListener('change', function (e) { NS.renameWorkspace(e.target.value.trim() || NS.ws.name); rail(); });
    m.addEventListener('click', async function (e) {
      var a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'share') { closeModal(); SN.shareDialog(NS.ws.id); }
      if (a.dataset.a === 'export') exportWorkspace();
      if (a.dataset.a === 'del' && await SN.ui.confirm(SN.t('n_ws_delete_q', { name: NS.ws.name }))) { closeModal(); await NS.deleteWorkspace(); await boot(); }
    });
  }
  async function exportWorkspace() {
    var zip = new JSZip();
    NS.allPages().filter(function (p) { return !NS.isTrashed(p); }).forEach(function (p) {
      var path = NS.path(p.id).map(function (x) { return safeName(NS.title(x)); }).join('/');
      zip.file(path + '.md', NE.pageMarkdown(p.id));
    });
    SN.saveFile(safeName(NS.ws.name) + '.zip', await zip.generateAsync({ type: 'blob' }));
  }

  /* ====================================================== peek & komentar */
  function peek(pid) {
    closePeek();
    peekId = pid;
    var el = SN.el('div', { class: 'n-peek' });
    el.innerHTML = '<header class="n-top"><button class="n-ib" data-close>✕</button><button class="n-btn" data-full>↗ ' + esc(SN.t('n_open_full')) + '</button><span style="flex:1"></span></header><div class="n-scroll"><div class="n-peek-page"></div></div>';
    doc.body.appendChild(el);
    var root = NE.root, pidSave = NE.pid;
    NE.render(el.querySelector('.n-peek-page'), pid, {});
    el._restore = function () { NE.pid = pidSave; NE.root = root; NE.container = $('#nPage'); };
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closePeek();
      if (e.target.closest('[data-full]')) { var id = peekId; closePeek(); go(id); }
    });
  }
  function closePeek() {
    var el = $('.n-peek'); if (!el) return;
    NE.flush();
    el._restore && el._restore();
    el.remove(); peekId = null;
    NDB.refreshAll();
  }
  function comments(o) {
    if (cmtPanel) { cmtPanel.remove(); cmtPanel = null; if (!o) return; }
    var page = (o && o.page) || cur;
    cmtPanel = SN.el('aside', { class: 'n-cmts' });
    var paint = function () {
      var list = Object.keys(NS.ents).map(function (k) { return NS.ents[k]; }).filter(function (c) { return c.kind === 'cmt' && !c._del && c.page === page; }).sort(function (a, b) { return a.at - b.at; });
      cmtPanel.innerHTML = '<div class="n-modal-h"><span>💬 ' + esc(SN.t('n_comments')) + '</span><button class="n-ib" data-x>✕</button></div><div style="flex:1;overflow-y:auto">' +
        (list.length ? list.map(function (c) { return '<div class="n-cmt" style="' + (c.resolved ? 'opacity:.55' : '') + '"><b>' + esc(c.name || c.by) + '</b><small>' + esc(NE.ago(c.at)) + '</small>' + (c.quote ? '<q>' + esc(c.quote) + '</q>' : '') + '<div>' + esc(c.body) + '</div><div style="margin-top:4px;display:flex;gap:8px">' + (c.block ? '<button class="sn-link" data-jump="' + c.block + '" style="padding:0">' + esc(SN.t('n_show')) + '</button>' : '') + '<button class="sn-link" data-res="' + c.id + '" style="padding:0">' + esc(SN.t(c.resolved ? 'n_reopen' : 'n_resolve')) + '</button>' + (c.by === SN.ctx.email ? '<button class="sn-link sn-danger" data-del="' + c.id + '" style="padding:0">' + esc(SN.t('n_delete')) + '</button>' : '') + '</div></div>'; }).join('') : '<p style="padding:14px;color:var(--n-faint)">' + esc(SN.t('n_no_comments')) + '</p>') +
        '</div><form class="n-cmt-form">' + (o && o.quote ? '' : '') + '<input placeholder="' + esc(SN.t(o && o.block ? 'n_comment_block' : 'n_comment_page')) + '"><button class="n-btn n-btn-p">' + esc(SN.t('n_send')) + '</button></form>';
      var f = cmtPanel.querySelector('form');
      f.onsubmit = function (e) {
        e.preventDefault();
        var v = f.querySelector('input').value.trim(); if (!v) return;
        NS.set(NS.uid('c'), { kind: 'cmt', page: page, block: (o && o.block) || '', quote: (o && o.quote) || '', body: v, by: SN.ctx.email, name: SN.ctx.name || SN.ctx.email, at: Date.now() });
        if (o && o.block) { var b = NS.get(o.block); if (b) NS.set(b.id, { cmts: (b.cmts || 0) + 1 }); }
        o = { page: page };
        paint(); NE.refresh();
      };
      setTimeout(function () { var i = f.querySelector('input'); if (i) i.focus(); }, 20);
    };
    paint();
    cmtPanel.addEventListener('click', function (e) {
      if (e.target.closest('[data-x]')) { cmtPanel.remove(); cmtPanel = null; return; }
      var r = e.target.closest('[data-res]'), d = e.target.closest('[data-del]');
      if (r) { var c = NS.get(r.dataset.res); NS.set(c.id, { resolved: !c.resolved }); paint(); }
      if (d) { var c2 = NS.get(d.dataset.del); NS.remove(c2.id); if (c2.block && NS.get(c2.block)) NS.set(c2.block, { cmts: Math.max(0, (NS.get(c2.block).cmts || 1) - 1) }); paint(); NE.refresh(); }
    });
    doc.body.appendChild(cmtPanel);
    cmtPanel._paint = paint;
  }

  /* ====================================================== event kerangka */
  function bindShell() {
    $('#nRail').addEventListener('click', async function (e) {
      var w = e.target.closest('[data-ws]');
      if (w) { var ws = NS.wsList.find(function (x) { return String(x.id) === w.dataset.ws; }); if (ws && ws !== NS.ws) await openWs(ws); }
      if (e.target.closest('#nWsAdd')) { var n = await SN.ui.prompt(SN.t('n_ws_name'), ''); if (n !== null) { await NS.createWorkspace(n.trim()); rail(); cur = null; tree(); renderPage(); } }
      if (e.target.closest('#nWsJoin')) joinByLink();
    });
    $('#nWsName').onclick = wsSettings;
    $('#nSideClose').onclick = function () { toggleSide(false); };
    $('#nSideOpen').onclick = $('#nHamb').onclick = function () { toggleSide(true); };
    $('#nSearchBtn').onclick = search;
    $('#nNewBtn').onclick = function () { if (!NS.loading) go(NS.newPage('')); };
    $('#nTrashBtn').onclick = trash;
    $('#nImportBtn').onclick = function () { importMd(''); };
    $('#nShare').onclick = function () { SN.shareDialog(NS.ws && NS.ws.id); };
    $('#nFav').onclick = function () { if (!cur) return; var f = favs(), i = f.indexOf(cur); if (i >= 0) f.splice(i, 1); else f.push(cur); setFavs(f); tree(); renderPage(); };
    $('#nMore').onclick = function (e) { moreMenu(e.currentTarget); };
    $('#nCmtBtn').onclick = function () { comments(); };
    $('#nBack').onclick = function () { if (!hist.length) return; fwd.push(cur); go(hist.pop(), true); };
    $('#nFwd').onclick = function () { if (!fwd.length) return; hist.push(cur); go(fwd.pop(), true); };
    $('#nScroll').addEventListener('scroll', function () { $('#nMain').classList.toggle('is-scrolled', this.scrollTop > 4); });
    $('#nCrumbs').addEventListener('click', function (e) { var b = e.target.closest('[data-go]'); if (b) { e.stopPropagation(); go(b.dataset.go); } });
    var tr = $('#nTree');
    tr.addEventListener('click', function (e) {
      if (e.target.closest('#nTplBtn')) { templateGallery(); return; }
      var tw = e.target.closest('[data-tw]'), pm = e.target.closest('[data-pm]'), pa = e.target.closest('[data-padd]'), row = e.target.closest('.n-tree-row');
      if (tw) { var id = tw.dataset.tw; if (expanded[id]) delete expanded[id]; else expanded[id] = 1; SN.store.set('n_expanded', JSON.stringify(expanded)); tree(); return; }
      if (pm) { pageMenu(pm, pm.dataset.pm); return; }
      if (pa) { var parent = pa.dataset.padd; if (parent) expanded[parent] = 1; var nid = NS.newPage(parent); if (parent) { var host = NS.page(parent); if (host && !host.isDb) NS.newBlock(parent, '', null, { type: 'page', ref: nid }); } go(nid); return; }
      if (row) go(row.dataset.id);
    });
    tr.addEventListener('contextmenu', function (e) { var row = e.target.closest('.n-tree-row'); if (row) { e.preventDefault(); pageMenu(row, row.dataset.id); } });
    // seret halaman di pohon
    var dragPid = null;
    tr.addEventListener('dragstart', function (e) { var r = e.target.closest('.n-tree-row'); if (r) { dragPid = r.dataset.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragPid); } });
    tr.addEventListener('dragover', function (e) {
      var r = e.target.closest('.n-tree-row'); if (!r || !dragPid || r.dataset.id === dragPid) return;
      e.preventDefault();
      tr.querySelectorAll('.drop-in,.drop-before,.drop-after').forEach(function (x) { x.classList.remove('drop-in', 'drop-before', 'drop-after'); });
      var b = r.getBoundingClientRect(), y = e.clientY - b.top;
      r.classList.add(y < b.height * 0.28 ? 'drop-before' : y > b.height * 0.72 ? 'drop-after' : 'drop-in');
    });
    tr.addEventListener('drop', function (e) {
      var r = e.target.closest('.n-tree-row'); if (!r || !dragPid) return;
      e.preventDefault();
      var t = NS.page(r.dataset.id), how = r.classList.contains('drop-in') ? 'in' : r.classList.contains('drop-before') ? 'before' : 'after';
      if (how === 'in') { NS.movePage(dragPid, t.id); expanded[t.id] = 1; }
      else { var sib = NS.childPages(t.parent).filter(function (s) { return s.id !== dragPid; }), i = sib.findIndex(function (s) { return s.id === t.id; }); NS.movePage(dragPid, t.parent, how === 'before' ? t.id : (sib[i + 1] ? sib[i + 1].id : null)); }
      dragPid = null; tree(); crumbs();
    });
    tr.addEventListener('dragend', function () { dragPid = null; tr.querySelectorAll('.drop-in,.drop-before,.drop-after').forEach(function (x) { x.classList.remove('drop-in', 'drop-before', 'drop-after'); }); });
    // ubah lebar sidebar
    $('#nResize').addEventListener('pointerdown', function (e) {
      var s = $('#nSide'), x0 = e.clientX, w0 = s.offsetWidth;
      var mv = function (ev) { s.style.setProperty('--side-w', Math.max(200, Math.min(420, w0 + ev.clientX - x0)) + 'px'); };
      var up = function () { doc.removeEventListener('pointermove', mv); doc.removeEventListener('pointerup', up); SN.store.set('n_side_w', s.offsetWidth); };
      doc.addEventListener('pointermove', mv); doc.addEventListener('pointerup', up);
    });
    $('#nMain').addEventListener('click', function (e) { if (innerWidth <= 820 && !$('#nSide').classList.contains('is-hidden') && !e.target.closest('.n-top')) toggleSide(false); });
  }
  SN.on('share-link', function (token) { joinByLink(token); });
  async function joinByLink(direct) {
    var v = typeof direct === 'string' ? direct : await SN.ui.prompt(SN.t('n_ws_join_prompt'), '');
    var m = v && v.match(/([a-f0-9]{32})/i);
    if (!m) return;
    try {
      var r = await SN.Docs.openShared(m[1].toLowerCase());
      var p = r.project || r;
      var ws = { id: p.id, name: p.name, share: m[1].toLowerCase(), shared: true, color: '#3a72b8' };
      if (!NS.wsList.some(function (x) { return String(x.id) === String(ws.id); })) NS.wsList.push(ws);
      await openWs(ws);
    } catch (e) { SN.ui.toast(e.message, 'err'); }
  }
  doc.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === 'k' || e.key === 'p') && !e.target.closest('.nb-text')) { e.preventDefault(); search(); }
    else if (mod && e.key === 'k' && e.shiftKey) { e.preventDefault(); search(); }
    if (mod && e.key === 'n' && !e.shiftKey) { e.preventDefault(); if (!NS.loading) go(NS.newPage('')); }
    if (mod && e.key === '\\') { e.preventDefault(); toggleSide(); }
    if (mod && e.key === 's') { e.preventDefault(); NE.flush(); NS.saveNow(); }
    if (mod && e.key === '[') { e.preventDefault(); $('#nBack').click(); }
    if (mod && e.key === ']') { e.preventDefault(); $('#nFwd').click(); }
    if (e.key === 'Escape' && $('.n-peek') && !NE.isPopOpen()) closePeek();
  });

  /* ====================================================== sinkron UI */
  var renderQueued = false;
  NS.on('change', function (d) {
    if (d.local) { tree(); crumbs(); NDB.refreshAll(); return; }
    if (renderQueued) return;
    renderQueued = true;
    // setTimeout, bukan requestAnimationFrame: jendela yang tidak terlihat tetap mengikuti perubahan kolaborator.
    setTimeout(function () {
      renderQueued = false;
      tree();
      if (cur && !NS.page(cur)) { renderPage(); return; }
      var p = NS.page(cur);
      var title = $('#nPage .n-title');
      if (title && doc.activeElement !== title && title.textContent !== (p.title || '')) title.textContent = p.title || '';
      NE.refresh();
      NDB.refreshAll();
      crumbs();
      if (cmtPanel && cmtPanel._paint && !cmtPanel.contains(doc.activeElement)) cmtPanel._paint();
    }, 16);
  });
  NS.on('title', function (pid) { tree(); crumbs(); if (pid === cur) doc.title = NS.title(NS.page(pid)) + ' · Sinerli Note'; });
  NS.on('tree', tree);
  NS.on('go', go);
  NS.on('peek', function (id) { if (innerWidth <= 820) go(id); else peek(id); });
  NS.on('comment', comments);
  NS.on('movePicker', movePicker);
  NS.on('focusBlock', function (bid) { if (NS.room) NS.room.setCursor({ page: NE.pid, block: bid }); });
  NS.on('status', function (s) {
    var el = $('#nSync'); if (!el) return;
    el.className = 'n-sync' + (s === 'offline' ? ' is-off' : s === 'error' ? ' is-err' : '');
    el.textContent = SN.t({ ok: 'sn_saved', saving: 'sn_saving', offline: 'n_offline_saved', error: 'sn_save_err' }[s] || 'sn_saved');
  });
  NS.on('presence', function (peers) {
    NS.peersSeen = peers;
    var el = $('#nPeers'); if (!el) return;
    el.innerHTML = peers.slice(0, 5).map(function (p) { return '<span style="background:' + esc(p.color || '#888') + '" title="' + esc((p.display_name || p.user_email) + (p.cursor && p.cursor.page && NS.page(p.cursor.page) ? ' · ' + NS.title(NS.page(p.cursor.page)) : '')) + '">' + esc((p.display_name || p.user_email || '?').charAt(0).toUpperCase()) + '</span>'; }).join('') + (peers.length > 5 ? '<span style="background:#777">+' + (peers.length - 5) + '</span>' : '');
    NE.showPeers(peers);
  });
  NS.on('readonly', function () { SN.ui.toast(SN.t('n_readonly'), 'warn'); renderPage(); });
  SN.on('lang', function () { shell(); rail(); tree(); renderPage(); NS.emit('status', NS.status); });

  /* ====================================================== mulai */
  async function openWs(ws) {
    $('#nPage').innerHTML = '<div class="sn-spinner" style="margin-top:20vh"></div>';
    try { await NS.open(ws); } catch (e) { SN.ui.toast(e.message, 'err'); return; }
    hist = []; fwd = [];
    cur = SN.store.get('n_last_' + ws.id, '') || null;
    rail(); tree(); renderPage();
    NS.emit('status', 'ok');
  }
  async function boot() {
    shell();
    $('#nPage').innerHTML = '<div class="sn-spinner" style="margin-top:20vh"></div>';
    await NS.loadList();
    if (!NS.wsList.length) { await NS.createWorkspace(); }
    var last = SN.store.get('n_last_ws', '');
    var ws = NS.wsList.find(function (w) { return String(w.id) === last; }) || NS.wsList[0];
    await openWs(ws);
  }
  NS.on('wslist', function () { rail(); });
  SN.ready.then(boot).catch(function (e) { console.error(e); SN.ui.toast(e.message, 'err'); });
})();
