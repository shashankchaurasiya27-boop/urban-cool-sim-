# UrbanCoolSim — Spatial Data Provenance Audit and Acquisition Plan

**Scope:** read-only inventory of existing spatial datasets plus addition of an acquisition/validation utility only. This work does not modify the C2 GeoJSON exporter, area formulas, backend runtime feature-serving logic, frontend, optimizer, or simulation architecture.

## Executive finding

**Status: DATA SOURCE GAP CONFIRMED; ACQUISITION UTILITY PREPARED; REAL OSM FILES NOT DOWNLOADED IN THIS EXECUTION.**

The uploaded archive does not already contain a provenance-verified real spatial dataset covering all five configured study areas. It contains five small curated GeoJSON `FeatureCollection`s in `backend/app/spatial/data/` (29 Delhi features, 28 Mumbai, 12 Singapore, 10 Phoenix, 10 Tokyo in the uploaded source snapshot). Their features are named examples and carry modeled properties such as `veg_fraction`, `canopy_height`, `albedo`, `height`, and `width_m`, but the inspected records have no stable OSM IDs, source URLs, retrieval timestamps, or feature-level provenance fields. They cannot be reliably treated as a complete or reproducible real-world asset inventory.

`dataset/raw/` and `dataset/processed/` contain `.gitkeep` placeholders in the uploaded archive. The existing `dataset/download_datasets.py` describes multiple open data sources, but `download_buildings`, `download_canopy`, `download_viirs`, `download_emissivity`, and `download_soil` only log that a dataset is configured; they do not acquire those data. `--generate-sample-rasters` creates synthetic arrays and writes example filenames that resemble sensor-source products; these must never be counted as downloaded observations. `download_osm` retrieves a country-scale India PBF, not five reproducible, AOI-specific vector files, and therefore does not cover Phoenix, Singapore, and Tokyo through that one handler.

The frontend `frontend/src/lib/osmBuildings.ts` does have a live Overpass fallback for building footprints, but that is an opportunistic runtime building-only request with browser caching/fallback behavior, not a fixed, versioned dataset for accounting. The backend also serves the curated JSON feature packs separately. These paths should not be confused with an acquired data snapshot.

## Sources and data policy

### Selected uniform source: OpenStreetMap via OSMnx/Overpass

OSM offers a cross-city, machine-readable source for mapped buildings, roads/railways, green/open-space polygons, water features, and land-use context. It is suitable as a common starter source because the project's five small analysis windows span India, Singapore, the United States, and Japan.

- Main source: <https://www.openstreetmap.org/>
- Licence/attribution: <https://www.openstreetmap.org/copyright>
- Retrieval API documentation: <https://osmnx.readthedocs.io/en/stable/user-reference.html>
- Geometry format standard: <https://www.rfc-editor.org/rfc/rfc7946.html>
- Licence recorded in the package: ODbL-1.0; required attribution string: `© OpenStreetMap contributors`.

OSM is community-mapped, not necessarily official, cadastral, or surveyed data. Its completeness, positional accuracy and tag quality vary by area. The package records that limitation and preserves the original OSM tags/object IDs instead of inventing height, vegetation, albedo, or surface-temperature measurements.

### Analysis windows are not administrative boundaries

The canonical bounds are loaded directly from `backend/app/spatial/geo_digital_twin.py::STUDY_AREA_CONFIGS`. This avoids a second hand-maintained bbox source. The bounds only define current model analysis windows; they are not asserted to be official study-area polygons. `frontend/src/lib/studyAreaBoundaries.ts` procedurally generates radial polygons for four areas and a rectangular approximation for Phoenix. Those polygons are not evidence of verified municipal boundaries.

### Raster sources are separate

The dataset requirement document also lists Landsat Collection 2 surface temperature, Sentinel-2 Level-2A reflectance, ERA5-Land, and ESA WorldCover. Those sources have different temporal, spatial, and licensing properties and must not be substituted for mapped building footprints. Landsat LST is useful for surface-temperature evidence but is not native 10 m thermal observation; WorldCover is land-cover classification rather than building geometry. This package deliberately does not claim to have downloaded or processed those rasters.

## Files added by this work

