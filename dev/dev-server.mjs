#!/usr/bin/env node
/* Sinerli Apps — harness uji lokal. TIDAK ikut dipaket.
 * Menyajikan web/ tiap aplikasi + server Sinerli tiruan (Connect, projects,
 * collab_ops long-poll, project_share) di memori, plus jembatan native palsu.
 *   node dev/dev-server.mjs   →  http://localhost:8790/apps/sinerli%20note/?user=ani
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT || 8790);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

const projects = new Map(); let nextId = 1;
const ops = []; let nextOp = 1;
const presence = new Map();   // doc → Map(client → {...})
const waiters = new Set();
const shares = new Map();

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }, headers || {}));
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function body(req) { return new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); }); }
function userOf(req) {
  const k = req.headers['x-api-key'] || '';
  const a = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const m = (k || a).match(/^(?:key|tok)_([a-z0-9]+)/);
  return m ? m[1] + '@sinerli.test' : '';
}

async function api(req, res, u) {
  const origin = `http://${req.headers.host}`;
  const p = u.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, '', { 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' });
  if (p === '/.well-known/sinerli-connect') return send(res, 200, { issuer: origin, authorization_endpoint: origin + '/connect/authorize', token_endpoint: origin + '/connect/token', userinfo_endpoint: origin + '/connect/userinfo', revocation_endpoint: origin + '/connect/revoke' });
  if (p === '/connect/authorize') {
    const q = u.searchParams;
    const user = (q.get('dev_user') || 'ani').replace(/[^a-z0-9]/g, '');
    return send(res, 200, { redirect: q.get('redirect_uri') + '?code=code_' + user + '&state=' + encodeURIComponent(q.get('state')) });
  }
  if (p === '/connect/token') {
    const f = new URLSearchParams(await body(req));
    const user = (f.get('code') || f.get('refresh_token') || '').replace(/^(code|ref)_/, '');
    return send(res, 200, { access_token: 'tok_' + user, refresh_token: 'ref_' + user, expires_in: 3600, token_type: 'Bearer' });
  }
  if (p === '/connect/revoke') return send(res, 200, {});
  if (p === '/connect/tool-key') {
    const email = userOf(req);
    if (!email) return send(res, 401, { error: 'invalid_token' });
    const name = email.split('@')[0];
    return send(res, 200, { api_key: 'key_' + name, api_base: origin + '/', email, plan: name === 'free' ? 'free' : 'premium', name: name.charAt(0).toUpperCase() + name.slice(1), photo: '', permissions: {}, verified_at: Date.now() });
  }
  const email = userOf(req);
  if (p.startsWith('/api/') && !email) return send(res, 401, { success: false, message: 'no key' });
  if (p === '/api/projects.php') {
    if (req.method === 'GET') {
      const id = u.searchParams.get('id');
      if (u.searchParams.get('action') === 'head') { const x = projects.get(+id); return send(res, 200, { success: true, project: x && { id: x.id, revision: x.revision, lastModified: x.lastModified } }); }
      const list = [...projects.values()].filter((x) => (id ? x.id === +id : x.user_email === email || (shares.get(x.id) || {}).members?.[email])).filter((x) => !u.searchParams.get('type') || x.type === u.searchParams.get('type'));
      return send(res, 200, { success: true, projects: list.map((x) => (u.searchParams.get('meta') ? Object.assign({}, x, { content: undefined }) : Object.assign({}, x, { content: JSON.stringify(x.content) }))) });
    }
    if (req.method === 'DELETE') { for (const [k, x] of projects) if (x.filename === u.searchParams.get('filename')) projects.delete(k); return send(res, 200, { success: true }); }
    const d = JSON.parse(await body(req) || '{}');
    let x = [...projects.values()].find((y) => d.filename && y.filename === d.filename);
    if (x && d.base_revision != null && d.base_revision !== x.revision && !d.force) return send(res, 409, { success: false, code: 'conflict', revision: x.revision });
    if (!x) { x = { id: nextId++, user_email: email, filename: (d.type || 'p') + '-' + Date.now() + '.json', revision: 0, created_at: new Date().toISOString() }; projects.set(x.id, x); }
    Object.assign(x, { name: d.name, type: d.type, content: d.content, thumbnail: d.thumbnail || x.thumbnail || null, revision: x.revision + 1, lastModified: new Date().toISOString() });
    return send(res, 200, { success: true, id: x.id, filename: x.filename, revision: x.revision, lastModified: x.lastModified });
  }
  if (p === '/api/collab_ops.php') {
    const q = u.searchParams, doc = q.get('doc_kind') + ':' + q.get('doc_id'), client = q.get('client_id');
    if (!presence.has(doc)) presence.set(doc, new Map());
    const pres = presence.get(doc);
    const touch = (cursor) => { const prev = pres.get(client) || {}; pres.set(client, { client_id: client, user_email: email, display_name: email.split('@')[0], color: '#' + [...email].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16).slice(-6).padStart(6, '0'), cursor: cursor === undefined ? prev.cursor : cursor, last_seen: Date.now() }); };
    if (q.get('action') === 'push') {
      const d = JSON.parse(await body(req) || '{}');
      let last = 0;
      for (const o of d.ops || []) { last = nextOp++; ops.push(Object.assign({ id: last, doc, author_email: email, client_id: client }, o)); }
      if ('cursor' in d) touch(d.cursor); else touch();
      for (const w of [...waiters]) if (w.doc === doc) w.wake();
      return send(res, 200, { success: true, last_id: last });
    }
    const since = +(q.get('since_id') || 0);
    touch(q.has('cx') ? { x: +q.get('cx'), y: +q.get('cy') } : undefined);
    const collect = () => ops.filter((o) => o.doc === doc && o.id > since);
    let list = collect();
    const wait = Math.min(8, +(q.get('wait') || 0));
    if (!list.length && wait > 0) {
      await new Promise((r) => { const w = { doc, wake: () => { waiters.delete(w); clearTimeout(t); r(); } }; const t = setTimeout(() => w.wake(), wait * 1000); waiters.add(w); req.on('close', () => w.wake()); });
      list = collect();
    }
    for (const [k, v] of pres) if (Date.now() - v.last_seen > 20000) pres.delete(k);
    return send(res, 200, { success: true, ops: list.map((o) => Object.assign({}, o, { doc: undefined })), since_id: list.reduce((m, o) => Math.max(m, o.id), since), presence: [...pres.values()].filter((v) => v.client_id !== client), can_edit: true });
  }
  if (p === '/api/project_share.php') {
    const d = req.method === 'POST' ? JSON.parse(await body(req) || '{}') : Object.fromEntries(u.searchParams);
    const id = +(d.id || 0);
    if (!shares.has(id)) shares.set(id, { token: Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32), link_role: 'off', members: {} });
    const s = shares.get(id);
    if (d.action === 'link') s.link_role = d.link_role;
    if (d.action === 'invite') for (const e of d.emails || []) s.members[e] = d.role;
    if (d.action === 'member') { if (d.role === 'remove') delete s.members[d.email]; else s.members[d.email] = d.role; }
    if (d.action === 'shared_with_me') return send(res, 200, { success: true, projects: [] });
    return send(res, 200, { success: true, token: s.token, link_role: s.link_role, members: Object.entries(s.members).map(([e, r]) => ({ email: e, role: r })) });
  }
  if (p.startsWith('/api/')) return send(res, 200, { success: true });
  return null;
}

const BRIDGE = `/* jembatan native palsu (harness uji) */
(function(){
  var q = new URLSearchParams(location.search), user = q.get('user') || 'ani';
  localStorage.setItem('sn_base', location.origin);
  var hs = {};
  window.SN_DEV_BRIDGE = { mobile: q.get('mobile') === '1',
    on: function (n, cb) { (hs[n] = hs[n] || []).push(cb); },
    invoke: async function (cmd, a) {
      var K = 'devsecret:' + user + ':';
      if (cmd === 'secret_get') return sessionStorage.getItem(K + a.key);
      if (cmd === 'secret_set') { if (a.value) sessionStorage.setItem(K + a.key, a.value); else sessionStorage.removeItem(K + a.key); return null; }
      if (cmd === 'oauth_listen') return a.port;
      if (cmd === 'open_url' || cmd === 'oauth_start') {
        if (a.url.indexOf('/connect/authorize') >= 0) {
          var r = await fetch(a.url + '&dev_user=' + user).then(function (x) { return x.json(); });
          setTimeout(function () { (hs['oauth-callback'] || []).forEach(function (cb) { cb({ url: r.redirect }); }); }, 300);
          return null;
        }
        window.open(a.url, '_blank'); return null;
      }
      if (cmd === 'save_file') { console.log('[dev] save_file', a.name, a.mime, Math.round(a.data.length * 0.75) + ' B'); window.__lastSave = a; return true; }
      return null;
    } };
})();`;

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (await api(req, res, u) !== null) return;
  } catch (e) { return send(res, 500, { success: false, message: String(e) }); }
  if (res.writableEnded) return;
  if (u.pathname === '/dev/bridge.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(BRIDGE); }
  const m = u.pathname.match(/^\/apps\/([^/]+)\/?(.*)$/);
  if (!m) { res.writeHead(302, { Location: '/apps/sinerli%20note/' }); return res.end(); }
  const dir = path.join(ROOT, decodeURIComponent(m[1]), 'web');
  let f = path.normalize(path.join(dir, decodeURIComponent(m[2] || 'index.html')));
  if (!f.startsWith(dir)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
  let data = fs.readFileSync(f);
  if (f.endsWith('.html')) data = Buffer.from(String(data).replace('<script src="core/sn-core.js"></script>', '<script src="/dev/bridge.js"></script><script src="core/sn-core.js"></script>').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''));
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(data);
}).listen(PORT, () => console.log('Sinerli Apps dev → http://localhost:' + PORT + '/apps/sinerli%20note/?user=ani'));
