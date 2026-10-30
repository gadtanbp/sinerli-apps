// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Host side of the hidden helper page (lib/worker/): starts it on demand,
// serves its files and registered local files over sinai-worker://, and
// turns its results into bridge answers.
'use strict';
const fs = require('fs');
const path = require('path');
const { BrowserWindow, session, ipcMain, desktopCapturer } = require('electron');
const U = require('./util');
const { BridgeError, expand, toPosix, Env, runSync, IS_WIN } = U;

const ROOT = path.join(__dirname, 'worker');
let win = null;
let ready = null;
let ses = null;

// ---------------------------------------------------------------- files & tokens
const files = new Map();     // key -> absolute path (read access for the page)
const tokens = new Map();    // token -> { path, onProgress, onDone }

function fileURL(p) {
  const key = U.uuid().replace(/-/g, '');
  files.set(key, p);
  if (files.size > 400) files.delete(files.keys().next().value);
  return 'sinai-worker://file/' + key + '/' + encodeURIComponent(path.basename(p));
}

function newToken(target, extra) {
  const t = U.uuid();
  tokens.set(t, Object.assign({ path: target }, extra || {}));
  return t;
}

ipcMain.handle('gxw-write', async (e, token, bytes, append) => {
  const t = tokens.get(token);
  if (!t || !isWorkerSender(e.sender)) throw new Error('token');
  const buf = Buffer.from(bytes);
  if (append) await fs.promises.appendFile(t.path, buf); else await fs.promises.writeFile(t.path, buf);
  return true;
});
ipcMain.on('gxw-progress', (e, token, f) => { const t = tokens.get(token); if (t && t.onProgress && isWorkerSender(e.sender)) t.onProgress(f); });
ipcMain.on('gxw-done', (e, token, result) => { const t = tokens.get(token); if (t && t.onDone && isWorkerSender(e.sender)) t.onDone(result); });

const workerContents = new Set();
function isWorkerSender(wc) { return workerContents.has(wc); }

function workerSession() {
  if (ses) return ses;
  ses = session.fromPartition('sinai-worker');
  ses.protocol.handle('sinai-worker', async (req) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (url.host === 'app') {
      if (!parts.length || parts.includes('..') || parts.includes('.')) return new Response('Not found', { status: 404 });
      try {
        const f = path.join(ROOT, ...parts);
        return new Response(await fs.promises.readFile(f), { headers: { 'Content-Type': U.mimeOf(f), 'Cache-Control': 'no-store' } });
      } catch (e) { return new Response('Not found', { status: 404 }); }
    }
    if (url.host === 'file' && parts[0] && files.has(parts[0])) return serveRange(req, files.get(parts[0]));
    return new Response('Not found', { status: 404 });
  });
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(isWorkerSender(wc) && ['media', 'display-capture'].includes(permission)));
  ses.setPermissionCheckHandler((wc, permission) => !!wc && isWorkerSender(wc) && ['media', 'display-capture'].includes(permission));
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      if (!sources.length) return callback({});
      const out = { video: sources[0] };
      if (IS_WIN && request.audioRequested) out.audio = 'loopback';
      callback(out);
    } catch (e) { callback({}); }
  });
  return ses;
}

async function serveRange(req, file) {
  let st;
  try { st = await fs.promises.stat(file); } catch (e) { return new Response('Not found', { status: 404 }); }
  const size = st.size;
  const m = /^bytes=(\d*)-(\d*)$/.exec((req.headers.get('range') || '').trim());
  let start = 0, end = size - 1, partial = false;
  if (m) { partial = true; if (m[1]) { start = +m[1]; if (m[2]) end = Math.min(+m[2], size - 1); } else if (m[2]) start = Math.max(0, size - +m[2]); }
  if (size === 0) end = -1;
  const headers = { 'Content-Type': U.mimeOf(file), 'Accept-Ranges': 'bytes', 'Content-Length': String(Math.max(0, end - start + 1)), 'Access-Control-Allow-Origin': '*' };
  if (partial) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
  const body = end >= start ? require('stream').Readable.toWeb(fs.createReadStream(file, { start, end })) : '';
  return new Response(body, { status: partial ? 206 : 200, headers });
}

