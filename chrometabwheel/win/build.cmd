@echo off
rem ChromeTabWheel build - uses only the .NET Framework compiler that ships with Windows.
rem Output: bin\ChromeTabWheel.exe (single file). Keep this file ASCII + CRLF (cmd.exe misreads UTF-8/LF).
setlocal
cd /d "%~dp0"
set FW=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319
if not exist bin mkdir bin
"%FW%\csc.exe" /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 /out:bin\ChromeTabWheel.exe /win32manifest:src\app.manifest /win32icon:assets\app.ico /resource:assets\app.ico,app.ico /resource:assets\app-off.ico,app-off.ico /r:"%FW%\WPF\UIAutomationClient.dll" /r:"%FW%\WPF\UIAutomationTypes.dll" /r:"%FW%\WPF\WindowsBase.dll" /r:System.Windows.Forms.dll /r:System.Drawing.dll src\Program.cs
if errorlevel 1 (echo BUILD FAILED & exit /b 1)
echo OK: %~dp0bin\ChromeTabWheel.exe
