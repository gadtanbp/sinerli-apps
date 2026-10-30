# Sinai — AI Chat & Coding Agent untuk macOS, Windows, Linux, Android & iOS

**© Gadtan x Gallen** — Copyright © 2026 Gadtan x Gallen. All rights reserved. Lihat [COPYRIGHT](COPYRIGHT).

Sinai adalah aplikasi native macOS (seperti aplikasi Claude) dengan tiga mode:

- **Chat**: asisten AI serba bisa dengan **Artifacts** (halaman web, aplikasi React, diagram, dokumen, slide tampil hidup di kanvas), riset web, Proyek, Gaya, dan Memori.
- **Code**: agen coding ala Claude Code yang bekerja langsung di Mac Anda, dengan panel **File / Perubahan / Terminal / Pratinjau**, plan mode, sub-agen paralel, `@file`, dan *rewind*.
- **Design**: kanvas desain ala Claude Design. Buat situs, aplikasi, dashboard, slide, poster, logo, atau diagram; revisi lewat chat atau **klik elemen langsung**; ekspor ke PNG/PDF/HTML.

Paling mudah: **Masuk dengan Sinerli** — model Sinerli AI langsung tersambung sesuai paket akun Anda, tanpa API key. Model lain juga bebas, cukup masukkan API key: Sinai mendeteksi provider dari format key dan **membaca daftar semua model yang tersedia** pada key tersebut.

| | |
|---|---|
| Sistem | macOS 10.15 Catalina sampai terbaru · Intel & Apple Silicon (universal) |
| Ukuran | ± 9 MB, termasuk runtime pratinjau offline (React, Tailwind, Mermaid). Memakai WebKit bawaan macOS, tanpa Electron |
| Tampilan | Liquid Glass (blur native macOS), tema terang/gelap/sistem, warna aksen |

## Instalasi

Semua installer versi terbaru terkumpul di folder **`Download all/`** (plus `SHA256SUMS.txt`), juga tersedia untuk pengguna di **https://sinerli.com/sinai**:

```
Download all/macOS/    Sinai-1.1.0.dmg
Download all/Windows/  Sinai-Setup-1.1.0-x64.exe, Sinai-1.1.0-Portable.exe
Download all/Linux/    sinai_1.1.0_amd64.deb, Sinai-1.1.0-x86_64.AppImage, Sinai-1.1.0-x64.tar.gz
Download all/Android/  Sinai-1.1.0.apk
Download all/iOS/      proyek Xcode (build .ipa butuh Xcode + akun Apple Developer)
```

Tiap folder berisi `CARA-INSTAL.txt`. Versi semua platform diambil dari berkas `VERSION`.

## Akun Sinerli, pembaruan wajib & ponsel

- **Masuk dengan Sinerli** (layar sambutan atau Pengaturan → Akun Sinerli): login OAuth + PKCE di browser, lalu provider *Sinerli AI (SNR-1)* terpasang otomatis dengan key khusus perangkat ini (kuota mengikuti paket akun, dihitung untuk semua perangkat). Detail: `../INTEGRASI-SINAI-SINERLI.md`.
- **Pembaruan wajib**: Sinai membaca versi terbaru dari Sinerli (AdminDashboard → *Rilis Sinai*). Bila ada rilis wajib yang lebih baru, Sinai terkunci sampai diperbarui; *Perbarui sekarang* mengunduh installer, mencocokkan SHA-256, memasang, dan membuka ulang Sinai.
- **Android & iOS**: UI dan mesin AI yang sama, tata letak sentuh (laci geser, kanvas layar penuh). Lihat `mobile/README.md`.

### macOS

1. Buka `dist/macOS/Sinai-1.0.0.dmg`, seret **Sinai** ke folder **Applications**.
2. Pembukaan pertama: karena aplikasi belum ditandatangani Apple Developer ID, macOS akan memperingatkan.
   - macOS 14 ke bawah: klik kanan **Sinai.app → Open → Open**.
   - macOS 15 ke atas: buka **System Settings → Privacy & Security**, gulir ke bawah, klik **Open Anyway**.
   - Atau lewat Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Sinai.app
