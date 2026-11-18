# 크롬 탭 휠 (ChromeTabWheel)

크롬 탭 줄 위에서 마우스 휠을 굴리면 탭이 넘어간다. 휠 위 = 이전 탭, 휠 아래 = 다음 탭.
작업 타이머와는 별개의 작은 도구이고, 같은 설명서 페이지(`docs/index.html` 「01 시작하기」 → 인트라넷 딸깍 아래)에서 배포한다.

## 배포본 위치 — Releases 를 쓰지 않는다
배포 파일은 `docs/` 에 직접 커밋한다(인트라넷 딸깍 zip 과 같은 방식).
- 이 저장소에 정식 릴리스를 만들면 `releases/latest` 가 바뀌어 **작업 타이머의 업데이트 배너가 고장 난다**(`CLAUDE.md` 참조).
- 릴리스를 publish 만 해도 `release.yml` 의 `release: published` 가 발화해 타이머 빌드가 돈다.

| 파일 | 내용 |
|---|---|
| `docs/ChromeTabWheel-1.0.0-win.zip` | 윈도우판 1.0.0. SHA256 `F24B0E561BB614588DF6E41AA8DC4D42CD57FA110307068C091D03303059EE86` — 원본 zip(`BA6D6741…`)과 exe 는 같고, `설치 방법.txt` 에서 MouseWheelTabScroll4Chrome 단계만 뺐다(11-18) |
| `docs/ChromeTabWheel-1.0.0-mac.zip` | 맥판 1.0.0 (CI 아티팩트를 받아 커밋). SHA256 `7d7a5c1f5f214872822f7a7e3bcf7f55e51ecf80f43f938ebf924164166f8963` |

## 윈도우판
- 단일 실행 파일(.NET Framework 4.8), 서명 없음. **소스는 이 저장소에 없다**(사용자 집 PC).
- 동작: Raw Input(RIDEV_INPUTSINK)으로 휠을 지켜보기만 하고, 커서가 크롬(`Chrome_WidgetWin_1`, chrome.exe)의
  탭 줄(UI Automation `TabStripRegionView`, 세로 탭 제외) 위면 `WM_COMMAND IDC_SELECT_NEXT/PREVIOUS_TAB` 을 보낸다. 포커스를 바꾸지 않는다.
- 옵션: `--autostart=on|off`(HKCU Run 의 `ChromeTabWheel`, 성공 시 종료 코드 0), `--quit`, `--debug`, `--dry-run`, `--no-input`.
- 예전 프로그램 MouseWheelTabScroll4Chrome 과 같이 돌면 탭이 두 칸씩 넘어간다. 그 프로그램은 사용자 본인만 써서 설명서에는 안내하지 않는다(2026-11-18 사용자 지시).

## 맥판 (`mac/`)
- `main.swift` 하나. 메뉴 막대 앱(LSUIElement), macOS 11 이상, 유니버설(arm64 + x86_64).
- 동작: `NSEvent` 전역 모니터로 휠을 지켜보기만 한다(권한 불필요). 커서 아래 창이 크롬이고 창 위에서
  `tabStripHeight`(기본 40pt) 안이면, 크롬 AppleScript 로 **그 창**(bounds 로 맞춤)의 `active tab index` 를 바꾼다.
  포커스를 바꾸지 않는다. 필요한 권한은 「자동화 → Google Chrome」 하나(처음 쓸 때 macOS 가 묻는다).
- 옵션은 윈도우판과 맞춘다: `--autostart=on|off`(`~/Library/LaunchAgents/kr.co.adef.chrometabwheel.plist`), `--quit`, `--debug`, `--dry-run`, `--version`.
- 로그: `~/Library/Logs/ChromeTabWheel.log` (오류는 항상, 판정 과정은 `--debug` 때만).
- 탭 줄 높이 조정: `defaults write kr.co.adef.chrometabwheel tabStripHeight -int 44`
- ad-hoc 서명이라 **새 버전을 설치하면 자동화 권한을 다시 묻는다**(TCC 가 cdhash 로 기억).

### 빌드
맥에서 `bash chrometabwheel/mac/build.sh` → `chrometabwheel/mac/build/ChromeTabWheel-<버전>-mac.zip`.
CI(`.github/workflows/chrometabwheel-mac.yml`)가 이 폴더가 바뀌어 push 될 때마다 같은 스크립트를 돌려 아티팩트로 올린다.
버전은 `Info.plist` 와 `main.swift` 의 `appVersion` 을 같이 올린다(빌드 스크립트가 불일치를 막는다).
