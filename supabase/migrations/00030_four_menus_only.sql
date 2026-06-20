-- Hanya 4 menu rasmi di POS; stok Packaging/Bahan/Roti kekal untuk inventory & BOM

UPDATE products
SET status = 'INACTIVE'::entity_status, updated_at = now()
WHERE category IS NOT NULL
  AND category NOT IN (
    'Roti Kaya', 'Roti Kacang', 'Roti Kelapa', 'Roti Benggali',
    'Kaya', 'Kacang', 'Kelapa', 'Benggali', 'Planta'
  );

UPDATE products SET category = 'Roti Kaya' WHERE category IN ('Kaya', 'Planta');
UPDATE products SET category = 'Roti Kacang' WHERE category = 'Kacang';
UPDATE products SET category = 'Roti Kelapa' WHERE category = 'Kelapa';
UPDATE products SET category = 'Roti Benggali' WHERE category = 'Benggali';
