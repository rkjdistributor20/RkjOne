import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type RpcFunctions = Database['public']['Functions'];
type RpcName = keyof RpcFunctions;

export function callRpc<N extends RpcName>(
  client: SupabaseClient<Database>,
  fn: N,
  args: RpcFunctions[N]['Args']
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as SupabaseClient).rpc(fn as string, args as Record<string, unknown>);
}
