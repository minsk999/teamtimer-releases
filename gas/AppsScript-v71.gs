// ============================================================
//  Google Apps Script v71  (7칸 구조
//  - v71: 2026-11-29 딸깍 세션(6차 점검 — 전문가 8명 + 반박 재현).
//         ① insert 목적지 가드 확대 — 예전엔 제목·요청글 수식·📌▼ 만 봐서, 마지막 작업 바로 아래 줄에 제목 없이
//            메모·마감·기획안만 적혀 있으면 조용히 덮어썼다. 이제 요청글~진행상황 칸의 값·수식이 하나라도 있으면 멈춘다.
//         ② insert 간격 줄 자가 복구 — 빈 줄 삽입이 한 번 실패하면(partial) 간격 줄 자리에 작업이 남아, 그 팀원의 전송이
//            사람이 시트를 고칠 때까지 「멈췄습니다」로 막혔다. 간격 줄 자리가 차 있으면 그 아래에 빈 줄을 넣고 진행한다.
//         ③ 기획안 링크는 「공백 없는 http(s) 주소 하나」일 때만 수식(insert·updateTask) — 「http 로 시작하는 글」이
//            통째로 깨진 HYPERLINK 가 되던 것.
//         ④ litSafe: 제목·메모·관리항목 칸에 쓰는 글이 숫자·날짜 모양(「3-5」「0012」)이면 앞에 ' 를 붙여 글자로 둔다 —
//            시트가 3월 5일·12 로 바꿔 저장하던 것. 마감 칸과 진행상황 칸은 건드리지 않는다(textSafe 그대로).
//            deleteTask 가 줄을 당길 때도 제목·메모 칸은 같은 규칙.
//         ⑤ LATEST_TTALKAK_VER 1.8.11 → 1.8.18.
//  (구) v70  (7칸 구조
//  - v70: 2026-11-28 딸깍 세션(5차 점검 — 전문가 9명 + 반박 재현).
//         ① textSafe 가 '=' 뿐 아니라 '+'·'-'·'@' 로 시작하는 글도 글자로(앞에 ') — 「-수정 요청」「+1 추가」가
//            시트에서 수식으로 읽혀 #ERROR! 가 되던 것. getValue 는 ' 없이 원문을 주므로 읽기·지문 비교는 그대로.
//            타이머 경로(updateTask·addMemo·updateMemo·deleteTask 당김)에도 같이 적용된다.
//         ② insert 가 행을 쓴 뒤(메모·서식·빈 줄 삽입) 실패하면 ok:true 에 partial:true 를 싣는다(withVer 포함).
//            v68 은 ok:true 만 줘서 딸깍이 성공으로 알고 메모 칸을 비웠고(메모 조용히 유실), 빈 줄 삽입이 실패한 것도
//            몰라 그 팀원의 다음 전송이 「멈췄습니다」로 막힐 때까지 아무도 몰랐다. 딸깍 v1.8.11 은 partial 이면
//            메모를 지우지 않고 「시트를 확인해 주세요」를 띄운다. 옛 딸깍은 partial 을 모르므로 v68 과 같다.
//         ③ partial 반환 전에도 읽기 캐시를 버린다 — 행은 들어갔는데 캐시가 살아 타이머 목록에 최대 20초 안 보이던 것(v69 부터 있던 구멍).
//            (글번호 앞 경계 [?&] 는 검토 중 뺐다 — 타이머 idxOf·지문 curIdx 와 규칙이 갈라져 재추가가 「이미 등록」으로 막힐 수 있어
//             양쪽을 한 판에서 같이 바꿀 때 하기로)
//         ④ LATEST_TTALKAK_VER 1.8.10 → 1.8.11.
//  (구) v69  (7칸 구조
//  - v69: 2026-11-28 타이머 세션(사용자 승인). 관리항목(B·C / J·K)의 **스마트 칩 링크**를 읽는다.
//         시트에 문서 주소를 붙여 넣으면 칩이 되는데, 칩의 주소는 RichTextValue 에 안 실려 앱에 글자만 갔다(그 메모를 앱에서
//         고쳐 저장하면 칩 링크가 사라졌다). Sheets 고급 서비스(chipRuns)로 관리항목 칸만 한 번에 읽어 「[칩 글자](주소)」로 넘긴다.
//         같은 칸의 글자 링크(Ctrl+K)도 그대로 살린다. updateMemo 의 지문도 같은 변환으로 비교한다(안 그러면 칩 메모 수정이 늘 stale).
//         고급 서비스가 없거나 실패하면 v68 과 같다(글자만) — 읽기는 멈추지 않는다. 쓰기는 그대로(칩 → 일반 링크로 바뀜, 링크는 보존).
//  (구) v68  (7칸 구조
//  - v68: ① 구분어 판정을 체크박스 행(작업 행)에서도 하지 않는다 — 링크 없이 손으로 적은 작업 제목에 「공지사항」이
//            들어가도 구역이 끊기지 않게. 실제 경계 행(참고사항·공지사항)은 체크 칸이 비어 있다(11-28 실측).
//         ② deleteTask 가 행을 한 칸씩 당길 때 '=' 로 시작하는 글자 값을 textSafe 로 — 예전엔 글자로 저장된
//            「=…」 제목이 당겨지면서 수식이 됐다.
//         ③ insert 가 행을 쓴 뒤(서식 단계에서) 실패하면 ok:true 로 답한다 — ok:false 면 딸깍이 다시 보내게 해서
//            중복 검사를 끈 사람은 같은 글이 두 줄 들어갔다.
//         ④ ?action=versions 의 at 을 날짜까지만(시각은 6시간 판정용으로 속성에만 남긴다).
//         ⑤ LATEST_TTALKAK_VER 1.8.9 → 1.8.10. 타이머 경로(updateTask·addMemo·updateMemo·toggleDone·updateDue)는 그대로.
//  (구) v67  (7칸 구조
//  - v67: findSectionEnd 의 구분어(참고사항·공지사항·팀 업무) 판정을 영상작업 행·📌 관리 행에서는 하지 않는다.
//         작업 제목에 그 단어가 들어가면 구역이 끊겨 아래 작업이 중복 검사·타이머 목록에서 빠지던 것. 지금 시트 해당 0건(11-28 실측) — 판정 변화 없음.
//  (구) v66  (7칸 구조
//  - v66: LATEST_TTALKAK_VER 1.8.8 → 1.8.9(딸깍 게시 뒤). 그 밖은 v65 와 같다.
//  (구) v65  (7칸 구조
//  - v65: LATEST_TTALKAK_VER 1.8.7 → 1.8.8(딸깍 게시 뒤). 그 밖은 v64 와 같다.
//  (구) v64  (7칸 구조
//  - v64: 2026-11-28 작업타이머 점검(teamtimer/_audit/SCORE.md) 반영. 함수 계약·응답 키는 그대로, 새 파라미터는 전부 선택.
//         ① 읽기 캐시 세대 번호: 쓰기마다 세대를 바꾸고, doRead 는 시작 때 세대와 put 직전 세대가 같을 때만 캐시에 넣는다.
//            락 없는 읽기가 쓰기 전 시트를 읽고 쓰기 뒤에 끝나 옛 목록을 20초 캐시에 되넣던 경합(B-4)을 막는다.
//         ② updateMemo: expectB/expectC(클라이언트가 읽어 간 B·C 값)가 오면 현재 값과 비교, 다르면 stale.
//            이름 행·▼업무 구분선이면 거부. (행이 밀린 채 메모를 고치면 위 메모나 이름 칸을 덮을 수 있었다)
//         ④ (딸깍 부탁) insert 성공 때도 버전 기록 · checkFingerprint 매개변수 linkFormula → linkF(전역 함수와 이름 겹침)
//            · updateDue 원문·toggleDone 상태 칸에도 textSafe
//         ③ checkFingerprint: expectLink 가 오면 요청글 링크(C/K 수식의 주소) 전체와 비교.
//  (구) v63  (7칸 구조
//  - v63: 2026-11-28 전문가 점검(intranet-ttalkak/SCORE.md) 반영. 함수 계약·응답 키는 그대로.
//         ① 락을 잡은 직후 그리드 메모(_grid)를 버린다 — 락 전에 읽은 시트로 락 안에서 쓰면
//            동시에 다른 쓰기가 행을 민 경우 남의 작업 행을 덮어쓸 수 있었다(가드도 같은 낡은 그리드를 봄).
//         ② insert 는 제목·링크·기획안·마감을 setValues 한 번으로 쓴다 — 중간 실패 시 반쯤 쓴 행 방지.
//         ③ 수식 주입 차단: '=' 로 시작하는 글자는 글자로 저장, HYPERLINK 주소의 " 이스케이프,
//            javascript: 같은 다른 스킴은 수식으로 만들지 않는다(스킴 없는 주소는 v62 처럼 수식).
//         ④ 중복 판정: idx=10 이 idx=103 에 걸리던 부분일치 → 정확 일치.
//         ⑤ needBlank 의 행 삽입 뒤에도 flush 하고 락을 푼다.
//         ⑥ ?action=members&name=..&ver=.. 이면 「이름·버전·마지막 접속」을 스크립트 속성에 남긴다.
//            GET ?action=versions 로 읽는다(읽기 전용). 시트는 건드리지 않는다.
//  (구) v62  (7칸 구조
//  - v62: LATEST_TTALKAK_VER 1.8 → 1.8.6(기획안 열기), UPDATE_MSG 에 「인트라넷 탭은 F5」 추가. 그 밖은 v61 과 같다.
//  (구) v61  (7칸 구조
//  - v61: members 응답(GET/POST ?action=members)에 latestVer·updateMsg 를 항상 실어 보낸다.
//         딸깍 v1.8.4+ 가 팝업을 열 때 이 값으로 새 버전 알림을 띄운다(예전엔 전송 응답에만 있었다).
//         비교는 클라이언트가 한다(verLt). 타이머도 members 를 부르지만 members 키만 읽으므로 무해.
//  (구) v60  (7칸 구조
//  - v60: ① LATEST_TTALKAK_VER 1.8 + UPDATE_MSG 채움. 딸깍 v1.8(v1.5 형태 + v1.7 기능) 배포에 맞춤.
//            v59(1.7)는 배포된 적 없이 v60 으로 대체됨.
//         ② LockService — 쓰기 전부(타이머 6종 + 딸깍 insert)를 한 번에 하나씩. 8초. 읽기엔 안 건다.
//            못 잡으면 {ok:false, busy:true} (최상위 키). busy = "쓰기가 확실히 안 일어났다" → 재시도 안전.
//         ③ 스테일 행 지문 — toggleDone·updateDue·updateTask·deleteTask 가 expectTitle / expectIdx 를
//            받으면 대상 행과 대조, 다르면 {ok:false, stale:true}. 없으면 건너뜀(하위호환).
//            deleteTask 는 둘 다 봄(되돌릴 수 없는 유일한 액션). stale 은 재시도로 못 고친다 — 동기화 후.
//         ④ deleteTask 의 scanCount<1 가드 — 사람이 시트에서 행을 지워 row 가 lastRow 를 넘으면
//            구글 예외 문자열 대신 stale 응답.
//         설계 합의: server/v55-패치.md 하단 (타이머 세션과 2026-08-27 합의, 09-18 v60 에 합치기로 동의).
//         ★딸깍을 새로 배포할 때마다 이 값을 같이 올릴 것.
//  (구) v58  (7칸 구조
//  - v58: ★신규 입사자용 빈 자리에 남의 작업이 꽂히던 것 수정. 실측으로 원인 3개 확인.
//
//    ① ▼업무 구분선을 못 찾고 있었다 — ▼ 와 "업무" 가 서로 다른 칸에 있다.
//       (체크칸 ▼ / 제목칸 "업무") 칸별로 보면 둘 다 조건에 안 걸린다.
//       addMemo(:672) 는 세 칸을 이어붙여 봐서 맞게 찾고 있었고, insert 만 아예 안 봤다.
//
//    ② 그래서 제목칸의 맨 "업무" 가 그냥 제목으로 잡혔다.
//       구정현처럼 자기 작업 아래에 다음 구역이 있으면
//       그 구역의 "업무" 를 마지막 작업으로 보고 바로 아래(=남의 자리)에 꽂았다.
//       실측: 구정현 lastTitle 80행 → 삽입행 81 (본인 구역은 56~71)
//
//    ③ 이름을 아직 안 적은 빈 자리는 nameAtRow 로 감지되지 않아 경계가 안 잡혔다.
//       실측: 구정현 구역끝 105행 (본인 구역은 77행 앞에서 끝나야 함)
//
//    처방
//     · ★사고를 고치는 것은 이것 하나다 — findSectionEnd 가 ▼업무 구분선을 세어
//       두 번째를 만나면 경계로 본다. 한 구역에 구분선은 하나뿐이므로 두 번째는
//       다음 사람 구역이라는 뜻이고, 이름이 없어도 감지된다.
//       (측정: v57 경계 + 아래 taskStart 조합의 삽입행은 81 로 v57 과 같다.
//        즉 taskStart 만으로는 이 사고가 안 고쳐진다. 되돌릴 때 헷갈리지 말 것)
//     · insert 의 taskStart 는 '작업은 구분선 아래에만' 이라는 의도를 코드에 남기는 것이다.
//       현재 배치에서 결과를 바꾸지 않는다. 무해하지만 사고 수정의 근거는 아니다.
//     · 구분선 판정은 isDividerRow() 하나로 모은다. 부분일치로 두면
//       작업 제목·메모에 ▼ 와 "업무" 가 함께 들어갈 때 구역이 잘려 더 큰 사고가 난다.
//     · 그리고 쓰기 직전에 목적지가 비어 있는지 확인한다. 위치 계산이 또 틀리더라도
//       조용한 덮어쓰기 대신 명확한 오류로 멈춘다.
//  (구) v57  (7칸 구조
//  - v57: 딸깍 확장 버전 알림. 확장이 전송할 때 자기 버전(ver)을 같이 보내고,
//         서버가 LATEST_TTALKAK_VER 보다 낮으면 응답에 latestVer 를 실어 보낸다.
//         확장은 그걸 저장해 두고 실제로 올릴 때까지 팝업 상단에 띄운다.
//
//         zip 수동 배포라 자동 업데이트가 없다 — 지금까지는 누가 구버전을 쓰는지
//         알 방법이 아예 없었다. 이게 그 유일한 신호다.
//
//         ★ 딸깍을 새로 배포할 때 아래 LATEST_TTALKAK_VER 을 같이 올릴 것.
//           안 올리면 알림이 안 뜨고, 너무 올리면 최신을 쓰는 사람에게도 뜬다.
//  (구) v56  (7칸 구조
//  - v56: ★구역 경계를 '명단'이 아니라 '행의 형태'로 판정한다.
//         퇴사자를 🤖자동화 A열에서 지우면 ALL_MEMBERS 에서 빠지는데,
//         업무현황의 그 사람 구역은 남는다. 그러면 그 이름 행이 경계 역할을 잃고
//         바로 위 팀원의 구역이 퇴사자 구역까지 흡수했다.
//         (실제 사고: 박지수 퇴사 → 김본희 읽기 구역이 151행까지 뻗고,
//          딸깍 삽입행이 69→94로 밀리고, 주지현 4건 뒤 TypeError 예정이었음)
//         신규 입사자가 시트에만 있고 아직 명단에 없을 때도 같은 일이 난다 — 같은 버그의 양쪽.
//
//         nameAtRow() 를 새로 두고 findNameRow·findSectionEnd 가 그걸 쓴다.
//         명단 대조를 없애고 v53 의 isNameRowShape 가드 + 한글 2~4자 판정으로만 본다.
//         덤으로 v53 가드가 없던 두 함수의 이름 오탐도 함께 사라진다 —
//         작업 제목에 팀원 이름이 들어가도(예: "한영채 인터뷰 편집") 그 행은
//         HYPERLINK 를 가지므로 이름 행 형태가 아니라 경계로 오인되지 않는다.
//
//         insert 의 인라인 경계 루프도 findSectionEnd 로 대체했다.
//         nameSheetRow+100 기본값이 사라져 배열 범위 초과 TypeError 가 원천 차단된다.
//
//         그리고 '업무현황에는 구역이 있는데 자동화 명단에 없는 이름'을 warn 으로 보고한다.
//         퇴사자 잔존 구역과 미등록 신규 입사자가 눈에 보인다.
//
//         부수: findNameRow·detectStartCol 의 2차 부분일치가 '이미 다른 사람의 이름 행'인
//         줄은 건너뛴다. 신입 이름이 기존 팀원 이름의 일부일 때(예: 신입 "김본" vs 기존 "김본희")
//         남의 구역으로 작업이 들어가는 것을 막는다.
//  (구) v55  (7칸 구조
//  - v55: 딸깍 세션 검토 반영. 전부 타이머 무영향(하위호환).
//         ① scanLen < 1 가드 — 경계가 이름 행에 붙으면 getRange 가 죽거나,
//            중복체크를 끈 경우 기존 작업 행의 B~E 4칸을 조용히 덮어썼다.
//         ② action 화이트리스트 — 인식 못 하는 action 이 insert 로 흘러들어
//            「(제목 없음)」 유령 행을 만들고 전원의 행 번호를 밀던 것 차단.
//         ③ member 파라미터 통일 — updateMemo·addMemo 도 p.member 수용(추가만, 하위호환).
//         ④ READ_ROWS 클램프 — 그리드 행 수를 넘으면 doRead 가 JSON 대신 오류 HTML 을 뱉는다.
//         ⑤ ★쓰기 경로도 readGrid 경유 — v54 의 READ_ROWS 수정이 doRead 에만 적용돼 있었다.
//            readGrid 호출부는 :230(ensureMembers 캐시미스)과 doRead 둘뿐이라,
//            insert 와 addMemo 는 팀원 캐시 적중 시 READ_ROWS=150 으로 읽었다.
//            지금은 lastRow 93 이라 무해하지만 130행을 넘는 순간
//            v54 가 죽이려던 버그(150행 아래 조용히 사라짐)가 쓰기 쪽에서 되살아난다.
//         ※ :1076 경계 기본값 치환(F)은 진단 후 별도 적용 — server/v55-패치.md 참조
//  (구) v54  (7칸 구조
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

