// gas-server.js — gas/ 의 최신 서버 사본을 **그대로** vm 에 올리고 SpreadsheetApp 을 메모리 격자로 흉내낸다.
//   가짜 서버가 "계약을 흉내"내는 게 아니라 실제 서버 코드(doGet/doPost)가 돈다. 네트워크 없음.
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path");
// 서버 사본: 인자·환경변수가 없으면 gas/ 의 가장 높은 판(AppsScript-vNN.gs)을 쓴다 — 배포본이 바뀌어도 고칠 곳이 없게.
const GAS_DIR = path.join(__dirname, "..", "..", "gas");
const GAS_FILE = process.env.TT_GAS || path.join(GAS_DIR, fs.readdirSync(GAS_DIR).filter(n => /^AppsScript-v\d+\.gs$/.test(n))
  .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10)).pop());
const GAS_SRC = fs.readFileSync(GAS_FILE, "utf8");
const gasScript = new vm.Script(GAS_SRC, { filename: path.basename(GAS_FILE) });

const ME = "테스터", OTHER = "동료";

function formulaValue(f) {
  const m = String(f).match(/^=HYPERLINK\(\s*"((?:[^"]|"")*)"\s*(?:[,;]\s*"((?:[^"]|"")*)"\s*)?\)\s*$/i);
  if (m) return (m[2] != null ? m[2] : m[1]).replace(/""/g, '"');
  return "#ERROR!";
}

function makeSheet(name) {
  const S = { name, cells: [], maxRows: 200 };
  const cell = (r, c) => {
    while (S.cells.length < r) S.cells.push([]);
    const row = S.cells[r - 1];
    while (row.length < c) row.push({ v: "", f: "" });
    return row[c - 1];
  };
  const put = (x, v) => {
    if (typeof v === "string" && v.charAt(0) === "=") { x.f = v; x.v = ""; }
    else { x.v = (v == null ? "" : v); x.f = ""; }
  };
  const val = x => x.f ? formulaValue(x.f) : x.v;
  S.cell = cell; S.put = put; S.val = val;
  S.api = {
    getName: () => name,
    getMaxRows: () => S.maxRows,
    getLastColumn: () => 15,
    getLastRow: () => {
      for (let r = S.cells.length; r >= 1; r--) {
        if (S.cells[r - 1].some(x => x.f || x.v !== "")) return r;
      }
      return 0;
    },
    insertRowAfter: r => { while (S.cells.length < r) S.cells.push([]); S.cells.splice(r, 0, []); S.maxRows++; },
    insertRowBefore: r => { while (S.cells.length < r) S.cells.push([]); S.cells.splice(r - 1, 0, []); S.maxRows++; },
    getRange: (row, col, nr, nc) => {
      nr = nr === undefined ? 1 : nr; nc = nc === undefined ? 1 : nc;
      if (!(row >= 1) || !(col >= 1)) throw new Error("Exception: 범위의 시작 행/열이 너무 작습니다.");
      if (!(nr >= 1) || !(nc >= 1)) throw new Error("Exception: 범위의 행 수는 1 이상이어야 합니다.");
      if (row + nr - 1 > S.maxRows) throw new Error("Exception: 범위 좌표가 시트 크기를 벗어났습니다.");
      const grid = fn => { const o = []; for (let i = 0; i < nr; i++) { const a = []; for (let j = 0; j < nc; j++) a.push(fn(cell(row + i, col + j), i, j)); o.push(a); } return o; };
      const self = {
        getValues: () => grid(val), getFormulas: () => grid(x => x.f || ""),
        getValue: () => val(cell(row, col)), getFormula: () => cell(row, col).f || "",
        setValue: v => { grid(x => put(x, v)); return self; },
        setValues: a => { grid((x, i, j) => put(x, a[i][j])); return self; },
        setFormula: f => { grid(x => { x.f = String(f); x.v = ""; }); return self; },
        clearContent: () => { grid(x => { x.v = ""; x.f = ""; }); return self; },
        getNumberFormats: () => grid(() => ""), getRichTextValues: () => { if (global.__midRead) { const f = global.__midRead; global.__midRead = null; f(); } return grid(() => null); }, getRichTextValue: () => null, getDataValidations: () => grid(() => null),
        insertCheckboxes: () => { grid(x => { if (!x.f && typeof x.v !== "boolean") x.v = false; }); return self; },
        isPartOfMerge: () => false, getMergedRanges: () => [], getRow: () => row, getColumn: () => col,
      };
      ["setHorizontalAlignment", "setFontColor", "setNumberFormat", "setNumberFormats", "copyFormatToRange",
        "clearDataValidations", "clearFormat", "merge", "breakApart", "setRichTextValue"].forEach(n => { self[n] = () => self; });
      return self;
    },
  };
  return S;
}

