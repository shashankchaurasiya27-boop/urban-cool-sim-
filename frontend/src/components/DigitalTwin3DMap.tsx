"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import { 
  Layers, 
  Sun, 
  Eye, 
  Sparkles, 
  MapPin, 
  Compass, 
  Maximize2,
  Sliders,
  Flame,
  Trees,
  Building,
  Info,
  Thermometer,
  ShieldAlert,
  Wind,
  Target
} from "lucide-react";

interface DigitalTwin3DMapProps {
  gridData: any;
  selectedLayer?: string;
  onCellSelect?: (cell: any) => void;
}

// Layer Physical Insight & Narrative Dictionary
const LAYER_INSIGHTS: Record<string, {
  title: string;
  source: string;
  unit: string;
  min: number;
  max: number;
  description: string;
  impact: string;
  recommendedAction: string;
}> = {
  baseline_temperature_c: {
    title: "Modelled Surface Temperature",
    source: "SEB solver + morphology corrections · not satellite-observed",
    unit: "°C",
    min: 25,
    max: 75,
    description: "Surface-temperature field modelled from the energy-balance solver and parameterized urban features; this grid path does not load an observed Landsat LST raster.",
    impact: "Commercial high-rises and dark asphalt reach 46–49°C, driving severe heat stress and building HVAC cooling loads.",
    recommendedAction: "Apply high-albedo cool roof coatings (α ≥ 0.82) to reflect up to 78 W/m² of incoming solar flux."
  },
  canopy_height: {
    title: "Tree Canopy Height & Shading",
    source: "Bundled GeoJSON features + parameterized canopy; no GEDI raster loaded",
    unit: "m",
    min: 0,
    max: 25,
    description: "Parameterized canopy-height and leaf-area-index estimates derived from bundled vector features; this grid path does not ingest GEDI LiDAR observations.",
    impact: "Mature tree canopies (15–22m) attenuate up to 85% of downwelling solar radiation via canopy extinction, cooling local air by 3.5–5.2°C.",
    recommendedAction: "Prioritize street canyon tree canopy planting along unshaded arterial avenues (Janpath, Barakhamba)."
  },
  population_density: {
    title: "Demographic Heat Exposure Density",
    source: "Building/road density proxy; no WorldPop raster loaded",
    unit: "pop / ha",
    min: 0,
    max: 500,
    description: "A morphology/road-based population-density proxy for exploratory exposure analysis; this is not a census or WorldPop observation grid.",
    impact: "High density commercial corridors concentrate vulnerable pedestrian foot traffic in peak thermal hours (12:00–16:00).",
    recommendedAction: "Deploy shaded pedestrian misting corridors and cool transit shelters at high-density transit nodes."
  },
  anthropogenic_heat_qf: {
    title: "Anthropogenic Waste Heat Flux (Qf)",
    source: "Building/road heat proxy; no VIIRS-derived raster loaded",
    unit: "W/m²",
    min: 0,
    max: 90,
    description: "A parameterized anthropogenic-heat proxy based on mapped building and road morphology; no VIIRS radiance raster is loaded in this path.",
    impact: "Commercial office towers reject up to 75 W/m² of condenser heat directly into narrow street canyons, trapping nocturnal heat.",
    recommendedAction: "Install rooftop green roofs above chillers to absorb condenser exhaust heat and improve HVAC efficiency."
  },
  albedo: {
    title: "Shortwave Surface Albedo (α)",
    source: "Bundled feature attributes and configured defaults; no Sentinel-2 raster loaded",
    unit: "0 to 1",
    min: 0.08,
    max: 0.45,
    description: "Parameterized surface-reflectance values assigned from bundled feature attributes and defaults; not a Sentinel-2-derived raster in this path.",
    impact: "Low-albedo asphalt (α = 0.08) absorbs 92% of solar energy (over 780 W/m²), storing massive sensible heat in the pavement.",
    recommendedAction: "Retrofit low-albedo parking surfaces and roadways with cool reflective permeable pavers."
  }
};

