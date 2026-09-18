// workhours.test.js — 「업무시간만 세기」 계산 규칙 125벡터. 대상은 renderer/index.html 그 자체다:
//   test/loader.js 가 index.html 에서 순수 함수 블록(HOLIDAYS·getHoliday·normalizeTime·WORK_DEFAULT~workCfg·hmToMin~cdTextAt·fmtDl)을
//   추출해 vm 에서 평가한다. 실행: npm test  (또는 node test/workhours.test.js)
//   설계 기록·시안: _audit/ (git 제외). 규칙이 바뀌면 기대값을 손 검산으로 갱신할 것 — 함수 출력으로 기대값을 만들지 말 것.
// ── bizleft.js 테스트 — node C:\Users\misk9\ClaudeCode\teamtimer\_audit\bizleft.test.js ──
// 본 규칙 = 규칙 B(마감 당일 창 확장, 사용자 결정 2026-09-18). 스펙 벡터 V01~V28 은 B 기준으로 다시 손 검산했다.
//   B 로 바뀐 것 = 마감이 업무시간 밖인 벡터 5개(V03·V04·V05·V14·V22) + E26 통계 + E27. 나머지는 규칙 A 와 값이 같다.
// orange 정합(09-18 마무리) — 주황 = ts ≤ 다음 업무일 시작 AND (마감이 오늘 OR bizLeft < dayMs). 'Nd Nh' 카드는 주황이 아니다.
//   이걸로 바뀐 벡터 = 일 18:00 마감 5개(V05·V14·V22·X05·X18 후반) 전부 orange → green. E26 통계는 NINE 에 일 18:00 카드가 없어 3·2·4 그대로.
//   검산 8개는 O01~O08, 30일 전수 불변식은 O09.
// 경계 케이스(E01~E41) + 공휴일 이름 표식(H01~H09) + 규칙 B 경계(X01~X20) + orange 정합(O01~O09) + 설명 표시(L01~L10). 의존성 없음.
// 설명 표시(labels, 09-18 하위 옵션 「설명 표시」) — workHours.labels / cfg.labels, 기본 true. false 면 l 항상 ''(초과 포함), 숫자·색 불변.
//   기존 벡터 중 E19~E23 은 반환 객체에 labels:true 가 더해져 기대값 모양만 갱신했다(값·판정은 그대로).
// 규칙 A 는 bizleft.js 에 진입점이 없다 — 이 파일 끝의 refA(참조 구현)는 "업무시간 안 마감이면 A = B" 확인(X12)에만 쓴다.
"use strict";
const path = require("path");
const B = require(path.join(__dirname, "loader.js"));
const { hmToMin, bizLeft, urgency, cdText, pauseLabel, nextBizStart, parseWorkHours, makeCfg, normalizeTime, stats, isOffDay, fmtDl,
  holidayLabel, HOLIDAYS } = B;

const D = (y, m, d, h, mi = 0, s = 0) => new Date(y, m - 1, d, h, mi, s).getTime();
const D26 = (m, d, h, mi = 0, s = 0) => D(2026, m, d, h, mi, s);
const H = 3600000;
const DEF = { startMin: hmToMin("09:00"), endMin: hmToMin("18:00") };
const FAR = D26(12, 31, 10);                      // 표식만 볼 때 쓰는 '다른 날' 마감 — 마감 당일 창이 개입하지 않게

let pass = 0, fail = 0;
const lines = [];
function log(s){ lines.push(s); console.log(s); }
function check(name, actual, expected){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ pass++; log(`OK    ${name}`); }
  else { fail++; log(`FAIL  ${name}\n        got ${a}\n        exp ${e}`); }
}

// ── 스펙 벡터(규칙 B) ── [name, now, deadline, cfg, expect_ms, expect_text, expect_urgency, expect_label?, compact?]
const V = [
  ["V01 초과 — 달력 그대로(over 우선)",           D26(9,18,17),     D26(9,17,18),     DEF, -23*H,   "+23:00 초과", "over", "초과"],
  ["V02 오늘 18:00 — 마감 = 창 끝 정각",           D26(9,18,17),     D26(9,18,18),     DEF, 1*H,     "01:00:00", "red", ""],
  ["V03 ★B 오늘 21:00 — 창이 21:00 까지: 4h, 월 09:00 전이라 주황", D26(9,18,17), D26(9,18,21), DEF, 4*H, "04:00:00", "orange", ""],
  ["V04 ★B 토 14:00 — 금 1h + 토 09~14 5h = 6h 주황", D26(9,18,17), D26(9,19,14),     DEF, 6*H,     "06:00:00", "orange", ""],
  ["V05 ★B 일 18:00 — 금 1h + 일 9h = 10h(토는 D 가 아니라 0) → 1d 1h. ts ≤ 월 09:00 이지만 10h ≥ dayMs 9h 라 'Nd Nh' → 초록(orange 정합, 전엔 주황)", D26(9,18,17), D26(9,20,18), DEF, 10*H, "1d 1h", "green", ""],
  ["V06 ★월 10:00 — 핵심 장면(A 와 동일)",         D26(9,18,17),     D26(9,21,10),     DEF, 2*H,     "02:00:00", "red", ""],
  ["V07 월 12:00 — 초록인데 HH:MM:SS",            D26(9,18,17),     D26(9,21,12),     DEF, 4*H,     "04:00:00", "green", ""],
  ["V08 월 18:00 — 10h > 9h → 1d",                D26(9,18,17),     D26(9,21,18),     DEF, 10*H,    "1d 1h", "green", ""],
  ["V09 화 18:00",                                D26(9,18,17),     D26(9,22,18),     DEF, 19*H,    "2d 1h", "green", ""],
  ["V10 9/28(월) 18:00 — 추석 3일+주말 건너뜀",   D26(9,18,17),     D26(9,28,18),     DEF, 37*H,    "4d 1h", "green", ""],
  ["V11 9/28(월) 10:00",                          D26(9,18,17),     D26(9,28,10),     DEF, 29*H,    "3d 2h", "green", ""],
  ["V12 10/6(화) 14:00 — 개천절(토)+대체공휴일 10/5 제외", D26(9,18,17), D26(10,6,14), DEF, 78*H,  "8d 6h", "green", ""],
  ["V13 업무 후 — 금 20:00 에 월 12:00(마감 당일 아님 → 멈춤)", D26(9,18,20), D26(9,21,12), DEF, 3*H, "03:00:00", "green", "업무 후"],
  ["V14 ★B 금 18:30 에 일 18:00 — 금 0 + 일 D 창 9h = 9h → 1d 0h, 지금은 창 밖이라 '업무 후'. 9h < 9h 아님 → 초록(orange 정합, 전엔 주황)", D26(9,18,18,30), D26(9,20,18), DEF, 9*H, "1d 0h", "green", "업무 후"],
  ["V15 주말 — 토 10:00 에 월 10:00",             D26(9,19,10),     D26(9,21,10),     DEF, 1*H,     "01:00:00", "red", "주말"],
  ["V16 공휴일 — 추석 목 9/24 11:00 에 9/28 10:00 (이름 표식 '추석')", D26(9,24,11), D26(9,28,10), DEF, 1*H, "01:00:00", "red", "추석"],
  ["V17 업무 전 — 정확히 하루폭(창 앞이라 표식)",   D26(9,21,8,30),   D26(9,21,18),     DEF, 9*H,     "09:00:00", "orange", "업무 전"],
  ["V18 업무 전 — 18h = 정확히 2 업무일",          D26(9,21,8,30),   D26(9,22,18),     DEF, 18*H,    "2d 0h", "green", "업무 전"],
  ["V19 30분 단위 설정 + 나머지 버림",             D26(9,18,17),     D26(9,28,17,30),  {startMin:hmToMin("08:30"),endMin:hmToMin("17:30")}, 36.5*H, "4d 0h", "green", ""],
  ["V20 설정 깨짐(끝≤시작) → 로드 시 기본값 off → 달력", D26(9,18,17), D26(9,21,12),  makeCfg(parseWorkHours(JSON.stringify({on:true,start:"18:00",end:"09:00"}))), 67*H, "2d 19h", "green", ""],
  ["V21 마감 = 지금",                              D26(9,18,17),     D26(9,18,17),     DEF, 0,       "00:00:00", "red", ""],
  ["V22 ★B 금 10:00 에 일 18:00: 금 8h + 일 9h = 17h → 1d 8h. 'Nd Nh' 는 주황이 아니다 → 초록(orange 정합, 전엔 주황)", D26(9,18,10), D26(9,20,18), DEF, 17*H, "1d 8h", "green", ""],
  ["V23 10/2(금) 18:00",                          D26(9,18,17),     D26(10,2,18),     DEF, 73*H,    "8d 1h", "green", ""],
  ["V24 compact(≤400px) — 월 12:00",               D26(9,18,17),     D26(9,21,12),     DEF, 4*H,     "04:00", "green", "", true],
  ["V25 09:30 시작 설정 — 월 09:00 에 월 18:00",    D26(9,21,9),      D26(9,21,18),     {startMin:hmToMin("09:30"),endMin:hmToMin("18:00")}, 8.5*H, "08:30:00", "orange", "업무 전"],
  ["V26 옵션 OFF — 꺼진 경로 회귀 0",              D26(9,18,17),     D26(9,21,10),     null, 65*H,   "2d 17h", "green", ""],
  ["V27 주말에 지난 카드 — 표식 대신 초과",         D26(9,19,10),     D26(9,18,18),     DEF, -16*H,   "+16:00 초과", "over", "초과"],
  ["V28 09:00:00 정각 — 3h 정각은 red 아님",       D26(9,21,9),      D26(9,21,12),     DEF, 3*H,     "03:00:00", "orange", ""],
];

