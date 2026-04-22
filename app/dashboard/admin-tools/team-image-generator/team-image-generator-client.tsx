'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Check, RefreshCw, X, Sparkles, Loader2, AlertCircle } from 'lucide-react';

type TeamStatus = 'pending' | 'generated' | 'complete' | 'failed' | 'missing';

interface CandidateInfo {
  id: string;
  status: string;
  prompt_used: string | null;
  regen_instructions: string | null;
  error_message: string | null;
  generated_at: string;
  candidate_path: string | null;
}

interface TeamRow {
  team_id: string;
  team_name: string;
  coach_name: string | null;
  school_name: string | null;
  status: TeamStatus;
  image_path: string | null;
  signed_url: string | null;
  coach_uploaded_while_pending?: boolean;
  coach_image_signed_url?: string | null;
  candidate: CandidateInfo | null;
}

interface StatusSummary {
  teams_without_image: number;
  pending_candidates: number;
  in_flight_jobs: number;
}

type ViewFilter = 'all' | 'pending' | 'generated' | 'complete' | 'missing' | 'failed';

export function TeamImageGeneratorClient() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [summary, setSummary] = useState<StatusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [preloading, setPreloading] = useState(false);
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');

  const [regenTarget, setRegenTarget] = useState<TeamRow | null>(null);
  const [regenInstructions, setRegenInstructions] = useState('');
  const [regenSubmitting, setRegenSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [listRes, statusRes] = await Promise.all([
        fetch('/api/admin/team-images/candidates?filter=all'),
        fetch('/api/admin/team-images/status'),
      ]);
      if (listRes.ok) {
        const data = await listRes.json();
        setTeams(data.teams ?? []);
      }
      if (statusRes.ok) {
        setSummary(await statusRes.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh every 5s while any job is in flight
  useEffect(() => {
    if (!summary || summary.in_flight_jobs === 0) return;
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [summary, refresh]);

  const handlePreload = async () => {
    setPreloading(true);
    try {
      const res = await fetch('/api/admin/team-images/preload', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Preload failed');
      }
      const body = await res.json();
      toast.success(`Preloaded ${body.created} placeholder(s) (skipped ${body.skipped}).`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preload failed');
    } finally {
      setPreloading(false);
    }
  };

  const handleBulkGenerate = async () => {
    if (!confirm(`Generate AI images for all ${summary?.teams_without_image ?? 0} teams without photos?`)) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/team-images/bulk-generate', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Bulk generate failed');
      }
      toast.success('Bulk generation started. Images will appear as they finish.');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk generate failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleAccept = async (t: TeamRow) => {
    if (!t.candidate) return;
    const res = await fetch(`/api/admin/team-images/${t.candidate.id}/accept`, { method: 'POST' });
    if (res.ok) {
      toast.success(`Accepted image for ${t.team_name}`);
      await refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? 'Accept failed');
    }
  };

  const handleReject = async (t: TeamRow) => {
    if (!t.candidate) return;
    if (!confirm(`Reject the generated image for "${t.team_name}"? The team record will be left untouched.`)) return;
    const res = await fetch(`/api/admin/team-images/${t.candidate.id}/reject`, { method: 'POST' });
    if (res.ok) {
      toast.success(`Rejected image for ${t.team_name}`);
      await refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? 'Reject failed');
    }
  };

  const openRegen = (t: TeamRow) => {
    setRegenTarget(t);
    // Seed the dialog with the last instructions used for this team so the
    // admin can tweak rather than retype. Falls back to empty when the team
    // has no prior regen history (e.g. fresh placeholder or complete/uploaded).
    setRegenInstructions(t.candidate?.regen_instructions ?? '');
  };

  const submitRegen = async () => {
    if (!regenTarget) return;
    const hasPendingCandidate =
      !!regenTarget.candidate && regenTarget.candidate.status === 'pending';
    const isEmptyPlaceholder = hasPendingCandidate && !regenTarget.candidate?.prompt_used;
    // Instructions required when regenerating an already-generated image
    // (pending + has prompt, or complete/generated). Optional only for empty placeholders.
    if (!isEmptyPlaceholder && !regenInstructions.trim()) {
      toast.error('Please enter regeneration instructions');
      return;
    }
    setRegenSubmitting(true);
    try {
      const res = hasPendingCandidate
        ? await fetch(`/api/admin/team-images/${regenTarget.candidate!.id}/regen`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instructions: regenInstructions }),
          })
        : await fetch('/api/admin/team-images/generate-for-team', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamId: regenTarget.team_id, instructions: regenInstructions }),
          });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Regen failed');
      }
      toast.success(`New image generated for ${regenTarget.team_name} — review the pending candidate.`);
      setRegenTarget(null);
      setRegenInstructions('');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Regen failed');
    } finally {
      setRegenSubmitting(false);
    }
  };

  // Counts per status for filter buttons
  const counts: Record<ViewFilter, number> = {
    all: teams.length,
    pending: teams.filter((t) => t.status === 'pending').length,
    generated: teams.filter((t) => t.status === 'generated').length,
    complete: teams.filter((t) => t.status === 'complete').length,
    missing: teams.filter((t) => t.status === 'missing').length,
    failed: teams.filter((t) => t.status === 'failed').length,
  };

  const visibleTeams = viewFilter === 'all' ? teams : teams.filter((t) => t.status === viewFilter);

  return (
    <div className="space-y-6">
      {/* Summary + bulk action */}
      <Card className="bg-meta-card border-meta-border">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-xs text-meta-muted uppercase tracking-wide">Teams missing images</div>
              <div className="text-3xl font-bold text-meta-light">{summary?.teams_without_image ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-meta-muted uppercase tracking-wide">Pending review</div>
              <div className="text-3xl font-bold text-meta-light">{summary?.pending_candidates ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-meta-muted uppercase tracking-wide">Jobs running</div>
              <div className="text-3xl font-bold text-meta-light flex items-center gap-2">
                {summary?.in_flight_jobs ?? '—'}
                {(summary?.in_flight_jobs ?? 0) > 0 && <Loader2 className="h-5 w-5 animate-spin" />}
              </div>
            </div>
            <div className="flex-1" />
            <Button
              onClick={handlePreload}
              disabled={preloading || (summary?.teams_without_image ?? 0) === 0}
              variant="outline"
            >
              {preloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Preload Empty Candidates
            </Button>
            <Button
              onClick={handleBulkGenerate}
              disabled={generating || (summary?.teams_without_image ?? 0) === 0}
              className="bg-meta-accent hover:bg-meta-accent/80"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Generate All
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {(['all', 'pending', 'generated', 'complete', 'missing', 'failed'] as ViewFilter[]).map((f) => (
          <Button
            key={f}
            variant={viewFilter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewFilter(f)}
            className="capitalize"
          >
            {f} <span className="ml-1.5 text-xs opacity-75">{counts[f]}</span>
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} className="ml-auto">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Teams grid grouped by coach */}
      {loading ? (
        <div className="text-meta-muted">Loading…</div>
      ) : visibleTeams.length === 0 ? (
        <Card className="bg-meta-card border-meta-border">
          <CardContent className="py-12 text-center text-meta-muted">
            No teams matching &quot;{viewFilter}&quot;.
          </CardContent>
        </Card>
      ) : (
        (() => {
          const groups = new Map<string, TeamRow[]>();
          for (const t of visibleTeams) {
            const key = t.coach_name ?? '— Unknown coach —';
            const arr = groups.get(key) ?? [];
            arr.push(t);
            groups.set(key, arr);
          }
          const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
            if (a.startsWith('—')) return 1;
            if (b.startsWith('—')) return -1;
            return a.localeCompare(b);
          });
          return (
            <div className="space-y-8">
              {sortedKeys.map((coach) => {
                const group = groups.get(coach)!;
                const school = group[0]?.school_name ?? null;
                return (
                  <div key={coach} className="space-y-3">
                    <div className="flex items-baseline gap-3 border-b border-meta-border pb-2">
                      <h2 className="text-lg font-semibold text-meta-light">{coach}</h2>
                      {school && <span className="text-sm text-meta-muted">· {school}</span>}
                      <span className="text-xs text-meta-muted ml-auto">
                        {group.length} team{group.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {group.map((t) => (
                        <TeamCard
                          key={t.team_id}
                          team={t}
                          onAccept={() => handleAccept(t)}
                          onRegen={() => openRegen(t)}
                          onReject={() => handleReject(t)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()
      )}

      {/* Regen dialog */}
      <Dialog open={!!regenTarget} onOpenChange={(open) => !open && setRegenTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {regenTarget?.candidate?.prompt_used ? 'Regenerate' : 'Generate'} image for &quot;
              {regenTarget?.team_name}&quot;
            </DialogTitle>
            <DialogDescription>
              {regenTarget?.candidate?.prompt_used
                ? regenTarget?.candidate?.regen_instructions
                  ? 'Previous instructions are loaded below — tweak them and regenerate, or clear and start fresh.'
                  : 'Enter instructions for the regeneration. These will be added to the prompt.'
                : 'Optionally enter styling instructions. Leave blank to use the default randomized style.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={regenInstructions}
            onChange={(e) => setRegenInstructions(e.target.value)}
            placeholder="e.g. Make it more vibrant, emphasize teamwork, less dark..."
            rows={5}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenTarget(null)} disabled={regenSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={submitRegen}
              disabled={
                regenSubmitting ||
                (!!regenTarget?.candidate?.prompt_used && !regenInstructions.trim())
              }
            >
              {regenSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {regenTarget?.candidate?.prompt_used ? 'Regenerate' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TeamCardProps {
  team: TeamRow;
  onAccept: () => void;
  onRegen: () => void;
  onReject: () => void;
}

function TeamCard({ team, onAccept, onRegen, onReject }: TeamCardProps) {
  const coachUploadedWhilePending = !!team.coach_uploaded_while_pending;
  // Accept is blocked if a coach-uploaded image exists — we must not overwrite it.
  const canAccept = team.status === 'pending' && !!team.signed_url && !coachUploadedWhilePending;
  const canReject = team.status === 'pending' && !!team.candidate;
  const canRegen =
    (team.status === 'pending' && !!team.candidate) ||
    team.status === 'complete' ||
    team.status === 'generated';
  const showEmptyPlaceholderActions =
    team.status === 'pending' && !!team.candidate && !team.candidate.prompt_used;
  const showStandaloneRegen =
    (team.status === 'complete' || team.status === 'generated') && !!team.signed_url;

  return (
    <Card className="bg-meta-card border-meta-border overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-meta-light text-base flex items-start justify-between gap-2">
          <span className="line-clamp-2">{team.team_name}</span>
          <StatusBadge status={team.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {coachUploadedWhilePending && (
          <div className="rounded border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <strong>Coach uploaded an image.</strong> Accepting is disabled —
                rejecting is recommended so the coach&apos;s upload stays in place.
              </div>
            </div>
            {team.coach_image_signed_url && (
              <div className="aspect-video bg-slate-900 rounded overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={team.coach_image_signed_url}
                  alt={`${team.team_name} (coach upload)`}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        )}
        <div className="aspect-video bg-slate-800 rounded overflow-hidden flex items-center justify-center">
          {team.status === 'failed' ? (
            <div className="p-4 text-center text-red-400 text-sm">
              <AlertCircle className="h-6 w-6 mx-auto mb-2" />
              {team.candidate?.error_message ?? 'Generation failed'}
            </div>
          ) : team.signed_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.signed_url} alt={team.team_name} className="w-full h-full object-cover" />
          ) : showEmptyPlaceholderActions ? (
            <div className="text-meta-muted text-sm text-center px-4">
              Empty placeholder — click <strong>Generate</strong> to create an image.
            </div>
          ) : team.status === 'missing' ? (
            <div className="text-meta-muted text-sm text-center px-4">
              No image. Use <strong>Preload</strong> or <strong>Generate All</strong> to create one.
            </div>
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-meta-muted" />
          )}
        </div>
        {team.candidate?.regen_instructions && (
          <div className="text-xs text-meta-muted italic line-clamp-2">
            Regen: {team.candidate.regen_instructions}
          </div>
        )}
        {showEmptyPlaceholderActions && (
          <div className="flex gap-2">
            <Button size="sm" onClick={onRegen} className="flex-1 bg-meta-accent hover:bg-meta-accent/80">
              <Sparkles className="h-4 w-4 mr-1" /> Generate
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onReject}
              className="flex-1 border-red-600 text-red-500 hover:bg-red-600 hover:text-white"
            >
              <X className="h-4 w-4 mr-1" /> Reject
            </Button>
          </div>
        )}
        {canAccept && !showEmptyPlaceholderActions && (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onAccept}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              <Check className="h-4 w-4 mr-1" /> Accept
            </Button>
            <Button size="sm" variant="outline" onClick={onRegen} className="flex-1">
              <RefreshCw className="h-4 w-4 mr-1" /> Regen
            </Button>
            {canReject && (
              <Button
                size="sm"
                variant="outline"
                onClick={onReject}
                className="flex-1 border-red-600 text-red-500 hover:bg-red-600 hover:text-white"
              >
                <X className="h-4 w-4 mr-1" /> Reject
              </Button>
            )}
          </div>
        )}
        {coachUploadedWhilePending && canReject && !showEmptyPlaceholderActions && (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onReject}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              <X className="h-4 w-4 mr-1" /> Reject (keep coach upload)
            </Button>
          </div>
        )}
        {showStandaloneRegen && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onRegen} className="flex-1">
              <RefreshCw className="h-4 w-4 mr-1" /> Regen
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: TeamStatus }) {
  const map: Record<TeamStatus, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
    generated: { label: 'Generated', className: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
    complete: { label: 'Complete', className: 'bg-green-500/20 text-green-300 border-green-500/40' },
    missing: { label: 'Missing', className: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
    failed: { label: 'Failed', className: 'bg-red-500/20 text-red-300 border-red-500/40' },
  };
  const s = map[status];
  return (
    <Badge variant="outline" className={`shrink-0 ${s.className}`}>
      {s.label}
    </Badge>
  );
}
