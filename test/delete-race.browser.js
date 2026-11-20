// delete-race.browser.js — delete-race.scenarios.js 를 실제 브라우저 DOM 에서 돌리는 실행기.
//   1) 저장소 루트를 정적 서버로 띄운다 — 포트 8733, 127.0.0.1 한정 (Claude Code 에서는 launch.json 의 `teamtimer-root`).
//      8731·8742·8797 은 다른 용도 — 쓰지 말 것. 끝나면 이 서버만 끈다.
//   2) http://localhost:8733/renderer/index.html?v=<아무 값> 을 연다(쿼리는 브라우저 캐시 무력화 — 옛 페이지로 돌린 적이 있다).
//      브라우저에는 window.timerAPI 가 없어 시작 동기화·메일 폴링이 돌지 않는다.
//   3) 콘솔에서:
//        for (const f of ["delete-race.scenarios.js", "delete-race.browser.js"])
//          await new Promise((ok, no) => { const s = document.createElement("script"); s.src = "../test/" + f; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
//        await runDeleteRace();            // 고른 것만: await runDeleteRace(["A1", "B1", "C1"])
//   가짜 timerAPI 를 주입하므로 실제 시트로는 요청이 나가지 않는다. 앱의 setTimeout·Date.now 를 가짜 시계로 바꾸니 끝나면 탭을 닫을 것.
(function () {
  "use strict";
  // 시나리오마다 페이지를 다시 읽지 않는다 → 앞 시나리오의 타이머·진행 중 요청을 다 흘려보내고 다음으로 간다.
  const env = {
    boot: async () => ({ evalApp: code => (0, eval)(code) }),
    // MessageChannel — 패널이 화면에 없으면 setTimeout 은 1초 단위로 늘어진다
    flush: () => new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); }),
    quiesce: async h => {
      h.server.release("sync"); h.server.release("post");
      await h.clock.advance(180000);
    },
  };
  window.runDeleteRace = async only => {
    const results = await window.DeleteRace.runAll(env, only);
    const text = window.DeleteRace.format(results);
    console.log(text);
    return text;
  };
})();
