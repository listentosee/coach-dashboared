import { createSmsProvider } from '../_shared/sms/service.ts'

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SMSRequest {
  phoneNumber: string
  message: string
  coachId?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceRoleKey) {
      throw new Error('Service role key is not configured for send-sms-notification')
    }

    // Verify authorization
    const authHeader = req.headers.get('Authorization') ?? ''
    const expectedHeader = `Bearer ${serviceRoleKey}`

    if (authHeader !== expectedHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { phoneNumber, message, coachId }: SMSRequest = await req.json()

    if (!phoneNumber || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: phoneNumber and message' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Validate phone number format (must start with +)
    if (!phoneNumber.startsWith('+')) {
      return new Response(
        JSON.stringify({ error: 'Phone number must start with + and include country code' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const providerSetting = (Deno.env.get('SMS_PROVIDER') || '').toLowerCase()

    if (!providerSetting || providerSetting === 'disabled') {
      console.warn('SMS provider disabled or not configured. Skipping send.')
      return new Response(
        JSON.stringify({
          success: false,
          disabled: true,
          error: 'SMS provider is disabled or not configured',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Get SMS provider (Twilio or AWS SNS based on SMS_PROVIDER env var)
    console.log('Creating SMS provider, SMS_PROVIDER env:', providerSetting)
    let smsProvider
    try {
      smsProvider = createSmsProvider()
    } catch (providerError) {
      console.error('Failed to initialize SMS provider:', providerError)
      return new Response(
        JSON.stringify({
          success: false,
          error: providerError instanceof Error ? providerError.message : 'Failed to initialize SMS provider',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    console.log('SMS provider created:', smsProvider.getName())

    // Send SMS via the configured provider
    console.log('Sending SMS...')
    const result = await smsProvider.sendSms(phoneNumber, message)
    console.log('SMS send result:', { success: result.success, provider: result.provider, error: result.error })

    if (!result.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: result.error || 'Failed to send SMS',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // FERPA compliance: Do NOT log phone numbers or message content
    // Only log the message ID, provider, and coach ID for audit purposes
    console.log('SMS sent successfully:', {
      messageId: result.messageId,
      provider: result.provider,
      coachId: coachId ?? 'unknown',
      // Phone number NOT logged to comply with FERPA privacy requirements
    })

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.messageId,
        provider: result.provider,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error sending SMS:', error)
    console.error('Error stack:', error.stack)
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      cause: error.cause,
    })

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to send SMS',
        details: error.stack || 'No stack trace available',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
