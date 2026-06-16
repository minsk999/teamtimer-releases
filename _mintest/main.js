const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 520, height: 380 });
  win.loadURL('data:text/html,<body style="font-family:-apple-system,sans-serif;text-align:center"><h1 style="margin-top:120px">✅ 최소 테스트 성공</h1><p>Electron이 정상 실행됩니다.<br>이 창이 보이면 빌드 파이프라인은 정상이에요.</p></body>');
});
app.on('window-all-closed', () => app.quit());
