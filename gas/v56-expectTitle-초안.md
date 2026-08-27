# v56 초안 — 행 키 지문 검사(`expectTitle`)

> **상태: 초안. 딸깍 세션 검토 전.** 정본은 `intranet-ttalkak/server/`.
> 이 문서는 타이머 세션이 제안하는 설계이고, 합의 전에는 배포하지 않는다.

## 왜 필요한가

타이머는 시트 행 번호를 작업 id 로 삼아 **화면에 들고 있다가** 그 번호로 쓴다.

```
renderer/index.html:2067   id: v.row
renderer/index.html:2075   _row: v.row
쓰기 6종                    row: t._row || t.id
```

자동 동기화는 10분 주기, 포커스 프리싱크도 3분 이내면 건너뛴다
(`index.html:4124-4135`). **최대 10분짜리 노출 창**이 있다.

그 사이에 행이 밀리면 스테일 row 로 쓴다. 행을 미는 코드는 셋이다.

| 코드 | 부르는 쪽 | 조건 |
|---|---|---|
| `insertRowAfter` (insert) | 딸깍 | 구역이 다 차면 그때부터 **매번** |
| `insertRowBefore` (addMemo) | **타이머 자신** | 관리행 B·C 빈 칸을 다 쓴 뒤부터 (아래) |
| 값 시프트 (deleteTask) | 타이머 | 항상 |

전폭 삽입이라 **좌·우 양쪽이 같이 밀린다.** 주지현 구역에 한 건 들어가면
48행 아래 — 김본희·박지수·구정현 3명의 row 키가 한꺼번에 무효화된다.

**서버의 `isVideo` 가드는 이걸 못 막는다.** "이 행이 영상작업 행인가"만 보지
"내가 지목한 그 작업인가"를 안 본다. 행이 한 칸 밀리면 스테일 row 는
십중팔구 옆의 다른 영상작업 행이라 가드를 그냥 통과한다.

최악은 `deleteTask` — 페이로드가 `row` 뿐이라 **엉뚱한 사람의 작업이
되돌릴 수 없이 삭제**된다.

### addMemo 는 생각보다 덜 민다 (2026-08-27 실측)

`:700~714` 의 **'빈 칸 우선'** 루프가 삽입 분기보다 **먼저** 돈다.
기존 관리행 중 B나 C가 하나라도 비어 있으면 거기 채우고 조기 반환한다 — 삽입 없음.

```
구민석 0  ⚠ 다음 추가에서 바로 삽입
박나진 0  ⚠ 다음 추가에서 바로 삽입
구정현 1  (50C)      주지현 1  (25B)
김본희 2  (49C 50C)  박지수 2  (76B 77B)  한영채 2  (3C 4C)
```

그리고 삽입된 새 행은 `:757` 에서 **B만 채우고 C는 비운다.** 그러면 다음 addMemo 가
다시 빈 칸 우선에 걸린다 → 정상 상태에서도 **한 번 걸러 한 번**이지 매번이 아니다.

⚠️ 이 표는 `doRead` 응답 기준이라 **체크칸에 📌만 있고 B·C 빈 행**은 못 본다
(`buildMemberData:553` 이 뺀다). 그런 행이 있으면 삽입은 더 드물어진다.

**결론: 주된 위험원은 딸깍 insert 쪽이다.** addMemo 는 부차적이다.

## 설계

행 키를 버리지 않는다. **내용 지문을 하나 더 실어 서버가 대조**한다.

### 클라이언트 (타이머)

row 기반 쓰기 4종에 `expectTitle` 추가. 값은 **타이머가 그 행에 있다고 믿는 현재 제목**.

| 액션 | 지금 | 추가 |
|---|---|---|
| `toggleDone` | `row`, `done`, `status` | `expectTitle: t.title` |
| `deleteTask` | `row` | **`expectIdx`** (아래 참조) |
| `updateDue` | `row`, `dueDate` | `expectTitle: t.title` |
| `updateTask` | `row`, `title`(**새 제목**), `url`, … | `expectTitle: prev.title` |

### ★`deleteTask` 만 지문이 둘이다 — 어느 하나로도 부족하다 (2026-08-27 실측)

