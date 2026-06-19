import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export function inventoryRpc(
  client: SupabaseClient<Database>,
  fn: string,
  args: Record<string, unknown>
) {
  return (client as SupabaseClient).rpc(fn, args);
}
