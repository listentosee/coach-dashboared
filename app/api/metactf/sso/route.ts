import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createHmac } from 'crypto'

export const dynamic = 'force-dynamic'

const DEFAULT_SOURCE = 'syned'
const DEFAULT_CONNECT_URL = 'https://app.metactf.com/connect'

function toBase64Url(value: Buffer | string) {
  const buffer = typeof value === 'string' ? Buffer.from(value) : value
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function signJwt(payload: Record<string, unknown>, secret: string) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = toBase64Url(JSON.stringify(header))
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = toBase64Url(
    createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`, 'utf8').digest()
  )

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

function splitFullName(fullName: string | null | undefined) {
  if (!fullName) return { firstName: '', lastName: '' }
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
}

export async function GET() {
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
      console.error('MetaCTF SSO profile lookup error', profileError)
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
    }

    const fullName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null
    const fallback = splitFullName(fullName)

    const firstName =
      profile?.first_name?.trim() ||
      (typeof user.user_metadata?.first_name === 'string' ? user.user_metadata.first_name.trim() : '') ||
      fallback.firstName
    const lastName =
      profile?.last_name?.trim() ||
      (typeof user.user_metadata?.last_name === 'string' ? user.user_metadata.last_name.trim() : '') ||
      fallback.lastName

    const secret = process.env.GAME_PLATFORM_SSO_KEY
    const source = process.env.METACTF_SSO_SOURCE || DEFAULT_SOURCE
    const connectUrl = process.env.METACTF_SSO_URL || DEFAULT_CONNECT_URL

    if (!secret) {
      console.error('MetaCTF SSO missing secret')
      return NextResponse.json({ error: 'MetaCTF SSO not configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }

    let target: URL
    try {
      target = new URL(connectUrl)
    } catch (error) {
      console.error('Invalid METACTF_SSO_URL value', error)
      return NextResponse.json({ error: 'MetaCTF SSO misconfigured' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
    }

    const jwt = signJwt(
      {
        email,
        firstName,
        lastName,
      },
      secret
    )

    target.searchParams.set('source', source)
    target.searchParams.set('jwt', jwt)

    const response = NextResponse.redirect(target.toString(), 302)
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('MetaCTF SSO error', error)
    return NextResponse.json({ error: 'Failed to start MetaCTF session' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
