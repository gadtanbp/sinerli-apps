# Sinerli Apps — Rupa · Dokum · Hitara · Present · Note · Sinai

**© Gadtan x Gallen** — Copyright © 2026. All rights reserved.

Enam aplikasi native Sinerli untuk **Windows, macOS, Linux, dan Android**. Semua wajib masuk dengan akun Sinerli, membaca paket langganan dari akun, dan menyimpan progres ke akun yang sama (antar-aplikasi, antar-perangkat, dan dengan versi web).

| Folder | Aplikasi | Asal | Isi |
|---|---|---|---|
| `sinerli rupa/` | **Sinerli Rupa** | dibangun baru | Satu kanvas dengan 4 mode: **Foto** (lapisan, kuas, penghapus, stempel klon, dodge/burn, ember cat, seleksi kotak/elips/laso/tongkat ajaib, crop, 13 penyesuaian + preset, mode campur), **Vektor** (pena bezier, edit titik, pensil, bentuk, boolean gabung/kurangi/iris/kecualikan, outline stroke, impor/ekspor SVG), **Papan** (sticky, konektor lurus/siku/lengkung, spidol, stabilo, bagian, template alur/peta pikiran/kanban/retro/journey/SWOT, voting, timer bersama), **Desain UI** (frame preset perangkat, auto-layout, grid kolom, komponen & instance, prototipe klik antar-frame + presentasi, inspeksi CSS). Plus halaman, lapisan, komentar, riwayat versi, ekspor PNG/JPG/WebP/SVG/PDF. API pihak ketiga (hapus latar AI, aset) **tidak ada**. |
| `sinerli dokum/` | **Sinerli Dokum** | port SineDoc | Pengolah dokumen (port otomatis dari `SInerli web/tools/office/sinedoc`). |
| `sinerli hitara/` | **Sinerli Hitara** | port SineEX | Lembar kerja (port otomatis dari `.../office/sineex`). |
| `sinerli present/` | **Sinerli Present** | port SineSlide | Presentasi (port otomatis dari `.../office/sineslide`). |
| `sinerli note/` | **Sinerli Note** | dibangun baru | Workspace bergaya wiki: halaman bersarang, 24 jenis blok + menu `/`, shortcut markdown, `@` sebut halaman/tanggal, seret-lepas blok & halaman, kolom, tabel, persamaan, **database** (tabel, board, daftar, galeri, kalender; 13 jenis properti; filter, urutan, pencarian, ekspor CSV), template, tautan balik, komentar, favorit, sampah, pencarian ⌘K, ekspor Markdown/HTML/PDF/ZIP, impor Markdown. |
| `sinai/` | **Sinai** | salinan Gadex | Gadex dengan nama, ID paket, port login, logo, dan tema **"Sinai Klasik"** bergaya desktop awal 2000-an (ringan, tanpa efek kaca). |

Desainnya sengaja berbeda dari produk lain (Rupa: dok alat mengambang + pil mode berwarna; Note: rel workspace berwarna slate + kertas hangat).

## Arsitektur

```
_core/            inti bersama 5 aplikasi Sinerli (disalin ke <app>/web/core/)
  sn-core.js        login wajib (Sinerli Connect, OAuth 2.0 + PKCE), cek paket, tema terang/gelap,
                    bahasa Indonesia/English, panel akun, ekspor file native, mode luring 7 hari
  sn-collab.js      kolaborasi langsung (CRDT LWW per field + long-poll) & dialog Bagikan
  sn-office.css     tema gelap untuk Dokum/Hitara/Present
  vendor/           pustaka lokal (tanpa CDN): jsPDF, docx, xlsx, pptx, Chart.js, KaTeX, pdf.js, …
_shell/tauri/     shell native Rust (Tauri 2) — satu kode untuk Windows/macOS/Linux/Android
scripts/
  sync-apps.mjs     port ulang Dokum/Hitara/Present dari "SInerli web" + salin core
  build-app.mjs     buat proyek Tauri per aplikasi & build installer
  make-logo.swift   logo aplikasi
dev/dev-server.mjs  server Sinerli tiruan untuk uji di browser (tidak ikut dipaket)
```

**Kenapa Tauri:** memakai WebView bawaan OS (WebView2/WebKit/WebKitGTK/Android WebView), jadi installer ±5–10 MB dan RAM ±40–90 MB per aplikasi — nyaman di perangkat RAM 1–4 GB. Rupa hanya 0,7 MB kode web; Note 1,7 MB.

## Menjalankan & build

