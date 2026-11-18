# 광고창 차단 (AdPopupBlock)

윈도우를 켤 때 광고 팝업을 띄우는 프로그램 셋의 광고창을 막는 작은 도구. 작업 타이머와는 별개이고,
같은 설명서 페이지(`docs/index.html` 「01 시작하기」 → 크롬 탭 휠 아래)에서 배포한다. **현재 윈도우판만** 있다.

## 배포본 위치 — Releases 를 쓰지 않는다
배포 파일은 `docs/` 에 직접 커밋한다(크롬 탭 휠·인트라넷 딸깍과 같은 방식). 정식 릴리스를 만들면
`releases/latest` 가 바뀌어 **작업 타이머의 업데이트 배너가 고장 나고**, publish 만 해도 `release.yml` 이 타이머 빌드를 돌린다.

| 파일 | 내용 |
|---|---|
| `docs/AdPopupBlock-1.0.0-win.zip` | 윈도우판 1.0.0. SHA256 `4A567B2B7015213EFACFF08D0AC0D9360ADF96E8FBE9B932BA71F1AD86DD6FA6` |

## 윈도우판 (`win/`)
- `AdPopupBlock.cs` 하나. .NET Framework 4.x **기본 컴파일러(csc.exe, C# 5)** 로 빌드 → SDK 불필요.
  빌드: `powershell -NoProfile -ExecutionPolicy Bypass -File adpopupblock\win\build.ps1` → `win/build/AdPopupBlock-<버전>-win.zip`.
  버전은 `AppVersion` 과 `AssemblyVersion`/`AssemblyFileVersion` 을 같이 올린다(빌드 스크립트가 불일치를 막는다).
- **관리자 권한(requireAdministrator)** 으로 돈다 — 디자인210 FontManager 가 `requireAdministrator` 라 그 설정 파일이 Program Files 안에 있고,
  관리자 창은 일반 권한 프로그램이 닫을 수도 없다(UIPI).
- 자동 실행은 HKCU Run 이 아니라 **작업 스케줄러 로그온 작업**(`AdPopupBlock`, 가장 높은 권한, `--autostart`). Run 으로는 관리자 앱이 부팅 때 뜨지 않는다.
- 트레이 메뉴: 대상별 켜고 끄기 · 윈도우 시작 시 자동 실행 · 기록 보기 · 종료. 설정 `HKCU\Software\AdPopupBlock`(값 없으면 켬).
- 기록: `%LOCALAPPDATA%\AdPopupBlock\AdPopupBlock.log` (512KB 넘으면 `.1` 로 돌림).
- 옵션: `--autostart=on|off`(종료 코드 0 = 성공), `--quit`, `--dry-run`(닫거나 쓰지 않고 기록만), `--version`.

### 대상별 원리 (2026-11-18 실측)
| 대상 | 광고가 뜨는 방식 | 막는 방법 |
|---|---|---|
| 디자인210 FontManager | `System\Conf.ini` `[POPUP] DATE` 가 오늘(`yyyyMMdd`)과 **같지 않으면** 팝업(`CommUI.FormMain.ShowMain` 이 `String.op_Inequality` 로 비교 — ConfuserEx 난독화 IL 에서 확인). 「하루 동안 보지 않기」가 오늘 날짜를 쓴다. **미래 날짜는 안 통한다.** | 2초마다 DATE 를 오늘로 맞춘다(같으면 안 씀). 어제 날짜 → 팝업, 오늘 날짜 → 팝업 없음을 대조 시험으로 확인. |
| 산돌구름 | Flutter 앱. 광고·공지는 내장 WebView2 로 `https://www.sandollcloud.com/sandollcloudagent/pop?msg_id=…` 를 연다. WebView2 는 **이 팝업에만** 쓰인다(앱 코드·방문 기록 확인). | 0.4초마다 `SandollCloud.exe` 의 보이는 최상위 창 중 Flutter 본창(`FLUTTER_RUNNER*`)이 아니고 WebView2 자식(`Chrome_WidgetWin*`/`Chrome_RenderWidgetHostHWND`)을 품은 창에 `WM_CLOSE`, 0.8초 뒤에도 있으면 숨김. 본창 안에서 웹뷰가 보이면 닫지 않고 기록만. ⚠️ 실제 팝업으로는 **아직 미검증**(재현 못 함) — 같은 이름의 가짜 창으로만 확인. |
| 네이트온 | 로그인 때 `networkad.nate.com` 에서 `ad_login_popup.xml`(로그인 팝업)·`ad_login7.xml`(토스트)·`ad_polling7.xml`(정각 광고)을 `%LOCALAPPDATA%\SK Communications\NATEON5\Temp` 에 받아 띄운다. 받기·읽기에 실패하면 건너뛴다(`FAILED: InitAdLogin()` 등 문자열). | 30초마다 `NATEON*\Temp` 의 `ad_login_popup.xml`·`login7.xml`·`polling7.xml` 을 빈 XML + 읽기 전용으로 유지. 끄면 파일을 풀어 지운다. ⚠️ 광고가 걸린 날 **아직 미검증**. |

## 맥판
없음. 맥에서 세 프로그램의 광고가 어떻게 뜨는지 확인할 수 있을 때 만든다(2026-11-18 사용자 결정).
