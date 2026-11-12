import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.database import SessionLocal
from app.models.db_models import User, SimulationResult, Report
from app.auth.security import create_access_token, hash_password

client = TestClient(app)

@pytest.fixture(scope="module")
def setup_users():
    """
    Creates test users: User A (regular), User B (regular), and Admin.
    """
    db: Session = SessionLocal()
    try:
        def get_or_create_user(email: str, role: str, full_name: str) -> User:
            u = db.query(User).filter(User.email == email).first()
            if not u:
                u = User(
                    id=str(uuid.uuid4()),
                    email=email,
                    hashed_password=hash_password("securepassword123"),
                    full_name=full_name,
                    role=role,
                    is_active=True
                )
                db.add(u)
                db.commit()
                db.refresh(u)
            return u

        user_a = get_or_create_user("user_a_c3@test.com", "user", "User Alpha")
        user_b = get_or_create_user("user_b_c3@test.com", "user", "User Beta")
        admin = get_or_create_user("admin_c3@test.com", "admin", "Admin C3")

        token_a = create_access_token({"sub": user_a.id, "email": user_a.email, "role": user_a.role})
        token_b = create_access_token({"sub": user_b.id, "email": user_b.email, "role": user_b.role})
        token_admin = create_access_token({"sub": admin.id, "email": admin.email, "role": admin.role})

        return {
            "user_a": user_a,
            "user_b": user_b,
            "admin": admin,
            "headers_a": {"Authorization": f"Bearer {token_a}"},
            "headers_b": {"Authorization": f"Bearer {token_b}"},
            "headers_admin": {"Authorization": f"Bearer {token_admin}"},
        }
    finally:
        db.close()


