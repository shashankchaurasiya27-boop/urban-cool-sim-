# UrbanCoolSim: Package Contents & Directory Inventory

**Document ID**: `UCS-DOC-PACKAGE-CONTENTS-20261030`  
**Target Milestone**: Preparation for Checkpoint C3  
**Auditor / Release Engineer**: Senior Software Engineer & Supply-Chain Auditor  
**Date**: 2026-10-30  

---

## 1. Top-Level Package Organization

The release package extracts into a single root folder: `UrbanCoolSim/`. The major directory structures and their operational roles are:

```text
UrbanCoolSim/
├── backend/            # FastAPI Python backend service & physics solvers
├── frontend/           # Next.js 14 / React TypeScript web application
├── dataset/            # Ingested geospatial data, manifests & validation tools
├── scripts/            # Operational, packaging, training, and testing scripts
├── docs/               # Architecture decisions, specifications & release manuals
│   └── release/        # Package-specific documentation & reproducibility guide
├── remediation/        # Historical audit logs, decision records & roadmaps
├── artifacts/          # C2 closure reports, test matrices, patches & logs
├── storage/            # Runtime storage directory structure with .gitkeep placeholders
├── .env.example        # Environment variable template with safe defaults
├── docker-compose.yml  # Multi-container production deployment specification
└── README.md           # Project overview and quickstart instructions
```

---

## 2. Directory Roles & Module Breakdown

### A. `backend/` — Server & Simulation Engine
- **`app/api/`**: Asynchronous REST endpoints including `digital_twin_router.py` (metric rasterization), `thermal_router.py` (SEB temperature calculations), `optimization_router.py` (Pareto front generation), `reports_router.py` (PDF downloads), and `auth_router.py` (JWT auth).
- **`app/physics/energy_balance.py`**: Surface Energy Balance solver calculating net radiation, sensible heat flux, latent heat flux, and surface equilibrium temperatures.
- **`app/optimization/pareto_optimizer.py`**: NSGA-II multi-objective genetic algorithm balancing cooling degree days against economic intervention cost.
- **`app/spatial/geo_digital_twin.py`**: True 10 m projected UTM metric-grid digital twin engine with rasterization of physical OSM layers.
- **`app/ml/surrogate.py`**: Fast LightGBM surrogate model interface.
- **`storage/models/surrogate_lgbm_latest.joblib`**: Retained production inference model.
- **`tests/`**: Pytest test suite containing 83 comprehensive tests.

### B. `frontend/` — Web Application Interface
- **`src/app/`**: Next.js App Router pages:
  - `digital-twin/`: 2D/3D GIS microclimate digital twin viewer.
  - `intervention-studio/`: Interactive cooling strategy painter.
  - `optimization/`: Budget vs. cooling trade-off dashboard.
  - `thermal-analysis/`: Diurnal profile and flux breakdown.
  - `reports/`: Executive summary and automated report downloads.
- **`src/components/`**: Modular visualization components including `DigitalTwin3DMap.tsx` (Deck.gl 3D polygons), `DigitalTwinMap.tsx` (MapLibre 2D), and `ParetoFrontChart.tsx`.
- **`public/data/geo/`**: Bundled GeoJSON baseline fallback files.

### C. `dataset/` — Geospatial Data & Ingestion Tools
- **`raw/vector/osm/`**: Raw OSM feature snapshots across Delhi, Mumbai, Singapore, Phoenix, and Tokyo, with cryptographic `manifest.json`.
- **`processed/spatial_vectors/`**: Clipped study area vector layers (13,880 active OSM physical features).
- **`spatial_sources/`**: Study area boundary polygons and legacy inventories.
- **`validate_spatial_data.py`**: Verification script checking feature counts and geometric topology.

### D. `scripts/` — Tooling & Automation
- **`package_shareable_release.py`**: The authoritative release packager and integrity auditor.
- **`test_packaging_safety.py`**: Supply-chain security and hygiene verification script.
- **`train_ai_surrogate.py`**: Standalone LightGBM surrogate model trainer.
- **`verify_api_smoke.py`**: Automated HTTP smoke tester for running services.
- **`bootstrap_dev_env.py`**: Automated local development setup script.

### E. `docs/` & `remediation/` — Engineering Records & Specifications
- **`docs/release/`**: Packaging decisions, dependency inventory, package contents, and reproducibility guide.
- **`docs/verification/`**: C2 baseline specifications and spatial resolution architecture decision records.
- **`remediation/`**: Historical audit changelog, remediation roadmap, and checkpoint status tracker.

### F. `artifacts/` — Historical Verification Evidence
- **`artifacts/c2-final-closure/`**:
  - `C2_FINAL_CLOSURE_REPORT.md`: Comprehensive technical closure report.
  - `FINAL_TEST_MATRIX.json`: Machine-readable ledger of all 83 passing tests.
  - `junit_report.xml`: Authoritative JUnit test XML.
  - `SPATIAL_DATA_PROVENANCE.md`: Vector feature origin and tag mapping ledger.
  - `diff/C2_FINAL_CLOSURE.patch`: Unified diff of all C2 remediation source changes.
- **`artifacts/c2-release-audit-staging/`**:
  - `C2_FINAL_RELEASE_INTEGRITY_AUDIT.md`: Senior release engineer audit findings.
  - `C2_FINAL_RELEASE_EVIDENCE.json`: Formal release identity JSON record.
  - `C2_FINAL_SHA256SUMS.txt`: Detached Level 2 checksum manifest.
  - `C2_RELEASE_HANDOFF.md`: Independent replication instructions.

