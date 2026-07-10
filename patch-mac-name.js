// CI mac job 전용: 실행파일 경로를 ASCII로, 표시 이름은 한글 유지
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
p.build.productName = 'TeamTimer'; // .app 폴더/실행파일/헬퍼 경로 → ASCII
p.build.mac.extendInfo = Object.assign({}, p.build.mac.extendInfo, {
  CFBundleDisplayName: '작업 타이머', // Finder/독 표시 이름
  CFBundleName: '작업 타이머'         // 메뉴바 표시 이름
});
fs.writeFileSync('package.json', JSON.stringify(p, null, 2));
console.log('mac name patched: executable=TeamTimer, display=작업 타이머');
