# UrbanCoolSim C2 Audit and Change Log

## 0. Audit metadata

- Audit date: 2026-10-25 (Asia/Kolkata)
- Input archive: `UrbanCoolSim 1 Project.zip`
- Input SHA-256: `7671d3a5cfa0fb2480edfcf733dc4775efc1f6cfa4188756bf5df32e06fdc92a`
- Archive entries: 123; no `.git` metadata in archive
- Working mode: separate extracted copy; original archive preserved unchanged
- Source commit: unavailable from archive
- Audit baseline: uploaded ZIP plus supplied master prompt and C2 read-only review
- Status: **PARTIAL — C2 NOT CLOSED**
- C3 authorization: **NO**

## 1. Executive decision

The uploaded source already contains earlier C1/C2 changes for explicit geographic CRS metadata, effective resolution, modeled/synthetic provenance, a coverage mask, deterministic grid generation, removal of the former temperature clamp, unsupported-area rejection, and the atmospheric-emissivity unit correction. This pass made a bounded backend-only set of additional C2 changes:

1. Filled the missing public CRS/resolution metadata fields for `mumbai_bkc`.
2. Made cell inspection accept explicit grid dimensions (defaulting to 50×50 for existing clients), validate indices against those dimensions, and return grid identity, effective spacing and support/provenance information.
3. Changed thermal simulation to use requested rows/columns rather than hard-coded 40×40; constrained request dimensions to the shared supported 10–100 range. `grid_resolution_m` is explicitly documented as a nominal target; the current grid is still extent/dimension based and does not reproject to a true 10 m raster.
4. Added response-model validation for bbox shape/order/finiteness, positive resolution fields, `total_cells == rows * cols`, layer dimensions/finiteness, and binary coverage mask.
5. Added focused C2 regression tests.

**C2 remains PARTIAL.** The known frontend GeoJSON export still declares a projected CRS for longitude/latitude coordinates and hard-codes Delhi geometry; the report page still supplies a fixed 250,000 m² area assumption. These frontend changes were not made because the required export-flow-specific visual-reference and browser screenshot/verification workflow could not be completed to the required standard in this pass. Full backend tests and the frontend build are blocked by environment dependencies. Do not proceed to C3 yet.

## 2. Source integrity and scope

- The original input ZIP was not modified.
- Work was performed in a separate extracted directory.
- No dependency versions or lockfiles were changed.
- No model, PDF report, fixture, or bundled dataset artifact was deleted.
- No frontend source files were changed.
- No C3 orchestration/persistence, C4 visual redesign, C5 optimizer redesign, C6 report/run persistence, or C7 release/security changes were attempted.

## 3. C2 acceptance matrix

| ID | Requirement | Status | Evidence / remaining action |
|---|---|---|---|
| C2-01 | Coherent grid dimensions and cell identity | PARTIAL | Inspection and thermal simulation now use requested dimensions; route-level runtime verification blocked by missing `bcrypt`; verify with live API. |
| C2-02 | CRS and bbox meaning explicit | PARTIAL | Existing grid payload is explicit; new bbox validation added. Runtime endpoint verification blocked. |
| C2-03 | Nominal resolution distinct from effective spacing | PARTIAL | Existing spatial engine reports both; thermal schema now documents target semantics. True projected 10 m raster is not implemented or claimed. |
| C2-04 | Five study areas expose metadata parity | PASS (static + test) | `mumbai_bkc` public metadata filled; `test_c2_grid_contract.py` checks all five records against canonical config. |
| C2-05 | Cell count, layer shape, finite values, mask invariants | PASS (focused schema tests) | `DigitalTwinGridResponse` validates these invariants; multi-size tests pass. |
| C2-06 | Inspection resolves a coherent grid | PARTIAL | Route code now uses `rows`/`cols` and includes grid identity/support; HTTP-level test remains blocked by app dependency import. |
| C2-07 | GeoJSON CRS matches coordinates | FAIL / NOT CHANGED | `frontend/src/lib/api.ts` still exports longitude/latitude-like coordinates with a legacy EPSG:32643 CRS declaration. Requires frontend reference-first workflow and regression test. |
| C2-08 | Export geometry follows selected study area | FAIL / NOT CHANGED | Export helper still uses hard-coded Delhi geometry. Requires frontend logic fix and selected-area tests. |
| C2-09 | Area accounting not arbitrary | FAIL / NOT CHANGED | `frontend/src/app/reports/page.tsx` still supplies `land_area_m2: 250000`. Must derive from a grounded/configured study area or explicitly label illustrative output; do not substitute an invented area. |
| C2-10 | Unsupported values preserve provenance | PARTIAL | Inspector now returns mask support and layer provenance. Frontend consumers/fallback styling require broader review. |
| C2-11 | Focused C2 tests pass | PASS | 15 tests passed across new C2 contract tests and existing grid/validation tests. |
| C2-12 | Full-suite/build outcome recorded honestly | BLOCKED | Full backend collection fails due missing `bcrypt`; frontend build fails because `next` is not installed. |
| C2-13 | Live service checked against source | BLOCKED | Cannot import app/serve endpoints in current environment; `SECRET_KEY` also required. Runtime verification remains outstanding. |
| C2-14 | Visual-reference-first rule for frontend changes | PASS (no frontend edits) | No frontend source was modified; export defects remain open rather than bypassing the rule. |

