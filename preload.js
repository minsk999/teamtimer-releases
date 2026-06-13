// ─────────────────────────────────────────────
//  preload — 렌더러와 메인 프로세스의 안전한 다리
//  window.timerAPI.* 로 앱 UI에서 호출
// ─────────────────────────────────────────────
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timerAPI', {
  // OS 알림
  notify: (title, body, mailId) => ipcRenderer.invoke('notify', { title, body, mailId }),
  onNotificationMailClick: (cb) => ipcRenderer.on('notification-mail-click', (e, id) => cb(id)),

  // 창 컨트롤 (윈도우 커스텀 타이틀바)
  winMinimize: () => ipcRenderer.send('win:minimize'),
  winMaximize: () => ipcRenderer.send('win:maximize'),
  winClose: () => ipcRenderer.send('win:close'),
  // 최대화 상태 변화 수신 (아이콘 전환)
  onMaximizedChanged: (cb) => ipcRenderer.on('win:maximized-changed', (e, isMax) => cb(isMax)),

  // 외부 링크
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  listChromeProfiles: () => ipcRenderer.invoke('list-chrome-profiles'),
  setLinkProfile: (dir) => ipcRenderer.invoke('set-link-profile', dir),

  // 구글 시트 동기화 (읽기)
  syncSheet: (config) => ipcRenderer.invoke('sync-sheet', config),

  // 구글 시트 쓰기 (완료토글·메모수정·작업추가)
  postSheet: (payload) => ipcRenderer.invoke('post-sheet', payload),

  // 인트라넷 파싱 (5단계)
  fetchIntranet: (url) => ipcRenderer.invoke('fetch-intranet', url),

  // Gmail 연동
  gmailStatus: () => ipcRenderer.invoke('gmail-status'),
  fetchHolidays: (year) => ipcRenderer.invoke('fetch-holidays', year),
  appVersion: () => ipcRenderer.invoke('app-version'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  gmailLogin: () => ipcRenderer.invoke('gmail-login'),
  gmailLogout: () => ipcRenderer.invoke('gmail-logout'),
  gmailList: (opts) => ipcRenderer.invoke('gmail-list', opts),
  gmailMarkRead: (id) => ipcRenderer.invoke('gmail-mark-read', id),
  gmailIntranetLink: (id) => ipcRenderer.invoke('gmail-intranet-link', id),
  gmailTrash: (id) => ipcRenderer.invoke('gmail-trash', id),

  // 시작 시 자동 실행
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),
  getAutostartMinimized: () => ipcRenderer.invoke('get-autostart-minimized'),
  setAutostartMinimized: (minimized) => ipcRenderer.invoke('set-autostart-minimized', minimized),
  updateMailUnread: (count, opts) => ipcRenderer.invoke('update-mail-unread', count, opts),

  // 플랫폼 정보 (UI 분기용)
  platform: process.platform,
});