def test_simulation_identifier_uniqueness_and_format(setup_users):
    """
    P1 requirement:
    Verify that generated run_id uses a 32-character hexadecimal UUID4 (36 chars total with prefix),
    guaranteeing 128-bit collision resistance.
    """
    payload = {"scenario_id": "scen_uuid_test", "rows": 10, "cols": 10}
    resp = client.post("/api/v1/thermal/simulate?study_area_id=delhi_cp", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    run_id = data["run_id"]
    
    assert run_id.startswith("sim_")
    # 4 prefix chars ('sim_') + 32 hex chars = 36 chars
    hex_part = run_id[4:]
    assert len(hex_part) == 32
    # Verify hexadecimal validity
    int(hex_part, 16)
    assert len(run_id) == 36


def test_simulation_run_ownership_and_access_control(setup_users):
    """
    P0 requirement:
    Verify that:
    1. Authenticated simulations record owner_id.
    2. Owner can retrieve their run.
    3. Another non-admin user receives 403 Forbidden.
    4. Unauthenticated caller receives 401 Unauthorized for private run.
    5. Admin can access any run.
    """
    headers_a = setup_users["headers_a"]
    headers_b = setup_users["headers_b"]
    headers_admin = setup_users["headers_admin"]
    user_a = setup_users["user_a"]

    # 1. User A triggers simulation
    payload_a = {"scenario_id": "scen_user_a", "rows": 10, "cols": 10}
    resp_a = client.post(
        "/api/v1/thermal/simulate?study_area_id=delhi_cp",
        json=payload_a,
        headers=headers_a
    )
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    run_id_a = data_a["run_id"]
    assert data_a["owner_id"] == user_a.id

    # 2. User A retrieves User A's run -> 200 OK
    resp_get_a = client.get(f"/api/v1/thermal/runs/{run_id_a}", headers=headers_a)
    assert resp_get_a.status_code == 200
    assert resp_get_a.json()["id"] == run_id_a

    # 3. User B retrieves User A's run -> 403 Forbidden
    resp_get_b = client.get(f"/api/v1/thermal/runs/{run_id_a}", headers=headers_b)
    assert resp_get_b.status_code == 403
    assert "not authorized" in resp_get_b.json()["detail"].lower()

    # 4. Anonymous retrieves User A's run -> 401 Unauthorized
    resp_get_anon = client.get(f"/api/v1/thermal/runs/{run_id_a}")
    assert resp_get_anon.status_code == 401
    assert "authentication required" in resp_get_anon.json()["detail"].lower()

    # 5. Admin retrieves User A's run -> 200 OK
    resp_get_admin = client.get(f"/api/v1/thermal/runs/{run_id_a}", headers=headers_admin)
    assert resp_get_admin.status_code == 200
    assert resp_get_admin.json()["id"] == run_id_a


def test_simulation_run_listing_scoped_by_user(setup_users):
    """
    P0 requirement:
    Verify that GET /api/v1/thermal/runs filters correctly:
    - User B sees only their runs and public (unowned) runs.
    - User B does NOT see User A's private runs.
    - Admin sees all runs.
    - Anonymous sees only public runs.
    """
    headers_a = setup_users["headers_a"]
    headers_b = setup_users["headers_b"]
    headers_admin = setup_users["headers_admin"]

    # User A creates a run
    resp_a = client.post(
        "/api/v1/thermal/simulate?study_area_id=delhi_cp",
        json={"scenario_id": "scen_list_a", "rows": 10, "cols": 10},
        headers=headers_a
    )
    run_id_a = resp_a.json()["run_id"]

    # User B creates a run
    resp_b = client.post(
        "/api/v1/thermal/simulate?study_area_id=delhi_cp",
        json={"scenario_id": "scen_list_b", "rows": 10, "cols": 10},
        headers=headers_b
    )
    run_id_b = resp_b.json()["run_id"]

    # Anonymous creates a public run
    resp_anon = client.post(
        "/api/v1/thermal/simulate?study_area_id=delhi_cp",
        json={"scenario_id": "scen_list_pub", "rows": 10, "cols": 10}
    )
    run_id_pub = resp_anon.json()["run_id"]

    # User B listing
    list_b = client.get("/api/v1/thermal/runs?limit=50", headers=headers_b).json()
    b_run_ids = [r["run_id"] for r in list_b]
    assert run_id_b in b_run_ids
    assert run_id_pub in b_run_ids
    assert run_id_a not in b_run_ids, "User B should not see User A's private simulation run"

    # Anonymous listing
    list_anon = client.get("/api/v1/thermal/runs?limit=50").json()
    anon_run_ids = [r["run_id"] for r in list_anon]
    assert run_id_pub in anon_run_ids
    assert run_id_a not in anon_run_ids, "Anonymous should not see User A's private simulation run"
    assert run_id_b not in anon_run_ids, "Anonymous should not see User B's private simulation run"

    # Admin listing
    list_admin = client.get("/api/v1/thermal/runs?limit=50", headers=headers_admin).json()
    admin_run_ids = [r["run_id"] for r in list_admin]
    assert run_id_a in admin_run_ids
    assert run_id_b in admin_run_ids
    assert run_id_pub in admin_run_ids


def test_report_authorization_with_private_simulation_run(setup_users):
    """
    P0 requirement:
    Verify that:
    1. User B cannot generate a report tied to User A's private simulation run (403 Forbidden).
    2. Anonymous cannot generate a report tied to User A's private simulation run (401 Unauthorized).
    3. User A can generate a report tied to User A's private simulation run (200 OK).
    4. User B cannot download User A's private report (403 Forbidden).
    5. Admin can download User A's report (200 OK).
    """
    headers_a = setup_users["headers_a"]
    headers_b = setup_users["headers_b"]
    headers_admin = setup_users["headers_admin"]

    # User A creates a simulation run
    sim_resp = client.post(
        "/api/v1/thermal/simulate?study_area_id=delhi_cp",
        json={"scenario_id": "scen_report_auth", "rows": 10, "cols": 10},
        headers=headers_a
    )
    sim_run_id = sim_resp.json()["run_id"]

    # 1. User B tries to generate report referencing User A's run -> 403
    rep_req_b = {
        "title": "Unauthorized Report Attempt",
        "study_area_id": "delhi_cp",
        "simulation_run_id": sim_run_id
    }
    resp_rep_b = client.post("/api/v1/reports/generate", json=rep_req_b, headers=headers_b)
    assert resp_rep_b.status_code == 403
    assert "not authorized" in resp_rep_b.json()["detail"].lower()

    # 2. Anonymous tries to generate report referencing User A's run -> 401
    resp_rep_anon = client.post("/api/v1/reports/generate", json=rep_req_b)
    assert resp_rep_anon.status_code == 401

    # 3. User A generates report referencing their own run -> 200 OK
    rep_req_a = {
        "title": "User A Authorized Report",
        "study_area_id": "delhi_cp",
        "simulation_run_id": sim_run_id
    }
    resp_rep_a = client.post("/api/v1/reports/generate", json=rep_req_a, headers=headers_a)
    assert resp_rep_a.status_code == 200
    report_data_a = resp_rep_a.json()
    report_id = report_data_a["id"]

    # 4. User B attempts to download User A's report PDF -> 403 Forbidden
    dl_b = client.get(f"/api/v1/reports/{report_id}/pdf", headers=headers_b)
    assert dl_b.status_code == 403
    assert "not authorized" in dl_b.json()["detail"].lower()

    # 5. Admin can download User A's report PDF -> 200 OK
    dl_admin = client.get(f"/api/v1/reports/{report_id}/pdf", headers=headers_admin)
    assert dl_admin.status_code == 200

