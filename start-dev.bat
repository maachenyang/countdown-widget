@echo off
rem ============================================================
rem  Countdown - run from source
rem  Requires: npm install has been run in this folder.
rem ============================================================
cd /d "%~dp0"

rem Some dev environments inject this, which makes Electron behave
rem like plain Node and crash on startup.
set "ELECTRON_RUN_AS_NODE="

set "EXE=%~dp0node_modules\electron\dist\electron.exe"
if not exist "%EXE%" (
  echo [ERROR] Electron runtime not found.
  echo         Run "npm install" here, then "node tools\fetch-electron.js" if needed.
  pause
  exit /b 1
)

start "" "%EXE%" "%~dp0."
exit /b 0
