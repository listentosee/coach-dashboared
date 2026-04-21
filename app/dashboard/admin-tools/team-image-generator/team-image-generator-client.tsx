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

interface Candidate {
  id: string;
  team_id: string;
  team_name: string;
  coach_name: string | null;
  school_name: string | null;
  candidate_path: string | null;
  signed_url: string | null;
  prompt_used: string | null;
  regen_instructions: string | null;
  status: string;
  error_message: string | null;
  generated_at: string;
}

interface StatusSummary {
  teams_without_image: number;
  pending_candidates: number;
  in_flight_jobs: number;
}

export function TeamImageGeneratorClient() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [summary, setSummary] = useState<StatusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending');

  const [regenTarget, setRegenTarget] = useState<Candidate | null>(null);
  const [regenInstructions, setRegenInstructions] = useState('');
  const [regenSubmitting, setRegenSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [candRes, statusRes] = await Promise.all([
        fetch(`/api/admin/team-images/candidates?status=${statusFilter}`),
        fetch('/api/admin/team-images/status'),
      ]);
      if (candRes.ok) {
        const data = await candRes.json();
        setCandidates(data.candidates ?? []);
      }
      if (statusRes.ok) {
        setSummary(await statusRes.json());
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh every 5s while jobs are in-flight
  useEffect(() => {
    if (!summary || summary.in_flight_jobs === 0) return;
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [summary, refresh]);

  const [preloading, setPreloading] = useState(false);
  const handlePreload = async () => {
    setPreloading(true);
    try {
      const res = await fetch('/api/admin/team-images/preload', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Preload failed');
      }
      const body = await res.json();
      toast.success(`Preloaded ${body.created} placeholder(s) (skipped ${body.skipped}). Click Regen on each to generate.`);
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

  const handleAccept = async (c: Candidate) => {
    const res = await fetch(`/api/admin/team-images/${c.id}/accept`, { method: 'POST' });
    if (res.ok) {
      toast.success(`Accepted image for ${c.team_name}`);
      await refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? 'Accept failed');
    }
  };

  const handleReject = async (c: Candidate) => {
    if (!confirm(`Reject the generated image for "${c.team_name}"? The team record will be left untouched.`)) return;
    const res = await fetch(`/api/admin/team-images/${c.id}/reject`, { method: 'POST' });
    if (res.ok) {
      toast.success(`Rejected image for ${c.team_name}`);
      await refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? 'Reject failed');
    }
  };

  const openRegen = (c: Candidate) => {
    setRegenTarget(c);
    setRegenInstructions('');
  };

  const submitRegen = async () => {
    if (!regenTarget) return;
    const isEmptyPlaceholder = !regenTarget.prompt_used;
    if (!isEmptyPlaceholder && !regenInstructions.trim()) {
      toast.error('Please enter regeneration instructions');
      return;
    }
    setRegenSubmitting(true);
    try {
      const res = await fetch(`/api/admin/team-images/${regenTarget.id}/regen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions: regenInstructions }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Regen failed');
      }
      toast.success(`Image generated for ${regenTarget.team_name}`);
      setRegenTarget(null);
      setRegenInstructions('');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Regen failed');
    } finally {
      setRegenSubmitting(false);
    }
  };

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

      {/* Filter */}
      <div className="flex gap-2">
        <Button
          variant={statusFilter === 'pending' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('pending')}
        >
          Pending
        </Button>
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('all')}
        >
          All
        </Button>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Candidates grid */}
      {loading ? (
        <div className="text-meta-muted">Loading…</div>
      ) : candidates.length === 0 ? (
        <Card className="bg-meta-card border-meta-border">
          <CardContent className="py-12 text-center text-meta-muted">
            No {statusFilter === 'pending' ? 'pending' : ''} candidates.
          </CardContent>
        </Card>
      ) : (
        (() => {
          // Group candidates by coach_name (alphabetized, unknown last)
          const groups = new Map<string, Candidate[]>();
          for (const c of candidates) {
            const key = c.coach_name ?? '— Unknown coach —';
            const arr = groups.get(key) ?? [];
            arr.push(c);
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
                      {group.map((c) => (
            <Card key={c.id} className="bg-meta-card border-meta-border overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-meta-light text-base flex items-start justify-between gap-2">
                  <span className="line-clamp-2">{c.team_name}</span>
                  <StatusBadge status={c.status} />
                </CardTitle>
                <div className="text-xs text-meta-muted">
                  {c.coach_name ?? 'Unknown coach'}
                  {c.school_name ? ` · ${c.school_name}` : ''}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="aspect-video bg-slate-800 rounded overflow-hidden flex items-center justify-center">
                  {c.status === 'failed' ? (
                    <div className="p-4 text-center text-red-400 text-sm">
                      <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                      {c.error_message ?? 'Generation failed'}
                    </div>
                  ) : c.signed_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.signed_url} alt={c.team_name} className="w-full h-full object-cover" />
                  ) : c.status === 'pending' && c.prompt_used ? (
                    <Loader2 className="h-8 w-8 animate-spin text-meta-muted" />
                  ) : c.status === 'pending' ? (
                    <div className="text-meta-muted text-sm text-center px-4">
                      Empty placeholder — click <strong>Generate</strong> to create an image.
                    </div>
                  ) : (
                    <div className="text-meta-muted text-sm">No image</div>
                  )}
                </div>
                {c.regen_instructions && (
                  <div className="text-xs text-meta-muted italic line-clamp-2">
                    Regen: {c.regen_instructions}
                  </div>
                )}
                {c.status === 'pending' && !c.prompt_used && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => openRegen(c)}
                      className="flex-1 bg-meta-accent hover:bg-meta-accent/80"
                    >
                      <Sparkles className="h-4 w-4 mr-1" /> Generate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(c)}
                      className="flex-1 border-red-600 text-red-500 hover:bg-red-600 hover:text-white"
                    >
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </div>
                )}
                {c.status === 'pending' && c.signed_url && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleAccept(c)}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Check className="h-4 w-4 mr-1" /> Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openRegen(c)}
                      className="flex-1"
                    >
                      <RefreshCw className="h-4 w-4 mr-1" /> Regen
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(c)}
                      className="flex-1 border-red-600 text-red-500 hover:bg-red-600 hover:text-white"
                    >
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
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
              {regenTarget?.prompt_used ? 'Regenerate' : 'Generate'} image for &quot;{regenTarget?.team_name}&quot;
            </DialogTitle>
            <DialogDescription>
              {regenTarget?.prompt_used
                ? 'Enter instructions for the regeneration. These will be added to the prompt.'
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
                (!!regenTarget?.prompt_used && !regenInstructions.trim())
              }
            >
              {regenSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {regenTarget?.prompt_used ? 'Regenerate' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
    accepted: { label: 'Accepted', className: 'bg-green-500/20 text-green-300 border-green-500/40' },
    rejected: { label: 'Rejected', className: 'bg-red-500/20 text-red-300 border-red-500/40' },
    failed: { label: 'Failed', className: 'bg-red-500/20 text-red-300 border-red-500/40' },
    superseded: { label: 'Superseded', className: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
  };
  const s = map[status] ?? { label: status, className: '' };
  return (
    <Badge variant="outline" className={`shrink-0 ${s.className}`}>
      {s.label}
    </Badge>
  );
}