```

3. Jalankan Sinai, tempel API key, klik **Hubungkan & deteksi model**, pilih model default — selesai.

### Windows & Linux

| Sistem | File | Cara memasang |
|---|---|---|
| Windows 10/11 (x64) | `dist/Windows/Sinai-Setup-1.0.0-x64.exe` | Jalankan installer. SmartScreen mungkin memperingatkan (aplikasi belum ditandatangani): klik **More info → Run anyway**. |
| Windows tanpa instal | `dist/Windows/Sinai-1.0.0-Portable.exe` | Langsung jalankan. |
| Ubuntu/Debian (x64) | `dist/Linux/sinai_1.0.0_amd64.deb` | `sudo apt install ./sinai_1.0.0_amd64.deb` |
| Linux (x64) | `dist/Linux/Sinai-1.0.0-x86_64.AppImage` | `chmod +x Sinai-*.AppImage` lalu jalankan. |
| Linux (x64) | `dist/Linux/Sinai-1.0.0-x64.tar.gz` | Ekstrak, jalankan `./sinai`. |

Data tersimpan di `%APPDATA%\Sinai` (Windows) atau `~/.config/Sinai` (Linux). API key dienkripsi dengan Windows DPAPI / keyring sistem (GNOME Keyring, KWallet).

Perbedaan dengan versi macOS:

- **Shell agen**: di Windows memakai **Git Bash** bila terpasang (disarankan — [git-scm.com](https://git-scm.com)), jika tidak memakai **PowerShell**. Di Linux memakai bash. Perintah administrator: Linux lewat dialog polkit (`pkexec`); di Windows tidak bisa dari Sinai.
- **Tidak tersedia** (butuh framework Apple): dikte suara langsung, transkripsi audio, Quick Look, share sheet, integrasi Kalender/Kontak/Pengingat/Mail/Messages/Notes/Shortcuts.
- **Opsional bila terpasang**: Tesseract (OCR gambar & PDF hasil scan), 7-Zip (arsip 7z/rar/zip terenkripsi), qpdf (PDF terkunci & enkripsi PDF), ffmpeg (konversi video ke MP4 bila encoder bawaan tidak ada).
- Rekam audio sistem hanya di Windows; tangkapan layar mengambil seluruh layar.

## Provider yang didukung

DeepSeek · OpenAI · Anthropic (Claude) · Google Gemini · OpenRouter · Groq · xAI (Grok) · Mistral · Moonshot (Kimi) · Alibaba Qwen · Z.ai (GLM) · Together · Fireworks · Cerebras · NVIDIA NIM · Hugging Face · Perplexity · SiliconFlow · MiniMax · **Ollama & LM Studio (lokal)** · endpoint **kustom** apa pun yang kompatibel OpenAI atau Anthropic (proxy, gateway, self-hosted).

API key disimpan di **macOS Keychain** (satu item "Sinai API Keys").

## Mesin kecerdasan

Sinai tidak bisa mengubah "otak" sebuah model, tetapi bisa membuat model apa pun bekerja jauh lebih cermat. Pilih level di tombol ✦ pada kolom input:

| Level | Yang dilakukan |
|---|---|
| **Cepat** | Satu jawaban langsung, hemat token. |
| **Seimbang** | System prompt "cara kerja ahli" + penalaran bawaan model (thinking/reasoning). Model tanpa reasoning diberi scratchpad `<thinking>` tersembunyi. |
| **Mendalam** | Chat: draf → kritik oleh peninjau ahli → jawaban final yang diperbaiki. Code: setelah agen selesai, peninjau independen memeriksa diff & hasil perintah lalu meminta perbaikan bila ada masalah. |
| **Maksimal** | Chat: 2–4 draf paralel dengan sudut pandang berbeda → sintesis → kritik → final. Code: verifikasi berlapis + wajib menjalankan build/tes. Paling boros token. |

Fitur pendukung lain: panduan kerja agen setara senior engineer (selidiki → rencanakan → implementasi → verifikasi → laporkan), penalaran bawaan tiap provider diaktifkan otomatis (DeepSeek thinking, OpenAI `reasoning_effort`, Claude adaptive thinking + effort, Gemini, GLM, Qwen, OpenRouter), **model peninjau** terpisah (mis. model kuat untuk mengkritik model murah), **kompaksi konteks** otomatis untuk sesi panjang, dan **fallback protokol XML** untuk model yang tidak mendukung function calling.

## Artifacts & mode Design

AI menulis hasil karya besar sebagai *artifact* yang tampil hidup di kanvas kanan:

| Jenis | Isi | Pratinjau |
|---|---|---|
| Halaman web | HTML satu file (boleh memuat library dari CDN) | live, ukuran desktop/tablet/ponsel |
| Aplikasi React | JSX/TSX + Tailwind, bisa import paket npm apa pun (lucide-react, recharts, framer-motion, three…) | live; React & Tailwind offline, paket tambahan via esm.sh (perlu internet) |
| SVG | logo, ikon, ilustrasi | live |
| Diagram | Mermaid (flowchart, sequence, ERD, gantt, mindmap…) | live (offline) |
| Presentasi | slide Markdown 16:9 dengan navigasi | live, ekspor PDF per slide |
| Dokumen | Markdown | tampilan halaman |
| Kode | file sumber | syntax highlight |

Fitur kanvas: riwayat versi (‹ v2/3 ›), tab Pratinjau/Kode, **pilih elemen** (klik bagian desain → otomatis jadi konteks pesan "ubah elemen ini"), tombol **Perbaiki dengan AI** saat pratinjau error, ekspor **PNG / PDF / HTML / file sumber**, dan buka di jendela terpisah. Edit kecil memakai `artifact_edit` (hemat token); bila gagal diterapkan, AI otomatis diminta menulis ulang. Kode artifact berjalan di sandbox terpisah tanpa akses ke aplikasi.

## Mode Code

- Pilih folder proyek (chip folder di kanan atas).
- **Mode izin**: *Tanya dulu* (default), *Edit otomatis* (edit di dalam folder proyek tanpa bertanya), *Otomatis penuh*. Perintah berbahaya (`rm -rf`, `sudo`, format disk, `git push --force`, dll.) dan perintah admin **selalu** meminta izin.
- Hapus file → dipindah ke **Trash** (bisa dipulihkan).
- Perintah: `/init` (buat `SINAI.md` berisi konteks proyek), `/review` (tinjau perubahan git), `/compact`, `/clear`, `/model`, `/help`.
- Agen otomatis membaca `SINAI.md`, `AGENTS.md`, atau `CLAUDE.md` di root proyek.
- **Panel kanan** (⌥⌘B), seperti Claude Code:
  - **File**: pohon folder dengan lencana git/perubahan; klik untuk melihat isi file.
  - **Perubahan**: diff setiap file yang diubah di sesi ini, dengan tombol "Kembalikan semua".
  - **Terminal**: jalankan perintah langsung di folder proyek.
  - **Browser**: live view ala browser — file/folder proyek langsung (tanpa server), dev server localhost, atau situs https; maju/mundur, ukuran perangkat, konsol error (+ *Kirim error ke agen*), muat ulang otomatis saat agen mengubah file.
- **Tim Agen** (tombol *Tim* / `/tim`): Arsitek membagi tugas → agen UI/UX, Sistem, Data, 3D, Integrasi, Dokumentasi membangun paralel → Agen Bug Test menjalankan build/tes/live view dan memperbaiki error → Peninjau kode + Agen Keamanan memeriksa diff.
- **3D**: artifact `3d` (three.js offline) di Chat/Design, dan file .glb/.gltf/.obj/.stl/.ply/.fbx terbuka di penampil 3D interaktif.
- **Cermin konektor** (`/cermin`, `/dorong`): tarik desain dari Canva/Figma/Google/Notion/Miro/WordPress/Webflow, edit di Sinai, dorong balik semua atau sebagian halaman.
- **Sidebar** mengelompokkan sesi per folder proyek.
- **@file**: ketik `@` untuk memilih file; isinya otomatis dilampirkan.
- **Plan mode** (`/plan` atau chip izin → "Rencana dulu"): agen hanya menyelidiki lalu menyajikan rencana; Anda menyetujui atau meminta revisi sebelum ada perubahan.
- **Sub-agen** (`task`): investigasi paralel tanpa memenuhi konteks utama.
- **Rewind**: tombol ⟲ di pesan Anda memulihkan file yang diubah agen sejak pesan itu, lalu mengembalikan percakapan ke titik tersebut.

## Status model & token/saldo

- **Titik status** di pemilih model, daftar provider, dan sidebar: **hijau** = model menjawab tanpa error, **merah** = gagal (alasan ditampilkan: key ditolak, saldo habis, model tidak ada, koneksi gagal), kuning = sementara terkena batas rate, abu-abu = belum dicek. Sinai mengecek dengan permintaan sangat kecil (beberapa token) dan memperbarui status otomatis dari setiap chat. Model default & yang terakhir dipakai dicek otomatis; tombol **Uji model** / **Cek status** untuk sisanya.
- **Pengaturan → Token & Saldo** (atau klik status di sidebar), langsung dari API penyedia:
  - Saldo/kredit: DeepSeek, OpenRouter (sisa kredit & pemakaian harian/mingguan/bulanan), Kimi/Moonshot, SiliconFlow.
  - Penggunaan & biaya 30 hari: OpenAI dan Anthropic (perlu *admin key* — aturan penyedia; disimpan di Keychain).
  - Batas token/permintaan per menit dari header respons (OpenAI, Anthropic, Groq, xAI, dll.).
  - Token yang dilaporkan penyedia untuk tiap permintaan dari Sinai: hari ini, 7 & 30 hari, per model.
  - Penyedia yang tidak menyediakan API saldo (mis. Gemini, Mistral, Groq) ditandai dengan jelas.

## Membuat file sungguhan (PPT, PDF, Word, Excel, gambar, video)

Minta saja, misalnya *"buatkan PPT strategi pemasaran 8 slide"*, *"buat laporan PDF"*, *"buat surat dalam Word"*, *"buat tabel Excel"*, *"buat poster PNG"*, atau *"buat video promosi 30 detik dengan narasi"*. AI memanggil alat `create_file`, dan Sinai membuat **file asli**:

| Permintaan | Format |
|---|---|
| Presentasi | **PPTX** (16:9, bertema), PDF, HTML |
| Dokumen / laporan / surat / CV | **PDF** (A4/Letter, berhalaman), **DOCX**, RTF, ODT, HTML, MD, TXT |
| Tabel / spreadsheet | **XLSX** (header berwarna, beberapa sheet), CSV |
| Gambar / poster / logo | **PNG**, JPG, SVG, PDF |
| Video | **MP4** 1280×720 dengan transisi, narasi suara opsional (baris `Narasi: …`) |

Hasilnya langsung tampil di **kanvas** (pratinjau halaman PDF, slide, tabel, gambar, pemutar video) dengan tombol **Quick Look** (tampilan asli macOS), **Buka**, Simpan sebagai, Bagikan, dan Tampilkan di Finder. AI tidak lagi menjawab dengan kode pembuat file; jika model tetap menulis kode, Sinai otomatis memintanya membuat file. File disimpan di folder data Sinai per percakapan, atau di folder pilihan Anda (Pengaturan → Data → *Folder file buatan AI*).

## Input suara, rekaman & kamera

Di kolom input ada tiga tombol baru:

- **🎤 Dikte suara**: ketik dengan berbicara. Transkrip tampil langsung (on-device bila bahasa mendukung). Klik lagi untuk berhenti.
- **📷 Rekam & tangkap**: rekam **audio mikrofon**, **layar** (opsional dengan suara), atau **audio sistem** (suara yang diputar Mac — untuk rapat/video, butuh macOS 13+); buka **kamera** untuk foto/video; ambil **tangkapan layar** (area/jendela) atau **tangkap jendela Sinai**. Hasilnya otomatis jadi lampiran.
- Tempel (⌘V) gambar/teks dari clipboard, dan seret-lepas **teks atau tabel** langsung dari Safari/Numbers.

macOS meminta izin Mikrofon / Kamera / Perekaman Layar / Pengenalan Ucapan sekali saat pertama dipakai.

## Kirim ke Sinai dari mana saja

- **Finder → klik kanan → Open With → Sinai**, atau seret file ke ikon Sinai di Dock.
- Menu **Services**: pilih file lalu "Kirim ke Sinai", atau sorot teks lalu "Tanyakan ke Sinai".

File/teks yang dikirim langsung masuk ke kolom input percakapan baru.

## Ekspor & berbagi

Dari kanvas artifact dan tombol ekspor percakapan:

- Dokumen → **Word (.docx)**, **RTF**, PDF, HTML, Markdown; presentasi → **PowerPoint (.pptx)** atau PDF; tabel → **Excel (.xlsx)** / CSV; gambar → **JPEG/PNG/HEIC/TIFF/GIF/PDF**.
- **Cetak** (dialog cetak macOS / Print-to-PDF) dan **Bagikan** lewat share sheet (AirDrop, Mail, Pesan…).
- Ekspor isi tab **Perubahan** (ringkasan diff) dan **Terminal** (output) ke file.
- **Backup** seluruh percakapan, proyek & pengaturan jadi satu `.zip` (Pengaturan → Otomasi & Integrasi). API key tidak ikut.

Agen juga punya alat `pdf_tools` (gabung/pisah/watermark/enkripsi PDF) dan `convert_image`.

## Integrasi macOS & otomasi

Di **Pengaturan → Otomasi & Integrasi** (alat integrasi aktif secara default, selalu minta izin):

- Agen bisa membaca/menulis **Kalender, Pengingat, Kontak**, mengirim **email (Mail) / iMessage** (selalu dikonfirmasi), menjalankan **Shortcuts**, menampilkan **notifikasi**, dan mendeteksi **dev server** lokal.
- **Pantau folder**: file baru di folder tertentu otomatis membuka percakapan baru dengan file itu terlampir.
- **Webhook lokal**: terima pemicu dari skrip di komputer ini (`POST http://127.0.0.1:<port>` + header `X-Sinai-Token`).
- **Notifikasi saat tugas selesai** bila jendela tidak aktif.

