@echo off
title FormFit Frontend
echo ==============================================
echo   Starting FormFit Frontend on port 5173...
echo ==============================================
cd /d "%~dp0frontend"
npm run dev
pause

