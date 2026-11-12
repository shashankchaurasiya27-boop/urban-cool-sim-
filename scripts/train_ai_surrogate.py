#!/usr/bin/env python3
"""
UrbanCoolSim AI Surrogate Model Training Script
Trains the LightGBM production surrogate and baseline Ridge model
on physics-informed surface energy balance simulations.
"""

import sys
import os
import argparse
import time

# Add backend directory to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
backend_dir = os.path.join(project_root, "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Ensure UTF-8 stdout encoding on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from app.ml.surrogate import SurrogateModelPipeline

def main():
    parser = argparse.ArgumentParser(description="Train UrbanCoolSim AI Surrogate Model")
    parser.add_argument("--samples", type=int, default=1500, help="Number of physics simulation samples to generate for training (default: 1500)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility (default: 42)")
    args = parser.parse_args()

    print("=" * 70)
    print("  URBANCOOLSIM: AI SURROGATE MODEL TRAINING PIPELINE")
    print("=" * 70)
    print(f"[*] Training Samples: {args.samples}")
    print(f"[*] Random Seed:      {args.seed}")
    print(f"[*] Model Target:     Surface Temperature Reduction Delta_T (deg C)")
    print(f"[*] Physics Engine:   Surface Energy Balance (Q* + Qf = Qh + Qe + dQs)")
    print("=" * 70)

    start_time = time.time()
    pipeline = SurrogateModelPipeline()

    print("\n[1/4] Generating physics-grounded training scenarios...")
    print("      (Varying albedo, vegetation, canopy, building density/height, forcing)")
    
    print("\n[2/4] Fitting Baseline Ridge & Production LightGBM Surrogate Models...")
    results = pipeline.train_and_evaluate(n_samples=args.samples)

    elapsed = time.time() - start_time
    lgbm_metrics = results["surrogate_lgbm"]
    ridge_metrics = results["baseline_ridge"]

    print("\n[3/4] Model Evaluation Benchmark:")
    print("-" * 70)
    print(f"  LightGBM Production Surrogate:")
    print(f"    - Coefficient of Determination (R2): {lgbm_metrics['r2']:.4f}")
    print(f"    - Mean Absolute Error (MAE):         {lgbm_metrics['mae']:.4f} deg C")
    print(f"    - Root Mean Square Error (RMSE):     {lgbm_metrics['rmse']:.4f} deg C")
    print()
    print(f"  Baseline Ridge Regression:")
    print(f"    - Coefficient of Determination (R2): {ridge_metrics['r2']:.4f}")
    print(f"    - Mean Absolute Error (MAE):         {ridge_metrics['mae']:.4f} deg C")
    print(f"    - Root Mean Square Error (RMSE):     {ridge_metrics['rmse']:.4f} deg C")
    print("-" * 70)

    print("\n[4/4] Feature Importance Breakdown (Top Factors Driving Cooling):")
    feat_imp = sorted(results["feature_importance"].items(), key=lambda x: x[1], reverse=True)
    for feat, score in feat_imp[:7]:
        print(f"    - {feat:<28}: {score:.1f}")

    print("\n" + "=" * 70)
    print(f"[*] Model Artifact Saved: {results['model_path']}")
    print(f"[*] Total Execution Time: {elapsed:.2f} seconds")
    print("=" * 70)

    # Verification Inference
    test_scenario = {
        "baseline_albedo": 0.18,
        "baseline_veg_frac": 0.12,
        "baseline_water_frac": 0.02,
        "building_height": 22.0,
        "building_density": 0.45,
        "q_f": 40.0,
        "air_temp_c": 38.5,
        "solar_rad": 850.0,
        "wind_speed": 2.5,
        "green_roof_coverage": 0.40,
        "cool_roof_albedo_boost": 0.30,
        "tree_canopy_addition": 0.25,
        "reflective_pavement_albedo": 0.15,
        "water_feature_fraction": 0.05,
        "wetness_factor": 0.55
    }
    pred_dt = pipeline.predict_delta_t(test_scenario)
    shap_vals = pipeline.explain_prediction(test_scenario)
    print(f"\n[Validation Test Scenario]")
    print(f"  Intervention: 40% Green Roofs + 30% Cool Roofs + 25% Tree Canopy + 5% Water")
    print(f"  Predicted Cooling Benefit: -{pred_dt:.2f} deg C")
    print(f"  SHAP Top Driver:           {max(shap_vals.items(), key=lambda x: x[1])}")
    print("\n[SUCCESS] AI Surrogate is ready for backend FastAPI inference and NSGA-II optimization!")

if __name__ == "__main__":
    main()
