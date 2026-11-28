// weburl.test.js — renderer/index.html 의 webUrl(카드 링크를 밖으로 열어도 되는가)을 꺼내 확인한다.
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path");
const lines = require("./renderer-src.js")().split(/\r?\n/);
const s = lines.findIndex(l => /^  function webUrl\(u\)\{/.test(l));
const e = lines.findIndex((l, i) => i > s && /^  \}$/.test(l));
if (s < 0 || e < 0) throw new Error("webUrl 을 찾지 못함");
const box = {};
vm.runInNewContext(lines.slice(s, e + 1).join("\n") + "\n__f = webUrl;", box);
const webUrl = box.__f;

const cases = [
  ["https://intranet.adef.co.kr/creative/view?idx=1", "https://intranet.adef.co.kr/creative/view?idx=1"],
  ["  http://a.b/x  ", "http://a.b/x"],
  ["intranet.adef.co.kr/creative/view?idx=7", "https://intranet.adef.co.kr/creative/view?idx=7"],   // 스킴 없는 입력칸 안내 모양
  ["javascript:alert(1)", ""],
  ["file:///C:/Windows/System32/calc.exe", ""],
  ["ms-msdt:/id PCWDiagnostic", ""],
  ["--gpu-launcher=calc", ""],                 // 크롬 실행 인자로 넘어가면 옵션이 된다
  ["/cr/2026/기획안.pptx", ""],                 // NAS 경로
  ["기획안.pptx", ""], ["report.pptx", ""],      // 파일 이름이 가짜 도메인으로 열리지 않게
  ["", ""], [null, ""],
];
let fail = 0;
for (const [inp, want] of cases) {
  const got = webUrl(inp);
  const ok = got === want;
  if (!ok) fail++;
  console.log((ok ? "OK    " : "FAIL  ") + JSON.stringify(inp) + " → " + JSON.stringify(got) + (ok ? "" : "  (기대 " + JSON.stringify(want) + ")"));
}
console.log(`${cases.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
