'use client';

import { Banknote, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { usePosStore } from '@/stores/pos-store';
import { formatRM } from '@/lib/pos/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface CartPanelProps {
  onCheckout: () => void;
  className?: string;
}

export function CartPanel({ onCheckout, className }: CartPanelProps) {
  const cart = usePosStore((s) => s.cart);
  const shift = usePosStore((s) => s.shift);
  const stockByProduct = usePosStore((s) => s.stockByProduct);
  const updateQuantity = usePosStore((s) => s.updateQuantity);
  const removeFromCart = usePosStore((s) => s.removeFromCart);
  const clearCart = usePosStore((s) => s.clearCart);

  const cartSubtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-2xl border border-amber-200/80 bg-card shadow-lg',
        className
      )}
    >
      <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight text-amber-950">
                Kounter Tunai
              </h3>
              <p className="text-xs text-amber-900/70">
                {shift ? 'Syif aktif · F2 bayar pantas' : 'Buka syif dahulu'}
              </p>
            </div>
          </div>
          {cartItemCount > 0 && (
            <Badge className="h-7 min-w-7 justify-center bg-amber-500 px-2 text-sm font-bold hover:bg-amber-500">
              {cartItemCount}
            </Badge>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 py-3">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <ShoppingCart className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Troli kosong</p>
            <p className="mt-1 max-w-[200px] text-xs text-muted-foreground/80">
              Ketik produk di sebelah kiri untuk mula jualan
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {cart.map((item) => {
              const stock = stockByProduct[item.productId];
              const lowStock =
                stock != null && item.quantity >= stock.available;
              return (
                <div
                  key={item.productId}
                  className="rounded-xl border bg-background p-2.5 shadow-sm"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold leading-snug">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {formatRM(item.price)} / unit
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFromCart(item.productId)}
                      aria-label="Buang item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center rounded-lg border bg-muted/30 p-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 rounded-md"
                        onClick={() => updateQuantity(item.productId, -1)}
                      >
                        <Minus className="h-5 w-5" />
                      </Button>
                      <span className="min-w-[2.25rem] text-center text-lg font-bold tabular-nums">
                        {item.quantity}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 rounded-md"
                        onClick={() => updateQuantity(item.productId, 1)}
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold tabular-nums text-amber-950">
                        {formatRM(item.price * item.quantity)}
                      </p>
                      {stock != null && (
                        <p
                          className={cn(
                            'text-[10px] tabular-nums',
                            lowStock ? 'font-medium text-orange-600' : 'text-muted-foreground'
                          )}
                        >
                          Baki {stock.available}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {cart.length > 0 && (
        <div className="border-t px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full text-xs text-muted-foreground"
            onClick={clearCart}
          >
            Kosongkan troli
          </Button>
        </div>
      )}

      <div className="border-t border-amber-100 bg-gradient-to-b from-amber-50/80 to-amber-100/50 p-4">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-amber-900/60">
              Jumlah perlu bayar
            </p>
            <p className="text-3xl font-bold tabular-nums tracking-tight text-amber-950">
              {formatRM(cartSubtotal)}
            </p>
          </div>
          {cartItemCount > 0 && (
            <p className="text-right text-xs text-muted-foreground">
              {cart.length} jenis
              <br />
              {cartItemCount} unit
            </p>
          )}
        </div>
        <Button
          className="h-14 w-full gap-2 rounded-xl bg-amber-500 text-lg font-bold shadow-md hover:bg-amber-600 disabled:opacity-50"
          size="lg"
          disabled={!shift || cart.length === 0}
          onClick={onCheckout}
        >
          <Banknote className="h-6 w-6" />
          Terima Bayaran
        </Button>
      </div>
    </div>
  );
}
