# 작업타이머 (TeamTimer) — Claude Code 작업 컨텍스트

> 상시 컨텍스트. **현재 상황은 `STATUS.md`, 다음 할 일은 `TODO.md`** 참조.

## 프로젝트
ADEF 영상팀 업무 타이머. Electron 데스크탑 앱 + 구글시트 동기화 + Gmail 메일탭.
BrowserWindow 440×720. 런타임 의존성은 **`electron-updater` 하나뿐**(자동 업데이트용). 나머지는 순수 JS.
Windows 정상. ⚠️ **맥은 v1.0.27~1.0.30 이 실기 미검증**이다(`TODO.md` D-2).

사용자: 구민석(영상팀 팀장). 한국어, 두괄식·간결 선호. 픽셀 디테일에 민감.
팀원 8명: 구민석·한영채·주지현·박나진·김본희·구정현·표경림·서채린 (2026-09-21 `?action=members` 실측 — 09-18 박지수 → 표경림 교체, 09-21 서채린 추가. 정본은 `🤖자동화` 시트 A열이라 이 목록은 참고용).

## 레포
**`minsk999/teamtimer-releases`** (public)
```
main.js                 메인 프로세스 (창/트레이/Gmail/공휴일/업데이트확인)
preload.js              contextBridge (window.timerAPI)
renderer/index.html     UI 의 HTML·CSS (스크립트는 v1.0.43 부터 renderer/app.js — 예전 인라인 <script> 를 그대로 옮김)
renderer/caret.js       부드러운 커서(v1.0.45, 글꼴함 ui/caret.js 를 값 그대로 — 고칠 땐 BannerNode·글꼴함·라이트 다운로더와 값을 맞출 것). 검사 test/caret.browser.js
renderer/app.js         UI 스크립트 전체(전역 함수 — 인라인 onclick 이 부른다). 시험은 test/renderer-src.js 로 읽는다
main-lib.js             main.js 의 순수 함수(버전 비교·링크 검사·맥 자산·해시 대조) — ★build.files 에 있어야 한다
tools/release-notes.js  설명서 변경 내역 → 릴리스 본문(한국어)
patch-mac-name.js       CI mac job 전용 — productName을 ASCII로
sign-mac.js             CI mac job 전용 — ad-hoc 서명 (필수, 아래 참조)
build/                  아이콘 (icon.icns/ico/png, tray*, trayTemplate*)
build-secrets.example.js  비밀값 템플릿
docs/index.html         GitHub Pages 설명서 = 다운로드 페이지
docs/intranet-ddalkkak-extension.zip   딸깍 크롬 확장 배포본
gas/                    GAS **참조 사본**(v70) + 지문 설계 초안(v60 으로 실현) (정본은 intranet-ttalkak/server/)
bump-version.js         `npm run bump 1.0.31` — package.json + docs 버전 동시 갱신
.github/workflows/release.yml   v* 태그 → macOS+Windows 빌드 → Releases
```

