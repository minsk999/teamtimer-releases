// fuzz.js — 무작위 검증. 서버 = 실제 GAS 코드. 카드마다 메모칸에 고유 표식(uid)을 심어 「누른 그 카드만 바뀌었나」를 본다.
//   실행: node test/fuzz/fuzz.js <이름> <mode S|R|X> <횟수> [시드 시작]   (npm test 는 시드 고정으로 S·R·X 를 조금씩)
//   S: 한 동작씩, 끝날 때까지 기다림(외부 간섭 없음) — 거부가 하나라도 나오면 오탐
//   R: 2~3 동작을 응답 전에 연달아 누름(외부 간섭 없음)
//   X: 동작 사이에 다른 PC 의 삭제·위쪽 행 끼어듦·같은 제목 추가(화면은 낡은 채) — 거부는 정상, 엉뚱한 카드 변경은 사고
"use strict";
const { start, G } = require("./h.js");
const { link, vid } = G;
const X = "https://intranet.adef.co.kr/creative/view?idx=";
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const TITLES = ["주간 배너", "월간 리포트 영상", "브랜드 숏폼"];
function board(r) {
  const n = 4 + Math.floor(r() * 4), out = [];
  for (let i = 0; i < n; i++) {
    const title = TITLES[Math.floor(r() * TITLES.length)];
    const roll = r();
    // 30% 는 같은 제목의 앞 카드와 링크까지 같게(쌍둥이), 10% 는 idx 없는 외부 링크
    const prevSame = out.filter(v => v.title === title);
    let c;
    if (roll < 0.3 && prevSame.length) c = prevSame[0].c;
    else if (roll < 0.4) c = link("https://docs.google.com/document/d/x" + i);
    else c = link(X + (3000 + i));
    out.push({ title, c, memo: "u" + i, done: r() < 0.25, status: "" });
  }
  return out;
}
const state = h => { const m = {}; h.server.video().forEach(v => { m[v.memo || ("T:" + v.title)] = { title: v.title, link: v.requestLink, done: !!v.done, due: v.dueISO, row: v.row }; }); return m; };
const same = (a, b) => a && b && a.title === b.title && a.link === b.link && a.done === b.done && a.due === b.due;
function diff(before, after) {
  const ch = [];
  Object.keys(before).forEach(u => { if (!after[u]) ch.push(u + ":삭제"); else if (!same(before[u], after[u])) ch.push(u + ":변경"); });
  Object.keys(after).forEach(u => { if (!before[u]) ch.push(u + ":추가"); });
  return ch.sort();
}
const uidOf = t => t._memo || ("T:" + t.title);
(async () => {
  const ver = process.argv[2] || "v36", mode = process.argv[3] || "S", N = +process.argv[4] || 100, seed0 = +process.argv[5] || 1;
  const stat = { runs: 0, ops: 0, rejected: 0, pinLost: 0, wrong: 0, twinSwap: 0, missed: 0, mismatchEnd: 0, errors: 0, firstPressFail: 0, secondPressOk: 0, secondPressFail: 0 };
  const samples = [];
  const note = (kind, s) => { if (samples.filter(x => x.kind === kind).length < 4) samples.push({ kind, ...s }); };
  for (let seed = seed0; seed < seed0 + N; seed++) {
    const r = rng(seed * 7919 + 13);
    const h = await start({ ver, mine: board(r) });
    stat.runs++;
    let addN = 0, dueN = 0;
    const trace = [];
    const pressed = {};
    const pick = () => { const ts = h.evalApp("tasks"); return ts.length ? ts[Math.floor(r() * ts.length)] : null; };
    // 동작 하나를 누른다(응답은 기다리지 않음). 돌려주는 값 = 기대하는 변화
    const press = async () => {
      const k = r();
      const t = pick();
      if (k < 0.12 || !t) { const title = "새 작업 " + seed + "-" + (++addN); h.add(title, X + (7000 + addN)); return { op: "add", uid: "T:" + title, expect: ["T:" + title + ":추가"] }; }
      const uid = uidOf(t), id = t.id, temp = !!t._temp, title0 = t.title, memo0 = t._memo; pressed[uid] = { title: t.title, link: t.reqLink || "" };
      if (k < 0.40) { h.app("toggleDone(" + id + ")"); await h.clock.advance(40); h.confirmDone(t.done ? "수정 진행" : "전달 완료"); return { op: "toggle", uid, temp, expect: [uid + ":변경"] }; }
      if (k < 0.58) { h.app("openTimeEdit(" + id + ")"); h.commitDue("2031-" + String(1 + (dueN % 12)).padStart(2, "0") + "-" + String(1 + (dueN++ % 27)).padStart(2, "0")); return { op: "due", uid, temp, expect: [uid + ":변경"] }; }
      if (k < 0.70) { h.app("openEdit(" + id + ")"); h.saveEdit({ title: title0 + "+" }); return { op: "editTitle", uid, temp, expect: [uid + ":변경"], retitle: memo0 ? null : "T:" + title0 + "+" }; }
      if (k < 0.82) { h.app("openEdit(" + id + ")"); h.saveEdit({ link: X + (9000 + Math.floor(r() * 900)) }); return { op: "editLink", uid, temp, expect: [uid + ":변경"] }; }
      if (k < 0.95) { h.app("delTask(" + id + ")"); return { op: "del", uid, temp, expect: [uid + ":삭제"] }; }
      h.evalApp("tasks").filter(x => x.done).forEach(x => { pressed[uidOf(x)] = { title: x.title, link: x.reqLink || "" }; });
      const dones = h.evalApp("tasks").filter(x => x.done).map(uidOf);
      h.app("doClearDone()"); return { op: "clear", uid: "*", expect: dones.map(u => u + ":삭제").sort() };
    };
    const interfere = () => {
      const k = r(), vids = h.server.video();
      if (k < 0.45 && vids.length > 1) { const v = vids[Math.floor(r() * vids.length)]; h.server.rawPost({ action: "deleteTask", member: h.ME, row: v.row }); return "남이삭제:" + v.row; }
      if (k < 0.7) { h.server.insertSheetRowAbove(); return "위에행"; }
      if (k < 0.9) { const t = TITLES[Math.floor(r() * 3)]; h.server.rawPost({ targetMember: h.ME, title: t, url: X + (5000 + Math.floor(r() * 50)), dueDate: "2030-03-01", dupCheck: "0", memo: "x" + Math.floor(r() * 1e6) }); return "남이추가"; }
      return "없음";
    };
    try {
      for (let step = 0; step < 10; step++) {
        let inter = null;
        if (mode === "X" && r() < 0.5) { inter = interfere(); await h.clock.advance(1); h.server.cache.delete("teamtimer_read_v1"); }
        const before = state(h);
        const m = h.mark();
        const presses = [];
        if (mode === "R") { h.server.hold("post"); const n = 2 + Math.floor(r() * 2); for (let i = 0; i < n; i++) { presses.push(await press()); await h.tick(); } h.server.release("post"); }
        else presses.push(await press());
        await h.settle(); await h.clock.advance(300); await h.settle();
        const after = state(h);
        const posts = h.posts(m), toasts = h.toastsSince(m);
        stat.ops += presses.length;
        const rej = posts.filter(c => c.result && !c.result.ok);
        const lost = toasts.filter(t => t.indexOf("그 사이 목록이 바뀌었어요") === 0).length;
        // 기대 변화: 누른 것들의 합집합(같은 카드를 지우면 그 카드의 다른 변경은 '삭제'로 합쳐진다)
        const exp = {};
        presses.forEach(p => p.expect.forEach(e => { const [u, what] = [e.slice(0, e.lastIndexOf(":")), e.slice(e.lastIndexOf(":") + 1)]; if (what === "삭제" || !exp[u] || exp[u] !== "삭제") exp[u] = exp[u] === "추가" && what === "변경" ? "추가" : what; }));
        const got = diff(before, after);
        // 앱에서 제목을 바꾼(메모 없는) 카드는 uid 가 제목이라 삭제+추가로 보인다 → 변경으로 접는다
        presses.filter(p => p.retitle).forEach(p => { const fin = presses.filter(q => q.retitle && q.retitle.indexOf(p.retitle) === 0).map(q => q.retitle).sort((x, y) => y.length - x.length)[0]; if (fin) p.retitle = fin; });
        presses.forEach(p => { if (p.retitle) { const a = got.indexOf(p.uid + ":삭제"), b = got.indexOf(p.retitle + ":추가"); if (a >= 0 && b >= 0) { got.splice(Math.max(a, b), 1); got.splice(Math.min(a, b), 1); got.push(p.uid + ":변경"); } } });
        const unintended = got.filter(g => { const u = g.slice(0, g.lastIndexOf(":")); return !(u in exp); });
        const missing = Object.keys(exp).filter(u => !got.some(g => g.slice(0, g.lastIndexOf(":")) === u) && !(exp[u] === "추가" && false));
        const rec = { ver, mode, seed, step, inter, presses: presses.map(p => p.op + "@" + p.uid + (p.temp ? "(임시)" : "")), posts: posts.map(c => (c.payload.action || "insert") + "#" + c.payload.row + "→" + (c.result ? (c.result.ok ? "ok" : c.result.stale ? "stale" : c.result.busy ? "busy" : String(c.result.error).slice(0, 18)) : "?")), toasts, got, exp };
        trace.push(rec);
        if (unintended.length) {
          // 쌍둥이(제목·링크가 누른 카드와 같은 줄)로 간 것인지 가른다
          const twin = unintended.every(g => { const u = g.slice(0, g.lastIndexOf(":")); const c = before[u] || after[u]; return presses.reduce((a, p) => a.concat(p.uid === "*" ? p.expect.map(e => ({ uid: e.slice(0, e.lastIndexOf(":")) })) : [p]), []).some(p => { const pc = pressed[p.uid] || before[p.uid]; return pc && c && pc.title === c.title && pc.link === c.link; }); });
          const noIdx = !twin && unintended.every(g => { const u = g.slice(0, g.lastIndexOf(":")); const c = before[u] || after[u]; return presses.reduce((a, p) => a.concat(p.uid === "*" ? p.expect.map(e => ({ uid: e.slice(0, e.lastIndexOf(":")) })) : [p]), []).some(p => { const pc = pressed[p.uid] || before[p.uid]; return pc && c && pc.title === c.title && !/idx=[0-9]+/.test(pc.link); }); });
          rec.cards = Object.keys(before).map(u => u + "=" + before[u].row + "/" + before[u].title + "/" + before[u].link.slice(-8));
          if (twin) { stat.twinSwap++; note("twinSwap", rec); } else if (noIdx) { stat.noIdxSameTitle = (stat.noIdxSameTitle || 0) + 1; note("noIdxSameTitle", rec); } else { stat.wrong++; note("wrong", rec); }
        }
        if (rej.length || lost) {
          stat.rejected += rej.length; stat.pinLost += lost;
          if (mode === "S" && !presses.some(p => p.temp)) note("rejectedInSerial", rec);
          else if (mode === "R") note("rejectedInRapid", rec);
        }
        if (missing.length) { stat.missed += missing.length; if (mode === "S" && !presses.some(p => p.temp)) note("missedInSerial", rec); }
        if (mode !== "X" && !h.rowsMatchServer()) { await h.clock.advance(30000); await h.settle(); if (!h.rowsMatchServer()) { stat.mismatchEnd++; note("mismatch", Object.assign({ screen: h.tasks().map(t => t.row + ":" + t.title), server: h.server.rows().map(x => x.row + ":" + x.title) }, rec)); } }
      }
      if (mode === "X") { await h.clock.advance(30000); h.server.cache.delete("teamtimer_read_v1"); h.app("doSync({ silent:true })"); await h.settle(); if (!h.rowsMatchServer()) { stat.mismatchEnd++; } }
    } catch (e) { stat.errors++; note("crash", { seed, err: String(e && e.stack || e).split("\n").slice(0, 3).join(" | ") }); }
    const errs = await h.end();
    if (errs.length) { stat.errors += errs.length; note("exception", { seed, err: String(errs[0]).split("\n").slice(0, 3).join(" | ") }); }
  }
  console.log(ver + " mode=" + mode + " " + JSON.stringify(stat));

  // npm test 판정: 엉뚱한 카드 변경·예외·끝 상태 어긋남은 어느 모드든 실패, 간섭 없는 연속 동작(S)에서는 거부·누락도 실패(쌍둥이 twinSwap 은 문서화된 한계)
  const bad = stat.wrong || stat.errors || stat.mismatchEnd || (mode === "S" && (stat.rejected || stat.missed));
  process.exitCode = bad ? 1 : 0;
  if (process.env.FUZZ_VERBOSE || process.exitCode) samples.forEach(s => console.log("  [" + s.kind + "] " + JSON.stringify(s).slice(0, 900)));   // 보기: FUZZ_VERBOSE=1
})().catch(e => { console.error(e); process.exit(2); });
