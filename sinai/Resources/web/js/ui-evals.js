/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Settings pages for the quality suite (evals.js), the model orchestra
   (router + per-model profiles) and user hooks (hooks.js). */
(function () {
  'use strict';

  var h = U.h;
  var ui = Settings.ui;
  function key(ref) { return ref ? ref.providerId + '::' + ref.modelId : ''; }
  function nameOf(ref) { var r = Providers.resolve(ref); return r ? (r.info.name || r.modelId) : (ref ? ref.modelId : '—'); }

  // ---------------------------------------------------------------- quality suite

  var picked = null;
  function renderEvals(body, rerender) {
    var models = Providers.allModels();
    if (!picked) picked = new Set([key(Engine.defaultModelRef('chat'))].filter(Boolean));
    body.appendChild(h('div.section',
      h('p.hint', { html: 'Menjalankan <b>' + Evals.CASES.length + ' tugas nyata</b> (penalaran, gaya, kejujuran, format, kode, artifact, file PPT/Excel, pemakaian alat) di setiap model yang dipilih lewat mesin Sinai yang sebenarnya. Hasilnya dicek otomatis lalu dinilai model penilai dengan standar asisten setara Claude. Kebiasaan buruk yang terukur otomatis masuk ke <b>profil model</b> sehingga prompt-nya menyesuaikan. Tambahkan model Claude ke daftar bila ingin melihatnya sebagai acuan.' })));

    var list = h('div.ev-models');
    models.forEach(function (m) {
      var k = m.providerId + '::' + m.modelId;
      var cb = h('input', { type: 'checkbox' });
      cb.checked = picked.has(k);
      cb.addEventListener('change', function () { if (cb.checked) picked.add(k); else picked.delete(k); });
      list.appendChild(h('label', cb, h('span', { text: nameOf({ providerId: m.providerId, modelId: m.modelId }) })));
    });
    var judgeSel = ui.modelSelect(Store.settings.evalJudge, function (v) { Store.setSetting('evalJudge', v); }, { none: 'Otomatis (model kuat / peninjau / Claude)' });
    var logEl = h('div.ev-log');
    var runBtn = h('button.btn.primary', { html: U.icon('play') + '<span>Jalankan uji</span>' });
    var stopBtn = h('button.btn', { text: 'Hentikan', onclick: function () { Evals.stop(); } });
    function sync() {
      runBtn.disabled = Evals.state.running;
      stopBtn.style.display = Evals.state.running ? '' : 'none';
      logEl.textContent = Evals.state.log.join('\n');
      logEl.scrollTop = logEl.scrollHeight;
    }
    Evals.state.onChange = function () { sync(); if (!Evals.state.running) rerender(); };
    runBtn.addEventListener('click', function () {
      var refs = Array.from(picked).map(function (k) { var i = k.indexOf('::'); return { providerId: k.slice(0, i), modelId: k.slice(i + 2) }; });
      if (!refs.length) { UI.toast('Pilih minimal satu model', { error: true }); return; }
      Evals.run(refs, {}).catch(function (e) { UI.toast(e.message, { error: true }); });
      sync();
    });
    body.appendChild(h('div.section', h('h4', { text: 'Model yang diuji' }), models.length ? list : h('p.hint', { text: 'Belum ada model. Tambahkan provider dulu.' }),
      h('div.row', h('div.field', h('label', { text: 'Model penilai' }), judgeSel)),
      h('div.row', { style: { gap: '8px', marginTop: '10px' } }, runBtn, stopBtn),
      h('p.hint', { text: 'Perkiraan: ±' + Evals.CASES.length + ' permintaan per model + penilaian. Tidak ada yang meminta izin Anda selama uji; file yang dibuat saat uji dihapus otomatis.' }),
      logEl));
    sync();

    var runs = Store.settings.evalRuns || [];
    var last = runs[runs.length - 1];
    if (last) {
      var best = Math.max.apply(null, last.models.map(function (m) { return m.score || 0; })) || 10;
      var claude = last.models.find(function (m) { return /claude/i.test(m.ref.modelId); });
      var table = h('table.ev-table', h('thead', h('tr', ['Model', 'Skor', 'vs ' + (claude ? 'Claude' : 'terbaik'), 'Lulus cek', 'Waktu', 'Token'].map(function (t) { return h('th', { text: t }); }))));
      var tb = h('tbody');
      last.models.forEach(function (m) {
        var ref = claude ? claude.score : best;
        var rel = m.score && ref ? Math.round(m.score / ref * 100) : null;
        tb.appendChild(h('tr', h('td', h('b', { text: m.name }), h('div.hint', { text: m.family })), h('td.n', { text: m.score == null ? '—' : m.score + '/10' }),
          h('td', h('div.ev-bar', h('i', { style: { width: Math.min(100, rel || 0) + '%' } })), h('span.hint', { text: rel == null ? '' : rel + '%' })),
          h('td.n', { text: m.pass == null ? '—' : m.pass + '%' }), h('td.n', { text: U.fmtDuration(m.ms || 0) }), h('td.n', { text: U.fmtTokens(m.tokens || 0) })));
        var det = h('tr', h('td', { colSpan: 6 }, h('details', h('summary', { text: 'Rincian per tugas' + (m.notes ? ' · catatan profil yang dipelajari' : '') }),
          m.notes ? h('pre.ev-log', { text: m.notes }) : null,
          h('table.ev-table', h('tbody', m.cases.map(function (c) {
            return h('tr', h('td', { text: c.cat + ' · ' + c.id }), h('td.n', { text: c.judge ? c.judge.score + '/10' : '—' }),
              h('td', { text: c.checks.map(function (x) { return (x.ok ? '✓ ' : '✗ ') + x.label; }).join('  ') }),
              h('td', { text: c.error ? 'Error: ' + c.error : (c.judge && c.judge.weaknesses) || '' }));
          }))))));
        tb.appendChild(det);
      });
      table.appendChild(tb);
      body.appendChild(h('div.section', h('h4', { text: 'Hasil terakhir · ' + new Date(last.at).toLocaleString('id-ID') + ' · penilai ' + nameOf(last.judge) }), table));
    }
  }

  // ---------------------------------------------------------------- orchestra

  function renderOrchestra(body, rerender) {
    var rt = Store.settings.router || {};
    function set(k, v) { Store.setSetting('router', Object.assign({}, Store.settings.router || {}, (function () { var o = {}; o[k] = v; return o; })())); }
    body.appendChild(h('div.section',
      h('p.hint', { text: 'Bagi kerja ke beberapa model agar hasilnya bisa melampaui satu model saja: model ringan mengerjakan investigasi sub-agen, model kuat mengambil alih saat model utama buntu, dan panel draf memberi sudut pandang dari model berbeda di level Maksimal. Model peninjau & utilitas ada di halaman Kecerdasan.' }),
      h('div.row',
        h('div.field', h('label', { text: 'Model ringan (sub-agen baca-saja)' }), ui.modelSelect(rt.light, function (v) { set('light', v); }, { none: 'Sama dengan model utama' })),
        h('div.field', h('label', { text: 'Model kuat (eskalasi)' }), ui.modelSelect(rt.strong, function (v) { set('strong', v); }, { none: 'Tidak ada' }))),
      ui.optRow('Eskalasi otomatis', 'Saat model utama gagal berulang kali pada hal yang sama, sisa tugas dialihkan ke model kuat.', ui.toggle(rt.escalate !== false, function (v) { set('escalate', v); }))));

    var panel = (rt.panel || []).slice();
    var box = h('div');
    function draw() {
      box.innerHTML = '';
      panel.forEach(function (ref, i) {
        box.appendChild(h('div.row', { style: { marginBottom: '6px' } },
          ui.modelSelect(ref, function (v) { panel[i] = v; set('panel', panel.filter(Boolean)); }),
          h('button.btn.sm', { text: 'Hapus', onclick: function () { panel.splice(i, 1); set('panel', panel.filter(Boolean)); draw(); } })));
      });
      if (panel.length < 3) box.appendChild(h('button.btn.sm', { html: U.icon('plus') + 'Tambah model draf', onclick: function () { panel.push(Engine.defaultModelRef('chat')); set('panel', panel.filter(Boolean)); draw(); } }));
    }
    draw();
    body.appendChild(h('div.section', h('h4', { text: 'Panel draf (level Maksimal)' }),
      h('p.hint', { text: 'Draf ke-2, ke-3, ke-4 ditulis oleh model-model ini, lalu disintesis peninjau. Kosong = semua draf dari model utama.' }), box));

    var rows = h('tbody');
    Providers.allModels().forEach(function (m) {
      var r = Providers.resolve({ providerId: m.providerId, modelId: m.modelId });
      if (!r) return;
      var p = Profiles.get(r);
      rows.appendChild(h('tr', h('td', h('b', { text: r.info.name || r.modelId })), h('td', { text: p.label }),
        h('td.n', { text: p.score == null ? '—' : p.score + '/10' }),
        h('td', { text: (p.allTools ? 'semua alat' : 'alat hemat') + ' · ' + (p.htmlFiles ? 'file desain HTML' : 'file Markdown') + (p.temperature != null ? ' · suhu ' + p.temperature : '') }),
        h('td', p.scoredAt ? h('button.btn.sm', { text: 'Reset', title: 'Hapus catatan yang dipelajari', onclick: function () { Profiles.reset({ providerId: m.providerId, modelId: m.modelId }); rerender(); } }) : null)));
    });
    body.appendChild(h('div.section', h('h4', { text: 'Profil per model' }),
      h('p.hint', { text: 'Setiap keluarga model mendapat koreksi prompt sendiri; hasil Uji kualitas menambah catatan yang terukur untuk tiap model.' }),
      h('table.ev-table', h('thead', h('tr', ['Model', 'Keluarga', 'Skor uji', 'Pengaturan', ''].map(function (t) { return h('th', { text: t }); }))), rows)));
  }

  // ---------------------------------------------------------------- hooks

  function renderHooks(body, rerender) {
    var ag = Store.settings.agent;
    body.appendChild(h('div.section', h('h4', { text: 'Diagnostik otomatis' }),
      ui.optRow('Cek file setelah diedit', 'Mode Code: setiap file yang ditulis/diedit agen langsung dicek (node --check, py_compile, php -l, bash -n, tsc, gofmt, JSON) dan error-nya dikirim balik ke agen.', ui.toggle(ag.diagnostics !== false, function (v) { Store.setSetting('agent.diagnostics', v); }))));
    var hooks = (Store.settings.hooks || []).map(function (x) { return Object.assign({}, x); });
    function save() { Store.setSetting('hooks', hooks.filter(function (x) { return x.command; })); }
    var box = h('div');
    function draw() {
      box.innerHTML = '';
      hooks.forEach(function (hk, i) {
        var ev = h('select.sel');
        [['before', 'Sebelum alat'], ['after', 'Sesudah alat'], ['stop', 'Saat selesai']].forEach(function (o) { ev.appendChild(h('option', { value: o[0], text: o[1] })); });
        ev.value = hk.event || 'after';
        ev.addEventListener('change', function () { hk.event = ev.value; save(); });
        var match = h('input.inp', { placeholder: 'alat, mis. edit_file|write_file', value: hk.match || '' });
        match.addEventListener('change', function () { hk.match = match.value.trim(); save(); });
        var cmd = h('input.inp', { placeholder: 'perintah, mis. npx prettier --write "$SINAI_PATH"', value: hk.command || '' });
        cmd.addEventListener('change', function () { hk.command = cmd.value.trim(); save(); });
        box.appendChild(h('div.hook-row', ev, match, cmd, h('button.btn.sm', { text: 'Hapus', onclick: function () { hooks.splice(i, 1); save(); draw(); } })));
      });
      box.appendChild(h('button.btn.sm', { html: U.icon('plus') + 'Tambah hook', onclick: function () { hooks.push({ event: 'after', match: 'edit_file|write_file', command: '' }); draw(); } }));
    }
    draw();
    body.appendChild(h('div.section', h('h4', { text: 'Hooks' }),
      h('p.hint', { html: 'Perintah shell yang dijalankan otomatis di folder proyek. <b>Sebelum alat</b>: exit ≠ 0 membatalkan aksi agen. <b>Sesudah alat</b>: output-nya ditambahkan ke hasil alat. <b>Saat selesai</b> (mode Code, bila ada perubahan): bila gagal, agen diminta memperbaiki — cocok untuk <code>npm test</code>. Variabel: <code>$SINAI_TOOL</code>, <code>$SINAI_PATH</code>, <code>$SINAI_ARGS</code>.' }),
      box));
  }

  Settings.addSection('quality', 'Uji kualitas', 'target', renderEvals, 'intelligence');
  Settings.addSection('orchestra', 'Orkestra model', 'layers', renderOrchestra, 'intelligence');
  Settings.addSection('hooks', 'Hooks & diagnostik', 'zap', renderHooks, 'agent');
})();
