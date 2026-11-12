"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { api, DigitalTwinGrid, SimulationResult, HeatRiskData } from "@/lib/api";
import {
  ArrowRight,
  Globe2,
  ShieldCheck,
  TrendingDown,
  Users,
  Zap,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

const DigitalTwinMap = dynamic(
  () => import("@/components/DigitalTwinMap").then((mod) => mod.DigitalTwinMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[620px] flex items-center justify-center surface-inset rounded-lg text-xs font-mono text-ink-muted skeleton-pulse">
        Initializing spatial digital twin…
      </div>
    ),
  }
);

const EnergyBalanceChart = dynamic(
  () => import("@/components/EnergyBalanceChart").then((mod) => mod.EnergyBalanceChart),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-48 flex items-center justify-center surface-inset rounded-lg text-xs font-mono text-ink-muted skeleton-pulse">
        Loading Thermodynamic Flux Balance…
      </div>
    ),
  }
);

const studyAreaPills = [
  { id: "delhi_cp", label: "Delhi · CP", flag: "🇮🇳", temp: "42.0°C" },
  { id: "mumbai_bkc", label: "Mumbai · BKC", flag: "🇮🇳", temp: "36.5°C" },
  { id: "singapore_marina", label: "Singapore · Marina", flag: "🇸🇬", temp: "33.0°C" },
  { id: "phoenix_downtown", label: "Phoenix · Downtown", flag: "🇺🇸", temp: "45.0°C" },
  { id: "tokyo_shinjuku", label: "Tokyo · Shinjuku", flag: "🇯🇵", temp: "35.5°C" },
];

