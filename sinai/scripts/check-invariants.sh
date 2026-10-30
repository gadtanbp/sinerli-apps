#!/bin/bash
# Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
# Penjaga aturan yang TIDAK BOLEH hilang di update berikutnya. Dijalankan otomatis
# oleh build-all.sh; build berhenti bila salah satu aturan terhapus/berubah.
set -uo pipefail
cd "$(dirname "$0")/.."
WEB=Resources/web/js
SRV="../SInerli web"
fail=0
need() { # need <berkas> <pola grep -E> <keterangan>
  if [ ! -f "$1" ]; then echo "  (lewati) $1 tidak ada"; return; fi
  if grep -Eq -- "$2" "$1"; then echo "  ✓ $3"; else echo "  ✗ $3  ($1)"; fail=1; fi
}
echo "━━ Cek aturan wajib Sinai/Sinerli"
need $WEB/prompts.js "var SINERLI_IDENTITY = 'You are Sinerli AI" "Identitas Sinerli di prompt Sinai"
need $WEB/prompts.js "if \(ctx\.sinerli\) return SINERLI_IDENTITY" "Identitas dipakai untuk provider Sinerli"
need $WEB/prompts.js "Never claim to be, or name as yourself" "Larangan mengaku model/vendor lain"
need $WEB/engine.js "sinerli: r\.provider\.presetId === 'sinerli'" "Engine meneruskan penanda Sinerli"
need $WEB/providers.js "caps\.toolMode = nativeOk \? 'native' : 'xml'" "Provider Sinerli: alat native bila server pass-through, selain itu protokol teks"
need "$SRV/shared/lib/ai_passthrough.php" "function aipt_chat" "API Sinerli pass-through (seperti API key biasa)"
need "$SRV/api/sinerli_ai.php" "aipt_chat\(\\\$gens" "/ai/v1 memakai pass-through"
need "$SRV/api/ai_gateway.php" "aipt_chat\(\\\$plan" "/gw/v1 memakai pass-through"
need "$SRV/shared/lib/ai_passthrough.php" "aipt_with_identity|\\\$system\[\] = \\\$identity" "Identitas tetap disisipkan di pass-through"
need $WEB/providers.js "id: 'sinerli', name: 'Sinerli'" "Satu provider bernama Sinerli"
need $WEB/engine.js "function repairHint" "Self-repair mode Code"
need $WEB/engine.js "'self-repair'" "Dorongan lanjut setelah alat gagal"
need $WEB/board.js "window.Board" "Board multi fungsi"
need "$SRV/shared/lib/sinerli_ai_engine.php" "function sai_identity_rule" "Identitas Sinerli di server (/ai/v1)"
need "$SRV/shared/lib/sinerli_ai_engine.php" "return \\\$out \. \"\\\\n\\\\n\" \. \\\$identityLast" "Identitas server ditaruh paling akhir"
need "$SRV/shared/lib/ai_blend.php" "\\\$system\[\] = gw_identity_prompt" "Identitas Racikan (/gw/v1) diulang di akhir"
need "$SRV/shared/lib/sinerli_ai_engine.php" "saverLocal = \\\$saver && !\\\$clientSystem" "Jawaban lokal tidak menimpa klien beralat"
# Sintaks JS
for f in $WEB/*.js; do node --check "$f" >/dev/null 2>&1 || { echo "  ✗ sintaks JS: $f"; fail=1; }; done
[ $fail = 0 ] && echo "  semua aturan utuh" || { echo "Ada aturan wajib yang hilang — perbaiki sebelum build."; exit 1; }
