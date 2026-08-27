// ─────────────────────────────────────────────
//  작업 타이머 — Electron 메인 프로세스
// ─────────────────────────────────────────────
const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { execFile } = require('child_process');

// ── Windows 알림 표시 이름/아이콘 ──
// AppUserModelID를 지정하지 않으면 Windows가 알림 좌상단에 앱 아이콘을 못 찾고
// 이름 자리에 'electron.app.…'을 표시한다. 설치본 바로가기의 ID(=build.appId)와 맞춘다.
if (process.platform === 'win32') app.setAppUserModelId('kr.co.adef.jakeop-timer');

// ── 빌드 비밀값 (공개 레포 보호를 위해 소스에서 분리) ──
// 로컬 빌드: 옆의 build-secrets.js 사용 (git에는 올라가지 않음, 배포 zip에는 포함)
// CI 빌드: GitHub Actions가 저장소 Secrets로 build-secrets.js를 생성
let SECRETS = {};
try { SECRETS = require('./build-secrets.js'); } catch (e) { /* 없으면 빈 값 — 메일/공휴일만 비활성 */ }

// ── Gmail OAuth (데스크톱 앱 클라이언트) ──
const GMAIL_CLIENT_ID = SECRETS.GMAIL_CLIENT_ID || '';
const GMAIL_CLIENT_SECRET = SECRETS.GMAIL_CLIENT_SECRET || '';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

// 구글 시트 연동 — Apps Script 웹앱 URL (기존 배포 유지)
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzpYvgADNXn3POEe-XDsOVR9Q1AvH_xJ_d38vymNNkjdKCtjtEIiSJJVrpX61FA_6wGbg/exec';

// 참고: 과거 '고용량 RAM 맥 V8 크래시 방지'용으로 넣었던
// app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096') 는 제거함.
// 이 옵션이 오히려 인텔 맥(128GB RAM)+Electron 31에서 V8 컴파일러 초기화 중
// SIGTRAP 크래시를 유발했음. V8 기본 힙 설정에 맡기는 편이 안전. (다시 추가하지 말 것)

// GPU 디스크 캐시 권한 오류(0x5) 방지 — 캐시를 앱 전용 폴더로, 셰이더 디스크 캐시 끔
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// userData 폴더명: 'teamtimer' (예전 'jakeop-timer'에서 변경).
// 기존 사용자의 설정이 사라지지 않도록, 새 폴더가 없고 옛 폴더가 있으면 1회 복사 이관.
(function migrateUserData() {
  try {
    const appData = app.getPath('appData');
    const oldDir = path.join(appData, 'jakeop-timer');
    const newDir = path.join(appData, 'teamtimer');
    if (!fs.existsSync(newDir) && fs.existsSync(oldDir)) {
      // Node 16+ : fs.cpSync 재귀 복사 (원본은 보존 — 롤백 안전)
      fs.cpSync(oldDir, newDir, { recursive: true });
    }
  } catch (e) { /* 이관 실패해도 앱은 새 폴더로 정상 시작 */ }
})();
app.setPath('userData', path.join(app.getPath('appData'), 'teamtimer'));

let mainWindow = null;
let tray = null;
let isQuitting = false;

const isDev = process.argv.includes('--dev');

// ── 업데이트 확인 헬퍼 (check-update IPC가 사용) ──
// GitHub 릴리스의 최신 버전을 조회. 서명 없는 맥/윈도우 모두 동일하게 작동
// (자동 설치 X — 안내만, 다운로드는 웹에서). 트레이·IPC가 공유.
const GITHUB_OWNER = 'minsk999';
const GITHUB_REPO = 'teamtimer-releases';
function cmpVer(a, b) {
  // "1.0.2" vs "1.0.10" 정확 비교 (숫자 파트별)
  const pa = String(a).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}
async function fetchLatestRelease() {
  const cur = app.getVersion();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    { signal: ctrl.signal, headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'teamtimer' } }
  );
  clearTimeout(t);
  if (!res.ok) return { ok: false, error: 'http-' + res.status };
  const json = await res.json();
  const latest = String(json.tag_name || '').replace(/^v/, '');
  if (!latest) return { ok: false, error: 'no-tag' };
  const hasUpdate = cmpVer(latest, cur) > 0;
  // 업데이트 안내 링크는 설명서(GitHub Pages)로 — 다운로드 카드가 거기 있음
  return { ok: true, current: cur, latest, hasUpdate, url: `https://minsk999.github.io/${GITHUB_REPO}/` };
}

// ═════════════════════════════════════════════════════════════════════
//  자동 업데이트
// ═════════════════════════════════════════════════════════════════════
//
// Windows : electron-updater(NSIS). 무서명이어도 정상 동작한다.
//
// macOS   : Squirrel.Mac 은 **구조적으로 불가능**하다. 새 .app 이 "지금 실행 중인 앱의
//           designated requirement" 를 만족해야 하는데, ad-hoc 서명(`--sign -`)에는 서명 주체가
//           없어 DR 이 `cdhash H"<그 바이너리 해시>"` 가 된다. 새 버전은 정의상 다른 바이너리라
//           **논리적으로 항상 불일치**다. 설정으로 우회할 수 없다.
//           → 아래 자체 업데이터를 쓴다(다운로드·검증·전개). 교체는 MAC_AUTO_APPLY 로 잠가 뒀다.
//
// ★다운로드는 반드시 앱이 직접 한다. 브라우저에 맡기면 Windows 는 MotW,
//   macOS 는 com.apple.quarantine 이 붙어 SmartScreen/Gatekeeper 가 발동한다.
//   앱이 받으면 둘 다 안 붙는다 — 맥의 "손상되었기 때문에 열 수 없습니다" 가 사라지는 이유다.

const UPDATE_HOSTS = new Set([
  'api.github.com', 'github.com', 'objects.githubusercontent.com',
  'release-assets.githubusercontent.com', 'codeload.github.com',
]);
// 리다이렉트를 따라가다 허용 목록 밖으로 나가면 중단한다.
// (호스트 검사를 최초 URL 에만 걸면 리다이렉트로 우회된다)
function assertUpdateHost(u) {
  let h;
  try { h = new URL(u).hostname; } catch (e) { throw new Error('bad-url'); }
  if (!UPDATE_HOSTS.has(h)) throw new Error('host-not-allowed: ' + h);
}
// 경로·파일명에 쓰는 버전 문자열 정화 (경로 탈출 차단)
function safeVer(v) { return String(v || '').replace(/[^0-9A-Za-z._-]/g, '').slice(0, 32) || 'update'; }

