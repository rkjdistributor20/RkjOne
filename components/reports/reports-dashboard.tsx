'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
 BarChart3,
 Building2,
 Package,
 TrendingUp,
 Users,
 Truck,
 Warehouse,
 Wallet,
 Banknote,
} from 'lucide-react';
import {
 fetchReportOverview,
 fetchSalesTrend,
 fetchBranchPerformance,
 fetchProductPerformance,
 fetchStaffPerformance,
 fetchInventoryReport,
 fetchFleetReport,
} from '@/lib/reports/api';
import type {
 BranchPerformanceRow,
 InventoryReportRow,
 ProductPerformanceRow,
 ReportOverview,
 SalesTrendRow,
 StaffPerformanceRow,
} from '@/lib/reports/types';
import { LOGISTIK_LABEL } from '@/lib/fleet/logistics-label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
 ModuleLayout,
 ModuleHeader,
 ModuleLoading,
 KpiGrid,
 KpiCard,
 PrimaryActionButton,
 moduleTabsListClass,
 moduleTabsTriggerClass,
 formatRM,
} from '@/components/shared/module-ui';

function fmt(n: number) {
 return `RM ${Number(n).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`;
}

function defaultRange() {
 const to = new Date();
 const from = new Date();
 from.setDate(1);
 return {
 from: from.toISOString().slice(0, 10),
 to: to.toISOString().slice(0, 10),
 };
}

