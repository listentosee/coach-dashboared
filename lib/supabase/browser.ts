'use client'

// lib/supabase/browser.ts
// Browser-side Supabase wrapper — replaces @supabase/auth-helpers-nextjs
// createClientComponentClient with a thin factory over @supabase/ssr.
//
// NEXT_PUBLIC_* env vars are read as literal expressions so Next.js can
// inline them at build time. Modern publishable key preferred; legacy anon
// key as fallback while the 2026-05-XX rotation transition is open.
import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr'

export function createBrowserClient() {
  return createSSRBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
