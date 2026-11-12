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
import {
  Building,
  Eye,
  EyeOff,
  Plus,
  Minus,
  RotateCcw,
  Globe,
} from "lucide-react";

export interface InterventionStudioMapProps {
  studyArea: string;
  grid: DigitalTwinGrid | null;
  greenRoof: number;
  coolRoof: number;
  treeCanopy: number;
  reflectPave: number;
  waterFeat: number;
  targetZone: string;
}

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

export function InterventionStudioMap({
  studyArea,
  grid,
  greenRoof,
  coolRoof,
  treeCanopy,
  reflectPave,
  waterFeat,
  targetZone,
}: InterventionStudioMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  const [mapProvider, setMapProvider] = useState<MapProviderType>("esri");
  const [thermalOpacity] = useState<number>(0.56);
  const [showThermalLayer, setShowThermalLayer] = useState<boolean>(true);
  const [showBuildings, setShowBuildings] = useState<boolean>(true);
  const [hoveredFeature, setHoveredFeature] = useState<any | null>(null);
  const [osmBuildings, setOsmBuildings] = useState<GeoJSON.FeatureCollection | null>(null);

  const studyBoundary: StudyAreaBoundary | null = useMemo(() => {
    return getStudyAreaBoundary(studyArea);
  }, [studyArea]);

  const config = PINNED_STUDY_AREAS[studyArea] || PINNED_STUDY_AREAS["delhi_cp"];

  const bounds = useMemo(() => {
    if (studyBoundary?.bbox) {
      return studyBoundary.bbox;
    }
    return {
      west: config.bbox[0],
      south: config.bbox[1],
      east: config.bbox[2],
      north: config.bbox[3],
    };
  }, [studyBoundary, config]);

  const center: [number, number] = useMemo(() => {
    if (studyBoundary?.center) {
      return studyBoundary.center;
    }
    return config.center;
  }, [studyBoundary, config]);

  const defaultZoom = config.zoom;

  // Fetch real-world building vector footprints for the study area
  useEffect(() => {
    let isCancelled = false;
    const fetchBuildings = async () => {
      try {
        const res = await fetch(`/api/v1/digital-twin/buildings?study_area_id=${encodeURIComponent(studyArea)}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && data?.features) {
            setOsmBuildings(data);
          }
        }
      } catch (err) {
        console.warn("Notice: could not load vector buildings for map overlay:", err);
      }
    };
    fetchBuildings();
    return () => {
      isCancelled = true;
    };
  }, [studyArea]);

  // Interpolated muted thermal color ramp matching Intervention Studio design
  const getThermalColor = useCallback((norm: number): [number, number, number] => {
    const clamped = Math.max(0, Math.min(1, norm));
    const stops: Array<[number, number, number]> = [
      [49, 94, 159],   // Blue (#315e9f)
      [41, 145, 164],  // Cyan (#2991a4)
      [194, 186, 105], // Yellow-olive (#c2ba69)
      [220, 132, 76],  // Amber-orange (#dc844c)
      [184, 75, 71],   // Red (#b84b47)
    ];
    const scaled = clamped * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(scaled));
    const t = scaled - index;
    return stops[index].map((value, channel) =>
      Math.round(value + (stops[index + 1][channel] - value) * t)
    ) as [number, number, number];
  }, []);

  // Compute thermal intervention texture dynamically over the geographic bounds
  const generateThermalTexture = useCallback((): string | null => {
    if (!grid?.layers) return null;
    const baseT = grid.layers.baseline_temperature_c;
    if (!baseT || !baseT.length) return null;

    const rows = Number(grid.metadata?.rows) || baseT.length;
    const cols = Number(grid.metadata?.cols) || baseT[0]?.length || 50;

    const bldgDens = grid.layers.building_density;
    const vegFrac = grid.layers.veg_fraction;
    const waterFrac = grid.layers.water_fraction;
    const coverageMask = grid.layers.modelled_coverage_mask;

    // Derive robust min/max temperature domain for covered cells
    const supportedTemperatures: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const hasCoverage = coverageMask
          ? (coverageMask[r]?.[c] ?? 0) > 0
          : (bldgDens?.[r]?.[c] ?? 0) > 0.01 ||
            (vegFrac?.[r]?.[c] ?? 0) > 0.05 ||
            (waterFrac?.[r]?.[c] ?? 0) > 0.05;
        const val = baseT[r]?.[c];
        if (hasCoverage && Number.isFinite(val)) {
          supportedTemperatures.push(val);
        }
      }
    }
    supportedTemperatures.sort((a, b) => a - b);
    const tempMin = supportedTemperatures.length
      ? Math.floor(supportedTemperatures[Math.floor((supportedTemperatures.length - 1) * 0.05)] / 5) * 5
      : 30;
    const tempMaxRaw = supportedTemperatures.length
      ? supportedTemperatures[Math.ceil((supportedTemperatures.length - 1) * 0.95)]
      : 70;
    const tempMax = Math.max(tempMin + 10, Math.ceil(tempMaxRaw / 5) * 5);

    // 4x upsample for smooth GPU raster bilinear sampling
    const SCALE = 4;
    const dstW = cols * SCALE;
    const dstH = rows * SCALE;

    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const imgData = ctx.createImageData(dstW, dstH);

    // Feather function to smoothly taper thermal boundary
    const featherFn = studyBoundary
      ? makeFeatherAlpha(studyBoundary.boundary, 0.0012)
      : null;

    const { north, south, east, west } = bounds;

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

        // Bilinear interpolation of baseline temperature
        const b00 = baseT[r0]?.[c0] ?? tempMin;
        const b01 = baseT[r0]?.[c1] ?? tempMin;
        const b10 = baseT[r1]?.[c0] ?? tempMin;
        const b11 = baseT[r1]?.[c1] ?? tempMin;
        const b = b00 * (1 - wr) * (1 - wc) +
                  b01 * (1 - wr) * wc +
                  b10 * wr * (1 - wc) +
                  b11 * wr * wc;

        // Interpolate physical morphology features
        const d00 = bldgDens?.[r0]?.[c0] ?? 0;
        const d01 = bldgDens?.[r0]?.[c1] ?? 0;
        const d10 = bldgDens?.[r1]?.[c0] ?? 0;
        const d11 = bldgDens?.[r1]?.[c1] ?? 0;
        const dens = d00 * (1 - wr) * (1 - wc) +
                     d01 * (1 - wr) * wc +
                     d10 * wr * (1 - wc) +
                     d11 * wr * wc;

        const v00 = vegFrac?.[r0]?.[c0] ?? 0;
        const v01 = vegFrac?.[r0]?.[c1] ?? 0;
        const v10 = vegFrac?.[r1]?.[c0] ?? 0;
        const v11 = vegFrac?.[r1]?.[c1] ?? 0;
        const veg = v00 * (1 - wr) * (1 - wc) +
                    v01 * (1 - wr) * wc +
                    v10 * wr * (1 - wc) +
                    v11 * wr * wc;

        const w00 = waterFrac?.[r0]?.[c0] ?? 0;
        const w01 = waterFrac?.[r0]?.[c1] ?? 0;
        const w10 = waterFrac?.[r1]?.[c0] ?? 0;
        const w11 = waterFrac?.[r1]?.[c1] ?? 0;
        const water = w00 * (1 - wr) * (1 - wc) +
                      w01 * (1 - wr) * wc +
                      w10 * wr * (1 - wc) +
                      w11 * wr * wc;

        const cov00 = coverageMask?.[r0]?.[c0] ?? (dens > 0.01 || veg > 0.05 || water > 0.05 ? 1 : 0);
        const cov01 = coverageMask?.[r0]?.[c1] ?? 0;
        const cov10 = coverageMask?.[r1]?.[c0] ?? 0;
        const cov11 = coverageMask?.[r1]?.[c1] ?? 0;
        const hasCov = (cov00 + cov01 + cov10 + cov11) > 0.1;

        const idx = (py * dstW + px) * 4;
        if (!hasCov || !Number.isFinite(b)) {
          imgData.data[idx] = 0;
          imgData.data[idx + 1] = 0;
          imgData.data[idx + 2] = 0;
          imgData.data[idx + 3] = 0;
          continue;
        }

        let targetMultiplier = 1.0;
        if (targetZone === "zone4_dense" && dens < 0.45) targetMultiplier = 0.2;
        if (targetZone === "zone1_green" && veg < 0.30) targetMultiplier = 0.2;

        const coolDrop = ((coolRoof * dens * 2.8) +
                         (greenRoof * dens * 2.2) +
                         (treeCanopy * (1.0 - dens) * 2.5) +
                         (reflectPave * (1.0 - dens) * 1.2) +
                         (waterFeat * 3.8)) * targetMultiplier;
        const cellScenario = b - coolDrop;
        const norm = (cellScenario - tempMin) / (tempMax - tempMin);
        const [R, G, B] = getThermalColor(norm);

        let featherA = 1.0;
        if (featherFn) {
          const pxLon = west + (px / (dstW - 1)) * (east - west);
          const pxLat = north - (py / (dstH - 1)) * (north - south);
          featherA = featherFn(pxLon, pxLat);
        }

        imgData.data[idx] = R;
        imgData.data[idx + 1] = G;
        imgData.data[idx + 2] = B;
        imgData.data[idx + 3] = Math.round(215 * featherA);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL();
  }, [grid, greenRoof, coolRoof, treeCanopy, reflectPave, waterFeat, targetZone, bounds, studyBoundary, getThermalColor]);

  // Build Deck.gl Layers
  const buildLayers = useCallback(() => {
    const layers: any[] = [];

    // 1. Thermal Intervention Bitmap Layer (Georeferenced)
    if (showThermalLayer) {
      const dataURL = generateThermalTexture();
      if (dataURL) {
        layers.push(
          new BitmapLayer({
            id: "intervention-thermal-bitmap",
            image: dataURL,
            bounds: [bounds.west, bounds.south, bounds.east, bounds.north],
            opacity: thermalOpacity,
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
    if (showBuildings && osmBuildings && osmBuildings.features.length > 0) {
      layers.push(
        new GeoJsonLayer({
          id: "osm-building-footprints",
          data: osmBuildings,
          stroked: true,
          filled: true,
          getFillColor: [240, 244, 255, 38],
          getLineColor: [255, 255, 255, 120],
          getLineWidth: 1.0,
          lineWidthUnits: "pixels",
          pickable: true,
          autoHighlight: true,
          highlightColor: [74, 108, 255, 90],
          onHover: (info: any) => {
            if (info.object?.properties) {
              const p = info.object.properties;
              const h = p.height || (p["building:levels"] ? p["building:levels"] * 3.2 : 12);
              const coolEstimate = ((coolRoof * 0.6 * 2.8) + (greenRoof * 0.6 * 2.2) + (treeCanopy * 0.3 * 2.5)).toFixed(1);
              setHoveredFeature({
                name: p.name || "District Building Block",
                type: p.building || "Commercial / Mixed",
                height: Math.round(h),
                levels: p["building:levels"] || Math.round(h / 3.2),
                coolingBenefit: coolEstimate,
              });
            } else {
              setHoveredFeature(null);
            }
          },
        })
      );
    }

    // 3. District Boundary Boundary Stroke
    if (studyBoundary?.boundary) {
      layers.push(
        new GeoJsonLayer({
          id: "district-boundary-line",
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
          getLineColor: [74, 108, 255, 210],
          getLineWidth: 1.8,
          lineWidthUnits: "pixels",
          getDashArray: [8, 4],
          dashJustified: true,
          pickable: false,
        })
      );
    }

    return layers;
  }, [
    showThermalLayer,
    generateThermalTexture,
    bounds,
    thermalOpacity,
    showBuildings,
    osmBuildings,
    studyBoundary,
    coolRoof,
    greenRoof,
    treeCanopy,
  ]);

  // Initialize MapLibre GL & Deck.gl MapboxOverlay
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

  // Smooth camera fly-to when study area changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center,
      zoom: defaultZoom,
      duration: 1100,
    });
  }, [center, defaultZoom]);

  // Update Deck.gl layers whenever state or parameters change
  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.setProps({ layers: buildLayers() });
  }, [buildLayers]);

  // Map Navigation Helpers
  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleResetCamera = () => {
    mapRef.current?.flyTo({
      center,
      zoom: defaultZoom,
      pitch: 0,
      bearing: 0,
      duration: 900,
    });
  };

  return (
    <div className="w-full h-full relative overflow-hidden rounded-lg select-none bg-[#0b0f16]">
      {/* 1. Underlying MapLibre GL Canvas */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* 2. Top-Right Floating Controls (Basemap Switcher & Layer Toggles) */}
      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5 bg-surface-elevated/90 backdrop-blur-md border border-surface-border p-1 rounded-md shadow-sm text-xs font-mono">
        <button
          onClick={() => setMapProvider(mapProvider === "esri" ? "osm_vector" : "esri")}
          className="px-2 py-1 rounded text-[10px] font-sans transition-colors flex items-center gap-1 bg-surface-base text-ink-secondary hover:text-ink-primary border border-surface-border/60"
          title={`Switch to ${mapProvider === "esri" ? "Street Map" : "Satellite Imagery"}`}
        >
          <Globe className="w-3 h-3 text-cobalt" />
          <span>{mapProvider === "esri" ? "Satellite" : "Street"}</span>
        </button>

        <button
          onClick={() => setShowThermalLayer(!showThermalLayer)}
          className={`px-2 py-1 rounded text-[10px] font-sans transition-colors flex items-center gap-1 ${
            showThermalLayer
              ? "bg-cobalt/20 text-cobalt border border-cobalt/40 font-medium"
              : "bg-surface-base text-ink-muted border border-surface-border/60"
          }`}
          title="Toggle Thermal Intervention Layer"
        >
          {showThermalLayer ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          <span>Heat</span>
        </button>

        <button
          onClick={() => setShowBuildings(!showBuildings)}
          className={`px-2 py-1 rounded text-[10px] font-sans transition-colors flex items-center gap-1 ${
            showBuildings
              ? "bg-cobalt/20 text-cobalt border border-cobalt/40 font-medium"
              : "bg-surface-base text-ink-muted border border-surface-border/60"
          }`}
          title="Toggle Real Building Footprints"
        >
          <Building className="w-3 h-3" />
          <span>Bldgs</span>
        </button>
      </div>

      {/* 3. Bottom-Left Navigation Tools */}
      <div className="absolute bottom-2.5 left-2.5 z-20 flex flex-col gap-1 bg-surface-elevated/90 backdrop-blur-md border border-surface-border p-1 rounded-md shadow-sm">
        <button
          onClick={handleZoomIn}
          className="w-6 h-6 flex items-center justify-center text-ink-secondary hover:text-ink-primary hover:bg-surface-interactive rounded transition-colors"
          title="Zoom In"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleZoomOut}
          className="w-6 h-6 flex items-center justify-center text-ink-secondary hover:text-ink-primary hover:bg-surface-interactive rounded transition-colors"
          title="Zoom Out"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <div className="h-px bg-surface-border/60 my-0.5" />
        <button
          onClick={handleResetCamera}
          className="w-6 h-6 flex items-center justify-center text-ink-secondary hover:text-cobalt hover:bg-surface-interactive rounded transition-colors"
          title="Recenter Study Area"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 4. Active Feature Hover Inspection Tooltip */}
      {hoveredFeature && (
        <div className="absolute top-2.5 left-2.5 z-20 bg-surface-elevated/95 backdrop-blur-md border border-surface-border p-2.5 rounded-lg shadow-floating text-xs space-y-1 max-w-[210px] pointer-events-none animate-fade-in">
          <div className="flex items-center gap-1 text-[11px] font-medium text-ink-primary truncate">
            <Building className="w-3.5 h-3.5 text-cobalt shrink-0" />
            <span className="truncate">{hoveredFeature.name}</span>
          </div>
          <div className="text-[10px] text-ink-muted flex justify-between font-mono">
            <span>Type: {hoveredFeature.type}</span>
            <span>{hoveredFeature.height}m</span>
          </div>
          {hoveredFeature.coolingBenefit && (
            <div className="text-[10px] text-status-safe font-mono flex justify-between pt-0.5 border-t border-surface-border/40">
              <span>Cooling Benefit:</span>
              <span>−{hoveredFeature.coolingBenefit}°C</span>
            </div>
          )}
        </div>
      )}

      {/* 5. Minimal Attribution Badge */}
      <div className="absolute bottom-1 right-2 z-10 text-[8px] text-ink-dim pointer-events-none font-mono">
        © {mapProvider === "esri" ? "Esri World Imagery" : "OpenStreetMap"} · UrbanCoolSim
      </div>
    </div>
  );
}
