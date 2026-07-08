'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { History, BarChart3, LayoutDashboard, Trash2, ClipboardCheck, ShieldAlert, Eye, TimerReset } from 'lucide-react';
import {
 fetchProducts,
 fetchShift,
 fetchTransactions,
 fetchDailySummary,
 fetchBranches,
 fetchStockAvailability,
 fetchExpiredStock,
 fetchPosStockSop,
 fetchShiftMembers,
 submitPosPresenceCheck,
 syncOfflineSales,
} from '@/lib/pos/api';
import {
 getOfflineQueue,
 removeOfflineSale,
} from '@/lib/pos/offline-queue';
import { formatRM } from '@/lib/pos/utils';
import { usePosStore } from '@/stores/pos-store';
import { useAuthStore } from '@/stores/auth-store';
import type { PosShiftStockCheckType, PosSopStatus, SaleResult } from '@/lib/pos/types';
import { PageHeader } from '@/components/brand/page-header';
import { ShiftBar } from '@/components/pos/shift-bar';
import { OpenShiftDialog } from '@/components/pos/open-shift-dialog';
import { CloseShiftDialog } from '@/components/pos/close-shift-dialog';
import { ProductGrid } from '@/components/pos/product-grid';
import { CartPanel } from '@/components/pos/cart-panel';
import { PaymentDialog } from '@/components/pos/payment-dialog';
import { ReceiptDialog } from '@/components/pos/receipt-dialog';
import { TransactionHistory } from '@/components/pos/transaction-history';
import { DailySummaryPanel } from '@/components/pos/daily-summary-panel';
import { BranchSelector } from '@/components/pos/branch-selector';
import { RejectStockPanel } from '@/components/pos/reject-stock-panel';
import { PosStockSopPanel } from '@/components/pos/pos-stock-sop-panel';
import { LiveCounterGuard } from '@/components/pos/live-counter-guard';
import {
 ExpiredStockAlert,
 type ExpiredRejectPrefill,
} from '@/components/pos/expired-stock-alert';
import type { RotiExpirySummary } from '@/lib/stock/expiry';
import { needsBranchPicker } from '@/lib/auth/branch-scope';
import { canUsePosRejectStock } from '@/lib/auth/stock-access';
import { canViewFullPosHistory } from '@/lib/pos/access';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/components/i18n/language-provider';

