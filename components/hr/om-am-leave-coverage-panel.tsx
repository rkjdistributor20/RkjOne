'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, RefreshCw, ShieldCheck, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';

type AmLeaveCoverageRequest = {
 id: string;
 request_number: string;
 title: string;
 description: string;
 priority: string;
 status: string;
 requester_name: string | null;
 requester_email: string | null;
 employee_code: string | null;
 branch_code: string | null;
 branch_name: string | null;
 region_name: string | null;
 start_date: string | null;
 end_date: string | null;
 created_at: string;
 reviewer_note: string | null;
 coverage_status: string;
 covered_by_name: string | null;
 covered_at: string | null;
 cover_note: string | null;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
 const response = await fetch(url, {
 ...init,
 headers: {
 'Content-Type': 'application/json',
 ...(init?.headers ?? {}),
 },
 });
 const data = await response.json().catch(() => ({}));
 if (!response.ok) {
 throw new Error(typeof data.error === 'string' ? data.error : 'Permintaan gagal.');
 }
 return data as T;
}

function fmtDate(value: string | null | undefined) {
 if (!value) return '-';
 return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('ms-MY', {
 day: '2-digit',
 month: 'short',
 year: 'numeric',
 });
}

function fmtDateTime(value: string | null | undefined) {
 if (!value) return '-';
 return new Date(value).toLocaleString('ms-MY', {
 day: '2-digit',
 month: 'short',
 hour: '2-digit',
 minute: '2-digit',
 });
}

function coverageBadge(request: AmLeaveCoverageRequest) {
 if (request.covered_at) return { label: 'Cover OM siap', variant: 'default' as const };
 if (request.status === 'IN_REVIEW') return { label: 'Sedang disemak', variant: 'secondary' as const };
 return { label: 'Perlu cover OM', variant: 'destructive' as const };
}

export function OmAmLeaveCoveragePanel() {
 const [requests, setRequests] = useState<AmLeaveCoverageRequest[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [savingId, setSavingId] = useState<string | null>(null);

 const load = useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const data = await fetchJson<{ requests: AmLeaveCoverageRequest[] }>(
 '/api/hr/operations/am-leave-coverage',
 );
 setRequests(data.requests ?? []);
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Gagal memuatkan senarai cover cuti AM.');
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 void load();
 }, [load]);

 async function assignCover(request: AmLeaveCoverageRequest) {
 const note =
 prompt(
 `Nota cover untuk ${request.request_number}:`,
 request.cover_note ?? 'OM mengambil cover sementara kawasan AM bercuti.',
 )?.trim() || 'OM mengambil cover sementara kawasan AM bercuti.';

 setSavingId(request.id);
 try {
 const result = await fetchJson<{ request: AmLeaveCoverageRequest }>(
 '/api/hr/operations/am-leave-coverage',
 {
 method: 'PATCH',
 body: JSON.stringify({
 request_id: request.id,
 reviewer_note: note,
 }),
 },
 );
 setRequests((current) =>
 current.map((item) => (item.id === request.id ? result.request : item)));
 toast.success('Cover cuti AM dikemaskini. HR boleh terus proses kelulusan.');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal ambil cover cuti AM.');
 } finally {
 setSavingId(null);
 }
 }

 const pendingCount = requests.filter((request) => !request.covered_at).length;

 return (
 <SectionCard
 title="Cover Cuti Area Manager"
 description="OM perlu ambil cover operasi kawasan apabila AM bercuti sebelum HR meluluskan cuti."
 action={
 <div className="flex flex-wrap items-center gap-2">
 <Badge variant={pendingCount > 0 ? 'destructive' : 'secondary'}>{pendingCount} perlu tindakan</Badge>
 <Button size="sm" variant="outline" className="gap-1.5" onClick={load} disabled={loading}>
 <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
 Muat semula
 </Button>
 </div>
 }
 >
 {loading ? (
 <div className="grid gap-3 md:grid-cols-2">
 {[0, 1].map((item) => (
 <div key={item} className="h-40 animate-pulse rounded-xl border bg-muted/30" />
 ))}
 </div>
 ) : error ? (
 <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
 {error}
 </div>
 ) : requests.length === 0 ? (
 <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
 Tiada cuti AM yang perlukan cover OM buat masa ini.
 </div>
 ) : (
 <div className="grid gap-3 xl:grid-cols-2">
 {requests.map((request) => {
 const badge = coverageBadge(request);
 return (
 <div key={request.id} className="rounded-xl border bg-background p-4 text-sm shadow-sm">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div className="min-w-0">
 <div className="flex flex-wrap items-center gap-2">
 <Badge variant="outline">{request.request_number}</Badge>
 <Badge variant={badge.variant}>{badge.label}</Badge>
 {request.priority === 'HIGH' && <Badge variant="destructive">Segera</Badge>}
 </div>
 <p className="mt-2 font-semibold text-foreground">{request.requester_name ?? 'Area Manager'}</p>
 <p className="text-xs text-muted-foreground">
 {request.employee_code ?? request.requester_email ?? 'Kod pekerja belum lengkap'}
 </p>
 </div>
 <div className="rounded-lg border bg-amber-50 p-2 text-amber-700">
 <ShieldCheck className="h-5 w-5" />
 </div>
 </div>

 <p className="mt-3 line-clamp-2 text-muted-foreground">{request.description}</p>

 <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
 <span className="inline-flex items-center gap-1.5">
 <CalendarDays className="h-3.5 w-3.5" />
 {fmtDate(request.start_date)} {request.end_date ? `- ${fmtDate(request.end_date)}` : ''}
 </span>
 <span>{request.region_name ?? request.branch_code ?? 'Kawasan belum ditetapkan'}</span>
 <span>{request.branch_code ? `${request.branch_code} ${request.branch_name ?? ''}` : 'HQ / kawasan'}</span>
 <span>Dihantar: {fmtDateTime(request.created_at)}</span>
 </div>

 {(request.cover_note || request.reviewer_note) && (
 <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
 {request.cover_note ?? request.reviewer_note}
 </p>
 )}

 <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
 <div className="text-xs text-muted-foreground">
 {request.covered_at
 ? `Cover: ${request.covered_by_name ?? 'OM'} pada ${fmtDateTime(request.covered_at)}`
 : 'HR tidak boleh approve sehingga cover OM siap.'}
 </div>
 <Button
 size="sm"
 className="gap-1.5 bg-amber-500 hover:bg-amber-600"
 onClick={() => assignCover(request)}
 disabled={savingId === request.id}
 >
 <UserCheck className="h-4 w-4" />
 {request.covered_at ? 'Kemaskini cover' : savingId === request.id ? 'Menyimpan...' : 'Ambil cover'}
 </Button>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </SectionCard>
 );
}
