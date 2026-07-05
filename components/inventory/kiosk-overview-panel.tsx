'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
 Building2,
 Package,
 Truck,
 Search,
 AlertTriangle,
 CheckCircle2,
 MapPin,
} from 'lucide-react';
import { fetchKioskOverview } from '@/lib/inventory/api';
import type { KioskOverviewBranch, KioskOverviewSummary } from '@/lib/inventory/types';
import { HQ_ROTI_ITEM_CODES, getStockByCode } from '@/lib/stock/catalog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface KioskOverviewPanelProps {
 branchId?: string;
 onSelectBranch: (branchId: string, locationId: string) => void;
}

type FilterMode = 'all' | 'low' | 'critical' | 'pending';

const rotiLabels: Record<string, string> = {
 'ST-PLANTA': 'Kaya',
 'ST-KELAPA': 'Kelapa',
 'ST-KACANG': 'Kacang',
 'ST-BENGGALI': 'Benggali',
};

function statusBadge(status: string) {
 if (status === 'CRITICAL') {
 return <Badge variant="destructive">Kritikal</Badge>;
 }
 if (status === 'LOW') {
 return <Badge variant="secondary">Rendah</Badge>;
 }
 return (
 <Badge variant="outline" className="border-emerald-300 text-emerald-800">
 OK
 </Badge>);
}

