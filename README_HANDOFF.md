# UrbanCoolSim — C3 Developer Handoff Package

**Package Release**: `UrbanCoolSim_C3_Developer_Handoff_2026-10-31`  
**Purpose**: Complete, compact, independently reproducible developer handoff archive for UrbanCoolSim C3 Phase 1.

---

## 1. Project Overview

UrbanCoolSim is an urban microclimate digital twin and climate resilience planning platform. It integrates:

- 2D Surface Energy Balance (SEB) physics simulation solver.

- Fast machine learning surrogate models (LightGBM) for real-time thermal predictions.
- NSGA-II multi-objective genetic algorithm for Pareto-optimal urban cooling interventions (green roofs, cool roofs, tree canopy).
- Interactive 3D/2D digital twin visualization built with Next.js 14, React 18, and MapLibre/Deck.gl.

---

## 2. Directory Structure of this Handoff

```text
UrbanCoolSim_C3_Developer_Handoff/
├── README_HANDOFF.md               # Main onboarding and handoff specification
├── REPRODUCE_URBANCOOLSIM.md       # Exact step-by-step reproduction instructions
├── PACKAGE_INVENTORY.csv           # Complete inventory of all files with sha256 & policy
├── MANIFEST.sha256                 # SHA-256 checksum manifest of all included files
├── SOURCE_STATE.md                 # Source revision, changes, and commit context
├── HANDOFF_VERSION.txt             # Version and release metadata
├── PROJECT_STRUCTURE.txt           # Directory structure listing
├── .gitignore                      # Git ignore rules
├── .env.example                    # Backend environment configuration template
├── docker-compose.yml              # Production multi-container orchestration
├── docker-compose.dev.yml          # Development container orchestration
├── backend/                        # FastAPI application, models, schemas, and tests
│   ├── app/                        # Modular application source
│   ├── tests/                      # Full 104-test automated backend test suite
│   ├── storage/models/             # Active production ML surrogate model (latest)
│   └── requirements.txt            # Python dependency declarations
├── frontend/                       # Next.js 14 / TypeScript web application
│   ├── src/                        # React components, pages, and API clients
│   ├── tests/                      # Frontend API & spatial GeoJSON export tests (25 tests)
│   ├── package.json                # Node dependency declarations
│   └── package-lock.json           # Deterministic lockfile
├── dataset/                        # Study area spatial assets and vector processors
│   └── processed/spatial_vectors/  # 5 clipped study area GeoJSONs (10m grid digital twin)
├── scripts/                        # Project utilities and test harnesses
│   └── verify_c3_pipeline.py       # Authoritative C3 8-stage verification script
├── docs/                           # Architecture, contracts, decisions, and setup
│   ├── architecture/               # C3 current state audit & sequence diagrams
│   ├── api-contracts/              # C3 authoritative simulation result contracts
│   └── decisions/                  # C3 architecture decision records
├── evidence/                       # Verification evidence and test logs
│   ├── c2/                         # C2 final closure reports, test matrices, and logs
│   ├── c3/                         # C3 closure report, reproducer logs, and Gate 0 audit
│   ├── test-results/               # Fresh backend pytest & frontend build execution logs
│   ├── migration/                  # Database migration safety verification logs
│   └── security/                   # Security and secret scan report
├── database/                       # Database documentation & sanitized SQLite snapshot
│   ├── README_DATABASE.md          # Database setup and schema documentation
│   └── urbancoolsim_sanitized.db   # Verified, clean SQLite snapshot with 0 secrets
├── config/                         # Environment templates and Docker configurations
└── packaging/                      # Inclusion/exclusion policies and verification steps
```

---

## 3. C3 Architectural Achievements

1. **Persistent Simulation Results**: `POST /api/v1/thermal/simulate` returns a persistent `run_id`, status `"completed"`, and stores referential records in SQLite.
2. **128-Bit Collision-Resistant Identifiers**: Replaced 8-hex character prefixes with full 32-hex character UUID4 strings (`sim_` + 32 hex = 36 total).
3. **Retrieval & Listing Endpoints**: `GET /api/v1/thermal/runs/{run_id}` and `GET /api/v1/thermal/runs`.
4. **Ownership & Access Control**: Multi-tenant isolation ensuring non-admin users cannot access private runs or reports of other users.
5. **Exact-Run Report Linkage**: `POST /api/v1/reports/generate` binds directly to `simulation_run_id`.
6. **Zero-Downtime Safe Auto-Migrations**: Dynamic schema inspection automatically executes `ALTER TABLE` for missing columns on startup.

---

## 4. Verification Commands & Verified Evidence

- Backend Test Suite: `PYTHONPATH=backend pytest backend/tests/ -v` (**104 / 104 passed**)
- Standalone Lifecycle Reproducer: `PYTHONPATH=backend python3 scripts/verify_c3_pipeline.py` (**All 8 steps passed**)
- Frontend Integration Tests: `cd frontend && npm test` (**25 / 25 passed**)
- TypeScript Check: `cd frontend && npx tsc --noEmit` (**0 errors**)
- Frontend Production Build: `cd frontend && npm run build` (**15 / 15 routes compiled**)