// ── Windows: electron-updater ────────────────────────────────────────
let _eu = null;              // electron-updater 인스턴스 (지연 로딩)
let _euWired = false;
let euDownloaded = false;    // 설치 가능한 파일이 실제로 준비됐는가
function updaterSupported() {
  // 개발 모드에서는 app-update.yml 이 없어 autoUpdater 가 예외를 던진다.
  return process.platform === 'win32' && app.isPackaged;
}
function sendUpd(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('updater:event', payload); } catch (e) {}
  }
}
function getEU() {
  if (_eu || !updaterSupported()) return _eu;
  try {
    _eu = require('electron-updater').autoUpdater;
  } catch (e) { _eu = null; return null; }
  if (!_euWired) {
    _euWired = true;
    _eu.autoDownload = false;          // 사용자가 [받기] 를 눌러야 받는다
    // ★종료할 때 몰래 설치하지 않는다. 이 앱의 NSIS 는 oneClick:false(마법사형)라,
    //   켜 두면 사용자가 트레이에서 앱을 끈 순간 설치 마법사가 예고 없이 튀어나온다.
    //   설치는 사용자가 [지금 재시작] 을 눌렀을 때만 한다.
    _eu.autoInstallOnAppQuit = false;
    _eu.allowPrerelease = false;       // prerelease 는 검증용이라 팀에 배포하지 않는다
    _eu.logger = null;
    _eu.on('update-available', (i) => sendUpd({ type: 'available', version: i && i.version }));
    _eu.on('update-not-available', () => sendUpd({ type: 'none' }));
    _eu.on('download-progress', (p) => sendUpd({ type: 'progress', percent: Math.round(p.percent || 0) }));
    _eu.on('update-downloaded', () => { euDownloaded = true; });
    _eu.on('update-downloaded', (i) => sendUpd({ type: 'ready', version: i && i.version }));
    _eu.on('error', (e) => sendUpd({ type: 'error', error: String((e && e.message) || e) }));
  }
  return _eu;
}

// ── macOS: 자체 업데이터 ─────────────────────────────────────────────
//
// ⚠️ MAC_AUTO_APPLY 는 **의도적으로 false 다.** 실행 중인 .app 을 스스로 교체하려면
//    macOS 13+ 의 App Management(TCC) 권한을 통과해야 하는데 아직 실기로 확인하지 못했다.
//    확인 방법(반나절): 앱이 실행 중인 상태에서
//        mv /Applications/TeamTimer.app /Applications/.tt-bak.app && mv 되돌리기
//    를 **터미널과 앱 자신** 양쪽에서 해 본다(TCC 는 호출 주체를 본다).
//    `Operation not permitted` 가 나오면 자체 교체는 불가 → Apple Developer($99/년)로 가야 한다.
//    통과하면 이 값을 true 로 바꾸고 P4~P9(교체·셀프테스트·롤백)를 붙인다.
//    ★검증 전에 켜지 말 것. 이 프로젝트의 장기 장애 2건이 모두 맥 번들 문제였다.
// 시작 시 1회 확인만으로는 상주 앱에 업데이트가 도달하지 않는다 —
// 몇 주씩 안 끄는 사람이 있어서, 6시간마다 조용히 다시 본다.
async function pushUpdateCheck() {
  try {
    const r = await fetchLatestRelease();
    if (r && r.ok && r.hasUpdate) sendUpd({ type: 'banner', ...r });
  } catch (e) {}
}
function startUpdatePolling() {
  setInterval(pushUpdateCheck, 6 * 60 * 60 * 1000);
}

const MAC_AUTO_APPLY = false;

const macUpd = { state: 'idle', pct: 0, msg: '', err: '', staged: '', ver: '' };
let macUpdBusy = false;
function setMacUpd(patch) {
  Object.assign(macUpd, patch);
  sendUpd({ type: 'mac', ...macUpd });
}

// 이번 플랫폼/아키텍처에 맞는 zip 자산을 릴리스에서 고른다.
// ★자산 URL·해시는 **여기서 정한다.** 렌더러가 준 값을 믿으면 임의 바이너리를 받게 된다.
function pickMacAsset(release) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const list = (release && release.assets) || [];
  const hit = list.find(a => /\.zip$/i.test(a.name) && a.name.indexOf(arch) !== -1);
  if (!hit) return null;
  return { name: hit.name, url: hit.browser_download_url, size: hit.size, digest: hit.digest || '' };
}

async function macDownloadAndStage(asset, version) {
  const os = require('os');
  const crypto = require('crypto');
  const { execFile } = require('child_process');
  assertUpdateHost(asset.url);

  const dir = path.join(app.getPath('userData'), 'updates');
  fs.mkdirSync(dir, { recursive: true });
  // 지난 중단분 청소 — 안 지우면 시도할 때마다 수백 MB 가 쌓인다.
  // ★.part 파일뿐 아니라 지난 버전의 stage-* 디렉터리도 지운다(한 벌이 통째로 앱 크기다).
  const keepStage = 'stage-' + safeVer(version);
  for (const f of fs.readdirSync(dir)) {
    if (/\.part-/.test(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} }
    else if (f.startsWith('stage-') && f !== keepStage) {
      try { fs.rmSync(path.join(dir, f), { recursive: true, force: true }); } catch (e) {}
    }
  }

  setMacUpd({ state: 'download', pct: 0, msg: '새 버전을 받는 중이에요', err: '', ver: version });
  // 멎은 연결을 감지한다 — 없으면 macUpdBusy 가 안 풀려 재시도 자체가 막힌다.
  const ctrl = new AbortController();
  let stall = setTimeout(() => ctrl.abort(), 30000);       // 응답 헤더까지 30초
  const res = await fetch(asset.url,
    { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'teamtimer' } });
  assertUpdateHost(res.url);                       // ★리다이렉트 도착지도 검사
  if (!res.ok) { clearTimeout(stall); throw new Error('다운로드 실패 (HTTP ' + res.status + ')'); }

  const total = Number(res.headers.get('content-length') || asset.size || 0);
  const tmp = path.join(dir, safeVer(version) + '.zip.part-' + crypto.randomBytes(4).toString('hex'));
  const hash = crypto.createHash('sha256');
  let got = 0, lastPct = -1;
  const out = fs.createWriteStream(tmp);
  // ★생성 직후에 붙여야 한다. 루프 뒤에 붙이면 그 사이의 디스크 오류가
  //   리스너 없는 'error' 가 되어 메인 프로세스 미처리 예외로 터진다.
  const writeFailed = new Promise((_, rej) => out.once('error', rej));
  try {
    await Promise.race([writeFailed, (async () => {
      for await (const chunk of res.body) {
        clearTimeout(stall);
        stall = setTimeout(() => ctrl.abort(), 60000);     // 60초 무진전이면 끊는다
        hash.update(chunk);
        got += chunk.length;
        // ★반환값이 false 면 버퍼가 찼다는 뜻 — drain 을 기다려야 힙에 고이지 않는다
        if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
        if (total) {
          const p = Math.round(got * 100 / total);
          if (p !== lastPct) { lastPct = p; setMacUpd({ pct: p }); }
        }
      }
    })()]);
    await new Promise((r, j) => { out.end(); out.once('finish', r); out.once('error', j); });
  } catch (e) {
    clearTimeout(stall);
    try { out.destroy(); } catch (e2) {}
    try { fs.unlinkSync(tmp); } catch (e2) {}
    throw (e && e.name === 'AbortError') ? new Error('연결이 끊겼어요 — 다시 시도해 주세요') : e;
  }
  clearTimeout(stall);
  if (total && got !== total) { try { fs.unlinkSync(tmp); } catch (e) {} throw new Error(`전송이 중간에 끊겼어요 (${got}/${total})`); }

  // 무결성 — GitHub 릴리스 응답의 digest 를 그대로 쓴다. 별도 해시 배포가 필요 없다.
  setMacUpd({ state: 'verify', msg: '파일을 확인하는 중이에요' });
  const want = String(asset.digest || '').toLowerCase();
  const have = 'sha256:' + hash.digest('hex');
  if (!want.startsWith('sha256:')) throw new Error('검증용 해시가 없어요');
  if (have !== want) { try { fs.unlinkSync(tmp); } catch (e) {} throw new Error('파일 검증에 실패했어요 — 다시 시도해 주세요'); }

  // ★전개는 반드시 ditto 다. zip 모듈로 풀면 심볼릭 링크와 실행 비트를 잃어
  //   번들의 ad-hoc 서명이 무효가 되고 arm64 에서 'killed: 9' 가 난다.
  setMacUpd({ state: 'extract', msg: '압축을 푸는 중이에요' });
  const stage = path.join(dir, 'stage-' + safeVer(version));
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  await new Promise((resolve, reject) => {
    execFile('/usr/bin/ditto', ['-x', '-k', tmp, stage], (err, so, se) => {
      if (err) reject(new Error('압축 해제 실패: ' + String(se || err).slice(0, 200)));
      else resolve();
    });
  });
  try { fs.unlinkSync(tmp); } catch (e) {}

  // 전개 정합성 — 여기서 걸러야 다음 단계로 못 넘어간다
  const appDir = fs.readdirSync(stage).find(n => n.endsWith('.app'));
  if (!appDir) throw new Error('받은 파일의 구조가 예상과 달라요');
  const appPath = path.join(stage, appDir);

  // ★zip 왕복을 거친 뒤 ad-hoc 서명이 살아 있는지 확인한다.
  //   깨진 번들을 응용 프로그램 폴더에 넣으면 Apple Silicon 이 악성코드로 보고
  //   조용히 지워 버린다(과거 실제로 겪음). 여기서 막는 편이 훨씬 싸다.
  await new Promise((resolve, reject) => {
    execFile('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], (err, so, se) => {
      if (err) reject(new Error('서명 검증에 실패했어요 — 설치하면 안 됩니다: ' + String(se || err).slice(0, 160)));
      else resolve();
    });
  });

  return appPath;
}


