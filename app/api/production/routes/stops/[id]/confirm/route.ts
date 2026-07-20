import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { createAdminClient } from '@/lib/supabase/admin';
import { learnDropLocation } from '@/lib/fleet/location-learning';

export async function POST(
 request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
 }

 const { id } = await params;
 const body = await request.json().catch(() => ({}));
 const supabase = await createClient();

 const { data, error } = await inventoryRpc(supabase, 'confirm_route_stop_delivery', {
 p_stop_id: id,
 p_receiver_name: body.receiver_name ?? null,
 p_driver_notes: body.driver_notes ?? null,
 });

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 const service = createAdminClient() as any;
 const { data: stop } = await service.from('hq_delivery_route_stops')
  .select('branch_id, route_plan_id').eq('id', id).maybeSingle();
 let locationLearning: Record<string, unknown> = { learned: false, reason: 'BRANCH_NOT_FOUND' };
 if (stop?.branch_id) {
  const { data: plan } = await service.from('hq_delivery_route_plans')
   .select('driver_id, vehicle_id').eq('id', stop.route_plan_id)
   .eq('organization_id', profile.organization_id).maybeSingle();
  locationLearning = await learnDropLocation({
   service, organizationId: profile.organization_id, profileId: profile.id,
   branchId: stop.branch_id, routeStopId: id, driverId: plan?.driver_id ?? null,
   vehicleId: plan?.vehicle_id ?? null, reportedLatitude: body.gps_latitude ?? null,
   reportedLongitude: body.gps_longitude ?? null,
  });
 }

 return NextResponse.json({ result: { ...((data ?? {}) as Record<string, unknown>), location_learning: locationLearning } });
}
