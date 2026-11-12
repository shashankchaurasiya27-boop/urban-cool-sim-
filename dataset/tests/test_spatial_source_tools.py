from __future__ import annotations

import ast
import json
from pathlib import Path

from shapely.geometry import LineString, Polygon, box

from download_study_area_vectors import (
    classify_osm_tags,
    clip_geometry,
    load_study_area_configs,
    make_collection,
    json_safe,
    utc_now,
)


def test_source_of_truth_config_reads_all_five_areas():
    areas = load_study_area_configs()
    assert set(areas) == {"mumbai_bkc", "delhi_cp", "singapore_marina", "phoenix_downtown", "tokyo_shinjuku"}
    assert areas["delhi_cp"]["bbox"] == [77.213, 28.627, 77.2264, 28.6386]


def test_config_is_a_literal_and_has_expected_bbox_contract():
    source = Path(__file__).resolve().parents[2] / "backend/app/spatial/geo_digital_twin.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    found = any(isinstance(n, ast.AnnAssign) and getattr(n.target, "id", None) == "STUDY_AREA_CONFIGS" for n in tree.body)
    assert found
    areas = load_study_area_configs(source)
    for config in areas.values():
        assert len(config["bbox"]) == 4
        west, south, east, north = config["bbox"]
        assert -180 <= west < east <= 180
        assert -90 <= south < north <= 90


def test_osm_tags_are_classified_without_fabricated_measurements():
    assert classify_osm_tags({"building": "commercial"}) == "building"
    assert classify_osm_tags({"highway": "primary"}) == "transport"
    assert classify_osm_tags({"natural": "water"}) == "water"
    assert classify_osm_tags({"leisure": "park"}) == "green_space"
    assert classify_osm_tags({"landuse": "commercial"}) == "landuse_context"


def test_clip_geometry_limits_results_to_analysis_window_and_repairs_invalid_polygon():
    # Self-intersecting bow-tie polygon in a small geographic test window.
    invalid = Polygon([(0, 0), (2, 2), (0, 2), (2, 0), (0, 0)])
    clipped, repaired = clip_geometry(invalid, (0.25, 0.25, 1.75, 1.75))
    assert clipped is not None
    assert repaired is True
    assert clipped.is_valid
    assert box(0.25, 0.25, 1.75, 1.75).covers(clipped)


def test_clip_geometry_preserves_line_dimensions():
    line = LineString([(-1, 0.5), (2, 0.5)])
    clipped, repaired = clip_geometry(line, (0, 0, 1, 1))
    assert clipped is not None
    assert clipped.geom_type in {"LineString", "MultiLineString"}
    assert tuple(round(v, 6) for v in clipped.bounds) == (0.0, 0.5, 1.0, 0.5)
    assert repaired is False


def test_json_safe_handles_non_finite_values_and_nested_tags():
    value = json_safe({"height": float("nan"), "levels": 4, "tags": ["a", None, 2]})
    assert value == {"levels": 4, "tags": ["a", 2]}
    json.dumps(value, allow_nan=False)


def test_collection_marks_bbox_as_analysis_window_not_official_boundary():
    now = utc_now()
    fc = make_collection("delhi_cp", (77.2, 28.6, 77.3, 28.7), [], kind="test", retrieved_at=now, configured_crs="EPSG:32643")
    assert fc["type"] == "FeatureCollection"
    assert fc["metadata"]["analysis_window_is_official_boundary"] is False
    assert fc["metadata"]["source_license"] == "ODbL-1.0"
    assert "crs" not in fc
    assert fc["metadata"]["coordinate_order"] == "[longitude, latitude]"


def test_checked_in_analysis_window_manifest_matches_canonical_config():
    project_root = Path(__file__).resolve().parents[2]
    manifest = json.loads((project_root / "dataset/spatial_sources/study_area_manifest.json").read_text(encoding="utf-8"))
    areas = load_study_area_configs(project_root / "backend/app/spatial/geo_digital_twin.py")
    assert manifest["official_boundary_verified"] is False
    assert manifest["package_generation_download_status"] == "NOT_DOWNLOADED_IN_THIS_EXECUTION"
    for area_id, config in areas.items():
        entry = manifest["areas"][area_id]
        assert entry["analysis_bbox_wgs84"] == config["bbox"]
        assert entry["configured_projected_crs"] == config["crs"]
        assert entry["boundary_status"].startswith("analysis_window_bbox_only")


