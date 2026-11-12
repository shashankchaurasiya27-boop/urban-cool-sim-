# UrbanCoolSim: Packaging and Data Safety Specification

**Document ID**: `UCS-SPEC-20261026-PACKAGING-SAFETY`  
**Status**: APPROVED & ENFORCED  
**Date**: 2026-10-26  
**Scope**: Checkpoint C2 Closure — Distribution Hygiene, Data Safety & Secrets Scrubbing  

---

## 1. Overview and Rationale

Distribution packages for UrbanCoolSim must be clean, safe, reproducible, and free of operational artifacts. During earlier development iterations, distribution archives inadvertently contained:
1. `urbancoolsim.db` — A local SQLite database populated during testing with active user credentials, scenario runs, and session tokens.
2. `Spatial_Data_Acquisition_Toolkit.` — A duplicate directory resulting from a trailing-dot error during unpacking.
3. `.env` files — Uncommitted local environment configuration files.

This specification mandates automated guardrails, exclusion lists, and verification procedures to ensure that every distributed archive is sanitized, reproducible, and verifiable.

---

## 2. Forbidden Artifacts Policy

Any distribution bundle or shared repository archive must strictly exclude the following categories:

| Category | Forbidden Patterns | Rationale | Enforcement Mechanism |
| :--- | :--- | :--- | :--- |
| **Live Databases** | `*.db`, `*.sqlite`, `*.sqlite3`, `urbancoolsim.db` | Contains persistent runtime state, user passwords, session hashes, and scenario run histories. | `.gitignore` + `scripts/package_c2_distribution.py` + `scripts/test_packaging_safety.py` |
| **Secrets & Config** | `.env`, `.env.local`, `.env.*` (except `.env.example`) | May contain unmasked API tokens, database connection strings, or production secrets. | `.gitignore` + Automated regex scanner in packaging test |
| **Trailing-Dot Folders** | `*Toolkit.*`, `Spatial_Data_Acquisition_Toolkit.`, `*./` | Corrupted filesystem artifact causing path resolution bugs on Windows and macOS filesystems. | Removed from tree + Tested by `test_packaging_safety.py` |
| **Virtual Environments** | `.venv*`, `venv/`, `env/`, `node_modules/` | Non-portable, platform-specific binaries and dependencies that must be recreated via package managers. | Excluded by packaging script |
| **Build Caches** | `.next/`, `__pycache__/`, `*.tsbuildinfo`, `.pytest_cache/` | Ephemeral build artifacts that inflate package size and cause build staleness. | Excluded by packaging script |

---

## 3. Safe Packaging Pipeline

The packaging workflow is automated by `scripts/package_c2_distribution.py` and validated by `scripts/test_packaging_safety.py`.

### Bundles Produced:
1. **`UrbanCoolSim_C2_Verified_Project.zip`**:
   - Complete, reproducible project source (`backend/`, `frontend/`, `dataset/`, `docs/`, `scripts/`, `tests/`, `docker-compose.yml`, `requirements.txt`).
   - Clean of all caches, databases, node_modules, and virtual environments.
   - Total compressed size: ~5.0 MB (well below the 25 MB distribution threshold).
2. **`UrbanCoolSim_C2_Verification_Handoff.zip`**:
   - Independent verification bundle for review (`artifacts/c2-final-closure/` reports, test matrix JSON, changelog, and diff patch).
   - Total compressed size: ~200 KB.

---

## 4. Automated Verification Test

The automated safety test `scripts/test_packaging_safety.py` executes before package finalization and asserts:
- Zero matches against `FORBIDDEN_FILE_PATTERNS`.
- Zero matches against `FORBIDDEN_DIR_PATTERNS`.
- Text files contain no unmasked `SECRET_KEY = "..."` assignments.
- Zip package uncompressed content matches expected clean project layout.

This test is integrated into the final verification sequence.