// 부팅 자동 실행으로 켜졌는지 판별 (윈도우: 로그인 항목 인자 / 맥: wasOpenedAtLogin)
function wasOpenedAtLogin() {
  if (process.argv.includes('--autostart')) return true;
  try { if (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin) return true; } catch (e) {}
  return false;
}
// 시작 설정(부팅 시 최소화 여부)을 main에서 읽을 수 있게 userData에 파일로 보관
function startupCfgPath() { return path.join(app.getPath('userData'), 'startup.json'); }
function readStartupCfg() {
  try { return JSON.parse(fs.readFileSync(startupCfgPath(), 'utf8')) || {}; } catch (e) { return {}; }
}
function writeStartupCfg(obj) {
  try { fs.writeFileSync(startupCfgPath(), JSON.stringify(obj || {})); } catch (e) {}
}

// ── 메인 창 생성 ──
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 720,
    minWidth: 320,
    minHeight: 420,
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    // 전 플랫폼 커스텀 타이틀바. 맥의 네이티브 신호등은 OS가 웹 화면 위에 직접 그려서
    // (1) 항상 좌측 고정이라 윈도우와 레이아웃이 어긋나고 (2) 모달 블러가 적용되지 않는다.
    // → frame:false 로 신호등을 없애고, 렌더러의 커스텀 버튼(우측)을 양쪽 플랫폼 공통으로 사용.
    frame: false,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // 보안: 렌더러와 Node 분리
      nodeIntegration: false,
    },
  });

  // 최소 크기 권장값 (OS가 지원하면 적용, 아니어도 레이아웃이 안 깨지도록 CSS가 보장)
  mainWindow.setMinimumSize(320, 420);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 준비되면 표시 (깜빡임 방지). 단, 부팅 자동 실행 + "최소화 시작" 설정이면 트레이에 머무름
  mainWindow.once('ready-to-show', () => {
    if (wasOpenedAtLogin() && readStartupCfg().minimized) return; // 창 안 띄우고 트레이 상주
    mainWindow.show();
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  // 닫기 = 항상 트레이로 최소화 (완전 종료는 트레이 우클릭 → 종료)
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
  });

  // 외부 링크는 선택한 브라우저/프로필로 열기 (요청글/기획안 링크)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openUrl(url);
    return { action: 'deny' };
  });

  // 최대화/복원 시 렌더러에 알림 (아이콘 전환)
  mainWindow.on('maximize', () => sendMaxState());
  mainWindow.on('unmaximize', () => sendMaxState());
}

// ── 트레이 아이콘 ──
function createTray() {
  // 윈도우는 .ico(멀티사이즈)가 가장 선명, 그 외엔 png
  let icon;
  try {
    if (process.platform === 'darwin') {
      // 맥 메뉴바는 높이가 22pt — 32px 원본을 그대로 쓰면 잘리고 흐려진다.
      // 22px(@1x) + 44px(@2x, 레티나) 세트를 쓰고 템플릿으로 지정해
      // 다크/라이트 메뉴바에 맞춰 OS가 자동으로 색을 맞추게 한다.
      icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'trayTemplate.png'));
      const hi = nativeImage.createFromPath(path.join(__dirname, 'build', 'trayTemplate@2x.png'));
      if (!icon.isEmpty() && !hi.isEmpty()) icon.addRepresentation({ scaleFactor: 2, buffer: hi.toPNG() });
      if (!icon.isEmpty()) icon.setTemplateImage(true);
      if (icon.isEmpty()) icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png'));
    } else {
      const icoPath = path.join(__dirname, 'build', 'tray.ico');
      const pngPath = path.join(__dirname, 'build', 'tray.png');
      const tryPath = (process.platform === 'win32') ? icoPath : pngPath;
      icon = nativeImage.createFromPath(tryPath);
      if (icon.isEmpty()) icon = nativeImage.createFromPath(pngPath);
      if (icon.isEmpty()) icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.ico'));
    }
  } catch (e) {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip('작업 타이머');

  const menu = Menu.buildFromTemplate([
    { label: '작업 타이머 열기', click: () => { mainWindow.show(); } },
    // 상주 앱이라 창을 몇 주씩 안 여는 사람이 있다 — 수동 진입점을 하나 둔다
    { label: '업데이트 확인', click: () => { mainWindow.show(); pushUpdateCheck(); } },
    { type: 'separator' },
    { label: '종료', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);

  // 트레이 클릭 시 창 토글
  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  });
}

