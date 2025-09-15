# Authentication Standards

This project uses Supabase Auth with Next.js (App Router). The following rules are mandatory for security (FERPA) and consistency.

## Server-side rules (Routes, Middleware, RSC)
- Use `supabase.auth.getUser()` for authenticated user data.
  - Do not use `supabase.auth.getSession()` to drive authorization decisions. It reads from storage (cookies) and is not authenticated by the Auth server.
  - Lint enforcement: a rule is configured for `app/api/**/*.{ts,tsx}`, `app/**/route.ts`, and `middleware.ts` to disallow `auth.getSession()`.
- Only trust identifiers from `getUser()`; pass `user.id` to queries/functions.
- Keep RLS enabled and write queries to respect RLS. RLS remains the last line of defense.
- Service role usage:
  - Only in server routes where strictly necessary (e.g., admin flows). Never expose the service key to the client.
  - Prefer cookie-bound clients (`createRouteHandlerClient`, `createServerComponentClient`) for normal auth paths.
- Middleware gating:
  - Gate `/dashboard/*` with verified `getUser()`.
  - Enforce administrative access by checking `profiles.role` for `admin`.
  - Enforce “must change password” with `user.app_metadata.must_change_password`.

## Client-side rules (Pages/components with "use client")
- `supabase.auth.getSession()` and `onAuthStateChange()` are acceptable for UI refresh and state, but never for authorization.
- Redirects/guards must be enforced by Middleware or server routes, not client code.

## Password reset flows
- Admin-initiated reset only (no public reset):
  - Admin sets a temporary password and flags `app_metadata.must_change_password = true`.
  - Middleware forces `/auth/force-reset` until completion.
  - The reset page calls `auth.updateUser({ password })`, clears the flag via a server route, and refreshes the session (server route also refreshes the cookie).
- Avoid “magic link” for forced-reset; it is optimized for sign-in, not recovery, and can introduce callback fragment/cookie issues.

## Redirects and origins
- When generating links server-side, prefer `request.nextUrl.origin` or an explicit canonical URL for production.
- Ensure Supabase redirect URLs include `https://<canonical-domain>/*` and `http://localhost:3000` for local testing.

## Environment keys
- Client: expose only `NEXT_PUBLIC_*` and the Supabase anon key.
- Server: use the service role key only in server code. Never log the value.

## Cookies and sessions
- HTTPS only in production; cookies must be `Secure`.
- After server-side metadata changes that affect middleware decisions, refresh the session so the JWT in cookies reflects the update.

## Lint enforcement
- `.eslintrc.json` contains an override that forbids `supabase.auth.getSession()` in server routes and middleware (use `getUser()` instead).
- If a special case arises, justify in PR and annotate the code, but prefer conforming to the standard.

## Testing checklist (canary)
- Sign-in/out as admin and coach; unauthorized routes redirect.
- Admin Tools accessible only to admins; Analytics loads and filters by coach.
- Forced reset flow: temp password → force reset → set new password → proceed to dashboard; middleware no longer forces reset.
- API routes return 401 when unauthenticated and behave as expected when authenticated.

