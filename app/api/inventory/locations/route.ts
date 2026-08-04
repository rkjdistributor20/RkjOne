import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches, applyBranchIdsFilter } from '@/lib/auth/branch-scope';
import { jsonWithPrivateCache } from '@/lib/http/cache';
import { isDatabaseEnumValue } from '@/lib/validation/database-enum';
import type { Enums } from '@/types/database';

const LOCATION_TYPES = [
 'FACTORY',
 'HQ_WAREHOUSE',
 'FLEET_VEHICLE',
 'BRANCH_KIOSK',
] as const satisfies readonly Enums<'location_type'>[];
const ORG_LOCATION_TYPES = [
 'FACTORY',
 'HQ_WAREHOUSE',
 'FLEET_VEHICLE',
] as const satisfies readonly Enums<'location_type'>[];

/** Peranan ini hanya lihat kiosk dalam kawasan - bukan Kilang / Gudang HQ / Logistik */
const KIOSK_ONLY_ROLES = new Set(['AREA_MANAGER', 'STAFF']);

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { searchParams } = new URL(request.url);
 const requestedType = searchParams.get('type');
 let type: Enums<'location_type'> | null = null;
 if (requestedType) {
  if (!isDatabaseEnumValue(requestedType, LOCATION_TYPES)) {
   return NextResponse.json({ error: 'Invalid location type' }, { status: 400 });
  }
  type = requestedType;
 }
 const requestedBranchId = searchParams.get('branch_id');

 const supabase = await createClient();
 let scope;
 try {
 scope = await resolveScopedBranches(
 supabase,
 profile,
 requestedBranchId ?? profile.branch_id);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 const select = `
 *,
 branch:branches(branch_code, branch_name, region_id),
 vehicle:vehicles(vehicle_code, vehicle_type)
 `;

 const baseQuery = () =>
 supabase.from('inventory_locations').select(select).eq('organization_id', profile.organization_id).eq('is_active', true);

 let locations: unknown[] = [];

 if (scope.branchIds === null) {
 let query = baseQuery().order('location_type').order('name');
 if (type) query = query.eq('location_type', type);
 const { data, error } = await query;
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 locations = data ?? [];
 } else {
 let branchQuery = applyBranchIdsFilter(
 baseQuery(),
 'branch_id',
 scope.branchIds).order('location_type').order('name');
 if (type) branchQuery = branchQuery.eq('location_type', type);

 let orgQuery = baseQuery().is('branch_id', null).in('location_type', [...ORG_LOCATION_TYPES]).order('location_type').order('name');
 if (type) orgQuery = orgQuery.eq('location_type', type);

 const includeOrgLocations = !KIOSK_ONLY_ROLES.has(profile.role);

 const [branchRes, orgRes] = await Promise.all([
 branchQuery,
 includeOrgLocations
 ? orgQuery
 : Promise.resolve({ data: [] as unknown[], error: null }),
 ]);
 if (branchRes.error) {
 return NextResponse.json({ error: branchRes.error.message }, { status: 500 });
 }
 if (orgRes.error) {
 return NextResponse.json({ error: orgRes.error.message }, { status: 500 });
 }

 const seen = new Set<string>();
 for (const loc of [...(orgRes.data ?? []), ...(branchRes.data ?? [])]) {
 const id = (loc as { id: string }).id;
 if (!seen.has(id)) {
 seen.add(id);
 locations.push(loc);
 }
 }
 }

 return jsonWithPrivateCache({ locations }, 30, 90);
}