## 환경
- Electron **31.7.7** (`^31.0.0`), electron-builder **^24.13.3**, Node 22
- appId `kr.co.adef.jakeop-timer`
- productName: Windows `작업 타이머` / **macOS `TeamTimer`** (CI에서 patch-mac-name.js가 교체)
- 비밀값: `build-secrets.js` (git 제외). CI가 Actions Secrets로 생성 —
  `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `HOLIDAY_SERVICE_KEY` 3개.
  main.js가 try/catch로 require (없으면 빈 값으로 동작).

## 로컬 실행
**`run-dev.cmd` 더블클릭**(탐색기)이 가장 쉽다. Electron 바이너리가 없으면 자동 복구까지 한다.
터미널로 할 땐 PowerShell 기준 `cd <경로>; npx electron .` — **`&&` 는 PowerShell 5.1 에서 파서 오류**다.

⚠️ **클로드 코드의 코드블록 [실행] 버튼으로는 앱을 띄우지 말 것.** GUI 앱이라 프로세스가 안 끝나서
버튼이 무한 로딩에 걸린다(사용자 실제 제보). 창을 띄우는 명령은 사용자가 직접 터미널에서 실행한다.

⚠️ **설치본이 트레이에 떠 있으면 개발본이 안 뜬다.** `requestSingleInstanceLock` 이 userData 경로
기준이라 둘이 같은 잠금을 쓴다 — 두 번째 인스턴스는 조용히 종료되고 설치본 창만 앞으로 나온다(실측).
창만 닫으면 트레이에 남으므로 **트레이 우클릭 → 종료**로 완전히 끄고 시작할 것.

⚠️ `npm install` 이 이상하게 빨리 끝나면 **Electron 바이너리가 안 받아진 것**이다(`dist/` 에 `locales`
만 남고 `electron.exe` 없음). `install.js` 는 그래도 exit 0 이라 오류가 안 보인다. 캐시 zip 을 직접
풀면 된다 — `run-dev.cmd` 가 그 복구를 자동으로 시도한다.

## 빌드
```bash
npm install
npm run build:mac    # x64/arm64 각각 --dir → sign-mac.js → --prepackaged로 dmg
npm run build:win    # nsis exe
npx electron .       # 개발모드
```
릴리스: package.json version 올림 → `git tag vX.Y.Z` → 태그 push → CI 자동 빌드.
릴리스 제목(`작업 타이머 vX.Y.Z`)·본문은 v1.0.43 부터 CI 가 넣는다. ⚠️ 승격하거나 본문을 손으로 고친 뒤 그 태그 실행을 **다시 돌리면**
제목·본문이 덮이고 prerelease 로 되돌아간다(latest 가 직전 판으로 — 팀 배너가 사라짐). 다시 돌렸으면 승격을 다시 할 것. 검증 전이면 `prerelease:true`로 두면
앱의 업데이트 배너가 안 뜬다(`releases/latest`가 prerelease를 건너뛰므로).

## ⚠️ macOS 필수 규칙 — 어기면 앱이 실행되지 않음

**① 앱 이름은 반드시 ASCII**
`CFBundleName`/`CFBundleDisplayName`이 한글이면 `app.getName()`이 한글이 되고,
데이터 폴더 경로(`~/Library/Application Support/<이름>`)에 한글이 들어가 **실행 즉시 SIGTRAP**.
patch-mac-name.js가 macOS 빌드에서만 productName을 `TeamTimer`로 바꾸고
extendInfo에 한글 이름을 **넣지 않는다**. 이 파일을 되돌리지 말 것.

**② 번들 전체 ad-hoc 서명 필수**
`mac.identity:"-"` 만으로는 `_CodeSignature/CodeResources`가 생성되지 않는다.
없으면 macOS가 "변조된 앱"으로 판정 → **Apple Silicon에서 악성코드로 차단·자동삭제**.
sign-mac.js가 dylib → 프레임워크 → Helper앱 → 본체 **순서대로** 서명한다.
순서가 틀리면 바깥 서명이 즉시 무효화된다. CI에 검증 단계가 있어 누락 시 빌드 실패.
Intel 맥은 이 상태도 관대하게 통과하므로, **Intel에서 잘 된다고 안심하면 안 된다.**

**③ 새 리소스 추가 시 `build.files` 배열에 반드시 추가**
안 하면 패키지에서 조용히 빠진다 (트레이 아이콘에서 실제로 겪음).

**④ `build.mac.target` 에 `arch` 배열을 넣지 말 것**
`build:mac` 은 `--prepackaged` 로 앱을 **하나씩** 지정해 dmg/zip 을 만든다. 그런데 `arch` 배열이
있으면 **매 호출이 x64·arm64 이름 자산을 둘 다** 그 하나의 앱으로 만든다 → 마지막(arm64) 호출이
x64 이름 자산까지 덮어써서 **`-x64.dmg`/`-x64.zip` 안에 arm64 바이너리가 들어간다.**
`v1.0.12`~`v1.0.28` 이 전부 이 상태였다(2026-08-28 실측 — `x64.zip` 의 cputype 이 `0x0100000C`=arm64,
두 zip 의 sha256 이 동일). Intel 맥에서 실행되지 않는다. 파일명만 보면 절대 안 보인다.
→ `"target": ["dmg", "zip"]` 로 두고 CLI 의 `--x64`/`--arm64` 가 결정하게 한다.
CI 에 `Verify mac artifact architectures` 단계가 있어 이름↔실제(`lipo -archs`)가 다르면 빌드가 실패한다.

## 진단용 포크는 v1.0.39 에서 지웠다
`_apptest/`·`_mintest/`(앱 전체의 낡은 포크 — 실제 시트에 쓸 수 있었다)·그 워크플로 둘·폐기된 `AppsScript_읽기API.gs` 를 삭제했다(git 이력에는 남음).
진단용 빌드를 다시 만들 때 주의: 포크가 실제 `WEBAPP_URL` 을 가지면 팀 시트가 바뀌고, `prerelease: true` 없는 태그 릴리스는
`releases/latest` 를 빼앗아 팀 전원의 업데이트 배너를 죽인다(`cmpVer` 가 버전을 못 읽음).

## 보안 경계 (v1.0.39)
- ★**밖으로 여는 길은 전부 `main.js` 의 `openUrl()` 하나를 지난다**(IPC `open-external`·`setWindowOpenHandler`·`will-navigate`). 거기서 http/https/mailto 만 연다.
  예전엔 카드 링크 아이콘의 `onclick=stopPropagation` 때문에 렌더러의 가로채기가 안 불리고 새 창 요청으로 새서 **검사 없이** `shell.openExternal` 에 닿았다.
  렌더러는 시트 유래 링크를 `webUrl()` 로 거른다(스킴 없는 `도메인/경로` 는 https 를 붙임 — 입력칸 안내 모양). 시험 `test/weburl.test.js`.
- 렌더러 CSP(meta): 바깥 출처 전부 차단(글꼴도 v1.0.44 부터 `renderer/fonts` — 예전 CDN 과 같은 파일, OFL). CDN 을 다시 쓰지 말 것.
- 패키지 퓨즈(v1.0.44, `tools/fuses.js` = afterPack): RunAsNode·NODE_OPTIONS·inspect 인자 끔, app.asar 에서만 로드. 맥은 --dir 단계에서 바뀌고 sign-mac.js 가 다시 서명. ⚠️ dist 의 패키지 앱을 띄우지 말 것(자동 실행 레지스트리를 건드린다) — 확인은 `npx @electron/fuses read --app <exe>`. 인라인 onclick 때문에 `'unsafe-inline'` 이라 **HTML 주입은 못 막는다** — 외부 문자열은 반드시 `esc()`.
  시험 하네스는 eval 대신 `<script>` 주입으로 돈다(`test/delete-race.browser.js`).
- Gmail 토큰: 윈도는 `safeStorage`(DPAPI) 암호화, 맥은 평문 + 0600(ad-hoc 서명이라 키체인 허용 창이 업데이트마다 뜰 수 있어 보류). OAuth 는 state + PKCE.
  ⚠️ 1.0.39 에서 그 전 버전으로 내리면 암호화된 토큰을 못 읽어 메일을 다시 연결해야 한다(데이터 손실은 없음).
- 오류 기록: `userData/error.log`(256KB 넘으면 뒤 절반만). 메인·렌더러 예외, 동기화 실패 원문, 토큰 복호화 실패가 남는다.
- ⚠️ **남은 큰 구멍: 공유 GAS 웹앱에 인증이 없다** — 주소(공개 저장소·공개 딸깍 zip 에 있음)만 알면 누구나 읽기·쓰기·삭제가 된다.
  공유 토큰은 설치본·zip 이 공개라 소용없다. 닫으려면 「회사 구글 계정만」 접근 + 앱·딸깍이 구글 토큰을 실어 보내야 한다(팀 전원 재로그인 — 사용자 결정 대기, 2026-11-28).

## 작업 규칙
- **커밋 전:** `git config user.name "minsk999" && git config user.email "minsk999@users.noreply.github.com"`
- **파일 수정은 단계마다 즉시 저장.** 마지막에 한 번에 쓰면 중간 실패 시 앞 작업이 전부 유실됨 (실제로 겪음).
- **한글 문자열에 `unicode_escape` 변환 금지.** 한글이 mojibake로 깨짐 (실제로 겪음).
- 렌더러 수정 후 검증: `node --check renderer/app.js`(`_audit/verify.sh` 가 함께 돈다) + `npm test` · 화면 약속은 `npm run test:ui`(이 PC 의 헤드리스 크롬)
- `find -delete`로 레포 정리 금지. `grep -c`가 0이면 종료코드 1 → `set -e`에서 분리.
- 새 레포 첫 푸시: 태그+브랜치 동시 푸시는 워크플로 미발화 → 태그 별도 push.
- **작업본의 모든 파일이 CRLF다**(`core.autocrlf=true`). Python 으로 치환할 땐 반드시 **바이너리로**
  읽고 쓸 것(`open(f,'rb')` → `.decode('utf-8')` → `.encode('utf-8')` → `open(f,'wb')`).
  ⚠️ `io.open(f, encoding='utf-8')` 로 읽고 `newline=''` 로 쓰면 **CRLF 가 LF 로 통째 뒤집힌다**
  (2026-08-27 renderer/index.html 에서 실제로 밟음 — 커밋 diff 는 멀쩡해 보여서 눈치채기 어렵다).
- 정밀한 코드 수정은 Edit 툴을 쓸 것. sed/python 치환은 줄바꿈·한글에서 사고가 난다.
- ⚠️ **브라우저로 검증할 때 패널이 화면에 없으면**(`document.visibilityState === "hidden"`)
  CSS 전이·애니메이션이 **진행되지 않는다.** `getComputedStyle` 이 시작값에 멈춰 있어
  멀쩡한 코드를 회귀로 오진하게 된다(2026-08-27 두 번 밟음). 판정 전에 `visibilityState` 를 찍고,
  값이 hidden 이면 `el.style.transition="none"` 으로 즉시값을 보거나 `getAnimations()` 로 확인할 것.
- 모달을 열 땐 **`openModal(id)`** 를 쓸 것. `classList.add("show")` 를 직접 부르면
  퇴장 타이머가 안 취소돼 방금 연 모달이 160ms 뒤 사라진다.
- "열려 있는가" 판정은 **`modalShown(el)`** 로. `.show` 만 보면 퇴장 중 160ms 를 열림으로 읽어
  ESC·단축키가 삼켜진다(키 리피트에서는 손 뗄 때까지 안 풀림).

## 자동 업데이트

**Windows** = electron-updater(NSIS). **macOS** = 자체 구현(릴리스 API 직접 조회 → sha256 검증 → ditto 전개).
맥은 Squirrel.Mac 을 못 쓴다 — ad-hoc 서명은 서명 주체가 없어 designated requirement 가 `cdhash H"..."` 가
되고, 새 빌드는 정의상 다른 바이너리라 **논리적으로 항상 실패**한다. 설정 문제가 아니다.

⚠️ **`downloadUpdate()` 앞에 `checkForUpdates()` 가 반드시 있어야 한다.**
없으면 한 바이트도 안 받고 `Please check update first` 로 즉시 거부한다
(`AppUpdater.js` 의 `updateInfoAndProvider` 가드). 배너는 옛 경로(`fetchLatestRelease`)로 뜨기 때문에
이걸 빠뜨리면 **[받기] 가 항상 실패하는데 겉보기엔 멀쩡하다.** 실측으로 밟았다(2026-08-27).

⚠️ **`autoInstallOnAppQuit` 는 반드시 false.** 이 앱의 NSIS 는 `oneClick:false`(마법사형)라,
켜 두면 사용자가 트레이에서 앱을 끈 순간 설치 마법사가 예고 없이 튀어나온다. 실측으로 밟았다.

⚠️ **`quitAndInstall` 은 `(true, true)`.** 첫 인자가 false 면 마법사가 뜬 뒤 앱이 먼저 죽는다.
그리고 `isQuitting = true` 를 **미리 세우면 안 된다** — 설치가 실패하면 true 로 굳어 트레이 상주가 깨진다.

- `MAC_AUTO_APPLY = false` — 맥의 자기 교체는 **App Management TCC 실측 전까지 켜지 말 것**.
  실측 방법: 앱을 켜 둔 채 `mv /Applications/TeamTimer.app /Applications/.tt-bak.app` 를
  터미널과 앱 자신에서 각각. `Operation not permitted` 가 나오면 Developer ID($99)가 필요하다.
- 릴리스 자산의 `digest: sha256:...` 필드를 그대로 쓴다 → 해시를 따로 배포할 필요가 없다.
- 전개는 **반드시 `ditto -x -k`**. `unzip`/zip 모듈은 심볼릭 링크·실행 비트를 잃어
  ad-hoc 서명이 깨지고 arm64 에서 `killed: 9` 가 난다.
- **릴리스·승격·되돌리기 절차** (2026-11-28 정리)
  1. main 에서 `npm run bump X.Y.Z` → `git checkout -- docs/index.html` 로 docs 는 되돌리고 package.json 만 커밋(main 의 docs 는 곧바로 공개 페이지다).
  2. `docs-vX.Y.Z` 가지를 직전 docs 가지(또는 main)에서 만들고 main 을 합친 뒤, package.json 을 잠시 직전 버전으로 돌려 `node bump-version.js X.Y.Z` 로 docs 만 올리고 변경 내역을 손으로 쓴다.
  3. main 에서 `git tag vX.Y.Z` → 태그 푸시 → CI(시험 → 빌드 → **prerelease**). ★`docs-vX.Y.Z` 가지를 **태그보다 먼저 푸시**할 것 — v1.0.43 부터 CI 가 그 가지의 설명서로
     `tools/release-notes.js` 를 돌려 본문을 넣는다(가지가 없으면 「설명서 참고」 한 줄). STATUS 에 「prerelease」라고 적는 건 **릴리스가 실제로 생긴 걸 확인한 뒤**(`gh release view`).
  4. 승격(사용자 「승격해」): `gh release edit vX.Y.Z --prerelease=false --latest` → docs 가지를 main 에 합쳐 푸시 → 가지 삭제.
  5. **되돌리기**: `allowDowngrade` 가 꺼져 있어 직전 latest 를 다시 latest 로 지정해도 **이미 받은 PC 는 내려가지 않는다**. 고친(또는 되돌린) 코드로 다음 패치 버전을 내서 같은 절차로 올린다.
     1.0.39 부터 윈도 메일 토큰이 암호화돼, 그 아래 판을 손으로 다시 설치하면 메일을 다시 연결해야 한다.
- 버전 올릴 땐 **`npm run bump 1.0.28`** — package.json 과 docs/index.html 을 같이 고친다.
  CI 에 태그↔package.json 버전 일치 가드가 있어 어긋나면 빌드가 실패한다.

## UI 작업에서 실측으로 밟은 것 (2026-08-28)

⚠️ **오버레이는 전부 `z-index:100` 이라 DOM 순서로 겹침이 정해진다.**
`#modal-settings` 가 가장 뒤에 있어, 설정창 위에 열리는 모달은 통째로 가려진다.
사용자에겐 **"클릭해도 무반응"** 으로 보인다(실사용 제보 2회). 설정창 위에 떠야 하는 모달은
`#modal-keys, #modal-confirm { z-index: 120 }` 규칙에 **반드시 추가할 것**.

