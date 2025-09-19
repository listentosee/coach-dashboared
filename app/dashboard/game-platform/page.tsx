'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface LeaderboardEntry {
  competitorId: string;
  name: string;
  teamName: string | null;
  challenges: number;
  totalPoints: number;
  lastActivity: string | null;
  categoryPoints: Record<string, number>;
}

interface TeamSummary {
  teamId: string;
  name: string;
  division?: string | null;
  affiliation?: string | null;
  totalChallenges: number;
  totalPoints: number;
  memberCount: number;
  avgScore: number;
  lastSync: string | null;
}

interface DashboardData {
  global: {
    totalCompetitors: number;
    syncedCompetitors: number;
    activeRecently: number;
    totalChallenges: number;
    monthlyCtfParticipants: number;
    lastSyncedAt: string | null;
  };
  leaderboard: LeaderboardEntry[];
  teams: TeamSummary[];
  alerts: {
    unsyncedCompetitors: Array<{ competitorId: string; name: string }>;
    syncErrors: Array<{ competitorId: string; name: string; error: string }>;
    staleCompetitors: LeaderboardEntry[];
  };
}

interface StatCard {
  label: string;
  value: string;
  hint?: string;
  accent: string;
}

const accentByType: Record<string, string> = {
  challenge: 'text-amber-400 border-amber-500/40',
  team: 'text-sky-400 border-sky-500/40',
  ctf: 'text-fuchsia-400 border-fuchsia-500/40',
  sync: 'text-emerald-400 border-emerald-500/40',
};

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : '0';
}

function relativeFromNow(iso: string | null): string {
  if (!iso) return 'Never';
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return 'Unknown';
  const diffMs = Date.now() - target.getTime();
  const diffMinutes = Math.round(diffMs / (60_000));
  if (diffMinutes < 1) return 'moments ago';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
  const diffYears = Math.round(diffMonths / 12);
  return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
}