Demi keamanan, Sinai **tidak** mengotomasi/klik UI aplikasi lain dan tidak membaca kata sandi Keychain/Safari.

## Semua jenis file

Lampirkan dengan tombol 📎, seret-lepas, atau tempel (⌘V, termasuk file yang di-copy dari Finder). Agen mode Code juga bisa membaca file-file ini dengan `read_file`.

| Jenis | Yang dibaca AI |
|---|---|
| Teks & kode (semua ekstensi, encoding apa pun) | isi lengkap |
| Gambar: PNG, JPG, GIF, WebP, HEIC/HEIF, TIFF, BMP, PSD, AVIF, **RAW kamera & format eksotis** (CR2/CR3, NEF, ARW, DNG, RAF…), ICO/ICNS | gambar (vision) + **OCR** + metadata EXIF (kamera, lensa, pengaturan); deteksi **Live Photo** |
| PDF (termasuk **terkunci kata sandi**) | teks per halaman; scan di-**OCR**; gambar halaman untuk vision |
| Word / RTF / ODT / HTML arsip | teks |
| Excel / ODS | setiap sheet sebagai CSV, dengan **rumus, sel digabung**, dan catatan grafik/gambar |
| PowerPoint / ODP | teks per slide + catatan pembicara |
| Pages / Numbers / Keynote | pratinjau dokumen (PDF/gambar + OCR) |
| **Subtitle** (SRT, VTT, ASS/SSA) | cue berstempel waktu + teks penuh |
| **Email** (EML, MSG) | pengirim/penerima/subjek + isi (MIME diurai) |
| **Model 3D/CAD** (STL, OBJ, STEP, DXF, USDZ, glTF…) | pratinjau Quick Look + ringkasan geometri |
| Jupyter notebook | sel & output |
| SQLite | skema + contoh baris |
| Plist; arsip **ZIP/TAR/GZ, 7z, RAR, terenkripsi, bertingkat** | daftar isi (ekstraksi aman dengan batas anti-bom) |
| Audio (MP3, M4A, WAV, AIFF, FLAC…) | metadata + **transkrip** + analisis (kenyaringan/hening/clipping); rekaman panjang ditranskrip berstempel waktu |
| Video (MP4, MOV…) | metadata, **beberapa frame kunci** (vision), transkrip + analisis audio |
| Folder (termasuk banyak folder sekaligus) | struktur isi |
| Symlink, file iCloud "belum diunduh", drive jaringan | diselesaikan/diunduh otomatis, atau pesan jelas bila offline |
| Biner lain (xls/ppt lama, font, executable…) | jenis file + teks yang terbaca |

