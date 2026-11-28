// memolink.test.js — 관리항목 링크 표시(mdLinks)·저장 변환(linkifyMemo)을 index.html 에서 꺼내 확인하고,
// 실제 서버 함수(setCellSmart·cellToMd, gas/ 최신 사본)와 왕복시켜 시트 글자·링크가 망가지지 않는지 본다.
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path");
const lines = fs.readFileSync(path.join(__dirname, "..", "renderer", "index.html"), "utf8").split(/\r?\n/);
const grab = name => {
  let s = lines.findIndex(l => new RegExp("^  function " + name + "\\(").test(l));
  if (s < 0) { s = lines.findIndex(l => new RegExp("^  const " + name + " = ").test(l)); if (s >= 0) return lines[s]; }
  if (s < 0) throw new Error(name + " 를 찾지 못함");
  if (/\}\s*$/.test(lines[s]) && !/\{\s*$/.test(lines[s])) return lines[s];          // 한 줄 함수
  const e = lines.findIndex((l, i) => i > s && /^  \}$/.test(l));
  return lines.slice(s, e + 1).join("\n");
};
const box = { URL };   // 브라우저에는 있는 URL 을 격리 실행 환경에도
vm.runInNewContext(["esc", "shortUrl", "BARE_URL", "splitUrlTail", "mdLink", "mdLinks", "linkifyMemo"].map(grab).join("\n") + "\n__f = { mdLinks, linkifyMemo };", box);
const { mdLinks, linkifyMemo } = box.__f;
const links = h => [...h.matchAll(/data-url="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map(m => [m[1], m[2]]);
let fail = 0, n = 0;
const eq = (name, got, want) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log((ok ? "OK    " : "FAIL  ") + name + (ok ? "" : "  got " + JSON.stringify(got) + " want " + JSON.stringify(want))); };

eq("이름 붙은 링크", links(mdLinks("애드, [구글시트](https://docs.google.com/x) 수정")), [["https://docs.google.com/x", "구글시트"]]);
eq("맨 주소 → 짧은 이름", links(mdLinks("일정 https://docs.google.com/spreadsheets/d/1/edit 확인")), [["https://docs.google.com/spreadsheets/d/1/edit", "docs.google.com/…"]]);
eq("이름이 주소 그대로면 짧게", links(mdLinks("[https://www.example.com/a](https://www.example.com/a)")), [["https://www.example.com/a", "example.com/…"]]);
eq("javascript: 는 링크 안 됨", links(mdLinks("[x](javascript:alert(1))")), []);
eq("꺾쇠는 이스케이프", mdLinks("<b>굵게</b>").includes("<b>"), false);
eq("붙은 한글은 주소 밖(표시)", links(mdLinks("https://a.com/x에서 확인")), [["https://a.com/x", "a.com/…"]]);
eq("끝 마침표는 주소 밖(표시)", links(mdLinks("끝 https://a.com/x.")), [["https://a.com/x", "a.com/…"]]);
eq("괄호 안 주소(표시)", links(mdLinks("회의록(https://a.com/x)")), [["https://a.com/x", "a.com/…"]]);
eq("저장: 맨 주소 → [주소](주소)", linkifyMemo("일정 https://a.b/c 확인"), "일정 [https://a.b/c](https://a.b/c) 확인");
eq("저장: 이미 링크면 그대로", linkifyMemo("[표](https://a.b/c)"), "[표](https://a.b/c)");
eq("저장: 라벨이 주소인 링크 그대로", linkifyMemo("[https://old.com](https://new.com)"), "[https://old.com](https://new.com)");
eq("저장: 라벨 안 주소 그대로", linkifyMemo("[참고 https://a.b](https://c.d)"), "[참고 https://a.b](https://c.d)");
eq("저장: 붙은 한글·마침표·쉼표 밖으로", linkifyMemo("https://a.b/c를 봐. https://d.e/f, 끝 https://g.h/i."),
  "[https://a.b/c](https://a.b/c)를 봐. [https://d.e/f](https://d.e/f), 끝 [https://g.h/i](https://g.h/i).");
eq("저장: 괄호가 든 주소는 건드리지 않음", linkifyMemo("위키 https://en.wikipedia.org/wiki/Foo_(bar) 봐"), "위키 https://en.wikipedia.org/wiki/Foo_(bar) 봐");
eq("저장: 주소 없음", linkifyMemo("주간 보고"), "주간 보고");
eq("저장 뒤 표시도 짧게", links(mdLinks(linkifyMemo("https://www.youtube.com/watch?v=1"))), [["https://www.youtube.com/watch?v=1", "youtube.com/…"]]);

// ── 실제 서버 함수와 왕복: 저장값 → setCellSmart → 셀(글자+링크) → cellToMd → 앱이 다시 받는 값 ──
const gasDir = path.join(__dirname, "..", "gas");
const gasFile = fs.readdirSync(gasDir).filter(f => /^AppsScript-v\d+\.gs$/.test(f)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/))).pop();
const gs = fs.readFileSync(process.env.TT_GAS || path.join(gasDir, gasFile), "utf8");   // 다른 판: TT_GAS=<파일>
const gfn = nm => { const i = gs.indexOf("function " + nm + "("); let d = 0, j = gs.indexOf("{", i); for (; ; j++) { if (gs[j] === "{") d++; else if (gs[j] === "}" && --d === 0) break; } return gs.slice(i, j + 1); };
const sb = { SpreadsheetApp: { newRichTextValue: () => { const b = { links: [] }; b.setText = t => (b.text = t, b); b.setLinkUrl = (s, e, u) => (b.links.push({ s, e, u }), b); b.build = () => ({ text: b.text, links: b.links }); return b; } } };
vm.runInNewContext([gfn("cellToMd"), gfn("textSafe"), gfn("setCellSmart")].join("\n") + "\n__g = { cellToMd, setCellSmart };", sb);
const { cellToMd, setCellSmart } = sb.__g;
function cellRoundTrip(val) {
  const c = { text: "", links: [] };
  c.setValue = v => { c.text = String(v).replace(/^'/, ""); c.links = []; };
  c.setRichTextValue = r => { c.text = r.text; c.links = r.links; };
  setCellSmart(c, val);
  const url = new Array(c.text.length).fill(null); c.links.forEach(l => { for (let k = l.s; k < l.e; k++) url[k] = l.u; });
  const runs = []; for (let k = 0; k < c.text.length;) { let j = k; while (j < c.text.length && url[j] === url[k]) j++; const t = c.text.slice(k, j), u = url[k]; runs.push({ getText: () => t, getLinkUrl: () => u }); k = j; }
  return cellToMd({ getRuns: () => runs, getLinkUrl: () => null }, c.text, "");
}
// 서버에서 받은 값(cur)을 편집칸에 보여 준 그대로 저장하면 아무것도 바뀌지 않아야 한다(쓰기 자체가 안 나가는 것은 commitMgmt 의 shown 비교).
for (const cur of ["[https://old.com](https://new.com)", "[참고 https://a.b](https://c.d)", "애드, [구글시트](https://docs.google.com/x) 수정",
                   "[https://a.b/c](https://a.b/c) 확인", "[영상팀 AI](https://docs.google.com/s/1) 7/1~11/16 작업물"]) {
  eq("왕복 그대로: " + cur, cellRoundTrip(linkifyMemo(cur)), cur);
}
for (const typed of ["일정 https://a.b/c 확인", "https://a.b/c를 봐", "위키 https://en.wikipedia.org/wiki/Foo_(bar) 봐"]) {
  const saved = linkifyMemo(typed);
  eq("새로 쓴 값 왕복: " + typed, cellRoundTrip(saved), saved);
}
console.log(`${n - fail} passed, ${fail} failed  (서버 사본 ${process.env.TT_GAS ? path.basename(process.env.TT_GAS) : gasFile})`);
process.exit(fail ? 1 : 0);
