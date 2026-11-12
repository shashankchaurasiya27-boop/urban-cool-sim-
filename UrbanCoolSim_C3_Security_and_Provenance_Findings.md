# UrbanCoolSim C3 — Security and Provenance Findings Report

**Audit Date:** 2026-10-31  
**Auditor:** Senior Software Engineer, QA Lead & Security Reviewer  
**Scope:** Multi-Tenancy Isolation, Job Authorization, Scientific Provenance & PDF Regeneration  
**Target Modules:** `backend/app/api/jobs_router.py`, `backend/app/api/reports_router.py`  
**Test Suites:** `backend/tests/test_job_authorization.py`, `backend/tests/test_report_pdf_authorization.py`  

---

## 1. Executive Summary

This security and provenance audit investigated access control policies and scientific data lineage across background computation jobs, simulation run persistence, and decision report generation.

Two critical vulnerabilities were identified in the baseline implementation:
1. **P0 Multi-Tenant Job Data Leakage (`jobs_router.py`):** An inverted boolean logic gate allowed unauthenticated (anonymous) callers to bypass tenant isolation and retrieve private background simulation jobs belonging to all users. Additionally, individual job status retrieval lacked authorization checks entirely (Insecure Direct Object Reference / IDOR).
2. **P0 Scientific Provenance Ambiguity & Silent Run Substitution (`reports_router.py`):** When generating reports or regenerating report PDFs without an explicit `simulation_run_id`, the system silently defaulted to the most recent run for a given `scenario_id`. In multi-run workflows, this silently swapped simulation data and corrupted scientific audit trails.

Both defects have been remediated with fail-closed security controls and verified through automated test suites.

---

## 2. Vulnerability 1: Job Authorization & Tenant Isolation Defect

### 2.1. Defect Description & Root Cause

In `backend/app/api/jobs_router.py`, the `list_jobs` and `get_job_status` endpoints exhibited severe authorization gaps:

#### Line Listing Flaw (`list_jobs`):
```python
# VULNERABLE CODE (baseline jobs_router.py)
query = db.query(SimulationJob)
if current_user and current_user.role != "admin":
    query = query.filter(
        (SimulationJob.owner_id == current_user.id) | (SimulationJob.owner_id.is_(None))
    )
jobs = query.order_by(SimulationJob.created_at.desc()).limit(20).all()
```
- **Exploitation Mechanism:** When an unauthenticated caller accessed `GET /api/v1/jobs`, `current_user` was `None`. The condition `if current_user and current_user.role != "admin"` evaluated to `False`. As a result, the query remained completely unfiltered. Unauthenticated anonymous callers received a list of private simulation jobs from all registered users, including confidential scenario IDs, study areas, and execution metadata.

#### Direct Object Reference Flaw (`get_job_status`):
```python
# VULNERABLE CODE (baseline jobs_router.py)
@router.get("/{job_id}")
def get_job_status(job_id: str, db: Session = Depends(get_db), current_user: Optional[User] = Depends(get_current_user_optional)):
    job = db.query(SimulationJob).filter(SimulationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Simulation job '{job_id}' not found")
    return { ... } # Returned full job metadata without any ownership or role check!
```
- **Exploitation Mechanism:** `job.owner_id` was never inspected. Any caller possessing or guessing a job ID (UUID) could retrieve execution progress, errors, and proprietary `result_metadata`.

### 2.2. Remediated Implementation

The router was updated to enforce explicit multi-tenant boundaries:

```python
# REMEDIATED CODE (backend/app/api/jobs_router.py)
@router.get("", response_model=List[dict])
def list_jobs(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    query = db.query(SimulationJob)
    if current_user is None:
        # Anonymous users only see unowned/public jobs
        query = query.filter(SimulationJob.owner_id.is_(None))
    elif current_user.role != "admin":
        # Non-admin users see their own jobs and public jobs
        query = query.filter(
            (SimulationJob.owner_id == current_user.id) | (SimulationJob.owner_id.is_(None))
        )
    # Admin users see all jobs
    jobs = query.order_by(SimulationJob.created_at.desc()).limit(20).all()
    return [ ... ]

@router.get("/{job_id}")
def get_job_status(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    job = db.query(SimulationJob).filter(SimulationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Simulation job '{job_id}' not found")

    if job.owner_id is not None:
        if not current_user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required to view this private job")
        if current_user.role != "admin" and current_user.id != job.owner_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access forbidden: you do not own this job")

    return { ... }
```

