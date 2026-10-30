/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Pembaruan dari Sinerli. Sinai membaca <Sinerli>/sinai/update saat dibuka,
   berkala, dan saat jendela kembali aktif. Bila ada rilis WAJIB yang lebih
   baru, Sinai terkunci (tidak bisa dipakai) sampai versi baru terpasang.
   Status terakhir disimpan, jadi kunci tetap berlaku walau sedang offline. */
(function () {
  'use strict';
  var h = U.h;
  var Updater = { locked: false, state: null };
  var CHECK_EVERY = 30 * 60 * 1000;
  var lastCheck = 0, checking = null, lockModal = null, softShown = '';

  function platform() {
    var f = U.osFamily();
    return ['macos', 'windows', 'linux', 'android', 'ios'].indexOf(f) >= 0 ? f : 'macos';
  }
  function kind() {
    var k = Store.info.updateKind;
    if (k) return k;
    return { macos: 'dmg', windows: 'setup', linux: 'appimage', android: 'apk', ios: 'ipa' }[platform()];
  }
  function current() { return String(Store.info.version || '0.0.0'); }

  /** Membandingkan versi x.y.z: >0 bila a lebih baru dari b. */
  function cmp(a, b) {
    var x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
    for (var i = 0; i < 3; i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
    return 0;
  }
  Updater.compare = cmp;

  function sameOrigin(a, b) {
    try { var u = new URL(a), v = new URL(b); return u.protocol === v.protocol && u.host === v.host; } catch (e) { return false; }
  }

  /** Berkas dari manifest hanya diterima bila berasal dari server Sinerli yang dipakai (atau App Store/TestFlight untuk iOS). */
  function trustedFile(f) {
    if (!f || !f.url) return null;
    if (f.external) return /^https:\/\/(apps\.apple\.com|testflight\.apple\.com|itunes\.apple\.com)\//.test(f.url) || sameOrigin(f.url, Sinerli.base()) ? f : null;
    if (!sameOrigin(f.url, Sinerli.base()) || !/^[a-f0-9]{64}$/.test(String(f.sha256 || ''))) return null;
    return f;
  }

  function save() { Store.setSetting('updateCache', Updater.state); }

  /** Terapkan status (dari server atau cache): kunci, tawarkan, atau bersihkan. */
  function apply(st) {
    Updater.state = st;
    var newer = st && st.latest && cmp(st.latest.version, current()) > 0;
    if (newer && st.required) { showLock(st); return; }
    var wasLocked = Updater.locked;
    if (lockModal) { lockModal.close(); lockModal = null; }
    Updater.locked = false;
    document.getElementById('app').inert = false;
    if (wasLocked && window.Settings && Settings.loginGate) Settings.loginGate();
    if (newer && softShown !== st.latest.version) {
      softShown = st.latest.version;
      UI.toast('Sinai ' + st.latest.version + ' tersedia — buka Pengaturan › Tentang untuk memperbarui.', { icon: 'download', ms: 7000 });
    }
  }

  Updater.check = function (opts) {
    opts = opts || {};
    if (checking) return checking;
    lastCheck = Date.now();
    var url = Sinerli.base() + '/sinai/update?platform=' + platform() + '&kind=' + encodeURIComponent(kind()) + '&version=' + encodeURIComponent(current());
    checking = Native.call('http.request', { url: url, headers: { Accept: 'application/json' }, timeout: 15 }).then(function (r) {
      var j = null;
      try { j = JSON.parse(r.body); } catch (e) { j = null; }
      if (r.status !== 200 || !j || j.ok !== true) throw new Error('Server pembaruan menjawab HTTP ' + r.status);
      var st = { checkedAt: Date.now(), base: Sinerli.base(), required: !!j.update_required, latest: null };
      if (j.latest && /^\d+\.\d+\.\d+$/.test(String(j.latest.version))) {
        st.latest = { version: j.latest.version, notes: String(j.latest.notes || '').slice(0, 4000), file: trustedFile(j.latest.file), publishedAt: j.latest.published_at };
      }
      save();
      apply(st);
      return st;
    }).catch(function (e) {
      if (opts.manual) throw e;
      return Updater.state;   // offline: status terakhir tetap berlaku
    }).finally(function () { checking = null; });
    return checking;
  };

  // ---------------------------------------------------------------- pemasangan

  function bytes(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }

  Updater.install = async function (onProgress) {
    var st = Updater.state;
    var f = st && st.latest && st.latest.file;
    if (!f) { await Native.call('app.openURL', { url: Sinerli.base() + '/sinai' }); return { mode: 'page' }; }
    if (f.external) { await Native.call('app.openURL', { url: f.url }); return { mode: 'store' }; }
    var job = 'upd-' + Date.now().toString(36);
    var off = Native.on('update.progress', function (p) { if (p.job === job && onProgress) onProgress(p.received, p.total); });
    try {
      var path = await Native.call('update.download', { url: f.url, sha256: f.sha256, name: f.name, size: f.size, job: job });
      if (onProgress) onProgress(-1, 0);
      return await Native.call('update.install', { path: path, kind: f.kind || kind() });
    } finally { off(); }
  };

  function installButton(btn, status, small) {
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      status.textContent = 'Mengunduh…';
      try {
        var r = await Updater.install(function (got, total) {
          if (got < 0) { status.textContent = 'Memasang pembaruan…'; return; }
          status.textContent = total ? 'Mengunduh ' + bytes(got) + ' / ' + bytes(total) + ' (' + Math.floor(got / total * 100) + '%)' : 'Mengunduh ' + bytes(got);
        });
        var mode = r && r.mode;
        if (mode === 'permission') { status.textContent = 'Izinkan Sinai memasang pembaruan di layar yang terbuka, lalu kembali dan ketuk "Perbarui sekarang" lagi.'; btn.disabled = false; return; }
        status.textContent = mode === 'restart' ? 'Sinai akan ditutup dan dibuka ulang dengan versi baru…'
          : mode === 'installer' ? 'Ikuti petunjuk pemasang. Sinai akan dibuka ulang setelah selesai.'
          : mode === 'store' || mode === 'page' ? 'Pasang versi baru dari halaman yang terbuka, lalu buka lagi Sinai.'
          : 'Berkas pembaruan sudah diunduh dan dibuka — selesaikan pemasangannya, lalu buka lagi Sinai.';
      } catch (e) {
        status.textContent = e.message + ' — coba lagi, atau unduh manual.';
        btn.disabled = false;
      }
      if (small) btn.disabled = false;
    });
  }

  function showLock(st) {
    Updater.locked = true;
    var appEl = document.getElementById('app');
    if (appEl) appEl.inert = true;
    if (lockModal && !lockModal.closed) { lockModal.render(st); return; }
    var body = h('div.update-body');
    var el = h('div.modal.small.update-lock', { role: 'alertdialog', 'aria-modal': 'true' },
      h('div.brand-logo-lg'), body);
    lockModal = UI.modal(el, { dismissible: false });
    lockModal.render = function (s) {
      body.innerHTML = '';
      var status = h('div.update-status', { role: 'status' });
      var go = h('button.btn.primary', { html: U.icon('download') + '<span>Perbarui sekarang</span>' });
      installButton(go, status);
      body.appendChild(h('h2', { text: 'Pembaruan wajib' }));
      body.appendChild(h('p.lead', { text: 'Sinai ' + s.latest.version + ' sudah tersedia. Versi ' + current() + ' di perangkat ini tidak bisa dipakai lagi sampai diperbarui.' }));
      if (s.latest.notes) body.appendChild(h('div.update-notes', { text: s.latest.notes }));
      body.appendChild(h('div.update-actions', go,
        h('button.btn.ghost', { text: 'Unduh manual', onclick: function () { Native.call('app.openURL', { url: Sinerli.base() + '/sinai' }); } }),
        h('button.btn.ghost', { text: 'Cek lagi', onclick: function () { status.textContent = 'Memeriksa…'; Updater.check({ manual: true }).then(function (r) { if (!Updater.locked) UI.toast('Sinai sudah versi terbaru'); else status.textContent = 'Masih perlu diperbarui ke ' + r.latest.version + '.'; }, function (e) { status.textContent = 'Tidak bisa terhubung ke Sinerli: ' + e.message; }); } })));
      body.appendChild(status);
    };
    lockModal.render(st);
  }

  /** Kartu kecil di Pengaturan › Tentang. */
  Updater.card = function () {
    var st = Updater.state;
    var status = h('div.hint');
    var box = h('div.section', h('h4', { text: 'Pembaruan' }));
    var newer = st && st.latest && cmp(st.latest.version, current()) > 0;
    box.appendChild(h('p.hint', { text: newer ? 'Versi ' + st.latest.version + ' tersedia' + (st.required ? ' (wajib).' : '.') : 'Sinai ' + current() + ' adalah versi terbaru' + (st && st.checkedAt ? ' (dicek ' + new Date(st.checkedAt).toLocaleString('id-ID') + ').' : '.') }));
    var row = h('div.row', { style: { gap: '8px', flexWrap: 'wrap' } });
    if (newer) { var go = h('button.btn.sm.primary', { text: 'Perbarui ke ' + st.latest.version }); installButton(go, status, true); row.appendChild(go); }
    row.appendChild(h('button.btn.sm', { text: 'Cek pembaruan', onclick: function (e) {
      var b = e.currentTarget; b.disabled = true; status.textContent = 'Memeriksa…';
      Updater.check({ manual: true }).then(function (r) {
        status.textContent = r && r.latest && cmp(r.latest.version, current()) > 0 ? 'Versi ' + r.latest.version + ' tersedia.' : 'Sudah versi terbaru.';
      }, function (err) { status.textContent = 'Gagal memeriksa: ' + err.message; }).finally(function () { b.disabled = false; });
    } }));
    box.appendChild(row);
    box.appendChild(status);
    return box;
  };

  Updater.start = function () {
    var cached = Store.settings.updateCache;
    // Status tersimpan hanya berlaku untuk server Sinerli yang sama.
    if (cached && cached.base === Sinerli.base()) apply(cached);
    Updater.check();
    setInterval(function () { Updater.check(); }, CHECK_EVERY);
    var again = function () { if (Date.now() - lastCheck > 5 * 60 * 1000) Updater.check(); };
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) again(); });
  };

  window.Updater = Updater;
})();
