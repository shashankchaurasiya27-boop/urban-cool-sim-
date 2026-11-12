# UrbanCoolSim Remediation Checkpoint Status

Last updated: 2026-10-24

## Baseline

- Original upload: `UrbanCoolSim-clean.zip` (kept unchanged outside this working copy).
- Initial Git baseline: `e90efa9` (`chore: establish UrbanCoolSim baseline before remediation`).
- Working copy: separate from the uploaded archive.
- Populated `.env` files and the local SQLite database are excluded from Git tracking and from the sanitized handoff archive.

## Checkpoint C1 — Validation provenance and visualization honesty

Status: **Implemented; partial verification complete.**

### Changes

- Changed the validation UI wording from empirical satellite calibration to internal synthetic self-consistency.
- Removed hardcoded default R², MAE and RMSE values from the validation page.
- Removed synthetic sample points generated inside the chart component.
- Added a bounded sample of the evaluator's actual benchmark/simulation pairs to the validation response.
- Added explicit provenance, independent-observation flag, valid-pixel count, mean bias, and selected study-area ID to the response contract.
- Updated the validation API client to pass the selected study area.
- Added loading/error states so an unavailable endpoint does not appear to have succeeded.
- Added a focused evaluator regression test and strengthened the API endpoint regression test.

### Verification evidence

- PASS: `PYTHONPATH=backend python -m pytest backend/tests/test_validation_evaluator_unit.py -q` — 1 passed.
- PASS: Python compilation via `python -m compileall -q backend/app backend/tests`.
- PASS: TypeScript/TSX syntax transpilation for the three changed frontend files using the globally installed TypeScript compiler API.
- PASS: `git diff --check`.
- BLOCKED: full backend test collection — environment lacks `bcrypt` (and other declared runtime packages including `passlib`, `pymoo`, and `aiosqlite`).
- BLOCKED: full frontend build/type-check — `npm ci` timed out while resolving dependencies; global `tsc` reports missing type definition packages because frontend dependencies are not installed. Syntax transpilation is not a substitute for a full build.
- NOT RUN: visual browser review; the Next.js runtime could not be started without dependencies.

### Remaining risk

The backend validation endpoint still intentionally creates a synthetic benchmark from baseline simulation output plus seeded Gaussian noise. This endpoint must not be used as evidence of independent real-world model accuracy. True Landsat/ECOSTRESS validation requires a separate data ingestion, spatial/temporal alignment, masking, and evaluation workflow.

## Next checkpoint

C2 — Spatial grid, CRS, cell-size and area-accounting contract. Do not begin the broader heat-overlay redesign until the spatial data source and map contract are documented and tested.

## Checkpoint C2 — Spatial grid truthfulness and API contract

Status: **Implemented in working copy; focused tests pass; full application verification blocked by missing dependencies.**

### Findings from uploaded runtime response

- Delhi grid request returned 50x50 = 2,500 cells over a geographic bbox approximately 1,309 m east-west by 1,291 m north-south. Effective spacing is about 26.19 m × 25.83 m (mean ≈26.01 m), not 10 m.
- Runtime response mixed `crs: EPSG:32643` with bbox coordinates in degrees and did not identify a bbox CRS.
- `is_synthetic` was false even though temperature, population and Qf layers are described by a model/parameterization pipeline; there was no observed satellite LST source in the response's source list.
- `baseline_temperature_c` was capped at 53.5°C in 83.92% of cells, erasing most spatial contrast. `seb_temperature_c` had a different range (36.12–73.12°C), which needs explicit metric semantics when shown to users.
- The uploaded grid had no `modelled_coverage_mask`. Several morphology layers were zero for most cells, making it unsafe for a frontend to paint the whole grid as equal-support coverage.
- The uploaded runtime response differs from the current working source; the local service must be rebuilt/restarted from the updated source before verifying the corrected contract on the user's machine.

### Changes now in the working copy

- Added typed Pydantic schemas for study-area metadata and Digital Twin grid responses; OpenAPI now describes study areas as an array of structured objects and the grid as a structured response instead of a generic string/example.
- Study-area metadata explicitly identifies configured projected CRS separately from bbox/grid coordinate CRS and labels 10 m as a nominal target setting.
- Grid generation reports effective X/Y spacing and mean effective spacing, keeps geographic coordinate metadata truthful, labels modeled fields as not satellite-observed, and reports per-layer provenance.
- Added a modelled-coverage support mask, removed the 53.5°C baseline cap, and made seeded layer perturbations deterministic and limited to supported built/road areas.
- Reject unsupported study area IDs instead of silently defaulting to Delhi; reject inspect-cell rows/cols outside 0–49 rather than clamping to a different cell.
- Added all-study-area grid integrity coverage, response-schema validation, and a CRS/physics regression for vapor pressure units in the atmospheric emissivity calculation.

### Verification evidence

- PASS: `PYTHONPATH=. pytest -q tests/test_grid_integrity.py tests/test_validation_evaluator_unit.py` from `backend/` — 6 passed.
- PASS: `python -m compileall -q app tests` from `backend/`.
- PASS: `git diff --check`.
- PASS: read-only Digital Twin router smoke tests in a minimal FastAPI app using a temporary `bcrypt` import shim. Study-area list, grid contract, OpenAPI schemas, unknown study-area rejection (422), and out-of-range cell rejection (422) all passed. This does not test auth/password behavior or the full app.
- BLOCKED: full backend test collection; the environment is missing `bcrypt` and `pymoo`, and package installation failed because network/DNS is unavailable in this environment.
- BLOCKED: frontend production build; `npm run build` fails with `next: not found` because the available `node_modules` is incomplete. Dependencies could not be downloaded here.
- NOT RUN: browser visual regression; do not mark the heat-map redesign complete.

### Next work

1. Package/restart the user's local backend from this exact source and confirm `/grid` now returns `resolution_m ≈26`, `nominal_resolution_m=10`, `crs/bbox_crs=EPSG:4326`, `is_synthetic=true`, `has_observed_satellite_lst=false`, and the support mask.
2. Decide whether to keep the 1.3 km extent with honest ~26 m effective spacing, or deliver a true 10 m projected raster with appropriate rows/cols and rendering/performance tests.
3. Before any further frontend UI edits, create and retain the correct visual reference (modelled temperature, no satellite-validation claim, native/effective resolution shown), then implement and visually verify the map redesign.
