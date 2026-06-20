'use client';

import { Minus, Plus, Trash2, CreditCard } from 'lucide-react';
import { usePosStore } from '@/stores/pos-store';
import { formatRM } from '@/lib/pos/utils';
import { Button } from '@/components/ui/button';
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
  const clearCart = usePosStore((s) => s.clearCart);

  const cartSubtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-xl border-2 border-primary/20 bg-card shadow-sm',
        className
      )}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-lg font-bold">Troli</h3>
          <p className="text-xs text-muted-foreground">
            {cartItemCount} item · ketik +/− untuk ubah
          </p>
        </div>
        {cart.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-muted-foreground"
            onClick={clearCart}
            aria-label="Kosongkan troli"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 py-2">
        {cart.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Ketik produk roti untuk tambah ke troli
          </p>
        ) : (
          <div className="space-y-2">
            {cart.map((item) => {
              const stock = stockByProduct[item.productId];
              return (
              <div
                key={item.productId}
                className="flex items-center gap-2 rounded-lg border bg-background p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRM(item.price)} × {item.quantity}
                  </p>
                  {stock != null && (
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      Baki stok: {stock.available}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-lg"
                    onClick={() => updateQuantity(item.productId, -1)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center text-base font-bold tabular-nums">
                    {item.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-lg"
                    onClick={() => updateQuantity(item.productId, 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="w-[4.5rem] text-right text-sm font-bold tabular-nums">
                  {formatRM(item.price * item.quantity)}
                </div>
              </div>
            );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="border-t bg-muted/30 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-base font-medium">Jumlah</span>
          <span className="text-2xl font-bold tabular-nums text-primary">
            {formatRM(cartSubtotal)}
          </span>
        </div>
        <Button
          className="h-14 w-full text-lg font-bold"
          size="lg"
          disabled={!shift || cart.length === 0}
          onClick={onCheckout}
        >
          <CreditCard className="mr-2 h-6 w-6" />
          Bayar {formatRM(cartSubtotal)}
        </Button>
      </div>
    </div>
  );
}