## 4. Findings and changes

### F-001 — Study-area metadata parity
- Severity: P1
- File: `backend/app/api/digital_twin_router.py`, `STUDY_AREAS_METADATA`
- Before: `mumbai_bkc` omitted configured projected CRS, bbox CRS, grid coordinate CRS, nominal resolution, and resolution note.
- Change: added values consistent with `STUDY_AREA_CONFIGS`; geographic bbox/grid remain EPSG:4326 and configured projected CRS remains EPSG:32643.
- Test: `test_study_area_public_metadata_has_crs_and_resolution_parity`.

### F-002 — Inspection was hard-wired to 50×50
- Severity: P1
- File: `backend/app/api/digital_twin_router.py`, `inspect_cell`
- Before: indices capped at 49 and inspection always regenerated a 50×50 grid.
- Change: added `rows` and `cols` query parameters (10–100, defaults 50), validate row/column against requested grid dimensions, generate that exact grid, and return grid metadata plus coverage support/provenance.
- Compatibility: callers omitting rows/cols continue to receive 50×50 behavior.
- Verification limitation: API router cannot be imported in this environment because `bcrypt` is absent; route behavior needs runtime confirmation.

### F-003 — Thermal simulation ignored requested grid dimensions
- Severity: P1
- File: `backend/app/api/thermal_router.py`; `backend/app/schemas/schemas.py`, `PhysicsSimulationRequest`
- Before: route generated 40×40 irrespective of request; schema permitted up to 1000×1000 while the Digital Twin endpoint supports 10–100.
- Change: thermal route now passes `req.rows` and `req.cols`; schema range is aligned to 10–100. Response provenance includes the actual grid shape, CRS, nominal target, and effective spacing.
- Important semantic limitation: `grid_resolution_m` remains a nominal target and does not drive reprojection/resampling. Effective spacing is determined by extent and requested dimensions. This is explicitly described rather than falsely claiming true 10 m cells.

### F-004 — Grid response invariants were under-specified
- Severity: P1/P2
- File: `backend/app/schemas/schemas.py`
- Change: bbox must be four finite values with `west < east` and `south < north`; resolution fields must be finite/positive; `total_cells` must equal `rows * cols`; all required layer arrays must match metadata dimensions and contain finite values; coverage mask must be binary.
- Tests: malformed bbox, wrong total cell count, multi-size layer shapes and binary mask.

### F-005 — GeoJSON CRS/geometry and fixed area assumptions remain
- Severity: P1
- Files: `frontend/src/lib/api.ts`, `frontend/src/app/reports/page.tsx`
- Status: FAIL / not modified.
- Reason: requires frontend export logic work with a dedicated reference artifact and browser-level verification; no valid frontend runtime/build was available (`next: not found`). Must be resolved before C2 can pass.

## 5. Verification ledger

