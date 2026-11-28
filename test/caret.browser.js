// caret.browser.js — 부드러운 커서(#scaret) 검사(npm test 밖, 손으로: `node test/caret.browser.js`).
//   실제 index.html 을 헤드리스 크롬으로 띄워(가짜 timerAPI, 바깥 요청 차단) 진짜 키 입력·한글 조합으로 치고,
//   그린 커서가 「그 칸의 기본 커서가 있었을 자리」와 1.5px 안에서 맞는지 본다(글꼴함 tools/try-caret.js 와 같은 방법:
//   기본 커서를 잠깐 빨갛게 켜고 그 칸만 찍어 빨간 세로줄의 가운데를 찾는다). 라이트·다크 둘 다.
"use strict";
const path = require("path"), fs = require("fs"), url = require("url");
const PW = process.env.TT_PW || path.join(__dirname, "..", "..", "nas-gallery", "tools", "whatsnew", "node_modules", "playwright-core");   // 이 PC 는 형제 폴더의 것을 쓴다
const { chromium } = require(PW);
const exe = process.env.TT_CHROME || (() => {
  const base = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
  const d = fs.readdirSync(base).filter(n => /^chromium_headless_shell-/.test(n)).sort().pop();
  const sub = fs.readdirSync(path.join(base, d)).find(n => fs.existsSync(path.join(base, d, n, "chrome-headless-shell.exe")));
  return path.join(base, d, sub, "chrome-headless-shell.exe");
})();
const PAGE = url.pathToFileURL(path.join(__dirname, "..", "renderer", "index.html")).href;
const results = []; const ok = (name, cond, extra = "") => results.push([cond ? "통과" : "실패", name, extra]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DATA = { ok: true, members: [{ name: "김영상", side: 1, nameRow: 3, video: [], mgmt: [{ row: 30, b: "주간 보고", c: "" }] }], memberNames: ["김영상"], warn: [] };
const OURS = `(()=>{const c=document.getElementById('scaret');if(!c||c.style.display!=='block')return null;const m=/translate\\(([-\\d.]+)px/.exec(c.style.transform);return m?+m[1]+1:null})()`;

(async () => {
  const browser = await chromium.launch({ executablePath: exe });
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 440, height: 720 }, colorScheme: theme });
    await ctx.route(u => !u.href.startsWith("file:"), r => r.abort());
    await ctx.addInitScript(([d, th]) => {
      localStorage.setItem("myName", "김영상"); localStorage.setItem("theme", th);
      const api = { syncSheet: async () => d, gmailStatus: async () => ({ connected: false }), appVersion: async () => "1.0.45" };
      window.timerAPI = new Proxy(api, { get: (t, k) => t[k] || (() => Promise.resolve({ ok: false })) });
    }, [DATA, theme]);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto(PAGE); await p.waitForTimeout(1200);
    const cdp = await ctx.newCDPSession(p);
    const ev = f => p.evaluate(f);
    const ours = () => p.evaluate(OURS);
    async function native(sel) {
      const b = await p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; }, sel);
      await ev(`(()=>{const s=document.createElement('style');s.id='zzcaret';s.textContent='.scr{caret-color:#ff0000 !important}#scaret{visibility:hidden !important}';document.head.appendChild(s)})()`);
      let xc = null;
      for (let k = 0; k < 12 && xc == null; k++) {
        const png = (await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...b, scale: 1 } })).data;
        xc = await p.evaluate(async ([png, bw]) => { const im = new Image(); im.src = "data:image/png;base64," + png; await im.decode(); const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data, cols = []; for (let x = 0; x < c.width; x++) { let n = 0; for (let y = 0; y < c.height; y++) { const i = (y * c.width + x) * 4; if (d[i] > 180 && d[i + 1] < 90 && d[i + 2] < 90) n++; } if (n >= 5) cols.push(x); } return cols.length ? (cols[0] + cols[cols.length - 1] + 1) / 2 * bw / im.width : null; }, [png, b.width]);
        if (xc == null) await sleep(140);
      }
      await ev(`document.getElementById('zzcaret').remove()`);
      return xc == null ? null : b.x + xc;
    }
    async function check(label, sel) {
      await sleep(350); const o = await ours(), n = await native(sel);
      ok(theme + " " + label, o != null && n != null && Math.abs(o - n) <= 1.5, "그린 " + (o == null ? "없음" : o.toFixed(1)) + " · 기본 " + (n == null ? "못 찾음" : n.toFixed(1)));
    }
    const key = async (k, code, vk, mod = 0) => { for (const type of ["rawKeyDown", "keyUp"]) await cdp.send("Input.dispatchKeyEvent", { type, key: k, code, windowsVirtualKeyCode: vk, modifiers: mod }); };
    const type = text => cdp.send("Input.insertText", { text });
    // 칸들: 작업 추가 창의 제목·요청글 링크, 관리 항목 추가 칸
    await ev(`openAdd ? openAdd() : null`).catch(() => {});
    await sleep(500);
    const fields = [];
    if (await ev(`!!document.querySelector('#modal-task.show #f-title')`)) fields.push("#f-title", "#f-reqlink");
    for (const sel of fields) {
      await p.focus(sel); await ev(`document.querySelector('${sel}').value=''`);
      await type("Ab 12 작업 타이머 기획전"); await check(sel + " 친 뒤", sel);
      for (let i = 0; i < 3; i++) await key("ArrowLeft", "ArrowLeft", 37);
      await check(sel + " 왼쪽 3칸", sel);
      await key("Home", "Home", 36); await check(sel + " Home", sel);
      await key("End", "End", 35); await cdp.send("Input.imeSetComposition", { text: "핥", selectionStart: 1, selectionEnd: 1 }); await check(sel + " 한글 조합 중", sel);
      await type("핥");
      await type(" 아주 긴 문구를 계속 쳐서 칸을 넘기면 글자가 왼쪽으로 밀려 가야 한다 0123456789 0123456789 0123456789 0123456789"); await check(sel + " 칸을 넘김", sel);
    }
    // 미끄러짐: 중간 자리를 지나가는가
    if (fields.length) {
      const sel = fields[0];
      await p.focus(sel);
      await ev(`(()=>{const e=document.querySelector('${sel}');e.value='abc';e.dispatchEvent(new Event('input',{bubbles:true}))})()`); await key("End", "End", 35); await sleep(300);
      const x0 = await ours(); await type("W");
      const tr = await p.evaluate(`new Promise(res=>{const xs=[];const step=()=>{xs.push(${OURS});xs.length<16?requestAnimationFrame(step):res(xs)};requestAnimationFrame(step)})`);
      const end = tr[tr.length - 1], mid = tr.filter(v => v != null && v > x0 + 0.5 && v < end - 0.5).length;
      ok(theme + " 미끄러짐(중간 자리를 지나감)", mid >= 2, "x0 " + (x0 == null ? "-" : x0.toFixed(1)) + " → " + tr.map(v => v == null ? "-" : v.toFixed(1)).join(" "));
      await key("a", "KeyA", 65, 2); await sleep(200); ok(theme + " 글자를 고르면 커서 숨김", (await ours()) == null);
      const col = await ev(`getComputedStyle(document.getElementById('scaret')).backgroundColor + ' / ' + getComputedStyle(document.querySelector('${sel}')).color`);
      ok(theme + " 커서 색 = 글자색", col.split(" / ")[0] === col.split(" / ")[1], col);
    } else ok(theme + " 작업 추가 창이 열림", false, "openAdd 없음");
    // 관리 항목 추가 칸(목록 안에서 그려지는 칸)
    await ev(`closeModal && closeModal('modal-task')`).catch(() => {}); await sleep(300);
    await ev(`startAddMgmt()`).catch(() => {}); await sleep(300);
    if (await ev(`!!document.getElementById('madd-input')`)) {
      await p.focus("#madd-input"); await type("회의록 정리 https://docs.google.com/x"); await check("#madd-input 친 뒤", "#madd-input");
    } else ok(theme + " 관리 항목 추가 칸", false, "없음");
    // 관리 항목 편집 칸(목록 안에서 그 자리에 생기는 칸)
    await ev(`document.activeElement.blur(); editMgmt(30, 'b')`).catch(() => {}); await sleep(300);
    const editSel = await ev(`(()=>{const e=document.querySelector('.mgmt-item input');if(!e)return null;e.id=e.id||'zz-medit';return '#'+e.id})()`);
    if (editSel) { await p.focus(editSel); await key("End", "End", 35); await type(" v2"); await check("관리 항목 편집 칸", editSel); await key("Escape", "Escape", 27); }
    else ok(theme + " 관리 항목 편집 칸", false, "없음");
    // 설정 창의 업무시간 칸(가운데 정렬일 수 있는 짧은 칸)·프리셋 이름
    await ev(`openSettings()`).catch(() => {}); await sleep(600);
    // 꺼진(흐린) 업무시간 묶음은 Tab 이 건너뛴다 — 켠 뒤에 친다
    ok(theme + " 꺼진 업무시간 칸은 Tab 제외", await ev(`document.getElementById('work-start').tabIndex === -1`));
    await ev(`toggleWorkDraft()`); await sleep(200);
    ok(theme + " 켜면 Tab 으로 다시 닿음", await ev(`document.getElementById('work-start').tabIndex === 0`));
    for (const sel of ["#work-start", ".preset-name"]) {
      if (!(await ev(`!!document.querySelector('${sel}')`))) { ok(theme + " " + sel, false, "없음"); continue; }
      await ev(`document.querySelector('${sel}').scrollIntoView({block:'center'})`); await sleep(200);
      await p.focus(sel); await key("End", "End", 35); await type("1"); await check("설정 " + sel, sel);
      await key("Backspace", "Backspace", 8);
    }
    await ev(`closeModal('modal-settings')`).catch(() => {}); await sleep(300);
    await ev(`document.activeElement.blur()`); await sleep(100);
    ok(theme + " 칸을 떠나면 커서 숨김", (await ours()) == null);
    ok(theme + " 페이지 오류 없음", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  for (const r of results) console.log(r.join("\t"));
  const bad = results.filter(r => r[0] === "실패").length; console.log(bad ? "실패 " + bad + "건" : "전부 통과"); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