### 2.3. Verification Evidence

A comprehensive regression suite was authored in `backend/tests/test_job_authorization.py` testing 8 distinct criteria:

| Criterion | Test Name | Expected Status | Verified Status | Result |
| :--- | :--- | :---: | :---: | :---: |
| 1. Anonymous cannot list private jobs | `test_req1_anonymous_cannot_list_private_jobs` | 200 (filtered list) | 200 (excludes private) | **PASS** |
| 2. Anonymous cannot access private job details | `test_req2_anonymous_cannot_access_private_job_details` | 401 Unauthorized | 401 Unauthorized | **PASS** |
| 3. Authenticated owner can access own job | `test_req3_authenticated_owner_can_access_own_job` | 200 OK | 200 OK | **PASS** |
| 4. Non-owner cannot access another user's job | `test_req4_non_owner_forbidden_from_accessing_private_job` | 403 Forbidden | 403 Forbidden | **PASS** |
| 5. Admin can access any job and list all jobs | `test_req5_admin_can_access_any_job_and_list_all` | 200 OK (all jobs) | 200 OK (all jobs) | **PASS** |
| 6. Public jobs (`owner_id=None`) accessible to all | `test_req6_public_jobs_accessible_to_all` | 200 OK (all roles) | 200 OK (all roles) | **PASS** |
| 7. Unauthorized access does not leak metadata | `test_req7_unauthorized_access_does_not_leak_job_metadata` | 401/403 (no data) | 401/403 (no data) | **PASS** |
| 8. Legitimate job workflows function correctly | `test_req8_legitimate_job_workflows_continue_to_function` | 200 / 404 on missing | 200 / 404 on missing | **PASS** |

Execution Output:
```text
backend/tests/test_job_authorization.py::test_req1_anonymous_cannot_list_private_jobs PASSED
backend/tests/test_job_authorization.py::test_req2_anonymous_cannot_access_private_job_details PASSED
backend/tests/test_job_authorization.py::test_req3_authenticated_owner_can_access_own_job PASSED
backend/tests/test_job_authorization.py::test_req4_non_owner_forbidden_from_accessing_private_job PASSED
backend/tests/test_job_authorization.py::test_req5_admin_can_access_any_job_and_list_all PASSED
backend/tests/test_job_authorization.py::test_req6_public_jobs_accessible_to_all PASSED
backend/tests/test_job_authorization.py::test_req7_unauthorized_access_does_not_leak_job_metadata PASSED
backend/tests/test_job_authorization.py::test_req8_legitimate_job_workflows_continue_to_function PASSED
8 passed in 0.10s
```

---

## 3. Vulnerability 2: Scientific Provenance Defect & Silent Run Substitution

### 3.1. Defect Description & Scientific Impact

In scientific microclimate modeling, reports and published figures must maintain cryptographic or immutable references to the exact input parameters and numerical outputs of a specific simulation run.

In `backend/app/api/reports_router.py`:
```python
# VULNERABLE CODE (baseline reports_router.py)
if req.simulation_run_id:
    sim_res = db.query(SimulationResult).filter(SimulationResult.id == req.simulation_run_id).first()
    ...
elif req.scenario_id:
    # SILENT FALLBACK: Arbitrarily grabbed the latest run created in the DB!
    sim_res = db.query(SimulationResult).filter(
        SimulationResult.scenario_id == req.scenario_id
    ).order_by(SimulationResult.created_at.desc()).first()
```

- **Scientific Failure:** If User A executed a simulation for scenario `green_roof_v1` on Monday, and User B ran another test for `green_roof_v1` on Tuesday, User A generating a report on Wednesday citing only `scenario_id="green_roof_v1"` would silently receive User B's numerical results without any warning or acknowledgement.
- **PDF Regeneration Risk:** When regenerating deleted PDFs on the fly in `download_report_pdf`, the same fallback silently generated a document with different metrics than originally published.

### 3.2. Remediated Implementation

