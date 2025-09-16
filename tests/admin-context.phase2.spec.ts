import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

const COACH_A_ID = process.env.COACH_A_ID as string
const COACH_B_ID = process.env.COACH_B_ID as string

test.describe('Phase 2 — Admin coach context write enforcement', () => {
  test.beforeAll(() => {
    if (!COACH_A_ID || !COACH_B_ID) {
      throw new Error('Missing COACH_A_ID or COACH_B_ID in env')
    }
  })

  const rand = () => Math.random().toString(36).slice(2, 8)

  test('All-coaches blocks writes; acting as coach allows; cross-coach blocked', async ({ request }) => {
    const dbg = async (res: any, label: string) => {
      const status = res.status()
      let body: any = null
      try { body = await res.json() } catch {}
      // eslint-disable-next-line no-console
      console.log(`DEBUG ${label}:`, { status, body })
    }
    // All-coaches (clear context)
    let res = await request.post('/api/admin/context', { data: { coach_id: null } })
    if (!res.ok()) await dbg(res, 'clear-context')
    expect(res.ok()).toBeTruthy()

    // Create team should be blocked
    res = await request.post('/api/teams/create', { data: { name: `canary-${rand()}` } })
    expect([403, 404]).toContain(res.status())

    // Set context to Coach A
    res = await request.post('/api/admin/context', { data: { coach_id: COACH_A_ID } })
    if (!res.ok()) await dbg(res, 'set-context')
    expect(res.ok()).toBeTruthy()

    // Create team under Coach A
    res = await request.post('/api/teams/create', { data: { name: `canary-${rand()}` } })
    expect(res.ok()).toBeTruthy()
    const { team } = await res.json()
    const teamId = team.id as string

    // Create competitor under Coach A
    res = await request.post('/api/competitors/create', { data: { first_name: 'Canary', last_name: rand(), division: 'high_school' } })
    expect(res.ok()).toBeTruthy()
    const { competitor } = await res.json()
    const competitorId = competitor.id as string

    // Add member to team
    res = await request.post(`/api/teams/${teamId}/members/add`, { data: { competitor_id: competitorId } })
    expect(res.ok()).toBeTruthy()

    // Find a competitor for Coach B (if available)
    res = await request.get('/api/competitors')
    expect(res.ok()).toBeTruthy()
    const list = await res.json()
    const compB = (list.competitors || []).find((c: any) => c.coach_id === COACH_B_ID)

    if (compB) {
      // Toggle active on Coach B competitor should be blocked
      res = await request.put(`/api/competitors/${compB.id}/toggle-active`, { data: { is_active: false } })
      expect([403, 404]).toContain(res.status())

      // Add Coach B competitor to Coach A team should be blocked
      res = await request.post(`/api/teams/${teamId}/members/add`, { data: { competitor_id: compB.id } })
      expect([403, 404]).toContain(res.status())
    }

    // Cleanup: remove member and delete team
    res = await request.delete(`/api/teams/${teamId}/members/${competitorId}`)
    expect(res.ok()).toBeTruthy()
    res = await request.delete(`/api/teams/${teamId}`)
    expect(res.ok()).toBeTruthy()
  })
})
