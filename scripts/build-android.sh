#!/bin/bash
# Sinerli Apps — APK Android langsung dengan Android SDK (tanpa Gradle/NDK).
#   scripts/build-android.sh [rupa dokum hitara present note]
# Hasil: dist/android/Sinerli-<App>-<versi>.apk
# PENTING: kunci rilis di _shell/android/keys/ — simpan cadangannya; pembaruan APK
# hanya bisa dipasang bila ditandatangani kunci yang sama.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"; HERE="$ROOT/_shell/android"
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
PLATFORM="$SDK/platforms/android-36/android.jar"
BT="$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)"
if [ -x "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/javac" ]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
fi
J="${JAVA_HOME:+$JAVA_HOME/bin/}"
VERSION="$(tr -d '[:space:]' < VERSION)"
IFS=. read -r MA MI PA <<< "$VERSION"; VCODE=$((MA * 10000 + MI * 100 + PA))
KEYS="$HERE/keys"; mkdir -p "$KEYS"
if [ ! -f "$KEYS/sinerli-release.jks" ]; then
  PASS="$(openssl rand -hex 24)"
  "${J}keytool" -genkeypair -keystore "$KEYS/sinerli-release.jks" -alias sinerli -keyalg RSA -keysize 4096 -validity 12000 \
    -storepass "$PASS" -keypass "$PASS" -dname "CN=Sinerli Apps, O=Gadtan x Gallen, C=ID" >/dev/null 2>&1
  printf 'storePassword=%s\n' "$PASS" > "$KEYS/keystore.properties"
  chmod 600 "$KEYS/sinerli-release.jks" "$KEYS/keystore.properties"
  echo "! Kunci rilis baru di $KEYS — SIMPAN CADANGANNYA."
fi
PASS="$(sed -n 's/^storePassword=//p' "$KEYS/keystore.properties")"
# Folder kerja baru tiap build, di dalam build/ (aman dihapus kapan saja).
mkdir -p build
W="$(mktemp -d "$ROOT/build/android.XXXXXX")"
mkdir -p "$W/obj" "$W/dex"
# Kelas Java sama untuk semua aplikasi: cukup dikompilasi sekali.
"${J}javac" -nowarn -Xlint:-options -encoding UTF-8 -source 8 -target 8 -bootclasspath "$PLATFORM:$BT/core-lambda-stubs.jar" -d "$W/obj" "$HERE/src/com/sinerli/shell/MainActivity.java"
"${J}jar" cf "$W/classes.jar" -C "$W/obj" .
"$BT/d8" --release --min-api 26 --lib "$PLATFORM" --output "$W/dex" "$W/classes.jar"
mkdir -p dist/android
for id in ${@:-rupa dokum hitara present note}; do
  case "$id" in
    rupa) L="Sinerli Rupa";; dokum) L="Sinerli Dokum";; hitara) L="Sinerli Hitara";;
    present) L="Sinerli Present";; note) L="Sinerli Note";; *) echo "tidak dikenal: $id"; exit 1;;
  esac
  B="$W/$id"; mkdir -p "$B/assets/web" "$B/res"
  (cd "sinerli $id/web" && tar cf - --exclude .DS_Store .) | (cd "$B/assets/web" && tar xf -)
  for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
    n=${d%%:*}; s=${d##*:}; mkdir -p "$B/res/mipmap-$n"
    sips -Z "$s" "assets/logo-$id.png" --out "$B/res/mipmap-$n/ic_launcher.png" >/dev/null
  done
  sed -e "s/__ID__/$id/g" -e "s/__LABEL__/$L/" -e "s/__VERSION__/$VERSION/" -e "s/__VERSION_CODE__/$VCODE/" "$HERE/AndroidManifest.xml" > "$B/AndroidManifest.xml"
  "$BT/aapt2" compile --dir "$B/res" -o "$B/res.zip"
  "$BT/aapt2" link -o "$B/base.apk" -I "$PLATFORM" --manifest "$B/AndroidManifest.xml" -A "$B/assets" \
    --min-sdk-version 26 --target-sdk-version 36 --version-code "$VCODE" --version-name "$VERSION" "$B/res.zip"
  (cd "$W/dex" && zip -q -j "$B/base.apk" classes.dex)
  "$BT/zipalign" -p -f 4 "$B/base.apk" "$B/aligned.apk"
  OUT="dist/android/$(echo "$L" | tr ' ' '-')-$VERSION.apk"
  "$BT/apksigner" sign --ks "$KEYS/sinerli-release.jks" --ks-key-alias sinerli --ks-pass "pass:$PASS" --key-pass "pass:$PASS" \
    --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false --out "$OUT" "$B/aligned.apk"
  "$BT/apksigner" verify "$OUT"
  echo "OK $OUT ($(du -h "$OUT" | cut -f1))"
done
