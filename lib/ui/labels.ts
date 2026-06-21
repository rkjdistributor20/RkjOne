/** Label BM untuk UI — enum/status dari pangkalan data kekal dalam English */

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Tunai',
  QR: 'QR',
  MIXED: 'Campuran',
  CARD: 'Kad',
};

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Menunggu',
  APPROVED: 'Diluluskan',
  REJECTED: 'Ditolak',
};

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draf',
  PENDING: 'Menunggu',
  IN_TRANSIT: 'Dalam Perjalanan',
  DELIVERED: 'Sampai',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export const TRANSFER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Menunggu',
  DISPATCHED: 'Dihantar',
  IN_TRANSIT: 'Dalam Perjalanan',
  DELIVERED: 'Sampai',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  RECEIVE: 'Terima Stok',
  TRANSFER_IN: 'Pindah Masuk',
  TRANSFER_OUT: 'Pindah Keluar',
  ADJUSTMENT: 'Pelarasan',
  COUNT: 'Kiraan Stok',
  WRITE_OFF: 'Lupus / Reject',
  SALE_DEDUCT: 'Jualan POS',
};

export const STOCK_STATUS_LABELS: Record<string, string> = {
  OK: 'OK',
  LOW: 'Rendah',
  CRITICAL: 'Kritikal',
};

export const FLEET_VEHICLE_STATUS_LABELS: Record<string, string> = {
  Loading: 'Memuatkan',
  'In Transit': 'Dalam Perjalanan',
  'At Branch': 'Di Cawangan',
  Returning: 'Pulang',
};

export const APPROVAL_ENTITY_LABELS: Record<string, string> = {
  SHIFT: 'Syif',
  PAYROLL: 'Gaji',
  STOCK_ADJUSTMENT: 'Pelarasan Stok',
  STOCK_WRITE_OFF: 'Lupus Stok',
  STOCK_TRANSFER: 'Pindah Stok',
  VOID_SALE: 'Batal Jualan',
  REFUND: 'Bayaran Balik',
  BANK_IN: 'Bank Masuk',
  CASH_RECONCILIATION: 'Penyelarasan Tunai',
};

export function labelFor(
  map: Record<string, string>,
  value: string,
  fallback?: string
): string {
  return map[value] ?? fallback ?? value;
}
