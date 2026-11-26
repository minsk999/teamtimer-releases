#!/bin/bash
# AdPopupBlock 맥판 빌드 — 유니버설(arm64 + x86_64) 앱 → ad-hoc 서명 → 검증 → zip
# 맥에서 실행: bash adpopupblock/mac/build.sh   (CI: .github/workflows/adpopupblock-mac.yml)
set -euo pipefail
cd "$(dirname "$0")"

VER=$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' Info.plist)
SRC_VER=$(sed -n 's/^let appVersion = "\(.*\)"$/\1/p' main.swift)
if [ "$VER" != "$SRC_VER" ]; then
  echo "버전 불일치: Info.plist=$VER main.swift=$SRC_VER" >&2
  exit 1
fi

OUT=build
APP="$OUT/AdPopupBlock.app"
rm -rf "$OUT"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos11.0" -o "$OUT/AdPopupBlock-$arch" main.swift -framework ApplicationServices
done
lipo -create -output "$APP/Contents/MacOS/AdPopupBlock" "$OUT/AdPopupBlock-arm64" "$OUT/AdPopupBlock-x86_64"

cp Info.plist "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"

# 번들 전체 ad-hoc 서명 — CodeResources 가 없으면 애플실리콘에서 "변조된 앱"으로 차단된다(TeamTimer 에서 겪음).
codesign --force --sign - --timestamp=none "$APP"
codesign --verify --strict --verbose=2 "$APP"
test -f "$APP/Contents/_CodeSignature/CodeResources" || { echo "CodeResources 없음" >&2; exit 1; }

ARCHS=$(lipo -archs "$APP/Contents/MacOS/AdPopupBlock")
echo "archs: $ARCHS"
[[ "$ARCHS" == *arm64* && "$ARCHS" == *x86_64* ]] || { echo "유니버설 아님: $ARCHS" >&2; exit 1; }

RUN_VER=$("$APP/Contents/MacOS/AdPopupBlock" --version)
[ "$RUN_VER" = "$VER" ] || { echo "--version 결과 이상: $RUN_VER" >&2; exit 1; }

ZIP="$OUT/AdPopupBlock-$VER-mac.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
shasum -a 256 "$ZIP"
echo "완료: $ZIP"
