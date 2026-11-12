import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.db_models import SimulationResult, Scenario, Report

client = TestClient(app)

def test_simulation_run_persistence_and_identity():
    """
    Verifies that running a simulation:
    1. Returns a valid run_id and status='completed'.
    2. Persists the SimulationResult record to the database.
    3. Guarantees numeric fidelity and non-empty spatial summary.
    """
    payload = {
        "scenario_id": "scen_test_persist",
        "air_temperature_c": 38.0,
        "relative_humidity": 0.40,
        "wind_speed_ms": 2.0,
        "solar_radiation_wm2": 800.0,
        "anthropogenic_heat_wm2": 30.0,
        "rows": 20,
        "cols": 20
    }
    
    resp = client.post("/api/v1/thermal/simulate?study_area_id=delhi_cp", json=payload)
    assert resp.status_code == 200, f"Expected 200 OK, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    assert "run_id" in data and data["run_id"] is not None
    assert data["run_id"].startswith("sim_")
    assert data["status"] == "completed"
    assert data["id"] == data["run_id"]
    assert isinstance(data["baseline_t_mean"], (int, float))
    assert isinstance(data["scenario_t_mean"], (int, float))
    assert isinstance(data["delta_t_mean"], (int, float))
    
    # Verify record in SQLite database
    db = SessionLocal()
    try:
        run_record = db.query(SimulationResult).filter(SimulationResult.id == data["run_id"]).first()
        assert run_record is not None, f"Record with id {data['run_id']} not found in simulation_results table"
        assert run_record.scenario_id == "scen_test_persist"
        assert run_record.baseline_t_mean == data["baseline_t_mean"]
        assert run_record.scenario_t_mean == data["scenario_t_mean"]
        assert run_record.delta_t_mean == data["delta_t_mean"]
        assert run_record.energy_fluxes_json is not None
        assert "Q_star_mean" in run_record.energy_fluxes_json
        assert run_record.spatial_summary is not None
        assert "spatial_delta_map" in run_record.spatial_summary
    finally:
        db.close()


def test_get_simulation_run_by_id():
    """
    Verifies that a past simulation run can be reliably retrieved by its run_id.
    """
    # Create a simulation run first
    payload = {
        "scenario_id": "scen_retrieve_test",
        "rows": 15,
        "cols": 15
    }
    create_resp = client.post("/api/v1/thermal/simulate?study_area_id=mumbai_bkc", json=payload)
    assert create_resp.status_code == 200
    created_data = create_resp.json()
    run_id = created_data["run_id"]
    
    # Retrieve the run by ID
    get_resp = client.get(f"/api/v1/thermal/runs/{run_id}")
    assert get_resp.status_code == 200
    retrieved_data = get_resp.json()
    
    assert retrieved_data["id"] == run_id
    assert retrieved_data["run_id"] == run_id
    assert retrieved_data["status"] == "completed"
    assert retrieved_data["baseline_t_mean"] == created_data["baseline_t_mean"]
    assert retrieved_data["scenario_t_mean"] == created_data["scenario_t_mean"]
    assert retrieved_data["delta_t_mean"] == created_data["delta_t_mean"]


def test_get_simulation_run_404_on_unknown():
    """
    Verifies that an unknown run_id returns 404 with a clear error detail.
    """
    resp = client.get("/api/v1/thermal/runs/sim_non_existent_99999")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_list_simulation_runs():
    """
    Verifies listing past simulation runs.
    """
    resp = client.get("/api/v1/thermal/runs?limit=10")
    assert resp.status_code == 200
    runs = resp.json()
    assert isinstance(runs, list)
    assert len(runs) >= 1
    for r in runs:
        assert "run_id" in r
        assert "status" in r
        assert r["status"] == "completed"


def test_report_generation_tied_to_exact_simulation_run():
    """
    Verifies that report generation binds directly to an exact simulation_run_id.
    """
    # 1. Create simulation run
    sim_payload = {
        "scenario_id": "scen_exact_report_test",
        "rows": 15,
        "cols": 15
    }
    sim_resp = client.post("/api/v1/thermal/simulate?study_area_id=delhi_cp", json=sim_payload)
    assert sim_resp.status_code == 200
    sim_data = sim_resp.json()
    sim_run_id = sim_data["run_id"]
    
    # 2. Generate report citing exact simulation_run_id
    report_payload = {
        "title": "Exact Simulation Run Report",
        "study_area_id": "delhi_cp",
        "simulation_run_id": sim_run_id
    }
    rep_resp = client.post("/api/v1/reports/generate", json=report_payload)
    assert rep_resp.status_code == 200
    rep_data = rep_resp.json()
    
    assert rep_data["simulation_run_id"] == sim_run_id
    assert str(sim_data["baseline_t_mean"]) in rep_data["markdown_content"]
    assert str(sim_data["scenario_t_mean"]) in rep_data["markdown_content"]


def test_simulation_persistence_failure_returns_500_and_no_completed_response(monkeypatch):
    """
    Regression test for P0 blocker:
    Verifies that if db.commit/refresh fails during simulation persistence,
    the API rolls back and immediately fails with HTTP 500, and NEVER returns
    a false status='completed' response.
    """
    from sqlalchemy.orm import Session
    from sqlalchemy.exc import OperationalError

    original_commit = Session.commit
    call_count = {"count": 0}

    def failing_commit(self):
        call_count["count"] += 1
        # Allow scenario commit (if any), but fail when persisting the simulation record
        raise OperationalError("disk I/O error or transaction aborted", {}, None)

    monkeypatch.setattr(Session, "commit", failing_commit)

    payload = {
        "scenario_id": "scen_failing_commit_test",
        "rows": 10,
        "cols": 10
    }
    resp = client.post("/api/v1/thermal/simulate?study_area_id=delhi_cp", json=payload)

    # Must fail with 500 Internal Server Error
    assert resp.status_code == 500, f"Expected 500, got {resp.status_code}: {resp.text}"
    body = resp.json()
    assert "detail" in body
    assert "persistence failed" in body["detail"].lower()
    assert "completed" not in str(body).lower() or "status" not in body


