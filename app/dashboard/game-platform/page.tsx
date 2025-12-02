'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getStatusColor } from '@/components/dashboard/competitor-columns';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import { DrilldownDialog, DrilldownDataset } from '@/components/dashboard/drilldown-dialog';
import { FileText, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import MonthlyCtfMomentum from '@/components/game-platform/monthly-ctf-momentum';

interface LeaderboardEntry {
  competitorId: string;
  name: string;
  teamName: string | null;
  challenges: number;
  totalPoints: number;
  lastActivity: string | null;
  categoryPoints: Record<string, number>;
  categoryCounts: Record<string, number>;
}

type TeamMemberSynced = {
  competitorId: string;
  name: string;
  status: string | null;
  challengesCompleted: number;
  monthlyCtf: number;
  categoryPoints: Record<string, number>;
  categoryCounts: Record<string, number>;
};

type TeamMemberPending = {
  competitorId: string;
  name: string;
  status: string | null;
};

type TeamMemberRosterEntry = {
  competitorId: string;
  name: string;
  status: 'Active' | 'Waiting for Add';
};

interface TeamSummary {
  teamId: string;
  name: string;
  division?: string | null;
  affiliation?: string | null;
  totalChallenges: number;
  totalPoints: number;
  memberCount: number;
  totalMembers: number;
  pendingMembers: number;
  membersOnPlatform: TeamMemberSynced[];
  membersOffPlatform: TeamMemberPending[];
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
  controller?: {
    isAdmin: boolean;
    coachId: string | null;
  };
  competitors?: Array<{ id: string; coach_id?: string | null; team?: { id?: string | null; name?: string | null; division?: string | null; affiliation?: string | null } | null }>;
  flashCtfMomentum?: {
    students: Array<{
      competitorId: string;
      name: string;
      thisMonthEvents: number;
      last3MonthsAvg: number;
      totalEvents12mo: number;
      challengesSolved: number;
      lastParticipated: string | null;
      status: 'none' | 'declining' | 'active';
    }>;
    alerts: {
      noParticipation: number;
      declining: number;
    };
    monthlyTotals: Array<{
      month: string;
      participants: number;
    }>;
    eventsByCompetitor?: Record<string, Array<{ eventName: string; date: string; challenges: number; points: number; challengeDetails?: Array<{ name: string; category: string; points: number; solvedAt: string }> }>>;
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

const rosterStatusStyles: Record<TeamMemberRosterEntry['status'], string> = {
  Active: 'border-transparent bg-green-100 text-green-800',
  'Waiting for Add': 'border-transparent bg-yellow-100 text-yellow-800',
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
  const router = useRouter();
  const [division, setDivision] = useState('all');
  const [coachScope, setCoachScope] = useState<'my' | 'all'>('my');
  const [range, setRange] = useState('30d');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState<TeamSummary | null>(null);
  const [teamDrilldownOpen, setTeamDrilldownOpen] = useState(false);
  const [competitorDrilldown, setCompetitorDrilldown] = useState<{
    name: string;
    categories: Array<{ topic: string; score: number; challenges: number }>;
  } | null>(null);
  const [competitorDrilldownOpen, setCompetitorDrilldownOpen] = useState(false);
  const [teamInitialDataset, setTeamInitialDataset] = useState<string | undefined>(undefined);
  const [ctfView, setCtfView] = useState<'score' | 'pace'>('score');
  const [flashCtfDrilldown, setFlashCtfDrilldown] = useState<{
    competitorId: string;
    name: string;
    eventName?: string;
    events: Array<{ eventName: string; date: string; challenges: number; points: number }>;
    challenges?: Array<{ name: string; category: string; points: number; solvedAt: string }>;
  } | null>(null);
  const [flashCtfDrilldownOpen, setFlashCtfDrilldownOpen] = useState(false);
  const [leaderboardSort, setLeaderboardSort] = useState<{
    column: 'name' | 'challenges';
    direction: 'asc' | 'desc';
  }>({ column: 'name', direction: 'asc' });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const url = new URL('/api/game-platform/dashboard', window.location.origin);
    url.searchParams.set('range', range);

    fetch(url.toString(), { signal: controller.signal })
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
  }, [refreshKey, range]);

  const statCards: StatCard[] = useMemo(() => {
    const rangeLabel = range === '7d' ? '7d' : range === '90d' ? '90d' : range === 'all' ? 'All Time' : '30d';

    if (!dashboard) {
      return [
        { label: 'Active on Platform', value: '—', accent: 'from-sky-500/40 via-sky-400/10 to-transparent' },
        { label: 'Synced Competitors', value: '—', accent: 'from-emerald-500/40 via-emerald-400/10 to-transparent' },
        { label: 'Total Challenges', value: '—', accent: 'from-fuchsia-500/40 via-fuchsia-400/10 to-transparent' },
        { label: `CTF Participants (${rangeLabel})`, value: '—', accent: 'from-amber-500/40 via-amber-400/10 to-transparent' },
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
        label: `CTF Participants (${rangeLabel})`,
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
  }, [dashboard, range]);

  const leaderboard = useMemo(() => {
    if (!dashboard) return [] as LeaderboardEntry[];
    let filteredLeaderboard: LeaderboardEntry[];
    if (dashboard.controller?.isAdmin && coachScope === 'all') {
      filteredLeaderboard = dashboard.leaderboard;
    } else {
      const currentCoachId = dashboard.controller?.coachId || null;
      if (!currentCoachId || !dashboard.competitors) {
        filteredLeaderboard = dashboard.leaderboard;
      } else {
        const allowedCompetitors = new Set(
          (dashboard.competitors as any[]).filter((c) => c.coach_id === currentCoachId).map((c) => c.id)
        );
        filteredLeaderboard = dashboard.leaderboard.filter((entry) => allowedCompetitors.has(entry.competitorId));
      }
    }

    // Apply division filter
    if (division !== 'all' && dashboard.competitors) {
      const competitorsInDivision = new Set(
        (dashboard.competitors as any[])
          .filter((c) => c.team?.division === division)
          .map((c) => c.id)
      );
      filteredLeaderboard = filteredLeaderboard.filter((entry) => competitorsInDivision.has(entry.competitorId));
    }

    // Apply sorting
    return [...filteredLeaderboard].sort((a, b) => {
      const multiplier = leaderboardSort.direction === 'asc' ? 1 : -1;
      if (leaderboardSort.column === 'name') {
        return multiplier * a.name.localeCompare(b.name);
      } else {
        return multiplier * (a.challenges - b.challenges);
      }
    });
  }, [dashboard, coachScope, division, leaderboardSort]);

  const teams = useMemo(() => {
    if (!dashboard) return [] as TeamSummary[];
    let filteredTeams: TeamSummary[];

    if (dashboard.controller?.isAdmin && coachScope === 'all') {
      filteredTeams = dashboard.teams;
    } else {
      const currentCoachId = dashboard.controller?.coachId || null;
      if (!currentCoachId || !dashboard.competitors) {
        filteredTeams = dashboard.teams;
      } else {
        const allowedTeamIds = new Set(
          (dashboard.competitors as any[])
            .filter((c) => c.coach_id === currentCoachId && c.team?.id)
            .map((c) => c.team.id as string)
        );
        if (!allowedTeamIds.size) {
          filteredTeams = dashboard.teams.filter((team) => team.totalMembers > 0);
        } else {
          filteredTeams = dashboard.teams.filter((team) => allowedTeamIds.has(team.teamId));
        }
      }
    }

    // Apply division filter
    if (division !== 'all') {
      filteredTeams = filteredTeams.filter((team) => team.division === division);
    }

    return filteredTeams;
  }, [dashboard, coachScope, division]);

  const filteredFlashCtfMomentum = useMemo(() => {
    if (!dashboard?.flashCtfMomentum) return undefined;

    let allowedCompetitorIds: Set<string> | null = null;

    // Apply coach scope filter
    if (!(dashboard.controller?.isAdmin && coachScope === 'all')) {
      const currentCoachId = dashboard.controller?.coachId || null;
      if (currentCoachId && dashboard.competitors) {
        allowedCompetitorIds = new Set(
          (dashboard.competitors as any[])
            .filter((c) => c.coach_id === currentCoachId)
            .map((c) => c.id)
        );
      }
    }

    // Apply division filter
    if (division !== 'all' && dashboard.competitors) {
      const competitorsInDivision = new Set(
        (dashboard.competitors as any[])
          .filter((c) => c.team?.division === division)
          .map((c) => c.id)
      );

      if (allowedCompetitorIds) {
        // Intersect with existing filter
        allowedCompetitorIds = new Set(
          [...allowedCompetitorIds].filter(id => competitorsInDivision.has(id))
        );
      } else {
        allowedCompetitorIds = competitorsInDivision;
      }
    }

    // If no filters applied, return original data
    if (!allowedCompetitorIds) {
      return dashboard.flashCtfMomentum;
    }

    // Filter students
    const filteredStudents = dashboard.flashCtfMomentum.students.filter(
      student => allowedCompetitorIds!.has(student.competitorId)
    );

    // Recalculate alerts based on filtered students
    const noParticipation = filteredStudents.filter(s => s.status === 'none').length;
    const declining = filteredStudents.filter(s => s.status === 'declining').length;

    // Filter eventsByCompetitor
    const filteredEventsByCompetitor = dashboard.flashCtfMomentum.eventsByCompetitor
      ? Object.fromEntries(
          Object.entries(dashboard.flashCtfMomentum.eventsByCompetitor).filter(
            ([competitorId]) => allowedCompetitorIds!.has(competitorId)
          )
        )
      : undefined;

    return {
      students: filteredStudents,
      alerts: {
        noParticipation,
        declining,
      },
      monthlyTotals: dashboard.flashCtfMomentum.monthlyTotals, // Keep monthly totals as-is (global stats)
      eventsByCompetitor: filteredEventsByCompetitor,
    };
  }, [dashboard, coachScope, division]);

  const handleCompetitorChallengeDrilldown = useCallback(
    (source: {
      name: string;
      categoryPoints?: Record<string, number> | null;
      categoryCounts?: Record<string, number> | null;
    }) => {
      const topics = new Set<string>();
      for (const [topic] of Object.entries(source.categoryPoints ?? {})) {
        topics.add(topic);
      }
      for (const [topic] of Object.entries(source.categoryCounts ?? {})) {
        topics.add(topic);
      }

      const categories = Array.from(topics).map((topicKey) => {
        const score = Number(source.categoryPoints?.[topicKey] ?? 0);
        const challenges = Number(source.categoryCounts?.[topicKey] ?? 0);
        return {
          topic: topicKey || 'Uncategorized',
          score,
          challenges,
        };
      });

      categories.sort((a, b) => {
        if (b.challenges === a.challenges) {
          return b.score - a.score;
        }
        return b.challenges - a.challenges;
      });

      setCompetitorDrilldown({
        name: source.name,
        categories: categories.length
          ? categories
          : [{ topic: 'No challenge activity recorded', score: 0, challenges: 0 }],
      });
      setCompetitorDrilldownOpen(true);
    },
    []
  );

  const onPlatformColumns = useMemo<ColumnDef<TeamMemberSynced>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => <span className="text-meta-light">{row.original.name}</span>,
      },
      {
        accessorKey: 'challengesCompleted',
        header: 'Challenges',
        cell: ({ row }) => (
          <button
            className="text-meta-accent hover:underline"
            onClick={() => handleCompetitorChallengeDrilldown(row.original)}
          >
            {formatNumber(row.original.challengesCompleted)}
          </button>
        ),
      },
      {
        accessorKey: 'monthlyCtf',
        header: 'CTF Participation',
        cell: ({ row }) => (
          <button
            className="text-meta-accent hover:underline"
            onClick={() => handleCompetitorChallengeDrilldown(row.original)}
          >
            {formatNumber(row.original.monthlyCtf)}
          </button>
        ),
      },
    ],
    [handleCompetitorChallengeDrilldown]
  );

  const awaitingColumns = useMemo<ColumnDef<TeamMemberPending>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => <span className="text-meta-light">{row.original.name}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const statusValue = row.original.status ? row.original.status.toLowerCase() : '';
          return (
            <Badge className={getStatusColor(statusValue)}>
              {row.original.status ?? 'Unknown'}
            </Badge>
          );
        },
      },
    ],
    []
  );

  const rosterColumns = useMemo<ColumnDef<TeamMemberRosterEntry>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => <span className="text-meta-light">{row.original.name}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge className={rosterStatusStyles[row.original.status]}>
            {row.original.status}
          </Badge>
        ),
      },
    ],
    []
  );

  const competitorChallengeColumns = useMemo<ColumnDef<{ topic: string; score: number; challenges: number }>[]>(
    () => [
      {
        accessorKey: 'topic',
        header: 'Topic',
        cell: ({ row }) => <span className="text-meta-light">{row.original.topic}</span>,
      },
      {
        accessorKey: 'score',
        header: 'Score',
        cell: ({ row }) => <span className="text-meta-light">{formatNumber(row.original.score)}</span>,
      },
      {
        accessorKey: 'challenges',
        header: 'Challenges',
        cell: ({ row }) => <span className="text-meta-light">{formatNumber(row.original.challenges)}</span>,
      },
    ],
    []
  );

  const flashCtfEventColumns = useMemo<ColumnDef<{ eventName: string; date: string; challenges: number; points: number }>[]>(
    () => [
      {
        accessorKey: 'eventName',
        header: 'Event',
        cell: ({ row }) => <span className="text-meta-light">{row.original.eventName}</span>,
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => <span className="text-meta-light">{new Date(row.original.date).toLocaleDateString()}</span>,
      },
      {
        accessorKey: 'challenges',
        header: 'Challenges',
        cell: ({ row }) => <span className="text-meta-light">{formatNumber(row.original.challenges)}</span>,
      },
      {
        accessorKey: 'points',
        header: 'Points',
        cell: ({ row }) => <span className="text-meta-light">{formatNumber(row.original.points)}</span>,
      },
    ],
    []
  );

  const flashCtfChallengeColumns = useMemo<ColumnDef<{ name: string; category: string; points: number; solvedAt: string }>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Challenge',
        cell: ({ row }) => <span className="text-meta-light">{row.original.name}</span>,
      },
      {
        accessorKey: 'category',
        header: 'Category',
        cell: ({ row }) => <span className="text-meta-light">{row.original.category}</span>,
      },
      {
        accessorKey: 'points',
        header: 'Points',
        cell: ({ row }) => <span className="text-meta-light">{formatNumber(row.original.points)}</span>,
      },
      {
        accessorKey: 'solvedAt',
        header: 'Solved At',
        cell: ({ row }) => <span className="text-meta-light">{new Date(row.original.solvedAt).toLocaleString()}</span>,
      },
    ],
    []
  );

  const teamDatasets = useMemo<DrilldownDataset[]>(() => {
    if (!selectedTeam) return [];

    const rosterData: TeamMemberRosterEntry[] = [
      ...selectedTeam.membersOnPlatform.map((member) => ({
        competitorId: member.competitorId,
        name: member.name,
        status: 'Active' as const,
      })),
      ...selectedTeam.membersOffPlatform.map((member) => ({
        competitorId: member.competitorId,
        name: member.name,
        status: 'Waiting for Add' as const,
      })),
    ];

    return [
      {
        key: 'on-platform',
        label: 'On Game Platform',
        columns: onPlatformColumns,
        data: selectedTeam.membersOnPlatform,
        emptyMessage: 'No members currently on the Game Platform.',
        onRowClick: handleCompetitorChallengeDrilldown,
      },
      {
        key: 'awaiting',
        label: 'Awaiting Add',
        columns: awaitingColumns,
        data: selectedTeam.membersOffPlatform,
        emptyMessage: 'No members awaiting add.',
      },
      {
        key: 'full-roster',
        label: 'Full Roster',
        columns: rosterColumns,
        data: rosterData,
        emptyMessage: 'No members on file.',
      },
    ];
  }, [selectedTeam, onPlatformColumns, awaitingColumns, rosterColumns, handleCompetitorChallengeDrilldown]);

  const alerts = useMemo(() => {
    if (!dashboard) {
      return {
        unsyncedCompetitors: [] as Array<{ competitorId: string; name: string }>,
        syncErrors: [] as Array<{ competitorId: string; name: string; error: string }>,
        staleCompetitors: [] as LeaderboardEntry[],
      };
    }
    if (dashboard.controller?.isAdmin && coachScope === 'all') {
      return dashboard.alerts;
    }
    const currentCoachId = dashboard.controller?.coachId || null;
    if (!currentCoachId || !dashboard.competitors) {
      return dashboard.alerts;
    }
    const allowedCompetitors = new Set(
      (dashboard.competitors as any[]).filter((c) => c.coach_id === currentCoachId).map((c) => c.id)
    );
    return {
      unsyncedCompetitors: dashboard.alerts.unsyncedCompetitors.filter((item) => allowedCompetitors.has(item.competitorId)),
      syncErrors: dashboard.alerts.syncErrors.filter((item) => allowedCompetitors.has(item.competitorId)),
      staleCompetitors: dashboard.alerts.staleCompetitors.filter((item) => allowedCompetitors.has(item.competitorId)),
    };
  }, [dashboard, coachScope]);
  const lastSyncedAt = dashboard?.global.lastSyncedAt ?? null;
  const timeline = useMemo(() => {
    const events: Array<{ time: string; label: string; type: keyof typeof accentByType }> = [];
    if (lastSyncedAt) {
      events.push({
        time: new Date(lastSyncedAt).toLocaleString(),
        label: 'Stats sync completed',
        type: 'sync',
      });
    }
    for (const alert of alerts.unsyncedCompetitors || []) {
      events.push({ time: 'Pending', label: `${alert.name} not yet synced to platform`, type: 'team' });
    }
    for (const stale of alerts.staleCompetitors || []) {
      events.push({
        time: stale.lastActivity ? new Date(stale.lastActivity).toLocaleDateString() : 'Unknown',
        label: `${stale.name} inactive recently`,
        type: 'challenge',
      });
    }
    return events.slice(0, 6);
  }, [alerts, lastSyncedAt]);

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
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-wide text-meta-light">Game Platform Dashboard</h1>
              <p className="text-meta-muted">Monitor challenge activity, team performance, and onboarding health.</p>
            </div>
            <Image
              src="/MetaCTF-white.png"
              alt="MetaCTF"
              width={346}
              height={115}
              className="h-[115px] w-auto opacity-80"
              priority
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {dashboard?.controller?.isAdmin && (
              <div className="flex items-center gap-2 text-sm text-meta-muted">
                <span>Coach scope</span>
                <Tabs value={coachScope} onValueChange={(value) => setCoachScope(value as 'my' | 'all')}>
                  <TabsList className="bg-meta-card border border-meta-border">
                    <TabsTrigger value="my">My teams</TabsTrigger>
                    <TabsTrigger value="all">All teams</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}
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
                <option value="all">All Time</option>
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

        <DrilldownDialog
          open={teamDrilldownOpen}
          onOpenChange={(open) => {
            setTeamDrilldownOpen(open);
            if (!open) {
              setSelectedTeam(null);
              setTeamInitialDataset(undefined);
            }
          }}
          title={selectedTeam?.name ?? 'Team roster'}
          description={selectedTeam ? `${selectedTeam.affiliation || 'Affiliation unknown'} • ${formatNumber(selectedTeam.memberCount)} synced of ${formatNumber(selectedTeam.totalMembers)}` : undefined}
          datasets={teamDatasets}
          initialKey={teamInitialDataset}
        />

        <DrilldownDialog
          open={competitorDrilldownOpen}
          onOpenChange={(open) => {
            setCompetitorDrilldownOpen(open);
            if (!open) setCompetitorDrilldown(null);
          }}
          title={competitorDrilldown?.name ?? 'Competitor challenge breakdown'}
          description="Challenge totals by topic"
          datasets={competitorDrilldown ? [{
            key: 'challenges',
            label: 'Challenges',
            columns: competitorChallengeColumns,
            data: competitorDrilldown.categories,
            emptyMessage: 'No challenge activity recorded.',
          }] : []}
        />

        <DrilldownDialog
          open={flashCtfDrilldownOpen}
          onOpenChange={(open) => {
            setFlashCtfDrilldownOpen(open);
            if (!open) setFlashCtfDrilldown(null);
          }}
          title={
            flashCtfDrilldown?.eventName
              ? `${flashCtfDrilldown.eventName} - ${flashCtfDrilldown.name}`
              : flashCtfDrilldown?.name
              ? `Flash CTF History: ${flashCtfDrilldown.name}`
              : 'Flash CTF History'
          }
          description={
            flashCtfDrilldown?.challenges
              ? `Challenges solved in ${flashCtfDrilldown.eventName}`
              : 'All Flash CTF events this competitor has participated in'
          }
          datasets={flashCtfDrilldown ? (
            flashCtfDrilldown.challenges
              ? [{
                  key: 'challenges',
                  label: 'Challenges',
                  columns: flashCtfChallengeColumns,
                  data: flashCtfDrilldown.challenges,
                  emptyMessage: 'No challenges recorded for this event.',
                }]
              : [{
                  key: 'events',
                  label: 'Flash CTF Events',
                  columns: flashCtfEventColumns,
                  data: flashCtfDrilldown.events,
                  emptyMessage: 'No Flash CTF participation recorded.',
                }]
          ) : []}
        />

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="border-meta-border bg-meta-card">
            <CardHeader>
              <CardTitle>Challenges Done</CardTitle>
              <CardDescription>Top competitors by solved challenges</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-96 overflow-y-auto overflow-x-auto rounded border border-meta-border/60">
                <table className="min-w-full text-left text-sm text-meta-light/90">
                  <thead className="text-xs uppercase text-meta-muted sticky top-0 bg-meta-card">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Rank</th>
                      <th
                        className="py-2 pr-3 font-medium cursor-pointer hover:text-meta-accent select-none"
                        onClick={() => {
                          setLeaderboardSort({
                            column: 'name',
                            direction: leaderboardSort.column === 'name' && leaderboardSort.direction === 'asc' ? 'desc' : 'asc'
                          });
                        }}
                      >
                        <div className="flex items-center gap-1">
                          Competitor
                          {leaderboardSort.column === 'name' ? (
                            leaderboardSort.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </div>
                      </th>
                      <th
                        className="py-2 pr-3 font-medium cursor-pointer hover:text-meta-accent select-none"
                        onClick={() => {
                          setLeaderboardSort({
                            column: 'challenges',
                            direction: leaderboardSort.column === 'challenges' && leaderboardSort.direction === 'asc' ? 'desc' : 'asc'
                          });
                        }}
                      >
                        <div className="flex items-center gap-1">
                          Challenges
                          {leaderboardSort.column === 'challenges' ? (
                            leaderboardSort.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </div>
                      </th>
                      <th className="py-2 pr-3 font-medium">Last Active</th>
                      <th className="py-2 pr-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-meta-border/80">
                    {(loading ? Array.from<LeaderboardEntry>({ length: 5 }) : leaderboard).map((entry, idx) => {
                      const hasChallengeData = !!entry && Number(entry?.challenges) > 0;
                      return (
                        <tr
                          key={entry?.competitorId ?? idx}
                          className="hover:bg-meta-dark/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meta-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-meta-card"
                        >
                          <td className="py-2 pr-3 text-meta-muted">#{idx + 1}</td>
                          <td
                            className={cn("py-2 pr-3", hasChallengeData ? "cursor-pointer" : "")}
                            role={hasChallengeData ? 'button' : undefined}
                            tabIndex={hasChallengeData ? 0 : undefined}
                            onClick={hasChallengeData && entry ? () => handleCompetitorChallengeDrilldown(entry) : undefined}
                            onKeyDown={hasChallengeData && entry ? (event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleCompetitorChallengeDrilldown(entry);
                              }
                            } : undefined}
                          >
                            {entry?.name ?? '—'}
                          </td>
                          <td className="py-2 pr-3 font-medium">{entry ? formatNumber(entry.challenges) : '—'}</td>
                          <td className="py-2 pr-3 text-meta-muted">
                            {entry ? relativeFromNow(entry.lastActivity) : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {entry && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  router.push(`/dashboard/game-platform/report-card/${entry.competitorId}`);
                                }}
                                title="View Report Card"
                                className="p-1 text-meta-light hover:text-meta-accent"
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
                <Tabs value={ctfView} onValueChange={(value) => setCtfView(value as 'score' | 'pace')}>
                  <TabsList className="bg-meta-dark border border-meta-border">
                    <TabsTrigger value="score">Score</TabsTrigger>
                    <TabsTrigger value="pace">Pace</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                {filteredFlashCtfMomentum ? (
                  <MonthlyCtfMomentum
                    view={ctfView}
                    data={filteredFlashCtfMomentum}
                    onStudentClick={(competitorId, name, eventName) => {
                      const allEvents = filteredFlashCtfMomentum.eventsByCompetitor?.[competitorId] || [];
                      // Filter to specific event if eventName is provided
                      const events = eventName
                        ? allEvents.filter(e => e.eventName === eventName)
                        : allEvents;

                      // Extract challenge details if a specific event is selected
                      const challenges = eventName && events.length > 0 && events[0].challengeDetails
                        ? events[0].challengeDetails
                        : undefined;

                      setFlashCtfDrilldown({
                        competitorId,
                        name,
                        eventName,
                        events,
                        challenges
                      });
                      setFlashCtfDrilldownOpen(true);
                    }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-meta-muted">
                    Loading Flash CTF data...
                  </div>
                )}
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
            {(loading ? Array.from<TeamSummary>({ length: 3 }) : teams).map((team, idx) => (
              <Card key={team?.teamId ?? idx} className="border-meta-border bg-meta-card/90 hover:border-meta-accent/60 transition">
                <CardHeader>
                  <CardTitle className="text-meta-light">{team ? team.name : '—'}</CardTitle>
                  <CardDescription>
                    Last sync {team ? relativeFromNow(team.lastSync) : '—'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-meta-muted">
                  <div className="flex items-center justify-between">
                    <span>Total Team Points</span>
                    <span className="text-meta-light font-semibold">{team ? formatNumber(team.totalPoints) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Average Per Member</span>
                    <span className="text-meta-light font-semibold">{team ? formatNumber(team.avgScore) : '—'}</span>
                  </div>
                  <button
                    type="button"
                    className="group flex w-full items-center justify-between rounded-sm text-left text-meta-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meta-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-meta-card"
                    onClick={() => {
                      if (!team) return;
                      setSelectedTeam(team);
                      setTeamInitialDataset('on-platform');
                      setTeamDrilldownOpen(true);
                    }}
                  >
                    <span className="group-hover:text-meta-light">Members</span>
                    <span className="font-semibold text-meta-accent group-hover:underline">
                      {team ? formatNumber(team.memberCount) : '—'}
                      {team && team.totalMembers > team.memberCount
                        ? ` / ${formatNumber(team.totalMembers)}`
                        : ''}
                    </span>
                  </button>
                  {team && team.pendingMembers > 0 ? (
                    <button
                      className="text-xs text-amber-400 hover:underline"
                      onClick={() => {
                        setSelectedTeam(team);
                        setTeamInitialDataset('awaiting');
                        setTeamDrilldownOpen(true);
                      }}
                    >
                      {formatNumber(team.pendingMembers)} awaiting add
                    </button>
                  ) : null}
                  <div className="text-xs text-meta-muted">
                    {team?.division ? `${team.division} • ` : ''}
                    {team?.affiliation || 'Affiliation unknown'}
                  </div>
                  {team ? (
                    <div className="pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full border-meta-border/70 text-meta-light hover:border-meta-accent/60"
                        onClick={() => {
                          setSelectedTeam(team);
                          setTeamInitialDataset('full-roster');
                          setTeamDrilldownOpen(true);
                        }}
                      >
                        View roster
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {dashboard?.controller?.isAdmin && (
          <>
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="border-meta-border bg-meta-card/90">
                <CardHeader>
                  <CardTitle>Onboarding & Sync Alerts</CardTitle>
                  <CardDescription>Competitors needing attention</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {alerts.unsyncedCompetitors.length ? (
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {alerts.unsyncedCompetitors.map((item: { competitorId: string; name: string }) => (
                        <div
                          key={item.competitorId}
                          className="rounded border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-amber-100"
                        >
                          <div className="font-medium text-meta-light">{item.name}</div>
                          <div className="text-xs text-meta-muted">No Game Platform ID assigned</div>
                        </div>
                      ))}
                    </div>
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
                  {alerts.syncErrors.length ? (
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {alerts.syncErrors.map((item: { competitorId: string; name: string; error: string }) => (
                        <div
                          key={item.competitorId}
                          className="rounded border border-red-400/40 bg-red-500/10 px-3 py-2 text-red-100"
                        >
                          <div className="font-medium text-meta-light">{item.name}</div>
                          <div className="text-xs text-meta-muted">{item.error}</div>
                        </div>
                      ))}
                    </div>
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
          </>
        )}
      </div>
    </div>
  );
}
