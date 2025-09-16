// Phase 2 Canary Test Runner (admin coach context write enforcement)
// Usage:
//   BASE_URL="https://your-app.vercel.app" \
//   SUPABASE_URL="https://xxxx.supabase.co" \
//   SUPABASE_ANON_KEY="..." \
//   ADMIN_EMAIL="admin@example.com" \
//   ADMIN_PASSWORD="..." \
//   COACH_A_ID="uuid-of-coach-a" \
//   COACH_B_ID="uuid-of-coach-b" \
//   node scripts/canary-phase2.mjs

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

// Auto-load .env from project root (does not override already-set envs)
try {
  const envPath = path.resolve(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const l = line.trim()
      if (!l || l.startsWith('#')) continue
      const eq = l.indexOf('=')
      if (eq === -1) continue
      const key = l.slice(0, eq).trim()
      let val = l.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (process.env[key] == null) process.env[key] = val
    }
  }
} catch {}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const COACH_A_ID = process.env.COACH_A_ID
const COACH_B_ID = process.env.COACH_B_ID

if (!BASE_URL || !SUPABASE_URL || !SUPABASE_ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD || !COACH_A_ID || !COACH_B_ID) {
  console.error('Missing required env. See header usage block.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Simple cookie jar for one origin
let cookieJar = {}
let accessToken = null
const setCookieFromResponse = (res) => {
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) return
  // Split multiple cookies
  const parts = setCookie.split(/,(?=[^;]+;)/)
  for (const c of parts) {
    const [pair] = c.trim().split(';')
    const [k, v] = pair.split('=')
    cookieJar[k.trim()] = v
  }
}
const cookieHeader = () => Object.entries(cookieJar).map(([k,v]) => `${k}=${v}`).join('; ')

async function loginAsAdmin() {
  const { data, error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  if (error || !data?.session) throw new Error('Admin login failed: ' + (error?.message || 'unknown'))
  // Seed cookies used by nextjs auth helpers
  cookieJar['sb-access-token'] = data.session.access_token
  cookieJar['sb-refresh-token'] = data.session.refresh_token
  accessToken = data.session.access_token
}

async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      Cookie: cookieHeader(),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  })
  setCookieFromResponse(res)
  return res
}

async function setAdminContext(coachId) {
  const res = await api('/api/admin/context', { method: 'POST', body: JSON.stringify({ coach_id: coachId }) })
  if (!res.ok) throw new Error('Failed to set admin context: ' + res.status)
}

function expectOk(res, label) {
  if (!res.ok) throw new Error(`${label} failed: ${res.status}`)
}

function expectForbiddenOrNotFound(res, label) {
  if (res.ok) throw new Error(`${label} should be forbidden, got ${res.status}`)
  if (![403,404].includes(res.status)) throw new Error(`${label} expected 403/404, got ${res.status}`)
}

function randSuffix() { return Math.random().toString(36).slice(2,8) }

async function run() {
  console.log('Logging in as admin...')
  await loginAsAdmin()

  console.log('Phase 2 Canary: All-coaches mode blocks writes')
  await setAdminContext(null)
  // Try creating a team (should 403)
  let res = await api('/api/teams/create', { method: 'POST', body: JSON.stringify({ name: `canary-${randSuffix()}` }) })
  expectForbiddenOrNotFound(res, 'Create team in All-coaches')

  console.log('Set context to Coach A and perform allowed writes')
  await setAdminContext(COACH_A_ID)

  // Create team under Coach A
  res = await api('/api/teams/create', { method: 'POST', body: JSON.stringify({ name: `canary-${randSuffix()}` }) })
  expectOk(res, 'Create team (Coach A)')
  const { team } = await res.json()
  const teamId = team.id

  // Create competitor under Coach A
  res = await api('/api/competitors/create', { method: 'POST', body: JSON.stringify({ first_name: 'Canary', last_name: randSuffix(), division: 'high_school' }) })
  expectOk(res, 'Create competitor (Coach A)')
  const { competitor, profileUpdateUrl } = await res.json()
  const competitorId = competitor.id

  // Add member to team (Coach A)
  res = await api(`/api/teams/${teamId}/members/add`, { method: 'POST', body: JSON.stringify({ competitor_id: competitorId }) })
  expectOk(res, 'Add member (Coach A)')

  // Fetch a competitor belonging to Coach B for negative checks via API list
  res = await api('/api/competitors')
  expectOk(res, 'List competitors (for negative pick)')
  const listJson = await res.json()
  const compB = (listJson.competitors || []).find(c => c.coach_id === COACH_B_ID)
  if (!compB) console.warn('No competitor found for Coach B; skipping some negative checks')

  if (compB) {
    // Try toggle active on Coach B competitor
    res = await api(`/api/competitors/${compB.id}/toggle-active`, { method: 'PUT', body: JSON.stringify({ is_active: false }) })
    expectForbiddenOrNotFound(res, 'Toggle active on Coach B competitor')

    // Try add Coach B competitor to Coach A team
    res = await api(`/api/teams/${teamId}/members/add`, { method: 'POST', body: JSON.stringify({ competitor_id: compB.id }) })
    expectForbiddenOrNotFound(res, 'Add Coach B competitor to Coach A team')
  }

  // Remove member and delete team (Coach A)
  res = await api(`/api/teams/${teamId}/members/${competitorId}`, { method: 'DELETE' })
  expectOk(res, 'Remove member (Coach A)')
  res = await api(`/api/teams/${teamId}`, { method: 'DELETE' })
  expectOk(res, 'Delete team (Coach A)')

  // Clear context and ensure writes are blocked again
  await setAdminContext(null)
  res = await api('/api/competitors/create', { method: 'POST', body: JSON.stringify({ first_name: 'X', last_name: 'Y', division: 'high_school' }) })
  expectForbiddenOrNotFound(res, 'Create competitor in All-coaches')

  console.log('Phase 2 Canary: PASS')
}

run().catch((e) => { console.error('Canary failed:', e); process.exit(1) })
