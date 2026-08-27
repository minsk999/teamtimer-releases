# 다음 작업 (Claude Code)

> 배경은 `STATUS.md`, 프로젝트 규칙은 `CLAUDE.md`.

## 현재 (2026-08-27 갱신)
- ① 메일 종류별 알림 필터 — **✅ 완료, v1.0.27 로 배포됨**
- ② 자동 업데이트 — **미착수. 이게 다음 작업이다.**
  ★첫 걸음은 코드가 아니라 **맥 실측**이다: 앱이 실행 중인 상태에서
  `/Applications/TeamTimer.app` 을 `mv` 해 보고 `Operation not permitted` 가 나는지.
  나오면 그때 $99 를 사는 게 정답이고, 안 나오면 자체 업데이터로 간다.
  상세 설계 = `_audit/macplan.md`(gitignore, 로컬에만 있음) · 요약 = 아래 ② 절
- ③ 시트 로딩 속도 — **✅ 해결됨**(GAS v54). 연속 호출 27초 → 1~2초. `STATUS.md` 실측표 참조
> 진행 순서: **① 메일 필터 → ② 자동 업데이트**

---

## ① 메일 종류별 알림 필터 — ✅ 2026-08-27 구현 완료 (미배포)

> 구현 상세·주의점은 `STATUS.md` 맨 위 참조. 아래는 원래 요구사항 기록.

### 배경
인트라넷 메일은 제목 말머리로 3종류다.

| 제목 말머리 | 앱 표기 |
|---|---|
| `업무 요청` | 업무 요청 |
| `업무 전달` | **담당자 배정** (표기만 변경) |
| `코멘트 알림` | 코멘트 알림 |

실제 제목 형식:
`[Intranet-영상] 업무 요청>ASAP [구달] 기소재 영상 결합 요청의 건_8월_TXA`
(`[Intranet-영상]` 접두어는 GAS가 아니라 main.js가 제거 → `subject`, 원본은 `fullSubject`)

팀장은 "담당자 배정"을 받고 싶지 않지만 다른 팀원은 받고 싶을 수 있어,
**각자 앱에서 선택**할 수 있어야 한다.

### 요구사항 (사용자와 합의됨)
설정 → 알람 영역에 추가:
```
받을 메일 종류
  ☑ 업무 요청    ☑ 코멘트 알림    ☐ 담당자 배정

  적용 범위:  [ 알림만 끄기 | 목록에서도 숨기기 ]   ← 토글
```
- 체크박스 3개 + **적용 범위 토글**
- 기본값: **셋 다 켜짐 + "알림만 끄기"** (기존 동작 유지)
- "목록에서도 숨기기" 선택 시 메일 탭 목록에서 제외 + **안 읽음 배지 숫자에서도 제외**
- 설정은 localStorage 저장 (팀원마다 다름)
- **어느 분류에도 안 걸리는 메일은 통과시킬 것** (안 오는 것보다 오는 게 낫다).
  인트라넷이 제목 형식을 바꿔도 메일을 놓치지 않게 하는 안전장치.

### 구현 지점 (renderer/index.html)
> ⚠️ 아래 두 줄은 2026-08-27 감사에서 **정정됐다.** 옛 지목대로 구현하면 세 가지가 깨진다.
> 줄번호는 그 감사 이후 수정으로 밀렸으니 함수명으로 찾을 것.

