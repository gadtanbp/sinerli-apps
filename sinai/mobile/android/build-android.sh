#!/bin/bash
# Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
# Build APK Android Sinai langsung dengan Android SDK (tanpa Gradle, tanpa unduhan).
#
#   mobile/android/build-android.sh            → dist/Android/Sinai-<versi>.apk (rilis, bertanda tangan)
#   mobile/android/build-android.sh debug      → APK debug (WebView bisa diinspeksi dari chrome://inspect)
#
# Butuh: Android SDK (platforms/android-36, build-tools 35+) dan JDK 17+ (otomatis
# memakai JDK bawaan Android Studio bila ada).
#
# PENTING: kunci tanda tangan rilis ada di mobile/android/keys/. Simpan cadangannya.
# Pembaruan Sinai di Android HANYA bisa dipasang bila ditandatangani kunci yang sama.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
MODE="${1:-release}"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
PLATFORM="$SDK/platforms/android-36/android.jar"
BT="$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)"
if [ -x "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/javac" ]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
fi
JAVAC="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
KEYTOOL="${JAVA_HOME:+$JAVA_HOME/bin/}keytool"
[ -f "$PLATFORM" ] || { echo "Android SDK platform android-36 tidak ditemukan di $SDK" >&2; exit 1; }

VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
IFS=. read -r MA MI PA <<< "$VERSION"
VCODE=$((MA * 10000 + MI * 100 + PA))
B="$ROOT/build/android"
rm -rf "$B"
mkdir -p "$B/gen/com/sinerli/sinai" "$B/obj" "$B/dex" "$B/assets"

echo "› UI web"
"$ROOT/mobile/build-web.sh" "$B/assets/web" android >/dev/null

echo "› resource & manifest"
sed -e "s/__VERSION__/$VERSION/" -e "s/__VERSION_CODE__/$VCODE/" "$HERE/AndroidManifest.xml" > "$B/AndroidManifest.xml"
"$BT/aapt2" compile --dir "$HERE/res" -o "$B/res.zip"
"$BT/aapt2" link -o "$B/base.apk" -I "$PLATFORM" --manifest "$B/AndroidManifest.xml" --java "$B/gen" \
  -A "$B/assets" --min-sdk-version 26 --target-sdk-version 36 --version-code "$VCODE" --version-name "$VERSION" \
  --auto-add-overlay -0 wasm -0 bcmap "$B/res.zip"

DEBUG=false; [ "$MODE" = "debug" ] && DEBUG=true
cat > "$B/gen/com/sinerli/sinai/BuildConfig.java" <<EOF
// Dibuat oleh build-android.sh — jangan diedit.
package com.sinerli.sinai;
final class BuildConfig {
    static final String VERSION = "$VERSION";
    static final int VERSION_CODE = $VCODE;
    static final boolean DEBUG = $DEBUG;
}
EOF

echo "› javac"
# Daftar sumber lewat berkas argumen (jalur proyek mengandung spasi).
find "$HERE/src" "$B/gen" -name '*.java' | sed 's/.*/"&"/' > "$B/sources.txt"
"$JAVAC" -nowarn -Xlint:-options -encoding UTF-8 -source 8 -target 8 -bootclasspath "$PLATFORM:$BT/core-lambda-stubs.jar" -d "$B/obj" @"$B/sources.txt"
echo "› d8"
JAR="${JAVA_HOME:+$JAVA_HOME/bin/}jar"
"$JAR" cf "$B/classes.jar" -C "$B/obj" .
"$BT/d8" $([ "$MODE" = "debug" ] && echo --debug || echo --release) --min-api 26 --lib "$PLATFORM" --output "$B/dex" "$B/classes.jar"
(cd "$B/dex" && zip -q -j "$B/base.apk" classes.dex)

echo "› zipalign & tanda tangan"
"$BT/zipalign" -p -f 4 "$B/base.apk" "$B/aligned.apk"
KEYS="$HERE/keys"
mkdir -p "$KEYS"
if [ ! -f "$KEYS/sinai-release.jks" ]; then
  PASS="$(openssl rand -hex 24)"
  "$KEYTOOL" -genkeypair -keystore "$KEYS/sinai-release.jks" -alias sinai -keyalg RSA -keysize 4096 -validity 36500 \
    -storepass "$PASS" -keypass "$PASS" -dname "CN=Sinai, O=Gadtan x Gallen, C=ID" >/dev/null 2>&1
  printf 'storePassword=%s\nkeyAlias=sinai\n' "$PASS" > "$KEYS/keystore.properties"
  chmod 600 "$KEYS/sinai-release.jks" "$KEYS/keystore.properties"
  echo "  ! Kunci rilis baru dibuat di $KEYS — SIMPAN CADANGANNYA (tanpa kunci ini pembaruan tidak bisa dipasang)."
fi
PASS="$(sed -n 's/^storePassword=//p' "$KEYS/keystore.properties")"
mkdir -p "$ROOT/dist/Android"
SUFFIX=""; [ "$MODE" = "debug" ] && SUFFIX="-debug"
OUT="$ROOT/dist/Android/Sinai-$VERSION$SUFFIX.apk"
"$BT/apksigner" sign --ks "$KEYS/sinai-release.jks" --ks-key-alias sinai --ks-pass "pass:$PASS" --key-pass "pass:$PASS" \
  --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false --out "$OUT" "$B/aligned.apk"
"$BT/apksigner" verify "$OUT"
sed "s/__VERSION__/$VERSION/g" "$ROOT/scripts/panduan-instal/Android.txt" > "$ROOT/dist/Android/CARA-INSTAL.txt"
echo "✓ $OUT ($(du -h "$OUT" | cut -f1))"
