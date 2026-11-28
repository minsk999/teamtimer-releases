// memolink.test.js — 관리항목 링크 표시(mdLinks)·저장 변환(linkifyMemo)을 index.html 에서 꺼내 확인한다.
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path");
const lines = fs.readFileSync(path.join(__dirname, "..", "renderer", "index.html"), "utf8").split(/\r?\n/);
const grab = name => {
  const s = lines.findIndex(l => new RegExp("^  function " + name + "\\(").test(l));
  if (s < 0) throw new Error(name + " 를 찾지 못함");
  if (/\}\s*$/.test(lines[s]) && !/\{\s*$/.test(lines[s])) return lines[s];          // 한 줄 함수
  const e = lines.findIndex((l, i) => i > s && /^  \}$/.test(l));
  return lines.slice(s, e + 1).join("\n");
};
const box = { URL };   // 브라우저에는 있는 URL 을 격리 실행 환경에도
vm.runInNewContext(["esc", "shortUrl", "mdLinks", "linkifyMemo"].map(grab).join("\n") + "\n__f = { mdLinks, linkifyMemo };", box);
const { mdLinks, linkifyMemo } = box.__f;
const links = h => [...h.matchAll(/data-url="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map(m => [m[1], m[2]]);
let fail = 0, n = 0;
const eq = (name, got, want) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log((ok ? "OK    " : "FAIL  ") + name + (ok ? "" : "  got " + JSON.stringify(got) + " want " + JSON.stringify(want))); };

eq("이름 붙은 링크", links(mdLinks("애드, [구글시트](https://docs.google.com/x) 수정")), [["https://docs.google.com/x", "구글시트"]]);
eq("맨 주소 → 짧은 이름", links(mdLinks("일정 https://docs.google.com/spreadsheets/d/1/edit 확인")), [["https://docs.google.com/spreadsheets/d/1/edit", "docs.google.com/…"]]);
eq("이름이 주소 그대로면 짧게", links(mdLinks("[https://www.example.com/a](https://www.example.com/a)")), [["https://www.example.com/a", "example.com/…"]]);
eq("javascript: 는 링크 안 됨", links(mdLinks("[x](javascript:alert(1))")), []);
eq("꺾쇠는 이스케이프", mdLinks("<b>굵게</b>").includes("<b>"), false);
eq("저장: 맨 주소 → [주소](주소)", linkifyMemo("일정 https://a.b/c 확인"), "일정 [https://a.b/c](https://a.b/c) 확인");
eq("저장: 이미 링크면 그대로", linkifyMemo("[표](https://a.b/c)"), "[표](https://a.b/c)");
eq("저장: 주소 없음", linkifyMemo("주간 보고"), "주간 보고");
eq("저장 뒤 표시도 짧게", links(mdLinks(linkifyMemo("https://www.youtube.com/watch?v=1"))), [["https://www.youtube.com/watch?v=1", "youtube.com/…"]]);
console.log(`${n - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
