# 크롬 탭 휠 (ChromeTabWheel)

크롬 창의 **탭 줄 위에서** 마우스 휠을 굴리면 이전/다음 탭으로 넘어갑니다.
옛 `MouseWheelTabScroll4Chrome`(2014년, AutoHotkey 1.1 컴파일본)을 대체하려고 만들었습니다.

- 실행 파일: `bin\ChromeTabWheel.exe` (단일 파일, 설치 없음 — 윈도우 기본 포함 .NET Framework 4.8 사용)
- 트레이 아이콘(파란 바탕에 ▲▼) 우클릭 메뉴: 사용/일시 중지 · 윈도우 시작 시 자동 실행 · 종료
- 휠 위 = 이전 탭, 휠 아래 = 다음 탭 (끝에서 반대쪽으로 순환 — 크롬의 Ctrl+PgUp/PgDn 과 같음)
- 비활성 크롬 창도 **포커스를 뺏지 않고** 그 창의 탭만 넘어갑니다.

## 어떻게 판정하나

1. 마우스 아래의 최상위 창이 `chrome.exe` 의 `Chrome_WidgetWin_1` 창인지 확인합니다.
   (Claude·ChatGPT·Eagle·디스코드 같은 일렉트론 앱은 창 클래스가 같아도 프로세스가 달라 제외)
2. 마우스 아래가 페이지 본문(별도 자식 창 `Chrome_RenderWidgetHostHWND`)이면 거기서 끝 — 크롬에 아무것도 묻지 않습니다.
3. 크롬에 UI Automation 으로 **탭 줄 영역의 실제 사각형**(`…TabStripRegionView`)을 물어, 커서가 그 안일 때만 전환합니다.
   - 배율(100%/150%), 최대화/창 모드, 모니터 위치에 따라 달라지는 값을 추정하지 않고 크롬이 준 값을 씁니다.
   - 탭 줄이 없는 창(PWA 앱 창, 팝업, 전체 화면)은 영역이 없으므로 동작하지 않습니다.
   - 창 위치·크기가 그대로면 5초 동안 값을 재사용합니다(휠 한 칸마다 묻지 않음).
4. 전환은 키 입력을 흉내 내지 않고 크롬 창에 명령 메시지(`WM_COMMAND` 34016 다음 탭 / 34017 이전 탭)를 보냅니다.

입력은 훅이 아니라 Raw Input 으로 "듣기만" 하므로 휠 입력을 지연시키거나 삼키지 않습니다.
탭 줄 밖의 휠은 이 프로그램과 무관하게 원래대로 전달됩니다.

## 옛 프로그램이 엉뚱한 곳에서 탭을 넘기던 이유

옛 스크립트 원문(실행 파일에서 추출):

```ahk
~WheelUp::
~WheelDown::
MouseGetPos,, ypos, id
WinGetClass, class, ahk_id %id%
If (ypos < 45 and InStr(class,"Chrome_WidgetWin"))
{ ... WinActivate / Send ^{PgUp} 또는 ^{PgDn} }
```

- `ypos` 는 **활성 창 기준** 좌표인데, 검사하는 창(`id`)은 **마우스 아래 창**입니다. 둘이 다르면
  "활성 창의 위쪽 45px 보다 위(음수 포함)"에 있는 모든 크롬 계열 창에서 본문이든 어디든 탭이 넘어갑니다.
- 클래스 이름에 `Chrome_WidgetWin` 만 들어 있으면 통과 → 일렉트론 앱·PWA·크롬 팝업에도 Ctrl+PgUp/PgDn 을 보냅니다.
- 45px 고정 → 150% 배율에서는 탭 줄이 62px 라 아래쪽 17px 는 반응하지 않고, 전체 화면 영상의 위쪽 45px 는 반응합니다.

## 윈도우 종료 시

종료/로그오프 신호(`WM_QUERYENDSESSION`)에 즉시 "예"로 답하고, `WM_ENDSESSION` 을 받는 순간 정리 절차 없이 끝납니다.
모의 시험 결과: 응답 0~1ms, 종료까지 5~9ms, 종료 코드 0, 오류 이벤트 0건.

확인 방법: 재부팅 뒤 이벤트 뷰어 System 로그에서 `winsrvext` 100, `Application Popup` 26 에 `ChromeTabWheel` 이 없으면 정상입니다.

## 되돌리기

1. 트레이 메뉴에서 「윈도우 시작 시 자동 실행」 체크 해제 → 「종료」.
   (등록 위치: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 의 `ChromeTabWheel` 값)
2. 작업 관리자 → 시작 앱 → `MouseWheelTabScroll4Chrome` → 「사용」.
   옛 파일은 `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup\` 에 그대로 있습니다.

## 빌드

`build.cmd` 더블클릭. 실행 중이면 파일이 잠겨 실패하므로 먼저 트레이에서 종료합니다.
아이콘을 바꾸려면 `tools\make-icon.ps1` 을 고쳐 다시 실행합니다.

## 진단

- `ChromeTabWheel.exe --debug` : 휠 판정을 `bin\ChromeTabWheel.log` 에 한 줄씩 남깁니다("전환/통과 + 이유").
- `--dry-run` : 판정만 하고 탭 전환 명령은 보내지 않습니다. `--no-input` : 실제 마우스 입력을 듣지 않습니다.
- `ChromeTabWheel.exe --quit` : 실행 중인 인스턴스를 정상 종료시킵니다.
- `tools\probe.cs` : 크롬 창의 UI 트리·좌표별 판정을 보는 탐침 도구(`wins`, `tree`, `point`, `sim` 등).

## 알려 둘 점

- 탭 전환 명령 번호(34016/34017)는 크롬 내부 값입니다. 2009년 이래 그대로지만 공식 API 는 아닙니다.
  크롬 업데이트 뒤 전환이 안 되면 여기부터 의심합니다.
- 탭 줄 영역 이름이 크롬 157 에서 `HorizontalTabStripRegionViewOld` 입니다. 이름에 `TabStripRegionView` 가 들어 있고
  `Vertical` 이 없는 요소를 찾으므로 이름이 조금 바뀌어도 따라갑니다. 세로 탭 모드에서는 동작하지 않습니다(목록 스크롤과 충돌).
- 크롬 외 브라우저(엣지 등)는 대상이 아닙니다.