// ── 앱 생명주기 ──
// ── 중복 실행 방지 ──
// 이미 실행 중이면 두 번째 인스턴스는 즉시 종료하고, 기존 창을 앞으로 가져와요.
// (두 번째 인스턴스가 임시 프로필로 떠서 설정이 빈 채로 보이던 문제도 함께 해결)
// 주의: requestSingleInstanceLock은 userData 경로 기준으로 판정하므로,
//       반드시 위쪽 app.setPath('userData', ...) 이후에 호출돼야 한다(이미 그러함).
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // app.quit()은 이벤트 루프를 거쳐 비동기 종료라 그 사이 창이 뜰 여지가 있음.
  // app.exit(0)으로 즉시 프로세스를 끝내 두 번째 창을 확실히 차단.
  app.exit(0);
} else {
  app.on('second-instance', () => {
    // 사용자가 앱을 또 실행했을 때 — 기존 창을 복원·표시하고 포커스
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

app.whenReady().then(() => {
  createWindow();
  createTray();
  startUpdatePolling();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  // 트레이 상주 앱 — 창을 닫아도 종료하지 않음 (종료는 트레이 우클릭 → 종료)
  // 맥은 Dock 아이콘 클릭 시 위 activate 핸들러가 창을 다시 표시
});

app.on('before-quit', () => { isQuitting = true; });

// ─────────────────────────────────────────────
//  IPC 핸들러 — 렌더러(앱 UI)에서 호출
// ─────────────────────────────────────────────

// OS 레벨 알림 (알람 기능에서 사용)
ipcMain.handle('notify', (event, { title, body, mailId }) => {
  if (!Notification.isSupported()) return false;
  // icon 은 지정하지 않는다 — Windows에서 본문 좌측에 큰 이미지로 들어가 공간만 차지함.
  // 헤더의 작은 앱 아이콘/이름은 app.setAppUserModelId 로 이미 처리됨.
  const n = new Notification({ title: title || '작업 타이머', body: body || '', silent: true });
  n.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    // 알림에 메일 id가 실려 있으면 렌더러가 설정(Gmail/요청글/둘 다)대로 열도록 전달
    if (mailId) mainWindow.webContents.send('notification-mail-click', mailId);
  });
  n.show();
  return true;
});

// 창 컨트롤 (윈도우 커스텀 타이틀바용)
ipcMain.on('win:minimize', () => mainWindow.minimize());
ipcMain.on('win:maximize', () => {
  if (mainWindow.isMaximized()) {
    // 복원 시 기본 크기로 (440 x 720 — 시작 크기와 동일)
    mainWindow.unmaximize();
    mainWindow.setSize(440, 720);
    mainWindow.center();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('win:close', () => mainWindow.hide()); // 닫기 = 트레이로

// 최대화/복원 상태를 렌더러에 알림 (아이콘 전환용)
function sendMaxState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('win:maximized-changed', mainWindow.isMaximized());
  }
}

// 외부 링크 열기
// ★스킴을 반드시 거른다. 여기로 오는 값의 상당수는 시트에서 읽어 온 요청글 링크인데,
//   시트는 팀 밖에서도 편집될 수 있다. file:/ms-msdt:/javascript: 같은 게 섞여 들어오면
//   shell.openExternal 이 그대로 OS 핸들러에 넘긴다.
ipcMain.handle('open-external', (event, url) => {
  let p;
  try { p = new URL(String(url)).protocol; } catch (e) { return false; }
  if (p !== 'http:' && p !== 'https:' && p !== 'mailto:') return false;
  openUrl(url);
  return true;
});

// ── 링크를 특정 Chrome 프로필로 열기 (회사 계정 프로필 등) ──
let linkProfileDir = ''; // '' = 기본 브라우저 사용

function chromeUserDataDir() {
  const home = app.getPath('home');
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Google', 'Chrome', 'User Data');
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  return path.join(home, '.config', 'google-chrome');
}
function chromeExecutable() {
  const cands = [];
  if (process.platform === 'win32') {
    const pf = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const la = process.env.LOCALAPPDATA || '';
    cands.push(path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    cands.push(path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    if (la) cands.push(path.join(la, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  } else if (process.platform === 'darwin') {
    cands.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    cands.push(path.join(app.getPath('home'), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'));
  } else {
    cands.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/snap/bin/chromium', '/usr/bin/chromium-browser');
  }
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return null;
}
function listChromeProfiles() {
  try {
    const ls = path.join(chromeUserDataDir(), 'Local State');
    const data = JSON.parse(fs.readFileSync(ls, 'utf8'));
    const cache = (data.profile && data.profile.info_cache) || {};
    const arr = Object.keys(cache).map(dir => ({ dir, name: cache[dir].name || dir }));
    arr.sort((a, b) => a.dir === 'Default' ? -1 : b.dir === 'Default' ? 1 : a.dir.localeCompare(b.dir, undefined, { numeric: true }));
    return arr;
  } catch (e) { return []; }
}
function openUrl(url) {
  if (linkProfileDir) {
    const exe = chromeExecutable();
    if (exe) {
      try {
        execFile(exe, ['--profile-directory=' + linkProfileDir, url], (err) => { if (err) shell.openExternal(url); });
        return;
      } catch (e) { /* 폴백 */ }
    }
  }
  shell.openExternal(url);
}
ipcMain.handle('list-chrome-profiles', () => ({ ok: true, chrome: !!chromeExecutable(), profiles: listChromeProfiles() }));
ipcMain.handle('set-link-profile', (event, dir) => { linkProfileDir = dir || ''; return { ok: true, dir: linkProfileDir }; });

// ── 구글 시트 읽기/쓰기 (Apps Script 웹앱 경유) ──
// 읽기: action=read → 7명 전체 {video, mgmt} 반환
// 타임아웃이 있는 fetch (응답이 늦으면 매달리지 않고 에러로 떨어짐)
async function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 15000);
  try {
    return await fetch(url, { ...(options || {}), signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ★본문까지 같은 타임아웃 안에서 읽는다.
//   fetchWithTimeout 은 헤더가 도착하면 finally 에서 타이머를 꺼버려서, 그 뒤의 res.json() 은
//   **타임아웃이 전혀 없다.** GAS 가 헤더만 먼저 주고 본문이 늘어지면 무한정 매달린다
//   (동기화가 "동기화 중"에서 안 끝나는 경로).
async function fetchJsonWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 15000);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...(options || {}), signal: ctrl.signal });
    const text = await res.text();          // ← 본문도 signal 아래
    const ms2 = Date.now() - t0;
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status + (text ? ' · ' + text.slice(0, 150) : ''), _ms: ms2 };
    try { return { ...JSON.parse(text), _ms: ms2 }; }
    catch (e) { return { ok: false, error: '응답 파싱 실패: ' + text.slice(0, 150), _ms: ms2 }; }
  } finally {
    clearTimeout(timer);
  }
}

ipcMain.handle('sync-sheet', async (event, opts) => {
  const t0 = Date.now();
  try {
    // _ms 로 왕복 시간을 함께 돌려준다 — 느림의 원인이 GAS 인지 앱인지 가르는 유일한 근거다.
    return await fetchJsonWithTimeout(WEBAPP_URL + '?action=read', { method: 'GET', redirect: 'follow' }, 30000);
  } catch (e) {
    const timeout = (e && e.name === 'AbortError');
    const msg = timeout ? '응답 지연(타임아웃)' : String(e && e.message || e);
    return { ok: false, error: msg, timeout, _ms: Date.now() - t0 };
  }
});

// 팀원 명단만 조회 (action=members — 업무현황 시트를 안 읽어 매우 가볍다)
//
// ⚠ 이게 없으면 **새로 설치한 사람은 자기 이름을 고를 수 없다.**
//   명단 갱신이 doSync 안(renderer 의 applyMemberNames)에만 있는데, doSync 는 이름이 없으면
//   네트워크를 타기 전에 반환한다 → "명단을 받으려면 이름이 필요하고, 이름을 고르려면 명단이 필요"한 순환.
//   그래서 소스에 박힌 폴백 7명만 보이고, 🤖자동화 시트 A열을 고쳐도 반영되지 않았다.
//   인트라넷 딸깍(popup.js refreshMembers)은 이미 이 액션을 쓰고 있다 — 앱만 안 쓰고 있었다.
ipcMain.handle('fetch-members', async () => {
  try {
    const res = await fetchWithTimeout(WEBAPP_URL + '?action=members', { method: 'GET', redirect: 'follow' }, 15000);
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const json = await res.json();
    return json; // { ok:true, members:[...] }
  } catch (e) {
    const msg = (e && e.name === 'AbortError') ? '응답 지연(타임아웃)' : String(e && e.message || e);
    return { ok: false, error: msg };
  }
});

// 쓰기 패스스루 (완료토글·메모수정·작업추가)
// payload: { action, ...params } → application/x-www-form-urlencoded 로 POST
//
// ⚠ 타임아웃이 없으면 한 건이 매달릴 때 undici 기본값(약 5분)까지 UI가 잡혀 있고,
//   완료항목 일괄정리처럼 N건을 직렬로 돌리는 경로는 그게 그대로 누적된다. → 20초 상한.
// ⚠ 타임아웃은 { timeout:true } 로 구분해서 돌려준다. 렌더러가 이걸 롤백으로 처리하면 안 된다 —
//   Apps Script 는 응답만 늦고 쓰기는 이미 커밋된 경우가 흔해서, 되돌리면
//   "삭제가 취소된 것처럼" 보였다가 다음 동기화에 다시 사라진다.
// 한 번 보내기. busy 재시도는 바깥에서 판단한다.
async function postSheetOnce(payload) {
  const body = Object.keys(payload || {})
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(payload[k] == null ? '' : payload[k]))
    .join('&');
  const res = await fetchWithTimeout(WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'follow',
  }, 20000);
  const text = await res.text();
  if (isDev) console.log('[post-sheet] status:', res.status, 'resp:', text.slice(0, 300));
  if (!res.ok) {
    return { ok: false, error: 'HTTP ' + res.status + (text ? ' · ' + text.slice(0, 150) : '') };
  }
  try { return JSON.parse(text); }
  catch (e) { return { ok: false, error: '응답 파싱 실패: ' + text.slice(0, 150) }; }
}

ipcMain.handle('post-sheet', async (event, payload) => {
  try {
    if (isDev) console.log('[post-sheet] action:', (payload && payload.action) || '(insert)');
    let r = await postSheetOnce(payload);
    // ★서버(v56+)가 쓰기 락을 못 잡으면 { ok:false, busy:true } 를 돌려준다.
    //   busy 는 "락을 못 잡았다" = **쓰기가 확실히 일어나지 않았다** 는 뜻이라
    //   재시도해도 중복 적용될 수 없다. 여기서 한 번만 조용히 다시 보낸다 —
    //   안 그러면 렌더러의 낙관적 UI 가 롤백되고 사용자는 '실패'로 읽는다.
    //   (busy 를 일반 ok:false 로 주면 이 구분이 불가능하다. 서버와 합의된 계약이다.)
    if (r && r.busy) {
      await new Promise(res => setTimeout(res, 1500));
      if (isDev) console.log('[post-sheet] busy → 1회 재시도');
      r = await postSheetOnce(payload);
    }
    return r;
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, timeout: true, error: '응답 지연(타임아웃)' };
    return { ok: false, error: String(e && e.message || e) };
  }
});

// 인트라넷 요청글 파싱 (5단계)
ipcMain.handle('fetch-intranet', async (event, url) => {
  // TODO: 5단계에서 구현 — 내장 브라우저로 파싱
  return { ok: false, reason: 'not-implemented' };
});

// ─────────────────────────────────────────────
//  Gmail 연동 — OAuth 토큰 관리 + 메일 조회
// ─────────────────────────────────────────────
function tokenPath() { return path.join(app.getPath('userData'), 'gmail-tokens.json'); }

function readTokens() {
  try { return JSON.parse(fs.readFileSync(tokenPath(), 'utf8')); }
  catch (e) { return null; }
}
function writeTokens(obj) {
  try { fs.writeFileSync(tokenPath(), JSON.stringify(obj), 'utf8'); } catch (e) {}
}
function clearTokens() {
  try { fs.unlinkSync(tokenPath()); } catch (e) {}
}

// 인증 코드 → 토큰 교환
async function exchangeCode(code, redirectUri) {
  const body = new URLSearchParams({
    code,
    client_id: GMAIL_CLIENT_ID,
    client_secret: GMAIL_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }).toString();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || ('HTTP ' + res.status));
  return data; // { access_token, refresh_token, expires_in, ... }
}

