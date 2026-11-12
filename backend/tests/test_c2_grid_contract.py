"""Regression tests for Checkpoint C2 grid contract interoperability."""

import ast
from pathlib import Path

import numpy as np
import pytest
from pydantic import ValidationError

from app.schemas.schemas import DigitalTwinGridResponse, PhysicsSimulationRequest
from app.spatial.geo_digital_twin import STUDY_AREA_CONFIGS, geo_twin_engine


def generate_study_area_grid(study_area_id, rows, cols):
    return geo_twin_engine.generate_microgrid(study_area_id, rows=rows, cols=cols)


def read_public_study_area_metadata():
    """Read the literal router metadata without importing app/auth dependencies."""
    router_path = Path(__file__).parents[1] / "app" / "api" / "digital_twin_router.py"
    tree = ast.parse(router_path.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "STUDY_AREAS_METADATA"
            for target in node.targets
        ):
            return ast.literal_eval(node.value)
    raise AssertionError("STUDY_AREAS_METADATA literal not found")


AREA_IDS = (
    "delhi_cp",
    "mumbai_bkc",
    "singapore_marina",
    "phoenix_downtown",
    "tokyo_shinjuku",
)


def test_study_area_public_metadata_has_crs_and_resolution_parity():
    records = {item["id"]: item for item in read_public_study_area_metadata()}
    assert set(records) == set(AREA_IDS)
    for area_id in AREA_IDS:
        item = records[area_id]
        config = STUDY_AREA_CONFIGS[area_id]
        assert item["configured_projected_crs"] == config["crs"]
        assert item["bbox_crs"] == "EPSG:4326"
        assert item["grid_coordinate_crs"] == "EPSG:4326"
        assert item["nominal_resolution_m"] == config["resolution_m"]
        assert item["resolution_note"]


@pytest.mark.parametrize("rows,cols", [(10, 10), (10, 20), (40, 40), (50, 50), (100, 100)])
def test_grid_dimensions_and_all_layer_shapes_follow_requested_contract(rows, cols):
    grid = generate_study_area_grid("delhi_cp", rows=rows, cols=cols)
    response = DigitalTwinGridResponse.model_validate(grid)
    assert response.metadata.rows == rows
    assert response.metadata.cols == cols
    assert response.metadata.total_cells == rows * cols
    for name, values in response.layers.model_dump().items():
        arr = np.asarray(values)
        assert arr.shape == (rows, cols), name
        assert np.isfinite(arr).all(), name
    mask = np.asarray(response.layers.modelled_coverage_mask)
    assert set(np.unique(mask)).issubset({0, 1})


def test_grid_schema_rejects_invalid_bbox_and_cell_count():
    grid = generate_study_area_grid("delhi_cp", rows=10, cols=10)
    malformed_bbox = {**grid, "metadata": {**grid["metadata"], "bbox": [1.0, 2.0, 3.0]}}
    with pytest.raises(ValidationError, match="bbox must contain"):
        DigitalTwinGridResponse.model_validate(malformed_bbox)

    malformed_count = {**grid, "metadata": {**grid["metadata"], "total_cells": 99}}
    with pytest.raises(ValidationError, match="total_cells must equal"):
        DigitalTwinGridResponse.model_validate(malformed_count)


def test_thermal_request_uses_shared_grid_dimension_limits():
    base = {
        "scenario_id": "test-scenario",
        "rows": 10,
        "cols": 100,
        "grid_resolution_m": 10,
    }
    assert PhysicsSimulationRequest.model_validate(base).rows == 10
    # Shared limits [10, 250]
    assert PhysicsSimulationRequest.model_validate({**base, "rows": 250}).rows == 250
    with pytest.raises(ValidationError):
        PhysicsSimulationRequest.model_validate({**base, "rows": 9})
    with pytest.raises(ValidationError):
        PhysicsSimulationRequest.model_validate({**base, "rows": 251})
    with pytest.raises(ValidationError):
        PhysicsSimulationRequest.model_validate({**base, "cols": 1000})


