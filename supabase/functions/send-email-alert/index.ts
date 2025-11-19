const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailAlertRequest {
  to: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
  fromEmail?: string;
  fromName?: string;
  coachId?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
      throw new Error('Service role key is not configured for send-email-alert');
    }

    const apiKey = Deno.env.get('SENDGRID_API_KEY');
    const defaultTemplateId = Deno.env.get('SENDGRID_TEMPLATE_ID');
    const defaultFromEmail = Deno.env.get('SENDGRID_FROM_EMAIL');
    const defaultFromName = Deno.env.get('SENDGRID_FROM_NAME') ?? 'Coach Dashboard';
    const sandboxMode = Deno.env.get('SENDGRID_SANDBOX_MODE') === 'true';

    if (!apiKey) {
      throw new Error('SENDGRID_API_KEY is not configured');
    }
    if (!defaultFromEmail) {
      throw new Error('SENDGRID_FROM_EMAIL is not configured');
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const expectedHeader = `Bearer ${serviceRoleKey}`;
    if (authHeader !== expectedHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: EmailAlertRequest = await req.json();
    if (!body?.to) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: to' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const templateId = body.templateId || defaultTemplateId;
    if (!templateId) {
      return new Response(
        JSON.stringify({ error: 'Missing SendGrid template. Provide templateId in request or set SENDGRID_TEMPLATE_ID.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: Record<string, unknown> = {
      personalizations: [
        {
          to: [{ email: body.to }],
          dynamic_template_data: body.templateData ?? {},
        },
      ],
      from: {
        email: body.fromEmail || defaultFromEmail,
        name: body.fromName || defaultFromName,
      },
      template_id: templateId,
    };

    if (sandboxMode) {
      payload.mail_settings = {
        sandbox_mode: { enable: true },
      };
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SendGrid API error:', { status: response.status, errorText, coachId: body.coachId });
      return new Response(
        JSON.stringify({
          success: false,
          error: `SendGrid API error: ${response.status}`,
          details: errorText,
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('SendGrid email sent', {
      coachId: body.coachId ?? 'unknown',
      templateId,
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error sending email alert:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || 'Failed to send email alert',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
