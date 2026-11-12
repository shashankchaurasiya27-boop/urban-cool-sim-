import pytest
import os
import uuid
import numpy as np
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.config import Settings, OLD_INSECURE_SECRET_KEY
from app.database import engine, Base, get_db
from app.physics.energy_balance import EnergyBalanceSolver
from app.ml.surrogate import SurrogateModelPipeline
from app.optimization.pareto_optimizer import run_multi_objective_optimization
from app.models.db_models import User, Scenario, SimulationJob, OptimizationRun, Report
from app.auth.security import create_access_token

# Ensure test DB tables are ready
Base.metadata.create_all(bind=engine)
client = TestClient(app)


# ---------------------------------------------------------------------------
# C-6: Hardcoded JWT secret startup validation
# ---------------------------------------------------------------------------
def test_secret_key_enforcement_at_startup():
    # 1. Unset / None should fail
    with pytest.raises(Exception):
        Settings(SECRET_KEY=None)

    # 2. Insecure default placeholder should fail
    with pytest.raises(ValueError, match="Insecure default SECRET_KEY"):
        Settings(SECRET_KEY=OLD_INSECURE_SECRET_KEY)

    # 3. Valid secret key should succeed
    valid_settings = Settings(SECRET_KEY="test_dummy_key_for_testing_secret_enforcement_32chars")
    assert valid_settings.SECRET_KEY == "test_dummy_key_for_testing_secret_enforcement_32chars"


# ---------------------------------------------------------------------------
# C-5: Jobs API unknown ID -> 404, empty jobs -> []
# ---------------------------------------------------------------------------
def test_jobs_api_unknown_id_returns_404():
    unknown_id = str(uuid.uuid4())
    resp = client.get(f"/api/v1/jobs/{unknown_id}")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_jobs_api_no_fabricated_records():
    resp = client.get("/api/v1/jobs")
    assert resp.status_code == 200
    jobs = resp.json()
    job_ids = [j.get("id") or j.get("job_id") for j in jobs]
    # Ensure neither fake placeholder job exists
    assert "job_opt_9941" not in job_ids
    assert "job_sim_8812" not in job_ids


# ---------------------------------------------------------------------------
# C-2: Reports router respects study area & scenario
# ---------------------------------------------------------------------------
def test_report_generation_respects_study_area():
    resp_delhi = client.post("/api/v1/reports/generate", json={
        "study_area_id": "delhi_cp",
        "scenario_id": "default_delhi",
        "author": "Auditor"
    })
    assert resp_delhi.status_code == 200
    delhi_content = resp_delhi.json()["markdown_content"]
    assert "Connaught Place" in delhi_content

    resp_singapore = client.post("/api/v1/reports/generate", json={
        "study_area_id": "singapore_marina",
        "scenario_id": "default_singapore",
        "author": "Auditor"
    })
    assert resp_singapore.status_code == 200
    sg_content = resp_singapore.json()["markdown_content"]
    assert "Marina Bay" in sg_content
    # The two reports for two distinct cities must genuinely differ
    assert delhi_content != sg_content


# ---------------------------------------------------------------------------
# C-1: Validation endpoint honesty (no fake Landsat citation, dynamic R²)
# ---------------------------------------------------------------------------
def test_validation_endpoint_honesty_and_dynamic_status():
    resp = client.post("/api/v1/validation/run?study_area_id=delhi_cp")
    assert resp.status_code == 200
    data = resp.json()
    
    # The endpoint must identify synthetic data and must not imply satellite observations.
    assert "Landsat 8 TIRS Collection 2" not in data["observed_source"]
    assert "synthetic" in data["observed_source"].lower()
    assert data["study_area_id"] == "delhi_cp"
    assert data["provenance"]["independent_observations_used"] is False
    assert data["provenance"]["pixel_count"] > 0
    assert 0 < len(data["scatter_points"]) <= 100
    assert data["provenance"]["scatter_sample_count"] == len(data["scatter_points"])
    assert all(
        "benchmark_temperature_c" in point and "simulated_temperature_c" in point
        and "row" in point and "col" in point
        for point in data["scatter_points"]
    )

    # Calibration status must be derived from computed R², not a hardcoded score.
    r2 = data["r2"]
    assert "SELF-CONSISTENT" in data["calibration_status"] or "CONSISTENT" in data["calibration_status"]
    assert f"{r2:.3f}" in data["calibration_status"]