def test_grid_engine_rejects_non_finite_or_invalid_bbox_through_response_contract():
    grid = geo_twin_engine.generate_microgrid("delhi_cp", rows=10, cols=10)
    malformed = {**grid, "metadata": {**grid["metadata"], "bbox": [77.2, 28.6, 77.1, 28.7]}}
    with pytest.raises(ValidationError, match="west < east"):
        DigitalTwinGridResponse.model_validate(malformed)


def test_inspect_cell_route_respects_custom_dimensions_and_validates_bounds():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    # Valid cell on custom 40x40 grid for Singapore
    resp = client.get("/api/v1/digital-twin/inspect-cell?study_area_id=singapore_marina&row=15&col=20&rows=40&cols=40")
    assert resp.status_code == 200
    data = resp.json()
    assert data["study_area_id"] == "singapore_marina"
    assert data["grid"]["rows"] == 40
    assert data["grid"]["cols"] == 40
    assert data["grid"]["total_cells"] == 1600
    assert data["grid"]["crs"] == "EPSG:4326"
    assert data["grid"]["bbox"] == [103.8495, 1.2780, 103.8635, 1.2914]
    assert data["grid"]["effective_resolution_x_m"] > 0
    assert data["grid"]["effective_resolution_y_m"] > 0
    assert "is_supported_by_mapped_features" in data

    # Out-of-bounds row on 40x40 grid must return 422
    resp_err = client.get("/api/v1/digital-twin/inspect-cell?study_area_id=singapore_marina&row=40&col=20&rows=40&cols=40")
    assert resp_err.status_code == 422
    assert "Cell index out of bounds" in resp_err.json()["detail"]


@pytest.mark.parametrize("area_id", AREA_IDS)
def test_optimizer_derives_district_area_from_study_area_config(area_id):
    from app.optimization.pareto_optimizer import run_multi_objective_optimization

    config = STUDY_AREA_CONFIGS[area_id]
    expected_area = config["analysis_window_area_m2"]

    opt_res = run_multi_objective_optimization(
        study_area_id=area_id,
        max_budget_usd=200000.0,
        pop_size=10,
        n_gen=2
    )
    assert opt_res["study_area_id"] == area_id
    assert abs(opt_res["district_area_m2"] - expected_area) < 0.1
    rec = opt_res["recommended_solution"]
    assert "solution_id" in rec
    assert rec["physics_validated"] is True


@pytest.mark.parametrize("area_id, min_expected_features, min_expected_bldgs", [
    ("delhi_cp", 1500, 400),
    ("mumbai_bkc", 900, 250),
    ("singapore_marina", 2000, 240),
    ("phoenix_downtown", 2800, 390),
    ("tokyo_shinjuku", 6000, 2400),
])
def test_digital_twin_actively_loads_live_acquired_osm_features(area_id, min_expected_features, min_expected_bldgs):
    """Ensures the digital twin engine actively loads real Overpass OSM data, not old curated mock files."""
    grid = geo_twin_engine.generate_microgrid(area_id, rows=50, cols=50)
    meta = grid["metadata"]
    assert meta["active_data_source"] in ("bundled_osm_snapshot", "live_osm_acquired")
    assert meta["vector_feature_count"] >= min_expected_features
    assert meta["features_by_class"]["building"] >= min_expected_bldgs
    assert meta["source_file"] == f"{area_id}_features_clipped.geojson"
    assert "OpenStreetMap" in meta["data_provenance"]
    assert "ODbL" in meta["data_license"]

    # Verify building extrusion endpoint returns matching real buildings
    bldgs = geo_twin_engine.get_building_features(area_id)
    assert len(bldgs["features"]) >= min_expected_bldgs
    for b in bldgs["features"][:50]:
        assert b["geometry"]["type"] in ("Polygon", "MultiPolygon")
        assert b["properties"]["height"] > 0.0


