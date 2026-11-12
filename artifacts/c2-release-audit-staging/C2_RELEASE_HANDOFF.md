# UrbanCoolSim: Checkpoint C2 Formal Release Handoff & Replication Guide

**Document ID**: `UCS-HANDOFF-20261027-C2-FINAL`  
**Date**: 2026-10-27T01:00:00+05:30  
**Release Engineer & Auditor**: Senior Release Engineer, QA Auditor & Supply-Chain Integrity Specialist  
**Release Checkpoint**: C2 (10 m Spatial Metric Grid Contract & Spatial Data Remediation)  
**Status**: **PASS / READY TO CLOSE**  

---

## 1. Executive Summary & Verification Context

This release handoff package establishes the formal software supply-chain closure for **UrbanCoolSim Checkpoint C2**. 

All deliverables have undergone dual-run test execution (supplied run at 00:38:44+05:30 and independent auditor rerun at 00:58:51+05:30), deterministic source tree snapshot fingerprinting, packaging hygiene verification, and detached SHA-256 cryptographic verification.

The repository source state, test results, sanitized distribution packages, and verification handoffs correspond to **one unified, reproducible release state**.

---

## 2. Source Identity & Reproducibility Baseline

Because this release distribution resides in a standalone verified directory extracted from the project workspace, Git metadata is maintained at the parent level (`e25cca137`). To ensure absolute integrity without inventing or fabricating synthetic Git commit hashes, the exact source state is fingerprinted deterministically:

- **Source Snapshot SHA-256**: `5f94dbd865f33341918bca7c943a14e0a1cd57c0eef39979d8ac7595685b4613`
- **Total Tracked Files Fingerprinted**: 190 canonical source files
- **Included Scope**: All active code in `backend/`, `frontend/src/`, `frontend/public/`, `dataset/` ingestion and processing utilities, `scripts/`, `docs/`, and project configuration files (`package.json`, `tsconfig.json`, `pytest.ini`, etc.).
- **Excluded Non-Determinism**: Virtual environments (`.venv*`), dependency directories (`node_modules`), build output directories (`.next`, `dist`, `build`), bytecode caches (`__pycache__`, `.pytest_cache`), local logs, temporary files, and release artifacts.

---

## 3. Verified Final Release Artifacts & Cryptographic Signatures

The following table lists every finalized C2 candidate deliverable located in `artifacts/c2-release-audit-staging/` and signed by the detached manifest `C2_FINAL_SHA256SUMS.txt`:

| Relative Filename | Size (Bytes) | SHA-256 Digest | Artifact Role & Description |
| :--- | :--- | :--- | :--- |
| `UrbanCoolSim_C2_Verified_Project.zip` | 6,378,445 | `530f0b279e400493218d00eeae767d75bff3a73029449197cf022fda87ec726d` | Clean verified release repository archive (250 entries, single root prefix `UrbanCoolSim/`). |
| `UrbanCoolSim_C2_Verification_Handoff.zip` | 167,462 | `2ab33675eaba3d00f13132bcacaac83f67fc038e7e776437a6db9b481da74df2` | Verification handoff bundle containing Level 1 evidence manifest and 9 validation documents. |
| `UrbanCoolSim_Shareable.zip` | 13,062,875 | `e1941793281beb0df186fe0e056cdc232109d28123e5cbbedf1cc051faa568ae` | Turnkey root distribution archive containing full source code and pre-bundled audit evidence. |
| `UrbanCoolSim_C2_Optimizer_Feasibility_Fix.patch` | 8,965 | `dd9c43fa239eebf858d46bc161c23ad5828425916efae8fd6c24af4b1f96c335` | Standalone unified patch for the NSGA-II optimizer feasibility constraint decoupling. |
| `junit_report.xml` | 11,494 | `4896da2bcc4bacd18ac5674f434c006f392bf14d185f53fb9916fb45ba83e683` | Independent auditor rerun JUnit XML test report (83 passed, 0 failures, 0 skipped). |
| `logs/pytest_audit_run.log` | 14,403 | `308ea4cb251e19da6e137539f86d25ce555413217a8f457d035c6d1bbc6f5605` | Verbose execution log from the independent auditor test rerun in staging. |
| `C2_FINAL_CLOSURE_REPORT.md` | 9,851 | `3a3e6595faec59e9547b843021b4c550c4e3546afb28ea14448fe9bd23d1073d` | Executive C2 closure report detailing the spatial-contract and optimizer remediation. |
| `FINAL_VERIFICATION_SUMMARY.md` | 7,111 | `38be0f8ca3ddc248082b3a2cd88480adb9fb59141d43e960f2b7261895581e0f` | Verification summary tracing the test suite progression from 43 to 83 passed tests. |
| `FINAL_TEST_MATRIX.json` | 36,279 | `2fd7d97d558b252eb2ab375f4be8246ed5d4ecb474e81eedf0edbe9bb45fb02b` | Machine-readable verification matrix documenting all 83 executed tests and coverage areas. |
| `SPATIAL_DATA_PROVENANCE.md` | 7,522 | `6bcd1431e1726e9eea44580361b8b132569d2ea220f67bce1ec2124f5dd496a8` | Provenance ledger tracking the 13,880 OSM features ingested across 5 international cities. |
| `diff/C2_FINAL_CLOSURE.patch` | 552,715 | `457789eca01bf56202d1545a21079b56695ff4b1ad89d4ff855bc2d6ffe13aa2` | Full code diff capturing all changes made throughout the C2 remediation phase. |