log("── 스펙 벡터 V01~V28(규칙 B) ──");
for(const [name, now, ts, cfg, ems, etext, eurg, elabel, compact] of V){
  const ms = cfg ? bizLeft(now, ts, cfg) : ts - now;
  const cd = cdText(now, ts, cfg, !!compact);
  const text = cd.t + (cd.l === "초과" ? " 초과" : "");
  const u = urgency(now, ts, cfg);
  check(name, { ms, text, u, l: cd.l }, { ms: ems, text: etext, u: eurg, l: elabel });
}

log("\n── 경계 케이스 ──");
// E01 V17 의 다음 순간: 09:00:01 → '08:59:59', 표식 소실
check("E01 월 09:00:01 → 월 18:00 = 08:59:59 orange l=''",
  (() => { const now = D26(9,21,9,0,1), ts = D26(9,21,18); const cd = cdText(now, ts, DEF); return { t: cd.t, l: cd.l, u: urgency(now, ts, DEF) }; })(),
  { t: "08:59:59", l: "", u: "orange" });
// E02 18:00:00 정각 — 업무 후 판정(min >= endMin), 마감 당일이 아닌 카드는 숫자 멈춤
check("E02 금 18:00:00 정각 → 월 12:00 = 03:00:00 green '업무 후'",
  (() => { const now = D26(9,18,18), ts = D26(9,21,12); const cd = cdText(now, ts, DEF); return { t: cd.t, l: cd.l, u: urgency(now, ts, DEF) }; })(),
  { t: "03:00:00", l: "업무 후", u: "green" });
// E03 17:59:59 → 18:00:00 → 18:00:01 사이에 숫자가 안 변한다(멈춤 = nodeValue 비교 false)
check("E03 18:00:00 과 18:00:01 의 숫자 동일(멈춤)",
  (() => { const ts = D26(9,21,12); return cdText(D26(9,18,18,0,0), ts, DEF).t === cdText(D26(9,18,18,0,1), ts, DEF).t; })(), true);
// E04 일요일에 월 08:00 마감 — 월 D 창 [09:00, 18:00] 이 마감(08:00) 앞에 있어 잔여 0, 미래 → red + '주말'
check("E04 일 15:00 → 월 08:00 = 00:00:00 red '주말'",
  (() => { const now = D26(9,20,15), ts = D26(9,21,8); const cd = cdText(now, ts, DEF); return { t: cd.t, l: cd.l, u: urgency(now, ts, DEF) }; })(),
  { t: "00:00:00", l: "주말", u: "red" });
// E05 판정 순서: 토요일이면서 공휴일(10/3 개천절 토) → '주말' 이 우선
check("E05 10/3(토·개천절) 표식 = '주말'", pauseLabel(D26(10,3,11), FAR, DEF), "주말");
// E06 평일 공휴일 업무 전 시각 — 공휴일(이름) 이 '업무 전' 보다 우선('대체공휴일' 5자 그대로)
check("E06 10/5(월·대체공휴일) 07:00 표식 = '대체공휴일'", pauseLabel(D26(10,5,7), FAR, DEF), "대체공휴일");
// E07 업무시간 안 = 표식 없음
check("E07 금 17:00 표식 = ''", pauseLabel(D26(9,18,17), FAR, DEF), "");
// E08 연말·연초 넘김 + 신정(고정 공휴일, 2027 byYear 에 없음): 목 12/31 17:00 → 월 1/4 10:00 = 1h + 1h
check("E08 2026-12-31(목) 17:00 → 2027-01-04(월) 10:00 = 2h (1/1 신정 제외)",
  bizLeft(D(2026,12,31,17), D(2027,1,4,10), DEF), 2*H);
// E09 내장 데이터 밖(2028): 주말 + 양력 고정만. 2028-02-29(화) 17:00 → 2028-03-02(목) 10:00: 3/1 삼일절(수) 제외 → 1h+1h
check("E09 2028 — 삼일절(고정) 제외, 음력 공휴일은 모름", bizLeft(D(2028,2,29,17), D(2028,3,2,10), DEF), 2*H);
// E10 4000일 가드: 연도 오타(2062)에도 멈추지 않고 유한값을 돌려준다. 값은 상한에서 잘린다 — 2037(약 11년 뒤)과 2062 가 같은 값(의도 고정)
check("E10 2062년 마감 — 루프 종료·유한값·상한 동일(2037 == 2062)",
  (() => { const t0 = Date.now(); const now = D26(9,18,17); const v = bizLeft(now, D(2062,9,18,18), DEF); const cap = bizLeft(now, D(2037,9,18,18), DEF);
    return { finite: Number.isFinite(v) && v > 0, fast: (Date.now() - t0) < 2000, capped: v === cap, below: bizLeft(now, D(2035,9,18,18), DEF) < cap }; })(),
  { finite: true, fast: true, capped: true, below: true });