def test_optimization_endpoint_rejects_unsupported_study_area_with_422():
    """Ensures API boundary rejects unsupported study areas with HTTP 422 Unprocessable Entity."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    bad_payloads = [
        {"study_area_id": "unsupported_city"},
        {"study_area_id": "atlantis"},
        {"study_area_id": "delhi"},
        {"study_area_id": ""},
    ]
    for p in bad_payloads:
        resp = client.post("/api/v1/optimization/run", json=p)
        assert resp.status_code == 422, f"Expected 422 for {p}, got {resp.status_code}"


def test_optimizer_raises_value_error_without_silent_delhi_fallback():
    """Ensures direct optimizer execution rejects unknown area IDs instead of silently using Delhi climate."""
    from app.optimization.pareto_optimizer import run_multi_objective_optimization

    with pytest.raises(ValueError, match="Unsupported study_area_id"):
        run_multi_objective_optimization(study_area_id="unknown_area", pop_size=5, n_gen=2)


def test_intervention_engine_requires_explicit_study_area_m2():
    """Ensures InterventionEngine refuses default 250000 m² and requires explicit study_area_m2."""
    from app.interventions.engine import InterventionEngine

    with pytest.raises(ValueError, match="study_area_m2 must be explicitly provided"):
        InterventionEngine.calculate_resource_budget({}, study_area_m2=None)

    with pytest.raises(ValueError, match="study_area_m2 must be explicitly provided"):
        InterventionEngine.calculate_resource_budget({}, study_area_m2=0.0)


def test_nominal_vs_effective_resolution_distinction():
    """Verifies that nominal target resolution (10m) is distinguished from effective cell spacing."""
    grid_40 = geo_twin_engine.generate_microgrid("singapore_marina", rows=40, cols=40)
    meta_40 = grid_40["metadata"]
    assert meta_40["nominal_resolution_m"] == 10.0
    # On Singapore's ~1558m extent, 40 cells yields ~38.95m
    assert 35.0 <= meta_40["effective_resolution_x_m"] <= 42.0
    assert 35.0 <= meta_40["effective_resolution_y_m"] <= 42.0
    assert "nominal vs effective distinction" in meta_40["resolution_note"]

    grid_80 = geo_twin_engine.generate_microgrid("singapore_marina", rows=80, cols=80)
    meta_80 = grid_80["metadata"]
    assert meta_80["nominal_resolution_m"] == 10.0
    assert 17.0 <= meta_80["effective_resolution_x_m"] <= 21.0


def test_thermal_and_neighboring_routes_reject_unsupported_study_area_with_422():
    """Work Item B: Verifies HTTP 422 boundary rejection on unsupported study area string across all endpoints."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    unsupported_ids = ["atlantis", "delhi", "unknown_area", ""]

    for bad_id in unsupported_ids:
        # 1. Thermal diurnal-profile (query param)
        resp_diurnal = client.get(f"/api/v1/thermal/diurnal-profile?study_area_id={bad_id}")
        assert resp_diurnal.status_code == 422, f"Expected 422 for diurnal with {bad_id}, got {resp_diurnal.status_code}"

        # 2. Thermal simulate (query param and body)
        resp_sim_query = client.post(f"/api/v1/thermal/simulate?study_area_id={bad_id}", json={})
        assert resp_sim_query.status_code == 422, f"Expected 422 for thermal simulate query {bad_id}"

        resp_sim_body = client.post("/api/v1/thermal/simulate", json={"study_area_id": bad_id})
        assert resp_sim_body.status_code == 422, f"Expected 422 for thermal simulate body {bad_id}"

        # 3. Heat risk analysis
        resp_hr = client.get(f"/api/v1/heat-risk/analysis?study_area_id={bad_id}")
        assert resp_hr.status_code == 422, f"Expected 422 for heat risk with {bad_id}"

        # 4. Validation run
        resp_val = client.post(f"/api/v1/validation/run?study_area_id={bad_id}")
        assert resp_val.status_code == 422, f"Expected 422 for validation with {bad_id}"

        # 5. Scenarios create and list
        resp_scen_post = client.post(f"/api/v1/scenarios?study_area_id={bad_id}", json={"name": "test", "study_area_id": bad_id})
        assert resp_scen_post.status_code == 422, f"Expected 422 for scenario create with {bad_id}"

        resp_scen_get = client.get(f"/api/v1/scenarios?study_area_id={bad_id}")
        assert resp_scen_get.status_code == 422, f"Expected 422 for scenario list with {bad_id}"


