-- Tambah role Manager Maintenance
-- Migration 00070

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'MAINTENANCE_MANAGER';
