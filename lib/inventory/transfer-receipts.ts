import { fetchJson } from '@/lib/client/fetch-json';
import type { StockTransferRow } from './types';

type ListedLine = NonNullable<StockTransferRow['stock_transfer_items']>[number];
type ReceiptLine = { item_id: string; quantity: number };

export interface TransferReceiptDocument extends StockTransferRow {
 receipt_version?: number;
 legacy_full_receipt_only?: boolean;
 stock_transfer_items?: Array<ListedLine & { id?: string; received_quantity?: number | null }>;
 receipts?: Array<{
  version: number; created_at: string; reason: string | null; closed: boolean;
  items: ReceiptLine[]; excess_items: ReceiptLine[];
 }>;
 can_reverse?: boolean;
 reversal_number?: string | null;
 reversal_status?: string | null;
 reversal_of_number?: string | null;
 reversal_reason?: string | null;
}

export interface TransferReceiptInput {
 receipt_version: number;
 items: ReceiptLine[];
 finalize: boolean;
 reason: string | null;
}

export function receiveTransfer(id: string, input: TransferReceiptInput, requestId: string) {
 return fetchJson<{ result: { transfer_id: string; receipt_version: number; status: 'DELIVERED' | 'IN_TRANSIT' } }>(
  `/api/inventory/transfers/${id}/complete`,
  { method: 'POST', headers: { 'Idempotency-Key': requestId }, body: JSON.stringify(input) },
 );
}

export function reverseTransfer(id: string, reason: string) {
 return fetchJson<{ result: { transfer_id: string; transfer_number: string } }>(
  `/api/inventory/transfers/${id}/reverse`,
  { method: 'POST', body: JSON.stringify({ reason }) },
 );
}