⚠️ **`display:none ↔ flex` 로 여닫는 요소가 flex 열의 자식이면 레이아웃이 하드컷으로 튄다.**
자리를 만드는 일(0ms)과 요소가 움직이는 일(400ms)이 분리돼 "툭툭 끊긴다"로 읽힌다.
→ 래퍼에 `grid-template-rows: 0fr↔1fr` 전이를 걸어 **자리와 움직임을 한 곡선에 태운다.**
★**그리드 아이템에 패딩을 두면 안 된다** — `0fr` 은 `minmax(auto,0fr)` 이라 트랙 최소값이
min-content 이고, 패딩은 `min-height:0` 으로도 안 줄어 그만큼 남는다(18px 실측).
패딩은 안쪽에 한 겹 더 둔 행(`.ub-row`)으로 내릴 것.

⚠️ **상태에 따라 버튼을 숨기면 높이가 전이 없이 튄다.** 테두리가 있는 버튼과 없는 버튼은
높이가 다르다(26 vs 28px). 배너에서 `[다음에]` 를 숨겼다가 46→44px 점프를 만들어 되돌렸다.
**닫을 방법을 없애는 부작용**도 같이 생긴다.

⚠️ **하드코딩 색은 다크에서 사라진다.** 배너가 `#111` 이었는데 다크 `--bg` 가 `#0a0a0a` 라
채널당 7/255 차이였다. "검은 띠가 내려온다"가 아니라 "흰 글씨가 허공에 뜬다"로 읽힌다.
면과 글자는 `var(--pill)`/`var(--pill-text)` 처럼 **쌍으로 반전되는 토큰**을 쓸 것.

