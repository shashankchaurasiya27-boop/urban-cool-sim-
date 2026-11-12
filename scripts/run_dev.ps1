# UrbanCoolSim Development Stack PowerShell Launcher
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  Launching UrbanCoolSim Development Stack (Backend + Frontend)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$env:PYTHONPATH = "backend"

Write-Host "[*] Starting FastAPI Backend on http://localhost:8000 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$env:PYTHONPATH='backend'; python -m uvicorn app.main:app --reload --port 8000"

Write-Host "[*] Starting Next.js Frontend on http://localhost:3000 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projectRoot\frontend'; npm run dev"

Write-Host "======================================================================" -ForegroundColor Green
Write-Host "  UrbanCoolSim is running!" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Green
Write-Host "  API Docs: http://localhost:8000/docs" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
