/* ═══════════════════════════════════════════════════════════════════════
 * ⚠️⚠️  경고 — 이 파일은 폐기된 「1단계 읽기 API」 사본이다. 붙여넣지 말 것.  ⚠️⚠️
 *
 * 진실원천은 Apps Script 편집기의 코드(현재 v53)이고, 이 파일은 그것과
 * **계약이 완전히 다르다.** 아래 안내(“이 코드를 붙여넣기 → 배포 → 새 배포”)를
 * 그대로 따르면 팀 7명 전원의 동기화가 즉시 죽는다.
 *
 *   ┌ 이 파일                          │ 현행 v53 (앱이 실제로 쓰는 것)
 *   ├──────────────────────────────────┼──────────────────────────────────────
 *   │ action=read 에 user 파라미터 필수 │ main.js:355 는 ?action=read 만 보낸다
 *   │ 응답 = { tasks: [...] }          │ 앱은 res.members / res.memberNames 를 읽는다
 *   │ 팀원 이름이 코드에 하드코딩       │ 🤖자동화 시트 A열에서 자동 인식
 *   │ doPost 없음 (쓰기 0)             │ toggleDone·deleteTask·updateDue·updateTask·
 *   │                                  │ updateMemo·addMemo·insert 전부 있음
 *   │ members 액션 없음                │ 딸깍 확장이 ?action=members 로 쓴다
 *   │ SHEET_ID … _8xBs …               │ 실제 시트는 … _4xBs … (아래 값이 틀렸다)
 *   └──────────────────────────────────┴──────────────────────────────────────
 *
 * GAS 를 수정해야 하면 **편집기의 현재 코드를 먼저 받아서** 작업할 것.
 * (과거 v47/v48 제작 때 옛 베이스에서 시작해 기능이 유실된 사고가 있었다.)
 * 남겨 둔 이유는 초기 시트 구조(7칸 좌/우 배치)의 기록 가치뿐이다.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * ════════════════════════════════════════════════════════
 *  작업 타이머 — 구글 시트 연동 Apps Script (1단계: 읽기 API)
 * ════════════════════════════════════════════════════════
 *
 *  사용법:
 *   1. 구글 시트 → 확장 프로그램 → Apps Script
 *   2. 이 코드를 붙여넣기 (기존 딸깍 코드가 있으면 그 아래에 추가)
 *   3. 배포 → 새 배포 → 웹 앱 → 액세스 권한 "모든 사용자"
 *   4. 배포 URL을 앱에 입력
 *
 *  새 시트 구조 (7칸):
 *   좌측: A(체크박스) B(제목) C~E D(...) F(메모) G(상태)
 *   H: 빈 열
 *   우측: I(체크박스) J(제목) K~M N(메모) O(상태)
 *
 *  ⚠️ 아래 설정값을 본인 시트에 맞게 확인하세요.
 */

// ── 설정 ──
const SHEET_ID = '18K3NKAkZwGvxS_QMV5boGNJtmay1ZJ_8xBs26SZZ_Bc';
const SHEET_NAME = '🎬업무현황';

// 팀원이 어느 단(좌/우)에 있는지. 이름은 시트의 이름 셀과 정확히 일치해야 함
const LEFT_MEMBERS  = ['구민석', '주지현', '김본희', '박지수'];   // A~G열
const RIGHT_MEMBERS = ['한영채', '박나진', '구정현'];            // I~O열

// 단별 열 인덱스 (1-based: A=1, B=2, ...)
const LAYOUT = {
  left:  { check: 1, title: 2, date: 3, link: 4, memo: 6, status: 7 },   // A,B,C,D,F,G
  right: { check: 9, title: 10, date: 11, link: 12, memo: 14, status: 15 }, // I,J,K,L,N,O
};

const HEADER_ROWS = 2; // 1행 제목, 2행 이름 → 데이터는 그 아래부터

/**
 * 웹앱 진입점. ?action=read&user=구민석
 */
