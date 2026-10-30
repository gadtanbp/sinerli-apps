// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Shared helpers for the Windows/Linux host: paths, environment, processes, zip.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

class BridgeError extends Error {}

// ---------------------------------------------------------------- paths
// The web layer works with "/"-separated paths everywhere (C:/Users/… on
// Windows); Node accepts those on every platform.
function toPosix(p) {
  if (p == null) return p;
  let s = String(p);
  if (IS_WIN) s = s.replace(/\\/g, '/');
  return s;
}

function home() { return toPosix(os.homedir()); }

function expand(p) {
  let s = String(p == null ? '' : p).trim();
  if (IS_WIN) s = s.replace(/\\/g, '/');
  if (s === '~' || s.startsWith('~/')) s = os.homedir() + s.slice(1);
  if (IS_WIN && /^\/[A-Za-z]:\//.test(s)) s = s.slice(1); // "/C:/x" from URL-ish input
  return toPosix(path.resolve(s));
}

let supportDir = null;
function support() {
  if (supportDir) return supportDir;
  const { app } = require('electron');
  const dir = process.env.SINAI_SUPPORT_DIR
    ? path.resolve(process.env.SINAI_SUPPORT_DIR)
    : path.join(app.getPath('appData'), 'Sinai');
  fs.mkdirSync(dir, { recursive: true });
  supportDir = toPosix(dir);
  return supportDir;
}

/** Resolves a path inside the app data folder, refusing anything that escapes it. */
function inSupport(rel) {
  rel = String(rel || '');
  const parts = rel.split('/').filter(Boolean);
  if (rel.startsWith('/') || rel.startsWith('~') || /^[A-Za-z]:/.test(rel) || rel.includes('\\') || parts.includes('..') || parts.includes('.')) return null;
  return parts.length ? support() + '/' + parts.join('/') : support();
}

function tempDir(prefix) {
  const dir = path.join(os.tmpdir(), (prefix || 'sinai-') + crypto.randomBytes(5).toString('hex'));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return toPosix(dir);
}

function uuid() { return crypto.randomUUID(); }

// ---------------------------------------------------------------- environment
const Env = {
  path: process.env.PATH || process.env.Path || '',
  shell: null,       // { exe, args(cmd) => [...], posix, name }
  resolved: false,

  /** The user's login PATH (macOS/Linux), so tools installed by version managers are found. */
  resolveLoginPath() {
    if (IS_WIN) { this.resolved = true; return; }
    const sh = process.env.SHELL || '/bin/bash';
    const marker = '__SINAI_PATH__';
    try {
      const r = spawnSync(sh, ['-ilc', `printf '%s' "${marker}$PATH${marker}"`], { timeout: 6000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const out = r.stdout || '';
      const a = out.indexOf(marker), b = out.indexOf(marker, a + marker.length);
      let merged = a >= 0 && b > a ? out.slice(a + marker.length, b).split(':') : this.path.split(':');
      for (const extra of ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin', os.homedir() + '/.local/bin'].concat(IS_MAC ? ['/opt/homebrew/bin'] : [])) {
        if (!merged.includes(extra)) merged.push(extra);
      }
      this.path = merged.filter(Boolean).join(':');
    } catch (e) { /* keep process PATH */ }
    this.resolved = true;
  },

  environment(extra) {
    const env = Object.assign({}, process.env);
    if (IS_WIN) { delete env.PATH; env.Path = this.path; } else env.PATH = this.path;
    env.HOME = env.HOME || os.homedir();
    if (!env.LANG && !IS_WIN) env.LANG = 'en_US.UTF-8';
    env.TERM = 'dumb';
    env.NO_COLOR = '1';
    env.CLICOLOR = '0';
    env.GIT_PAGER = 'cat';
    env.PAGER = 'cat';
    env.GIT_TERMINAL_PROMPT = '0';
    env.PYTHONIOENCODING = 'utf-8';
    env.SINAI = '1';
    for (const k of ['SINAI_DEBUG_PORT', 'SINAI_WEB_ROOT', 'SINAI_SECRET_STORE', 'SINAI_SUPPORT_DIR', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ATTACH_CONSOLE']) delete env[k];
    Object.assign(env, extra || {});
    return env;
  },

  /** Finds a program on PATH (Windows: also tries .exe/.cmd/.bat). */
  which(name) {
    const sep = IS_WIN ? ';' : ':';
    const exts = IS_WIN ? ['', '.exe', '.cmd', '.bat', '.com'] : [''];
    for (const dir of this.path.split(sep)) {
      if (!dir) continue;
      for (const ext of exts) {
        const p = path.join(dir, name + ext);
        try { if (fs.statSync(p).isFile()) return toPosix(p); } catch (e) { /* next */ }
      }
    }
    return null;
  },

  /**
   * The shell used for commands. macOS/Linux: zsh/bash. Windows: Git Bash when
   * installed (POSIX tools like grep, head, sed work), otherwise PowerShell.
   */
  getShell() {
    if (this.shell) return this.shell;
    if (!IS_WIN) {
      let exe = '/bin/bash';
      const user = process.env.SHELL || '';
      if (/\/(zsh|bash)$/.test(user) && fs.existsSync(user)) exe = user;
      else if (IS_MAC && fs.existsSync('/bin/zsh')) exe = '/bin/zsh';
      else if (!fs.existsSync(exe)) exe = '/bin/sh';
      this.shell = { exe, posix: true, name: path.basename(exe), args: (cmd) => ['-c', cmd] };
      return this.shell;
    }
    const candidates = [];
    const pf = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean);
    for (const base of pf) candidates.push(path.join(base, 'Git', 'bin', 'bash.exe'));
    const git = this.which('git');
    if (git) candidates.push(path.join(path.dirname(path.dirname(git)), 'bin', 'bash.exe'));
    for (const c of candidates) {
      if (c && fs.existsSync(c)) {
        this.shell = { exe: toPosix(c), posix: true, name: 'bash (Git Bash)', args: (cmd) => ['-c', cmd] };
        return this.shell;
      }
    }
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    this.shell = {
      exe: fs.existsSync(ps) ? ps : 'powershell.exe', posix: false, name: 'PowerShell',
      args: (cmd) => ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
        '[Console]::OutputEncoding=[Text.Encoding]::UTF8;$OutputEncoding=[Text.Encoding]::UTF8;' + cmd],
    };
    return this.shell;
  },
};

if (IS_WIN) Env.path = process.env.Path || process.env.PATH || '';

/** Runs a short-lived process and collects its output. */
function runSync(exe, args, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    let out = [], err = [], done = false;
    let child;
    try {
      child = spawn(exe, args || [], {
        cwd: opts.cwd || os.homedir(), env: opts.env || Env.environment(), windowsHide: true,
        stdio: [opts.input != null ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      });
    } catch (e) { resolve({ code: -1, out: '', err: e.message }); return; }
    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code, out: Buffer.concat(out).toString('utf8'), err: Buffer.concat(err).toString('utf8'), outBuf: Buffer.concat(out) });
    };
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', (e) => { err.push(Buffer.from(e.message)); finish(-1); });
    child.on('close', (code) => finish(code == null ? -1 : code));
    if (opts.input != null) { child.stdin.end(opts.input); }
    const timer = setTimeout(() => { killTree(child.pid, true); setTimeout(() => finish(-1), 500); }, (opts.timeout || 10) * 1000);
  });
}