실데이터를 재보니 idx·제목 둘 다 **팀원 간에는** 대량 중복이었다(각 20개).
하나의 요청글이 여러 명에게 배정되는 정상 동작이다. 지문 검사는
`getRange(row, startCol + COL.LINK)` — **그 팀원 칸의 그 행 하나**만 읽으므로 무해하다.

```
영상작업 88건 · idx 추출 성공 88건 (커버리지 100%)
같은 팀원 칸 안 idx 중복 : 0건
같은 팀원 칸 안 제목 중복: 0건
1행 밀림이 지문을 통과하는 '인접 행 동일': idx 0건 / 제목 0건
```

둘 다 지금은 안전하다. 문제는 **실패 조건이 서로 반대**라는 것이다.

| | 다른 게시글, 같은 제목<br>(반복 요청) | 같은 게시글, 여러 행<br>("2종"·"3건") |
|---|---|---|
| `expectTitle` | ❌ 통과시킴 | ✅ 잡음 |
| `expectIdx` | ✅ 잡음 | ❌ 통과시킴 |

실제로 `'[숨고] 8/10주차 영상 제작 요청(2종)'`, `'[종근당] … AI 영상 3종 …'` 같은
제목이 있다. 한 사람이 두 행으로 쪼개 관리하면 **idx 가 같아진다.**

**되돌릴 수 없는 유일한 액션이니 둘 다 요구한다.** 비용은 셀 읽기 하나.

> **프레이밍 주의.** 지금 같은 칸 안 중복은 idx·제목 모두 **0건**이다.
> "2종 쪼개기"도 아직 실현되지 않았다. 조합 지문은 **지금 뚫린 구멍을 막는 게 아니라**
> 방어 깊이를 더하는 것이다. 사용자에게 사고가 난 것처럼 전달하지 말 것.
> (양쪽 세션이 이번에 빈도를 과장했다가 정정한 게 두 번이다.)

⚠️ **`scanCount < 1` 가드가 먼저다 — stale row 의 한 갈래가 정확히 여기로 온다.**

`deleteTask:900-902` 는 `scanCount = Math.max(0, lastRow - row + 1)` 로 잡고 바로
`getRange(row, col, scanCount, 2)` 를 부른다. 타이머가 든 row 가 현재 `lastRow` 보다 크면
`scanCount` 가 0 이 되고 Apps Script 가 `"The number of rows in the range must be at least 1"`
로 던진다. 바깥 try 가 잡긴 하지만 **지문 검사에 닿기도 전에** 구글 예외 문자열이 사용자에게 간다.

시트가 줄어드는 유일한 경로는 사람이 행을 지우는 것이고, 그러면 타이머가 든 row 가
`lastRow` 를 넘는다. 즉 남 얘기가 아니다.

```js
  var scanCount = Math.max(0, lastRow - row + 1);
  if (scanCount < 1) {
    return respond({ ok:false, stale:true, row: row, found: "",
                     error: "그 행이 더 이상 없어요 — 동기화 후 다시 시도해 주세요" });
  }
```

그리고 **셀을 새로 읽을 필요가 없다.** `isVid` 판정용으로 이미 벌크로 읽어 둔
`linkF[0][0]` 이 대상 행의 C/K 수식 그 자체다. 제목만 새로 읽으면 되므로 순 증가는 1회.

```js
if (p.expectIdx || p.expectTitle) {
  var curIdx   = (String(linkF[0][0]).match(/idx=(\d+)/) || [])[1] || "";   // ★재사용
  var curTitle = String(sheet.getRange(row, startCol + COL.TITLE).getValue()).trim();
  var okIdx   = !p.expectIdx   || curIdx   === String(p.expectIdx);
  var okTitle = !p.expectTitle || curTitle === String(p.expectTitle).trim();
  if (!okIdx || !okTitle) {
    return respond({ ok:false, stale:true, row: row, found: curTitle, foundIdx: curIdx,
                     error: "행이 밀렸어요 — 동기화 후 다시 시도해 주세요" });
  }
}
```

나머지 3종은 `expectTitle` 단독으로 충분하다 — 잘못 적용돼도 사람이 되돌릴 수 있다.

⚠️ **필수화(4단계)는 `expectIdx` 만.** 제목은 사람이 시트에서 직접 고칠 수 있어서,
타이머가 마지막 동기화 이후 수정된 제목을 들고 있으면 정상 삭제가 stale 로 막힌다.

