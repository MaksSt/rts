@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.12 or newer, then run this file again.
  pause
  exit /b 1
)
if not exist node_modules\ws\package.json (
  call npm ci --omit=dev
  if errorlevel 1 exit /b 1
)
echo Open http://localhost:5173 - friends use this PC's LAN address.
node server/index.mjs --production
pause
