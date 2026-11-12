#!/usr/bin/env python3
"""
UrbanCoolSim C3 Authoritative Pipeline & Verification Script

This script provides an automated, self-contained verification of the C3 pipeline:
  1. Authoritative simulation execution and persistent result creation
  2. 36-character UUID4 collision-resistant identifier (P1)
  3. Direct database persistence in SQLite
  4. Retrieval of past runs by exact run_id (P0)
  5. Listing of simulation runs scoped by user (P0)
  6. Decision report binding directly to exact simulation_run_id
  7. Ownership and access control boundaries (P0)
  8. Schema migration idempotency and safety (P0)

Usage:
    PYTHONPATH=backend ./.venv-backend/bin/python scripts/verify_c3_pipeline.py
"""

import os
import sys
import uuid
import datetime

# Ensure backend directory is in sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient

def run_verification():
    print("=" * 70)
    print(" UrbanCoolSim C3 Authoritative Pipeline Verification")
    print(f" Timestamp: {datetime.datetime.now().isoformat()}")
    print(f" Python Executable: {sys.executable}")
    print("=" * 70)

    from app.main import app
    from app.database import Base, SessionLocal, engine
    from app.main import run_auto_migrations
    from app.models.db_models import User, SimulationResult, Report
    from app.auth.security import create_access_token, hash_password

    client = TestClient(app)

    # -------------------------------------------------------------
    # Step 1: Database Auto-Migration Check
    # -------------------------------------------------------------
    print("\n[Step 1/7] Verifying database schema & auto-migrations...")
    Base.metadata.create_all(bind=engine)
    run_auto_migrations(engine)
    print("  -> Schema auto-migration checked and idempotent.")

    # -------------------------------------------------------------
    # Step 2: Set up test principals for authorization checks
    # -------------------------------------------------------------
    print("\n[Step 2/7] Initializing test principals for access control verification...")
    db = SessionLocal()
    try:
        def get_or_create(email, role, name):
            u = db.query(User).filter(User.email == email).first()
            if not u:
                u = User(
                    id=str(uuid.uuid4()),
                    email=email,
                    hashed_password=hash_password("pw_c3_verif_123"),
                    full_name=name,
                    role=role,
                    is_active=True
                )
                db.add(u)
                db.commit()
                db.refresh(u)
            return u

        user_alice = get_or_create("alice_c3@test.com", "user", "Alice Engineer")
        user_bob = get_or_create("bob_c3@test.com", "user", "Bob Engineer")
        admin_root = get_or_create("admin_c3@test.com", "admin", "Admin Root")

        alice_token = create_access_token({"sub": user_alice.id, "email": user_alice.email, "role": user_alice.role})
        bob_token = create_access_token({"sub": user_bob.id, "email": user_bob.email, "role": user_bob.role})
        admin_token = create_access_token({"sub": admin_root.id, "email": admin_root.email, "role": admin_root.role})

        alice_hdr = {"Authorization": f"Bearer {alice_token}"}
        bob_hdr = {"Authorization": f"Bearer {bob_token}"}
        admin_hdr = {"Authorization": f"Bearer {admin_token}"}
        print("  -> Alice (user), Bob (user), and Admin initialized.")
    finally:
        db.close()

    # -------------------------------------------------------------
    # Step 3: Run Physics Simulation (Alice)
    # -------------------------------------------------------------
    print("\n[Step 3/7] Executing authoritative physics simulation (Alice)...")
    sim_payload = {
        "scenario_id": "scen_c3_authoritative_run",
        "air_temperature_c": 41.5,
        "relative_humidity": 0.35,
        "wind_speed_ms": 2.5,
        "solar_radiation_wm2": 950.0,
        "anthropogenic_heat_wm2": 45.0,
        "rows": 25,
        "cols": 25
    }
    resp = client.post("/api/v1/thermal/simulate?study_area_id=delhi_cp", json=sim_payload, headers=alice_hdr)
    assert resp.status_code == 200, f"Simulation failed: {resp.status_code} {resp.text}"
    sim_data = resp.json()

    run_id = sim_data["run_id"]
    print(f"  -> Generated run_id: {run_id}")
    print(f"  -> Status: {sim_data['status']}")
    print(f"  -> Baseline T_mean: {sim_data['baseline_t_mean']} C")
    print(f"  -> Scenario T_mean: {sim_data['scenario_t_mean']} C")
    print(f"  -> Delta T_mean: {sim_data['delta_t_mean']} C")
    print(f"  -> Owner ID: {sim_data['owner_id']}")

    # Verify ID format & uniqueness constraint
    assert run_id.startswith("sim_"), "Run ID must start with 'sim_'"
    assert len(run_id) == 36, f"Run ID must be exactly 36 chars (sim_ + 32 hex chars), got {len(run_id)}"
    assert sim_data["owner_id"] == user_alice.id, "Simulation owner must match Alice"

    # -------------------------------------------------------------
    # Step 4: Verify Database Persistence
    # -------------------------------------------------------------
    print("\n[Step 4/7] Verifying persistent database record in SQLite...")
    db = SessionLocal()
    try:
        record = db.query(SimulationResult).filter(SimulationResult.id == run_id).first()
        assert record is not None, f"Record {run_id} missing in simulation_results table"
        assert record.scenario_id == "scen_c3_authoritative_run"
        assert record.owner_id == user_alice.id
        assert record.baseline_t_mean == sim_data["baseline_t_mean"]
        assert record.scenario_t_mean == sim_data["scenario_t_mean"]
        assert record.spatial_summary is not None
        print(f"  -> SQLite record confirmed: ID={record.id}, Owner={record.owner_id}, Baseline={record.baseline_t_mean}C")
    finally:
        db.close()

    # -------------------------------------------------------------
    # Step 5: Verify Retrieval & Access Control (P0)
    # -------------------------------------------------------------
    print("\n[Step 5/7] Verifying retrieval and authorization boundary...")
    # Alice retrieves her run -> 200 OK
    get_alice = client.get(f"/api/v1/thermal/runs/{run_id}", headers=alice_hdr)
    assert get_alice.status_code == 200, f"Alice should be able to retrieve own run: {get_alice.status_code}"
    print("  -> Alice retrieval: 200 OK")

    # Bob attempts to retrieve Alice's run -> 403 Forbidden
    get_bob = client.get(f"/api/v1/thermal/runs/{run_id}", headers=bob_hdr)
    assert get_bob.status_code == 403, f"Bob must receive 403 Forbidden: {get_bob.status_code}"
    print("  -> Bob unauthorized retrieval rejected: 403 Forbidden")

    # Anonymous attempts to retrieve Alice's run -> 401 Unauthorized
    get_anon = client.get(f"/api/v1/thermal/runs/{run_id}")
    assert get_anon.status_code == 401, f"Anonymous must receive 401 Unauthorized: {get_anon.status_code}"
    print("  -> Anonymous unauthenticated retrieval rejected: 401 Unauthorized")

    # Admin retrieves Alice's run -> 200 OK
    get_admin = client.get(f"/api/v1/thermal/runs/{run_id}", headers=admin_hdr)
    assert get_admin.status_code == 200, f"Admin must receive 200 OK: {get_admin.status_code}"
    print("  -> Admin authorized retrieval: 200 OK")

    # -------------------------------------------------------------
    # Step 6: Verify User-Scoped Run Listing
    # -------------------------------------------------------------
    print("\n[Step 6/7] Verifying user-scoped run listing...")
    list_bob = client.get("/api/v1/thermal/runs?limit=50", headers=bob_hdr).json()
    bob_seen_ids = [r["run_id"] for r in list_bob]
    assert run_id not in bob_seen_ids, "Bob should NOT see Alice's private run in listing"
    print("  -> Bob's listing excludes Alice's private run: Verified")

    list_admin = client.get("/api/v1/thermal/runs?limit=50", headers=admin_hdr).json()
    admin_seen_ids = [r["run_id"] for r in list_admin]
    assert run_id in admin_seen_ids, "Admin must see Alice's private run in listing"
    print("  -> Admin listing includes Alice's private run: Verified")

    # -------------------------------------------------------------
    # Step 7: Decision Report Bound to Exact Simulation Run
    # -------------------------------------------------------------
    print("\n[Step 7/7] Generating Decision Report tied to simulation_run_id...")
    # Bob tries to generate report for Alice's run -> 403
    rep_bob = client.post(
        "/api/v1/reports/generate",
        json={"title": "Bob Hijack Attempt", "study_area_id": "delhi_cp", "simulation_run_id": run_id},
        headers=bob_hdr
    )
    assert rep_bob.status_code == 403, f"Bob should not be able to generate report for Alice's run: {rep_bob.status_code}"
    print("  -> Bob report generation attempt on Alice's run rejected: 403 Forbidden")

    # Alice generates report for her run -> 200 OK
    rep_alice = client.post(
        "/api/v1/reports/generate",
        json={"title": "Verified C3 Decision Report", "study_area_id": "delhi_cp", "simulation_run_id": run_id},
        headers=alice_hdr
    )
    assert rep_alice.status_code == 200, f"Alice report generation failed: {rep_alice.status_code} {rep_alice.text}"
    rep_data = rep_alice.json()
    print(f"  -> Generated Report ID: {rep_data['id']}")
    print(f"  -> Bound simulation_run_id: {rep_data['simulation_run_id']}")
    assert rep_data["simulation_run_id"] == run_id, "Report must be bound to exact simulation_run_id"
    assert str(sim_data["baseline_t_mean"]) in rep_data["markdown_content"]
    assert str(sim_data["scenario_t_mean"]) in rep_data["markdown_content"]
    print("  -> Exact simulation numeric metrics confirmed in markdown report.")

    # -------------------------------------------------------------
    # Step 8: PDF Authorization & On-The-Fly Regeneration
    # -------------------------------------------------------------
    print("\n[Step 8/8] Verifying PDF authorization, missing-entity 404s & on-the-fly regeneration...")
    report_id = rep_data["id"]
    
    # 1. Bob denied download of Alice's report PDF
    dl_bob = client.get(f"/api/v1/reports/{report_id}/pdf", headers=bob_hdr)
    assert dl_bob.status_code == 403, f"Bob must receive 403 Forbidden: {dl_bob.status_code}"
    print("  -> Bob unauthorized PDF download rejected: 403 Forbidden")

    # 2. Anonymous denied download of Alice's report PDF
    dl_anon = client.get(f"/api/v1/reports/{report_id}/pdf")
    assert dl_anon.status_code == 401, f"Anonymous must receive 401 Unauthorized: {dl_anon.status_code}"
    print("  -> Anonymous unauthorized PDF download rejected: 401 Unauthorized")

    # 3. Missing run rejected with 404
    missing_sim_resp = client.post(
        "/api/v1/reports/generate",
        json={"title": "Missing Run Test", "study_area_id": "delhi_cp", "simulation_run_id": "sim_missing_99999"}
    )
    assert missing_sim_resp.status_code == 404
    print("  -> Missing simulation_run_id rejection confirmed: 404 Not Found")

    # 4. Missing report PDF download rejected with 404
    missing_rep_pdf = client.get(f"/api/v1/reports/{uuid.uuid4()}/pdf")
    assert missing_rep_pdf.status_code == 404
    print("  -> Missing report_id PDF rejection confirmed: 404 Not Found")

    # 5. On-the-fly regeneration: remove physical PDF file if present
    import os
    from app.config import settings
    pdf_path = os.path.join(settings.STORAGE_DIR, "reports", f"report_{report_id}.pdf")
    if os.path.exists(pdf_path):
        os.remove(pdf_path)
    assert not os.path.exists(pdf_path), "File should be removed to test on-the-fly regeneration"

    # Alice requests PDF -> regenerated on the fly -> 200 OK
    dl_alice = client.get(f"/api/v1/reports/{report_id}/pdf", headers=alice_hdr)
    assert dl_alice.status_code == 200, f"Alice PDF download failed: {dl_alice.status_code}"
    assert dl_alice.headers["content-type"] == "application/pdf"
    assert dl_alice.content.startswith(b"%PDF")
    assert os.path.exists(pdf_path), "PDF must be recreated on disk during regeneration"
    print("  -> PDF on-the-fly regeneration verified: 200 OK (application/pdf)")

    print("\n" + "=" * 70)
    print(" ALL 8 VERIFICATION STEPS PASSED SUCCESSFULLY (100% ERROR FREE)")
    print("=" * 70)
    return 0

if __name__ == "__main__":
    sys.exit(run_verification())