---

## 4. Test Evidence & Execution Reconciliation

Dual independent test executions confirm the complete pass rate of the 83-test C2 test suite:

- **Supplied Execution (Run 1)**:
  - Timestamp: `2026-10-27T00:38:44.461290+05:30`
  - Result: **83 passed / 0 failed / 0 skipped** (19.327 s)
  - Report: `artifacts/c2-final-closure/junit_report.xml`
- **Auditor Independent Rerun (Run 2)**:
  - Timestamp: `2026-10-27T00:58:51.767864+05:30`
  - Result: **83 passed / 0 failed / 0 skipped** (19.948 s)
  - Exit Code: `0`
  - Report: `artifacts/c2-release-audit-staging/junit_report.xml`
  - Execution Log: `artifacts/c2-release-audit-staging/logs/pytest_audit_run.log`

### Test Suite Distribution (83 Tests)
1. `backend/tests/test_c2_grid_contract.py` (**49 tests**):
   - 4-corner UTM metric grid coordinate rasterization ($10.0 \pm 0.033\text{ m}$ spacing).
   - Analysis window bounds and total area verification across Ahmedabad, Hyderabad, London, Phoenix, and Singapore.
   - API HTTP 422 parameter conflict validation (`grid_resolution_m` vs `grid_dimension`).
   - Feasibility constraint enforcement and spatial metadata truthfulness.
2. `backend/tests/test_remediation.py` (**17 tests**):
   - Zero synthetic default leakage (removal of 250,000 m² hardcoded constants).
   - Physics validation error threshold $\le 0.5^\circ\text{C}$ on empirical benchmarks.
   - Authentication role escalation protections and secret key enforcement.
3. `backend/tests/test_backend.py` (**11 tests**):
   - Diurnal climate profiles, surface energy balance solver, and NSGA-II optimization engine.
4. `backend/tests/test_grid_integrity.py` (**5 tests**):
   - Brutsaert atmospheric emissivity, non-clipped temperature distribution, and metadata parity.
5. `backend/tests/test_validation_evaluator_unit.py` (**1 test**):
   - Empirical validation evaluator unit truth and statistical benchmarking.

---

## 5. Two-Level Manifest Architecture

To avoid the mathematical circular dependency of an archive containing a manifest that records its own hash:

```
+---------------------------------------------------------------------------------------------------------+
|                                    TWO-LEVEL MANIFEST ARCHITECTURE                                      |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|   Level 1: Internal Handoff Manifest                                                                    |
|   Location: UrbanCoolSim_C2_Verification_Handoff.zip -> SHA256_MANIFEST.txt                             |
|   Scope: Signs the 9 internal documentation and evidence files bundled inside the handoff ZIP.          |
|                                                                                                         |
|   Level 2: Detached Release Manifest                                                                    |
|   Location: artifacts/c2-release-audit-staging/C2_FINAL_SHA256SUMS.txt                                   |
|   Scope: Signs external binaries and packages:                                                          |
|          - UrbanCoolSim_C2_Verified_Project.zip                                                         |
|          - UrbanCoolSim_C2_Verification_Handoff.zip                                                     |
|          - UrbanCoolSim_Shareable.zip                                                                   |
|          - Standalone patch, auditor test XML, logs, and acceptance reports                             |
|                                                                                                         |
+---------------------------------------------------------------------------------------------------------+
```

