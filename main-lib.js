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

// 저장된 창 자리(b)를 지금 화면에 맞춘다. wa = 주 화면 workAreaSize, areas = 모든 화면의 workArea 배열.
// 크기는 주 화면 작업영역으로 줄이고, 자리는 어느 화면 안에 걸려 있을 때만 쓴다(모니터를 뺀 경우). 못 쓰면 null.
function fitWinState(b, wa, areas) {
  if (!b || !(b.width >= 320 && b.height >= 420)) return null;
  b.width = Math.min(b.width, wa.width); b.height = Math.min(b.height, wa.height);   // 큰 모니터에서 쓰던 크기가 작은 화면에서 넘치지 않게
  if (typeof b.x !== 'number' || typeof b.y !== 'number') return { width: b.width, height: b.height };
  const onScreen = (areas || []).some(a =>
    b.x + 40 >= a.x && b.y >= a.y && b.x + 120 <= a.x + a.width && b.y + 40 <= a.y + a.height);
  return onScreen ? b : { width: b.width, height: b.height };
}

// 받아 둔 업데이트 파일 이름 → { act:'skip' }(버전 못 읽음) | { act:'delete', ver }(현재 이하) | { act:'keep', ver }(더 새것)
function pendingVerdict(fileName, curVer) {
  const m = String(fileName || '').match(/(\d+\.\d+\.\d+)/);
  if (!m) return { act: 'skip' };
  return { act: cmpVer(m[1], curVer) <= 0 ? 'delete' : 'keep', ver: m[1] };
}

// 받아 둔 버전(pendVer)이 지금 릴리스와 같고 현재보다 새면 그 릴리스의 sha512(files[0] 우선)를, 아니면 null
function pendingWant(updateInfo, curVer, pendVer) {
  const u = updateInfo;
  const want = u && (u.files && u.files[0] ? u.files[0].sha512 : u.sha512);
  if (!(u && cmpVer(u.version, curVer) > 0 && u.version === pendVer && want)) return null;
  return want;
}

// 받아 둔 파일의 실제 해시(have)·기록된 해시(infoSha)가 둘 다 릴리스 해시(want)와 같을 때만 되살린다
function pendingHashOk(want, have, infoSha) {
  return !!want && have === want && infoSha === want;
}

// github.com/minsk999/teamtimer-releases/releases/latest 가 돌려주는 리다이렉트 주소(Location)에서 태그만 뽑는다.
// 이 저장소의 releases/tag/<버전 태그> 모양일 때만 — 그 밖(로그인 페이지·다른 저장소·이상한 태그)은 빈 값(API 로 넘어감).
function tagFromReleaseUrl(loc) {
  if (!loc) return '';
  let u; try { u = new URL(String(loc), 'https://github.com'); } catch (e) { return ''; }
  if (u.protocol !== 'https:' || u.hostname !== 'github.com') return '';
  const m = u.pathname.match(/^\/minsk999\/teamtimer-releases\/releases\/tag\/(v?\d+\.\d+\.\d+)$/);
  return m ? m[1] : '';
}

module.exports = { cmpVer, isSafeUrl, tagFromReleaseUrl, pickMacAsset, digestOk, fitWinState, pendingVerdict, pendingWant, pendingHashOk };
