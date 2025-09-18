'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface StatCard {
  label: string;
  value: string;
  delta: string;
  trend: number[];
  accent: string;
}

const mockStats: StatCard[] = [
  {
    label: 'Active on Platform',
    value: '128',
    delta: '+12 vs last week',
    trend: [20, 32, 48, 51, 64, 70, 80],
    accent: 'from-sky-500/40 via-sky-400/10 to-transparent',
  },
  {
    label: 'Registered Competitors',
    value: '412',
    delta: '+5 new',
    trend: [320, 340, 356, 370, 390, 402, 412],
    accent: 'from-emerald-500/40 via-emerald-400/10 to-transparent',
  },
  {
    label: 'In Teams',
    value: '304',
    delta: '74%',
    trend: [180, 200, 230, 260, 280, 300, 304],
    accent: 'from-fuchsia-500/40 via-fuchsia-400/10 to-transparent',
  },
  {
    label: 'Challenges Solved',
    value: '5,643',
    delta: '+418 this month',
    trend: [4200, 4400, 4700, 4950, 5200, 5400, 5643],
    accent: 'from-amber-500/40 via-amber-400/10 to-transparent',
  },
  {
    label: 'Monthly CTF Participants',
    value: '186',
    delta: '45% of eligible',
    trend: [60, 80, 120, 136, 150, 172, 186],
    accent: 'from-indigo-500/40 via-indigo-400/10 to-transparent',
  },
];

const mockLeaderboard = Array.from({ length: 8 }, (_, idx) => ({
  rank: idx + 1,
  competitor: `Competitor ${idx + 1}`,
  challenges: 120 - idx * 7,
  lastActive: '2h ago',
}));

const mockTeams = Array.from({ length: 6 }, (_, idx) => ({
  id: `team-${idx + 1}`,
  name: `Cyber Team ${idx + 1}`,
  avgScore: 845 - idx * 23,
  challenges: 420 - idx * 22,
  members: 6,
  lastSync: '15m ago',
}));

const mockAlerts = {
  onboarding: [
    { name: 'Jordan Wright', status: 'Awaiting first login', action: 'Send reminder' },
    { name: 'Amelia Chen', status: 'Sync pending', action: 'Retry sync' },
  ],
  inactivity: [
    { name: 'Diego Soto', status: 'Inactive 14 days', action: 'Review placement' },
    { name: 'Priya Nair', status: 'CTF score stagnated', action: 'Assign mentor' },
  ],
};

const mockTimeline = [
  { time: 'Today 10:20', label: 'Team Helios solved 14 challenges', type: 'challenge' },
  { time: 'Today 09:05', label: 'Coach Miles reassigned 2 members', type: 'team' },
  { time: 'Yesterday', label: '43 competitors joined October CTF', type: 'ctf' },
  { time: '2 days ago', label: 'Auto-sync completed (no drift)', type: 'sync' },
];

const accentByType: Record<string, string> = {
  challenge: 'text-amber-400 border-amber-500/40',
  team: 'text-sky-400 border-sky-500/40',
  ctf: 'text-fuchsia-400 border-fuchsia-500/40',
  sync: 'text-emerald-400 border-emerald-500/40',
};

