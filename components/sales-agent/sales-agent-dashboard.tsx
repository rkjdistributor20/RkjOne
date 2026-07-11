'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
 CreditCard,
 Factory,
 FileText,
 Pencil,
 Plus,
 Package,
 RefreshCw,
 ShoppingCart,
 Store,
 Users,
 Trash2,
 UserCheck,
 UserPlus,
} from 'lucide-react';
import {
 confirmAgentPayment,
 createAgentOrder,
 createAgentPayment,
 fetchAgentDashboard,
 fetchAgentReceipt,
 fetchAgentSalesStaff,
 fetchAdminAgentAccounts,
 createAdminAgentAccount,
 updateAdminAgentAccount,
 suspendAdminAgentAccount,
 assignSpecialAgentStaff,
 endSpecialAgentAssignment,
 fetchStockCatalog,
 createAgentSalesStaff,
 updateAgentSalesStaff,
 registerAgentAccount,
 registerAgentOutlet,
 startOutletSubscription,
} from '@/lib/sales-agent/api';
import type {
 AgentDashboardData,
 AgentPaymentReceipt,
 AgentPaymentTarget,
 AgentStockOrder,
 AgentSalesStaff,
 AdminSalesAgentAccount,
 AgentPriceGroupOption,
 AgentAccountReportEvent,
 AgentSpecialAssignableStaff,
 AgentSpecialStaffAssignment,
 AdminAgentDriverOption,
 AdminBranchPickupOption,
 StockCatalogItem,
} from '@/lib/sales-agent/types';
import { AgentPaymentDialog } from '@/components/sales-agent/agent-payment-dialog';
import { AgentReceiptDialog } from '@/components/sales-agent/agent-receipt-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
 EmptyState,
 KpiCard,
 KpiGrid,
 ModuleHeader,
 ModuleLayout,
 PrimaryActionButton,
 SectionCard,
} from '@/components/shared/module-ui';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { formatRM } from '@/components/shared/module-ui';
import { useAuthStore } from '@/stores/auth-store';
import { isSalesAgentRole } from '@/lib/auth/sales-agent-access';
import { WorkflowSopPanel } from '@/components/dashboard/workflow-sop-panel';
import { OperationsWorkflowMap } from '@/components/dashboard/operations-workflow-map';
import { getRoleWorkflow } from '@/lib/dashboard/role-workflows';
import { formatProductionDayLabel } from '@/lib/production/week-utils';
import { boundSelectValue } from '@/lib/ui/select-utils';
import { useLanguage } from '@/components/i18n/language-provider';

const ORDER_STATUS: Record<string, string> = {
 DRAFT: 'Draf',
 PENDING_PAYMENT: 'Menunggu Bayaran',
 PAID: 'Dibayar',
 SUBMITTED_FACTORY: 'Dihantar Kilang',
 ACKNOWLEDGED: 'Kilang Terima',
 FULFILLED: 'Selesai',
 CANCELLED: 'Batal',
};

const PAYMENT_STATUS: Record<string, string> = {
 PENDING: 'Menunggu Bank',
 PAID: 'Disahkan Bank',
 FAILED: 'Gagal',
 CANCELLED: 'Dibatalkan',
 REFUNDED: 'Dibayar Balik',
};

const ADMIN_AGENT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER']);

const PAY_METHODS = [
 { id: 'FPX', label: 'FPX (Online Banking)' },
 { id: 'CARD', label: 'Kad Kredit' },
 { id: 'DEBIT', label: 'Kad Debit' },
] as const;

