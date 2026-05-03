// lib/jobs/supabase.ts
// Back-compat re-export. The canonical service-role helper lives in
// lib/supabase/server.ts. This file is preserved so the ~30 existing
// `import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase'`
// call sites keep working without churn — new code should import from
// `@/lib/supabase/server` instead.
export { getServiceRoleSupabaseClient } from '@/lib/supabase/server'
