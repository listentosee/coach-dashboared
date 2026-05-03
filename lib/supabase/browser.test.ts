// lib/supabase/browser.test.ts
// Unit tests for the @supabase/ssr browser wrapper. Construction is safe in
// node env because @supabase/ssr defers DOM access (document.cookie) to the
// first request, not to the constructor.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

describe('lib/supabase/browser', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('createBrowserClient returns a usable Supabase client', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
    const { createBrowserClient } = await import('./browser')
    const client = createBrowserClient()
    expect(client).toBeDefined()
    expect(typeof client.from).toBe('function')
    expect(client.auth).toBeDefined()
  })

  it('createBrowserClient falls back to ANON_KEY when PUBLISHABLE_KEY is unset', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJlegacyanon'
    const { createBrowserClient } = await import('./browser')
    const client = createBrowserClient()
    expect(client).toBeDefined()
  })
})
