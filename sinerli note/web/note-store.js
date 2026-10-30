/* Sinerli Note — Copyright © 2026 Gadtan x Gallen. All rights reserved.
 *
 * NS — model workspace + sinkron.
 * Satu workspace = satu projek cloud (type 'snote_ws'). Isinya entitas:
 *   halaman  p…  {kind:'page', title, icon, cover, parent, _o, isDb, schema, views, props, full, font, small, locked, trashed, created, by, edited, eby}
 *   blok     b…  {kind:'block', page, parent, type, html, checked, open, color, bg, lang, src, url, caption, rows, _o}
 *   komentar c…  {kind:'cmt', page, block, body, by, name, at, resolved, quote}
 * Setiap field disinkron sendiri-sendiri (SN.Collab, LWW), jadi banyak orang
 * bisa mengedit halaman/blok berbeda — atau blok yang sama — tanpa konflik.
 * Cache lokal di IndexedDB: workspace tetap bisa dibuka & diedit tanpa internet.
 */
(function (global) {
  'use strict';
  var TYPE = 'snote_ws';
  var NS = global.NS = { ents: {}, wsList: [], ws: null, room: null, listeners: {} };

  NS.uid = function (p) { var b = new Uint8Array(8); crypto.getRandomValues(b); return p + Array.from(b, function (x) { return (x % 36).toString(36); }).join(''); };
  NS.on = function (ev, cb) { (NS.listeners[ev] = NS.listeners[ev] || []).push(cb); };
  NS.emit = function (ev, d) { (NS.listeners[ev] || []).forEach(function (cb) { try { cb(d); } catch (e) { console.error(e); } }); };

  /* ---------------------------------------------------------- IndexedDB */
  var dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (res) {
      try {
        var r = indexedDB.open('sinerli-note', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('ws'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
    return dbp;
  }
  async function cacheGet(k) { var d = await idb(); if (!d) return null; return new Promise(function (res) { var q = d.transaction('ws').objectStore('ws').get(k); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; }); }
  async function cachePut(k, v) { var d = await idb(); if (!d) return; d.transaction('ws', 'readwrite').objectStore('ws').put(v, k); }
  function cacheKey(id) { return (SN.ctx && SN.ctx.email) + '|' + id; }

  /* ---------------------------------------------------------- query */
  NS.get = function (id) { var e = NS.ents[id]; return e && !e._del ? e : null; };
  NS.page = function (id) { var e = NS.get(id); return e && e.kind === 'page' ? e : null; };
  NS.byOrder = function (a, b) { return (a._o || '') < (b._o || '') ? -1 : (a._o || '') > (b._o || '') ? 1 : (a.id < b.id ? -1 : 1); };
  NS.childPages = function (parent, includeTrash) {
    return Object.keys(NS.ents).map(function (k) { return NS.ents[k]; })
      .filter(function (e) { return e.kind === 'page' && !e._del && (e.parent || '') === (parent || '') && (includeTrash || !e.trashed); })
      .sort(NS.byOrder);
  };
  NS.blocks = function (page, parent) {
    return Object.keys(NS.ents).map(function (k) { return NS.ents[k]; })
      .filter(function (e) { return e.kind === 'block' && !e._del && e.page === page && (e.parent || '') === (parent || ''); })
      .sort(NS.byOrder);
  };
  NS.allPages = function () { return Object.keys(NS.ents).map(function (k) { return NS.ents[k]; }).filter(function (e) { return e.kind === 'page' && !e._del; }); };
  NS.isTrashed = function (p) { while (p) { if (p.trashed) return true; p = NS.page(p.parent); } return false; };
  NS.path = function (id) { var out = [], p = NS.page(id), guard = 0; while (p && guard++ < 50) { out.unshift(p); p = NS.page(p.parent); } return out; };
  NS.title = function (p) { return (p && p.title) || SN.t('n_untitled'); };
  NS.icon = function (p) { return (p && p.icon) || (p && p.isDb ? '▦' : '📄'); };
  NS.lastOrder = function (list) { return list.length ? list[list.length - 1]._o : ''; };

  /* ---------------------------------------------------------- mutasi */
  // Semua perubahan lewat sini: diterapkan lokal, dikirim ke peserta lain, dan dijadwalkan simpan.
  NS.set = function (id, fields, silent) {
    if (NS.readonly || NS.loading) return;
    var e = NS.ents[id] || (NS.ents[id] = { id: id });
    var changed = false;
    Object.keys(fields).forEach(function (k) {
      var v = fields[k];
      if (JSON.stringify(e[k]) === JSON.stringify(v)) return;
      e[k] = v; changed = true;
      if (NS.room) NS.room.set(id, k, v);
    });
    if (!changed) return;
    if (e.kind === 'page' || e.kind === 'block') touchPage(e.kind === 'page' ? id : e.page);
    NS.dirty();
    if (!silent) NS.emit('change', { ids: [id], local: true });
  };
  function touchPage(pid) {
    var p = NS.ents[pid];
    if (!p || NS._touching) return;
    var now = Date.now();
    if (p.edited && now - p.edited < 30000 && p.eby === SN.ctx.email) return;
    NS._touching = true;
    NS.set(pid, { edited: now, eby: SN.ctx.email, ebyName: SN.ctx.name || SN.ctx.email }, true);
    NS._touching = false;
  }
  NS.remove = function (id) { NS.set(id, { _del: 1 }); };

  NS.newPage = function (parent, fields) {
    var id = NS.uid('p');
    var sib = NS.childPages(parent);
    NS.set(id, Object.assign({ kind: 'page', title: '', parent: parent || '', _o: SN.Collab.between(NS.lastOrder(sib), ''), created: Date.now(), by: SN.ctx.email, byName: SN.ctx.name || SN.ctx.email }, fields || {}));
    return id;
  };
  NS.newBlock = function (page, parent, after, fields) {
    var sib = NS.blocks(page, parent), o;
    if (after === undefined || after === null) o = SN.Collab.between(NS.lastOrder(sib), '');
    else if (after === '') o = SN.Collab.between('', sib.length ? sib[0]._o : '');
    else { var i = sib.findIndex(function (b) { return b.id === after; }); o = SN.Collab.between(sib[i] ? sib[i]._o : NS.lastOrder(sib), sib[i + 1] ? sib[i + 1]._o : ''); }
    var id = NS.uid('b');
    NS.set(id, Object.assign({ kind: 'block', page: page, parent: parent || '', type: 'text', html: '', _o: o }, fields || {}));
    return id;
  };
  /** Salin halaman beserta blok & sub-halaman. */
  NS.duplicatePage = function (pid, parent) {
    var p = NS.page(pid);
    if (!p) return null;
    var fields = JSON.parse(JSON.stringify(p));
    delete fields.id;
    fields.title = (p.title || '') + (parent === undefined ? ' (' + SN.t('n_copy') + ')' : '');
    var nid = NS.newPage(parent === undefined ? p.parent : parent, fields);
    if (parent === undefined) NS.set(nid, { _o: SN.Collab.between(p._o, nextSibOrder(p)) });
    (function copyBlocks(srcParent, dstParent) {
      NS.blocks(pid, srcParent).forEach(function (b) {
        var f = JSON.parse(JSON.stringify(b)); delete f.id;
        f.page = nid; f.parent = dstParent;
        var bid = NS.uid('b');
        NS.set(bid, f);
        copyBlocks(b.id, bid);
      });
    })('', '');
    NS.childPages(pid).forEach(function (c) { NS.duplicatePage(c.id, nid); });
    return nid;
  };
  function nextSibOrder(p) { var s = NS.childPages(p.parent); var i = s.findIndex(function (x) { return x.id === p.id; }); return s[i + 1] ? s[i + 1]._o : ''; }
  NS.movePage = function (pid, parent, beforeId) {
    if (pid === parent) return;
    for (var x = NS.page(parent); x; x = NS.page(x.parent)) if (x.id === pid) return;   // tidak boleh ke turunannya sendiri
    var sib = NS.childPages(parent).filter(function (s) { return s.id !== pid; });
    var i = beforeId ? sib.findIndex(function (s) { return s.id === beforeId; }) : sib.length;
    if (i < 0) i = sib.length;
    NS.set(pid, { parent: parent || '', _o: SN.Collab.between(sib[i - 1] ? sib[i - 1]._o : '', sib[i] ? sib[i]._o : '') });
  };
  NS.trashPage = function (pid) { NS.set(pid, { trashed: Date.now(), trashedBy: SN.ctx.email }); };
  NS.restorePage = function (pid) {
    var p = NS.page(pid);
    NS.set(pid, { trashed: 0 });
    if (p && p.parent && (!NS.page(p.parent) || NS.isTrashed(NS.page(p.parent)))) NS.set(pid, { parent: '' });
  };
  NS.destroyPage = function (pid) {
    NS.childPages(pid, true).forEach(function (c) { NS.destroyPage(c.id); });
    Object.keys(NS.ents).forEach(function (k) { var e = NS.ents[k]; if ((e.kind === 'block' || e.kind === 'cmt') && e.page === pid && !e._del) NS.remove(k); });
    NS.remove(pid);
  };
  /** Teks polos sebuah halaman (pencarian, tautan balik). */
  NS.pageText = function (pid) {
    var out = [];
    Object.keys(NS.ents).forEach(function (k) { var e = NS.ents[k]; if (e.kind === 'block' && !e._del && e.page === pid && e.html) out.push(e.html); });
    var d = document.createElement('div'); d.innerHTML = out.join(' ');
    return d.textContent;
  };
  NS.backlinks = function (pid) {
    var seen = {}, out = [];
    Object.keys(NS.ents).forEach(function (k) {
      var e = NS.ents[k];
      if (e.kind !== 'block' || e._del || e.page === pid) return;
      if ((e.html && e.html.indexOf('data-page="' + pid + '"') >= 0) || (e.type === 'page' && e.ref === pid)) {
        var p = NS.page(e.page);
        if (p && !p.trashed && !seen[p.id]) { seen[p.id] = 1; out.push(p); }
      }
    });
    return out;
  };

  /* ---------------------------------------------------------- simpan */
  var saveTimer = null, saving = false, again = false;
  NS.status = 'ok';
  function setStatus(s) { if (NS.status !== s) { NS.status = s; NS.emit('status', s); } }
  NS.dirty = function () {
    snapshotLocal();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(NS.saveNow, 2500);
    setStatus('saving');
  };
  var localTimer = null;
  function snapshotLocal() {
    clearTimeout(localTimer);
    localTimer = setTimeout(function () { if (NS.ws) cachePut(cacheKey(NS.ws.id || NS.ws.localId), { meta: NS.ws, content: NS.snapshot() }); }, 400);
  }
  NS.snapshot = function () {
    var st = NS.room ? NS.room.state() : { clocks: NS._clocks || {}, since: NS._since || 0 };
    return { v: 1, ents: NS.ents, clocks: st.clocks, since: st.since, name: NS.ws && NS.ws.name, color: NS.ws && NS.ws.color };
  };
  NS.saveNow = async function () {
    clearTimeout(saveTimer);
    if (!NS.ws || NS.readonly) return;
    if (saving) { again = true; return; }
    saving = true;
    try {
      var r = await SN.Docs.save({ id: NS.ws.id || undefined, filename: NS.ws.filename || undefined, name: NS.ws.name, type: TYPE, content: NS.snapshot(), force: true, share_token: NS.ws.share || undefined });
      var first = !NS.ws.id;
      NS.ws.id = r.id; NS.ws.filename = r.filename;
      if (first) { joinRoom(); NS.emit('wslist'); }
      setStatus(SN.offline ? 'offline' : 'ok');
    } catch (e) {
      setStatus(e.network ? 'offline' : 'error');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(NS.saveNow, e.network ? 8000 : 20000);
    } finally {
      saving = false;
      if (again) { again = false; NS.saveNow(); }
    }
  };
  global.addEventListener('beforeunload', function () { if (NS.status === 'saving') NS.saveNow(); });

  /* ---------------------------------------------------------- workspace */
  var WS_COLORS = ['#5e7a36', '#3a72b8', '#b3497c', '#cc6d2e', '#8a5bb5', '#2f8f83', '#c24a3b'];
  NS.loadList = async function () {
    var mine = [], shared = [];
    try { mine = await SN.Docs.list(TYPE); } catch (e) { mine = (await cacheGet(cacheKey('__list'))) || []; }
    try {
      var s = await SN.Docs.sharedWithMe();
      shared = (s.projects || s.items || []).filter(function (p) { return p.type === TYPE; }).map(function (p) { return { id: p.id, name: p.name, share: p.token || p.share_token, shared: true, role: p.role }; });
    } catch (e) {}
    NS.wsList = mine.map(function (p) { return { id: p.id, name: p.name, filename: p.filename }; }).concat(shared);
    NS.wsList.forEach(function (w, i) { w.color = w.color || WS_COLORS[i % WS_COLORS.length]; });
    cachePut(cacheKey('__list'), mine);
    return NS.wsList;
  };
  NS.createWorkspace = async function (name) {
    var ws = { name: name || SN.t('n_ws_default', { name: (SN.ctx.name || SN.ctx.email).split(' ')[0] }), localId: NS.uid('w') };
    await NS.open(ws, { v: 1, ents: {}, clocks: {}, since: 0 });
    NS.seedWelcome();
    await NS.saveNow();
    await NS.loadList();
    NS.emit('wslist');
    return ws;
  };
  NS.open = async function (ws, content) {
    if (NS.room) { NS.room.leave(); NS.room = null; }
    if (NS.status === 'saving') await NS.saveNow();
    NS.ws = ws; NS.readonly = false;
    NS.loading = true;
    document.documentElement.classList.add('n-loading');
    try { await loadInto(ws, content); } finally { NS.loading = false; document.documentElement.classList.remove('n-loading'); }
    NS.emit('open', ws);
  };
  async function loadInto(ws, content) {
    var c = content;
    if (!c && ws.id) {
      var cached = await cacheGet(cacheKey(ws.id));
      try {
        var p = await SN.Docs.load(ws.id, ws.share);
        c = p.content || {};
        ws.filename = p.filename; ws.name = p.name;
        // Simpanan lokal yang belum terkirim (luring) digabung lewat jam LWW.
        if (cached && cached.content) mergeCached(c, cached.content);
      } catch (e) {
        if (!cached) throw e;
        c = cached.content;
        SN.ui.toast(SN.t('sn_offline'), 'warn');
      }
    }
    c = c || {};
    NS.ents = c.ents || {};
    Object.keys(NS.ents).forEach(function (k) { NS.ents[k].id = k; });
    NS._clocks = c.clocks || {}; NS._since = c.since || 0;
    SN.store.set('n_last_ws', String(ws.id || ''));
    if (ws.id) joinRoom();
  }
  function mergeCached(server, local) {
    var sc = server.clocks = server.clocks || {}, ents = server.ents = server.ents || {};
    Object.keys(local.clocks || {}).forEach(function (key) {
      var lc = local.clocks[key], cur = sc[key];
      if (cur && (cur[0] > lc[0] || (cur[0] === lc[0] && cur[1] >= lc[1]))) return;
      var parts = key.split('\u0001'), le = local.ents[parts[0]];
      if (!le) return;
      sc[key] = lc;
      (ents[parts[0]] = ents[parts[0]] || { id: parts[0] })[parts[1]] = le[parts[1]];
    });
  }
  function joinRoom() {
    NS.room = SN.Collab.join({
      docId: NS.ws.id, share: NS.ws.share, clocks: NS._clocks, since: NS._since,
      onOps: function (changes) {
        var ids = {};
        changes.forEach(function (c) { var e = NS.ents[c.id] || (NS.ents[c.id] = { id: c.id }); e[c.k] = c.v; ids[c.id] = 1; });
        snapshotLocal();
        NS.emit('change', { ids: Object.keys(ids), local: false });
      },
      onPresence: function (peers) { NS.emit('presence', peers); },
      onStatus: function (s) {
        if (s === 'readonly' || s === 'denied') { NS.readonly = true; NS.emit('readonly'); }
        if (s === 'offline') setStatus('offline'); else if (NS.status === 'offline') setStatus('ok');
      }
    });
  }
  NS.renameWorkspace = function (name) { if (!NS.ws) return; NS.ws.name = name; NS.dirty(); NS.emit('wslist'); };
  NS.deleteWorkspace = async function () {
    if (!NS.ws || !NS.ws.filename) return;
    if (NS.room) { NS.room.leave(); NS.room = null; }
    await SN.Docs.remove(NS.ws.filename);
    NS.ws = null;
    await NS.loadList();
  };

  /* ---------------------------------------------------------- isi awal */
  NS.seedWelcome = function () {
    var id = NS.newPage('', { title: SN.t('n_welcome_title'), icon: '👋' });
    var add = function (type, html, extra) { return NS.newBlock(id, '', null, Object.assign({ type: type, html: html || '' }, extra || {})); };
    add('callout', SN.t('n_welcome_callout'), { icon: '💡', bg: 'green' });
    add('h2', SN.t('n_welcome_h_basics'));
    add('todo', SN.t('n_welcome_t1'));
    add('todo', SN.t('n_welcome_t2'));
    add('todo', SN.t('n_welcome_t3'));
    add('todo', SN.t('n_welcome_t4'));
    add('toggle', SN.t('n_welcome_toggle'));
    add('h2', SN.t('n_welcome_h_db'));
    var db = NS.newPage(id, NS.dbTemplate('tasks'));
    add('dblink', '', { ref: db });
    NS.seedRows(db, 'tasks');
    return id;
  };
  NS.dbTemplate = function (kind) {
    var st = 'p' + Math.random().toString(36).slice(2, 7), dt = 'p' + Math.random().toString(36).slice(2, 7), tg = 'p' + Math.random().toString(36).slice(2, 7), ow = 'p' + Math.random().toString(36).slice(2, 7);
    var schema = {};
    schema.title = { name: SN.t('n_prop_name'), type: 'title' };
    schema[st] = { name: SN.t('n_prop_status'), type: 'status', options: [{ id: 'o1', name: SN.t('n_st_todo'), color: 'gray' }, { id: 'o2', name: SN.t('n_st_doing'), color: 'blue' }, { id: 'o3', name: SN.t('n_st_done'), color: 'green' }] };
    if (kind !== 'blank') {
      schema[dt] = { name: SN.t('n_prop_date'), type: 'date' };
      schema[tg] = { name: SN.t('n_prop_tags'), type: 'multi', options: [{ id: 't1', name: 'Design', color: 'purple' }, { id: 't2', name: 'Dev', color: 'orange' }, { id: 't3', name: 'Riset', color: 'yellow' }] };
      schema[ow] = { name: SN.t('n_prop_owner'), type: 'person' };
    }
    return {
      title: kind === 'tasks' ? SN.t('n_tpl_tasks') : SN.t('n_new_db'), icon: kind === 'tasks' ? '✅' : '▦', isDb: true, schema: schema,
      propOrder: Object.keys(schema),
      views: [{ id: 'v1', name: SN.t('n_view_table'), type: 'table' }, { id: 'v2', name: SN.t('n_view_board'), type: 'board', groupBy: st }].concat(kind !== 'blank' ? [{ id: 'v3', name: SN.t('n_view_calendar'), type: 'calendar', dateBy: dt }] : [])
    };
  };
  NS.seedRows = function (db, kind) {
    var d = NS.page(db), keys = Object.keys(d.schema);
    var st = keys.find(function (k) { return d.schema[k].type === 'status'; });
    var dt = keys.find(function (k) { return d.schema[k].type === 'date'; });
    var today = new Date();
    var iso = function (off) { var x = new Date(today); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };
    [[SN.t('n_row1'), 'o3', 0], [SN.t('n_row2'), 'o2', 2], [SN.t('n_row3'), 'o1', 5]].forEach(function (r) {
      var props = {}; props[st] = r[1]; if (dt) props[dt] = iso(r[2]);
      NS.newPage(db, { title: r[0], props: props, icon: '' });
    });
  };
})(window);
