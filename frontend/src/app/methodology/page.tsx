"use client";

import { Header } from "@/components/Header";
import { ShieldCheck } from "lucide-react";

export default function MethodologyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-surface-base text-ink-primary select-none">
      <Header
        title="Methodology & Scientific Principles"
        subtitle="Mathematical Formulations, Physical Assumptions & Safeguards"
      />

      <div className="p-5 sm:p-7 max-w-5xl mx-auto w-full space-y-8">
        {/* Editorial Heading */}
        <div className="space-y-1.5 pb-6 border-b border-surface-border/60">
          <span className="text-label text-cobalt">
            First-Principles Scientific Formulation
          </span>
          <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
            Thermodynamic Mechanics & System Boundaries
          </h1>
          <p className="text-xs text-ink-secondary max-w-2xl leading-relaxed">
            The active grid path combines bundled georeferenced vector features, a Surface Energy Balance model, and a LightGBM surrogate with multi-objective optimization. Independent satellite LST rasters are not currently loaded by the grid endpoint.
          </p>
        </div>

        {/* 1. Surface Energy Balance Equation */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-cobalt font-medium">01</span>
            <h2 className="text-xs font-semibold text-ink-primary tracking-tight">
              Surface Energy Balance (SEB) Conservation
            </h2>
          </div>

          <div className="graphite-card p-6 sm:p-7 rounded-lg space-y-5">
            <div className="text-center py-3 border-b border-surface-border">
              <span className="font-serif italic text-2xl sm:text-3xl text-ink-primary tracking-wide">
                Q* + Qf = Qh + Qe + ΔQs
              </span>
              <span className="block text-[10px] font-mono text-ink-dim mt-1.5">
                Units: Watts per square meter [W/m²]
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs text-ink-secondary leading-relaxed">
              <div className="space-y-1 p-3 rounded-lg surface-inset">
                <strong className="text-ink-primary font-medium block">Q* — Net All-Wave Radiation</strong>
                <p className="text-[11px] text-ink-dim leading-relaxed">
                  Balances incoming solar shortwave absorption (1 − α)S↓ against
                  atmospheric thermal longwave εL↓ and surface Planck emission εσTs⁴.
                </p>
              </div>

              <div className="space-y-1 p-3 rounded-lg surface-inset">
                <strong className="text-ink-primary font-medium block">Qf — Anthropogenic Waste Heat</strong>
                <p className="text-[11px] text-ink-dim leading-relaxed">
                  Parameterizes localized sensible emissions from HVAC building cooling, vehicular traffic,
                  and commercial activities based on building footprint density.
                </p>
              </div>

              <div className="space-y-1 p-3 rounded-lg surface-inset">
                <strong className="text-ink-primary font-medium block">Qh — Sensible Turbulent Heat Flux</strong>
                <p className="text-[11px] text-ink-dim leading-relaxed">
                  Drives ambient air heating: ρcp (Ts − Ta) / ra. Aerodynamic resistance ra is coupled
                  to logarithmic wind profiles, building heights H, and roughness length z0 = 0.1 H.
                </p>
              </div>

              <div className="space-y-1 p-3 rounded-lg surface-inset">
                <strong className="text-ink-primary font-medium block">Qe — Latent Evapotranspiration Flux</strong>
                <p className="text-[11px] text-ink-dim leading-relaxed">
                  Moisture-driven cooling flux from urban tree canopy, vegetative roofs, and open water bodies,
                  parameterized via Priestley-Taylor equilibrium latent heat potential (0.6 Q*) scaled by surface vegetation fraction, wetness factor, and open water coverage.
                </p>
              </div>

              <div className="space-y-1 p-3 rounded-lg surface-inset md:col-span-2">
                <strong className="text-ink-primary font-medium block">ΔQs — Net Canopy Conductive Storage Flux</strong>
                <p className="text-[11px] text-ink-dim leading-relaxed">
                  Conductive heat flux stored in the urban canopy fabric, parameterized via material storage coefficients: (0.35 f_imperv + 0.15 f_veg + 0.08 f_water) · Q*, balancing daytime heat uptake and nocturnal thermal release.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 2. AI Surrogate & Physics Re-Validation */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-cobalt font-medium">02</span>
            <h2 className="text-xs font-semibold text-ink-primary tracking-tight">
              AI Surrogate Acceleration & Physics Safeguard
            </h2>
          </div>

          <div className="graphite-card p-5 sm:p-6 rounded-lg space-y-3.5 text-xs text-ink-secondary leading-relaxed">
            <p>
              The SEB solver provides a modelled equilibrium under its assumptions and configured boundary conditions. Evaluating many
              optimization candidates can benefit from rapid surrogate inference. The application includes a LightGBM surrogate artifact and a training pipeline. Its training sample count and reported R² must be taken from the matching model metadata and evaluation results, not assumed from this page&apos;s narrative.
            </p>

            <div className="p-3.5 surface-inset rounded-lg flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-status-safe shrink-0 mt-0.5" />
              <div>
                <strong className="text-ink-primary font-medium block">Physics Re-Check (implementation to verify):</strong>
                <p className="text-[11px] text-ink-dim mt-0.5 leading-relaxed">
                  Surrogate models are never trusted blindly. Once the NSGA-II optimizer identifies candidate
                  Pareto solutions, each solution is re-simulated through the full deterministic numerical SEB engine.
                  The exact residual definition, units, and rejection threshold must be verified against the optimization code before this safeguard is claimed as active.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. NSGA-II Formulation */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-cobalt font-medium">03</span>
            <h2 className="text-xs font-semibold text-ink-primary tracking-tight">
              Multi-Objective NSGA-II Optimization Formulation
            </h2>
          </div>

          <div className="graphite-card p-5 sm:p-6 rounded-lg space-y-2.5 text-xs">
            <p className="text-ink-secondary leading-relaxed">
              The evolutionary genetic search solves the core 3-objective Pareto trade-off during optimization, followed by a multi-criteria decision composite ranking across all five municipal stakeholder priorities:
            </p>
            <div className="p-3.5 rounded-lg surface-inset font-mono text-[11px] text-cobalt space-y-1.5">
              <div>Core NSGA-II Pareto Objectives:  min F(x) = [ −ΔT (Cooling),  +CapEx (USD),  +WaterDemand (m³) ]</div>
              <div className="text-ink-secondary text-[10.5px]">Post-Optimization Composite Scoring:  Score = w_cool·ΔT_norm + w_cost·Cost_norm + w_pop·Pop_norm + w_water·Water_norm + w_energy·HVAC_norm</div>
              <div className="text-ink-dim text-[10px]">subject to: CapEx ≤ Budget_max,  Water ≤ Water_max,  Land ≤ Land_max</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
