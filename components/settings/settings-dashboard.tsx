"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  CalendarDays,
  FileCog,
  Landmark,
  Package,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Settings2,
  Users,
  TabletSmartphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BranchesSettingsPanel } from "@/components/settings/branches-settings-panel";
import { CompanyProfilesPanel } from "@/components/settings/company-profiles-panel";
import { ProductsSettingsPanel } from "@/components/settings/products-settings-panel";
import { StockSettingsPanel } from "@/components/settings/stock-settings-panel";
import { StockPlanningSettingsPanel } from "@/components/settings/stock-planning-settings-panel";
import { StaffSettingsPanel } from "@/components/settings/staff-settings-panel";
import { SystemHealthPanel } from "@/components/settings/system-health-panel";
import { UsersSettingsPanel } from "@/components/settings/users-settings-panel";
import { PosDevicesPanel } from "@/components/settings/pos-devices-panel";
import {
  fetchSettingsUsers,
  fetchSettingsProducts,
  fetchSettingsBranchesGrouped,
  fetchSettingsRegions,
  fetchSettingsStockItems,
} from "@/lib/settings/api";
import { rolesCreatableBy } from "@/lib/settings/personnel-access";
import {
  canViewStockPlanning,
  canEditStockPlanning,
} from "@/lib/settings/stock-planning-access";
import type {
  SettingsBranchGroup,
  SettingsProduct,
  SettingsRegion,
  SettingsStockItem,
  SettingsUser,
} from "@/lib/settings/types";
import { useAuthStore } from "@/stores/auth-store";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  ModuleLayout,
  ModuleHeader,
  ModuleLoading,
} from "@/components/shared/module-ui";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  const tabParam = searchParams.get("tab");
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role;
  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN";
  const isAreaManager = role === "AREA_MANAGER";
  const canManageStaff = isAdmin || isAreaManager;
  const canManageUsers = isAdmin;
  const canViewStaff = canManageStaff || role === "OPERATION_MANAGER";
  const creatableRoles = profile ? rolesCreatableBy(profile) : [];

  const defaultTab =
    tabParam === "branches"
      ? "branches"
      : tabParam === "companies"
        ? "companies"
        : tabParam === "users" && canManageUsers
          ? "users"
          : tabParam === "pos-devices" && isAdmin
            ? "pos-devices"
          : tabParam === "staff" && canViewStaff
            ? "staff"
          : tabParam === "planning"
            ? "planning"
            : tabParam === "system"
              ? "system"
              : canManageStaff && !isAdmin
                ? "staff"
                : "products";
  const [activeTab, setActiveTab] = useState(defaultTab);

  const [users, setUsers] = useState<SettingsUser[]>(initialUsers?.users ?? []);
  const [usersStaffTotal, setUsersStaffTotal] = useState<number | undefined>(
    initialUsers?.staff_total,
  );
  const [usersLoginTotal, setUsersLoginTotal] = useState<number | undefined>(
    initialUsers?.login_total,
  );
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [products, setProducts] = useState<SettingsProduct[]>([]);
  const [branchGroups, setBranchGroups] = useState<SettingsBranchGroup[]>([]);
  const [regions, setRegions] = useState<SettingsRegion[]>([]);
  const [stockItems, setStockItems] = useState<SettingsStockItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    if (!canManageUsers) return;
    setUsersLoading(true);
    setUsersError(null);
    try {
      const us = await fetchSettingsUsers();
      setUsers(us.users);
      setUsersStaffTotal(us.staff_total);
      setUsersLoginTotal(us.login_total);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal muat pengguna";
      setUsersError(msg);
      if (!initialUsers?.users.length) {
        toast.error(msg);
      }
    } finally {
      setUsersLoading(false);
    }
  }, [canManageUsers, initialUsers?.users.length]);

  const loadData = useCallback(async () => {
    if (!profile) return;
    const tasks: Array<Promise<unknown>> = [];
    const canLoadCatalog =
      isAdmin || role === "CEO_FACTORY" || role === "OPERATION_MANAGER";
    const needsBranches =
      activeTab === "branches" ||
      activeTab === "staff" ||
      activeTab === "users";

    if (canLoadCatalog && activeTab === "products") {
      tasks.push(
        fetchSettingsProducts().then((pr) => setProducts(pr.products)),
      );
    }

    if (canLoadCatalog && activeTab === "stock") {
      tasks.push(
        fetchSettingsStockItems().then((st) => setStockItems(st.items)),
      );
    }

    if ((canViewStaff || isAdmin) && needsBranches) {
      tasks.push(
        fetchSettingsBranchesGrouped().then((g) => setBranchGroups(g.groups)),
      );
    }

    if (canManageUsers && activeTab === "users") {
      tasks.push(loadUsers());
    }

    if (isAdmin && needsBranches) {
      tasks.push(fetchSettingsRegions().then((reg) => setRegions(reg.regions)));
    }

    const results = await Promise.allSettled(tasks);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      const first = failed[0] as PromiseRejectedResult;
      toast.error(
        first.reason instanceof Error
          ? first.reason.message
          : "Sebahagian tetapan gagal dimuat",
      );
    }
    setLoading(false);
  }, [
    profile,
    isAdmin,
    canManageUsers,
    canViewStaff,
    role,
    activeTab,
    loadUsers,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  const canEditStock = isAdmin || role === "CEO_FACTORY";
  const showCatalogTabs =
    isAdmin || role === "OPERATION_MANAGER" || role === "CEO_FACTORY";
  const showPlanningTab = role ? canViewStockPlanning(role) : false;
  const canEditPlanning = role ? canEditStockPlanning(role) : false;

  type SettingsControlCard = {
    value: string;
    title: string;
    description: string;
    icon: LucideIcon;
    metric: string;
    group: "Operasi" | "HR & Akses" | "Pentadbiran";
    tone: "amber" | "emerald" | "sky" | "violet" | "stone" | "rose";
    visible: boolean;
  };

  const controlCards = useMemo(
    () =>
      [
        {
          value: "products",
          title: "Produk POS",
          description:
            "Menu jualan, harga, kategori, unit, status dan susunan paparan POS.",
          icon: Package,
          metric: products.length
            ? `${products.length} produk`
            : "Tambah / edit",
          group: "Operasi",
          tone: "amber",
          visible: showCatalogTabs,
        },
        {
          value: "branches",
          title: "Cawangan",
          description:
            "Profil kiosk, kawasan, status operasi dan struktur cawangan.",
          icon: Building2,
          metric: branchGroups.length
            ? `${branchGroups.reduce((sum, group) => sum + group.branches.length, 0)} cawangan`
            : "Profil kiosk",
          group: "Operasi",
          tone: "emerald",
          visible: showCatalogTabs,
        },
        {
          value: "stock",
          title: "Stok & Ambang",
          description:
            "Had stok rendah/kritikal untuk POS, cawangan dan operasi harian.",
          icon: SlidersHorizontal,
          metric: stockItems.length
            ? `${stockItems.length} item`
            : "Kawalan stok",
          group: "Operasi",
          tone: "sky",
          visible: showCatalogTabs,
        },
        {
          value: "planning",
          title: "Ramalan Order",
          description:
            "Tetapan hari liputan, buffer keselamatan dan perancangan order.",
          icon: CalendarDays,
          metric: canEditPlanning ? "Boleh edit" : "Semakan",
          group: "Operasi",
          tone: "violet",
          visible: showPlanningTab,
        },
        {
          value: "pos-devices",
          title: "Tablet POS Rasmi",
          description: "Daftar satu tablet rasmi bagi setiap cawangan dan kunci transaksi sebenar kepada peranti tersebut.",
          icon: TabletSmartphone,
          metric: "Kawalan peranti",
          group: "Operasi",
          tone: "sky",
          visible: isAdmin,
        },
        {
          value: "companies",
          title: "Profil Syarikat",
          description:
            "Maklumat legal entity, dokumen syarikat dan fail rujukan rasmi.",
          icon: Landmark,
          metric: "3 syarikat",
          group: "Pentadbiran",
          tone: "stone",
          visible: isAdmin,
        },
        {
          value: "staff",
          title: "Rekod Staf HR",
          description:
            isAreaManager
              ? "AM gunakan bahagian ini sahaja untuk tambah staf jualan/POS."
              : "Rekod pekerja sebenar: syarikat, cawangan, jawatan, gaji asas, HR dan portal staf.",
          icon: Users,
          metric: usersStaffTotal ? `${usersStaffTotal} staf` : "Staf",
          group: "HR & Akses",
          tone: "emerald",
          visible: canViewStaff,
        },
        {
          value: "users",
          title: "Login Sistem & Role",
          description: "Login & Role, dashboard AI dan akses pentadbiran HQ.",
          icon: FileCog,
          metric: usersLoginTotal ? `${usersLoginTotal} login` : "Akses",
          group: "HR & Akses",
          tone: "amber",
          visible: canManageUsers,
        },
        {
          value: "system",
          title: "Kesihatan Sistem",
          description:
            "Semakan sambungan, jadual data dan status modul kritikal.",
          icon: ShieldCheck,
          metric: "Admin",
          group: "Pentadbiran",
          tone: "rose",
          visible: isAdmin,
        },
      ] satisfies SettingsControlCard[],
    [
      branchGroups,
      canEditPlanning,
      canManageUsers,
      canViewStaff,
      isAdmin,
      products.length,
      showCatalogTabs,
      showPlanningTab,
      stockItems.length,
      usersLoginTotal,
      usersStaffTotal,
    ],
  );

  const visibleControlCards = useMemo(
    () => controlCards.filter((card) => card.visible),
    [controlCards],
  );
  const activeControlCard =
    visibleControlCards.find((card) => card.value === activeTab) ??
    visibleControlCards[0];
  const ActiveControlIcon = activeControlCard?.icon ?? Settings2;
  const navigationGroups = useMemo(
    () =>
      (["Operasi", "HR & Akses", "Pentadbiran"] as const)
        .map((group) => ({
          group,
          items: visibleControlCards.filter((card) => card.group === group),
        }))
        .filter((group) => group.items.length > 0),
    [visibleControlCards],
  );

  return (
    <ModuleLayout>
      <ModuleHeader
        title="Tetapan"
        description={
          isAreaManager
            ? "Pusat kawalan kawasan anda: rekod staf jualan, akses portal staf dan aturan operasi."
            : "Pusat kawalan RKJ One untuk produk, cawangan, stok, staf, akses, dokumen syarikat dan kesihatan sistem."
        }
        icon={Settings2}
        badges={
          <>
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-900"
            >
              Semua aturan utama
            </Badge>
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-900"
            >
              Ikut role pengguna
            </Badge>
          </>
        }
      />

      {loading ? (
        <ModuleLoading />
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="rkj-surface h-fit rounded-lg p-3 lg:sticky lg:top-4">
              <div className="mb-3 rounded-lg border border-amber-100 bg-amber-50/70 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Pusat Tetapan
                </div>
                <p className="mt-1 text-base font-semibold text-stone-950">
                  {visibleControlCards.length} modul aktif
                </p>
              </div>

              <div className="space-y-4">
                {navigationGroups.map((group) => (
                  <div key={group.group} className="space-y-1.5">
                    <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.group}
                    </p>
                    {group.items.map((card) => {
                      const Icon = card.icon;
                      const active = activeTab === card.value;
                      return (
                        <button
                          key={card.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setActiveTab(card.value)}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition",
                            active
                              ? "border-amber-300 bg-amber-50 text-stone-950 shadow-sm"
                              : "border-transparent hover:border-stone-200 hover:bg-white",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                              card.tone === "amber" &&
                                "border-amber-200 bg-amber-50 text-amber-700",
                              card.tone === "emerald" &&
                                "border-emerald-200 bg-emerald-50 text-emerald-700",
                              card.tone === "sky" &&
                                "border-sky-200 bg-sky-50 text-sky-700",
                              card.tone === "violet" &&
                                "border-violet-200 bg-violet-50 text-violet-700",
                              card.tone === "stone" &&
                                "border-stone-200 bg-stone-50 text-stone-700",
                              card.tone === "rose" &&
                                "border-rose-200 bg-rose-50 text-rose-700",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold leading-5">
                              {card.title}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {card.metric}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </aside>

            <div className="min-w-0 space-y-4">
              {activeControlCard && (
                <div className="rkj-surface overflow-hidden rounded-lg">
                  <div className="rkj-panel-head flex flex-col gap-3 border-b border-amber-100/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border",
                          activeControlCard.tone === "amber" &&
                            "border-amber-200 bg-amber-50 text-amber-700",
                          activeControlCard.tone === "emerald" &&
                            "border-emerald-200 bg-emerald-50 text-emerald-700",
                          activeControlCard.tone === "sky" &&
                            "border-sky-200 bg-sky-50 text-sky-700",
                          activeControlCard.tone === "violet" &&
                            "border-violet-200 bg-violet-50 text-violet-700",
                          activeControlCard.tone === "stone" &&
                            "border-stone-200 bg-stone-50 text-stone-700",
                          activeControlCard.tone === "rose" &&
                            "border-rose-200 bg-rose-50 text-rose-700",
                        )}
                      >
                        <ActiveControlIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                          {activeControlCard.group}
                        </p>
                        <h2 className="text-lg font-semibold text-stone-950">
                          {activeControlCard.title}
                        </h2>
                        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                          {activeControlCard.description}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="w-fit bg-white">
                      {activeControlCard.metric}
                    </Badge>
                  </div>
                  <div className="grid gap-3 p-4 md:grid-cols-3">
                    <div className="rounded-lg border bg-white px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Skop
                      </p>
                      <p className="mt-1 font-semibold text-stone-950">
                        {activeControlCard.group}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-white px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Status
                      </p>
                      <p className="mt-1 font-semibold text-stone-950">
                        Sedang dibuka
                      </p>
                    </div>
                    <div className="rounded-lg border bg-white px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Rekod
                      </p>
                      <p className="mt-1 font-semibold text-stone-950">
                        {activeControlCard.metric}
                      </p>
                    </div>
                  </div>
                </div>
              )}

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
            <TabsContent value="pos-devices" className="mt-4">
              <PosDevicesPanel />
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
                canManage={canManageStaff}
                onRefresh={loadData}
              />
            </TabsContent>
          )}

          {canManageUsers && (
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

          {isAdmin && (
            <TabsContent value="system" className="mt-4">
              <SystemHealthPanel />
            </TabsContent>
          )}
            </div>
          </div>
        </Tabs>
      )}
    </ModuleLayout>
  );
}
