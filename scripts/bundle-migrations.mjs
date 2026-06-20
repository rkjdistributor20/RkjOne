/**
 * Gabungkan migration 00019–00030 untuk paste manual di Supabase SQL Editor.
 * Usage: node scripts/bundle-migrations.mjs
 * Output: docs/sql/00019_00030_manual_bundle.sql
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const OUT_DIR = path.join(ROOT, 'docs', 'sql');
const OUT_FILE = path.join(OUT_DIR, '00019_00030_manual_bundle.sql');

const FILES = [
  '00019_fleet_master_rls.sql',
  '00020_branch_status_rls.sql',
  '00021_pos_opening_stock.sql',
  '00022_missing_staff.sql',
  '00023_pos_stock_validation.sql',
  '00024_benggali_category_rename.sql',
  '00025_regions_rls_read.sql',
  '00026_product_prices.sql',
  '00027_planta_roti_kaya_bom.sql',
  '00028_planta_to_roti_kaya_stock.sql',
  '00029_roti_kelapa_kacang_benggali.sql',
  '00030_four_menus_only.sql',
];

const header = `-- RKJ One — Manual migration bundle (00019–00030)
-- Tarikh jana: ${new Date().toISOString().slice(0, 10)}
--
-- Guna jika: supabase db push gagal (remote/local history mismatch)
-- Cara: Supabase Dashboard → SQL Editor → paste & Run
--
-- PERINGATAN: Pastikan migration 00001–00018 sudah applied sebelum ini.
-- Jalankan sekali sahaja. Semak supabase_migrations.schema_migrations selepas berjaya.

`;

let body = '';
let missing = [];

for (const file of FILES) {
  const full = path.join(MIGRATIONS_DIR, file);
  if (!fs.existsSync(full)) {
    missing.push(file);
    continue;
  }
  const sql = fs.readFileSync(full, 'utf8').trim();
  body += `\n-- ============================================================\n`;
  body += `-- ${file}\n`;
  body += `-- ============================================================\n\n`;
  body += sql;
  body += '\n\n';
}

if (missing.length) {
  console.error('Fail migration tidak dijumpai:', missing.join(', '));
  process.exit(1);
}

body += `-- ============================================================
-- Rekod manual (optional — skip jika sudah wujud dalam schema_migrations)
-- ============================================================
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES
  ('00019_fleet_master_rls'),
  ('00020_branch_status_rls'),
  ('00021_pos_opening_stock'),
  ('00022_missing_staff'),
  ('00023_pos_stock_validation'),
  ('00024_benggali_category_rename'),
  ('00025_regions_rls_read'),
  ('00026_product_prices'),
  ('00027_planta_roti_kaya_bom'),
  ('00028_planta_to_roti_kaya_stock'),
  ('00029_roti_kelapa_kacang_benggali'),
  ('00030_four_menus_only')
ON CONFLICT (version) DO NOTHING;
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, header + body, 'utf8');
console.log(`==> Bundle ditulis: ${OUT_FILE}`);
console.log(`    ${FILES.length} fail migration`);
