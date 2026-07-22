import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type RpcFunctions = Database['public']['Functions'];
type RpcName = keyof RpcFunctions;

export function callRpc<N extends RpcName>(
 client: SupabaseClient<Database>,
 fn: N,
 args: RpcFunctions[N]['Args']) {
 return (client as SupabaseClient).rpc(fn as string, args as Record<string, unknown>);
}