- `MAIL_KINDS` — 이미 3종 정의됨. `mailKind(text)`로 분류 가능
- `mailBodyText(m)` — 말머리 제거 후 실제 제목 추출
- `displaySubject(s)` — 메일 탭 표시용, `업무 전달`→`담당자 배정` 치환
- ~~`notifyNewMailFor` 가 알림 필터 지점~~ → **틀렸다. 진짜 게이트는 `maybeNotifyNewMail`** 이다.
  - `playAlarmSound()` 가 `notifyNewMailFor` **밖**에 있어, 거기서 걸러도 **소리는 그대로 난다**
  - `notifiedIds = new Set(unreadIds)` 가 분류와 무관하게 전부 삼키고 localStorage 에 박제한다
    → 나중에 필터를 다시 꺼도 그 사이 쌓인 메일은 **다시는 알림이 오지 않는다**
    (TODO 의 "안 오는 것보다 오는 게 낫다" 원칙과 정반대)
  - `notifyNewMailFor` 는 `fresh[0]` 하나만 알리므로, 최신이 걸리면 같은 폴링의 나머지도 조용해진다
  - **올바른 지점 = `maybeNotifyNewMail` 의 `fresh` 계산 직후.
    `notifiedIds` 에 넣는 집합과 알림 대상 집합을 반드시 분리할 것.**
- ~~`setMailBadge()` 2198행~~ → **실제 정의는 다른 곳이고 호출이 6곳**이다.
  `setMailBadge` 는 main 프로세스까지 밀어내(트레이 아이콘·작업표시줄 오버레이·Dock 배지)
  한 곳만 고치면 트레이 점과 화면 배지가 어긋난다. → **`setMailBadge` 안에서 한 번 거를 것.**
  (`unreadCount` 는 서버 값이 아니라 main 이 같은 목록으로 센 값이라 필터링해도 된다)
- **선행 수정 1건:** `main.js` 의 안읽음 조회가 실패하면 `|| []` 가 빈 Set 으로 흡수돼
  전 메일이 `unread:false` 가 되고 배지가 0, `notifiedIds` 가 통째로 비워져 다음 폴링에 헛울린다.
  **필터 로직을 이 오염된 판정 위에 세우면 안 된다** — `if (!unreadData) throw` 를 먼저 넣을 것.
- `alarmSettings` (2606행) — 설정 객체. 여기에 필드 추가하고 `draftAlarm`도 동일하게
- 설정 UI는 1367행 부근 알람 섹션. 기존 `seg-btn` 스타일 재사용 권장

### 주의
- **디자인·레이아웃·모션은 기존 컴포넌트 스타일을 그대로 재사용**할 것. 새 스타일 만들지 말 것
- `alarmSettings` 저장/복원, `draftAlarm` 초기화(3207행 부근), 설정 리셋 경로 모두 반영
- 필터가 켜져 있어도 **동기화 자체는 그대로** 돌아야 함 (필터는 표시/알림 단계에서만)

---

## ② 자동 업데이트 도입

### 먼저 결정할 것
> ⚠️ **2026-08-27 정정.** 아래 옛 문장은 범위가 잘못 넓혀진 것이었다.
> ~~macOS는 Apple Developer($99/년) 없이는 불가능하다~~

**정확히는 — `electron-updater`/Squirrel.Mac 경로만 불가능하다.**
ad-hoc 서명(`--sign -`)은 서명 주체가 없어 DR 이 `cdhash H"<그 바이너리 해시>"` 가 된다.
새 버전은 정의상 다른 바이너리라 **논리적으로 100% 실패**한다(설정 문제가 아니라 우회 불가).

**자체 업데이터를 쓰면 서명 요구 자체가 없다.** 근거는 BannerNode(PyInstaller, Squirrel 미사용)에
실측으로 남아 있다: ① 앱이 직접 받으면 `com.apple.quarantine` 이 안 붙어 Gatekeeper 가 발동하지 않고
② `ditto -x -k` 로 풀면 심볼릭링크·실행비트가 보존돼 **ad-hoc 서명이 살아남으며**(재서명 불필요,
일반 unzip 은 서명이 깨져 arm64 에서 `killed: 9`) ③ 무결성은 릴리즈 API 의 `digest` 로 대체되고
④ macOS 는 실행 중인 `.app` 을 move 해도 죽지 않는다(Windows 의 `WinError 5` 문제가 없다).

