// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Uploads (multipart, streamed from disk), a persistent cookie jar, local
// dev-server detection, outgoing WebSockets, notifications, watch folders and
// a localhost-only webhook receiver.
'use strict';
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const { session, net: enet, Notification, app } = require('electron');
const U = require('./util');
const { BridgeError, expand, toPosix } = U;

let jar = null;
function jarSession() {
  if (!jar) jar = session.fromPartition('persist:sinai-net');
  return jar;
}

// ---------------------------------------------------------------- upload
async function upload(p, id, emit) {
  let url;
  try { url = new URL(String(p.url || '')); } catch (e) { throw new BridgeError('URL tidak valid'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new BridgeError('URL tidak valid');
  const boundary = 'SinaiBoundary' + U.uuid().replace(/-/g, '');
  const tmpDir = U.tempDir('sinai-upload-');
  const tmp = path.join(tmpDir, 'body.bin');
  try {
    const out = fs.createWriteStream(tmp);
    const write = (s) => new Promise((r) => out.write(s, r));
    for (const [k, v] of Object.entries(p.fields || {})) await write('--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n');
    for (const f of p.files || []) {
      const field = f.field || 'file';
      let filename = f.filename || (f.path ? path.basename(f.path) : 'file');
      const mime = f.mime || 'application/octet-stream';
      await write('--' + boundary + '\r\nContent-Disposition: form-data; name="' + field + '"; filename="' + filename.replace(/"/g, '') + '"\r\nContent-Type: ' + mime + '\r\n\r\n');
      if (f.path) {
        await new Promise((resolve, reject) => {
          const rs = fs.createReadStream(expand(f.path));
          rs.on('error', reject);
          rs.on('end', resolve);
          rs.pipe(out, { end: false });
        });
      } else if (f.base64) await write(Buffer.from(f.base64, 'base64'));
      await write('\r\n');
    }
    await write('--' + boundary + '--\r\n');
    await new Promise((r) => out.end(r));
    const total = fs.statSync(tmp).size;

    return await new Promise((resolve, reject) => {
      const req = enet.request({ method: String(p.method || 'POST').toUpperCase(), url: url.toString(), session: jarSession(), useSessionCookies: true });
      req.setHeader('Content-Type', 'multipart/form-data; boundary=' + boundary);
      for (const [k, v] of Object.entries(p.headers || {})) { if (!/^(content-type|content-length|host)$/i.test(k)) req.setHeader(k, String(v)); }
      req.chunkedEncoding = false;
      req.setHeader('Content-Length', String(total));
      req.on('response', (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (d) => { size += d.length; if (size <= 4000000) chunks.push(d); });
        res.on('end', () => {
          const headers = {};
          for (const [k, v] of Object.entries(res.headers || {})) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
          resolve({ status: res.statusCode, headers, body: Buffer.concat(chunks).toString('utf8'), size });
        });
        res.on('error', (e) => reject(new BridgeError(e.message)));
      });
      req.on('error', (e) => reject(new BridgeError('Unggahan gagal: ' + e.message)));
      let sent = 0, last = 0;
      const rs = fs.createReadStream(tmp, { highWaterMark: 1 << 20 });
      rs.on('data', (chunk) => {
        sent += chunk.length;
        const ok = req.write(chunk);
        if (Date.now() - last > 200 || sent === total) { last = Date.now(); emit('upload.progress', { id, sent, total }); }
        if (!ok) { rs.pause(); req.once('drain', () => rs.resume()); }
      });
      rs.on('end', () => req.end());
      rs.on('error', (e) => { req.abort(); reject(new BridgeError(e.message)); });
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function cookies(p) {
  const ses = jarSession();
  if (p.url) {
    const list = await ses.cookies.get({ url: String(p.url) });
    return { cookies: list.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path })) };
  }
  return { count: (await ses.cookies.get({})).length };
}

async function clearCookies() {
  await jarSession().clearStorageData({ storages: ['cookies'] });
  return true;
}

// ---------------------------------------------------------------- dev servers
function isListening(port, timeout) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port });
    const done = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(timeout, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

async function scanDevServers(p) {
  const ports = Array.isArray(p.ports) ? p.ports : [3000, 3001, 4200, 5000, 5173, 5174, 8000, 8080, 8081, 8888, 9000, 4321, 1313, 3333, 19006, 24678, 11434, 1234];
  const open = [];
  await Promise.all(ports.map(async (port) => { if (await isListening(port, 400)) open.push(port); }));
  open.sort((a, b) => a - b);
  return { servers: open.map((port) => ({ port, url: 'http://localhost:' + port })) };
}

// ---------------------------------------------------------------- WebSocket
const sockets = new Map();

function wsConnect(p, id, emit) {
  let url;
  try { url = new URL(String(p.url || '')); } catch (e) { throw new BridgeError('URL WebSocket tidak valid (gunakan ws:// atau wss://)'); }
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (!['ws:', 'wss:'].includes(url.protocol)) throw new BridgeError('URL WebSocket tidak valid (gunakan ws:// atau wss://)');
  const headers = p.headers && Object.keys(p.headers).length ? p.headers : null;
  // Node's WebSocket (undici) accepts extra headers through its init object.
  const ws = headers ? new WebSocket(url.toString(), { headers }) : new WebSocket(url.toString());
  ws.binaryType = 'arraybuffer';
  sockets.set(id, ws);
  ws.onopen = () => emit('ws.open', { id });
  ws.onmessage = (e) => {
    if (typeof e.data === 'string') emit('ws.message', { id, text: e.data });
    else emit('ws.message', { id, base64: Buffer.from(e.data).toString('base64') });
  };
  ws.onerror = (e) => { if (sockets.get(id) === ws) { sockets.delete(id); emit('ws.close', { id, error: (e && e.message) || 'Koneksi WebSocket gagal' }); } };
  ws.onclose = () => { if (sockets.get(id) === ws) { sockets.delete(id); emit('ws.close', { id }); } };
}

function wsSend(id, text, base64) {
  const ws = sockets.get(id);
  if (!ws || ws.readyState !== 1) throw new BridgeError('WebSocket tidak terhubung');
  ws.send(base64 != null ? Buffer.from(base64, 'base64') : String(text || ''));
  return true;
}

function wsClose(id, emit) {
  const ws = sockets.get(id);
  sockets.delete(id);
  if (ws) try { ws.close(1001); } catch (e) { /* closed */ }
  emit('ws.close', { id });
}

// ---------------------------------------------------------------- notifications
function notify(p, win) {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title: String(p.title || 'Sinai'), body: p.body ? String(p.body) : '', silent: p.sound === false, icon: require('path').join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'build'), 'icon.png') });
  n.on('click', () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } });
  n.show();
  return true;
}

