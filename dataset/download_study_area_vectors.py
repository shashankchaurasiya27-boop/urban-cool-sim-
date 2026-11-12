#!/usr/bin/env python3
"""Acquire versioned OSM vector features for all configured UrbanCoolSim areas.

This script only prepares a data snapshot; it does not alter the backend/frontend
or declare existing hand-curated geometries to be authoritative. It reads area
bounds directly from the canonical Python config using AST literal parsing, so
it does not import or execute the application.

Requires dataset/requirements-spatial.txt and a network connection.
"""
from __future__ import annotations

import argparse
import ast
import json
import math
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from shapely import make_valid
from shapely.geometry import GeometryCollection, LineString, MultiLineString, MultiPolygon, Polygon, box, mapping
from shapely.ops import unary_union

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PROJECT_ROOT / "backend" / "app" / "spatial" / "geo_digital_twin.py"
RAW_OUT = PROJECT_ROOT / "dataset" / "raw" / "vector" / "osm"
PROCESSED_OUT = PROJECT_ROOT / "dataset" / "processed" / "spatial_vectors"
OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright"
OSM_HOME_URL = "https://www.openstreetmap.org/"
OSMNX_API_URL = "https://osmnx.readthedocs.io/en/stable/user-reference.html"
OSM_LICENSE = "ODbL-1.0"
OSM_ATTRIBUTION = "© OpenStreetMap contributors"

# OSMnx treats this tag dictionary as a UNION (OR) of tags. It intentionally
# includes physical features used by spatial accounting and avoids broad POI
# and address downloads that would not help the C2 geometry/area work.
OSM_TAGS: dict[str, Any] = {
    "building": True,
    "highway": True,
    "railway": ["rail", "light_rail", "subway", "tram"],
    "leisure": ["park", "garden", "nature_reserve", "recreation_ground", "common"],
    "landuse": ["grass", "forest", "meadow", "recreation_ground", "orchard", "village_green", "reservoir", "residential", "commercial", "industrial", "retail"],
    "natural": ["water", "wood", "scrub", "wetland", "grassland", "heath"],
    "waterway": ["river", "stream", "canal", "drain", "ditch"],
}
ALLOWED_GEOMETRY_TYPES = {"LineString", "MultiLineString", "Polygon", "MultiPolygon"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_study_area_configs(path: Path = CONFIG_PATH) -> dict[str, dict[str, Any]]:
    """Read STUDY_AREA_CONFIGS as a literal without importing app dependencies."""
    if not path.is_file():
        raise FileNotFoundError(f"Canonical study-area config not found: {path}")
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == "STUDY_AREA_CONFIGS":
            value = ast.literal_eval(node.value)
            if not isinstance(value, dict) or not value:
                raise ValueError("STUDY_AREA_CONFIGS must be a non-empty literal dictionary")
            validate_area_configs(value)
            return value
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "STUDY_AREA_CONFIGS" for t in node.targets):
            value = ast.literal_eval(node.value)
            if not isinstance(value, dict) or not value:
                raise ValueError("STUDY_AREA_CONFIGS must be a non-empty literal dictionary")
            validate_area_configs(value)
            return value
    raise ValueError(f"Could not locate a literal STUDY_AREA_CONFIGS assignment in {path}")


def validate_area_configs(areas: dict[str, dict[str, Any]]) -> None:
    required = {"mumbai_bkc", "delhi_cp", "singapore_marina", "phoenix_downtown", "tokyo_shinjuku"}
    missing = required - set(areas)
    if missing:
        raise ValueError(f"Expected all five configured study areas; missing: {sorted(missing)}")
    for area_id, config in areas.items():
        bbox = config.get("bbox")
        if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
            raise ValueError(f"{area_id}: bbox must be [west, south, east, north]")
        west, south, east, north = map(float, bbox)
        if not all(math.isfinite(v) for v in (west, south, east, north)):
            raise ValueError(f"{area_id}: bbox must contain only finite numbers")
        if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
            raise ValueError(f"{area_id}: invalid WGS84 bbox {bbox}")
        if not config.get("crs"):
            raise ValueError(f"{area_id}: canonical config has no configured projected CRS")


def classify_osm_tags(tags: dict[str, Any]) -> str:
    """Group source tags into analysis classes without inventing new attributes."""
    if tags.get("building") not in (None, False, "no"):
        return "building"
    if tags.get("highway") or tags.get("railway"):
        return "transport"
    if tags.get("waterway") or tags.get("natural") == "water" or tags.get("water") or tags.get("landuse") == "reservoir":
        return "water"
    if tags.get("leisure") in {"park", "garden", "nature_reserve", "recreation_ground", "common"}:
        return "green_space"
    if tags.get("landuse") in {"grass", "forest", "meadow", "recreation_ground", "orchard", "village_green"}:
        return "green_space"
    if tags.get("natural") in {"wood", "scrub", "wetland", "grassland", "heath"}:
        return "green_space"
    if tags.get("landuse") in {"residential", "commercial", "industrial", "retail"}:
        return "landuse_context"
    return "other_mapped_feature"


