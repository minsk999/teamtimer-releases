// loader.js — renderer/index.html 에서 「업무시간만 세기」 순수 함수 블록을 추출해 vm 에서 평가하고, bizleft.test.js 가 요구하는 api 이름으로 묶는다.
// 매핑: urgency → urgencyAt, cdText → cdTextAt (앱 래퍼는 Date.now/workCfg/innerWidth 를 읽으므로 테스트에선 3·4인자 순수 함수를 쓴다)
//       stats → updateStats(앱)의 집계 규칙을 urgencyAt 위에 그대로 재현 / fmtDl → 앱 fmtDl 본문에서 'new Date()' 하나만 nowTs 주입(시안·테스트가 '지금'을 고정하려고)
"use strict";
const fs = require("fs"), vm = require("vm");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "renderer", "index.html"), "utf8");
const lines = html.split(/\r?\n/);
function block(startRe, endRe, from = 0){
  let s = -1; for(let i = from; i < lines.length; i++){ if(startRe.test(lines[i])){ s = i; break; } }
  if(s < 0) throw new Error("start not found: " + startRe);
  let e = -1; for(let i = s + 1; i < lines.length; i++){ if(endRe.test(lines[i])){ e = i; break; } }
  if(e < 0) throw new Error("end not found: " + endRe);
  return { code: lines.slice(s, e + 1).join("\n"), s: s + 1, e: e + 1 };
}
const FN_END = /^  \}$/;
const parts = [
  block(/^  const HOLIDAYS = \{/, /^  \};$/),
  block(/^  function getHoliday\(/, FN_END),
  block(/^  function normalizeTime\(/, FN_END),
  block(/^  const WORK_DEFAULT = /, /^  let workCfg = /),
  block(/^  function hmToMin\(/, /^  function cdText\(ts\)/),
];
let fmt = block(/^  function fmtDl\(ts, compact\)/, FN_END);
const fmtCode = fmt.code.replace("function fmtDl(ts, compact)", "function fmtDl(ts, compact, nowTs)").replace("const today=new Date();", "const today=new Date(nowTs);");
if(fmtCode === fmt.code) throw new Error("fmtDl 주입 실패");
const ranges = parts.map(p => `${p.s}~${p.e}`).concat([`fmtDl ${fmt.s}~${fmt.e}`]);

const src = parts.map(p => p.code).join("\n") + "\n" + fmtCode + `
  function stats(nowTs, deadlines, cfg){
    let r=0,o=0,g=0;
    deadlines.forEach(ts=>{const u=urgencyAt(nowTs, ts, cfg); if(u==="over"||u==="red")r++;else if(u==="orange")o++;else g++;});
    return {r,o,g};
  }
  __api = { HOLIDAYS, getHoliday, normalizeTime, WORK_DEFAULT, parseWorkHours, makeCfg,
    hmToMin, isOffDay, bizLeft, nextBizStart, holidayLabel, pauseLabel, urgency: urgencyAt, cdText: cdTextAt, stats, fmtDl };
`;
const sandbox = { localStorage: { getItem(){ return null; } }, __api: null, console };
vm.runInNewContext(src, sandbox, { filename: "index.html(extract)" });
module.exports = sandbox.__api;
module.exports.__ranges = ranges;