| Check | Command | Result | Limitation |
|---|---|---|---|
| Focused C2 + existing grid/validation tests | `PYTHONPATH=backend pytest -q backend/tests/test_c2_grid_contract.py backend/tests/test_grid_integrity.py backend/tests/test_validation_evaluator_unit.py` | PASS — 15 passed | Does not import the full API app; router behavior still requires runtime test. |
| Python compile | `python -m compileall -q backend/app backend/tests` | PASS, exit 0 | Syntax/bytecode compilation only. |
| Full backend tests | `SECRET_KEY=<test-only value> PYTHONPATH=backend pytest -q backend/tests` | BLOCKED, exit 2 | Collection fails because `bcrypt` is not installed. Test-only secret was not saved to project files. |
| API TestClient smoke | attempted with app import | BLOCKED | First blocked by missing `SECRET_KEY`; with a test-only key, import is blocked by missing `bcrypt`. |
| Frontend production build | `npm run build` in `frontend/` | BLOCKED, exit 127 | `next: not found`; no dependency installation performed. |
| Git diff whitespace check | N/A (archive has no `.git`) | NOT RUN | Unified diff reviewed instead; source ZIP has no Git metadata. |
| Docker/live API | Not run | NOT VERIFIED | No successful live service available in this environment. |
| Browser screenshots | Not run | NOT VERIFIED | No UI source changed; frontend export work remains open. |

## 6. Rollback and artifacts

- Baseline archive SHA-256: `7671d3a5cfa0fb2480edfcf733dc4775efc1f6cfa4188756bf5df32e06fdc92a`
- Rollback: restore the untouched original archive or reverse-apply the supplied unified patch against the same source version.
- Output package excludes test caches and Python bytecode caches.
- See external patch, test logs, output archive and SHA-256 manifest delivered alongside this project.

## 7. Deferred work (not silently implemented)

- C3: authoritative simulation pipeline, immutable run/result identity and shared state.
- C4: heat visualization redesign; visual-reference-first workflow mandatory.
- C5: optimizer objective/weight/constraint semantics.
- C6: persistent run IDs and report/export linkage.
- C7: full application security, release and deployment verification.
- C2 still open: frontend GeoJSON CRS and selected-area geometry; fixed area assumption; live API verification; full backend suite and frontend build.

## 8. Final gate

**Final C2 status: PARTIAL — NOT CLOSED.**

**C3 recommendation: DO NOT START.** The backend grid contract has been improved and focused tests pass, but export correctness and complete application verification remain unresolved. No waiver was supplied by the user.

## Spatial-data acquisition addendum — 2026-10-25

- **Scope:** dataset provenance and acquisition preparation only. The existing GeoJSON exporter, fixed-area formulas, frontend, optimizer objectives, and simulation pipeline were not changed in this addendum.
- **Finding:** the bundled `backend/app/spatial/data/*_geo.json` collections have small curated feature counts but no stable source IDs or acquisition metadata, and `dataset/raw/` / `dataset/processed/` contain placeholders rather than a verified real-world spatial snapshot. Several existing handlers in `dataset/download_datasets.py` are stubs, and `--generate-sample-rasters` generates synthetic values.
- **Added:** `dataset/download_study_area_vectors.py`, `dataset/validate_spatial_data.py`, `dataset/generate_analysis_windows.py`, `dataset/requirements-spatial.txt`, the spatial source README/manifests/inventory, the five-feature `analysis_windows_not_official_boundaries.geojson`, offline unit tests, and `remediation/SPATIAL_DATA_ACQUISITION_REPORT.md`.
- **Verification:** offline spatial tooling tests: 11 passed; Python compilation passed; download CLI help passed. A mocked acquisition test verifies OSM IDs/tags/provenance are retained and that source geometry is preserved separately from a clipped analysis-window copy. This is a unit/mocked integration test, **not** a live OSM query.
- **Live-source status:** NOT DOWNLOADED / BLOCKED in this execution because direct outbound DNS requests failed and the live Overpass extraction attempt timed out. No synthetic OSM data were substituted. The acquisition utility records source failures and does not fabricate an output when a query returns no usable data.
- **Use:** run `python -m pip install -r dataset/requirements-spatial.txt`, then `python dataset/download_study_area_vectors.py --areas all`, then `python dataset/validate_spatial_data.py` from the project root in a network-enabled environment. Preserve the resulting raw snapshot and `dataset/raw/vector/osm/manifest.json` as the C2 evidence baseline.
- **Current decision:** C2 remains PARTIAL. The three outstanding CRS/export geometry/area-accounting fixes remain open. The static analysis-window GeoJSON is explicitly a bbox-derived analysis extent—not a real municipal boundary. C3 remains on hold.
