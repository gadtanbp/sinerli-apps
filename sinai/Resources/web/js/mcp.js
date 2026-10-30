/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Model Context Protocol client. Connects local (stdio) and remote MCP
   servers — Streamable HTTP and legacy SSE, with one-click OAuth 2.1 sign-in
   (discovery, dynamic client registration, PKCE, auto refresh) — plus plain
   REST APIs wrapped as a CRUD tool. Tools are exposed to the model as
   mcp__<server>__<tool>. Secrets (tokens, passwords, OAuth grants) live in
   the system keychain, never in settings.json. */
(function () {
  'use strict';

  var PROTOCOL = '2025-06-18';
  var servers = new Map();   // id -> state
  var listeners = [];

  function notify() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  function slug(s) { return String(s || 'server').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'server'; }

  function state(cfg) {
    var s = servers.get(cfg.id);
    if (!s) {
      s = { cfg: cfg, rc: cfg, status: 'off', tools: [], error: '', log: '', pending: new Map(), seq: 0, sessionId: null };
      servers.set(cfg.id, s);
    }
    s.cfg = cfg;
    return s;
  }

  // ---------------------------------------------------------------- secrets & templates

  /* Connection fields (tokens, URLs, folders) of one connector, kept in the keychain. */
  async function getFields(id) {
    try { var v = await Native.call('secret.get', { key: 'mcp-fields:' + id }); return v ? JSON.parse(v) : {}; } catch (e) { return {}; }
  }
  async function setFields(id, obj) {
    await Native.call('secret.set', { key: 'mcp-fields:' + id, value: obj && Object.keys(obj).length ? JSON.stringify(obj) : '' });
  }

  function fill(v, f) {
    if (typeof v === 'string') return v.replace(/\{\{(\w+)\}\}/g, function (_, k) { return f[k] != null ? String(f[k]) : ''; });
    if (Array.isArray(v)) return v.map(function (x) { return fill(x, f); }).filter(function (x) { return x !== ''; });
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { var x = fill(v[k], f), kk = fill(k, f); if (x !== '' && kk !== '') o[kk] = x; }); return o; }
    return v;
  }

  /* The config with {{field}} placeholders filled from the keychain. */
  async function resolved(cfg) {
    var f = await getFields(cfg.id);
    var rc = Object.assign({}, cfg);
    ['url', 'baseUrl', 'command', 'args', 'env', 'headers', 'query', 'cwd'].forEach(function (k) { if (cfg[k] != null) rc[k] = fill(cfg[k], f); });
    return rc;
  }

  // ---------------------------------------------------------------- OAuth 2.1 (MCP authorization spec)

  var OAUTH_PORT = 33430;
  var pendingAuth = new Map();   // state -> {resolve, reject, timer}

  Native.on('oauth.callback', function (p) {
    var u;
    try { u = new URL(p.url); } catch (e) { return; }
    var w = pendingAuth.get(u.searchParams.get('state') || '');
    if (!w) return;
    pendingAuth.delete(u.searchParams.get('state'));
    clearTimeout(w.timer);
    var err = u.searchParams.get('error');
    if (err) w.reject(new Error('Login ditolak: ' + (u.searchParams.get('error_description') || err)));
    else w.resolve(u.searchParams.get('code'));
  });

  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function randomString(n) {
    var a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return b64url(a).slice(0, n);
  }
  /* SHA-256 (WebCrypto when available; small fallback otherwise). */
  async function sha256(str) {
    var data = new TextEncoder().encode(str);
    if (window.crypto && crypto.subtle) {
      try { return new Uint8Array(await crypto.subtle.digest('SHA-256', data)); } catch (e) { /* fall back */ }
    }
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = data.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
    m.set(data); m[l] = 0x80;
    var bits = l * 8;
    for (var i = 0; i < 4; i++) m[n - 1 - i] = (bits >>> (8 * i)) & 255;
    var w = new Array(64);
    function rotr(x, c) { return (x >>> c) | (x << (32 - c)); }
    for (var o = 0; o < n; o += 64) {
      for (var t = 0; t < 16; t++) w[t] = (m[o + 4 * t] << 24) | (m[o + 4 * t + 1] << 16) | (m[o + 4 * t + 2] << 8) | m[o + 4 * t + 3];
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3), s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
        var t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = new Uint8Array(32);
    H.forEach(function (v, k) { out[4 * k] = v >>> 24; out[4 * k + 1] = (v >>> 16) & 255; out[4 * k + 2] = (v >>> 8) & 255; out[4 * k + 3] = v & 255; });
    return out;
  }

  async function getJSON(url) {
    var r = await Native.call('http.request', { url: url, method: 'GET', headers: { Accept: 'application/json', 'MCP-Protocol-Version': PROTOCOL }, timeout: 20 });
    if (r.status !== 200) return null;
    try { return JSON.parse(r.body); } catch (e) { return null; }
  }

  async function loadGrant(id) {
    try { var v = await Native.call('secret.get', { key: 'mcp-oauth:' + id }); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function saveGrant(id, g) { return Native.call('secret.set', { key: 'mcp-oauth:' + id, value: g ? JSON.stringify(g) : '' }); }

  /* Finds the authorization server of an MCP server (RFC 9728 → RFC 8414 / OIDC). */
  async function discover(serverUrl, wwwAuth) {
    var u = new URL(serverUrl);
    var hinted = /resource_metadata="([^"]+)"/.exec(wwwAuth || '');
    var prm = null;
    var cands = hinted ? [hinted[1]] : [];
    cands.push(u.origin + '/.well-known/oauth-protected-resource' + (u.pathname !== '/' ? u.pathname.replace(/\/$/, '') : ''), u.origin + '/.well-known/oauth-protected-resource');
    for (var i = 0; i < cands.length && !prm; i++) { try { prm = await getJSON(cands[i]); } catch (e) { /* next */ } }
    var issuer = (prm && prm.authorization_servers && prm.authorization_servers[0]) || u.origin;
    var iu = new URL(issuer), path = iu.pathname.replace(/\/$/, '');
    var asCands = path
      ? [iu.origin + '/.well-known/oauth-authorization-server' + path, iu.origin + '/.well-known/openid-configuration' + path, iu.origin + path + '/.well-known/openid-configuration']
      : [iu.origin + '/.well-known/oauth-authorization-server', iu.origin + '/.well-known/openid-configuration'];
    var meta = null;
    for (var j = 0; j < asCands.length && !meta; j++) { try { meta = await getJSON(asCands[j]); } catch (e) { /* next */ } }
    // MCP 2025-03-26 fallback: default endpoints at the server origin.
    if (!meta) meta = { issuer: iu.origin, authorization_endpoint: iu.origin + '/authorize', token_endpoint: iu.origin + '/token', registration_endpoint: iu.origin + '/register' };
    return { meta: meta, scopes: (prm && prm.scopes_supported) || null, resource: (prm && prm.resource) || serverUrl };
  }

  function form(obj) {
    return Object.keys(obj).filter(function (k) { return obj[k] != null && obj[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); }).join('&');
  }

  async function tokenRequest(grant, params) {
    var headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
    var body = Object.assign({ client_id: grant.client_id }, params);
    if (grant.client_secret) {
      if (grant.auth_method === 'client_secret_basic') { headers.Authorization = 'Basic ' + btoa(grant.client_id + ':' + grant.client_secret); delete body.client_id; }
      else body.client_secret = grant.client_secret;
    }
    var r = await Native.call('http.request', { url: grant.token_endpoint, method: 'POST', headers: headers, body: form(body), timeout: 30 });
    var j = null;
    try { j = JSON.parse(r.body); } catch (e) { j = U.parseJSONLoose ? U.parseJSONLoose(r.body) : null; }
    if (r.status >= 400 || !j || !j.access_token) throw new Error('Gagal mengambil token (' + r.status + '): ' + String((j && (j.error_description || j.error)) || r.body || '').slice(0, 200));
    return j;
  }

  /* Full browser sign-in. Resolves when the user approved access in their browser. */
  async function login(cfg, wwwAuth) {
    var rc = await resolved(cfg);
    var port, redirect;
    // Ponsel: tidak ada server loopback — kembali lewat skema aplikasi (RFC 8252).
    if (U.isMobile()) redirect = 'com.sinerli.sinai:/oauth/mcp';
    else {
      try { port = await Native.call('oauth.listen', { port: OAUTH_PORT }); } catch (e) { port = await Native.call('oauth.listen', { port: 0 }); }
      redirect = 'http://127.0.0.1:' + port + '/callback';
    }
    var d = await discover(rc.url, wwwAuth);
    var prev = (await loadGrant(cfg.id)) || {};
    var client = null;
    if (cfg.oauth && cfg.oauth.clientId) client = { client_id: cfg.oauth.clientId, client_secret: (await getFields(cfg.id)).clientSecret || '' };
    else if (prev.client_id && prev.redirect_uri === redirect && prev.token_endpoint === d.meta.token_endpoint) client = { client_id: prev.client_id, client_secret: prev.client_secret, auth_method: prev.auth_method };
    else {
      if (!d.meta.registration_endpoint) throw new Error(cfg.name + ' tidak mendukung pendaftaran otomatis. Isi Client ID di Kustomisasi konektor.');
      var reg = await Native.call('http.request', { url: d.meta.registration_endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, timeout: 30,
        body: JSON.stringify({ client_name: 'Sinai', client_uri: 'https://sinai.app', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: d.scopes ? d.scopes.join(' ') : undefined }) });
      var rj = null;
      try { rj = JSON.parse(reg.body); } catch (e) { rj = null; }
      if (reg.status >= 400 || !rj || !rj.client_id) throw new Error('Pendaftaran klien OAuth ditolak (' + reg.status + '): ' + String(reg.body || '').slice(0, 200));
      client = { client_id: rj.client_id, client_secret: rj.client_secret || '', auth_method: rj.token_endpoint_auth_method };
    }
    var verifier = randomString(64), st = randomString(24);
    var challenge = b64url(await sha256(verifier));
    var scope = (cfg.oauth && cfg.oauth.scope) || (d.scopes ? d.scopes.join(' ') : '');
    var authUrl = d.meta.authorization_endpoint + (d.meta.authorization_endpoint.indexOf('?') >= 0 ? '&' : '?') + form({
      response_type: 'code', client_id: client.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256',
      state: st, scope: scope, resource: d.resource,
    });
    var code = U.isMobile() ? await (async function () {
      var back = new URL(await Native.call('oauth.start', { url: authUrl, scheme: 'com.sinerli.sinai' }));
      if (back.searchParams.get('state') !== st) throw new Error('Login ditolak: state tidak cocok.');
      if (back.searchParams.get('error')) throw new Error('Login ditolak: ' + (back.searchParams.get('error_description') || back.searchParams.get('error')));
      if (!back.searchParams.get('code')) throw new Error('Login dibatalkan.');
      return back.searchParams.get('code');
    })() : await new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { pendingAuth.delete(st); reject(new Error('Waktu login habis (5 menit). Coba hubungkan lagi.')); }, 5 * 60000);
      pendingAuth.set(st, { resolve: resolve, reject: reject, timer: timer });
      Native.call('app.openURL', { url: authUrl }).catch(reject);
    });
    var grant = Object.assign({}, client, { token_endpoint: d.meta.token_endpoint, redirect_uri: redirect, resource: d.resource });
    var tok = await tokenRequest(grant, { grant_type: 'authorization_code', code: code, redirect_uri: redirect, code_verifier: verifier, resource: d.resource });
    grant.access_token = tok.access_token;
    grant.refresh_token = tok.refresh_token || prev.refresh_token || '';
    grant.expires_at = tok.expires_in ? Date.now() + tok.expires_in * 1000 : 0;
    await saveGrant(cfg.id, grant);
    return grant;
  }

  /* Current access token, refreshed when it is about to expire. */
  async function accessToken(cfg, force) {
    var g = await loadGrant(cfg.id);
    if (!g || !g.access_token) return null;
    if (force || (g.expires_at && Date.now() > g.expires_at - 60000)) {
      if (!g.refresh_token) return force ? null : g.access_token;
      try {
        var t = await tokenRequest(g, { grant_type: 'refresh_token', refresh_token: g.refresh_token, resource: g.resource });
        g.access_token = t.access_token;
        if (t.refresh_token) g.refresh_token = t.refresh_token;
        g.expires_at = t.expires_in ? Date.now() + t.expires_in * 1000 : 0;
        await saveGrant(cfg.id, g);
      } catch (e) { return null; }
    }
    return g.access_token;
  }

  // ---------------------------------------------------------------- transport

  Native.on('mcp.message', function (p) {
    var s = servers.get(p.id);
    if (!s) return;
    var msg;
    try { msg = JSON.parse(p.line); } catch (e) { s.log += p.line + '\n'; return; }
    handleMessage(s, msg);
  });
  Native.on('mcp.log', function (p) {
    var s = servers.get(p.id);
    if (s) { s.log = (s.log + p.text).slice(-20000); }
  });
  Native.on('mcp.exit', function (p) {
    var s = servers.get(p.id);
    if (!s) return;
    if (s.status !== 'off') { s.status = 'error'; s.error = 'Proses berhenti (kode ' + p.code + ')'; }
    s.pending.forEach(function (w) { w.reject(new Error('Server MCP berhenti')); });
    s.pending.clear();
    notify();
  });

  function handleMessage(s, msg) {
    if (msg.id != null && (msg.result !== undefined || msg.error)) {
      var w = s.pending.get(msg.id);
      if (!w) return;
      s.pending.delete(msg.id);
      clearTimeout(w.timer);
      if (msg.error) w.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else w.resolve(msg.result);
    } else if (msg.method && msg.id != null) {
      // server → client requests we don't support (sampling, roots…)
      var reply = msg.method === 'ping' ? { jsonrpc: '2.0', id: msg.id, result: {} } :
        msg.method === 'roots/list' ? { jsonrpc: '2.0', id: msg.id, result: { roots: [] } } :
        { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Not supported by Sinai' } };
      sendRaw(s, reply);
    } else if (msg.method === 'notifications/tools/list_changed') {
      listTools(s).then(notify).catch(function () {});
    }
  }

  function sendRaw(s, obj) {
    if (s.cfg.type === 'http') return httpPost(s, obj);
    if (s.cfg.type === 'sse') return ssePost(s, obj);
    return Native.call('mcp.send', { id: s.cfg.id, line: JSON.stringify(obj) });
  }

  async function authHeaders(s, force) {
    if (s.cfg.auth !== 'oauth') return {};
    var t = await accessToken(s.cfg, force);
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  function needsLogin(res) {
    var e = new Error('Perlu login ke ' + (res.name || 'layanan ini'));
    e.needsAuth = true;
    e.wwwAuth = res.headers && res.headers['www-authenticate'];
    return e;
  }

  async function httpPost(s, obj, retried) {
    var headers = Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': PROTOCOL }, s.rc.headers || {}, await authHeaders(s, retried));
    if (s.sessionId) headers['Mcp-Session-Id'] = s.sessionId;
    var res = await Native.call('http.request', { url: s.rc.url, method: 'POST', headers: headers, body: JSON.stringify(obj), timeout: 600 });
    if (res.headers['mcp-session-id']) s.sessionId = res.headers['mcp-session-id'];
    if (res.status === 401 || (res.status === 403 && s.cfg.auth === 'oauth')) {
      if (s.cfg.auth === 'oauth' && !retried && await accessToken(s.cfg, true)) return httpPost(s, obj, true);
      throw needsLogin({ name: s.cfg.name, headers: res.headers });
    }
    if (res.status === 404 && s.sessionId && obj.method !== 'initialize') { s.sessionId = null; throw new Error('Sesi MCP kedaluwarsa — hubungkan ulang'); }
    if (res.status >= 400) { var he = new Error('HTTP ' + res.status + ': ' + String(res.body || '').slice(0, 300)); he.status = res.status; throw he; }
    var body = res.body || '';
    var msgs = [];
    if (/event-stream/.test(res.headers['content-type'] || '')) {
      body.split('\n').forEach(function (l) { if (l.indexOf('data:') === 0) { try { msgs.push(JSON.parse(l.slice(5).trim())); } catch (e) { /* skip */ } } });
    } else if (body.trim()) {
      var j = JSON.parse(body);
      msgs = Array.isArray(j) ? j : [j];
    }
    msgs.forEach(function (m) { handleMessage(s, m); });
  }

  /* Legacy HTTP+SSE transport (2024-11-05): a GET event stream announces the
     POST endpoint; responses arrive on the stream. */
  function sseConnect(s) {
    if (s.sseReady) return s.sseReady;
    s.sseReady = (async function () {
      var headers = Object.assign({ Accept: 'text/event-stream' }, s.rc.headers || {}, await authHeaders(s));
      return new Promise(function (resolve, reject) {
        var buf = '', ev = '', data = [], got = false;
        function dispatch() {
          var d = data.join('\n');
          if (ev === 'endpoint') {
            s.postUrl = new URL(d.trim(), s.rc.url).href;
            if (!got) { got = true; resolve(); }
          } else if (d) {
            try { handleMessage(s, JSON.parse(d)); } catch (e) { /* ignore */ }
          }
          ev = ''; data = [];
        }
        var handle = Native.stream({ url: s.rc.url, method: 'GET', headers: headers }, function (chunk) {
          buf += chunk;
          var lines = buf.split(/\r?\n/);
          buf = lines.pop();
          lines.forEach(function (l) {
            if (l === '') dispatch();
            else if (l.indexOf('event:') === 0) ev = l.slice(6).trim();
            else if (l.indexOf('data:') === 0) data.push(l.slice(5).replace(/^ /, ''));
          });
        });
        s.sseHandle = handle;
        var timer = setTimeout(function () { if (!got) { handle.abort(); reject(new Error('Server SSE tidak merespons')); } }, 30000);
        handle.promise.then(function (res) {
          clearTimeout(timer);
          s.sseHandle = null; s.sseReady = null;
          if (!got) reject(res.status === 401 ? needsLogin({ name: s.cfg.name, headers: res.headers }) : new Error('HTTP ' + res.status + ' saat membuka SSE'));
          else if (s.status === 'ready') { s.status = 'error'; s.error = 'Koneksi terputus — akan tersambung lagi saat dipakai'; notify(); }
        }, function (e) { clearTimeout(timer); s.sseHandle = null; s.sseReady = null; if (!got) reject(e); });
      });
    })();
    s.sseReady.catch(function () { s.sseReady = null; });
    return s.sseReady;
  }

  async function ssePost(s, obj) {
    if (!s.sseHandle) await sseConnect(s);
    var headers = Object.assign({ 'Content-Type': 'application/json' }, s.rc.headers || {}, await authHeaders(s));
    var res = await Native.call('http.request', { url: s.postUrl, method: 'POST', headers: headers, body: JSON.stringify(obj), timeout: 600 });
    if (res.status === 401) throw needsLogin({ name: s.cfg.name, headers: res.headers });
    if (res.status >= 400) throw new Error('HTTP ' + res.status + ': ' + String(res.body || '').slice(0, 300));
    if (res.body && res.body.trim().charAt(0) === '{') { try { handleMessage(s, JSON.parse(res.body)); } catch (e) { /* stream carries it */ } }
  }

  function rpc(s, method, params, timeoutMs) {
    var id = ++s.seq;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { s.pending.delete(id); reject(new Error('Waktu habis menunggu ' + method)); }, timeoutMs || 60000);
      s.pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      Promise.resolve(sendRaw(s, { jsonrpc: '2.0', id: id, method: method, params: params || {} })).catch(function (e) {
        clearTimeout(timer); s.pending.delete(id); reject(e);
      });
    });
  }

  async function listTools(s) {
    var tools = [], cursor;
    do {
      var r = await rpc(s, 'tools/list', cursor ? { cursor: cursor } : {});
      tools = tools.concat(r.tools || []);
      cursor = r.nextCursor;
    } while (cursor);
    s.tools = tools;
    return tools;
  }

  // ---------------------------------------------------------------- REST API connectors (CRUD on any web API)

  async function restSetup(s) {
    var rc = s.rc;
    var endpoints = '';
    if (rc.openapi) {
      try {
        var spec = await getJSON(rc.openapi);
        var lines = [];
        Object.keys((spec && spec.paths) || {}).forEach(function (p) {
          Object.keys(spec.paths[p]).forEach(function (m) {
            if (!/^(get|post|put|patch|delete)$/.test(m)) return;
            var op = spec.paths[p][m] || {};
            lines.push(m.toUpperCase() + ' ' + p + (op.summary ? ' — ' + String(op.summary).slice(0, 80) : ''));
          });
        });
        endpoints = lines.slice(0, 120).join('\n');
      } catch (e) { s.log += 'OpenAPI: ' + e.message + '\n'; }
    }
    var methods = rc.readOnly ? ['GET'] : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    s.tools = [{
      name: 'request', title: 'Panggil API',
      description: 'Call the ' + s.cfg.name + ' REST API (base URL ' + rc.baseUrl + '). Authentication is added automatically. ' +
        (rc.readOnly ? 'Read-only: only GET is allowed. ' : 'Use GET to read, POST to create, PUT/PATCH to update and DELETE to remove records. ') +
        (rc.docs ? rc.docs + ' ' : '') + (endpoints ? '\nKnown endpoints:\n' + endpoints : ''),
      inputSchema: { type: 'object', properties: {
        method: { type: 'string', enum: methods },
        path: { type: 'string', description: 'Path relative to the base URL, e.g. /posts or /users/42' },
        query: { type: 'object', description: 'Query-string parameters' },
        body: { description: 'JSON body for POST/PUT/PATCH (object, array or string)' },
        headers: { type: 'object', description: 'Extra request headers (optional)' },
      }, required: ['method', 'path'] },
    }];
  }

  async function restCall(s, a) {
    var rc = await resolved(s.cfg);
    var method = String(a.method || 'GET').toUpperCase();
    if (rc.readOnly && method !== 'GET') return { content: 'Konektor ini hanya-baca.', isError: true };
    var path = String(a.path || '/');
    if (/^https?:\/\//i.test(path)) {
      // Absolute URLs must stay on the connector's own host.
      if (new URL(path).host !== new URL(rc.baseUrl).host) return { content: 'URL di luar host konektor ditolak.', isError: true };
    } else path = rc.baseUrl.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
    var q = Object.assign({}, rc.query || {}, a.query || {});
    var qs = form(q);
    var url = path + (qs ? (path.indexOf('?') >= 0 ? '&' : '?') + qs : '');
    var headers = Object.assign({ Accept: 'application/json' }, rc.headers || {}, a.headers || {});
    var body;
    if (a.body != null && method !== 'GET') {
      body = typeof a.body === 'string' ? a.body : JSON.stringify(a.body);
      if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json';
    }
    var res = await Native.call('http.request', { url: url, method: method, headers: headers, body: body, timeout: 120 });
    var text = String(res.body || '');
    try { text = JSON.stringify(JSON.parse(text), null, 1); } catch (e) { /* not JSON */ }
    return { content: 'HTTP ' + res.status + '\n' + U.truncateMiddle(text, 60000), isError: res.status >= 400 };
  }

  // ---------------------------------------------------------------- lifecycle

  async function start(cfg, opts) {
    opts = opts || {};
    var s = state(cfg);
    if (s.sseHandle) { try { s.sseHandle.abort(); } catch (e) { /* closed */ } s.sseHandle = null; s.sseReady = null; }
    s.status = 'starting'; s.error = ''; s.tools = []; s.sessionId = null; s.needsAuth = false;
    notify();
    try {
      s.rc = await resolved(cfg);
      if (cfg.type === 'rest') {
        await restSetup(s);
        s.status = 'ready';
        notify();
        return s;
      }
      if (cfg.type === 'stdio' || !cfg.type) {
        await Native.call('mcp.start', { id: cfg.id, command: s.rc.command, args: s.rc.args || [], env: s.rc.env || {}, cwd: s.rc.cwd || null });
      }
      if (cfg.auth === 'oauth' && !cfg.lazyLogin && opts.interactive && !(await loadGrant(cfg.id))) {
        s.status = 'auth'; notify();
        await login(cfg);
        s.status = 'starting'; notify();
      }
      try {
        await rpc(s, 'initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'Sinai', version: Store.info.version || '1.0' } }, 90000);
      } catch (e) {
        if (e.needsAuth && cfg.auth === 'oauth' && opts.interactive) {
          s.status = 'auth'; notify();
          await login(cfg, e.wwwAuth);
          s.status = 'starting'; notify();
          await rpc(s, 'initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'Sinai', version: Store.info.version || '1.0' } }, 90000);
        } else if (cfg.type === 'http' && /HTTP (404|405)/.test(e.message) && cfg.sseUrl) {
          // Older servers only speak the legacy SSE transport.
          cfg.type = 'sse'; cfg.url = cfg.sseUrl;
          s.rc = await resolved(cfg);
          Store.saveSettings();
          await rpc(s, 'initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'Sinai', version: Store.info.version || '1.0' } }, 90000);
        } else throw e;
      }
      await sendRaw(s, { jsonrpc: '2.0', method: 'notifications/initialized' });
      await listTools(s);
      s.status = 'ready';
    } catch (e) {
      s.status = e.needsAuth ? 'auth' : 'error';
      s.needsAuth = !!e.needsAuth;
      s.error = e.needsAuth ? 'Perlu login — klik Hubungkan' : e.message;
      if (cfg.type === 'stdio' || !cfg.type) Native.call('mcp.stop', { id: cfg.id }).catch(function () {});
    }
    notify();
    return s;
  }

  function stop(id) {
    var s = servers.get(id);
    if (!s) return;
    s.status = 'off';
    if (s.sseHandle) { try { s.sseHandle.abort(); } catch (e) { /* closed */ } s.sseHandle = null; s.sseReady = null; }
    if (s.cfg.type === 'stdio' || !s.cfg.type) Native.call('mcp.stop', { id: id }).catch(function () {});
    notify();
  }

  /* Forget a connector completely: process, tokens and stored fields. */
  async function remove(id) {
    stop(id);
    servers.delete(id);
    await saveGrant(id, null).catch(function () {});
    await setFields(id, null).catch(function () {});
    Store.settings.mcpServers = (Store.settings.mcpServers || []).filter(function (x) { return x.id !== id; });
    Store.saveSettings();
    notify();
  }

  async function logout(id) { await saveGrant(id, null); var s = servers.get(id); if (s) start(s.cfg); }

  function startAll() {
    (Store.settings.mcpServers || []).forEach(function (cfg) { if (cfg.enabled !== false) start(cfg); });
  }

  /* Many providers reject JSON-schema features MCP servers like to use
     ($ref/$defs, type arrays, const, format, $schema…) — the whole request then
     fails or falls back to slow XML tool calls. Normalise to a portable subset. */
  function sanitizeSchema(schema) {
    var defs = (schema && (schema.$defs || schema.definitions)) || {};
    function walk(n, depth) {
      if (!n || typeof n !== 'object' || depth > 12) return { type: 'string' };
      if (n.$ref) {
        var key = String(n.$ref).split('/').pop();
        return defs[key] ? walk(Object.assign({}, defs[key], { description: n.description || defs[key].description }), depth + 1) : { type: 'object' };
      }
      var o = {};
      var type = n.type;
      if (Array.isArray(type)) type = type.filter(function (t) { return t !== 'null'; })[0] || 'string';
      if (!type) {
        var alt = n.anyOf || n.oneOf;
        if (Array.isArray(alt) && alt.length) {
          var pick = alt.filter(function (x) { return x && x.type !== 'null'; })[0] || alt[0];
          var w = walk(pick, depth + 1);
          if (n.description && !w.description) w.description = n.description;
          return w;
        }
        if (n.allOf && n.allOf.length) return walk(Object.assign.apply(null, [{}].concat(n.allOf)), depth + 1);
        type = n.properties ? 'object' : n.items ? 'array' : n.enum ? 'string' : 'string';
      }
      o.type = type;
      if (n.description) o.description = String(n.description).slice(0, 1000);
      if (n.const !== undefined) o.enum = [n.const];
      else if (Array.isArray(n.enum)) o.enum = n.enum.filter(function (x) { return x !== null; });
      if (type === 'object') {
        o.properties = {};
        Object.keys(n.properties || {}).forEach(function (k) { o.properties[k] = walk(n.properties[k], depth + 1); });
        var req = (n.required || []).filter(function (k) { return o.properties[k]; });
        if (req.length) o.required = req;
      }
      if (type === 'array') o.items = walk(n.items || { type: 'string' }, depth + 1);
      return o;
    }
    var out = walk(schema && schema.type ? schema : { type: 'object', properties: (schema && schema.properties) || {} }, 0);
    if (out.type !== 'object') out = { type: 'object', properties: { value: out } };
    return out;
  }

  /* Models often send "5" for numbers, "true" for booleans or a JSON string for
     an object — strict servers then reject the call. Coerce to the schema. */
  function coerce(v, sch) {
    if (!sch || v == null) return v;
    var t = Array.isArray(sch.type) ? sch.type.filter(function (x) { return x !== 'null'; })[0] : sch.type;
    if ((t === 'number' || t === 'integer') && typeof v === 'string' && v.trim() !== '' && isFinite(+v)) return t === 'integer' ? parseInt(v, 10) : +v;
    if (t === 'boolean' && typeof v === 'string') return /^(true|1|ya|yes)$/i.test(v.trim());
    if ((t === 'object' || t === 'array') && typeof v === 'string' && /^[\[{]/.test(v.trim())) { try { v = JSON.parse(v); } catch (e) { return v; } }
    if (t === 'array' && !Array.isArray(v) && v != null && typeof v !== 'object') v = [v];
    if (t === 'array' && Array.isArray(v) && sch.items) return v.map(function (x) { return coerce(x, sch.items); });
    if (t === 'object' && v && typeof v === 'object' && !Array.isArray(v) && sch.properties) {
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = sch.properties[k] ? coerce(v[k], sch.properties[k]) : v[k]; });
      return o;
    }
    if (t === 'string' && typeof v !== 'string' && v != null) return typeof v === 'object' ? JSON.stringify(v) : String(v);
    return v;
  }

  /* Tool definitions for the model. */
  function tools() {
    var out = [];
    servers.forEach(function (s) {
      if (s.status !== 'ready' || s.cfg.enabled === false) return;
      var off = s.cfg.disabledTools || [];
      s.tools.forEach(function (t) {
        if (off.indexOf(t.name) >= 0) return;
        var name = ('mcp__' + slug(s.cfg.name) + '__' + t.name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
        out.push({
          name: name,
          description: '[' + s.cfg.name + '] ' + (t.description || t.title || t.name),
          parameters: t._clean || (t._clean = sanitizeSchema(t.inputSchema)),
          _schema: t.inputSchema, _server: s.cfg.id, _tool: t.name, _trusted: !!s.cfg.trusted, _ro: !!(t.annotations && t.annotations.readOnlyHint), _serverName: s.cfg.name, _title: t.title || t.name,
        });
      });
    });
    return out;
  }

  function find(name) { return tools().find(function (t) { return t.name === name; }) || null; }

  async function call(name, args) {
    var t = find(name);
    if (!t) throw new Error('Alat MCP tidak tersedia: ' + name);
    var s = servers.get(t._server);
    if (s.cfg.type === 'rest') return restCall(s, args || {});
    var r;
    args = coerce(args || {}, t._schema || { type: 'object' });
    try {
      r = await rpc(s, 'tools/call', { name: t._tool, arguments: args || {} }, 15 * 60000);
    } catch (e) {
      // Expired remote session / dropped stream: reconnect once and retry.
      if (/kedaluwarsa|terputus|SSE|session/i.test(e.message) && s.cfg.type !== 'stdio') {
        await start(s.cfg);
        if (s.status !== 'ready') throw e;
        r = await rpc(s, 'tools/call', { name: t._tool, arguments: args || {} }, 15 * 60000);
      } else throw e;
    }
    var texts = [], images = [];
    (r.content || []).forEach(function (c) {
      if (c.type === 'text') texts.push(c.text);
      else if (c.type === 'image') images.push({ mime: c.mimeType || 'image/png', data: c.data });
      else if (c.type === 'resource' && c.resource) texts.push(c.resource.text || ('[resource ' + c.resource.uri + ']'));
      else if (c.type === 'resource_link') texts.push('[' + (c.name || 'resource') + '] ' + c.uri);
      else if (c.type === 'audio') texts.push('[audio ' + (c.mimeType || '') + ']');
    });
    if (r.structuredContent && !texts.length) texts.push(JSON.stringify(r.structuredContent, null, 2));
    var content = texts.join('\n') || '(tidak ada output)';
    if (r.isError) {
      content += '\n\n[Tool reported an error. Fix the arguments and retry — do not guess field names.]';
      // Validation errors: hand back the exact schema so the next try is right.
      if (/-32602|validation|invalid_|required|expected/i.test(content)) content += '\nExact input schema of ' + name + ':\n' + JSON.stringify(t._schema || t.parameters).slice(0, 12000);
      content += '\n' + siblings(s);
    } else if (/transaction|draft|commit|session_id|upload_id|job_id/i.test(content)) content += '\n\n' + siblings(s);
    return { content: content, images: images, isError: !!r.isError };
  }

  /* With many connectors the full tool list would blow past provider limits
     (often 128 tools) and cost tokens every step; offer search + call instead. */
  var META_LIMIT = 60;
  function metaTools() {
    return [
      { name: 'connector_search', description: 'Search the tools of the connected apps/services (' + Array.from(servers.values()).filter(function (x) { return x.status === 'ready'; }).map(function (x) { return x.cfg.name; }).join(', ') + '). Returns matching tool names with their input schemas. Use it before connector_call.',
        parameters: { type: 'object', properties: { query: { type: 'string', description: 'What you want to do, e.g. "create notion page" or "list github issues"' } }, required: ['query'] } },
      { name: 'connector_call', description: 'Call a connector tool found with connector_search (create, read, update, delete data in the connected service).',
        parameters: { type: 'object', properties: { tool: { type: 'string', description: 'Exact tool name from connector_search' }, arguments: { type: 'object', description: 'Arguments matching the tool schema' } }, required: ['tool'] } },
    ];
  }
  /* Workflow hint: every tool of one server by name, so multi-step flows
     (start → edit → commit, create job → poll) are not missed. */
  function siblings(s) {
    var names = tools().filter(function (x) { return x._server === s.cfg.id; }).map(function (x) { return x.name; });
    return '[All ' + s.cfg.name + ' tools: ' + names.join(', ') + '. Multi-step flows (e.g. start-editing-transaction → perform-editing-operations → commit-editing-transaction) must be finished with the commit/save tool, or the changes are lost.]';
  }
  function searchTools(q) {
    var words = String(q || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2; });
    var scored = tools().map(function (t) {
      var hay = (t.name + ' ' + t.description).toLowerCase();
      return { t: t, n: words.reduce(function (n, w) { return n + (hay.indexOf(w) >= 0 ? 1 : 0); }, 0) };
    }).filter(function (x) { return x.n > 0 || !words.length; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 12);
    if (!scored.length) return 'No matching tools. Available services: ' + Array.from(servers.values()).filter(function (x) { return x.status === 'ready'; }).map(function (x) { return x.cfg.name; }).join(', ');
    var seen = {};
    var body = scored.map(function (x, i) {
      seen[x.t._server] = true;
      // Top hits carry the full schema (big editing tools have long, nested schemas).
      return '## ' + x.t.name + '\n' + x.t.description.slice(0, i < 4 ? 2500 : 400) + '\nInput schema: ' + JSON.stringify(x.t._schema || x.t.parameters).slice(0, i < 4 ? 12000 : 1200);
    }).join('\n\n');
    return body + '\n\n' + Object.keys(seen).map(function (id) { return siblings(servers.get(id)); }).join('\n');
  }

  /* Reads Claude Desktop's config so existing connectors carry over. */
  async function importClaudeDesktop() {
    var path = U.isMac() ? Store.info.home + '/Library/Application Support/Claude/claude_desktop_config.json'
      : (Store.info.appData || Store.info.home + '/.config') + '/Claude/claude_desktop_config.json';
    var r = await Native.call('fs.read', { path: path });
    var cfg = JSON.parse(r.content || '{}');
    var added = 0;
    Object.keys(cfg.mcpServers || {}).forEach(function (name) {
      var c = cfg.mcpServers[name];
      if ((Store.settings.mcpServers || []).some(function (x) { return x.name === name; })) return;
      var entry = c.url ? { type: /\/sse\/?$/.test(c.url) ? 'sse' : 'http', url: c.url, headers: c.headers || {} } : { type: 'stdio', command: c.command, args: c.args || [], env: c.env || {} };
      entry.id = U.uid('mcp_'); entry.name = name; entry.enabled = true;
      Store.settings.mcpServers = (Store.settings.mcpServers || []).concat([entry]);
      added++;
      start(entry);
    });
    Store.saveSettings();
    return added;
  }

  window.MCP = {
    metaTools: metaTools, searchTools: searchTools, META_LIMIT: META_LIMIT, sanitizeSchema: sanitizeSchema,
    start: start, stop: stop, remove: remove, logout: logout, startAll: startAll, tools: tools, find: find, call: call, importClaudeDesktop: importClaudeDesktop,
    getFields: getFields, setFields: setFields, hasGrant: function (id) { return loadGrant(id).then(function (g) { return !!(g && g.access_token); }); },
    status: function (id) { return servers.get(id) || null; },
    onChange: function (fn) { listeners.push(fn); },
    _test: { sha256: sha256, b64url: b64url, fill: fill, discover: discover },
  };
})();
