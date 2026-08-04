@echo off
setlocal
cd /d "%~dp0"
start "MarketSim Backend" cmd /c run_backend.bat
start "" http://localhost:5173
start "MarketSim Frontend" cmd /c run_frontend.bat
echo.
echo MarketSim starting...
echo Backend:  http://localhost:8000  (API docs at /docs)
echo Frontend: http://localhost:5173