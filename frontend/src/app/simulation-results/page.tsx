"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { api, SimulationResult, DiurnalProfileResponse, DEFAULT_STUDY_AREAS } from "@/lib/api";
import { 
  PieChart as PieIcon, 
  Sliders, 
  Zap,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  Layers,
  RotateCcw
} from "lucide-react";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell 
} from "recharts";

const ShapWaterfallChart = dynamic(
  () => import("@/components/ShapWaterfallChart").then((mod) => mod.ShapWaterfallChart),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-80 flex items-center justify-center surface-inset rounded-lg text-xs font-mono text-ink-muted skeleton-pulse">
        Loading TreeSHAP Explainability Tree…
      </div>
    ),
  }
);

interface ModalitySlice {
  name: string;
  value: number;
  color: string;
}

const DEFAULT_MODALITY_DATA: ModalitySlice[] = [
  { name: "Cool Roofs (Albedo)", value: 42, color: "#4A6CFF" },
  { name: "Tree Canopy (Shading)", value: 31, color: "#10B981" },
  { name: "Green Roofs (ET Flux)", value: 19, color: "#3B55CC" },
  { name: "Water Features (Sink)", value: 8, color: "#06B6D4" }
];

export default function SimulationResultsPage() {
  const [studyArea, setStudyArea] = useState("delhi_cp");
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [shapData, setShapData] = useState<any | null>(null);
  const [diurnalData, setDiurnalData] = useState<DiurnalProfileResponse | null>(null);
  const [modalityData, setModalityData] = useState<ModalitySlice[]>(DEFAULT_MODALITY_DATA);
  const [activeStrategyTitle, setActiveStrategyTitle] = useState<string>("Baseline (Modelled)");
  const [isOptimizedActive, setIsOptimizedActive] = useState<boolean>(false);
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tariffRate, setTariffRate] = useState<number>(0.12);

  // Dynamic Economic & ROI State
  const [hvacSavedKwh, setHvacSavedKwh] = useState<number>(142000);
  const [capexBudgetUsd, setCapexBudgetUsd] = useState<number>(345000);
  const [carbonOffsetTons, setCarbonOffsetTons] = useState<number>(102.2);

  const loadData = async (areaId: string) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Authoritative country database default scenario ID
      const countryDefaultScenario = areaId === "delhi_cp" ? "scen_hybrid_cp" : `scen_hybrid_${areaId}`;
      let activeScenario = countryDefaultScenario;
      let activeSol: any = null;
      let strategyLabel = "Default Hybrid Mitigation Portfolio";
      let isOpt = false;
      let candId: number | null = null;

      if (typeof window !== "undefined") {
        // STRICT CHECK: An optimization candidate applies ONLY if it was specifically run for THIS country (areaId)
        let matchedSolution: any = null;

        // A. Check area-scoped key first: urbancoolsim_active_solution_<areaId>
        const areaSpecificRaw = localStorage.getItem(`urbancoolsim_active_solution_${areaId}`);
        if (areaSpecificRaw) {
          try {
            const parsed = JSON.parse(areaSpecificRaw);
            // Verify it has solution data and if study_area_id is present, it matches this country
            if (parsed && typeof parsed === "object" && (parsed.study_area_id === areaId || !parsed.study_area_id)) {
              matchedSolution = parsed;
            }
          } catch (e) {
            console.warn("Could not parse area-specific solution", e);
          }
        }

        // B. Check global key ONLY IF its study_area_id strictly matches this country
        if (!matchedSolution) {
          const globalRaw = localStorage.getItem("urbancoolsim_active_solution");
          if (globalRaw) {
            try {
              const parsed = JSON.parse(globalRaw);
              // CRITICAL: Must EXPLICITLY specify this areaId. If study_area_id is missing or from another country, IGNORE it.
              if (parsed && typeof parsed === "object" && parsed.study_area_id === areaId) {
                matchedSolution = parsed;
              }
            } catch (e) {
              console.warn("Could not parse global active solution", e);
            }
          }
        }

        // C. If an optimization was specifically run for this country:
        if (matchedSolution) {
          activeSol = matchedSolution;
          activeScenario = "optimized";
          isOpt = true;
          candId = activeSol.solution_id ?? 1;
          strategyLabel = `NSGA-II Candidate #${candId} Portfolio`;
        } else {
          // No optimization was specifically run for this country:
          // Automatically loads that country's database default!
          activeScenario = countryDefaultScenario;
          strategyLabel = "Default Hybrid Mitigation Portfolio";
          isOpt = false;
          candId = null;

          // Check if user explicitly selected a non-optimized scenario specifically for this area
          const areaScen = localStorage.getItem(`urbancoolsim_scenario_${areaId}`);
          if (areaScen && areaScen !== "optimized") {
            if (areaScen === "cool_roofs") {
              activeScenario = "cool_roofs";
              strategyLabel = "Cool Roofs (α=0.85)";
            } else if (areaScen === "green_roofs") {
              activeScenario = "green_roofs";
              strategyLabel = "Green Roofs (Extensive)";
            } else if (areaScen === "tree_canopy") {
              activeScenario = "tree_canopy";
              strategyLabel = "Tree Canopy Corridor";
            } else if (areaScen === "baseline") {
              activeScenario = "baseline";
              strategyLabel = "Baseline (Modelled)";
            }
          }
        }
      }

      setActiveStrategyTitle(strategyLabel);
      setIsOptimizedActive(isOpt);
      setCandidateId(candId);

      // 2. Resolve country & study area authoritative climate and morphology
      const areaMeta = DEFAULT_STUDY_AREAS.find((a) => a.id === areaId) || DEFAULT_STUDY_AREAS[0];
      const climate = areaMeta.base_climate;
      const bldgHeight = areaId === "tokyo_shinjuku" ? 38.0 : (areaId === "delhi_cp" ? 18.0 : 25.0);
      const bldgDensity = areaId === "tokyo_shinjuku" ? 0.65 : (areaId === "singapore_marina" ? 0.55 : 0.45);

      // 3. Resolve active parameter percentages
      const coolRoofPct = activeSol?.cool_roof_pct ?? (activeScenario === "cool_roofs" ? 0.45 : 0.25);
      const greenRoofPct = activeSol?.green_roof_pct ?? (activeScenario === "green_roofs" ? 0.50 : 0.35);
      const treeCanopyPct = activeSol?.tree_canopy_pct ?? (activeScenario === "tree_canopy" ? 0.35 : 0.20);
      const waterPct = activeSol?.water_pct ?? 0.05;

      // 4. Parallel fetch from backend physics & surrogate engines with authentic country climate
      const [res, shap, diurnal] = await Promise.all([
        api.runPhysicsSimulation(activeScenario, {
          air_temp: climate.air_temp_c,
          solar_rad: climate.solar_rad_wm2,
          rel_humidity: climate.rel_humidity,
          wind_speed: climate.wind_speed_ms,
          q_f: climate.q_f_wm2,
          custom_parameters: {
            green_roof_coverage: greenRoofPct,
            cool_roof_albedo_boost: coolRoofPct,
            tree_canopy_addition: treeCanopyPct,
            water_feature_fraction: waterPct,
            reflective_pavement_albedo: 0.15,
            wetness_factor: 0.60
          }
        }, areaId),
        api.explainModel({
          baseline_albedo: 0.18,
          baseline_veg_frac: 0.12,
          baseline_water_frac: 0.02,
          building_height: bldgHeight,
          building_density: bldgDensity,
          q_f: climate.q_f_wm2,
          air_temp_c: climate.air_temp_c,
          solar_rad: climate.solar_rad_wm2,
          wind_speed: climate.wind_speed_ms,
          green_roof_coverage: greenRoofPct,
          cool_roof_albedo_boost: coolRoofPct,
          tree_canopy_addition: treeCanopyPct,
          reflective_pavement_albedo: 0.15,
          water_feature_fraction: waterPct,
          wetness_factor: 0.60
        }).catch((e) => {
          console.warn("TreeSHAP explainability notice:", e);
          return null;
        }),
        api.getDiurnalProfile(areaId, activeScenario, {
          green_roof_pct: greenRoofPct,
          cool_roof_pct: coolRoofPct,
          tree_canopy_pct: treeCanopyPct,
          water_pct: waterPct
        })
      ]);

      setSimResult(res);
      setShapData(shap);
      setDiurnalData(diurnal);

      if (res.run_id && typeof window !== "undefined") {
        localStorage.setItem("urbancoolsim_latest_run_id", res.run_id);
      }

      // 4. Dynamically compute modality shares based on active intervention weights
      const crWeight = coolRoofPct * 4.8;
      const tcWeight = treeCanopyPct * 4.1;
      const grWeight = greenRoofPct * 2.8;
      const wfWeight = waterPct * 6.5;
      const totalWeight = crWeight + tcWeight + grWeight + wfWeight || 1.0;

      const crPct = Math.round((crWeight / totalWeight) * 100);
      const tcPct = Math.round((tcWeight / totalWeight) * 100);
      const grPct = Math.round((grWeight / totalWeight) * 100);
      const wfPct = Math.max(1, 100 - crPct - tcPct - grPct);

      setModalityData([
        { name: "Cool Roofs (Albedo)", value: crPct, color: "#4A6CFF" },
        { name: "Tree Canopy (Shading)", value: tcPct, color: "#10B981" },
        { name: "Green Roofs (ET Flux)", value: grPct, color: "#3B55CC" },
        { name: "Water Features (Sink)", value: wfPct, color: "#06B6D4" }
      ]);

      // 5. Calculate or update ROI values
      const effDeltaT = Math.abs(res.delta_t_mean || 4.71);
      const hvacKwh = activeSol?.hvac_energy_savings_kwh ?? Math.round(effDeltaT * 30150);
      const capex = activeSol?.total_capex_usd ?? activeSol?.total_cost_usd ?? 345000;
      const carbon = activeSol?.co2_avoided_tons ?? parseFloat((hvacKwh * 0.00072).toFixed(1));

      setHvacSavedKwh(hvacKwh);
      setCapexBudgetUsd(capex);
      setCarbonOffsetTons(carbon);

    } catch (err) {
      setSimResult(null);
      setError(err instanceof Error ? err.message : "Failed to load simulation results");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResetToCountryDefault = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(`urbancoolsim_active_solution_${studyArea}`);
      try {
        const glob = localStorage.getItem("urbancoolsim_active_solution");
        if (glob) {
          const parsed = JSON.parse(glob);
          if (!parsed.study_area_id || parsed.study_area_id === studyArea) {
            localStorage.removeItem("urbancoolsim_active_solution");
          }
        }
      } catch (_) {}
      loadData(studyArea);
    }
  };

  useEffect(() => {
    const savedArea = localStorage.getItem("urbancoolsim_study_area") || "delhi_cp";
    setStudyArea(savedArea);
    loadData(savedArea);

    const handleAreaChange = (e: any) => {
      if (e.detail) {
        setStudyArea(e.detail);
        loadData(e.detail);
      }
    };

    const handleSolutionApplied = () => {
      const currentArea = localStorage.getItem("urbancoolsim_study_area") || "delhi_cp";
      loadData(currentArea);
    };

    window.addEventListener("studyAreaChanged", handleAreaChange);
    window.addEventListener("solutionApplied", handleSolutionApplied);
    return () => {
      window.removeEventListener("studyAreaChanged", handleAreaChange);
      window.removeEventListener("solutionApplied", handleSolutionApplied);
    };
  }, []);

  const deltaT = simResult?.delta_t_mean ?? diurnalData?.max_cooling_c ?? 4.71;
  const baselineT = diurnalData?.peak_baseline_t ?? simResult?.baseline_t_mean ?? 63.3;
  const scenarioT = diurnalData?.peak_scenario_t ?? simResult?.scenario_t_mean ?? 58.6;

  const annualSavingsUsd = Math.round(hvacSavedKwh * tariffRate);
  const paybackYears = annualSavingsUsd > 50 
    ? parseFloat((capexBudgetUsd / annualSavingsUsd).toFixed(1)) 
    : 0.0;

  // Compute dynamic Y-axis domain so peaks (e.g. 63.3°C) are never clipped
  const allTemps = (diurnalData?.diurnal_curve || []).flatMap(p => [
    p.air_temp_c, 
    p.baseline_surface_temp_c, 
    p.scenario_surface_temp_c
  ]).filter(v => typeof v === "number" && !isNaN(v));

  const yMin = allTemps.length ? Math.floor(Math.min(...allTemps) - 3) : 22;
  const yMax = allTemps.length ? Math.ceil(Math.max(...allTemps) + 4) : 68;

  return (
    <div className="flex flex-col min-h-screen bg-surface-base text-ink-primary select-none">
      <Header 
        title="Simulation Results & Diurnal Analytics" 
        subtitle="24-Hour Microclimate Physics, Modality Breakdown & AI Explainability" 
        onStudyAreaChange={(id) => {
          setStudyArea(id);
          loadData(id);
        }}
      />

      <div className="p-5 sm:p-7 max-w-7xl mx-auto w-full space-y-6">
        {error && (
          <div className="p-4 rounded-lg bg-status-critical/10 border border-status-critical/30 flex items-start justify-between gap-3 text-xs">
            <div className="flex items-start gap-2 text-status-critical">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Simulation Analysis Unavailable</p>
                <p className="text-ink-secondary mt-0.5 font-mono">{error}</p>
              </div>
            </div>
            <button
              onClick={() => loadData(studyArea)}
              className="px-3 py-1 rounded bg-status-critical/20 hover:bg-status-critical/30 text-status-critical font-medium shrink-0 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {/* Results Header & Pull KPIs */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-surface-border/60">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-label text-cobalt">
                Thermodynamic Synthesis
              </span>
              {isOptimizedActive && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <Sparkles className="w-2.5 h-2.5" />
                  NSGA-II Candidate #{candidateId} Active
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
              Diurnal Temperature Profile & Impact Analytics
            </h1>
            <p className="text-xs text-ink-secondary max-w-xl leading-relaxed">
              Equilibrium thermodynamic temperatures across 2,500 grid cells paired with 24-hour diurnal curves, 
              modality cooling shares, and TreeSHAP causal feature attributions.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-ink-dim">
              <Layers className="w-3.5 h-3.5 text-cobalt" />
              <span>Active Simulation Strategy:</span>
              <strong className="text-ink-primary font-medium">{activeStrategyTitle}</strong>
              {isOptimizedActive && (
                <button
                  onClick={handleResetToCountryDefault}
                  className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded text-[10px] font-medium text-cobalt bg-cobalt/10 hover:bg-cobalt/20 border border-cobalt/30 transition-colors cursor-pointer"
                  title="Reset to database default hybrid portfolio for this country"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Reset to Country Default
                </button>
              )}
            </div>
          </div>

          <div className="flex items-baseline gap-6 shrink-0 tabular-nums">
            <div>
              <span className="text-label text-ink-dim block mb-0.5">Baseline Peak</span>
              <div className="flex items-baseline gap-0.5">
                <AnimatedCounter value={baselineT} decimals={1} className="editorial-headline text-3xl text-ink-primary tracking-tight" />
                <span className="text-xs text-ink-muted font-serif ml-0.5">°C</span>
              </div>
            </div>
            <div className="h-8 w-px bg-surface-border" />
            <div>
              <span className="text-label text-ink-dim block mb-0.5">Scenario Peak</span>
              <div className="flex items-baseline gap-0.5">
                <AnimatedCounter value={scenarioT} decimals={1} className="editorial-headline text-3xl text-ink-primary tracking-tight" />
                <span className="text-xs text-ink-muted font-serif ml-0.5">°C</span>
              </div>
            </div>
            <div className="h-8 w-px bg-surface-border" />
            <div>
              <span className="text-label text-ink-dim block mb-0.5">Mean Cooling</span>
              <div className="flex items-baseline gap-0.5">
                <span className="editorial-headline text-3xl text-cobalt tracking-tight">−</span>
                <AnimatedCounter value={deltaT} decimals={2} className="editorial-headline text-3xl text-cobalt tracking-tight" />
                <span className="text-xs text-ink-muted font-serif ml-0.5">°C</span>
              </div>
            </div>
          </div>
        </div>

        {/* 24-Hour Diurnal Temperature Profile Chart */}
        <div className="graphite-card p-5 sm:p-6 rounded-lg space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-surface-border pb-3">
            <div>
              <h2 className="text-xs font-semibold text-ink-primary">
                24-Hour Diurnal Temperature Profile (SEB Modelled)
              </h2>
              <p className="text-[11px] text-ink-dim mt-0.5">
                Tracks diurnal surface temperature evolution, peak afternoon suppression, and nocturnal heat release
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-ink-muted">
              <span className="flex items-center gap-1.5 text-status-critical text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-status-critical" /> Baseline LST
              </span>
              <span className="flex items-center gap-1.5 text-cobalt text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-cobalt" /> Mitigated LST
              </span>
              <span className="flex items-center gap-1.5 text-ink-dim text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-ink-dim" /> Ambient Air (Ta)
              </span>
            </div>
          </div>

          <div className="h-72 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={diurnalData?.diurnal_curve || []} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0}/>
                  </linearGradient>
                  <linearGradient id="scenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4A6CFF" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#4A6CFF" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="time_label" 
                  stroke="#5E6678" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255, 255, 255, 0.08)" }}
                />
                <YAxis 
                  stroke="#5E6678" 
                  fontSize={10} 
                  unit="°C" 
                  domain={[yMin, yMax]}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255, 255, 255, 0.08)" }}
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const p = payload[0].payload;
                      return (
                        <div className="graphite-card p-3 rounded-md text-xs space-y-1 font-mono shadow-floating">
                          <div className="text-ink-primary font-medium flex items-center justify-between gap-4">
                            <span>{p.time_label} Local</span>
                            <span className="text-[10px] text-ink-dim">{p.solar_radiation_wm2} W/m²</span>
                          </div>
                          <div className="text-status-critical text-[11px]">Baseline: <strong>{p.baseline_surface_temp_c}°C</strong></div>
                          <div className="text-cobalt text-[11px]">Mitigated: <strong>{p.scenario_surface_temp_c}°C</strong></div>
                          <div className="text-ink-dim text-[11px]">Ambient: <strong>{p.air_temp_c}°C</strong></div>
                          <div className="text-status-safe pt-1 border-t border-surface-border font-medium text-[11px]">
                            Cooling: −{p.cooling_benefit_c}°C
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="baseline_surface_temp_c" stroke="#ef4444" strokeWidth={1.5} fill="url(#baseGrad)" name="Baseline LST" />
                <Area type="monotone" dataKey="scenario_surface_temp_c" stroke="#4A6CFF" strokeWidth={1.5} fill="url(#scenGrad)" name="Scenario LST" />
                <Area type="monotone" dataKey="air_temp_c" stroke="#5E6678" strokeDasharray="3 3" fill="none" name="Air Temp" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2-Column: Modality Breakdown + Energy ROI Model */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Modality Breakdown */}
          <div className="lg:col-span-6 graphite-card p-5 sm:p-6 rounded-lg space-y-4">
            <div className="flex justify-between items-center border-b border-surface-border pb-2">
              <h3 className="text-xs font-semibold text-ink-primary">
                Cooling Contribution by Modality
              </h3>
              <PieIcon className="w-3.5 h-3.5 text-cobalt" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={modalityData}
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={68}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {modalityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-1.5 text-xs tabular-nums">
                {modalityData.map((m) => (
                  <div key={m.name} className="flex justify-between items-center py-1 border-b border-surface-border/30">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                      <span className="text-ink-secondary text-[11px]">{m.name}</span>
                    </div>
                    <span className="font-mono text-ink-primary font-medium">{m.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* HVAC & Economic ROI Sandbox */}
          <div className="lg:col-span-6 graphite-card p-5 sm:p-6 rounded-lg space-y-4">
            <div className="flex justify-between items-center border-b border-surface-border pb-2">
              <h3 className="text-xs font-semibold text-ink-primary">
                Infrastructure & Energy ROI Model
              </h3>
              <Zap className="w-3.5 h-3.5 text-status-high" />
            </div>

            <div className="p-2.5 rounded-lg surface-inset space-y-1 text-xs tabular-nums">
              <div className="flex justify-between items-baseline">
                <span className="text-ink-secondary flex items-center gap-1.5 text-[11px]">
                  <Sliders className="w-3 h-3 text-ink-dim" /> Commercial Tariff:
                </span>
                <span className="font-mono text-ink-primary font-medium">${tariffRate.toFixed(2)} / kWh</span>
              </div>
              <input
                type="range" min="0.06" max="0.25" step="0.01" value={tariffRate}
                onChange={(e) => setTariffRate(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${((tariffRate - 0.06) / (0.25 - 0.06)) * 100}%, var(--surface-hover) ${((tariffRate - 0.06) / (0.25 - 0.06)) * 100}%, var(--surface-hover) 100%)`
                }}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs tabular-nums">
              <div className="p-2.5 rounded-lg surface-inset space-y-0.5">
                <span className="text-[9px] font-mono text-ink-dim uppercase block">HVAC Saved</span>
                <strong className="text-sm font-mono text-ink-primary font-medium">{hvacSavedKwh.toLocaleString("en-US")} kWh</strong>
                <span className="text-[10px] text-ink-dim block">Chiller energy reduction</span>
              </div>

              <div className="p-2.5 rounded-lg surface-inset space-y-0.5">
                <span className="text-[9px] font-mono text-ink-dim uppercase block">Annual Savings</span>
                <div className="text-sm font-mono text-status-safe font-medium">
                  $<AnimatedCounter value={annualSavingsUsd} decimals={0} /> /yr
                </div>
                <span className="text-[10px] text-ink-dim block">Commercial tariffs</span>
              </div>

              <div className="p-2.5 rounded-lg surface-inset space-y-0.5">
                <span className="text-[9px] font-mono text-ink-dim uppercase block">Avoided Carbon</span>
                <strong className="text-sm font-mono text-ink-primary font-medium">{carbonOffsetTons} tCO₂e/yr</strong>
                <span className="text-[10px] text-ink-dim block">Scope 2 offset</span>
              </div>

              <div className="p-2.5 rounded-lg surface-inset space-y-0.5">
                <span className="text-[9px] font-mono text-ink-dim uppercase block">CapEx Payback</span>
                <div className="text-sm font-mono text-ink-primary font-medium">
                  <AnimatedCounter value={paybackYears} decimals={1} /> Years
                </div>
                <span className="text-[10px] text-ink-dim block">Excl. carbon credits</span>
              </div>
            </div>
          </div>
        </div>

        {/* TreeSHAP Waterfall Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8">
            <ShapWaterfallChart data={shapData?.features || undefined} />
          </div>

          <div className="lg:col-span-4 graphite-card p-5 rounded-lg space-y-2.5 text-xs">
            <div className="border-b border-surface-border pb-2">
              <h3 className="text-xs font-semibold text-ink-primary">TreeSHAP Explainability</h3>
            </div>

            <p className="text-ink-secondary leading-relaxed text-[11px]">
              SHAP values quantify the exact marginal contribution of each urban intervention parameter 
              toward the final simulated temperature drop of <strong className="text-ink-primary font-medium">−{deltaT.toFixed(2)}°C</strong>.
            </p>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              Positive values (blue) indicate variables that reflect shortwave solar influx or increase latent heat transpiration, 
              while negative values (red) denote morphology drivers like building density that increase thermal storage.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
