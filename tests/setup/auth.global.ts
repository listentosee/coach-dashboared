import { FullConfig } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

dotenv.config()

export default async function globalSetup(_config: FullConfig) {
  const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

  if (!BASE_URL || !SUPABASE_URL || !SUPABASE_ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Missing required env: BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD')
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data, error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  if (error || !data?.session) throw new Error('Admin login failed: ' + (error?.message || 'unknown'))

  const url = new URL(BASE_URL)
  const domain = url.hostname
  const secure = url.protocol === 'https:'

  const storageState = {
    cookies: [
      {
        name: 'sb-access-token',
        value: data.session.access_token,
        domain,
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
        httpOnly: false,
        secure,
        sameSite: 'Lax' as const,
      },
      {
        name: 'sb-refresh-token',
        value: data.session.refresh_token,
        domain,
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
        httpOnly: false,
        secure,
        sameSite: 'Lax' as const,
      },
    ],
    origins: [],
  }

  const outDir = path.resolve(process.cwd(), 'playwright/.auth')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'admin.json'), JSON.stringify(storageState, null, 2), 'utf8')
}
