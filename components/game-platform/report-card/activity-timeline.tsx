'use client';

import { useMemo } from 'react';
import { format, subDays, eachDayOfInterval } from 'date-fns';
import { TrendingUp, Activity } from 'lucide-react';

interface TimelineEntry {
  date: string;
  points: number;
  challenges: number;
}

interface Domain {
  category: string;
  challengesCompleted: number;
  totalPoints: number;
}

interface Props {
  timeline: TimelineEntry[];
  domains: Domain[];
}

export default function ActivityTimeline({ timeline, domains }: Props) {
  // All 9 domains that should appear on the web chart
  const allDomains = useMemo(() => {
    const domainCategories = [
      'web',
      'cryptography',
      'osint',
      'forensics',
      'binary_exploitation',
      'reverse_engineering',
      'networking',
      'operating_systems',
      'miscellaneous'
    ];

    return domainCategories.map(category => {
      const existingDomain = domains.find(d => d.category === category);
      return existingDomain || {
        category,
        challengesCompleted: 0,
        totalPoints: 0
      };
    });
  }, [domains]);

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

  // Calculate intensity for heatmap (0-4 scale)
  const maxChallenges = Math.max(...timeline.map(t => t.challenges), 1);
  const getIntensity = (challenges: number): number => {
    if (challenges === 0) return 0;
    const ratio = challenges / maxChallenges;
    if (ratio >= 0.75) return 4;
    if (ratio >= 0.5) return 3;
    if (ratio >= 0.25) return 2;
    return 1;
  };

  const intensityColors = [
    'bg-gray-100',    // 0: no activity
    'bg-green-200',   // 1: low
    'bg-green-400',   // 2: medium-low
    'bg-green-600',   // 3: medium-high
    'bg-green-800',   // 4: high
  ];

  // Group days by week
  const weeks = useMemo(() => {
    const weekGroups: Date[][] = [];
    let currentWeek: Date[] = [];

    last90Days.forEach((day, idx) => {
      currentWeek.push(day);
      if (day.getDay() === 6 || idx === last90Days.length - 1) {
        weekGroups.push(currentWeek);
        currentWeek = [];
      }
    });

    return weekGroups;
  }, [last90Days]);

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

  // Calculate recent stats
  const last7Days = timeline.filter(t => {
    const date = new Date(t.date);
    const sevenDaysAgo = subDays(new Date(), 7);
    return date >= sevenDaysAgo;
  });

  const last7DaysPoints = last7Days.reduce((sum, t) => sum + t.points, 0);
  const last7DaysChallenges = last7Days.reduce((sum, t) => sum + t.challenges, 0);

  return (
    <div className="border rounded-lg p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity Timeline
          </h3>
          <p className="text-sm text-muted-foreground">Last 90 days</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Last 7 days</div>
          <div className="text-2xl font-bold text-green-600">
            {last7DaysChallenges} challenges
          </div>
          <div className="text-sm text-muted-foreground">
            {last7DaysPoints} points
          </div>
        </div>


      {/* Calendar Heatmap */}
      <div>
        <div className="text-sm font-medium mb-3">Daily Activity Heatmap</div>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="flex flex-col gap-1">
              {week.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const entry = timelineMap.get(dateStr);
                const intensity = entry ? getIntensity(entry.challenges) : 0;
                const colorClass = intensityColors[intensity];

                return (
                  <div
                    key={dateStr}
                    className={`w-3 h-3 rounded-sm ${colorClass} border border-gray-200 hover:ring-2 hover:ring-blue-500 cursor-pointer transition-all`}
                    title={`${format(day, 'MMM d, yyyy')}\n${entry?.challenges || 0} challenges\n${entry?.points || 0} points`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
          <span>Less</span>
          {intensityColors.map((color, idx) => (
            <div
              key={idx}
              className={`w-3 h-3 rounded-sm ${color} border border-gray-200`}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Domain Web Chart (Radar/Spider Chart) */}
      <div>
        <div className="text-sm font-medium mb-3">Domain Performance Web</div>
        <div className="rounded-lg p-8 border border-gray-200">
          <div className="relative w-full aspect-square max-w-md mx-auto">
            <svg viewBox="0 0 400 400" className="w-full h-full">
                {/* Background circles */}
                {[0.2, 0.4, 0.6, 0.8, 1.0].map((scale) => (
                  <circle
                    key={scale}
                    cx="200"
                    cy="200"
                    r={150 * scale}
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="1"
                  />
                ))}

                {/* Axes from center */}
                {allDomains.map((_, idx) => {
                  const angle = (idx * 360) / allDomains.length - 90;
                  const radian = (angle * Math.PI) / 180;
                  const x2 = 200 + 150 * Math.cos(radian);
                  const y2 = 200 + 150 * Math.sin(radian);
                  return (
                    <line
                      key={idx}
                      x1="200"
                      y1="200"
                      x2={x2}
                      y2={y2}
                      stroke="#e5e7eb"
                      strokeWidth="1"
                    />
                  );
                })}

                {/* Data polygon */}
                {(() => {
                  const maxPoints = Math.max(...allDomains.map(d => d.totalPoints), 1);
                  const points = allDomains
                    .map((domain, idx) => {
                      const angle = (idx * 360) / allDomains.length - 90;
                      const radian = (angle * Math.PI) / 180;
                      const ratio = domain.totalPoints / maxPoints;
                      const x = 200 + 150 * ratio * Math.cos(radian);
                      const y = 200 + 150 * ratio * Math.sin(radian);
                      return `${x},${y}`;
                    })
                    .join(' ');

                  return (
                    <>
                      <polygon
                        points={points}
                        fill="rgba(59, 130, 246, 0.2)"
                        stroke="#3b82f6"
                        strokeWidth="2"
                      />
                      {allDomains.map((domain, idx) => {
                        const angle = (idx * 360) / allDomains.length - 90;
                        const radian = (angle * Math.PI) / 180;
                        const ratio = domain.totalPoints / maxPoints;
                        const x = 200 + 150 * ratio * Math.cos(radian);
                        const y = 200 + 150 * ratio * Math.sin(radian);
                        return (
                          <circle
                            key={idx}
                            cx={x}
                            cy={y}
                            r="4"
                            fill="#3b82f6"
                          />
                        );
                      })}
                    </>
                  );
                })()}

                {/* Labels */}
                {allDomains.map((domain, idx) => {
                  const angle = (idx * 360) / allDomains.length - 90;
                  const radian = (angle * Math.PI) / 180;
                  const labelDistance = 180;
                  const x = 200 + labelDistance * Math.cos(radian);
                  const y = 200 + labelDistance * Math.sin(radian);
                  const categoryName = domain.category
                    .replace('_', ' ')
                    .split(' ')
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ');

                  return (
                    <text
                      key={idx}
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="text-[10px] font-medium fill-gray-700"
                    >
                      {categoryName}
                    </text>
                  );
                })}
              </svg>
            </div>

            {/* Legend */}
            <div className="mt-4 text-center text-xs text-gray-600">
              <div className="flex items-center justify-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span>Performance by domain (based on total points)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cumulative Points Line Chart */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            Cumulative Points Progress
          </div>
          <div className="text-sm font-semibold text-green-600">
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
        <div className="flex justify-between mt-2 text-xs text-muted-foreground px-4">
          <span>{format(last90Days[0], 'MMM d')}</span>
          <span>{format(last90Days[Math.floor(last90Days.length / 2)], 'MMM d')}</span>
          <span>{format(last90Days[last90Days.length - 1], 'MMM d')}</span>
        </div>
      </div>

      {timeline.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No activity data available
        </div>
      )}
    </div>
  );
}