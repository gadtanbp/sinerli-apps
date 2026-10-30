// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// File-system operations for the agent tools and readers for attached files
// (text in any encoding, Office/ODF/RTF text, archives, OCR when available).
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { app, shell, clipboard } = require('electron');
const U = require('./util');
const { BridgeError, expand, toPosix, Env, runSync, IS_WIN } = U;

const HEAVY = new Set(['node_modules', '.git', '.svn', '.hg', '__pycache__', '.venv', 'venv', '.next', '.nuxt',
  '.cache', 'Pods', 'DerivedData', '.build', '.gradle', '.idea', '.turbo', '.parcel-cache',
  'vendor', 'target', '.terraform', 'bower_components', '.DS_Store']);

/** The installed Sinai program files are read-only for every tool. */
function guardWritable(p) {
  if (!app.isPackaged) return;
  const roots = [path.dirname(process.execPath), process.resourcesPath].map((r) => toPosix(path.resolve(r)).toLowerCase());
  let target = toPosix(path.resolve(p));
  try { target = toPosix(fs.realpathSync.native(p)); } catch (e) { /* new file */ }
  const t = target.toLowerCase();
  if (roots.some((r) => t === r || t.startsWith(r + '/'))) {
    throw new BridgeError('Tidak diizinkan: file aplikasi Sinai dilindungi dan tidak boleh diubah.');
  }
}

function mustExist(raw) {
  if (!raw) throw new BridgeError('path wajib diisi');
  const p = expand(raw);
  if (!fs.existsSync(p)) throw new BridgeError('File tidak ditemukan: ' + p);
  return p;
}

function readHead(p, n) {
  const fd = fs.openSync(p, 'r');
  try {
    const buf = Buffer.alloc(n);
    const got = fs.readSync(fd, buf, 0, n, 0);
    return buf.slice(0, got);
  } finally { fs.closeSync(fd); }
}

// ---------------------------------------------------------------- agent fs tools
async function read(p) {
  const f = mustExist(p.path);
  const st = await fsp.stat(f);
  if (st.isDirectory()) throw new BridgeError('Path adalah folder, bukan file: ' + f);
  const maxBytes = p.maxBytes || 4000000;
  const data = readHead(f, Math.min(maxBytes, st.size));
  const binary = U.isBinary(data);
  const out = { path: f, size: st.size, truncated: st.size > maxBytes, binary, mtime: st.mtimeMs };
  if (p.base64) out.base64 = data.toString('base64');
  else if (!binary) out.content = U.decodeText(data).text;
  return out;
}

async function write(p) {
  if (!p.path || typeof p.content !== 'string') throw new BridgeError('path dan content wajib diisi');
  const f = expand(p.path);
  guardWritable(f);
  const existed = fs.existsSync(f);
  await fsp.mkdir(path.dirname(f), { recursive: true });
  const data = Buffer.from(p.content, 'utf8');
  if (existed) await fsp.writeFile(f, data);
  else { const tmp = f + '.sinai-tmp'; await fsp.writeFile(tmp, data); await fsp.rename(tmp, f); }
  return { path: f, created: !existed, bytes: data.length };
}

