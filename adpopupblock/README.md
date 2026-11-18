# 광고창 차단 (AdPopupBlock)

윈도우를 켤 때 광고 팝업을 띄우는 프로그램 셋의 광고창과 카카오톡 메인 창 광고를 막는 작은 도구. 작업 타이머와는 별개이고,
같은 설명서 페이지(`docs/index.html` 「01 시작하기」 → 크롬 탭 휠 아래)에서 배포한다. **현재 윈도우판만** 있다.

## 배포본 위치 — Releases 를 쓰지 않는다
배포 파일은 `docs/` 에 직접 커밋한다(크롬 탭 휠·인트라넷 딸깍과 같은 방식). 정식 릴리스를 만들면
`releases/latest` 가 바뀌어 **작업 타이머의 업데이트 배너가 고장 나고**, publish 만 해도 `release.yml` 이 타이머 빌드를 돌린다.

| 파일 | 내용 |
|---|---|
| `docs/AdPopupBlock-1.0.0-win.zip` | 윈도우판 1.0.0. SHA256 `4A567B2B7015213EFACFF08D0AC0D9360ADF96E8FBE9B932BA71F1AD86DD6FA6` |

**1.1.0(카카오톡 추가)은 아직 `docs/` 에 올리지 않았다** — 2026-11-18 사용자 계획: 회사·집 PC 에서 며칠 실사용 후 배포.
1.1.0 은 대기 중 CPU 도 줄였다(아래 「프로세스 찾기」).

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
- 프로세스 찾기: `Process.GetProcessesByName` 은 한 번에 ~10ms(프로세스 550개 기준)라 0.4초마다 두 번 부르면
  대기 CPU 가 ~5% 였다. 1.1.0 부터 최상위 창 목록 + pid→이름 캐시(60초마다 비움)로 찾는다 → ~0.5%.

### 대상별 원리 (2026-11-18 실측)
| 대상 | 광고가 뜨는 방식 | 막는 방법 |
|---|---|---|
| 디자인210 FontManager | `System\Conf.ini` `[POPUP] DATE` 가 오늘(`yyyyMMdd`)과 **같지 않으면** 팝업(`CommUI.FormMain.ShowMain` 이 `String.op_Inequality` 로 비교 — ConfuserEx 난독화 IL 에서 확인). 「하루 동안 보지 않기」가 오늘 날짜를 쓴다. **미래 날짜는 안 통한다.** | 2초마다 DATE 를 오늘로 맞춘다(같으면 안 씀). 어제 날짜 → 팝업, 오늘 날짜 → 팝업 없음을 대조 시험으로 확인. |
| 산돌구름 | Flutter 앱. 광고·공지는 내장 WebView2 로 `https://www.sandollcloud.com/sandollcloudagent/pop?msg_id=…` 를 연다. WebView2 는 **이 팝업에만** 쓰인다(앱 코드·방문 기록 확인). | 0.4초마다 `SandollCloud.exe` 의 보이는 최상위 창 중 Flutter 본창(`FLUTTER_RUNNER*`)이 아니고 WebView2 자식(`Chrome_WidgetWin*`/`Chrome_RenderWidgetHostHWND`)을 품은 창에 `WM_CLOSE`, 0.8초 뒤에도 있으면 숨김. 본창 안에서 웹뷰가 보이면 닫지 않고 기록만. ⚠️ 실제 팝업으로는 **아직 미검증**(재현 못 함) — 같은 이름의 가짜 창으로만 확인. |
| 네이트온 | 로그인 때 `networkad.nate.com` 에서 `ad_login_popup.xml`(로그인 팝업)·`ad_login7.xml`(토스트)·`ad_polling7.xml`(정각 광고)을 `%LOCALAPPDATA%\SK Communications\NATEON5\Temp` 에 받아 띄운다. 받기·읽기에 실패하면 건너뛴다(`FAILED: InitAdLogin()` 등 문자열). | 30초마다 `NATEON*\Temp` 의 `ad_login_popup.xml`·`login7.xml`·`polling7.xml` 을 빈 XML + 읽기 전용으로 유지. 끄면 파일을 풀어 지운다. ⚠️ 광고가 걸린 날 **아직 미검증**. |

| 카카오톡 (1.1.0) | 메인 창(`EVA_Window_Dblclk`, 직속 자식 `OnlineMainView_*`) 아래에 광고 세 겹: ① 메인 창이 소유한 제목 없는 `EVA_Window_Dblclk` 창 안의 `AdFit NAS Advertisement` 웹뷰(실제로 보이는 광고) ② 메인 창 직속의 제목 없는 `EVA_ChildWindow`(광고 자리) ③ `OnlineMainView_*`·`LockModeView_*` 가 광고 높이만큼 짧음. 창 크기가 바뀔 때마다 카카오톡이 ①②를 다시 깔고 ③을 줄인다. | ①② **숨기기만**(크기는 안 건드림), ③ 메인 창 아래 끝까지 늘림(8px 이내 차이는 무시). ①을 숨겨 두면 카카오톡이 창 크기를 바꿀 때도 ①을 다시 보이지 않고 목록을 스스로 끝까지 깐다(실측) → 대개 ③은 시작할 때 한 번뿐. 0.4초 타이머 + 카카오톡 pid 에 `SetWinEventHook`(SHOW·LOCATIONCHANGE는 메인 창·그 자식·소유 창만, 몰리면 한 번으로 합침; 사용자가 창을 끄는 동안(MOVESIZESTART~END)은 손대지 않고 놓을 때 한 번). **알려진 한계: 끄는 동안 목록 아래 광고 높이만큼 빈칸이 보인다**(광고 내용은 안 보임). 끄는 동안에도 늘려 봤으나 카카오톡이 WM_SIZE 마다 줄인 목록을 먼저 그려 빈칸은 그대로였고, 목록을 매 프레임 두 번 그려 다시 버벅였다(사용자 실사용 확인 후 되돌림). 시험 스크립트(SetWindowPos)로는 이 현상이 재현되지 않으니 끌기 관련 수정은 반드시 실제 마우스로 확인할 것. 없애려면 카카오톡 프로세스 안에 코드를 심어야 해서 하지 않는다. ⚠️ 1.1.0 첫 빌드는 ①을 매 이벤트마다 크기 0 으로 줄였다 → 카카오톡이 옮길 때마다 되돌리고 우리가 또 줄이는 다툼으로 **창 이동·크기 조절이 심하게 버벅였다**(사용자 제보, 같은 날 수정). 기존 KakaoTalkAdBlock(Go)은 드래그 중 광고가 잠깐 보였다(사용자 제보). 카카오톡은 관리자 권한으로 돌아 일반 권한으로는 창을 못 바꾼다. 실측(시험 스크립트로 크기 60번 바꾸기): 단계당 33ms — 차단기 없을 때 42ms 와 차이 없음, 광고 창 계속 숨김. |

## 맥판
없음. 맥에서 세 프로그램의 광고가 어떻게 뜨는지 확인할 수 있을 때 만든다(2026-11-18 사용자 결정).
