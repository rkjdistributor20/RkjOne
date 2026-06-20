'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Ban, RotateCcw } from 'lucide-react';
import { voidTransaction, refundTransaction } from '@/lib/pos/api';
import { formatRM } from '@/lib/pos/utils';
import { usePosStore } from '@/stores/pos-store';
import type { PosTransactionRow } from '@/lib/pos/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TransactionHistoryProps {
  onRefresh: () => void;
}

const STATUS_COLORS = {
  COMPLETED: 'bg-green-100 text-green-800',
  VOIDED: 'bg-red-100 text-red-800',
  REFUNDED: 'bg-orange-100 text-orange-800',
};

export function TransactionHistory({ onRefresh }: TransactionHistoryProps) {
  const transactions = usePosStore((s) => s.transactions);
  const [actionTx, setActionTx] = useState<PosTransactionRow | null>(null);
  const [actionType, setActionType] = useState<'void' | 'refund' | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAction() {
    if (!actionTx || !actionType || !reason.trim()) return;
    setLoading(true);
    try {
      if (actionType === 'void') {
        await voidTransaction(actionTx.id, reason);
        toast.success('Transaction voided');
      } else {
        await refundTransaction(actionTx.id, reason);
        toast.success('Transaction refunded');
      }
      setActionTx(null);
      setActionType(null);
      setReason('');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ScrollArea className="h-[400px]">
        <div className="space-y-2">
          {transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No transactions yet
            </p>
          ) : (
            transactions.map((tx) => (
              <div
                key={tx.id}
                className="rounded-lg border p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{tx.transaction_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString('ms-MY')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatRM(Number(tx.total))}</p>
                    <Badge
                      className={
                        STATUS_COLORS[tx.status] ?? 'bg-gray-100'
                      }
                    >
                      {tx.status}
                    </Badge>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {tx.payment_method}
                  </span>
                  {tx.status === 'COMPLETED' && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-red-600"
                        onClick={() => {
                          setActionTx(tx);
                          setActionType('void');
                        }}
                      >
                        <Ban className="mr-1 h-3 w-3" />
                        Void
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-orange-600"
                        onClick={() => {
                          setActionTx(tx);
                          setActionType('refund');
                        }}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Refund
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <Dialog
        open={!!actionTx}
        onOpenChange={() => {
          setActionTx(null);
          setActionType(null);
          setReason('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'void' ? 'Void Sale' : 'Refund Sale'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {actionTx?.transaction_number} — {formatRM(Number(actionTx?.total ?? 0))}
          </p>
          <Textarea
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={!reason.trim() || loading}
              onClick={handleAction}
            >
              {loading ? 'Processing…' : `Confirm ${actionType}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
