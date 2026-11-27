import { transferAction } from '@/lib/inventory/transfer-http';

// With JSON: record quantities against a receipt version and Idempotency-Key.
// Without a body: preserve the deployed full-receipt compatibility path.
export const POST = transferAction('complete_stock_transfer');
