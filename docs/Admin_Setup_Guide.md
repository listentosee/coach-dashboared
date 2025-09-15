# Admin Setup Guide

This documents the secure, two‑gate flow under `app/admin-setup` used to bootstrap system administrators.

Design: Gate 1 requires a valid URL hash; Gate 2 requires the plaintext Admin Creation Key. Both correspond to the same secret (one is SHA‑256 hash).

Components
- UI: `app/admin-setup/page.tsx` reads `?hash=` and calls `/api/admin/verify-access`; then posts the form to `/api/admin/create-admin`.
- Verify Access: `app/api/admin/verify-access/route.ts` compares posted `hash` to `ADMIN_CREATION_KEY_HASH`.
- Create Admin: `app/api/admin/create-admin/route.ts` compares `sha256(adminKey)` to `ADMIN_CREATION_KEY_HASH`, then creates an admin user and `profiles` row via Supabase service role.

Prerequisites
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Env: `ADMIN_CREATION_KEY_HASH` set to the SHA‑256 hex of your plaintext Admin Key (store only the hash, not plaintext).

How to use
1) Compute SHA‑256 hex of your Admin Key and set `ADMIN_CREATION_KEY_HASH` in your environment. Redeploy.
2) Open `https://<domain>/admin-setup?hash=<ADMIN_CREATION_KEY_HASH>` in a browser. If the hash matches, the form renders.
3) Fill in admin identity fields and enter the plaintext Admin Key in the form. Submit.
4) On success, a new admin auth user is created (email confirmed) and a `profiles` row is inserted with role `admin`. Sign in at `/auth/login`.

Security notes
- Treat the link with `?hash=` as sensitive; it satisfies Gate 1 only. The form still requires the plaintext key (Gate 2).
- Prefer a long, random Admin Key; rotate the hash after initial provisioning; optionally remove or further restrict the route when not needed.

Troubleshooting
- "Admin creation not configured": set `ADMIN_CREATION_KEY_HASH` and redeploy.
- "Invalid hash": the URL `hash` must match `ADMIN_CREATION_KEY_HASH` exactly.
- "Invalid admin key": entered plaintext does not hash to the configured digest.
- "User already exists": an auth user with that email already exists; use a different email or delete the existing user in Supabase.

Internals quick reference
- Verify: `POST /api/admin/verify-access` with `{ hash }`.
- Create: `POST /api/admin/create-admin` with form JSON body.
- UI: `GET /admin-setup?hash=<digest>` then submit form including plaintext Admin Key.

