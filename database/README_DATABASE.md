# UrbanCoolSim Database Architecture & Snapshot Guide

## 1. Overview
UrbanCoolSim supports dual database configurations:
- **SQLite (Default for Local Development / Testing)**: Zero-configuration file database accessed via SQLAlchemy (`sqlite:///urbancoolsim.db`).
- **PostgreSQL (Production / Staging)**: Multi-user relational database with asyncpg (`postgresql+asyncpg://...`).

## 2. Included Sanitized Snapshot
- **File**: `urbancoolsim_sanitized.db`
- **Size**: 106,496 bytes (104.0 KB)
- **SHA-256**: `897b12b36b8a8874162850d531c23bc92e0fb2f237d368d2abc1675c2a39f3b6`
- **Integrity Status**: `PRAGMA integrity_check` verified: **OK**

### Contained Records:
1. **Study Areas**: 5 canonical regions (`delhi_cp`, `mumbai_bkc`, `singapore_marina`, `phoenix_downtown`, `tokyo_shinjuku`).
2. **Scenarios**: `scen_baseline` (Connaught Place 10m baseline grid).
3. **Users (Sanitized Test Principals)**:
   - Alice Engineer: `alice_c3@test.com` (role: `user`, password: `securepassword123`)
   - Bob Engineer: `bob_c3@test.com` (role: `user`, password: `securepassword123`)
   - Admin Root: `admin_c3@test.com` (role: `admin`, password: `securepassword123`)
4. **Authoritative Simulation Run**:
   - `id`: `sim_bb896c6313344a7094299388322739b7`
   - `owner_id`: Alice Engineer's ID
   - `baseline_t_mean`: 56.49 °C
   - `scenario_t_mean`: 56.49 °C
   - `delta_t_mean`: 0.0 °C
5. **Authoritative Report**:
   - `id`: `df3bb05d-7969-4a88-8487-9b5f3b131a4b`
   - `simulation_run_id`: `sim_bb896c6313344a7094299388322739b7`
   - `owner_id`: Alice Engineer's ID

## 3. Fresh Initialization & Auto-Migration
To create a fresh database from scratch rather than using this snapshot:
1. Point `DATABASE_URL=sqlite:///./urbancoolsim.db` in your `.env`.
2. Start the backend: `uvicorn app.main:app`.
3. The lifespan startup routine automatically calls `Base.metadata.create_all()` and `run_auto_migrations(engine)`, creating all tables and columns and seeding default study areas idempotently.
