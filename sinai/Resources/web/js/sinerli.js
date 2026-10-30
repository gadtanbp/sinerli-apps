/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Sinerli — "Masuk dengan Sinerli" (Sinerli Connect, OAuth 2.0 code + PKCE) untuk Sinai.
   Sinai = aplikasi (AI, Code, Design). Sinerli = web (akun, paket, produk, gateway AI).
   Sinai tidak menyimpan password; hanya token Connect di keychain ('sinerli-connect'). */
(function () {
  'use strict';

  var CLIENT_ID = 'sc_sinai';
  var PORTS = [33430, 33431, 33432, 33433];   // harus sama dengan redirect_uris terdaftar di Sinerli
  // Android/iOS: tidak ada server loopback — Sinerli mengarahkan balik lewat skema aplikasi (RFC 8252).
  var MOBILE_SCHEME = 'com.sinerli.sinai';
  var MOBILE_REDIRECT = MOBILE_SCHEME + ':/oauth/callback';
  var SCOPE = 'profile email plan permissions offline_access';
  var DEFAULT_BASE = 'https://sinerli.com';
  var SECRET = 'sinerli-connect';
  var pending = new Map();
  var cache = null;

  Native.on('oauth.callback', function (p) {
    var u;
    try { u = new URL(p.url); } catch (e) { return; }
    var st = u.searchParams.get('state') || '';
    var w = pending.get(st);
    if (!w) return;
    pending.delete(st);
    clearTimeout(w.timer);
    var err = u.searchParams.get('error');
    if (err) w.reject(new Error('Login ditolak: ' + (u.searchParams.get('error_description') || err)));
    else w.resolve(u.searchParams.get('code'));
  });

  function base() { return String(Store.settings.sinerliBase || DEFAULT_BASE).replace(/\/+$/, ''); }
  function mobile() { return U.isMobile(); }

  /** ID acak per instalasi: Sinerli membuat satu API key per perangkat, jadi login di HP tidak mematikan key di laptop. */
  function device() {
    var id = Store.settings.deviceId;
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) { id = 'gx_' + rand(18); Store.setSetting('deviceId', id); }
    var i = Store.info || {};
    var os = { macos: 'macOS', windows: 'Windows', linux: 'Linux', android: 'Android', ios: 'iOS' }[U.osFamily()] || 'Perangkat';
    var name = (os + (i.deviceModel ? ' · ' + i.deviceModel : i.host ? ' · ' + String(i.host).replace(/\.local$/, '') : '')).slice(0, 60);
    return { id: id, name: name };
  }
  function form(o) { return Object.keys(o).filter(function (k) { return o[k] != null && o[k] !== ''; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); }
  function rand(n) { var b = new Uint8Array(n); crypto.getRandomValues(b); return MCP._test.b64url(b); }

  async function http(url, opt) {
    var r = await Native.call('http.request', Object.assign({ url: url, method: 'GET', headers: { Accept: 'application/json' }, timeout: 20 }, opt || {}));
    var j = null;
    try { j = JSON.parse(r.body); } catch (e) { j = null; }
    return { status: r.status, json: j, body: r.body };
  }

  async function discover() {
    var r = await http(base() + '/.well-known/sinerli-connect');
    if (r.status !== 200 || !r.json || !r.json.authorization_endpoint) throw new Error('Server Sinerli tidak merespons di ' + base() + ' — layanan masuk (Sinerli Connect) belum aktif di server atau alamatnya salah. Periksa koneksi internet, atau ubah "Alamat server Sinerli" di bawah.');
    return r.json;
  }

  async function load() { try { var v = await Native.call('secret.get', { key: SECRET }); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function save(g) { return Native.call('secret.set', { key: SECRET, value: g ? JSON.stringify(g) : '' }); }

  async function tokenCall(meta, params) {
    var r = await http(meta.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: form(Object.assign({ client_id: CLIENT_ID }, params)), timeout: 30 });
    if (r.status >= 400 || !r.json || !r.json.access_token) throw new Error('Gagal mengambil token Sinerli (' + r.status + '): ' + String((r.json && (r.json.error_description || r.json.error)) || r.body || '').slice(0, 160));
    return r.json;
  }

  function stamp(g, t) {
    g.access_token = t.access_token;
    if (t.refresh_token) g.refresh_token = t.refresh_token;
    g.expires_at = t.expires_in ? Date.now() + t.expires_in * 1000 : 0;
    return g;
  }

  /** Ponsel: sesi browser sistem yang kembali lewat skema aplikasi. */
  async function mobileCode(url, st) {
    var back = await Native.call('oauth.start', { url: url, scheme: MOBILE_SCHEME });
    var u;
    try { u = new URL(back); } catch (e) { throw new Error('Login dibatalkan.'); }
    if (u.searchParams.get('state') !== st) throw new Error('Login ditolak: state tidak cocok.');
    var err = u.searchParams.get('error');
    if (err) throw new Error('Login ditolak: ' + (u.searchParams.get('error_description') || err));
    var code = u.searchParams.get('code');
    if (!code) throw new Error('Login dibatalkan.');
    return code;
  }

  async function login() {
    var meta = await discover(), port = 0, i, redirect;
    if (mobile()) redirect = MOBILE_REDIRECT;
    else {
      for (i = 0; i < PORTS.length && !port; i++) { try { port = await Native.call('oauth.listen', { port: PORTS[i] }); } catch (e) { port = 0; } }
      if (!port) throw new Error('Port login lokal 33430–33433 sedang dipakai aplikasi lain.');
      redirect = 'http://127.0.0.1:' + port + '/callback';
    }
    var verifier = rand(48), st = rand(18);
    var challenge = MCP._test.b64url(await MCP._test.sha256(verifier));
    var url = meta.authorization_endpoint + '?' + form({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: redirect, scope: SCOPE, state: st, code_challenge: challenge, code_challenge_method: 'S256' });
    var code = mobile() ? await mobileCode(url, st) : await new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { pending.delete(st); reject(new Error('Waktu login habis (5 menit).')); }, 300000);
      pending.set(st, { resolve: resolve, reject: reject, timer: timer });
      Native.call('app.openURL', { url: url }).catch(reject);
    });
    var t = await tokenCall(meta, { grant_type: 'authorization_code', code: code, redirect_uri: redirect, code_verifier: verifier });
    var g = stamp({ base: base(), ai_key_endpoint: meta.authorization_endpoint.replace(/\/authorize$/, '/ai-key'), token_endpoint: meta.token_endpoint, userinfo_endpoint: meta.userinfo_endpoint, revocation_endpoint: meta.revocation_endpoint }, t);
    await save(g);
    cache = null;
    try { await connectAI(); } catch (e) { /* login tetap berhasil; model bisa disambungkan manual */ }
    if (window.Sync) Sync.start();
    return me(true);
  }

  async function token() {
    var g = await load();
    if (!g || !g.access_token) return null;
    if (g.base !== base()) return null;   // alamat Sinerli diganti → perlu masuk ulang
    if (g.expires_at && Date.now() > g.expires_at - 60000) {
      if (!g.refresh_token) return null;
      try { stamp(g, await tokenCall(g, { grant_type: 'refresh_token', refresh_token: g.refresh_token })); await save(g); }
      catch (e) {
        // Refresh token dicabut/kedaluwarsa (bukan sekadar offline): sesi lokal dibersihkan.
        if (/\((400|401)\)/.test(e.message)) { await save(null); cache = null; if (window.Settings && Settings.loginGate) Settings.loginGate(); }
        return null;
      }
    }
    return g.access_token;
  }

  /** Ada sesi Sinerli tersimpan untuk server ini (tanpa jaringan; dipakai gerbang login). */
  async function signedIn() { var g = await load(); return !!(g && g.access_token && g.base === base()); }

  /* Profil + paket + izin dari /connect/userinfo. null bila belum masuk. */
  async function me(force) {
    if (cache && !force && Date.now() - cache.at < 60000) return cache.v;
    var t = await token();
    if (!t) { cache = null; return null; }
    var g = await load();
    var r = await http(g.userinfo_endpoint, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/json' } });
    if (r.status === 401) { await save(null); cache = null; if (window.Settings && Settings.loginGate) Settings.loginGate(); return null; }
    if (r.status !== 200 || !r.json) throw new Error('Gagal membaca akun Sinerli (' + r.status + ')');
    cache = { at: Date.now(), v: r.json };
    return r.json;
  }

  async function logout() {
    if (window.Sync) Sync.stop();
    var g = await load();
    // Cabut key AI perangkat ini di server (selagi token masih berlaku), lalu hapus providernya di sini.
    try {
      var t = await token();
      if (t && g && g.ai_key_endpoint) await http(g.ai_key_endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + t, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ device_id: device().id, revoke: '1' }), timeout: 15 });
    } catch (e) { /* tetap keluar secara lokal */ }
    var auto = Store.settings.providers.filter(function (x) { return x.autoSinerli; });
    if (auto.length) {
      for (var i = 0; i < auto.length; i++) await Store.setKey(auto[i].id, '');
      var gone = auto.map(function (x) { return x.id; });
      Store.settings.providers = Store.settings.providers.filter(function (x) { return gone.indexOf(x.id) < 0; });
      ['chat', 'code'].forEach(function (k) { var d = Store.settings.defaults[k]; if (d && gone.indexOf(d.providerId) >= 0) Store.settings.defaults[k] = null; });
      Store.saveSettings();
      Store.emit('settings', Store.settings);
    }
    if (g && g.revocation_endpoint) {
      var tok = g.refresh_token || g.access_token;
      try { await http(g.revocation_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ client_id: CLIENT_ID, token: tok }) }); } catch (e) { /* tetap keluar secara lokal */ }
    }
    await save(null);
    cache = null;
  }

  /* Minta API key SNR-1 untuk akun ini ke Sinerli dan pasang sebagai provider (alamat mengikuti server Sinerli). */
  async function connectAI() {
    var t = await token(), g = await load();
    if (!t || !g || !g.ai_key_endpoint) throw new Error('Masuk dengan Sinerli dulu.');
    var d = device();
    var r = await http(g.ai_key_endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + t, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ device_id: d.id, device_name: d.name }), timeout: 30 });
    if (r.status !== 200 || !r.json || !r.json.api_key) throw new Error('Sinerli menolak membuat key AI (' + r.status + '): ' + String((r.json && (r.json.error_description || r.json.error)) || '').slice(0, 160));
    var existing = Store.settings.providers.find(function (x) { return x.presetId === 'sinerli' && x.autoSinerli; });
    var p = { id: existing ? existing.id : U.uid('p_'), presetId: 'sinerli', name: 'Sinerli', kind: 'openai', baseUrl: r.json.base_url, models: [], enabled: true, autoSinerli: true };
    p.models = await Providers.listModels(p, r.json.api_key);
    p.syncedAt = Date.now();
    await Store.setKey(p.id, r.json.api_key);
    var list = Store.settings.providers.filter(function (x) { return x.id !== p.id; });
    list.push(p);
    Store.settings.providers = list;
    var m = p.models.filter(function (x) { return x.chat !== false; })[0];
    if (m) ['chat', 'code'].forEach(function (k) { var d = Store.settings.defaults[k]; if (!d || !Providers.resolve(d)) Store.settings.defaults[k] = { providerId: p.id, modelId: m.id }; });
    Store.saveSettings();
    Store.emit('settings', Store.settings);
    return { models: p.models.length, limit: r.json.monthly_token_limit };
  }

  /* Panggilan API Sinerli dengan token akun (dipakai sinkron & kontrol jarak jauh). Mengembalikan {status, json}. */
  async function authed(path, opt) {
    var t = await token();
    if (!t) throw new Error('Belum masuk Sinerli.');
    opt = opt || {};
    var headers = Object.assign({ Authorization: 'Bearer ' + t, Accept: 'application/json' }, opt.headers || {});
    var o = Object.assign({}, opt, { headers: headers });
    if (o.json !== undefined) { headers['Content-Type'] = 'application/json'; o.method = o.method || 'POST'; o.body = JSON.stringify(o.json); delete o.json; }
    return http(base() + path, o);
  }

  /** Saat aplikasi dibuka: bila sudah masuk tapi model Sinerli belum terpasang (atau key-nya hilang), pasang otomatis. */
  async function ensureAI() {
    var g = await load();
    if (!g || !g.access_token || g.base !== base()) return false;
    var p = Store.settings.providers.find(function (x) { return x.presetId === 'sinerli' && x.autoSinerli; });
    if (p && await Store.getKey(p.id)) {
      // Tetap sinkron dengan paket/model di server: segarkan daftar model tiap 6 jam (diam-diam).
      if (!p.syncedAt || Date.now() - p.syncedAt > 6 * 3600000) {
        try {
          var models = await Providers.listModels(p, await Store.getKey(p.id));
          if (models.length) { p.models = models; p.syncedAt = Date.now(); Store.saveSettings(); Store.emit('settings', Store.settings); }
        } catch (e) { if (e.status === 401) { await connectAI(); return true; } }
      }
      return false;   // termasuk yang sengaja dinonaktifkan pengguna
    }
    await connectAI();
    return true;
  }

  async function health() {
    var r = await http(base() + '/ai/v1/health', { timeout: 10 });
    return r.status === 200 ? r.json : null;
  }

  /* Halaman web Sinerli yang relevan untuk pengguna Sinai. */
  var LINKS = [
    ['Dashboard akun', '/Dashboard'],
    ['Paket & langganan', '/paket.php'],
    ['Produk digital', '/produk.php'],
    ['Racikan Model AI / API key', '/AdminDashboard#ai_blend'],
    ['Bantuan', '/bantuan.php'],
  ];
  function open(path) { return Native.call('app.openURL', { url: base() + path }); }

  window.Sinerli = { token: token, authed: authed, connectAI: connectAI, ensureAI: ensureAI, signedIn: signedIn, login: login, logout: logout, me: me, health: health, base: base, device: device, links: LINKS, open: open, DEFAULT_BASE: DEFAULT_BASE, CLIENT_ID: CLIENT_ID };
})();