function stat(p) {
  if (!p.path) return { exists: false };
  const f = expand(p.path);
  try {
    const st = fs.statSync(f);
    return { exists: true, path: f, isDir: st.isDirectory(), size: st.size, mtime: st.mtimeMs };
  } catch (e) { return { exists: false, path: f }; }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function list(p) {
  if (!p.path) throw new BridgeError('path wajib diisi');
  const root = expand(p.path);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new BridgeError('Folder tidak ditemukan: ' + root);
  const maxDepth = Math.max(1, Math.min(p.depth || 2, 8));
  const limit = p.limit || 400;
  const hidden = !!p.hidden;
  const entries = [];
  let truncated = false;
  (function walk(dir, rel, depth) {
    if (truncated) return;
    let names;
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    names.sort((a, b) => collator.compare(a.name, b.name));
    for (const d of names) {
      if (entries.length >= limit) { truncated = true; return; }
      const name = d.name;
      if (name === '.DS_Store' || name === 'Thumbs.db' || name === 'desktop.ini') continue;
      if (!hidden && name.startsWith('.') && !['.env.example', '.gitignore', '.github'].includes(name)) continue;
      const full = path.join(dir, name);
      const relPath = rel ? rel + '/' + name : name;
      let isDir = d.isDirectory();
      if (d.isSymbolicLink()) { try { isDir = fs.statSync(full).isDirectory(); } catch (e) { isDir = false; } }
      const e = { path: relPath, dir: isDir, depth };
      if (isDir) {
        if (HEAVY.has(name)) { e.skipped = true; entries.push(e); continue; }
        entries.push(e);
        if (depth < maxDepth) walk(full, relPath, depth + 1);
      } else {
        try { e.size = fs.statSync(full).size; } catch (er) { e.size = 0; }
        entries.push(e);
      }
    }
  })(root, '', 1);
  return { root, entries, truncated };
}

/** Converts a glob (supports **, *, ?, {a,b}, [abc]) into an anchored regex. */
function globRegex(pattern, flags) {
  let rx = '^', i = 0, inBrace = 0;
  const c = Array.from(pattern);
  while (i < c.length) {
    const ch = c[i];
    if (ch === '*') {
      if (c[i + 1] === '*') {
        if (c[i + 2] === '/') { rx += '(?:.*/)?'; i += 3; continue; }
        rx += '.*'; i += 2; continue;
      }
      rx += '[^/]*';
    } else if (ch === '?') rx += '[^/]';
    else if (ch === '{') { rx += '(?:'; inBrace++; }
    else if (ch === '}') { rx += inBrace > 0 ? ')' : '\\}'; inBrace = Math.max(0, inBrace - 1); }
    else if (ch === ',') rx += inBrace > 0 ? '|' : ',';
    else if (ch === '[') {
      const close = c.indexOf(']', i + 1);
      if (close > 0) {
        let cls = c.slice(i + 1, close).join('');
        if (cls.startsWith('!')) cls = '^' + cls.slice(1);
        rx += '[' + cls + ']'; i = close + 1; continue;
      }
      rx += '\\[';
    } else if ('.()+|^$\\'.includes(ch)) rx += '\\' + ch;
    else rx += ch;
    i++;
  }
  try { return new RegExp(rx + '$', flags || (IS_WIN ? 'i' : '')); } catch (e) { return null; }
}

function walkFiles(root, opts, visit) {
  let scanned = 0;
  const stack = [[root, '']];
  while (stack.length) {
    const [dir, rel] = stack.pop();
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const d of items) {
      if (++scanned > (opts.maxScan || 300000)) return;
      const full = path.join(dir, d.name);
      const r = rel ? rel + '/' + d.name : d.name;
      if (d.isDirectory()) {
        if (!opts.heavy && HEAVY.has(d.name)) continue;
        stack.push([full, r]);
      } else if (d.isFile() || d.isSymbolicLink()) {
        if (visit(full, r, d.name) === false) return;
      }
    }
  }
}

function glob(p) {
  if (!p.root || !p.pattern) throw new BridgeError('root dan pattern wajib diisi');
  const root = expand(p.root);
  if (!fs.existsSync(root)) throw new BridgeError('Folder tidak ditemukan: ' + root);
  const limit = p.limit || 200;
  let pat = String(p.pattern).replace(/\\/g, '/');
  if (pat.startsWith('./')) pat = pat.slice(2);
  const matchBase = !pat.includes('/');
  const rx = globRegex(pat);
  if (!rx) throw new BridgeError('Pola glob tidak valid');
  const wantsHeavy = Array.from(HEAVY).some((h) => pat.includes(h));
  const results = [];
  walkFiles(root, { heavy: wantsHeavy }, (full, rel, name) => {
    if (rx.test(matchBase ? name : rel)) {
      let m = 0; try { m = fs.statSync(full).mtimeMs; } catch (e) { /* gone */ }
      results.push([rel, m]);
    }
  });
  results.sort((a, b) => b[1] - a[1]);
  return { root, files: results.slice(0, limit).map((r) => r[0]), total: results.length, truncated: results.length > limit };
}

