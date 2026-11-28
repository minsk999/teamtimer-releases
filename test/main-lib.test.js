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

// 창 자리: 주 화면 1920x1040 작업영역 + 오른쪽 둘째 화면
const wa = { width: 1920, height: 1040 }, areas = [{ x: 0, y: 0, width: 1920, height: 1040 }, { x: 1920, y: 0, width: 1280, height: 984 }];
eq('fitWinState 화면 안', L.fitWinState({ x: 100, y: 100, width: 440, height: 720 }, wa, areas), { x: 100, y: 100, width: 440, height: 720 });
eq('fitWinState 뺀 모니터 자리 → 크기만', L.fitWinState({ x: 4000, y: 100, width: 440, height: 720 }, wa, areas), { width: 440, height: 720 });
eq('fitWinState 왼쪽으로 40px 넘게 걸침 → 크기만', L.fitWinState({ x: -41, y: 0, width: 440, height: 720 }, wa, areas), { width: 440, height: 720 });
eq('fitWinState 왼쪽 40px 걸침은 허용', L.fitWinState({ x: -40, y: 0, width: 440, height: 720 }, wa, areas).x, -40);
// 제목줄 판정 구간(x+40 ~ x+120)이 한 화면 안에 다 있어야 한다 — 두 화면 경계에 걸치면 크기만(기존 동작)
eq('fitWinState 판정 구간이 두 화면 경계에 걸침 → 크기만', L.fitWinState({ x: 1850, y: 10, width: 440, height: 720 }, wa, areas), { width: 440, height: 720 });
eq('fitWinState 둘째 화면 안', L.fitWinState({ x: 1900, y: 10, width: 440, height: 720 }, wa, areas).x, 1900);
eq('fitWinState 작업영역보다 큰 창은 줄임', L.fitWinState({ x: 0, y: 0, width: 3000, height: 2000 }, wa, areas), { x: 0, y: 0, width: 1920, height: 1040 });
eq('fitWinState 최소보다 작으면 버림', L.fitWinState({ x: 0, y: 0, width: 319, height: 720 }, wa, areas), null);
eq('fitWinState 자리 없음 → 크기만', L.fitWinState({ width: 500, height: 800 }, wa, areas), { width: 500, height: 800 });

// 받아 둔 업데이트
eq('pendingVerdict 같은 버전은 지움', L.pendingVerdict('작업-타이머-Setup-1.0.42.exe', '1.0.42'), { act: 'delete', ver: '1.0.42' });
eq('pendingVerdict 옛 버전은 지움', L.pendingVerdict('x-1.0.9.exe', '1.0.10').act, 'delete');
eq('pendingVerdict 더 새것은 둠', L.pendingVerdict('x-1.0.43.exe', '1.0.42'), { act: 'keep', ver: '1.0.43' });
eq('pendingVerdict 버전 없는 이름', L.pendingVerdict('setup.exe', '1.0.42'), { act: 'skip' });
const ui = { version: '1.0.43', files: [{ sha512: 'F0' }], sha512: 'OLD' };
eq('pendingWant files[0] 우선', L.pendingWant(ui, '1.0.42', '1.0.43'), 'F0');
eq('pendingWant files 없으면 sha512', L.pendingWant({ version: '1.0.43', sha512: 'S' }, '1.0.42', '1.0.43'), 'S');
eq('pendingWant 릴리스가 받아 둔 것과 다름', L.pendingWant(ui, '1.0.42', '1.0.44'), null);
eq('pendingWant 릴리스가 현재와 같음', L.pendingWant(ui, '1.0.43', '1.0.43'), null);
eq('pendingWant 정보 없음', L.pendingWant(null, '1.0.42', '1.0.43'), null);
eq('pendingHashOk 둘 다 같음', L.pendingHashOk('F0', 'F0', 'F0'), true);
eq('pendingHashOk 파일 해시 불일치', L.pendingHashOk('F0', 'XX', 'F0'), false);
eq('pendingHashOk 기록 해시 불일치', L.pendingHashOk('F0', 'F0', 'XX'), false);
// 업데이트 확인(v1.0.46): 웹 리다이렉트에서 태그 뽑기
eq('tag 절대 주소', L.tagFromReleaseUrl('https://github.com/minsk999/teamtimer-releases/releases/tag/v1.0.45'), 'v1.0.45');
eq('tag 상대 주소', L.tagFromReleaseUrl('/minsk999/teamtimer-releases/releases/tag/v1.0.46'), 'v1.0.46');
eq('tag 없음(latest 그대로)', L.tagFromReleaseUrl('https://github.com/minsk999/teamtimer-releases/releases'), '');
eq('tag 다른 저장소', L.tagFromReleaseUrl('https://github.com/evil/teamtimer-releases/releases/tag/v9.9.9'), '');
eq('tag 다른 호스트', L.tagFromReleaseUrl('https://evil.com/minsk999/teamtimer-releases/releases/tag/v9.9.9'), '');
eq('tag 이상한 태그', L.tagFromReleaseUrl('https://github.com/minsk999/teamtimer-releases/releases/tag/latest'), '');
eq('tag 빈 값', L.tagFromReleaseUrl(null), '');
console.log(`${n - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
