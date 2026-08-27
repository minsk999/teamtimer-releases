# 작업타이머 (TeamTimer) — Claude Code 작업 컨텍스트

> 상시 컨텍스트. **현재 상황은 `STATUS.md`, 다음 할 일은 `TODO.md`** 참조.

## 프로젝트
ADEF 영상팀 업무 타이머. Electron 데스크탑 앱 + 구글시트 동기화 + Gmail 메일탭.
BrowserWindow 440×720. **런타임 npm 의존성 0개** (순수 JS + Electron).
Windows·macOS 모두 정상 작동 중 (2026-08 기준, 맥 3대 검증 완료).

사용자: 구민석(영상팀 팀장). 한국어, 두괄식·간결 선호. 픽셀 디테일에 민감.
팀원 7명: 구민석·한영채·주지현·박나진·김본희·구정현·박지수.

## 레포
**`minsk999/teamtimer-releases`** (public)
```
main.js                 메인 프로세스 (창/트레이/Gmail/공휴일/업데이트확인)
preload.js              contextBridge (window.timerAPI)
renderer/index.html     UI 전체 (단일 파일, ~200KB, CSS+JS 인라인)
patch-mac-name.js       CI mac job 전용 — productName을 ASCII로
sign-mac.js             CI mac job 전용 — ad-hoc 서명 (필수, 아래 참조)
build/                  아이콘 (icon.icns/ico/png, tray*, trayTemplate*)
build-secrets.example.js  비밀값 템플릿
docs/index.html         GitHub Pages 설명서 = 다운로드 페이지
docs/intranet-ddalkkak-extension.zip   딸깍 크롬 확장 배포본
AppsScript_읽기API.gs   ⚠️ **폐기된 1단계 사본** — 현행 v53 과 계약이 다르다. 붙여넣지 말 것(파일 상단 경고 참조)
_mintest/ _apptest/     과거 진단용. ⚠️ **무해하지 않다** — 아래 참조
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
빌드 후 릴리스 제목을 `작업 타이머 vX.Y.Z`로 PATCH (API). 검증 전이면 `prerelease:true`로 두면
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

## ⚠️ `_apptest/` · `_mintest/` — 진단용이지만 무해하지 않다

`_apptest/` 는 **앱 전체의 낡은 포크**다(렌더러가 본체와 169줄 다름).
`build-secrets.js` 가 없어도 시트 읽기·**쓰기**가 전부 돌고, `post-sheet` 핸들러도 살아 있다.
`apptest-*` 태그를 밀면 CI 가 이 포크를 맥에서 빌드해 릴리스에 DMG 로 붙인다.
→ 그 DMG 로 완료 체크·삭제를 눌러 보면 **팀의 실제 업무 시트가 바뀐다**(userData 만 분리돼 있고 시트는 아니다).

조치 완료: `_apptest/main.js` 의 `WEBAPP_URL` 을 **빈 문자열로 비웠다.** 다시 넣지 말 것.
두 워크플로에 `prerelease: true` 를 넣었다 — 없으면 `apptest-3` 같은 태그가 `releases/latest` 가 되고,
`cmpVer` 가 그걸 파싱 못 해 **팀 전원의 업데이트 배너가 오류 표시도 없이 영구히 죽는다.**

## 작업 규칙
- **커밋 전:** `git config user.name "minsk999" && git config user.email "minsk999@users.noreply.github.com"`
- **파일 수정은 단계마다 즉시 저장.** 마지막에 한 번에 쓰면 중간 실패 시 앞 작업이 전부 유실됨 (실제로 겪음).
- **한글 문자열에 `unicode_escape` 변환 금지.** 한글이 mojibake로 깨짐 (실제로 겪음).
- renderer/index.html 수정 후 검증: `<script>` 블록 추출 → `node --check`
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

## GAS (구글 앱스스크립트)
현재 **v53**. 시트: `영상팀 업무현황` (탭: `🎬업무현황`, `🤖자동화` 등)
- **진실원천은 Apps Script 편집기의 코드.** 저장된 옛 파일 기준으로 작업 금지
  (과거 v47/v48 제작 시 베이스 누락으로 기능 유실 사고 있었음).
  수정 전 반드시 사용자에게 현재 편집기 코드를 받을 것.
- ⚠️ 레포의 `AppsScript_읽기API.gs` 는 **1단계 사본이라 현행과 계약이 완전히 다르다**
  (`user` 파라미터 요구 · `doPost` 0건 · 이름 하드코딩 · 시트 ID 오기). 참고조차 하지 말 것.
  쓰기 API 6종은 **어디에도 백업이 없다** — 편집기가 유일본이다.
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
- **인트라넷 딸깍** (크롬 확장, 현재 v1.5) — 인트라넷 게시글 → 시트 전송.
  소스는 `docs/intranet-ddalkkak-extension.zip` 안에만 있음. 수정 시 압축 풀고 → 수정 → 재압축 → manifest version 올림.
- **BatchRenameComps** (AE CEP 확장) — 별도 레포 `minsk999/batchrenamecomps-releases`
- **Slate** — 영상팀 work hub, 단일 HTML 프로토타입 (별도 진행)

## 인증
GitHub PAT 필요 (`repo` + `workflow` 스코프). 사용자에게 직접 받거나 `gh auth login`.
**토큰을 문서·코드에 하드코딩하지 말 것.** 작업 종료 시 폐기 안내.
