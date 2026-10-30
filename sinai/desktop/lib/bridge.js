// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Receives {id, method, params} from the page and answers through
// window.__gx.resolve/reject. Events are batched into window.__gx.events.
'use strict';
const { app, ipcMain, shell, clipboard, dialog, nativeTheme, BrowserWindow } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { IS_WIN, IS_MAC, BridgeError, toPosix, expand, support, inSupport, Env, runSync } = require('./util');
const Brand = require('./brand');

let win = null;
let ctx = {};
let pending = [];
let flushTimer = null;

function wrap(v) {
  let s;
  try { s = JSON.stringify({ v: v === undefined ? null : v }); } catch (e) { s = '{"v":null}'; }
  return s.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function evalJS(js) {
  if (!win || win.isDestroyed()) return;
  win.webContents.executeJavaScript(js, false).catch(() => {});
}

function resolve(id, v) { evalJS('window.__gx&&window.__gx.resolve(' + JSON.stringify(id) + ',' + wrap(v) + ')'); }
function reject(id, e) {
  const msg = (e && e.message) || String(e || 'Kesalahan');
  evalJS('window.__gx&&window.__gx.reject(' + JSON.stringify(id) + ',' + JSON.stringify(msg) + ')');
}

function emit(name, payload) {
  pending.push('[' + JSON.stringify(name) + ',' + wrap(payload) + ']');
  if (!flushTimer) flushTimer = setTimeout(flush, 16);
}
function flush() {
  flushTimer = null;
  if (!pending.length) return;
  const items = pending; pending = [];
  evalJS('window.__gx&&window.__gx.events([' + items.join(',') + '])');
}

// Modules are loaded lazily so start-up stays fast.
const M = {
  get files() { return require('./files'); },
  get http() { return require('./http'); },
  get shellr() { return require('./shell'); },
  get exportsx() { return require('./exports'); },
  get render() { return require('./render'); },
  get media() { return require('./media'); },
  get net() { return require('./net'); },
  get secrets() { return require('./secrets'); },
  get worker() { return require('./worker'); },
  get update() { return require('./update'); },
};

function osName() {
  if (IS_WIN) {
    const rel = os.release().split('.');
    const build = parseInt(rel[2] || '0', 10);
    return (build >= 22000 ? 'Windows 11' : 'Windows 10') + ' (build ' + (rel[2] || '?') + ')';
  }
  if (IS_MAC) return 'macOS ' + (process.getSystemVersion ? process.getSystemVersion() : os.release());
  let distro = 'Linux';
  try {
    const t = fs.readFileSync('/etc/os-release', 'utf8');
    const m = t.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
    if (m) distro = m[1];
  } catch (e) { /* unknown */ }
  return distro + ' (kernel ' + os.release() + ')';
}

function features() {
  return {
    dictation: false,          // live speech-to-text needs the macOS Speech framework
    transcribe: false,
    recordAudio: true,
    recordScreen: true,
    recordSystemAudio: IS_WIN, // loopback capture is only offered by Windows
    camera: true,
    screenshotArea: false,
    quicklook: false,
    integrations: false,       // Contacts/Calendar/Mail/Messages/Notes/Shortcuts are Apple-only
    share: false,
    ocr: !!(Env.which('tesseract')),
    glass: false,
    adminCommands: process.platform === 'linux' && !!Env.which('pkexec'),
  };
}

function appInfo() {
  const sh = Env.getShell();
  const ui = os.userInfo();
  // Development only: preview the Windows/Linux UI on another OS.
  const fake = !app.isPackaged && ['windows', 'linux'].includes(process.env.SINAI_FAKE_OS) ? process.env.SINAI_FAKE_OS : null;
  const info = {
    version: app.getVersion(),
    build: process.env.SINAI_BUILD || app.getVersion(),
    macos: osName(),            // kept for older callers; holds the OS description
    os: osName(),
    platform: process.platform,
    osFamily: IS_WIN ? 'windows' : IS_MAC ? 'macos' : 'linux',
    arch: process.arch === 'x64' ? 'x86_64' : process.arch,
    home: toPosix(os.homedir()),
    user: ui.username,
    fullName: ui.username,
    host: os.hostname(),
    shell: sh.name === 'PowerShell' ? 'PowerShell' : toPosix(sh.exe),
    shellName: sh.name,
    posixShell: sh.posix,
    path: Env.path,
    supportDir: support(),
    appData: toPosix(app.getPath('appData')),
    reduceTransparency: true,
    locale: app.getLocale() || 'id-ID',
    copyright: Brand.label,
    owner: Brand.owner,
    legal: Brand.legal,
    updateKind: M.update.kind(),
    features: features(),
  };
  if (fake) { info.osFamily = fake; info.platform = fake === 'windows' ? 'win32' : 'linux'; }
  return info;
}

const notOnThisOS = (what) => { throw new BridgeError((what || 'Fitur ini') + ' hanya tersedia di Sinai untuk macOS.'); };

/** Handlers return a value or a promise. */
const H = {
  // App & window
  'app.info': () => appInfo(),
  'app.setDragRegions': () => true,
  'app.setGlass': () => true,
  'app.setAppearance': (p) => { nativeTheme.themeSource = ['light', 'dark'].includes(p.mode) ? p.mode : 'system'; return true; },
  'app.attention': () => { if (win && !win.isFocused()) win.flashFrame(true); return true; },
  'app.openURL': (p) => {
    let u; try { u = new URL(String(p.url || '')); } catch (e) { throw new BridgeError('URL tidak diizinkan'); }
    if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) throw new BridgeError('URL tidak diizinkan');
    shell.openExternal(u.toString());
    return true;
  },
  'app.reveal': (p) => { if (!p.path) throw new BridgeError('path wajib'); const t = expand(p.path); if (fs.existsSync(t) && fs.statSync(t).isDirectory()) shell.openPath(t); else shell.showItemInFolder(path.normalize(t)); return true; },
  'app.openPath': async (p) => { if (!p.path) throw new BridgeError('path wajib'); const err = await shell.openPath(path.normalize(expand(p.path))); return !err; },
  'app.openTerminal': (p) => M.shellr.openTerminal(p.path ? expand(p.path) : os.homedir()),
  'app.preview': (p) => { const key = p.key || require('./util').uuid(); if (p.html != null) M.render.Store.put(key, p.html); M.render.showPreviewWindow(key, p.title || 'Pratinjau', ctx.icon); return true; },
  'preview.put': (p) => { const key = p.key || require('./util').uuid(); M.render.Store.put(key, p.html || ''); return 'sinai-preview://p/' + key; },
  'preview.export': (p) => M.render.exportPreview(p, win),
  'preview.file': (p) => {
    if (!p.path) throw new BridgeError('path wajib');
    const f = expand(p.path);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) throw new BridgeError('File tidak ditemukan');
    const key = M.render.Store.putFile(f);
    return 'sinai-preview://file/' + key + '/' + encodeURIComponent(path.basename(f));
  },
  'preview.site': (p) => {
    if (!p.root) throw new BridgeError('root wajib');
    const root = expand(p.root);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new BridgeError('Folder tidak ditemukan');
    return 'sinai-preview://site/' + M.render.Store.putSite(root) + '/';
  },
  'app.copy': (p) => { clipboard.writeText(String(p.text || '')); return true; },
  'app.quit': () => { setTimeout(() => app.quit(), 10); return true; },
  'app.quicklook': async (p) => { const list = p.paths || [p.path]; for (const x of list.filter(Boolean)) await shell.openPath(path.normalize(expand(x))); return true; },
  'app.pendingOpens': () => { const list = ctx.pendingOpens.splice(0); return list; },

  // Files of any type
  'file.info': (p) => M.files.info(p),
  'file.text': (p) => M.files.readText(p),
  'image.prepare': (p) => M.worker.imagePrepare(p),
  'image.ocr': (p) => M.files.ocr(p),
  'pdf.read': (p) => M.worker.pdfRead(p),
  'zip.list': (p) => M.files.zipList(p),
  'zip.read': (p) => M.files.zipRead(p),
  'media.info': (p) => M.worker.mediaInfo(p),
  'media.transcribe': () => { throw new BridgeError('Transkripsi suara belum tersedia di Sinai untuk ' + (IS_WIN ? 'Windows' : 'Linux') + '. Gunakan model AI yang mendukung audio, atau transkrip di aplikasi lain lalu lampirkan teksnya.'); },
  'media.transcribeLong': () => H['media.transcribe'](),
  'fs.writeTemp': (p) => M.files.writeTemp(p),
  'clipboard.files': () => M.files.clipboardFiles(),
  'file.saveAs': async (p) => {
    const src = p.path ? expand(p.path) : '';
    if (!src || !fs.existsSync(src)) throw new BridgeError('File tidak ditemukan');
    return M.exportsx.deliver(fs.readFileSync(src), p.name || path.basename(src), null, win);
  },
  'pdf.fromHTML': (p) => M.render.htmlToPDF(p),
  'video.make': (p) => { const job = p.job || 'video'; return M.worker.videoMake(p, (f) => emit('video.progress', { job, progress: f })); },

  // MCP servers (stdio)
  'mcp.start': (p) => { M.shellr.Mcp.start(p.id || '', p.command || '', p.args || [], p.env || {}, p.cwd); return true; },
  'mcp.send': (p) => { M.shellr.Mcp.send(p.id || '', p.line || ''); return true; },
  'mcp.stop': (p) => { M.shellr.Mcp.stop(p.id || ''); return true; },

  // Dialogs
  'dialog.openFolder': async (p) => {
    const r = await dialog.showOpenDialog(win, { title: p.message || 'Pilih folder proyek', buttonLabel: 'Pilih', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled || !r.filePaths.length ? null : toPosix(r.filePaths[0]);
  },
  'dialog.openFiles': async (p) => {
    const props = ['openFile']; if (p.multiple !== false) props.push('multiSelections');
    const r = await dialog.showOpenDialog(win, { buttonLabel: 'Lampirkan', properties: props });
    return r.canceled ? [] : r.filePaths.map(toPosix);
  },
  'dialog.save': async (p) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), p.name || 'export.md') });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, String(p.content || ''), 'utf8');
    return toPosix(r.filePath);
  },

  // App data store
  'store.read': async (p) => {
    const f = inSupport(p.name); if (!f) throw new BridgeError('Nama tidak valid');
    try { return await fs.promises.readFile(f, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  },
  'store.write': async (p) => {
    const f = inSupport(p.name); if (!f) throw new BridgeError('Nama tidak valid');
    await fs.promises.mkdir(path.dirname(f), { recursive: true });
    const tmp = f + '.tmp-' + process.pid + '-' + Date.now();
    await fs.promises.writeFile(tmp, String(p.content == null ? '' : p.content), 'utf8');
    await fs.promises.rename(tmp, f).catch(async () => { await fs.promises.writeFile(f, String(p.content == null ? '' : p.content), 'utf8'); await fs.promises.rm(tmp, { force: true }); });
    return true;
  },
  'store.delete': async (p) => {
    const f = inSupport(p.name); if (!f || f === support()) throw new BridgeError('Nama tidak valid');
    await fs.promises.rm(f, { recursive: true, force: true });
    return true;
  },
  'store.list': async (p) => {
    const f = inSupport(p.dir || ''); if (!f) throw new BridgeError('Nama tidak valid');
    try { return (await fs.promises.readdir(f)).filter((n) => n !== '.runtime'); } catch (e) { return []; }
  },

  // Secrets
  'secret.get': (p) => M.secrets.get(p.key || ''),
  'secret.set': (p) => { M.secrets.set(p.key || '', p.value); return true; },
  'secret.keys': () => M.secrets.keys(),

  // File system (agent tools)
  'fs.read': (p) => M.files.read(p),
  'fs.write': (p) => M.files.write(p),
  'fs.stat': (p) => M.files.stat(p),
  'fs.list': (p) => M.files.list(p),
  'fs.glob': (p) => M.files.glob(p),
  'fs.grep': (p) => M.files.grep(p),
  'fs.mkdir': (p) => M.files.mkdir(p),
  'fs.trash': (p) => M.files.trash(p),
  'fs.move': (p) => M.files.move(p),
  'doc.extractText': (p) => M.files.extractText(p),

  // Shell
  'exec.start': (p) => {
    const jobId = p.id || 'x' + Date.now();
    const pid = M.shellr.Shell.start({
      id: jobId, command: p.command || '', cwd: p.cwd, timeout: p.timeout != null ? p.timeout : 120, admin: !!p.admin,
      interactive: !!p.interactive, pty: !!p.pty, cols: p.cols || 120, rows: p.rows || 32,
      output: (stream, data) => emit('exec.out', { id: jobId, stream, data }),
      exit: (info) => emit('exec.exit', info),
    });
    return { pid };
  },
  'exec.kill': (p) => { M.shellr.Shell.kill(p.id || ''); return true; },
  'exec.write': (p) => M.shellr.Shell.write(p.id || '', p.data || ''),
  'exec.closeInput': (p) => { M.shellr.Shell.closeInput(p.id || ''); return true; },
  'exec.resize': () => true,
  'exec.interrupt': (p) => { M.shellr.Shell.interrupt(p.id || ''); return true; },
  'exec.sync': async (p) => {
    const sh = Env.getShell();
    const cwd = p.cwd ? expand(p.cwd) : os.homedir();
    const r = await runSync(sh.exe, sh.args(String(p.command || '')), { cwd: fs.existsSync(cwd) ? cwd : os.homedir(), timeout: p.timeout || 15 });
    return { code: r.code, stdout: r.out, stderr: r.err };
  },

  // Dictation (macOS only)
  'dictation.start': () => notOnThisOS('Dikte suara'),
  'dictation.stop': () => ({ text: '' }),

  // Recording & screenshots
  'record.start': (p) => M.media.recordStart(p, emit),
  'record.stop': (p) => M.media.recordStop(p),
  'screen.shot': (p) => M.media.screenshot(p, win),
  'window.snapshot': () => M.media.windowSnapshot(win),
  'camera.open': () => M.media.openCamera(win, ctx.icon),

  // Richer file readers
  'file.prepare': (p) => M.files.prepare(p),
  'file.thumbnail': (p) => M.worker.thumbnail(p),
  'image.meta': (p) => M.worker.imageMeta(p),
  'archive.list': (p) => M.files.archiveList(p),
  'archive.extract': (p) => M.files.archiveExtract(p),
  'archive.clean': (p) => M.files.cleanTemp(p),
  'audio.stats': (p) => M.worker.audioStats(p),

  // Exports
  'export.document': (p) => M.exportsx.document(p, win),
  'export.spreadsheet': (p) => M.exportsx.spreadsheet(p, win),
  'export.slides': (p) => M.exportsx.slides(p, win),
  'export.image': (p) => M.exportsx.convertImage(p, win),
  'export.zip': (p) => M.exportsx.zipExport(p, win),
  'pdf.edit': (p) => M.exportsx.pdfEdit(p, win),
  'export.share': (p) => M.exportsx.share(p),
  'export.print': (p) => M.render.printHTML(p, win),
  'backup.create': (p) => M.exportsx.backup(p, win),

  // Apple-only integrations
  'pim.status': () => 'unavailable',
  'pim.request': () => false,
  'contacts.search': () => notOnThisOS('Akses Kontak'),
  'contacts.create': () => notOnThisOS('Akses Kontak'),
  'calendar.list': () => notOnThisOS('Akses Kalender'),
  'calendar.create': () => notOnThisOS('Akses Kalender'),
  'reminders.list': () => notOnThisOS('Akses Pengingat'),
  'reminders.create': () => notOnThisOS('Akses Pengingat'),
  'photos.recent': () => notOnThisOS('Akses Foto'),
  'photos.export': () => notOnThisOS('Akses Foto'),
  'photos.save': () => notOnThisOS('Akses Foto'),
  'apple.script': () => notOnThisOS('Integrasi Mail/Messages/Notes/Music'),
  'shortcuts.list': () => [],
  'shortcuts.run': () => notOnThisOS('Shortcuts'),

  // Networking
  'net.upload': (p) => M.net.upload(p, p.id || 'u' + Date.now(), emit),
  'net.cookies': (p) => M.net.cookies(p),
  'net.clearCookies': () => M.net.clearCookies(),
  'net.scanDev': (p) => M.net.scanDevServers(p),
  'ws.connect': (p) => { M.net.wsConnect(p, p.id || '', emit); return true; },
  'ws.send': (p) => M.net.wsSend(p.id || '', p.text, p.base64),
  'ws.close': (p) => { M.net.wsClose(p.id || '', emit); return true; },

  // Automation
  'notify.show': (p) => M.net.notify(p, win),
  'watch.start': (p) => { M.net.watchStart(p.id || '', p.path || '', emit); return true; },
  'watch.stop': (p) => { M.net.watchStop(p.id || ''); return true; },
  'webhook.start': (p) => M.net.webhookStart(p.port || 8765, p.secret || '', emit),
  'webhook.stop': () => { M.net.webhookStop(); return true; },
  'oauth.listen': (p) => M.net.oauthListen(p.port || 0, emit),
  // On-device perception is macOS-only (Apple Vision / SoundAnalysis); the page falls back to a vision model.
  'image.analyze': () => ({ unsupported: true }),
  'audio.classify': () => ({ unsupported: true }),

  // Pembaruan dari Sinerli
  'update.download': (p) => M.update.download(p, emit),
  'update.install': (p) => M.update.install(p),

  // HTTP
  'http.stream': (p) => { M.http.stream(p.id, p, emit); return true; },
  'http.abort': (p) => { M.http.abort(p.id || ''); return true; },
  'http.request': (p) => M.http.request(p),
};

function attach(w, c) {
  win = w;
  ctx = c;
  ipcMain.removeAllListeners('gx');
  ipcMain.removeAllListeners('gx-drop');
  ipcMain.on('gx', (e, msg) => {
    // Only the app's own top-level page may use the bridge.
    if (!win || e.sender !== win.webContents || !e.senderFrame || e.senderFrame !== win.webContents.mainFrame) return;
    if (!String(e.senderFrame.url || '').startsWith('sinai://app/')) return;
    if (!msg || typeof msg.id !== 'string' || typeof msg.method !== 'string') return;
    const fn = H[msg.method];
    if (!fn) { reject(msg.id, new BridgeError('Metode tidak dikenal: ' + msg.method)); return; }
    let r;
    try { r = fn(msg.params || {}); } catch (err) { reject(msg.id, err); return; }
    Promise.resolve(r).then((v) => resolve(msg.id, v), (err) => reject(msg.id, err));
  });
  ipcMain.on('gx-drop', (e, paths) => {
    if (!win || e.sender !== win.webContents) return;
    emit('files.dropped', { paths: (paths || []).map(toPosix) });
  });
}

function shutdown() {
  try { require('./shell').Shell.killAll(); } catch (e) { /* ignore */ }
  try { require('./shell').Mcp.stopAll(); } catch (e) { /* ignore */ }
  try { require('./net').closeAll(); } catch (e) { /* ignore */ }
}

module.exports = { attach, emit, shutdown, appInfo };