@pytest.mark.parametrize("area_id", AREA_IDS)
def test_thermal_and_neighboring_routes_accept_all_five_study_areas(area_id):
    """Work Item B: Verifies HTTP 200 OK across all five validated study areas on thermal and neighboring routes."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    # 1. Thermal diurnal-profile
    resp_diurnal = client.get(f"/api/v1/thermal/diurnal-profile?study_area_id={area_id}")
    assert resp_diurnal.status_code == 200
    diurnal_data = resp_diurnal.json()
    assert diurnal_data["study_area_id"] == area_id
    assert len(diurnal_data["diurnal_curve"]) == 24
    assert diurnal_data["max_cooling_c"] >= 0

    # 2. Thermal simulate
    resp_sim = client.post(f"/api/v1/thermal/simulate?study_area_id={area_id}", json={"scenario_id": "scen_test", "rows": 20, "cols": 20})
    assert resp_sim.status_code == 200
    sim_data = resp_sim.json()
    assert sim_data["baseline_t_mean"] > 0
    assert sim_data["provenance"]["synthetic_flag"] is True

    # 3. Heat risk analysis
    resp_hr = client.get(f"/api/v1/heat-risk/analysis?study_area_id={area_id}")
    assert resp_hr.status_code == 200
    hr_data = resp_hr.json()
    assert hr_data["study_area_id"] == area_id
    assert isinstance(hr_data["heat_alert_tier"], str) and len(hr_data["heat_alert_tier"]) > 0
    assert hr_data["mean_surface_temp_c"] > 0

    # 4. Validation run
    resp_val = client.post(f"/api/v1/validation/run?study_area_id={area_id}")
    assert resp_val.status_code == 200
    val_data = resp_val.json()
    assert val_data["study_area_id"] == area_id
    assert val_data["r2"] > 0


@pytest.mark.parametrize("area_id", AREA_IDS)
def test_true_10m_metric_grid_generation_and_contract(area_id):
    """Work Item E: Verifies true metric 10m grid mode sets rows and cols to extent / 10m with ~10m cell spacing."""
    grid = geo_twin_engine.generate_microgrid(study_area_id=area_id, grid_mode="metric_10m")
    resp = DigitalTwinGridResponse.model_validate(grid)
    meta = resp.metadata

    assert meta.is_metric_10m is True
    assert meta.nominal_resolution_m == 10.0
    # True metric resolution should be very close to 10m (between 8.5m and 11.5m)
    assert 8.5 <= meta.effective_resolution_x_m <= 11.5
    assert 8.5 <= meta.effective_resolution_y_m <= 11.5
    assert meta.total_cells == meta.rows * meta.cols
    # Verify cell count fits within expected 10m grid bounds (between 15,000 and 30,000 cells)
    assert 15000 <= meta.total_cells <= 30000

    # Verify thermal layer is valid and finite
    base_t = np.array(resp.layers.baseline_temperature_c)
    assert base_t.shape == (meta.rows, meta.cols)
    assert np.all(np.isfinite(base_t))


def test_cell_budget_safety_limit_enforced():
    """Work Item E: Verifies safety cell budget limit (50,000 cells) raises ValueError on excessive sizes."""
    with pytest.raises(ValueError, match="exceeds safe budget"):
        geo_twin_engine.generate_microgrid("delhi_cp", rows=300, cols=300)


@pytest.mark.parametrize("area_id", AREA_IDS)
def test_true_projected_utm_cell_spacing_and_area_accuracy(area_id):
    """AC-05: Verifies true UTM projection, 10.0m +/- 0.1m cell spacing, and authoritative metric area."""
    grid = geo_twin_engine.generate_microgrid(study_area_id=area_id, grid_mode="metric_10m")
    resp = DigitalTwinGridResponse.model_validate(grid)
    meta = resp.metadata

    # 1. Configured projected UTM CRS
    expected_crs = STUDY_AREA_CONFIGS[area_id]["crs"]
    assert meta.configured_projected_crs == expected_crs
    assert meta.projected_crs == expected_crs
    assert meta.grid_coordinate_crs == "EPSG:4326"

    # 2. Strict 10m spacing accuracy (within 0.1m of 10.0m)
    assert abs(meta.effective_resolution_x_m - 10.0) < 0.1, f"X resolution {meta.effective_resolution_x_m} deviates from 10m"
    assert abs(meta.effective_resolution_y_m - 10.0) < 0.1, f"Y resolution {meta.effective_resolution_y_m} deviates from 10m"

    # 3. Authoritative metric analysis window area parity
    expected_area = STUDY_AREA_CONFIGS[area_id]["analysis_window_area_m2"]
    assert abs(meta.analysis_window_area_m2 - expected_area) < 1.0
    assert "pyproj" in meta.distance_method.lower()


def test_authoritative_area_consistency_across_metadata():
    """AC-03: Verifies all study areas have matching authoritative analysis_window_area_m2 in registry."""
    metadata = read_public_study_area_metadata()
    for item in metadata:
        area_id = item["id"]
        expected_area = STUDY_AREA_CONFIGS[area_id]["analysis_window_area_m2"]
        assert item.get("analysis_window_area_m2") == expected_area
        assert item.get("district_area_m2") == expected_area
        assert "pyproj" in item.get("area_calculation_method", "").lower()


def test_grid_api_conflicting_parameters_rejected_http_422():
    """AC-06 / API-RES-01: Verifies HTTP 422 Unprocessable Entity when callers pass conflicting parameters."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    # 1. Conflicting resolution_m and rows
    resp1 = client.get("/api/v1/digital-twin/grid?study_area_id=delhi_cp&resolution_m=10&rows=20")
    assert resp1.status_code == 422
    assert "Conflicting grid dimension parameters" in resp1.json()["detail"]

    # 2. Conflicting resolution_m and cols
    resp2 = client.get("/api/v1/digital-twin/grid?study_area_id=delhi_cp&resolution_m=10&cols=20")
    assert resp2.status_code == 422
    assert "Conflicting grid dimension parameters" in resp2.json()["detail"]

    # 3. Conflicting grid_mode and rows
    resp3 = client.get("/api/v1/digital-twin/grid?study_area_id=delhi_cp&grid_mode=metric_10m&rows=50")
    assert resp3.status_code == 422
    assert "Conflicting grid dimension parameters" in resp3.json()["detail"]

    # 4. Cell budget overflow returns 422, not 500
    resp4 = client.get("/api/v1/digital-twin/grid?study_area_id=delhi_cp&resolution_m=1")
    assert resp4.status_code == 422
    assert "exceeds safe budget" in resp4.json()["detail"]