/** grep-like search used where no POSIX shell is installed (Windows without Git Bash). */
function grep(p) {
  if (!p.pattern) throw new BridgeError('pattern wajib diisi');
  const root = expand(p.path || p.root || '.');
  let rx;
  try { rx = new RegExp(p.pattern, p.ignore_case ? 'i' : ''); } catch (e) { throw new BridgeError('Regex tidak valid: ' + e.message); }
  const inc = p.include ? globRegex(String(p.include)) : null;
  const ctx = Math.max(0, Math.min(5, p.context | 0));
  const filesOnly = p.output_mode === 'files';
  const out = [];
  let lines = 0;
  const visit = (full, rel, name) => {
    if (inc && !inc.test(name)) return;
    let buf;
    try { const st = fs.statSync(full); if (st.size > 4000000) return; buf = fs.readFileSync(full); } catch (e) { return; }
    if (U.isBinary(buf)) return;
    const text = U.decodeText(buf).text.split(/\r?\n/);
    const shown = toPosix(full);
    let hits = 0;
    for (let i = 0; i < text.length; i++) {
      if (!rx.test(text[i])) continue;
      hits++;
      if (filesOnly) { out.push(shown); lines++; break; }
      const a = Math.max(0, i - ctx), b = Math.min(text.length - 1, i + ctx);
      for (let k = a; k <= b; k++) { out.push(shown + (k === i ? ':' : '-') + (k + 1) + (k === i ? ':' : '-') + text[k].slice(0, 400)); lines++; }
      if (ctx) out.push('--');
      if (hits >= 100 || lines >= 400) break;
    }
    if (lines >= 400) return false;
  };
  if (fs.existsSync(root) && fs.statSync(root).isFile()) visit(root, path.basename(root), path.basename(root));
  else walkFiles(root, {}, visit);
  return { code: out.length ? 0 : 1, stdout: out.join('\n') + (out.length ? '\n' : ''), stderr: '' };
}

async function mkdir(p) {
  if (!p.path) throw new BridgeError('path wajib diisi');
  const f = expand(p.path);
  guardWritable(f);
  await fsp.mkdir(f, { recursive: true });
  return { path: f };
}

async function trash(p) {
  if (!p.path) throw new BridgeError('path wajib diisi');
  const f = expand(p.path);
  const root = toPosix(path.parse(f).root);
  if (f === root || f === root.replace(/\/$/, '') || f === toPosix(os.homedir())) throw new BridgeError('Menolak memindahkan path ini ke Trash');
  guardWritable(f);
  await shell.trashItem(path.normalize(f));
  return { path: f, trashedTo: IS_WIN ? 'Recycle Bin' : 'Trash' };
}

async function move(p) {
  if (!p.from || !p.to) throw new BridgeError('from dan to wajib diisi');
  const from = expand(p.from), to = expand(p.to);
  guardWritable(from); guardWritable(to);
  if (fs.existsSync(to)) throw new BridgeError('Tujuan sudah ada: ' + to);
  await fsp.mkdir(path.dirname(to), { recursive: true });
  try { await fsp.rename(from, to); } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    await fsp.cp(from, to, { recursive: true });
    await fsp.rm(from, { recursive: true, force: true });
  }
  return { from, to };
}

// ---------------------------------------------------------------- readers
const KIND = {
  pdf: 'Dokumen PDF', docx: 'Dokumen Word', doc: 'Dokumen Word 97-2003', xlsx: 'Lembar kerja Excel', xls: 'Lembar kerja Excel 97-2003',
  pptx: 'Presentasi PowerPoint', ppt: 'Presentasi PowerPoint 97-2003', odt: 'Dokumen OpenDocument', ods: 'Lembar kerja OpenDocument',
  odp: 'Presentasi OpenDocument', rtf: 'Dokumen RTF', txt: 'Teks biasa', md: 'Markdown', csv: 'CSV', json: 'JSON', html: 'Dokumen HTML',
  png: 'Gambar PNG', jpg: 'Gambar JPEG', jpeg: 'Gambar JPEG', gif: 'Gambar GIF', webp: 'Gambar WebP', svg: 'Gambar SVG', heic: 'Gambar HEIC',
  mp3: 'Audio MP3', wav: 'Audio WAV', m4a: 'Audio AAC', mp4: 'Video MPEG-4', mov: 'Video QuickTime', webm: 'Video WebM', mkv: 'Video Matroska',
  zip: 'Arsip ZIP', '7z': 'Arsip 7-Zip', rar: 'Arsip RAR', tar: 'Arsip tar', gz: 'Arsip gzip', exe: 'Aplikasi Windows', msi: 'Paket Windows Installer',
};

