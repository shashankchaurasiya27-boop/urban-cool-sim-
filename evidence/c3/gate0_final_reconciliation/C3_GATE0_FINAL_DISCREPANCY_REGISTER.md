# UrbanCoolSim: C3 Phase 0 — Final Discrepancy Register & Reconciliation Ledger

**Document ID**: `UCS-REG-DISCREPANCIES-FINAL-20261030`  
**Target Milestone**: Checkpoint C3 Phase 0 (Baseline Freeze & Gate 0 Sign-Off)  
**Status**: FORMALLY RECONCILED  
**Date**: 2026-10-30T23:20:00+05:30  
**Auditor**: Independent Release Engineer & Verification Auditor  

---

## 1. Executive Summary

This register provides the authoritative dispositions for the six packaging, evidence, and configuration discrepancies identified during Checkpoint C3 Phase 0 entry analysis.

Every discrepancy has been investigated through read-only inspection, file-level comparison, and cryptographic recalculation. Historical records are preserved unchanged; all corrections, nuances, and accepted limitations are formally recorded below.

---

## 2. Discrepancy Register

### Discrepancy 1: Parent Git Commit Reporting and `git_dirty: false` in Release Manifest
- **Original Claim**: Release manifest recorded `"git_commit": "e25cca1375... (parent repository commit; workspace directory is untracked)"` and `"git_dirty": false`.
- **Verifiable Evidence**:
  - `git rev-parse --show-toplevel` returns `/Users/shashankchaurasia/Downloads`.
  - `git status --porcelain -uall` from parent repo marks `UrbanCoolSim-main 2/` as an untracked directory (`??`).
  - No `.git/` directory exists inside `UrbanCoolSim-main 2/`.
- **Current Finding**: While the parent Git repository's tracked files were clean, asserting `git_dirty: false` creates an impression that Git was tracking the project tree.
- **Severity**: **Low / Process-Level**.
- **Final Disposition**: **ACCEPTED WITH DOCUMENTED LIMITATION**.
- **Reconciliation & Corrective Action**:
  - The project is officially documented as an unversioned distribution tree.
  - Source identity is anchored deterministically by its canonical snapshot manifest (`C3_GATE0_FINAL_SOURCE_MANIFEST.sha256`) rather than a Git commit hash.
  - For C3 development, the team should either initialize a local Git repository (`git init`) or maintain strict snapshot manifests.

---

### Discrepancy 2: Discrepancy in Model Checkpoint Counts (44 vs. 46)
- **Original Claim**: Packaging documentation and reports stated that 44 checkpoint models were excluded.
- **Verifiable Evidence**:
  - On Oct 26 (C2 closure): 43 checkpoints + 1 latest model = 44 total `.joblib` files.
  - On Oct 29 at 06:36: Manual training created `surrogate_lgbm_20261029_063632.joblib` (total 45).
  - On Oct 30 at 18:53: Executing `pytest backend/tests/test_backend.py::test_surrogate_model_training_and_prediction` executed `SurrogateModelPipeline.train_and_evaluate()`, creating `surrogate_lgbm_20261030_132318.joblib` and `surrogate_lgbm_20261030_132334.joblib`.
  - Total checkpoints on disk became 46 (+ 1 active model = 47 total).
  - Later during Gate 0 testing at 23:09, two additional checkpoints were generated (`surrogate_lgbm_20261030_173917.joblib` and `surrogate_lgbm_20261030_173938.joblib`), bringing checkpoints to 48.
- **Current Finding**: Model checkpoint count grows dynamically whenever `test_backend.py` is executed, because the test invokes production training without mocking the output directory.
- **Severity**: **Low / Documentation & Test Design**.
- **Final Disposition**: **RESOLVED & BOUNDED**.
- **Reconciliation & Corrective Action**:
  - Packaging scripts filter out all timestamped models via pattern matching (`filename != 'surrogate_lgbm_latest.joblib'`).
  - Required C3 follow-up: Introduce a mock temporary directory fixture in `conftest.py` so unit tests do not mutate production model storage.

---

