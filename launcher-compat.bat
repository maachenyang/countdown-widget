@echo off
rem ============================================================
rem  Countdown - compatibility launcher
rem
rem  Use this if double-clicking the exe shows:
rem    "Error writing temporary file. Make sure your temp folder is valid."
rem    or nothing happens at all.
rem
rem  It does two things:
rem   1) Points TEMP / TMP next to the exe, so the portable build's
rem      self-extraction never touches a locked-down system temp dir.
rem   2) Passes --no-sandbox, because Chromium's process sandbox cannot
rem      start inside some restricted environments (containers, remote
rem      sessions, security policies), which makes the app exit silently.
rem
rem  Place this file next to the exe and double-click it.
rem  Intentionally ASCII-only so it works under any console code page.
rem ============================================================
cd /d "%~dp0"

set "TEMP=%~dp0.temp"
set "TMP=%~dp0.temp"
if not exist "%TEMP%" mkdir "%TEMP%" 2>nul

set "ELECTRON_RUN_AS_NODE="

set "EXE="
for %%f in ("%~dp0*.exe") do if not defined EXE set "EXE=%%~ff"

if not defined EXE (
  echo [ERROR] No .exe found next to this script.
  echo         Put this .bat in the same folder as Countdown.exe
  pause
  exit /b 1
)

start "" "%EXE%" --no-sandbox
exit /b 0
