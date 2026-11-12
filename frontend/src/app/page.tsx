"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ShieldCheck,
  Thermometer,
  Layers,
  Cpu,
  FileText,
  Target,
  Sparkles,
  Globe,
  Satellite,
  Activity,
  CheckCircle2,
  BarChart3,
  Database,
  Droplets,
  Sun,
  Wind,
  Building2,
  Flame,
  Check,
  ChevronRight,
  SlidersHorizontal,
  Download,
  Landmark,
  Microscope,
  Users,
  Zap,
} from "lucide-react";
import dynamic from "next/dynamic";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DEFAULT_STUDY_AREAS } from "@/lib/api";

const Hero3DCanvas = dynamic(
  () => import("@/components/Hero3DCanvas").then((mod) => mod.Hero3DCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full skeleton-pulse rounded-lg" />
    ),
  }
);

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  }),
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

// 5 Registered Archetype Data
const ARCHETYPES = [
  {
    id: "delhi_cp",
    name: "Connaught Place",
    city: "New Delhi",
    country: "India",
    flag: "🇮🇳",
    typology: "Semi-Arid Radial Core",
    baseLST: "48.5°C",
    mitigatedLST: "44.8°C",
    cooling: "−3.70°C",
    hvacSaved: "148,000 kWh",
    desc: "Dense commercial ring with high thermal inertia asphalt and wide arterial radial roads.",
  },
  {
    id: "mumbai_bkc",
    name: "Bandra Kurla Complex",
    city: "Mumbai",
    country: "India",
    flag: "🇮🇳",
    typology: "Coastal Humid Core",
    baseLST: "41.2°C",
    mitigatedLST: "38.1°C",
    cooling: "−3.10°C",
    hvacSaved: "162,000 kWh",
    desc: "Coastal high-rise commercial center with 75% relative humidity and Mithi River boundary.",
  },
  {
    id: "singapore_marina",
    name: "Marina Bay",
    city: "Singapore",
    country: "Singapore",
    flag: "🇸🇬",
    typology: "Tropical Waterfront High-Rise",
    baseLST: "36.8°C",
    mitigatedLST: "34.0°C",
    cooling: "−2.80°C",
    hvacSaved: "185,000 kWh",
    desc: "Equatorial high-density skyscrapers with microclimate sea breeze and water body cooling.",
  },
  {
    id: "phoenix_downtown",
    name: "Downtown Core",
    city: "Phoenix",
    country: "USA",
    flag: "🇺🇸",
    typology: "Arid Desert Grid",
    baseLST: "51.4°C",
    mitigatedLST: "46.9°C",
    cooling: "−4.50°C",
    hvacSaved: "210,000 kWh",
    desc: "Low-humidity desert urban grid subject to intense solar radiation (>1000 W/m²).",
  },
  {
    id: "tokyo_shinjuku",
    name: "Shinjuku Canyon",
    city: "Tokyo",
    country: "Japan",
    flag: "🇯🇵",
    typology: "Hyperdense Urban Canyons",
    baseLST: "39.5°C",
    mitigatedLST: "36.3°C",
    cooling: "−3.20°C",
    hvacSaved: "135,000 kWh",
    desc: "Deep street canyons with high building heights and severe HVAC waste heat emissions.",
  },
];

// 8 Satellite & Geospatial Datasets
const DATASETS = [
  {
    name: "Landsat 8/9 TIRS Level-2",
    resolution: "Observed raster not loaded",
    source: "NASA / USGS",
    role: "Intended independent thermal reference. The current Digital Twin grid path computes SEB-modelled temperatures and does not load this observation raster.",
    tag: "Not active in current grid path",
  },
  {
    name: "NASA ECOSTRESS L2",
    resolution: "Observed raster not loaded",
    source: "NASA / ISS ECOSTRESS",
    role: "Potential independent thermal reference. The current grid path does not ingest ECOSTRESS observations.",
    tag: "Not active in current grid path",
  },
  {
    name: "Sentinel-2 MSI Level-2A",
    resolution: "Observed raster not loaded",
    source: "ESA Copernicus",
    role: "Potential multispectral input for albedo and vegetation indices. Current albedo and vegetation layers use bundled feature attributes and parameterization instead.",
    tag: "Not active in current grid path",
  },
  {
    name: "Google Open Buildings V3",
    resolution: "External vector source not loaded",
    source: "Google Open Buildings",
    role: "Potential building-footprint source. The active grid path rasterizes the bundled GeoJSON feature set; its upstream acquisition metadata is not embedded in the API response.",
    tag: "Bundled vectors used instead",
  },
  {
    name: "NASA GEDI Spaceborne LiDAR",
    resolution: "Observed raster not loaded",
    source: "NASA GEDI",
    role: "Potential canopy-structure input. Canopy height and LAI are parameterized in the active grid path rather than loaded from a GEDI raster.",
    tag: "Not active in current grid path",
  },
  {
    name: "WorldPop Demographics",
    resolution: "Observed raster not loaded",
    source: "WorldPop / Census",
    role: "Potential population reference. The active grid path creates a morphology/road proxy, not a WorldPop or census-derived population raster.",
    tag: "Proxy layer used instead",
  },
  {
    name: "VIIRS Nighttime Lights",
    resolution: "Observed raster not loaded",
    source: "NOAA / NASA VIIRS",
    role: "Potential nighttime-radiance reference. Anthropogenic heat is currently estimated from building/road morphology, not VIIRS observations.",
    tag: "Proxy layer used instead",
  },
  {
    name: "ERA5-Land Reanalysis",
    resolution: "Baseline values configured",
    source: "ECMWF ERA5-Land (not connected here)",
    role: "Potential meteorological forcing source. The current study-area registry uses configured baseline climate values rather than loading ERA5-Land at runtime.",
    tag: "Configured climate inputs",
  },
];