- `dataset/download_study_area_vectors.py`: networked per-area OSM acquisition from canonical source-of-truth bounds, source geometry preservation, a clipped analysis-window copy, timestamps, per-feature OSM IDs/tags, ODbL attribution, manifest, retries delegated to OSMnx cache/rate-limit behavior, refusal to overwrite existing snapshots unless `--overwrite` is explicit.
- `dataset/validate_spatial_data.py`: source/processed GeoJSON checks for CRS convention, bbox validity, OSM identity/provenance, geometry type/validity, geographic coordinate ranges, clipped-output bounds, and attribution.
- `dataset/requirements-spatial.txt`: isolated geospatial data tooling dependencies.
- `dataset/spatial_sources/study_area_manifest.json`: the five *configured analysis windows* and configured projected CRS, derived from current backend settings; explicitly marked not downloaded data and not official boundaries.
- `dataset/spatial_sources/analysis_windows_not_official_boundaries.geojson`: one correctly encoded bbox polygon per configured model analysis window, generated from the canonical bounds, explicitly not an authoritative municipal boundary. This is the only new spatial geometry file available immediately; it is an analysis extent, not downloaded real-world feature data.
- `dataset/spatial_sources/legacy_feature_inventory.json`: feature counts and provenance deficiencies observed in the five bundled curated JSON collections.
- `dataset/generate_analysis_windows.py`: reproducibly regenerate the bbox-derived analysis-window features after canonical bounds change.
- `dataset/spatial_sources/README.md`: source, license, limitations, use and run instructions.
- `dataset/tests/test_spatial_source_tools.py`: offline unit tests for configuration parsing, classification, clipping/validity, JSON safety, and provenance policy.

## Intended outputs after a successful live acquisition

- `dataset/raw/vector/osm/<study_area_id>_features.geojson`: OSM source geometries for the relevant analysis window, preserving the returned full geometry and source tags.
- `dataset/processed/spatial_vectors/<study_area_id>_features_clipped.geojson`: geometries clipped to the current configured bounding-box analysis window, with validity repairs recorded. This is *not* clipped to an official boundary.
- `dataset/raw/vector/osm/manifest.json`: per-area counts, times, bounds, output paths, source/license, query tags, failures, and status.

These outputs are not bundled with this report because outbound DNS/network access in the current execution environment was unavailable (direct test requests failed during name resolution; the live Overpass extraction attempt timed out). No synthetic substitute was created, and `NOT_DOWNLOADED` is the honest status. Run the documented command on the developer's network-enabled Mac to materialize the real OSM snapshot. If an area query fails or returns no geometry, the downloader records a failure instead of generating fake features.

## Local run and verification

```bash
python -m pip install -r dataset/requirements-spatial.txt
python dataset/download_study_area_vectors.py --areas all
python dataset/validate_spatial_data.py
```

For one area, e.g. `python dataset/download_study_area_vectors.py --areas delhi_cp`. A refresh must be explicit: `--overwrite`. Preserve the raw downloaded files, manifest, retrieval date, and SHA-256 hashes as a C2 evidence snapshot. Do not replace the source data silently between implementation and verification.

## Important downstream guardrails

1. The three C2 export/accounting issues remain open; this package does not modify them.
2. `study_area_bbox` is an analysis window, not an official district boundary. If the product requires a genuine district/study-area boundary, source it independently, record provider/date/licence/accuracy, and model it as a separate polygon.
3. Preserve raw OSM geometries; derive separate clipped copies for the project's current bbox window.
4. Reproject geometries explicitly into the configured suitable local projected CRS before area/length calculations. A CRS label alone is not a transformation.
5. Do not assume unmapped features are absent or use OSM data as independent heat truth.
6. Do not infer roof eligibility solely from `building=*`; do not infer canopy height or temperature from feature category.
7. Do not fabricate intervention polygons from percentage values. Spatial allocation must be a distinct documented method.
8. Follow RFC 7946 for GeoJSON WGS84 longitude/latitude in `[longitude, latitude]` order and do not emit a legacy `crs` member.

## Verification performed in this execution

- Archive inventory and contents review: complete for relevant dataset/source directories.
- Existing curated GeoJSON feature counts inventoried: 29 / 28 / 12 / 10 / 10 (Delhi / Mumbai / Singapore / Phoenix / Tokyo).
- Canonical configuration parsed safely by AST without importing the backend app.
- The generated `analysis_windows_not_official_boundaries.geojson` was checked against the canonical five bboxes; all five match exactly and are explicitly marked non-official.
- Offline unit tests: 11 passed in this execution (`dataset/tests/test_spatial_source_tools.py`). These include pure-function checks and one mocked OSMnx acquisition test; they do not prove live data-source availability.
- Live network acquisition: BLOCKED by current environment networking; no real OSM data are claimed as acquired.
- Backend/frontend exporter logic: intentionally not modified; remains for the subsequent C2 change batch.
