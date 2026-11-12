"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { api, HeatRiskData } from "@/lib/api";
import { 
  AlertTriangle, 
  Trees, 
  Droplets, 
  Sun, 
  ArrowRight,
  Search,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";

export default function HeatRiskPage() {
  const [studyArea, setStudyArea] = useState("delhi_cp");
  const [heatData, setHeatData] = useState<HeatRiskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = async (areaId: string) => {
    setLoading(true);
    try {
      const res = await api.getHeatRiskAnalysis(areaId);
      setHeatData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedArea = localStorage.getItem("urbancoolsim_study_area") || "delhi_cp";
    setStudyArea(savedArea);
    loadData(savedArea);

    const handleAreaChange = (e: any) => {
      if (e.detail) {
        setStudyArea(e.detail);
        loadData(e.detail);
      }
    };
    window.addEventListener("studyAreaChanged", handleAreaChange);
    return () => window.removeEventListener("studyAreaChanged", handleAreaChange);
  }, []);

  const filteredWards = (heatData?.ward_risk_ranking || []).filter(w => 
    w.ward_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.primary_driver.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const alertTier = heatData?.heat_alert_tier || "ORANGE ALERT";
  const isRed = alertTier.includes("RED");

  return (
    <div className="flex flex-col min-h-screen bg-surface-base text-ink-primary select-none">
      <Header 
        title="Heat Risk & Vulnerability Analysis" 
        subtitle="Demographic Exposure Matrix & The 4 Canonical Urban Zones" 
        onStudyAreaChange={(id) => {
          setStudyArea(id);
          loadData(id);
        }}
      />

      <div className="p-5 sm:p-7 max-w-7xl mx-auto w-full space-y-6">
        {/* Header Title & Demographic KPIs */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-surface-border/60">
          <div className="space-y-1.5">
            <span className="text-label text-status-critical">
              Demographic Vulnerability & Heat Index
            </span>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
              Localized Heat Risk & Critical Zones
            </h1>
            <p className="text-xs text-ink-secondary max-w-xl leading-relaxed">
              Synthesizes surface thermal extremes, building density morphology, and population exposure 
              into prioritized municipal intervention tiers.
            </p>
          </div>

          <div className="flex items-baseline gap-6 shrink-0">
            <div>
              <span className="text-label text-ink-dim block mb-1">
                Exposed Population (&gt;41.5°C)
              </span>
              <div className="flex items-baseline gap-1">
                <AnimatedCounter 
                  value={heatData?.population_high_exposure || 14800} 
                  decimals={0} 
                  className="editorial-headline text-3xl sm:text-4xl text-status-critical font-normal tracking-tight"
                />
                <span className="text-xs text-ink-muted font-sans ml-1">residents</span>
              </div>
            </div>
            <div className="h-8 w-px bg-surface-border" />
            <div>
              <span className="text-label text-ink-dim block mb-1">
                Outdoor Workers at Risk
              </span>
              <div className="flex items-baseline gap-1">
                <AnimatedCounter 
                  value={heatData?.outdoor_workers_at_risk || 4140} 
                  decimals={0} 
                  className="editorial-headline text-3xl sm:text-4xl text-status-high font-normal tracking-tight"
                />
                <span className="text-xs text-ink-muted font-sans ml-1">active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Heat-Health Protocol Advisory Banner */}
        <div className={`p-3.5 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          isRed 
            ? "bg-status-critical/8 border-status-critical/20 text-status-critical" 
            : "bg-status-high/8 border-status-high/20 text-status-high"
        }`}>
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <div>
              <div className="font-mono text-xs font-semibold uppercase tracking-wider">
                {alertTier} · Municipal Heatwave Warning Active
              </div>
              <p className="text-xs text-ink-secondary mt-0.5">
                {heatData?.heat_alert_message || "High thermal risk across commercial corridors. Public hydration stations active."}
              </p>
            </div>
          </div>

          <Link
            href="/optimization"
            className="btn-cobalt px-3.5 py-1.5 rounded-md text-xs flex items-center gap-1.5 shrink-0"
          >
            <span>Run Mitigation Optimizer</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* The 4 Canonical Urban Heat Zones */}
        <div className="space-y-3">
          <div className="flex justify-between items-baseline px-1">
            <h2 className="text-xs font-medium text-ink-primary">
              The 4 Canonical Urban Heat Zones
            </h2>
            <span className="text-label text-ink-dim">
              2,500 analysis cells · effective spacing depends on extent
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* ZONE 4: Critical Focus (5 Cols) */}
            {heatData?.critical_zones?.[3] && (
              <div className="lg:col-span-5 graphite-card p-5 sm:p-6 rounded-lg flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-label text-status-critical bg-status-critical/10 border border-status-critical/20 px-2 py-0.5 rounded">
                      Zone 4 · Highest Risk
                    </span>
                    <span className="text-xs font-mono text-ink-dim">
                      {heatData.critical_zones[3].area_pct}% Area
                    </span>
                  </div>

                  <h3 className="text-base font-medium text-ink-primary">
                    {heatData.critical_zones[3].name}
                  </h3>

                  <div className="flex items-baseline gap-2 pt-0.5">
                    <span className="editorial-headline text-3xl text-status-critical font-normal">
                      {heatData.critical_zones[3].mean_temp_c}°C
                    </span>
                    <span className="text-label text-ink-dim">Mean LST</span>
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-surface-border text-xs">
                  <div>
                    <span className="text-label text-ink-dim block mb-0.5">Key Benefit</span>
                    <p className="text-ink-primary leading-snug">{heatData.critical_zones[3].benefit}</p>
                  </div>
                  <div>
                    <span className="text-label text-ink-dim block mb-0.5">Constraint</span>
                    <p className="text-ink-secondary leading-snug">{heatData.critical_zones[3].constraint}</p>
                  </div>
                  <div className="flex justify-between items-center pt-1 font-mono text-xs">
                    <span className="text-ink-dim">Unit CapEx:</span>
                    <strong className="text-ink-primary">${heatData.critical_zones[3].unit_cost_usd_m2}/m²</strong>
                  </div>
                </div>
              </div>
            )}

            {/* ZONES 1, 2, 3 (7 Cols) */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {(heatData?.critical_zones || []).slice(0, 3).map((zone, idx) => {
                const icons = [Trees, Droplets, Sun];
                const ZIcon = icons[idx];
                return (
                  <div key={zone.name} className="graphite-card p-4 rounded-lg flex flex-col justify-between space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <ZIcon className="w-4 h-4 text-cobalt" />
                        <span className="text-[10px] font-mono text-ink-dim">{zone.area_pct}% Area</span>
                      </div>
                      <h4 className="text-xs font-medium text-ink-primary leading-snug">{zone.name}</h4>
                      <div className="text-xl font-serif text-ink-primary">{zone.mean_temp_c}°C</div>
                    </div>

                    <div className="space-y-1 pt-2 border-t border-surface-border text-[11px]">
                      <p className="text-ink-secondary leading-snug">{zone.benefit}</p>
                      <div className="font-mono text-[10px] text-ink-dim pt-0.5">
                        ${zone.unit_cost_usd_m2}/m²
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sub-District / Ward Ranking Table */}
        <div className="graphite-card p-5 rounded-lg space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-surface-border pb-3">
            <div>
              <h3 className="text-xs font-semibold text-ink-primary">
                Sub-District Heat Vulnerability Index (HVI) Ranking
              </h3>
              <p className="text-[11px] text-ink-dim mt-0.5">
                Prioritizes municipal intervention based on demographic exposure and localized thermal accumulation
              </p>
            </div>

            {/* Search filter */}
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-dim" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter wards..."
                className="w-full pl-8 pr-3 py-1 rounded bg-surface-base border border-surface-border text-xs text-ink-primary placeholder-ink-dim outline-none focus:border-cobalt transition-colors font-mono"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="border-b border-surface-border text-ink-dim text-label">
                  <th className="pb-2 pr-3">Rank</th>
                  <th className="pb-2 px-3">Sector / Ward</th>
                  <th className="pb-2 px-3">Mean LST</th>
                  <th className="pb-2 px-3">Exposed Pop.</th>
                  <th className="pb-2 px-3">HVI Score</th>
                  <th className="pb-2 px-3">Risk Tier</th>
                  <th className="pb-2 pl-3">Action Protocol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/40 text-ink-secondary">
                {filteredWards.map((ward) => (
                  <tr key={ward.ward_name} className="hover:bg-surface-interactive/30 transition-colors">
                    <td className="py-2.5 pr-3 font-mono text-ink-dim text-[11px]">#{ward.rank}</td>
                    <td className="py-2.5 px-3 font-medium text-ink-primary">{ward.ward_name}</td>
                    <td className="py-2.5 px-3 font-mono text-status-critical font-medium">{ward.mean_temp_c}°C</td>
                    <td className="py-2.5 px-3 font-mono text-ink-secondary">{ward.population_exposed.toLocaleString("en-US")}</td>
                    <td className="py-2.5 px-3 font-mono font-medium text-ink-primary">{ward.hvi_score}</td>
                    <td className="py-2.5 px-3">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase ${
                        ward.risk_tier === "CRITICAL"
                          ? "bg-status-critical/10 text-status-critical font-medium border border-status-critical/20"
                          : ward.risk_tier === "HIGH"
                          ? "bg-status-high/10 text-status-high font-medium border border-status-high/20"
                          : "bg-status-safe/10 text-status-safe border border-status-safe/20"
                      }`}>
                        {ward.risk_tier}
                      </span>
                    </td>
                    <td className="py-2.5 pl-3 text-xs text-ink-secondary">
                      {ward.recommended_action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
