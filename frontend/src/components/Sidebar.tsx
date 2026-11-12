"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { 
  LayoutDashboard, 
  Map, 
  Flame, 
  AlertTriangle,
  SlidersHorizontal, 
  SplitSquareVertical, 
  Sparkles, 
  BarChart2, 
  CheckCircle, 
  FileText, 
  BookOpen,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface NavGroup {
  group: string;
  items: {
    label: string;
    href: string;
    icon: any;
    tag?: string;
  }[];
}

const navGroups: NavGroup[] = [
  {
    group: "Understand",
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { label: "Spatial Digital Twin", href: "/digital-twin", icon: Map },
      { label: "Heat Risk Matrix", href: "/heat-risk", icon: AlertTriangle, tag: "HVI" },
      { label: "Thermal Analysis", href: "/thermal-analysis", icon: Flame },
    ]
  },
  {
    group: "Design",
    items: [
      { label: "Intervention Studio", href: "/intervention-studio", icon: SlidersHorizontal },
      { label: "Scenario Lab", href: "/scenario-lab", icon: SplitSquareVertical },
      { label: "Optimization Engine", href: "/optimization", icon: Sparkles, tag: "NSGA-II" },
    ]
  },
  {
    group: "Decide",
    items: [
      { label: "Simulation Results", href: "/simulation-results", icon: BarChart2 },
      { label: "Calibration & Truth", href: "/validation", icon: CheckCircle },
      { label: "Decision Reports", href: "/reports", icon: FileText },
    ]
  },
  {
    group: "System",
    items: [
      { label: "Physics & Methodology", href: "/methodology", icon: BookOpen },
    ]
  }
];

export function Sidebar() {
  const pathname = usePathname();
  const isDigitalTwin = pathname === "/digital-twin";
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Auto-collapse sidebar on Digital Twin page to maximize map canvas
  useEffect(() => {
    if (isDigitalTwin) {
      setIsCollapsed(true);
    }
  }, [isDigitalTwin]);

  return (
    <aside 
      className={`${
        isCollapsed ? "w-[52px]" : "w-56"
      } bg-surface-elevated border-r border-surface-border flex flex-col justify-between shrink-0 h-screen sticky top-0 z-30 select-none transition-[width] duration-200 ease-out`}
    >
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        {/* Brand */}
        <div className={`px-3 py-3.5 flex items-center ${isCollapsed ? "justify-center" : "justify-between"} border-b border-surface-border`}>
          <Link href="/" className="group flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-cobalt/10 border border-cobalt/20 flex items-center justify-center shrink-0 group-hover:bg-cobalt/15 transition-colors">
              <span className="font-semibold text-[11px] text-cobalt tracking-tight">uc</span>
            </div>
            {!isCollapsed && (
              <div className="flex flex-col overflow-hidden">
                <span className="font-medium text-ink-primary text-[13px] tracking-tight leading-none truncate">
                  UrbanCoolSim
                </span>
                <span className="text-[9px] text-ink-muted font-mono tracking-wide mt-0.5 truncate">
                  Decision Twin
                </span>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="px-1.5 py-2.5 space-y-2 flex-1">
          {navGroups.map((group) => (
            <div key={group.group} className="space-y-0.5">
              {!isCollapsed && (
                <div className="text-label px-2.5 py-1 text-ink-muted">
                  {group.group}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isCollapsed ? item.label : undefined}
                    className="block relative"
                  >
                    <div
                      className={`group relative flex items-center ${isCollapsed ? "justify-center px-1.5" : "justify-between px-2.5"} py-[6px] rounded-md text-[13px] transition-colors ${
                        isActive
                          ? "bg-surface-interactive text-ink-primary"
                          : "text-ink-secondary hover:text-ink-primary hover:bg-surface-interactive/40"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-[15px] h-[15px] shrink-0 transition-colors ${
                          isActive ? "text-cobalt" : "text-ink-muted group-hover:text-ink-secondary"
                        }`} />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </div>

                      {!isCollapsed && item.tag && (
                        <span className="text-[9px] font-mono px-1.5 py-px rounded bg-surface-base text-ink-muted border border-surface-border">
                          {item.tag}
                        </span>
                      )}

                      {isActive && (
                        <motion.div 
                          layoutId="activeNavIndicator"
                          className="absolute left-0 top-1 bottom-1 w-[3px] bg-cobalt rounded-full"
                          transition={{ duration: 0.15, ease: "easeOut" }}
                        />
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Footer: Theme Toggle + Collapse Toggle + Status */}
      <div className="px-2 py-2 border-t border-surface-border flex flex-col gap-1">
        <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"} px-1`}>
          <ThemeToggle showLabel={!isCollapsed} />
          {!isCollapsed && (
            <button 
              onClick={() => setIsCollapsed(true)}
              className="flex items-center justify-center p-1.5 rounded-md text-ink-muted hover:text-ink-secondary hover:bg-surface-interactive/40 transition-colors text-[11px]"
              title="Collapse (⌘ \)"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isCollapsed && (
          <button 
            onClick={() => setIsCollapsed(false)}
            className="w-full flex items-center justify-center p-1.5 rounded-md text-ink-muted hover:text-ink-secondary hover:bg-surface-interactive/40 transition-colors text-[11px]"
            title="Expand (⌘ \)"
          >
            <PanelLeftOpen className="w-3.5 h-3.5" />
          </button>
        )}

        {!isCollapsed && (
          <div className="mt-1 px-1.5 py-1 text-[9px] font-mono text-ink-dim flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-status-safe shrink-0" />
            <span className="truncate">SEB Physics · Deterministic</span>
          </div>
        )}
      </div>
    </aside>
  );
}
