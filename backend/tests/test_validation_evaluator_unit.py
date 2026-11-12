"""Focused tests for the internal synthetic validation evaluator.

These tests intentionally avoid importing the entire FastAPI app so the
provenance/data-shape contract can be tested independently of web dependencies.
"""
import numpy as np

from app.validation.evaluator import ValidationEvaluator


def test_evaluator_marks_benchmark_as_synthetic_and_returns_bounded_grid_samples():
    simulated = np.arange(36, dtype=float).reshape(6, 6) + 30.0
    rng = np.random.default_rng(101)
    benchmark = simulated + rng.normal(0.0, 0.45, simulated.shape)

    result = ValidationEvaluator.evaluate_against_observations(simulated, benchmark)

    assert "synthetic" in result["observed_source"].lower()
    assert "not observational" in result["observed_source"].lower()
    assert result["provenance"]["independent_observations_used"] is False
    assert result["provenance"]["pixel_count"] == simulated.size
    assert 0 < len(result["scatter_points"]) <= 100
    assert result["provenance"]["scatter_sample_count"] == len(result["scatter_points"])
    assert "SELF-CONSISTENT" in result["calibration_status"] or "MODERATE AGREEMENT" in result["calibration_status"] or "DEVIATED" in result["calibration_status"]

    for point in result["scatter_points"]:
        assert 0 <= point["row"] < simulated.shape[0]
        assert 0 <= point["col"] < simulated.shape[1]
        assert point["cell_index"] == point["row"] * simulated.shape[1] + point["col"]
        assert point["simulated_temperature_c"] == round(
            float(simulated[point["row"], point["col"]]), 3
        )
