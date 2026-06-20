'use client';

import { usePosStore } from '@/stores/pos-store';
import { POS_MENU_CATEGORIES, formatKioskStockLabel } from '@/lib/pos/utils';
import type { MenuStockBalance } from '@/lib/pos/types';
import { cn } from '@/lib/utils';

function balanceLabel(b: MenuStockBalance | undefined) {
  if (!b) return '—';
  return formatKioskStockLabel(b.displayQuantity, b.displayUnit);
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
  return (
    <div className={cn('rounded-lg border px-3 py-2', statusClass(balance?.status))}>
      <p className="truncate text-[11px] font-medium uppercase tracking-wide opacity-80">
        {balance?.label ?? '—'}
      </p>
      <p className="mt-0.5 text-lg font-bold tabular-nums leading-none">
        {balanceLabel(balance)}
      </p>
      <p className="mt-1 text-[10px] opacity-70">{subtitle}</p>
    </div>
  );
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
          {POS_MENU_CATEGORIES.map((menu) => (
            <StockCard
              key={menu}
              balance={menuStockByCategory[menu]}
              subtitle="Baki kiosk"
            />
          ))}
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
                item.displayUnit === 'kg'
                  ? 'Baki kiosk (kg)'
                  : 'Baki kiosk (pack)'
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
