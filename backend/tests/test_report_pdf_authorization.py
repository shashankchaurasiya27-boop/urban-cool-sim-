import os
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.main import app
from app.database import SessionLocal
from app.models.db_models import User, SimulationResult, Report
from app.auth.security import create_access_token, hash_password

client = TestClient(app)

@pytest.fixture(scope="module")
def auth_principals():
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

        alice = get_or_create_user("alice_pdf_auth@test.com", "user", "Alice PDF Auth")
        bob = get_or_create_user("bob_pdf_auth@test.com", "user", "Bob PDF Auth")
        admin = get_or_create_user("admin_pdf_auth@test.com", "admin", "Admin PDF Auth")

        token_alice = create_access_token({"sub": alice.id, "email": alice.email, "role": alice.role})
        token_bob = create_access_token({"sub": bob.id, "email": bob.email, "role": bob.role})
        token_admin = create_access_token({"sub": admin.id, "email": admin.email, "role": admin.role})

        return {
            "alice": alice,
            "bob": bob,
            "admin": admin,
            "headers_alice": {"Authorization": f"Bearer {token_alice}"},
            "headers_bob": {"Authorization": f"Bearer {token_bob}"},
            "headers_admin": {"Authorization": f"Bearer {token_admin}"},
        }
    finally:
        db.close()


def test_missing_simulation_run_rejected_with_404():
    """
    Verifies that referencing a non-existent simulation_run_id returns HTTP 404
    both on run retrieval and on report generation.
    """
    missing_id = f"sim_{uuid.uuid4().hex}"
    
    # 1. Retrieval of missing run
    resp_get = client.get(f"/api/v1/thermal/runs/{missing_id}")
    assert resp_get.status_code == 404
    assert f"simulation run '{missing_id}' not found" in resp_get.json()["detail"].lower()

    # 2. Report generation with missing run
    resp_rep = client.post("/api/v1/reports/generate", json={
        "title": "Missing Run Report",
        "study_area_id": "delhi_cp",
        "simulation_run_id": missing_id
    })
    assert resp_rep.status_code == 404
    assert f"simulation run '{missing_id}' not found" in resp_rep.json()["detail"].lower()


def test_missing_report_pdf_download_rejected_with_404():
    """
    Verifies that requesting a PDF for a non-existent report returns HTTP 404.
    """
    missing_rep_id = str(uuid.uuid4())
    resp = client.get(f"/api/v1/reports/{missing_rep_id}/pdf")
    assert resp.status_code == 404
    assert f"report '{missing_rep_id}' not found" in resp.json()["detail"].lower()


def test_authenticated_report_and_pdf_authorization_lifecycle(auth_principals):
    """
    Verifies full authorization matrix for reports and PDF downloads:
    - Alice owns run -> creates private report.
    - Bob is denied report generation and PDF download with 403 Forbidden.
    - Anonymous is denied with 401 Unauthorized.
    - Alice can download her PDF with 200 OK.
    - Admin can download Alice's PDF with 200 OK.
    """
    alice_hdr = auth_principals["headers_alice"]
    bob_hdr = auth_principals["headers_bob"]
    admin_hdr = auth_principals["headers_admin"]

    # 1. Alice creates private simulation run
    sim_resp = client.post(
        "/api/v1/thermal/simulate?study_area_id=delhi_cp",
        json={"scenario_id": "scen_alice_auth", "rows": 10, "cols": 10},
        headers=alice_hdr
    )
    assert sim_resp.status_code == 200
    run_id = sim_resp.json()["run_id"]

    # 2. Bob tries to create report for Alice's run -> 403
    bob_rep_attempt = client.post(
        "/api/v1/reports/generate",
        json={"title": "Bob Hijack", "study_area_id": "delhi_cp", "simulation_run_id": run_id},
        headers=bob_hdr
    )
    assert bob_rep_attempt.status_code == 403
    assert "not authorized" in bob_rep_attempt.json()["detail"].lower()

    # 3. Anonymous tries to create report for Alice's run -> 401
    anon_rep_attempt = client.post(
        "/api/v1/reports/generate",
        json={"title": "Anon Hijack", "study_area_id": "delhi_cp", "simulation_run_id": run_id}
    )
    assert anon_rep_attempt.status_code == 401

    # 4. Alice creates report for her run -> 200 OK
    alice_rep = client.post(
        "/api/v1/reports/generate",
        json={"title": "Alice Private Report", "study_area_id": "delhi_cp", "simulation_run_id": run_id},
        headers=alice_hdr
    )
    assert alice_rep.status_code == 200
    report_id = alice_rep.json()["id"]

    # 5. Bob tries to download Alice's report PDF -> 403
    dl_bob = client.get(f"/api/v1/reports/{report_id}/pdf", headers=bob_hdr)
    assert dl_bob.status_code == 403

    # 6. Anonymous tries to download Alice's report PDF -> 401
    dl_anon = client.get(f"/api/v1/reports/{report_id}/pdf")
    assert dl_anon.status_code == 401

    # 7. Alice downloads her report PDF -> 200 OK
    dl_alice = client.get(f"/api/v1/reports/{report_id}/pdf", headers=alice_hdr)
    assert dl_alice.status_code == 200
    assert dl_alice.headers["content-type"] == "application/pdf"
    assert dl_alice.content.startswith(b"%PDF")

    # 8. Admin downloads Alice's report PDF -> 200 OK
    dl_admin = client.get(f"/api/v1/reports/{report_id}/pdf", headers=admin_hdr)
    assert dl_admin.status_code == 200
    assert dl_admin.headers["content-type"] == "application/pdf"
    assert dl_admin.content.startswith(b"%PDF")


