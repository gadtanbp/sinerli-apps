/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Sinkron antar perangkat + kontrol jarak jauh lewat akun Sinerli (api/sinai_sync.php).
   - Dokumen: pengaturan (per kunci), proyek (per proyek), percakapan (per percakapan). Terakhir diubah menang.
   - Perangkat: setiap instalasi mendaftar; perangkat yang mengizinkan dikontrol ("host") mempublikasikan
     status langsungnya (tugas berjalan, persetujuan menunggu) dan menjalankan perintah dari perangkat lain.
   Rahasia (API key, token) tidak pernah ikut disinkronkan. */
(function () {
  'use strict';

  // Pengaturan yang ikut berpindah antar perangkat. Sisanya khusus perangkat (provider+key, folder, webhook, MCP lokal).
  var PORTABLE = ['appearance', 'profile', 'style', 'customStyles', 'intelligence', 'permission', 'web', 'agent', 'memory', 'sendWithEnter',
    'autoOpenCanvas', 'notifyOnFinish', 'integrations', 'skills', 'selfRepair'];
  var STATE_FILE = 'sync-state.json';
  var MAX_DOC = 2800000;
  var DOC_BATCH = 6;

  var st = null;                 // keadaan sinkron tersimpan
  var timeOff = 0;               // selisih jam server - jam lokal
  var running = false, loopId = 0;
  var devices = [], me = null;
  var dirtyConv = new Set(), tombs = new Set(), dirtySettings = false, dirtyProjects = false;
  var applying = 0;
  var listeners = {};
  var lock = Promise.resolve();
  var pushTimer = null, stateTimer = null, lastStateJson = '', lastConvPush = {};
  var status = { state: 'off', error: '', at: 0 };

  function emit(n, d) { (listeners[n] || []).forEach(function (f) { try { f(d); } catch (e) { console.error(e); } }); }
  function on(n, f) { (listeners[n] = listeners[n] || []).push(f); }
  function now() { return Date.now() + timeOff; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function exclusive(fn) { var p = lock.then(fn, fn); lock = p.catch(function () {}); return p; }
  function setStatus(s, err) { status = { state: s, error: err || '', at: Date.now() }; emit('status', status); }

  function hash(v) {
    var s = typeof v === 'string' ? v : JSON.stringify(v === undefined ? null : v), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + ':' + s.length;
  }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  async function readJSON(name) { try { var s = await Native.call('store.read', { name: name }); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function writeJSON(name, o) { return Native.call('store.write', { name: name, content: JSON.stringify(o) }); }
  var saveState = U.debounce(function () { if (st) writeJSON(STATE_FILE, st); }, 400);

  function blank() { return { email: '', seq: 0, rsince: 0, dev: '', rev: {}, setH: {}, setT: {}, projH: {}, projT: {}, projDel: {}, init: false, ignore: [] }; }

  function hostOn() { return Store.settings.remoteHost !== false; }

  // ------------------------------------------------------------------ API

  async function api(action, o) {
    o = o || {};
    var d = Sinerli.device(), path = '/gadex/sync/' + action, r;
    var wait = o.wait || 0;
    if (o.json) { o.json.device_id = d.id; r = await Sinerli.authed(path, { json: o.json, timeout: 40 }); }
    else {
      var q = Object.assign({ device_id: d.id }, o.query || {});
      r = await Sinerli.authed(path + '?' + Object.keys(q).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); }).join('&'), { timeout: wait + 20 });
    }
    if (r.json && r.json.now) timeOff = r.json.now - Date.now();
    if (r.status === 409 && r.json && r.json.error === 'unknown_device' && action !== 'hello') { await hello(); return api(action, o); }
    if (r.status >= 400 || !r.json || r.json.ok === false) {
      var e = new Error((r.json && (r.json.error_description || r.json.error)) || ('HTTP ' + r.status));
      e.status = r.status; e.code = r.json && r.json.error;
      throw e;
    }
    return r.json;
  }

  async function hello() {
    var d = Sinerli.device();
    var r = await api('hello', { json: { name: d.name, platform: U.osFamily(), version: Store.info.version || '', host: hostOn() ? 1 : 0 } });
    devices = r.devices || [];
    me = r.email;
    return r;
  }

  // ------------------------------------------------------------------ pengaturan (per kunci)

  function settingsLocalScan() {
    // Tandai kunci yang berubah sejak terakhir dilihat; kembalikan true bila ada.
    var changed = false;
    PORTABLE.forEach(function (k) {
      var v = Store.settings[k], h = hash(v);
      if (st.setH[k] !== h) { st.setH[k] = h; st.setT[k] = now(); changed = true; }
    });
    return changed;
  }

  function settingsDoc() {
    var e = {};
    PORTABLE.forEach(function (k) { if (Store.settings[k] !== undefined) e[k] = { v: Store.settings[k], t: st.setT[k] || 0 }; });
    return { e: e };
  }

  function settingsApply(doc, first) {
    var changed = false, e = (doc && doc.e) || {};
    PORTABLE.forEach(function (k) {
      var r = e[k];
      if (!r || r.v === undefined) return;
      if ((r.t || 0) > (st.setT[k] || 0) || (first && !(st.setT[k] > 0))) {
        if (hash(r.v) !== hash(Store.settings[k])) { Store.settings[k] = clone(r.v); changed = true; }
        st.setH[k] = hash(Store.settings[k]);
        st.setT[k] = r.t || 0;
      }
    });
    if (changed) {
      Store.saveSettings();
      Store.emit('settings', Store.settings);
      try { UI.applyAppearance(); } catch (e2) { /* ignore */ }
    }
    return changed;
  }

  // ------------------------------------------------------------------ proyek (per proyek)

  function projectsScan() {
    var changed = false, seen = {};
    (Store.projects || []).forEach(function (p) {
      seen[p.id] = 1;
      var h = hash(p);
      if (st.projH[p.id] !== h) { st.projH[p.id] = h; st.projT[p.id] = now(); delete st.projDel[p.id]; changed = true; }
    });
    Object.keys(st.projH).forEach(function (id) {
      if (!seen[id]) { delete st.projH[id]; delete st.projT[id]; st.projDel[id] = now(); changed = true; }
    });
    return changed;
  }

  function projectsDoc() {
    var e = {};
    (Store.projects || []).forEach(function (p) { e[p.id] = { v: p, t: st.projT[p.id] || 0 }; });
    return { e: e, d: st.projDel };
  }

  function projectsApply(doc) {
    var changed = false, e = (doc && doc.e) || {}, d = (doc && doc.d) || {};
    var list = (Store.projects || []).slice();
    Object.keys(e).forEach(function (id) {
      var r = e[id], i = list.findIndex(function (p) { return p.id === id; });
      if ((st.projDel[id] || 0) >= (r.t || 0)) return;           // dihapus di sini lebih baru
      if (i < 0 || (r.t || 0) > (st.projT[id] || 0)) {
        if (i >= 0 && hash(list[i]) === hash(r.v)) { st.projT[id] = r.t; return; }
        if (i >= 0) list[i] = clone(r.v); else list.unshift(clone(r.v));
        st.projH[id] = hash(r.v); st.projT[id] = r.t || 0; delete st.projDel[id];
        changed = true;
      }
    });
    Object.keys(d).forEach(function (id) {
      var i = list.findIndex(function (p) { return p.id === id; });
      if (i >= 0 && (d[id] || 0) > (st.projT[id] || 0)) { list.splice(i, 1); delete st.projH[id]; delete st.projT[id]; changed = true; }
      if ((d[id] || 0) > (st.projDel[id] || 0)) st.projDel[id] = d[id];
    });
    if (changed) { Store.projects = list; Store.saveProjects(); }
    return changed;
  }

  // ------------------------------------------------------------------ percakapan

  function slimConv(c) {
    var copy = Object.assign({}, c);
    delete copy.persisted;
    copy.messages = (c.messages || []).map(function (m) {
      if (!Array.isArray(m.content)) return m;
      var n = m.content.map(function (b) {
        if (b && typeof b.data === 'string' && b.data.length > 150000) return Object.assign({}, b, { data: '', stripped: true });
        return b;
      });
      return Object.assign({}, m, { content: n });
    });
    return copy;
  }

  async function convDoc(id) {
    var c = await Store.loadConv(id);
    if (!c || !c.messages || !c.messages.length) return null;
    var s = JSON.stringify(slimConv(c));
    return s.length > MAX_DOC ? null : s;
  }

  function markConv(id) { if (!id) return; dirtyConv.add(id); if (st && st.ignore) st.ignore = st.ignore.filter(function (x) { return x !== id; }); schedulePush(); }

  async function convApply(id, rec) {
    if (rec.deleted) {
      if (Store.index.some(function (e) { return e.id === id; }) || Store.convs.has(id)) {
        if (Engine.isRunning(id)) return;
        applying++;
        try { await Store.deleteConv(id); } finally { applying--; }
        if (UI.state.conv && UI.state.conv.id === id) App.newConversation(UI.state.mode);
      }
      return;
    }
    var remote;
    try { remote = JSON.parse(rec.data); } catch (e) { return; }
    if (!remote || remote.id !== id) return;
    var local = Store.convs.get(id) || await Store.loadConv(id);
    if (local && (local.updatedAt || 0) >= (remote.updatedAt || 0)) {
      if ((local.updatedAt || 0) > (remote.updatedAt || 0)) markConv(id);   // salinan lokal lebih baru → dorong
      return;
    }
    if (Engine.isRunning(id)) return;                                  // sedang berjalan di sini: jangan ditimpa
    if (local) {
      // Pertahankan data biner yang dipotong saat unggah.
      var keep = {};
      (local.messages || []).forEach(function (m) { if (Array.isArray(m.content)) m.content.forEach(function (b, i) { if (b && b.data && m.id) keep[m.id + ':' + i] = b.data; }); });
      (remote.messages || []).forEach(function (m) { if (Array.isArray(m.content)) m.content.forEach(function (b, i) { if (b && b.stripped && keep[m.id + ':' + i]) { b.data = keep[m.id + ':' + i]; delete b.stripped; } }); });
    }
    var out = Object.assign({}, remote);
    await writeJSON('conversations/' + id + '.json', out);
    out.persisted = true;
    if (local) { Object.keys(local).forEach(function (k) { delete local[k]; }); Object.assign(local, out); out = local; }
    else Store.convs.set(id, out);
    applying++;
    try { Store.touchIndex(out); } finally { applying--; }
    if (UI.state.conv && UI.state.conv.id === id) {
      var ta = document.querySelector('#app textarea');
      if (!(ta && ta.value) && window.Chat) Chat.open(out);
    }
  }

  // ------------------------------------------------------------------ dorong perubahan lokal

  function schedulePush() { if (pushTimer) return; pushTimer = setTimeout(function () { pushTimer = null; pushNow().catch(function () {}); }, 3500); }

  function pushNow() {
    return exclusive(async function () {
      if (!running || !st) return;
      var docs = [];
      if (settingsLocalScan() || dirtySettings) { docs.push({ key: 'settings', doc: settingsDoc() }); dirtySettings = false; }
      if (projectsScan() || dirtyProjects) { docs.push({ key: 'projects', doc: projectsDoc() }); dirtyProjects = false; }
      var ids = Array.from(dirtyConv);
      for (var i = 0; i < ids.length && docs.length < DOC_BATCH; i++) {
        var id = ids[i];
        if (Engine.isRunning(id) && Date.now() - (lastConvPush[id] || 0) < 15000) continue;   // sedang berjalan: jangan terlalu sering
        dirtyConv.delete(id);
        var s = await convDoc(id);
        if (s) { docs.push({ key: 'conv:' + id, raw: s, conv: id }); lastConvPush[id] = Date.now(); }
      }
      Array.from(tombs).slice(0, DOC_BATCH).forEach(function (id) { tombs.delete(id); docs.push({ key: 'conv:' + id, deleted: true, conv: id }); });
      if (!docs.length) { saveState(); return; }
      var body = docs.map(function (d) { return { key: d.key, base_rev: st.rev[d.key] || 0, deleted: !!d.deleted, data: d.deleted ? undefined : (d.raw || JSON.stringify(d.doc)) }; });
      var r = await api('push', { json: { docs: body } });
      for (var j = 0; j < r.results.length; j++) {
        var res = r.results[j], src = docs[j];
        if (res.ok) { st.rev[res.key] = res.rev; continue; }
        if (res.conflict) {
          if (res.rev > 0) await applyRecord({ key: res.key, rev: res.rev, deleted: res.deleted, data: res.data });
          // setelah penggabungan, dorong ulang bila hasil gabungan masih beda
          if (src.key === 'settings') dirtySettings = true;
          else if (src.key === 'projects') dirtyProjects = true;
          else if (src.conv && !src.deleted) dirtyConv.add(src.conv);
          else if (src.deleted) tombs.add(src.conv);
        } else if (res.error) {
          console.warn('sync push', res.key, res.error);
          if (src.conv) st.rev[res.key] = st.rev[res.key] || 0;
        }
      }
      saveState();
      if (dirtyConv.size || tombs.size || dirtySettings || dirtyProjects) schedulePush();
    });
  }

  // ------------------------------------------------------------------ terapkan dokumen dari server

  async function applyRecord(rec, first) {
    var key = rec.key;
    st.rev[key] = rec.rev;
    if (key === 'settings') { if (!rec.deleted && rec.data) { settingsApply(JSON.parse(rec.data), first); if (settingsLocalScan()) dirtySettings = true; } }
    else if (key === 'projects') { if (!rec.deleted && rec.data) { projectsApply(JSON.parse(rec.data)); if (projectsScan()) dirtyProjects = true; } }
    else if (key.indexOf('conv:') === 0) await convApply(key.slice(5), rec);
  }

  async function handleResults(list) {
    list.forEach(function (r) { if (r.id > st.rsince) st.rsince = r.id; emit('result', r); });
  }

  // ------------------------------------------------------------------ perintah jarak jauh (sisi host)

  async function runCommand(c) {
    if (!hostOn()) throw new Error('Perangkat ini tidak mengizinkan dikontrol dari jauh.');
    if (window.Updater && Updater.locked) throw new Error('Sinai sedang menunggu pembaruan wajib.');
    var p = c.payload || {};
    if (c.type === 'ping') return { pong: true };
    if (c.type === 'stop') { Engine.stop(String(p.convId || '')); return { stopped: true }; }
    if (c.type === 'approve') {
      var id = String(p.callId || '');
      if (!Engine.approvals.has(id)) throw new Error('Persetujuan sudah tidak menunggu.');
      var dec = p.answers ? { allow: true, answers: p.answers } : { allow: !!p.allow, feedback: p.feedback ? String(p.feedback).slice(0, 500) : undefined };
      Engine.answerApproval(id, dec);
      return { answered: true };
    }
    if (c.type === 'open') {
      var oc = await Store.loadConv(String(p.convId || ''));
      if (!oc) throw new Error('Percakapan belum tersinkron ke perangkat ini.');
      await App.openConversation(oc.id);
      return { opened: true };
    }
    if (c.type === 'send') {
      var text = String(p.text || '').slice(0, 20000).trim();
      if (!text) throw new Error('Pesan kosong.');
      var conv = null, mode = ['chat', 'code', 'design'].indexOf(p.mode) >= 0 ? p.mode : 'chat';
      if (p.convId) {
        conv = await Store.loadConv(String(p.convId));
        if (!conv) throw new Error('Percakapan belum tersinkron ke perangkat ini.');
        if (Engine.isRunning(conv.id)) throw new Error('Percakapan sedang berjalan di perangkat ini.');
      } else {
        var ws = null;
        if (mode === 'code') {
          ws = p.workspace ? String(p.workspace) : (Store.settings.recentWorkspaces || [])[0] || null;
          if (!ws) throw new Error('Mode Code butuh folder proyek di perangkat ini.');
          if (U.isMobile()) throw new Error('Mode Code tidak tersedia di ponsel.');
        }
        if (!Engine.defaultModelRef(mode)) throw new Error('Perangkat ini belum punya model AI yang terpasang.');
        conv = Store.createConv(mode, { model: Engine.defaultModelRef(mode), workspace: ws, level: Store.settings.intelligence[mode] || 'balanced' });
      }
      if (conv.mode === 'code' && U.isMobile()) throw new Error('Mode Code tidak tersedia di ponsel.');
      conv.remote = { from: c.from, at: Date.now() };
      Engine.send(conv, { text: text, display: undefined }).catch(function () {});
      return { convId: conv.id };
    }
    throw new Error('Perintah tidak dikenal.');
  }

  var seenCmds = new Set();
  async function handleCommands(list) {
    list = list.filter(function (c) { if (seenCmds.has(c.id)) return false; seenCmds.add(c.id); return true; });
    if (seenCmds.size > 200) seenCmds = new Set(Array.from(seenCmds).slice(-100));
    for (var i = 0; i < list.length; i++) {
      var c = list[i], res, ok = true;
      try { res = await runCommand(c); } catch (e) { ok = false; res = { error: String(e.message || e).slice(0, 300) }; }
      try { await api('ack', { json: { id: c.id, status: ok ? 'done' : 'error', result: res } }); } catch (e) { /* perintah basi akan kedaluwarsa sendiri */ }
    }
    if (list.length) publishState(true);
  }

  // ------------------------------------------------------------------ status langsung (sisi host)

  function liveState() {
    var runs = [], appr = [];
    Store.convs.forEach(function (c) {
      if (!Engine.isRunning(c.id)) return;
      var tail = '', tool = '';
      for (var i = c.messages.length - 1; i >= 0 && i > c.messages.length - 6; i--) {
        var m = c.messages[i];
        if (m.role !== 'assistant') continue;
        (m.content || []).forEach(function (b) {
          if (b.type === 'text' && !tail) tail = b.text || '';
          if (b.type === 'tool_call') {
            if (!tool) tool = b.name;
            if (b.state === 'pending' && Engine.approvals.has(b.id)) {
              var q = b.question && b.question.questions ? b.question.questions.map(function (x) { return { q: String(x.question || '').slice(0, 300), options: (x.options || []).slice(0, 8).map(function (o) { return String(o && o.label || o).slice(0, 80); }) }; }) : null;
              appr.push({ id: b.id, convId: c.id, title: c.title, name: b.name, args: JSON.stringify(b.args || {}).slice(0, 400), danger: b.approval && b.approval.danger || null, warn: b.approval && b.approval.warn || null, plan: !!(b.approval && b.approval.plan), questions: q });
            }
          }
        });
        break;
      }
      runs.push({ id: c.id, title: String(c.title || '').slice(0, 80), mode: c.mode, tail: String(tail).slice(-500), tool: tool, workspace: c.workspace ? U.basename(c.workspace) : '', remote: !!c.remote });
    });
    return { host: hostOn(), runs: runs, approvals: appr, workspaces: (Store.settings.recentWorkspaces || []).slice(0, 6), models: !!Engine.defaultModelRef('chat') };
  }

  function publishState(immediate) {
    if (!running || !hostOn()) return;
    clearTimeout(stateTimer);
    stateTimer = setTimeout(async function () {
      var s = liveState(), j = JSON.stringify(s);
      if (j === lastStateJson) return;
      lastStateJson = j;
      try { await api('state', { json: { state: s } }); } catch (e) { lastStateJson = ''; }
    }, immediate ? 50 : 2500);
  }

  // ------------------------------------------------------------------ putaran utama

  async function pullOnce(wait) {
    var r = await api('pull', { wait: wait, query: { since: st.seq, rsince: st.rsince, dev: st.dev, wait: wait } });
    await exclusive(async function () {
      var first = !st.init;
      for (var i = 0; i < r.docs.length; i++) {
        var rd = r.docs[i];
        try { if (!(rd.device === Sinerli.device().id && st.rev[rd.key] === rd.rev)) await applyRecord(rd, first && rd.key === 'settings'); } catch (e) { console.warn('sync apply', r.docs[i].key, e); }
        if (r.docs[i].seq > st.seq) st.seq = r.docs[i].seq;
      }
      if (!r.more && r.seq > st.seq) st.seq = r.seq;
      st.dev = r.dev || st.dev;
      devices = r.devices || devices;
      await handleResults(r.results || []);
      if (!r.more) {
        if (!st.init) await firstSync(r);
        st.init = true;
      }
      saveState();
    });
    emit('devices', devices);
    if (r.cmds && r.cmds.length) handleCommands(r.cmds);
    return r;
  }

  /** Setelah tarik pertama: dorong yang belum ada di server (perangkat pertama / data lama). */
  async function firstSync(r) {
    var hasSettings = r.docs.some(function (d) { return d.key === 'settings'; }) || st.rev.settings;
    if (!hasSettings) { settingsLocalScan(); PORTABLE.forEach(function (k) { st.setT[k] = now(); }); dirtySettings = true; }
    else if (settingsLocalScan()) dirtySettings = true;
    if (!st.rev.projects) dirtyProjects = true;
    var skip = new Set(st.ignore || []);
    Store.index.forEach(function (e) { if (!st.rev['conv:' + e.id] && !skip.has(e.id)) dirtyConv.add(e.id); });
    schedulePush();
  }

  async function loop(myId) {
    var delay = 4000;
    while (running && myId === loopId) {
      try {
        var r = await pullOnce(firstPull ? 0 : 15);
        firstPull = false;
        delay = 4000;
        if (r.more) continue;
      } catch (e) {
        if (!running || myId !== loopId) return;
        if (e.status === 401 || /Belum masuk/.test(e.message)) { setStatus('off', 'Belum masuk Sinerli.'); running = false; return; }
        setStatus('error', e.message);
        await sleep(delay);
        delay = Math.min(60000, delay * 2);
        continue;
      }
      setStatus('ok');
    }
  }
  var firstPull = true, helloTimer = 0;

  async function start() {
    if (running) return;
    if (!(await Sinerli.signedIn())) return;
    st = Object.assign(blank(), await readJSON(STATE_FILE) || {});
    running = true;
    var myId = ++loopId;
    setStatus('connecting');
    try {
      var h = await hello();
      if (st.email && st.email !== h.email) {
        // Akun lain masuk di perangkat ini: data lama tidak diunggah ke akun baru.
        var ign = Store.index.map(function (e) { return e.id; });
        st = Object.assign(blank(), { ignore: ign });
      }
      st.email = h.email;
      if (!st.init) { PORTABLE.forEach(function (k) { st.setH[k] = hash(Store.settings[k]); st.setT[k] = 0; }); }
    } catch (e) {
      running = false;
      setStatus('error', e.message);
      setTimeout(start, 30000);
      return;
    }
    hook();
    firstPull = true;
    loop(myId);
    publishState(true);
    if (!helloTimer) helloTimer = setInterval(function () { if (running) hello().catch(function () {}); }, 5 * 60 * 1000);
  }

  function stop() { running = false; loopId++; devices = []; setStatus('off'); emit('devices', devices); }

  var hooked = false;
  function hook() {
    if (hooked) return;
    hooked = true;
    var saveConv = Store.saveConv;
    Store.saveConv = function (conv) {
      var r = saveConv.apply(this, arguments);
      if (running && !applying && conv && conv.messages && conv.messages.length) markConv(conv.id);
      return r;
    };
    var delConv = Store.deleteConv;
    Store.deleteConv = function (id) {
      if (running && !applying) { tombs.add(id); dirtyConv.delete(id); schedulePush(); }
      return delConv.apply(this, arguments);
    };
    Store.on('settings', function () { if (running && !applying) schedulePush(); });
    Store.on('projects', function () { if (running && !applying) { dirtyProjects = true; schedulePush(); } });
    Engine.on('run', function (c, runningNow) {
      if (runningNow) publishState(true);
      else { markConv(c.id); publishState(true); schedulePush(); }
    });
    Engine.on('update', function (c) { if (hostOn()) publishState(false); if (Engine.isRunning(c.id)) markConv(c.id); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && running) schedulePush(); });
  }

  // ------------------------------------------------------------------ untuk UI

  async function cmd(to, type, payload) {
    var r = await api('cmd', { json: { to: to, type: type, payload: payload || {} } });
    return r.id;
  }

  /** Kirim perintah lalu tunggu hasil dari perangkat tujuan (maks. 60 dtk). */
  function cmdWait(to, type, payload) {
    return new Promise(function (resolve, reject) {
      var id, timer, off;
      function done(fn, v) { clearTimeout(timer); off && off(); fn(v); }
      var handler = function (r) { if (r.id === id) done(r.status === 'done' ? resolve : reject, r.status === 'done' ? (r.result || {}) : new Error((r.result && r.result.error) || (r.status === 'expired' ? 'Perangkat tujuan tidak merespons.' : 'Gagal.'))); };
      off = (function () { on('result', handler); return function () { listeners.result = listeners.result.filter(function (f) { return f !== handler; }); }; })();
      timer = setTimeout(function () { done(reject, new Error('Perangkat tujuan tidak merespons (offline?).')); }, 60000);
      cmd(to, type, payload).then(function (i) { id = i; }, function (e) { done(reject, e); });
    });
  }

  async function forget(target) { await api('forget', { json: { target: target } }); devices = devices.filter(function (d) { return d.id !== target; }); emit('devices', devices); }

  async function rehello() { var r = await hello(); emit('devices', devices); publishState(true); return r; }

  window.Sync = {
    start: start, stop: stop, on: on, cmd: cmd, cmdWait: cmdWait, forget: forget, rehello: rehello, now: function () { return now(); },
    devices: function () { return devices; }, status: function () { return status; }, selfId: function () { return Sinerli.device().id; },
    syncNow: function () { dirtySettings = true; dirtyProjects = true; Store.index.forEach(function (e) { dirtyConv.add(e.id); }); return pushNow(); },
    PORTABLE: PORTABLE, _test: { hash: hash, settingsApply: settingsApply, projectsApply: projectsApply },
  };
})();