**남은 관문은 App Management TCC 하나뿐이다. 코드 쓰기 전에 반나절짜리 실측부터 할 것:**
앱이 실행 중인 상태에서 `/Applications/TeamTimer.app` 을 `mv` 해 본다(터미널 + 앱 자신 양쪽).
`Operation not permitted` 가 나오면 **그때 $99 를 사는 게 정답**이고, 아니면 안 사도 된다.

→ **권장 구조: 하이브리드.** Windows 는 `electron-updater`, macOS 만 자체 업데이터.
양쪽 자체 통일은 금물 — Windows 엔 디렉터리 원자 교체 연산이 없어(TxF 폐기) BannerNode 가
설계 3안을 폐기하고 8단계를 만들어야 했다. Electron 은 `app.asar`+수백 파일이라 그 트릭도 못 쓴다.
상세 설계·단계별 계획 = `_audit/macplan.md`.

### Windows 구현 개요
1. `electron-updater` 추가 (현재 런타임 의존성 0개 → **첫 의존성이 된다**. package.json `dependencies`)
2. electron-builder `publish` 설정 (GitHub provider) → 빌드 시 `latest.yml` 생성
3. CI에서 `latest.yml`을 릴리스 에셋으로 함께 업로드.
   ⚠️ **`dist/*.zip` 패턴은 팬텀이다** — mac 은 dmg 단독, win 은 nsis 단독이라 zip 이 생성된 적이 없다.
   "패턴이 이미 들어있으니 준비됐다"고 읽지 말 것. `if-no-files-found: ignore` 가 조용히 넘긴다.
   ⚠️ `release.yml` 에 **`prerelease` 키가 없다** — 문서는 있는 양 전제하지만 실제로는 없어서,
   태그를 미는 순간 검증 안 된 빌드가 `releases/latest` 가 되고 배너가 7명에게 뜬다.
4. main.js에서 `autoUpdater` 연결. 기존 `fetchLatestRelease()` 배너와 **중복되지 않게** 정리
5. 다운로드 진행률·재시작 안내 UI (기존 업데이트 배너 재사용 권장)

### 검증 방법 (중요 — 이래서 Claude Code로 옮김)
로컬에서 반복 검증이 가능해야 한다.
1. 구버전 설치 → 2. 새 버전 릴리스 → 3. 앱에서 업데이트 감지되는지
→ 4. 다운로드/재시작 → 5. 실제로 갱신됐는지
`prerelease:true`로 올리면 `releases/latest`에서 제외되므로 테스트 시 주의.

### 주의
- **맥 빌드 파이프라인을 건드리지 말 것.** `patch-mac-name.js` / `sign-mac.js` /
  `build:mac` 스크립트는 두 번의 장기 장애를 해결한 결과물이다 (`CLAUDE.md` ⚠️ 참조)
- Windows 자동 업데이트가 붙어도 **맥은 기존 수동 안내를 유지**해야 한다.
  플랫폼 분기를 명확히 할 것

---

## ③ 이후 (측정/결정 대기)

- **시트 로딩 속도 측정** — 맥에서 실제 몇 초인지. 5초대면 종결.
  느리면 `ensureMembers`/`doRead` 중복 읽기 제거 → GAS 캐시(쓰기 시 무효화 필수)
- **Apple Developer 가입 여부 결정** — 맥 자동 업데이트 + 설치 시 보안 경고 제거
- **진단 잔재 정리** — `_mintest/`, `_apptest/`, `mintest.yml`, `apptest.yml`

## 완료 시 체크리스트
- [ ] package.json version 올림 → 태그 push → CI 빌드 성공 확인
- [ ] 릴리스 제목 `작업 타이머 vX.Y.Z`로 설정, 검증 전이면 `prerelease:true`
- [ ] `docs/index.html`: 다운로드 링크 3개 + 버전 배지 3곳 + 푸터 + 체인지로그
- [ ] Windows·macOS 양쪽 확인 후 `prerelease:false`로 승격
- [ ] 사용자에게 GitHub 토큰 폐기 안내
