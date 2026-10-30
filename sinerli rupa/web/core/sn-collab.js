/* Sinerli Apps — Copyright © 2026 Gadtan x Gallen. All rights reserved.
 *
 * SN.Collab — kolaborasi langsung banyak orang di satu dokumen (Rupa & Note).
 *
 * Model data: dokumen = kumpulan entitas {id → {field → nilai}}. Setiap field
 * adalah register LWW (last-writer-wins) dengan jam Lamport + client id
 * sebagai pemecah seri, jadi semua peserta selalu konvergen ke isi yang sama
 * tanpa server perlu memahami isinya, berapa pun jumlah editornya, dan urutan
 * op yang tiba tidak berpengaruh. Hapus = field `_del`, urutan = field `_o`
 * (indeks pecahan, lihat SN.Collab.between).
 *
 * Transport: api/collab_ops.php (push batch 30 ms + long-poll ?wait=8),
 * sama dengan SineDoc/SineEx/SineSlide di web. Snapshot dokumen disimpan biasa
 * lewat api/projects.php; jam per field ikut di snapshot sehingga op lama yang
 * diputar ulang setelah membuka dokumen tidak menimpa isi yang lebih baru.
 */
(function (global) {
  'use strict';
  var SN = global.SN;

  function clientId() { var b = new Uint8Array(9); crypto.getRandomValues(b); return 'c' + Array.from(b, function (x) { return x.toString(16).padStart(2, '0'); }).join(''); }

  function Room(opt) {
    this.docId = opt.docId;
    this.share = opt.share || '';
    this.client = clientId();
    this.clock = 0;
    this.clocks = opt.clocks || {};          // "id\u0001field" → [t, client]
    this.since = opt.since || 0;
    this.onOps = opt.onOps || function () {};
    this.onPresence = opt.onPresence || function () {};
    this.onStatus = opt.onStatus || function () {};
    this.peers = [];
    this.canEdit = true;
    this.queue = [];
    this.cursor = null;
    this.cursorDirty = false;
    this.active = true;
    this.first = true;
    var self = this;
    Object.keys(this.clocks).forEach(function (k) { self.clock = Math.max(self.clock, self.clocks[k][0]); });
    this._poll();
  }

  Room.prototype._url = function (action) {
    return 'api/collab_ops.php?action=' + action + '&doc_kind=project&doc_id=' + encodeURIComponent(this.docId) + '&client_id=' + this.client + (this.share ? '&share=' + encodeURIComponent(this.share) : '');
  };

  /** Ubah satu field. Kembalikan false bila tidak berubah. Pemanggil sudah menerapkan nilainya secara lokal. */
  Room.prototype.set = function (id, field, value) {
    if (!this.canEdit) return false;
    var key = id + '\u0001' + field;
    this.clock += 1;
    this.clocks[key] = [this.clock, this.client];
    this.queue.push({ op: 'set', path: [id, field], value: { v: value, t: this.clock, c: this.client } });
    this._schedulePush();
    return true;
  };
  Room.prototype.setMany = function (id, fields) { var self = this; Object.keys(fields).forEach(function (f) { self.set(id, f, fields[f]); }); };
  Room.prototype.remove = function (id) { return this.set(id, '_del', 1); };

  Room.prototype.setCursor = function (c) { this.cursor = c; this.cursorDirty = true; this._schedulePush(); };

  Room.prototype._schedulePush = function () {
    if (this.pushTimer || !this.active) return;
    var self = this;
    this.pushTimer = setTimeout(function () { self._push(); }, this.peers.length ? 30 : 120);
  };
  Room.prototype._push = async function () {
    this.pushTimer = null;
    if (!this.queue.length && !this.cursorDirty) return;
    var ops = this.queue.splice(0, 400);
    var body = { ops: ops };
    if (this.cursorDirty) { body.cursor = this.cursor; this.cursorDirty = false; }
    try {
      await SN.api(this._url('push'), { json: body, timeout: 20 });
      this.onStatus('ok');
    } catch (e) {
      if (e.status === 403) { this.canEdit = false; this.onStatus('readonly'); return; }
      this.queue = ops.concat(this.queue);   // jaringan putus: kirim ulang nanti
      this.onStatus('offline');
      var self = this;
      setTimeout(function () { self._schedulePush(); }, 2500);
      return;
    }
    if (this.queue.length) this._schedulePush();
  };

  /** Terapkan op dari server; kembalikan daftar perubahan yang menang LWW. */
  Room.prototype.merge = function (rows) {
    var out = [], self = this;
    rows.forEach(function (r) {
      if (r.op !== 'set' || !r.path || !r.value) return;
      var v = r.value, key = r.path[0] + '\u0001' + r.path[1];
      var cur = self.clocks[key];
      self.clock = Math.max(self.clock, v.t || 0);
      if (cur && (cur[0] > v.t || (cur[0] === v.t && cur[1] >= v.c))) return;
      self.clocks[key] = [v.t, v.c];
      out.push({ id: r.path[0], k: r.path[1], v: v.v, by: r.author_email });
    });
    return out;
  };

  Room.prototype._poll = async function () {
    if (!this.active) return;
    var self = this, delay = 20;
    try {
      var d = await SN.api(this._url('poll') + '&since_id=' + this.since + (this.first ? '' : '&wait=8'), { timeout: 25 });
      this.first = false;
      this.since = d.since_id || this.since;
      this.canEdit = !!d.can_edit;
      var foreign = (d.ops || []).filter(function (o) { return o.client_id !== self.client; });
      var changes = this.merge(foreign);
      if (changes.length) this.onOps(changes);
      this.peers = d.presence || [];
      this.onPresence(this.peers);
      this.onStatus('ok');
      if (!this.peers.length) delay = 1200;
    } catch (e) {
      this.onStatus(e.status === 403 ? 'denied' : 'offline');
      delay = e.status === 403 ? 15000 : 3000;
    }
    this.pollTimer = setTimeout(function () { self._poll(); }, delay);
  };

  Room.prototype.leave = function () {
    this.active = false;
    clearTimeout(this.pollTimer);
    if (this.queue.length) this._push();
  };
  /** Disimpan bersama snapshot dokumen. */
  Room.prototype.state = function () { return { clocks: this.clocks, since: this.since }; };

  /* Indeks pecahan: string base-36 di antara a dan b (a < hasil < b). */
  var DIG = '0123456789abcdefghijklmnopqrstuvwxyz';
  function between(a, b) {
    a = a || ''; b = b || '';
    var out = '', i = 0;
    for (;;) {
      var ca = i < a.length ? DIG.indexOf(a[i]) : 0;
      var cb = i < b.length ? DIG.indexOf(b[i]) : 36;
      if (cb - ca > 1) { out += DIG[Math.floor((ca + cb) / 2)]; break; }
      out += DIG[ca];
      if (cb - ca === 1) b = '';   // setelah digit ini apa pun sudah > a dan < b
      i++;
    }
    return out + DIG[1 + Math.floor(Math.random() * 8)];   // akhiran acak: dua penyisipan bersamaan tetap beda
  }

  SN.Collab = { join: function (opt) { return new Room(opt); }, between: between };

  /* ========================================================== dokumen cloud */
  // Pembungkus api/projects.php + api/project_share.php (sama dengan web).
  SN.Docs = {
    list: async function (type) { var d = await SN.api('api/projects.php?meta=1&type=' + encodeURIComponent(type)); return (d.projects || []).filter(function (p) { return p.type === type; }); },
    listAll: async function () { var d = await SN.api('api/projects.php?meta=1'); return d.projects || []; },
    load: async function (id, share) {
      var d = await SN.api('api/projects.php?id=' + encodeURIComponent(id) + (share ? '&share=' + encodeURIComponent(share) : ''));
      var p = (d.projects || []).filter(function (x) { return String(x.id) === String(id); })[0];
      if (!p) throw new Error('not found');
      if (typeof p.content === 'string') { try { p.content = JSON.parse(p.content); } catch (e) { p.content = null; } }
      p.revision = parseInt(p.revision, 10) || 0;
      return p;
    },
    /** {id?, filename?, name, type, content(object), thumbnail?, base_revision?} */
    save: async function (p) {
      // Server meng-encode `content` sendiri (json_encode), jadi dikirim sebagai objek.
      var body = Object.assign({ user_email: SN.ctx.email, canvas_width: p.width || 0, canvas_height: p.height || 0 }, p);
      delete body.width; delete body.height;
      var size = JSON.stringify(body).length;
      return SN.api('api/projects.php', { json: body, timeout: 60 + Math.round(size / 40000) });
    },
    remove: function (filename) { return SN.api('api/projects.php?filename=' + encodeURIComponent(filename), { method: 'DELETE' }); },
    shareSettings: function (id) { return SN.api('api/project_share.php?action=settings&id=' + encodeURIComponent(id)); },
    setLink: function (id, role) { return SN.api('api/project_share.php', { json: { action: 'link', id: id, link_role: role } }); },
    invite: function (id, emails, role) { return SN.api('api/project_share.php', { json: { action: 'invite', id: id, emails: emails, role: role } }); },
    member: function (id, email, role) { return SN.api('api/project_share.php', { json: { action: 'member', id: id, email: email, role: role } }); },
    sharedWithMe: function () { return SN.api('api/project_share.php?action=shared_with_me'); },
    openShared: function (token) { return SN.api('api/project_share.php?action=open&token=' + encodeURIComponent(token)); }
  };

  /* ==================================================== dialog Bagikan */
  SN.i18n.add({
    id: { sh_title: 'Bagikan & kolaborasi', sh_invite: 'Undang lewat email', sh_emails: 'email1@contoh.com, email2@contoh.com', sh_send: 'Undang', sh_link: 'Akses tautan', sh_none: 'Hanya yang diundang', sh_view: 'Siapa pun dengan tautan: lihat', sh_comment: 'Siapa pun dengan tautan: komentar', sh_edit: 'Siapa pun dengan tautan: edit', sh_copy: 'Salin tautan', sh_copied: 'Tautan disalin', sh_members: 'Anggota', sh_role_view: 'Lihat', sh_role_comment: 'Komentar', sh_role_edit: 'Edit', sh_remove: 'Hapus', sh_owner: 'Pemilik', sh_save_first: 'Simpan dokumen ke cloud dulu untuk membagikannya.', sh_invited: 'Undangan terkirim' },
    en: { sh_title: 'Share & collaborate', sh_invite: 'Invite by email', sh_emails: 'email1@example.com, email2@example.com', sh_send: 'Invite', sh_link: 'Link access', sh_none: 'Invited people only', sh_view: 'Anyone with the link: view', sh_comment: 'Anyone with the link: comment', sh_edit: 'Anyone with the link: edit', sh_copy: 'Copy link', sh_copied: 'Link copied', sh_members: 'Members', sh_role_view: 'View', sh_role_comment: 'Comment', sh_role_edit: 'Edit', sh_remove: 'Remove', sh_owner: 'Owner', sh_save_first: 'Save the document to the cloud first to share it.', sh_invited: 'Invitation sent' }
  });
  SN.shareDialog = async function (projectId, linkPath) {
    if (!projectId) { SN.ui.toast(SN.t('sh_save_first'), 'warn'); return; }
    var bd = SN.el('div', { class: 'sn-modal-bd' });
    bd.innerHTML = '<div class="sn-modal sn-share"><h3 style="margin:0 0 14px">' + SN.esc(SN.t('sh_title')) + '</h3><div class="sn-spinner"></div></div>';
    doc().body.appendChild(bd);
    bd.addEventListener('click', function (e) { if (e.target === bd) bd.remove(); });
    var box = bd.querySelector('.sn-share');
    async function render() {
      var s;
      try { s = await SN.Docs.shareSettings(projectId); } catch (e) { box.innerHTML = '<p>' + SN.esc(e.message) + '</p>'; return; }
      var link = (linkPath || ('sinerli-' + SN.app.id + '://open?share=')) + (s.token || '');   // membuka aplikasi native langsung
      var role = s.link_role && s.link_role !== 'none' ? s.link_role : 'none';
      var roles = ['view', 'comment', 'edit'];
      box.innerHTML = '<h3 style="margin:0 0 14px">' + SN.esc(SN.t('sh_title')) + '</h3>' +
        '<label class="sn-panel-lbl">' + SN.esc(SN.t('sh_invite')) + '</label>' +
        '<div style="display:flex;gap:6px"><input class="sn-input" style="margin:0" data-f="emails" placeholder="' + SN.esc(SN.t('sh_emails')) + '"><select class="sn-input" style="margin:0;width:110px" data-f="role">' + roles.map(function (r) { return '<option value="' + r + '"' + (r === 'edit' ? ' selected' : '') + '>' + SN.esc(SN.t('sh_role_' + r)) + '</option>'; }).join('') + '</select><button class="sn-btn sn-btn-primary" data-a="invite">' + SN.esc(SN.t('sh_send')) + '</button></div>' +
        '<label class="sn-panel-lbl">' + SN.esc(SN.t('sh_link')) + '</label>' +
        '<select class="sn-input" style="margin:0" data-f="link">' + ['none'].concat(roles).map(function (r) { return '<option value="' + r + '"' + (r === role ? ' selected' : '') + '>' + SN.esc(SN.t('sh_' + r)) + '</option>'; }).join('') + '</select>' +
        (role !== 'none' ? '<div style="display:flex;gap:6px;margin-top:8px"><input class="sn-input" style="margin:0" readonly value="' + SN.esc(link) + '"><button class="sn-btn" data-a="copy">' + SN.esc(SN.t('sh_copy')) + '</button></div>' : '') +
        '<label class="sn-panel-lbl">' + SN.esc(SN.t('sh_members')) + '</label><div class="sn-members">' +
        '<div class="sn-mem"><span>' + SN.esc(SN.ctx.email) + '</span><em>' + SN.esc(SN.t('sh_owner')) + '</em></div>' +
        (s.members || []).map(function (m) {
          return '<div class="sn-mem"><span>' + SN.esc(m.email || m.member_email) + '</span><select data-mem="' + SN.esc(m.email || m.member_email) + '">' + roles.concat(['remove']).map(function (r) { return '<option value="' + r + '"' + (r === m.role ? ' selected' : '') + '>' + SN.esc(SN.t(r === 'remove' ? 'sh_remove' : 'sh_role_' + r)) + '</option>'; }).join('') + '</select></div>';
        }).join('') + '</div>' +
        '<div class="sn-modal-act"><button class="sn-btn" data-a="close">' + SN.esc(SN.t('sn_close')) + '</button></div>';
    }
    box.addEventListener('click', async function (e) {
      var a = e.target.closest('[data-a]');
      if (!a) return;
      var act = a.getAttribute('data-a');
      if (act === 'close') bd.remove();
      if (act === 'copy') { try { await navigator.clipboard.writeText(box.querySelector('input[readonly]').value); } catch (x) {} SN.ui.toast(SN.t('sh_copied')); }
      if (act === 'invite') {
        var emails = box.querySelector('[data-f=emails]').value.split(/[\s,;]+/).filter(function (x) { return /@/.test(x); });
        if (!emails.length) return;
        try { await SN.Docs.invite(projectId, emails, box.querySelector('[data-f=role]').value); SN.ui.toast(SN.t('sh_invited')); render(); } catch (x) { SN.ui.toast(x.message, 'err'); }
      }
    });
    box.addEventListener('change', async function (e) {
      try {
        if (e.target.matches('[data-f=link]')) { await SN.Docs.setLink(projectId, e.target.value); render(); }
        if (e.target.matches('[data-mem]')) { await SN.Docs.member(projectId, e.target.getAttribute('data-mem'), e.target.value); render(); }
      } catch (x) { SN.ui.toast(x.data && x.data.code === 'upgrade_required' ? SN.t('sn_premium_only') : x.message, 'err'); }
    });
    render();
  };
  function doc() { return global.document; }
})(window);
