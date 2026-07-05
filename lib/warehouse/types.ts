export interface WarehouseAudit {
 id: string;
 audit_number: string;
 audit_date: string;
 status: string;
 notes: string | null;
 created_at: string;
 location: { name: string };
 warehouse_audit_items?: Array<{
 system_quantity: number;
 audited_quantity: number;
 variance: number;
 unit: string;
 stock_item: { item_code: string; name: string };
 }>;
}

export interface WarehouseSummary {
 location: { id: string; name: string } | null;
 total_items: number;
 total_quantity: number;
 low_stock_count: number;
 pending_transfers: number;
 pending_deliveries: number;
}
