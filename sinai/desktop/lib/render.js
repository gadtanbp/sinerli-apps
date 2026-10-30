// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Artifact previews served from the separate sinai-preview:// scheme (so
// artifact code never shares an origin with the app or reaches the bridge),
// off-screen rendering to PNG/PDF, paginated HTML → PDF, and printing.
'use strict';
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, session, shell, dialog } = require('electron');
const { BridgeError, expand, toPosix, uuid, mimeOf } = require('./util');

const WEB_ROOT = process.env.SINAI_WEB_ROOT && !app.isPackaged
  ? path.resolve(process.env.SINAI_WEB_ROOT)
  : app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', '..', 'Resources', 'web');
const LIB_ROOT = path.join(WEB_ROOT, 'preview-lib');

// ---------------------------------------------------------------- store
const docs = new Map();
const files = new Map();
const Store = {
  put(key, html) {
    docs.delete(key);
    docs.set(key, String(html));
    while (docs.size > 80) docs.delete(docs.keys().next().value);
  },
  get(key) { return docs.get(key); },
  putFile(p) {
    for (const [k, v] of files) if (v === p) return k;
    const k = uuid().replace(/-/g, '');
    files.set(k, p);
    return k;
  },
  file(key) { return files.get(key); },
  // Project folders opened in the Sinai browser (live view).
  putSite(root) {
    for (const [k, v] of sites) if (v === root) return k;
    const k = uuid().replace(/-/g, '').slice(0, 16);
    sites.set(k, root);
    return k;
  },
  site(key) { return sites.get(key); },
};
const sites = new Map();

// Injected into live-view HTML: forwards console output, errors and navigation to the panel.
const SITE_BRIDGE = "<script>(function(){if(window.__gxSite)return;window.__gxSite=1;function s(m){try{m.__gxSite=1;parent.postMessage(m,'*')}catch(e){}}" +
  "['log','info','warn','error'].forEach(function(l){var o=console[l];console[l]=function(){try{s({type:'console',level:l,text:[].map.call(arguments,function(a){try{return typeof a==='object'?JSON.stringify(a):String(a)}catch(e){return String(a)}}).join(' ').slice(0,2000)})}catch(e){}return o.apply(console,arguments)}});" +
  "addEventListener('error',function(e){s({type:'console',level:'error',text:String(e.message||e)+(e.filename?' ('+e.filename.split('/').pop()+':'+e.lineno+')':'')})});" +
  "addEventListener('unhandledrejection',function(e){var r=e.reason;s({type:'console',level:'error',text:'Unhandled: '+(r&&r.message||r)})});" +
  "addEventListener('load',function(){s({type:'nav',url:location.href,title:document.title})});})();</script>";

