'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Download, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

type Answer = { id: string; question: string; type: string | null; answer: string };

interface Submission {
  id: string;
  type: 'coach' | 'competitor';
  submitted_at: string;
  fillout_submission_id: string | null;
  fillout_form_id: string | null;
  respondent_name: string;
  respondent_email: string | null;
  school_name: string | null;
  competitor_id: string | null;
  coach_profile_id: string | null;
  answers: Answer[];
}

type Filter = 'all' | 'coach' | 'competitor';

export function CertificatesSubmissionsPanel() {
  const [filter, setFilter] = useState<Filter>('all');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Submission | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Two fetches: `load` shows the spinner and is used for initial load +
  // manual refresh. `silentRefresh` swaps data without flicker and is used
  // by the 10s background poll.
  const fetchSubmissions = useCallback(async (): Promise<Submission[] | null> => {
    const res = await fetch(`/api/admin/certificates/submissions?type=${filter}`, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Request failed: ${res.status}`);
    }
    const data = await res.json();
    return (data.submissions ?? []) as Submission[];
  }, [filter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchSubmissions();
      if (rows) setSubmissions(rows);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fetchSubmissions]);

  const silentRefresh = useCallback(async () => {
    try {
      const rows = await fetchSubmissions();
      if (rows) {
        setSubmissions(rows);
        setLastUpdated(new Date());
        setError(null);
      }
    } catch {
      // swallow — polling shouldn't show error toasts. Next tick retries.
    }
  }, [fetchSubmissions]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll every 10s while the tab is visible so admins see submissions land
  // without refreshing. Pauses when hidden; fires an immediate refresh on
  // refocus so the first impression after switching back is current.
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(silentRefresh, 10_000);
    };
    const stop = () => {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        silentRefresh();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [silentRefresh]);

  const counts = useMemo(() => {
    const all = submissions.length;
    const coach = submissions.filter((s) => s.type === 'coach').length;
    const competitor = submissions.filter((s) => s.type === 'competitor').length;
    return { all, coach, competitor };
  }, [submissions]);

  return (
    <Card className="border-meta-border bg-meta-dark/60">
      <CardHeader>
        <CardTitle className="text-meta-light flex items-center justify-between gap-3">
          <span>Submissions</span>
          <span className="text-xs font-normal text-meta-muted flex items-center gap-2">
            {lastUpdated ? (
              <span title={lastUpdated.toLocaleString()}>
                Updated {formatRelative(lastUpdated)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded border border-meta-border px-2 py-1 hover:bg-white/5 disabled:opacity-50"
              title="Refresh now"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </span>
        </CardTitle>
        <CardDescription>
          Review survey responses inline, or export all responses for a given audience as CSV.
          Auto-refreshes every 10 seconds while the tab is visible.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
          >
            All <span className="ml-1 opacity-75">{counts.all}</span>
          </Button>
          <Button
            size="sm"
            variant={filter === 'competitor' ? 'default' : 'outline'}
            onClick={() => setFilter('competitor')}
          >
            Competitor <span className="ml-1 opacity-75">{counts.competitor}</span>
          </Button>
          <Button
            size="sm"
            variant={filter === 'coach' ? 'default' : 'outline'}
            onClick={() => setFilter('coach')}
          >
            Coach <span className="ml-1 opacity-75">{counts.coach}</span>
          </Button>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open('/api/admin/certificates/submissions/export?type=competitor', '_blank')}
            >
              <Download className="h-4 w-4 mr-1" /> Competitor CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open('/api/admin/certificates/submissions/export?type=coach', '_blank')}
            >
              <Download className="h-4 w-4 mr-1" /> Coach CSV
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-meta-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading submissions…
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-sm text-meta-muted">No submissions match the current filter.</div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-meta-border">
            <table className="w-full text-sm">
              <thead className="bg-black/30 text-left text-xs uppercase tracking-wide text-meta-muted">
                <tr>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Respondent</th>
                  <th className="px-3 py-2">Context</th>
                  <th className="px-3 py-2 text-right">Answers</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-t border-meta-border hover:bg-white/5">
                    <td className="px-3 py-2 text-meta-light whitespace-nowrap">
                      {formatDate(s.submitted_at)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={
                          s.type === 'coach'
                            ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                        }
                      >
                        {s.type}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-meta-light">{s.respondent_name}</td>
                    <td className="px-3 py-2 text-xs text-meta-muted">
                      {s.school_name ?? s.respondent_email ?? ''}
                    </td>
                    <td className="px-3 py-2 text-right text-meta-light">{s.answers.length}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setViewing(s)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-meta-light">
              {viewing?.respondent_name} — {viewing?.type === 'coach' ? 'Coach' : 'Competitor'} submission
            </DialogTitle>
            <DialogDescription>
              {viewing ? formatDate(viewing.submitted_at) : ''}
              {viewing?.fillout_submission_id ? ` · Fillout ID ${viewing.fillout_submission_id}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
            {viewing?.answers.length === 0 && (
              <div className="text-sm text-meta-muted">No parsed answers in this submission.</div>
            )}
            {viewing?.answers.map((a) => (
              <div key={a.id} className="rounded-md border border-meta-border bg-black/20 p-3">
                <div className="text-xs uppercase tracking-wide text-meta-muted flex items-center gap-2">
                  <span>{a.question}</span>
                  {a.type && <span className="text-[10px] opacity-60">({a.type})</span>}
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-meta-light">
                  {a.answer || <span className="text-meta-muted italic">(blank)</span>}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatRelative(date: Date): string {
  const s = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
