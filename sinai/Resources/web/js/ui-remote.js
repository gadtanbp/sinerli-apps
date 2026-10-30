/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Perangkat & kontrol jarak jauh: daftar perangkat akun, status sinkron, dan panel untuk
   mengendalikan Sinai di perangkat lain (kirim tugas, hentikan, setujui izin). */
(function () {
  'use strict';
  var h = U.h;
  var PLAT = { macos: 'macOS', windows: 'Windows', linux: 'Linux', android: 'Android', ios: 'iOS' };

  function ago(sec) {
    if (!sec) return 'belum pernah';
    var d = Math.max(0, Math.round(Date.now() / 1000 - sec));
    if (d < 60) return 'baru saja';
    if (d < 3600) return Math.round(d / 60) + ' menit lalu';
    if (d < 86400) return Math.round(d / 3600) + ' jam lalu';
    return Math.round(d / 86400) + ' hari lalu';
  }
  function dot(on) { return h('span', { style: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', marginRight: '6px', background: on ? '#30c06a' : '#9aa0a6' } }); }
  function byId(id) { return Sync.devices().find(function (d) { return d.id === id; }) || null; }

  var Remote = {};

  /** Bagian "Perangkat & Sinkron" di Pengaturan. */
  Remote.section = function (body, rerender) {
    var self = Sync.selfId();
    var st = Sync.status();
    var label = { off: 'Mati (belum masuk Sinerli)', connecting: 'Menyambung…', ok: 'Tersinkron', error: 'Gangguan: ' + st.error }[st.state] || st.state;
    body.appendChild(h('div.section', h('h4', { text: 'Sinkron antar perangkat' }),
      h('p.hint', { html: 'Semua Sinai yang masuk dengan akun Sinerli yang sama berbagi <b>percakapan, proyek, memori, gaya & preferensi</b>. Perubahan terakhir menang. Provider/API key, folder proyek, webhook, dan konektor lokal <b>tidak</b> disinkronkan (khusus perangkat).' }),
      h('div', { style: { margin: '6px 0' }, html: '<b>Status:</b> ' + U.esc(label) }),
      h('button.btn.sm', { text: 'Sinkronkan sekarang', onclick: async function (e) {
        e.target.disabled = true;
        try { await Sync.rehello(); await Sync.syncNow(); UI.toast('Sinkron dimulai'); } catch (err) { UI.toast(err.message, { error: true }); }
        e.target.disabled = false; rerender();
      } })));

    var host = Store.settings.remoteHost !== false;
    body.appendChild(h('div.section', h('h4', { text: 'Izinkan perangkat ini dikontrol' }),
      h('p.hint', { html: 'Bila aktif, Sinai lain di akun Anda boleh mengirim tugas, menghentikan, dan menyetujui izin di perangkat ini. Mode izin percakapan tetap berlaku (mode <i>Tanya dulu</i> berarti setiap aksi berisiko menunggu persetujuan Anda). Perangkat tidak pernah bisa diubah ke mode otomatis penuh dari jauh.' }),
      h('label.row', { style: { gap: '8px', alignItems: 'center' } },
        h('input', { type: 'checkbox', checked: host, onchange: function (e) { Store.setSetting('remoteHost', e.target.checked); Sync.rehello().then(rerender).catch(function () {}); } }),
        h('span', { text: 'Izinkan kontrol jarak jauh' }))));

    var list = h('div.section', h('h4', { text: 'Perangkat saya' }));
    var devs = Sync.devices();
    if (!devs.length) list.appendChild(h('p.hint', { text: st.state === 'off' ? 'Masuk dengan Sinerli untuk melihat perangkat.' : 'Belum ada data perangkat.' }));
    devs.forEach(function (d) {
      var isSelf = d.id === self;
      var busy = d.state && d.state.runs && d.state.runs.length;
      var row = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderTop: '1px solid var(--border, rgba(128,128,128,.2))', flexWrap: 'wrap' } },
        h('div', { style: { flex: '1 1 200px', minWidth: '0' } },
          h('div', { html: (d.online ? '<span style="color:#30c06a">●</span> ' : '<span style="color:#9aa0a6">●</span> ') + '<b>' + U.esc(d.name || PLAT[d.platform] || 'Perangkat') + '</b>' + (isSelf ? ' <span class="hint">(ini)</span>' : '') }),
          h('div.hint', { text: (PLAT[d.platform] || d.platform) + (d.version ? ' · v' + d.version : '') + ' · ' + (d.online ? 'online' : 'terakhir ' + ago(d.last_seen)) + (d.host ? '' : ' · kontrol dimatikan') + (busy ? ' · ' + d.state.runs.length + ' tugas berjalan' : '') })));
      if (!isSelf) {
        row.appendChild(h('button.btn.sm' + (d.online && d.host ? '.primary' : ''), { text: 'Kontrol', disabled: !d.host, title: d.host ? '' : 'Perangkat ini mematikan kontrol jarak jauh', onclick: function () { Remote.open(d.id); } }));
        row.appendChild(h('button.btn.sm.ghost', { text: 'Hapus', onclick: async function () {
          if (!(await UI.confirm({ title: 'Hapus perangkat?', body: 'Perangkat "' + (d.name || d.id) + '" dihapus dari daftar. Data di perangkat itu tidak terhapus; ia muncul lagi saat Sinai-nya dibuka.', ok: 'Hapus' }))) return;
          try { await Sync.forget(d.id); rerender(); } catch (err) { UI.toast(err.message, { error: true }); }
        } }));
      }
      list.appendChild(row);
    });
    body.appendChild(list);
  };

  /** Panel kendali untuk satu perangkat. */
  Remote.open = function (deviceId) {
    var listEl = h('div'), apprEl = h('div'), runEl = h('div');
    var modeSel = h('select', h('option', { value: 'chat', text: 'Chat' }), h('option', { value: 'code', text: 'Code' }), h('option', { value: 'design', text: 'Design' }));
    var wsInp = h('input', { type: 'text', placeholder: 'Folder proyek di perangkat tujuan (mode Code)', spellcheck: 'false' });
    var convSel = h('select', h('option', { value: '', text: 'Percakapan baru' }));
    Store.index.slice(0, 25).forEach(function (e) { convSel.appendChild(h('option', { value: e.id, text: '[' + (e.mode || 'chat') + '] ' + (e.title || 'Tanpa judul').slice(0, 60) })); });
    var msg = h('textarea', { rows: 4, placeholder: 'Tugas untuk perangkat ini…', style: { width: '100%', boxSizing: 'border-box' } });
    var sendBtn = h('button.btn.primary', { text: 'Kirim ke perangkat', onclick: async function () {
      var text = msg.value.trim();
      if (!text) return;
      var pl = { text: text };
      if (convSel.value) pl.convId = convSel.value; else { pl.mode = modeSel.value; if (modeSel.value === 'code' && wsInp.value.trim()) pl.workspace = wsInp.value.trim(); }
      sendBtn.disabled = true;
      try { await Sync.syncNow(); await Sync.cmdWait(deviceId, 'send', pl); msg.value = ''; UI.toast('Tugas dikirim — berjalan di perangkat tujuan'); }
      catch (err) { UI.toast(err.message, { error: true }); }
      sendBtn.disabled = false;
    } });
    convSel.onchange = function () { var on = !convSel.value; modeSel.disabled = !on; wsInp.disabled = !on; };
    var title = h('h3');
    var el = h('div.modal', { style: { width: '560px', maxWidth: '96vw' } },
      h('div.modal-head', title, h('button.icon-btn', { html: U.icon('x'), onclick: function () { m.close(); } })),
      h('div.modal-body', { style: { maxHeight: '75vh', overflowY: 'auto' } },
        apprEl, runEl,
        h('div.section', h('h4', { text: 'Tugas baru' }),
          h('div.row', { style: { gap: '8px', flexWrap: 'wrap', marginBottom: '8px' } }, convSel, modeSel),
          h('div.field', wsInp), msg, h('div', { style: { marginTop: '8px' } }, sendBtn),
          h('p.hint', { text: 'Memilih percakapan yang ada melanjutkannya di perangkat tujuan (percakapan harus sudah tersinkron ke sana).' })),
        listEl));
    var m = UI.modal(el);

    function draw() {
      var d = byId(deviceId);
      if (!d) { m.close(); return; }
      title.innerHTML = '';
      title.appendChild(dot(d.online));
      title.appendChild(document.createTextNode((d.name || 'Perangkat') + (d.online ? '' : ' (offline)')));
      var s = d.state || {};
      if (!wsInp.value && s.workspaces && s.workspaces[0]) wsInp.placeholder = 'Folder proyek (mis. ' + s.workspaces[0] + ')';
      apprEl.innerHTML = '';
      (s.approvals || []).forEach(function (a) {
        var box = h('div.section', { style: { border: '1px solid var(--border, rgba(128,128,128,.3))', borderRadius: '10px', padding: '10px', marginBottom: '8px' } },
          h('div', { html: '<b>Menunggu persetujuan</b> · ' + U.esc(a.title || '') }),
          h('div.hint', { text: a.questions ? 'Pertanyaan dari agen' : (a.plan ? 'Rencana' : a.name) + ' ' + (a.args || '') }));
        if (a.danger || a.warn) box.appendChild(h('div', { style: { color: '#d9534f', margin: '4px 0' }, text: a.danger || a.warn }));
        var send = function (pl) { Sync.cmdWait(deviceId, 'approve', Object.assign({ callId: a.id }, pl)).catch(function (e) { UI.toast(e.message, { error: true }); }); };
        if (a.questions) {
          var answers = a.questions.map(function () { return ''; });
          a.questions.forEach(function (q, i) {
            box.appendChild(h('div', { text: q.q }));
            var inp = h('input', { type: 'text', placeholder: 'Jawaban', oninput: function () { answers[i] = inp.value; } });
            var opts = h('div.row', { style: { gap: '6px', flexWrap: 'wrap', margin: '4px 0' } });
            (q.options || []).forEach(function (o) { opts.appendChild(h('button.btn.sm', { text: o, onclick: function () { answers[i] = o; inp.value = o; } })); });
            box.appendChild(opts); box.appendChild(h('div.field', inp));
          });
          box.appendChild(h('button.btn.sm.primary', { text: 'Kirim jawaban', onclick: function () { send({ answers: answers }); } }));
          box.appendChild(h('button.btn.sm.ghost', { text: 'Lewati', onclick: function () { send({ allow: false }); } }));
        } else {
          box.appendChild(h('button.btn.sm.primary', { text: a.plan ? 'Setujui rencana' : 'Izinkan', onclick: function () { send({ allow: true }); } }));
          box.appendChild(h('button.btn.sm.ghost', { text: 'Tolak', onclick: function () { send({ allow: false }); } }));
        }
        apprEl.appendChild(box);
      });
      runEl.innerHTML = '';
      runEl.appendChild(h('div.section', h('h4', { text: 'Sedang berjalan' }),
        (s.runs || []).length ? null : h('p.hint', { text: d.online ? 'Tidak ada tugas yang berjalan.' : 'Perangkat sedang offline; tugas yang dikirim akan kedaluwarsa setelah 10 menit.' })));
      (s.runs || []).forEach(function (r) {
        runEl.firstChild.appendChild(h('div', { style: { padding: '8px 0', borderTop: '1px solid var(--border, rgba(128,128,128,.2))' } },
          h('div', { html: '<b>' + U.esc(r.title || 'Tugas') + '</b> <span class="hint">[' + U.esc(r.mode) + (r.workspace ? ' · ' + U.esc(r.workspace) : '') + (r.tool ? ' · ' + U.esc(r.tool) : '') + ']</span>' }),
          r.tail ? h('div.hint', { style: { whiteSpace: 'pre-wrap', maxHeight: '110px', overflow: 'auto' }, text: r.tail }) : null,
          h('div.row', { style: { gap: '6px', marginTop: '4px' } },
            h('button.btn.sm', { text: 'Hentikan', onclick: function () { Sync.cmdWait(deviceId, 'stop', { convId: r.id }).then(function () { UI.toast('Dihentikan'); }, function (e) { UI.toast(e.message, { error: true }); }); } }),
            Store.index.some(function (e) { return e.id === r.id; }) ? h('button.btn.sm.ghost', { text: 'Buka di sini', onclick: function () { m.close(); if (window.Settings && Settings.close) Settings.close(); App.openConversation(r.id); } }) : null)));
      });
    }
    Sync.on('devices', function () { if (!m.closed) draw(); });
    draw();
    return m;
  };

  window.Remote = Remote;
})();