⚠️ **브라우저 패널이 화면에 없으면 전이가 진행되지 않는다**(기존 규칙). 추가로 알아낸 것 —
뷰포트가 `0x0` 이면 폭이 0 이라 텍스트가 한 글자씩 줄바꿈돼 높이가 허수로 나온다.
측정 전에 `resize_window` 로 **440×720 을 명시**하고, `visibilityState` 도 함께 찍을 것.

## 쓰기 ↔ 동기화 경합 (v1.0.35 → v1.0.37, 2026-11-20)
사용자 제보 「휴지통을 눌렀는데 카드가 되살아나 한 번 더 눌러야 했다」에서 시작. 경로가 셋이었다(어느 쪽이었는지는 기록이 없어 미확정):
**A** 쓰기보다 먼저 출발한 읽기 응답이 뒤늦게 덮음 · **B** 행이 밀려 서버가 거부 · **C** 삭제는 됐는데 서버 읽기 캐시(20초)가 삭제 전 목록을 줌
(읽기는 락을 안 잡아, 쓰기와 겹친 읽기가 쓰기 뒤에 끝나며 옛 데이터를 캐시에 되넣는다 — 근본 해결은 서버 몫, `TODO.md` B-4).
**v1.0.45 가 latest 다**(2026-11-28 승격 — 1.0.38~1.0.44 포함). ◀ 그 전: **v1.0.37 이 latest 였다**(2026-11-20 승격 — 사용자 회신 「고치라고 한 건 잘 고쳐진 것 같다」. 완료·마감 쪽은 실기 확인 기록 없음). v1.0.35·v1.0.36 은 prerelease 로만 남아 있다(팀 미배포, **승격 금지**). 독립 검수를 세 번 돌렸고 —
검수 한 번마다 「앞선 수정이 새로 만든 경로」가 하나씩 나왔다(35: 묘비 오탐, 36: 뒤늦은 동기화가 낡은 캐시를 받음). 이 절을 고칠 땐 반박 검수를 꼭 한 번 돌릴 것.
- ★**시트 쓰기는 전부 `postSheetTracked()` 로.** `window.timerAPI.postSheet` 를 직접 부르면 그 쓰기는 보호에서 빠진다(직접 호출은 래퍼 안 1곳뿐이어야 한다).
- 쓰기와 겹친 동기화 응답은 **버리고 다시 받는다**(`writeGen`·`writesInFlight`). 버린 회차는 캐시 수명 뒤(25초) 조용한 동기화를 한 번 더 건다.
- ★**행을 고치는 쓰기 넷(완료·마감·수정·삭제)은 지문을 둘 다 보낸다** — `writeFp(t)` = `expectIdx`(게시글 번호) + `expectTitle`. 제목만 보내면
  「제목은 같고 게시글이 다른」 옆 카드(반복 요청)를 서버가 통과시켜, 행 번호가 한 칸 낡은 사이 **완료·마감이 옆 카드에 기록됐다**(수정 전부터 있던 구멍 —
  같은 제목 보드 무작위 800회 중 16회, v1.0.36 은 0회). 서버 v60+ 가 네 액션 모두 `expectIdx` 를 이미 검사하므로 서버 수정은 없었다. 수정(updateTask)은 **편집 전** 링크·제목.