// E11 NaN 마감 — 루프 진입 전 반환(무한루프 없음), NaN 을 돌려준다(앱의 기존 경로도 NaN)
check("E11 NaN 마감 → 즉시 반환", Number.isNaN(bizLeft(D26(9,18,17), NaN, DEF)), true);
// E12 endMin ≤ startMin 가드(이중 안전장치) → 달력 차이
check("E12 cfg 끝≤시작 → 달력 차이", bizLeft(D26(9,18,17), D26(9,21,10), {startMin:1080,endMin:540}), 65*H);
// E13 ★규칙 B 는 단조가 아니다(창을 마감까지 늘리므로) — 실측 예 3종 리터럴. 단, 업무시간 안 마감끼리는 단조(A 와 같으므로).
//     정렬은 deadline 기준이라 화면 순서엔 영향 없음.
check("E13 bizLeft 비단조 예(금 23:30 6.5h > 토 00:00 1h, 토 23:00 15h > 월 10:00 2h) · 업무시간 안 마감끼리는 단조(30일)",
  (() => { const now = D26(9,18,17); let prev = -Infinity, mono = true;
    for(let k=0;k<30*48;k++){ const ts = now + k*1800000; const d = new Date(ts); const min = d.getHours()*60 + d.getMinutes();
      if(isOffDay(d.getFullYear(), d.getMonth(), d.getDate()) || min < DEF.startMin || min > DEF.endMin) continue;
      const v = bizLeft(now, ts, DEF); if(v < prev) mono = false; prev = v; }
    return { mono, fri2330: bizLeft(now, D26(9,18,23,30), DEF)/H, sat0000: bizLeft(now, D26(9,19,0), DEF)/H, sat2300: bizLeft(now, D26(9,19,23), DEF)/H, mon1000: bizLeft(now, D26(9,21,10), DEF)/H }; })(),
  { mono: true, fri2330: 6.5, sat0000: 1, sat2300: 15, mon1000: 2 });
// E14 nextBizStart: 금요일 → 월 09:00, 목 9/23 → 월 9/28(추석·주말 건너뜀), 금 10/2 → 화 10/6(개천절 토·대체 10/5)
check("E14 nextBizStart 금 9/18 → 월 9/21 09:00", nextBizStart(D26(9,18,17), DEF), D26(9,21,9));
check("E15 nextBizStart 수 9/23 → 월 9/28 09:00", nextBizStart(D26(9,23,17), DEF), D26(9,28,9));
check("E16 nextBizStart 금 10/2 → 화 10/6 09:00", nextBizStart(D26(10,2,17), DEF), D26(10,6,9));
// E17 orange 경계: 금 10:00(잔여 8h, red 아님) 에 월 09:00 정각 마감은 orange(ts ≤ nextBizStart), 월 09:01 은 green
//     (금 17:00 이면 잔여 1h 라 red 가 먼저다 — red > orange 순서 확인은 E17b)
check("E17 금 10:00: 월 09:00 정각 마감 = orange / 09:01 = green",
  [urgency(D26(9,18,10), D26(9,21,9), DEF), urgency(D26(9,18,10), D26(9,21,9,1), DEF)], ["orange", "green"]);
check("E17b 금 17:00: 월 09:00 마감 = red (잔여 1h, red 가 orange 보다 먼저)", urgency(D26(9,18,17), D26(9,21,9), DEF), "red");
// E18 red 경계: 정확히 3h 는 red 아님, 2:59:59 는 red
check("E18 3h 정각 아님 / 2:59:59 red",
  [urgency(D26(9,18,15), D26(9,18,18), DEF), urgency(D26(9,18,15,0,1), D26(9,18,18), DEF)], ["orange", "red"]);
// E19 parseWorkHours 폴백 4종
check("E19 parseWorkHours(null) = 기본값 off", parseWorkHours(null), { on:false, start:"09:00", end:"18:00", labels:true });
check("E20 parseWorkHours(깨진 JSON) = 기본값 off", parseWorkHours("{on:true"), { on:false, start:"09:00", end:"18:00", labels:true });
check("E21 parseWorkHours(형식 실패 25:00) = 기본값 off", parseWorkHours('{"on":true,"start":"25:00","end":"18:00"}'), { on:false, start:"09:00", end:"18:00", labels:true });
check("E21b parseWorkHours('9am') — normalizeTime 은 숫자만 남겨 09:00 으로 읽는다(앱 규칙)", parseWorkHours('{"on":true,"start":"9am","end":"18:00"}'), { on:true, start:"09:00", end:"18:00", labels:true });
check("E22 parseWorkHours(정상, 느슨한 형식) = 정규화·on", parseWorkHours('{"on":1,"start":"930","end":"1830"}'), { on:true, start:"09:30", end:"18:30", labels:true });
check("E23 makeCfg(off) = null / makeCfg(on) = 분", [makeCfg({on:false,start:"09:00",end:"18:00"}), makeCfg({on:true,start:"09:30",end:"18:00"})], [null, {startMin:570,endMin:1080,labels:true}]);
// E24 normalizeTime — 설정 입력의 blur/Enter 정규화
check("E24 normalizeTime 5종", ["9","1830","18","18:00","25:00","abc"].map(normalizeTime), ["09:00","18:30","18:00","18:00","",""]);
// E25 시안 9장 상단 통계: 달력 2·1·6 / 업무일(규칙 B) 3·2·4 — ④ 토 14:00(6h) 초록→주황, ⑤ 월 10:00(2h) 초록→빨강 두 장만 옮겨 감. ③ 오늘 21:00 은 달력에서도 이미 주황(ts ≤ 오늘 23:59)
const NINE = [D26(9,17,18),D26(9,18,18),D26(9,18,21),D26(9,19,14),D26(9,21,10),D26(9,21,12),D26(9,22,18),D26(9,28,10),D26(10,6,14)];
check("E25 통계 달력 2·1·6", stats(D26(9,18,17), NINE, null), { r:2, o:1, g:6 });
check("E26 ★B 통계 업무일 3·2·4", stats(D26(9,18,17), NINE, DEF), { r:3, o:2, g:4 });
// E27 ★B 마감이 퇴근 뒤(오늘 21:00) — 18:30 엔 창 안이라 02:30:00 흐름(표식 없음), 21:01 엔 '+0:01 초과'
check("E27 금 18:30 → 오늘 21:00 = 02:30:00 red '' (창 안, 흐름)",
  (() => { const now = D26(9,18,18,30), ts = D26(9,18,21); const cd = cdText(now, ts, DEF); return { t: cd.t, l: cd.l, u: urgency(now, ts, DEF) }; })(),
  { t: "02:30:00", l: "", u: "red" });