/** Terminates a process and everything it started. */
function killTree(pid, force) {
  if (!pid) return;
  if (IS_WIN) {
    try { spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch (e) { /* gone */ }
    return;
  }
  const signal = force ? 'SIGKILL' : 'SIGTERM';
  try { process.kill(-pid, signal); } catch (e) { try { process.kill(pid, signal); } catch (e2) { /* gone */ } }
  if (!force) setTimeout(() => { try { process.kill(-pid, 0); process.kill(-pid, 'SIGKILL'); } catch (e) { /* gone */ } }, 2000);
}

// ---------------------------------------------------------------- zip (write)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Builds a zip archive: entries = [[name, Buffer|string], …]. */
function zipCreate(entries) {
  const chunks = [], central = [];
  let offset = 0;
  const dosTime = 0, dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const [rawName, rawData] of entries) {
    const name = Buffer.from(String(rawName).replace(/\\/g, '/'), 'utf8');
    const data = Buffer.isBuffer(rawData) ? rawData : Buffer.from(String(rawData), 'utf8');
    const crc = crc32(data);
    let payload = data, method = 0;
    if (data.length > 64) {
      const d = zlib.deflateRawSync(data, { level: 6 });
      if (d.length < data.length) { payload = d; method = 8; }
    }
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8); local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(payload.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10); cd.writeUInt16LE(dosTime, 12); cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(payload.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    chunks.push(local, name, payload);
    offset += 30 + name.length + payload.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat(chunks.concat([cdBuf, end]));
}

// ---------------------------------------------------------------- zip (read)
/** Lists a zip's central directory (supports zip64 sizes). */
function zipEntries(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 65557 + 22);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new BridgeError('Bukan arsip zip yang valid');
    let count = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16);
    if (cdOff === 0xffffffff || count === 0xffff) {
      const loc = eocd - 20;
      if (loc >= 0 && tail.readUInt32LE(loc) === 0x07064b50) {
        const z64off = Number(tail.readBigUInt64LE(loc + 8));
        const z = Buffer.alloc(56);
        fs.readSync(fd, z, 0, 56, z64off);
        count = Number(z.readBigUInt64LE(32)); cdSize = Number(z.readBigUInt64LE(40)); cdOff = Number(z.readBigUInt64LE(48));
      }
    }
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOff);
    const out = [];
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10);
      let csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
      const nlen = cd.readUInt16LE(p + 28), xlen = cd.readUInt16LE(p + 30), clen = cd.readUInt16LE(p + 32);
      const extAttr = cd.readUInt32LE(p + 38);
      let lho = cd.readUInt32LE(p + 42);
      const nameBuf = cd.slice(p + 46, p + 46 + nlen);
      const name = (flags & 0x800) ? nameBuf.toString('utf8') : nameBuf.toString('latin1');
      // zip64 extra field
      let x = p + 46 + nlen; const xe = x + xlen;
      while (x + 4 <= xe) {
        const id = cd.readUInt16LE(x), len = cd.readUInt16LE(x + 2);
        if (id === 1) {
          let q = x + 4;
          if (usize === 0xffffffff) { usize = Number(cd.readBigUInt64LE(q)); q += 8; }
          if (csize === 0xffffffff) { csize = Number(cd.readBigUInt64LE(q)); q += 8; }
          if (lho === 0xffffffff) { lho = Number(cd.readBigUInt64LE(q)); q += 8; }
        }
        x += 4 + len;
      }
      out.push({ name, method, csize, usize, offset: lho, encrypted: !!(flags & 1), dir: name.endsWith('/'), link: ((extAttr >>> 16) & 0o170000) === 0o120000 });
      p += 46 + nlen + xlen + clen;
    }
    return out;
  } finally { fs.closeSync(fd); }
}

