# UrbanCoolSim: Complete Startup & Operations Guide

Welcome to the **UrbanCoolSim Startup Guide**. This document provides step-by-step instructions for installing, configuring, running, testing, and deploying UrbanCoolSim across local development, Docker, and enterprise production environments.

> **Product Thesis:** *We are not selling a heat map. We are selling better urban infrastructure decisions.*

---

## 1. System Requirements & Prerequisites

Before setting up UrbanCoolSim, verify that your environment satisfies the following dependencies:

### Core Runtime Dependencies
- **Python**: Version 3.11.x (3.11.9 recommended)
- **Node.js**: Version 18.x, 20.x, or 24.x (with `npm` >= 9.x)
- **Git**: Version 2.40+

### Database & Task Queue Infrastructure
- **PostgreSQL & PostGIS** (Optional for production; SQLite fallback is built-in for local dev): PostgreSQL >= 15 with PostGIS >= 3.3.
- **Redis**: Version 7.x (used for async job queue and rate limiting).
- **Docker & Docker Compose**: Docker Desktop 4.20+ (if running via containers).

---

## 2. Quickstart Options

### Option A: Docker Compose (Recommended for Full Stack)

To spin up all services (PostgreSQL/PostGIS, Redis, FastAPI Backend, Celery Worker, and Next.js Frontend) in one command:

```bash
# 1. Clone or navigate to the repository root
cd UrbanCoolSim

# 2. Launch all containerized services
docker-compose up --build -d

# 3. Verify service health
docker-compose ps
```

Services will be accessible at:
- **Frontend Dashboard**: `http://localhost:3000`
- **FastAPI API & OpenAPI Docs**: `http://localhost:8000/docs`
- **PostgreSQL / PostGIS**: `localhost:5432`
- **Redis**: `localhost:6379`

---

### Option B: Local Development Setup (Step-by-Step)

If you prefer running the backend and frontend directly on your local workstation:

#### Step 1: Backend Setup & Python Virtual Environment
```bash
# 1. Navigate to project root
cd UrbanCoolSim

# 2. Create and activate a Python 3.11 virtual environment
python -m venv venv

# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# On Linux / macOS:
source venv/bin/activate

# 3. Upgrade pip and install core backend dependencies
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
```

#### Step 2: Database Initialization
By default, UrbanCoolSim uses an embedded SQLite database (`sqlite:///./urbancoolsim.db`) with async capability for zero-config local development.
To initialize the database tables:

```bash
# Run pytest or start the FastAPI app to auto-create SQLite tables:
$env:PYTHONPATH="backend"
python -c "from app.database import engine, Base; Base.metadata.create_all(bind=engine)"
```

#### Step 3: Launch the FastAPI Backend Server
```bash
# On Windows PowerShell:
$env:PYTHONPATH="backend"
uvicorn app.main:app --reload --port 8000

# On Linux / macOS:
PYTHONPATH=backend uvicorn app.main:app --reload --port 8000
```
Verify backend health by visiting `http://localhost:8000/health`.

#### Step 4: Train & Verify the AI Surrogate Model (CLI)
You can train and benchmark the production LightGBM surrogate model on physics simulations in under 2 seconds:

```bash
# Run the dedicated AI training script
python scripts/train_ai_surrogate.py --samples 1500
```
This fits both the baseline Ridge regression model and the production LightGBM surrogate model, computes cross-validated $R^2$, MAE, RMSE metrics, evaluates SHAP explainability, and registers the model artifact under `backend/storage/models/surrogate_lgbm_latest.joblib`.

#### Step 5: Launch the Background Task Queue (Optional)
For asynchronous raster sweeps, background surrogate training, and PDF generation:

```bash
# On Windows / Linux (with Redis running):
$env:PYTHONPATH="backend"
celery -A app.worker.celery_app worker --loglevel=info
```

#### Step 6: Dataset Downloader Execution (Optional)
To fetch satellite land-surface temperature and GIS layers for real-world study areas:

```bash
# Install dataset downloader dependencies:
pip install -r dataset/requirements.txt

# Run dataset downloader CLI:
python dataset/download_datasets.py --datasets landsat sentinel worldcover osm
```

#### Step 7: Frontend Setup & Development Launch
Open a new terminal window:

```bash
# Navigate to frontend directory
cd UrbanCoolSim/frontend

# Install Node dependencies
npm install

# Start Next.js development server
npm run dev
```

#### One-Click Launch (Windows Development)
Alternatively, you can start both backend and frontend simultaneously with:
- PowerShell: `.\scripts\run_dev.ps1`
- Windows Batch: `.\scripts\run_dev.bat`

```bash
# Navigate to frontend directory
cd UrbanCoolSim/frontend

# Install Node dependencies
npm install

# Start Next.js development server
npm run dev
```
Open your browser to `http://localhost:3000`.

---

## 3. System Verification & Testing

UrbanCoolSim includes an extensive unit, integration, and security test suite.

### Backend Pytest Suite
Run all backend tests covering energy balance physics, surrogate models, NSGA-II optimization, and authentication:

```bash
# Execute pytest from project root
$env:PYTHONPATH="backend"
pytest backend/tests/test_backend.py -v
```

