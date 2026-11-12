import os
import tempfile
import pytest
from sqlalchemy import create_engine, inspect, text
from app.database import Base
from app.main import run_auto_migrations
import app.models.db_models as db_models

def test_fresh_database_creation_has_all_columns():
    """
    Verifies that a brand new database initialized via Base.metadata.create_all
    contains all expected tables and newly added columns without requiring manual migrations.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        engine = create_engine(f"sqlite:///{tmp_path}")
        Base.metadata.create_all(bind=engine)
        
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        
        assert "simulation_results" in tables
        assert "reports" in tables
        
        sim_cols = {c["name"] for c in inspector.get_columns("simulation_results")}
        assert "id" in sim_cols
        assert "owner_id" in sim_cols
        assert "job_id" in sim_cols
        assert "scenario_id" in sim_cols
        assert "baseline_t_mean" in sim_cols
        assert "scenario_t_mean" in sim_cols
        assert "delta_t_mean" in sim_cols
        
        rep_cols = {c["name"] for c in inspector.get_columns("reports")}
        assert "id" in rep_cols
        assert "simulation_run_id" in rep_cols
        assert "owner_id" in rep_cols
        assert "markdown_content" in rep_cols
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_auto_migration_on_legacy_database():
    """
    Verifies that run_auto_migrations dynamically detects and adds missing columns
    (such as simulation_run_id and owner_id) to an older database schema without data loss.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        engine = create_engine(f"sqlite:///{tmp_path}")
        
        # Create legacy schema missing owner_id in simulation_results and simulation_run_id in reports
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE simulation_results (
                    id VARCHAR PRIMARY KEY,
                    scenario_id VARCHAR NOT NULL,
                    baseline_t_mean FLOAT NOT NULL,
                    scenario_t_mean FLOAT NOT NULL,
                    delta_t_mean FLOAT NOT NULL,
                    peak_t FLOAT NOT NULL
                )
            """))
            conn.execute(text("""
                INSERT INTO simulation_results (id, scenario_id, baseline_t_mean, scenario_t_mean, delta_t_mean, peak_t)
                VALUES ('sim_legacy_001', 'scen_test', 35.0, 32.0, 3.0, 38.0)
            """))
            conn.execute(text("""
                CREATE TABLE reports (
                    id VARCHAR PRIMARY KEY,
                    title VARCHAR NOT NULL,
                    markdown_content TEXT NOT NULL
                )
            """))
            conn.execute(text("""
                INSERT INTO reports (id, title, markdown_content)
                VALUES ('rep_legacy_001', 'Legacy Report', 'Pre-existing content')
            """))

        # Run auto-migrations
        run_auto_migrations(engine)

        inspector = inspect(engine)
        sim_cols = {c["name"] for c in inspector.get_columns("simulation_results")}
        rep_cols = {c["name"] for c in inspector.get_columns("reports")}

        assert "owner_id" in sim_cols
        assert "simulation_run_id" in rep_cols

        # Verify pre-existing data is preserved intact
        with engine.connect() as conn:
            res = conn.execute(text("SELECT id, baseline_t_mean, owner_id FROM simulation_results WHERE id='sim_legacy_001'")).fetchone()
            assert res is not None
            assert res[0] == "sim_legacy_001"
            assert res[1] == 35.0
            assert res[2] is None  # Newly added nullable column is None for legacy record

            rep = conn.execute(text("SELECT id, title, simulation_run_id FROM reports WHERE id='rep_legacy_001'")).fetchone()
            assert rep is not None
            assert rep[0] == "rep_legacy_001"
            assert rep[1] == "Legacy Report"
            assert rep[2] is None

        # Verify idempotency by running a second time
        run_auto_migrations(engine)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_auto_migration_failure_raises_runtime_error(monkeypatch):
    """
    Regression test for P0 blocker:
    Verifies that run_auto_migrations does NOT swallow database migration errors,
    but instead propagates them as a RuntimeError to prevent corrupted startup.
    """
    from unittest.mock import MagicMock
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_engine.begin.return_value.__enter__.return_value = mock_conn
    # Mock inspect to report existing table
    from unittest.mock import patch
    with patch("sqlalchemy.inspect") as mock_inspect:
        mock_inspector = MagicMock()
        mock_inspector.get_table_names.return_value = ["reports"]
        mock_inspector.get_columns.return_value = []  # All columns missing
        mock_inspect.return_value = mock_inspector
        mock_conn.execute.side_effect = Exception("ALTER TABLE denied by DBA policy")

        with pytest.raises(RuntimeError) as exc_info:
            run_auto_migrations(mock_engine)
        assert "Database auto-migration failed" in str(exc_info.value)


@pytest.mark.asyncio
async def test_lifespan_startup_fails_closed_when_exhausted(monkeypatch):
    """
    Regression test for P0 blocker:
    Verifies that the FastAPI lifespan context manager raises RuntimeError and
    fails startup fail-closed if migration or database initialization cannot succeed.
    """
    from fastapi import FastAPI
    from app.main import lifespan

    # Mock run_auto_migrations to always fail
    def failing_migration(eng):
        raise RuntimeError("Simulated auto-migration persistent failure")

    monkeypatch.setattr("app.main.run_auto_migrations", failing_migration)
    monkeypatch.setattr("time.sleep", lambda s: None)  # speed up retries

    test_app = FastAPI()
    with pytest.raises(RuntimeError) as exc_info:
        async with lifespan(test_app):
            pass  # Should never reach inside the context

    assert "Fatal: Database initialization and auto-migration failed after" in str(exc_info.value)


