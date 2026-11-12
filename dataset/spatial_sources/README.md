# UrbanCoolSim Spatial Data Source Package

## Current finding

The archived project does **not** contain a verified, downloaded real-world GIS dataset for its five study areas. `dataset/raw/` and `dataset/processed/` were placeholders. The files under `backend/app/spatial/data/*_geo.json` contain small curated feature collections with no OSM object IDs, acquisition timestamp, upstream source URI, or per-feature provenance. They must not be treated as a verified city GIS inventory. The `dataset/download_datasets.py` file has some real-source download paths, but its building/canopy/VIIRS/emissivity/soil handlers do not perform downloads; its `--generate-sample-rasters` option explicitly generates synthetic values.

This folder establishes a reproducible way to acquire an actual, versioned vector snapshot for the five existing model analysis windows. It does **not** claim that a live dataset has been downloaded in the ChatGPT execution environment. The downloader requires a network-enabled local environment and should be run by a developer with internet access.

## Primary source: OpenStreetMap (OSM)

The common cross-city source chosen for this dataset seed is OpenStreetMap data queried through OSMnx/Overpass. The package captures mapped building footprints, roads/railways, mapped green/open-space features, water/waterways, and selected land-use context for all five model analysis windows.

- OSM data page: <https://www.openstreetmap.org/>
- Copyright/licence and attribution: <https://www.openstreetmap.org/copyright>
- OSMnx bbox query API: <https://osmnx.readthedocs.io/en/stable/user-reference.html>
- GeoJSON format: RFC 7946, <https://www.rfc-editor.org/rfc/rfc7946.html>
- Licence: Open Data Commons Open Database License (ODbL). Include `© OpenStreetMap contributors` attribution and comply with ODbL obligations for redistributions/derived databases.

**Important limit:** OSM is a real, community-mapped dataset, not necessarily an authoritative municipal/cadastral dataset. Completeness, position accuracy, and tag quality vary by place and feature. OSM data must not be described as surveyed ground truth.

## Study-area semantics

The existing `STUDY_AREA_CONFIGS` bounding boxes in `backend/app/spatial/geo_digital_twin.py` are treated only as **analysis windows**. They are not asserted to be legally or municipally authoritative district boundaries. The acquisition utility reads that configuration directly through Python AST parsing so it does not introduce a second hand-maintained copy of the bounds.

The configured projected CRS is recorded as a project setting for downstream checking; the GeoJSON coordinates remain WGS 84 longitude/latitude in `[longitude, latitude]` order. Reprojection must be performed explicitly before calculating areas or distances.

## Generated files

After a successful run:

- `dataset/raw/vector/osm/<study_area_id>_features.geojson` — fetched source geometries intersecting the configured analysis window, retaining the full source geometry where supplied.
- `dataset/processed/spatial_vectors/<study_area_id>_features_clipped.geojson` — geometries clipped to the configured analysis-window bounding box, with clipping and source provenance recorded. This is an analysis-window product, not a real administrative boundary.
- `dataset/raw/vector/osm/manifest.json` — acquisition time, query, configured bbox/CRS, counts, output locations, source and licensing metadata.

The OSM snapshot is mutable source data. Keep the raw source snapshot and metadata unchanged once used in a checkpoint; refresh into a new, dated snapshot for later runs. Record hashes in the checkpoint change log. Do not silently replace the archived source snapshot.

## Install and download

From the project root (Python 3.10+ recommended):

```bash
python -m pip install -r dataset/requirements-spatial.txt
python dataset/download_study_area_vectors.py --areas all
python dataset/validate_spatial_data.py
```

Download one area only:

```bash
python dataset/download_study_area_vectors.py --areas delhi_cp
```

To intentionally refresh an existing snapshot, use `--overwrite`. By default, the downloader refuses to overwrite any existing per-area output. Do not run all five queries in a tight loop manually; the script uses OSMnx's request/cache/rate-limit settings.

## Data policy for subsequent C2 fixes

1. Use the fetched OSM geometry for real mapped feature candidates; preserve OSM IDs and source tags.
2. Keep the project analysis window distinct from an official study boundary. If an official boundary is later supplied or sourced, record its separate provenance and use it as the clipping geometry instead.
3. Do not convert OSM presence/absence into a claim that an area has no buildings, roads, or parks; absence can mean missing mapping.
4. Do not infer measured tree canopy, surface temperature, albedo, or building height when those measurements are missing. OSM `height` and `building:levels` are optional tags; derived level-to-height fallback values must be labelled as estimates, not source measurements.
5. Do not export proposed intervention footprints without a documented spatial allocation rule. These files provide source geometry candidates, not optimization allocations.
6. Every area quantity must be calculated in a suitable projected CRS, from valid clipped geometries, and with a documented eligibility rule.
7. GeoJSON files use RFC 7946 WGS 84 longitude/latitude and do not declare a nonstandard `crs` member.

## Raster sources are a separate workstream

The current project requirements also list Landsat Collection 2 surface temperature, Sentinel-2 Level-2A reflectance, ERA5-Land, and ESA WorldCover. Those are not substituted by this OSM vector package. They have different spatial/temporal resolution, processing, authentication, license, and provenance requirements. In particular, Landsat surface-temperature products are not 10 m observations merely because a 10 m output grid is desired, and WorldCover is land-cover classification rather than building-footprint data.

## Current analysis-window geometry (available now)

`analysis_windows_not_official_boundaries.geojson` is included now. It is generated from the canonical configured bbox values and gives downstream code one explicit GeoJSON feature per model analysis window. It is useful as a common clipping extent for the current model, but **is not real municipal/district boundary data** and must not be labeled as such. Regenerate it after a bbox change:

```bash
python dataset/generate_analysis_windows.py
```
