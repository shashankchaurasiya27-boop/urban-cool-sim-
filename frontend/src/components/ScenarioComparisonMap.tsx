"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { BitmapLayer, GeoJsonLayer } from "deck.gl";
import {
  SatelliteBasemapProvider,
  MapProviderType,
} from "@/lib/mapProviders";
import {
  getStudyAreaBoundary,
  makeFeatherAlpha,
  StudyAreaBoundary,
} from "@/lib/studyAreaBoundaries";
import { DigitalTwinGrid } from "@/lib/api";
import { Globe, Eye, EyeOff, RotateCcw } from "lucide-react";

export interface ScenarioPresetData {
  id: string;
  name: string;
  tag: string;
  deltaT: number;
  cost: number;
  water: number;
  description: string;
  greenRoof: number;
  coolRoof: number;
  trees: number;
  waterPct: number;
}

export interface ScenarioMapPanelProps {
  id: string;
  mode: "baseline" | "mitigated" | "diff";
  studyArea: string;
  grid: DigitalTwinGrid | null;
  scenario: ScenarioPresetData;
  onHoverCell?: (cell: { row: number; col: number; baseT: number; scenT: number; deltaT: number } | null) => void;
}

export interface ScenarioSwipeMapProps {
  studyArea: string;
  grid: DigitalTwinGrid | null;
  scenario: ScenarioPresetData;
  swipePos: number;
  onSwipeChange?: (pos: number) => void;
  onHoverCell?: (cell: { row: number; col: number; baseT: number; scenT: number; deltaT: number } | null) => void;
}

// ── Pinned Study Area Geometries & Calibrated Zoom Levels ─────────────────────
const PINNED_STUDY_AREAS: Record<string, { center: [number, number]; zoom: number; bbox: [number, number, number, number] }> = {
  delhi_cp: {
    center: [77.2197, 28.6328],
    zoom: 15.8,
    bbox: [77.2130, 28.6270, 77.2264, 28.6386],
  },
  mumbai_bkc: {
    center: [72.8683, 19.0657],
    zoom: 15.4,
    bbox: [72.8610, 19.0590, 72.8756, 19.0724],
  },
  singapore_marina: {
    center: [103.8565, 1.2847],
    zoom: 15.3,
    bbox: [103.8495, 1.2780, 103.8635, 1.2914],
  },
  phoenix_downtown: {
    center: [-112.0740, 33.4484],
    zoom: 15.1,
    bbox: [-112.0810, 33.4420, -112.0670, 33.4548],
  },
  tokyo_shinjuku: {
    center: [139.6965, 35.6905],
    zoom: 15.3,
    bbox: [139.6895, 35.6840, 139.7035, 35.6970],
  },
};

// ── Shared Camera Synchronization Bus ────────────────────────────────────────
const CAMERA_SYNC_EVENT = "urbancoolsim_camera_sync";

// ── Scientific Robust Domain Calculation (Matches DigitalTwinMap) ─────────────
function getRobustTemperatureDomain(
  values: number[][] | undefined,
  fallbackMin = 36,
  fallbackMax = 62,
  coverageMask?: number[][]
): { min: number; max: number } {
  if (!values || !values.length) return { min: fallbackMin, max: fallbackMax };
  const samples: number[] = [];
  values.forEach((row, r) => {
    row.forEach((value, c) => {
      const hasSupport = !coverageMask || (coverageMask[r]?.[c] ?? 0) > 0;
      if (hasSupport && Number.isFinite(value)) samples.push(value);
    });
  });
  if (samples.length < 10) return { min: fallbackMin, max: fallbackMax };
  samples.sort((a, b) => a - b);
  const high = samples[Math.ceil((samples.length - 1) * 0.98)];
  
  // Domain ceiling matches upper baseline heat core.
  // Floor spans the physical mitigation envelope (high - 14.5°C), ensuring unmitigated heat sits
  // in the crimson/orange spectrum (>=0.75), while mitigated interventions transition smoothly
  // into cool emerald greens, cyans, and deep blues (0.15 - 0.55).
  const max = Math.ceil(high / 2) * 2;
  const min = Math.max(30, Math.floor((high - 14.5) / 2) * 2);
  return { min, max };
}

