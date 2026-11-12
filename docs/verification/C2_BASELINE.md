# UrbanCoolSim C2 Baseline & Inventory Report

**Date**: October 26, 2026  
**Repository**: `/Users/shashankchaurasia/Downloads/UrbanCoolSim-main 2`  
**Baseline Backup**: `/Users/shashankchaurasia/Downloads/UrbanCoolSim_pre_c2_closure_backup_20261026_181400.zip`  
**Target Milestone**: Final Checkpoint C2 Closure  

---

## 1. Repository Inventory & Current Status

### Git State

- **Workspace directory**: Untracked directory inside user Downloads filesystem (`UrbanCoolSim-main 2/`).

- **Safety Precaution**: Complete timestamped clean backup archive created at `/Users/shashankchaurasia/Downloads/UrbanCoolSim_pre_c2_closure_backup_20261026_181400.zip` before any modifications.

### Environment & Toolchains

- **Python (Canonical)**: Python 3.11.16 (`/opt/homebrew/bin/python3.11`)
- **Backend Virtual Environment**: `.venv-backend/` (FastAPI 0.162.0, Pydantic 2.14.1, bcrypt 4.1.2, passlib 1.7.4, rasterio 1.4.4, lightgbm 4.7.0, pymoo 0.6.2, pytest 9.1.1)
- **Spatial Virtual Environment**: `.venv-spatial/` (OSMnx 2.1.1, GeoPandas 1.2.0, Shapely 2.2.0, PyProj 3.7.2)
- **Frontend Toolchain**: Node.js v24.20.0, npm 11.19.0, Next.js 14.2.35, React 18.2.0, Deck.gl 9.3.10, MapLibre-GL 4.1.0, TypeScript 5.4.2, ESLint 8.57.0

---

## 2. Baseline Test Status & Historical Count Reconciliation

Prior logs and reports in the repository documented three different backend test counts:
1.**43 tests passed**

(`logs/backend_pytest_run.log`): Initial baseline test suite from original repository after dependency repair.
2. **49 tests passed** (`logs/backend_pytest_final.log`): Intermediate test suite after initial C2 spatial contract tests were added.
3. **58 tests passed** (`logs/backend_pytest_c2_closure.log`): Expanded test suite after implementing live OSM digital twin loading, Pydantic literal enum validation for optimization requests, and bounding box area calculations.

All three counts represent successive historical milestones. A single authoritative test run will be executed on the final codebase after all remaining items are closed.

---

## 3. Review Gaps Identified for Final C2 Closure

### Item A: Fixed-Area Fallbacks (`250000`)

- **Findings**:
  - `frontend/src/app/page.tsx:246-247`: Live thermal simulator formulas hardcode `250000` for CapEx and water demand calculations.
  - `frontend/src/app/intervention-studio/page.tsx:54`: Explicit `const studyAreaM2 = 250000;`.
- **Planned Remediation**:
  - Dynamically derive district extent area from selected study area metadata/bounding box (geodesic calculation).
  - Explicitly label illustrative estimates and update all dependent metrics when switching study areas.

### Item B: Thermal Endpoint Study Area Validation

- **Findings**:
  - `backend/app/api/thermal_router.py:44`: `study_area_id: str = Query(default="delhi_cp")` on `POST /simulate`.
  - `backend/app/api/thermal_router.py:175`: `study_area_id: str = Query(default="delhi_cp")` on `GET /diurnal-profile`.
  - Invalid study area strings are not rejected at the API boundary and can cause internal exceptions.
- **Planned Remediation**:
  - Apply `StudyAreaId = Literal["delhi_cp", "mumbai_bkc", "singapore_marina", "phoenix_downtown", "tokyo_shinjuku"]` to query parameters.
  - Return HTTP 422 Unprocessable Entity for unknown or malformed study area IDs before invoking the SEB physics solver.

### Item C: Shareable Package Safety & Duplicate Directory Cleanup

- **Findings**:
  - Prior shareable zip packages included a populated `urbancoolsim.db`.
  - Workspace contains a duplicate directory `Spatial_Data_Acquisition_Toolkit.` with a trailing dot.
- **Planned Remediation**:
  - Exclude all live/populated databases (`*.db`, `*.sqlite*`), secrets, and local `.env` files from shareable distribution archives.
  - Exclude duplicate trailing-dot toolkit directory from package.
  - Add automated test `scripts/test_packaging_safety.py` to verify no databases or secrets leak into archives.

### Item D: Spatial Resolution & True 10m Grid

- **Findings**:
  - The repository frequently refers to a "10m microgrid", but default 50x50 or 40x40 sampling yields effective cell spacing of ~30–39m across ~1.5km study areas.
- **Planned Remediation**:
  - Document the requirement source in `docs/verification/SPATIAL_RESOLUTION_DECISION.md`.
  - Provide an explicit metric grid mode where cell size is truly 10.0m x 10.0m in projected coordinates (e.g. ~130–156 cols by ~129–149 rows, ~17,000–23,000 cells) with sub-second execution.
  - Maintain truthful reporting of nominal vs effective resolution when arbitrary row/column dimensions are requested.

### Item E: Truthful Provenance of Modeled Heat

- **Findings**:
  - Need to verify no claims of "satellite ground truth" or "observed validation" exist for simulated SEB model outputs.
- **Planned Remediation**:
  - Audit all UI copy and endpoints to ensure simulated outputs are explicitly labeled as "modelled SEB temperature" and "synthetic self-consistency".
