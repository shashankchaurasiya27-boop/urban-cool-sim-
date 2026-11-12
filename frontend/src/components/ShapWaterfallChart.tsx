"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface ShapWaterfallProps {
  data?: {
    feature: string;
    val: number;
    description: string;
  }[];
}

export function ShapWaterfallChart({ data }: ShapWaterfallProps) {
  const shapData = data || [
    { feature: "Cool Roof Albedo (α)", val: 1.25, description: "Solar shortwave radiation reflection" },
    { feature: "Green Roof Coverage", val: 0.95, description: "Rooftop evapotranspiration & latent flux" },
    { feature: "Tree Canopy Expansion", val: 0.82, description: "Direct ground shading & transpiration" },
    { feature: "Urban Water Bodies", val: 0.45, description: "Evaporative microclimate heat sink" },
    { feature: "Reflective Pavements", val: 0.38, description: "Street-level albedo modification" },
    { feature: "Building Density (f_bldg)", val: -0.22, description: "Thermal mass & street canyon heat trapping" },
  ];

  return (
    <div className="graphite-card p-6 rounded-lg flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-baseline gap-2 border-b border-surface-border pb-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-primary">Intervention Factor Influence</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Attribution of microclimate cooling response (ΔT °C) via TreeSHAP
          </p>
        </div>
        <span className="text-[11px] font-mono text-ink-muted">
          Model: <strong className="text-ink-primary">LightGBM (R²=0.962)</strong>
        </span>
      </div>

      <div className="h-64 w-full tabular-nums">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={shapData} margin={{ top: 5, right: 25, left: 10, bottom: 0 }}>
            <XAxis 
              type="number" 
              stroke="#5E6678" 
              fontSize={11} 
              tickLine={false}
              axisLine={{ stroke: "rgba(255, 255, 255, 0.08)" }}
              tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}°C`}
            />
            <YAxis 
              dataKey="feature" 
              type="category" 
              width={155}
              stroke="#8E95A5" 
              fontSize={11} 
              tickLine={false}
              axisLine={{ stroke: "rgba(255, 255, 255, 0.08)" }}
            />
            <Tooltip
              cursor={{ fill: "rgba(255, 255, 255, 0.04)" }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const p = payload[0].payload;
                  return (
                    <div className="graphite-card p-3 rounded text-xs shadow-floating space-y-1">
                      <div className="font-semibold text-ink-primary">{p.feature}</div>
                      <div className="text-[11px] text-ink-muted">{p.description}</div>
                      <div className="font-mono text-xs text-ink-primary pt-1 border-t border-surface-border">
                        Impact: <strong className={p.val >= 0 ? "text-cobalt" : "text-status-critical"}>
                          {p.val >= 0 ? "+" : ""}{p.val.toFixed(2)}°C cooling
                        </strong>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="val" radius={[0, 2, 2, 0]} maxBarSize={20}>
              {shapData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.val >= 0 ? "#4A6CFF" : "#EF4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="text-[11px] text-ink-muted flex justify-between items-center px-1 font-mono">
        <span>Positive values denote increased cooling contribution</span>
        <span className="text-ink-primary font-medium">Shapley Additive Attribution</span>
      </div>
    </div>
  );
}
