@echo off
echo ======================================================================
echo   Launching UrbanCoolSim Development Stack (Backend + Frontend)
echo ======================================================================

set PYTHONPATH=backend

echo [*] Starting FastAPI Backend on http://localhost:8000 ...
start "UrbanCoolSim Backend" cmd /k "python -m uvicorn app.main:app --reload --port 8000"

echo [*] Starting Next.js Frontend on http://localhost:3000 ...
cd frontend
start "UrbanCoolSim Frontend" cmd /k "npm run dev"

echo ======================================================================
echo   UrbanCoolSim is running!
echo   Frontend: http://localhost:3000
echo   API Docs: http://localhost:8000/docs
echo ======================================================================
