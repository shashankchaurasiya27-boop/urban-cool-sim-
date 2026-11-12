"use client";

import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, ZAxis } from "recharts";
import { ParetoSolution } from "@/lib/api";

interface ParetoFrontChartProps {
  solutions: ParetoSolution[];
  onSelect?: (s: ParetoSolution) => void;
  selectedSolution?: ParetoSolution | null;
}

export function ParetoFrontChart({ solutions, onSelect, selectedSolution }: ParetoFrontChartProps) {
  const chartData = solutions.map((s, idx) => ({
    x: parseFloat(((s.validated_delta_t || s.delta_t_mean || 0)).toFixed(2)),
    y: parseFloat((s.total_cost_usd / 1000.0).toFixed(1)), // in $k USD
    water: s.water_demand_m3,
    isSelected: selectedSolution?.solution_id === s.solution_id,
    solution: s,
    id: `sol-${s.solution_id || idx}`
  }));

  return (
    <div className="graphite-card p-6 rounded-lg flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-baseline gap-2 border-b border-surface-border pb-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-primary">NSGA-II Pareto Frontier</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Non-dominated trade-off: Cooling Impact (ΔT °C) vs Capital Cost ($k USD)
          </p>
        </div>
        <span className="text-[11px] font-mono text-status-safe flex items-center gap-1.5 bg-status-safe/10 px-2 py-0.5 rounded border border-status-safe/25">
          <span className="w-1.5 h-1.5 rounded-full bg-status-safe" />
          Deterministic Physics Re-Validated
        </span>
      </div>

      {/* Scatter Chart */}
      <div className="h-64 w-full tabular-nums">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 15, right: 15, left: -15, bottom: 0 }}>
            <XAxis 
              type="number" 
              dataKey="x" 
              name="Cooling Benefit ΔT" 
              stroke="#5E6678" 
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "rgba(255, 255, 255, 0.08)" }}
              domain={['dataMin - 0.2', 'dataMax + 0.2']}
              tickFormatter={(v) => `-${Math.abs(v).toFixed(1)}°C`}
            />
            <YAxis 
              type="number" 
              dataKey="y" 
              name="Capital Cost" 
              stroke="#5E6678" 
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "rgba(255, 255, 255, 0.08)" }}
              tickFormatter={(v) => `$${Math.round(v)}k`}
            />
            <ZAxis type="number" dataKey="water" range={[60, 200]} name="Water Demand (m³)" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "rgba(255, 255, 255, 0.15)" }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const p = payload[0].payload;
                  return (
                    <div className="graphite-card p-3 rounded text-xs space-y-1 font-mono shadow-floating">
                      <div className="font-semibold text-ink-primary">Portfolio #{p.solution.solution_id}</div>
                      <div className="text-[11px] space-y-0.5">
                        <div className="text-cobalt">Cooling: <strong>-{Math.abs(p.x).toFixed(2)}°C</strong></div>
                        <div className="text-ink-primary">CapEx: <strong>${Math.round(p.y * 1000).toLocaleString("en-US")} USD</strong></div>
                        <div className="text-ink-muted">Water: {p.water.toLocaleString("en-US")} m³/yr</div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Scatter
              data={chartData}
              fill="#4A6CFF"
              onClick={(e) => onSelect && onSelect(e.payload.solution)}
              className="cursor-pointer"
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="text-[11px] text-ink-muted flex justify-between items-center px-1 font-mono">
        <span>Bubble size denotes annual water demand (m³)</span>
        <span className="text-ink-primary font-medium">{solutions.length} Non-dominated solutions</span>
      </div>
    </div>
  );
}
