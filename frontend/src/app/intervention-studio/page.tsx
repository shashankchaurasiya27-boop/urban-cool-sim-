"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { api, DigitalTwinGrid, DEFAULT_STUDY_AREAS } from "@/lib/api";
import { 
  Check,
  Sparkles,
} from "lucide-react";

const InterventionStudioMap = dynamic(
  () => import("@/components/InterventionStudioMap").then((mod) => mod.InterventionStudioMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center surface-inset rounded-lg text-xs font-mono text-ink-muted skeleton-pulse gap-2">
        <div className="w-4 h-4 border-2 border-cobalt border-t-transparent rounded-full animate-spin" />
        <span>Loading georeferenced district map…</span>
      </div>
    ),
  }
);

const STUDY_AREA_BBOXES: Record<string, [number, number, number, number]> = {
  mumbai_bkc: [72.8610, 19.0590, 72.8756, 19.0724],
  delhi_cp: [77.2130, 28.6270, 77.2264, 28.6386],
  singapore_marina: [103.8495, 1.2780, 103.8635, 1.2914],
  phoenix_downtown: [-112.0810, 33.4420, -112.0670, 33.4548],
  tokyo_shinjuku: [139.6895, 35.6840, 139.7035, 35.6970],
};

export default function InterventionStudioPage() {
  const [studyArea, setStudyArea] = useState("delhi_cp");
  const [grid, setGrid] = useState<DigitalTwinGrid | null>(null);

  // Intervention Parameters
  const [greenRoof, setGreenRoof] = useState(0.35);
  const [coolRoof, setCoolRoof] = useState(0.25);
  const [treeCanopy, setTreeCanopy] = useState(0.20);
  const [reflectPave, setReflectPave] = useState(0.15);
  const [waterFeat, setWaterFeat] = useState(0.05);

  const [targetZone, setTargetZone] = useState<string>("global");
  const [savedStatus, setSavedStatus] = useState(false);

  const loadGrid = async (areaId: string) => {
    try {
      const res = await api.getDigitalTwinGrid(areaId, 50, 50);
      setGrid(res);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const savedArea = localStorage.getItem("urbancoolsim_study_area") || "delhi_cp";
    setStudyArea(savedArea);
    loadGrid(savedArea);

    const handleAreaChange = (e: any) => {
      if (e.detail) {
        setStudyArea(e.detail);
        loadGrid(e.detail);
      }
    };
    window.addEventListener("studyAreaChanged", handleAreaChange);
    return () => window.removeEventListener("studyAreaChanged", handleAreaChange);
  }, []);

  // Dynamically derive district footprint from active digital twin grid or configured bounding box
  const studyAreaM2 = useMemo(() => {
    if (grid?.metadata?.analysis_window_area_m2) {
      return Math.round(grid.metadata.analysis_window_area_m2);
    }
    const activeMeta = DEFAULT_STUDY_AREAS.find((a) => a.id === studyArea) || DEFAULT_STUDY_AREAS[0];
    if (activeMeta.analysis_window_area_m2) {
      return activeMeta.analysis_window_area_m2;
    }
    if (grid?.metadata?.total_cells && grid?.metadata?.effective_resolution_x_m && grid?.metadata?.effective_resolution_y_m) {
      return Math.round(grid.metadata.total_cells * grid.metadata.effective_resolution_x_m * grid.metadata.effective_resolution_y_m);
    }
    if (grid?.metadata?.total_cells && grid?.metadata?.resolution_m) {
      return Math.round(grid.metadata.total_cells * (grid.metadata.resolution_m ** 2));
    }
    const bbox = STUDY_AREA_BBOXES[studyArea] || STUDY_AREA_BBOXES["delhi_cp"];
    const latScale = Math.cos((activeMeta.center_lat * Math.PI) / 180.0);
    const w = (bbox[2] - bbox[0]) * 111320 * latScale;
    const h = (bbox[3] - bbox[1]) * 111320;
    return Math.round(w * h);
  }, [grid, studyArea]);

  // Derive building density fraction from mapped grid layer if available
  const { avgBldgDensity, isBldgDensityMapped } = useMemo(() => {
    if (grid?.layers?.building_density && grid.layers.building_density.length > 0) {
      let sum = 0;
      let count = 0;
      for (const row of grid.layers.building_density) {
        for (const val of row) {
          sum += val;
          count++;
        }
      }
      if (count > 0 && sum > 0) {
        return {
          avgBldgDensity: Math.min(0.95, Math.max(0.05, sum / count)),
          isBldgDensityMapped: true,
        };
      }
    }
    return {
      avgBldgDensity: 0.45,
      isBldgDensityMapped: false,
    };
  }, [grid]);

  const bldgArea = studyAreaM2 * avgBldgDensity;
  const groundArea = studyAreaM2 - bldgArea;

  const greenRoofArea = bldgArea * greenRoof;
  const coolRoofArea = bldgArea * coolRoof;
  const treeArea = groundArea * treeCanopy;
  const paveArea = groundArea * reflectPave;
  const waterArea = groundArea * waterFeat;

  const costGreen = greenRoofArea * 75;
  const costCool = coolRoofArea * 18;
  const costTree = treeArea * 35;
  const costPave = paveArea * 22;
  const costWater = waterArea * 120;

  const totalCost = costGreen + costCool + costTree + costPave + costWater;
  const waterDemandM3 = (greenRoofArea * 450 + treeArea * 600 + waterArea * 1200) / 1000.0;
  const estimatedDeltaT = greenRoof * 1.8 + coolRoof * 2.5 + treeCanopy * 2.2 + reflectPave * 1.2 + waterFeat * 3.5;

  const handleSave = () => {
    if (typeof window !== "undefined") {
      const customParams = {
        study_area_id: studyArea,
        green_roof_coverage: greenRoof,
        cool_roof_albedo_boost: coolRoof,
        tree_canopy_addition: treeCanopy,
        reflective_pavement_albedo: reflectPave,
        water_feature_fraction: waterFeat,
        estimated_delta_t: estimatedDeltaT,
        total_capex_usd: totalCost,
        annual_water_demand_m3: waterDemandM3,
        target_zone: targetZone,
      };
      localStorage.setItem("urbancoolsim_custom_intervention", JSON.stringify(customParams));
    }
    setSavedStatus(true);
    setTimeout(() => setSavedStatus(false), 2000);
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface-base text-ink-primary select-none">
      <Header 
        title="Intervention Design Studio" 
        subtitle="Illustrative Intervention Planning Preview"
        onStudyAreaChange={(id) => {
          setStudyArea(id);
          loadGrid(id);
        }}
      />

      <div className="p-5 sm:p-7 max-w-7xl mx-auto w-full space-y-6">
        {/* Studio Header & Real-Time Impact Ribbon */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-surface-border/60">
          <div className="space-y-1.5">
            <span className="text-label text-cobalt">
              Intervention Preview Sandbox
            </span>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
              Design a Cooler Urban District
            </h1>
            <p className="text-xs text-ink-secondary max-w-xl leading-relaxed">
              Adjust intervention assumptions to preview the spatial pattern and planning costs. The heat field and cooling estimate are currently illustrative browser-side calculations, not a result from the backend SEB solver or AI surrogate.
            </p>
          </div>

          {/* Real-time Outcomes Ticker */}
          <div className="flex items-baseline gap-6 graphite-card p-3.5 rounded-lg tabular-nums">
            <div>
              <span className="text-label text-ink-dim block mb-0.5">Local Cooling Estimate</span>
              <div className="flex items-baseline gap-0.5">
                <span className="editorial-headline text-3xl text-cobalt tracking-tight">−</span>
                <AnimatedCounter value={estimatedDeltaT} decimals={2} className="editorial-headline text-3xl text-cobalt tracking-tight" />
                <span className="text-xs text-ink-muted font-serif ml-0.5">°C</span>
              </div>
            </div>
            <div className="h-8 w-px bg-surface-border" />
            <div>
              <span className="text-label text-ink-dim block mb-0.5">Estimated CapEx</span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-ink-muted text-sm">$</span>
                <AnimatedCounter value={Math.round(totalCost / 1000)} decimals={0} className="editorial-headline text-3xl text-ink-primary tracking-tight" />
                <span className="text-xs text-ink-muted font-sans ml-0.5">k</span>
              </div>
            </div>
            <div className="h-8 w-px bg-surface-border" />
            <div>
              <span className="text-label text-ink-dim block mb-0.5">Estimated Annual Water</span>
              <div className="flex items-baseline gap-0.5">
                <AnimatedCounter value={Math.round(waterDemandM3)} decimals={0} className="editorial-headline text-3xl text-ink-primary tracking-tight" />
                <span className="text-xs text-ink-muted font-sans ml-0.5">m³</span>
              </div>
            </div>
          </div>
        </div>

        {/* Spatial Zone Focus Pills */}
        <div className="graphite-card p-3 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
          <span className="text-label text-ink-dim">Spatial Focus Zone:</span>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "global", label: "Global (All District)" },
              { id: "zone4_dense", label: "Zone 4: Built-Up Core" },
              { id: "zone3_albedo", label: "Zone 3: Commercial Roofs" },
              { id: "zone1_green", label: "Zone 1: Shaded Corridors" }
            ].map((z) => (
              <button
                key={z.id}
                onClick={() => setTargetZone(z.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors ${
                  targetZone === z.id
                    ? "bg-cobalt text-white font-medium shadow-sm"
                    : "bg-surface-base text-ink-secondary border border-surface-border hover:text-ink-primary"
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main 2-Column Grid: Sandbox Controls + Live Canvas Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls Sandbox */}
          <div className="lg:col-span-7 graphite-card p-5 sm:p-6 rounded-lg space-y-4">
            <div className="flex justify-between items-center border-b border-surface-border pb-3">
              <h3 className="text-xs font-semibold text-ink-primary">Intervention Parameters</h3>
              <button 
                onClick={handleSave}
                className="btn-cobalt px-3 py-1 rounded-md text-xs flex items-center gap-1.5"
              >
                {savedStatus ? <Check className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{savedStatus ? "Preview Marked" : "Mark Preview"}</span>
              </button>
            </div>

            <div className="space-y-3.5 text-xs tabular-nums">
              {/* Green Roofs */}
              <div className="space-y-2.5 p-3 rounded-lg surface-inset">
                <div className="flex justify-between items-baseline">
                  <span className="font-medium text-ink-primary">Green Roof Coverage</span>
                  <span className="font-mono text-cobalt font-medium">+{Math.round(greenRoof * 100)}% roof area</span>
                </div>
                <input
                  type="range" min="0" max="0.80" step="0.05" value={greenRoof}
                  onChange={(e) => setGreenRoof(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${(greenRoof / 0.8) * 100}%, var(--surface-hover) ${(greenRoof / 0.8) * 100}%, var(--surface-hover) 100%)`
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-[11px] text-ink-muted">
                  <span>Rooftop evapotranspiration & latent flux</span>
                  <span>$75/m² · 450 L/m²/yr</span>
                </div>
              </div>

              {/* Cool Roofs */}
              <div className="space-y-2.5 p-3 rounded-lg surface-inset">
                <div className="flex justify-between items-baseline">
                  <span className="font-medium text-ink-primary">Cool Roofs High-Albedo Boost</span>
                  <span className="font-mono text-ink-primary font-medium">+{coolRoof.toFixed(2)} Δα</span>
                </div>
                <input
                  type="range" min="0" max="0.40" step="0.05" value={coolRoof}
                  onChange={(e) => setCoolRoof(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${(coolRoof / 0.4) * 100}%, var(--surface-hover) ${(coolRoof / 0.4) * 100}%, var(--surface-hover) 100%)`
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-[11px] text-ink-muted">
                  <span>High solar reflectance coatings</span>
                  <span>$18/m² · Zero water</span>
                </div>
              </div>

              {/* Urban Tree Canopy */}
              <div className="space-y-2.5 p-3 rounded-lg surface-inset">
                <div className="flex justify-between items-baseline">
                  <span className="font-medium text-ink-primary">Urban Tree Canopy Expansion</span>
                  <span className="font-mono text-cobalt font-medium">+{Math.round(treeCanopy * 100)}% ground</span>
                </div>
                <input
                  type="range" min="0" max="0.40" step="0.05" value={treeCanopy}
                  onChange={(e) => setTreeCanopy(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${(treeCanopy / 0.4) * 100}%, var(--surface-hover) ${(treeCanopy / 0.4) * 100}%, var(--surface-hover) 100%)`
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-[11px] text-ink-muted">
                  <span>Corridor shading & microclimate transpiration</span>
                  <span>$35/m² · 600 L/m²/yr</span>
                </div>
              </div>

              {/* Reflective Pavements */}
              <div className="space-y-2.5 p-3 rounded-lg surface-inset">
                <div className="flex justify-between items-baseline">
                  <span className="font-medium text-ink-primary">Reflective Street Pavements</span>
                  <span className="font-mono text-ink-primary font-medium">+{reflectPave.toFixed(2)} Δα</span>
                </div>
                <input
                  type="range" min="0" max="0.30" step="0.05" value={reflectPave}
                  onChange={(e) => setReflectPave(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${(reflectPave / 0.3) * 100}%, var(--surface-hover) ${(reflectPave / 0.3) * 100}%, var(--surface-hover) 100%)`
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-[11px] text-ink-muted">
                  <span>Street-level sensible heat mitigation</span>
                  <span>$22/m²</span>
                </div>
              </div>

              {/* Water Features */}
              <div className="space-y-2.5 p-3 rounded-lg surface-inset">
                <div className="flex justify-between items-baseline">
                  <span className="font-medium text-ink-primary">Urban Water Retention Bodies</span>
                  <span className="font-mono text-ink-primary font-medium">+{Math.round(waterFeat * 100)}% surface</span>
                </div>
                <input
                  type="range" min="0" max="0.15" step="0.01" value={waterFeat}
                  onChange={(e) => setWaterFeat(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${(waterFeat / 0.15) * 100}%, var(--surface-hover) ${(waterFeat / 0.15) * 100}%, var(--surface-hover) 100%)`
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-[11px] text-ink-muted">
                  <span>Evaporative heat sink</span>
                  <span>$120/m² · 1,200 L/m²/yr</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live 2D Canvas + CapEx Ledger */}
          <div className="lg:col-span-5 space-y-5">
            <div className="graphite-card p-4 rounded-lg space-y-2.5">
              <div className="flex justify-between items-baseline px-0.5 text-xs">
                <span className="text-label text-ink-dim">Modelled Field Preview</span>
                <span className="font-mono text-amber-300 flex items-center gap-1 text-[11px]">
                  <Sparkles className="w-3.5 h-3.5" /> Local preview · illustrative
                </span>
              </div>
              <div className="aspect-square bg-[#0b0f16] border border-surface-border rounded-lg overflow-hidden relative surface-inset">
                <InterventionStudioMap
                  studyArea={studyArea}
                  grid={grid}
                  greenRoof={greenRoof}
                  coolRoof={coolRoof}
                  treeCanopy={treeCanopy}
                  reflectPave={reflectPave}
                  waterFeat={waterFeat}
                  targetZone={targetZone}
                />
              </div>
              <div className="space-y-1.5 px-0.5">
                <div className="h-1.5 rounded-full" style={{ background: "linear-gradient(to right, #315e9f, #2991a4, #c2ba69, #dc844c, #b84b47)" }} />
                <div className="flex justify-between text-[9px] font-mono text-ink-muted">
                  <span>Cooler modelled cells</span>
                  <span>Warmer modelled cells</span>
                </div>
                <p className="text-[10px] leading-snug text-ink-dim">{grid?.metadata?.coverage_note || "Coverage metadata unavailable. Colours are illustrative, not observed LST."}</p>
                <p className="text-[10px] leading-snug text-amber-200/90">{grid?.metadata?.provenance_note || "Grid provenance unavailable; do not treat this preview as observed temperature."}</p>
              </div>
            </div>

            {/* Illustrative line-item accounting based on grounded district area */}
            <div className="graphite-card p-5 rounded-lg space-y-3 text-xs tabular-nums">
              <div className="border-b border-surface-border pb-2 space-y-1">
                <div className="flex justify-between items-baseline">
                  <h3 className="text-xs font-semibold text-ink-primary">District CapEx & Resource Accounting</h3>
                  <span className="font-mono text-[11px] text-cobalt font-medium">
                    {(studyAreaM2 / 10000).toFixed(1)} ha ({studyAreaM2.toLocaleString("en-US")} m²)
                  </span>
                </div>
                <p className="text-[10px] leading-snug text-ink-dim">
                  {isBldgDensityMapped
                    ? `Scaled to active grid footprint. Building density derived from digital twin layer: ${Math.round(avgBldgDensity * 100)}% (${Math.round(bldgArea).toLocaleString("en-US")} m² building footprint).`
                    : `Scaled to study area bounding box footprint. Standard planning building density assumed: 45% (${Math.round(bldgArea).toLocaleString("en-US")} m² building footprint).`}
                </p>
              </div>

              <div className="space-y-1.5 text-ink-secondary">
                <div className="flex justify-between items-center py-1 border-b border-surface-border/30">
                  <span>Green Roofs ({Math.round(greenRoofArea).toLocaleString("en-US")} m²)</span>
                  <span className="font-mono text-ink-primary">${Math.round(costGreen).toLocaleString("en-US")}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-surface-border/30">
                  <span>Cool Roofs ({Math.round(coolRoofArea).toLocaleString("en-US")} m²)</span>
                  <span className="font-mono text-ink-primary">${Math.round(costCool).toLocaleString("en-US")}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-surface-border/30">
                  <span>Canopy Trees ({Math.round(treeArea).toLocaleString("en-US")} m²)</span>
                  <span className="font-mono text-ink-primary">${Math.round(costTree).toLocaleString("en-US")}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-surface-border/30">
                  <span>Reflective Pavements ({Math.round(paveArea).toLocaleString("en-US")} m²)</span>
                  <span className="font-mono text-ink-primary">${Math.round(costPave).toLocaleString("en-US")}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-surface-border/30">
                  <span>Water Features ({Math.round(waterArea).toLocaleString("en-US")} m²)</span>
                  <span className="font-mono text-ink-primary">${Math.round(costWater).toLocaleString("en-US")}</span>
                </div>

                <div className="flex justify-between items-center pt-2 font-medium text-xs">
                  <span className="text-ink-primary">Total Capital Budget</span>
                  <span className="font-mono text-cobalt font-semibold">${Math.round(totalCost).toLocaleString("en-US")} USD</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
