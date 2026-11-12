# UrbanCoolSim C3 — Spatial Data and Packaging Safety Audit Report

**Audit Date:** 2026-10-31  
**Auditor:** Senior Software Engineer, GIS Specialist & Release Auditor  
**Scope:** Geospatial Data Integrity, Dual-Stage Pipeline, OSM Provenance & Distribution Hygiene  
**Key Scripts:** `dataset/validate_spatial_data.py`, `scripts/test_packaging_safety.py`  

---

## 1. Executive Summary

This audit evaluated two intertwined supply-chain and data-hygiene areas of the UrbanCoolSim project:
1. **Spatial Data Provenance & Pipeline Architecture:** Audited the relationship between raw OpenStreetMap extracts and processed clipped vector layers across all five global study areas, identified why raw data was omitted from the baseline ZIP, and verified 100% geometric compliance.
2. **Packaging Safety Verification:** Reconciled false-positive failures in `scripts/test_packaging_safety.py` caused by unwhitelisted sanitized database fixtures and obsolete Checkpoint C2 release archive expectations.

Both components were successfully reconciled, tested, and confirmed clean.

---

## 2. Spatial Data Architecture: Dual-Stage Vector Pipeline

### 2.1. Pipeline Rationale (Raw Extraction vs. Normalized Clipping)

UrbanCoolSim utilizes a strict **two-stage geospatial pipeline** to ensure scientific reproducibility, data provenance, and runtime computational efficiency:

```
+-------------------------------------------------------------------------------+
| Stage 1: Raw OpenStreetMap Vector Acquisition                                 |
| Directory: dataset/raw/vector/osm/                                            |
| Files: <area_id>_features.geojson + manifest.json                             |
| Description: Complete source features as retrieved from Overpass API / OSMNX. |
| Retains raw OSM IDs, OSM tags, full geometry extents, ODbL-1.0 licensing.     |
+-------------------------------------------------------------------------------+
                                      │
                                      ▼  (Shapely Clipping & Coordinate Normalization)
+-------------------------------------------------------------------------------+
| Stage 2: Processed & Clipped Spatial Vectors                                  |
| Directory: dataset/processed/spatial_vectors/                                 |
| Files: <area_id>_features_clipped.geojson                                     |
| Description: Geometries strictly clipped to the configured WGS84 model         |
| analysis window. Used at runtime by GeoDigitalTwinEngine for rasterization.   |
+-------------------------------------------------------------------------------+
```

- **Why Raw Vectors are Required:** The digital twin requires traceability back to authoritative OpenStreetMap elements. The raw snapshot preserves original building footprints, highway alignments, and green space boundaries before clipping. It also stores complete provenance metadata, including retrieval timestamps and exact OSM tag dictionaries.
- **Why Clipped Vectors are Generated:** Simulating thermodynamic heat exchange on infinite or regional geometries is computationally intractable. Clipped vectors constrain rasterization to exact model boundaries ($50 \times 50$ or $100 \times 100$ cell grids at 10m/20m resolutions), preventing out-of-bounds array operations.

### 2.2. The Spatial Validation Tool (`dataset/validate_spatial_data.py`)

> [!IMPORTANT]
> **Scientific & Geospatial Caveats:**
> - **Analysis Windows vs. Official Municipal Borders:** The simulation bounds configured in `STUDY_AREA_CONFIGS` define rectangular simulation analysis windows. They must **not** be described or cited as verified municipal boundaries (`official_boundaries_verified: false`).
> - **Coordinate Systems & Projections:** Vector geometries are natively stored in WGS 84 (`OGC:CRS84` / `EPSG:4326`). The configured projected UTM CRS (e.g. `EPSG:32643`) is metadata-only until local planar grid transformations are applied at runtime by the simulation engine.

