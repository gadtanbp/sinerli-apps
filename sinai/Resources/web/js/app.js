/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Bootstrap, global shortcuts and native menu actions. */
(function () {
  'use strict';
  var h = U.h;
  var App = {};

  App.setMode = function (mode) {
    if (UI.state.mode === mode && UI.state.conv && UI.state.conv.mode === mode) return;
    UI.state.mode = mode;
    Sidebar.renderMode();
    var latest = Store.index.find(function (e) { return (e.mode || 'chat') === mode; });
    var cur = UI.state.conv;
    if (cur && cur.mode === mode) { Sidebar.render(); return; }
    // reuse an unsent draft of this mode, else open the latest, else create new
    if (latest) App.openConversation(latest.id);
    else App.newConversation(mode);
  };

  App.newConversation = function (mode, opts) {
    opts = opts || {};
    mode = mode || UI.state.mode;
    UI.state.mode = mode;
    Sidebar.renderMode();
    var ws = opts.workspace;
    if (mode === 'code' && ws === undefined) {
      var cur = UI.state.conv;
      ws = cur && cur.mode === 'code' && cur.workspace ? cur.workspace : (Store.settings.recentWorkspaces[0] || null);
    }
    var conv = Store.createConv(mode, {
      model: Engine.defaultModelRef(mode),
      workspace: mode === 'code' ? ws : null,
      level: Store.settings.intelligence[mode] || 'balanced',
      projectId: mode !== 'code' ? (opts.projectId || null) : null,
    });
    Chat.open(conv);
    return conv;
  };

  App.openConversation = async function (id) {
    var c = await Store.loadConv(id);
    if (!c) { UI.toast('Percakapan tidak ditemukan', { error: true }); return; }
    if (UI.state.mode !== c.mode) { UI.state.mode = c.mode; Sidebar.renderMode(); }
    Chat.open(c);
  };

  App.toggleSidebar = function () {
    var app = document.getElementById('app');
    app.classList.toggle('sb-collapsed');
    Store.setSetting('sidebarCollapsed', app.classList.contains('sb-collapsed'));
    setTimeout(UI.syncDrag, 320);
    setTimeout(UI.syncDrag, 60);
  };

  App.afterProviderAdded = function () {
    Sidebar.renderStatus();
    // Check right away which of the new key's models actually answer.
    Store.settings.providers.forEach(function (p) {
      var list = Health.chatModelsOf(p).filter(function (r) { return !Health.get(r.providerId, r.modelId); });
      if (list.length && list.length <= 25) Health.testMany(list);
    });
    var c = UI.state.conv;
    if (c && !c.messages.length) { c.model = Engine.defaultModelRef(c.mode); Chat.open(c); }
    else Chat.refreshComposer();
  };

  App.showShortcuts = function () {
    var m = UI.modal(h('div.modal.small',
      h('div.modal-head', h('h3', { text: 'Pintasan & perintah' }), h('button.icon-btn', { html: U.icon('x'), onclick: function () { m.close(); } })),
      h('div.modal-body', Settings.shortcutsTable())));
  };

  App.showAbout = function () { Settings.open('about'); };
  App.openProjects = function () { Settings.projects(); };
  App.openProject = function (id) { Settings.projects(id); };

  App.rewindCode = async function (conv, fromMsgId) {
    var ok = await UI.confirm({ title: 'Kembalikan semua perubahan file?', body: 'Semua file yang dibuat/diubah agen di sesi ini dipulihkan ke kondisi sebelum sesi. Percakapan tetap utuh.', ok: 'Kembalikan', danger: true });
    if (!ok) return;
    var res = await Engine.rewindCode(conv, fromMsgId);
    UI.toast(res.restored + ' file dipulihkan' + (res.problems.length ? ' — ' + res.problems.slice(0, 3).join(', ') : ''), { error: res.problems.length > 0 });
    Panel.render();
  };

  /* The notice comes from the native layer (encoded & verified in the binary). */
  App.copyright = function () { return Store.info.copyright || '© Gadtan x Gallen'; };

  function zoom(delta) {
    var a = Store.settings.appearance;
    a.fontSize = delta === 0 ? 14 : Math.max(12, Math.min(19, (a.fontSize || 14) + delta));
    Store.saveSettings();
    UI.applyAppearance();
  }

  var MENU = {
    about: App.showAbout,
    settings: function () { Settings.open(); },
    newChat: function () { App.newConversation('chat'); },
    newCode: function () { App.newConversation('code'); },
    newDesign: function () { App.newConversation('design'); },
    togglePanel: function () { Panel.toggle(); },
    openFolder: async function () {
      var p = await Native.call('dialog.openFolder', { message: 'Pilih folder proyek' });
      if (!p) return;
      Store.addRecentWorkspace(p);
      App.newConversation('code', { workspace: p });
    },
    export: function () { Chat.exportConv(); },
    search: function () { Sidebar.focusSearch(); },
    toggleSidebar: App.toggleSidebar,
    modelPicker: function () { Chat.openModelPicker(document.getElementById('btn-model')); },
    zoomIn: function () { zoom(1); },
    zoomOut: function () { zoom(-1); },
    zoomReset: function () { zoom(0); },
    shortcuts: App.showShortcuts,
  };

  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (UI.hasOverlay()) return;
        var c = UI.state.conv;
        if (c && Engine.isRunning(c.id)) { e.preventDefault(); Engine.stop(c.id); }
        return;
      }
      // Type-to-focus: printable keys go to the composer when nothing is focused.
      var t = e.target;
      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (!typing && !UI.hasOverlay() && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
        Chat.focusInput();
      }
    });
  }

  async function boot() {
    if (!Native.available) {
      document.body.innerHTML = '<div style="padding:60px;font:15px system-ui,-apple-system,sans-serif;color:#888">Halaman ini adalah UI aplikasi Sinai dan harus dibuka melalui aplikasi Sinai.</div>';
      return;
    }
    try {
      await Store.init();
      if (window.Repair) await Repair.init();
    } catch (e) {
      document.body.innerHTML = '<div style="padding:60px;font:15px -apple-system;color:#c33">Gagal memuat data: ' + U.esc(e.message) + '</div>';
      return;
    }
    if (!Store.info.owner || App.copyright().indexOf(Store.info.owner) < 0) {
      document.body.innerHTML = '<div style="padding:60px;font:15px -apple-system;color:#c33">Sinai telah dimodifikasi dan tidak dapat dijalankan.</div>';
      return;
    }
    document.documentElement.setAttribute('data-os', U.osFamily());
    if (!U.isMac()) {
      // Static labels in index.html use macOS shortcut glyphs.
      UI.$$('[title]').forEach(function (el) { el.title = U.kbd(el.title); });
      UI.$$('kbd').forEach(function (el) { el.textContent = U.kbd(el.textContent); });
    }
    UI.applyAppearance();
    U.hydrateIcons(document);
    if (Store.settings.sidebarCollapsed) document.getElementById('app').classList.add('sb-collapsed');
    Sidebar.init();
    Panel.init();
    Chat.init();
    Sidebar.renderStatus();
    Responsive.init();
    bindKeys();
    Native.on('menu', function (p) { var fn = MENU[p.action]; if (fn && !(window.Updater && Updater.locked)) fn(); });

    UI.state.mode = 'chat';
    Sidebar.renderMode();
    App.newConversation('chat');
    document.getElementById('app').classList.remove('booting');
    UI.syncDrag();
    setTimeout(UI.syncDrag, 400);
    if (window.Updater) Updater.start();
    if (window.Sync) Sync.start();
    // Sudah masuk Sinerli tapi model Sinerli belum terpasang (mis. data dipulihkan): pasang diam-diam.
    Sinerli.ensureAI().then(function (did) { if (did) App.afterProviderAdded(); }).catch(function () {});
    // Login Sinerli wajib (instal awal & setiap kali belum masuk); pembaruan wajib tetap didahulukan.
    setTimeout(function () { Settings.loginGate().then(function (shown) { if (!shown && !Store.settings.providers.length && !(window.Updater && Updater.locked)) Settings.onboarding(); }); }, 350);
    Health.on(U.throttle(function () { Sidebar.renderStatus(); Chat.refreshComposer(); }, 400));
    Health.load().then(function () { setTimeout(Health.refreshImportant, 1500); });
    setInterval(function () { if (!UI.state.conv || !Engine.isRunning(UI.state.conv.id)) Health.refreshImportant(); }, 20 * 60 * 1000);
    MCP.onChange(function () { Sidebar.renderStatus(); });
    MCP.startAll();
    if (window.Skills) Skills.load().catch(function () {});
    bindAutomationEvents();
    Automation.start();

    // Files handed to Sinai from Finder "Open with" / the Dock before boot.
    Native.call('app.pendingOpens').then(function (paths) {
      if (paths && paths.length && Chat.openIncomingFiles) Chat.openIncomingFiles(paths);
    }).catch(function () {});

    // Refresh the dynamic PATH info once the native side resolved the login shell.
    setTimeout(function () { Native.call('app.info').then(function (i) { Store.info = i; }); }, 4000);
  }

  window.__errors = [];
  window.addEventListener('error', function (e) { window.__errors.push(String(e.message) + ' @' + (e.filename || '') + ':' + e.lineno); });
  window.addEventListener('unhandledrejection', function (e) { window.__errors.push('unhandled: ' + (e.reason && e.reason.message || e.reason)); });

  // ---- automation: watch folders, webhook, finish notifications ----
  var Automation = {
    start: function () {
      (Store.settings.watchFolders || []).forEach(function (w) {
        if (w.enabled !== false && w.path) Native.call('watch.start', { id: w.id, path: w.path }).catch(function () {});
      });
      var wh = Store.settings.webhook || {};
      if (wh.enabled && wh.token) Native.call('webhook.start', { port: wh.port || 8765, secret: wh.token }).catch(function (e) { UI.toast('Webhook gagal start: ' + e.message, { error: true }); });
    },
    restartWatch: function (w) {
      Native.call('watch.stop', { id: w.id }).catch(function () {});
      if (w.enabled !== false && w.path) Native.call('watch.start', { id: w.id, path: w.path }).catch(function (e) { UI.toast(e.message, { error: true }); });
    },
  };
  App.Automation = Automation;

  function bindAutomationEvents() {
    Native.on('watch.file', async function (p) {
      var w = (Store.settings.watchFolders || []).find(function (x) { return x.id === p.id; });
      if (!w) return;
      Native.call('notify.show', { title: 'File baru di ' + U.basename(w.path), body: p.name + ' — klik Sinai untuk memprosesnya' });
      var mode = w.mode || 'chat';
      var conv = App.newConversation(mode, mode === 'code' ? { workspace: w.path } : {});
      try { await Chat.addPaths([p.path]); } catch (e) { /* ignore */ }
      if (w.instruction) Chat.setInput(w.instruction);
      UI.toast('File baru terdeteksi: ' + p.name + ' — tinjau lalu kirim.', { icon: 'bell', ms: 6000 });
    });
    Native.on('webhook.hit', function (p) {
      Native.call('notify.show', { title: 'Webhook Sinai', body: 'Permintaan diterima' + (p.path ? ' di ' + p.path : '') });
      var conv = App.newConversation('chat');
      Chat.setInput((Store.settings.webhook && Store.settings.webhook.prompt ? Store.settings.webhook.prompt + '\n\n' : '') + (p.body || '').slice(0, 20000));
      UI.toast('Webhook diterima — tinjau pesan lalu kirim.', { icon: 'bell', ms: 6000 });
    });
    // Notify when a longer agent run finishes (so you can step away).
    var starts = {};
    Engine.on('run', function (c, running) {
      if (running) { starts[c.id] = Date.now(); return; }
      var took = Date.now() - (starts[c.id] || Date.now());
      delete starts[c.id];
      if (Store.settings.notifyOnFinish !== false && took > 20000 && !document.hasFocus()) {
        Native.call('notify.show', { title: 'Sinai selesai', body: (c.title || 'Tugas') + ' — ' + U.fmtDuration(took) });
      }
    });
  }

  window.App = App;
  document.addEventListener('DOMContentLoaded', boot);
})();
