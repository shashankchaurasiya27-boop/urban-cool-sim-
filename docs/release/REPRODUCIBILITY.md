# UrbanCoolSim: Complete Independent Reproducibility Guide

**Document ID**: `UCS-DOC-REPRODUCIBILITY-20261030`  
**Target Milestone**: Preparation for Checkpoint C3  
**Auditor / Release Engineer**: Senior Software Engineer & Supply-Chain Auditor  
**Date**: 2026-10-30  

---

## 1. Quickstart Workflow Summary

An independent evaluator or developer receiving `UrbanCoolSim_C3_Preparation_Source.zip` can reproduce the complete platform, backend test suite, and frontend interface using the following step-by-step procedures.

---

## 2. Step 1: Extraction & Directory Setup

Extract the archive into your preferred workspace:

```bash
unzip UrbanCoolSim_C3_Preparation_Source.zip
cd UrbanCoolSim
```

Verify that the project root contains:
- `backend/`, `frontend/`, `dataset/`, `scripts/`, `docs/`, `artifacts/`, `storage/`, and `remediation/`.
- Configuration templates: `.env.example`, `docker-compose.yml`.

---

## 3. Step 2: Configure Environment Variables

UrbanCoolSim provides safe, pre-configured configuration templates. Copy the root and frontend templates:

```bash
# 1. Root / Backend configuration
cp .env.example .env

# 2. Frontend configuration
cp frontend/.env.example frontend/.env.local
```

> **Security Note**: In `.env`, `SECRET_KEY` is pre-populated with a secure 32-byte test placeholder (`change_this_to_a_secure_random_production_jwt_secret_key_32_bytes`). For development and testing, this value satisfies the minimum length validation.

---

## 4. Step 3: Set Up Backend Python Environment

```bash
# 1. Create a virtual environment with Python 3.10+ (Python 3.11 recommended)
python3 -m venv .venv-backend
source .venv-backend/bin/activate

# 2. Upgrade pip and install all backend requirements
pip install --upgrade pip
pip install -r backend/requirements.txt
```

---

## 5. Step 4: Database Initialization & Seeding

UrbanCoolSim uses an asynchronous SQLAlchemy engine. By default, it operates on a zero-config local SQLite database (`urbancoolsim.db`), or PostgreSQL if configured via Docker.

You do **not** need to manually run raw SQL scripts. When the backend starts up, its lifespan handler automatically executes:
1. `Base.metadata.create_all(bind=engine)` to initialize all relational tables.
2. Automatic seeding of the 5 baseline study areas (`delhi_cp`, `mumbai_bkc`, `singapore_marina`, `phoenix_downtown`, `tokyo_shinjuku`).
3. Automatic seeding of baseline cooling scenarios (`scen_baseline`, `scen_green_roofs`, `scen_cool_pave`, `scen_canopy`, `scen_hybrid_cp`).

---

## 6. Step 5: Execute Backend Test Suites

Run the full pytest suite with verbose output:

```bash
source .venv-backend/bin/activate
PYTHONPATH=backend pytest backend/tests/ -v
```

### Expected Test Results:
- **Total Tests**: **83 passed**
- **Failures / Errors**: **0**
- **Duration**: ~18–20 seconds
- **Suites Tested**:
  - `test_c2_grid_contract.py` (49 tests: 10 m projected UTM grids, 4-corner extents, API 422 conflict validation).
  - `test_remediation.py` (17 tests: zero synthetic defaults, physics validation error $\le 0.5^\circ\text{C}$, secret key security).
  - `test_backend.py` (11 tests: diurnal profiles, SEB physics, NSGA-II optimization).
  - `test_grid_integrity.py` (5 tests: atmospheric emissivity, non-clipped temperature distribution).
  - `test_validation_evaluator_unit.py` (1 test: statistical benchmarking truth).

---

## 7. Step 6: Start the Backend Service

```bash
source .venv-backend/bin/activate
python3 -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

- **API Root**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/health`

---

## 8. Step 7: Set Up and Run the Frontend

In a separate terminal window:

```bash
cd frontend

# 1. Install Node.js dependencies cleanly from package-lock.json
npm ci

# 2. Start the development server (runs on port 3000)
npm run dev

# Or build and start for production:
npm run build
npm run start
```

Access the web interface at: `http://localhost:3000`

---

## 9. Step 8: Spatial Data Verification & Ingestion (Optional)

All 10 canonical raw and clipped GeoJSON vector files are pre-packaged in `dataset/raw/` and `dataset/processed/`.

To verify spatial topological integrity:
```bash
# In an environment with geopandas and shapely (or using .venv-backend):
source .venv-backend/bin/activate
python3 dataset/validate_spatial_data.py
```
*Expected Result*: `overall_status: PASS`, 13,880 features validated, 0 invalid geometries.

---

## 10. Step 9: Locating the Trained ML Surrogate Model

The active LightGBM surrogate model is located at:
`backend/storage/models/surrogate_lgbm_latest.joblib`

The model is automatically loaded during backend startup. To train a new version or evaluate performance:
```bash
source .venv-backend/bin/activate
python3 scripts/train_ai_surrogate.py
```

---

## 11. Alternative: Full Stack via Docker Compose

To run the entire system in isolated containers:
```bash
cp .env.example .env
docker compose up --build
```
This automatically launches:
- PostgreSQL database on port `5432`
- FastAPI backend on port `8000`
- Next.js frontend on port `3000`

