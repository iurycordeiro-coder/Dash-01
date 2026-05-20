@echo off
cd /d "%~dp0"
echo Starting development servers...
echo.
start "Vite Dev Server" cmd /k npm run dev:vite
timeout /t 2
start "Node Backend Server" cmd /k npm run dev:server
