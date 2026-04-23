'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CertificatesSubmissionsPanel } from './certificates-submissions-panel';

type RouteResult = Record<string, unknown> | null;

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((json as { error?: string }).error || `Request failed: ${response.status}`);
  }

  return json as Record<string, unknown>;
}

export function CertificatesDashboardClient() {
  const [certificateYear, setCertificateYear] = useState('2026');
  const [competitorSubject, setCompetitorSubject] = useState('Your Competition Certificate Is Ready');
  const [competitorBody, setCompetitorBody] = useState(
    'Hello {{name}},\n\nYour certificate is ready. Use this link to claim it:\n{{link}}'
  );
  const [coachSubject, setCoachSubject] = useState('Coach Feedback Survey');
  const [coachBody, setCoachBody] = useState(
    'Hello {{name}},\n\nPlease share your feedback using this link:\n{{link}}'
  );

  // Optional ID scoping. One UUID per line — empty = "all eligible".
  // Applied to both dry-run and live actions so you can verify the exact
  // target set before a real send.
  const [competitorIds, setCompetitorIds] = useState('');
  const [coachIds, setCoachIds] = useState('');

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RouteResult>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  function parseIds(raw: string): string[] | undefined {
    const ids = raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return ids.length > 0 ? ids : undefined;
  }

  async function runAction(action: string, fn: () => Promise<Record<string, unknown>>) {
    setLoadingAction(action);
    setLastError(null);
    try {
      const result = await fn();
      setLastResult(result);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingAction(null);
    }
  }

  function parseYear() {
    const parsed = Number.parseInt(certificateYear, 10);
    return Number.isFinite(parsed) ? parsed : 2026;
  }

  return (
    <div className="space-y-6">
      <Card className="border-meta-border bg-meta-dark/60">
        <CardHeader>
          <CardTitle className="text-meta-light">Certificate Generation</CardTitle>
          <CardDescription>
            Dry-run the active competitor set, then generate the per-student PDF copies into storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label htmlFor="certificate-year">Certificate year</Label>
            <Input
              id="certificate-year"
              value={certificateYear}
              onChange={(event) => setCertificateYear(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="competitor-ids-generate">Restrict to competitor IDs (optional)</Label>
            <Textarea
              id="competitor-ids-generate"
              placeholder="One UUID per line. Leave blank to target all eligible competitors."
              value={competitorIds}
              onChange={(event) => setCompetitorIds(event.target.value)}
              className="min-h-[72px] font-mono text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() =>
                runAction('generate-dry', () =>
                  postJson('/api/admin/certificates/generate', {
                    certificateYear: parseYear(),
                    competitorIds: parseIds(competitorIds),
                    dryRun: true,
                  })
                )
              }
              disabled={loadingAction !== null}
            >
              {loadingAction === 'generate-dry' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Dry Run Generate
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                runAction('generate-live', () =>
                  postJson('/api/admin/certificates/generate', {
                    certificateYear: parseYear(),
                    competitorIds: parseIds(competitorIds),
                  })
                )
              }
              disabled={loadingAction !== null}
            >
              {loadingAction === 'generate-live' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Generate Certificates
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-meta-border bg-meta-dark/60">
        <CardHeader>
          <CardTitle className="text-meta-light">Competitor Certificate Email</CardTitle>
          <CardDescription>
            Send claim links to competitors. The body supports <code>{'{{name}}'}</code> and <code>{'{{link}}'}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="competitor-subject">Subject</Label>
            <Input
              id="competitor-subject"
              value={competitorSubject}
              onChange={(event) => setCompetitorSubject(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="competitor-body">Body</Label>
            <Textarea
              id="competitor-body"
              value={competitorBody}
              onChange={(event) => setCompetitorBody(event.target.value)}
              className="min-h-[140px]"
            />
          </div>
          <div className="text-xs text-meta-muted">
            Uses the &quot;Restrict to competitor IDs&quot; list above. Leave blank to send to every eligible
            competitor.
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() =>
                runAction('send-competitor-dry', () =>
                  postJson('/api/admin/certificates/send', {
                    audience: 'competitor',
                    certificateYear: parseYear(),
                    ids: parseIds(competitorIds),
                    subject: competitorSubject,
                    body: competitorBody,
                    dryRun: true,
                  })
                )
              }
              disabled={loadingAction !== null}
            >
              {loadingAction === 'send-competitor-dry' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Dry Run Competitor Send
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                runAction('send-competitor-live', () =>
                  postJson('/api/admin/certificates/send', {
                    audience: 'competitor',
                    certificateYear: parseYear(),
                    ids: parseIds(competitorIds),
                    subject: competitorSubject,
                    body: competitorBody,
                  })
                )
              }
              disabled={loadingAction !== null}
            >
              {loadingAction === 'send-competitor-live' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send Competitor Emails
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-meta-border bg-meta-dark/60">
        <CardHeader>
          <CardTitle className="text-meta-light">Coach Feedback Email</CardTitle>
          <CardDescription>
            Send the coach feedback Fillout link using the existing coach email addresses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="coach-subject">Subject</Label>
            <Input
              id="coach-subject"
              value={coachSubject}
              onChange={(event) => setCoachSubject(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coach-body">Body</Label>
            <Textarea
              id="coach-body"
              value={coachBody}
              onChange={(event) => setCoachBody(event.target.value)}
              className="min-h-[140px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coach-ids">Restrict to coach profile IDs (optional)</Label>
            <Textarea
              id="coach-ids"
              placeholder="One UUID per line. Leave blank to target all coaches with an email on file."
              value={coachIds}
              onChange={(event) => setCoachIds(event.target.value)}
              className="min-h-[72px] font-mono text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() =>
                runAction('send-coach-dry', () =>
                  postJson('/api/admin/certificates/send', {
                    audience: 'coach',
                    ids: parseIds(coachIds),
                    subject: coachSubject,
                    body: coachBody,
                    dryRun: true,
                  })
                )
              }
              disabled={loadingAction !== null}
            >
              {loadingAction === 'send-coach-dry' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Dry Run Coach Send
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                runAction('send-coach-live', () =>
                  postJson('/api/admin/certificates/send', {
                    audience: 'coach',
                    ids: parseIds(coachIds),
                    subject: coachSubject,
                    body: coachBody,
                  })
                )
              }
              disabled={loadingAction !== null}
            >
              {loadingAction === 'send-coach-live' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send Coach Emails
            </Button>
          </div>
        </CardContent>
      </Card>

      <CertificatesSubmissionsPanel />

      <Card className="border-meta-border bg-meta-dark/60">
        <CardHeader>
          <CardTitle className="text-meta-light">Last Result</CardTitle>
          <CardDescription>
            Review the last route response before doing anything live.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lastError ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {lastError}
            </div>
          ) : null}
          <pre className="overflow-x-auto rounded-md border border-meta-border bg-black/30 p-4 text-xs text-meta-light">
            {JSON.stringify(lastResult, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
