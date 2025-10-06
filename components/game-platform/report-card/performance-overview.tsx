import { TrendingUp, Flag, Calendar, Activity } from 'lucide-react';

interface Props {
  summary: {
    totalPoints: number;
    totalChallenges: number;
    odlChallenges: number;
    flashCtfEvents: number;
    daysActive: number;
  };
}

export default function PerformanceOverview({ summary }: Props) {
  const stats = [
    {
      label: 'On Demand Labs',
      value: summary.odlChallenges,
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Flash CTF Events',
      value: summary.flashCtfEvents,
      icon: Flag,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      label: 'Days Active',
      value: summary.daysActive,
      icon: Calendar,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Avg Points/Day',
      value: summary.daysActive > 0
        ? Math.round(summary.totalPoints / summary.daysActive)
        : 0,
      icon: Activity,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className={`${stat.bgColor} rounded-lg p-6 border border-gray-200`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">
                {stat.label}
              </span>
              <Icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <div className={`text-3xl font-bold ${stat.color}`}>
              {stat.value.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}