"""
geo_digital_twin.py

High-Precision Vector-to-Microgrid Geospatial Digital Twin Engine.
Replaces crude synthetic grid slicing with georeferenced rasterization of
real-world building footprints, water bodies, road corridors, and vegetation canopies.

Directly coupled with the EnergyBalanceSolver for deterministic, first-principles
thermodynamic microclimate simulation.
"""

import os
import json
import math
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
import numpy as np
import matplotlib.path as mpath
import pyproj

from app.physics.energy_balance import EnergyBalanceSolver

DATA_DIR = Path(__file__).resolve().parent / "data"


def resolve_osm_processed_dir() -> Path:
    """
    Robustly resolves the clipped OpenStreetMap spatial vector directory across:
    1. Explicit environment variable OSM_PROCESSED_DIR
    2. Local monorepo repository root (parents[3])
    3. Standalone backend directory (parents[2])
    4. Docker container standard mount (/app/dataset/processed/spatial_vectors)
    5. Relative working directories
    6. Curated fallback data directory
    """
    env_dir = os.getenv("OSM_PROCESSED_DIR")
    if env_dir:
        p = Path(env_dir)
        if p.exists():
            return p

    candidates = [
        Path(__file__).resolve().parents[3] / "dataset" / "processed" / "spatial_vectors",
        Path(__file__).resolve().parents[2] / "dataset" / "processed" / "spatial_vectors",
        Path("/app/dataset/processed/spatial_vectors"),
        Path("/dataset/processed/spatial_vectors"),
        Path("dataset/processed/spatial_vectors"),
        Path("../dataset/processed/spatial_vectors"),
    ]
    for c in candidates:
        if c.exists() and any(c.glob("*clipped.geojson")):
            return c
    return DATA_DIR


OSM_PROCESSED_DIR = resolve_osm_processed_dir()