// rows: [{ title, c, d, done, status, due:"YYYY-MM-DD", memo }]  c/d 는 셀 원문(= 로 시작하면 수식)
function link(url, label) { return '=HYPERLINK("' + url + '","' + (label || "🔗요청글링크") + '")'; }
function intra(idx) { return "https://intranet.adef.co.kr/creative/view?idx=" + idx; }
function vid(title, idx, extra) { return Object.assign({ title, c: link(intra(idx)) }, extra || {}); }

function makeGasServer(clock, opts) {
  opts = opts || {};
  const main = makeSheet("🎬영상팀 업무현황"), conf = makeSheet("🤖자동화");
  const cache = new Map();
  const s = { ME, OTHER, BASE: 5, main, conf, calls: [], holding: { sync: false, post: false }, postQueue: [], readQueue: [], lockBusy: 0, log: [] };
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    Logger: { log() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheets: () => [conf.api, main.api], getId: () => "test-sheet-id" }),   // 자동화가 앞 — getSheet 가 이름으로 찾는지도 같이 탄다
      flush() {}, newRichTextValue: () => { const b = { setText: () => b, setLinkUrl: () => b, build: () => ({}) }; return b; },
      DataValidationCriteria: { CHECKBOX: "CHECKBOX" },
    },
    CacheService: { getScriptCache: () => ({
      get: k => { const e = cache.get(k); if (!e) return null; if (e.until <= clock.now) { cache.delete(k); return null; } return e.v; },
      put: (k, v, sec) => { cache.set(k, { v, until: clock.now + (sec || 600) * 1000 }); },
      remove: k => { cache.delete(k); },
    }) },
    ...(opts.Sheets ? { Sheets: opts.Sheets } : {}),   // v69: 고급 서비스 흉내(없으면 서버는 v68 처럼 동작)
    LockService: { getScriptLock: () => ({ tryLock: () => { if (s.lockBusy > 0) { s.lockBusy--; return false; } return true; }, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: t => { const o = { text: t, setMimeType: () => o, getContent: () => t }; return o; } },
  };
  const ctx = vm.createContext(sandbox);
  gasScript.runInContext(ctx);
  const reset = new vm.Script("_grid = null; ALL_MEMBERS = []; MEMBER_COLS = {}; MEMBER_WARN = []; READ_ROWS = 150;");
  const mkDate = vm.runInContext("(function(y,m,d){ return new Date(y,m-1,d); })", ctx);
  const call = (fn, param) => { reset.runInContext(ctx); const out = ctx[fn]({ parameter: param }); return JSON.parse(out.text); };
  s.cache = cache;
  s.rawRead = name => call("doGet", name ? { action: "read", member: name } : { action: "read" });   // member 지정 = 캐시 우회
  s.rawPost = p => { const q = {}; Object.keys(p).forEach(k => { q[k] = p[k] == null ? "" : String(p[k]); }); return call("doPost", q); };   // main.js 의 form 인코딩과 같게 전부 문자열

  // ── 시트 배치 ──
  //  2행 이름, 3행 📌관리, 4행 ▼업무, 5행~ 작업, 빈 행 GAP 줄, 그 아래 다른 팀원 구역(시트 끝이 내 단보다 훨씬 아래다)
  conf.cell(1, 1).v = ME; conf.cell(2, 1).v = OTHER; conf.cell(3, 1).v = "김아래"; conf.cell(4, 1).v = "박아래";
  const mine = opts.mine || [vid("A 런칭 배너", 1001), vid("B 기획전 영상", 1002), vid("C 숏폼 3종", 1003), vid("D 상세 GIF", 1004),
    vid("E 완료된 작업", 1005, { done: true, status: "전달 완료" })];
  const theirs = opts.theirs || [vid("동료 작업 1", 2001), vid("B 기획전 영상", 1002), vid("동료 작업 3", 2003)];
  const GAP = opts.gap == null ? 4 : opts.gap;
  const setRow = (r, base, v) => {
    main.cell(r, base + 0).v = !!v.done;
    main.put(main.cell(r, base + 1), v.title);
    if (v.c != null) main.put(main.cell(r, base + 2), v.c);
    if (v.d != null) main.put(main.cell(r, base + 3), v.d);
    const due = v.due === undefined ? "2030-01-15" : v.due;
    if (due) { const m = due.match(/^(\d+)-(\d+)-(\d+)$/); main.cell(r, base + 4).v = m ? mkDate(+m[1], +m[2], +m[3]) : due; }
    main.cell(r, base + 5).v = v.memo || ""; main.cell(r, base + 6).v = v.status || "";
  };
  main.cell(2, 2).v = ME; main.cell(2, 10).v = OTHER;
  main.cell(3, 1).v = "📌"; main.cell(3, 2).v = "주간 보고";
  main.cell(4, 1).v = "▼"; main.cell(4, 2).v = "업무"; main.cell(4, 9).v = "▼"; main.cell(4, 10).v = "업무";
  mine.forEach((v, i) => setRow(5 + i, 1, v));
  theirs.forEach((v, i) => setRow(5 + i, 9, v));
  const below = 5 + Math.max(mine.length, theirs.length) + GAP;
  main.cell(below, 2).v = "김아래"; main.cell(below, 10).v = "박아래";
  main.cell(below + 1, 1).v = "▼"; main.cell(below + 1, 2).v = "업무"; main.cell(below + 1, 9).v = "▼"; main.cell(below + 1, 10).v = "업무";
  setRow(below + 2, 1, vid("아래 사람 작업", 3001)); setRow(below + 2, 9, vid("아래 사람 작업 2", 3002));
  setRow(below + 3, 1, vid("아래 사람 작업 3", 3003));

  // ── 관찰 ──
  s.video = name => s.rawRead(name || ME).members[0].video;
  s.rows = name => s.video(name).map(v => ({ row: v.row, title: v.title }));
  s.has = (title, name) => s.video(name).filter(v => v.title === title).length;
  s.find = (title, name) => s.video(name).find(v => v.title === title);
  s.formulaC = row => main.cell(row, 3).f || "";
  // ── 시트를 밖에서 바꾸기 ──
  s.otherPcDelete = (title, name) => { const v = s.find(title, name); return s.rawPost({ action: "deleteTask", member: name || ME, row: v.row }); };   // 다른 PC·구버전: 지문 없이 삭제(당김 발생)
  s.insertSheetRowAbove = () => { main.api.insertRowBefore(1); };                       // 위쪽 팀원의 insert 가 시트 행을 하나 넣음 → 내 행 전부 +1
  s.ttalkakInsert = (title, idx, name) => s.rawPost({ targetMember: name || ME, title, url: intra(idx), dueDate: "2030-03-01" });
  s.poisonCache = () => { const snap = JSON.stringify(s.rawReadAll()); return () => cache.set("teamtimer_read_v1", { v: snap, until: clock.now + 20000 }); };
  s.rawReadAll = () => { const keep = cache.get("teamtimer_read_v1"); cache.delete("teamtimer_read_v1"); const r = call("doGet", { action: "read" }); if (keep) cache.set("teamtimer_read_v1", keep); else cache.delete("teamtimer_read_v1"); return r; };

  // ── 앱이 보는 API (main.js 의 sync-sheet / post-sheet 자리) ──
  const clone = o => JSON.parse(JSON.stringify(o));
  function deliver(c, get) {
    s.calls.push(c);
    return new Promise(resolve => {
      c.finish = () => { if (c.done) return; c.done = true; c.result = clone(get()); resolve(clone(c.result)); };
      if (!s.holding[c.kind]) c.finish();
    });
  }
  s.api = {
    syncSheet() {
      // 읽기는 요청 시점에 실행된다(락 없음). 응답이 늦게 도착해도 내용은 그때 것.
      let snap;
      if (s.readQueue.length) snap = s.readQueue.shift();
      else { try { snap = Object.assign(call("doGet", { action: "read" }), { _ms: 1 }); } catch (e) { snap = { ok: false, error: String(e) }; } }
      return deliver({ kind: "sync" }, () => snap);
    },
    postSheet(payload) {
      const hook = s.postQueue.shift();
      const p = clone(payload);
      return deliver({ kind: "post", payload: p }, () => {
        const forced = hook && hook(p);
        if (forced) return forced;
        try { return s.rawPost(p); } catch (e) { return { ok: false, error: String(e) }; }
      });
    },
    openExternal() {},
  };
  s.hold = kind => { s.holding[kind] = true; };
  s.pending = kind => s.calls.filter(c => c.kind === kind && !c.done);
  s.releaseOne = kind => { const c = s.pending(kind)[0]; if (c) c.finish(); return !!c; };
  s.release = kind => { s.holding[kind] = false; s.pending(kind).forEach(c => c.finish()); };
  return s;
}

module.exports = { makeGasServer, link, intra, vid, ME, OTHER, formulaValue, GAS_FILE };
