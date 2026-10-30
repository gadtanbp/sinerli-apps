# Sinai untuk Android & iOS

UI dan mesin AI Sinai sama dengan versi desktop (`Resources/web`). Ponsel menambahkan:

```
mobile/web/host-mobile.js   kontrak bridge desktop di atas ±25 primitif native: pembaca berkas,
                            ekspor DOCX/XLSX/ZIP/RTF/ODT, PDF & gambar (pdf.js via gx-worker.js)
mobile/build-web.sh         merakit UI web untuk ponsel (CSP ponsel + host-mobile.js)
mobile/android/             aplikasi Android (Java, tanpa pustaka luar) + build-android.sh
mobile/ios/                 proyek Xcode (Swift, WKWebView) + build-ios.sh
```

## Yang tersedia di ponsel

Chat, Design, artifact (pratinjau hidup), lampiran (gambar, PDF, Word/Excel/PowerPoint, teks, ZIP),
membuat berkas (PDF, DOCX, XLSX, PPTX, PNG, HTML…) lalu Bagikan/Simpan ke Files, riset web,
Proyek, Memori, Skill, konektor remote (OAuth sekali klik, URL, REST API), **Masuk dengan Sinerli**,
pembaruan wajib dari Sinerli. Tata letak: sidebar jadi laci geser (geser dari tepi kiri), kanvas
layar penuh, pengaturan berupa lembar bawah, target sentuh besar, area aman notch/keyboard.

Tidak tersedia (butuh komputer): mode **Code** (shell & folder proyek), konektor lokal (npx/uvx),
dikte/transkripsi, rekam layar, otomasi folder & webhook.

## Keamanan

- Android: UI dimuat dari aset APK di `https://sinai.invalid/` (tidak pernah ke jaringan). Bridge
  memakai `MessagePort` yang hanya dikirim ke frame utama dengan nonce per halaman — iframe pratinjau
  (`https://preview.sinai.invalid/`, sandbox) tidak bisa menyentuh native. API key & token di
  Android Keystore (AES-256-GCM), tidak ikut backup. HTTP polos diblokir (kecuali localhost/10.0.2.2).
- iOS: `sinai://app/` + `sinai-preview://`; bridge hanya menerima frame utama berasal `sinai://app`.
  Rahasia di Keychain `AfterFirstUnlockThisDeviceOnly`.
- Berkas hanya di folder aplikasi; aplikasi lain menerima berkas lewat izin baca sementara.

## Android

```bash
mobile/android/build-android.sh
```

Hasil: `dist/Android/Sinai-<versi>.apk` (minSdk 26 / Android 8, targetSdk 36). Butuh Android SDK
(platform android-36) dan JDK 17+ (otomatis memakai JDK bawaan Android Studio). Tanpa Gradle & tanpa unduhan.

**Kunci tanda tangan** dibuat sekali di `mobile/android/keys/` (diabaikan git). **Simpan cadangannya**:
pembaruan APK hanya bisa dipasang bila ditandatangani kunci yang sama.

Debug (WebView bisa diinspeksi dari `chrome://inspect`): `mobile/android/build-android.sh debug`.

## iOS

```bash
mobile/ios/build-ios.sh prepare
```

lalu buka `mobile/ios/Sinai.xcodeproj` di Xcode 15+, pilih Team, Run (iOS/iPadOS 16.4+). Atau langsung:

```bash
TEAM=ABCDE12345 METHOD=app-store mobile/ios/build-ios.sh
```

iOS tidak mengizinkan memasang aplikasi dari berkas sembarang: distribusikan lewat TestFlight /
App Store (atau Ad Hoc untuk perangkat terdaftar), lalu isi tautannya di Sinerli › Rilis Sinai › iOS.

## Uji tanpa ponsel

```bash
node dev/harness/serve.mjs
```

Buka `http://127.0.0.1:8795/?os=android` (atau `ios`, `macos`, `windows`; `&version=1.0.0` untuk
menguji pembaruan wajib) dengan ukuran layar ponsel. Host native ditiru `dev/harness/mock-native.js`.