// ── 딸깍 확장 버전 알림 (v57) ───────────────────────────────
// 딸깍을 새 버전으로 배포하면 이 값을 같이 올린다.
var LATEST_TTALKAK_VER = "1.8.18";
// 알림에 덧붙일 안내 (빈 문자열이면 "새 버전이 있어요"만 뜬다)
var UPDATE_MSG = "— 받은 zip 을 기존 폴더에 덮어쓰고 chrome://extensions 에서 ↻, 인트라넷 탭은 F5 해 주세요";

// a < b ? — "1.10" 과 "1.9" 를 문자열로 비교하면 틀리므로 자리별 숫자로 본다.
function verLt(a, b) {
  var x = String(a || "0").split("."), y = String(b || "0").split(".");
  var n = Math.max(x.length, y.length);
  for (var i = 0; i < n; i++) {
    var p = parseInt(x[i], 10) || 0, q = parseInt(y[i], 10) || 0;
    if (p !== q) return p < q;
  }
  return false;
}

// 응답 객체에 버전 알림을 얹는다. 구버전이 아니거나 ver 을 안 보냈으면 그대로 둔다.
// (구버전 딸깍은 ver 을 안 보내므로 알림도 못 받는다 — 한 번은 손으로 올려야 한다)
function withVer(obj, clientVer) {
  if (clientVer && verLt(clientVer, LATEST_TTALKAK_VER)) {
    obj.latestVer = LATEST_TTALKAK_VER;
    if (UPDATE_MSG) obj.updateMsg = UPDATE_MSG;
  }
  return obj;
}