function info(p) {
  const f = mustExist(p.path);
  const st = fs.statSync(f);
  const ext = path.extname(f).slice(1).toLowerCase();
  let isText = false;
  if (!st.isDirectory()) {
    const head = readHead(f, 8192);
    if (head.length >= 2 && ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff))) isText = true;
    else if (!U.isBinary(head)) {
      try { new TextDecoder('utf-8', { fatal: true }).decode(head.length === 8192 ? head.slice(0, 8188) : head); isText = true; }
      catch (e) { isText = head.length < 8192; }
    }
  }
  return { path: f, name: path.basename(f), ext, isDir: st.isDirectory(), isPackage: false, size: st.size, uti: '', kind: KIND[ext] || (ext ? 'File ' + ext.toUpperCase() : 'File'), isText };
}

function readText(p) {
  const f = mustExist(p.path);
  const max = p.maxBytes || 2000000;
  const data = readHead(f, max);
  const d = U.decodeText(data);
  return { text: d.text, truncated: data.length >= max, encoding: d.encoding };
}

function writeTemp(p) {
  if (!p.base64) throw new BridgeError('data tidak valid');
  const name = String(p.name || 'file').replace(/[\\/:*?"<>|]/g, '_');
  const dir = U.tempDir('sinai-');
  const f = path.join(dir, name);
  fs.writeFileSync(f, Buffer.from(p.base64, 'base64'));
  return { path: toPosix(f) };
}

function clipboardFiles() {
  try {
    if (IS_WIN) {
      const raw = clipboard.readBuffer('FileNameW');
      if (raw && raw.length) {
        const s = raw.toString('ucs2').replace(/\0+$/, '');
        return s ? [toPosix(s)] : [];
      }
      return [];
    }
    for (const fmt of ['text/uri-list', 'x-special/gnome-copied-files']) {
      const s = clipboard.read(fmt);
      if (s) {
        return s.split(/\r?\n/).filter((l) => l.startsWith('file://')).map((l) => {
          try { return toPosix(require('url').fileURLToPath(l.trim())); } catch (e) { return null; }
        }).filter(Boolean);
      }
    }
  } catch (e) { /* nothing */ }
  return [];
}

function decodeXmlEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10))).replace(/&amp;/g, '&');
}

