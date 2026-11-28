/* 부드러운 커서(v1.0.45) — 글자를 치면 커서가 다음 자리로 건너뛰지 않고 미끄러져 따라간다(워드의 타자 느낌).
   글꼴함 fontshelf/ui/caret.js 를 값 그대로 옮긴 것(원본 = BannerNode·라이트 다운로더와 같은 값: 폭 2px · 시간 상수 28ms · 0.3px 안이면 붙임 ·
   치는 동안 켜져 있고 쉬면 530ms 깜빡임 · 다른 칸에서 넘어오면 제자리 · 「애니메이션 효과」를 끈 PC 는 바로 옮김 · 글자를 고르는 중이거나 칸이 덮이면 숨김 ·
   쉬다 치는 첫 프레임은 직전 프레임 간격 · 가운데 정렬 칸은 글의 순간 이동분을 text-indent 로 되돌렸다 푼다).
   방식: 칸의 기본 커서는 투명(.scr), 같은 글꼴의 숨은 줄(#scaretRuler)로 글자 폭을 재서 #scaret 을 그 자리에 그린다. 검사 = node test/caret.browser.js */
(function () {
  const car = document.createElement('i'); car.id = 'scaret';
  const ruler = document.createElement('span'); ruler.id = 'scaretRuler';
  const COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariant', 'fontFeatureSettings', 'fontVariationSettings', 'fontKerning', 'letterSpacing', 'wordSpacing', 'textTransform'];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let el = null, x = null, last = 0, raf = 0, until = 0, mKey = '', mW = 0, mFull = 0, shift = 0, pOff = null, fdt = 16;
  const ok = e => e && e.tagName === 'INPUT' && /^(text|search|url|email|tel)$/.test(e.type) && !e.readOnly && !e.disabled;
  function width(cs, t) { COPY.forEach(k => ruler.style[k] = cs[k]); ruler.textContent = t; return ruler.getBoundingClientRect().width; }
  function goal() {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect(), s = el.offsetWidth ? r.width / el.offsetWidth : 1; /* 창이 열리며 scale 이 바뀌는 동안에도 맞게: 조상 배율 */
    const bl = parseFloat(cs.borderLeftWidth), pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight), bt = parseFloat(cs.borderTopWidth), bb = parseFloat(cs.borderBottomWidth);
    const v = el.value, at = el.selectionEnd == null ? v.length : el.selectionEnd, key = v + '\u0000' + at + '\u0000' + cs.font + cs.letterSpacing;
    if (key !== mKey) { mKey = key; mW = width(cs, v.slice(0, at)); mFull = width(cs, v); }
    const W = el.offsetWidth - bl - pl - pr - parseFloat(cs.borderRightWidth), ta = cs.textAlign;
    const off = mFull < W ? (ta === 'center' ? (W - mFull) / 2 : (ta === 'right' || ta === 'end') ? W - mFull : 0) : 0;
    /* 가운데 정렬 칸은 한 글자 칠 때마다 글 전체가 순간 이동한다. 그 이동분(shift)을 text-indent 로 되돌려 놓고 커서와 같은 속도로 풀어 글도 미끄러지게 한다 */
    if (ta === 'center' && pOff != null && off !== pOff && mFull < W && !reduce.matches) shift += pOff - off;
    pOff = off; if (mFull + 2 * Math.abs(shift) >= W) shift = 0;
    const h = Math.round(parseFloat(cs.fontSize) * 1.25), H = el.offsetHeight - bt - bb, L = r.left + (bl + pl) * s;
    return { x: L + Math.min(W, Math.max(0, off + shift + mW - el.scrollLeft)) * s, y: r.top + (bt + (H - h) / 2) * s, h: h * s, r, L, R: L + W * s };
  }
  function hidden(g) {
    if (el.selectionStart !== el.selectionEnd || !g.r.width || document.visibilityState === 'hidden') return true;
    let o = 1; for (let p = el; p && p.nodeType === 1; p = p.parentElement) o *= +getComputedStyle(p).opacity;
    if (o < 0.02) return true; /* 사라지는 중인 창 */
    const hit = document.elementFromPoint(Math.min(g.R - 1, Math.max(g.L + 1, g.x)), g.y + g.h / 2); /* 칸 안쪽으로 1px: 여백 0 칸의 글자 끝에서 칸 밖을 짚지 않게 */
    return !(hit === el || (hit && el.contains(hit)));
  }
  function frame(t) {
    raf = 0; if (!el || document.activeElement !== el) { car.style.display = 'none'; return; }
    const dt = last ? Math.max(1, t - last) : fdt; if (last) fdt = Math.min(34, dt); last = t; /* 쉬다 시작하는 첫 프레임은 직전 프레임 간격으로(240Hz 에서 16ms 로 치면 첫 걸음이 43%) */
    if (shift) { shift *= Math.exp(-dt / 28); if (Math.abs(shift) < 0.3) shift = 0; }
    const g = goal(), ind = shift ? (shift * 2).toFixed(2) + 'px' : '';
    if (el.style.textIndent !== ind) el.style.textIndent = ind;
    x = (x == null || reduce.matches) ? g.x : x + (g.x - x) * (1 - Math.exp(-dt / 28));
    if (Math.abs(g.x - x) < 0.3) x = g.x;
    if (hidden(g)) car.style.display = 'none';
    else { car.style.display = 'block'; car.style.transform = 'translate(' + (x - 1) + 'px,' + g.y + 'px)'; car.style.height = g.h + 'px'; }
    if (x !== g.x || shift || t < until) raf = requestAnimationFrame(frame); else last = 0;
  }
  function kick(blink) {
    if (!el) return; until = performance.now() + 320; /* 창(시트)이 열리며 움직이는 동안에도 따라가게 잠깐 더 돈다 */
    if (blink !== false) { car.classList.remove('bl'); void car.offsetWidth; car.classList.add('bl'); } /* 치는 동안에는 켜져 있다 */
    if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  document.addEventListener('focusin', e => {
    const t = e.target; if (!ok(t)) { if (el) { el = null; car.style.display = 'none'; } return; }
    if (!car.isConnected) { document.body.appendChild(car); document.body.appendChild(ruler); }
    el = t; t.classList.add('scr'); x = null; mKey = ''; shift = 0; pOff = null; kick();
  }, true);
  document.addEventListener('focusout', e => { if (e.target === el) { el.style.textIndent = ''; el = null; car.style.display = 'none'; } }, true);
  ['input', 'keydown', 'keyup', 'selectionchange', 'compositionstart', 'compositionupdate', 'compositionend', 'pointerup'].forEach(n => document.addEventListener(n, () => kick(), true));
  ['scroll', 'transitionend', 'animationend', 'wheel'].forEach(n => document.addEventListener(n, () => kick(false), { capture: true, passive: true }));
  addEventListener('resize', () => kick(false));
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => { mKey = ''; kick(false); }); /* 글꼴이 늦게 오면 폭을 다시 잰다 */
})();
