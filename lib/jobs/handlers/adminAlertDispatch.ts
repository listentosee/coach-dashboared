import type { JobHandler, JobPayloadMap } from '../types';

export const handleAdminAlertDispatch: JobHandler<'admin_alert_dispatch'> = async (job, { logger, supabase }) => {
  const payload: JobPayloadMap['admin_alert_dispatch'] = job.payload ?? {};
  const log = logger ?? console;

  try {
    const roles = payload.roles && payload.roles.length > 0 ? payload.roles : ['admin'];
    const allowSms = payload.allowSms ?? false;
    const force = payload.force ?? false;
    // Honor a window passed in by the job payload; fall back to a conservative default (60m) if none supplied.
    const windowMinutes = payload.windowMinutes ?? 60;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase configuration for admin alert dispatch');
    }

    // Fetch pending admin alerts grouped by recipient
    const { data: queueRows, error: queueError } = await supabase
      .from('admin_alert_queue')
      .select('recipient_id, message_id');

    if (queueError) {
      throw queueError;
    }

    if (!queueRows || queueRows.length === 0) {
      log.info('[notifications/admin] no queued alerts');
      return { status: 'succeeded', output: { sent: 0, processedRecipients: 0 } };
    }

    const grouped = queueRows.reduce<Record<string, string[]>>((acc, row: any) => {
      const list = acc[row.recipient_id] || [];
      list.push(row.message_id);
      acc[row.recipient_id] = list;
      return acc;
    }, {});

    const recipientIds = Object.keys(grouped);
    const { data: recipients, error: profileErr } = await supabase
      .from('profiles')
      .select('id, email, email_alert_address, full_name, first_name')
      .in('id', recipientIds);

    if (profileErr) throw profileErr;

    const sendResults = [] as Array<{ recipient: string; sent: boolean; count: number; error?: string }>;

    for (const recipient of recipients || []) {
      const pendingMessages = grouped[recipient.id] ?? [];
      const to = recipient.email_alert_address || recipient.email;
      if (!to) {
        sendResults.push({ recipient: recipient.id, sent: false, count: pendingMessages.length, error: 'Missing email' });
        continue;
      }

      const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email-alert`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to,
          templateData: {
            name: recipient.full_name || recipient.first_name || 'Admin',
            messages: pendingMessages.length,
          },
          coachId: recipient.id,
        }),
      });

      const ok = emailResponse.ok;
      if (ok) {
        // Delete processed rows for this recipient
        await supabase
          .from('admin_alert_queue')
          .delete()
          .eq('recipient_id', recipient.id)
          .in('message_id', pendingMessages);
      }

      sendResults.push({
        recipient: recipient.id,
        sent: ok,
        count: pendingMessages.length,
        error: ok ? undefined : `HTTP ${emailResponse.status}`,
      });
    }

    const sent = sendResults.filter((r) => r.sent).length;
    return {
      status: 'succeeded',
      output: { sent, processedRecipients: sendResults.length, results: sendResults },
    };
  } catch (error) {
    log.error('[notifications/admin] job failed', error);
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error processing admin alerts',
    };
  }
};