function ooxmlText(xml, paraTag) {
  return decodeXmlEntities(xml
    .replace(/<w:tab\/>|<a:tab\/>|<text:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>|<a:br[^>]*\/>|<text:line-break\/>/g, '\n')
    .replace(new RegExp('</' + paraTag + '>|</text:h>', 'g'), '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/\n{3,}/g, '\n\n').trim();
}

function rtfToText(rtf) {
  let out = '', depth = 0, skip = [];
  const destinations = /^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|themedata|colorschememapping|latentstyles|datastore|generator|xmlnstbl|listtable|listoverridetable|rsidtbl)$/;
  for (let i = 0; i < rtf.length; i++) {
    const ch = rtf[i];
    if (ch === '{') { depth++; skip.push(skip.length ? skip[skip.length - 1] : false); continue; }
    if (ch === '}') { depth--; skip.pop(); continue; }
    const skipping = skip.length && skip[skip.length - 1];
    if (ch === '\\') {
      const m = /^\\([a-z]+)(-?\d+)? ?|^\\'([0-9a-f]{2})|^\\([^a-z])/i.exec(rtf.slice(i, i + 40));
      if (!m) continue;
      i += m[0].length - 1;
      if (m[1]) {
        const w = m[1];
        if (w === '*' || destinations.test(w)) { if (skip.length) skip[skip.length - 1] = true; continue; }
        if (skipping) continue;
        if (w === 'par' || w === 'line') out += '\n';
        else if (w === 'tab') out += '\t';
        else if (w === 'u' && m[2]) { let n = parseInt(m[2], 10); if (n < 0) n += 65536; out += String.fromCharCode(n); if (rtf[i + 1] === '?') i++; }
      } else if (m[3] && !skipping) out += Buffer.from([parseInt(m[3], 16)]).toString('latin1');
      else if (m[4] === '*' && skip.length) skip[skip.length - 1] = true;
      else if (m[4] && !skipping && '{}\\'.includes(m[4])) out += m[4];
      continue;
    }
    if (skipping || ch === '\r' || ch === '\n') continue;
    out += ch;
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function htmlToText(html) {
  return decodeXmlEntities(String(html)
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|tr|table|section|article|blockquote|pre)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ').replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Text runs from a legacy binary .doc/.ppt/.xls (best effort). */
function legacyBinaryText(buf) {
  const runs = [];
  const u16 = buf.toString('utf16le');
  for (const m of u16.matchAll(/[\p{L}\p{N}\p{P}\p{Zs}\r\n\t]{4,}/gu)) if (/\p{L}{2}/u.test(m[0])) runs.push(m[0]);
  if (runs.join('').length < 200) {
    const latin = buf.toString('latin1');
    for (const m of latin.matchAll(/[\x20-\x7e\xa0-\xff\r\n\t]{6,}/g)) if (/[A-Za-z]{3}/.test(m[0])) runs.push(m[0]);
  }
  return runs.join('\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function extractText(p) {
  let file = p.path ? expand(p.path) : null;
  let tmp = null;
  if (!file && p.base64) {
    tmp = U.tempDir('sinai-');
    file = path.join(tmp, 'doc.' + (p.ext || 'bin'));
    fs.writeFileSync(file, Buffer.from(p.base64, 'base64'));
  }
  if (!file) throw new BridgeError('path atau base64 wajib diisi');
  try {
    const ext = path.extname(file).slice(1).toLowerCase();
    if (ext === 'pdf') {
      const r = await require('./worker').pdfRead({ path: file, password: p.password, ocr: false });
      return { text: r.text.replace(/^--- Halaman \d+ ---\n/gm, ''), pages: r.pages };
    }
    if (ext === 'docx' || ext === 'docm' || ext === 'dotx') return { text: ooxmlText(U.zipRead(file, 'word/document.xml').toString('utf8'), 'w:p') };
    if (ext === 'odt' || ext === 'ods' || ext === 'odp') return { text: ooxmlText(U.zipRead(file, 'content.xml').toString('utf8'), 'text:p') };
    if (ext === 'pptx') {
      const names = U.zipEntries(file).map((e) => e.name).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
      return { text: names.map((n, i) => '--- Slide ' + (i + 1) + ' ---\n' + ooxmlText(U.zipRead(file, n).toString('utf8'), 'a:p')).join('\n\n') };
    }
    if (ext === 'xlsx') {
      let shared = [];
      try { shared = Array.from(U.zipRead(file, 'xl/sharedStrings.xml').toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)).map((m) => ooxmlText(m[1], 'x')); } catch (e) { /* none */ }
      const sheets = U.zipEntries(file).map((e) => e.name).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
      const parts = sheets.map((n) => {
        const xml = U.zipRead(file, n).toString('utf8');
        const rows = Array.from(xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)).map((r) => Array.from(r[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)).map((c) => {
          const v = (/<v>([\s\S]*?)<\/v>/.exec(c[2]) || [])[1];
          if (/t="s"/.test(c[1]) && v != null) return shared[parseInt(v, 10)] || '';
          const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2]);
          return t ? decodeXmlEntities(t[1]) : (v != null ? decodeXmlEntities(v) : '');
        }).join('\t'));
        return '--- ' + path.basename(n, '.xml') + ' ---\n' + rows.join('\n');
      });
      return { text: parts.join('\n\n') };
    }
    const buf = fs.readFileSync(file);
    if (p.strings) return { text: legacyBinaryText(buf) };
    if (ext === 'rtf' || buf.slice(0, 5).toString() === '{\\rtf') return { text: rtfToText(buf.toString('latin1')) };
    if (ext === 'html' || ext === 'htm' || ext === 'xhtml') return { text: htmlToText(U.decodeText(buf).text) };
    if (['doc', 'ppt', 'xls', 'wps', 'pages', 'key', 'numbers'].includes(ext)) {
      const t = legacyBinaryText(buf);
      if (t) return { text: t };
    }
    if (!U.isBinary(buf)) return { text: U.decodeText(buf).text };
    throw new BridgeError('Tidak bisa mengekstrak teks dari file .' + ext);
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- zip containers
function zipList(p) {
  const f = mustExist(p.path);
  try { return { entries: U.zipEntries(f).map((e) => e.name) }; } catch (e) { throw new BridgeError('Bukan arsip zip yang valid'); }
}

function zipRead(p) {
  const f = mustExist(p.path);
  if (!p.entry) throw new BridgeError('entry wajib diisi');
  const limit = p.maxBytes || 20000000;
  let data;
  try {
    const e = U.zipEntries(f).find((x) => x.name === p.entry);
    if (!e) return p.base64 ? { base64: '', size: 0 } : { text: '', size: 0 };
    data = U.zipReadEntry(f, e, Math.max(limit, e.usize));
  } catch (e) {
    if (e instanceof BridgeError) throw e;
    throw new BridgeError('Gagal membaca isi zip: ' + e.message);
  }
  const d = data.slice(0, limit);
  if (p.base64) return { base64: d.toString('base64'), size: data.length };
  return { text: U.decodeText(d).text, size: data.length };
}

// ---------------------------------------------------------------- prepare
function withTimeout(ms, promise) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('__timeout__'), ms))]);
}

