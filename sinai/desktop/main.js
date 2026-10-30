// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Windows / Linux host for the Sinai web UI (the macOS build uses the native
// Swift host in ../Sources). The page talks to this process through the same
// bridge contract: window.webkit.messageHandlers.sinai.postMessage({id, method,
// params}) in, window.__gx.resolve/reject/events out.
'use strict';
const { app, BrowserWindow, Menu, protocol, session, shell, ipcMain, nativeTheme, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { IS_WIN, IS_MAC, Env, toPosix, support } = require('./lib/util');
const Brand = require('./lib/brand');

// Chromium keeps its own caches in userData; keep them out of the Sinai data folder.
app.setPath('userData', path.join(support(), '.runtime'));
if (IS_WIN) app.setAppUserModelId('app.sinai.desktop');

protocol.registerSchemesAsPrivileged([
  { scheme: 'sinai', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'sinai-preview', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'sinai-worker', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const WEB_ROOT = process.env.SINAI_WEB_ROOT && !app.isPackaged
  ? path.resolve(process.env.SINAI_WEB_ROOT)
  : app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'Resources', 'web');
const ICON = app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, 'build', 'icon.png');

let mainWindow = null;
const pendingOpens = [];

// One running instance; files opened later ("Open with Sinai") go to it.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const files = filesFromArgv(argv.slice(1));
    if (files.length) deliverOpenFiles(files);
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
  });
}

function filesFromArgv(argv) {
  return argv.filter((a) => a && !a.startsWith('-') && a !== '.' && !/electron(\.exe)?$/i.test(a) && !a.endsWith('main.js'))
    .map((a) => { try { return fs.existsSync(a) && fs.statSync(a).isFile() ? toPosix(path.resolve(a)) : null; } catch (e) { return null; } })
    .filter(Boolean);
}

function deliverOpenFiles(paths) {
  pendingOpens.push(...paths);
  Bridge.emit('files.opened', { paths });
}

const Bridge = require('./lib/bridge');
const Render = require('./lib/render');

function webFile(urlPath) {
  let p = decodeURIComponent(urlPath || '/');
  if (p === '' || p === '/') p = '/index.html';
  const parts = p.split('/').filter(Boolean);
  if (parts.includes('..') || parts.includes('.')) return null;
  return path.join(WEB_ROOT, ...parts);
}

function registerAppScheme(ses) {
  ses.protocol.handle('sinai', async (req) => {
    const url = new URL(req.url);
    const file = webFile(url.pathname);
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'Content-Type': require('./lib/util').mimeOf(file), 'Cache-Control': 'no-store' } });
    } catch (e) {
      return new Response('Not found', { status: 404 });
    }
  });
}

