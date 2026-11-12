"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { api, OptimizationResponse, ParetoSolution } from "@/lib/api";
import { 
  Sparkles, 
  DollarSign, 
  Droplets, 
  CheckCircle2, 
  ShieldCheck, 
  Download, 
  Check,
  Flame,
  Users,
  Zap,
} from "lucide-react";

const ParetoFrontChart = dynamic(
  () => import("@/components/ParetoFrontChart").then((mod) => mod.ParetoFrontChart),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-80 flex items-center justify-center surface-inset rounded-lg text-xs font-mono text-ink-muted skeleton-pulse">
        Initializing Pareto 4D Visualizer…
      </div>
    ),
  }
);

export default function OptimizationPage() {
  const router = useRouter();
  const [studyArea, setStudyArea] = useState("delhi_cp");
  const [optData, setOptData] = useState<OptimizationResponse | null>(null);
  const [selectedSolution, setSelectedSolution] = useState<ParetoSolution | null>(null);
  const [loading, setLoading] = useState(false);
  const [appliedStatus, setAppliedStatus] = useState(false);

  // Constraints
  const [maxBudget, setMaxBudget] = useState<number>(500000);
  const [maxWater, setMaxWater] = useState<number>(6000);
  const [minReflectance, setMinReflectance] = useState<number>(0.70);
  const [maxTreePct, setMaxTreePct] = useState<number>(0.30);

  // 5 Objective Function Weights
  const [weightCooling, setWeightCooling] = useState<number>(35);
  const [weightCost, setWeightCost] = useState<number>(25);
  const [weightPopulation, setWeightPopulation] = useState<number>(20);
  const [weightWater, setWeightWater] = useState<number>(10);
  const [weightEnergy, setWeightEnergy] = useState<number>(10);

  const handleRunOptimization = async (areaId = studyArea) => {
    setLoading(true);
    try {
      const res = await api.runOptimization({
        studyAreaId: areaId,
        maxBudget,
        maxWater,
        minCoolRoofReflectance: minReflectance,
        maxTreeAreaPct: maxTreePct,
        weightCooling: weightCooling / 100.0,
        weightCost: weightCost / 100.0,
        weightPopulation: weightPopulation / 100.0,
        weightWater: weightWater / 100.0,
        weightEnergy: weightEnergy / 100.0
      });
      setOptData(res);
      if (res.pareto_solutions && res.pareto_solutions.length > 0) {
        setSelectedSolution(res.recommended_solution || res.pareto_solutions[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedArea = localStorage.getItem("urbancoolsim_study_area") || "delhi_cp";
    setStudyArea(savedArea);
    handleRunOptimization(savedArea);

    const handleAreaChange = (e: any) => {
      if (e.detail) {
        setStudyArea(e.detail);
        handleRunOptimization(e.detail);
      }
    };
    window.addEventListener("studyAreaChanged", handleAreaChange);
    return () => window.removeEventListener("studyAreaChanged", handleAreaChange);
  }, []);

  const handleApplySolution = () => {
    if (!selectedSolution) return;
    const solWithArea = { ...selectedSolution, study_area_id: studyArea };
    localStorage.setItem("urbancoolsim_active_solution", JSON.stringify(solWithArea));
    localStorage.setItem(`urbancoolsim_active_solution_${studyArea}`, JSON.stringify(solWithArea));
    localStorage.setItem("urbancoolsim_scenario", "optimized");
    window.dispatchEvent(new CustomEvent("solutionApplied", { detail: solWithArea }));
    setAppliedStatus(true);
    setTimeout(() => {
      setAppliedStatus(false);
      router.push(`/digital-twin?applied_solution=${selectedSolution.solution_id}`);
    }, 700);
  };

  const handleExportGeoJSON = () => {
    if (!selectedSolution) return;
    api.exportInterventionsToGeoJSON(selectedSolution, studyArea, `${studyArea}_mitigation_blueprint.geojson`);
  };

  const solutions = optData?.pareto_solutions || [];

  return (
    <div className="flex flex-col min-h-screen bg-surface-base text-ink-primary select-none">
      <Header 
        title="Multi-Objective Optimization Studio" 
        subtitle="NSGA-II Genetic Pareto Front Solver & Deterministic Physics Re-Validation" 
        onStudyAreaChange={(id) => {
          setStudyArea(id);
          handleRunOptimization(id);
        }}
      />

      <div className="p-5 sm:p-7 max-w-7xl mx-auto w-full space-y-6">
        {/* Lab Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-surface-border/60">
          <div className="space-y-1.5">
            <span className="text-label text-cobalt">
              Pareto Frontier Decision Support
            </span>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
              Multi-Criteria Optimization Engine
            </h1>
            <p className="text-xs text-ink-secondary max-w-xl leading-relaxed">
              Explores tens of thousands of spatial combinations to discover non-dominated Pareto portfolios 
              optimizing cooling, municipal CapEx, water demand, and HVAC energy.
            </p>
          </div>

          <button
            onClick={() => handleRunOptimization()}
            disabled={loading}
            className="btn-cobalt px-4 py-2 rounded-md text-xs flex items-center gap-2 shrink-0 font-mono"
          >
            <Sparkles className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Solving NSGA-II..." : "Re-Run Optimization"}</span>
          </button>
        </div>

        {/* 5 Objective Function Weights */}
        <div className="graphite-card p-5 sm:p-6 rounded-lg space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-surface-border pb-3">
            <div>
              <h3 className="text-xs font-semibold text-ink-primary">
                Objective Priority Weights (0–100%)
              </h3>
              <p className="text-[11px] text-ink-dim mt-0.5">
                Adjust relative importance across competing municipal climate, budget, and resource goals
              </p>
            </div>
            <span className="text-xs font-mono text-cobalt font-medium">
              Total: {weightCooling + weightCost + weightPopulation + weightWater + weightEnergy}%
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 text-xs tabular-nums">
            {/* 1. Cooling */}
            <div className="space-y-2 p-3 rounded-lg surface-inset">
              <div className="flex justify-between items-baseline">
                <span className="text-ink-primary font-medium flex items-center gap-1.5 text-[11px]">
                  <Flame className="w-3.5 h-3.5 text-status-critical" /> Max Cooling (ΔT)
                </span>
                <span className="font-mono text-cobalt font-semibold">{weightCooling}%</span>
              </div>
              <input
                type="range" min="5" max="60" value={weightCooling}
                onChange={(e) => setWeightCooling(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${((weightCooling - 5) / (60 - 5)) * 100}%, var(--surface-hover) ${((weightCooling - 5) / (60 - 5)) * 100}%, var(--surface-hover) 100%)`
                }}
                className="w-full"
              />
            </div>

            {/* 2. CapEx Cost */}
            <div className="space-y-2 p-3 rounded-lg surface-inset">
              <div className="flex justify-between items-baseline">
                <span className="text-ink-primary font-medium flex items-center gap-1.5 text-[11px]">
                  <DollarSign className="w-3.5 h-3.5 text-status-safe" /> Min CapEx Cost
                </span>
                <span className="font-mono text-ink-primary font-semibold">{weightCost}%</span>
              </div>
              <input
                type="range" min="5" max="60" value={weightCost}
                onChange={(e) => setWeightCost(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${((weightCost - 5) / (60 - 5)) * 100}%, var(--surface-hover) ${((weightCost - 5) / (60 - 5)) * 100}%, var(--surface-hover) 100%)`
                }}
                className="w-full"
              />
            </div>

            {/* 3. Population */}
            <div className="space-y-2 p-3 rounded-lg surface-inset">
              <div className="flex justify-between items-baseline">
                <span className="text-ink-primary font-medium flex items-center gap-1.5 text-[11px]">
                  <Users className="w-3.5 h-3.5 text-status-high" /> Pop Protected
                </span>
                <span className="font-mono text-status-high font-semibold">{weightPopulation}%</span>
              </div>
              <input
                type="range" min="5" max="60" value={weightPopulation}
                onChange={(e) => setWeightPopulation(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${((weightPopulation - 5) / (60 - 5)) * 100}%, var(--surface-hover) ${((weightPopulation - 5) / (60 - 5)) * 100}%, var(--surface-hover) 100%)`
                }}
                className="w-full"
              />
            </div>

            {/* 4. Water */}
            <div className="space-y-2 p-3 rounded-lg surface-inset">
              <div className="flex justify-between items-baseline">
                <span className="text-ink-primary font-medium flex items-center gap-1.5 text-[11px]">
                  <Droplets className="w-3.5 h-3.5 text-ink-muted" /> Water Conservation
                </span>
                <span className="font-mono text-ink-secondary font-semibold">{weightWater}%</span>
              </div>
              <input
                type="range" min="5" max="60" value={weightWater}
                onChange={(e) => setWeightWater(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${((weightWater - 5) / (60 - 5)) * 100}%, var(--surface-hover) ${((weightWater - 5) / (60 - 5)) * 100}%, var(--surface-hover) 100%)`
                }}
                className="w-full"
              />
            </div>

            {/* 5. Energy */}
            <div className="space-y-2 p-3 rounded-lg surface-inset">
              <div className="flex justify-between items-baseline">
                <span className="text-ink-primary font-medium flex items-center gap-1.5 text-[11px]">
                  <Zap className="w-3.5 h-3.5 text-status-high" /> HVAC Energy Saved
                </span>
                <span className="font-mono text-status-high font-semibold">{weightEnergy}%</span>
              </div>
              <input
                type="range" min="5" max="60" value={weightEnergy}
                onChange={(e) => setWeightEnergy(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${((weightEnergy - 5) / (60 - 5)) * 100}%, var(--surface-hover) ${((weightEnergy - 5) / (60 - 5)) * 100}%, var(--surface-hover) 100%)`
                }}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Policy & Physical Constraints */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 graphite-card p-4 rounded-lg text-xs tabular-nums">
          <div className="space-y-2 p-2.5 rounded-lg surface-inset">
            <div className="flex justify-between items-baseline">
              <span className="text-ink-secondary text-[11px]">Max Budget Cap:</span>
              <span className="font-mono text-ink-primary font-semibold">${Math.round(maxBudget / 1000)}k</span>
            </div>
            <input
              type="range" min="100000" max="1000000" step="50000" value={maxBudget}
              onChange={(e) => setMaxBudget(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${((maxBudget - 100000) / (1000000 - 100000)) * 100}%, var(--surface-hover) ${((maxBudget - 100000) / (1000000 - 100000)) * 100}%, var(--surface-hover) 100%)`
              }}
              className="w-full"
            />
          </div>

          <div className="space-y-2 p-2.5 rounded-lg surface-inset">
            <div className="flex justify-between items-baseline">
              <span className="text-ink-secondary text-[11px]">Max Annual Water:</span>
              <span className="font-mono text-ink-primary font-semibold">{maxWater.toLocaleString("en-US")} m³</span>
            </div>
            <input
              type="range" min="1000" max="10000" step="500" value={maxWater}
              onChange={(e) => setMaxWater(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${((maxWater - 1000) / (10000 - 1000)) * 100}%, var(--surface-hover) ${((maxWater - 1000) / (10000 - 1000)) * 100}%, var(--surface-hover) 100%)`
              }}
              className="w-full"
            />
          </div>

          <div className="space-y-2 p-2.5 rounded-lg surface-inset">
            <div className="flex justify-between items-baseline">
              <span className="text-ink-secondary text-[11px]">Cool Roof Min α:</span>
              <span className="font-mono text-ink-primary font-semibold">{minReflectance.toFixed(2)} α</span>
            </div>
            <input
              type="range" min="0.60" max="0.85" step="0.05" value={minReflectance}
              onChange={(e) => setMinReflectance(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${((minReflectance - 0.60) / (0.85 - 0.60)) * 100}%, var(--surface-hover) ${((minReflectance - 0.60) / (0.85 - 0.60)) * 100}%, var(--surface-hover) 100%)`
              }}
              className="w-full"
            />
          </div>

          <div className="space-y-2 p-2.5 rounded-lg surface-inset">
            <div className="flex justify-between items-baseline">
              <span className="text-ink-secondary text-[11px]">Max Tree Cover:</span>
              <span className="font-mono text-cobalt font-semibold">{Math.round(maxTreePct * 100)}%</span>
            </div>
            <input
              type="range" min="0.10" max="0.50" step="0.05" value={maxTreePct}
              onChange={(e) => setMaxTreePct(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${((maxTreePct - 0.10) / (0.50 - 0.10)) * 100}%, var(--surface-hover) ${((maxTreePct - 0.10) / (0.50 - 0.10)) * 100}%, var(--surface-hover) 100%)`
              }}
              className="w-full"
            />
          </div>
        </div>

        {/* 4D Pareto Front Visualizer + Selected Solution Deep Dive */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7">
            <ParetoFrontChart 
              solutions={solutions}
              onSelect={(s) => setSelectedSolution(s)}
              selectedSolution={selectedSolution}
            />
          </div>

          <div className="lg:col-span-5 space-y-5">
            {selectedSolution ? (
              <div className="graphite-card p-5 sm:p-6 rounded-lg space-y-4 tabular-nums">
                <div className="flex justify-between items-center border-b border-surface-border pb-3">
                  <div>
                    <span className="text-label text-ink-dim block mb-0.5">
                      Candidate #{selectedSolution.solution_id}
                    </span>
                    <span className="text-xs font-mono text-cobalt font-semibold">
                      Composite Score: {selectedSolution.composite_score != null ? selectedSolution.composite_score.toFixed(1) : "0.0"} / 100
                    </span>
                  </div>
                  {selectedSolution.physics_validated && (
                    <span className="text-[10px] font-mono text-status-safe flex items-center gap-1 bg-status-safe/10 px-2 py-0.5 rounded border border-status-safe/20">
                      <ShieldCheck className="w-3 h-3" /> Physics Validated
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="surface-inset p-3 rounded-lg">
                    <span className="text-[10px] font-mono text-ink-dim uppercase block mb-0.5">Cooling Delta</span>
                    <div className="flex items-baseline gap-0.5">
                      <span className="editorial-headline text-3xl text-cobalt tracking-tight">−</span>
                      <AnimatedCounter 
                        value={selectedSolution.validated_delta_t || selectedSolution.delta_t_mean || 0} 
                        decimals={2} 
                        className="editorial-headline text-3xl text-cobalt tracking-tight"
                      />
                      <span className="text-xs text-ink-muted font-serif ml-0.5">°C</span>
                    </div>
                  </div>

                  <div className="surface-inset p-3 rounded-lg">
                    <span className="text-[10px] font-mono text-ink-dim uppercase block mb-0.5">Estimated CapEx</span>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-ink-muted text-sm">$</span>
                      <span className="editorial-headline text-3xl text-ink-primary tracking-tight">
                        {Math.round(selectedSolution.total_cost_usd / 1000)}k
                      </span>
                    </div>
                  </div>
                </div>

                {/* Energy & Financial ROI Section */}
                <div className="p-3 surface-inset rounded-lg grid grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <span className="text-[9px] text-ink-dim font-mono uppercase block">HVAC Saved</span>
                    <span className="font-mono text-ink-primary font-medium text-[11px]">
                      {Math.round(selectedSolution.hvac_energy_savings_kwh ?? 0).toLocaleString("en-US")} kWh/yr
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-ink-dim font-mono uppercase block">Utility Savings</span>
                    <span className="font-mono text-status-safe font-medium text-[11px]">
                      +${Math.round(selectedSolution.electricity_cost_savings_usd ?? 0).toLocaleString("en-US")} /yr
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-ink-dim font-mono uppercase block">Avoided CO₂</span>
                    <span className="font-mono text-ink-primary font-medium text-[11px]">
                      {(selectedSolution.co2_avoided_tons ?? 0).toFixed(1)} tCO₂e/yr
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-ink-dim font-mono uppercase block">Payback</span>
                    <span className="font-mono text-ink-primary font-medium text-[11px]">
                      {selectedSolution.payback_period_years != null && selectedSolution.payback_period_years > 0
                        ? `${selectedSolution.payback_period_years} years`
                        : "N/A (No energy savings)"}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-surface-border/30">
                    <span className="text-ink-secondary">Green Roof:</span>
                    <span className="font-mono text-ink-primary">{(selectedSolution.green_roof_pct).toFixed(0)}% roof area</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-surface-border/30">
                    <span className="text-ink-secondary">Cool Roof:</span>
                    <span className="font-mono text-ink-primary">{(selectedSolution.cool_roof_pct).toFixed(0)}% roof area</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-surface-border/30">
                    <span className="text-ink-secondary">Tree Canopy:</span>
                    <span className="font-mono text-cobalt">+{(selectedSolution.tree_canopy_pct).toFixed(0)}% corridors</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-surface-border/30">
                    <span className="text-ink-secondary">Water Demand:</span>
                    <span className="font-mono text-ink-primary">{Math.round(selectedSolution.water_demand_m3).toLocaleString("en-US")} m³/yr</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2.5 pt-1 font-mono">
                  <button
                    onClick={handleApplySolution}
                    className="btn-cobalt py-2 px-3 rounded-md text-xs flex items-center justify-center gap-1.5"
                  >
                    {appliedStatus ? <Check className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>{appliedStatus ? "Applied" : "Apply to Twin"}</span>
                  </button>

                  <button
                    onClick={handleExportGeoJSON}
                    className="py-2 px-3 rounded-md bg-surface-elevated hover:bg-surface-interactive border border-surface-border text-ink-primary text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-cobalt" />
                    <span>Export GeoJSON</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed border-surface-border rounded-lg text-xs text-ink-muted font-mono">
                Click any candidate on the Pareto scatter plot to inspect its portfolio specs.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
