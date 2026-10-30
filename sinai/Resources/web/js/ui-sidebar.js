/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Sidebar: mode switch, conversation list (grouped, searchable), item menus. */
(function () {
  'use strict';
  var h = U.h;
  var Sidebar = {};
  var els = {};
  var query = '';
  var renaming = null;

  Sidebar.init = function () {
    els.list = document.getElementById('conv-list');
    els.search = document.getElementById('search');
    els.modeSwitch = UI.$('.mode-switch');
    els.status = document.getElementById('provider-status');
    document.getElementById('btn-new').addEventListener('click', function () { App.newConversation(UI.state.mode); });
    document.getElementById('btn-settings').addEventListener('click', function () { Settings.open(); });
    document.getElementById('btn-collapse').innerHTML = U.icon('sidebar');
    document.getElementById('btn-expand').innerHTML = U.icon('sidebar');
    document.getElementById('btn-collapse').addEventListener('click', function () { App.toggleSidebar(); });
    document.getElementById('btn-expand').addEventListener('click', function () { App.toggleSidebar(); });
    els.modeSwitch.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { App.setMode(b.dataset.mode); });
    });
    els.search.addEventListener('input', function () { query = els.search.value.trim().toLowerCase(); Sidebar.render(); });
    els.search.addEventListener('keydown', function (e) { if (e.key === 'Escape') { els.search.value = ''; query = ''; Sidebar.render(); els.search.blur(); } });
    Store.on('index', function () { Sidebar.render(); });
    Store.on('projects', function () { Sidebar.render(); });
    Store.on('settings', function () { Sidebar.renderStatus(); });
  };

  Sidebar.focusSearch = function () {
    if (document.getElementById('app').classList.contains('sb-collapsed')) App.toggleSidebar();
    els.search.focus();
    els.search.select();
  };

  Sidebar.renderMode = function () {
    var mode = UI.state.mode;
    els.modeSwitch.classList.toggle('code', mode === 'code');
    els.modeSwitch.classList.toggle('design', mode === 'design');
    els.modeSwitch.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === mode); });
    UI.$('#btn-new span').textContent = mode === 'code' ? 'Sesi coding baru' : mode === 'design' ? 'Desain baru' : 'Percakapan baru';
    UI.$('#btn-new kbd').textContent = U.kbd(mode === 'code' ? '⇧⌘N' : mode === 'design' ? '⌥⌘N' : '⌘N');
  };

  Sidebar.renderStatus = function () {
    var ps = Store.settings.providers.filter(function (p) { return p.enabled !== false; });
    var n = ps.reduce(function (a, p) { return a + (p.models || []).filter(function (m) { return m.chat !== false; }).length; }, 0);
    var ok = 0, bad = 0;
    ps.forEach(function (p) { var s = Health.summary(p); ok += s.ok; bad += s.err; });
    var def = Store.settings.defaults.chat;
    var defState = def ? Health.state(def.providerId, def.modelId) : 'unknown';
    els.status.innerHTML = ps.length
      ? '<span class="dot ' + (defState === 'err' ? 'err' : defState === 'ok' ? 'ok' : '') + '"></span><span>' + ps.length + ' provider · ' + n + ' model' +
        (ok || bad ? ' · <b class="h-okt">' + ok + ' siap</b>' + (bad ? ' · <b class="h-errt">' + bad + ' error</b>' : '') : '') + '</span>'
      : '<span class="dot err"></span><span>Belum ada API key</span>';
    els.status.title = def ? 'Model default: ' + def.modelId + ' — ' + Health.describe(def.providerId, def.modelId) : '';
    els.status.style.cursor = ps.length ? 'pointer' : '';
    els.status.onclick = ps.length ? function () { Settings.open('usage'); } : null;
  };

  Sidebar.markRunning = function () {
    els.list.querySelectorAll('.conv-item').forEach(function (it) {
      var running = Engine.isRunning(it.dataset.id);
      var sp = it.querySelector('.spin');
      if (running && !sp) it.insertBefore(h('span.spin'), it.querySelector('.more'));
      else if (!running && sp) sp.remove();
    });
  };

  function groupHeader(icon, title, tooltip, onAdd, onClick) {
    var row = h('div.conv-group.grp', { title: tooltip || title });
    row.innerHTML = U.icon(icon) + '<span>' + U.esc(title) + '</span>';
    if (onClick) { row.classList.add('click'); row.addEventListener('click', onClick); }
    if (onAdd) {
      var b = h('button.grp-add', { html: U.icon('plus'), title: 'Baru di sini' });
      b.addEventListener('click', function (e) { e.stopPropagation(); onAdd(); });
      row.appendChild(b);
    }
    return row;
  }

  Sidebar.render = function () {
    var mode = UI.state.mode;
    var cur = UI.state.conv;
    var items = Store.index.filter(function (e) { return (e.mode || 'chat') === mode; });
    if (query) items = items.filter(function (e) { return (e.title || '').toLowerCase().indexOf(query) >= 0 || (e.workspace || '').toLowerCase().indexOf(query) >= 0; });
    els.list.innerHTML = '';
    if (mode !== 'code' && !query) {
      var pc = Store.projects.length;
      els.list.appendChild(h('button.sb-link', { html: U.icon('box') + '<span>Proyek</span><em>' + (pc || '') + '</em>', onclick: function () { App.openProjects(); } }));
    }
    if (!items.length) {
      els.list.appendChild(h('div.conv-empty', { text: query ? 'Tidak ditemukan' : (mode === 'code' ? 'Belum ada sesi coding' : mode === 'design' ? 'Belum ada desain' : 'Belum ada percakapan') }));
      return;
    }
    var pinned = items.filter(function (e) { return e.pinned; });
    var rest = items.filter(function (e) { return !e.pinned; });
    if (pinned.length) {
      els.list.appendChild(h('div.conv-group', { text: 'Disematkan' }));
      pinned.forEach(function (e) { els.list.appendChild(item(e, cur)); });
    }
    if (mode === 'code') {
      // Claude Code style: sessions grouped by project folder
      var groups = {}, order = [];
      rest.forEach(function (e) {
        var k = e.workspace || '';
        if (!groups[k]) { groups[k] = []; order.push(k); }
        groups[k].push(e);
      });
      order.forEach(function (ws) {
        els.list.appendChild(groupHeader('folder', ws ? U.basename(ws) : 'Tanpa folder', ws ? U.tildify(ws, Store.info.home) : '',
          function () { App.newConversation('code', { workspace: ws || null }); }));
        groups[ws].forEach(function (e) { els.list.appendChild(item(e, cur, true)); });
      });
      return;
    }
    var byProject = {}, loose = [];
    rest.forEach(function (e) {
      if (e.projectId && Store.project(e.projectId)) (byProject[e.projectId] = byProject[e.projectId] || []).push(e);
      else loose.push(e);
    });
    Object.keys(byProject).forEach(function (pid) {
      var p = Store.project(pid);
      els.list.appendChild(groupHeader('box', p.name, p.description || p.name, function () { App.newConversation(mode, { projectId: pid }); }, function () { App.openProject(pid); }));
      byProject[pid].forEach(function (e) { els.list.appendChild(item(e, cur, true)); });
    });
    var lastGroup = null;
    loose.forEach(function (e) {
      var g = U.dateGroup(e.updatedAt);
      if (g !== lastGroup) { els.list.appendChild(h('div.conv-group', { text: g })); lastGroup = g; }
      els.list.appendChild(item(e, cur));
    });
  };

  function item(e, cur, nested) {
    var active = cur && cur.id === e.id;
    var el = h('div.conv-item' + (active ? '.active' : '') + (nested ? '.nested' : ''), { dataset: { id: e.id }, title: e.workspace ? e.title + '\n' + e.workspace : e.title });
    el.innerHTML = U.icon(e.mode === 'code' ? 'code' : e.mode === 'design' ? 'palette' : 'chat');
    if (renaming === e.id) {
      var inp = h('input', { value: e.title });
      var done = function (save) {
        if (renaming !== e.id) return;
        renaming = null;
        if (save && inp.value.trim()) Store.renameConv(e.id, inp.value.trim());
        Sidebar.render();
      };
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); });
      inp.addEventListener('blur', function () { done(true); });
      el.appendChild(inp);
      setTimeout(function () { inp.focus(); inp.select(); }, 10);
      return el;
    }
    el.appendChild(h('span.t', { text: e.title || 'Tanpa judul' }));
    if (Engine.isRunning(e.id)) el.appendChild(h('span.spin'));
    var more = h('button.more', { html: U.icon('more'), title: 'Opsi' });
    more.addEventListener('click', function (ev) { ev.stopPropagation(); itemMenu(more, e); });
    el.appendChild(more);
    el.addEventListener('click', function () { App.openConversation(e.id); });
    el.addEventListener('dblclick', function () { renaming = e.id; Sidebar.render(); });
    el.addEventListener('contextmenu', function (ev) { ev.preventDefault(); itemMenu(el, e); });
    return el;
  }

  function moveToProject(anchor, e) {
    var items = [{ title: 'Pindahkan ke proyek' }];
    Store.projects.forEach(function (p) {
      items.push({ label: p.name, icon: 'box', check: e.projectId === p.id, onClick: function () { setProject(e, p.id); } });
    });
    if (e.projectId) items.push('sep', { label: 'Keluarkan dari proyek', icon: 'x', onClick: function () { setProject(e, null); } });
    if (!Store.projects.length) items.push({ label: 'Belum ada proyek — buat dulu', icon: 'plus', onClick: function () { App.openProjects(); } });
    UI.menu(anchor, items, { width: 260 });
  }

  async function setProject(e, pid) {
    var c = await Store.loadConv(e.id);
    if (!c) return;
    c.projectId = pid;
    Store.saveConv(c);
    if (UI.state.conv && UI.state.conv.id === c.id) Chat.refreshComposer();
  }

  var more = null;
  function itemMenu(anchor, e) {
    more = anchor;
    UI.menu(anchor, [
      { label: 'Ganti nama', icon: 'edit', onClick: function () { renaming = e.id; Sidebar.render(); } },
      { label: e.pinned ? 'Lepas sematan' : 'Sematkan', icon: 'pin', onClick: function () { Store.pinConv(e.id, !e.pinned); } },
      e.mode !== 'code' ? { label: 'Pindahkan ke proyek…', icon: 'box', onClick: function () { moveToProject(more || anchor, e); } } : null,
      { label: 'Ekspor Markdown', icon: 'download', onClick: async function () { await App.openConversation(e.id); Chat.exportConv(); } },
      e.workspace ? { label: U.plat('Tampilkan folder di Finder'), icon: 'folder', onClick: function () { Native.call('app.reveal', { path: e.workspace }); } } : null,
      'sep',
      { label: 'Hapus', icon: 'trash', danger: true, onClick: async function () {
        var ok = await UI.confirm({ title: 'Hapus percakapan?', body: '"' + e.title + '" akan dihapus permanen dari Sinai.', ok: 'Hapus', danger: true });
        if (!ok) return;
        Engine.stop(e.id);
        await Store.deleteConv(e.id);
        if (UI.state.conv && UI.state.conv.id === e.id) App.newConversation(UI.state.mode);
      } },
    ].filter(Boolean), { width: 230 });
  }

  window.Sidebar = Sidebar;
})();