# ---------------------------------------------------------------------------
# C-7: Surrogate model training requires admin role
# ---------------------------------------------------------------------------
def test_surrogate_training_requires_auth_and_admin():
    # Setup test users in DB
    db = next(get_db())
    reg_id = "test_user_reg_" + uuid.uuid4().hex[:6]
    admin_id = "test_user_adm_" + uuid.uuid4().hex[:6]
    db.add(User(id=reg_id, email=f"{reg_id}@example.com", hashed_password="pw", role="user", is_active=True))
    db.add(User(id=admin_id, email=f"{admin_id}@example.com", hashed_password="pw", role="admin", is_active=True))
    db.commit()

    # 1. Unauthenticated -> 401 or 403
    resp_unauth = client.post("/api/v1/ml/train?n_samples=200")
    assert resp_unauth.status_code in [401, 403]

    # 2. Authenticated as standard user -> 403 Forbidden
    user_token = create_access_token({"sub": reg_id, "role": "user"})
    resp_user = client.post(
        "/api/v1/ml/train?n_samples=200",
        headers={"Authorization": f"Bearer {user_token}"}
    )
    assert resp_user.status_code == 403

    # 3. Authenticated as admin -> Allowed (200)
    admin_token = create_access_token({"sub": admin_id, "role": "admin"})
    resp_admin = client.post(
        "/api/v1/ml/train?n_samples=200",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp_admin.status_code == 200
    assert resp_admin.json()["status"] == "SUCCESS"


# ---------------------------------------------------------------------------
# H-1: Dynamic health check reports broken DB
# ---------------------------------------------------------------------------
def test_health_check_dynamic_status():
    # Healthy case
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "UP"
    assert data["database"] == "ONLINE"
    assert data["components"]["database"]["status"] == "ONLINE"

    # Mock DB failure
    with patch("app.main.engine.connect", side_effect=Exception("Database connection timeout")):
        resp_down = client.get("/health")
        assert resp_down.status_code == 503
        data_down = resp_down.json()
        assert data_down["status"] == "DOWN"
        assert data_down["database"] == "DOWN"


# ---------------------------------------------------------------------------
# H-3: Physics re-validation flags candidates exceeding error threshold
# ---------------------------------------------------------------------------
def test_physics_validation_threshold():
    # Run optimization
    opt_res = run_multi_objective_optimization(
        study_area_id="delhi_cp",
        max_budget_usd=200000.0,
        pop_size=10,
        n_gen=5
    )
    assert "physics_validated" in opt_res
    assert isinstance(opt_res["physics_validated"], bool)
    assert "physics_validation_error_c" in opt_res
    
    # If error > 0.50, physics_validated must be False
    err = opt_res["physics_validation_error_c"]
    if err > 0.50:
        assert opt_res["physics_validated"] is False
    else:
        assert opt_res["physics_validated"] is True


# ---------------------------------------------------------------------------
# H-4: Canonical land area formula consistency
# ---------------------------------------------------------------------------
def test_land_area_formula_consistency():
    from app.interventions.engine import InterventionEngine
    
    interventions = {
        "green_roof_coverage": 0.30,
        "cool_roof_coverage": 0.20,
        "tree_canopy_addition": 0.15,
        "water_feature_fraction": 0.05
    }
    budget = InterventionEngine.calculate_resource_budget(interventions, study_area_m2=500000.0)
    assert budget["land_area_m2"] > 0


# ---------------------------------------------------------------------------
# H-7: Diurnal profile uses scenario and removes ECOSTRESS claims
# ---------------------------------------------------------------------------
def test_diurnal_profile_honesty_and_scenario_parameter():
    resp = client.get("/api/v1/thermal/diurnal-profile?study_area_id=delhi_cp&scenario_id=scen_green_roofs")
    assert resp.status_code == 200
    data = resp.json()
    assert "ECOSTRESS" not in str(data)
    assert data["scenario_id"] == "scen_green_roofs"
    assert len(data["diurnal_curve"]) == 24


# ---------------------------------------------------------------------------
# M-1: Surrogate does not clip negative values to 0.0
# ---------------------------------------------------------------------------
def test_surrogate_no_negative_clipping():
    # If model predicts a negative value (or mock negative), it must return signed float
    pipeline = SurrogateModelPipeline()
    fake_model = MagicMock()
    fake_model.predict.return_value = np.array([-0.42])
    pipeline.model = fake_model
    
    res = pipeline.predict_delta_t({
        "green_roof_coverage": 0.0,
        "cool_roof_albedo_boost": -0.2,
        "tree_canopy_addition": 0.0
    })
    assert res < 0.0
    assert abs(res - (-0.42)) < 1e-4


# ---------------------------------------------------------------------------
# M-2: Max population size & optimization iterations bounds
# ---------------------------------------------------------------------------
def test_optimization_bounds_enforced():
    # Exceeding MAX_POPULATION_SIZE (100)
    resp_pop = client.post("/api/v1/optimization/run", json={
        "study_area_id": "delhi_cp",
        "population_size": 250
    })
    assert resp_pop.status_code == 422

    # Exceeding MAX_OPTIMIZATION_ITERATIONS (200)
    resp_gen = client.post("/api/v1/optimization/run", json={
        "study_area_id": "delhi_cp",
        "n_gen": 500
    })
    assert resp_gen.status_code == 422


# ---------------------------------------------------------------------------
# M-7: Scenario filtering by study_area_id
# ---------------------------------------------------------------------------
def test_scenario_filtering_by_study_area():
    resp = client.get("/api/v1/scenarios?study_area_id=delhi_cp")
    assert resp.status_code == 200
    scenarios = resp.json()
    for s in scenarios:
        assert s["study_area_id"] == "delhi_cp"


# ---------------------------------------------------------------------------
# M-8: Registration role escalation blocked
# ---------------------------------------------------------------------------
def test_registration_role_escalation_blocked():
    email = f"hacker_{uuid.uuid4().hex[:8]}@example.com"
    resp = client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Password123!",
        "full_name": "Privilege Escalator",
        "role": "admin"
    })
    assert resp.status_code == 201
    user_data = resp.json()
    # Server must force role to 'user'
    assert user_data["role"] == "user"


