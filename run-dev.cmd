@echo off
chcp 65001 > nul
title 작업 타이머 - 개발 실행
cd /d "%~dp0"
echo.
echo   작업 타이머 (개발 모드)
echo   - 이 창을 닫으면 앱도 함께 종료됩니다.
echo   - 설치본이 트레이에 떠 있으면 개발본이 실행되지 않습니다.
echo     (트레이 아이콘 우클릭 - 종료 후 다시 실행하세요)
echo.
if not exist "node_modules\electron\dist\electron.exe" (
  echo   [!] Electron 바이너리가 없습니다. 복구를 시도합니다...
  call npm install
  node node_modules\electron\install.js
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo   [X] Electron 설치에 실패했습니다. 클로드에게 알려주세요.
  pause
  exit /b 1
)
call npx electron .
if errorlevel 1 pause
