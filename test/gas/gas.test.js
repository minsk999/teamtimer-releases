// gas.test.js — 실제 서버 코드(gas/ 의 최신 사본)를 vm 에 올려 타이머가 기대는 서버 약속을 확인한다. 네트워크 없음.
//   v64: 읽기 캐시 세대 · 메모 지문(expectB/C) + 이름 행·구분선 거부 · expectLink.  다른 판으로: TT_GAS=<파일> node test/gas/gas.test.js
"use strict";
const fs = require("fs"), path = require("path");
const { makeGasServer, ME, GAS_FILE } = require("./gas-server.js");
console.log("서버 사본: " + path.basename(GAS_FILE));


let fail = 0;
const ok = (name, cond, extra) => { console.log((cond ? "OK  " : "NG  ") + name + (cond ? "" : "  " + JSON.stringify(extra))); if (!cond) fail++; };
const clock = { now: 1e12 };
const mk = () => makeGasServer(clock);

// ── ② 관리항목(메모) 지문 ── 시트: 2행 이름, 3행 📌 주간 보고, 4행 ▼업무
{
  const s = mk();
  let r = s.rawPost({ action: "updateMemo", targetMember: ME, row: 3, memoB: "새 보고", expectB: "주간 보고", expectC: "" });
  ok("지문이 맞으면 쓴다", r.ok === true && s.main.cell(3, 2).v === "새 보고", r);
}
{
  const s = mk();
  s.insertSheetRowAbove();                          // 위에서 행이 하나 끼어 앱의 3행 = 이제 이름 행
  let r = s.rawPost({ action: "updateMemo", targetMember: ME, row: 3, memoB: "", expectB: "주간 보고", expectC: "" });
  ok("밀려서 이름 행을 가리키면 거부(stale) + 이름 칸 그대로", r.ok === false && r.stale === true && s.main.cell(3, 2).v === ME, r);
}
{
  const s = mk();
  s.insertSheetRowAbove();
  let r = s.rawPost({ action: "updateMemo", targetMember: ME, row: 3, memoB: "" });   // 옛 앱: 지문 없음
  ok("지문 없는 옛 요청도 이름 행은 거부", r.ok === false && s.main.cell(3, 2).v === ME, r);
}
{
  const s = mk();
  let r = s.rawPost({ action: "updateMemo", targetMember: ME, row: 3, memoB: "옛 앱 수정" });
  ok("지문 없는 옛 요청 — 정상 메모 행은 지금처럼 쓴다", r.ok === true && s.main.cell(3, 2).v === "옛 앱 수정", r);
}
{
  const s = mk();
  s.main.cell(3, 2).v = "다른 사람이 고친 메모";
  let r = s.rawPost({ action: "updateMemo", targetMember: ME, row: 3, memoB: "내 수정", expectB: "주간 보고", expectC: "" });
  ok("읽어 간 값과 지금 값이 다르면 stale, 덮지 않음", r.ok === false && r.stale === true && s.main.cell(3, 2).v === "다른 사람이 고친 메모", r);
}
{
  const s = mk();
  let r = s.rawPost({ action: "updateMemo", targetMember: ME, row: 4, memoB: "x", expectB: "업무", expectC: "" });
  ok("▼업무 구분선은 거부", r.ok === false && s.main.cell(4, 2).v === "업무", r);
}
{
  const s = mk();
  const m = s.rawRead(ME).members[0].mgmt[0];
  let r = s.rawPost({ action: "updateMemo", targetMember: ME, row: m.row, memoC: "C칸 추가", expectB: m.b, expectC: m.c });
  ok("읽기 응답의 b/c 를 그대로 지문으로 쓰면 통과(표현 일치)", r.ok === true && s.main.cell(3, 3).v === "C칸 추가", { r, m });
}

// ── ③ expectLink ──
{
  const s = mk();
  const v = s.find("B 기획전 영상");
  let r = s.rawPost({ action: "toggleDone", member: ME, row: v.row, done: "1", status: "전달 완료", expectTitle: v.title, expectLink: v.requestLink });
  ok("링크 지문이 맞으면 통과", r.ok === true, r);
  const w = s.find("C 숏폼 3종");
  r = s.rawPost({ action: "toggleDone", member: ME, row: w.row, done: "1", status: "전달 완료", expectTitle: w.title, expectLink: v.requestLink });
  ok("링크 지문이 다르면 stale", r.ok === false && r.stale === true, r);
}

// ── ① 읽기 캐시 세대 ──
{
  const s = mk();
  s.cache.clear();
  s.rawReadAll(); s.cache.delete("teamtimer_read_v1");
  const before = s.cache.size;
  s.rawRead();                                      // 평소: 캐시에 들어간다
  ok("겹친 쓰기가 없으면 캐시에 넣는다", s.cache.has("teamtimer_read_v1"));
  s.cache.delete("teamtimer_read_v1");
  // 읽는 도중(리치텍스트를 읽는 시점) 다른 사람의 쓰기가 끝나 캐시를 버렸다
  global.__midRead = () => { s.rawPost({ action: "updateMemo", targetMember: ME, row: 3, memoB: "읽는 중에 바뀜" }); };
  const r = s.rawRead();
  ok("읽는 사이 쓰기가 있었으면 응답은 주되 캐시에는 안 넣는다", r.ok === true && !s.cache.has("teamtimer_read_v1"), { keys: [...s.cache.keys()], before });
  s.rawRead();
  ok("다음 읽기는 다시 캐시에 넣는다", s.cache.has("teamtimer_read_v1"));
}
console.log(fail ? `\n${fail}건 실패` : "\n전부 통과");
process.exit(fail ? 1 : 0);
