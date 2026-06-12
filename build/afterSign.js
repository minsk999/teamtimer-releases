// build/afterSign.js
// 빌드된 .app을 ad-hoc 서명(codesign -s -)합니다.
// 이유: electron-builder가 identity "-"를 '이름이 -인 인증서'로 오인해 서명을 건너뛰는 경우가 있는데,
//       애플실리콘(arm64)은 서명이 전혀 없는 앱을 실행 거부해요. 이 훅이 ad-hoc 서명을 보장합니다.
//       (Apple 유료 인증서 없이, 맥/CI에서 무료로 동작)
const path = require('path');
const { execFileSync } = require('child_process');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return; // 맥 빌드에서만 동작 (윈도우 빌드는 건너뜀)

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`[afterSign] ad-hoc 서명 시작: ${appPath}`);
  try {
    // --deep: 내부 프레임워크까지 / --force: 기존 서명 덮어쓰기 / --sign -: ad-hoc
    execFileSync('codesign', ['--deep', '--force', '--sign', '-', appPath], { stdio: 'inherit' });
    console.log('[afterSign] ad-hoc 서명 완료');
  } catch (e) {
    console.error('[afterSign] 서명 실패:', e.message);
    throw e; // 서명 실패 시 빌드를 멈춰 문제를 바로 알림
  }
};
