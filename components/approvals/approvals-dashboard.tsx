'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { fetchApprovals, approveRequest, rejectRequest } from '@/lib/approvals/api';
import type { ApprovalRequest } from '@/lib/approvals/types';
import { labelFor, APPROVAL_ENTITY_LABELS, APPROVAL_STATUS_LABELS } from '@/lib/ui/labels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ApprovalsDashboard() {
  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  const [resolved, setResolved] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, approved, rejected] = await Promise.all([
        fetchApprovals('PENDING'),
        fetchApprovals('APPROVED'),
        fetchApprovals('REJECTED'),
      ]);
      setPending(p.approvals);
      const history = [...approved.approvals, ...rejected.approvals]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        .slice(0, 30);
      setResolved(history);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan kelulusan');
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
      toast.success('Diluluskan');
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal meluluskan');
    }
  }

  async function handleReject(id: string) {
    try {
      await rejectRequest(id, rejectReason || undefined);
      toast.success('Ditolak');
      setRejectId(null);
      setRejectReason('');
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menolak');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Kelulusan</h2>
        <p className="text-sm text-muted-foreground">
          Syif · gaji · stok · penyelarasan tunai
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending" className="gap-1">
              <Clock className="h-4 w-4" />
              Menunggu ({pending.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1">
              <CheckCircle className="h-4 w-4" /> Sejarah
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4 space-y-3">
            {pending.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                Tiada kelulusan menunggu.
              </p>
            ) : (
              pending.map((req) => (
                <div key={req.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{req.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {labelFor(APPROVAL_ENTITY_LABELS, req.entity_type, req.entity_type)}
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
                    <Badge variant="secondary">
                      {labelFor(APPROVAL_STATUS_LABELS, req.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => handleApprove(req.id)}
                    >
                      <CheckCircle className="mr-1 h-4 w-4" /> Lulus
                    </Button>
                    {rejectId === req.id ? (
                      <>
                        <Input
                          className="h-8 w-48"
                          placeholder="Sebab (pilihan)"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                        />
                        <Button size="sm" variant="destructive" onClick={() => handleReject(req.id)}>
                          Sahkan Tolak
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejectId(null)}>
                          Batal
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setRejectId(req.id)}>
                        <XCircle className="mr-1 h-4 w-4" /> Tolak
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-2">
            {resolved.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tiada sejarah kelulusan.</p>
            ) : (
              resolved.map((req) => (
                <div key={req.id} className="flex justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{req.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {labelFor(APPROVAL_ENTITY_LABELS, req.entity_type, req.entity_type)}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {labelFor(APPROVAL_STATUS_LABELS, req.status)}
                  </Badge>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
