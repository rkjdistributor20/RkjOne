import Link from 'next/link';
import {
 ArrowRight,
 Banknote,
 CalendarClock,
 CheckCircle2,
 ClipboardList,
 Factory,
 Landmark,
 Package,
 ShieldCheck,
 ShoppingCart,
 Store,
 Truck,
 Users,
 Wrench,
 type LucideIcon,
} from 'lucide-react';
import type { RoleWorkflow } from '@/lib/dashboard/role-workflows';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { SectionCard } from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';

const MODULE_ICONS: Record<string, LucideIcon> = {
 Dashboard: ClipboardList,
 'Dashboard Kawasan': ClipboardList,
 'Papan Pemuka': ClipboardList,
 POS: ShoppingCart,
 Inventori: Package,
 Maintenance: Wrench,
 Syif: CalendarClock,
 'Jadual Saya': CalendarClock,
 'HR Syarikat': Users,
 Gaji: Banknote,
 Kewangan: Landmark,
 Reconciliation: Landmark,
 Laporan: ClipboardList,
 Kelulusan: CheckCircle2,
 Kilang: Factory,
 Warehouse: Factory,
 Logistik: Truck,
 POD: Truck,
 'Portal Ejen': Store,
 Order: Store,
 Bayaran: Banknote,
 'Outlet/POS': Store,
 Tetapan: ShieldCheck,
 Governance: ShieldCheck,
 'Perancangan AM': CalendarClock,
};

export function WorkflowSopPanel({ workflow }: { workflow: RoleWorkflow }) {
 const primaryHref = workflow.steps[0]?.href ?? '/dashboard';

 return (
 <SectionCard
 title="Aliran Kerja & SOP Harian"
 description={`${workflow.label} - ${workflow.companyScope}`}
 action={
 <Link href={primaryHref} className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}>
 Buka Tugasan
 </Link>
 }
 >
 <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
 <div className="rounded-xl border bg-muted/20 p-4">
 <Badge variant="secondary" className="mb-3 gap-1">
 <ShieldCheck className="h-3.5 w-3.5" />
 SOP Role
 </Badge>
 <h3 className="text-base font-semibold text-foreground">{workflow.primaryObjective}</h3>
 <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
 {workflow.sopSummary}
 </p>
 </div>

 <div className="grid gap-2">
 {workflow.steps.map((step, index) => {
 const Icon = MODULE_ICONS[step.module] ?? ClipboardList;
 return (
 <Link
 key={`${step.title}-${step.href}`}
 href={step.href}
 className="group grid gap-3 rounded-xl border bg-background p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md sm:grid-cols-[auto_1fr_auto] sm:items-center"
 >
 <div className="flex items-center gap-3">
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Icon className="h-4 w-4" />
 </div>
 <div className="min-w-0 sm:hidden">
 <p className="text-sm font-semibold text-foreground">{index + 1}. {step.title}</p>
 <p className="text-xs text-muted-foreground">{step.module} - {step.cadence}</p>
 </div>
 </div>
 <div className="hidden min-w-0 sm:block">
 <p className="text-sm font-semibold text-foreground">{index + 1}. {step.title}</p>
 <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
 </div>
 <div className="flex items-center justify-between gap-2 sm:justify-end">
 <Badge variant="outline" className="text-[11px]">{step.cadence}</Badge>
 <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
 </div>
 <p className="text-xs leading-relaxed text-muted-foreground sm:hidden">{step.description}</p>
 </Link>);
 })}
 </div>
 </div>
 </SectionCard>);
}
