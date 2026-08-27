// ============================================================
//  Google Apps Script v54  (7칸 구조
//  - v54: ①【버그】READ_ROWS 미설정으로 150행 아래가 사라지던 것 수정.
//           ensureMembers 가 팀원 캐시(60초)에 적중하면 READ_ROWS 를 안 정하고 반환해,
//           doRead 가 기본값 150행으로 읽었다. 시트가 150행을 넘는 순간 그 아래 작업이
//           캐시 살아있는 동안만 간헐적으로 사라진다. → readGrid() 가 항상 확정한다.
//         ② ensureMembers 와 doRead 의 그리드 중복 읽기 제거 (요청당 1회).
//         ③ doRead 응답 20초 캐시 — 연속 호출에서 GAS 실행이 줄 서던 것 완화.
//         ④ ★쓰기(insert 포함) 전후로 읽기 캐시 무효화. ③을 넣으면 ④는 필수다.
//           안 하면 "완료 체크했는데 되돌아옴"이 생긴다.
//  (구) v53  (7칸 구조
//  - v53: detectStartCol 오탐 수정 — 이름을 시트 전체에서 부분검색하던 것을
//         '이름 행 형태'인 줄에서만 찾도록 제한.
//         제목 열(B/J)에는 작업 제목이 들어있어, 사람 이름이 제목에 포함되면
//         엉뚱한 단(좌/우)으로 판정될 수 있었음.
//         (예: 좌측 작업 제목 "박서준 요청 영상" → 우측 팀원 '박서준'을 좌측으로 오인)
//         1차: 장식 제거 후 이름과 '완전 일치'하는 줄 / 2차: 이름 행 형태인 줄만 부분일치
//  (구) v52  (7칸 구조
//  - v52: ★팀원 명단을 '🤖자동화' 시트 A열에서 읽음 (사람이 명시 관리)
//         · 이름·순서 = 자동화 시트 A열 (헤더·빈칸·이름 아닌 칸은 자동 무시)
//         · 좌/우 배치 = 업무현황 시트에서 이름 검색해 자동 판별 (이모지 무관)
//         · CacheService 60초 캐시 — 즉시 반영은 clearMemberCache() 실행
//         · action=members 는 업무현황 시트를 읽지 않음 (딸깍 확장용 경량 응답)
//         · 자동화 시트에 있는데 업무현황에 없는 이름은 warn 으로 보고
//         · 시트를 이름으로 찾음 → 탭 순서를 바꿔도 안전
//         · 폴백: 자동화 시트 → v51 자동감지 → 내장 목록
//  (구) v51  (7칸 구조 + 읽기/메모쓰기 API + 정렬 + 관리항목 하이퍼링크 + 딸깍 메모)
//  - v51: ★팀원 목록을 시트에서 자동 인식 (코드에 이름 고정 제거)
//         · 이름 행 판별: 체크칸 비어있음 + 링크 없음 + 📌 아님 + ▼ 아님 + 한글 2~4자
//         · 이름 주변 이모지/기호는 전부 무시 — "한글만 남기기" 방식
//           (예: "୨୧:⋆.˚✮박나진✮˚.⋆🩶" → "박나진")
//         · 요청마다 다시 스캔하므로 행이 밀리거나 줄어도 무관 (행 번호를 저장하지 않음)
//         · READ_ROWS를 실제 시트 크기 기준으로 자동 확장 (150행 고정 한계 제거)
//         · action=members 추가, read 응답에 memberNames 포함 → 앱/확장이 목록을 받아 씀
//         · 감지 실패 시에만 MEMBER_COLS_FALLBACK 사용 (앱이 멈추지 않도록)
//  - v50: 체크박스 색 통일 — 구글시트 체크박스는 그 셀의 "글자색"으로 그려진다.
//         insert의 윗행 서식복사(연한 회색 전염) + deleteTask의 값 시프트(서식은 안 따라감)
//         때문에 진한/연한 회색이 섞이던 문제 수정.
//         toggleDone·deleteTask·insert에서 체크열 글자색을 CHECK_FONT_COLOR로 고정.
//         ★이미 연해진 칸 복구: 편집기에서 fixCheckboxColors() 1회 실행.
//  - v49: 딸깍 insert의 메모(p.memo → F/N열) 기록 복원
//         (6/9에 추가됐던 기능이 v47/v48 제작 시 베이스 누락으로 빠졌던 것 — 병합 완료)
//  - v48: 리치텍스트 읽기를 전체 그리드(15열)에서 관리항목 열(B:C, J:K)로 축소
//         — v47에서 매 동기화마다 2,250셀을 읽던 비효율 제거 (동기화 속도 개선)
//  - v47: 관리항목 B/C의 셀 링크(Ctrl+K)·HYPERLINK 수식을 "[라벨](주소)"로 변환해 전달,
//         앱에서 보낸 "[라벨](주소)"는 다시 셀 링크(리치텍스트)로 복원 — 왕복 무손실
//  - v46: 기획안 링크가 http가 아니면(NAS 경로·텍스트) HYPERLINK 대신 일반 텍스트로 기록
//  - v45: 셀 정렬 명시 — B/J·C/D/K/L·G/O 및 기타=좌측, E/M·F/N=중앙
//         (딸깍 insert·addMemo 새 행, toggleDone·updateTask·updateMemo 적용)
//  - 좌측 A~G / 빈칸 H / 우측 I~O
//  - 상태(G/O) 열 추가됨 → 우측 시작열 8(H) → 9(I)로 이동
//  - 추가: doGet?action=read (영상작업+관리항목 분리, 7명 일괄)
//  - 추가: doPost action=updateMemo (관리항목 B/C 텍스트 되받아쓰기)
//  - v20: 마감일 읽기를 항상 "MM / DD" 문자열로 통일
//  - v21: scanDueDates() 마감일 현황 스캔(읽기전용)
//  - v22: convertDueDates(dryRun) 기존 텍스트 마감일 → 날짜값 변환
//  - v23: 신규 작업(insert) 마감일도 날짜값+"mm / dd"로 기록(캘린더 작동)
//  - v24: convertDueDates_RUN() 드롭다운 클릭으로 실제 변환
//  - v25: 읽기 video에 dueISO 추가
//  - v26: addMemo 동작 — 관리항목 추가
//  - v27: updateMemo try/catch+병합셀 앵커 기록
//  - v28: updateMemo 파라미터 b/c → memoB/memoC
//  - v29: addMemo 삽입행 C+D(K+L) 병합
//  - v30: (롤백) addMemo 다시 전체행 삽입
//  - v31: addMemo 항상 새행+📌
//  - v32: 간격행 위 삽입, 좌측정렬, alignMgmtLeft()
//  - v33: 빈칸 우선 채우기→새행+병합
//  - v34: (폐기) 특수블록 방어 로직
//  - v35: addMemo 항상 새행
//  - v36: 빈칸 우선→새행
//  - v37: 📌만 빈행 채우기, 양쪽 병합
//  - v38: 추가 위치 정리
//  - v39: toggleDone
//  - v40: deleteTask(칸 비우기)
//  - v41: deleteTask compaction(셀 단위)
//  - v42: deleteTask 일괄 최적화
//  - v43: updateDue
//  - v44: updateTask 액션 — 영상작업 제목(B/J)·요청글(C/K)·기획안(D/L)·마감(E/M) 일괄 기록, 영상행 가드
//  기존 전송(insert) 로직은 그대로 유지.
// ============================================================

// ── 팀원 목록 (v51: 시트에서 자동 인식) ─────────────────────
// 이름을 코드에 고정하지 않는다. 요청마다 시트를 훑어 아래 두 값을 채운다.
// 아래 FALLBACK은 감지가 완전히 실패했을 때만 쓰인다(앱 정지 방지용).
var MEMBER_COLS_FALLBACK = {
  "구민석": 1, "한영채": 9,
  "주지현": 1, "박나진": 9,
  "김본희": 1, "구정현": 9,
  "박지수": 1,
};
var MEMBER_COLS = {};   // ensureMembers()가 채움  { 이름: 시작열(1=좌 A~G, 9=우 I~O) }
var ALL_MEMBERS = [];   // ensureMembers()가 채움  (자동화 시트 A열 순서)
var MEMBER_WARN = [];   // 설정과 실제가 어긋난 경우 경고 메시지

// v52: 시트를 '이름 일부'로 찾는다 → 탭 순서를 바꾸거나 이모지를 바꿔도 안전
var CONFIG_SHEET_HINT = "자동화";   // 🤖자동화
var MAIN_SHEET_HINT   = "업무현황"; // 영상팀 업무현황
var MEMBER_CACHE_KEY  = "teamtimer_members_v1";
var MEMBER_CACHE_SEC  = 60;
var BOUNDARY_WORDS = ["참고사항", "공지사항", "팀 업무", "팀업무"];
// 이름 형태(한글 2~4자)지만 팀원이 아닌 것들
var NAME_EXCLUDE   = ["참고사항", "공지사항", "팀업무", "업무", "관리항목", "진행중", "완료", "작업내역"];
// offset 기준: CHECK=0 TITLE=1 LINK=2 PLAN=3 DATE=4 MEMO=5 STATUS=6
// 영상작업: B=제목 C=요청글링크 D=기획안링크 E=마감일 F=메모 G=상태
// 관리항목: B/C 자유 메모(C는 D와 병합된 넓은 칸, 값은 앵커 C에 있음)
var COL = { CHECK: 0, TITLE: 1, LINK: 2, PLAN: 3, DATE: 4, MEMO: 5, STATUS: 6 };

