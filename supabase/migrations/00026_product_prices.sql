-- Pastikan harga POS ikut senarai rasmi (jika rekod wujud tanpa harga / RM 0)

UPDATE products p
SET price = v.price, updated_at = now()
FROM organizations o,
     (VALUES
       ('RK-KB-3', 10.0),
       ('RK-KB-1', 3.5),
       ('RK-KO-3', 7.0),
       ('RK-KO-1', 2.5),
       ('RKEL-K-3', 10.0),
       ('RKEL-K-1', 3.5),
       ('RKEL-3', 7.0),
       ('RKEL-1', 2.5),
       ('RKAC-K-3', 11.0),
       ('RKAC-K-1', 4.0),
       ('RKAC-3', 8.0),
       ('RKAC-1', 3.0),
       ('BENG-KB', 12.5),
       ('BENG-KO', 9.0),
       ('BENG-PL', 7.0),
       ('KAYA-CUP', 5.0)
     ) AS v(sku, price)
WHERE p.organization_id = o.id
  AND o.code = 'RKJ'
  AND p.sku = v.sku
  AND (p.price IS NULL OR p.price = 0);
