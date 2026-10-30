// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Recording (microphone, screen, Windows system audio), screenshots and the
// camera, through Chromium's media capture in Sinai's own helper pages.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BrowserWindow, desktopCapturer, screen } = require('electron');
const U = require('./util');
const { BridgeError, toPosix, IS_WIN } = U;
const worker = require('./worker');

function stampName(prefix, ext) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return prefix + ' ' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + '.' + pad(d.getMinutes()) + '.' + pad(d.getSeconds()) + '.' + ext;
}

function tempFile(prefix, ext) {
  return path.join(U.tempDir('sinai-cap-'), stampName(prefix, ext));
}

// ---------------------------------------------------------------- recording
const recs = new Map();

async function recordStart(p, emit) {
  const kind = ['audio', 'screen', 'system'].includes(p.kind) ? p.kind : 'audio';
  if (kind === 'system' && !IS_WIN) throw new BridgeError('Rekam audio sistem hanya tersedia di Windows. Gunakan "Rekam layar" untuk merekam yang tampil di layar.');
  if (recs.size) throw new BridgeError('Perekaman lain masih berjalan');
  const file = tempFile(kind === 'screen' ? 'rekaman layar' : kind === 'system' ? 'audio sistem' : 'rekaman', 'webm');
  const token = worker.newToken(file);
  try {
    await worker.call('recordStart', { kind, mic: !!p.mic, token }, true);
  } catch (e) {
    worker.tokens.delete(token);
    const m = String(e.message || e);
    if (/Permission|NotAllowed|denied/i.test(m)) throw new BridgeError(kind === 'audio' ? 'Akses mikrofon ditolak. Izinkan mikrofon untuk aplikasi di pengaturan privasi sistem.' : 'Akses perekaman layar ditolak oleh sistem.');
    if (/NotFound|Requested device not found/i.test(m)) throw new BridgeError('Mikrofon tidak ditemukan.');
    throw new BridgeError('Perekaman gagal dimulai: ' + m);
  }
  const id = U.uuid();
  const start = Date.now();
  const tick = setInterval(() => emit('record.tick', { id, seconds: (Date.now() - start) / 1000 }), 1000);
  recs.set(id, { token, file, tick, kind });
  return { id, kind };
}

async function recordStop(p) {
  const r = recs.get(p.id || '') || (recs.size === 1 ? recs.values().next().value : null);
  if (!r) return null;
  for (const [k, v] of recs) if (v === r) recs.delete(k);
  clearInterval(r.tick);
  let duration = 0;
  try { duration = (await worker.call('recordStop', { token: r.token })).duration; } finally { worker.tokens.delete(r.token); }
  if (p.cancel) { fs.rmSync(path.dirname(r.file), { recursive: true, force: true }); return null; }
  if (!fs.existsSync(r.file) || !fs.statSync(r.file).size) throw new BridgeError('Rekaman kosong');
  return { path: toPosix(r.file), duration, kind: r.kind };
}

// ---------------------------------------------------------------- screenshots
async function screenshot(p, win) {
  const display = win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
  const size = { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) };
  const wasVisible = win && win.isVisible() && !win.isMinimized();
  if (wasVisible) { win.hide(); await new Promise((r) => setTimeout(r, 350)); }
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
    const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
    if (!src || src.thumbnail.isEmpty()) throw new BridgeError('Tangkapan layar tidak diizinkan oleh sistem');
    const file = tempFile('tangkapan layar', 'png');
    fs.writeFileSync(file, src.thumbnail.toPNG());
    return toPosix(file);
  } finally {
    if (wasVisible) { win.show(); win.focus(); }
  }
}

async function windowSnapshot(win) {
  if (!win) throw new BridgeError('Snapshot gagal');
  const img = await win.webContents.capturePage();
  const file = tempFile('jendela Sinai', 'png');
  fs.writeFileSync(file, img.toPNG());
  return toPosix(file);
}

// ---------------------------------------------------------------- camera
function openCamera(parent, icon) {
  const file = tempFile('foto kamera', 'png');
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (v, err) => { if (settled) return; settled = true; worker.tokens.delete(token); if (err) reject(err); else resolve(v); };
    const token = worker.newToken(file, {
      onDone: (result) => {
        if (result && result.ok && fs.existsSync(file)) done(toPosix(file));
        else if (result && result.error) done(null, new BridgeError(result.error));
        else done(null);
        if (!w.isDestroyed()) w.close();
      },
    });
    const w = new BrowserWindow({
      parent, modal: false, width: 720, height: 600, minWidth: 420, minHeight: 380, title: 'Kamera', icon, autoHideMenuBar: true,
      backgroundColor: '#111', show: false,
      webPreferences: { session: worker.workerSession(), preload: path.join(__dirname, 'worker-preload.js'), sandbox: true, contextIsolation: true },
    });
    worker.workerContents.add(w.webContents);
    w.webContents.on('destroyed', () => worker.workerContents.delete(w.webContents));
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.once('ready-to-show', () => w.show());
    w.on('closed', () => done(null));
    w.loadURL('sinai-worker://app/camera.html#' + encodeURIComponent(token)).catch((e) => done(null, e));
  });
}

module.exports = { recordStart, recordStop, screenshot, windowSnapshot, openCamera };