// v50: 체크박스 색상 통일값. 구글시트 체크박스는 그 셀의 "글자색"으로 렌더링되므로,
//      체크열(A/I) 글자색을 항상 이 값으로 고정하면 진한 회색으로 통일된다.
var CHECK_FONT_COLOR = "#434343";

// ── 팀원 자동 인식 (v51) ────────────────────────────────────
// 이름 셀에서 한글만 남긴다 — 이모지·기호·영문·숫자·공백 전부 제거.
// 장식 문자를 일일이 열거하는 방식은 새 장식이 나오면 뚫리므로 화이트리스트로 처리.
function hangulOnly(s) {
  return String(s == null ? "" : s).replace(/[^가-힣]/g, "");
}
function isPersonName(s) {
  return /^[가-힣]{2,4}$/.test(s);
}

// 시트 전체를 훑어 이름 행을 찾는다 → [{name, startCol, row}, ...]
function discoverMembers(data, formulas) {
  var out = [], blocks = [1, 9];
  for (var b = 0; b < blocks.length; b++) {
    var startCol = blocks[b], base = startCol - 1;
    for (var r = 0; r < data.length; r++) {
      var chkVal   = data[r][base + COL.CHECK];
      var chkRaw   = String(chkVal == null ? "" : chkVal);
      var titleRaw = String(data[r][base + COL.TITLE] == null ? "" : data[r][base + COL.TITLE]);
      var raw = chkRaw + " " + titleRaw;
      if (!raw.replace(/\s/g, "")) continue;                                  // 빈 행
      if (/HYPERLINK/i.test(String(formulas[r][base + COL.LINK])) ||
          /HYPERLINK/i.test(String(formulas[r][base + COL.PLAN]))) continue;   // 영상작업 행
      if (chkRaw.indexOf("📌") !== -1) continue;                     // 📌 관리항목 행
      if (chkVal === true || chkVal === false) continue;                       // 체크박스 행
      if (raw.indexOf("▼") !== -1) continue;                              // ▼ 구분선
      var name = hangulOnly(raw);
      if (NAME_EXCLUDE.indexOf(name) !== -1) continue;
      if (!isPersonName(name)) continue;
      out.push({ name: name, startCol: startCol, row: r + 1 });
    }
  }
  // 앱의 팀원 넘겨보기 순서와 동일하게: 행 오름차순 → 같은 행이면 좌측 먼저
  out.sort(function (a, b2) { return (a.row - b2.row) || (a.startCol - b2.startCol); });
  return out;
}

// ── 🤖자동화 시트 A열에서 팀원 이름 읽기 (v52) ──────────────
// 이름 형태(한글 2~4자)가 아닌 칸은 자동으로 건너뛴다 → 헤더/빈줄/메모가 있어도 안전.
function readMemberNamesFromConfig() {
  var cs = findSheetByHint(CONFIG_SHEET_HINT);
  if (!cs) return null;                       // 설정 시트 자체가 없음
  var last = cs.getLastRow();
  if (last < 1) return [];
  var vals = cs.getRange(1, 1, last, 1).getValues();   // A열만 — 매우 저렴
  var names = [], seen = {};
  for (var i = 0; i < vals.length; i++) {
    var n = hangulOnly(vals[i][0]);
    if (!isPersonName(n)) continue;
    if (NAME_EXCLUDE.indexOf(n) !== -1) continue;
    if (seen[n]) continue;
    seen[n] = 1;
    names.push(n);
  }
  return names;
}

// 이 줄이 '이름 행 형태'인가 — 작업 행/관리항목 행/구분선을 배제
// (제목 열에는 작업 제목이 들어있어 사람 이름이 섞여 있을 수 있으므로 반드시 걸러야 함)
function isNameRowShape(allData, formulas, r, base) {
  var chkVal = allData[r][base + COL.CHECK];
  if (chkVal === true || chkVal === false) return false;                       // 체크박스 행
  if (String(chkVal == null ? "" : chkVal).indexOf("📌") !== -1) return false; // 📌 관리항목
  if (/HYPERLINK/i.test(String(formulas[r][base + COL.LINK])) ||
      /HYPERLINK/i.test(String(formulas[r][base + COL.PLAN]))) return false;   // 영상작업 행
  var raw = String(chkVal == null ? "" : chkVal) + String(allData[r][base + COL.TITLE] == null ? "" : allData[r][base + COL.TITLE]);
  if (raw.indexOf("▼") !== -1) return false;                              // ▼ 구분선
  return true;
}

// 업무현황 시트에서 이 이름이 어느 단에 있는지 (1=좌 A~G, 9=우 I~O, 0=못찾음)
// v53: 이름 행 형태인 줄에서만 찾는다. 1차 완전일치 → 2차 부분일치.
function detectStartCol(allData, formulas, name) {
  var bases = [0, 8];  // 좌 A, 우 I
  // 1차: 장식(이모지·기호)만 걷어내면 이름과 정확히 같은 줄
  for (var r = 0; r < allData.length; r++) {
    for (var b = 0; b < bases.length; b++) {
      var base = bases[b];
      if (!isNameRowShape(allData, formulas, r, base)) continue;
      var raw = String(allData[r][base + COL.CHECK] == null ? "" : allData[r][base + COL.CHECK]) +
                String(allData[r][base + COL.TITLE] == null ? "" : allData[r][base + COL.TITLE]);
      if (hangulOnly(raw) === name) return base + 1;
    }
  }
  // 2차: 이름 뒤에 직함 등이 붙은 경우 대비 — 이름 행 형태인 줄에서만 부분일치
  for (var r2 = 0; r2 < allData.length; r2++) {
    for (var b2 = 0; b2 < bases.length; b2++) {
      var base2 = bases[b2];
      if (!isNameRowShape(allData, formulas, r2, base2)) continue;
      var raw2 = String(allData[r2][base2 + COL.CHECK] == null ? "" : allData[r2][base2 + COL.CHECK]) +
                 String(allData[r2][base2 + COL.TITLE] == null ? "" : allData[r2][base2 + COL.TITLE]);
      if (raw2.indexOf(name) !== -1) return base2 + 1;
    }
  }
  return 0;
}

// 이번 실행에서 1회만 계산. MEMBER_COLS / ALL_MEMBERS / MEMBER_WARN / READ_ROWS 를 채운다.
function ensureMembers(sheet) {
  if (ALL_MEMBERS.length) return;

  // ① 캐시 (60초)
  try {
    var cached = CacheService.getScriptCache().get(MEMBER_CACHE_KEY);
    if (cached) {
      var o = JSON.parse(cached);
      if (o && o.order && o.order.length) {
        ALL_MEMBERS = o.order; MEMBER_COLS = o.cols; MEMBER_WARN = o.warn || [];
        return;
      }
    }
  } catch (e) { /* 캐시 없으면 그냥 진행 */ }

  var order = [], cols = {}, warn = [];
  var names = null;
  try { names = readMemberNamesFromConfig(); } catch (e1) { names = null; }

  try {
    var g = readGrid(sheet);          // v54: 요청당 1회만 읽는다 (READ_ROWS 도 여기서 확정)
    var data = g.data, forms = g.forms;

    // ② 자동화 시트 명단 기준 (순서도 그대로 사용)
    if (names && names.length) {
      for (var i = 0; i < names.length; i++) {
        var sc = detectStartCol(data, forms, names[i]);
        if (!sc) { warn.push(names[i] + " — 업무현황 시트에서 찾을 수 없어 제외됨"); continue; }
        order.push(names[i]); cols[names[i]] = sc;
      }
    }

    // ③ 설정 시트가 없거나 쓸 이름이 하나도 없으면 → 자동 감지(v51)
    if (!order.length) {
      var found = discoverMembers(data, forms);
      for (var j = 0; j < found.length; j++) { order.push(found[j].name); cols[found[j].name] = found[j].startCol; }
      if (order.length) warn.push("자동화 시트를 읽지 못해 업무현황 시트 자동 감지로 대체함");
    }
  } catch (e2) { /* ④로 */ }

  // ④ 최종 폴백 — 내장 목록 (앱이 멈추지 않도록)
  if (!order.length) {
    for (var k in MEMBER_COLS_FALLBACK) { order.push(k); cols[k] = MEMBER_COLS_FALLBACK[k]; }
    warn.push("시트 접근 실패 — 내장 목록 사용");
  }

  ALL_MEMBERS = order; MEMBER_COLS = cols; MEMBER_WARN = warn;
  try {
    CacheService.getScriptCache().put(MEMBER_CACHE_KEY,
      JSON.stringify({ order: order, cols: cols, warn: warn }), MEMBER_CACHE_SEC);
  } catch (e3) {}
}

// 이름만 필요한 클라이언트(딸깍 확장)용 — 업무현황 시트를 읽지 않는다.
function membersLight() {
  try {
    var cached = CacheService.getScriptCache().get(MEMBER_CACHE_KEY);
    if (cached) {
      var o = JSON.parse(cached);
      if (o && o.order && o.order.length) return respond({ ok: true, members: o.order, source: "cache" });
    }
  } catch (e) {}
  var names = null;
  try { names = readMemberNamesFromConfig(); } catch (e2) {}
  if (names && names.length) return respond({ ok: true, members: names, source: "config" }); // A열만 읽고 끝
  ensureMembers();
  return respond({ ok: true, members: ALL_MEMBERS, cols: MEMBER_COLS, warn: MEMBER_WARN, source: "scan" });
}

