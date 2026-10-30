#!/usr/bin/env node
/* Sinerli Apps — Copyright © 2026 Gadtan x Gallen. All rights reserved.
 *
 * Menyiapkan folder web/ setiap aplikasi:
 *   1. Dokum, Hitara, Present: port otomatis dari "SInerli web/tools/office"
 *      (SineDoc, SineEX, SineSlide) — PHP dibuang, CDN diganti pustaka lokal,
 *      tombol kembali tidak keluar ke web, skrip alat baru jalan setelah login.
 *   2. Semua aplikasi: salinan _core/ ke web/core/.
 *
 * Jalankan ulang setiap kali alat web diperbarui:  node scripts/sync-apps.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.resolve(ROOT, '..', 'SInerli web');
const TOOLS = path.join(WEB, 'tools');
const VERSION = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();

const OFFICE = {
  dokum: { tool: 'sinedoc', name: 'Sinerli Dokum', icon: '▤', color: '#4f46e5' },
  hitara: { tool: 'sineex', name: 'Sinerli Hitara', icon: '▦', color: '#0f766e' },
  present: { tool: 'sineslide', name: 'Sinerli Present', icon: '▶', color: '#be185d' }
};
const ALL = { rupa: 'sinerli rupa', dokum: 'sinerli dokum', hitara: 'sinerli hitara', present: 'sinerli present', note: 'sinerli note' };

// CDN → pustaka lokal (core/vendor). Tidak ada kode yang dimuat dari internet.
const VENDOR = [
  [/https:\/\/cdn\.jsdelivr\.net\/npm\/docx@[^'"]+/g, 'core/vendor/docx.umd.js'],
  [/https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx-js-style@[^'"]+/g, 'core/vendor/xlsx.bundle.js'],
  [/https:\/\/cdn\.jsdelivr\.net\/npm\/pptxgenjs@[^'"]+/g, 'core/vendor/pptxgen.bundle.js'],
  [/https:\/\/[^'"]*jszip[^'"]*\.js/g, 'core/vendor/jszip.min.js'],
  [/https:\/\/[^'"]*html2canvas[^'"]*\.js/g, 'core/vendor/html2canvas.min.js'],
  [/https:\/\/[^'"]*jspdf[^'"]*\.js/g, 'core/vendor/jspdf.umd.min.js'],
  [/https:\/\/[^'"]*(Chart\.js|chart\.js)[^'"]*\.js/g, 'core/vendor/chart.umd.js'],
  [/https:\/\/[^'"]*mammoth[^'"]*\.js/g, 'core/vendor/mammoth.browser.min.js'],
  [/https:\/\/[^'"]*(KaTeX|katex)[^'"]*katex\.min\.js/g, 'core/vendor/katex/katex.min.js'],
  [/https:\/\/[^'"]*(KaTeX|katex)[^'"]*katex\.min\.css/g, 'core/vendor/katex/katex.min.css'],
  [/https:\/\/[^'"]*pdf\.js[^'"]*pdf\.worker\.min\.js/g, 'core/vendor/pdfjs/pdf.worker.min.js'],
  [/https:\/\/[^'"]*pdf\.js[^'"]*pdf\.min\.js/g, 'core/vendor/pdfjs/pdf.min.js'],
  [/https:\/\/[^'"]*qrcode-generator[^'"]*\.js/g, 'core/vendor/qrcode.js'],
  [/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/[^'"]+/g, 'core/vendor/fontawesome/css/all.min.css']
];

// Penyesuaian kode alat web untuk versi aplikasi (string harus cocok persis; gagal = berhenti).
const PATCHES = {
  // Logo alat dari paket aplikasi (bukan dari server) supaya tampil saat luring.
  'office/sinedoc/sinedoc-ribbon.js': [["logo: SO.root + 'assets/img/tools/sinedoc.webp'", "logo: window.SN ? 'assets/icon.png' : SO.root + 'assets/img/tools/sinedoc.webp'"]],
  'office/sineex/sineex-ribbon.js': [["logo: SO.root + 'assets/img/tools/sineex.webp'", "logo: window.SN ? 'assets/icon.png' : SO.root + 'assets/img/tools/sineex.webp'"]],
  'office/sineslide/sineslide-ribbon.js': [["logo: SO.root + 'assets/img/tools/sineslide.webp'", "logo: window.SN ? 'assets/icon.png' : SO.root + 'assets/img/tools/sineslide.webp'"]],
  'office/shared/office-core.js': [
    // Kembali = layar Buka di aplikasi, bukan Dashboard web.
    ["var dashUrl = SO.root + 'Dashboard/';", "var dashUrl = global.SN ? 'index.html?panel=open' : SO.root + 'Dashboard/';"],
    // Bahasa aplikasi: Indonesia & English.
    ['<option value="zh">中文</option>', ''],
    // Avatar & paket diganti tombol akun Sinerli (panel akun, tema, bahasa, keluar).
    ["(SO.ctx.photo ? '<img class=\"so-avatar\" alt=\"\" src=\"' + SO.esc(SO.ctx.photo) + '\" referrerpolicy=\"no-referrer\">' : '') +", "'<span id=\"snAcctSlot\"></span>' +"]
  ]
};

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(src, dst, filter) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.DS_Store' || e.name.endsWith('.php')) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (filter && !filter(s)) continue;
    if (e.isDirectory()) copyDir(s, d, filter); else fs.copyFileSync(s, d);
  }
}
function vendorize(text) { for (const [re, to] of VENDOR) text = text.replace(re, to); return text; }

/** Nama produk di teks (bukan pengenal JS seperti global.SineDoc). */
const BRAND = { SineDoc: 'Sinerli Dokum', SineEX: 'Sinerli Hitara', SineEx: 'Sinerli Hitara', SineSlide: 'Sinerli Present' };
function rebrand(text) {
  return text.replace(/(?<![\w.$])(SineDoc|SineEX|SineEx|SineSlide)(?![\w$]|\.[A-Za-z_$]|\s*=|\()/g, (m) => BRAND[m]);
}

/** CSS alat: latar putih UI → variabel, supaya tema gelap bisa menggantinya. Kertas dokumen tetap putih. */
function themeCss(text) {
  return text.replace(/background:\s*(#fff|#ffffff|white)\b/gi, 'background: var(--so-ui-white, #fff)');
}

function portOffice(appId, cfg) {
  const out = path.join(ROOT, ALL[appId], 'web');
  rmrf(out);
  fs.mkdirSync(out, { recursive: true });
  // Kode: office/shared + office/<tool> (berkas PHP tidak ikut).
  for (const dir of ['shared', cfg.tool]) {
    copyDir(path.join(TOOLS, 'office', dir), path.join(out, 'office', dir));
  }
  for (const f of walk(path.join(out, 'office'))) {
    if (/\.(js|css)$/.test(f)) {
      let t = fs.readFileSync(f, 'utf8');
      t = vendorize(t);
      if (f.endsWith('.css')) t = themeCss(t); else t = rebrand(t);
      const rel = path.relative(out, f).split(path.sep).join('/');
      for (const [a, b] of PATCHES[rel] || []) {
        if (!t.includes(a)) throw new Error(`Patch tidak cocok di ${rel}: ${a.slice(0, 60)}… — kode web berubah, perbarui PATCHES.`);
        t = t.split(a).join(b);
      }
      fs.writeFileSync(f, t);
    }
  }
  // Ikon alat.
  // Ikon aplikasi baru (assets/icon-<app>.png), bukan ikon alat web lama.
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'assets', 'icon-' + appId + '.png'), path.join(out, 'assets', 'icon.png'));

  // index.php → index.html
  let html = fs.readFileSync(path.join(TOOLS, 'office', cfg.tool, 'index.php'), 'utf8');
  html = html.replace(/^<\?php[\s\S]*?\?>\s*/, '');
  html = html.replace(/<\?php\s+include[^?]*lite_head\.php'; \?>/, liteHead());
  html = html.replace(/\s*<!--[^>]*Tutorial[^>]*-->\s*/g, '\n');
  html = html.replace(/<\?php\s+\$tutorial[\s\S]*?\?>/g, '');
  html = html.replace(/<\?=\s*sinerli_asset\(__DIR__,\s*'([^']+)'\)\s*\?>/g, (_, rel) => {
    const abs = path.resolve(TOOLS, 'office', cfg.tool, rel);
    if (abs.startsWith(path.join(WEB, 'assets/img/tools'))) return 'assets/icon.png';
    return path.relative(TOOLS, abs).split(path.sep).join('/');
  });
  if (/<\?(php|=)/.test(html)) throw new Error('Masih ada PHP di ' + cfg.tool + '/index.php: ' + html.match(/<\?(php|=)[^\n]*/)[0]);
  html = vendorize(html);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${cfg.name}</title>`);
  html = html.replace(/(<div class="so-loading-name">)[^<]*/, `$1${cfg.name}`);
  html = html.replace(/<script>window\.SO_ROOT[^<]*<\/script>\s*/, '');
  // Skrip alat ditunda sampai sesi Sinerli sah (SO.ctx membaca kunci saat dimuat).
  html = html.replace(/<script src="([^"]+)"><\/script>/g, '<script type="text/sn-deferred" data-src="$1"></script>');
  const head = `
    <meta http-equiv="Content-Security-Policy" content="${csp()}">
    <link rel="stylesheet" href="core/sn-core.css">
    <link rel="stylesheet" href="core/sn-office.css">
    <script>window.SN_APP = ${JSON.stringify({ id: appId, name: cfg.name, icon: cfg.icon, color: cfg.color, version: VERSION })};</script>
    <script src="core/sn-core.js"></script>
    <script src="core/sn-loader.js"></script>
</head>`;
  html = html.replace(/\s*<\/head>/, head);
  fs.writeFileSync(path.join(out, 'index.html'), html);
  console.log(`✓ ${cfg.name}: port dari tools/office/${cfg.tool}`);
}

function liteHead() {
  const php = fs.readFileSync(path.join(WEB, 'shared/partials/lite_head.php'), 'utf8');
  const m = php.match(/<script>[\s\S]*?<\/script>/);
  return m ? m[0] : '';
}

/** CSP ketat: hanya kode dari paket aplikasi sendiri; jaringan hanya ke server Sinerli. */
function csp() {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    // Server lokal hanya untuk build uji (SN_DEV=1), tidak pernah di rilis.
    // ipc: = jembatan perintah Tauri (desktop & Android).
    "connect-src 'self' ipc: http://ipc.localhost https://sinerli.com https://*.sinerli.com blob: data:" + (process.env.SN_DEV ? ' http://localhost:* http://127.0.0.1:*' : ''),
    "worker-src 'self' blob:",
    "frame-src 'self' blob: https://www.youtube-nocookie.com https://www.youtube.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'"
  ].join('; ');
}

function* walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}

const only = process.argv[2];
// Di CI (tanpa folder "SInerli web") hasil port yang sudah ada di repo dipakai apa adanya.
const haveWeb = fs.existsSync(path.join(TOOLS, 'office'));
if (!haveWeb) console.log('• "SInerli web" tidak ditemukan — memakai hasil port yang sudah ada.');
for (const [id, cfg] of Object.entries(OFFICE)) if (haveWeb && (!only || only === id)) portOffice(id, cfg);
for (const [id, dir] of Object.entries(ALL)) {
  if (only && only !== id) continue;
  const web = path.join(ROOT, dir, 'web');
  if (!fs.existsSync(web)) continue;
  rmrf(path.join(web, 'core'));
  copyDir(path.join(ROOT, '_core'), path.join(web, 'core'));
  // Pustaka besar hanya untuk aplikasi yang memakainya.
  const need = id === 'note' ? ['katex', 'jszip.min.js', 'jspdf.umd.min.js', 'html2canvas.min.js']
    : id === 'rupa' ? ['jspdf.umd.min.js', 'polygon-clipping.umd.min.js']
    : null;
  if (need) for (const f of fs.readdirSync(path.join(web, 'core/vendor'))) if (!need.includes(f)) rmrf(path.join(web, 'core/vendor', f));
  console.log(`✓ ${dir}: core disalin`);
}
fs.writeFileSync(path.join(ROOT, '_core', 'csp.txt'), csp() + '\n');
