import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import { type CampaignRow } from '@/components/dashboard/admin/campaign-status-table';
import { MailerDashboardClient } from './mailer-dashboard-client';

export const dynamic = 'force-dynamic';

export default async function MailerDashboardPage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard');
  }

  // Fetch coaches for the composer filter dropdown
  const { data: coaches } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'coach')
    .order('full_name');

  const coachRows = (coaches as { id: string; full_name: string | null; email: string | null }[] | null) ?? [];

  const serviceSupabase = getServiceRoleSupabaseClient();

  // Fetch drafts for the composer
  const { data: rawDrafts } = await serviceSupabase
    .from('competitor_announcement_campaigns')
    .select('id, subject, body_markdown, created_at')
    .eq('status', 'draft')
    .order('created_at', { ascending: false });

  const draftRows = (rawDrafts as { id: string; subject: string; body_markdown: string; created_at: string }[] | null) ?? [];

  // Fetch campaign history with stats (exclude drafts)
  const { data: rawCampaigns } = await serviceSupabase
    .from('competitor_announcement_campaigns')
    .select('id, subject, body_markdown, status, created_at, completed_at')
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(50);

  const campaigns: CampaignRow[] = [];
  for (const c of rawCampaigns ?? []) {
    const { data: stats } = await serviceSupabase.rpc('get_campaign_stats', {
      p_campaign_id: c.id,
    });
    const s = Array.isArray(stats) ? stats[0] : stats;
    campaigns.push({
      id: c.id,
      subject: c.subject,
      body_markdown: c.body_markdown ?? '',
      status: c.status,
      created_at: c.created_at,
      completed_at: c.completed_at,
      total_recipients: Number(s?.total_recipients ?? 0),
      total_queued: Number(s?.total_queued ?? 0),
      total_delivered: Number(s?.total_delivered ?? 0),
      total_bounced: Number(s?.total_bounced ?? 0),
      total_dropped: Number(s?.total_dropped ?? 0),
      total_blocked: Number(s?.total_blocked ?? 0),
      total_skipped: Number(s?.total_skipped ?? 0),
      total_opened: Number(s?.total_opened ?? 0),
      total_clicked: Number(s?.total_clicked ?? 0),
    });
  }

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-meta-light">Mailer Dashboard</h1>
        <p className="text-meta-muted mt-2">
          Compose and send email announcements to game platform competitors.
        </p>
      </div>

      <MailerDashboardClient coaches={coachRows} drafts={draftRows} campaigns={campaigns} />
    </div>
  );
}