// 시트를 고친 뒤 즉시 반영하고 싶을 때 편집기에서 실행
function clearMemberCache() {
  try {
    CacheService.getScriptCache().remove(MEMBER_CACHE_KEY);
    Logger.log("✅ 팀원 목록 캐시를 비웠습니다. 다음 요청부터 시트를 다시 읽습니다.");
  } catch (e) { Logger.log("캐시 비우기 실패: " + e); }
}

// 현재 인식 상태 확인 (편집기 실행용)
function testMemberList() {
  clearMemberCache();
  ALL_MEMBERS = []; MEMBER_COLS = {}; MEMBER_WARN = [];
  var cs = findSheetByHint(CONFIG_SHEET_HINT);
  var ms = findSheetByHint(MAIN_SHEET_HINT);
  Logger.log("자동화 시트: " + (cs ? "「" + cs.getName() + "」" : "❌ 못찾음"));
  Logger.log("업무현황 시트: " + (ms ? "「" + ms.getName() + "」" : "❌ 못찾음 (첫 시트로 폴백)"));
  Logger.log("자동화 A열 원본: " + JSON.stringify(readMemberNamesFromConfig()));
  ensureMembers();
  Logger.log("");
  Logger.log("════ 최종 팀원 " + ALL_MEMBERS.length + "명 ════");
  for (var i = 0; i < ALL_MEMBERS.length; i++) {
    var n = ALL_MEMBERS[i];
    Logger.log("  " + (i + 1) + ". " + n + "  (" + (MEMBER_COLS[n] === 1 ? "좌측 A~G" : "우측 I~O") + ")");
  }
  if (MEMBER_WARN.length) {
    Logger.log("");
    Logger.log("⚠ 경고");
    for (var w = 0; w < MEMBER_WARN.length; w++) Logger.log("  - " + MEMBER_WARN[w]);
  } else {
    Logger.log("");
    Logger.log("★ 경고 없음 — 정상");
  }
}

// ── 관리항목 하이퍼링크 변환 (v47) ───────────────────────────
// 읽기: 셀의 링크(Ctrl+K 리치텍스트 / =HYPERLINK 수식)를 "[라벨](주소)" 텍스트로.
//       링크가 없으면 일반 텍스트 그대로(이미 [라벨](주소)로 써둔 셀도 그대로 통과).
function cellToMd(rich, plain, formula) {
  plain = String(plain == null ? "" : plain).trim();
  // 1) =HYPERLINK("url","label") / =HYPERLINK("url";"label") 수식
  var m = String(formula || "").match(/^=HYPERLINK\(\s*"([^"]+)"\s*[,;]\s*"([^"]*)"\s*\)/i);
  if (m) return "[" + (m[2] || plain || m[1]) + "](" + m[1] + ")";
  if (!rich) return plain;
  try {
    // 2) 부분/전체 링크(Ctrl+K): 링크 달린 구간만 [라벨](주소)로 감싸기
    var runs = rich.getRuns();
    var out = "", hasLink = false;
    for (var i = 0; i < runs.length; i++) {
      var t = runs[i].getText();
      var u = runs[i].getLinkUrl();
      if (u) { hasLink = true; out += "[" + t + "](" + u + ")"; }
      else out += t;
    }
    if (hasLink) return out.trim();
    // 3) 런 정보 없이 셀 전체에 링크가 걸린 경우
    var u0 = (typeof rich.getLinkUrl === "function") ? rich.getLinkUrl() : null;
    if (u0 && plain) return "[" + plain + "](" + u0 + ")";
    return plain;
  } catch (err) { return plain; }
}

// 쓰기: "[라벨](주소)"가 들어오면 셀에 실제 링크(리치텍스트)로 기록 → 시트에서도 링크로 보임.
//       링크 패턴이 없으면 일반 setValue.
function setCellSmart(cell, val) {
  var s = String(val == null ? "" : val);
  var re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  if (!re.test(s)) { cell.setValue(s); return; }
  re.lastIndex = 0;
  var display = "", spans = [], m2, last = 0;
  while ((m2 = re.exec(s)) !== null) {
    display += s.slice(last, m2.index);
    spans.push({ start: display.length, end: display.length + m2[1].length, url: m2[2] });
    display += m2[1];
    last = re.lastIndex;
  }
  display += s.slice(last);
  try {
    var b = SpreadsheetApp.newRichTextValue().setText(display);
    spans.forEach(function (sp) { b.setLinkUrl(sp.start, sp.end, sp.url); });
    cell.setRichTextValue(b.build());
  } catch (err) { cell.setValue(s); } // 실패 시 원문 텍스트로 폴백
}

// ── 정렬 기본값 ─────────────────────────────────────────────
// 한 단(A~G / I~O) 기준: 대부분 좌측정렬, E/M(마감)·F/N(메모)만 중앙정렬.
// (B/J·C/D/K/L·G/O 및 언급 안 한 칸 = 좌측 / E·M·F·N = 중앙)
function applyDefaultAlignment(sheet, row, startCol) {
  sheet.getRange(row, startCol, 1, 7).setHorizontalAlignment("left");        // A~G / I~O 기본 좌측
  sheet.getRange(row, startCol + COL.DATE).setHorizontalAlignment("center"); // E / M (마감)
  sheet.getRange(row, startCol + COL.MEMO).setHorizontalAlignment("center"); // F / N (메모)
}
var READ_ROWS = 150; // 한 번에 읽는 행 수 — ensureMembers()가 실제 시트 크기로 자동 확장
var READ_COLS = 15;  // A~O

// ── 그리드 1회 읽기 (v54) ────────────────────────────────────
// 요청 1건에서 A~O 전체를 딱 한 번만 읽는다.
// 예전엔 ensureMembers 와 doRead 가 같은 범위를 각각 읽어 2배로 들었다.
var _grid = null;
function readGrid(sheet) {
  if (_grid) return _grid;
  sheet = sheet || getSheet();
  // ★READ_ROWS 는 반드시 여기서 정한다. 예전엔 ensureMembers 안에서만 정해서,
  //   팀원 캐시(60초)가 살아 있으면 READ_ROWS 가 기본값 150 인 채로 doRead 가 읽었다.
  //   시트가 150행을 넘는 순간 그 아래 작업이 조용히 사라진다(2026-08-27 실측 93행).
  READ_ROWS = Math.max(150, sheet.getLastRow() + 20);
  var rng = sheet.getRange(1, 1, READ_ROWS, READ_COLS);
  _grid = { data: rng.getValues(), forms: rng.getFormulas() };
  return _grid;
}

// ── 읽기 응답 캐시 (v54) ─────────────────────────────────────
// ★쓰기가 일어나면 반드시 버려야 한다. 안 버리면 "완료 체크했는데 되돌아옴"이 생긴다.
var READ_CACHE_KEY = "teamtimer_read_v1";
var READ_CACHE_SEC = 20;
function bustReadCache() {
  try { CacheService.getScriptCache().remove(READ_CACHE_KEY); } catch (e) {}
}

// ── 공통 헬퍼 ───────────────────────────────────────────────
function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function findSheetByHint(hint) {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getName()).indexOf(hint) !== -1) return sheets[i];
  }
  return null;
}

// v52: 첫 번째 시트가 아니라 이름으로 찾는다.
// (자동화 시트를 맨 앞으로 옮겨도 앱이 깨지지 않도록)
function getSheet() {
  return findSheetByHint(MAIN_SHEET_HINT) || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

// =HYPERLINK("url","label") 에서 url만 추출
function extractUrl(formula) {
  var m = String(formula).match(/HYPERLINK\(\s*"([^"]+)"/i);
  return m ? m[1] : "";
}

// 마감일을 항상 "MM / DD" 문자열로 통일.
// - Date 객체(좌측 E열에 날짜형으로 저장된 경우) → 월/일 추출
// - 이미 "06 / 15" 같은 텍스트면 공백만 정리해 그대로
// - 빈 값은 ""
function normalizeDue(val) {
  if (val instanceof Date) {
    var mm = ("0" + (val.getMonth() + 1)).slice(-2);
    var dd = ("0" + val.getDate()).slice(-2);
    return mm + " / " + dd;
  }
  var s = String(val).trim();
  if (!s) return "";
  // "2026-06-04" / "6/4" 등도 표준화
  var m = s.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*$/);
  if (m) return ("0" + m[1]).slice(-2) + " / " + ("0" + m[2]).slice(-2);
  return s;
}

// 마감일을 기계용 "YYYY-MM-DD"로. 날짜객체면 그대로, 텍스트면 연도 추정.
// (시트가 이제 진짜 날짜라 대부분 Date 경로. 텍스트는 안전 폴백)
function toISO(val) {
  var d = null;
  if (val instanceof Date) {
    d = val;
  } else {
    var s = String(val).trim();
    var m = s.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/);
    if (m) {
      var now = new Date(), y = now.getFullYear();
      var mon = parseInt(m[1], 10), day = parseInt(m[2], 10);
      var cand = new Date(y, mon - 1, day);
      var diff = (cand.getTime() - now.getTime()) / 86400000;
      if (diff > 182) y -= 1; else if (diff < -182) y += 1;
      d = new Date(y, mon - 1, day);
    }
  }
  if (!d) return "";
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

// 이름 행 탐색 (1-based). 데코 이름("💎한영채💎" 등)도 indexOf로 매칭.
function findNameRow(allData, member, startCol) {
  for (var r = 0; r < allData.length; r++) {
    if (String(allData[r][startCol - 1]).indexOf(member) !== -1 ||
        String(allData[r][startCol]).indexOf(member) !== -1) {
      return r + 1; // 1-based
    }
  }
  return -1;
}

