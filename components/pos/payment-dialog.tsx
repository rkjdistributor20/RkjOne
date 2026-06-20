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

const QUICK_AMOUNTS = [5, 10, 20, 50, 100];

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
      const amount = total > 0 ? total.toFixed(2) : '';
      setCashTendered(amount);
      setQrAmount(amount);
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

  const canPay =
    total > 0 && paidAmount >= total && shift && cart.length > 0;

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

        toast.warning('Disimpan luar talian — akan disegerak bila online');
        clearCart();
        onOpenChange(false);
        onSuccess(offlineReceipt);
        return;
      }

      const { result } = await createSale(payload);
      toast.success('Bayaran berjaya · stok kiosk ditolak');
      clearCart();
      onOpenChange(false);
      onSuccess(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bayaran gagal';
      toast.error(msg.includes('Stok') ? msg : `Bayaran gagal: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bayar</DialogTitle>
          <DialogDescription>
            Perlu bayar:{' '}
            <strong className="text-xl text-primary">{formatRM(total)}</strong>
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={method}
          onValueChange={(v) => {
            const next = v as PaymentMethod;
            setMethod(next);
            const amount = total > 0 ? total.toFixed(2) : '';
            if (next === 'CASH') {
              setCashTendered(amount);
            } else if (next === 'QR') {
              setQrAmount(amount);
            }
          }}
        >
          <TabsList className="grid h-12 w-full grid-cols-3">
            <TabsTrigger value="CASH" className="gap-1 text-sm">
              <Banknote className="h-4 w-4" /> Tunai
            </TabsTrigger>
            <TabsTrigger value="QR" className="gap-1 text-sm">
              <QrCode className="h-4 w-4" /> QR
            </TabsTrigger>
            <TabsTrigger value="MIXED" className="gap-1 text-sm">
              <Split className="h-4 w-4" /> Campur
            </TabsTrigger>
          </TabsList>

          <TabsContent value="CASH" className="space-y-3 pt-3">
            <div className="space-y-2">
              <Label>Tunai diterima (RM)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="h-12 text-lg"
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="h-11 flex-1 min-w-[4.5rem] text-base font-semibold"
                onClick={() => setCashTendered(total.toFixed(2))}
              >
                Tepat
              </Button>
              {QUICK_AMOUNTS.map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  className="h-11 min-w-[3.5rem] text-base"
                  onClick={() => setCashTendered(String(amt))}
                >
                  {formatRM(amt)}
                </Button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="QR" className="space-y-3 pt-3">
            <div className="space-y-2">
              <Label>Amaun QR (RM)</Label>
              <Input
                type="number"
                className="h-12 text-lg"
                value={qrAmount}
                onChange={(e) => setQrAmount(e.target.value)}
                placeholder={total.toFixed(2)}
              />
            </div>
            <Button
              variant="secondary"
              className="h-11 w-full text-base"
              onClick={() => setQrAmount(total.toFixed(2))}
            >
              QR penuh — {formatRM(total)}
            </Button>
          </TabsContent>

          <TabsContent value="MIXED" className="space-y-3 pt-3">
            <div className="space-y-2">
              <Label>Tunai (RM)</Label>
              <Input
                type="number"
                className="h-12 text-lg"
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>QR (RM)</Label>
              <Input
                type="number"
                className="h-12 text-lg"
                value={qrAmount}
                onChange={(e) => setQrAmount(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        {changeAmount > 0 && method !== 'QR' && (
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-center">
            <p className="text-sm text-muted-foreground">Baki tunai</p>
            <p className="text-3xl font-bold tabular-nums text-primary">
              {formatRM(changeAmount)}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            className="h-12 min-w-[140px] text-base font-bold"
            disabled={!canPay || loading}
            onClick={handlePay}
          >
            {loading ? 'Memproses…' : `Sahkan ${formatRM(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