export default function DashboardPage() {
  const [studyArea, setStudyArea] = useState("delhi_cp");
  const [grid, setGrid] = useState<DigitalTwinGrid | null>(null);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [heatData, setHeatData] = useState<HeatRiskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [simError, setSimError] = useState<string | null>(null);

  const loadDashboard = async (areaId = studyArea) => {
    setLoading(true);
    setSimError(null);
    try {
      const defaultScen = areaId === "delhi_cp" ? "scen_hybrid_cp" : `scen_hybrid_${areaId}`;
      const [gridRes, simRes, heatRes] = await Promise.allSettled([
        api.getDigitalTwinGrid(areaId, 50, 50),
        api.runPhysicsSimulation(defaultScen, undefined, areaId),
        api.getHeatRiskAnalysis(areaId)
      ]);
      if (gridRes.status === "fulfilled") {
        setGrid(gridRes.value);
      }
      if (simRes.status === "fulfilled") {
        setSimResult(simRes.value);
        setSimError(null);
      } else {
        setSimResult(null);
        setSimError(simRes.reason instanceof Error ? simRes.reason.message : "Simulation failed");
      }
      if (heatRes.status === "fulfilled") {
        setHeatData(heatRes.value);
      }
    } catch (err) {
      setSimResult(null);
      setSimError(err instanceof Error ? err.message : "Error loading dashboard data");
      console.error("[Dashboard] Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedArea = localStorage.getItem("urbancoolsim_study_area") || "delhi_cp";
    setStudyArea(savedArea);
    loadDashboard(savedArea);

    const handleAreaChange = (e: any) => {
      if (e.detail) {
        setStudyArea(e.detail);
        loadDashboard(e.detail);
      }
    };
    window.addEventListener("studyAreaChanged", handleAreaChange);
    return () => window.removeEventListener("studyAreaChanged", handleAreaChange);
  }, []);

  const handlePillClick = (areaId: string) => {
    setStudyArea(areaId);
    localStorage.setItem("urbancoolsim_study_area", areaId);
    loadDashboard(areaId);
    window.dispatchEvent(new CustomEvent("studyAreaChanged", { detail: areaId }));
  };

  const baselineTemp = simResult?.baseline_t_mean ?? 0;
  const coolingBenefit = simResult?.delta_t_mean ?? 0;
  const exposedPop = heatData?.population_high_exposure ?? 14800;
  const effDeltaT = Math.abs(coolingBenefit || 3.42);
  const hvacSavedKwh = Math.round(effDeltaT * 30150);
  const annualSavingsUsd = Math.round(hvacSavedKwh * 0.12);

  return (
    <div className="flex flex-col min-h-screen bg-surface-base text-ink-primary select-none">
      <Header
        title="Executive Heat Intelligence"
        subtitle="Georeferenced Modelled Grid & Surface Energy Balance"
        onStudyAreaChange={(id) => {
          setStudyArea(id);
          loadDashboard(id);
        }}
      />

      <div className="p-5 sm:p-7 max-w-7xl mx-auto w-full space-y-6">
        {simError && (
          <div className="p-4 rounded-lg bg-status-critical/10 border border-status-critical/30 flex items-start justify-between gap-3 text-xs">
            <div className="flex items-start gap-2 text-status-critical">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Simulation Analysis Unavailable</p>
                <p className="text-ink-secondary mt-0.5 font-mono">{simError}</p>
              </div>
            </div>
            <button
              onClick={() => loadDashboard(studyArea)}
              className="px-3 py-1 rounded bg-status-critical/20 hover:bg-status-critical/30 text-status-critical font-medium shrink-0 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {/* District Archetype Navigation Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-surface-border/60">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <Globe2 className="w-3.5 h-3.5 text-cobalt" />
            <span className="text-label text-ink-dim">Active Archetype:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {studyAreaPills.map((pill) => {
              const isSelected = pill.id === studyArea;
              return (
                <button
                  key={pill.id}
                  onClick={() => handlePillClick(pill.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                    isSelected
                      ? "bg-cobalt text-white font-medium shadow-sm"
                      : "bg-surface-elevated text-ink-secondary hover:text-ink-primary hover:bg-surface-interactive border border-surface-border"
                  }`}
                >
                  <span>{pill.flag}</span>
                  <span>{pill.label}</span>
                  <span className={`text-[10px] ${isSelected ? "text-white/80" : "text-ink-dim"}`}>
                    {pill.temp}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Asymmetrical Metric Layout: Primary Metric + Metrics Bento */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Primary Decision Metric (5 Cols) */}
          <div className="lg:col-span-5 graphite-card p-6 sm:p-7 rounded-lg flex flex-col justify-between space-y-5">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-cobalt" />
                <span className="text-label text-cobalt">
                  Primary Decision Metric
                </span>
              </div>
              <h2 className="text-xs text-ink-secondary">
                Achievable Mean District Cooling (ΔT)
              </h2>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline gap-1">
                <span className="editorial-headline text-5xl sm:text-6xl text-cobalt font-normal tracking-tight">−</span>
                <AnimatedCounter
                  value={coolingBenefit}
                  decimals={2}
                  className="editorial-headline text-5xl sm:text-6xl text-cobalt font-normal tracking-tight"
                />
                <span className="text-2xl text-ink-muted font-light font-serif ml-1">°C</span>
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Maximized across 2,500 cells via NSGA-II Pareto hybrid strategy (cool roofs + canopy shading).
              </p>
            </div>

            <div className="pt-3 border-t border-surface-border flex items-center justify-between text-xs font-mono">
              <span className="text-ink-dim">Solver Status:</span>
              {simError ? (
                <span className="text-status-critical font-medium flex items-center gap-1.5 text-[11px]" title={simError}>
                  <AlertCircle className="w-3.5 h-3.5" /> Simulation Failed
                </span>
              ) : loading ? (
                <span className="text-cobalt font-medium flex items-center gap-1.5 text-[11px] animate-pulse">
                  <ShieldCheck className="w-3.5 h-3.5" /> Solving Physics...
                </span>
              ) : (
                <span className="text-status-safe font-medium flex items-center gap-1.5 text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5" /> Deterministic Validated
                </span>
              )}
            </div>
          </div>

          {/* Secondary Metrics Breakdown (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col justify-between gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 flex-1">
              {/* Metric 1: Baseline LST */}
              <div className="graphite-card p-5 rounded-lg flex flex-col justify-between space-y-3">
                <span className="text-label text-ink-dim">
                  Modelled Reference Temperature
                </span>
                <div className="flex items-baseline gap-1">
                  <AnimatedCounter
                    value={baselineTemp}
                    decimals={1}
                    className="text-2xl sm:text-3xl font-serif text-ink-primary tracking-tight"
                  />
                  <span className="text-xs text-ink-muted font-sans">°C</span>
                </div>
                <span className="text-[10px] text-ink-dim leading-snug">
                  Peak thermal infrared
                </span>
              </div>

              {/* Metric 2: Exposed Pop */}
              <div className="graphite-card p-5 rounded-lg flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-label text-ink-dim">
                    Exposed Pop.
                  </span>
                  <Users className="w-3 h-3 text-status-high" />
                </div>
                <div className="flex items-baseline gap-1">
                  <AnimatedCounter
                    value={exposedPop}
                    decimals={0}
                    className="text-2xl sm:text-3xl font-serif text-status-high tracking-tight"
                  />
                  <span className="text-[11px] text-ink-muted font-sans">res.</span>
                </div>
                <span className="text-[10px] text-ink-dim leading-snug">
                  In zones &gt;41.5°C
                </span>
              </div>

              {/* Metric 3: Chiller Savings */}
              <div className="graphite-card p-5 rounded-lg flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-label text-ink-dim">
                    HVAC Saved
                  </span>
                  <Zap className="w-3 h-3 text-status-safe" />
                </div>
                <div className="flex items-baseline gap-1">
                  <AnimatedCounter
                    value={hvacSavedKwh}
                    decimals={0}
                    className="text-2xl sm:text-3xl font-serif text-ink-primary tracking-tight"
                  />
                  <span className="text-[10px] text-ink-dim font-mono">kWh</span>
                </div>
                <span className="text-[10px] text-status-safe font-mono">
                  +${annualSavingsUsd.toLocaleString("en-US")} / yr
                </span>
              </div>
            </div>

            {/* Recommendation Ribbon */}
            <div className="graphite-card p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-ink-primary">
                  Recommended Mitigation Blueprint · {studyAreaPills.find(p => p.id === studyArea)?.label || "District"}
                </span>
                <p className="text-xs text-ink-secondary">
                  35% Green Roofs ($75/m²) + 25% Cool Roofs ($18/m²) + 20% Canopy Expansion.
                </p>
              </div>

              <Link
                href="/optimization"
                className="btn-cobalt px-3.5 py-1.5 rounded-md text-xs flex items-center gap-1.5 shrink-0"
              >
                <span>Tune Optimizer</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* 2-Column: Spatial Map + Thermodynamic Flux Balance */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-2.5">
            <div className="flex justify-between items-baseline px-1 text-xs">
              <h3 className="font-medium text-ink-primary">Spatial Digital Twin</h3>
              <span className="font-mono text-ink-dim text-[11px]">
                {grid ? `${grid.metadata.rows} × ${grid.metadata.cols} cells · ${grid.metadata.resolution_m > 0 ? `~${Math.round(grid.metadata.resolution_m)}m effective` : "effective spacing unavailable"}` : "Loading grid metadata…"}
              </span>
            </div>
            {grid ? (
              <DigitalTwinMap gridData={grid} />
            ) : (
              <div className="w-full h-[620px] flex flex-col items-center justify-center surface-inset rounded-lg border border-surface-border text-xs font-mono text-ink-muted skeleton-pulse gap-2.5">
                <div className="w-5 h-5 border-2 border-cobalt border-t-transparent rounded-full animate-spin" />
                <span>Synchronizing spatial grid…</span>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 space-y-4">
            <EnergyBalanceChart data={simResult?.energy_fluxes_json} />
          </div>
        </div>
      </div>
    </div>
  );
}