// 섹션 끝(=다음 섹션 시작 행, 1-based) 탐색.
// 같은 단(좌/우)의 다른 팀원 이름 또는 구분어를 만나면 그 행이 경계.
function findSectionEnd(allData, member, startCol, nameRow) {
  var c0 = startCol - 1; // 체크열(0-based)
  var c1 = startCol;     // 제목열(0-based)
  for (var r = nameRow; r < allData.length; r++) { // r=0-based → 시트행 r+1 (이름행 다음부터)
    var combined = String(allData[r][c0]) + String(allData[r][c1]);
    for (var k = 0; k < BOUNDARY_WORDS.length; k++) {
      if (combined.indexOf(BOUNDARY_WORDS[k]) !== -1) return r + 1;
    }
    for (var m = 0; m < ALL_MEMBERS.length; m++) {
      var mm = ALL_MEMBERS[m];
      if (mm === member) continue;
      if (MEMBER_COLS[mm] !== startCol) continue; // 같은 단만 경계로 인정
      if (combined.indexOf(mm) !== -1) return r + 1;
    }
  }
  return allData.length + 1;
}

// ── 읽기: 한 팀원의 영상작업/관리항목 분리 ────────────────────
function buildMemberData(allData, formulas, richAt, member) {
  var startCol = MEMBER_COLS[member];
  var side     = (startCol === 1) ? "left" : "right";
  var base     = startCol - 1; // 0-based 시작열

  var nameRow = findNameRow(allData, member, startCol);
  if (nameRow === -1) {
    return { name: member, side: side, error: "이름 못찾음", video: [], mgmt: [] };
  }
  var endRow  = findSectionEnd(allData, member, startCol, nameRow); // 1-based 다음 섹션 시작
  var lastRow = endRow - 1;                                         // 1-based 섹션 마지막 행

  var video = [], mgmt = [];

  // 이름 행 다음 ~ 섹션 마지막 행까지 (0-based 인덱스 r2, 시트행 r2+1)
  for (var r2 = nameRow; r2 <= lastRow - 1; r2++) {
    if (r2 < 0 || r2 >= allData.length) break;
    var sheetRow = r2 + 1;
    var row = allData[r2];

    var a = String(row[base + COL.CHECK]);
    var b = String(row[base + COL.TITLE]);
    var c = String(row[base + COL.LINK]);

    // ▼ 업무 구분선 행은 건너뜀 (작업도 관리항목도 아님)
    var marker = a + b + c;
    if (marker.indexOf("▼") !== -1 && marker.indexOf("업무") !== -1) continue;

    var done = (row[base + COL.CHECK] === true);

    // 영상작업 판정: C(요청글) 또는 D(기획안)에 HYPERLINK 수식이 있으면 작업.
    // (요청글 링크는 항상 존재 → 신뢰 가능한 신호. 관리항목은 plain 텍스트라 수식 없음)
    var linkF = String(formulas[r2][base + COL.LINK]);
    var planF = String(formulas[r2][base + COL.PLAN]);
    var hasLink = /HYPERLINK/i.test(linkF) || /HYPERLINK/i.test(planF);

    if (hasLink) {
      var reqUrl  = extractUrl(linkF);
      var planUrl = extractUrl(planF);
      var planVal = planUrl || String(row[base + COL.PLAN]).trim(); // plain 텍스트 폴백
      var item = {
        row:         sheetRow,
        done:        done,
        title:       b.trim(),
        requestLink: reqUrl,
        planLink:    planVal,
        dueDate:     normalizeDue(row[base + COL.DATE]),
        dueISO:      toISO(row[base + COL.DATE]),
        memo:        String(row[base + COL.MEMO]).trim(),
        status:      String(row[base + COL.STATUS]).trim()
      };
      video.push(item);
    } else {
      // v47: 셀 링크(Ctrl+K)·HYPERLINK 수식을 [라벨](주소)로 변환해 전달
      var bVal = cellToMd(richAt(r2, base + COL.TITLE), b, String(formulas[r2][base + COL.TITLE]));
      var cVal = cellToMd(richAt(r2, base + COL.LINK),  c, "");
      if (!bVal && !cVal) continue; // 빈 행 스킵
      mgmt.push({ row: sheetRow, done: done, b: bVal, c: cVal });
    }
  }

  return { name: member, side: side, nameRow: nameRow, video: video, mgmt: mgmt };
}

function doRead(e) {
  var only0 = (e && e.parameter && e.parameter.member) ? e.parameter.member : "";
  // v54: 전체 읽기만 캐시한다(앱이 쓰는 경로). member 지정은 진단용이라 통과.
  if (!only0) {
    try {
      var hit = CacheService.getScriptCache().get(READ_CACHE_KEY);
      if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
    } catch (e0) {}
  }
  var sheet    = getSheet();
  ensureMembers(sheet); // v51: 팀원 목록/읽기범위 확정
  var g        = readGrid(sheet);   // v54: ensureMembers 가 이미 읽었으면 그걸 재사용
  var allData  = g.data;
  var formulas = g.forms;
  // v48: 리치텍스트는 관리항목이 쓰는 열만 읽음 (B:C = 2~3열, J:K = 10~11열)
  //      전체 그리드(15열) 읽기는 셀당 비용이 커서 동기화를 느리게 했음
  var richBC = sheet.getRange(1, 2, READ_ROWS, 2).getRichTextValues();  // B:C
  var richJK = sheet.getRange(1, 10, READ_ROWS, 2).getRichTextValues(); // J:K
  var richAt = function (r, c) { // 0-based 행/열(전체 그리드 기준) → 리치텍스트 또는 null
    if (c === 1 || c === 2) return richBC[r] ? richBC[r][c - 1] : null;
    if (c === 9 || c === 10) return richJK[r] ? richJK[r][c - 9] : null;
    return null;
  };

  var only = (e && e.parameter && e.parameter.member) ? e.parameter.member : "";
  var list = only ? [only] : ALL_MEMBERS;

  var members = [];
  for (var i = 0; i < list.length; i++) {
    if (!MEMBER_COLS[list[i]]) continue;
    members.push(buildMemberData(allData, formulas, richAt, list[i]));
  }
  // v51: memberNames = 시트에서 인식한 팀원 이름 목록(순서 포함). 앱/확장이 이걸로 목록을 구성.
  var payload = JSON.stringify({ ok: true, members: members, memberNames: ALL_MEMBERS, warn: MEMBER_WARN });
  if (!only0) {
    // CacheService 는 키당 100KB 한도 — 넘으면 조용히 실패하므로 미리 거른다.
    try { if (payload.length < 90000) CacheService.getScriptCache().put(READ_CACHE_KEY, payload, READ_CACHE_SEC); } catch (e4) {}
  }
  return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
}

// ── 쓰기: 관리항목 B/C 텍스트 되받아쓰기 ─────────────────────
function updateMemo(p) {
  var target = p.targetMember || "";
  var row    = parseInt(p.row, 10);
  var startCol = MEMBER_COLS[target];
  if (!startCol) return respond({ ok: false, error: "팀원 이름 없음: " + target });
  if (!row || row < 1) return respond({ ok: false, error: "행번호 오류: " + p.row });

  var sheet = getSheet();

  // 안전장치: 이 행이 영상작업(링크 수식 보유)이면 거부 → 관리항목만 수정 허용
  var linkF = sheet.getRange(row, startCol + COL.LINK).getFormula();
  var planF = sheet.getRange(row, startCol + COL.PLAN).getFormula();
  if (/HYPERLINK/i.test(linkF) || /HYPERLINK/i.test(planF)) {
    return respond({ ok: false, error: "이 행은 영상작업(링크 보유)이라 메모 수정 대상이 아닙니다. row=" + row });
  }

  // 파라미터 이름: memoB/memoC 사용 (구글이 POST 파라미터 'c'를 차단 → 이름 변경).
  // 옛 b/c도 호환 수용.
  var bv = (typeof p.memoB !== "undefined") ? p.memoB : p.b;
  var cv = (typeof p.memoC !== "undefined") ? p.memoC : p.c;
  var hasB = (typeof bv !== "undefined");
  var hasC = (typeof cv !== "undefined");
  if (!hasB && !hasC) return respond({ ok: false, error: "수정할 값이 없습니다." });

  try {
    if (hasB) writeMemoCell(sheet, row, startCol + COL.TITLE, bv); // B
    if (hasC) writeMemoCell(sheet, row, startCol + COL.LINK, cv);  // C
    SpreadsheetApp.flush();
  } catch (err) {
    return respond({ ok: false, error: "쓰기 실패: " + (err && err.message ? err.message : String(err)) });
  }

  return respond({ ok: true, message: target + " " + row + "행 메모 수정됨", row: row });
}

// 셀에 안전하게 쓰기. 병합 영역이면 좌상단 앵커에 기록(부분 병합 셀 쓰기 에러 방지).
function writeMemoCell(sheet, row, col, val) {
  var cell = sheet.getRange(row, col);
  if (cell.isPartOfMerge()) {
    var mr = cell.getMergedRanges();
    if (mr && mr.length) cell = sheet.getRange(mr[0].getRow(), mr[0].getColumn());
  }
  setCellSmart(cell, val); // v47: [라벨](주소)는 셀 링크로 복원
  cell.setHorizontalAlignment("left"); // 관리항목 B/C 좌측정렬
}

