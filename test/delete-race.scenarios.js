// delete-race.scenarios.js — 「삭제한 카드가 되살아난다」(2026-11-20 제보) 재현·회귀 시나리오.
//   대상은 renderer/index.html 그 자체다. 가짜 시트 서버(메모리)와 가짜 시계를 앱에 꽂고,
//   render() 를 후킹해 "지운 카드가 중간에 한 번이라도 다시 그려졌는가"를 센다(최종 상태만 보지 않는다).
//   실행기는 둘이다 — node: test/delete-race.test.js (vm + 최소 DOM 스텁) / 브라우저: test/delete-race.browser.js (실제 DOM).
//   실제 팀 시트(WEBAPP_URL)로는 어떤 요청도 나가지 않는다 — window.timerAPI 를 통째로 가짜로 바꾼다.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DeleteRace = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ME = "테스터", OTHER = "동료";
  const T = { A: "A 런칭 배너", B: "B 기획전 영상", C: "C 숏폼 3종", D: "D 상세 GIF", E: "E 완료된 작업", Z: "Z 새로 들어온 작업" };
  const clone = o => JSON.parse(JSON.stringify(o));

  // ── 가짜 시계 — 앱의 setTimeout / Date.now 만 바꾼다(25초 묘비·2초 재시도를 기다리지 않으려고) ──
  // 타이머 id 는 시계를 갈아끼워도 겹치지 않게 한다 — 앱이 쥐고 있던 옛 id(toastTimer 등)로 clearTimeout 을 부르면
  // 새 시계의 엉뚱한 타이머(묘비 뒤 재동기화 등)가 지워진다. 브라우저 실행기에서 들쭉날쭉한 실패로 실제로 밟았다.
  let seq = Date.now();
  function makeClock(flush, startAt) {
    const timers = new Map();
    const c = {
      now: startAt,
      errors: [],
      set(fn, ms) { const id = ++seq; timers.set(id, { id, at: c.now + Math.max(0, +ms || 0), fn }); return id; },
      clear(id) { timers.delete(id); },
      async advance(ms) {
        const end = c.now + ms;
        for (;;) {
          await flush();
          let next = null;
          timers.forEach(t => { if (t.at <= end && (!next || t.at < next.at || (t.at === next.at && t.id < next.id))) next = t; });
          if (!next) break;
          timers.delete(next.id);
          if (next.at > c.now) c.now = next.at;
          try { next.fn(); } catch (e) { c.errors.push(String(e && e.stack || e)); }
        }
        c.now = end;
        await flush();
      },
    };
    return c;
  }

  // ── 가짜 시트 서버 — gas/AppsScript-v61.gs 의 계약만 흉내낸다 ──
  //   읽기: 요청 시점의 스냅샷을 돌려준다(읽기는 락을 안 잡는다 → 응답이 늦게 오면 옛 데이터).
  //   쓰기: 응답을 내보내는 순간 반영한다. 지문(expectIdx/expectTitle)이 안 맞으면 stale.
  function makeServer(opts) {
    opts = opts || {};
    const BASE = 5, MG_BASE = 30;
    const s = {
      BASE,
      sheet: {
        [ME]: opts.mine ? clone(opts.mine) : [   // 복사 — 시나리오 정의를 건드리면 같은 페이지에서 두 번째 실행이 틀어진다
          { title: T.A, idx: "1001" }, { title: T.B, idx: "1002" }, { title: T.C, idx: "1003" },
          { title: T.D, idx: "1004" }, { title: T.E, idx: "1005", done: true, status: "전달 완료" },
        ],
        [OTHER]: [{ title: "동료 작업 1", idx: "2001" }, { title: T.B, idx: "1002" }, { title: "동료 작업 3", idx: "2003" }],
      },
      mgmt: { [ME]: [{ b: "주간 보고", c: "" }], [OTHER]: [] },
      calls: [],
      holding: { sync: false, post: false },
      readQueue: [],   // 다음 읽기가 대신 받을 스냅샷(서버의 20초 읽기 캐시 흉내)
      postQueue: [],   // 다음 쓰기 응답을 가로채는 함수. undefined 를 돌려주면 정상 처리
    };
    const url = v => v.idx ? "https://intranet.invalid/creative/view?idx=" + v.idx : (v.link || "");
    s.snapshot = () => clone({
      ok: true, _ms: 1, memberNames: [ME, OTHER],
      members: [ME, OTHER].map(name => ({
        name, side: 1,
        video: s.sheet[name].map((v, i) => ({
          row: BASE + i, done: !!v.done, title: v.title, requestLink: url(v), planLink: v.plan || "",
          dueISO: v.dueISO || "2030-01-15", memo: v.memo || "", status: v.status || "",
        })),
        mgmt: s.mgmt[name].map((m, i) => ({ row: MG_BASE + i, done: false, b: m.b, c: m.c })).filter(m => m.b || m.c),
      })),
    });
    s.has = (title, name) => s.sheet[name || ME].filter(v => v.title === title).length;
    s.rows = name => s.sheet[name || ME].map((v, i) => ({ row: BASE + i, title: v.title }));
    s.insertTop = (v, name) => { s.sheet[name || ME].unshift(v); };       // 딸깍 insert 가 행을 미는 경우
    s.removeBySheet = (title, name) => {                                    // 누가 시트에서 직접 지운 경우
      const rows = s.sheet[name || ME]; const i = rows.findIndex(v => v.title === title); if (i >= 0) rows.splice(i, 1);
    };
    s.apply = p => {
      const act = p.action || "insert";
      const who = p.member || p.targetMember;
      const rows = s.sheet[who];
      if (!rows) return { ok: false, error: "팀원 이름 없음: " + who };
      if (act === "deleteTask" || act === "toggleDone" || act === "updateDue" || act === "updateTask") {
        const i = Number(p.row) - BASE;
        if (!(i >= 0)) return { ok: false, error: "행 번호 오류: " + p.row };
        // 실제 서버(gas deleteTask·toggleDone·updateDue·updateTask): 그 행이 작업 행이 아니면 지문 검사보다 먼저 일반 오류를 준다.
        // stale 은 행 번호가 시트 전체의 마지막 행을 넘었을 때뿐인데, 팀원 단이 아래로 이어져 있어 실제로는 거의 없다.
        if (i >= rows.length) return opts.pastEndStale
          ? { ok: false, stale: true, row: p.row, found: "", foundIdx: "", error: "그 행이 더 이상 없어요" }
          : { ok: false, error: "영상작업 행이 아님(보호): row " + p.row };
        const cur = rows[i];
        const wantIdx = String(p.expectIdx == null ? "" : p.expectIdx).trim();
        const wantTitle = String(p.expectTitle == null ? "" : p.expectTitle).trim();
        const wantLink = String(p.expectLink == null ? "" : p.expectLink).trim();   // 서버 v64+ : 링크 전체 비교
        if ((wantIdx && String(cur.idx || "") !== wantIdx) || (wantTitle && cur.title.trim() !== wantTitle) || (wantLink && url(cur) !== wantLink)) {
          return { ok: false, stale: true, row: p.row, found: cur.title, foundIdx: cur.idx || "", error: "행이 밀렸어요" };
        }
        if (act === "deleteTask") rows.splice(i, 1);
        if (act === "toggleDone") { cur.done = p.done === "1"; cur.status = p.status || ""; }
        if (act === "updateDue") cur.dueISO = p.dueDate;
        if (act === "updateTask") {
          cur.title = p.title; cur.dueISO = p.dueDate; cur.plan = p.planLink || "";
          const m = String(p.url || "").match(/idx=(\d+)/); cur.idx = m ? m[1] : ""; cur.link = p.url || "";
        }
        return { ok: true };
      }
      if (act === "insert") {
        const m = String(p.url || "").match(/idx=(\d+)/);
        rows.push({ title: p.title, idx: m ? m[1] : "", link: p.url || "", plan: p.planLink || "", dueISO: p.dueDate });
        return { ok: true };
      }
      if (act === "addMemo") { s.mgmt[who].push({ b: p.text, c: "" }); return { ok: true }; }
      if (act === "updateMemo") {
        const m = s.mgmt[who][Number(p.row) - MG_BASE];
        if (!m) return { ok: false, error: "행 번호 오류: " + p.row };
        // 서버 v64+ : 보낸 칸의 고치기 전 값이 지금 값과 다르면 stale(쓰지 않음)
        if (("expectB" in p && String(p.expectB).trim() !== String(m.b || "").trim()) ||
            ("expectC" in p && String(p.expectC).trim() !== String(m.c || "").trim()))
          return { ok: false, stale: true, row: p.row, found: m.b || m.c, error: "행이 밀렸어요" };
        if ("memoB" in p) m.b = p.memoB;
        if ("memoC" in p) m.c = p.memoC;
        return { ok: true };
      }
      return { ok: false, error: "unknown action" };
    };
    function deliver(call, get) {
      s.calls.push(call);
      return new Promise(resolve => {
        call.finish = () => { if (call.done) return; call.done = true; call.result = clone(get()); resolve(clone(call.result)); };
        if (!s.holding[call.kind]) call.finish();
      });
    }
    s.api = {
      syncSheet() { const snap = s.readQueue.length ? s.readQueue.shift() : s.snapshot(); return deliver({ kind: "sync" }, () => snap); },
      postSheet(payload) {
        const hook = s.postQueue.shift();
        const p = clone(payload);
        return deliver({ kind: "post", payload: p }, () => (hook && hook(p)) || s.apply(p));
      },
      openExternal() {},
    };
    s.hold = kind => { s.holding[kind] = true; };
    s.pending = kind => s.calls.filter(c => c.kind === kind && !c.done);
    s.releaseOne = kind => { const c = s.pending(kind)[0]; if (c) c.finish(); return !!c; };
    s.release = kind => { s.holding[kind] = false; s.pending(kind).forEach(c => c.finish()); };
    return s;
  }

  function parseCards(html) {
    const out = [];
    const re = /<div class="task ([^"]*)" data-id="(-?\d+)"[\s\S]*?<div class="task-title">([^<]*)<\/div>/g;
    let m;
    while ((m = re.exec(html || ""))) out.push({ id: +m[2], done: /(^|\s)done(\s|$)/.test(m[1]), title: m[3] });
    return out;
  }

  // ── 시나리오 1건용 하니스 ──
  async function start(env, opts) {
    const booted = await env.boot();
    const evalApp = booted.evalApp;
    const flush = env.flush;
    // 시계는 시나리오를 넘어가도 뒤로 가지 않게 한다 — 브라우저 실행기는 페이지를 다시 읽지 않아서,
    // 뒤로 가면 앞 시나리오의 묘비가 되살아나 다음 시나리오의 카드를 가린다(실제로 밟았다).
    const clock = makeClock(flush, Math.max(Date.now(), env.lastNow || 0));
    const server = makeServer(opts);
    const h = { clock, server, renders: [], toasts: [], errors: [], checks: [], T, ME, OTHER };
    h.app = code => {
      const v = evalApp(code);
      if (v && typeof v.then === "function") v.then(null, e => h.errors.push(String(e && e.stack || e)));
      return v;
    };
    h.cards = () => parseCards(evalApp('(document.getElementById("task-host") || {}).innerHTML || ""'));
    // 원본을 한 번만 잡아 둔다 — 브라우저에서는 페이지를 다시 읽지 않고 시나리오를 이어 돌리므로 후킹이 겹치면 안 된다.
    evalApp(`(function(){
      var g = globalThis;
      if(!g.__drOrig) g.__drOrig = { render: render, toast: toast };
    })()`);
    evalApp(`(function(c, hook){
      var o = globalThis.__drOrig;
      setTimeout = function(fn, ms){ return c.set(fn, ms); };
      clearTimeout = function(id){ c.clear(id); };
      Date.now = function(){ return c.now; };
      render = function(){ var v = o.render.apply(this, arguments); hook.onRender(); return v; };
      toast = function(m){ hook.onToast(String(m)); return o.toast.apply(this, arguments); };
    })`)(clock, {
      onRender() { h.renders.push(h.cards()); },
      onToast(m) { h.toasts.push(m); },
    });
    evalApp('localStorage.setItem("myName", "' + ME + '")');
    evalApp("(function(api){ window.timerAPI = api; })")(server.api);
    h.tick = () => clock.advance(1);
    h.settle = async () => { for (let i = 0; i < 8; i++) await clock.advance(1); };
    await h.app("doSync({ silent:true })");
    await h.settle();
    h.app("applyView(getMyName())");
    await h.settle();

    h.tasks = () => evalApp("tasks").map(t => ({ id: t.id, row: t._row, title: t.title, done: !!t.done, deadline: t.deadline }));
    h.id = title => { const t = h.tasks().find(x => x.title === title); if (!t) throw new Error("화면에 없는 작업: " + title); return t.id; };
    h.del = title => h.app("delTask(" + h.id(title) + ")");
    // 완료 처리 창을 열고 확정. 창을 열면 30ms 뒤 입력칸에 포커스를 주는데, 그 전에 확정하면(사람 손으로는 불가능) 실제 DOM 에서는
    // 닫힌 창의 입력칸에 포커스가 남아 앱이 「입력 중」으로 보고 조용한 동기화를 계속 미룬다 → 40ms 를 흘려보낸 뒤 확정한다.
    h.markDone = async title => {
      h.app("toggleDone(" + h.id(title) + ")");
      await clock.advance(40);
      h.app('confirmDone("전달 완료")');
    };
    h.mark = () => ({ r: h.renders.length, t: h.toasts.length, c: server.calls.length });
    h.shown = (title, m) => h.renders.slice(m.r).filter(cs => cs.some(c => c.title === title)).length;
    h.onScreen = title => h.cards().filter(c => c.title === title).length;
    h.toastsSince = m => h.toasts.slice(m.t);
    h.posts = (m, action) => server.calls.slice(m ? m.c : 0)
      .filter(c => c.kind === "post" && (!action || (c.payload.action || "insert") === action)).map(c => c.payload);
    h.syncs = m => server.calls.slice(m ? m.c : 0).filter(c => c.kind === "sync").length;
    h.pillSpinning = () => !!evalApp('document.getElementById("sync-pill").classList.contains("syncing")');
    h.rowsMatchServer = () => {
      const a = h.tasks().map(t => t.row + ":" + t.title).sort().join("|");
      const b = server.rows().map(r => r.row + ":" + r.title).sort().join("|");
      return a === b;
    };
    h.check = (label, got, exp) => {
      const ok = typeof exp === "function" ? !!exp(got) : JSON.stringify(got) === JSON.stringify(exp);
      h.checks.push({ label, ok, got, exp: typeof exp === "function" ? "(조건)" : exp });
    };
    // 삭제 시나리오 공통 판정
    h.checkDelete = (title, m, exp) => {
      h.check("지운 카드가 다시 그려진 횟수", h.shown(title, m), exp.shown);
      h.check("마지막 화면의 그 카드 수", h.onScreen(title), exp.onScreen);
      h.check("서버(시트)에 남은 수", server.has(title), exp.onServer);
      h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, exp.posts);
      if (exp.toasts) h.check("토스트", h.toastsSince(m), exp.toasts);
    };
    h.clearLogs = () => { h.renders.length = 0; h.toasts.length = 0; };
    h.clearLogs();
    return h;
  }

  const DELETED = "작업을 삭제했어요";
  const TWINS = { mine: [{ title: T.A, idx: "1001" }, { title: T.B, idx: "1002" }, { title: T.C, idx: "1003" }, { title: T.B, idx: "1002" }, { title: T.D, idx: "1004" }] };
  const hasFail = ts => ts.some(t => t.indexOf("삭제하지 못했어요") === 0);

  // 기대값은 전부 "고친 뒤"의 동작이다. 수정 전 코드로 돌리면 A·B·C 계열이 FAIL 로 나온다 — 그게 재현이다.
  const SCENARIOS = [
    { key: "A1", name: "겹친 동기화 — 삭제 전에 출발한 읽기 응답이 삭제 성공 뒤에 도착", async run(h) {
      h.server.hold("sync");
      h.app("doSync({ silent:true })");          // 창을 클릭하는 순간의 포커스 프리싱크. 스냅샷에는 B 가 있다
      await h.tick();
      const m = h.mark();
      h.del(T.B);                                 // 쓰기는 바로 성공
      await h.settle();
      h.server.release("sync");                   // 옛 응답이 이제 도착
      await h.settle();
      h.checkDelete(T.B, m, { shown: 0, onScreen: 0, onServer: 0, posts: 1, toasts: [DELETED] });
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "A2", name: "겹친 동기화 — 옛 읽기 응답이 삭제 요청 도중에 도착", async run(h) {
      h.server.hold("sync"); h.server.hold("post");
      h.app("doSync({ silent:true })");
      await h.tick();
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.server.release("sync");                   // 쓰기가 아직 가는 중인데 옛 목록이 도착
      await h.settle();
      h.check("쓰기 도중 화면의 그 카드 수", h.onScreen(T.B), 0);
      h.server.release("post");
      await h.settle();
      h.checkDelete(T.B, m, { shown: 0, onScreen: 0, onServer: 0, posts: 1, toasts: [DELETED] });
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "B1", name: "행이 밀려 stale → 재동기화 뒤 새 행으로 자동 재시도 1회", async run(h) {
      h.server.insertTop({ title: T.Z, idx: "1999" });   // 마지막 동기화 뒤에 행이 한 칸 밀렸다
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.checkDelete(T.B, m, { shown: 0, onScreen: 0, onServer: 0, posts: 2, toasts: [DELETED] });
      h.check("재시도한 행 번호", h.posts(m, "deleteTask").map(p => p.row), [6, 7]);
      h.check("재시도에도 지문 동봉", h.posts(m, "deleteTask").map(p => p.expectIdx + "/" + p.expectTitle), ["1002/" + T.B, "1002/" + T.B]);
      h.check("다른 작업은 그대로", [T.A, T.C, T.D, T.Z].map(t => h.server.has(t)), [1, 1, 1, 1]);
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "C1", name: "삭제는 성공했는데 직후 읽기가 삭제 전 캐시를 돌려줌", async run(h) {
      h.server.readQueue.push(h.server.snapshot());      // 쓰기 직전에 출발한 읽기가 쓰기 뒤에 캐시에 다시 넣은 옛 데이터
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.checkDelete(T.B, m, { shown: 0, onScreen: 0, onServer: 0, posts: 1, toasts: [DELETED] });
      h.check("낡은 응답을 받은 직후에도 행 번호가 서버와 일치", h.rowsMatchServer(), true);
      const s0 = h.syncs(m);
      await h.clock.advance(70000);                      // 캐시가 죽은 뒤 조용히 한 번 더 받는다
      h.check("캐시 만료 뒤 추가 동기화 횟수(1회 이상)", h.syncs(m) - s0, n => n >= 1);
      h.check("70초 뒤에도 다시 그려진 횟수", h.shown(T.B, m), 0);
      h.check("70초 뒤 행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "N1", name: "정상 삭제", async run(h) {
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.checkDelete(T.B, m, { shown: 0, onScreen: 0, onServer: 0, posts: 1, toasts: [DELETED] });
      h.check("요청 내용", h.posts(m, "deleteTask")[0], { action: "deleteTask", member: ME, row: 6, expectIdx: "1002", expectTitle: T.B });
      h.check("뒤따른 동기화 횟수", h.syncs(m), 1);
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
      h.check("알람용 목록이 화면 목록과 같은 배열", h.app("myTasks === tasks"), true);
      await h.clock.advance(70000);
      h.check("70초 동안 추가 동기화 없음", h.syncs(m), 1);
    } },
    { key: "B2", name: "stale → 재동기화해 보니 이미 없어진 작업(0건) → 성공 처리", async run(h) {
      h.server.removeBySheet(T.B);                       // 누가 시트에서 먼저 지웠다
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.checkDelete(T.B, m, { shown: 0, onScreen: 0, onServer: 0, posts: 1, toasts: [DELETED] });
      h.check("다른 작업은 그대로", [T.A, T.C, T.D].map(t => h.server.has(t)), [1, 1, 1]);
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "B3", name: "stale → 같은 지문이 2건 → 재시도하지 않고 실패 토스트", async run(h) {
      h.server.insertTop({ title: T.B, idx: "1002" });   // 같은 게시글·같은 제목이 한 줄 더 생기며 행이 밀렸다
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 1);
      h.check("서버(시트)에 남은 수", h.server.has(T.B), 2);
      h.check("마지막 화면의 그 카드 수", h.onScreen(T.B), 2);
      h.check("실패 토스트", h.toastsSince(m), ts => ts[0] === DELETED && hasFail(ts));
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "Y1", name: "busy 한 번 → 재시도 성공", async run(h) {
      h.server.postQueue.push(() => ({ ok: false, busy: true, error: "다른 저장이 진행 중이에요." }));
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.checkDelete(T.B, m, { shown: 0, onScreen: 0, onServer: 0, posts: 2, toasts: [DELETED] });
    } },
    { key: "Y2", name: "busy 두 번 → 되돌리고 실패 토스트", async run(h) {
      const busy = () => ({ ok: false, busy: true, error: "다른 저장이 진행 중이에요." });
      h.server.postQueue.push(busy, busy);
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 2);
      h.check("서버(시트)에 남은 수", h.server.has(T.B), 1);
      h.check("마지막 화면의 그 카드 수", h.onScreen(T.B), 1);
      h.check("실패 토스트", h.toastsSince(m), ts => ts[0] === DELETED && hasFail(ts));
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
      const m2 = h.mark();
      h.del(T.B);                                        // 사용자가 다시 누르면 지워진다
      await h.settle();
      h.checkDelete(T.B, m2, { shown: 0, onScreen: 0, onServer: 0, posts: 1, toasts: [DELETED] });
    } },
    { key: "TO", name: "timeout(서버는 실제로 지움) → 되돌리지 않고 동기화로 확인", async run(h) {
      h.server.postQueue.push(p => { h.server.apply(p); return { ok: false, timeout: true, error: "응답 지연(타임아웃)" }; });
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.checkDelete(T.B, m, { shown: 0, onScreen: 0, onServer: 0, posts: 1, toasts: [DELETED, "응답이 늦어요 — 동기화로 확인할게요"] });
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "L1", name: "삭제 요청 도중 사용자가 동기화 버튼을 누름", async run(h) {
      h.server.hold("post");
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.app("doSync()");                                 // 응답에는 아직 B 가 있다(쓰기가 안 끝났다)
      await h.settle();
      h.check("쓰기 도중 화면의 그 카드 수", h.onScreen(T.B), 0);
      h.server.release("post");
      await h.settle();
      h.checkDelete(T.B, m, { shown: 0, onScreen: 0, onServer: 0, posts: 1 });
      h.check("「동기화 완료」 토스트", h.toastsSince(m).filter(t => t.indexOf("동기화 완료") === 0), ["동기화 완료 · 작업 4건"]);
      h.check("끝난 뒤 pill 이 돌고 있지 않음", h.pillSpinning(), false);
      await h.clock.advance(70000);
      h.check("70초 뒤에도 pill 정지·토스트 1회", [h.pillSpinning(), h.toastsSince(m).filter(t => t.indexOf("동기화 완료") === 0).length], [false, 1]);
    } },
    { key: "L2", name: "쓰기가 없을 때 동기화 버튼(기존 동작 유지)", async run(h) {
      const m = h.mark();
      await h.app("doSync()");
      await h.settle();
      h.check("토스트", h.toastsSince(m), ["동기화 완료 · 작업 5건"]);
      h.check("읽기 요청 수", h.syncs(m), 1);
      h.check("pill 정지", h.pillSpinning(), false);
    } },
    { key: "V1", name: "삭제 요청 도중 팀원 보드를 넘겼다가 돌아옴", async run(h) {
      h.server.hold("post");
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.app('applyView("' + OTHER + '")');
      await h.tick();
      h.check("남의 보드를 보는 동안 내 알람 목록의 그 작업 수", h.app("myTasks").filter(t => t.title === T.B).length, 0);
      h.check("남의 보드에 있는 같은 행·같은 제목 카드는 보임", h.onScreen(T.B), 1);
      const m2 = h.mark();
      h.app('applyView("' + ME + '")');
      await h.tick();
      h.check("돌아왔을 때 그 카드 수", h.onScreen(T.B), 0);
      h.server.release("post");
      await h.settle();
      h.check("돌아온 뒤 다시 그려진 횟수", h.shown(T.B, m2), 0);
      h.check("서버(시트)에 남은 수", h.server.has(T.B), 0);
      h.check("토스트", h.toastsSince(m), [DELETED]);
    } },
    { key: "D1", name: "완료 처리 중 겹친 동기화가 완료를 되돌리지 않는가", async run(h) {
      h.server.hold("sync");
      h.app("doSync({ silent:true })");                  // 스냅샷에는 B 가 진행 중
      await h.tick();
      const m = h.mark();
      await h.markDone(T.B);
      await h.settle();
      h.server.release("sync");
      await h.settle();
      h.check("B 가 진행 중으로 다시 그려진 횟수", h.renders.slice(m.r).filter(cs => cs.some(c => c.title === T.B && !c.done)).length, 0);
      h.check("마지막 화면에서 B 완료 여부", h.cards().filter(c => c.title === T.B).map(c => c.done), [true]);
      h.check("서버 완료 여부", h.server.sheet[ME].find(v => v.title === T.B).done, true);
      h.check("토스트", h.toastsSince(m), ["완료 처리했어요"]);
      h.check("toggleDone 요청", h.posts(m, "toggleDone"), [{ action: "toggleDone", member: ME, row: 6, done: "1", status: "전달 완료", expectIdx: "1002", expectTitle: T.B }]);
    } },
    { key: "K1", name: "완료 비우기 3건", opts: { mine: [
        { title: T.A, idx: "1001" }, { title: "완료 1", idx: "1101", done: true }, { title: T.B, idx: "1002" },
        { title: "완료 2", idx: "1102", done: true }, { title: T.C, idx: "1003" }, { title: "완료 3", idx: "1103", done: true }] },
      async run(h) {
        const m = h.mark();
        h.app("clearDone()"); h.app("doConfirm()");
        await h.settle();
        h.check("요청한 행(내림차순)", h.posts(m, "deleteTask").map(p => p.row), [10, 8, 6]);
        h.check("완료 카드가 다시 그려진 횟수", ["완료 1", "완료 2", "완료 3"].map(t => h.shown(t, m)), [0, 0, 0]);
        h.check("마지막 화면", h.cards().map(c => c.title).sort(), [T.A, T.B, T.C]);
        h.check("서버(시트)", h.server.rows().map(r => r.title), [T.A, T.B, T.C]);
        h.check("토스트", h.toastsSince(m), ["완료 3건을 비웠어요"]);
        h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
      } },
    { key: "K2", name: "완료 비우기 3건 — 직후 읽기가 삭제 전 캐시(내 읽기와는 안 겹침) → 맨 아래 한 장만 잠깐 보였다 스스로 사라진다", opts: { mine: [
        { title: T.A, idx: "1001" }, { title: "완료 1", idx: "1101", done: true }, { title: T.B, idx: "1002" },
        { title: "완료 2", idx: "1102", done: true }, { title: T.C, idx: "1003" }, { title: "완료 3", idx: "1103", done: true }] },
      async run(h) {
        h.server.readQueue.push(h.server.snapshot());
        const m = h.mark();
        h.app("clearDone()"); h.app("doConfirm()");
        await h.settle();
        // 맨 아래(10행) 「완료 3」은 묘비를 세우지 않는다 — 그 행은 새 작업이 다시 들어올 수 있는 자리라 낡은 응답과 구별이 안 된다
        h.check("가운데 완료 카드가 다시 그려진 횟수", ["완료 1", "완료 2"].map(t => h.shown(t, m)), [0, 0]);
        h.check("낡은 응답 직후 화면", h.cards().map(c => c.title).sort(), [T.A, T.B, T.C, "완료 3"]);
        h.check("토스트", h.toastsSince(m), ["완료 3건을 비웠어요"]);
        await h.clock.advance(30000);
        h.check("30초 뒤 화면", h.cards().map(c => c.title).sort(), [T.A, T.B, T.C]);
        h.check("30초 뒤 행 번호가 서버와 일치", h.rowsMatchServer(), true);
        const s0 = h.syncs(m);
        await h.clock.advance(300000);
        h.check("그 뒤 5분간 추가 동기화 없음", h.syncs(m) - s0, 0);
      } },
    { key: "K2b", name: "완료 비우기 3건 — 내 읽기와 겹쳤고 다시 받은 응답이 삭제 전 캐시 → 한 장도 다시 그려지지 않는다", opts: { mine: [
        { title: T.A, idx: "1001" }, { title: "완료 1", idx: "1101", done: true }, { title: T.B, idx: "1002" },
        { title: "완료 2", idx: "1102", done: true }, { title: T.C, idx: "1003" }, { title: "완료 3", idx: "1103", done: true }] },
      async run(h) {
        const before = h.server.snapshot();
        h.server.hold("sync");
        h.app("doSync({ silent:true })");                // 비우기와 겹치는 내 읽기(포커스 프리싱크)
        await h.tick();
        const m = h.mark();
        h.app("clearDone()"); h.app("doConfirm()");
        await h.settle();
        h.server.readQueue.push(before);                 // 버려질 그 읽기가 서버 캐시에 되넣은 삭제 전 데이터
        h.server.release("sync");
        await h.settle();
        h.check("완료 카드가 다시 그려진 횟수", ["완료 1", "완료 2", "완료 3"].map(t => h.shown(t, m)), [0, 0, 0]);
        h.check("마지막 화면", h.cards().map(c => c.title).sort(), [T.A, T.B, T.C]);
        h.check("낡은 응답을 받은 직후에도 행 번호가 서버와 일치", h.rowsMatchServer(), true);
        await h.clock.advance(70000);
        h.check("70초 뒤에도 다시 그려진 횟수", ["완료 1", "완료 2", "완료 3"].map(t => h.shown(t, m)), [0, 0, 0]);
        h.check("70초 뒤 행 번호가 서버와 일치", h.rowsMatchServer(), true);
      } },
    { key: "K3", name: "완료 비우기 도중 겹친 동기화", opts: { mine: [
        { title: T.A, idx: "1001" }, { title: "완료 1", idx: "1101", done: true }, { title: T.B, idx: "1002" },
        { title: "완료 2", idx: "1102", done: true }, { title: T.C, idx: "1003" }, { title: "완료 3", idx: "1103", done: true }] },
      async run(h) {
        h.server.hold("post");
        const m = h.mark();
        h.app("clearDone()"); h.app("doConfirm()");
        await h.settle();
        h.server.releaseOne("post");                     // 1건 지워진 시점
        await h.settle();
        h.app("doSync({ silent:true })");                // 주기 동기화가 끼어든다 — 응답에는 완료 2건이 남아 있다
        await h.settle();
        h.check("도중 화면의 완료 카드 수", h.cards().filter(c => c.done).length, 0);
        h.server.releaseOne("post"); await h.settle();
        h.server.release("post"); await h.settle();
        h.check("완료 카드가 다시 그려진 횟수", ["완료 1", "완료 2", "완료 3"].map(t => h.shown(t, m)), [0, 0, 0]);
        h.check("서버(시트)", h.server.rows().map(r => r.title), [T.A, T.B, T.C]);
        h.check("토스트", h.toastsSince(m), ["완료 3건을 비웠어요"]);
        h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
      } },
    { key: "RO", name: "읽기 전용 보드 — 동작 무변경", async run(h) {
      h.app('applyView("' + OTHER + '")');
      await h.tick();
      const before = h.cards().map(c => c.title);
      const m = h.mark();
      h.app("delTask(6)"); h.app("toggleDone(6)"); h.app("clearDone()");
      await h.settle();
      h.check("쓰기 요청 수", h.posts(m).length, 0);
      h.check("토스트", h.toastsSince(m), ["다른 팀원 보드는 읽기 전용이에요", "다른 팀원 보드는 읽기 전용이에요", "다른 팀원 보드는 읽기 전용이에요"]);
      h.check("카드 그대로", h.cards().map(c => c.title), before);
      // 내 보드에서 6행 B(idx 1002)를 지운 직후에도, 남의 보드 6행의 같은 제목·같은 idx 카드는 걸러지면 안 된다
      h.app('applyView("' + ME + '")'); await h.tick();
      h.del(T.B); await h.settle();
      h.app('applyView("' + OTHER + '")'); await h.tick();
      h.check("내 삭제 직후 남의 보드의 같은 행·제목 카드", h.onScreen(T.B), 1);
      h.check("남의 보드 카드 수", h.cards().length, 3);
      h.check("읽기 전용 표시", h.app('document.body.classList.contains("readonly")'), true);
    } },
    { key: "W1", name: "마감 변경 중 겹친 동기화가 마감을 되돌리지 않는가", async run(h) {
      h.server.hold("sync");
      h.app("doSync({ silent:true })");
      await h.tick();
      const m = h.mark();
      h.app("openTimeEdit(" + h.id(T.B) + ")");
      h.app('commitDue("2030-02-20", "10:30")');
      await h.settle();
      h.server.release("sync");
      await h.settle();
      const want = new Date(2030, 1, 20, 10, 30, 0, 0).getTime();
      h.check("마지막 마감", h.tasks().find(t => t.title === T.B).deadline, want);
      h.check("서버 날짜", h.server.sheet[ME].find(v => v.title === T.B).dueISO, "2030-02-20");
      h.check("updateDue 요청", h.posts(m, "updateDue"), [{ action: "updateDue", member: ME, row: 6, dueDate: "2030-02-20", expectIdx: "1002", expectTitle: T.B }]);
      h.check("토스트", h.toastsSince(m), ["마감을 변경했어요"]);
    } },
    { key: "W2", name: "관리 항목 추가·수정·삭제(쓰기 경로 유지)", async run(h) {
      h.server.hold("sync");
      h.app("doSync({ silent:true })");
      await h.tick();
      const m = h.mark();
      h.app('submitAddMgmt("새 메모")');
      await h.settle();
      h.server.release("sync");
      await h.settle();
      h.check("추가 뒤 관리 항목", h.app("mgmtItems").map(x => x.row + ":" + x.b), ["30:주간 보고", "31:새 메모"]);
      h.app('commitMgmt(30, "b", "주간 보고 v2")'); await h.settle();
      h.app('deleteMgmt(31, "b")'); await h.settle();
      h.check("요청 순서", h.posts(m).map(p => p.action), ["addMemo", "updateMemo", "updateMemo"]);
      h.check("서버 관리 항목", h.server.mgmt[ME].map(x => x.b), ["주간 보고 v2", ""]);
      h.check("토스트", h.toastsSince(m), ["관리 항목을 추가했어요", "저장했어요", "관리 항목을 삭제했어요"]);
      await h.app("doSync({ silent:true })"); await h.settle();
      h.check("동기화 뒤 관리 항목", h.app("mgmtItems").map(x => x.row + ":" + x.b), ["30:주간 보고 v2"]);
    } },
    { key: "W3", name: "작업 추가·수정(쓰기 경로 유지)", async run(h) {
      const m = h.mark();
      const $v = (id, v) => h.app('document.getElementById("' + id + '").value = ' + JSON.stringify(v));
      const due = new Date(2030, 2, 5, 15, 0, 0, 0).getTime();
      h.app("editingId = null; selAlarm = null; selDl = " + due);
      $v("f-title", "새 작업"); $v("f-reqlink", "https://intranet.invalid/creative/view?idx=1500"); $v("f-planlink", "");
      h.app("saveTask()");
      await h.settle();
      h.check("추가 요청", h.posts(m), [{ targetMember: ME, title: "새 작업", url: "https://intranet.invalid/creative/view?idx=1500", planLink: "", dueDate: "2030-03-05", dupCheck: "0" }]);
      h.check("추가된 카드의 행", h.tasks().filter(t => t.title === "새 작업").map(t => t.row), [10]);
      const m2 = h.mark();
      h.app("openEdit(" + h.id(T.C) + ")");
      h.app("selAlarm = null; selDl = " + due);
      $v("f-title", "C 숏폼 4종"); $v("f-reqlink", "https://intranet.invalid/creative/view?idx=1003"); $v("f-planlink", "");
      h.app("saveTask()");
      await h.settle();
      h.check("수정 요청", h.posts(m2), [{ action: "updateTask", member: ME, row: 7, title: "C 숏폼 4종", url: "https://intranet.invalid/creative/view?idx=1003", planLink: "", dueDate: "2030-03-05", expectIdx: "1003", expectTitle: T.C }]);
      h.check("토스트", h.toastsSince(m), ["작업을 추가했어요", "작업을 수정했어요"]);
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "B4", name: "stale → 재동기화가 실패 → 되돌리고 안내, 다시 누르면 지워짐", async run(h) {
      h.server.insertTop({ title: T.Z, idx: "1999" });
      h.server.readQueue.push({ ok: false, error: "HTTP 500" }, { ok: false, error: "HTTP 500" });   // 첫 시도 + 2초 뒤 자동 재시도
      const m = h.mark();
      h.del(T.B);
      await h.clock.advance(3000); await h.settle();
      h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 1);
      h.check("서버(시트)에 남은 수", h.server.has(T.B), 1);
      h.check("마지막 화면의 그 카드 수", h.onScreen(T.B), 1);
      h.check("토스트", h.toastsSince(m), [DELETED, "삭제하지 못했어요 — 잠시 후 다시 눌러 주세요"]);
      const m2 = h.mark();
      h.del(T.B);
      await h.settle();
      h.checkDelete(T.B, m2, { shown: 0, onScreen: 0, onServer: 0, posts: 2, toasts: [DELETED] });
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "B5", name: "stale → 재시도도 stale → 되돌리고 실패 토스트", async run(h) {
      h.server.insertTop({ title: T.Z, idx: "1999" });
      h.server.postQueue.push(() => undefined, p => ({ ok: false, stale: true, row: p.row, found: "다른 작업", foundIdx: "" }));
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 2);
      h.check("서버(시트)에 남은 수", h.server.has(T.B), 1);
      h.check("마지막 화면의 그 카드 수", h.onScreen(T.B), 1);
      h.check("토스트", h.toastsSince(m), [DELETED, "삭제하지 못했어요 — 목록을 다시 불러왔어요. 다시 눌러 주세요"]);
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "T1", name: "같은 지문이 두 줄(쌍둥이)일 때 한 줄만 지움 — 남은 한 줄이 숨지 않는가",
      opts: { mine: [{ title: T.A, idx: "1001" }, { title: T.B, idx: "1002" }, { title: T.B, idx: "1002" }, { title: T.C, idx: "1003" }] },
      async run(h) {
        const m = h.mark();
        h.del(T.B);
        await h.settle();
        const counts = h.renders.slice(m.r).map(cs => cs.filter(c => c.title === T.B).length);
        h.check("삭제 뒤 매 렌더의 B 카드 수(최소·최대)", [Math.min.apply(null, counts), Math.max.apply(null, counts)], [1, 1]);
        h.check("서버(시트)에 남은 수", h.server.has(T.B), 1);
        h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 1);
        await h.clock.advance(70000);
        h.check("70초 뒤 화면의 B 카드 수", h.onScreen(T.B), 1);
        h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
      } },
    { key: "T2", name: "지운 직후 같은 작업이 같은 행에 다시 등록됨 — 잘못 가려도 곧 풀리고 동기화가 끝없이 돌지 않는가", async run(h) {
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.server.sheet[ME].splice(1, 0, { title: T.B, idx: "1002" });   // 누가 같은 게시글을 같은 자리에 다시 넣었다
      h.app("doSync({ silent:true })");
      await h.settle();
      await h.clock.advance(61000);
      h.check("61초 안에 다시 보임", h.onScreen(T.B), 1);
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
      const s0 = h.syncs(m);
      await h.clock.advance(300000);
      h.check("그 뒤 5분간 추가 동기화 없음", h.syncs(m) - s0, 0);
      h.check("읽기 요청 총수(4회 이하)", s0, n => n <= 4);
    } },
    { key: "T3", name: "맨 아래 작업을 지운 직후 앱에서 같은 작업을 다시 추가 — 새 카드가 숨지 않는가",
      opts: { mine: [{ title: T.A, idx: "1001" }, { title: T.B, idx: "1002" }] },
      async run(h) {
        h.del(T.B);
        await h.settle();
        h.check("삭제 뒤 화면의 B 카드 수", h.onScreen(T.B), 0);
        const m = h.mark();
        const $v = (id, v) => h.app('document.getElementById("' + id + '").value = ' + JSON.stringify(v));
        h.app("editingId = null; selAlarm = null; selDl = " + new Date(2030, 2, 5, 15, 0, 0, 0).getTime());
        $v("f-title", T.B); $v("f-reqlink", "https://intranet.invalid/creative/view?idx=1002"); $v("f-planlink", "");
        h.app("saveTask()");
        await h.settle();
        h.check("추가 뒤 화면의 B 카드(행)", h.tasks().filter(t => t.title === T.B).map(t => t.row), [6]);
        h.check("추가 뒤 B 카드가 빠진 렌더 수", h.renders.slice(m.r).filter(cs => !cs.some(c => c.title === T.B)).length, 0);
      } },
    { key: "T4", name: "완료·진행 쌍둥이(같은 지문, 완료 여부만 다름)에서 진행 쪽 삭제가 stale → 진행 쪽만 재시도",
      opts: { mine: [{ title: T.A, idx: "1001" }, { title: T.B, idx: "1002", done: true }, { title: T.B, idx: "1002" }, { title: T.C, idx: "1003" }] },
      async run(h) {
        // 두 칸 민다 — 한 칸만 밀리면 7행에 완료 쌍둥이가 와서 서버 지문(idx+제목)이 통과해 버린다(서버 계약의 한계, 이 시험 범위 밖)
        h.server.insertTop({ title: T.Z, idx: "1999" }); h.server.insertTop({ title: "Z2 새로 들어온 작업", idx: "1998" });
        const m = h.mark();
        h.app("delTask(7)");                               // 진행 중인 B (7행 → 밀려서 9행)
        await h.settle();
        h.check("요청한 행", h.posts(m, "deleteTask").map(p => p.row), [7, 9]);
        h.check("서버에 남은 B(완료 여부)", h.server.sheet[ME].filter(v => v.title === T.B).map(v => !!v.done), [true]);
        h.check("진행 중 B 가 다시 그려진 횟수", h.renders.slice(m.r).filter(cs => cs.some(c => c.title === T.B && !c.done)).length, 0);
        h.check("완료 B 가 빠진 렌더 수", h.renders.slice(m.r).filter(cs => !cs.some(c => c.title === T.B && c.done)).length, 0);
        h.check("토스트", h.toastsSince(m), [DELETED]);
        await h.clock.advance(70000);
        h.check("70초 뒤 화면의 B(완료 여부)", h.cards().filter(c => c.title === T.B).map(c => c.done), [true]);
        h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
      } },
    { key: "L3", name: "동기화 버튼을 누른 직후 삭제(읽기 한 번 안에 쓰기가 시작·종료)", async run(h) {
      h.server.hold("sync");
      const m = h.mark();
      h.app("doSync()");
      await h.tick();
      h.del(T.B);
      await h.settle();
      h.server.release("sync");
      await h.settle();
      h.checkDelete(T.B, m, { shown: 0, onScreen: 0, onServer: 0, posts: 1, toasts: [DELETED, "동기화 완료 · 작업 4건"] });
      h.check("pill 정지", h.pillSpinning(), false);
    } },
    { key: "F1", name: "버려진 수동 동기화를 다시 받다가 실패 — 실패 토스트 1회, 끝없이 재시도하지 않는가", async run(h) {
      h.server.hold("post");
      const m = h.mark();
      await h.markDone(T.B);
      await h.settle();
      h.app("doSync()");                                 // 쓰기 도중 → 버려진다
      await h.settle();
      h.server.readQueue.push({ ok: false, error: "HTTP 500" }, { ok: false, error: "HTTP 500" });
      h.server.release("post");
      await h.clock.advance(3000); await h.settle();
      await h.clock.advance(70000);
      h.check("토스트", h.toastsSince(m).slice().sort(), ["동기화 실패 — 시트 서버가 잠시 응답하지 않아요", "완료 처리했어요"]);
      h.check("읽기 요청 총수(버려진 1 + 다시 받기와 그 자동 재시도 2 + 캐시 만료 뒤 1)", h.syncs(m), 4);
      h.check("pill 정지", h.pillSpinning(), false);
      h.check("화면의 B 완료 여부", h.cards().filter(c => c.title === T.B).map(c => c.done), [true]);
    } },
    { key: "S1", name: "완료 처리의 stale 은 기존대로(되돌리고 안내, 자동 재시도 없음)", async run(h) {
      h.server.insertTop({ title: T.Z, idx: "1999" });
      const m = h.mark();
      await h.markDone(T.B);
      await h.settle();
      h.check("toggleDone 요청 수", h.posts(m, "toggleDone").length, 1);
      h.check("토스트", h.toastsSince(m), ["'A 런칭 배너'가 그 자리에 있어요 — 목록을 다시 불러올게요"]);
      h.check("서버 완료 여부(A·B)", [T.A, T.B].map(t => !!h.server.sheet[ME].find(v => v.title === t).done), [false, false]);
      h.check("화면의 B 완료 여부", h.cards().filter(c => c.title === T.B).map(c => c.done), [false]);
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "X1", name: "연타 — 삭제가 끝나기 전 같은 카드·다른 카드 휴지통", async run(h) {
      h.server.hold("post");
      const m = h.mark();
      h.del(T.B);
      await h.tick();
      h.app("delTask(" + h.id(T.C) + ")");               // 진행 중엔 무시된다(기존 동작)
      await h.settle();
      h.server.release("post");
      await h.settle();
      h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 1);
      h.check("서버(시트)", h.server.rows().map(r => r.title), [T.A, T.C, T.D, T.E]);
      h.check("마지막 화면", h.cards().map(c => c.title).sort(), [T.A, T.C, T.D, T.E]);
      h.check("무시된 클릭도 안내는 한다", h.toastsSince(m), [DELETED, "앞선 삭제를 처리하고 있어요 — 잠시 후 다시 눌러 주세요"]);
    } },

    // ── 아래는 검수에서 나온 것. 쌍둥이 = 같은 게시글·같은 제목 두 줄(서버 지문 검사도 구별하지 못한다) ──
    { key: "U1", name: "쌍둥이 중 누른 쪽이 이미 시트에서 지워져 있었음 → 남은(누르지 않은) 한 줄을 지우지 않는다", opts: TWINS, async run(h) {
      h.server.removeBySheet(T.B);                       // 누른 쪽(6행)이 먼저 지워졌다 → 남은 쌍둥이는 7행
      const m = h.mark();
      h.del(T.B);                                        // 화면의 첫 번째 B(6행)
      await h.settle();
      h.check("deleteTask 요청 행(재시도 없음)", h.posts(m, "deleteTask").map(p => p.row), [6]);
      h.check("서버(시트)에 남은 B", h.server.has(T.B), 1);
      h.check("마지막 화면의 B", h.onScreen(T.B), 1);
      h.check("토스트", h.toastsSince(m), [DELETED]);
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    // 유령이 보이면 사용자는 그걸 다시 누르고(제보와 같은 행동), 그 요청은 남은 진짜 한 줄에 떨어진다 → 유령이 아예 안 보여야 한다
    { key: "U2", name: "쌍둥이(떨어진 두 줄) 한 줄 삭제 ok + 직후 읽기가 삭제 전 캐시 → 지운 한 줄이 유령으로 다시 보이지 않는다", opts: TWINS, async run(h) {
      h.server.readQueue.push(h.server.snapshot());
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      const counts = h.renders.slice(m.r).map(cs => cs.filter(c => c.title === T.B).length);
      h.check("삭제 뒤 매 렌더의 B 카드 수(최소·최대)", [Math.min.apply(null, counts), Math.max.apply(null, counts)], [1, 1]);
      h.check("서버(시트)에 남은 B", h.server.has(T.B), 1);
      h.check("낡은 응답을 받은 직후에도 행 번호가 서버와 일치", h.rowsMatchServer(), true);
      await h.clock.advance(70000);
      h.check("70초 뒤 화면의 B", h.onScreen(T.B), 1);
      h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 1);
      h.check("70초 뒤 행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "U3", name: "쌍둥이(붙은 두 줄) 한 줄 삭제 ok + 삭제 전 캐시 → 유령 없음, 캐시가 죽은 뒤에도 남은 한 줄은 그대로",
      opts: { mine: [{ title: T.A, idx: "1001" }, { title: T.B, idx: "1002" }, { title: T.B, idx: "1002" }, { title: T.C, idx: "1003" }] },
      async run(h) {
        h.server.readQueue.push(h.server.snapshot());
        const m = h.mark();
        h.del(T.B);
        await h.settle();
        h.check("낡은 응답을 받은 직후에도 행 번호가 서버와 일치", h.rowsMatchServer(), true);
        await h.clock.advance(70000);
        const counts = h.renders.slice(m.r).map(cs => cs.filter(c => c.title === T.B).length);
        h.check("삭제 뒤 매 렌더의 B 카드 수(최소·최대)", [Math.min.apply(null, counts), Math.max.apply(null, counts)], [1, 1]);
        h.check("서버(시트)에 남은 B", h.server.has(T.B), 1);
        h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 1);
        h.check("70초 뒤 행 번호가 서버와 일치", h.rowsMatchServer(), true);
      } },
    { key: "U4", name: "쌍둥이 + 첫 삭제 timeout(서버는 늦게 커밋) → 다시 보인 카드를 또 눌러도 한 줄은 남는다", opts: TWINS, async run(h) {
      const before = h.server.snapshot();
      let commit = null;
      h.server.postQueue.push(p => { commit = () => h.server.apply(p); return { ok: false, timeout: true, error: "응답 지연(타임아웃)" }; });
      h.server.readQueue.push(before);                   // 타임아웃 직후 읽기는 커밋 전 목록
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.check("타임아웃 뒤 화면의 B(커밋 전 목록)", h.onScreen(T.B), 2);
      commit();                                          // 서버가 이제 커밋 — 6행 B 삭제, 쌍둥이는 7행으로
      h.del(T.B);
      await h.settle();
      h.check("deleteTask 요청 행", h.posts(m, "deleteTask").map(p => p.row), [6, 6]);
      h.check("서버(시트)에 남은 B", h.server.has(T.B), 1);
      h.check("마지막 화면의 B", h.onScreen(T.B), 1);
    } },
    { key: "B6", name: "stale 의 원인이 행 밀림이 아니라 제목 변경 → 「이미 없어짐」으로 넘기지 않고 실패를 알린다", async run(h) {
      h.server.sheet[ME][1].title = T.B + " v2";          // 같은 행·같은 게시글, 제목만 고쳐졌다
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 1);
      h.check("서버(시트)에 그대로", h.server.has(T.B + " v2"), 1);
      h.check("새 제목으로 다시 나온 카드", h.onScreen(T.B + " v2"), 1);
      h.check("토스트", h.toastsSince(m), [DELETED, "삭제하지 못했어요 — 목록을 다시 불러왔어요. 다시 눌러 주세요"]);
    } },
    { key: "B7", name: "stale → 다시 받은 응답에 내 단이 없음 → 성공으로 넘기지 않는다", async run(h) {
      h.server.insertTop({ title: T.Z, idx: "1999" });
      const snap = h.server.snapshot();
      snap.members = snap.members.filter(x => x.name !== ME);
      h.server.readQueue.push(snap);
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 1);
      h.check("서버(시트)에 남은 수", h.server.has(T.B), 1);
      h.check("토스트", h.toastsSince(m), [DELETED, "삭제하지 못했어요 — 잠시 후 다시 눌러 주세요"]);   // 내 단이 없는 목록은 「다시 불러왔다」고 말하지 않는다
    } },
    { key: "C2", name: "삭제 ok + 삭제 전 캐시 구간에 그 아래 카드를 삭제 — 한 번 눌러 지워진다(행 번호를 당겨 둔다)", async run(h) {
      h.server.readQueue.push(h.server.snapshot());
      h.del(T.B);
      await h.settle();
      h.check("낡은 응답을 받은 화면의 행 번호가 서버와 일치", h.rowsMatchServer(), true);
      const m = h.mark();
      h.del(T.C);                                        // 낡은 응답의 C 는 7행, 실제 시트는 6행
      await h.settle();
      h.checkDelete(T.C, m, { shown: 0, onScreen: 0, onServer: 0, posts: 1, toasts: [DELETED] });
      h.check("요청한 행", h.posts(m, "deleteTask").map(p => p.row), [6]);
      h.check("서버(시트)", h.server.rows().map(r => r.title), [T.A, T.D, T.E]);
      await h.clock.advance(70000);
      h.check("70초 뒤 화면", h.cards().map(c => c.title).sort(), [T.A, T.D, T.E]);
      h.check("70초 뒤 행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "C3", name: "삭제 ok + 삭제 전 캐시 구간에 그 아래 카드를 완료 처리 — 실제 행으로 간다", async run(h) {
      h.server.readQueue.push(h.server.snapshot());
      h.del(T.B);
      await h.settle();
      const m = h.mark();
      await h.markDone(T.D);
      await h.settle();
      h.check("toggleDone 요청 행(낡은 응답은 8, 실제는 7)", h.posts(m, "toggleDone").map(p => p.row), [7]);
      h.check("서버 완료 여부(A·C·D)", [T.A, T.C, T.D].map(t => !!h.server.sheet[ME].find(v => v.title === t).done), [false, false, true]);
      h.check("토스트", h.toastsSince(m), ["완료 처리했어요"]);
    } },
    { key: "K4", name: "완료 비우기 — 완료 쌍둥이 중 한 건만 실패 → 살아남은 한 줄이 묘비에 가려지지 않는다",
      opts: { mine: [{ title: T.A, idx: "1001" }, { title: T.E, idx: "1005", done: true }, { title: T.E, idx: "1005", done: true }, { title: T.B, idx: "1002" }] },
      async run(h) {
        h.server.postQueue.push(() => ({ ok: false, busy: true, error: "다른 저장이 진행 중이에요." }));   // 7행 실패, 6행 성공 → 7행 것이 6행으로 당겨진다
        const m = h.mark();
        h.app("clearDone()"); h.app("doConfirm()");
        await h.settle();
        h.check("요청한 행", h.posts(m, "deleteTask").map(p => p.row), [7, 6]);
        h.check("서버(시트)", h.server.rows().map(r => r.title), [T.A, T.E, T.B]);
        h.check("마지막 화면", h.cards().map(c => c.title).sort(), [T.A, T.B, T.E]);
        h.check("토스트", h.toastsSince(m), ["1건 삭제 · 1건 실패"]);
      } },
    { key: "D2", name: "완료 처리 + 겹친 읽기 + 다시 받은 응답이 완료 전 캐시 → 캐시가 죽은 뒤 스스로 맞춘다(10분이 아니라 30초 안)", async run(h) {
      const before = h.server.snapshot();
      h.server.hold("sync");
      h.app("doSync({ silent:true })");
      await h.tick();
      const m = h.mark();
      await h.markDone(T.B);
      await h.settle();
      h.server.readQueue.push(before);                   // 버려질 그 읽기가 서버 캐시에 되넣은 완료 전 데이터
      h.server.release("sync");
      await h.settle();
      await h.clock.advance(30000);
      h.check("서버의 B 완료", !!h.server.sheet[ME][1].done, true);
      h.check("30초 뒤 화면의 B 완료", h.cards().filter(c => c.title === T.B).map(c => c.done), [true]);
      h.check("읽기 요청 수(다시 받기 1 + 캐시 만료 뒤 1)", h.syncs(m), 2);
      const s0 = h.syncs(m);
      await h.clock.advance(300000);
      h.check("그 뒤 5분간 추가 동기화 없음", h.syncs(m) - s0, 0);
    } },
    { key: "P1", name: "쓰기 응답이 끝내 오지 않음 → 45초 상한 뒤 동기화가 다시 반영된다", async run(h) {
      h.server.hold("post");
      const m = h.mark();
      await h.markDone(T.C);
      await h.settle();
      h.server.sheet[ME].push({ title: T.Z, idx: "1999" });   // 그 사이 새 작업이 맨 아래에 들어왔다(행은 안 밀린다)
      h.app("doSync()");
      await h.clock.advance(40000);
      h.check("40초 시점 — 쓰기와 겹친 응답은 아직 버려진다", [h.onScreen(T.Z), h.toastsSince(m).length], [0, 0]);
      await h.clock.advance(6000);
      h.check("46초 시점 새 작업", h.onScreen(T.Z), 1);
      h.check("46초 시점 토스트", h.toastsSince(m).slice().sort(), ["동기화 완료 · 작업 6건", "응답이 늦어요 — 동기화로 확인할게요"]);
      h.check("pill 정지", h.pillSpinning(), false);
      h.server.release("post");                          // 응답이 뒤늦게 도착(서버는 이제 커밋)
      await h.settle();
      h.check("늦은 응답 뒤 화면의 C 완료", h.cards().filter(c => c.title === T.C).map(c => c.done), [true]);
      h.check("「동기화 완료」 토스트는 1회", h.toastsSince(m).filter(t => t.indexOf("동기화 완료") === 0).length, 1);
    } },
    { key: "L4", name: "조용히 시작한 마지막 회차에 합류한 수동 동기화가 쓰기와 겹쳐 버려짐 → 「동기화 완료」는 나온다", async run(h) {
      h.server.hold("sync");
      h.app("doSync({ silent:true })");                  // 회차 1(조용)
      await h.tick();
      h.app("doSync({ silent:true })");                  // 합류 → 회차 2 예약
      await h.tick();
      h.server.releaseOne("sync");                       // 회차 1 끝 → 회차 2 시작(조용)
      await h.settle();
      const m = h.mark();
      h.app("doSync()");                                 // 마지막 회차에 수동 합류
      await h.tick();
      h.del(T.B);                                        // 쓰기 시작·종료 → 회차 2 는 버려진다
      await h.settle();
      h.server.release("sync");
      await h.clock.advance(5000);
      h.check("「동기화 완료」 토스트", h.toastsSince(m).filter(t => t.indexOf("동기화 완료") === 0), ["동기화 완료 · 작업 4건"]);
      h.check("pill 정지", h.pillSpinning(), false);
      h.check("화면의 B", h.onScreen(T.B), 0);
    } },
    { key: "RS1", name: "맨 아래 카드를 지우고 곧바로 같은 게시글을 다시 보냄(딸깍) → 새 카드가 가려지지 않는다",
      opts: { mine: [{ title: T.A, idx: "1001" }, { title: T.B, idx: "1002" }] },
      async run(h) {
        h.del(T.B);
        await h.settle();
        h.server.apply({ targetMember: ME, title: T.B, url: "https://intranet.invalid/creative/view?idx=1002", planLink: "", dueDate: "2030-01-15" });   // 지운 그 행(6)에 들어간다
        const m = h.mark();
        h.app("doSync()");
        await h.settle();
        h.check("동기화 직후 화면의 B", h.onScreen(T.B), 1);
        h.check("B 가 빠진 렌더 수", h.renders.slice(m.r).filter(cs => !cs.some(c => c.title === T.B)).length, 0);
        h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
      } },
    { key: "RS2", name: "묘비가 다시 보낸 카드를 잘못 가린 사이, 제목이 같은 다른 게시글 카드를 완료 → 가려진 카드에 기록되지 않는다",
      opts: { mine: [{ title: T.A, idx: "1001" }, { title: "주간 배너", idx: "1002" }] },
      async run(h) {
        const done = idx => !!h.server.sheet[ME].find(v => v.idx === idx).done;
        h.server.hold("sync");
        h.app("doSync({ silent:true })");                // 삭제와 겹친 내 읽기 → 맨 아래 카드여도 묘비가 선다
        await h.tick();
        h.del("주간 배너");
        await h.settle();
        h.server.release("sync");
        await h.settle();
        h.check("삭제 뒤 화면", h.cards().map(c => c.title), [T.A]);
        const url = i => "https://intranet.invalid/creative/view?idx=" + i;
        h.server.apply({ targetMember: ME, title: "주간 배너", url: url("1002"), planLink: "", dueDate: "2030-01-15" });   // 6행 — 지운 그 자리
        h.server.apply({ targetMember: ME, title: "주간 배너", url: url("1003"), planLink: "", dueDate: "2030-01-15" });   // 7행 — 제목만 같은 다른 게시글
        h.app("doSync({ silent:true })");
        await h.settle();
        const seen = h.tasks().filter(t => t.title === "주간 배너");
        h.check("묘비가 6행 카드를 가려 화면에는 한 장(전제)", seen.length, 1);
        const m = h.mark();
        h.app("toggleDone(" + seen[0].id + ")");
        await h.clock.advance(40);
        h.app('confirmDone("전달 완료")');
        await h.settle();
        h.check("서버 완료 여부(1002·1003) — 가려진 1002 에 기록되면 안 된다", [done("1002"), done("1003")], [false, false]);
        h.check("토스트", h.toastsSince(m), ["'주간 배너'가 그 자리에 있어요 — 목록을 다시 불러올게요"]);
        await h.clock.advance(70000);
        h.check("70초 뒤 화면의 「주간 배너」", h.onScreen("주간 배너"), 2);
        h.check("70초 뒤 행 번호가 서버와 일치", h.rowsMatchServer(), true);
        const m2 = h.mark();
        h.app("toggleDone(" + h.tasks().find(t => t.row === 7).id + ")");
        await h.clock.advance(40);
        h.app('confirmDone("전달 완료")');
        await h.settle();
        h.check("다시 누르면 누른 카드(1003)가 완료", [done("1002"), done("1003")], [false, true]);
        h.check("그때 요청", h.posts(m2, "toggleDone").map(p => [p.row, p.expectIdx]), [[7, "1003"]]);
      } },
    { key: "RS3", name: "제목이 같은 다른 게시글이 바로 아래 — 위 카드 삭제 뒤 확인 동기화 전에 완료해도 옆 카드에 기록되지 않는다",
      opts: { mine: [{ title: T.A, idx: "1001" }, { title: "배너 수정", idx: "1002" }, { title: "배너 수정", idx: "1003" }, { title: T.D, idx: "1004" }] },
      async run(h) {
        const done = idx => !!h.server.sheet[ME].find(v => v.idx === idx).done;
        const second = h.tasks().find(t => t.row === 6).id;   // 누를 카드 = 1002
        h.server.hold("sync");                           // 삭제 뒤 확인 동기화가 아직 안 끝난 창
        h.del(T.A);
        await h.settle();
        const m = h.mark();
        h.app("toggleDone(" + second + ")");
        await h.clock.advance(40);
        h.app('confirmDone("전달 완료")');
        await h.settle();
        h.server.release("sync");
        await h.settle();
        // 서버에서는 1002 가 5행, 1003 이 6행 — 제목만 보면 6행 요청이 1003 에 통과한다
        h.check("서버 완료 여부(1002·1003)", [done("1002"), done("1003")], [false, false]);
        h.check("toggleDone 요청(행·게시글)", h.posts(m, "toggleDone").map(p => [p.row, p.expectIdx]), [[6, "1002"]]);
      } },
    { key: "E5", name: "위 카드가 다른 곳에서 지워져 한 칸 당겨진 뒤 맨 아래 카드를 삭제 — 서버는 「영상작업 행이 아님」 → 새 행으로 한 번에 지워진다", async run(h) {
      h.server.removeBySheet(T.A);                       // E 는 9행 → 8행, 9행은 이제 빈 행
      const m = h.mark();
      h.del(T.E);
      await h.settle();
      h.checkDelete(T.E, m, { shown: 0, onScreen: 0, onServer: 0, posts: 2, toasts: [DELETED] });
      h.check("요청한 행", h.posts(m, "deleteTask").map(p => p.row), [9, 8]);
      h.check("다른 작업은 그대로", [T.B, T.C, T.D].map(t => h.server.has(t)), [1, 1, 1]);
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "E6", name: "같은 상황에서 맨 아래 카드를 되돌리기 — 「영상작업 행이 아님」도 행 밀림으로 안내하고 목록을 다시 받는다", async run(h) {
      h.server.removeBySheet(T.A);
      const m = h.mark();
      h.app("toggleDone(" + h.id(T.E) + ")");
      await h.clock.advance(40);
      h.app('confirmDone("수정 진행")');
      await h.settle();
      h.check("토스트", h.toastsSince(m), ["그 자리가 비어 있어요 — 목록을 다시 불러올게요"]);
      h.check("서버의 E 는 그대로 완료", !!h.server.sheet[ME].find(v => v.title === T.E).done, true);
      h.check("행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "E7", name: "삭제가 일반 오류(HTTP 500)로 실패 — 되돌리고, 곧바로 목록을 받아 다시 누르면 지워진다", async run(h) {
      h.server.insertTop({ title: T.Z, idx: "1999" });   // 행도 밀려 있었다
      h.server.postQueue.push(() => ({ ok: false, error: "HTTP 500" }));
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.check("토스트", h.toastsSince(m), [DELETED, "삭제 실패 — 되돌렸어요"]);
      h.check("행 번호가 서버와 일치(실패 뒤 받아 둠)", h.rowsMatchServer(), true);
      const m2 = h.mark();
      h.del(T.B);
      await h.settle();
      h.checkDelete(T.B, m2, { shown: 0, onScreen: 0, onServer: 0, posts: 1, toasts: [DELETED] });
    } },
    { key: "G8", name: "busy + 다시 받은 목록이 그 카드가 들어오기 전의 캐시 → 「이미 지워짐」으로 넘기지 않는다", async run(h) {
      const old = h.server.snapshot();
      const me = old.members.find(x => x.name === ME);
      me.video = me.video.filter(v => v.title !== T.B).map((v, i) => Object.assign(v, { row: 5 + i }));   // B 가 없던 때의 목록
      h.server.postQueue.push(() => ({ ok: false, busy: true, error: "다른 저장이 진행 중이에요." }));
      h.server.readQueue.push(old);
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 1);
      h.check("토스트", h.toastsSince(m), [DELETED, "삭제하지 못했어요 — 목록을 다시 불러왔어요. 다시 눌러 주세요"]);
      await h.clock.advance(30000);
      h.check("30초 뒤 화면·서버의 B", [h.onScreen(T.B), h.server.has(T.B)], [1, 1]);
      h.check("30초 뒤 행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "PN4", name: "쌍둥이 중 한 줄의 완료 창을 연 사이 바로 그 줄이 사라짐 → 남은 쌍둥이에 쓰지 않는다",
      opts: { mine: [{ title: T.A, idx: "1001" }, { title: T.B, idx: "1002" }, { title: T.B, idx: "1002" }, { title: T.C, idx: "1003" }] },
      async run(h) {
        h.app("toggleDone(" + h.tasks().find(t => t.row === 6).id + ")");
        await h.clock.advance(40);
        h.server.sheet[ME].splice(1, 1);                 // 누른 그 줄(6행)이 시트에서 지워졌다
        h.app("doSync({ silent:true })");
        await h.settle();
        const m = h.mark();
        h.app('confirmDone("전달 완료")');
        await h.settle();
        h.check("toggleDone 요청 수", h.posts(m, "toggleDone").length, 0);
        h.check("남은 B 는 그대로 진행 중", h.server.sheet[ME].filter(v => v.title === T.B).map(v => !!v.done), [false]);
        h.check("토스트", h.toastsSince(m), ["그 사이 목록이 바뀌었어요 — 다시 눌러 주세요"]);
      } },
    { key: "PN5", name: "쌍둥이(완료·진행) 중 위 줄의 되돌리기 창을 연 사이 한 칸 당겨짐 → 같은 id 의 아래 쌍둥이가 아니라 누른 줄에 기록",
      opts: { mine: [{ title: T.A, idx: "1001" }, { title: T.B, idx: "1002", done: true, status: "전달 완료" }, { title: T.B, idx: "1002" }, { title: T.C, idx: "1003" }] },
      async run(h) {
        h.app("toggleDone(" + h.tasks().find(t => t.row === 6).id + ")");   // 완료된 위 줄(6행)을 되돌리려 한다
        await h.clock.advance(40);
        h.server.removeBySheet(T.A);                     // 위 카드가 빠져 6→5, 7→6
        h.app("doSync({ silent:true })");
        await h.settle();
        const m = h.mark();
        h.app('confirmDone("수정 진행")');
        await h.settle();
        h.check("toggleDone 요청(행·done)", h.posts(m, "toggleDone").map(p => [p.row, p.done]), [[5, "0"]]);
        h.check("서버 B 두 줄의 완료 여부", h.server.sheet[ME].filter(v => v.title === T.B).map(v => !!v.done), [false, false]);
      } },
    { key: "PN6", name: "제목을 바꾼 편집이 가는 중에 같은 카드의 마감 창을 열었고 그 편집이 실패해 제목이 되돌아감 → 같은 카드로 본다", async run(h) {
      const $v = (id, v) => h.app('document.getElementById("' + id + '").value = ' + JSON.stringify(v));
      h.server.postQueue.push(() => ({ ok: false, error: "HTTP 500" }));   // 편집 요청은 실패로 끝난다
      h.server.hold("post");
      h.app("openEdit(" + h.id(T.C) + ")");
      $v("f-title", "C 숏폼 4종"); $v("f-reqlink", "https://intranet.invalid/creative/view?idx=1003"); $v("f-planlink", "");
      h.app("saveTask()");
      await h.tick();
      h.app("openTimeEdit(" + h.id("C 숏폼 4종") + ")");   // 낙관적으로 바뀐 제목인 채 창이 열린다
      await h.tick();
      h.server.release("post");                          // 편집 실패 → 제목이 원래대로 되돌려진다(목록은 교체되지 않는다)
      await h.settle();
      const m = h.mark();
      h.app('commitDue("2030-02-20", "18:00")');
      await h.settle();
      h.check("updateDue 요청(행·제목)", h.posts(m, "updateDue").map(p => [p.row, p.expectTitle]), [[7, T.C]]);
      h.check("토스트", h.toastsSince(m), ["마감을 변경했어요"]);
    } },
    { key: "PN7", name: "이미 있는 작업과 같은 제목·링크로 방금 추가한 카드(아직 임시 id)의 완료 창 → 추가가 끝난 뒤 확정해도 새로 추가한 줄에 기록", async run(h) {
      const $v = (id, v) => h.app('document.getElementById("' + id + '").value = ' + JSON.stringify(v));
      h.server.hold("post");
      h.app("openAdd()"); await h.clock.advance(150);
      $v("f-title", T.B); $v("f-reqlink", "https://intranet.invalid/creative/view?idx=1002"); $v("f-planlink", "");
      h.app("selDl = " + new Date(2030, 2, 5, 15, 0, 0, 0).getTime());
      h.app("saveTask()"); await h.clock.advance(200);
      h.app("toggleDone(" + h.tasks().find(t => t.id < 0).id + ")"); await h.clock.advance(40);
      h.server.release("post"); await h.settle();          // 추가 ok → 동기화 → 새 줄은 맨 아래(10행)
      const m = h.mark();
      h.app('confirmDone("전달 완료")'); await h.settle();
      h.check("toggleDone 요청 행", h.posts(m, "toggleDone").map(p => p.row), [10]);
      h.check("서버 B 두 줄의 완료 여부(기존 6행·새 10행)", h.server.sheet[ME].filter(v => v.title === T.B).map(v => !!v.done), [false, true]);
    } },
    { key: "LATE1", name: "맨 아래 카드 삭제(내 읽기와 안 겹침) — 뒤늦은 동기화가 다른 PC 의 느린 읽기가 넣은 삭제 전 캐시를 받음 → 다시 보여도 스스로 사라진다",
      opts: { mine: [{ title: T.A, idx: "1001" }, { title: T.B, idx: "1002" }] },
      async run(h) {
        const before = h.server.snapshot();
        const m = h.mark();
        h.del(T.B);
        await h.settle();
        h.check("삭제 직후 화면의 B", h.onScreen(T.B), 0);
        await h.clock.advance(20000);
        h.server.readQueue.push(before);                 // 삭제와 겹쳤던 다른 PC 의 느린 읽기가 이제야 끝나 캐시에 삭제 전 목록을 넣었다
        await h.clock.advance(7000);                     // 25.3초의 뒤늦은 동기화가 그 캐시를 받는다
        h.check("27초 시점 화면의 B(잠깐 다시 보이는 것은 알려진 한계)", h.onScreen(T.B), 1);
        await h.clock.advance(30000);                    // 지켜보는 기록이 캐시가 죽은 뒤 한 번 더 받게 한다
        h.check("57초 시점 화면의 B", h.onScreen(T.B), 0);
        h.check("57초 시점 행 번호가 서버와 일치", h.rowsMatchServer(), true);
        h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 1);
        const s0 = h.syncs(m);
        await h.clock.advance(300000);
        h.check("그 뒤 5분간 추가 동기화 없음", h.syncs(m) - s0, 0);
      } },
    { key: "DL1", name: "다른 곳에서 링크(게시글 번호)만 바뀐 카드를 삭제 → 「이미 지워짐」으로 넘기지 않고 안내, 다시 누르면 지워진다", async run(h) {
      h.server.sheet[ME].find(v => v.title === T.D).idx = "8890";   // 화면은 아직 1004
      const m = h.mark();
      h.del(T.D);
      await h.settle();
      h.check("첫 누름 요청(행·게시글)", h.posts(m, "deleteTask").map(p => [p.row, p.expectIdx]), [[8, "1004"]]);
      h.check("첫 누름 토스트", h.toastsSince(m), [DELETED, "삭제하지 못했어요 — 목록을 다시 불러왔어요. 다시 눌러 주세요"]);
      h.check("화면·서버의 D", [h.onScreen(T.D), h.server.has(T.D)], [1, 1]);
      const m2 = h.mark();
      h.del(T.D);
      await h.settle();
      h.check("둘째 누름 요청(행·게시글)", h.posts(m2, "deleteTask").map(p => [p.row, p.expectIdx]), [[8, "8890"]]);
      h.check("둘째 누름 뒤 화면·서버의 D", [h.onScreen(T.D), h.server.has(T.D)], [0, 0]);
    } },
    { key: "Z1", name: "두 건을 차례로 삭제한 뒤 두 건 모두 지우기 전의 응답이 옴 → 둘 다 다시 안 그려지고 행 번호도 맞다", async run(h) {
      const before = h.server.snapshot();                // A5 B6 C7 D8 E9
      h.del(T.B); await h.settle();
      h.del(T.C); await h.settle();                      // C 는 이때 6행 — 묘비도 6행으로 선다
      h.server.readQueue.push(before);
      const m = h.mark();
      h.app("doSync({ silent:true })");
      await h.settle();
      h.check("B·C 가 다시 그려진 횟수", [h.shown(T.B, m), h.shown(T.C, m)], [0, 0]);
      h.check("화면", h.cards().map(c => c.title).sort(), [T.A, T.D, T.E]);
      h.check("낡은 응답 직후 행 번호가 서버와 일치", h.rowsMatchServer(), true);
    } },
    { key: "B8", name: "stale → 다시 받은 응답의 내 단이 오류와 함께 빈 목록 → 「이미 지워짐」으로 넘기지 않는다", async run(h) {
      h.server.insertTop({ title: T.Z, idx: "1999" });
      const snap = h.server.snapshot();
      const me = snap.members.find(x => x.name === ME);
      me.video = []; me.error = "이름 못찾음";
      h.server.readQueue.push(snap);
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 1);
      h.check("서버(시트)에 남은 수", h.server.has(T.B), 1);
      h.check("토스트", h.toastsSince(m), [DELETED, "삭제하지 못했어요 — 잠시 후 다시 눌러 주세요"]);
    } },
    { key: "TO2", name: "timeout(서버는 실제로 지움) + 확인용 동기화가 삭제 전 캐시 → 캐시가 죽은 뒤 스스로 사라진다", async run(h) {
      const before = h.server.snapshot();
      h.server.postQueue.push(p => { h.server.apply(p); return { ok: false, timeout: true, error: "응답 지연(타임아웃)" }; });
      h.server.readQueue.push(before);
      const m = h.mark();
      h.del(T.B);
      await h.settle();
      await h.clock.advance(30000);
      h.check("30초 뒤 화면의 B", h.onScreen(T.B), 0);
      h.check("30초 뒤 행 번호가 서버와 일치", h.rowsMatchServer(), true);
      h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 1);
      const s0 = h.syncs(m);
      await h.clock.advance(300000);
      h.check("그 뒤 5분간 추가 동기화 없음", h.syncs(m) - s0, 0);
    } },
    { key: "PN1", name: "삭제가 가는 중에 아래 카드의 완료 창을 열어 둠 → 목록이 당겨진 뒤 확정해도 그 카드가 완료된다", async run(h) {
      h.server.hold("post");
      h.del(T.B);
      await h.tick();
      h.app("toggleDone(" + h.id(T.C) + ")");            // C 는 지금 id 7
      await h.clock.advance(40);
      h.server.release("post");                          // 삭제 ok → 뒤따르는 동기화 → C 는 6, 7 은 D
      await h.settle();
      const m = h.mark();
      h.app('confirmDone("전달 완료")');
      await h.settle();
      h.check("toggleDone 요청(행·제목)", h.posts(m, "toggleDone").map(p => [p.row, p.expectTitle]), [[6, T.C]]);
      h.check("서버 완료 여부(C·D)", [T.C, T.D].map(t => !!h.server.sheet[ME].find(v => v.title === t).done), [true, false]);
    } },
    { key: "PN2", name: "삭제가 가는 중에 아래 카드의 마감 창을 열어 둠 → 목록이 당겨진 뒤 저장해도 그 카드의 마감이 바뀐다", async run(h) {
      h.server.hold("post");
      h.del(T.B);
      await h.tick();
      h.app("openTimeEdit(" + h.id(T.C) + ")");
      await h.tick();
      h.server.release("post");
      await h.settle();
      const m = h.mark();
      h.app('commitDue("2030-02-20", "18:00")');
      await h.settle();
      h.check("updateDue 요청(행·제목)", h.posts(m, "updateDue").map(p => [p.row, p.expectTitle]), [[6, T.C]]);
      h.check("서버 마감(C·D)", [T.C, T.D].map(t => h.server.sheet[ME].find(v => v.title === t).dueISO || ""), ["2030-02-20", ""]);
    } },
    { key: "PN3", name: "완료 창을 열어 둔 사이 그 카드가 시트에서 사라짐 → 다른 카드에 쓰지 않고 안내한다", async run(h) {
      h.app("toggleDone(" + h.id(T.C) + ")");            // C = id 7
      await h.clock.advance(40);
      h.server.removeBySheet(T.C);                       // D 가 7행으로 당겨진다
      h.app("doSync({ silent:true })");
      await h.settle();
      const m = h.mark();
      h.app('confirmDone("전달 완료")');
      await h.settle();
      h.check("toggleDone 요청 수", h.posts(m, "toggleDone").length, 0);
      h.check("서버의 D 완료", !!h.server.sheet[ME].find(v => v.title === T.D).done, false);
      h.check("토스트", h.toastsSince(m), ["그 사이 목록이 바뀌었어요 — 다시 눌러 주세요"]);
    } },
    // v1.0.40: 서버 v64 지문 — 메모(expectB/C)와 번호 없는 손 링크 카드(expectLink)
    { key: "MG1", name: "메모를 고치는 사이 다른 사람이 같은 메모를 바꿈 → 덮지 않고 되돌린 뒤 다시 받는다", async run(h) {
      h.server.mgmt[ME][0].b = "남이 고친 보고";        // 내 화면은 아직 「주간 보고」
      const m = h.mark();
      h.app("commitMgmt(30, 'b', '내가 고친 보고')");
      await h.settle();
      h.check("서버 메모", h.server.mgmt[ME][0].b, "남이 고친 보고");
      h.check("보낸 지문", h.posts(m, "updateMemo").map(p => p.expectB), ["주간 보고"]);
      h.check("토스트", h.toastsSince(m), ["그 사이 목록이 바뀌었어요 — 다시 불러올게요"]);
      h.check("화면 메모(다시 받은 값)", h.app("mgmtItems.map(x => x.b)"), ["남이 고친 보고"]);
    } },
    { key: "MG2", name: "메모 입력칸이 떠 있는 사이 동기화가 와도 입력하던 글자가 남는다", async run(h) {
      // 편집 화면 자체는 노드 가짜 DOM 이 못 그린다 — editMgmt 가 만드는 상태(입력칸 + mgmtEditing)를 그대로 만든다
      h.app("(function(){ const i = document.createElement('input'); i.id = 'medit-input'; i.value = '쓰는 중'; document.body.appendChild(i); mgmtEditing = { view: viewName }; document.getElementById('mgmt-host').innerHTML = 'EDITING'; })()");
      h.app("doSync({ silent:true })");
      await h.settle();
      h.check("동기화가 메모 칸을 다시 그리지 않음", h.app("document.getElementById('mgmt-host').innerHTML"), "EDITING");
      h.app("mgmtEditing = false; commitMgmt(30, 'b', '쓰는 중')");
      await h.settle();
      h.check("서버 메모", h.server.mgmt[ME][0].b, "쓰는 중");
    } },
    // v1.0.40 검수: 편집·삭제 확인 사이 동기화로 메모 행이 밀리면 같은 행 번호의 「다른 메모」에 쓰던 회귀
    { key: "MG3", name: "메모를 편집하는 사이 위에 메모가 끼어 행이 밀림 → 저장해도 다른 메모를 덮지 않는다", async run(h) {
      h.server.mgmt[ME].push({ b: "월간 정리", c: "" });
      h.app("doSync({ silent:true })"); await h.settle();
      h.app("(function(){ const i = document.createElement('input'); i.id = 'medit-input'; document.body.appendChild(i); mgmtEditing = { view: viewName }; })()");   // 31행 「월간 정리」 편집 시작
      h.server.mgmt[ME].unshift({ b: "끼어든 메모", c: "" });     // 다른 PC 가 위에 추가 → 31행 = 「주간 보고」
      h.app("doSync({ silent:true })"); await h.settle();
      const m = h.mark();
      h.app("mgmtEditing = false; commitMgmt(31, 'b', '월간 정리 v2', '월간 정리')");
      await h.settle();
      h.check("서버 메모(그대로)", h.server.mgmt[ME].map(x => x.b), ["끼어든 메모", "주간 보고", "월간 정리"]);
      h.check("updateMemo 요청 수", h.posts(m, "updateMemo").length, 0);
      h.check("토스트", h.toastsSince(m), ["그 사이 목록이 바뀌었어요 — 다시 불러올게요"]);
    } },
    { key: "MG4", name: "메모 삭제 확인 창이 떠 있는 사이 행이 밀림 → 확정해도 다른 메모를 지우지 않는다", async run(h) {
      h.server.mgmt[ME].push({ b: "월간 정리", c: "" });
      h.app("doSync({ silent:true })"); await h.settle();
      h.app("askDelMgmt(31, 'b')");                               // 「월간 정리」 삭제 확인
      h.server.mgmt[ME].unshift({ b: "끼어든 메모", c: "" });
      h.app("doSync({ silent:true })"); await h.settle();
      const m = h.mark();
      h.app("doConfirm()");
      await h.settle();
      h.check("서버 메모(그대로)", h.server.mgmt[ME].map(x => x.b), ["끼어든 메모", "주간 보고", "월간 정리"]);
      h.check("updateMemo 요청 수", h.posts(m, "updateMemo").length, 0);
    } },
    { key: "HL1", name: "게시글 번호 없는 같은 제목 카드 셋 — 위 줄이 빠져 행이 낡은 채 가운데를 지움 → 누른 그 카드만 지워진다",
      opts: { mine: [{ title: "배너 수정", link: "https://hand.invalid/1" }, { title: "배너 수정", link: "https://hand.invalid/2" },
                     { title: "배너 수정", link: "https://hand.invalid/3" }, { title: T.D, idx: "1004" }] },
      async run(h) {
        const id2 = h.app("tasks.find(t => t.reqLink === 'https://hand.invalid/2').id");
        h.server.removeBySheet("배너 수정");            // 다른 PC 가 맨 위 줄(링크 1)을 지움 — 앱은 아직 모름
        const m = h.mark();
        h.app("delTask(" + id2 + ")");
        await h.settle();
        h.check("남은 손 링크", h.server.sheet[ME].filter(v => v.title === "배너 수정").map(v => v.link), ["https://hand.invalid/3"]);
        h.check("첫 요청이 링크 지문을 실었다", (h.posts(m, "deleteTask")[0] || {}).expectLink, "https://hand.invalid/2");
      } },
    // v1.0.39: 카드 휴지통은 확인 창(askDelTask)을 거친다. 창이 떠 있는 사이 목록이 당겨져도 누른 그 카드를 지운다.
    { key: "PN8", name: "휴지통 확인 창을 열어 둔 사이 위 카드가 시트에서 빠짐 → 확정하면 당겨진 그 카드가 지워진다", async run(h) {
      h.app("askDelTask(" + h.id(T.C) + ")");            // C = id 7
      await h.tick();
      h.server.removeBySheet(T.B);                       // C 가 6행으로 당겨진다
      h.app("doSync({ silent:true })");
      await h.settle();
      const m = h.mark();
      h.app("doConfirm()");
      await h.settle();
      h.check("deleteTask 요청(행·제목)", h.posts(m, "deleteTask").map(p => [p.row, p.expectTitle]), [[6, T.C]]);
      h.check("서버에 C 없음 · D 남음", [T.C, T.D].map(t => !!h.server.sheet[ME].find(v => v.title === t)), [false, true]);
    } },
    { key: "PN9", name: "휴지통 확인 창을 열어 둔 사이 그 카드가 시트에서 사라짐 → 다른 카드를 지우지 않고 안내한다", async run(h) {
      h.app("askDelTask(" + h.id(T.C) + ")");
      await h.tick();
      h.server.removeBySheet(T.C);                       // D 가 7행으로 당겨진다
      h.app("doSync({ silent:true })");
      await h.settle();
      const m = h.mark();
      h.app("doConfirm()");
      await h.settle();
      h.check("deleteTask 요청 수", h.posts(m, "deleteTask").length, 0);
      h.check("서버에 D 남음", !!h.server.sheet[ME].find(v => v.title === T.D), true);
      h.check("토스트", h.toastsSince(m), ["그 사이 목록이 바뀌었어요 — 다시 눌러 주세요"]);
    } },
  ];

  async function runAll(env, only) {
    const results = [];
    for (const sc of SCENARIOS) {
      if (only && only.length && only.indexOf(sc.key) < 0) continue;
      let h = null, crash = null;
      try { h = await start(env, sc.opts); await sc.run(h); await h.settle(); }
      catch (e) { crash = String(e && e.stack || e); }
      const checks = h ? h.checks : [];
      const errors = (h ? h.errors.concat(h.clock.errors) : []).concat(crash ? [crash] : []);
      if (h && env.quiesce) await env.quiesce(h);
      if (h) env.lastNow = h.clock.now + 1000;
      results.push({ key: sc.key, name: sc.name, pass: !errors.length && checks.length > 0 && checks.every(c => c.ok), checks, errors });
    }
    return results;
  }

  function format(results) {
    const lines = [];
    results.forEach(r => {
      lines.push((r.pass ? "PASS  " : "FAIL  ") + r.key + " " + r.name);
      r.checks.forEach(c => lines.push("        " + (c.ok ? "ok  " : "NG  ") + c.label + " = " + JSON.stringify(c.got) + (c.ok ? "" : "   (기대 " + JSON.stringify(c.exp) + ")")));
      r.errors.forEach(e => lines.push("        예외 " + e));
    });
    const pass = results.filter(r => r.pass).length;
    lines.push(pass + " / " + results.length + " 시나리오 통과");
    return lines.join("\n");
  }

  return { SCENARIOS, runAll, format, makeClock, makeServer, parseCards };
});