---

## 6. Independent Replication & Verification Instructions

Any release engineer, auditor, or evaluator can reproduce this verification using standard POSIX shell utilities:

### Step 1: Verify Detached SHA-256 Manifest
Run from within `artifacts/c2-release-audit-staging/`:
```bash
cd artifacts/c2-release-audit-staging
# On macOS / Linux:
python3 -c "
import hashlib

with open('C2_FINAL_SHA256SUMS.txt', 'r') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split()
        expected_hash = parts[0]
        filename = parts[1]
        try:
            with open(filename, 'rb') as target:
                actual_hash = hashlib.sha256(target.read()).hexdigest()
            assert actual_hash == expected_hash, f'MISMATCH on {filename}: expected {expected_hash}, got {actual_hash}'
            print(f'[PASS] {filename} matches expected SHA-256.')
        except FileNotFoundError:
            print(f'[FAIL] File not found: {filename}')
"
```
*Expected Result*: All 11 files pass validation with 0 mismatches.

### Step 2: Validate Packaging Safety & Artifact Hygiene
Run from the repository root:
```bash
python3 scripts/test_packaging_safety.py
```
*Expected Result*:
```
[PASS] Project archive contains 0 forbidden file extensions
[PASS] Project archive contains 0 forbidden secret/db files
[PASS] Project archive root layout conforms to UrbanCoolSim/
[PASS] Packaging safety audit passed cleanly.
```

### Step 3: Reproduce the Backend Test Suite Execution
From the repository root, execute pytest using the project's backend virtual environment:
```bash
PYTHONPATH=backend ./.venv-backend/bin/pytest backend/tests/ -v --junitxml=/tmp/c2_repro_junit.xml
```
*Expected Result*:
- 83 tests executed
- 83 passed, 0 failures, 0 errors, 0 skipped
- Execution time approximately 18–21 seconds
- Exit code: 0

### Step 4: Verify Frontend Build & Health
From the repository root:
```bash
cd frontend
npm run build
```
*Expected Result*: Next.js build succeeds with 0 compile errors.

---

## 7. Artifact Hygiene & Supply-Chain Integrity Guarantees

Every candidate archive was audited against supply-chain compromise vectors:
1. **Secrets & Environment Variables**: No unencrypted `.env`, `.env.local`, or API secrets are present in any ZIP package. The repository and archives provide only `.env.example` with safe placeholder strings.
2. **Databases & State Leaks**: No local SQLite database files (`urbancoolsim.db`, `*.sqlite`, `*.db`) or persisted run histories are bundled.
3. **Reproducible Toolchains**: No transient virtual environments (`.venv*`) or JavaScript dependencies (`node_modules`) are included. All dependencies are cleanly specified in `requirements.txt` and `package.json`.
4. **Filesystem Hygiene**: Zero hidden OS metadata files (`.DS_Store`, `Thumbs.db`) or trailing-dot folders (`.../`).

---

## 8. Known Limitations & Disclosures

1. **Git Commit Hash**: Because this workspace is distributed as a standalone extracted project tree, Git commit history is held at the parent folder (`e25cca137`). To avoid fabricating commits, the source identity is anchored cryptographically via the canonical source snapshot SHA-256 fingerprint (`5f94dbd865f33341918bca7c943a14e0a1cd57c0eef39979d8ac7595685b4613`).
2. **Local Port Allocation**: If running the Next.js development server locally when port 3000 is occupied by an external service, start the frontend on port 3001 using `npm run dev -- -p 3001`. The frontend cleanly proxies API traffic to FastAPI on port 8000.

---

## 9. Gate Acceptance Recommendation

All six release acceptance gates:
- **Gate A**: Test Evidence (**PASS**)
- **Gate B**: Source / Archive Identity (**PASS**)
- **Gate C**: Artifact Hygiene (**PASS**)
- **Gate D**: Manifest Integrity (**PASS**)
- **Gate E**: Handoff Reproducibility (**PASS**)
- **Gate F**: C2 Technical Acceptance (**PASS**)

have been independently audited, reconciled, and verified.

**Formal Determination**: **PASS — C2 READY TO CLOSE**.  
Milestone C2 is certified closed. Checkpoint C3 development may formally proceed.
