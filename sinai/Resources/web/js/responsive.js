/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Tata letak layar sempit (ponsel, atau jendela desktop yang dipersempit):
   sidebar menjadi laci geser, panel/kanvas menjadi layar penuh. Di Android &
   iOS, mode Code (butuh shell & sistem berkas komputer) disembunyikan. */
(function () {
  'use strict';
  var Responsive = {};
  var BREAK = 760;
  var app = null, scrim = null;

  Responsive.compact = function () { return window.innerWidth <= BREAK; };

  function sync() {
    var c = Responsive.compact();
    app.classList.toggle('compact', c);
    if (!c) app.classList.remove('m-drawer');
  }

  Responsive.openDrawer = function (open) {
    app.classList.toggle('m-drawer', open !== false);
  };

  Responsive.init = function () {
    app = document.getElementById('app');
    var mobile = U.isMobile();
    document.documentElement.classList.toggle('mobile', mobile);
    if (mobile) document.documentElement.classList.add('touch');
    else if (window.matchMedia && matchMedia('(hover: none)').matches) document.documentElement.classList.add('touch');

    scrim = U.h('div.m-scrim', { onclick: function () { Responsive.openDrawer(false); } });
    app.appendChild(scrim);

    // Di layar sempit tombol sidebar membuka/menutup laci, bukan melipat sidebar.
    var toggle = App.toggleSidebar;
    App.toggleSidebar = function () {
      if (Responsive.compact()) { app.classList.toggle('m-drawer'); return; }
      toggle();
    };

    // Memilih sesuatu di laci langsung menutupnya.
    document.getElementById('sidebar').addEventListener('click', function (e) {
      if (!Responsive.compact()) return;
      var t = e.target;
      if (t.closest('.more') || t.closest('input') || t.closest('#search')) return;
      if (t.closest('.conv-item') || t.closest('#btn-new') || t.closest('.mode-switch button') || t.closest('#btn-settings') || t.closest('.sb-link')) {
        setTimeout(function () { Responsive.openDrawer(false); }, 60);
      }
    });

    // Geser dari tepi kiri untuk membuka laci, geser ke kiri untuk menutup.
    var sx = 0, sy = 0, edge = false;
    document.addEventListener('touchstart', function (e) {
      if (!Responsive.compact() || e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      edge = sx < 24 || app.classList.contains('m-drawer');
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (!edge || !e.changedTouches.length) return;
      var dx = e.changedTouches[0].clientX - sx, dy = Math.abs(e.changedTouches[0].clientY - sy);
      if (dy > 60) return;
      if (dx > 70 && !app.classList.contains('m-drawer') && !UI.hasOverlay()) Responsive.openDrawer(true);
      else if (dx < -70 && app.classList.contains('m-drawer')) Responsive.openDrawer(false);
    }, { passive: true });

    if (mobile) {
      // Mode Code butuh shell & folder proyek di komputer.
      var codeBtn = document.querySelector('.mode-switch button[data-mode="code"]');
      if (codeBtn) codeBtn.remove();
      var newConv = App.newConversation;
      App.newConversation = function (mode, opts) { return newConv(mode === 'code' ? 'chat' : mode, opts); };
      var setMode = App.setMode;
      App.setMode = function (mode) { return setMode(mode === 'code' ? 'chat' : mode); };
      // Ponsel tidak punya label hak cipta native di pojok jendela: tampil samar di kaki laci.
      var sub = document.getElementById('brand-sub');
      if (sub) sub.textContent = 'AI Chat & Design';
      var foot = document.querySelector('.sb-foot');
      if (foot) foot.appendChild(U.h('div.sb-copyright', { text: App.copyright() }));
    }

    window.addEventListener('resize', U.throttle(sync, 120));
    sync();
  };

  window.Responsive = Responsive;
})();