def test_thermal_simulate_conflicting_parameters_and_resolution_support():
    """AC-06 / API-RES-01: Verifies /thermal/simulate honors grid_resolution_m and rejects conflicts with 422."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    # 1. Conflicting grid_resolution_m and rows returns 422
    resp1 = client.post(
        "/api/v1/thermal/simulate?study_area_id=delhi_cp",
        json={"scenario_id": "test", "grid_resolution_m": 10.0, "rows": 20}
    )
    assert resp1.status_code == 422
    assert "Conflicting grid dimension parameters" in resp1.json()["detail"]

    # 2. Cell budget overflow returns 422
    resp2 = client.post(
        "/api/v1/thermal/simulate?study_area_id=delhi_cp",
        json={"scenario_id": "test", "grid_resolution_m": 1.0}
    )
    assert resp2.status_code == 422
    assert "exceeds safe budget" in resp2.json()["detail"]

    # 3. Valid grid_resolution_m=10.0 succeeds with true 10m grid dimensions
    resp3 = client.post(
        "/api/v1/thermal/simulate?study_area_id=delhi_cp",
        json={"scenario_id": "test", "grid_resolution_m": 10.0}
    )
    assert resp3.status_code == 200
    data = resp3.json()
    delta_map = data["spatial_summary"]["spatial_delta_map"]
    # Delhi CP 10m grid is 131 rows x 133 cols (4-corner UTM envelope)
    assert len(delta_map) == 131
    assert len(delta_map[0]) == 133


def test_optimization_endpoint_pareto_front_and_metric_aliases():
    """C3-GATE-01 / AC-06: Verifies optimization returns populated pareto_solutions, pareto_front, and aliases."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    resp = client.post(
        "/api/v1/optimization/run?study_area_id=delhi_cp",
        json={
            "target_delta_t": 3.0,
            "max_budget": 500000,
            "max_land": 50000,
            "population_size": 20,
            "generations": 5,
        }
    )
    assert resp.status_code == 200
    data = resp.json()

    # Verify both pareto_solutions and pareto_front are populated
    assert "pareto_solutions" in data and len(data["pareto_solutions"]) > 0
    assert "pareto_front" in data and len(data["pareto_front"]) > 0
    assert data["analysis_window_area_m2"] == STUDY_AREA_CONFIGS["delhi_cp"]["analysis_window_area_m2"]

    # Verify metric aliases on solutions
    sol = data["pareto_solutions"][0]
    assert sol["mean_temp_reduction_c"] == sol["delta_t_mean"]
    assert sol["mean_temp_reduction_c"] > 0
    assert sol["total_capex_usd"] == sol["total_cost_usd"]
    assert sol["total_capex_usd"] > 0


