"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { EnergyBalanceChart } from "@/components/EnergyBalanceChart";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { api, SimulationResult, DEFAULT_STUDY_AREAS } from "@/lib/api";
import { Wind, Sun, Thermometer, AlertCircle, RefreshCw } from "lucide-react";

export default function ThermalAnalysisPage() {
  const [studyArea, setStudyArea] = useState("delhi_cp");
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [airTemp, setAirTemp] = useState<number>(42.0);
  const [solarRad, setSolarRad] = useState<number>(900);
  const [windSpeed, setWindSpeed] = useState<number>(2.5);

  const loadThermal = async (areaId = studyArea) => {
    setLoading(true);
    setError(null);
    try {
      const defaultScen = areaId === "delhi_cp" ? "scen_hybrid_cp" : `scen_hybrid_${areaId}`;
      const res = await api.runPhysicsSimulation(defaultScen, {
        air_temp: airTemp,
        solar_rad: solarRad,
        wind_speed: windSpeed,
      }, areaId);
      setSimResult(res);
      if (res.run_id && typeof window !== "undefined") {
        localStorage.setItem("urbancoolsim_latest_run_id", res.run_id);
      }
    } catch (err) {
      setSimResult(null);
      setError(err instanceof Error ? err.message : "Failed to run simulation");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedArea = localStorage.getItem("urbancoolsim_study_area") || "delhi_cp";
    setStudyArea(savedArea);
    const meta = DEFAULT_STUDY_AREAS.find((s) => s.id === savedArea) || DEFAULT_STUDY_AREAS[0];
    setAirTemp(meta.base_climate.air_temp_c);
    setSolarRad(meta.base_climate.solar_rad_wm2);
    setWindSpeed(meta.base_climate.wind_speed_ms);

    const handleAreaChange = (e: any) => {
      if (e.detail) {
        setStudyArea(e.detail);
        const areaMeta = DEFAULT_STUDY_AREAS.find((s) => s.id === e.detail) || DEFAULT_STUDY_AREAS[0];
        setAirTemp(areaMeta.base_climate.air_temp_c);
        setSolarRad(areaMeta.base_climate.solar_rad_wm2);
        setWindSpeed(areaMeta.base_climate.wind_speed_ms);
        loadThermal(e.detail);
      }
    };
    window.addEventListener("studyAreaChanged", handleAreaChange);
    return () => window.removeEventListener("studyAreaChanged", handleAreaChange);
  }, []);

  // Debounced physics simulation execution on slider changes
  useEffect(() => {
    const timer = setTimeout(() => {
      loadThermal(studyArea);
    }, 150);
    return () => clearTimeout(timer);
  }, [airTemp, solarRad, windSpeed, studyArea]);

  const fluxes = simResult?.energy_fluxes_json || {
    Q_star_mean: 0,
    Q_f_mean: 0,
    Q_h_mean: 0,
    Q_e_mean: 0,
    dQs_mean: 0,
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface-base text-ink-primary select-none">
      <Header 
        title="Surface Energy Balance Analysis" 
        subtitle="First-Principles Thermodynamic Physics Engine" 
        onStudyAreaChange={(id) => {
          setStudyArea(id);
          loadThermal(id);
        }}
      />

      <div className="p-5 sm:p-7 max-w-7xl mx-auto w-full space-y-6">
        {error && (
          <div className="p-4 rounded-lg bg-status-critical/10 border border-status-critical/30 flex items-start justify-between gap-3 text-xs">
            <div className="flex items-start gap-2 text-status-critical">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Simulation Error</p>
                <p className="text-ink-secondary mt-0.5 font-mono">{error}</p>
              </div>
            </div>
            <button
              onClick={() => loadThermal(studyArea)}
              className="px-3 py-1 rounded bg-status-critical/20 hover:bg-status-critical/30 text-status-critical font-medium shrink-0 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {/* Header Statement */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-surface-border/60">
          <div className="space-y-1.5">
            <span className="text-label text-cobalt">
              Deterministic SEB Thermodynamics
            </span>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
              Thermodynamic Flux Decomposition
            </h1>
            <p className="text-xs text-ink-secondary max-w-xl leading-relaxed">
              Enforcing deterministic conservation of energy:{" "}
              <span className="text-ink-primary font-medium font-mono">
                Q* + Qf = Qh + Qe + ΔQs
              </span>
              . Sensible turbulent flux (Qh) heats pedestrian air, while latent flux (Qe) provides evaporative cooling.
            </p>
          </div>

          <div className="flex items-baseline gap-6 shrink-0 tabular-nums">
            <div>
              <span className="text-label text-ink-dim block mb-0.5">Net All-Wave Influx (Q*)</span>
              <div className="flex items-baseline gap-1">
                <AnimatedCounter value={fluxes.Q_star_mean} decimals={0} className="editorial-headline text-3xl text-ink-primary font-normal tracking-tight" />
                <span className="text-xs text-ink-dim font-mono">W/m²</span>
              </div>
            </div>
            <div className="h-8 w-px bg-surface-border" />
            <div>
              <span className="text-label text-ink-dim block mb-0.5">Sensible Heat (Qh)</span>
              <div className="flex items-baseline gap-1">
                <AnimatedCounter value={fluxes.Q_h_mean} decimals={0} className="editorial-headline text-3xl text-status-critical font-normal tracking-tight" />
                <span className="text-xs text-ink-dim font-mono">W/m²</span>
              </div>
            </div>
          </div>
        </div>

        {/* Boundary Condition Controls */}
        <div className="graphite-card p-5 sm:p-6 rounded-lg space-y-4">
          <div className="flex justify-between items-center border-b border-surface-border pb-3">
            <h3 className="text-xs font-semibold text-ink-primary">
              Atmospheric Boundary Conditions
            </h3>
            <span className={`text-label ${error ? "text-status-critical font-medium" : loading ? "text-cobalt animate-pulse" : "text-status-safe"}`}>
              {error ? "Simulation Failed" : loading ? "Solving SEB Equilibrium..." : "Newton-Raphson Active"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs tabular-nums">
            <div className="space-y-2 p-3 rounded-lg surface-inset">
              <div className="flex justify-between items-baseline">
                <span className="text-ink-secondary flex items-center gap-1.5 text-[11px]">
                  <Thermometer className="w-3.5 h-3.5 text-status-critical" /> Ambient Air Temp (Ta):
                </span>
                <span className="font-mono font-medium text-ink-primary">{airTemp.toFixed(1)}°C</span>
              </div>
              <input
                type="range" min="30" max="48" step="0.5" value={airTemp}
                onChange={(e) => setAirTemp(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${((airTemp - 30) / (48 - 30)) * 100}%, var(--surface-hover) ${((airTemp - 30) / (48 - 30)) * 100}%, var(--surface-hover) 100%)`
                }}
                className="w-full"
              />
            </div>

            <div className="space-y-2 p-3 rounded-lg surface-inset">
              <div className="flex justify-between items-baseline">
                <span className="text-ink-secondary flex items-center gap-1.5 text-[11px]">
                  <Sun className="w-3.5 h-3.5 text-status-high" /> Solar Downwelling:
                </span>
                <span className="font-mono font-medium text-ink-primary">{solarRad} W/m²</span>
              </div>
              <input
                type="range" min="400" max="1100" step="25" value={solarRad}
                onChange={(e) => setSolarRad(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${((solarRad - 400) / (1100 - 400)) * 100}%, var(--surface-hover) ${((solarRad - 400) / (1100 - 400)) * 100}%, var(--surface-hover) 100%)`
                }}
                className="w-full"
              />
            </div>

            <div className="space-y-2 p-3 rounded-lg surface-inset">
              <div className="flex justify-between items-baseline">
                <span className="text-ink-secondary flex items-center gap-1.5 text-[11px]">
                  <Wind className="w-3.5 h-3.5 text-cobalt" /> Canopy Wind Speed:
                </span>
                <span className="font-mono font-medium text-ink-primary">{windSpeed.toFixed(1)} m/s</span>
              </div>
              <input
                type="range" min="0.5" max="8.0" step="0.5" value={windSpeed}
                onChange={(e) => setWindSpeed(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${((windSpeed - 0.5) / (8.0 - 0.5)) * 100}%, var(--surface-hover) ${((windSpeed - 0.5) / (8.0 - 0.5)) * 100}%, var(--surface-hover) 100%)`
                }}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* 2-Column: Surface Energy Balance Breakdown + Technical Physics Notes */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8">
            <EnergyBalanceChart data={fluxes} />
          </div>

          <div className="lg:col-span-4 graphite-card p-5 rounded-lg space-y-3.5 text-xs font-mono">
            <div className="border-b border-surface-border pb-2">
              <h3 className="text-xs font-semibold text-ink-primary font-sans">Equilibrium Formulation</h3>
            </div>

            <div className="space-y-2.5 text-ink-secondary leading-relaxed">
              <div className="p-3 rounded-lg surface-inset text-center text-cobalt font-medium text-xs">
                f(Ts) = Q*(Ts) + Qf − Qh(Ts) − Qe(Ts) − ΔQs(Ts) = 0
              </div>
              <p className="text-[11px] font-sans text-ink-dim leading-relaxed">
                Solved cell-by-cell using Newton-Raphson iteration. Canopy aerodynamic resistance ra is coupled to building height H and roughness length z0 = 0.1 H.
              </p>

              {simResult?.energy_balance_residual !== undefined && (
                <div className="p-2.5 rounded-lg surface-inset flex justify-between items-center text-[11px] font-mono">
                  <span className="text-ink-secondary">Convergence Residual:</span>
                  <span className="text-status-safe font-semibold">
                    {Math.abs(simResult.energy_balance_residual).toFixed(4)} W/m²
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
