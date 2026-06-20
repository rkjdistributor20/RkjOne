-- Kategori & nama menu Benggali → Roti Benggali

UPDATE products
SET category = 'Roti Benggali'
WHERE category = 'Benggali';

UPDATE products
SET name = 'Roti Benggali - Kaya In Cup'
WHERE sku = 'KAYA-CUP' AND name = 'Kaya In Cup';
