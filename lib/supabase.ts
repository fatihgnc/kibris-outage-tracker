import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Anon client factory — read-only. The app never writes, and row level
// security grants anon nothing but select on outages and ingest_runs, so a
// leaked anon key cannot modify anything. Only lib/db.ts may call this.
let cached: SupabaseClient | null = null;

export function getAnonClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  cached = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
