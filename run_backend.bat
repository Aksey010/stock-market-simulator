@echo off
setlocal
cd /d "%~dp0backend"
if not exist venv (
  py -m venv venv
  venv\Scripts\python -m pip install --upgrade pip
  venv\Scripts\python -m pip install -r requirements.txt
)
set PYTHONPATH=.
venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload