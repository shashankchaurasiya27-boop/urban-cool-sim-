# UrbanCoolSim Antigravity Changelog — C2 Remediation & Final Closure

> [!NOTE]
> This changelog records code and configuration changes performed during the C2 Spatial, Dependency, and Review Gap Remediation pass. This is **not** a blanket production-readiness certification; it verifies and resolves the C2 spatial contracts, dependencies, and environment blockers.

---

## Summary of Changes

| File | Change Category | Rationale | Associated Verification Tests |
|---|---|---|---|
| `backend/app/spatial/geo_digital_twin.py` | Item 1: Live OSM Ingestion & Digital Twin Coupling | Connected digital twin directly to live Overpass OSM vectors in `dataset/processed/spatial_vectors/` (941–6,333 features/city) instead of old 10–29 curated files; mapped `feature_class` & `osm_tags` into `building`, `transport`, `green_space`, `water`, `landuse`; implemented coordinate bounding-box rasterization acceleration; extracted live 3D building extrusions; exposed `nominal_resolution_m` vs `effective_resolution_m` and provenance disclosures. | `test_digital_twin_actively_loads_live_acquired_osm_features` (all 5 cities), `test_nominal_vs_effective_resolution_distinction`, `test_geo_digital_twin_engine_rasterization` |
| `backend/app/schemas/schemas.py` | Item 2: HTTP 422 Enforced & Schema Validation | Defined `StudyAreaId = Literal[...]` to reject invalid study area IDs at API boundary with HTTP 422; added `study_area_id`, `district_area_m2`, `building_footprint_m2` to `OptimizationResponse`; moved `validate_layer_dimensions` to `DigitalTwinGridResponse`. | `test_optimization_endpoint_rejects_unsupported_study_area_with_422`, `test_grid_dimensions_and_all_layer_shapes_follow_requested_contract` |
| `backend/app/api/optimization_router.py` | Item 2: Optimization Response Enriched | Passed `study_area_id`, `district_area_m2`, and `building_footprint_m2` through the API response router. | `test_optimization_endpoint_rejects_unsupported_study_area_with_422`, `api_smoke_check.py` |
| `backend/app/optimization/pareto_optimizer.py` | Item 2: Removal of Fixed-Area & Delhi Fallbacks | Replaced hardcoded `total_district_m2 = 250000.0` and `bldg_footprint_m2 = 112500.0` with dynamic area calculation from `STUDY_AREA_CONFIGS[study_area_id]` bbox (geodesic distance in meters); raised `ValueError` on unsupported area IDs rather than silently defaulting to Delhi climate; disallowed `None` or default fallback in `UrbanCoolingOptimizationProblem`. | `test_optimizer_derives_district_area_from_study_area_config` (all 5 areas), `test_optimizer_raises_value_error_without_silent_delhi_fallback` |
| `backend/app/interventions/engine.py` | Item 2: Explicit Area Requirement | Required `study_area_m2` in `calculate_resource_budget()`; raises `ValueError` if missing or non-positive, eliminating 250,000 default. | `test_intervention_engine_requires_explicit_study_area_m2` |
| `frontend/src/app/reports/page.tsx` | Item 2 & 3: Dynamic Area from BBox & Percentage Units | Replaced the remaining `: 250000` fallback by dynamically deriving `studyAreaBboxAreaM2` from `STUDY_AREA_BBOXES` coordinates; normalized default solution values to 0–100% scale (35.0, 25.0, 20.0, 5.0) matching optimizer outputs. | `scripts/test_geojson_export.py`, Next.js production build (`npm run build`) |
| `frontend/src/lib/api.ts` | Item 3: RFC 7946 & Export Percentage Standardization | Eliminated forbidden legacy `crs` member; dynamically derived geometry centered on active study area; normalized coverage percentages to 0–100% scale and emitted explicit `coverage_unit: "percent (0-100)"`. | `scripts/test_geojson_export.py` (verifies all 5 study areas) |
| `frontend/src/app/optimization/page.tsx` | Selected Study Area Export Binding | Passed active `studyArea` and structured filename to `exportInterventionsToGeoJSON`. | Next.js production build (`npm run build`) |
| `frontend/package.json` | Item 4: Linting Dependency Resolution | Added `eslint@^8.57.0` and `eslint-config-next@14.2.35` to `devDependencies` to allow `npm run lint` to execute in CI/CD. | `npm run lint --prefix frontend` (exit status 0) |
| `frontend/src/app/methodology/page.tsx` | Item 4: React JSX Syntax Hygiene | Fixed unescaped apostrophe (`page&apos;s`) that triggered ESLint warning/error. | `npm run lint --prefix frontend`, `npm run build` |
| `backend/tests/test_c2_grid_contract.py` | C2 Contract & Regression Suite | Added regression tests verifying live OSM loading across all 5 cities, HTTP 422 rejection, elimination of Delhi fallback, dynamic district area calculation, explicit study area requirement, and nominal vs effective resolution distinction. | `pytest -q backend/tests/test_c2_grid_contract.py` (24 passed) |
| `backend/tests/test_backend.py` | Digital Twin Building Extrusion Parity | Updated building extrusion test assertions to match live OSM feature counts (>=100 real buildings in BKC) and Polygon/MultiPolygon geometry types. | `pytest -q backend/tests/test_backend.py` (11 passed) |
| `scripts/test_geojson_export.py` | GeoJSON Export & Units Regression Test | Automated test verifying RFC 7946 compliance, active bounding box coordinates, and percentage unit scale (`coverage_unit == 'percent (0-100)'`). | Direct CLI execution via Python 3.11 |