// ── 추가: 관리 항목 새로 만들기 ──────────────────────────────
// 관리 구간(이름행 ~ ▼업무 위)에서 빈 B/C 칸을 먼저 채우고,
// 꽉 차면 ▼업무 바로 위에 행을 삽입하고 체크열(A/I)에 📌 + B에 텍스트.
function addMemo(p) {
  var target = p.targetMember || "";
  var text   = (p.text == null ? "" : String(p.text));
  var startCol = MEMBER_COLS[target];
  if (!startCol) return respond({ ok: false, error: "팀원 이름 없음: " + target });
  if (!text.trim()) return respond({ ok: false, error: "빈 텍스트" });

  var sheet    = getSheet();
  var rng      = sheet.getRange(1, 1, READ_ROWS, READ_COLS);
  var allData  = rng.getValues();
  var formulas = rng.getFormulas();
  var base     = startCol - 1;

  var nameRow = findNameRow(allData, target, startCol);
  if (nameRow === -1) return respond({ ok: false, error: target + " 이름 못찾음" });
  var endRow = findSectionEnd(allData, target, startCol, nameRow); // 1-based 다음 섹션 시작

  // ▼업무 구분선 행 탐색 (1-based)
  var dividerRow = -1;
  for (var r = nameRow; r < endRow - 1; r++) { // 0-based, 시트행 r+1
    var s = String(allData[r][base + COL.CHECK]) + String(allData[r][base + COL.TITLE]) + String(allData[r][base + COL.LINK]);
    if (s.indexOf("▼") !== -1 && s.indexOf("업무") !== -1) { dividerRow = r + 1; break; }
  }

  // 관리 구간 마지막 행(1-based)
  var regionEnd;
  if (dividerRow !== -1) {
    regionEnd = dividerRow - 1;
  } else {
    // 구분선 없으면: 첫 영상작업(HYPERLINK) 행 직전까지
    regionEnd = endRow - 1;
    for (var r2 = nameRow; r2 < endRow - 1; r2++) {
      if (/HYPERLINK/i.test(String(formulas[r2][base + COL.LINK])) ||
          /HYPERLINK/i.test(String(formulas[r2][base + COL.PLAN]))) { regionEnd = r2; break; }
    }
  }

  // 1) 빈 칸 우선: 관리행에서 B 또는 C가 비어있으면 거기 채움(B 먼저).
  //    완전히 빈 행(간격)·구분선·영상작업 행은 제외.
  for (var fr = nameRow + 1; fr <= regionEnd; fr++) {
    var fi = fr - 1;
    var fHasLink = /HYPERLINK/i.test(String(formulas[fi][base + COL.LINK])) ||
                   /HYPERLINK/i.test(String(formulas[fi][base + COL.PLAN]));
    if (fHasLink) continue;
    var fb = String(allData[fi][base + COL.TITLE]).trim();
    var fc = String(allData[fi][base + COL.LINK]).trim();
    var fchk = String(allData[fi][base + COL.CHECK]).trim();
    var fs = fchk + fb + fc;
    if (fs.indexOf("▼") !== -1 && fs.indexOf("업무") !== -1) continue; // 구분선
    if (!fb && !fc && !fchk) continue; // 체크칸까지 완전히 빈 행(간격) → 채우지 않음
    // (📌만 있고 B·C 빈 행은 "빈 항목 행"으로 보고 아래에서 B부터 채움)
    if (!fb) {
      var fbc = sheet.getRange(fr, startCol + COL.TITLE);
      setCellSmart(fbc, text); fbc.setHorizontalAlignment("left"); // v47: 링크 복원
      SpreadsheetApp.flush();
      return respond({ ok: true, row: fr, col: "b", inserted: false });
    }
    if (!fc) {
      var fcc = sheet.getRange(fr, startCol + COL.LINK);
      setCellSmart(fcc, text); fcc.setHorizontalAlignment("left"); // v47: 링크 복원
      SpreadsheetApp.flush();
      return respond({ ok: true, row: fr, col: "c", inserted: false });
    }
  }

  // 2) 빈 칸 없음 → 마지막 항목 바로 다음 행에 추가. ▼업무와는 항상 ≥1칸 띄움.
  // 마지막 항목 행 찾기(체크/B/C 중 뭐라도 있는 마지막 행, 구분선·영상작업 제외)
  var lastItem = nameRow;
  for (var lr = nameRow + 1; lr <= regionEnd; lr++) {
    var li = lr - 1;
    var lHasLink = /HYPERLINK/i.test(String(formulas[li][base + COL.LINK])) ||
                   /HYPERLINK/i.test(String(formulas[li][base + COL.PLAN]));
    if (lHasLink) continue;
    var lb = String(allData[li][base + COL.TITLE]).trim();
    var lc = String(allData[li][base + COL.LINK]).trim();
    var lk = String(allData[li][base + COL.CHECK]).trim();
    var ls = lk + lb + lc;
    if (ls.indexOf("▼") !== -1 && ls.indexOf("업무") !== -1) continue; // 구분선
    if (lb || lc || lk) lastItem = lr; // 내용 있는 행
  }

  var newRow, inserted = false;
  if (dividerRow === -1) {
    newRow = lastItem + 1;
    sheet.insertRowBefore(newRow); inserted = true;
  } else {
    var placeRow = lastItem + 1;          // 마지막 항목 바로 다음
    var emptyBelow = dividerRow - placeRow; // placeRow부터 ▼업무 직전까지 빈 행 수
    if (emptyBelow >= 2) {
      // 빈 행이 넉넉 → 그 자리에 그냥 기록(삽입 없음). 아래에 ≥1칸 남음.
      newRow = placeRow; // 삽입 안 함 → 반대편 단 안 건드림
    } else if (emptyBelow === 1) {
      // 빈 행이 1줄(=간격)뿐 → 거기 쓰면 간격 사라짐. 행을 끼워 간격 유지.
      newRow = placeRow;
      sheet.insertRowBefore(newRow); inserted = true;
    } else {
      // 항목이 ▼업무에 붙어있음(간격 0) → 항목행 + 간격행 삽입.
      sheet.insertRowBefore(dividerRow);     // 항목 자리
      newRow = dividerRow;
      sheet.insertRowBefore(dividerRow + 1); // 간격 자리 (▼업무는 +2로 밀림)
      inserted = true;
    }
  }

  // 이 팀원 칸만 정리 후 📌 + 텍스트 (반대편 단은 손대지 않음)
  sheet.getRange(newRow, startCol, 1, 7).clearContent().clearDataValidations();
  sheet.getRange(newRow, startCol + COL.CHECK).setValue("📌");
  var titleCell = sheet.getRange(newRow, startCol + COL.TITLE);
  setCellSmart(titleCell, text); // v47: 링크 복원
  titleCell.setHorizontalAlignment("left"); // 좌측정렬
  // C+D 병합. 행을 새로 삽입한 경우엔 좌/우 둘 다 빈 행이므로 양쪽 정돈,
  // 기존 빈 행에 기록한 경우(삽입 X)엔 반대편엔 내용이 있을 수 있으니 내 단만.
  var sides = inserted ? [1, 9] : [startCol];
  sides.forEach(function (sc) {
    var m = sheet.getRange(newRow, sc + COL.LINK, 1, 2);
    try { if (m.isPartOfMerge()) m.breakApart(); m.merge(); } catch (e) {}
    m.setHorizontalAlignment("left");
  });
  // 새 관리행 정렬 기본값: 좌측 기본 + E/M·F/N 중앙 (병합된 C/D 좌측 유지)
  applyDefaultAlignment(sheet, newRow, startCol);
  sheet.getRange(newRow, startCol + COL.LINK, 1, 2).setHorizontalAlignment("left"); // 병합 C/D 좌측 재확인
  SpreadsheetApp.flush();
  return respond({ ok: true, row: newRow, col: "b", inserted: inserted });
}

// ── 완료 토글: 체크박스(A/I) + 상태(G/O) 기록 ──────────────
// p: { member, row(1-based), done("1"/"0"), status(텍스트) }
function toggleDone(p) {
  var target = p.member || p.targetMember || "";
  var row    = parseInt(p.row, 10);
  var done   = (p.done === "1" || p.done === "true" || p.done === true);
  var status = (p.status == null ? "" : String(p.status));
  var startCol = MEMBER_COLS[target];
  if (!startCol)        return respond({ ok: false, error: "팀원 이름 없음: " + target });
  if (!row || row < 1)  return respond({ ok: false, error: "행 번호 오류: " + p.row });

  var sheet = getSheet();
  // 가드: 이 행이 영상작업 행인지(C/D에 HYPERLINK) 확인 → 이름행/관리행 보호
  var f = sheet.getRange(row, startCol + COL.LINK, 1, 2).getFormulas()[0];
  var isVideo = /HYPERLINK/i.test(String(f[0])) || /HYPERLINK/i.test(String(f[1]));
  if (!isVideo) return respond({ ok: false, error: "영상작업 행이 아님(보호): row " + row });

  try {
    var chkCell = sheet.getRange(row, startCol + COL.CHECK);
    chkCell.setValue(done);                 // 체크박스 A/I
    chkCell.setFontColor(CHECK_FONT_COLOR); // v50: 체크박스 색 통일
    var statusCell = sheet.getRange(row, startCol + COL.STATUS); // 상태 G/O
    statusCell.setValue(status);
    statusCell.setHorizontalAlignment("left"); // G/O 좌측정렬
    SpreadsheetApp.flush();
  } catch (e) {
    return respond({ ok: false, error: "쓰기 실패: " + (e && e.message ? e.message : e) });
  }
  return respond({ ok: true, row: row, done: done, status: status });
}

