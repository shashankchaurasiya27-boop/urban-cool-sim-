# UrbanCoolSim C3 Phase 0 — Final Rollback Status Report

## 1. Executive Summary & Verification Outcome

As part of the **C3 Phase 0 — Baseline Freeze and Entry Gate**, a comprehensive, byte-verified rollback copy of the UrbanCoolSim project was created prior to the execution of any gate verification commands. 

- **Rollback Copy Status**: **VERIFIED INTACT & OPERATIONAL**
- **Creation Timestamp**: `2026-10-30T23:10:00+05:30`
- **Integrity Status**: 100% untouched since creation. All 627 files and SQLite database states remain identical to their pre-test capture.

| Attribute | Recorded Value |
| :--- | :--- |
| **Absolute Rollback Path** | `/Users/shashankchaurasia/Downloads/UrbanCoolSim_Rollback_C3_Gate0_20261030_230500` |
| **Source Project Root** | `/Users/shashankchaurasia/Downloads/UrbanCoolSim-main 2` |
| **Total Files Preserved** | `627` files |
| **Total Size on Disk** | `85,692,463` bytes (~`81.72` MB) |
| **Database Backup Mechanism** | SQLite Online Backup API (`sqlite3.Connection.backup` via URI `mode=ro`) |
| **Pre-Test Verification Check** | `627 / 627` files matched SHA-256; 0 mismatches, 0 errors |
| **Post-Test Workspace Diff** | 625 identical; 2 modified (`tsconfig.tsbuildinfo`, `urbancoolsim.db` +1 row); 34 added (test models/reports, agent files) |

---

## 2. Scope of Rollback Copy

### 2.1 Included Artifacts
The rollback copy captures all state required to reconstruct the exact pre-gate condition of the application, including:
1. **Source Code**: Complete backend (`backend/app`, `backend/tests`) and frontend (`frontend/src`, `frontend/public`, configuration files).
2. **Local Databases**:
   - `urbancoolsim.db` (548,864 bytes; 11 tables verified with identical row counts: 36 runs, 10 interventions, 5 study areas, etc.).
   - `backend/urbancoolsim.db` (135,168 bytes; 11 tables verified).
3. **ML Surrogate Model Checkpoints**:
   - All 47 historical model artifacts in `backend/storage/models/`, including active production model `surrogate_lgbm_latest.joblib` (SHA-256: `be41a11ee8b00c9395d53b167a33975a052a3844f3194dcf571b0515bad958c1`).
4. **Generated Reports**:
   - All 55 pre-existing simulation PDF reports in `backend/storage/reports/`.
5. **Geospatial Datasets & Metadata**:
   - All 10 GeoJSON datasets in `dataset/` (5 raw OSM snapshots, 5 clipped spatial datasets).
   - Validation scripts and spatial configuration metadata.
6. **Network & AST Caches**:
   - Overpass API raw query responses in `cache/`.
   - AST knowledge graph artifacts in `graphify-out/`.
7. **Closure & Gate Evidence**:
   - Historical C2 closure records and staging packages in `artifacts/`.
8. **Local Configuration & Secrets**:
   - `.env` and `frontend/.env.local` containing local developer configurations.

### 2.2 Excluded Artifacts (Reproducible & Ephemeral)
To optimize transferability and preserve storage hygiene, standard transient and reproducible trees were excluded:
- `frontend/node_modules/` (~1.0 GB reproducible npm package tree; reinstalls via `npm ci`).
- `.venv-backend/` (~749 MB reproducible Python virtual environment; recreates via `pip install -r backend/requirements.txt`).
- `.venv-spatial/` (~282 MB auxiliary spatial Python virtual environment).
- `frontend/.next/` (~533 MB Next.js build cache; regenerates via `npm run build`).
- Python bytecode caches (`__pycache__/`, `*.pyc`, `.pytest_cache/`).

---

## 3. Post-Test Workspace Reconciliation