---

## Detailed Item-by-Item Remediation Ledger

### Item 1: Connect Newly Acquired OSM Data to Actual Digital Twin
- **Root Cause**: `geo_digital_twin.py` was hardcoded to read `{study_area_id}_geo.json` in `backend/app/spatial/data/` containing only 10–29 curated features.
- **Fix**: Added `OSM_PROCESSED_DIR` pointing to `dataset/processed/spatial_vectors/`. Implemented `normalize_spatial_feature()` to map `feature_class` (`building`, `transport`, `green_space`, `water`, `landuse`) and `osm_tags` to rasterizer properties with building height fallback logic (default 22.0m when height is missing or '0').
- **Optimization**: Added coordinate bounding-box pre-filtering for cell rasterization, accelerating vector processing from 15+ seconds down to <0.25s per grid generation.
- **Provenance Disclosed**: Digital twin metadata explicitly discloses `active_data_source: "live_osm_acquired"`, `source_file`, `vector_feature_count`, `features_by_class`, and `data_license: "ODbL-1.0 (© OpenStreetMap contributors)"`.

### Item 2: Remove Remaining Fixed-Area Fallbacks & Enforce HTTP 422
- **Root Cause**: `pareto_optimizer.py` used `total_district_m2 = 250000.0`, `reports/page.tsx` had `derivedArea || 250000`, and `InterventionEngine.calculate_resource_budget` defaulted `study_area_m2 = 250000.0`. Unsupported study areas silently fell back to Delhi climate.
- **Fix**:
  1. Enforced `StudyAreaId = Literal[...]` on `OptimizationRequest.study_area_id`, causing FastAPI to reject invalid IDs with `HTTP 422 Unprocessable Entity`.
  2. Raised `ValueError` in `run_multi_objective_optimization` if `study_area_id` is unsupported.
  3. Derived `total_district_m2` and `bldg_footprint_m2` directly from `STUDY_AREA_CONFIGS[study_area_id]` bounding boxes.
  4. Added `STUDY_AREA_BBOXES` to `reports/page.tsx` to dynamically derive extent area when `gridData` is unavailable, completely eliminating `250000`.
  5. Required explicit `study_area_m2` in `InterventionEngine.calculate_resource_budget()`.

### Item 3: Spatial-Resolution & Export Percentage Units Standardization
- **Root Cause**: Target resolution (10m) was conflated with effective cell spacing on arbitrary grid sizes (e.g. 40x40 grid on Singapore yields 38.95m x 37.29m). In `reports/page.tsx`, fallback solution specified fractions (`0.35`) while optimizer emitted percentages (`35.0`), creating ambiguity in GeoJSON export properties.
- **Fix**:
  1. Maintained clear distinction: `nominal_resolution_m` (10.0m target) vs `effective_resolution_x_m` / `effective_resolution_y_m` with descriptive `resolution_note`.
  2. Standardized all intervention coverage values to 0–100% scale in `reports/page.tsx`.
  3. Updated `generateInterventionsGeoJSON()` in `api.ts` to normalize input values to 0–100% and emit explicit `coverage_unit: "percent (0-100)"` on every exported GeoJSON feature.

### Item 4: Release Hygiene & Security Audit Triage
- **ESLint Resolution**: Installed `eslint@^8.57.0` and `eslint-config-next@14.2.35`. Fixed unescaped apostrophe in `methodology/page.tsx`. `npm run lint --prefix frontend` now exits with status 0 (0 errors).
- **Security Audit Triage**:
  - `maplibre-gl <= 6.4.0` (critical): XSS in `DOM.sanitize()`. MapLibre 4.1.0 is required by `@deck.gl/mapbox 9.3.10`. In UrbanCoolSim, no untrusted user HTML is rendered into MapLibre popup DOM nodes. Upgrading to 6.x is a breaking change for deck.gl v9. Documented as an acceptable upstream framework constraint.
  - `next 14.2.35` (critical): Next.js Image Optimizer DoS / Server Actions advisories. UrbanCoolSim runs as an exported/pre-rendered SPA without remote image optimizer patterns or Edge Server Actions. Upgrading to Next 15+ would require React 19, which breaks `@deck.gl` and `three.js`. Documented mitigation: Nginx reverse proxy rate limiting and standard CSP headers.