// ── 마감일 변경: 영상작업 행의 마감(E/M열)을 날짜로 기록 ──
// p: { member, row(1-based), dueDate("YYYY-MM-DD" 또는 빈칸) }
function updateDue(p) {
  var target = p.member || p.targetMember || "";
  var row    = parseInt(p.row, 10);
  var dueDate = (p.dueDate == null ? "" : String(p.dueDate));
  var startCol = MEMBER_COLS[target];
  if (!startCol)        return respond({ ok: false, error: "팀원 이름 없음: " + target });
  if (!row || row < 1)  return respond({ ok: false, error: "행 번호 오류: " + p.row });

  var sheet = getSheet();
  // 가드: 영상작업 행인지(C/D HYPERLINK) 확인
  var f = sheet.getRange(row, startCol + COL.LINK, 1, 2).getFormulas()[0];
  var isVideo = /HYPERLINK/i.test(String(f[0])) || /HYPERLINK/i.test(String(f[1]));
  if (!isVideo) return respond({ ok: false, error: "영상작업 행이 아님(보호): row " + row });

  try {
    var dm = dueDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    var dueCell = sheet.getRange(row, startCol + COL.DATE); // E/M
    if (dm) {
      dueCell.setValue(new Date(+dm[1], +dm[2] - 1, +dm[3]));
      dueCell.setNumberFormat("mm / dd"); // 캘린더 작동 + MM/DD 표시
    } else {
      dueCell.setValue(dueDate); // 형식 다르면 원문
    }
    dueCell.setHorizontalAlignment("center");
    SpreadsheetApp.flush();
  } catch (e) {
    return respond({ ok: false, error: "쓰기 실패: " + (e && e.message ? e.message : e) });
  }
  return respond({ ok: true, row: row, dueDate: dueDate });
}

// ── 영상작업 편집: 제목(B/J)·요청글(C/K)·기획안(D/L)·마감(E/M) 일괄 기록 ──
// p: { member, row(1-based), title, url(요청글), planLink, dueDate("YYYY-MM-DD") }
function updateTask(p) {
  var target  = p.member || p.targetMember || "";
  var row     = parseInt(p.row, 10);
  var title   = (p.title == null ? "" : String(p.title));
  var url      = p.url      || "";
  var planLink = p.planLink || "";
  var dueDate  = p.dueDate  || "";
  var startCol = MEMBER_COLS[target];
  if (!startCol)        return respond({ ok: false, error: "팀원 이름 없음: " + target });
  if (!row || row < 1)  return respond({ ok: false, error: "행 번호 오류: " + p.row });

  var sheet = getSheet();
  // 가드: 현재 행이 영상작업 행인지 → 이름행/관리행 보호
  var f = sheet.getRange(row, startCol + COL.LINK, 1, 2).getFormulas()[0];
  var isVideo = /HYPERLINK/i.test(String(f[0])) || /HYPERLINK/i.test(String(f[1]));
  if (!isVideo) return respond({ ok: false, error: "영상작업 행이 아님(보호): row " + row });

  try {
    // 제목 (B/J)
    var titleCell = sheet.getRange(row, startCol + COL.TITLE);
    titleCell.setValue(title);
    titleCell.setHorizontalAlignment("left"); // B/J 좌측정렬
    // 요청글 링크 (C/K) — HYPERLINK 수식
    var linkCell = sheet.getRange(row, startCol + COL.LINK);
    if (url) linkCell.setFormula('=HYPERLINK("' + url + '","🔗요청글링크")');
    else     linkCell.clearContent();
    linkCell.setHorizontalAlignment("left"); // C/K 좌측정렬
    // 기획안 링크 (D/L) — http면 HYPERLINK, 아니면(NAS 경로·텍스트) 그대로 텍스트
    var planCell = sheet.getRange(row, startCol + COL.PLAN);
    if (planLink) {
      if (planLink.indexOf("http") === 0) planCell.setFormula('=HYPERLINK("' + planLink + '","🔗기획안링크")');
      else planCell.setValue(planLink); // NAS 경로(/cr/...)·일반 텍스트는 수식이 아니라 값으로
    } else {
      planCell.clearContent();
    }
    planCell.setHorizontalAlignment("left"); // D/L 좌측정렬
    // 마감 (E/M)
    var dm = dueDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    var dueCell = sheet.getRange(row, startCol + COL.DATE);
    if (dm) { dueCell.setValue(new Date(+dm[1], +dm[2] - 1, +dm[3])); dueCell.setNumberFormat("mm / dd"); }
    else if (dueDate) { dueCell.setValue(dueDate); }
    dueCell.setHorizontalAlignment("center");
    SpreadsheetApp.flush();
  } catch (e) {
    return respond({ ok: false, error: "쓰기 실패: " + (e && e.message ? e.message : e) });
  }
  return respond({ ok: true, row: row });
}

// ── 영상작업 삭제: 삭제 행 아래 "연속된 영상작업 행"을 한 칸씩 위로 당김 ──
//   블록 전체를 한 번에 읽어 메모리에서 시프트 후 일괄 기록(빠름·타임아웃 방지).
//   내 단 7칸(A~G / I~O)만 이동, 반대편 단 무시.
// p: { member, row(1-based) }
function deleteTask(p) {
  var target = p.member || p.targetMember || "";
  var row    = parseInt(p.row, 10);
  var startCol = MEMBER_COLS[target];
  if (!startCol)        return respond({ ok: false, error: "팀원 이름 없음: " + target });
  if (!row || row < 1)  return respond({ ok: false, error: "행 번호 오류: " + p.row });

  var sheet = getSheet();
  var lastRow = sheet.getLastRow();

  // 삭제 행 아래로 연속된 영상작업 행 범위 파악 (C/D HYPERLINK 기준) — 한 번에 읽기
  var scanCount = Math.max(0, lastRow - row + 1);
  var linkF = sheet.getRange(row, startCol + COL.LINK, scanCount, 2).getFormulas(); // C,D (또는 K,L)
  function isVid(i) { return /HYPERLINK/i.test(String(linkF[i][0])) || /HYPERLINK/i.test(String(linkF[i][1])); }
  if (!isVid(0)) return respond({ ok: false, error: "영상작업 행이 아님(보호): row " + row });

  var n = 1; // 삭제 행 포함 연속 영상작업 행 수
  while (n < scanCount && isVid(n)) n++;
  // 블록 = row .. row+n-1 (n개 행). 한 칸 위로 당기면 마지막 1행이 비게 됨.

  try {
    var firstCol = startCol + COL.CHECK; // A/I
    var width = 7;                        // A~G / I~O
    var block = sheet.getRange(row, firstCol, n, width);
    var vals  = block.getValues();
    var forms = block.getFormulas();
    var dueNF = sheet.getRange(row, startCol + COL.DATE, n, 1).getNumberFormats();

    // 메모리에서 한 칸 위로 시프트 (i ← i+1)
    for (var i = 0; i < n - 1; i++) {
      for (var c = 0; c < width; c++) {
        // 링크 2칸(LINK/PLAN)은 수식 우선, 나머지는 값
        if ((c === COL.LINK || c === COL.PLAN) && forms[i + 1][c]) vals[i][c] = forms[i + 1][c];
        else vals[i][c] = (forms[i + 1][c] ? forms[i + 1][c] : vals[i + 1][c]);
      }
      dueNF[i][0] = dueNF[i + 1][0];
    }
    // 마지막 행: 체크 해제 + 6칸 비우기
    vals[n - 1][COL.CHECK] = false;
    for (var c2 = 1; c2 < width; c2++) vals[n - 1][c2] = "";

    block.setValues(vals); // 일괄 기록 (수식 문자열도 setValues로 반영됨)
    // v50: 값만 위로 당기면 글자색은 제자리에 남아 체크박스 색이 뒤섞임 → 블록 전체 통일
    sheet.getRange(row, firstCol, n, 1).setFontColor(CHECK_FONT_COLOR);
    sheet.getRange(row, startCol + COL.DATE, n, 1).setNumberFormats(dueNF);
    sheet.getRange(row, startCol + COL.DATE, n, 1).setHorizontalAlignment("center");
    SpreadsheetApp.flush();
  } catch (e) {
    return respond({ ok: false, error: "삭제 실패: " + (e && e.message ? e.message : e) });
  }
  return respond({ ok: true, row: row, deleted: true, shifted: n - 1 });
}

// ── (일회성) 기존 관리 항목 전부 좌측정렬 ──────────────────
// Apps Script 편집기에서 한 번 실행하면 모든 팀원의 관리행 B·C를 좌측정렬.
function alignMgmtLeft() {
  var sheet = getSheet();
  ensureMembers(sheet); // v51: 팀원 목록 확보
  var rng = sheet.getRange(1, 1, READ_ROWS, READ_COLS);
  var allData = rng.getValues();
  var formulas = rng.getFormulas();
  var names = Object.keys(MEMBER_COLS);
  var count = 0;
  for (var n = 0; n < names.length; n++) {
    var member = names[n], startCol = MEMBER_COLS[member], base = startCol - 1;
    var nameRow = findNameRow(allData, member, startCol);
    if (nameRow === -1) continue;
    var endRow = findSectionEnd(allData, member, startCol, nameRow);
    var dividerRow = -1;
    for (var r = nameRow; r < endRow - 1; r++) {
      var s = String(allData[r][base + COL.CHECK]) + String(allData[r][base + COL.TITLE]) + String(allData[r][base + COL.LINK]);
      if (s.indexOf("▼") !== -1 && s.indexOf("업무") !== -1) { dividerRow = r + 1; break; }
    }
    var regionEnd = (dividerRow !== -1) ? dividerRow - 1 : endRow - 1;
    for (var rr = nameRow + 1; rr <= regionEnd; rr++) {
      var idx = rr - 1;
      var hasLink = /HYPERLINK/i.test(String(formulas[idx][base + COL.LINK])) ||
                    /HYPERLINK/i.test(String(formulas[idx][base + COL.PLAN]));
      if (hasLink) continue;
      var s2 = String(allData[idx][base + COL.CHECK]) + String(allData[idx][base + COL.TITLE]) + String(allData[idx][base + COL.LINK]);
      if (s2.indexOf("▼") !== -1 && s2.indexOf("업무") !== -1) continue;
      sheet.getRange(rr, startCol + COL.TITLE).setHorizontalAlignment("left"); // B / J
      sheet.getRange(rr, startCol + COL.LINK).setHorizontalAlignment("left");  // C / K (병합 앵커)
      count++;
    }
  }
  SpreadsheetApp.flush();
  Logger.log("좌측정렬 적용된 관리행: " + count);
}