⚠️ `updateTask` 만 주의. `title` 은 **바꿀 새 제목**이라 지문으로 못 쓴다.
반드시 편집 전 원본(`prev.title`)을 실어야 한다.

`addMemo`/`updateMemo` 는 관리 항목이라 별도 키 체계(`mgmtFind(row)`)를 쓴다.
1차에서는 제외하고, 위 4종이 안정되면 `expectB`/`expectC` 로 확장한다.

### 서버

각 핸들러의 `isVideo` 가드 **바로 뒤**에 3줄.

```js
// 행 키 지문 — 딸깍 전송·addMemo 로 행이 밀리면 스테일 row 로 남의 작업을 건드린다.
// expectTitle 이 오면 대조한다. 안 오면(구버전 클라) 통과 — 하위호환.
if (p.expectTitle != null && String(p.expectTitle) !== "") {
  var curTitle = String(sheet.getRange(row, startCol + COL.TITLE).getValue()).trim();
  if (curTitle !== String(p.expectTitle).trim()) {
    return respond({ ok: false, stale: true,
                     error: "행이 밀렸어요 — 동기화 후 다시 시도해 주세요",
                     row: row, found: curTitle });
  }
}
```

`found` 를 돌려주는 이유: 어긋났을 때 **무엇이 그 자리에 있었는지**가
로그로 남아야 원인(딸깍 insert / addMemo / deleteTask 중 무엇인지)을 가릴 수 있다.

### 클라이언트의 `stale` 처리

`busy` 와 달리 **재시도만으로는 못 고친다.** 행 번호 자체가 틀렸으므로 재동기화가 먼저다.

```
stale 수신
  → 낙관적 UI 롤백 (행이 틀렸으니 적용된 게 없다)
  → doSync({ silent:true })   // 행 번호 갱신
  → toast(found ? `'${expect}' 자리에 '${found}'가 있어요` : "그 자리가 비어 있어요")
     (found 는 20자로 자른다. 「행이 밀렸어요」보다 상황이 바로 이해된다)
```

**자동 재시도는 하지 않는다.** 동기화 후 그 작업이 어디로 갔는지(혹은 사라졌는지)
사용자가 보고 다시 누르는 편이 안전하다. 특히 `deleteTask` 는 자동 재시도가
위험하다 — 되돌릴 수 없는 액션을 사용자 확인 없이 두 번 쏘는 셈이다.

## 배포 순서 — 순서가 틀리면 팀 전원의 삭제가 죽는다

1. **서버 v56**: `expectTitle` 이 **오면** 검사, 없으면 통과 (4종 전부, 하위호환)
2. **타이머 v1.0.28** 배포 → 자동 업데이트로 전원 도달
3. **7명 전원이 1.0.28 인 것을 확인**
4. 그 다음에 서버에서 **`deleteTask` 만** `expectIdx` 필수로

3번을 건너뛰고 4번을 하면 v1.0.27 사용자의 삭제가 전부 죽는다.
자동 업데이트가 들어가기 전에는 이 순서를 지킬 방법이 없었다.

`deleteTask` 만 조이는 이유: **유일하게 되돌릴 수 없는 액션**이다.
나머지 셋은 잘못 적용돼도 사람이 되돌릴 수 있다.

## 선행 조건 — 이름 오탐 수정이 먼저다

`findNameRow` 오탐이 살아 있으면 한 팀원의 **모든** row 키가 통째로 어긋난다.
그 상태에서 지문을 넣으면 **정상 동작까지 전부 stale 로 막히고**,
원인을 지문 쪽에서 찾게 된다. (딸깍 세션 지적, 동의함)

따라서 순서는 **이름 오탐 진단·수정 → v55 → v56**.

## 이 설계가 안 고치는 것

- **행이 밀리는 것 자체.** 지문은 사고를 *감지*할 뿐 *예방*하지 않는다.
  근본 해결은 안정적인 행 id(숨은 열에 UUID)인데, 시트를 사람이 직접 편집하는
  이상 그 열도 깨질 수 있어 별도 논의가 필요하다.
- **관리 항목(mgmt)** — 1차 범위 밖.
- **동시 쓰기 경합** — `LockService` 담당(v56 별건).