A differential comparison between the live workspace `/Users/shashankchaurasia/Downloads/UrbanCoolSim-main 2` and the rollback copy `/Users/shashankchaurasia/Downloads/UrbanCoolSim_Rollback_C3_Gate0_20261030_230500` revealed:

1. **Application Source Code**:
   - **0 modifications**. Every `.py`, `.ts`, `.tsx`, `.json`, `.css`, and `.sh` source file is 100% bitwise identical.
2. **Transient Test Mutations**:
   - `urbancoolsim.db`: 1 row added to table `optimization_runs` (36 -> 37 rows) caused by `backend/tests/test_backend.py::test_optimization_endpoint` executing against the live database rather than an isolated SQLite memory fixture.
   - `frontend/tsconfig.tsbuildinfo`: Updated timestamp and incremental compilation cache from running `tsc --noEmit`.
   - `backend/storage/models/`: 2 new dated checkpoint models (`surrogate_lgbm_20261030_173917.joblib`, `surrogate_lgbm_20261030_173938.joblib`) created by `test_surrogate_model_training_and_prediction`. Note: The active production model `surrogate_lgbm_latest.joblib` was retrained deterministically with seed 42, resulting in the identical SHA-256 hash.
   - `backend/storage/reports/`: 2 test PDF files created by `test_export_pdf_report`.
3. **Agent Framework Metadata**:
   - 30 files created under `.agents/skills/gravitas/` and `skills-lock.json` by external agent orchestration during audit execution.

Because the rollback copy was created prior to these actions and stored in a disjoint directory, the rollback copy is entirely unaffected by these mutations.

---

## 4. Safe Restoration Procedure

If at any point during C3 implementation the workspace needs to be reverted to the pristine pre-Gate-0 baseline, execute the following verified restoration commands.

### Step 1: Terminate Any Running Development Servers
```bash
pkill -f "uvicorn backend.app.main:app" || true
pkill -f "next dev" || true
```

### Step 2: Restore Source, Database, and Artifact Files
```bash
# Preview changes (dry run)
rsync -avnh --delete \
  --exclude="node_modules" \
  --exclude=".venv*" \
  --exclude=".next" \
  --exclude=".git" \
  "/Users/shashankchaurasia/Downloads/UrbanCoolSim_Rollback_C3_Gate0_20261030_230500/" \
  "/Users/shashankchaurasia/Downloads/UrbanCoolSim-main 2/"

# Execute full restore
rsync -avh --delete \
  --exclude="node_modules" \
  --exclude=".venv*" \
  --exclude=".next" \
  --exclude=".git" \
  "/Users/shashankchaurasia/Downloads/UrbanCoolSim_Rollback_C3_Gate0_20261030_230500/" \
  "/Users/shashankchaurasia/Downloads/UrbanCoolSim-main 2/"
```

### Step 3: Verify Restored SQLite Database Integrity
```bash
cd "/Users/shashankchaurasia/Downloads/UrbanCoolSim-main 2"
sqlite3 urbancoolsim.db "PRAGMA integrity_check;"
sqlite3 urbancoolsim.db "SELECT count(*) FROM optimization_runs;"
# Expected row count: 36
```

### Step 4: Re-establish Reproducible Environments (If Corrupted)
```bash
# Python backend venv
cd "/Users/shashankchaurasia/Downloads/UrbanCoolSim-main 2"
python3 -m venv .venv-backend
./.venv-backend/bin/pip install --upgrade pip
./.venv-backend/bin/pip install -r backend/requirements.txt

# Node frontend dependencies
cd "/Users/shashankchaurasia/Downloads/UrbanCoolSim-main 2/frontend"
npm ci
```

---

## 5. Audit Attestation

The rollback copy `/Users/shashankchaurasia/Downloads/UrbanCoolSim_Rollback_C3_Gate0_20261030_230500` is authoritative, intact, and safe. It provides a guaranteed fallback baseline for all C3 work.

