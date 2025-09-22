import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readEnv } from './env';

type AnySupabaseClient = SupabaseClient<any, any, any>;

let cachedClient: AnySupabaseClient | null = null;

export function getServiceRoleSupabaseClient(): AnySupabaseClient {
  if (cachedClient) return cachedClient;

  const url =
    readEnv('SUPABASE_URL') ??
    readEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key =
    readEnv('SUPABASE_SERVICE_ROLE_KEY') ??
    readEnv('SERVICE_ROLE_KEY');

  if (!url || !key) {
    throw new Error('Missing Supabase service role environment variables');
  }

  cachedClient = createClient(url, key, {
    auth: { persistSession: false },
  });

  return cachedClient;
}
