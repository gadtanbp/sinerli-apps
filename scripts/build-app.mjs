#!/usr/bin/env node
/* Sinerli Apps — Copyright © 2026 Gadtan x Gallen. All rights reserved.
 *
 * Membuat proyek Tauri untuk satu aplikasi lalu (opsional) mem-build installer.
 *
 *   node scripts/build-app.mjs <app> [prepare|dev|build|android|android-apk] [-- argumen tauri]
 *   node scripts/build-app.mjs all build
 *
 *   <app>  rupa | dokum | hitara | present | note | all
 *
 * Hasil:
 *   build/<app>/src-tauri/         proyek Tauri (dibuat ulang setiap kali, jangan diedit)
 *   dist/<app>/<platform>/...      installer (.dmg/.app, .msi/.exe, .AppImage/.deb, .apk)
 *
 * Penandatanganan (agar tidak diblokir SmartScreen/Gatekeeper/Play Protect) aktif
 * otomatis bila variabel lingkungan ini diisi — lihat docs/SIGNING.md:
 *   macOS   APPLE_SIGNING_IDENTITY, APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID (notarisasi)
 *   Windows WINDOWS_CERT_THUMBPRINT (atau WINDOWS_SIGN_COMMAND untuk HSM/Azure Trusted Signing)
 *   Android ANDROID_KEYSTORE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const APPS = {
  rupa: { dir: 'sinerli rupa', name: 'Sinerli Rupa', cat: 'GraphicsAndDesign', w: 1440, h: 900, desc: 'Foto, vektor, papan alur & desain UI dalam satu kanvas.' },
  dokum: { dir: 'sinerli dokum', name: 'Sinerli Dokum', cat: 'Productivity', w: 1280, h: 860, desc: 'Pengolah dokumen Sinerli.' },
  hitara: { dir: 'sinerli hitara', name: 'Sinerli Hitara', cat: 'Productivity', w: 1366, h: 860, desc: 'Lembar kerja Sinerli.' },
  present: { dir: 'sinerli present', name: 'Sinerli Present', cat: 'Productivity', w: 1366, h: 860, desc: 'Presentasi Sinerli.' },
  note: { dir: 'sinerli note', name: 'Sinerli Note', cat: 'Productivity', w: 1280, h: 860, desc: 'Catatan, wiki & database Sinerli.' }
};

const [appArg = '', mode = 'prepare', ...rest] = process.argv.slice(2);
const extra = rest[0] === '--' ? rest.slice(1) : rest;
if (!appArg || (appArg !== 'all' && !APPS[appArg])) {
  console.error('Pakai: node scripts/build-app.mjs <rupa|dokum|hitara|present|note|all> [prepare|dev|build|android|android-apk]');
  process.exit(1);
}

function run(cmd, args, cwd, env) {
  console.log('$', cmd, args.join(' '));
  // shell hanya untuk npx di Windows (npx.cmd): node.exe sering berada di "Program Files" yang berspasi.
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: Object.assign({}, process.env, env || {}), shell: process.platform === 'win32' && cmd === 'npx' });
  if (r.status !== 0) throw new Error(cmd + ' gagal (' + r.status + ')');
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === 'target' || e.name === 'gen' || e.name === '.DS_Store') continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
function csp() { return fs.readFileSync(path.join(ROOT, '_core', 'csp.txt'), 'utf8').trim(); }

function prepare(id) {
  const a = APPS[id];
  // 1. web/ terbaru (port alat office + core)
  run(process.execPath, [path.join(ROOT, 'scripts', 'sync-apps.mjs'), id], ROOT);
  const web = path.join(ROOT, a.dir, 'web');
  if (!fs.existsSync(path.join(web, 'index.html'))) throw new Error('web/index.html tidak ada untuk ' + id);
  // 2. src-tauri dari _shell/tauri
  const proj = path.join(ROOT, 'build', id);
  const src = path.join(proj, 'src-tauri');
  const keepTarget = path.join(src, 'target');
  fs.mkdirSync(src, { recursive: true });
  for (const f of fs.readdirSync(src)) if (f !== 'target' && f !== 'gen') fs.rmSync(path.join(src, f), { recursive: true, force: true });
  copyDir(path.join(ROOT, '_shell', 'tauri'), src);
  let cargo = fs.readFileSync(path.join(src, 'Cargo.toml'), 'utf8');
  cargo = cargo.replace('name = "sinerli-app"', `name = "sinerli-${id}"`).replace('version = "1.0.0"', `version = "${VERSION}"`).replace('description = "Sinerli Apps"', `description = "${a.name}"`);
  fs.writeFileSync(path.join(src, 'Cargo.toml'), cargo);
  // 3. ikon dari assets/logo-<app>.png
  const logo = path.join(ROOT, 'assets', `logo-${id}.png`);
  fs.mkdirSync(path.join(src, 'icons'), { recursive: true });
  if (fs.existsSync(logo)) {
    try { run('npx', ['--yes', '@tauri-apps/cli@2', 'icon', logo, '-o', path.join(src, 'icons')], proj); }
    catch (e) { console.warn('! tauri icon gagal, memakai logo apa adanya:', e.message); fs.copyFileSync(logo, path.join(src, 'icons', 'icon.png')); }
  }
  // 4. tauri.conf.json
  const conf = {
    $schema: 'https://schema.tauri.app/config/2',
    productName: a.name,
    version: VERSION,
    identifier: `com.sinerli.${id}`,
    build: { frontendDist: path.relative(src, web).split(path.sep).join('/') },
    app: {
      withGlobalTauri: true,
      windows: [{ label: 'main', title: a.name, width: a.w, height: a.h, minWidth: 360, minHeight: 520, center: true, dragDropEnabled: false, devtools: false }],
      // style-src tanpa nonce otomatis: atribut style="…" di UI tetap diizinkan ('unsafe-inline').
      security: { csp: csp(), dangerousDisableAssetCspModification: ['style-src'], freezePrototype: false }
    },
    bundle: {
      active: true,
      targets: 'all',
      publisher: 'Gadtan x Gallen',
      copyright: 'Copyright © 2026 Gadtan x Gallen. All rights reserved.',
      category: a.cat,
      shortDescription: a.desc,
      longDescription: a.desc + ' Masuk dengan akun Sinerli; progres tersinkron di semua perangkat.',
      icon: fs.existsSync(path.join(src, 'icons', '32x32.png')) ? ['icons/32x32.png', 'icons/128x128.png', 'icons/128x128@2x.png', 'icons/icon.icns', 'icons/icon.ico'] : ['icons/icon.png'],
      macOS: { minimumSystemVersion: '10.15', signingIdentity: process.env.APPLE_SIGNING_IDENTITY || null, hardenedRuntime: true },
      windows: {
        // WebView2 dipasang otomatis bila belum ada (Windows 10 lama).
        webviewInstallMode: { type: 'downloadBootstrapper', silent: true },
        certificateThumbprint: process.env.WINDOWS_CERT_THUMBPRINT || null,
        digestAlgorithm: 'sha256',
        timestampUrl: 'http://timestamp.digicert.com',
        signCommand: process.env.WINDOWS_SIGN_COMMAND || undefined,
        nsis: { installMode: 'currentUser', languages: ['English', 'Indonesian'], displayLanguageSelector: true }
      },
      linux: { deb: { depends: [] }, appimage: { bundleMediaFramework: false } },
      android: { minSdkVersion: 24 }
    },
    plugins: {
      'deep-link': {
        desktop: { schemes: [`sinerli-${id}`] },
        mobile: [{ scheme: ['com.sinerli.apps'], appLink: false }]
      }
    }
  };
  if (!conf.bundle.windows.signCommand) delete conf.bundle.windows.signCommand;
  fs.writeFileSync(path.join(src, 'tauri.conf.json'), JSON.stringify(conf, null, 2) + '\n');
  console.log(`✓ ${a.name}: proyek Tauri di build/${id}/src-tauri`);
  return { proj, src };
}

/** Tanda tangan rilis Android dari ANDROID_KEYSTORE (+ *_PASSWORD, ANDROID_KEY_ALIAS) lewat gradle yang dibuat Tauri. */
function signAndroid(proj) {
  const ks = process.env.ANDROID_KEYSTORE;
  if (!ks || !fs.existsSync(ks)) return false;
  const f = path.join(proj, 'src-tauri', 'gen', 'android', 'app', 'build.gradle.kts');
  let t = fs.readFileSync(f, 'utf8');
  if (t.includes('sinerliRelease')) return true;
  const cfg = `    signingConfigs {
        create("sinerliRelease") {
            storeFile = file(System.getenv("ANDROID_KEYSTORE"))
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {`;
  t = t.replace(/^    buildTypes \{/m, cfg);
  t = t.replace(/getByName\("release"\) \{/, 'getByName("release") {\n            signingConfig = signingConfigs.getByName("sinerliRelease")');
  fs.writeFileSync(f, t);
  return true;
}
function tauri(proj, args, env) { run('npx', ['--yes', '@tauri-apps/cli@2'].concat(args, extra), proj, env); }
function collect(id, proj) {
  const out = path.join(ROOT, 'dist', id);
  const bundles = path.join(proj, 'src-tauri', 'target');
  fs.mkdirSync(out, { recursive: true });
  const exts = /\.(dmg|msi|exe|AppImage|deb|rpm|apk|aab)$/;
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/deps|build|incremental|\.fingerprint/.test(e.name)) walk(p); }
      else if (exts.test(e.name) && /bundle|apk|outputs/.test(p)) { fs.copyFileSync(p, path.join(out, e.name)); console.log('  →', path.relative(ROOT, path.join(out, e.name))); }
    }
  })(bundles);
  (function walk(d) { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(apk|aab)$/.test(e.name)) fs.copyFileSync(p, path.join(out, e.name)); } })(path.join(proj, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs'));
}

const list = appArg === 'all' ? Object.keys(APPS) : [appArg];
for (const id of list) {
  const { proj } = prepare(id);
  if (mode === 'prepare') continue;
  if (mode === 'dev') { tauri(proj, ['dev']); continue; }
  if (mode === 'build') {
    const target = process.platform === 'darwin' ? ['--target', 'universal-apple-darwin'] : [];
    tauri(proj, ['build'].concat(process.env.SN_NO_UNIVERSAL ? [] : target));
    collect(id, proj);
  }
  if (mode === 'android' || mode === 'android-apk') {
    if (!fs.existsSync(path.join(proj, 'src-tauri', 'gen', 'android'))) tauri(proj, ['android', 'init']);
    // Tanpa keystore: APK debug (tetap bisa dipasang), karena APK rilis tak bertanda tangan ditolak Android.
    const signed = signAndroid(proj);
    if (!signed) console.warn('! ANDROID_KEYSTORE tidak ada: membuat APK debug.');
    tauri(proj, ['android', 'build'].concat(mode === 'android-apk' ? ['--apk'] : [], signed ? [] : ['--debug']));
    collect(id, proj);
  }
}