export function KioskOverviewPanel({ branchId, onSelectBranch }: KioskOverviewPanelProps) {
 const [branches, setBranches] = useState<KioskOverviewBranch[]>([]);
 const [summary, setSummary] = useState<KioskOverviewSummary | null>(null);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState('');
 const [filter, setFilter] = useState<FilterMode>('all');

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const data = await fetchKioskOverview(branchId);
 setBranches(data.branches);
 setSummary(data.summary);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan ringkasan cawangan');
 setBranches([]);
 setSummary(null);
 } finally {
 setLoading(false);
 }
 }, [branchId]);

 useEffect(() => {
 load();
 }, [load]);

 const filtered = useMemo(() => {
 let list = branches;
 const q = search.trim().toLowerCase();
 if (q) {
 list = list.filter(
 (b) =>
 b.branch_code.toLowerCase().includes(q) ||
 b.branch_name.toLowerCase().includes(q));
 }
 if (filter === 'low') list = list.filter((b) => b.worst_status === 'LOW');
 if (filter === 'critical') list = list.filter((b) => b.worst_status === 'CRITICAL');
 if (filter === 'pending') list = list.filter((b) => b.pending_transfers > 0);
 return list;
 }, [branches, search, filter]);

 if (loading) {
 return <Skeleton className="h-64 w-full rounded-xl" />;
 }

 if (!branches.length) {
 return (
 <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
 Tiada cawangan dalam skop anda. Pilih cawangan atau hubungi HQ.
 </p>);
 }

 const filterButtons: { id: FilterMode; label: string; count?: number }[] = [
 { id: 'all', label: 'Semua', count: branches.length },
 { id: 'low', label: 'Rendah', count: summary?.low },
 { id: 'critical', label: 'Kritikal', count: summary?.critical },
 { id: 'pending', label: 'Menunggu terima', count: summary?.pending },
 ];

 return (
 <div className="space-y-4">
 {summary && (
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
 <SummaryCard label="Cawangan" value={summary.total} icon={Building2} />
 <SummaryCard
 label="Stok rendah"
 value={summary.low}
 icon={AlertTriangle}
 tone="amber"
 />
 <SummaryCard
 label="Kritikal"
 value={summary.critical}
 icon={AlertTriangle}
 tone="red"
 />
 <SummaryCard
 label="Menunggu terima"
 value={summary.pending}
 icon={Truck}
 tone="violet"
 />
 {(summary.no_location ?? 0) > 0 && (
 <SummaryCard
 label="Tiada kiosk"
 value={summary.no_location ?? 0}
 icon={MapPin}
 tone="muted"
 />)}
 </div>)}

 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="relative max-w-xs flex-1">
 <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="Cari kod / nama cawangan..."
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="pl-9"
 />
 </div>
 <div className="flex flex-wrap gap-1.5">
 {filterButtons.map((btn) => (
 <Button
 key={btn.id}
 size="sm"
 variant={filter === btn.id ? 'default' : 'outline'}
 className="h-8 text-xs"
 onClick={() => setFilter(btn.id)}
 >
 {btn.label}
 {btn.count != null && btn.count > 0 && (
 <span className="ml-1 tabular-nums opacity-80">({btn.count})</span>)}
 </Button>))}
 </div>
 </div>

 <div className="overflow-hidden rounded-xl border shadow-sm">
 <div className="overflow-x-auto">
 <table className="w-full min-w-[780px] text-sm">
 <thead>
 <tr className="border-b bg-muted/50 text-left">
 <th className="px-4 py-3 font-semibold">Cawangan</th>
 {HQ_ROTI_ITEM_CODES.map((code) => (
 <th key={code} className="px-3 py-3 text-center font-semibold">
 <span className="block text-xs text-muted-foreground">
 {getStockByCode(code)?.name ?? rotiLabels[code]}
 </span>
 </th>))}
 <th className="px-3 py-3 font-semibold">Status</th>
 <th className="px-3 py-3" />
 </tr>
 </thead>
 <tbody>
 {filtered.map((b) => (
 <tr
 key={b.branch_id}
 className={cn(
 'border-b last:border-0 transition-colors hover:bg-muted/20',
 b.pending_transfers > 0 && 'bg-violet-50/40',
 b.worst_status === 'CRITICAL' && 'bg-red-50/30',
 !b.has_location && b.has_location !== undefined && 'opacity-60')}
 >
 <td className="px-4 py-3">
 <div className="flex items-start gap-2">
 <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
 <div>
 <p className="font-semibold">{b.branch_code}</p>
 <p className="text-xs text-muted-foreground">{b.branch_name}</p>
 {!b.location_id && (
 <p className="mt-1 text-[11px] font-medium text-amber-700">
 Lokasi kiosk belum disediakan
 </p>)}
 {b.pending_transfers > 0 && (
 <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-violet-700">
 <Truck className="h-3 w-3" />
 {b.pending_transfers} pindahan menunggu
 </p>)}
 </div>
 </div>
 </td>
 {HQ_ROTI_ITEM_CODES.map((code) => {
 const cell = b.roti[code];
 return (
 <td key={code} className="px-3 py-3 text-center tabular-nums">
 <span
 className={cn(
 'inline-block min-w-[3rem] rounded-md px-1.5 py-0.5 text-xs',
 cell?.status === 'CRITICAL' &&
 'bg-red-100 font-semibold text-red-900',
 cell?.status === 'LOW' && 'bg-amber-100 font-medium text-amber-900')}
 >
 {cell?.display ?? ' - '}
 </span>
 </td>);
 })}
 <td className="px-3 py-3">{statusBadge(b.worst_status)}</td>
 <td className="px-3 py-3">
 {b.location_id ? (
 <Button
 size="sm"
 variant="outline"
 className="gap-1"
 onClick={() => onSelectBranch(b.branch_id, b.location_id)}
 >
 <Package className="h-3.5 w-3.5" />
 Buka
 </Button>) : (
 <CheckCircle2 className="h-4 w-4 text-muted-foreground/40" />)}
 </td>
 </tr>))}
 </tbody>
 </table>
 </div>
 {filtered.length === 0 && (
 <p className="p-6 text-center text-sm text-muted-foreground">
 Tiada cawangan sepadan dengan tapisan.
 </p>)}
 </div>
 </div>);
}

function SummaryCard({
 label,
 value,
 icon: Icon,
 tone = 'default',
}: {
 label: string;
 value: number;
 icon: typeof Building2;
 tone?: 'default' | 'amber' | 'red' | 'violet' | 'muted';
}) {
 const valueClass = {
 default: '',
 amber: 'text-amber-700',
 red: 'text-destructive',
 violet: 'text-violet-700',
 muted: 'text-muted-foreground',
 }[tone];

 return (
 <div className="rounded-xl border bg-card p-3 shadow-sm">
 <div className="flex items-center justify-between gap-2">
 <p className="text-xs font-medium text-muted-foreground">{label}</p>
 <Icon className={cn('h-4 w-4 opacity-60', valueClass)} />
 </div>
 <p className={cn('mt-1 text-2xl font-bold tabular-nums', valueClass)}>{value}</p>
 </div>);
}
