// build/afterSign.js
// 빌드된 .app을 ad-hoc 서명합니다 (안쪽→바깥쪽 순서, --deep 미사용, entitlements 적용).
//
// ⚠️ 중요: 예전엔 'codesign --deep --force --sign -' 를 썼는데, 이 방식이
//   인텔·애플실리콘 모든 Mac에서 앱 시작 시 V8 SIGTRAP 크래시를 유발했습니다.
//   원인 ①  --deep 은 중첩 프레임워크를 잘못된 순서로 재서명해 Electron/V8 정합성을 깨뜨림
//           (Apple도 --deep 서명을 권장하지 않음)
//   원인 ②  재서명 시 --entitlements 를 빼먹어 allow-jit 등 V8 필수 권한이 제거됨
//   → 그래서 가장 깊은 구성요소부터 차례로 서명하고, 실행 파일엔 entitlements 를 적용합니다.
//   (다시 --deep 으로 되돌리지 말 것)

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return; // 맥 빌드에서만 동작

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const ent = path.join(__dirname, 'entitlements.mac.plist');
  const fwDir = path.join(appPath, 'Contents', 'Frameworks');

  // ad-hoc 서명 헬퍼 (--deep 절대 사용 안 함)
  const sign = (target, useEnt) => {
    const args = ['--force', '--sign', '-'];
    if (useEnt) args.push('--entitlements', ent);
    execFileSync('codesign', [...args, target], { stdio: 'inherit' });
  };

  console.log(`[afterSign] 안쪽→바깥쪽 ad-hoc 서명 시작: ${appPath}`);

  const efwA = path.join(fwDir, 'Electron Framework.framework', 'Versions', 'A');

  // 1) Electron Framework 내부 라이브러리(.dylib) — 가장 깊은 곳부터
  const libsDir = path.join(efwA, 'Libraries');
  if (fs.existsSync(libsDir)) {
    for (const f of fs.readdirSync(libsDir)) {
      if (f.endsWith('.dylib')) sign(path.join(libsDir, f), false);
    }
  }
  // 2) Electron Framework 내부 헬퍼 실행파일(chrome_crashpad_handler 등)
  const helpersDir = path.join(efwA, 'Helpers');
  if (fs.existsSync(helpersDir)) {
    for (const f of fs.readdirSync(helpersDir)) {
      const p = path.join(helpersDir, f);
      if (fs.statSync(p).isFile()) sign(p, false);
    }
  }
  // 3) Electron Framework 본체
  sign(efwA, false);

  // 4) 그 외 프레임워크들 (Squirrel, ReactiveObjC, Mantle 등)
  for (const name of fs.readdirSync(fwDir)) {
    if (name.endsWith('.framework') && name !== 'Electron Framework.framework') {
      sign(path.join(fwDir, name, 'Versions', 'A'), false);
    }
  }

  // 5) Helper 앱들 (작업 타이머 Helper.app / (GPU) / (Renderer) / (Plugin)) — entitlements 적용
  for (const name of fs.readdirSync(fwDir)) {
    if (name.endsWith('.app')) {
      sign(path.join(fwDir, name), true);
    }
  }

  // 6) 메인 앱 본체 — entitlements 적용, 가장 마지막에 서명(바깥쪽)
  sign(appPath, true);

  console.log('[afterSign] ad-hoc 서명 완료 (--deep 미사용, entitlements 적용됨)');
};
