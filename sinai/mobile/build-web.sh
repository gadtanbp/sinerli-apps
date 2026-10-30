#!/bin/bash
# Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
# Merakit UI web Sinai untuk Android & iOS ke satu folder:
#   Resources/web + mobile/web/host-mobile.js + pembaca berkas (desktop/lib/worker: pdf.js, konversi dokumen)
#
#   mobile/build-web.sh <folder-tujuan> <android|ios>
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:?folder tujuan}"
TARGET="${2:?android atau ios}"
rm -rf "$OUT"
mkdir -p "$OUT"
rsync -a --exclude .DS_Store Resources/web/ "$OUT/"
cp mobile/web/host-mobile.js "$OUT/js/host-mobile.js"
cp desktop/lib/worker/worker.js "$OUT/gx-worker.js"
rsync -a --exclude .DS_Store desktop/lib/worker/pdfjs/ "$OUT/pdfjs/"

if [ "$TARGET" = "android" ]; then
  FRAME="https://preview.sinai.invalid"
else
  FRAME="sinai-preview:"
fi
# CSP ponsel: sama ketatnya dengan desktop (tanpa gambar/skrip remote), ditambah
# fetch ke asal sendiri (berkas lampiran & pdf.js) dan worker pdf.js.
CSP="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self' blob: data:; frame-src $FRAME https: http:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'"
python3 - "$OUT/index.html" "$CSP" <<'EOF'
import re, sys
p, csp = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
s, n = re.subn(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '<meta http-equiv="Content-Security-Policy" content="' + csp + '">', s)
assert n == 1, 'CSP meta tidak ditemukan'
assert '<script src="js/native.js"></script>' in s
s = s.replace('<script src="js/native.js"></script>', '<script src="js/host-mobile.js"></script>\n<script src="js/native.js"></script>')
open(p, 'w', encoding='utf-8').write(s)
EOF
echo "✓ UI web ($TARGET) → $OUT ($(du -sh "$OUT" | cut -f1))"
