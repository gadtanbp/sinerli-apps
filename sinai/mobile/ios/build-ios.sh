#!/bin/bash
# Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
# Build Sinai untuk iOS / iPadOS.
#
#   mobile/ios/build-ios.sh prepare            siapkan UI web + versi (lalu buka Sinai.xcodeproj di Xcode)
#   mobile/ios/build-ios.sh simulator          .app untuk iOS Simulator (tanpa tanda tangan)
#   TEAM=ABCDE12345 mobile/ios/build-ios.sh    .ipa bertanda tangan (Ad Hoc) → dist/iOS/
#   TEAM=ABCDE12345 METHOD=app-store mobile/ios/build-ios.sh   untuk TestFlight / App Store
#
# Butuh Xcode 15+ (bukan hanya Command Line Tools) dan, untuk .ipa, akun Apple Developer.
# iOS tidak mengizinkan memasang aplikasi dari berkas sembarang: distribusikan lewat
# TestFlight/App Store, lalu isi tautannya di Sinerli › Rilis Sinai › iOS.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
MODE="${1:-ipa}"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
IFS=. read -r MA MI PA <<< "$VERSION"
BUILD=$((MA * 10000 + MI * 100 + PA))

"$ROOT/mobile/build-web.sh" "$HERE/Sinai/web" ios
sed -i '' -e "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $VERSION;/" -e "s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $BUILD;/" "$HERE/Sinai.xcodeproj/project.pbxproj"
echo "✓ Versi $VERSION ($BUILD)"
[ "$MODE" = "prepare" ] && { echo "Buka $HERE/Sinai.xcodeproj di Xcode."; exit 0; }

if ! xcodebuild -version >/dev/null 2>&1; then
  echo "Xcode penuh tidak ditemukan (xcode-select menunjuk ke Command Line Tools)." >&2
  echo "Pasang Xcode dari App Store, lalu: sudo xcode-select -s /Applications/Xcode.app" >&2
  exit 1
fi
B="$ROOT/build/ios"
mkdir -p "$B" "$ROOT/dist/iOS"
if [ "$MODE" = "simulator" ]; then
  xcodebuild -project "$HERE/Sinai.xcodeproj" -scheme Sinai -configuration Debug -sdk iphonesimulator -derivedDataPath "$B/dd" CODE_SIGNING_ALLOWED=NO build | tail -3
  (cd "$B/dd/Build/Products/Debug-iphonesimulator" && zip -qry "$ROOT/dist/iOS/Sinai-$VERSION-Simulator.zip" Sinai.app)
  echo "✓ dist/iOS/Sinai-$VERSION-Simulator.zip  (xcrun simctl install booted Sinai.app)"
  exit 0
fi
: "${TEAM:?Isi TEAM=<Apple Developer Team ID>}"
METHOD="${METHOD:-ad-hoc}"
xcodebuild -project "$HERE/Sinai.xcodeproj" -scheme Sinai -configuration Release -sdk iphoneos -archivePath "$B/Sinai.xcarchive" \
  DEVELOPMENT_TEAM="$TEAM" -allowProvisioningUpdates archive | tail -3
cat > "$B/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>$METHOD</string>
<key>teamID</key><string>$TEAM</string>
<key>signingStyle</key><string>automatic</string>
</dict></plist>
PLIST
xcodebuild -exportArchive -archivePath "$B/Sinai.xcarchive" -exportPath "$B/export" -exportOptionsPlist "$B/ExportOptions.plist" -allowProvisioningUpdates | tail -3
cp "$B/export/Sinai.ipa" "$ROOT/dist/iOS/Sinai-$VERSION.ipa"
echo "✓ dist/iOS/Sinai-$VERSION.ipa ($METHOD)"
