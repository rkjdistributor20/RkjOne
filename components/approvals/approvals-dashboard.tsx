'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { fetchApprovals, approveRequest, rejectRequest } from '@/lib/approvals/api';
import type { ApprovalRequest } from '@/lib/approvals/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ENTITY_LABELS: Record<string, string> = {
  SHIFT: 'Shift',
  PAYROLL: 'Payroll',
  STOCK_ADJUSTMENT: 'Stock Adjustment',
  STOCK_WRITE_OFF: 'Write-off',
  STOCK_TRANSFER: 'Transfer',
  VOID_SALE: 'Void Sale',
  REFUND: 'Refund',
  BANK_IN: 'Bank In',
  CASH_RECONCILIATION: 'Cash Reconciliation',
};

export function ApprovalsDashboard() {
  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  const [resolved, setResolved] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, r] = await Promise.all([
        fetchApprovals('PENDING'),
        fetchApprovals('APPROVED'),
      ]);
      setPending(p.approvals);
      setResolved(r.approvals.slice(0, 20));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleApprove(id: string) {
    try {
      await approveRequest(id);
      toast.success('Approved');
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approval failed');
    }
  }

  async function handleReject(id: string) {
    try {
      await rejectRequest(id, rejectReason || undefined);
      toast.success('Rejected');
      setRejectId(null);
      setRejectReason('');
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reject failed');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Approvals</h2>
        <p className="text-sm text-muted-foreground">
          Shifts · payroll · stock · cash reconciliation
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending" className="gap-1">
              <Clock className="h-4 w-4" />
              Pending ({pending.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1">
              <CheckCircle className="h-4 w-4" /> History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4 space-y-3">
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending approvals</p>
            ) : (
              pending.map((req) => (
                <div key={req.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{req.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {ENTITY_LABELS[req.entity_type] ?? req.entity_type}
                        {req.branch && ` · ${req.branch.branch_name}`}
                        {req.requester && ` · ${req.requester.full_name}`}
                      </p>
                      {req.description && (
                        <p className="text-sm mt-2 text-muted-foreground">{req.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(req.created_at).toLocaleString('ms-MY')}
                      </p>
                    </div>
                    <Badge variant="secondary">{req.status}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => handleApprove(req.id)}
                    >
                      <CheckCircle className="mr-1 h-4 w-4" /> Approve
                    </Button>
                    {rejectId === req.id ? (
                      <>
                        <Input
                          className="h-8 w-48"
                          placeholder="Reason (optional)"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                        />
                        <Button size="sm" variant="destructive" onClick={() => handleReject(req.id)}>
                          Confirm Reject
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejectId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setRejectId(req.id)}>
                        <XCircle className="mr-1 h-4 w-4" /> Reject
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-2">
            {resolved.map((req) => (
              <div key={req.id} className="flex justify-between rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{req.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {ENTITY_LABELS[req.entity_type] ?? req.entity_type}
                  </p>
                </div>
                <Badge variant="outline">{req.status}</Badge>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
