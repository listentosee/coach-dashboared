interface Domain {
  category: string;
  challengesCompleted: number;
  totalPoints: number;
  avgDifficulty: string;
  strength: string;
  rank: number;
}

interface Props {
  domains: Domain[];
}

export default function DomainStrengthChart({ domains }: Props) {
  const maxPoints = Math.max(...domains.map(d => d.totalPoints), 1);

  const getStrengthColor = (strength: string): string => {
    switch (strength) {
      case 'strong': return '#22c55e';
      case 'developing': return '#eab308';
      case 'growth_area': return '#f87171';
      default: return '#6b7280';
    }
  };

  return (
    <div className="border rounded-lg p-4">
      <h3 className="text-base font-semibold mb-3">Domain Strengths</h3>

      <div className="grid grid-cols-3 gap-3">
        {domains.map((domain) => {
          const percentage = (domain.totalPoints / maxPoints) * 100;
          const rotation = (percentage / 100) * 180 - 90; // -90° to 90°
          const color = getStrengthColor(domain.strength);

          return (
            <div key={domain.category} className="flex flex-col items-center">
              {/* Gauge */}
              <div className="relative w-20 h-10 mb-1">
                <svg viewBox="0 0 100 50" className="w-full h-full">
                  {/* Background arc */}
                  <path
                    d="M 10 45 A 40 40 0 0 1 90 45"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                  {/* Colored arc */}
                  <path
                    d="M 10 45 A 40 40 0 0 1 90 45"
                    fill="none"
                    stroke={color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(percentage / 100) * 125.6} 125.6`}
                  />
                  {/* Needle */}
                  <g transform={`rotate(${rotation} 50 45)`}>
                    <line
                      x1="50"
                      y1="45"
                      x2="50"
                      y2="15"
                      stroke="#374151"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <circle cx="50" cy="45" r="3" fill="#374151" />
                  </g>
                </svg>
                {/* Value display */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs font-bold" style={{ color }}>
                  {domain.totalPoints}
                </div>
              </div>

              {/* Label */}
              <div className="text-xs text-center font-medium leading-tight">
                {domain.category.replace('_', ' ').split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {domain.challengesCompleted} solved
              </div>
            </div>
          );
        })}
      </div>

      {domains.length === 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          No domain data available yet
        </div>
      )}
    </div>
  );
}