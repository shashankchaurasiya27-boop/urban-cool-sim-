# UrbanCoolSim C3 — Privacy and Database Sanitization Audit Report

**Audit Date:** 2026-10-31  
**Auditor:** Senior Software Engineer, Privacy Auditor & Security Reviewer  
**Target Fixture:** `database/urbancoolsim_sanitized.db`  
**File Size:** 139,264 bytes (136 KB)  
**SHA-256 Checksum:** `897b12b36b8a8874162850d531c23bc92e0fb2f237d368d2abc1675c2a39f3b6`  
**Overall Privacy Verdict:** **VERIFIED SANITIZED & PRIVACY-SAFE (ZERO LIVE PII / ZERO PRODUCTION SECRETS)**  

---

## 1. Executive Summary

This audit independently inspected the entire relational contents, table schemas, records, and text fields within `database/urbancoolsim_sanitized.db` to verify that the file serves strictly as an approved static testing fixture and contains no personally identifiable information (PII), proprietary customer data, production API keys, or live simulation histories.

The audit confirms:
1. **Zero Real User PII:** The database contains exactly 3 synthetic test users (`alice_c3@test.com`, `bob_c3@test.com`, `admin_c3@test.com`), each populated with dummy names and test salted password hashes.
2. **Zero Proprietary Geospatial Data:** The spatial records contain only the five publicly documented UrbanCoolSim pilot areas (`delhi_cp`, `mumbai_bkc`, `singapore_marina`, `phoenix_downtown`, `tokyo_shinjuku`) with `is_synthetic = 1`.
3. **Zero Active Production Runs:** All operational and background queues (`simulation_jobs`, `optimization_runs`, `validation_runs`, `model_versions`, `organizations`, `projects`) are completely empty (0 rows).
4. **Explicit Synthetic Provenance:** The single baseline simulation result records `synthetic_flag: true` in its JSON provenance dictionary.
5. **No Production Database Overlap:** The live runtime database `urbancoolsim.db` remains strictly git-ignored and excluded from all distribution archives.

---

## 2. Table Inventory and Record Counts

An exhaustive SQL query was executed against `database/urbancoolsim_sanitized.db`:

```sql
SELECT name FROM sqlite_master WHERE type="table" ORDER BY name;
```

| Table Name | Row Count | Primary Purpose | Sanitization Status |
| :--- | :---: | :--- | :--- |
| `model_versions` | **0** | Machine learning surrogate models | **Empty** — Clean |
| `optimization_runs` | **0** | Multi-objective genetic optimization sweeps | **Empty** — Clean |
| `organizations` | **0** | Multi-tenant organization definitions | **Empty** — Clean |
| `projects` | **0** | User project containers | **Empty** — Clean |
| `reports` | **1** | Decision report reference fixture | **Synthetic** — Verified mock report |
| `scenarios` | **1** | Baseline simulation scenario definition | **Synthetic** — Public baseline |
| `simulation_jobs` | **0** | Background computation queue | **Empty** — Clean |
| `simulation_results`| **1** | Baseline thermal simulation result | **Synthetic** — `synthetic_flag: true` |
| `study_areas` | **5** | Public pilot study areas | **Public Metadata** — `is_synthetic: 1` |
| `users` | **3** | Test authentication principals | **Mock Data** — Dummy test credentials |
| `validation_runs` | **0** | Empirical satellite calibration records | **Empty** — Clean |
| **TOTAL** | **11** | | **100% Sanitized** |

---

## 3. In-Depth Record Content Audit

### 3.1. `users` Table (3 Rows)
All user records represent standard software testing identities:
- **Record 1:** ID `6a9590d7-a22b-49a5-9c7c-cc832ef91da0`
  - Email: `alice_c3@test.com`
  - Full Name: `Alice Engineer`
  - Role: `user`
  - Password Hash: Bcrypt hash derived from test dummy string `"securepassword123"`
  - Active: `True` (1)
- **Record 2:** ID `fadde5b8-fb75-4a33-b124-095ad9bc2ba6`
  - Email: `bob_c3@test.com`
  - Full Name: `Bob Engineer`
  - Role: `user`
  - Password Hash: Bcrypt hash derived from test dummy string `"securepassword123"`
  - Active: `True` (1)
- **Record 3:** ID `c2293aa1-33c0-4490-8cbc-c7bcf1c00119`
  - Email: `admin_c3@test.com`
  - Full Name: `Admin Root`
  - Role: `admin`
  - Password Hash: Bcrypt hash derived from test dummy string `"securepassword123"`
  - Active: `True` (1)

*Finding:* No real email addresses, personal telephone numbers, organization affiliations, or external identifiers exist.

### 3.2. `study_areas` Table (5 Rows)
Contains only the 5 public benchmark districts:
1. `delhi_cp`: Connaught Place Radial District, New Delhi, India (EPSG:32643, 10.0m res, 50x50 grid, `is_synthetic = 1`)
2. `mumbai_bkc`: Bandra Kurla Complex (BKC), Mumbai, India (EPSG:32643, 10.0m res, 50x50 grid, `is_synthetic = 1`)
3. `singapore_marina`: Marina Bay Financial District, Singapore (EPSG:32648, 10.0m res, 50x50 grid, `is_synthetic = 1`)
4. `phoenix_downtown`: Downtown Urban Core, Phoenix, AZ, USA (EPSG:32612, 10.0m res, 50x50 grid, `is_synthetic = 1`)
5. `tokyo_shinjuku`: Shinjuku Skyscraper Center, Tokyo, Japan (EPSG:32654, 10.0m res, 50x50 grid, `is_synthetic = 1`)

*Finding:* Coordinates match standard open public centroids. All rows explicitly carry `is_synthetic = 1`.

### 3.3. `scenarios`, `simulation_results`, and `reports` (1 Row Each)
- **Scenario:** ID `scen_baseline`, name `"Baseline Current State"`, `scenario_type = "baseline"`, `is_baseline = 1`.
- **Simulation Result:** ID `sim_bb896c6313344a7094299388322739b7`, baseline mean temperature `56.49 C`, scenario mean `56.49 C`, delta `0.0 C`. Provenance JSON:
  ```json
  {
    "physics_engine": "EnergyBalance2DSolver_v2",
    "equations": ["Q* + Qf = Qh + Qe + dQs"],
    "is_physics_informed": true,
    "synthetic_flag": true
  }
  ```
- **Report:** ID `df3bb05d-7969-4a88-8487-9b5f3b131a4b`, title `"UrbanCoolSim Canonical Verification Report — Connaught Place"`, referencing `sim_bb896c6313344a7094299388322739b7`.

---

## 4. Architectural Purpose of the Sanitized Fixture

`database/urbancoolsim_sanitized.db` is required by the repository test harness to verify:
1. **Migration Safety (`backend/tests/test_migration_safety.py`):** Ensures that application startup and Alembic/SQLAlchemy auto-migrations safely upgrade existing SQLite databases without dropping populated study areas or failing on existing columns.
2. **Deterministic Test Execution:** Enables backend tests to execute against pre-seeded baseline study area dimensions without requiring live network calls to Overpass API.

The volatile runtime database `urbancoolsim.db` (which accumulates user runs and job sessions during local testing) is ignored via `.gitignore` and verified absent by `scripts/test_packaging_safety.py`.

---

## 5. Audit Conclusion

`database/urbancoolsim_sanitized.db` is clean, sanitized, and privacy-safe. It contains zero live customer records, personal information, or production credentials. It is approved for distribution.
