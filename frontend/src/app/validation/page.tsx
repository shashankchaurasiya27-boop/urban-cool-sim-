"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { api, ValidationResponse } from "@/lib/api";
import { Activity, AlertTriangle, Info } from "lucide-react";

const ValidationScatterChart = dynamic(
  () => import("@/components/ValidationScatterChart").then((mod) => mod.ValidationScatterChart),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-80 flex items-center justify-center surface-inset rounded-lg text-xs font-mono text-ink-muted skeleton-pulse">
        Loading comparison chart…
      </div>
    ),
  }
);

export default function ValidationPage() {
  const [studyArea, setStudyArea] = useState("delhi_cp");
  const [valData, setValData] = useState<ValidationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadVal = async (areaId: string) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await api.runValidation(areaId);
      setValData(response);
    } catch (error) {
      setValData(null);
      setLoadError(error instanceof Error ? error.message : "Internal validation could not be completed.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const savedArea = localStorage.getItem("urbancoolsim_study_area") || "delhi_cp";
    setStudyArea(savedArea);
    void loadVal(savedArea);

    const handleAreaChange = (event: Event) => {
      const areaId = (event as CustomEvent<string>).detail;
      if (areaId) {
        setStudyArea(areaId);
        void loadVal(areaId);
      }
    };

    window.addEventListener("studyAreaChanged", handleAreaChange);
    return () => window.removeEventListener("studyAreaChanged", handleAreaChange);
  }, []);

  const showNumber = (value: number | undefined, decimals: number) =>
    value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(decimals);

  return (
    <div className="flex flex-col min-h-screen bg-surface-base text-ink-primary select-none">
      <Header
        title="Internal Validation & Self-Consistency"
        subtitle="Synthetic benchmark comparison · not independent satellite validation"
        onStudyAreaChange={(id) => {
          setStudyArea(id);
          void loadVal(id);
        }}
      />

      <div className="p-5 sm:p-7 max-w-7xl mx-auto w-full space-y-6">
        <div className="space-y-3 pb-6 border-b border-surface-border/60">
          <div className="flex items-center gap-2 text-xs font-mono text-amber-300">
            <Activity className="w-3.5 h-3.5" />
            <span className="text-label">Internal self-consistency check</span>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-baseline gap-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
                Synthetic Benchmark vs Simulated Baseline
              </h1>
              <p className="text-xs text-ink-secondary max-w-2xl mt-1 leading-relaxed">
                This endpoint creates a benchmark by adding seeded Gaussian noise to a simulated baseline field.
                The metrics measure internal self-consistency only; they do not establish accuracy against Landsat,
                ECOSTRESS, or other independent observations.
              </p>
            </div>

            <div className="flex items-baseline gap-6 shrink-0 tabular-nums">
              <div>
                <span className="text-label text-ink-dim block mb-0.5">Internal R²</span>
                {valData ? (
                  <AnimatedCounter value={valData.r2} decimals={3} className="editorial-headline text-3xl sm:text-4xl text-amber-300 font-normal tracking-tight" />
                ) : (
                  <span className="editorial-headline text-3xl sm:text-4xl text-ink-muted">{isLoading ? "…" : "—"}</span>
                )}
              </div>
              <div className="h-8 w-px bg-surface-border" />
              <div>
                <span className="text-label text-ink-dim block mb-0.5">MAE</span>
                <div className="flex items-baseline gap-0.5">
                  {valData ? (
                    <AnimatedCounter value={valData.mae} decimals={3} className="editorial-headline text-3xl sm:text-4xl text-ink-primary font-normal tracking-tight" />
                  ) : (
                    <span className="editorial-headline text-3xl sm:text-4xl text-ink-muted">{isLoading ? "…" : "—"}</span>
                  )}
                  <span className="text-xs text-ink-muted font-serif ml-0.5">°C</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {loadError && (
          <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/5 p-4 flex items-start gap-2 text-sm text-red-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Validation request failed</p>
              <p className="text-xs mt-1 text-red-100/80">{loadError}. No placeholder metrics are being shown.</p>
            </div>
          </div>
        )}

        <div className="graphite-card p-3 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
          <span className="text-label text-ink-dim">Result provenance</span>
          <div className="flex flex-wrap items-center gap-3.5 font-mono text-[11px]">
            <span className="text-amber-200">BENCHMARK: {valData?.observed_source ?? (isLoading ? "running" : "unavailable")}</span>
            <span className="text-ink-secondary">SIMULATION: baseline SEB field</span>
            <span className="text-ink-secondary">INDEPENDENT OBSERVATIONS: not used</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7">
            <ValidationScatterChart valData={valData ?? undefined} />
          </div>

          <div className="lg:col-span-5 graphite-card p-5 sm:p-6 rounded-lg space-y-4 text-xs tabular-nums">
            <div className="border-b border-surface-border pb-2">
              <h3 className="text-xs font-semibold text-ink-primary">Internal comparison summary</h3>
              <p className="text-[11px] text-ink-dim mt-0.5">
                {valData
                  ? `${(valData.provenance?.pixel_count ?? 0).toLocaleString("en-US")} valid cells in ${studyArea}; ${valData.provenance?.scatter_sample_count ?? valData.scatter_points?.length ?? 0} samples shown in the chart.`
                  : "Cell counts and metrics are shown only after the API returns a result."}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center py-1 border-b border-surface-border/30">
                <span className="text-ink-secondary">Internal coefficient of determination</span>
                <span className="font-mono text-amber-200 font-semibold">R² = {showNumber(valData?.r2, 3)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-surface-border/30">
                <span className="text-ink-secondary">Root mean squared error</span>
                <span className="font-mono text-ink-primary font-medium">{showNumber(valData?.rmse, 3)}°C</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-surface-border/30">
                <span className="text-ink-secondary">Mean absolute error</span>
                <span className="font-mono text-ink-primary font-medium">{showNumber(valData?.mae, 3)}°C</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-surface-border/30">
                <span className="text-ink-secondary">Mean bias error</span>
                <span className="font-mono text-ink-primary font-medium">{showNumber(valData?.mean_bias, 3)}°C</span>
              </div>
            </div>

            <div className="p-3 surface-inset rounded-lg text-xs space-y-1 border border-amber-300/15">
              <div className="flex items-center gap-1.5 text-amber-200 font-medium">
                <Info className="w-3.5 h-3.5" />
                <span>Interpretation boundary</span>
              </div>
              <p className="text-ink-dim text-[11px] leading-relaxed">
                {valData?.calibration_status ?? (isLoading ? "Computing the internal check…" : "No validation result is available.")}
              </p>
              <p className="text-ink-dim text-[11px] leading-relaxed">
                {valData?.provenance?.independent_observations_used === false
                  ? "This run used no independent satellite observations. Do not interpret its scores as real-world predictive accuracy."
                  : "Independent-observation provenance has not been established for this run."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