export function SalesAgentDashboard() {
 const { t } = useLanguage();
 const profile = useAuthStore((s) => s.profile);
 const adminMode = profile ? ADMIN_AGENT_ROLES.has(profile.role) : false;
 const [data, setData] = useState<AgentDashboardData | null>(null);
 const [catalog, setCatalog] = useState<StockCatalogItem[]>([]);
 const [salesStaff, setSalesStaff] = useState<AgentSalesStaff[]>([]);
 const [salesStaffSaving, setSalesStaffSaving] = useState(false);
 const [loading, setLoading] = useState(true);
 const [registering, setRegistering] = useState(false);
 const [companyName, setCompanyName] = useState('');
 const [selectedDate, setSelectedDate] = useState('');
 const [quantities, setQuantities] = useState<Record<string, number>>({});
 const [payMethod, setPayMethod] = useState<'FPX' | 'CARD' | 'DEBIT'>('FPX');
 const [paymentOpen, setPaymentOpen] = useState(false);
 const [paymentLoading, setPaymentLoading] = useState(false);
 const [paymentTarget, setPaymentTarget] = useState<AgentPaymentTarget | null>(null);
 const [receiptOpen, setReceiptOpen] = useState(false);
 const [lastReceipt, setLastReceipt] = useState<AgentPaymentReceipt | null>(null);
 const workflow = getRoleWorkflow({ role: 'SALES_AGENT' });
 const [outletForm, setOutletForm] = useState({
 outlet_code: '',
 outlet_name: '',
 address_line: '',
 city: '',
 state: '',
 postcode: '',
 });
 const [salesStaffForm, setSalesStaffForm] = useState({
 full_name: '',
 phone: '',
 email: '',
 role_title: 'Staf Jualan Outlet',
 outlet_id: 'none',
 duty_scope: '',
 });

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const [dash, cat] = await Promise.all([fetchAgentDashboard(), fetchStockCatalog()]);
 setData(dash);
 setCatalog(cat.items);
 const openDates = dash.production_days.filter((d) => d.window_open);
 if (!selectedDate || !openDates.some((d) => d.production_date === selectedDate)) {
 setSelectedDate(openDates[0]?.production_date ?? '');
 }
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal muat dashboard');
 } finally {
 setLoading(false);
 }
 }, [selectedDate]);

 useEffect(() => {
 void load();
 }, [load]);

 function openPayment(target: AgentPaymentTarget) {
 setPaymentTarget(target);
 setPaymentOpen(true);
 }

 async function runPayment(target: AgentPaymentTarget) {
 setPaymentLoading(true);
 try {
 const { payment, checkout } = await createAgentPayment({
 purpose: target.purpose,
 reference_id: target.referenceId,
 payment_method: payMethod,
 });

 if (checkout.mode === 'live' && checkout.checkout_url) {
 toast.message('Menghubung ke iPay88 - pengesahan bank diperlukan.');
 window.location.href = checkout.checkout_url;
 return;
 }

 if (checkout.mode === 'simulate') {
 const confirmed = await confirmAgentPayment(payment.id);
 if (confirmed.receipt) {
 setLastReceipt(confirmed.receipt);
 setReceiptOpen(true);
 }
 toast.success(
 target.purpose === 'STOCK_ORDER'
 ? 'Bayaran berjaya - order dihantar ke kilang'
 : 'Langganan POS aktif - resit rasmi dikeluarkan');
 setPaymentOpen(false);
 setPaymentTarget(null);
 if (target.purpose === 'STOCK_ORDER') {
 setQuantities({});
 }
 await load();
 return;
 }

 toast.error('Gerbang bayaran tidak tersedia - hubungi HQ.');
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Bayaran gagal');
 } finally {
 setPaymentLoading(false);
 }
 }

 async function showReceiptForPayment(paymentId: string) {
 try {
 const { receipt } = await fetchAgentReceipt(paymentId);
 setLastReceipt(receipt);
 setReceiptOpen(true);
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Resit tidak dijumpai');
 }
 }

 const orderTotal = useMemo(() => {
 return catalog.reduce((sum, item) => {
 const q = quantities[item.id] ?? 0;
 return sum + q * item.unit_price_rm;
 }, 0);
 }, [catalog, quantities]);
 const hasOpenProductionDate = data?.production_days.some((d) => d.window_open) ?? false;

 async function handleRegister() {
 if (!companyName.trim()) {
 toast.error('Masukkan nama syarikat');
 return;
 }
 setRegistering(true);
 try {
 await registerAgentAccount({ company_name: companyName.trim() });
 toast.success('Akaun ejen didaftarkan');
 await load();
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal daftar');
 } finally {
 setRegistering(false);
 }
 }

 async function handleCreateOrder() {
 if (!selectedDate) {
 toast.error('Pilih tarikh production');
 return;
 }
 const items = catalog.filter((c) => (quantities[c.id] ?? 0) > 0).map((c) => ({ stock_item_id: c.id, quantity: quantities[c.id] }));
 if (!items.length) {
 toast.error('Masukkan kuantiti stok');
 return;
 }
 try {
 const { order } = await createAgentOrder({ production_date: selectedDate, items });
 if (order.payment_exempt || order.status === 'SUBMITTED_FACTORY') {
 toast.success(`Order ${order.order_number} dihantar ke kilang tanpa bayaran`);
 setQuantities({});
 await load();
 return;
 }
 toast.success(`Order ${order.order_number} dicipta`);
 openPayment({
 purpose: 'STOCK_ORDER',
 referenceId: order.id,
 label: order.order_number,
 amountRm: order.total_amount_rm,
 productionDate: order.production_date,
 });
 await load();
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal cipta order');
 }
 }

 function handlePayOrder(order: AgentStockOrder) {
 openPayment({
 purpose: 'STOCK_ORDER',
 referenceId: order.id,
 label: order.order_number,
 amountRm: order.total_amount_rm,
 productionDate: order.production_date,
 });
 }

 async function handleRegisterOutlet() {
 if (!outletForm.outlet_code || !outletForm.outlet_name) {
 toast.error('Kod dan nama cawangan diperlukan');
 return;
 }
 try {
 await registerAgentOutlet(outletForm);
 toast.success('Cawangan didaftarkan - langgan POS RM200/bulan');
 setOutletForm({ outlet_code: '', outlet_name: '', address_line: '', city: '', state: '', postcode: '' });
 await load();
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal daftar cawangan');
 }
 }

 async function handleCreateSalesStaff() {
 if (!salesStaffForm.full_name.trim()) {
 toast.error('Masukkan nama staf jualan');
 return;
 }
 setSalesStaffSaving(true);
 try {
 await createAgentSalesStaff({
 full_name: salesStaffForm.full_name.trim(),
 phone: salesStaffForm.phone.trim() || null,
 email: salesStaffForm.email.trim() || null,
 role_title: salesStaffForm.role_title.trim() || 'Staf Jualan',
 outlet_id: safeSalesStaffOutletId === 'none' ? null : safeSalesStaffOutletId,
 duty_scope: salesStaffForm.duty_scope.trim() || null,
 });
 toast.success('Staf jualan Ejen Khas didaftarkan');
 setSalesStaffForm({
 full_name: '',
 phone: '',
 email: '',
 role_title: 'Staf Jualan Outlet',
 outlet_id: 'none',
 duty_scope: '',
 });
 await load();
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal daftar staf jualan');
 } finally {
 setSalesStaffSaving(false);
 }
 }

 async function handleSalesStaffStatus(staffId: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') {
 try {
 await updateAgentSalesStaff(staffId, { status });
 toast.success(status === 'ACTIVE' ? 'Staf diaktifkan' : 'Status staf dikemas kini');
 await load();
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal kemas kini staf');
 }
 }

 async function handleSubscribe(outletId: string, outletLabel: string) {
 try {
 const { subscription, payment_exempt, activated } = await startOutletSubscription(outletId);
 if (payment_exempt || activated || subscription.status === 'ACTIVE') {
 toast.success(`POS ${outletLabel} aktif tanpa bayaran`);
 await load();
 return;
 }
 openPayment({
 purpose: 'POS_SUBSCRIPTION',
 referenceId: subscription.id,
 label: outletLabel,
 amountRm: subscription.amount_rm,
 });
 await load();
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Langganan gagal');
 }
 }

 if (loading && !data) {
 return (
 <ModuleLayout>
 <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
 </ModuleLayout>);
 }

 if (!data?.account) {
 const canSelfRegister = profile ? isSalesAgentRole(profile.role) : false;

 if (adminMode) {
 return (
 <AdminSalesAgentManagement workflow={workflow} />);
 }

 if (!canSelfRegister) {
 return (
 <ModuleLayout>
 <ModuleHeader
 title={t('module.agent.title')}
 description={t('module.agent.description')}
 icon={Store}
 />
 <WorkflowSopPanel workflow={workflow} />
 <OperationsWorkflowMap focus="agent" compact />
 <Card className="max-w-lg">
 <CardContent className="pt-6 text-sm text-muted-foreground">
 <p>
 Tiada akaun ejen dipautkan kepada profil anda. Cipta pengguna dengan peranan{' '}
 <strong>Ejen Jualan</strong> di Tetapan ke Pengguna (syarikat RKJ Distributor), kemudian
 ejen log masuk dan daftar syarikat di halaman ini.
 </p>
 </CardContent>
 </Card>
 </ModuleLayout>);
 }

 return (
 <ModuleLayout>
 <ModuleHeader
 title={t('module.agent.title')}
 description={t('module.agent.description')}
 icon={Store}
 />
 <WorkflowSopPanel workflow={workflow} />
 <OperationsWorkflowMap focus="agent" compact />
 <Card className="max-w-lg border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white">
 <CardHeader>
 <div className="flex items-center gap-3">
 <LegalEntityLogo size={48} />
 <CardTitle className="text-lg">Daftar Akaun Ejen</CardTitle>
 </div>
 </CardHeader>
 <CardContent className="space-y-4">
 <p className="text-sm text-muted-foreground">
 Daftar syarikat ejen jualan untuk order stok ke kilang (ikut jadual & cutoff) dan
 langgan POS RM200/cawangan/bulan.
 </p>
 <div className="space-y-2">
 <Label>Nama Syarikat Ejen</Label>
 <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Contoh: ABC Trading Sdn Bhd" />
 </div>
 <PrimaryActionButton onClick={handleRegister} disabled={registering}>
 Daftar & Mula
 </PrimaryActionButton>
 </CardContent>
 </Card>
 </ModuleLayout>);
 }

 const isSpecialAgent = Boolean(data.account?.payment_exempt);
 const canManageSalesStaff = isSpecialAgent || data.stats.active_outlets > 0;
 const outletSelectValues = ['none',...data.outlets.map((outlet) => outlet.id)];
 const safeSalesStaffOutletId =
 boundSelectValue(salesStaffForm.outlet_id || 'none', outletSelectValues) ?? 'none';
 const selectedSalesStaffOutlet =
 data.outlets.find((outlet) => outlet.id === safeSalesStaffOutletId) ?? null;

 return (
 <ModuleLayout>
 <ModuleHeader
 title={t('module.agent.title')}
 description={`${data.account.company_name} - RKJ Distributor Sdn Bhd`}
 icon={Store}
 actions={
 <Button variant="outline" size="sm" onClick={() => void load()}>
 <RefreshCw className="mr-1 h-4 w-4" /> {t('common.refresh')}
 </Button>
 }
 />

 <WorkflowSopPanel workflow={workflow} />
 <OperationsWorkflowMap focus="agent" compact />

 {!data.payment_gateway.ipay88_configured && (
 <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
 <p className="font-medium">Mod pilot - payment gateway belum diaktifkan</p>
 <p className="mt-1 text-xs text-amber-900">
 Bayaran disahkan dalam sistem untuk ujian. Selepas credential merchant payment gateway diset di Vercel,
 FPX/kad akan dihantar ke Maybank RKJ Distributor dengan pengesahan bank sebenar.
 </p>
 </div>)}

 <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-800 px-4 py-3 text-white">
 <LegalEntityLogo size={36} className="rounded-md bg-white/10 p-1" />
 <div>
 <p className="text-sm font-semibold">{t('module.agent.stockSupply')}</p>
 <p className="text-xs text-emerald-100">
 Order ikut tarikh production kilang - Bayaran FPX/Kad ke Maybank RKJ Distributor - 
 {data.payment_gateway.ipay88_configured
 ? ' Tempahan disahkan selepas pengesahan bank'
 : ' Mod pilot - bayaran ujian aktif sehingga gateway live'}
 </p>
 </div>
 </div>

 <KpiGrid>
 <KpiCard title={t('module.agent.pendingOrders')} value={String(data.stats.pending_orders)} icon={Package} />
 <KpiCard title={t('module.agent.factorySubmitted')} value={String(data.stats.factory_submitted)} icon={Factory} />
 <KpiCard title={t('module.agent.activePosOutlets')} value={String(data.stats.active_outlets)} icon={ShoppingCart} />
 <KpiCard title={t('module.agent.subscriptionPerBranch')} value={formatRM(data.subscription_monthly_rm)} icon={CreditCard} />
 </KpiGrid>

 <div className="mb-4 flex flex-wrap gap-2">
 <Label className="sr-only">Kaedah bayaran</Label>
 {PAY_METHODS.map((m) => (
 <Button
 key={m.id}
 size="sm"
 variant={payMethod === m.id ? 'default' : 'outline'}
 onClick={() => setPayMethod(m.id)}
 >
 {m.label}
 </Button>))}
 </div>

 <Tabs defaultValue="orders" className="mt-4">
 <TabsList>
 <TabsTrigger value="orders">{t('module.agent.stockOrders')}</TabsTrigger>
 <TabsTrigger value="outlets">{t('module.agent.posOutlets')}</TabsTrigger>
 <TabsTrigger value="sales-staff">{t('module.agent.salesStaff')}</TabsTrigger>
 <TabsTrigger value="history">{t('common.history')}</TabsTrigger>
 </TabsList>

 <TabsContent value="orders" className="space-y-4">
 <SectionCard title={t('module.agent.factoryProductionDate')}>
 <div className="flex flex-wrap gap-2">
 {data.production_days.map((d) => (
 <Button
 key={d.production_date}
 size="sm"
 variant={selectedDate === d.production_date ? 'default' : 'outline'}
 disabled={!d.window_open}
 onClick={() => setSelectedDate(d.production_date)}
 >
 {formatProductionDayLabel(d.production_date)}
 {!d.window_open && ' (tutup)'}
 </Button>))}
 </div>
 {data.production_days.length === 0 && (
 <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-950">
 Jadual preorder belum dibuka. HQ/kilang perlu terbitkan tarikh production minggu akan datang
 dahulu sebelum ejen biasa dan Ejen Khas boleh buat order stok.
 </div>)}
 {data.production_days.length > 0 && !hasOpenProductionDate && (
 <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-950">
 Semua tarikh production yang dipaparkan sudah tutup. Tunggu HQ/kilang buka jadual baru untuk
 preorder seterusnya.
 </div>)}
 </SectionCard>

 <SectionCard title={t('module.agent.stockList')}>
 <div className="overflow-x-auto rounded-lg border">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b bg-muted/50 text-left text-muted-foreground">
 <th className="p-2">Item</th>
 <th className="p-2">Harga/unit</th>
 <th className="p-2 w-24">Kuantiti</th>
 </tr>
 </thead>
 <tbody>
 {catalog.map((item) => (
 <tr key={item.id} className="border-b">
 <td className="p-2">
 <p className="font-medium">{item.item_name}</p>
 <p className="text-xs text-muted-foreground">{item.item_code}</p>
 </td>
 <td className="p-2">{formatRM(item.unit_price_rm)}</td>
 <td className="p-2">
 <Input
 type="number"
 min={0}
 className="h-8"
 value={quantities[item.id] ?? ''}
 onChange={(e) =>
 setQuantities((prev) => ({...prev,
 [item.id]: Number.parseInt(e.target.value, 10) || 0,
 }))
 }
 />
 </td>
 </tr>))}
 </tbody>
 </table>
 </div>
 <div className="mt-3 flex items-center justify-between">
 <p className="font-semibold">Jumlah: {formatRM(orderTotal)}</p>
 <PrimaryActionButton onClick={handleCreateOrder} disabled={orderTotal <= 0 || !selectedDate || !hasOpenProductionDate}>
 {data.account?.payment_exempt ? 'Order Tanpa Bayaran' : 'Order & Terus Bayar'}
 </PrimaryActionButton>
 </div>
 </SectionCard>

 <SectionCard title={t('module.agent.pendingPaymentOrders')}>
 {data.orders.filter((o) => o.status === 'PENDING_PAYMENT').length === 0 ? (
 <EmptyState title={t('module.agent.noPendingOrders')} description={t('module.agent.noPendingOrdersDesc')} />) : (
 data.orders.filter((o) => o.status === 'PENDING_PAYMENT').map((o) => (
 <div key={o.id} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
 <div>
 <p className="font-medium">{o.order_number}</p>
 <p className="text-xs text-muted-foreground">
 Production {o.production_date} - {formatRM(o.total_amount_rm)}
 </p>
 </div>
 <Button size="sm" onClick={() => handlePayOrder(o)}>
 Bayar Sekarang
 </Button>
 </div>)))}
 </SectionCard>
 </TabsContent>

 <TabsContent value="outlets" className="space-y-4">
 <SectionCard title={t('module.agent.registerPosOutlet')}>
 <div className="grid gap-3 sm:grid-cols-2">
 <div>
 <Label>Kod Cawangan</Label>
 <Input value={outletForm.outlet_code} onChange={(e) => setOutletForm((p) => ({...p, outlet_code: e.target.value }))} placeholder="AG-001" />
 </div>
 <div>
 <Label>Nama Cawangan</Label>
 <Input value={outletForm.outlet_name} onChange={(e) => setOutletForm((p) => ({...p, outlet_name: e.target.value }))} />
 </div>
 <div className="sm:col-span-2">
 <Label>Alamat</Label>
 <Input value={outletForm.address_line} onChange={(e) => setOutletForm((p) => ({...p, address_line: e.target.value }))} />
 </div>
 </div>
 <p className="mt-2 text-xs text-muted-foreground">
 {data.account?.payment_exempt
 ? 'Langganan POS: Ejen khas syarikat - tanpa bayaran.'
 : `Langganan POS: RM${data.subscription_monthly_rm}/cawangan/bulan - tamat tempoh setiap bulan.`}{' '}
 {data.account?.payment_exempt
 ? 'Akses POS akan diaktifkan terus untuk ejen khas syarikat.'
 : 'Bayar semula untuk terus guna bulan seterusnya.'}
 </p>
 <PrimaryActionButton className="mt-3" onClick={handleRegisterOutlet}>
 {t('module.agent.registerPosOutlet')}
 </PrimaryActionButton>
 </SectionCard>

 <SectionCard title={t('module.agent.myOutlets')}>
 {data.outlets.length === 0 ? (
 <EmptyState title={t('module.agent.noOutlets')} description={t('module.agent.noOutletsDesc')} />) : (
 data.outlets.map((o) => {
 const sub = o.subscription;
 const expired =
 sub?.status === 'EXPIRED' ||
 (sub?.status === 'ACTIVE' && sub.period_end < new Date().toISOString().slice(0, 10));
 const pendingPay = sub?.status === 'PENDING';

 return (
 <div key={o.id} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
 <div>
 <p className="font-medium">{o.outlet_name}</p>
 <p className="text-xs text-muted-foreground">{o.outlet_code}</p>
 {sub && sub.status === 'ACTIVE' && o.subscription_active && (
 <p className="text-xs text-emerald-700">
 Aktif hingga {sub.period_end}
 </p>)}
 {expired && (
 <p className="text-xs text-amber-700">Langganan tamat - bayar untuk bulan seterusnya</p>)}
 </div>
 <div className="flex items-center gap-2">
 {o.subscription_active ? (
 <Badge className="bg-emerald-600">POS Aktif</Badge>) : pendingPay ? (
 <>
 <Badge variant="outline">Menunggu Bayaran Bank</Badge>
 <Button size="sm" onClick={() => void handleSubscribe(o.id, o.outlet_name)}>
 {data.account?.payment_exempt ? 'Aktifkan POS' : 'Teruskan Bayar RM' + data.subscription_monthly_rm}
 </Button>
 </>) : (
 <>
 <Badge variant="outline">{expired ? 'Tamat Tempoh' : 'Menunggu Langganan'}</Badge>
 <Button size="sm" onClick={() => void handleSubscribe(o.id, o.outlet_name)}>
 {data.account?.payment_exempt ? 'Aktifkan POS' : (expired ? 'Renew' : 'Bayar') + ' RM' + data.subscription_monthly_rm}
 </Button>
 </>)}
 </div>
 </div>);
 }))}
 </SectionCard>
 </TabsContent>

 <TabsContent value="sales-staff" className="space-y-4">
 {!canManageSalesStaff ? (
 <SectionCard title="Staf Jualan Outlet">
 <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950">
 <p className="font-medium">Langgan POS diperlukan</p>
 <p className="mt-1 text-xs">
 Ejen biasa boleh guna fungsi daftar staf jualan selepas sekurang-kurangnya satu cawangan POS aktif. Daftar cawangan di tab Cawangan POS dan langgan POS syarikat RM{data.subscription_monthly_rm}/cawangan/bulan.
 </p>
 </div>
 </SectionCard>) : (
 <>
 <SectionCard title={isSpecialAgent ? "Staf Jualan Ejen Khas" : "Staf Jualan Outlet"}>
 <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-950">
 <div className="flex items-start gap-2">
 <Users className="mt-0.5 h-4 w-4" />
 <div>
 <p className="font-medium">Aliran kerja seperti Area Manager</p>
 <p className="mt-1 text-xs">
 {isSpecialAgent
 ? 'Muhammad boleh daftar staf jualan, pautkan outlet/POS, tetapkan skop tugas harian dan pantau status staf untuk laluan perniagaan Ejen Khas.'
 : 'Ejen boleh daftar staf jualan selepas POS aktif, pautkan staf kepada outlet/POS, dan pantau tugasan jualan harian.'}
 </p>
 </div>
 </div>
 </div>

 <div className="grid gap-3 md:grid-cols-2">
 <div>
 <Label>Nama Staf Jualan</Label>
 <Input
 value={salesStaffForm.full_name}
 onChange={(e) => setSalesStaffForm((p) => ({...p, full_name: e.target.value }))}
 placeholder="Contoh: Nur Aina"
 />
 </div>
 <div>
 <Label>Jawatan / Peranan</Label>
 <Select
 value={salesStaffForm.role_title}
 onValueChange={(value) => setSalesStaffForm((p) => ({...p, role_title: value ?? 'Staf Jualan Outlet' }))}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="Staf Jualan Outlet">Staf Jualan Outlet</SelectItem>
 <SelectItem value="PIC POS / Cashier">PIC POS / Cashier</SelectItem>
 <SelectItem value="Runner Jualan">Runner Jualan</SelectItem>
 <SelectItem value="Supervisor Outlet Ejen">Supervisor Outlet Ejen</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div>
 <Label>No. Telefon</Label>
 <Input
 value={salesStaffForm.phone}
 onChange={(e) => setSalesStaffForm((p) => ({...p, phone: e.target.value }))}
 placeholder="01X-XXXXXXX"
 />
 </div>
 <div>
 <Label>Email</Label>
 <Input
 value={salesStaffForm.email}
 onChange={(e) => setSalesStaffForm((p) => ({...p, email: e.target.value }))}
 placeholder="nama@email.com"
 />
 </div>
 <div className="md:col-span-2">
 <Label>Outlet / POS Bertugas</Label>
 <Select
 value={safeSalesStaffOutletId}
 onValueChange={(value) => setSalesStaffForm((p) => ({...p, outlet_id: value ?? 'none' }))}
 >
 <SelectTrigger>
 <SelectValue placeholder="Pilih outlet/POS">
 {selectedSalesStaffOutlet
 ? `${selectedSalesStaffOutlet.outlet_code} - ${selectedSalesStaffOutlet.outlet_name}`
 : 'Belum ditetapkan'}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="none">Belum ditetapkan</SelectItem>
 {data.outlets.map((outlet) => (
 <SelectItem key={outlet.id} value={outlet.id}>
 {outlet.outlet_code} - {outlet.outlet_name}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="md:col-span-2">
 <Label>Skop Tugas</Label>
 <Textarea
 value={salesStaffForm.duty_scope}
 onChange={(e) => setSalesStaffForm((p) => ({...p, duty_scope: e.target.value }))}
 placeholder="Contoh: buka POS, rekod jualan harian, semak stok, lapor isu kepada Muhammad."
 rows={3}
 />
 </div>
 </div>

 <PrimaryActionButton className="mt-3" onClick={handleCreateSalesStaff} disabled={salesStaffSaving}>
 <Plus className="mr-1 h-4 w-4" /> Tambah Staf Jualan
 </PrimaryActionButton>
 </SectionCard>

 <SectionCard title="Senarai Staf & Tugasan Outlet">
 {salesStaff.length === 0 ? (
 <EmptyState title="Belum ada staf jualan" description="Tambah staf untuk outlet/POS Ejen Khas dahulu." />) : (
 <div className="space-y-2">
 {salesStaff.map((staff) => (
 <div key={staff.id} className="rounded-lg border p-3 text-sm">
 <div className="flex flex-wrap items-start justify-between gap-2">
 <div>
 <p className="font-medium">{staff.full_name}</p>
 <p className="text-xs text-muted-foreground">
 {staff.role_title} {staff.outlet ? '? ' + staff.outlet.outlet_code + ' - ' + staff.outlet.outlet_name : '? Belum paut outlet'}
 </p>
 {staff.duty_scope && <p className="mt-2 text-xs text-muted-foreground">{staff.duty_scope}</p>}
 {(staff.phone || staff.email) && (
 <p className="mt-1 text-xs text-muted-foreground">{[staff.phone, staff.email].filter(Boolean).join(' ? ')}</p>)}
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <Badge variant={staff.status === 'ACTIVE' ? 'default' : 'outline'}>
 {staff.status === 'ACTIVE' ? 'Aktif' : staff.status === 'SUSPENDED' ? 'Digantung' : 'Tidak Aktif'}
 </Badge>
 {staff.status !== 'ACTIVE' ? (
 <Button size="sm" variant="outline" onClick={() => void handleSalesStaffStatus(staff.id, 'ACTIVE')}>
 Aktifkan
 </Button>) : (
 <Button size="sm" variant="outline" onClick={() => void handleSalesStaffStatus(staff.id, 'INACTIVE')}>
 Nonaktif
 </Button>)}
 </div>
 </div>
 </div>))}
 </div>)}
 </SectionCard>
 </>)}
 </TabsContent>

 <TabsContent value="history">
 <SectionCard title={t('module.agent.orderPayment')}>
 {data.orders.map((o) => (
 <div key={o.id} className="mb-2 rounded-lg border p-3 text-sm">
 <div className="flex justify-between">
 <span className="font-medium">{o.order_number}</span>
 <Badge variant="outline">{ORDER_STATUS[o.status] ?? o.status}</Badge>
 </div>
 <p className="text-xs text-muted-foreground">
 {o.production_date} - {formatRM(o.total_amount_rm)}
 </p>
 </div>))}
 {data.payments.map((p) => (
 <div key={p.id} className="mb-2 rounded-lg border p-3 text-sm">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div>
 <span>{p.purpose === 'STOCK_ORDER' ? 'Bayaran Order' : 'Langganan POS'}</span>
 <p className="text-xs text-muted-foreground">
 {p.payment_method} - {formatRM(p.amount_rm)}
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Badge variant={p.status === 'PAID' ? 'default' : p.lifecycle_status === 'CANCELLED' || p.status === 'FAILED' ? 'destructive' : 'outline'}>
 {PAYMENT_STATUS[p.lifecycle_status ?? p.status] ?? p.lifecycle_status ?? p.status}
 </Badge>
 {p.status === 'PAID' && (
 <Button size="sm" variant="outline" onClick={() => void showReceiptForPayment(p.id)}>
 <FileText className="mr-1 h-3.5 w-3.5" />
 Resit
 </Button>)}
 </div>
 </div>
 </div>))}
 </SectionCard>
 </TabsContent>
 </Tabs>

 <AgentPaymentDialog
 open={paymentOpen}
 onOpenChange={setPaymentOpen}
 target={paymentTarget}
 payMethod={payMethod}
 onPayMethodChange={setPayMethod}
 loading={paymentLoading}
 paymentGatewayConfigured={data.payment_gateway.ipay88_configured}
 onConfirm={async () => {
 if (paymentTarget) await runPayment(paymentTarget);
 }}
 />

 <AgentReceiptDialog
 open={receiptOpen}
 onOpenChange={setReceiptOpen}
 receipt={lastReceipt}
 />
 </ModuleLayout>);
}


type AdminAgentForm = {
 email: string;
 password: string;
 full_name: string;
 company_name: string;
 registration_no: string;
 contact_person: string;
 contact_phone: string;
 contact_email: string;
 business_address: string;
 assigned_price_group_id: string | null;
 assigned_driver_name: string;
 pickup_location: string;
 source_reference: string;
 staff_id: string;
};

const EMPTY_ADMIN_AGENT_FORM: AdminAgentForm = {
 email: '',
 password: '',
 full_name: '',
 company_name: '',
 registration_no: '',
 contact_person: '',
 contact_phone: '',
 contact_email: '',
 business_address: '',
 assigned_price_group_id: '',
 assigned_driver_name: '',
 pickup_location: '',
 source_reference: '',
 staff_id: '',
};

function AdminSalesAgentManagement({ workflow }: { workflow: ReturnType<typeof getRoleWorkflow> }) {
 const { t } = useLanguage();
 const [accounts, setAccounts] = useState<AdminSalesAgentAccount[]>([]);
 const [priceGroups, setPriceGroups] = useState<AgentPriceGroupOption[]>([]);
 const [reportEvents, setReportEvents] = useState<AgentAccountReportEvent[]>([]);
 const [assignableStaff, setAssignableStaff] = useState<AgentSpecialAssignableStaff[]>([]);
 const [specialAssignments, setSpecialAssignments] = useState<AgentSpecialStaffAssignment[]>([]);
 const [drivers, setDrivers] = useState<AdminAgentDriverOption[]>([]);
 const [branches, setBranches] = useState<AdminBranchPickupOption[]>([]);
 const [specialStaffByAccount, setSpecialStaffByAccount] = useState<Record<string, string>>({});
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [editingId, setEditingId] = useState<string | null>(null);
 const [form, setForm] = useState<AdminAgentForm>(EMPTY_ADMIN_AGENT_FORM);
 const [editForm, setEditForm] = useState<AdminAgentForm>(EMPTY_ADMIN_AGENT_FORM);
 const [lastLogin, setLastLogin] = useState<{ email: string; password: string } | null>(null);
 const [agentListFilter, setAgentListFilter] = useState<'ALL' | 'NORMAL' | 'SPECIAL'>('ALL');

 const loadAdmin = useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetchAdminAgentAccounts();
 setAccounts(res.accounts);
 setPriceGroups(res.price_groups);
 setReportEvents(res.report_events);
 setAssignableStaff(res.assignable_staff);
 setSpecialAssignments(res.special_assignments);
 setDrivers(res.drivers ?? []);
 setBranches(res.branches ?? []);
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal muat senarai ejen');
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 void loadAdmin();
 }, [loadAdmin]);

 const activePriceGroups = useMemo(
 () => priceGroups.filter((g) => g.id && g.name && g.status !== 'INACTIVE'),
 [priceGroups]);
 const normalPriceGroups = useMemo(
 () => activePriceGroups.filter((g) => !g.payment_exempt && g.code !== 'EJEN_KHAS_SYARIKAT'),
 [activePriceGroups]);
 const priceGroupSelectValues = useMemo(
 () => ['DEFAULT', ...activePriceGroups.map((group) => group.id)],
 [activePriceGroups]);
 const normalPriceGroupSelectValues = useMemo(
 () => ['DEFAULT', ...normalPriceGroups.map((group) => group.id)],
 [normalPriceGroups]);
 const assignableStaffValues = useMemo(
 () => ['NONE', ...assignableStaff.map((staff) => staff.id)],
 [assignableStaff]);

 const specialPriceGroup = useMemo(
 () => activePriceGroups.find((g) => g.payment_exempt || g.code === 'EJEN_KHAS_SYARIKAT') ?? null,
 [activePriceGroups]);

 function groupRateLabel(groupId?: string | null) {
 if (!groupId) return 'Default sistem';
 const group = activePriceGroups.find((g) => g.id === groupId);
 return group ? `${group.name}${group.payment_exempt ? ' - Tanpa bayaran' : ''}` : 'Default sistem';
 }

 function compactLogistics(value?: string | null) {
 const lines = (value ?? '').split(/\r?\n|;/).map((line) => line.trim()).filter(Boolean);
 if (!lines.length) return 'Belum ditetapkan';
 if (lines.length === 1) return lines[0];
 return `${lines.length} tugasan: ${lines.slice(0, 2).join(' | ')}${lines.length > 2 ? '...' : ''}`;
 }

 function lineItems(value?: string | null) {
 return (value ?? '').split(/\r?\n|;/).map((line) => line.trim()).filter(Boolean);
 }

 function hasLine(value: string, line: string) {
 return lineItems(value).some((item) => item.toLowerCase() === line.toLowerCase());
 }

 function toggleLine(value: string, line: string) {
 const items = lineItems(value);
 const exists = items.some((item) => item.toLowerCase() === line.toLowerCase());
 return exists
 ? items.filter((item) => item.toLowerCase() !== line.toLowerCase()).join('\n')
 : [...items, line].join('\n');
 }

 function driverLabel(driver: AdminAgentDriverOption) {
 return [driver.driver_code, driver.full_name, driver.route_description].filter(Boolean).join(' - ');
 }

 function branchLabel(branch: AdminBranchPickupOption) {
 return [branch.branch_code, branch.branch_name, branch.area].filter(Boolean).join(' - ');
 }

 function outletLabel(outlet: NonNullable<AdminSalesAgentAccount['outlets']>[number]) {
 return [outlet.outlet_code, outlet.outlet_name, outlet.city || outlet.state].filter(Boolean).join(' - ');
 }

 function staffLabel(staff: AgentSpecialAssignableStaff) {
 return [staff.full_name, staff.staff_code, staff.legal_entity?.code].filter(Boolean).join(' - ');
 }

 function selectedSpecialStaff(source: AdminAgentForm) {
 return source.staff_id ? assignableStaff.find((staff) => staff.id === source.staff_id) ?? null : null;
 }

 useEffect(() => {
 setForm((prev) => {
 if (!prev.assigned_price_group_id) return prev;
 return activePriceGroups.some((g) => g.id === prev.assigned_price_group_id)
 ? prev
 : {...prev, assigned_price_group_id: '' };
 });
 setEditForm((prev) => {
 if (!prev.assigned_price_group_id) return prev;
 return activePriceGroups.some((g) => g.id === prev.assigned_price_group_id)
 ? prev
 : {...prev, assigned_price_group_id: '' };
 });
 }, [activePriceGroups]);

 const formPriceGroup = activePriceGroups.find((g) => g.id === form.assigned_price_group_id) ?? null;
 const normalFormPriceGroupSelectValue = boundSelectValue(form.assigned_price_group_id || 'DEFAULT', normalPriceGroupSelectValues) ?? 'DEFAULT';
 const editPriceGroupSelectValue = boundSelectValue(editForm.assigned_price_group_id || 'DEFAULT', priceGroupSelectValues) ?? 'DEFAULT';
 const formStaffSelectValue = boundSelectValue(form.staff_id || 'NONE', assignableStaffValues) ?? 'NONE';
 const addingSpecialAgent = Boolean(formPriceGroup?.payment_exempt || formPriceGroup?.code === 'EJEN_KHAS_SYARIKAT');

 useEffect(() => {
 if (!addingSpecialAgent || !form.staff_id) return;
 const staff = selectedSpecialStaff(form);
 if (!staff) return;
 setForm((prev) => ({...prev,
 full_name: staff.full_name,
 contact_person: staff.full_name,
 company_name: prev.company_name || 'Ejen Khas - ' + staff.full_name,
 contact_email: prev.contact_email || prev.email,
 source_reference: prev.source_reference || 'Ejen Khas Syarikat - ' + (staff.legal_entity?.code ?? 'RKJ'),
 }));
 }, [addingSpecialAgent, form.staff_id, assignableStaff]);

 function formPayload(source: AdminAgentForm) {
 return {
 staff_id: source.staff_id || null,
 email: source.email.trim().toLowerCase(),
 password: source.password.trim() || undefined,
 full_name: source.full_name.trim(),
 company_name: source.company_name.trim(),
 registration_no: source.registration_no.trim() || null,
 contact_person: source.contact_person.trim() || source.full_name.trim(),
 contact_phone: source.contact_phone.trim() || null,
 contact_email: source.contact_email.trim().toLowerCase() || source.email.trim().toLowerCase(),
 business_address: source.business_address.trim() || null,
 assigned_price_group_id: source.assigned_price_group_id || null,
 assigned_driver_name: source.assigned_driver_name.trim() || null,
 pickup_location: source.pickup_location.trim() || null,
 source_reference: source.source_reference.trim() || null,
 };
 }

 function beginEdit(account: AdminSalesAgentAccount) {
 setEditingId(account.id);
 setEditForm({
 email: account.profile?.email ?? account.contact_email ?? '',
 password: '',
 full_name: account.profile?.full_name ?? account.contact_person ?? '',
 company_name: account.company_name,
 registration_no: account.registration_no ?? '',
 contact_person: account.contact_person ?? '',
 contact_phone: account.contact_phone ?? '',
 contact_email: account.contact_email ?? account.profile?.email ?? '',
 business_address: account.business_address ?? '',
 assigned_price_group_id: account.assigned_price_group_id ?? '',
 assigned_driver_name: account.assigned_driver_name ?? '',
 pickup_location: account.pickup_location ?? '',
 source_reference: account.source_reference ?? '',
 staff_id: '',
 });
 }

 async function addAgent() {
 if (addingSpecialAgent && !form.staff_id) {
 toast.error('Pilih staf RKJ Distributor atau Manufacturing untuk Ejen Khas');
 return;
 }
 if (!addingSpecialAgent && (!form.email || !form.full_name || !form.company_name)) {
 toast.error('Email, nama penuh dan nama syarikat wajib diisi');
 return;
 }
 setSaving(true);
 try {
 const payload = formPayload(form);
 if (addingSpecialAgent && !payload.company_name) {
 const staff = selectedSpecialStaff(form);
 payload.company_name = staff ? 'Ejen Khas - ' + staff.full_name : 'Ejen Khas Syarikat';
 }
 const res = await createAdminAgentAccount(payload);
 setLastLogin(res.login ?? null);
 toast.success(addingSpecialAgent ? 'Ejen Khas berjaya dipautkan kepada staf' : 'Ejen baharu berjaya ditambah');
 setForm(EMPTY_ADMIN_AGENT_FORM);
 await loadAdmin();
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal tambah ejen');
 } finally {
 setSaving(false);
 }
 }

 async function saveEdit(accountId: string) {
 if (!editForm.email || !editForm.full_name || !editForm.company_name) {
 toast.error('Email, nama penuh dan nama syarikat wajib diisi');
 return;
 }
 setSaving(true);
 try {
 await updateAdminAgentAccount({ account_id: accountId,...formPayload(editForm) });
 toast.success('Ejen dikemaskini');
 setEditingId(null);
 await loadAdmin();
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal kemas kini ejen');
 } finally {
 setSaving(false);
 }
 }

 async function suspendAgent(account: AdminSalesAgentAccount) {
 if (!confirm(`Delete ejen ${account.company_name} dari dashboard aktif? Rekod laporan syarikat akan kekal.`)) return;
 setSaving(true);
 try {
 await suspendAdminAgentAccount(account.id);
 toast.success('Ejen dikeluarkan dari dashboard aktif dan disimpan dalam laporan');
 await loadAdmin();
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal nonaktifkan ejen');
 } finally {
 setSaving(false);
 }
 }

 function currentSpecialAssignment(accountId: string) {
 return specialAssignments.find((assignment) => assignment.agent_account_id === accountId) ?? null;
 }

 function specialStaffSelectValue(accountId: string) {
 const pendingStaffId = specialStaffByAccount[accountId];
 if (pendingStaffId !== undefined) return pendingStaffId || 'NONE';
 return currentSpecialAssignment(accountId)?.staff_id ?? 'NONE';
 }

 async function autoLinkSpecialStaff(account: AdminSalesAgentAccount, staffId: string) {
 const nextStaffId = staffId === 'NONE' ? '' : staffId;
 if (!nextStaffId) return;
 const currentStaffId = currentSpecialAssignment(account.id)?.staff_id ?? null;
 if (currentStaffId === nextStaffId) return;

 setSpecialStaffByAccount((prev) => ({...prev, [account.id]: nextStaffId }));
 setSaving(true);
 try {
 await assignSpecialAgentStaff({
 agent_account_id: account.id,
 staff_id: nextStaffId,
 role_title: 'Ejen Khas Syarikat',
 assignment_note: 'Auto dipautkan apabila Pentadbir Utama memilih staf Ejen Khas',
 });
 const staff = assignableStaff.find((item) => item.id === nextStaffId);
 toast.success(`Dashboard Ejen Khas auto aktif${staff ? ` untuk ${staff.full_name}` : ''}`);
 setSpecialStaffByAccount((prev) => {
 const next = {...prev };
 delete next[account.id];
 return next;
 });
 await loadAdmin();
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal auto pautkan staf Ejen Khas');
 } finally {
 setSaving(false);
 }
 }

 async function endSpecialAssignment(assignment: AgentSpecialStaffAssignment) {
 setSaving(true);
 try {
 await endSpecialAgentAssignment(assignment.id);
 toast.success('Tugasan Agent Khas ditamatkan');
 await loadAdmin();
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal tamatkan tugasan');
 } finally {
 setSaving(false);
 }
 }
 const suspendedCount = reportEvents.filter((e) => e.event_type === 'ARCHIVED' || e.event_type === 'SUSPENDED').length;
 const normalAccounts = accounts.filter((a) => !a.price_group?.payment_exempt);
 const specialAccounts = accounts.filter((a) => a.price_group?.payment_exempt);
 const visibleAccounts =
 agentListFilter === 'NORMAL'
 ? normalAccounts
 : agentListFilter === 'SPECIAL'
 ? specialAccounts
 : accounts;

 return (
 <ModuleLayout>
 <ModuleHeader
 title={t('module.agent.title')}
 description={t('module.agent.adminDescription')}
 icon={Store}
 actions={
 <Button variant="outline" size="sm" onClick={() => void loadAdmin()} disabled={loading}>
 <RefreshCw className="mr-1 h-4 w-4" /> {t('common.refresh')}
 </Button>
 }
 />

 <WorkflowSopPanel workflow={workflow} />
 <OperationsWorkflowMap focus="agent" compact />

 <KpiGrid cols={4}>
 <KpiCard title={t('module.agent.totalAgents')} value={accounts.length} icon={Store} />
 <KpiCard title="Ejen Biasa" value={normalAccounts.length} icon={UserPlus} variant="success" />
 <KpiCard title="Ejen Khas" value={specialAccounts.length} icon={UserCheck} />
 <KpiCard title={t('module.agent.exitReports')} value={suspendedCount} icon={Trash2} variant={suspendedCount ? 'warning' : 'default'} />
 </KpiGrid>

 <datalist id="agent-driver-options">
 {drivers.map((driver) => (
 <option key={driver.id} value={driver.full_name}>
 {[driver.driver_code, driver.route_description, driver.phone].filter(Boolean).join(' - ')}
 </option>))}
 </datalist>

 {lastLogin && (
 <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
 <p className="font-semibold">Akaun ejen baharu siap dicipta</p>
 <p className="mt-1">Email: <span className="font-mono">{lastLogin.email}</span> - Password: <span className="font-mono">{lastLogin.password}</span></p>
 <p className="mt-1 text-xs">Password ini dipaparkan sekali sahaja. Simpan secara selamat dan minta ejen tukar selepas login.</p>
 </div>)}

 <SectionCard title={t('module.agent.addAgent')} description={t('module.agent.addAgentDesc')}>
 <div className="space-y-6">
 <div className="grid gap-3 lg:grid-cols-2">
 <Button
 type="button"
 variant={!addingSpecialAgent ? 'default' : 'outline'}
 className="h-auto justify-start px-4 py-3 text-left"
 onClick={() => setForm((p) => ({...p,
 assigned_price_group_id: p.assigned_price_group_id === specialPriceGroup?.id ? '' : p.assigned_price_group_id,
 staff_id: '',
 }))}
 >
 <UserPlus className="mr-3 h-5 w-5 shrink-0" />
 <span>
 <span className="block font-semibold">Ejen Biasa</span>
 <span className="block text-xs opacity-80">Ejen luar: login baru, group rate biasa, bayaran order dan subscription POS.</span>
 </span>
 </Button>
 <Button
 type="button"
 variant={addingSpecialAgent ? 'default' : 'outline'}
 className="h-auto justify-start px-4 py-3 text-left"
 onClick={() => {
 if (!specialPriceGroup?.id) {
 toast.error('Group rate Ejen Khas Syarikat belum tersedia');
 return;
 }
 setForm((p) => ({...p, assigned_price_group_id: specialPriceGroup.id }));
 }}
 >
 <UserCheck className="mr-3 h-5 w-5 shrink-0" />
 <span>
 <span className="block font-semibold">Ejen Khas Syarikat</span>
 <span className="block text-xs opacity-80">Staf dalaman: guna login sedia ada, tanpa bayaran, dashboard auto aktif.</span>
 </span>
 </Button>
 </div>

 <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
 <div className="space-y-4 rounded-lg border bg-background/70 p-4">
 <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
 <div>
 <p className="text-sm font-semibold">1. Akaun & Syarikat</p>
 <p className="text-xs text-muted-foreground">
 {addingSpecialAgent ? 'Pautkan tugasan kepada staf RKJ Distributor atau Manufacturing.' : 'Maklumat login dan profil rasmi ejen.'}
 </p>
 </div>
 <Badge variant={addingSpecialAgent ? 'default' : 'secondary'}>{addingSpecialAgent ? 'Ejen Khas' : 'Ejen Biasa'}</Badge>
 </div>

 {addingSpecialAgent ? (
 <div className="grid gap-3 md:grid-cols-2">
 <div className="space-y-1 md:col-span-2">
 <Label>Pilih Staf Ejen Khas</Label>
 <Select value={formStaffSelectValue} onValueChange={(value) => setForm((p) => ({...p, staff_id: value === 'NONE' ? '' : String(value) }))}>
 <SelectTrigger className="w-full"><SelectValue placeholder="Pilih staf RKJ Distributor / Manufacturing" /></SelectTrigger>
 <SelectContent>
 <SelectItem value="NONE">Pilih staf</SelectItem>
 {assignableStaff.map((staff) => (
 <SelectItem key={staff.id} value={staff.id}>{staffLabel(staff)}</SelectItem>))}
 </SelectContent>
 </Select>
 <p className="text-xs text-muted-foreground">Sistem guna akaun login staf sedia ada dan auto papar tugasan pada dashboard staf.</p>
 </div>
 <div className="space-y-1">
 <Label>Nama Syarikat / Tugasan</Label>
 <Input value={form.company_name} onChange={(e) => setForm((p) => ({...p, company_name: e.target.value }))} placeholder="Auto: Ejen Khas - nama staf" />
 </div>
 <div className="space-y-1">
 <Label>No. SSM / Rujukan</Label>
 <Input value={form.registration_no} onChange={(e) => setForm((p) => ({...p, registration_no: e.target.value }))} placeholder="Opsyenal" />
 </div>
 </div>) : (
 <div className="grid gap-3 md:grid-cols-2">
 <div className="space-y-1">
 <Label>Email Login</Label>
 <Input value={form.email} onChange={(e) => setForm((p) => ({...p, email: e.target.value }))} placeholder="ejen.nama@rkjdistributor.my" />
 </div>
 <div className="space-y-1">
 <Label>Password Awal</Label>
 <Input value={form.password} onChange={(e) => setForm((p) => ({...p, password: e.target.value }))} placeholder="Auto jana jika kosong" />
 <p className="text-xs text-muted-foreground">Biarkan kosong untuk password sementara rawak yang lebih selamat.</p>
 </div>
 <div className="space-y-1">
 <Label>Nama Penuh PIC</Label>
 <Input value={form.full_name} onChange={(e) => setForm((p) => ({...p, full_name: e.target.value }))} />
 </div>
 <div className="space-y-1">
 <Label>Nama Syarikat Ejen</Label>
 <Input value={form.company_name} onChange={(e) => setForm((p) => ({...p, company_name: e.target.value }))} />
 </div>
 <div className="space-y-1">
 <Label>No. SSM / Rujukan</Label>
 <Input value={form.registration_no} onChange={(e) => setForm((p) => ({...p, registration_no: e.target.value }))} />
 </div>
 <div className="space-y-1">
 <Label>Group Rate</Label>
 <Select value={normalFormPriceGroupSelectValue} onValueChange={(value) => setForm((p) => ({...p, assigned_price_group_id: value === 'DEFAULT' ? '' : String(value), staff_id: '' }))}>
 <SelectTrigger className="w-full"><SelectValue placeholder="Pilih group rate">{groupRateLabel(form.assigned_price_group_id)}</SelectValue></SelectTrigger>
 <SelectContent>
 <SelectItem value="DEFAULT">Default sistem</SelectItem>
 {normalPriceGroups.map((g) => <SelectItem key={g.id} value={g.id}>{groupRateLabel(g.id)}</SelectItem>)}
 </SelectContent>
 </Select>
 </div>
 </div>)}

 {addingSpecialAgent && (
 <div className="grid gap-3 md:grid-cols-2">
 <div className="space-y-1">
 <Label>Group Rate</Label>
 <div className="rounded-md border bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
 <p className="font-medium">{groupRateLabel(form.assigned_price_group_id)}</p>
 <p className="text-xs text-emerald-800">Tetap untuk Ejen Khas: order dan POS tanpa bayaran.</p>
 </div>
 </div>
 <div className="space-y-1">
 <Label>Email Contact</Label>
 <Input value={form.contact_email} onChange={(e) => setForm((p) => ({...p, contact_email: e.target.value }))} placeholder="Opsyenal" />
 </div>
 </div>)}

 <div className="grid gap-3 md:grid-cols-2">
 <div className="space-y-1">
 <Label>No. Telefon</Label>
 <Input value={form.contact_phone} onChange={(e) => setForm((p) => ({...p, contact_phone: e.target.value }))} />
 </div>
 {!addingSpecialAgent && (
 <div className="space-y-1">
 <Label>Email Contact</Label>
 <Input value={form.contact_email} onChange={(e) => setForm((p) => ({...p, contact_email: e.target.value }))} />
 </div>)}
 <div className="space-y-1 md:col-span-2">
 <Label>Alamat Perniagaan</Label>
 <Input value={form.business_address} onChange={(e) => setForm((p) => ({...p, business_address: e.target.value }))} placeholder="Alamat pejabat, kedai atau pickup utama" />
 </div>
 </div>
 </div>

 <div className="space-y-4 rounded-lg border bg-background/70 p-4">
 <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
 <div>
 <p className="text-sm font-semibold">2. Logistik & Pickup</p>
 <p className="text-xs text-muted-foreground">Pilih driver, cawangan cover atau isi pickup point manual.</p>
 </div>
 <div className="flex gap-2 text-xs text-muted-foreground">
 <Badge variant="outline">{lineItems(form.assigned_driver_name).length} driver</Badge>
 <Badge variant="outline">{lineItems(form.pickup_location).length} pickup</Badge>
 </div>
 </div>

 <div className="space-y-2">
 <Label>Driver / Area Bertugas</Label>
 <Textarea rows={3} value={form.assigned_driver_name} onChange={(e) => setForm((p) => ({...p, assigned_driver_name: e.target.value }))} placeholder="Pilih driver di bawah atau tambah catatan area manual" />
 <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/20 p-2">
 {drivers.length === 0 ? (
 <p className="text-xs text-muted-foreground">Tiada driver aktif didaftarkan dalam syarikat.</p>) : (
 <div className="grid gap-2 sm:grid-cols-2">
 {drivers.map((driver) => {
 const label = driverLabel(driver);
 const selected = hasLine(form.assigned_driver_name, label);
 return (
 <Button key={driver.id} type="button" size="sm" variant={selected ? 'default' : 'outline'} className="h-auto justify-start whitespace-normal py-2 text-left" onClick={() => setForm((p) => ({...p, assigned_driver_name: toggleLine(p.assigned_driver_name, label) }))}>
 {label}
 </Button>);
 })}
 </div>)}
 </div>
 </div>

 <div className="space-y-2">
 <Label>Tempat Pickup / Cawangan Cover</Label>
 <Textarea rows={3} value={form.pickup_location} onChange={(e) => setForm((p) => ({...p, pickup_location: e.target.value }))} placeholder="Jika ejen tidak langgan POS, isi sekurang-kurangnya 1 pickup point manual. Contoh: Kedai Agen ABC, Jalan Besar Teluk Intan" />
 <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/20 p-2">
 <div className="mb-2 flex items-center justify-between gap-2">
 <p className="text-xs font-medium text-muted-foreground">Cawangan syarikat</p>
 <span className="text-xs text-muted-foreground">{branches.length} tersedia</span>
 </div>
 <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
 {branches.map((branch) => {
 const label = branchLabel(branch);
 const selected = hasLine(form.pickup_location, label);
 return (
 <Button key={branch.id} type="button" size="sm" variant={selected ? 'default' : 'outline'} className="h-9 px-2" onClick={() => setForm((p) => ({...p, pickup_location: toggleLine(p.pickup_location, label) }))}>
 {branch.branch_code}
 </Button>);
 })}
 </div>
 </div>
 </div>

 <div className="space-y-1">
 <Label>Rujukan Tugasan / POS</Label>
 <Textarea rows={3} value={form.source_reference} onChange={(e) => setForm((p) => ({...p, source_reference: e.target.value }))} placeholder="Contoh: POS aktif 12 outlet, route Isnin/Rabu, PIC staf belum ditetapkan" />
 </div>
 </div>
 </div>

 <div className="flex flex-col gap-3 rounded-lg border bg-amber-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
 <div className="text-sm">
 <p className="font-semibold">Semak sebelum simpan</p>
 <p className="text-muted-foreground">
 {addingSpecialAgent ? 'Ejen Khas akan dipautkan terus kepada staf yang dipilih.' : 'Akaun login baharu akan dijana dan dipaparkan selepas berjaya.'}
 </p>
 </div>
 <PrimaryActionButton className="w-full sm:w-auto" onClick={addAgent} disabled={saving}>
 <Plus className="mr-2 h-4 w-4" /> {addingSpecialAgent ? 'Tambah Ejen Khas' : 'Tambah Ejen'}
 </PrimaryActionButton>
 </div>
 </div>
 </SectionCard>
 <SectionCard title="Staf Ejen Khas" description="Pilih staf RKJ Distributor atau Manufacturing sekali sahaja. Sistem akan auto-simpan, pautkan akaun Ejen Khas dan munculkan dashboard berkaitan pada staf tersebut.">
 {specialAccounts.length === 0 ? (
 <EmptyState title="Tiada Ejen Khas" description="Tambah Ejen Khas melalui borang di atas. Selepas staf dipilih, dashboard Ejen Khas akan aktif secara automatik untuk staf tersebut." />) : (
 <div className="space-y-3">
 {specialAccounts.map((account) => {
 const assigned = specialAssignments.filter((a) => a.agent_account_id === account.id);
 const activeAssignment = currentSpecialAssignment(account.id);
 const selectValue = boundSelectValue(specialStaffSelectValue(account.id), assignableStaffValues) ?? 'NONE';
 return (
 <div key={account.id} className="rounded-xl border bg-background p-4 text-sm shadow-sm">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <p className="font-semibold">{account.company_name}</p>
 <p className="text-xs text-muted-foreground">{account.price_group?.name ?? 'Ejen Khas Syarikat'} - tanpa bayaran</p>
 <p className="mt-1 text-xs text-muted-foreground">Driver/Area: {compactLogistics(account.assigned_driver_name)} | Pickup/Cawangan: {compactLogistics(account.pickup_location)} - POS aktif {account.stats.active_outlets}/{account.stats.outlets}</p>
 </div>
 <div className="flex min-w-[280px] flex-1 flex-wrap items-end gap-2 sm:justify-end">
 <div className="min-w-[240px] flex-1 space-y-1">
 <Label>Staf Ejen Khas (auto)</Label>
 <Select value={selectValue} onValueChange={(value) => void autoLinkSpecialStaff(account, String(value))} disabled={saving}>
 <SelectTrigger><SelectValue placeholder="Pilih staf" /></SelectTrigger>
 <SelectContent>
 <SelectItem value="NONE" disabled={Boolean(activeAssignment)}>Pilih staf</SelectItem>
 {assignableStaff.map((s) => (
 <SelectItem key={s.id} value={s.id}>{s.full_name} - {s.staff_code} - {s.legal_entity?.code}</SelectItem>))}
 </SelectContent>
 </Select>
 <p className="text-xs text-muted-foreground">
 {activeAssignment ? 'Dashboard Ejen Khas sudah aktif pada staf ini. Pilih staf lain untuk tukar automatik.' : 'Pilih staf untuk auto aktifkan dashboard Ejen Khas.'}
 </p>
 </div>
 <Button size="sm" variant={editingId === account.id ? 'default' : 'outline'} onClick={() => beginEdit(account)} disabled={saving}>
 <Pencil className="mr-1 h-3.5 w-3.5" /> {editingId === account.id ? 'Sedang Edit' : 'Edit Profil'}
 </Button>
 </div>
 </div>
 {assigned.length > 0 && (
 <div className="mt-3 flex flex-wrap gap-2">
 {assigned.map((assignment) => (
 <Badge key={assignment.id} variant="outline" className="gap-2 px-3 py-1.5">
 {assignment.staff?.full_name ?? 'Staf'} - {assignment.legal_entity?.code ?? 'Syarikat'}
 <button type="button" className="text-xs text-destructive" onClick={() => void endSpecialAssignment(assignment)} disabled={saving}>
 Tamat
 </button>
 </Badge>))}
 </div>)}
 {editingId === account.id && (
 <div className="mt-4 rounded-lg border bg-muted/20 p-4">
 <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
 <div>
 <p className="font-semibold">Edit Profil Ejen Khas</p>
 <p className="text-xs text-muted-foreground">Kemas kini maklumat tugasan, driver, pickup dan rujukan POS untuk ejen khas ini.</p>
 </div>
 <Badge variant="outline">{account.price_group?.name ?? 'Ejen Khas Syarikat'}</Badge>
 </div>
 <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
 <div className="space-y-1 md:col-span-2">
 <Label>Nama Syarikat / Tugasan</Label>
 <Input value={editForm.company_name} onChange={(e) => setEditForm((p) => ({...p, company_name: e.target.value }))} />
 </div>
 <div className="space-y-1">
 <Label>No. SSM / Rujukan</Label>
 <Input value={editForm.registration_no} onChange={(e) => setEditForm((p) => ({...p, registration_no: e.target.value }))} />
 </div>
 <div className="space-y-1">
 <Label>No. Telefon</Label>
 <Input value={editForm.contact_phone} onChange={(e) => setEditForm((p) => ({...p, contact_phone: e.target.value }))} />
 </div>
 <div className="space-y-1 md:col-span-2">
 <Label>Email Contact</Label>
 <Input value={editForm.contact_email} onChange={(e) => setEditForm((p) => ({...p, contact_email: e.target.value }))} />
 </div>
 <div className="space-y-1 md:col-span-2">
 <Label>Alamat Perniagaan</Label>
 <Input value={editForm.business_address} onChange={(e) => setEditForm((p) => ({...p, business_address: e.target.value }))} />
 </div>
 <div className="space-y-2 md:col-span-2">
 <Label>Driver / Area Bertugas</Label>
 <Textarea rows={3} value={editForm.assigned_driver_name} onChange={(e) => setEditForm((p) => ({...p, assigned_driver_name: e.target.value }))} />
 <div className="max-h-40 overflow-y-auto rounded-md border bg-background p-2">
 <div className="grid gap-2 sm:grid-cols-2">
 {drivers.map((driver) => {
 const label = driverLabel(driver);
 const selected = hasLine(editForm.assigned_driver_name, label);
 return (
 <Button key={driver.id} type="button" size="sm" variant={selected ? 'default' : 'outline'} className="h-auto justify-start whitespace-normal py-2 text-left" onClick={() => setEditForm((p) => ({...p, assigned_driver_name: toggleLine(p.assigned_driver_name, label) }))}>
 {label}
 </Button>);
 })}
 </div>
 </div>
 </div>
 <div className="space-y-2 md:col-span-2">
 <Label>Tempat Pickup / Cawangan Cover</Label>
 <Textarea rows={3} value={editForm.pickup_location} onChange={(e) => setEditForm((p) => ({...p, pickup_location: e.target.value }))} placeholder="Isi pickup point manual jika tiada cawangan POS" />
 <div className="max-h-40 overflow-y-auto rounded-md border bg-background p-2">
 <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
 {branches.map((branch) => {
 const label = branchLabel(branch);
 const selected = hasLine(editForm.pickup_location, label);
 return (
 <Button key={branch.id} type="button" size="sm" variant={selected ? 'default' : 'outline'} className="h-9 px-2" onClick={() => setEditForm((p) => ({...p, pickup_location: toggleLine(p.pickup_location, label) }))}>
 {branch.branch_code}
 </Button>);
 })}
 </div>
 </div>
 </div>
 <div className="space-y-1 md:col-span-2 xl:col-span-4">
 <Label>Rujukan Tugasan / POS</Label>
 <Textarea rows={3} value={editForm.source_reference} onChange={(e) => setEditForm((p) => ({...p, source_reference: e.target.value }))} />
 </div>
 <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-4">
 <Button size="sm" onClick={() => void saveEdit(account.id)} disabled={saving}>Simpan Profil Ejen Khas</Button>
 <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Batal</Button>
 </div>
 </div>
 </div>)}
 </div>);
 })}
 </div>)}
 </SectionCard>

 <SectionCard title="Laporan Keluar Masuk Ejen" description="Audit syarikat untuk ejen baharu, kemas kini, delete/archive dan tugasan Ejen Khas.">
 {reportEvents.length === 0 ? (
 <EmptyState title="Belum ada laporan" description="Aktiviti ejen akan dipaparkan di sini." />) : (
 <div className="space-y-2">
 {reportEvents.slice(0, 12).map((event) => (
 <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
 <div>
 <p className="font-medium">{event.company_name}</p>
 <p className="text-xs text-muted-foreground">{event.reason ?? event.price_group_name ?? '-'} - {new Date(event.created_at).toLocaleString('ms-MY')}</p>
 </div>
 <Badge variant={event.event_type === 'ARCHIVED' ? 'secondary' : 'outline'}>{event.event_type}</Badge>
 </div>))}
 </div>)}
 </SectionCard>
 <SectionCard title="Senarai Ejen Mengikut Jenis" description="Ejen Biasa dan Ejen Khas diasingkan supaya bayaran, dashboard staf dan SOP tidak bercampur.">
 {accounts.length > 0 && (
 <div className="mb-4 flex flex-wrap gap-2">
 <Button size="sm" variant={agentListFilter === 'ALL' ? 'default' : 'outline'} onClick={() => setAgentListFilter('ALL')}>
 Semua ({accounts.length})
 </Button>
 <Button size="sm" variant={agentListFilter === 'NORMAL' ? 'default' : 'outline'} onClick={() => setAgentListFilter('NORMAL')}>
 Ejen Biasa ({normalAccounts.length})
 </Button>
 <Button size="sm" variant={agentListFilter === 'SPECIAL' ? 'default' : 'outline'} onClick={() => setAgentListFilter('SPECIAL')}>
 Ejen Khas ({specialAccounts.length})
 </Button>
 </div>)}
 {loading ? (
 <p className="text-sm text-muted-foreground">Memuatkan senarai ejen...</p>) : accounts.length === 0 ? (
 <EmptyState title="Tiada ejen" description="Tambah ejen baharu menggunakan borang di atas." />) : (
 visibleAccounts.length === 0 ? (
 <EmptyState title="Tiada rekod dalam kategori ini" description="Tukar filter atau tambah ejen baharu mengikut jenis yang diperlukan." />) : (
 <div className="space-y-3">
 {visibleAccounts.map((account) => {
 const editing = editingId === account.id;
 const isSpecialAccount = Boolean(account.price_group?.payment_exempt);
 return (
 <div key={account.id} className="rounded-xl border bg-background p-4 text-sm shadow-sm">
 {!editing ? (
 <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_0.8fr_auto] lg:items-center">
 <div className="min-w-0">
 <div className="flex flex-wrap items-center gap-2">
 <p className="font-semibold text-foreground">{account.company_name}</p>
 <Badge variant={account.status === 'ACTIVE' ? 'default' : 'secondary'}>{account.status}</Badge>
 <Badge variant={isSpecialAccount ? 'outline' : 'secondary'}>{isSpecialAccount ? 'Ejen Khas' : 'Ejen Biasa'}</Badge>
 </div>
 <p className="mt-1 text-xs text-muted-foreground">{account.profile?.full_name ?? account.contact_person ?? '-'} - {account.profile?.email ?? account.contact_email ?? '-'}</p>
 <p className="mt-1 text-xs text-muted-foreground">{account.contact_phone ?? '-'} - {account.registration_no ?? 'Tiada SSM'}</p>
 <p className="mt-1 text-xs text-muted-foreground">Driver/Area: {compactLogistics(account.assigned_driver_name)} | Pickup/Cawangan: {compactLogistics(account.pickup_location)}</p>
 </div>
 <div>
 <p className="text-xs text-muted-foreground">{isSpecialAccount ? 'Jenis Akaun' : 'Group Rate'}</p>
 <p className="font-medium">{isSpecialAccount ? 'Staf dalaman - tanpa bayaran' : (account.price_group?.name ?? 'Default sistem')}</p>
 </div>
 <div className="grid grid-cols-3 gap-2 text-center text-xs">
 <div className="rounded-lg bg-muted/40 px-2 py-2"><p className="font-bold">{account.stats.orders}</p><p>Order</p></div>
 <div className="rounded-lg bg-muted/40 px-2 py-2"><p className="font-bold">{account.stats.active_outlets}/{account.stats.outlets}</p><p>POS</p></div>
 <div className="rounded-lg bg-muted/40 px-2 py-2"><p className="font-bold">{formatRM(account.stats.total_order_rm)}</p><p>Nilai</p></div>
 </div>
 <div className="flex flex-wrap gap-2 lg:justify-end">
 <Button size="sm" variant="outline" onClick={() => beginEdit(account)}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>
 <Button size="sm" variant="destructive" onClick={() => void suspendAgent(account)} disabled={saving || account.status === 'SUSPENDED'}><Trash2 className="mr-1 h-3.5 w-3.5" /> Delete</Button>
 </div>
 </div>) : (
 <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
 <div className="space-y-1"><Label>Email Login</Label><Input value={editForm.email} onChange={(e) => setEditForm((p) => ({...p, email: e.target.value }))} /></div>
 <div className="space-y-1"><Label>Nama Penuh PIC</Label><Input value={editForm.full_name} onChange={(e) => setEditForm((p) => ({...p, full_name: e.target.value }))} /></div>
 <div className="space-y-1"><Label>Nama Syarikat</Label><Input value={editForm.company_name} onChange={(e) => setEditForm((p) => ({...p, company_name: e.target.value }))} /></div>
 <div className="space-y-1">
 <Label>Group Rate</Label>
 <Select value={editPriceGroupSelectValue} onValueChange={(value) => setEditForm((p) => ({...p, assigned_price_group_id: value === 'DEFAULT' ? '' : String(value) }))}>
 <SelectTrigger><SelectValue>{groupRateLabel(editForm.assigned_price_group_id)}</SelectValue></SelectTrigger>
 <SelectContent>
 <SelectItem value="DEFAULT">Default sistem</SelectItem>
 {activePriceGroups.map((g) => <SelectItem key={g.id} value={g.id}>{groupRateLabel(g.id)}</SelectItem>)}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1"><Label>No. SSM / Rujukan</Label><Input value={editForm.registration_no} onChange={(e) => setEditForm((p) => ({...p, registration_no: e.target.value }))} /></div>
 <div className="space-y-1"><Label>No. Telefon</Label><Input value={editForm.contact_phone} onChange={(e) => setEditForm((p) => ({...p, contact_phone: e.target.value }))} /></div>
 <div className="space-y-1"><Label>Email Contact</Label><Input value={editForm.contact_email} onChange={(e) => setEditForm((p) => ({...p, contact_email: e.target.value }))} /></div>
 <div className="space-y-1"><Label>Driver / Area Bertugas</Label><Textarea rows={3} value={editForm.assigned_driver_name} onChange={(e) => setEditForm((p) => ({...p, assigned_driver_name: e.target.value }))} />
 <div className="mt-2 flex flex-wrap gap-2">
 {drivers.map((driver) => {
 const label = driverLabel(driver);
 const selected = hasLine(editForm.assigned_driver_name, label);
 return (
 <Button key={driver.id} type="button" size="sm" variant={selected ? 'default' : 'outline'} onClick={() => setEditForm((p) => ({...p, assigned_driver_name: toggleLine(p.assigned_driver_name, label) }))}>
 {label}
 </Button>);
 })}
 </div>
 </div>
 <div className="space-y-1"><Label>Tempat Pickup / Cawangan Cover</Label><Textarea rows={3} value={editForm.pickup_location} onChange={(e) => setEditForm((p) => ({...p, pickup_location: e.target.value }))} placeholder={"Jika tiada outlet POS, isi 1 pickup point manual"} />
 <div className="mt-2 max-h-40 overflow-y-auto rounded-md border bg-muted/20 p-2">
 <p className="mb-2 text-xs font-medium text-muted-foreground">Outlet/POS ejen ini</p>
 <div className="mb-3 flex flex-wrap gap-2">
 {account.outlets.length === 0 ? (
 <span className="text-xs text-muted-foreground">Tiada outlet POS. Isi pickup point manual di atas.</span>) : (
 account.outlets.map((outlet) => {
 const label = outletLabel(outlet);
 const selected = hasLine(editForm.pickup_location, label);
 return (
 <Button key={outlet.id} type="button" size="sm" variant={selected ? 'default' : 'outline'} onClick={() => setEditForm((p) => ({...p, pickup_location: toggleLine(p.pickup_location, label) }))}>
 {outlet.outlet_code}
 </Button>);
 }))}
 </div>
 <p className="mb-2 text-xs font-medium text-muted-foreground">Cawangan syarikat</p>
 <div className="flex flex-wrap gap-2">
 {branches.map((branch) => {
 const label = branchLabel(branch);
 const selected = hasLine(editForm.pickup_location, label);
 return (
 <Button key={branch.id} type="button" size="sm" variant={selected ? 'default' : 'outline'} onClick={() => setEditForm((p) => ({...p, pickup_location: toggleLine(p.pickup_location, label) }))}>
 {branch.branch_code}
 </Button>);
 })}
 </div>
 </div>
 </div>
 <div className="space-y-1 md:col-span-2"><Label>Rujukan Tugasan / POS</Label><Textarea rows={3} value={editForm.source_reference} onChange={(e) => setEditForm((p) => ({...p, source_reference: e.target.value }))} /></div>
 <div className="space-y-1 md:col-span-2"><Label>Alamat Perniagaan</Label><Input value={editForm.business_address} onChange={(e) => setEditForm((p) => ({...p, business_address: e.target.value }))} /></div>
 <div className="flex items-end gap-2">
 <Button size="sm" onClick={() => void saveEdit(account.id)} disabled={saving}>Simpan</Button>
 <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Batal</Button>
 </div>
 </div>)}
 </div>);
 })}
 </div>))}
 </SectionCard>
 </ModuleLayout>);
}