async function serveSite(req, root, rel) {
  if (rel.includes('..')) return new Response('Forbidden', { status: 403 });
  const base = path.resolve(root);
  let target = path.resolve(base, ...rel);
  if (target !== base && !target.startsWith(base + path.sep)) return new Response('Forbidden', { status: 403 });
  let st = await fs.promises.stat(target).catch(() => null);
  if (st && st.isDirectory()) { target = path.join(target, 'index.html'); st = await fs.promises.stat(target).catch(() => null); }
  else if (!st && !path.extname(target) && fs.existsSync(target + '.html')) target += '.html';
  if (/\.html?$/i.test(target)) {
    let html;
    try { html = await fs.promises.readFile(target, 'utf8'); } catch (e) {
      return new Response('<!doctype html><meta charset=utf-8><body style="font:14px sans-serif;padding:40px;color:#555"><h3>404 — tidak ditemukan</h3><code>/' + rel.join('/') + '</code>' + SITE_BRIDGE,
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + SITE_BRIDGE) : SITE_BRIDGE + html;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
  }
  return serveFile(req, target);
}

async function serveFile(req, file) {
  let st;
  try { st = await fs.promises.stat(file); } catch (e) { return new Response('Not found', { status: 404 }); }
  const size = st.size;
  const mime = mimeOf(file);
  const range = req.headers.get('range');
  let start = 0, end = size - 1, partial = false;
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (m) {
    if (m[1]) { start = parseInt(m[1], 10); if (m[2]) end = Math.min(parseInt(m[2], 10), size - 1); }
    else if (m[2]) start = Math.max(0, size - parseInt(m[2], 10));
    partial = true;
  }
  if (size === 0) { start = 0; end = -1; }
  if (start > end + 1) return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  const headers = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
  if (partial) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
  const body = end >= start ? require('stream').Readable.toWeb(fs.createReadStream(file, { start, end })) : '';
  return new Response(body, { status: partial ? 206 : 200, headers });
}

function registerPreviewScheme(ses) {
  ses.protocol.handle('sinai-preview', async (req) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    if (url.host === 'site' && parts[0]) {
      const root = Store.site(parts[0]);
      if (root) return serveSite(req, root, parts.slice(1));
    } else if (url.host === 'file' && parts[0]) {
      const f = Store.file(parts[0]);
      if (f) return serveFile(req, f);
    } else if (url.host === 'p' && parts[0]) {
      const html = Store.get(parts[0]);
      if (html != null) return new Response(html, { headers: Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, cors) });
    } else if (url.host === 'lib' && parts.length && !parts.includes('..') && !parts.includes('.')) {
      try {
        const f = path.join(LIB_ROOT, ...parts);
        const data = await fs.promises.readFile(f);
        return new Response(data, { headers: Object.assign({ 'Content-Type': f.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8' }, cors) });
      } catch (e) { /* fall through */ }
    }
    return new Response('Not found', { status: 404 });
  });
}

let previewSes = null;
function previewSession() {
  if (!previewSes) {
    previewSes = session.fromPartition('sinai-preview');
    registerPreviewScheme(previewSes);
    previewSes.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  }
  return previewSes;
}

function lockDown(wc) {
  wc.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => {
    if (/^sinai-preview:/.test(url)) return;
    e.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });
}

function hiddenWindow(width, height) {
  const w = new BrowserWindow({
    show: false, width: Math.round(width), height: Math.round(height), useContentSize: true, frame: false,
    webPreferences: { session: previewSession(), sandbox: true, contextIsolation: true, backgroundThrottling: false, offscreen: false },
  });
  lockDown(w.webContents);
  return w;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function showPreviewWindow(key, title, icon) {
  const w = new BrowserWindow({
    width: 960, height: 680, title, icon, autoHideMenuBar: true,
    webPreferences: { session: previewSession(), sandbox: true, contextIsolation: true },
  });
  lockDown(w.webContents);
  w.loadURL('sinai-preview://p/' + key);
}

async function cdp(wc, fn) {
  const dbg = wc.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  try { return await fn((m, params) => dbg.sendCommand(m, params || {})); }
  finally { try { dbg.detach(); } catch (e) { /* ignore */ } }
}

async function saveResult(data, name, outPath, parent) {
  if (outPath) {
    const p = expand(outPath);
    require('./files').guardWritable(p);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, data);
    return p;
  }
  const r = await dialog.showSaveDialog(parent, { defaultPath: path.join(app.getPath('downloads'), name) });
  if (r.canceled || !r.filePath) return null;
  await fs.promises.writeFile(r.filePath, data);
  return toPosix(r.filePath);
}

/** Renders a stored preview off-screen and saves it as PNG or PDF. */
async function exportPreview(p, parent) {
  const key = p.key || '';
  if (p.html != null) Store.put(key, p.html);
  const format = p.format === 'pdf' ? 'pdf' : 'png';
  const width = Math.max(200, Math.min(p.width || 1280, 4000));
  const pageHeight = Math.max(100, p.pageHeight || 720);
  const pages = Math.max(0, p.pages | 0);
  const w = hiddenWindow(width, Math.max(pageHeight, 800));
  try {
    await Promise.race([w.loadURL('sinai-preview://p/' + key), sleep(20000)]);
    await sleep(2000); // let React, Tailwind, Mermaid render
    const h = await w.webContents.executeJavaScript('(function(){var b=document.body;var h=b?Math.max(b.scrollHeight,Math.ceil(b.getBoundingClientRect().bottom)):0;return h||document.documentElement.scrollHeight})()').catch(() => 800);
    const total = Math.round(pages > 0 ? pageHeight * pages : Math.max(Math.min(h || 800, 30000), 200));
    let data;
    if (format === 'png') {
      data = await cdp(w.webContents, async (send) => {
        await send('Emulation.setDeviceMetricsOverride', { width, height: total, deviceScaleFactor: 1, mobile: false });
        await sleep(600);
        const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height: total, scale: 1 }, captureBeyondViewport: true });
        return Buffer.from(shot.data, 'base64');
      });
    } else {
      const dbg = w.webContents.debugger;
      dbg.attach('1.3');
      await dbg.sendCommand('Emulation.setEmulatedMedia', { media: 'screen' });
      w.setContentSize(Math.round(width), Math.round(pages > 0 ? pageHeight : Math.min(total, 4000)));
      await sleep(600);
      data = await w.webContents.printToPDF({
        printBackground: true, preferCSSPageSize: false, margins: { top: 0, bottom: 0, left: 0, right: 0 },
        pageSize: { width: width / 96, height: (pages > 0 ? pageHeight : total) / 96 },
      });
      try { dbg.detach(); } catch (e) { /* ignore */ }
    }
    return await saveResult(data, (p.name || 'artifact') + '.' + format, p.outPath, parent);
  } finally {
    if (!w.isDestroyed()) w.destroy();
  }
}

