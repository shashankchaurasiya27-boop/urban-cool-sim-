"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { api, DigitalTwinGrid } from "@/lib/api";

const DigitalTwinMap = dynamic(
  () => import("@/components/DigitalTwinMap").then((mod) => mod.DigitalTwinMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center surface-inset rounded-lg text-xs font-mono text-ink-muted skeleton-pulse">
        Initializing georeferenced SEB-modelled digital twin…
      </div>
    ),
  }
);

export default function DigitalTwinPage() {
  const [studyArea, setStudyArea] = useState("delhi_cp");
  const [grid, setGrid] = useState<DigitalTwinGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [appliedSolution, setAppliedSolution] = useState<any | null>(null);

  const loadGrid = async (areaId = studyArea) => {
    setLoading(true);
    try {
      const res = await api.getDigitalTwinGrid(areaId, 50, 50);
      setGrid(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedArea = localStorage.getItem("urbancoolsim_study_area") || "delhi_cp";
    setStudyArea(savedArea);
    loadGrid(savedArea);

    const resolveAppliedSolution = (targetArea: string) => {
      try {
        const areaSpecificRaw = localStorage.getItem(`urbancoolsim_active_solution_${targetArea}`);
        if (areaSpecificRaw) {
          const parsed = JSON.parse(areaSpecificRaw);
          if (parsed && (parsed.study_area_id === targetArea || !parsed.study_area_id)) {
            return parsed;
          }
        }
        const rawSol = localStorage.getItem("urbancoolsim_active_solution");
        if (rawSol) {
          const parsed = JSON.parse(rawSol);
          if (parsed && parsed.study_area_id === targetArea) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn("Failed to load applied solution from localStorage:", e);
      }
      return null;
    };

    setAppliedSolution(resolveAppliedSolution(savedArea));

    const handleAreaChange = (e: any) => {
      if (e.detail) {
        setStudyArea(e.detail);
        loadGrid(e.detail);
        setAppliedSolution(resolveAppliedSolution(e.detail));
      }
    };
    window.addEventListener("studyAreaChanged", handleAreaChange);
    return () => window.removeEventListener("studyAreaChanged", handleAreaChange);
  }, []);

  return (
    <div className="flex flex-col h-screen w-full bg-surface-base text-ink-primary overflow-hidden select-none">
      <Header
        title="Spatial Digital Twin"
        subtitle="Georeferenced Vector Layers & SEB Thermal Physics"
        onStudyAreaChange={(id) => {
          setStudyArea(id);
          loadGrid(id);
        }}
      />

      <main className="flex-1 w-full h-[calc(100vh-48px)] p-2.5 relative">
        {grid ? (
          <div className="w-full h-full [&>div]:h-full [&>div]:min-h-full">
            <DigitalTwinMap
              gridData={grid}
              appliedSolution={appliedSolution}
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center surface-inset rounded-lg text-xs text-ink-muted font-mono skeleton-pulse">
            Loading geospatial model grid...
          </div>
        )}
      </main>
    </div>
  );
}