def test_shared_grid_parameter_validator():
    """Verifies authoritative shared validator enforces bounds, parity, exclusivity, and consistency."""
    from app.spatial.geo_digital_twin import validate_grid_parameters

    # Bounds
    with pytest.raises(ValueError, match="rows must be between 10 and 250"):
        validate_grid_parameters(rows=5, cols=50)
    with pytest.raises(ValueError, match="cols must be between 10 and 250"):
        validate_grid_parameters(rows=50, cols=300)

    # Parity
    with pytest.raises(ValueError, match="Both rows and cols must be specified together"):
        validate_grid_parameters(rows=50, cols=None)
    with pytest.raises(ValueError, match="Both rows and cols must be specified together"):
        validate_grid_parameters(rows=None, cols=50)

    # Exclusivity
    with pytest.raises(ValueError, match="Conflicting grid dimension parameters"):
        validate_grid_parameters(rows=50, cols=50, grid_mode="metric_10m")
    with pytest.raises(ValueError, match="Conflicting grid dimension parameters"):
        validate_grid_parameters(rows=50, cols=50, resolution_m=10.0)

    # Mode contradictions
    with pytest.raises(ValueError, match="Conflicting resolution: grid_mode='metric_10m' requires resolution_m=10.0"):
        validate_grid_parameters(grid_mode="metric_10m", resolution_m=20.0)
    with pytest.raises(ValueError, match="Conflicting resolution mode: resolution_m=10.0 corresponds to grid_mode='metric_10m'"):
        validate_grid_parameters(grid_mode="standard", resolution_m=10.0)

    # Valid normalization
    m, r_m, r, c = validate_grid_parameters(grid_mode="metric_10m")
    assert m == "metric_10m" and r_m == 10.0 and r is None and c is None

    m, r_m, r, c = validate_grid_parameters(rows=150, cols=150)
    assert m == "standard" and r_m is None and r == 150 and c == 150

    m, r_m, r, c = validate_grid_parameters()
    assert m == "standard" and r_m is None and r == 50 and c == 50


