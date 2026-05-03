// lib/supabase/server.ts
// Server-side Supabase wrappers — replaces @supabase/auth-helpers-nextjs
// (createServerComponentClient + createRouteHandlerClient) with thin factories
// over @supabase/ssr.
//
// Async-cookie callbacks: Next 15 made cookies() async; the wrapper itself
// stays sync so consumer call shape is `const supabase = createServerClient()`
// with no await.
import { createServerClient as createSSRServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { config } from '@/lib/config'

/**
 * Session-context Supabase client for Server Components and Route Handlers.
 * Replaces createServerComponentClient and createRouteHandlerClient from
 * @supabase/auth-helpers-nextjs.
 *
 * NEXT_PUBLIC_* env vars are read as literal expressions so Next.js can
 * inline them at build time. Modern publishable key preferred; legacy anon
 * key as fallback while the 2026-05-XX rotation transition is open.
 */
export function createServerClient() {
  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: async () => {
          const store = await cookies()
          return store.getAll()
        },
        setAll: async (toSet) => {
          try {
            const store = await cookies()
            toSet.forEach(({ name, value, options }) => store.set(name, value, options))
          } catch {
            // Server Components cannot mutate cookies; middleware handles refresh.
          }
        },
      },
    },
  )
}

/**
 * Service-role Supabase client for admin operations. Bypasses RLS — only use
 * after auth verification in admin routes.
 *
 * Reads config.supabase.secretKey: SUPABASE_SECRET_KEY (modern) preferred,
 * SUPABASE_SERVICE_ROLE_KEY (legacy) as fallback.
 */
export function createServiceRoleClient() {
  if (!config.supabase.secretKey) {
    throw new Error('SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) is not set')
  }
  return createClient(config.supabase.url, config.supabase.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
