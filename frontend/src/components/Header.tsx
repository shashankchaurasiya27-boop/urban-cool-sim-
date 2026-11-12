"use client";

import { useState, useEffect, useRef } from "react";
import { 
  MapPin, 
  ChevronDown, 
  HelpCircle, 
  Building2, 
  Landmark, 
  Microscope,
} from "lucide-react";
import { OnboardingModal } from "@/components/OnboardingModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { motion, AnimatePresence } from "framer-motion";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onStudyAreaChange?: (areaId: string) => void;
}

const studyAreas = [
  { 
    id: "delhi_cp", 
    name: "Connaught Place", 
    city: "New Delhi", 
    country: "India", 
    crs: "UTM 43N", 
    flag: "🇮🇳",
    baseTemp: "42.0°C",
    typology: "Semi-Arid Radial Core",
    center: [77.2167, 28.6315],
    zoom: 15.5,
  },
  { 
    id: "mumbai_bkc", 
    name: "Bandra Kurla Complex", 
    city: "Mumbai", 
    country: "India", 
    crs: "UTM 43N", 
    flag: "🇮🇳",
    baseTemp: "36.5°C",
    typology: "Coastal Humid Core",
    center: [72.8683, 19.0657],
    zoom: 15.0,
  },
  { 
    id: "singapore_marina", 
    name: "Marina Bay", 
    city: "Singapore", 
    country: "Singapore", 
    crs: "UTM 48N", 
    flag: "🇸🇬",
    baseTemp: "33.0°C",
    typology: "Tropical High-Rise Waterfront",
    center: [103.8565, 1.2847],
    zoom: 15.2,
  },
  { 
    id: "phoenix_downtown", 
    name: "Downtown Core", 
    city: "Phoenix", 
    country: "USA", 
    crs: "UTM 12N", 
    flag: "🇺🇸",
    baseTemp: "45.0°C",
    typology: "Arid Desert Grid",
    center: [-112.0740, 33.4484],
    zoom: 15.0,
  },
  { 
    id: "tokyo_shinjuku", 
    name: "Shinjuku Canyon", 
    city: "Tokyo", 
    country: "Japan", 
    crs: "UTM 54N", 
    flag: "🇯🇵",
    baseTemp: "35.5°C",
    typology: "High-Density Urban Canyons",
    center: [139.7034, 35.6938],
    zoom: 15.0,
  },
];

const personas = [
  { id: "muni", label: "Municipal Planner", icon: Landmark, tag: "Heat-Health" },
  { id: "developer", label: "Real Estate ESG", icon: Building2, tag: "LEED / ROI" },
  { id: "consultant", label: "Climate Scientist", icon: Microscope, tag: "SEB Physics" },
];