async function prepare(p) {
  if (!p.path) throw new BridgeError('path wajib diisi');
  let f = expand(p.path);
  const out = { requested: f };
  const exists = await withTimeout(6000, fsp.access(f).then(() => true, () => false));
  if (exists === '__timeout__') throw new BridgeError('Drive tidak merespons — kemungkinan drive jaringan sedang offline atau terputus: ' + f);
  if (!exists) {
    try { const dest = await fsp.readlink(f); throw new BridgeError('Symlink rusak: ' + f + ' menunjuk ke ' + dest + ' yang tidak ada.'); }
    catch (e) { if (e instanceof BridgeError) throw e; }
    throw new BridgeError('File tidak ditemukan: ' + f);
  }
  try {
    const l = await fsp.lstat(f);
    if (l.isSymbolicLink()) {
      out.symlink = true;
      out.linkTarget = toPosix(await fsp.readlink(f));
      f = toPosix(await fsp.realpath(f));
    }
  } catch (e) { /* ignore */ }
  if (IS_WIN && /^\/\/|^\\\\/.test(p.path)) out.network = true;
  out.path = f;
  return out;
}

// ---------------------------------------------------------------- archives
function sevenZip() {
  for (const n of ['7z', '7zz', '7za']) { const e = Env.which(n); if (e) return e; }
  if (IS_WIN) {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
      const c = path.join(base, '7-Zip', '7z.exe');
      if (fs.existsSync(c)) return c;
    }
  }
  return null;
}

function archiveKind(f) {
  const n = f.toLowerCase();
  if (/\.(zip|jar|apk|epub|docx|xlsx|pptx|odt|ods|odp|cbz|whl|nupkg|vsix|xpi)$/.test(n)) return 'zip';
  if (/\.(tar|tgz|tbz2?|txz|tar\.gz|tar\.bz2|tar\.xz|tar\.zst|tzst)$/.test(n)) return 'tar';
  if (/\.(gz|bz2|xz)$/.test(n)) return 'tar';
  const head = readHead(f, 8);
  if (head[0] === 0x50 && head[1] === 0x4b) return 'zip';
  return 'other';
}

