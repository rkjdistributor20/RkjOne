'use client';

import { Minus, Plus, Trash2, CreditCard } from 'lucide-react';
import { usePosStore } from '@/stores/pos-store';
import { formatRM } from '@/lib/pos/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CartPanelProps {
  onCheckout: () => void;
}

export function CartPanel({ onCheckout }: CartPanelProps) {
  const cart = usePosStore((s) => s.cart);
  const shift = usePosStore((s) => s.shift);
  const updateQuantity = usePosStore((s) => s.updateQuantity);
  const removeFromCart = usePosStore((s) => s.removeFromCart);
  const clearCart = usePosStore((s) => s.clearCart);

  const cartSubtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex h-full flex-col rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h3 className="font-semibold">Cart</h3>
          <p className="text-xs text-muted-foreground">
            {cartItemCount} item{cartItemCount !== 1 ? 's' : ''}
          </p>
        </div>
        {cart.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearCart}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 p-4">
        {cart.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Tap products to add
          </p>
        ) : (
          <div className="space-y-3">
            {cart.map((item) => (
              <div key={item.productId} className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRM(item.price)} each
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => updateQuantity(item.productId, -1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-medium">
                    {item.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => updateQuantity(item.productId, 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <div className="w-16 text-right text-sm font-semibold">
                  {formatRM(item.price * item.quantity)}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="border-t p-4">
        <div className="mb-3 flex justify-between text-lg font-bold">
          <span>Total</span>
          <span className="text-amber-600">{formatRM(cartSubtotal)}</span>
        </div>
        <Button
          className="w-full bg-amber-500 hover:bg-amber-600"
          size="lg"
          disabled={!shift || cart.length === 0}
          onClick={onCheckout}
        >
          <CreditCard className="mr-2 h-5 w-5" />
          Pay {formatRM(cartSubtotal)}
        </Button>
      </div>
    </div>
  );
}