check("E28 금 21:01 → 오늘 21:00 = +0:01 초과",
  (() => { const now = D26(9,18,21,1), ts = D26(9,18,21); const cd = cdText(now, ts, DEF); return { t: cd.t, l: cd.l, u: urgency(now, ts, DEF) }; })(),
  { t: "+0:01", l: "초과", u: "over" });
// E29 compact + 표식: 월 08:30 에 월 12:00 → '03:00' + '업무 전'
check("E29 compact 월 08:30 → 월 12:00 = 03:00 '업무 전'", cdText(D26(9,21,8,30), D26(9,21,12), DEF, true), { t: "03:00", l: "업무 전" });
// E30 옵션 OFF 경로는 cfg=null 일 때 pauseLabel 을 부르지 않는다 → l 은 항상 ''(초과 제외)
check("E30 OFF 경로 l 항상 ''", [cdText(D26(9,19,10), D26(9,21,10), null).l, cdText(D26(9,18,20), D26(9,21,10), null).l], ["", ""]);
// E31 isOffDay 표본
check("E31 isOffDay 9/24 추석·9/26 토·9/28 월", [isOffDay(2026,8,24), isOffDay(2026,8,26), isOffDay(2026,8,28)], [true, true, false]);
// E32 fmtDl 은 바뀌지 않는다(마감 칩) — 금 17:00 기준
check("E32 fmtDl 오늘/내일/모레/요일", [fmtDl(D26(9,18,21),false,D26(9,18,17)), fmtDl(D26(9,19,14),false,D26(9,18,17)), fmtDl(D26(9,20,18),false,D26(9,18,17)), fmtDl(D26(9,21,10),false,D26(9,18,17))],
  ["오늘 21:00", "내일 14:00", "모레 18:00", "9/21(월) 10:00"]);
// E33 tick 성능 — 카드 28 × (urgency + cdText) × 30일 마감이 1ms 급인지(실측 0.23ms/tick). 임계 5ms = 실측의 20배(회귀 감지용)
check("E33 28카드 tick 1회 < 5ms",
  (() => { const now = D26(9,18,17); const ds = []; for(let i=0;i<28;i++) ds.push(now + (i+1)*26*H); const t0 = process.hrtime.bigint(); for(let r=0;r<10;r++) ds.forEach(ts => { urgency(now, ts, DEF); cdText(now, ts, DEF); }); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 10; return ms < 5; })(), true);

log("\n── 검수 반영 — cfg 방어·표기 규칙 ──");
// E34 makeCfg 가 유일한 관문: 역전·동일·NaN 입력은 on 이어도 null (saveSettings 가 parseWorkHours 없이 만든 workHours 재현)
check("E34 makeCfg 역전(18:00→09:00) = null", makeCfg({on:true,start:"18:00",end:"09:00"}), null);
check("E35 makeCfg 동일(09:00→09:00) = null / NaN(abc) = null", [makeCfg({on:true,start:"09:00",end:"09:00"}), makeCfg({on:true,start:"abc",end:"18:00"})], [null, null]);
// E36 cfg=null 경로: bizLeft 는 달력 차이, pauseLabel 은 '' (TypeError 없음)
check("E36 bizLeft(미래, cfg=null) = 달력 차이", bizLeft(D26(9,18,17), D26(9,21,10), null), 65*H);
check("E37 pauseLabel(토 11:00, cfg=null) = ''", pauseLabel(D26(9,19,11), D26(9,19,14), null), "");
// E38 makeCfg 를 우회한 역전·동일 cfg 가 urgency/cdText 에 직접 들어와도 달력 경로(옛 실측: 'Infinityd NaNh' / '02:00:00 업무 전 orange')
const BAD = [{startMin:1080,endMin:540}, {startMin:540,endMin:540}, {startMin:NaN,endMin:1080}];
check("E38 역전·동일·NaN cfg → cdText 달력(2d 17h, l='')", BAD.map(c => cdText(D26(9,18,17), D26(9,21,10), c)), BAD.map(() => ({ t:"2d 17h", l:"" })));
check("E39 역전·동일·NaN cfg → urgency 달력(green)", BAD.map(c => urgency(D26(9,18,17), D26(9,21,10), c)), ["green","green","green"]);
// E40 표기 규칙: 오늘 마감만 HH:MM:SS, 그 외 floor(left/dayMs). 금 17:59:59 와 18:00:00 이 같은 형태('1d 0h') — 멈추는 순간 형태가 안 바뀐다
check("E40 월 18:00 마감 — 금 17:59:59 '1d 0h' / 18:00:00 '1d 0h 업무 후' / 일 15:00 '1d 0h 주말'",
  [cdText(D26(9,18,17,59,59), D26(9,21,18), DEF), cdText(D26(9,18,18), D26(9,21,18), DEF), cdText(D26(9,20,15), D26(9,21,18), DEF)],
  [{ t:"1d 0h", l:"" }, { t:"1d 0h", l:"업무 후" }, { t:"1d 0h", l:"주말" }]);
// E41 형태가 바뀌는 유일한 때 = 마감일 자정(오늘이 됨): 월 00:00 '09:00:00 업무 전', 월 09:00:00 '09:00:00' (V17 과 이어짐)
check("E41 월 00:00 → 월 18:00 = '09:00:00 업무 전' / 월 09:00:00 = '09:00:00'",
  [cdText(D26(9,21,0), D26(9,21,18), DEF), cdText(D26(9,21,9), D26(9,21,18), DEF)],
  [{ t:"09:00:00", l:"업무 전" }, { t:"09:00:00", l:"" }]);

log("\n── 공휴일 이름 표식(열린 질문 2 → 이름, 사용자 결정) ──");
// H01~H04 내장 이름: 2자·5자는 그대로, 4자 '지방선거' 도 그대로. 마감은 다른 날(FAR) — 창 확장이 개입하지 않음
check("H01 9/24(목·추석) 11:00 = '추석'", pauseLabel(D26(9,24,11), FAR, DEF), "추석");
check("H02 10/5(월·대체공휴일) 11:00 = '대체공휴일'(5자 그대로)", pauseLabel(D26(10,5,11), FAR, DEF), "대체공휴일");
check("H03 6/3(수·지방선거) 11:00 = '지방선거'", pauseLabel(D26(6,3,11), FAR, DEF), "지방선거");
check("H04 2027-01-01(금·신정, fixed) 11:00 = '신정'", pauseLabel(D(2027,1,1,11), D(2027,1,4,10), DEF), "신정");
// H05 6자 '부처님오신날' → '공휴일' 폴백. 2026 5/24 는 일요일이라 '주말' 이 이기므로 평일인 2027-05-13(목) 으로.
check("H05 2027-05-13(목·부처님오신날 6자) = '공휴일' 폴백 / 2026-05-24(일) = '주말' 우선",
  [pauseLabel(D(2027,5,13,11), D(2027,5,14,10), DEF), pauseLabel(D26(5,24,11), FAR, DEF)], ["공휴일", "주말"]);
