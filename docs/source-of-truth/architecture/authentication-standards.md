# Authentication Standards

This project uses Supabase Auth with Next.js (App Router) on top of [`@supabase/ssr`](https://www.npmjs.com/package/@supabase/ssr). All Supabase-client construction goes through a thin project-internal wrapper layer at `lib/supabase/{server,browser,middleware}.ts` so future env or package changes are a one-file edit instead of a repo-wide sweep. The following rules are mandatory for security (FERPA) and consistency.

## Wrapper layer (canonical entry points)

All Supabase clients are built via these factories. Do not call `@supabase/ssr` or `@supabase/supabase-js` directly outside the wrapper layer.

| Factory | Import from | Purpose |
|---|---|---|
| `createServerClient()` | `@/lib/supabase/server` | Session-context client for Server Components and Route Handlers. Reads cookies via `next/headers`. |
| `createBrowserClient()` | `@/lib/supabase/browser` | Browser-side client for `'use client'` components. Reads cookies via `document.cookie`. |
| `supabase` (singleton) | `@/lib/supabase/client` | Pre-built `createBrowserClient()` instance. Use for typical client-component reads. |
| `createMiddlewareSupabase(request)` | `@/lib/supabase/middleware` | Middleware client. Returns `{ supabase, response(), redirect(url) }`; the `redirect` helper preserves auth cookies set during session refresh. |
| `getServiceRoleSupabaseClient()` | `@/lib/supabase/server` | Service-role admin client. Cached singleton. **Bypasses RLS — use only after auth verification in trusted server flows.** |

**Key resolution (handled inside the wrappers, not at call sites):**
- Browser-side / session-context: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` preferred, `NEXT_PUBLIC_SUPABASE_ANON_KEY` legacy fallback.
- Service-role: `SUPABASE_SECRET_KEY` preferred, `SUPABASE_SERVICE_ROLE_KEY` and `SERVICE_ROLE_KEY` legacy fallbacks. Read via `lib/jobs/env::readEnv` so the helper works in both Node (Next.js) and Deno (Edge functions).

The legacy fallbacks in both chains are no-ops as of the 2026-05-03 rotation revoke; they remain only as safety nets in case the modern key isn't yet present in some environment.

## Server-side rules (Routes, Middleware, RSC)

- Use `supabase.auth.getUser()` for authenticated user data.
  - Do not use `supabase.auth.getSession()` to drive authorization decisions. It reads from storage (cookies) and is not authenticated by the Auth server.
  - Lint enforcement: a rule is configured for `app/api/**/*.{ts,tsx}`, `app/**/route.ts`, and `middleware.ts` to disallow `auth.getSession()`.
- Only trust identifiers from `getUser()`; pass `user.id` to queries/functions.
- Keep RLS enabled and write queries to respect RLS. RLS remains the last line of defense.
- Service-role usage:
  - Only in server routes / job handlers where strictly necessary (e.g., admin flows, internal sync). Never expose the service-role client or its key to client code.
  - Always call `getServiceRoleSupabaseClient()` from `@/lib/supabase/server`. Do not build inline `createClient(url, key, ...)` instances — the helper is cached and key-resolution-correct.
  - Prefer cookie-bound `createServerClient()` for normal auth-aware paths. Reach for the service-role client only when bypassing RLS is essential.
- Middleware gating:
  - Gate `/dashboard/*` with verified `getUser()`.
  - Enforce administrative access by checking `profiles.role` for `admin`.
  - Enforce "must change password" with `user.app_metadata.must_change_password`.

## Client-side rules (Pages/components with "use client")

- `supabase.auth.getSession()` and `onAuthStateChange()` are acceptable for UI refresh and state, but never for authorization.
- Redirects/guards must be enforced by Middleware or server routes, not client code.
- For component-level reads, import the singleton: `import { supabase } from '@/lib/supabase/client'`. For lifecycle-controlled instances, use `createBrowserClient()` from `@/lib/supabase/browser`.

## Password reset flows

- Admin-initiated reset only (no public reset):
  - Admin sets a temporary password and flags `app_metadata.must_change_password = true`.
  - Middleware forces `/auth/force-reset` until completion.
  - The reset page calls `auth.updateUser({ password })`, clears the flag via a server route, and refreshes the session (server route also refreshes the cookie).
- Avoid "magic link" for forced-reset; it is optimized for sign-in, not recovery, and can introduce callback fragment/cookie issues.

## Redirects and origins

- When generating links server-side, prefer `request.nextUrl.origin` or an explicit canonical URL for production.
- Ensure Supabase redirect URLs include `https://<canonical-domain>/*` and `http://localhost:3000` for local testing.

## Environment keys

| Var | Where read | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Wrappers (client + server) | Public URL — required everywhere. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `createServerClient`, `createBrowserClient`, `createMiddlewareSupabase` | **Modern, preferred.** Inline literal access — Next.js inlines at build. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as above (legacy fallback) | Revoked in Supabase 2026-05-03; fallback is no-op safety net. |
| `SUPABASE_URL` | `getServiceRoleSupabaseClient` | Server-only URL, read via `readEnv`. |
| `SUPABASE_SECRET_KEY` | `getServiceRoleSupabaseClient` | **Modern, preferred.** Server-only — never expose to the client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Same as above (legacy fallback) | Revoked in Supabase 2026-05-03; fallback is no-op safety net. |

Never log a service-role key value. Direct reads of `SUPABASE_SERVICE_ROLE_KEY` from `process.env` outside the wrapper layer are anti-pattern — the legacy revoke broke any code that did this.

## Cookies and sessions

- HTTPS only in production; cookies must be `Secure`.
- Next 15 made `cookies()` async — the wrappers handle this internally via async cookie callbacks. **Consumers do not call `cookies()` themselves**; just call `createServerClient()`.
- For dynamic routes, destructure params via `context: { params: Promise<...> }` and `await context.params` before use.
- After server-side metadata changes that affect middleware decisions, refresh the session so the JWT in cookies reflects the update.

## Lint enforcement

- `.eslintrc.json` contains an override that forbids `supabase.auth.getSession()` in server routes and middleware (use `getUser()` instead).
- If a special case arises, justify in PR and annotate the code, but prefer conforming to the standard.

## Testing checklist (canary)

- Sign-in/out as admin and coach; unauthorized routes redirect.
- Admin Tools accessible only to admins; Analytics loads and filters by coach.
- Forced reset flow: temp password → force reset → set new password → proceed to dashboard; middleware no longer forces reset.
- API routes return 401 when unauthenticated and behave as expected when authenticated.
- Service-role-backed admin endpoints (certificates, team-images, jobs queue, cron-jobs) succeed without `Legacy API keys are disabled` errors — proves `SUPABASE_SECRET_KEY` is in play.

---

**Last verified:** 2026-05-03 against commit `1c60208a`.
**Notes:** No edits required — doc accurately reflects the current `@supabase/ssr` wrapper layer (`lib/supabase/{server,browser,middleware,client}.ts`), service-role helper (`getServiceRoleSupabaseClient`), key-rotation status (legacy keys revoked 2026-05-03), and middleware gating. Confirmed `auth.getSession()` is lint-banned in `app/api/**`, `app/**/route.ts`, and `middleware.ts`.
