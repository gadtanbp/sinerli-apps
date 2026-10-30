#!/bin/bash
# Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
# Menaikkan nomor versi di berkas VERSION (sumber tunggal untuk semua platform).
# Aturan: setiap pembaruan naik 1 angka terakhir, maksimal .9, lalu pindah ke
# minor berikutnya:  1.1.0 → 1.1.1 → … → 1.1.9 → 1.2.0 → 1.2.1 → … → 1.9.9 → 2.0.0
#
#   scripts/bump-version.sh          naikkan satu langkah dan tampilkan versi baru
#   scripts/bump-version.sh --show   tampilkan versi sekarang dan berikutnya saja
set -euo pipefail
cd "$(dirname "$0")/.."

cur="$(tr -d '[:space:]' < VERSION)"
if ! [[ "$cur" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "VERSION tidak valid: '$cur' (harus X.Y.Z)" >&2; exit 1
fi
major=${BASH_REMATCH[1]}; minor=${BASH_REMATCH[2]}; patch=${BASH_REMATCH[3]}

patch=$((patch + 1))
if [ "$patch" -gt 9 ]; then patch=0; minor=$((minor + 1)); fi
if [ "$minor" -gt 9 ]; then minor=0; major=$((major + 1)); fi
next="$major.$minor.$patch"

if [ "${1:-}" = "--show" ]; then echo "sekarang $cur → berikutnya $next"; exit 0; fi
printf '%s\n' "$next" > VERSION
echo "$cur → $next"
