import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createHmac } from 'crypto'

export const dynamic = 'force-dynamic'

function toBase64Url(buffer: Buffer) {
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function resolveRedirect(rawRedirect: string | null) {
  if (!rawRedirect) return ''

  const trimmed = rawRedirect.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('/')) {
    return trimmed
  }

  const allowed = (process.env.CYBERNUGGETS_ALLOWED_REDIRECT_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (!allowed.length) {
    throw new Error('Absolute redirect not allowed without CYBERNUGGETS_ALLOWED_REDIRECT_ORIGINS')
  }

  let candidate: URL
  try {
    candidate = new URL(trimmed)
  } catch (error) {
    throw new Error('Invalid redirect URL provided')
  }

  if (!allowed.includes(candidate.origin)) {
    throw new Error('Redirect origin not permitted')
  }

  return trimmed
}

function buildDisplayName(profile?: { first_name?: string | null; last_name?: string | null }, userName?: string | null, email?: string | null) {
  const parts: string[] = []
  if (profile?.first_name) parts.push(profile.first_name.trim())
  if (profile?.last_name) parts.push(profile.last_name.trim())

  const fullName = parts.filter(Boolean).join(' ').trim()
  if (fullName) return fullName

  if (userName?.trim()) return userName.trim()

  return email ?? 'Coach'
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    }

    const email = user.email?.trim().toLowerCase()
    if (!email) {
      return NextResponse.json({ error: 'User email missing' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single()

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('CyberNuggets profile lookup error', profileError)
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
    }

    const partnerAppId = process.env.CYBERNUGGETS_PARTNER_APP_ID
    const secret = process.env.CYBERNUGGETS_PARTNER_SECRET

    if (!partnerAppId || !secret) {
      console.error('CyberNuggets SSO missing configuration')
      return NextResponse.json({ error: 'CyberNuggets SSO not configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }

    const baseUrl = process.env.CYBERNUGGETS_SSO_BASE_URL || 'https://nuggets.cyber-guild.org'
    let target: URL
    try {
      target = new URL('/auth/partner-sso', baseUrl)
    } catch (error) {
      console.error('Invalid CYBERNUGGETS_SSO_BASE_URL value', error)
      return NextResponse.json({ error: 'CyberNuggets SSO misconfigured' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
    }

    let redirectValue: string
    try {
      redirectValue = resolveRedirect(req.nextUrl.searchParams.get('redirect'))
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : 'Invalid redirect parameter'
      return NextResponse.json({ error: message }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }

    const name = buildDisplayName(
      profile ?? undefined,
      typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null,
      email
    )

    const ts = Math.floor(Date.now() / 1000)
    const canonical = [email, name, partnerAppId, ts, redirectValue].join('|')
    const sig = toBase64Url(createHmac('sha256', secret).update(canonical, 'utf8').digest())

    target.searchParams.set('email', email)
    target.searchParams.set('name', name)
    target.searchParams.set('partnerAppId', partnerAppId)
    target.searchParams.set('ts', ts.toString())
    target.searchParams.set('sig', sig)
    if (redirectValue) {
      target.searchParams.set('redirect', redirectValue)
    }

    return NextResponse.json({ url: target.toString(), ts }, {
      headers: {
        'Cache-Control': 'no-store'
      }
    })
  } catch (error) {
    console.error('CyberNuggets SSO error', error)
    return NextResponse.json({ error: 'Failed to start CyberNuggets session' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
