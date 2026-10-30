# Perubahan server Sinerli (folder `SInerli web`) — sudah di-upload 30 Okt 2026

| Berkas | Perubahan |
|---|---|
| `api/connect.php` | Rute baru **`POST /connect/tool-key`** (Bearer token klien `sc_sinerli_apps`) → kunci alat akun + paket + izin per aplikasi. `ai-key` kini juga menerima klien `sc_sinai` (izin `sinai.access`). |
| `.htaccess` | `tool-key` ditambahkan ke rute `/connect/*`. |
| `api/db_migrations.php` | Mendaftarkan klien OAuth **`sc_sinerli_apps`** (loopback 33440–33443 + `com.sinerli.apps:/oauth/callback`, izin `rupa/dokum/hitara/present/note.access`) dan **`sc_sinai`** (33430–33433 + `com.sinerli.sinai:/oauth/callback`, izin `sinai.access`). Berjalan otomatis sekali setelah deploy. |
| `api/collab_ops.php` | **Long-poll** `?wait=N` (maks. 8 dtk) memakai berkas sinyal kecil di folder temp — kolaborasi jauh lebih cepat tanpa WebSocket, tanpa beban DB tambahan. |
| `api/gadex_sync.php` | Menerima token `sc_sinai` (sinkron perangkat Sinai). |
| `shared/lib/project_share.php`, `api/project_share.php` | `rupa` & `snote_ws` boleh dibagikan; `shared_with_me` kini menyertakan `type`. Edit/komentar untuk orang lain tetap fitur Premium (diperiksa server). |
| `api/projects.php` | `rupa` dan `snote_ws` masuk `PROJECT_VERSIONED_TYPES` (riwayat versi Rupa & Note). |
| `tools/office/shared/office-collab-ops.js` | Versi web SineDoc/SineEX/SineSlide ikut memakai long-poll & batch 50 ms. |

Uji setelah deploy:

```bash
curl -s https://sinerli.com/.well-known/sinerli-connect
```

Belum dikerjakan (tindak lanjut): halaman unduhan & kanal rilis untuk Sinerli Apps dan Sinai
(`/sinai/update`, `/download?app=…`).
