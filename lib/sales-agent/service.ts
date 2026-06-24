import type { SupabaseClient } from '@supabase/supabase-js';
import { AGENT_POS_SUBSCRIPTION_RM } from '@/lib/brand/legal-entities';
import {
  expireAgentSubscriptions,
  getEffectivePaymentMode,
  isLivePaymentGatewayConfigured,
} from './payment-gateway';
import type { AgentDashboardData, ProductionDayOption, StockCatalogItem } from './types';

export { AGENT_POS_SUBSCRIPTION_RM };

export async function getAgentAccountForProfile(
  service: SupabaseClient,
  profileId: string,
  organizationId: string
) {
  const { data } = await service
    .from('sales_agent_accounts')
    .select('*')
    .eq('profile_id', profileId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  return data;
}

export async function ensureAgentAccount(
  service: SupabaseClient,
  profileId: string,
  organizationId: string,
  legalEntityId: string,
  payload: {
    company_name: string;
    registration_no?: string;
    contact_person?: string;
    contact_phone?: string;
    contact_email?: string;
    business_address?: string;
  }
) {
  const existing = await getAgentAccountForProfile(service, profileId, organizationId);
  if (existing) return existing;

  const { data, error } = await service
    .from('sales_agent_accounts')
    .insert({
      organization_id: organizationId,
      legal_entity_id: legalEntityId,
      profile_id: profileId,
      company_name: payload.company_name,
      registration_no: payload.registration_no ?? null,
      contact_person: payload.contact_person ?? null,
      contact_phone: payload.contact_phone ?? null,
      contact_email: payload.contact_email ?? null,
      business_address: payload.business_address ?? null,
      status: 'ACTIVE',
      approved_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function loadProductionDayOptions(
  service: SupabaseClient,
  organizationId: string
): Promise<ProductionDayOption[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: weeks } = await service
    .from('factory_production_weeks')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('status', 'PUBLISHED');

  const weekIds = (weeks ?? []).map((w) => w.id as string);
  if (!weekIds.length) return [];

  const { data: days } = await service
    .from('factory_production_days')
    .select('production_date, orders_locked')
    .in('week_id', weekIds)
    .gte('production_date', today)
    .order('production_date')
    .limit(14);

  const options: ProductionDayOption[] = [];
  for (const d of days ?? []) {
    const { data: open } = await (service as SupabaseClient).rpc('is_factory_order_window_open', {
      p_org_id: organizationId,
      p_production_date: d.production_date,
    } as never);
    options.push({
      production_date: d.production_date as string,
      orders_locked: Boolean(d.orders_locked),
      window_open: Boolean(open),
      cutoff_at: null,
    });
  }
  return options;
}

export async function loadStockCatalog(
  service: SupabaseClient,
  organizationId: string
): Promise<StockCatalogItem[]> {
  const [{ data: items }, { data: products }] = await Promise.all([
    service
      .from('stock_items')
      .select('id, item_code, name, category, base_unit, pack_quantity')
      .eq('organization_id', organizationId)
      .eq('status', 'ACTIVE')
      .eq('category', 'Roti')
      .order('name'),
    service.from('products').select('sku, price, category').eq('organization_id', organizationId),
  ]);

  const byCategory = new Map<string, Array<{ sku: string; price: number }>>();
  for (const p of products ?? []) {
    const cat = p.category as string;
    const list = byCategory.get(cat) ?? [];
    list.push({ sku: p.sku as string, price: Number(p.price ?? 0) });
    byCategory.set(cat, list);
  }

  return (items ?? []).map((i) => {
    const catProducts = byCategory.get(i.name as string) ?? [];
    const singleUnit = catProducts.filter((p) => /-1$/.test(p.sku) || /-KB-1$/.test(p.sku));
    const unitPc =
      singleUnit.length > 0
        ? Math.min(...singleUnit.map((p) => p.price))
        : catProducts.length > 0
          ? Math.min(...catProducts.map((p) => p.price))
          : 0;
    const packQty = Number(i.pack_quantity ?? 1);
    const unitPrice = Math.round(unitPc * packQty * 100) / 100;

    return {
      id: i.id as string,
      item_code: i.item_code as string,
      item_name: i.name as string,
      unit: i.base_unit as string,
      unit_price_rm: unitPrice,
    };
  });
}

export async function buildAgentDashboard(
  service: SupabaseClient,
  profileId: string,
  organizationId: string
): Promise<AgentDashboardData> {
  await expireAgentSubscriptions(service, organizationId);

  const account = await getAgentAccountForProfile(service, profileId, organizationId);

  if (!account) {
    return {
      account: null,
      outlets: [],
      orders: [],
      payments: [],
      production_days: await loadProductionDayOptions(service, organizationId),
      subscription_monthly_rm: AGENT_POS_SUBSCRIPTION_RM,
      stats: { pending_orders: 0, active_outlets: 0, factory_submitted: 0 },
      payment_gateway: {
        mode: getEffectivePaymentMode(),
        ipay88_configured: isLivePaymentGatewayConfigured(),
      },
    };
  }

  const [{ data: outlets }, { data: orders }, { data: payments }] = await Promise.all([
    service.from('agent_outlets').select('*').eq('agent_account_id', account.id).order('outlet_name'),
    service
      .from('agent_stock_orders')
      .select('*, items:agent_stock_order_items(*)')
      .eq('agent_account_id', account.id)
      .order('created_at', { ascending: false })
      .limit(20),
    service
      .from('agent_online_payments')
      .select('id, purpose, amount_rm, payment_method, status, created_at')
      .eq('agent_account_id', account.id)
      .order('created_at', { ascending: false })
      .limit(15),
  ]);

  const orderRows = (orders ?? []).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    production_date: o.production_date,
    status: o.status,
    total_amount_rm: Number(o.total_amount_rm),
    notes: o.notes,
    submitted_at: o.submitted_at,
    items: (o.items ?? []).map((it: Record<string, unknown>) => ({
      id: it.id as string,
      stock_item_id: it.stock_item_id as string,
      quantity: Number(it.quantity),
      unit: it.unit as string,
      unit_price_rm: Number(it.unit_price_rm),
      line_total_rm: Number(it.line_total_rm),
    })),
  }));

  const outletIds = (outlets ?? []).map((o) => o.id as string);
  const subscriptionByOutlet = new Map<
    string,
    { status: string; period_start: string; period_end: string; amount_rm: number }
  >();

  if (outletIds.length) {
    const { data: subs } = await service
      .from('agent_outlet_subscriptions')
      .select('outlet_id, status, period_start, period_end, amount_rm')
      .in('outlet_id', outletIds)
      .order('period_end', { ascending: false });

    const today = new Date().toISOString().slice(0, 10);
    for (const s of subs ?? []) {
      const oid = s.outlet_id as string;
      if (subscriptionByOutlet.has(oid)) continue;
      const active =
        s.status === 'ACTIVE' &&
        (s.period_start as string) <= today &&
        (s.period_end as string) >= today;
      if (active || s.status === 'PENDING' || s.status === 'EXPIRED') {
        subscriptionByOutlet.set(oid, {
          status: s.status as string,
          period_start: s.period_start as string,
          period_end: s.period_end as string,
          amount_rm: Number(s.amount_rm),
        });
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const outletRows = (outlets ?? []).map((o) => {
    const sub = subscriptionByOutlet.get(o.id as string) ?? null;
    const isActive =
      Boolean(o.subscription_active && o.pos_enabled) &&
      sub?.status === 'ACTIVE' &&
      sub.period_start <= today &&
      sub.period_end >= today;

    return {
      id: o.id,
      outlet_code: o.outlet_code,
      outlet_name: o.outlet_name,
      address_line: o.address_line,
      city: o.city,
      state: o.state,
      postcode: o.postcode,
      pos_enabled: isActive,
      subscription_active: isActive,
      status: o.status,
      subscription: sub,
    };
  });

  return {
    account: {
      id: account.id,
      company_name: account.company_name,
      registration_no: account.registration_no,
      contact_person: account.contact_person,
      contact_phone: account.contact_phone,
      contact_email: account.contact_email,
      business_address: account.business_address,
      status: account.status,
    },
    outlets: outletRows,
    orders: orderRows,
    payments: (payments ?? []) as AgentDashboardData['payments'],
    production_days: await loadProductionDayOptions(service, organizationId),
    subscription_monthly_rm: AGENT_POS_SUBSCRIPTION_RM,
    stats: {
      pending_orders: orderRows.filter((o) =>
        ['DRAFT', 'PENDING_PAYMENT'].includes(o.status)
      ).length,
      active_outlets: outletRows.filter((o) => o.subscription_active).length,
      factory_submitted: orderRows.filter((o) =>
        ['SUBMITTED_FACTORY', 'ACKNOWLEDGED', 'FULFILLED'].includes(o.status)
      ).length,
    },
    payment_gateway: {
      mode: getEffectivePaymentMode(),
      ipay88_configured: isLivePaymentGatewayConfigured(),
    },
  };
}

export async function agentHasPosAccess(
  service: SupabaseClient,
  profileId: string
): Promise<boolean> {
  const { data: account } = await service
    .from('sales_agent_accounts')
    .select('id, organization_id')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (!account) return false;

  await expireAgentSubscriptions(service, account.organization_id as string);

  const today = new Date().toISOString().slice(0, 10);
  const { data: outlets } = await service
    .from('agent_outlets')
    .select('id')
    .eq('agent_account_id', account.id)
    .eq('pos_enabled', true)
    .eq('subscription_active', true);

  for (const o of outlets ?? []) {
    const { data: active } = await (service as SupabaseClient).rpc(
      'agent_outlet_has_active_subscription',
      { p_outlet_id: o.id } as never
    );
    if (active) return true;
  }

  return false;
}
