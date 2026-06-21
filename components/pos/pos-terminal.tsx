'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { History, BarChart3, LayoutDashboard, Trash2 } from 'lucide-react';
import {
  fetchProducts,
  fetchShift,
  fetchTransactions,
  fetchDailySummary,
  fetchBranches,
  fetchStockAvailability,
  fetchExpiredStock,
  syncOfflineSales,
} from '@/lib/pos/api';
import {
  getOfflineQueue,
  removeOfflineSale,
} from '@/lib/pos/offline-queue';
import { formatRM } from '@/lib/pos/utils';
import { usePosStore } from '@/stores/pos-store';
import { useAuthStore } from '@/stores/auth-store';
import type { SaleResult } from '@/lib/pos/types';
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
import {
  ExpiredStockAlert,
  type ExpiredRejectPrefill,
} from '@/components/pos/expired-stock-alert';
import type { RotiExpirySummary } from '@/lib/stock/expiry';
import { needsBranchPicker } from '@/lib/auth/branch-scope';
import { canUsePosRejectStock } from '@/lib/auth/stock-access';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export function PosTerminal() {
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

  const branchName =
    branches.find((b) => b.id === branchId)?.branch_name ??
    authBranch?.branch_name;

  const branchCode =
    branches.find((b) => b.id === branchId)?.branch_code ??
    authBranch?.branch_code;

  const branchLabel =
    branchName && branchCode
      ? `${branchCode} · ${branchName}`
      : branchName ?? branchCode;

  const showBranchPicker = profile ? needsBranchPicker(profile) : false;
  const showRejectTab = profile ? canUsePosRejectStock(profile.role) : false;

  const loadData = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const [productsRes, stockRes, shiftRes, txRes, summaryRes, expiryRes] =
        await Promise.allSettled([
          fetchProducts(branchId),
          fetchStockAvailability(branchId),
          fetchShift(branchId),
          fetchTransactions(branchId),
          fetchDailySummary(branchId),
          fetchExpiredStock(branchId),
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
        toast.error('Gagal memuatkan stok — jualan mungkin terhad');
      }

      if (shiftRes.status === 'fulfilled') {
        setShift(shiftRes.value.shift);
      }
      if (txRes.status === 'fulfilled') {
        setTransactions(txRes.value.transactions);
      }
      if (summaryRes.status === 'fulfilled') {
        setDailySummary(summaryRes.value.summary);
      }

      if (expiryRes.status === 'fulfilled') {
        setExpirySummary(expiryRes.value.summary);
      } else {
        setExpirySummary(null);
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
    setTransactions,
    setDailySummary,
    setLoading,
  ]);

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
      // Silent fail — will retry
    }
  }, [loadData, setOfflineCount]);

  useEffect(() => {
    if (profile?.branch_id) {
      setBranchId(profile.branch_id);
    }
    fetchBranches()
      .then(({ branches: b }) => setBranches(b))
      .catch(() => toast.error('Gagal memuatkan senarai cawangan'));
  }, [profile?.branch_id, setBranchId]);

  useEffect(() => {
    if (showBranchPicker && branches.length && !branchId) {
      setBranchId(branches[0].id);
    }
  }, [showBranchPicker, branches, branchId, setBranchId]);

  useEffect(() => {
    if (branchId) loadData();
  }, [branchId, loadData]);

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

      if (e.key === 'F2' && shift && cart.length > 0) {
        e.preventDefault();
        setPaymentOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, paymentOpen, receiptOpen, shift, cart.length]);

  function handlePaymentSuccess(receipt: SaleResult) {
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

  if (!profile) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full" />
        <div className="grid flex-1 gap-4 lg:grid-cols-3">
          <Skeleton className="lg:col-span-2 h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (showBranchPicker && !branchId) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Pilih Cawangan"
          description="Pilih cawangan kiosk sebelum membuka kaunter POS"
        />
        <BranchSelector
          branches={branches}
          value={branchId ?? ''}
          onChange={setBranchId}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          badge="Kaunter Tunai"
          title="POS — Kaunter Tunai"
          description="Ketik produk → bayar · F2 bayar pantas · staf: reject stok rosak dari tab Reject"
          className="flex-1 min-w-[280px]"
        />
        <div className="flex flex-wrap items-center gap-2">
          {dailySummary && (
            <Badge variant="secondary" className="px-3 py-1.5 text-sm tabular-nums">
              Jualan hari ini: {formatRM(Number(dailySummary.total_sales))}
            </Badge>
          )}
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
          >
            <LayoutDashboard className="h-4 w-4" />
            Papan Pemuka
          </Link>
          {showBranchPicker && (
            <BranchSelector
              branches={branches}
              value={branchId ?? ''}
              onChange={setBranchId}
            />
          )}
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
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col">
          <TabsList>
            <TabsTrigger value="sale">Jualan</TabsTrigger>
            <TabsTrigger value="history" className="gap-1">
              <History className="h-4 w-4" />
              Sejarah
            </TabsTrigger>
            <TabsTrigger value="summary" className="gap-1">
              <BarChart3 className="h-4 w-4" />
              Ringkasan
            </TabsTrigger>
            {showRejectTab && (
              <TabsTrigger value="reject" className="gap-1">
                <Trash2 className="h-4 w-4" />
                Reject Stok
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="sale" className="mt-4 flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
              <div className="flex min-h-0 flex-col overflow-hidden lg:col-span-2">
                <ProductGrid />
              </div>
              <div className="flex min-h-0 flex-col overflow-hidden">
                <CartPanel onCheckout={() => setPaymentOpen(true)} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <TransactionHistory onRefresh={loadData} />
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
            </TabsContent>
          )}
        </Tabs>
      )}

      {branchId && (
        <>
          <OpenShiftDialog
            open={openShiftOpen}
            onOpenChange={setOpenShiftOpen}
            branchId={branchId}
            onSuccess={loadData}
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
        </>
      )}

      <ReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        receipt={lastReceipt}
        branchName={branchName ?? branchLabel}
      />
    </div>
  );
}
