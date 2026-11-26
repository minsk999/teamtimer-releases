#!/bin/bash
# 탭 줄 판정 검증 — 실제 크롬 창을 띄우고 --probe 결과를 확인한다.
# CI(GitHub 맥 러너)는 손쉬운 사용 권한이 미리 허용돼 있다. 내 맥에서 돌리려면 터미널에 그 권한이 있어야 한다.
# 먼저 build.sh 로 빌드해 둘 것:  bash chrometabwheel/mac/test-ax.sh
set -uo pipefail
cd "$(dirname "$0")"

BIN=build/ChromeTabWheel.app/Contents/MacOS/ChromeTabWheel
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE=$(mktemp -d)
FLAGS=(--user-data-dir="$PROFILE" --no-first-run --no-default-browser-check --use-mock-keychain)
fail=0
check() {   # check <설명> <출력> <있어야 할 문자열>
  if grep -qF -- "$3" <<<"$2"; then echo "  ok   $1"; else echo "  FAIL $1 — '$3' 없음"; fail=1; fi
}

sw_vers | tr '\n' ' '; echo
"$CHROME" --version

echo "== 1. 탭이 있는 일반 창"
"$CHROME" "${FLAGS[@]}" --window-position=80,80 --window-size=1200,800 about:blank chrome://version >/dev/null 2>&1 &
sleep 12
out=$("$BIN" --probe --tree); rc=$?
echo "$out"; echo "exit=$rc"
check "탭 줄을 찾음" "$out" "  탭 줄 ["
check "탭 줄 안(20pt)은 전환" "$out" "위에서 20pt → 전환 : 탭 줄 [크롬 확인"
check "주소창 높이(60pt)는 통과" "$out" "위에서 60pt → 통과 : 탭 줄 밖 [크롬 확인"
check "본문(300pt)은 통과" "$out" "위에서 300pt → 통과"

echo "== 2. 탭 줄이 없는 앱 창을 추가"
"$CHROME" "${FLAGS[@]}" --app="data:text/html,<title>app</title><h1>app</h1>" >/dev/null 2>&1 &
sleep 8
out=$("$BIN" --probe --tree); rc=$?
echo "$out"; echo "exit=$rc"
check "앱 창은 탭 줄 없음" "$out" "  탭 줄 없음"
check "앱 창 맨 위(20pt)는 통과" "$out" "위에서 20pt → 통과 : 탭 줄 없는 창"
# 두 창이 거의 같은 자리에 겹쳐 뜬다 — 그래도 탭 있는 창은 탭 있는 창으로 읽어야 한다(창을 서로 바꿔 읽지 않는지)
check "겹친 일반 창은 여전히 탭 줄 있음" "$out" "  탭 줄 ["
check "겹친 일반 창의 탭 줄(20pt)은 전환" "$out" "위에서 20pt → 전환 : 탭 줄 [크롬 확인"

pkill -f "user-data-dir=$PROFILE" || true
exit $fail
