import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches, applyBranchIdsFilter } from '@/lib/auth/branch-scope';
import { assertSettingsAdmin, isSettingsAdmin } from '@/lib/settings/admin-auth';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const grouped = new URL(request.url).searchParams.get('grouped') === '1';
  const supabase = await createClient();

  if (grouped && isSettingsAdmin(profile.role)) {
    const { data: regions, error: regionErr } = await supabase
      .from('regions')
      .select('id, code, name, manager_name')
      .eq('organization_id', profile.organization_id)
      .order('code');

    if (regionErr) return NextResponse.json({ error: regionErr.message }, { status: 500 });

    const { data: branches, error: branchErr } = await supabase
      .from('branches')
      .select('id, branch_code, branch_name, status, area, region_id')
      .eq('organization_id', profile.organization_id)
      .order('branch_code');

    if (branchErr) return NextResponse.json({ error: branchErr.message }, { status: 500 });

    type RegionRow = {
      id: string;
      code: string;
      name: string;
      manager_name: string | null;
    };

    type BranchRow = {
      id: string;
      branch_code: string;
      branch_name: string;
      status: string;
      area: string | null;
      region_id: string;
    };

    const groups = ((regions ?? []) as RegionRow[]).map((region) => ({
      region_id: region.id,
      region_code: region.code,
      region_name: region.name,
      manager_name: region.manager_name,
      branches: ((branches ?? []) as BranchRow[])
        .filter((b) => b.region_id === region.id)
        .map((b) => ({
          id: b.id,
          branch_code: b.branch_code,
          branch_name: b.branch_name,
          status: b.status,
          area: b.area,
        })),
    }));

    return NextResponse.json({ groups: groups.filter((g) => g.branches.length > 0) });
  }

  if (grouped) {
    let scope;
    try {
      scope = await resolveScopedBranches(supabase, profile);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Forbidden' },
        { status: 403 }
      );
    }

    let regionsQuery = supabase
      .from('regions')
      .select('id, code, name, manager_name')
      .eq('organization_id', profile.organization_id)
      .order('code');

    if (scope.regionId) {
      regionsQuery = regionsQuery.eq('id', scope.regionId);
    }

    const { data: regions, error: regionErr } = await regionsQuery;
    if (regionErr) return NextResponse.json({ error: regionErr.message }, { status: 500 });

    let branchesQuery = supabase
      .from('branches')
      .select('id, branch_code, branch_name, status, area, region_id')
      .eq('organization_id', profile.organization_id)
      .order('branch_code');

    branchesQuery = applyBranchIdsFilter(branchesQuery, 'id', scope.branchIds);

    const { data: branches, error: branchErr } = await branchesQuery;
    if (branchErr) return NextResponse.json({ error: branchErr.message }, { status: 500 });

    type RegionRow = {
      id: string;
      code: string;
      name: string;
      manager_name: string | null;
    };

    type BranchRow = {
      id: string;
      branch_code: string;
      branch_name: string;
      status: string;
      area: string | null;
      region_id: string;
    };

    const groups = ((regions ?? []) as RegionRow[]).map((region) => ({
      region_id: region.id,
      region_code: region.code,
      region_name: region.name,
      manager_name: region.manager_name,
      branches: ((branches ?? []) as BranchRow[])
        .filter((b) => b.region_id === region.id)
        .map((b) => ({
          id: b.id,
          branch_code: b.branch_code,
          branch_name: b.branch_name,
          status: b.status,
          area: b.area,
        })),
    }));

    return NextResponse.json({ groups: groups.filter((g) => g.branches.length > 0) });
  }

  let scope;
  try {
    scope = await resolveScopedBranches(supabase, profile);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }

  let query = supabase
    .from('branches')
    .select('id, branch_code, branch_name, status, area, region:regions(id, name, manager_name)')
    .eq('organization_id', profile.organization_id)
    .order('branch_code');

  query = applyBranchIdsFilter(query, 'id', scope.branchIds);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ branches: data ?? [] });
}

export async function POST(request: Request) {
  try {
    assertSettingsAdmin(await getCurrentProfile());
    const body = await request.json();
    const supabase = await createClient();

    const { data, error } = await inventoryRpc(supabase, 'admin_create_branch', {
      p_region_id: body.region_id,
      p_branch_code: body.branch_code,
      p_branch_name: body.branch_name,
      p_area: body.area ?? null,
      p_manager_name: body.manager_name ?? null,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }
}