- ★서버는 그 행이 작업 행이 아니면(빈 행 등) 지문 검사보다 **먼저** 「영상작업 행이 아님(보호)」 일반 오류를 준다. 위 줄이 빠져 당겨진 뒤 **맨 아래 카드**를 누르면
  이쪽이다(stale 은 시트 전체 끝을 넘었을 때뿐). `asStale()` 이 이 오류를 stale 로 바꿔 같은 복구 경로를 태운다. 가짜 서버(`makeServer`)도 이 계약을 따른다.
- 삭제: 끝날 때까지 `pendingDeletes` 로 가리고, stale/busy 면 재동기화 → **지문 건수를 누를 때와 견줘** 1회 자동 재시도.
  stale 이고 줄었으면 「이미 지워짐」(재시도 안 함 — 남은 줄은 누르지 않은 쌍둥이), 그대로이고 유일하면 새 행으로 재시도, 그 밖은 실패 안내 + 뒤늦은 동기화.
- 묘비(`tombstones`, 25초·최대 60초): 삭제 ok 뒤 낡은 응답 속 그 카드를 거르고 아래 행 번호를 서버처럼(이어진 구간만, 세운 순서대로) 당긴다. **내 보드 전용.**
  ★**맨 아래 카드는 「이 삭제와 겹친 내 읽기」가 있었을 때만 세운다**(`buryDeleted`). 맨 아래를 지우면 그 행이 비고 새 작업이 바로 그 행에 들어오므로,
  잘못 올려 지우고 곧바로 다시 보낸 카드가 낡은 응답으로 오인돼 최대 60초 가려졌다(v1.0.35 검수). 근거가 없으면 **지켜보는 묘비**(`watch` — 가리지도
  당기지도 않고, 그 행에 그 지문이 다시 보이면 캐시가 죽을 때까지 뒤늦은 동기화를 다시 건다)와 25초 뒤 동기화 한 번. timeout·일반 오류로 끝난 삭제도 같다.
  ★뒤늦은 동기화 **한 번만** 걸어 두면 그 한 번이 낡은 캐시를 받는 구간이 있다(삭제와 겹친 다른 PC 의 느린 읽기가 5~25초 뒤에 끝남) — 지운 카드가
  26초 뒤 말없이 나타나 다음 동기화까지 남았다(v1.0.36 검수). 쓰기와 겹쳐 읽기를 버릴 때는 살아 있는 묘비의 수명도 그 시점부터 다시 잰다(느린 내 읽기).
- 완료 비우기는 개별 삭제와 `delInFlight` 를 함께 쓴다. 묘비는 ok 가 올 때마다 세우고, 같은 묶음에 남은 같은 지문 수를 `left` 에 더한다.
- ★**팝업이 붙잡은 카드는 `findPinned()` 로 다시 찾는다.** 카드 id = 시트 행 번호라, 편집·완료·마감 창이 떠 있는 사이 목록이 당겨지면
  같은 id 가 옆 카드를 가리킨다 — 그대로 확정하면 **옆 카드가 완료·수정됐다**(수정 전 코드로 재현). pin = 카드 객체 + 제목·링크 + 「같은 것 몇 줄 중 몇 번째」.
  목록이 그대로면 같은 객체, 교체됐으면 제목·링크로 찾되 줄 수가 달라졌거나 쌍둥이들이 같은 폭으로 밀린 게 아니면 쓰지 않고 안내한다. 새 팝업을 만들 때도 같은 규칙.
