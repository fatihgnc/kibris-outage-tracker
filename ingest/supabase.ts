import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Service-role client — ingest only. It bypasses row level security, so it
// must never be imported by anything under app/ or components/, and the key
// must never appear in a NEXT_PUBLIC_* variable (§8.1).
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
