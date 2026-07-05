/**
 * Sync 9 item stok rasmi RKJ ke Supabase - match POS & Gudang HQ.
 * Usage: npm run fix:hq-stock
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const RKJ_STOCK_CATALOG = [
 { item_code: 'ST-PLANTA', name: 'Roti Kaya', category: 'Roti', base_unit: 'PCS', storage_unit: 'Bag/Pcs', conversion_text: '1 bag = 20 pcs', pack_quantity: 20, pack_unit: 'BAG' },
 { item_code: 'ST-KELAPA', name: 'Roti Kelapa', category: 'Roti', base_unit: 'PCS', storage_unit: 'Bag/Pcs', conversion_text: '1 bag = 28 pcs', pack_quantity: 28, pack_unit: 'BAG' },
 { item_code: 'ST-KACANG', name: 'Roti Kacang', category: 'Roti', base_unit: 'PCS', storage_unit: 'Bag/Pcs', conversion_text: '1 bag = 24 pcs', pack_quantity: 24, pack_unit: 'BAG' },
 { item_code: 'ST-BENGGALI', name: 'Roti Benggali', category: 'Roti', base_unit: 'PCS', storage_unit: 'Bag/Pcs', conversion_text: '1 bag = 2 pcs', pack_quantity: 2, pack_unit: 'BAG' },
 { item_code: 'ST-KAYA', name: 'Kaya', category: 'Bahan', base_unit: 'GRAM', storage_unit: 'Tong/Kg/Gram', conversion_text: '1 tong = 5kg', pack_quantity: 5000, pack_unit: 'TONG' },
 { item_code: 'ST-BUTTER', name: 'Butter', category: 'Bahan', base_unit: 'GRAM', storage_unit: 'Tong/Kg/Gram', conversion_text: '1 tong = 4.8kg', pack_quantity: 4800, pack_unit: 'TONG' },
 { item_code: 'ST-PLASTIC-S', name: 'Plastic S', category: 'Packaging', base_unit: 'PCS', storage_unit: 'Bag/Pcs', conversion_text: '1 bag = 100 pcs', pack_quantity: 100, pack_unit: 'BAG' },
 { item_code: 'ST-PLASTIC-M', name: 'Plastic M', category: 'Packaging', base_unit: 'PCS', storage_unit: 'Bag/Pcs', conversion_text: '1 bag = 100 pcs', pack_quantity: 100, pack_unit: 'BAG' },
 { item_code: 'ST-PLASTIC-B', name: 'Plastic B', category: 'Packaging', base_unit: 'PCS', storage_unit: 'Bag/Pcs', conversion_text: '1 bag = 100 pcs', pack_quantity: 100, pack_unit: 'BAG' },
];

const LEGACY_ALIASES = {
 STK001: 'ST-PLANTA', STK002: 'ST-KELAPA', STK003: 'ST-KACANG', STK004: 'ST-BENGGALI',
 STK005: 'ST-KAYA', STK006: 'ST-BUTTER', PKG001: 'ST-PLASTIC-S', PKG002: 'ST-PLASTIC-M', PKG003: 'ST-PLASTIC-B',
};

function loadEnvFile(filePath) {
 if (!fs.existsSync(filePath)) return {};
 const out = {};
 for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
 const trimmed = line.trim();
 if (!trimmed || trimmed.startsWith('#')) continue;
 const eq = trimmed.indexOf('=');
 if (eq === -1) continue;
 out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
 }
 return out;
}

const env = { ...loadEnvFile(path.join(ROOT, '.env.local')), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
 console.error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
 process.exit(1);
}

const sb = createClient(url, serviceKey, {
 auth: { persistSession: false, autoRefreshToken: false },
});

console.log('\n=== Sync 9 Item Stok (POS = Gudang HQ) ===\n');

const { data: org } = await sb.from('organizations').select('id').limit(1).maybeSingle();
if (!org?.id) {
 console.error('Organization not found');
 process.exit(1);
}

for (const item of RKJ_STOCK_CATALOG) {
 const { error } = await sb
 .from('stock_items')
 .update({ ...item, status: 'ACTIVE' })
 .eq('organization_id', org.id)
 .eq('item_code', item.item_code);

 if (error) console.error(`✗ ${item.item_code}:`, error.message);
 else console.log(`✓ ${item.name} - ${item.conversion_text}`);
}

for (const [dupCode, canonCode] of Object.entries(LEGACY_ALIASES)) {
 const { data: dup } = await sb.from('stock_items').select('id').eq('organization_id', org.id).eq('item_code', dupCode).maybeSingle();
 const { data: canon } = await sb.from('stock_items').select('id').eq('organization_id', org.id).eq('item_code', canonCode).maybeSingle();
 if (!dup?.id || !canon?.id) continue;

 const { data: dupBals } = await sb.from('inventory_balances').select('id, location_id, quantity, unit, organization_id').eq('stock_item_id', dup.id);
 for (const bal of dupBals ?? []) {
 const { data: existing } = await sb.from('inventory_balances').select('id, quantity').eq('location_id', bal.location_id).eq('stock_item_id', canon.id).maybeSingle();
 if (existing?.id) {
 await sb.from('inventory_balances').update({ quantity: Number(existing.quantity) + Number(bal.quantity) }).eq('id', existing.id);
 } else {
 await sb.from('inventory_balances').insert({ organization_id: bal.organization_id, location_id: bal.location_id, stock_item_id: canon.id, quantity: bal.quantity, unit: bal.unit });
 }
 await sb.from('inventory_balances').delete().eq('id', bal.id);
 }
 await sb.from('stock_items').update({ status: 'INACTIVE' }).eq('id', dup.id);
}

const { data: hqLocs } = await sb.from('inventory_locations').select('id, name').eq('organization_id', org.id).eq('location_type', 'HQ_WAREHOUSE');
const canonical = hqLocs?.find((l) => l.name.toLowerCase().includes('teluk intan')) ?? hqLocs?.[0];
const duplicates = (hqLocs ?? []).filter((l) => l.id !== canonical?.id);

if (canonical && duplicates.length) {
 for (const dupLoc of duplicates) {
 const { data: dupBals } = await sb.from('inventory_balances').select('*').eq('location_id', dupLoc.id);
 for (const bal of dupBals ?? []) {
 const { data: existing } = await sb.from('inventory_balances').select('id, quantity').eq('location_id', canonical.id).eq('stock_item_id', bal.stock_item_id).maybeSingle();
 if (existing?.id) {
 await sb.from('inventory_balances').update({ quantity: Number(existing.quantity) + Number(bal.quantity) }).eq('id', existing.id);
 } else {
 await sb.from('inventory_balances').insert({ organization_id: bal.organization_id, location_id: canonical.id, stock_item_id: bal.stock_item_id, quantity: bal.quantity, unit: bal.unit });
 }
 }
 await sb.from('inventory_balances').delete().eq('location_id', dupLoc.id);
 await sb.from('inventory_locations').update({ is_active: false, name: `${dupLoc.name} (legacy)` }).eq('id', dupLoc.id);
 console.log(`✓ Gabung lokasi HQ ke ${canonical.name}`);
 }
}

const codes = RKJ_STOCK_CATALOG.map((i) => i.item_code);
const { count } = await sb.from('stock_items').select('*', { count: 'exact', head: true }).eq('organization_id', org.id).eq('status', 'ACTIVE').in('item_code', codes);
console.log(`\n✓ ${count}/9 item aktif - selaras POS & Gudang HQ\n`);
