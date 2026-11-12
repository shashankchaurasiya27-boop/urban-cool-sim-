"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { api, DigitalTwinGrid, ParetoSolution, DEFAULT_STUDY_AREAS } from "@/lib/api";
import { 
  FileText, 
  Download, 
  Printer, 
  Map, 
  Table, 
  FileCode,
  FileCheck,
  Sparkles
} from "lucide-react";

const STUDY_AREA_BBOXES: Record<string, [number, number, number, number]> = {
  mumbai_bkc: [72.8610, 19.0590, 72.8756, 19.0724],
  delhi_cp: [77.2130, 28.6270, 77.2264, 28.6386],
  singapore_marina: [103.8495, 1.2780, 103.8635, 1.2914],
  phoenix_downtown: [-112.0810, 33.4420, -112.0670, 33.4548],
  tokyo_shinjuku: [139.6895, 35.6840, 139.7035, 35.6970],
};

export default function ReportsPage() {
  const [studyArea, setStudyArea] = useState("delhi_cp");
  const [reportMd, setReportMd] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [gridData, setGridData] = useState<DigitalTwinGrid | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);

  const loadReportAndData = async (areaId = studyArea) => {
    setLoading(true);
    try {
      const activeRunId = typeof window !== "undefined"
        ? (new URLSearchParams(window.location.search).get("run_id") || localStorage.getItem("urbancoolsim_latest_run_id") || undefined)
        : undefined;
      const [rep, grid] = await Promise.all([
        api.generateReport(areaId, activeRunId),
        api.getDigitalTwinGrid(areaId, 50, 50)
      ]);
      setReportMd(rep.markdown_content);
      setReportId(rep.id);
      setGridData(grid);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedArea = localStorage.getItem("urbancoolsim_study_area") || "delhi_cp";
    setStudyArea(savedArea);
    loadReportAndData(savedArea);

    const handleAreaChange = (e: any) => {
      if (e.detail) {
        setStudyArea(e.detail);
        loadReportAndData(e.detail);
      }
    };
    window.addEventListener("studyAreaChanged", handleAreaChange);
    return () => window.removeEventListener("studyAreaChanged", handleAreaChange);
  }, []);

  const handleExportCSV = () => {
    setDownloadingFormat("csv");
    if (gridData) {
      api.exportGridToCSV(gridData, `${studyArea}_microclimate_grid.csv`);
    }
    setTimeout(() => setDownloadingFormat(null), 1500);
  };

  const handleExportGeoJSON = () => {
    setDownloadingFormat("geojson");
    const activeAreaMeta = DEFAULT_STUDY_AREAS.find((a) => a.id === studyArea) || DEFAULT_STUDY_AREAS[0];
    const bbox = STUDY_AREA_BBOXES[studyArea] || STUDY_AREA_BBOXES["delhi_cp"];
    const latScale = Math.cos((activeAreaMeta.center_lat * Math.PI) / 180.0);
    const w = (bbox[2] - bbox[0]) * 111320 * latScale;
    const h = (bbox[3] - bbox[1]) * 111320;
    const studyAreaBboxAreaM2 = Math.round(w * h);

    const derivedArea = (gridData?.metadata as any)?.analysis_window_area_m2
      || activeAreaMeta.analysis_window_area_m2
      || ((gridData?.metadata?.effective_resolution_x_m && gridData?.metadata?.effective_resolution_y_m && gridData?.metadata?.total_cells)
        ? Math.round(gridData.metadata.total_cells * gridData.metadata.effective_resolution_x_m * gridData.metadata.effective_resolution_y_m)
        : (gridData?.metadata?.total_cells
            ? Math.round(gridData.metadata.total_cells * ((gridData.metadata.resolution_m || 10) ** 2))
            : studyAreaBboxAreaM2));

    const defaultSol: ParetoSolution = {
      solution_id: 1,
      green_roof_pct: 35.0,
      cool_roof_pct: 25.0,
      tree_canopy_pct: 20.0,
      water_pct: 5.0,
      delta_t_mean: 3.42,
      total_cost_usd: 345000,
      water_demand_m3: 4200,
      land_area_m2: derivedArea,
      heat_risk_score: 1.8,
      physics_validated: false,
      validated_delta_t: 3.42,
      validation_error: 0.04
    };
    api.exportInterventionsToGeoJSON(defaultSol, studyArea, `${studyArea}_mitigation_blueprint.geojson`);
    setTimeout(() => setDownloadingFormat(null), 1500);
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface-base text-ink-primary select-none">
      <Header 
        title="Executive Decision Reports & GIS Packages" 
        subtitle="Automated Infrastructure Recommendations, GeoJSON Vector Blueprints & PDF Export" 
        onStudyAreaChange={(id) => {
          setStudyArea(id);
          loadReportAndData(id);
        }}
      />

      <div className="p-5 sm:p-7 max-w-7xl mx-auto w-full space-y-6">
        {/* Header & Generation Action */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-surface-border/60">
          <div className="space-y-1.5">
            <span className="text-label text-cobalt">
              Municipal Handoff Documentation
            </span>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
              Decision-Support Packages & GIS Blueprints
            </h1>
            <p className="text-xs text-ink-secondary max-w-xl leading-relaxed">
              Synthesizes baseline thermodynamics, NSGA-II Pareto portfolio selections, capital expenditure budgets, 
              water demand quotas, and explicit model/data provenance into publication-ready dossiers.
            </p>
          </div>

          <button
            onClick={() => loadReportAndData()}
            disabled={loading}
            className="btn-cobalt px-4 py-2 rounded-md text-xs flex items-center gap-2 shrink-0 font-mono"
          >
            <Sparkles className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Compiling..." : "Regenerate Technical Report"}</span>
          </button>
        </div>

        {/* 3 Export Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Executive PDF */}
          <div className="graphite-card p-5 sm:p-6 rounded-lg space-y-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-md bg-status-critical/10 flex items-center justify-center text-status-critical">
                <FileText className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-ink-primary">Executive Decision PDF</h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Official publication-ready PDF with Surface Energy Balance equations, Pareto curves, and financial ROI metrics.
              </p>
            </div>
            {reportId ? (
              <a
                href={`/api/v1/reports/${reportId}/pdf`}
                download={`UrbanCoolSim_Executive_Report_${studyArea}.pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-cobalt w-full py-2 rounded-md text-xs flex items-center justify-center gap-1.5 font-mono"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF Dossier</span>
              </a>
            ) : (
              <span className="text-xs text-ink-dim font-mono">Compiling report ID…</span>
            )}
          </div>

          {/* Card 2: Vector GeoJSON */}
          <div className="graphite-card p-5 sm:p-6 rounded-lg space-y-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-md bg-cobalt/10 flex items-center justify-center text-cobalt">
                <Map className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-ink-primary">GIS Vector GeoJSON</h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Ready-to-import vector polygons and line strings with intervention attributes for ArcGIS and QGIS.
              </p>
            </div>
            <button
              onClick={handleExportGeoJSON}
              className="w-full py-2 rounded-md bg-surface-elevated hover:bg-surface-interactive border border-surface-border text-ink-primary text-xs font-mono transition-colors flex items-center justify-center gap-1.5"
            >
              {downloadingFormat === "geojson" ? (
                <FileCheck className="w-3.5 h-3.5 text-status-safe" />
              ) : (
                <FileCode className="w-3.5 h-3.5 text-cobalt" />
              )}
              <span>{downloadingFormat === "geojson" ? "Downloaded GeoJSON" : "Export GeoJSON Blueprint"}</span>
            </button>
          </div>

          {/* Card 3: CSV Microclimate Grid */}
          <div className="graphite-card p-5 sm:p-6 rounded-lg space-y-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-md bg-surface-interactive flex items-center justify-center text-ink-secondary">
                <Table className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-ink-primary">2,500 Cell Microgrid CSV</h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Tabular matrix of cell coordinates, baseline temperature, albedo, vegetation, and building morphology.
              </p>
            </div>
            <button
              onClick={handleExportCSV}
              className="w-full py-2 rounded-md bg-surface-elevated hover:bg-surface-interactive border border-surface-border text-ink-primary text-xs font-mono transition-colors flex items-center justify-center gap-1.5"
            >
              {downloadingFormat === "csv" ? (
                <FileCheck className="w-3.5 h-3.5 text-status-safe" />
              ) : (
                <Download className="w-3.5 h-3.5 text-ink-secondary" />
              )}
              <span>{downloadingFormat === "csv" ? "Downloaded CSV" : "Export CSV Matrix"}</span>
            </button>
          </div>
        </div>

        {/* Generated Report Viewer */}
        {reportMd && (
          <div className="graphite-card rounded-lg p-5 sm:p-6 space-y-3.5">
            <div className="flex justify-between items-center border-b border-surface-border pb-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-status-safe" />
                <span className="text-ink-primary font-medium">
                  Report #{reportId?.slice(0, 8) || "CP2026"} · {studyArea.toUpperCase()}
                </span>
              </div>

              <button
                onClick={() => window.print()}
                className="px-2.5 py-1 bg-surface-interactive hover:bg-surface-hover border border-surface-border text-ink-secondary hover:text-ink-primary rounded-md text-xs flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Document</span>
              </button>
            </div>

            <div className="surface-inset p-5 rounded-lg text-xs text-ink-secondary font-mono leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto">
              {reportMd}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
