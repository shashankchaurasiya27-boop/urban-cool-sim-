"""Focused spatial/physics regression tests that do not import the whole API app."""

import numpy as np
import pytest

from app.physics.energy_balance import EnergyBalanceSolver
from app.schemas.schemas import DigitalTwinGridResponse
from app.spatial.geo_digital_twin import geo_twin_engine, STUDY_AREA_CONFIGS


def test_brutsaert_atmospheric_emissivity_uses_hpa_and_stays_physical():
    # Delhi baseline in the bundled study-area registry.
    solver = EnergyBalanceSolver(
        solar_rad=920.0,
        air_temp_c=42.0,
        rel_humidity=0.35,
        wind_speed=2.2,
    )
    assert 0.0 < solver.epsilon_atm < 1.0
    # The previous Pa-vs-hPa bug produced ~1.70 for this case.
    assert np.isclose(solver.epsilon_atm, 0.88, atol=0.05)


def test_grid_reports_effective_resolution_and_truthful_provenance():
    grid = geo_twin_engine.generate_microgrid("delhi_cp", 50, 50)
    metadata = grid["metadata"]

    assert metadata["rows"] == 50
    assert metadata["cols"] == 50
    assert metadata["total_cells"] == 2500
    assert metadata["crs"] == "EPSG:4326"
    assert metadata["bbox_crs"] == "EPSG:4326"
    assert metadata["grid_coordinate_crs"] == "EPSG:4326"
    assert metadata["configured_projected_crs"] == "EPSG:32643"
    assert "pyproj" in metadata["distance_method"].lower()
    assert metadata["nominal_resolution_m"] == 10.0
    # The 50x50 array covers the full ~1.3 km bbox, so the effective cells are ~26m.
    assert 24.0 <= metadata["resolution_m"] <= 28.0
    assert metadata["is_synthetic"] in (True, False)
    assert metadata["has_observed_satellite_lst"] is False
    assert "not satellite-observed" in metadata["layer_provenance"]["baseline_temperature_c"]


def test_grid_generation_is_deterministic_and_not_clipped_to_53_5c():
    first = geo_twin_engine.generate_microgrid("delhi_cp", 50, 50)
    second = geo_twin_engine.generate_microgrid("delhi_cp", 50, 50)

    for layer_name in (
        "baseline_temperature_c",
        "seb_temperature_c",
        "population_density",
        "anthropogenic_heat_qf",
    ):
        a = np.asarray(first["layers"][layer_name])
        b = np.asarray(second["layers"][layer_name])
        assert np.array_equal(a, b), f"Layer {layer_name} must be deterministic across repeated requests"
        assert np.isfinite(a).all()

    base = np.asarray(first["layers"]["baseline_temperature_c"])
    assert np.count_nonzero(np.isclose(base, 53.5)) < 0.10 * base.size
    assert base.max() > 53.5, "Modelled baseline should preserve solver-derived variation above the old cap"

    # No pseudo-population or waste heat should be introduced by random noise
    # into cells that contain neither buildings nor road corridors.
    building = np.asarray(first["layers"]["building_density"])
    qf = np.asarray(first["layers"]["anthropogenic_heat_qf"])
    population = np.asarray(first["layers"]["population_density"])
    coverage = np.asarray(first["layers"]["modelled_coverage_mask"], dtype=bool)
    assert coverage.shape == base.shape
    assert coverage.any() and (~coverage).any()
    assert np.allclose(qf[~coverage], 0.0)
    assert np.allclose(population[~coverage], 0.0)


def test_all_study_areas_have_consistent_grid_metadata_and_layer_shapes():
    """Every bundled study area must disclose its actual sampled grid geometry."""
    for study_area_id in (
        "delhi_cp",
        "mumbai_bkc",
        "singapore_marina",
        "phoenix_downtown",
        "tokyo_shinjuku",
    ):
        grid = geo_twin_engine.generate_microgrid(study_area_id, 50, 50)
        # Validate the same typed response contract used by the FastAPI endpoint.
        response = DigitalTwinGridResponse.model_validate(grid)
        metadata = response.metadata.model_dump()
        layers = response.layers.model_dump()

        assert metadata["study_area_id"] == study_area_id
        assert metadata["rows"] == metadata["cols"] == 50
        assert metadata["total_cells"] == 2500
        assert metadata["crs"] == metadata["bbox_crs"] == metadata["grid_coordinate_crs"] == "EPSG:4326"
        assert metadata["is_synthetic"] in (True, False)
        assert metadata["has_observed_satellite_lst"] is False

        config = STUDY_AREA_CONFIGS[study_area_id]
        expected_x = config["analysis_window_width_m"] / metadata["cols"]
        expected_y = config["analysis_window_height_m"] / metadata["rows"]
        assert np.isclose(metadata["effective_resolution_x_m"], expected_x, atol=0.02)
        assert np.isclose(metadata["effective_resolution_y_m"], expected_y, atol=0.02)
        assert np.isclose(metadata["resolution_m"], (expected_x + expected_y) / 2.0, atol=0.02)

        for name, values in layers.items():
            arr = np.asarray(values)
            assert arr.shape == (50, 50), f"{study_area_id}.{name} shape must match the grid"
            assert np.isfinite(arr).all(), f"{study_area_id}.{name} contains non-finite cells"

        mask = np.asarray(layers["modelled_coverage_mask"], dtype=bool)
        assert mask.any(), f"{study_area_id} should contain cells supported by mapped morphology"
        assert (~mask).any(), f"{study_area_id} should identify unsupported/default-only cells"



def test_unknown_study_area_is_rejected_instead_of_silently_defaulting():
    with pytest.raises(ValueError, match="Unsupported study_area_id"):
        geo_twin_engine.generate_microgrid("not_a_real_city", 50, 50)
