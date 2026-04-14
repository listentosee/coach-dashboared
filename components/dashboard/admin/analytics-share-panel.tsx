'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ShareResponse = {
  url: string;
  link: {
    expires_at: string | null;
    max_uses: number | null;
  };
};

export function AnalyticsSharePanel() {
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [maxUses, setMaxUses] = useState('25');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShareResponse | null>(null);

  async function createShareLink() {
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, number> = {};
      const expires = Number.parseInt(expiresInDays, 10);
      const uses = Number.parseInt(maxUses, 10);
      if (Number.isFinite(expires) && expires > 0) payload.expiresInDays = expires;
      if (Number.isFinite(uses) && uses > 0) payload.maxUses = uses;

      const response = await fetch('/api/admin/analytics/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((json as { error?: string }).error || `Request failed: ${response.status}`);
      }

      setResult(json as ShareResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded border border-meta-border bg-meta-card p-5">
      <div className="mb-4">
        <div className="text-sm text-meta-muted">Sharing</div>
        <div className="text-meta-light text-lg font-semibold">Donor Report Link</div>
        <p className="mt-1 text-sm text-meta-muted">
          Create a donor-safe public analytics link with expiration and use limits.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="expires-in-days">Expires in days</Label>
          <Input id="expires-in-days" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="max-uses">Max uses</Label>
          <Input id="max-uses" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button onClick={createShareLink} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create Share Link
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 rounded border border-meta-border/60 bg-meta-dark/40 p-4">
          <div className="text-sm text-meta-muted">Share URL</div>
          <div className="mt-2 break-all text-sm text-meta-light">{result.url}</div>
          <div className="mt-3 text-xs text-meta-muted">
            Expires: {result.link.expires_at ? new Date(result.link.expires_at).toLocaleString() : 'never'} • Max uses: {result.link.max_uses ?? 'unlimited'}
          </div>
        </div>
      ) : null}
    </div>
  );
}
