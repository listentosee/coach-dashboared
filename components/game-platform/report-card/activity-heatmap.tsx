'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { Activity } from 'lucide-react';

interface TimelineEntry {
  date: string;
  points: number;
  challenges: number;
}

interface Props {
  timeline: TimelineEntry[];
}

export default function ActivityHeatmap({ timeline }: Props) {
  // Process timeline data and determine sampling strategy
  const { chartData, sampledData, dateRange, sampleInterval } = useMemo(() => {
    if (timeline.length === 0) {
      return { chartData: [], sampledData: [], dateRange: 0, sampleInterval: 1 };
    }

    // Sort timeline by date
    const sorted = [...timeline].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Calculate date range
    const firstDate = parseISO(sorted[0].date);
    const lastDate = parseISO(sorted[sorted.length - 1].date);
    const range = differenceInDays(lastDate, firstDate);

    // Determine sampling interval to get roughly 12-15 data points
    let interval = 1;
    if (range > 365) {
      interval = Math.floor(range / 12); // Monthly-ish for long ranges
    } else if (range > 180) {
      interval = Math.floor(range / 15); // Bi-weekly-ish
    } else if (range > 90) {
      interval = 7; // Weekly
    } else if (range > 30) {
      interval = 3; // Every 3 days
    } else {
      interval = 1; // Daily for short ranges
    }

    // Sample the data
    const sampled = sorted.filter((_, idx) => idx % interval === 0 || idx === sorted.length - 1);

    return {
      chartData: sorted,
      sampledData: sampled,
      dateRange: range,
      sampleInterval: interval
    };
  }, [timeline]);

  // Calculate bubble size (max 40px)
  const maxChallenges = Math.max(...chartData.map(t => t.challenges), 1);
  const getBubbleSize = (challenges: number): number => {
    if (challenges === 0) return 0;
    const ratio = challenges / maxChallenges;
    return Math.max(8, Math.floor(ratio * 40));
  };

  // Calculate stats
  const totalChallenges = chartData.reduce((sum, t) => sum + t.challenges, 0);
  const totalPoints = chartData.reduce((sum, t) => sum + t.points, 0);

  // Calculate recent activity (last 7 days or less if data is shorter)
  const recentDays = Math.min(7, chartData.length);
  const recentData = chartData.slice(-recentDays);
  const recentPoints = recentData.reduce((sum, t) => sum + t.points, 0);
  const recentChallenges = recentData.reduce((sum, t) => sum + t.challenges, 0);

  // Determine time period label
  const getPeriodLabel = () => {
    if (dateRange > 365) return `${Math.floor(dateRange / 365)}+ Years`;
    if (dateRange > 90) return `${Math.floor(dateRange / 30)} Months`;
    if (dateRange > 30) return `${Math.floor(dateRange / 7)} Weeks`;
    return `${dateRange} Days`;
  };

  // Calculate Y-axis scale
  const chartHeight = 120; // pixels
  const yScale = (challenges: number): number => {
    if (maxChallenges === 0) return chartHeight;
    return chartHeight - (challenges / maxChallenges) * (chartHeight - 20); // Leave 20px at top for bubble
  };

  const svgRef = useRef<SVGSVGElement>(null);
  const [svgWidth, setSvgWidth] = useState(1000);

  useEffect(() => {
    if (svgRef.current) {
      const updateWidth = () => {
        setSvgWidth(svgRef.current?.clientWidth || 1000);
      };
      updateWidth();
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
  }, []);

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Activity Trend
          </h3>
          <p className="text-xs text-muted-foreground">
            {getPeriodLabel()} · {totalChallenges} challenges · {totalPoints.toLocaleString()} points
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Last {recentDays} days</div>
          <div className="text-xl font-bold text-green-600">
            {recentChallenges}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {recentPoints} pts
          </div>
        </div>
      </div>

      {/* Timeline Chart */}
      <div className="space-y-2">
        {/* Chart area */}
        <div className="relative" style={{ height: `${chartHeight + 30}px` }}>
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between text-[9px] text-muted-foreground">
            <span>{maxChallenges}</span>
            <span>{Math.floor(maxChallenges / 2)}</span>
            <span>0</span>
          </div>

          {/* Chart with padding for Y-axis */}
          <div className="absolute left-8 right-0 top-0 bottom-8">
            <svg
              ref={svgRef}
              width="100%"
              height={chartHeight + 20}
              viewBox={`0 0 ${svgWidth * 1.05} ${chartHeight + 20}`}
              preserveAspectRatio="xMidYMid meet"
              className="overflow-visible"
              style={{ display: 'block' }}
            >
              {/* Draw line FIRST (behind bubbles) */}
              {sampledData.length > 1 && (
                <polyline
                  points={sampledData
                    .map((entry, idx) => {
                      const x = (idx / (sampledData.length - 1)) * svgWidth;
                      const y = yScale(entry.challenges);
                      return `${x},${y}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#facc15"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Draw bubbles SECOND (on top of line) */}
              {sampledData.map((entry, idx) => {
                const x = (idx / (sampledData.length - 1)) * svgWidth;
                const y = yScale(entry.challenges);
                const size = getBubbleSize(entry.challenges);
                const date = parseISO(entry.date);
                const showNumberOutside = entry.challenges < 5;

                return (
                  <g key={entry.date}>
                    <circle
                      cx={x}
                      cy={y}
                      r={size / 2}
                      fill="#22c55e"
                      className="hover:fill-green-600 cursor-pointer transition-colors"
                    >
                      <title>{`${format(date, 'MMM d, yyyy')}\n${entry.challenges} challenges\n${entry.points} points`}</title>
                    </circle>
                    {showNumberOutside ? (
                      <text
                        x={x}
                        y={y - size / 2 - 6}
                        textAnchor="middle"
                        className="text-[10px] font-bold fill-green-600 pointer-events-none"
                      >
                        {entry.challenges}
                      </text>
                    ) : (
                      <text
                        x={x}
                        y={y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="text-[10px] font-bold fill-white pointer-events-none"
                      >
                        {entry.challenges}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* X-axis date labels - INSIDE SVG */}
              {sampledData.map((entry, idx) => {
                const date = parseISO(entry.date);
                const isFirst = idx === 0;
                const isLast = idx === sampledData.length - 1;
                const x = (idx / (sampledData.length - 1)) * svgWidth;

                // Format date based on range
                const formatDate = (d: Date, isEndpoint: boolean) => {
                  if (isEndpoint) {
                    if (dateRange > 365) return format(d, 'MMM yyyy');
                    if (dateRange > 90) return format(d, 'MMM d');
                    return format(d, 'M/d/yy');
                  }
                  if (dateRange > 365) return format(d, 'M/yy');
                  if (dateRange > 90) return format(d, 'M/d');
                  return format(d, 'M/d');
                };

                return (
                  <text
                    key={`label-${entry.date}`}
                    x={x}
                    y={chartHeight + 15}
                    textAnchor="middle"
                    className="text-[10px] fill-gray-400 pointer-events-none"
                  >
                    {formatDate(date, isFirst || isLast)}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {chartData.length === 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          No activity data available
        </div>
      )}
    </div>
  );
}
