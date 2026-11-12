# UrbanCoolSim: Release Packaging Decisions & Architecture Policy

**Document ID**: `UCS-DOC-RELEASE-DECISIONS-20261030`  
**Target Milestone**: Preparation for Checkpoint C3  
**Auditor / Release Engineer**: Senior Software Engineer & Supply-Chain Auditor  
**Date**: 2026-10-30  

---

## 1. Executive Summary & Philosophy

This document defines the formal packaging decisions, inclusion/exclusion rules, and architectural trade-offs applied to the **UrbanCoolSim C3 Preparation Source Release Package** (`UrbanCoolSim_C3_Preparation_Source.zip`).

The primary release goal is to provide a **verified, clean, reproducible, and secure source-code distribution** for independent technical evaluation, debugging, reproducibility benchmarking, and C3 feature development without bundling transient, regenerateable binary bulk or private environment state.

---

## 2. Decision Matrix & Policy Breakdown

### A. Python Source Code and Runtime Configuration (RETAIN)
- **Decision**: **RETAIN 100% of Python source files, tests, and dependency declarations.**
- **Scope**:
  - `backend/app/`: Complete application logic (API routers, SEB energy balance physics engine, NSGA-II Pareto optimizer, spatial UTM rasterizer, data schemas, authentication, and worker).
  - `backend/tests/`: All 83 pytest verification test cases covering grid contracts, physics validation, remediation, and unit integrity.
  - `backend/requirements.txt`: Authoritative Python dependency manifest.
  - `backend/Dockerfile` & `backend/start.sh`: Container build and initialization scripts.
  - `dataset/*.py` & `dataset/tests/`: Sourcing, clipping, and spatial validation tools.
  - `scripts/*.py`: Operational, benchmarking, and packaging scripts.
- **Exclusions**:
  - Virtual environments (`.venv-backend/`, `.venv-spatial/`, `venv/`).
  - Compiled bytecode (`__pycache__/`, `*.pyc`, `*.pyo`).
  - Pytest temporary cache directories (`.pytest_cache/`).

### B. Node.js & Frontend Web Application (RETAIN)
- **Decision**: **RETAIN 100% of frontend source code, public GIS fallback assets, and pinned package specifications.**
- **Scope**:
  - `frontend/src/`: All Next.js 14 App Router pages (`dashboard`, `digital-twin`, `heat-risk`, `intervention-studio`, `methodology`, `optimization`, `reports`, `scenario-lab`, `simulation-results`, `thermal-analysis`, `validation`), React components (Deck.gl 3D map, MapLibre 2D map, charts, hero canvas), and utility libraries.
  - `frontend/public/`: Static brand assets and fallback GeoJSON files in `public/data/geo/`.
  - `frontend/package.json` & `frontend/package-lock.json`: Authoritative dependency declaration and lockfile Version 3 (787 pinned packages).
  - Project configuration: `next.config.js`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `.eslintrc.json`, `Dockerfile`, `Dockerfile.dev`.
- **Exclusions**:
  - `frontend/node_modules/`: Third-party dependency tree (~1.0 GB uncompressed).
  - `frontend/.next/`: Next.js compiler cache and production build bundles (~533 MB).
  - `frontend/tsconfig.tsbuildinfo`: Incremental TypeScript build cache (~340 KB).

### C. Database Policy (`urbancoolsim.db`) (EXCLUDE)
- **Inspection Findings**:
  - The SQLite database file `urbancoolsim.db` (516 KB) was inspected read-only.
  - It contains 84 rows in the `users` table, which were transient dummy accounts generated during automated test executions (e.g., `planner_test_*`, `test_user_reg_*`, `hacker_*` from `test_remediation.py`).
  - It contains 35 optimization runs, 102 validation runs, and 46 report records generated during prior test executions.
- **Architectural Fact**:
  - In `backend/app/main.py` (lifespan startup handler), the application executes:
    ```python
    Base.metadata.create_all(bind=engine)
    ```
    and automatically seeds baseline study areas (`delhi_cp`, `mumbai_bkc`, etc.) and default cooling scenarios (`scen_baseline`, `scen_green_roofs`, `scen_cool_pave`, etc.) idempotently.
- **Decision**: **EXCLUDE `urbancoolsim.db` from the source release archive.**
  - Bundling a local SQLite database with test-generated user records violates supply-chain hygiene and triggers packaging safety rule violations (`Forbidden file pattern '^.*\.db$'`).
  - The application automatically initializes, migrates, and seeds a fresh, pristine database on startup.