def json_safe(value: Any) -> Any:
    """Convert common pandas/numpy scalars to JSON-safe values, omitting NaN."""
    if value is None or type(value).__name__ in {"NAType", "NaTType"}:
        return None
    if isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items() if json_safe(v) is not None}
    if isinstance(value, (list, tuple, set)):
        return [safe for item in value if (safe := json_safe(item)) is not None]
    if hasattr(value, "item"):
        try:
            return json_safe(value.item())
        except (ValueError, TypeError):
            pass
    # pandas.NA / NaT; this branch is deliberately last to avoid array truth tests.
    try:
        if bool(value != value):
            return None
    except (TypeError, ValueError):
        pass
    return str(value)


def dimension_kind(geom: Any) -> str | None:
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type in {"Polygon", "MultiPolygon"}:
        return "area"
    if geom.geom_type in {"LineString", "MultiLineString"}:
        return "line"
    if geom.geom_type == "GeometryCollection":
        kinds = {dimension_kind(g) for g in geom.geoms} - {None}
        return next(iter(kinds)) if len(kinds) == 1 else "mixed"
    return None


def matching_dimension_parts(geom: Any, kind: str) -> list[Any]:
    wanted = {"area": {"Polygon", "MultiPolygon"}, "line": {"LineString", "MultiLineString"}}[kind]
    if geom is None or geom.is_empty:
        return []
    if geom.geom_type in wanted:
        return list(geom.geoms) if geom.geom_type.startswith("Multi") else [geom]
    if geom.geom_type == "GeometryCollection":
        out: list[Any] = []
        for child in geom.geoms:
            out.extend(matching_dimension_parts(child, kind))
        return out
    return []


def clip_geometry(geometry: Any, bbox: tuple[float, float, float, float]) -> tuple[Any | None, bool]:
    """Make geometry valid for analysis and clip it to the configured bbox.

    Returns (geometry, was_repaired). The original source geometry is still
    written to the raw output; the returned geometry is for analysis use.
    """
    if geometry is None or geometry.is_empty:
        return None, False
    repaired = not geometry.is_valid
    fixed = make_valid(geometry) if repaired else geometry
    west, south, east, north = bbox
    clipped = fixed.intersection(box(west, south, east, north))
    if clipped.is_empty:
        return None, repaired
    kind = dimension_kind(fixed)
    if kind not in {"area", "line"}:
        return None, repaired
    parts = matching_dimension_parts(clipped, kind)
    if not parts:
        return None, repaired
    result = unary_union(parts)
    if result.is_empty:
        return None, repaired
    if not result.is_valid:
        result = make_valid(result)
        parts = matching_dimension_parts(result, kind)
        if not parts:
            return None, True
        result = unary_union(parts)
        repaired = True
    if result.geom_type not in ALLOWED_GEOMETRY_TYPES:
        return None, repaired
    return result, repaired


def feature_from_row(area_id: str, row: Any, index: Any, retrieved_at: str) -> dict[str, Any] | None:
    geometry = row.get("geometry")
    if geometry is None or geometry.is_empty or geometry.geom_type not in ALLOWED_GEOMETRY_TYPES:
        return None
    tags: dict[str, Any] = {}
    for key, value in row.items():
        if key in {"geometry", "element_type", "element", "osmid", "id"}:
            continue
        safe = json_safe(value)
        if safe is not None:
            tags[str(key)] = safe
    if not tags:
        return None
    if isinstance(index, tuple) and len(index) >= 2:
        element_type, osm_id = str(index[0]), json_safe(index[1])
    else:
        element_type = str(row.get("element_type", row.get("element", "unknown")))
        osm_id = json_safe(row.get("osmid", row.get("id", index)))
    if osm_id is None:
        return None
    feature_class = classify_osm_tags(tags)
    return {
        "type": "Feature",
        "id": f"{element_type}/{osm_id}",
        "geometry": mapping(geometry),
        "properties": {
            "study_area_id": area_id,
            "feature_class": feature_class,
            "osm_element_type": element_type,
            "osm_id": osm_id,
            "source": "OpenStreetMap",
            "source_url": OSM_HOME_URL,
            "osm_object_url": f"https://www.openstreetmap.org/{element_type}/{osm_id}" if element_type in {"node", "way", "relation"} else None,
            "source_license": OSM_LICENSE,
            "source_attribution": OSM_ATTRIBUTION,
            "retrieved_at_utc": retrieved_at,
            "osm_tags": tags,
        },
    }


