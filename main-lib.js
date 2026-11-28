// main-lib.js — main.js 의 순수 함수(전자 모듈·파일·네트워크를 안 씀). node 로 바로 시험한다: test/main-lib.test.js
// ★새 파일이므로 package.json build.files 에 들어 있어야 패키지에 실린다(빠지면 설치본이 시작하자마자 죽는다).
'use strict';

// "1.0.2" vs "1.0.10" 정확 비교 (숫자 파트별) → -1 / 0 / 1
function cmpVer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

// 밖으로 열어도 되는 주소인가 — http/https/mailto 만. 크롬 실행 인자로도 넘어가므로 「--」 로 시작하는 값이 통과하면 안 된다.
function isSafeUrl(url) {
  let p;
  try { p = new URL(String(url)).protocol; } catch (e) { return false; }
  return p === 'http:' || p === 'https:' || p === 'mailto:';
}

// 이번 아키텍처에 맞는 맥 zip 자산을 릴리스에서 고른다. 자산 URL·해시는 여기서 정한다(렌더러 값을 믿지 않는다).
function pickMacAsset(release, arch) {
  const a = arch === 'arm64' ? 'arm64' : 'x64';
  const list = (release && release.assets) || [];
  const hit = list.find(x => /\.zip$/i.test(x.name) && x.name.indexOf(a) !== -1);
  if (!hit) return null;
  return { name: hit.name, url: hit.browser_download_url, size: hit.size, digest: hit.digest || '' };
}

// 받은 파일의 sha256(hex)이 릴리스 digest("sha256:…")와 같은가. 해시가 없거나 다른 형식이면 통과시키지 않는다.
function digestOk(want, haveHex) {
  const w = String(want || '').toLowerCase();
  if (!w.startsWith('sha256:')) return { ok: false, reason: 'no-digest' };
  return { ok: w === 'sha256:' + String(haveHex || '').toLowerCase(), reason: 'mismatch' };
}

module.exports = { cmpVer, isSafeUrl, pickMacAsset, digestOk };
