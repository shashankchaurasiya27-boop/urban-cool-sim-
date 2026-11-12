"""Test suite verifying RFC 7946 compliance and selected study area consistency for GeoJSON exports."""
import json
import math
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Canonical bounding boxes from backend/app/spatial/geo_digital_twin.py
CANONICAL_BBOXES = {
    "delhi_cp": [77.2130, 28.6270, 77.2264, 28.6386],
    "mumbai_bkc": [72.8610, 19.0590, 72.8756, 19.0724],
    "singapore_marina": [103.8495, 1.2780, 103.8635, 1.2914],
    "phoenix_downtown": [-112.0810, 33.4420, -112.0670, 33.4548],
    "tokyo_shinjuku": [139.6895, 35.6840, 139.7035, 35.6970],
}


def run_node_geojson_export():
    """Execute the Node evaluation of generateInterventionsGeoJSON across all study areas."""
    script = """
    const fs = require('fs');
    const path = require('path');
    
    // Read frontend/src/lib/api.ts and evaluate generateInterventionsGeoJSON
    const apiTs = fs.readFileSync('frontend/src/lib/api.ts', 'utf8');
    
    // Extract DEFAULT_STUDY_AREAS and generateInterventionsGeoJSON
    const areasMatch = apiTs.match(/export const DEFAULT_STUDY_AREAS: StudyAreaOption\\[\\] = ([\\s\\S]*?);\\n\\nexport/);
    if (!areasMatch) throw new Error("Could not extract DEFAULT_STUDY_AREAS from api.ts");
    const DEFAULT_STUDY_AREAS = eval('(' + areasMatch[1] + ')');
    
    const fnMatch = apiTs.match(/generateInterventionsGeoJSON\\(solution: ParetoSolution, studyAreaNameOrId = "delhi_cp"\\) {([\\s\\S]*?)\\n  },\\n\\n  exportInterventionsToGeoJSON/);
    if (!fnMatch) throw new Error("Could not extract generateInterventionsGeoJSON from api.ts");
    
    const generateFn = new Function('solution', 'studyAreaNameOrId', 'DEFAULT_STUDY_AREAS', fnMatch[1]);
    
    const dummySol = {
        solution_id: 1,
        green_roof_pct: 0.35,
        cool_roof_pct: 0.25,
        tree_canopy_pct: 0.20,
        water_pct: 0.05,
        delta_t_mean: 3.42,
        total_cost_usd: 345000,
        water_demand_m3: 4200,
        land_area_m2: 250000,
        heat_risk_score: 1.8,
        physics_validated: true,
        validated_delta_t: 3.42,
        validation_error: 0.04
    };
    
    const results = {};
    const testAreas = ['delhi_cp', 'mumbai_bkc', 'singapore_marina', 'phoenix_downtown', 'tokyo_shinjuku'];
    for (const a of testAreas) {
        results[a] = generateFn(dummySol, a, DEFAULT_STUDY_AREAS);
    }
    console.log(JSON.stringify(results));
    """
    res = subprocess.run(
        ["node", "-e", script],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=True
    )
    return json.loads(res.stdout)


def test_geojson_export_rfc7946_and_selected_area_consistency():
    outputs = run_node_geojson_export()
    assert len(outputs) == 5

    for area_id, doc in outputs.items():
        assert doc.get("type") == "FeatureCollection", f"{area_id}: type must be FeatureCollection"
        assert "crs" not in doc, f"{area_id}: RFC 7946 forbids top-level crs member"

        meta = doc.get("metadata", {})
        assert meta.get("study_area_id") == area_id, f"{area_id}: metadata.study_area_id mismatch"
        assert meta.get("coordinate_order") == "[longitude, latitude]"
        assert meta.get("is_illustrative_blueprint") is True

        features = doc.get("features", [])
        assert len(features) == 3, f"{area_id}: expected 3 intervention features"

        bbox = CANONICAL_BBOXES[area_id]
        west, south, east, north = bbox

        for f_idx, feat in enumerate(features):
            assert feat.get("type") == "Feature"
            props = feat.get("properties", {})
            assert props.get("study_area_id") == area_id
            assert props.get("is_illustrative") is True
            if "coverage_pct" in props:
                assert 0.0 <= props["coverage_pct"] <= 100.0
                assert props.get("coverage_unit") == "percent (0-100)"

            geom = feat.get("geometry", {})
            g_type = geom.get("type")
            coords = geom.get("coordinates")

            if g_type == "Polygon":
                ring = coords[0]
                assert len(ring) >= 4, f"{area_id} feat {f_idx}: polygon ring must have >= 4 points"
                assert ring[0] == ring[-1], f"{area_id} feat {f_idx}: polygon ring must be closed"
                for lon, lat in ring:
                    assert west <= lon <= east, f"{area_id} lon {lon} outside bbox [{west}, {east}]"
                    assert south <= lat <= north, f"{area_id} lat {lat} outside bbox [{south}, {north}]"
            elif g_type == "LineString":
                assert len(coords) >= 2
                for lon, lat in coords:
                    assert west <= lon <= east, f"{area_id} lon {lon} outside bbox [{west}, {east}]"
                    assert south <= lat <= north, f"{area_id} lat {lat} outside bbox [{south}, {north}]"
            else:
                raise AssertionError(f"Unexpected geometry type: {g_type}")

        # Ensure Mumbai, Singapore, Phoenix, Tokyo do NOT have Delhi coordinates
        if area_id != "delhi_cp":
            delhi_w, delhi_s, delhi_e, delhi_n = CANONICAL_BBOXES["delhi_cp"]
            for feat in features:
                coords = feat["geometry"]["coordinates"]
                pts = coords[0] if feat["geometry"]["type"] == "Polygon" else coords
                for lon, lat in pts:
                    in_delhi = (delhi_w <= lon <= delhi_e) and (delhi_s <= lat <= delhi_n)
                    assert not in_delhi, f"{area_id} contains coordinates in Delhi: [{lon}, {lat}]"

    print("[PASS] GeoJSON export RFC 7946 compliance and selected area geometry verified for all 5 study areas.")


if __name__ == "__main__":
    test_geojson_export_rfc7946_and_selected_area_consistency()
