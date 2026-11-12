import numpy as np
from typing import Dict, Any
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

class ValidationEvaluator:
    """
    Internal Self-Consistency Evaluator: Evaluates physics simulation agreement
    against synthetic benchmark fields (model output + injected noise).
    Note: Real satellite observational validation (Landsat/ECOSTRESS) is a separately scoped project.
    """
    
    @classmethod
    def evaluate_against_observations(
        cls,
        simulated_ts: np.ndarray,
        observed_lst: np.ndarray
    ) -> Dict[str, Any]:
        """
        Computes spatial agreement metrics between simulated and synthetic benchmark fields.
        """
        flat_sim = simulated_ts.flatten()
        flat_obs = observed_lst.flatten()
        
        # Filter valid non-NaN spatial pixels
        valid_mask = ~np.isnan(flat_sim) & ~np.isnan(flat_obs)
        sim_valid = flat_sim[valid_mask]
        obs_valid = flat_obs[valid_mask]
        
        mae = float(mean_absolute_error(obs_valid, sim_valid))
        rmse = float(np.sqrt(mean_squared_error(obs_valid, sim_valid)))
        r2 = float(r2_score(obs_valid, sim_valid))
        bias = float(np.mean(sim_valid - obs_valid))
        
        residuals = sim_valid - obs_valid
        error_quantiles = {
            "p10": float(np.percentile(residuals, 10)),
            "p25": float(np.percentile(residuals, 25)),
            "p50_median": float(np.percentile(residuals, 50)),
            "p75": float(np.percentile(residuals, 75)),
            "p90": float(np.percentile(residuals, 90)),
        }
        
        spatial_residuals = (simulated_ts - observed_lst).tolist()

        # Return a bounded, deterministic sample for visualization. These are
        # synthetic benchmark points, not independent satellite observations.
        sample_count = min(100, int(sim_valid.size))
        sample_indices = np.linspace(0, int(sim_valid.size) - 1, sample_count, dtype=int)
        valid_flat_indices = np.flatnonzero(valid_mask.reshape(-1))
        scatter_points = []
        for sample_index in sample_indices:
            flat_index = int(valid_flat_indices[sample_index])
            row_index, col_index = np.unravel_index(flat_index, simulated_ts.shape)
            scatter_points.append({
                "cell_index": flat_index,
                "row": int(row_index),
                "col": int(col_index),
                "benchmark_temperature_c": round(float(obs_valid[sample_index]), 3),
                "simulated_temperature_c": round(float(sim_valid[sample_index]), 3),
            })
        
        # Determine status dynamically from computed R² metric
        if r2 >= 0.85:
            cal_status = f"SELF-CONSISTENT (Internal R² = {r2:.3f} >= 0.85, synthetic baseline)"
        elif r2 >= 0.70:
            cal_status = f"MODERATE AGREEMENT (Internal R² = {r2:.3f}, synthetic baseline)"
        else:
            cal_status = f"DEVIATED (Internal R² = {r2:.3f} < 0.70, synthetic baseline)"
        
        return {
            "observed_source": "Synthetic benchmark (simulated baseline + seeded Gaussian noise; not observational)",
            "mae": round(mae, 3),
            "rmse": round(rmse, 3),
            "r2": round(r2, 3),
            "mean_bias": round(bias, 3),
            "error_quantiles": error_quantiles,
            "spatial_residuals": spatial_residuals,
            "scatter_points": scatter_points,
            "calibration_status": cal_status,
            "provenance": {
                "tag": "INTERNAL SELF-CONSISTENCY CHECK (SYNTHETIC)",
                "benchmark_generation": "simulated baseline + seeded Gaussian noise (standard deviation 0.45 °C)",
                "independent_observations_used": False,
                "units": "°C",
                "pixel_count": int(np.sum(valid_mask)),
                "scatter_sample_count": len(scatter_points),
            }
        }
