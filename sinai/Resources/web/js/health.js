/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Model health (green = answers without errors, red = fails, grey = not
   checked yet) and per-key account data read straight from each provider:
   balances / credits, organisation usage & cost (admin keys), rate-limit
   headers, and token usage reported in API responses. */
(function () {
  'use strict';

  var health = {};       // "providerId::modelId" -> {ok, code, msg, latency, at, source}
  var limits = {};       // providerId -> {at, model, headers: {name: value}}
  var usage = {};        // providerId -> {YYYY-MM-DD: {modelId: {i, o, r}}}
  var accounts = {};     // providerId -> last account() result
  var keyStats = {};     // providerId -> {"…abcd": {ok, code, msg, at, days: {YYYY-MM-DD: {i, o, r}}}}
  var listeners = [];
  var running = {};      // key -> promise (avoid duplicate tests)

  var STALE_MS = 30 * 60 * 1000;

  function key(pid, mid) { return pid + '::' + mid; }
  function notify() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  var saveHealth = U.debounce(function () { Native.call('store.write', { name: 'health.json', content: JSON.stringify({ health: health, limits: limits, keys: keyStats }) }); }, 800);
  var saveUsage = U.debounce(function () { Native.call('store.write', { name: 'usage.json', content: JSON.stringify(usage) }); }, 1500);

  async function load() {
    try {
      var h = await Native.call('store.read', { name: 'health.json' });
      if (h) { var j = JSON.parse(h); health = j.health || {}; limits = j.limits || {}; keyStats = j.keys || {}; }
    } catch (e) { /* fresh */ }
    try {
      var u = await Native.call('store.read', { name: 'usage.json' });
      if (u) usage = JSON.parse(u) || {};
    } catch (e) { /* fresh */ }
    // keep 120 days
    var cutoff = dayKey(Date.now() - 120 * 864e5);
    Object.keys(usage).forEach(function (pid) { Object.keys(usage[pid]).forEach(function (d) { if (d < cutoff) delete usage[pid][d]; }); });
    notify();
  }

  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---------------------------------------------------------------- classification

  function classify(status, body, err) {
    var text = String((err && (err.detail || err.message)) || body || '').toLowerCase();
    if (err && err.network || status === 0) return { code: 'network', msg: 'Koneksi ke server penyedia gagal' + (err && err.message ? ' (' + String(err.message).slice(0, 80) + ')' : '') };
    if (/api key untuk .* belum diatur/.test(text)) return { code: 'nokey', msg: 'API key belum diatur' };
    if (status === 401) return { code: 'auth', msg: 'API key tidak valid / ditolak' };
    if (status === 402 || /insufficient (balance|quota|credit)|balance (is )?(insufficient|not enough)|no credits|credit balance is too low|quota exceeded|exceeded your current quota/.test(text)) return { code: 'balance', msg: 'Saldo / kuota habis' };
    if (status === 403) return { code: 'forbidden', msg: 'Key tidak punya akses ke model ini' };
    if (status === 404 || /model[^.]{0,40}(not found|does not exist|not exist|unknown|invalid model)|no such model|model_not_found/.test(text)) return { code: 'notfound', msg: 'Model tidak tersedia untuk key ini' };
    if (status === 429) return { code: 'ratelimit', msg: 'Batas rate tercapai — coba lagi sebentar' };
    if (status >= 500) return { code: 'server', msg: 'Server penyedia error (HTTP ' + status + ')' };
    if (/not a chat model|does not support (chat|the chat)|not supported for chat|only supported in v1\/responses|use the responses api/.test(text)) return { code: 'nochat', msg: 'Bukan model chat (tidak bisa dipakai untuk percakapan)' };
    return { code: 'error', msg: 'HTTP ' + status + (text ? ': ' + text.replace(/\s+/g, ' ').slice(0, 140) : '') };
  }

  function set(pid, mid, rec) {
    health[key(pid, mid)] = Object.assign({ at: Date.now() }, rec);
    saveHealth();
    notify();
  }

  function get(pid, mid) { return health[key(pid, mid)] || null; }

  /* 'ok' | 'err' | 'warn' | 'unknown' */
  function state(pid, mid) {
    var h = get(pid, mid);
    if (!h) return 'unknown';
    if (h.ok) return 'ok';
    return h.code === 'ratelimit' || h.code === 'server' ? 'warn' : 'err';
  }

  function describe(pid, mid) {
    var h = get(pid, mid);
    if (!h) return 'Belum dicek';
    var when = ago(h.at);
    if (h.ok) return 'Siap dipakai' + (h.latency ? ' · respons ' + (h.latency < 1000 ? h.latency + ' ms' : (h.latency / 1000).toFixed(1) + ' dtk') : '') + ' · dicek ' + when;
    return h.msg + ' · dicek ' + when;
  }

  function ago(ts) {
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'baru saja';
    if (s < 3600) return Math.round(s / 60) + ' mnt lalu';
    if (s < 86400) return Math.round(s / 3600) + ' jam lalu';
    return Math.round(s / 86400) + ' hari lalu';
  }

  // ---------------------------------------------------------------- passive updates from real requests

  function keyRec(pid, tag) {
    var p = keyStats[pid] = keyStats[pid] || {};
    return p[tag] = p[tag] || { days: {} };
  }

  /* A request through one particular API key failed. */
  function reportKey(pid, tag, e) {
    if (!tag || !e) return;
    var c = classify(e.status || 0, e.body, e);
    if (c.code === 'error' || c.code === 'network' || c.code === 'server') return;
    var k = keyRec(pid, tag);
    k.ok = false; k.code = c.code; k.msg = c.msg; k.at = Date.now();
    saveHealth();
    notify();
  }

  function keysOf(pid) {
    var p = keyStats[pid] || {};
    var today = dayKey(Date.now()), d30 = dayKey(Date.now() - 29 * 864e5);
    return Object.keys(p).map(function (tag) {
      var k = p[tag], t = { i: 0, o: 0, r: 0 }, m = { i: 0, o: 0, r: 0 };
      Object.keys(k.days || {}).forEach(function (d) {
        var u = k.days[d];
        if (d === today) { t.i += u.i; t.o += u.o; t.r += u.r; }
        if (d >= d30) { m.i += u.i; m.o += u.o; m.r += u.r; }
      });
      return { tag: tag, ok: k.ok !== false, code: k.code || '', msg: k.msg || '', at: k.at || 0, today: t, month: m };
    });
  }

  function reportSuccess(pid, mid, u, tag) {
    if (tag) {
      var k = keyRec(pid, tag);
      if (k.ok === false || !k.at || Date.now() - k.at > 60000) { k.ok = true; k.code = ''; k.msg = ''; k.at = Date.now(); saveHealth(); }
      if (u && (u.input || u.output)) {
        var d = dayKey(Date.now());
        var x = k.days[d] = k.days[d] || { i: 0, o: 0, r: 0 };
        x.i += u.input || 0; x.o += u.output || 0; x.r += 1;
        var cut = dayKey(Date.now() - 60 * 864e5);
        Object.keys(k.days).forEach(function (dd) { if (dd < cut) delete k.days[dd]; });
        saveHealth();
      }
    }
    var prev = get(pid, mid);
    if (!prev || !prev.ok || Date.now() - prev.at > 60000) set(pid, mid, { ok: true, source: 'chat', latency: prev && prev.ok ? prev.latency : null });
    if (u && (u.input || u.output)) recordUsage(pid, mid, u);
  }

  function reportFailure(pid, mid, e) {
    if (!e) return;
    var c = classify(e.status || 0, e.body, e);
    // Parameter problems of a particular request do not mean the model is down.
    if (c.code === 'error' && (e.status === 400 || e.status === 422)) return;
    set(pid, mid, { ok: false, code: c.code, msg: c.msg, source: 'chat' });
  }

  function recordUsage(pid, mid, u) {
    var d = dayKey(Date.now());
    var p = usage[pid] = usage[pid] || {};
    var day = p[d] = p[d] || {};
    var m = day[mid] = day[mid] || { i: 0, o: 0, r: 0 };
    m.i += u.input || 0;
    m.o += u.output || 0;
    m.r += 1;
    saveUsage();
  }

  function captureHeaders(pid, mid, headers) {
    var picked = {};
    Object.keys(headers || {}).forEach(function (k) {
      var lk = k.toLowerCase();
      if (/ratelimit|rate-limit|x-credits|remaining|quota/.test(lk) && !/retry-after/.test(lk)) picked[lk] = String(headers[k]);
    });
    if (Object.keys(picked).length) { limits[pid] = { at: Date.now(), model: mid, headers: picked }; saveHealth(); }
  }

  // ---------------------------------------------------------------- active test

  /* Sends the smallest possible request (a few output tokens) to see whether the model answers. */
  async function test(pid, mid) {
    var k = key(pid, mid);
    if (running[k]) return running[k];
    running[k] = (async function () {
      var p = Store.provider(pid);
      if (!p) return null;
      var pre = Providers.preset(p.presetId);
      var apiKey = await Store.getKey(pid);
      if (!apiKey && !pre.noKey && !p.noKey) { set(pid, mid, { ok: false, code: 'nokey', msg: 'API key belum diatur', source: 'test' }); return get(pid, mid); }
      var headers = Object.assign({ 'Content-Type': 'application/json' }, Providers.authHeaders(p, apiKey));
      var url, variants;
      var msgs = [{ role: 'user', content: 'Hi' }];
      if (p.kind === 'anthropic') {
        url = Providers.anthropicRoot(p) + '/messages';
        variants = [{ model: mid, max_tokens: 5, messages: msgs }];
      } else {
        url = Providers.baseUrl(p) + '/chat/completions';
        variants = p.presetId === 'openai'
          ? [{ model: mid, messages: msgs, max_completion_tokens: 16 }, { model: mid, messages: msgs }]
          : [{ model: mid, messages: msgs, max_tokens: 5 }, { model: mid, messages: msgs }];
      }
      var t0 = Date.now(), res = null, lastErr = null;
      for (var i = 0; i < variants.length; i++) {
        try {
          res = await Native.call('http.request', { url: url, method: 'POST', headers: headers, body: JSON.stringify(variants[i]), timeout: 45, maxBytes: 200000 });
        } catch (e) { lastErr = e; res = null; break; }
        captureHeaders(pid, mid, res.headers);
        // A 400 about our tiny parameters: retry once without them.
        if ((res.status === 400 || res.status === 422) && i < variants.length - 1 && /max_|token|param|argument|unsupported/i.test(res.body || '')) continue;
        break;
      }
      if (!res) {
        var cn = classify(0, '', { network: true, message: lastErr && lastErr.message });
        set(pid, mid, { ok: false, code: cn.code, msg: cn.msg, source: 'test' });
      } else if (res.status >= 200 && res.status < 300) {
        // Some gateways answer 200 with an error object.
        var body = U.parseJSONLoose(res.body || '') || {};
        if (body.error) {
          var ce = classify(400, JSON.stringify(body.error));
          set(pid, mid, { ok: false, code: ce.code, msg: ce.msg, source: 'test' });
        } else {
          set(pid, mid, { ok: true, latency: Date.now() - t0, source: 'test' });
          var u = body.usage || {};
          var inT = u.prompt_tokens || u.input_tokens || 0, outT = u.completion_tokens || u.output_tokens || 0;
          if (inT || outT) recordUsage(pid, mid, { input: inT, output: outT });
        }
      } else {
        var c = classify(res.status, res.body);
        set(pid, mid, { ok: false, code: c.code, msg: c.msg, status: res.status, source: 'test' });
      }
      return get(pid, mid);
    })();
    try { return await running[k]; } finally { delete running[k]; }
  }

  /* Tests many models with limited concurrency; onEach(result) after each one. */
  async function testMany(list, onEach) {
    var queue = list.slice(), conc = 3;
    async function worker() {
      while (queue.length) {
        var it = queue.shift();
        try { await test(it.providerId, it.modelId); } catch (e) { /* recorded */ }
        if (onEach) onEach(it);
      }
    }
    var ws = [];
    for (var i = 0; i < Math.min(conc, list.length); i++) ws.push(worker());
    await Promise.all(ws);
  }

  function chatModelsOf(p) {
    return (p.models || []).filter(function (m) { return m.chat !== false; }).map(function (m) { return { providerId: p.id, modelId: m.id }; });
  }

  /* Background refresh of the models people actually use (defaults + recent), if stale. */
  function refreshImportant() {
    var refs = [Store.settings.defaults.chat, Store.settings.defaults.code].concat(Store.settings.recentModels || []).filter(Boolean);
    var seen = {}, list = [];
    refs.forEach(function (r) {
      var k = key(r.providerId, r.modelId);
      if (seen[k] || !Providers.resolve(r)) return;
      seen[k] = 1;
      var h = get(r.providerId, r.modelId);
      if (!h || Date.now() - h.at > STALE_MS) list.push({ providerId: r.providerId, modelId: r.modelId });
    });
    if (list.length) testMany(list.slice(0, 6));
  }

  function summary(p) {
    var ok = 0, err = 0, unk = 0;
    chatModelsOf(p).forEach(function (r) { var s = state(r.providerId, r.modelId); if (s === 'ok') ok++; else if (s === 'unknown') unk++; else err++; });
    return { ok: ok, err: err, unknown: unk, total: ok + err + unk };
  }

  // ---------------------------------------------------------------- account data (straight from the provider)

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function money(v, cur) {
    var n = num(v);
    if (n == null) return String(v);
    cur = String(cur || '').toUpperCase();
    var sym = cur === 'USD' ? '$' : cur === 'CNY' ? '¥' : cur === 'IDR' ? 'Rp' : '';
    return (sym || '') + n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 }) + (sym ? '' : (cur ? ' ' + cur : ''));
  }

  async function getJSON(url, headers) {
    var r = await Native.call('http.request', { url: url, method: 'GET', headers: headers, timeout: 25 });
    var body = U.parseJSONLoose(r.body || '') || {};
    if (r.status >= 400) {
      var e = new Error((body.error && (body.error.message || body.error)) || body.message || ('HTTP ' + r.status));
      e.status = r.status;
      throw e;
    }
    return body;
  }

  function adminSecret(pid) { return 'admin:' + pid; }
  async function getAdminKey(pid) { try { return await Native.call('secret.get', { key: adminSecret(pid) }); } catch (e) { return null; } }
  async function setAdminKey(pid, v) { await Native.call('secret.set', { key: adminSecret(pid), value: v || '' }); }

  /* Returns {balance:[{label,value}], usage:[{label,value}], details:[…], notes:[…], error, at}. */
  async function account(p) {
    var pre = Providers.preset(p.presetId);
    var apiKey = await Store.getKey(p.id);
    var auth = Providers.authHeaders(p, apiKey);
    var base = Providers.baseUrl(p);
    var out = { balance: [], usage: [], details: [], notes: [], at: Date.now(), source: '' };
    try {
      switch (p.presetId) {
        case 'sinerli': {
          if (!Providers.isSinerliGw(p)) { out.notes.push('Kuota Sinerli mengikuti paket akun Anda (dihitung untuk semua perangkat) — lihat Pengaturan › Akun Sinerli.'); break; }
          var g = await getJSON(base + '/usage', auth);
          out.source = 'Sinerli /gw/v1/usage';
          var names = { day: 'Hari ini', month: 'Bulan ini', minute: 'Menit ini', hour: 'Jam ini', week: 'Minggu ini' };
          out.ok = true;
          Object.keys(g.periods || {}).forEach(function (k) {
            var q = g.periods[k], lbl = names[k] || k;
            out.usage.push({ label: lbl + ' (token)', value: String(q.used) + (q.limit ? ' / ' + q.limit : '') });
            if (q.remaining != null) { out.balance.push({ label: 'Sisa kuota ' + lbl.toLowerCase(), value: String(q.remaining) + ' token', strong: true }); if (q.remaining <= 0) out.ok = false; }
          });
          if (!out.balance.length) out.balance.push({ label: 'Kuota', value: 'Tanpa batas' });
          if (g.key) { if (g.key.name) out.details.push({ label: 'Key', value: g.key.name }); if (g.key.app) out.details.push({ label: 'Aplikasi', value: g.key.app }); }
          if (!out.ok) out.status = 'Kuota key Sinerli habis';
          break;
        }
        case 'deepseek': {
          var d = await getJSON(base.replace(/\/v1$/, '') + '/user/balance', auth);
          out.source = 'DeepSeek /user/balance';
          (d.balance_infos || []).forEach(function (b) {
            out.balance.push({ label: 'Saldo total', value: money(b.total_balance, b.currency), strong: true });
            out.balance.push({ label: 'Saldo top-up', value: money(b.topped_up_balance, b.currency) });
            out.balance.push({ label: 'Saldo bonus', value: money(b.granted_balance, b.currency) });
          });
          out.status = d.is_available === false ? 'Saldo tidak cukup untuk memanggil API' : 'Saldo cukup untuk memakai API';
          out.ok = d.is_available !== false;
          break;
        }
        case 'openrouter': {
          var k = (await getJSON('https://openrouter.ai/api/v1/key', auth)).data || {};
          out.source = 'OpenRouter /api/v1/key';
          if (k.limit != null) out.balance.push({ label: 'Batas kredit key', value: money(k.limit, 'USD') });
          if (k.limit_remaining != null) out.balance.push({ label: 'Sisa kredit key', value: money(k.limit_remaining, 'USD'), strong: true });
          if (k.limit == null) out.balance.push({ label: 'Batas kredit key', value: 'Tanpa batas (mengikuti saldo akun)' });
          if (k.usage != null) out.usage.push({ label: 'Total terpakai', value: money(k.usage, 'USD') });
          if (k.usage_daily != null) out.usage.push({ label: 'Hari ini', value: money(k.usage_daily, 'USD') });
          if (k.usage_weekly != null) out.usage.push({ label: 'Minggu ini', value: money(k.usage_weekly, 'USD') });
          if (k.usage_monthly != null) out.usage.push({ label: 'Bulan ini', value: money(k.usage_monthly, 'USD') });
          if (k.free_model_daily_requests) {
            var f = k.free_model_daily_requests;
            out.details.push({ label: 'Permintaan model gratis hari ini', value: (f.used != null ? f.used : '?') + ' / ' + (f.limit != null ? f.limit : '?') + ' (sisa ' + (f.remaining != null ? f.remaining : '?') + ')' });
          }
          if (k.is_free_tier != null) out.details.push({ label: 'Tier', value: k.is_free_tier ? 'Gratis (belum pernah top-up)' : 'Berbayar' });
          try {
            var cr = (await getJSON('https://openrouter.ai/api/v1/credits', auth)).data || {};
            if (cr.total_credits != null) {
              out.balance.unshift({ label: 'Saldo akun', value: money(cr.total_credits - (cr.total_usage || 0), 'USD'), strong: true });
              out.details.push({ label: 'Total kredit dibeli', value: money(cr.total_credits, 'USD') });
            }
          } catch (e) { /* endpoint may need a different key type */ }
          out.ok = k.limit_remaining == null || k.limit_remaining > 0;
          break;
        }
        case 'moonshot': {
          var m = await getJSON(base + '/users/me/balance', auth);
          var md = m.data || {};
          out.source = 'Moonshot /v1/users/me/balance';
          out.balance.push({ label: 'Saldo tersedia', value: money(md.available_balance, 'USD'), strong: true });
          if (md.cash_balance != null) out.balance.push({ label: 'Saldo tunai', value: money(md.cash_balance, 'USD') });
          if (md.voucher_balance != null) out.balance.push({ label: 'Saldo voucher', value: money(md.voucher_balance, 'USD') });
          out.ok = num(md.available_balance) > 0;
          if (!out.ok) out.status = 'Saldo habis — API tidak bisa dipanggil';
          break;
        }
        case 'siliconflow': {
          var sf = (await getJSON(base + '/user/info', auth)).data || {};
          out.source = 'SiliconFlow /v1/user/info';
          if (sf.totalBalance != null) out.balance.push({ label: 'Saldo total', value: money(sf.totalBalance, base.indexOf('.cn') >= 0 ? 'CNY' : 'USD'), strong: true });
          if (sf.chargeBalance != null) out.balance.push({ label: 'Saldo top-up', value: money(sf.chargeBalance, base.indexOf('.cn') >= 0 ? 'CNY' : 'USD') });
          if (sf.balance != null) out.balance.push({ label: 'Saldo bonus', value: money(sf.balance, base.indexOf('.cn') >= 0 ? 'CNY' : 'USD') });
          if (sf.status) out.details.push({ label: 'Status akun', value: sf.status });
          out.ok = num(sf.totalBalance) == null || num(sf.totalBalance) > 0;
          break;
        }
        case 'openai': {
          var ak = await getAdminKey(p.id);
          if (!ak) { out.needsAdmin = true; out.notes.push('OpenAI hanya memberikan data penggunaan & biaya lewat Admin API key (sk-admin-…). Tambahkan admin key di bawah untuk melihatnya. Saldo prabayar tidak disediakan lewat API.'); break; }
          var start = Math.floor((Date.now() - 30 * 864e5) / 1000);
          var ah = { Authorization: 'Bearer ' + ak };
          var uu = await getJSON('https://api.openai.com/v1/organization/usage/completions?start_time=' + start + '&bucket_width=1d&limit=31', ah);
          var ti = 0, to = 0, tr = 0, today = 0, todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
          (uu.data || []).forEach(function (b) { (b.results || []).forEach(function (r) {
            ti += r.input_tokens || 0; to += r.output_tokens || 0; tr += r.num_model_requests || 0;
            if (b.start_time * 1000 >= todayStart.getTime() - 864e5) today += (r.input_tokens || 0) + (r.output_tokens || 0);
          }); });
          out.source = 'OpenAI Admin API /v1/organization/usage & /costs';
          out.usage.push({ label: 'Token masuk (30 hari)', value: U.fmtTokens(ti) });
          out.usage.push({ label: 'Token keluar (30 hari)', value: U.fmtTokens(to) });
          out.usage.push({ label: 'Permintaan (30 hari)', value: tr.toLocaleString('id-ID') });
          try {
            var cc = await getJSON('https://api.openai.com/v1/organization/costs?start_time=' + start + '&bucket_width=1d&limit=31', ah);
            var cost = 0, cur = 'usd';
            (cc.data || []).forEach(function (b) { (b.results || []).forEach(function (r) { if (r.amount) { cost += num(r.amount.value) || 0; cur = r.amount.currency || cur; } }); });
            out.usage.unshift({ label: 'Biaya (30 hari)', value: money(cost, cur), strong: true });
          } catch (e) { out.notes.push('Biaya tidak terbaca: ' + e.message); }
          out.notes.push('Saldo prabayar OpenAI tidak tersedia lewat API — lihat platform.openai.com/settings/organization/billing.');
          break;
        }
        case 'anthropic': {
          var aak = await getAdminKey(p.id);
          if (!aak) { out.needsAdmin = true; out.notes.push('Anthropic hanya memberikan laporan penggunaan & biaya lewat Admin API key (sk-ant-admin…). Tambahkan admin key di bawah. Saldo kredit tidak disediakan lewat API.'); break; }
          var since = new Date(Date.now() - 30 * 864e5); since.setUTCHours(0, 0, 0, 0);
          var hh = { 'x-api-key': aak, 'anthropic-version': '2023-06-01' };
          var root = 'https://api.anthropic.com/v1/organizations';
          var inTok = 0, outTok = 0, cacheTok = 0, page = '', guard = 0;
          do {
            var ur = await getJSON(root + '/usage_report/messages?starting_at=' + encodeURIComponent(since.toISOString()) + '&bucket_width=1d&limit=31' + (page ? '&page=' + encodeURIComponent(page) : ''), hh);
            (ur.data || []).forEach(function (b) { (b.results || []).forEach(function (r) {
              inTok += (r.uncached_input_tokens || 0);
              cacheTok += (r.cache_read_input_tokens || 0) + ((r.cache_creation && (r.cache_creation.ephemeral_5m_input_tokens || 0) + (r.cache_creation.ephemeral_1h_input_tokens || 0)) || 0);
              outTok += r.output_tokens || 0;
            }); });
            page = ur.has_more ? ur.next_page : '';
          } while (page && ++guard < 5);
          out.source = 'Anthropic Admin API usage_report & cost_report';
          out.usage.push({ label: 'Token masuk (30 hari)', value: U.fmtTokens(inTok) });
          out.usage.push({ label: 'Token cache (30 hari)', value: U.fmtTokens(cacheTok) });
          out.usage.push({ label: 'Token keluar (30 hari)', value: U.fmtTokens(outTok) });
          try {
            var cents = 0; page = ''; guard = 0;
            do {
              var cr2 = await getJSON(root + '/cost_report?starting_at=' + encodeURIComponent(since.toISOString()) + '&limit=31' + (page ? '&page=' + encodeURIComponent(page) : ''), hh);
              (cr2.data || []).forEach(function (b) { (b.results || []).forEach(function (r) { cents += num(r.amount) || 0; }); });
              page = cr2.has_more ? cr2.next_page : '';
            } while (page && ++guard < 5);
            // amount is in the currency's lowest unit (cents)
            out.usage.unshift({ label: 'Biaya (30 hari)', value: money(cents / 100, 'USD'), strong: true });
          } catch (e) { out.notes.push('Biaya tidak terbaca: ' + e.message); }
          out.notes.push('Saldo kredit Anthropic tidak tersedia lewat API — lihat console.anthropic.com/settings/billing.');
          break;
        }
        case 'ollama':
        case 'lmstudio':
          out.source = 'Lokal';
          out.balance.push({ label: 'Token', value: U.plat('Tanpa batas — model berjalan di Mac ini'), strong: true });
          break;
        default:
          out.notes.push(p.name + ' tidak menyediakan API untuk membaca saldo atau sisa kredit. Sinai menampilkan batas rate dari header respons dan token yang dilaporkan di setiap respons.');
      }
    } catch (e) {
      out.error = (e.status === 401 || e.status === 403) ? 'Penyedia menolak permintaan data akun (' + (e.status === 401 ? 'key tidak valid' : 'key tidak punya izin') + '): ' + e.message : e.message;
    }
    // Rate limits: make sure we have fresh headers (one tiny request) when none are known.
    var lim = limits[p.id];
    if ((!lim || Date.now() - lim.at > 10 * 60 * 1000) && p.presetId !== 'ollama' && p.presetId !== 'lmstudio') {
      var target = [Store.settings.defaults.chat, Store.settings.defaults.code].filter(function (r) { return r && r.providerId === p.id; })[0];
      var mid = target ? target.modelId : (chatModelsOf(p)[0] || {}).modelId;
      if (mid) await test(p.id, mid).catch(function () {});
    }
    out.limits = rateLimitRows(p.id);
    accounts[p.id] = out;
    notify();
    return out;
  }

  var LIMIT_LABELS = [
    [/^x-ratelimit-limit-tokens(-minute)?$|^anthropic-ratelimit-tokens-limit$/, 'Batas token / menit', 'tl'],
    [/^x-ratelimit-remaining-tokens(-minute)?$|^anthropic-ratelimit-tokens-remaining$/, 'Sisa token menit ini', 'tr'],
    [/^anthropic-ratelimit-input-tokens-limit$/, 'Batas token masuk / menit'],
    [/^anthropic-ratelimit-input-tokens-remaining$/, 'Sisa token masuk'],
    [/^anthropic-ratelimit-output-tokens-limit$/, 'Batas token keluar / menit'],
    [/^anthropic-ratelimit-output-tokens-remaining$/, 'Sisa token keluar'],
    [/^x-ratelimit-limit-tokens-day$/, 'Batas token / hari'],
    [/^x-ratelimit-remaining-tokens-day$/, 'Sisa token hari ini'],
    [/^x-ratelimit-limit-requests(-day)?$|^anthropic-ratelimit-requests-limit$/, 'Batas permintaan'],
    [/^x-ratelimit-remaining-requests(-day)?$|^anthropic-ratelimit-requests-remaining$/, 'Sisa permintaan'],
    [/^x-ratelimit-reset-tokens$|^anthropic-ratelimit-tokens-reset$/, 'Reset token'],
    [/^x-ratelimit-reset-requests$|^anthropic-ratelimit-requests-reset$/, 'Reset permintaan'],
  ];

  function rateLimitRows(pid) {
    var lim = limits[pid];
    if (!lim) return null;
    var rows = [], used = {};
    LIMIT_LABELS.forEach(function (l) {
      Object.keys(lim.headers).forEach(function (h) {
        if (used[h] || !l[0].test(h)) return;
        used[h] = 1;
        var v = lim.headers[h];
        var n = Number(v);
        rows.push({ label: l[1], value: isFinite(n) && String(v).trim() !== '' && !/[a-z:]/i.test(v) ? n.toLocaleString('id-ID') : (/T\d|Z$/.test(v) ? new Date(v).toLocaleTimeString('id-ID') : v), header: h });
      });
    });
    Object.keys(lim.headers).forEach(function (h) { if (!used[h]) rows.push({ label: h, value: lim.headers[h], header: h }); });
    return { at: lim.at, model: lim.model, rows: rows.slice(0, 14) };
  }

  /* Tokens reported in the provider's API responses (field "usage"), per period. */
  /* Today's / 30-day tokens for one model of one provider. */
  function modelUsage(pid, mid) {
    var p = usage[pid] || {};
    var today = dayKey(Date.now()), d30 = dayKey(Date.now() - 29 * 864e5);
    var t = { i: 0, o: 0, r: 0 }, m = { i: 0, o: 0, r: 0 };
    Object.keys(p).forEach(function (d) {
      var u = p[d][mid];
      if (!u) return;
      if (d === today) { t.i += u.i; t.o += u.o; t.r += u.r; }
      if (d >= d30) { m.i += u.i; m.o += u.o; m.r += u.r; }
    });
    return { today: t, month: m };
  }

  function localUsage(pid) {
    var p = usage[pid] || {};
    var now = Date.now(), today = dayKey(now), d7 = dayKey(now - 6 * 864e5), d30 = dayKey(now - 29 * 864e5);
    var periods = { today: { i: 0, o: 0, r: 0 }, week: { i: 0, o: 0, r: 0 }, month: { i: 0, o: 0, r: 0 } };
    var byModel = {};
    Object.keys(p).forEach(function (d) {
      Object.keys(p[d]).forEach(function (mid) {
        var u = p[d][mid];
        if (d === today) add(periods.today, u);
        if (d >= d7) add(periods.week, u);
        if (d >= d30) { add(periods.month, u); add(byModel[mid] = byModel[mid] || { i: 0, o: 0, r: 0 }, u); }
      });
    });
    function add(a, u) { a.i += u.i; a.o += u.o; a.r += u.r; }
    var models = Object.keys(byModel).map(function (m) { return { model: m, i: byModel[m].i, o: byModel[m].o, r: byModel[m].r }; })
      .sort(function (a, b) { return (b.i + b.o) - (a.i + a.o); }).slice(0, 8);
    return { periods: periods, models: models };
  }

  window.Health = {
    load: load, on: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; }, get: get, state: state, describe: describe, test: test, testMany: testMany,
    chatModelsOf: chatModelsOf, refreshImportant: refreshImportant, summary: summary, reportSuccess: reportSuccess,
    reportFailure: reportFailure, captureHeaders: captureHeaders, classify: classify, ago: ago,
    account: account, cachedAccount: function (pid) { return accounts[pid] || null; }, rateLimitRows: rateLimitRows, localUsage: localUsage, modelUsage: modelUsage, reportKey: reportKey, keysOf: keysOf,
    getAdminKey: getAdminKey, setAdminKey: setAdminKey,
  };
})();
