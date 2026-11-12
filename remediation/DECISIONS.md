# UrbanCoolSim Engineering Decisions

## 2026-10-24 — C1: Validation page provenance

- The existing `/api/v1/validation/run` route compares a baseline simulation field against that same field perturbed by seeded Gaussian noise. It is an internal self-consistency check, not independent satellite validation.
- The validation screen must not label this result as empirical Landsat/ECOSTRESS ground truth or use hardcoded high-accuracy defaults when the API request fails.
- The chart must only plot points returned by the API. The evaluator now returns at most 100 deterministic samples and includes grid row/column provenance.
- The response includes `independent_observations_used: false` to let the UI express the limitation directly.
- Full backend/API and frontend build verification remains pending dependency installation. Do not mark this checkpoint fully verified until those commands and a browser smoke test pass.

## 2026-10-24 — C2: Spatial grid and API contract

- The uploaded `/api/v1/digital-twin/grid?study_area_id=delhi_cp&rows=50&cols=50` response is from an older/different backend state than this working copy. It reports `crs=EPSG:32643` while `bbox` values are longitude/latitude, says `resolution_m=10` for a grid whose extent implies roughly 26 m cell spacing, says `is_synthetic=false`, lacks a support mask, and caps 83.92% of baseline temperatures at exactly 53.5°C.
- The current spatial engine now reports `crs`, `bbox_crs`, and `grid_coordinate_crs` as EPSG:4326 for the returned coordinate values, retains EPSG:32643 separately as the configured projected CRS, reports effective and nominal resolution separately, labels modeled temperatures as not satellite-observed, and includes `modelled_coverage_mask`.
- The baseline temperature layer is no longer hard-clamped at 53.5°C. Feature-supported cells are deterministically generated, and proxy population/waste-heat noise is restricted to supported built/road activity.
- Public study-area and grid endpoints now have explicit Pydantic response schemas. Unknown study-area identifiers and cell indices outside the 50x50 inspection grid are rejected rather than silently returning a default area/cell.
- Brutsaert atmospheric emissivity uses vapor pressure in hPa rather than Pa. A focused regression test checks physically plausible emissivity.
- No new frontend UI code was changed in C2. Future heat-map UI changes must follow the agreed sequence: produce an accurate visual reference first, then implement against it, then visually and functionally verify.
- Effective 50x50 grid spacing is around 26–30 m depending on the configured geographic extent. It is not a true 10 m raster. A later decision is required: keep the current extent and disclose effective resolution, or increase grid dimensions/use a projected 10 m grid to preserve a real 10 m claim.