### Discrepancy 3: Active Surrogate Model Hash and Size Variance
- **Original Claim**: An early text draft of `PACKAGING_DECISIONS.md` cited `surrogate_lgbm_latest.joblib` as 278,505 bytes (`110350abe3e3...`).
- **Verifiable Evidence**:
  - The 278 KB file was from an ad-hoc training run on Oct 29.
  - Running `test_surrogate_model_training_and_prediction` with standard test parameters (800 samples, seed 42) overwrote `surrogate_lgbm_latest.joblib` with the deterministic 181,226 byte model (`be41a11ee8b00c9395d53b167a33975a052a3844f3194dcf571b0515bad958c1`).
  - The final packaged archive `UrbanCoolSim_C3_Preparation_Source.zip`, its machine-readable manifest, and disk all contain the exact 181,226 byte model (`be41a11ee8b0...`).
- **Current Finding**: The release package and its companion manifest were completely consistent; only the preliminary text draft contained the pre-test snapshot hash.
- **Severity**: **Low / Documentation Only**.
- **Final Disposition**: **RESOLVED**.
- **Reconciliation & Corrective Action**: Preliminary documentation was aligned with the final release manifest.

---

### Discrepancy 4: Packaging Script Does Not Directly Invoke Pytest
- **Original Claim**: Packaging report listed `[x] All 83 backend pytest tests confirmed passing on source tree`.
- **Verifiable Evidence**:
  - Inspecting `scripts/package_shareable_release.py` reveals no call to `pytest`.
  - The tests were executed manually in an external terminal prior to packaging.
- **Current Finding**: While tests were genuinely passing (confirmed by independent logs and fresh reruns), the packaging script itself did not automate test execution.
- **Severity**: **Medium / Automation & Audit Clarity**.
- **Final Disposition**: **ACCEPTED WITH PROCESS CLARIFICATION**.
- **Reconciliation & Corrective Action**:
  - Audit records now strictly distinguish between test suite execution logs (captured in `logs/pytest_gate0_run.log`) and packaging actions.

---

### Discrepancy 5: Secret Scanning Scope and Methodological Limitations
- **Original Claim**: Packaging safety was verified via regex scans and filename exclusion.
- **Verifiable Evidence**:
  - `package_shareable_release.py` uses filename regexes (`^.*\.env$`, `^.*\.env\.local$`) to exclude secret files.
  - An independent recursive content regex scan was executed across all text and code files outside dependencies. It detected zero production secrets, private keys, or credentials (only 1 unit test dummy fixture in `test_remediation.py`).
- **Current Finding**: While no credentials were leaked, filename filtering alone does not scan file contents during packaging.
- **Severity**: **Low / Methodological Limitation**.
- **Final Disposition**: **RESOLVED WITH DOCUMENTED SCAN SCOPE**.
- **Reconciliation & Corrective Action**:
  - Documented that content-level regex scanning was executed externally.
  - Acknowledged standard audit limitation: regex pattern scanning cannot guarantee the absence of arbitrary high-entropy strings or obfuscated custom payloads.

---

### Discrepancy 6: Packaging Safety Test Behavior with `--allow-missing`
- **Original Claim**: `scripts/test_packaging_safety.py` passed.
- **Verifiable Evidence**:
  - `test_packaging_safety.py` contains hardcoded requirements for two nested C2 archives: `UrbanCoolSim_C2_Verified_Project.zip` and `UrbanCoolSim_C2_Verification_Handoff.zip`.
  - When executed without flags, it fails if those nested archives are absent from `artifacts/c2-final-closure/`.
  - When executed with `--allow-missing`, it skips the check for nested archives and verifies tree hygiene (0 databases, 0 raw env files, 0 trailing dots).
- **Current Finding**: In C3 preparation, nested full project archives were intentionally excluded to prevent recursive archive bloat. Thus, running with `--allow-missing` is necessary and expected, but it does NOT provide the exact same assertion as a strict C2 run.
- **Severity**: **Medium / Test Configuration**.
- **Final Disposition**: **RESOLVED & DOCUMENTED**.
- **Reconciliation & Corrective Action**:
  - Formally documented that `--allow-missing` is required when auditing clean source packages where legacy C2 nested archives are distributed separately.

