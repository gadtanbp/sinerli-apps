/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Built-in skill library (read-only; "Salin & edit" makes a user copy). */
(function () {
  'use strict';

  var B = [];
  function add(name, category, description, body) { B.push({ name: name, category: category, description: description, body: body.join('\n'), source: 'builtin', path: '', dir: '' }); }

  add('frontend-design', 'Desain', 'Membangun UI/web/app yang terlihat profesional dan rapi (landing page, dashboard, komponen, prototipe). Gunakan saat pengguna meminta membuat atau memperbaiki tampilan website, aplikasi, atau halaman.', [
    '# Frontend design',
    '## Langkah',
    '1. Tentukan arah desain dalam satu kalimat: audiens, suasana, palet (CSS variables), pasangan font, ide layout.',
    '2. Susun struktur halaman dulu (section/komponen), baru styling. Pakai grid 8px, container 1200px, radius 12–20px, bayangan lembut.',
    '3. Isi dengan konten nyata (bahasa pengguna), angka & nama realistis, ikon konsisten (lucide).',
    '4. Lengkapi state: hover/focus/active, loading (skeleton), kosong, error; responsif 360–1440px; kontras WCAG AA.',
    '5. Periksa ulang sebagai art director: hierarki 3 detik, spasi konsisten, tidak ada teks meluap, semua tombol berfungsi.',
    '## Aturan',
    '- Hindari tampilan generik (gradien ungu acak, semua di tengah). Satu aksen + netral bernuansa.',
    '- Jika proyek punya design system/komponen, pakai itu.',
  ]);

  add('presentasi-profesional', 'Dokumen', 'Menyusun presentasi/PPT yang meyakinkan dengan alur cerita kuat dan layout otomatis Sinai. Gunakan saat pengguna meminta PPT, slide, deck, pitch, atau materi presentasi.', [
    '# Presentasi profesional',
    '## Langkah',
    '1. Tentukan tujuan, audiens, dan satu pesan utama. Susun alur: masalah → data → solusi → bukti → langkah berikut.',
    '2. Tulis 8–14 slide Markdown dipisah `---`. Slide 1: `# Judul` + satu baris subjudul.',
    '3. Variasikan pola agar layout otomatis beragam: agenda bernomor; 2–4 poin berawalan angka ("- 85%: …") untuk kartu angka; 3–6 poin "Label: penjelasan" untuk kartu; judul roadmap/tahap + poin bertanggal untuk timeline; dua poin dengan sub-poin untuk perbandingan; "> kutipan" + "— Nama"; tabel Markdown; penutup "# Terima kasih".',
    '4. Maks ±15 kata per poin, angka nyata, judul slide berupa kesimpulan (bukan sekadar topik).',
    '5. Buat file dengan create_file (kind presentation, format pptx; tambahkan pdf bila diminta). Jika ada template desain aktif, pakai.',
  ]);

  add('dokumen-profesional', 'Dokumen', 'Menulis laporan, proposal, surat, SOP, atau dokumen Word/PDF yang rapi dan siap kirim. Gunakan saat pengguna meminta dokumen, laporan, proposal, surat resmi, atau file Word/PDF.', [
    '# Dokumen profesional',
    '## Langkah',
    '1. Tentukan jenis dokumen, pembaca, dan nada (formal/semi-formal).',
    '2. Struktur: judul, ringkasan eksekutif (3–5 kalimat), isi berjudul bertingkat (##, ###), tabel untuk angka, kesimpulan & rekomendasi, lampiran bila perlu.',
    '3. Tulis lengkap dalam Markdown — tanpa placeholder; gunakan data dari pengguna/file yang dilampirkan.',
    '4. Buat file dengan create_file (document, pdf atau docx sesuai permintaan).',
    '## Aturan',
    '- Kalimat ringkas, satu ide per paragraf, istilah konsisten, angka diberi satuan & sumber.',
  ]);

  add('analisis-data', 'Data', 'Menganalisis data spreadsheet/CSV/Excel: ringkasan, tren, perbandingan, insight, dan grafik. Gunakan saat pengguna melampirkan data atau meminta analisis angka, KPI, atau laporan data.', [
    '# Analisis data',
    '## Langkah',
    '1. Pahami kolom, tipe data, periode, dan kualitas data (nilai kosong, duplikat, outlier).',
    '2. Hitung metrik inti (total, rata-rata, pertumbuhan, porsi) dan periksa ulang hitungannya.',
    '3. Temukan 3–5 insight yang bisa ditindaklanjuti, masing-masing dengan angka pendukung.',
    '4. Sajikan tabel ringkas; untuk grafik buat artifact react (recharts) atau file xlsx/pdf bila diminta.',
    '5. Tutup dengan rekomendasi dan keterbatasan data.',
  ]);

  add('pembuatan-gambar', 'Desain', 'Membuat gambar berkualitas tinggi (ilustrasi, foto produk, poster, thumbnail, logo, mockup) dengan model gambar AI. Gunakan saat pengguna meminta membuat, mengedit, atau memvariasikan gambar.', [
    '# Pembuatan gambar',
    '## Langkah',
    '1. Tangkap maksud: subjek, tujuan pakai (sosmed, poster, web), rasio (1:1, 16:9, 9:16, 4:5), gaya.',
    '2. Tulis prompt detail dalam bahasa Inggris: subjek & aksi, komposisi/sudut kamera, pencahayaan, palet warna, gaya/medium, detail tekstur, suasana. Teks yang harus muncul ditulis dalam "tanda kutip" dan dibuat singkat.',
    '3. Panggil generate_image (sertakan gambar referensi bila pengguna melampirkannya untuk diedit). Buat 2 variasi bila arahnya belum jelas.',
    '4. Untuk logo/ikon/infografis yang perlu teks tajam & bisa diedit, buat SVG lewat create_file.',
    '5. Tawarkan perbaikan spesifik (warna, komposisi, gaya) setelah hasil keluar.',
  ]);

  add('aplikasi-fullstack', 'Coding', 'Membangun aplikasi lengkap end-to-end (frontend, backend, database) dengan cepat lewat pekerja paralel. Gunakan saat pengguna meminta membuat aplikasi/website/sistem baru dari nol.', [
    '# Aplikasi full-stack',
    '## Langkah',
    '1. Rencanakan singkat dengan todo_write: stack, struktur folder, model data, endpoint, halaman.',
    '2. Scaffold resmi (mis. npm create vite) dan tulis kontrak bersama dulu (tipe/skema, daftar endpoint, nama komponen).',
    '3. Bagi pekerjaan yang independen ke beberapa `task` (can_write=true) dalam SATU respons, tiap pekerja punya file sendiri (mis. backend/, frontend/src/pages/, tests/).',
    '4. Integrasikan, jalankan build & tes sekali per kelompok perubahan, perbaiki akar masalah.',
    '5. Terapkan skill frontend-design untuk tampilan. Laporkan cara menjalankan aplikasi.',
  ]);

  add('code-review', 'Coding', 'Meninjau perubahan kode untuk bug, keamanan, performa, dan kerapian. Gunakan saat pengguna meminta review, cek kode, atau sebelum merge/deploy.', [
    '# Code review',
    '## Langkah',
    '1. Lihat perubahan (git diff) dan konteks file terkait.',
    '2. Periksa: kebenaran logika & edge case, error handling, keamanan (injeksi, auth, rahasia), performa (N+1, loop berat), konsistensi gaya.',
    '3. Laporkan temuan berurutan dari yang paling parah: file:baris, masalah, dampak, saran perbaikan konkret.',
    '4. Jangan laporkan selera pribadi sebagai bug. Tawarkan untuk memperbaiki.',
  ]);

  add('debug-sistematis', 'Coding', 'Mencari dan memperbaiki bug secara sistematis dari error, log, atau perilaku aneh. Gunakan saat ada error, crash, tes gagal, atau "kok tidak jalan".', [
    '# Debug sistematis',
    '## Langkah',
    '1. Reproduksi masalah dan baca pesan error persis.',
    '2. Susun 2–3 hipotesis, uji yang paling mungkin dengan bukti (log, print, tes kecil).',
    '3. Perbaiki AKAR masalah, bukan gejalanya; jangan mematikan tes atau menelan error.',
    '4. Jalankan ulang reproduksi + tes terkait; laporkan penyebab, perbaikan, dan bukti.',
  ]);

  add('integrasi-api', 'Coding', 'Menghubungkan aplikasi atau Sinai ke API/layanan luar (REST, webhook, konektor MCP) untuk baca-tulis data. Gunakan saat pengguna ingin integrasi, sinkronisasi, atau CRUD ke platform lain.', [
    '# Integrasi API',
    '## Langkah',
    '1. Baca dokumentasi resmi API (web_fetch) atau gunakan konektor yang sudah terhubung.',
    '2. Tentukan autentikasi (API key, OAuth, token) — simpan rahasia di env/keychain, jangan di kode.',
    '3. Uji endpoint baca dulu, lalu buat/ubah/hapus dengan data uji; tangani error, rate limit, dan paginasi.',
    '4. Tulis wrapper kecil yang rapi + contoh pemakaian; laporkan endpoint yang dipakai.',
  ]);

  add('riset-web', 'Riset', 'Riset mendalam dari banyak sumber web dengan kutipan. Gunakan saat pengguna meminta riset, perbandingan produk, data terbaru, atau fakta yang perlu sumber.', [
    '# Riset web',
    '## Langkah',
    '1. Pecah pertanyaan menjadi 3–6 sub-pertanyaan; cari paralel (beberapa web_search dalam satu respons).',
    '2. Buka sumber primer/terpercaya (web_fetch), catat tanggal & angka.',
    '3. Bandingkan sumber, tandai perbedaan atau ketidakpastian.',
    '4. Tulis ringkasan terstruktur dengan tautan sumber; jangan mengarang data.',
  ]);

  add('email-bisnis', 'Bisnis', 'Menulis email/pesan bisnis yang jelas dan sopan (penawaran, follow-up, keluhan, undangan). Gunakan saat pengguna meminta menulis atau membalas email/pesan kerja.', [
    '# Email bisnis',
    '## Langkah',
    '1. Tentukan tujuan, penerima, dan tindakan yang diharapkan.',
    '2. Struktur: subjek spesifik, salam, konteks 1–2 kalimat, inti, ajakan bertindak yang jelas, penutup.',
    '3. Sesuaikan nada (formal/hangat); maks ±150 kata kecuali diminta.',
    '4. Berikan 1 versi utama + 1 alternatif singkat bila berguna.',
  ]);

  add('konten-pemasaran', 'Pemasaran', 'Membuat konten pemasaran: caption media sosial, copy iklan, deskripsi produk, kalender konten. Gunakan saat pengguna meminta konten promosi, caption, atau strategi konten.', [
    '# Konten pemasaran',
    '## Langkah',
    '1. Pahami produk, target audiens, platform, dan tujuan (awareness/konversi).',
    '2. Tulis hook kuat di kalimat pertama, manfaat > fitur, bukti sosial, CTA jelas.',
    '3. Sesuaikan format platform (panjang, hashtag, emoji secukupnya).',
    '4. Beri 3 variasi untuk diuji; sarankan visual (bisa dibuat dengan generate_image).',
  ]);


  // ---- Skill bawaan setara Claude (docx, pdf, pptx, xlsx, canvas-design, …) — memakai alat Sinai yang benar-benar ada.

  add('buat-apa-saja', 'Produktivitas', 'Membuat APA PUN yang diminta pengguna dengan memilih wadah Sinai yang paling cocok (artifact web/React/SVG/diagram/slides/board, file PPTX/PDF/Word/Excel/gambar/video, skill, atau kode proyek) lalu langsung membuatnya. Gunakan saat pengguna berkata "buatkan/bikin/create/make …" dan bentuk hasilnya belum jelas.', [
    '# Buat apa saja',
    '## Kapan dipakai',
    '- Permintaan membuat sesuatu tanpa format yang jelas ("buatkan sistem absensi", "bikin rencana belajar", "buat konten launching").',
    '- Permintaan gabungan (rencana + alat + materi).',
    '## Langkah',
    '1. Tangkap hasil akhir yang dibutuhkan pengguna: siapa pemakainya, dipakai untuk apa, di mana (layar, cetak, dibagikan).',
    '2. Pilih wadah dari peta kemampuan Sinai: aplikasi/alat interaktif → artifact react; halaman/poster/email → artifact html; papan ide/mindmap/kanban/moodboard/roadmap → artifact board; alur/diagram → mermaid; logo/ikon → svg; presentasi → slides atau create_file pptx; dokumen → create_file pdf/docx; data → create_file xlsx; foto/ilustrasi → generate_image; video → create_file mp4; cara kerja berulang → save_skill; proyek perangkat lunak → mode Code (tulis file & jalankan).',
    '3. Bila ada skill yang lebih spesifik (pptx, docx, xlsx, frontend-design, board-visual, …), muat skill itu dengan `skill` dan ikuti.',
    '4. BUAT LANGSUNG di balasan ini dengan konten nyata dan lengkap — jangan hanya menjelaskan rencana atau meminta izin. Asumsi yang diambil ditulis satu baris.',
    '5. Untuk permintaan gabungan, buat beberapa hasil yang saling melengkapi (mis. board rencana + aplikasi react + file pptx).',
    '6. Periksa ulang: semua bagian permintaan terpenuhi, tidak ada placeholder, hasil bisa dipakai saat itu juga. Tutup dengan 2–3 saran lanjutan.',
    '## Aturan',
    '- Jangan menyuruh pengguna memakai aplikasi lain bila Sinai bisa membuatnya.',
    '- Bila benar-benar tidak bisa dibuat di Sinai, katakan dalam satu kalimat lalu berikan hasil terdekat yang berguna.',
  ]);

  add('board-visual', 'Produktivitas', 'Membuat board/space/kanvas interaktif: whiteboard, brainstorm, mind map, kanban, moodboard, user journey, roadmap, papan rencana/belajar. Gunakan saat pengguna meminta board, papan, kanvas, mind map, kanban, moodboard, peta ide, atau ruang kerja visual.', [
    '# Board visual',
    '## Langkah',
    '1. Tentukan jenis board: mindmap (pakai "parent"), flow (pakai edges + "layout":"flow"), kanban (item kanban dengan kolom), moodboard (image + note), rencana (frame per fase + card/list), dashboard ringan (chart + table + card).',
    '2. Tulis <artifact id="…" type="board" title="…"> berisi JSON valid: {"title","background","layout","items":[…],"edges":[…]}. Biarkan x/y kosong agar ditata otomatis, kecuali butuh susunan khusus (frame berisi item → beri x/y).',
    '3. Isi konten nyata dan spesifik: 6–30 item, teks pendek, warna note bermakna (mis. kuning ide, hijau selesai, merah risiko).',
    '4. Untuk revisi pakai id yang sama. Bila pesan berisi "[Board … sudah diedit pengguna …]", jadikan JSON itu dasar dan pertahankan perubahan pengguna.',
    '## Aturan',
    '- JSON tanpa komentar dan tanpa koma berlebih. Setiap edge merujuk id yang ada.',
    '- Gambar: https://picsum.photos/seed/<kata>/<w>/<h>.',
  ]);

  add('docx', 'Dokumen', 'Membuat atau merevisi dokumen Word (.docx): laporan, proposal, surat, kontrak, SOP, CV, dengan heading, tabel, daftar, dan format rapi. Gunakan saat pengguna menyebut Word, .docx, atau dokumen yang akan diedit di Word.', [
    '# DOCX (Word)',
    '## Langkah',
    '1. Bila ada file yang dilampirkan, baca isinya dan pertahankan struktur & istilahnya.',
    '2. Susun Markdown lengkap: # judul, ringkasan, ## / ### bagian, tabel Markdown untuk angka, daftar bernomor untuk langkah, kutipan untuk catatan.',
    '3. create_file kind=document format=docx (tambah pdf bila diminta) dengan filename yang deskriptif. Pakai template aktif bila ada.',
    '4. Laporkan singkat isi file; tawarkan revisi spesifik.',
    '## Aturan',
    '- Tidak ada placeholder [Nama]/lorem — isi dengan data pengguna atau tanyakan satu hal paling penting.',
    '- Bahasa formal konsisten, penomoran rapi, satuan & tanggal jelas.',
  ]);

  add('pdf', 'Dokumen', 'Membuat PDF siap kirim/cetak (laporan, invoice, sertifikat, e-book, brosur) serta mengolah PDF (gabung, pisah, putar, kunci, ekstrak teks). Gunakan saat pengguna menyebut PDF.', [
    '# PDF',
    '## Membuat PDF',
    '1. Dokumen teks → create_file kind=document format=pdf (paper a4/letter, landscape bila tabel lebar).',
    '2. Desain visual (sertifikat, brosur, poster) → create_file kind=image format=pdf dengan satu halaman HTML/SVG berukuran tepat (mis. 1123×794 untuk A4 landscape).',
    '3. Presentasi → create_file kind=presentation format=pdf.',
    '## Mengolah PDF (desktop)',
    '- Gunakan alat pdf_tools (gabung, pisah, putar, enkripsi/dekripsi, ekstrak) bila tersedia; muat dengan load_tools bila belum ada.',
    '- Membaca isi PDF: lampirkan atau baca file lalu ringkas/ekstrak tabel.',
    '## Aturan',
    '- Periksa margin, tidak ada teks terpotong, nomor halaman untuk dokumen panjang.',
  ]);

  add('pptx', 'Dokumen', 'Membuat presentasi PowerPoint (.pptx) berkualitas konsultan: alur cerita, layout otomatis, tema, dan ekspor PDF. Gunakan saat pengguna meminta PPT, PowerPoint, .pptx, deck, pitch, atau slide sebagai file.', [
    '# PPTX',
    '## Langkah',
    '1. Tujuan, audiens, satu pesan utama; alur konteks → insight → rekomendasi → langkah berikut.',
    '2. 8–14 slide Markdown dipisah `---`: cover (# judul + subjudul), agenda bernomor, angka besar ("- 85%: …"), kartu ("Label: penjelasan"), timeline, perbandingan, kutipan, tabel, penutup.',
    '3. Judul slide = kesimpulan; maks 3–5 poin, ±15 kata per poin, angka nyata + sumber.',
    '4. create_file kind=presentation format=pptx (dan pdf bila diminta); pilih theme yang cocok dengan topik atau pakai template aktif.',
    '5. Untuk iterasi visual di kanvas sebelum jadi file, boleh buat artifact slides dulu lalu ekspor.',
  ]);

  add('xlsx', 'Data', 'Membuat atau mengolah spreadsheet Excel (.xlsx/CSV): tabel data, rekap, anggaran, jadwal, laporan dengan beberapa sheet dan rumus. Gunakan saat pengguna menyebut Excel, spreadsheet, .xlsx, CSV, atau tabel yang akan dihitung.', [
    '# XLSX',
    '## Langkah',
    '1. Rancang sheet: nama sheet, kolom (dengan satuan), baris data, baris total.',
    '2. Hitung angka dengan teliti; rumus Excel boleh ditulis sebagai teks sel diawali "=" (mis. =SUM(B2:B13)).',
    '3. create_file kind=spreadsheet format=xlsx memakai `sheets: [{name, rows: [[header…], …]}]` (atau CSV/tabel Markdown per "## Sheet").',
    '4. Ringkas di chat: isi tiap sheet dan insight utama; tawarkan grafik (artifact react) bila berguna.',
    '## Aturan',
    '- Header jelas, tanggal format ISO atau lokal konsisten, tidak ada sel gabungan yang merusak data.',
  ]);

  add('canvas-design', 'Desain', 'Membuat karya visual statis bernilai seni (poster, sampul, kartu, karya dinding, sertifikat) sebagai PNG/PDF/SVG dengan komposisi dan tipografi kuat. Gunakan saat pengguna meminta poster, artwork, desain cetak, atau visual estetis.', [
    '# Canvas design',
    '## Langkah',
    '1. Tulis filosofi desain satu paragraf: gagasan visual, suasana, palet (≤ 4 warna), tipografi (≤ 2 font), komposisi.',
    '2. Bangun sebagai SVG (atau HTML) berukuran tepat dengan grid, hierarki tipografi kontras, ruang kosong lega, detail bentuk/tekstur buatan sendiri.',
    '3. Tampilkan sebagai artifact svg untuk iterasi; untuk file pakai create_file kind=image format=png/pdf/svg.',
    '4. Bila butuh unsur foto realistis, buat dengan generate_image lalu komposisikan.',
    '## Aturan',
    '- Hindari clip-art & tampilan template generik; teks sedikit tapi bermakna; margin ≥ 6% lebar.',
  ]);

  add('algorithmic-art', 'Desain', 'Membuat seni generatif/algoritmik interaktif (pola, partikel, flow field, fraktal) dengan kode dan parameter yang bisa diatur. Gunakan saat pengguna meminta generative art, seni kode, animasi pola, atau visual p5/canvas.', [
    '# Algorithmic art',
    '## Langkah',
    '1. Tentukan konsep & algoritme (noise flow field, L-system, partikel, voronoi, tiling) dan palet.',
    '2. Buat artifact html satu file dengan <canvas> (atau p5.js dari cdnjs/jsdelivr), seed acak yang bisa diulang, dan panel kontrol (slider parameter, tombol regenerasi, simpan PNG).',
    '3. Pastikan animasi mulus (requestAnimationFrame), responsif, tanpa error konsol.',
    '4. Jelaskan singkat parameter yang bisa dicoba.',
  ]);

  add('theme-factory', 'Desain', 'Membuat atau menerapkan tema visual konsisten (palet, font, gaya) ke slide, dokumen, halaman web, atau board. Gunakan saat pengguna meminta tema, gaya visual, palet warna, atau "samakan tampilannya".', [
    '# Theme factory',
    '## Langkah',
    '1. Tawarkan 3–6 tema bernama (mis. Midnight Tech, Warm Editorial, Emerald Calm) masing-masing: 5 warna hex (bg, surface, text, accent, accent-2), pasangan font, karakter.',
    '2. Bila pengguna memilih atau sudah jelas, terapkan konsisten: slides/pptx → parameter theme {background,text,accent,accent2}; web/react → CSS variables; board → warna item.',
    '3. Tampilkan contoh (artifact html kecil berisi swatch & tipografi) bila membantu memilih.',
  ]);

  add('brand-guidelines', 'Desain', 'Menerapkan identitas merek (warna, logo, tipografi, nada bahasa) ke semua hasil, atau menyusun pedoman merek baru. Gunakan saat pengguna menyebut brand, merek, logo perusahaan, brand book, atau ingin hasil sesuai identitas perusahaan.', [
    '# Brand guidelines',
    '## Langkah',
    '1. Kumpulkan aset merek: dari lampiran, template aktif, website (web_fetch), atau tanyakan warna/font/logo bila tidak ada.',
    '2. Tetapkan token merek: warna primer/sekunder (hex), font, gaya foto/ilustrasi, nada bahasa, larangan.',
    '3. Terapkan ke hasil yang diminta; untuk pedoman baru buat dokumen (create_file pdf) + halaman contoh (artifact html).',
  ]);

  add('internal-comms', 'Bisnis', 'Menulis komunikasi internal: update status, laporan mingguan, pengumuman, newsletter, notulen, FAQ, insiden. Gunakan saat pengguna meminta update tim, laporan progres, pengumuman internal, atau notulen rapat.', [
    '# Internal comms',
    '## Langkah',
    '1. Tentukan jenis (status update 3P: Progress/Plans/Problems, pengumuman, newsletter, notulen, laporan insiden) dan pembaca.',
    '2. Mulai dengan inti (TL;DR 1–2 kalimat), lalu detail berpoin, keputusan/aksi dengan pemilik & tenggat.',
    '3. Nada jelas, ringkas, tanpa jargon; cocok ditempel ke email/chat. Buat file (docx/pdf) bila diminta.',
  ]);

  add('doc-coauthoring', 'Dokumen', 'Menulis dokumen panjang bersama pengguna secara bertahap: kumpulkan konteks, susun kerangka, tulis per bagian, revisi, lalu uji dari sudut pembaca. Gunakan saat pengguna ingin menyusun spesifikasi, proposal, kebijakan, artikel, atau dokumen besar secara kolaboratif.', [
    '# Doc co-authoring',
    '## Langkah',
    '1. Konteks: tujuan, pembaca, batasan, bahan yang ada (minta lampiran). Ajukan maks 3 pertanyaan penting sekaligus (ask_user bila tersedia).',
    '2. Kerangka: artifact markdown berisi heading + 1 kalimat per bagian; minta persetujuan.',
    '3. Tulis bagian demi bagian di artifact yang sama (artifact_edit untuk revisi kecil).',
    '4. Uji pembaca: baca ulang sebagai pembaca baru — temukan istilah tak jelas, lompatan logika, klaim tanpa bukti; perbaiki.',
    '5. Final: create_file docx/pdf bila dibutuhkan.',
  ]);

  add('web-artifacts-builder', 'Coding', 'Membangun artifact web kompleks (aplikasi multi-halaman, state, routing, grafik, form, penyimpanan lokal) dalam satu file React/HTML yang langsung jalan di kanvas Sinai. Gunakan saat pengguna meminta aplikasi/alat interaktif yang lebih dari halaman sederhana.', [
    '# Web artifacts builder',
    '## Langkah',
    '1. Rancang: halaman/tab, model data, state, interaksi utama.',
    '2. Tulis artifact react satu file: komponen terstruktur, useState/useReducer, routing sederhana via state, Tailwind, ikon lucide-react, grafik recharts, data contoh realistis, localStorage untuk persistensi.',
    '3. Lengkapi state kosong/loading/error, validasi form, responsif 360–1440px.',
    '4. Periksa error di kanvas; bila panel menampilkan error, perbaiki akar masalahnya.',
    '5. Untuk proyek nyata multi-file, pindahkan ke mode Code (Vite) — sebutkan bila perlu.',
  ]);

  add('webapp-testing', 'Coding', 'Menguji aplikasi web lokal: jalankan server, buka di pratinjau, cek tampilan, klik alur utama, baca log/error, dan perbaiki. Gunakan di mode Code saat pengguna meminta tes, cek apakah web jalan, atau debugging UI.', [
    '# Webapp testing',
    '## Langkah',
    '1. Temukan cara menjalankan (package.json scripts) dan jalankan server di latar belakang dengan log ke file.',
    '2. scan_dev_servers / curl port untuk memastikan hidup; buka dengan open_preview.',
    '3. Uji alur utama dan kasus tepi; jalankan tes otomatis yang ada (npm test, playwright bila terpasang).',
    '4. Baca log & error, perbaiki akar masalah, ulangi sampai lulus. Laporkan perintah + hasil nyata.',
  ]);

  add('mcp-builder', 'Coding', 'Membuat server MCP (Model Context Protocol) untuk menghubungkan AI ke API/layanan apa pun, lalu memasangnya sebagai konektor Sinai. Gunakan saat pengguna ingin membuat konektor, integrasi alat AI, atau server MCP.', [
    '# MCP builder',
    '## Langkah',
    '1. Pelajari API target (web_fetch dokumentasi resmi): autentikasi, endpoint utama, batasan.',
    '2. Rancang alat: nama jelas (verb_noun), deskripsi kapan dipakai, skema input ketat, output ringkas dan informatif.',
    '3. Implementasi di mode Code dengan SDK resmi (TypeScript @modelcontextprotocol/sdk atau Python mcp), transport stdio atau HTTP; rahasia lewat env.',
    '4. Uji tiap alat (data uji), tangani error & paginasi.',
    '5. Pasang di Sinai: Pengaturan → Konektor → tambah server (perintah stdio atau URL). Laporkan cara pakai.',
  ]);

  add('security-review', 'Coding', 'Audit keamanan perubahan kode atau proyek: injeksi, autentikasi/otorisasi, rahasia bocor, XSS/CSRF, dependensi rentan, konfigurasi berbahaya. Gunakan saat pengguna meminta security review, cek keamanan, atau sebelum rilis.', [
    '# Security review',
    '## Langkah',
    '1. Lihat cakupan: git diff (perubahan) atau file inti (auth, input, query, upload, konfigurasi).',
    '2. Periksa: input tak tervalidasi → SQL/command/path injection; XSS & CSRF; auth/izin yang bisa dilewati; rahasia di kode/log; kripto lemah; SSRF; deserialisasi; dependensi usang (npm audit / pip-audit bila ada).',
    '3. Laporkan per temuan: tingkat (kritis/tinggi/sedang/rendah), file:baris, skenario serangan konkret, perbaikan.',
    '4. Jangan laporkan teori tanpa jalur serangan nyata. Tawarkan memperbaiki.',
  ]);

  add('simplify', 'Coding', 'Merapikan kode yang baru diubah: hapus duplikasi, pakai ulang helper yang ada, sederhanakan logika, tingkatkan efisiensi — tanpa mengubah perilaku. Gunakan saat pengguna meminta refactor ringan, rapikan, atau sederhanakan kode.', [
    '# Simplify',
    '## Langkah',
    '1. Ambil perubahan (git diff) atau file yang disebut.',
    '2. Cari: kode duplikat yang bisa memakai helper yang sudah ada, cabang/variabel tak perlu, loop/query berulang, abstraksi berlebihan.',
    '3. Terapkan perubahan kecil dan aman; jaga gaya kode sekitarnya.',
    '4. Jalankan build/tes; laporkan apa yang disederhanakan.',
  ]);

  window.BUILTIN_SKILLS = B;
})();
