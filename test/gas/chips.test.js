// chips.test.js — 관리항목 스마트 칩 링크(서버 v69+)를 실제 서버 코드로 확인. Sheets 고급 서비스는 가짜로 흉내 낸다.
//   서버 사본에 chipRunsFor 가 없으면(v68 이하) 건너뛴다.  다른 판: TT_GAS=<파일> node test/gas/chips.test.js
"use strict";
const fs = require("fs"), path = require("path");
const { makeGasServer, ME, GAS_FILE } = require("./gas-server.js");
if (!/function chipRunsFor\(/.test(fs.readFileSync(GAS_FILE, "utf8"))) { console.log("건너뜀: " + path.basename(GAS_FILE) + " 에 칩 읽기가 없다"); process.exit(0); }

let fail = 0;
const ok = (name, cond, extra) => { console.log((cond ? "OK  " : "NG  ") + name + (cond ? "" : "  " + JSON.stringify(extra))); if (!cond) fail++; };
const clock = { now: 1e12 };
const URI = "https://docs.google.com/spreadsheets/d/CHIPDOC/edit";
// 가짜 Sheets: 'B3' 칸(테스터 관리항목 「주간 보고」)의 앞 두 글자를 칩으로 돌려준다. calls 로 요청 횟수를 센다.
function fakeSheets(opts) {
  const calls = [];
  return { calls, Spreadsheets: { get(id, req) {
    calls.push(req.ranges.length);
    if (opts && opts.throws) throw new Error("API 꺼짐");
    return { sheets: [{ data: req.ranges.map(r => {
      const m = r.match(/!([A-Z]+)(\d+)$/), col = m[1].charCodeAt(0) - 64, row = +m[2];
      const d = { startRow: row - 1, startColumn: col - 1, rowData: [{ values: [{ formattedValue: "주간 보고" }] }] };
      if (m[1] === "B" && row === 3) d.rowData[0].values[0].chipRuns = [{ chip: { richLinkProperties: { uri: URI, mimeType: "application/vnd.google-apps.ritz" } } }, { startIndex: 2 }];
      return d;
    }) }] };
  } } };
}
{
  const S = fakeSheets();
  const s = makeGasServer(clock, { Sheets: S });
  const m = s.rawRead(ME).members[0].mgmt[0];
  ok("칩 → [글자](주소) + 나머지 글자", m.b === "[주간](" + URI + ") 보고", m);
  ok("Sheets 요청은 읽기 한 번에 한 번", S.calls.length === 1, S.calls);
  const r = s.rawPost({ action: "updateMemo", targetMember: ME, row: m.row, memoB: "주간 보고 수정", expectB: m.b });
  ok("받은 칩 마크다운을 지문으로 보내면 통과", r.ok === true, r);
}
{
  const s = makeGasServer(clock, { Sheets: fakeSheets() });
  const r = s.rawPost({ action: "updateMemo", targetMember: ME, row: 3, memoB: "x", expectB: "주간 보고" });
  ok("칩을 모르는 옛 지문(글자만)은 stale", r.ok === false && r.stale === true, r);
}
{
  const s = makeGasServer(clock, { Sheets: fakeSheets({ throws: true }) });
  const res = s.rawRead(ME);
  ok("API 가 실패해도 읽기는 정상(글자만)", res.ok === true && res.members[0].mgmt[0].b === "주간 보고", res.members && res.members[0].mgmt);
}
{
  const s = makeGasServer(clock);   // 고급 서비스 없음
  ok("고급 서비스가 없으면 v68 과 같음", s.rawRead(ME).members[0].mgmt[0].b === "주간 보고");
}
console.log(fail ? `\n${fail}건 실패` : "\n전부 통과");
process.exit(fail ? 1 : 0);
