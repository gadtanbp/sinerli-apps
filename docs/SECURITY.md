# Keamanan Sinerli Apps

Tidak ada aplikasi yang bisa dibuat "tidak mungkin di-crack": semua kode yang berjalan di perangkat
pengguna pada akhirnya bisa dibaca atau diubah. Karena itu perlindungan dirancang supaya **mengubah
aplikasi tidak memberi apa-apa**:

| Ancaman | Perlindungan |
|---|---|
| Memakai fitur berbayar tanpa langganan | Paket dibaca dari server (`/connect/tool-key`); setiap endpoint (`projects.php`, AI office, kuota) memeriksa paket di server. Aplikasi yang dimodifikasi hanya bisa mengubah tampilan, bukan hak akses. |
| Mencuri sesi login | Token OAuth hanya di penyimpanan rahasia OS; refresh token berotasi & keluarga token dicabut bila dipakai ulang (`connect.php`). Login memakai PKCE + `state`; redirect hanya ke URI terdaftar. |
| Membajak akun lain | Kunci alat terikat ke akun pemilik token; admin bisa mencabut izin per aplikasi (`rupa.access`, `note.access`, …) dan semua sesi. |
| Menyisipkan skrip ke aplikasi | UI dikemas di dalam binary; CSP ketat (`script-src 'self'`, jaringan hanya ke sinerli.com); tidak ada kode yang diunduh saat berjalan; DevTools mati di build rilis; perintah native hanya untuk jendela utama (`capabilities/default.json`); `open_url` hanya `https:`. |
| Isi berbahaya dari kolaborator | Teks blok disanitasi (daftar putih tag/atribut), tautan hanya `http(s)`/`mailto`, gambar disimpan sebagai data URL. |
| Pemakaian luring tanpa batas setelah langganan berakhir | Sesi luring maksimal 7 hari sejak verifikasi terakhir, lalu wajib online. |
| Installer palsu | Tanda tangan kode (docs/SIGNING.md) + SHA-256; Android menolak pembaruan yang ditandatangani kunci lain. |

Yang tetap di luar kendali aplikasi: perangkat yang sudah terinfeksi malware, akun yang kata sandinya bocor,
dan orang yang memotret layar. Untuk itu gunakan 2FA di akun Google yang terhubung ke Sinerli.
