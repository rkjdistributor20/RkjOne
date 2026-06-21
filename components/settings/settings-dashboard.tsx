'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Users, Package, Building2, SlidersHorizontal } from 'lucide-react';
import { StaffByRegionPanel } from '@/components/staff/staff-by-region-panel';
import {
  fetchSettingsUsers,
  fetchSettingsProducts,
  fetchSettingsBranches,
  fetchSettingsStockItems,
  updateStockThresholds,
} from '@/lib/settings/api';
import type {
  SettingsBranch,
  SettingsProduct,
  SettingsStockItem,
  SettingsUser,
} from '@/lib/settings/types';
import { useAuthStore } from '@/stores/auth-store';
import { ROLE_LABELS, type UserRole } from '@/types/enums';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

function fmt(n: number) {
  return `RM ${Number(n).toFixed(2)}`;
}

export function SettingsDashboard() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const role = useAuthStore((s) => s.profile?.role);
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const canViewStaff = isAdmin || role === 'AREA_MANAGER' || role === 'OPERATION_MANAGER';
  const defaultTab =
    tabParam === 'branches'
      ? 'branches'
      : canViewStaff && !isAdmin
        ? 'staff'
        : 'products';
  const [activeTab, setActiveTab] = useState(defaultTab);

  const [users, setUsers] = useState<SettingsUser[]>([]);
  const [products, setProducts] = useState<SettingsProduct[]>([]);
  const [branches, setBranches] = useState<SettingsBranch[]>([]);
  const [stockItems, setStockItems] = useState<SettingsStockItem[]>([]);
  const [thresholds, setThresholds] = useState<Record<string, { min: string; critical: string }>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, br, st] = await Promise.all([
        fetchSettingsProducts(),
        fetchSettingsBranches(),
        fetchSettingsStockItems(),
      ]);
      setProducts(pr.products);
      setBranches(br.branches);
      setStockItems(st.items);
      const t: Record<string, { min: string; critical: string }> = {};
      st.items.forEach((item) => {
        t[item.id] = {
          min: item.min_threshold != null ? String(item.min_threshold) : '',
          critical: item.critical_threshold != null ? String(item.critical_threshold) : '',
        };
      });
      setThresholds(t);

      if (isAdmin) {
        const us = await fetchSettingsUsers();
        setUsers(us.users);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan tetapan');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function saveThreshold(itemId: string) {
    try {
      await updateStockThresholds(
        itemId,
        thresholds[itemId]?.min ? Number(thresholds[itemId].min) : null,
        thresholds[itemId]?.critical ? Number(thresholds[itemId].critical) : null
      );
      toast.success('Ambang dikemaskini');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal kemaskini');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Tetapan Admin</h2>
        <p className="text-sm text-muted-foreground">
          Data induk · ambang stok · pengguna
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="products" className="gap-1">
              <Package className="h-4 w-4" /> Produk
            </TabsTrigger>
            <TabsTrigger value="branches" className="gap-1">
              <Building2 className="h-4 w-4" /> Cawangan
            </TabsTrigger>
            <TabsTrigger value="stock" className="gap-1">
              <SlidersHorizontal className="h-4 w-4" /> Ambang Stok
            </TabsTrigger>
            {canViewStaff && (
              <TabsTrigger value="staff" className="gap-1">
                <Users className="h-4 w-4" /> Staf
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="users" className="gap-1">
                <Users className="h-4 w-4" /> Pengguna
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="products" className="mt-4">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-3">SKU</th>
                    <th className="p-3">Nama</th>
                    <th className="p-3">Harga</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        Tiada produk.
                      </td>
                    </tr>
                  ) : (
                    products.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="p-3">{p.sku}</td>
                      <td className="p-3">{p.name}</td>
                      <td className="p-3">{fmt(p.selling_price)}</td>
                      <td className="p-3"><Badge variant="outline">{p.status}</Badge></td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="branches" className="mt-4">
            {branches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tiada cawangan.</p>
            ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {branches.map((b) => (
                <div key={b.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{b.branch_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.branch_code} · {b.region?.name ?? '—'}
                  </p>
                  <Badge variant="outline" className="mt-1">{b.status}</Badge>
                </div>
              ))}
            </div>
            )}
          </TabsContent>

          <TabsContent value="stock" className="mt-4 space-y-3">
            {!isAdmin && role !== 'CEO_FACTORY' ? (
              <p className="text-sm text-muted-foreground">Hanya pentadbir boleh edit ambang stok</p>
            ) : stockItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tiada item stok.</p>
            ) : (
              stockItems.map((item) => (
                <div key={item.id} className="flex flex-wrap items-end gap-3 rounded-lg border p-3 text-sm">
                  <div className="min-w-[180px] flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.item_code}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Minimum</label>
                    <Input
                      type="number"
                      className="h-8 w-24"
                      value={thresholds[item.id]?.min ?? ''}
                      onChange={(e) =>
                        setThresholds({
                          ...thresholds,
                          [item.id]: { ...thresholds[item.id], min: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Kritikal</label>
                    <Input
                      type="number"
                      className="h-8 w-24"
                      value={thresholds[item.id]?.critical ?? ''}
                      onChange={(e) =>
                        setThresholds({
                          ...thresholds,
                          [item.id]: { ...thresholds[item.id], critical: e.target.value },
                        })
                      }
                    />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => saveThreshold(item.id)}>
                    Simpan
                  </Button>
                </div>
              ))
            )}
          </TabsContent>

          {canViewStaff && (
            <TabsContent value="staff" className="mt-4">
              <StaffByRegionPanel />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="users" className="mt-4">
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="p-3">Nama</th>
                      <th className="p-3">E-mel</th>
                      <th className="p-3">Peranan</th>
                      <th className="p-3">Cawangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b">
                        <td className="p-3">{u.full_name}</td>
                        <td className="p-3">{u.email}</td>
                        <td className="p-3">
                          <Badge variant="outline">
                            {ROLE_LABELS[u.role as UserRole] ?? u.role}
                          </Badge>
                        </td>
                        <td className="p-3">{u.branch?.branch_name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
