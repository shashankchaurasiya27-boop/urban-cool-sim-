# UrbanCoolSim C3 — Missing-File and Dependency Audit Report

**Audit Date:** 2026-10-31  
**Auditor:** Senior Software Engineer, QA Lead & Release Engineer  
**Baseline Archive Under Review:** `UrbanCoolSim_C3_Developer_Handoff_2026-10-31(1).zip`  
**Baseline SHA-256:** `d653c7cf1eeafa3130faa3f0d42257c9a4ce2c878a33464673ab8a269eccaff8`  
**Isolated Working Copy Root:** `/Users/shashankchaurasia/Downloads/c3_audit_working_copy_20261031/UrbanCoolSim_C3_Developer_Handoff`  

---

## 1. Executive Summary

This audit evaluated the package completeness, dependency manifests, runtime environment configuration, and test fixture availability for the UrbanCoolSim C3 Developer Handoff. 

The audit uncovered four distinct categories of missing or misconfigured files in the baseline distribution:
1. **Missing Pytest Test Fixtures (`backend/tests/conftest.py`):** The baseline `conftest.py` contained only 5 lines configuring `SECRET_KEY`, lacking shared `client`, `setup_users`, and `auth_principals` fixtures required by the newly added security regression test suite.
2. **Missing Raw Geospatial Input Vectors (`dataset/raw/vector/osm/`):** Although processed clipped vectors were packaged, the raw OpenStreetMap feature GeoJSON files and their acquisition `manifest.json` were omitted from the baseline ZIP due to an overly broad `.gitignore` pattern (`dataset/raw/*`). This caused `dataset/validate_spatial_data.py` to exit with failure code 2.
3. **Runtime Dependency Clarification (`bcrypt`):** External reviewers flagged that `bcrypt` was missing during test collection in unconfigured ambient Python runtimes. The backend manifest `backend/requirements.txt` correctly pinned `bcrypt==4.1.2`, which is fully installed and verified in `.venv-backend` (Python 3.11.16).
4. **TypeScript Test Signature Discrepancy:** `frontend/tests/api_simulation.test.ts` contained a type inference mismatch on line 423 when destructuring GeoJSON coordinate rings (`TS2461`), blocking `npx tsc --noEmit`.

All identified missing files, fixtures, and configurations have been restored, repaired, and validated in the working tree.

---

## 2. Complete File Inventory Matrix

The table below reconciles all critical project components, categorizing their presence in the baseline ZIP versus their required state for a reproducible release.

| Category | File / Path | In Baseline ZIP? | Required for Release? | Status / Resolution |
| :--- | :--- | :---: | :---: | :--- |
| **Test Fixtures** | `backend/tests/conftest.py` | Partial (5 lines) | Yes | **Repaired:** Added `client`, `setup_users`, and `auth_principals` module-scoped fixtures. |
| **Security Tests** | `backend/tests/test_job_authorization.py` | Missing | Yes | **Created:** Implemented 8-criterion test suite for multi-tenant job isolation. |
| **Spatial Inputs** | `dataset/raw/vector/osm/*.geojson` | Missing | Yes | **Restored:** Restored all 5 raw OSM vector files (Mumbai, Delhi, Singapore, Phoenix, Tokyo). |
| **Spatial Manifest** | `dataset/raw/vector/osm/manifest.json` | Missing | Yes | **Restored:** Restored OSM acquisition provenance metadata with ODbL-1.0 license declaration. |
| **Processed Spatial** | `dataset/processed/spatial_vectors/*_clipped.geojson` | Present (5 files) | Yes | **Verified:** All 5 clipped vector sets intact and valid. |
| **Database Fixture** | `database/urbancoolsim_sanitized.db` | Present | Yes | **Whitelisted:** Sanitized SQLite database fixture containing public metadata, zero PII. |
| **Live Database** | `database/urbancoolsim.db` | Excluded | No | **Excluded:** Live runtime database containing state is properly git-ignored and excluded. |
| **Backend Manifest** | `backend/requirements.txt` | Present | Yes | **Verified:** Pinned `bcrypt==4.1.2`, `fastapi`, `sqlalchemy`, `shapely`, `pymoo`. |
| **Spatial Manifest** | `dataset/requirements-spatial.txt` | Present | Optional (dev) | **Documented:** Requires `osmnx`, `geopandas`, `pyproj` for raw OSM download scripts. |
| **Frontend Manifest** | `frontend/package.json` | Present | Yes | **Verified:** Contains exact build and test dependencies. |
| **Frontend Lockfile** | `frontend/package-lock.json` | Present | Yes | **Verified:** Ensures 100% reproducible `node_modules` installation. |
| **Frontend Deps** | `frontend/node_modules/` | Excluded | No (generated) | **Intentionally Excluded:** Generated via `npm ci` / `npm install`. Symlinked during audit. |
| **Frontend Types** | `frontend/tests/api_simulation.test.ts` | Present | Yes | **Repaired:** Fixed line 423 coordinate tuple type cast for TypeScript compiler. |
| **Packaging Test** | `scripts/test_packaging_safety.py` | Present | Yes | **Reconciled:** Whitelisted `urbancoolsim_sanitized.db` and updated to C3 architecture. |
| **Pipeline Runner** | `scripts/verify_c3_pipeline.py` | Present | Yes | **Enhanced:** Added automatic `sys.path` backend resolution and test secret key fallback. |
| **Test Runner Config** | `pytest.ini` | Missing | Yes | **Created:** Added root `pytest.ini` setting `pythonpath = backend` and `testpaths = backend/tests`. |

