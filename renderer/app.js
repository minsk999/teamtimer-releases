  // 작업타이머 렌더러 — 예전 index.html 인라인 <script> 를 그대로 옮긴 것(v1.0.43). 전역 함수는 인라인 onclick 이 부른다.
  // 시험(test/*)은 test/renderer-src.js 로 이 파일을 읽는다(옛 index.html 은 인라인 그대로 읽는다 — TT_RENDERER 재현용).
  // 오류 기록(userData/error.log) — 스크립트 맨 앞에 둬서 초기화 중 오류도 남긴다
  if (window.timerAPI && window.timerAPI.logError) {
    window.addEventListener("error", e => window.timerAPI.logError((e.error && e.error.stack) || (e.message + " @" + e.filename + ":" + e.lineno)));
    window.addEventListener("unhandledrejection", e => window.timerAPI.logError("promise: " + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));
  }
  function logError(where, e){ try { if (window.timerAPI && window.timerAPI.logError) window.timerAPI.logError(where + ": " + String((e && (e.stack || e.message)) || e).slice(0, 2000)); } catch (_) {} }
  const $ = id => document.getElementById(id);

  // 아이콘
  const IC = {
    edit: '<svg viewBox="0 0 20 20"><path d="M13.5 4.5l2 2L7 15l-2.5.5L5 13l8.5-8.5z"/></svg>',
    trash: '<svg viewBox="0 0 20 20"><path d="M4.5 6h11M8 6V4.5h4V6M6 6l.5 9h7l.5-9"/></svg>',
    check: '<svg viewBox="0 0 20 20"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>',
    warn: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.3"/><path d="M10 6.4v4.6M10 13.6v.01"/></svg>',
    bell: '<svg viewBox="0 0 20 20" style="width:12px;height:12px;"><path d="M10 3a4.5 4.5 0 00-4.5 4.5c0 4-1.5 5-1.5 5h12s-1.5-1-1.5-5A4.5 4.5 0 0010 3zM8.5 15.5a1.5 1.5 0 003 0"/></svg>',
    inbox: '<svg viewBox="0 0 24 24"><path d="M4 13l2-7h12l2 7M4 13v5h16v-5M4 13h4l1.5 2.5h5L16 13h4"/></svg>',
    chevL: '<svg viewBox="0 0 20 20"><path d="M12 5l-5 5 5 5"/></svg>',
    chevR: '<svg viewBox="0 0 20 20"><path d="M8 5l5 5-5 5"/></svg>',
    link: '<svg viewBox="0 0 20 20"><path d="M8 11a3 3 0 004.5.5l2-2a3 3 0 00-4-4l-1 1M12 9a3 3 0 00-4.5-.5l-2 2a3 3 0 004 4l1-1"/></svg>',
    deck: '<svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="10" rx="1.5"/><path d="M7 17h6M10 14v3"/></svg>',
    settings: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.5"/><path d="M10 1.5v2M10 16.5v2M3.5 3.5l1.4 1.4M15.1 15.1l1.4 1.4M1.5 10h2M16.5 10h2M3.5 16.5l1.4-1.4M15.1 4.9l1.4-1.4"/></svg>',
  };

  // ── 한국 공휴일 (대체공휴일 포함) ──
  // 양력 고정 + 연도별 음력/대체공휴일 데이터
  const HOLIDAYS = {
    // 매년 고정 (월-일)
    fixed: {
      "1-1": "신정", "3-1": "삼일절", "5-5": "어린이날",
      "6-6": "현충일", "7-17": "제헌절", "8-15": "광복절",
      "10-3": "개천절", "10-9": "한글날", "12-25": "성탄절",
    },
    // 연도별 (음력 환산 + 대체공휴일 + 임시공휴일)
    byYear: {
      2026: {
        "2-16":"설날","2-17":"설날","2-18":"설날",
        "3-2":"대체공휴일","5-5":"어린이날","5-24":"부처님오신날","5-25":"대체공휴일",
        "6-3":"지방선거","8-17":"대체공휴일",
        "9-24":"추석","9-25":"추석","9-26":"추석","10-5":"대체공휴일",
      },
      2027: {
        "2-6":"설날","2-7":"설날","2-8":"설날","2-9":"대체공휴일",
        "5-13":"부처님오신날","9-14":"추석","9-15":"추석","9-16":"추석",
      },
    },
  };
  function getHoliday(y, mo, d) {
    const key = `${mo+1}-${d}`;
    if (HOLIDAYS.byYear[y] && HOLIDAYS.byYear[y][key]) return HOLIDAYS.byYear[y][key];
    if (HOLIDAYS.fixed[key]) return HOLIDAYS.fixed[key];
    return null;
  }

  // ── 공휴일 자동 업데이트 ──
  // 한국천문연구원 특일정보 API(공공데이터포털)를 메인 프로세스에서 받아와
  // 내장 데이터에 머지 + 로컬 캐시. 마지막 성공 후 7일 지나면 재갱신.
  // 키가 없거나 실패하면 조용히 건너뛰고 내장 데이터(2026·2027)로 폴백.
  const HOLIDAY_API = {
    updateIntervalDays: 7, // 주 1회 (월 1회로 바꾸려면 30)
    async fetchYear(year) {
      if (typeof window.timerAPI === "undefined" || !window.timerAPI.fetchHolidays) return null;
      try {
        const res = await window.timerAPI.fetchHolidays(year);
        if (res && res.ok && res.map && Object.keys(res.map).length) return res.map;
      } catch (e) {}
      return null;
    },
    async checkAndUpdate() {
      const last = Number(localStorage.getItem("holidayUpdatedAt") || 0);
      const now = Date.now();
      if (now - last < this.updateIntervalDays * 86400000) return;
      const year = new Date().getFullYear();
      let anyOk = false;
      for (const y of [year, year + 1]) {
        const map = await this.fetchYear(y);
        if (map) {
          anyOk = true;
          HOLIDAYS.byYear[y] = { ...(HOLIDAYS.byYear[y] || {}), ...map };
          localStorage.setItem(`holiday_${y}`, JSON.stringify(HOLIDAYS.byYear[y]));
        }
      }
      // 성공했을 때만 갱신 시각 기록 → 키 미설정/일시 실패 시 다음 기회에 재시도
      if (anyOk) localStorage.setItem("holidayUpdatedAt", String(now));
    },
    loadCache() {
      // 앱 시작 시 캐시된 공휴일을 메모리에 복원
      const year = new Date().getFullYear();
      for (const y of [year, year + 1]) {
        const cached = localStorage.getItem(`holiday_${y}`);
        if (cached) { try { HOLIDAYS.byYear[y] = { ...(HOLIDAYS.byYear[y] || {}), ...JSON.parse(cached) }; } catch (e) {} }
      }
    },
  };
  HOLIDAY_API.loadCache();
  if (typeof window.timerAPI !== "undefined") setTimeout(() => HOLIDAY_API.checkAndUpdate(), 5000); // 시작 동기화 이후 여유 있게

  // ── 앱 버전 표시 + 업데이트 확인 ──
  // 설정 상단 버전을 package.json 버전과 자동 동기화하고,
  // GitHub 릴리스에 새 버전이 있으면 배지(설정)와 배너(상단)로 안내한다.
  // 업데이트 UI 표시(배지+배너) — 시작 확인과 트레이 '업데이트 확인'이 공유.
  // ── 자동 업데이트 ────────────────────────────────────────────────
  // 플랫폼마다 할 수 있는 게 다르다.
  //   win  : 앱 안에서 받고 재시작까지 (electron-updater)
  //   mac  : 앱 안에서 받고 검증·전개까지. 교체는 아직 잠겨 있어 폴더를 열어 준다
  //   none : 개발 모드 등 → 예전처럼 설명서로 보낸다
  let updMode = { mode: "none", canApply: false };
  let updState = "idle";          // idle | downloading | ready | error
  let updPct = 0;
  let updDocsUrl = "";
  let updLatest = "";

  // ── 업데이트 UI 헬퍼 ─────────────────────────────────────────────
  // ★downloading 고착 감시. onUpdateClick 이 받는 중 클릭을 통째로 막기 때문에,
  //   update-downloaded 이벤트가 한 번이라도 유실되면 배지·배너가 세션 끝까지 죽는다.
  let updWatchdog = null;
  let updBusy = false;          // updaterDownload 요청이 살아 있는 동안 true
  function updWatchStart(){                       // 진행률이 올 때마다 다시 건다
    clearTimeout(updWatchdog);
    updWatchdog = setTimeout(() => {
      if (updState !== "downloading") return;
      // ★[다시 시도]를 권하지 않는다. electron-updater 는 downloadPromise 가 살아 있으면
      //   새로 받지 않고 멈춘 그 promise 를 그대로 돌려준다(AppUpdater.js) — 눌러도 아무 일이 없다.
      updState = "stalled"; paintUpdater(); openUpdBanner();
      toast("업데이트가 멈춘 것 같아요 — 앱을 껐다 켜 주세요", "err");
    }, 90000);
  }
  function updWatchStop(){ clearTimeout(updWatchdog); updWatchdog = null; }

  // 내부 토큰이 그대로 토스트에 나가면 사용자는 읽을 수 없다
  function updErrText(e){
    const t = String(e || "");
    if (t === "busy") return "이미 받는 중이에요";
    if (t === "not-downloaded") return "아직 다 받지 못했어요";
    if (t === "unsupported" || t === "updater-unavailable") return "이 버전에서는 앱 안에서 받을 수 없어요";
    if (/host-not-allowed|bad-url/.test(t)) return "받을 주소가 올바르지 않아요";
    if (t) logError("update", t);   // 원문은 기록으로
    if (/[가-힣]/.test(t)) return t.slice(0, 60);   // main 이 이미 사람 말로 만든 원인(「arm64 용 파일이 없어요」 등)
    return "업데이트에 실패했어요 — 잠시 뒤 다시 시도해 주세요";
  }

  // 배너 열고 닫기 — 높이 슬롯 클래스 하나로 끝. display 조작도 animationend 의존도 없다
  const UB_DISMISS_KEY = "updateBannerClosed";
  function ubWrap(){ return document.getElementById("update-banner-wrap"); }
  function openUpdBanner(){ const w = ubWrap(); if (w) w.classList.add("open"); }
  function closeUpdBanner(){ const w = ubWrap(); if (w) w.classList.remove("open"); }

  // ★다 받아 놓고도 메인 창에 아무 흔적이 없던 문제.
  //   배지는 설정 모달 <h2> 안에만 있어 설정을 열어야 보인다.
  //   ready 는 [다음에] 로 닫아 뒀더라도 억제를 풀고 다시 알린다.
  function announceUpdateReady(){
    updWatchStop();
    sessionStorage.removeItem(UB_DISMISS_KEY);
    const b = ubBtn(); if (b && !b.onclick) b.onclick = onUpdateClick;   // 닫은 회차에 미바인딩이면 죽은 버튼이 된다
    paintUpdater();                                                     // 문구를 먼저 채우고
    openUpdBanner();                                                    // 그 다음에 연다
  }

  function ubBtn(){ return document.querySelector("#update-banner .ub-btn"); }
  function paintUpdater(latest) {
    if (latest) updLatest = latest;
    const btn = ubBtn(), txt = $("ub-text"), badge = $("update-badge"), banner = $("update-banner");
    const win = updMode.mode === "win";
    // ★배지도 같이 칠한다. 배너를 [다음에] 로 닫아 버리면 배지가 유일한 창구다.
    // ★분기마다 early return 하면 ub-text 가 직전 상태의 문구를 달고 남는다.
    //   실제로 ready→error 에서 "재시작하면 적용돼요" 옆에 [다시 시도] 가 붙었다. 매번 셋 다 쓴다.
    let sTxt, sBtn, sBadge;
    if (updState === "downloading") {
      const s = updPct ? updPct + "%" : "받는 중";
      sTxt = "새 버전을 받고 있어요"; sBtn = s; sBadge = "업데이트 " + s;
    } else if (updState === "ready") {
      sTxt   = win ? "새 버전을 받았어요 — 재시작하면 적용돼요"
                   : "새 버전을 받았어요 — 폴더로 옮겨 주세요";   // ★긴 문구는 440px 에서 2줄이 돼 배너가 11.67px 튄다
      sBtn   = win ? "지금 재시작" : "폴더 열기";
      sBadge = win ? "재시작해 적용" : "받은 폴더 열기";
    } else if (updState === "stalled") {
      // 재시도가 실제로 동작하지 않는 상태다. 되는 방법만 말한다.
      sTxt = "업데이트가 멈췄어요 — 앱을 껐다 켜 주세요"; sBtn = "확인"; sBadge = "앱 재실행 필요";
    } else if (updState === "error") {
      sTxt = "업데이트를 받지 못했어요"; sBtn = "다시 시도"; sBadge = "업데이트 다시 시도";
    } else {
      sTxt   = updLatest ? "새 버전 v" + updLatest + "이 나왔어요" : "새 버전이 있어요";
      sBtn   = "받기";
      sBadge = updLatest ? "v" + updLatest + " 업데이트" : "업데이트 있음";
    }
    if (txt)   txt.textContent   = sTxt;
    if (btn)   btn.textContent   = sBtn;
    if (badge) badge.textContent = sBadge;
    // ★상태에 따라 버튼을 숨기지 않는다 — 배너 높이가 전이 없이 튀고, 닫을 방법도 사라진다
  }

  async function onUpdateClick(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (updState === "stalled") { toast("앱을 껐다 켜면 다시 받을 수 있어요"); return; }
    // ★상태가 아니라 '요청 중' 플래그로 막는다. 워치독이 error 로 바꾼 뒤에도
    //   원래 요청은 살아 있어서, 상태만 보면 두 번째 요청이 나가 mac 은 'busy' 로 튕긴다.
    if (updBusy) { toast("받는 중이에요"); return; }
    if (updMode.mode === "none") {                                 // 예전 동작 — 설명서로
      if (window.timerAPI && window.timerAPI.openExternal && updDocsUrl) window.timerAPI.openExternal(updDocsUrl);
      return;
    }
    if (updState === "stalled") { closeUpdBanner(); return; }
    if (updState === "ready") {
      if (updMode.mode === "win") {
        // ★확인 없이 앱을 죽이면 안 된다. 편집 중이던 내용이 그대로 날아간다.
        openConfirm("지금 재시작할까요?", "앱을 껐다 켜면서 새 버전을 설치해요. 저장 안 한 편집은 사라져요.",
          "재시작", async () => {
            const res = await window.timerAPI.updaterInstall();
            if (!res || !res.ok) { updState = "error"; paintUpdater(); toast("설치를 시작하지 못했어요", "err"); }
          });
      } else {
        const res = await window.timerAPI.updaterReveal();
        if (!res || !res.ok) toast("받아둔 파일을 찾지 못했어요 — 다시 받아 주세요", "err");
      }
      return;
    }
    updState = "downloading"; updPct = 0; paintUpdater(); updWatchStart();
    updBusy = true;
    let r;
    try { r = await window.timerAPI.updaterDownload(); }
    finally { updBusy = false; }
    // win 은 진행률·완료가 이벤트로 오므로 여기서 상태를 확정하지 않는다(워치독이 유실을 잡는다).
    if (updMode.mode !== "win") {
      updWatchStop();
      if (r && r.upToDate) { updState = "idle"; updLatest = ""; paintUpdater(); closeUpdBanner(); toast("이미 최신 버전이에요"); }
      else if (r && r.ok) { updState = "ready"; announceUpdateReady(); }
      else { updState = "error"; paintUpdater(); openUpdBanner(); toast(updErrText(r && r.error), "err"); }
    } else if (r && !r.ok) {
      updWatchStop();
      updState = "error"; paintUpdater(); openUpdBanner(); toast(updErrText(r.error), "err");
    }
  }

  function applyUpdateUI(r) {
    if (!r || !r.ok || !r.hasUpdate) return;
    updDocsUrl = r.url || "";
    // ★더 새로운 버전이 나왔으면 이전 시도의 상태를 버린다.
    //   안 그러면 새 버전 알림이 "업데이트를 받지 못했어요" 문구를 달고 열린다.
    if (r.latest && r.latest !== updLatest && updState !== "downloading") {
      updState = "idle"; updPct = 0;
    }
    updLatest = r.latest || "";
    // 설정 배지 — 배너를 닫아도 여기로는 계속 들어올 수 있다
    const badge = document.getElementById("update-badge");
    if (badge) { badge.style.display = "inline-flex"; badge.onclick = onUpdateClick; }  // 중복 등록 방지(onclick 덮어쓰기)
    // ★핸들러는 배너를 띄우든 말든 항상 붙인다.
    //   예전엔 억제된 회차에 아예 바인딩이 안 돼, ready 로 다시 열렸을 때 죽은 버튼이 됐다.
    const banner = document.getElementById("update-banner");
    if (banner) banner.onclick = null;   // ★버튼에만 붙인다. 전체에 붙이면 ready 에서 오클릭으로 앱이 즉시 죽는다
    const btn = ubBtn(); if (btn) btn.onclick = onUpdateClick;
    const later = document.getElementById("ub-later");
    if (later) later.onclick = (e) => {
      e.stopPropagation();
      // 받는 중·설치 대기 중엔 닫아도 배지로 상태가 이어진다(paintUpdater 가 배지를 칠한다)
      closeUpdBanner();                                   // 슬롯이 닫히는 것으로 끝. animationend 콜백 불필요
      sessionStorage.setItem(UB_DISMISS_KEY, updLatest);
    };
    paintUpdater(r.latest);                               // ★문구를 먼저 채우고
    // ★force = 사용자가 트레이에서 직접 '업데이트 확인'을 누른 경우. 억제를 무시한다.
    //   error 도 무시한다 — 실패를 알리는 유일한 창구가 2초짜리 토스트뿐이면 안 된다.
    if (r.force || updState === "error" || sessionStorage.getItem(UB_DISMISS_KEY) !== r.latest) openUpdBanner();
  }

  (async function initVersionAndUpdate() {
    if (typeof window.timerAPI === "undefined") return;
    // 0) 이 플랫폼에서 무엇이 가능한지 먼저 확인 (win / mac / none)
    try {
      if (window.timerAPI.updaterMode) updMode = await window.timerAPI.updaterMode() || updMode;
    } catch(e){}
    // 메인에서 오는 진행률·완료·오류를 받는다
    try {
      if (window.timerAPI.onUpdaterEvent) window.timerAPI.onUpdaterEvent((p) => {
        if (!p) return;
        if (p.type === "banner") { applyUpdateUI(p); return; }   // 주기 점검 · 트레이 수동 확인
        // 트레이에서 직접 눌렀을 때만 온다. 조용하면 눌러도 아무 일 없는 것처럼 보인다.
        if (p.type === "upToDate")   { toast("최신 버전을 쓰고 계세요"); return; }
        if (p.type === "checkFailed"){ toast("업데이트 확인에 실패했어요 — 잠시 뒤 다시 시도해 주세요"); return; }
        if (p.type === "progress") { updState = "downloading"; updPct = p.percent || 0; paintUpdater(); updWatchStart(); }
        else if (p.type === "ready") { updState = "ready"; announceUpdateReady(); }
        else if (p.type === "error") { updWatchStop(); updState = "error"; paintUpdater(); openUpdBanner(); toast(updErrText(p.error), "err"); }
        else if (p.type === "mac") {
          if (p.state === "download" || p.state === "verify" || p.state === "extract") {
            updState = "downloading"; updPct = p.pct || 0; paintUpdater(); updWatchStart();
          } else if (p.state === "ready" || p.state === "armed") { updState = "ready"; announceUpdateReady(); }
          else if (p.state === "error") { updWatchStop(); updState = "error"; paintUpdater(); openUpdBanner(); toast(updErrText(p.err), "err"); }
        }
      });
    } catch(e){}
    // 1) 버전 표시 (하드코딩 제거 — 이제 매 버전 자동 반영)
    try {
      if (window.timerAPI.appVersion) {
        const v = await window.timerAPI.appVersion();
        if (v) { const el = document.getElementById("app-ver"); if (el) el.textContent = "v" + v; }
      }
    } catch (e) {}
    // 2) 업데이트 확인 (시작 직후 한 번)
    try {
      if (window.timerAPI.checkUpdate) applyUpdateUI(await window.timerAPI.checkUpdate());
    } catch (e) {}
  })();

  const DEFAULT_PRESETS = [
    { name: "오전", time: "11:50" },
    { name: "오후", time: "15:00" },
    { name: "EOD",  time: "18:00" },
  ];
  let PRESETS = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
  try { const _p = JSON.parse(localStorage.getItem("presets") || "null"); if (Array.isArray(_p) && _p.length) PRESETS = _p; } catch(e){}
  const DAYS = ["오늘", "내일"];

  const ALARM_OPTS = [
    { label: "없음", min: null }, { label: "10분 전", min: 10 }, { label: "30분 전", min: 30 },
    { label: "1시간 전", min: 60 }, { label: "3시간 전", min: 180 },
  ];

  function presetTime(name) {
    const p = PRESETS.find(x => x.name === name);
    return p ? p.time : "18:00";
  }
  function dlChip(dayLabel, presetName) {
    const d = new Date();
    if (dayLabel === "내일") d.setDate(d.getDate()+1);
    if (dayLabel === "모레") d.setDate(d.getDate()+2);
    const [h,m] = presetTime(presetName).split(":").map(Number);
    d.setHours(h,m,0,0); return d.getTime();
  }
  function dlDays(days, time) {
    const d = new Date(); d.setDate(d.getDate()+days);
    const [h,m] = time.split(":").map(Number); d.setHours(h,m,0,0); return d.getTime();
  }

  // ── 시트 연동: 팀원 목록 + 내 이름 ──
  // 팀원 명단은 시트('🤖자동화' A열)에서 받아온다 — 코드에 고정하지 않음.
  // 앱 시작 직후(동기화 전)에는 마지막으로 받아둔 목록을 쓰고, 그것도 없으면 아래 기본값.
  const MEMBERS_FALLBACK = ["구민석","한영채","주지현","박나진","김본희","구정현","박지수"];
  function loadMembers(){
    try {
      const saved = JSON.parse(localStorage.getItem("memberNames") || "null");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch(e){}
    return MEMBERS_FALLBACK.slice();
  }
  let MEMBERS = loadMembers();
  // 시트에서 새 명단을 받으면 반영 + 저장 (다음 실행 때 바로 사용)
  function applyMemberNames(names){
    if (!Array.isArray(names) || !names.length) return;
    if (names.join("|") === MEMBERS.join("|")) return;   // 변화 없음
    MEMBERS = names.slice();
    try { localStorage.setItem("memberNames", JSON.stringify(MEMBERS)); } catch(e){}
    try { renderNamePop(); } catch(e){}                  // 설정의 작업자 목록 갱신
  }
  function getMyName(){ return localStorage.getItem("myName") || ""; }
  function setMyName(v){ localStorage.setItem("myName", v || ""); }

  // 작업별 개인 마감 "시간"(HH:MM) 저장 — 시트는 날짜만 저장하므로 시간은 앱 로컬에.
  // 키는 요청글 링크(없으면 제목) — 삭제 compaction으로 행이 바뀌어도 안 어긋남.
  let taskTimes = {};
  try { taskTimes = JSON.parse(localStorage.getItem("taskTimes") || "{}"); } catch(e){ taskTimes = {}; }
  function saveTaskTimes(){ localStorage.setItem("taskTimes", JSON.stringify(taskTimes)); }
  function timeKey(reqLink, title){ return (reqLink || "") || ("t:" + (title || "")); }

  // 작업별 알람 시점(분) 저장 — 시트에는 없으므로 로컬에 보관(동기화 후에도 유지)
  let taskAlarms = {};
  try { taskAlarms = JSON.parse(localStorage.getItem("taskAlarms") || "{}"); } catch(e){ taskAlarms = {}; }
  function saveTaskAlarms(){ localStorage.setItem("taskAlarms", JSON.stringify(taskAlarms)); }
  function alarmFor(reqLink, title){
    const v = taskAlarms[timeKey(reqLink, title)];
    return (v === null || v === undefined || v === "") ? null : Number(v);
  }
  function setTaskAlarm(reqLink, title, minutes){
    const k = timeKey(reqLink, title);
    if(minutes === null || minutes === undefined || minutes === "") delete taskAlarms[k];
    else taskAlarms[k] = Number(minutes);
    saveTaskAlarms();
  }
  // 시트 dueISO(날짜) + 저장된 개인 시간 → 마감 타임스탬프 (없으면 18:00)
  function deadlineFor(iso, reqLink, title){
    let base = isoToDeadline(iso); // 그 날짜 18:00
    const hm = taskTimes[timeKey(reqLink, title)];
    if (hm && /^\d{1,2}:\d{2}$/.test(hm)) {
      const [h,m] = hm.split(":").map(Number);
      const d = new Date(base); d.setHours(h, m, 0, 0); base = d.getTime();
    }
    return base;
  }

  // 시트 dueISO("2026-06-15") → 마감 타임스탬프(그날 18:00 EOD 기준)
  function isoToDeadline(iso){
    if(iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)){
      const [y,mo,d] = iso.split("-").map(Number);
      return new Date(y, mo-1, d, 18, 0, 0, 0).getTime();
    }
    // 날짜 정보 없으면 오늘 18:00로 폴백
    const t = new Date(); t.setHours(18,0,0,0); return t.getTime();
  }

  let tasks = [];          // 동기화로 채워짐 (내 영상작업)
  let mgmtItems = [];      // 관리항목
  let mgmtAdding = false;   // 관리항목 추가 입력 모드
  let mgmtAddDraft = "";    // 추가 입력 중 텍스트(재렌더 보존용)
  let collapsedState = { active:false, done:false, mgmt:false };
  try { Object.assign(collapsedState, JSON.parse(localStorage.getItem("secCollapsed") || "{}")); } catch(e){}
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  // 시트에서 온 링크는 팀 밖에서도 쓸 수 있다 — 웹 주소만 링크로 만든다(나머지는 아이콘 자체를 안 그림).
  // 입력칸 안내가 「intranet.adef.co.kr/…」처럼 스킴 없는 주소라 그런 값은 https:// 를 붙여 연다. 다른 스킴(javascript: 등)은 빈 값.
  function webUrl(u){
    u = String(u || "").trim();
    if (/^https?:\/\//i.test(u)) return u;
    // 「도메인/경로」 모양만. 「기획안.pptx」 같은 파일 이름이 가짜 도메인으로 열리지 않게 경로(/)가 있어야 한다.
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?\//i.test(u)) return "https://" + u;
    return "";
  }

  // "[라벨](https://...)" 마크다운 링크 → 클릭 가능한 링크로. (시트에서 작성한 하이퍼링크 인식)
  // 전체를 먼저 esc()로 이스케이프한 뒤 변환하므로 XSS 안전. http/https만 허용.
  // 「[이름](주소)」와 맨 주소(https://…)를 눌리는 링크로. 이름이 주소 그대로거나 맨 주소면 「도메인/…」로 짧게 보인다.
  // seg = 같은 사이트 링크가 한 항목에 둘 이상이면 경로 첫 마디를 붙여 구별한다(docs.google.com/spreadsheets…) — v1.0.44
  function shortUrl(u, seg){
    try {
      const x = new URL(u.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')), h = x.hostname.replace(/^www\./, "");
      let first = seg ? x.pathname.split("/").filter(Boolean)[0] || "" : "";
      try { first = decodeURIComponent(first); } catch (_) {}
      if (first.length > 20) first = first.slice(0, 20);          // 한글 경로를 복사한 긴 %XX 가 한 줄을 밀어내지 않게
      return first ? h + "/" + esc(first) + "…" : h + (x.pathname.length > 1 || x.search ? "/…" : "");
    } catch(e){ return u; }
  }
  function hostOf(u){ u = String(u).trim().split(/\s+/)[0].replace(/\.$/, ""); try { return new URL(/^https?:\/\//i.test(u) ? u.replace(/&amp;/g, "&") : "https://" + u).hostname.replace(/^www\./, "").toLowerCase(); } catch(e){ return ""; } }
  // 이름이 주소 모양(a.com/… · https://… · bank.com)인데 실제 링크와 사이트가 다르면 이름 대신 실제 주소를 보인다(겉보기 주소 속이기 방지 — v1.0.44).
  // 첫 낱말만 본다(「bank.com 로그인」). 경로가 없으면 끝이 영문 2자 이상(도메인 끝)이고 파일 이름이 아닐 때만 — report.pdf · v2.1 · 1.0.44 는 이름 그대로.
  const FILE_EXT = /\.(pdf|pptx?|docx?|xlsx?|hwpx?|zip|7z|rar|png|jpe?g|gif|webp|svg|mp4|mov|avi|mp3|wav|psd|ai|aep|prproj|txt|csv|json|md|html?)$/i;
  function urlLikeLabel(label){
    const l = String(label).trim().split(/\s+/)[0].replace(/\.$/, "");
    if (/^https?:\/\//i.test(l) || /^[a-z0-9-]+(\.[a-z0-9-]+)+[\/:?#]/i.test(l)) return true;
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(l) && !FILE_EXT.test(l);
  }
  // 맨 주소로 볼 글자: 영문 주소 문자만(한글·괄호·대괄호·꺾쇠·따옴표·공백은 주소가 아님 — 「주소에서 확인」의 「에서」가 끌려오지 않게).
  // 끝의 . , ; : ! ? 와 (화면용) &#39; 같은 이스케이프 꼬리는 문장 쪽으로 돌린다. 바로 뒤가 「(」면 괄호가 든 주소라 손대지 않는다.
  const BARE_URL = "https?:\\/\\/[A-Za-z0-9\\-._~:\\/?#@!$&*+,;=%]+";
  function splitUrlTail(u){
    const m = u.match(/(?:[.,;:!?]|&(?:#39|quot|lt|gt);)+$/);
    return m ? [u.slice(0, -m[0].length), m[0]] : [u, ""];
  }
  function mdLink(u, text){ return `<a class="mdlink" href="#" data-url="${u}" title="${u}" onclick="openMdLink(event, this)">${text}</a>`; }
  function mdLinks(s){
    const t = esc(s);
    const re = () => new RegExp("\\[([^\\]]+)\\]\\((https?:\\/\\/[^)\\s]+)\\)|(" + BARE_URL + ")", "g");
    // 짧은 주소로 보일 링크의 사이트별 개수(같은 사이트가 둘 이상이면 경로 한 마디를 붙인다)
    const shortAs = (label, url) => label === url || (urlLikeLabel(label) && hostOf(label) !== hostOf(url));
    const hosts = {};
    t.replace(re(), (m, label, url, bare, off) => {
      if (!bare) { if (shortAs(label, url)) hosts[hostOf(url)] = (hosts[hostOf(url)] || 0) + 1; }
      else if (!(t[off + m.length] === "(" || t.slice(off - 2, off) === "](")) { const [u] = splitUrlTail(bare); if (u.length > 8) hosts[hostOf(u)] = (hosts[hostOf(u)] || 0) + 1; }
      return m;
    });
    const short = u => shortUrl(u, hosts[hostOf(u)] > 1);
    return t.replace(re(), (m, label, url, bare, off) => {
      if (!bare) return mdLink(url, shortAs(label, url) ? short(url) : label);
      if (t[off + m.length] === "(" || t.slice(off - 2, off) === "](") return m;
      const [u, tail] = splitUrlTail(bare);
      return u.length > 8 ? mdLink(u, short(u)) + tail : m;
    });
  }
  // 메모 저장 전: 맨 주소만 「[주소](주소)」로 — 시트에도 링크로 들어가게. 이미 [이름](주소) 인 구간은 통째로 건너뛴다
  // (라벨이 주소인 링크를 다시 감싸면 셀 글자가 망가지고 링크 대상이 바뀌었다 — v1.0.41 검수).
  function linkifyMemo(t){
    t = String(t);
    return t.replace(new RegExp("\\[[^\\]]*\\]\\([^)]*\\)|(" + BARE_URL + ")", "g"), (m, bare, off) => {
      if (!bare) return m;
      if (t[off + m.length] === "(" || t.slice(off - 2, off) === "](") return m;
      const [u, tail] = splitUrlTail(bare);
      return u.length > 8 ? `[${u}](${u})` + tail : m;
    });
  }
  // 메모 입력칸: 글자를 고른 채 주소를 붙여 넣으면 그 글자에 링크를 건다(고른 글자가 없으면 주소 그대로 붙음 → 저장 때 링크)
  function memoPasteLink(e){
    const el = e.target, t = (e.clipboardData && e.clipboardData.getData("text") || "").trim();
    if (!/^https?:\/\/\S+$/.test(t) || el.selectionStart === el.selectionEnd) return;
    const a = el.selectionStart, b = el.selectionEnd, sel = el.value.slice(a, b);
    if (/[\[\]()]/.test(sel) || /^https?:\/\//i.test(sel.trim())) return;   // 괄호가 든 글자·주소를 고른 경우는 그냥 바꿔 붙인다(마크다운이 깨지지 않게)
    e.preventDefault();
    el.value = el.value.slice(0, a) + `[${sel}](${t})` + el.value.slice(b);
    el.selectionStart = el.selectionEnd = a + sel.length + t.length + 4;
    el.dispatchEvent(new Event("input"));
  }
  function openMdLink(e, el){
    e.preventDefault(); e.stopPropagation(); // 행 클릭/편집 동작과 분리
    const url = el.dataset.url || "";
    if(!/^https?:\/\//i.test(url)) return;
    if(typeof window.timerAPI !== "undefined" && window.timerAPI.openExternal) window.timerAPI.openExternal(url); // 설정의 '링크 열기' 프로필 적용
  }
  let editingId=null, selDl=null, selAlarm=null, selDlImport=null, selDlEdit=null, lastOrder="";

  // ── 작업자 롤링 (읽기 전용으로 다른 팀원 보드 넘겨보기) ──
  // 넘겨보기 순서는 시트 '🤖자동화' A열 순서를 그대로 따름 (MEMBERS 사용)
  let allMembersData = [];
  let viewName = null;
  function firstName(full){ // 구민석 → 민석, 한영채 → 영채 (성 1자 제외)
    full = (full || "").trim();
    return full.length > 1 ? full.slice(1) : full;
  }
  // 앱 실행마다 랜덤 인사 (세션 동안 고정 — 보드 넘겼다 돌아와도 안 바뀜)
  const GREETINGS = [
    "Hello, {n}", "Hi, {n}",            // 영어
    "Bonjour, {n}", "Salut, {n}",        // 프랑스어
    "Hallo, {n}", "Guten Tag, {n}",      // 독일어
    "Hola, {n}",                          // 스페인어
    "Ciao, {n}",                          // 이탈리아어
    "Salve, {n}", "Ave, {n}",            // 라틴어
    "안녕, {n}", "반가워요, {n}"          // 한국어
  ];
  const sessionGreeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  let navHideTimer = null, lastNavView;
  let lastRenderView = null; // render() FLIP 가드: 같은 보드 재렌더 판별
  function renderBoardNav(){
    const nav = $("board-nav"); if(!nav) return;
    const mine = getMyName();
    const ro = viewName !== mine;
    $("bn-name").textContent = ro ? (viewName || "") : sessionGreeting.replace("{n}", firstName(mine));
    $("bn-ro").style.display = ro ? "inline-flex" : "none";
    nav.classList.toggle("viewing-other", ro);

    if(viewName === lastNavView) return; // 같은 보드 재렌더(주기 동기화 등) → 표시 상태 유지
    lastNavView = viewName;
    clearTimeout(navHideTimer);
    if(ro){
      nav.classList.remove("collapsed");      // 남의 보드: 계속 표시
    } else {
      nav.classList.remove("collapsed");      // 내 보드: 보였다가
      navHideTimer = setTimeout(() => {        // 1.5초 후 접힘
        if(viewName === getMyName()) nav.classList.add("collapsed");
      }, 1500);
    }
  }
  function rollView(dir){
    if(isEditingNow()) return;
    let i = MEMBERS.indexOf(viewName); if(i<0) i=0;
    const ni = (i + dir + MEMBERS.length) % MEMBERS.length;
    applyView(MEMBERS[ni]);
  }
  function gotoView(name){ if(isEditingNow()) return; applyView(name); }

  // 테마
  const TH_SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"/>';
  const TH_MOON = '<path d="M20 14.5A7.5 7.5 0 1110.5 5a5.8 5.8 0 009.5 9.5z"/>';
  const themeIconState = { rot: 0, t: null };
  function setThemeIcon() {
    // 초기 로드용 정적 설정(회전/교체 애니메이션 없음)
    const dark = document.body.classList.contains("dark");
    const svg = $("theme-icon");
    const need = (themeIconState.rot % 360) === 180;
    const inner = dark ? TH_MOON : TH_SUN;
    svg.innerHTML = need ? '<g transform="rotate(180 12 12)">' + inner + "</g>" : inner;
  }
  // 사용자가 고른 테마를 기억했다가 켤 때 되살린다(고른 적 없으면 윈도 테마를 따른다 — v1.0.41)
  try {
    const saved = localStorage.getItem("theme");
    const dark0 = saved ? saved === "dark" : !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);   // 고른 적 없으면 윈도 테마
    if (dark0) { document.body.classList.add("dark"); setThemeIcon(); }
    if (window.timerAPI && window.timerAPI.setThemeBg) window.timerAPI.setThemeBg(dark0);
    if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => {
      try { if (localStorage.getItem("theme")) return; } catch (_) { return; }   // 직접 고른 사람은 그대로
      if (e.matches !== document.body.classList.contains("dark")) {
        document.body.classList.toggle("dark", e.matches); setThemeIcon();
        if (window.timerAPI && window.timerAPI.setThemeBg) window.timerAPI.setThemeBg(e.matches);
      }
    });
  } catch (e) {}
  function toggleTheme() {
    document.body.classList.toggle("dark");
    const dark = document.body.classList.contains("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
    if (window.timerAPI && window.timerAPI.setThemeBg) window.timerAPI.setThemeBg(dark);   // 다음 시작 때 창 바탕색(흰 화면 번쩍임 방지)
    // 메일 아이콘과 동일한 모션: 180° 회전 + 중간점(210ms)에서 글리프 교체
    const svg = $("theme-icon");
    themeIconState.rot += 180;
    svg.style.transform = "rotate(" + themeIconState.rot + "deg)";
    const need = (themeIconState.rot % 360) === 180;
    const inner = dark ? TH_MOON : TH_SUN;
    clearTimeout(themeIconState.t);
    themeIconState.t = setTimeout(() => {
      svg.innerHTML = need ? '<g transform="rotate(180 12 12)">' + inner + "</g>" : inner;
    }, 180);
  }

  // 칩 렌더
  function renderChips(gridId, onPick) {
    const grid = $(gridId); grid.innerHTML = "";
    // 그리드 열 수를 프리셋 개수에 맞춤
    grid.style.gridTemplateColumns = `repeat(${PRESETS.length}, 1fr)`;
    DAYS.forEach(day => {
      PRESETS.forEach(p => {
        const el = document.createElement("button");
        el.className = "dchip";
        el.innerHTML = `<div class="d">${day} ${esc(p.name)}</div><div class="t">${esc(p.time)}</div>`;
        el.onclick = () => {
          grid.querySelectorAll(".dchip").forEach(x => x.classList.remove("on"));
          el.classList.add("on"); onPick(dlChip(day, p.name));
        };
        grid.appendChild(el);
      });
    });
  }

  function renderAlarms() {
    const wrap = $("alarm-opts"); wrap.innerHTML = "";
    ALARM_OPTS.forEach(a => {
      const el = document.createElement("button");
      el.className = "achip" + (selAlarm === a.min ? " on" : "");
      el.textContent = a.label;
      el.onclick = () => { selAlarm = a.min; wrap.querySelectorAll(".achip").forEach(x=>x.classList.remove("on")); el.classList.add("on"); };
      wrap.appendChild(el);
    });
  }

  function fmtDl(ts, compact) {
    const d = new Date(ts); const days=["일","월","화","수","목","금","토"];
    const today=new Date(); today.setHours(0,0,0,0);
    const tg=new Date(ts); tg.setHours(0,0,0,0);
    const diff=Math.round((tg-today)/86400000);
    const hhmm = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    if (compact) {
      // 매우 좁을 때: TODAY / D-1 / D-N
      let dday;
      if (diff===0) dday="TODAY";
      else if (diff>0) dday=`D-${diff}`;
      else dday=`D+${-diff}`;
      return `${dday} ${hhmm}`;
    }
    let ds=`${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`;
    if(diff===0)ds="오늘"; else if(diff===1)ds="내일"; else if(diff===2)ds="모레";
    return `${ds} ${hhmm}`;
  }
  function showPrev(ts, scope) {
    $(`dl-prev-${scope}`).style.display="flex";
    $(`dl-prev-text-${scope}`).textContent = fmtDl(ts)+" 마감";
  }

  // 동기화 — Apps Script 읽기 API에서 내 영상작업 + 관리항목 가져오기
  let lastSyncOkAt = 0;     // 마지막 동기화 성공 시각
  let lastSyncMs = 0;       // 마지막 동기화 왕복 시간(ms) — 느림 진단용
  let syncInFlight = false;         // 조용한 동기화 포함 중복 실행 방지
  let syncInFlightPromise = null;   // 진행 중인 동기화 — 겹친 호출은 이걸 그대로 돌려받는다
  let syncQueued = false;           // 진행 중에 새 요청이 들어옴 → 끝나고 한 번 더
  let syncLoud = false;             // 지금 진행분에 '수동 요청'이 섞여 있나(pill·토스트 표시 여부)

  // ── 쓰기와 겹친 동기화는 버린다 ──
  // 낙관적 변경(카드 제거·완료 체크·마감 수정)은 화면에만 있다. 그 쓰기보다 먼저 출발한 읽기 응답이
  // 뒤늦게 도착해 applyView 로 덮으면 방금 지운 카드가 되살아난다(2026-11-20 제보 — 창을 클릭하는 순간
  // 포커스 프리싱크가 걸리고 곧바로 휴지통을 누르는 순서). 완료·마감은 뒤따르는 동기화가 없어 더 오래 틀린 채 남았다.
  let writeGen = 0;              // 쓰기가 시작·종료될 때마다 +1 — 읽기 요청 때와 응답 때 값이 다르면 겹친 것
  let writesInFlight = 0;
  let syncDropped = false;       // 버린 응답이 있다 → 쓰기가 다 끝난 뒤 한 번 다시 받는다
  let syncDroppedLoud = false;   // 버린 것이 수동 요청이었다 → 다시 받았을 때 「동기화 완료」를 알린다
  let syncRoundDropped = false;  // 방금 회차가 버려졌나(doSync 루프용)
  let syncAppliedSeq = 0;        // 응답을 화면에 반영한 횟수 — 호출자가 "새 목록을 정말 받았나"를 가린다
  let syncDropSeq = 0;           // 응답을 버린 횟수 — 삭제가 "내 읽기와 겹쳤나"를 가린다(묘비를 세울지)
  let syncCatchUpTimer = null;
  function beginWrite(){ writeGen++; writesInFlight++; }
  function endWrite(){
    writeGen++; writesInFlight--;
    if (!writesInFlight && syncDropped) scheduleSyncCatchUp(0);
  }
  // ★시트 쓰기는 전부 이걸 거친다. window.timerAPI.postSheet 를 직접 부르면 그 쓰기는 위 보호에서 빠진다.
  // 상한: main 의 20초 타임아웃은 응답 헤더까지만 본다(본문이 늘어지면 undici 기본값 약 5분). 그동안 writesInFlight 가
  // 안 내려가 모든 동기화가 버려지면 「동기화가 멈춘 것」처럼 보인다. main 의 정상 상한(20 + busy 재시도 1.5 + 20초)보다 길게 잡는다.
  const WRITE_CAP_MS = 45000;
  async function postSheetTracked(payload){
    beginWrite();
    let cap = null, capped = false;
    try {
      const sent = window.timerAPI.postSheet(payload);
      // 상한 뒤에 온 응답 = 확인용 동기화보다 늦게 커밋됐을 수 있다 → 한 번 더 받는다
      sent.then(() => { if (capped) doSync({ silent:true }); }, () => {});
      return asStale(payload, await Promise.race([sent, new Promise(res => {
        cap = setTimeout(() => { capped = true; res({ ok:false, timeout:true }); }, WRITE_CAP_MS);
      })]));
    }
    finally { clearTimeout(cap); endWrite(); }
  }
  // 서버는 그 행이 작업 행이 아니면(비었거나 이름·관리 행) 지문 검사보다 **먼저** 「영상작업 행이 아님(보호)」 일반 오류를 준다.
  // 위쪽 줄이 빠져 한 칸 당겨진 뒤 **맨 아래 카드**를 누르면 이쪽으로 온다(stale 은 시트 전체 끝을 넘었을 때뿐).
  // 뜻은 stale 과 같다 — 쓰기는 일어나지 않았고 행 번호가 틀렸다. 같은 경로(재동기화)로 태운다.
  const ROW_ACTIONS = ["deleteTask", "toggleDone", "updateDue", "updateTask"];
  function asStale(payload, r){
    if (r && !r.ok && !r.stale && !r.busy && !r.timeout && ROW_ACTIONS.indexOf(payload && payload.action) >= 0
        && /^영상작업 행이 아님/.test(String(r.error || ""))) return { ...r, stale:true, found:"", foundIdx:"" };
    return r;
  }
  function scheduleSyncCatchUp(ms){
    if (syncCatchUpTimer) return;
    syncCatchUpTimer = setTimeout(() => {
      syncCatchUpTimer = null;
      if (!syncDropped || writesInFlight) return;   // 쓰기가 또 시작됐다 — 그 쓰기가 끝날 때 다시 온다
      if (syncInFlight) return;                     // 지금 도는 회차가 받아 오거나, 버려지면서 다시 예약한다
      if (!syncDroppedLoud && isEditingNow()) { scheduleSyncCatchUp(3000); return; }   // 주기 동기화와 같은 편집 보호
      const loud = syncDroppedLoud;
      syncDropped = false; syncDroppedLoud = false;
      doSync({ silent: !loud });
    }, ms);
  }

  // ── 동기화 pill 표시 ──
  // 여러 회차에 걸쳐 켜져 있어야 하므로 doSync 가 관리한다. runSyncOnce 가 회차마다
  // 껐다 켜면 합류한 수동 요청이 깜빡이거나 아예 안 보인다.
  let syncPillOrig = null;
  function syncPillOn(){
    const pill = $("sync-pill"); if(!pill || pill.classList.contains("syncing")) return;
    pill.classList.add("syncing");
    const t = pill.querySelector(".sync-text");
    if(t){ if(syncPillOrig === null) syncPillOrig = t.textContent; t.textContent = "동기화 중"; }
  }
  // 마지막 동기화가 실패했으면 점을 빨갛게 멈추고, 마우스를 올리면 마지막 성공 시각을 보여 준다
  function syncPillState(ok){
    const pill = $("sync-pill"); if(!pill) return;
    pill.classList.toggle("err", !ok);
    const hm = d => `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    pill.title = ok ? "지금 동기화" : ("동기화 실패 — 마지막 성공 " + (lastSyncOkAt ? hm(new Date(lastSyncOkAt)) : "없음") + " · 눌러서 다시 시도");
  }
  function syncPillOff(){
    const pill = $("sync-pill"); if(!pill) return;
    pill.classList.remove("syncing");
    const t = pill.querySelector(".sync-text");
    if(t && syncPillOrig !== null){ t.textContent = syncPillOrig; syncPillOrig = null; }
  }

  // ⚠ 겹친 호출을 그냥 버리면(예전: `if (syncInFlight) return;`) `await doSync()` 가
  //   아무것도 기다리지 않은 채 통과한다. 그 결과
  //     ① 방금 추가한 작업이 진행 중이던 옛 응답에 덮여 최대 10분간 사라지고
  //     ② 삭제 뒤 행번호 재조정이 무효가 되며
  //     ③ 수동 요청(스페이스바·동기화 pill)이 아무 반응 없이 씹힌다.
  //   → 진행 중인 회차를 돌려주고, 그 뒤에 한 번 더 돌려서 호출자가 방금 쓴 내용까지 반영한다.
  //
  // ★그리고 합류한 요청이 '수동'이면 진행분 전체를 시끄럽게 바꾼다(syncLoud).
  //   예전엔 후속 회차를 무조건 조용히 돌려서, 백그라운드 동기화(포커스 프리싱크·10분 주기)가
  //   도는 중에 동기화 버튼을 누르면 **pill 스피너도 토스트도 안 떴다**(실사용 제보).
  //   창을 클릭해 포커스를 준 직후 버튼을 누르는 흔한 순서에서 정확히 걸린다.
  async function doSync(opts) {
    opts = opts || {};
    const loud = !opts.silent;
    const myName = getMyName();
    if (!myName) {
      if(loud){ toast("설정에서 작업자를 먼저 선택해 주세요"); openSettings(); }
      return;
    }
    if (typeof window.timerAPI === "undefined") {
      if(loud) toast("앱(데스크톱)에서만 동기화돼요");
      return;
    }
    if (syncInFlight) {
      syncQueued = true;
      if (loud && !syncLoud) { syncLoud = true; syncPillOn(); }  // 합류 즉시 반응을 보여준다
      return syncInFlightPromise;
    }

    syncInFlight = true;
    syncLoud = loud;
    if (loud) syncPillOn();
    syncInFlightPromise = (async () => {
      try {
        let last, rounds = 0;
        do {
          syncQueued = false;
          syncRoundDropped = false;
          last = await runSyncOnce(!syncLoud);
          // ★상한 1회 추가. 예전 4회는 GAS 왕복을 최대 4배로 늘려 체감 지연을 키웠다.
          //   합류한 요청의 쓰기 내용을 반영하는 데는 한 회차면 충분하다.
        } while (syncQueued && ++rounds < 2);
        // 마지막 회차까지 쓰기와 겹쳐 버려졌다(상한에 걸림) → 이 루프에서는 받아 올 회차가 없으니 따로 예약한다
        if (syncRoundDropped) syncDropped = true;
        return last;
      } finally {
        syncInFlight = false;            // 어떤 경로로 끝나도 반드시 잠금 해제
        syncInFlightPromise = null;
        syncQueued = false;
        syncLoud = false;
        syncPillOff();                   // 버려진 수동 요청도 여기서 pill 은 끈다 — 다시 받는 회차가 새로 켠다
        if (syncDropped && !writesInFlight) scheduleSyncCatchUp(0);
      }
    })();
    return syncInFlightPromise;
  }

  // 실제 1회 동기화. 잠금·pill 은 doSync 가 잡고 있으므로 여기서는 건드리지 않는다.
  async function runSyncOnce(silent) {
    const myName = getMyName();
    const gen0 = writeGen;
    try {
      // 일시적 실패(Apps Script 콜드스타트 등 404/500) 대비 1회 자동 재시도.
      // ★단 타임아웃 뒤에는 재시도하지 않는다 — 30초를 기다린 끝에 또 30초를 기다리게 되고
      //   (총 62초) 그 사이 pill 은 계속 "동기화 중"이라 멈춘 것처럼 보인다.
      const _t0 = performance.now();
      let res = await window.timerAPI.syncSheet();
      let tries = 1;
      if (!res || (!res.ok && !res.timeout)) {
        await new Promise(r => setTimeout(r, 2000));
        res = await window.timerAPI.syncSheet();
        tries = 2;
      }
      const _el = Math.round(performance.now() - _t0);
      console.log(`[sync] ${_el}ms (서버 ${res && res._ms != null ? res._ms + "ms" : "?"}, 시도 ${tries})`);
      lastSyncMs = _el;
      if (!res || !res.ok) throw new Error(res && res.error || "응답 오류");

      // 요청한 뒤로 쓰기가 시작됐거나 끝났다 → 이 응답은 그 쓰기 전의 시트일 수 있다. 반영하지 않는다.
      if (writesInFlight > 0 || gen0 !== writeGen) {
        syncRoundDropped = true; syncDropSeq++;
        // 버린 이 읽기가 방금 끝났다 = 서버 캐시에 들어간 것도 지금이다. 묘비 시계를 삭제 ok 가 아니라 여기서부터 다시 잰다.
        { const now = Date.now(); tombstones.forEach(tb => { if (tb.max > now) tb.until = Math.min(tb.max, Math.max(tb.until, now + TOMB_MS)); }); }
        if (!silent || syncLoud) syncDroppedLoud = true;   // syncLoud: 조용히 시작한 회차에 수동 요청이 합류했다
        // 쓰기가 아직 가는 중이면 지금 다시 받아도 또 버려진다 → 그 쓰기가 끝날 때(endWrite) 받는다
        if (writesInFlight > 0) syncDropped = true; else syncQueued = true;
        // 버린 이 읽기가 서버 캐시를 쓰기 전 데이터로 되채웠을 수 있다(아래 「지운 작업 가리기」 ②) → 곧바로 다시 받는
        // 응답도 낡았을 수 있다. 삭제는 묘비가 막지만 완료·마감·수정은 못 막으므로 캐시가 죽은 뒤 한 번 더 받는다.
        scheduleLateSync(Date.now() + TOMB_MS);
        return;
      }
      const owedToast = syncDroppedLoud;   // 앞서 버려진 수동 요청 몫
      syncDropped = false; syncDroppedLoud = false;
      syncAppliedSeq++;

      allMembersData = res.members || [];
      applyMemberNames(res.memberNames);   // 시트에서 받은 팀원 명단 반영
      if (!viewName) viewName = myName;
      if (!allMembersData.find(m => m.name === viewName)) viewName = myName;
      const cnt = applyView(viewName);
      lastSyncOkAt = Date.now(); // 포커스 프리싱크 기준 시각
      syncPillState(true);
      if (_el >= 8000 && window.timerAPI && window.timerAPI.logError) window.timerAPI.logError("sync-slow " + _el + "ms, tasks " + cnt);
      if(!silent || owedToast) toast(_el >= 8000
        ? `동기화 완료 · 작업 ${cnt}건 (${(_el/1000).toFixed(1)}초 — 시트가 느려요)`
        : `동기화 완료 · 작업 ${cnt}건`);
      return cnt;
    } catch (e) {
      syncPillState(false);
      if(!silent || syncDroppedLoud) toast(syncErrText(e), "err");
      // 다시 받기까지 실패했으면 거기서 멈춘다(실패할 때마다 다시 예약하면 끝없이 돈다). 가는 중인 쓰기가 있으면 그 끝에서 한 번 더 시도한다.
      syncDroppedLoud = false;
      if (!writesInFlight) syncDropped = false;
    }
  }

  // 시트 응답 1명분 → 화면용 작업 배열. applyView(보는 사람)와 refreshMyTasks(나) 둘 다 사용.
  function mapVideoTasks(m) {
    return ((m && m.video) || []).map(v => ({
      id: v.row,
      title: v.title,
      deadline: deadlineFor(v.dueISO, v.requestLink || "", v.title),
      type: "req",
      done: !!v.done,
      alarm: alarmFor(v.requestLink || "", v.title),
      reqLink: v.requestLink || "",
      planLink: v.planLink || "",
      _row: v.row, _status: v.status || "", _memo: v.memo || "", _side: m.side
    }));
  }

  // ⚠ 알람은 '보고 있는 보드'가 아니라 '내 보드'로 판정해야 한다.
  //   tasks 는 Q/E 로 팀원 보드를 넘겨보는 순간 그 사람 것으로 통째 교체되므로,
  //   그 상태로 checkAlarms 를 돌리면 (1) 내 알람이 판정조차 안 되고
  //   (2) 남의 마감 알림이 내 데스크톱에 뜬다. → 내 몫을 따로 유지한다.
  //   내 보드를 보고 있을 때는 tasks 를 그대로 가리켜(복사 아님) 낙관적 수정이 알람에 즉시 반영되게 한다.
  let myTasks = [];
  function refreshMyTasks() {
    const me = getMyName();
    if (viewName === me) { myTasks = tasks; return; }
    myTasks = hideDeleted(mapVideoTasks((allMembersData || []).find(x => x.name === me)));
  }

  // ── 지운 작업 가리기 (내 보드 전용 — 지문과 행 번호는 내 단의 것이다) ──
  // ① pendingDeletes: 삭제가 끝나기 전(재동기화 뒤 자동 재시도 포함)인 작업. 그 사이 어떤 목록을 받아도
  //    — 재시도를 위한 재동기화, 팀원 보드를 넘겼다 돌아오기 — 화면에 다시 나오면 안 된다.
  //    행은 밀렸을 수 있으므로 지문(게시글 idx + 제목)으로 찾는다.
  // ② tombstones: 서버가 ok 한 삭제. 서버는 읽기 응답을 20초 캐시하는데 읽기는 락을 안 잡는다 →
  //    쓰기 직전에 출발한 읽기가 쓰기 뒤에 끝나며 삭제 전 데이터를 캐시에 되넣을 수 있고, 그러면 직후
  //    동기화가 지운 카드를 옛 행 번호 그대로 싣고 온다. 행·idx·제목이 **모두** 같을 때만 거른다 —
  //    정상 응답이라면 그 행에는 아래 작업이 당겨져 있어 걸리지 않는다(당겨진 것이 쌍둥이면 건수로 가린다 — addTombstone).
  const pendingDeletes = [];
  let tombstones = [];
  const TOMB_MS = 25000;        // 서버 캐시 20초 + 왕복 여유
  const TOMB_MAX_MS = 60000;    // 낡은 응답을 볼 때마다 늘리되 여기까지만 — 잘못 걸린 카드가 영영 숨는 일은 없게
  // link: 게시글 번호가 없는 손 링크 카드만 링크 전체로 구별한다(번호가 있으면 "" — 같은 게시글의 여러 줄을 쌍둥이로 보는 기존 규칙 유지)
  function taskFp(t){ const idx = idxOf(t.reqLink); return { row: t._row || t.id, idx, link: idx ? "" : String(t.reqLink || "").trim(), title: String(t.title || "").trim(), done: !!t.done }; }
  function fpMatch(t, fp){ return idxOf(t.reqLink) === fp.idx && String(t.title || "").trim() === fp.title && (!fp.link || String(t.reqLink || "").trim() === fp.link); }
  function unpendDelete(fp){ const i = pendingDeletes.indexOf(fp); if (i >= 0) pendingDeletes.splice(i, 1); }
  function addTombstone(fp, stillQueued, watch){
    const now = Date.now();
    // left: 지운 뒤에도 서버의 내 단에 남아 있을 같은 지문(같은 게시글·같은 제목 = 쌍둥이)의 수. 쌍둥이가 붙어 있으면 정상 응답에서도
    // 그 행에 같은 지문이 당겨져 와 행·지문만으로는 낡은 응답과 구별되지 않는다 → 응답에 left 보다 많이 있을 때만 거른다.
    // (쌍둥이의 유령을 그냥 두면 사용자가 그걸 다시 누르고, 서버 지문 검사는 쌍둥이를 구별 못 해 남은 진짜 한 줄이 지워진다.)
    // stillQueued: 완료 비우기에서 같은 묶음에 아직 안 지워진(또는 실패해 남은) 같은 지문의 수 — 화면에서는 이미 빠졌지만 서버에는 있다.
    // watch: **가리지 않고 지켜보기만** 하는 기록. 그 행에 그 지문이 다시 보이면 캐시가 죽을 때까지 뒤늦은 동기화를 다시 건다.
    //   묘비를 세우지 않기로 한 삭제(맨 아래 + 겹친 내 읽기 없음, timeout, 일반 오류)에 쓴다. 뒤늦은 동기화 한 번만 걸어 두면 그 한 번이
    //   낡은 캐시를 받는 구간이 있다 — 삭제와 겹친 다른 PC 의 느린 읽기가 5~25초 뒤에 끝나 캐시에 들어가면, 지운 카드가 26초쯤 뒤 아무
    //   안내 없이 다시 나타나 다음 동기화(최대 10분)까지 남았다(v1.0.36 검수). 수명은 그 뒤늦은 동기화(25.3초)보다 길어야 한다.
    tombstones.push({ row: fp.row, idx: fp.idx, title: fp.title, watch: !!watch,
      left: myTasks.filter(t => fpMatch(t, fp)).length + (stillQueued || 0),
      until: now + TOMB_MS + (watch ? 5000 : 0), max: now + TOMB_MAX_MS });
  }
  // 삭제 ok 뒤 묘비를 세울지 정한다.
  // ★묘비의 오탐은 **맨 아래 카드**에서만 난다 — 맨 아래를 지우면 그 행이 비고, 새로 등록되는 작업(딸깍·앱)은 「마지막 작업 다음 행」
  //   = 바로 그 행에 들어간다. 잘못 올려 지우고 곧바로 다시 보내는 흐름이 정확히 이 모양이라, 묘비가 새 카드를 낡은 응답으로 보고
  //   최대 60초 가린다(그 아래 등록된 카드의 행 번호까지 한 칸 틀어짐). 맨 아래가 아니면 새 작업이 그 행에 올 수 없어 오탐이 없다.
  //   그래서 맨 아래 카드는 「낡은 캐시가 생겼을 근거」— 이 삭제와 겹친 내 읽기 — 가 있을 때만 묘비를 세운다. 근거가 없으면
  //   (다른 PC 의 읽기가 겹쳤을 드문 경우) 카드가 잠깐 다시 보일 수 있고, 캐시가 죽은 뒤의 동기화가 스스로 지운다.
  function buryDeleted(fp, bottom, overlapped, stillQueued){
    if (bottom && !overlapped) { addTombstone(fp, stillQueued, true); scheduleLateSync(Date.now() + TOMB_MS); }
    else addTombstone(fp, stillQueued);
  }
  // 방금 지운 것과 같은 작업을 앱에서 다시 넣었다 — 맨 아래 행을 지웠다면 새 행이 바로 그 번호라 묘비에 걸린다
  function dropTombstones(reqLink, title){
    const idx = idxOf(reqLink), ttl = String(title || "").trim();
    const lifted = tombstones.filter(tb => tb.idx === idx && tb.title === ttl);
    tombstones = tombstones.filter(tb => !(tb.idx === idx && tb.title === ttl));
    return lifted;
  }
  // 묘비에 걸린 카드를 뺀다. 걸렸다 = 이 응답은 그 삭제 전의 시트다 → 그 아래 작업의 행 번호도 한 칸씩 낡았으므로
  // 실제 시트대로 당겨 둔다. 안 당기면 캐시가 죽을 때까지(약 20초) 아래 카드의 삭제·완료·마감이 전부 stale 로
  // 거부돼 「지운 직후 다음 카드는 눌러도 되돌아온다」가 된다. 잘못 당겼더라도 서버가 지문을 검사해 stale 로 끝난다.
  function dropBuried(list){
    if (!tombstones.length) return list;
    const now = Date.now();
    tombstones = tombstones.filter(tb => tb.until > now && tb.max - now <= TOMB_MAX_MS);   // 뒤 조건: PC 시계가 뒤로 간 경우
    const out = list.slice();
    let wake = 0;
    // 묘비는 세운 순서(= 지운 순서)대로 하나씩 대조하고, 걸릴 때마다 바로 당긴다. 묘비의 행 번호는 「그 앞의 삭제가
    // 모두 반영된 시트」 기준이라, 두 건을 지우기 전의 응답은 한꺼번에 대조하면 뒤 묘비가 한 칸 어긋난다.
    tombstones.forEach(tb => {
      const i = out.findIndex(t => (t._row || t.id) === tb.row && fpMatch(t, tb));
      if (i < 0 || list.filter(t => fpMatch(t, tb)).length <= tb.left) return;
      if (tb.watch) {
        // 지켜보기만: 가리지도 당기지도 않는다. 낡은 응답이든 다시 등록된 카드든 한 번 더 받아 보면 갈린다(max 까지만).
        tb.until = Math.min(tb.max, Math.max(tb.until, now + TOMB_MS));
        if (now + TOMB_MS <= tb.max) wake = Math.max(wake, now + TOMB_MS);
        return;
      }
      out.splice(i, 1);
      // 서버(deleteTask)는 지운 행 아래로 **이어진** 작업 행만 당긴다 — 빈 행을 만나면 멈춘다. 똑같이 한다.
      const byRow = new Map(out.map(t => [t._row || t.id, t]));
      for (let row = tb.row + 1; byRow.has(row); row++) { const t = byRow.get(row); t.id = t._row = row - 1; }
      // 낡은 캐시를 지금 봤다 = 서버에서 길어야 20초 더 산다. 그때까지 묘비를 살려 두고, 죽은 직후 한 번 다시 받는다.
      tb.until = Math.min(tb.max, Math.max(tb.until, now + TOMB_MS));
      wake = Math.max(wake, tb.until);
    });
    if (wake) scheduleLateSync(wake);
    return out;
  }
  function hideDeleted(list){
    const live = dropBuried(list);
    if (!pendingDeletes.length) return live;
    const out = live.slice();
    pendingDeletes.forEach(fp => {
      // 한 건만 가린다 — 같은 지문이 둘이면 하나는 남아야 한다(완료 여부·행이 같은 쪽 우선)
      let same = out.filter(t => fpMatch(t, fp));
      if (same.some(t => !!t.done === fp.done)) same = same.filter(t => !!t.done === fp.done);
      const hit = same.find(t => (t._row || t.id) === fp.row) || same[0];
      if (hit) out.splice(out.indexOf(hit), 1);
    });
    return out;
  }
  // 서버 읽기 캐시가 죽은 뒤 조용히 한 번 더 받는다 — 낡은 응답을 봤거나(묘비), 받았을 수 있을 때(쓰기와 겹쳐 버린 읽기).
  // 예약이 겹치면 가장 늦은 시각 한 번으로 모은다.
  let lateSyncTimer = null, lateSyncAt = 0;
  function scheduleLateSync(at){
    if (lateSyncTimer && at <= lateSyncAt) return;
    lateSyncAt = at;
    clearTimeout(lateSyncTimer);
    lateSyncTimer = setTimeout(lateSync, Math.max(0, at - Date.now()) + 300);
  }
  function lateSync(){
    lateSyncTimer = null; lateSyncAt = 0;
    if (isEditingNow()) { lateSyncTimer = setTimeout(lateSync, 3000); return; }   // 주기 동기화와 같은 편집 보호
    doSync({ silent:true });
  }

  // 현재 보는 사람(name) 기준으로 tasks/mgmt 매핑 + 렌더 (롤링)
  function applyView(name) {
    viewName = name;
    const m = (allMembersData || []).find(x => x.name === name);
    if (m) {
      const list = mapVideoTasks(m);
      tasks = name === getMyName() ? hideDeleted(list) : list;
      mgmtItems = m.mgmt || [];
    } else {
      tasks = []; mgmtItems = [];
    }
    refreshMyTasks();
    document.body.classList.toggle("readonly", name !== getMyName());
    // 데이터가 실제로 바뀐 렌더(첫 로드·동기화 반영·보드 전환)에만 등장 모션
    const _sig = name + "|" + JSON.stringify(m ? m.video : null) + "|" + JSON.stringify(m ? m.mgmt : null);
    const _changed = _sig !== lastBoardSig; lastBoardSig = _sig;
    renderBoardNav();
    renderMgmt();
    render();
    if (_changed) playEntrance(); // 쿨다운 없음 — 연속 전환도 매번 새 요소에 깨끗하게 재생
    return tasks.length;
  }
  let lastBoardSig = null;
  function playEntrance(){
    const items = [...document.querySelectorAll(".task, .mgmt-item")]; // DOM(화면) 순서대로 스태거
    items.forEach((el, i) => {
      el.style.setProperty("--ei", Math.min(i, 14)); // 스태거 지연 상한
      el.classList.add("enter"); // 방금 만들어진 요소에만 부여 → 이후 재렌더 요소엔 영향 없음
    });
  }
  function isReadonly(){ return viewName !== getMyName(); }

  // 모달
  // ── 알람 설정 ──
  // ★선언 위치 주의: 아래 메일 블록(캐시 복원 IIFE·필터 헬퍼)이 alarmSettings 를 읽으므로
  //   반드시 그보다 먼저 선언돼야 한다. 설정 UI 쪽으로 내리면 TDZ ReferenceError 가 난다.
  let alarmSettings = {
    notify: true, sound: true, soundType: "ding", repeat: "1", defaultAlarm: "60",
    volume: 0.8, customSoundData: null, customSoundName: "",
    // 받을 메일 종류 — 키는 MAIL_KINDS 의 key. 기본은 셋 다 켜짐(기존 동작 유지).
    // 값이 없거나 undefined 면 '켜짐'으로 본다(구버전 설정에서 올라와도 메일을 놓치지 않게).
    mailKinds: { req: true, comment: true, assign: true },
    // 필터 적용 범위: "notify" = 알림만 끄기(목록엔 남음) / "hide" = 목록·배지에서도 제외
    mailFilterScope: "notify",
  };
  try { const _as = JSON.parse(localStorage.getItem("alarmSettings") || "null"); if (_as && typeof _as === "object") alarmSettings = { ...alarmSettings, ..._as }; } catch(e){}

  // ── 업무시간만 세기 — 저장 모델. localStorage 'workHours' = {on, start, end, labels}. 키 없음·깨짐 = 기본값·off ──
  //   참조 구현 _audit/bizleft.js(규칙 B, 테스트 125건). 계산 함수 6개는 urgencyAt() 위에 있다.
  //   labels = 하위 옵션 「설명 표시」. ★없거나 깨진 값은 true — 정확히 false 로 저장된 것만 끈다.
  const WORK_DEFAULT = { on:false, start:"09:00", end:"18:00", labels:true };
  // localStorage 문자열(또는 객체)을 안전한 workHours 로. 형식 실패·끝≤시작이면 기본값(off).
  function parseWorkHours(raw){
    let workHours = { ...WORK_DEFAULT };
    try {
      const _w = typeof raw === "string" ? JSON.parse(raw || "null") : raw;
      if(_w && typeof _w === "object"){
        const s = normalizeTime(_w.start), e = normalizeTime(_w.end);
        if(s && e && hmToMin(e) > hmToMin(s)) workHours = { on: !!_w.on, start: s, end: e, labels: _w.labels !== false };
      }
    } catch(e){}
    return workHours;
  }
  // 켜져 있고 끝 > 시작일 때만 {startMin,endMin,labels}, 아니면 null → 달력 경로(기존 계산 그대로).
  // ★유일한 관문: saveSettings 가 직접 만든 workHours 라도 여기서 역전·NaN 이 걸러진다(NaN 이면 비교가 false → null).
  function makeCfg(workHours){
    if(!workHours || !workHours.on) return null;
    const s = hmToMin(workHours.start), e = hmToMin(workHours.end);
    return e > s ? { startMin: s, endMin: e, labels: workHours.labels !== false } : null;
  }
  let _whRaw = null;
  try { _whRaw = localStorage.getItem("workHours"); } catch(e) {}   // alarmSettings(위)와 같은 관문 — top-level 에서 던지면 스크립트가 통째로 죽는다
  let workHours = parseWorkHours(_whRaw);
  let workCfg = makeCfg(workHours);          // null = 옵션 꺼짐. urgency()/cdText() 가 매 tick 읽는다

  // 메일 (Gmail)
  // 새 메일 알림: 카운트 증감이 아니라 '새로운 안읽음 메일 ID'가 생겼을 때만 1회 알림(중복 방지)
  let notifiedIds = new Set();
  try { const _a = JSON.parse(localStorage.getItem("notifiedMailIds") || "[]"); if(Array.isArray(_a)) notifiedIds = new Set(_a); } catch(e){}
  function saveNotifiedIds(){ try { localStorage.setItem("notifiedMailIds", JSON.stringify([...notifiedIds].slice(-200))); } catch(e){} }

  // ── 로컬 읽음 표시 ────────────────────────────────────────────
  // ★Gmail 은 messages.modify 로 UNREAD 를 떼도 **is:unread 검색 인덱스가 몇 초~수십 초 늦게**
  //   따라온다. 기본 폴링이 10초라, 카드를 눌러 읽음 처리한 직후의 폴링 응답이 그 지연 창에
  //   정확히 들어가 "안읽음"을 다시 싣고 온다 → 화면이 읽지않음으로 되돌아간다(실사용 제보).
  //   그래서 내가 방금 읽은 id 는 일정 시간 화면에서 읽음으로 고정한다.
  const locallyRead = new Map();          // id → 만료 시각
  const LOCAL_READ_TTL = 180000;          // 3분 — 인덱스 지연 여유
  function markLocallyRead(id){ locallyRead.set(id, Date.now() + LOCAL_READ_TTL); }
  function unmarkLocallyRead(id){ locallyRead.delete(id); }
  function applyLocalRead(list){
    if(!locallyRead.size) return list || [];
    const now = Date.now();
    locallyRead.forEach((exp, id) => { if(exp <= now) locallyRead.delete(id); });
    return (list || []).map(m => (m && m.unread && locallyRead.has(m.id)) ? { ...m, unread: false } : m);
  }
  let lastBadgeCount = -1; // 경량 폴링 카운트 추적(증가 시에만 정밀 확인)

  // 인트라넷 메일 제목의 말머리 → 알림 제목
  //   "업무 요청"   → 새 업무 요청
  //   "업무 전달"   → 담당자 배정
  //   "코멘트 알림" → 코멘트 알림
  const MAIL_KINDS = [
    { key: "comment", re: /코멘트\s*알림/, label: "코멘트 알림" },
    { key: "assign",  re: /업무\s*전달/,   label: "담당자 배정" },
    { key: "req",     re: /업무\s*요청/,   label: "업무 요청" },
  ];
  function mailKind(text){
    const s = String(text || "");
    for(const k of MAIL_KINDS){ if(k.re.test(s)) return k; }
    return null;
  }

  // ── 메일 종류별 필터 (설정 → 알람 → 받을 메일 종류) ──
  // ★어느 분류에도 안 걸리는 메일은 **항상 통과**시킨다.
  //   인트라넷이 제목 형식을 바꿔도 메일을 놓치지 않게 하는 안전장치다(안 오는 것보다 오는 게 낫다).
  function mailKindKey(m){
    const k = mailKind(m && (m.subject || m.fullSubject));
    return k ? k.key : null;
  }
  // 값이 명시적으로 false 일 때만 끈 것으로 본다 — 구버전 설정에 키가 없어도 켜짐으로 동작한다.
  function mailKindOn(key){
    if(!key) return true;
    const mk = alarmSettings.mailKinds || {};
    return mk[key] !== false;
  }
  function mailNotifyOk(m){ return mailKindOn(mailKindKey(m)); }
  // 목록·배지에서 뺄지는 '적용 범위'가 정한다. 기본(notify)은 알림만 끄고 목록엔 남긴다.
  function mailVisible(m){ return alarmSettings.mailFilterScope === "hide" ? mailNotifyOk(m) : true; }
  function visibleMail(){ return mailData.filter(mailVisible); }
  function visibleUnreadCount(){ return visibleMail().filter(m => m.unread).length; }
  // 말머리를 뺀 '실제 제목'만 추림. 제목이 말머리뿐이면 요청자/본문요약으로 대체.
  function mailBodyText(m){
    if(!m) return "";
    const subj = String(m.subject || m.fullSubject || "").trim();
    const k = mailKind(subj);
    let rest = subj;
    // 실제 제목 형식 예) "[Intranet-영상] 업무 요청>ASAP [구달] … 요청의 건_8월_TXA"
    // → 말머리 뒤의 구분기호('>' 포함)를 모두 제거
    if(k) rest = subj.replace(k.re, "").replace(/^[\s\-–—:·|>\]\)]+/, "").trim();
    if(rest) return rest;
    if(m.requester) return `${m.requester}님의 업무요청`;
    return String(m.snippet || "").trim().slice(0, 80);
  }

  // 메일 탭 표시용 제목 — '업무 전달'만 '담당자 배정'으로 바꿔 보여줌
  // ('업무 요청'·'코멘트 알림'은 원문 그대로 유지)
  function displaySubject(s){
    return String(s || "").replace(/업무\s*전달/, "담당자 배정");
  }

  function notifyNewMailFor(messages, freshIds, count){
    if(typeof window.timerAPI === "undefined" || !window.timerAPI.notify) return;
    const fresh = (messages || []).filter(m => freshIds.indexOf(m.id) !== -1).sort((a,b)=>(b.ts||0)-(a.ts||0));
    const top = fresh[0];
    const mailId = top ? top.id : "";
    const title = (mailKind(top ? (top.subject || top.fullSubject) : "") || {}).label || "새 업무요청 메일";
    const body = mailBodyText(top) || (count > 1 ? `안읽은 메일 ${count}건` : "새 업무요청 메일이 도착했어요");
    window.timerAPI.notify(title, body, mailId); // 클릭 시 설정대로 열도록 id 전달
  }
  // 전체 목록(정밀) 기준으로 '아직 알리지 않은 안읽음'만 골라 알림 — 중복 방지의 핵심
  //
  // ★알림 필터는 반드시 **여기**서 건다(notifyNewMailFor 가 아니다). 이유 두 가지:
  //   ① playAlarmSound() 가 notifyNewMailFor 바깥에 있어, 거기서 걸러도 소리는 그대로 난다.
  //   ② notifiedIds 를 여기서 갱신하는데, 걸러진 메일까지 '알린 것'으로 기록해 버리면
  //      나중에 그 종류를 다시 켜도 그 사이 쌓인 메일은 영영 알림이 오지 않는다.
  //   → notifiedIds 에는 **알림 대상만** 넣는다. 그래야 필터를 되돌렸을 때 그때 한 번 알린다.
  function maybeNotifyNewMail(messages){
    if(!Array.isArray(messages)) return;
    const allowedIds = messages.filter(m => m.unread && mailNotifyOk(m)).map(m => m.id);
    const fresh = allowedIds.filter(id => !notifiedIds.has(id));
    // ★이미 알린 id 는 "읽음이 됐다"고 지우지 않는다. 지우면 위(로컬 읽음 주석)의 인덱스 지연으로
    //   같은 메일이 안읽음으로 되돌아왔을 때 **두 번째 알림**이 뜬다(실사용 제보).
    //   목록에서 아예 사라진 것만 정리한다 — 새 메일 판정은 그대로 유지된다.
    const present = new Set(messages.map(m => m.id));
    const kept = [];
    notifiedIds.forEach(id => { if(present.has(id)) kept.push(id); });
    notifiedIds = new Set(kept.concat(allowedIds));
    saveNotifiedIds();
    if(fresh.length){
      if(alarmSettings.sound) playAlarmSound();
      if(alarmSettings.notify) notifyNewMailFor(messages, fresh, fresh.length);
      // 새 업무 메일 = 시트에도 뭔가 바뀌었을 가능성이 크다 — 10분 주기를 기다리지 않고 한 번 받는다
      if(typeof doSync === "function" && !isEditingNow()) doSync({ silent:true });
    }
  }
  function openSheet(){
    const url = "https://docs.google.com/spreadsheets/d/18K3NKAkZwGvxS_QMV5boGNJtmay1ZJ_4xBs26SZZ_Bc/edit?gid=719745109#gid=719745109";
    if(typeof window.timerAPI !== "undefined" && window.timerAPI.openExternal) window.timerAPI.openExternal(url);
    else window.open(url, "_blank");
  }

  // ★인자를 생략하면 현재 목록에서 직접 센다(필터 반영). 호출부가 6곳이라 각자 세게 두면
  //   화면 배지와 트레이 점·Dock 배지가 어긋난다 — 세는 곳을 여기 하나로 모은다.
  //   숫자를 넘기는 건 목록과 무관한 경우(연결 해제 시 0)뿐이다.
  function setMailBadge(n){
    const count = (typeof n === "number") ? n : visibleUnreadCount();
    const b = $("mail-badge"); if(!b) return;
    if(count > 0){
      b.textContent = count > 99 ? "99+" : String(count);
      b.hidden = false; b.style.display = "inline-flex";
      void b.offsetWidth; // 강제 reflow — 즉시 그려지게(리사이즈 전에도 표시)
    } else {
      b.hidden = true; b.style.display = "none";
    }
    // 트레이/작업표시줄 빨간 점 (알림 자체는 maybeNotifyNewMail에서 ID 기준으로 처리)
    if(typeof window.timerAPI !== "undefined" && window.timerAPI.updateMailUnread){
      window.timerAPI.updateMailUnread(count, { notify: !!alarmSettings.notify, sound: !!alarmSettings.sound });
    }
  }
  // ── 메일 화면 ──
  let mailMode = false, mailData = [], mailLatestFirst = true, mailLoading = false;
  // 캐시가 있으면 시작 시 즉시 배지/목록 데이터 복원 (백그라운드 갱신 전까지 빈 화면 방지)
  (function(){ try { const c = loadMailCache(); if(c && Array.isArray(c.messages)){ mailData = c.messages; setMailBadge(); mailData.filter(m=>m.unread && mailNotifyOk(m)).forEach(m=> notifiedIds.add(m.id)); saveNotifiedIds(); lastBadgeCount = c.unreadCount || 0; } } catch(e){} })();

  // 메일 새로고침 주기 단계값 — 5초만 예외적으로 촘촘하고, 10초부터는 10초 간격
  const POLL_STEPS = [5, 10, 20, 30, 40, 50, 60];
  function snapPollSec(v){
    v = Number(v);
    if(!v || isNaN(v)) return 10;
    // 목록에 없는 값(구버전 설정 등)은 가장 가까운 단계로 맞춤
    return POLL_STEPS.reduce(function(a,b){ return Math.abs(b-v) < Math.abs(a-v) ? b : a; }, POLL_STEPS[0]);
  }
  function pollIndex(sec){ const i = POLL_STEPS.indexOf(snapPollSec(sec)); return i < 0 ? 1 : i; }

  // 메일 설정 (주기/개수) — localStorage 저장
  let mailSettings = loadMailSettings();
  function loadMailSettings(){
    try {
      const s = JSON.parse(localStorage.getItem("mailSettings") || "{}");
      const mode = (["gmail","intranet","both"].includes(s.openMode)) ? s.openMode : "gmail";
      return { pollSec: snapPollSec(s.pollSec), fetchCount: clampStep(s.fetchCount, 50, 300, 100), openMode: mode };
    } catch(e){ return { pollSec: 10, fetchCount: 100, openMode: "gmail" }; }
  }
  function clampStep(v, min, max, def){ v = Number(v); if(!v || isNaN(v)) return def; return Math.min(max, Math.max(min, v)); }
  function saveMailSettings(){ try { localStorage.setItem("mailSettings", JSON.stringify(mailSettings)); } catch(e){} }
  function onMailOpenMode(v){ if(!["gmail","intranet","both"].includes(v)) return; mailSettings.openMode = v; saveMailSettings(); }
  function onPollSlide(v){ const sec = POLL_STEPS[Number(v)] || 10; mailSettings.pollSec = sec; $("msl-poll-val").textContent = sec + "초"; saveMailSettings(); restartMailPoll(); }
  function onCountSlide(v){ mailSettings.fetchCount = Number(v); $("msl-count-val").textContent = v + "개"; saveMailSettings(); }
  function syncMailSliders(){
    const p = $("msl-poll"), c = $("msl-count");
    if(p){ p.value = pollIndex(mailSettings.pollSec); $("msl-poll-val").textContent = mailSettings.pollSec + "초"; }
    if(c){ c.value = mailSettings.fetchCount; $("msl-count-val").textContent = mailSettings.fetchCount + "개"; }
    setSeg("seg-mail-open", mailSettings.openMode || "gmail");
  }

  // 메일 자동 새로고침(폴링) — 주기마다 안읽음 배지 갱신, 메일 화면 열려있으면 목록도 갱신
  let mailPollTimer = null;
  function restartMailPoll(){
    if(mailPollTimer) clearInterval(mailPollTimer);
    if(typeof window.timerAPI === "undefined") return;
    mailPollTimer = setInterval(mailPollTick, mailSettings.pollSec * 1000);
  }
  async function mailPollTick(){
    if(isEditingNow()) return;                 // 입력·모달 중엔 건너뜀
    try {
      const st = await window.timerAPI.gmailStatus();
      if(!(st && st.connected)) return;
      loadMail(true); // 탭 무관 단일 경로: 캐시 덕에 콜 2번이면 끝 → 배지·목록·알림이 항상 같은 데이터로 갱신
    } catch(e){}
  }

  async function openMail(){
    if(typeof window.timerAPI === "undefined"){ toast("앱에서만 동작해요"); return; }
    if(mailMode){ exitMailMode(); return; } // 토글: 이미 메일 화면이면 타이머로
    const st = await window.timerAPI.gmailStatus();
    if(!(st && st.connected)){
      toast("브라우저에서 로그인해 주세요…");
      const r = await window.timerAPI.gmailLogin();
      if(!(r && r.ok)){ toast(gmailErrText(r), "err"); return; }
      toast(`메일 연결 완료: ${r.email}`);
    }
    enterMailMode();
    if(mailData.length){ renderMailList(); loadMail(true); } // 캐시 즉시 표시 + 조용히 백그라운드 갱신
    else loadMail();                                          // 캐시 없으면(첫 로딩) 로딩 표시
  }
  function enterMailMode(){ mailMode = true; document.body.classList.add("mail-mode"); setMailIcon(true); checkStatsOverlap(); }
  function exitMailMode(){ mailMode = false; document.body.classList.remove("mail-mode"); setMailIcon(false); checkStatsOverlap(); }

  const MAIL_SVG  = '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.6 7l8.4 6 8.4-6"/>';
  const CLOCK_SVG = '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>';
  // 타이머→메일: 시계방향 회전 / 메일→타이머: 반시계방향 회전 (중간점에서 글리프 교체)
  const mailBtnIconState = { rot: 0, t: null };
  function setMailIcon(isMailView){
    const icon = $("mail-icon"), label = $("mail-label");
    if(!icon) return;
    mailBtnIconState.rot += isMailView ? 180 : -180; // 메일로=시계방향(+), 타이머로=반시계방향(-)
    icon.style.transform = "rotate(" + mailBtnIconState.rot + "deg)";
    const need = (((mailBtnIconState.rot % 360) + 360) % 360) === 180; // 음수 회전도 정확히 판정
    const inner = isMailView ? CLOCK_SVG : MAIL_SVG;
    if(label) label.textContent = isMailView ? "타이머" : "메일";
    const mb = document.querySelector(".mail-btn"); if(mb) mb.setAttribute("title", isMailView ? "타이머로" : "메일");
    clearTimeout(mailBtnIconState.t);
    mailBtnIconState.t = setTimeout(() => {
      icon.innerHTML = need ? '<g transform="rotate(180 12 12)">' + inner + "</g>" : inner;
    }, 180);
  }

  // 메일 아이콘 ↔ 스피너: Slate 테마전환과 동일한 회전+중간교체 모션
  const MS_MAIL = '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.6 7l8.4 6 8.4-6"/>';
  const MS_SPIN = '<circle class="ms-spin-arc" cx="12" cy="12" r="8" stroke-dasharray="38 16"/>';
  const msIconState = { rot: 0, t: null };
  function spinMailIcon(toSpinner){
    const svg = document.getElementById("ms-ic-svg");
    if(!svg) return;
    msIconState.rot += 180;
    svg.style.transform = "rotate(" + msIconState.rot + "deg)";
    const need = (msIconState.rot % 360) === 180;
    const inner = toSpinner ? MS_SPIN : MS_MAIL;
    clearTimeout(msIconState.t);
    msIconState.t = setTimeout(() => {
      svg.innerHTML = need ? '<g transform="rotate(180 12 12)">' + inner + "</g>" : inner;
    }, 210);
  }

  // 카운트 ↔ '불러오는 중' B 슬라이드 제어
  function mailCountLoading(){ const el = $("mh-count"); if(el) el.classList.add("is-loading"); }
  function setMailCountText(t){ const c = $("mhc-count"); if(c) c.textContent = t; const el = $("mh-count"); if(el) el.classList.remove("is-loading"); }
  // 메일 캐시 (즉시 표시 → 백그라운드 갱신)
  function saveMailCache(){ try { localStorage.setItem("mailCache", JSON.stringify({ messages: mailData, unreadCount: mailData.filter(m=>m.unread).length, ts: Date.now() })); } catch(e){} }
  function loadMailCache(){ try { return JSON.parse(localStorage.getItem("mailCache") || "null"); } catch(e){ return null; } }

  let mailLoadPromise = null, mailSpinOn = false;
  function showMailLoading(){ if(!mailSpinOn){ mailSpinOn = true; spinMailIcon(true); mailCountLoading(); } }
  function hideMailLoading(){ if(mailSpinOn){ mailSpinOn = false; spinMailIcon(false); } }
  let lastMailSig = "";
  async function loadMail(silent){
    if(mailLoading && mailLoadPromise){
      // 이미 불러오는 중: 요청을 버리지 않고 진행 중인 로딩에 합류.
      // 수동 요청이면 즉시 로딩 표시를 켜고, 끝나면 같은 결과를 공유받음.
      if(!silent) showMailLoading();
      return mailLoadPromise;
    }
    mailLoading = true;
    if(!silent) showMailLoading();
    const loud = () => !silent || mailSpinOn; // 합류한 수동 요청이 있으면 실패 표시도 보여줌
    mailLoadPromise = (async () => {
    try {
      const res = await window.timerAPI.gmailList({ max: mailSettings.fetchCount });
      if(res && res.ok){
        mailData = applyLocalRead(res.messages || []);
        setMailBadge();   // 서버 카운트 대신 필터 반영된 목록에서 센다
        lastBadgeCount = res.unreadCount; // 정밀 값으로 폴링 기준 동기화(경량/정밀 불일치 방지)
        // 10초 폴링이 대부분 같은 목록을 받는다 — 같으면 100건 다시 그리기·캐시 다시 쓰기를 건너뛴다.
        // 「n분 전」 글자는 아래 1분 타이머가 따로 고친다(목록 전체를 다시 그리지 않음).
        const sig = mailData.map(m => m.id + (m.unread ? "u" : "r")).join(",");
        if(loud() || sig !== lastMailSig) renderMailList();   // loud: 합류한 수동 새로고침이 있으면 「불러오는 중」 표시를 걷어야 한다
        lastMailSig = sig;
        maybeNotifyNewMail(mailData); // 정밀 목록 기준 새 메일만 알림(중복 방지)
      } else if(res && res.error === "not-connected"){
        lastMailSig = "";   // 안내 문구를 띄웠으면 다음 성공 때 반드시 다시 그린다
        if(loud()){ setMailCountText(""); $("mail-list").innerHTML = `<div class="mail-empty">메일이 연결되지 않았어요<div class="me-sub">설정에서 메일을 연결해 주세요</div></div>`; }
      } else {
        lastMailSig = "";
        if (res && res.error && res.error !== lastMailErr) { lastMailErr = res.error; logError("mail-list", res.error); }
        if(loud()){ setMailCountText(""); $("mail-list").innerHTML = `<div class="mail-empty">메일을 불러오지 못했어요<div class="me-sub">잠시 뒤 자동으로 다시 시도해요</div></div>`; }
      }
    } catch(e){
      lastMailSig = "";
      if (String(e) !== lastMailErr) { lastMailErr = String(e); logError("mail-list", e); }
      if(loud()){ setMailCountText(""); $("mail-list").innerHTML = `<div class="mail-empty">메일을 불러오지 못했어요<div class="me-sub">잠시 뒤 자동으로 다시 시도해요</div></div>`; }
    } finally {
      mailLoading = false; hideMailLoading();
    }
    })();
    return mailLoadPromise;
  }

  setInterval(() => { document.querySelectorAll(".mail-time[data-ts]").forEach(el => { const v = fmtMailTime(+el.dataset.ts); if (el.textContent !== v) el.textContent = v; }); }, 60000);
  let lastMailErr = "";
  function toggleMailSort(){
    mailLatestFirst = !mailLatestFirst;
    $("mh-toggle").classList.toggle("on", mailLatestFirst); $("mh-toggle").setAttribute("aria-checked", mailLatestFirst ? "true" : "false");
    renderMailList();
  }

  // 상대+날짜 혼합 (폭 고정으로 레이아웃 안 흔들림)
  function fmtMailTime(ts){
    if(!ts) return "";
    const now = Date.now(), diff = now - ts, d = new Date(ts);
    const min = 60000, hr = 3600000, day = 86400000;
    if(diff < min) return "방금";
    if(diff < hr) return Math.floor(diff/min) + "분 전";
    if(diff < day) return Math.floor(diff/hr) + "시간 전";
    const today = new Date(); today.setHours(0,0,0,0);
    const that = new Date(ts); that.setHours(0,0,0,0);
    const dayDiff = Math.round((today - that) / day);
    if(dayDiff === 1) return "어제";
    if(d.getFullYear() === new Date().getFullYear()) return `${d.getMonth()+1}/${d.getDate()}`;
    return `${String(d.getFullYear()).slice(2)}. ${d.getMonth()+1}/${d.getDate()}`;
  }

  async function trashMail(id){
    const idx = mailData.findIndex(m => m.id === id);
    if(idx < 0) return;
    const removed = mailData[idx];
    mailData.splice(idx, 1);              // 낙관적 제거
    renderMailList();
    setMailBadge();
    if(typeof window.timerAPI === "undefined" || !window.timerAPI.gmailTrash){ toast("앱에서만 삭제돼요"); return; }
    const r = await window.timerAPI.gmailTrash(id);
    if(r && r.ok){ toast("메일을 휴지통으로 옮겼어요"); }
    else { mailData.splice(idx, 0, removed); renderMailList(); setMailBadge(); toast("삭제 실패 — 되돌렸어요"); }
  }

  function renderMailList(){
    const host = $("mail-list");
    // '목록에서도 숨기기'를 고른 경우에만 걸러진다. 캐시는 원본 mailData 로 저장한다 —
    // 필터는 표시 단계에서만 적용해야 설정을 되돌렸을 때 메일이 되살아난다.
    const shown = visibleMail();
    const unread = shown.filter(m=>m.unread).length;
    setMailCountText(shown.length ? `${shown.length}건 · 안읽음 ${unread}` : "0건");
    saveMailCache();
    if(!shown.length){
      host.innerHTML = mailData.length
        ? `<div class="mail-empty">받기로 한 종류의 메일이 없어요<div class="me-sub">설정 → 알람 → 받을 메일 종류에서 바꿀 수 있어요</div></div>`
        : `<div class="mail-empty">업무요청 메일이 없어요</div>`;
      return;
    }
    let list = shown.slice().sort((a,b)=> b.ts - a.ts); // 기본 최신순(ON)
    if(!mailLatestFirst){
      list.sort((a,b)=>{
        if(a.unread !== b.unread) return a.unread ? -1 : 1; // OFF: 안읽음 먼저
        return b.ts - a.ts;
      });
    }
    const focusId = document.activeElement && host.contains(document.activeElement) ? (document.activeElement.closest(".mail-item") || {}).dataset?.id : null;
    host.innerHTML = list.map(m => `
      <div class="mail-item${m.unread?' unread':''}" data-id="${esc(m.id)}" role="button" tabindex="0" aria-label="${m.unread ? "안 읽음 · " : ""}${esc(displaySubject(m.subject) || "(제목 없음)")}${m.requester ? " · " + esc(m.requester) + "님" : ""}" onclick="openMailItem('${m.id}')">
        <div class="mail-dot-col"><span class="mail-udot"></span></div>
        <div class="mail-main">
          <div class="mail-subject">${esc(displaySubject(m.subject) || "(제목 없음)")}</div>
          <div class="mail-meta">${m.requester ? `<span class="mail-requester">${esc(m.requester)}님</span> 업무요청` : "업무요청"}</div>
        </div>
        <div class="mail-right">
          <div class="mail-time" data-ts="${+m.ts || 0}">${esc(fmtMailTime(m.ts))}</div>
          <button class="mail-trash" title="삭제" onclick="event.stopPropagation(); trashMail('${m.id}')">${IC.trash}</button>
        </div>
      </div>
    `).join("");
    // 키보드로 연 항목을 다시 그리면 포커스가 body 로 떨어진다 — 같은 메일로 되돌린다
    if (focusId) { const el = [...host.querySelectorAll(".mail-item")].find(x => x.dataset.id === focusId); if (el) el.focus({ preventScroll: true }); }
  }

  async function openMailItem(id){
    const m = mailData.find(x=>x.id===id);
    // m이 목록에 없어도(알림 클릭 등) id만으로 동작하도록 Gmail 링크 구성
    const gmailLink = (m && m.link) || `https://mail.google.com/mail/u/0/#all/${id}`;
    // 낙관적: 읽음 처리 + 배지/목록 갱신
    if(m && m.unread){
      m.unread = false;
      markLocallyRead(id);   // 폴링이 옛 안읽음을 실어와도 화면이 안 되돌아가게
      setMailBadge();
      renderMailList();
    }
    // 읽음 처리는 기다리지 않는다(링크가 먼저 열려야 한다). 다만 실패는 알린다 —
    // 예전엔 조용히 삼켜서, 읽음이 됐다가 나중에 되돌아오는 이유를 알 수 없었다.
    window.timerAPI.gmailMarkRead(id).then(rr => {
      if(rr && rr.ok) return;
      unmarkLocallyRead(id);
      const cur = mailData.find(x => x.id === id);
      if(cur){ cur.unread = true; setMailBadge(); renderMailList(); }
      toast("읽음 처리에 실패했어요 — 다시 눌러 주세요");
    }).catch(() => {});
    const mode = (mailSettings && mailSettings.openMode) || "gmail";
    // Gmail 웹에서 열기
    if(mode === "gmail" || mode === "both"){
      window.timerAPI.openExternal(gmailLink);
    }
    // 메일 본문에 담긴 인트라넷 요청글 열기
    if(mode === "intranet" || mode === "both"){
      try {
        const r = await window.timerAPI.gmailIntranetLink(id);
        if(r && r.ok && r.url){
          window.timerAPI.openExternal(r.url);
        } else if(mode === "intranet"){
          // 인트라넷 전용인데 링크를 못 찾음 → Gmail로 폴백
          toast("요청글 링크를 못 찾아 Gmail을 열어요", "err");
          window.timerAPI.openExternal(gmailLink);
        }
      } catch(e){
        if(mode === "intranet"){ window.timerAPI.openExternal(gmailLink); }
      }
    }
  }

  function openAdd() {
    if(isReadonly()){ toast("다른 팀원 보드는 읽기 전용이에요"); return; } 
    editingId=null; selDl=null;
    selAlarm = alarmSettings.defaultAlarm ? Number(alarmSettings.defaultAlarm) : null;
    $("modal-title").textContent="작업추가"; $("f-title").value="";
    $("f-reqlink").value=""; $("f-planlink").value="";
    $("dl-prev-main").style.display="none"; $("custom-row-main").classList.remove("show");
    resetCal("main");
    renderChips("chip-grid", ts=>{selDl=ts; showPrev(ts,"main");});
    renderAlarms();
    openModal("modal-task");
    setTimeout(()=>$("f-reqlink").focus(),100);
  }
  // ── 팝업이 붙잡은 작업 다시 찾기 ──
  // 카드 id 는 시트 행 번호다. 팝업(편집·완료·마감)이 떠 있는 사이 목록을 다시 받으면 — 다른 카드를 지운 직후의
  // 동기화가 대표적 — 아래 카드들이 한 칸씩 당겨져 같은 id 가 **다른 작업**을 가리킨다. 그대로 확정하면 서버 지문
  // 검사(그 작업의 제목을 그대로 보냄)도 통과해 엉뚱한 카드가 완료·수정된다. 열 때의 제목·링크를 적어 두고 확정할 때 대조한다.
  // 같은 제목·같은 링크가 여러 줄(쌍둥이)이면 열 때 「몇 줄 중 몇 번째」였는지도 적는다 — 줄 수가 달라졌으면 어느 줄인지 알 수 없다.
  function pinLike(pin){
    // 방금 추가해 아직 행 번호가 없는 카드(_temp, id 가 음수)는 맨 뒤로 — 서버는 새 작업을 마지막 작업 다음 행에 넣는다
    const at = x => x._temp ? Infinity : (x._row || x.id);
    return tasks.filter(x => String(x.title || "").trim() === pin.title && (x.reqLink || "") === pin.link)
                .sort((a, b) => { const p = at(a), q = at(b); return p === q ? 0 : p < q ? -1 : 1; });
  }
  function pinOf(t){
    const pin = { ref: t, title: String(t.title || "").trim(), link: t.reqLink || "" };
    const like = pinLike(pin);
    pin.n = like.length; pin.k = like.indexOf(t);
    pin.rows = like.map(x => x._temp ? null : (x._row || x.id));   // 열 때 각 줄의 행 번호(임시 카드는 아직 없다)
    return pin;
  }
  function findPinned(id, pin){
    if(!pin) return tasks.find(x => x.id === id) || null;
    // 목록이 교체되지 않았다 — 같은 객체가 곧 같은 카드다(그 사이 낙관적 편집이 제목을 바꿨다 되돌려도 흔들리지 않는다)
    if(tasks.includes(pin.ref)) return pin.ref;
    const like = pinLike(pin);                   // 목록이 새로 들어왔다 — 행은 밀렸을 수 있으니 제목·링크로 다시 찾는다
    if(like.length !== pin.n || pin.k < 0) return null;
    // 쌍둥이(같은 제목·링크 여러 줄): 줄 수가 같아도 구성이 바뀌었을 수 있다(한 줄이 지워지고 맨 아래에 새로 들어옴) — 그러면 k 번째는
    // 다른 줄이다. 모든 줄이 같은 폭으로 밀렸을 때만 같은 구성으로 본다(임시 카드였던 줄은 비교에서 뺀다).
    if(pin.n > 1){
      const d = [];
      like.forEach((x, i) => { if(pin.rows[i] != null) d.push((x._temp ? NaN : (x._row || x.id)) - pin.rows[i]); });
      if(d.some(v => v !== d[0])) return null;
    }
    return like[pin.k];
  }
  const PIN_LOST = "그 사이 목록이 바뀌었어요 — 다시 눌러 주세요";
  let editingPin = null, duePin = null;

  function openEdit(id) {
    if(isReadonly()){ toast("다른 팀원 보드는 읽기 전용이에요"); return; }
    const t=tasks.find(x=>x.id===id);
    editingId=id; editingPin=pinOf(t); selDl=t.deadline; selAlarm=t.alarm;
    $("modal-title").textContent="작업편집"; $("f-title").value=t.title;
    $("f-reqlink").value=t.reqLink||""; $("f-planlink").value=t.planLink||"";
    $("custom-row-main").classList.remove("show");
    $("cal-pop-main").classList.remove("show");
    // 직접 입력에 현재 마감 날짜·시간을 미리 채워둠 (마감편집과 동일)
    (function(){
      const d = new Date(t.deadline);
      calState.main.view = new Date(d.getFullYear(), d.getMonth(), 1);
      const sel = new Date(d.getFullYear(), d.getMonth(), d.getDate()); sel.setHours(0,0,0,0);
      calState.main.sel = sel.getTime();
      const days = ["일","월","화","수","목","금","토"];
      $("cal-trig-text-main").textContent = `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`;
      $("cal-trig-main").classList.add("has");
      $("time-main").value = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    })();
    renderChips("chip-grid", ts=>{selDl=ts; showPrev(ts,"main");});
    renderAlarms(); showPrev(t.deadline,"main");
    openModal("modal-task");
  }



  // 퇴장 모션 — 등장은 fade 0.2s + up 0.3s 인데 닫을 때는 0ms 하드컷이었다.
  // .show 를 유지한 채 .closing 을 얹고(오버레이가 display:flex 로 남아야 애니메이션이 보인다),
  // 끝나면 둘 다 뗀다. ★.closing 은 pointer-events:none 이라 그 사이 [저장]이 두 번 눌리지 않는다.
  const MODAL_EXIT_MS = 160;
  const modalExitTimers = {};   // id → 진행 중인 퇴장 타이머
  function closeModal(id){
    const el = $(id); if(!el) return;
    if(typeof closeColorPicker==="function") closeColorPicker();
    if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if(modalExitTimers[id]){ clearTimeout(modalExitTimers[id]); modalExitTimers[id] = null; }
    const back = modalReturnFocus[id]; modalReturnFocus[id] = null;
    if (back && back.isConnected && back.focus) setTimeout(() => { if (!anyModalOpen()) back.focus(); }, 0);
    if(!el.classList.contains("show")){ el.classList.remove("closing"); return; }
    if(reducedMotion()){ el.classList.remove("show"); el.classList.remove("closing"); return; }
    el.classList.add("closing");
    modalExitTimers[id] = setTimeout(() => {
      modalExitTimers[id] = null;
      // ★그 사이 다시 열렸으면 건드리지 않는다 — 아니면 방금 연 모달이 사라진다.
      if(!el.classList.contains("closing")) return;
      el.classList.remove("show"); el.classList.remove("closing");
    }, MODAL_EXIT_MS);
  }
  // ★모달을 열 땐 반드시 이걸 쓴다. 퇴장 타이머를 취소하고 .closing 을 떼지 않으면
  //   닫자마자 다시 여는 경로에서 (a) 새로 연 모달이 곧바로 사라지거나
  //   (b) fadeOut(forwards) 이 남아 투명한 채로 열린다. 둘 다 실측으로 확인했다.
  const modalReturnFocus = {};   // id → 창을 열기 전 포커스(닫을 때 되돌린다)
  function openModal(id){
    const el = $(id); if(!el) return;
    if(modalExitTimers[id]){ clearTimeout(modalExitTimers[id]); modalExitTimers[id] = null; }
    const was = document.activeElement;
    if (!el.classList.contains("show") && was && was !== document.body && !el.contains(was)) modalReturnFocus[id] = was;
    el.classList.remove("closing");
    el.classList.add("show");
    // 첫 글자 입력칸에 커서. 설정 창은 입력칸이 아래쪽이라 창이 스크롤되므로 뺀다.
    if (id !== "modal-settings" && !el.contains(document.activeElement)) {
      const inp = el.querySelector('input[type="text"]:not([disabled]), input:not([type]):not([disabled]), textarea:not([disabled])');
      if (inp && inp.offsetParent) inp.focus();
    }
  }
  // ★"열려 있는가"는 반드시 이걸로 판정한다. 퇴장 애니메이션 중(.closing)에는
  //   .show 가 160ms 더 남아 있는데, 그걸 열림으로 읽으면
  //   ESC·설정 단축키가 그 사이 삼켜지고, 키 리피트(~30ms)에서는 손 뗄 때까지 안 풀린다.
  function modalShown(el){
    return !!(el && el.classList.contains("show") && !el.classList.contains("closing"));
  }
  function reducedMotion(){
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch(e){ return false; }
  }

  function toggleCustom(scope){ $(`custom-row-${scope}`).classList.toggle("show"); }

  // 캘린더
  const calState = { main:{view:new Date(),sel:null}, import:{view:new Date(),sel:null}, edit:{view:new Date(),sel:null} };
  function toggleCal(scope) {
    const pop=$(`cal-pop-${scope}`); const open=pop.classList.contains("show");
    document.querySelectorAll(".cal-pop").forEach(p=>p.classList.remove("show"));
    if(!open){ renderCal(scope); pop.classList.add("show"); }
  }
  function renderCal(scope) {
    const st=calState[scope]; const pop=$(`cal-pop-${scope}`);
    const y=st.view.getFullYear(), mo=st.view.getMonth();
    const startDow=new Date(y,mo,1).getDay();
    const dim=new Date(y,mo+1,0).getDate();
    const today=new Date(); today.setHours(0,0,0,0);
    const dows=["일","월","화","수","목","금","토"];
    let h=`<div class="cal-h"><div class="tt">${y}년 ${mo+1}월</div><div class="cal-nav"><button type="button" onclick="calMove(event,'${scope}',-1)">${IC.chevL}</button><button type="button" onclick="calMove(event,'${scope}',1)">${IC.chevR}</button></div></div><div class="cal-grid">`;
    dows.forEach((d,i)=>{ h+=`<div class="cal-dow ${i===0?'sun':i===6?'sat':''}">${d}</div>`; });
    for(let i=0;i<startDow;i++) h+=`<div class="cal-d empty"></div>`;
    for(let d=1;d<=dim;d++){
      const cur=new Date(y,mo,d); cur.setHours(0,0,0,0);
      const dow=cur.getDay();
      const holiday=getHoliday(y,mo,d);
      let cls="cal-d";
      if(cur.getTime()===today.getTime())cls+=" today";
      if(cur.getTime()<today.getTime())cls+=" past";
      if(st.sel&&cur.getTime()===st.sel)cls+=" sel";
      if(holiday||dow===0)cls+=" holiday";
      else if(dow===6)cls+=" sat";
      const title=holiday?` title="${esc(holiday)}"`:"";  // 공휴일 이름은 공공데이터 API 응답값
      h+=`<button type="button" class="${cls}"${title} onclick="calPick(event,'${scope}',${y},${mo},${d})">${d}${holiday?'<span class="hdot"></span>':''}</button>`;
    }
    h+=`</div>`; pop.innerHTML=h;
  }
  function calMove(ev,scope,dir){ if(ev)ev.stopPropagation(); calState[scope].view.setMonth(calState[scope].view.getMonth()+dir); renderCal(scope); }
  function calPick(ev,scope,y,mo,d) {
    if(ev)ev.stopPropagation();
    const p=new Date(y,mo,d); p.setHours(0,0,0,0);
    calState[scope].sel=p.getTime();
    const days=["일","월","화","수","목","금","토"];
    $(`cal-trig-text-${scope}`).textContent=`${mo+1}/${d}(${days[p.getDay()]})`;
    $(`cal-trig-${scope}`).classList.add("has");
    renderCal(scope); $(`cal-pop-${scope}`).classList.remove("show");
    applyCustom(scope);
  }
  function resetCal(scope) {
    calState[scope].view=new Date(); calState[scope].sel=null;
    $(`cal-trig-text-${scope}`).textContent="날짜 선택";
    $(`cal-trig-${scope}`).classList.remove("has");
    $(`time-${scope}`).value=""; $(`cal-pop-${scope}`).classList.remove("show");
  }
  function applyCustom(scope) {
    const st=calState[scope]; const ts0=$(`time-${scope}`).value.trim();
    if(!st.sel||!ts0)return;
    const ts=normalizeTime(ts0); if(!ts)return;
    const m=ts.match(/^(\d{1,2}):(\d{2})$/); if(!m)return;
    const dt=new Date(st.sel); dt.setHours(+m[1],+m[2],0,0);
    if(scope==="main"){selDl=dt.getTime(); showPrev(selDl,"main");}
    else if(scope==="edit"){selDlEdit=dt.getTime(); showPrev(selDlEdit,"edit");}
    else{selDlImport=dt.getTime(); showPrev(selDlImport,"import");}
  }
  document.addEventListener("input", e=>{
    if(e.target.id==="time-main") applyCustom("main");
    if(e.target.id==="time-import") applyCustom("import");
    if(e.target.id==="time-edit") applyCustom("edit");
  });
  // 시간 직접입력: 엔터로도 즉시 적용 (포커스 해제 없이)
  document.addEventListener("keydown", e=>{
    if(e.key !== "Enter") return;
    const id = e.target && e.target.id;
    const scope = id==="time-main" ? "main" : id==="time-import" ? "import" : id==="time-edit" ? "edit" : null;
    if(!scope) return;
    e.preventDefault();
    e.target.value = normalizeTime(e.target.value) || e.target.value;
    applyCustom(scope);
  });
  document.addEventListener("click", e=>{
    if(!e.target.closest(".cal-pop")&&!e.target.closest(".cal-trigger"))
      document.querySelectorAll(".cal-pop").forEach(p=>p.classList.remove("show"));
  });

  async function saveTask() {
    const title=$("f-title").value.trim();
    const reqLink=$("f-reqlink").value.trim();
    const planLink=$("f-planlink").value.trim();
    if(!title){toast("제목을 입력해 주세요");return;}
    if(!selDl){toast("마감 시간을 선택해 주세요");return;}
    if(editingId){
      const t = findPinned(editingId, editingPin);
      if(!t){ closeModal("modal-task"); toast(PIN_LOST, "err"); return; }
      if(!reqLink){ toast("요청글 링크를 입력해 주세요"); return; }
      const myName = getMyName();
      if(!myName || typeof window.timerAPI === "undefined"){ toast("앱에서만 동작해요"); return; }
      closeModal("modal-task");
      const d = new Date(selDl);
      const ymdStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const hmStr  = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
      // 시간 로컬 저장 (요청글 링크 키)
      taskTimes[timeKey(reqLink, title)] = hmStr; saveTaskTimes();
      // 낙관적 반영
      const arr = tasks;
      const fp0 = taskFp(t), n0 = fpCount(arr, fp0);
      const nd = selDl, na = selAlarm;
      const apply = x => {
        const prev = { title:x.title, deadline:x.deadline, alarm:x.alarm, reqLink:x.reqLink, planLink:x.planLink };
        x.title=title; x.deadline=nd; x.alarm=na; x.reqLink=reqLink; x.planLink=planLink;
        setTaskAlarm(reqLink, title, na); // 알람 시점 로컬 저장(동기화 후 유지)
        // 제목·링크가 바뀌면 키도 바뀌므로 옛 키와 새 키를 모두 푼다 (재발화 허용)
        firedAlarms.delete(timeKey(prev.reqLink, prev.title));
        firedAlarms.delete(timeKey(reqLink, title));
        return { payload: { action:"updateTask", member:myName, title, url: reqLink, planLink, dueDate: ymdStr,
                   // ★title 은 '바꿀 새 제목'이라 지문으로 못 쓴다. 편집 **전** 원본을 보낸다(링크의 게시글 번호도 편집 전 것).
                   ...writeFp({ reqLink: prev.reqLink, title: prev.title }) },
                 undo: () => Object.assign(x, prev), okMsg: "작업을 수정했어요", failMsg: "수정 실패 — 되돌렸어요", syncAfter: true };
      };
      const first = apply(t);
      render();
      const r = await postSheetTracked(withRow(first.payload, t._row || t.id));
      if(r && r.ok){ toast("작업을 수정했어요"); await doSync({ silent:true }); }
      else { afterWriteFail(r, arr, first.undo, first.failMsg, { fp: fp0, n0, redo: apply }); } // 롤백(+ 행이 밀렸으면 한 번 재시도)
    } else {
      if(!reqLink){toast("요청글 링크를 입력해 주세요");return;}
      closeModal("modal-task");
      const myName = getMyName();
      if(!myName || typeof window.timerAPI === "undefined"){ toast("앱에서만 추가돼요"); return; }
      // 시트엔 날짜만 기록 (시간은 동기화 후 18:00 기본, 카드에서 개인 설정 예정)
      const d = new Date(selDl);
      const ymd = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const type = reqLink ? "req" : "manual";
      // ★임시 id 는 반드시 숫자다. 문자열이면 card() 의 onclick="openTaskReq(${t.id}, event)" 가
      //   따옴표 없이 보간돼 클릭 시 ReferenceError 가 나고, tick 의 +card.dataset.id 가 NaN 이라
      //   그 카드만 카운트다운이 멈춘다. 시트 행번호는 항상 양수라 음수와 충돌하지 않는다.
      const arrAdd = tasks;
      const temp = { id: -Date.now(), title, deadline:selDl, type, done:false, alarm:selAlarm, reqLink, planLink, _temp:true }; // ① 즉시 표시
      tasks.push(temp);
      setTaskAlarm(reqLink, title, selAlarm); // 알람 시점 로컬 저장(동기화 후 유지)
      render();
      // 방금 지운 것과 같은 작업을 다시 넣는 중이다 — 응답이 늦어(timeout) 아래 ok 가지에 못 가도 새 카드가 묘비에 가려지지 않게 먼저 걷는다
      const lifted = dropTombstones(reqLink, title);
      // 같은 링크를 여러 번 넣는 건 정상(반복 요청)이라 평소엔 중복 검사를 끈다. 단 방금 시간 초과로 끝난 추가와 같은 것이면
      // 그 추가가 실제로는 들어갔을 수 있다 — 그때만 서버 중복 검사를 켠다(두 줄 생기는 것 방지).
      const addKey = reqLink + "\n" + title;
      const r = await postSheetTracked({ // ② 시트 기록 (insert)
        targetMember: myName, title, url: reqLink, planLink, dueDate: ymd,
        dupCheck: (timedOutAdds[addKey] || 0) > Date.now() ? "1" : "0"
      });
      // 서버 중복 검사는 제목 없이 게시글 번호만 본다 — 같은 게시글 줄이 이미 있으면(반복 요청) 구별 못 하므로 그때는 켜지 않는다
      const sameIdxBefore = idxOf(reqLink) && arrAdd.some(x => x !== temp && idxOf(x.reqLink) === idxOf(reqLink));
      if(r && r.timeout && !sameIdxBefore) timedOutAdds[addKey] = Date.now() + 10 * 60000;
      else if(!(r && r.busy)) delete timedOutAdds[addKey];   // busy = 확실히 안 들어감, 앞선 시간 초과의 기억은 그대로 둔다
      if(r && r.ok){
        const dd = new Date(selDl); // 선택한 시간을 개인 저장(요청글 링크 키)
        taskTimes[timeKey(reqLink, title)] = `${String(dd.getHours()).padStart(2,"0")}:${String(dd.getMinutes()).padStart(2,"0")}`;
        saveTaskTimes();
        dropTombstones(reqLink, title);
        toast("작업을 추가했어요"); await doSync({ silent:true });
      } // ③ 행번호 reconcile
      else {
        // 추가가 안 들어갔다(timeout 은 들어갔을 수 있으니 제외) → 걷어 둔 묘비를 되돌린다. 안 그러면 낡은 응답 속 지운 카드가 다시 보인다
        if(!(r && r.timeout)) tombstones = tombstones.concat(lifted.filter(tb => tb.until > Date.now()));
        const drop = () => { const i = arrAdd.indexOf(temp); if(i >= 0) arrAdd.splice(i, 1); };
        afterWriteFail(r, arrAdd, drop, r && r.duplicate ? "방금 추가가 이미 들어가 있어요 — 목록을 다시 불러올게요" : "추가 실패 — 되돌렸어요"); // ④ 롤백
        if(r && r.duplicate) doSync({ silent:true });
      }
    }
  }
  const timedOutAdds = {};   // 「링크\n제목」 → 이 시각까지 재추가 때 중복 검사
  const timedOutMemos = {};   // 「이름\n글」 → { until, n0 } — until 까지 재추가 때 같은 글 줄 수가 n0 보다 늘었는지 먼저 본다

  // 롤백 유틸 — 되돌리는 사이에 동기화가 tasks 배열을 통째로 갈아끼웠을 수 있다.
  // 그 상태에서 옛 배열에 splice 하면 화면에 없는 '유령' 객체를 고치거나
  // 같은 data-id 카드가 두 장 생겨 FLIP 애니메이션까지 엉킨다. → 그 경우엔 서버 상태를 다시 받는다.
  function rollbackTasks(arr, undo){
    if (tasks === arr) { undo(); render(); }
    else doSync({ silent:true });
  }

  // 동기화 실패를 팀원이 알아듣는 말로. 원문은 오류 기록(error.log)에 남긴다.
  function syncErrText(e){
    const m = String((e && e.message) || e || "");
    if (window.timerAPI && window.timerAPI.logError) window.timerAPI.logError("sync: " + m);
    if (/타임아웃|timeout|abort/i.test(m)) return "동기화 실패 — 시트 응답이 늦어요. 잠시 뒤 다시 시도해 주세요";
    if (/fetch failed|ENOTFOUND|ECONN|network|ETIMEDOUT|EAI_AGAIN/i.test(m)) return "동기화 실패 — 인터넷 연결을 확인해 주세요";
    if (/HTTP 5\d\d/.test(m)) return "동기화 실패 — 시트 서버가 잠시 응답하지 않아요";
    return "동기화 실패 — 잠시 뒤 다시 시도해 주세요";
  }

  // 쓰기 실패 후처리.
  // ★타임아웃(r.timeout)은 되돌리지 않는다 — Apps Script 는 응답만 늦고 쓰기는 이미 커밋된
  //   경우가 흔해서, 되돌리면 "삭제가 취소된 것처럼" 보였다가 다음 동기화에 다시 사라진다.
  //   대신 사실대로 알리고 서버 상태를 받아 맞춘다.
  function afterWriteFail(r, arr, undo, failMsg, rt){
    if (r && r.timeout) { toast("응답이 늦어요 — 동기화로 확인할게요", "err"); doSync({ silent:true }); return; }
    if (r && r.stale && rt) { rollbackTasks(arr, undo); return retryRowWrite(r, rt); }
    if (r && r.stale) { rollbackTasks(arr, undo); handleStale(r); return; }
    rollbackTasks(arr, undo);
    toast(failMsg);
  }

  // 서버가 "그 행에 다른 게 있다"고 알려온 경우 (v56+).
  // ★같은 행 번호로 다시 보내서는 못 고친다 — 행 번호 자체가 틀렸다. 재동기화가 먼저다.
  //   지문 없이 옛 행 번호로 다시 쏘는 재시도는 위험하다(되돌릴 수 없는 삭제가 옆 행에 떨어진다).
  //   삭제만은 delTask 가 재동기화 뒤 지문(게시글 idx + 제목)으로 새 행을 찾아 한 번 다시 보낸다 —
  //   서버가 새 행에서도 같은 지문을 검사하므로 안전하다. 여기로 오는 것은 완료·마감·수정이다.
  function handleStale(r){
    const found = String((r && r.found) || "").trim();
    const msg = found
      ? `'${found.length > 20 ? found.slice(0, 20) + "…" : found}'가 그 자리에 있어요`
      : "그 자리가 비어 있어요";
    toast(msg + " — 목록을 다시 불러올게요", "err");
    doSync({ silent:true });
  }

  // B-5: 완료·마감·수정이 stale 로 거부됐을 때(위 카드가 지워져 행이 당겨진 직후가 대부분) 목록을 다시 받아
  //   누를 때와 같은 카드를 지문(게시글 번호·제목, 번호 없으면 링크 전체)으로 찾아 **한 번만** 다시 보낸다.
  //   삭제의 재시도와 같은 조건만 통과한다: 새 목록을 정말 받았고 · 내 보드를 보고 있고 · 누를 때도 지금도 그 지문
  //   (완료 여부까지 같은 것)이 한 줄뿐이고 · 그 줄의 행이 보낸 행과 다를 때. 서버가 새 행에서도 같은 지문을 다시 검사하므로
  //   옆 카드에 기록될 수 없다. 그 밖(쌍둥이 · 없어짐 · 같은 행 그대로 = 낡은 캐시)은 예전처럼 안내만 한다.
  //   rt = { fp: 누를 때(바꾸기 전) taskFp, n0: 그때 같은 지문 줄 수, redo(t) → { payload, undo, okMsg } }
  async function retryRowWrite(r, rt){
    toast("그 사이 목록이 바뀌었어요 — 확인하고 다시 보낼게요");
    const seq = syncAppliedSeq;
    await doSync({ silent:true });
    const fresh = syncAppliedSeq !== seq && !isReadonly();
    const same = fresh ? tasks.filter(x => fpMatch(x, rt.fp)) : [];
    const cur = same.length === 1 && rt.n0 === 1 ? same[0] : null;
    if (!cur || (cur._row || cur.id) === rt.fp.row) { staleToast(r, fresh); if (!fresh) doSync({ silent:true }); return; }
    const arr = tasks, again = rt.redo(cur);
    render();
    const r2 = await postSheetTracked(withRow(again.payload, cur._row || cur.id));
    if (r2 && r2.ok) { toast(again.okMsg); if (again.syncAfter) await doSync({ silent:true }); }
    else afterWriteFail(r2, arr, again.undo, again.failMsg);   // 두 번째 실패는 재시도 없이 예전 안내
  }
  function staleToast(r, fresh){
    const found = String((r && r.found) || "").trim();
    const msg = found
      ? `'${found.length > 20 ? found.slice(0, 20) + "…" : found}'가 그 자리에 있어요`
      : "그 자리가 비어 있어요";
    toast(msg + (fresh ? " — 목록을 다시 불러왔어요" : " — 목록을 다시 불러올게요"), "err");
  }
  // 요청 키 순서를 예전과 같게(action·member·row 다음 나머지) — 기록·시험이 비교하기 쉽게
  function withRow(p, row){ return Object.assign({ action: p.action, member: p.member, row }, p); }
  // 누를 때 같은 지문이 몇 줄이었나(쌍둥이면 재시도하지 않는다). 완료 여부는 세지 않는다 — 서버 지문이 완료 여부를 안 봐서
  // 완료·미완료 쌍둥이 중 엉뚱한 줄이 통과할 수 있다(v1.0.43 검수).
  function fpCount(arr, fp){ return arr.filter(x => fpMatch(x, fp)).length; }

  // 요청글 링크에서 게시글 고유번호. 지문으로 쓴다(제목만으로는 겹칠 수 있다).
  function idxOf(url){
    const m = String(url || "").match(/idx=(\d+)/);
    return m ? m[1] : "";
  }
  // 행을 고치는 쓰기(완료·마감·수정)에 실어 보내는 지문. 삭제(postDelete)와 같은 두 가지다.
  // ★제목만 보내면 「제목은 같고 게시글이 다른」 옆 카드(반복 요청)를 서버가 통과시킨다 — 행 번호가 한 칸 낡은 사이
  //   완료·마감이 옆 카드에 기록됐다(v1.0.35 검수에서 재현). 서버 v60+ 는 네 액션 모두 expectIdx 를 이미 검사한다.
  //   게시글 번호를 못 뽑으면 키를 아예 안 보낸다(빈 문자열 아님) — 서버 계약.
  function writeFp(t){
    const idx = idxOf(t.reqLink);
    // 게시글 번호가 없는 손 링크 카드는 제목만으로는 같은 제목 이웃과 구별이 안 된다 — 링크 전체를 대신 보낸다(서버 v64+ 가 비교, 옛 서버는 무시)
    return { ...(idx ? { expectIdx: idx } : (t.reqLink ? { expectLink: String(t.reqLink).trim() } : {})), expectTitle: String(t.title || "").trim() };
  }
  // 관리항목(mgmtItems)용 — 배열 교체 여부 대신 타임아웃만 가른다
  function afterMgmtWriteFail(r, undo, failMsg){
    if (r && r.timeout) { toast("응답이 늦어요 — 동기화로 확인할게요", "err"); doSync({ silent:true }); return; }
    if (r && r.error && window.timerAPI && window.timerAPI.logError) window.timerAPI.logError("mgmt-write: " + r.error);
    // 서버가 「그 행은 작업 행·이름 행·구분선」이라고 거부했다 = 내 행 번호가 낡았다(지문 없는 경로). stale 과 같게 다시 받는다.
    if (r && !r.stale && /영상작업\(링크 보유\)|이름 행·구분선/.test(String(r.error || ""))) r = Object.assign({}, r, { stale: true });
    if (r && r.stale) { undo(); renderMgmt(); toast("그 사이 목록이 바뀌었어요 — 다시 불러올게요", "err"); doSync({ silent:true }); return; }
    undo(); renderMgmt(); toast(failMsg);
  }

  let delInFlight = false;   // 연타 방지 — 낡은 _row 로 두 번째 요청이 나가면 엉뚱한 행이 지워진다
  // 카드 휴지통 = 확인 후 삭제(시트 행이 바로 지워지고 앱 안에서 되돌릴 길이 없다). delTask 는 확인 없이 지우는 본체.
  function askDelTask(id){
    if(isReadonly()){ toast("다른 팀원 보드는 읽기 전용이에요"); return; }
    if(delInFlight){ toast("앞선 삭제를 처리하고 있어요 — 잠시 후 다시 눌러 주세요"); return; }
    const t = tasks.find(x=>x.id===id); if(!t) return;
    // 확인 창이 떠 있는 사이 목록이 당겨지면 id 가 옆 카드를 가리킨다 — 다른 팝업처럼 findPinned 로 다시 찾는다.
    const pin = pinOf(t);
    openConfirm("작업 삭제", `「${t.title}」을(를) 삭제할까요? 시트에서도 지워져요.`, "삭제", () => {
      const cur = findPinned(t.id, pin);
      if(cur) delTask(cur.id); else toast(PIN_LOST, "err");
    });
  }
  async function delTask(id){
    if(isReadonly()){ toast("다른 팀원 보드는 읽기 전용이에요"); return; }
    // 잠금은 재동기화·재시도까지 이어져 몇 초가 될 수 있다 — 말없이 무시하면 고장으로 읽힌다
    if(delInFlight){ toast("앞선 삭제를 처리하고 있어요 — 잠시 후 다시 눌러 주세요"); return; }
    const t = tasks.find(x=>x.id===id); if(!t) return;
    const myName = getMyName();
    if(!myName || typeof window.timerAPI === "undefined"){ toast("앱에서만 동작해요"); return; }
    const arr = tasks, idx = tasks.indexOf(t), len0 = tasks.length;
    const fp = taskFp(t);
    // 누르는 순간 내 목록의 건수(누른 카드 포함). stale 뒤 새 목록과 견줘 「이미 지워졌다 / 행만 밀렸다」를 가린다.
    const twins = arr.filter(x => fpMatch(x, fp));
    const n0 = twins.length, nDone0 = twins.filter(x => !!x.done === fp.done).length;
    const post0 = fp.idx ? arr.filter(x => idxOf(x.reqLink) === fp.idx).length : 0;   // 같은 게시글의 줄 수
    let bottom = !arr.some(x => x !== t && (x._row || x.id) > fp.row);                // 맨 아래 카드인가(buryDeleted 참조)
    const drop0 = syncDropSeq, syncing0 = syncInFlight;                               // 이 삭제와 겹친 내 읽기가 있었나
    delInFlight = true;
    pendingDeletes.push(fp);                       // 끝날 때까지 어떤 목록을 받아도 이 작업은 숨긴다
    try {
      tasks.splice(idx, 1); render();              // ① 즉시 제거
      toast("작업을 삭제했어요");
      let r = await postDelete(myName, fp);        // ② 시트 기록
      let resynced = false;
      if(r && (r.stale || r.busy)){
        // ③ 행이 밀렸거나(stale) 락을 못 잡았다(busy) — 둘 다 쓰기는 일어나지 않았다.
        //    예전엔 여기서 되돌려 카드가 다시 나타났고 사용자가 한 번 더 눌러야 했다(2026-11-20 제보).
        //    새 목록을 받아 같은 지문(게시글 idx + 제목)의 건수를 누를 때와 견준다.
        //    · 줄었다 → 누른 그 줄은 이미 지워졌다. 다시 보내지 않는다 — 남은 줄은 누르지 않은 쌍둥이인데
        //      서버 지문 검사는 쌍둥이를 구별하지 못해 그대로 지워 버린다. 다만 같은 게시글의 줄 수가 그대로면
        //      지워진 게 아니라 제목이 고쳐진 것이므로 성공으로 넘기지 않는다(게시글 번호가 없으면 구별 불가 — 성공 처리).
        //    · 안 줄었고, 누를 때도 지금도 (완료 여부까지 같은 줄이) 하나뿐 → 행만 밀렸다. 그 행으로 한 번만 다시 보낸다.
        //    · 그 밖 → 어느 줄인지 알 수 없다. 사용자에게 돌려준다.
        const seq = syncAppliedSeq;
        await doSync({ silent:true });
        resynced = syncAppliedSeq !== seq;         // 실패했거나 다른 쓰기와 겹쳐 버려졌으면 옛 목록 그대로다
        const me = resynced && (allMembersData || []).find(x => x.name === myName);
        const mine = me && !me.error ? dropBuried(mapVideoTasks(me)) : null;   // 행 번호는 묘비가 바로잡은 값으로 읽는다
        // 서버가 내 단을 못 찾으면 { error, video:[] } 를 준다 — 빈 목록을 「이미 지워졌다」로 읽으면 안 된다.
        // 여러 건이던 내 목록이 통째로 0건이 된 것도 같은 부류로 보고 믿지 않는다.
        if(!mine || (len0 >= 2 && !mine.length)) resynced = false;
        else {
          const same = mine.filter(x => fpMatch(x, fp));
          const exact = same.filter(x => !!x.done === fp.done);
          if(same.length < n0){
            const retitled = fp.idx && mine.filter(x => idxOf(x.reqLink) === fp.idx).length >= post0;
            // busy 는 「그 행이 달라졌다」는 증거가 아니다 — 새 목록에 없는 것이 낡은 캐시(그 카드가 들어오기 전) 탓일 수 있다.
            // stale 일 때만 이미 지워진 것으로 본다. 그래도 오판이면 카드가 돌아오도록 캐시가 죽은 뒤 한 번 더 받는다.
            // 그 행에 같은 제목이 그대로 있다 = 지워진 게 아니라 다른 곳에서 링크(게시글 번호)만 바뀌었다 — 성공으로 넘기면 말없이 되살아난다.
            const relinked = mine.some(x => x._row === fp.row && String(x.title || "").trim() === fp.title);
            if(r.stale && !retitled && !relinked){ r = { ok:true, gone:true }; scheduleLateSync(Date.now() + TOMB_MS); }
          }
          // stale 인데 새 목록에서도 그 행 그대로다 = 받은 목록이 낡았다(서버 읽기 캐시). 같은 행으로 다시 쏘지 않는다.
          else if(nDone0 === 1 && exact.length === 1 && !(r.stale && exact[0]._row === fp.row)){
            fp.row = exact[0]._row; bottom = !mine.some(x => x._row > fp.row);
            r = await postDelete(myName, fp);
          }
        }
      }
      // 받아 둔 목록을 숨김 없이 다시 그린다. 가는 중인 쓰기가 있으면 그 낙관적 변경을 덮지 않게 서버 상태로 받는다.
      const redraw = () => { if(writesInFlight) doSync({ silent:true }); else applyView(viewName); };
      if(r && r.ok){
        if(!r.gone) buryDeleted(fp, bottom, syncing0 || syncInFlight || syncDropSeq !== drop0);
        unpendDelete(fp);
        if(!r.gone) await doSync({ silent:true }); // ④ compaction으로 행이 당겨지므로 _row 재정렬
        else redraw();                             // 숨김이 남은 쌍둥이 한 줄을 대신 가리고 있었을 수 있다
        return;
      }
      unpendDelete(fp);                            // 최종 실패 — 숨김을 풀고 되돌린다
      // 타임아웃은 되돌리지 않는다(afterWriteFail 과 같은 이유) — 서버 상태를 받아 맞춘다
      // 서버가 실제로는 지웠는데 확인용 동기화가 삭제 전 캐시를 받으면 카드가 다시 보인다 → 캐시가 죽은 뒤 한 번 더 받아 맞춘다.
      // (묘비는 세우지 않는다 — 서버가 안 지운 경우 멀쩡한 카드를 가린다.)
      if(r && r.timeout){
        toast("응답이 늦어요 — 동기화로 확인할게요", "err");
        addTombstone(fp, 0, true);                 // 가리지 않고 지켜본다 — 다시 보이면 캐시가 죽을 때까지 한 번 더 받는다
        doSync({ silent:true }); scheduleLateSync(Date.now() + TOMB_MS);
        return;
      }
      if(tasks === arr){ arr.splice(idx, 0, t); render(); }
      else redraw();
      toast(resynced ? "삭제하지 못했어요 — 목록을 다시 불러왔어요. 다시 눌러 주세요"
          : (r && (r.stale || r.busy)) ? "삭제하지 못했어요 — 잠시 후 다시 눌러 주세요"
          : "삭제 실패 — 되돌렸어요", "err");
      // 화면이 서버와 어긋난 채 남지 않게 한 번 맞춘다. stale·busy 는 방금 받은 목록이 낡았을 수 있으니 캐시가 죽은 뒤에,
      // 그 밖의 오류(HTTP 5xx 등)는 서버가 실제로 지웠는지조차 모르므로 지금 받는다 — 다시 눌렀을 때 행 번호가 맞아야 지워진다.
      if(r && (r.stale || r.busy)) scheduleLateSync(Date.now() + TOMB_MS);
      else { addTombstone(fp, 0, true); doSync({ silent:true }); }   // 서버가 지웠는데 낡은 목록을 받았다면 지켜보는 기록이 다시 받게 한다
    } finally { unpendDelete(fp); delInFlight = false; }
  }
  function postDelete(myName, fp){
    return postSheetTracked({
      action:"deleteTask", member:myName, row: fp.row,
      // ★지문 둘 다. 실패 조건이 서로 반대다 —
      //   idx  : 다른 게시글인데 제목이 겹치는 경우(반복 요청)를 잡는다
      //   title: 같은 게시글이 여러 행으로 쪼개진 경우("2종"·"3건")를 잡는다
      //   추출 실패 시엔 키를 아예 안 보낸다(빈 문자열 아님) — 서버 계약
      ...(fp.idx ? { expectIdx: fp.idx } : (fp.link ? { expectLink: fp.link } : {})),   // 번호 없는 손 링크 카드는 링크 전체(v64+)
      expectTitle: fp.title
    });
  }
  let doneCtx = null; // { id, toDone }
  function toggleDone(id){
    if(isReadonly()){ toast("다른 팀원 보드는 읽기 전용이에요"); return; } 
    const t = tasks.find(x=>x.id===id); if(!t) return;
    const toDone = !t.done;
    doneCtx = { id, toDone, pin: pinOf(t) };
    $("done-title").textContent = toDone ? "완료 처리" : "되돌리기";
    $("done-sub").textContent = t.title || "";
    const presets = toDone ? ["전달 완료","수정 전달 완료","베리 전달 완료","담당 제작 완료","홀딩"] : ["수정 진행","베리 진행"];
    let presetHtml = presets
      .map(p => `<button class="preset-pill" onclick="confirmDone('${p}')">${esc(p)}</button>`).join("");
    if(!toDone){
      // 되돌리기 팝업에만: 완료 상태를 유지한 채 '전달 완료'로 보내는 검은 버튼 (진행중으로 안 감)
      presetHtml += `<button class="preset-pill preset-pill-dark" onclick="confirmDone('전달 완료', true)">전달 완료</button>`;
    }
    $("done-presets").innerHTML = presetHtml;
    const inp = $("done-input");
    inp.value = toDone ? "전달 완료" : "";
    openModal("modal-done");
    setTimeout(()=>{ inp.focus(); inp.select(); }, 30);
  }
  function confirmDoneFromInput(){
    confirmDone($("done-input").value.trim()); // 빈칸이면 빈칸 그대로 기록
  }
  async function confirmDone(statusText, forceDone){
    const ctx = doneCtx; if(!ctx){ closeModal("modal-done"); return; }
    const t = findPinned(ctx.id, ctx.pin);
    if(!t){ closeModal("modal-done"); toast(PIN_LOST, "err"); return; }
    closeModal("modal-done");
    const myName = getMyName();
    if(!myName || typeof window.timerAPI === "undefined"){ toast("앱에서만 동작해요"); return; }
    const target = (forceDone === true) ? true : ctx.toDone; // '전달 완료'는 완료 상태 유지(진행중으로 안 감)
    const arr = tasks;
    const fp0 = taskFp(t), n0 = fpCount(arr, fp0);   // 재시도용 — 바꾸기 전 지문
    const okMsg = forceDone === true ? "전달 완료로 보냈어요" : (target ? "완료 처리했어요" : "되돌렸어요");
    const apply = x => {                              // 낙관적 반영 + 보낼 내용(재시도 때 새 카드에 다시 쓴다)
      const pd = x.done, ps = x._status;
      x.done = target; x._status = statusText;
      return { payload: { action:"toggleDone", member:myName, done: target ? "1" : "0", status: statusText, ...writeFp(x) },
               undo: () => { x.done = pd; x._status = ps; }, okMsg, failMsg: "처리 실패 — 되돌렸어요" };
    };
    const first = apply(t);                           // ① 낙관적 즉시 반영
    render();
    const r = await postSheetTracked(withRow(first.payload, t._row || t.id));   // ② 시트 기록 (체크박스 A/I + G/O 상태열)
    if(r && r.ok){ toast(okMsg); }
    else { afterWriteFail(r, arr, first.undo, first.failMsg, { fp: fp0, n0, redo: apply }); } // ③ 롤백(+ 행이 밀렸으면 한 번 재시도)
  }
  // 공용 확인 모달
  let confirmCb = null;
  function openConfirm(title, msg, okLabel, cb){
    $("confirm-title").textContent = title;
    $("confirm-msg").textContent = msg;
    $("confirm-ok").textContent = okLabel || "확인";
    confirmCb = cb;
    openModal("modal-confirm");
  }
  function doConfirm(){ closeModal("modal-confirm"); const cb = confirmCb; confirmCb = null; if(cb) cb(); }

  // 카드에서 마감 편집 (날짜→시트, 시간→로컬)
  let dueCtx = null;
  function ymd(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  // "1800"→"18:00", "930"→"09:30", "18"→"18:00", "18:00"→"18:00". 잘못된 값은 "".
  function normalizeTime(s){
    s = (s || "").trim();
    let h, m;
    let mm = s.match(/^(\d{1,2}):(\d{2})$/);
    if(mm){ h = +mm[1]; m = +mm[2]; }
    else {
      const d = s.replace(/[^\d]/g, "");
      if(d.length === 4){ h = +d.slice(0,2); m = +d.slice(2); }
      else if(d.length === 3){ h = +d.slice(0,1); m = +d.slice(1); }
      else if(d.length === 1 || d.length === 2){ h = +d; m = 0; }
      else return "";
    }
    if(isNaN(h) || isNaN(m) || h > 23 || m > 59) return "";
    return String(h).padStart(2,"0") + ":" + String(m).padStart(2,"0");
  }
  function openTimeEdit(id){
    if(isReadonly()){ toast("다른 팀원 보드는 읽기 전용이에요"); return; } 
    const t = tasks.find(x=>x.id===id); if(!t) return;
    dueCtx = id; duePin = pinOf(t);
    $("time-sub").textContent = t.title || "";
    const d = new Date(t.deadline);
    // 작업편집과 동일한 마감 블록 — 칩 그리드 + 직접 입력(캘린더+시간) + 미리보기
    renderChips("chip-grid-edit", ts=>{ selDlEdit=ts; showPrev(ts,"edit"); });
    selDlEdit = t.deadline;
    showPrev(selDlEdit, "edit");
    calState.edit.view = new Date(d.getFullYear(), d.getMonth(), 1);
    const sel = new Date(d.getFullYear(), d.getMonth(), d.getDate()); sel.setHours(0,0,0,0);
    calState.edit.sel = sel.getTime();
    const days = ["일","월","화","수","목","금","토"];
    $("cal-trig-text-edit").textContent = `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`;
    $("cal-trig-edit").classList.add("has");
    $("time-edit").value = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    $("custom-row-edit").classList.remove("show");
    $("cal-pop-edit").classList.remove("show");
    openModal("modal-time");
  }
  // 날짜+시간 확정: 날짜는 시트, 시간은 로컬. (프리셋·저장 버튼 공통)
  async function commitDue(dateStr, timeStr){
    const t = findPinned(dueCtx, duePin); if(!t){ closeModal("modal-time"); toast(PIN_LOST, "err"); return; }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)){ toast("날짜를 선택해 주세요"); return; }
    timeStr = normalizeTime(timeStr);
    if(!timeStr){ toast("시간을 입력해 주세요 (예: 1800)"); return; }
    const [y,mo,da] = dateStr.split("-").map(Number);
    const [h,mi]    = timeStr.split(":").map(Number);
    const newTs = new Date(y, mo-1, da, h, mi, 0, 0).getTime();
    closeModal("modal-time");

    taskTimes[timeKey(t.reqLink, t.title)] = timeStr; saveTaskTimes(); // 시간 로컬 저장
    const arr = tasks;
    const fp0 = taskFp(t), n0 = fpCount(arr, fp0);
    const myName = getMyName();
    const apply = x => {
      const pt = x.deadline;
      x.deadline = newTs; firedAlarms.delete(timeKey(x.reqLink, x.title));   // 낙관적 + 알람 재발화 허용
      return { payload: { action:"updateDue", member:myName, dueDate: dateStr, ...writeFp(x) },
               undo: () => { x.deadline = pt; }, okMsg: "마감을 변경했어요", failMsg: "변경 실패 — 되돌렸어요" };
    };
    const first = apply(t); render();

    if(!myName || typeof window.timerAPI === "undefined"){ toast("앱에서만 동작해요"); return; }
    const r = await postSheetTracked(withRow(first.payload, t._row || t.id));
    if(r && r.ok){ toast("마감을 변경했어요"); }
    else { afterWriteFail(r, arr, first.undo, first.failMsg, { fp: fp0, n0, redo: apply }); }
  }
  function saveDueEdit(){
    if(!selDlEdit){ toast("마감 시간을 선택해 주세요"); return; }
    const d = new Date(selDlEdit);
    commitDue(ymd(d), `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`);
  }

  function clearDone(){
    if(isReadonly()){ toast("다른 팀원 보드는 읽기 전용이에요"); return; } 
    const cnt = tasks.filter(t=>t.done).length;
    if(!cnt) return;
    openConfirm("완료 비우기", `완료된 작업 ${cnt}건을 삭제할까요? 시트에서도 지워져요.`, "삭제", doClearDone);
  }
  async function doClearDone(){
    const myName = getMyName();
    if(!myName || typeof window.timerAPI === "undefined"){ toast("앱에서만 동작해요"); return; }
    // ★내림차순(행 번호 큰 것부터)은 **바꾸면 안 된다.** 세 가지가 여기에 걸려 있다.
    //   ① compaction 은 자기 단에서 아래 행을 위로 당긴다 → 위쪽(아직 지울) 행번호가 안 틀어짐
    //   ② 그래서 expectTitle/expectIdx 지문이 회차마다 계속 유효하다
    //   ③ 오름차순이면 시트의 lastRow 가 내려가면서 서버의 scanCount<1 가드에 걸린다
    //   중간에 doSync 를 안 하므로 정렬 순서가 유일한 안전장치다.
    const doneTasks = tasks.filter(t=>t.done).slice().sort((a,b)=>(b._row||b.id)-(a._row||a.id));
    if(!doneTasks.length) return;
    // 개별 삭제와 서로 잠근다 — 겹치면 행이 서로 당겨져 한쪽이 stale 로 실패하고, 묘비 순서도 서버 반영 순서와 어긋난다
    if(delInFlight){ toast("앞선 삭제를 처리하고 있어요 — 잠시 후 다시 눌러 주세요"); return; }
    tasks = tasks.filter(t=>!t.done); refreshMyTasks(); render(); // ① 즉시 화면에서 제거 (myTasks 도 새 배열을 가리키게)
    const fps = doneTasks.map(taskFp);
    fps.forEach(fp => pendingDeletes.push(fp));   // 다 끝날 때까지 숨긴다(delTask 와 같은 이유)
    const badFps = [];
    const fpKey = fp => fp.idx + "\n" + fp.title;
    const queued = {};                            // 지문별로 서버에 아직 남아 있는 이 묶음의 건수(ok 가 올 때마다 줄인다)
    fps.forEach(fp => { queued[fpKey(fp)] = (queued[fpKey(fp)] || 0) + 1; });
    const drop0 = syncDropSeq, syncing0 = syncInFlight;
    // 여러 건을 한 번의 쓰기로 묶는다 — 건과 건 사이 틈에 도착한 동기화가 아직 안 지운 완료 카드를 되살리지 않게
    delInFlight = true;
    beginWrite();
    try {
      for(const fp of fps){
        const r = await postDelete(myName, fp);
        if(!(r && r.ok)){ badFps.push(fp); continue; }
        // 묘비는 ok 가 올 때마다 바로 세운다(세운 순서 = 서버 반영 순서). 같은 지문이 이 묶음에 더 남아 있으면 그만큼은
        // 정상 응답에도 실려 오므로 left 에 더한다 — 실패해 끝까지 남는 건도 여기에 그대로 들어 있다.
        queued[fpKey(fp)]--;
        const bottom = !myTasks.some(x => (x._row || x.id) > fp.row) && !badFps.some(b => b.row > fp.row);
        buryDeleted(fp, bottom, syncing0 || syncInFlight || syncDropSeq !== drop0, queued[fpKey(fp)]);
      }
    } finally {
      fps.forEach(unpendDelete);                  // 실패한 건은 아래 동기화에서 다시 보여야 한다
      endWrite();
      delInFlight = false;
    }
    await doSync({ silent:true }); // ② 시트 기준으로 재정렬
    const failed = badFps.length;
    toast(failed ? `${doneTasks.length-failed}건 삭제 · ${failed}건 실패` : `완료 ${doneTasks.length}건을 비웠어요`);
  }

  // ── 설정 (프리셋 + 알람) ──
  // ⚠ alarmSettings 선언은 **메일 블록 위**로 옮겼다. 시작 시 메일 캐시 복원 IIFE 가
  //   메일 종류 필터(alarmSettings.mailKinds)를 참조하는데, 여기 두면 TDZ ReferenceError 가 난다.
  let draftPresets = [];
  function saveAlarmAndPresets(){
    try {
      localStorage.setItem("alarmSettings", JSON.stringify(alarmSettings)); // 커스텀 음원(dataURL) 포함 영속화
      localStorage.setItem("presets", JSON.stringify(PRESETS));
    } catch(e){ toast("저장 공간이 부족해 음원을 저장하지 못했어요 — 더 작은 파일을 사용해 주세요", "err"); }
  }
  let draftAlarm = {};
  let draftWork = {};   // 업무시간만 세기 드래프트 — openSettings 에서 workHours 복사, [저장]에서만 반영

  // ── 내 이름 커스텀 드롭다운 ──
  function renderNamePop(){
    const pop = $("name-pop"); if(!pop) return;
    const cur = getMyName();
    pop.innerHTML = "";
    MEMBERS.forEach(n => {
      const b = document.createElement("button");
      b.className = "name-opt" + (n === cur ? " sel" : "");
      b.textContent = n;
      b.onclick = () => pickName(n);
      pop.appendChild(b);
    });
  }
  function toggleNamePop(){
    const pop = $("name-pop"), trig = $("name-trigger");
    if (pop.classList.contains("show")) { pop.classList.remove("show"); trig.classList.remove("open"); }
    else { renderNamePop(); pop.classList.add("show"); trig.classList.add("open"); }
  }
  function pickName(n){
    const prev = getMyName();
    setMyName(n);
    syncNameTrigger();
    $("name-pop").classList.remove("show");
    $("name-trigger").classList.remove("open");
    if (n !== prev) { viewName = n; doSync(); }
  }
  function syncNameTrigger(){
    const t = $("name-trigger-text");
    if (t) t.textContent = getMyName() || "— 선택 —";
  }

  // 시트에서 팀원 명단만 새로 받아 반영. 실패해도 조용히 넘어간다(캐시·폴백으로 계속 동작).
  // ★특히 아직 이름을 안 고른 새 설치에서는 이게 명단을 받는 유일한 경로다 — doSync 는 이름이
  //   없으면 네트워크를 타기 전에 반환하기 때문이다.
  async function refreshMemberNames(){
    if (typeof window.timerAPI === "undefined" || !window.timerAPI.fetchMembers) return;
    try {
      const r = await window.timerAPI.fetchMembers();
      if (r && r.ok && Array.isArray(r.members) && r.members.length) applyMemberNames(r.members);
    } catch(e){}
  }

  function openSettings() {
    refreshMemberNames();      // 🤖자동화 시트 A열 순서를 설정 열 때마다 최신화
    syncNameTrigger();
    $("name-pop").classList.remove("show");
    $("name-trigger").classList.remove("open");
    draftPresets = JSON.parse(JSON.stringify(PRESETS));
    // mailKinds 는 객체라 얕은 복사로는 공유된다 → 따로 복제해야 [취소]가 진짜 취소가 된다
    draftAlarm = { ...alarmSettings, mailKinds: { ...(alarmSettings.mailKinds || {}) } };
    draftWork = { ...workHours };
    renderPresetList();
    renderWorkHours();
    syncSegments();
    renderGmailConn();
    syncMailSliders();
    renderAutostart();
    renderLinkProfile();
    renderStatusColors();
    openModal("modal-settings");
    // ★show 를 붙인 뒤에 해야 한다 — display:none 인 동안은 scrollTop 대입이 무시된다.
    const _in = $("modal-settings").querySelector(".modal-inner"); if(_in) _in.scrollTop = 0;
  }

  // ── 단축키 커스터마이징 팝업 ──
  const RESERVED_KEYS = new Set(["escape","backspace","enter","tab"," ","w","arrowleft","arrowright","arrowup","arrowdown","home","end","pageup","pagedown","delete","insert"]);
  let keyCaptureId = null;

  function openDocs(){ if (window.timerAPI && window.timerAPI.openExternal) window.timerAPI.openExternal("https://minsk999.github.io/teamtimer-releases/"); }
  function openKeysModal(){
    keyCaptureId = null;
    renderKeysList();
    openModal("modal-keys");
  }
  function renderKeysList(){
    const host = $("keys-list"); if(!host) return;
    let html = KEY_ACTIONS.map(a => `
      <div class="key-row">
        <span class="key-label">${a.label}</span>
        <button class="key-cap${keyCaptureId===a.id?' capturing':''}" id="kc-${a.id}" onclick="startKeyCapture('${a.id}')">${keyCaptureId===a.id ? "키 입력…" : esc(keymap[a.id])}</button>
      </div>
    `).join("");
    // 고정 단축키 (변경 불가)
    html += `
      <div class="key-row">
        <span class="key-label">관리 항목 / 최신순 토글</span>
        <button class="key-cap fixed" onclick="toast('고정 단축키예요')">W</button>
      </div>
      <div class="key-row">
        <span class="key-label">동기화 / 새로고침</span>
        <button class="key-cap fixed" onclick="toast('고정 단축키예요')">Space</button>
      </div>`;
    host.innerHTML = html;
  }
  function startKeyCapture(id){
    keyCaptureId = (keyCaptureId === id) ? null : id; // 다시 누르면 취소
    renderKeysList();
  }
  function resetKeymap(){
    keymap = defaultKeymap();
    saveKeymap();
    keyCaptureId = null;
    renderKeysList();
    toast("단축키를 기본값으로 되돌렸어요");
  }
  // 캡처 전용 리스너 (capture 단계에서 가로채 전역 단축키보다 먼저 처리)
  window.addEventListener("keydown", (e) => {
    if(keyCaptureId === null) return;
    if(!modalShown($("modal-keys"))){ keyCaptureId = null; return; }
    e.preventDefault(); e.stopPropagation();
    if(e.key === "Escape"){ keyCaptureId = null; renderKeysList(); return; } // 취소
    if(e.metaKey || e.ctrlKey || e.altKey) return; // 조합키 무시(계속 대기)
    const k = e.key.toLowerCase();
    if(RESERVED_KEYS.has(k) || k.length !== 1 || !/[a-z0-9]/.test(k)){
      toast("문자·숫자 키만 쓸 수 있어요"); return; // 계속 대기
    }
    // 중복 검사
    const dup = KEY_ACTIONS.find(a => a.id !== keyCaptureId && keymap[a.id] === k);
    if(dup){ toast(`이미 "${dup.label}"에 쓰는 키예요`); return; } // 계속 대기
    keymap[keyCaptureId] = k;
    saveKeymap();
    keyCaptureId = null;
    renderKeysList();
    toast("단축키를 바꿨어요");
  }, true); // capture phase

  // 시작 시 자동 실행
  // ── 상태 색상 (마감임박/오늘마감/여유있음) 사용자 지정 ──
  const COLOR_PALETTE = ["#FF3333","#FF7A33","#FFAC24","#04C766","#2E96FF","#9A4DFF"];
  const STATUS_DEFS = [
    { key:"urgent", id:"color-urgent", label:"마감 임박", def:"#FF3333" },
    { key:"today",  id:"color-today",  label:"오늘 마감", def:"#FFAC24" },
    { key:"soon",   id:"color-soon",   label:"여유 있음", def:"#04C766" },
  ];
  let statusColors = {};
  try { statusColors = JSON.parse(localStorage.getItem("statusColors") || "{}"); } catch(e){ statusColors = {}; }
  function effStatusColor(key){ const d = STATUS_DEFS.find(s=>s.key===key); return (statusColors[key] || (d && d.def) || "#888"); }
  // ⚠ --st-*-ink 를 같이 꽂지 않으면, 사용자가 커스텀 색을 고른 순간 좌측 바(--st-*)만 바뀌고
  //   카운트다운 숫자·상단 통계 숫자(--st-*-ink)는 기본 보정색(#D91F1F 등)으로 남아 둘이 어긋난다.
  //   사용자가 직접 고른 색은 대비 보정 대상이 아니므로 면과 글자에 같은 값을 쓴다.
  function applyStatusColors(){
    STATUS_DEFS.forEach(s => {
      if(statusColors[s.key]){
        // ★body 에 넣는다 — 다크 테마는 body.dark 가 상태색을 다시 정의해서, :root 에 넣으면 다크에선 기본색으로 돌아갔다(v1.0.44)
        document.body.style.setProperty("--st-" + s.key, statusColors[s.key]);
        document.body.style.setProperty("--st-" + s.key + "-ink", statusColors[s.key]);
      } else {
        document.body.style.removeProperty("--st-" + s.key);        // 기본값(테마 적응) 사용
        document.body.style.removeProperty("--st-" + s.key + "-ink");
      }
    });
  }
  function setStatusColor(key, hex){
    statusColors[key] = String(hex).toLowerCase();
    localStorage.setItem("statusColors", JSON.stringify(statusColors));
    applyStatusColors();
    renderStatusColors();
  }
  // ── 커스텀 컬러 피커 ──
  let cpickKey = null, cpickHue = 0, cpickSat = 1, cpickVal = 1;
  function hsvToRgb(h, s, v){
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    let r, g, b;
    if(h < 60){ r=c; g=x; b=0; } else if(h<120){ r=x; g=c; b=0; } else if(h<180){ r=0; g=c; b=x; }
    else if(h<240){ r=0; g=x; b=c; } else if(h<300){ r=x; g=0; b=c; } else { r=c; g=0; b=x; }
    return [Math.round((r+m)*255), Math.round((g+m)*255), Math.round((b+m)*255)];
  }
  function rgbToHsv(r, g, b){
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
    let h=0;
    if(d){ if(max===r) h=60*(((g-b)/d)%6); else if(max===g) h=60*((b-r)/d+2); else h=60*((r-g)/d+4); }
    if(h<0) h+=360;
    return [h, max?d/max:0, max];
  }
  function hex2(n){ return n.toString(16).padStart(2,"0"); }
  function curHex(){ const [r,g,b]=hsvToRgb(cpickHue,cpickSat,cpickVal); return "#"+hex2(r)+hex2(g)+hex2(b); }
  function parseHex(hex){
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if(!m) return null;
    const n = parseInt(m[1],16); return [(n>>16)&255,(n>>8)&255,n&255];
  }
  function cpickRender(){
    const hex = curHex();
    const sv = $("cpick-sv");
    if(sv){ const [hr,hg,hb]=hsvToRgb(cpickHue,1,1); sv.style.background = `rgb(${hr},${hg},${hb})`; }
    const svc = $("cpick-sv-cursor");
    if(svc){ svc.style.left = (cpickSat*100)+"%"; svc.style.top = ((1-cpickVal)*100)+"%"; svc.style.background = hex; }
    const hc = $("cpick-hue-cursor"); if(hc) hc.style.left = (cpickHue/360*100)+"%";
    const pv = $("cpick-preview"); if(pv) pv.style.background = hex;
    const hx = $("cpick-hex"); if(hx && document.activeElement !== hx) hx.value = hex.slice(1).toUpperCase();
  }
  function cpickApply(){ if(cpickKey) setStatusColorLive(cpickKey, curHex()); cpickRender(); }
  // 라이브 적용(피커 다시 그리지 않음 — 입력 중 깜빡임 방지)
  function setStatusColorLive(key, hex){
    statusColors[key] = String(hex).toLowerCase();
    localStorage.setItem("statusColors", JSON.stringify(statusColors));
    applyStatusColors();
    // 행의 cdot/트리거/스와치 활성만 갱신
    const def = STATUS_DEFS.find(s=>s.key===key); if(!def) return;
    const row = $(def.id); if(!row) return;
    const eff = hex.toLowerCase();
    const cdot = row.querySelector(".cdot"); if(cdot) cdot.style.background = eff;
    const trig = row.querySelector(".color-pick"); if(trig) trig.style.background = eff;
    row.querySelectorAll(".swatch").forEach(sw => sw.classList.toggle("on", (sw.title||"").toLowerCase()===eff));
  }
  function openColorPicker(ev, key){
    ev.stopPropagation();
    cpickKey = key;
    const rgb = parseHex(effStatusColor(key)) || [220,38,38];
    [cpickHue, cpickSat, cpickVal] = rgbToHsv(rgb[0],rgb[1],rgb[2]);
    const pop = $("cpick"); pop.style.display = "block";
    // 위치: 트리거 버튼 근처
    const r = ev.currentTarget.getBoundingClientRect();
    let left = r.right - 196, top = r.bottom + 8;
    if(top + 200 > window.innerHeight) top = r.top - 200;
    if(left < 8) left = 8;
    pop.style.left = left + "px"; pop.style.top = top + "px";
    cpickRender();
  }
  function closeColorPicker(){ const p=$("cpick"); if(p) p.style.display="none"; cpickKey=null; }
  // 피커는 position:fixed 인데 좌표를 열 때 한 번만 계산한다 → 설정창을 휠로 굴리면
  // 트리거 버튼만 멀어지고 피커가 화면에 고아로 남는다. 툴팁이 쓰는 방식과 동일하게 처리.
  document.addEventListener("scroll", () => {
    const p = $("cpick");
    if (p && p.style.display !== "none") closeColorPicker();
  }, true);
  // SV 영역 드래그
  function cpickSVDrag(e){
    const sv = $("cpick-sv"); const rect = sv.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX-rect.left)/rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY-rect.top)/rect.height));
    cpickSat = x; cpickVal = 1-y; cpickApply();
  }
  function cpickHueDrag(e){
    const hue = $("cpick-hue"); const rect = hue.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX-rect.left)/rect.width));
    cpickHue = x*360; cpickApply();
  }
  function initColorPicker(){
    const sv = $("cpick-sv"), hue = $("cpick-hue"), hx = $("cpick-hex");
    if(!sv) return;
    const startDrag = (handler) => (e) => {
      e.preventDefault();
      handler(e);
      const move = (ev) => handler(ev);
      const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
    };
    sv.addEventListener("mousedown", startDrag(cpickSVDrag));
    hue.addEventListener("mousedown", startDrag(cpickHueDrag));
    hx.addEventListener("input", () => {
      const rgb = parseHex("#"+hx.value); if(!rgb) return;
      [cpickHue,cpickSat,cpickVal] = rgbToHsv(rgb[0],rgb[1],rgb[2]);
      if(cpickKey) setStatusColorLive(cpickKey, "#"+hex2(rgb[0])+hex2(rgb[1])+hex2(rgb[2]));
      cpickRender();
    });
    // 바깥 클릭 시 닫기
    document.addEventListener("mousedown", (e) => {
      const p = $("cpick");
      if(p && p.style.display !== "none" && !p.contains(e.target) && !(e.target.classList && e.target.classList.contains("color-pick"))) closeColorPicker();
    });
  }

  function renderStatusColors(){
    STATUS_DEFS.forEach(s => {
      const row = $(s.id); if(!row) return;
      const eff = effStatusColor(s.key).toLowerCase();
      const sw = COLOR_PALETTE.map(c =>
        `<span class="swatch${c.toLowerCase()===eff?' on':''}" style="background:${c}" title="${c}" onclick="setStatusColor('${s.key}','${c}')"></span>`
      ).join("");
      row.innerHTML =
        `<span class="color-name"><span class="cdot" style="background:${eff}"></span>${s.label}</span>` +
        `<div class="swatches">${sw}</div>` +
        `<button type="button" class="color-pick" style="background:${eff}" title="직접 선택" onclick="openColorPicker(event,'${s.key}')"></button>`;
    });
  }

  // 링크 열기 — Chrome 프로필 선택
  function getLinkProfile(){ return localStorage.getItem("linkProfile") || ""; }
  function applyLinkProfile(){
    if(typeof window.timerAPI !== "undefined" && window.timerAPI.setLinkProfile)
      window.timerAPI.setLinkProfile(getLinkProfile());
  }
  async function renderLinkProfile(){
    const sel = $("link-profile");
    if(!sel || typeof window.timerAPI === "undefined" || !window.timerAPI.listChromeProfiles) return;
    const saved = getLinkProfile();
    let opts = '<option value="">기본 브라우저</option>';
    try {
      const r = await window.timerAPI.listChromeProfiles();
      if(r && r.ok && r.chrome && r.profiles && r.profiles.length){
        r.profiles.forEach(p => { opts += `<option value="${esc(p.dir)}">Chrome · ${esc(p.name)}</option>`; });
      } else if(r && !r.chrome){
        opts = '<option value="">기본 브라우저 (Chrome 미설치)</option>';
      }
    } catch(e){}
    sel.innerHTML = opts;
    // 저장값이 목록에 있으면 선택, 없으면 기본
    sel.value = [...sel.options].some(o => o.value === saved) ? saved : "";
    if(sel.value !== saved){ localStorage.setItem("linkProfile", sel.value); applyLinkProfile(); }
  }
  function onLinkProfileChange(val){
    localStorage.setItem("linkProfile", val || "");
    applyLinkProfile();
    toast(val ? "선택한 Chrome 프로필로 링크를 열어요" : "기본 브라우저로 링크를 열어요");
  }

  // 시작 시 자동 실행 — 선택값을 localStorage에 저장(표시 안정), 시작 때마다 OS에 재등록
  function getAutostartPref(){ return localStorage.getItem("autostart") === "1"; }
  function getAutostartMinPref(){ return localStorage.getItem("autostartMin") === "1"; }
  function renderAutostart(){
    const t = $("autostart-toggle"); if(t) t.classList.toggle("on", getAutostartPref());
    const mt = $("autostart-min-toggle"); if(mt) mt.classList.toggle("on", getAutostartMinPref());
    // 자동 실행이 꺼져 있으면 "트레이로 시작" 옵션은 흐리게(비활성 느낌)
    const mr = $("autostart-min-row");
    if(mr){ const _on = getAutostartPref(); mr.style.opacity = _on ? "1" : "0.4"; mr.classList.toggle("is-off", !_on); }
  }
  function applyAutostartMin(){
    if(typeof window.timerAPI !== "undefined" && window.timerAPI.setAutostartMinimized)
      window.timerAPI.setAutostartMinimized(getAutostartMinPref());
  }
  async function toggleAutostartMin(){
    if(typeof window.timerAPI === "undefined") return;
    if(!getAutostartPref()){ toast("먼저 '시작 시 자동 실행'을 켜 주세요"); return; }
    const next = !getAutostartMinPref();
    localStorage.setItem("autostartMin", next ? "1" : "0");
    renderAutostart();
    if(window.timerAPI.setAutostartMinimized) await window.timerAPI.setAutostartMinimized(next);
    toast(next ? "자동 실행 시 트레이로 시작" : "자동 실행 시 창 표시");
  }
  function applyAutostart(){
    if(typeof window.timerAPI !== "undefined" && window.timerAPI.setAutostart)
      window.timerAPI.setAutostart(getAutostartPref());
  }
  async function toggleAutostart(){
    if(typeof window.timerAPI === "undefined" || !window.timerAPI.setAutostart){ toast("앱에서만 설정돼요"); return; }
    const next = !getAutostartPref();
    localStorage.setItem("autostart", next ? "1" : "0");
    renderAutostart();
    const r = await window.timerAPI.setAutostart(next);
    if(!(r && r.ok)){
      localStorage.setItem("autostart", next ? "0" : "1"); renderAutostart();
      toast("자동 실행 설정 실패");
    } else {
      toast(next ? "시작 시 자동 실행 켜짐" : "시작 시 자동 실행 꺼짐");
    }
  }

  // 닫기 = 항상 트레이로 최소화 (옵션 없음). 완전 종료는 트레이 우클릭 → 종료.

  // 메일 연동 상태 표시 + 연결/해제
  // 로그인 실패 사유를 사람 말로. no-secrets 는 이 빌드에 메일 설정이 안 들어간 경우다
  // (소스에서 직접 실행한 개발 빌드 등) — 사용자 계정 문제가 아니다.
  function gmailErrText(r){
    const e = String((r && r.error) || "");
    if(e === "no-secrets")    return "이 빌드에는 메일 설정이 없어요 — 배포본에서 써 주세요";
    if(e === "not-connected") return "메일이 연결되지 않았어요";
    if(e === "timeout")       return "로그인이 시간 초과됐어요 — 다시 시도해 주세요";
    if (e) logError("gmail-connect", e);
    return "메일 연결에 실패했어요 — 잠시 뒤 다시 시도해 주세요";
  }
  async function renderGmailConn(){
    const dot = $("gmail-dot"), txt = $("gmail-conn-text"), btn = $("gmail-conn-btn");
    if(typeof window.timerAPI === "undefined" || !window.timerAPI.gmailStatus){
      txt.textContent = "앱에서만 사용 가능"; dot.classList.remove("on");
      btn.style.display = "none"; return;
    }
    btn.style.display = "";
    const st = await window.timerAPI.gmailStatus();
    if(st && st.connected){
      dot.classList.add("on");
      txt.textContent = st.email || "연결됨";
      btn.textContent = "연결 해제"; btn.classList.add("disconnect");
    } else {
      dot.classList.remove("on");
      txt.textContent = "연결 안 됨";
      btn.textContent = "연결"; btn.classList.remove("disconnect");
    }
  }
  async function toggleGmailConn(){
    const st = await window.timerAPI.gmailStatus();
    if(st && st.connected){
      await window.timerAPI.gmailLogout();
      setMailBadge(0);
      toast("메일 연결을 해제했어요");
      renderGmailConn();
    } else {
      toast("브라우저에서 로그인해 주세요…");
      const r = await window.timerAPI.gmailLogin();
      if(r && r.ok){ toast(`메일 연결 완료: ${r.email}`); renderGmailConn(); loadMail(true); }
      else { toast(gmailErrText(r), "err"); }
    }
  }

  function syncSegments() {
    // 알람 방식 (다중)
    setToggle("seg-mode", "notify", draftAlarm.notify);
    setToggle("seg-mode", "sound", draftAlarm.sound);
    // 끄기도 상태다 — 없으면 "아직 안 골랐다"와 "전부 껐다"가 같은 화면이 된다
    setToggle("seg-mode", "off", !draftAlarm.notify && !draftAlarm.sound);
    setSeg("seg-sound", draftAlarm.soundType);
    setSeg("seg-default-alarm", draftAlarm.defaultAlarm);
    // 받을 메일 종류 (다중) + 적용 범위 (단일)
    const _mk = draftAlarm.mailKinds || {};
    MAIL_KINDS.forEach(k => setToggle("seg-mail-kinds", k.key, _mk[k.key] !== false));
    const _ht = $("mail-hide-toggle");
    if(_ht) _ht.classList.toggle("on", draftAlarm.mailFilterScope === "hide");
    // 음량 슬라이더 동기화
    const vs = $("vol-slider"), vv = $("vol-val");
    if(vs){ const pct = Math.round((draftAlarm.volume ?? 0.8) * 100); vs.value = pct; if(vv) vv.textContent = pct + "%"; }
    // 커스텀 음원 이름 표시 (이름 클릭=교체, X=삭제)
    const nameEl = $("custom-sound-name");
    if (draftAlarm.customSoundName) {
      nameEl.style.display = "flex";
      nameEl.innerHTML = `${IC.bell}<span class="csn-text" title="클릭하면 미리 들어봐요" onclick="previewCustomSound()">${esc(draftAlarm.customSoundName)}</span>`
        + `<button type="button" class="csn-remove" title="음원 삭제" onclick="removeCustomSound(event)"><svg viewBox="0 0 20 20"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/></svg></button>`;
    } else {
      nameEl.style.display = "none";
      nameEl.innerHTML = "";
    }
    updateAlarmFieldStates();
  }
  // 커스텀 음원 교체(탐색기 열기) / 삭제
  function previewCustomSound(){
    if (draftAlarm.customSoundData) playPreview("custom");
  }
  function replaceCustomSound(){
    const inp = $("custom-sound-input");
    if(inp){ inp.value = ""; inp.click(); } // 같은 파일 다시 선택해도 동작하도록 초기화
  }
  function removeCustomSound(ev){
    if(ev) ev.stopPropagation();
    draftAlarm.customSoundData = null;
    draftAlarm.customSoundName = "";
    if(draftAlarm.soundType === "custom") draftAlarm.soundType = "ding"; // 기본음으로 되돌림
    const inp = $("custom-sound-input"); if(inp) inp.value = "";
    syncSegments();
    toast("음원을 삭제했어요");
  }

  // 받을 메일 종류 — '목록에서도 숨기기' 토글.
  // 자동실행 토글과 달리 즉시 적용하지 않고 draftAlarm 에만 담는다 —
  // 바로 위 종류 칩들과 같은 [저장]/[취소] 흐름을 타야 하기 때문이다.
  function toggleMailHide(){
    draftAlarm.mailFilterScope = (draftAlarm.mailFilterScope === "hide") ? "notify" : "hide";
    const t = $("mail-hide-toggle");
    if(t) t.classList.toggle("on", draftAlarm.mailFilterScope === "hide");
  }

  // 남은 시간 — 「업무시간만 세기」 토글·「설명 표시」 토글·시간 입력. 전부 draftWork 에만 담고 [저장]에서 검증·반영한다(프리셋과 같은 부류).
  function toggleWorkDraft(){ draftWork.on = !draftWork.on; renderWorkHours(); }
  function toggleWorkLabelsDraft(){ draftWork.labels = draftWork.labels === false; renderWorkHours(); }   // 없음(=켜짐)·true → false, false → true
  function renderWorkHours(){
    const t = $("work-toggle"); if(t) t.classList.toggle("on", !!draftWork.on);
    const lt = $("work-labels-toggle"); if(lt) lt.classList.toggle("on", draftWork.labels !== false);
    const s = $("work-start"), e = $("work-end"); if(s) s.value = draftWork.start; if(e) e.value = draftWork.end;
    // 주 토글이 꺼지면 하위 필드 통째로 흐림(.field.disabled = opacity .4 + pointer-events none). 접기 모션 없음.
    const f = $("field-workhours"); if(f) setFieldOff(f, !draftWork.on);
  }
  // 흐리게 꺼 둔 설정 묶음은 Tab 으로도 못 들어가게 — 마우스는 pointer-events 로 이미 막혀 있다(들어가면 커서도 안 보였다, v1.0.45)
  function setFieldOff(f, off){
    f.classList.toggle("disabled", off);
    f.querySelectorAll('input, select, textarea, button, [tabindex]').forEach(el => {
      if (off) { if (!el.hasAttribute("data-tab0")) el.setAttribute("data-tab0", el.getAttribute("tabindex") ?? ""); el.tabIndex = -1; }
      else if (el.hasAttribute("data-tab0")) { const t = el.getAttribute("data-tab0"); if (t === "") el.removeAttribute("tabindex"); else el.setAttribute("tabindex", t); el.removeAttribute("data-tab0"); }
    });
    if (off && f.contains(document.activeElement)) document.activeElement.blur();
  }
  // blur/Enter 즉시 정규화 — normalizePresetTime 과 같은 규칙('9' → 09:00, '1830' → 18:30). 실패하면 그대로 두고 [저장]에서 걸린다.
  function normalizeWorkTime(el, key){ const n = normalizeTime(el.value); if(n){ el.value = n; draftWork[key] = n; } }

  function setToggle(segId, val, on) {
    const btn = document.querySelector(`#${segId} .seg-btn[data-val="${val}"]`);
    if (btn) btn.classList.toggle("on", !!on);
  }
  function setSeg(segId, val) {
    document.querySelectorAll(`#${segId} .seg-btn`).forEach(b => {
      b.classList.toggle("on", b.dataset.val === val);
    });
  }
  function updateAlarmFieldStates() {
    setFieldOff($("field-sound"), !draftAlarm.sound);
  }

  // 세그먼트 클릭 (이벤트 위임)
  document.addEventListener("click", e => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    const seg = btn.closest(".seg");
    if (!seg) return;
    const val = btn.dataset.val;

    if (seg.id === "seg-mode") {
      if (val === "off") {
        draftAlarm.notify = false; draftAlarm.sound = false;
        setToggle("seg-mode","notify",false); setToggle("seg-mode","sound",false);
        setToggle("seg-mode","off",true);
      } else {
        // 알림/소리 토글
        draftAlarm[val] = !draftAlarm[val];
        btn.classList.toggle("on", draftAlarm[val]);
        setToggle("seg-mode","off", !draftAlarm.notify && !draftAlarm.sound);
      }
      updateAlarmFieldStates();
      return;
    }

    if (seg.id === "seg-mail-kinds") {
      // ★draftAlarm 은 alarmSettings 의 얕은 복사라 mailKinds 객체가 공유된다.
      //   그대로 고치면 [취소]로 닫아도 이미 반영돼 버리므로, 고치기 전에 반드시 복제한다.
      const mk = draftAlarm.mailKinds = { ...(draftAlarm.mailKinds || {}) };
      const nowOn = mk[val] !== false;
      mk[val] = !nowOn;
      btn.classList.toggle("on", mk[val]);
      return;
    }

    // 단일 선택 세그먼트
    seg.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("on"));
    btn.classList.add("on");
    if (seg.id === "seg-sound") {
      draftAlarm.soundType = val;
      if (val === "custom") {
        // '직접 추가' 버튼 = 항상 파일 선택(교체). 미리듣기는 아래 파일명 클릭.
        replaceCustomSound();
      } else {
        playPreview(val);
      }
    }
    else if (seg.id === "seg-default-alarm") draftAlarm.defaultAlarm = val;
    else if (seg.id === "seg-mail-open") onMailOpenMode(val);
  });

  // 커스텀 음원 파일 선택 (제한: 5MB, 10초, 오디오 형식)
  document.addEventListener("change", e => {
    if (e.target.id !== "custom-sound-input") return;
    const file = e.target.files[0];
    if (!file) return;
    // 형식 검증
    if (!file.type.startsWith("audio/")) { toast("오디오 파일만 추가할 수 있어요"); e.target.value=""; return; }
    // 용량 검증 (5MB)
    if (file.size > 5 * 1024 * 1024) { toast("음원은 5MB 이하만 가능해요"); e.target.value=""; return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      // 길이 검증 (10초)
      const probe = new Audio();
      probe.onloadedmetadata = () => {
        if (probe.duration > 10.5) { toast("음원은 10초 이하만 가능해요"); e.target.value=""; return; }
        draftAlarm.customSoundData = dataUrl;
        draftAlarm.customSoundName = file.name;
        draftAlarm.soundType = "custom";
        syncSegments();
        setSeg("seg-sound", "custom");
        playPreview("custom");
        toast("음원을 추가했어요");
      };
      probe.onerror = () => { toast("음원을 읽을 수 없어요", "err"); e.target.value=""; };
      probe.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });

  // 소리 미리듣기 (합성음 또는 커스텀 음원)
  let audioCtx, customAudio, customSrcNode, customGain;
  let customFadeT = null;
  // 음원 길이를 보고 끝나기 0.1초 전부터 음량을 0으로 디졸브 (툭 끊김 방지)
  function scheduleCustomFadeOut(v){
    clearTimeout(customFadeT);
    const arm = () => {
      const dur = customAudio.duration;
      if (!isFinite(dur) || dur <= 0.25) return; // 너무 짧은 음원은 생략
      customFadeT = setTimeout(() => {
        try {
          const now = audioCtx.currentTime;
          customGain.gain.cancelScheduledValues(now);
          customGain.gain.setValueAtTime(Math.max(customGain.gain.value || v, 0.0001), now);
          customGain.gain.linearRampToValueAtTime(0.0001, now + 0.1);
        } catch(e){}
      }, Math.max(0, (dur - 0.12) * 1000));
    };
    if (isFinite(customAudio.duration) && customAudio.duration > 0) arm();
    else customAudio.onloadedmetadata = arm;
  }
  function onVolSlide(v){ draftAlarm.volume = Number(v) / 100; const vv = $("vol-val"); if(vv) vv.textContent = v + "%"; }

  function playPreview(type, vol) {
    // 설정창이 열려 있으면 편집 중 값(draft), 닫혀 있으면 저장된 값 사용
    // (실제 알람은 설정창이 닫힌 상태에서 울리므로 — 이전엔 draft만 참조해 커스텀 소리가 누락되던 문제 수정)
    const _m = $("modal-settings");
    const src = (modalShown(_m) && typeof draftAlarm === "object" && draftAlarm) ? draftAlarm : alarmSettings;
    const v = Math.max(0, Math.min(2, typeof vol === "number" ? vol : (src.volume ?? 0.8)));
    if (type === "custom") {
      const data = src.customSoundData;
      if (!data) return;
      if (v <= 0) return;
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
        customAudio = customAudio || new Audio();
        // 200%까지 증폭하려면 Web Audio 게인 경유 (HTMLAudio.volume은 최대 1.0)
        if (!customSrcNode) {
          customSrcNode = audioCtx.createMediaElementSource(customAudio);
          customGain = audioCtx.createGain();
          customSrcNode.connect(customGain);
          customGain.connect(audioCtx.destination);
        }
        if (customAudio._data !== data) { customAudio.src = data; customAudio._data = data; }
        // 시작 0.1초 디졸브(페이드 인): 0 → 목표 음량
        const now0 = audioCtx.currentTime;
        customGain.gain.cancelScheduledValues(now0);
        customGain.gain.setValueAtTime(0.0001, now0);
        customGain.gain.linearRampToValueAtTime(v, now0 + 0.1);
        customAudio.currentTime = 0;
        customAudio.play();
        scheduleCustomFadeOut(v); // 끝 0.1초 디졸브 예약
      } catch (e) { /* 무시 */ }
      return;
    }
    if (v <= 0) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const now = audioCtx.currentTime;
      const peak = 0.25 * v;
      const presets = {
        ding:  [{f:880, t:0, d:0.3}],
        bell:  [{f:660, t:0, d:0.2}, {f:880, t:0.15, d:0.35}],
        chime: [{f:523, t:0, d:0.2}, {f:659, t:0.15, d:0.2}, {f:784, t:0.3, d:0.4}],
        alert: [{f:1000, t:0, d:0.12}, {f:1000, t:0.2, d:0.12}],
      };
      (presets[type] || presets.ding).forEach(n => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine"; osc.frequency.value = n.f;
        osc.connect(gain); gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0.0001, now + n.t);
        gain.gain.exponentialRampToValueAtTime(peak, now + n.t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
        osc.start(now + n.t); osc.stop(now + n.t + n.d + 0.05);
      });
    } catch (e) { /* 미리듣기 실패 무시 */ }
  }

  function renderPresetList() {
    const wrap = $("preset-list"); wrap.innerHTML = "";
    // 헤더
    const head = document.createElement("div");
    head.className = "preset-head";
    head.innerHTML = `<span class="ph-name">이름</span><span class="ph-time">시간</span><span></span>`;
    wrap.appendChild(head);
    draftPresets.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "preset-row";
      row.innerHTML = `
        <input type="text" size="1" class="preset-name" aria-label="프리셋 ${i + 1} 이름" value="${esc(p.name)}" placeholder="예: 오전" oninput="updatePreset(${i},'name',this.value)">
        <input type="text" size="1" class="preset-time" aria-label="프리셋 ${i + 1} 시각" value="${esc(p.time)}" placeholder="00:00" oninput="updatePreset(${i},'time',this.value)" onblur="normalizePresetTime(${i}, this)" onkeydown="if(event.key==='Enter'){event.preventDefault(); normalizePresetTime(${i}, this); this.blur();}">
        <button class="preset-del" onclick="delPreset(${i})" title="삭제">${IC.trash}</button>
      `;
      wrap.appendChild(row);
    });
  }
  function updatePreset(i, key, val) { draftPresets[i][key] = val; }
  function normalizePresetTime(i, el){
    const n = normalizeTime(el.value);
    if(n){ el.value = n; draftPresets[i].time = n; } // 1111 → 11:11, 9 → 09:00 등
  }
  function delPreset(i) {
    if (draftPresets.length <= 1) { toast("최소 1개는 있어야 해요"); return; }
    draftPresets.splice(i, 1); renderPresetList();
  }
  function addPreset() {
    if (draftPresets.length >= 5) { toast("프리셋은 최대 5개예요"); return; }
    draftPresets.push({ name: "새 프리셋", time: "12:00" }); renderPresetList();
  }
  function resetPresets() {
    draftPresets = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
    renderPresetList(); toast("기본값으로 초기화했어요");
  }

  // 설정 초기화 — 작업자(이름)·메일 연동·단축키는 그대로 두고 나머지를 기본값으로
  function resetSettings(){
    // 마감 프리셋 (드래프트 → 저장 시 적용)
    draftPresets = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
    renderPresetList();
    // 업무시간만 세기 끄기 + 09:00–18:00 + 설명 표시 켜기 (드래프트 → 저장 시 적용)
    draftWork = { ...WORK_DEFAULT };
    renderWorkHours();
    // 알람 방식/소리/반복/기본시점 + 커스텀 음원 제거 (드래프트 → 저장 시 적용)
    draftAlarm = { notify: true, sound: true, soundType: "ding", repeat: "1", defaultAlarm: "60", volume: 0.8, customSoundData: null, customSoundName: "",
                   mailKinds: { req: true, comment: true, assign: true }, mailFilterScope: "notify" };
    const inp = $("custom-sound-input"); if(inp) inp.value = "";
    syncSegments();
    // 메일 새로고침 주기 / 불러올 메일 수 (즉시 적용)
    // ★openMode 는 보존한다 — 초기화 원칙이 "작업자·메일 연동·단축키는 그대로 둔다"인데
    //   객체를 통째로 갈아치우면 "메일을 누르면" 설정이 말없이 Gmail 로 되돌아간다.
    mailSettings = { pollSec: 10, fetchCount: 100, openMode: mailSettings.openMode || "gmail" };
    saveMailSettings(); syncMailSliders(); restartMailPoll();
    // 시작 시 자동 실행 끄기 (즉시 적용)
    localStorage.setItem("autostart", "0");
    localStorage.setItem("autostartMin", "0");
    if(typeof window.timerAPI !== "undefined" && window.timerAPI.setAutostart) window.timerAPI.setAutostart(false);
    if(typeof window.timerAPI !== "undefined" && window.timerAPI.setAutostartMinimized) window.timerAPI.setAutostartMinimized(false);
    renderAutostart();
    // 상태 색상 기본값으로
    statusColors = {};
    localStorage.setItem("statusColors", "{}");
    applyStatusColors(); renderStatusColors();
    toast("설정을 초기화했어요");
  }
  function saveSettings() {
    // 검증: 시간 형식, 이름 빈값
    for (const p of draftPresets) {
      if (!p.name.trim()) { toast("프리셋 이름을 입력해 주세요"); return; }
      const nt = normalizeTime(p.time);
      if (!nt) { toast(`"${p.name}" 시간 형식이 올바르지 않아요 (예: 14:00)`, "err"); return; }
      p.time = nt; // 1111 등도 정규화해서 저장
    }
    // 업무시간 검증 — 토글 상태와 무관하게 항상(꺼진 채 저장된 값도 다음에 켤 때 그대로 쓰이므로). 실패 시 저장 중단·모달 유지(프리셋과 같은 방식).
    const ws = normalizeTime(draftWork.start), we = normalizeTime(draftWork.end);
    if(!ws || !we){ toast("업무시간 형식이 올바르지 않아요 (예: 09:00)", "err"); return; }
    if(hmToMin(we) <= hmToMin(ws)){ toast("퇴근 시간은 출근 시간보다 늦어야 해요"); return; }
    PRESETS = JSON.parse(JSON.stringify(draftPresets));
    alarmSettings = { ...draftAlarm, mailKinds: { ...(draftAlarm.mailKinds || {}) } };
    saveAlarmAndPresets(); // 재시작 후에도 유지(커스텀 음원 포함)
    workHours = { on: !!draftWork.on, start: ws, end: we, labels: draftWork.labels !== false };
    try { localStorage.setItem("workHours", JSON.stringify(workHours)); } catch(e){}
    workCfg = makeCfg(workHours);
    tick();   // 1초 안 기다리고 숫자·표식·색·상단 통계를 즉시 — 켜고 끄는 순간 카드가 바로 따라오게
    // 메일 종류 필터가 바뀌었을 수 있으므로 목록·배지를 즉시 다시 반영한다
    // (동기화·폴링은 그대로 돈다 — 필터는 표시/알림 단계에서만 걸린다)
    renderMailList(); setMailBadge();
    closeModal("modal-settings");
    toast("설정을 저장했어요");
  }

  // ── 업무시간만 세기 — 순수 계산 6개 (참조 구현 _audit/bizleft.js, node 테스트 bizleft.test.js 125건) ──
  // ★본 규칙 = 규칙 B(마감 당일 창 확장) — 사용자 결정 2026-09-18.
  //   마감일 D 이전 날들: 업무일의 [start,end) 만 센다(쉬는 날 0).
  //   D 당일: 쉬는 날이어도 세고, 창을 [D@start, max(D@end, ts)] 로 늘린다. bizLeft = Σ(이전 날) + overlap([now,ts], D 창).
  //   표식은 카드별: 지금이 그 카드의 D 창 안이면 흐르고 표식 없음(예: 금 19:00 에 '오늘 21:00' 카드), 창 밖이면 이유 표식.
  // cfg 규약: {startMin, endMin, labels}(분) 또는 null. null = 옵션 꺼짐 = 달력 경로(기존 계산 그대로, 라벨만 '초과').
  //   ★유효한 cfg 는 makeCfg 만 만든다(끝 > 시작). 그래도 하류는 null·역전 cfg 를 각자 달력 폴백으로 받는다 — "Infinityd NaNh" 가 나오지 않게.
  //   labels(「설명 표시」) 를 읽는 곳은 cdTextAt 게이트와 pauseLabel 첫 줄 둘뿐 — 색(urgency)·통계(updateStats)·정렬은 모른다.
  // 시간 규약: 전부 로컬 타임스탬프(ms). 한국 = DST 없음 가정.
  // ★nowTs/cfg/compact 를 전부 인자로 받는 순수 함수다(테스트가 '지금'을 고정한다). 앱 전역(Date.now·workCfg·innerWidth)은 맨 아래 래퍼 urgency()/cdText() 만 읽는다.
  function hmToMin(s){ const [h,m] = String(s).split(":").map(Number); return h*60 + m; }

  // 쉬는 날 — 주말 + 공휴일(내장 2026·2027 + KASI 주1회 머지). getHoliday 는 0 기반 월.
  function isOffDay(y, mo, d){ const w = new Date(y, mo, d).getDay(); return w === 0 || w === 6 || !!getHoliday(y, mo, d); }

  // 업무시간 기준 남은 ms(규칙 B).
  // ★마감이 과거·동시각이면 달력 차이(≤0)를 그대로 돌려준다 — over 판정·'+Nd Nh 초과' 가 손대지 않고 산다.
  // 하루 단위 루프 O(일수). 4000일 가드 = 시트 오타(연도 2062)·NaN 에도 멈추지 않는다(약 11년 뒤 마감은 전부 같은 상한값 — 정렬은 deadline 기준이라 실무 영향 없음).
  // ★규칙 B 는 단조가 아니다(금 23:30 마감 6.5h > 토 00:00 마감 1h) — 정렬은 deadline 기준이라 화면 순서엔 영향 없음.
  function bizLeft(nowTs, ts, cfg){
    if(!(ts > nowTs)) return ts - nowTs;
    if(!cfg || !(cfg.endMin > cfg.startMin)) return ts - nowTs;
    const cur = new Date(nowTs); cur.setHours(0,0,0,0);
    const endDay = new Date(ts).setHours(0,0,0,0);
    let total = 0;
    for(let g = 0; g < 4000; g++){
      const y = cur.getFullYear(), mo = cur.getMonth(), d = cur.getDate();
      const isD = cur.getTime() >= endDay;                        // 마감 당일
      if(isD || !isOffDay(y, mo, d)){
        const ws = new Date(y, mo, d, 0, cfg.startMin).getTime(), we0 = new Date(y, mo, d, 0, cfg.endMin).getTime();   // 분 인자 정규화 → 09:30 도 됨
        const we = isD ? Math.max(we0, ts) : we0;                 // D 당일만 창을 마감까지
        const a = Math.max(ws, nowTs), b = Math.min(we, ts);
        if(b > a) total += b - a;
      }
      if(isD) break;
      cur.setDate(cur.getDate() + 1);
    }
    return total;
  }

  // 오늘 다음 첫 업무일의 시작 시각 — '오늘마감'(orange) 의 첫 조건. cfg 없으면 NaN(비교가 전부 false 로 떨어져 green).
  function nextBizStart(nowTs, cfg){
    if(!cfg) return NaN;
    const d = new Date(nowTs); d.setHours(0,0,0,0);
    for(let g = 0; g < 400; g++){ d.setDate(d.getDate() + 1); if(!isOffDay(d.getFullYear(), d.getMonth(), d.getDate())) break; }
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, cfg.startMin).getTime();
  }

  // 공휴일 표식 — getHoliday 이름 그대로('추석'·'대체공휴일'), 단 6자 이상이면 '공휴일' 로 접는다.
  //   근거: ≤400px 슬롯 52px, 9.5px 600 ≈ 8.4px/자 → 5자 42px 안전, 6자 50.4px 위험. KASI 이름 길이는 통제 불가.
  function holidayLabel(name){ return name.length >= 6 ? "공휴일" : name; }

  // 지금 이 카드의 숫자가 왜 멈춰 있는지 — 카드 .l 슬롯. 카드별 판정(규칙 B): 마감일 D 당일이고 지금이 그 카드의 창
  //   [D@start, max(D@end, ts)] 안이면 ""(흐름). 그 밖은 지금 시각의 이유 — 주말 > 공휴일 이름 > 업무 전 > 업무 후, 업무시간 안이면 "".
  function pauseLabel(nowTs, ts, cfg){
    if(!cfg) return "";                                   // 옵션 꺼짐 = 표식 없음
    if(cfg.labels === false) return "";                   // 「설명 표시」 끔 = 표식 없음
    const n = new Date(nowTs), d = new Date(ts);
    if(n.getFullYear() === d.getFullYear() && n.getMonth() === d.getMonth() && n.getDate() === d.getDate()){   // 마감 당일
      const ws = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, cfg.startMin).getTime();
      const we = Math.max(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, cfg.endMin).getTime(), ts);
      if(nowTs >= ws && nowTs <= we) return "";           // 그 카드의 창 안 = 흐름. 닫힌 구간 — 마감 정각도 '업무 후' 가 아니라 표식 없음
    }
    const w = n.getDay();
    if(w === 0 || w === 6) return "주말";
    const hol = getHoliday(n.getFullYear(), n.getMonth(), n.getDate());
    if(hol) return holidayLabel(hol);
    const min = n.getHours()*60 + n.getMinutes();
    if(min < cfg.startMin) return "업무 전";
    if(min >= cfg.endMin) return "업무 후";
    return "";
  }

  // ★반환값이 .task / .count 의 클래스로 그대로 쓰인다. "over" 를 추가하면 네 곳이 같이 바뀌어야 한다 —
  //   ① tick() 의 classList.remove 목록 ② updateStats() 의 집계 ③ .task.over / .count.over CSS
  //   ④ tick() 의 '초과' 라벨 생성. 하나라도 빠지면 지난 카드가 색을 잃거나 '여유 있음'으로 세어진다.
  // cfg 가 null 이면 기존 달력 경로와 바이트 동일한 계산.
  function urgencyAt(nowTs, ts, cfg) {
    if(cfg && !(cfg.endMin > cfg.startMin)) cfg = null;   // 역전·NaN cfg → 달력 경로 (makeCfg 를 거치지 않은 cfg 방어)
    if(cfg){                                       // 업무시간만 세기 — over 는 달력, red 는 업무시간(규칙 B), orange 는 다음 업무일 시작 전 + 하루 미만
      if(ts < nowTs) return "over";
      const left = bizLeft(nowTs, ts, cfg);
      if(left < 3*3600000) return "red";
      // orange 정합 — 'Nd Nh' 와 주황이 한 카드에 나오지 않게, 숫자 형식(cdTextAt)과 같은 기준을 쓴다:
      //   마감이 달력상 오늘이거나 bizLeft < dayMs(끝−시작) 일 때만 주황. 규칙 B 는 마감 당일을 통째로 세므로
      //   금 17:00 의 일 18:00 마감이 10h = '1d 1h' 인데 주황(ts ≤ 월 09:00)이 되는 조합이 생겼었다 → 초록.
      const sameDay = new Date(nowTs).setHours(0,0,0,0) === new Date(ts).setHours(0,0,0,0);
      const dayMs = (cfg.endMin - cfg.startMin) * 60000;
      if(ts <= nextBizStart(nowTs, cfg) && (sameDay || left < dayMs)) return "orange";
      return "green";
    }
    const left=ts-nowTs;
    if(left<0) return "over";          // 마감 넘김 — 3시간 남은 작업과 같은 칸·같은 빨강에 두지 않는다
    if(left<3*3600000) return "red";
    const eod=new Date(nowTs); eod.setHours(23,59,59,999);
    if(ts<=eod.getTime()) return "orange";
    return "green";
  }
  // 반환 규약 {t, l}. l 은 ''|'업무 전'|'업무 후'|'주말'|공휴일 이름(≤5자, 아니면 '공휴일')|'초과'. compact = 창 폭 ≤400px(초 없음).
  //   ★cfg.labels === false(「설명 표시」 끔)면 l 은 항상 '' — 「초과」도 숨는다. t·색은 그대로. cfg null 이면 게이트를 지나지 않아 「초과」 그대로.
  // d 단위 규칙(켜짐): 마감이 '오늘'(달력 같은 날)이면 항상 HH:MM:SS — 업무 전에 본 오늘 마감이 '1d 0h' 로 뜨지 않게.
  //   그 외엔 days = floor(left / dayMs). 그래서 월 18:00 마감은 금 17:59:59 도 18:00:00 도 '1d 0h' — 숫자 형태가
  //   멈추는 순간(퇴근 시각)에 바뀌지 않는다. 형태가 바뀌는 때는 마감일 자정(1d 0h → 09:00:00 · 업무 전)뿐.
  function cdTextAt(nowTs, ts, cfg, compact) {
    if(cfg && !((cfg.endMin - cfg.startMin) > 0)) cfg = null;   // 역전·NaN cfg → 달력 경로 (dayMs ≤ 0 이면 아래 나눗셈이 깨진다)
    // ★「설명 표시」 끔 — 같은 cfg 에서 labels 만 뗀 채 한 번 더 계산해 t 만 쓴다. 아래 본체(초과 분기 포함)는 그대로라 null 경로가 변하지 않는다.
    if(cfg && cfg.labels === false) return { t: cdTextAt(nowTs, ts, { startMin: cfg.startMin, endMin: cfg.endMin }, compact).t, l: "" };
    let left=ts-nowTs;
    if(left<0){
      left=-left;
      const days=Math.floor(left/86400000),h=Math.floor((left%86400000)/3600000),m=Math.floor((left%3600000)/60000);
      // 미래 쪽엔 이미 있던 일 단위 분기가 음수에만 없어 사흘 지난 건이 +74:12 로 나왔다.
      // 최장 '+29d 23h' = 8자, 15px 모노로 약 68px < .count min-width 78px(≤560px).
      if(days>0) return {t:`+${days}d ${h}h`,l:"초과"};
      return {t:`+${h}:${String(m).padStart(2,"0")}`,l:"초과"};
    }
    if(cfg){                                        // 켜짐: 단위 d = 업무일(끝−시작), 표식 = pauseLabel(카드별). 초과는 위에서 달력으로 끝났다.
      left = bizLeft(nowTs, ts, cfg);
      const dayMs = (cfg.endMin - cfg.startMin) * 60000;
      const sameDay = new Date(nowTs).setHours(0,0,0,0) === new Date(ts).setHours(0,0,0,0);
      const days = sameDay ? 0 : Math.floor(left/dayMs);         // ★오늘 마감은 항상 HH:MM:SS, 그 외 floor
      const rem = days ? left % dayMs : left;
      const h=Math.floor(rem/3600000), m=Math.floor((rem%3600000)/60000), s=Math.floor((rem%60000)/1000);
      const l = pauseLabel(nowTs, ts, cfg);
      if(days>0) return {t:`${days}d ${h}h`,l};
      if(compact) return {t:`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`,l};
      return {t:`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`,l};
    }
    const days=Math.floor(left/86400000),h=Math.floor((left%86400000)/3600000),m=Math.floor((left%3600000)/60000),s=Math.floor((left%60000)/1000);
    if(days>0) return {t:`${days}d ${h}h`,l:""};
    // 매우 좁을 땐 초 제거 (시:분만)
    if(compact) return {t:`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`,l:""};
    return {t:`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`,l:""};
  }
  // 앱 래퍼 — 호출처(tick·updateStats·card)는 그대로. 전역(지금·workCfg·창 폭)은 여기서만 읽는다.
  function urgency(ts) { return urgencyAt(Date.now(), ts, workCfg); }
  function cdText(ts) { return cdTextAt(Date.now(), ts, workCfg, window.innerWidth <= 400); }

  function updateStats() {
    const a=tasks.filter(t=>!t.done); let r=0,o=0,g=0;
    // ★상단 통계 칸은 3개 그대로다(s-red/s-orange/s-green). urgency 가 "over" 를 돌려주기 시작하면
    //   else 로 떨어져 마감 넘긴 작업이 '여유 있음'으로 세어진다 — 정확히 반대 신호다.
    a.forEach(t=>{const u=urgency(t.deadline); if(u==="over"||u==="red")r++;else if(u==="orange")o++;else g++;});
    $("s-red").textContent=r; $("s-orange").textContent=o; $("s-green").textContent=g;
  }

  // ── 타이머 알람 발화 ──
  // 작업별 'N분 전' 시점에 도달하면 알림(메인 프로세스 → 트레이 상태에서도 옴) + 소리.
  // 이미 지난 알람(앱 시작 시 과거분)은 울리지 않게 표시만 한다.
  // ⚠ 키는 반드시 timeKey(안정 키)다. 행 번호(t.id)로 잡으면
  //   좌/우 단이 행 번호를 공유하고 삭제 compaction 으로도 번호가 밀려,
  //   남의 작업이 남긴 번호 때문에 내 작업이 벙어리가 된다.
  const firedAlarms = new Set();
  function checkAlarms(){
    if(typeof window.timerAPI === "undefined") return;        // 앱에서만
    if(!alarmSettings.notify && !alarmSettings.sound) return;  // 알람 꺼짐
    const now = Date.now();
    myTasks.forEach(t => {                                    // ★보는 보드가 아니라 내 보드
      if(t.done || t.alarm == null) return;
      const key = timeKey(t.reqLink, t.title);
      if(firedAlarms.has(key)) return;
      const offset = Number(t.alarm) || 0;                    // 분
      const alarmAt = t.deadline - offset * 60000;
      if(now >= alarmAt){
        firedAlarms.add(key);
        if(now - alarmAt < 90000) fireAlarm(t, offset);       // 방금 도달한 것만 울림
      }
    });
  }
  function playAlarmSound(){
    try { playPreview(alarmSettings.soundType === "custom" ? "custom" : (alarmSettings.soundType || "ding"), alarmSettings.volume); } catch(e){}
  }
  function fireAlarm(t, offset){
    const when = offset >= 60 ? (offset/60) + "시간 전" : (offset > 0 ? offset + "분 전" : "지금");
    const body = `${t.title} · 마감 ${when}`;
    if(alarmSettings.notify && window.timerAPI.notify) window.timerAPI.notify("작업 마감 알림", body);
    if(alarmSettings.sound) playAlarmSound();
  }

  function tick() {
    updateStats();
    checkAlarms();
    let reorder=false;
    const byId = new Map(tasks.map(x => [x.id, x]));
    document.querySelectorAll(".task[data-id]").forEach(card=>{
      const id=+card.dataset.id; const t=byId.get(id);
      if(!t||t.done)return;
      const u=urgency(t.deadline), cd=cdText(t.deadline);
      const cEl=card.querySelector(".count");
      const tEl=card.querySelector(".count .t");
      if(tEl&&tEl.textContent!==cd.t){
        // textContent 대입은 텍스트 노드를 통째로 갈아끼워 childList 변이를 만든다 →
        // #list 에 걸린 오버레이 스크롤바 MutationObserver({childList,subtree})가 매초 깨어나
        // scrollHeight/clientHeight 를 읽어 강제 레이아웃을 만든다. 같은 노드의 nodeValue 만
        // 바꾸면 characterData 라 관찰 대상이 아니다(표시는 완전히 동일).
        const tn=tEl.firstChild;
        if(tn&&tn.nodeType===3&&!tn.nextSibling) tn.nodeValue=cd.t; else tEl.textContent=cd.t;
      }
      // ★'초과'·멈춘 이유 라벨은 반드시 여기서 만들고 지워야 한다. red→over 는 마감 시각이 그대로라
      //   정렬 순서가 안 바뀌고, reorderCards() 는 순서 문자열이 같으면 render() 를 건너뛴다
      //   → card() 가 다시 안 돌아 라벨이 영영 안 생긴다.
      const lEl=cEl?cEl.querySelector(".l"):null;
      if(cEl&&cd.l){
        if(!lEl){ const d=document.createElement("div"); d.className="l"; d.textContent=cd.l; cEl.appendChild(d); }
        else if(lEl.textContent!==cd.l) lEl.textContent=cd.l;
      } else if(lEl) lEl.remove();
      if(!card.classList.contains(u)){
        card.classList.remove("red","orange","green","over"); card.classList.add(u);
        if(cEl){ cEl.classList.remove("red","orange","green","over"); cEl.classList.add(u); }
        reorder=true;
      }
    });
    if(reorder)reorderCards();
  }
  function reorderCards() {
    const a=tasks.filter(t=>!t.done).sort((x,y)=>x.deadline-y.deadline);
    const o=a.map(t=>t.id).join(",");
    if(o!==lastOrder){ lastOrder=o; render(); }
  }

  // 공통 접이식 섹션 래퍼 (진행 중 / 완료 / 관리 항목 공용)
  function sectionGroup(key, label, count, inner, extra){
    const col = collapsedState[key] ? " collapsed" : "";
    return `<div class="sec-group${col}" id="sec-${key}">
      <div class="sec-head" role="button" tabindex="0" aria-expanded="${collapsedState[key] ? "false" : "true"}" onclick="toggleSec('${key}')">
        <svg class="chev" viewBox="0 0 20 20"><path d="M6 8l4 4 4-4"/></svg>
        <span class="sh-label">${label} · ${count}</span><span class="ln"></span>${extra || ""}
      </div>
      <div class="sec-body" id="body-${key}">${inner}</div>
    </div>`;
  }
  function toggleSec(key){
    collapsedState[key] = !collapsedState[key];
    const sh = document.querySelector("#sec-" + key + " > .sec-head"); if (sh) sh.setAttribute("aria-expanded", collapsedState[key] ? "false" : "true");
    localStorage.setItem("secCollapsed", JSON.stringify(collapsedState));
    const g = $("sec-" + key);
    if(g) g.classList.toggle("collapsed", collapsedState[key]);
  }

  // ── 관리 항목 편집/삭제 (updateMemo) ──
  function mgmtFind(row){ return mgmtItems.find(m => m.row === row); }
  // 관리항목 행 지문 — 읽어 온 그대로의 B·C(고치기 전 값). 위에서 행이 끼어 밀렸으면 서버(v64+)가 stale 로 거부한다.
  // 낙관적 반영으로 m[col] 은 이미 새 값이라 고치기 전 값(prev)을 보낸다.
  function mgmtFp(m, col, prev){
    // 고치는 칸만 보낸다 — 같은 행 다른 칸의 진행 중 쓰기(낙관적 값)와 얽혀 엉뚱하게 stale 이 나지 않게(검수 지적)
    return col === "b" ? { expectB: prev || "" } : { expectC: prev || "" };
  }

  // 관리항목 휴지통도 확인 후 삭제(카드 휴지통과 같게). 창이 떠 있는 사이 행이 바뀌면 지문(expectB/C)이 서버에서 막는다.
  function askDelMgmt(row, col){
    if(isReadonly()){ toast("다른 팀원 보드는 읽기 전용이에요"); return; }
    const m = mgmtFind(row); if(!m) return;
    const text = String(m[col] || "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
    const seen = m[col];   // 확인 창이 떠 있는 사이 목록이 바뀌어도 「내가 본 그 메모」만 지운다
    openConfirm("관리 항목 삭제", `「${text.length > 40 ? text.slice(0, 40) + "…" : text}」을(를) 삭제할까요? 시트에서도 지워져요.`, "삭제", () => deleteMgmt(row, col, seen));
  }
  // seen: 사용자가 화면에서 보고 고른 값. 그 사이 동기화로 같은 행 번호에 다른 메모가 왔으면 쓰지 않는다(엉뚱한 메모 삭제·덮어쓰기 방지).
  function mgmtSeenGone(m, col, seen){
    if (seen === undefined) return false;
    if (m && String(m[col] || "") === String(seen || "")) return false;
    toast("그 사이 목록이 바뀌었어요 — 다시 불러올게요", "err"); renderMgmt(true); doSync({ silent:true });
    return true;
  }
  async function deleteMgmt(row, col, seen){
    if(isReadonly()){ toast("다른 팀원 보드는 읽기 전용이에요"); return; } 
    if(!row || row < 1){ toast("추가 반영 중이에요. 잠시 후 다시 시도해 주세요"); return; }
    const myName = getMyName();
    if(!myName || typeof window.timerAPI === "undefined") { toast("앱에서만 동작해요"); return; }
    const m = mgmtFind(row);
    if(mgmtSeenGone(m, col, seen)) return;
    if(!m) return;
    const prev = m[col];               // 롤백용 원본
    m[col] = "";                       // ① 즉시 반영
    renderMgmt();
    const payload = { action:"updateMemo", targetMember:myName, row, ...mgmtFp(m, col, prev) };
    payload[col === "b" ? "memoB" : "memoC"] = "";
    const r = await postSheetTracked(payload);            // ② 백그라운드 기록
    if(r && r.ok){ toast("관리 항목을 삭제했어요"); }       // ③ 결과 알림
    else { afterMgmtWriteFail(r, () => { m[col] = prev; }, "삭제 실패 — 되돌렸어요"); }
  }

  function editMgmt(row, col){
    if(isReadonly()){ toast("다른 팀원 보드는 읽기 전용이에요"); return; } 
    if(!row || row < 1){ toast("추가 반영 중이에요. 잠시 후 다시 시도해 주세요"); return; }
    if (mgmtEditing) renderMgmt(true);   // 다른 항목을 편집하던 중이면 그 입력칸부터 닫는다(입력칸이 둘 생기지 않게)
    const el = document.querySelector(`.mgmt-item[data-row="${row}"][data-col="${col}"]`);
    const m = mgmtFind(row);
    if(!el || !m) return;
    el.classList.add("editing");
    const cur = m[col] || "";
    const textEl = el.querySelector(".mgmt-text");
    const acts = el.querySelector(".mgmt-acts");
    textEl.outerHTML = `<div class="mgmt-edit"><input type="text" id="medit-input" onpaste="memoPasteLink(event)"></div>`;
    acts.innerHTML =
      `<button class="mact save" title="저장"><svg viewBox="0 0 20 20"><path d="M5 10l3.5 3.5L15 6"/></svg></button>` +
      `<button class="mact" title="취소"><svg viewBox="0 0 20 20"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/></svg></button>`;
    const input = el.querySelector("#medit-input");
    const shown = cur.replace(/\[(https?:\/\/[^\]\s]+)\]\(\1\)/g, "$1");   // 「[주소](주소)」는 주소만 보여 준다(저장 때 다시 링크)
    input.value = shown; input.focus(); input.select();
    mgmtEditing = { view: viewName };
    const save = () => { mgmtEditing = false; commitMgmt(row, col, input.value, cur, shown); };
    const cancel = () => { mgmtEditing = false; renderMgmt(true); };
    acts.children[0].onclick = save;
    acts.children[1].onclick = cancel;
    input.onkeydown = (e) => {
      if(e.key === "Enter"){ e.preventDefault(); save(); }
      else if(e.key === "Escape"){ e.preventDefault(); cancel(); }
    };
  }

  async function commitMgmt(row, col, text, seen, shown){
    if (shown !== undefined && String(text).trim() === String(shown).trim()) { renderMgmt(true); return; }   // 보여 준 그대로면 쓰지 않는다
    const myName = getMyName();
    if(!myName || typeof window.timerAPI === "undefined") { toast("앱에서만 동작해요"); return; }
    const m = mgmtFind(row);
    if(mgmtSeenGone(m, col, seen)) return;
    if(!m) return;
    const val = linkifyMemo(String(text).trim());
    const prev = m[col];               // 롤백용 원본
    if(val === String(prev || "")) { renderMgmt(); return; }  // 변경 없으면 그냥 닫기
    m[col] = val;                      // ① 즉시 반영
    renderMgmt();
    const payload = { action:"updateMemo", targetMember:myName, row, ...mgmtFp(m, col, prev) };
    payload[col === "b" ? "memoB" : "memoC"] = val;
    const r = await postSheetTracked(payload);            // ② 백그라운드 기록
    if(r && r.ok){ toast("저장했어요"); }                   // ③ 결과 알림
    else { afterMgmtWriteFail(r, () => { m[col] = prev; }, "저장 실패 — 되돌렸어요"); }
  }

  // ── 관리 항목 추가 (addMemo) ──
  function startAddMgmt(){
    if(isReadonly()){ toast("다른 팀원 보드는 읽기 전용이에요"); return; } 
    collapsedState.mgmt = false; // 추가 시 섹션 펼침
    localStorage.setItem("secCollapsed", JSON.stringify(collapsedState));
    mgmtEditing = false;   // 편집 중이던 입력칸은 닫고 추가 칸을 그린다
    mgmtAdding = true;
    mgmtAddDraft = "";
    renderMgmt(); // 포커스는 renderMgmt가 처리
  }
  function cancelAddMgmt(){ mgmtAdding = false; mgmtAddDraft = ""; renderMgmt(); }
  async function submitAddMgmt(text){
    const val = linkifyMemo(String(text).trim());
    if(!val){ cancelAddMgmt(); return; }
    const myName = getMyName();
    if(!myName || typeof window.timerAPI === "undefined"){ toast("앱에서만 동작해요"); return; }
    // 앞서 같은 글이 시간 초과로 끝났으면(서버엔 들어갔을 수 있다) 먼저 새로 받아 보고, 이미 있으면 또 보내지 않는다.
    // 작업 추가의 dupCheck 와 같은 생각 — 서버 addMemo 에는 중복 검사가 없어 앱이 한다.
    const memoKey = myName + "\n" + val;
    // ★센 대상은 「내」 관리 항목 — 확인을 기다리는 사이 다른 팀원 보드로 넘어가면 mgmtItems 가 그 사람 것이 된다(v1.0.48, 4차 채점)
    const myMgmt = () => { const me = (allMembersData || []).find(x => x.name === myName); return me ? (me.mgmt || []) : (isReadonly() ? [] : mgmtItems); };
    const sameMemo = () => myMgmt().filter(m => !m._temp && (String(m.b || "").trim() === val || String(m.c || "").trim() === val)).length;
    mgmtAdding = false;            // ★기다리기 전에 입력칸부터 닫는다 — 확인 중에 Enter 를 또 누르거나 Esc 로 취소한 뒤에 나가는 일이 없게
    mgmtAddDraft = "";
    const memo0 = timedOutMemos[memoKey];
    if (memo0 && memo0.until > Date.now()) {
      renderMgmt(true);
      const seq = syncAppliedSeq;
      await doSync({ silent: true });
      if (syncAppliedSeq === seq) {
        if (!isReadonly()) { mgmtAdding = true; mgmtAddDraft = String(text); renderMgmt(true); }   // 친 글은 입력칸에 되살려 둔다
        toast("앞서 보낸 것이 들어갔는지 확인하지 못했어요 — 잠시 뒤 다시 시도해 주세요", "err"); return;
      }
      if (sameMemo() > memo0.n0) {   // 시간 초과 때보다 같은 글이 늘었다 = 그때 이미 들어갔다
        delete timedOutMemos[memoKey];
        toast("앞서 보낸 관리 항목이 이미 들어가 있어요");
        return;
      }
    }
    const n0 = sameMemo();
    const temp = { row: -1, b: val, c: "", done: false, _temp: true };  // ① 즉시 표시(내 보드를 보고 있을 때만)
    if (!isReadonly()) { mgmtItems.push(temp); renderMgmt(); }
    const r = await postSheetTracked({ action:"addMemo", targetMember:myName, text:val });  // ② 기록
    if (r && r.timeout) timedOutMemos[memoKey] = { until: Date.now() + 10 * 60000, n0 };
    else if (!(r && r.busy)) delete timedOutMemos[memoKey];   // busy = 확실히 안 들어감, 앞선 기억은 그대로
    if(r && r.ok){ toast("관리 항목을 추가했어요"); await doSync({ silent:true }); }  // ③ 행번호 reconcile
    else { afterMgmtWriteFail(r, () => { mgmtItems = mgmtItems.filter(x => x !== temp); }, "추가 실패 — 되돌렸어요"); }
  }

  // 관리 항목 섹션 HTML. B·C를 각각 별개 항목으로 분리, 시트 순서 그대로.
  function mgmtSectionHtml(){
    if(!mgmtItems.length && !mgmtAdding) return "";
    // 각 행의 B/C를 동등한 별개 항목으로 펼침 (col: 편집 시 어느 셀인지 식별용)
    const flat = [];
    mgmtItems.forEach(m => {
      const temp = !!m._temp || !m.row || m.row < 1;
      if(m.b && m.b.trim()) flat.push({ row:m.row, col:"b", text:m.b, done:m.done, temp });
      if(m.c && m.c.trim()) flat.push({ row:m.row, col:"c", text:m.c, done:m.done, temp });
    });
    let rows = "";
    flat.forEach(it => {
      const acts = it.temp
        ? `<div class="mgmt-acts"><span class="mgmt-pending">반영 중…</span></div>`
        : `<div class="mgmt-acts">`
          +   `<button class="mact" onclick="editMgmt(${it.row},'${it.col}')" title="편집">${IC.edit}</button>`
          +   `<button class="mact del" onclick="askDelMgmt(${it.row},'${it.col}')" title="삭제" aria-label="삭제">${IC.trash}</button>`
          + `</div>`;
      rows += `<div class="mgmt-item${it.done?' done':''}${it.temp?' pending':''}" data-row="${it.row}" data-col="${it.col}">`
        + `<span class="pin"></span>`
        + `<div class="mgmt-text">${mdLinks(it.text)}</div>`
        + acts
        + `</div>`;
    });
    if(mgmtAdding){
      rows += `<div class="mgmt-item adding"><span class="pin"></span>`
        + `<div class="mgmt-edit"><input type="text" id="madd-input" aria-label="새 관리 항목" placeholder="새 관리 항목 · 주소를 붙여 넣으면 링크" onpaste="memoPasteLink(event)" value="${esc(mgmtAddDraft)}" oninput="mgmtAddDraft=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();submitAddMgmt(this.value)}else if(event.key==='Escape'){event.preventDefault();cancelAddMgmt()}"></div>`
        + `<div class="mgmt-acts">`
        +   `<button class="mact save" title="추가" onclick="submitAddMgmt(document.getElementById('madd-input').value)"><svg viewBox="0 0 20 20"><path d="M5 10l3.5 3.5L15 6"/></svg></button>`
        +   `<button class="mact" title="취소" onclick="cancelAddMgmt()"><svg viewBox="0 0 20 20"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/></svg></button>`
        + `</div></div>`;
    }
    const addBtn = `<button class="add-mgmt" onclick="event.stopPropagation(); startAddMgmt()"><svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12"/></svg><span>추가</span></button>`;
    return sectionGroup("mgmt", "관리 항목", flat.length, rows, addBtn);
  }

  // #list 안을 관리 항목(mgmt-host) / 작업(task-host) 두 컨테이너로 분리.
  // 작업 액션 시 task-host만 다시 그려 관리 항목 DOM은 건드리지 않음(깜빡임 방지).
  function ensureHosts(){
    const list = $("list");
    if(!$("task-host")){
      list.innerHTML = '<div id="mgmt-host"></div><div id="task-host"></div>';
    }
  }
  // 메모를 고치는 중(입력칸이 떠 있음)이면 동기화가 와도 다시 그리지 않는다 — 다시 그리면 입력하던 글자가 사라진다.
  // 저장·취소 때 mgmtEditing 을 풀고 그 자리에서 다시 그린다.
  let mgmtEditing = false;
  function renderMgmt(force){
    ensureHosts();
    // 보드가 바뀌었으면(팀원 보드로 넘김) 편집은 끝난 것 — 그 보드의 목록을 그린다
    if (mgmtEditing && !force && mgmtEditing.view === viewName && document.getElementById("medit-input")) return;
    mgmtEditing = false;
    $("mgmt-host").innerHTML = mgmtSectionHtml();
    if(mgmtAdding){
      const inp = $("madd-input");
      if(inp){ inp.focus(); const v = inp.value; inp.value = ""; inp.value = v; } // 커서 끝으로
    }
  }

  function render() {
    if (window.__hideTooltip) window.__hideTooltip(); // 재렌더 시 떠있던/대기중 툴팁 정리
    ensureHosts();
    const host = $("task-host");
    // FLIP은 "같은 보드를 다시 그릴 때"만 (마감 변경 등 순서 이동). 팀원 전환 시엔 끔.
    // 좌/우 단이 행 번호를 공유해서, 전환 시 data-id가 겹치면 카드가 엉뚱하게 멀리서 날아옴.
    const sameBoard = (lastRenderView === viewName);
    lastRenderView = viewName;
    // FLIP: 기존 카드들의 위치 기록 (같은 보드일 때만)
    const prevPos = {};
    if (sameBoard) {
      host.querySelectorAll(".task[data-id]").forEach(el => {
        prevPos[el.dataset.id] = el.getBoundingClientRect().top;
      });
    }

    const active=tasks.filter(t=>!t.done).sort((a,b)=>a.deadline-b.deadline);
    const done=tasks.filter(t=>t.done);
    updateStats();
    let html="";
    if(active.length){ html+=sectionGroup("active","진행 중",active.length, active.map(card).join("")); }
    if(done.length){ html+=sectionGroup("done","완료",done.length, done.map(card).join(""), `<button class="clear-done" onclick="event.stopPropagation(); clearDone()">${IC.trash}<span>비우기</span></button>`); }
    if(!tasks.length && !mgmtItems.length) html=`<div class="empty">${IC.inbox}<div class="msg">작업이 없어요. 인트라넷 요청글에서 딸깍으로 보내거나<br>[＋] 로 직접 추가해 보세요.<br><a href="#" class="doc-link" onclick="event.preventDefault(); openDocs()">설명서 보기</a></div></div>`;
    host.innerHTML=html;
    lastOrder=active.map(t=>t.id).join(",");

    // FLIP: 새 위치와 비교해 부드럽게 이동 (같은 보드일 때만)
    if (sameBoard) {
      const flipReduced = reducedMotion();
      host.querySelectorAll(".task[data-id]").forEach(el => {
        const id = el.dataset.id;
        const prev = prevPos[id];
        if (prev === undefined) { el.classList.add("card-new"); return; } // 진짜 새 카드만 cardIn
        if (flipReduced) return;                    // 모션 최소화: 이동 애니메이션 없이 제자리에 도착
        const now = el.getBoundingClientRect().top;
        const delta = prev - now;
        if (Math.abs(delta) < 1) return;
        el.style.animation = "none";
        el.style.transform = `translateY(${delta}px)`;
        el.style.transition = "transform 0s";
        // ★끝나면 인라인 스타일을 반드시 지운다. 인라인 transition 은 단축 속성이라
        //   .task 의 전이 목록(border-color/box-shadow/transform 0.13s + 이번에 추가되는
        //   border-left-color·background-color 0.4s)을 통째로 대체한다 →
        //   한 번이라도 이동한 카드만 hover 와 '초과' 전환이 다른 속도로 논다.
        //   animation:none 이 남으면 그 카드는 이후 cardIn/itemIn 도 못 탄다.
        const clearFlip = () => { el.style.transition = ""; el.style.transform = ""; el.style.animation = ""; };
        requestAnimationFrame(() => {
          el.style.transition = "transform 0.4s cubic-bezier(0.16,1,0.3,1)";
          el.style.transform = "";
          el.addEventListener("transitionend", function onEnd(ev){
            if (ev.propertyName !== "transform") return;
            el.removeEventListener("transitionend", onEnd);
            clearFlip();
          });
          setTimeout(clearFlip, 500); // transitionend 가 안 오는 경우(창 숨김·전이 중 재렌더) 보험
        });
      });
    }
  }
  function card(t) {
    const u=urgency(t.deadline), cd=cdText(t.deadline);
    const compact = window.innerWidth <= 400;
    const tag=t.type==="req"?'<span class="chip-tag req sub-extra">인트라넷</span>':'<span class="chip-tag sub-extra">직접추가</span>';
    // sub-extra 를 뗀다 — 그 클래스는 stats-compact(937행)·≤400px(964행)에서 통째로 display:none 이라
    // 440px 에서는 알람 표시가 항상 사라졌다. 텍스트만 .al-t 로 감싸 CSS 가 접고 벨은 남긴다.
    const alTxt=t.alarm?((t.alarm>=60?(t.alarm/60)+"시간":t.alarm+"분")+" 전"):"";
    const alarm=t.alarm?`<span class="meta-text meta-alarm" title="알람 ${esc(alTxt)}">${IC.bell}<span class="al-t">${esc(alTxt)}</span></span>`:"";
    // ★제목·링크는 시트에서 온 값이다(팀원 7명이 직접 편집). esc() 없이 넣으면
    //   'A<B' 같은 평범한 제목이 태그로 파싱돼 카드 레이아웃이 무너지고 마감·링크가 제목 안으로 빨려 들어간다.
    //   같은 파일의 다른 렌더러(메일 목록·관리항목·프로필)는 전부 esc() 를 거친다 — 여기만 빠져 있었다.
    // href 에는 웹 주소만 넣는다. NAS 경로 같은 글자는 아이콘만 그대로 두고 누르면 안내(아래 클릭 처리).
    const reqBtn=t.reqLink?`<a class="link-mini" href="${esc(webUrl(t.reqLink))}" target="_blank" title="요청글 링크" aria-label="요청글 링크" onclick="event.stopPropagation()">${IC.link}</a>`:"";
    const planBtn=t.planLink?`<a class="link-mini" href="${esc(webUrl(t.planLink))}" target="_blank" title="기획안 링크" aria-label="기획안 링크" onclick="event.stopPropagation()">${IC.deck}</a>`:"";
    const links=(reqBtn||planBtn)?`<span class="link-group">${reqBtn}${planBtn}</span>`:"";
    // ★_status·_memo 도 시트 값이다(2186행 매핑, 팀원 7명이 셀을 직접 편집).
    //   제목·링크와 완전히 같은 이유로 esc() 를 거친다 — 상태 셀의 '<수정>' 한 마디가 카드 DOM 을 깨뜨린다.
    //   title 속성에도 넣으므로 esc 의 &quot; 치환이 여기서도 필요하다. _memo 를 읽는 첫 코드다.
    const st=String(t._status||"").trim(), mm=String(t._memo||"").trim();
    const memo=mm?`<div class="task-memo" title="${esc(mm)}"><span>${esc(mm)}</span></div>`:"";
    // 완료 카드: 통째로 비어 있던 카운트다운 슬롯(440px 에서 78px)에 상태 — 카드 높이 증가 0.
    // 진행 중 카드: 마감 넘김이면 cd.l("초과"), 업무시간만 세기가 켜져 멈췄으면 이유(업무 전·업무 후·주말·공휴일 이름)가 .l 슬롯에 들어간다(absolute — 폭·높이 영향 0).
    // ★공휴일 이름은 KASI API(외부)에서 주1회 머지된 값이다 — 제목·상태와 같은 이유로 esc() 를 거친다. tick() 쪽은 textContent 라 안전.
    const countInner = t.done
      ? (st ? `<div class="cst" title="${esc(st)}">${esc(st)}</div>` : `<div class="t"></div>`)
      : `<div class="t">${cd.t}</div>${cd.l?`<div class="l">${esc(cd.l)}</div>`:""}`;
    return `<div class="task ${u} ${t.done?'done':''}" data-id="${t.id}" onclick="openTaskReq(${t.id}, event)" style="cursor:pointer">
      <div class="check ${t.done?'on':''}" role="button" tabindex="0" aria-label="${t.done?'완료 취소':'완료'}" onclick="toggleDone(${t.id})">${IC.check}</div>
      <div class="task-main">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-sub">${tag}<span class="meta-text meta-deadline" title="마감 시간 설정" onclick="event.stopPropagation(); openTimeEdit(${t.id})" style="cursor:pointer">${fmtDl(t.deadline, compact)}</span>${alarm}${links}</div>
        ${memo}
      </div>
      <div class="count ${u}">${countInner}</div>
      <div class="actions">
        <button class="act" onclick="openEdit(${t.id})" title="편집">${IC.edit}</button>
        <button class="act del" onclick="askDelTask(${t.id})" title="삭제" aria-label="삭제">${IC.trash}</button>
      </div>
    </div>`;
  }

  function openTaskReq(id, e){
    // 버튼·체크·링크·마감칩 영역 클릭은 각자 동작 유지 (카드 이동 무시)
    if(e && e.target && e.target.closest && e.target.closest(".check, .actions, a.link-mini, .meta-deadline")) return;
    const t = tasks.find(x => x.id === id); if(!t) return;
    if(!t.reqLink){ toast("요청글 링크가 없어요", "err"); return; }
    const url = webUrl(t.reqLink);
    if(!url){ toast("웹 주소가 아니라서 앱에서 열 수 없어요", "err"); return; }
    if(typeof window.timerAPI !== "undefined" && window.timerAPI.openExternal) window.timerAPI.openExternal(url);
    else window.open(url, "_blank");
  }

  let toastTimer;
  // kind "err" 또는 문구에 「실패」가 있으면 실패 알림 — 체크 대신 경고 표시, 글 길이에 맞춰 더 오래(최대 6초).
  function toast(msg, kind) {
    const el=$("toast");
    const err = kind === "err" || /실패/.test(String(msg));
    // msg 에는 서버 error 문자열(최대 150자)이 그대로 실려 오는 경로가 여럿 있다 → esc() 필수.
    // 아이콘은 코드에 박힌 SVG 라 그대로 둔다.
    el.innerHTML=`${err ? IC.warn : IC.check} ${esc(msg)}`; el.classList.add("show");
    const ms = err ? Math.min(6000, Math.max(2200, 1500 + String(msg).length * 90)) : 2200;
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"), ms);
  }

  // 바깥(어두운 곳) 클릭도 X·Esc 와 같은 닫힘 효과로. 인라인 onclick 이 이미 있는 오버레이는 그쪽이 처리한다.
  document.querySelectorAll(".overlay").forEach(o=>{ if(!o.hasAttribute("onclick")) o.addEventListener("click",e=>{if(e.target===o)closeModal(o.id);}); });

  // 창 컨트롤 — Electron이면 실제 동작, 브라우저면 시연 토스트
  const isElectron = typeof window.timerAPI !== "undefined";
  // 모달: dialog 의미를 붙이고(제목 연결), 열린 창 안에서 Tab 이 창 밖(뒤 카드의 완료 체크 등)으로 빠지지 않게 돌린다.
  document.querySelectorAll(".overlay > .modal").forEach((md, i) => {
    md.setAttribute("role", "dialog"); md.setAttribute("aria-modal", "true");
    const h = md.querySelector("#settings-title") || md.querySelector("h2, h3"); if (h) { if (!h.id) h.id = "modal-title-" + i; md.setAttribute("aria-labelledby", h.id); }
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    // 문서 순서가 아니라 실제로 위에 뜬 창 — 설정 위에 뜨는 단축키·확인 창은 DOM 앞쪽이지만 z-index 가 더 높다
    const ov = [...document.querySelectorAll(".overlay.show:not(.closing)")]
      .sort((x, y) => (parseInt(getComputedStyle(x).zIndex, 10) || 0) - (parseInt(getComputedStyle(y).zIndex, 10) || 0)).pop();
    if (!ov) return;
    const cp = document.getElementById("cpick"); if (cp && cp.contains(document.activeElement)) return;   // 색상 선택기는 창 밖(body)에 뜬다
    const f = [...ov.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (!ov.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }, true);
  // 설정 스위치(opt-row 안 .mh-toggle)와 선택 버튼(.seg-btn)의 켜짐을 읽기 프로그램에도 알린다 — 클래스가 바뀔 때 따라간다.
  (function(){
    const sync = el => {
      if (el.classList.contains("seg-btn")) el.setAttribute("aria-pressed", el.classList.contains("on") ? "true" : "false");
      else { const row = el.closest(".opt-row"); if (row) { row.setAttribute("role", "switch"); row.setAttribute("aria-checked", el.classList.contains("on") ? "true" : "false"); } }
    };
    const mo = new MutationObserver(ms => ms.forEach(m => sync(m.target)));
    document.querySelectorAll(".opt-row .mh-toggle, .seg-btn").forEach(el => { sync(el); mo.observe(el, { attributes: true, attributeFilter: ["class"] }); });
  })();
  // Tab 으로 온 「버튼 역할 div」는 Enter·Space 로 누른다. ★:focus-visible 일 때만 — 마우스로 누른 div 에도 포커스가 남는다.
  document.addEventListener("keydown", e => {
    const el = document.activeElement;
    if ((e.key === " " || e.key === "Enter") && el && el.tagName !== "BUTTON" && el.getAttribute && /^(button|switch)$/.test(el.getAttribute("role") || "") && el.matches(":focus-visible")) {
      e.preventDefault(); e.stopPropagation(); el.click();
    }
  }, true);
  document.querySelectorAll(".win-btn").forEach(b=>b.addEventListener("click",()=>{
    if (isElectron) {
      if (b.id==="win-min") window.timerAPI.winMinimize();
      else if (b.id==="win-max") window.timerAPI.winMaximize();
      else if (b.id==="win-close") window.timerAPI.winClose();
    } else {
      toast(b.id==="win-close"?"실제 앱에선 트레이로 최소화돼요":b.title+" (실제 앱에서 작동)");
    }
  }));

  // 최대화 상태에 따라 최대화/복원 아이콘 전환
  const ICON_MAXIMIZE = '<svg viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" rx="1.5"/></svg>';
  // 복원(restore) 아이콘 — 네모 두 개가 겹쳐진 모양
  const ICON_RESTORE = '<svg viewBox="0 0 12 12"><rect x="2.2" y="3.6" width="6.2" height="6.2" rx="1.3"/><path d="M4.4 3.6V2.8a1.3 1.3 0 011.3-1.3h3.1a1.3 1.3 0 011.3 1.3v3.1a1.3 1.3 0 01-1.3 1.3h-.8"/></svg>';
  if (isElectron && window.timerAPI.onMaximizedChanged) {
    window.timerAPI.onMaximizedChanged(isMax => {
      const btn = document.getElementById("win-max");
      if (!btn) return;
      btn.innerHTML = isMax ? ICON_RESTORE : ICON_MAXIMIZE;
      btn.title = isMax ? "이전 크기로" : "최대화";
    });
  }

  // 윈도우 알림창 클릭 → 설정(Gmail/요청글/둘 다)대로 해당 메일 열기
  if (isElectron && window.timerAPI.onNotificationMailClick) {
    window.timerAPI.onNotificationMailClick(id => { if (id) openMailItem(id); });
  }

  // 창 크기 변화 시 카운트다운 포맷(초 포함/제외) 재반영
  let lastCompact = window.innerWidth <= 400;
  window.addEventListener("resize", () => {
    const c = window.innerWidth <= 400;
    if (c !== lastCompact) { lastCompact = c; render(); }
    checkStatsOverlap();
  });

  // ── 통계 라벨 겹침 스마트 감지 (깜빡임 없음) ──
  // 측정용 클래스 토글 대신, 펼친 상태의 폭을 캐시하고 히스테리시스를 둬서
  // 경계에서 펼침↔축약이 반복되지 않게 함. 통계·버튼·동기화가 한 트리거로 동시 변경.
  function checkStatsOverlap() {
    const topbar = document.querySelector(".topbar");
    const controls = document.querySelector(".top-controls");
    // 메일 모드면 좌측 = 메일 제목 블록, 아니면 통계 라인
    const leftEl = document.body.classList.contains("mail-mode")
      ? document.querySelector(".mail-stat")
      : document.querySelector(".stat-line");
    if (!topbar || !leftEl || !controls) return;

    const cs = getComputedStyle(topbar);
    const gap = parseFloat(cs.columnGap || cs.gap || "16") || 16;
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const inner = topbar.clientWidth - padL - padR;

    const isCompact = document.body.classList.contains("stats-compact");

    if (isCompact) {
      const needed = statsFullWidth + gap + controlsFullWidth;
      if (statsFullWidth > 0 && inner >= needed + 24) { // +24 히스테리시스
        document.body.classList.remove("stats-compact");
      }
    } else {
      const lw = leftEl.scrollWidth;
      if (lw > 0) statsFullWidth = lw;   // 0(숨김 상태)은 캐시하지 않음 — 고착 방지
      controlsFullWidth = controls.offsetWidth;
      const needed = statsFullWidth + gap + controlsFullWidth;
      if (statsFullWidth > 0 && inner < needed) {
        document.body.classList.add("stats-compact");
      }
    }
  }
  let statsFullWidth = 0, controlsFullWidth = 0;

  setInterval(tick,1000);
  renderMgmt();
  render();

  // 초기 동기화 — 시트 먼저, 메일 배지는 시트 동기화가 끝난 뒤에 (경쟁 방지)
  if (isElectron) {
    if (getMyName()) {
      doSync().finally(() => loadMail(true));
    } else {
      toast("설정에서 작업자를 선택하면 동기화돼요"); setTimeout(openSettings, 700);
      setTimeout(() => loadMail(true), 3000);
    }
    restartMailPoll(); // 메일 자동 새로고침 시작
    applyAutostart();   // 저장된 자동 실행 설정을 OS에 재등록
    applyAutostartMin(); // 자동 실행 시 최소화 시작 설정을 main에 반영
    applyLinkProfile(); // 저장된 링크 열기 프로필을 메인에 반영
  }
  applyStatusColors(); // 저장된 상태 색상 적용 (앱/브라우저 공통)
  initColorPicker();   // 커스텀 컬러 피커 드래그/입력 핸들러 연결

  // 모든 선을 "정확히 1 디바이스 픽셀"로 — 배율(125/150%) 화면에서 1px이 1.5px로 반올림돼
  // 위치마다 두께가 달라 보이는 현상 방지. devicePixelRatio가 바뀌면(줌·모니터 이동) 재설정.
  function applyHairline(){
    const d = window.devicePixelRatio || 1;
    // 1 디바이스 픽셀에 해당하는 CSS 길이. 100%면 1px, 150%면 약 0.6667px, 125%면 0.8px.
    document.documentElement.style.setProperty('--hairline', (1 / d) + 'px');
  }
  applyHairline();
  window.addEventListener('resize', applyHairline); // 줌 변경/모니터 이동 시 resize 발생
  if (window.matchMedia) {
    try { window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', applyHairline); } catch(e) {}
  }

  // 메일 안읽은 수만 가볍게(1요청) 가져와 배지 갱신 — 시트 동기화와 무관

  // 자동 동기화(10분) — 편집 중이면 건너뛰고, 조용히(silent) 시트→앱만 갱신.
  // 앱→시트는 각 동작에서 이미 즉시 기록되므로 여기선 내려받기만.
  function isEditingNow(){
    const ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return true; // 입력 중
    if (mgmtAdding) return true; // 관리항목 추가 입력 모드
    for (const id of ["modal-done","modal-task","modal-settings","modal-confirm","modal-time","modal-keys"]) {
      if (modalShown($(id))) return true; // 팝업/모달 열림
    }
    return false;
  }
  if (isElectron) {
    // 포커스 프리싱크: 창에 돌아왔을 때 마지막 동기화가 오래됐으면 미리 조용히 동기화
    // (Apps Script 콜드스타트를 미리 깨우고 데이터도 최신화 → 수동 동기화 체감 단축)
    const FOCUS_PRESYNC_MIN = 3; // 분 — 체감에 따라 이 숫자만 조절
    window.addEventListener("focus", () => {
      if (!getMyName()) return;
      if (isEditingNow()) return;                                      // 편집 중 보호
      if (Date.now() - lastSyncOkAt < FOCUS_PRESYNC_MIN * 60000) return; // 최근에 했으면 생략
      doSync({ silent: true });                                        // 진행 중이면 내부 가드가 무시
    });
    setInterval(() => {
      if (!getMyName()) return;
      if (isEditingNow()) return; // 편집 중 → 이번 주기 건너뜀
      doSync({ silent: true });
    }, 10 * 60 * 1000);
  }

  // 마우스 클릭으로 생기는 포커스 링 제거 (키보드 탭 포커스는 유지)
  document.addEventListener("mousedown", (e) => {
    const el = e.target.closest("button, .pill-btn, .sync-pill, .win-btn, .clear-done, .act, .mact, .preset-pill, .close-btn, .cal-trigger, .dchip, .name-opt");
    if (!el) return;
    if (el.matches("input, textarea, select") || el.querySelector("input, textarea")) return;
    e.preventDefault(); // 포커스 이동만 막음 (클릭 동작은 그대로 발생)
  });

  // 마우스 4/5(뒤로/앞으로) 버튼으로 작업자 롤링
  window.addEventListener("mouseup", (e) => {
    if (e.button === 3) { e.preventDefault(); openMail(); }       // 4번째 버튼 → 타이머↔메일
    else if (e.button === 4) { e.preventDefault(); openMail(); }  // 5번째 버튼 → 타이머↔메일
  });
  window.addEventListener("mousedown", (e) => { if(e.button===3||e.button===4) e.preventDefault(); }); // 기본 뒤로/앞으로 막기

  // 전역 단축키 — 입력/모달/캘린더 중에는 비활성(타이핑 충돌 방지)
  const MODAL_IDS = ["modal-done","modal-task","modal-settings","modal-confirm","modal-time","modal-keys"];
  function anyModalOpen(){ return MODAL_IDS.some(id => modalShown($(id))); }
  function closeTopModal(){ MODAL_IDS.forEach(id => { const el=$(id); if(el && el.classList.contains("show")) closeModal(id); }); }
  function backToMyBoard(){ const mine=getMyName(); if(mine && viewName!==mine) applyView(mine); }

  // 커스터마이징 가능한 단축키 정의 (문자·숫자 키만)
  const KEY_ACTIONS = [
    { id:"theme",    label:"테마 전환",        def:"t", run:()=>toggleTheme() },
    { id:"settings", label:"설정 열기/닫기",   def:"o", run:()=>openSettings() },
    { id:"add",      label:"작업 추가",        def:"a", run:()=>openAdd() },
    { id:"mail",     label:"메일 ↔ 타이머",    def:"s", run:()=>openMail() },
    { id:"prev",     label:"이전 작업자",      def:"q", run:()=>rollView(-1) },
    { id:"next",     label:"다음 작업자",      def:"e", run:()=>rollView(1) },
    { id:"max",      label:"최대화 / 복원",    def:"f", run:()=>{ if(window.timerAPI && window.timerAPI.winMaximize) window.timerAPI.winMaximize(); } },
  ];
  function defaultKeymap(){ const d={}; KEY_ACTIONS.forEach(a=>d[a.id]=a.def); return d; }
  let keymap = (function(){
    const d = defaultKeymap();
    try { const s = JSON.parse(localStorage.getItem("keymap")||"{}");
      KEY_ACTIONS.forEach(a=>{ if(s[a.id] && typeof s[a.id]==="string") d[a.id]=s[a.id].toLowerCase(); });
    } catch(e){}
    return d;
  })();
  function saveKeymap(){ try{ localStorage.setItem("keymap", JSON.stringify(keymap)); }catch(e){} }
  function actionForKey(k){ return KEY_ACTIONS.find(a => keymap[a.id] === k) || null; }

  window.addEventListener("keydown", (e) => {
    const ae = document.activeElement;
    const inField = ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable);
    // 키보드(Tab)로 버튼에 와 있으면 Space·Enter 는 그 버튼을 누르는 키다 — 전역 단축키(동기화)로 가로채지 않는다.
    // ★:focus-visible 일 때만. 마우스로 누른 버튼에도 포커스가 남아서, 그걸 넘기면 Space 가 방금 누른 버튼(완료 비우기 등)을 또 누른다.
    if ((e.key === " " || e.key === "Enter") && ae && ae.matches && ae.matches(":focus-visible")
        && (ae.tagName === "BUTTON" || ae.tagName === "SELECT" || /^(button|switch)$/.test(ae.getAttribute("role") || ""))) return;

    // Esc / (입력칸 밖)Backspace → 팝업 닫기, 메일 화면이면 타이머로, 아니면 내 보드 복귀
    if (e.key === "Escape" || (e.key === "Backspace" && !inField)) {
      if (anyModalOpen()) { e.preventDefault(); closeTopModal(); return; }
      if (mailMode) { e.preventDefault(); exitMailMode(); return; }
      e.preventDefault(); backToMyBoard(); return;
    }

    // 설정 단축키를 다시 누르면 설정 닫기 (입력 중이 아닐 때 — isEditingNow 가드보다 먼저 처리)
    if (!inField && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const m = $("modal-settings");
      if (modalShown(m) && e.key.toLowerCase() === keymap["settings"]) {
        e.preventDefault(); closeModal("modal-settings"); return;
      }
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return; // 조합키 제외
    if (isEditingNow()) return;                     // 입력칸·모달·추가모드 중 무시

    const k = e.key.toLowerCase();

    // W(고정) — 타이머탭: 관리 항목 접기/펴기 / 메일탭: 최신순 토글
    if (k === "w") {
      e.preventDefault();
      if (mailMode) toggleMailSort();
      else toggleSec("mgmt");
      return;
    }

    // 스페이스바(고정) — 타이머탭: 시트 동기화 / 메일탭: 메일 새로고침
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      if (mailMode) loadMail();
      else doSync();
      return;
    }

    // 보드 롤링 보조키(←/→/Home)는 타이머 화면에서만
    if (!mailMode) {
      if (e.key === "ArrowLeft")  { e.preventDefault(); rollView(-1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); rollView(1);  return; }
      if (e.key === "Home")       { e.preventDefault(); backToMyBoard(); return; }
    }

    // 커스터마이징 단축키 — 모든 탭에서 작동
    const act = actionForKey(k);
    if (act) {
      e.preventDefault();
      // 메일 화면에서 타이머 전용 동작이면 타이머로 돌아간 뒤 실행
      if (mailMode && (act.id === "add" || act.id === "prev" || act.id === "next")) exitMailMode();
      act.run();
    }
  });
  // 초기 + 폰트 로딩 후 재측정
  checkStatsOverlap();
  setTimeout(checkStatsOverlap, 300);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(checkStatsOverlap);

  // ── Electron 플랫폼별 처리 ──
  if (isElectron) {
    // 카드 안 링크(요청글/기획안)는 기본 브라우저로 열기
    // ★캡처 단계로 받는다. 링크의 onclick 이 버블을 막아서, 예전엔 여기가 안 불리고 새 창 요청으로 샜다.
    document.addEventListener("click", e => {
      const a = e.target.closest("a.link-mini");
      if (a) {
        e.preventDefault();
        const url = webUrl(a.getAttribute("href"));
        if (url) window.timerAPI.openExternal(url);
        else toast("웹 주소가 아니라서 앱에서 열 수 없어요", "err");
      }
    }, true);
  }

  // ── 커스텀 오버레이 스크롤바 ──
  // 네이티브 스크롤바를 숨기고, 스크롤 컨테이너의 부모에 thumb를 띄워 제어.
  // 레이아웃을 밀지 않고, 스크롤할 때만 잠깐 나타남. 드래그도 지원.
  function attachOverlayScrollbar(container) {
    if (!container || container._ovsbAttached) return;
    const parent = container.parentElement;
    if (!parent) return;
    container._ovsbAttached = true;

    // 부모가 위치 기준이 되도록
    const pPos = getComputedStyle(parent).position;
    if (pPos === "static") parent.style.position = "relative";

    const thumb = document.createElement("div");
    thumb.className = "ovsb hoverable";
    parent.appendChild(thumb);

    let hideTimer = null;
    let dragging = false;
    let dragStartY = 0, dragStartScroll = 0;

    function update() {
      const { scrollHeight, clientHeight, scrollTop, offsetTop } = container;
      if (scrollHeight <= clientHeight + 1) {
        thumb.style.display = "none";
        return;
      }
      thumb.style.display = "block";
      const trackH = clientHeight - 8;
      const thumbH = Math.max(28, trackH * (clientHeight / scrollHeight));
      const maxScroll = scrollHeight - clientHeight;
      const maxThumbTop = trackH - thumbH;
      const top = offsetTop + 4 + (scrollTop / maxScroll) * maxThumbTop;
      thumb.style.height = thumbH + "px";
      thumb.style.top = top + "px";
    }

    function flash() {
      thumb.classList.add("show");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!dragging) thumb.classList.remove("show");
      }, 600);
    }

    container.addEventListener("scroll", () => { update(); flash(); }, { passive: true });

    thumb.addEventListener("mousedown", e => {
      dragging = true;
      thumb.classList.add("dragging", "show");
      dragStartY = e.clientY;
      dragStartScroll = container.scrollTop;
      e.preventDefault();
    });
    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      const { scrollHeight, clientHeight } = container;
      const trackH = clientHeight - 8;
      const thumbH = Math.max(28, trackH * (clientHeight / scrollHeight));
      const maxScroll = scrollHeight - clientHeight;
      const maxThumbTop = trackH - thumbH;
      const deltaY = e.clientY - dragStartY;
      const scrollDelta = (deltaY / maxThumbTop) * maxScroll;
      container.scrollTop = dragStartScroll + scrollDelta;
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      thumb.classList.remove("dragging");
      flash();
    });

    // 영역 진입 시엔 위치만 갱신(표시는 스크롤할 때만)
    container.addEventListener("mouseenter", () => { update(); });

    const ro = new ResizeObserver(() => update());
    ro.observe(container);
    const mo = new MutationObserver(() => update());
    mo.observe(container, { childList: true, subtree: true });

    update();
    container._ovsbUpdate = update;
  }

  // 메인 리스트에 적용
  attachOverlayScrollbar(document.getElementById("list"));
  attachOverlayScrollbar(document.getElementById("mail-view"));

  // ── 커스텀 툴팁 (네이티브 title 가로채기) ──
  (function(){
    const tip = document.createElement("div");
    tip.className = "tooltip";
    document.body.appendChild(tip);
    let tipEl = null, tipText = "", showTimer = null;

    function position(el){
      // 보드 전환 등으로 요소가 화면에서 사라졌으면(detached) 위치가 0,0으로 잡혀
      // 좌상단에 툴팁이 뜨는 버그 방지 — 그냥 숨김
      if (!el || !el.isConnected) { tip.classList.remove("show"); return; }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { tip.classList.remove("show"); return; }
      tip.style.left = (r.left + r.width/2) + "px";
      // 기본은 아래, 화면 하단에 가까우면 위로
      tip.classList.remove("show"); // 측정용 잠깐
      tip.style.top = "0px";
      const th = tip.offsetHeight || 28;
      let top = r.bottom + 8;
      if (top + th > window.innerHeight - 6) top = r.top - th - 8;
      tip.style.top = top + "px";
      // 좌우 화면 밖 방지
      const tw = tip.offsetWidth;
      let cx = r.left + r.width/2;
      const half = tw/2;
      if (cx - half < 6) cx = 6 + half;
      if (cx + half > window.innerWidth - 6) cx = window.innerWidth - 6 - half;
      tip.style.left = cx + "px";
    }
    function hide(){
      clearTimeout(showTimer);
      tip.classList.remove("show");
      if (tipEl && tipEl.getAttribute("data-tip") !== null){
        tipEl.setAttribute("title", tipEl.getAttribute("data-tip"));
        tipEl.removeAttribute("data-tip");
      }
      tipEl = null;
    }
    document.addEventListener("mouseover", (e) => {
      const el = e.target.closest("[title]");
      if (!el || el === tipEl) return;
      const t = el.getAttribute("title");
      if (!t) return;
      if (tipEl) hide();
      el.setAttribute("data-tip", t);   // 원본 보관
      el.removeAttribute("title");       // 네이티브 툴팁 억제
      tipEl = el; tipText = t;
      clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        // 타이머 대기 중 보드 전환 등으로 요소가 사라졌으면 표시하지 않음
        if (!tipEl || !tipEl.isConnected) { hide(); return; }
        tip.textContent = tipText;
        position(el);
        tip.classList.add("show");
      }, 320);
    });
    document.addEventListener("mouseout", (e) => {
      if (!tipEl) return;
      const to = e.relatedTarget;
      if (!to || !tipEl.contains(to)) hide();
    });
    document.addEventListener("scroll", hide, true);
    document.addEventListener("mousedown", hide, true);
    window.addEventListener("blur", hide);
    window.__hideTooltip = hide;   // 보드 재렌더 등에서 호출해 잔상/오위치 방지
  })();

  // 모달이 열릴 때 modal-inner에 적용
  ["modal-task","modal-import","modal-settings","modal-done"].forEach(id => {
    const inner = document.querySelector(`#${id} .modal-inner`);
    if (inner) attachOverlayScrollbar(inner);
  });

  // 모달 열림 감지 → 스크롤바 갱신 (display:none→flex로 크기가 잡힌 직후)
  ["modal-task","modal-import","modal-settings","modal-done"].forEach(id => {
    const ov = document.getElementById(id);
    if (!ov) return;
    const obs = new MutationObserver(() => {
      if (ov.classList.contains("show")) {
        const inner = ov.querySelector(".modal-inner");
        if (inner && inner._ovsbUpdate) {
          // 렌더 후 크기 반영되도록 약간 지연
          requestAnimationFrame(() => inner._ovsbUpdate());
          setTimeout(() => inner._ovsbUpdate(), 100);
        }
      }
    });
    obs.observe(ov, { attributes: true, attributeFilter: ["class"] });
  });
