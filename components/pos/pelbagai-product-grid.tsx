'use client';

import { useMemo } from 'react';
import { Package } from 'lucide-react';
import {
  PELBAGAI_MENU_GROUPS,
  sortPelbagaiProducts,
} from '@/lib/pos/pelbagai-menu';
import type { Product } from '@/types/database';
import { formatRM } from '@/lib/pos/utils';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function StockBadge({ status, available }: { status?: string; available?: number }) {
  if (available == null) {
    return (
      <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
        Baki —
      </Badge>
    );
  }
  if (status === 'OUT') {
    return (
      <Badge variant="destructive" className="shrink-0 text-[10px]">
        Baki 0
      </Badge>
    );
  }
  if (status === 'LOW') {
    return (
      <Badge
        variant="secondary"
        className="shrink-0 border-orange-300 bg-orange-50 text-[10px] text-orange-800"
      >
        Baki {available}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="shrink-0 border-emerald-300 bg-emerald-50 text-[10px] text-emerald-900"
    >
      Baki {available}
    </Badge>
  );
}

interface PelbagaiProductGridProps {
  products: Product[];
  stockByProduct: Record<string, { available: number; status: string } | undefined>;
  shiftOpen: boolean;
  onAdd: (product: Product) => void;
}

export function PelbagaiProductGrid({
  products,
  stockByProduct,
  shiftOpen,
  onAdd,
}: PelbagaiProductGridProps) {
  const bySku = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of sortPelbagaiProducts(products)) {
      map.set(p.sku, p);
    }
    return map;
  }, [products]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-violet-700" />
          <p className="text-sm font-bold text-violet-950">Stok Pelbagai</p>
        </div>
        <p className="mt-1 text-xs text-violet-900/80">
          9 jenis · 21 varian · stok roti ditolak automatik ikut kandungan set
        </p>
      </div>

      {PELBAGAI_MENU_GROUPS.map((group) => {
        const variantsWithProduct = group.variants
          .map((v) => ({ variant: v, product: bySku.get(v.sku) }))
          .filter((row): row is { variant: (typeof group.variants)[0]; product: Product } =>
            row.product != null
          );

        if (variantsWithProduct.length === 0) return null;

        return (
          <section
            key={group.id}
            className="rounded-xl border border-violet-100 bg-background p-3 shadow-sm"
          >
            <div className="mb-2.5 border-b border-violet-50 pb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
                {group.number}. {group.title}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{group.stockNote}</p>
            </div>

            <div
              className={cn(
                'grid gap-2',
                variantsWithProduct.length >= 3
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : variantsWithProduct.length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-1 sm:max-w-[55%]'
              )}
            >
              {variantsWithProduct.map(({ variant, product }) => {
                const stock = stockByProduct[product.id];
                const outOfStock = stock?.status === 'OUT';

                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={!shiftOpen || outOfStock}
                    onClick={() => onAdd(product)}
                    className={cn(
                      'flex min-h-[108px] flex-col justify-between rounded-xl border-2 border-violet-100 bg-violet-50/30 p-3 text-left transition-all',
                      'hover:border-violet-400 hover:bg-violet-50 hover:shadow-md active:scale-[0.98]',
                      'disabled:cursor-not-allowed disabled:opacity-45',
                      outOfStock && 'border-dashed opacity-50'
                    )}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-semibold leading-snug text-violet-950">
                          {variant.contents}
                        </p>
                        <StockBadge status={stock?.status} available={stock?.available} />
                      </div>
                      <p className="mt-1 text-[10px] text-violet-800/75">{variant.deductNote}</p>
                    </div>
                    <span className="mt-2 text-xl font-bold tabular-nums text-foreground">
                      {formatRM(product.price)}
                      {group.variants.length > 1 && variant.label.startsWith('RM') && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          / set
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