// H06 holidayLabel 경계: 5자 그대로 / 6자·7자 접힘 (KASI 긴 이름 가정)
check("H06 holidayLabel 5자 그대로 / 6자·7자 '공휴일'", ["대체공휴일", "부처님오신날", "임시공휴일지정"].map(holidayLabel), ["대체공휴일", "공휴일", "공휴일"]);
// H07 KASI 머지로 긴 이름이 들어온 상황 재현 — HOLIDAYS 를 잠시 바꿨다 되돌린다(11/3 화)
check("H07 KASI 긴 이름(6자 '대통령선거일') 머지 가정 → '공휴일' / 되돌린 뒤 = ''",
  (() => { HOLIDAYS.byYear[2026]["11-3"] = "대통령선거일"; const a = pauseLabel(D26(11,3,11), FAR, DEF);
    delete HOLIDAYS.byYear[2026]["11-3"]; return [a, pauseLabel(D26(11,3,11), FAR, DEF)]; })(), ["공휴일", ""]);
// H08 cdText 경유(카드에 실제로 찍히는 값) — 추석 / 대체공휴일 / 부처님오신날→공휴일 세 장(시안 D 의 세 카드와 같은 장면)
check("H08 카드값 — 9/24 11:00→9/28 10:00 {01:00:00,'추석'} red / 10/5 11:00→10/6 14:00 {05:00:00,'대체공휴일'} green / 2027-05-13→05-14 10:00 {01:00:00,'공휴일'} red",
  [cdText(D26(9,24,11), D26(9,28,10), DEF), urgency(D26(9,24,11), D26(9,28,10), DEF),
   cdText(D26(10,5,11), D26(10,6,14), DEF), urgency(D26(10,5,11), D26(10,6,14), DEF),
   cdText(D(2027,5,13,11), D(2027,5,14,10), DEF), urgency(D(2027,5,13,11), D(2027,5,14,10), DEF)],
  [{ t:"01:00:00", l:"추석" }, "red", { t:"05:00:00", l:"대체공휴일" }, "green", { t:"01:00:00", l:"공휴일" }, "red"]);
// H09 우선순위 — 주말 > 공휴일(10/3 토·개천절 카드값) / 초과 > 표식(추석날 지난 카드)
check("H09 10/3(토·개천절) 11:00→10/6 14:00 = {05:00:00,'주말'} / 9/24 11:00→9/23 18:00 = {+17:00,'초과'} over",
  [cdText(D26(10,3,11), D26(10,6,14), DEF), cdText(D26(9,24,11), D26(9,23,18), DEF), urgency(D26(9,24,11), D26(9,23,18), DEF)],
  [{ t:"05:00:00", l:"주말" }, { t:"+17:00", l:"초과" }, "over"]);

log("\n── 규칙 B 경계 — 마감 당일 창 확장 손 검산(기대값 리터럴) ──");
const R = (now, ts, cfg = DEF) => { const c = cdText(now, ts, cfg); return [c.t, c.l, urgency(now, ts, cfg), bizLeft(now, ts, cfg)/H]; };
// X01 오늘 21:00 마감 — 금 17:00: 창 [09:00, 21:00] → 4h orange(21:00 ≤ 월 09:00)
check("X01 금 17:00 → 오늘 21:00 = 04:00:00 '' orange 4h", R(D26(9,18,17), D26(9,18,21)), ["04:00:00", "", "orange", 4]);
// X02 now 가 D 창 안 — 금 19:00: 02:00:00 red 흐름(표식 없음)
check("X02 금 19:00 → 오늘 21:00 = 02:00:00 '' red 2h (창 안)", R(D26(9,18,19), D26(9,18,21)), ["02:00:00", "", "red", 2]);
// X03 토 14:00 마감 — 금 17:00: 금 1h + 토 09~14 5h = 6h orange
check("X03 금 17:00 → 토 14:00 = 06:00:00 '' orange 6h", R(D26(9,18,17), D26(9,19,14)), ["06:00:00", "", "orange", 6]);
// X04 토 11:00: 창 안 → 03:00:00 orange 흐름(3h 정각은 red 아님)
check("X04 토 11:00 → 토 14:00 = 03:00:00 '' orange 3h (창 안)", R(D26(9,19,11), D26(9,19,14)), ["03:00:00", "", "orange", 3]);
// X05 D 가 일요일 — 토는 D 가 아니라 안 센다: 금 1h + 일 9h = 10h → 1d 1h. 토 11:00 에 보면 창 밖이라 '주말', 일 9h 그대로 1d 0h.
//     색: 둘 다 ts ≤ 월 09:00 이지만 마감이 오늘이 아니고 잔여 ≥ dayMs(10h·9h) 라 'Nd Nh' → 초록(orange 정합, 전엔 주황)
check("X05 D=일 18:00: 금 17:00 → 1d 1h '' green 10h / 토 11:00 → 1d 0h '주말' green 9h",
  [R(D26(9,18,17), D26(9,20,18)), R(D26(9,19,11), D26(9,20,18))], [["1d 1h", "", "green", 10], ["1d 0h", "주말", "green", 9]]);
// X06 업무시간 안 마감 — 창 확장 없음(A 와 동일)
check("X06 금 17:00 → 월 10:00 = 02:00:00 '' red 2h", R(D26(9,18,17), D26(9,21,10)), ["02:00:00", "", "red", 2]);
// X07 D 가 공휴일 — 추석 목 9/24 14:00 마감: 금 1h + 월~수 27h + 목 09~14 5h = 33h → 3d 6h green(ts > 월 09:00)
check("X07 금 17:00 → 9/24(추석) 14:00 = 3d 6h '' green 33h", R(D26(9,18,17), D26(9,24,14)), ["3d 6h", "", "green", 33]);
// X07b 공휴일 당일 — 9/24 11:00 에 9/24 14:00 카드는 창 안(03:00:00 흐름), 08:00 엔 창 앞이라 '추석'(창 [09:00,14:00] 5h). orange = ts ≤ 9/28 09:00
check("X07b 추석 당일: 9/24 11:00 → 9/24 14:00 = 03:00:00 '' orange / 08:00 → 05:00:00 '추석' orange",
  [R(D26(9,24,11), D26(9,24,14)), R(D26(9,24,8), D26(9,24,14))], [["03:00:00", "", "orange", 3], ["05:00:00", "추석", "orange", 5]]);
// X08 잔여 0 — 토 08:00 에 토 09:00 마감: 창 [09:00, 18:00] 앞이라 0, 표식 '주말'(창 밖) red
check("X08 토 08:00 → 토 09:00 = 00:00:00 '주말' red 0", R(D26(9,19,8), D26(9,19,9)), ["00:00:00", "주말", "red", 0]);
// X08b 잔여 0 — 금 18:30 에 월 09:00 마감: 월 창 [09:00,18:00] ∩ [now, 09:00] = 0 → '업무 후' red. (규칙 B 에서 잔여 0 은 창 앞에서만 생긴다)
check("X08b 금 18:30 → 월 09:00 = 00:00:00 '업무 후' red 0", R(D26(9,18,18,30), D26(9,21,9)), ["00:00:00", "업무 후", "red", 0]);
// X09 마감 = D@end 정각 — 금 17:00 → 오늘 18:00 = 1h red. 18:00:00 정각엔 0 = '00:00:00' 표식 없음(창은 닫힌 구간 [09:00, 18:00] — 검수 반영, 정의와 일치), 18:00:01 부터 초과.
//     같은 이유로 오늘 21:00 카드도 21:00:00 정각에 '00:00:00' 표식 없음 → 21:00:01 '+0:00 초과'(마감 정각 1초 동안 '업무 후' 가 찍히지 않는다)
check("X09 마감 = 창 끝 정각: 17:00 → 01:00:00 '' red / 18:00:00 → 00:00:00 '' red / 18:00:01 → +0:00 초과 over / 21:00:00 → 00:00:00 ''",
  [R(D26(9,18,17), D26(9,18,18)), R(D26(9,18,18), D26(9,18,18)), R(D26(9,18,18,0,1), D26(9,18,18)).slice(0,3), R(D26(9,18,21), D26(9,18,21))],
  [["01:00:00", "", "red", 1], ["00:00:00", "", "red", 0], ["+0:00", "초과", "over"], ["00:00:00", "", "red", 0]]);