### D. Scientific ML Surrogate Models (RETAIN ACTIVE / EXCLUDE CHECKPOINTS)
- **Inspection Findings**:
  - `backend/storage/models/` contains 45 LightGBM model files (`.joblib`).
  - `backend/app/main.py` (line 252) and `backend/app/ml/surrogate.py` (lines 173, 212) explicitly load:
    ```python
    model_file = os.path.join(settings.STORAGE_DIR, "models", "surrogate_lgbm_latest.joblib")
    ```
  - The remaining 44 files are timestamped checkpoints created during recurring test runs (`surrogate_lgbm_YYYYMMDD_HHMMSS.joblib`, totaling ~11 MB uncompressed).
- **Decision**:
  - **RETAIN** `backend/storage/models/surrogate_lgbm_latest.joblib` (278,505 bytes, SHA-256: `110350abe3e3ba28c28f2998751c43be3ee4794dbfb44e4da8273682e572e1b9`). This enables out-of-the-box surrogate inference without requiring immediate model retraining.
  - **EXCLUDE** the 44 redundant timestamped training checkpoint files.

### E. Geospatial Datasets (RETAIN 100% CANONICAL VECTORS / EXCLUDE HTTP CACHE)
- **Inspection Findings**:
  - `dataset/raw/vector/osm/` contains 5 full-extent OSM GeoJSON datasets and `manifest.json`.
  - `dataset/processed/spatial_vectors/` contains 5 clipped study-area GeoJSON datasets.
  - Across all 10 datasets, exactly **13,880 physical features** are stored across Delhi, Mumbai, Singapore, Phoenix, and Tokyo. All 10 files pass `dataset/validate_spatial_data.py` with 0 geometry errors.
  - `cache/` contains 5 raw Overpass API JSON HTTP cache files (~9.7 MB uncompressed).
- **Decision**:
  - **RETAIN** all 10 raw and processed GeoJSON datasets, manifests, provenance ledgers, and study area definitions.
  - **EXCLUDE** `cache/`. The HTTP query cache is regenerable and redundant because the canonical vectors are permanently preserved in `dataset/raw/` and `dataset/processed/`.

### F. Historical Checkpoint C2 Evidence (RETAIN DOCUMENTATION & PATCHES / EXCLUDE NESTED ZIPS)
- **Inspection Findings**:
  - `artifacts/c2-final-closure/` and `artifacts/c2-release-audit-staging/` contain comprehensive audit reports, machine-readable test matrices (`FINAL_TEST_MATRIX.json`), test logs, JUnit XML reports, and unified diff patches (`diff/C2_FINAL_CLOSURE.patch`).
  - `artifacts/c2-release-audit-staging/` also contained `UrbanCoolSim_C2_Verified_Project.zip` (6.08 MB).
- **Decision**:
  - **RETAIN** all historical C2 audit reports, JUnit reports, test logs, JSON matrices, provenance documents, and patch files.
  - **EXCLUDE** all nested `.zip` archives. Embedding full project archives inside another project archive causes circular bloat and packaging safety audit failures.

### G. Security and Environment Templates (RETAIN TEMPLATES / EXCLUDE LOCAL SECRETS)
- **Inspection Findings**:
  - Root `.env` and `frontend/.env.local` exist locally in the development workspace.
  - Root `.env.example` and `frontend/.env.example` exist and contain safe placeholder strings.
- **Decision**:
  - **RETAIN** `.env.example` and `frontend/.env.example`.
  - **EXCLUDE** `.env` and `frontend/.env.local` to prevent leakage of local development settings, ports, or custom tokens.

---

## 3. Directory Layout in the Final Release Archive

The archive packages all assets under a single, clean top-level directory: `UrbanCoolSim/`.
Extracting the archive will never overwrite files in the parent directory or create an unstructured file dump.

---

## 4. Known Limitations & Disclosures

1. **Git Commit Provenance**: The source workspace is an extracted standalone directory untracked in the parent folder's git repository (`e25cca13757cc9568d56242cc3f7afdfb95e8274`). Per release policy, no synthetic git commit hash is fabricated; the archive's identity is anchored by its canonical source tree SHA-256 fingerprint.
2. **Offline npm Installation**: The frontend archive excludes `node_modules/`. To run the frontend, the evaluator must execute `npm install` with active internet access.
3. **Geospatial Python Environment**: Running `dataset/validate_spatial_data.py` or spatial acquisition scripts requires GDAL/GEOS C-libraries, wrapped by `shapely`, `geopandas`, and `pyproj`.