function ensure() {
  if (ready && win && !win.isDestroyed()) return ready;
  win = new BrowserWindow({
    show: false, width: 800, height: 600,
    webPreferences: {
      session: workerSession(), preload: path.join(__dirname, 'worker-preload.js'),
      sandbox: true, contextIsolation: true, backgroundThrottling: false, spellcheck: false,
    },
  });
  const wc = win.webContents;
  workerContents.add(wc);
  wc.on('destroyed', () => workerContents.delete(wc));
  wc.on('render-process-gone', () => { ready = null; try { win.destroy(); } catch (e) { /* gone */ } win = null; });
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e) => e.preventDefault());
  ready = (async () => {
    await win.loadURL('sinai-worker://app/index.html');
    for (let i = 0; i < 200; i++) {
      if (await wc.executeJavaScript('!!window.__workerReady').catch(() => false)) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new BridgeError('Komponen pembaca tidak bisa dimulai');
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

async function call(fn, args, userGesture) {
  await ensure();
  const js = 'Promise.resolve().then(function(){return window.W[' + JSON.stringify(fn) + '](' + JSON.stringify(args || {}) + ')}).then(function(v){return {ok:true,v:v}},function(e){return {ok:false,e:String(e&&e.message||e)}})';
  const r = await win.webContents.executeJavaScript(js, !!userGesture);
  if (!r || !r.ok) throw new BridgeError((r && r.e) || 'Gagal');
  return r.v;
}

function src(p) {
  if (p.base64) return { base64: p.base64 };
  if (!p.path) throw new BridgeError('path wajib diisi');
  const f = expand(p.path);
  if (!fs.existsSync(f)) throw new BridgeError('File tidak ditemukan: ' + f);
  return { url: fileURL(f) };
}

// ---------------------------------------------------------------- API
async function imagePrepare(p) {
  return call('imagePrepare', Object.assign(src(p), { maxDim: p.maxDim || 1600, png: !!p.png }));
}

async function imageMeta(p) { return call('imageMeta', src(p)); }

async function thumbnail(p) {
  const f = expand(p.path || '');
  const ext = path.extname(f).slice(1).toLowerCase();
  const size = p.size || 1200;
  if (ext === 'pdf') return call('pdfThumb', Object.assign(src(p), { size }));
  if (/^(mp4|m4v|mov|webm|mkv|avi|ogv)$/.test(ext)) return call('videoThumb', Object.assign(src(p), { size }));
  try { return await call('imagePrepare', Object.assign(src(p), { maxDim: size, png: true })); }
  catch (e) { throw new BridgeError('Pratinjau tidak tersedia untuk file ini'); }
}

async function pdfRead(p) {
  const wantOcr = p.ocr !== false && !!Env.which('tesseract');
  const r = await call('pdfRead', Object.assign(src(p), {
    password: p.password, maxPages: p.maxPages || 400, images: p.images | 0, ocrImages: wantOcr, ocrPages: p.ocrPages || 30,
  }));
  if (r.scanned && r.ocrImages && r.ocrImages.length) {
    const dir = U.tempDir('sinai-ocr-');
    try {
      const parts = [];
      for (let i = 0; i < r.ocrImages.length; i++) {
        const f = path.join(dir, 'p' + (i + 1) + '.png');
        fs.writeFileSync(f, Buffer.from(r.ocrImages[i].data, 'base64'));
        const t = await require('./files').ocr({ path: f }).catch(() => ({ text: '' }));
        parts.push('--- Halaman ' + (i + 1) + ' (OCR) ---\n' + t.text);
      }
      r.text = parts.join('\n\n');
      r.ocr = true;
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  delete r.ocrImages;
  return r;
}

async function mediaInfo(p) { return call('mediaInfo', Object.assign(src(p), { frames: p.frames | 0 })); }
async function audioStats(p) { return call('audioStats', Object.assign(src(p), { maxSeconds: p.maxSeconds })); }
async function convertImage(p) { return call('convertImage', Object.assign(src(p), { format: p.format, quality: p.quality })); }

async function htmlTo(kind, html, opts) {
  const fn = { docx: 'htmlToDocx', odt: 'htmlToOdt', rtf: 'htmlToRtf', txt: 'htmlToText' }[kind];
  return call(fn, Object.assign({ html: String(html || '') }, opts || {}));
}

/** Images → video. Uses MP4 when the engine can encode it, else WebM (ffmpeg converts to MP4 when installed). */
async function videoMake(p, progress) {
  if (!p.outPath) throw new BridgeError('outPath wajib diisi');
  let out = expand(p.outPath);
  require('./files').guardWritable(out);
  await fs.promises.mkdir(path.dirname(out), { recursive: true });
  const frames = (p.frames || []).filter((f) => f && f.path);
  if (!frames.length || frames.length > 120) throw new BridgeError('Video perlu 1–120 adegan');
  const urls = new Map();
  const list = frames.map((f) => {
    const fp = expand(f.path);
    if (!fs.existsSync(fp)) throw new BridgeError('Gambar adegan tidak terbaca');
    if (!urls.has(fp)) urls.set(fp, fileURL(fp));
    return { url: urls.get(fp), y: f.y, h: f.h, baseWidth: f.baseWidth, duration: f.duration };
  });
  const fmt = await call('videoFormat', {});
  const wantExt = path.extname(out).slice(1).toLowerCase() || 'mp4';
  const ffmpeg = Env.which('ffmpeg');
  let target = out;
  if (fmt.ext !== wantExt) target = ffmpeg ? out.replace(/\.[^.\/]+$/, '') + '.sinai-tmp.' + fmt.ext : out.replace(/\.[^.\/]+$/, '') + '.' + fmt.ext;
  const token = newToken(target, { onProgress: (f) => progress && progress(0.05 + 0.85 * f) });
  try {
    const r = await call('videoMake', {
      token, frames: list,
      width: Math.max(320, Math.min(p.width || 1280, 3840)) & ~1, height: Math.max(240, Math.min(p.height || 720, 2160)) & ~1,
      fps: Math.max(10, Math.min(p.fps || 30, 60)), fade: Math.max(0, Math.min(p.fade != null ? p.fade : 0.6, 2)),
    });
    if (target !== out && ffmpeg) {
      progress && progress(0.92);
      const c = await runSync(ffmpeg, ['-y', '-i', target, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { timeout: 900 });
      fs.rmSync(target, { force: true });
      if (c.code !== 0) throw new BridgeError('Konversi video ke MP4 gagal: ' + c.err.slice(-300));
      target = out;
    }
    progress && progress(1);
    return { path: toPosix(target), duration: r.duration, scenes: r.scenes, narrated: false, format: path.extname(target).slice(1) };
  } finally { tokens.delete(token); }
}

module.exports = {
  ensure, call, fileURL, newToken, tokens, workerSession, isWorkerSender, workerContents, ROOT,
  imagePrepare, imageMeta, thumbnail, pdfRead, mediaInfo, audioStats, convertImage, htmlTo, videoMake,
};
