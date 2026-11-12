# UrbanCoolSim — Major Remediation Roadmap

**Prepared:** 24 October 2026
**Inputs reviewed:** `UrbanCoolSim-clean.zip`, `UrbanCoolSim_Project_Audit.md`, the frontend screenshots shared in this conversation, and source-level inspection of the relevant frontend files.
**Purpose:** define the highest-impact corrections, execution order, checkpoints, and acceptance criteria before modifying the application.

> **Scope note:** This is an implementation plan based on static code inspection and screenshots. The supplied frontend production build and complete backend test suite were not verified successfully in the audit environment. Findings marked “confirmed in source” should still be retested in a controlled runtime before release.

---

## 1. Executive decision

Do not begin with scattered CSS tweaks or a complete rewrite. UrbanCoolSim has a useful structure—Next.js pages, FastAPI routers, a surface-energy-balance solver, a LightGBM surrogate, NSGA-II optimization, geospatial code, and reporting—but the largest risks are **mismatches between what the UI claims, what the frontend computes, and what the backend/data actually provide**.

Use **8 major workstreams, delivered through 8 gated checkpoints**, in this order:

1. Secure and freeze a reproducible baseline.
2. Establish a truthful data-provenance and metric contract.
3. Correct spatial CRS, bounds, cell size, and area assumptions.
4. Create one authoritative simulation-result pipeline and shared state.
5. Rebuild the heat visualisations and Digital Twin layer design.
6. Align optimization objectives and constraints with their UI.
7. Persist runs and make reports/exports derive from the selected run.
8. Add automated verification, harden deployment, and release only when gates pass.

**Order matters:** making a synthetic temperature field look more realistic before correcting its source and metadata would make the application more visually convincing without making it more trustworthy.

## 2. Highest-impact problems

| Priority | Major problem | Evidence from the inspected files/screens | Why it matters | Main correction |
|---|---|---|---|---|
| P0 | Secrets and a working database are bundled | Root and backend `.env` files are present; `urbancoolsim.db` contains user and application records | Credentials and user records should not travel with source archives | Rotate any real/reusable secrets, remove `.env` files and private DB from releases, supply `.env.example`, seed a clean demo DB |
| P1 | Satellite validation is overstated | Validation API creates an observed-like series by adding seeded random noise to simulation temperatures; the UI presents empirical ground-truth messaging and fixed fallback metrics | Users may believe metrics prove real-world accuracy when they do not | Label current mode as synthetic self-consistency; show empirical metrics only after independent observed data is actually ingested and matched |
| P1 | The heat field is a visual demo rather than the backend simulation | Intervention Studio draws a 50×50 canvas from grid layers and local formulas; it claims “Surrogate (1.8ms)” without calling the surrogate inference path in that page | The visualization can diverge from the physics solver and misrepresent intervention impacts | Render the authoritative backend baseline/scenario/delta arrays, or label a temporary local preview as illustrative |
| P1 | Grid geometry and spatial metadata conflict | Audit found geographic coordinate sampling mixed with projected CRS metadata, an advertised 10 m resolution that does not match the sampled bounds, and fixed 250,000 m² cost assumptions | Wrong area, wrong cell sizes, misplaced features and invalid GIS exports | Define one CRS/bounds/resolution contract and test every city against it |
| P1 | Optimization UI claims five objectives while code optimizes three | `backend/app/optimization/pareto_optimizer.py` optimizes cooling, cost and water; population/energy metrics are computed separately | Pareto results and “priority weights” can promise an optimization that did not occur | Implement all five objectives correctly or change the UI to accurately present three |
| P1 | Different pages can show unrelated results | Intervention Studio and Scenario Lab have client-side calculations/previews; API client has plausible fallback data; validation does not forward selected area | Dashboard, map, scenario, validation and report can disagree without explaining why | Create run IDs and a shared result contract; every page should reference the same selected study area, scenario and run |
| P1 | Data ingestion is not the active source for the main map path | `dataset/raw/` has no actual satellite raster set; raster-pipeline functions are not called from the inspected analysis API paths; the active grid comes from small GeoJSON assets plus generated values | “Satellite-integrated 10 m twin” is not established by the supplied bundle | Choose an explicitly labelled demo mode or complete ingestion and independent validation before claiming observed-data operation |
| P2 | Reports and exports are not reliably tied to a run | Report flow does not pass full scenario/optimization/validation context; thermal runs are not persisted as `SimulationResult`; GeoJSON export uses fixed Delhi geometry/CRS assumptions | Downloaded artefacts may not represent the scenario currently shown | Persist run context; export from stored result geometry, correct CRS, and recorded input versions |
| P2 | Build/test enforcement is weak or unverified | Next config ignores TypeScript and ESLint build errors; frontend dependencies are absent in audit environment; backend test collection was blocked by missing dependencies | Regression-prone changes can ship without reliable checks | Restore build checks and run CI on pinned dependencies |
| P2 | Auth/job infrastructure is only partially integrated | Backend auth exists but frontend API client has no full login/authorization workflow; jobs table/status API exist but inspected solver runs synchronously | Data ownership, long-running work and UI status messages are unclear | Decide public/private route policy; enforce ownership; either implement jobs end-to-end or remove job-based claims |

