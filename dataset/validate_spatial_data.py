#!/usr/bin/env python3
"""Validate downloaded UrbanCoolSim OSM source and clipped vector snapshots."""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

from shapely.geometry import shape

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "dataset" / "raw" / "vector" / "osm"
PROCESSED_DIR = PROJECT_ROOT / "dataset" / "processed" / "spatial_vectors"
AREAS = ["mumbai_bkc", "delhi_cp", "singapore_marina", "phoenix_downtown", "tokyo_shinjuku"]
ALLOWED_GEOMETRIES = {"LineString", "MultiLineString", "Polygon", "MultiPolygon"}


def validate_file(path: Path, area_id: str, *, processed: bool) -> dict[str, Any]:
    if not path.is_file():
        return {"path": str(path.relative_to(PROJECT_ROOT)), "status": "MISSING", "errors": ["file not found"], "feature_count": 0}
    errors: list[str] = []
    warnings: list[str] = []
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"path": str(path.relative_to(PROJECT_ROOT)), "status": "FAIL", "errors": [f"invalid JSON: {exc}"], "feature_count": 0}
    if doc.get("type") != "FeatureCollection": errors.append("top-level type must be FeatureCollection")
    meta = doc.get("metadata", {})
    if meta.get("study_area_id") != area_id: errors.append("metadata.study_area_id mismatch")
    if meta.get("analysis_window_is_official_boundary") is not False: errors.append("analysis window must not be represented as an official boundary")
    if meta.get("coordinate_reference_system") != "OGC:CRS84 / WGS 84 longitude-latitude": errors.append("coordinate reference metadata not truthful/explicit")
    if "crs" in doc: errors.append("legacy top-level GeoJSON crs member is not allowed")
    features = doc.get("features")
    if not isinstance(features, list):
        errors.append("features must be an array")
        features = []
    if not features: warnings.append("no source features present; do not treat this as a downloaded dataset")
    # The model bbox is an analysis window, not necessarily the extent of full
    # source geometries. Keep it in metadata rather than misusing GeoJSON's
    # top-level `bbox` member, which describes the contained geometry extent.
    window = meta.get("analysis_window_wgs84")
    if not (isinstance(window, list) and len(window) == 4 and all(isinstance(x, (int, float)) and math.isfinite(x) for x in window)):
        errors.append("metadata.analysis_window_wgs84 must have four finite values")
        window = None
    else:
        west, south, east, north = window
        if not (-180 <= west < east <= 180 and -90 <= south < north <= 90): errors.append("analysis window coordinate order/range invalid")
    if "bbox" in doc:
        errors.append("top-level bbox must not be misused as the model analysis window; omit it or compute the actual feature extent")
    by_class: dict[str, int] = {}
    seen_ids: set[str] = set()
    invalid_geometries = 0
    for idx, f in enumerate(features):
        if f.get("type") != "Feature":
            errors.append(f"feature[{idx}] is not a Feature")
            continue
        props = f.get("properties") or {}
        if props.get("study_area_id") != area_id: errors.append(f"feature[{idx}] study_area_id mismatch")
        if props.get("source") != "OpenStreetMap": errors.append(f"feature[{idx}] source is not explicit OSM")
        if props.get("source_license") != "ODbL-1.0": errors.append(f"feature[{idx}] source license missing/wrong")
        if not props.get("osm_id") or not props.get("osm_element_type"): errors.append(f"feature[{idx}] lacks source OSM identifier")
        if not props.get("osm_tags"): errors.append(f"feature[{idx}] lacks retained source tags")
        if not props.get("retrieved_at_utc"): errors.append(f"feature[{idx}] lacks retrieval timestamp")
        stable_id = str(f.get("id", ""))
        if stable_id in seen_ids: errors.append(f"duplicate feature id {stable_id}")
        seen_ids.add(stable_id)
        klass = str(props.get("feature_class", "unknown"))
        by_class[klass] = by_class.get(klass, 0) + 1
        geom_doc = f.get("geometry")
        if not isinstance(geom_doc, dict):
            errors.append(f"feature[{idx}] geometry missing")
            continue
        try:
            geom = shape(geom_doc)
            if geom.is_empty: errors.append(f"feature[{idx}] geometry empty")
            if geom.geom_type not in ALLOWED_GEOMETRIES: errors.append(f"feature[{idx}] unsupported geometry type {geom.geom_type}")
            if not geom.is_valid:
                invalid_geometries += 1
                if processed: errors.append(f"processed feature[{idx}] geometry invalid")
                else: warnings.append(f"raw feature[{idx}] geometry invalid; inspect normalized processed copy")
            if not geom.is_empty:
                minx, miny, maxx, maxy = geom.bounds
                if not (-180 <= minx <= maxx <= 180 and -90 <= miny <= maxy <= 90): errors.append(f"feature[{idx}] coordinates outside WGS84 geographic ranges")
                if processed and window is not None and (minx < window[0] - 1e-8 or miny < window[1] - 1e-8 or maxx > window[2] + 1e-8 or maxy > window[3] + 1e-8):
                    errors.append(f"processed feature[{idx}] extends outside the configured analysis window")
        except Exception as exc:
            errors.append(f"feature[{idx}] geometry parse failed: {exc}")
    if meta.get("source") and "OpenStreetMap" not in str(meta["source"]): errors.append("collection source does not mention OpenStreetMap")
    if meta.get("attribution_required") != "© OpenStreetMap contributors": errors.append("required OSM attribution missing")
    return {
        "path": str(path.relative_to(PROJECT_ROOT)),
        "status": "PASS" if not errors else "FAIL",
        "feature_count": len(features),
        "feature_counts_by_class": by_class,
        "invalid_geometry_count": invalid_geometries,
        "warnings": sorted(set(warnings)),
        "errors": errors,
    }


def main() -> int:
    reports = []
    for area_id in AREAS:
        reports.append(validate_file(RAW_DIR / f"{area_id}_features.geojson", area_id, processed=False))
        reports.append(validate_file(PROCESSED_DIR / f"{area_id}_features_clipped.geojson", area_id, processed=True))
    manifest_path = RAW_DIR / "manifest.json"
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if manifest.get("source_license") != "ODbL-1.0":
                reports.append({"path": str(manifest_path.relative_to(PROJECT_ROOT)), "status": "FAIL", "errors": ["manifest source license missing/wrong"]})
            if manifest.get("official_boundaries_verified") is not False:
                reports.append({"path": str(manifest_path.relative_to(PROJECT_ROOT)), "status": "FAIL", "errors": ["manifest must not claim official boundaries verified"]})
        except Exception as exc:
            reports.append({"path": str(manifest_path.relative_to(PROJECT_ROOT)), "status": "FAIL", "errors": [f"manifest JSON invalid: {exc}"]})
    else:
        reports.append({"path": str(manifest_path.relative_to(PROJECT_ROOT)), "status": "MISSING", "errors": ["OSM acquisition manifest absent"]})
    print(json.dumps({"overall_status": "PASS" if reports and all(r["status"] == "PASS" for r in reports) else "NOT_READY", "checks": reports}, indent=2))
    return 0 if reports and all(r["status"] == "PASS" for r in reports) else 2


if __name__ == "__main__":
    raise SystemExit(main())
