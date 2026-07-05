import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_STATUSES = ['PENDING', 'APPROVED', 'FULFILLED'];

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const url = new URL(request.url);
 const statusParam = url.searchParams.get('status');
 const branchId = url.searchParams.get('branch_id');
 const statuses = statusParam
 ? statusParam.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean)
 : DEFAULT_STATUSES;

 const supabase = await createClient();
 let scope;
 try {
 scope = await resolveScopedBranches(supabase, profile, branchId);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 let query = supabase.from('pos_branch_supply_requests').select(`
 id, branch_id, status, request_type, priority, needed_by, notes, items, created_at,
 branch:branches(branch_name, branch_code)
 `).eq('organization_id', profile.organization_id).order('created_at', { ascending: false }).limit(100);

 if (statuses.length > 0) query = query.in('status', statuses);
 if (scope.branchIds !== null) {
 if (scope.branchIds.length === 0) return NextResponse.json({ requests: [] });
 query = query.in('branch_id', scope.branchIds);
 }

 const { data, error } = await query;
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });

 return NextResponse.json({ requests: data ?? [] });
}
