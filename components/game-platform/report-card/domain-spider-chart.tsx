'use client';

import { useMemo } from 'react';

interface Domain {
  category: string;
  challengesCompleted: number;
  totalPoints: number;
}

interface Props {
  domains: Domain[];
}

export default function DomainSpiderChart({ domains }: Props) {
  // All 9 domains that should appear on the spider chart
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

    const categoryAliases: Record<string, string> = {
      web: 'web',
      web_exploitation: 'web',
      cryptography: 'cryptography',
      crypto: 'cryptography',
      osint: 'osint',
      reconnaissance: 'osint',
      forensics: 'forensics',
      reverse_engineering: 'reverse_engineering',
      reversing: 'reverse_engineering',
      binary_exploitation: 'binary_exploitation',
      binary: 'binary_exploitation',
      pwn: 'binary_exploitation',
      networking: 'networking',
      network: 'networking',
      operating_systems: 'operating_systems',
      operating: 'operating_systems',
      os: 'operating_systems',
      miscellaneous: 'miscellaneous',
      misc: 'miscellaneous',
      other: 'miscellaneous'
    };

    const normalizeCategory = (value: string) =>
      value.toLowerCase().replace(/[\s-]+/g, '_');

    const totals = new Map<string, { challengesCompleted: number; totalPoints: number }>();

    for (const domain of domains) {
      const raw = normalizeCategory(String(domain.category || ''));
      const canonical = categoryAliases[raw] || raw;

      if (!domainCategories.includes(canonical)) {
        continue;
      }

      const existing = totals.get(canonical) || { challengesCompleted: 0, totalPoints: 0 };
      existing.challengesCompleted += Number(domain.challengesCompleted || 0);
      existing.totalPoints += Number(domain.totalPoints || 0);
      totals.set(canonical, existing);
    }

    return domainCategories.map(category => {
      const entry = totals.get(category);
      return {
        category,
        challengesCompleted: entry?.challengesCompleted || 0,
        totalPoints: entry?.totalPoints || 0
      };
    });
  }, [domains]);

  return (
    <div className="p-6 space-y-4">
      <h3 className="text-lg font-semibold">Domain Balance</h3>

      <div className="relative w-full aspect-square max-w-md mx-auto overflow-visible">
        <svg viewBox="-20 -20 440 440" className="w-full h-full overflow-visible">
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
                  const y = 200 + 150 * Math.sin(radian);
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
            const words = domain.category
              .replace('_', ' ')
              .split(' ')
              .map(w => w.charAt(0).toUpperCase() + w.slice(1));

            // For multi-word labels, split into multiple lines
            if (words.length > 1) {
              return (
                <text
                  key={idx}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-xs font-semibold fill-gray-900 contrast-more:fill-black dark:fill-gray-100 dark:contrast-more:fill-white"
                >
                  {words.map((word, wordIdx) => (
                    <tspan key={wordIdx} x={x} dy={wordIdx === 0 ? -6 : 12}>
                      {word}
                    </tspan>
                  ))}
                </text>
              );
            }

            return (
              <text
                key={idx}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-xs font-semibold fill-gray-900 contrast-more:fill-black dark:fill-gray-100 dark:contrast-more:fill-white"
              >
                {words[0]}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="text-center text-xs text-gray-600">
        <div className="flex items-center justify-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <span>Performance by domain (based on total points)</span>
        </div>
      </div>
    </div>
  );
}