// refresh_token으로 access_token 갱신
async function refreshAccess(refreshToken) {
  const body = new URLSearchParams({
    client_id: GMAIL_CLIENT_ID,
    client_secret: GMAIL_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || ('HTTP ' + res.status));
  return data; // { access_token, expires_in, ... } (refresh_token은 보통 미포함)
}

// 유효한 access_token 확보 (만료 시 자동 갱신)
//
// ⚠ 여기서 '영구 실패'와 '일시 실패'를 갈라야 한다. 안 그러면 앱이 10초마다(메일 폴링 주기)
//   똑같은 실패를 무한 반복하면서 UI 는 계속 '연결됨'으로 표시한다.
//   실제로 겪은 두 경우:
//   ① build-secrets.js 가 없어 client_id 가 빈 값 → "Could not determine client ID from request."
//   ② 사용자가 구글에서 앱 권한을 해제 → invalid_grant
//   둘 다 재시도로는 절대 풀리지 않는다. 토큰을 정리해 '연결 안 됨'으로 떨어뜨려야
//   사용자가 다시 연결할 수 있고 로그 폭주도 멈춘다.
async function getValidAccessToken() {
  // 빌드 비밀값이 없으면 아예 시도하지 않는다 (개발 체크아웃·CI 시크릿 누락)
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) throw new Error('not-connected');
  const t = readTokens();
  if (!t || !t.refresh_token) throw new Error('not-connected');
  if (t.access_token && t.expiry_date && Date.now() < t.expiry_date) return t.access_token;
  // 갱신
  let r;
  try {
    r = await refreshAccess(t.refresh_token);
  } catch (e) {
    const msg = String((e && e.message) || e);
    // ★invalid_grant 만 토큰을 지운다 = "사용자가 권한을 해제했거나 토큰이 폐기됨"(재시도로 안 풀림).
    //   invalid_client 류(잘못된 client_id)는 **빌드 쪽 문제**다 — 그걸로 토큰을 지우면
    //   시크릿이 잘못 들어간 배포 한 번에 팀 전원이 재로그인해야 한다. 지우지 않는다.
    if (/invalid_grant/i.test(msg)) {
      clearTokens();
      throw new Error('not-connected');
    }
    throw e;                               // 네트워크·빌드 문제 등은 그대로 올린다(토큰 보존)
  }
  t.access_token = r.access_token;
  t.expiry_date = Date.now() + (r.expires_in || 3600) * 1000 - 60000; // 1분 버퍼
  writeTokens(t);
  return t.access_token;
}

// 내 메일 주소 조회
async function gmailProfile(accessToken) {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || ('HTTP ' + res.status));
  return data.emailAddress;
}

