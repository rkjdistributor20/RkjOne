'use client';

import Link from 'next/link';
import {
 ArrowRight,
 BrainCircuit,
 Building2,
 CheckCircle2,
 LockKeyhole,
 Radar,
 ShieldCheck,
 Target,
} from 'lucide-react';
import type { UserRole } from '@/types/enums';
import type { DashboardStats } from '@/types/database';
import type { RoleWorkflow } from '@/lib/dashboard/role-workflows';
import { buildRoleCockpit, type RoleCockpitSignal } from '@/lib/dashboard/role-cockpit';
import { useLanguage } from '@/components/i18n/language-provider';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { SectionCard } from '@/components/shared/module-ui';
import { translateLegacyUiText } from '@/lib/i18n/legacy-ui-text';
import { cn } from '@/lib/utils';

const SIGNAL_TONES: Record<RoleCockpitSignal['tone'], string> = {
 default: 'border-border bg-muted/25 text-foreground',
 success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
 warning: 'border-amber-300 bg-amber-50 text-amber-950',
 danger: 'border-red-200 bg-red-50 text-red-950',
};

export function RoleProactiveCockpit({
 role,
 workflow,
 legalEntityCode,
 stats,
 branchCount,
 specialAssignmentCount,
}: {
 role: UserRole;
 workflow: RoleWorkflow;
 legalEntityCode?: string | null;
 stats?: DashboardStats | null;
 branchCount?: number | null;
 specialAssignmentCount?: number;
}) {
 const cockpit = buildRoleCockpit({
 role,
 workflow,
 legalEntityCode,
 stats,
 branchCount,
 specialAssignmentCount,
 });
 const { locale } = useLanguage();
 const ui = (text: string) => translateLegacyUiText(text, locale);
 const primaryHref = cockpit.actions[0]?.href ?? '/dashboard';

 return (
 <SectionCard
 title={ui('AI Proactive Cockpit')}
 description={ui('Dashboard ini disusun ikut role, syarikat, cawangan dan tugasan sebenar pengguna.')}
 action={
 <Link href={primaryHref} className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}>
 {ui('Buka Fokus Utama')}
 </Link>
 }
 >
 <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
 <div className="rounded-lg border border-amber-200/70 bg-gradient-to-br from-white via-amber-50/35 to-emerald-50/45 p-4 shadow-sm">
 <div className="flex flex-wrap items-center gap-2">
 <Badge variant="secondary" className="gap-1">
 <BrainCircuit className="h-3.5 w-3.5" />
 {ui(cockpit.focusMode)}
 </Badge>
 <Badge variant="outline" className="gap-1">
 <Building2 className="h-3.5 w-3.5" />
 {ui(cockpit.companyScope)}
 </Badge>
 </div>
 <h3 className="mt-3 text-lg font-semibold tracking-tight text-foreground">{ui(cockpit.title)}</h3>
 <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{ui(cockpit.subtitle)}</p>

 <div className="mt-4 space-y-2">
 <div className="rounded-lg border bg-white/85 p-3 shadow-sm">
 <p className="flex items-start gap-2 text-sm leading-relaxed">
 <Radar className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
 <span>{ui(cockpit.prediction)}</span>
 </p>
 </div>
 <div className="rounded-lg border border-dashed bg-white/70 p-3">
 <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
 <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
 <span>{ui(cockpit.boundary)}</span>
 </p>
 </div>
 </div>
 </div>

 <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
 <div className="rounded-lg border bg-white/90 p-3 shadow-sm">
 <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
 <ShieldCheck className="h-4 w-4 text-primary" />
 {ui('Signal Hari Ini')}
 </p>
 <div className="grid gap-2">
 {cockpit.signals.map((signal) => (
 <Link
 key={`${signal.label}-${signal.href}`}
 href={signal.href}
 className={cn(
 'rounded-lg border p-2.5 transition hover:border-amber-300 hover:shadow-sm',
 SIGNAL_TONES[signal.tone])}
 >
 <div className="flex items-center justify-between gap-2">
 <span className="text-xs font-semibold">{ui(signal.label)}</span>
 <span className="text-sm font-bold tabular-nums">{signal.value}</span>
 </div>
 <p className="mt-1 text-[11px] leading-relaxed opacity-80">{ui(signal.description)}</p>
 </Link>))}
 </div>
 </div>

 <div className="rounded-lg border bg-white/90 p-3 shadow-sm">
 <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
 <Target className="h-4 w-4 text-primary" />
 {ui('Tindakan Seterusnya')}
 </p>
 <div className="grid gap-2">
 {cockpit.actions.map((action, index) => (
 <Link
 key={`${action.title}-${action.href}`}
 href={action.href}
 className="group grid gap-2 rounded-lg border bg-white p-2.5 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/35 sm:grid-cols-[auto_1fr_auto] sm:items-center"
 >
 <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
 {index + 1}
 </div>
 <div className="min-w-0">
 <p className="text-sm font-semibold text-foreground">{ui(action.title)}</p>
 <p className="text-xs leading-relaxed text-muted-foreground">{ui(action.description)}</p>
 </div>
 <div className="flex items-center justify-between gap-2">
 <Badge variant={index === 0 ? 'default' : 'outline'} className="text-[11px]">
 {ui(action.badge)}
 </Badge>
 {index === 0 ? (
 <CheckCircle2 className="h-4 w-4 text-primary" />
 ) : (
 <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
 )}
 </div>
 </Link>))}
 </div>
 </div>
 </div>
 </div>
 </SectionCard>);
}
