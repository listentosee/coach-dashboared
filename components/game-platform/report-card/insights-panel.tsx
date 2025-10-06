import {
  Lightbulb,
  TrendingUp,
  Target,
  Activity,
  Trophy,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

interface Insight {
  type: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
}

interface Props {
  insights: Insight[];
}

export default function InsightsPanel({ insights }: Props) {
  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'strength':
        return TrendingUp;
      case 'growth_area':
        return Target;
      case 'activity':
        return Activity;
      case 'flash_ctf':
        return Trophy;
      case 'milestone':
        return CheckCircle;
      case 'sync_pending':
        return AlertCircle;
      default:
        return Lightbulb;
    }
  };

  const getInsightColor = (type: string, priority: string) => {
    if (type === 'sync_pending' || priority === 'high') {
      if (type === 'strength' || type === 'milestone' || type === 'flash_ctf') {
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          icon: 'text-green-600',
          text: 'text-green-900',
        };
      }
      if (type === 'growth_area') {
        return {
          bg: 'bg-orange-50',
          border: 'border-orange-200',
          icon: 'text-orange-600',
          text: 'text-orange-900',
        };
      }
      if (type === 'sync_pending') {
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          icon: 'text-yellow-600',
          text: 'text-yellow-900',
        };
      }
    }

    // Default/medium priority
    return {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      icon: 'text-blue-600',
      text: 'text-blue-900',
    };
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
            High Priority
          </span>
        );
      case 'medium':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
            Medium Priority
          </span>
        );
      case 'low':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
            Low Priority
          </span>
        );
      default:
        return null;
    }
  };

  // Sort insights by priority
  const sortedInsights = [...insights].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return (
    <div className="border rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="h-5 w-5 text-yellow-600" />
        <h3 className="text-lg font-semibold">Insights & Recommendations</h3>
      </div>

      {insights.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Lightbulb className="h-12 w-12 mx-auto mb-2 text-gray-300" />
          <p>No insights available yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedInsights.map((insight, idx) => {
            const Icon = getInsightIcon(insight.type);
            const colors = getInsightColor(insight.type, insight.priority);

            return (
              <div
                key={idx}
                className={`p-3 rounded-lg border ${colors.bg} ${colors.border}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`h-4 w-4 ${colors.icon} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${colors.text}`}>
                          {insight.message}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground capitalize">
                          {insight.type.replace('_', ' ')}
                        </span>
                        {insight.priority !== 'low' && getPriorityBadge(insight.priority)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}