def write_json_atomic(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def make_collection(area_id: str, bbox: tuple[float, float, float, float], features: list[dict[str, Any]], *, kind: str, retrieved_at: str, configured_crs: str, stats: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        # `bbox` is intentionally omitted at the FeatureCollection level: the
        # raw source geometries may extend beyond the query window. The exact
        # analysis window is recorded separately in foreign metadata.
        "metadata": {
            "project": "UrbanCoolSim",
            "study_area_id": area_id,
            "analysis_window_wgs84": list(bbox),
            "analysis_window_is_official_boundary": False,
            "coordinate_reference_system": "OGC:CRS84 / WGS 84 longitude-latitude",
            "coordinate_order": "[longitude, latitude]",
            "configured_projected_crs_for_area_calculations": configured_crs,
            "dataset_role": kind,
            "source": "OpenStreetMap via OSMnx / Overpass API",
            "source_home": OSM_HOME_URL,
            "source_copyright_and_license": OSM_COPYRIGHT_URL,
            "source_license": OSM_LICENSE,
            "attribution_required": OSM_ATTRIBUTION,
            "retrieved_at_utc": retrieved_at,
            "query_tags_union": OSM_TAGS,
            "geometry_area_metrics_not_computed_in_geographic_crs": True,
            "limitations": [
                "OSM is community-mapped and is not automatically an authoritative cadastral or municipal dataset.",
                "Feature completeness and positional/tag accuracy vary by place and feature.",
                "The configured bounding box is an analysis window, not an official study-area polygon.",
                "OSM tags do not imply that untagged properties are absent.",
            ],
            **(stats or {}),
        },
        "features": features,
    }


def acquire_area(area_id: str, config: dict[str, Any], *, overwrite: bool = False, pause_s: float = 2.0) -> dict[str, Any]:
    raw_path = RAW_OUT / f"{area_id}_features.geojson"
    clipped_path = PROCESSED_OUT / f"{area_id}_features_clipped.geojson"
    if not overwrite and (raw_path.exists() or clipped_path.exists()):
        raise FileExistsError(f"Refusing to overwrite an existing snapshot for {area_id}; pass --overwrite to refresh deliberately")

    try:
        import osmnx as ox
    except ImportError as exc:
        raise RuntimeError("Missing OSMnx. Install spatial requirements with: python -m pip install -r dataset/requirements-spatial.txt") from exc

    ox.settings.use_cache = True
    ox.settings.log_console = True
    ox.settings.requests_timeout = 180
    if hasattr(ox.settings, "overpass_rate_limit"):
        ox.settings.overpass_rate_limit = True

    west, south, east, north = map(float, config["bbox"])
    bbox = (west, south, east, north)
    gdf = ox.features.features_from_bbox(bbox=bbox, tags=OSM_TAGS)
    if gdf is None or len(gdf) == 0:
        raise RuntimeError(f"OSM query returned zero features for {area_id}. Do not substitute synthetic geometry; investigate bbox, source coverage, or endpoint health.")
    retrieved_at = utc_now()

    raw_features: list[dict[str, Any]] = []
    clipped_features: list[dict[str, Any]] = []
    skipped = 0
    repaired = 0
    clipped_count = 0
    for index, row in gdf.iterrows():
        feature = feature_from_row(area_id, row, index, retrieved_at)
        if feature is None:
            skipped += 1
            continue
        raw_features.append(feature)
        processed_geom, was_repaired = clip_geometry(row.get("geometry"), bbox)
        if was_repaired:
            repaired += 1
        if processed_geom is None:
            continue
        original_geom = row.get("geometry")
        if not processed_geom.equals(original_geom):
            clipped_count += 1
        processed_feature = {
            **feature,
            "geometry": mapping(processed_geom),
            "properties": {
                **feature["properties"],
                "clipped_to_analysis_window_bbox": True,
                "geometry_validity_repaired_for_processed_copy": bool(was_repaired),
                "source_geometry_is_preserved_in_raw_file": True,
            },
        }
        clipped_features.append(processed_feature)

    if not raw_features:
        raise RuntimeError(f"OSM query for {area_id} yielded no usable polygon/line features after geometry filtering")

    counts = Counter(f["properties"]["feature_class"] for f in raw_features)
    common_stats = {
        "osmnx_version": str(getattr(ox, "__version__", "unknown")),
        "overpass_base_url": str(getattr(ox.settings, "overpass_url", "OSMnx configured default")),
        "feature_counts_by_class": dict(sorted(counts.items())),
        "raw_feature_count": len(raw_features),
        "processed_clipped_feature_count": len(clipped_features),
        "features_skipped_for_missing_or_unsupported_geometry_or_tags": skipped,
        "processed_geometry_repair_count": repaired,
        "processed_geometries_differing_from_raw": clipped_count,
    }
    raw_fc = make_collection(area_id, bbox, raw_features, kind="source_snapshot_features_intersecting_analysis_window_full_source_geometry", retrieved_at=retrieved_at, configured_crs=str(config["crs"]), stats=common_stats)
    clipped_fc = make_collection(area_id, bbox, clipped_features, kind="processed_features_clipped_to_configured_analysis_bbox", retrieved_at=retrieved_at, configured_crs=str(config["crs"]), stats=common_stats)
    write_json_atomic(raw_path, raw_fc)
    write_json_atomic(clipped_path, clipped_fc)
    if pause_s > 0:
        time.sleep(pause_s)
    return {
        "study_area_id": area_id,
        "name": config.get("name"),
        "city": config.get("city"),
        "country": config.get("country"),
        "analysis_window_wgs84": list(bbox),
        "configured_projected_crs": config["crs"],
        "official_boundary_verified": False,
        "retrieved_at_utc": retrieved_at,
        "raw_output": str(raw_path.relative_to(PROJECT_ROOT)),
        "processed_output": str(clipped_path.relative_to(PROJECT_ROOT)),
        **common_stats,
        "status": "DOWNLOADED",
    }


def parse_args() -> argparse.Namespace:
    configs = load_study_area_configs()
    parser = argparse.ArgumentParser(description="Download real OSM vector snapshots for UrbanCoolSim's configured analysis windows.")
    parser.add_argument("--areas", nargs="+", default=["all"], help=f"Area IDs or 'all'. Available: {', '.join(configs)}")
    parser.add_argument("--overwrite", action="store_true", help="Intentionally refresh existing vector snapshots")
    parser.add_argument("--pause-seconds", type=float, default=2.0, help="Pause between areas to reduce source pressure")
    args = parser.parse_args()
    if args.pause_seconds < 0 or not math.isfinite(args.pause_seconds):
        parser.error("--pause-seconds must be finite and non-negative")
    if args.areas == ["all"]:
        args.selected_areas = list(configs)
    else:
        unknown = set(args.areas) - set(configs)
        if unknown:
            parser.error(f"Unknown study area IDs: {', '.join(sorted(unknown))}")
        if "all" in args.areas:
            parser.error("Use --areas all by itself, or list individual area IDs")
        args.selected_areas = list(dict.fromkeys(args.areas))
    args.configs = configs
    return args


def main() -> int:
    args = parse_args()
    timestamp = utc_now()
    manifest_path = RAW_OUT / "manifest.json"
    results: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    for idx, area_id in enumerate(args.selected_areas):
        config = args.configs[area_id]
        print(f"[spatial-data] Downloading {area_id} {config.get('name')} in bbox {config['bbox']}", flush=True)
        try:
            result = acquire_area(area_id, config, overwrite=args.overwrite, pause_s=args.pause_seconds if idx < len(args.selected_areas) - 1 else 0)
            results.append(result)
            print(f"[spatial-data] {area_id}: {result['raw_feature_count']} source features; {result['processed_clipped_feature_count']} clipped features", flush=True)
        except Exception as exc:  # keep other areas running, but record exact failures
            failures.append({"study_area_id": area_id, "error_type": type(exc).__name__, "error": str(exc)})
            print(f"[spatial-data][ERROR] {area_id}: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)

    manifest = {
        "project": "UrbanCoolSim",
        "manifest_type": "real_osm_vector_acquisition_run",
        "run_started_at_utc": timestamp,
        "run_finished_at_utc": utc_now(),
        "source": "OpenStreetMap via OSMnx / Overpass API",
        "retrieval_library": "OSMnx",
        "source_home": OSM_HOME_URL,
        "source_copyright_and_license": OSM_COPYRIGHT_URL,
        "source_license": OSM_LICENSE,
        "attribution_required": OSM_ATTRIBUTION,
        "query_tags_union": OSM_TAGS,
        "source_of_analysis_windows": "backend/app/spatial/geo_digital_twin.py::STUDY_AREA_CONFIGS",
        "official_boundaries_verified": False,
        "coordinate_reference_system": "WGS 84 / EPSG:4326, coordinates [longitude, latitude]",
        "configured_projected_crs_is_metadata_only_until_explicit_reprojection": True,
        "areas_succeeded": results,
        "areas_failed": failures,
        "status": "DOWNLOADED_ALL_REQUESTED_AREAS" if not failures and len(results) == len(args.selected_areas) else ("PARTIAL" if results else "FAILED"),
    }
    write_json_atomic(manifest_path, manifest)
    print(f"[spatial-data] Manifest: {manifest_path.relative_to(PROJECT_ROOT)}")
    print(f"[spatial-data] Status: {manifest['status']}")
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())