The report generation and PDF regeneration endpoints were updated to enforce exact lineage:
1. **Ambiguity Rejection (HTTP 409 Conflict):** If `simulation_run_id` is omitted and the scenario has more than one simulation run in the database, the API refuses to guess and raises `HTTP 409 Conflict`, requiring the caller to supply the exact `simulation_run_id`.
2. **Deterministic Single-Run Binding:** If exactly one run exists for that scenario, it binds deterministically. If zero runs exist (such as study-area overview reports), it proceeds without simulation metrics.
3. **Fail-Closed PDF Regeneration:** In `download_report_pdf`, if the linked `simulation_run_id` was deleted from the database or multiple runs exist without an exact run link, regeneration fails with `HTTP 409 Conflict` rather than synthesizing or guessing results.

```python
# REMEDIATED CODE (backend/app/api/reports_router.py)
if req.simulation_run_id:
    sim_res = db.query(SimulationResult).filter(SimulationResult.id == req.simulation_run_id).first()
    if not sim_res:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Simulation run '{req.simulation_run_id}' not found")
elif req.scenario_id:
    matching_runs = db.query(SimulationResult).filter(
        SimulationResult.scenario_id == req.scenario_id
    ).order_by(SimulationResult.created_at.desc()).all()
    if len(matching_runs) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Multiple simulation runs exist for scenario '{req.scenario_id}'. An explicit 'simulation_run_id' is required to ensure scientific provenance."
        )
    elif len(matching_runs) == 1:
        sim_res = matching_runs[0]
    else:
        sim_res = None
```

### 3.3. Verification Evidence

Added regression test `test_scenario_ambiguity_requires_explicit_simulation_run_id` to `backend/tests/test_report_pdf_authorization.py`:
- Generated two distinct simulation runs (`run1_id`, `run2_id`) for a shared scenario ID.
- Verified that `POST /api/v1/reports/generate` without `simulation_run_id` returns HTTP 409 Conflict.
- Verified that specifying `simulation_run_id: run1_id` succeeds with HTTP 200 OK and binds `run1_id` into the report record.

Execution Output:
```text
backend/tests/test_report_pdf_authorization.py::test_missing_simulation_run_rejected_with_404 PASSED
backend/tests/test_report_pdf_authorization.py::test_missing_report_pdf_download_rejected_with_404 PASSED
backend/tests/test_report_pdf_authorization.py::test_authenticated_report_and_pdf_authorization_lifecycle PASSED
backend/tests/test_report_pdf_authorization.py::test_pdf_on_the_fly_regeneration_when_file_deleted PASSED
backend/tests/test_report_pdf_authorization.py::test_public_unowned_report_and_simulation_semantics PASSED
backend/tests/test_report_pdf_authorization.py::test_scenario_ambiguity_requires_explicit_simulation_run_id PASSED
6 passed in 0.73s
```

---

## 4. Complete Authorization & Provenance Policy Matrix

| Principal | Endpoint | Resource State | Status Code | Policy Rationale |
| :--- | :--- | :--- | :---: | :--- |
| **Anonymous** | `GET /api/v1/jobs` | Private + Public jobs in DB | `200 OK` | Returns **only** public jobs (`owner_id=None`). |
| **Anonymous** | `GET /api/v1/jobs/{job_id}` | Private job (`owner_id` set) | `401 Unauthorized` | Prevents unauthenticated access to user jobs. |
| **User B (Non-owner)** | `GET /api/v1/jobs/{job_a_id}`| User A's private job | `403 Forbidden` | Enforces multi-tenant isolation. |
| **User A (Owner)** | `GET /api/v1/jobs/{job_a_id}`| User A's private job | `200 OK` | Legitimate access to own job. |
| **Admin** | `GET /api/v1/jobs` | Any jobs in DB | `200 OK` | Admin visibility across all tenants. |
| **Any User** | `GET /api/v1/jobs/{pub_id}` | Public job (`owner_id=None`) | `200 OK` | Public demonstration jobs accessible to all. |
| **Any Caller** | `POST /api/v1/reports/generate` | Multiple runs for scenario, no `run_id` | `409 Conflict` | Rejects silent substitution, enforces provenance. |
| **Any Caller** | `POST /api/v1/reports/generate` | Exact `run_id` specified | `200 OK` | Binds report to immutable simulation run. |
| **Any Caller** | `GET /api/v1/reports/{id}/pdf` | Linked run deleted from DB | `409 Conflict` | Fails closed; refuses to synthesize ungrounded PDF. |

---

## 5. Security Audit Conclusion

Both P0 security and provenance vulnerabilities have been fully eradicated. Access boundaries and scientific traceability are provably enforced across the application lifecycle.