- **테스트:** `npm test` = 업무시간 계산(`test/workhours.test.js`) · 쓰기↔동기화 경합 시나리오(`test/delete-race.test.js`, 가짜 시트 서버·가짜 시계) · 링크 판정(`test/weburl.test.js`) · **실제 서버 코드**를 vm 에 올린 서버 약속(`test/gas/gas.test.js`·스마트 칩 `test/gas/chips.test.js`, gas/ 의 최신 사본 자동, 다른 판은 `TT_GAS=<파일>`) · main 순수 함수(`test/main-lib.test.js`) · 관리항목 링크 변환과 서버 왕복(`test/memolink.test.js`). 정본 목록은 `package.json` 의 `scripts.test`. 건수는 출력 참조(문서에 숫자를 적지 않는다 — 늘 낡는다). 릴리스 CI 도 같은 `npm test` 를 돈다. 수정 전 코드 재현은 `TT_RENDERER=<옛 파일>`.
  실제 DOM 실행은 `test/delete-race.browser.js` 머리말(launch.json `teamtimer-root`, 8733). ⚠️ 실제 Electron·실제 GAS 로는 돌리지 않았다.
  ⚠️ 실제 Electron 시험에서 `location.reload()` 는 먹지 않는다(`will-navigate` 차단, v1.0.39~) — 이름을 넣은 뒤엔 `doSync()` 를 직접 부를 것(`_audit/realapp/quick.js`).
- 남은 한계(전부 검수에서 재현·기록). 빈도 실측(2026-11-28, `?action=read` 읽기 전용): 작업 112줄 중 **쌍둥이 0 · 게시글 번호 없는 링크 0**(빈 링크 1).
  · 같은 게시글·같은 제목 두 줄(쌍둥이)은 서버 지문이 구별 못 한다(실측 0줄).
  · **링크에 게시글 번호(idx)가 없는 카드**(앱에서 손으로 넣은 외부 링크)는 v1.0.38 까지 지문이 제목뿐이었다. v1.0.39 부터 네 액션 모두 링크 전체(`expectLink`)를
    보내고 서버 v64 가 비교한다 — 서버가 v64 미만이면 그 키를 무시하므로 여전히 열려 있다.
  · 관리항목(메모) 수정·삭제는 v1.0.39 부터 고치는 칸의 고치기 전 값(`expectB`/`expectC`)을 보낸다(서버 v64 가 비교, 이름 행·구분선은 거부). v63 까지는
    행이 밀린 채 메모를 지우면 **팀원 이름 칸이 지워졌다**(실제 서버 코드로 재현, 지금은 `test/gas/gas.test.js`).
  · ~~카드를 지운 직후 그 아래 카드의 완료·마감·수정이 한 번 거부되던 것~~ → **v1.0.43 B-5**: stale 이면 다시 받아 같은 지문(완료 여부까지)이
    누를 때도 지금도 한 줄뿐이고 행이 바뀌었을 때만 새 행으로 **한 번** 재전송(`retryRowWrite`). 쌍둥이·없어짐·같은 행(낡은 캐시)은 예전처럼 안내만. 시나리오 S1·RS3·E6·R1~R5.
  · 관리 항목 추가가 시간 초과되면 서버엔 들어갔을 수 있다 — v1.0.43 부터 10분 안에 같은 글을 다시 보내면 먼저 새로 받아 보고 이미 있으면 보내지 않는다(`timedOutMemos`, 시나리오 MD1·MD2).
    서버 addMemo 에는 중복 검사가 없다(앱 쪽 방어뿐).
  · 시트의 **스마트 칩**이 든 관리 항목을 앱에서 고치면 칩이 일반 셀 링크로 바뀐다(글자·주소는 남음 — setCellSmart 가 칩을 다시 만들지 않는다).
    칩 읽기(Sheets API)가 실패하면 글자만 넘어오고, 그때 지문이 어긋나 「다시 불러올게요」가 날 수 있다(빈도 미측정).
  · 완료/마감/수정은 「겹침 + 낡은 캐시」가 함께 오면 최대 25초쯤 되돌아가 보였다 스스로 맞춰진다. 쓰기 ok 뒤 새 목록이 반영되기 전에 팀원 보드를 다녀와도 같다.
  · 맨 아래 카드를 지울 때 다른 PC 의 읽기가 겹치면 그 카드가 25~50초쯤 다시 보였다 스스로 사라진다(다시 누르면 바로 정리된다).
  · 끝에서 둘째 → 맨 아래 순서로 지운 뒤 첫 번째 것을 곧바로 다시 보내면 새 카드가 최대 26초 가려진다(묘비 오탐의 남은 모양).
  · 삭제가 진행 중이면 다른 카드 휴지통·완료 비우기는 안내 토스트만 뜬다(대기열 없음).
  · C 칸 수식에서 `HYPERLINK("…")` 보다 앞에 다른 `idx=숫자` 가 있는 손수 만든 수식은 클라이언트·서버가 뽑는 번호가 달라 그 행의 쓰기가 전부 거부된다
    (앱·딸깍이 쓰는 수식에서는 불가능한 모양. 제보가 오면 시트에서 수식을 `=HYPERLINK("url","라벨")` 로 고친다).

