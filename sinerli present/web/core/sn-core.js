/* Sinerli Apps — Copyright © 2026 Gadtan x Gallen. All rights reserved.
 *
 * Inti bersama Sinerli Rupa, Dokum, Hitara, Present & Note:
 *   SN.native  jembatan ke shell native (Tauri desktop / WebView Android)
 *   SN.auth    login wajib lewat Sinerli Connect (OAuth 2.0 code + PKCE)
 *   SN.ctx     konteks alat (kunci alat, profil, paket) dari /connect/tool-key
 *   SN.t       terjemahan Indonesia / English
 *   SN.theme   tema terang / gelap / ikuti sistem
 *   SN.ui      gerbang login, panel akun, notifikasi
 *
 * Keamanan: token hanya disimpan di penyimpanan rahasia OS (Keychain, DPAPI,
 * Secret Service, Android Keystore) lewat shell native, tidak pernah di
 * localStorage. Fitur berbayar diperiksa server di setiap endpoint, jadi
 * mengubah kode aplikasi tidak membuka paket yang tidak dimiliki akun.
 *
 * Dimuat PALING AWAL di setiap aplikasi; kode aplikasi baru dijalankan setelah
 * SN.ready terpenuhi (sesi sah + konteks alat terisi).
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var APP = global.SN_APP || { id: 'app', name: 'Sinerli', version: '1.0.0', color: '#4f46e5' };
  var CLIENT_ID = 'sc_sinerli_apps';
  var PORTS = [33440, 33441, 33442, 33443];
  var MOBILE_SCHEME = 'com.sinerli.apps';
  var SCOPE = 'profile email plan permissions offline_access';
  var DEFAULT_BASE = 'https://sinerli.com';
  var SECRET_TOKEN = 'sn-connect';
  var SECRET_CTX = 'sn-ctx-' + APP.id;
  var OFFLINE_GRACE_MS = 7 * 24 * 3600 * 1000;   // pakai tanpa internet maks. 7 hari sejak verifikasi terakhir
  var RECHECK_MS = 10 * 60 * 1000;

  var SN = global.SN = { app: APP, version: APP.version };

  /* =============================================================== util */
  SN.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  SN.el = function (tag, attrs, html) {
    var n = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    if (html != null) n.innerHTML = html;
    return n;
  };
  SN.store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  };
  function b64url(bytes) {
    var s = '', i;
    for (i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function rand(n) { var b = new Uint8Array(n); crypto.getRandomValues(b); return b64url(b); }
  async function sha256(str) { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))); }
  function form(o) { return Object.keys(o).filter(function (k) { return o[k] != null && o[k] !== ''; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); }
  var listeners = {};
  SN.on = function (ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); };
  SN.emit = function (ev, data) { (listeners[ev] || []).slice().forEach(function (cb) { try { cb(data); } catch (e) { console.error(e); } }); };

  /* ======================================================= jembatan native */
  SN.native = (function () {
    var seq = 0, waiting = {}, handlers = {};
    var tauri = global.__TAURI__ && global.__TAURI__.core;
    var android = global.SinerliAndroid;
    var dev = !tauri && !android && global.SN_DEV_BRIDGE;   // hanya harness uji lokal, tidak ikut dipaket

    global.SN_native_resolve = function (id, ok, json) {
      var w = waiting[id];
      if (!w) return;
      delete waiting[id];
      var v = null;
      try { v = json ? JSON.parse(json) : null; } catch (e) { v = json; }
      if (ok) w.resolve(v); else w.reject(new Error(String(v || 'native error')));
    };
    global.SN_native_emit = function (name, json) {
      var v = null;
      try { v = json ? JSON.parse(json) : null; } catch (e) { v = json; }
      (handlers[name] || []).forEach(function (cb) { cb(v); });
    };

    function invoke(cmd, args) {
      args = args || {};
      if (tauri) return tauri.invoke(cmd, args);
      if (android) {
        return new Promise(function (resolve, reject) {
          var id = 'c' + (++seq);
          waiting[id] = { resolve: resolve, reject: reject };
          android.invoke(id, cmd, JSON.stringify(args));
        });
      }
      if (dev) return Promise.resolve(dev.invoke(cmd, args));
      return Promise.reject(new Error('no-native'));
    }
    function on(name, cb) {
      (handlers[name] = handlers[name] || []).push(cb);
      if (tauri && global.__TAURI__.event) global.__TAURI__.event.listen(name, function (e) { cb(e.payload); });
      if (dev && dev.on) dev.on(name, cb);
    }
    // Tauri juga berjalan di Android: login lewat deep link (bukan loopback) di ponsel.
    var onAndroid = /Android/i.test(navigator.userAgent || '');
    var platform = tauri ? (onAndroid ? 'android' : 'desktop') : android ? 'android' : dev ? 'dev' : 'web';
    return { invoke: invoke, on: on, available: platform !== 'web', platform: platform, mobile: (!!tauri && onAndroid) || !!(dev && dev.mobile) };   // shell Java Android memakai loopback seperti desktop
  })();

  /* ================================================================ i18n */
  var LANGS = ['id', 'en'];
  var dict = { id: {}, en: {} };
  SN.i18n = {
    add: function (d) { LANGS.forEach(function (l) { if (d[l]) Object.assign(dict[l], d[l]); }); },
    get lang() { return SN.lang; }
  };
  SN.lang = (function () {
    var l = SN.store.get('sinerli_lang', '');
    if (LANGS.indexOf(l) < 0) l = /^id|^ms/i.test(navigator.language || '') ? 'id' : 'en';
    return l;
  })();
  SN.t = function (k, vars) {
    var s = (dict[SN.lang] && dict[SN.lang][k]) || dict.en[k] || dict.id[k] || k;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (_, v) { return vars[v] != null ? vars[v] : ''; });
    return s;
  };
  SN.applyI18n = function (root) {
    root = root || doc;
    root.querySelectorAll('[data-sn-t]').forEach(function (n) { n.textContent = SN.t(n.getAttribute('data-sn-t')); });
    root.querySelectorAll('[data-sn-tip]').forEach(function (n) { var s = SN.t(n.getAttribute('data-sn-tip')); n.title = s; n.setAttribute('aria-label', s); });
    root.querySelectorAll('[data-sn-ph]').forEach(function (n) { n.placeholder = SN.t(n.getAttribute('data-sn-ph')); });
  };
  SN.setLang = function (l) {
    if (LANGS.indexOf(l) < 0) return;
    SN.lang = l;
    SN.store.set('sinerli_lang', l);
    doc.documentElement.lang = l;
    SN.applyI18n();
    if (global.SO && global.SO.setLang) { try { global.SO.setLang(l); } catch (e) {} }
    SN.emit('lang', l);
  };

  SN.i18n.add({
    id: {
      sn_signin_title: 'Masuk untuk melanjutkan', sn_signin_sub: 'Gunakan akun Sinerli Anda. Login dibuka di browser dan aman dengan PKCE — aplikasi tidak pernah melihat kata sandi Anda.',
      sn_signin_btn: 'Masuk dengan Sinerli', sn_signin_wait: 'Menunggu login di browser…', sn_signin_cancel: 'Batal', sn_signup: 'Belum punya akun? Daftar di sinerli.com',
      sn_checking: 'Memeriksa akun…', sn_offline: 'Mode luring — perubahan disinkronkan saat online.', sn_offline_expired: 'Sesi luring sudah lebih dari 7 hari. Sambungkan internet untuk memverifikasi akun.',
      sn_retry: 'Coba lagi', sn_err_server: 'Server Sinerli tidak merespons. Periksa internet Anda.', sn_err_denied: 'Akun ini tidak punya izin memakai aplikasi ini.',
      sn_err_incomplete: 'Buka sinerli.com sekali untuk menyelesaikan pembuatan akun, lalu coba lagi.', sn_err_ports: 'Port login lokal sedang dipakai aplikasi lain. Tutup aplikasi Sinerli lain yang sedang login lalu coba lagi.',
      sn_err_timeout: 'Waktu login habis (5 menit).', sn_err_cancel: 'Login dibatalkan.', sn_err_native: 'Buka aplikasi ini dari installer Sinerli resmi.',
      sn_account: 'Akun', sn_plan: 'Paket', sn_upgrade: 'Tingkatkan paket', sn_language: 'Bahasa', sn_theme: 'Tema', sn_light: 'Terang', sn_dark: 'Gelap', sn_system: 'Sistem',
      sn_apps: 'Aplikasi Sinerli', sn_signout: 'Keluar', sn_signout_q: 'Keluar dari akun Sinerli di perangkat ini?', sn_about: 'Tentang', sn_manage: 'Kelola akun di web',
      sn_saved: 'Tersimpan', sn_saving: 'Menyimpan…', sn_save_err: 'Gagal menyimpan', sn_exported: 'Berkas disimpan', sn_premium_only: 'Fitur ini khusus paket Premium.',
      sn_session_end: 'Sesi berakhir — silakan masuk lagi.', sn_plan_changed: 'Paket akun diperbarui: {plan}', sn_ok: 'OK', sn_cancel: 'Batal', sn_close: 'Tutup',
      sn_online_users: '{n} orang sedang mengedit', sn_share: 'Bagikan', sn_collab_live: 'Kolaborasi langsung'
    },
    en: {
      sn_signin_title: 'Sign in to continue', sn_signin_sub: 'Use your Sinerli account. Sign-in opens in your browser and is protected with PKCE — the app never sees your password.',
      sn_signin_btn: 'Sign in with Sinerli', sn_signin_wait: 'Waiting for sign-in in your browser…', sn_signin_cancel: 'Cancel', sn_signup: 'No account yet? Sign up at sinerli.com',
      sn_checking: 'Checking your account…', sn_offline: 'Offline mode — changes sync when you are back online.', sn_offline_expired: 'Offline session is older than 7 days. Connect to the internet to verify your account.',
      sn_retry: 'Try again', sn_err_server: 'Sinerli server is not responding. Check your internet connection.', sn_err_denied: 'This account is not allowed to use this app.',
      sn_err_incomplete: 'Open sinerli.com once to finish creating your account, then try again.', sn_err_ports: 'The local sign-in port is busy. Close other Sinerli apps that are signing in and try again.',
      sn_err_timeout: 'Sign-in timed out (5 minutes).', sn_err_cancel: 'Sign-in cancelled.', sn_err_native: 'Open this app from the official Sinerli installer.',
      sn_account: 'Account', sn_plan: 'Plan', sn_upgrade: 'Upgrade plan', sn_language: 'Language', sn_theme: 'Theme', sn_light: 'Light', sn_dark: 'Dark', sn_system: 'System',
      sn_apps: 'Sinerli apps', sn_signout: 'Sign out', sn_signout_q: 'Sign out of your Sinerli account on this device?', sn_about: 'About', sn_manage: 'Manage account on the web',
      sn_saved: 'Saved', sn_saving: 'Saving…', sn_save_err: 'Could not save', sn_exported: 'File saved', sn_premium_only: 'This feature needs a Premium plan.',
      sn_session_end: 'Session ended — please sign in again.', sn_plan_changed: 'Account plan updated: {plan}', sn_ok: 'OK', sn_cancel: 'Cancel', sn_close: 'Close',
      sn_online_users: '{n} people editing', sn_share: 'Share', sn_collab_live: 'Live collaboration'
    }
  });

  /* ================================================================ tema */
  var mq = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;
  SN.theme = {
    pref: SN.store.get('sn_theme', 'system'),
    get current() { return this.pref === 'system' ? (mq && mq.matches ? 'dark' : 'light') : this.pref; },
    apply: function () {
      var t = this.current;
      doc.documentElement.setAttribute('data-sn-theme', t);
      doc.documentElement.style.colorScheme = t;
      var meta = doc.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = t === 'dark' ? '#15171e' : '#ffffff';
      SN.native.invoke('set_theme', { theme: t }).catch(function () {});
      SN.emit('theme', t);
    },
    set: function (p) { this.pref = p; SN.store.set('sn_theme', p); this.apply(); }
  };
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (SN.theme.pref === 'system') SN.theme.apply(); });
  SN.theme.apply();
  doc.documentElement.lang = SN.lang;
  doc.documentElement.setAttribute('data-sn-app', APP.id);
  if (APP.color) doc.documentElement.style.setProperty('--sn-accent', APP.color);   // tombol login mengikuti warna aplikasi

  /* ================================================================ auth */
  function base() { return String(SN.store.get('sn_base', DEFAULT_BASE)).replace(/\/+$/, ''); }
  SN.base = base;

  async function secretGet(k) { try { var v = await SN.native.invoke('secret_get', { key: k }); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function secretSet(k, v) { return SN.native.invoke('secret_set', { key: k, value: v ? JSON.stringify(v) : '' }).catch(function () {}); }

  async function http(url, opt) {
    opt = opt || {};
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, (opt.timeout || 25) * 1000);
    try {
      var r = await fetch(url, { method: opt.method || 'GET', headers: Object.assign({ Accept: 'application/json' }, opt.headers || {}), body: opt.body, signal: ctrl.signal, credentials: 'omit', cache: 'no-store' });
      var txt = await r.text(), j = null;
      try { j = JSON.parse(txt); } catch (e) {}
      return { status: r.status, json: j, body: txt };
    } catch (e) {
      return { status: 0, json: null, body: '', network: true };
    } finally { clearTimeout(timer); }
  }

  var meta = null;
  async function discover() {
    if (meta) return meta;
    var r = await http(base() + '/.well-known/sinerli-connect');
    if (r.status !== 200 || !r.json || !r.json.authorization_endpoint) throw codeErr('server');
    meta = r.json;
    return meta;
  }
  function codeErr(code) { var e = new Error(SN.t('sn_err_' + code)); e.code = code; return e; }

  async function tokenCall(endpoint, params) {
    var r = await http(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(Object.assign({ client_id: CLIENT_ID }, params)), timeout: 30 });
    if (r.network) throw codeErr('server');
    if (r.status >= 400 || !r.json || !r.json.access_token) { var e = new Error((r.json && (r.json.error_description || r.json.error)) || 'token ' + r.status); e.status = r.status; throw e; }
    return r.json;
  }
  function stamp(g, t) {
    g.access_token = t.access_token;
    if (t.refresh_token) g.refresh_token = t.refresh_token;
    g.expires_at = t.expires_in ? Date.now() + t.expires_in * 1000 : 0;
    return g;
  }

  var pendingLogin = null;
  SN.native.on('oauth-callback', function (p) {
    if (!pendingLogin) return;
    var u;
    try { u = new URL(p && p.url ? p.url : String(p)); } catch (e) { return; }
    var w = pendingLogin;
    if (u.searchParams.get('state') !== w.state) return;
    pendingLogin = null;
    clearTimeout(w.timer);
    var err = u.searchParams.get('error');
    if (err) w.reject(new Error(u.searchParams.get('error_description') || err));
    else w.resolve(u.searchParams.get('code'));
  });

  SN.auth = {
    async login() {
      var m = await discover(), redirect, port = 0, i;
      var verifier = rand(48), state = rand(18);
      var challenge = b64url(await sha256(verifier));
      if (SN.native.mobile) redirect = MOBILE_SCHEME + ':/oauth/callback';
      else {
        for (i = 0; i < PORTS.length && !port; i++) { try { port = await SN.native.invoke('oauth_listen', { port: PORTS[i] }); } catch (e) { port = 0; } }
        if (!port) throw codeErr('ports');
        redirect = 'http://127.0.0.1:' + port + '/callback';
      }
      var url = m.authorization_endpoint + '?' + form({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: redirect, scope: SCOPE, state: state, code_challenge: challenge, code_challenge_method: 'S256' });
      var code = await new Promise(function (resolve, reject) {
        if (pendingLogin) pendingLogin.reject(codeErr('cancel'));
        pendingLogin = { state: state, resolve: resolve, reject: reject, timer: setTimeout(function () { pendingLogin = null; reject(codeErr('timeout')); }, 300000) };
        SN.native.invoke(SN.native.mobile ? 'oauth_start' : 'open_url', { url: url, scheme: MOBILE_SCHEME }).catch(reject);
      });
      var t = await tokenCall(m.token_endpoint, { grant_type: 'authorization_code', code: code, redirect_uri: redirect, code_verifier: verifier });
      var g = stamp({ base: base(), token_endpoint: m.token_endpoint, revocation_endpoint: m.revocation_endpoint }, t);
      await secretSet(SECRET_TOKEN, g);
      return g;
    },
    cancel: function () { if (pendingLogin) { var w = pendingLogin; pendingLogin = null; clearTimeout(w.timer); w.reject(codeErr('cancel')); } },
    /** Access token yang masih berlaku (diperbarui otomatis). null = harus login. 'offline' = jaringan putus. */
    async token() {
      var g = await secretGet(SECRET_TOKEN);
      if (!g || !g.access_token || g.base !== base()) return null;
      if (g.expires_at && Date.now() > g.expires_at - 60000) {
        if (!g.refresh_token) return null;
        try { stamp(g, await tokenCall(g.token_endpoint, { grant_type: 'refresh_token', refresh_token: g.refresh_token })); await secretSet(SECRET_TOKEN, g); }
        catch (e) {
          if (e.code === 'server') return 'offline';
          await secretSet(SECRET_TOKEN, null);   // refresh token dicabut / kedaluwarsa
          return null;
        }
      }
      return g.access_token;
    },
    async logout() {
      var g = await secretGet(SECRET_TOKEN);
      await secretSet(SECRET_TOKEN, null);
      await secretSet(SECRET_CTX, null);
      clearToolStorage();
      if (g && g.revocation_endpoint) {
        [g.refresh_token, g.access_token].filter(Boolean).forEach(function (tok) {
          http(g.revocation_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ client_id: CLIENT_ID, token: tok }) });
        });
      }
    }
  };

  /* ====================================================== konteks alat */
  function clearToolStorage() {
    ['sinerli_api_key', 'sinerli_user_profile', 'sinerli_tier_app'].forEach(function (k) { SN.store.set(k, null); });
    SN.ctx = null;
  }
  /** Isi kunci yang dibaca alat web (SO.ctx di office-core.js) supaya kodenya tetap sama dengan versi web. */
  function exposeToTools(c) {
    SN.store.set('sinerli_api_key', c.api_key);
    SN.store.set('sinerli_user_profile', JSON.stringify({ uid: 'app', email: c.email, name: c.name, displayName: c.name, photoURL: c.photo }));
    SN.store.set('sinerli_tier_app', c.plan || 'free');
    global.SO_ROOT = c.api_base;
    global.SN_API = c.api_base;
  }

  async function fetchCtx(tok) {
    var r = await http(base() + '/connect/tool-key', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ app: APP.id }) });
    if (r.network || r.status >= 500) throw codeErr('server');
    if (r.status === 401) { var e1 = new Error('unauthorized'); e1.code = 'unauthorized'; throw e1; }
    if (r.status === 403) throw codeErr('denied');
    if (r.status === 409) throw codeErr('incomplete');
    if (r.status !== 200 || !r.json || !r.json.api_key) throw codeErr('server');
    // Server di alamat lain dari base() ditolak — cegah konteks palsu yang mengarahkan API ke host asing.
    if (String(r.json.api_base || '').replace(/\/+$/, '') !== base()) r.json.api_base = base() + '/';
    r.json.verified_at = Date.now();
    return r.json;
  }

  SN.plan = function () { return (SN.ctx && SN.ctx.plan) || 'free'; };
  SN.isPremium = function () { return /premium|plus|pro|business|admin/i.test(SN.plan()); };
  SN.planLabel = function () {
    var p = SN.plan();
    return { free: 'Free', premium: 'Premium', premium_plus: 'Premium Plus', admin: 'Admin' }[p] || p.charAt(0).toUpperCase() + p.slice(1);
  };
  SN.requirePremium = function () { if (SN.isPremium()) return true; SN.ui.toast(SN.t('sn_premium_only'), 'warn'); return false; };

  /** Panggilan API Sinerli dengan kunci alat akun (sama seperti halaman web). */
  SN.api = async function (path, opt) {
    opt = opt || {};
    if (!SN.ctx) throw new Error('not signed in');
    var headers = Object.assign({ 'X-API-Key': SN.ctx.api_key }, opt.json !== undefined ? { 'Content-Type': 'application/json' } : {}, opt.headers || {});
    var r = await http(SN.ctx.api_base + path.replace(/^\//, ''), { method: opt.method || (opt.json !== undefined ? 'POST' : 'GET'), headers: headers, body: opt.json !== undefined ? JSON.stringify(opt.json) : opt.body, timeout: opt.timeout || 60 });
    if (r.network) { var e = new Error(SN.t('sn_err_server')); e.network = true; throw e; }
    if (r.status === 401) { SN.session.check(true); }
    if (r.status >= 400 || !r.json || r.json.success === false) {
      var err = new Error((r.json && (r.json.message || r.json.error)) || ('HTTP ' + r.status));
      err.status = r.status; err.data = r.json; throw err;
    }
    return r.json;
  };

  /* ============================================================== sesi */
  var readyResolve;
  SN.ready = new Promise(function (r) { readyResolve = r; });
  SN.offline = false;

  SN.session = {
    async check(silent) {
      if (!SN.native.available) { SN.ui.gate('error', SN.t('sn_err_native')); return false; }
      var tok = await SN.auth.token();
      if (tok === null) { clearToolStorage(); SN.ui.gate('signin', silent ? SN.t('sn_session_end') : ''); return false; }
      var cached = await secretGet(SECRET_CTX);
      try {
        if (tok === 'offline') throw codeErr('server');
        var c = await fetchCtx(tok);
        var prevPlan = SN.ctx && SN.ctx.plan;
        SN.ctx = c; SN.offline = false;
        exposeToTools(c);
        await secretSet(SECRET_CTX, c);
        if (prevPlan && prevPlan !== c.plan) { SN.ui.toast(SN.t('sn_plan_changed', { plan: SN.planLabel() })); SN.emit('plan', c.plan); }
      } catch (e) {
        if (e.code === 'unauthorized') { await SN.auth.logout(); SN.ui.gate('signin', SN.t('sn_session_end')); return false; }
        if (e.code === 'denied' || e.code === 'incomplete') { SN.ui.gate('error', e.message, true); return false; }
        // Jaringan putus: izinkan sesi terverifikasi terakhir (maks. 7 hari).
        if (cached && cached.api_key && Date.now() - (cached.verified_at || 0) < OFFLINE_GRACE_MS) {
          SN.ctx = cached; SN.offline = true; exposeToTools(cached);
          if (!silent) SN.ui.toast(SN.t('sn_offline'), 'warn');
        } else if (!SN.ctx) { SN.ui.gate('error', cached ? SN.t('sn_offline_expired') : SN.t('sn_err_server'), true); return false; }
      }
      SN.ui.ungate();
      if (readyResolve) { var r = readyResolve; readyResolve = null; r(SN.ctx); }
      SN.emit('session', SN.ctx);
      return true;
    }
  };
  setInterval(function () { if (SN.ctx) SN.session.check(true); }, RECHECK_MS);
  doc.addEventListener('visibilitychange', function () { if (!doc.hidden && SN.ctx && Date.now() - (SN.ctx.verified_at || 0) > 60000) SN.session.check(true); });
  global.addEventListener('online', function () { if (SN.offline) SN.session.check(true); });

  /* ========================================================= unduhan native */
  // Webview desktop/ponsel tidak menangani <a download>; berkas ekspor dialihkan ke dialog simpan OS.
  function blobToB64(blob) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1] || ''); }; fr.onerror = rej; fr.readAsDataURL(blob); });
  }
  SN.saveFile = async function (name, blob) {
    if (!SN.native.available) { var a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; nativeClick.call(a); return; }
    var data = await blobToB64(blob);
    var saved = await SN.native.invoke('save_file', { name: name, mime: blob.type || 'application/octet-stream', data: data });
    if (saved) SN.ui.toast(SN.t('sn_exported'));
  };
  var nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var href = this.href || '';
    if (SN.native.available && this.hasAttribute('download') && /^(blob:|data:)/.test(href)) {
      var name = this.getAttribute('download') || 'download';
      fetch(href).then(function (r) { return r.blob(); }).then(function (b) { return SN.saveFile(name, b); }).catch(function (e) { console.error(e); });
      return;
    }
    if (SN.native.available && /^https?:/.test(href) && !this.hasAttribute('download') && this.target === '_blank') { SN.native.invoke('open_url', { url: href }); return; }
    return nativeClick.apply(this, arguments);
  };
  doc.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || !SN.native.available || e.defaultPrevented) return;
    var href = a.href || '';
    if (a.hasAttribute('download') && /^(blob:|data:)/.test(href)) { e.preventDefault(); a.click(); return; }
    if (/^https?:/.test(href) && new URL(href).origin !== location.origin) { e.preventDefault(); SN.native.invoke('open_url', { url: href }); }
  }, true);
  var nativeOpen = global.open;
  global.open = function (url) {
    if (SN.native.available && url && /^https?:/.test(String(url)) && new URL(String(url), location.href).origin !== location.origin) { SN.native.invoke('open_url', { url: String(url) }); return null; }
    return nativeOpen.apply(global, arguments);
  };
  // Tautan sinerli-<app>://open?share=<token> → aplikasi bergabung ke dokumen bersama.
  SN.native.on('deep-link', function (p) {
    var m = String((p && p.url) || p || '').match(/[?&]share=([a-f0-9]{32})/i);
    if (!m) return;
    var token = m[1].toLowerCase();
    SN.ready.then(function () { SN.emit('share-link', token); });
  });
  SN.openWeb = function (path) { return SN.native.invoke('open_url', { url: base() + (path || '/') }); };

  /* ================================================================== UI */
  var APPS = [
    { id: 'rupa', name: 'Sinerli Rupa', icon: '◆', color: '#e8590c' },
    { id: 'dokum', name: 'Sinerli Dokum', icon: '▤', color: '#4f46e5' },
    { id: 'hitara', name: 'Sinerli Hitara', icon: '▦', color: '#0f766e' },
    { id: 'present', name: 'Sinerli Present', icon: '▶', color: '#be185d' },
    { id: 'note', name: 'Sinerli Note', icon: '✎', color: '#334155' },
    { id: 'sinai', name: 'Sinai', icon: '✦', color: '#245edb' }
  ];
  SN.apps = APPS;

  var gateEl = null, panelEl = null, toastWrap = null;
  SN.ui = {
    gate: function (mode, msg, retry) {
      if (!gateEl) { gateEl = SN.el('div', { class: 'sn-gate', role: 'dialog', 'aria-modal': 'true' }); doc.body.appendChild(gateEl); }
      doc.documentElement.classList.add('sn-gated');
      var logo = '<div class="sn-gate-logo" style="--c:' + APP.color + '">' + SN.esc(APP.icon || APP.name.charAt(0)) + '</div>';
      var head = logo + '<h1 class="sn-gate-app">' + SN.esc(APP.name) + '</h1>';
      if (mode === 'loading') {
        gateEl.innerHTML = '<div class="sn-gate-card">' + head + '<div class="sn-spinner"></div><p class="sn-gate-sub">' + SN.esc(msg || SN.t('sn_checking')) + '</p></div>';
        return;
      }
      if (mode === 'error') {
        gateEl.innerHTML = '<div class="sn-gate-card">' + head + '<p class="sn-gate-err">' + SN.esc(msg) + '</p>' +
          (retry ? '<button class="sn-btn sn-btn-primary" data-a="retry">' + SN.esc(SN.t('sn_retry')) + '</button> <button class="sn-btn" data-a="out">' + SN.esc(SN.t('sn_signout')) + '</button>' : '') + '</div>';
      } else {
        gateEl.innerHTML = '<div class="sn-gate-card">' + head +
          '<h2 class="sn-gate-title">' + SN.esc(SN.t('sn_signin_title')) + '</h2>' +
          '<p class="sn-gate-sub">' + SN.esc(SN.t('sn_signin_sub')) + '</p>' +
          (msg ? '<p class="sn-gate-err">' + SN.esc(msg) + '</p>' : '') +
          '<button class="sn-btn sn-btn-primary sn-btn-lg" data-a="login">' + SN.esc(SN.t('sn_signin_btn')) + '</button>' +
          '<button class="sn-link" data-a="signup">' + SN.esc(SN.t('sn_signup')) + '</button>' +
          '<div class="sn-gate-foot"><button class="sn-link" data-a="lang">' + (SN.lang === 'id' ? 'English' : 'Bahasa Indonesia') + '</button></div></div>';
      }
      gateEl.onclick = async function (e) {
        var a = e.target.closest('[data-a]');
        if (!a) return;
        var act = a.getAttribute('data-a');
        if (act === 'lang') { SN.setLang(SN.lang === 'id' ? 'en' : 'id'); SN.ui.gate(mode, msg, retry); }
        if (act === 'signup') SN.openWeb('/');
        if (act === 'retry') { SN.ui.gate('loading'); SN.session.check(); }
        if (act === 'out') { await SN.auth.logout(); SN.ui.gate('signin'); }
        if (act === 'cancel') { SN.auth.cancel(); }
        if (act === 'login') {
          gateEl.querySelector('.sn-gate-card').innerHTML = head + '<div class="sn-spinner"></div><p class="sn-gate-sub">' + SN.esc(SN.t('sn_signin_wait')) + '</p><button class="sn-btn" data-a="cancel">' + SN.esc(SN.t('sn_signin_cancel')) + '</button>';
          try { await SN.auth.login(); SN.ui.gate('loading'); await SN.session.check(); }
          catch (err) { SN.ui.gate('signin', err.code === 'cancel' ? '' : err.message); }
        }
      };
    },
    ungate: function () { if (gateEl) { gateEl.remove(); gateEl = null; } doc.documentElement.classList.remove('sn-gated'); },
    toast: function (msg, kind) {
      if (!toastWrap) { toastWrap = SN.el('div', { class: 'sn-toasts', 'aria-live': 'polite' }); doc.body.appendChild(toastWrap); }
      var t = SN.el('div', { class: 'sn-toast' + (kind ? ' is-' + kind : ''), text: msg });
      toastWrap.appendChild(t);
      setTimeout(function () { t.classList.add('is-out'); setTimeout(function () { t.remove(); }, 300); }, 3200);
    },
    confirm: function (msg) {
      return new Promise(function (resolve) {
        var bd = SN.el('div', { class: 'sn-modal-bd' });
        bd.innerHTML = '<div class="sn-modal" role="alertdialog"><p>' + SN.esc(msg) + '</p><div class="sn-modal-act"><button class="sn-btn" data-v="0">' + SN.esc(SN.t('sn_cancel')) + '</button><button class="sn-btn sn-btn-primary" data-v="1">' + SN.esc(SN.t('sn_ok')) + '</button></div></div>';
        bd.addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (b || e.target === bd) { bd.remove(); resolve(!!(b && b.getAttribute('data-v') === '1')); } });
        doc.body.appendChild(bd);
        bd.querySelector('[data-v="1"]').focus();
      });
    },
    prompt: function (msg, value) {
      return new Promise(function (resolve) {
        var bd = SN.el('div', { class: 'sn-modal-bd' });
        bd.innerHTML = '<form class="sn-modal"><label>' + SN.esc(msg) + '<input class="sn-input" value="' + SN.esc(value || '') + '"></label><div class="sn-modal-act"><button type="button" class="sn-btn" data-v="0">' + SN.esc(SN.t('sn_cancel')) + '</button><button class="sn-btn sn-btn-primary">' + SN.esc(SN.t('sn_ok')) + '</button></div></form>';
        var inp = bd.querySelector('input');
        bd.querySelector('form').onsubmit = function (e) { e.preventDefault(); bd.remove(); resolve(inp.value); };
        bd.addEventListener('click', function (e) { if (e.target === bd || e.target.getAttribute('data-v') === '0') { bd.remove(); resolve(null); } });
        doc.body.appendChild(bd);
        inp.focus(); inp.select();
      });
    },
    /** Tombol akun (avatar) — dipasang di bar atas aplikasi, atau melayang bila tidak ada slot. */
    accountButton: function (slot) {
      var b = SN.el('button', { class: 'sn-acct-btn' + (slot ? '' : ' is-floating'), type: 'button', 'data-sn-tip': 'sn_account' });
      function paint() {
        var c = SN.ctx || {};
        b.innerHTML = c.photo ? '<img alt="" src="' + SN.esc(c.photo) + '" referrerpolicy="no-referrer">' : '<span>' + SN.esc((c.name || c.email || '?').charAt(0).toUpperCase()) + '</span>';
        if (SN.offline) b.classList.add('is-offline'); else b.classList.remove('is-offline');
      }
      paint();
      SN.on('session', paint);
      b.addEventListener('click', function (e) { e.stopPropagation(); SN.ui.panel(b); });
      (slot || doc.body).appendChild(b);
      SN.applyI18n(b.parentNode);
      return b;
    },
    panel: function (anchor) {
      if (panelEl) { panelEl.remove(); panelEl = null; return; }
      var c = SN.ctx || {};
      panelEl = SN.el('div', { class: 'sn-panel', role: 'menu' });
      var seg = function (name, opts, cur) {
        return '<div class="sn-seg" data-seg="' + name + '">' + opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '" class="' + (o[0] === cur ? 'is-on' : '') + '">' + SN.esc(o[1]) + '</button>'; }).join('') + '</div>';
      };
      panelEl.innerHTML =
        '<div class="sn-panel-user">' + (c.photo ? '<img alt="" src="' + SN.esc(c.photo) + '" referrerpolicy="no-referrer">' : '<span class="sn-av">' + SN.esc((c.name || c.email || '?').charAt(0).toUpperCase()) + '</span>') +
        '<div><b>' + SN.esc(c.name || c.email || '') + '</b><small>' + SN.esc(c.email || '') + '</small></div></div>' +
        '<div class="sn-panel-row"><span>' + SN.esc(SN.t('sn_plan')) + '</span><span class="sn-plan sn-plan-' + SN.esc(SN.plan()) + '">' + SN.esc(SN.planLabel()) + '</span></div>' +
        (SN.isPremium() ? '' : '<button class="sn-btn sn-btn-primary sn-w100" data-a="upgrade">' + SN.esc(SN.t('sn_upgrade')) + '</button>') +
        (SN.offline ? '<p class="sn-panel-note">' + SN.esc(SN.t('sn_offline')) + '</p>' : '') +
        '<label class="sn-panel-lbl">' + SN.esc(SN.t('sn_language')) + '</label>' + seg('lang', [['id', 'Indonesia'], ['en', 'English']], SN.lang) +
        (APP.noTheme ? '' : '<label class="sn-panel-lbl">' + SN.esc(SN.t('sn_theme')) + '</label>' + seg('theme', [['light', SN.t('sn_light')], ['dark', SN.t('sn_dark')], ['system', SN.t('sn_system')]], SN.theme.pref)) +
        '<label class="sn-panel-lbl">' + SN.esc(SN.t('sn_apps')) + '</label><div class="sn-apps">' +
        APPS.map(function (a) { return '<button type="button" data-app="' + a.id + '" class="' + (a.id === APP.id ? 'is-cur' : '') + '" title="' + SN.esc(a.name) + '"><i style="--c:' + a.color + '">' + a.icon + '</i><span>' + SN.esc(a.name.replace('Sinerli ', '')) + '</span></button>'; }).join('') + '</div>' +
        '<div class="sn-panel-foot"><button class="sn-link" data-a="web">' + SN.esc(SN.t('sn_manage')) + '</button><button class="sn-link sn-danger" data-a="out">' + SN.esc(SN.t('sn_signout')) + '</button></div>' +
        '<div class="sn-panel-ver">' + SN.esc(APP.name) + ' ' + SN.esc(APP.version) + ' · © Gadtan x Gallen</div>';
      doc.body.appendChild(panelEl);
      var r = anchor.getBoundingClientRect();
      var w = panelEl.offsetWidth;
      panelEl.style.top = Math.min(r.bottom + 8, innerHeight - panelEl.offsetHeight - 8) + 'px';
      panelEl.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
      panelEl.addEventListener('click', async function (e) {
        e.stopPropagation();
        var s = e.target.closest('[data-seg] button');
        if (s) {
          var which = s.parentNode.getAttribute('data-seg'), v = s.getAttribute('data-v');
          if (which === 'lang') SN.setLang(v); else SN.theme.set(v);
          panelEl.remove(); panelEl = null; SN.ui.panel(anchor);
          return;
        }
        var app = e.target.closest('[data-app]');
        if (app && app.getAttribute('data-app') !== APP.id) {
          var id = app.getAttribute('data-app');
          SN.native.invoke('launch_app', { appId: id }).catch(function () { SN.openWeb('/download?app=' + id); });
        }
        var a = e.target.closest('[data-a]');
        if (!a) return;
        var act = a.getAttribute('data-a');
        if (act === 'upgrade') SN.openWeb('/paket.php');
        if (act === 'web') SN.openWeb('/Dashboard/');
        if (act === 'out' && await SN.ui.confirm(SN.t('sn_signout_q'))) { panelEl && panelEl.remove(); panelEl = null; await SN.auth.logout(); SN.ui.gate('signin'); }
      });
    }
  };
  doc.addEventListener('click', function () { if (panelEl) { panelEl.remove(); panelEl = null; } });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panelEl) { panelEl.remove(); panelEl = null; } });

  /* ============================================================ mulai */
  function boot() {
    SN.ui.gate('loading');
    SN.session.check();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
