#!/bin/bash
# Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
# Mengumpulkan semua installer dari dist/ ke "Download all/" + SHA256SUMS.txt.
# Di APFS berkas disalin sebagai clone (tidak memakan ruang disk tambahan).
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="$(tr -d '[:space:]' < VERSION)"
OUT="Download all"
rm -rf "$OUT"
mkdir -p "$OUT"
copy() { cp -c "$1" "$2" 2>/dev/null || cp "$1" "$2"; }
for d in macOS Windows Linux Android iOS; do
  [ -d "dist/$d" ] || continue
  found=0
  for f in "dist/$d"/*; do
    [ -f "$f" ] || continue
    case "$f" in *.blockmap|*.yml|*.yaml|*.idsig|*-debug.apk) continue ;; esac
    case "$f" in *"$VERSION"*|*/CARA-INSTAL.txt) ;; *) continue ;; esac   # hanya versi saat ini
    mkdir -p "$OUT/$d"
    copy "$f" "$OUT/$d/$(basename "$f")"
    found=1
  done
  [ "$found" = 1 ] || rmdir "$OUT/$d" 2>/dev/null || true
done
(cd "$OUT" && find . -type f ! -name CARA-INSTAL.txt ! -name 'SHA256SUMS.txt' ! -name 'BACA-DULU.txt' | sed 's|^\./||' | LC_ALL=C sort | while IFS= read -r f; do
  printf '%s  %s\n' "$(shasum -a 256 "$f" | awk '{print $1}')" "$f"
done) > "$OUT/SHA256SUMS.txt"
sed "s/__VERSION__/$VERSION/g" scripts/panduan-instal/Download-all.txt > "$OUT/BACA-DULU.txt"
echo "✓ $OUT/"
(cd "$OUT" && find . -type f | sed 's|^\./|  |' | LC_ALL=C sort)
