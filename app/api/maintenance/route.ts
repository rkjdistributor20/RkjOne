import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

const MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'MAINTENANCE_MANAGER'];
const SUBMITTER_ROLES = [...MANAGER_ROLES, 'AREA_MANAGER', 'STAFF'];

function isManager(role: string) {
  return MANAGER_ROLES.includes(role);
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createClient();
  let query = (supabase as SupabaseClient)
    .from('maintenance_reports')
    .select(`
      id, report_number, report_type, category, priority, status, title, description,
      substitute_required, substitute_status, preferred_visit_date, contact_name,
      contact_phone, manager_notes, created_at, resolved_at,
      branch:branches(branch_code, branch_name),
      reporter:profiles!maintenance_reports_reported_by_fkey(full_name, role),
      assignee:profiles!maintenance_reports_assigned_to_fkey(full_name)
    `)
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false });

  if (!isManager(profile.role)) {
    if (profile.role === 'AREA_MANAGER' && profile.region_id) {
      const { data: branches } = await (supabase as SupabaseClient)
        .from('branches')
        .select('id')
        .eq('organization_id', profile.organization_id)
        .eq('region_id', profile.region_id);
      const ids = (branches ?? []).map((b) => b.id);
      if (ids.length === 0) return NextResponse.json({ reports: [] });
      query = query.in('branch_id', ids);
    } else if (profile.branch_id) {
      query = query.eq('branch_id', profile.branch_id);
    } else {
      query = query.eq('reported_by', profile.id);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!SUBMITTER_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Tiada akses hantar report maintenance' }, { status: 403 });
  }

  const body = await request.json();
  const branchId = String(body.branch_id ?? '').trim();
  const title = String(body.title ?? '').trim();
  const description = String(body.description ?? '').trim();

  if (!branchId || !title || !description) {
    return NextResponse.json({ error: 'Cawangan, tajuk dan penerangan wajib' }, { status: 400 });
  }

  const supabase = await createClient();

  if (profile.role === 'STAFF' && profile.branch_id && branchId !== profile.branch_id) {
    return NextResponse.json({ error: 'Staf hanya boleh report cawangan sendiri' }, { status: 403 });
  }

  if (profile.role === 'AREA_MANAGER' && profile.region_id) {
    const { data: branch } = await (supabase as SupabaseClient)
      .from('branches')
      .select('id')
      .eq('id', branchId)
      .eq('organization_id', profile.organization_id)
      .eq('region_id', profile.region_id)
      .maybeSingle();
    if (!branch) {
      return NextResponse.json({ error: 'Cawangan di luar kawasan anda' }, { status: 403 });
    }
  }

  const { data: numberData, error: numberError } = await (supabase as SupabaseClient)
    .rpc('next_maintenance_report_number', { p_org_id: profile.organization_id });
  if (numberError) return NextResponse.json({ error: numberError.message }, { status: 500 });

  const { data: hanif } = await (supabase as SupabaseClient)
    .from('profiles')
    .select('id')
    .eq('organization_id', profile.organization_id)
    .eq('role', 'MAINTENANCE_MANAGER')
    .ilike('full_name', '%HANIF%')
    .maybeSingle();

  const substituteRequired = Boolean(body.substitute_required);

  const { data, error } = await (supabase as SupabaseClient)
    .from('maintenance_reports')
    .insert({
      organization_id: profile.organization_id,
      report_number: numberData,
      branch_id: branchId,
      reported_by: profile.id,
      assigned_to: hanif?.id ?? null,
      report_type: body.report_type ?? (substituteRequired ? 'STAFF_SHORTAGE' : 'MAINTENANCE'),
      category: body.category ?? (substituteRequired ? 'STAFFING' : 'GENERAL'),
      priority: body.priority ?? 'MEDIUM',
      title,
      description,
      substitute_required: substituteRequired,
      substitute_status: substituteRequired ? 'REQUESTED' : 'NOT_REQUIRED',
      preferred_visit_date: body.preferred_visit_date || null,
      contact_name: body.contact_name || profile.full_name,
      contact_phone: body.contact_phone || profile.phone,
      status: 'NEW',
    })
    .select('id, report_number')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ report: data });
}