## 자동 실행(시작 프로그램) 등록 (v1.0.34, 2026-11-13)
- 윈도우 Run 값 이름은 **`LOGIN_ITEM_NAME` 으로 고정**한다. Electron 은 이름을 안 주면 AppUserModelID 를 쓰는데,
  v1.0.20 까지는 `electron.app.작업 타이머`, v1.0.21 부터는 `kr.co.adef.jakeop-timer` 였다 → 옛 항목이 고아로 남아
  **부팅 때 두 번 실행 → second-instance 가 창을 띄움**(「트레이로 시작」 무시, 꺼도 계속 자동 실행). 사용자 제보로 발견.
- `second-instance` 는 argv 에 `--autostart` 가 있으면 무시한다(항목이 몇 개든 안전). 손으로 다시 실행하면 창 표시.
- 옛 이름 삭제는 **새 이름 등록을 확인한 뒤에만**. 윈도우 구현은 레지스트리 쓰기 실패를 알리지 않는다(예외 없음).
- Electron 31 사실(소스 확인): 켤 때 StartupApproved 값은 **삭제**(= 사용), 끌 때 Run·StartupApproved 둘 다 삭제,
  Run 값 경로에 따옴표 없음, `getLoginItemSettings` 는 같은 `args` 를 줘야 일치 판정, 기본 이름은 exe 의 ProductName 기반.
- 개발본(`!app.isPackaged`)은 OS 등록을 건드리지 않는다. **시험할 때도 electron.exe 로 실제 등록 호출을 돌리지 말 것.**
- ★**Claude 데스크톱 세션의 셸에서 읽는 HKCU 는 가상 뷰다**(MSIX 전용 하이브가 덧씌워짐). 이 PC 에서는 세션 셸로 보면
  Run 의 `kr.co.adef.jakeop-timer` 가 `electron.exe --autostart` 로 보이지만 그건 예전에 세션에서 띄운 개발본이 남긴 그림자 값이고,
  실제 값은 설치본 경로다. 실제 값은 `Invoke-CimMethod -Namespace root\default -ClassName StdRegProv …` 로 읽을 것.
  2026-11-13 확인(v1.0.34 적용 후 실제 Run): 이 앱 항목 **1개**, 설치본 경로 — 사용자 재부팅으로 트레이 시작 확인.

## 상태색 — 점·바·글자는 항상 같은 색 (v1.0.32, 2026-09-18)
C2 가 라이트에서 글자만 진하게 보정했던 것(`--st-*-ink` 별도값)을 사용자가 **"설정한 색과 다르다"고 반려**해 되돌렸다.
지금은 `--st-*-ink: var(--st-*)`. 글자 가독성 제보가 오면 잉크가 아니라 **기본 상태색 자체**를 바꿀 것 — 설정 화면이 "이 색으로 표시"를 약속한다.

## 업무시간만 세기 (v1.0.31, 2026-09-18)
팀원 제안으로 넣은 **개인 옵션**. 설정 「남은 시간」 그룹. 저장 `localStorage.workHours = {on,start,end,labels}`, 기본 off.
- 계산은 index.html 안의 순수 함수: hmToMin·isOffDay·bizLeft·nextBizStart·holidayLabel·pauseLabel·**urgencyAt·cdTextAt**
  (+ parseWorkHours/makeCfg). 기존 `urgency(ts)`/`cdText(ts)` 는 이 위의 얇은 래퍼 — 호출처(tick·updateStats·card) 무변경.
- **규칙 B**(사용자 확정): 마감일 이전은 업무일의 [start,end) 만, 마감 당일은 쉬는 날이어도 세고 창을 마감 시각까지.
  주황 = 다음 업무일 시작 전 마감 **AND** (오늘 마감 OR 잔여 < 하루폭) — 'Nd Nh' 와 주황이 한 카드에 안 나오게 숫자 형식과 같은 기준.
- 표식은 `.count .l` 슬롯 재사용, **카드별 판정**: 업무 전·업무 후·주말·공휴일 이름(6자 이상은 '공휴일'). 지난 카드는 옵션과 무관하게 **'초과'**.
  「설명 표시」를 끄면 초과 포함 전부 숨김(옵션 켠 사람만 가능). 완료 카드는 tick 이 건너뛰어 무관.
- ★공휴일 이름은 KASI API(외부)에서 온다 — `card()` 에서 반드시 `esc(cd.l)`. `tick()` 은 textContent 라 안전.
- **테스트: `npm test`** — `test/loader.js` 가 index.html 에서 함수 블록을 추출해 125벡터(`test/workhours.test.js`)를 돌린다.
  규칙을 바꾸면 기대값을 **손 검산**으로 갱신할 것(함수 출력으로 만들지 말 것). 설계 기록·시안은 `_audit/`(git 제외).
- 설정 UI 는 드래프트→[저장] 부류(프리셋·알람과 같음). 검증 두 가지(형식·끝>시작)는 saveSettings 의 프리셋 검증 바로 뒤에서, 실패 시 저장 중단·모달 유지.
- ⚠️ `bump-version.js` 는 설명서의 **변경 내역 절을 건드리지 않는다**(옛 항목 이름까지 갈아 버리던 사고, 09-18 수정). 새 버전 항목은 손으로 추가.

