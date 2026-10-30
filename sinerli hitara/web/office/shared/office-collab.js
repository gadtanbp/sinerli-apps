/**
 * Sinerli Office — Engine Kolaborasi Live & Pengaturan Berbagi (Share System)
 * Sinerli Dokum, Sinerli Hitara, Sinerli Present
 */
(function (global) {
    'use strict';

    var SO = global.SO = global.SO || {};
    var doc = document;

    var Collab = function () {
        this.docId = this.getDocId();
        this.accessLevel = 'edit'; // 'edit', 'comment', 'view'
        this.userId = 'usr_' + Math.random().toString(36).slice(2, 9);
        this.userName = SO.ctx ? (SO.ctx.name || 'Pengguna Sinerli') : 'Pengguna Sinerli';
        this.userAvatar = SO.ctx && SO.ctx.photo ? SO.ctx.photo : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(this.userName) + '&background=4f46e5&color=fff';
        this.onlineUsers = [];
        this.comments = [];
        this.pingInterval = null;
        this.init();
    };

    Collab.prototype.getDocId = function () {
        var p = new URLSearchParams(global.location.search);
        return p.get('id') || p.get('doc') || 'doc_' + global.location.pathname.replace(/[^a-z0-9]/gi, '_');
    };

    Collab.prototype.init = function () {
        var self = this;
        // Start ping loop
        this.ping();
        this.pingInterval = setInterval(function () { self.ping(); }, 3000);

        // Bind global share button if clicked
        doc.addEventListener('click', function (e) {
            var btn = e.target.closest('#soShareBtn, .so-btn-share');
            if (btn) {
                e.preventDefault();
                self.openShareModal();
            }
        });
    };

    // Fase 7: presence sekarang dari api/collab_ops.php (tabel doc_presence,
    // MySQL) — bukan lagi berkas JSON tools/office/data_collab/ yang terpisah
    // dari project_shares/project_share_members sehingga tidak menegakkan
    // akses apa pun. Dokumen ini butuh id projek NYATA (SO.ctx.projectId);
    // sebelum tersedia (belum tersimpan sekali pun), presence tidak dikirim.
    Collab.prototype.ping = function (customData) {
        var self = this;
        var projectId = SO && SO.ctx ? SO.ctx.projectId : null;
        if (!projectId || !SO.cloud || !SO.cloud.available()) return;
        // Siaran langsung DocSession sudah mem-poll dokumen yang sama — pakai
        // hasilnya, jangan poll kedua kali (yang juga ikut mengunduh snapshot).
        if (SO.CollabOps && SO.CollabOps._active) {
            this.userId = SO.CollabOps._clientId;
            this._applyPresence({ presence: SO.CollabOps.lastPresence, can_edit: SO.CollabOps.canEdit });
            return;
        }

        var cursor = (customData && customData.cursor) || null;
        var cursorQ = cursor ? ('&cx=' + encodeURIComponent(cursor.x) + '&cy=' + encodeURIComponent(cursor.y)) : '';
        var url = SO.root + 'api/collab_ops.php?action=poll&doc_kind=project&doc_id=' + encodeURIComponent(projectId) +
            // Ping ini hanya butuh presence. since_id=0 dulu membuat server
            // mengirim ulang hingga 500 op (termasuk snapshot isi dokumen) setiap
            // 3 detik untuk dibuang — parse JSON besar berkala di main thread.
            '&client_id=' + encodeURIComponent(this.userId) + '&since_id=' + Number.MAX_SAFE_INTEGER + cursorQ + (SO.cloud._shareQ ? SO.cloud._shareQ() : '');

        SO.cloud._req(url).then(function (data) { self._applyPresence(data); })
            .catch(function () { /* silent — presence tidak boleh mengganggu autosave */ });
    };

    Collab.prototype._applyPresence = function (data) {
        this.onlineUsers = (data.presence || []).map(function (p) {
            return { user_id: p.client_id, user_name: p.display_name, user_avatar: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(p.display_name) + '&background=4f46e5&color=fff', active_item: null };
        });
        if (data.can_edit === false && this.accessLevel !== 'view') this.setAccessLevel('view');
        this.renderCollaboratorAvatars();
        this.renderRemoteCursors();
    };

    Collab.prototype.getActiveItem = function () {
        // Detect current focused element or cell
        var active = doc.activeElement;
        if (active) {
            if (active.dataset && active.dataset.cell) return active.dataset.cell;
            if (active.id) return active.id;
        }
        return 'node_main';
    };

    Collab.prototype.setAccessLevel = function (level) {
        this.accessLevel = level; // 'edit', 'comment', 'view'
        var body = doc.body;
        body.classList.remove('collab-mode-edit', 'collab-mode-comment', 'collab-mode-view');
        body.classList.add('collab-mode-' + level);

        // Lock / Unlock editors
        var editors = doc.querySelectorAll('.sd-editor, .se-canvas, .ss-stage, [contenteditable]');
        if (level === 'view') {
            editors.forEach(function (el) {
                if (el.hasAttribute('contenteditable')) el.setAttribute('contenteditable', 'false');
                el.style.pointerEvents = 'none';
            });
            this.showModeBanner('👁️ Mode Hanya Lihat (View Only) — Anda tidak dapat mengubah isi dokumen ini.');
        } else if (level === 'comment') {
            editors.forEach(function (el) {
                if (el.hasAttribute('contenteditable')) el.setAttribute('contenteditable', 'false');
            });
            this.showModeBanner('💬 Mode Komentar (Comment Only) — Anda dapat melihat dan memberi komentar.');
        } else {
            editors.forEach(function (el) {
                if (el.classList.contains('sd-editor')) el.setAttribute('contenteditable', 'true');
                el.style.pointerEvents = 'auto';
            });
            this.removeModeBanner();
        }
    };

    Collab.prototype.showModeBanner = function (text) {
        var banner = doc.getElementById('soCollabModeBanner');
        if (!banner) {
            banner = SO.el('div', { id: 'soCollabModeBanner', class: 'so-collab-banner' });
            doc.body.prepend(banner);
        }
        banner.textContent = text;
    };

    Collab.prototype.removeModeBanner = function () {
        var banner = doc.getElementById('soCollabModeBanner');
        if (banner) banner.remove();
    };

    Collab.prototype.renderCollaboratorAvatars = function () {
        var container = doc.getElementById('soCollabAvatars');
        if (!container) return;

        container.innerHTML = '';
        var list = this.onlineUsers.slice(0, 5);
        list.forEach(function (u) {
            var img = SO.el('img', {
                class: 'so-collab-avatar',
                src: u.user_avatar,
                title: u.user_name + ' (Aktif online)',
                alt: u.user_name
            });
            container.appendChild(img);
        });

        if (this.onlineUsers.length > 5) {
            var extra = SO.el('span', { class: 'so-collab-extra', text: '+' + (this.onlineUsers.length - 5) });
            container.appendChild(extra);
        }
    };

    Collab.prototype.renderRemoteCursors = function () {
        // Remove existing remote cursor badges
        doc.querySelectorAll('.so-remote-cursor').forEach(function (n) { n.remove(); });

        var self = this;
        this.onlineUsers.forEach(function (u) {
            if (u.user_id === self.userId) return; // skip self
            if (!u.active_item) return;

            var targetNode = doc.getElementById(u.active_item) || doc.querySelector('[data-cell="' + u.active_item + '"]');
            if (targetNode) {
                var badge = SO.el('div', { class: 'so-remote-cursor', text: u.user_name });
                targetNode.appendChild(badge);
            }
        });
    };

    Collab.prototype.openShareModal = function () {
        var self = this;
        var currentUrl = global.location.href;

        SO.dialog({
            title: 'Bagikan Dokumen & Hak Akses',
            width: 480,
            body: function (bodyEl) {
                bodyEl.classList.add('so-share-dialog-body');
                bodyEl.innerHTML = `
                    <div style="margin-bottom:14px;margin-top:4px;">
                        <label style="font-weight:700;font-size:0.82rem;display:block;margin-bottom:6px;color:var(--so-text);">Tautan Berbagi Dokumen</label>
                        <div style="display:flex;gap:8px;">
                            <input type="text" id="shareUrlInput" value="${SO.esc(currentUrl)}" readonly style="flex:1;padding:8px 12px;border:1px solid var(--so-border-strong);border-radius:8px;font-size:0.8rem;background:var(--so-surface-2);color:var(--so-text);outline:none;">
                            <button type="button" id="copyShareBtn" class="so-btn is-primary" style="padding:8px 14px;border-radius:8px;font-weight:600;font-size:0.8rem;white-space:nowrap;"><i class="fas fa-copy"></i> Salin Link</button>
                        </div>
                    </div>

                    <div style="margin-bottom:14px;padding-top:12px;border-top:1px solid var(--so-border);">
                        <label style="font-weight:700;font-size:0.82rem;display:block;margin-bottom:6px;color:var(--so-text);">Akses Siapa Saja yang Punya Link</label>
                        <select id="accessLevelSelect" class="so-select" style="width:100%;padding:8px 12px;border:1px solid var(--so-border-strong);border-radius:8px;font-size:0.85rem;font-weight:600;background:var(--so-surface);color:var(--so-text);">
                            <option value="edit" ${self.accessLevel === 'edit' ? 'selected' : ''}>✏️ Akses Penuh (Bisa Mengedit)</option>
                            <option value="comment" ${self.accessLevel === 'comment' ? 'selected' : ''}>💬 Komentar (Hanya Bisa Memberi Komentar)</option>
                            <option value="view" ${self.accessLevel === 'view' ? 'selected' : ''}>👁️ Lihat (Hanya Bisa Melihat Dokumen)</option>
                        </select>
                    </div>

                    <div style="margin-bottom:10px;padding-top:12px;border-top:1px solid var(--so-border);">
                        <label style="font-weight:700;font-size:0.82rem;display:block;margin-bottom:6px;color:var(--so-text);">Kolaborator Aktif Saat Ini (${self.onlineUsers.length})</label>
                        <div id="collabUsersList" style="max-height:120px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding-right:2px;"></div>
                    </div>
                `;

                setTimeout(function () {
                    var copyBtn = doc.getElementById('copyShareBtn');
                    if (copyBtn) {
                        copyBtn.addEventListener('click', function () {
                            var input = doc.getElementById('shareUrlInput');
                            if (input) {
                                input.select();
                                navigator.clipboard.writeText(input.value);
                                SO.toast('Tautan berhasil disalin ke papan klip!', { type: 'success' });
                            }
                        });
                    }

                    var accessSelect = doc.getElementById('accessLevelSelect');
                    if (accessSelect) {
                        accessSelect.addEventListener('change', function () {
                            self.updateAccessLevel(accessSelect.value);
                        });
                    }

                    var listContainer = doc.getElementById('collabUsersList');
                    if (listContainer) {
                        if (self.onlineUsers.length === 0) {
                            listContainer.innerHTML = '<div style="font-size:0.8rem;color:var(--so-muted);font-style:italic;padding:4px 0;">Belum ada kolaborator lain.</div>';
                        } else {
                            self.onlineUsers.forEach(function (u) {
                                var item = SO.el('div', { style: 'display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--so-surface-2);border-radius:6px;' });
                                item.innerHTML = `<img src="${SO.esc(u.user_avatar)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;">
                                    <span style="font-size:0.8rem;font-weight:600;color:var(--so-text);flex:1;">${SO.esc(u.user_name)}</span>
                                    <span style="font-size:0.7rem;color:#10b981;font-weight:700;">● Online</span>`;
                                listContainer.appendChild(item);
                            });
                        }
                    }
                }, 50);
            },
            buttons: [{ label: 'c_close', primary: true, value: true }]
        });
    };

    Collab.prototype.updateAccessLevel = function (newLevel) {
        var self = this;
        fetch(SO.root + 'tools/office/api/collab.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_share_info',
                doc_id: this.docId,
                access_level: newLevel
            })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data.success) {
                self.setAccessLevel(newLevel);
                SO.toast('Hak akses berhasil diperbarui!', { type: 'success' });
            }
        });
    };

    SO.Collab = new Collab();
})(window);