## Otomatis penuh & tanpa putus

- **Mode izin "Otomatis penuh"** tidak pernah meminta klik. Perintah berisiko-sedang (pkill, git reset, drop table lokal, dll.) langsung jalan; perintah yang bisa merusak komputer (rm -rf folder sistem/home, format disk, `sudo`/password, shutdown) dilewati otomatis dan agen diberi tahu untuk mencari cara lain.
- **Pulih otomatis**: batas rate / kuota habis / server error → ganti ke API key cadangan provider yang sama → ganti ke model cadangan (Pengaturan → Provider → *Model cadangan*) → bila semua sibuk, tunggu (30 dtk → 5 mnt) dan coba lagi sendiri. Header `Retry-After` dihormati. Konteks penuh → diringkas otomatis lalu diulang.
- **Lanjut otomatis**: jawaban yang terpotong batas token keluaran disambung mulus di pesan yang sama; rencana kerja (todo) yang belum selesai diteruskan; batas langkah agen ditambah sendiri (maks. 10×).
- **Pemakaian token**: chip "% konteks" di header chat membuka ringkasan konteks, token hari ini/30 hari per model dan per API key, header batas rate, dan saldo akun. Detail lengkap di Pengaturan → Token & Saldo.

## Desain presentasi otomatis

`create_file` presentasi (PPTX/PDF/HTML/video) dan artifact `slides` memakai mesin desain Sinai (`js/deck.js`): tema dipilih dari topik (9 tema), dan setiap slide diberi layout profesional sesuai polanya — sampul, agenda, pembatas bagian, angka besar, kartu, timeline, perbandingan, kutipan, tabel, kode, poin, penutup. Hasil PPTX dan PDF identik karena dirender dari scene yang sama. Mode Design juga punya *design kit* di prompt dan satu putaran "art director" otomatis.

