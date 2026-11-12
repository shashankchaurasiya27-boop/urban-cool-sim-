from typing import Dict, Any, Optional

class InterventionEngine:
    """
    Intervention Engine: Translates urban cooling policy parameters into physical inputs
    and cost/water/land budget demands.
    """
    
    # Unit Cost Assumptions ($ / m²)
    UNIT_COST_GREEN_ROOF = 75.0      # $75/m²
    UNIT_COST_COOL_ROOF = 18.0       # $18/m²
    UNIT_COST_TREE_CANOPY = 35.0     # $35/m² canopy area
    UNIT_COST_REFLECTIVE_PAVE = 22.0 # $22/m²
    UNIT_COST_WATER_FEATURE = 120.0  # $120/m²
    
    # Annual Water Demand Assumptions (Liters / m² / year)
    WATER_DEMAND_GREEN_ROOF = 450.0  # 450 L/m²/yr
    WATER_DEMAND_TREE_CANOPY = 600.0 # 600 L/m²/yr
    WATER_DEMAND_WATER_FEATURE = 1200.0 # 1200 L/m²/yr (evaporation replenishment)

    @classmethod
    def calculate_resource_budget(
        self,
        params: Dict[str, float],
        study_area_m2: Optional[float] = None,
        avg_bldg_density: float = 0.40
    ) -> Dict[str, float]:
        """
        Calculates implementation cost ($), water demand (m³/yr), and land area (m²).
        """
        if study_area_m2 is None or study_area_m2 <= 0:
            raise ValueError("study_area_m2 must be explicitly provided from the configured study area extent; hardcoded defaults are disabled.")
        bldg_area = study_area_m2 * avg_bldg_density
        ground_area = study_area_m2 * (1.0 - avg_bldg_density)
        
        green_roof_area = bldg_area * params.get("green_roof_coverage", 0.0)
        cool_roof_area = bldg_area * params.get("cool_roof_coverage", 0.0)
        tree_area = ground_area * params.get("tree_canopy_addition", 0.0)
        reflective_pave_area = ground_area * (params.get("reflective_pavement_albedo", 0.0) * 2.5) # estimate coverage ratio
        water_area = ground_area * params.get("water_feature_fraction", 0.0)
        
        # Calculate Total Cost ($)
        total_cost = (
            green_roof_area * self.UNIT_COST_GREEN_ROOF +
            cool_roof_area * self.UNIT_COST_COOL_ROOF +
            tree_area * self.UNIT_COST_TREE_CANOPY +
            reflective_pave_area * self.UNIT_COST_REFLECTIVE_PAVE +
            water_area * self.UNIT_COST_WATER_FEATURE
        )
        
        # Calculate Water Demand (m³ / yr)
        total_water_liters = (
            green_roof_area * self.WATER_DEMAND_GREEN_ROOF +
            tree_area * self.WATER_DEMAND_TREE_CANOPY +
            water_area * self.WATER_DEMAND_WATER_FEATURE
        )
        water_demand_m3 = total_water_liters / 1000.0
        
        total_land_m2 = green_roof_area + cool_roof_area + tree_area + reflective_pave_area + water_area
        
        return {
            "total_cost_usd": round(float(total_cost), 2),
            "water_demand_m3": round(float(water_demand_m3), 2),
            "land_area_m2": round(float(total_land_m2), 2),
            "green_roof_area_m2": round(float(green_roof_area), 1),
            "cool_roof_area_m2": round(float(cool_roof_area), 1),
            "tree_canopy_area_m2": round(float(tree_area), 1),
            "water_feature_area_m2": round(float(water_area), 1),
        }
