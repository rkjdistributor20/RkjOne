import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { canAccessSalesAgent } from '@/lib/auth/permissions';
import { createServiceClient } from '@/lib/supabase/server';
import { getAgentAccountForProfile, isAgentPaymentExempt } from '@/lib/sales-agent/service';

const SELECT_COLUMNS = 'id, agent_account_id, outlet_id, full_name, phone, email, role_title, duty_scope, status, created_at, updated_at, outlet:agent_outlets(id, outlet_code, outlet_name)';

async function agentHasActivePosSubscription(db: SupabaseClient, agentAccountId: string) {
 const today = new Date().toISOString().slice(0, 10);
 const { data } = await db.from('agent_outlet_subscriptions').select('id, outlet:agent_outlets!inner(agent_account_id)').eq('status', 'ACTIVE').lte('period_start', today).gte('period_end', today).eq('outlet.agent_account_id', agentAccountId).limit(1);

 return Boolean(data?.length);
}

async function requireSalesStaffAccess() {
 const profile = await getCurrentProfile();
 if (!profile) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
 if (!canAccessSalesAgent(profile.role)) {
 return { error: NextResponse.json({ error: 'Akses ditolak' }, { status: 403 }) };
 }

 const service = await createServiceClient();
 const account = await getAgentAccountForProfile(service, profile.id, profile.organization_id);
 if (!account) {
 return { error: NextResponse.json({ error: 'Akaun ejen tidak dijumpai' }, { status: 404 }) };
 }

 const db = service as SupabaseClient;
 const exempt = await isAgentPaymentExempt(service, account);
 const hasActivePos = exempt || await agentHasActivePosSubscription(db, account.id);
 if (!hasActivePos) {
 return { error: NextResponse.json({ error: 'Langgan POS syarikat diperlukan untuk guna fungsi Staf Jualan' }, { status: 403 }) };
 }

 return { profile, service, account };
}

function cleanText(value: unknown) {
 const text = typeof value === 'string' ? value.trim() : '';
 return text.length ? text : null;
}

export async function GET() {
 const ctx = await requireSalesStaffAccess();
 if ('error' in ctx) return ctx.error;

 const db = ctx.service as SupabaseClient;
 const { data, error } = await db.from('agent_sales_staff').select(SELECT_COLUMNS).eq('organization_id', ctx.profile.organization_id).eq('agent_account_id', ctx.account.id).order('created_at', { ascending: false });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ staff: data ?? [] });
}

export async function POST(req: NextRequest) {
 const ctx = await requireSalesStaffAccess();
 if ('error' in ctx) return ctx.error;

 const body = await req.json().catch(() => ({}));
 const fullName = cleanText(body.full_name);
 if (!fullName) {
 return NextResponse.json({ error: 'Nama staf jualan diperlukan' }, { status: 400 });
 }

 const outletId = cleanText(body.outlet_id);
 if (outletId) {
 const db = ctx.service as SupabaseClient;
 const { data: outlet } = await db.from('agent_outlets').select('id').eq('id', outletId).eq('agent_account_id', ctx.account.id).maybeSingle();
 if (!outlet) return NextResponse.json({ error: 'Outlet/POS tidak sah untuk Ejen Khas ini' }, { status: 400 });
 }

 const db = ctx.service as SupabaseClient;
 const { data, error } = await db.from('agent_sales_staff').insert({
 organization_id: ctx.profile.organization_id,
 agent_account_id: ctx.account.id,
 outlet_id: outletId,
 full_name: fullName,
 phone: cleanText(body.phone),
 email: cleanText(body.email),
 role_title: cleanText(body.role_title) ?? 'Staf Jualan',
 duty_scope: cleanText(body.duty_scope),
 status: 'ACTIVE',
 created_by: ctx.profile.id,
 }).select(SELECT_COLUMNS).single();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ staff: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
 const ctx = await requireSalesStaffAccess();
 if ('error' in ctx) return ctx.error;

 const body = await req.json().catch(() => ({}));
 const id = cleanText(body.id);
 if (!id) return NextResponse.json({ error: 'ID staf diperlukan' }, { status: 400 });

 const db = ctx.service as SupabaseClient;
 const { data: existing } = await db.from('agent_sales_staff').select('id').eq('id', id).eq('agent_account_id', ctx.account.id).maybeSingle();
 if (!existing) return NextResponse.json({ error: 'Staf jualan tidak dijumpai' }, { status: 404 });

 const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
 if ('full_name' in body) update.full_name = cleanText(body.full_name);
 if ('phone' in body) update.phone = cleanText(body.phone);
 if ('email' in body) update.email = cleanText(body.email);
 if ('role_title' in body) update.role_title = cleanText(body.role_title) ?? 'Staf Jualan';
 if ('duty_scope' in body) update.duty_scope = cleanText(body.duty_scope);
 if ('status' in body && ['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(String(body.status))) {
 update.status = body.status;
 }
 if ('outlet_id' in body) {
 const outletId = cleanText(body.outlet_id);
 if (outletId) {
 const { data: outlet } = await db.from('agent_outlets').select('id').eq('id', outletId).eq('agent_account_id', ctx.account.id).maybeSingle();
 if (!outlet) return NextResponse.json({ error: 'Outlet/POS tidak sah untuk Ejen Khas ini' }, { status: 400 });
 }
 update.outlet_id = outletId;
 }

 const { data, error } = await db.from('agent_sales_staff').update(update).eq('id', id).eq('agent_account_id', ctx.account.id).select(SELECT_COLUMNS).single();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ staff: data });
}
