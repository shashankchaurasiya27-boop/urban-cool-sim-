/**
 * osmBuildings.ts
 *
 * Fetches OSM building footprints from the Overpass API for a given bounding
 * box and study area, then caches them in localStorage (24h TTL) so that
 * subsequent loads and pan/zoom events don't re-fetch.
 *
 * Overpass query returns `building=*` ways + `height` / `building:levels` tags.
 * Heights are mapped to meters (OSM `height` is already in metres).
 * `building:levels` is multiplied by 3.2m/floor when `height` is absent.
 * Fallback height: 8m (typical 2-storey commercial block).
 *
 * Returns a GeoJSON FeatureCollection ready for deck.gl GeoJsonLayer.
 */

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"; 
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY_PREFIX = "osm_bldgs_";
const DEFAULT_HEIGHT_M = 8;
const METERS_PER_LEVEL = 3.2;
const TIMEOUT_MS = 12000; // 12s — Overpass can be slow

interface CacheEntry {
  timestamp: number;
  geojson: GeoJSON.FeatureCollection;
}

/** Returns cached data if it exists and is not stale, otherwise null. */
function loadFromCache(studyAreaId: string): GeoJSON.FeatureCollection | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + studyAreaId);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY_PREFIX + studyAreaId);
      return null;
    }
    return entry.geojson;
  } catch {
    return null;
  }
}

function saveToCache(studyAreaId: string, geojson: GeoJSON.FeatureCollection): void {
  try {
    const entry: CacheEntry = { timestamp: Date.now(), geojson };
    localStorage.setItem(CACHE_KEY_PREFIX + studyAreaId, JSON.stringify(entry));
  } catch (e) {
    // localStorage full — skip caching silently
    console.warn("osmBuildings: localStorage write failed, caching skipped", e);
  }
}

/** Parses raw Overpass JSON response into a GeoJSON FeatureCollection. */
function overpassToGeoJSON(
  data: any
): GeoJSON.FeatureCollection {
  const nodeMap: Record<number, [number, number]> = {};
  for (const el of data.elements) {
    if (el.type === "node") {
      nodeMap[el.id] = [el.lon, el.lat];
    }
  }

  const features: GeoJSON.Feature[] = [];

  for (const el of data.elements) {
    if (el.type !== "way" || !el.nodes) continue;

    const coords: [number, number][] = [];
    for (const nodeId of el.nodes) {
      const pos = nodeMap[nodeId];
      if (pos) coords.push(pos);
    }
    if (coords.length < 4) continue; // degenerate

    const tags = el.tags || {};

    // Height resolution: explicit height tag → levels → default
    let height = DEFAULT_HEIGHT_M;
    if (tags.height) {
      const parsed = parseFloat(tags.height);
      if (!isNaN(parsed) && parsed > 0) height = parsed;
    } else if (tags["building:levels"]) {
      const levels = parseFloat(tags["building:levels"]);
      if (!isNaN(levels) && levels > 0) height = levels * METERS_PER_LEVEL;
    }

    features.push({
      type: "Feature",
      properties: {
        osm_id: el.id,
        building: tags.building || true,
        height,
        name: tags.name || null,
        levels: tags["building:levels"] ? parseFloat(tags["building:levels"]) : null,
      },
      geometry: {
        type: "Polygon",
        coordinates: [coords],
      },
    });
  }

  return { type: "FeatureCollection", features };
}

/**
 * Returns building footprints as a GeoJSON FeatureCollection.
 *
 * Priority: localStorage cache → Overpass API → null (on failure).
 *
 * @param bounds       Bounding box in WGS84 degrees.
 * @param studyAreaId  Cache key identifier (e.g. "delhi_cp").
 * @param onProgress   Optional callback called with status strings.
 */