/** HTML → paginated PDF (A4/Letter) with real page breaks. */
async function htmlToPDF(p) {
  if (!p.outPath) throw new BridgeError('outPath wajib diisi');
  const out = expand(p.outPath);
  require('./files').guardWritable(out);
  await fs.promises.mkdir(path.dirname(out), { recursive: true });
  const letter = String(p.paper || 'a4').toLowerCase() === 'letter';
  const landscape = !!p.landscape;
  const margin = p.margin != null ? Number(p.margin) : 40; // points
  let pw = letter ? 612 : 595, ph = letter ? 792 : 842;
  if (landscape) [pw, ph] = [ph, pw];
  const key = 'pdf-' + uuid();
  Store.put(key, p.html || '');
  const w = hiddenWindow((pw - 2 * margin) * 96 / 72, ph * 96 / 72);
  try {
    const job = (async () => {
      await w.loadURL('sinai-preview://p/' + key);
      await sleep(1200); // marked, mermaid, fonts
      const data = await w.webContents.printToPDF({
        pageSize: letter ? 'Letter' : 'A4', landscape, printBackground: true,
        margins: { top: margin / 72, bottom: margin / 72, left: margin / 72, right: margin / 72 },
      });
      await fs.promises.writeFile(out, data);
      return out;
    })();
    return await Promise.race([job, sleep(60000).then(() => { throw new BridgeError('Waktu habis saat membuat PDF'); })]);
  } finally {
    docs.delete(key);
    if (!w.isDestroyed()) w.destroy();
  }
}

/** Renders HTML off-screen, then shows the system print dialog. */
async function printHTML(p, parent) {
  const key = 'print-' + uuid();
  Store.put(key, p.html || '');
  const w = hiddenWindow(816, 1056);
  w.setTitle(p.name || 'Sinai');
  try {
    await w.loadURL('sinai-preview://p/' + key);
    await sleep(800);
    return await new Promise((resolve, reject) => {
      w.webContents.print({ silent: false, printBackground: true }, (ok, reason) => {
        if (ok || reason === 'cancelled' || reason === 'Print job canceled') resolve(!!ok);
        else reject(new BridgeError('Gagal mencetak: ' + reason));
      });
    });
  } finally {
    docs.delete(key);
    setTimeout(() => { if (!w.isDestroyed()) w.destroy(); }, 1000);
  }
}

module.exports = { Store, registerPreviewScheme, previewSession, showPreviewWindow, exportPreview, htmlToPDF, printHTML, hiddenWindow, saveResult, sleep, WEB_ROOT };
