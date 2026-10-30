/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Settings modal and first-run onboarding. */
(function () {
  'use strict';
  var h = U.h;
  var Settings = {};
  var modal = null;

  var PREFERRED = [/^sinerli-snr/, /claude-(fable|opus)/, /deepseek-v4-pro/, /^gpt-5(?!.*(mini|nano))/, /gemini-.*pro/, /deepseek/, /grok-4/, /kimi-k2/, /qwen3/, /glm-(4\.[5-9]|5)/, /mistral-large|devstral/, /llama/];

  function bestModel(models) {
    var chat = models.filter(function (m) { return m.chat !== false; });
    for (var i = 0; i < PREFERRED.length; i++) {
      var hit = chat.filter(function (m) { return PREFERRED[i].test(m.id.toLowerCase().split('/').pop()); });
      if (hit.length) return hit.sort(function (a, b) { return b.id.localeCompare(a.id); })[0];
    }
    return chat[0] || models[0] || null;
  }

  function seg(options, value, onChange) {
    var el = h('div.seg');
    options.forEach(function (o) {
      var b = h('button' + (o[0] === value ? '.on' : ''), { text: o[1], onclick: function () {
        el.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        onChange(o[0]);
      } });
      el.appendChild(b);
    });
    return el;
  }

  function toggle(on, onChange) {
    var el = h('button.switch' + (on ? '.on' : ''), { onclick: function () { el.classList.toggle('on'); onChange(el.classList.contains('on')); } });
    return el;
  }

  function optRow(title, sub, control) {
    return h('div.opt-row', h('div.ol', h('b', { text: title }), sub ? h('span', { text: sub }) : null), control);
  }

  function modelSelect(value, onChange, opts) {
    opts = opts || {};
    var sel = h('select.sel');
    if (opts.none) sel.appendChild(h('option', { value: '', text: opts.none }));
    Store.settings.providers.forEach(function (p) {
      if (p.enabled === false) return;
      var g = h('optgroup', { label: p.name });
      (p.models || []).filter(function (m) { return m.chat !== false; }).forEach(function (m) {
        g.appendChild(h('option', { value: p.id + '::' + m.id, text: m.name && m.name !== m.id ? m.name + '  (' + m.id + ')' : m.id }));
      });
      sel.appendChild(g);
    });
    sel.value = value ? value.providerId + '::' + value.modelId : '';
    sel.addEventListener('change', function () {
      if (!sel.value) { onChange(null); return; }
      var i = sel.value.indexOf('::');
      onChange({ providerId: sel.value.slice(0, i), modelId: sel.value.slice(i + 2) });
    });
    return sel;
  }

  // ================================================================ provider form

  function providerForm(existing, onDone) {
    var isEdit = !!existing;
    var preset = Providers.preset(existing ? existing.presetId : 'deepseek');
    var detected = existing ? (existing.models || []) : null;

    var keyInp = h('input.inp.mono', { type: 'password', placeholder: isEdit ? '•••••••• (biarkan kosong untuk tetap memakai key lama)' : 'Tempel API key di sini (snr-…, sk-…, sk-ant-…, AIza…, sk-or-…)', autocomplete: 'off', spellcheck: false });
    var eye = h('button.icon-btn', { html: U.icon('eye'), title: 'Tampilkan', onclick: function () { keyInp.type = keyInp.type === 'password' ? 'text' : 'password'; } });
    var presetSel = h('select.sel');
    Providers.PRESETS.forEach(function (p) { presetSel.appendChild(h('option', { value: p.id, text: p.name })); });
    presetSel.value = preset.id;
    var nameInp = h('input.inp', { value: existing ? existing.name : preset.name });
    var urlInp = h('input.inp.mono', { value: existing ? existing.baseUrl : preset.baseUrl, placeholder: 'https://api.example.com/v1' });
    var detectEl = h('div.detect');
    var keyHint = h('div.hint');
    var resultBox = h('div');
    var chatSel = null, codeSel = null;

    function applyPreset(id, reason) {
      preset = Providers.preset(id);
      presetSel.value = preset.id;
      if (reason !== 'init' || !isEdit) { nameInp.value = preset.name; urlInp.value = preset.baseUrl; }
      keyHint.innerHTML = preset.noKey ? 'Provider lokal ini biasanya tidak memerlukan API key.' :
        (preset.keysUrl ? 'Dapatkan API key: <a href="' + preset.keysUrl + '" data-ext="1">' + U.esc(preset.keysUrl.replace(/^https:\/\//, '')) + '</a>' : '');
    }
    keyHint.addEventListener('click', function (e) { var a = e.target.closest('a'); if (a) { e.preventDefault(); Native.call('app.openURL', { url: a.getAttribute('href') }); } });
    applyPreset(preset.id, 'init');

    keyInp.addEventListener('input', function () {
      var d = Providers.detectPreset(keyInp.value);
      if (d && d !== preset.id) {
        applyPreset(d, 'key');
        detectEl.className = 'detect ok';
        detectEl.innerHTML = U.icon('sparkle') + '<span>Terdeteksi sebagai <b>' + U.esc(preset.name) + '</b> dari format key.</span>';
      }
      // Key Sinerli sudah membawa alamat & model: langsung hubungkan tanpa langkah lain.
      if (d === 'sinerli' && !isEdit) urlInp.value = Providers.sinerliUrl(keyInp.value);
      if (d === 'sinerli' && (/^snr-[A-Za-z0-9_-]{20,}$/.test(keyInp.value.trim()) || Providers.isSinerliGwKey(keyInp.value))) setTimeout(function () { if (!connectBtn.disabled) connectBtn.click(); }, 300);
    });
    presetSel.addEventListener('change', function () { applyPreset(presetSel.value, 'select'); });

    var connectBtn = h('button.btn.primary', { html: U.icon('zap') + '<span>Hubungkan & deteksi model</span>' });
    var saveBtn = h('button.btn.primary', { html: U.icon('check') + '<span>Simpan</span>' });
    saveBtn.hidden = !detected;

    function draftProvider() {
      return {
        id: existing ? existing.id : U.uid('p_'), presetId: preset.id, name: nameInp.value.trim() || preset.name,
        kind: preset.kind, baseUrl: urlInp.value.trim().replace(/\/+$/, ''), models: detected || [], enabled: existing ? existing.enabled !== false : true,
        noKey: !!preset.noKey,
      };
    }

    function renderResult() {
      resultBox.innerHTML = '';
      if (!detected) return;
      var chat = detected.filter(function (m) { return m.chat !== false; });
      var grid = h('div.model-grid');
      detected.slice(0, 500).forEach(function (m) {
        var caps = Providers.inferCaps(m.id, m);
        grid.appendChild(h('div.model-line', { style: m.chat === false ? { opacity: '.5' } : null },
          h('span.mid', { text: m.id, title: m.name }),
          h('span.badges', { html: (caps.reasoning ? '<span class="badge b-r">nalar</span>' : '') + (caps.vision ? '<span class="badge b-v">visi</span>' : '') +
            (caps.tools !== false ? '<span class="badge b-t">alat</span>' : '') + (caps.ctx ? '<span class="badge">' + U.fmtTokens(caps.ctx) + '</span>' : '') + (m.chat === false ? '<span class="badge">non-chat</span>' : '') })));
      });
      resultBox.appendChild(h('div.hint', { text: chat.length + ' model chat siap dipakai' + (detected.length > chat.length ? ' (' + (detected.length - chat.length) + ' model non-chat disembunyikan dari pemilih)' : '') + '.' }));
      resultBox.appendChild(grid);
      var best = bestModel(detected);
      var p = draftProvider();
      var defChat = Store.settings.defaults.chat && Store.settings.defaults.chat.providerId === p.id ? Store.settings.defaults.chat.modelId : (best && best.id);
      var defCode = Store.settings.defaults.code && Store.settings.defaults.code.providerId === p.id ? Store.settings.defaults.code.modelId : (best && best.id);
      chatSel = h('select.sel'); codeSel = h('select.sel');
      chat.forEach(function (m) { chatSel.appendChild(h('option', { value: m.id, text: m.id })); codeSel.appendChild(h('option', { value: m.id, text: m.id })); });
      chatSel.value = defChat || ''; codeSel.value = defCode || '';
      resultBox.appendChild(h('div.row', h('div.field', h('label', { text: 'Model default untuk Chat' }), chatSel), U.isMobile() ? null : h('div.field', h('label', { text: 'Model default untuk Code' }), codeSel)));
    }

    connectBtn.addEventListener('click', async function () {
      var p = draftProvider();
      if (!p.baseUrl) { detectEl.className = 'detect err'; detectEl.textContent = 'Base URL wajib diisi untuk provider kustom.'; return; }
      var key = keyInp.value.trim() || (existing ? await Store.getKey(existing.id) : '');
      if (!key && !preset.noKey) { detectEl.className = 'detect err'; detectEl.textContent = 'Masukkan API key terlebih dahulu.'; keyInp.focus(); return; }
      connectBtn.disabled = true;
      detectEl.className = 'detect';
      detectEl.innerHTML = '<span class="spin"></span><span>Menghubungkan ke ' + U.esc(p.name) + ' dan membaca daftar model…</span>';
      try {
        detected = await Providers.listModels(p, key);
        detectEl.className = 'detect ok';
        detectEl.innerHTML = U.icon('check') + '<span>Terhubung! ' + detected.length + ' model terdeteksi pada API key ini.</span>';
        saveBtn.hidden = false;
        renderResult();
        // Sinerli: model sudah ditentukan server, jadi langsung simpan tanpa klik lagi.
        if (/^sinerli/.test(preset.id) && !isEdit && keyInp.value.trim()) saveBtn.click();
      } catch (e) {
        detectEl.className = 'detect err';
        detectEl.innerHTML = U.icon('alert') + '<span>' + U.esc(e.message) + '</span>';
      } finally { connectBtn.disabled = false; }
    });

    saveBtn.addEventListener('click', async function () {
      var p = draftProvider();
      var key = keyInp.value.trim();
      try {
        if (key) await Store.setKey(p.id, key);
      } catch (e) { UI.toast('Gagal menyimpan key: ' + e.message, { error: true }); return; }
      p.syncedAt = Date.now();
      var list = Store.settings.providers.slice();
      var idx = list.findIndex(function (x) { return x.id === p.id; });
      if (idx >= 0) list[idx] = Object.assign({}, list[idx], p); else list.push(p);
      Store.settings.providers = list;
      if (chatSel && chatSel.value) {
        if (!Store.settings.defaults.chat || !Providers.resolve(Store.settings.defaults.chat) || idx < 0 || Store.settings.defaults.chat.providerId === p.id) Store.settings.defaults.chat = { providerId: p.id, modelId: chatSel.value };
      }
      if (codeSel && codeSel.value) {
        if (!Store.settings.defaults.code || !Providers.resolve(Store.settings.defaults.code) || idx < 0 || Store.settings.defaults.code.providerId === p.id) Store.settings.defaults.code = { providerId: p.id, modelId: codeSel.value };
      }
      Store.saveSettings();
      Store.emit('settings', Store.settings);
      UI.toast(p.name + ' tersimpan');
      Chat.refreshComposer();
      if (onDone) onDone(p);
    });

    if (detected) setTimeout(renderResult, 0);
    return h('div',
      h('div.field', h('label', { text: 'API key' }), h('div.row', keyInp, eye), keyHint, detectEl),
      h('div.row', h('div.field', h('label', { text: 'Provider' }), presetSel), h('div.field', h('label', { text: 'Nama tampilan' }), nameInp)),
      h('div.field', h('label', { text: 'Base URL (endpoint API)' }), urlInp,
        h('div.hint', { text: preset.kind === 'anthropic' ? 'Format Anthropic Messages API.' : 'Format OpenAI-compatible (/chat/completions & /models). Ubah bila memakai proxy/gateway sendiri.' })),
      h('div.row', { style: { gap: '8px', margin: '4px 0 14px' } }, connectBtn, saveBtn),
      resultBox);
  }

  // ================================================================ onboarding

  Settings.onboarding = function () {
    var m;
    var form = providerForm(null, function () { m.close(); App.afterProviderAdded(); });
    var sinStatus = h('div.hint', { style: { margin: '8px 0 0' } });
    var sinBtn = h('button.btn.primary.onboard-sinerli', { html: U.icon('user') + '<span>Masuk dengan Sinerli</span>', onclick: async function () {
      sinBtn.disabled = true;
      sinStatus.textContent = 'Menunggu persetujuan di browser…';
      try {
        await Sinerli.login();
        var ok = Store.settings.providers.some(function (p) { return p.autoSinerli; });
        if (!ok) await Sinerli.connectAI();
        m.close();
        UI.toast('Terhubung ke Sinerli — model Sinerli AI siap dipakai');
        App.afterProviderAdded();
      } catch (e) { sinStatus.textContent = e.message; sinBtn.disabled = false; }
    } });
    var keyBox = h('details.onboard-keys', h('summary', { text: 'Atau pakai API key sendiri (OpenAI, Claude, Gemini, DeepSeek, dll.)' }), form);
    var el = h('div.onboard',
      h('div.brand-logo-lg'),
      h('h2', { text: 'Selamat datang di Sinai' }),
      h('p.lead', { text: 'Masuk dengan akun Sinerli: model Sinerli AI langsung tersambung sesuai paket Anda, tanpa mengurus API key. Bisa juga memakai API key provider lain — Sinai mendeteksi provider dan semua modelnya otomatis.' }),
      h('div.onboard-sinerli-box', sinBtn, sinStatus),
      keyBox,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' } },
        h('span.hint', { html: U.icon('shield') + U.esc(U.plat(' Key disimpan aman di macOS Keychain.')) }),
        h('button.btn.ghost.sm', { text: 'Nanti saja', onclick: function () { m.close(); } })),
      h('div.copyright-note', { text: App.copyright() }));
    m = UI.modal(el);
    keyBox.addEventListener('toggle', function () { if (keyBox.open) { var i = keyBox.querySelector('input'); if (i) i.focus(); } });
  };

  // ================================================================ login wajib

  var gate = null;
  /** Gerbang login Sinerli: wajib saat instal awal dan setiap kali belum/tidak lagi masuk. */
  Settings.loginGate = async function () {
    if (await Sinerli.signedIn()) { if (gate) { gate.close(); gate = null; } document.getElementById('app').inert = !!(window.Updater && Updater.locked); return false; }
    if (gate && !gate.closed) return true;
    if (window.Updater && Updater.locked) return true;   // pembaruan wajib didahulukan
    document.getElementById('app').inert = true;
    var status = h('div.hint', { role: 'status', style: { margin: '10px 0 0', minHeight: '1.2em' } });
    var btn = h('button.btn.primary.onboard-sinerli', { html: U.icon('user') + '<span>Masuk dengan Sinerli (akun Google)</span>', onclick: async function () {
      btn.disabled = true; status.textContent = 'Menunggu persetujuan di browser — pilih “Masuk dengan Google” di halaman Sinerli…';
      try {
        await Sinerli.login();
        if (!Store.settings.providers.some(function (p) { return p.autoSinerli; })) { try { await Sinerli.connectAI(); } catch (e) {} }
        gate.close(); gate = null;
        document.getElementById('app').inert = false;
        UI.toast('Terhubung ke Sinerli — model Sinerli AI siap dipakai');
        App.afterProviderAdded();
      } catch (e) { status.textContent = e.message; btn.disabled = false; }
    } });
    var baseIn = h('input', { value: Sinerli.base(), placeholder: Sinerli.DEFAULT_BASE, spellcheck: 'false' });
    var adv = h('details.onboard-keys', h('summary', { text: 'Alamat server Sinerli' }),
      h('div.row', { style: { gap: '8px', marginTop: '8px' } }, baseIn,
        h('button.btn.sm', { text: 'Simpan', onclick: function () { var v = baseIn.value.trim().replace(/\/+$/, ''); Store.setSetting('sinerliBase', v && v !== Sinerli.DEFAULT_BASE ? v : ''); status.textContent = 'Alamat disimpan.'; } })));
    var el = h('div.modal.small.update-lock.login-gate', { role: 'alertdialog', 'aria-modal': 'true' },
      h('div.brand-logo-lg'),
      h('h2', { text: 'Masuk untuk memakai Sinai' }),
      h('p.lead', { text: 'Sinai memakai akun Sinerli. Masuk dengan akun Google Anda lewat Sinerli — model Sinerli AI langsung tersambung sesuai paket Anda.' }),
      btn, status,
      h('p.hint', { style: { marginTop: '12px' } }, 'Belum punya akun? Akun Sinerli dibuat otomatis saat pertama kali masuk dengan Google.'),
      adv,
      h('div.copyright-note', { text: App.copyright() }));
    gate = UI.modal(el, { dismissible: false });
    return true;
  };

  // ================================================================ settings modal

  var skillCat = 'Semua';

  var SECTIONS = [
    ['providers', 'Provider & Model', 'key'],
    ['usage', 'Token & Saldo', 'target'],
    ['intelligence', 'Kecerdasan', 'brain'],
    ['agent', 'Agen & Izin', 'shield'],
    ['automation', 'Otomasi & Integrasi', 'zap'],
    ['connectors', 'Konektor', 'plug'],
    ['sinerli', 'Akun Sinerli', 'user'],
    ['devices', 'Perangkat & Sinkron', 'plug'],
    ['skills', 'Skill', 'bulb'],
    ['repair', 'Perbaikan diri', 'refresh'],
    ['templates', 'Template desain', 'layers'],
    ['appearance', 'Tampilan', 'sun'],
    ['personal', 'Personalisasi', 'user'],
    ['data', 'Data', 'folder'],
    ['about', 'Tentang', 'info'],
  ];

  Settings.open = function (section) {
    if (modal && !modal.closed) modal.close();
    var nav = h('div.modal-nav', h('h2', { text: 'Pengaturan' }));
    var title = h('h3');
    var body = h('div.modal-body');
    var main = h('div.modal-main', h('div.modal-head', title, h('button.icon-btn', { html: U.icon('x'), onclick: function () { modal.close(); } })), body);
    var el = h('div.modal', nav, main);
    function show(id) {
      nav.querySelectorAll('.nav-item').forEach(function (n) { n.classList.toggle('active', n.dataset.id === id); });
      var s = SECTIONS.find(function (x) { return x[0] === id; });
      title.textContent = s[1];
      body.innerHTML = '';
      body.scrollTop = 0;
      RENDER[id](body, function () { show(id); });
    }
    // Ponsel: pantau folder, webhook lokal & integrasi komputer tidak tersedia.
    SECTIONS.filter(function (s) { return !(U.isMobile() && s[0] === 'automation'); }).forEach(function (s) {
      nav.appendChild(h('button.nav-item', { dataset: { id: s[0] }, html: U.icon(s[2]) + '<span>' + s[1] + '</span>', onclick: function () { show(s[0]); } }));
    });
    modal = UI.modal(el, { onClose: function () { Chat.refreshComposer(); Sidebar.renderStatus(); } });
    show(section || 'providers');
  };

  var RENDER = {
    providers: function (body, rerender) {
      var addBox = h('div');
      body.appendChild(h('div.section',
        h('div.row', { style: { justifyContent: 'space-between' } },
          h('p.hint', { style: { margin: 0 }, text: 'Tambahkan satu atau lebih API key. Untuk key multi-model (OpenRouter, Together, dll.) semua model yang tersedia dideteksi otomatis.' }),
          h('button.btn.primary.sm', { html: U.icon('plus') + 'Tambah provider', onclick: function () {
            addBox.innerHTML = '';
            addBox.appendChild(h('div.card', providerForm(null, function () { rerender(); })));
          } })),
        addBox));

      var list = h('div.section');
      if (!Store.settings.providers.length) list.appendChild(h('div.card', h('p.hint', { style: { margin: 0 }, text: 'Belum ada provider. Klik "Tambah provider" lalu tempel API key Anda.' })));
      Store.settings.providers.forEach(function (p) {
        var editBox = h('div');
        var modelBox = h('div');
        var count = (p.models || []).filter(function (m) { return m.chat !== false; }).length;
        var statusLine = h('div.h-summary');
        function paintSummary() {
          var sm = Health.summary(p);
          statusLine.innerHTML = '<span class="hdot h-ok"></span>' + sm.ok + ' siap <span class="hdot h-err"></span>' + sm.err + ' error <span class="hdot h-unknown"></span>' + sm.unknown + ' belum dicek';
        }
        paintSummary();
        function renderModels() {
          modelBox.innerHTML = '';
          var list = h('div.model-grid');
          (p.models || []).filter(function (m) { return m.chat !== false; }).forEach(function (m) {
            var hs = Health.state(p.id, m.id), rec = Health.get(p.id, m.id);
            var btn = h('button.btn.sm.ghost', { html: U.icon('refresh'), title: 'Uji model ini' });
            btn.addEventListener('click', async function () { btn.disabled = true; await Health.test(p.id, m.id); renderModels(); paintSummary(); });
            list.appendChild(h('div.model-line', { title: Health.describe(p.id, m.id) },
              h('span.hdot.h-' + hs), h('span.mid', { text: m.id }),
              h('span.hmsg' + (hs === 'ok' ? '.ok' : ''), { text: rec ? (rec.ok ? 'Siap' + (rec.latency ? ' · ' + (rec.latency < 1000 ? rec.latency + ' ms' : (rec.latency / 1000).toFixed(1) + ' dtk') : '') : rec.msg) : 'Belum dicek' }),
              btn));
          });
          modelBox.appendChild(list);
        }
        var testAll = h('button.btn.sm', { html: U.icon('zap') + 'Uji model', title: 'Kirim permintaan sangat kecil ke setiap model untuk memastikan siap dipakai' });
        testAll.addEventListener('click', async function () {
          var list = Health.chatModelsOf(p);
          if (list.length > 25 && !(await UI.confirm({ title: 'Uji ' + list.length + ' model?', body: 'Sinai mengirim satu permintaan sangat kecil (beberapa token) ke setiap model. Untuk key multi-model ini butuh waktu dan sedikit kredit.', ok: 'Uji semua' }))) return;
          testAll.disabled = true;
          var done = 0;
          if (!modelBox.childNodes.length) renderModels();
          await Health.testMany(list, function () { done++; testAll.innerHTML = U.icon('zap') + done + '/' + list.length; paintSummary(); renderModels(); });
          testAll.disabled = false; testAll.innerHTML = U.icon('zap') + 'Uji model';
          var sm = Health.summary(p);
          UI.toast(p.name + ': ' + sm.ok + ' siap, ' + sm.err + ' error', { error: sm.err > 0 && !sm.ok });
        });
        var showModels = h('button.btn.sm.ghost', { html: U.icon('list'), title: 'Status tiap model' });
        showModels.addEventListener('click', function () { if (modelBox.childNodes.length) modelBox.innerHTML = ''; else renderModels(); });
        var card = h('div.card',
          h('div.prov-card',
            h('div.pi', { text: (p.name || '?').charAt(0).toUpperCase() }),
            h('div.pn', h('b', { text: p.name }), h('span', { text: p.baseUrl + ' · ' + count + ' model' + (p.syncedAt ? ' · disinkron ' + new Date(p.syncedAt).toLocaleDateString('id-ID') : '') }), statusLine),
            testAll, showModels,
            toggle(p.enabled !== false, function (on) { p.enabled = on; Store.saveSettings(); Store.emit('settings', Store.settings); }),
            h('button.btn.sm', { html: U.icon('refresh') + 'Sinkron', title: 'Deteksi ulang model', onclick: async function (e) {
              var b = e.currentTarget; b.disabled = true;
              try {
                p.models = await Providers.listModels(p, await Store.getKey(p.id));
                p.syncedAt = Date.now();
                Store.saveSettings(); Store.emit('settings', Store.settings);
                UI.toast(p.name + ': ' + p.models.length + ' model');
                rerender();
              } catch (err) { UI.toast(err.message, { error: true }); b.disabled = false; }
            } }),
            h('button.btn.sm', { html: U.icon('key'), title: 'API key cadangan (dipakai otomatis saat key utama kena limit / kuota habis)', onclick: function () {
              if (editBox.childNodes.length) { editBox.innerHTML = ''; return; }
              editBox.appendChild(extraKeysForm(p, function () { editBox.innerHTML = ''; }));
            } }),
            h('button.btn.sm', { html: U.icon('edit'), title: 'Edit', onclick: function () {
              if (editBox.childNodes.length) { editBox.innerHTML = ''; return; }
              editBox.appendChild(h('div', { style: { marginTop: '12px' } }, providerForm(p, function () { rerender(); })));
            } }),
            h('button.btn.sm.danger', { html: U.icon('trash'), title: 'Hapus', onclick: async function () {
              var ok = await UI.confirm({ title: 'Hapus provider?', body: p.name + ' dan API key-nya akan dihapus dari Sinai.', ok: 'Hapus', danger: true });
              if (!ok) return;
              Store.settings.providers = Store.settings.providers.filter(function (x) { return x.id !== p.id; });
              ['chat', 'code'].forEach(function (k) { if (Store.settings.defaults[k] && Store.settings.defaults[k].providerId === p.id) Store.settings.defaults[k] = null; });
              await Store.setKey(p.id, '');
              await Store.setExtraKeys(p.id, []);
              Store.saveSettings(); Store.emit('settings', Store.settings);
              rerender();
            } })),
          modelBox, editBox);
        list.appendChild(card);
      });
      body.appendChild(list);

      if (Store.settings.providers.length) {
        body.appendChild(h('div.section', h('h4', { text: 'Model default' }),
          h('div.row',
            h('div.field', h('label', { text: 'Chat' }), modelSelect(Store.settings.defaults.chat, function (v) { Store.setSetting('defaults.chat', v); })),
            U.isMobile() ? null : h('div.field', h('label', { text: 'Code (agen)' }), modelSelect(Store.settings.defaults.code, function (v) { Store.setSetting('defaults.code', v); })))));
        body.appendChild(fallbackSection(rerender));
        body.appendChild((function () {
          var list = ImageGen.candidates();
          var sel = h('select.sel');
          sel.appendChild(h('option', { value: '', text: list.length ? 'Otomatis (terbaik: ' + list[0].name + ')' : 'Belum ada model gambar terdeteksi' }));
          list.forEach(function (c) { sel.appendChild(h('option', { value: c.providerId + '::' + c.modelId, text: c.name })); });
          var cur = Store.settings.imageModel;
          sel.value = cur ? cur.providerId + '::' + cur.modelId : '';
          sel.addEventListener('change', function () {
            if (!sel.value) { Store.setSetting('imageModel', null); return; }
            var i = sel.value.indexOf('::');
            Store.setSetting('imageModel', { providerId: sel.value.slice(0, i), modelId: sel.value.slice(i + 2) });
          });
          var vh = Perception.helper();
          var vsel = modelSelect(Store.settings.visionModel, function (v) { Store.setSetting('visionModel', v); }, { none: vh ? 'Otomatis (' + (vh.info.name || vh.modelId) + ')' : 'Otomatis (belum ada model yang bisa melihat gambar)' });
          var visionBox = h('div', { style: { marginTop: '14px' } }, h('h4', { text: 'Vision bawaan (untuk model yang tidak bisa melihat)' }),
            h('p.hint', { text: 'Saat model yang dipakai tidak mendukung gambar, Sinai menganalisis gambar & frame video lebih dulu: deskripsi lengkap oleh model vision di bawah' + (U.isMac() ? ' + analisis on-device Apple Vision (objek, orang, hewan, teks, barcode, warna) dan klasifikasi suara untuk audio' : '') + '. Pilih model yang murah & cepat (mis. Gemini Flash, GPT-4.1 mini).' }), vsel);
          return h('div.section', visionBox, h('h4', { style: { marginTop: '14px' }, text: 'Model pembuat gambar' }),
            h('p.hint', { text: 'Dipakai saat Anda meminta membuat atau mengedit gambar. Terdeteksi otomatis dari provider: Google AI Studio (gemini-2.5-flash-image / Imagen), OpenAI (gpt-image-1), OpenRouter, xAI, Together/Fireworks (FLUX), dll. Klik "Sinkron" pada provider bila model baru belum muncul.' }), sel);
        })());
        body.appendChild(advancedModel());
      }
    },

    usage: function (body, rerender) {
      body.appendChild(h('div.section', h('p.hint', { html: 'Data di bawah diambil <b>langsung dari API penyedia</b> untuk setiap API key: saldo/kredit, penggunaan & biaya (bila penyedia menyediakannya), batas token dari header respons, serta jumlah token yang dilaporkan penyedia di setiap respons. Tidak ada angka perkiraan.' })));
      if (!Store.settings.providers.length) { body.appendChild(h('div.card', h('p.hint', { style: { margin: 0 }, text: 'Belum ada provider.' }))); return; }
      Store.settings.providers.forEach(function (p) {
        var box = h('div');
        var refresh = h('button.btn.sm', { html: U.icon('refresh') + 'Perbarui' });
        var card = h('div.card.acct', h('div.prov-card', h('div.pi', { text: (p.name || '?').charAt(0).toUpperCase() }),
          h('div.pn', h('b', { text: p.name }), h('span', { text: p.baseUrl })), refresh), box);
        body.appendChild(card);
        function kv(rows) {
          var g = h('div.kv');
          rows.forEach(function (r) { g.appendChild(h('span', { text: r.label })); g.appendChild(h('b' + (r.strong ? '.strong' : ''), { text: r.value })); });
          return g;
        }
        function paint(a) {
          box.innerHTML = '';
          if (!a) { box.appendChild(h('div.status-line', { html: '<span class="spin"></span>Mengambil data dari ' + U.esc(p.name) + '…' })); return; }
          if (a.error) box.appendChild(h('div.acct-err', { html: U.icon('alert') + '<span>' + U.esc(a.error) + '</span>' }));
          if (a.status) box.appendChild(h('div.acct-status' + (a.ok === false ? '.bad' : ''), { text: a.status }));
          if (a.balance.length) box.appendChild(h('div.acct-block', h('h5', { text: 'Saldo / kredit' }), kv(a.balance)));
          if (a.usage.length) box.appendChild(h('div.acct-block', h('h5', { text: 'Penggunaan menurut penyedia' }), kv(a.usage)));
          if (a.details.length) box.appendChild(h('div.acct-block', kv(a.details)));
          if (a.limits && a.limits.rows.length) {
            box.appendChild(h('div.acct-block', h('h5', { text: 'Batas token & permintaan (header respons, ' + Health.ago(a.limits.at) + ', model ' + a.limits.model + ')' }), kv(a.limits.rows)));
          }
          var ks = Health.keysOf(p.id);
          if (ks.length) {
            box.appendChild(h('div.acct-block', h('h5', { text: 'Per API key (utama & cadangan)' }), kv(ks.map(function (k) {
              return { label: 'Key ' + k.tag, value: (k.ok ? 'OK' : k.msg) + ' · hari ini ' + U.fmtTokens(k.today.i) + ' / ' + U.fmtTokens(k.today.o) + ' · 30 hari ' + U.fmtTokens(k.month.i) + ' / ' + U.fmtTokens(k.month.o) + ' · ' + k.month.r + '×', strong: !k.ok };
            }))));
          }
          var lu = Health.localUsage(p.id);
          var P = lu.periods;
          box.appendChild(h('div.acct-block', h('h5', { text: 'Token yang dilaporkan penyedia untuk permintaan dari Sinai' }),
            kv([{ label: 'Hari ini', value: U.fmtTokens(P.today.i) + ' masuk · ' + U.fmtTokens(P.today.o) + ' keluar · ' + P.today.r + ' permintaan' },
              { label: '7 hari', value: U.fmtTokens(P.week.i) + ' masuk · ' + U.fmtTokens(P.week.o) + ' keluar · ' + P.week.r + ' permintaan' },
              { label: '30 hari', value: U.fmtTokens(P.month.i) + ' masuk · ' + U.fmtTokens(P.month.o) + ' keluar · ' + P.month.r + ' permintaan', strong: true }]
              .concat(lu.models.map(function (m) { return { label: '  ' + m.model, value: U.fmtTokens(m.i) + ' / ' + U.fmtTokens(m.o) + ' · ' + m.r + '×' }; })))));
          a.notes.forEach(function (n) { box.appendChild(h('p.hint', { style: { margin: '8px 0 0' }, text: n })); });
          if (p.presetId === 'openai' || p.presetId === 'anthropic') {
            var inp = h('input.inp.mono', { type: 'password', placeholder: p.presetId === 'openai' ? 'Admin key: sk-admin-…' : 'Admin key: sk-ant-admin…', autocomplete: 'off' });
            var save = h('button.btn.sm', { text: 'Simpan admin key' });
            save.addEventListener('click', async function () {
              var v = inp.value.trim();
              if (!v) { inp.focus(); return; }
              await Health.setAdminKey(p.id, v);
              inp.value = '';
              UI.toast(U.isMac() ? 'Admin key disimpan di Keychain' : 'Admin key disimpan (terenkripsi)');
              load();
            });
            var clear = h('button.btn.sm.ghost', { text: 'Hapus' });
            clear.addEventListener('click', async function () { await Health.setAdminKey(p.id, ''); UI.toast('Admin key dihapus'); load(); });
            box.appendChild(h('div.row', { style: { marginTop: '10px', gap: '6px' } }, inp, save, a.needsAdmin ? null : clear));
            box.appendChild(h('p.hint', { style: { margin: '4px 0 0' }, text: U.plat('Admin key hanya dipakai untuk membaca laporan penggunaan/biaya, disimpan di macOS Keychain.') }));
          }
          if (a.source) box.appendChild(h('p.hint.acct-src', { text: 'Sumber: ' + a.source + ' · ' + new Date(a.at).toLocaleTimeString('id-ID') }));
        }
        async function load() {
          refresh.disabled = true;
          paint(null);
          try { paint(await Health.account(p)); } catch (e) { paint({ balance: [], usage: [], details: [], notes: [], error: e.message, at: Date.now() }); }
          refresh.disabled = false;
        }
        refresh.addEventListener('click', load);
        var cached = Health.cachedAccount(p.id);
        if (cached && Date.now() - cached.at < 5 * 60 * 1000) paint(cached); else load();
      });
    },

    intelligence: function (body) {
      body.appendChild(h('div.section',
        h('p.hint', { html: 'Sinai membuat model apa pun berpikir lebih cermat dengan <b>mesin penalaran berlapis</b>: panduan kerja ahli di system prompt, penalaran bawaan model (thinking/reasoning) di level tertinggi, draf → kritik ahli → perbaikan, beberapa draf paralel yang disintesis, serta peninjau independen yang memverifikasi hasil kerja agen coding. Level lebih tinggi = jawaban lebih matang, tetapi lebih lambat dan memakai lebih banyak token.' })));
      ['chat', 'code', 'design'].forEach(function (mode) {
        var cur = Store.settings.intelligence[mode] || 'balanced';
        var grid = h('div.levels');
        Object.keys(Engine.LEVELS).forEach(function (k) {
          var L = Engine.LEVELS[k];
          var card = h('button.level-card' + (k === cur ? '.on' : ''), { html: '<b>' + U.icon({ fast: 'zap', balanced: 'sparkle', deep: 'brain', max: 'rocket' }[k]) + L.label + '</b><span>' + U.esc(L.desc) + '</span>', onclick: function () {
            grid.querySelectorAll('.level-card').forEach(function (c) { c.classList.remove('on'); });
            card.classList.add('on');
            Store.setSetting('intelligence.' + mode, k);
          } });
          grid.appendChild(card);
        });
        body.appendChild(h('div.section', h('h4', { text: 'Level default — ' + ({ chat: 'Chat', code: 'Code', design: 'Design' }[mode]) }), grid));
      });
      body.appendChild(h('div.section',
        h('h4', { text: 'Model pendukung' }),
        h('p.hint', { text: 'Opsional: pakai model yang lebih kuat sebagai peninjau (kritik & verifikasi), dan model yang lebih murah untuk tugas ringan (judul, ringkasan konteks).' }),
        h('div.row',
          h('div.field', h('label', { text: 'Model peninjau' }), modelSelect(Store.settings.reviewer, function (v) { Store.setSetting('reviewer', v); }, { none: 'Sama dengan model utama' })),
          h('div.field', h('label', { text: 'Model utilitas' }), modelSelect(Store.settings.utility, function (v) { Store.setSetting('utility', v); }, { none: 'Sama dengan model utama' })))));
      var drafts = h('select.sel', { style: { width: '120px' } });
      [2, 3, 4].forEach(function (n) { drafts.appendChild(h('option', { value: String(n), text: n + ' draf' })); });
      drafts.value = String(Store.settings.agent.maxDrafts || 3);
      drafts.addEventListener('change', function () { Store.setSetting('agent.maxDrafts', parseInt(drafts.value, 10)); });
      body.appendChild(h('div.section',
        optRow('Jumlah draf paralel (level Maksimal)', 'Lebih banyak draf = sudut pandang lebih beragam untuk disintesis.', drafts),
        optRow('Verifikasi otomatis hasil coding', 'Di level Mendalam/Maksimal, peninjau independen memeriksa perubahan dan meminta agen memperbaiki masalah.', toggle(Store.settings.agent.autoVerify !== false, function (v) { Store.setSetting('agent.autoVerify', v); }))));
    },

    agent: function (body) {
      body.appendChild(h('div.section', h('h4', { text: 'Mode izin default' }),
        h('p.hint', { text: 'Mengatur kapan agen meminta persetujuan Anda. "Otomatis penuh" tidak pernah meminta klik: perintah berisiko-sedang (pkill, git reset, dll.) langsung jalan, sedangkan yang bisa merusak komputer (rm -rf folder sistem/home, format disk, sudo/password, shutdown) dilewati otomatis dan agen mencari cara lain.' }),
        seg([['ask', 'Tanya dulu'], ['edits', 'Edit otomatis'], ['auto', 'Otomatis penuh']], Store.settings.permission, function (v) { Store.setSetting('permission', v); })));
      var ag = Store.settings.agent;
      body.appendChild(h('div.section', h('h4', { text: 'Tanpa putus' }),
        optRow('Lanjut otomatis', 'Jawaban yang terpotong batas token dilanjutkan sendiri, rencana kerja yang belum selesai diteruskan, dan batas langkah ditambah otomatis.', toggle(ag.autoContinue !== false, function (v) { Store.setSetting('agent.autoContinue', v); })),
        optRow('Pulih otomatis dari error', 'Saat kena batas rate / kuota habis / server error: ganti API key cadangan, lalu model cadangan, lalu tunggu & coba lagi — tanpa tombol "Coba lagi".', toggle(ag.autoRecover !== false, function (v) { Store.setSetting('agent.autoRecover', v); })),
        optRow('Mode hemat token', 'Alat & panduan hanya dikirim saat dibutuhkan, riwayat lama dipadatkan, file dibaca per halaman, langkah rutin memakai penalaran lebih ringan. Kualitas dijaga: AI bisa memuat alat tambahan kapan saja.', toggle(ag.lean !== false, function (v) { Store.setSetting('agent.lean', v); })),
        optRow('Anggaran konteks coding (token)', 'Sesi coding diringkas otomatis di atas batas ini (walau model punya konteks 1 juta). Lebih kecil = jauh lebih hemat token per langkah.', (function () {
          var sel = h('select.sel', { style: { width: '150px' } });
          [[48000, '48k (paling hemat)'], [64000, '64k (disarankan)'], [100000, '100k'], [160000, '160k'], [256000, '256k'], [1000000, 'Penuh (boros)']].forEach(function (o) { sel.appendChild(h('option', { value: String(o[0]), text: o[1] })); });
          sel.value = String(ag.contextBudget || 64000);
          sel.addEventListener('change', function () { Store.setSetting('agent.budgetChosen', true); Store.setSetting('agent.contextBudget', parseInt(sel.value, 10)); });
          return sel;
        })()),
        optRow('Pemolesan desain otomatis', 'Mode Design: setelah artifact web/UI/SVG dibuat, AI meninjaunya sebagai art director lalu menyempurnakannya sekali.', toggle(ag.designPolish !== false, function (v) { Store.setSetting('agent.designPolish', v); })),
        optRow('Konfirmasi pesan keluar', 'Tetap minta konfirmasi sebelum mengirim email/iMessage walau dalam mode otomatis penuh.', toggle(!!ag.confirmOutbound, function (v) { Store.setSetting('agent.confirmOutbound', v); }))));
      var timeout = h('input.inp', { type: 'number', min: '10', max: '1800', value: String(Store.settings.agent.commandTimeout || 180), style: { width: '110px' } });
      timeout.addEventListener('change', function () { Store.setSetting('agent.commandTimeout', Math.max(10, Math.min(1800, parseInt(timeout.value, 10) || 180))); });
      var steps = h('input.inp', { type: 'number', min: '5', max: '500', value: String(Store.settings.agent.maxSteps || 80), style: { width: '110px' } });
      steps.addEventListener('change', function () { Store.setSetting('agent.maxSteps', Math.max(5, Math.min(500, parseInt(steps.value, 10) || 80))); });
      body.appendChild(h('div.section',
        optRow('Batas waktu perintah (detik)', 'Perintah yang melewati batas ini dihentikan otomatis.', timeout),
        optRow('Langkah agen per putaran', 'Dengan "Lanjut otomatis" agen menambah putaran sendiri (maks. 10×) sampai tugas selesai.', steps),
        optRow('Akses web default', 'Izinkan pencarian web dan membaca halaman (bisa diubah per percakapan).', toggle(Store.settings.web !== false, function (v) { Store.setSetting('web', v); })),
        optRow('Buka kanvas otomatis', 'Tampilkan artifact di kanvas saat AI mulai membuatnya.', toggle(Store.settings.autoOpenCanvas !== false, function (v) { Store.setSetting('autoOpenCanvas', v); })),
        optRow('Kirim dengan Enter', U.kbd('Jika mati, gunakan ⌘↵ untuk mengirim.'), toggle(Store.settings.sendWithEnter !== false, function (v) { Store.setSetting('sendWithEnter', v); }))));
      body.appendChild(h('div.section', h('h4', { text: 'Instruksi proyek' }),
        h('p.hint', { html: 'Letakkan file <code>SINAI.md</code> (atau <code>AGENTS.md</code> / <code>CLAUDE.md</code>) di root proyek untuk memberi agen konteks dan aturan proyek. Ketik <code>/init</code> di mode Code untuk membuatnya otomatis.' })));
    },

    appearance: function (body) {
      var a = Store.settings.appearance;
      function set(k, v) { a[k] = v; Store.saveSettings(); UI.applyAppearance(); }
      body.appendChild(h('div.section',
        optRow('Tema', null, seg([['system', 'Sistem'], ['light', 'Terang'], ['dark', 'Gelap']], a.theme || 'system', function (v) { set('theme', v); })),
        optRow('Performa', 'Otomatis memakai mode ringan di perangkat dengan CPU/RAM kecil: tanpa blur, animasi minimal, daftar pesan panjang dirender seperlunya. Fitur tetap lengkap.', seg([['auto', 'Otomatis'], ['lite', 'Ringan'], ['full', 'Penuh']], a.perf || 'auto', function (v) { set('perf', v); })),
        U.feature('glass') ? optRow('Efek kaca', 'Liquid Glass memakai blur native macOS (ringan). Solid untuk performa maksimal / hemat baterai.', seg([['glass', 'Liquid Glass'], ['clear', 'Kaca gelap'], ['solid', 'Solid']], a.glass || 'glass', function (v) { set('glass', v); })) : null,
        optRow('Ukuran teks', null, seg([[13, 'Kecil'], [14, 'Normal'], [15, 'Besar'], [16, 'Lebih besar']], a.fontSize || 14, function (v) { set('fontSize', v); }))));
      var colors = ['#6e6bff', '#d4a537', '#3a36a8', '#3f8cff', '#14b8a6', '#22c55e', '#ef4444', '#ec4899', '#a855f7'];
      var row = h('div.accent-row');
      colors.forEach(function (c) {
        var d = h('button.accent-dot' + (c === a.accent ? '.on' : ''), { style: { background: c }, onclick: function () {
          row.querySelectorAll('.accent-dot').forEach(function (x) { x.classList.remove('on'); });
          d.classList.add('on');
          set('accent', c);
        } });
        row.appendChild(d);
      });
      body.appendChild(h('div.section', optRow('Warna aksen', null, row)));
    },

    personal: function (body) {
      var p = Store.settings.profile;
      function field(label, key, ph, multi) {
        var inp = multi ? h('textarea.ta', { placeholder: ph, value: p[key] || '' }) : h('input.inp', { placeholder: ph, value: p[key] || '' });
        inp.addEventListener('input', U.debounce(function () { p[key] = inp.value; Store.saveSettings(); }, 400));
        return h('div.field', h('label', { text: label }), inp);
      }
      body.appendChild(h('div.section', h('p.hint', { text: 'Informasi ini disertakan di setiap percakapan agar jawaban lebih sesuai dengan Anda.' }),
        field('Nama panggilan', 'name', 'mis. Gadtan'),
        field('Tentang Anda', 'about', 'Pekerjaan, keahlian, proyek yang sedang dikerjakan, stack favorit…', true),
        field('Gaya jawaban yang Anda inginkan', 'style', 'mis. Jawab dalam Bahasa Indonesia santai, langsung ke inti, sertakan contoh kode TypeScript…', true)));

      // custom styles
      var styles = Store.settings.customStyles = Store.settings.customStyles || [];
      var sbox = h('div');
      function renderStyles() {
        sbox.innerHTML = '';
        styles.forEach(function (st, i) {
          sbox.appendChild(h('div.card', h('div.row', h('b', { style: { flex: '1' }, text: st.name }),
            h('button.btn.sm.danger', { html: U.icon('trash'), onclick: function () { styles.splice(i, 1); Store.saveSettings(); renderStyles(); } })),
            h('div.hint', { style: { margin: '4px 0 0' }, text: st.instructions })));
        });
      }
      renderStyles();
      var sn = h('input.inp', { placeholder: 'Nama gaya, mis. "Mentor santai"' });
      var si = h('textarea.ta', { placeholder: 'Instruksi gaya: nada, panjang, format, contoh kalimat…' });
      body.appendChild(h('div.section', h('h4', { text: 'Gaya jawaban kustom' }), h('p.hint', { text: 'Gaya muncul di tombol ✎ pada kolom input (Chat & Design).' }), sbox,
        h('div.field', sn), h('div.field', si),
        h('button.btn.sm', { html: U.icon('plus') + 'Tambah gaya', onclick: function () {
          if (!sn.value.trim() || !si.value.trim()) return;
          styles.push({ id: U.uid('style_'), name: sn.value.trim(), instructions: si.value.trim() });
          sn.value = ''; si.value = '';
          Store.saveSettings(); renderStyles();
        } })));

      // memory
      var mem = Store.settings.memory = Store.settings.memory || { enabled: true, items: [] };
      var mbox = h('div');
      function renderMem() {
        mbox.innerHTML = '';
        if (!mem.items.length) mbox.appendChild(h('div.hint', { text: 'Belum ada memori. Sinai akan menyimpan hal penting yang Anda sampaikan (atau minta "ingat bahwa …").' }));
        mem.items.slice().reverse().forEach(function (m) {
          mbox.appendChild(h('div.mem-item', h('span', { text: m.text }), h('button.icon-btn', { html: U.icon('x'), title: 'Hapus', onclick: function () {
            mem.items = mem.items.filter(function (x) { return x.id !== m.id; }); Store.saveSettings(); renderMem();
          } })));
        });
      }
      renderMem();
      body.appendChild(h('div.section', h('h4', { text: 'Memori' }),
        optRow('Gunakan memori', 'Sinai mengingat preferensi & konteks Anda antar percakapan (Chat & Design).', toggle(mem.enabled !== false, function (v) { mem.enabled = v; Store.saveSettings(); })),
        mbox,
        mem.items.length ? h('button.btn.sm.danger', { style: { marginTop: '8px' }, text: 'Hapus semua memori', onclick: function () { mem.items = []; Store.saveSettings(); renderMem(); } }) : null));
    },

    automation: function (body, rerender) {
      body.appendChild(h('div.section', h('h4', { text: U.isMac() ? 'Integrasi macOS' : 'Alat tambahan' }),
        h('p.hint', { html: U.feature('integrations')
          ? 'Beri agen akses ke app macOS sebagai alat: <b>Kalender, Pengingat, Kontak, Mail/iMessage, Shortcuts</b>, notifikasi, konversi gambar & PDF. Setiap tindakan tetap meminta izin Anda; mengirim pesan keluar selalu dikonfirmasi.'
          : 'Beri agen alat tambahan: <b>notifikasi, deteksi dev server, edit PDF (gabung/pisah/watermark), konversi gambar</b>. Setiap tindakan tetap meminta izin Anda. (Akses Kalender, Kontak, Mail & Shortcuts hanya tersedia di Sinai untuk macOS.)' }),
        optRow('Aktifkan alat integrasi', 'Muncul sebagai alat untuk agen di Chat & Code.', toggle(Store.settings.integrations !== false, function (v) { Store.setSetting('integrations', v); })),
        optRow('Beri tahu saat tugas selesai', U.plat('Notifikasi macOS') + ' saat tugas panjang selesai & jendela tidak aktif.', toggle(Store.settings.notifyOnFinish !== false, function (v) { Store.setSetting('notifyOnFinish', v); if (v) Native.call('notify.show', { title: 'Sinai', body: 'Notifikasi aktif.' }); }))));

      body.appendChild(h('div.section', h('h4', { text: 'Cadangkan data' }),
        optRow('Backup percakapan & pengaturan', 'Simpan semua percakapan, proyek, dan pengaturan sebagai satu file .zip (API key tidak disertakan).',
          h('button.btn.sm', { html: U.icon('download') + 'Buat backup', onclick: function (e) {
            var b = e.currentTarget; b.disabled = true;
            Native.call('backup.create', {}).then(function (p) { if (p) UI.toast('Backup disimpan: ' + U.basename(p)); b.disabled = false; }).catch(function (err) { UI.toast(err.message, { error: true }); b.disabled = false; });
          } }))));

      // Watch folders
      var wfBox = h('div');
      function renderWatch() {
        wfBox.innerHTML = '';
        var list = Store.settings.watchFolders || [];
        if (!list.length) wfBox.appendChild(h('div.hint', { text: 'Belum ada folder yang dipantau.' }));
        list.forEach(function (w) {
          wfBox.appendChild(h('div.card', h('div.mcp-row',
            h('span.dot' + (w.enabled !== false ? '.ok' : '')),
            h('div.pn', h('b', { text: U.basename(w.path) }), h('span', { text: U.tildify(w.path, Store.info.home) + ' · ' + (w.mode === 'code' ? 'Code' : 'Chat') + (w.instruction ? ' · "' + w.instruction.slice(0, 40) + '"' : '') })),
            toggle(w.enabled !== false, function (v) { w.enabled = v; Store.saveSettings(); App.Automation.restartWatch(w); }),
            h('button.btn.sm.danger', { html: U.icon('trash'), onclick: function () {
              Native.call('watch.stop', { id: w.id });
              Store.settings.watchFolders = Store.settings.watchFolders.filter(function (x) { return x.id !== w.id; });
              Store.saveSettings(); renderWatch();
            } }))));
        });
      }
      renderWatch();
      body.appendChild(h('div.section', h('h4', { text: 'Pantau folder (watch folder)' }),
        h('p.hint', { text: 'Saat file baru muncul di folder ini, Sinai membuka percakapan baru dengan file itu terlampir dan instruksi yang Anda tetapkan — Anda tinggal meninjau lalu mengirim.' }),
        wfBox,
        h('button.btn.sm', { html: U.icon('plus') + 'Tambah folder pantau', onclick: async function () {
          var p = await Native.call('dialog.openFolder', { message: 'Pilih folder untuk dipantau' });
          if (!p) return;
          var instr = await UI.prompt({ title: 'Instruksi otomatis (opsional)', placeholder: 'mis. Ringkas isi file ini', ok: 'Simpan' });
          var mode = await new Promise(function (resolve) {
            UI.menu(body.querySelector('h4'), [{ label: 'Mode Chat', icon: 'chat', onClick: function () { resolve('chat'); } }, { label: 'Mode Code (folder sbg proyek)', icon: 'code', onClick: function () { resolve('code'); } }], {});
            setTimeout(function () { resolve('chat'); }, 15000);
          });
          var w = { id: U.uid('wf_'), path: p, instruction: instr || '', mode: mode, enabled: true };
          Store.settings.watchFolders = (Store.settings.watchFolders || []).concat([w]);
          Store.saveSettings(); App.Automation.restartWatch(w); renderWatch();
        } })));

      // Webhook
      var wh = Store.settings.webhook = Store.settings.webhook || { enabled: false, port: 8765, token: '' };
      var tokenInp = h('input.inp.mono', { value: wh.token, placeholder: 'token rahasia (wajib)' });
      var portInp = h('input.inp', { type: 'number', value: String(wh.port || 8765), style: { width: '110px' } });
      var promptInp = h('input.inp', { value: wh.prompt || '', placeholder: 'Teks yang ditambahkan di depan payload (opsional)' });
      function saveWh(restart) {
        wh.token = tokenInp.value.trim(); wh.port = parseInt(portInp.value, 10) || 8765; wh.prompt = promptInp.value;
        Store.saveSettings();
        if (restart) { Native.call('webhook.stop'); if (wh.enabled && wh.token) Native.call('webhook.start', { port: wh.port, secret: wh.token }).then(function () { UI.toast('Webhook aktif di 127.0.0.1:' + wh.port); }).catch(function (e) { UI.toast(e.message, { error: true }); }); }
      }
      tokenInp.addEventListener('change', function () { saveWh(wh.enabled); });
      portInp.addEventListener('change', function () { saveWh(wh.enabled); });
      promptInp.addEventListener('input', U.debounce(function () { saveWh(false); }, 400));
      body.appendChild(h('div.section', h('h4', { text: 'Webhook lokal' }),
        h('p.hint', { html: 'Terima pemicu dari skrip/alat lokal lewat <code>POST http://127.0.0.1:&lt;port&gt;</code> dengan header <code>X-Sinai-Token</code>. Hanya bisa diakses dari komputer ini. Isi body menjadi pesan baru untuk Anda tinjau.' }),
        optRow('Aktifkan webhook', 'Perlu token rahasia.', toggle(wh.enabled, function (v) { wh.enabled = v; if (v && !tokenInp.value.trim()) { tokenInp.value = U.uid('tok_') + Math.random().toString(36).slice(2, 10); } saveWh(true); })),
        h('div.row', h('div.field', h('label', { text: 'Token (X-Sinai-Token)' }), tokenInp), h('div.field', h('label', { text: 'Port' }), portInp)),
        h('div.field', h('label', { text: 'Awalan pesan' }), promptInp)));
    },

    connectors: function (body, rerender) {
      Connectors.render(body, rerender);
      if (!U.isMobile()) body.appendChild(h('div.row', { style: { gap: '8px', marginTop: '14px' } },
        h('button.btn.sm.ghost', { html: U.icon('download') + 'Impor dari Claude Desktop', onclick: async function () {
          try { var n = await MCP.importClaudeDesktop(); UI.toast(n ? n + ' konektor diimpor' : 'Tidak ada konektor baru'); rerender(); }
          catch (e) { UI.toast('Konfigurasi Claude Desktop tidak ditemukan', { error: true }); }
        } })));
    },

    sinerli: function (body, rerender) {
      var box = h('div.section', h('h4', { text: 'Akun Sinerli' }),
        h('p.hint', { html: 'Sinai adalah aplikasinya, <b>Sinerli</b> adalah webnya (akun, paket, produk, gateway AI). Masuk memakai akun Sinerli lewat browser; Sinai tidak pernah melihat password Anda.' }));
      var info = h('div', { style: { margin: '8px 0' }, text: 'Memeriksa…' });
      box.appendChild(info);
      var actions = h('div.row', { style: { gap: '8px', flexWrap: 'wrap' } });
      box.appendChild(actions);
      body.appendChild(box);
      Sinerli.me().then(function (u) {
        info.textContent = '';
        if (u) {
          info.appendChild(h('div', { html: '<b>' + U.esc(u.name || u.email || 'Pengguna Sinerli') + '</b>' + (u.email ? ' · ' + U.esc(u.email) : '') }));
          if (u.plan) info.appendChild(h('div.hint', { text: 'Paket: ' + u.plan.label }));
          var perms = Object.keys(u.permissions || {}).filter(function (k) { return u.permissions[k]; });
          if (perms.length) info.appendChild(h('div.hint', { text: 'Izin Sinai: ' + perms.join(', ') }));
          actions.appendChild(h('button.btn.sm', { text: 'Segarkan', onclick: function () { Sinerli.me(true).then(rerender); } }));
          if (window.Updater && Updater.check) actions.appendChild(h('button.btn.sm', { text: 'Cek pembaruan', onclick: function () {
            Updater.check({ manual: true }).then(function (r) {
              if (Updater.locked) return;
              var cur = Store.info.version || '';
              if (r && r.latest && r.latest.version !== cur && r.latest.file) {
                UI.confirm({ title: 'Sinai ' + r.latest.version + ' tersedia', body: (r.latest.notes || '').slice(0, 600) || 'Pembaruan baru siap dipasang.', ok: 'Perbarui sekarang' }).then(function (ok) {
                  if (ok) { UI.toast('Mengunduh pembaruan…', { icon: 'download' }); Updater.install().catch(function (e) { UI.toast(e.message, { error: true }); }); }
                });
              } else UI.toast('Sinai sudah versi terbaru' + (cur ? ' (' + cur + ')' : ''));
            }, function (e) { UI.toast('Tidak bisa terhubung ke Sinerli: ' + e.message, { error: true }); });
          } }));
          actions.appendChild(h('button.btn.sm', { text: 'Salin token rilis', title: 'Untuk admin: menerbitkan rilis Sinai semua platform ke Sinerli dengan scripts/publish-sinerli.mjs (berlaku ±1 jam)', onclick: async function () {
            var t = await Sinerli.token();
            if (!t) { UI.toast('Masuk dengan Sinerli dulu', { error: true }); return; }
            await Native.call('app.copy', { text: t });
            UI.toast('Token disalin. Jalankan: SINERLI_TOKEN=… node scripts/publish-sinerli.mjs', { icon: 'copy' });
          } }));
          actions.appendChild(h('button.btn.sm.ghost', { text: 'Keluar', onclick: async function () { await Sinerli.logout(); if (modal && !modal.closed) modal.close(); Settings.loginGate(); } }));
        } else {
          info.textContent = 'Belum masuk.';
          actions.appendChild(h('button.btn.sm.primary', { text: 'Masuk dengan Sinerli', onclick: async function (e) {
            e.target.disabled = true;
            try { await Sinerli.login(); UI.toast('Terhubung ke Sinerli'); } catch (err) { UI.toast(err.message, { error: true }); }
            rerender();
          } }));
        }
      }).catch(function (e) { info.textContent = e.message; });
      var baseInp = h('input', { type: 'text', value: Store.settings.sinerliBase || Sinerli.DEFAULT_BASE, onchange: function (e) { Store.setSetting('sinerliBase', e.target.value.trim().replace(/\/+$/, '') || Sinerli.DEFAULT_BASE); } });
      body.appendChild(h('div.section', h('h4', { text: 'Alamat server Sinerli' }),
        h('p.hint', { html: 'Produksi: <code>https://sinerli.com</code>. Uji lokal (XAMPP): <code>http://localhost/Sinerli</code>. Ganti alamat → masuk ulang.' }),
        h('div.field', baseInp),
        h('button.btn.sm', { text: 'Tes koneksi', onclick: async function () {
          try { var r = await Sinerli.health(); UI.toast(r ? 'Sinerli AI: ' + r.status : 'Server tidak merespons', { error: !r }); } catch (e) { UI.toast(e.message, { error: true }); }
        } })));
      var links = h('div.section', h('h4', { text: 'Buka di web Sinerli' }), h('p.hint', { text: 'Pengelolaan akun, paket, dan API key dilakukan di web.' }));
      Sinerli.links.forEach(function (l) { links.appendChild(h('div', h('button.btn.sm.ghost', { text: l[0], onclick: function () { Sinerli.open(l[1]); } }))); });
      body.appendChild(links);
      body.appendChild(h('div.section', h('h4', { text: 'Model AI Sinerli' }),
        h('p.hint', { html: 'Setelah masuk, key <b>Sinerli</b> dibuat otomatis untuk akun Anda dan dipasang sebagai provider (kuota mengikuti paket). Racikan Model AI tetap lewat API key manual.' }),
        h('button.btn.sm.primary', { text: 'Sambungkan model otomatis', onclick: async function (e) {
          e.target.disabled = true;
          try { var r = await Sinerli.connectAI(); UI.toast('Model Sinerli tersambung (' + r.models + ' model)'); Chat.refreshComposer(); } catch (err) { UI.toast(err.message, { error: true }); }
          e.target.disabled = false;
        } }),
        h('button.btn.sm.ghost', { text: 'Buka Provider & Model', onclick: function () { Settings.open('providers'); } })));
    },

    devices: function (body, rerender) {
      Remote.section(body, rerender);
      var f = function () { if (modal && !modal.closed && body.isConnected) rerender(); };
      Sync.on('devices', U.debounce(f, 800));
    },

    repair: function (body, rerender) {
      var on = Store.settings.selfRepair !== false;
      body.appendChild(h('div.section',
        h('p.hint', { html: '<b>Lapis 1 — belajar dari error (otomatis).</b> Saat sebuah langkah gagal lalu berhasil diatasi, Sinai menyimpan pelajarannya dan memakainya di permintaan berikutnya, jadi error yang sama tidak terulang dan token tidak terbuang.' }),
        h('label.row', { style: { gap: '8px' } }, h('input', { type: 'checkbox', checked: on, onchange: function (e) { Store.setSetting('selfRepair', e.target.checked); } }), h('span', { text: 'Aktifkan pembelajaran & perbaikan otomatis' }))));
      var ls = Repair.lessons();
      var lbox = h('div.section', h('h4', { text: 'Pelajaran tersimpan (' + ls.length + ')' }));
      if (!ls.length) lbox.appendChild(h('p.hint', { text: 'Belum ada. Pelajaran muncul otomatis setelah agen berhasil mengatasi error.' }));
      ls.forEach(function (l) {
        lbox.appendChild(h('div.row', { style: { gap: '8px', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--stroke-2)' } },
          h('span.chip', { text: l.scope }), h('span', { style: { flex: '1' }, text: l.text + (l.hits > 1 ? '  (' + l.hits + '×)' : '') }),
          h('button.icon-btn', { title: 'Hapus pelajaran', html: U.icon('trash'), onclick: function () { Repair.remove(l.id); rerender(); } })));
      });
      lbox.appendChild(h('div.row', { style: { gap: '8px', marginTop: '8px' } },
        h('button.btn.sm', { html: U.icon('plus') + 'Tambah manual', onclick: async function () {
          var t = await UI.prompt({ title: 'Pelajaran baru', body: 'Format: lingkup: isi (mis. "canva: selalu commit setelah edit")', placeholder: 'shell: kutip argumen yang berisi [ ]' });
          if (!t) return; var m = t.match(/^\s*([\w:.-]+)\s*:\s*(.+)$/);
          Repair.add({ scope: m ? m[1] : 'general', text: m ? m[2] : t, source: 'manual' }); rerender();
        } }),
        ls.length ? h('button.btn.sm.ghost', { html: U.icon('trash') + 'Hapus semua', onclick: async function () { if (await UI.confirm({ title: 'Hapus semua pelajaran?', ok: 'Hapus', danger: true })) { Repair.clear(); rerender(); } } }) : null));
      body.appendChild(lbox);
      var errs = Repair.openErrors();
      var ebox = h('div.section', h('h4', { text: 'Lapis 2 — error aplikasi Sinai (' + errs.length + ' belum diperbaiki)' }),
        h('p.hint', { html: '"Perbaiki Sinai" membuka mode Code di folder source Sinai dengan log error terisi. Agen mencari penyebab, memperbaiki kode, dan menjalankan build; Anda meninjau perubahannya sebelum memasang build baru.' }));
      errs.slice(0, 20).forEach(function (e) {
        ebox.appendChild(h('div', { style: { padding: '6px 0', borderBottom: '1px solid var(--stroke-2)', fontSize: '12.5px' } },
          h('code', { text: e.message }), h('div.hint', { text: e.kind + ' · ' + e.count + '× · terakhir ' + new Date(e.last).toLocaleString() })));
      });
      ebox.appendChild(h('div.row', { style: { gap: '8px', marginTop: '10px', flexWrap: 'wrap' } },
        h('button.btn.sm.primary', { html: U.icon('sparkle') + 'Perbaiki Sinai', onclick: async function () {
          var extra = errs.length ? '' : await UI.prompt({ title: 'Apa yang salah?', body: 'Tidak ada error tercatat. Jelaskan masalah yang Anda alami.', placeholder: 'mis. tombol ekspor PDF tidak bereaksi' });
          if (!errs.length && !extra) return;
          if (modal && !modal.closed) modal.close();
          Repair.fixApp(extra || '');
        } }),
        h('button.btn.sm', { html: U.icon('folder') + 'Folder source: ' + (Store.settings.selfRepairSource ? U.basename(Store.settings.selfRepairSource) : 'belum dipilih'), onclick: async function () { await Repair.sourceDir(true); rerender(); } }),
        errs.length ? h('button.btn.sm.ghost', { html: U.icon('check') + 'Tandai selesai', onclick: function () { Repair.markFixed(); rerender(); } }) : null));
      body.appendChild(ebox);
    },
    skills: function (body, rerender) {
      body.appendChild(h('div.section', h('p.hint', { html: 'Skill adalah instruksi siap pakai dalam file <b>SKILL.md</b> (format sama dengan skill Claude). AI hanya melihat nama + deskripsinya, lalu memuat isi lengkap saat tugas cocok — jadi hemat token. Jalankan langsung dengan <code>/nama-skill</code> di kolom chat, atau minta "buat skill untuk …" di chat.' }),
        h('div.row', { style: { gap: '8px', flexWrap: 'wrap' } },
          h('button.btn.sm.primary', { html: U.icon('sparkle') + 'Buat dengan AI', onclick: function () { skillFromAI(rerender); } }),
          h('button.btn.sm', { html: U.icon('plus') + 'Tulis manual', onclick: function () { skillEditor(Skills.TEMPLATE, null, rerender); } }),
          h('button.btn.sm', { html: U.icon('download') + 'Impor .md', onclick: async function () {
            var paths = await Native.call('dialog.openFiles', { multiple: true });
            if (!paths || !paths.length) return;
            for (var i = 0; i < paths.length; i++) {
              var p = typeof paths[i] === 'string' ? paths[i] : paths[i].path;
              try { var r = await Native.call('fs.read', { path: p, maxBytes: 400000 }); skillEditor(r.content, null, rerender, U.basename(p).replace(/\.md$/i, '')); } catch (e) { UI.toast(e.message, { error: true }); }
            }
          } }),
          h('button.btn.sm.ghost', { html: U.icon('folder') + 'Buka folder', onclick: function () { Native.call('fs.mkdir', { path: Skills.userDir() }).then(function () { Native.call('app.reveal', { path: Skills.userDir() }); }); } }))));
      var box = h('div');
      body.appendChild(box);
      box.appendChild(h('div.status-line', { html: '<span class="spin"></span>Memuat skill…' }));
      Skills.load(Chat.current() && Chat.current().workspace).then(function (list) {
        box.innerHTML = '';
        var SRC = { user: 'Milik Anda', project: 'Proyek', claude: 'Dari Claude', builtin: 'Bawaan' };
        var cats = ['Semua'].concat(Skills.CATEGORIES.filter(function (c) { return list.some(function (sk) { return Skills.categoryOf(sk) === c; }); }));
        list.forEach(function (sk) { var c = Skills.categoryOf(sk); if (cats.indexOf(c) < 0) cats.push(c); });
        var chips = h('div.cx-cats');
        var grid = h('div');
        box.appendChild(chips); box.appendChild(grid);
        function paint() {
          chips.innerHTML = '';
          cats.forEach(function (c) {
            var n = c === 'Semua' ? list.length : list.filter(function (sk) { return Skills.categoryOf(sk) === c; }).length;
            chips.appendChild(h('button.chip' + (skillCat === c ? '.on' : ''), { text: c + ' ' + n, onclick: function () { skillCat = c; paint(); } }));
          });
          grid.innerHTML = '';
          var groups = skillCat === 'Semua' ? cats.slice(1) : [skillCat];
          groups.forEach(function (c) {
            var items = list.filter(function (sk) { return Skills.categoryOf(sk) === c; });
            if (!items.length) return;
            grid.appendChild(h('h4.cx-sub', { text: c }));
            var g = h('div.skill-grid');
            items.forEach(function (sk) {
              g.appendChild(h('div.card.skill-card' + (sk.enabled ? '' : '.off'),
                h('div.mcp-row',
                  h('div.skill-ic', { html: U.icon('bulb') }),
                  h('div.pn', h('b', { text: '/' + sk.name }), h('span', { text: SRC[sk.source] || sk.source })),
                  toggle(sk.enabled, function (v) { Skills.setEnabled(sk.name, v); })),
                h('p.hint', { style: { margin: '6px 0 8px' }, text: sk.description || '(tanpa deskripsi)' }),
                h('div.row', { style: { gap: '6px' } },
                  h('button.btn.sm.primary', { html: U.icon('play') + 'Gunakan', title: 'Masukkan /' + sk.name + ' ke kolom chat', onclick: function () {
                    if (!sk.enabled) Skills.setEnabled(sk.name, true);
                    if (modal) modal.close();
                    Chat.setInput('/' + sk.name + ' ');
                    Chat.focusInput();
                  } }),
                  h('button.btn.sm', { html: U.icon('edit') + (sk.source === 'user' ? 'Edit' : 'Salin & edit'), onclick: function () {
                    var md = '---\nname: ' + sk.name + (sk.source === 'user' ? '' : '-saya') + '\ndescription: ' + sk.description.replace(/\n/g, ' ') + '\ncategory: ' + Skills.categoryOf(sk) + '\n---\n\n' + sk.body;
                    skillEditor(md, sk.source === 'user' ? sk.name : null, rerender);
                  } }),
                  sk.source === 'user' ? h('button.btn.sm.danger', { html: U.icon('trash'), title: 'Hapus', onclick: async function () {
                    if (!(await UI.confirm({ title: 'Hapus skill /' + sk.name + '?', body: 'Folder skill dipindahkan ke Trash.', ok: 'Hapus', danger: true }))) return;
                    await Skills.remove(sk.name); rerender();
                  } }) : null)));
            });
            grid.appendChild(g);
          });
        }
        paint();
      });
    },

    templates: function (body, rerender) {
      body.appendChild(h('div.section', h('p.hint', { html: 'Simpan desain Anda sebagai template: <b>PowerPoint</b> (.pptx/.potx) & <b>Word</b> (.docx/.dotx) dipakai langsung — slide/dokumen baru ditulis ke dalam master, layout, logo, header & gaya template itu. <b>PDF, gambar, HTML/CSS, atau panduan gaya (.md)</b> menjadi acuan warna, font & gaya untuk PDF, UI/web, dan gambar. Aktifkan lewat tombol <b>Template</b> di kolom chat.' }),
        h('div.row', { style: { gap: '8px', flexWrap: 'wrap' } },
          h('button.btn.sm.primary', { html: U.icon('download') + 'Impor file template', onclick: async function (e) {
            var btn = e.currentTarget;
            var paths = await Native.call('dialog.openFiles', { multiple: true });
            if (!paths || !paths.length) return;
            btn.disabled = true;
            for (var i = 0; i < paths.length; i++) {
              var p = typeof paths[i] === 'string' ? paths[i] : paths[i].path;
              btn.innerHTML = '<span class="spin"></span>Menganalisis ' + U.esc(U.basename(p)) + '…';
              try { var t = await Templates.importFile(p); UI.toast('Template "' + t.name + '" ditambahkan'); } catch (err) { UI.toast(U.basename(p) + ': ' + err.message, { error: true }); }
            }
            rerender();
          } }),
          h('button.btn.sm', { html: U.icon('plus') + 'Buat dari panduan gaya', onclick: function () { templateEditor(null, rerender); } }))));
      var l = Templates.list();
      if (!l.length) { body.appendChild(h('div.card', h('p.hint', { style: { margin: 0 }, text: 'Belum ada template. Impor file desain perusahaan/brand Anda (mis. template PPT kantor, kop surat Word, brand guideline PDF).' }))); return; }
      var grid = h('div.tpl-grid');
      var cur = Chat.current() && Chat.current().templateId;
      l.forEach(function (t) {
        var sw = h('div.tpl-sw');
        if (t.colors) ['bg', 'surface', 'accent', 'accent2', 'text'].forEach(function (k) { if (t.colors[k]) sw.appendChild(h('span', { style: { background: '#' + t.colors[k] }, title: k + ' #' + t.colors[k] })); });
        grid.appendChild(h('div.card.tpl-card' + (cur === t.id ? '.on' : ''),
          h('div.tpl-thumb', t.thumb ? h('img', { src: t.thumb }) : h('span', { html: U.icon('layers') })),
          h('div.tpl-meta', h('b', { text: t.name }), h('span', { text: (Templates.KIND_LABEL[t.kind] || t.kind) + ' · .' + t.ext + (t.layouts ? ' · ' + t.layouts.length + ' layout' : '') + (t.fonts && t.fonts.head ? ' · ' + t.fonts.head : '') })),
          sw,
          h('div.row', { style: { gap: '6px', marginTop: '8px' } },
            h('button.btn.sm.primary', { html: U.icon('check') + (cur === t.id ? 'Aktif' : 'Pakai'), onclick: function () {
              var c = Chat.current(); if (!c) return;
              c.templateId = cur === t.id ? null : t.id; Store.saveConv(c); Chat.renderTemplateBtn(); rerender();
            } }),
            h('button.btn.sm', { html: U.icon('edit') + 'Edit', onclick: function () { templateEditor(t, rerender); } }),
            h('button.btn.sm.danger', { html: U.icon('trash'), onclick: async function () {
              if (!(await UI.confirm({ title: 'Hapus template "' + t.name + '"?', ok: 'Hapus', danger: true }))) return;
              await Templates.remove(t.id); rerender();
            } }))));
      });
      body.appendChild(grid);
    },

    data: function (body, rerender) {
      body.appendChild(h('div.section',
        optRow('Folder data', U.tildify(Store.info.supportDir, Store.info.home), h('button.btn.sm', { html: U.icon('folder') + 'Buka', onclick: function () { Native.call('app.reveal', { path: Store.info.supportDir }); } })),
        optRow('Percakapan tersimpan', Store.index.length + ' percakapan', h('span')),
        optRow('Folder file buatan AI', Store.settings.outputDir ? U.tildify(Store.settings.outputDir, Store.info.home) : 'Bawaan: di dalam folder data Sinai (per percakapan)',
          h('div.row', { style: { gap: '6px' } },
            h('button.btn.sm', { html: U.icon('folder') + 'Pilih…', onclick: async function () {
              var p = await Native.call('dialog.openFolder', { message: 'Pilih folder untuk menyimpan file PPT/PDF/Word/gambar/video buatan Sinai' });
              if (p) { Store.setSetting('outputDir', p); rerender(); }
            } }),
            Store.settings.outputDir ? h('button.btn.sm.ghost', { text: 'Bawaan', onclick: function () { Store.setSetting('outputDir', ''); rerender(); } }) : null,
            h('button.btn.sm.ghost', { html: U.icon('external'), title: 'Buka folder', onclick: function () {
              var dir = Store.settings.outputDir || (Store.info.supportDir + '/files');
              Native.call('fs.mkdir', { path: dir }).then(function () { Native.call('app.reveal', { path: dir }); });
            } }))),
        optRow('API key', U.isMac() ? 'Disimpan di macOS Keychain (item "Sinai API Keys").' : U.isWin() ? 'Disimpan terenkripsi dengan Windows DPAPI (hanya akun Windows Anda yang bisa membukanya).' : 'Disimpan terenkripsi lewat keyring sistem (GNOME Keyring / KWallet) bila tersedia.', h('span'))));
      body.appendChild(h('div.section',
        optRow('Hapus semua percakapan', 'Tidak bisa dibatalkan. Pengaturan & API key tetap.', h('button.btn.sm.danger', { text: 'Hapus semua', onclick: async function () {
          var ok = await UI.confirm({ title: 'Hapus semua percakapan?', body: 'Semua ' + Store.index.length + ' percakapan akan dihapus permanen.', ok: 'Hapus semua', danger: true });
          if (!ok) return;
          var ids = Store.index.map(function (e) { return e.id; });
          for (var i = 0; i < ids.length; i++) { Engine.stop(ids[i]); await Store.deleteConv(ids[i]); }
          App.newConversation(UI.state.mode);
          rerender();
        } }))));
    },

    about: function (body) {
      var i = Store.info;
      body.appendChild(h('div.section', { style: { textAlign: 'center', padding: '10px 0 6px' } },
        h('div.brand-logo-lg'),
        h('h3', { style: { margin: '0 0 4px' }, text: 'Sinai ' + (i.version || '') }),
        h('p.hint', { text: (U.isMobile() ? 'AI chat & desain untuk ' : 'AI chat & coding agent untuk ') + Prompts.osName() + ' — masuk dengan Sinerli atau model apa pun lewat API key.' }),
        h('p.hint', { text: Prompts.osLine() + ' · ' + i.arch + ' · build ' + i.build }),
        h('p.copyright-note', { text: i.legal || App.copyright() })));
      if (window.Updater) body.appendChild(Updater.card());
      if (!U.isMobile()) body.appendChild(h('div.section', h('h4', { text: 'Pintasan keyboard' }), shortcutsTable()));
    },
  };

  function advancedModel() {
    var box = h('div');
    var sel = modelSelect(null, function (v) { renderFields(v); }, { none: 'Pilih model untuk diatur…' });
    function renderFields(ref) {
      box.innerHTML = '';
      if (!ref) return;
      var info = Providers.modelInfo(ref.providerId, ref.modelId);
      var pref = Store.modelPref(ref.providerId, ref.modelId);
      var ctx = h('input.inp', { type: 'number', placeholder: String(info.ctx || ''), value: pref.ctx ? String(pref.ctx) : '' });
      var out = h('input.inp', { type: 'number', placeholder: info.maxOut ? String(info.maxOut) : 'bawaan provider', value: pref.maxOut ? String(pref.maxOut) : '' });
      var temp = h('input.inp', { type: 'number', step: '0.1', min: '0', max: '2', placeholder: 'bawaan', value: pref.temperature != null ? String(pref.temperature) : '' });
      var tm = h('select.sel');
      [['', 'Otomatis'], ['native', 'Native function calling'], ['xml', 'Protokol XML (untuk model tanpa tool calling)']].forEach(function (o) { tm.appendChild(h('option', { value: o[0], text: o[1] })); });
      tm.value = pref.toolMode || '';
      var vis = h('select.sel');
      [['', 'Otomatis (' + (info.vision ? 'ya' : 'tidak') + ')'], ['1', 'Ya'], ['0', 'Tidak']].forEach(function (o) { vis.appendChild(h('option', { value: o[0], text: o[1] })); });
      vis.value = pref.vision == null ? '' : pref.vision ? '1' : '0';
      var save = h('button.btn.sm.primary', { text: 'Simpan', onclick: function () {
        Store.setModelPref(ref.providerId, ref.modelId, {
          ctx: parseInt(ctx.value, 10) || undefined, maxOut: parseInt(out.value, 10) || undefined,
          temperature: temp.value === '' ? undefined : parseFloat(temp.value), toolMode: tm.value || undefined,
          vision: vis.value === '' ? undefined : vis.value === '1',
        });
        UI.toast('Pengaturan model disimpan');
      } });
      box.appendChild(h('div', { style: { marginTop: '10px' } },
        h('div.row', h('div.field', h('label', { text: 'Jendela konteks (token)' }), ctx), h('div.field', h('label', { text: 'Maks token keluaran' }), out), h('div.field', h('label', { text: 'Temperature' }), temp)),
        h('div.row', h('div.field', h('label', { text: 'Mode pemanggilan alat' }), tm), h('div.field', h('label', { text: 'Bisa melihat gambar' }), vis)),
        save));
    }
    return h('div.section', h('h4', { text: 'Pengaturan lanjutan per model' }),
      h('p.hint', { text: 'Biasanya terdeteksi otomatis. Ubah bila provider Anda memakai batas berbeda.' }), sel, box);
  }

  /* Edit a template's name, kind, colours, fonts and style guide (or create one from a written guide). */
  function templateEditor(t, done) {
    var isNew = !t;
    t = t || { id: U.uid('tpl_'), name: '', kind: 'any', ext: 'md', colors: { bg: 'FFFFFF', surface: 'F3F4FB', text: '151833', muted: '5B6080', accent: '4F46E5', accent2: '06B6D4' }, fonts: { head: '', body: '' }, notes: '', createdAt: Date.now() };
    var m;
    var name = h('input.inp', { value: t.name, placeholder: 'mis. Brand Kantor 2026' });
    var kind = h('select.sel');
    Object.keys(Templates.KIND_LABEL).forEach(function (k) { kind.appendChild(h('option', { value: k, text: Templates.KIND_LABEL[k] })); });
    kind.value = t.kind || 'any';
    var colors = h('div.tpl-colors');
    var inputs = {};
    ['bg', 'surface', 'text', 'muted', 'accent', 'accent2'].forEach(function (k) {
      var inp = h('input', { type: 'color', value: '#' + ((t.colors || {})[k] || '888888') });
      inputs[k] = inp;
      colors.appendChild(h('label', inp, h('span', { text: { bg: 'Latar', surface: 'Permukaan', text: 'Teks', muted: 'Teks redup', accent: 'Aksen', accent2: 'Aksen 2' }[k] })));
    });
    var fh = h('input.inp', { value: (t.fonts || {}).head || '', placeholder: 'Font judul, mis. Montserrat' });
    var fb = h('input.inp', { value: (t.fonts || {}).body || '', placeholder: 'Font isi, mis. Inter' });
    var notes = h('textarea.ta', { rows: 8, value: t.notes || '', placeholder: 'Panduan gaya: layout, tipografi, penggunaan warna, bentuk, gaya foto/ikon, nada bahasa, hal yang wajib/dilarang…' });
    var el = h('div.modal',
      h('div.modal-head', h('h3', { text: isNew ? 'Template dari panduan gaya' : 'Edit template' })),
      h('div.modal-body',
        h('div.row', h('div.field', h('label', { text: 'Nama' }), name), h('div.field', h('label', { text: 'Untuk' }), kind)),
        h('div.field', h('label', { text: 'Warna' }), colors),
        h('div.row', h('div.field', h('label', { text: 'Font judul' }), fh), h('div.field', h('label', { text: 'Font isi' }), fb)),
        h('div.field', h('label', { text: 'Panduan gaya' }), notes)),
      h('div.modal-foot',
        h('button.btn.ghost', { text: 'Batal', onclick: function () { m.close(); } }),
        h('button.btn.primary', { text: 'Simpan', onclick: function () {
          if (!name.value.trim()) { name.focus(); return; }
          t.name = name.value.trim(); t.kind = kind.value;
          t.colors = {};
          Object.keys(inputs).forEach(function (k) { t.colors[k] = inputs[k].value.replace('#', '').toUpperCase(); });
          t.fonts = { head: fh.value.trim(), body: fb.value.trim() };
          t.notes = notes.value;
          Templates.save(t);
          m.close(); UI.toast('Template disimpan'); if (done) done();
        } })));
    m = UI.modal(el);
  }

  /* SKILL.md editor with a live checker. */
  function skillEditor(md, oldName, done, fallbackName) {
    var m;
    var ta = h('textarea.ta.mono.skill-ta', { value: md || '', spellcheck: false });
    var report = h('div.skill-lint');
    function check() {
      var rep = Skills.lint(ta.value, fallbackName);
      report.innerHTML = '';
      if (!rep.errors.length && !rep.warnings.length) report.appendChild(h('div.ok', { html: U.icon('check') + 'Format sempurna — siap disimpan sebagai <b>/' + U.esc(rep.meta.name) + '</b>.' }));
      rep.errors.forEach(function (e) { report.appendChild(h('div.err', { html: U.icon('alert') + U.esc(e) })); });
      rep.warnings.forEach(function (w) { report.appendChild(h('div.warn', { html: U.icon('info') + U.esc(w) })); });
      return rep;
    }
    ta.addEventListener('input', U.debounce(check, 250));
    var aiBtn = h('button.btn.sm', { html: U.icon('sparkle') + 'Sempurnakan dengan AI' });
    aiBtn.addEventListener('click', async function () {
      aiBtn.disabled = true; aiBtn.innerHTML = '<span class="spin"></span>Menyempurnakan…';
      try { var rep = await Skills.generate('', ta.value); ta.value = rep.fixed; check(); UI.toast('Skill disempurnakan — periksa lalu simpan'); }
      catch (e) { UI.toast(e.message, { error: true }); }
      aiBtn.disabled = false; aiBtn.innerHTML = U.icon('sparkle') + 'Sempurnakan dengan AI';
    });
    var el = h('div.modal.skill-modal',
      h('div.modal-head', h('h3', { text: oldName ? 'Edit skill /' + oldName : 'Skill baru' })),
      h('div.modal-body', ta, report),
      h('div.modal-foot',
        aiBtn,
        h('button.btn.sm', { html: U.icon('zap') + 'Rapikan otomatis', onclick: function () { ta.value = Skills.lint(ta.value, fallbackName).fixed; check(); } }),
        h('span', { style: { flex: '1' } }),
        h('button.btn.ghost', { text: 'Batal', onclick: function () { m.close(); } }),
        h('button.btn.primary', { text: 'Simpan', onclick: async function () {
          var rep = await Skills.save(ta.value, { oldName: oldName, overwrite: !!oldName });
          if (rep.exists && await UI.confirm({ title: 'Timpa skill /' + rep.meta.name + '?', body: 'Skill dengan nama ini sudah ada.', ok: 'Timpa' })) rep = await Skills.save(ta.value, { oldName: oldName, overwrite: true });
          if (rep.saved) { UI.toast('Skill /' + rep.meta.name + ' disimpan'); m.close(); if (done) done(); }
          else { check(); UI.toast('Perbaiki error dulu', { error: true }); }
        } })));
    m = UI.modal(el);
    check();
    setTimeout(function () { ta.focus(); }, 30);
  }

  function skillFromAI(done) {
    var m;
    var ta = h('textarea.ta', { rows: 6, placeholder: 'Contoh: "Skill untuk membuat laporan mingguan tim marketing dari data spreadsheet: ringkasan KPI, grafik, insight, dan rekomendasi. Format PDF, bahasa Indonesia formal."' });
    var go = h('button.btn.primary', { html: U.icon('sparkle') + 'Buat skill' });
    go.addEventListener('click', async function () {
      if (!ta.value.trim()) { ta.focus(); return; }
      go.disabled = true; go.innerHTML = '<span class="spin"></span>AI sedang menulis…';
      try {
        var rep = await Skills.generate(ta.value.trim());
        m.close();
        skillEditor(rep.fixed, null, done);
      } catch (e) { UI.toast(e.message, { error: true }); go.disabled = false; go.innerHTML = U.icon('sparkle') + 'Buat skill'; }
    });
    var el = h('div.modal.small',
      h('div.modal-head', h('h3', { text: 'Buat skill dengan AI' })),
      h('div.modal-body', h('p.hint', { text: 'Jelaskan tugasnya, kapan dipakai, dan hasil yang diinginkan. AI menulis SKILL.md mengikuti panduan Sinai, dicek & dirapikan otomatis, lalu Anda bisa meninjaunya sebelum disimpan.' }), ta),
      h('div.modal-foot', h('button.btn.ghost', { text: 'Batal', onclick: function () { m.close(); } }), go));
    m = UI.modal(el);
    setTimeout(function () { ta.focus(); }, 30);
  }

  /* Backup API keys for one provider (one per line). */
  function extraKeysForm(p, done) {
    var ta = h('textarea.inp.mono', { rows: 4, placeholder: 'Satu API key per baris', style: { width: '100%', resize: 'vertical' } });
    var info = h('p.hint', { text: 'Memuat…' });
    Store.getExtraKeys(p.id).then(function (list) {
      ta.value = list.join('\n');
      info.textContent = list.length ? list.length + ' key cadangan tersimpan. Saat key utama kena batas rate atau kuota/saldo habis, Sinai langsung beralih ke key berikutnya.' : 'Tambahkan key lain dari akun/proyek berbeda untuk provider ini. Dipakai bergiliran saat key aktif kena limit.';
    });
    return h('div.card', { style: { marginTop: '12px' } },
      h('h4', { style: { margin: '0 0 6px' }, text: 'API key cadangan — ' + p.name }), info, ta,
      h('div.row', { style: { gap: '6px', marginTop: '8px' } },
        h('button.btn.sm.primary', { text: 'Simpan', onclick: async function () {
          var list = ta.value.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
          await Store.setExtraKeys(p.id, list);
          Store.keyCursor[p.id] = 0;
          UI.toast(list.length + ' key cadangan disimpan' + (U.isMac() ? ' di Keychain' : ''));
          done();
        } }),
        h('button.btn.sm.ghost', { text: 'Tutup', onclick: done })));
  }

  /* Ordered list of models to switch to when the active one is unavailable. */
  function fallbackSection(rerender) {
    var list = Store.settings.agent.fallbackModels || [];
    var box = h('div');
    list.forEach(function (ref, i) {
      var r = Providers.resolve(ref);
      box.appendChild(h('div.mcp-row', { style: { padding: '4px 0' } },
        h('span.hdot.h-' + Health.state(ref.providerId, ref.modelId)),
        h('div.pn', h('b', { text: (i + 1) + '. ' + (r ? r.info.name : ref.modelId) }), h('span', { text: r ? r.provider.name : 'provider tidak aktif' })),
        h('button.btn.sm.ghost', { html: U.icon('x'), title: 'Hapus', onclick: function () {
          Store.setSetting('agent.fallbackModels', list.filter(function (_, j) { return j !== i; })); rerender();
        } })));
    });
    var add = modelSelect(null, function (v) {
      if (!v) return;
      Store.setSetting('agent.fallbackModels', list.concat([v]).filter(function (x, j, a) { return a.findIndex(function (y) { return y.providerId === x.providerId && y.modelId === x.modelId; }) === j; }));
      rerender();
    }, { none: '+ Tambah model cadangan…' });
    return h('div.section', h('h4', { text: 'Model cadangan (otomatis)' }),
      h('p.hint', { text: 'Jika model yang dipakai kena batas rate, kuota habis, atau error, Sinai otomatis pindah ke model berikut (berurutan) lalu kembali ke pilihan Anda di giliran berikutnya. Kosong = Sinai memilih sendiri dari model default & model yang sehat.' }),
      box, add);
  }

  function editMcp(cfg, done) {
    var isNew = !cfg;
    cfg = cfg || { id: U.uid('mcp_'), name: '', type: 'stdio', command: 'npx', args: [], env: {}, enabled: true };
    var m;
    var name = h('input.inp', { value: cfg.name, placeholder: 'mis. filesystem' });
    var type = h('select.sel');
    [['stdio', 'Lokal (perintah / stdio)'], ['http', 'Remote (URL / HTTP)'], ['sse', 'Remote (SSE lama)']].forEach(function (o) { type.appendChild(h('option', { value: o[0], text: o[1] })); });
    type.value = cfg.type || 'stdio';
    var cmd = h('input.inp.mono', { value: cfg.command || '', placeholder: 'npx, uvx, node, python3, /path/ke/server' });
    var args = h('textarea.ta.mono', { value: (cfg.args || []).join('\n'), placeholder: 'Satu argumen per baris, mis.\n-y\n@modelcontextprotocol/server-filesystem\n/Users/anda/Documents' });
    var env = h('textarea.ta.mono', { value: Object.keys(cfg.env || {}).map(function (k) { return k + '=' + cfg.env[k]; }).join('\n'), placeholder: 'KUNCI=nilai (satu per baris), mis. GITHUB_TOKEN=…' });
    var url = h('input.inp.mono', { value: cfg.url || '', placeholder: 'https://contoh.com/mcp' });
    var headers = h('textarea.ta.mono', { value: Object.keys(cfg.headers || {}).map(function (k) { return k + ': ' + cfg.headers[k]; }).join('\n'), placeholder: 'Authorization: Bearer …' });
    var trusted = cfg.trusted, oauth = cfg.auth === 'oauth';
    var local = h('div', h('div.field', h('label', { text: 'Perintah' }), cmd), h('div.field', h('label', { text: 'Argumen' }), args), h('div.field', h('label', { text: 'Variabel lingkungan' }), env));
    var remote = h('div', h('div.field', h('label', { text: 'URL server' }), url), h('div.field', h('label', { text: 'Header (opsional)' }), headers),
      optRow('Login OAuth di browser', 'Untuk server yang memakai login akun (Notion, Linear, dsb.). Token disimpan aman & diperbarui otomatis.', toggle(oauth, function (v) { oauth = v; })));
    function sync() { local.hidden = type.value !== 'stdio'; remote.hidden = type.value === 'stdio'; }
    type.addEventListener('change', sync);
    sync();
    var el = h('div.modal.small',
      h('div.modal-head', h('h3', { text: isNew ? 'Tambah konektor MCP' : 'Edit konektor' })),
      h('div.modal-body',
        h('div.row', h('div.field', h('label', { text: 'Nama' }), name), h('div.field', h('label', { text: 'Jenis' }), type)),
        local, remote,
        optRow('Percayai alat konektor ini', 'Jalankan alatnya tanpa meminta izin setiap kali.', toggle(!!trusted, function (v) { trusted = v; }))),
      h('div.modal-foot',
        h('button.btn.ghost', { text: 'Batal', onclick: function () { m.close(); } }),
        h('button.btn.primary', { text: 'Simpan & hubungkan', onclick: function () {
          cfg.name = name.value.trim() || 'server';
          cfg.type = type.value;
          cfg.command = cmd.value.trim();
          cfg.args = args.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
          cfg.env = {};
          env.value.split('\n').forEach(function (l) { var i = l.indexOf('='); if (i > 0) cfg.env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
          cfg.url = url.value.trim();
          cfg.headers = {};
          headers.value.split('\n').forEach(function (l) { var i = l.indexOf(':'); if (i > 0) cfg.headers[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
          cfg.trusted = !!trusted;
          if (cfg.type !== 'stdio' && oauth) cfg.auth = 'oauth'; else delete cfg.auth;
          var list = Store.settings.mcpServers = Store.settings.mcpServers || [];
          if (isNew) list.push(cfg);
          Store.saveSettings();
          m.close();
          MCP.start(cfg, { interactive: true }).then(function (s) { UI.toast(s.status === 'ready' ? cfg.name + ': ' + s.tools.length + ' alat siap' : cfg.name + ': ' + s.error, { error: s.status !== 'ready' }); if (done) done(); });
          if (done) done();
        } })));
    m = UI.modal(el);
  }

  // ================================================================ projects

  Settings.projects = function (openId) {
    var m;
    var el = h('div.modal');
    var nav = h('div.modal-nav', h('h2', { text: 'Proyek' }));
    var main = h('div.modal-main');
    el.appendChild(nav);
    el.appendChild(main);
    function list() {
      nav.querySelectorAll('.nav-item').forEach(function (n) { n.remove(); });
      Store.projects.forEach(function (p) {
        nav.appendChild(h('button.nav-item' + (p.id === openId ? '.active' : ''), { html: U.icon('box') + '<span>' + U.esc(p.name) + '</span>', onclick: function () { openId = p.id; list(); detail(); } }));
      });
      nav.appendChild(h('button.nav-item', { html: U.icon('plus') + '<span>Proyek baru</span>', onclick: function () {
        var p = { id: U.uid('proj_'), name: 'Proyek baru', description: '', instructions: '', files: [], createdAt: Date.now() };
        Store.upsertProject(p);
        openId = p.id; list(); detail();
      } }));
    }
    function detail() {
      main.innerHTML = '';
      var p = Store.project(openId);
      var head = h('div.modal-head', h('h3', { text: p ? p.name : 'Proyek' }), h('button.icon-btn', { html: U.icon('x'), onclick: function () { m.close(); } }));
      main.appendChild(head);
      var body = h('div.modal-body');
      main.appendChild(body);
      if (!p) {
        body.appendChild(h('div.cv-empty', h('div.cv-empty-icon', { html: U.icon('box') }), h('h3', { text: 'Proyek' }),
          h('p', { text: 'Kelompokkan percakapan dengan instruksi khusus dan file pengetahuan (dokumen, PDF, spreadsheet, kode) yang selalu diingat AI di setiap chat dalam proyek — seperti Projects di Claude.' })));
        return;
      }
      var save = U.debounce(function () { Store.upsertProject(p); head.querySelector('h3').textContent = p.name; list(); }, 300);
      function inp(label, key, multi, ph) {
        var x = multi ? h('textarea.ta', { value: p[key] || '', placeholder: ph || '' }) : h('input.inp', { value: p[key] || '', placeholder: ph || '' });
        x.addEventListener('input', function () { p[key] = x.value; save(); });
        return h('div.field', h('label', { text: label }), x);
      }
      body.appendChild(h('div.section', inp('Nama', 'name'), inp('Deskripsi', 'description', false, 'Untuk apa proyek ini?'),
        inp('Instruksi proyek', 'instructions', true, 'Bagaimana AI harus bekerja di proyek ini: peran, gaya, aturan, format jawaban…')));
      var files = h('div.model-grid');
      function renderFiles() {
        files.innerHTML = '';
        if (!p.files.length) files.appendChild(h('div.kfile', h('span.hint', { text: 'Belum ada file. Tambahkan dokumen, PDF, spreadsheet, kode, gambar (dibaca via OCR)…' })));
        var total = 0;
        p.files.forEach(function (f, i) {
          total += (f.text || '').length;
          files.appendChild(h('div.kfile', { html: U.icon('file') }, h('span', { text: f.name }), h('small', { text: U.fmtTokens(U.estimateTokens(f.text || '')) + ' token' }),
            h('button.icon-btn', { html: U.icon('x'), onclick: function () { p.files.splice(i, 1); Store.upsertProject(p); renderFiles(); } })));
        });
        cap.textContent = p.files.length + ' file · ± ' + U.fmtTokens(U.estimateTokens('x'.repeat(Math.min(total, 5e6)))) + ' token pengetahuan';
      }
      var cap = h('span.hint');
      var addBtn = h('button.btn.sm', { html: U.icon('plus') + 'Tambah file', onclick: async function () {
        var paths = await Native.call('dialog.openFiles', { multiple: true });
        if (!paths || !paths.length) return;
        addBtn.disabled = true;
        for (var i = 0; i < paths.length; i++) {
          try {
            var atts = await Files.readPath(paths[i], { vision: false, ocr: true });
            atts.filter(function (a) { return a.kind === 'file'; }).forEach(function (a) { p.files.push({ id: U.uid('kf_'), name: a.name, kind: 'file', text: a.text }); });
          } catch (e) { UI.toast(U.basename(paths[i]) + ': ' + e.message, { error: true }); }
        }
        addBtn.disabled = false;
        Store.upsertProject(p);
        renderFiles();
      } });
      body.appendChild(h('div.section', h('h4', { text: 'Pengetahuan proyek' }), h('div.row', cap, h('div', { style: { flex: '1' } }), addBtn), files));
      renderFiles();
      var chats = Store.index.filter(function (e) { return e.projectId === p.id; });
      var cl = h('div');
      chats.forEach(function (e) {
        cl.appendChild(h('div.conv-item', { html: U.icon(e.mode === 'design' ? 'palette' : 'chat') + '<span class="t">' + U.esc(e.title) + '</span>', onclick: function () { m.close(); App.openConversation(e.id); } }));
      });
      body.appendChild(h('div.section', h('h4', { text: 'Percakapan (' + chats.length + ')' }), cl,
        h('div.row', { style: { gap: '8px', marginTop: '8px' } },
          h('button.btn.primary.sm', { html: U.icon('chat') + 'Chat baru di proyek ini', onclick: function () { m.close(); App.newConversation('chat', { projectId: p.id }); } }),
          h('button.btn.sm', { html: U.icon('palette') + 'Desain baru di proyek ini', onclick: function () { m.close(); App.newConversation('design', { projectId: p.id }); } }))));
      body.appendChild(h('div.section', h('button.btn.sm.danger', { text: 'Hapus proyek', onclick: async function () {
        if (!(await UI.confirm({ title: 'Hapus proyek?', body: 'Instruksi dan file pengetahuan "' + p.name + '" dihapus. Percakapannya tetap ada.', ok: 'Hapus', danger: true }))) return;
        Store.deleteProject(p.id);
        openId = Store.projects[0] && Store.projects[0].id;
        list(); detail();
      } })));
    }
    if (!openId && Store.projects.length) openId = Store.projects[0].id;
    list();
    detail();
    m = UI.modal(el);
  };

  function shortcutsTable() {
    var rows = [
      ['Chat baru', '⌘N'], ['Sesi coding baru', '⇧⌘N'], ['Desain baru', '⌥⌘N'], ['Panel / kanvas', '⌥⌘B'], ['Buka folder proyek', '⌘O'], ['Cari percakapan', '⌘K'],
      ['Pilih model', '⇧⌘M'], ['Sidebar', '⌘\\'], ['Pengaturan', '⌘,'], ['Kirim', '↵'], ['Baris baru', '⇧↵'],
      ['Hentikan', 'Esc'], ['Ekspor percakapan', '⇧⌘E'], ['Ukuran teks', '⌘= / ⌘- / ⌘0'],
      ['Perintah Code', '/init  /review  /plan  /compact  /clear  /model  /help'], ['Sebut file (Code)', '@nama-file'],
    ];
    var t = h('div.keys');
    rows.forEach(function (r) { t.appendChild(h('span', { text: r[0] })); t.appendChild(h('span', h('kbd', { text: U.kbd(r[1]) }))); });
    return t;
  }
  Settings.shortcutsTable = shortcutsTable;

  Settings.editMcp = editMcp;
  /* Extra sections from other modules (ui-evals.js), inserted after "after". */
  Settings.addSection = function (id, label, icon, render, after) {
    var i = SECTIONS.findIndex(function (x) { return x[0] === after; });
    SECTIONS.splice(i < 0 ? SECTIONS.length : i + 1, 0, [id, label, icon]);
    RENDER[id] = render;
  };
  Settings.ui = { seg: seg, toggle: toggle, optRow: optRow, modelSelect: modelSelect };
  window.Settings = Settings;
})();