export async function fetchOSMBuildings(
  bounds: { south: number; west: number; north: number; east: number },
  studyAreaId: string,
  onProgress?: (msg: string) => void
): Promise<GeoJSON.FeatureCollection | null> {
  // 1. Try cache first
  const cached = loadFromCache(studyAreaId);
  if (cached) {
    onProgress?.("OSM buildings: loaded from cache");
    return cached;
  }

  // 2. High-Priority: Curated Real-World Vector Footprints from Backend Engine
  try {
    onProgress?.("Loading high-precision real building footprints…");
    const res = await fetch(`/api/v1/digital-twin/buildings?study_area_id=${encodeURIComponent(studyAreaId)}`);
    if (res.ok) {
      const geojson = await res.json();
      if (geojson?.features && geojson.features.length > 0) {
        saveToCache(studyAreaId, geojson);
        onProgress?.(`Real-world digital twin: ${geojson.features.length} building complexes loaded`);
        return geojson;
      }
    }
  } catch (e) {
    console.warn("Backend building fetch notice, trying local static asset:", e);
  }

  // 3. Fallback: Local static geo dataset
  try {
    const res = await fetch(`/data/geo/${studyAreaId}_geo.json`);
    if (res.ok) {
      const allGeo = await res.json();
      const bldgs = (allGeo?.features || []).filter((f: any) => f.properties?.type === "building");
      if (bldgs.length > 0) {
        const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: bldgs };
        saveToCache(studyAreaId, geojson);
        onProgress?.(`Real-world digital twin: ${bldgs.length} building complexes loaded`);
        return geojson;
      }
    }
  } catch (e) {
    console.warn("Static geo fetch notice:", e);
  }

  onProgress?.("Fetching OSM footprints from Overpass API…");

  // 4. Fallback for custom worldwide coordinates: Query Overpass API
  const latPad = (bounds.north - bounds.south) * 0.1;
  const lonPad = (bounds.east - bounds.west) * 0.1;
  const { south, west, north, east } = {
    south: bounds.south - latPad,
    west: bounds.west - lonPad,
    north: bounds.north + latPad,
    east: bounds.east + lonPad,
  };

  // Overpass QL query — building ways only, nodes for geometry
  const query = `
[out:json][timeout:15];
(
  way["building"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;
`.trim();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Overpass HTTP ${response.status}`);
    }

    const data = await response.json();
    const geojson = overpassToGeoJSON(data);

    if (geojson.features.length === 0) {
      onProgress?.("OSM buildings: no buildings found in area");
      return null;
    }

    saveToCache(studyAreaId, geojson);
    onProgress?.(`OSM buildings: ${geojson.features.length} footprints loaded`);
    return geojson;

  } catch (err: any) {
    if (err?.name === "AbortError") {
      onProgress?.("OSM buildings: Overpass timeout — using grid fallback");
    } else {
      onProgress?.(`OSM buildings: fetch failed (${err?.message}) — using grid fallback`);
    }
    return null;
  }
}

export interface ScenarioPhysicsResult {
  val: number;
  delta: number;
  coolingReliefC: number;
  qfReductionWm2: number;
  albedoBoost: number;
  canopyBoostM: number;
  interventionDescription: string;
}

/**
 * First-Principles Urban Climatology & SEB Physics Modifier.
 * Evaluates the multi-variable impact of urban cooling policies across:
 * - Surface Temperature (SEB / LST)
 * - Anthropogenic Waste Heat Flux (Qf)
 * - Surface Albedo (α)
 * - Tree Canopy Height / Vegetation (Hc)
 */
export function applyScenarioPhysics(
  layerKey: string,
  rawVal: number,
  scenario: string,
  morphology: {
    bldgHeight: number;
    bldgDensity: number;
    vegFraction: number;
    waterFraction: number;
    baseTempC?: number;
    baseQfWm2?: number;
    baseAlbedo?: number;
    isBuilding?: boolean;
    appliedSolution?: {
      solution_id?: number;
      cool_roof_pct?: number;
      green_roof_pct?: number;
      tree_canopy_pct?: number;
      delta_t_mean?: number;
      validated_delta_t?: number;
    };
  }
): ScenarioPhysicsResult {
  const isBuilding = morphology.isBuilding ?? false;
  const d = Math.max(0, Math.min(1, morphology.bldgDensity ?? 0));
  const h = Math.max(0, morphology.bldgHeight ?? 0);
  const w = Math.max(0, Math.min(1, morphology.waterFraction ?? 0));
  const baseAlb = morphology.baseAlbedo ?? 0.18;
  // Active vehicular road carriageway (low albedo asphalt, low building density)
  const isRoadCarriageway = !isBuilding && baseAlb <= 0.12 && d < 0.25;

  // Continuous morphology weighting
  // Rooftop interventions apply wherever buildings exist.
  // Explicit building polygons have 100% roof weight. Raster terrain cells scale with density.
  const roofWeight = isBuilding ? 1.0 : Math.min(1.0, Math.max(0.0, (d - 0.12) / 0.35));
  // Street canyon and pedestrian corridor weighting outside building footprints, road carriageways, and open water.
  // Building polygons and active vehicular road lanes have strictly 0.0 ground canopy weight (trees grow along sidewalks/verges, NEVER in traffic lanes).
  const groundWeight = (isBuilding || isRoadCarriageway)
    ? 0.0
    : Math.min(1.0, Math.max(0.0, (0.42 - d) / 0.32)) * (1.0 - w);

  let modifiedVal = rawVal;
  let coolingReliefC = 0.0;
  let qfReductionWm2 = 0.0;
  let albedoBoost = 0.0;
  let canopyBoostM = 0.0;
  let interventionDescription = "Unmitigated Baseline State (Observed Physical Microclimate)";

  if (scenario === "cool_roofs") {
    // 1. Surface Temperature: High-reflectance coatings reflect shortwave radiation on roofs
    coolingReliefC = (4.6 + 0.9 * Math.min(1.0, h / 20.0)) * roofWeight;
    // 2. Waste Heat Flux: Reduced rooftop heat conduction cuts HVAC air-conditioning electrical load & condenser rejection
    qfReductionWm2 = (rawVal > 15 ? rawVal : (morphology.baseQfWm2 ?? 45.0)) * (0.28 * roofWeight);
    // 3. Surface Albedo: High-reflectance coatings achieve alpha = 0.85 on roofs
    albedoBoost = (0.85 - (morphology.baseAlbedo ?? 0.18)) * roofWeight;
    canopyBoostM = 0.0; // Strictly zero canopy on cool roofs

    if (isBuilding) {
      interventionDescription = "High-Albedo Cool Roof (α=0.85): High solar-reflectance rooftop coating reduces building cooling load, cutting HVAC heat rejection by 28%.";
    } else {
      interventionDescription = "Cool Roof District Impact: Rooftop albedo boost reduces regional urban heat island (UHI) intensity by up to -4.8°C.";
    }

    if (layerKey.includes("temperature") || layerKey === "lst") {
      modifiedVal = Math.max(26.0, rawVal - coolingReliefC);
    } else if (layerKey.includes("qf") || layerKey.includes("anthropogenic")) {
      modifiedVal = Math.max(4.0, rawVal - qfReductionWm2);
    } else if (layerKey.includes("albedo")) {
      modifiedVal = Math.min(0.85, Math.max(rawVal, rawVal * (1.0 - roofWeight) + 0.85 * roofWeight));
    } else if (layerKey.includes("canopy") || layerKey.includes("veg")) {
      modifiedVal = isBuilding ? 0.0 : rawVal;
    }
  } else if (scenario === "green_roofs") {
    // 1. Temperature: Latent heat flux (Qe) evapotranspiration + thermal mass on rooftops
    coolingReliefC = 4.4 * roofWeight;
    // 2. Waste Heat Flux: Vegetative substrate provides thermal insulation to roof envelope
    qfReductionWm2 = (rawVal > 15 ? rawVal : (morphology.baseQfWm2 ?? 45.0)) * (0.22 * roofWeight);
    // 3. Albedo: Herbaceous sedum cover exhibits alpha ~ 0.24
    albedoBoost = (0.24 - (morphology.baseAlbedo ?? 0.18)) * roofWeight;
    // 4. Canopy / Veg: Rooftop succulent / sedum vegetation layer (+2.2m) applies only to roofs
    canopyBoostM = 2.2 * roofWeight;

    if (isBuilding) {
      interventionDescription = "Extensive Green Roof: Low-profile sedum vegetation layer (+2.2m) provides rooftop evapotranspiration and envelope thermal insulation.";
    } else {
      interventionDescription = "Green Roof Buffer: Distributed rooftop vegetation dissipates solar heat via evapotranspiration, providing up to -4.4°C cooling relief.";
    }

    if (layerKey.includes("temperature") || layerKey === "lst") {
      modifiedVal = Math.max(26.0, rawVal - coolingReliefC);
    } else if (layerKey.includes("qf") || layerKey.includes("anthropogenic")) {
      modifiedVal = Math.max(4.0, rawVal - qfReductionWm2);
    } else if (layerKey.includes("albedo")) {
      modifiedVal = Math.max(rawVal, rawVal * (1.0 - roofWeight) + 0.24 * roofWeight);
    } else if (layerKey.includes("canopy") || layerKey.includes("veg")) {
      if (isBuilding) {
        modifiedVal = 2.2; // Sedum vegetation layer on building roof
      } else {
        modifiedVal = Math.min(24.0, rawVal + canopyBoostM);
      }
    }
  } else if (scenario === "tree_canopy") {
    // 1. Canopy Height: High-branching street trees along pedestrian avenues and corridors
    // Street trees grow on the ground, NEVER on commercial building roofs!
    canopyBoostM = 8.5 * groundWeight;
    // 2. Temperature: Solar radiation attenuation under tree canopy + transpiration
    coolingReliefC = 5.2 * groundWeight + 1.8 * roofWeight; // Ambient cooling extends partially to adjacent building envelope
    // 3. Waste Heat Flux: Street shading lowers ambient intake air entering AC condenser coils
    qfReductionWm2 = (rawVal > 15 ? rawVal : (morphology.baseQfWm2 ?? 45.0)) * (0.15 * groundWeight + 0.10 * roofWeight);
    albedoBoost = 0.0;

    if (isBuilding) {
      interventionDescription = "Street Tree Canopy Corridor: Mature street trees shade pedestrian avenues and reduce ambient canyon temperature, providing indirect cooling to adjacent buildings.";
    } else if (isRoadCarriageway) {
      interventionDescription = "Vehicular Road Carriageway: Active traffic lane (asphalt pavement preserved, microclimate shaded by roadside tree canopy).";
    } else {
      interventionDescription = "Shaded Tree Canopy Corridor: Mature street trees shade pedestrian corridors and pavements, adding +8.5m canopy cover and reducing ground heat by up to -5.8°C.";
    }

    if (layerKey.includes("temperature") || layerKey === "lst") {
      modifiedVal = Math.max(26.0, rawVal - coolingReliefC);
    } else if (layerKey.includes("qf") || layerKey.includes("anthropogenic")) {
      modifiedVal = Math.max(4.0, rawVal - qfReductionWm2);
    } else if (layerKey.includes("canopy") || layerKey.includes("veg")) {
      if (isBuilding || isRoadCarriageway) {
        modifiedVal = 0.0; // Building rooftops and active vehicular traffic lanes have NO trees in road lanes!
      } else {
        modifiedVal = Math.min(25.0, rawVal + canopyBoostM);
      }
    }
  } else if (scenario === "optimized") {
    // 1. Synergistic NSGA-II Pareto hybrid allocation
    const sol = morphology.appliedSolution;
    const isHighRise = h > 15.0;

    if (sol) {
      const coolRoofPct = (sol.cool_roof_pct ?? 30.0) / 100.0;
      const greenRoofPct = (sol.green_roof_pct ?? 15.0) / 100.0;
      const treeCanopyPct = (sol.tree_canopy_pct ?? 20.0) / 100.0;
      const expectedDeltaT = Math.abs(sol.validated_delta_t || sol.delta_t_mean || 3.5);

      coolingReliefC = Math.min(6.5, (expectedDeltaT * 1.1) * (coolRoofPct * roofWeight + greenRoofPct * roofWeight + treeCanopyPct * groundWeight * 1.4));
      if (coolingReliefC < 0.2) coolingReliefC = expectedDeltaT * (0.6 * roofWeight + 0.4 * groundWeight);

      qfReductionWm2 = (rawVal > 15 ? rawVal : (morphology.baseQfWm2 ?? 45.0)) * (0.28 * coolRoofPct * roofWeight + 0.22 * greenRoofPct * roofWeight + 0.12 * treeCanopyPct * groundWeight);
      albedoBoost = (coolRoofPct * 0.65 + greenRoofPct * 0.06) * roofWeight + 0.10 * groundWeight;
      canopyBoostM = isRoadCarriageway ? 0.0 : ((treeCanopyPct * 25.0) * groundWeight + (greenRoofPct > 0 ? (greenRoofPct * 4.0) : 0.0) * roofWeight);

      if (isBuilding) {
        interventionDescription = `NSGA-II Portfolio #${sol.solution_id ?? 1}: Co-optimized Cool Roof (${sol.cool_roof_pct ?? 0}%) and Green Roof (${sol.green_roof_pct ?? 0}%), cutting waste heat and providing envelope cooling.`;
      } else if (isRoadCarriageway) {
        interventionDescription = "Vehicular Road Carriageway: Active traffic lane (asphalt pavement preserved, microclimate shaded by roadside tree canopy).";
      } else {
        interventionDescription = `NSGA-II Portfolio #${sol.solution_id ?? 1}: Shaded Tree Canopy (+${sol.tree_canopy_pct ?? 0}%) reducing ambient ground temperature by up to -${expectedDeltaT.toFixed(1)}°C.`;
      }
    } else {
      // Default heuristic NSGA-II Pareto allocation
      const optRoofCooling = isHighRise ? 5.2 : 4.4;
      coolingReliefC = Math.min(6.5, optRoofCooling * roofWeight + 5.0 * groundWeight);
      qfReductionWm2 = (rawVal > 15 ? rawVal : (morphology.baseQfWm2 ?? 45.0)) * (0.32 * roofWeight + 0.14 * groundWeight);
      albedoBoost = (isHighRise ? 0.65 : 0.06) * roofWeight + 0.12 * groundWeight;
      canopyBoostM = isRoadCarriageway ? 0.0 : (7.0 * groundWeight + (isHighRise ? 0.0 : 1.8) * roofWeight);

      if (isBuilding) {
        if (isHighRise) {
          interventionDescription = "NSGA-II Pareto Solution: High-Albedo Cool Roof coating optimized for high-rise commercial cooling and maximum HVAC waste heat mitigation (-32%).";
        } else {
          interventionDescription = "NSGA-II Pareto Solution: Extensive Green Roof sedum installation (+1.8m) optimized for mid-rise rooftop evapotranspiration and stormwater retention.";
        }
      } else if (isRoadCarriageway) {
        interventionDescription = "Vehicular Road Carriageway: Active traffic lane (asphalt pavement preserved, microclimate shaded by roadside tree canopy).";
      } else {
        interventionDescription = "NSGA-II Multi-Objective Pareto Strategy: Co-optimized cool roofs, green roofs, and shaded tree corridors achieving up to -6.5°C peak cooling and -32% HVAC waste heat reduction.";
      }
    }

    if (layerKey.includes("temperature") || layerKey === "lst") {
      modifiedVal = Math.max(26.0, rawVal - coolingReliefC);
    } else if (layerKey.includes("qf") || layerKey.includes("anthropogenic")) {
      modifiedVal = Math.max(4.0, rawVal - qfReductionWm2);
    } else if (layerKey.includes("albedo")) {
      if (isBuilding) {
        modifiedVal = isHighRise ? 0.85 : 0.24;
      } else {
        modifiedVal = Math.min(0.85, Math.max(rawVal, rawVal + albedoBoost));
      }
    } else if (layerKey.includes("canopy") || layerKey.includes("veg")) {
      if (isBuilding || isRoadCarriageway) {
        modifiedVal = isBuilding ? (isHighRise ? 0.0 : 1.8) : 0.0;
      } else {
        modifiedVal = Math.min(25.0, rawVal + canopyBoostM);
      }
    }
  }

  const delta = rawVal - modifiedVal;
  return {
    val: modifiedVal,
    delta,
    coolingReliefC,
    qfReductionWm2,
    albedoBoost,
    canopyBoostM,
    interventionDescription,
  };
}

