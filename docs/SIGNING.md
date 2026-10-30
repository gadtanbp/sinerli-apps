# Penandatanganan installer (agar tidak terdeteksi sebagai aplikasi berbahaya)

Peringatan "Unknown publisher" (Windows SmartScreen), "tidak dapat diverifikasi" (macOS Gatekeeper),
dan "aplikasi tidak dikenal" (Android Play Protect) **tidak bisa dihilangkan dengan kode** — sistem
operasi hanya mempercayai installer yang ditandatangani sertifikat resmi. Aplikasinya sendiri bersih
(tanpa kode tersembunyi, tanpa unduhan kode dari internet, tanpa akses di luar izin).

Slot sudah disiapkan di `scripts/build-app.mjs` dan `.github/workflows/build.yml`; begitu rahasia di
bawah diisi (lokal: variabel lingkungan; GitHub: Settings → Secrets → Actions), build otomatis menandatangani.

| Platform | Yang dibeli/dibuat | Rahasia |
|---|---|---|
| macOS | Apple Developer Program ($99/tahun) → sertifikat **Developer ID Application** | `APPLE_CERTIFICATE` (.p12 base64), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID` → ditandatangani + **notarisasi** |
| Windows | Sertifikat code signing (OV/EV) dari CA (DigiCert, Sectigo, SSL.com) atau **Azure Trusted Signing** | `WINDOWS_CERT_THUMBPRINT` (sertifikat di store mesin build) atau `WINDOWS_SIGN_COMMAND` (mis. `trusted-signing-cli -e … %1`). Sertifikat EV langsung dipercaya SmartScreen; OV butuh waktu membangun reputasi. |
| Linux | Tidak wajib | — (sertakan `SHA256SUMS.txt`) |
| Android | Keystore sendiri (gratis): `keytool -genkeypair -v -keystore sinerli.jks -keyalg RSA -keysize 4096 -validity 10000 -alias sinerli` | `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. **Simpan keystore baik-baik** — pembaruan APK hanya bisa dipasang bila ditandatangani kunci yang sama. |

## Pemasangan mandiri (tanpa App Store / Play Store) tetap aman

- Unduh hanya dari sinerli.com (HTTPS) dan cocokkan `SHA256SUMS.txt`.
- Windows tanpa sertifikat: SmartScreen → *More info → Run anyway*. macOS tanpa Developer ID: klik kanan → *Open*
  (macOS 15: *System Settings → Privacy & Security → Open Anyway*). Android: izinkan *Install unknown apps* untuk browser.
- Setelah sertifikat dipasang, langkah di atas tidak diperlukan lagi.