def normalize_spatial_feature(feat: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalizes OpenStreetMap acquired vector features into the internal rasterizer schema.
    Maps feature_class ('building', 'transport', 'green_space', 'water', 'landuse_context')
    and extracts heights, road widths, and vegetation attributes from osm_tags.
    """
    props = feat.get("properties", {})
    geom = feat.get("geometry", {})
    osm_tags = props.get("osm_tags") or {}

    # If already using legacy curated format with props.type
    if "type" in props and "feature_class" not in props:
        return feat

    f_class = props.get("feature_class", "")
    norm_props = dict(props)
    name = osm_tags.get("name") or props.get("name") or ""
    norm_props["name"] = name

    if f_class == "building":
        norm_props["type"] = "building"
        raw_height = osm_tags.get("height")
        height = 22.0
        if raw_height:
            try:
                cleaned = str(raw_height).replace("m", "").replace("meters", "").strip()
                parsed_h = float(cleaned)
                height = parsed_h if parsed_h > 0.0 else 22.0
            except (ValueError, TypeError):
                height = 22.0
        elif "building:levels" in osm_tags:
            try:
                levels = float(osm_tags["building:levels"])
                height = max(3.5, levels * 3.5) if levels > 0.0 else 22.0
            except (ValueError, TypeError):
                height = 22.0
        norm_props["height"] = round(height, 1)
        norm_props["albedo"] = 0.19

    elif f_class == "transport":
        norm_props["type"] = "road"
        hw = osm_tags.get("highway", "")
        if hw in ("motorway", "trunk", "motorway_link", "trunk_link"):
            w_m = 24.0
        elif hw in ("primary", "primary_link"):
            w_m = 18.0
        elif hw in ("secondary", "secondary_link"):
            w_m = 14.0
        elif hw in ("tertiary", "tertiary_link"):
            w_m = 12.0
        elif hw in ("residential", "living_street", "unclassified"):
            w_m = 10.0
        elif hw in ("service", "footway", "pedestrian", "cycleway", "path", "track"):
            w_m = 6.0
        else:
            w_m = 10.0
        norm_props["width_m"] = w_m
        norm_props["albedo"] = 0.10

    elif f_class == "green_space":
        norm_props["type"] = "park"
        norm_props["veg_fraction"] = 0.85
        norm_props["canopy_height"] = 14.0
        norm_props["albedo"] = 0.22

    elif f_class == "water":
        norm_props["type"] = "water"
        norm_props["albedo"] = 0.06
        norm_props["width_m"] = 25.0

    elif f_class == "landuse_context":
        norm_props["type"] = "landuse"
        norm_props["albedo"] = 0.18

    else:
        norm_props["type"] = f_class or "other"

    return {
        "type": feat.get("type", "Feature"),
        "properties": norm_props,
        "geometry": geom
    }


# Accurate Bounding Boxes (EPSG:4326 WGS-84 [west, south, east, north]) and Centers
STUDY_AREA_CONFIGS: Dict[str, Dict[str, Any]] = {
    "mumbai_bkc": {
        "name": "Bandra Kurla Complex (BKC)",
        "city": "Mumbai",
        "country": "India",
        "crs": "EPSG:32643",
        "center": [72.8683, 19.0657],
        "bbox": [72.8610, 19.0590, 72.8756, 19.0724],
        "resolution_m": 10.0,
        "analysis_window_area_m2": 2335792.9,
        "analysis_window_width_m": 1554.92,
        "analysis_window_height_m": 1502.19,
        "district_area_m2": 2335792.9,
        "typology": "coastal_commercial",
        "base_climate": {
            "air_temp_c": 36.5,
            "solar_rad_wm2": 840.0,
            "rel_humidity": 0.75,
            "wind_speed_ms": 3.8,
            "q_f_wm2": 50.0
        }
    },
    "delhi_cp": {
        "name": "Connaught Place Radial District",
        "city": "New Delhi",
        "country": "India",
        "crs": "EPSG:32643",
        "center": [77.2197, 28.6328],
        "bbox": [77.2130, 28.6270, 77.2264, 28.6386],
        "resolution_m": 10.0,
        "analysis_window_area_m2": 1747713.2,
        "analysis_window_width_m": 1334.16,
        "analysis_window_height_m": 1309.97,
        "district_area_m2": 1747713.2,
        "typology": "commercial_radial",
        "base_climate": {
            "air_temp_c": 42.0,
            "solar_rad_wm2": 920.0,
            "rel_humidity": 0.35,
            "wind_speed_ms": 2.2,
            "q_f_wm2": 45.0
        }
    },
    "singapore_marina": {
        "name": "Marina Bay Financial District",
        "city": "Singapore",
        "country": "Singapore",
        "crs": "EPSG:32648",
        "center": [103.8565, 1.2847],
        "bbox": [103.8495, 1.2780, 103.8635, 1.2914],
        "resolution_m": 10.0,
        "analysis_window_area_m2": 2309763.4,
        "analysis_window_width_m": 1558.44,
        "analysis_window_height_m": 1482.10,
        "district_area_m2": 2309763.4,
        "typology": "tropical_waterfront",
        "base_climate": {
            "air_temp_c": 33.0,
            "solar_rad_wm2": 880.0,
            "rel_humidity": 0.82,
            "wind_speed_ms": 2.8,
            "q_f_wm2": 40.0
        }
    },
    "phoenix_downtown": {
        "name": "Downtown Urban Core",
        "city": "Phoenix, AZ",
        "country": "USA",
        "crs": "EPSG:32612",
        "center": [-112.0740, 33.4484],
        "bbox": [-112.0810, 33.4420, -112.0670, 33.4548],
        "resolution_m": 10.0,
        "analysis_window_area_m2": 1885263.3,
        "analysis_window_width_m": 1315.92,
        "analysis_window_height_m": 1432.66,
        "district_area_m2": 1885263.3,
        "typology": "arid_desert_grid",
        "base_climate": {
            "air_temp_c": 45.0,
            "solar_rad_wm2": 1020.0,
            "rel_humidity": 0.18,
            "wind_speed_ms": 2.0,
            "q_f_wm2": 55.0
        }
    },
    "tokyo_shinjuku": {
        "name": "Shinjuku Skyscraper Center",
        "city": "Tokyo",
        "country": "Japan",
        "crs": "EPSG:32654",
        "center": [139.6965, 35.6905],
        "bbox": [139.6895, 35.6840, 139.7035, 35.6970],
        "resolution_m": 10.0,
        "analysis_window_area_m2": 1875876.9,
        "analysis_window_width_m": 1285.95,
        "analysis_window_height_m": 1458.75,
        "district_area_m2": 1875876.9,
        "typology": "hyperdense_canyon",
        "base_climate": {
            "air_temp_c": 35.5,
            "solar_rad_wm2": 860.0,
            "rel_humidity": 0.68,
            "wind_speed_ms": 2.4,
            "q_f_wm2": 65.0
        }
    }
}


def validate_grid_parameters(
    grid_mode: Optional[str] = None,
    resolution_m: Optional[float] = None,
    rows: Optional[int] = None,
    cols: Optional[int] = None,
) -> Tuple[str, Optional[float], Optional[int], Optional[int]]:
    """
    Authoritative, shared validator for grid dimensions and resolution modes across
    /api/v1/digital-twin/grid, /api/v1/digital-twin/inspect-cell, and /api/v1/thermal/simulate.

    Enforces:
    1. Bounds: rows and cols must be within [10, 250] when supplied.
    2. Parity: rows and cols must be provided together.
    3. Exclusivity: cannot specify explicit dimensions (rows/cols) together with resolution parameters.
    4. Consistency:
       - grid_mode='metric_10m' requires resolution_m=10.0 or omitted.
       - grid_mode='standard' rejects resolution_m=10.0 (must use metric_10m mode) or custom resolution_m.
    5. Normalizes defaults:
       - Resolution mode returns (mode, res_m, None, None).
       - Explicit dimensions returns ('standard', None, rows, cols).
       - Unspecified returns ('standard', None, 50, 50).
    """
    # 1. Bounds check on rows/cols when supplied
    if rows is not None and (rows < 10 or rows > 250):
        raise ValueError(f"rows must be between 10 and 250 (received rows={rows}).")
    if cols is not None and (cols < 10 or cols > 250):
        raise ValueError(f"cols must be between 10 and 250 (received cols={cols}).")

    has_any_dim = (rows is not None or cols is not None)
    has_resolution = (resolution_m is not None or grid_mode == "metric_10m")

    # 2. Mutual exclusivity check: if any dimension param is mixed with resolution
    if has_any_dim and has_resolution:
        raise ValueError(
            "Conflicting grid dimension parameters: specify either explicit dimensions (rows, cols) "
            "or resolution parameters (grid_mode='metric_10m', resolution_m), not both."
        )

    # 3. Parity check: both must be supplied if either is supplied
    if (rows is not None and cols is None) or (cols is not None and rows is None):
        raise ValueError("Both rows and cols must be specified together.")

    # 4. Consistency checks
    if grid_mode == "metric_10m" and resolution_m is not None and abs(resolution_m - 10.0) > 0.01:
        raise ValueError(
            f"Conflicting resolution: grid_mode='metric_10m' requires resolution_m=10.0 or omitted, "
            f"but got resolution_m={resolution_m}."
        )

    if grid_mode == "standard" and resolution_m is not None:
        if abs(resolution_m - 10.0) < 0.01:
            raise ValueError(
                "Conflicting resolution mode: resolution_m=10.0 corresponds to grid_mode='metric_10m', "
                "but grid_mode was set to 'standard'."
            )
        else:
            raise ValueError(
                f"Conflicting resolution parameters: resolution_m cannot be specified when grid_mode is 'standard'. "
                f"Use grid_mode='metric_10m' for metric rasterization."
            )

    # 5. Normalization
    if has_resolution:
        norm_mode = "metric_10m" if (grid_mode == "metric_10m" or (resolution_m is not None and abs(resolution_m - 10.0) < 0.01)) else "standard"
        norm_res = float(resolution_m if resolution_m is not None else 10.0)
        return (norm_mode, norm_res, None, None)
    elif has_any_dim:
        return ("standard", None, int(rows), int(cols))
    else:
        return ("standard", None, 50, 50)


def get_study_area_metric_extents(study_area_id: str) -> Dict[str, Any]:
    """
    Computes exact metric extents and analysis-window area using the configured local projected UTM CRS via pyproj.
    Uses the 4-corner bounding envelope to account for meridian convergence in conformal projections.
    Returns width_m, height_m, analysis_window_area_m2, and projected bounding box coordinates.
    """
    if study_area_id not in STUDY_AREA_CONFIGS:
        raise ValueError(f"Unsupported study_area_id: {study_area_id}")
    cfg = STUDY_AREA_CONFIGS[study_area_id]
    west, south, east, north = cfg["bbox"]
    crs = cfg["crs"]
    transformer = pyproj.Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    corners = [
        (west, south),
        (east, south),
        (east, north),
        (west, north)
    ]
    xs, ys = zip(*[transformer.transform(x, y) for x, y in corners])
    xmin, xmax = min(xs), max(xs)
    ymin, ymax = min(ys), max(ys)
    width_m = xmax - xmin
    height_m = ymax - ymin
    area_m2 = width_m * height_m
    return {
        "study_area_id": study_area_id,
        "projected_crs": crs,
        "xmin": xmin,
        "ymin": ymin,
        "xmax": xmax,
        "ymax": ymax,
        "width_m": round(float(width_m), 2),
        "height_m": round(float(height_m), 2),
        "analysis_window_area_m2": round(float(area_m2), 1),
        "district_area_m2": round(float(area_m2), 1),
        "calculation_method": f"Projected Cartesian area in {crs} via pyproj (4-corner envelope)"
    }


def dist_point_to_segment_metric(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
    """Euclidean distance in meters from (px, py) to segment (x1, y1)-(x2, y2) in projected Cartesian coordinates."""
    dx = x2 - x1
    dy = y2 - y1
    l2 = dx * dx + dy * dy
    if l2 == 0.0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / l2))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.hypot(px - proj_x, py - proj_y)


def dist_point_to_segment_m(px, py, x1, y1, x2, y2, cos_lat):
    """Legacy Euclidean distance helper using equirectangular approximation."""
    dx = (x2 - x1) * 111320.0 * cos_lat
    dy = (y2 - y1) * 111320.0
    l2 = dx * dx + dy * dy
    if l2 == 0:
        dpx = (px - x1) * 111320.0 * cos_lat
        dpy = (py - y1) * 111320.0
        return math.sqrt(dpx * dpx + dpy * dpy)
    t = max(0.0, min(1.0, (((px - x1) * 111320.0 * cos_lat * dx) + ((py - y1) * 111320.0 * dy)) / l2))
    proj_x = x1 + t * (x2 - x1)
    proj_y = y1 + t * (y2 - y1)
    dpx = (px - proj_x) * 111320.0 * cos_lat
    dpy = (py - proj_y) * 111320.0
    return math.sqrt(dpx * dpx + dpy * dpy)


class GeoDigitalTwinEngine:
    """High-Fidelity Real-World Spatial Vector-to-Microgrid Ingestion & Simulation Engine."""

    def __init__(self, data_dir: Optional[Path] = None, osm_dir: Optional[Path] = None):
        self.data_dir = data_dir or DATA_DIR
        self.osm_dir = osm_dir or OSM_PROCESSED_DIR
        self._geojson_cache: Dict[str, Dict[str, Any]] = {}

    def get_study_area_geojson(self, study_area_id: str) -> Optional[Dict[str, Any]]:
        """
        Loads the active GeoJSON feature collection for the study area.
        Prefers live acquired & clipped OpenStreetMap features from dataset/processed/spatial_vectors/,
        falling back to backend/app/spatial/data/{study_area_id}_geo.json if unavailable.
        """
        if study_area_id in self._geojson_cache:
            return self._geojson_cache[study_area_id]

        osm_path = self.osm_dir / f"{study_area_id}_features_clipped.geojson"
        curated_path = self.data_dir / f"{study_area_id}_geo.json"

        loaded_data = None

        if osm_path.exists():
            try:
                with open(osm_path, "r", encoding="utf-8") as f:
                    raw_data = json.load(f)
                norm_features = [normalize_spatial_feature(feat) for feat in raw_data.get("features", [])]
                loaded_data = {
                    "type": "FeatureCollection",
                    "metadata": {
                        "study_area_id": study_area_id,
                        "data_source": "bundled_osm_snapshot",
                        "snapshot_date": "2026-10-26",
                        "source_file": osm_path.name,
                        "feature_count": len(norm_features),
                        "data_provenance": "OpenStreetMap Overpass physical vector snapshot (ODbL 1.0, © OpenStreetMap contributors)",
                        "retrieved_at_utc": norm_features[0].get("properties", {}).get("retrieved_at_utc") if norm_features else "2026-10-26T00:00:00Z"
                    },
                    "features": norm_features
                }
            except Exception as e:
                print(f"[GeoDigitalTwinEngine] Warning: Failed loading OSM data from {osm_path}: {e}")

        if loaded_data is None and curated_path.exists():
            try:
                with open(curated_path, "r", encoding="utf-8") as f:
                    raw_data = json.load(f)
                loaded_data = {
                    "type": "FeatureCollection",
                    "metadata": {
                        "study_area_id": study_area_id,
                        "data_source": "curated_fallback",
                        "source_file": curated_path.name,
                        "feature_count": len(raw_data.get("features", [])),
                        "data_provenance": "Bundled curated vector geometries"
                    },
                    "features": [normalize_spatial_feature(feat) for feat in raw_data.get("features", [])]
                }
            except Exception as e:
                print(f"[GeoDigitalTwinEngine] Error loading curated data from {curated_path}: {e}")
                return None

        if loaded_data:
            self._geojson_cache[study_area_id] = loaded_data
        return loaded_data

    def get_building_features(self, study_area_id: str) -> Dict[str, Any]:
        """Returns only building features formatted for direct deck.gl extrusion."""
        geojson = self.get_study_area_geojson(study_area_id)
        if not geojson:
            return {"type": "FeatureCollection", "features": []}

        buildings = [
            f for f in geojson.get("features", [])
            if f.get("properties", {}).get("type") == "building"
        ]
        return {
            "type": "FeatureCollection",
            "metadata": geojson.get("metadata", {}),
            "features": buildings
        }

    def generate_microgrid(
        self,
        study_area_id: str = "mumbai_bkc",
        rows: Optional[int] = 50,
        cols: Optional[int] = 50,
        custom_bbox: Optional[List[float]] = None,
        resolution_m: Optional[float] = None,
        grid_mode: str = "standard"
    ) -> Dict[str, Any]:
        """
        Rasterizes real vector polygons into high-precision, physics-grounded microgrid layers.
        Supports standard dimensions (e.g. 50x50, 100x100) or metric 10m grid mode.
        """
        if study_area_id not in STUDY_AREA_CONFIGS:
            raise ValueError(f"Unsupported study_area_id: {study_area_id}")

        config = STUDY_AREA_CONFIGS[study_area_id]
        bbox = custom_bbox or config["bbox"]
        west, south, east, north = bbox
        center_lon, center_lat = config["center"]
        crs = config["crs"]

        # Local projected metric transformation
        to_proj = pyproj.Transformer.from_crs("EPSG:4326", crs, always_xy=True)
        to_wgs84 = pyproj.Transformer.from_crs(crs, "EPSG:4326", always_xy=True)

        corners = [
            (west, south),
            (east, south),
            (east, north),
            (west, north)
        ]
        xs, ys = zip(*[to_proj.transform(x, y) for x, y in corners])
        xmin, xmax = min(xs), max(xs)
        ymin, ymax = min(ys), max(ys)
        proj_width_m = max(10.0, xmax - xmin)
        proj_height_m = max(10.0, ymax - ymin)
        analysis_window_area_m2 = proj_width_m * proj_height_m

        # Metric grid resolution and dimensions
        if grid_mode == "metric_10m" or resolution_m is not None:
            target_res = float(resolution_m if resolution_m is not None else 10.0)
            if target_res <= 0:
                raise ValueError("resolution_m must be a positive number")
            cols = max(1, round(proj_width_m / target_res))
            rows = max(1, round(proj_height_m / target_res))
        else:
            if rows is None:
                rows = 50
            if cols is None:
                cols = 50

        if rows < 1 or cols < 1:
            raise ValueError("rows and cols must be positive integers")

        # Cell safety budget enforcement (prevent unbounded memory allocation)
        MAX_CELL_BUDGET = 50000
        if rows * cols > MAX_CELL_BUDGET:
            raise ValueError(f"Requested grid size ({rows}x{cols} = {rows * cols} cells) exceeds safe budget of {MAX_CELL_BUDGET} cells.")

        # Stable per-area random stream: the generated proxy layers must be
        # reproducible across repeated GETs, workers, and process restarts.
        seed_payload = f"urbancoolsim-grid-v2:{study_area_id}:{rows}:{cols}".encode("utf-8")
        seed = int.from_bytes(hashlib.sha256(seed_payload).digest()[:8], "big", signed=False)
        rng = np.random.default_rng(seed)

        # Effective resolution in native metric projected CRS
        dx = proj_width_m / max(cols, 1)
        dy = proj_height_m / max(rows, 1)
        effective_resolution_x_m = dx
        effective_resolution_y_m = dy
        effective_resolution_m = (dx + dy) / 2.0
        is_metric_10m = bool(grid_mode == "metric_10m" or (resolution_m is not None and abs(resolution_m - 10.0) < 0.1))

        # 1. 2D Coordinate Grid Setup in Projected Metric Space (UTM meters)
        x_centers = xmin + (np.arange(cols, dtype=float) + 0.5) * dx
        y_centers = ymax - (np.arange(rows, dtype=float) + 0.5) * dy  # row 0 at north / ymax
        x_grid, y_grid = np.meshgrid(x_centers, y_centers)
        grid_points_proj = np.column_stack([x_grid.ravel(), y_grid.ravel()])

        # Geographic coordinates for standard GeoJSON / deck.gl interchange
        lons_grid, lats_grid = to_wgs84.transform(x_grid, y_grid)

        # Initialize physical layers
        water_frac = np.zeros((rows, cols), dtype=float)
        veg_frac = np.zeros((rows, cols), dtype=float)
        canopy_height = np.zeros((rows, cols), dtype=float)
        bldg_density = np.zeros((rows, cols), dtype=float)
        bldg_height = np.zeros((rows, cols), dtype=float)
        road_mask = np.zeros((rows, cols), dtype=float)
        albedo = np.full((rows, cols), 0.18, dtype=float)
        cell_landmarks: List[List[str]] = [["" for _ in range(cols)] for _ in range(rows)]

        geojson = self.get_study_area_geojson(study_area_id)
        features = geojson.get("features", []) if geojson else []

        # 2. Rasterize Vector Features with Projected Metric Geometry and Bounding-Box Acceleration
        for feat in features:
            props = feat.get("properties", {})
            geom = feat.get("geometry", {})
            ftype = props.get("type", "")
            fname = props.get("name", "")
            gtype = geom.get("type", "")
            coords = geom.get("coordinates", [])

            # Extract polygons (supports Polygon and MultiPolygon)
            if gtype == "Polygon" and len(coords) > 0:
                polys = [coords[0]]
            elif gtype == "MultiPolygon":
                polys = [p[0] for p in coords if len(p) > 0]
            else:
                polys = []

            # Extract lines (supports LineString and MultiLineString)
            if gtype == "LineString" and len(coords) >= 2:
                lines = [coords]
            elif gtype == "MultiLineString":
                lines = [line for line in coords if len(line) >= 2]
            else:
                lines = []

            # Reproject polygons to local UTM projected CRS
            polys_proj = []
            for poly in polys:
                if len(poly) >= 3:
                    poly_proj = [to_proj.transform(pt[0], pt[1]) for pt in poly]
                    polys_proj.append(poly_proj)

            # Reproject lines to local UTM projected CRS
            lines_proj = []
            for line in lines:
                if len(line) >= 2:
                    line_proj = [to_proj.transform(pt[0], pt[1]) for pt in line]
                    lines_proj.append(line_proj)

            # Water Bodies
            if ftype == "water":
                for poly_p in polys_proj:
                    path = mpath.Path(poly_p)
                    mask = path.contains_points(grid_points_proj).reshape((rows, cols))
                    water_frac[mask] = 0.98
                    albedo[mask] = props.get("albedo", 0.06)
                    if fname:
                        for r, c in zip(*np.where(mask)):
                            cell_landmarks[r][c] = fname
                if lines_proj:
                    w_m = props.get("width_m", 25.0)
                    half_w = w_m / 2.0
                    for line_p in lines_proj:
                        for i in range(len(line_p) - 1):
                            x1, y1 = line_p[i]
                            x2, y2 = line_p[i + 1]
                            min_x = min(x1, x2) - half_w
                            max_x = max(x1, x2) + half_w
                            min_y = min(y1, y2) - half_w
                            max_y = max(y1, y2) + half_w
                            c0 = max(0, int((min_x - xmin) / dx))
                            c1 = min(cols, int((max_x - xmin) / dx) + 1)
                            r0 = max(0, int((ymax - max_y) / dy))
                            r1 = min(rows, int((ymax - min_y) / dy) + 1)
                            if c0 >= cols or r0 >= rows or c1 <= 0 or r1 <= 0:
                                continue
                            for r in range(r0, r1):
                                py = y_centers[r]
                                for c in range(c0, c1):
                                    px = x_centers[c]
                                    dist = dist_point_to_segment_metric(px, py, x1, y1, x2, y2)
                                    if dist <= half_w:
                                        frac = max(0.65, 1.0 - (dist / half_w) * 0.35)
                                        water_frac[r, c] = max(water_frac[r, c], frac)
                                        albedo[r, c] = 0.06
                                        if fname and not cell_landmarks[r][c]:
                                            cell_landmarks[r][c] = fname

            # Parks & Vegetated Grounds
            elif ftype == "park":
                for poly_p in polys_proj:
                    path = mpath.Path(poly_p)
                    mask = path.contains_points(grid_points_proj).reshape((rows, cols))
                    vf = props.get("veg_fraction", 0.85)
                    ch = props.get("canopy_height", 14.0)
                    veg_frac[mask] = np.maximum(veg_frac[mask], vf)
                    canopy_height[mask] = np.maximum(canopy_height[mask], ch)
                    albedo[mask] = props.get("albedo", 0.22)
                    if fname:
                        for r, c in zip(*np.where(mask)):
                            cell_landmarks[r][c] = fname

            # Roads & Street Canyons
            elif ftype == "road":
                if lines_proj:
                    w_m = props.get("width_m", 12.0)
                    half_w = w_m / 2.0
                    for line_p in lines_proj:
                        for i in range(len(line_p) - 1):
                            x1, y1 = line_p[i]
                            x2, y2 = line_p[i + 1]
                            min_x = min(x1, x2) - half_w
                            max_x = max(x1, x2) + half_w
                            min_y = min(y1, y2) - half_w
                            max_y = max(y1, y2) + half_w
                            c0 = max(0, int((min_x - xmin) / dx))
                            c1 = min(cols, int((max_x - xmin) / dx) + 1)
                            r0 = max(0, int((ymax - max_y) / dy))
                            r1 = min(rows, int((ymax - min_y) / dy) + 1)
                            if c0 >= cols or r0 >= rows or c1 <= 0 or r1 <= 0:
                                continue
                            for r in range(r0, r1):
                                py = y_centers[r]
                                for c in range(c0, c1):
                                    px = x_centers[c]
                                    dist = dist_point_to_segment_metric(px, py, x1, y1, x2, y2)
                                    if dist <= half_w:
                                        road_mask[r, c] = 1.0
                                        albedo[r, c] = props.get("albedo", 0.10)
                                        water_frac[r, c] = min(water_frac[r, c], 0.05)
                                        veg_frac[r, c] = min(veg_frac[r, c], 0.10)
                                        bldg_density[r, c] = 0.0
                                        if fname and not cell_landmarks[r][c]:
                                            cell_landmarks[r][c] = fname
                for poly_p in polys_proj:
                    path = mpath.Path(poly_p)
                    mask = path.contains_points(grid_points_proj).reshape((rows, cols))
                    road_mask[mask] = 1.0
                    albedo[mask] = props.get("albedo", 0.10)
                    water_frac[mask] = np.minimum(water_frac[mask], 0.05)
                    veg_frac[mask] = np.minimum(veg_frac[mask], 0.10)
                    bldg_density[mask] = 0.0
                    if fname:
                        for r, c in zip(*np.where(mask)):
                            cell_landmarks[r][c] = fname

            # Building Footprints
            elif ftype == "building":
                for poly_p in polys_proj:
                    path = mpath.Path(poly_p)
                    mask = path.contains_points(grid_points_proj).reshape((rows, cols))
                    bh = props.get("height", 22.0)
                    bd = 0.82
                    bldg_density[mask] = np.maximum(bldg_density[mask], bd)
                    bldg_height[mask] = np.maximum(bldg_height[mask], bh)
                    albedo[mask] = props.get("albedo", 0.19)
                    canopy_height[mask] = 0.0
                    veg_frac[mask] = 0.02
                    water_frac[mask] = 0.0
                    if fname:
                        for r, c in zip(*np.where(mask)):
                            cell_landmarks[r][c] = fname

        # 3. Avenue Street Trees (Organic verges along road corridors)
        road_edge = (road_mask > 0.5) & (bldg_density < 0.2) & (water_frac < 0.2)
        noise = rng.uniform(0, 1, (rows, cols))
        avenue_trees = road_edge & (noise > 0.65)
        veg_frac[avenue_trees] = np.maximum(veg_frac[avenue_trees], 0.45)
        canopy_height[avenue_trees] = np.maximum(canopy_height[avenue_trees], 12.0)

        # 4. Consistency & Bounds Clamping
        water_frac = np.clip(water_frac, 0.0, 1.0)
        bldg_density = np.clip(bldg_density, 0.0, 0.95)
        bldg_height = np.clip(bldg_height, 0.0, 300.0)
        veg_frac = np.clip(veg_frac, 0.0, 0.98)
        canopy_height = np.where(veg_frac > 0.05, canopy_height, 0.0)
        canopy_height = np.clip(canopy_height, 0.0, 28.0)
        albedo = np.clip(albedo, 0.06, 0.45)

        # 5. Derived Physical Layers
        canyon_width = 24.0
        svf = np.clip(np.cos(np.arctan(2.0 * bldg_height / canyon_width)), 0.12, 0.98)
        lai = np.clip(veg_frac * (canopy_height / 3.4), 0.0, 6.0)
        
        # Anthropogenic heat flux (Qf) from building density and traffic
        base_qf = config["base_climate"]["q_f_wm2"]
        activity_mask = (bldg_density > 0.01) | (road_mask > 0.01)
        qf_anthro = np.clip(
            (bldg_density * base_qf * 1.35) + (road_mask * 18.0) + rng.normal(0, 1.2, (rows, cols)),
            0.0, 95.0
        )
        qf_anthro = np.where(activity_mask & (water_frac <= 0.3), qf_anthro, 0.0)

        # Population exposure density proxy
        pop_density = np.clip(
            (bldg_density * 450.0) + (road_mask * 120.0) + rng.normal(0, 8.0, (rows, cols)),
            0.0, 680.0
        )
        pop_density = np.where(activity_mask & (water_frac <= 0.3), pop_density, 0.0)

        # Surface emissivity
        emissivity = np.clip(0.91 + (veg_frac * 0.06) + (water_frac * 0.07) - (bldg_density * 0.02), 0.88, 0.98)

        # 6. Physical Microclimate Surface Temperature Solve via EnergyBalanceSolver
        clim = config["base_climate"]
        solver = EnergyBalanceSolver(
            solar_rad=clim["solar_rad_wm2"],
            air_temp_c=clim["air_temp_c"],
            rel_humidity=clim.get("rel_humidity", 0.45),
            wind_speed=clim.get("wind_speed_ms", 2.5)
        )
        
        grid_inputs = {
            "albedo": albedo,
            "emissivity": emissivity,
            "veg_fraction": veg_frac,
            "water_fraction": water_frac,
            "building_height": bldg_height,
            "building_density": bldg_density,
            "q_f": qf_anthro
        }
        
        seb_solution = solver.solve_grid(grid_inputs, interventions={})
        seb_t = np.round(seb_solution["T_surface_c"], 2)

        # Micro-scale canyon trapping and water thermal sink reconciliation
        delta_urban_canyon = (1.0 - svf) * 2.5 + (bldg_density * 2.5)
        delta_water_sink = -1.0 * water_frac * 8.5
        delta_veg_sink = -1.0 * veg_frac * 4.0

        base_t = np.round(seb_t + delta_urban_canyon + delta_water_sink + delta_veg_sink, 2)

        modelled_coverage_mask = (
            (bldg_density > 0.01)
            | (road_mask > 0.5)
            | (veg_frac > 0.05)
            | (water_frac > 0.05)
        ).astype(np.uint8)

        geo_meta = geojson.get("metadata", {}) if geojson else {}
        active_source = geo_meta.get("data_source", "curated_fallback")
        source_file = geo_meta.get("source_file", "")
        feature_count = len(features)
        class_breakdown = {
            "building": sum(1 for f in features if f.get("properties", {}).get("type") == "building"),
            "transport": sum(1 for f in features if f.get("properties", {}).get("type") == "road"),
            "green_space": sum(1 for f in features if f.get("properties", {}).get("type") == "park"),
            "water": sum(1 for f in features if f.get("properties", {}).get("type") == "water"),
            "landuse": sum(1 for f in features if f.get("properties", {}).get("type") == "landuse"),
        }

        return {
            "metadata": {
                "study_area_id": study_area_id,
                "name": config["name"],
                "city": config["city"],
                "country": config["country"],
                "location": f"{config['city']}, {config['country']}",
                "crs": "EPSG:4326",
                "configured_projected_crs": config["crs"],
                "projected_crs": config["crs"],
                "bbox_crs": "EPSG:4326",
                "grid_coordinate_crs": "EPSG:4326",
                "distance_method": f"True projected metric grid in {config['crs']} via pyproj with native UTM meter coordinate rasterization; cell coordinates transformed to WGS 84 for standard GeoJSON interchange.",
                "resolution_m": round(float(effective_resolution_m), 3),
                "effective_resolution_x_m": round(float(effective_resolution_x_m), 3),
                "effective_resolution_y_m": round(float(effective_resolution_y_m), 3),
                "grid_mode": grid_mode,
                "is_metric_10m": is_metric_10m,
                "nominal_resolution_m": config["resolution_m"],
                "resolution_note": (
                    f"True metric 10m projected grid generated in {config['crs']}: {rows} rows x {cols} cols ({rows * cols} cells). Effective cell spacing is {round(effective_resolution_x_m, 3)} m (E-W) x {round(effective_resolution_y_m, 3)} m (N-S) per cell in local UTM coordinates."
                    if is_metric_10m else
                    f"Grid generated in {config['crs']} with {rows} rows x {cols} cols ({rows * cols} cells). nominal vs effective distinction: nominal target resolution is {config['resolution_m']} m, effective cell spacing is {round(effective_resolution_x_m, 3)} m (E-W) x "
                    f"{round(effective_resolution_y_m, 3)} m (N-S) per cell in local UTM coordinates."
                ),
                "rows": rows,
                "cols": cols,
                "total_cells": rows * cols,
                "typology": config["typology"],
                "center_lat": center_lat,
                "center_lon": center_lon,
                "bbox": bbox,
                "analysis_window_area_m2": round(float(analysis_window_area_m2), 1),
                "district_area_m2": round(float(analysis_window_area_m2), 1),
                "analysis_window_width_m": round(float(proj_width_m), 2),
                "analysis_window_height_m": round(float(proj_height_m), 2),
                "area_calculation_method": f"Projected Cartesian area in {config['crs']} via pyproj",
                "cell_geometry": {
                    "crs": config["crs"],
                    "unit": "meter",
                    "cell_width_m": round(float(effective_resolution_x_m), 3),
                    "cell_height_m": round(float(effective_resolution_y_m), 3),
                    "edge_policy": "Analysis window partitioned into equal intervals [x_c, x_{c+1}] x [y_{r+1}, y_r] in UTM meters; boundary cells included"
                },
                "base_climate": clim,
                # Provenance and active vector data tracking
                "active_data_source": active_source,
                "snapshot_date": "2026-10-26",
                "source_file": source_file,
                "vector_feature_count": feature_count,
                "features_by_class": class_breakdown,
                "data_provenance": geo_meta.get("data_provenance", "Bundled OpenStreetMap physical vector snapshot retrieved via Overpass API (ODbL 1.0, © OpenStreetMap contributors)"),
                "data_license": "ODbL-1.0 (© OpenStreetMap contributors)",
                "is_synthetic": False if active_source == "bundled_osm_snapshot" else True,
                "has_observed_satellite_lst": False,
                "contains_modelled_layers": True,
                "geometry_is_georeferenced": True,
                "coverage_note": "The modelled_coverage_mask marks cells supported by a rasterized building, road, park/vegetation, or water feature. Cells outside that mask use default physical assumptions and should be rendered as unsupported/transparent when visualizing spatial coverage.",
                "tag": "GEOREFERENCED VECTOR + SEB-MODELLED DIGITAL TWIN",
                "provenance_note": (
                    f"This grid path rasterizes bundled OpenStreetMap physical vector features ({feature_count} features from {source_file}, retrieved 2026-10-26) "
                    f"in local projected metric CRS {config['crs']} and computes thermal values with the SEB solver and empirical microclimate corrections."
                ),
                "layer_provenance": {
                    "building_density": f"Rasterized from {class_breakdown['building']} real building footprints ({active_source})",
                    "building_height": f"Building heights from {active_source} OSM tags/attributes; zero where no building is rasterized",
                    "veg_fraction": f"Rasterized from {class_breakdown['green_space']} parks/green features plus avenue-tree verges",
                    "water_fraction": f"Rasterized from {class_breakdown['water']} water bodies/corridors ({active_source})",
                    "albedo": "Feature attributes and configured defaults; not a Sentinel-2-derived raster in this path",
                    "baseline_temperature_c": "Modelled from SEB temperature plus urban-canyon, water-sink, and vegetation corrections; not satellite-observed",
                    "seb_temperature_c": "Modelled by the Surface Energy Balance solver",
                    "modelled_coverage_mask": "Binary support mask: 1 where mapped building/road/park/water morphology contributes; 0 where only default surface assumptions are available",
                    "population_density": "Building/road activity proxy with deterministic perturbation; zero outside mapped built/road activity; not a WorldPop raster",
                    "anthropogenic_heat_qf": "Building/road activity proxy with deterministic perturbation; zero outside mapped built/road activity; not VIIRS-derived",
                    "surface_emissivity": "Parameterized from vegetation, water, and building-density layers",
                    "sky_view_factor": "Derived from building height and an assumed canyon width",
                    "lai": "Derived from vegetation fraction and canopy height"
                },
                "sources": [
                    f"Active physical vectors: {active_source} ({source_file}, {feature_count} features)",
                    "Surface Energy Balance (SEB) thermodynamics",
                    "Empirical microclimate morphology and surface parameterization"
                ]
            },
            "layers": {
                "building_density": np.round(bldg_density, 3).tolist(),
                "building_height": np.round(bldg_height, 1).tolist(),
                "veg_fraction": np.round(veg_frac, 3).tolist(),
                "water_fraction": np.round(water_frac, 3).tolist(),
                "albedo": np.round(albedo, 3).tolist(),
                "baseline_temperature_c": base_t.tolist(),
                "seb_temperature_c": seb_t.tolist(),
                "modelled_coverage_mask": modelled_coverage_mask.tolist(),
                "canopy_height": np.round(canopy_height, 1).tolist(),
                "population_density": np.round(pop_density, 1).tolist(),
                "anthropogenic_heat_qf": np.round(qf_anthro, 1).tolist(),
                "surface_emissivity": np.round(emissivity, 3).tolist(),
                "sky_view_factor": np.round(svf, 3).tolist(),
                "lai": np.round(lai, 2).tolist(),
            },
            "landmarks": cell_landmarks
        }


# Global singleton engine instance
geo_twin_engine = GeoDigitalTwinEngine()