// X10 초과 — 달력 위임
check("X10 금 21:01 → 오늘 21:00 = +0:01 초과 over", R(D26(9,18,21,1), D26(9,18,21)).slice(0,3), ["+0:01", "초과", "over"]);
// X11 표식이 카드별 판정 — 같은 순간 두 카드: 금 19:00 [오늘 21:00 '', 월 10:00 '업무 후'] / 토 11:00 [토 14:00 '', 월 10:00 '주말'] / 추석 9/24 11:00 [9/24 14:00 '', 9/28 10:00 '추석']
check("X11 카드별 표식 — 업무 후·주말·공휴일 이름",
  [pauseLabel(D26(9,18,19), D26(9,18,21), DEF), pauseLabel(D26(9,18,19), D26(9,21,10), DEF),
   pauseLabel(D26(9,19,11), D26(9,19,14), DEF), pauseLabel(D26(9,19,11), D26(9,21,10), DEF),
   pauseLabel(D26(9,24,11), D26(9,24,14), DEF), pauseLabel(D26(9,24,11), D26(9,28,10), DEF)], ["", "업무 후", "", "주말", "", "추석"]);
// X12 업무시간 안 마감이면 A = B — 30일 × 30분 간격 전수(마감 시각이 업무일·업무시간 안인 것만). refA = 파일 끝 참조 구현
check("X12 업무시간 안 마감 전수: bizLeft == refA (30일)",
  (() => { const now = D26(9,18,17); let n = 0; for(let k=0;k<30*48;k++){ const ts = now + k*1800000; const d = new Date(ts); const min = d.getHours()*60 + d.getMinutes();
    if(isOffDay(d.getFullYear(), d.getMonth(), d.getDate()) || min < DEF.startMin || min > DEF.endMin) continue; n++;
    if(bizLeft(now, ts, DEF) !== refA(now, ts, DEF)) return { k, fail: true }; } return { checked: n > 200, allEqual: true }; })(), { checked: true, allEqual: true });
// X13 B ≥ A 항상(창을 늘리기만 한다) — 30일 전수
check("X13 bizLeft ≥ refA (30일 전수)",
  (() => { const now = D26(9,18,17); for(let k=0;k<30*48;k++){ const ts = now + k*1800000; if(bizLeft(now, ts, DEF) < refA(now, ts, DEF)) return { geA: false, k }; } return { geA: true }; })(), { geA: true });
// X14 cfg null·역전이면 달력 경로(기존 함수와 바이트 동일)
check("X14 cfg null/역전 → 달력", [cdText(D26(9,18,17), D26(9,21,10), null), urgency(D26(9,18,17), D26(9,21,10), null), cdText(D26(9,18,17), D26(9,21,10), {startMin:1080,endMin:540}), pauseLabel(D26(9,19,11), D26(9,19,14), null)],
  [{ t:"2d 17h", l:"" }, "green", { t:"2d 17h", l:"" }, ""]);
// X15 오늘 마감 HH:MM:SS 가 dayMs 를 넘는 경우 — 금 00:00 에 본 오늘 23:00 마감 = 창 [09:00, 23:00] 14h → '14:00:00 업무 전'(창 앞이라 멈춤), 09:00 부턴 흐름
check("X15 금 00:00 → 오늘 23:00 = 14:00:00 '업무 전' orange / 금 09:00 → 14:00:00 ''",
  [R(D26(9,18,0), D26(9,18,23)), R(D26(9,18,9), D26(9,18,23))], [["14:00:00", "업무 전", "orange", 14], ["14:00:00", "", "orange", 14]]);
// X16 compact(≤400px) 도 같은 규칙
check("X16 compact 토 11:00 → 토 14:00 = {03:00, ''}", cdText(D26(9,19,11), D26(9,19,14), DEF, true), { t:"03:00", l:"" });
// X17 cfg 09:30–17:30 — dayMs 8h. 금 17:00 → 오늘 21:00: 창 [09:30, 21:00] ∩ [17:00,21:00] = 4h / 금 17:45 → 월 10:00: 금 창 끝(17:30) 뒤라 0 + 월 [09:30,10:00] 0.5h
const C2 = { startMin: hmToMin("09:30"), endMin: hmToMin("17:30") };
check("X17 cfg 09:30–17:30: 금 17:00 → 오늘 21:00 = 04:00:00 orange / 금 17:45 → 월 10:00 = 00:30:00 '업무 후' red",
  [R(D26(9,18,17), D26(9,18,21), C2), R(D26(9,18,17,45), D26(9,21,10), C2)], [["04:00:00", "", "orange", 4], ["00:30:00", "업무 후", "red", 0.5]]);
// X18 cfg 09:30–17:30(dayMs 8h): 토 14:00 = 금 0.5h + 토 [09:30,14:00] 4.5h = 5h < 8h → 주황 / 일 18:00 = 0.5h + 일 [09:30,18:00] 8.5h = 9h → floor(9/8) = 1d 1h, 9h ≥ 8h 라 초록(orange 정합, 전엔 주황)
check("X18 cfg 09:30–17:30: 금 17:00 → 토 14:00 = 05:00:00 orange 5h / 일 18:00 = 1d 1h green 9h",
  [R(D26(9,18,17), D26(9,19,14), C2), R(D26(9,18,17), D26(9,20,18), C2)], [["05:00:00", "", "orange", 5], ["1d 1h", "", "green", 9]]);
// X19 D 창의 시작 정각 — 토 09:00:00 에 토 14:00 카드는 흐름(창 안, [ws, we)), 08:59:59 는 '주말'
check("X19 토 09:00:00 → 토 14:00 = 05:00:00 '' / 08:59:59 → 05:00:00 '주말'",
  [cdText(D26(9,19,9), D26(9,19,14), DEF), cdText(D26(9,19,8,59,59), D26(9,19,14), DEF)], [{ t:"05:00:00", l:"" }, { t:"05:00:00", l:"주말" }]);
