@echo off
REM Cramtoolfinal launcher for Windows: creates the virtualenv on first run, then starts the app.
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Creating virtual environment...
  python -m venv .venv || goto :error
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt || goto :error
)
set PORT=8000
if not "%1"=="" set PORT=%1
echo.
echo   Cramtoolfinal is starting at http://localhost:%PORT%
echo   Press Ctrl+C to stop.
echo.
start "" "http://localhost:%PORT%"
".venv\Scripts\python.exe" -m uvicorn app.main:app --port %PORT%
goto :eof

:error
echo Setup failed. Make sure Python 3.11+ is installed and on PATH.
pause
