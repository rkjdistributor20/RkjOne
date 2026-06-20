# RKJ One — Database Schema

Production PostgreSQL schema for Supabase. Multi-tenant via `organization_id` on all business tables.

## Architecture Overview

```
organizations
├── regions (Utara, Tengah, Selatan)
├── branches (36 kiosks)
├── profiles (auth.users extension)
├── staff, drivers, vehicles
├── products, stock_items, product_bom
├── inventory_locations → inventory_balances → stock_movements
├── pos_shifts → pos_transactions → pos_payments
├── staff_shifts → attendance_records
├── stock_transfers → transfer_legs (Factory→HQ→Vehicle→Branch)
├── payroll_rules, commission_tiers, payroll_runs
├── finance_collections, bank_in_records
├── approval_requests, notifications
└── role_permissions (RBAC matrix)
```

## Enums

| Enum | Values |
|------|--------|
| `user_role` | SUPER_ADMIN, ADMIN, HR, OPERATION_MANAGER, CEO_FACTORY, AREA_MANAGER, DRIVER, STAFF, FINANCE |
| `entity_status` | ACTIVE, INACTIVE, SUSPENDED |
| `region_code` | UTARA, TENGAH, SELATAN |
| `location_type` | FACTORY, HQ_WAREHOUSE, FLEET_VEHICLE, BRANCH_KIOSK |
| `payment_method` | CASH, QR, MIXED |
| `pos_tx_status` | COMPLETED, VOIDED, REFUNDED |
| `pos_shift_status` | OPEN, CLOSED |
| `transfer_status` | DRAFT, PENDING, IN_TRANSIT, DELIVERED, CANCELLED, REJECTED |
| `movement_type` | RECEIVE, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT, COUNT, WRITE_OFF, SALE_DEDUCT, PRODUCTION |
| `worker_type` | FOREIGN, LOCAL |
| `approval_status` | PENDING, APPROVED, REJECTED |
| `collection_type` | QR, CASH_KIOSK, MANAGER, THIRD_PARTY, BANK_IN |
| `collection_status` | PENDING, COLLECTED, BANKED, VERIFIED |
| `notification_type` | LOW_STOCK, CRITICAL_STOCK, PENDING_SHIFT, PENDING_APPROVAL, PENDING_BANK_IN, DELIVERY_STATUS |
| `permission_level` | NONE, VIEW, VIEW_AREA, FULL, FULL_OWN, OWN |

## Core Tables

### organizations
Single tenant (RKJ) with extensibility for future orgs.

### profiles
Extends `auth.users` with role, org, region/branch scope, employee link.

### branches
36 kiosk locations with region, area manager, geo coordinates.

## Module Mapping

| Module | Primary Tables |
|--------|----------------|
| POS | pos_shifts, pos_transactions, pos_transaction_items, pos_payments |
| Shift Management | shift_templates, staff_shifts, attendance_records |
| Inventory | inventory_locations, inventory_balances, stock_movements, stock_transfers |
| Fleet | vehicles, drivers, delivery_orders, delivery_legs, proof_of_delivery |
| Warehouse | stock_transfers (HQ scope), stock_audits |
| Payroll | payroll_rules, commission_tiers, payroll_runs, payroll_line_items |
| Finance | finance_collections, bank_in_records, cash_reconciliations |
| Reporting | Materialized views + query functions on transactional tables |

## RLS Strategy

1. All tables: `organization_id` match via JWT claim or profile lookup
2. SUPER_ADMIN / ADMIN: full org access
3. AREA_MANAGER: branch filter by `region_id`
4. STAFF / DRIVER: own branch or assigned deliveries only
5. Service role bypasses RLS for server-side API routes

## Migration Order

Apply **in numeric order** (`00001` → `00018`). See [supabase/README.md](../supabase/README.md) for full index.

| # | File | Summary |
|---|------|---------|
| 1 | `00001_extensions_enums.sql` | Extensions + enums |
| 2 | `00002_core_organization.sql` | Org, regions, branches, profiles, RBAC |
| 3 | `00003_master_data.sql` | Products, stock, BOM, shift/payroll rules |
| 4 | `00004_inventory.sql` | Inventory schema |
| 5 | `00005_pos.sql` | POS schema |
| 6 | `00006_shifts_payroll_finance.sql` | Shifts, payroll, finance schema |
| 7 | `00007_fleet_deliveries.sql` | Fleet + delivery schema |
| 8 | `00008_notifications_approvals.sql` | Notifications + approvals |
| 9 | `00009_rls_policies.sql` | RLS policies |
| 10 | `00010_functions_triggers.sql` | Functions, triggers, views |
| 11 | `00011_seed_data.sql` | Production seed data |
| 12 | `00012_pos_rpc.sql` | POS atomic RPCs |
| 13 | `00013_inventory_rpc.sql` | Inventory RPCs |
| 14 | `00014_shift_rpc.sql` | Shift RPCs |
| 15 | `00015_fleet_warehouse_rpc.sql` | Fleet + warehouse RPCs |
| 16 | `00016_payroll_rpc.sql` | Payroll RPCs |
| 17 | `00017_finance_rpc.sql` | Finance RPCs |
| 18 | `00018_approvals_rpc.sql` | Unified approval resolver |
