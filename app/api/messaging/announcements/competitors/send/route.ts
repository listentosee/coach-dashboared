import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { marked } from 'marked';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { resolveRecipients } from '@/lib/messaging/competitor-announcement';
import { enqueueJob } from '@/lib/jobs/queue';

// ---------------------------------------------------------------------------
// Request body schema
// ---------------------------------------------------------------------------

const requestBodySchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  dryRun: z.boolean().optional(),
  coachId: z.string().uuid().optional(),
  audience: z.enum(['game_platform', 'all']).optional(),
});

// ---------------------------------------------------------------------------
// Configure marked for GFM (GitHub Flavored Markdown)
// ---------------------------------------------------------------------------

marked.use({ gfm: true, breaks: true });

// ---------------------------------------------------------------------------
// POST /api/messaging/announcements/competitors/send
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    // ----- Auth -----
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = await isUserAdmin(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ----- Validate request body -----
    const rawBody = await req.json();
    const parsed = requestBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { subject, body: markdownBody, dryRun, coachId, audience } = parsed.data;

    // ----- Convert markdown to HTML -----
    const bodyHtml = await marked.parse(markdownBody);

    // ----- Service role client (reads across all coaches' competitors) -----
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceRoleKey || !serviceUrl) {
      console.error('[competitor-announcement] Missing service role environment variables');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const serviceClient = createClient(serviceUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // ----- Resolve recipients -----
    const { recipients, skipped } = await resolveRecipients(serviceClient, { coachId, audience });

    // Build skipped-reason summary (no PII — just counts by reason)
    const skippedReasons: Record<string, number> = {};
    for (const s of skipped) {
      skippedReasons[s.reason] = (skippedReasons[s.reason] ?? 0) + 1;
    }

    // ----- Dry run: return counts without persisting anything -----
    if (dryRun) {
      return NextResponse.json({
        recipientCount: recipients.length,
        skippedCount: skipped.length,
        skippedReasons,
      });
    }

    // ----- Insert campaign row -----
    const { data: campaign, error: campaignError } = await serviceClient
      .from('competitor_announcement_campaigns')
      .insert({
        subject,
        body_markdown: markdownBody,
        body_html: bodyHtml,
        created_by: user.id,
        status: 'pending',
      })
      .select('id')
      .single();

    if (campaignError || !campaign) {
      console.error('[competitor-announcement] Failed to create campaign', campaignError?.message);
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
    }

    const campaignId = campaign.id;

    // ----- Insert recipient rows -----
    const recipientRows = recipients.map((r) => ({
      campaign_id: campaignId,
      competitor_id: r.competitorId,
      email: r.email,
      status: 'queued',
    }));

    if (recipientRows.length > 0) {
      const { error: recipientError } = await serviceClient
        .from('competitor_announcement_recipients')
        .insert(recipientRows);

      if (recipientError) {
        console.error('[competitor-announcement] Failed to insert recipients', recipientError.message);
        // Mark campaign as failed since we couldn't persist recipients
        await serviceClient
          .from('competitor_announcement_campaigns')
          .update({ status: 'failed' })
          .eq('id', campaignId);
        return NextResponse.json({ error: 'Failed to insert recipients' }, { status: 500 });
      }
    }

    // ----- Enqueue dispatch job -----
    await enqueueJob({
      taskType: 'competitor_announcement_dispatch',
      payload: { campaignId },
    });

    console.log(
      '[competitor-announcement] Campaign created',
      campaignId,
      'recipients:', recipients.length,
      'skipped:', skipped.length,
    );

    return NextResponse.json({
      campaignId,
      recipientCount: recipients.length,
      skippedCount: skipped.length,
      skippedReasons,
    });
  } catch (error: any) {
    console.error('[competitor-announcement] Unexpected error', error?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