function envMinutes(value: string | undefined, fallback: number) {
 const parsed = Number(value);
 return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const POS_IDLE_PRESENCE_MS = envMinutes(process.env.NEXT_PUBLIC_POS_IDLE_PRESENCE_MINUTES, 15) * 60 * 1000;
const POS_PRESENCE_RESPONSE_MS = envMinutes(process.env.NEXT_PUBLIC_POS_PRESENCE_RESPONSE_MINUTES, 2) * 60 * 1000;

export function PosTerminal() {
 const { t } = useLanguage();
 const profile = useAuthStore((s) => s.profile);
 const authBranch = useAuthStore((s) => s.branch);

 const branchId = usePosStore((s) => s.branchId);
 const setBranchId = usePosStore((s) => s.setBranchId);
 const setProducts = usePosStore((s) => s.setProducts);
 const setStockByProduct = usePosStore((s) => s.setStockByProduct);
 const setMenuStockByCategory = usePosStore((s) => s.setMenuStockByCategory);
 const setSupplementStock = usePosStore((s) => s.setSupplementStock);
 const setShift = usePosStore((s) => s.setShift);
 const setTransactions = usePosStore((s) => s.setTransactions);
 const setDailySummary = usePosStore((s) => s.setDailySummary);
 const dailySummary = usePosStore((s) => s.dailySummary);
 const setOnline = usePosStore((s) => s.setOnline);
 const setOfflineCount = usePosStore((s) => s.setOfflineCount);
 const isLoading = usePosStore((s) => s.isLoading);
 const setLoading = usePosStore((s) => s.setLoading);
 const lastReceipt = usePosStore((s) => s.lastReceipt);
 const setLastReceipt = usePosStore((s) => s.setLastReceipt);
 const cart = usePosStore((s) => s.cart);
 const shift = usePosStore((s) => s.shift);

 const [branches, setBranches] = useState<
 Array<{ id: string; branch_code: string; branch_name: string }>
 >([]);
 const [openShiftOpen, setOpenShiftOpen] = useState(false);
 const [closeShiftOpen, setCloseShiftOpen] = useState(false);
 const [paymentOpen, setPaymentOpen] = useState(false);
 const [receiptOpen, setReceiptOpen] = useState(false);
 const [activeTab, setActiveTab] = useState('sale');
 const [expirySummary, setExpirySummary] = useState<RotiExpirySummary | null>(null);
 const [rejectPrefill, setRejectPrefill] = useState<ExpiredRejectPrefill[] | undefined>();
 const [pendingDeliveryCount, setPendingDeliveryCount] = useState(0);
 const [requiredStockCheck, setRequiredStockCheck] = useState<PosShiftStockCheckType | null>(null);
 const [dismissedStockPrompt, setDismissedStockPrompt] = useState<PosShiftStockCheckType | null>(null);
 const [activePresenceLeave, setActivePresenceLeave] = useState<PosSopStatus['active_leave']>(null);
 const [sopSalesBlocked, setSopSalesBlocked] = useState(false);
 const [lastPosActivityAt, setLastPosActivityAt] = useState(() => Date.now());
 const [presencePrompt, setPresencePrompt] = useState<{ promptedAt: string; dueAt: number } | null>(null);
 const [presenceSaving, setPresenceSaving] = useState(false);
 const [shiftMemberStats, setShiftMemberStats] = useState({ active: 0, pending: 0 });
 const lastPosActivityRef = useRef(lastPosActivityAt);
 const presencePromptRef = useRef(presencePrompt);

 const branchName =
 branches.find((b) => b.id === branchId)?.branch_name ??
 authBranch?.branch_name;

 const branchCode =
 branches.find((b) => b.id === branchId)?.branch_code ??
 authBranch?.branch_code;

 const branchLabel =
 branchName && branchCode
 ? `${branchCode} - ${branchName}`
 : branchName ?? branchCode;

 const showBranchPicker = profile ? needsBranchPicker(profile) : false;
 const showRejectTab = profile ? canUsePosRejectStock(profile.role) : false;
 const canViewFullHistory = canViewFullPosHistory(profile?.role);
 const canBypassPosSop = profile?.role === 'SUPER_ADMIN';
 const shiftRequired = !shift;
 const blockingStockCheck = requiredStockCheck === 'OPENING';
 const advisoryStockCheck =
 requiredStockCheck === 'MID_SHIFT' || requiredStockCheck === 'CLOSE_SHIFT'
 ? requiredStockCheck
 : null;
 const blockingSopStatus = Boolean(sopSalesBlocked && blockingStockCheck);
 const sopWouldBlockSales =
 shiftRequired || blockingSopStatus || pendingDeliveryCount > 0 || blockingStockCheck || Boolean(activePresenceLeave);
 const salesBlocked = !canBypassPosSop && sopWouldBlockSales;
 const shouldRunPresenceCheck =
 profile?.role === 'STAFF' &&
 Boolean(branchId && shift?.id) &&
 activeTab === 'sale' &&
 !paymentOpen &&
 !receiptOpen &&
 !activePresenceLeave &&
 !salesBlocked;
 const showAdminTestingNotice = canBypassPosSop && sopWouldBlockSales;
 const showStockPrompt = Boolean(advisoryStockCheck && dismissedStockPrompt !== advisoryStockCheck);
 const sopBadgeCount =
 (shiftRequired ? 1 : 0) +
 pendingDeliveryCount +
 (requiredStockCheck ? 1 : 0) +
 (activePresenceLeave ? 1 : 0);
 const requiredStockLabel =
 requiredStockCheck === 'OPENING'
 ? 'kiraan stok sebelum jualan'
 : requiredStockCheck === 'MID_SHIFT'
 ? 'kiraan stok pertengahan syif'
 : requiredStockCheck === 'CLOSE_SHIFT'
 ? 'kiraan stok tutup syif'
 : null;

 const loadData = useCallback(async () => {
 if (!branchId) return;
 setLoading(true);
 try {
 const [productsRes, stockRes, shiftRes, summaryRes, expiryRes, stockSopRes] =
 await Promise.allSettled([
 fetchProducts(branchId),
 fetchStockAvailability(branchId),
 fetchShift(branchId),
 fetchDailySummary(branchId),
 fetchExpiredStock(branchId),
 fetchPosStockSop(branchId),
 ]);

 if (productsRes.status === 'fulfilled') {
 setProducts(productsRes.value.products, productsRes.value.categories);
 } else {
 toast.error('Gagal memuatkan senarai produk');
 }

 if (stockRes.status === 'fulfilled') {
 setStockByProduct(stockRes.value.availability ?? {});
 setMenuStockByCategory(stockRes.value.menuBalances ?? {});
 setSupplementStock(stockRes.value.supplementBalances ?? []);
 } else {
 setStockByProduct({});
 setMenuStockByCategory({});
 setSupplementStock([]);
 toast.error('Gagal memuatkan stok - jualan mungkin terhad');
 }

 if (shiftRes.status === 'fulfilled') {
 setShift(shiftRes.value.shift);
 }
 if (summaryRes.status === 'fulfilled') {
 setDailySummary(summaryRes.value.summary);
 }

 if (expiryRes.status === 'fulfilled') {
 setExpirySummary(expiryRes.value.summary);
 } else {
 setExpirySummary(null);
 }

 if (stockSopRes.status === 'fulfilled') {
 setPendingDeliveryCount(stockSopRes.value.pendingDeliveryCount ?? 0);
 setRequiredStockCheck(stockSopRes.value.sopStatus?.required_stock_check ?? null);
 setActivePresenceLeave(stockSopRes.value.sopStatus?.active_leave ?? null);
 setSopSalesBlocked(Boolean(stockSopRes.value.sopStatus?.sales_blocked));
 } else {
 setPendingDeliveryCount(0);
 setRequiredStockCheck(null);
 setActivePresenceLeave(null);
 setSopSalesBlocked(false);
 }
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan data POS');
 } finally {
 setLoading(false);
 }
 }, [
 branchId,
 setProducts,
 setStockByProduct,
 setMenuStockByCategory,
 setSupplementStock,
 setShift,
 setDailySummary,
 setLoading,
 ]);

 const loadShiftMemberStats = useCallback(async () => {
 if (!branchId || !shift?.id) {
 setShiftMemberStats({ active: 0, pending: 0 });
 return;
 }

 try {
 const res = await fetchShiftMembers(branchId, shift.id);
 const members = res.members ?? [];
 setShiftMemberStats({
 active: members.filter((member) => member.status === 'ACTIVE').length,
 pending: members.filter((member) => member.status === 'PENDING_APPROVAL').length,
 });
 } catch {
 setShiftMemberStats({ active: 0, pending: 0 });
 }
 }, [branchId, shift?.id]);

 const loadTransactions = useCallback(async () => {
 if (!branchId) {
 setTransactions([]);
 return;
 }

 try {
 const txRes = await fetchTransactions(branchId);
 setTransactions(txRes.transactions);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan sejarah transaksi');
 setTransactions([]);
 }
 }, [branchId, setTransactions]);

 const refreshHistory = useCallback(() => {
 void loadTransactions();
 void loadData();
 }, [loadData, loadTransactions]);

 const markPosActivity = useCallback((force = false) => {
 const now = Date.now();
 if (!force && now - lastPosActivityRef.current < 30_000) return;
 lastPosActivityRef.current = now;
 setLastPosActivityAt(now);
 }, []);

 const syncOffline = useCallback(async () => {
 const queue = getOfflineQueue();
 if (!queue.length || !navigator.onLine) return;

 try {
 const { synced, failed } = await syncOfflineSales(queue);
 synced.forEach((id) => removeOfflineSale(id));
 setOfflineCount(getOfflineQueue().length);
 if (synced.length) {
 toast.success(`${synced.length} jualan luar talian disegerakkan`);
 await loadData();
 }
 if (failed.length) {
 toast.error(`${failed.length} jualan gagal disegerakkan`);
 }
 } catch {
 // Silent fail - will retry
 }
 }, [loadData, setOfflineCount]);

 useEffect(() => {
 if (profile?.branch_id) {
 setBranchId(profile.branch_id);
 }
 fetchBranches().then(({ branches: b }) => setBranches(b)).catch(() => toast.error('Gagal memuatkan senarai cawangan'));
 }, [profile?.branch_id, setBranchId]);

 useEffect(() => {
 if (showBranchPicker && branches.length && !branchId) {
 setBranchId(branches[0].id);
 }
 }, [showBranchPicker, branches, branchId, setBranchId]);

 useEffect(() => {
 setTransactions([]);
 if (branchId) loadData();
 }, [branchId, loadData, setTransactions]);

 useEffect(() => {
 if (activeTab === 'history') {
 void loadTransactions();
 }
 }, [activeTab, loadTransactions]);

 useEffect(() => {
 void loadShiftMemberStats();
 }, [loadShiftMemberStats]);

 useEffect(() => {
 if (!dismissedStockPrompt) return;
 if (dismissedStockPrompt !== requiredStockCheck) {
 setDismissedStockPrompt(null);
 }
 }, [dismissedStockPrompt, requiredStockCheck]);

 useEffect(() => {
 presencePromptRef.current = presencePrompt;
 }, [presencePrompt]);

 useEffect(() => {
 const activityEvents = ['mousemove', 'keydown', 'click', 'touchstart'] as const;
 const onActivity = () => {
 if (!presencePromptRef.current) markPosActivity();
 };

 activityEvents.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
 return () => {
 activityEvents.forEach((eventName) => window.removeEventListener(eventName, onActivity));
 };
 }, [markPosActivity]);

 useEffect(() => {
 if (!shouldRunPresenceCheck) {
 setPresencePrompt(null);
 return;
 }

 const intervalId = window.setInterval(() => {
 if (presencePromptRef.current) return;
 if (Date.now() - lastPosActivityRef.current < POS_IDLE_PRESENCE_MS) return;

 const now = Date.now();
 const promptedAt = new Date(now).toISOString();
 setPresencePrompt({
 promptedAt,
 dueAt: now + POS_PRESENCE_RESPONSE_MS,
 });
 toast.info('AI Presence Check: sila sahkan staf berada di depan POS.');
 }, 15_000);

 return () => window.clearInterval(intervalId);
 }, [shouldRunPresenceCheck]);

 useEffect(() => {
 if (!presencePrompt || !branchId || !shift?.id) return;

 const timeoutMs = Math.max(0, presencePrompt.dueAt - Date.now());
 const timeoutId = window.setTimeout(async () => {
 const activePrompt = presencePromptRef.current;
 if (!activePrompt || !branchId || !shift?.id) return;

 presencePromptRef.current = null;
 setPresencePrompt(null);
 markPosActivity(true);

 try {
 await submitPosPresenceCheck({
 branch_id: branchId,
 shift_id: shift.id,
 status: 'MISSED',
 prompt_reason: 'IDLE_POS',
 prompted_at: activePrompt.promptedAt,
 notes: 'Staf tidak sahkan presence check dalam masa yang ditetapkan.',
 });
 toast.warning('Presence check tidak dijawab. Rekod dihantar untuk semakan AM/OM.');
 await loadData();
 } catch {
 toast.error('Gagal rekod AI Presence Check. Sistem akan cuba semula pada semakan seterusnya.');
 }
 }, timeoutMs);

 return () => window.clearTimeout(timeoutId);
 }, [branchId, loadData, markPosActivity, presencePrompt, shift?.id]);

 useEffect(() => {
 setOnline(navigator.onLine);
 setOfflineCount(getOfflineQueue().length);

 const goOnline = () => {
 setOnline(true);
 syncOffline();
 };
 const goOffline = () => setOnline(false);

 window.addEventListener('online', goOnline);
 window.addEventListener('offline', goOffline);
 return () => {
 window.removeEventListener('online', goOnline);
 window.removeEventListener('offline', goOffline);
 };
 }, [setOnline, setOfflineCount, syncOffline]);

 useEffect(() => {
 function onKeyDown(e: KeyboardEvent) {
 if (activeTab !== 'sale' || paymentOpen || receiptOpen) return;
 const tag = (e.target as HTMLElement)?.tagName;
 if (tag === 'INPUT' || tag === 'TEXTAREA') return;

 if (e.key === 'F2' && shift && cart.length > 0 && !salesBlocked) {
 e.preventDefault();
 setPaymentOpen(true);
 }
 }
 window.addEventListener('keydown', onKeyDown);
 return () => window.removeEventListener('keydown', onKeyDown);
 }, [activeTab, paymentOpen, receiptOpen, shift, cart.length, salesBlocked]);

 async function handlePresenceConfirm() {
 if (!branchId || !shift?.id || !presencePrompt) return;

 setPresenceSaving(true);
 try {
 await submitPosPresenceCheck({
 branch_id: branchId,
 shift_id: shift.id,
 status: 'CONFIRMED',
 prompt_reason: 'IDLE_POS',
 prompted_at: presencePrompt.promptedAt,
 notes: 'Staf sahkan berada di depan POS ketika tiada customer.',
 });
 toast.success('AI Presence Check disahkan.');
 presencePromptRef.current = null;
 setPresencePrompt(null);
 markPosActivity(true);
 await loadData();
 await loadShiftMemberStats();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal sahkan AI Presence Check');
 } finally {
 setPresenceSaving(false);
 }
 }

 function handlePaymentSuccess(receipt: SaleResult) {
 markPosActivity(true);
 setLastReceipt(receipt);
 setReceiptOpen(true);
 loadData();
 }

 function handleRejectExpired(prefill: ExpiredRejectPrefill[]) {
 setRejectPrefill(prefill);
 setActiveTab('reject');
 }

 function handleRejectSuccess() {
 setRejectPrefill(undefined);
 loadData();
 }

 function handleSopSuccess(event?: { action?: string; requiresManagerApproval?: boolean }) {
 setDismissedStockPrompt(null);
 if (event?.action === 'stock_check') {
 markPosActivity(true);
 setActiveTab('sale');
 if (event.requiresManagerApproval) {
 toast.info('Kiraan stok dihantar kepada AM/OM. Jualan boleh diteruskan sementara menunggu kelulusan stok rasmi.');
 }
 }
 loadData();
 loadShiftMemberStats();
 }

 function handleOpenShiftSuccess() {
 markPosActivity(true);
 setDismissedStockPrompt(null);
 setRequiredStockCheck('OPENING');
 setActiveTab('sop');
 loadData();
 loadShiftMemberStats();
 }

 if (!profile) {
 return (
 <div className="space-y-4">
 <Skeleton className="h-24 w-full rounded-2xl" />
 <Skeleton className="h-12 w-full" />
 <div className="grid flex-1 gap-4 lg:grid-cols-3">
 <Skeleton className="lg:col-span-2 h-96" />
 <Skeleton className="h-96" />
 </div>
 </div>);
 }

 if (showBranchPicker && !branchId) {
 return (
 <div className="space-y-4">
 <PageHeader
 title={t('module.pos.selectBranchTitle')}
 description={t('module.pos.selectBranchDesc')}
 />
 <BranchSelector
 branches={branches}
 value={branchId ?? ''}
 onChange={setBranchId}
 />
 </div>);
 }

 return (
 <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <PageHeader
 badge="Kaunter Tunai"
 title={t('module.pos.title')}
 description={t('module.pos.description')}
 className="flex-1 min-w-[280px]"
 />
 <div className="flex flex-wrap items-center gap-2">
 {dailySummary && (
 <Badge variant="secondary" className="px-3 py-1.5 text-sm tabular-nums">
 {t('module.pos.todaySales')}: {formatRM(Number(dailySummary.total_sales))}
 </Badge>)}
 <Link
 href="/dashboard"
 className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
 >
 <LayoutDashboard className="h-4 w-4" />
 {t('module.pos.dashboard')}
 </Link>
 {showBranchPicker && (
 <BranchSelector
 branches={branches}
 value={branchId ?? ''}
 onChange={setBranchId}
 />)}
 </div>
 </div>

 <ShiftBar
 branchName={branchLabel}
 onOpenShift={() => setOpenShiftOpen(true)}
 onCloseShift={() => setCloseShiftOpen(true)}
 />

 <ExpiredStockAlert
 summary={expirySummary}
 canReject={showRejectTab}
 onRejectExpired={handleRejectExpired}
 />

 {isLoading ? (
 <div className="grid flex-1 gap-4 lg:grid-cols-3">
 <Skeleton className="lg:col-span-2 h-full" />
 <Skeleton className="h-full" />
 </div>) : (
 <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col">
 <TabsList>
 <TabsTrigger value="sale">{t('module.pos.sale')}</TabsTrigger>
 <TabsTrigger value="sop" className="gap-1">
 <ClipboardCheck className="h-4 w-4" />
 {t('module.pos.stockSop')}
 {sopBadgeCount > 0 && (
 <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-[10px]">
 {sopBadgeCount}
 </Badge>)}
 </TabsTrigger>
 <TabsTrigger value="history" className="gap-1">
 <History className="h-4 w-4" />
 {t('common.history')}
 </TabsTrigger>
 <TabsTrigger value="summary" className="gap-1">
 <BarChart3 className="h-4 w-4" />
 {t('common.summary')}
 </TabsTrigger>
 {showRejectTab && (
 <TabsTrigger value="reject" className="gap-1">
 <Trash2 className="h-4 w-4" />
 {t('module.pos.rejectStock')}
 </TabsTrigger>)}
 </TabsList>

 <TabsContent value="sale" className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
 <LiveCounterGuard
 shift={shift}
 branchLabel={branchLabel}
 activeStaffCount={shiftMemberStats.active}
 pendingStaffCount={shiftMemberStats.pending}
 activePresenceLeave={activePresenceLeave}
 pendingDeliveryCount={pendingDeliveryCount}
 requiredStockCheck={requiredStockCheck}
 presencePromptActive={Boolean(presencePrompt)}
 presenceSaving={presenceSaving}
 lastActivityAt={lastPosActivityAt}
 canBypassPosSop={canBypassPosSop}
 onConfirmPresence={handlePresenceConfirm}
 onOpenSop={() => setActiveTab('sop')}
 onOpenShift={() => setOpenShiftOpen(true)}
 />
 {salesBlocked ? (
 <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-6 text-red-950">
 <div className="max-w-xl text-center">
 <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
 <ShieldAlert className="h-7 w-7" />
 </div>
 <h3 className="text-xl font-bold">
 {shiftRequired
 ? t('module.pos.openShiftFirst')
 : activePresenceLeave
 ? t('module.pos.staffAway')
 : pendingDeliveryCount > 0
 ? t('module.pos.confirmDriverStock')
 : blockingStockCheck && requiredStockLabel
 ? `Selesaikan ${requiredStockLabel}`
 : t('module.pos.completePosTask')}
 </h3>
 <p className="mt-2 text-sm text-red-900/80">
 {shiftRequired
 ? t('module.pos.openShiftHelp')
 : activePresenceLeave
 ? t('module.pos.staffAwayHelp')
 : pendingDeliveryCount > 0
 ? `Ada ${pendingDeliveryCount} penerimaan stok yang belum staf sahkan. Jika driver hantar semasa kedai tutup, staf syif pertama wajib sahkan kuantiti sebenar dahulu, kemudian buat kiraan stok pembukaan sebelum jualan bermula.`
 : blockingStockCheck && requiredStockLabel
 ? `POS wajibkan ${requiredStockLabel} mengikut production date sebelum jualan boleh diteruskan.`
 : 'Selesaikan tugasan POS yang ditandakan sebelum jualan boleh diteruskan.'}
 </p>
 <Button className="mt-4" onClick={() => shiftRequired ? setOpenShiftOpen(true) : setActiveTab('sop')}>
 {shiftRequired ? t('module.pos.openShift') : t('module.pos.completeTask')}
 </Button>
 </div>
 </div>) : (
 <div className="flex min-h-0 flex-1 flex-col gap-3">
 {presencePrompt && (
 <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-950 shadow-sm">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div className="flex gap-3">
 <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
 <Eye className="h-5 w-5" />
 </div>
 <div>
 <p className="font-bold">{t('module.pos.aiPresenceTitle')}</p>
 <p className="mt-1 text-sm opacity-85">
 {t('module.pos.aiPresenceDesc')}
 </p>
 </div>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button
 type="button"
 className="bg-violet-700 hover:bg-violet-800"
 onClick={handlePresenceConfirm}
 disabled={presenceSaving}
 >
 <TimerReset className="mr-2 h-4 w-4" />
 {presenceSaving ? 'Mengesahkan...' : t('module.pos.iAmAtPos')}
 </Button>
 <Button
 type="button"
 variant="outline"
 className="bg-white/80"
 onClick={() => setActiveTab('sop')}
 >
 {t('module.pos.recordLeave')}
 </Button>
 </div>
 </div>
 </div>)}
 {showAdminTestingNotice && (
 <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950 shadow-sm">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <p className="font-bold">Mode testing Pentadbir Utama</p>
 <p className="mt-1 text-sm opacity-85">
 {shiftRequired
 ? 'SOP sebenar: buka syif POS dahulu sebelum jualan. Untuk testing, sistem hanya maklumkan dan tidak mengunci skrin admin.'
 : activePresenceLeave
 ? 'SOP sebenar: rekod staf kembali ke kiosk dahulu. Pentadbir Utama boleh terus semak atau test aliran.'
 : pendingDeliveryCount > 0
 ? `SOP sebenar: sahkan ${pendingDeliveryCount} penerimaan stok driver dahulu. Pentadbir Utama boleh teruskan testing tanpa sekatan.`
 : blockingStockCheck && requiredStockLabel
 ? `SOP sebenar: selesaikan ${requiredStockLabel} dahulu. Pentadbir Utama boleh teruskan testing tanpa sekatan.`
 : 'Ada SOP yang belum selesai, tetapi Pentadbir Utama dibenarkan teruskan testing.'}
 </p>
 </div>
 <Button
 type="button"
 variant="outline"
 className="bg-white/80"
 onClick={() => shiftRequired ? setOpenShiftOpen(true) : setActiveTab('sop')}
 >
 {shiftRequired ? 'Buka syif' : 'Semak SOP'}
 </Button>
 </div>
 </div>)}
 {showStockPrompt && advisoryStockCheck && (
 <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <p className="font-bold">
 {t('module.pos.stockReminderTitle')} {advisoryStockCheck === 'MID_SHIFT' ? 'pertengahan syif' : 'tutup syif'}
 </p>
 <p className="mt-1 text-sm opacity-85">
 Jualan masih boleh diteruskan supaya customer tidak menunggu. Bila ruang sesuai, kira Roti Kaya, Roti Kelapa, Roti Kacang, Roti Benggali, Kaya dan Butter mengikut production date.
 </p>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button
 type="button"
 className="bg-amber-600 hover:bg-amber-700"
 onClick={() => {
 setDismissedStockPrompt(null);
 setActiveTab('sop');
 }}
 >
 {t('module.pos.countNow')}
 </Button>
 <Button
 type="button"
 variant="outline"
 className="bg-white/80"
 onClick={() => setDismissedStockPrompt(advisoryStockCheck)}
 >
 {t('module.pos.serveCustomerFirst')}
 </Button>
 </div>
 </div>
 </div>)}
 <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
 <div className="flex min-h-0 flex-col overflow-hidden lg:col-span-2">
 <ProductGrid />
 </div>
 <div className="flex min-h-0 flex-col overflow-hidden">
 <CartPanel onCheckout={() => setPaymentOpen(true)} />
 </div>
 </div>
 </div>)}
 </TabsContent>

 {branchId && (
 <TabsContent value="sop" className="mt-4 overflow-y-auto pr-1">
 <PosStockSopPanel
 branchId={branchId}
 onSuccess={handleSopSuccess}
 onOpenRejectStock={showRejectTab ? () => setActiveTab('reject') : undefined}
 />
 </TabsContent>)}

 <TabsContent value="history" className="mt-4">
 <TransactionHistory onRefresh={refreshHistory} canViewFullHistory={canViewFullHistory} />
 </TabsContent>

 <TabsContent value="summary" className="mt-4">
 <DailySummaryPanel />
 </TabsContent>

 {showRejectTab && branchId && (
 <TabsContent value="reject" className="mt-4">
 <RejectStockPanel
 key={rejectPrefill?.map((p) => `${p.stock_item_id}:${p.quantity}`).join('|') ?? 'empty'}
 branchId={branchId}
 prefill={rejectPrefill}
 onSuccess={handleRejectSuccess}
 />
 </TabsContent>)}
 </Tabs>)}

 {branchId && (
 <>
 <OpenShiftDialog
 open={openShiftOpen}
 onOpenChange={setOpenShiftOpen}
 branchId={branchId}
 onSuccess={handleOpenShiftSuccess}
 />
 <CloseShiftDialog
 open={closeShiftOpen}
 onOpenChange={setCloseShiftOpen}
 onSuccess={loadData}
 />
 <PaymentDialog
 open={paymentOpen}
 onOpenChange={setPaymentOpen}
 branchId={branchId}
 onSuccess={handlePaymentSuccess}
 />
 </>)}

 <ReceiptDialog
 open={receiptOpen}
 onOpenChange={setReceiptOpen}
 receipt={lastReceipt}
 branchName={branchName ?? branchLabel}
 />
 </div>);
}
