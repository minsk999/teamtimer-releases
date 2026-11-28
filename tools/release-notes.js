#!/usr/bin/env node
// 설명서(docs/index.html) 변경 내역에서 한 버전 항목을 뽑아 릴리스 본문(마크다운)으로 낸다.
//   node tools/release-notes.js 1.0.40 [docs 경로]  →  stdout
//   릴리스 때: (docs-vX 가지에서) node tools/release-notes.js X > notes.md && gh release edit vX --notes-file notes.md
'use strict';
const fs = require('fs'), path = require('path');
const ver = String(process.argv[2] || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(ver)) { console.error('사용법: node tools/release-notes.js 1.0.40 [docs/index.html]'); process.exit(1); }
const html = fs.readFileSync(process.argv[3] || path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
const at = html.indexOf('<span class="cl-ver">v' + ver + '</span>');
if (at < 0) { console.error('변경 내역에 v' + ver + ' 항목이 없습니다'); process.exit(1); }
const end = html.indexOf('</details>', at);
const body = html.slice(at, end);
const text = s => s.replace(/<b>|<\/b>/g, '**').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const items = [...body.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => '- ' + text(m[1]));
if (!items.length) { console.error('v' + ver + ' 항목에 내용이 없습니다'); process.exit(1); }
process.stdout.write('## 작업 타이머 v' + ver + ' 바뀐 점\n\n' + items.join('\n') + '\n\n설치·업데이트 방법: https://minsk999.github.io/teamtimer-releases/\n');
