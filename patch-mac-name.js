// ============================================================
//  patch-mac-name.js  (v1.0.17)
//  CI의 macOS 잡에서만 실행됨. Windows 빌드에는 전혀 영향 없음.
//
//  [원인]
//  Electron은 macOS에서 Info.plist의 CFBundleDisplayName / CFBundleName 으로
//  app.getName() 을 정하고, 그 이름이 그대로 데이터 폴더 경로가 된다.
//      ~/Library/Application Support/<app.getName()>
//  1.0.16은 실행파일 경로만 ASCII(TeamTimer)로 바꾸고 위 두 키는 한글로 남겨둬서
//  데이터 경로가 계속 한글이었고, 크래시가 사라지지 않고 위치만 앞당겨졌다.
//  (v8::BackingStore → ElectronInitializeICUandStartNode)
//
//  [근거]
//  같은 iMac에서 정상 실행된 AppTest 빌드와 DMG를 바이트 단위로 비교한 결과
//  Electron 버전·퓨즈·Info.plist 키·asar 무결성·V8 스냅샷까지 전부 동일했고,
//  실질적 차이는 "이름이 전부 ASCII인가" 하나뿐이었다.
//
//  [v1.0.17 조치]
//  macOS 빌드는 이름을 전부 ASCII로 통일 → 앱 경로·데이터 경로 모두 ASCII.
//  (Finder/독/메뉴바 표시가 "TeamTimer"가 되는 건 감수. Windows는 "작업 타이머" 유지)
// ============================================================

const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// .app 폴더 / 실행파일 / Helper 앱 경로 → ASCII
p.build.productName = 'TeamTimer';

// ★ v1.0.17 핵심: CFBundleDisplayName / CFBundleName 을 한글로 덮어쓰지 않는다.
if (p.build.mac && p.build.mac.extendInfo) {
  delete p.build.mac.extendInfo.CFBundleDisplayName;
  delete p.build.mac.extendInfo.CFBundleName;
  if (Object.keys(p.build.mac.extendInfo).length === 0) delete p.build.mac.extendInfo;
}

fs.writeFileSync('package.json', JSON.stringify(p, null, 2));
console.log('[patch-mac-name] mac 이름 전부 ASCII 통일: TeamTimer (한글 덮어쓰기 제거)');