---

## 3. Detailed Root-Cause Analyses

### 3.1. Missing Test Harness Fixtures in `backend/tests/conftest.py`

- **Symptom:** Regression tests expecting `client` and `setup_users` fixtures failed to collect or threw `fixture 'client' not found`.
- **Root Cause:** The baseline `conftest.py` had only a basic snippet setting `os.environ["SECRET_KEY"]`. Earlier tests in `test_simulation_access_control.py` and `test_report_pdf_authorization.py` defined their own local `client = TestClient(app)` and local fixture implementations. As new job authorization tests were drafted, they expected shared fixtures from pytest's root configuration.
- **Resolution:** `backend/tests/conftest.py` was updated with:
  1. `client`: A module-scoped `TestClient(app)` instance.
  2. `setup_users`: A module-scoped fixture creating regular `user_a`, regular `user_b`, and `admin` test users in SQLite with JWT tokens and authorization headers.
  3. `auth_principals`: An adapter fixture providing `alice`, `bob`, and `admin` aliases for backwards-compatibility with PDF authorization tests.

### 3.2. Missing Raw OSM Vectors (`dataset/raw/vector/osm/`)

- **Symptom:** Executing `python dataset/validate_spatial_data.py` exited with status 2 and reported `status: MISSING` for all raw vector inputs and `manifest.json`.
- **Root Cause:** `.gitignore` line 116 contained `dataset/raw/*`. When packaging scripts or Git archives were created, the `dataset/raw/vector/osm/` directory was excluded from version control and the release zip. However, `validate_spatial_data.py` enforces a dual-stage validation rule: it audits both the raw OSM source geometries and the clipped processed geometries to guarantee geometry normalization integrity.
- **Resolution:**
  - Whitelisted `!dataset/raw/vector/osm/` and `!dataset/processed/spatial_vectors/` in `.gitignore`.
  - Restored all 5 raw GeoJSON files and `manifest.json` from the authoritative source repository (`UrbanCoolSim-main 2`).
  - Validation re-executed: 10/10 checks PASSED (100% compliant).

### 3.3. Dependency Clarification: `bcrypt` in Backend Runtime

- **Observation:** External reviewer noted `ModuleNotFoundError: No module named 'bcrypt'` when running pytest directly with ambient macOS Python.
- **Analysis:** Ambient system Python on macOS (`/usr/bin/python3`) does not include virtual environment dependencies. In the UrbanCoolSim project, `backend/requirements.txt` line 20 explicitly pins `bcrypt==4.1.2` alongside `passlib[bcrypt]>=1.7.4`.
- **Verification Evidence:**
  - Runtime check in virtual environment `.venv-backend`:
    ```bash
    $ .venv-backend/bin/python -c "import bcrypt; print('bcrypt version:', bcrypt.__version__)"
    bcrypt version: 4.1.2
    ```
  - `pip check` result:
    ```bash
    $ .venv-backend/bin/pip check
    No broken requirements found.
    ```
- **Conclusion:** No manifest change was required for bcrypt; clear execution instructions utilizing the project virtualenv resolve the issue completely.

### 3.4. Frontend Type Inference Fix

- **Symptom:** Running `npx tsc --noEmit` produced:
  ```text
  tests/api_simulation.test.ts:423:20 - error TS2461: Type 'number | number[]' is not an array type.
  423         for (const [lon, lat] of ring) {
  ```
- **Root Cause:** In `frontend/tests/api_simulation.test.ts`, line 416 extracted `const ring = polyFeature.geometry.coordinates[0];`. In TypeScript's GeoJSON definitions, coordinate arrays can be resolved as `Position[]` where `Position = number[] | [number, number]`. The iterator destructuring `[lon, lat]` triggered a strict type warning under TypeScript 5.
- **Resolution:** Explicitly cast `ring` to `[number, number][]`:
  ```typescript
  for (const [lon, lat] of (ring as [number, number][])) {
  ```
  `npx tsc --noEmit` now completes with 0 errors.

---

## 4. Reproducible Environment Setup Instructions

### 4.1. Backend Python Environment

```bash
# 1. Create Python 3.11 virtual environment
python3.11 -m venv .venv-backend
source .venv-backend/bin/activate

# 2. Install backend dependencies
pip install --upgrade pip
pip install -r backend/requirements.txt

# 3. (Optional) Install spatial source acquisition dependencies
pip install -r dataset/requirements-spatial.txt

# 4. Verify dependencies
pip check
```

### 4.2. Frontend Node Environment

```bash
# 1. Ensure Node.js >= 18.18 (tested on Node v24.20.0, npm 11.19.0)
cd frontend
npm ci  # or npm install

# 2. Verify static compilation and tests
npx tsc --noEmit
npm run lint
npm test
npm run build
```

---

## 5. Audit Conclusion

All missing files, test fixtures, and manifest oversights have been remediated. The codebase is self-contained and reproducible.