// X20 시안 C-2 보드 — 금 19:00 [오늘 21:00, 월 10:00] / 토 11:00 [토 14:00, 월 10:00] 카드값(시안 DOM 대조용)
check("X20 시안 C-2: 금 19:00 [02:00:00 '' red, 01:00:00 '업무 후' red] / 토 11:00 [03:00:00 '' orange, 01:00:00 '주말' red]",
  [R(D26(9,18,19), D26(9,18,21)).slice(0,3), R(D26(9,18,19), D26(9,21,10)).slice(0,3), R(D26(9,19,11), D26(9,19,14)).slice(0,3), R(D26(9,19,11), D26(9,21,10)).slice(0,3)],
  [["02:00:00", "", "red"], ["01:00:00", "업무 후", "red"], ["03:00:00", "", "orange"], ["01:00:00", "주말", "red"]]);

log("\n── orange 정합 — 'Nd Nh' 와 주황이 한 카드에 나오지 않는다(숫자 형식과 같은 기준) · 손 검산 8개 + 전수 ──");
// 주황 = ts ≤ nextBizStart(now) AND (마감이 달력상 오늘 OR bizLeft < dayMs). 숫자는 오늘 마감 → HH:MM:SS, 그 외 floor(bizLeft/dayMs) ≥ 1 → 'Nd Nh'.
// O01 금 17:00 → 일 18:00: 금 1h + 토 0 + 일 9h = 10h ≥ 9h → '1d 1h'. ts ≤ 월 09:00 이지만 하루 이상이라 초록(전엔 주황)
check("O01 금 17:00 → 일 18:00 = 1d 1h '' green 10h (전엔 orange)", R(D26(9,18,17), D26(9,20,18)), ["1d 1h", "", "green", 10]);
// O02 일 09:00 → 일 18:00: 마감이 오늘, 창 [09:00,18:00] ∩ [09:00,18:00] = 9h → '09:00:00'(오늘은 d 로 접지 않음), 창 안이라 표식 없음, 오늘 마감이라 주황
check("O02 일 09:00 → 일 18:00 = 09:00:00 '' orange 9h", R(D26(9,20,9), D26(9,20,18)), ["09:00:00", "", "orange", 9]);
// O03 토 08:00 → 일 18:00: 토는 D 아닌 쉬는 날 0 + 일 9h = 9h → floor(9/9) = '1d 0h', 토요일이라 '주말'. 9h < 9h 아님 → 초록
check("O03 토 08:00 → 일 18:00 = 1d 0h '주말' green 9h", R(D26(9,19,8), D26(9,20,18)), ["1d 0h", "주말", "green", 9]);
// O04 월 08:30 → 월 18:00: 오늘 마감, 창 [09:00,18:00] = 9h → '09:00:00', 창 앞이라 '업무 전', 오늘 마감이라 주황(V17 그대로)
check("O04 월 08:30 → 월 18:00 = 09:00:00 '업무 전' orange 9h (V17 그대로)", R(D26(9,21,8,30), D26(9,21,18)), ["09:00:00", "업무 전", "orange", 9]);
// O05 금 17:00 → 토 14:00: 금 1h + 토 D 창 [09:00,14:00] 5h = 6h < 9h → '06:00:00', ts ≤ 월 09:00 → 주황(그대로)
check("O05 금 17:00 → 토 14:00 = 06:00:00 '' orange 6h (그대로)", R(D26(9,18,17), D26(9,19,14)), ["06:00:00", "", "orange", 6]);
// O06 금 17:00 → 오늘 21:00: 오늘 마감, 창 [09:00,21:00] ∩ [17:00,21:00] = 4h → '04:00:00' 주황(그대로)
check("O06 금 17:00 → 오늘 21:00 = 04:00:00 '' orange 4h (그대로)", R(D26(9,18,17), D26(9,18,21)), ["04:00:00", "", "orange", 4]);
// O07 금 18:30 → 일 18:00: 금 창 [09:00,18:00] 은 이미 지나 0 + 일 9h = 9h → '1d 0h', 금 18:30 은 창 밖 '업무 후'. 9h < 9h 아님 → 초록(전엔 주황)
check("O07 금 18:30 → 일 18:00 = 1d 0h '업무 후' green 9h (전엔 orange)", R(D26(9,18,18,30), D26(9,20,18)), ["1d 0h", "업무 후", "green", 9]);
// O08 금 10:00 → 일 18:00: 금 [10:00,18:00] 8h + 일 9h = 17h → floor(17/9) = '1d 8h' → 초록(전엔 주황)
check("O08 금 10:00 → 일 18:00 = 1d 8h '' green 17h (전엔 orange)", R(D26(9,18,10), D26(9,20,18)), ["1d 8h", "", "green", 17]);
// O09 불변식 — '지금' 6종 × cfg 2종 × 30일 30분 간격 전수: orange 이면 반드시 HH:MM:SS(‘d’ 없음). 주황 표본이 0 이면 검사가 공회전이므로 개수도 본다
check("O09 30일 전수: orange ⇒ 숫자에 'd' 없음 (지금 6종 × cfg 2종)",
  (() => { const nows = [D26(9,18,17), D26(9,18,10), D26(9,18,18,30), D26(9,19,8), D26(9,21,8,30), D26(9,20,9)]; let orange = 0, bad = 0;
    for(const cfg of [DEF, C2]) for(const now of nows) for(let k=1;k<=30*48;k++){ const ts = now + k*1800000;
      if(urgency(now, ts, cfg) !== "orange") continue; orange++; if(/d/.test(cdText(now, ts, cfg).t)) bad++; }
    return { bad, enough: orange > 100 }; })(), { bad: 0, enough: true });
// O10 경계 정각 — 토 14:00 마감: 금 14:00:00 은 금 4h + 토 5h = 9h = dayMs → '1d 0h' 초록, 1초 뒤 8:59:59 → '08:59:59' 주황. 숫자 형태와 색이 같은 순간에 바뀐다
check("O10 토 14:00 마감: 금 14:00:00 → 1d 0h green / 14:00:01 → 08:59:59 orange",
  [R(D26(9,18,14), D26(9,19,14)).slice(0,3), R(D26(9,18,14,0,1), D26(9,19,14)).slice(0,3)], [["1d 0h", "", "green"], ["08:59:59", "", "orange"]]);

log("\n── 설명 표시(labels) — 「업무시간만 세기」의 하위 토글. false 면 l 항상 ''(「초과」 포함), 숫자·색·통계는 그대로. cfg null 이면 적용 안 됨 ──");
const NOL = { ...DEF, labels: false };
// L01 지난 카드 — 「초과」도 숨는다. t·색은 그대로(V01 과 같은 장면). d 단위 초과도 같이
check("L01 labels:false 지난 카드: 금 17:00 → 목 18:00 = {+23:00, ''} over / 토 10:00 → 목 18:00 = {+1d 16h, ''}",
  [cdText(D26(9,18,17), D26(9,17,18), NOL), urgency(D26(9,18,17), D26(9,17,18), NOL), cdText(D26(9,19,10), D26(9,17,18), NOL)],
  [{ t:"+23:00", l:"" }, "over", { t:"+1d 16h", l:"" }]);
