// main-lib.test.js — main.js 가 쓰는 순수 함수(버전 비교·링크 검사·맥 자산 고르기·해시 대조)
'use strict';
const L = require('../main-lib.js');
let fail = 0, n = 0;
const eq = (name, got, want) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log((ok ? 'OK    ' : 'FAIL  ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };

eq('cmpVer 1.0.10 > 1.0.9', L.cmpVer('1.0.10', '1.0.9'), 1);
eq('cmpVer v 접두', L.cmpVer('v1.0.39', '1.0.39'), 0);
eq('cmpVer 1.0 = 1.0.0', L.cmpVer('1.0', '1.0.0'), 0);
eq('cmpVer 작다', L.cmpVer('1.0.38', '1.0.39'), -1);

for (const [u, w] of [['https://intranet.adef.co.kr/x?idx=1', true], ['http://a.b/', true], ['mailto:a@b.c', true],
  ['javascript:alert(1)', false], ['file:///C:/Windows/notepad.exe', false], ['ms-msdt:/id x', false],
  ['--gpu-launcher=calc', false], ['intranet.adef.co.kr/x', false], ['', false], [null, false]]) eq('isSafeUrl ' + JSON.stringify(u), L.isSafeUrl(u), w);

const rel = { assets: [{ name: 'TeamTimer-1.0.39-arm64.zip', browser_download_url: 'u1', size: 1, digest: 'sha256:aa' },
  { name: 'TeamTimer-1.0.39-x64.zip', browser_download_url: 'u2', size: 2, digest: 'sha256:bb' },
  { name: 'TeamTimer-1.0.39-x64.dmg', browser_download_url: 'u3', size: 3 }] };
eq('pickMacAsset arm64', L.pickMacAsset(rel, 'arm64').url, 'u1');
eq('pickMacAsset x64 은 zip 만', L.pickMacAsset(rel, 'x64').url, 'u2');
eq('pickMacAsset 없음', L.pickMacAsset({ assets: [] }, 'x64'), null);

eq('digestOk 같음', L.digestOk('sha256:ABCD', 'abcd').ok, true);
eq('digestOk 다름', L.digestOk('sha256:abcd', 'abce').ok, false);
eq('digestOk 해시 없음', L.digestOk('', 'abcd'), { ok: false, reason: 'no-digest' });
eq('digestOk 다른 형식', L.digestOk('sha512:abcd', 'abcd').ok, false);
console.log(`${n - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
