// lib/config/index.ts
// PAT-CFG-01: Typed configuration for Supabase env values.
// All env values are read ONCE here and exported as a typed object.
// IMPORTANT: NEXT_PUBLIC_* vars must be accessed as literal process.env.NEXT_PUBLIC_X
// expressions — Next.js does static replacement at build time and cannot resolve
// dynamic access like process.env[key].

export const config = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    // Modern key (sb_secret_*); falls back to legacy service_role JWT during
    // the rotation transition. Once Phase C revokes the legacy key, the
    // fallback becomes a no-op and SUPABASE_SERVICE_ROLE_KEY can be deleted
    // from Vercel.
    secretKey:
      process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      '',
    // DEPRECATED — kept for explicit legacy-var access. All business-logic
    // readers will be migrated to secretKey in Phase A.2. Slated for field
    // deletion in Phase C once SUPABASE_SERVICE_ROLE_KEY is revoked from
    // Vercel.
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  },
} as const

export type AppConfig = typeof config
