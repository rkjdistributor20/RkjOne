import { Skeleton } from '@/components/ui/skeleton';
import { ModuleLayout, KpiGrid, SectionCard } from '@/components/shared/module-ui';

export default function DashboardLoading() {
 return (
 <ModuleLayout>
 <div className="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
 <Skeleton className="h-4 w-32" />
 <Skeleton className="h-9 w-full max-w-md" />
 <Skeleton className="h-4 w-full max-w-2xl" />
 </div>

 <div className="grid gap-3 md:grid-cols-4">
 {Array.from({ length: 4 }).map((_, index) => (
 <Skeleton key={index} className="h-20 rounded-lg" />))}
 </div>

 <KpiGrid cols={4}>
 {Array.from({ length: 4 }).map((_, index) => (
 <Skeleton key={index} className="h-28 rounded-lg" />))}
 </KpiGrid>

 <div className="grid gap-4 lg:grid-cols-2">
 <SectionCard title="Memuatkan operasi" description="Dashboard sedang menyediakan data terkini.">
 <div className="space-y-3">
 <Skeleton className="h-5 w-44" />
 <Skeleton className="h-20 w-full" />
 <Skeleton className="h-20 w-full" />
 </div>
 </SectionCard>

 <SectionCard title="Memuatkan logistik" description="Status fleet dan tugasan sedang disemak.">
 <div className="flex flex-wrap gap-2">
 {Array.from({ length: 8 }).map((_, index) => (
 <Skeleton key={index} className="h-8 w-28 rounded-full" />))}
 </div>
 </SectionCard>
 </div>
 </ModuleLayout>);
}
