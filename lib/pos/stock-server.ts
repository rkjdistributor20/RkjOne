import type { SupabaseClient } from '@supabase/supabase-js';
import {
  kioskStockStatus,
  POS_MENU_CATEGORIES,
  POS_MENU_STOCK_CODES,
  POS_SUPPLEMENT_STOCK,
  toKioskStockDisplay,
  type KioskStockRowConfig,
  type PosMenuCategory,
} from '@/lib/pos/utils';
import type { MenuStockBalance, ProductStockInfo, StockStatus } from '@/lib/pos/types';

function stockStatus(qty: number): StockStatus {
  if (qty <= 0) return 'OUT';
  if (qty <= 5) return 'LOW';
  return 'OK';
}

type StockItemRow = {
  id: string;
  item_code: string;
  name: string;
  base_unit: string;
  pack_quantity: number | null;
};

function buildBalanceRow(
  config: KioskStockRowConfig & { name: string },
  quantity: number,
  balanceUnit: string,
  packQuantity: number | null,
  group: 'menu' | 'supplement'
): MenuStockBalance {
  const { displayQuantity, displayUnit, statusValue } = toKioskStockDisplay(
    quantity,
    balanceUnit,
    config.display,
    packQuantity
  );

  return {
    key: config.key,
    label: config.label,
    itemCode: config.itemCode,
    name: config.name,
    quantity,
    unit: balanceUnit,
    displayQuantity,
    displayUnit,
    status: kioskStockStatus(statusValue, config.display),
    group,
  };
}

async function fetchBalancesForCodes(
  supabase: SupabaseClient,
  locationId: string,
  configs: KioskStockRowConfig[],
  group: 'menu' | 'supplement'
): Promise<MenuStockBalance[]> {
  const codes = configs.map((c) => c.itemCode);
  if (!codes.length) return [];

  const { data: items } = await supabase
    .from('stock_items')
    .select('id, item_code, name, base_unit, pack_quantity')
    .in('item_code', codes);

  if (!items?.length) return [];

  const itemByCode = new Map(
    (items as StockItemRow[]).map((i) => [i.item_code, i])
  );

  const { data: balances } = await supabase
    .from('inventory_balances')
    .select('stock_item_id, quantity, unit')
    .eq('location_id', locationId)
    .in(
      'stock_item_id',
      items.map((i) => i.id)
    );

  const balanceByItemId = new Map(
    (balances ?? []).map((b) => [
      b.stock_item_id,
      { quantity: Number(b.quantity), unit: b.unit as string },
    ])
  );

  return configs.flatMap((config) => {
    const item = itemByCode.get(config.itemCode);
    if (!item) return [];

    const balance = balanceByItemId.get(item.id);
    const quantity = balance?.quantity ?? 0;
    const unit = balance?.unit ?? item.base_unit ?? 'pcs';

    return [
      buildBalanceRow(
        { ...config, name: item.name },
        quantity,
        unit,
        item.pack_quantity,
        group
      ),
    ];
  });
}

export async function getKioskLocationId(
  supabase: SupabaseClient,
  branchId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('inventory_locations')
    .select('id')
    .eq('branch_id', branchId)
    .eq('location_type', 'BRANCH_KIOSK')
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function fetchMenuStockBalances(
  supabase: SupabaseClient,
  locationId: string
): Promise<Record<string, MenuStockBalance>> {
  const menuConfigs: KioskStockRowConfig[] = POS_MENU_CATEGORIES.map((menu) => ({
    key: menu,
    itemCode: POS_MENU_STOCK_CODES[menu as PosMenuCategory],
    label: menu,
    display: 'pcs' as const,
  }));

  const rows = await fetchBalancesForCodes(
    supabase,
    locationId,
    menuConfigs,
    'menu'
  );

  return Object.fromEntries(rows.map((row) => [row.key, row]));
}

export async function fetchSupplementStockBalances(
  supabase: SupabaseClient,
  locationId: string
): Promise<MenuStockBalance[]> {
  return fetchBalancesForCodes(
    supabase,
    locationId,
    POS_SUPPLEMENT_STOCK,
    'supplement'
  );
}

export async function computeProductAvailability(
  supabase: SupabaseClient,
  orgId: string,
  locationId: string
): Promise<Record<string, ProductStockInfo>> {
  const { data: products } = await supabase
    .from('products')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'ACTIVE');

  if (!products?.length) return {};

  const productIds = products.map((p) => p.id);

  const { data: bomRows } = await supabase
    .from('product_bom')
    .select('product_id, stock_item_id, quantity')
    .in('product_id', productIds)
    .eq('auto_deduct', true);

  if (!bomRows?.length) return {};

  const stockItemIds = [...new Set(bomRows.map((b) => b.stock_item_id))];

  const { data: balances } = await supabase
    .from('inventory_balances')
    .select('stock_item_id, quantity')
    .eq('location_id', locationId)
    .in('stock_item_id', stockItemIds);

  const balanceByItem = new Map(
    (balances ?? []).map((b) => [b.stock_item_id, Number(b.quantity)])
  );

  const bomByProduct = new Map<
    string,
    Array<{ stock_item_id: string; quantity: number }>
  >();
  for (const row of bomRows) {
    const list = bomByProduct.get(row.product_id) ?? [];
    list.push({
      stock_item_id: row.stock_item_id,
      quantity: Number(row.quantity),
    });
    bomByProduct.set(row.product_id, list);
  }

  const result: Record<string, ProductStockInfo> = {};

  for (const product of products) {
    const lines = bomByProduct.get(product.id);
    if (!lines?.length) continue;

    let productMax: number | null = null;

    for (const line of lines) {
      if (line.quantity <= 0) continue;
      const balance = balanceByItem.get(line.stock_item_id) ?? 0;
      const max = Math.floor(balance / line.quantity);
      productMax = productMax === null ? max : Math.min(productMax, max);
    }

    if (productMax !== null) {
      result[product.id] = {
        available: productMax,
        status: stockStatus(productMax),
      };
    }
  }

  return result;
}
