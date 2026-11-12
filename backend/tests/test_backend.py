import pytest
from fastapi.testclient import TestClient
import numpy as np

from app.main import app
from app.database import engine, Base
from app.physics.energy_balance import EnergyBalanceSolver
from app.ml.surrogate import SurrogateModelPipeline
from app.optimization.pareto_optimizer import run_multi_objective_optimization

# Ensure tables are created for tests
Base.metadata.create_all(bind=engine)

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "UP"

def test_study_areas_endpoint():
    response = client.get("/api/v1/digital-twin/study-areas")
    assert response.status_code == 200
    areas = response.json()
    assert len(areas) >= 5
    ids = [a["id"] for a in areas]
    assert "delhi_cp" in ids
    assert "mumbai_bkc" in ids
    assert "singapore_marina" in ids
    assert "phoenix_downtown" in ids
    assert "tokyo_shinjuku" in ids

def test_heat_risk_analysis():
    response = client.get("/api/v1/heat-risk/analysis?study_area_id=delhi_cp")
    assert response.status_code == 200
    data = response.json()
    assert "critical_zones" in data
    assert len(data["critical_zones"]) == 4
    assert "heat_alert_tier" in data
    assert data["total_population_estimate"] > 0

def test_diurnal_profile():
    response = client.get("/api/v1/thermal/diurnal-profile?study_area_id=delhi_cp")
    assert response.status_code == 200
    data = response.json()
    assert "diurnal_curve" in data
    assert len(data["diurnal_curve"]) == 24
    assert data["max_cooling_c"] > 0.0

def test_physics_energy_balance_solver():
    solver = EnergyBalanceSolver(solar_rad=850.0, air_temp_c=38.5, rel_humidity=0.45, wind_speed=2.5)
    assert 0.0 < solver.epsilon_atm <= 1.0, "Atmospheric emissivity must be a physical fraction"
    
    # Solve cell equilibrium for baseline built environment
    base_res = solver.solve_cell_equilibrium(
        albedo=0.15, emissivity=0.95, veg_fraction=0.10, water_fraction=0.0,
        building_height=20.0, building_density=0.50, q_f=35.0
    )
    
    # Solve cell equilibrium for cool intervention environment (+albedo, +veg)
    scen_res = solver.solve_cell_equilibrium(
        albedo=0.45, emissivity=0.95, veg_fraction=0.40, water_fraction=0.0,
        building_height=20.0, building_density=0.50, q_f=35.0
    )
    
    assert "T_surface_c" in base_res
    assert base_res["T_surface_c"] > scen_res["T_surface_c"], "Intervention must result in lower equilibrium temperature"
    
    # Energy Balance Conservation Check: Q* + Qf - (Qh + Qe + dQs) should be near zero
    residual = (base_res["Q_star"] + base_res["Q_f"]) - (base_res["Q_h"] + base_res["Q_e"] + base_res["dQs"])
    assert abs(residual) < 1.0, f"Energy balance conservation violated: residual = {residual}"

def test_surrogate_model_training_and_prediction():
    pipeline = SurrogateModelPipeline()
    metrics = pipeline.train_and_evaluate(n_samples=800)
    
    assert "surrogate_lgbm" in metrics
    assert metrics["surrogate_lgbm"]["r2"] > 0.70, "Surrogate model R² should be high on physics ground truth"
    
    # Test fast prediction
    pred = pipeline.predict_delta_t({
        "green_roof_coverage": 0.5,
        "cool_roof_albedo_boost": 0.3,
        "tree_canopy_addition": 0.2
    })
    assert pred >= 0.0

def test_nsga2_multi_objective_optimization():
    opt_res = run_multi_objective_optimization(
        study_area_id="delhi_cp",
        max_budget_usd=300000.0,
        pop_size=20,
        n_gen=10
    )
    
    assert "pareto_solutions" in opt_res
    assert len(opt_res["pareto_solutions"]) > 0
    assert opt_res["physics_validated"] is True
    assert "validated_delta_t" in opt_res["recommended_solution"]
    assert "hvac_energy_savings_kwh" in opt_res["recommended_solution"]

def test_auth_user_flow():
    import uuid
    email = f"planner_test_{uuid.uuid4().hex[:8]}@urbancoolsim.org"
    # 1. Register
    reg_resp = client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "SecurePassword123!",
        "full_name": "Climate Planner",
        "role": "planner"
    })
    assert reg_resp.status_code == 201
    
    # 2. Login
    login_resp = client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "SecurePassword123!"
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    
    # 3. Access Protected Route
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == email


def test_geo_digital_twin_engine_rasterization():
    from app.spatial.geo_digital_twin import geo_twin_engine
    
    # Verify microgrid for Mumbai BKC
    grid = geo_twin_engine.generate_microgrid("mumbai_bkc", 50, 50)
    assert grid["metadata"]["is_synthetic"] in (True, False)
    assert grid["metadata"]["tag"] == "GEOREFERENCED VECTOR + SEB-MODELLED DIGITAL TWIN"
    assert grid["metadata"]["has_observed_satellite_lst"] is False
    assert "layers" in grid
    layers = grid["layers"]
    
    t = np.array(layers["baseline_temperature_c"])
    w = np.array(layers["water_fraction"])
    b = np.array(layers["building_density"])
    v = np.array(layers["veg_fraction"])
    
    assert np.isfinite(t).all(), "Modelled temperatures must be finite"
    assert 0.0 < t.min() and t.max() < 85.0, "Modelled temperatures must remain within broad safety bounds"
    assert np.count_nonzero(np.isclose(t, 53.5)) < 0.10 * t.size, "Modelled temperatures must not be artificially flattened at 53.5 C"
    assert np.sum(w > 0.5) > 0, "Mithi river cells must be rasterized"
    assert np.sum(b > 0.5) > 0, "Commercial building complexes must be rasterized"
    assert np.sum(v > 0.5) > 0, "Jio Garden / Parks must be rasterized"
    # Mithi River water must be cooler than commercial towers
    assert t[w > 0.5].mean() < t[b > 0.5].mean(), "Water must provide cool thermal sink compared to buildings"


def test_digital_twin_buildings_endpoint():
    response = client.get("/api/v1/digital-twin/buildings?study_area_id=mumbai_bkc")
    assert response.status_code == 200
    data = response.json()
    assert data["type"] == "FeatureCollection"
    # Live OSM data provides 275 building footprints in Mumbai BKC
    assert len(data["features"]) >= 100
    names = [f["properties"]["name"] for f in data["features"]]
    assert any("Jio World" in n for n in names)
    assert any("Raheja" in n or "Bank" in n or "ICICI" in n for n in names)
    for feat in data["features"]:
        assert feat["geometry"]["type"] in ("Polygon", "MultiPolygon")
        assert feat["properties"]["height"] > 0


def test_digital_twin_inspect_cell():
    # Test cell inspection with landmark detection on a cell with mapped infrastructure
    response = client.get("/api/v1/digital-twin/inspect-cell?study_area_id=mumbai_bkc&row=0&col=1")
    assert response.status_code == 200
    data = response.json()
    assert "baseline_temperature_c" in data
    assert "landmark_name" in data
    assert data["landmark_name"] is not None
    assert "recommended_intervention" in data
    assert len(data["recommended_intervention"]) > 10

    # Verify out of bounds check continues to work
    oob = client.get("/api/v1/digital-twin/inspect-cell?study_area_id=mumbai_bkc&row=99&col=99&rows=50&cols=50")
    assert oob.status_code == 422