// OAuth 로그인 — 시스템 브라우저 + 로컬 콜백 서버
function startGmailLogin() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        const code = u.searchParams.get('code');
        const err = u.searchParams.get('error');
        if (err) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"></head><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>로그인 취소됨</h2><p>앱으로 돌아가세요.</p></body></html>');
          cleanup(); reject(new Error(err)); return;
        }
        if (!code) { res.statusCode = 400; res.end('no code'); return; }

        const port = server.address().port;
        const redirectUri = 'http://127.0.0.1:' + port;
        const tok = await exchangeCode(code, redirectUri);
        const email = await gmailProfile(tok.access_token);
        writeTokens({
          access_token: tok.access_token,
          refresh_token: tok.refresh_token,
          expiry_date: Date.now() + (tok.expires_in || 3600) * 1000 - 60000,
          email,
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"></head><body style="font-family:sans-serif;padding:40px;text-align:center;background:#fff"><h2>연결 완료</h2><p>이 창을 닫고 작업 타이머로 돌아가세요.</p></body></html>');
        cleanup(); resolve({ email });
      } catch (e) {
        try { res.statusCode = 500; res.end('error: ' + (e.message || e)); } catch (_) {}
        cleanup(); reject(e);
      }
    });

    let done = false;
    function cleanup() { if (done) return; done = true; try { server.close(); } catch (_) {} clearTimeout(timer); }
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 180000); // 3분

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const redirectUri = 'http://127.0.0.1:' + port;
      const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: GMAIL_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GMAIL_SCOPE,
        access_type: 'offline',
        prompt: 'consent',
      }).toString();
      openUrl(authUrl);
    });
    server.on('error', (e) => { cleanup(); reject(e); });
  });
}

// ── IPC: Gmail ──
// ── 공휴일: 한국천문연구원 특일정보 API (공공데이터포털) ──
// 키 발급: data.go.kr → "특일 정보" 활용신청 → 일반 인증키(Decoding)를 아래에 붙여넣기.
// 키가 비어있으면 조용히 건너뛰고, 렌더러의 내장 공휴일 데이터(2026·2027)로 폴백.
const HOLIDAY_SERVICE_KEY = SECRETS.HOLIDAY_SERVICE_KEY || "";

function parseHolidayItems(json) {
  // 응답 quirk: 항목이 1개면 배열이 아니라 객체로 옴 → 배열로 정규화
  const body = json && json.response && json.response.body;
  let items = body && body.items && body.items.item;
  if (!items) return {};
  if (!Array.isArray(items)) items = [items];
  const map = {};
  items.forEach((it) => {
    if (!it || !it.locdate) return;
    if (String(it.isHoliday || 'Y').toUpperCase() === 'N') return; // 휴일 아님 표시는 제외
    const s = String(it.locdate);                    // 예: 20260301
    const mo = parseInt(s.slice(4, 6), 10), d = parseInt(s.slice(6, 8), 10);
    if (mo && d) map[`${mo}-${d}`] = String(it.dateName || '공휴일');
  });
  return map;
}

ipcMain.handle('fetch-holidays', async (event, year) => {
  try {
    if (!HOLIDAY_SERVICE_KEY) return { ok: false, error: 'no-key' };
    const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo`
      + `?serviceKey=${encodeURIComponent(HOLIDAY_SERVICE_KEY)}`
      + `&solYear=${year}&numOfRows=100&_type=json`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: 'http-' + res.status };
    const json = await res.json();
    return { ok: true, year, map: parseHolidayItems(json) };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

// ── 앱 버전 + 업데이트 확인 IPC (헬퍼는 파일 상단에 정의됨) ──
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('check-update', async () => {
  try { return await fetchLatestRelease(); }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// ── 자동 업데이트 IPC ────────────────────────────────────────────────
// 렌더러는 "지금 이 플랫폼에서 무엇이 가능한지"만 물어보고, URL·해시는 받지 않는다.
ipcMain.handle('updater-mode', () => {
  if (updaterSupported()) return { mode: 'win', canApply: true };
  if (process.platform === 'darwin' && app.isPackaged) {
    return { mode: 'mac', canApply: MAC_AUTO_APPLY };   // 교체는 아직 잠겨 있다
  }
  return { mode: 'none', canApply: false };   // 개발 모드 등 → 배너만
});

ipcMain.handle('updater-check', async () => {
  try {
    if (updaterSupported()) {
      const u = getEU();
      if (!u) return { ok: false, error: 'updater-unavailable' };
      const r = await u.checkForUpdates();
      const v = r && r.updateInfo && r.updateInfo.version;
      const has = !!(v && cmpVer(v, app.getVersion()) > 0);
      // ★응답 모양은 기존 check-update(fetchLatestRelease) 와 같아야 한다.
      //   렌더러의 applyUpdateUI 가 latest/url 을 읽기 때문이다.
      return { ok: true, hasUpdate: has, version: v, latest: v,
               current: app.getVersion(), url: `https://minsk999.github.io/${GITHUB_REPO}/` };
    }
    // 맥은 릴리스 API 를 직접 본다 (latest-mac.yml 은 Squirrel 용이라 쓰지 않는다)
    const r = await fetchLatestRelease();
    return r;
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

ipcMain.handle('updater-download', async () => {
  try {
    if (updaterSupported()) {
      const u = getEU(); if (!u) return { ok: false, error: 'updater-unavailable' };
      // ★checkForUpdates() 를 먼저 부르지 않으면 downloadUpdate() 가 한 바이트도 받지 않고
      //   "Please check update first" 로 즉시 거부한다(AppUpdater.js 의 updateInfoAndProvider 가드).
      //   배너는 옛 경로(fetchLatestRelease)로 떠 있어서, 이걸 빠뜨리면 [받기] 가 항상 실패한다.
      if (!u.updateInfoAndProvider) {
        const c = await u.checkForUpdates();
        if (!c || !c.updateInfo) return { ok: false, error: '업데이트 정보를 찾지 못했어요' };
      }
      // await 해야 실패를 성공으로 보고하지 않는다. 진행률은 그대로 이벤트로 흘러간다.
      await u.downloadUpdate();
      return { ok: true };
    }
    if (process.platform !== 'darwin') return { ok: false, error: 'unsupported' };
    if (macUpdBusy) return { ok: false, error: 'busy' };
    macUpdBusy = true;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
        { signal: ctrl.signal, headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'teamtimer' } });
      clearTimeout(t);
      if (!res.ok) throw new Error('릴리스 조회 실패 (HTTP ' + res.status + ')');
      const rel = await res.json();
      const version = String(rel.tag_name || '').replace(/^v/, '');
      if (!version) throw new Error('릴리스 정보를 읽지 못했어요');
      if (cmpVer(version, app.getVersion()) <= 0) { setMacUpd({ state: 'idle', msg: '' }); return { ok: true, upToDate: true }; }
      const asset = pickMacAsset(rel);
      if (!asset) throw new Error(`이 릴리스에 ${process.arch} 용 파일이 없어요`);
      const staged = await macDownloadAndStage(asset, version);
      if (MAC_AUTO_APPLY) {
        // 여기에 P4~P9(교체·셀프테스트·롤백)가 들어간다. TCC 실측 전까지 도달하지 않는다.
        setMacUpd({ state: 'armed', pct: 100, msg: '적용 준비가 끝났어요', staged });
      } else {
        setMacUpd({ state: 'ready', pct: 100, msg: '새 버전을 받았어요 — 응용 프로그램 폴더로 옮겨 주세요', staged });
      }
      return { ok: true, staged, version };
    } finally { macUpdBusy = false; }
  } catch (e) {
    const m = String((e && e.message) || e);
    setMacUpd({ state: 'error', err: m.slice(0, 300), msg: '' });
    return { ok: false, error: m };
  }
});