export default function GamePlatformDashboard() {
  const [division, setDivision] = useState('all');
  const [coachScope, setCoachScope] = useState('my');
  const [range, setRange] = useState('30d');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch('/api/game-platform/dashboard', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Request failed with ${res.status}`);
        }
        return res.json();
      })
      .then((data: DashboardData) => {
        setDashboard(data);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Game Platform dashboard fetch failed', err);
        setError(err.message || 'Failed to load dashboard data');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [refreshKey]);

  const statCards: StatCard[] = useMemo(() => {
    if (!dashboard) {
      return [
        { label: 'Active on Platform', value: '—', accent: 'from-sky-500/40 via-sky-400/10 to-transparent' },
        { label: 'Synced Competitors', value: '—', accent: 'from-emerald-500/40 via-emerald-400/10 to-transparent' },
        { label: 'Total Challenges', value: '—', accent: 'from-fuchsia-500/40 via-fuchsia-400/10 to-transparent' },
        { label: 'Monthly CTF Participants', value: '—', accent: 'from-amber-500/40 via-amber-400/10 to-transparent' },
        { label: 'Last Sync', value: '—', accent: 'from-indigo-500/40 via-indigo-400/10 to-transparent' },
      ];
    }

    return [
      {
        label: 'Active on Platform (14d)',
        value: formatNumber(dashboard.global.activeRecently),
        hint: `${formatNumber(dashboard.global.totalCompetitors)} total competitors`,
        accent: 'from-sky-500/40 via-sky-400/10 to-transparent',
      },
      {
        label: 'Synced Competitors',
        value: formatNumber(dashboard.global.syncedCompetitors),
        hint: `${formatNumber(dashboard.global.totalCompetitors - dashboard.global.syncedCompetitors)} awaiting sync`,
        accent: 'from-emerald-500/40 via-emerald-400/10 to-transparent',
      },
      {
        label: 'Total Challenges Solved',
        value: formatNumber(dashboard.global.totalChallenges),
        accent: 'from-fuchsia-500/40 via-fuchsia-400/10 to-transparent',
      },
      {
        label: 'Monthly CTF Participants',
        value: formatNumber(dashboard.global.monthlyCtfParticipants),
        accent: 'from-amber-500/40 via-amber-400/10 to-transparent',
      },
      {
        label: 'Last Sync',
        value: dashboard.global.lastSyncedAt ? relativeFromNow(dashboard.global.lastSyncedAt) : 'Never',
        hint: dashboard.global.lastSyncedAt ? new Date(dashboard.global.lastSyncedAt).toLocaleString() : undefined,
        accent: 'from-indigo-500/40 via-indigo-400/10 to-transparent',
      },
    ];
  }, [dashboard]);

  const leaderboard = dashboard?.leaderboard ?? [];
  const teams = dashboard?.teams ?? [];
  const timeline = useMemo(() => {
    const events: Array<{ time: string; label: string; type: keyof typeof accentByType }> = [];
    if (dashboard?.global.lastSyncedAt) {
      events.push({
        time: new Date(dashboard.global.lastSyncedAt).toLocaleString(),
        label: 'Stats sync completed',
        type: 'sync',
      });
    }
    for (const alert of dashboard?.alerts.unsyncedCompetitors || []) {
      events.push({ time: 'Pending', label: `${alert.name} not yet synced to platform`, type: 'team' });
    }
    for (const stale of dashboard?.alerts.staleCompetitors || []) {
      events.push({
        time: stale.lastActivity ? new Date(stale.lastActivity).toLocaleDateString() : 'Unknown',
        label: `${stale.name} inactive recently`,
        type: 'challenge',
      });
    }
    return events.slice(0, 6);
  }, [dashboard]);

  const handleRefresh = () => {
    setRefreshKey((key) => key + 1);
  };

  return (
    <div className="relative p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          background:
            'radial-gradient(800px 400px at 20% -10%, rgba(59,130,246,0.4), transparent), radial-gradient(700px 300px at 120% 50%, rgba(16,185,129,0.35), transparent)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{ background: 'linear-gradient(130deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,0) 60%)' }}
      />

      <div className="relative space-y-8">
        <header className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-wide text-meta-light">Game Platform Command</h1>
            <p className="text-meta-muted">Monitor challenge activity, team performance, and onboarding health.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-meta-muted">
              <span>Coach scope</span>
              <Tabs value={coachScope} onValueChange={setCoachScope}>
                <TabsList className="bg-meta-card border border-meta-border">
                  <TabsTrigger value="my">My teams</TabsTrigger>
                  <TabsTrigger value="all">All teams</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex items-center gap-2 text-sm text-meta-muted">
              <span>Division</span>
              <select
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                className="bg-meta-card border border-meta-border text-meta-light px-3 py-2 rounded"
              >
                <option value="all">All</option>
                <option value="middle_school">Middle School</option>
                <option value="high_school">High School</option>
                <option value="college">College</option>
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm text-meta-muted">
              <span>Timeframe</span>
              <select
                value={range}
                onChange={(e) => setRange(e.target.value)}
                className="bg-meta-card border border-meta-border text-meta-light px-3 py-2 rounded"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="custom">Custom…</option>
              </select>
            </div>
            <Button
              variant="outline"
              className="ml-auto border-meta-border text-meta-light"
              onClick={handleRefresh}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh Data'}
            </Button>
          </div>
        </header>

        {error && (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {statCards.map((stat) => (
            <div key={stat.label} className="relative overflow-hidden rounded border border-meta-border bg-meta-card">
              <div className="absolute inset-x-0 -top-10 h-32 bg-gradient-to-br from-transparent to-meta-accent/40 blur-2xl opacity-60" />
              <div className={cn('relative p-4 space-y-3 bg-meta-card/80 backdrop-blur', 'bg-gradient-to-br', stat.accent)}>
                <div className="text-xs uppercase tracking-wide text-meta-muted">{stat.label}</div>
                <div className="text-3xl font-semibold text-meta-light">{stat.value}</div>
                {stat.hint && <div className="text-xs text-meta-muted">{stat.hint}</div>}
                <div className="flex gap-1">
                  {Array.from({ length: 7 }).map((_, idx) => (
                    <span
                      key={idx}
                      className="h-6 flex-1 rounded bg-meta-dark"
                      style={{ opacity: 0.35 + idx * 0.08 }}
                      aria-hidden
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="border-meta-border bg-meta-card">
            <CardHeader>
              <CardTitle>Challenges Done</CardTitle>
              <CardDescription>Top competitors by solved challenges</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm text-meta-light/90">
                  <thead className="text-xs uppercase text-meta-muted">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Rank</th>
                      <th className="py-2 pr-3 font-medium">Competitor</th>
                      <th className="py-2 pr-3 font-medium">Challenges</th>
                      <th className="py-2 pr-3 font-medium">Last Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-meta-border/80">
                    {(loading ? Array.from({ length: 5 }) : leaderboard).map((entry, idx) => (
                      <tr key={entry ? entry.competitorId : idx} className="hover:bg-meta-dark/40">
                        <td className="py-2 pr-3 text-meta-muted">#{idx + 1}</td>
                        <td className="py-2 pr-3">{entry ? entry.name : '—'}</td>
                        <td className="py-2 pr-3 font-medium">{entry ? formatNumber(entry.challenges) : '—'}</td>
                        <td className="py-2 pr-3 text-meta-muted">
                          {entry ? relativeFromNow(entry.lastActivity) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-meta-border bg-meta-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Monthly CTF Momentum</CardTitle>
                  <CardDescription>Flash CTF participation from synced stats</CardDescription>
                </div>
                <Tabs defaultValue="absolute">
                  <TabsList className="bg-meta-dark border border-meta-border">
                    <TabsTrigger value="absolute">Score</TabsTrigger>
                    <TabsTrigger value="pace">Pace</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64 rounded border border-dashed border-meta-border/80 bg-meta-dark/40 flex items-center justify-center text-sm text-meta-muted">
                Flash CTF charts will populate after nightly syncs.
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-meta-light">Teams Snapshot</h2>
              <p className="text-sm text-meta-muted">Compare collective scores and recent activity.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(loading ? Array.from({ length: 3 }) : teams).map((team, idx) => (
              <Card key={team ? team.teamId : idx} className="border-meta-border bg-meta-card/90 hover:border-meta-accent/60 transition">
                <CardHeader>
                  <CardTitle className="text-meta-light">{team ? team.name : '—'}</CardTitle>
                  <CardDescription>
                    Last sync {team ? relativeFromNow(team.lastSync) : '—'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-meta-muted">
                  <div className="flex items-center justify-between">
                    <span>Avg Score</span>
                    <span className="text-meta-light font-semibold">{team ? formatNumber(team.avgScore) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Total Challenges</span>
                    <span className="text-meta-light font-semibold">{team ? formatNumber(team.totalChallenges) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Members</span>
                    <span className="text-meta-light font-semibold">{team ? formatNumber(team.memberCount) : '—'}</span>
                  </div>
                  <div className="text-xs text-meta-muted">
                    {team?.division ? `${team.division} • ` : ''}
                    {team?.affiliation || 'Affiliation unknown'}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-meta-border bg-meta-card/90">
            <CardHeader>
              <CardTitle>Onboarding & Sync Alerts</CardTitle>
              <CardDescription>Competitors needing attention</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {dashboard?.alerts.unsyncedCompetitors.length ? (
                dashboard.alerts.unsyncedCompetitors.map((item) => (
                  <div
                    key={item.competitorId}
                    className="flex items-center justify-between rounded border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-amber-100"
                  >
                    <div>
                      <div className="font-medium text-meta-light">{item.name}</div>
                      <div className="text-xs text-meta-muted">No Game Platform ID assigned</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded border border-meta-border/60 bg-meta-dark/40 px-3 py-2 text-meta-muted">
                  All competitors have platform IDs.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-meta-border bg-meta-card/90">
            <CardHeader>
              <CardTitle>Sync Errors & Inactivity</CardTitle>
              <CardDescription>Keep tabs on stalled records</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {dashboard?.alerts.syncErrors.length ? (
                dashboard.alerts.syncErrors.map((item) => (
                  <div
                    key={item.competitorId}
                    className="flex items-center justify-between rounded border border-red-400/40 bg-red-500/10 px-3 py-2 text-red-100"
                  >
                    <div>
                      <div className="font-medium text-meta-light">{item.name}</div>
                      <div className="text-xs text-meta-muted">{item.error}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded border border-meta-border/60 bg-meta-dark/40 px-3 py-2 text-meta-muted">
                  No sync errors reported.
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-meta-border bg-meta-card">
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle>Activity Timeline</CardTitle>
                <CardDescription>Recent Game Platform events</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {timeline.length === 0 ? (
                <div className="rounded border border-meta-border/60 bg-meta-dark/40 px-3 py-2 text-sm text-meta-muted">
                  Activity will appear once the first sync job runs.
                </div>
              ) : (
                timeline.map((item, idx) => (
                  <div key={`${item.label}-${idx}`} className="flex items-start gap-3 text-sm text-meta-light/90">
                    <div className="w-32 shrink-0 text-xs uppercase tracking-wide text-meta-muted">{item.time}</div>
                    <div
                      className={cn(
                        'flex-1 rounded border px-3 py-2 backdrop-blur',
                        accentByType[item.type] ?? 'text-meta-muted border-meta-border'
                      )}
                    >
                      {item.label}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
