import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRAND_COLORS } from '@/lib/brand/company';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { ComponentProps, ReactNode } from 'react';

/** Wrapper konsisten untuk semua halaman modul */
export function ModuleLayout({
 children,
 className,...props
}: ComponentProps<'div'>) {
 return (
 <div className={cn('rkj-dashboard-shell', className)} {...props}>
 {children}
 </div>);
}

/** Header modul - tajuk, penerangan, ikon, tindakan */
export function ModuleHeader({
 title,
 description,
 icon: Icon,
 actions,
 badges,
}: {
 title: string;
 description?: string;
 icon?: LucideIcon;
 actions?: React.ReactNode;
 badges?: React.ReactNode;
}) {
 return (
 <div className="rkj-surface relative overflow-hidden rounded-lg px-5 py-5 md:px-6 md:py-6">
 <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-emerald-500 to-sky-500" />
 <div className="pointer-events-none absolute inset-0 rkj-panel-head" aria-hidden />
 <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
 <div className="flex gap-4">
 {Icon && (
 <div
 className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-amber-200/70 bg-white shadow-sm"
 style={{
 color: BRAND_COLORS.gold,
 }}
 >
 <Icon className="h-6 w-6" strokeWidth={2} />
 </div>)}
 <div className="min-w-0 space-y-1">
 <h1 className="text-xl font-semibold tracking-tight text-stone-950 md:text-2xl">{title}</h1>
 {description && (
 <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
 {description}
 </p>)}
 {badges && <div className="flex flex-wrap gap-2 pt-1">{badges}</div>}
 </div>
 </div>
 {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
 </div>
 </div>);
}

/** Kad KPI ringkas - aksen emas RKJ */
export function KpiCard({
 title,
 value,
 description,
 icon: Icon,
 variant = 'default',
 className,
}: {
 title: string;
 value: React.ReactNode;
 description?: string;
 icon?: LucideIcon;
 variant?: 'default' | 'warning' | 'danger' | 'success';
 className?: string;
}) {
 const tones = {
 default: { icon: 'text-primary bg-primary/10', accent: BRAND_COLORS.gold },
 warning: { icon: 'text-orange-600 bg-orange-50', accent: '#EA580C' },
 danger: { icon: 'text-red-600 bg-red-50', accent: '#DC2626' },
 success: { icon: 'text-emerald-700 bg-emerald-50', accent: '#059669' },
 };
 const tone = tones[variant];

 return (
 <div
 className={cn(
 'rkj-surface relative overflow-hidden rounded-lg p-4 transition-all hover:border-amber-300/70 hover:shadow-md',
 className)}
 >
 <div
 className="absolute inset-x-0 top-0 h-1 opacity-90"
 style={{ backgroundColor: tone.accent }}
 />
 <div className="flex items-start justify-between gap-2 pt-1">
 <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
 {title}
 </p>
 {Icon && (
 <div className={cn('rounded-lg border border-current/10 p-2', tone.icon)}>
 <Icon className="h-4 w-4" />
 </div>)}
 </div>
 <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-stone-950">
 {value}
 </p>
 {description && (
 <p className="mt-1 text-xs text-muted-foreground">{description}</p>)}
 </div>);
}

export function KpiGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 }) {
 const gridCols = {
 2: 'sm:grid-cols-2',
 3: 'sm:grid-cols-2 lg:grid-cols-3',
 4: 'sm:grid-cols-2 lg:grid-cols-4',
 5: 'sm:grid-cols-2 lg:grid-cols-5',
 };
 return <div className={cn('grid gap-3', gridCols[cols])}>{children}</div>;
}

/** Keadaan kosong profesional */
export function EmptyState({
 icon: Icon,
 title,
 description,
 action,
}: {
 icon?: LucideIcon;
 title: string;
 description?: string;
 action?: React.ReactNode;
}) {
 return (
 <div className="rkj-surface flex flex-col items-center justify-center rounded-lg border-dashed px-6 py-14 text-center">
 {Icon && (
 <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg border bg-amber-50 text-amber-700">
 <Icon className="h-7 w-7" />
 </div>)}
 <p className="text-base font-semibold">{title}</p>
 {description && (
 <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>)}
 {action && <div className="mt-4">{action}</div>}
 </div>);
}

/** Panel kandungan dengan tajuk */
export function SectionCard({
 title,
 description,
 children,
 className,
 action,
}: {
 title?: ReactNode;
 description?: string;
 children: React.ReactNode;
 className?: string;
 action?: React.ReactNode;
}) {
 return (
 <div className={cn('rkj-surface overflow-hidden rounded-lg', className)}>
 {(title || action) && (
 <div
 className="rkj-panel-head flex items-start justify-between gap-3 border-b border-amber-100/80 px-4 py-3.5 md:px-5"
 >
 <div>
 {title && <h3 className="font-semibold text-stone-950">{title}</h3>}
 {description && (
 <p className="text-xs text-muted-foreground">{description}</p>)}
 </div>
 {action}
 </div>)}
 <div className="p-4 md:p-5">{children}</div>
 </div>);
}

/** Kelas Tailwind konsisten untuk Tabs shadcn */
export const moduleTabsListClass =
 'flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg border bg-white/80 p-1 shadow-sm';

export const moduleTabsTriggerClass =
 'gap-1.5 rounded-md data-[state=active]:bg-amber-400 data-[state=active]:text-stone-950 data-[state=active]:shadow-sm';

/** Skeleton loading modul */
export function ModuleLoading({ rows = 3 }: { rows?: number }) {
 return (
 <div className="space-y-3">
 <Skeleton className="h-28 w-full rounded-2xl" />
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
 {Array.from({ length: 4 }).map((_, i) => (
 <Skeleton key={i} className="h-24 rounded-xl" />))}
 </div>
 <Skeleton className="h-64 w-full rounded-xl" />
 {rows > 1 && <Skeleton className="h-48 w-full rounded-xl" />}
 </div>);
}

/** Format RM standard */
export function formatRM(amount: number) {
 return `RM ${amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`;
}

/** Butang tindakan utama (emas RKJ) */
export function PrimaryActionButton(props: ComponentProps<typeof Button>) {
 return (
 <Button
 className="bg-amber-500 text-stone-950 shadow-sm hover:bg-amber-400"
 {...props}
 />);
}

/** Baris senarai rekod */
export function RecordRow({
 children,
 className,
}: {
 children: React.ReactNode;
 className?: string;
}) {
 return (
 <div
 className={cn(
 'rkj-surface flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm transition-colors hover:bg-amber-50/30',
 className)}
 >
 {children}
 </div>);
}

/** Prompt pilih cawangan */
export function BranchRequiredPrompt({ message }: { message?: string }) {
 return (
 <EmptyState
 title="Pilih cawangan dahulu"
 description={
 message ??
 'Sila pilih cawangan dari senarai di atas untuk melihat data modul ini.'
 }
 />);
}