export function ReportsDashboard() {
 const [range, setRange] = useState(defaultRange);
 const [overview, setOverview] = useState<ReportOverview | null>(null);
 const [trend, setTrend] = useState<SalesTrendRow[]>([]);
 const [branches, setBranches] = useState<BranchPerformanceRow[]>([]);
 const [products, setProducts] = useState<ProductPerformanceRow[]>([]);
 const [staff, setStaff] = useState<StaffPerformanceRow[]>([]);
 const [inventory, setInventory] = useState<InventoryReportRow[]>([]);
 const [fleet, setFleet] = useState({ pending: 0, in_transit: 0, delivered: 0, total_orders: 0 });
 const [loading, setLoading] = useState(true);

 const loadData = useCallback(async () => {
 setLoading(true);
 try {
 const [ov, tr, br, pr, st, inv, fl] = await Promise.all([
 fetchReportOverview(range.from, range.to),
 fetchSalesTrend(range.from, range.to),
 fetchBranchPerformance(range.from, range.to),
 fetchProductPerformance(range.from, range.to),
 fetchStaffPerformance(range.from, range.to),
 fetchInventoryReport(),
 fetchFleetReport(range.from, range.to),
 ]);
 setOverview(ov.overview);
 setTrend(tr.trend);
 setBranches(br.branches);
 setProducts(pr.products);
 setStaff(st.staff);
 setInventory(inv.items);
 setFleet(fl.fleet);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan laporan');
 } finally {
 setLoading(false);
 }
 }, [range.from, range.to]);

 useEffect(() => {
 loadData();
 }, [loadData]);

 const maxTrend = Math.max(...trend.map((t) => t.total_sales), 1);

 return (
 <ModuleLayout>
 <ModuleHeader
 title="Laporan"
 description={`Analisis jualan, prestasi cawangan, produk, staf, inventori, dan ${LOGISTIK_LABEL.toLowerCase()}`}
 icon={BarChart3}
 actions={
 <div className="flex flex-wrap items-end gap-2">
 <div className="space-y-1">
 <Label className="text-xs">Dari</Label>
 <Input
 type="date"
 className="h-9 w-36"
 value={range.from}
 onChange={(e) => setRange({...range, from: e.target.value })}
 />
 </div>
 <div className="space-y-1">
 <Label className="text-xs">Hingga</Label>
 <Input
 type="date"
 className="h-9 w-36"
 value={range.to}
 onChange={(e) => setRange({...range, to: e.target.value })}
 />
 </div>
 <PrimaryActionButton className="h-9" onClick={loadData}>
 Muat Semula
 </PrimaryActionButton>
 </div>
 }
 />

 {loading ? (
 <ModuleLoading />) : (
 <>
 <KpiGrid>
 <KpiCard title="Jumlah Jualan" value={fmt(overview?.total_sales ?? 0)} icon={TrendingUp} />
 <KpiCard title="Transaksi" value={overview?.transaction_count ?? 0} icon={BarChart3} />
 <KpiCard
 title="Tunai / QR"
 value={`${fmt(overview?.total_cash ?? 0)} / ${fmt(overview?.total_qr ?? 0)}`}
 icon={Banknote}
 />
 <KpiCard title="Gaji Bersih" value={fmt(overview?.payroll_net ?? 0)} icon={Wallet} />
 </KpiGrid>

 <Tabs defaultValue="sales" className="space-y-4">
 <TabsList className={moduleTabsListClass}>
 <TabsTrigger value="sales" className={moduleTabsTriggerClass}>
 <TrendingUp className="h-4 w-4" /> Jualan
 </TabsTrigger>
 <TabsTrigger value="branches" className={moduleTabsTriggerClass}>
 <Building2 className="h-4 w-4" /> Cawangan
 </TabsTrigger>
 <TabsTrigger value="products" className={moduleTabsTriggerClass}>
 <Package className="h-4 w-4" /> Produk
 </TabsTrigger>
 <TabsTrigger value="staff" className={moduleTabsTriggerClass}>
 <Users className="h-4 w-4" /> Staf
 </TabsTrigger>
 <TabsTrigger value="inventory" className={moduleTabsTriggerClass}>
 <Warehouse className="h-4 w-4" /> Stok
 </TabsTrigger>
 <TabsTrigger value="fleet" className={moduleTabsTriggerClass}>
 <Truck className="h-4 w-4" /> {LOGISTIK_LABEL}
 </TabsTrigger>
 </TabsList>

 <TabsContent value="sales" className="mt-4 space-y-4">
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-base flex items-center gap-2">
 <BarChart3 className="h-4 w-4" /> Daily Sales Trend
 </CardTitle>
 </CardHeader>
 <CardContent>
 {trend.length === 0 ? (
 <p className="text-sm text-muted-foreground">No sales data in range</p>) : (
 <div className="space-y-2">
 {trend.map((row) => (
 <div key={row.period} className="flex items-center gap-3 text-sm">
 <span className="w-24 shrink-0 text-muted-foreground">{row.period}</span>
 <div className="flex-1 rounded-full bg-muted h-2 overflow-hidden">
 <div
 className="h-full bg-amber-500 rounded-full"
 style={{ width: `${(row.total_sales / maxTrend) * 100}%` }}
 />
 </div>
 <span className="w-28 text-right font-medium">{fmt(row.total_sales)}</span>
 </div>))}
 </div>)}
 </CardContent>
 </Card>
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
 <div>Voids: <strong>{overview?.void_count ?? 0}</strong></div>
 <div>Refunds: <strong>{overview?.refund_count ?? 0}</strong></div>
 <div>Outstanding: <strong>{fmt(overview?.outstanding_cash ?? 0)}</strong></div>
 <div>Low stock: <strong>{overview?.low_stock_count ?? 0}</strong></div>
 </div>
 </TabsContent>

 <TabsContent value="branches" className="mt-4">
 <ReportTable
 headers={['Branch', 'Region', 'Sales', 'Txns', 'Cash', 'QR']}
 rows={branches.map((b) => [
 b.branch_name,
 b.region_name ?? ' - ',
 fmt(b.total_sales),
 String(b.transaction_count),
 fmt(b.total_cash),
 fmt(b.total_qr),
 ])}
 empty="No branch data"
 />
 </TabsContent>

 <TabsContent value="products" className="mt-4">
 <ReportTable
 headers={['Product', 'SKU', 'Qty Sold', 'Revenue']}
 rows={products.map((p) => [
 p.product_name,
 p.sku,
 String(p.quantity_sold),
 fmt(p.revenue),
 ])}
 empty="No product sales in range"
 />
 </TabsContent>

 <TabsContent value="staff" className="mt-4">
 <ReportTable
 headers={['Staff', 'Branch', 'Shifts', 'Sales']}
 rows={staff.map((s) => [
 s.full_name,
 s.branch_name ?? ' - ',
 String(s.shift_count),
 fmt(s.total_sales),
 ])}
 empty="No staff shift data in range"
 />
 </TabsContent>

 <TabsContent value="inventory" className="mt-4 space-y-2">
 {inventory.length === 0 ? (
 <p className="text-sm text-muted-foreground">All stock levels OK</p>) : (
 inventory.map((item, i) => (
 <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
 <div>
 <p className="font-medium">{item.name}</p>
 <p className="text-xs text-muted-foreground">
 {item.location_name} - {Number(item.quantity).toLocaleString()} {item.unit}
 </p>
 </div>
 <Badge variant={item.status === 'CRITICAL' ? 'destructive' : 'secondary'}>
 {item.status}
 </Badge>
 </div>)))}
 </TabsContent>

 <TabsContent value="fleet" className="mt-4">
 <div className="grid gap-3 sm:grid-cols-4">
 <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Orders</p><p className="text-2xl font-bold">{fleet.total_orders}</p></CardContent></Card>
 <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Pending</p><p className="text-2xl font-bold">{fleet.pending}</p></CardContent></Card>
 <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">In Transit</p><p className="text-2xl font-bold">{fleet.in_transit}</p></CardContent></Card>
 <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Delivered</p><p className="text-2xl font-bold text-green-700">{fleet.delivered}</p></CardContent></Card>
 </div>
 <p className="mt-3 text-sm text-muted-foreground">
 Active deliveries: {overview?.deliveries_pending ?? 0} pending in system
 </p>
 </TabsContent>
 </Tabs>
 </>)}
 </ModuleLayout>);
}

function ReportTable({
 headers,
 rows,
 empty,
}: {
 headers: string[];
 rows: string[][];
 empty: string;
}) {
 if (rows.length === 0) {
 return <p className="text-sm text-muted-foreground">{empty}</p>;
 }
 return (
 <div className="overflow-x-auto rounded-lg border">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b bg-muted/50 text-left">
 {headers.map((h) => (
 <th key={h} className="p-3 font-medium">{h}</th>))}
 </tr>
 </thead>
 <tbody>
 {rows.map((row, i) => (
 <tr key={i} className="border-b">
 {row.map((cell, j) => (
 <td key={j} className={`p-3 ${j === row.length - 1 ? 'font-medium' : ''}`}>{cell}</td>))}
 </tr>))}
 </tbody>
 </table>
 </div>);
}