## Konektor (seperti Claude)

Pengaturan → **Konektor** → *Jelajahi*: ±45 layanan siap pakai (Notion, Linear, Jira/Confluence, Asana, GitHub, Slack, Google Workspace, Zapier, Supabase, Stripe, Canva, WordPress, Shopify, Telegram, WhatsApp Cloud API, MySQL/Postgres/MongoDB, Playwright, dll.). Layanan berlabel *Login sekali klik* memakai OAuth 2.1 MCP (discovery, pendaftaran klien otomatis, PKCE, refresh token) lewat redirect `http://127.0.0.1:33430/callback`; lainnya cukup mengisi satu token/URL. *REST API kustom* membungkus API web apa pun (opsional OpenAPI) menjadi alat CRUD. Semua token di Keychain/penyimpanan aman; tiap konektor bisa dikustomisasi (nama, alat yang boleh dipakai, jalan tanpa bertanya, data koneksi).

## Mode hemat token (default aktif)

Pengaturan → Agen & Izin → *Mode hemat token*. Alat & panduan (file, gambar, integrasi, presentasi, UI) hanya dikirim saat percakapan membutuhkannya — AI bisa memuat alat lain kapan saja lewat `load_tools`; deskripsi alat & prompt coding dipadatkan; riwayat lama dipangkas dua tingkat; versi artifact lama tidak dikirim ulang; jawaban chat lama diringkas; file dibaca per 700 baris; langkah rutin memakai penalaran lebih ringan; anggaran konteks coding 64k; prompt tidak lagi memuat jam sehingga cache prompt provider tetap berlaku. Hasil simulasi: −72% token pada sesi coding 60 langkah, −65% untuk sapaan singkat, −43% pada chat 12 giliran; token yang kena cache ditampilkan terpisah (ditagih ±10%).