function doGet(e) {
  const action = (e.parameter.action || 'read').toLowerCase();
  try {
    if (action === 'read') {
      const user = e.parameter.user;
      if (!user) return jsonOut({ ok: false, error: 'user 파라미터가 필요해요' });
      return jsonOut({ ok: true, user: user, tasks: readUserTasks(user) });
    }
    return jsonOut({ ok: false, error: '알 수 없는 action: ' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/**
 * 특정 사용자의 작업 목록을 읽어서 반환.
 * 이름 셀을 동적으로 찾아, 그 아래부터 다음 이름(또는 끝)까지를 그 사람 작업으로 인식.
 */
function readUserTasks(user) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('시트 탭을 찾을 수 없어요: ' + SHEET_NAME);

  // 좌/우 판별
  let side, allMembers;
  if (LEFT_MEMBERS.indexOf(user) >= 0) { side = 'left'; allMembers = LEFT_MEMBERS; }
  else if (RIGHT_MEMBERS.indexOf(user) >= 0) { side = 'right'; allMembers = RIGHT_MEMBERS; }
  else throw new Error('팀원 명단에 없는 이름: ' + user);

  const col = LAYOUT[side];
  const lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROWS) return [];

  // 해당 단 전체를 한 번에 읽기 (체크박스~상태 범위)
  // 좌측은 A~G(1~7), 우측은 I~O(9~15)
  const startCol = col.check;
  const numCols = col.status - col.check + 1; // 7칸
  const numRows = lastRow - HEADER_ROWS;
  const range = sheet.getRange(HEADER_ROWS + 1, startCol, numRows, numCols);
  const values = range.getValues();      // 셀 값
  const richLinks = range.getRichTextValues(); // 링크 추출용

  // 이름 셀 위치 찾기 — 제목 열(B/J)에 이름이 단독으로 있는 행을 구분자로 사용
  // 단, 이 시트는 2행에 이름이 있고 그 아래가 작업. 여러 명이 세로로 쌓이는 구조라
  // "제목 칸에 팀원 이름이 그대로 적힌 행"을 다음 사람의 시작으로 간주.
  const titleColOffset = col.title - col.check; // 제목 열의 상대 위치

  // 각 행을 순회하며 현재 사용자 구간만 수집
  const tasks = [];
  let capturing = false;
  let currentOwner = null;

  // 2행(이름 행) 자체도 확인 필요 → 이름 행 매핑을 먼저 만든다
  // 이름 행: 제목 열 값이 팀원 이름과 일치하는 행
  for (let i = 0; i < values.length; i++) {
    const rowAbs = HEADER_ROWS + 1 + i;
    const titleCell = String(values[i][titleColOffset] || '').trim();

    // 이 행이 누군가의 "이름 행"인가?
    if (allMembers.indexOf(titleCell) >= 0) {
      currentOwner = titleCell;
      capturing = (titleCell === user);
      continue; // 이름 행 자체는 작업이 아님
    }

    if (!capturing) continue;

    // 빈 행(제목 없음)은 건너뛰되, 구간 종료로 보지 않음(중간 빈칸 허용)
    const title = titleCell;
    if (!title) continue;

    const checkVal = values[i][col.check - startCol];
    const dateVal = values[i][col.date - startCol];
    const memoVal = values[i][col.memo - startCol];
    const statusVal = values[i][col.status - startCol];

    // 링크: 제목 셀 또는 링크 셀의 하이퍼링크 추출
    let link = '';
    const linkRich = richLinks[i][col.link - startCol];
    if (linkRich) {
      const url = linkRich.getLinkUrl();
      if (url) link = url;
    }
    // 제목 셀에 하이퍼링크가 걸린 경우도 체크
    if (!link) {
      const titleRich = richLinks[i][titleColOffset];
      if (titleRich) { const u = titleRich.getLinkUrl(); if (u) link = u; }
    }

    tasks.push({
      row: rowAbs,                          // 시트 행 번호 (쓰기 때 사용)
      done: checkVal === true,              // 체크박스 TRUE/FALSE
      title: title,
      date: dateVal ? String(dateVal) : '',
      link: link,
      memo: memoVal ? String(memoVal) : '',
      status: statusVal ? String(statusVal) : '',
    });
  }

  return tasks;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 테스트용: 편집기에서 직접 실행해 로그로 확인
 */
function testRead() {
  const r = readUserTasks('구민석');
  Logger.log(JSON.stringify(r, null, 2));
}

/**
 * 진단용: 시트 상단 20행 × A~O열을 그대로 로그로 출력.
 * 편집기에서 이 함수를 실행 → 실행 로그에서 실제 구조 확인.
 * 이걸로 이름이 어느 열·행에 있는지, 날짜·링크 위치를 정확히 파악하세요.
 */
function diagnoseSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const rows = Math.min(20, sheet.getLastRow());
  const vals = sheet.getRange(1, 1, rows, 15).getValues(); // A~O
  const cols = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O'];
  for (let r = 0; r < vals.length; r++) {
    const parts = [];
    for (let c = 0; c < 15; c++) {
      const v = String(vals[r][c]).slice(0, 18);
      if (v) parts.push(cols[c] + (r+1) + '="' + v + '"');
    }
    if (parts.length) Logger.log(parts.join('  '));
  }
}