// ── (일회성) 체크박스 색 전체 복구 ──────────────────────────
// v50: 이미 연한 회색이 된 체크박스를 한 번에 진한 회색(#434343)으로 통일.
// Apps Script 편집기에서 fixCheckboxColors() 를 한 번 실행하면 끝.
// 체크열(A / I)만 훑어 "체크박스가 있는 칸"에만 적용 → 📌·빈칸·다른 열은 건드리지 않음.
function fixCheckboxColors() {
  var sheet   = getSheet();
  var lastRow = Math.max(sheet.getLastRow(), READ_ROWS);
  var cols    = [1, 9]; // A(좌) / I(우)
  var total   = 0;
  for (var s = 0; s < cols.length; s++) {
    var col   = cols[s];
    var rng   = sheet.getRange(1, col, lastRow, 1);
    var vals  = rng.getValues();
    var rules = rng.getDataValidations();
    for (var r = 0; r < lastRow; r++) {
      var isCheckbox = false;
      var rule = rules[r][0];
      if (rule) {
        try { isCheckbox = (rule.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.CHECKBOX); }
        catch (e) { isCheckbox = false; }
      }
      // 데이터확인이 지워진 칸이라도 값이 불리언이면 체크박스로 간주(안전망)
      if (!isCheckbox && typeof vals[r][0] === "boolean") isCheckbox = true;
      if (!isCheckbox) continue;
      sheet.getRange(r + 1, col).setFontColor(CHECK_FONT_COLOR);
      total++;
    }
  }
  SpreadsheetApp.flush();
  Logger.log("체크박스 색 통일 완료: " + total + "칸 → " + CHECK_FONT_COLOR);
}

// ── 라우팅 ──────────────────────────────────────────────────
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "";
  if (action === "members") return membersLight();  // 업무현황 시트 안 읽음
  if (action === "read")    return doRead(e);       // doRead 안에서 ensureMembers 호출
  return respond({ ok: true, message: "웹앱 정상 동작 중" });
}

function doPost(e) {
  try {
    var p      = e.parameter;
    var action = p.action || "insert";

    if (action === "members")    return membersLight();  // 업무현황 시트 안 읽음
    ensureMembers();
    if (action === "read")       return doRead(e);

    // v54 ★쓰기 경로: 읽기 캐시를 버리고 실행한 뒤 **한 번 더** 버린다.
    //   실행 중에 다른 사람의 읽기가 옛 데이터를 다시 캐싱해 버리면
    //   내가 방금 체크한 완료가 캐시 수명 동안 되돌아온 것처럼 보인다.
    bustReadCache();
    var out = null;
    if (action === "updateMemo")      out = updateMemo(p);
    else if (action === "addMemo")    out = addMemo(p);
    else if (action === "toggleDone") out = toggleDone(p);
    else if (action === "deleteTask") out = deleteTask(p);
    else if (action === "updateDue")  out = updateDue(p);
    else if (action === "updateTask") out = updateTask(p);
    if (out) { bustReadCache(); return out; }

    // ===== 이하 기존 전송(insert) 로직 — 변경 없음 =====
    var target    = p.targetMember || "";
    var title     = p.title        || "(제목 없음)";
    var sourceUrl = p.url          || "";
    var planLink  = p.planLink     || "";
    var dueDate   = p.dueDate      || "";
    var memo      = p.memo         || "";
    var dupCheck  = p.dupCheck !== "0";

    var startCol = MEMBER_COLS[target];
    if (!startCol) return respond({ ok: false, error: "팀원 이름 없음: " + target });

    var sheet   = getSheet();

    // ── 전체 데이터 한 번에 읽기 (1-based 행 기준으로 통일) ──
    var allData = sheet.getRange(1, 1, READ_ROWS, READ_COLS).getValues();  // A~O (7칸 구조)

    // 이름 행 탐색 → sheetRow (1-based)
    var nameSheetRow = -1;
    for (var r = 0; r < allData.length; r++) {
      if (String(allData[r][startCol - 1]).indexOf(target) !== -1 ||
          String(allData[r][startCol]).indexOf(target) !== -1) {
        nameSheetRow = r + 1; // 1-based
        break;
      }
    }
    if (nameSheetRow === -1) return respond({ ok: false, error: target + " 이름을 찾을 수 없음" });

    // 섹션 끝 행 탐색 → sectionEndSheetRow (1-based, 다음 섹션 시작 행)
    var sectionEndSheetRow = nameSheetRow + 100; // 기본값
    for (var r2 = nameSheetRow; r2 < allData.length; r2++) {
      // 좌측 체크A(0)+제목B(1), 우측 체크I(8)+제목J(9) 네 칸에서 이름/구분어 탐색
      var combined = String(allData[r2][0]) + String(allData[r2][1])
                   + String(allData[r2][8]) + String(allData[r2][9]);
      var hit = false;
      for (var k = 0; k < BOUNDARY_WORDS.length; k++) {
        if (combined.indexOf(BOUNDARY_WORDS[k]) !== -1) { sectionEndSheetRow = r2; hit = true; break; }
      }
      if (!hit) {
        for (var m = 0; m < ALL_MEMBERS.length; m++) {
          if (combined.indexOf(ALL_MEMBERS[m]) !== -1) { sectionEndSheetRow = r2; hit = true; break; }
        }
      }
      if (hit) break;
    }

    var scanStart    = nameSheetRow;           // 1-based, 이름 행 다음부터
    var scanEnd      = sectionEndSheetRow - 1;  // 1-based, 섹션 마지막 행
    var scanLen      = scanEnd - scanStart;

    // 중복 체크
    if (dupCheck && sourceUrl) {
      var idxNum   = (sourceUrl.match(/idx=(\d+)/) || [])[1];
      var formulas = sheet.getRange(scanStart + 1, startCol + COL.LINK, scanLen, 1).getFormulas();
      for (var i = 0; i < scanLen; i++) {
        var hay = String(allData[scanStart + i][startCol - 1 + COL.LINK]) + String(formulas[i][0]);
        if (idxNum ? hay.indexOf("idx=" + idxNum) !== -1 : hay.indexOf(sourceUrl) !== -1) {
          return respond({ ok: false, duplicate: true, message: "이미 등록된 게시글입니다." });
        }
      }
    }

    // 삽입 위치: 제목이 있는 마지막 행 바로 다음 (1-based)
    var lastTitleSheetRow = scanStart;
    for (var j = 0; j < scanLen; j++) {
      if (String(allData[scanStart + j][startCol - 1 + COL.TITLE]).trim()) {
        lastTitleSheetRow = scanStart + j + 1; // 1-based
      }
    }
    var insertRow = lastTitleSheetRow + 1; // 1-based

    var needBlank = (insertRow > scanEnd);

    // 마감일: "2026-06-05" → 진짜 날짜값(Date). 형식이 다르면 원문 텍스트로 폴백.
    // (인트라넷 end_date에 연도가 들어있으므로 추정 불필요 — 그대로 정확히 사용)
    var dm = dueDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    var dateValue = dm ? new Date(+dm[1], +dm[2] - 1, +dm[3]) : dueDate;

    // 위 행 서식 복사 (체크박스 색상 통일)
    sheet.getRange(insertRow - 1, startCol + COL.CHECK)
         .copyFormatToRange(sheet, startCol + COL.CHECK, startCol + COL.CHECK, insertRow, insertRow);

    var checkCell = sheet.getRange(insertRow, startCol + COL.CHECK);
    checkCell.clearDataValidations();
    checkCell.insertCheckboxes();
    checkCell.setFontColor(CHECK_FONT_COLOR); // v50: 윗행 서식복사로 옮아온 연한 회색 차단

    sheet.getRange(insertRow, startCol + COL.TITLE, 1, 4).setValues([[title, "", "", dateValue]]);
    sheet.getRange(insertRow, startCol + COL.CHECK).setValue(false);
    var dueCell = sheet.getRange(insertRow, startCol + COL.DATE);
    if (dateValue instanceof Date) dueCell.setNumberFormat("mm / dd"); // 캘린더 작동 + MM/DD 표시
    dueCell.setHorizontalAlignment("center");

    if (sourceUrl) {
      sheet.getRange(insertRow, startCol + COL.LINK)
           .setFormula('=HYPERLINK("' + sourceUrl + '","🔗요청글링크")');
    }
    if (planLink) {
      var planCellIns = sheet.getRange(insertRow, startCol + COL.PLAN);
      if (planLink.indexOf("http") === 0) {
        planCellIns.setFormula('=HYPERLINK("' + planLink + '","🔗기획안링크")');
      } else {
        planCellIns.setValue(planLink); // NAS 경로(/cr/...)·일반 텍스트는 값으로
      }
    }
    if (memo) {
      // 메모 → F열(좌측) / N열(우측). 시작열+COL.MEMO(5)
      sheet.getRange(insertRow, startCol + COL.MEMO).setValue(memo);
    }

    // 새 행 정렬 기본값: 대부분 좌측, E/M·F/N만 중앙 (정렬 어긋남 방지)
    applyDefaultAlignment(sheet, insertRow, startCol);

    SpreadsheetApp.flush();

    if (needBlank) {
      sheet.insertRowAfter(insertRow);
      sheet.getRange(insertRow + 1, 1, 1, sheet.getLastColumn())
           .clearContent().clearDataValidations().clearFormat();
    }

    bustReadCache();   // v54: insert 도 읽기 캐시를 버린다
    return respond({ ok: true, message: target + " " + insertRow + "행 추가됨 (섹션끝:" + scanEnd + ", needBlank:" + needBlank + ")" });

  } catch (err) {
    return respond({ ok: false, error: err.toString() });
  }
}

