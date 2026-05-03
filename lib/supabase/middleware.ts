// lib/supabase/middleware.ts
// Edge-middleware Supabase wrapper — replaces @supabase/auth-helpers-nextjs
// createMiddlewareClient with a thin factory over @supabase/ssr.
//
// The @supabase/ssr middleware pattern requires bridging cookies between the
// request (so downstream handlers see refreshed session) and the response (so
// the browser receives updated auth cookies). When a redirect short-circuits
// the response, auth cookies must be copied to the redirect response or the
// session refresh is lost.
//
// Usage:
//   const ms = createMiddlewareSupabase(request)
//   const { data: { user } } = await ms.supabase.auth.getUser()
//   if (!user) return ms.redirect(new URL('/login', request.url))
//   return ms.response()
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export function createMiddlewareSupabase(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  return {
    supabase,
    /** Returns the latest response (with any auth cookies set during session refresh). */
    response: () => response,
    /** Build a redirect response that preserves auth cookies set during getUser(). */
    redirect: (url: URL | string) => {
      const r = NextResponse.redirect(url)
      response.cookies.getAll().forEach((c) => r.cookies.set(c.name, c.value))
      return r
    },
  }
}
