/**
 * Instant SMS Notification Service
 *
 * Subscribes to Supabase Realtime for new messages and sends instant SMS
 * notifications to admins with instant_sms_enabled = true
 */

import { createClient } from '@supabase/supabase-js'

// NOTE: All SMS delivery goes through the Supabase Edge function
// (send-sms-notification). This worker never instantiates providers
// or handles raw credentials; it simply calls the gateway.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const preferredBaseUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_VERCEL_URL ||
  process.env.VERCEL_URL

const appBaseUrl = preferredBaseUrl
  ? preferredBaseUrl.startsWith('http')
    ? preferredBaseUrl
    : `https://${preferredBaseUrl}`
  : 'http://localhost:3000'

let subscription: any = null

export async function startInstantSmsService() {
  console.log('[instant-sms-service] startInstantSmsService() called')
  console.log('[instant-sms-service] NODE_ENV:', process.env.NODE_ENV)
  console.log('[instant-sms-service] SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('[instant-sms-service] SERVICE_ROLE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Don't start in development or if already running
  if (process.env.NODE_ENV === 'development') {
    console.log('[instant-sms-service] Running in development mode - starting anyway for testing')
    // Remove the return to allow it to run in development
  }

  if (subscription) {
    console.log('[instant-sms-service] Already running')
    return
  }

  console.log('[instant-sms-service] Starting Realtime subscription...')

  // Create Supabase client with service role (bypasses RLS)
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  // Subscribe to INSERT events on messages table
  subscription = supabase
    .channel('instant-sms-notifications')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      },
      async (payload) => {
        await handleNewMessage(payload.new as any)
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[instant-sms-service] ✅ Subscribed to message INSERTs')
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[instant-sms-service] ❌ Channel error, retrying...')
        // Retry logic could go here
      }
    })
}

async function handleNewMessage(message: {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}) {
  try {
    console.log('[instant-sms] New message:', message.id, 'in conversation:', message.conversation_id)

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Get conversation members (excluding sender)
    const { data: members, error: membersError } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', message.conversation_id)
      .neq('user_id', message.sender_id)

    if (membersError) {
      console.error('[instant-sms] Error fetching members:', membersError)
      return
    }

    if (!members || members.length === 0) {
      console.log('[instant-sms] No members found')
      return
    }

    const memberIds = members.map(m => m.user_id)

    // Get profiles for these members
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, first_name, email, mobile_number, role, instant_sms_enabled, email_alerts_enabled')
      .in('id', memberIds)

    if (profilesError) {
      console.error('[instant-sms] Error fetching profiles:', profilesError)
      return
    }

    // Get conversation type
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('type')
      .eq('id', message.conversation_id)
      .single()

    if (conversationError) {
      console.error('[instant-sms] Error fetching conversation:', conversationError)
      return
    }

    if (!profiles || profiles.length === 0) {
      console.log('[instant-sms] No profiles found')
      return
    }

    // Filter for admins with instant SMS enabled
    const eligibleRecipients = profiles.filter((profile: any) => {
      return (
        profile?.role === 'admin' &&
        profile?.instant_sms_enabled === true &&
        conversation?.type !== 'announcement' // Exclude announcements
      )
    })

    if (eligibleRecipients.length === 0) {
      console.log('[instant-sms] No eligible admin recipients')
      return
    }

    // Get sender name
    const { data: sender } = await supabase
      .from('profiles')
      .select('full_name, first_name, last_name, email')
      .eq('id', message.sender_id)
      .single()

    const senderName = sender?.full_name ||
      (sender?.first_name && sender?.last_name ? `${sender.first_name} ${sender.last_name}` : null) ||
      sender?.email ||
      'Someone'

    // Build message preview
    const preview = message.body.length > 60
      ? message.body.substring(0, 60) + '...'
      : message.body

    const smsMessage = `New message from ${senderName}:\n\n${preview}\n\nLog in to your dashboard to view and reply.`
    const emailTemplateData = (profile: any) => ({
      name: profile?.full_name || profile?.first_name || 'Admin',
      message_preview: preview,
      sender_name: senderName,
      dashboard_url: `${appBaseUrl.replace(/\/+$/, '')}/dashboard/messages`,
      messages: 1,
    })

    // Send SMS to each eligible recipient
    for (const profile of eligibleRecipients) {
      try {
        console.log('[instant-sms] Sending alerts to admin:', profile.id)

        if (profile.mobile_number) {
          const smsResponse = await fetch(`${supabaseUrl}/functions/v1/send-sms-notification`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phoneNumber: profile.mobile_number,
              message: smsMessage,
              coachId: profile.id,
            }),
          })

          const smsResult = await smsResponse.json()

          if (!smsResponse.ok || !smsResult.success) {
            console.error('[instant-sms] Failed to send SMS:', {
              status: smsResponse.status,
              ok: smsResponse.ok,
              smsResult,
              headers: Object.fromEntries(smsResponse.headers.entries()),
            })
          } else {
            console.log('[instant-sms] ✅ SMS sent successfully:', {
              recipient: profile.id,
              messageId: smsResult.messageId,
              provider: smsResult.provider,
            })
          }
        } else {
          console.log('[instant-sms] Admin missing mobile number, skipping SMS:', profile.id)
        }

        if (profile.email_alerts_enabled !== false && profile.email) {
          const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email-alert`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: profile.email,
              templateData: emailTemplateData(profile),
              coachId: profile.id,
            }),
          })

          const emailResult = await emailResponse.json().catch(() => ({}))

          if (!emailResponse.ok || emailResult?.success === false) {
            console.error('[instant-sms] Failed to send instant email:', {
              status: emailResponse.status,
              ok: emailResponse.ok,
              emailResult,
            })
          } else {
            console.log('[instant-sms] ✅ Instant email sent:', {
              recipient: profile.id,
              template: emailResult?.templateId ?? 'default',
            })
          }
        } else {
          console.log('[instant-sms] Admin has email alerts disabled or no email address, skipping instant email:', profile.id)
        }
      } catch (error) {
          console.error('[instant-sms] Error sending instant alerts to', profile.id, ':', error)
      }
    }
  } catch (error) {
    console.error('[instant-sms] Error handling message:', error)
  }
}

export async function stopInstantSmsService() {
  if (subscription) {
    console.log('[instant-sms-service] Stopping Realtime subscription...')
    await subscription.unsubscribe()
    subscription = null
  }
}
