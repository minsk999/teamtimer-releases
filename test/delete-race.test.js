// delete-race.test.js — 「삭제한 카드가 되살아난다」 재현·회귀. 시나리오 본문은 delete-race.scenarios.js.
//   renderer/index.html 의 인라인 <script> 를 통째로 vm 에 올린다(최소 DOM 스텁 — 화면은 #task-host 의 innerHTML 문자열로 읽는다).
//   실행: node test/delete-race.test.js            (전부)
//         node test/delete-race.test.js A1 B1 C1   (고른 것만)
//   수정 전 코드로 재현해 보려면: TT_RENDERER=<옛 index.html 경로> node test/delete-race.test.js
//     옛 파일은 `git archive <커밋> renderer/index.html` 로 꺼낼 것(PowerShell 의 `>` 는 바이트를 바꾼다).
//   실제 DOM 으로 돌리려면 delete-race.browser.js 머리말 참조.
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path");
const DR = require(path.join(__dirname, "delete-race.scenarios.js"));

const file = process.env.TT_RENDERER || path.join(__dirname, "..", "renderer", "index.html");
const html = fs.readFileSync(file, "utf8");
const open = html.indexOf("<script>"), close = html.lastIndexOf("</script>");
if (open < 0 || close < open) throw new Error("인라인 <script> 를 못 찾았어요: " + file);
const code = html.slice(open + "<script>".length, close);
const script = new vm.Script(code, { filename: "index.html(inline)" });

function makeEl(id) {
  const cls = new Set();
  const styleBag = {};
  return {
    id: id || "", tagName: "DIV", innerHTML: "", textContent: "", value: "", title: "", checked: false, disabled: false,
    dataset: {}, children: [], childNodes: [], files: [], parentNode: null,
    offsetWidth: 0, offsetHeight: 0, scrollWidth: 0, clientWidth: 0, clientHeight: 0, scrollTop: 0, scrollHeight: 0,
    style: new Proxy(styleBag, {
      get: (t, k) => k === "setProperty" ? (a, b) => { t[a] = b; } : k === "removeProperty" ? () => {} : (k in t ? t[k] : ""),
      set: (t, k, v) => { t[k] = v; return true; },
    }),
    classList: {
      add: (...a) => a.forEach(x => cls.add(x)), remove: (...a) => a.forEach(x => cls.delete(x)),
      toggle: (x, f) => { const on = f === undefined ? !cls.has(x) : !!f; if (on) cls.add(x); else cls.delete(x); return on; },
      contains: x => cls.has(x),
    },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    querySelector() { return makeEl(); }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    appendChild(c) { return c; }, removeChild(c) { return c; }, insertBefore(c) { return c; }, remove() {},
    focus() {}, blur() {}, select() {}, click() {}, scrollIntoView() {}, setSelectionRange() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, hasAttribute() { return false; },
    closest() { return null; }, matches() { return false; }, contains() { return false; },
    getAnimations() { return []; }, getContext() { return null; },
  };
}

class Observer { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }

function boot() {
  const els = new Map();
  const store = new Map();
  const document = {
    getElementById(id) { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
    querySelector() { return makeEl(); }, querySelectorAll() { return []; },
    createElement() { return makeEl(); }, createTextNode() { return makeEl(); },
    addEventListener() {}, removeEventListener() {},
    body: makeEl("body"), documentElement: makeEl("html"), head: makeEl("head"),
    activeElement: null, visibilityState: "visible", hidden: false,
  };
  const sandbox = {
    document, console: { log() {}, warn() {}, error: console.error, info() {} },
    localStorage: {
      getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: k => { store.delete(k); }, clear: () => store.clear(),
    },
    navigator: { userAgent: "node", platform: "Win32", language: "ko-KR" },
    performance: { now: () => Date.now() },
    innerWidth: 440, innerHeight: 720, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
    getComputedStyle: () => new Proxy({}, { get: (t, k) => k === "getPropertyValue" ? () => "" : "" }),
    setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},   // 시작 뒤 가짜 시계가 갈아끼운다
    MutationObserver: Observer, ResizeObserver: Observer, IntersectionObserver: Observer,
    open() {}, alert() {}, location: { href: "http://test.invalid/", search: "", hash: "" },
  };
  sandbox.window = sandbox; sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  script.runInContext(ctx);   // timerAPI 없이 올린다 → 시작 시 자동 동기화·메일 폴링·포커스 프리싱크 등록이 안 돈다
  return { evalApp: src => vm.runInContext(src, ctx) };
}

(async () => {
  const env = { boot: async () => boot(), flush: () => new Promise(r => setImmediate(r)) };
  const results = await DR.runAll(env, process.argv.slice(2));
  console.log("대상: " + file);
  console.log(DR.format(results));
  process.exit(results.length && results.every(r => r.pass) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