### Additional cross-screen inconsistencies to resolve

- The screenshots show different temperature baselines and cooling figures (for example, 44.5°C, 48.5°C and 65.5°C in different widgets/pages). Some differences could be legitimate “mean vs peak” or “different scenario” values; the UI currently needs explicit metric definitions, source and run linkage to prove that.
- The screenshots show different validation R² values (for example, 0.973 and 0.955); the simulation-results page also shows a LightGBM R² of 0.962. Those are not interchangeable metrics. Each needs a label defining the evaluation target and dataset.
- The optimization weight controls shown total 91%. Decide whether weights must sum to 100%, automatically normalize, or permit an unallocated remainder—and show the chosen behavior explicitly.
- The map source code includes a MODIS Terra daily LST GIBS layer for the low-zoom/global context. It must not be presented as Landsat data or as a genuine 10 m observed raster. Show the correct sensor, date, native resolution, and source for each layer.
- The frontend build currently suppresses TypeScript and ESLint failures. Re-enable checks once existing issues are cleaned up.

---

## 3. Implementation flow

```text
START
  ↓
Checkpoint 0 — secure archive, branch, baseline and known issues
  ↓
Checkpoint 1 — define provenance, units and metric meanings
  ↓
Checkpoint 2 — fix CRS, bounds, grid resolution and study-area area
  ↓
Checkpoint 3 — make one backend simulation path authoritative
  ↓
Checkpoint 4 — redesign Intervention Studio + Digital Twin heat layers
  ↓
Checkpoint 5 — align NSGA-II objectives, weights and constraints
  ↓
Checkpoint 6 — persist run IDs; connect dashboard, charts, exports and reports
  ↓
Checkpoint 7 — tests, security, build/CI and release validation
  ↓
RELEASE CANDIDATE
```

**Gate rule:** do not declare a checkpoint complete based only on a changed screen. It must pass its acceptance criteria, including relevant automated tests.

## 4. Checkpoints with concrete acceptance criteria

### Checkpoint 0 — Secure and establish a reproducible baseline

**Files/areas:** `.env`, `backend/.env`, `.env.example`, `urbancoolsim.db`, Docker configuration, `frontend/next.config.js`, test/dependency setup.

**Work:**
- Create a clean version-control branch/tag before edits so the baseline is recoverable.
- If any bundled secret is real or reusable, rotate it and invalidate affected tokens where appropriate. Do not copy secret values into issue trackers or this plan.
- Remove private environment files and real user/application records from distributable archives. Keep an `.env.example` with placeholders only.
- Decide whether a sanitized demo database should be seeded at startup or provided separately.
- Install pinned dependencies in a reproducible environment and record current failures before changing functionality.

**Pass when:** the archive contains no live secrets/private database; a new developer can configure the app from documented placeholder settings; the baseline build/test status is recorded without hiding failures.

### Checkpoint 1 — One truthful data and metric contract

**Introduce a provenance contract** that accompanies every dataset, layer, calculation, chart, and export. At minimum record:

- `source_type`: `observed`, `derived`, `simulated`, `predicted`, `optimized`, or `illustrative`;
- `source_name` and sensor/product where applicable;
- acquisition date/time or simulation timestamp;
- units; value semantics; CRS; stated/native resolution;
- `study_area_id`, `scenario_id`, and `run_id`;
- `is_synthetic` / `is_fallback`, with a human-readable reason;
- processing/version identifiers where feasible.