// 4 Mathematical SEB Pillars
const SEB_PILLARS = [
  {
    symbol: "Q*",
    name: "Net Radiation Flux",
    formula: "(1 − α)S↓ + εL↓ − εσTs⁴",
    desc: "Balances absorbed shortwave solar irradiance against atmospheric longwave trapping and surface Planck emissions.",
    impact: "Mitigated via High-Albedo Coatings (Δα = +0.40)",
    color: "text-cobalt",
  },
  {
    symbol: "Qf",
    name: "Anthropogenic Waste Heat",
    formula: "Qf,hvac + Qf,traffic + Qf,metabolic",
    desc: "Parameterizes localized heat exhaust from building chillers, vehicles, and commercial activities coupled to density.",
    impact: "Mitigated via Chiller Load Reduction & Shading",
    color: "text-status-high",
  },
  {
    symbol: "Qh",
    name: "Sensible Turbulent Heat",
    formula: "ρ cp (Ts − Ta) / ra",
    desc: "The direct convective flux heating the pedestrian canopy layer, mediated by aerodynamic resistance ra = f(z₀, d, u₁₀).",
    impact: "Mitigated via Tree Corridor Roughness & Albedo",
    color: "text-status-critical",
  },
  {
    symbol: "Qe",
    name: "Latent Evapotranspiration",
    formula: "(f_veg · β_wet + f_water) · Qe,pot",
    desc: "Natural evaporative cooling governed by Penman-Monteith saturation vapor deficit equilibrium and stomatal resistance.",
    impact: "Boosted via Extensive Green Roofs & Canopy",
    color: "text-status-safe",
  },
];