// L02 멈춘 카드 — '업무 후'·'주말'·'추석' 이 사라지고 숫자·색은 그대로(V13·V15·V16 과 같은 장면)
check("L02 labels:false 멈춘 카드: 금 20:00 → 월 12:00 {03:00:00,''} green / 토 10:00 → 월 10:00 {01:00:00,''} red / 9/24 11:00 → 9/28 10:00 {01:00:00,''} red",
  [cdText(D26(9,18,20), D26(9,21,12), NOL), urgency(D26(9,18,20), D26(9,21,12), NOL),
   cdText(D26(9,19,10), D26(9,21,10), NOL), urgency(D26(9,19,10), D26(9,21,10), NOL),
   cdText(D26(9,24,11), D26(9,28,10), NOL), urgency(D26(9,24,11), D26(9,28,10), NOL)],
  [{ t:"03:00:00", l:"" }, "green", { t:"01:00:00", l:"" }, "red", { t:"01:00:00", l:"" }, "red"]);
// L03 흐르는 카드 — 원래도 '' 인 곳은 그대로(V06·X02), compact 멈춤(E29 '업무 전')도 ''
check("L03 labels:false 흐르는 카드: 금 17:00 → 월 10:00 {02:00:00,''} / 금 19:00 → 오늘 21:00 {02:00:00,''} / compact 월 08:30 → 월 12:00 {03:00,''}",
  [cdText(D26(9,18,17), D26(9,21,10), NOL), cdText(D26(9,18,19), D26(9,18,21), NOL), cdText(D26(9,21,8,30), D26(9,21,12), NOL, true)],
  [{ t:"02:00:00", l:"" }, { t:"02:00:00", l:"" }, { t:"03:00", l:"" }]);
// L04 옵션 꺼짐(cfg null) — labels 는 적용되지 않는다: 지난 카드 '초과' 유지, 미래 카드 ''
check("L04 cfg null: 지난 카드 '초과' 유지 / 미래 카드 ''", [cdText(D26(9,18,17), D26(9,17,18), null), cdText(D26(9,19,10), D26(9,21,10), null)], [{ t:"+23:00", l:"초과" }, { t:"2d 0h", l:"" }]);
// L04b makeCfg 가 만든 null(옵션 off + labels:false 저장) → 달력 경로 → '초과' 그대로
check("L04b makeCfg({on:false, labels:false}) = null → '초과' 유지", (() => { const c = makeCfg({on:false,start:"09:00",end:"18:00",labels:false}); return [c, cdText(D26(9,18,17), D26(9,17,18), c).l]; })(), [null, "초과"]);
// L04c 역전 cfg + labels:false → 달력 폴백 → '초과' 그대로(게이트가 null 정규화 뒤에 있다)
check("L04c 역전 cfg + labels:false → 달력('초과')", cdText(D26(9,18,17), D26(9,17,18), {startMin:1080,endMin:540,labels:false}), { t:"+23:00", l:"초과" });
// L05 parseWorkHours — labels 없음 → true / 'abc' → true / null → true / "false"(문자열) → true / false → false
check("L05 parseWorkHours labels 없음·'abc'·null·\"false\" = true, false = false",
  [parseWorkHours('{"on":true,"start":"09:00","end":"18:00"}').labels, parseWorkHours('{"on":true,"start":"09:00","end":"18:00","labels":"abc"}').labels,
   parseWorkHours('{"on":true,"start":"09:00","end":"18:00","labels":null}').labels, parseWorkHours('{"on":true,"start":"09:00","end":"18:00","labels":"false"}').labels,
   parseWorkHours('{"on":true,"start":"09:00","end":"18:00","labels":false}').labels],
  [true, true, true, true, false]);
// L05b 키 없음·형식 실패는 기본값 통째(labels:true) — 시간이 깨진 저장분의 labels:false 는 살아남지 않는다(폴백이 객체 단위)
check("L05b parseWorkHours(null)·형식 실패 → labels true", [parseWorkHours(null).labels, parseWorkHours('{"on":true,"start":"25:00","end":"18:00","labels":false}').labels], [true, true]);
// L06 makeCfg 가 labels 를 넘긴다 — 없으면 true, false 면 false, 'abc' 면 true
check("L06 makeCfg labels: 없음 → true / false → false / 'abc' → true",
  [makeCfg({on:true,start:"09:00",end:"18:00"}), makeCfg({on:true,start:"09:00",end:"18:00",labels:false}), makeCfg({on:true,start:"09:00",end:"18:00",labels:"abc"})],
  [{startMin:540,endMin:1080,labels:true}, {startMin:540,endMin:1080,labels:false}, {startMin:540,endMin:1080,labels:true}]);
// L07 pauseLabel 게이트 — 같은 순간 labels:true 는 '주말', false 는 ''
check("L07 pauseLabel 토 11:00: labels:true '주말' / false ''", [pauseLabel(D26(9,19,11), FAR, DEF), pauseLabel(D26(9,19,11), FAR, NOL)], ["주말", ""]);
// L08 불변식 — '지금' 6종 × 31일(하루 전 초과 포함) 30분 간격 전수: labels:false 는 t·urgency 가 labels:true 와 같고 l 은 항상 ''. 표식 표본이 충분한지도 본다
check("L08 31일 전수: labels:false ⇒ t·색 동일, l '' (표식 표본 > 100)",
  (() => { const nows = [D26(9,18,17), D26(9,18,10), D26(9,18,18,30), D26(9,19,8), D26(9,21,8,30), D26(9,24,11)]; let labeled = 0, bad = 0;
    for(const now of nows) for(let k=-48;k<=30*48;k++){ const ts = now + k*1800000;
      const a = cdText(now, ts, DEF), b = cdText(now, ts, NOL);
      if(a.l) labeled++;
      if(a.t !== b.t || b.l !== "" || urgency(now, ts, DEF) !== urgency(now, ts, NOL)) bad++; }
    return { bad, enough: labeled > 100 }; })(), { bad: 0, enough: true });
// L09 통계는 labels 를 모른다 — 3·2·4(E26 그대로)
check("L09 stats labels:false = 3·2·4(E26 그대로)", stats(D26(9,18,17), NINE, NOL), { r:3, o:2, g:4 });
// L10 labels:true 명시 = 기본과 동일(V13 장면 '업무 후')
check("L10 labels:true 명시 = 기본(업무 후)", cdText(D26(9,18,20), D26(9,21,12), { ...DEF, labels: true }), { t:"03:00:00", l:"업무 후" });

// ── 규칙 A 참조 구현(기각) — X12·X13 에서 "업무시간 안 마감이면 A = B" 를 확인하는 용도. bizleft.js 에는 없다. ──
function refA(nowTs, ts, cfg){
  if(!(ts > nowTs)) return ts - nowTs;
  const cur = new Date(nowTs); cur.setHours(0,0,0,0);
  const endDay = new Date(ts).setHours(0,0,0,0);
  let total = 0;
  for(let g = 0; g < 4000; g++){
    const y = cur.getFullYear(), mo = cur.getMonth(), d = cur.getDate();
    if(!isOffDay(y, mo, d)){
      const ws = new Date(y, mo, d, 0, cfg.startMin).getTime(), we = new Date(y, mo, d, 0, cfg.endMin).getTime();
      const a = Math.max(ws, nowTs), b = Math.min(we, ts);
      if(b > a) total += b - a;
    }
    if(cur.getTime() >= endDay) break;
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