## Paralel, skill, template, vision & gambar (2026-10-22)

- **Eksekusi paralel**: panggilan alat dalam satu respons dijalankan bersamaan bila tidak menyentuh file yang sama (penjadwal dependensi di `engine.js`); `task` dengan `can_write` menjalankan beberapa pekerja yang membangun bagian berbeda sekaligus (mode Otomatis/Edit otomatis).
- **Skill** berkategori (Coding, Desain, Dokumen, Data, Riset, Bisnis, Pemasaran, Produktivitas) + 12 skill bawaan; panggil lewat tombol 💡 di kolom chat, `/nama-skill`, atau tombol *Gunakan*.
- **Cincin pemakaian** di samping pemilih model: persentase konteks, klik untuk detail token/batas/saldo.
- **Konektor**: skema alat dinormalisasi untuk semua provider, argumen dikonversi otomatis, dan bila alat > 60 dipakai `connector_search` + `connector_call`.
- **Gambar**: `generate_image` memakai model gambar dari provider Anda (Gemini image/Imagen, gpt-image-1, OpenRouter, FLUX…), termasuk edit dari gambar referensi.
- **Vision bawaan**: model yang tidak bisa melihat menerima deskripsi gambar/frame video dari model vision pembantu + Apple Vision on-device; audio dianalisis dengan transkrip + klasifikasi suara on-device.
- **Template desain**: impor PPTX/POTX/DOCX/DOTX (diisi langsung ke master & gaya aslinya), PDF/gambar/HTML/.md (warna, font, panduan gaya); aktifkan via tombol *Template*.

