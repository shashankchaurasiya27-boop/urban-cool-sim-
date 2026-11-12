"use client";

import {
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from "recharts";
import type { ValidationResponse } from "@/lib/api";

interface ValidationProps {
  valData?: ValidationResponse;
}

export function ValidationScatterChart({ valData }: ValidationProps) {
  const points = (valData?.scatter_points ?? [])
    .map((point) => ({
      obs: point.benchmark_temperature_c,
      sim: point.simulated_temperature_c,
      ref: point.benchmark_temperature_c,
      cellIndex: point.cell_index,
      row: point.row,
      col: point.col,
    }))
    .sort((a, b) => a.obs - b.obs);

  const allTemps = points.flatMap((p) => [p.obs, p.sim]);
  const minTemp = allTemps.length ? Math.floor(Math.min(...allTemps) - 1) : 35;
  const maxTemp = allTemps.length ? Math.ceil(Math.max(...allTemps) + 1) : 65;
  const commonDomain = [minTemp, maxTemp];

  return (
    <div className="graphite-card p-6 rounded-lg flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-baseline gap-2 border-b border-surface-border pb-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-primary">
            Synthetic benchmark vs simulated baseline
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Sample of benchmark cells generated from the baseline simulation; not satellite observations.
          </p>
        </div>
        {valData && (
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
            <span className="text-ink-secondary">
              R² = <strong className="text-amber-300">{valData.r2.toFixed(3)}</strong>
            </span>
            <span className="text-ink-secondary">
              MAE = <strong className="text-ink-primary">{valData.mae.toFixed(3)}°C</strong>
            </span>
            <span className="text-ink-secondary">
              RMSE = <strong className="text-ink-primary">{valData.rmse.toFixed(3)}°C</strong>
            </span>
          </div>
        )}
      </div>

      {points.length > 0 ? (
        <div className="h-64 w-full tabular-nums">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 15, right: 20, left: 10, bottom: 10 }}>
              <XAxis
                type="number"
                dataKey="obs"
                name="Synthetic benchmark temperature"
                stroke="#7B8495"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "rgba(255, 255, 255, 0.12)" }}
                domain={commonDomain}
                tickFormatter={(value: number) => `${Number(value).toFixed(1)}°C`}
              />
              <YAxis
                type="number"
                dataKey="sim"
                name="Simulated baseline temperature"
                stroke="#7B8495"
                fontSize={11}
                width={65}
                tickLine={false}
                axisLine={{ stroke: "rgba(255, 255, 255, 0.12)" }}
                domain={commonDomain}
                tickFormatter={(value: number) => `${Number(value).toFixed(1)}°C`}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3", stroke: "rgba(255, 255, 255, 0.2)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as {
                    obs: number;
                    sim: number;
                    cellIndex: number;
                    row: number;
                    col: number;
                  };
                  const difference = point.sim - point.obs;
                  return (
                    <div className="graphite-card p-3 rounded text-xs space-y-1 font-mono shadow-floating">
                      <div className="text-ink-primary font-medium">Synthetic benchmark sample</div>
                      <div className="text-ink-secondary">Grid cell: row {point.row}, column {point.col} (index {point.cellIndex})</div>
                      <div className="text-ink-secondary">
                        Benchmark: <strong className="text-ink-primary">{point.obs.toFixed(2)}°C</strong>
                      </div>
                      <div className="text-cobalt">
                        Simulated: <strong>{point.sim.toFixed(2)}°C</strong>
                      </div>
                      <div className="text-[11px] text-ink-muted pt-1 border-t border-surface-border">
                        Difference: {difference >= 0 ? "+" : ""}{difference.toFixed(2)}°C
                      </div>
                    </div>
                  );
                }}
              />
              <Line
                type="linear"
                dataKey="ref"
                stroke="rgba(255, 255, 255, 0.28)"
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              <Scatter dataKey="sim" fill="#F2B84B" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-64 w-full flex items-center justify-center rounded-lg border border-dashed border-surface-border px-6 text-center">
          <p className="text-sm text-ink-muted">
            {valData ? "No point-level benchmark samples were returned by the API." : "Run the internal check to display its returned samples."}
          </p>
        </div>
      )}

      <div className="text-[11px] text-amber-200/90 flex flex-col sm:flex-row sm:justify-between gap-1 px-1 font-mono">
        <span>Dashed line indicates equality between benchmark and simulation.</span>
        <span>Synthetic self-consistency only</span>
      </div>
    </div>
  );
}