export default function GamePlatformDashboard() {
  const [division, setDivision] = useState('all');
  const [coachScope, setCoachScope] = useState('my');
  const [range, setRange] = useState('30d');

  const filteredLeaderboard = useMemo(() => mockLeaderboard, []);

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
            <Button variant="outline" className="ml-auto border-meta-border text-meta-light">
              Refresh Data
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {mockStats.map((stat) => (
            <div key={stat.label} className="relative overflow-hidden rounded border border-meta-border bg-meta-card">
              <div className="absolute inset-x-0 -top-10 h-32 bg-gradient-to-br from-transparent to-meta-accent/40 blur-2xl opacity-60" />
              <div className={cn('relative p-4 space-y-3 bg-meta-card/80 backdrop-blur', 'bg-gradient-to-br', stat.accent)}>
                <div className="text-xs uppercase tracking-wide text-meta-muted">{stat.label}</div>
                <div className="text-3xl font-semibold text-meta-light">{stat.value}</div>
                <div className="text-xs text-meta-muted">{stat.delta}</div>
                <div className="flex gap-1">
                  {stat.trend.map((_, idx) => (
                    <span
                      key={idx}
                      className="h-6 flex-1 rounded bg-meta-dark"
                      style={{ opacity: 0.4 + (idx / stat.trend.length) * 0.6 }}
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
                    {filteredLeaderboard.map((row) => (
                      <tr key={row.rank} className="hover:bg-meta-dark/40">
                        <td className="py-2 pr-3 text-meta-muted">#{row.rank}</td>
                        <td className="py-2 pr-3">{row.competitor}</td>
                        <td className="py-2 pr-3 font-medium">{row.challenges}</td>
                        <td className="py-2 pr-3 text-meta-muted">{row.lastActive}</td>
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
                  <CardTitle>Monthly CTF Score</CardTitle>
                  <CardDescription>Performance trends by competitor</CardDescription>
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
                Chart placeholder — integrate recharts/visx once API data available
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
            <Button variant="ghost" className="text-xs text-meta-muted hover:text-meta-light">Open All Teams Drawer</Button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {mockTeams.map((team) => (
              <Card key={team.id} className="border-meta-border bg-meta-card/90 hover:border-meta-accent/60 transition">
                <CardHeader>
                  <CardTitle className="text-meta-light">{team.name}</CardTitle>
                  <CardDescription>Last sync {team.lastSync}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-meta-muted">
                  <div className="flex items-center justify-between">
                    <span>Avg CTF Score</span>
                    <span className="text-meta-light font-semibold">{team.avgScore}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Challenges Solved</span>
                    <span className="text-meta-light font-semibold">{team.challenges}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Members</span>
                    <span className="text-meta-light font-semibold">{team.members}</span>
                  </div>
                  <Button variant="outline" className="w-full border-meta-border text-meta-light">
                    View team details
                  </Button>
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
              {mockAlerts.onboarding.map((item, idx) => (
                <div
                  key={item.name}
                  className={cn(
                    'flex items-center justify-between rounded border px-3 py-2',
                    idx % 2 === 0 ? 'border-amber-400/40 bg-amber-500/10 text-amber-100' : 'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-100'
                  )}
                >
                  <div>
                    <div className="font-medium text-meta-light">{item.name}</div>
                    <div className="text-xs text-meta-muted">{item.status}</div>
                  </div>
                  <Button size="sm" variant="secondary" className="bg-transparent text-meta-light hover:bg-meta-dark/50">
                    {item.action}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-meta-border bg-meta-card/90">
            <CardHeader>
              <CardTitle>Inactive & Stalled</CardTitle>
              <CardDescription>Stay ahead of engagement dips</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {mockAlerts.inactivity.map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-sky-100">
                  <div>
                    <div className="font-medium text-meta-light">{item.name}</div>
                    <div className="text-xs text-meta-muted">{item.status}</div>
                  </div>
                  <Button size="sm" variant="secondary" className="bg-transparent text-meta-light hover:bg-meta-dark/50">
                    {item.action}
                  </Button>
                </div>
              ))}
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
              <Button variant="ghost" className="text-xs text-meta-muted hover:text-meta-light">Expand</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockTimeline.map((item) => (
                <div key={item.label} className="flex items-start gap-3 text-sm text-meta-light/90">
                  <div className="w-28 shrink-0 text-xs uppercase tracking-wide text-meta-muted">{item.time}</div>
                  <div
                    className={cn(
                      'flex-1 rounded border px-3 py-2 backdrop-blur',
                      accentByType[item.type] ?? 'text-meta-muted border-meta-border'
                    )}
                  >
                    {item.label}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