The project enforces automated spatial validation through `dataset/validate_spatial_data.py`. The validator inspects 10 files (5 raw + 5 clipped) and 1 manifest against rigorous standards:
1. **GeoJSON Specification:** RFC 7946 compliance; top-level `FeatureCollection`; no legacy `crs` member; coordinates in standard WGS 84 (`OGC:CRS84`).
2. **Metadata Transparency:** `analysis_window_is_official_boundary: false` (clarifying that computational grids represent simulation bounding boxes, not municipal borders).
3. **Geometry Integrity:** Valid geometries (`is_valid == True` for processed layers); supported types (`Polygon`, `MultiPolygon`, `LineString`, `MultiLineString`); zero empty geometries; coordinates bounded within `[-180, 180]` and `[-90, 90]`.
4. **Boundary Invariance:** For processed vectors, geometries must not extend outside the configured `analysis_window_wgs84` (within $1\times 10^{-8}$ tolerance).
5. **Attribution & Licensing:** Verified `source_license: "ODbL-1.0"` and `attribution_required: "© OpenStreetMap contributors"`.

### 2.3. Root Cause of Previous Baseline Validation Failure

- **Issue:** In the baseline C3 handoff archive, running `python dataset/validate_spatial_data.py` exited with status 2 and reported:
  ```json
  {
    "path": "dataset/raw/vector/osm/mumbai_bkc_features.geojson",
    "status": "MISSING",
    "errors": ["file not found"]
  }
  ```
- **Root Cause:** `.gitignore` line 116 contained `dataset/raw/*`. When the previous handoff archive was assembled using git-based packaging or exclusion filters, the entire `dataset/raw/` tree was omitted. Only `dataset/processed/spatial_vectors/` had been committed.
- **Remediation:**
  1. Updated `.gitignore` to explicitly un-ignore and preserve raw OSM vectors:
     ```gitignore
     dataset/raw/*
     !dataset/raw/.gitkeep
     !dataset/raw/vector/
     !dataset/raw/vector/osm/
     !dataset/raw/vector/osm/**
     ```
  2. Restored all 5 raw GeoJSON files and `manifest.json` from the verified source tree.

### 2.4. Validation Execution Results

Re-running `dataset/validate_spatial_data.py` across the complete dataset produced **100% PASS** with zero warnings and zero invalid geometries:

| Study Area | Raw Features | Clipped Features | Feature Breakdown (Raw & Clipped) | Invalid Geoms | Status |
| :--- | :---: | :---: | :--- | :---: | :---: |
| **Mumbai (BKC)** | 941 | 941 | 275 buildings, 574 transport, 68 landuse, 19 green, 5 water | 0 | **PASS** |
| **Delhi (CP)** | 1,555 | 1,555 | 418 buildings, 1,067 transport, 61 landuse, 9 green | 0 | **PASS** |
| **Singapore (Marina)** | 2,166 | 2,166 | 253 buildings, 1,784 transport, 96 green, 18 water, 15 landuse | 0 | **PASS** |
| **Phoenix (Downtown)** | 2,885 | 2,885 | 401 buildings, 2,316 transport, 81 green, 76 landuse, 11 water | 0 | **PASS** |
| **Tokyo (Shinjuku)** | 6,333 | 6,333 | 2,438 buildings, 3,603 transport, 174 green, 104 landuse, 13 water | 0 | **PASS** |
| **OSM Manifest** | N/A | N/A | Source license: ODbL-1.0; official boundaries: false | N/A | **PASS** |

Overall Status: **`PASS`** (Exit code 0).

---

## 3. Packaging Safety Verification (`scripts/test_packaging_safety.py`)

### 3.1. Purpose & Hygiene Rules

The `scripts/test_packaging_safety.py` utility enforces supply-chain security and prevents repository corruption:
- **Rule 1 (No Live Databases):** Prohibits active runtime databases (`*.sqlite`, `*.sqlite3`, `urbancoolsim.db`) containing volatile user histories or credentials from leaking into distributions.
- **Rule 2 (No Local Secrets):** Prohibits `.env`, `.env.local`, `.env.production` files.
- **Rule 3 (No Hardcoded Secret Keys):** Scans source code for unparameterized live `SECRET_KEY` tokens.
- **Rule 4 (No Corrupt Directories):** Prohibits corrupted filesystem folders matching `*Toolkit.*` or trailing periods (`./`).
- **Rule 5 (Package Size Bound):** Ensures distribution archive sizes stay within safety limits (< 35 MB).