export function DigitalTwin3DMap({
  gridData,
  selectedLayer = "baseline_temperature_c",
  onCellSelect,
}: DigitalTwin3DMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const [activeMask, setActiveMask] = useState<string>(selectedLayer);
  const [dataMaskOpacity, setDataMaskOpacity] = useState<number>(0.45);
  const [timeOfDay, setTimeOfDay] = useState<number>(14);
  const [showTrees, setShowTrees] = useState<boolean>(true);
  const [selectedHotspot, setSelectedHotspot] = useState<string | null>(null);
  const [hoveredInfo, setHoveredInfo] = useState<any | null>(null);

  useEffect(() => {
    if (selectedLayer) setActiveMask(selectedLayer);
  }, [selectedLayer]);

  const layerInsight = LAYER_INSIGHTS[activeMask] || LAYER_INSIGHTS.baseline_temperature_c;

  // Multi-Sensor Scientific Colormaps (True Spatial Contrast)
  const getCellColor = useCallback((val: number, mask: string, cellData: any) => {
    const col = new THREE.Color();

    if (mask.includes("temperature") || mask === "lst") {
      // Thermal Spectrum: Deep Blue (32°C) -> Cyan (37°C) -> Amber (42°C) -> Crimson Red (48°C+)
      const norm = Math.max(0, Math.min(1, (val - 32.0) / 16.0));
      if (norm < 0.25) {
        const t = norm / 0.25;
        col.setRGB(0.12 + t * 0.05, 0.35 + t * 0.35, 0.90 - t * 0.1);
      } else if (norm < 0.50) {
        const t = (norm - 0.25) / 0.25;
        col.setRGB(0.17 + t * 0.78, 0.70 + t * 0.15, 0.80 - t * 0.75);
      } else if (norm < 0.75) {
        const t = (norm - 0.50) / 0.25;
        col.setRGB(0.95 + t * 0.03, 0.85 - t * 0.55, 0.05 + t * 0.0);
      } else {
        const t = (norm - 0.75) / 0.25;
        col.setRGB(0.98, 0.30 - t * 0.20, 0.05);
      }
    } else if (mask.includes("canopy") || mask.includes("veg")) {
      // Tree Canopy: If no canopy (val < 0.8m), render neutral building/ground color; if trees, render gradient emerald
      if (val < 0.8) {
        col.setRGB(0.22, 0.24, 0.28); // Neutral urban building/ground
      } else {
        const norm = Math.max(0, Math.min(1, (val - 0.8) / 24.2));
        col.setRGB(0.12 - norm * 0.08, 0.52 + norm * 0.38, 0.20 + norm * 0.15); // Vibrant emerald canopy
      }
    } else if (mask.includes("population")) {
      // Demographic Density: Indigo -> Magenta -> Yellow
      const norm = Math.max(0, Math.min(1, val / 450.0));
      if (norm < 0.1 || val < 10) {
        col.setRGB(0.20, 0.22, 0.26);
      } else {
        col.setRGB(0.35 + norm * 0.6, 0.12 + norm * 0.2, 0.65 - norm * 0.4);
      }
    } else if (mask.includes("qf") || mask.includes("anthropogenic")) {
      // Anthropogenic Heat: Neutral -> Flame Orange -> Yellow
      const norm = Math.max(0, Math.min(1, val / 85.0));
      if (norm < 0.12 || val < 5) {
        col.setRGB(0.20, 0.22, 0.26);
      } else {
        col.setRGB(0.95, 0.30 + norm * 0.6, 0.08);
      }
    } else if (mask.includes("albedo")) {
      // Albedo: Dark low-albedo asphalt (0.10) to bright reflective cool roofs (0.45)
      const norm = Math.max(0, Math.min(1, (val - 0.08) / 0.35));
      const v = 0.15 + norm * 0.75;
      col.setRGB(v * 0.9, v * 0.95, v * 1.05);
    } else {
      col.setRGB(0.29, 0.42, 1.0);
    }
    return col;
  }, []);

  // Three.js Scene Setup & Geometry Construction
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !gridData || !gridData.layers) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x090A0F);
    scene.fog = new THREE.FogExp2(0x090A0F, 0.011);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 38, 46);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const rows = Number(gridData.metadata?.rows) || gridData.layers.baseline_temperature_c?.length || 50;
    const cols = Number(gridData.metadata?.cols) || gridData.layers.baseline_temperature_c?.[0]?.length || 50;
    const spacing = 0.85;
    const cityGroup = new THREE.Group();
    scene.add(cityGroup);

    // Realistic Directional Sun Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.35);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 160;
    sunLight.shadow.camera.left = -32;
    sunLight.shadow.camera.right = 32;
    sunLight.shadow.camera.top = 32;
    sunLight.shadow.camera.bottom = -32;
    scene.add(sunLight);

    // Solar angle calculation
    const sunAngle = ((timeOfDay - 6) / 12) * Math.PI;
    sunLight.position.set(Math.cos(sunAngle) * 38, Math.sin(sunAngle) * 46, 22);

    // 1. Dark Asphalt Ground Floor (Street Canyons)
    const groundGeo = new THREE.PlaneGeometry(cols * spacing + 8, rows * spacing + 8);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x111319,
      roughness: 0.92,
      metalness: 0.08,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.0;
    ground.receiveShadow = true;
    cityGroup.add(ground);

    const baseT = gridData.layers.baseline_temperature_c;
    const bldgH = gridData.layers.building_height || gridData.layers.building_density;
    const bldgDens = gridData.layers.building_density;
    const vegFrac = gridData.layers.veg_fraction;
    const waterFrac = gridData.layers.water_fraction;
    const albedoLayer = gridData.layers.albedo;
    const canopyH = gridData.layers.canopy_height;
    const popDens = gridData.layers.population_density;
    const qfLayer = gridData.layers.anthropogenic_heat_qf;
    const emissLayer = gridData.layers.surface_emissivity;
    const svfLayer = gridData.layers.sky_view_factor;

    const buildingMeshes: { mesh: THREE.Mesh; cellInfo: any }[] = [];
    const treeGroup = new THREE.Group();
    cityGroup.add(treeGroup);

    // Base architectural colors
    const towerMatColor = new THREE.Color(0x2A3242); // Glass facade
    const colonnadeMatColor = new THREE.Color(0x3B404D); // Concrete / masonry

    // Reusable geometries
    const bldgGeo = new THREE.BoxGeometry(0.76, 1, 0.76);
    const treeTrunkGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.3, 5);
    const treeCanopyGeo = new THREE.SphereGeometry(0.28, 6, 5);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x10B981, roughness: 0.8 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3E2723, roughness: 0.9 });

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c - cols / 2) * spacing;
        const z = (r - rows / 2) * spacing;
        
        const temp = baseT?.[r]?.[c] ?? 42.0;
        const rawH = bldgH?.[r]?.[c] ?? 0.0;
        const dens = bldgDens?.[r]?.[c] ?? 0.0;
        const veg = vegFrac?.[r]?.[c] ?? 0.0;
        const water = waterFrac?.[r]?.[c] ?? 0.0;
        const canopyVal = canopyH?.[r]?.[c] ?? (veg * 14.0);

        const cellInfo = {
          row: r,
          col: c,
          landmarkName: gridData.landmarks?.[r]?.[c] || null,
          temp: temp.toFixed(1),
          height: typeof rawH === "number" ? rawH.toFixed(1) : rawH,
          canopyHeight: typeof canopyVal === "number" ? canopyVal.toFixed(1) : canopyVal,
          density: dens,
          veg,
          water,
          albedo: albedoLayer?.[r]?.[c] ?? 0.18,
          popDensity: popDens?.[r]?.[c] ?? 180,
          qfAnthro: qfLayer?.[r]?.[c] ?? 45,
          emissivity: emissLayer?.[r]?.[c] ?? 0.93,
          svf: svfLayer?.[r]?.[c] ?? 0.72,
        };

        // Determine value for active layer
        let currentLayerVal = temp;
        if (activeMask === "canopy_height") currentLayerVal = canopyVal;
        else if (activeMask === "population_density") currentLayerVal = popDens?.[r]?.[c] ?? 180;
        else if (activeMask === "anthropogenic_heat_qf") currentLayerVal = qfLayer?.[r]?.[c] ?? 45;
        else if (activeMask === "albedo") currentLayerVal = albedoLayer?.[r]?.[c] ?? 0.18;

        // 1. Building Parcels (Extruded 3D Blocks)
        if (rawH > 2.0 && dens > 0.12) {
          const extrudedH = Math.max(0.5, rawH / 6.5);

          // Blend architectural facade materials with the selected model/proxy layer
          const dataCol = getCellColor(currentLayerVal, activeMask, cellInfo);
          const archCol = rawH > 40 ? towerMatColor : colonnadeMatColor;
          const blendedCol = archCol.clone().lerp(dataCol, dataMaskOpacity);

          const mat = new THREE.MeshStandardMaterial({
            color: blendedCol,
            roughness: rawH > 40 ? 0.35 : 0.65,
            metalness: rawH > 40 ? 0.55 : 0.15,
          });

          const mesh = new THREE.Mesh(bldgGeo, mat);
          mesh.position.set(x, extrudedH / 2, z);
          mesh.scale.set(1, extrudedH, 1);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          cityGroup.add(mesh);

          buildingMeshes.push({ mesh, cellInfo });
        } 
        // 2. Water Bodies (Reflective Blue Surface)
        else if (water > 0.3) {
          const waterGeo = new THREE.PlaneGeometry(0.82, 0.82);
          const waterMat = new THREE.MeshStandardMaterial({
            color: 0x0284C7,
            roughness: 0.1,
            metalness: 0.85,
            transparent: true,
            opacity: 0.9,
          });
          const wMesh = new THREE.Mesh(waterGeo, waterMat);
          wMesh.rotation.x = -Math.PI / 2;
          wMesh.position.set(x, 0.03, z);
          wMesh.receiveShadow = true;
          cityGroup.add(wMesh);
        }
        // 3. Parks & 3D Tree Clusters (strictly placed outside water and building volumes)
        else if (showTrees && veg > 0.35 && water < 0.20 && rawH < 4.0) {
          // Tree model: trunk + canopy sphere
          const treeGroupUnit = new THREE.Group();
          
          const trunk = new THREE.Mesh(treeTrunkGeo, trunkMat);
          trunk.position.y = 0.15;
          trunk.castShadow = true;
          treeGroupUnit.add(trunk);

          const canopyMesh = new THREE.Mesh(treeCanopyGeo, treeMat);
          canopyMesh.position.y = 0.42;
          canopyMesh.scale.set(1, 1.2, 1);
          canopyMesh.castShadow = true;
          treeGroupUnit.add(canopyMesh);

          treeGroupUnit.position.set(x, 0, z);
          treeGroup.add(treeGroupUnit);
        }
      }
    }

    // Raycasting for Cell Inspection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -(((e.clientY - rect.top) / height) * 2 - 1);

      raycaster.setFromCamera(mouse, camera);
      const meshes = buildingMeshes.map(b => b.mesh);
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const found = buildingMeshes.find(b => b.mesh === hit);
        if (found) {
          setHoveredInfo(found.cellInfo);
          if (onCellSelect) onCellSelect(found.cellInfo);
        }
      }
    };

    container.addEventListener("mousemove", handlePointerMove);

    // Orbit Drag Controls
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    const handleDragMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouseX;
      const dy = e.clientY - prevMouseY;
      cityGroup.rotation.y += dx * 0.0055;
      cityGroup.rotation.x = Math.max(-0.25, Math.min(0.85, cityGroup.rotation.x + dy * 0.0055));
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    container.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousemove", handleDragMove);

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isDragging) {
        cityGroup.rotation.y += 0.0005;
      }
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener("mousemove", handlePointerMove);
      container.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("resize", handleResize);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [gridData, activeMask, dataMaskOpacity, timeOfDay, showTrees, onCellSelect, getCellColor]);

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* 1. Scientific Story & Actionable Insight Banner */}
      <div className="bg-surface-elevated border border-surface-border p-3.5 rounded text-xs space-y-2.5 shadow-subtle">
        <div className="flex flex-wrap justify-between items-center gap-2 border-b border-surface-border pb-2">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-cobalt/10 text-cobalt border border-cobalt/20">
              <Thermometer className="w-3.5 h-3.5" />
            </span>
            <div>
              <span className="font-semibold text-ink-primary text-sm">{layerInsight.title}</span>
              <span className="text-[11px] font-mono text-ink-muted ml-2">({layerInsight.source})</span>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="text-ink-muted">Scale:</span>
              <span className="font-bold text-ink-primary">{layerInsight.min} {layerInsight.unit}</span>
              <div className="w-20 h-2 rounded-full bg-gradient-to-r from-blue-600 via-cyan-400 via-amber-400 to-red-600" />
              <span className="font-bold text-status-critical">{layerInsight.max} {layerInsight.unit}</span>
            </div>
          </div>
        </div>

        {/* Narrative & Impact */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-ink-secondary">
          <div className="flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-cobalt shrink-0 mt-0.5" />
            <p><strong className="text-ink-primary font-medium">Physical Meaning:</strong> {layerInsight.description} {layerInsight.impact}</p>
          </div>
          <div className="flex items-start gap-2 bg-surface-base/60 p-2 rounded border border-surface-border">
            <Target className="w-3.5 h-3.5 text-status-safe shrink-0 mt-0.5" />
            <p><strong className="text-status-safe font-medium">Actionable Intervention:</strong> {layerInsight.recommendedAction}</p>
          </div>
        </div>
      </div>

      {/* 2. Interactive Control Ribbon */}
      <div className="flex flex-wrap justify-between items-center bg-surface-elevated border border-surface-border px-3.5 py-2 rounded text-xs gap-3 select-none">
        {/* Layer Selector */}
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-cobalt" />
          <span className="text-ink-secondary font-medium">Mask Data onto 3D Twin:</span>
          <select
            value={activeMask}
            onChange={(e) => setActiveMask(e.target.value)}
            className="bg-surface-base border border-surface-border text-ink-primary text-xs px-2.5 py-1 rounded outline-none focus:border-cobalt transition-colors font-mono font-medium"
          >
            <option value="baseline_temperature_c">Modelled Surface Temperature (°C)</option>
            <option value="canopy_height">Canopy Height (parameterized, m)</option>
            <option value="population_density">Population-Density Proxy (pop/ha)</option>
            <option value="anthropogenic_heat_qf">Anthropogenic-Heat Proxy Qf (W/m²)</option>
            <option value="albedo">Parameterized Surface Albedo (α)</option>
          </select>
        </div>

        {/* Blend & Solar Controls */}
        <div className="flex items-center gap-4 text-xs font-mono">
          {/* Mask Blend Slider */}
          <div className="flex items-center gap-2">
            <span className="text-ink-muted text-[11px]">Heatmap Blend:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={dataMaskOpacity}
              onChange={(e) => setDataMaskOpacity(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${dataMaskOpacity * 100}%, var(--surface-hover) ${dataMaskOpacity * 100}%, var(--surface-hover) 100%)`
              }}
              className="w-20 cursor-pointer"
              title="Blend between architectural materials and the selected model/proxy layer"
            />
            <span className="text-ink-primary font-bold">{Math.round(dataMaskOpacity * 100)}%</span>
          </div>

          <div className="h-3 w-px bg-surface-border" />

          {/* Time of Day Sun Angle */}
          <div className="flex items-center gap-1.5 text-ink-muted">
            <Sun className="w-3.5 h-3.5 text-status-high" />
            <span>Sun: {timeOfDay}:00</span>
            <input
              type="range"
              min="8"
              max="18"
              step="1"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${((timeOfDay - 8) / (18 - 8)) * 100}%, var(--surface-hover) ${((timeOfDay - 8) / (18 - 8)) * 100}%, var(--surface-hover) 100%)`
              }}
              className="w-16 ml-1 cursor-pointer"
              title="Rotate sun and observe building canyon shadows"
            />
          </div>

          <div className="h-3 w-px bg-surface-border" />

          {/* Trees Toggle */}
          <button
            onClick={() => setShowTrees(!showTrees)}
            className={`px-2 py-0.5 rounded text-[11px] border transition-colors flex items-center gap-1 ${
              showTrees ? "bg-surface-interactive text-status-safe border-surface-border font-medium" : "text-ink-muted border-transparent"
            }`}
          >
            <Trees className="w-3 h-3" />
            <span>3D Foliage</span>
          </button>
        </div>
      </div>

      {/* 3. Main 3D Viewport */}
      <div 
        ref={containerRef} 
        className="w-full h-full min-h-[520px] relative select-none cursor-grab active:cursor-grabbing bg-surface-base border border-surface-border rounded overflow-hidden"
      >
        {/* Viewport Floating Status */}
        <div className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded bg-surface-elevated/90 border border-surface-border text-[11px] font-mono text-ink-muted flex items-center gap-2 shadow-floating">
          <span className="w-1.5 h-1.5 rounded-full bg-status-safe" />
          <span>Real-Time 3D Digital Twin · Drag to rotate · Scroll to zoom</span>
        </div>

        {/* 3D Cell Telemetry Inspector HUD */}
        {hoveredInfo && (
          <div className="absolute bottom-4 right-4 z-10 p-4 rounded bg-surface-elevated/95 border border-surface-border text-xs font-mono shadow-floating space-y-2 min-w-64 tabular-nums">
            <div className="flex items-center justify-between border-b border-surface-border pb-1.5 gap-2">
              <span className="font-semibold text-ink-primary flex items-center gap-1.5 truncate">
                <Building className="w-3.5 h-3.5 text-cobalt shrink-0" />
                <span className="truncate max-w-[190px]">
                  {hoveredInfo.landmarkName || `Parcel [${hoveredInfo.row}, ${hoveredInfo.col}]`}
                </span>
              </span>
              <span className="text-[10px] text-status-safe font-mono font-semibold shrink-0">Modelled grid</span>
            </div>

            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between items-baseline">
                <span className="text-ink-muted font-sans">Modelled surface temperature:</span>
                <strong className="text-status-critical font-bold text-sm">{hoveredInfo.temp}°C</strong>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-ink-muted font-sans">Building height (bundled GeoJSON):</span>
                <span className="text-ink-primary font-medium">{hoveredInfo.height}m</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-ink-muted font-sans">Canopy height (parameterized):</span>
                <span className="text-status-safe font-medium">{hoveredInfo.canopyHeight}m</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-ink-muted font-sans">Population-density proxy:</span>
                <span className="text-ink-primary">{Math.round(hoveredInfo.popDensity)} pop/ha</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-ink-muted font-sans">Anthropogenic-heat proxy:</span>
                <span className="text-status-high font-medium">{Math.round(hoveredInfo.qfAnthro)} W/m²</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-ink-muted font-sans">Sky View Factor (SVF):</span>
                <span className="text-cobalt font-medium">{hoveredInfo.svf.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-ink-muted font-sans">Surface albedo (parameterized):</span>
                <span className="text-ink-primary">{(hoveredInfo.albedo || 0.18).toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
