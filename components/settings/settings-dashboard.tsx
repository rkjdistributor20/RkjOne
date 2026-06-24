'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Users, Package, Building2, SlidersHorizontal, Settings2, CalendarDays, Landmark } from 'lucide-react';
import { BranchesSettingsPanel } from '@/components/settings/branches-settings-panel';
import { CompanyProfilesPanel } from '@/components/settings/company-profiles-panel';
import { ProductsSettingsPanel } from '@/components/settings/products-settings-panel';
import { StockSettingsPanel } from '@/components/settings/stock-settings-panel';
import { StockPlanningSettingsPanel } from '@/components/settings/stock-planning-settings-panel';
import { StaffSettingsPanel } from '@/components/settings/staff-settings-panel';
import { UsersSettingsPanel } from '@/components/settings/users-settings-panel';
import {
  fetchSettingsUsers,
  fetchSettingsProducts,
  fetchSettingsBranchesGrouped,
  fetchSettingsRegions,
  fetchSettingsStockItems,
} from '@/lib/settings/api';
import { rolesCreatableBy } from '@/lib/settings/personnel-access';
import { canViewStockPlanning, canEditStockPlanning } from '@/lib/settings/stock-planning-access';
import type {
  SettingsBranchGroup,
  SettingsProduct,
  SettingsRegion,
  SettingsStockItem,
  SettingsUser,
} from '@/lib/settings/types';
import { useAuthStore } from '@/stores/auth-store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ModuleLayout,
  ModuleHeader,
  ModuleLoading,
  moduleTabsListClass,
  moduleTabsTriggerClass,
} from '@/components/shared/module-ui';

type InitialUsersPayload = {
  users: SettingsUser[];
  staff_total?: number;
  login_total?: number;
};

type Props = {
  initialUsers?: InitialUsersPayload;
};