export default function LandingPage() {
  const [isCooled, setIsCooled] = useState<boolean>(false);
  const [activeArchetype, setActiveArchetype] = useState(0);

  // Interactive Live Thermal Simulator State
  const [simCoolRoof, setSimCoolRoof] = useState<number>(0.30);
  const [simGreenRoof, setSimGreenRoof] = useState<number>(0.25);
  const [simTreeCanopy, setSimTreeCanopy] = useState<number>(0.20);
  const [simWater, setSimWater] = useState<number>(0.05);

  // Computed live physics estimations scaled to active archetype district footprint
  const currentArchetype = ARCHETYPES[activeArchetype] || ARCHETYPES[0];
  const activeDistrictM2 = DEFAULT_STUDY_AREAS.find((s) => s.id === currentArchetype.id)?.analysis_window_area_m2 || 1747713;

  const liveDeltaT = (simCoolRoof * 2.5 + simGreenRoof * 1.9 + simTreeCanopy * 2.3 + simWater * 3.8);
  const liveCapEx = (simCoolRoof * 0.45 * activeDistrictM2 * 18 + simGreenRoof * 0.45 * activeDistrictM2 * 75 + simTreeCanopy * 0.55 * activeDistrictM2 * 35 + simWater * 0.55 * activeDistrictM2 * 120);
  const liveWaterM3 = (simGreenRoof * 0.45 * activeDistrictM2 * 450 + simTreeCanopy * 0.55 * activeDistrictM2 * 600 + simWater * 0.55 * activeDistrictM2 * 1200) / 1000;
  const liveHvacSavingsKwh = Math.round(liveDeltaT * 42000 * (activeDistrictM2 / 1747713));
  const liveAnnualSavingsUsd = Math.round(liveHvacSavingsKwh * 0.12);

  return (
    <div className="flex flex-col min-h-screen bg-surface-base text-ink-primary select-none overflow-x-hidden">

      {/* ── Top Header Navigation Bar ────────────────────────────────────────────── */}
      <header className="w-full border-b border-surface-border bg-surface-base/90 backdrop-blur-md sticky top-0 z-40 px-6 sm:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-md bg-cobalt/10 border border-cobalt/20 flex items-center justify-center shrink-0 group-hover:bg-cobalt/15 transition-colors">
              <span className="font-semibold text-[11px] text-cobalt tracking-tight">uc</span>
            </div>
            <span className="font-medium text-ink-primary text-[14px] tracking-tight">
              UrbanCoolSim
            </span>
          </Link>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-elevated border border-surface-border text-[10px] font-mono text-ink-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-status-safe animate-subtle-pulse" />
            <span>SEB v2.4</span>
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-5">
          <Link
            href="/dashboard"
            className="text-[12px] font-medium text-ink-secondary hover:text-ink-primary transition-colors hidden md:inline"
          >
            Dashboard
          </Link>
          <Link
            href="/digital-twin"
            className="text-[12px] font-medium text-ink-secondary hover:text-ink-primary transition-colors hidden md:inline"
          >
            Digital Twin
          </Link>
          <Link
            href="/optimization"
            className="text-[12px] font-medium text-ink-secondary hover:text-ink-primary transition-colors hidden sm:inline"
          >
            Optimization
          </Link>
          <Link
            href="/methodology"
            className="text-[12px] font-medium text-ink-secondary hover:text-ink-primary transition-colors hidden sm:inline"
          >
            Methodology
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md btn-cobalt text-[12px] font-medium shadow-sm"
          >
            <span>Launch Platform</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </header>

      {/* ── 1. Hero Section ────────────────────────────────────────────────────────── */}
      <section className="relative pt-12 pb-20 px-6 sm:px-12 max-w-7xl mx-auto w-full flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-16">
        <div className="w-full lg:w-1/2 space-y-7">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-elevated border border-surface-border text-xs text-ink-secondary"
          >
            <span className="w-2 h-2 rounded-full bg-status-safe animate-subtle-pulse" />
            <span className="font-mono text-[11px]">Spatial Digital Twin · SEB Thermodynamics</span>
          </motion.div>

          <motion.h1
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={1}
            className="text-4xl sm:text-5xl lg:text-[3.5rem] font-medium tracking-tight leading-[1.08] text-ink-primary"
          >
            Better infrastructure decisions,{" "}
            <span className="italic font-serif text-cobalt">not passive heat maps.</span>
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={2}
            className="text-sm text-ink-secondary leading-relaxed max-w-lg"
          >
            UrbanCoolSim combines georeferenced urban vector features, first-principles thermodynamics,
            and a LightGBM surrogate into an interactive decision-support twin for municipal cooling scenarios. Independent satellite-temperature validation is not yet connected to the active grid path.
          </motion.p>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={3}
            className="flex flex-wrap items-center gap-3 pt-1"
          >
            <Link
              href="/dashboard"
              className="btn-cobalt px-5 py-2.5 rounded-md text-xs flex items-center gap-2 font-medium shadow-surface hover:shadow-cobaltGlow transition-all"
            >
              <span>Launch Platform</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>

            <button
              onClick={() => setIsCooled(!isCooled)}
              className={`px-4 py-2.5 rounded-md border text-xs flex items-center gap-2 transition-all ${
                isCooled
                  ? "border-cobalt/40 bg-cobalt/10 text-cobalt font-medium shadow-sm"
                  : "border-surface-border bg-surface-elevated text-ink-secondary hover:text-ink-primary"
              }`}
            >
              <Thermometer className="w-3.5 h-3.5" />
              <span>{isCooled ? "Illustrative Hybrid Preview" : "Illustrative Reference Preview"}</span>
            </button>
          </motion.div>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={4}
            className="grid grid-cols-3 gap-3 pt-4 border-t border-surface-border/60 text-xs"
          >
            <div className="p-2.5 rounded-lg surface-inset space-y-0.5">
              <span className="text-label text-ink-dim block">Effective Grid</span>
              <span className="font-mono text-sm text-ink-primary font-medium">~26m at 50 × 50</span>
            </div>
            <div className="p-2.5 rounded-lg surface-inset space-y-0.5">
              <span className="text-label text-cobalt block">Surrogate Model</span>
              <span className="font-mono text-[10px] text-cobalt font-medium">Benchmark pending</span>
            </div>
            <div className="p-2.5 rounded-lg surface-inset space-y-0.5">
              <span className="text-label text-status-safe block">Validation Mode</span>
              <span className="font-mono text-sm text-status-safe font-medium">Internal consistency</span>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="w-full lg:w-1/2 h-[460px] graphite-card rounded-lg overflow-hidden relative shadow-floating"
        >
          <Hero3DCanvas isCooled={isCooled} />

          <div className="absolute bottom-3 left-3 py-2 px-3 rounded-md bg-surface-base/90 backdrop-blur-md border border-surface-border text-[11px] space-y-0.5 pointer-events-none">
            <div className="text-label text-ink-dim">Illustrative Thermal Field</div>
            <div className="flex items-center gap-2 text-ink-primary">
              <span className="font-medium">{isCooled ? "Illustrative Hybrid Preview" : "Illustrative Reference Preview"}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                isCooled ? "bg-cobalt/15 text-cobalt font-medium" : "bg-status-critical/15 text-status-critical font-medium"
              }`}>
                {isCooled ? "Example −3.42°C" : "Example peak 48.5°C"}
              </span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── 2. Interactive Live Thermal Sandbox Preview ─────────────────────────── */}
      <section className="py-16 px-6 sm:px-12 border-t border-surface-border bg-surface-elevated/40">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div className="space-y-1.5">
              <span className="text-label text-cobalt">Illustrative Interactive Preview</span>
              <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
                Explore district-cooling assumptions
              </h2>
              <p className="text-xs text-ink-secondary max-w-xl leading-relaxed">
                Adjust intervention assumptions to explore planning estimates scaled to {currentArchetype.name} (~{(activeDistrictM2 / 10000).toFixed(1)} ha analysis window, {activeDistrictM2.toLocaleString("en-US")} m² bounding box). These browser-side formulas are illustrative planning models, not a live physics-solver result.
              </p>
            </div>

            <div className="flex items-center gap-4 sm:gap-6 bg-surface-base border border-surface-border px-4 py-2.5 rounded-lg tabular-nums shadow-sm">
              <div>
                <span className="text-label text-ink-dim block">Illustrative Cooling</span>
                <div className="flex items-baseline gap-0.5">
                  <span className="editorial-headline text-2xl sm:text-3xl text-cobalt font-normal tracking-tight">−</span>
                  <AnimatedCounter value={liveDeltaT} decimals={2} className="editorial-headline text-2xl sm:text-3xl text-cobalt font-normal tracking-tight" />
                  <span className="text-xs text-ink-muted font-serif ml-0.5">°C</span>
                </div>
              </div>
              <div className="h-8 w-px bg-surface-border" />
              <div>
                <span className="text-label text-ink-dim block">Illustrative CapEx</span>
                <span className="editorial-headline text-xl sm:text-2xl text-ink-primary tracking-tight">
                  ${Math.round(liveCapEx / 1000)}k
                </span>
              </div>
              <div className="h-8 w-px bg-surface-border" />
              <div>
                <span className="text-label text-ink-dim block">Illustrative Utility Savings</span>
                <span className="editorial-headline text-xl sm:text-2xl text-status-safe tracking-tight">
                  +${liveAnnualSavingsUsd.toLocaleString("en-US")}/yr
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="graphite-card p-4 rounded-lg surface-inset space-y-2.5">
              <div className="flex justify-between items-baseline text-xs">
                <span className="font-medium text-ink-primary">Cool Roofs (Albedo)</span>
                <span className="font-mono text-cobalt text-xs font-semibold">+{Math.round(simCoolRoof * 100)}%</span>
              </div>
              <input
                type="range" min="0" max="0.8" step="0.05" value={simCoolRoof}
                onChange={(e) => setSimCoolRoof(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${(simCoolRoof / 0.8) * 100}%, var(--surface-hover) ${(simCoolRoof / 0.8) * 100}%, var(--surface-hover) 100%)`
                }}
                className="w-full"
              />
              <span className="text-[11px] text-ink-muted block">$18/m² · Zero water requirement</span>
            </div>

            <div className="graphite-card p-4 rounded-lg surface-inset space-y-2.5">
              <div className="flex justify-between items-baseline text-xs">
                <span className="font-medium text-ink-primary">Green Roofs (ET)</span>
                <span className="font-mono text-cobalt text-xs font-semibold">+{Math.round(simGreenRoof * 100)}%</span>
              </div>
              <input
                type="range" min="0" max="0.7" step="0.05" value={simGreenRoof}
                onChange={(e) => setSimGreenRoof(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${(simGreenRoof / 0.7) * 100}%, var(--surface-hover) ${(simGreenRoof / 0.7) * 100}%, var(--surface-hover) 100%)`
                }}
                className="w-full"
              />
              <span className="text-[11px] text-ink-muted block">$75/m² · 450 L/m²/yr irrigation</span>
            </div>

            <div className="graphite-card p-4 rounded-lg surface-inset space-y-2.5">
              <div className="flex justify-between items-baseline text-xs">
                <span className="font-medium text-ink-primary">Urban Tree Canopy</span>
                <span className="font-mono text-cobalt text-xs font-semibold">+{Math.round(simTreeCanopy * 100)}%</span>
              </div>
              <input
                type="range" min="0" max="0.5" step="0.05" value={simTreeCanopy}
                onChange={(e) => setSimTreeCanopy(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${(simTreeCanopy / 0.5) * 100}%, var(--surface-hover) ${(simTreeCanopy / 0.5) * 100}%, var(--surface-hover) 100%)`
                }}
                className="w-full"
              />
              <span className="text-[11px] text-ink-muted block">$35/m² · Microclimate shading</span>
            </div>

            <div className="graphite-card p-4 rounded-lg surface-inset space-y-2.5">
              <div className="flex justify-between items-baseline text-xs">
                <span className="font-medium text-ink-primary">Water Retention Bodies</span>
                <span className="font-mono text-cobalt text-xs font-semibold">+{Math.round(simWater * 100)}%</span>
              </div>
              <input
                type="range" min="0" max="0.15" step="0.01" value={simWater}
                onChange={(e) => setSimWater(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #4A6CFF 0%, #4A6CFF ${(simWater / 0.15) * 100}%, var(--surface-hover) ${(simWater / 0.15) * 100}%, var(--surface-hover) 100%)`
                }}
                className="w-full"
              />
              <span className="text-[11px] text-ink-muted block">$120/m² · Direct evaporative heat sink</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. The Core Challenge & CFD vs Surrogate Comparison ──────────────────── */}
      <section className="py-20 px-6 sm:px-12 border-t border-surface-border">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            {/* Left: The Insight */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={fadeUp}
              className="lg:col-span-7 space-y-6"
            >
              <div className="space-y-2">
                <span className="text-label text-status-critical">The Problem With Heat Maps</span>
                <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary leading-snug">
                  Satellite rasters show where it is hot today — but fail to explain why or how to fix it.
                </h2>
                <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed max-w-xl">
                  Without enforcing first-principles Surface Energy Balance conservation (
                  <span className="text-ink-primary font-mono font-medium">
                    <i>Q</i>* + <i>Q</i><sub>f</sub> = <i>Q</i><sub>h</sub> + <i>Q</i><sub>e</sub> + Δ<i>Q</i><sub>s</sub>
                  </span>
                  ), municipal planners cannot predict the microclimate return on investment (ROI),
                  or whether urban greenery will exceed finite municipal water reserves.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                {/* 3D CFD Card */}
                <div className="graphite-card p-4 sm:p-5 rounded-lg space-y-2 surface-inset border-l-2 border-l-status-critical/60">
                  <div className="flex items-center justify-between">
                    <span className="text-label text-status-critical">3D CFD Simulation</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-status-critical/10 text-status-critical border border-status-critical/20 font-medium">
                      Legacy Bottleneck
                    </span>
                  </div>
                  <div className="editorial-headline text-3xl text-ink-primary font-normal tracking-tight">
                    ~14.5 hours
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    Too slow for iterative municipal scenario optimization
                  </p>
                </div>

                {/* UrbanCoolSim AI Surrogate Card */}
                <div className="graphite-card p-4 sm:p-5 rounded-lg space-y-2 surface-inset border-l-2 border-l-cobalt">
                  <div className="flex items-center justify-between">
                    <span className="text-label text-cobalt">Configured LightGBM Surrogate</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cobalt/10 text-cobalt border border-cobalt/20 font-medium">
                      Benchmark pending
                    </span>
                  </div>
                  <div className="editorial-headline text-2xl text-cobalt font-normal tracking-tight">
                    Inference enabled
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    Runtime latency, independent accuracy, and explanation consistency still require reproducible benchmark evidence.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Right: The 3 Critical Vulnerabilities */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={fadeUp}
              className="lg:col-span-5 space-y-3.5"
            >
              <div className="graphite-card p-4 rounded-lg surface-inset space-y-1.5 hover:border-surface-borderHover transition-all">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-ink-primary">CapEx & Water Blind Spots</h4>
                  <span className="text-[9px] font-mono text-ink-muted px-1.5 py-0.5 rounded bg-surface-base border border-surface-border font-medium">
                    01
                  </span>
                </div>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  Conventional greenery blueprints ignore finite municipal irrigation reserves and ongoing maintenance expenditures.
                </p>
              </div>

              <div className="graphite-card p-4 rounded-lg surface-inset space-y-1.5 hover:border-surface-borderHover transition-all">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-ink-primary">Surrogate Hallucination Safeguard</h4>
                  <span className="text-[9px] font-mono text-ink-muted px-1.5 py-0.5 rounded bg-surface-base border border-surface-border font-medium">
                    02
                  </span>
                </div>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  Top Pareto recommendations are re-simulated through the deterministic physics solver, rejecting any candidate with residual error &gt;0.15°C.
                </p>
              </div>

              <div className="graphite-card p-4 rounded-lg surface-inset space-y-1.5 hover:border-surface-borderHover transition-all">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-ink-primary">Demographic Equity Exposure</h4>
                  <span className="text-[9px] font-mono text-ink-muted px-1.5 py-0.5 rounded bg-surface-base border border-surface-border font-medium">
                    03
                  </span>
                </div>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  Combines a morphology/road-derived population-density proxy with modelled microclimate indicators. Census or WorldPop observations are not loaded in the active grid path.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── 4. Multi-Source Satellite Data Fusion Stack ──────────────────────────── */}
      <section className="py-20 px-6 sm:px-12 border-t border-surface-border bg-surface-elevated/30">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="max-w-2xl space-y-2">
            <span className="text-label text-cobalt">Remote Sensing Architecture</span>
            <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
              Georeferenced vector layers and modelled microclimate fields
            </h2>
            <p className="text-xs text-ink-secondary leading-relaxed">
              The active grid rasterizes bundled GeoJSON features and derives temperature, canopy, population and anthropogenic-heat proxy layers. Satellite observation rasters are not loaded by this path; grid spacing depends on the selected extent and matrix dimensions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {DATASETS.map((ds, idx) => (
              <motion.div
                key={ds.name}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-30px" }}
                variants={fadeUp}
                custom={idx}
                className="graphite-card p-4 rounded-lg flex flex-col justify-between space-y-3.5 hover:border-surface-borderHover transition-all surface-inset"
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surface-base text-ink-muted border border-surface-border font-medium">
                      {ds.resolution}
                    </span>
                    <span className="text-[10px] font-mono text-cobalt font-semibold">{ds.tag}</span>
                  </div>
                  <h3 className="text-xs font-semibold text-ink-primary leading-snug">{ds.name}</h3>
                  <p className="text-[11px] text-ink-secondary leading-relaxed">{ds.role}</p>
                </div>
                <div className="text-[10px] font-mono text-ink-dim border-t border-surface-border/50 pt-2 flex items-center justify-between">
                  <span>Provider:</span>
                  <span className="text-ink-muted font-medium">{ds.source}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. First-Principles Surface Energy Balance Physics ────────────────────── */}
      <section className="py-20 px-6 sm:px-12 border-t border-surface-border">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left: Section Header & Narrative */}
            <div className="lg:col-span-5 space-y-4">
              <span className="text-label text-cobalt">Thermodynamic Mechanics</span>
              <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary leading-tight">
                First-Principles Surface Energy Balance
              </h2>
              <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
                Energy cannot be created or destroyed. UrbanCoolSim computes a modelled surface-energy balance cell-by-cell using numerical root-finding, with outputs dependent on the configured inputs and physical parameterizations.
              </p>
              <div className="pt-1 flex flex-wrap gap-2 text-[11px] font-mono text-ink-muted">
                <span className="px-2.5 py-1 rounded bg-surface-elevated border border-surface-border flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-safe" />
                  <span>Newton-Raphson Solver</span>
                </span>
                <span className="px-2.5 py-1 rounded bg-surface-elevated border border-surface-border flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cobalt" />
                  <span>Explicit Data Provenance</span>
                </span>
              </div>
            </div>

            {/* Right: Master Equation Card */}
            <div className="lg:col-span-7 graphite-card p-6 sm:p-7 rounded-lg text-center space-y-3 shadow-floating border border-surface-borderHover surface-inset">
              <div className="flex items-center justify-between">
                <span className="text-label text-cobalt">Master Flux Conservation</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cobalt/10 text-cobalt border border-cobalt/20 font-medium">
                  Deterministic Physics
                </span>
              </div>
              <div className="font-serif italic text-3xl sm:text-4xl text-ink-primary tracking-wide py-2">
                <i>Q</i>* + <i>Q</i><sub>f</sub> = <i>Q</i><sub>h</sub> + <i>Q</i><sub>e</sub> + Δ<i>Q</i><sub>s</sub>
              </div>
              <div className="text-[11px] font-mono text-ink-muted pt-2 border-t border-surface-border/50 flex flex-col sm:flex-row items-center justify-between gap-1">
                <span>Units: Watts per square meter [W/m²]</span>
                <span className="text-status-safe font-medium">Numerical convergence checks enabled</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {SEB_PILLARS.map((p, idx) => (
              <motion.div
                key={p.symbol}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-30px" }}
                variants={fadeUp}
                custom={idx}
                className="graphite-card p-5 rounded-lg space-y-3 surface-inset flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className={`text-lg font-serif font-bold italic ${p.color}`}>{p.symbol}</span>
                    <span className="text-[10px] font-mono text-ink-dim uppercase">Term 0{idx + 1}</span>
                  </div>
                  <h3 className="text-xs font-semibold text-ink-primary">{p.name}</h3>
                  <div className="font-mono text-[10px] text-ink-primary bg-surface-base p-2 rounded border border-surface-border">
                    {p.formula}
                  </div>
                  <p className="text-[11px] text-ink-secondary leading-relaxed">{p.desc}</p>
                </div>
                <div className="text-[10px] font-mono text-status-safe border-t border-surface-border/50 pt-2 font-medium">
                  {p.impact}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. The 5 Global Registered Archetypes ─────────────────────────────────── */}
      <section className="py-20 px-6 sm:px-12 border-t border-surface-border bg-surface-elevated/30">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div className="space-y-1.5">
              <span className="text-label text-cobalt">Multi-City Spatial Archetypes</span>
              <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
                Five configured urban study-area archetypes
              </h2>
              <p className="text-xs text-ink-secondary max-w-xl leading-relaxed">
                Spans arid desert grids, coastal humid cores, and tropical waterfront canyons with localized meteorological forcing.
              </p>
            </div>

            {/* City Selector Pills */}
            <div className="flex flex-wrap items-center gap-1.5 bg-surface-base p-1 rounded-lg border border-surface-border">
              {ARCHETYPES.map((arch, idx) => (
                <button
                  key={arch.id}
                  onClick={() => setActiveArchetype(idx)}
                  className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
                    activeArchetype === idx
                      ? "bg-cobalt text-white font-medium shadow-sm"
                      : "text-ink-secondary hover:text-ink-primary hover:bg-surface-interactive/60"
                  }`}
                >
                  <span className="mr-1">{arch.flag}</span>
                  <span>{arch.city}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-ink-dim leading-relaxed">The figures below are static illustrative presets for comparing archetypes; they are not live outputs from the selected study-area grid or an independently validated simulation.</p>

          {/* Active City Detail Card */}
          <div className="graphite-card p-6 sm:p-8 rounded-lg shadow-floating border border-surface-borderHover">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{ARCHETYPES[activeArchetype].flag}</span>
                  <div>
                    <h3 className="text-lg font-medium text-ink-primary">
                      {ARCHETYPES[activeArchetype].name} · {ARCHETYPES[activeArchetype].city}
                    </h3>
                    <span className="text-xs font-mono text-cobalt font-medium">{ARCHETYPES[activeArchetype].typology}</span>
                  </div>
                </div>
                <p className="text-xs text-ink-secondary leading-relaxed max-w-xl">
                  {ARCHETYPES[activeArchetype].desc}
                </p>

                <div className="grid grid-cols-3 gap-3 pt-2 tabular-nums">
                  <div className="surface-inset p-3 rounded-lg">
                    <span className="text-label text-ink-dim block mb-0.5">Illustrative Baseline Peak</span>
                    <span className="font-mono text-sm font-semibold text-status-critical">{ARCHETYPES[activeArchetype].baseLST}</span>
                  </div>
                  <div className="surface-inset p-3 rounded-lg">
                    <span className="text-label text-ink-dim block mb-0.5">Illustrative Mitigated Peak</span>
                    <span className="font-mono text-sm font-semibold text-ink-primary">{ARCHETYPES[activeArchetype].mitigatedLST}</span>
                  </div>
                  <div className="surface-inset p-3 rounded-lg">
                    <span className="text-label text-cobalt block mb-0.5">Mean Cooling (ΔT)</span>
                    <span className="font-mono text-sm font-bold text-cobalt">{ARCHETYPES[activeArchetype].cooling}</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 flex flex-col justify-between gap-4 p-5 surface-inset rounded-lg">
                <div className="space-y-2.5 text-xs">
                  <div className="text-label text-ink-dim">Illustrative Annual-Benefit Preview</div>
                  <div className="flex justify-between items-center py-1.5 border-b border-surface-border/50 font-mono">
                    <span className="text-ink-secondary">HVAC Electricity Saved:</span>
                    <strong className="text-ink-primary font-semibold">{ARCHETYPES[activeArchetype].hvacSaved}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-surface-border/50 font-mono">
                    <span className="text-ink-secondary">Validation Accuracy:</span>
                    <strong className="text-amber-300 font-semibold">Internal self-consistency only</strong>
                  </div>
                </div>

                <Link
                  href="/digital-twin"
                  className="btn-cobalt w-full py-2.5 rounded-md text-xs flex items-center justify-center gap-1.5 font-medium"
                >
                  <span>Explore Spatial Digital Twin</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. TreeSHAP Explainability & Modality Breakdown ───────────────────────── */}
      <section className="py-20 px-6 sm:px-12 border-t border-surface-border">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="max-w-2xl space-y-2">
            <span className="text-label text-cobalt">AI Explainability Engine</span>
            <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
              TreeSHAP causal feature attributions
            </h2>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Every simulated temperature drop is decomposed into exact mathematical contributions from albedo reflectance, canopy shading, and evapotranspiration.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="graphite-card p-5 rounded-lg space-y-3 surface-inset">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-ink-primary">Cool Roofs (Albedo)</span>
                <span className="font-mono text-sm font-bold text-cobalt">42%</span>
              </div>
              <div className="w-full bg-surface-base rounded-full h-1.5 overflow-hidden">
                <div className="bg-cobalt h-full rounded-full" style={{ width: "42%" }} />
              </div>
              <p className="text-[11px] text-ink-secondary leading-relaxed">
                Shortwave solar reflection prevents surface heat absorption at $18/m² with zero ongoing water requirement.
              </p>
            </div>

            <div className="graphite-card p-5 rounded-lg space-y-3 surface-inset">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-ink-primary">Tree Canopy (Shading)</span>
                <span className="font-mono text-sm font-bold text-status-safe">31%</span>
              </div>
              <div className="w-full bg-surface-base rounded-full h-1.5 overflow-hidden">
                <div className="bg-status-safe h-full rounded-full" style={{ width: "31%" }} />
              </div>
              <p className="text-[11px] text-ink-secondary leading-relaxed">
                Beer-Lambert canopy radiation attenuation shields pedestrian street corridors and cools ambient air.
              </p>
            </div>

            <div className="graphite-card p-5 rounded-lg space-y-3 surface-inset">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-ink-primary">Green Roofs (ET Flux)</span>
                <span className="font-mono text-sm font-bold text-ink-primary">19%</span>
              </div>
              <div className="w-full bg-surface-base rounded-full h-1.5 overflow-hidden">
                <div className="bg-ink-muted h-full rounded-full" style={{ width: "19%" }} />
              </div>
              <p className="text-[11px] text-ink-secondary leading-relaxed">
                Vegetative evapotranspiration converts sensible heat into latent moisture flux, lowering building cooling loads.
              </p>
            </div>

            <div className="graphite-card p-5 rounded-lg space-y-3 surface-inset">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-ink-primary">Water Bodies (Sink)</span>
                <span className="font-mono text-sm font-bold text-cyan-400">8%</span>
              </div>
              <div className="w-full bg-surface-base rounded-full h-1.5 overflow-hidden">
                <div className="bg-cyan-400 h-full rounded-full" style={{ width: "8%" }} />
              </div>
              <p className="text-[11px] text-ink-secondary leading-relaxed">
                Direct open-water evaporation provides localized microclimate cooling buffers along urban retention corridors.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. Stakeholder Personas & Value Matrix ─────────────────────────────────── */}
      <section className="py-20 px-6 sm:px-12 border-t border-surface-border bg-surface-elevated/30">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-label text-cobalt">Multi-Stakeholder Perspectives</span>
            <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
              Built for city planners, developers, and scientists
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="graphite-card p-6 rounded-lg space-y-4 flex flex-col justify-between hover:border-surface-borderHover transition-all surface-inset">
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-lg bg-status-critical/10 flex items-center justify-center text-status-critical border border-status-critical/20">
                  <Landmark className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-ink-primary">Municipal Decision-Makers</h3>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  Design Heat-Health Action Plans, target high-vulnerability demographic wards, optimize municipal CapEx budgets, and verify water conservation quotas.
                </p>
              </div>
              <ul className="text-[11px] text-ink-muted space-y-1.5 border-t border-surface-border/50 pt-3">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-status-critical shrink-0" />
                  <span>Demographic exposure counting (&gt;41.5°C)</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-status-critical shrink-0" />
                  <span>Heat Alert Tier notifications (Yellow/Orange/Red)</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-status-critical shrink-0" />
                  <span>Ready-to-publish PDF executive dossiers</span>
                </li>
              </ul>
            </div>

            <div className="graphite-card p-6 rounded-lg space-y-4 flex flex-col justify-between hover:border-surface-borderHover transition-all surface-inset">
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-lg bg-cobalt/10 flex items-center justify-center text-cobalt border border-cobalt/20">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-ink-primary">Real Estate ESG & Infrastructure</h3>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  Quantify annual HVAC chiller energy savings (kWh), model financial payback periods, claim LEED / BREEAM thermal comfort credits, and export GIS blueprints.
                </p>
              </div>
              <ul className="text-[11px] text-ink-muted space-y-1.5 border-t border-surface-border/50 pt-3">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-cobalt shrink-0" />
                  <span>Financial tariff ROI modeling ($/kWh)</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-cobalt shrink-0" />
                  <span>Scope 2 avoided carbon accounting (tCO₂e)</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-cobalt shrink-0" />
                  <span>Vector GeoJSON layers for CAD and QGIS</span>
                </li>
              </ul>
            </div>

            <div className="graphite-card p-6 rounded-lg space-y-4 flex flex-col justify-between hover:border-surface-borderHover transition-all surface-inset">
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-lg bg-status-safe/10 flex items-center justify-center text-status-safe border border-status-safe/20">
                  <Microscope className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-ink-primary">Climate Resilience Researchers</h3>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  Inspect thermodynamic flux matrices, audit aerodynamic-resistance formulations, and distinguish internal self-consistency checks from independent satellite validation.
                </p>
              </div>
              <ul className="text-[11px] text-ink-muted space-y-1.5 border-t border-surface-border/50 pt-3">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-status-safe shrink-0" />
                  <span>Deterministic SEB conservation audits</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-status-safe shrink-0" />
                  <span>Internal self-consistency check; satellite validation pending</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-status-safe shrink-0" />
                  <span>2,500-cell raw CSV matrix downloads</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── 9. Complete 11-Screen Platform Sitemap ─────────────────────────────────── */}
      <section className="py-20 px-6 sm:px-12 border-t border-surface-border">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="max-w-2xl space-y-2">
            <span className="text-label text-cobalt">Comprehensive Capabilities</span>
            <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
              11 specialized spatial and decision-support modules
            </h2>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Explore the complete analytical tool suite designed for first-principles microclimate engineering.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: "Executive Overview", path: "/dashboard", desc: "Multi-city archetypes, hero decision KPI, and thermodynamic flux balance.", icon: Activity },
              { title: "Spatial Digital Twin", path: "/digital-twin", desc: "Georeferenced modelled grid with NASA GIBS global reference and 3D mode.", icon: Globe },
              { title: "Heat Risk Matrix", path: "/heat-risk", desc: "Demographic exposure matrix, 4 canonical urban zones & ward HVI rankings.", icon: Flame },
              { title: "Surface Energy Balance", path: "/thermal-analysis", desc: "Newton-Raphson thermodynamic solver with atmospheric boundary controls.", icon: Sun },
              { title: "Intervention Studio", path: "/intervention-studio", desc: "Real-time interactive 2D thermal canvas sandbox & line-item CapEx ledger.", icon: SlidersHorizontal },
              { title: "Scenario Lab", path: "/scenario-lab", desc: "Side-by-side dual raster comparison and interactive A/B swipe divider tool.", icon: Layers },
              { title: "Optimization Engine", path: "/optimization", desc: "NSGA-II scenario search; implemented objectives and physics checks are documented separately from UI priorities.", icon: Target },
              { title: "Simulation Results", path: "/simulation-results", desc: "24-hour diurnal temperature curves, modality donut & energy ROI model.", icon: BarChart3 },
              { title: "Internal Validation", path: "/validation", desc: "Synthetic benchmark self-consistency check; independent satellite validation is not connected yet.", icon: ShieldCheck },
              { title: "Decision Reports", path: "/reports", desc: "Publication-ready PDF dossier, vector GeoJSON & CSV microgrid exports.", icon: FileText },
              { title: "Physics Methodology", path: "/methodology", desc: "Mathematical formulations, boundary assumptions & zero-hallucination rules.", icon: Microscope },
            ].map((module, idx) => {
              const MIcon = module.icon;
              return (
                <Link
                  key={module.path}
                  href={module.path}
                  className="group graphite-card p-4 rounded-lg flex flex-col justify-between space-y-3 hover:border-cobalt/40 transition-all surface-inset"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="w-7 h-7 rounded bg-surface-base border border-surface-border flex items-center justify-center text-cobalt group-hover:border-cobalt/40 transition-colors">
                        <MIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[10px] font-mono text-ink-muted">Screen 0{idx + 1}</span>
                    </div>
                    <h3 className="text-xs font-semibold text-ink-primary group-hover:text-cobalt transition-colors flex items-center gap-1">
                      <span>{module.title}</span>
                      <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
                    </h3>
                    <p className="text-[11px] text-ink-secondary leading-relaxed">{module.desc}</p>
                  </div>
                  <span className="text-[10px] font-mono text-ink-dim">Route: {module.path}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 10. Call to Action Banner ─────────────────────────────────────────────── */}
      <section className="py-20 px-6 sm:px-12 border-t border-surface-border bg-surface-elevated/50">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <span className="text-label text-status-safe">Deploy Microclimate Intelligence</span>
          <h2 className="editorial-headline text-3xl sm:text-4xl lg:text-5xl font-normal text-ink-primary">
            Spend computationally before spending physically.
          </h2>
          <p className="text-xs sm:text-sm text-ink-secondary max-w-xl mx-auto leading-relaxed">
Explore urban heat mitigation assumptions, inspect modelled physics outputs, and export decision-support artefacts with their provenance clearly identified.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/dashboard"
              className="btn-cobalt px-6 py-3 rounded-md text-xs flex items-center gap-2 font-medium shadow-surface hover:shadow-cobaltGlow transition-all"
            >
              <span>Open Executive Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/reports"
              className="px-5 py-3 rounded-md bg-surface-elevated hover:bg-surface-interactive border border-surface-border text-xs text-ink-primary font-medium transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4 text-cobalt" />
              <span>Download Technical Dossier</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 11. Footer ───────────────────────────────────────────────────────────── */}
      <footer className="py-8 px-6 sm:px-12 border-t border-surface-border bg-surface-base">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-[11px] text-ink-dim">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-safe" />
            <span className="text-ink-secondary">UrbanCoolSim · Surface Energy Balance Intelligence Platform</span>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <Link href="/dashboard" className="hover:text-ink-secondary transition-colors">Overview</Link>
            <Link href="/digital-twin" className="hover:text-ink-secondary transition-colors">Spatial Twin</Link>
            <Link href="/heat-risk" className="hover:text-ink-secondary transition-colors">Heat Risk</Link>
            <Link href="/optimization" className="hover:text-ink-secondary transition-colors">Optimization</Link>
            <Link href="/reports" className="hover:text-ink-secondary transition-colors">Dossiers</Link>
            <Link href="/methodology" className="hover:text-ink-secondary transition-colors">Methodology</Link>
          </div>

          <div className="font-mono text-[10px] text-ink-dim">
            © 2026 UrbanCoolSim SEB Physics Engine
          </div>
        </div>
      </footer>
    </div>
  );
}
