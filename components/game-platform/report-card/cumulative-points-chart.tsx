'use client';

import { useMemo } from 'react';
import { format, subDays, eachDayOfInterval } from 'date-fns';
import { TrendingUp } from 'lucide-react';

interface TimelineEntry {
  date: string;
  points: number;
  challenges: number;
}

interface Props {
  timeline: TimelineEntry[];
}

export default function CumulativePointsChart({ timeline }: Props) {
  // Generate last 90 days
  const last90Days = useMemo(() => {
    const end = new Date();
    const start = subDays(end, 89);
    return eachDayOfInterval({ start, end });
  }, []);

  // Create lookup map for timeline data
  const timelineMap = useMemo(() => {
    const map = new Map<string, TimelineEntry>();
    timeline.forEach(entry => {
      map.set(entry.date, entry);
    });
    return map;
  }, [timeline]);

  // Calculate cumulative points for line chart
  const cumulativeData = useMemo(() => {
    let cumulative = 0;
    const sortedTimeline = [...timeline].sort((a, b) => a.date.localeCompare(b.date));

    return last90Days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const entry = timelineMap.get(dateStr);
      if (entry) {
        cumulative += entry.points;
      }
      return { date: dateStr, cumulative };
    });
  }, [timeline, last90Days, timelineMap]);

  const maxCumulative = Math.max(...cumulativeData.map(d => d.cumulative), 1);

  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-green-600" />
          Cumulative Points Progress
        </div>
        <div className="text-lg font-semibold text-green-600">
          {maxCumulative.toLocaleString()} total points
        </div>
      </div>

      <div className="relative h-32 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
        <svg
          viewBox={`0 0 ${last90Days.length} 100`}
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map(y => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2={last90Days.length}
              y2={y}
              stroke="#d1fae5"
              strokeWidth="0.5"
            />
          ))}

          {/* Line chart */}
          <polyline
            points={cumulativeData
              .map((d, idx) => {
                const y = 100 - (d.cumulative / maxCumulative) * 100;
                return `${idx},${y}`;
              })
              .join(' ')}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />

          {/* Area fill */}
          <polygon
            points={`
              ${cumulativeData
                .map((d, idx) => {
                  const y = 100 - (d.cumulative / maxCumulative) * 100;
                  return `${idx},${y}`;
                })
                .join(' ')}
              ${last90Days.length},100 0,100
            `}
            fill="url(#greenGradient)"
            fillOpacity="0.3"
          />

          {/* Gradient definition */}
          <defs>
            <linearGradient id="greenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
            </linearGradient>
          </defs>
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-green-700 py-4 font-medium">
          <span>{maxCumulative.toLocaleString()}</span>
          <span>{Math.round(maxCumulative * 0.5).toLocaleString()}</span>
          <span>0</span>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between text-xs text-muted-foreground px-4">
        <span>{format(last90Days[0], 'MMM d')}</span>
        <span>{format(last90Days[Math.floor(last90Days.length / 2)], 'MMM d')}</span>
        <span>{format(last90Days[last90Days.length - 1], 'MMM d')}</span>
      </div>
    </div>
  );
}