```bash
node scripts/sync-apps.mjs
```

```bash
node dev/dev-server.mjs
```
Lalu buka `http://localhost:8790/apps/sinerli%20note/?user=ani` (ganti folder aplikasi; `?user=` lain = pengguna lain, untuk uji kolaborasi di dua tab).

Build installer (butuh Node 20+ dan Rust; Linux juga butuh `libwebkit2gtk-4.1-dev`):

```bash
node scripts/build-app.mjs all build
```

```bash
node scripts/build-app.mjs note android-apk
```

Cara termudah untuk **semua platform sekaligus**: jadikan folder ini repositori GitHub, lalu jalankan workflow **Build Sinerli Apps** (`.github/workflows/build.yml`) — macOS (universal), Windows, Linux, dan Android dibangun di mesin masing-masing. Hasil di `dist/<app>/`.

Sinai memakai pipeline Gadex: `sinai/build-all.sh` (lihat `sinai/README.md`).

## Login, paket & sinkron

- Login lewat browser sistem (PKCE): desktop memakai loopback `127.0.0.1:33440–33443`, Android skema `com.sinerli.apps:/oauth/callback`. Sinai: `33430–33433` / `com.sinerli.sinai`.
- Token hanya di penyimpanan rahasia OS (Keychain, Credential Manager, Secret Service, penyimpanan privat Android) — tidak pernah di localStorage.
- Setelah login, aplikasi menukar token di `POST /connect/tool-key` → kunci alat akun + paket. Semua endpoint server tetap memeriksa paket, jadi fitur berbayar tidak bisa dibuka dengan mengubah aplikasi.
- Paket diperiksa ulang tiap 10 menit dan saat aplikasi kembali aktif; perubahan paket langsung berlaku. Tanpa internet aplikasi tetap jalan sampai 7 hari sejak verifikasi terakhir.
- Dokumen disimpan ke `api/projects.php` (tipe `sinedoc`, `sineex`, `sineslide`, `rupa`, `snote_ws`) — file yang sama terbuka di web maupun aplikasi.

## Kolaborasi langsung

Semua aplikasi kecuali Sinai: tombol **Bagikan** → undang email (lihat/komentar/edit) atau tautan. Banyak orang bisa mengedit satu kanvas/dokumen sekaligus; kursor dan seleksi kolaborator terlihat, klik avatar untuk mengikuti tampilannya (Rupa).

Transport memakai `api/collab_ops.php` yang kini mendukung **long-poll** (server menahan jawaban sampai ada perubahan): di uji lokal ketikan muncul di layar kolaborator dalam ±150–350 ms. Karena server Sinerli adalah hosting PHP (tanpa WebSocket), jeda nol mutlak tidak mungkin; bila nanti tersedia VPS, `sn-collab.js` bisa diarahkan ke relay WebSocket tanpa mengubah aplikasi.

## Yang perlu Anda lakukan

1. **Upload perubahan server** di `SInerli web` — lihat `docs/SERVER.md`. Tanpa ini login aplikasi belum bisa dipakai di sinerli.com.
2. **Sertifikat penandatanganan** agar tidak muncul peringatan antivirus/SmartScreen/Gatekeeper — lihat `docs/SIGNING.md`. Slot sudah disiapkan; aktif otomatis begitu sertifikat diisi.
3. Build lewat GitHub Actions (atau lokal) dan uji di perangkat nyata.

Batasan yang jujur ada di `docs/SECURITY.md` dan bagian *Status* di bawah.

## Status

| | Status |
|---|---|
| Uji di browser (harness lokal) | Login → app terbuka untuk Dokum, Hitara, Present, Note, Rupa; Note: menu `/`, shortcut, tugas, sinkron 2 tab ±360 ms; Rupa: template alur, geser + snapping + konektor ikut, sticky, inspektor, foto (preset, kuas, tongkat ajaib, hapus seleksi); Sinai: tema klasik & layar login. |
| Build native | **macOS Intel:** kelima app Tauri berhasil dikompilasi (4–5,7 MB) dan terbuka sampai layar login; hasilnya di `dist/macos-intel/`. Windows, Linux, Android, dan macOS universal/.dmg belum dibuild (pakai GitHub Actions). |
| Server | Sudah di-deploy ke sinerli.com (30 Okt 2026). Login Sinerli Note dari app macOS berhasil dengan akun sungguhan. |
| Sinai | Pembaruan otomatis menunjuk `/sinai/update` yang belum ada di server (dianggap "tidak ada pembaruan" sampai rilis Sinai dibuat). |