Expected output:
```text
======================= 5 passed, 16 warnings in 4.65s ========================
backend/tests/test_backend.py::test_health_check PASSED                  [ 20%]
backend/tests/test_backend.py::test_physics_energy_balance_solver PASSED [ 40%]
backend/tests/test_backend.py::test_surrogate_model_training_and_prediction PASSED [ 60%]
backend/tests/test_backend.py::test_nsga2_multi_objective_optimization PASSED [ 80%]
backend/tests/test_backend.py::test_auth_user_flow PASSED                [100%]
```

### Frontend Production Build Verification
To test frontend compilation, type checking, and static generation:

```bash
cd frontend
npm run build
```

Expected output:
```text
 ✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (14/14)
```

---

## 4. Operational Workflow Guide (10 Core Screens)

Once the system is running, follow this operational workflow to evaluate urban cooling decisions:

```text
1. EXECUTIVE DASHBOARD (/dashboard)
   ↓ Inspect baseline surface LST & heat risk hotspots
2. DIGITAL TWIN SPATIAL MAP (/digital-twin)
   ↓ Inspect 10m microgrid cells (building height, density, vegetation)
3. THERMAL ANALYSIS (/thermal-analysis)
   ↓ Inspect Surface Energy Balance fluxes (Q*, Qf, Qh, Qe, dQs)
4. INTERVENTION STUDIO (/intervention-studio)
   ↓ Tune green roofs, cool roofs, tree canopy & water sliders
5. SCENARIO Comparison LAB (/scenario-lab)
   ↓ Compare side-by-side cooling benefits & costs
6. MULTI-OBJECTIVE OPTIMIZATION (/optimization)
   ↓ Run NSGA-II Pareto solver with physics re-validation
7. SIMULATION RESULTS (/simulation-results)
   ↓ Inspect SHAP explainability waterfall charts
8. OBSERVATIONAL VALIDATION (/validation)
   ↓ Verify model against Landsat 8 satellite LST observations
9. DECISION REPORTS (/reports)
   ↓ Generate and export PDF/Markdown executive reports
10. METHODOLOGY & PROVENANCE (/methodology)
   ↓ Audit underlying equations and dataset provenance
```

---

## 5. Environment Variables & Configuration Matrix

Create a `.env` file in `backend/` or set environment variables:

| Variable Name | Default Value | Description |
| :--- | :--- | :--- |
| `ENVIRONMENT` | `development` | Environment mode (`development` or `production`). |
| `DEBUG` | `True` | Enables detailed logging and OpenAPI docs. |
| `SECRET_KEY` | `urbancoolsim_super_secret...` | JWT token secret key (change in production!). |
| `DATABASE_URL` | `sqlite+aiosqlite:///./urbancoolsim.db` | Async SQLAlchemy database connection URL. |
| `SYNC_DATABASE_URL` | `sqlite:///./urbancoolsim.db` | Sync SQLAlchemy connection for engine creation. |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection URL for task queue & rate limiting. |
| `MAX_SIMULATION_CELLS` | `1000000` | Upper safety limit for spatial grid cell evaluations. |
| `MAX_OPTIMIZATION_ITERATIONS` | `200` | Safety limit for NSGA-II solver iterations. |
| `RATE_LIMIT_PER_MINUTE` | `60` | Max requests per minute per IP address. |

---

## 6. Troubleshooting & Common Remediation

### Issue A: `ModuleNotFoundError: No module named 'app'`
- **Cause**: Python does not find the `backend` directory in its search path.
- **Fix**: Set `PYTHONPATH=backend` before running `pytest` or `uvicorn`:
  - PowerShell: `$env:PYTHONPATH="backend"`
  - Bash: `export PYTHONPATH=backend`

### Issue B: Port Conflict (Port 8000 or 3000 already in use)
- **Fix**: Kill existing processes occupying port 8000 or 3000:
  - Windows: `netstat -ano | findstr :8000` then `taskkill /PID <PID> /F`
  - Linux/macOS: `lsof -i :8000` then `kill -9 <PID>`

### Issue C: Synthetic Demo Mode Indicator
- **Explanation**: If real satellite GeoTIFF rasters are not present in `/dataset/raw/`, UrbanCoolSim automatically initializes high-fidelity synthetic spatial grids based on Connaught Place, New Delhi. All outputs are explicitly tagged `[SYNTHETIC DEMO]` to maintain scientific transparency.

### Issue D: Celery / Redis Connection Refused
- **Fix**: Ensure Redis is running via `redis-server` or `docker run -p 6379:6379 redis:7-alpine`. If Redis is unavailable, API endpoints fallback gracefully to synchronous processing.

---

## 7. Production Deployment & Security Best Practices

1. **Change Default JWT Secrets**: Replace `SECRET_KEY` with a securely generated 256-bit entropy key.
2. **Enable PostgreSQL + PostGIS**: Replace SQLite database URL with PostgreSQL in production (`postgresql+asyncpg://user:pass@host:5432/urbancoolsim`).
3. **Set Security Headers**: The backend automatically sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and CORS origin restrictions.
4. **HTTPS Encryption**: Terminate TLS using NGINX, Caddy, or Cloudflare in front of FastAPI and Next.js.
