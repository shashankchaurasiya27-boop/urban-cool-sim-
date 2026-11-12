"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { 
  Sparkles, 
  MapPin, 
  Cpu, 
  FileText, 
  ArrowRight, 
  CheckCircle2, 
  X,
  ShieldCheck,
  Scale
} from "lucide-react";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const steps = [
  {
    step: "01",
    title: "Georeferenced Microclimate Digital Twin",
    tag: "Spatial Ingestion",
    desc: "The current active grid rasterizes bundled geospatial features and computes modelled surface temperatures with the SEB solver. Satellite raster inputs must be present and explicitly activated before values can be described as observed LST.",
    icon: MapPin,
    highlight: "Select from 5 multi-city archetypes (Delhi, Mumbai, Singapore, Phoenix, Tokyo).",
  },
  {
    step: "02",
    title: "Surface Energy Balance Physics",
    tag: "Physics Model · Provenance Explicit",
    desc: "Enforces first-principles thermodynamic energy conservation: Q* + Qf = Qh + Qe + ΔQs. Solves non-linear surface temperature equilibrium cell-by-cell using Newton-Raphson numerical root-finding.",
    icon: Cpu,
    highlight: "Physical results are labelled modelled until independently calibrated against observed data.",
  },
  {
    step: "03",
    title: "AI Surrogate & NSGA-II Optimizer",
    tag: "Sub-2ms Pareto Acceleration",
    desc: "A LightGBM surrogate model enables evaluating tens of thousands of intervention trade-offs in milliseconds. Top candidate Pareto portfolios are re-validated through the full physics engine.",
    icon: Scale,
    highlight: "Tune 5 objective weights (Cooling, Cost, Population, Water, HVAC Energy).",
  },
  {
    step: "04",
    title: "Executive Decisions & GIS Export",
    tag: "Actionable Blueprints",
    desc: "Synthesize findings into publication-ready executive PDF decision reports, or export vector GeoJSON and CSV datasets directly into municipal GIS platforms (ArcGIS / QGIS).",
    icon: FileText,
    highlight: "Spend computationally before spending physically.",
  }
];

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "ArrowRight" && currentStep < steps.length - 1) {
        setCurrentStep((prev) => prev + 1);
      } else if (e.key === "ArrowLeft" && currentStep > 0) {
        setCurrentStep((prev) => prev - 1);
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentStep, onClose]);

  if (!isOpen) return null;

  const stepData = steps[currentStep];
  const Icon = stepData.icon;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-base/80 backdrop-blur-sm">
        <div className="bg-surface-elevated border border-surface-border rounded-lg max-w-xl w-full p-6 space-y-6 shadow-floating relative select-none">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded text-ink-muted hover:text-ink-primary hover:bg-surface-interactive transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-cobalt font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Platform Quick Start Walkthrough</span>
            </div>
            <h2 className="editorial-headline text-2xl font-normal text-ink-primary">
              Welcome to UrbanCoolSim
            </h2>
            <p className="text-xs text-ink-secondary">
              AI-driven urban heat intelligence, physics simulation & multi-objective decision support.
            </p>
          </div>

          {/* Stepper Progress Bar */}
          <div className="flex items-center gap-1.5">
            {steps.map((s, idx) => (
              <div
                key={s.step}
                onClick={() => setCurrentStep(idx)}
                className={`h-1 flex-1 rounded-full cursor-pointer transition-colors ${
                  idx === currentStep
                    ? "bg-cobalt"
                    : idx < currentStep
                    ? "bg-surface-borderActive"
                    : "bg-surface-border"
                }`}
              />
            ))}
          </div>

          {/* Step Card Content */}
          <div className="bg-surface-base border border-surface-border rounded p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-surface-interactive flex items-center justify-center text-cobalt">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-ink-muted block">
                  Step {stepData.step} of 04 · {stepData.tag}
                </span>
                <h3 className="text-sm font-medium text-ink-primary mt-0.5">
                  {stepData.title}
                </h3>
              </div>
            </div>

            <p className="text-xs text-ink-secondary leading-relaxed">
              {stepData.desc}
            </p>

            <div className="p-3 bg-surface-elevated border border-surface-border rounded text-xs text-ink-primary flex items-center gap-2 font-mono text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-status-safe shrink-0" />
              <span>{stepData.highlight}</span>
            </div>
          </div>

          {/* Controls Footer */}
          <div className="flex justify-between items-center pt-2 border-t border-surface-border text-xs font-mono">
            <button
              onClick={onClose}
              className="text-ink-muted hover:text-ink-primary transition-colors"
            >
              Skip Tour
            </button>

            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  onClick={() => setCurrentStep((prev) => prev - 1)}
                  className="px-3.5 py-1.5 rounded border border-surface-border text-ink-secondary hover:text-ink-primary hover:bg-surface-interactive transition-colors"
                >
                  Previous
                </button>
              )}

              {currentStep < steps.length - 1 ? (
                <button
                  onClick={() => setCurrentStep((prev) => prev + 1)}
                  className="btn-cobalt px-4 py-1.5 rounded flex items-center gap-1.5"
                >
                  <span>Next</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="btn-cobalt px-4 py-1.5 rounded flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Start Simulating</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </AnimatePresence>
  );
}