// ── 테스트/진단 함수 (편집기에서 실행) ───────────────────────
function testInsert() {
  var e = { parameter: {
    targetMember: "구민석",
    title: "[테스트] v23",
    dueDate: "2026-05-20",
    url: "https://intranet.adef.co.kr/video/view?idx=99993",
    planLink: "https://docs.google.com/presentation/d/test",
    dupCheck: "1",
  }};
  Logger.log(doPost(e).getContent());
}

function testRead() {
  // 전체 읽기 결과를 보기 좋게 로그
  var out = JSON.parse(doRead({ parameter: {} }).getContent());
  out.members.forEach(function(m) {
    Logger.log("■ " + m.name + " (" + m.side + ") 이름행:" + m.nameRow +
               " / 영상작업 " + m.video.length + "건, 관리항목 " + m.mgmt.length + "건");
    m.mgmt.forEach(function(x) { Logger.log("   [관리 r" + x.row + "] done=" + x.done + " B=「" + x.b + "」 C=「" + x.c + "」"); });
    m.video.forEach(function(x) { Logger.log("   [작업 r" + x.row + "] done=" + x.done + " 마감=" + x.dueDate + " 상태=「" + x.status + "」 " + x.title.slice(0, 30)); });
  });
}

function testReadOne() {
  Logger.log(doRead({ parameter: { member: "구민석" } }).getContent());
}

// ── 1단계: 마감일 칸 현황 스캔 (쓰기 없음, 읽기 전용) ────────
// 좌(E)·우(M) 마감일 칸을 훑어 "날짜값 / 텍스트 / 빈칸"을 분류해 로그.
// 영상작업 행(C·D 또는 K·L에 HYPERLINK 있는 행)만 대상으로 본다.
function scanDueDates() {
  var sheet    = getSheet();
  var rng      = sheet.getRange(1, 1, READ_ROWS, READ_COLS);
  var values   = rng.getValues();
  var formulas = rng.getFormulas();

  var sides = [
    { name: "좌(E)", base: 0 },  // startCol 1 → 0-based
    { name: "우(M)", base: 8 }   // startCol 9 → 0-based
  ];

  var report = { dateType: 0, textType: 0, empty: 0 };
  var textSamples = [];

  for (var s = 0; s < sides.length; s++) {
    var base = sides[s].base;
    for (var r = 0; r < values.length; r++) {
      // 이 행이 영상작업인지(링크 수식 보유) 확인
      var linkF = String(formulas[r][base + COL.LINK]);
      var planF = String(formulas[r][base + COL.PLAN]);
      if (!/HYPERLINK/i.test(linkF) && !/HYPERLINK/i.test(planF)) continue;

      var v = values[r][base + COL.DATE];
      if (v instanceof Date) {
        report.dateType++;
      } else if (String(v).trim() === "") {
        report.empty++;
      } else {
        report.textType++;
        if (textSamples.length < 25) {
          var colL = (base === 0) ? "E" : "M";
          textSamples.push(colL + (r + 1) + "=「" + String(v).trim() + "」");
        }
      }
    }
  }

  Logger.log("── 마감일 현황 (영상작업 행 대상) ──");
  Logger.log("날짜값(캘린더 작동): " + report.dateType + "개");
  Logger.log("텍스트(캘린더 안됨, 변환 대상): " + report.textType + "개");
  Logger.log("빈칸: " + report.empty + "개");
  Logger.log("── 텍스트 칸 샘플(최대 25개) ──");
  textSamples.forEach(function(x) { Logger.log("  " + x); });
  if (report.textType > textSamples.length) {
    Logger.log("  …외 " + (report.textType - textSamples.length) + "개 더");
  }
}

// ── 2단계: 텍스트 마감일 → 진짜 날짜값 + "MM / DD" 표시형식 ──
// convertDueDates(true)  = 미리보기(로그만, 시트 안 바꿈)
// convertDueDates(false) = 실제 변환
// 연도 추정: 기본 현재 연도. 단 마감 월이 현재 월보다 6개월 이상 "미래"면
//            연말연초 경계로 보고 작년으로 보정(예: 1월에 보는 12/28 = 작년).
function convertDueDates(dryRun) {
  if (typeof dryRun === "undefined") dryRun = true; // 안전 기본값: 미리보기
  var sheet    = getSheet();
  var rng      = sheet.getRange(1, 1, READ_ROWS, READ_COLS);
  var values   = rng.getValues();
  var formulas = rng.getFormulas();

  var now      = new Date();
  var curYear  = now.getFullYear();

  var sides = [
    { colLetter: "E", base: 0 },
    { colLetter: "M", base: 8 }
  ];

  var planned = 0, skipped = 0;
  Logger.log(dryRun ? "── [미리보기] 변환 예정 (시트 안 바뀜) ──"
                    : "── [실행] 마감일 변환 중 ──");

  for (var s = 0; s < sides.length; s++) {
    var base = sides[s].base;
    var colLetter = sides[s].colLetter;
    var dateCol1based = base + 1 + COL.DATE; // 1-based 열 번호

    for (var r = 0; r < values.length; r++) {
      // 영상작업 행만
      var linkF = String(formulas[r][base + COL.LINK]);
      var planF = String(formulas[r][base + COL.PLAN]);
      if (!/HYPERLINK/i.test(linkF) && !/HYPERLINK/i.test(planF)) continue;

      var v = values[r][base + COL.DATE];
      if (v instanceof Date) continue;          // 이미 날짜값 → 건너뜀
      var txt = String(v).trim();
      if (!txt) continue;                        // 빈칸 → 건너뜀

      // "MM / DD" / "M/D" 등에서 월·일 추출
      var m = txt.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/);
      if (!m) { skipped++; Logger.log("  ⚠ " + colLetter + (r + 1) + " 해석불가, 건너뜀: 「" + txt + "」"); continue; }

      var mon = parseInt(m[1], 10);
      var day = parseInt(m[2], 10);
      if (mon < 1 || mon > 12 || day < 1 || day > 31) { skipped++; Logger.log("  ⚠ " + colLetter + (r + 1) + " 범위벗어남, 건너뜀: 「" + txt + "」"); continue; }

      // 연도 추정: "지금"에서 가장 가까운 해를 선택.
      // 현재 연도 기준 날짜가 6개월 이상 미래면 작년, 6개월 이상 과거면 내년.
      // (12월↔1월 경계 양쪽 모두 자연스럽게 처리)
      var year = curYear;
      var cand = new Date(curYear, mon - 1, day);
      var diffDays = (cand.getTime() - now.getTime()) / 86400000;
      if (diffDays > 182)       year = curYear - 1;
      else if (diffDays < -182) year = curYear + 1;

      var sheetRow = r + 1;
      planned++;
      Logger.log("  " + colLetter + sheetRow + ": 「" + txt + "」 → " + year + "-" +
                 ("0" + mon).slice(-2) + "-" + ("0" + day).slice(-2));

      if (!dryRun) {
        var cell = sheet.getRange(sheetRow, dateCol1based);
        cell.setValue(new Date(year, mon - 1, day)); // 진짜 날짜값
        cell.setNumberFormat("mm / dd");             // 표시형식만 MM / DD
        cell.setHorizontalAlignment("center");
      }
    }
  }

  Logger.log("── 요약: 변환 " + (dryRun ? "예정 " : "완료 ") + planned + "개" +
             (skipped ? ", 건너뜀 " + skipped + "개" : "") + " ──");
  if (dryRun) Logger.log("문제 없으면 convertDueDates(false) 로 실제 실행하세요.");
}

// 편집기 드롭다운에서 클릭 실행용 — 실제 변환(false)
function convertDueDates_RUN() {
  convertDueDates(false);
}

// 실제 시트 구조 눈으로 확인용 — 1행부터 30행, A~O 값 덤프
function diagnoseSheet() {
  var data = getSheet().getRange(1, 1, 30, READ_COLS).getValues();
  var letters = "ABCDEFGHIJKLMNO".split("");
  for (var r = 0; r < data.length; r++) {
    var parts = [];
    for (var c = 0; c < data[r].length; c++) {
      var v = String(data[r][c]).trim();
      if (v) parts.push(letters[c] + (r + 1) + "=「" + v.slice(0, 20) + "」");
    }
    if (parts.length) Logger.log(parts.join("  "));
  }
}
