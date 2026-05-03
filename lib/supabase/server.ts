// lib/supabase/server.ts
// Server-side Supabase wrappers — replaces @supabase/auth-helpers-nextjs
// (createServerComponentClient + createRouteHandlerClient) with thin factories
// over @supabase/ssr.
//
// Async-cookie callbacks: Next 15 made cookies() async; the wrapper itself
// stays sync so consumer call shape is `const supabase = createServerClient()`
// with no await.
import { createServerClient as createSSRServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { readEnv } from '@/lib/jobs/env'

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

type AnySupabaseClient = SupabaseClient<any, any, any>

let cachedServiceClient: AnySupabaseClient | null = null

/**
 * Service-role Supabase client. Bypasses RLS — only call after auth verification
 * in admin routes, server-side jobs, or trusted internal flows. Never expose to
 * client code.
 *
 * Cached singleton: built once per function instance, reused across requests.
 *
 * Key resolution chain (modern preferred; legacy fallbacks become no-op safety
 * nets after the 2026-05-03 legacy-JWT revoke):
 *   SUPABASE_SECRET_KEY → SUPABASE_SERVICE_ROLE_KEY → SERVICE_ROLE_KEY
 *
 * Reads env via lib/jobs/env::readEnv so the helper is usable from both Node
 * (Next.js routes / RSC) and Deno (Edge functions / job workers).
 */
export function getServiceRoleSupabaseClient(): AnySupabaseClient {
  if (cachedServiceClient) return cachedServiceClient

  const url =
    readEnv('SUPABASE_URL') ??
    readEnv('NEXT_PUBLIC_SUPABASE_URL')
  const key =
    readEnv('SUPABASE_SECRET_KEY') ??
    readEnv('SUPABASE_SERVICE_ROLE_KEY') ??
    readEnv('SERVICE_ROLE_KEY')

  if (!url || !key) {
    throw new Error('Missing Supabase service role environment variables')
  }

  cachedServiceClient = createClient(url, key, {
    auth: { persistSession: false },
  })

  return cachedServiceClient
}
