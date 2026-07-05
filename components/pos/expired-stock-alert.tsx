'use client';

import { AlertTriangle, Clock } from 'lucide-react';
import { formatBagPcsLabel, resolvePackQuantity } from '@/lib/stock/catalog';
import {
 formatExpiryDate,
 groupExpiredForReject,
 type ExpiredRotiBatch,
 type ExpiringSoonRotiBatch,
 type RotiExpirySummary,
} from '@/lib/stock/expiry';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ExpiredRejectPrefill {
 stock_item_id: string;
 quantity: number;
 unit: string;
 reason: string;
}

interface ExpiredStockAlertProps {
 summary: RotiExpirySummary | null;
 canReject: boolean;
 onRejectExpired?: (prefill: ExpiredRejectPrefill[]) => void;
 className?: string;
}

function formatRotiQty(itemCode: string, qty: number, unit: string) {
 const pack = resolvePackQuantity(itemCode, null);
 if (unit.toUpperCase() === 'PCS' && pack) {
 return formatBagPcsLabel(qty, pack);
 }
 return `${Number(qty).toLocaleString('ms-MY')} ${unit.toLowerCase()}`;
}

function ExpiredRow({ batch }: { batch: ExpiredRotiBatch }) {
 return (
 <li className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
 <span className="font-medium">{batch.pos_menu}</span>
 <span className="text-red-900">
 {formatRotiQty(batch.item_code, batch.quantity_remaining, batch.unit)}
 <span className="ml-2 text-xs text-red-800/80">
 prod {formatExpiryDate(batch.production_date)} - expired{' '}
 {formatExpiryDate(batch.expires_on)}
 </span>
 </span>
 </li>);
}

function ExpiringRow({ batch }: { batch: ExpiringSoonRotiBatch }) {
 return (
 <li className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-amber-950">
 <span>{batch.pos_menu}</span>
 <span>
 {formatRotiQty(batch.item_code, batch.quantity_remaining, batch.unit)}
 <span className="ml-2 text-xs opacity-80">
 luput {formatExpiryDate(batch.expires_on)} (
 {batch.days_until_expiry === 0 ? 'hari ini' : 'esok'})
 </span>
 </span>
 </li>);
}

export function ExpiredStockAlert({
 summary,
 canReject,
 onRejectExpired,
 className,
}: ExpiredStockAlertProps) {
 if (!summary) return null;

 const hasExpired = summary.has_expired && summary.expired.length > 0;
 const hasExpiringSoon = summary.expiring_soon.length > 0;

 if (!hasExpired && !hasExpiringSoon) return null;

 function handleRejectAll() {
 if (!onRejectExpired || !summary?.expired.length) return;
 const grouped = groupExpiredForReject(summary.expired);
 onRejectExpired(
 grouped.map((g) => ({
 stock_item_id: g.stock_item_id,
 quantity: g.quantity,
 unit: g.unit,
 reason: `Roti expired - tolak segera (prod + ${summary.shelf_life_days} hari)`,
 })));
 }

 return (
 <div className={cn('space-y-3', className)}>
 {hasExpired && (
 <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 shadow-sm">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div className="flex gap-3">
 <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
 <div>
 <p className="font-semibold text-red-950">
 Roti expired - wajib reject stok
 </p>
 <p className="mt-1 text-sm text-red-900/90">
 Semua roti ada shelf life <strong>{summary.shelf_life_days} hari</strong>{' '}
 dari tarikh production. Stok di bawah sudah luput - jangan dijual. Tolak
 melalui tab <strong>Reject Stok</strong>.
 </p>
 <ul className="mt-3 space-y-1.5 border-t border-red-200 pt-3">
 {summary.expired.map((b) => (
 <ExpiredRow key={b.batch_id} batch={b} />))}
 </ul>
 </div>
 </div>
 {canReject && onRejectExpired && (
 <Button
 type="button"
 variant="destructive"
 className="shrink-0"
 onClick={handleRejectAll}
 >
 Reject Semua Expired
 </Button>)}
 </div>
 </div>)}

 {hasExpiringSoon && (
 <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
 <div className="flex gap-2">
 <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
 <div>
 <p className="text-sm font-medium text-amber-950">
 Roti hampir luput - jual dahulu atau reject esok
 </p>
 <ul className="mt-2 space-y-1">
 {summary.expiring_soon.map((b) => (
 <ExpiringRow key={`${b.stock_item_id}-${b.expires_on}`} batch={b} />))}
 </ul>
 </div>
 </div>
 </div>)}
 </div>);
}
