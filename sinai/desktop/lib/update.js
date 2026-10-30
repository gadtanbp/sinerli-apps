// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Pembaruan dari Sinerli (Windows/Linux): unduh installer, cocokkan SHA-256
// dari manifest, lalu pasang sesuai cara Sinai dipasang dan buka ulang.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { app, shell, session } = require('electron');
const { BridgeError, IS_WIN, toPosix } = require('./util');

/** Jenis instalasi yang sedang berjalan — menentukan berkas mana yang diminta dari Sinerli. */
function kind() {
  if (IS_WIN) return process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' : 'setup';
  if (process.platform === 'linux') {
    if (process.env.APPIMAGE) return 'appimage';
    if (app.isPackaged && process.execPath.startsWith('/opt/')) return 'deb';
    return 'tar';
  }
  return 'dmg';
}

function downloadDir() {
  const d = path.join(app.getPath('downloads'), 'Pembaruan Sinai');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

async function download(p, emit) {
  let url;
  try { url = new URL(String(p.url || '')); } catch (e) { throw new BridgeError('Alamat unduhan pembaruan tidak valid.'); }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new BridgeError('Alamat unduhan pembaruan tidak valid.');
  const sha = String(p.sha256 || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha)) throw new BridgeError('Manifest pembaruan tidak memuat SHA-256.');
  const name = path.basename(String(p.name || 'Sinai-update')).replace(/[\\/:*?"<>|]/g, '_');
  const dest = path.join(downloadDir(), name);
  const part = dest + '.part';
  const job = String(p.job || 'update');

  const res = await session.fromPartition('sinai-update', { cache: false }).fetch(url.toString(), { cache: 'no-store', redirect: 'follow' });
  if (res.status !== 200 || !res.body) throw new BridgeError('Server pembaruan menjawab HTTP ' + res.status + '.');
  const total = Number(res.headers.get('content-length')) || 0;
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(part);
  let got = 0, last = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const buf = Buffer.from(value);
      hash.update(buf);
      got += buf.length;
      if (!out.write(buf)) await new Promise((r) => out.once('drain', r));
      if (Date.now() - last > 200) { last = Date.now(); emit('update.progress', { job, received: got, total }); }
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  } catch (e) {
    out.destroy();
    fs.rmSync(part, { force: true });
    throw new BridgeError('Unduhan pembaruan gagal: ' + (e.message || e));
  }
  emit('update.progress', { job, received: got, total: total || got });
  if (hash.digest('hex') !== sha) {
    fs.rmSync(part, { force: true });
    throw new BridgeError('Berkas pembaruan rusak atau tidak cocok (SHA-256 berbeda). Coba lagi.');
  }
  fs.rmSync(dest, { force: true });
  fs.renameSync(part, dest);
  return toPosix(dest);
}

function detached(cmd, args, opts) {
  const c = spawn(cmd, args, Object.assign({ detached: true, stdio: 'ignore' }, opts || {}));
  c.unref();
}

/** Menjalankan perintah setelah proses Sinai ini selesai (supaya kunci satu-instans sudah lepas). */
function afterExit(shellLine) {
  detached('/bin/sh', ['-c', 'while kill -0 ' + process.pid + ' 2>/dev/null; do sleep 0.3; done; ' + shellLine]);
}
const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

async function install(p) {
  const file = String(p.path || '');
  if (!file || !fs.existsSync(file)) throw new BridgeError('Berkas pembaruan tidak ditemukan.');
  const k = kind();
  const quit = () => setTimeout(() => app.quit(), 400);

  if (IS_WIN && k === 'setup') {
    // Installer NSIS electron-builder: /S senyap, --force-run membuka Sinai lagi setelah selesai.
    detached(file, ['/S', '--updated', '--force-run'], { windowsHide: true });
    quit();
    return { mode: 'installer' };
  }
  if (IS_WIN && k === 'portable' && process.env.PORTABLE_EXECUTABLE_FILE) {
    const target = process.env.PORTABLE_EXECUTABLE_FILE;
    const script = path.join(os.tmpdir(), 'sinai-update-' + Date.now() + '.cmd');
    fs.writeFileSync(script, [
      '@echo off',
      ':wait',
      'tasklist /FI "PID eq ' + process.pid + '" 2>nul | find "' + process.pid + '" >nul',
      'if not errorlevel 1 (timeout /t 1 /nobreak >nul & goto wait)',
      'copy /Y "' + file + '" "' + target + '" >nul',
      'start "" "' + target + '"',
      'del "%~f0"',
    ].join('\r\n'));
    detached('cmd.exe', ['/c', script], { windowsHide: true });
    quit();
    return { mode: 'restart' };
  }
  if (k === 'appimage' && process.env.APPIMAGE) {
    const target = process.env.APPIMAGE;
    const tmp = target + '.new';
    fs.copyFileSync(file, tmp);
    fs.chmodSync(tmp, 0o755);
    fs.renameSync(tmp, target);   // aman di Linux: proses yang berjalan tetap memegang berkas lama
    afterExit('exec ' + shq(target));
    quit();
    return { mode: 'restart' };
  }
  // .deb butuh hak admin: buka dengan pemasang paket sistem. tar.gz: tampilkan berkasnya.
  if (k === 'deb') { const err = await shell.openPath(file); if (!err) return { mode: 'opened' }; }
  shell.showItemInFolder(file);
  return { mode: 'opened' };
}

module.exports = { kind, download, install };
