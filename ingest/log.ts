import type { SupabaseClient } from '@supabase/supabase-js';

export type RunSummary = {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  adaptersOk: string[];
  adaptersFailed: string[];
  createdCount: number;
  updatedCount: number;
  reviewCount: number;
};

// Every run is logged as an ingest_runs row (§10.7). The most recent row with
// ok = true is what the status bar's "last checked" line reads, and what the
// staleness check compares against.
export async function logRun(client: SupabaseClient, summary: RunSummary): Promise<void> {
  const { error } = await client.from('ingest_runs').insert({
    started_at: summary.startedAt,
    finished_at: summary.finishedAt,
    ok: summary.ok,
    adapters_ok: summary.adaptersOk,
    adapters_failed: summary.adaptersFailed,
    created_count: summary.createdCount,
    updated_count: summary.updatedCount,
    review_count: summary.reviewCount,
  });
  if (error) throw new Error(`logRun: ${error.message}`);
}
