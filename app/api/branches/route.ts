import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 let scope;
 try {
 scope = await resolveScopedBranches(supabase, profile);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 let query = supabase.from('branches').select('id, branch_code, branch_name, area, manager_name, status, region_id, region:regions(name, manager_name)').eq('organization_id', profile.organization_id).order('branch_code');

 if (scope.branchIds !== null) {
 if (scope.branchIds.length === 0) {
 return NextResponse.json({ branches: [] });
 }
 query = query.in('id', scope.branchIds);
 }

 const { data, error } = await query;
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });

 type Row = {
 id: string;
 branch_code: string;
 branch_name: string;
 area: string | null;
 manager_name: string | null;
 status: string;
 region: { name: string; manager_name: string | null } | null;
 };

 const branches = ((data ?? []) as unknown as Row[]).map((row) => ({
 id: row.id,
 branch_code: row.branch_code,
 branch_name: row.branch_name,
 area: row.area,
 manager_name: row.region?.manager_name ?? row.manager_name,
 status: row.status,
 region_name: row.region?.name ?? null,
 }));

 return NextResponse.json({ branches });
}