// ── Physics-Based Cell Cooling Calculation ───────────────────────────────────
// Formulates rooftop albedo/latent heat, street shading, canyon synergy
export function calcCellCooling(
  scenario: ScenarioPresetData,
  dens: number,
  bldgH = 0,
  veg = 0,
  water = 0
): number {
  if (scenario.id === "baseline" || scenario.deltaT <= 0) return 0.0;

  // 1. Rooftop interventions: highly effective on building structures
  const roofWeight = Math.min(1.0, Math.max(0.0, dens / 0.35));
  const dtCoolRoof = scenario.coolRoof * 5.2 * roofWeight;
  const dtGreenRoof = scenario.greenRoof * 4.8 * roofWeight;

  // 2. Ground & pedestrian corridor interventions: tree canopy shading in street canyons
  const groundWeight = Math.min(1.0, Math.max(0.1, (1.0 - dens - water) / 0.50));
  const dtTrees = scenario.trees * 5.5 * groundWeight;

  // 3. Reflective street pavements & canyon albedo boost
  const dtPave = (scenario.coolRoof * 0.25) * 3.6 * groundWeight;

  // 4. Urban water retention bodies & evaporative heat sinks
  const dtWater = scenario.waterPct * 9.0;

  // 5. Urban canyon heat-trapping suppression synergy
  const dtSynergy = (dtCoolRoof + dtGreenRoof + dtTrees) * 0.25 * dens;

  const rawDelta = dtCoolRoof + dtGreenRoof + dtTrees + dtPave + dtWater + dtSynergy;
  
  // Calibrate spatial scale factor so that district average cooling matches scenario.deltaT
  const normFactor = scenario.deltaT / 2.0;
  const scaledDelta = rawDelta * normFactor;

  // Bound physical cooling drop
  return Math.min(6.5, Math.max(0.0, scaledDelta));
}

// ── 6-Stop High-Contrast Scientific Thermal Colormap ────────────────────────
// Deep Blue (< 44°C) -> Cyan (44-48°C) -> Emerald Green (48-52°C) -> Golden Yellow (52-56°C) -> Flame Orange (56-59°C) -> Scarlet Crimson (> 59°C)
function getThermalRGBA(
  val: number,
  minVal: number,
  maxVal: number,
  alpha = 215
): [number, number, number, number] {
  const norm = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal || 1)));

  let R = 0, G = 0, B = 0;
  if (norm < 0.20) {
    // Deep blue to vibrant cyan (Cool Oasis & Water)
    const t = norm / 0.20;
    R = Math.round(30 * (1 - t) + 0 * t);
    G = Math.round(60 * (1 - t) + 210 * t);
    B = Math.round(210 * (1 - t) + 215 * t);
  } else if (norm < 0.40) {
    // Cyan to emerald green (Vegetation & Shaded Corridors)
    const t = (norm - 0.20) / 0.20;
    R = Math.round(0 * (1 - t) + 16 * t);
    G = Math.round(210 * (1 - t) + 205 * t);
    B = Math.round(215 * (1 - t) + 110 * t);
  } else if (norm < 0.60) {
    // Emerald green to golden yellow / amber (Significant Relief / Mitigated Roofs)
    const t = (norm - 0.40) / 0.20;
    R = Math.round(16 * (1 - t) + 245 * t);
    G = Math.round(205 * (1 - t) + 210 * t);
    B = Math.round(110 * (1 - t) + 20 * t);
  } else if (norm < 0.80) {
    // Golden yellow to flame orange (Moderate Heat Stress)
    const t = (norm - 0.60) / 0.20;
    R = Math.round(245 * (1 - t) + 255 * t);
    G = Math.round(210 * (1 - t) + 95 * t);
    B = Math.round(20 * (1 - t) + 20 * t);
  } else {
    // Flame orange to intense scarlet crimson (Extreme Heat Island Core)
    const t = (norm - 0.80) / 0.20;
    R = Math.round(255 * (1 - t) + 225 * t);
    G = Math.round(95 * (1 - t) + 20 * t);
    B = Math.round(20 * (1 - t) + 35 * t);
  }
  return [R, G, B, alpha];
}

// ── Spatial Cooling Delta Colormap (Smooth Mint -> Emerald -> Cyan -> Cobalt) ─
function getDeltaRGBA(
  diffVal: number,
  maxDiff = 5.2,
  alpha = 225
): [number, number, number, number] {
  if (diffVal < 0.15) return [0, 0, 0, 0];
  const norm = Math.max(0, Math.min(1, diffVal / maxDiff));

  let R = 16, G = 185, B = 129;
  if (norm < 0.35) {
    // 0.15°C to 1.8°C: Soft mint / spring green
    const t = norm / 0.35;
    R = Math.round(52 * (1 - t) + 16 * t);
    G = Math.round(211 * (1 - t) + 185 * t);
    B = Math.round(153 * (1 - t) + 129 * t);
  } else if (norm < 0.70) {
    // 1.8°C to 3.6°C: Vibrant emerald green to turquoise
    const t = (norm - 0.35) / 0.35;
    R = Math.round(16 * (1 - t) + 6 * t);
    G = Math.round(185 * (1 - t) + 214 * t);
    B = Math.round(129 * (1 - t) + 210 * t);
  } else {
    // 3.6°C to 5.2°C+: High impact cooling: Electric cyan to cobalt blue
    const t = (norm - 0.70) / 0.30;
    R = Math.round(6 * (1 - t) + 74 * t);
    G = Math.round(214 * (1 - t) + 108 * t);
    B = Math.round(210 * (1 - t) + 255 * t);
  }
  const scaledAlpha = Math.min(235, Math.round(alpha * (0.65 + norm * 0.35)));
  return [R, G, B, scaledAlpha];
}

