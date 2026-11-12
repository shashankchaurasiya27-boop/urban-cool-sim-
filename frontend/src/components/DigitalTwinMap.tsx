"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { BitmapLayer, GeoJsonLayer } from "deck.gl";
import {
  Layers,
  MapPin,
  Sliders,
  Thermometer,
  Building,
  Trees,
  Zap,
  Grid,
  Compass,
  Eye,
  X,
  Sparkles,
  ShieldCheck,
  Maximize2,
  RotateCcw,
  AlertCircle,
  Search,
  Loader2,
  Globe,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { SatelliteBasemapProvider, MapProviderType } from "@/lib/mapProviders";
import {
  getStudyAreaBoundary,
  getAllStudyAreaBoundaries,
  makeFeatherAlpha,
  StudyAreaBoundary,
} from "@/lib/studyAreaBoundaries";
import {
  fetchOSMBuildings,
  assignThermalToBuildings,
  applyScenarioPhysics,
} from "@/lib/osmBuildings";

interface DigitalTwinMapProps {
  gridData: any;
  activeLayer?: string;
  onCellSelect?: (cell: any) => void;
  title?: string;
  showInspector?: boolean;
  appliedSolution?: any;
}

// ─── Scientific Layer Metadata ────────────────────────────────────────────────
const LAYER_METAS: Record<
  string,
  {
    label: string;
    source: string;
    unit: string;
    min: number;
    max: number;
    minLabel: string;
    maxLabel: string;
    gradientCss: string;
  }
> = {
  baseline_temperature_c: {
    label: "Modelled Surface Temperature",
    source: "SEB solver + morphology corrections · not satellite-observed",
    unit: "°C",
    min: 25,
    max: 75,
    minLabel: "Modelled cooler surface",
    maxLabel: "Modelled hotter surface",
    gradientCss:
      "linear-gradient(to right, #1c4bcc, #06b6d4, #f59e0b, #dc2626)",
  },
  canopy_height: {
    label: "Tree Canopy Height",
    source: "Bundled vector features + canopy parameterization; no GEDI raster in this grid path",
    unit: "m",
    min: 0,
    max: 25,
    minLabel: "0m (No Canopy)",
    maxLabel: "25m (Dense Canopy)",
    gradientCss:
      "linear-gradient(to right, #1a2e1c, #16a34a, #4ade80, #bbf7d0)",
  },
  population_density: {
    label: "Demographic Exposure",
    source: "Morphology/road proxy with deterministic perturbation; not a WorldPop raster",
    unit: "pop/ha",
    min: 0,
    max: 500,
    minLabel: "0",
    maxLabel: "500 pop/ha",
    gradientCss:
      "linear-gradient(to right, #1e1b4b, #7c3aed, #db2777, #fbbf24)",
  },
  anthropogenic_heat_qf: {
    label: "Waste Heat Flux (Qf)",
    source: "Morphology/road proxy with deterministic perturbation; not a VIIRS raster",
    unit: "W/m²",
    min: 0,
    max: 90,
    minLabel: "0 W/m²",
    maxLabel: "90 W/m²",
    gradientCss:
      "linear-gradient(to right, #1c1917, #b45309, #f97316, #fde68a)",
  },
  building_height: {
    label: "Building Heights (H)",
    source: "Building attributes in bundled GeoJSON; upstream provenance not embedded",
    unit: "m",
    min: 0,
    max: 85,
    minLabel: "0m (Ground)",
    maxLabel: "85m (High-Rise)",
    gradientCss:
      "linear-gradient(to right, #0f172a, #334155, #94a3b8, #f1f5f9)",
  },
  albedo: {
    label: "Surface Albedo (α)",
    source: "Feature attributes and configured defaults; not Sentinel-2-derived in this grid path",
    unit: "",
    min: 0.08,
    max: 0.45,
    minLabel: "0.08 (Asphalt)",
    maxLabel: "0.45 (Cool Roof)",
    gradientCss:
      "linear-gradient(to right, #1c1917, #57534e, #a8a29e, #fafaf9)",
  },
};

// ─── NASA GIBS Native Colormap Metadata (for honest global reference legend) ──
const NASA_GIBS_LST_META = {
  label: "NASA MODIS Land Surface Temp (Daytime)",
  source: "NASA EOSDIS GIBS · Native Colormap (~1km)",
  unit: "°C",
  min: 0,
  max: 50,
  minLabel: "0°C (Cold / Cloud)",
  maxLabel: "50°C+ (Hot)",
  // NASA MODIS Land Surface Temperature Rainbow Palette
  gradientCss:
    "linear-gradient(to right, #051e3e, #005082, #00a8cc, #00bfa5, #7cb342, #fbc02d, #ff6f00, #d50000, #5d001e)",
  note: "NASA native pre-colored LST colormap (~1km resolution)",
};

// ─── 5 Pinned High-Resolution Study Areas ──────────────────────────────────────
const PINNED_STUDY_AREAS = [
  {
    id: "delhi_cp",
    name: "Connaught Place",
    city: "New Delhi",
    country: "India",
    flag: "🇮🇳",
    center: [77.2197, 28.6328] as [number, number],
    zoom: 15.8,
  },
  {
    id: "mumbai_bkc",
    name: "Bandra Kurla Complex",
    city: "Mumbai",
    country: "India",
    flag: "🇮🇳",
    center: [72.8683, 19.0657] as [number, number],
    zoom: 15.2,
  },
  {
    id: "singapore_marina",
    name: "Marina Bay",
    city: "Singapore",
    country: "Singapore",
    flag: "🇸🇬",
    center: [103.8565, 1.2847] as [number, number],
    zoom: 15.2,
  },
  {
    id: "phoenix_downtown",
    name: "Downtown Core",
    city: "Phoenix",
    country: "USA",
    flag: "🇺🇸",
    center: [-112.0740, 33.4484] as [number, number],
    zoom: 15.0,
  },
  {
    id: "tokyo_shinjuku",
    name: "Shinjuku Center",
    city: "Tokyo",
    country: "Japan",
    flag: "🇯🇵",
    center: [139.6965, 35.6905] as [number, number],
    zoom: 15.2,
  },
];

// ─── Scientific Colormap with Organic Foliage & Feature Tuning ────────────────
function getRobustTemperatureDomain(
  values: number[][] | undefined,
  fallbackMin = 25,
  fallbackMax = 75,
  coverageMask?: number[][]
) {
  const samples: number[] = [];
  (values ?? []).forEach((row, r) => {
    row.forEach((value, c) => {
      const hasSupport = !coverageMask || (coverageMask[r]?.[c] ?? 0) > 0;
      if (hasSupport && Number.isFinite(value)) samples.push(value);
    });
  });
  const sorted = samples.sort((a, b) => a - b);
  if (sorted.length < 10) return { min: fallbackMin, max: fallbackMax };
  const low = sorted[Math.floor((sorted.length - 1) * 0.02)];
  const high = sorted[Math.ceil((sorted.length - 1) * 0.98)];
  let min = Math.floor(low / 2) * 2;
  let max = Math.ceil(high / 2) * 2;
  if (max - min < 4) {
    min -= 2;
    max += 2;
  }
  return { min, max };
}

function getColormapRGBA(
  val: number,
  minVal: number,
  maxVal: number,
  layer: string,
  alpha = 220
): [number, number, number, number] {
  const norm = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal || 1)));

  if (layer.includes("temperature") || layer === "lst") {
    if (norm < 0.25) {
      const t = norm / 0.25;
      return [Math.round(28 + t * 12), Math.round(75 + t * 90), Math.round(220 - t * 20), alpha];
    } else if (norm < 0.5) {
      const t = (norm - 0.25) / 0.25;
      return [Math.round(40 + t * 185), Math.round(165 + t * 45), Math.round(200 - t * 190), alpha];
    } else if (norm < 0.75) {
      const t = (norm - 0.5) / 0.25;
      return [Math.round(225 + t * 25), Math.round(210 - t * 120), 10, alpha];
    } else {
      const t = (norm - 0.75) / 0.25;
      return [Math.round(250 - t * 15), Math.round(90 - t * 65), Math.round(10 + t * 15), alpha];
    }
  } else if (layer.includes("canopy") || layer.includes("veg")) {
    // Tree Canopy: Strictly transparent where no canopy (< 0.8m)
    if (val < 0.8) return [0, 0, 0, 0];
    
    // Natural density-scaled alpha: sparse canopy (2m) is lighter; dense park canopy (18m+) is richly saturated
    const scaledAlpha = Math.min(235, Math.round(120 + norm * 115));
    
    if (norm < 0.35) {
      // Light / young canopy & street verge (0.8m - 8m): Sunlit lime-emerald
      const t = norm / 0.35;
      return [Math.round(74 - t * 38), Math.round(180 + t * 35), Math.round(45 + t * 20), scaledAlpha];
    } else if (norm < 0.70) {
      // Medium mature canopy (8m - 17m): Rich vibrant emerald
      const t = (norm - 0.35) / 0.35;
      return [Math.round(36 - t * 22), Math.round(215 - t * 40), Math.round(65 - t * 15), scaledAlpha];
    } else {
      // Dense tall canopy & urban forest (17m - 25m): Deep forest canopy green
      const t = (norm - 0.70) / 0.30;
      return [Math.round(14 - t * 6), Math.round(175 - t * 45), Math.round(50 - t * 15), scaledAlpha];
    }
  } else if (layer.includes("population")) {
    if (norm < 0.05 || val < 10) return [0, 0, 0, 0];
    return [Math.round(80 + norm * 165), Math.round(25 + norm * 180), Math.round(180 - norm * 120), Math.min(220, Math.round(120 + norm * 100))];
  } else if (layer.includes("qf") || layer.includes("anthropogenic")) {
    if (norm < 0.08 || val < 5) return [0, 0, 0, 0];
    return [Math.round(180 + norm * 70), Math.round(60 + norm * 150), 15, Math.min(230, Math.round(130 + norm * 100))];
  } else if (layer.includes("height")) {
    if (val < 2.0) return [0, 0, 0, 0];
    const v = Math.round(70 + norm * 180);
    return [Math.round(v * 0.9), Math.round(v * 0.95), Math.min(255, Math.round(v * 1.15)), Math.min(220, Math.round(140 + norm * 80))];
  } else {
    const v = Math.round(40 + norm * 215);
    return [v, v, v, alpha - 20];
  }
}