// ── 팀원 자동 인식 (v51) ────────────────────────────────────
// 이름 셀에서 한글만 남긴다 — 이모지·기호·영문·숫자·공백 전부 제거.
// 장식 문자를 일일이 열거하는 방식은 새 장식이 나오면 뚫리므로 화이트리스트로 처리.
function hangulOnly(s) {
  return String(s == null ? "" : s).replace(/[^가-힣]/g, "");
}
function isPersonName(s) {
  return /^[가-힣]{2,4}$/.test(s);
}

// v58: 이 행이 '▼업무 구분선'인가 — 형태로 판정한다.
//   느슨하게 보면(▼ 와 "업무" 부분일치) 작업 제목이나 메모에 둘 다 들어갈 때
//   그 행이 구분선으로 오인돼 구역이 잘리고, insert 가 살아 있는 작업 행을 덮어쓴다.
//   addMemo 는 사용자 자유 텍스트를 관리항목 칸에 그대로 쓰므로 메모 한 줄로 만들어진다.
//   그래서 세 조건을 모두 요구한다.
//     ① 영상작업 행이 아닐 것 (HYPERLINK 없음)
//     ② 📌 관리항목 행이 아닐 것
//     ③ 체크·제목·링크 어딘가에 ▼ 가 있고, 제목칸의 한글이 정확히 "업무" 일 것
//   ★ ▼ 와 "업무" 는 서로 다른 칸에 있다(체크칸 ▼ / 제목칸 업무).
//     칸별로 보면 못 찾으므로 ▼ 는 이어붙인 문자열에서 본다.
function isDividerRow(allData, formulas, r, base) {
  if (/HYPERLINK/i.test(String(formulas[r][base + COL.LINK])) ||
      /HYPERLINK/i.test(String(formulas[r][base + COL.PLAN]))) return false;   // 영상작업
  var chk = String(allData[r][base + COL.CHECK] == null ? "" : allData[r][base + COL.CHECK]);
  if (chk.indexOf("📌") !== -1) return false;                                   // 관리항목
  var title = String(allData[r][base + COL.TITLE] == null ? "" : allData[r][base + COL.TITLE]);
  // ▼ 는 제목칸이 아닌 곳(체크칸 또는 링크칸)에 있어야 한다.
  //   실측된 구분선은 제목칸이 정확히 "업무" 이므로 ▼ 가 제목칸에 있을 수 없다.
  //   이 조건이 "메모 본문이 마침 ▼업무" 인 경우를 배제한다.
  var outside = chk + String(allData[r][base + COL.LINK] == null ? "" : allData[r][base + COL.LINK]);
  if (outside.indexOf("▼") === -1) return false;
  return hangulOnly(title) === "업무";
}

