-- RKJ One: Extensions and custom enums
-- Migration 00001

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM (
 'SUPER_ADMIN',
 'ADMIN',
 'HR',
 'OPERATION_MANAGER',
 'CEO_FACTORY',
 'AREA_MANAGER',
 'DRIVER',
 'STAFF',
 'FINANCE'
);

CREATE TYPE entity_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

CREATE TYPE region_code AS ENUM ('UTARA', 'TENGAH', 'SELATAN');

CREATE TYPE location_type AS ENUM (
 'FACTORY',
 'HQ_WAREHOUSE',
 'FLEET_VEHICLE',
 'BRANCH_KIOSK'
);

CREATE TYPE payment_method AS ENUM ('CASH', 'QR', 'MIXED');

CREATE TYPE pos_tx_status AS ENUM ('COMPLETED', 'VOIDED', 'REFUNDED');

CREATE TYPE pos_shift_status AS ENUM ('OPEN', 'CLOSED');

CREATE TYPE transfer_status AS ENUM (
 'DRAFT',
 'PENDING',
 'IN_TRANSIT',
 'DELIVERED',
 'CANCELLED',
 'REJECTED'
);

CREATE TYPE movement_type AS ENUM (
 'RECEIVE',
 'TRANSFER_OUT',
 'TRANSFER_IN',
 'ADJUSTMENT',
 'COUNT',
 'WRITE_OFF',
 'SALE_DEDUCT',
 'PRODUCTION'
);

CREATE TYPE worker_type AS ENUM ('FOREIGN', 'LOCAL');

CREATE TYPE approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TYPE collection_type AS ENUM (
 'QR',
 'CASH_KIOSK',
 'MANAGER',
 'THIRD_PARTY',
 'BANK_IN'
);

CREATE TYPE collection_status AS ENUM (
 'PENDING',
 'COLLECTED',
 'BANKED',
 'VERIFIED'
);

CREATE TYPE notification_type AS ENUM (
 'LOW_STOCK',
 'CRITICAL_STOCK',
 'PENDING_SHIFT',
 'PENDING_APPROVAL',
 'PENDING_BANK_IN',
 'DELIVERY_STATUS'
);

CREATE TYPE permission_level AS ENUM (
 'NONE',
 'VIEW',
 'VIEW_AREA',
 'FULL',
 'FULL_OWN',
 'OWN'
);

CREATE TYPE approval_entity_type AS ENUM (
 'STOCK_TRANSFER',
 'STOCK_ADJUSTMENT',
 'STOCK_WRITE_OFF',
 'VOID_SALE',
 'REFUND',
 'SHIFT',
 'PAYROLL',
 'BANK_IN',
 'CASH_RECONCILIATION'
);

CREATE TYPE stock_unit AS ENUM ('PCS', 'GRAM', 'KG', 'BAG', 'PACK', 'TONG', 'SET', 'CUP');

CREATE TYPE payroll_period AS ENUM ('PER_SHIFT', 'HOURLY', 'MONTHLY', 'ONE_TIME');

CREATE TYPE delivery_leg_type AS ENUM (
 'FACTORY_TO_HQ',
 'HQ_TO_VEHICLE',
 'VEHICLE_TO_VEHICLE',
 'VEHICLE_TO_BRANCH'
);
