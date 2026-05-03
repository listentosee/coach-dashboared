// lib/config/index.test.ts
// Unit tests for the config.supabase.secretKey resolver (Phase A, Task 1).
// Runs in vitest's default node environment.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'

describe('config.supabase.secretKey resolver', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    delete process.env.SUPABASE_SECRET_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('prefers SUPABASE_SECRET_KEY when both are set', async () => {
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_new'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJlegacy'
    const { config } = await import('./index')
    expect(config.supabase.secretKey).toBe('sb_secret_new')
  })

  it('falls back to SUPABASE_SERVICE_ROLE_KEY when SUPABASE_SECRET_KEY is unset', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJlegacy'
    const { config } = await import('./index')
    expect(config.supabase.secretKey).toBe('eyJlegacy')
  })

  it('returns empty string when neither is set', async () => {
    const { config } = await import('./index')
    expect(config.supabase.secretKey).toBe('')
  })
})
