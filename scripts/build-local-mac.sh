#!/bin/bash
# Sinerli Apps — build .dmg universal (Intel + Apple Silicon) semua aplikasi di Mac ini.
# CARGO_TARGET_DIR bersama supaya crate hanya dikompilasi sekali.
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR="$PWD/build/.target"
export CI=true   # lewati penataan jendela DMG lewat Finder (tidak butuh izin otomasi)
rustup target add aarch64-apple-darwin x86_64-apple-darwin || exit 1
for a in ${1:-rupa dokum hitara present note}; do
  node scripts/build-app.mjs "$a" build -- --bundles app,dmg 2>&1 | tee "/tmp/sinerli-$a-build.log"
  [ "${PIPESTATUS[0]}" = 0 ] || { echo "BUILD_GAGAL $a"; echo FAILED > /tmp/sinerli-mac-done; exit 1; }
done
ls -la dist/*/*.dmg
echo OK > /tmp/sinerli-mac-done
