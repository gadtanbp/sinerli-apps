/**
 * tools/office/shared/office-collab-ops.js — SO.CollabOps (Fase 7).
 *
 * Lapisan TAMBAHAN di samping SO.DocSession, bukan pengganti: DocSession
 * tetap satu-satunya yang menyimpan checkpoint utuh dokumen (revision/
 * content_hash/doc_versions) untuk mode solo & riwayat versi. SO.CollabOps
 * hanya aktif saat co-editing (share/link terbuka), mengirim & menerima
 * OPERASI kecil per field lewat api/collab_ops.php supaya perubahan
 * kolaborator lain terlihat dalam ~1.5-2 detik tanpa menunggu checkpoint
 * penuh berikutnya.
 *
 * Pemakaian dari tiap tool (App Grafik/Sinerli Dokum/Sinerli Hitara/Sinerli Present):
 *   SO.CollabOps.start('project', projectId, {
 *     onOps: function (ops) { ops.forEach(applyIncomingOp); },
 *     onPresence: function (list) { renderAvatars(list); },
 *   });
 *   SO.CollabOps.pushOp({ op: 'set', path: ['objects','obj_1','x'], value: 180 });
 *
 * Bentuk `path` sepenuhnya milik tool masing-masing — berkas ini hanya
 * meneruskannya.
 */
(function (global) {
    'use strict';
    var SO = global.SO;

    var C = SO.CollabOps = {
        _docKind: null, _docId: null, _clientId: null, _sinceId: 0,
        _handlers: {}, _pollTimer: null, _pushQueue: [], _pushTimer: null,
        _clientSeq: 0, _cursor: null, _active: false, _first: true,
        lastPresence: [], canEdit: true,

        /** Dipanggil sekali saat dokumen dibuka DAN co-editing aktif (share/link). */
        start: function (docKind, docId, handlers) {
            this.stop();
            this._docKind = docKind;
            this._docId = docId;
            this._handlers = handlers || {};
            this._sinceId = 0;
            this._first = true;
            this._active = true;
            if (!this._clientId) {
                this._clientId = 'tab_' + Math.random().toString(36).slice(2, 10);
            }
            this._scheduleNextPoll(300);
        },

        stop: function () {
            this._active = false;
            if (this._pollTimer) clearTimeout(this._pollTimer);
            if (this._pushTimer) clearTimeout(this._pushTimer);
            this._pollTimer = this._pushTimer = null;
            this._pushQueue = [];
        },

        /** Posisi kursor/objek terpilih saat ini, dikirim bersama poll berikutnya. */
        setCursor: function (cursor) { this._cursor = cursor || null; },

        /** Antre satu operasi; dikirim dalam batch pendek (50ms) supaya ketikan cepat tidak jadi satu request per huruf. */
        pushOp: function (op) {
            if (!this._active) return;
            op.client_seq = ++this._clientSeq;
            this._pushQueue.push(op);
            if (this._pushTimer) return;
            var self = this;
            this._pushTimer = setTimeout(function () { self._flushPush(); }, 50);
        },

        _flushPush: function () {
            this._pushTimer = null;
            if (!this._pushQueue.length) return;
            var ops = this._pushQueue;
            this._pushQueue = [];
            var url = SO.root + 'api/collab_ops.php?action=push&doc_kind=' + this._docKind +
                '&doc_id=' + this._docId + '&client_id=' + this._clientId + SO.cloud._shareQ();
            SO.cloud._req(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ops: ops, cursor: this._cursor })
            }).catch(function () { /* op hilang tidak fatal — checkpoint DocSession berikutnya tetap benar */ });
        },

        _scheduleNextPoll: function (delay) {
            if (!this._active) return;
            var self = this;
            this._pollTimer = setTimeout(function () { self._poll(); }, delay);
        },

        _poll: function () {
            if (!this._active) return;
            var self = this;
            var cur = this._cursor;
            var cursorQ = cur ? ('&cx=' + encodeURIComponent(cur.x) + '&cy=' + encodeURIComponent(cur.y)) : '';
            var url = SO.root + 'api/collab_ops.php?action=poll&doc_kind=' + this._docKind +
                '&doc_id=' + this._docId + '&client_id=' + this._clientId +
                '&since_id=' + this._sinceId + cursorQ + SO.cloud._shareQ() +
                // Long-poll: server menahan jawaban sampai ada op baru (maks. 8 dtk).
                (this._first ? '' : '&wait=8');
            SO.cloud._req(url, { timeout: 20000 }).then(function (data) {
                if (!self._active) return;
                self._sinceId = data.since_id || self._sinceId;
                // skipBacklog: op lama (sebelum dokumen dibuka) sudah tercakup isi yang dimuat dari cloud.
                var skip = self._first && self._handlers.skipBacklog;
                self._first = false;
                self.lastPresence = data.presence || [];
                self.canEdit = !!data.can_edit;
                var own = skip ? [] : (data.ops || []).filter(function (o) { return o.client_id !== self._clientId; });
                if (own.length && self._handlers.onOps) self._handlers.onOps(own);
                if (self._handlers.onPresence) self._handlers.onPresence(data.presence || []);
                if (self._handlers.onCanEdit) self._handlers.onCanEdit(!!data.can_edit);
                // Long-poll sudah menunggu di server: bila ada peserta lain langsung
                // poll lagi; sendiri saja -> jeda 1,5 detik di antara long-poll.
                self._scheduleNextPoll((data.presence && data.presence.length) ? 20 : 1500);
            }).catch(function () {
                self._scheduleNextPoll(5000); // jaringan bermasalah — coba lagi lebih jarang
            });
        }
    };
})(window);
