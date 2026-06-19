'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { History, BarChart3 } from 'lucide-react';
import {
  fetchProducts,
  fetchShift,
  fetchTransactions,
  fetchDailySummary,
  fetchBranches,
  syncOfflineSales,
} from '@/lib/pos/api';
import {
  getOfflineQueue,
  removeOfflineSale,
} from '@/lib/pos/offline-queue';
import { usePosStore } from '@/stores/pos-store';
import { useAuthStore } from '@/stores/auth-store';
import type { SaleResult } from '@/lib/pos/types';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

export function PosTerminal() {
  const profile = useAuthStore((s) => s.profile);
  const authBranch = useAuthStore((s) => s.branch);

  const branchId = usePosStore((s) => s.branchId);
  const setBranchId = usePosStore((s) => s.setBranchId);
  const setProducts = usePosStore((s) => s.setProducts);
  const setShift = usePosStore((s) => s.setShift);
  const setTransactions = usePosStore((s) => s.setTransactions);
  const setDailySummary = usePosStore((s) => s.setDailySummary);
  const setOnline = usePosStore((s) => s.setOnline);
  const setOfflineCount = usePosStore((s) => s.setOfflineCount);
  const isLoading = usePosStore((s) => s.isLoading);
  const setLoading = usePosStore((s) => s.setLoading);
  const lastReceipt = usePosStore((s) => s.lastReceipt);
  const setLastReceipt = usePosStore((s) => s.setLastReceipt);

  const [branches, setBranches] = useState<
    Array<{ id: string; branch_code: string; branch_name: string }>
  >([]);
  const [openShiftOpen, setOpenShiftOpen] = useState(false);
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('sale');

  const branchName =
    branches.find((b) => b.id === branchId)?.branch_name ??
    authBranch?.branch_name;

  const needsBranchPicker = !profile?.branch_id;

  const loadData = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const [productsRes, shiftRes, txRes, summaryRes] = await Promise.all([
        fetchProducts(branchId),
        fetchShift(branchId),
        fetchTransactions(branchId),
        fetchDailySummary(branchId),
      ]);
      setProducts(productsRes.products, productsRes.categories);
      setShift(shiftRes.shift);
      setTransactions(txRes.transactions);
      setDailySummary(summaryRes.summary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load POS data');
    } finally {
      setLoading(false);
    }
  }, [
    branchId,
    setProducts,
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
        toast.success(`Synced ${synced.length} offline sale(s)`);
        await loadData();
      }
      if (failed.length) {
        toast.error(`${failed.length} sale(s) failed to sync`);
      }
    } catch {
      // Silent fail — will retry
    }
  }, [loadData, setOfflineCount]);

  useEffect(() => {
    if (profile?.branch_id) {
      setBranchId(profile.branch_id);
    } else {
      fetchBranches()
        .then(({ branches: b }) => setBranches(b))
        .catch(() => {});
    }
  }, [profile?.branch_id, setBranchId]);

  useEffect(() => {
    if (needsBranchPicker && branches.length && !branchId) {
      setBranchId(branches[0].id);
    }
  }, [needsBranchPicker, branches, branchId, setBranchId]);

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

  function handlePaymentSuccess(receipt: SaleResult) {
    setLastReceipt(receipt);
    setReceiptOpen(true);
    loadData();
  }

  if (!profile) return null;

  if (needsBranchPicker && !branchId) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Select Branch</h2>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">POS Cash Counter</h2>
          <p className="text-sm text-muted-foreground">
            Cash · QR · Mixed payment
          </p>
        </div>
        {needsBranchPicker && (
          <BranchSelector
            branches={branches}
            value={branchId ?? ''}
            onChange={setBranchId}
          />
        )}
      </div>

      <ShiftBar
        branchName={branchName}
        onOpenShift={() => setOpenShiftOpen(true)}
        onCloseShift={() => setCloseShiftOpen(true)}
      />

      {isLoading ? (
        <div className="grid flex-1 gap-4 lg:grid-cols-3">
          <Skeleton className="lg:col-span-2 h-full" />
          <Skeleton className="h-full" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col">
          <TabsList>
            <TabsTrigger value="sale">Sale</TabsTrigger>
            <TabsTrigger value="history" className="gap-1">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="summary" className="gap-1">
              <BarChart3 className="h-4 w-4" />
              Summary
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sale" className="mt-4 flex-1">
            <div className="grid h-[calc(100vh-16rem)] gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 overflow-hidden">
                <ProductGrid />
              </div>
              <div className="overflow-hidden">
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
        branchName={branchName}
      />
    </div>
  );
}