# ---------------------------------------------------------------------------
# M-9: Strict surrogate inference request schema validation
# ---------------------------------------------------------------------------
def test_surrogate_inference_schema_validation():
    # Unknown extra feature rejected with 422
    resp_malformed = client.post("/api/v1/ml/predict", json={
        "unknown_feature": 123.4
    })
    assert resp_malformed.status_code == 422

    # Out of range (green_roof_coverage > 1.0) rejected with 422
    resp_out_of_range = client.post("/api/v1/ml/predict", json={
        "green_roof_coverage": 5.0,
        "cool_roof_albedo_boost": 0.2,
        "tree_canopy_addition": 0.1
    })
    assert resp_out_of_range.status_code == 422


# ---------------------------------------------------------------------------
# Phase 4 Item 4: Newton-Raphson residual check & bisection fallback
# ---------------------------------------------------------------------------
def test_energy_balance_residual_and_fallback():
    solver = EnergyBalanceSolver(solar_rad=950.0, air_temp_c=42.0, wind_speed=1.5)
    # Normal equilibrium
    res = solver.solve_cell_equilibrium(
        albedo=0.2,
        emissivity=0.95,
        veg_fraction=0.1,
        water_fraction=0.0,
        building_height=20.0,
        building_density=0.4,
        q_f=35.0
    )
    assert "energy_balance_residual" in res
    assert abs(res["energy_balance_residual"]) < 1.0
    
    # Extreme parameters forcing fallback
    res_extreme = solver.solve_cell_equilibrium(
        albedo=0.99,
        emissivity=0.1,
        veg_fraction=0.9,
        water_fraction=0.0,
        building_height=50.0,
        building_density=0.9,
        q_f=500.0
    )
    assert "T_surface_c" in res_extreme
    assert not np.isnan(res_extreme["T_surface_c"])
    assert not np.isinf(res_extreme["T_surface_c"])
    assert -50.0 < res_extreme["T_surface_c"] < 100.0


# ---------------------------------------------------------------------------
# Schema Migration Integrity: Automatic column additions for existing tables
# ---------------------------------------------------------------------------
def test_auto_migration_adds_missing_columns():
    from sqlalchemy import create_engine, text, inspect
    from app.main import run_auto_migrations
    
    test_engine = create_engine("sqlite:///:memory:")
    # Create existing table with outdated schema missing owner_id
    with test_engine.begin() as conn:
        conn.execute(text("CREATE TABLE scenarios (id VARCHAR PRIMARY KEY, name VARCHAR)"))
    
    insp_before = inspect(test_engine)
    assert "owner_id" not in [c["name"] for c in insp_before.get_columns("scenarios")]
    
    # Run auto migration
    run_auto_migrations(test_engine)
    
    insp_after = inspect(test_engine)
    columns_after = [c["name"] for c in insp_after.get_columns("scenarios")]
    assert "owner_id" in columns_after
    assert "description" in columns_after
    assert "parameters" in columns_after

