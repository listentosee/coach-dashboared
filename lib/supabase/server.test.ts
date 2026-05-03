// lib/supabase/server.test.ts
// Unit tests for the @supabase/ssr server wrapper. Mocks next/headers to
// run in vitest's node environment without a real Next.js request context.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      getAll: () => [],
      set: vi.fn(),
    }),
  ),
}))

describe('lib/supabase/server', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    delete process.env.SUPABASE_SECRET_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('createServerClient returns a usable Supabase client', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
    const { createServerClient } = await import('./server')
    const client = createServerClient()
    expect(client).toBeDefined()
    expect(typeof client.from).toBe('function')
    expect(client.auth).toBeDefined()
  })

  it('createServerClient works with anon-key fallback when publishable is unset', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJlegacyanon'
    const { createServerClient } = await import('./server')
    const client = createServerClient()
    expect(client).toBeDefined()
  })

  it('getServiceRoleSupabaseClient returns a service-role client', async () => {
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'
    const { getServiceRoleSupabaseClient } = await import('./server')
    const client = getServiceRoleSupabaseClient()
    expect(client).toBeDefined()
    expect(client.auth.admin).toBeDefined()
  })

  it('getServiceRoleSupabaseClient falls back to legacy SUPABASE_SERVICE_ROLE_KEY', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJlegacysvc'
    const { getServiceRoleSupabaseClient } = await import('./server')
    const client = getServiceRoleSupabaseClient()
    expect(client).toBeDefined()
  })

  it('getServiceRoleSupabaseClient throws when no secret key is set', async () => {
    const { getServiceRoleSupabaseClient } = await import('./server')
    expect(() => getServiceRoleSupabaseClient()).toThrow(/Missing Supabase service role/)
  })
})