export function Header({ title, subtitle, onStudyAreaChange }: HeaderProps) {
  const [selectedArea, setSelectedArea] = useState("delhi_cp");
  const [selectedPersona, setSelectedPersona] = useState("muni");
  const [showAreaDropdown, setShowAreaDropdown] = useState(false);
  const [showPersonaDropdown, setShowPersonaDropdown] = useState(false);
  const [showTour, setShowTour] = useState(false);

  const areaDropdownRef = useRef<HTMLDivElement>(null);
  const personaDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedArea = localStorage.getItem("urbancoolsim_study_area");
    if (savedArea) setSelectedArea(savedArea);
    const savedPersona = localStorage.getItem("urbancoolsim_persona");
    if (savedPersona) setSelectedPersona(savedPersona);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (areaDropdownRef.current && !areaDropdownRef.current.contains(e.target as Node)) {
        setShowAreaDropdown(false);
      }
      if (personaDropdownRef.current && !personaDropdownRef.current.contains(e.target as Node)) {
        setShowPersonaDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelectArea = (id: string) => {
    setSelectedArea(id);
    localStorage.setItem("urbancoolsim_study_area", id);
    setShowAreaDropdown(false);
    if (onStudyAreaChange) onStudyAreaChange(id);
    window.dispatchEvent(new CustomEvent("studyAreaChanged", { detail: id }));

    const area = studyAreas.find((s) => s.id === id);
    if (area) {
      window.dispatchEvent(
        new CustomEvent("mapFlyTo", {
          detail: { lon: area.center[0], lat: area.center[1], zoom: area.zoom },
        })
      );
    }
  };

  const handleSelectPersona = (id: string) => {
    setSelectedPersona(id);
    localStorage.setItem("urbancoolsim_persona", id);
    setShowPersonaDropdown(false);
    window.dispatchEvent(new CustomEvent("personaChanged", { detail: id }));
  };

  const currentAreaObj = studyAreas.find((s) => s.id === selectedArea) || studyAreas[0];
  const currentPersonaObj = personas.find((p) => p.id === selectedPersona) || personas[0];
  const PersonaIcon = currentPersonaObj.icon;

  return (
    <>
      <header className="h-12 border-b border-surface-border bg-surface-base/95 backdrop-blur-sm px-5 flex items-center justify-between sticky top-0 z-30 select-none">
        {/* Left: Theme Toggle + Title + Subtitle */}
        <div className="flex items-center gap-2.5 min-w-0">
          <ThemeToggle />
          <h1 className="text-[13px] font-medium text-ink-primary tracking-tight truncate">{title}</h1>
          {subtitle && (
            <span className="text-[12px] text-ink-dim border-l border-surface-border pl-3 hidden lg:inline truncate">
              {subtitle}
            </span>
          )}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2 text-[12px] shrink-0">
          {/* Study Area Dropdown */}
          <div ref={areaDropdownRef} className="relative">
            <button
              onClick={() => {
                setShowAreaDropdown(!showAreaDropdown);
                setShowPersonaDropdown(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface-elevated border border-surface-border hover:border-surface-borderHover text-ink-primary transition-colors"
            >
              <span className="text-sm">{currentAreaObj.flag}</span>
              <span className="font-medium text-[12px] hidden sm:inline">
                {currentAreaObj.city}
              </span>
              <span className="text-ink-muted hidden md:inline">
                · {currentAreaObj.name}
              </span>
              <ChevronDown className="w-3 h-3 text-ink-muted ml-0.5" />
            </button>

            <AnimatePresence>
              {showAreaDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 mt-1 w-72 bg-surface-elevated border border-surface-border rounded-lg p-1 shadow-floating z-50"
                >
                  <div className="text-label px-2.5 py-1.5 text-ink-muted border-b border-surface-border/50 mb-0.5">
                    Study Areas
                  </div>
                  {studyAreas.map((area) => (
                    <button
                      key={area.id}
                      onClick={() => handleSelectArea(area.id)}
                      className={`w-full flex items-center justify-between p-2 rounded-md text-left transition-colors ${
                        area.id === selectedArea
                          ? "bg-surface-interactive text-ink-primary"
                          : "text-ink-secondary hover:text-ink-primary hover:bg-surface-interactive/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{area.flag}</span>
                        <div>
                          <div className="text-[12px] text-ink-primary">{area.city} · {area.name}</div>
                          <div className="text-[10px] text-ink-muted">{area.typology}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <span className="text-[11px] font-mono text-status-critical block">{area.baseTemp}</span>
                        <span className="text-[9px] font-mono text-ink-dim">{area.crs}</span>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Persona Switcher */}
          <div ref={personaDropdownRef} className="relative hidden sm:block">
            <button
              onClick={() => {
                setShowPersonaDropdown(!showPersonaDropdown);
                setShowAreaDropdown(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface-elevated border border-surface-border hover:border-surface-borderHover text-ink-secondary hover:text-ink-primary transition-colors"
            >
              <PersonaIcon className="w-3.5 h-3.5 text-cobalt" />
              <span className="hidden md:inline text-[12px]">{currentPersonaObj.label}</span>
              <ChevronDown className="w-3 h-3 text-ink-muted" />
            </button>

            <AnimatePresence>
              {showPersonaDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 mt-1 w-52 bg-surface-elevated border border-surface-border rounded-lg p-1 shadow-floating z-50"
                >
                  <div className="text-label px-2.5 py-1.5 text-ink-muted border-b border-surface-border/50 mb-0.5">
                    Decision Perspective
                  </div>
                  {personas.map((p) => {
                    const PIcon = p.icon;
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleSelectPersona(p.id)}
                        className={`w-full flex items-center justify-between p-2 rounded-md text-[12px] transition-colors ${
                          p.id === selectedPersona
                            ? "bg-surface-interactive text-ink-primary"
                            : "text-ink-secondary hover:text-ink-primary hover:bg-surface-interactive/50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <PIcon className="w-3.5 h-3.5 text-cobalt" />
                          <span>{p.label}</span>
                        </div>
                        <span className="text-[9px] font-mono text-ink-dim">{p.tag}</span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="h-4 w-px bg-surface-border hidden md:block" />

          {/* Help */}
          <button
            onClick={() => setShowTour(true)}
            className="flex items-center gap-1 p-1.5 rounded-md hover:bg-surface-interactive text-ink-muted hover:text-ink-secondary transition-colors"
            title="Platform Walkthrough"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Onboarding Tour Modal */}
      <OnboardingModal isOpen={showTour} onClose={() => setShowTour(false)} />
    </>
  );
}