**Correct the validation page first:**
- Rename current noise-based comparison to **Synthetic Solver Self-Consistency** (or similar).
- Do not label its scores “Empirical Satellite Ground Truth”.
- Remove static fallback R²/MAE/RMSE values that look like real output. When no validation result exists, display “No validation run available”.
- Create a separate empirical validation mode that can only become available when the actual satellite observations, time/location matching, masking, units and processing metadata are present.

**Pass when:** every main result tells the user whether it is observed, modelled, synthetic, predicted or optimized; no fallback metric can be mistaken for a measured score; empirical validation cannot run on synthetic values unnoticed.

### Checkpoint 2 — Spatial contract: CRS, bounds, grid resolution and area

**Primary files:** `backend/app/spatial/geo_digital_twin.py`, `backend/app/spatial/raster_pipeline.py`, `backend/app/api/digital_twin_router.py`, `backend/app/interventions/engine.py`, `frontend/src/lib/api.ts`, `frontend/src/lib/studyAreaBoundaries.ts`, GeoJSON export code in `frontend/src/app/reports/page.tsx` / relevant API utility.

**Decide one explicit rule per study area:**
- Store GeoJSON boundary/source coordinates as WGS84 (`EPSG:4326`) where appropriate.
- Reproject into the area’s correct local projected CRS before calculating metres, areas, buffers, or 10 m cell grids.
- Pick correct grid bounds and resolution, and calculate rows/columns from those bounds. Do not independently hardcode rows, columns, resolution and area.
- Ensure `rows × cols × cell_area` agrees with the modeled spatial extent (allowing a documented boundary mask/partial edge cells).
- Make intervention costs and annual water use derive from the modeled eligible roof/ground area, not a separate assumed 250,000 m² unless the study-area configuration explicitly says so.
- Export GeoJSON in the correct declared CRS/coordinate convention. Standard GeoJSON coordinates should not be marked as UTM metres while they still contain longitude/latitude degrees.
- Apply the selected study area to validation, optimisation, map inspection and report/export calls consistently.

**Pass when:** automated tests for all five study areas verify CRS, plausible extents, grid cell size, area and export round-trips. A 10 m label appears only if the source data/grid really supports that resolution.

### Checkpoint 3 — One authoritative simulation pipeline

**Primary files:** `backend/app/api/thermal_router.py`, `backend/app/physics/energy_balance.py`, `backend/app/interventions/engine.py`, `backend/app/ml/surrogate.py`, `frontend/src/lib/api.ts`, `frontend/src/app/intervention-studio/page.tsx`, `frontend/src/app/scenario-lab/page.tsx`, `frontend/src/app/thermal-analysis/page.tsx`.

**Target flow:**

```text
Selected study area + base data + intervention parameters + boundary conditions
      ↓ validate units/ranges and provenance
Grid/layer assembler
      ↓
SEB simulation (authoritative baseline and intervention outputs)
      ↓
Optional LightGBM surrogate proposal/acceleration
      ↓
Physics re-check with a documented residual rule
      ↓
Result bundle: baseline grid, scenario grid, delta grid, fluxes, summary, metadata
      ↓
Persist run + return run_id
      ↓
UI renders that exact result bundle
```

**Corrections:**
- Make Intervention Studio call the backend simulation/surrogate API rather than calculate its own `estimatedDeltaT` and cell cooling formula as the source of truth.
- Its current `handleSave()` only changes local “Saved” state; replace it with real scenario/strategy persistence and success/error handling.
- Make Scenario Lab compare backend-produced outputs for baseline and each intervention portfolio, not only client-created raster previews.
- Make the SEB route honor request rows/columns/resolution or remove the misleading unused parameters. Pass per-cell emissivity and anthropogenic heat if the model specification intends them to vary spatially.
- Treat a missing API response as an error state or clearly marked demo fixture; do not silently inject plausible-looking metrics in normal mode.
- Label surrogate timings as measured only when measured around the actual inference call. Do not advertise “1.8 ms” based on a fixed UI label.

**Pass when:** changing a slider produces an identifiable new run/result, every page can display its `run_id`, the same result values are consistent wherever used, and offline/API failure is visible rather than silently masked.

