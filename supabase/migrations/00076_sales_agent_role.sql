-- Peranan Ejen Jualan — mesti migration berasingan (Postgres enum commit)
-- Migration 00076

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SALES_AGENT';
