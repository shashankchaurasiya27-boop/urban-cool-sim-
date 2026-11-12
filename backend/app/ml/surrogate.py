import os
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, Tuple
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.linear_model import Ridge
import lightgbm as lgb
import shap

from app.config import settings
from app.physics.energy_balance import EnergyBalanceSolver

class SurrogateModelPipeline:
    """
    AI Surrogate Model Pipeline: Accelerates scenario evaluation by learning physics engine response.
    Features: Urban morphology + Forcing + Intervention Parameters -> Target: Delta_T (°C cooling)
    """
    
    FEATURE_NAMES = [
        "baseline_albedo",
        "baseline_veg_frac",
        "baseline_water_frac",
        "building_height",
        "building_density",
        "q_f",
        "air_temp_c",
        "solar_rad",
        "wind_speed",
        "green_roof_coverage",
        "cool_roof_albedo_boost",
        "tree_canopy_addition",
        "reflective_pavement_albedo",
        "water_feature_fraction",
        "wetness_factor"
    ]

    def __init__(self, model_dir: str = None):
        self.model_dir = model_dir or os.path.join(settings.STORAGE_DIR, "models")
        os.makedirs(self.model_dir, exist_ok=True)
        self.model = None
        self.baseline_model = None
        self.explainer = None

    def generate_training_data(self, n_samples: int = 1200, seed: int = 42) -> Tuple[pd.DataFrame, pd.Series]:
        """
        Generates physically meaningful training dataset by running physics solver on sampled urban states.
        """
        np.random.seed(seed)
        
        # Sample realistic physical parameters
        albedo = np.random.uniform(0.10, 0.35, n_samples)
        veg_frac = np.random.uniform(0.05, 0.40, n_samples)
        water_frac = np.random.uniform(0.0, 0.15, n_samples)
        bldg_height = np.random.uniform(5.0, 45.0, n_samples)
        bldg_density = np.random.uniform(0.15, 0.70, n_samples)
        q_f = np.random.uniform(10.0, 80.0, n_samples)
        
        # Weather forcing
        air_temp = np.random.uniform(32.0, 44.0, n_samples)
        solar_rad = np.random.uniform(600.0, 950.0, n_samples)
        wind_speed = np.random.uniform(1.0, 5.0, n_samples)
        
        # Interventions
        green_roof = np.random.uniform(0.0, 0.8, n_samples)
        cool_roof = np.random.uniform(0.0, 0.4, n_samples)
        tree_canopy = np.random.uniform(0.0, 0.4, n_samples)
        reflect_pave = np.random.uniform(0.0, 0.3, n_samples)
        water_feat = np.random.uniform(0.0, 0.2, n_samples)
        wetness = np.random.uniform(0.2, 0.8, n_samples)
        
        X_df = pd.DataFrame({
            "baseline_albedo": albedo,
            "baseline_veg_frac": veg_frac,
            "baseline_water_frac": water_frac,
            "building_height": bldg_height,
            "building_density": bldg_density,
            "q_f": q_f,
            "air_temp_c": air_temp,
            "solar_rad": solar_rad,
            "wind_speed": wind_speed,
            "green_roof_coverage": green_roof,
            "cool_roof_albedo_boost": cool_roof,
            "tree_canopy_addition": tree_canopy,
            "reflective_pavement_albedo": reflect_pave,
            "water_feature_fraction": water_feat,
            "wetness_factor": wetness
        })
        
        # Compute ground truth Delta_T from physics solver
        delta_T_list = []
        for idx, row in X_df.iterrows():
            solver = EnergyBalanceSolver(
                solar_rad=row["solar_rad"],
                air_temp_c=row["air_temp_c"],
                rel_humidity=0.45,
                wind_speed=row["wind_speed"]
            )
            # Baseline simulation
            base_res = solver.solve_cell_equilibrium(
                albedo=row["baseline_albedo"],
                emissivity=0.95,
                veg_fraction=row["baseline_veg_frac"],
                water_fraction=row["baseline_water_frac"],
                building_height=row["building_height"],
                building_density=row["building_density"],
                q_f=row["q_f"],
                wetness_factor=0.5
            )
            # Scenario simulation with interventions
            scen_albedo = row["baseline_albedo"] + (row["building_density"] * row["cool_roof_albedo_boost"]) + ((1.0 - row["building_density"]) * row["reflective_pavement_albedo"])
            scen_veg = row["baseline_veg_frac"] + (row["building_density"] * row["green_roof_coverage"]) + row["tree_canopy_addition"]
            scen_water = row["baseline_water_frac"] + row["water_feature_fraction"]
            
            scen_res = solver.solve_cell_equilibrium(
                albedo=scen_albedo,
                emissivity=0.95,
                veg_fraction=scen_veg,
                water_fraction=scen_water,
                building_height=row["building_height"],
                building_density=row["building_density"],
                q_f=row["q_f"],
                wetness_factor=row["wetness_factor"]
            )
            
            dT = base_res["T_surface_c"] - scen_res["T_surface_c"]
            delta_T_list.append(dT)
            
        y_series = pd.Series(delta_T_list, name="delta_T_c")
        return X_df, y_series

    def train_and_evaluate(self, n_samples: int = 1000) -> Dict[str, Any]:
        """
        Trains baseline Ridge model and primary LightGBM surrogate model, evaluating MAE, RMSE, R².
        """
        X, y = self.generate_training_data(n_samples=n_samples)
        
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        # 1. Baseline Linear Model
        self.baseline_model = Ridge()
        self.baseline_model.fit(X_train, y_train)
        base_preds = self.baseline_model.predict(X_test)
        base_mae = float(mean_absolute_error(y_test, base_preds))
        base_rmse = float(np.sqrt(mean_squared_error(y_test, base_preds)))
        base_r2 = float(r2_score(y_test, base_preds))
        
        # 2. Production LightGBM Surrogate
        self.model = lgb.LGBMRegressor(
            n_estimators=250,
            learning_rate=0.07,
            num_leaves=31,
            max_depth=6,
            random_state=42,
            verbose=-1
        )
        self.model.fit(X_train, y_train)
        preds = self.model.predict(X_test)
        
        mae = float(mean_absolute_error(y_test, preds))
        rmse = float(np.sqrt(mean_squared_error(y_test, preds)))
        r2 = float(r2_score(y_test, preds))
        
        # Feature Importance
        importances = dict(zip(self.FEATURE_NAMES, [float(x) for x in self.model.feature_importances_]))
        
        # Save artifacts atomically with versioning (C-7)
        import datetime
        timestamp = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        versioned_filename = f"surrogate_lgbm_{timestamp}.joblib"
        versioned_path = os.path.join(self.model_dir, versioned_filename)
        latest_path = os.path.join(self.model_dir, "surrogate_lgbm_latest.joblib")
        
        # Atomic write to versioned file
        tmp_versioned = f"{versioned_path}.tmp"
        joblib.dump(self.model, tmp_versioned)
        os.replace(tmp_versioned, versioned_path)
        
        # Atomic write to latest file pointer
        tmp_latest = f"{latest_path}.tmp"
        joblib.dump(self.model, tmp_latest)
        os.replace(tmp_latest, latest_path)
        
        # Initialize SHAP explainer
        self.explainer = shap.TreeExplainer(self.model)
        
        return {
            "surrogate_lgbm": {
                "mae": round(mae, 4),
                "rmse": round(rmse, 4),
                "r2": round(r2, 4),
            },
            "baseline_ridge": {
                "mae": round(base_mae, 4),
                "rmse": round(base_rmse, 4),
                "r2": round(base_r2, 4),
            },
            "feature_importance": importances,
            "dataset_samples": n_samples,
            "model_path": latest_path,
            "versioned_path": versioned_path,
            "model_version": versioned_filename
        }

    def predict_delta_t(self, features_dict: Dict[str, float]) -> float:
        """
        Fast inference call for surrogate evaluation.
        Returns true signed predicted cooling/warming delta_T (°C) without clipping (M-1).
        """
        if self.model is None:
            model_path = os.path.join(self.model_dir, "surrogate_lgbm_latest.joblib")
            if os.path.exists(model_path):
                self.model = joblib.load(model_path)
            else:
                self.train_and_evaluate(n_samples=600)
                
        input_data = [features_dict.get(feat, 0.0) for feat in self.FEATURE_NAMES]
        df = pd.DataFrame([input_data], columns=self.FEATURE_NAMES)
        pred = self.model.predict(df)[0]
        # Return true signed predicted value (M-1: do not hide warming outcomes behind 0.0)
        return float(pred)

    def explain_prediction(self, features_dict: Dict[str, float]) -> Dict[str, float]:
        """
        Computes SHAP value breakdown for a single scenario prediction.
        """
        if self.explainer is None:
            if self.model is None:
                self.train_and_evaluate(n_samples=400)
            self.explainer = shap.TreeExplainer(self.model)
            
        input_data = [features_dict.get(feat, 0.0) for feat in self.FEATURE_NAMES]
        df = pd.DataFrame([input_data], columns=self.FEATURE_NAMES)
        shap_vals = self.explainer.shap_values(df)[0]
        
        shap_dict = dict(zip(self.FEATURE_NAMES, [round(float(v), 4) for v in shap_vals]))
        return shap_dict
