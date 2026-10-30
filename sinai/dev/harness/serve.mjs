/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
// Harness uji UI Sinai di browser biasa (khusus pengembangan).
// Menyajikan Resources/web + mobile/web/host-mobile.js dengan host native
// tiruan (dev/harness/mock-native.js), proxy HTTP tanpa CORS, dan pratinjau.
//
//   node dev/harness/serve.mjs [port]        (bawaan 8795)
//   http://127.0.0.1:8795/?os=android        tampilan Android (juga: ios, macos, windows)
//   &version=1.0.0                           pura-pura versi lama (uji pembaruan wajib)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] || 8795);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEB = path.join(ROOT, 'Resources', 'web');
const WORKER = path.join(ROOT, 'desktop', 'lib', 'worker');
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  png: 'image/png', svg: 'image/svg+xml', json: 'application/json', wasm: 'application/wasm', bcmap: 'application/octet-stream', pfb: 'application/octet-stream', ttf: 'font/ttf', icc: 'application/octet-stream' };
const previews = new Map();

function send(res, code, body, type, extra) {
  res.writeHead(code, Object.assign({ 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {}));
  res.end(body);
}
function file(res, f) {
  fs.readFile(f, (err, data) => {
    if (err) return send(res, 404, 'not found');
    send(res, 200, data, MIME[path.extname(f).slice(1)] || 'application/octet-stream');
  });
}
function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, decodeURIComponent(rel)));
  return p.startsWith(base + path.sep) ? p : null;
}
function body(req) { return new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); }); }

function indexHtml() {
  let s = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  s = s.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'wasm-unsafe-eval\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; connect-src \'self\' blob: data:; frame-src \'self\' http: https:; worker-src \'self\' blob:; object-src \'none\'; base-uri \'none\'; form-action \'none\'">');
  return s.replace('<script src="js/native.js"></script>', '<script src="/__h/mock-native.js"></script>\n<script src="/__h/host-mobile.js"></script>\n<script src="js/native.js"></script>');
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const p = u.pathname;
  try {
    if (p === '/' || p === '/index.html') return send(res, 200, indexHtml(), MIME.html);
    if (p === '/__h/mock-native.js') return file(res, path.join(ROOT, 'dev', 'harness', 'mock-native.js'));
    if (p === '/__h/host-mobile.js') return file(res, path.join(ROOT, 'mobile', 'web', 'host-mobile.js'));
    if (p === '/gx-worker.js') return file(res, path.join(WORKER, 'worker.js'));
    if (p.startsWith('/pdfjs/')) { const f = safeJoin(path.join(WORKER, 'pdfjs'), p.slice(7)); return f ? file(res, f) : send(res, 404, 'nf'); }
    if (p === '/__preview/put' && req.method === 'POST') {
      const j = JSON.parse((await body(req)).toString('utf8'));
      previews.set(String(j.key), String(j.html || ''));
      if (previews.size > 80) previews.delete(previews.keys().next().value);
      return send(res, 200, JSON.stringify({ url: 'http://127.0.0.1:' + port + '/__preview/p/' + encodeURIComponent(j.key) }), MIME.json);
    }
    if (p.startsWith('/__preview/p/')) { const h = previews.get(decodeURIComponent(p.slice(13))); return h == null ? send(res, 404, 'nf') : send(res, 200, h, MIME.html); }
    if (p.startsWith('/__preview/lib/')) { const f = safeJoin(path.join(WEB, 'preview-lib'), p.slice(15)); return f ? file(res, f) : send(res, 404, 'nf'); }
    if (p === '/__proxy' && req.method === 'POST') {
      const j = JSON.parse((await body(req)).toString('utf8'));
      const ac = new AbortController();
      req.on('close', () => ac.abort());
      let r;
      try {
        r = await fetch(j.url, { method: j.method || 'GET', headers: j.headers || {}, body: j.body != null && j.method && j.method !== 'GET' ? j.body : undefined, signal: ac.signal, redirect: 'follow' });
      } catch (e) {
        return send(res, 502, JSON.stringify({ error: String(e.cause && e.cause.code || e.message) }), MIME.json, { 'X-Proxy-Error': '1' });
      }
      const headers = {};
      r.headers.forEach((v, k) => { headers[k] = v; });
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'X-Status': String(r.status), 'X-Headers': encodeURIComponent(JSON.stringify(headers)), 'Cache-Control': 'no-store' });
      if (!r.body) return res.end();
      const reader = r.body.getReader();
      for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(Buffer.from(value)); }
      return res.end();
    }
    const f = safeJoin(WEB, p.slice(1));
    if (f) return file(res, f);
    send(res, 404, 'not found');
  } catch (e) {
    send(res, 500, String(e && e.stack || e));
  }
}).listen(port, '127.0.0.1', () => console.log('Sinai harness: http://127.0.0.1:' + port + '/?os=android'));
