/* Sinerli Apps — Copyright © 2026 Gadtan x Gallen. All rights reserved.
 * Memuat skrip alat (ditandai type="text/sn-deferred") berurutan SETELAH sesi
 * Sinerli sah, lalu memasang tombol akun di bar atas alat. */
(function () {
  'use strict';
  function load(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = resolve; s.onerror = function () { reject(new Error('Gagal memuat ' + src)); };
      document.body.appendChild(s);
    });
  }
  SN.ready.then(async function () {
    var list = Array.prototype.map.call(document.querySelectorAll('script[type="text/sn-deferred"]'), function (n) { return n.getAttribute('data-src'); });
    var seen = {};
    for (var i = 0; i < list.length; i++) { if (seen[list[i]]) continue; seen[list[i]] = 1; await load(list[i]); }
    // Bahasa alat mengikuti aplikasi (dan sebaliknya).
    if (window.SO && SO.setLang && SO.lang && SO.lang() !== SN.lang) SO.setLang(SN.lang);
    document.addEventListener('sinerli:langchange', function (e) { var l = e.detail && e.detail.lang; if (l && l !== SN.lang && (l === 'id' || l === 'en')) { SN.lang = l; SN.store.set('sinerli_lang', l); SN.applyI18n(); } });
    var tries = 0;
    (function mount() {
      var slot = document.getElementById('snAcctSlot');
      if (slot) { SN.ui.accountButton(slot); return; }
      if (++tries < 100) setTimeout(mount, 100); else SN.ui.accountButton();
    })();
  }).catch(function (e) { SN.ui.gate('error', e.message, true); });
})();
