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
| `insertRowBefore` (addMemo) | **타이머 자신** | `emptyBelow < 2` 또는 구분선 없음 |
| 값 시프트 (deleteTask) | 타이머 | 항상 |

전폭 삽입이라 **좌·우 양쪽이 같이 밀린다.** 주지현 구역에 한 건 들어가면
48행 아래 — 김본희·박지수·구정현 3명의 row 키가 한꺼번에 무효화된다.

**서버의 `isVideo` 가드는 이걸 못 막는다.** "이 행이 영상작업 행인가"만 보지
"내가 지목한 그 작업인가"를 안 본다. 행이 한 칸 밀리면 스테일 row 는
십중팔구 옆의 다른 영상작업 행이라 가드를 그냥 통과한다.

최악은 `deleteTask` — 페이로드가 `row` 뿐이라 **엉뚱한 사람의 작업이
되돌릴 수 없이 삭제**된다.

## 설계

행 키를 버리지 않는다. **내용 지문을 하나 더 실어 서버가 대조**한다.

### 클라이언트 (타이머)

row 기반 쓰기 4종에 `expectTitle` 추가. 값은 **타이머가 그 행에 있다고 믿는 현재 제목**.

| 액션 | 지금 | 추가 |
|---|---|---|
| `toggleDone` | `row`, `done`, `status` | `expectTitle: t.title` |
| `deleteTask` | `row` | `expectTitle: t.title` |
| `updateDue` | `row`, `dueDate` | `expectTitle: t.title` |
| `updateTask` | `row`, `title`(**새 제목**), `url`, … | `expectTitle: prev.title` |

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
  → toast("목록이 바뀌어서 다시 불러왔어요")
```

**자동 재시도는 하지 않는다.** 동기화 후 그 작업이 어디로 갔는지(혹은 사라졌는지)
사용자가 보고 다시 누르는 편이 안전하다. 특히 `deleteTask` 는 자동 재시도가
위험하다 — 되돌릴 수 없는 액션을 사용자 확인 없이 두 번 쏘는 셈이다.

## 배포 순서 — 순서가 틀리면 팀 전원의 삭제가 죽는다

1. **서버 v56**: `expectTitle` 이 **오면** 검사, 없으면 통과 (4종 전부, 하위호환)
2. **타이머 v1.0.28** 배포 → 자동 업데이트로 전원 도달
3. **7명 전원이 1.0.28 인 것을 확인**
4. 그 다음에 서버에서 **`deleteTask` 만** `expectTitle` 필수로

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