// ---------------------------------------------------------------- watch folders
const watches = new Map();

function watchStart(id, dir, emit) {
  const d = expand(dir);
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw new BridgeError('Folder tidak ditemukan: ' + d);
  watchStop(id);
  const w = { known: new Set(fs.readdirSync(d)), timer: null, watcher: null };
  const rescan = () => {
    let now;
    try { now = new Set(fs.readdirSync(d)); } catch (e) { return; }
    const added = Array.from(now).filter((n) => !w.known.has(n) && !n.startsWith('.') && !/\.(crdownload|part|tmp|download)$/i.test(n)).sort();
    w.known = now;
    for (const name of added) emit('watch.file', { id, path: toPosix(path.join(d, name)), name });
  };
  w.watcher = fs.watch(d, { persistent: false }, () => { clearTimeout(w.timer); w.timer = setTimeout(rescan, 800); });
  w.watcher.on('error', () => {});
  watches.set(id, w);
}

function watchStop(id) {
  const w = watches.get(id);
  if (!w) return;
  watches.delete(id);
  clearTimeout(w.timer);
  try { w.watcher.close(); } catch (e) { /* closed */ }
}

// ---------------------------------------------------------------- webhook (127.0.0.1 only)
let server = null;

function webhookStart(port, secret, emit) {
  webhookStop();
  if (!secret) throw new BridgeError('Webhook memerlukan secret (token) agar aman');
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const chunks = [];
      let size = 0;
      req.on('data', (d) => { size += d.length; if (size <= 1 << 20) chunks.push(d); });
      req.on('end', () => {
        const ok = String(req.headers['x-sinai-token'] || '') === secret;
        if (ok) emit('webhook.hit', { path: req.url || '/', body: Buffer.concat(chunks).toString('utf8') });
        const payload = ok ? '{"ok":true}' : '{"ok":false}';
        res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json', 'Connection': 'close' });
        res.end(payload);
      });
    });
    srv.once('error', (e) => reject(new BridgeError(e.code === 'EADDRINUSE' ? 'Port ' + port + ' sudah dipakai aplikasi lain' : e.message)));
    srv.listen(port, '127.0.0.1', () => {
      server = srv;
      const actual = srv.address().port;
      emit('webhook.ready', { port: actual });
      resolve(actual);
    });
  });
}

function webhookStop() {
  if (server) { try { server.close(); } catch (e) { /* closed */ } server = null; }
}

// ---------------------------------------------------------------- OAuth loopback redirect (127.0.0.1 only)
let oauthServer = null, oauthPort = 0, oauthStarting = null;

function oauthListen(port, emit) {
  if (oauthServer && oauthPort) return Promise.resolve(oauthPort);
  if (oauthStarting) return oauthStarting;
  oauthStarting = new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const isCb = (req.url || '').startsWith('/callback');
      if (isCb) emit('oauth.callback', { url: 'http://127.0.0.1' + req.url });
      const html = isCb
        ? '<!doctype html><meta charset=utf-8><title>Sinai</title><body style="font:16px -apple-system,Segoe UI,sans-serif;display:grid;place-items:center;height:90vh;color:#1b1c2b"><div style="text-align:center"><div style="font-size:44px">✓</div><h2>Terhubung ke Sinai</h2><p>Anda boleh menutup tab ini dan kembali ke aplikasi.</p></div><script>setTimeout(function(){window.close()},1200)</script>'
        : 'Not found';
      res.writeHead(isCb ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8', 'Connection': 'close' });
      res.end(html);
    });
    srv.once('error', (e) => { oauthStarting = null; reject(new BridgeError('Port login lokal tidak bisa dibuka: ' + e.message)); });
    srv.listen(port || 0, '127.0.0.1', () => {
      oauthServer = srv;
      oauthPort = srv.address().port;
      oauthStarting = null;
      resolve(oauthPort);
    });
  });
  return oauthStarting;
}

function closeAll() {
  for (const ws of sockets.values()) try { ws.close(1001); } catch (e) { /* closed */ }
  sockets.clear();
  for (const id of Array.from(watches.keys())) watchStop(id);
  webhookStop();
  if (oauthServer) { try { oauthServer.close(); } catch (e) { /* closed */ } oauthServer = null; oauthPort = 0; }
}

module.exports = { upload, cookies, clearCookies, scanDevServers, wsConnect, wsSend, wsClose, notify, watchStart, watchStop, webhookStart, webhookStop, oauthListen, closeAll };
