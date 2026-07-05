'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Clock, CheckSquare } from 'lucide-react';
import { fetchApprovals, approveRequest, rejectRequest } from '@/lib/approvals/api';
import type { ApprovalRequest } from '@/lib/approvals/types';
import { labelFor, APPROVAL_ENTITY_LABELS, APPROVAL_STATUS_LABELS } from '@/lib/ui/labels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
 ModuleLayout,
 ModuleHeader,
 ModuleLoading,
 EmptyState,
 RecordRow,
 SectionCard,
 moduleTabsListClass,
 moduleTabsTriggerClass,
} from '@/components/shared/module-ui';

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
 const history = [...approved.approvals,...rejected.approvals].sort(
 (a, b) =>
 new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 30);
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
 <ModuleLayout>
 <ModuleHeader
 title="Kelulusan"
 description="Luluskan atau tolak permintaan syif, gaji, stok, dan penyelarasan tunai"
 icon={CheckSquare}
 badges={
 pending.length > 0 ? (
 <Badge variant="destructive">{pending.length} menunggu tindakan</Badge>) : (
 <Badge variant="outline">Semua selesai</Badge>)
 }
 />

 {loading ? (
 <ModuleLoading rows={1} />) : (
 <Tabs defaultValue="pending" className="space-y-4">
 <TabsList className={moduleTabsListClass}>
 <TabsTrigger value="pending" className={moduleTabsTriggerClass}>
 <Clock className="h-4 w-4" />
 Menunggu ({pending.length})
 </TabsTrigger>
 <TabsTrigger value="history" className={moduleTabsTriggerClass}>
 <CheckCircle className="h-4 w-4" /> Sejarah
 </TabsTrigger>
 </TabsList>

 <TabsContent value="pending" className="mt-2 space-y-3">
 {pending.length === 0 ? (
 <EmptyState
 icon={CheckCircle}
 title="Tiada kelulusan menunggu"
 description="Semua permintaan telah diproses. Rekod baharu akan muncul di sini."
 />) : (
 pending.map((req) => (
 <SectionCard key={req.id}>
 <div className="flex flex-wrap items-start justify-between gap-2">
 <div>
 <p className="font-medium">{req.title}</p>
 <p className="text-xs text-muted-foreground mt-1">
 {labelFor(APPROVAL_ENTITY_LABELS, req.entity_type, req.entity_type)}
 {req.branch && ` - ${req.branch.branch_name}`}
 {req.requester && ` - ${req.requester.full_name}`}
 </p>
 {req.description && (
 <p className="text-sm mt-2 text-muted-foreground">{req.description}</p>)}
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
 </>) : (
 <Button size="sm" variant="outline" onClick={() => setRejectId(req.id)}>
 <XCircle className="mr-1 h-4 w-4" /> Tolak
 </Button>)}
 </div>
 </SectionCard>)))}
 </TabsContent>

 <TabsContent value="history" className="mt-2 space-y-2">
 {resolved.length === 0 ? (
 <EmptyState
 icon={Clock}
 title="Tiada sejarah"
 description="Kelulusan yang telah diproses akan dipaparkan di sini."
 />) : (
 resolved.map((req) => (
 <RecordRow key={req.id}>
 <div>
 <p className="font-medium">{req.title}</p>
 <p className="text-xs text-muted-foreground">
 {labelFor(APPROVAL_ENTITY_LABELS, req.entity_type, req.entity_type)}
 </p>
 </div>
 <Badge variant="outline">
 {labelFor(APPROVAL_STATUS_LABELS, req.status)}
 </Badge>
 </RecordRow>)))}
 </TabsContent>
 </Tabs>)}
 </ModuleLayout>);
}
