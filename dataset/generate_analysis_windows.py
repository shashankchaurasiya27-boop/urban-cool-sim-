#!/usr/bin/env python3
"""Generate explicit GeoJSON rectangles for model analysis windows only.

This is not a source-data acquisition tool and never creates an official city
boundary. It converts the canonical configured bbox rectangles into RFC 7946
GeoJSON for consistent downstream clipping until verified boundary polygons are
separately obtained.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from download_study_area_vectors import load_study_area_configs, write_json_atomic

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT_ROOT / "dataset" / "spatial_sources" / "analysis_windows_not_official_boundaries.geojson"
COUNTRIES = {
    "mumbai_bkc": "India",
    "delhi_cp": "India",
    "singapore_marina": "Singapore",
    "phoenix_downtown": "USA",
    "tokyo_shinjuku": "Japan",
}


def build_analysis_window_feature(area_id: str, config: dict[str, Any]) -> dict[str, Any]:
    west, south, east, north = map(float, config["bbox"])
    ring = [[west, south], [east, south], [east, north], [west, north], [west, south]]
    return {
        "type": "Feature",
        "id": area_id,
        "geometry": {"type": "Polygon", "coordinates": [ring]},
        "properties": {
            "study_area_id": area_id,
            "name": config["name"],
            "city": config["city"],
            "country": COUNTRIES.get(area_id, "unknown"),
            "role": "model_analysis_window_bbox",
            "official_boundary_verified": False,
            "source_configuration": "backend/app/spatial/geo_digital_twin.py::STUDY_AREA_CONFIGS",
            "configured_projected_crs_for_later_metric_calculations": config["crs"],
            "bbox_wgs84": [west, south, east, north],
            "notes": "Rectangle derived from the configured analysis-window bbox; not an authoritative municipal/district boundary.",
        },
    }


def main() -> int:
    areas = load_study_area_configs()
    payload = {
        "type": "FeatureCollection",
        "metadata": {
            "project": "UrbanCoolSim",
            "dataset_role": "analysis_windows_not_official_boundaries",
            "coordinate_reference_system": "OGC:CRS84 / WGS 84 longitude-latitude",
            "coordinate_order": "[longitude, latitude]",
            "official_boundaries_verified": False,
            "source_configuration": "backend/app/spatial/geo_digital_twin.py::STUDY_AREA_CONFIGS",
            "generated_from_current_source_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        },
        "features": [build_analysis_window_feature(area_id, config) for area_id, config in areas.items()],
    }
    write_json_atomic(OUTPUT, payload)
    print(f"Wrote {len(payload['features'])} analysis-window features: {OUTPUT.relative_to(PROJECT_ROOT)}")
    print("These rectangles are analysis windows, not official study-area boundaries.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
