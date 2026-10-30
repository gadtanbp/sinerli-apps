#!/usr/bin/env node
// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Menerbitkan rilis Sinai ke Sinerli (AdminDashboard › Rilis Sinai) langsung dari
// folder "Download all/": membuat rilis versi VERSION, mengunggah installer semua
// platform (bertahap per potongan, SHA-256 dihitung server), lalu menerbitkannya.
// Setelah terbit, semua Sinai versi lama di macOS/Windows/Linux/Android/iOS
// otomatis menawarkan (atau mewajibkan) pembaruan.
//
//   SINERLI_TOKEN=<token> node scripts/publish-sinerli.mjs [--optional] [--draft] [--notes "…"] [--server https://sinerli.com]
//
// Token: Sinai › Pengaturan › Akun Sinerli › "Salin token rilis" (akun admin, berlaku ±1 jam).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const server = String(opt('--server', process.env.SINERLI_SERVER || 'https://sinerli.com')).replace(/\/+$/, '');
const token = process.env.SINERLI_TOKEN || opt('--token', '');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const notesFile = path.join(root, 'RELEASE-NOTES.md');
const notes = opt('--notes', fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8').trim() : 'Sinai ' + version);
const mandatory = !flag('--optional');
const publish = !flag('--draft');
const dir = path.join(root, 'Download all');

if (!token) { console.error('✗ SINERLI_TOKEN kosong. Ambil di Sinai › Pengaturan › Akun Sinerli › Salin token rilis.'); process.exit(1); }
if (!fs.existsSync(dir)) { console.error('✗ Folder "Download all/" belum ada. Jalankan ./build-all.sh dulu.'); process.exit(1); }

// Berkas → platform/jenis (mengikuti SINAI_PLATFORMS di Sinerli).
const MAP = [
  [/^macOS\/.*\.dmg$/i, 'macos', 'dmg'],
  [/^Windows\/Sinai-Setup-.*\.exe$/i, 'windows', 'setup'],
  [/^Windows\/.*Portable.*\.exe$/i, 'windows', 'portable'],
  [/^Linux\/.*\.AppImage$/i, 'linux', 'appimage'],
  [/^Linux\/.*\.deb$/i, 'linux', 'deb'],
  [/^Linux\/.*\.tar\.gz$/i, 'linux', 'tar'],
  [/^Android\/.*\.apk$/i, 'android', 'apk'],
  [/^iOS\/.*\.ipa$/i, 'ios', 'ipa'],
];
const files = [];
for (const d of fs.readdirSync(dir)) {
  const sub = path.join(dir, d);
  if (!fs.statSync(sub).isDirectory()) continue;
  for (const f of fs.readdirSync(sub)) {
    const rel = d + '/' + f;
    if (!rel.includes(version)) continue;
    const m = MAP.find(([re]) => re.test(rel));
    if (m) files.push({ rel, abs: path.join(sub, f), platform: m[1], kind: m[2], size: fs.statSync(path.join(sub, f)).size });
  }
}
if (!files.length) { console.error('✗ Tidak ada installer versi ' + version + ' di "Download all/".'); process.exit(1); }

const api = server + '/api/sinai_release.php';
async function call(action, body, query = '') {
  const res = await fetch(api + '?action=' + action + query, {
    method: body === undefined ? 'GET' : 'POST',
    headers: Object.assign({ Authorization: 'Bearer ' + token, 'X-Sinerli-Admin': '1' }, body instanceof Uint8Array ? { 'Content-Type': 'application/octet-stream' } : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
  });
  let j; try { j = await res.json(); } catch (e) { throw new Error(action + ': HTTP ' + res.status + ' (bukan JSON — apakah berkas Sinerli terbaru sudah di-deploy?)'); }
  if (!res.ok || j.success === false) throw new Error(action + ': ' + (j.message || j.error || 'HTTP ' + res.status));
  return j;
}

console.log(`━━ Rilis Sinai ${version} → ${server} (${mandatory ? 'wajib' : 'opsional'}${publish ? '' : ', draf'})`);
const list = await call('list');
let rel = (list.releases || []).find((r) => r.version === version);
const saved = await call('release_save', { id: rel ? +rel.id : 0, version, notes, mandatory });
const releaseId = saved.id;
console.log(`  rilis #${releaseId}`);

for (const f of files) {
  const init = await call('upload_init', { release_id: releaseId, platform: f.platform, kind: f.kind, file_name: path.basename(f.abs), size: f.size });
  const chunk = init.chunk_size || 8 * 1024 * 1024;
  const fd = fs.openSync(f.abs, 'r');
  try {
    for (let i = 0, off = 0; off < f.size; i++, off += chunk) {
      const buf = Buffer.alloc(Math.min(chunk, f.size - off));
      fs.readSync(fd, buf, 0, buf.length, off);
      for (let attempt = 1; ; attempt++) {
        try { await call('upload_chunk', new Uint8Array(buf), '&upload_id=' + init.upload_id + '&index=' + i); break; }
        catch (e) { if (attempt >= 4) throw e; await new Promise((r) => setTimeout(r, 1500 * attempt)); }
      }
      process.stdout.write(`\r  ↑ ${f.rel}  ${Math.min(100, Math.round(((off + buf.length) / f.size) * 100))}%   `);
    }
  } finally { fs.closeSync(fd); }
  const fin = await call('upload_finish', { upload_id: init.upload_id });
  process.stdout.write(`\r  ✓ ${f.rel}  sha256 ${String(fin.file && fin.file.sha256 || '').slice(0, 12)}…\n`);
}

if (publish) {
  await call('release_status', { id: releaseId, status: 'published' });
  console.log(`✓ Terbit. Semua Sinai lama akan ${mandatory ? 'wajib diperbarui' : 'mendapat pemberitahuan pembaruan'} ke ${version}.`);
} else console.log('✓ Draf tersimpan. Terbitkan dari AdminDashboard › Rilis Sinai.');
