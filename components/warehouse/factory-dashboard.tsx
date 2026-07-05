'use client';

import { useCallback, useEffect, useState } from 'react';
import { Factory, CalendarDays, Inbox, ClipboardList, Bot, Route, Store, AlertTriangle, ArrowRight, PackageOpen } from 'lucide-react';
import { fetchHqFactoryOrders } from '@/lib/production/api';
import type { HqFactoryOrder } from '@/lib/production/types';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FactoryProductionSchedulePanel } from '@/components/warehouse/factory-production-schedule-panel';
import { FactoryOrderInbox } from '@/components/warehouse/factory-order-inbox';
import { FactoryRawMaterialDashboard } from '@/components/warehouse/factory-raw-material-dashboard';
import { COMPANY } from '@/lib/brand/company';
import { WorkflowSopPanel } from '@/components/dashboard/workflow-sop-panel';
import { getRoleWorkflow } from '@/lib/dashboard/role-workflows';
import { useAuthStore } from '@/stores/auth-store';
import {
 ModuleLayout,
 ModuleHeader,
 KpiGrid,
 KpiCard,
 SectionCard,
 moduleTabsListClass,
 moduleTabsTriggerClass,
} from '@/components/shared/module-ui';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/components/i18n/language-provider';

export function FactoryDashboard() {
 const { t } = useLanguage();
 const profile = useAuthStore((s) => s.profile);
 const [orders, setOrders] = useState<HqFactoryOrder[]>([]);

 const loadOrders = useCallback(async () => {
 try {
 const { orders: list } = await fetchHqFactoryOrders();
 setOrders(list.filter((o) => o.status !== 'CANCELLED'));
 } catch {
 setOrders([]);
 }
 }, []);

 useEffect(() => {
 loadOrders();
 }, [loadOrders]);

 const pendingCount = orders.filter((o) => o.status === 'SUBMITTED').length;
 const acknowledgedCount = orders.filter((o) => o.status === 'ACKNOWLEDGED').length;
 const workflow = getRoleWorkflow({
 role: profile?.role === 'OPERATION_MANAGER' ? 'OPERATION_MANAGER' : 'CEO_FACTORY',
 legalEntityCode: profile?.legal_entity?.code ?? 'RKJ_MFG',
 });

 return (
 <ModuleLayout>
 <ModuleHeader
 title={t('module.factory.title')}
 description={`${COMPANY.name} - ${t('module.factory.description')}`}
 icon={Factory}
 />

 <WorkflowSopPanel workflow={workflow} />

 <SectionCard
 title={t('module.factory.muhammadTasks')}
 description={t('module.factory.muhammadTasksDesc')}
 >
 <div className="grid gap-4 lg:grid-cols-2">
 <div className="rounded-xl border bg-background p-4 shadow-sm">
 <div className="mb-3 flex items-center justify-between gap-3">
 <Badge variant="secondary" className="gap-1"><Factory className="h-3.5 w-3.5" /> CEO Manufacturing</Badge>
 <span className="text-xs text-muted-foreground">{t('module.factory.dailyPriority')}</span>
 </div>
 <h3 className="text-base font-semibold">{t('module.factory.ceoTitle')}</h3>
 <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
 {t('module.factory.ceoDesc')}
 </p>
 <div className="mt-4 grid gap-2 text-sm">
 <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-2"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" /> Semak order menunggu dan sahkan batch yang kritikal dahulu.</div>
 <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-2"><ClipboardList className="mt-0.5 h-4 w-4 text-primary" /> Pastikan jadual production selaras dengan permintaan HQ dan ejen.</div>
 </div>
 <Link href="/factory" className={cn(buttonVariants({ size: 'sm' }), 'mt-4')}>
 {t('module.factory.openFactoryTask')} <ArrowRight className="ml-1 h-4 w-4" />
 </Link>
 </div>

 <div className="rounded-xl border bg-background p-4 shadow-sm">
 <div className="mb-3 flex items-center justify-between gap-3">
 <Badge variant="outline" className="gap-1"><Store className="h-3.5 w-3.5" /> Ejen Khas Syarikat</Badge>
 <span className="text-xs text-muted-foreground">Jalan perniagaan agent</span>
 </div>
 <h3 className="text-base font-semibold">{t('module.factory.agentTitle')}</h3>
 <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
 {t('module.factory.agentDesc')}
 </p>
 <div className="mt-4 grid gap-2 text-sm">
 <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-2"><Route className="mt-0.5 h-4 w-4 text-primary" /> Semak driver/area bertugas sebelum order atau penghantaran dijadualkan.</div>
 <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-2"><Store className="mt-0.5 h-4 w-4 text-emerald-600" /> Pastikan pickup/POS aktif digunakan sebagai lokasi operasi agent.</div>
 </div>
 <Link href="/sales-agent" className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'mt-4')}>
 {t('module.factory.openAgentPortal')} <ArrowRight className="ml-1 h-4 w-4" />
 </Link>
 </div>
 </div>
 </SectionCard>

 <SectionCard
 title={t('module.factory.aiTitle')}
 description={t('module.factory.aiDesc')}
 >
 <div className="grid gap-3 lg:grid-cols-3">
 <div className="rounded-xl border bg-amber-50/60 p-4 text-sm">
 <Badge className="mb-3 gap-1 bg-amber-500 text-amber-950"><Bot className="h-3.5 w-3.5" /> Prediction</Badge>
 <p className="font-semibold">Jika order menunggu meningkat, risiko production delay naik.</p>
 <p className="mt-2 text-muted-foreground">AI cadangkan sahkan order paling awal, kemudian semak kapasiti jadual sebelum terima order tambahan.</p>
 </div>
 <div className="rounded-xl border bg-emerald-50/60 p-4 text-sm">
 <Badge variant="secondary" className="mb-3 gap-1"><ClipboardList className="h-3.5 w-3.5" /> Next Step</Badge>
 <p className="font-semibold">Urutan kerja disyorkan: Kilang, kemudian Ejen Khas, kemudian Logistik.</p>
 <p className="mt-2 text-muted-foreground">Sahkan batch, semak order/pickup Ejen Khas, kemudian pastikan driver cover lokasi yang betul.</p>
 </div>
 <div className="rounded-xl border bg-sky-50/60 p-4 text-sm">
 <Badge variant="outline" className="mb-3 gap-1"><Route className="h-3.5 w-3.5" /> Resolve</Badge>
 <p className="font-semibold">Bila berlaku konflik stok atau route, pecahkan ikut impak cawangan.</p>
 <p className="mt-2 text-muted-foreground">Utamakan outlet/POS aktif, pickup point kritikal, kemudian order stok yang sudah masuk queue kilang.</p>
 </div>
 </div>
 </SectionCard>

 <KpiGrid cols={3}>
 <KpiCard
 title={t('module.factory.pendingOrders')}
 value={pendingCount}
 description={t('module.factory.pendingOrdersDesc')}
 icon={ClipboardList}
 variant={pendingCount > 0 ? 'warning' : undefined}
 />
 <KpiCard
 title={t('module.factory.confirmedOrders')}
 value={acknowledgedCount}
 description={t('module.factory.confirmedOrdersDesc')}
 icon={Inbox}
 />
 <KpiCard
 title={t('module.factory.activeOrders')}
 value={orders.length}
 icon={Factory}
 />
 </KpiGrid>

 <Tabs defaultValue={pendingCount > 0 ? 'inbox' : 'schedule'} className="space-y-4">
 <TabsList className={moduleTabsListClass}>
 <TabsTrigger value="schedule" className={moduleTabsTriggerClass}>
 <CalendarDays className="h-4 w-4" /> {t('module.factory.productionSchedule')}
 </TabsTrigger>
 <TabsTrigger value="inbox" className={moduleTabsTriggerClass}>
 <Inbox className="h-4 w-4" />
 {t('module.factory.hqOrderReport')}
 {pendingCount > 0 && (
 <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
 {pendingCount}
 </span>)}
 </TabsTrigger>
 <TabsTrigger value="raw-materials" className={moduleTabsTriggerClass}>
 <PackageOpen className="h-4 w-4" /> {t('module.factory.rawMaterials')}
 </TabsTrigger>
 </TabsList>

 <TabsContent value="schedule" className="mt-4">
 <FactoryProductionSchedulePanel />
 </TabsContent>

 <TabsContent value="inbox" className="mt-4">
 <FactoryOrderInbox onOrdersChange={loadOrders} />
 </TabsContent>

 <TabsContent value="raw-materials" className="mt-4">
 <FactoryRawMaterialDashboard />
 </TabsContent>
 </Tabs>
 </ModuleLayout>);
}

