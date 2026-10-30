/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Persistence: settings, conversation index and conversation files live in
   ~/Library/Application Support/Sinai; API keys live in the macOS Keychain. */
(function () {
  'use strict';

  var DEFAULTS = {
    version: 1,
    providers: [],
    defaults: { chat: null, code: null },
    reviewer: null,
    utility: null,
    intelligence: { chat: 'balanced', code: 'balanced', design: 'balanced' },
    permission: 'ask',
    web: true,
    appearance: { theme: 'system', glass: 'glass', accent: '#6e6bff', fontSize: 14 },
    profile: { name: '', about: '', style: '' },
    agent: { maxSteps: 80, commandTimeout: 180, autoVerify: false, maxDrafts: 3, autoContinue: true, autoRecover: true, fallbackModels: [], confirmOutbound: false, designPolish: true, contextBudget: 64000, lean: true, team: true },
    connectors: {},
    modelPrefs: {},
    recentWorkspaces: [],
    sendWithEnter: true,
    sidebarCollapsed: false,
    autoOpenCanvas: true,
    codePanelOpen: false,
    style: 'normal',
    customStyles: [],
    memory: { enabled: true, items: [] },
    mcpServers: [],
    integrations: true,
    notifyOnFinish: true,
    watchFolders: [],
    webhook: { enabled: false, port: 8765, token: '' },
    outputDir: '',
    router: { light: null, strong: null, panel: [], escalate: true },
    hooks: [],
    modelProfiles: {},
    evalRuns: [],
    evalJudge: null,
  };

  var listeners = {};
  function emit(name, data) { (listeners[name] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); }
  function on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); }

  function merge(base, over) {
    var out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(over || {}).forEach(function (k) {
      var b = base ? base[k] : undefined, o = over[k];
      if (b && o && typeof b === 'object' && typeof o === 'object' && !Array.isArray(b) && !Array.isArray(o)) out[k] = merge(b, o);
      else if (o !== undefined) out[k] = o;
    });
    return out;
  }

  async function readJSON(name) {
    try {
      var s = await Native.call('store.read', { name: name });
      return s ? JSON.parse(s) : null;
    } catch (e) {
      console.warn('read failed', name, e);
      return null;
    }
  }
  function writeJSON(name, obj) {
    return Native.call('store.write', { name: name, content: JSON.stringify(obj) });
  }

  var Store = {
    settings: structuredClone(DEFAULTS),
    index: [],
    info: {},
    convs: new Map(),
    keys: new Map(),
    on: on,
    emit: emit,

    init: async function () {
      this.info = await Native.call('app.info');
      var s = await readJSON('settings.json');
      this.settings = merge(DEFAULTS, s || {});
      // Provider Sinerli lama (SNR-1 & Racikan) digabung menjadi satu nama: "Sinerli".
      (this.settings.providers || []).forEach(function (p) {
        if (p.presetId === 'sinerli-gw') p.presetId = 'sinerli';
        if (p.presetId === 'sinerli' && /^Sinerli( AI \(SNR-1\)| Racikan Model AI)?$/.test(p.name || '')) p.name = 'Sinerli';
        if (p.presetId === 'sinerli') (p.models || []).forEach(function (m) { if (/^(sinerli-)?snr-?1/i.test(m.id)) m.name = 'Sinerli'; });
      });
      // Token-saver defaults for installs that never chose a context budget themselves.
      if (!this.settings.agent.budgetChosen && this.settings.agent.contextBudget > 64000) this.settings.agent.contextBudget = 64000;
      this.index = (await readJSON('index.json')) || [];
      this.projects = (await readJSON('projects.json')) || [];
      this.index.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    },

    saveSettings: U.debounce(function () {
      writeJSON('settings.json', Store.settings);
      emit('settings', Store.settings);
    }, 250),

    setSetting: function (path, value) {
      var parts = path.split('.'), o = this.settings;
      for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
      o[parts[parts.length - 1]] = value;
      this.saveSettings();
      emit('settings', this.settings);
    },

    // ---- projects (Claude-style: instructions + knowledge files) ----
    projects: [],
    project: function (id) { return this.projects.find(function (p) { return p.id === id; }) || null; },
    saveProjects: U.debounce(function () { writeJSON('projects.json', Store.projects); emit('projects', Store.projects); }, 200),
    upsertProject: function (p) {
      var i = this.projects.findIndex(function (x) { return x.id === p.id; });
      if (i >= 0) this.projects[i] = p; else this.projects.unshift(p);
      this.saveProjects();
      emit('projects', this.projects);
    },
    deleteProject: function (id) {
      this.projects = this.projects.filter(function (p) { return p.id !== id; });
      this.index.forEach(function (e) { if (e.projectId === id) e.projectId = null; });
      this.saveProjects();
      this.saveIndex();
      emit('projects', this.projects);
    },

    // ---- checkpoints for code rewind ----
    _cps: new Map(),
    loadCheckpoints: async function (convId) {
      if (this._cps.has(convId)) return this._cps.get(convId);
      var c = (await readJSON('checkpoints/' + convId + '.json')) || {};
      this._cps.set(convId, c);
      return c;
    },
    saveCheckpoints: function (convId, data) {
      this._cps.set(convId, data);
      writeJSON('checkpoints/' + convId + '.json', data);
    },

    // ---- providers & keys ----
    provider: function (id) {
      return this.settings.providers.find(function (p) { return p.id === id; }) || null;
    },
    getKey: async function (providerId) {
      if (this.keys.has(providerId)) return this.keys.get(providerId);
      var v = null;
      try { v = await Native.call('secret.get', { key: 'provider:' + providerId }); } catch (e) { v = null; }
      this.keys.set(providerId, v || null);
      return v || null;
    },
    setKey: async function (providerId, key) {
      await Native.call('secret.set', { key: 'provider:' + providerId, value: key || '' });
      this.keys.set(providerId, key || null);
    },
    /* Extra (backup) keys for the same provider, rotated when one hits its
       rate limit or runs out of quota. Stored as one newline-separated secret. */
    getExtraKeys: async function (providerId) {
      var k = 'extra:' + providerId;
      if (this.keys.has(k)) return this.keys.get(k);
      var v = null;
      try { v = await Native.call('secret.get', { key: 'provider-extra:' + providerId }); } catch (e) { v = null; }
      var list = String(v || '').split(/\s*\n\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
      this.keys.set(k, list);
      return list;
    },
    setExtraKeys: async function (providerId, list) {
      list = (list || []).map(function (x) { return String(x).trim(); }).filter(Boolean);
      await Native.call('secret.set', { key: 'provider-extra:' + providerId, value: list.join('\n') });
      this.keys.set('extra:' + providerId, list);
    },
    getKeys: async function (providerId) {
      var main = await this.getKey(providerId);
      var extra = await this.getExtraKeys(providerId);
      return (main ? [main] : []).concat(extra.filter(function (k) { return k !== main; }));
    },
    keyCursor: {},
    modelPref: function (providerId, modelId) {
      return this.settings.modelPrefs[providerId + '::' + modelId] || {};
    },
    setModelPref: function (providerId, modelId, patch) {
      var k = providerId + '::' + modelId;
      this.settings.modelPrefs[k] = Object.assign({}, this.settings.modelPrefs[k] || {}, patch);
      this.saveSettings();
    },

    // ---- conversations ----
    saveIndex: U.debounce(function () { writeJSON('index.json', Store.index); }, 300),

    touchIndex: function (conv) {
      var e = this.index.find(function (x) { return x.id === conv.id; });
      if (!e) { e = { id: conv.id, createdAt: conv.createdAt }; this.index.unshift(e); }
      e.title = conv.title;
      e.mode = conv.mode;
      e.updatedAt = conv.updatedAt;
      e.workspace = conv.workspace || null;
      e.pinned = !!conv.pinned;
      e.projectId = conv.projectId || null;
      this.index.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
      this.saveIndex();
      emit('index', this.index);
    },

    createConv: function (mode, opts) {
      opts = opts || {};
      var now = Date.now();
      var conv = {
        id: U.uid('c_'), title: opts.title || 'Percakapan baru', mode: mode || 'chat',
        createdAt: now, updatedAt: now, model: opts.model || null, workspace: opts.workspace || null,
        level: opts.level || null, web: opts.web, messages: [], todos: [], summary: null, usage: { input: 0, output: 0 },
        projectId: opts.projectId || null,
        persisted: false,
      };
      this.convs.set(conv.id, conv);
      return conv;
    },

    loadConv: async function (id) {
      if (this.convs.has(id)) return this.convs.get(id);
      var c = await readJSON('conversations/' + id + '.json');
      if (!c) return null;
      c.persisted = true;
      this.convs.set(id, c);
      return c;
    },

    _savers: new Map(),
    _deleted: new Set(),
    saveConv: function (conv, immediate) {
      if (!conv.messages.length || this._deleted.has(conv.id) || conv.eval) return;
      conv.persisted = true;
      this.touchIndex(conv);
      var saver = this._savers.get(conv.id);
      if (!saver) {
        saver = U.debounce(function () {
          if (Store._deleted.has(conv.id)) return;
          var copy = Object.assign({}, conv);
          delete copy.persisted;
          writeJSON('conversations/' + conv.id + '.json', copy);
        }, 500);
        this._savers.set(conv.id, saver);
      }
      saver();
      if (immediate) saver.flush();
    },

    deleteConv: async function (id) {
      // A run that is being stopped may still try to save this chat; never let it come back.
      this._deleted.add(id);
      this._savers.delete(id);
      this.convs.delete(id);
      Native.call('store.delete', { name: 'checkpoints/' + id + '.json' }).catch(function () {});
      // Files Sinai generated for this chat in its own folder (a custom output folder is left alone).
      Native.call('store.delete', { name: 'files/' + id }).catch(function () {});
      this.index = this.index.filter(function (x) { return x.id !== id; });
      this.saveIndex();
      emit('index', this.index);
      await Native.call('store.delete', { name: 'conversations/' + id + '.json' });
    },

    renameConv: function (id, title) {
      var e = this.index.find(function (x) { return x.id === id; });
      if (e) e.title = title;
      var c = this.convs.get(id);
      if (c) { c.title = title; this.saveConv(c); }
      else { this.saveIndex(); emit('index', this.index); this.loadConv(id).then(function (cc) { if (cc) { cc.title = title; Store.saveConv(cc); } }); }
    },

    pinConv: function (id, pinned) {
      var e = this.index.find(function (x) { return x.id === id; });
      if (e) e.pinned = pinned;
      var c = this.convs.get(id);
      if (c) c.pinned = pinned;
      this.saveIndex();
      emit('index', this.index);
      this.loadConv(id).then(function (cc) { if (cc) { cc.pinned = pinned; Store.saveConv(cc); } });
    },

    addRecentWorkspace: function (path) {
      var r = this.settings.recentWorkspaces.filter(function (p) { return p !== path; });
      r.unshift(path);
      this.settings.recentWorkspaces = r.slice(0, 8);
      this.saveSettings();
    },
  };

  window.Store = Store;
})();
