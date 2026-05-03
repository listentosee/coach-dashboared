'use client'

// lib/supabase/client.ts
// Browser singleton — re-exports a single createBrowserClient() instance so
// existing consumers of `import { supabase } from '@/lib/supabase/client'`
// keep working without per-callsite migration.
//
// New code should import { createBrowserClient } from '@/lib/supabase/browser'
// directly when it needs control over instance lifecycle. For typical
// component-level reads, this singleton is fine.
import { createBrowserClient } from './browser'

export const supabase = createBrowserClient()