function zipReadEntry(file, entry, maxBytes) {
  const fd = fs.openSync(file, 'r');
  try {
    const h = Buffer.alloc(30);
    fs.readSync(fd, h, 0, 30, entry.offset);
    if (h.readUInt32LE(0) !== 0x04034b50) throw new BridgeError('Entri zip rusak');
    const start = entry.offset + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
    if (entry.encrypted) throw new BridgeError('ARCHIVE_PASSWORD: Arsip ini terenkripsi — kata sandi diperlukan.');
    const comp = Buffer.alloc(entry.csize);
    fs.readSync(fd, comp, 0, entry.csize, start);
    if (entry.method === 0) return comp;
    if (entry.method === 8) {
      return zlib.inflateRawSync(comp, maxBytes ? { maxOutputLength: Math.max(maxBytes, 1) } : undefined);
    }
    throw new BridgeError('Metode kompresi zip tidak didukung (' + entry.method + ')');
  } finally { fs.closeSync(fd); }
}

function zipRead(file, name, maxBytes) {
  const e = zipEntries(file).find((x) => x.name === name);
  if (!e) throw new BridgeError('Entri tidak ditemukan: ' + name);
  return zipReadEntry(file, e, maxBytes);
}

// ---------------------------------------------------------------- misc
function xmlEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // strip characters XML 1.0 forbids
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
}

function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** Decodes text in UTF-8 / UTF-16 (BOM) or falls back to Windows-1252. */
function decodeText(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(buf.slice(2)), encoding: 10 };
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(buf.slice(2)), encoding: 2415919360 };
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 4 }; } catch (e) { /* not utf-8 */ }
  // A cut-off multi-byte sequence at the end is still UTF-8.
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf.slice(0, Math.max(0, buf.length - 4))), encoding: 4 }; } catch (e) { /* no */ }
  return { text: new TextDecoder('windows-1252').decode(buf), encoding: 12 };
}

const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', heic: 'image/heic', tif: 'image/tiff', tiff: 'image/tiff',
  json: 'application/json; charset=utf-8', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', pdf: 'application/pdf',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
  m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', stl: 'model/stl', obj: 'text/plain; charset=utf-8', otf: 'font/otf', xml: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8', md: 'text/plain; charset=utf-8', wasm: 'application/wasm',
};
function mimeOf(p) { return MIME[String(path.extname(p || '')).slice(1).toLowerCase()] || 'application/octet-stream'; }

module.exports = {
  IS_WIN, IS_MAC, BridgeError, toPosix, home, expand, support, inSupport, tempDir, uuid, Env, runSync, killTree,
  crc32, zipCreate, zipEntries, zipReadEntry, zipRead, xmlEsc, isBinary, decodeText, mimeOf,
};