## GAS (구글 앱스스크립트)
배포본 **v70** (2026-11-28 14:48 웹앱 버전 82 — v69 + 글 머리 + - @ 도 글자로 저장(textSafe)·insert 서식 단계 실패 때 partial:true 와 읽기 캐시 비움·딸깍 1.8.11(딸깍 세션); 그 전 v69 14:26 버전 81 — v68 + 관리항목 스마트 칩 링크를 Sheets 고급 서비스(chipRuns)로 읽어 「[칩 글자](주소)」로 넘김, 메모 지문도 같은 변환(타이머 세션, 고급 서비스 Sheets 를 프로젝트에 추가함); 그 전 v68 버전 80 — v67 + 체크박스 행 구분어 건너뜀·삭제 당김 textSafe·딸깍 1.8.10 등(딸깍 세션); 그 전 v67 13:36 버전 79 — v64 + 딸깍 최신 버전 상수(v65·v66) + 구역 경계어 검사가 작업·📌 행은 건너뜀(v67, 제목에 「공지사항」이 든 작업 아래가 잘리던 것); v64 는, 웹앱 버전 76; v63 은 같은 날 75, v62 는 11-27). v64 = v63(딸깍 세션: 락 직후 그리드 다시 읽기·insert 한 번에 쓰기·수식 주입 차단·딸깍 버전 기록) + 타이머 세션: 읽기 캐시 세대 번호(쓰기와 겹친 읽기는 캐시에 안 넣음) · 메모 지문 expectB/expectC + 이름 행·구분선 거부 · expectLink. 새 키는 전부 선택(안 보내면 v63 과 같다). v61 = members 응답에 `latestVer`·`updateMsg` 상시(타이머는 ok·members 만 읽어 무관). v55~v60 에 들어간 것: READ_ROWS 클램프 · 쓰기 경로도 `readGrid` · action 화이트리스트 ·
**쓰기 락**(LockService 8초, 못 잡으면 `{ok:false, busy:true}` — 핸들러 진입 전 반환이라 쓰기가 확실히 안 일어난 것) ·
**행 지문 검사**(`expectTitle`/`expectIdx`, 불일치면 `{ok:false, stale:true, found}`). 참조 사본 `gas/AppsScript-v70.gs`.
서버 버전 측정: **v61 부터 `?action=members` 응답에 `latestVer` 키가 있으면 v61 이상**(읽기 전용, 시트 변화 0). 값이 `1.8.6` 이면 v62, `1.8.7` 이면 v63 또는 v64, `1.8.8` 이면 v65, `1.8.9` 이면 v66 또는 v67, `1.8.10` 이면 v68 또는 v69(구별하려면 편집기에서 머리말 확인), `1.8.11` 이면 v70. 배포 기록·해시는 딸깍 저장소 STATUS. 그 이하는 못 잰다 — 사용자에게 묻는다.
시트: `영상팀 업무현황` (탭: `🎬업무현황`, `🤖자동화` 등)

⚠️ **이 웹앱은 인트라넷 딸깍과 공유한다. 배포본이 하나뿐이다.**
**정본 = `intranet-ttalkak/server/`**, 이 저장소의 `gas/` 는 **참조 사본**이다.
합의된 규칙(2026-08-27): ①서버 수정 시 버전을 올리고 헤더에 이유를 남긴다 ②배포 후 양쪽 사본을
같은 버전으로 맞추고 고친 쪽이 통보한다 ③**서버 수정은 상대 세션에 먼저 알리고 합의한 뒤** 사용자에게 올린다.
배경·행 키 위험은 `gas/README.md` 와 `gas/v56-expectTitle-초안.md`.
- **진실원천은 Apps Script 편집기의 코드.** 저장된 옛 파일 기준으로 작업 금지
  (과거 v47/v48 제작 시 베이스 누락으로 기능 유실 사고 있었음).
  수정 전 반드시 사용자에게 현재 편집기 코드를 받을 것.
- 시트 ID 정본: `18K3NKAkZwGvxS_QMV5boGNJtmay1ZJ_4xBs26SZZ_Bc` (`_4xBs`. `.gs` 의 `_8xBs` 는 틀림)
- 팀원 명단은 **`🤖자동화` 시트 A열**(세로)에서 자동 인식 → 앱·확장이 API로 수신
- 좌/우 배치(1=A~G, 9=I~O)는 업무현황 시트에서 이름 검색으로 자동 판별
- 이름 주변 이모지는 **한글만 남기는 화이트리스트**로 제거 (블랙리스트 방식은 실패한 전례 있음)
- 캐시 60초. 즉시 반영은 편집기에서 `clearMemberCache()` 실행
- 편집기 확인 함수: `testMemberList`, `testRead`
- 주요 액션: `read`(전체 데이터+memberNames), `members`(이름만, 가벼움),
  `insert`/`toggleDone`/`updateTask`/`updateDue`/`deleteTask`/`addMemo`/`updateMemo`
- `?action=members` 는 앱(`fetch-members` IPC)과 딸깍(`refreshMembers`)이 **둘 다** 쓴다.
  응답 예: `{"ok":true,"members":[...],"source":"config"}` — `source:"config"` = 자동화 시트에서 읽음

## 연계 제품
- **인트라넷 딸깍** (크롬 확장, 현재 **v1.8.11** — 11-28 게시, 팀원은 각자 받아야 한다. 버전 정본은 딸깍 저장소 STATUS) — 인트라넷 게시글 → 시트 전송.
  소스는 `docs/intranet-ddalkkak-extension.zip` 안에만 있음. 수정 시 압축 풀고 → 수정 → 재압축 → manifest version 올림.
- **BatchRenameComps** (AE CEP 확장) — 별도 레포 `minsk999/batchrenamecomps-releases`
- **Slate** — 영상팀 work hub, 단일 HTML 프로토타입 (별도 진행)

## 인증
GitHub PAT 필요 (`repo` + `workflow` 스코프). 사용자에게 직접 받거나 `gh auth login`.
**토큰을 문서·코드에 하드코딩하지 말 것.** 작업 종료 시 폐기 안내.
