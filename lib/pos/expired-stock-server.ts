import type { SupabaseClient } from '@supabase/supabase-js';
import type { RotiExpirySummary } from '@/lib/stock/expiry';
import { getKioskLocationId } from '@/lib/pos/stock-server';

export async function fetchRotiExpirySummary(
 supabase: SupabaseClient,
 branchId: string): Promise<RotiExpirySummary | null> {
 const locationId = await getKioskLocationId(supabase, branchId);
 if (!locationId) return null;

 const { data, error } = await supabase.rpc('get_roti_expiry_summary', {
 p_location_id: locationId,
 });

 if (error) throw new Error(error.message);

 return data as RotiExpirySummary;
}
