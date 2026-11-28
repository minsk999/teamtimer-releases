// ui.browser.js — 실제 브라우저 DOM 이 있어야 볼 수 있는 화면 약속(npm test 밖, 손으로 돌린다: `node test/ui.browser.js`).
//   ① Tab 가두기: 열린 창 안에서만 돌고, 설정 위에 뜬 확인 창(z-index 더 높음)이 우선한다.
//   ② 테마 복원: 고른 적 없으면 OS 테마, 고른 값이 있으면 그 값.
//   ③ 스크립트가 renderer/app.js 로 실제로 실린다(CSP script-src 'self').
// 필요: playwright-core 와 크롬 헤드리스(이 PC: nas-gallery/tools/whatsnew 의 playwright-core + %LOCALAPPDATA%\ms-playwright\chromium_headless_shell-*).
//   다른 PC 에서는 TT_PW(playwright-core 경로)·TT_CHROME(실행 파일)을 준다. 바깥 요청은 전부 막는다(글꼴 CDN 포함).
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
let fail = 0, n = 0;
const eq = (name, got, want) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log((ok ? "OK    " : "FAIL  ") + name + (ok ? "" : "  got " + JSON.stringify(got) + " want " + JSON.stringify(want))); };

async function page(browser, scheme, saved) {
  const ctx = await browser.newContext({ viewport: { width: 440, height: 720 }, colorScheme: scheme });
  await ctx.route(u => !u.href.startsWith("file:"), r => r.abort());
  if (saved) await ctx.addInitScript(v => { try { localStorage.setItem("theme", v); } catch (e) {} }, saved);
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(PAGE); await p.waitForTimeout(300);
  return { ctx, p, errs };
}
(async () => {
  const browser = await chromium.launch({ executablePath: exe });
  // ③ + ② 고른 적 없음
  let { ctx, p, errs } = await page(browser, "dark");
  eq("app.js 실림(전역 함수 있음)", await p.evaluate(() => typeof openModal === "function" && typeof toggleTheme === "function"), true);
  eq("페이지 오류 없음", errs, []);
  eq("고른 적 없음 + OS 다크 → 다크", await p.evaluate(() => document.body.classList.contains("dark")), true);
  // ① 설정 창 안에서 Tab 이 돈다
  await p.evaluate(() => { openModal("modal-settings"); document.body.focus(); });
  await p.waitForTimeout(250);
  const inSettings = [];
  for (let i = 0; i < 60; i++) { await p.keyboard.press("Tab"); inSettings.push(await p.evaluate(() => !!document.activeElement.closest("#modal-settings"))); }
  eq("설정 창: Tab 60번 모두 창 안", inSettings.every(Boolean), true);
  await p.keyboard.press("Shift+Tab");
  eq("설정 창: Shift+Tab 도 창 안", await p.evaluate(() => !!document.activeElement.closest("#modal-settings")), true);
  // 설정 위 확인 창 — z-index 가 높은 쪽에 갇힌다
  await p.evaluate(() => openConfirm("시험", "확인 창", "확인", () => {}));
  await p.waitForTimeout(250);
  const inConfirm = [];
  for (let i = 0; i < 8; i++) { await p.keyboard.press("Tab"); inConfirm.push(await p.evaluate(() => !!document.activeElement.closest("#modal-confirm"))); }
  eq("설정 위 확인 창: Tab 이 확인 창 안", inConfirm.every(Boolean), true);
  await ctx.close();
  // ② 고른 값이 있으면 OS 보다 우선
  ({ ctx, p } = await page(browser, "dark", "light"));
  eq("저장값 light + OS 다크 → 라이트", await p.evaluate(() => document.body.classList.contains("dark")), false);
  await ctx.close();
  ({ ctx, p } = await page(browser, "light", "dark"));
  eq("저장값 dark + OS 라이트 → 다크", await p.evaluate(() => document.body.classList.contains("dark")), true);
  await ctx.close();
  ({ ctx, p } = await page(browser, "light"));
  eq("고른 적 없음 + OS 라이트 → 라이트", await p.evaluate(() => document.body.classList.contains("dark")), false);
  await ctx.close();
  await browser.close();
  console.log(`${n - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