export function SettingsDashboard({ initialUsers }: Props = {}) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role;
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const isAreaManager = role === 'AREA_MANAGER';
  const canManagePersonnel = isAdmin || isAreaManager;
  const canViewStaff =
    canManagePersonnel || role === 'OPERATION_MANAGER';
  const creatableRoles = profile ? rolesCreatableBy(profile) : [];

  const defaultTab =
    tabParam === 'branches'
      ? 'branches'
      : tabParam === 'companies'
        ? 'companies'
        : tabParam === 'users'
        ? 'users'
        : tabParam === 'planning'
          ? 'planning'
          : canManagePersonnel && !isAdmin
            ? 'staff'
            : 'products';
  const [activeTab, setActiveTab] = useState(defaultTab);

  const [users, setUsers] = useState<SettingsUser[]>(initialUsers?.users ?? []);
  const [usersStaffTotal, setUsersStaffTotal] = useState<number | undefined>(
    initialUsers?.staff_total
  );
  const [usersLoginTotal, setUsersLoginTotal] = useState<number | undefined>(
    initialUsers?.login_total
  );
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [products, setProducts] = useState<SettingsProduct[]>([]);
  const [branchGroups, setBranchGroups] = useState<SettingsBranchGroup[]>([]);
  const [regions, setRegions] = useState<SettingsRegion[]>([]);
  const [stockItems, setStockItems] = useState<SettingsStockItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    if (!canManagePersonnel) return;
    setUsersLoading(true);
    setUsersError(null);
    try {
      const us = await fetchSettingsUsers();
      setUsers(us.users);
      setUsersStaffTotal(us.staff_total);
      setUsersLoginTotal(us.login_total);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal muat pengguna';
      setUsersError(msg);
      if (!initialUsers?.users.length) {
        toast.error(msg);
      }
    } finally {
      setUsersLoading(false);
    }
  }, [canManagePersonnel, initialUsers?.users.length]);

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const tasks: Array<Promise<unknown>> = [];

    if (isAdmin || role === 'CEO_FACTORY' || role === 'OPERATION_MANAGER') {
      tasks.push(
        fetchSettingsProducts().then((pr) => setProducts(pr.products)),
        fetchSettingsStockItems().then((st) => setStockItems(st.items))
      );
    }

    if (canViewStaff || isAdmin) {
      tasks.push(fetchSettingsBranchesGrouped().then((g) => setBranchGroups(g.groups)));
    }

    if (canManagePersonnel) {
      tasks.push(loadUsers());
    }

    if (isAdmin) {
      tasks.push(fetchSettingsRegions().then((reg) => setRegions(reg.regions)));
    }

    const results = await Promise.allSettled(tasks);
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      const first = failed[0] as PromiseRejectedResult;
      toast.error(
        first.reason instanceof Error ? first.reason.message : 'Sebahagian tetapan gagal dimuat'
      );
    }
    setLoading(false);
  }, [profile, isAdmin, canManagePersonnel, canViewStaff, role, loadUsers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'users' && canManagePersonnel && users.length === 0 && !usersLoading) {
      void loadUsers();
    }
  }, [activeTab, canManagePersonnel, users.length, usersLoading, loadUsers]);

  const canEditStock = isAdmin || role === 'CEO_FACTORY';
  const showCatalogTabs = isAdmin || role === 'OPERATION_MANAGER' || role === 'CEO_FACTORY';
  const showPlanningTab = role ? canViewStockPlanning(role) : false;
  const canEditPlanning = role ? canEditStockPlanning(role) : false;

  return (
    <ModuleLayout>
      <ModuleHeader
        title="Tetapan"
        description={
          isAreaManager
            ? 'Urus staf dan pengguna kiosk dalam kawasan anda'
            : 'Urus produk, cawangan, ambang stok, staf, dan pengguna'
        }
        icon={Settings2}
      />

      {loading ? (
        <ModuleLoading />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className={moduleTabsListClass}>
            {showCatalogTabs && (
              <>
                <TabsTrigger value="products" className={moduleTabsTriggerClass}>
                  <Package className="h-4 w-4" /> Produk
                </TabsTrigger>
                <TabsTrigger value="branches" className={moduleTabsTriggerClass}>
                  <Building2 className="h-4 w-4" /> Cawangan
                </TabsTrigger>
                <TabsTrigger value="stock" className={moduleTabsTriggerClass}>
                  <SlidersHorizontal className="h-4 w-4" /> Ambang Stok
                </TabsTrigger>
              </>
            )}
            {showPlanningTab && (
              <TabsTrigger value="planning" className={moduleTabsTriggerClass}>
                <CalendarDays className="h-4 w-4" /> Ramalan Order
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="companies" className={moduleTabsTriggerClass}>
                <Landmark className="h-4 w-4" /> Syarikat
              </TabsTrigger>
            )}
            {canViewStaff && (
              <TabsTrigger value="staff" className={moduleTabsTriggerClass}>
                <Users className="h-4 w-4" /> Staf
              </TabsTrigger>
            )}
            {canManagePersonnel && (
              <TabsTrigger value="users" className={moduleTabsTriggerClass}>
                <Users className="h-4 w-4" /> Pengguna
              </TabsTrigger>
            )}
          </TabsList>

          {showCatalogTabs && (
            <>
              <TabsContent value="products" className="mt-4">
                <ProductsSettingsPanel
                  products={products}
                  isAdmin={isAdmin}
                  onRefresh={loadData}
                />
              </TabsContent>

              <TabsContent value="branches" className="mt-4">
                <BranchesSettingsPanel
                  groups={branchGroups}
                  regions={regions}
                  isAdmin={isAdmin}
                  onRefresh={loadData}
                />
              </TabsContent>

              <TabsContent value="stock" className="mt-4">
                <StockSettingsPanel
                  stockItems={stockItems}
                  canEdit={canEditStock}
                  isAdmin={isAdmin}
                  onRefresh={loadData}
                />
              </TabsContent>
            </>
          )}

          {showPlanningTab && (
            <TabsContent value="planning" className="mt-4">
              <StockPlanningSettingsPanel canEdit={canEditPlanning} />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="companies" className="mt-4">
              <CompanyProfilesPanel />
            </TabsContent>
          )}

          {canViewStaff && (
            <TabsContent value="staff" className="mt-4">
              <StaffSettingsPanel
                branchGroups={branchGroups}
                canManage={canManagePersonnel}
                onRefresh={loadData}
              />
            </TabsContent>
          )}

          {canManagePersonnel && (
            <TabsContent value="users" className="mt-4">
              <UsersSettingsPanel
                users={users}
                usersStaffTotal={usersStaffTotal}
                usersLoginTotal={usersLoginTotal}
                usersLoading={usersLoading}
                usersError={usersError}
                branchGroups={branchGroups}
                isAdmin={isAdmin}
                isAreaManager={isAreaManager}
                creatableRoles={creatableRoles}
                onRefresh={loadUsers}
              />
            </TabsContent>
          )}
        </Tabs>
      )}
    </ModuleLayout>
  );
}
