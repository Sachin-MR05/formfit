@echo off
title FormFit Backend Server
echo ==============================================
echo   Starting FormFit Backend on port 8000...
echo   Database: Neon PostgreSQL
echo ==============================================
cd /d "%~dp0backend"
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
) else (
    python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
)
pause

