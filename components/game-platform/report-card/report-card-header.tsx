import { formatDistanceToNow } from 'date-fns';
import { Trophy, Calendar, Target } from 'lucide-react';

interface Props {
  competitor: {
    name: string;
    email: string;
    grade: string;
    division: string;
    team: string | null;
    gamePlatformSynced: boolean;
    lastSynced?: string | null;
  };
  summary: {
    totalPoints: number;
    totalChallenges: number;
    lastActivity: string | null;
  } | null;
}

export default function ReportCardHeader({ competitor, summary }: Props) {
  return (
    <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-8 text-white shadow-lg">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-2" data-competitor-name>{competitor.name}</h1>
          <div className="flex flex-wrap gap-4 text-blue-100 mb-4">
            {competitor.team && (
              <div className="flex items-center gap-1">
                <Trophy className="h-4 w-4" />
                <span>{competitor.team}</span>
              </div>
            )}
            {competitor.grade && (
              <span>Grade {competitor.grade}</span>
            )}
            {competitor.division && (
              <span className="capitalize">{competitor.division.replace('_', ' ')}</span>
            )}
          </div>
          {summary && (
            <div className="flex items-center gap-2 text-sm text-blue-100">
              <Calendar className="h-4 w-4" />
              <span>
                Last activity:{' '}
                {summary.lastActivity
                  ? formatDistanceToNow(new Date(summary.lastActivity), { addSuffix: true })
                  : 'No activity yet'}
              </span>
            </div>
          )}
        </div>

        {summary && (
          <div className="text-right">
            <div className="text-5xl font-bold mb-1">
              {summary.totalPoints.toLocaleString()}
            </div>
            <div className="text-xl text-blue-100 flex items-center justify-end gap-2">
              <Target className="h-5 w-5" />
              {summary.totalChallenges} challenges
            </div>
          </div>
        )}
      </div>
    </div>
  );
}