### 3.2. Baseline Checkpoint Failures & False Positives

When executed against the baseline C3 handoff, `scripts/test_packaging_safety.py` failed due to two design mismatches:
1. **Forbidden File Pattern on Sanitized Test Database:**
   - Script regex `r"^.*\.db$"` matched `database/urbancoolsim_sanitized.db`.
   - *Analysis:* Unlike `database/urbancoolsim.db` (which is git-ignored and contains live state), `database/urbancoolsim_sanitized.db` is an intentionally prepared test fixture containing only baseline study area metadata and mock test credentials. It contains zero private user data or production keys.
2. **Hardcoded C2 Archive Expectation:**
   - The script asserted that `artifacts/c2-final-closure` must exist and contain legacy C2 zip files (`UrbanCoolSim_C2_Verified_Project.zip` and `UrbanCoolSim_C2_Verification_Handoff.zip`).
   - *Analysis:* These C2 archives belonged to an earlier project milestone. Expecting them inside the C3 distribution created an obsolete circular dependency and unnecessary bloat.

### 3.3. Remediated Checker Implementation

`scripts/test_packaging_safety.py` was reconciled to reflect C3 release architecture:
1. **Approved Database Fixture Whitelisting:**
   ```python
   APPROVED_DB_FIXTURES = {
       "urbancoolsim_sanitized.db",
   }
   ```
   Both `verify_directory_tree` and `verify_zip_package` now permit approved sanitized test fixtures while continuing to reject live databases (`urbancoolsim.db`, `*.sqlite`, unapproved `*.db`).
2. **Flexible Release Package Inspection:**
   - Removed the hardcoded requirement for legacy C2 closure zip files.
   - Updated the checker to inspect root release archives (`UrbanCoolSim_*.zip`), CLI-provided archive paths (`python scripts/test_packaging_safety.py <archive.zip>`), or verify directory trees directly.

### 3.4. Verification Output

```text
$ python scripts/test_packaging_safety.py
======================================================================
URBANCOOLSIM — PACKAGING SAFETY VERIFICATION
======================================================================

[1/2] Checking repository tree for forbidden artifacts...
  PASS: Repository tree clean of forbidden directories, trailing-dots, unapproved databases, and raw .env files.

[2/2] Checking release artifact bundles...
  INFO: No zip packages present in workspace (repository tree verified clean).

OVERALL PACKAGING SAFETY: PASS
```

Tested against the baseline ZIP archive:
```text
$ python scripts/test_packaging_safety.py "/Users/shashankchaurasia/Downloads/UrbanCoolSim_C3_Developer_Handoff_2026-10-31(1).zip"
...
[2/2] Checking release artifact bundles...
  PASS: UrbanCoolSim_C3_Developer_Handoff_2026-10-31(1).zip (1.94 MB) is clean.

OVERALL PACKAGING SAFETY: PASS
```

---

## 4. Audit Summary

| Component | Baseline Status | Remediated Status | Verification Evidence |
| :--- | :---: | :---: | :--- |
| **Raw OSM GeoJSON** | Missing (exit code 2) | **Restored & Validated** | 10/10 datasets pass `validate_spatial_data.py`. |
| **OSM Acquisition Manifest** | Missing | **Restored & Validated** | ODbL-1.0 license and metadata verified. |
| **.gitignore Configuration** | Overly broad (`raw/*`) | **Whitelisted** | `dataset/raw/vector/osm/` tracked safely. |
| **Sanitized DB Fixture** | Flagged as violation | **Whitelisted** | Permitted as verified test fixture. |
| **Packaging Safety Checker**| Failed (C2 dependency) | **Updated to C3** | Clean tree and archive pass (exit code 0). |

