import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveLegalEntityId } from '@/lib/settings/legal-entity';

const RUN_SELECT = `
 id, run_number, period_start, period_end, status, legal_entity_id, report_type,
 total_gross, total_deductions, total_net, created_at,
 legal_entity:legal_entities(code, legal_name, name),
 payroll_line_items(
 id, staff_id, worker_type, basic_salary, attendance_allowance,
 shift_pay, ot_pay, commission, contract_bonus, epf, socso, eis,
 kiosk_excess_minutes, kiosk_deduction,
 gross_pay, net_pay, sales_total, hours_worked, ot_hours,
 staff:staff(staff_code, full_name, legal_entity_id, legal_entity:legal_entities(code, legal_name, name), branch:branches(branch_name)))
`;

function one<T>(value: T | T[] | null | undefined): T | null {
 if (Array.isArray(value)) return value[0] ?? null;
 return value ?? null;
}

async function resolveRequestedLegalEntity(
 supabase: SupabaseClient,
 organizationId: string,
 body: Record<string, unknown>) {
 if (body.legal_entity_code) {
 return resolveLegalEntityId(supabase, organizationId, String(body.legal_entity_code));
 }
 if (!body.legal_entity_id) return null;
 const requested = String(body.legal_entity_id);
 const { data, error } = await supabase
 .from('legal_entities')
 .select('id')
 .eq('id', requested)
 .eq('organization_id', organizationId)
 .maybeSingle();
 if (error) throw new Error(error.message);
 if (!data) throw new Error('Syarikat payroll tidak dijumpai');
 return requested;
}

async function scopePayrollRunToLegalEntity(
 service: SupabaseClient,
 runId: string,
 legalEntityId: string) {
 const { data: lineRows, error } = await service
 .from('payroll_line_items')
 .select(
 'id, gross_pay, net_pay, epf, socso, eis, kiosk_deduction, staff:staff(legal_entity_id)')
 .eq('payroll_run_id', runId);

 if (error) throw new Error(error.message);

 const rows = (lineRows ?? []) as Array<{
 id: string;
 gross_pay: number | null;
 net_pay: number | null;
 epf: number | null;
 socso: number | null;
 eis: number | null;
 kiosk_deduction?: number | null;
 staff: { legal_entity_id: string | null } | { legal_entity_id: string | null }[] | null;
 }>;

 const keep = rows.filter((row) => one(row.staff)?.legal_entity_id === legalEntityId);
 const removeIds = rows
 .filter((row) => one(row.staff)?.legal_entity_id !== legalEntityId)
 .map((row) => row.id);

 if (removeIds.length > 0) {
 const { error: deleteErr } = await service
 .from('payroll_line_items')
 .delete()
 .in('id', removeIds);
 if (deleteErr) throw new Error(deleteErr.message);
 }

 const totals = keep.reduce(
 (sum, row) => {
 const deductions =
 Number(row.epf ?? 0) +
 Number(row.socso ?? 0) +
 Number(row.eis ?? 0) +
 Number(row.kiosk_deduction ?? 0);
 return {
 gross: sum.gross + Number(row.gross_pay ?? 0),
 deductions: sum.deductions + deductions,
 net: sum.net + Number(row.net_pay ?? 0),
 };
 },
 { gross: 0, deductions: 0, net: 0 });

 const { error: updateErr } = await service
 .from('payroll_runs')
 .update({
 legal_entity_id: legalEntityId,
 total_gross: Math.round(totals.gross * 100) / 100,
 total_deductions: Math.round(totals.deductions * 100) / 100,
 total_net: Math.round(totals.net * 100) / 100,
 })
 .eq('id', runId);
 if (updateErr) throw new Error(updateErr.message);
}

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 const { data, error } = await supabase.from('payroll_runs').select(RUN_SELECT).eq('organization_id', profile.organization_id).order('created_at', { ascending: false }).limit(20);

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return NextResponse.json({ runs: data ?? [] });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json().catch(() => ({}));
 const supabase = await createClient();
 const service = await createServiceClient();

 let legalEntityId: string | null = null;
 try {
 legalEntityId = await resolveRequestedLegalEntity(
 supabase,
 profile.organization_id,
 body as Record<string, unknown>);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Syarikat payroll tidak sah' },
 { status: 400 });
 }

 const { data, error } = await inventoryRpc(supabase, 'generate_payroll_run', {
 p_period_start: body.period_start,
 p_period_end: body.period_end,
 p_branch_id: body.branch_id ?? null,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 const runId = (data as { run_id?: string })?.run_id ?? null;

 if (runId) {
 const updates: Record<string, unknown> = {};
 if (body.report_type) updates.report_type = String(body.report_type);
 if (legalEntityId) updates.legal_entity_id = legalEntityId;
 if (Object.keys(updates).length > 0) {
 await (service as SupabaseClient).from('payroll_runs').update(updates).eq('id', runId);
 }
 if (legalEntityId) {
 try {
 await scopePayrollRunToLegalEntity(service as SupabaseClient, runId, legalEntityId);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal asingkan payroll mengikut syarikat' },
 { status: 400 });
 }
 }
 }

 return NextResponse.json({ result: data });
}