function archiveError(err) {
  const e = String(err || '').toLowerCase();
  if (/passphrase|password|encrypt|decrypt|wrong password/.test(e)) {
    return new BridgeError('ARCHIVE_PASSWORD: Arsip ini terenkripsi' + (/incorrect|wrong/.test(e) ? ' dan kata sandinya salah.' : ' — kata sandi diperlukan.'));
  }
  if (/unrecognized archive|not supported|cannot open the file as archive|unsupported/.test(e)) {
    return new BridgeError('Format arsip ini tidak didukung. Pasang 7-Zip (' + (IS_WIN ? 'https://7-zip.org' : 'p7zip / 7zip dari manajer paket') + ') lalu coba lagi.');
  }
  return new BridgeError('Gagal membaca arsip: ' + String(err || '').trim().slice(0, 300));
}

function parse7zList(out) {
  const entries = [];
  let total = 0;
  for (const block of out.split(/\r?\n\r?\n/)) {
    const m = /^Path = (.+)$/m.exec(block);
    if (!m || !/^Size = /m.test(block)) continue;
    const size = parseInt((/^Size = (\d+)/m.exec(block) || [])[1] || '0', 10);
    const dir = /^Folder = \+/m.test(block) || /^Attributes = D/m.test(block);
    entries.push({ name: m[1].replace(/\\/g, '/'), size, dir, link: false });
    total += size;
  }
  return { entries, total };
}

async function archiveList(p) {
  const f = mustExist(p.path);
  const kind = archiveKind(f);
  if (kind === 'zip') {
    let list;
    try { list = U.zipEntries(f); } catch (e) { throw archiveError(e.message); }
    const encrypted = list.some((e) => e.encrypted);
    if (!encrypted || !sevenZip()) {
      const entries = list.slice(0, 20000).map((e) => ({ name: e.name, size: e.usize, dir: e.dir, link: e.link }));
      return { entries, totalBytes: list.reduce((a, e) => a + e.usize, 0), partial: false, warning: encrypted ? 'Arsip terenkripsi' : '', encrypted };
    }
  }
  const sz = sevenZip();
  if (kind !== 'tar' && sz) {
    const r = await runSync(sz, ['l', '-slt', '-p' + (p.password || 'sinai-none'), f], { timeout: 60 });
    if (r.code !== 0 && !/Path = /.test(r.out)) throw archiveError(r.err || r.out);
    const { entries, total } = parse7zList(r.out.slice(r.out.indexOf('----------')));
    return { entries: entries.slice(0, 20000), totalBytes: total, partial: r.code !== 0, warning: r.code !== 0 ? r.err.slice(0, 300) : '' };
  }
  const tar = Env.which('bsdtar') || Env.which('tar');
  if (!tar) throw archiveError('unsupported');
  const r = await runSync(tar, ['-tvf', f], { timeout: 60 });
  if (r.code !== 0 && !r.out) throw archiveError(r.err);
  const entries = [];
  let total = 0;
  for (const line of r.out.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    let size, name;
    if (parts[1].includes('/')) { size = parseInt(parts[2], 10); name = parts.slice(5).join(' '); }       // GNU tar
    else { size = parseInt(parts[4], 10); name = parts.slice(8).join(' '); }                                // bsdtar
    if (!name) continue;
    const link = parts[0].startsWith('l');
    entries.push({ name: link ? name.split(' -> ')[0] : name, size: size || 0, dir: parts[0].startsWith('d'), link });
    total += size || 0;
    if (entries.length >= 20000) break;
  }
  return { entries, totalBytes: total, partial: r.code !== 0, warning: r.code !== 0 ? r.err.slice(0, 300) : '' };
}

function removeSymlinks(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    if (d.isSymbolicLink()) fs.rmSync(full, { force: true });
    else if (d.isDirectory()) removeSymlinks(full);
  }
}

function dirSize(dir) {
  let total = 0;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    try { total += d.isDirectory() ? dirSize(full) : fs.lstatSync(full).size; } catch (e) { /* gone */ }
  }
  return total;
}

