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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ModuleLayout,
  ModuleHeader,
  ModuleLoading,
  moduleTabsListClass,
  moduleTabsTriggerClass,
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
  const canManagePersonnel = isAdmin || isAreaManager;
  const canViewStaff = canManagePersonnel || role === "OPERATION_MANAGER";
  const creatableRoles = profile ? rolesCreatableBy(profile) : [];

  const defaultTab =
    tabParam === "branches"
      ? "branches"
      : tabParam === "companies"
        ? "companies"
        : tabParam === "users"
          ? "users"
          : tabParam === "planning"
            ? "planning"
            : tabParam === "system"
              ? "system"
              : canManagePersonnel && !isAdmin
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
    if (!canManagePersonnel) return;
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
  }, [canManagePersonnel, initialUsers?.users.length]);

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

    if (canManagePersonnel && activeTab === "users") {
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
    canManagePersonnel,
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
          tone: "violet",
          visible: showPlanningTab,
        },
        {
          value: "companies",
          title: "Profil Syarikat",
          description:
            "Maklumat legal entity, dokumen syarikat dan fail rujukan rasmi.",
          icon: Landmark,
          metric: "3 syarikat",
          tone: "stone",
          visible: isAdmin,
        },
        {
          value: "staff",
          title: "HR Cawangan",
          description:
            "Penempatan staf, maklumat pekerjaan dan pautan cawangan.",
          icon: Users,
          metric: usersStaffTotal ? `${usersStaffTotal} staf` : "Staf",
          tone: "emerald",
          visible: canViewStaff,
        },
        {
          value: "users",
          title: "Akses Pengguna",
          description: "Role, dashboard, akaun login dan had akses sistem.",
          icon: FileCog,
          metric: usersLoginTotal ? `${usersLoginTotal} login` : "Akses",
          tone: "amber",
          visible: canManagePersonnel,
        },
        {
          value: "system",
          title: "Kesihatan Sistem",
          description:
            "Semakan sambungan, jadual data dan status modul kritikal.",
          icon: ShieldCheck,
          metric: "Admin",
          tone: "rose",
          visible: isAdmin,
        },
      ] satisfies SettingsControlCard[],
    [
      branchGroups,
      canEditPlanning,
      canManagePersonnel,
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

  return (
    <ModuleLayout>
      <ModuleHeader
        title="Tetapan"
        description={
          isAreaManager
            ? "Pusat kawalan kawasan anda: staf, pengguna kiosk, akses dan aturan operasi."
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
          <div className="rounded-lg border border-amber-100 bg-[linear-gradient(135deg,#fffaf0_0%,#ffffff_48%,#effaf5_100%)] p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-amber-700">
                  <Sparkles className="h-4 w-4" />
                  Pusat Aturan Sistem
                </div>
                <h2 className="mt-1 text-lg font-semibold text-stone-950">
                  Pilih modul untuk kemaskini aturan operasi
                </h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Semua konfigurasi penting disusun di sini supaya Pentadbir
                  tidak perlu cari di dashboard lain. Perubahan akan digunakan
                  oleh POS, cawangan, stok, HR dan laporan mengikut hak akses
                  pengguna.
                </p>
              </div>
              <Badge
                variant="outline"
                className="w-fit border-stone-200 bg-white text-stone-700"
              >
                {controlCards.filter((card) => card.visible).length} modul
                tersedia
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {controlCards
                .filter((card) => card.visible)
                .map((card) => {
                  const Icon = card.icon;
                  const active = activeTab === card.value;
                  return (
                    <button
                      key={card.value}
                      type="button"
                      onClick={() => setActiveTab(card.value)}
                      className={cn(
                        "group min-h-[150px] rounded-lg border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md",
                        active && "border-amber-400 bg-amber-50/80 shadow-md",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-lg border",
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
                          <Icon className="h-5 w-5" />
                        </div>
                        <Badge
                          variant="outline"
                          className="bg-white text-xs font-normal"
                        >
                          {card.metric}
                        </Badge>
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-stone-950">
                        {card.title}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {card.description}
                      </p>
                      {active && (
                        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-700">
                          Sedang dibuka
                        </p>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          <TabsList className={moduleTabsListClass}>
            {showCatalogTabs && (
              <>
                <TabsTrigger
                  value="products"
                  className={moduleTabsTriggerClass}
                >
                  <Package className="h-4 w-4" /> Produk
                </TabsTrigger>
                <TabsTrigger
                  value="branches"
                  className={moduleTabsTriggerClass}
                >
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
            {isAdmin && (
              <TabsTrigger value="system" className={moduleTabsTriggerClass}>
                <ShieldCheck className="h-4 w-4" /> Kesihatan Sistem
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

          {isAdmin && (
            <TabsContent value="system" className="mt-4">
              <SystemHealthPanel />
            </TabsContent>
          )}
        </Tabs>
      )}
    </ModuleLayout>
  );
}