### Checkpoint 4 — Rebuild the heat visuals

This is the major visual redesign and should happen **after Checkpoints 1–3** so that the renderer uses correct, trustworthy data.

#### A. Intervention Studio: remove the full-bleed red square

**Current source:** `frontend/src/app/intervention-studio/page.tsx`.

The current canvas uses a 50×50 grid, maps `(cellScen - 30) / (50 - 30)` into a four-segment colour ramp, paints every pixel with alpha 255, and adds hard-coded radial/rectangular guide shapes. Many cells can saturate at the top red end if their temperature exceeds the chosen 50°C range. The panel is not a geographic map, and this page does not run the advertised surrogate inference path. That explains the solid, visually aggressive red panel in the screenshot.

**Preferred replacement:**
1. Use the same MapLibre-based spatial context/components as the Digital Twin, or a georeferenced raster viewer built for the actual study-area extent. Do not use an unreferenced square canvas as if it were spatial truth.
2. Provide three explicit views: **Baseline**, **Intervention**, and **Cooling Difference (ΔT)**. Make Cooling Difference the default when evaluating an intervention.
3. Render the backend’s actual grid/raster values. Clip to the real study-area boundary; mask no-data/outside-study cells; retain only real geometry outlines.
4. For absolute LST, use a perceptually ordered thermal ramp with a data-derived or documented fixed legend range. For delta, use a diverging palette centred at zero: neutral for no change, a cool hue for cooling, and a warm hue for warming.
5. Start with roughly 0.35–0.45 raster opacity over the basemap, then tune with realistic screenshots. Keep roads, buildings and landmarks legible. Never colour the entire raster opaque red by default.
6. Avoid implying new spatial detail by over-smoothing a coarse grid. If interpolation is used for display only, say so and preserve the native grid-resolution/quality indicator.
7. Add a compact legend with units, min/max, source type and timestamp. Tooltip/pick information should show cell value, cell size, source, and whether the value is observed or simulated.
8. Remove arbitrary decorative circles and blocks unless they correspond to actual GIS geometry. If study zones are real, load them as data layers and provide a toggle.
9. Preserve 2D/3D, opacity and grid controls, but make their effects consistent across views.

**Temporary fallback:** if the map integration must be staged, keep a small canvas but (a) use real aspect ratio and an accurate legend, (b) show a neutral/transparent mask for missing values, (c) use lower alpha, (d) clamp to a documented scale, (e) make baseline/scenario/delta selectable, and (f) mark the image **Illustrative preview** until it displays authoritative output.

#### B. Digital Twin: reduce the overpowering overlay

**Current source:** `frontend/src/components/DigitalTwinMap.tsx`.

The default `thermalOpacity` is `0.72`. The raster texture is upsampled four times and smoothed to hide cell edges. This can make a coloured overlay dominate the satellite basemap and make synthetic/coarse data look more precise than it is.

**Changes:**
- Lower the default opacity to approximately `0.35–0.45` as a starting point; keep the slider available.
- Make the raster boundary and no-data mask correct before tuning the feather edge.
- Display the exact source/sensor, timestamp, units, native resolution and provenance. The code’s global GIBS LST source is MODIS Terra daily daytime LST; do not present that tile as Landsat 8/9 or as 10 m data.
- Use a different colour scale for absolute temperature vs temperature delta; do not re-use a high-saturation ramp for all layer types.
- Make 2D/3D, study-area changes and scenario changes retain the selected layer without reusing a stale texture cache.
- Expose “native grid”/cell boundaries as an optional diagnostic, so smooth rendering cannot be confused with native resolution.

**Visual quality gate:** inspect a cool, moderate, and very hot scenario; each should retain basemap legibility, have no colour saturation across most of the area unless the underlying values truly justify it, clip cleanly to the boundary, and display a truthful legend. Test both 2D and 3D at normal desktop and laptop widths.

### Checkpoint 5 — Align optimization mathematics and its interface

**Primary file:** `backend/app/optimization/pareto_optimizer.py`; route/schema and `frontend/src/app/optimization/page.tsx` also need updates.

Choose one of two coherent options before coding:

**Option A — Keep the current three-objective NSGA-II:** show the true Pareto objectives as cooling, CapEx and water demand. Show population protection, HVAC savings, carbon and payback as post-optimization evaluation metrics, not as objectives being optimized. Adjust/remove weights that imply otherwise.