// 받아둔 것을 Finder 로 열어 준다 (맥, 수동 교체 단계)
ipcMain.handle('updater-reveal', () => {
  if (!macUpd.staged) return { ok: false, error: 'not-staged' };
  try { shell.showItemInFolder(macUpd.staged); return { ok: true }; }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

// 재시작해서 적용 (Windows)
ipcMain.handle('updater-install', () => {
  if (!updaterSupported()) return { ok: false, error: 'unsupported' };
  const u = getEU(); if (!u) return { ok: false, error: 'updater-unavailable' };
  // 다 받기 전에 부르면 electron-updater 가 조용히 아무것도 안 하고 돌아온다.
  if (!euDownloaded) return { ok: false, error: 'not-downloaded' };
  setImmediate(() => {
    // ★isQuitting 을 미리 세우면 안 된다. 설치가 실패했을 때 true 로 굳어서
    //   그 뒤로는 창을 닫을 때마다 앱이 통째로 죽는다(트레이 상주가 깨진다).
    isQuitting = true;
    try {
      // isSilent=true — oneClick:false 라 false 로 두면 NSIS 마법사(설치 위치 선택까지)가
      // 뜬 뒤 앱이 먼저 죽는다. /S 로 기존 경로에 덮어쓰고 --force-run 으로 다시 켠다.
      u.quitAndInstall(true, true);
    } catch (e) { isQuitting = false; sendUpd({ type: 'error', error: String((e && e.message) || e) }); return; }
    // quitAndInstall 이 설치기를 못 띄우면 app.quit() 까지 못 간다 → 잠금을 되돌린다.
    setTimeout(() => { isQuitting = false; }, 4000);
  });
  return { ok: true };
});

ipcMain.handle('gmail-status', () => {
  // 비밀값이 없으면 토큰이 남아 있어도 '연결됨'이라고 하면 안 된다 —
  // UI 는 연결됐다고 하는데 모든 요청이 실패하는 상태가 된다(개발 체크아웃에서 실제로 겪음).
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) return { connected: false, email: null, noSecrets: true };
  const t = readTokens();
  return { connected: !!(t && t.refresh_token), email: t ? t.email : null };
});

ipcMain.handle('gmail-login', async () => {
  // ★비밀값이 없으면 브라우저를 열지 않는다. 열면 client_id 가 빈 채로 나가서
  //   구글이 "Missing required parameter: client_id" 오류 페이지를 띄운다 —
  //   사용자는 자기 계정 문제로 오해한다. (개발 체크아웃·CI 시크릿 누락에서 실제로 겪음)
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) return { ok: false, error: 'no-secrets' };
  try {
    const r = await startGmailLogin();
    console.log('[gmail] 연결됨:', r.email);
    return { ok: true, email: r.email };
  } catch (e) {
    console.log('[gmail] 로그인 실패:', e.message || e);
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('gmail-logout', () => { clearTokens(); return { ok: true }; });

// ── 윈도우/맥 시작 시 자동 실행 ──
ipcMain.handle('get-autostart', () => {
  try { return { ok: true, enabled: app.getLoginItemSettings().openAtLogin }; }
  catch (e) { return { ok: false, enabled: false }; }
});
ipcMain.handle('set-autostart', (event, enabled) => {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled, args: ['--autostart'] }); // 자동실행 식별용 인자
    return { ok: true, enabled: !!enabled };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});
// 부팅 자동 실행 시 트레이로 최소화 시작할지 (main이 startup.json으로 읽음)
ipcMain.handle('get-autostart-minimized', () => {
  return { ok: true, minimized: !!readStartupCfg().minimized };
});
ipcMain.handle('set-autostart-minimized', (event, minimized) => {
  var cfg = readStartupCfg(); cfg.minimized = !!minimized; writeStartupCfg(cfg);
  return { ok: true, minimized: !!minimized };
});

// 닫기 버튼 동작 (true=완전 종료, false=트레이로 최소화)
// ── 메일 안읽음 상태 반영: 트레이 아이콘 + 작업표시줄 오버레이 + 새 메일 알림 ──
let lastUnread = -1;
let trayIconNormal = null, trayIconDot = null, overlayDot = null;
function loadBadgeIcons(){
  const p = (f) => path.join(__dirname, 'build', f);
  const winIco = (a,b) => process.platform === 'win32' ? a : b;
  if (!trayIconNormal) trayIconNormal = nativeImage.createFromPath(p(winIco('tray.ico','tray.png')));
  if (!trayIconDot) {
    if (process.platform === 'darwin') {
      trayIconDot = nativeImage.createFromPath(p('trayDotTemplate.png'));
      const hiD = nativeImage.createFromPath(p('trayDotTemplate@2x.png'));
      if (!trayIconDot.isEmpty() && !hiD.isEmpty()) trayIconDot.addRepresentation({ scaleFactor: 2, buffer: hiD.toPNG() });
      if (!trayIconDot.isEmpty()) trayIconDot.setTemplateImage(true);
      if (trayIconDot.isEmpty()) trayIconDot = nativeImage.createFromPath(p('tray-dot.png'));
    } else {
      trayIconDot = nativeImage.createFromPath(p(winIco('tray-dot.ico','tray-dot.png')));
    }
  }
  if (!overlayDot) overlayDot = nativeImage.createFromPath(p('overlay-dot.png'));
}
ipcMain.handle('update-mail-unread', (event, count, opts) => {
  try {
    count = Number(count) || 0;
    loadBadgeIcons();
    // 트레이 아이콘: 안읽음 있으면 점 버전
    if (tray) {
      const ic = (count > 0 && trayIconDot && !trayIconDot.isEmpty()) ? trayIconDot : trayIconNormal;
      if (ic && !ic.isEmpty()) tray.setImage(ic);
      tray.setToolTip(count > 0 ? `작업 타이머 · 안읽은 메일 ${count}` : '작업 타이머');
    }
    // 작업표시줄 오버레이(윈도우) / Dock 배지(맥): 안읽음 표시
    if (mainWindow && process.platform === 'win32') {
      if (count > 0 && overlayDot && !overlayDot.isEmpty()) mainWindow.setOverlayIcon(overlayDot, `안읽은 메일 ${count}`);
      else mainWindow.setOverlayIcon(null, '');
    }
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setBadge(count > 0 ? String(count) : ''); // 맥 Dock 아이콘에 빨간 숫자 배지
    }
    // 알림(제목 포함)은 렌더러에서 띄우므로 여기선 트레이/작업표시줄 표시만 담당
    lastUnread = count;
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

// ── Gmail: 동시 요청 제한(배치) + 429/5xx 재시도 헬퍼 ──
async function mapLimit(arr, limit, fn) {
  const ret = new Array(arr.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (i < arr.length) { const idx = i++; ret[idx] = await fn(arr[idx], idx); }
  });
  await Promise.all(workers);
  return ret;
}
async function gmailGet(url, accessToken, tries) {
  tries = tries || 3;
  for (let t = 0; t < tries; t++) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
    if (r.ok) return r.json();
    if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 400 * (t + 1))); continue; }
    return null; // 그 외 오류는 재시도 안 함
  }
  return null;
}

// ── Gmail: "[Intranet-영상]" 메일 목록 (안정적 + 캐시) ──
//   검색은 'subject:Intranet'으로 넓게 → 실제 제목에 [Intranet-영상] 포함된 것만 정확히 필터.
//   제목/보낸이 등은 불변이라 ID별로 캐시 → 새 메일만 상세 조회 (이전: 매번 최대 100건 재조회 = 수 초 병목).
//   읽음/안읽음은 가벼운 목록 호출 1회(is:unread)로 매번 최신 반영.
const gmailMetaCache = new Map(); // id → 항목 객체 또는 'SKIP'(영상 메일 아님)
function metaCachePut(id, v) {
  gmailMetaCache.set(id, v);
  if (gmailMetaCache.size > 400) { // 오래된 것부터 정리
    const it = gmailMetaCache.keys();
    for (let i = gmailMetaCache.size; i > 300; i--) gmailMetaCache.delete(it.next().value);
  }
}