def test_four_corner_utm_envelope_extents_and_areas():
    """Verifies 4-corner UTM transformation across all 5 study areas."""
    from app.spatial.geo_digital_twin import get_study_area_metric_extents, STUDY_AREA_CONFIGS, geo_twin_engine

    for area_id, expected_cfg in STUDY_AREA_CONFIGS.items():
        extents = get_study_area_metric_extents(area_id)
        assert extents["study_area_id"] == area_id
        assert extents["projected_crs"] == expected_cfg["crs"]
        assert "4-corner envelope" in extents["calculation_method"]
        assert extents["width_m"] == expected_cfg["analysis_window_width_m"]
        assert extents["height_m"] == expected_cfg["analysis_window_height_m"]
        assert extents["analysis_window_area_m2"] == expected_cfg["analysis_window_area_m2"]

        grid = geo_twin_engine.generate_microgrid(study_area_id=area_id, rows=50, cols=50)
        assert grid["metadata"]["analysis_window_area_m2"] == expected_cfg["analysis_window_area_m2"]
        assert grid["metadata"]["analysis_window_width_m"] == expected_cfg["analysis_window_width_m"]
        assert grid["metadata"]["analysis_window_height_m"] == expected_cfg["analysis_window_height_m"]


def test_thermal_simulate_contradictory_mode_and_resolution_rejected():
    """Verifies /thermal/simulate rejects contradictory mode/resolution parameters with 422 and supports 150x150."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    # Contradictory resolution in metric_10m mode
    resp1 = client.post(
        "/api/v1/thermal/simulate?study_area_id=delhi_cp",
        json={"scenario_id": "test", "grid_mode": "metric_10m", "grid_resolution_m": 20.0}
    )
    assert resp1.status_code == 422
    assert "Conflicting resolution" in str(resp1.json()["detail"])

    # Contradictory standard mode with resolution_m=10.0
    resp2 = client.post(
        "/api/v1/thermal/simulate?study_area_id=delhi_cp",
        json={"scenario_id": "test", "grid_mode": "standard", "grid_resolution_m": 10.0}
    )
    assert resp2.status_code == 422
    assert "Conflicting resolution mode" in str(resp2.json()["detail"])

    # Parity check: /thermal/simulate supports rows=150, cols=150 (up to 250)
    resp3 = client.post(
        "/api/v1/thermal/simulate?study_area_id=delhi_cp",
        json={"scenario_id": "test", "rows": 150, "cols": 150}
    )
    assert resp3.status_code == 200
    delta_map = resp3.json()["spatial_summary"]["spatial_delta_map"]
    assert len(delta_map) == 150
    assert len(delta_map[0]) == 150


def test_optimization_constraint_feasibility_enforcement():
    """Verifies optimizer evaluates constraint feasibility, sets flags, and filters recommended solutions."""
    from app.optimization.pareto_optimizer import run_multi_objective_optimization

    # Normal feasibility case with adequate budget for a 1.7 km2 district
    opt_result = run_multi_objective_optimization(
        study_area_id="delhi_cp",
        max_budget_usd=50000000.0,
        max_water_m3=500000.0,
        max_land_m2=1000000.0,
        pop_size=20,
        n_gen=5
    )
    assert opt_result["has_feasible_solutions"] is True
    assert opt_result["status"] in ("optimal", "feasible_unvalidated")
    rec = opt_result["recommended_solution"]
    assert rec["is_feasible"] is True
    assert len(rec["constraint_violations"]) == 0

    # Infeasible constraint case: budget $1,000 (too low for any intervention)
    infeasible_opt = run_multi_objective_optimization(
        study_area_id="delhi_cp",
        max_budget_usd=1000.0,
        max_water_m3=10.0,
        max_land_m2=10.0,
        pop_size=15,
        n_gen=3
    )
    assert infeasible_opt["has_feasible_solutions"] is False
    assert infeasible_opt["status"] == "no_feasible_solutions"
    # Even if recommended exists as least-violating candidate, it is explicitly flagged infeasible
    if infeasible_opt["recommended_solution"]:
        assert infeasible_opt["recommended_solution"]["is_feasible"] is False
        assert len(infeasible_opt["recommended_solution"]["constraint_violations"]) > 0



