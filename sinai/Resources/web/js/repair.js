/* Self-repair.
   Layer 1 — lessons: when a turn hit errors and then got past them, a small
   utility-model call distils 0–3 reusable lessons (lessons.json). Relevant ones
   go into later system prompts, so the same mistake is not paid for again.
   Layer 2 — app errors: JS errors of Sinai itself are logged (errors.json);
   "Perbaiki Sinai" opens a Code conversation on the Sinai source folder with the
   log, where the agent fixes and rebuilds — the user reviews the diff. */
(function () {
  'use strict';

  var MAX_LESSONS = 200, MAX_ERRORS = 80;
  var lessons = [], errors = [], loaded = false, listeners = [];
  var save = U.debounce(function () { Native.call('store.write', { name: 'lessons.json', content: JSON.stringify(lessons) }); }, 600);
  var saveErr = U.debounce(function () { Native.call('store.write', { name: 'errors.json', content: JSON.stringify(errors) }); }, 600);
  function changed() { listeners.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } }); }

  async function init() {
    try { var r = await Native.call('store.read', { name: 'lessons.json' }); lessons = JSON.parse(r.content || r || '[]') || []; } catch (e) { lessons = []; }
    try { var q = await Native.call('store.read', { name: 'errors.json' }); errors = JSON.parse(q.content || q || '[]') || []; } catch (e) { errors = []; }
    if (!Array.isArray(lessons)) lessons = [];
    if (!Array.isArray(errors)) errors = [];
    loaded = true;
  }

  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  function add(l) {
    var text = String(l.text || '').trim().slice(0, 400);
    if (!text) return null;
    var scope = String(l.scope || 'general').toLowerCase().slice(0, 40);
    var dup = lessons.find(function (x) { return x.scope === scope && norm(x.text) === norm(text); });
    if (dup) { dup.hits = (dup.hits || 1) + 1; dup.ts = Date.now(); save(); return dup; }
    var item = { id: U.uid('ls_'), scope: scope, text: text, hits: 1, ts: Date.now(), source: l.source || 'auto' };
    lessons.unshift(item);
    if (lessons.length > MAX_LESSONS) lessons = lessons.sort(function (a, b) { return (b.hits || 1) - (a.hits || 1) || b.ts - a.ts; }).slice(0, MAX_LESSONS);
    save(); changed();
    return item;
  }
  function remove(id) { lessons = lessons.filter(function (x) { return x.id !== id; }); save(); changed(); }
  function clear() { lessons = []; save(); changed(); }

  /* Scopes in play for a conversation: shell, files, web, each connector, provider. */
  function scopesFor(conv, model) {
    var s = ['general'];
    if (conv.mode === 'code') s.push('shell', 'code', 'files');
    s.push(conv.mode);
    if (window.MCP) MCP.tools().forEach(function (t) { var n = String(t._serverName || '').toLowerCase(); if (n && s.indexOf(n) < 0) s.push(n); });
    if (model && model.provider) s.push('provider:' + String(model.provider.name || '').toLowerCase());
    return s;
  }

  /* Stable text (sorted, no timestamps) so the prompt prefix stays cacheable. */
  function promptSection(conv, model) {
    if (!loaded || !lessons.length || Store.settings.selfRepair === false) return '';
    var sc = scopesFor(conv, model);
    var pick = lessons.filter(function (l) { return sc.indexOf(l.scope) >= 0; })
      .sort(function (a, b) { return (b.hits || 1) - (a.hits || 1) || (a.id < b.id ? -1 : 1); }).slice(0, 14);
    if (!pick.length) return '';
    return '\n\n# Lessons learned (from earlier errors on this machine — apply them, do not repeat these mistakes)\n' +
      pick.map(function (l) { return '- [' + l.scope + '] ' + l.text; }).join('\n');
  }

  var LEARN = 'You turn an AI agent\'s failed-then-fixed tool attempts into short reusable lessons for future runs. ' +
    'Output ONLY a JSON array (max 3 items) of {"scope": "...", "lesson": "..."}. scope is one of: shell, code, files, web, general, ' +
    'or the exact connector/app name in lower case (e.g. canva, notion), or "provider:<name>". A lesson is one concrete imperative sentence ' +
    '(what to do / avoid and the exact tool, flag or field), useful beyond this one task. No project-specific paths or IDs. ' +
    'If nothing generalisable was learned, output [].';

  /* Called after every turn. Cheap: only runs when there was an error that a later call got past. */
  async function learn(conv, run, r) {
    if (Store.settings.selfRepair === false || !run || !run.toolLog || run.toolLog.length < 2) return;
    var log = run.toolLog, pairs = [];
    log.forEach(function (t, i) {
      if (!t.isError) return;
      var fix = log.slice(i + 1, i + 8).find(function (x) { return !x.isError && (x.name === t.name || (x.args && t.args && x.args.tool && x.args.tool === t.args.tool)); });
      if (fix && pairs.length < 6) pairs.push({ fail: t, ok: fix });
    });
    if (!pairs.length) return;
    function brief(t) { return t.name + ' ' + U.truncateMiddle(JSON.stringify(t.args || {}), 500) + '\n→ ' + U.truncateMiddle(String(t.result || ''), 400); }
    var text = pairs.map(function (p, i) { return '## Case ' + (i + 1) + '\nFAILED: ' + brief(p.fail) + '\nTHEN WORKED: ' + brief(p.ok); }).join('\n\n');
    try {
      var util = Providers.resolve(Store.settings.utility) || r;
      var res = await Providers.complete(util, LEARN, [{ role: 'user', content: [{ type: 'text', text: 'Connected apps: ' + scopesFor(conv, r).join(', ') + '\n\n' + text }] }], { level: 'off', maxTokens: 600 });
      var m = String(res.text || '').match(/\[[\s\S]*\]/);
      if (!m) return;
      var arr = JSON.parse(m[0]);
      (Array.isArray(arr) ? arr : []).slice(0, 3).forEach(function (x) { if (x && x.lesson) add({ scope: x.scope, text: x.lesson }); });
    } catch (e) { console.warn('lesson extraction failed', e); }
  }

  // ---------------------------------------------------------------- layer 2: app errors

  function logError(kind, message, stack) {
    var msg = String(message || '').slice(0, 600);
    if (!msg || /ResizeObserver loop|Script error\.?$/.test(msg)) return;
    var sig = kind + ':' + msg.replace(/\d+/g, '#').slice(0, 160);
    var e = errors.find(function (x) { return x.sig === sig; });
    if (e) { e.count++; e.last = Date.now(); }
    else {
      e = { id: U.uid('er_'), sig: sig, kind: kind, message: msg, stack: String(stack || '').slice(0, 2000), count: 1, first: Date.now(), last: Date.now(), fixed: false };
      errors.unshift(e);
      if (errors.length > MAX_ERRORS) errors.length = MAX_ERRORS;
      notify(e);
    }
    saveErr(); changed();
  }
  var notified = 0;
  function notify(e) {
    if (Date.now() - notified < 60000 || !window.UI || !UI.toast) return;
    notified = Date.now();
    try { UI.toast('Sinai mengalami error: ' + e.message.slice(0, 80) + ' — buka Pengaturan → Perbaikan diri untuk memperbaikinya', { error: true }); } catch (x) { /* ignore */ }
  }
  function openErrors() { return errors.filter(function (e) { return !e.fixed; }); }
  function markFixed(ids) { errors.forEach(function (e) { if (!ids || ids.indexOf(e.id) >= 0) e.fixed = true; }); saveErr(); changed(); }

  async function isSource(d) {
    try { var st = await Native.call('fs.stat', { path: d + '/Resources/web/js/engine.js' }); return !!(st && st.exists); } catch (e) { return false; }
  }
  async function sourceDir(ask) {
    var d = Store.settings.selfRepairSource;
    if (d && !ask && await isSource(d)) return d;
    var p = await Native.call('dialog.openFolder', { message: 'Pilih folder source Sinai (berisi Resources/web dan build.sh)' });
    p = p && (p.path || p);
    if (!p) return null;
    if (!(await isSource(p))) { UI.toast('Folder ini bukan source Sinai (Resources/web/js/engine.js tidak ditemukan)', { error: true }); return null; }
    Store.setSetting('selfRepairSource', p);
    return p;
  }

  /* Opens a Code conversation on the Sinai source with every open error. */
  async function fixApp(extra) {
    var dir = await sourceDir();
    if (!dir) return;
    var list = openErrors().slice(0, 15);
    var conv = App.newConversation('code', { workspace: dir });
    var build = U.isMac() ? './build.sh' : 'cd desktop && npm start';
    var text = 'Perbaiki Sinai (aplikasi ini sendiri). Source ada di folder ini: Resources/web/js (UI & agen), Sources/*.swift (host macOS), desktop/ (Windows/Linux).\n\n' +
      (list.length ? 'Error yang tercatat di aplikasi:\n' + list.map(function (e, i) { return (i + 1) + '. [' + e.kind + ', ' + e.count + '×] ' + e.message + (e.stack ? '\n   ' + e.stack.split('\n').slice(0, 4).join('\n   ') : ''); }).join('\n') + '\n\n' : '') +
      (extra ? 'Masalah yang dilaporkan: ' + extra + '\n\n' : '') +
      'Untuk setiap error: temukan akar masalahnya di kode, perbaiki secara minimal dan aman tanpa menghapus fitur, cek sintaks (node -e "new Function(require(\'fs\').readFileSync(f,\'utf8\'))" untuk file JS yang diubah), lalu jalankan `' + build + '` sampai sukses. ' +
      'Jangan ubah data pengguna di Application Support. Akhiri dengan ringkasan singkat: penyebab, file yang diubah, dan langkah untuk memasang build baru.';
    Engine.send(conv, { text: text });
    markFixed(list.map(function (e) { return e.id; }));
  }

  window.addEventListener('error', function (e) { logError('js', e.message + (e.filename ? ' @' + String(e.filename).split('/').pop() + ':' + e.lineno : ''), e.error && e.error.stack); });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    // Expected failures (network, aborted runs) are not app bugs.
    if (r && /abort|network|fetch|timeout|dibatalkan/i.test(String(r.message || r))) return;
    logError('promise', r && r.message || String(r), r && r.stack);
  });

  window.Repair = {
    init: init, add: add, remove: remove, clear: clear, learn: learn, promptSection: promptSection,
    logError: logError, errors: function () { return errors.slice(); }, openErrors: openErrors, markFixed: markFixed,
    lessons: function () { return lessons.slice(); }, fixApp: fixApp, sourceDir: sourceDir,
    onChange: function (f) { listeners.push(f); },
  };
})();
