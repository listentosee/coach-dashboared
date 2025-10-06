import { formatDistanceToNow } from 'date-fns';
import { Trophy, Target, Calendar, TrendingUp } from 'lucide-react';

interface FlashCtfEvent {
  eventId: string;
  name: string;
  date: string;
  rank: number | null;
  challengesSolved: number;
  pointsEarned: number;
  topCategory?: string | null;
}

interface Props {
  events: FlashCtfEvent[];
}

export default function FlashCtfEvents({ events }: Props) {
  // Sort by date descending
  const sortedEvents = [...events].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Show only last 5 events
  const displayEvents = sortedEvents.slice(0, 5);
  const totalChallenges = events.reduce((sum, e) => sum + e.challengesSolved, 0);
  const totalPoints = events.reduce((sum, e) => sum + e.pointsEarned, 0);

  const getRankBadgeColor = (rank: number | null): string => {
    if (!rank) return 'bg-gray-100 text-gray-600';
    if (rank <= 3) return 'bg-yellow-100 text-yellow-800';
    if (rank <= 10) return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-orange-600" />
          <h3 className="text-base font-semibold">Flash CTF Events</h3>
        </div>
        <div className="text-sm font-bold text-blue-600">
          {events.length} Total
        </div>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          <Trophy className="h-8 w-8 mx-auto mb-1 text-gray-300" />
          <p>No Flash CTF participation yet</p>
        </div>
      ) : (
        <>
          <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-200 flex justify-between items-center">
            <div>
              <div className="text-xs text-blue-700">Total Challenges</div>
              <div className="text-lg font-bold text-blue-900">{totalChallenges}</div>
            </div>
            <div>
              <div className="text-xs text-blue-700">Total Points</div>
              <div className="text-lg font-bold text-blue-900">{totalPoints}</div>
            </div>
          </div>

          <div className="space-y-2">
            {displayEvents.map((event) => {
              const isRecent = new Date(event.date).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;

              return (
                <div
                  key={event.eventId}
                  className={`p-2 rounded border ${
                    isRecent
                      ? 'bg-green-50 border-green-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs truncate mb-0.5">
                        {event.name}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-2.5 w-2.5" />
                          {formatDistanceToNow(new Date(event.date), { addSuffix: true })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Target className="h-2.5 w-2.5" />
                          {event.challengesSolved} solved
                        </span>
                        <span className="flex items-center gap-1">
                          <Trophy className="h-2.5 w-2.5" />
                          {event.pointsEarned} pts
                        </span>
                      </div>
                    </div>

                    {event.rank && (
                      <span
                        className={`ml-2 px-1.5 py-0.5 rounded text-xs font-bold ${getRankBadgeColor(event.rank)}`}
                      >
                        #{event.rank}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {events.length > 5 && (
            <div className="mt-2 text-center text-xs text-muted-foreground">
              Showing 5 most recent of {events.length} events
            </div>
          )}
        </>
      )}
    </div>
  );
}