async function gmailListMessages(accessToken, max) {
  const baseQ = 'subject:Intranet -in:trash';
  const listData = await gmailGet(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(baseQ)}&maxResults=${max || 100}`,
    accessToken
  );
  if (!listData) throw new Error('목록 조회 실패');
  const ids = (listData.messages || []).map(m => m.id);

  // 안읽음 ID 집합 (메일별 재조회 없이 읽음 상태 갱신)
  //
  // ⚠ 실패를 `|| []` 로 삼키면 안 된다. 그 순간 '안읽음이 하나도 없다'로 해석돼
  //   전 메일이 읽음 처리되고 → 배지 0 → notifiedIds 가 통째로 비워지고 →
  //   다음 폴링에 전부 '새 메일'로 되살아나 알림이 헛울린다.
  //   조회 자체가 실패한 것과 '안읽음이 없는 것'은 다르다. 실패는 실패로 올린다.
  const unreadData = await gmailGet(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(baseQ + ' is:unread')}&maxResults=${max || 100}`,
    accessToken
  );
  if (!unreadData) throw new Error('안읽음 조회 실패');
  const unreadSet = new Set((unreadData.messages || []).map(m => m.id));

  // 캐시에 없는 새 메일만 상세 조회
  const newIds = ids.filter(id => !gmailMetaCache.has(id));
  await mapLimit(newIds, 8, async (id) => {
    const d = await gmailGet(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      accessToken
    );
    if (!d) return; // 실패: 캐시 미기록 → 다음 새로고침 때 재시도
    const headers = {};
    (d.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });
    const subject = headers['subject'] || '';
    // 정확 필터: 제목에 [Intranet-영상] 포함된 것만
    if (subject.indexOf('[Intranet-영상]') === -1) { metaCachePut(id, 'SKIP'); return; }
    const snippet = d.snippet || '';
    const reqMatch = snippet.match(/(\S+?)님의\s*업무\s*요청/);
    const cleanSubject = subject.replace(/^\s*\[Intranet-영상\]\s*/i, '').trim();
    metaCachePut(id, {
      id,
      subject: cleanSubject || subject,
      fullSubject: subject,
      from: headers['from'] || '',
      date: headers['date'] || '',
      ts: d.internalDate ? Number(d.internalDate) : (headers['date'] ? Date.parse(headers['date']) : 0),
      requester: reqMatch ? reqMatch[1] : '',
      snippet,
      link: `https://mail.google.com/mail/u/0/#all/${id}`,
    });
  });

  const list = ids
    .map(id => gmailMetaCache.get(id))
    .filter(v => v && v !== 'SKIP')
    .map(m => ({ ...m, unread: unreadSet.has(m.id) }))
    .sort((a, b) => b.ts - a.ts);
  const unreadCount = list.filter(m => m.unread).length;
  return { messages: list, unreadCount };
}

ipcMain.handle('gmail-list', async (event, opts) => {
  try {
    const token = await getValidAccessToken();
    const r = await gmailListMessages(token, opts && opts.max);
    return { ok: true, messages: r.messages, unreadCount: r.unreadCount };
  } catch (e) {
    if (String(e.message).includes('not-connected')) return { ok: false, error: 'not-connected' };
    console.log('[gmail] 목록 실패:', e.message || e);
    return { ok: false, error: String(e.message || e) };
  }
});

// ── Gmail: 읽음 처리 (UNREAD 라벨 제거) ──
ipcMain.handle('gmail-mark-read', async (event, id) => {
  try {
    const token = await getValidAccessToken();
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      }
    );
    if (!r.ok) { const d = await r.json().catch(() => ({})); return { ok: false, error: d.error?.message || ('HTTP ' + r.status) }; }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

// ── Gmail: 메일 본문에서 인트라넷 요청글 링크 추출 ──
// 클릭 시에만 해당 메일 1건을 format=full로 받아 본문을 디코드하고
// https://intranet.adef.co.kr/... 링크를 찾아 반환. (목록 조회는 가볍게 유지)
function b64urlDecode(data) {
  try {
    return Buffer.from(String(data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch (e) { return ''; }
}
function collectBodyText(payload) {
  // payload(파트 트리)를 재귀로 돌며 text/plain·text/html 본문을 모아서 합침
  let out = '';
  if (!payload) return out;
  const walk = (part) => {
    if (!part) return;
    const mime = (part.mimeType || '').toLowerCase();
    if (part.body && part.body.data && (mime === 'text/plain' || mime === 'text/html' || mime === '')) {
      out += '\n' + b64urlDecode(part.body.data);
    }
    if (Array.isArray(part.parts)) part.parts.forEach(walk);
  };
  walk(payload);
  return out;
}
function extractIntranetUrl(text) {
  if (!text) return '';
  // HTML 엔티티(&amp;) 복원
  const t = text.replace(/&amp;/gi, '&');
  // 본문에 있는 모든 intranet.adef.co.kr URL 수집
  const re = /https?:\/\/intranet\.adef\.co\.kr\/[^\s)"'<>\\]+/ig;
  const all = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    // URL 끝에 붙은 문장부호 제거
    all.push(m[0].replace(/[.,;:)\]}>"']+$/, ''));
  }
  if (!all.length) return '';
  // 1) 요청글 보기 페이지(/video/view?idx=...)를 최우선 — 이게 실제 요청글 링크예요.
  //    (메일 본문 상단의 로고·임베드 이미지도 같은 intranet 도메인이라 그냥 첫 URL을 쓰면 안 됨)
  const view = all.find(u => /\/video\/view\b/i.test(u));
  if (view) return view;
  // 2) /video/view가 없을 때만, 이미지·정적 자원 URL을 제외하고 첫 링크를 사용
  const isAsset = (u) =>
    /\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?|css|js)(\?|#|$)/i.test(u) ||
    /\/(img|images?|uploads?|data|assets?|editor|se2|thumbs?|icons?|logo|files?|download|attach|resources?)\//i.test(u);
  const nonAsset = all.filter(u => !isAsset(u));
  return nonAsset.length ? nonAsset[0] : '';
}
ipcMain.handle('gmail-intranet-link', async (event, id) => {
  try {
    const token = await getValidAccessToken();
    const d = await gmailGet(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      token
    );
    if (!d) return { ok: false, error: '본문 조회 실패' };
    let url = extractIntranetUrl(collectBodyText(d.payload));
    if (!url) url = extractIntranetUrl(d.snippet || ''); // 폴백: 스니펫에서라도
    if (!url) return { ok: false, error: 'no-link' };
    return { ok: true, url };
  } catch (e) {
    if (String(e.message).includes('not-connected')) return { ok: false, error: 'not-connected' };
    return { ok: false, error: String(e.message || e) };
  }
});

// 메일을 Gmail 휴지통으로 이동 (앱에서 삭제 → Gmail에서도 휴지통)
ipcMain.handle('gmail-trash', async (event, id) => {
  try {
    const token = await getValidAccessToken();
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/trash`,
      { method: 'POST', headers: { Authorization: 'Bearer ' + token } }
    );
    if (!r.ok) { const d = await r.json().catch(() => ({})); return { ok: false, error: d.error?.message || ('HTTP ' + r.status) }; }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

} // ── 중복 실행 방지 블록 끝 (requestSingleInstanceLock) ──