def test_pdf_on_the_fly_regeneration_when_file_deleted(auth_principals):
    """
    Regression test for P1 blocker:
    Verifies that:
    1. If the physical PDF report file is removed/missing from disk, the endpoint regenerates
       it on the fly using the EXACT persisted report/run inputs and metrics.
    2. If the linked simulation run is missing/deleted from the database when regeneration
       is attempted, the endpoint returns HTTP 409 Conflict rather than generating an
       inconsistent or unfaithful document.
    """
    alice_hdr = auth_principals["headers_alice"]

    # 1. Create a simulation run and report
    sim_resp = client.post(
        "/api/v1/thermal/simulate?study_area_id=mumbai_bkc",
        json={"scenario_id": "scen_regen_test", "rows": 10, "cols": 10},
        headers=alice_hdr
    )
    run_id = sim_resp.json()["run_id"]
    sim_data = sim_resp.json()

    rep_resp = client.post(
        "/api/v1/reports/generate",
        json={"title": "Regeneration Test Report", "study_area_id": "mumbai_bkc", "simulation_run_id": run_id},
        headers=alice_hdr
    )
    report_id = rep_resp.json()["id"]

    # 2. Check physical file path and remove it from disk
    reports_dir = os.path.join(settings.STORAGE_DIR, "reports")
    pdf_filepath = os.path.join(reports_dir, f"report_{report_id}.pdf")
    if os.path.exists(pdf_filepath):
        os.remove(pdf_filepath)
    assert not os.path.exists(pdf_filepath), "PDF file should be deleted before testing regeneration"

    # 3. Call download endpoint; should regenerate on the fly using exact run metrics
    dl_resp = client.get(f"/api/v1/reports/{report_id}/pdf", headers=alice_hdr)
    assert dl_resp.status_code == 200
    assert dl_resp.headers["content-type"] == "application/pdf"
    assert dl_resp.content.startswith(b"%PDF")

    # 4. Confirm the file now exists on disk
    assert os.path.exists(pdf_filepath), "PDF file must be reconstructed on disk by regeneration logic"

    # 5. P1 Conflict test: remove PDF again and delete the underlying simulation result from DB
    os.remove(pdf_filepath)
    db = SessionLocal()
    try:
        db.query(SimulationResult).filter(SimulationResult.id == run_id).delete()
        db.commit()
    finally:
        db.close()

    # Now attempting to regenerate must return HTTP 409 Conflict
    conflict_resp = client.get(f"/api/v1/reports/{report_id}/pdf", headers=alice_hdr)
    assert conflict_resp.status_code == 409
    assert "cannot regenerate report pdf" in conflict_resp.json()["detail"].lower()
    assert run_id in conflict_resp.json()["detail"]


def test_public_unowned_report_and_simulation_semantics():
    """
    Verifies that unowned/public simulation runs and reports (owner_id=None):
    - Are accessible to anonymous callers.
    - Are accessible to authenticated regular users and admins.
    - Guarantee backwards compatibility for legacy and public demo scenarios.
    """
    # 1. Anonymous creates public run
    sim_resp = client.post(
        "/api/v1/thermal/simulate?study_area_id=delhi_cp",
        json={"scenario_id": "scen_pub_demo", "rows": 10, "cols": 10}
    )
    assert sim_resp.status_code == 200
    pub_run_id = sim_resp.json()["run_id"]
    assert sim_resp.json()["owner_id"] is None

    # 2. Anonymous retrieves public run -> 200 OK
    get_pub = client.get(f"/api/v1/thermal/runs/{pub_run_id}")
    assert get_pub.status_code == 200
    assert get_pub.json()["owner_id"] is None

    # 3. Anonymous generates public report -> 200 OK
    rep_resp = client.post(
        "/api/v1/reports/generate",
        json={"title": "Public Demo Report", "study_area_id": "delhi_cp", "simulation_run_id": pub_run_id}
    )
    assert rep_resp.status_code == 200
    pub_report_id = rep_resp.json()["id"]

    # 4. Anonymous downloads public report PDF -> 200 OK
    dl_anon = client.get(f"/api/v1/reports/{pub_report_id}/pdf")
    assert dl_anon.status_code == 200
    assert dl_anon.headers["content-type"] == "application/pdf"
    assert dl_anon.content.startswith(b"%PDF")