## Proyek, Gaya, Memori & Konektor

- **Proyek** (sidebar → Proyek): instruksi khusus + file pengetahuan yang selalu disertakan di setiap chat/desain dalam proyek.
- **Gaya jawaban** (tombol ✎): Normal, Ringkas, Penjelasan, Formal, atau gaya buatan sendiri.
- **Memori**: AI menyimpan preferensi penting Anda antar percakapan. Bisa dilihat, dihapus, atau dimatikan di Pengaturan → Personalisasi.
- **Konektor MCP**: tambahkan server MCP lokal (stdio) atau remote (HTTP), atau impor dari Claude Desktop. Alatnya otomatis tersedia untuk AI.

## Pintasan

| Aksi | Tombol |
|---|---|
| Chat / Code / Desain baru | ⌘N / ⇧⌘N / ⌥⌘N |
| Panel / kanvas | ⌥⌘B |
| Buka folder proyek | ⌘O |
| Cari percakapan | ⌘K |
| Pilih model | ⇧⌘M |
| Sidebar | ⌘\ |
| Pengaturan | ⌘, |
| Hentikan jawaban | Esc |
| Ekspor Markdown | ⇧⌘E |

## Build dari source

Semua platform sekaligus (dari Mac; tiap hasil masuk ke `dist/<platform>` lalu dikumpulkan ke `Download all/`):

```bash
./build-all.sh
```

Satu platform saja: `./build-all.sh macos`, `windows`, `linux`, `android`, atau `ios` (Windows & Linux juga bisa dibangun dari Windows/Linux; macOS & iOS hanya dari Mac). `./build-all.sh collect` hanya menyusun ulang `Download all/`.

### macOS saja

Butuh Xcode atau Command Line Tools (`xcode-select --install`).

```bash
./build.sh dmg
```

Menghasilkan `build/Sinai.app` (universal x86_64 + arm64) dan `dist/macOS/Sinai-<versi>.dmg`. `./build.sh` saja hanya membuat `.app`.

### Windows & Linux (Electron)

Butuh Node.js 20+. Dari folder `desktop/`:

```bash
npm install
```

```bash
npm start
```

```bash
npm run dist:win
```

```bash
npm run dist:linux
```

`npm start` menjalankan Sinai langsung dari source. Installer masuk ke `dist/Windows` dan `dist/Linux`; `npm run icons` membuat ulang ikon dari `Logo app/Logo Sinai.png`. Variabel `SINAI_FAKE_OS=windows|linux` (hanya mode `npm start`) menampilkan UI versi OS tersebut untuk pengujian.

### Struktur