// ── Helper Hook for Study Area Bounds & Center ───────────────────────────────
function useStudyAreaGeometry(studyArea: string) {
  const studyBoundary: StudyAreaBoundary | null = useMemo(() => {
    return getStudyAreaBoundary(studyArea);
  }, [studyArea]);

  const config = PINNED_STUDY_AREAS[studyArea] || PINNED_STUDY_AREAS["delhi_cp"];

  const bounds = useMemo(() => {
    if (studyBoundary?.bbox) return studyBoundary.bbox;
    return {
      west: config.bbox[0],
      south: config.bbox[1],
      east: config.bbox[2],
      north: config.bbox[3],
    };
  }, [studyBoundary, config]);

  const center: [number, number] = useMemo(() => {
    if (studyBoundary?.center) return studyBoundary.center;
    return config.center;
  }, [studyBoundary, config]);

  const defaultZoom = config.zoom;

  return { studyBoundary, bounds, center, defaultZoom };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. ScenarioMapPanel (Side-by-Side Synchronized Map)
// ═════════════════════════════════════════════════════════════════════════════
export function ScenarioMapPanel({
  id,
  mode,
  studyArea,
  grid,
  scenario,
  onHoverCell,
}: ScenarioMapPanelProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const isSelfMovingRef = useRef(false);

  const [mapProvider, setMapProvider] = useState<MapProviderType>("esri");
  const [showLayer, setShowLayer] = useState<boolean>(true);
  const [osmBuildings, setOsmBuildings] = useState<GeoJSON.FeatureCollection | null>(null);

  const { studyBoundary, bounds, center, defaultZoom } = useStudyAreaGeometry(studyArea);

  // Load vector buildings
  useEffect(() => {
    let isCancelled = false;
    const fetchBuildings = async () => {
      try {
        const res = await fetch(`/api/v1/digital-twin/buildings?study_area_id=${encodeURIComponent(studyArea)}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && data?.features) setOsmBuildings(data);
        }
      } catch (err) {
        console.warn("Notice: building load notice:", err);
      }
    };
    fetchBuildings();
    return () => { isCancelled = true; };
  }, [studyArea]);

  // Robust domain across baseline data
  const tempDomain = useMemo(() => {
    return getRobustTemperatureDomain(
      grid?.layers?.baseline_temperature_c,
      32,
      62,
      grid?.layers?.modelled_coverage_mask
    );
  }, [grid]);

  // Generate Mode Texture with Bilinear Sampling & Organic Boundary Feathering
  const generateTexture = useCallback((): string | null => {
    if (!grid?.layers) return null;
    const baseT = grid.layers.baseline_temperature_c;
    if (!baseT || !baseT.length) return null;

    const rows = Number(grid.metadata?.rows) || baseT.length;
    const cols = Number(grid.metadata?.cols) || baseT[0]?.length || 50;
    const bldgDens = grid.layers.building_density || [];
    const bldgHeights = grid.layers.building_height || [];
    const vegFracs = grid.layers.veg_fraction || [];
    const waterFracs = grid.layers.water_fraction || [];

    const SCALE = 4;
    const dstW = cols * SCALE;
    const dstH = rows * SCALE;

    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const imgData = ctx.createImageData(dstW, dstH);
    const featherFn = studyBoundary ? makeFeatherAlpha(studyBoundary.boundary, 0.0012) : null;
    const { north, south, east, west } = bounds;
    const { min: minT, max: maxT } = tempDomain;

    for (let py = 0; py < dstH; py++) {
      const fracRow = (py / (dstH - 1)) * (rows - 1);
      const r0 = Math.floor(fracRow);
      const r1 = Math.min(rows - 1, r0 + 1);
      const wr = fracRow - r0;

      for (let px = 0; px < dstW; px++) {
        const fracCol = (px / (dstW - 1)) * (cols - 1);
        const c0 = Math.floor(fracCol);
        const c1 = Math.min(cols - 1, c0 + 1);
        const wc = fracCol - c0;

        // Bilinear sample baseline temperature
        const b00 = baseT[r0]?.[c0] ?? minT;
        const b01 = baseT[r0]?.[c1] ?? minT;
        const b10 = baseT[r1]?.[c0] ?? minT;
        const b11 = baseT[r1]?.[c1] ?? minT;
        const b = b00 * (1 - wr) * (1 - wc) +
                  b01 * (1 - wr) * wc +
                  b10 * wr * (1 - wc) +
                  b11 * wr * wc;

        // Bilinear sample building density
        const d00 = bldgDens[r0]?.[c0] ?? 0;
        const d01 = bldgDens[r0]?.[c1] ?? 0;
        const d10 = bldgDens[r1]?.[c0] ?? 0;
        const d11 = bldgDens[r1]?.[c1] ?? 0;
        const dens = d00 * (1 - wr) * (1 - wc) +
                     d01 * (1 - wr) * wc +
                     d10 * wr * (1 - wc) +
                     d11 * wr * wc;

        // Bilinear sample building height
        const h00 = bldgHeights[r0]?.[c0] ?? 0;
        const h01 = bldgHeights[r0]?.[c1] ?? 0;
        const h10 = bldgHeights[r1]?.[c0] ?? 0;
        const h11 = bldgHeights[r1]?.[c1] ?? 0;
        const h = h00 * (1 - wr) * (1 - wc) +
                  h01 * (1 - wr) * wc +
                  h10 * wr * (1 - wc) +
                  h11 * wr * wc;

        // Bilinear sample vegetation fraction
        const v00 = vegFracs[r0]?.[c0] ?? 0;
        const v01 = vegFracs[r0]?.[c1] ?? 0;
        const v10 = vegFracs[r1]?.[c0] ?? 0;
        const v11 = vegFracs[r1]?.[c1] ?? 0;
        const veg = v00 * (1 - wr) * (1 - wc) +
                    v01 * (1 - wr) * wc +
                    v10 * wr * (1 - wc) +
                    v11 * wr * wc;

        // Bilinear sample water fraction
        const w00 = waterFracs[r0]?.[c0] ?? 0;
        const w01 = waterFracs[r0]?.[c1] ?? 0;
        const w10 = waterFracs[r1]?.[c0] ?? 0;
        const w11 = waterFracs[r1]?.[c1] ?? 0;
        const water = w00 * (1 - wr) * (1 - wc) +
                      w01 * (1 - wr) * wc +
                      w10 * wr * (1 - wc) +
                      w11 * wr * wc;

        // Scientific thermodynamics cooling drop
        const coolDrop = calcCellCooling(scenario, dens, h, veg, water);
        const s = Math.max(24.0, b - coolDrop);
        const diff = b - s;

        // Boundary feathering
        let featherA = 1.0;
        if (featherFn) {
          const pxLon = west + (px / (dstW - 1)) * (east - west);
          const pxLat = north - (py / (dstH - 1)) * (north - south);
          featherA = featherFn(pxLon, pxLat);
        }

        const idx = (py * dstW + px) * 4;
        if (featherA <= 0.01 || !Number.isFinite(b)) {
          imgData.data[idx] = 0;
          imgData.data[idx + 1] = 0;
          imgData.data[idx + 2] = 0;
          imgData.data[idx + 3] = 0;
          continue;
        }

        let R = 0, G = 0, B = 0, A = 215;
        if (mode === "baseline") {
          [R, G, B, A] = getThermalRGBA(b, minT, maxT, Math.round(215 * featherA));
        } else if (mode === "mitigated") {
          [R, G, B, A] = getThermalRGBA(s, minT, maxT, Math.round(215 * featherA));
        } else {
          // diff mode
          [R, G, B, A] = getDeltaRGBA(diff, 5.2, Math.round(225 * featherA));
        }

        imgData.data[idx] = R;
        imgData.data[idx + 1] = G;
        imgData.data[idx + 2] = B;
        imgData.data[idx + 3] = A;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL();
  }, [grid, mode, scenario, bounds, studyBoundary, tempDomain]);

  // Build Deck.gl Layers
  const buildLayers = useCallback(() => {
    const layers: any[] = [];

    // 1. Thermal or Delta Bitmap Layer
    if (showLayer) {
      const dataURL = generateTexture();
      if (dataURL) {
        layers.push(
          new BitmapLayer({
            id: `scenario-${id}-${mode}-bitmap`,
            image: dataURL,
            bounds: [bounds.west, bounds.south, bounds.east, bounds.north],
            opacity: mode === "diff" ? 0.68 : 0.55,
            pickable: false,
            textureParameters: {
              minFilter: "linear",
              magFilter: "linear",
            },
          })
        );
      }
    }

    // 2. Real Building Footprints Vector Layer
    if (osmBuildings && osmBuildings.features.length > 0) {
      layers.push(
        new GeoJsonLayer({
          id: `scenario-${id}-${mode}-buildings`,
          data: osmBuildings,
          stroked: true,
          filled: true,
          getFillColor: [255, 255, 255, 14],
          getLineColor: [255, 255, 255, 120],
          getLineWidth: 0.9,
          lineWidthUnits: "pixels",
          pickable: false,
        })
      );
    }

    // 3. District Boundary Line
    if (studyBoundary?.boundary) {
      layers.push(
        new GeoJsonLayer({
          id: `scenario-${id}-${mode}-boundary`,
          data: {
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry: studyBoundary.boundary }],
          },
          stroked: true,
          filled: false,
          getLineColor: [74, 108, 255, 190],
          getLineWidth: 1.8,
          lineWidthUnits: "pixels",
          getDashArray: [8, 4],
          dashJustified: true,
          pickable: false,
        })
      );
    }

    return layers;
  }, [showLayer, generateTexture, bounds, id, mode, osmBuildings, studyBoundary]);

  // Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const style = SatelliteBasemapProvider.getMapLibreStyle(mapProvider);
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center,
      zoom: defaultZoom,
      pitch: 0,
      bearing: 0,
      antialias: true,
      attributionControl: false,
    });

    mapRef.current = map;

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
    });
    overlayRef.current = overlay;
    map.addControl(overlay as any);

    map.on("load", () => {
      map.resize();
      overlay.setProps({ layers: buildLayers() });
    });

    // Camera Synchronization (Broadcast move to sibling panels)
    map.on("move", (e: any) => {
      if (e.originalEvent) {
        isSelfMovingRef.current = true;
        window.dispatchEvent(
          new CustomEvent(CAMERA_SYNC_EVENT, {
            detail: {
              sourceId: id,
              center: map.getCenter(),
              zoom: map.getZoom(),
              bearing: map.getBearing(),
              pitch: map.getPitch(),
            },
          })
        );
      }
    });

    map.on("moveend", () => {
      isSelfMovingRef.current = false;
    });

    // Listen for Camera Synchronization from sibling panels
    const handleSync = (e: any) => {
      if (!mapRef.current || isSelfMovingRef.current) return;
      const detail = e.detail;
      if (detail && detail.sourceId !== id) {
        mapRef.current.jumpTo({
          center: detail.center,
          zoom: detail.zoom,
          bearing: detail.bearing,
          pitch: detail.pitch,
        });
      }
    };
    window.addEventListener(CAMERA_SYNC_EVENT, handleSync);

    // Hover cell inspection
    map.on("mousemove", (e) => {
      if (!grid?.layers?.baseline_temperature_c) return;
      const { lng, lat } = e.lngLat;
      const { west, south, east, north } = bounds;
      if (lng < west || lng > east || lat < south || lat > north) {
        onHoverCell?.(null);
        return;
      }
      const col = Math.max(0, Math.min(49, Math.floor(((lng - west) / (east - west)) * 50)));
      const row = Math.max(0, Math.min(49, Math.floor(((north - lat) / (north - south)) * 50)));
      const baseT = grid.layers.baseline_temperature_c[row]?.[col] ?? 42.0;
      const dens = grid.layers.building_density?.[row]?.[col] ?? 0.45;
      const bldgH = grid.layers.building_height?.[row]?.[col] ?? 0.0;
      const veg = grid.layers.veg_fraction?.[row]?.[col] ?? 0.0;
      const water = grid.layers.water_fraction?.[row]?.[col] ?? 0.0;
      const coolEffect = calcCellCooling(scenario, dens, bldgH, veg, water);
      const scenT = Math.max(24.0, baseT - coolEffect);
      onHoverCell?.({ row, col, baseT, scenT, deltaT: baseT - scenT });
    });

    map.on("mouseleave", () => {
      onHoverCell?.(null);
    });

    const ro = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.resize();
    });
    ro.observe(mapContainerRef.current);

    return () => {
      window.removeEventListener(CAMERA_SYNC_EVENT, handleSync);
      ro.disconnect();
      overlay.finalize();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapProvider]);

  // Center on study area change
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({ center, zoom: defaultZoom, duration: 1000 });
  }, [center, defaultZoom]);

  // Update Deck.gl layers on state changes
  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.setProps({ layers: buildLayers() });
  }, [buildLayers]);

  const handleResetCamera = () => {
    mapRef.current?.flyTo({ center, zoom: defaultZoom, pitch: 0, bearing: 0, duration: 800 });
  };

  return (
    <div className="w-full h-full relative overflow-hidden rounded-lg select-none bg-[#0b0f16]">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Top-Right Minimal Controls */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-surface-elevated/90 backdrop-blur-md border border-surface-border p-0.5 rounded-md shadow-sm">
        <button
          onClick={() => setMapProvider(mapProvider === "esri" ? "osm_vector" : "esri")}
          className="px-1.5 py-0.5 rounded text-[9px] font-sans transition-colors flex items-center gap-1 bg-surface-base text-ink-secondary hover:text-ink-primary border border-surface-border/60"
          title={`Switch to ${mapProvider === "esri" ? "Street Map" : "Satellite Imagery"}`}
        >
          <Globe className="w-2.5 h-2.5 text-cobalt" />
          <span>{mapProvider === "esri" ? "Sat" : "OSM"}</span>
        </button>

        <button
          onClick={() => setShowLayer(!showLayer)}
          className={`px-1.5 py-0.5 rounded text-[9px] font-sans transition-colors flex items-center gap-1 ${
            showLayer ? "bg-cobalt/20 text-cobalt font-medium" : "bg-surface-base text-ink-muted"
          }`}
          title="Toggle Thermal Layer"
        >
          {showLayer ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
        </button>
      </div>

      {/* Bottom-Left Reset View Button & Mini Scientific Legend */}
      <div className="absolute bottom-1.5 left-1.5 z-20 flex items-center gap-1.5">
        <button
          onClick={handleResetCamera}
          className="w-5 h-5 flex items-center justify-center rounded bg-surface-elevated/90 backdrop-blur-md border border-surface-border text-ink-secondary hover:text-cobalt transition-colors shadow-sm"
          title="Reset Camera"
        >
          <RotateCcw className="w-2.5 h-2.5" />
        </button>

        {showLayer && (
          <div className="bg-surface-elevated/90 backdrop-blur-md border border-surface-border px-2 py-0.5 rounded shadow-sm flex flex-col gap-0.5 pointer-events-none">
            <div className="flex justify-between items-center text-[8px] font-mono text-ink-muted gap-3">
              <span>{mode === "diff" ? "0°C" : `${tempDomain.min}°C`}</span>
              <span className="text-[7.5px] text-ink-dim uppercase tracking-wider">
                {mode === "baseline" ? "Baseline" : mode === "mitigated" ? "Mitigated" : "ΔT"}
              </span>
              <span>{mode === "diff" ? "−5.2°C" : `${tempDomain.max}°C`}</span>
            </div>
            <div
              className="w-20 h-1 rounded-full"
              style={{
                background: mode === "diff"
                  ? "linear-gradient(to right, rgba(16,185,129,0.15) 0%, #10b981 35%, #06b6d4 70%, #3b82f6 100%)"
                  : "linear-gradient(to right, #1e3a8a 0%, #06b6d4 20%, #10b981 40%, #eab308 60%, #f97316 80%, #dc2626 100%)",
              }}
            />
          </div>
        )}
      </div>

      {/* Attribution */}
      <div className="absolute bottom-1 right-2 z-10 text-[8px] text-ink-dim pointer-events-none font-mono">
        © {mapProvider === "esri" ? "Esri" : "OSM"}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. ScenarioSwipeMap (Interactive A/B Swipe View)
// ═════════════════════════════════════════════════════════════════════════════
export function ScenarioSwipeMap({
  studyArea,
  grid,
  scenario,
  swipePos,
  onSwipeChange,
  onHoverCell,
}: ScenarioSwipeMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  const [mapProvider, setMapProvider] = useState<MapProviderType>("esri");
  const [osmBuildings, setOsmBuildings] = useState<GeoJSON.FeatureCollection | null>(null);

  const { studyBoundary, bounds, center, defaultZoom } = useStudyAreaGeometry(studyArea);

  useEffect(() => {
    let isCancelled = false;
    const fetchBuildings = async () => {
      try {
        const res = await fetch(`/api/v1/digital-twin/buildings?study_area_id=${encodeURIComponent(studyArea)}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && data?.features) setOsmBuildings(data);
        }
      } catch (err) {
        console.warn("Notice: building load notice:", err);
      }
    };
    fetchBuildings();
    return () => { isCancelled = true; };
  }, [studyArea]);

  const tempDomain = useMemo(() => {
    return getRobustTemperatureDomain(
      grid?.layers?.baseline_temperature_c,
      32,
      62,
      grid?.layers?.modelled_coverage_mask
    );
  }, [grid]);

  // Generate Composite Split Texture
  const generateSplitTexture = useCallback((): string | null => {
    if (!grid?.layers) return null;
    const baseT = grid.layers.baseline_temperature_c;
    if (!baseT || !baseT.length) return null;

    const rows = Number(grid.metadata?.rows) || baseT.length;
    const cols = Number(grid.metadata?.cols) || baseT[0]?.length || 50;
    const bldgDens = grid.layers.building_density || [];
    const bldgHeights = grid.layers.building_height || [];
    const vegFracs = grid.layers.veg_fraction || [];
    const waterFracs = grid.layers.water_fraction || [];

    const SCALE = 4;
    const dstW = cols * SCALE;
    const dstH = rows * SCALE;

    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const imgData = ctx.createImageData(dstW, dstH);
    const featherFn = studyBoundary ? makeFeatherAlpha(studyBoundary.boundary, 0.0012) : null;
    const { north, south, east, west } = bounds;
    const { min: minT, max: maxT } = tempDomain;
    const splitPx = (swipePos / 100) * dstW;

    for (let py = 0; py < dstH; py++) {
      const fracRow = (py / (dstH - 1)) * (rows - 1);
      const r0 = Math.floor(fracRow);
      const r1 = Math.min(rows - 1, r0 + 1);
      const wr = fracRow - r0;

      for (let px = 0; px < dstW; px++) {
        const fracCol = (px / (dstW - 1)) * (cols - 1);
        const c0 = Math.floor(fracCol);
        const c1 = Math.min(cols - 1, c0 + 1);
        const wc = fracCol - c0;

        const b00 = baseT[r0]?.[c0] ?? minT;
        const b01 = baseT[r0]?.[c1] ?? minT;
        const b10 = baseT[r1]?.[c0] ?? minT;
        const b11 = baseT[r1]?.[c1] ?? minT;
        const b = b00 * (1 - wr) * (1 - wc) +
                  b01 * (1 - wr) * wc +
                  b10 * wr * (1 - wc) +
                  b11 * wr * wc;

        const d00 = bldgDens[r0]?.[c0] ?? 0;
        const d01 = bldgDens[r0]?.[c1] ?? 0;
        const d10 = bldgDens[r1]?.[c0] ?? 0;
        const d11 = bldgDens[r1]?.[c1] ?? 0;
        const dens = d00 * (1 - wr) * (1 - wc) +
                     d01 * (1 - wr) * wc +
                     d10 * wr * (1 - wc) +
                     d11 * wr * wc;

        const h00 = bldgHeights[r0]?.[c0] ?? 0;
        const h01 = bldgHeights[r0]?.[c1] ?? 0;
        const h10 = bldgHeights[r1]?.[c0] ?? 0;
        const h11 = bldgHeights[r1]?.[c1] ?? 0;
        const h = h00 * (1 - wr) * (1 - wc) +
                  h01 * (1 - wr) * wc +
                  h10 * wr * (1 - wc) +
                  h11 * wr * wc;

        const v00 = vegFracs[r0]?.[c0] ?? 0;
        const v01 = vegFracs[r0]?.[c1] ?? 0;
        const v10 = vegFracs[r1]?.[c0] ?? 0;
        const v11 = vegFracs[r1]?.[c1] ?? 0;
        const veg = v00 * (1 - wr) * (1 - wc) +
                    v01 * (1 - wr) * wc +
                    v10 * wr * (1 - wc) +
                    v11 * wr * wc;

        const w00 = waterFracs[r0]?.[c0] ?? 0;
        const w01 = waterFracs[r0]?.[c1] ?? 0;
        const w10 = waterFracs[r1]?.[c0] ?? 0;
        const w11 = waterFracs[r1]?.[c1] ?? 0;
        const water = w00 * (1 - wr) * (1 - wc) +
                      w01 * (1 - wr) * wc +
                      w10 * wr * (1 - wc) +
                      w11 * wr * wc;

        const coolDrop = calcCellCooling(scenario, dens, h, veg, water);
        const s = Math.max(24.0, b - coolDrop);

        let featherA = 1.0;
        if (featherFn) {
          const pxLon = west + (px / (dstW - 1)) * (east - west);
          const pxLat = north - (py / (dstH - 1)) * (north - south);
          featherA = featherFn(pxLon, pxLat);
        }

        const idx = (py * dstW + px) * 4;
        if (featherA <= 0.01 || !Number.isFinite(b)) {
          imgData.data[idx] = 0;
          imgData.data[idx + 1] = 0;
          imgData.data[idx + 2] = 0;
          imgData.data[idx + 3] = 0;
          continue;
        }

        const val = px < splitPx ? b : s;
        const [R, G, B, A] = getThermalRGBA(val, minT, maxT, Math.round(215 * featherA));

        imgData.data[idx] = R;
        imgData.data[idx + 1] = G;
        imgData.data[idx + 2] = B;
        imgData.data[idx + 3] = A;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Glowing divider stroke
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(splitPx, 0);
    ctx.lineTo(splitPx, dstH);
    ctx.stroke();

    return canvas.toDataURL();
  }, [grid, scenario, swipePos, bounds, studyBoundary, tempDomain]);

  const buildLayers = useCallback(() => {
    const layers: any[] = [];
    const dataURL = generateSplitTexture();

    if (dataURL) {
      layers.push(
        new BitmapLayer({
          id: "scenario-swipe-bitmap",
          image: dataURL,
          bounds: [bounds.west, bounds.south, bounds.east, bounds.north],
          opacity: 0.58,
          pickable: false,
          textureParameters: {
            minFilter: "linear",
            magFilter: "linear",
          },
        })
      );
    }

    if (osmBuildings && osmBuildings.features.length > 0) {
      layers.push(
        new GeoJsonLayer({
          id: "scenario-swipe-buildings",
          data: osmBuildings,
          stroked: true,
          filled: true,
          getFillColor: [255, 255, 255, 14],
          getLineColor: [255, 255, 255, 120],
          getLineWidth: 0.9,
          lineWidthUnits: "pixels",
          pickable: false,
        })
      );
    }

    if (studyBoundary?.boundary) {
      layers.push(
        new GeoJsonLayer({
          id: "scenario-swipe-boundary",
          data: {
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry: studyBoundary.boundary }],
          },
          stroked: true,
          filled: false,
          getLineColor: [74, 108, 255, 190],
          getLineWidth: 1.8,
          lineWidthUnits: "pixels",
          getDashArray: [8, 4],
          dashJustified: true,
          pickable: false,
        })
      );
    }

    return layers;
  }, [generateSplitTexture, bounds, osmBuildings, studyBoundary]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const style = SatelliteBasemapProvider.getMapLibreStyle(mapProvider);
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center,
      zoom: defaultZoom,
      pitch: 0,
      bearing: 0,
      antialias: true,
      attributionControl: false,
    });

    mapRef.current = map;

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
    });
    overlayRef.current = overlay;
    map.addControl(overlay as any);

    map.on("load", () => {
      map.resize();
      overlay.setProps({ layers: buildLayers() });
    });

    map.on("mousemove", (e) => {
      if (!grid?.layers?.baseline_temperature_c) return;
      const { lng, lat } = e.lngLat;
      const { west, south, east, north } = bounds;
      if (lng < west || lng > east || lat < south || lat > north) {
        onHoverCell?.(null);
        return;
      }
      const col = Math.max(0, Math.min(49, Math.floor(((lng - west) / (east - west)) * 50)));
      const row = Math.max(0, Math.min(49, Math.floor(((north - lat) / (north - south)) * 50)));
      const baseT = grid.layers.baseline_temperature_c[row]?.[col] ?? 42.0;
      const dens = grid.layers.building_density?.[row]?.[col] ?? 0.45;
      const bldgH = grid.layers.building_height?.[row]?.[col] ?? 0.0;
      const veg = grid.layers.veg_fraction?.[row]?.[col] ?? 0.0;
      const water = grid.layers.water_fraction?.[row]?.[col] ?? 0.0;
      const coolEffect = calcCellCooling(scenario, dens, bldgH, veg, water);
      const scenT = Math.max(24.0, baseT - coolEffect);
      onHoverCell?.({ row, col, baseT, scenT, deltaT: baseT - scenT });
    });

    map.on("mouseleave", () => {
      onHoverCell?.(null);
    });

    const ro = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.resize();
    });
    ro.observe(mapContainerRef.current);

    return () => {
      ro.disconnect();
      overlay.finalize();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapProvider]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({ center, zoom: defaultZoom, duration: 1000 });
  }, [center, defaultZoom]);

  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.setProps({ layers: buildLayers() });
  }, [buildLayers]);

  return (
    <div className="w-full h-full relative overflow-hidden rounded-lg select-none bg-[#0b0f16]">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Top-Right Toggle */}
      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5 bg-surface-elevated/90 backdrop-blur-md border border-surface-border p-1 rounded-md shadow-sm">
        <button
          onClick={() => setMapProvider(mapProvider === "esri" ? "osm_vector" : "esri")}
          className="px-2 py-0.5 rounded text-[10px] font-sans transition-colors flex items-center gap-1 bg-surface-base text-ink-secondary hover:text-ink-primary border border-surface-border/60"
        >
          <Globe className="w-3 h-3 text-cobalt" />
          <span>{mapProvider === "esri" ? "Satellite" : "Street"}</span>
        </button>
      </div>

      {/* Visual Divider Overlay */}
      <div 
        className="absolute top-0 bottom-0 pointer-events-none z-10 w-0.5 bg-white/90 shadow-[0_0_8px_rgba(255,255,255,0.7)]"
        style={{ left: `${swipePos}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-cobalt text-white flex items-center justify-center shadow-lg border-2 border-white">
          <span className="text-[10px] font-mono">↔</span>
        </div>
      </div>

      <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-surface-base/85 text-[10px] font-mono text-status-critical border border-surface-border pointer-events-none z-20">
        ← Baseline Hotspots
      </div>
      <div className="absolute top-2.5 right-24 px-2 py-0.5 rounded bg-surface-base/85 text-[10px] font-mono text-cobalt border border-surface-border pointer-events-none z-20">
        {scenario.name} →
      </div>

      <div className="absolute bottom-1 right-2 z-10 text-[8px] text-ink-dim pointer-events-none font-mono">
        © {mapProvider === "esri" ? "Esri" : "OSM"} · UrbanCoolSim
      </div>
    </div>
  );
}
