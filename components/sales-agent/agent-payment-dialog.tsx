'use client';

import { CreditCard, Landmark, Loader2 } from 'lucide-react';
import type { AgentPaymentTarget, OnlinePaymentMethod } from '@/lib/sales-agent/types';
import { formatRM } from '@/components/shared/module-ui';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const PAY_METHODS = [
  { id: 'FPX' as const, label: 'FPX (Online Banking)' },
  { id: 'CARD' as const, label: 'Kad Kredit' },
  { id: 'DEBIT' as const, label: 'Kad Debit' },
];

type AgentPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: AgentPaymentTarget | null;
  payMethod: OnlinePaymentMethod;
  onPayMethodChange: (method: OnlinePaymentMethod) => void;
  onConfirm: () => Promise<void>;
  loading?: boolean;
  ipay88Configured?: boolean;
};

export function AgentPaymentDialog({
  open,
  onOpenChange,
  target,
  payMethod,
  onPayMethodChange,
  onConfirm,
  loading,
  ipay88Configured = true,
}: AgentPaymentDialogProps) {
  if (!target) return null;

  const title =
    target.purpose === 'STOCK_ORDER'
      ? `Bayar Order ${target.label}`
      : `Langganan POS — ${target.label}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emerald-700" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Bayaran kepada <strong>RKJ Distributor Sdn Bhd</strong>. Resit rasmi akan dikeluarkan selepas
            bayaran disahkan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {target.productionDate && (
            <div className="flex justify-between rounded-lg bg-muted/50 px-3 py-2">
              <span className="text-muted-foreground">Tarikh production</span>
              <span className="font-medium">{target.productionDate}</span>
            </div>
          )}
          <div className="flex justify-between rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-3">
            <span className="font-medium">Jumlah bayaran</span>
            <span className="text-lg font-bold text-emerald-900">{formatRM(target.amountRm)}</span>
          </div>

          <div className="space-y-2">
            <Label>Kaedah bayaran</Label>
            <div className="flex flex-wrap gap-2">
              {PAY_METHODS.map((m) => (
                <Button
                  key={m.id}
                  type="button"
                  size="sm"
                  variant={payMethod === m.id ? 'default' : 'outline'}
                  onClick={() => onPayMethodChange(m.id)}
                  disabled={loading}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
            <Landmark className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {ipay88Configured ? (
                <>
                  Bayaran dihantar ke <strong>Maybank RKJ Distributor Sdn Bhd</strong> melalui iPay88
                  (FPX / kad kredit / kad debit). Tempahan stok atau langganan POS hanya disahkan
                  selepas bank mengesahkan bayaran.
                </>
              ) : (
                <>
                  <strong>Mod pilot:</strong> iPay88 belum diaktifkan — bayaran ujian disahkan dalam
                  sistem. Selepas Merchant Code iPay88 diset, bayaran sebenar ke Maybank RKJ
                  Distributor akan digunakan.
                </>
              )}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Batal
          </Button>
          <Button
            className="bg-emerald-700 hover:bg-emerald-800"
            onClick={() => void onConfirm()}
            disabled={loading || target.amountRm <= 0}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Memproses…
              </>
            ) : (
              `Bayar ${formatRM(target.amountRm)}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
