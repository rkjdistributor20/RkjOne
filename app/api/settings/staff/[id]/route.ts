import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
  assertBranchInPersonnelScope,
  assertCanManagePersonnel,
  assertStaffTargetInScope,
} from '@/lib/settings/personnel-access';
import {
  loadStaffPortalCredentials,
  loadStaffProfileMeta,
  provisionStaffPortalAccount,
} from '@/lib/settings/staff-auth';
import { resolveLegalEntityId } from '@/lib/settings/legal-entity';
import {
  computeForeignWeeklyPay,
  computeLocalMonthlyPay,
  DEFAULT_SHIFTS_PER_WEEK,
} from '@/lib/payroll/staff-pay-rates';
import type { PayrollRule } from '@/lib/payroll/types';

async function loadPayrollRules(supabase: SupabaseClient, orgId: string) {
  const { data, error } = await supabase
    .from('payroll_rules')
    .select('id, rule_code, worker_type, component, rate, period, shift_hours, status, notes')
    .eq('organization_id', orgId)
    .eq('status', 'ACTIVE');
  if (error) throw new Error(error.message);
  return (data ?? []) as PayrollRule[];
}

function computePayAmounts(
  rules: PayrollRule[],
  workerType: 'LOCAL' | 'FOREIGN',
  shiftHours?: number,
  shiftsPerWeek?: number
) {
  if (workerType === 'FOREIGN') {
    const hours = Number(shiftHours);
    const days = Number(shiftsPerWeek ?? DEFAULT_SHIFTS_PER_WEEK);
    const foreignPay = computeForeignWeeklyPay(rules, hours, days);
    return {
      weekly_amount: foreignPay.weekly,
      monthly_amount: null as number | null,
      shift_hours: hours,
      shifts_per_week: days,
    };
  }
  const localPay = computeLocalMonthlyPay(rules);
  return {
    weekly_amount: null as number | null,
    monthly_amount: localPay.total,
    shift_hours: null as number | null,
    shifts_per_week: null as number | null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = assertCanManagePersonnel(await getCurrentProfile());
    const { id } = await params;
    const supabase = await createClient();
    const service = await createServiceClient();

    await assertStaffTargetInScope(supabase, profile, id);

    const { data: staff, error } = await supabase
      .from('staff')
      .select(
        `
        id, staff_code, full_name, status, branch_id, region_id, worker_type,
        weekly_amount, monthly_amount, shift_hours, shifts_per_week,
        bank_name, account_number, account_holder, remarks, on_hold, profile_id, legal_entity_id,
        branch:branches(branch_code, branch_name),
        legal_entity:legal_entities(code, name, legal_name, scope)
      `
      )
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single();

    if (error || !staff) {
      return NextResponse.json({ error: 'Staf tidak dijumpai' }, { status: 404 });
    }

    const staffRow = staff as { profile_id: string | null };

    const [credentials, profileMeta] = await Promise.all([
      loadStaffPortalCredentials(service, id),
      loadStaffProfileMeta(service, staffRow.profile_id),
    ]);

    return NextResponse.json({
      staff,
      portal: credentials,
      login: profileMeta
        ? {
            must_change_password: profileMeta.must_change_password,
            last_login_at: profileMeta.last_login_at,
            status: profileMeta.status,
          }
        : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = assertCanManagePersonnel(await getCurrentProfile());
    const { id } = await params;
    const body = await request.json();
    const supabase = await createClient();
    const service = await createServiceClient();

    await assertStaffTargetInScope(supabase, profile, id);

    const { data: existing } = await supabase
      .from('staff')
      .select('id, staff_code, profile_id, branch_id, region_id, worker_type, full_name, legal_entity_id')
      .eq('id', id)
      .single();

    const existingRow = existing as {
      id: string;
      staff_code: string;
      profile_id: string | null;
      branch_id: string | null;
      region_id: string | null;
      worker_type: 'LOCAL' | 'FOREIGN' | null;
      full_name: string;
      legal_entity_id: string | null;
    } | null;

    if (!existingRow) {
      return NextResponse.json({ error: 'Staf tidak dijumpai' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (body.full_name != null) updates.full_name = String(body.full_name).trim();
    if (body.status != null) updates.status = body.status;
    if (body.remarks != null) updates.remarks = body.remarks;
    if (body.on_hold != null) updates.on_hold = Boolean(body.on_hold);
    if (body.bank_name != null) updates.bank_name = body.bank_name;
    if (body.account_number != null) updates.account_number = body.account_number;
    if (body.account_holder != null) updates.account_holder = body.account_holder;

    if (body.legal_entity_code != null) {
      updates.legal_entity_id = await resolveLegalEntityId(
        supabase,
        profile.organization_id,
        body.legal_entity_code
      );
    }

    if (body.branch_id != null) {
      const branchId = await assertBranchInPersonnelScope(
        supabase,
        profile,
        body.branch_id
      );
      if (branchId) {
        updates.branch_id = branchId;
        const { data: branch } = await supabase
          .from('branches')
          .select('region_id')
          .eq('id', branchId)
          .maybeSingle();
        updates.region_id = (branch as { region_id: string } | null)?.region_id;
      }
    }

    const workerType = (body.worker_type ?? existingRow.worker_type) as 'LOCAL' | 'FOREIGN';
    if (body.worker_type != null || body.shift_hours != null || body.shifts_per_week != null) {
      const rules = await loadPayrollRules(supabase, profile.organization_id);
      const pay = computePayAmounts(
        rules,
        workerType,
        body.shift_hours ?? undefined,
        body.shifts_per_week ?? undefined
      );
      updates.worker_type = workerType;
      updates.weekly_amount = pay.weekly_amount;
      updates.monthly_amount = pay.monthly_amount;
      updates.shift_hours = pay.shift_hours;
      updates.shifts_per_week = pay.shifts_per_week;
    }

    const { data: staff, error } = await (supabase as SupabaseClient)
      .from('staff')
      .update(updates)
      .eq('id', id)
      .select(
        'id, staff_code, full_name, status, branch_id, worker_type, weekly_amount, monthly_amount, shift_hours, shifts_per_week, profile_id'
      )
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (existingRow.profile_id && (updates.full_name || updates.branch_id || updates.legal_entity_id)) {
      await (service as SupabaseClient)
        .from('profiles')
        .update({
          ...(updates.full_name ? { full_name: updates.full_name as string } : {}),
          ...(updates.branch_id ? { branch_id: updates.branch_id as string } : {}),
          ...(updates.region_id ? { region_id: updates.region_id as string } : {}),
          ...(updates.legal_entity_id ? { legal_entity_id: updates.legal_entity_id as string } : {}),
        })
        .eq('id', existingRow.profile_id);
    }

    let portal = await loadStaffPortalCredentials(service, id);

    if (body.create_portal_account && !portal) {
      const legalEntityId =
        (updates.legal_entity_id as string | undefined) ??
        existingRow.legal_entity_id ??
        (await resolveLegalEntityId(supabase, profile.organization_id, undefined));

      const created = await provisionStaffPortalAccount(service, {
        staffId: id,
        staffCode: existingRow.staff_code,
        fullName: (updates.full_name as string) ?? existingRow.full_name,
        branchId: (updates.branch_id as string) ?? existingRow.branch_id!,
        regionId: (updates.region_id as string) ?? existingRow.region_id,
        organizationId: profile.organization_id,
        legalEntityId,
        createdBy: profile.id,
      });
      portal = {
        login_email: created.login_email,
        portal_password: created.portal_password,
        updated_at: new Date().toISOString(),
      };
    }

    return NextResponse.json({ staff, portal });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = assertCanManagePersonnel(await getCurrentProfile());
    const { id } = await params;
    const supabase = await createClient();

    await assertStaffTargetInScope(supabase, profile, id);

    const { count } = await supabase
      .from('staff_shifts')
      .select('id', { count: 'exact', head: true })
      .eq('staff_id', id);

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            'Staf ada rekod syif — set status INACTIVE atau hubungi Admin HQ',
        },
        { status: 400 }
      );
    }

    const { error } = await (supabase as SupabaseClient)
      .from('staff')
      .delete()
      .eq('id', id)
      .eq('organization_id', profile.organization_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: { id, deleted: true } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }
}