**Option B — Deliver the advertised five-objective optimizer:** implement well-defined, independently calculated objective functions for cooling benefit, CapEx, population protected, water demand, and HVAC energy savings. Population benefit must use actual spatial population/exposure inputs—not a proxy that mostly duplicates cooling. Define objective direction and normalization explicitly, and test it.

For either option:
- Normalize or validate priority weights. If weights are required to sum to 100%, enforce it or renormalize visibly; never silently use a 91% total without defined behavior.
- Ensure each displayed constraint is enforced in the normal NSGA-II search, not only in fallback candidate generation or metadata. Specifically verify the minimum roof reflectance, maximum tree-cover bound and target-cooling parameter.
- Re-evaluate finalists through the same grid-level SEB simulation and document what the “physics validation” residual actually measures.
- Ensure the selected candidate, recommended blueprint and applied-to-Twin state have the same solution/run ID.
- Make the Pareto plot axes, directions, units and bubble size agree with the actual objective values.

**Pass when:** tests prove every claimed objective affects fitness, every displayed constraint rejects violating candidates, and the recommended candidate can be reproduced from stored inputs/settings.

### Checkpoint 6 — Persistence, shared state, reports and exports

**Primary files:** `backend/app/api/thermal_router.py`, `backend/app/models/db_models.py`, `backend/app/api/reports_router.py`, `backend/app/api/jobs_router.py`, `frontend/src/lib/api.ts`, `frontend/src/app/reports/page.tsx`.

**Target data relationship:**

```text
StudyArea
  └─ Scenario (versioned intervention parameters)
       └─ SimulationRun (input snapshot + solver/model versions + result bundle)
            ├─ OptimizationRun (constraints, weights, Pareto solutions, selected candidate)
            ├─ ValidationRun (observed dataset + pairing/masks + metrics)
            └─ Report/Export (references exact simulation + optimization + validation IDs)
```

**Work:**
- Persist thermal simulations with unique run IDs and snapshots of input parameters, provenance, code/model version and output summaries/raster references.
- Persist strategies when Save Strategy is clicked; show pending/success/failure feedback based on the API response.
- Pass study-area, scenario and run IDs through every relevant page/API call. Validation must receive the selected area explicitly.
- Generate reports from stored run entities rather than default/fixed values. A report must state its exact source run and mark synthetic outputs.
- Build GeoJSON from the actual study-area/intervention geometry in the correct CRS, not hard-coded Delhi coordinates; ensure the exported coordinate convention matches the declared CRS.
- Export CSV with stable cell IDs, coordinates, units, source/provenance and scenario/run IDs.
- Decide whether jobs are really needed. If computation is synchronous and bounded, show a normal loading state. If long runs need background work, implement enqueue → queued/running/succeeded/failed states, persistence, worker execution, cancellation/timeouts, and polling. Do not keep a non-functional job layer solely for appearances.

**Pass when:** downloads reproduce the selected run, refresh/navigation do not change the result, and CSV/GeoJSON/PDF metadata all agree on study area, scenario, run ID, values and provenance.

### Checkpoint 7 — Verification, security, deployment and release

**Frontend:**
- Re-enable TypeScript and ESLint build errors in `frontend/next.config.js` after fixing them.
- Run lint, type checks, unit tests and a production Next.js build on clean install.
- Add component/interaction tests for map layer toggles, slider changes, loading/error/empty states, scenario switching, map legend, save state and exports.

**Backend:**
- Install pinned requirements in CI; run test suite without hidden dependency gaps.
- Add tests for solver bounds/finite values, energy balance residuals, CRS conversion, cell size, area, per-cell fields, optimizer objectives/constraints, validation provenance, run persistence and export contents.
- Add a deterministic integration path covering: choose area → change intervention → run simulation → run optimization → apply candidate → create report/export.

**Security and operations:**
- Define which endpoints are public vs authenticated.
- Add owner checks for saved scenarios, reports and runs; apply consistent access rules to report download and job status.
- Prevent expensive training from occurring implicitly inside a prediction request; make training an explicit admin/job action and rate-limit inference/explanation.
- Replace per-process rate limiting if deploying multiple workers/instances; use a shared limiter where needed.
- Add versioned DB migrations (e.g., Alembic), health checks, clean startup docs, and a sanitized demo-data setup.

