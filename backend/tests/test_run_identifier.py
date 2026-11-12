import uuid
import pytest
from sqlalchemy.exc import IntegrityError
from app.database import SessionLocal
from app.models.db_models import SimulationResult

def test_run_identifier_collision_resistance_10k():
    """
    P1 requirement:
    Verify that generating 10,000 simulation run IDs with f'sim_{uuid.uuid4().hex}'
    yields 10,000 completely distinct identifiers (zero collisions), with
    each having exactly 36 characters (4 prefix + 32 hexadecimal).
    """
    generated_ids = set()
    for _ in range(10000):
        run_id = f"sim_{uuid.uuid4().hex}"
        assert len(run_id) == 36
        assert run_id.startswith("sim_")
        generated_ids.add(run_id)
    
    assert len(generated_ids) == 10000, "Collision detected in 10,000 generated UUIDs"


def test_database_level_uniqueness_enforcement():
    """
    P1 requirement:
    Verify that attempting to insert two SimulationResult records with the same primary key id
    is strictly rejected by the database engine with an IntegrityError.
    """
    db = SessionLocal()
    unique_run_id = f"sim_{uuid.uuid4().hex}"
    
    sim1 = SimulationResult(
        id=unique_run_id,
        scenario_id="scen_unique_1",
        baseline_t_mean=35.0,
        scenario_t_mean=32.0,
        delta_t_mean=3.0,
        peak_t=38.0
    )
    db.add(sim1)
    db.commit()

    sim2 = SimulationResult(
        id=unique_run_id,  # Duplicate primary key
        scenario_id="scen_unique_2",
        baseline_t_mean=36.0,
        scenario_t_mean=33.0,
        delta_t_mean=3.0,
        peak_t=39.0
    )
    db.add(sim2)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    # Clean up sim1
    db.delete(sim1)
    db.commit()
    db.close()

