'use client';

import { usePosStore } from '@/stores/pos-store';
import { POS_ROTI_MENU_CATEGORIES, formatKioskStockLabel } from '@/lib/pos/utils';
import type { MenuStockBalance } from '@/lib/pos/types';
import { cn } from '@/lib/utils';

function balanceLabel(b: MenuStockBalance | undefined) {
 if (!b) return ' - ';
 return formatKioskStockLabel(b);
}

function pendingLabel(b: MenuStockBalance) {
 if (!b.pendingCount) return null;
 return formatKioskStockLabel({
 displayQuantity: b.pendingCount.displayQuantity,
 displayUnit: b.pendingCount.displayUnit,
 displayBags: b.pendingCount.displayBags,
 displayRemainderPcs: b.pendingCount.displayRemainderPcs,
 packQuantity: b.pendingCount.packQuantity ?? b.packQuantity,
 itemCode: b.itemCode,
 });
}

function checkTypeLabel(type?: NonNullable<MenuStockBalance['pendingCount']>['checkType']) {
 if (type === 'OPENING') return 'Opening';
 if (type === 'MID_SHIFT') return 'Mid syif';
 if (type === 'CLOSE_SHIFT') return 'Tutup syif';
 return 'Kiraan staf';
}

function statusClass(status?: MenuStockBalance['status']) {
 if (status === 'OUT') return 'border-destructive/40 bg-destructive/5 text-destructive';
 if (status === 'LOW') return 'border-orange-300 bg-orange-50 text-orange-900';
 return 'border-border bg-muted/40 text-foreground';
}

function StockCard({
 balance,
 subtitle,
}: {
 balance?: MenuStockBalance;
 subtitle: string;
}) {
 const pending = balance ? pendingLabel(balance) : null;
 return (
 <div className={cn('rounded-lg border px-3 py-2', statusClass(balance?.status))}>
 <p className="truncate text-[11px] font-medium uppercase tracking-wide opacity-80">
 {balance?.label ?? ' - '}
 </p>
 <p className="mt-0.5 text-base font-bold tabular-nums leading-snug sm:text-lg">
 {balanceLabel(balance)}
 </p>
 <p className="mt-1 text-[10px] opacity-70">{subtitle}</p>
 {balance?.pendingCount && pending && (
 <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-950">
 <p className="text-[9px] font-bold uppercase tracking-wide">
 {checkTypeLabel(balance.pendingCount.checkType)} tunggu sah AM/OM
 </p>
 <p className="mt-0.5 text-xs font-bold tabular-nums">{pending}</p>
 </div>)}
 </div>);
}

export function KioskStockBar() {
 const menuStockByCategory = usePosStore((s) => s.menuStockByCategory);
 const supplementStock = usePosStore((s) => s.supplementStock);

 return (
 <div className="space-y-2">
 <div>
 <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
 Stok Roti
 </p>
 <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
 {POS_ROTI_MENU_CATEGORIES.map((menu) => (
 <StockCard
 key={menu}
 balance={menuStockByCategory[menu]}
 subtitle="Stok rasmi (bag - pcs)"
 />))}
 </div>
 </div>

 <div>
 <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
 Bahan & Packaging
 </p>
 <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
 {supplementStock.map((item) => (
 <StockCard
 key={item.key}
 balance={item}
 subtitle={
 item.displayUnit === 'tong'
 ? 'Stok rasmi (tong)'
 : item.displayUnit === 'bag_pcs'
 ? 'Stok rasmi (bag - pcs)'
 : item.displayUnit === 'bag'
 ? 'Stok rasmi (bag)'
 : 'Stok rasmi'
 }
 />))}
 </div>
 </div>
 </div>);
}