// v56: 이 행이 '누군가의 이름 행'인가 — 명단과 대조하지 않고 형태로만 판정한다.
//      맞으면 장식을 걷어낸 이름(한글만)을, 아니면 "" 를 돌려준다.
//      명단에 의존하지 않으므로 퇴사자·미등록 신규입사자의 이름 행도 그대로 인식된다.
//      isNameRowShape 가 HYPERLINK 행(영상작업)·📌 행(관리항목)·체크박스 행·▼ 구분선을 걸러내므로,
//      작업 제목에 사람 이름이 들어가도("한영채 인터뷰 편집") 이름 행으로 오인되지 않는다.
function nameAtRow(allData, formulas, r, base) {
  if (!isNameRowShape(allData, formulas, r, base)) return "";
  var raw = String(allData[r][base + COL.CHECK] == null ? "" : allData[r][base + COL.CHECK]) +
            String(allData[r][base + COL.TITLE] == null ? "" : allData[r][base + COL.TITLE]);
  if (!raw.replace(/\s/g, "")) return "";           // 빈 행
  var n = hangulOnly(raw);
  if (NAME_EXCLUDE.indexOf(n) !== -1) return "";     // 참고사항·공지사항 등
  if (!isPersonName(n)) return "";                   // 한글 2~4자가 아니면 이름 아님
  return n;
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
      // v56: 판정을 nameAtRow 하나로 일원화 (findSectionEnd·findNameRow 와 같은 기준)
      var name = nameAtRow(data, formulas, r, base);
      if (!name) continue;
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
      // v56: findNameRow 와 같은 이유 — 이미 다른 사람의 이름 행이면 부분일치시키지 않는다.
      var other2 = nameAtRow(allData, formulas, r2, base2);
      if (other2 && other2 !== name) continue;
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

    // v56: 반대 방향 점검 — 업무현황에는 구역이 있는데 자동화 명단에 없는 이름.
    //      퇴사자의 잔존 구역이거나, 아직 명단에 안 넣은 신규 입사자다.
    //      v56 부터 경계 판정은 명단과 무관하므로 동작은 정상이지만,
    //      사람이 알아야 정리하거나 등록할 수 있으므로 보고한다.
    //      (그리드는 이미 메모리에 있어 추가 API 호출이 없다)
    var inRoster = {};
    for (var q = 0; q < order.length; q++) inRoster[order[q]] = 1;
    var onSheet = discoverMembers(data, forms);
    for (var q2 = 0; q2 < onSheet.length; q2++) {
      var nm2 = onSheet[q2].name;
      if (inRoster[nm2]) continue;
      inRoster[nm2] = 1;   // 같은 이름 중복 보고 방지
      warn.push(nm2 + " — 업무현황 " + onSheet[q2].row + "행에 구역이 있는데 자동화 명단에 없음" +
                       " (퇴사자면 그대로 둬도 되고, 신규 입사자면 자동화 A열에 추가하세요)");
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
// v61: 세 경로 모두 latestVer·updateMsg 를 얹는다 — 딸깍이 팝업을 열 때 새 버전을 안다.
function membersOut(o) {
  o.latestVer = LATEST_TTALKAK_VER;
  o.updateMsg = UPDATE_MSG;
  return respond(o);
}
// v63: 딸깍이 팝업을 열 때 이름·버전을 실어 보낸다 — 누가 어느 버전을 쓰는지 남긴다(v1.5 사용자 파악).
//      스크립트 속성 한 칸(이름당 1키). 같은 버전이면 6시간에 한 번만 쓴다. 실패해도 명단 응답엔 영향 없음.
function noteClientVersion(e) {
  try {
    var q = (e && e.parameter) || {};
    var name = String(q.name || "").trim(), ver = String(q.ver || "").trim();
    if (!/^[가-힣A-Za-z]{1,12}$/.test(name) || !/^\d+(\.\d+){0,3}$/.test(ver)) return;
    var props = PropertiesService.getScriptProperties(), key = "ttalkakVer:" + name;
    var old = String(props.getProperty(key) || "").split("|");
    var now = new Date();
    if (old[0] === ver && old[1] && now - new Date(old[1]) < 6 * 3600 * 1000) return;
    if (!old[0] && Object.keys(props.getProperties()).filter(function (k) { return k.indexOf("ttalkakVer:") === 0; }).length >= 60) return;
    props.setProperty(key, ver + "|" + now.toISOString());
  } catch (err) {}
}
function clientVersions() {
  try {
    var all = PropertiesService.getScriptProperties().getProperties(), out = {};
    Object.keys(all).forEach(function (k) {
      if (k.indexOf("ttalkakVer:") !== 0) return;
      var v = String(all[k]).split("|");
      out[k.slice(11)] = { ver: v[0], at: String(v[1] || "").slice(0, 10) };   // v68: 날짜까지만
    });
    return respond({ ok: true, latestVer: LATEST_TTALKAK_VER, versions: out });
  } catch (err) { return respond({ ok: false, error: String(err) }); }
}
function membersLight(e) {
  noteClientVersion(e);
  try {
    var cached = CacheService.getScriptCache().get(MEMBER_CACHE_KEY);
    if (cached) {
      var o = JSON.parse(cached);
      if (o && o.order && o.order.length) return membersOut({ ok: true, members: o.order, source: "cache" });
    }
  } catch (e) {}
  var names = null;
  try { names = readMemberNamesFromConfig(); } catch (e2) {}
  if (names && names.length) return membersOut({ ok: true, members: names, source: "config" }); // A열만 읽고 끝
  ensureMembers();
  return membersOut({ ok: true, members: ALL_MEMBERS, cols: MEMBER_COLS, warn: MEMBER_WARN, source: "scan" });
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

// v63: 남이 쓴 글자(인트라넷 제목·메모)가 '=' 로 시작하면 시트가 수식으로 실행한다.
//      앞에 ' 를 붙이면 글자로 저장되고, getValue 는 ' 없이 원문을 돌려준다(읽는 쪽 영향 없음).
function textSafe(s) {
  s = String(s == null ? "" : s);
  return /^[=+\-@]/.test(s) ? "'" + s : s;   // v70: + - @ 도 시트가 수식으로 읽는다
}
// v71: 사람이 쓴 글(제목·메모·관리항목)이 숫자·날짜 모양이면 시트가 값을 바꿔 저장한다(「3-5」→3월 5일, 「0012」→12).
//      그런 글은 ' 를 붙여 글자로 둔다. 마감 칸처럼 시트가 날짜로 읽어야 하는 곳에는 쓰지 말 것(textSafe).
function litSafe(s) {
  s = String(s == null ? "" : s);
  // 숫자로 시작하는 글 전부(「50%」「1e3」「3:00 PM」도 값이 바뀐다 — 글자에 ' 를 붙여도 보이는 모양은 같다)와 TRUE/FALSE
  return /^\s*(\d|true\s*$|false\s*$)/i.test(s) ? "'" + s : textSafe(s);
}
// v71: 기획안 칸 — 공백 없는 http(s) 주소 하나일 때만 링크 수식으로 만든다
function isPlainUrl(s) { return /^https?:\/\/\S+$/.test(String(s || "").trim()); }
// v63: HYPERLINK 수식은 여기서만 만든다. " 는 "" 로(수식 탈출 차단).
//      빈 값과 http(s) 가 아닌 스킴(javascript: 등)만 null. 스킴이 없는 주소는 v62 처럼 그대로 수식으로 —
//      타이머 입력칸이 「intranet.adef.co.kr/...」 형태를 권하고, 이 수식이 있어야 영상작업 행으로 읽힌다.
function linkFormula(url, label) {
  url = String(url || "").trim();
  if (!url) return null;
  if (/^[a-z][a-z0-9+.\-]*:/i.test(url) && !/^https?:/i.test(url)) return null;
  return '=HYPERLINK("' + url.replace(/"/g, '""') + '","' + label + '")';
}

// 쓰기: "[라벨](주소)"가 들어오면 셀에 실제 링크(리치텍스트)로 기록 → 시트에서도 링크로 보임.
//       링크 패턴이 없으면 일반 setValue.
function setCellSmart(cell, val) {
  var s = String(val == null ? "" : val);
  var re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  if (!re.test(s)) { cell.setValue(litSafe(s)); return; }
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
  } catch (err) { cell.setValue(litSafe(s)); } // 실패 시 원문 텍스트로 폴백
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
  // v55: 그리드 행 수를 넘으면 getRange 가 예외를 던져 doRead 가 JSON 대신 오류 HTML 을 뱉는다.
  READ_ROWS = Math.min(sheet.getMaxRows(), Math.max(150, sheet.getLastRow() + 20));
  var rng = sheet.getRange(1, 1, READ_ROWS, READ_COLS);
  _grid = { data: rng.getValues(), forms: rng.getFormulas() };
  return _grid;
}

// ── 읽기 응답 캐시 (v54) ─────────────────────────────────────
// ★쓰기가 일어나면 반드시 버려야 한다. 안 버리면 "완료 체크했는데 되돌아옴"이 생긴다.
var READ_CACHE_KEY = "teamtimer_read_v1";
var READ_CACHE_SEC = 20;
var READ_GEN_KEY = "teamtimer_read_gen";   // v64
function bustReadCache() {
  try {
    var c = CacheService.getScriptCache();
    c.remove(READ_CACHE_KEY);
    c.put(READ_GEN_KEY, String(new Date().getTime()) + "-" + Math.random(), 21600);
  } catch (e) {}
}
function readGen() {
  try { return CacheService.getScriptCache().get(READ_GEN_KEY) || "0"; } catch (e) { return ""; }
}

// ── 공통 헬퍼 ───────────────────────────────────────────────
function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// v60 ★스테일 행 지문 — 타이머가 들고 있던 행 번호가 그 사이 밀렸는지 확인한다.
//   타이머는 행 번호를 화면에 들고 있다가 그 번호로 쓴다(동기화 10분 주기 → 최대 10분 스테일 창).
//   그 사이 딸깍 insert 가 행을 밀면 옆 행을 건드린다. isVideo 가드는 "영상작업 행인가"만 보지
//   "그 작업이 맞는가"는 안 본다 — 밀린 옆 행도 영상작업 행이라 통과한다. 이 검사가 그걸 본다.
//     expectTitle : 제목칸(B/J) 현재값과 trim 비교
//     expectIdx   : 요청글 링크(C/K) HYPERLINK 수식에서 뽑은 idx 와 비교
//   두 지문의 실패 조건이 서로 반대다 — idx 는 "다른 게시글·같은 제목"을 잡고 "같은 게시글·여러 행"을
//   놓친다, 제목은 그 반대. 그래서 deleteTask 는 둘 다 본다.
//   파라미터가 없거나 빈 값이면 그 검사는 건너뛴다 — 구버전 타이머·딸깍은 안 보낸다(하위호환).
//   linkFormula 는 호출자가 isVideo 판정용으로 이미 읽은 C/K 수식이다. 새로 읽지 않는다.
//   실패 → {ok:false, stale:true, row, found, foundIdx}. busy 와 달리 재시도로 못 고친다.
//   ⚠ updateTask 의 title 은 *바꿀 새 제목*이라 지문이 아니다 — 클라이언트가 prev.title 을 expectTitle 로 보낸다.
function checkFingerprint(p, sheet, row, startCol, linkF) {
  var wantIdx   = (p.expectIdx   == null) ? "" : String(p.expectIdx).trim();
  var wantTitle = (p.expectTitle == null) ? "" : String(p.expectTitle).trim();
  var wantLink  = (p.expectLink  == null) ? "" : String(p.expectLink).trim();   // v64
  if (!wantIdx && !wantTitle && !wantLink) return null;
  var curIdx   = (String(linkF == null ? "" : linkF).match(/idx=(\d+)/) || [])[1] || "";
  var curTitle = String(sheet.getRange(row, startCol + COL.TITLE).getValue()).trim();
  var okIdx    = !wantIdx   || curIdx   === wantIdx;
  var okTitle  = !wantTitle || curTitle === wantTitle;
  var okLink   = !wantLink  || String(extractUrl(linkF)).trim() === wantLink;   // v64: 앱이 읽어 간 것도 extractUrl 결과다
  if (okIdx && okTitle && okLink) return null;
  return respond({ ok: false, stale: true, row: row, found: curTitle, foundIdx: curIdx,
                   error: "행이 밀렸어요 — 동기화 후 다시 시도해 주세요" });
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
// ── v69: 스마트 칩 ───────────────────────────────────────────
function colA1(c) { var s = ""; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
// cells: [{r: 1-based 행, c: 1-based 열}] → { "r,c": { fv: 보이는 글자, runs: chipRuns } } — 칩(주소 있는 것)이 있는 칸만
function chipRunsFor(sheet, cells) {
  var out = {};
  if (!cells.length || typeof Sheets === "undefined") return out;
  try {
    var name = sheet.getName().replace(/'/g, "''");
    var res = Sheets.Spreadsheets.get(SpreadsheetApp.getActiveSpreadsheet().getId(), {
      ranges: cells.map(function (x) { return "'" + name + "'!" + colA1(x.c) + x.r; }),
      fields: "sheets.data(startRow,startColumn,rowData.values(formattedValue,chipRuns))"
    });
    var data = (res && res.sheets && res.sheets[0] && res.sheets[0].data) || [];
    for (var i = 0; i < data.length; i++) {
      var d = data[i], v = d.rowData && d.rowData[0] && d.rowData[0].values && d.rowData[0].values[0];
      if (!v || !v.chipRuns) continue;
      var has = v.chipRuns.some(function (cr) { return cr.chip && cr.chip.richLinkProperties && /^https?:\/\//i.test(cr.chip.richLinkProperties.uri || ""); });
      if (has) out[((d.startRow || 0) + 1) + "," + ((d.startColumn || 0) + 1)] = { fv: String(v.formattedValue || ""), runs: v.chipRuns };
    }
  } catch (err) { Logger.log("chipRunsFor: " + err); }
  return out;
}
// 칩 정보 + (같은 글자라면) 리치텍스트 링크 → 「[글자](주소)」 마크다운. 글자 위치마다 주소를 정한 뒤 같은 주소끼리 묶는다.
function chipMd(info, rich) {
  var t = info.fv, url = new Array(t.length), k;
  try {
    if (rich && rich.getText && rich.getText() === t) rich.getRuns().forEach(function (rn) {
      var u = rn.getLinkUrl(); if (u) for (k = rn.getStartIndex(); k < rn.getEndIndex(); k++) url[k] = u;
    });
  } catch (e) {}
  var rs = info.runs;
  for (var i = 0; i < rs.length; i++) {
    var st = rs[i].startIndex || 0, en = (i + 1 < rs.length) ? (rs[i + 1].startIndex || 0) : t.length;
    var u2 = rs[i].chip && rs[i].chip.richLinkProperties && rs[i].chip.richLinkProperties.uri;
    if (u2 && /^https?:\/\//i.test(u2)) for (k = st; k < en; k++) url[k] = u2;
  }
  var out = "";
  for (k = 0; k < t.length;) {
    var j = k; while (j < t.length && url[j] === url[k]) j++;
    out += url[k] ? "[" + t.slice(k, j) + "](" + url[k] + ")" : t.slice(k, j);
    k = j;
  }
  return out.trim();
}

function getSheet() {
  return findSheetByHint(MAIN_SHEET_HINT) || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

// =HYPERLINK("url","label") 에서 url만 추출
function extractUrl(formula) {
  // v63: 주소 안의 " 는 linkFormula 가 "" 로 적는다 — 되읽을 때 거기서 잘리지 않게
  var m = String(formula).match(/HYPERLINK\(\s*"((?:[^"]|"")+)"/i);
  return m ? m[1].replace(/""/g, '"') : "";
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

// 이름 행 탐색 (1-based).
// v56: v53 이 detectStartCol 에만 넣었던 '이름 행 형태' 가드를 여기에도 적용한다.
//      예전엔 형태를 안 보고 indexOf 만 해서, 자기 이름 행보다 위에 있는
//      남의 작업 제목("한영채 인터뷰 편집")을 이름 행으로 오인할 수 있었다.
//      그러면 그 사람의 작업 목록이 통째로 남의 구역에서 시작된다.
// 1차: 장식을 걷어내면 이름과 정확히 같은 이름 행 / 2차: 이름 칸에 직함 등이 붙은 경우
function findNameRow(allData, formulas, member, startCol) {
  var base = startCol - 1;
  for (var r = 0; r < allData.length; r++) {
    if (nameAtRow(allData, formulas, r, base) === member) return r + 1; // 1-based
  }
  for (var r2 = 0; r2 < allData.length; r2++) {
    if (!isNameRowShape(allData, formulas, r2, base)) continue;
    // ★ 이미 '다른 사람의 이름 행'으로 확정된 줄은 건너뛴다.
    //   신입 이름이 기존 팀원 이름의 일부일 때(예: 신입 "김본" vs 기존 "김본희")
    //   부분일치가 남의 이름 행을 잡아 그 사람 구역으로 작업이 들어가는 것을 막는다.
    //   장식·직함이 붙어 nameAtRow 가 "" 를 주는 줄은 그대로 부분일치 대상이다
    //   (예: "구민석 팀장" → hangulOnly 5자라 이름 판정 실패 → 여기서 잡아야 함).
    var other = nameAtRow(allData, formulas, r2, base);
    if (other && other !== member) continue;
    var raw2 = String(allData[r2][base + COL.CHECK] == null ? "" : allData[r2][base + COL.CHECK]) +
               String(allData[r2][base + COL.TITLE] == null ? "" : allData[r2][base + COL.TITLE]);
    if (raw2.indexOf(member) !== -1) return r2 + 1;
  }
  return -1;
}

// 섹션 끝(=다음 섹션 시작 행, 1-based) 탐색.
// v56: ★명단(ALL_MEMBERS)과 대조하지 않는다. '이름 행 형태인가'만 본다.
//      예전엔 명단에 있는 이름만 경계로 인정해서,
//        · 퇴사자를 자동화 A열에서 지우면 그 구역이 경계를 잃고 위 팀원이 흡수
//        · 신규 입사자가 시트에만 있고 명단에 없으면 역시 위 팀원이 흡수
//      명단은 사람이 관리하는 것이고 시트 배치는 그와 별개로 움직이므로
//      경계는 시트 자체에서 읽어야 한다.
function findSectionEnd(allData, formulas, member, startCol, nameRow) {
  var base = startCol - 1;
  var dividers = 0;
  for (var r = nameRow; r < allData.length; r++) { // r=0-based → 시트행 r+1 (이름행 다음부터)
    var combined = String(allData[r][base]) + String(allData[r][base + COL.TITLE]);
    // v67: 영상작업 행(링크·기획안 칸에 HYPERLINK)과 📌 관리 행은 구분어로 보지 않는다.
    //      예전엔 작업 제목에 「공지사항」·「팀 업무」가 들어가면 그 행에서 구역이 끊겨, 아래 작업이
    //      중복 검사와 타이머 목록에서 빠졌다(점수표 R-1). 실제 경계 행은 링크도 📌 도 없다(11-28 실측: 참고사항·공지사항 두 줄).
    var isTaskRow = /HYPERLINK/i.test(String(formulas[r][base + COL.LINK])) || /HYPERLINK/i.test(String(formulas[r][base + COL.PLAN]));
    var isPinRow  = String(allData[r][base + COL.CHECK]).indexOf("📌") !== -1;
    var isChkRow  = typeof allData[r][base + COL.CHECK] === "boolean";   // v68: 체크박스 = 작업 행
    if (!isTaskRow && !isPinRow && !isChkRow) {
      for (var k = 0; k < BOUNDARY_WORDS.length; k++) {
        if (combined.indexOf(BOUNDARY_WORDS[k]) !== -1) return r + 1;
      }
    }
    // 같은 단에서 '다른 사람의 이름 행'을 만나면 거기가 경계 (명단 등재 여부 무관)
    var n = nameAtRow(allData, formulas, r, base);
    if (n && n !== member) return r + 1;
    // v58: ▼업무 구분선은 한 구역에 하나뿐이다. 두 번째를 만나면 다음 사람 구역이다.
    //      신규 입사자용 빈 자리를 미리 만들어 두면 이름이 없어 nameAtRow 로는 안 잡힌다 —
    //      구분선이 그 경계 신호가 된다.
    //      ★ ▼ 와 "업무" 가 서로 다른 칸에 나뉘어 있으므로(체크칸 ▼ / 제목칸 업무)
    //        반드시 이어붙인 문자열에서 봐야 한다. 칸별로 보면 못 찾는다.
    if (isDividerRow(allData, formulas, r, base)) {
      dividers++;
      if (dividers >= 2) return r + 1;
    }
  }
  return allData.length + 1;
}

// ── 읽기: 한 팀원의 영상작업/관리항목 분리 ────────────────────
function buildMemberData(allData, formulas, richAt, member) {
  var startCol = MEMBER_COLS[member];
  var side     = (startCol === 1) ? "left" : "right";
  var base     = startCol - 1; // 0-based 시작열

  var nameRow = findNameRow(allData, formulas, member, startCol);
  if (nameRow === -1) {
    return { name: member, side: side, error: "이름 못찾음", video: [], mgmt: [] };
  }
  var endRow  = findSectionEnd(allData, formulas, member, startCol, nameRow); // 1-based 다음 섹션 시작
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
  var gen0 = only0 ? "" : readGen();   // v64: 이 세대가 put 직전까지 그대로일 때만 캐시에 넣는다
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
  // v69: 관리항목 칸의 스마트 칩 링크(한 번의 Sheets API 요청). 칩이 있는 칸만 바꾼다.
  var chipCells = [];
  members.forEach(function (m) {
    var sc = MEMBER_COLS[m.name]; if (!sc) return;
    m.mgmt.forEach(function (it) {
      if (it.b) chipCells.push({ r: it.row, c: sc + COL.TITLE });
      if (it.c) chipCells.push({ r: it.row, c: sc + COL.LINK });
    });
  });
  var chips = chipRunsFor(sheet, chipCells);
  if (Object.keys(chips).length) members.forEach(function (m) {
    var sc = MEMBER_COLS[m.name]; if (!sc) return;
    m.mgmt.forEach(function (it) {
      var kb = it.row + "," + (sc + COL.TITLE), kc = it.row + "," + (sc + COL.LINK);
      if (chips[kb]) it.b = chipMd(chips[kb], richAt(it.row - 1, sc - 1 + COL.TITLE));
      if (chips[kc]) it.c = chipMd(chips[kc], richAt(it.row - 1, sc - 1 + COL.LINK));
    });
  });
  // v51: memberNames = 시트에서 인식한 팀원 이름 목록(순서 포함). 앱/확장이 이걸로 목록을 구성.
  var payload = JSON.stringify({ ok: true, members: members, memberNames: ALL_MEMBERS, warn: MEMBER_WARN });
  if (!only0) {
    // CacheService 는 키당 100KB 한도 — 넘으면 조용히 실패하므로 미리 거른다.
    // v64: 읽는 사이 쓰기가 있었으면(세대가 바뀜) 이 응답은 쓰기 전 시트일 수 있다 — 돌려주기만 하고 캐시에는 안 넣는다.
    try { if (payload.length < 90000 && gen0 && readGen() === gen0) CacheService.getScriptCache().put(READ_CACHE_KEY, payload, READ_CACHE_SEC); } catch (e4) {}
  }
  return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
}

// ── 쓰기: 관리항목 B/C 텍스트 되받아쓰기 ─────────────────────
function updateMemo(p) {
  var target = p.member || p.targetMember || "";   // v55: member 도 수용(추가만, 하위호환)
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
  // v64 ★행 지문 — 이름 행·구분선은 메모가 아니다. 그리고 앱이 읽어 간 B·C 가 지금도 그 행에 있어야 쓴다.
  //   앱이 읽는 값은 buildMemberData 와 같은 cellToMd 변환이므로 같은 변환으로 비교한다. 안 보내면(옛 앱) 건너뛴다.
  var g = readGrid(sheet), base = startCol - 1, r0 = row - 1;
  if (r0 < g.data.length && (nameAtRow(g.data, g.forms, r0, base) || isDividerRow(g.data, g.forms, r0, base))) {
    // 지문을 보낸 앱이면 stale 로 — 행이 밀린 것이라 다시 받으면 풀린다(앱이 재동기화한다)
    return respond({ ok: false, stale: (p.expectB != null || p.expectC != null),
                     error: "이 행은 이름 행·구분선이라 메모 수정 대상이 아닙니다. row=" + row });
  }
  if (p.expectB != null || p.expectC != null) {
    var bCell = sheet.getRange(row, startCol + COL.TITLE), cCell = sheet.getRange(row, startCol + COL.LINK);
    var curB = cellToMd(bCell.getRichTextValue(), bCell.getValue(), bCell.getFormula());
    var curC = cellToMd(cCell.getRichTextValue(), cCell.getValue(), "");
    // v69: 앱이 받은 값은 칩 링크까지 바꾼 것 — 같은 변환으로 비교한다
    var ch = chipRunsFor(sheet, [{ r: row, c: startCol + COL.TITLE }, { r: row, c: startCol + COL.LINK }]);
    if (ch[row + "," + (startCol + COL.TITLE)]) curB = chipMd(ch[row + "," + (startCol + COL.TITLE)], bCell.getRichTextValue());
    if (ch[row + "," + (startCol + COL.LINK)]) curC = chipMd(ch[row + "," + (startCol + COL.LINK)], cCell.getRichTextValue());
    if ((p.expectB != null && String(p.expectB).trim() !== String(curB).trim()) ||
        (p.expectC != null && String(p.expectC).trim() !== String(curC).trim())) {
      return respond({ ok: false, stale: true, row: row, found: String(curB || curC).slice(0, 40),
                       error: "행이 밀렸어요 — 동기화 후 다시 시도해 주세요" });
    }
  }

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
  var target = p.member || p.targetMember || "";   // v55: member 도 수용(추가만, 하위호환)
  var text   = (p.text == null ? "" : String(p.text));
  var startCol = MEMBER_COLS[target];
  if (!startCol) return respond({ ok: false, error: "팀원 이름 없음: " + target });
  if (!text.trim()) return respond({ ok: false, error: "빈 텍스트" });

  var sheet    = getSheet();
  var _g       = readGrid(sheet);   // v55: 위와 같은 이유 (구: getRange 직접)
  var allData  = _g.data;
  var formulas = _g.forms;
  var base     = startCol - 1;

  var nameRow = findNameRow(allData, formulas, target, startCol);
  if (nameRow === -1) return respond({ ok: false, error: target + " 이름 못찾음" });
  var endRow = findSectionEnd(allData, formulas, target, startCol, nameRow); // 1-based 다음 섹션 시작

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
  var stale = checkFingerprint(p, sheet, row, startCol, f[0]);   // v60
  if (stale) return stale;

  try {
    var chkCell = sheet.getRange(row, startCol + COL.CHECK);
    chkCell.setValue(done);                 // 체크박스 A/I
    chkCell.setFontColor(CHECK_FONT_COLOR); // v50: 체크박스 색 통일
    var statusCell = sheet.getRange(row, startCol + COL.STATUS); // 상태 G/O
    statusCell.setValue(textSafe(status));   // v64: textSafe
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
  var stale = checkFingerprint(p, sheet, row, startCol, f[0]);   // v60
  if (stale) return stale;

  try {
    var dm = dueDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    var dueCell = sheet.getRange(row, startCol + COL.DATE); // E/M
    if (dm) {
      dueCell.setValue(new Date(+dm[1], +dm[2] - 1, +dm[3]));
      dueCell.setNumberFormat("mm / dd"); // 캘린더 작동 + MM/DD 표시
    } else {
      dueCell.setValue(textSafe(dueDate)); // 형식 다르면 원문(v64: textSafe)
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
  var stale = checkFingerprint(p, sheet, row, startCol, f[0]);   // v60 — expectTitle 은 prev.title 이어야 한다
  if (stale) return stale;

  try {
    // 제목 (B/J)
    var titleCell = sheet.getRange(row, startCol + COL.TITLE);
    titleCell.setValue(litSafe(title));
    titleCell.setHorizontalAlignment("left"); // B/J 좌측정렬
    // 요청글 링크 (C/K) — HYPERLINK 수식
    var linkCell = sheet.getRange(row, startCol + COL.LINK);
    var lf = linkFormula(url, "🔗요청글링크");
    if (lf) linkCell.setFormula(lf);
    else    linkCell.clearContent();
    linkCell.setHorizontalAlignment("left"); // C/K 좌측정렬
    // 기획안 링크 (D/L) — http면 HYPERLINK, 아니면(NAS 경로·텍스트) 그대로 텍스트
    var planCell = sheet.getRange(row, startCol + COL.PLAN);
    if (planLink) {
      var pf = isPlainUrl(planLink) ? linkFormula(planLink, "🔗기획안링크") : null;   // v62 규칙: 기획안은 http 일 때만 수식(v71: 공백 없는 주소 하나)
      if (pf) planCell.setFormula(pf);
      else planCell.setValue(textSafe(planLink)); // NAS 경로(/cr/...)·일반 텍스트는 수식이 아니라 값으로
    } else {
      planCell.clearContent();
    }
    planCell.setHorizontalAlignment("left"); // D/L 좌측정렬
    // 마감 (E/M)
    var dm = dueDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    var dueCell = sheet.getRange(row, startCol + COL.DATE);
    if (dm) { dueCell.setValue(new Date(+dm[1], +dm[2] - 1, +dm[3])); dueCell.setNumberFormat("mm / dd"); }
    else if (dueDate) { dueCell.setValue(textSafe(dueDate)); }
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
  // v60: 사람이 시트에서 행을 지우면 타이머가 들고 있던 row 가 lastRow 를 넘는다.
  //      그러면 아래 getRange(row, col, 0, 2) 가 구글 예외를 던지고 그 문자열이 그대로 사용자에게 갔다.
  if (scanCount < 1) {
    return respond({ ok: false, stale: true, row: row, found: "", foundIdx: "",
                     error: "그 행이 더 이상 없어요 — 동기화 후 다시 시도해 주세요" });
  }
  var linkF = sheet.getRange(row, startCol + COL.LINK, scanCount, 2).getFormulas(); // C,D (또는 K,L)
  function isVid(i) { return /HYPERLINK/i.test(String(linkF[i][0])) || /HYPERLINK/i.test(String(linkF[i][1])); }
  if (!isVid(0)) return respond({ ok: false, error: "영상작업 행이 아님(보호): row " + row });
  // v60: 되돌릴 수 없는 유일한 액션이라 지문을 둘 다 본다. linkF[0][0] 은 방금 읽은 C/K 수식.
  var stale = checkFingerprint(p, sheet, row, startCol, linkF[0][0]);
  if (stale) return stale;

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
        // v68: 글자로 저장된 「=…」 를 그대로 setValues 하면 수식이 된다 — textSafe 로 글자 유지
        else vals[i][c] = forms[i + 1][c] ? forms[i + 1][c]
                        : (typeof vals[i + 1][c] !== "string" ? vals[i + 1][c]
                           : (c === COL.TITLE || c === COL.MEMO) ? litSafe(vals[i + 1][c]) : textSafe(vals[i + 1][c]));   // v71: 제목·메모는 숫자 모양도 글자로
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
    var nameRow = findNameRow(allData, formulas, member, startCol);
    if (nameRow === -1) continue;
    var endRow = findSectionEnd(allData, formulas, member, startCol, nameRow);
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
  if (action === "members") return membersLight(e);  // 업무현황 시트 안 읽음
  if (action === "versions") return clientVersions(); // v63: 팀원별 딸깍 버전(읽기 전용)
  if (action === "read")    return doRead(e);       // doRead 안에서 ensureMembers 호출
  return respond({ ok: true, message: "웹앱 정상 동작 중" });
}

function doPost(e) {
  var lock = null, written = "";
  try {
    var p      = e.parameter;
    var action = p.action || "insert";

    if (action === "members")    return membersLight(e);  // 업무현황 시트 안 읽음
    ensureMembers();
    if (action === "read")       return doRead(e);

    // v60 ★LockService — 여기서부터 아래는 전부 쓰기(타이머 6종 + 딸깍 insert)다. 한 번에 하나씩.
    //   읽기(doRead)에는 걸지 않는다 — 걸면 v54 가 1~2초로 내린 동기화가 다시 70초까지 간다.
    //   8초 = 타이머 HTTP 20초에서 역산(콜드스타트 5 + 락 8 + 쓰기 3 = 16). 딸깍도 20초.
    //   ★ busy 는 "쓰기가 확실히 안 일어났다"는 뜻이어야 클라이언트 재시도가 안전하다.
    //     그래서 tryLock 실패는 어떤 쓰기보다도, bustReadCache 보다도 앞에서 반환한다.
    //     busy 를 최상위 키로 — error 문자열 안에 넣으면 타이머가 못 잡는다.
    //   stale 은 다르다(아래 checkFingerprint) — 행 번호 자체가 틀린 것이라 재시도로 못 고친다.
    lock = LockService.getScriptLock();
    if (!lock.tryLock(8000)) {
      lock = null;
      return respond({ ok: false, busy: true, error: "다른 저장이 진행 중이에요. 잠시 후 다시 시도해 주세요." });
    }
    // v63 ★락 전에 ensureMembers 가 읽어 메모한 그리드는 버린다. 그사이 다른 쓰기가 행을 밀었을 수 있다 —
    //   낡은 그리드로 삽입 위치를 잡으면 목적지 가드도 같은 낡은 값을 봐서 남의 행을 덮어쓴다.
    _grid = null;

    // v54 ★쓰기 경로: 읽기 캐시를 버리고 실행한 뒤 **한 번 더** 버린다.
    //   (v60: 이 bustReadCache 는 락 안쪽이다. 밖에 두면 "버리고 → 남이 옛 데이터 재캐싱 → 쓰기"
    //    순서가 생겨 v54 가 잡은 「완료 체크했는데 되돌아옴」이 재발한다.)
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
    // v55: 인식 못 하는 action 이 아래 insert 로 흘러드는 것을 막는다.
    // 예전엔 action=toggledone(소문자) 같은 오타 하나가 완료 토글이 아니라
    // 「(제목 없음)」 행 삽입이 되고, needBlank 경로까지 돌아 전원의 행 번호를 밀었다.
    // 클라이언트는 {ok:true} 를 받아 화면과 시트가 갈라진 채로 남았다.
    // 딸깍은 action 을 아예 안 보내므로 "insert" 기본값 경로는 그대로 유지된다.
    else if (action !== "insert") {
      return respond({ ok: false, error: "알 수 없는 action: " + action });
    }
    if (out) { bustReadCache(); return out; }

    // ===== 이하 전송(insert) — v55~v58 경계 판정, v63 한 번에 쓰기·수식 주입 차단 =====
    var target    = p.targetMember || "";
    var title     = p.title        || "(제목 없음)";
    var sourceUrl = p.url          || "";
    var planLink  = p.planLink     || "";
    var dueDate   = p.dueDate      || "";
    var memo      = p.memo         || "";
    var dupCheck  = p.dupCheck !== "0";
    var clientVer = p.ver          || "";   // v57: 딸깍이 보낸 자기 버전

    var startCol = MEMBER_COLS[target];
    if (!startCol) return respond({ ok: false, error: "팀원 이름 없음: " + target });

    var sheet   = getSheet();

    // ── 전체 데이터 한 번에 읽기 (1-based 행 기준으로 통일) ──
    var _gi         = readGrid(sheet);   // v55: READ_ROWS 확정 + 요청당 1회 읽기
    var allData     = _gi.data;
    var insFormulas = _gi.forms;         // v56: 이름 행 형태 판정에 필요

    // v56: 읽기(doRead)와 같은 함수를 쓴다. 예전엔 여기만 인라인 루프였고 규칙이 달랐다 —
    //      좌·우 네 칸을 합쳐 보고(반대편 단 이름에도 끊김) 자기 이름 skip 도 없었다.
    //      이제 읽기와 쓰기가 같은 구역을 본다.
    var nameSheetRow = findNameRow(allData, insFormulas, target, startCol);
    if (nameSheetRow === -1) return respond({ ok: false, error: target + " 이름을 찾을 수 없음" });

    // v56: nameSheetRow+100 기본값 제거.
    //      findSectionEnd 의 무경계 반환은 allData.length + 1 이라 −1 하면 항상 배열 안이다.
    //      예전 기본값은 최하단 팀원(경계 없음)에서 allData 를 넘어 TypeError 를 냈다.
    //  ★ '- 1' 을 반드시 유지할 것. findSectionEnd 는 경계 행(1-based)을 돌려주는데
    //    이 자리는 그보다 1 작은 값을 쓴다. 이 1칸이 아래 needBlank 의 간격행 보존을 지탱한다.
    //    빼면 needBlank 가 false 로 뒤집혀 팀원 사이 간격행을 잡아먹고,
    //    그다음 전송이 다음 팀원 이름 행을 덮어쓴다.
    var sectionEndSheetRow = findSectionEnd(allData, insFormulas, target, startCol, nameSheetRow) - 1;

    // v71: 간격 줄 자가 복구. sectionEndSheetRow(경계 바로 앞 줄)는 팀원 사이 간격 줄이어야 한다.
    //   빈 줄 삽입이 실패한 적이 있으면(v70 partial) 그 자리에 작업이 남아, 삽입 위치가 계속 그 줄로 계산돼 가드에 막혔다.
    //   그 줄이 차 있으면 아래에 빈 줄을 하나 넣어 간격을 되살리고, 읽어 둔 그리드에도 같은 빈 줄을 끼운다.
    //   경계가 실제로 있을 때만(맨 아래 팀원의 「경계 없음」은 그리드 끝이라 건드리지 않는다).
    var gIdx = sectionEndSheetRow - 1;   // 0-based 간격 줄
    //   ★ 그 줄이 「내 작업 줄 모양」(체크박스 또는 요청글 링크, 📌·▼ 아님)일 때만. 제목 글자만 보면 다음 자리의 📌 줄·
    //     nameAtRow 에 안 잡히는 이름 줄·머리글을 내 작업으로 오인해 새 글을 남의 자리 안쪽에 써넣는다(반박 검수 재현).
    //     partial 로 남은 줄은 insertCheckboxes 뒤라 늘 체크박스가 있다.
    var gChk = allData[gIdx] ? allData[gIdx][startCol - 1 + COL.CHECK] : "";
    if (gIdx > nameSheetRow && sectionEndSheetRow < allData.length &&
        (gChk === true || gChk === false || /HYPERLINK/i.test(String(insFormulas[gIdx][startCol - 1 + COL.LINK]))) &&
        !/[📌▼]/u.test(String(gChk)) &&
        (String(allData[gIdx][startCol - 1 + COL.TITLE]).trim() ||
         /HYPERLINK/i.test(String(insFormulas[gIdx][startCol - 1 + COL.LINK])))) {
      sheet.insertRowAfter(sectionEndSheetRow);
      sheet.getRange(sectionEndSheetRow + 1, 1, 1, sheet.getLastColumn())
           .clearContent().clearDataValidations().clearFormat();
      SpreadsheetApp.flush();
      var blankRow = function (n) { var a = []; for (var q = 0; q < n; q++) a.push(""); return a; };
      allData.splice(gIdx + 1, 0, blankRow(allData[gIdx].length));
      insFormulas.splice(gIdx + 1, 0, blankRow(insFormulas[gIdx].length));
      sectionEndSheetRow++;
      bustReadCache();   // 줄을 밀었다 — 이 뒤에 「중복」·가드로 일찍 끝나도 타이머가 어긋난 행 번호를 받지 않게
    }

    var scanStart    = nameSheetRow;           // 1-based, 이름 행 다음부터
    var scanEnd      = sectionEndSheetRow - 1;  // 1-based, 섹션 마지막 행
    var scanLen      = scanEnd - scanStart;

    // v55: 경계가 이름 행에 바로 붙으면 scanLen 이 0 또는 음수가 된다.
    // 그대로 두면 아래 getRange 가 "numRows must be at least 1" 로 죽고,
    // 중복체크를 끈 경우엔 lastTitleSheetRow 가 이름 행에 머물러
    // insertRow 가 기존 작업 행을 가리켜 B~E 4칸을 조용히 덮어쓴다.
    if (scanLen < 1) {
      return respond({ ok: false, error: target +
        " 섹션 범위 계산 실패(경계가 이름 행에 붙어 있음). " +
        "관리항목·작업 제목에 다른 팀원 이름이 있는지 확인해 주세요." });
    }

    // 중복 체크
    if (dupCheck && sourceUrl) {
      var idxNum   = (sourceUrl.match(/idx=(\d+)/) || [])[1];
      var idxRe    = idxNum ? new RegExp("idx=" + idxNum + "(?!\\d)") : null;   // v63: 10 이 103 에 걸리지 않게
      var formulas = sheet.getRange(scanStart + 1, startCol + COL.LINK, scanLen, 1).getFormulas();
      for (var i = 0; i < scanLen; i++) {
        var hay = String(allData[scanStart + i][startCol - 1 + COL.LINK]) + String(formulas[i][0]);
        if (idxRe ? idxRe.test(hay) : hay.indexOf(sourceUrl) !== -1) {
          return respond(withVer({ ok: false, duplicate: true, message: "이미 등록된 게시글입니다." }, clientVer));
        }
      }
    }

    // v58: 이 구역의 ▼업무 구분선을 찾는다. addMemo 와 같은 규칙 —
    //      ▼ 와 "업무" 가 다른 칸에 있으므로 세 칸을 이어붙여서 본다.
    var dividerRow = -1;
    for (var dv = scanStart; dv < scanEnd && dv < allData.length; dv++) {
      if (isDividerRow(allData, insFormulas, dv, startCol - 1)) { dividerRow = dv + 1; break; }
    }
    // 작업은 구분선 아래에만 들어간다. 구분선을 못 찾으면 예전처럼 이름 행 다음부터(하위호환).
    var taskStart = (dividerRow !== -1) ? dividerRow : scanStart;

    // 삽입 위치: 작업 구간에서 제목이 있는 마지막 행 바로 다음 (1-based)
    // 예전엔 이름 행 다음부터 훑어서, 구분선 제목칸의 "업무" 도 제목으로 셌다.
    var lastTitleSheetRow = taskStart;
    for (var j = taskStart; j < scanEnd && j < allData.length; j++) { // j=0-based → 시트행 j+1
      if (String(allData[j][startCol - 1 + COL.TITLE]).trim()) {
        lastTitleSheetRow = j + 1; // 1-based
      }
    }
    var insertRow = lastTitleSheetRow + 1; // 1-based

    var needBlank = (insertRow > scanEnd);

    // 마감일: "2026-06-05" → 진짜 날짜값(Date). 형식이 다르면 원문 텍스트로 폴백.
    // (인트라넷 end_date에 연도가 들어있으므로 추정 불필요 — 그대로 정확히 사용)
    var dm = dueDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    var dateValue = dm ? new Date(+dm[1], +dm[2] - 1, +dm[3]) : dueDate;

    // v58: ★쓰기 직전에 목적지가 비어 있는지 확인한다.
    //   위치 계산이 틀리면(구역 경계 오판 등) 아래 setValues 가 남의 작업을 조용히 덮어쓴다.
    //   2026-08-28 구정현 건에서 실제로 그럴 뻔했다 — 계산은 사람이 못 보고 결과만 남는다.
    //   빈 행의 체크박스(boolean false)는 정상 목적지이므로 통과시킨다.
    var dIdx = insertRow - 1;   // 0-based
    if (dIdx >= 0 && dIdx < allData.length) {
      var dChk   = String(allData[dIdx][startCol - 1 + COL.CHECK] == null ? "" : allData[dIdx][startCol - 1 + COL.CHECK]);
      var dTitle = String(allData[dIdx][startCol - 1 + COL.TITLE] == null ? "" : allData[dIdx][startCol - 1 + COL.TITLE]).trim();
      var dLinkF = String(insFormulas[dIdx][startCol - 1 + COL.LINK]);
      // v71: 제목이 없어도 요청글~진행상황 칸에 무언가 적혀 있으면 빈 줄이 아니다(메모·마감만 적어 둔 줄을 덮어썼다)
      var dRest = "";
      for (var dc = COL.LINK; dc <= COL.STATUS; dc++) {
        var dv2 = allData[dIdx][startCol - 1 + dc];
        dRest += String(dv2 == null ? "" : dv2).trim() + String(insFormulas[dIdx][startCol - 1 + dc] || "").trim();
      }
      if (dTitle || dRest || /HYPERLINK/i.test(dLinkF) ||
          dChk.indexOf("📌") !== -1 || dChk.indexOf("▼") !== -1) {
        return respond({ ok: false, error: target + " " + insertRow + "행에 이미 내용이 있어 멈췄습니다. " +
          "구역 경계가 잘못 잡힌 것 같아요 — 시트를 확인해 주세요." +
          (dTitle ? " (그 행: " + dTitle.slice(0, 30) + ")" : dRest ? " (그 행에 제목 없이 다른 칸만 적혀 있어요)" : "") });
      }
    }

    // 위 행 서식 복사 (체크박스 색상 통일)
    sheet.getRange(insertRow - 1, startCol + COL.CHECK)
         .copyFormatToRange(sheet, startCol + COL.CHECK, startCol + COL.CHECK, insertRow, insertRow);

    var checkCell = sheet.getRange(insertRow, startCol + COL.CHECK);
    checkCell.clearDataValidations();
    checkCell.insertCheckboxes();
    checkCell.setFontColor(CHECK_FONT_COLOR); // v50: 윗행 서식복사로 옮아온 연한 회색 차단

    // v63: 제목·요청글·기획안·마감(B~E / J~M)을 한 번에 쓴다. 예전엔 여러 번 나눠 써서 중간 실패 시
    //      반쯤 쓴 행이 남았고, 링크 전에 멈추면 재전송이 중복 검사를 지나 두 번째 행을 만들었다.
    //      setValues 는 '=' 로 시작하는 문자열을 수식으로 넣는다 — 링크만 수식, 나머지는 textSafe.
    var planVal = !planLink ? "" : (isPlainUrl(planLink) && linkFormula(planLink, "🔗기획안링크")) || textSafe(planLink);   // v62 규칙: 기획안은 http 일 때만 수식(v71: 공백 없는 주소 하나)
    sheet.getRange(insertRow, startCol + COL.TITLE, 1, 4).setValues([[
      litSafe(title),
      linkFormula(sourceUrl, "🔗요청글링크") || "",
      planVal,
      (dateValue instanceof Date) ? dateValue : textSafe(dateValue)
    ]]);
    written = target + " " + insertRow + "행";   // v68: 여기부터 실패해도 행은 들어가 있다
    // 메모(F/N)는 있을 때만 — 비어 있으면 그 칸을 건드리지 않는다(v62 와 같음)
    if (memo) sheet.getRange(insertRow, startCol + COL.MEMO).setValue(litSafe(memo));
    sheet.getRange(insertRow, startCol + COL.CHECK).setValue(false);
    var dueCell = sheet.getRange(insertRow, startCol + COL.DATE);
    if (dateValue instanceof Date) dueCell.setNumberFormat("mm / dd"); // 캘린더 작동 + MM/DD 표시
    dueCell.setHorizontalAlignment("center");


    // 새 행 정렬 기본값: 대부분 좌측, E/M·F/N만 중앙 (정렬 어긋남 방지)
    applyDefaultAlignment(sheet, insertRow, startCol);

    SpreadsheetApp.flush();

    if (needBlank) {
      sheet.insertRowAfter(insertRow);
      sheet.getRange(insertRow + 1, 1, 1, sheet.getLastColumn())
           .clearContent().clearDataValidations().clearFormat();
      SpreadsheetApp.flush();   // v63: 행 삽입까지 반영한 뒤 락을 푼다
    }

    bustReadCache();   // v54: insert 도 읽기 캐시를 버린다
    noteClientVersion({ parameter: { name: target, ver: clientVer } });   // v64: 전송할 때도 「누가 어느 버전」 기록
    return respond(withVer({ ok: true, message: target + " " + insertRow + "행 추가됨 (섹션끝:" + scanEnd + ", needBlank:" + needBlank + ")" }, clientVer));

  } catch (err) {
    // v68: 행을 쓴 뒤의 실패(서식·빈 줄 삽입)는 ok:true — ok:false 면 딸깍이 다시 보내 같은 글이 두 줄 된다
    // v70: partial 을 실어 딸깍이 메모를 지키고 시트 확인을 권하게 한다(빈 줄 삽입 실패면 다음 전송이 막히므로 꼭 알려야 한다)
    if (written) { try { bustReadCache(); } catch (e3) {} }   // v70: 방금 쓴 행이 낡은 캐시에 가려지지 않게
    if (written) return respond(withVer({ ok: true, partial: true,
      message: written + " 추가됨 (마무리 일부 실패: " + String(err).slice(0, 80) + ")" }, clientVer));
    return respond({ ok: false, error: err.toString() });
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (e2) {} }
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