**Pass when:** clean CI passes, no route serves another user’s private report/run, the end-to-end scenario integration test passes, and every visible scientific claim is backed by a source or clearly marked illustrative.

---

## 5. Frontend redesign: what to keep and what to simplify

The present dark, compact, blue-accent visual language is coherent. Keep the general theme, left icon navigation, data cards, and technical typography. The main problem is not the overall visual identity; it is visual hierarchy, oversized/high-opacity heat rendering, and the way metrics are presented without clear provenance.

### Global UI rules

- Each metric card should expose the **metric name, value, unit, context (mean/peak/total), source/status and selected run** where relevant.
- Use one consistent unit format and locale/currency per study area. Clarify USD vs local currency instead of mixing an international presentation with city-specific financial estimates.
- Use one shared scenario/study-area selection across all pages. Show a visible “unsaved changes / last run” state when controls have changed since the selected run.
- Standardize loading, empty, error and fallback states. Avoid realistic-looking placeholder numbers during API failure.
- Give observed, simulated, surrogate-predicted and optimized outputs visually distinct labels that are not conveyed by color alone.
- Reduce unnecessary saturation. Reserve red for high-temperature values or critical alerts, not large decorative background fills. Ensure a user can read the basemap/landmarks below an overlay.
- Make the overview a summary of a single run, with clear routes into: map inspection → intervention design → optimization → results/validation → report/export.

### Recommended user journey

```text
Overview (select area / see current run)
  → Digital Twin (inspect baseline layer and cell provenance)
  → Intervention Studio (change parameters; preview baseline vs scenario vs delta)
  → Run Simulation (receive run ID and authoritative result)
  → Optimization (optional; generate/select Pareto solution)
  → Apply to Twin (create a new scenario/run, never silently overwrite history)
  → Simulation Results (same run ID: diurnal, fluxes, ROI and attribution)
  → Validation (clearly separate synthetic check from observed-data validation)
  → Decision Reports (PDF, CSV and GeoJSON from the exact selected run)
```

---

## 6. Definition of done for the overall project

Do not call the project “finished” merely because all pages load. The release candidate must satisfy all of the following:

1. **Truthful provenance:** no synthetic/fallback value is presented as observed satellite ground truth.
2. **Spatial correctness:** the declared CRS, grid resolution, grid extent, cell area and intervention area agree.
3. **Single source of truth:** a simulation run can be traced from input parameters to API output, stored record, map, charts and exports.
4. **Thermal legibility:** heat layers do not obscure geography, have correct units/legend/masks, and do not visually imply finer resolution than exists.
5. **Optimizer integrity:** displayed objective count, weights and constraints match the executed algorithm.
6. **Report reproducibility:** reports and exports identify and reproduce the exact run and scenario.
7. **Quality gates:** backend tests, frontend type/lint checks and production build pass in a clean environment.
8. **Security:** no live secrets/private working database in distributable archives, and owner-level access checks protect saved outputs.

## 7. What not to do yet

- Do not redesign the whole UI before fixing the result/provenance contract.
- Do not add more AI models to compensate for inconsistent data or unclear objectives.
- Do not call interpolation “10 m resolution” unless the source/grid supports that resolution.
- Do not display fixed R²/MAE values as if they came from a live validation run.
- Do not use the prettier heatmap as proof that the simulation is more accurate.
- Do not rewrite everything into a new framework. Correct the authoritative data flow and the few components that currently bypass it first.

## 8. Recommended first implementation sprint

The very first sprint should finish Checkpoints 0 and 1 and establish the start of Checkpoint 2:

1. Sanitize secrets/database distribution and create a clean reproducible branch.
2. Add provenance/source fields to the API response model and frontend data types.
3. Remove misleading empirical fallback metrics from Validation & Truth; explicitly label synthetic self-consistency.
4. Add a visible `demo / synthetic / observed` indicator to the Digital Twin and result pages.
5. Write CRS/grid-size/unit tests and document the intended 10 m extent for each study area.

Only after these pass should the full heat-map redesign proceed. That sequencing prevents investing time polishing a thermal display that is still rendering the wrong or unverified values.
