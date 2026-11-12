# Reproducing UrbanCoolSim — Complete Developer Guide

This document contains exact, tested instructions for setting up, running, testing, and verifying UrbanCoolSim on any macOS or Linux workstation.

---

## 1. Prerequisites
- **Python**: 3.11.x (tested on 3.11.16)
- **Node.js**: v18+ or v20+ (tested on Node v24 / v20)
- **SQLite3** or **PostgreSQL** 15+

---

## 2. Environment Setup

### 2.1 Backend Environment
From the repository root:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
```

### 2.2 Configure Environment Variables
```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
```

### 2.3 Frontend Environment
```bash
cd frontend
npm ci
cd ..
```

---

## 3. Database Initialization
UrbanCoolSim features an automatic, idempotent migration and seeding engine.
- To use the included verified snapshot:
  ```bash
  cp database/urbancoolsim_sanitized.db urbancoolsim.db
  ```
- Or to initialize a brand-new database from scratch:
  The database is created automatically upon starting the backend.

---

## 4. Running the Automated Test Suites

### 4.1 Backend Test Suite (104 Tests)
```bash
PYTHONPATH=backend pytest backend/tests/ -v
```
Expected result: **104 passed, 0 failed, 0 skipped**.
> [!NOTE]
> UrbanCoolSim includes a transparent standard-library `hashlib.pbkdf2_hmac` fallback in `app/auth/security.py`. If `bcrypt` is not installed in the execution environment, the entire test suite will still collect and pass without errors. When `bcrypt` is installed, it is used automatically.

### 4.2 Authoritative C3 Lifecycle Reproducer (8 Steps)
```bash
PYTHONPATH=backend python3 scripts/verify_c3_pipeline.py
```
Expected output:
```text
======================================================================
 ALL 8 VERIFICATION STEPS PASSED SUCCESSFULLY (100% ERROR FREE)
======================================================================
```

### 4.3 Frontend Unit Tests (25 Tests)
```bash
cd frontend
npm test
```
Expected result: **25 passed, 0 failed** (including 6 C2 dynamic study-area and RFC 7946 GeoJSON export tests).

### 4.4 Frontend Static Type-Check & Lint
```bash
cd frontend
npx tsc --noEmit
npm run lint
```
Expected result: **0 errors**.

### 4.5 Frontend Production Build
```bash
cd frontend
npm run build
```
Expected result: **15 / 15 static pages generated successfully**.

---

## 5. Starting the Development Servers
- Backend:
  ```bash
  PYTHONPATH=backend uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
  ```
- Frontend:
  ```bash
  cd frontend
  npm run dev
  ```
- Visit `http://localhost:3000` to interact with the UrbanCoolSim digital twin.
