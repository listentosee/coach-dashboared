"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  TooltipProps,
} from 'recharts';

interface ChartSlice {
  name: string;
  value: number;
}

interface DemographicChartConfig {
  title: string;
  description?: string;
  data: ChartSlice[];
}

const COLORS = [
  '#38bdf8',
  '#f472b6',
  '#22c55e',
  '#f97316',
  '#a855f7',
  '#eab308',
  '#94a3b8',
  '#ec4899',
  '#14b8a6',
];

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded border border-dashed border-meta-border/60 bg-meta-dark/30 p-6 text-sm text-meta-muted">
      {message}
    </div>
  );
}

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;

  return (
    <div className="max-w-[200px] rounded-md border border-slate-700/70 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 shadow-xl backdrop-blur">
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color || '#38bdf8' }}
          />
          <span className="font-medium text-slate-50">{entry.name}</span>
          <span className="ml-auto text-slate-300">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function DemographicCharts({
  charts,
  columns = 3,
}: {
  charts: DemographicChartConfig[]
  columns?: 1 | 2 | 3
}) {
  if (!charts.length) {
    return <EmptyState message="No demographic data available." />;
  }

  const columnClass = columns === 1 ? 'lg:grid-cols-1' : columns === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3';

  return (
    <div className={`grid grid-cols-1 gap-6 ${columnClass}`}>
      {charts.map((chart) => (
        <div key={chart.title} className="rounded border border-meta-border bg-meta-card/80 p-4">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-meta-light">{chart.title}</h3>
            {chart.description && (
              <p className="text-sm text-meta-muted">{chart.description}</p>
            )}
          </div>
          {chart.data.length === 0 ? (
            <EmptyState message="No responses recorded yet." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chart.data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {chart.data.map((entry, index) => (
                      <Cell key={`${chart.title}-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={42}
                    wrapperStyle={{ color: '#94A3B8', fontSize: '0.75rem' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export type { DemographicChartConfig, ChartSlice };