```
Sources/            Swift (AppKit + WKWebView): jendela glass, bridge native,
                    HTTP streaming, shell runner, file system, Keychain
Resources/web/      UI & mesin agen (HTML/CSS/JS tanpa framework)
  js/providers.js   preset provider, deteksi key & model, adapter OpenAI/Anthropic
  js/engine.js      loop agen, penalaran berlapis, verifikasi, kompaksi, sub-agen, rewind
  js/artifacts.js   parser artifact, riwayat versi, dokumen pratinjau
  js/files.js       pembaca semua jenis file
  js/mcp.js         klien Model Context Protocol
  js/ui-panel.js    kanvas & panel Code (File/Perubahan/Terminal/Pratinjau)
  preview-lib/      React, Tailwind, Babel, Mermaid untuk pratinjau offline
  js/tools.js       alat agen (file, grep, glob, shell, web, todo)
  js/prompts.js     system prompt & prompt kritik/sintesis/verifikasi
desktop/            host Windows/Linux (Electron): main.js, lib/ = pengganti
                    Sources/ dalam Node (bridge, shell, file, ekspor, HTTP),
                    lib/worker/ = halaman bantu (pdf.js, konversi dokumen, media)
scripts/            pembuat ikon (dari Logo app/Logo Sinai.png), panduan-instal/ per platform
dev/mock-llm.mjs    server AI tiruan untuk pengujian tanpa API key
```

### Pengujian tanpa API key

Mock konektor OAuth (HTTP + SSE + REST): `node dev/mock-mcp-oauth.mjs 8790`.

```bash
node dev/mock-llm.mjs
```

Lalu di Sinai tambahkan provider **Kustom — OpenAI-compatible** dengan base URL `http://127.0.0.1:8787/v1` dan key `sk-test-mock`. Build debug (`./build.sh debug`) menyediakan endpoint otomasi lokal lewat `SINAI_DEBUG_PORT` (tidak ada di build rilis).

## Hak cipta

Pemberitahuan **"© Gadtan x Gallen"** dipasang permanen di aplikasi, dengan tampilan sengaja samar (kecil, abu-abu, tidak mengganggu):

- **Label native** kecil di pojok kanan bawah jendela, digambar oleh AppKit di atas UI web, jadi HTML/CSS/JS, pengaturan, tema, dan pesan model tidak bisa menutup atau menghapusnya. Bila diubah atau dicabut, label pulih sendiri dalam 3 detik. Di Android/iOS tampil samar di kaki laci menu.
- Teks hak cipta disimpan **terenkode di binary** dan diverifikasi dengan checksum. Jika teksnya diubah, aplikasi menolak berjalan.
- **Cek integritas**: saat build, sidik SHA-256 seluruh file UI ditanam ke binary. Jika ada file di dalam `Sinai.app` yang diedit (misalnya untuk menghapus copyright), aplikasi tidak mau terbuka. `NSHumanReadableCopyright` di Info.plist juga diperiksa.
- Agen Sinai (mode Code) **tidak bisa menulis, memindah, atau menghapus file di dalam Sinai.app**.
- Juga tampil di: panel *Tentang Sinai* (menu app), Pengaturan → Tentang, layar sambutan, dan footer ekspor Markdown. AI menjawab bahwa Sinai dibuat oleh Gadtan x Gallen bila ditanya.
- Setiap file kode sumber memuat header hak cipta, plus file [COPYRIGHT](COPYRIGHT).

Catatan jujur: tidak ada perlindungan perangkat lunak yang 100% tak bisa ditembus oleh orang yang memegang kode sumber dan mampu membangun ulang aplikasinya. Perlindungan teknis di atas mencegah penghapusan pada aplikasi yang sudah jadi; perlindungan hukumnya adalah pemberitahuan hak cipta di kode dan dokumentasi.

## Keamanan

- UI berjalan di WKWebView dengan CSP ketat; HTML dari model selalu disanitasi dan gambar remote tidak dimuat (mencegah eksfiltrasi data lewat markdown).
- Bridge native hanya menerima pesan dari halaman aplikasi sendiri; pratinjau HTML dibuka di jendela terpisah tanpa akses bridge.
- Isi file, halaman web, dan output perintah diperlakukan sebagai data, bukan instruksi.
- Sinai tidak mengirim data ke mana pun selain provider AI yang Anda konfigurasi (dan mesin pencari saat fitur Web aktif).


> Integrasi Sinai (aplikasi) ↔ Sinerli (web): lihat `Sinai/INTEGRASI-SINAI-SINERLI.md`.