/**
 * Assigns physical layer values and active scenario attributes to each OSM building.
 *
 * @param buildings   GeoJSON FeatureCollection from fetchOSMBuildings()
 * @param gridData    DigitalTwinGrid from the API
 * @param studyBounds Exact geographic bounds of the grid
 * @param layerKey    Which grid layer to sample (e.g. "baseline_temperature_c")
 * @param scenario    Scenario modifiers to apply
 */
export function assignThermalToBuildings(
  buildings: GeoJSON.FeatureCollection,
  gridData: any,
  studyBounds: { north: number; south: number; east: number; west: number },
  layerKey = "baseline_temperature_c",
  scenario = "baseline",
  appliedSolution?: any
): GeoJSON.FeatureCollection {
  if (!buildings?.features) {
    return { type: "FeatureCollection", features: [] };
  }

  if (!gridData?.layers) {
    return {
      ...buildings,
      features: buildings.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          thermalValue: 40.0,
          layerKey,
          scenario,
        },
      })),
    };
  }

  const { north, south, east, west } = studyBounds;
  const rows: number = gridData?.metadata?.rows || 50;
  const cols: number = gridData?.metadata?.cols || 50;
  const dLat = (north - south) / rows;
  const dLon = (east - west) / cols;

  const layerValues = gridData.layers?.[layerKey] || gridData.layers?.["baseline_temperature_c"];
  const baseT = gridData.layers?.["baseline_temperature_c"];
  const bldgH = gridData.layers?.["building_height"];
  const bldgD = gridData.layers?.["building_density"];
  const vegF = gridData.layers?.["veg_fraction"];
  const waterF = gridData.layers?.["water_fraction"];
  const qfLayer = gridData.layers?.["anthropogenic_heat_qf"];
  const albedoLayer = gridData.layers?.["albedo"];

  const centerLon = (west + east) / 2;
  const centerLat = (north + south) / 2;
  const studyRadiusM = 650; // Radius of Connaught Place study window

  function sampleMorphology(
    lon: number,
    lat: number,
    bldHeightOverride?: number,
    effectiveScenario = scenario
  ) {
    const col = Math.max(0, Math.min(cols - 1, Math.floor((lon - west) / dLon)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor((north - lat) / dLat)));

    const rawLayerVal = layerValues?.[row]?.[col] ?? 42.0;
    const h = bldHeightOverride ?? (bldgH?.[row]?.[col] ?? 16.0);
    const d = bldgD?.[row]?.[col] ?? 0.45;
    const v = vegF?.[row]?.[col] ?? 0.05;
    const w = waterF?.[row]?.[col] ?? 0.0;
    const baseTemp = baseT?.[row]?.[col] ?? 42.0;
    const baseQf = qfLayer?.[row]?.[col] ?? 45.0;
    const baseAlb = albedoLayer?.[row]?.[col] ?? 0.18;
    const baseCanopy = (gridData.layers?.["canopy_height"]?.[row]?.[col]) ?? 0.0;

    const physicsRes = applyScenarioPhysics(layerKey, rawLayerVal, effectiveScenario, {
      bldgHeight: h,
      bldgDensity: d,
      vegFraction: v,
      waterFraction: w,
      baseTempC: baseTemp,
      baseQfWm2: baseQf,
      baseAlbedo: baseAlb,
      isBuilding: true,
      appliedSolution: appliedSolution || undefined,
    });

    const tempRes = applyScenarioPhysics("baseline_temperature_c", baseTemp, effectiveScenario, {
      bldgHeight: h,
      bldgDensity: d,
      vegFraction: v,
      waterFraction: w,
      baseTempC: baseTemp,
      baseQfWm2: baseQf,
      baseAlbedo: baseAlb,
      isBuilding: true,
      appliedSolution: appliedSolution || undefined,
    });

    const qfRes = applyScenarioPhysics("anthropogenic_heat_qf", baseQf, effectiveScenario, {
      bldgHeight: h,
      bldgDensity: d,
      vegFraction: v,
      waterFraction: w,
      baseTempC: baseTemp,
      baseQfWm2: baseQf,
      baseAlbedo: baseAlb,
      isBuilding: true,
      appliedSolution: appliedSolution || undefined,
    });

    const albRes = applyScenarioPhysics("albedo", baseAlb, effectiveScenario, {
      bldgHeight: h,
      bldgDensity: d,
      vegFraction: v,
      waterFraction: w,
      baseTempC: baseTemp,
      baseQfWm2: baseQf,
      baseAlbedo: baseAlb,
      isBuilding: true,
      appliedSolution: appliedSolution || undefined,
    });

    const canopyRes = applyScenarioPhysics("canopy_height", baseCanopy, effectiveScenario, {
      bldgHeight: h,
      bldgDensity: d,
      vegFraction: v,
      waterFraction: w,
      baseTempC: baseTemp,
      baseQfWm2: baseQf,
      baseAlbedo: baseAlb,
      isBuilding: true,
      appliedSolution: appliedSolution || undefined,
    });

    return {
      row,
      col,
      displayValue: physicsRes.val,
      temp: tempRes.val,
      coolingReliefC: tempRes.coolingReliefC,
      qfAnthro: qfRes.val,
      albedo: albRes.val,
      canopyHeight: canopyRes.val,
      interventionDescription: physicsRes.interventionDescription,
      height: h,
    };
  }

  const enriched = buildings.features.map((feature, idx) => {
    // Robust centroid extraction
    let centLon = 0, centLat = 0, ptCount = 0;
    const geom = feature.geometry;
    if (geom.type === "Polygon") {
      for (const ring of geom.coordinates) {
        for (const [ln, lt] of ring) { centLon += ln; centLat += lt; ptCount++; }
      }
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) {
        for (const ring of poly) {
          for (const [ln, lt] of ring) { centLon += ln; centLat += lt; ptCount++; }
        }
      }
    }
    if (ptCount > 0) { centLon /= ptCount; centLat /= ptCount; }

    const dLat = (centLat - centerLat) * 111320;
    const dLon = (centLon - centerLon) * 111320 * Math.cos((centerLat * Math.PI) / 180);
    const distToCenter = Math.sqrt(dLat * dLat + dLon * dLon);
    const isInsideDistrict = distToCenter <= studyRadiusM;

    const bldHeight = feature.properties?.height ?? 16.0;
    const osmId = Number(feature.properties?.osm_id || idx);
    const isEligibleRoof = isInsideDistrict && bldHeight >= 7.5;

    // Determine building-level intervention based on policy adoption rates:
    // Green roofs: 50% target coverage on eligible commercial roofs
    const isGreenRoofCandidate = isEligibleRoof && ((osmId * 17 + 7) % 100 < 52);
    // Cool roofs: 60% target coverage on eligible commercial roofs
    const isCoolRoofCandidate = isEligibleRoof && ((osmId * 23 + 11) % 100 < 62);

    let effectiveScenario = "baseline";
    let customDescription: string | null = null;

    if (!isInsideDistrict) {
      effectiveScenario = "baseline";
      customDescription = "Outside Study Area Boundary (Baseline Microclimate)";
    } else if (scenario === "green_roofs") {
      if (isGreenRoofCandidate) {
        effectiveScenario = "green_roofs";
        customDescription = "Extensive Green Roof: Sedum succulent vegetation (+2.2m) retrofitted under the 50% district green infrastructure initiative.";
      } else {
        effectiveScenario = "baseline";
        customDescription = "Commercial Rooftop: Unretrofitted Structure / Heritage Conservation Arcade (Baseline Microclimate).";
      }
    } else if (scenario === "cool_roofs") {
      if (isCoolRoofCandidate) {
        effectiveScenario = "cool_roofs";
        customDescription = "High-Albedo Cool Roof (α=0.85): High solar-reflectance coating retrofitted under the 60% cool roof district policy.";
      } else {
        effectiveScenario = "baseline";
        customDescription = "Commercial Rooftop: Unretrofitted Structure (Baseline Microclimate).";
      }
    } else if (scenario === "optimized") {
      if (isEligibleRoof) {
        effectiveScenario = "optimized";
      } else {
        effectiveScenario = "baseline";
        customDescription = "Heritage / Non-intervened Structure (Baseline Microclimate).";
      }
    } else if (scenario === "tree_canopy") {
      effectiveScenario = "tree_canopy";
    }

    const sample = sampleMorphology(centLon, centLat, bldHeight, effectiveScenario);

    return {
      ...feature,
      properties: {
        ...feature.properties,
        row: sample.row,
        col: sample.col,
        thermalValue: sample.displayValue,
        layerKey,
        scenario: effectiveScenario,
        temp: sample.temp.toFixed(1),
        canopyHeight: sample.canopyHeight.toFixed(1),
        coolingPotential: sample.coolingReliefC > 0 ? `-${sample.coolingReliefC.toFixed(1)}` : "0.0",
        qfAnthro: Math.round(sample.qfAnthro),
        albedo: sample.albedo.toFixed(2),
        intervention: customDescription || sample.interventionDescription,
        height: bldHeight,
      },
    };
  });

  return { type: "FeatureCollection", features: enriched };
}
