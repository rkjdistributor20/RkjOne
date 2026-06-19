'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Banknote, QrCode, Split } from 'lucide-react';
import { createSale } from '@/lib/pos/api';
import {
  enqueueOfflineSale,
  getOfflineQueue,
} from '@/lib/pos/offline-queue';
import { formatRM, generateOfflineId } from '@/lib/pos/utils';
import { usePosStore } from '@/stores/pos-store';
import type { PaymentMethod, SaleResult } from '@/lib/pos/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  onSuccess: (receipt: SaleResult) => void;
}

export function PaymentDialog({
  open,
  onOpenChange,
  branchId,
  onSuccess,
}: PaymentDialogProps) {
  const cart = usePosStore((s) => s.cart);
  const shift = usePosStore((s) => s.shift);
  const clearCart = usePosStore((s) => s.clearCart);
  const isOnline = usePosStore((s) => s.isOnline);
  const setOfflineCount = usePosStore((s) => s.setOfflineCount);

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [cashTendered, setCashTendered] = useState('');
  const [qrAmount, setQrAmount] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setMethod('CASH');
      setCashTendered(total.toFixed(2));
      setQrAmount('0');
    }
  }, [open, total]);

  const cashNum = Number(cashTendered) || 0;
  const qrNum = Number(qrAmount) || 0;

  const changeAmount =
    method === 'CASH'
      ? Math.max(cashNum - total, 0)
      : method === 'MIXED'
        ? Math.max(cashNum - Math.max(total - qrNum, 0), 0)
        : 0;

  const paidAmount =
    method === 'CASH' ? cashNum : method === 'QR' ? qrNum : cashNum + qrNum;

  const canPay = paidAmount >= total && shift && cart.length > 0;

  async function handlePay() {
    if (!shift || !canPay) return;
    setLoading(true);

    const items = cart.map((c) => ({
      product_id: c.productId,
      quantity: c.quantity,
    }));

    const payload = {
      shiftId: shift.id,
      branchId,
      items,
      payment_method: method,
      cash_amount: method === 'QR' ? 0 : cashNum,
      qr_amount: method === 'CASH' ? 0 : qrNum,
    };

    try {
      if (!isOnline) {
        const offlineId = generateOfflineId();
        enqueueOfflineSale({
          offlineId,
          branchId,
          shiftId: shift.id,
          items,
          payment_method: method,
          cash_amount: payload.cash_amount,
          qr_amount: payload.qr_amount,
          created_at: new Date().toISOString(),
        });
        setOfflineCount(getOfflineQueue().length);

        const offlineReceipt: SaleResult = {
          transaction_id: offlineId,
          transaction_number: `OFFLINE-${offlineId.slice(-8)}`,
          receipt_number: `RC-OFF-${Date.now()}`,
          subtotal: total,
          discount: 0,
          total,
          change_amount: changeAmount,
          items: cart.map((c) => ({
            name: c.name,
            sku: c.sku,
            quantity: c.quantity,
            unit_price: c.price,
            line_total: c.price * c.quantity,
          })),
        };

        toast.warning('Saved offline — will sync when online');
        clearCart();
        onOpenChange(false);
        onSuccess(offlineReceipt);
        return;
      }

      const { result } = await createSale(payload);
      toast.success('Payment successful');
      clearCart();
      onOpenChange(false);
      onSuccess(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Payment</DialogTitle>
          <DialogDescription>
            Total due: <strong>{formatRM(total)}</strong>
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={method}
          onValueChange={(v) => setMethod(v as PaymentMethod)}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="CASH" className="gap-1">
              <Banknote className="h-4 w-4" /> Cash
            </TabsTrigger>
            <TabsTrigger value="QR" className="gap-1">
              <QrCode className="h-4 w-4" /> QR
            </TabsTrigger>
            <TabsTrigger value="MIXED" className="gap-1">
              <Split className="h-4 w-4" /> Mixed
            </TabsTrigger>
          </TabsList>

          <TabsContent value="CASH" className="space-y-3 pt-3">
            <div className="space-y-2">
              <Label>Cash Received</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              {[total, 10, 20, 50, 100].map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCashTendered(
                      amt === total ? total.toFixed(2) : String(amt)
                    )
                  }
                >
                  {amt === total ? 'Exact' : formatRM(amt)}
                </Button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="QR" className="space-y-3 pt-3">
            <div className="space-y-2">
              <Label>QR Amount</Label>
              <Input
                type="number"
                value={qrAmount}
                onChange={(e) => setQrAmount(e.target.value)}
                placeholder={total.toFixed(2)}
              />
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setQrAmount(total.toFixed(2))}
            >
              Full QR — {formatRM(total)}
            </Button>
          </TabsContent>

          <TabsContent value="MIXED" className="space-y-3 pt-3">
            <div className="space-y-2">
              <Label>Cash Amount</Label>
              <Input
                type="number"
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>QR Amount</Label>
              <Input
                type="number"
                value={qrAmount}
                onChange={(e) => setQrAmount(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        {changeAmount > 0 && method !== 'QR' && (
          <div className="rounded-lg bg-amber-50 p-3 text-center">
            <p className="text-sm text-muted-foreground">Change</p>
            <p className="text-2xl font-bold text-amber-700">
              {formatRM(changeAmount)}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-amber-500 hover:bg-amber-600"
            disabled={!canPay || loading}
            onClick={handlePay}
          >
            {loading ? 'Processing…' : `Confirm ${formatRM(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
