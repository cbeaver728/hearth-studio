@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Hearth Studio needs Node.js 22 or newer from https://nodejs.org.
  pause
  exit /b 1
)
node launch.cjs
if errorlevel 1 pause