function buildMenu() {
  const send = (action) => () => Bridge.emit('menu', { action });
  const mod = 'CmdOrCtrl';
  const template = [];
  if (IS_MAC) template.push({ label: 'Sinai', submenu: [{ label: 'Tentang Sinai', click: send('about') }, { type: 'separator' }, { label: 'Pengaturan…', accelerator: mod + '+,', click: send('settings') }, { type: 'separator' }, { role: 'hide', label: 'Sembunyikan Sinai' }, { role: 'hideOthers', label: 'Sembunyikan Lainnya' }, { type: 'separator' }, { role: 'quit', label: 'Keluar dari Sinai' }] });
  template.push({
    label: 'File', submenu: [
      { label: 'Chat Baru', accelerator: mod + '+N', click: send('newChat') },
      { label: 'Sesi Coding Baru', accelerator: mod + '+Shift+N', click: send('newCode') },
      { label: 'Desain Baru', accelerator: mod + '+Alt+N', click: send('newDesign') },
      { label: 'Buka Folder Proyek…', accelerator: mod + '+O', click: send('openFolder') },
      { type: 'separator' },
      { label: 'Ekspor Percakapan…', accelerator: mod + '+Shift+E', click: send('export') },
      { type: 'separator' },
      ...(IS_MAC ? [] : [{ label: 'Pengaturan…', accelerator: mod + '+,', click: send('settings') }, { type: 'separator' }]),
      IS_MAC ? { role: 'close', label: 'Tutup Jendela' } : { role: 'quit', label: 'Keluar', accelerator: 'Ctrl+Q' },
    ],
  });
  template.push({
    label: 'Edit', submenu: [
      { role: 'undo', label: 'Urungkan' }, { role: 'redo', label: 'Ulangi' }, { type: 'separator' },
      { role: 'cut', label: 'Potong' }, { role: 'copy', label: 'Salin' }, { role: 'paste', label: 'Tempel' }, { role: 'selectAll', label: 'Pilih Semua' },
      { type: 'separator' },
      { label: 'Cari Percakapan', accelerator: mod + '+K', click: send('search') },
    ],
  });
  template.push({
    label: 'Tampilan', submenu: [
      { label: 'Tampilkan/Sembunyikan Sidebar', accelerator: mod + '+\\', click: send('toggleSidebar') },
      { label: 'Tampilkan/Sembunyikan Panel', accelerator: mod + '+Alt+B', click: send('togglePanel') },
      { label: 'Pilih Model…', accelerator: mod + '+Shift+M', click: send('modelPicker') },
      { type: 'separator' },
      { label: 'Perbesar Teks', accelerator: mod + '+=', click: send('zoomIn') },
      { label: 'Perkecil Teks', accelerator: mod + '+-', click: send('zoomOut') },
      { label: 'Ukuran Teks Normal', accelerator: mod + '+0', click: send('zoomReset') },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Layar Penuh' },
      ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
    ],
  });
  template.push({ label: 'Jendela', submenu: [{ role: 'minimize', label: 'Minimalkan' }, { role: 'zoom', label: 'Perbesar' }] });
  template.push({
    label: 'Bantuan', submenu: [
      { label: 'Pintasan Keyboard', accelerator: mod + '+/', click: send('shortcuts') },
      { label: 'Tentang Sinai', click: send('about') },
    ],
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    width: state.width || 1260, height: state.height || 820, x: state.x, y: state.y,
    minWidth: 760, minHeight: 500,
    title: 'Sinai',
    icon: ICON,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16171f' : '#f3f4f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webviewTag: false,
      devTools: !app.isPackaged || !!process.env.SINAI_DEVTOOLS,
    },
  });
  if (state.maximized) mainWindow.maximize();
  Bridge.attach(mainWindow, { pendingOpens, webRoot: WEB_ROOT, icon: ICON });

  const wc = mainWindow.webContents;
  // Never let anything but the bundled UI load in this window.
  wc.on('will-navigate', (e, url) => {
    if (!url.startsWith('sinai://')) {
      e.preventDefault();
      if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    }
  });
  wc.on('will-frame-navigate', (e) => {
    if (e.isMainFrame) return;
    const url = e.url;
    if (/^(sinai|file):/i.test(url)) { e.preventDefault(); return; }
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('render-process-gone', () => { setTimeout(() => { if (mainWindow && !mainWindow.isDestroyed()) wc.reload(); }, 500); });
  wc.on('did-finish-load', () => Brand.installNotice(wc));

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', () => saveWindowState());
  mainWindow.on('closed', () => { mainWindow = null; });
  wc.loadURL('sinai://app/index.html');
}

const stateFile = () => path.join(support(), '.runtime', 'window.json');
function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (e) { return {}; }
}
function saveWindowState() {
  if (!mainWindow) return;
  try {
    const b = mainWindow.getNormalBounds();
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: mainWindow.isMaximized() }));
  } catch (e) { /* ignore */ }
}

app.whenReady().then(() => {
  if (!Brand.isIntact()) {
    dialog.showErrorBox('Sinai', 'Sinai telah dimodifikasi dan tidak dapat dijalankan.');
    app.exit(1);
    return;
  }
  Env.resolveLoginPath();
  Env.getShell();
  registerAppScheme(session.defaultSession);
  Render.registerPreviewScheme(session.defaultSession);
  // Media capture (recording, camera) is only granted to Sinai's own pages.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    const origin = (details && (details.requestingUrl || details.securityOrigin)) || '';
    if (origin.startsWith('sinai://') && ['clipboard-read', 'clipboard-sanitized-write', 'notifications', 'fullscreen'].includes(permission)) return cb(true);
    cb(false);
  });
  buildMenu();
  pendingOpens.push(...filesFromArgv(process.argv.slice(app.isPackaged ? 1 : 2)));
  createWindow();
});

app.on('activate', () => { if (!mainWindow) createWindow(); else mainWindow.show(); });
app.on('open-file', (e, p) => { e.preventDefault(); if (mainWindow) deliverOpenFiles([toPosix(p)]); else pendingOpens.push(toPosix(p)); });
app.on('window-all-closed', () => { app.quit(); });
app.on('before-quit', () => { saveWindowState(); Bridge.shutdown(); });
