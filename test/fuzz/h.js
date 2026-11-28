// h.js — 무작위 경합 시험(fuzz.js)용 하니스. 렌더러(renderer/app.js)를 vm 에 올리고, 서버는 test/gas/gas-server.js(실제 GAS 코드 — gas/ 의 최신 사본)를 꽂는다.
//   _audit/delete-race-review/gas-vm 의 검수 도구를 npm test 에 넣으려고 옮긴 것(v1.0.48). 저장소 파일은 읽기만 한다.
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path");
const DR = require(path.join(__dirname, "..", "delete-race.scenarios.js"));
const G = require(path.join(__dirname, "..", "gas", "gas-server.js"));
let script = null;
function scriptFor() {
  return script || (script = new vm.Script(require(path.join(__dirname, "..", "renderer-src.js"))(process.env.TT_RENDERER), { filename: "renderer" }));
}
function makeEl(id) {
  const cls = new Set(); const styleBag = {};
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
function boot(ver) {
  const els = new Map(), store = new Map();
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
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); }, clear: () => store.clear() },
    navigator: { userAgent: "node", platform: "Win32", language: "ko-KR" },
    performance: { now: () => Date.now() }, innerWidth: 440, innerHeight: 720, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
    getComputedStyle: () => new Proxy({}, { get: (t, k) => k === "getPropertyValue" ? () => "" : "" }),
    setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    MutationObserver: Observer, ResizeObserver: Observer, IntersectionObserver: Observer,
    open() {}, alert() {}, location: { href: "http://test.invalid/", search: "", hash: "" },
  };
  sandbox.window = sandbox; sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  scriptFor().runInContext(ctx);
  return { evalApp: src => vm.runInContext(src, ctx) };
}
const flush = () => new Promise(r => setImmediate(r));
let lastNow = 0;

async function start(opts) {
  opts = opts || {};
  const ver = opts.ver || "v36";
  const evalApp = boot(ver).evalApp;
  const clock = DR.makeClock(flush, Math.max(Date.now(), lastNow));
  const server = (opts.makeServer || G.makeGasServer)(clock, opts);
  const h = { ver, clock, server, toasts: [], errors: [], renders: 0, ME: G.ME, OTHER: G.OTHER, evalApp };
  h.app = code => { const v = evalApp(code); if (v && typeof v.then === "function") v.then(null, e => h.errors.push(String(e && e.stack || e))); return v; };
  evalApp(`(function(c, hook){
    var o = { render: render, toast: toast };
    setTimeout = function(fn, ms){ return c.set(fn, ms); };
    clearTimeout = function(id){ c.clear(id); };
    Date.now = function(){ return c.now; };
    toast = function(m){ hook.onToast(String(m)); return o.toast.apply(this, arguments); };
  })`)(clock, { onToast(m) { h.toasts.push(m); } });
  evalApp('localStorage.setItem("myName", "' + G.ME + '")');
  evalApp("(function(api){ window.timerAPI = api; })")(server.api);
  h.tick = () => clock.advance(1);
  h.settle = async () => { for (let i = 0; i < 8; i++) await clock.advance(1); };
  await h.app("doSync({ silent:true })");
  await h.settle();
  h.app("applyView(getMyName())");
  await h.settle();
  h.tasks = () => evalApp("tasks").map(t => ({ id: t.id, row: t._row, title: t.title, done: !!t.done, reqLink: t.reqLink, temp: !!t._temp, status: t._status }));
  h.id = (title, nth) => { const ts = h.tasks().filter(x => x.title === title); if (!ts[nth || 0]) throw new Error("화면에 없는 작업: " + title); return ts[nth || 0].id; };
  h.mark = () => ({ t: h.toasts.length, c: server.calls.length });
  h.toastsSince = m => h.toasts.slice(m.t);
  h.posts = (m, action) => server.calls.slice(m ? m.c : 0).filter(c => c.kind === "post" && (!action || (c.payload.action || "insert") === action));
  h.syncs = m => server.calls.slice(m ? m.c : 0).filter(c => c.kind === "sync").length;
  // ── 사용자 동작 ──
  h.del = (title, nth) => h.app("delTask(" + h.id(title, nth) + ")");
  h.openDone = async (title, nth) => { h.app("toggleDone(" + h.id(title, nth) + ")"); await clock.advance(40); };
  h.confirmDone = (st, force) => h.app("confirmDone(" + JSON.stringify(st == null ? "전달 완료" : st) + (force ? ", true" : "") + ")");
  h.done = async (title, nth) => { await h.openDone(title, nth); h.confirmDone(); };
  h.openDue = (title, nth) => h.app("openTimeEdit(" + h.id(title, nth) + ")");
  h.commitDue = (d, t) => h.app("commitDue(" + JSON.stringify(d || "2030-02-20") + ", " + JSON.stringify(t || "18:00") + ")");
  h.due = (title, d, nth) => { h.openDue(title, nth); h.commitDue(d); };
  h.openEdit = (title, nth) => h.app("openEdit(" + h.id(title, nth) + ")");
  h.saveEdit = (f) => {   // f: { title, link, plan } — 안 준 칸은 창에 채워진 값 그대로
    if (f && f.title != null) evalApp('document.getElementById("f-title")').value = f.title;
    if (f && f.link != null) evalApp('document.getElementById("f-reqlink")').value = f.link;
    if (f && f.plan != null) evalApp('document.getElementById("f-planlink")').value = f.plan;
    return h.app("saveTask()");
  };
  h.edit = (title, f, nth) => { h.openEdit(title, nth); return h.saveEdit(f); };
  h.add = (title, link) => {
    h.app("openAdd()");
    evalApp('document.getElementById("f-title")').value = title;
    evalApp('document.getElementById("f-reqlink")').value = link;
    evalApp("selDl = Date.now() + 86400000");
    return h.app("saveTask()");
  };
  h.rowsMatchServer = () => {
    const a = h.tasks().map(t => t.row + ":" + t.title).sort().join("|");
    const b = server.rows().map(r => r.row + ":" + r.title).sort().join("|");
    return a === b;
  };
  h.end = async () => { await h.settle(); lastNow = clock.now + 1000; return h.errors.concat(clock.errors); };
  h.toasts.length = 0;
  return h;
}
module.exports = { start, G, DR };
