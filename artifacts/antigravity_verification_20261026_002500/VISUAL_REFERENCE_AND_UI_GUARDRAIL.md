# UrbanCoolSim C2 Frontend / UI Change Guardrail Record

## 1. Scope and Justification
This change implements the C2 acceptance gates for frontend GeoJSON export and area accounting:
- **C2-07**: RFC 7946 GeoJSON compliance (remove legacy `crs` member; enforce WGS 84 `[longitude, latitude]` order).
- **C2-08**: Selected-area export geometry consistency (export geometry situated within the selected study area's bounding box and centered around its coordinates, instead of hard-coded Delhi CP coordinates across all cities).
- **C2-09**: Area accounting derivation (derive `land_area_m2` dynamically from loaded `gridData` metadata, falling back to nominal dimensions only when metadata is absent, and labeling outputs as illustrative zoning blueprints).

## 2. Screen and Interaction States
- **Target Screen**: `/reports` (`frontend/src/app/reports/page.tsx`), calling `exportInterventionsToGeoJSON` in `frontend/src/lib/api.ts`.
- **Pre-change Behavior**:
  - The "Export GeoJSON Blueprint" action downloads a file containing a legacy `crs` member specifying `EPSG:32643`, but emits longitude/latitude coordinates.
  - The coordinates are fixed near Connaught Place, New Delhi (`77.215, 28.630`) regardless of whether the user selected Mumbai, Singapore, Phoenix, or Tokyo.
  - The default solution passes a fixed `land_area_m2: 250000` regardless of the study area's actual dimensions.
- **Post-change Behavior**:
  - The exported GeoJSON strictly adheres to RFC 7946: no `crs` member, true WGS 84 coordinates in `[longitude, latitude]` order.
  - Geometry is anchored dynamically within the selected study area's bounding box around its configured center.
  - Feature properties explicitly identify `study_area_id`, `study_area_name`, `coordinate_order: "[longitude, latitude]"`, `is_illustrative_blueprint: true`, and `provenance: "illustrative_mitigation_blueprint"`.
  - Default solution `land_area_m2` is derived from `gridData.metadata.effective_resolution_x_m * effective_resolution_y_m * total_cells` when available.

## 3. Visual Artifacts
- **Mockup Reference**: `screenshots/reports_reference_mockup.jpg`
- **Baseline Screenshot (Pre-change)**: `screenshots/reports_page_baseline.png`
- **Verification Screenshot (Post-change)**: will be captured via browser automation upon build and verified.