def test_feature_collection_does_not_misstate_bbox_as_feature_extent():
    now = utc_now()
    fc = make_collection("delhi_cp", (77.2, 28.6, 77.3, 28.7), [], kind="test", retrieved_at=now, configured_crs="EPSG:32643")
    assert "bbox" not in fc
    assert fc["metadata"]["analysis_window_wgs84"] == [77.2, 28.6, 77.3, 28.7]


def test_mocked_osm_acquisition_writes_provenance_raw_and_clipped_snapshots(tmp_path, monkeypatch):
    import sys
    from types import SimpleNamespace

    import geopandas as gpd
    import pandas as pd

    import download_study_area_vectors as downloader

    source_geometry = Polygon([(-0.5, 0.2), (0.5, 0.2), (0.5, 0.8), (-0.5, 0.8), (-0.5, 0.2)])
    frame = gpd.GeoDataFrame(
        {"building": ["commercial"], "name": ["Mapped OSM test footprint"], "height": ["12"]},
        geometry=[source_geometry],
        crs="EPSG:4326",
        index=pd.MultiIndex.from_tuples([("way", 987654321)], names=["element", "id"]),
    )

    def fake_fetch(*, bbox, tags):
        assert bbox == (0.0, 0.0, 1.0, 1.0)
        assert "building" in tags
        return frame

    fake_osmnx = SimpleNamespace(
        settings=SimpleNamespace(use_cache=False, log_console=False, requests_timeout=0, overpass_rate_limit=False),
        features=SimpleNamespace(features_from_bbox=fake_fetch),
    )
    monkeypatch.setitem(sys.modules, "osmnx", fake_osmnx)
    monkeypatch.setattr(downloader, "RAW_OUT", tmp_path / "raw" / "osm")
    monkeypatch.setattr(downloader, "PROCESSED_OUT", tmp_path / "processed" / "vectors")
    monkeypatch.setattr(downloader, "PROJECT_ROOT", tmp_path)

    config = {"name": "Test Area", "city": "Test City", "country": "Test", "crs": "EPSG:32631", "bbox": [0.0, 0.0, 1.0, 1.0]}
    result = downloader.acquire_area("test_area", config, overwrite=False, pause_s=0)

    raw_path = tmp_path / "raw/osm/test_area_features.geojson"
    clipped_path = tmp_path / "processed/vectors/test_area_features_clipped.geojson"
    raw = json.loads(raw_path.read_text(encoding="utf-8"))
    clipped = json.loads(clipped_path.read_text(encoding="utf-8"))
    assert result["status"] == "DOWNLOADED"
    assert result["raw_feature_count"] == 1
    assert raw["features"][0]["id"] == "way/987654321"
    assert raw["features"][0]["properties"]["osm_tags"]["height"] == "12"
    assert raw["features"][0]["properties"]["osm_object_url"] == "https://www.openstreetmap.org/way/987654321"
    assert "roof_area_m2" not in raw["features"][0]["properties"]
    assert raw["features"][0]["geometry"]["coordinates"][0][0][0] == -0.5
    processed_geometry = __import__("shapely.geometry", fromlist=["shape"]).shape(clipped["features"][0]["geometry"])
    assert box(0.0, 0.0, 1.0, 1.0).covers(processed_geometry)
    assert clipped["features"][0]["properties"]["clipped_to_analysis_window_bbox"] is True
    assert raw["metadata"]["analysis_window_is_official_boundary"] is False
    assert "bbox" not in raw


def test_analysis_window_geojson_matches_canonical_bbox_and_is_not_official_boundary():
    project_root = Path(__file__).resolve().parents[2]
    areas = load_study_area_configs(project_root / "backend/app/spatial/geo_digital_twin.py")
    path = project_root / "dataset/spatial_sources/analysis_windows_not_official_boundaries.geojson"
    fc = json.loads(path.read_text(encoding="utf-8"))
    assert fc["type"] == "FeatureCollection"
    assert "crs" not in fc
    assert fc["metadata"]["official_boundaries_verified"] is False
    by_id = {f["properties"]["study_area_id"]: f for f in fc["features"]}
    assert set(by_id) == set(areas)
    for area_id, config in areas.items():
        feature = by_id[area_id]
        assert feature["properties"]["role"] == "model_analysis_window_bbox"
        assert feature["properties"]["official_boundary_verified"] is False
        assert feature["properties"]["bbox_wgs84"] == config["bbox"]
        geom = __import__("shapely.geometry", fromlist=["shape"]).shape(feature["geometry"])
        assert geom.is_valid
        assert geom.bounds == tuple([config["bbox"][0], config["bbox"][1], config["bbox"][2], config["bbox"][3]])
