#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
//  버전 올리기 — package.json 과 docs/index.html 을 한 번에
//
//  릴리스마다 docs 의 버전 표기·다운로드 링크를 손으로 고쳐 왔는데,
//  한 군데만 빠뜨려도 팀원이 옛 파일을 받아 간다(실제로 겪음).
//  자동 업데이트가 들어간 뒤로는 앱은 새 버전인데 설명서는 옛 버전을
//  가리키는 상태가 되므로 더 헷갈린다.
//
//  사용법:  node bump-version.js 1.0.28
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const next = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(String(next || ''))) {
  console.error('사용법: node bump-version.js 1.0.28');
  process.exit(1);
}

const root = __dirname;
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const prev = pkg.version;

if (prev === next) { console.error(`이미 ${next} 입니다`); process.exit(1); }

// package.json — 들여쓰기·줄바꿈을 건드리지 않도록 문자열 치환으로
const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
const verLine = `"version": "${prev}"`;
if (!pkgRaw.includes(verLine)) { console.error('package.json 의 version 줄을 찾지 못했습니다'); process.exit(1); }
fs.writeFileSync(pkgPath, pkgRaw.replace(verLine, `"version": "${next}"`));

// docs/index.html — 버전 표기와 릴리스 다운로드 링크 전부
const docsPath = path.join(root, 'docs', 'index.html');
let docs = fs.readFileSync(docsPath, 'utf8');
const before = docs;
docs = docs.split(prev).join(next);
const hits = before.split(prev).length - 1;
fs.writeFileSync(docsPath, docs);

console.log(`${prev} → ${next}`);
console.log(`  package.json  version 1곳`);
console.log(`  docs/index.html  ${hits}곳`);
console.log('');
console.log('다음 단계:');
console.log(`  git add -A && git commit -m "v${next}"`);
console.log(`  git tag v${next} && git push origin main && git push origin v${next}`);
