// ============================================================
//  sign-mac.js — macOS 앱 번들 ad-hoc 서명 (CI mac job 전용)
//
//  [왜 필요한가]
//  electron-builder 의 mac.identity="-" 만으로는 번들에
//  _CodeSignature/CodeResources 가 생성되지 않는 경우가 있다.
//  CodeResources 는 번들 안 모든 파일의 목록·해시를 담은 서명 명세로,
//  이게 없으면 macOS 는 번들을 "손상되었거나 변조됨"으로 판정한다.
//
//  Intel 맥은 이 상태도 관대하게 넘어가지만, Apple Silicon + 최신 macOS 는
//  실행을 막고 "악성 코드가 차단되고 휴지통으로 이동함"으로 삭제한다.
//  (실제로 v1.0.24 arm64 DMG 에 CodeResources 가 전혀 없었음)
//
//  [무엇을 하는가]
//  중첩 번들을 안쪽부터 바깥으로 순서대로 ad-hoc 서명한다.
//  순서가 틀리면 바깥 서명이 안쪽 변경으로 즉시 무효가 된다.
// ============================================================

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const arch = process.argv[2] || 'x64';
const appPath = path.join('dist', arch === 'arm64' ? 'mac-arm64' : 'mac', 'TeamTimer.app');

if (!fs.existsSync(appPath)) {
  console.error(`[sign-mac] ❌ 앱을 찾을 수 없음: ${appPath}`);
  process.exit(1);
}

function sign(target, deep) {
  const args = ['--force', '--sign', '-', '--timestamp=none'];
  if (deep) args.push('--deep');
  args.push(target);
  execFileSync('codesign', args, { stdio: 'inherit' });
}

const FW = path.join(appPath, 'Contents/Frameworks');

// ① 가장 안쪽: dylib · 보조 실행파일
const inner = [
  'Electron Framework.framework/Versions/A/Libraries/libEGL.dylib',
  'Electron Framework.framework/Versions/A/Libraries/libGLESv2.dylib',
  'Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib',
  'Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib',
  'Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler',
  'Squirrel.framework/Versions/A/Resources/ShipIt',
];
for (const rel of inner) {
  const t = path.join(FW, rel);
  if (fs.existsSync(t)) { console.log('[sign-mac] inner:', rel); sign(t, false); }
}

// ② 프레임워크
for (const fw of ['Electron Framework.framework', 'Squirrel.framework', 'Mantle.framework', 'ReactiveObjC.framework']) {
  const t = path.join(FW, fw);
  if (fs.existsSync(t)) { console.log('[sign-mac] framework:', fw); sign(t, false); }
}

// ③ Helper 앱들
if (fs.existsSync(FW)) {
  for (const name of fs.readdirSync(FW)) {
    if (!name.endsWith('.app')) continue;
    console.log('[sign-mac] helper:', name);
    sign(path.join(FW, name), true);
  }
}

// ④ 마지막: 앱 본체
console.log('[sign-mac] app:', appPath);
sign(appPath, false);

// ⑤ 검증 — CodeResources 생성 여부 + 서명 유효성
const cr = path.join(appPath, 'Contents/_CodeSignature/CodeResources');
if (!fs.existsSync(cr)) {
  console.error('[sign-mac] ❌ CodeResources 가 생성되지 않았습니다.');
  process.exit(1);
}
console.log('[sign-mac] ✅ CodeResources 생성 확인');
execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' });
console.log(`[sign-mac] ✅ ${arch} 서명 완료`);
