'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CertificatesSubmissionsPanel } from './certificates-submissions-panel';

type RouteResult = Record<string, unknown> | null;

// Templates the user types into the four subject/body boxes are persisted to
// localStorage so they survive page reloads. We keep the canonical defaults
// here so a "Reset to default" affordance can put each card back to its
// shipped wording in one click. Bump the storage key version if the default
// shape changes incompatibly. The key intentionally lives client-side: this
// admin tool is single-operator in practice, and persisting per-browser is
// enough — if you need shared templates across admins / devices, swap this
// for a DB-backed admin_email_templates table.
const TEMPLATE_DEFAULTS: {
  competitorSubject: string;
  competitorBody: string;
  coachSubject: string;
  coachBody: string;
} = {
  competitorSubject: 'Your Competition Certificate Is Ready',
  competitorBody:
    'Hi {{name}},\n\nYour competition certificate is ready. [Claim your certificate]({{link}}) to complete a short survey and download your PDF.\n\nThanks,\nCyber-Guild',
  coachSubject: 'Coach Feedback Survey',
  coachBody:
    'Hi {{name}},\n\nPlease share your feedback by completing our short [Coach Feedback Survey]({{link}}).\n\nThanks,\nCyber-Guild',
};

const TEMPLATE_STORAGE_KEY = 'cert-dashboard:email-templates:v1';

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
  const [competitorSubject, setCompetitorSubject] = useState(TEMPLATE_DEFAULTS.competitorSubject);
  const [competitorBody, setCompetitorBody] = useState(TEMPLATE_DEFAULTS.competitorBody);
  const [coachSubject, setCoachSubject] = useState(TEMPLATE_DEFAULTS.coachSubject);
  const [coachBody, setCoachBody] = useState(TEMPLATE_DEFAULTS.coachBody);

  // Optional ID scoping. One UUID per line — empty = "all eligible".
  // Applied to both dry-run and live actions so you can verify the exact
  // target set before a real send.
  const [competitorIds, setCompetitorIds] = useState('');
  const [coachIds, setCoachIds] = useState('');

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RouteResult>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // `templatesHydrated` gates the save effect so it can't fire with the
  // hardcoded defaults on first mount and clobber whatever the admin had
  // previously saved. We can't read localStorage in useState initializers
  // because this component renders on the server before hydrating on the
  // client.
  const [templatesHydrated, setTemplatesHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<typeof TEMPLATE_DEFAULTS>;
        if (typeof parsed.competitorSubject === 'string') setCompetitorSubject(parsed.competitorSubject);
        if (typeof parsed.competitorBody === 'string') setCompetitorBody(parsed.competitorBody);
        if (typeof parsed.coachSubject === 'string') setCoachSubject(parsed.coachSubject);
        if (typeof parsed.coachBody === 'string') setCoachBody(parsed.coachBody);
      }
    } catch {
      // Corrupt JSON or storage disabled — fall back to defaults silently.
    }
    setTemplatesHydrated(true);
  }, []);

  useEffect(() => {
    if (!templatesHydrated) return;
    try {
      window.localStorage.setItem(
        TEMPLATE_STORAGE_KEY,
        JSON.stringify({ competitorSubject, competitorBody, coachSubject, coachBody }),
      );
    } catch {
      // Quota exceeded or storage disabled — best effort only.
    }
  }, [templatesHydrated, competitorSubject, competitorBody, coachSubject, coachBody]);

  function resetCompetitorTemplate() {
    setCompetitorSubject(TEMPLATE_DEFAULTS.competitorSubject);
    setCompetitorBody(TEMPLATE_DEFAULTS.competitorBody);
  }

  function resetCoachTemplate() {
    setCoachSubject(TEMPLATE_DEFAULTS.coachSubject);
    setCoachBody(TEMPLATE_DEFAULTS.coachBody);
  }

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
            Send claim links to competitors. The body supports <strong>Markdown</strong> (e.g.
            <code>{'[Claim]({{link}})'}</code>) or raw HTML, plus the tokens
            <code>{'{{name}}'}</code> and <code>{'{{link}}'}</code>.
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
              onClick={() =>
                runAction('resend-competitor-incomplete-dry', () =>
                  postJson('/api/admin/certificates/send', {
                    audience: 'competitor',
                    certificateYear: parseYear(),
                    ids: parseIds(competitorIds),
                    subject: competitorSubject,
                    body: competitorBody,
                    onlyIncomplete: true,
                    dryRun: true,
                  })
                )
              }
              disabled={loadingAction !== null}
            >
              {loadingAction === 'resend-competitor-incomplete-dry' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Dry Run Incomplete Resend
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
            <Button
              variant="secondary"
              onClick={() =>
                runAction('resend-competitor-incomplete-live', () =>
                  postJson('/api/admin/certificates/send', {
                    audience: 'competitor',
                    certificateYear: parseYear(),
                    ids: parseIds(competitorIds),
                    subject: competitorSubject,
                    body: competitorBody,
                    onlyIncomplete: true,
                  })
                )
              }
              disabled={loadingAction !== null}
              title="Resend only to competitors whose certificate survey is not complete."
            >
              {loadingAction === 'resend-competitor-incomplete-live' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Resend Incomplete Only
            </Button>
            <Button
              variant="ghost"
              onClick={resetCompetitorTemplate}
              disabled={loadingAction !== null}
              title="Restore the default subject and body for competitor emails."
            >
              Reset to default
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-meta-border bg-meta-dark/60">
        <CardHeader>
          <CardTitle className="text-meta-light">Coach Feedback Message</CardTitle>
          <CardDescription>
            Send the coach feedback Fillout link by email or as an in-app message from the currently
            logged-in admin. Email delivery prefers <code>email_alert_address</code> when set; falls
            back to profile email. The body supports <strong>Markdown</strong> or HTML for email, and
            Markdown for in-app messages, plus <code>{'{{name}}'}</code> and <code>{'{{link}}'}</code>.
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
                    deliveryMethod: 'email',
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
              onClick={() =>
                runAction('resend-coach-incomplete-dry', () =>
                  postJson('/api/admin/certificates/send', {
                    audience: 'coach',
                    deliveryMethod: 'email',
                    ids: parseIds(coachIds),
                    subject: coachSubject,
                    body: coachBody,
                    onlyIncomplete: true,
                    dryRun: true,
                  })
                )
              }
              disabled={loadingAction !== null}
            >
              {loadingAction === 'resend-coach-incomplete-dry' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Dry Run Incomplete Coach Email
            </Button>
            <Button
              onClick={() =>
                runAction('send-coach-in-app-dry', () =>
                  postJson('/api/admin/certificates/send', {
                    audience: 'coach',
                    deliveryMethod: 'in_app',
                    ids: parseIds(coachIds),
                    subject: coachSubject,
                    body: coachBody,
                    onlyIncomplete: true,
                    dryRun: true,
                  })
                )
              }
              disabled={loadingAction !== null}
            >
              {loadingAction === 'send-coach-in-app-dry' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Dry Run Coach In-App
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                runAction('send-coach-live', () =>
                  postJson('/api/admin/certificates/send', {
                    audience: 'coach',
                    deliveryMethod: 'email',
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
            <Button
              variant="secondary"
              onClick={() =>
                runAction('resend-coach-incomplete-live', () =>
                  postJson('/api/admin/certificates/send', {
                    audience: 'coach',
                    deliveryMethod: 'email',
                    ids: parseIds(coachIds),
                    subject: coachSubject,
                    body: coachBody,
                    onlyIncomplete: true,
                  })
                )
              }
              disabled={loadingAction !== null}
              title="Resend only to coaches who do not have a coach survey response recorded."
            >
              {loadingAction === 'resend-coach-incomplete-live' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Email Incomplete Only
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                runAction('send-coach-in-app-live', () =>
                  postJson('/api/admin/certificates/send', {
                    audience: 'coach',
                    deliveryMethod: 'in_app',
                    ids: parseIds(coachIds),
                    subject: coachSubject,
                    body: coachBody,
                    onlyIncomplete: true,
                  })
                )
              }
              disabled={loadingAction !== null}
              title="Send an in-app survey message from the currently logged-in admin to coaches who have not completed the survey."
            >
              {loadingAction === 'send-coach-in-app-live' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              In-App Incomplete Only
            </Button>
            <Button
              variant="ghost"
              onClick={resetCoachTemplate}
              disabled={loadingAction !== null}
              title="Restore the default subject and body for coach emails."
            >
              Reset to default
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
