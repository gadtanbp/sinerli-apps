#!/bin/bash
# Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
# Builds the installers for every platform, each into its own folder, then
# collects everything into "Download all/" (siap diunggah ke Sinerli › Rilis Sinai):
#
#   dist/macOS/    Sinai-<v>.dmg                          (needs a Mac + Xcode tools)
#   dist/Windows/  Sinai-Setup-<v>-x64.exe, Sinai-<v>-Portable.exe
#   dist/Linux/    sinai_<v>_amd64.deb, Sinai-<v>-x86_64.AppImage, Sinai-<v>-x64.tar.gz
#   dist/Android/  Sinai-<v>.apk                          (Android SDK, lihat mobile/README.md)
#   dist/iOS/      Sinai-<v>.ipa bila TEAM=<Apple Team ID> dan Xcode tersedia,
#                  selain itu proyek Xcode siap buka (Sinai-<v>-iOS-Xcode.zip)
#
#   ./build-all.sh              all platforms this machine can build
#   ./build-all.sh macos        only macOS        (also: windows, linux, android, ios)
#   ./build-all.sh collect      only refresh "Download all/" from dist/
#
# Windows/Linux packages are built with Electron (folder desktop/, needs Node.js 20+).
# Versi diambil dari berkas VERSION.
set -euo pipefail
cd "$(dirname "$0")"

WANT="${1:-all}"
want() { [ "$WANT" = "all" ] || [ "$WANT" = "$1" ]; }
[ "$WANT" = "collect" ] && { exec ./scripts/collect-downloads.sh; }
VERSION="$(tr -d '[:space:]' < VERSION)"
# Aturan wajib (identitas Sinerli, alat Sinerli, self-repair) harus utuh sebelum build.
./scripts/check-invariants.sh
guide() { sed "s/__VERSION__/$VERSION/g" "scripts/panduan-instal/$1.txt" > "$2"; }

if want macos; then
  if [ "$(uname)" = "Darwin" ]; then
    echo "━━ macOS"
    ./build.sh dmg
  else
    echo "━━ macOS dilewati (hanya bisa dibangun di Mac)"
  fi
fi

if want windows || want linux; then
  cd desktop
  [ -d node_modules ] || npm install --no-audit --no-fund
  # Versi Electron mengikuti berkas VERSION.
  node -e 'const f="package.json",p=require("./"+f);p.version=process.argv[1];require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")' "$VERSION"
  # On macOS, .deb packaging needs an xz program; provide a small one if missing.
  if [ "$(uname)" = "Darwin" ] && ! command -v xz >/dev/null; then export PATH="$PWD/scripts/shims:$PATH"; fi
  if want windows; then
    echo "━━ Windows"
    rm -rf ../dist/Windows
    npx electron-builder --win -c.directories.output=../dist/Windows
    (cd .. && guide Windows dist/Windows/CARA-INSTAL.txt)
  fi
  if want linux; then
    echo "━━ Linux"
    rm -rf ../dist/Linux
    npx electron-builder --linux -c.directories.output=../dist/Linux
    (cd .. && guide Linux dist/Linux/CARA-INSTAL.txt)
  fi
  cd ..
  # Keep only the installers.
  rm -rf dist/Windows/win-unpacked dist/Linux/linux-unpacked dist/*/builder-*.y*ml dist/*/*.blockmap 2>/dev/null || true
fi

if want android; then
  echo "━━ Android"
  if [ -f "${ANDROID_HOME:-$HOME/Library/Android/sdk}/platforms/android-36/android.jar" ]; then mobile/android/build-android.sh
  else echo "  dilewati: Android SDK (platform android-36) tidak ditemukan"; fi
fi

if want ios; then
  echo "━━ iOS"
  if [ "$(uname)" = "Darwin" ] && xcodebuild -version >/dev/null 2>&1 && [ -n "${TEAM:-}" ]; then mobile/ios/build-ios.sh
  else
    mobile/ios/build-ios.sh prepare >/dev/null
    mkdir -p dist/iOS
    rm -f "dist/iOS/Sinai-$VERSION-iOS-Xcode.zip"
    (cd mobile && zip -qr "../dist/iOS/Sinai-$VERSION-iOS-Xcode.zip" ios -x '*.DS_Store' -x 'ios/build/*')
    sed "s/__VERSION__/$VERSION/g" scripts/panduan-instal/iOS.txt > dist/iOS/CARA-INSTAL.txt
    echo "  .ipa butuh Xcode + akun Apple Developer (TEAM=...). Proyek Xcode dikemas: dist/iOS/Sinai-$VERSION-iOS-Xcode.zip"
  fi
fi

./scripts/collect-downloads.sh
