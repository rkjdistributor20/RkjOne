'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { fetchPaymentStatus } from '@/lib/sales-agent/api';
import type { AgentPaymentReceipt } from '@/lib/sales-agent/types';
import { AgentReceiptDialog } from '@/components/sales-agent/agent-receipt-dialog';
import { Button } from '@/components/ui/button';
import { ModuleLayout } from '@/components/shared/module-ui';

const POLL_MS = 2500;
const MAX_POLLS = 24;

function PaymentReturnInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const paymentId = searchParams.get('payment');
  const [phase, setPhase] = useState<'waiting' | 'paid' | 'failed'>('waiting');
  const [message, setMessage] = useState('Menunggu pengesahan bank…');
  const [receipt, setReceipt] = useState<AgentPaymentReceipt | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  useEffect(() => {
    if (!paymentId) {
      setPhase('failed');
      setMessage('ID pembayaran tiada.');
      return;
    }

    let cancelled = false;
    let attempts = 0;

    async function poll() {
      while (!cancelled && attempts < MAX_POLLS) {
        attempts += 1;
        try {
          const { payment, receipt: r } = await fetchPaymentStatus(paymentId!);
          if (payment.status === 'PAID') {
            setPhase('paid');
            setMessage('Bayaran disahkan bank — tempahan / langganan aktif.');
            if (r) {
              setReceipt(r);
              setReceiptOpen(true);
            }
            toast.success('Bayaran berjaya');
            return;
          }
          if (payment.status === 'FAILED') {
            setPhase('failed');
            setMessage(
              'Bayaran gagal atau dibatalkan. Tempahan stok / langganan POS tidak disahkan — sila cuba semula.'
            );
            toast.error('Bayaran gagal');
            return;
          }
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      if (!cancelled) {
        setPhase('failed');
        setMessage(
          'Pengesahan bank masih diproses. Semak Sejarah bayaran dalam beberapa minit — tempahan belum disahkan sehingga status PAID.'
        );
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [paymentId]);

  return (
    <ModuleLayout>
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
        {phase === 'waiting' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-emerald-700" />
            <h1 className="text-lg font-semibold">Menunggu Pengesahan Bank</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <p className="text-xs text-muted-foreground">
              FPX / kad kredit / debit · RKJ Distributor Sdn Bhd · Maybank
            </p>
          </>
        )}
        {phase === 'paid' && (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <h1 className="text-lg font-semibold">Bayaran Disahkan</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button onClick={() => router.push('/sales-agent')}>Kembali ke Portal Ejen</Button>
          </>
        )}
        {phase === 'failed' && (
          <>
            <XCircle className="h-10 w-10 text-destructive" />
            <h1 className="text-lg font-semibold">Bayaran Tidak Disahkan</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button variant="outline" onClick={() => router.push('/sales-agent')}>
              Kembali ke Portal Ejen
            </Button>
          </>
        )}
      </div>

      <AgentReceiptDialog open={receiptOpen} onOpenChange={setReceiptOpen} receipt={receipt} />
    </ModuleLayout>
  );
}

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Memuatkan…</p>}>
      <PaymentReturnInner />
    </Suspense>
  );
}