// ─── GIBS Configuration (verified from live WMTS capabilities 2026-08-27) ────
// Layer: MODIS Terra Daily Daytime Land Surface Temperature (TES)
// TileMatrixSet: GoogleMapsCompatible_Level7  (max zoom 7 native, MapLibre overzooms fine)
const GIBS_LAYER_ID = "MODIS_Terra_L3_Land_Surface_Temp_Daily_Day_TES";
const GIBS_TILE_MATRIX_SET = "GoogleMapsCompatible_Level7";
// Use the no-time URL pattern (GIBS serves a default/latest date without {Time})
const GIBS_TILE_URL =
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${GIBS_LAYER_ID}/default/${GIBS_TILE_MATRIX_SET}/{z}/{y}/{x}.png`;

// Zoom thresholds for cross-fade
const GIBS_FADE_START_ZOOM = 12;  // Below this: only GIBS (or Not Available for non-LST)
const GIBS_FADE_END_ZOOM   = 14;  // Above this: only local grid

// ─── Thermal value interpolation color for extruded buildings ─────────────────
function thermalValueToRGBA(thermalValue: number, layerKey: string, scenario = "baseline"): [number, number, number, number] {
  const meta = LAYER_METAS[layerKey] || LAYER_METAS.baseline_temperature_c;
  const maxVal = layerKey === "albedo" && (scenario === "cool_roofs" || scenario === "optimized") ? 0.85 : meta.max;
  return getColormapRGBA(thermalValue, meta.min, maxVal, layerKey, 230);
}

export function DigitalTwinMap({
  gridData,
  activeLayer = "baseline_temperature_c",
  onCellSelect,
  appliedSolution: propAppliedSolution,
}: DigitalTwinMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [is3DMode, setIs3DMode] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState(activeLayer);
  const selectedLayerRef = useRef(selectedLayer);
  selectedLayerRef.current = selectedLayer;

  // Keep the imagery legible under the local modelled raster by default.
  const [thermalOpacity, setThermalOpacity] = useState(0.42);
  const [showAnalysisGrid, setShowAnalysisGrid] = useState(false);

  const [appliedSolution, setAppliedSolution] = useState<any | null>(() => {
    if (propAppliedSolution) return propAppliedSolution;
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("urbancoolsim_active_solution");
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }
    return null;
  });

  const [activeScenario, setActiveScenario] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const savedScen = localStorage.getItem("urbancoolsim_scenario");
      if (savedScen) return savedScen;
      if (localStorage.getItem("urbancoolsim_active_solution")) return "optimized";
    }
    return "baseline";
  });

  useEffect(() => {
    if (propAppliedSolution) {
      setAppliedSolution(propAppliedSolution);
      setActiveScenario("optimized");
    }
  }, [propAppliedSolution]);

  useEffect(() => {
    const handleSolutionApplied = (e: any) => {
      if (e.detail) {
        setAppliedSolution(e.detail);
        setActiveScenario("optimized");
      }
    };
    window.addEventListener("solutionApplied", handleSolutionApplied);
    return () => window.removeEventListener("solutionApplied", handleSolutionApplied);
  }, []);
  const [hoveredCell, setHoveredCell] = useState<any | null>(null);
  const [selectedCell, setSelectedCell] = useState<any | null>(null);
  const [mapProvider] = useState<MapProviderType>(SatelliteBasemapProvider.getActiveProvider());

  // GIBS cross-fade & data mode state:
  // "gibs" = global MODIS LST active
  // "crossfade" = blending MODIS → local model grid
  // "local" = local physics-model grid active
  // "not_available" = layer has no global reference (non-LST layer outside study areas / zoomed out)
  const [dataMode, setDataMode] = useState<"gibs" | "crossfade" | "local" | "not_available">("local");
  const [gibsOpacity, setGibsOpacity] = useState(0.0);

  // Location search state (Part 2)
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // OSM 3D building state
  const [osmBuildings, setOsmBuildings] = useState<GeoJSON.FeatureCollection | null>(null);
  const [osmStatus, setOsmStatus] = useState<string>("");
  const [osmLoading, setOsmLoading] = useState(false);
  const [isLegendCollapsed, setIsLegendCollapsed] = useState(false);

  useEffect(() => {
    if (activeLayer) setSelectedLayer(activeLayer);
  }, [activeLayer]);

  const layerMeta = useMemo(() => {
    const base = LAYER_METAS[selectedLayer] || LAYER_METAS.baseline_temperature_c;
    if (selectedLayer === "albedo" && (activeScenario === "cool_roofs" || activeScenario === "optimized")) {
      return {
        ...base,
        max: 0.85,
        maxLabel: "0.85 (Cool Roof α=0.85)",
      };
    }
    if (selectedLayer === "anthropogenic_heat_qf" && activeScenario !== "baseline") {
      return {
        ...base,
        maxLabel: activeScenario === "optimized" ? "60 W/m² (Mitigated)" : "68 W/m² (Mitigated)",
      };
    }
    if (selectedLayer === "canopy_height") {
      if (activeScenario === "tree_canopy") {
        return {
          ...base,
          maxLabel: "25m (Street Corridor Canopy)",
        };
      }
      if (activeScenario === "green_roofs") {
        return {
          ...base,
          maxLabel: "2.4m (Sedum Green Roof)",
        };
      }
      if (activeScenario === "optimized") {
        return {
          ...base,
          maxLabel: "25m (Hybrid Corridor & Sedum)",
        };
      }
    }
    return base;
  }, [selectedLayer, activeScenario]);

  const layerDomain = useMemo(() => {
    if (selectedLayer === "baseline_temperature_c") {
      return getRobustTemperatureDomain(
        gridData?.layers?.baseline_temperature_c,
        layerMeta.min,
        layerMeta.max,
        gridData?.layers?.modelled_coverage_mask
      );
    }
    return { min: layerMeta.min, max: layerMeta.max };
  }, [gridData, selectedLayer, layerMeta]);
  const effectiveResolution = Number(gridData?.metadata?.resolution_m ?? 0);
  const resolutionLabel = effectiveResolution > 0 ? `~${Math.round(effectiveResolution)}m grid` : "Spatial grid";

  // ── Geographic bounds from study area registry or grid metadata ───────────
  const studyAreaBounds = useMemo(() => {
    const areaId = gridData?.metadata?.study_area_id ?? "delhi_cp";
    const registered = getStudyAreaBoundary(areaId);
    if (registered) {
      return {
        centerLat: registered.center[1],
        centerLon: registered.center[0],
        north: registered.bbox.north,
        south: registered.bbox.south,
        east: registered.bbox.east,
        west: registered.bbox.west,
      };
    }

    const lat = gridData?.metadata?.center_lat ?? 28.6315;
    const lon = gridData?.metadata?.center_lon ?? 77.2167;
    const rows = gridData?.metadata?.rows ?? 50;
    const cols = gridData?.metadata?.cols ?? 50;
    const resM = gridData?.metadata?.resolution_m ?? 10.0;

    const totalHeightM = rows * resM;
    const totalWidthM = cols * resM;
    const deltaLat = totalHeightM / 111320.0;
    const deltaLon = totalWidthM / (111320.0 * Math.cos((lat * Math.PI) / 180.0));

    const north = lat + deltaLat / 2;
    const south = lat - deltaLat / 2;
    const east = lon + deltaLon / 2;
    const west = lon - deltaLon / 2;

    return { centerLat: lat, centerLon: lon, north, south, east, west };
  }, [gridData]);

  // ── Study area boundary polygon ────────────────────────────────────────────
  const studyBoundary = useMemo(() => {
    const areaId = gridData?.metadata?.study_area_id ?? "delhi_cp";
    return getStudyAreaBoundary(areaId, studyAreaBounds);
  }, [gridData, studyAreaBounds]);

  // Texture cache ref to prevent recomputing 40k pixels on non-data state changes
  const textureCacheRef = useRef<Map<string, string>>(new Map());

  // Reset OSM buildings and texture cache on study area switch
  const currentStudyAreaId = gridData?.metadata?.study_area_id ?? "delhi_cp";
  const prevStudyAreaIdRef = useRef<string>(currentStudyAreaId);

  useEffect(() => {
    if (prevStudyAreaIdRef.current !== currentStudyAreaId) {
      setOsmBuildings(null);
      setOsmStatus("");
      textureCacheRef.current.clear();
      prevStudyAreaIdRef.current = currentStudyAreaId;
    }
  }, [currentStudyAreaId]);

  // ── Generate 4x-upsampled thermal texture (GPU bilinear on BitmapLayer) ────
  const generateThermalTexture = useCallback(
    (layerKey: string, scenario: string): string | null => {
      if (!gridData?.layers) return null;

      const cacheKey = `${currentStudyAreaId}_${layerKey}_${scenario}`;
      if (textureCacheRef.current.has(cacheKey)) {
        return textureCacheRef.current.get(cacheKey) || null;
      }

      const srcRows = gridData?.metadata?.rows ?? 50;
      const srcCols = gridData?.metadata?.cols ?? 50;
      // 4× upsample for GPU bilinear smoothing
      const SCALE = 4;
      const dstW = srcCols * SCALE;
      const dstH = srcRows * SCALE;

      const canvas = document.createElement("canvas");
      canvas.width = dstW;
      canvas.height = dstH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      const layerValues =
        gridData.layers[layerKey] || gridData.layers["baseline_temperature_c"];
      if (!layerValues) return null;

      const meta = LAYER_METAS[layerKey] || LAYER_METAS.baseline_temperature_c;
      let domainMin = meta.min;
      let domainMax = meta.max;
      if (layerKey === "baseline_temperature_c") {
        const dom = getRobustTemperatureDomain(
          layerValues,
          meta.min,
          meta.max,
          gridData.layers.modelled_coverage_mask
        );
        domainMin = dom.min;
        domainMax = dom.max;
      } else if (layerKey === "albedo" && (scenario === "cool_roofs" || scenario === "optimized")) {
        domainMax = 0.85;
      } else if (layerKey.includes("qf") && scenario !== "baseline") {
        domainMax = scenario === "optimized" ? 68 : 75;
      }
      const colorDomain = { min: domainMin, max: domainMax };

      const bldgH = gridData.layers["building_height"];
      const bldgD = gridData.layers["building_density"];
      const vegF = gridData.layers["veg_fraction"];
      const waterF = gridData.layers["water_fraction"];
      const baseT = gridData.layers["baseline_temperature_c"];
      const qfLayer = gridData.layers["anthropogenic_heat_qf"];
      const albedoLayer = gridData.layers["albedo"];

      // Build feather alpha function from boundary.
      const featherFn =
        studyBoundary
          ? makeFeatherAlpha(studyBoundary.boundary, 0.0012)
          : null;

      const { north, south, east, west } = studyAreaBounds;
      const dLat = (north - south) / srcRows;
      const dLon = (east - west) / srcCols;

      // Each dst pixel maps back to a src cell via bilinear sampling
      const imgData = ctx.createImageData(dstW, dstH);

      for (let py = 0; py < dstH; py++) {
        // src fractional row
        const fracRow = (py / (dstH - 1)) * (srcRows - 1);
        const r0 = Math.floor(fracRow);
        const r1 = Math.min(srcRows - 1, r0 + 1);
        const wr = fracRow - r0;

        for (let px = 0; px < dstW; px++) {
          // src fractional col
          const fracCol = (px / (dstW - 1)) * (srcCols - 1);
          const c0 = Math.floor(fracCol);
          const c1 = Math.min(srcCols - 1, c0 + 1);
          const wc = fracCol - c0;

          // Bilinear interpolation of data value
          const v00 = layerValues[r0]?.[c0] ?? meta.min;
          const v01 = layerValues[r0]?.[c1] ?? meta.min;
          const v10 = layerValues[r1]?.[c0] ?? meta.min;
          const v11 = layerValues[r1]?.[c1] ?? meta.min;
          let val =
            v00 * (1 - wr) * (1 - wc) +
            v01 * (1 - wr) * wc +
            v10 * wr * (1 - wc) +
            v11 * wr * wc;

          // Interpolate physical feature context
          const h =
            (bldgH?.[r0]?.[c0] ?? 0) * (1 - wr) * (1 - wc) +
            (bldgH?.[r0]?.[c1] ?? 0) * (1 - wr) * wc +
            (bldgH?.[r1]?.[c0] ?? 0) * wr * (1 - wc) +
            (bldgH?.[r1]?.[c1] ?? 0) * wr * wc;
          const v =
            (vegF?.[r0]?.[c0] ?? 0) * (1 - wr) * (1 - wc) +
            (vegF?.[r0]?.[c1] ?? 0) * (1 - wr) * wc +
            (vegF?.[r1]?.[c0] ?? 0) * wr * (1 - wc) +
            (vegF?.[r1]?.[c1] ?? 0) * wr * wc;
          const w =
            (waterF?.[r0]?.[c0] ?? 0) * (1 - wr) * (1 - wc) +
            (waterF?.[r0]?.[c1] ?? 0) * (1 - wr) * wc +
            (waterF?.[r1]?.[c0] ?? 0) * wr * (1 - wc) +
            (waterF?.[r1]?.[c1] ?? 0) * wr * wc;
          const d =
            (bldgD?.[r0]?.[c0] ?? 0) * (1 - wr) * (1 - wc) +
            (bldgD?.[r0]?.[c1] ?? 0) * (1 - wr) * wc +
            (bldgD?.[r1]?.[c0] ?? 0) * wr * (1 - wc) +
            (bldgD?.[r1]?.[c1] ?? 0) * wr * wc;

          const baseTemp =
            (baseT?.[r0]?.[c0] ?? 42.0) * (1 - wr) * (1 - wc) +
            (baseT?.[r0]?.[c1] ?? 42.0) * (1 - wr) * wc +
            (baseT?.[r1]?.[c0] ?? 42.0) * wr * (1 - wc) +
            (baseT?.[r1]?.[c1] ?? 42.0) * wr * wc;
          const baseQf =
            (qfLayer?.[r0]?.[c0] ?? 45.0) * (1 - wr) * (1 - wc) +
            (qfLayer?.[r0]?.[c1] ?? 45.0) * (1 - wr) * wc +
            (qfLayer?.[r1]?.[c0] ?? 45.0) * wr * (1 - wc) +
            (qfLayer?.[r1]?.[c1] ?? 45.0) * wr * wc;
          const baseAlb =
            (albedoLayer?.[r0]?.[c0] ?? 0.18) * (1 - wr) * (1 - wc) +
            (albedoLayer?.[r0]?.[c1] ?? 0.18) * (1 - wr) * wc +
            (albedoLayer?.[r1]?.[c0] ?? 0.18) * wr * (1 - wc) +
            (albedoLayer?.[r1]?.[c1] ?? 0.18) * wr * wc;

          // Tree Canopy Feature-Aware Masking:
          if (layerKey.includes("canopy") || layerKey.includes("veg")) {
            // Strictly 0 canopy over open water bodies and active vehicular road lanes
            if (w > 0.30 || (baseAlb <= 0.12 && d < 0.25)) {
              val = 0.0;
            }
          }

          // Apply first-principles SEB & urban climatology scenario physics across all layers
          const phys = applyScenarioPhysics(layerKey, val, scenario, {
            bldgHeight: h,
            bldgDensity: d,
            vegFraction: v,
            waterFraction: w,
            baseTempC: baseTemp,
            baseQfWm2: baseQf,
            baseAlbedo: baseAlb,
            isBuilding: false,
            appliedSolution: appliedSolution || undefined,
          });
          val = phys.val;
          if ((layerKey.includes("canopy") || layerKey.includes("veg")) && (baseAlb <= 0.12 && d < 0.25)) {
            val = 0.0; // Active traffic lanes remain clear asphalt
          }

          // Colormap
          const [R, G, B, A] = getColormapRGBA(val, colorDomain.min, colorDomain.max, layerKey, 220);

          // Feather alpha mask
          let featherA = 1.0;
          if (featherFn) {
            const pxLon = west + (px / (dstW - 1)) * (east - west);
            const pxLat = north - (py / (dstH - 1)) * (north - south);
            featherA = featherFn(pxLon, pxLat);
          }

          // For temperature overlays, do not paint default-only cells as if
          // they had the same evidence as mapped building/road/park/water cells.
          // Bilinear support interpolation creates a subtle edge fade without
          // inventing more spatial detail than the source grid contains.
          let supportAlpha = 1.0;
          const coverageMask = gridData.layers.modelled_coverage_mask;
          if ((layerKey === "baseline_temperature_c" || layerKey === "seb_temperature_c") && coverageMask) {
            const m00 = coverageMask[r0]?.[c0] ?? 0;
            const m01 = coverageMask[r0]?.[c1] ?? 0;
            const m10 = coverageMask[r1]?.[c0] ?? 0;
            const m11 = coverageMask[r1]?.[c1] ?? 0;
            const support =
              m00 * (1 - wr) * (1 - wc) +
              m01 * (1 - wr) * wc +
              m10 * wr * (1 - wc) +
              m11 * wr * wc;
            supportAlpha = Math.max(0, Math.min(1, (support - 0.15) / 0.6));
          }

          const idx = (py * dstW + px) * 4;
          imgData.data[idx] = R;
          imgData.data[idx + 1] = G;
          imgData.data[idx + 2] = B;
          imgData.data[idx + 3] = Math.round(A * featherA * supportAlpha);
        }
      }

      ctx.putImageData(imgData, 0, 0);
      const dataUrl = canvas.toDataURL();
      textureCacheRef.current.set(cacheKey, dataUrl);
      return dataUrl;
    },
    [gridData, studyAreaBounds, studyBoundary, currentStudyAreaId]
  );

  // ── Analysis grid GeoJSON (for hover + grid lines) ─────────────────────────
  const analysisGridGeoJSON = useMemo(() => {
    if (!gridData?.layers) return null;

    const rows = gridData?.metadata?.rows ?? 50;
    const cols = gridData?.metadata?.cols ?? 50;
    const { north, south, east, west } = studyAreaBounds;
    const dLat = (north - south) / rows;
    const dLon = (east - west) / cols;

    const baseT = gridData.layers["baseline_temperature_c"];
    const bldgH = gridData.layers["building_height"];
    const bldgD = gridData.layers["building_density"];
    const vegF = gridData.layers["veg_fraction"];
    const canopyH = gridData.layers["canopy_height"];
    const popD = gridData.layers["population_density"];
    const qfVal = gridData.layers["anthropogenic_heat_qf"];
    const svfVal = gridData.layers["sky_view_factor"];
    const albedoVal = gridData.layers["albedo"];

    const features: GeoJSON.Feature[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellNorth = north - r * dLat;
        const cellSouth = cellNorth - dLat;
        const cellWest = west + c * dLon;
        const cellEast = cellWest + dLon;

        const temp = baseT?.[r]?.[c] ?? 42.0;
        const height = bldgH?.[r]?.[c] ?? 0.0;
        const density = bldgD?.[r]?.[c] ?? 0.0;
        const veg = vegF?.[r]?.[c] ?? 0.0;
        const water = (gridData.layers["water_fraction"]?.[r]?.[c]) ?? 0.0;
        const canopy = canopyH?.[r]?.[c] ?? veg * 14.0;
        const landmarkName = gridData.landmarks?.[r]?.[c] || null;

        const isBldgCell = density >= 0.38;

        const tempRes = applyScenarioPhysics("baseline_temperature_c", temp, activeScenario, {
          bldgHeight: height,
          bldgDensity: density,
          vegFraction: veg,
          waterFraction: water,
          baseTempC: temp,
          baseQfWm2: qfVal?.[r]?.[c] ?? 45.0,
          baseAlbedo: albedoVal?.[r]?.[c] ?? 0.18,
          isBuilding: isBldgCell,
          appliedSolution: appliedSolution || undefined,
        });

        const qfRes = applyScenarioPhysics("anthropogenic_heat_qf", qfVal?.[r]?.[c] ?? 45.0, activeScenario, {
          bldgHeight: height,
          bldgDensity: density,
          vegFraction: veg,
          waterFraction: water,
          baseTempC: temp,
          baseQfWm2: qfVal?.[r]?.[c] ?? 45.0,
          baseAlbedo: albedoVal?.[r]?.[c] ?? 0.18,
          isBuilding: isBldgCell,
          appliedSolution: appliedSolution || undefined,
        });

        const albRes = applyScenarioPhysics("albedo", albedoVal?.[r]?.[c] ?? 0.18, activeScenario, {
          bldgHeight: height,
          bldgDensity: density,
          vegFraction: veg,
          waterFraction: water,
          baseTempC: temp,
          baseQfWm2: qfVal?.[r]?.[c] ?? 45.0,
          baseAlbedo: albedoVal?.[r]?.[c] ?? 0.18,
          isBuilding: isBldgCell,
          appliedSolution: appliedSolution || undefined,
        });

        const canopyRes = applyScenarioPhysics("canopy_height", canopy, activeScenario, {
          bldgHeight: height,
          bldgDensity: density,
          vegFraction: veg,
          waterFraction: water,
          baseTempC: temp,
          baseQfWm2: qfVal?.[r]?.[c] ?? 45.0,
          baseAlbedo: albedoVal?.[r]?.[c] ?? 0.18,
          isBuilding: isBldgCell,
          appliedSolution: appliedSolution || undefined,
        });

        features.push({
          type: "Feature",
          id: r * cols + c,
          properties: {
            row: r,
            col: c,
            landmarkName,
            temp: Number(tempRes.val.toFixed(1)),
            height: Number(height.toFixed(1)),
            density: Number(density.toFixed(2)),
            veg: Number(veg.toFixed(2)),
            water: Number(water.toFixed(2)),
            canopyHeight: Number(canopyRes.val.toFixed(1)),
            popDensity: Math.round(popD?.[r]?.[c] ?? 180),
            qfAnthro: Math.round(qfRes.val),
            svf: Number((svfVal?.[r]?.[c] ?? 0.72).toFixed(2)),
            albedo: Number(albRes.val.toFixed(2)),
            coolingPotential:
              tempRes.coolingReliefC > 0 ? `-${tempRes.coolingReliefC.toFixed(1)}` : "0.0",
            intervention: tempRes.interventionDescription,
            scenario: activeScenario,
          },
          geometry: {
            type: "Polygon",
            coordinates: [[
              [cellWest, cellNorth],
              [cellEast, cellNorth],
              [cellEast, cellSouth],
              [cellWest, cellSouth],
              [cellWest, cellNorth],
            ]],
          },
        });
      }
    }

    return { type: "FeatureCollection" as const, features };
  }, [gridData, studyAreaBounds, activeScenario]);

  // ── Grid-cell fallback GeoJSON for 3D extrusion when OSM unavailable ───────
  const gridExtrusionGeoJSON = useMemo(() => {
    if (!gridData?.layers) return null;

    const rows = gridData?.metadata?.rows ?? 50;
    const cols = gridData?.metadata?.cols ?? 50;
    const { north, south, east, west } = studyAreaBounds;
    const dLat = (north - south) / rows;
    const dLon = (east - west) / cols;

    const baseT = gridData.layers["baseline_temperature_c"];
    const bldgH = gridData.layers["building_height"];
    const bldgD = gridData.layers["building_density"];
    const vegF = gridData.layers["veg_fraction"];
    const waterF = gridData.layers["water_fraction"];
    const qfVal = gridData.layers["anthropogenic_heat_qf"];
    const albedoVal = gridData.layers["albedo"];

    const features: GeoJSON.Feature[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const rawH = bldgH?.[r]?.[c] ?? 0;
        const dens = bldgD?.[r]?.[c] ?? 0;
        // Only extrude cells with actual buildings (density filter)
        if (rawH < 2.0 || dens < 0.12) continue;

        const cellNorth = north - r * dLat;
        const cellSouth = cellNorth - dLat;
        const cellWest = west + c * dLon;
        const cellEast = cellWest + dLon;

        const rawLayerVal = (gridData.layers[selectedLayer]?.[r]?.[c]) ?? baseT?.[r]?.[c] ?? 42.0;
        const baseTemp = baseT?.[r]?.[c] ?? 42.0;
        const baseQf = qfVal?.[r]?.[c] ?? 45.0;
        const baseAlb = albedoVal?.[r]?.[c] ?? 0.18;
        const water = (waterF?.[r]?.[c]) ?? 0.0;
        const v = vegF?.[r]?.[c] ?? 0;

        const phys = applyScenarioPhysics(selectedLayer, rawLayerVal, activeScenario, {
          bldgHeight: rawH,
          bldgDensity: dens,
          vegFraction: v,
          waterFraction: water,
          baseTempC: baseTemp,
          baseQfWm2: baseQf,
          baseAlbedo: baseAlb,
          isBuilding: true,
          appliedSolution: appliedSolution || undefined,
        });

        features.push({
          type: "Feature",
          properties: { height: rawH, thermalValue: phys.val, layerKey: selectedLayer, scenario: activeScenario },
          geometry: {
            type: "Polygon",
            coordinates: [[
              [cellWest + dLon * 0.08, cellNorth - dLat * 0.08],
              [cellEast - dLon * 0.08, cellNorth - dLat * 0.08],
              [cellEast - dLon * 0.08, cellSouth + dLat * 0.08],
              [cellWest + dLon * 0.08, cellSouth + dLat * 0.08],
              [cellWest + dLon * 0.08, cellNorth - dLat * 0.08],
            ]],
          },
        });
      }
    }

    return { type: "FeatureCollection" as const, features };
  }, [gridData, studyAreaBounds, selectedLayer, activeScenario]);

  // ── Build deck.gl layers array ─────────────────────────────────────────────
  const buildDeckLayers = useCallback(() => {
    const layers: any[] = [];

    // 1. Thermal BitmapLayer — interpolated, feather-masked to boundary
    const dataURL = generateThermalTexture(selectedLayer, activeScenario);
    if (dataURL) {
      const { west, south, east, north } = studyAreaBounds;
      layers.push(
        new BitmapLayer({
          id: "thermal-bitmap-layer",
          image: dataURL,
          bounds: [west, south, east, north],
          opacity: thermalOpacity,
          pickable: false,
          // GPU bilinear sampling — smooth gradient between cells
          textureParameters: {
            minFilter: "linear",
            magFilter: "linear",
          },
        })
      );
    }

    // 2. Study area boundary stroke
    if (studyBoundary) {
      layers.push(
        new GeoJsonLayer({
          id: "study-boundary-layer",
          data: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: studyBoundary.boundary,
              },
            ],
          },
          stroked: true,
          filled: false,
          getLineColor: [74, 108, 255, 180],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          getDashArray: [8, 5],
          dashJustified: true,
          extensions: [], // dasharray extension handled below
          pickable: false,
        })
      );
    }

    // 3. Analysis grid cell hover fill (always present, visible only when hovered)
    if (analysisGridGeoJSON) {
      layers.push(
        new GeoJsonLayer({
          id: "analysis-grid-hover-layer",
          data: analysisGridGeoJSON,
          stroked: showAnalysisGrid,
          filled: true,
          getFillColor: (f: any) => {
            const isHovered =
              hoveredCell &&
              hoveredCell.row === f.properties.row &&
              hoveredCell.col === f.properties.col;
            const isSelected =
              selectedCell &&
              selectedCell.row === f.properties.row &&
              selectedCell.col === f.properties.col;
            if (isSelected) return [74, 108, 255, 80];
            if (isHovered) return [74, 108, 255, 55];
            return [0, 0, 0, 0];
          },
          getLineColor: [255, 255, 255, 30],
          getLineWidth: showAnalysisGrid ? 0.5 : 0,
          lineWidthUnits: "pixels",
          pickable: true,
          autoHighlight: false,
          updateTriggers: {
            getFillColor: [hoveredCell, selectedCell],
            getLineWidth: [showAnalysisGrid],
          },
          onHover: (info: any) => {
            setHoveredCell(info.object?.properties ?? null);
          },
          onClick: (info: any) => {
            if (info.object?.properties) {
              setSelectedCell(info.object.properties);
              onCellSelect?.(info.object.properties);
            }
          },
        })
      );
    }

    // 4. Real-World Building Footprints (2D outlines + 3D Extrusions)
    if (osmBuildings && osmBuildings.features.length > 0) {
      const enriched = assignThermalToBuildings(
        osmBuildings,
        gridData,
        studyAreaBounds,
        selectedLayer,
        activeScenario,
        appliedSolution || undefined
      );

      if (is3DMode) {
        // 3D Extruded Buildings
        layers.push(
          new GeoJsonLayer({
            id: "osm-buildings-3d-layer",
            data: enriched,
            extruded: true,
            stroked: false,
            filled: true,
            wireframe: false,
            getElevation: (f: any) => f.properties?.height ?? 16,
            getFillColor: (f: any) => {
              const tv = f.properties?.thermalValue ?? 42;
              if (selectedLayer.includes("canopy") || selectedLayer.includes("veg")) {
                if (tv < 0.8) return [140, 145, 155, 200]; // Neutral architectural slate when no rooftop canopy
                const [R, G, B] = thermalValueToRGBA(tv, selectedLayer, activeScenario);
                return [R, G, B, 215];
              }
              const [R, G, B] = thermalValueToRGBA(tv, selectedLayer, activeScenario);
              return [R, G, B, 215];
            },
            material: {
              ambient: 0.25,
              diffuse: 0.65,
              shininess: 36,
              specularColor: [80, 85, 95],
            },
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 55],
            onHover: (info: any) => {
              if (info.object?.properties) {
                const p = info.object.properties;
                const h = p.height ?? 16;
                setHoveredCell({
                  landmarkName: p.name || (p.building ? "Commercial Building Complex" : "Urban Structure"),
                  row: p.row ?? 0,
                  col: p.col ?? 0,
                  temp: p.temp ?? (typeof p.thermalValue === "number" ? p.thermalValue.toFixed(1) : "42.0"),
                  height: typeof h === "number" ? h.toFixed(1) : String(h),
                  canopyHeight: p.canopyHeight !== undefined ? String(p.canopyHeight) : "0.0",
                  popDensity: p.popDensity ?? Math.round(h > 30 ? 450 : 220),
                  qfAnthro: p.qfAnthro ?? Math.round(h > 30 ? 68 : 42),
                  svf: Number((Math.cos(Math.atan(2 * h / 24))).toFixed(2)),
                  albedo: p.albedo ?? (p.albedo || 0.19).toFixed(2),
                  coolingPotential: p.coolingPotential ?? (h > 15 ? "-3.5" : "-2.0"),
                  intervention: p.intervention || "SEB Microclimate Mitigation",
                });
              } else {
                setHoveredCell(null);
              }
            },
            onClick: (info: any) => {
              if (info.object?.properties) {
                const p = info.object.properties;
                const h = p.height ?? 16;
                const cell = {
                  landmarkName: p.name || (p.building ? "Commercial Building Complex" : "Urban Structure"),
                  row: p.row ?? 0,
                  col: p.col ?? 0,
                  temp: p.temp ?? (typeof p.thermalValue === "number" ? p.thermalValue.toFixed(1) : "42.0"),
                  height: typeof h === "number" ? h.toFixed(1) : String(h),
                  canopyHeight: p.canopyHeight !== undefined ? String(p.canopyHeight) : "0.0",
                  popDensity: p.popDensity ?? Math.round(h > 30 ? 450 : 220),
                  qfAnthro: p.qfAnthro ?? Math.round(h > 30 ? 68 : 42),
                  svf: Number((Math.cos(Math.atan(2 * h / 24))).toFixed(2)),
                  albedo: p.albedo ?? (p.albedo || 0.19).toFixed(2),
                  coolingPotential: p.coolingPotential ?? (h > 15 ? "-3.5" : "-2.0"),
                  intervention: p.intervention || "SEB Microclimate Mitigation",
                };
                setSelectedCell(cell);
                onCellSelect?.(cell);
              }
            },
            updateTriggers: {
              getFillColor: [selectedLayer, activeScenario],
              getElevation: [activeScenario],
            },
          })
        );
      } else {
        // 2D Building Footprints Overlay (clean geometric outline + thermal fill)
        layers.push(
          new GeoJsonLayer({
            id: "osm-buildings-2d-layer",
            data: enriched,
            extruded: false,
            stroked: true,
            filled: true,
            getFillColor: (f: any) => {
              const tv = f.properties?.thermalValue ?? 42;
              if (selectedLayer.includes("canopy") || selectedLayer.includes("veg")) {
                if (tv < 0.8) return [0, 0, 0, 0]; // Transparent when no rooftop canopy (street trees are in corridor outside)
                const [R, G, B] = thermalValueToRGBA(tv, selectedLayer, activeScenario);
                return [R, G, B, 160];
              }
              const [R, G, B] = thermalValueToRGBA(tv, selectedLayer, activeScenario);
              return [R, G, B, 110];
            },
            getLineColor: (f: any) => {
              if (selectedLayer.includes("canopy") || selectedLayer.includes("veg")) {
                const tv = f.properties?.thermalValue ?? 0;
                if (tv >= 0.8) return [45, 195, 80, 200]; // Emerald outline for green roofs
                return [255, 255, 255, 90]; // Crisp white/neutral outline
              }
              return [255, 255, 255, 110];
            },
            getLineWidth: 1.2,
            lineWidthUnits: "pixels",
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 60],
            onHover: (info: any) => {
              if (info.object?.properties) {
                const p = info.object.properties;
                const h = p.height ?? 16;
                setHoveredCell({
                  landmarkName: p.name || (p.building ? "Commercial Building Complex" : "Urban Structure"),
                  row: p.row ?? 0,
                  col: p.col ?? 0,
                  temp: p.temp ?? (typeof p.thermalValue === "number" ? p.thermalValue.toFixed(1) : "42.0"),
                  height: typeof h === "number" ? h.toFixed(1) : String(h),
                  canopyHeight: p.canopyHeight !== undefined ? String(p.canopyHeight) : "0.0",
                  popDensity: p.popDensity ?? Math.round(h > 30 ? 450 : 220),
                  qfAnthro: p.qfAnthro ?? Math.round(h > 30 ? 68 : 42),
                  svf: Number((Math.cos(Math.atan(2 * h / 24))).toFixed(2)),
                  albedo: p.albedo ?? (p.albedo || 0.19).toFixed(2),
                  coolingPotential: p.coolingPotential ?? (h > 15 ? "-3.5" : "-2.0"),
                  intervention: p.intervention || "SEB Microclimate Mitigation",
                });
              } else {
                setHoveredCell(null);
              }
            },
            onClick: (info: any) => {
              if (info.object?.properties) {
                const p = info.object.properties;
                const h = p.height ?? 16;
                const cell = {
                  landmarkName: p.name || (p.building ? "Commercial Building Complex" : "Urban Structure"),
                  row: p.row ?? 0,
                  col: p.col ?? 0,
                  temp: p.temp ?? (typeof p.thermalValue === "number" ? p.thermalValue.toFixed(1) : "42.0"),
                  height: typeof h === "number" ? h.toFixed(1) : String(h),
                  canopyHeight: p.canopyHeight !== undefined ? String(p.canopyHeight) : "0.0",
                  popDensity: p.popDensity ?? Math.round(h > 30 ? 450 : 220),
                  qfAnthro: p.qfAnthro ?? Math.round(h > 30 ? 68 : 42),
                  svf: Number((Math.cos(Math.atan(2 * h / 24))).toFixed(2)),
                  albedo: p.albedo ?? (p.albedo || 0.19).toFixed(2),
                  coolingPotential: p.coolingPotential ?? (h > 15 ? "-3.5" : "-2.0"),
                  intervention: p.intervention || "SEB Microclimate Mitigation",
                };
                setSelectedCell(cell);
                onCellSelect?.(cell);
              }
            },
            updateTriggers: {
              getFillColor: [selectedLayer, activeScenario],
              getLineColor: [selectedLayer, activeScenario],
            },
          })
        );
      }
    } else if (is3DMode && gridExtrusionGeoJSON) {
      // Fallback: grid-cell extrusion when OSM unavailable
      layers.push(
        new GeoJsonLayer({
          id: "grid-buildings-3d-layer",
          data: gridExtrusionGeoJSON,
          extruded: true,
          stroked: false,
          filled: true,
          getElevation: (f: any) => f.properties?.height ?? 8,
          getFillColor: (f: any) => {
            const tv = f.properties?.thermalValue ?? 42;
            if (selectedLayer.includes("canopy") || selectedLayer.includes("veg")) {
              if (tv < 0.8) return [140, 145, 155, 200];
              const [R, G, B] = thermalValueToRGBA(tv, selectedLayer, activeScenario);
              return [R, G, B, 215];
            }
            const [R, G, B] = thermalValueToRGBA(tv, selectedLayer, activeScenario);
            return [R, G, B, 210];
          },
          material: {
            ambient: 0.2,
            diffuse: 0.6,
            shininess: 24,
          },
          pickable: false,
          updateTriggers: {
            getFillColor: [selectedLayer, activeScenario],
          },
        })
      );
    }

    return layers;
  }, [
    generateThermalTexture,
    selectedLayer,
    activeScenario,
    thermalOpacity,
    studyAreaBounds,
    studyBoundary,
    analysisGridGeoJSON,
    showAnalysisGrid,
    hoveredCell,
    selectedCell,
    is3DMode,
    osmBuildings,
    gridExtrusionGeoJSON,
    gridData,
    onCellSelect,
  ]);

  // Reference to trigger layer visibility check on selectedLayer change
  const updateLayerVisibilityRef = useRef<() => void>(() => {});

  // ── Global map flyTo event listener ─────────────────────────────────────────
  useEffect(() => {
    const handleFlyTo = (e: any) => {
      if (e.detail && mapRef.current) {
        const { lon, lat, zoom = 12.0 } = e.detail;
        mapRef.current.flyTo({
          center: [lon, lat],
          zoom,
          duration: 1500,
        });
      }
    };
    window.addEventListener("mapFlyTo", handleFlyTo);
    return () => window.removeEventListener("mapFlyTo", handleFlyTo);
  }, []);

  // ── Click outside search dropdown listener ──────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Search handler with Nominatim OSM geocoding API (Part 2) ────────────────
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setIsSearchOpen(true);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }

    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            query.trim()
          )}&limit=6&addressdetails=1`,
          {
            signal: controller.signal,
            headers: {
              "Accept-Language": "en",
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data || []);
        } else {
          setSearchResults([]);
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("Geocoding lookup notice:", err);
          setSearchResults([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, 350);
  };

  // Fly to selected pinned study area
  const handleSelectStudyArea = (area: (typeof PINNED_STUDY_AREAS)[0]) => {
    setIsSearchOpen(false);
    setSearchQuery("");
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: area.center,
        zoom: area.zoom,
        duration: 1500,
      });
    }
    window.dispatchEvent(
      new CustomEvent("studyAreaChanged", { detail: area.id })
    );
  };

  // Fly to selected Nominatim global search result
  const handleSelectNominatim = (result: any) => {
    setIsSearchOpen(false);
    setSearchQuery(result.display_name.split(",")[0] || searchQuery);
    const lon = parseFloat(result.lon);
    const lat = parseFloat(result.lat);
    if (!isNaN(lon) && !isNaN(lat) && mapRef.current) {
      mapRef.current.flyTo({
        center: [lon, lat],
        zoom: 12.0,
        duration: 1600,
      });
    }
  };

  // ── Initialize MapLibre + deck.gl MapboxOverlay ────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const style = SatelliteBasemapProvider.getMapLibreStyle(mapProvider);

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: [studyAreaBounds.centerLon, studyAreaBounds.centerLat],
      zoom: 15.5,
      pitch: 0,
      bearing: 0,
      antialias: true,
      attributionControl: false,
    });

    mapRef.current = map;

    // Add NASA GIBS MODIS LST raster source once the style loads
    map.on("load", () => {
      // GIBS global LST tile source
      map.addSource("gibs-lst-source", {
        type: "raster",
        tiles: [GIBS_TILE_URL],
        tileSize: 256,
        attribution:
          "Imagery provided by NASA EOSDIS GIBS · MODIS Terra LST",
        maxzoom: 7,
      });

      map.addLayer({
        id: "gibs-lst-layer",
        type: "raster",
        source: "gibs-lst-source",
        paint: {
          "raster-opacity": 0.0, // starts hidden; zoom listener drives setPaintProperty
          "raster-resampling": "linear",
        },
      });
    });

    // ── GIBS ↔ local grid cross-fade & non-LST layer gate ─────────────────
    const allBoundaries = getAllStudyAreaBoundaries();

    const handleZoomOrMove = () => {
      const zoom = map.getZoom();
      const center = map.getCenter();
      const cLon = center.lng;
      const cLat = center.lat;

      // Check if camera center is inside any registered study area bbox
      const insideStudyArea = allBoundaries.some((sb) => {
        const { west, south, east, north } = sb.bbox;
        return cLon >= west && cLon <= east && cLat >= south && cLat <= north;
      });

      const currentLayer = selectedLayerRef.current;
      const isLSTLayer = currentLayer === "baseline_temperature_c";

      let targetGibsOpacity = 0.0;
      let newDataMode: "gibs" | "crossfade" | "local" | "not_available";

      if (insideStudyArea && zoom >= GIBS_FADE_END_ZOOM) {
        // Inside study area at detail zoom: show local model grid
        targetGibsOpacity = 0.0;
        newDataMode = "local";
      } else if (insideStudyArea && zoom >= GIBS_FADE_START_ZOOM) {
        // Inside study area in crossfade zone
        if (isLSTLayer) {
          const t =
            (zoom - GIBS_FADE_START_ZOOM) /
            (GIBS_FADE_END_ZOOM - GIBS_FADE_START_ZOOM);
          targetGibsOpacity = 0.72 * (1 - t);
          newDataMode = "crossfade";
        } else {
          targetGibsOpacity = 0.0;
          newDataMode = "local";
        }
      } else {
        // Outside study area OR zoomed out past threshold
        if (isLSTLayer) {
          targetGibsOpacity = 0.72;
          newDataMode = "gibs";
        } else {
          // Bug B Fix: For non-LST layers outside study areas, do NOT render GIBS!
          targetGibsOpacity = 0.0;
          newDataMode = "not_available";
        }
      }

      // Apply opacity to MapLibre raster layer
      if (map.getLayer("gibs-lst-layer")) {
        map.setPaintProperty(
          "gibs-lst-layer",
          "raster-opacity",
          targetGibsOpacity
        );
      }

      setGibsOpacity(targetGibsOpacity);
      setDataMode(newDataMode);
    };

    updateLayerVisibilityRef.current = handleZoomOrMove;

    map.on("zoom", handleZoomOrMove);
    map.on("move", handleZoomOrMove);
    map.on("load", handleZoomOrMove);

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
    });

    overlayRef.current = overlay;
    map.addControl(overlay as any);

    // Initial resize on load and next frame
    map.on("load", () => {
      map.resize();
    });
    const resizeTimer = setTimeout(() => {
      if (mapRef.current) mapRef.current.resize();
    }, 150);

    // ResizeObserver for dynamic layout / tab changes
    const ro = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.resize();
    });
    ro.observe(mapContainerRef.current);

    return () => {
      clearTimeout(resizeTimer);
      ro.disconnect();
      overlay.finalize();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapProvider]);

  // ── Sync map camera when study area bounds change ───────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const sb = studyBoundary;
    const center = sb
      ? sb.center
      : ([studyAreaBounds.centerLon, studyAreaBounds.centerLat] as [number, number]);
    const zoom = sb?.zoom ?? 15.5;
    mapRef.current.flyTo({
      center,
      zoom,
      duration: 1200,
    });
  }, [studyBoundary, studyAreaBounds]);

  // ── Immediately update layer visibility when selectedLayer changes ──────────
  useEffect(() => {
    selectedLayerRef.current = selectedLayer;
    if (updateLayerVisibilityRef.current) {
      updateLayerVisibilityRef.current();
    }
  }, [selectedLayer]);

  // ── Update deck.gl layers whenever state changes ───────────────────────────
  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.setProps({ layers: buildDeckLayers() });
  }, [buildDeckLayers]);

  // ── 2D ↔ 3D camera transition ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.easeTo({
      pitch: is3DMode ? 55 : 0,
      bearing: is3DMode ? -18 : 0,
      duration: 900,
    });
  }, [is3DMode]);

  // ── Load Real-World Building Footprints (curated offline-first + Overpass fallback) ───────────
  useEffect(() => {
    if (osmBuildings !== null || osmLoading) return;

    setOsmLoading(true);
    setOsmStatus("Loading real-world building footprints…");

    const areaId = gridData?.metadata?.study_area_id ?? "delhi_cp";
    fetchOSMBuildings(studyAreaBounds, areaId, setOsmStatus).then((result) => {
      setOsmBuildings(result); // null = graceful degradation to grid fallback
      setOsmLoading(false);
      if (!result) setOsmStatus("Grid fallback active");
    });
  }, [osmBuildings, osmLoading, studyAreaBounds, gridData]);

  // ── Reset camera ──────────────────────────────────────────────────────────
  const handleResetView = () => {
    const map = mapRef.current;
    if (!map) return;
    const sb = studyBoundary;
    map.flyTo({
      center: sb
        ? sb.center
        : [studyAreaBounds.centerLon, studyAreaBounds.centerLat],
      zoom: sb?.zoom ?? 15.5,
      pitch: is3DMode ? 55 : 0,
      bearing: is3DMode ? -18 : 0,
      duration: 1000,
    });
  };

  const activeInspection = selectedCell || hoveredCell;

  // Filter pinned study areas matching query
  const filteredPinned = PINNED_STUDY_AREAS.filter((p) =>
    `${p.name} ${p.city} ${p.country}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase().trim())
  );

  // Derive badge metadata cleanly
  const pinnedArea = PINNED_STUDY_AREAS.find((p) => p.id === currentStudyAreaId);
  const registeredBoundary = getStudyAreaBoundary(currentStudyAreaId);
  const badgeTitle =
    pinnedArea?.name ||
    registeredBoundary?.name ||
    gridData?.metadata?.name?.replace(" Multi-Source Satellite Twin", "") ||
    "Connaught Place";
  const badgeSubtitle = pinnedArea
    ? `${pinnedArea.city}, ${pinnedArea.country}`
    : gridData?.metadata?.city && gridData?.metadata?.country
    ? `${gridData?.metadata?.city}, ${gridData?.metadata?.country}`
    : gridData?.metadata?.location || "";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-[620px] select-none overflow-hidden rounded-lg border border-surface-border bg-[#0B0C10]">
      {/* 1. Full-Width Absolute Map Canvas Mount */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* 2. Unified Top Control Toolbar */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-30 flex items-center justify-between gap-2 flex-wrap pointer-events-none">
        {/* Left: Study Area Badge & Global Search */}
        <div className="flex items-center gap-2 pointer-events-auto flex-wrap">
          {/* Study Area Badge */}
          <div className="flex items-center gap-2 bg-surface-elevated/90 backdrop-blur-md border border-surface-border px-3 py-1.5 rounded-md shadow-floating text-xs">
            <span className="w-2 h-2 rounded-full bg-status-safe animate-subtle-pulse shrink-0" />
            <span className="font-medium text-ink-primary tracking-tight truncate max-w-[170px]">
              {badgeTitle}
            </span>
            {badgeSubtitle && (
              <span className="text-ink-dim font-mono text-[10px] hidden sm:inline truncate">
                ({badgeSubtitle})
              </span>
            )}
          </div>

          {/* Global Location Search Bar */}
          <div ref={searchContainerRef} className="relative">
            <div className="flex items-center bg-surface-elevated/90 backdrop-blur-md border border-surface-border hover:border-surface-borderHover focus-within:border-cobalt/60 rounded-md px-2.5 py-1.5 shadow-floating text-xs text-ink-primary transition-all w-36 sm:w-52">
              <Search className="w-3.5 h-3.5 text-ink-muted mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Search location..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setIsSearchOpen(true)}
                className="bg-transparent border-none outline-none text-xs text-ink-primary placeholder-ink-dim w-full font-sans"
              />
              {isSearching ? (
                <Loader2 className="w-3.5 h-3.5 text-cobalt animate-spin shrink-0" />
              ) : searchQuery ? (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  className="text-ink-muted hover:text-ink-primary"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : null}
            </div>

            {/* Autocomplete Dropdown */}
            {isSearchOpen && (
              <div className="absolute left-0 mt-1.5 w-80 max-h-88 overflow-y-auto bg-surface-elevated/95 backdrop-blur-xl border border-surface-border rounded-lg p-1.5 shadow-floating z-50 text-xs space-y-1.5">
                {/* Pinned Physics Study Areas */}
                <div>
                  <div className="text-label px-2 py-1 text-cobalt border-b border-surface-border/50 flex items-center gap-1.5 mb-1">
                    <MapPin className="w-3 h-3" />
                    <span>Physics Study Areas</span>
                  </div>
                  {filteredPinned.length > 0 ? (
                    filteredPinned.map((area) => (
                      <button
                        key={area.id}
                        onClick={() => handleSelectStudyArea(area)}
                        className="w-full flex items-center justify-between p-1.5 rounded-md hover:bg-surface-interactive text-left text-ink-secondary hover:text-ink-primary transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{area.flag}</span>
                          <div>
                            <div className="font-medium text-xs text-ink-primary">
                              {area.name}
                            </div>
                            <div className="text-[10px] text-ink-muted">
                              {area.city}, {area.country}
                            </div>
                          </div>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-status-safe/10 text-status-safe border border-status-safe/20">
                          Grid
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-2 py-1 text-[11px] text-ink-dim italic">
                      No matching study areas
                    </div>
                  )}
                </div>

                {/* Worldwide Nominatim Results */}
                {searchQuery.trim() && (
                  <div className="border-t border-surface-border/50 pt-1">
                    <div className="text-label px-2 py-1 text-ink-muted flex items-center gap-1.5 mb-1">
                      <Globe className="w-3 h-3" />
                      <span>Global Locations (OSM Reference)</span>
                    </div>

                    {isSearching ? (
                      <div className="p-3 text-center text-ink-muted flex items-center justify-center gap-2 text-xs">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cobalt" />
                        <span>Searching geocoder…</span>
                      </div>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSelectNominatim(item)}
                          className="w-full flex items-start gap-2 p-1.5 rounded-md hover:bg-surface-interactive text-left text-ink-secondary hover:text-ink-primary transition-colors"
                        >
                          <MapPin className="w-3.5 h-3.5 text-ink-dim shrink-0 mt-0.5" />
                          <div className="truncate">
                            <div className="font-medium text-xs text-ink-primary truncate">
                              {item.display_name.split(",")[0]}
                            </div>
                            <div className="text-[10px] text-ink-dim truncate">
                              {item.display_name}
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="p-2 text-center text-ink-dim text-xs italic">
                        No global locations found
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Quick Camera Actions */}
        <div className="flex items-center gap-1.5 bg-surface-elevated/90 backdrop-blur-md border border-surface-border p-1 rounded-md shadow-floating text-xs text-ink-primary pointer-events-auto">
          {/* 2D / 3D Segmented Control */}
          <div className="flex items-center bg-surface-base p-0.5 rounded border border-surface-border">
            <button
              onClick={() => setIs3DMode(false)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
                !is3DMode
                  ? "bg-cobalt text-white font-medium shadow-sm"
                  : "text-ink-muted hover:text-ink-primary"
              }`}
            >
              2D
            </button>
            <button
              onClick={() => setIs3DMode(true)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
                is3DMode
                  ? "bg-cobalt text-white font-medium shadow-sm"
                  : "text-ink-muted hover:text-ink-primary"
              }`}
            >
              3D
            </button>
          </div>

          {/* Reset View */}
          <button
            onClick={handleResetView}
            className="p-1 rounded text-ink-muted hover:text-ink-primary hover:bg-surface-interactive transition-colors"
            title="Reset Camera Orientation & Zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. Secondary Floating Control Bar: Layer, Scenario, Opacity & Grid */}
      <div className="absolute top-12 left-2.5 z-20 flex flex-wrap items-center gap-2 bg-surface-elevated/90 backdrop-blur-md border border-surface-border p-1.5 rounded-md shadow-floating text-xs text-ink-primary max-w-[calc(100%-20px)]">
        {/* Layer Dropdown */}
        <div className="flex items-center gap-1.5 pl-0.5">
          <Layers className="w-3.5 h-3.5 text-cobalt shrink-0" />
          <select
            value={selectedLayer}
            onChange={(e) => setSelectedLayer(e.target.value)}
            className="bg-surface-base border border-surface-border text-ink-primary text-xs px-2 py-1 rounded outline-none focus:border-cobalt transition-colors font-sans cursor-pointer"
          >
            <option value="baseline_temperature_c">Modelled Surface Temperature (SEB)</option>
            <option value="canopy_height">Tree Canopy Height (m)</option>
            <option value="population_density">Demographic Exposure</option>
            <option value="anthropogenic_heat_qf">Waste Heat Flux (Qf)</option>
            <option value="building_height">Building Heights (m)</option>
            <option value="albedo">Surface Albedo (α)</option>
          </select>
        </div>

        {/* Scenario Dropdown */}
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-status-high shrink-0" />
          <select
            value={activeScenario}
            onChange={(e) => {
              setActiveScenario(e.target.value);
              if (typeof window !== "undefined") {
                localStorage.setItem("urbancoolsim_scenario", e.target.value);
              }
            }}
            className="bg-surface-base border border-surface-border text-ink-primary text-xs px-2 py-1 rounded outline-none focus:border-cobalt transition-colors font-sans cursor-pointer"
          >
            <option value="baseline">Baseline (Modelled)</option>
            <option value="cool_roofs">Cool Roofs (α=0.85)</option>
            <option value="green_roofs">Green Roofs (Extensive)</option>
            <option value="tree_canopy">Tree Canopy Corridor</option>
            <option value="optimized">
              {appliedSolution ? `NSGA-II Portfolio #${appliedSolution.solution_id} (Applied)` : "NSGA-II Optimized Strategy"}
            </option>
          </select>
        </div>

        <div className="h-3.5 w-px bg-surface-border hidden sm:block" />

        {/* Overlay Opacity Slider */}
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-ink-dim text-[11px] font-sans">Alpha:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={thermalOpacity}
            onChange={(e) => setThermalOpacity(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${thermalOpacity * 100}%, var(--surface-hover) ${thermalOpacity * 100}%, var(--surface-hover) 100%)`
            }}
            className="w-16 cursor-pointer"
            title="Adjust raster opacity"
          />
          <span className="text-ink-secondary font-mono text-[10px] w-5">
            {Math.round(thermalOpacity * 100)}%
          </span>
        </div>

        <div className="h-3.5 w-px bg-surface-border hidden sm:block" />

        {/* Analysis Grid Toggle */}
        <button
          onClick={() => setShowAnalysisGrid(!showAnalysisGrid)}
          className={`px-2 py-0.5 rounded text-[11px] font-sans transition-colors flex items-center gap-1 border ${
            showAnalysisGrid
              ? "bg-cobalt/15 text-cobalt border-cobalt/30 font-medium"
              : "bg-transparent text-ink-muted border-transparent hover:text-ink-primary"
          }`}
          title="Toggle spatial cell grid lines"
        >
          <Grid className="w-3 h-3" />
          <span>Grid</span>
        </button>
      </div>

      {/* 3b. Applied NSGA-II Portfolio Banner */}
      {activeScenario === "optimized" && appliedSolution && (
        <div className="absolute top-[88px] left-2.5 z-20 flex flex-wrap items-center gap-2.5 bg-surface-elevated/95 backdrop-blur-md border border-cobalt/40 px-3 py-1.5 rounded-md shadow-floating text-xs font-mono animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="flex items-center gap-1.5 font-semibold text-cobalt">
            <span className="w-1.5 h-1.5 rounded-full bg-cobalt animate-ping" />
            Portfolio #{appliedSolution.solution_id} Active
          </span>
          <span className="text-ink-dim hidden sm:inline">|</span>
          <span className="text-[11px] text-ink-secondary">
            ΔT: <strong className="text-status-safe">−{(appliedSolution.validated_delta_t || appliedSolution.delta_t_mean || 0).toFixed(1)}°C</strong>
          </span>
          <span className="text-ink-dim hidden sm:inline">•</span>
          <span className="text-[11px] text-ink-secondary">
            CapEx: <strong className="text-ink-primary">${Math.round(appliedSolution.total_cost_usd / 1000)}k</strong>
          </span>
          <span className="text-ink-dim hidden sm:inline">•</span>
          <span className="text-[11px] text-ink-secondary">
            Cool Roof: <strong className="text-ink-primary">{appliedSolution.cool_roof_pct}%</strong>
          </span>
          <span className="text-ink-dim hidden sm:inline">•</span>
          <span className="text-[11px] text-ink-secondary">
            Trees: <strong className="text-status-safe">+{appliedSolution.tree_canopy_pct}%</strong>
          </span>
          <button
            onClick={() => {
              setActiveScenario("baseline");
              if (typeof window !== "undefined") {
                localStorage.setItem("urbancoolsim_scenario", "baseline");
              }
            }}
            className="ml-1 text-[10px] text-ink-dim hover:text-ink-primary px-1.5 py-0.5 rounded bg-surface-base border border-surface-border transition-colors cursor-pointer"
            title="Reset to Baseline scenario"
          >
            Reset
          </button>
        </div>
      )}

      {/* 4. Global Notice for Non-LST Layers outside Study Areas */}
      {dataMode === "not_available" && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-surface-elevated/95 backdrop-blur-md border border-status-high/30 px-3.5 py-1.5 rounded-md shadow-floating text-xs text-status-high">
          <Info className="w-3.5 h-3.5 text-status-high shrink-0" />
          <span>
            Global reference unavailable for <strong>{layerMeta.label}</strong>. Zoom into a local study area.
          </span>
        </div>
      )}

      {/* 5. OSM Status Badge (3D mode) */}
      {is3DMode && osmStatus && (
        <div className="absolute top-24 left-2.5 z-20 flex items-center gap-1.5 bg-surface-elevated/90 backdrop-blur-md border border-surface-border px-2.5 py-1 rounded-md text-[10px] font-mono text-ink-secondary">
          {osmLoading ? (
            <span className="w-1.5 h-1.5 rounded-full bg-status-high animate-subtle-pulse" />
          ) : osmBuildings ? (
            <span className="w-1.5 h-1.5 rounded-full bg-status-safe" />
          ) : (
            <AlertCircle className="w-3 h-3 text-status-high" />
          )}
          {osmStatus}
        </div>
      )}

      {/* 6. Bottom-Left: Collapsible Scientific Legend */}
      <div className="absolute bottom-3 left-3 z-20 bg-surface-elevated/90 backdrop-blur-md border border-surface-border p-2.5 rounded-lg shadow-floating text-xs space-y-1.5 min-w-48 max-w-64">
        <div className="flex items-center justify-between gap-2 border-b border-surface-border/50 pb-1">
          <div className="flex items-center gap-1.5 text-[10px] font-mono font-medium text-ink-primary">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                dataMode === "local"
                  ? "bg-cobalt"
                  : dataMode === "crossfade"
                  ? "bg-status-high animate-subtle-pulse"
                  : dataMode === "gibs"
                  ? "bg-status-safe"
                  : "bg-status-high"
              }`}
            />
            <span className="truncate">
              {dataMode === "local"
                ? resolutionLabel
                : dataMode === "crossfade"
                ? `MODIS ↔ ${resolutionLabel}`
                : dataMode === "gibs"
                ? "NASA MODIS ~1km"
                : `Modelled ${resolutionLabel}`}
            </span>
          </div>

          <button
            onClick={() => setIsLegendCollapsed(!isLegendCollapsed)}
            className="text-ink-muted hover:text-ink-primary transition-colors p-0.5"
            title={isLegendCollapsed ? "Expand legend" : "Collapse legend"}
          >
            {isLegendCollapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {!isLegendCollapsed && (
          <>
            {dataMode === "not_available" ? (
              <div className="space-y-1 pt-0.5">
                <div className="text-[11px] font-medium text-ink-primary">
                  {layerMeta.label}
                </div>
                <div className="text-[10px] text-ink-muted leading-snug">
                  Global reference available for Surface Temperature (LST).
                </div>
              </div>
            ) : dataMode === "gibs" ? (
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] text-ink-muted">
                  <span>{NASA_GIBS_LST_META.label}</span>
                  <span className="font-mono text-ink-secondary">{NASA_GIBS_LST_META.unit}</span>
                </div>
                <div
                  className="w-full h-1.5 rounded-full"
                  style={{ background: NASA_GIBS_LST_META.gradientCss }}
                />
                <div className="flex justify-between text-[9px] text-ink-muted font-mono">
                  <span>{NASA_GIBS_LST_META.minLabel}</span>
                  <span>{NASA_GIBS_LST_META.maxLabel}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] text-ink-muted">
                  <span>{layerMeta.label}</span>
                  <span className="font-mono text-ink-secondary">{layerMeta.unit}</span>
                </div>
                <div
                  className="w-full h-1.5 rounded-full"
                  style={{ background: layerMeta.gradientCss }}
                />
                <div className="flex justify-between text-[9px] text-ink-muted font-mono">
                  <span>{selectedLayer === "baseline_temperature_c" ? `${layerDomain.min.toFixed(1)}°C` : layerMeta.minLabel}</span>
                  <span>{selectedLayer === "baseline_temperature_c" ? `${layerDomain.max.toFixed(1)}°C` : layerMeta.maxLabel}</span>
                </div>
                <p className="text-[9px] text-ink-dim leading-snug pt-1">
                  {gridData?.metadata?.layer_provenance?.[selectedLayer] || layerMeta.source}
                </p>
                {selectedLayer === "baseline_temperature_c" && gridData?.metadata?.coverage_note && (
                  <p className="text-[9px] text-ink-dim leading-snug">
                    {gridData.metadata.coverage_note}
                  </p>
                )}
                {gridData?.metadata?.provenance_note && selectedLayer === "baseline_temperature_c" && (
                  <p className="text-[9px] text-amber-200/90 leading-snug">
                    {gridData.metadata.provenance_note}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* 7. Bottom-Right: Tactical Cell Inspector HUD */}
      {activeInspection && (
        <div className="absolute bottom-3 right-3 z-20 bg-surface-elevated/95 backdrop-blur-md border border-surface-border p-3 rounded-lg shadow-floating text-xs space-y-2.5 min-w-56 max-w-72 animate-fade-in">
          <div className="flex items-center justify-between border-b border-surface-border pb-1.5 gap-2">
            <div className="flex items-center gap-1.5 truncate">
              {activeInspection.landmarkName ? (
                <div className="flex items-center gap-1 text-xs font-semibold text-cobalt truncate">
                  <Building className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[190px]">{activeInspection.landmarkName}</span>
                </div>
              ) : (
                <>
                  <MapPin className="w-3.5 h-3.5 text-cobalt shrink-0" />
                  <span className="font-medium text-xs text-ink-primary font-mono truncate">
                    {activeInspection.row !== undefined
                      ? `Parcel [${activeInspection.row}, ${activeInspection.col}]`
                      : "Feature"}
                  </span>
                </>
              )}
            </div>
            {selectedCell && (
              <button
                onClick={() => setSelectedCell(null)}
                className="text-ink-muted hover:text-ink-primary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="space-y-1.5 text-[11px]">
            {/* Prominent Temperature Display */}
            <div className="flex items-baseline justify-between bg-surface-base/80 p-2 rounded border border-surface-border">
              <span className="text-ink-muted text-[10px]">Surface Temp (LST):</span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-status-critical font-bold text-sm font-mono">
                  {activeInspection.temp}
                </span>
                <span className="text-[10px] text-ink-muted">°C</span>
              </div>
            </div>

            {/* 2-Column Property Grid */}
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <div className="surface-inset p-1.5 rounded">
                <span className="text-[9px] text-ink-dim block font-mono">HEIGHT</span>
                <span className="text-[11px] font-mono text-ink-primary">{activeInspection.height}m</span>
              </div>
              <div className="surface-inset p-1.5 rounded">
                <span className="text-[9px] text-ink-dim block font-mono">CANOPY</span>
                <span className="text-[11px] font-mono text-status-safe">{activeInspection.canopyHeight}m</span>
              </div>
              <div className="surface-inset p-1.5 rounded">
                <span className="text-[9px] text-ink-dim block font-mono">EXPOSURE</span>
                <span className="text-[11px] font-mono text-ink-primary">{activeInspection.popDensity} /ha</span>
              </div>
              <div className="surface-inset p-1.5 rounded">
                <span className="text-[9px] text-ink-dim block font-mono">ALBEDO</span>
                <span className="text-[11px] font-mono text-ink-primary">{activeInspection.albedo}</span>
              </div>
            </div>

            {/* Predicted Cooling Benefit */}
            {activeScenario !== "baseline" && activeInspection.coolingPotential && (
              <div className="mt-1 p-1.5 rounded bg-status-safe/10 border border-status-safe/20 flex justify-between items-center text-[11px] text-status-safe font-mono font-medium">
                <span>Predicted ΔT:</span>
                <span>{activeInspection.coolingPotential}°C</span>
              </div>
            )}

            {/* Waste Heat Flux Display */}
            {activeInspection.qfAnthro !== undefined && (
              <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 flex justify-between items-center text-[10px] text-amber-300 font-mono">
                <span className="text-ink-muted">Waste Heat (Qf):</span>
                <span className="font-semibold">{activeInspection.qfAnthro} W/m²</span>
              </div>
            )}

            {/* Actionable Microclimate Recommendation */}
            {activeInspection.intervention && (
              <div className="p-1.5 rounded bg-surface-base border border-surface-border text-[10px] text-ink-secondary leading-snug">
                <span className="font-semibold text-cobalt">Intervention: </span>
                {activeInspection.intervention}
              </div>
            )}

            {/* NSGA-II Portfolio ROI Summary if applied */}
            {activeScenario === "optimized" && appliedSolution && (
              <div className="p-1.5 rounded bg-cobalt/10 border border-cobalt/25 text-[10px] text-cobalt font-mono space-y-0.5">
                <div className="font-semibold flex justify-between items-center">
                  <span>Portfolio #{appliedSolution.solution_id} Strategy</span>
                  <span className="text-status-safe">Active</span>
                </div>
                <div className="text-[9px] text-ink-muted flex justify-between">
                  <span>HVAC Saved: {Math.round(appliedSolution.hvac_energy_savings_kwh ?? 0).toLocaleString()} kWh/yr</span>
                  <span>Payback: {appliedSolution.payback_period_years ? `${appliedSolution.payback_period_years}y` : "N/A"}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 8. Micro Attribution */}
      <div className="absolute bottom-1 right-2 z-10 text-[9px] text-ink-dim pointer-events-none font-mono">
        © Esri · NASA GIBS · Local SEB model
      </div>
    </div>
  );
}