async function archiveExtract(p) {
  const f = mustExist(p.path);
  const maxBytes = p.maxBytes || 400000000;
  const maxEntries = p.maxEntries || 8000;
  const listing = await archiveList(p);
  if (listing.entries.length > maxEntries) throw new BridgeError('Arsip berisi ' + listing.entries.length + ' item — melebihi batas aman ' + maxEntries + '.');
  if (listing.totalBytes > maxBytes) throw new BridgeError('Isi arsip terlalu besar untuk diekstrak otomatis (' + Math.round(listing.totalBytes / 1e6) + ' MB).');
  const dir = U.tempDir('sinai-arc-');
  const kind = archiveKind(f);
  let zipEnc = false;
  if (kind === 'zip') { try { zipEnc = U.zipEntries(f).some((e) => e.encrypted); } catch (e) { zipEnc = false; } }
  try {
    if (kind === 'zip' && !zipEnc) {
      for (const e of U.zipEntries(f)) {
        if (e.link) continue;
        const rel = e.name.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.' && s !== '..').join('/');
        if (!rel) continue;
        const target = path.join(dir, rel);
        if (!path.resolve(target).startsWith(path.resolve(dir))) continue;
        if (e.dir) { fs.mkdirSync(target, { recursive: true }); continue; }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, U.zipReadEntry(f, e, e.usize + 1));
      }
    } else if (zipEnc && !sevenZip()) {
      throw new BridgeError('ARCHIVE_PASSWORD: Arsip ini terenkripsi. Untuk membukanya dengan kata sandi, pasang 7-Zip lalu coba lagi.');
    } else {
      const sz = sevenZip();
      let r;
      if (kind !== 'tar' && sz) r = await runSync(sz, ['x', '-y', '-snl-', '-p' + (p.password || 'sinai-none'), '-o' + dir, f], { timeout: 300 });
      else {
        const tar = Env.which('bsdtar') || Env.which('tar');
        if (!tar) throw archiveError('unsupported');
        r = await runSync(tar, ['-xf', f, '-C', dir].concat(IS_WIN ? [] : ['--no-same-owner']), { timeout: 300 });
      }
      if (r.code !== 0) throw archiveError(r.err || r.out);
    }
    if (dirSize(dir) > maxBytes) throw new BridgeError('Ekstraksi dihentikan: ukuran hasil melebihi batas aman (kemungkinan arsip bom).');
    removeSymlinks(dir);
    return { dir: toPosix(dir), warning: '' };
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

/** Deletes a temp folder this app created (never anything else). */
function cleanTemp(p) {
  if (!p.path) return false;
  const f = toPosix(path.resolve(expand(p.path)));
  const tmp = toPosix(path.resolve(os.tmpdir()));
  if (!f.startsWith(tmp + '/') || !path.basename(f).startsWith('sinai-')) throw new BridgeError('Hanya folder sementara Sinai yang boleh dihapus');
  fs.rmSync(f, { recursive: true, force: true });
  return true;
}

// ---------------------------------------------------------------- OCR
async function ocr(p) {
  const exe = Env.which('tesseract');
  if (!exe) throw new BridgeError('OCR memerlukan Tesseract. Pasang dari ' + (IS_WIN ? 'https://github.com/UB-Mannheim/tesseract/wiki' : 'manajer paket (mis. sudo apt install tesseract-ocr tesseract-ocr-ind)') + ', lalu buka ulang Sinai.');
  let file = p.path ? expand(p.path) : null, tmp = null;
  if (!file && p.base64) { tmp = U.tempDir('sinai-'); file = path.join(tmp, 'img.png'); fs.writeFileSync(file, Buffer.from(p.base64, 'base64')); }
  if (!file) throw new BridgeError('Gambar tidak bisa dibaca');
  try {
    let r = await runSync(exe, [file, 'stdout', '-l', 'ind+eng'], { timeout: 120 });
    if (r.code !== 0) r = await runSync(exe, [file, 'stdout'], { timeout: 120 });
    if (r.code !== 0) throw new BridgeError('OCR gagal: ' + r.err.slice(0, 200));
    return { text: r.out.trim() };
  } finally { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); }
}

module.exports = {
  guardWritable, read, write, stat, list, glob, globRegex, grep, mkdir, trash, move, info, readText, writeTemp, clipboardFiles,
  extractText, htmlToText, zipList, zipRead, prepare, archiveList, archiveExtract, cleanTemp, ocr,
};
