'use client';

import Link from 'next/link';
import {
 AlertTriangle,
 ArrowRight,
 CheckCircle2,
 Info,
 Sparkles,
 TrendingUp,
} from 'lucide-react';
import type { AmInsight, AmInsightsSummary } from '@/lib/dashboard/am-insights';
import { BRAND_COLORS } from '@/lib/brand/company';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SEVERITY_STYLES = {
 critical: {
 border: 'border-red-200 bg-red-50/80',
 icon: AlertTriangle,
 iconClass: 'text-red-600',
 badge: 'destructive' as const,
 },
 warning: {
 border: 'border-amber-200 bg-amber-50/80',
 icon: AlertTriangle,
 iconClass: 'text-amber-700',
 badge: 'secondary' as const,
 },
 info: {
 border: 'border-sky-200 bg-sky-50/60',
 icon: Info,
 iconClass: 'text-sky-700',
 badge: 'outline' as const,
 },
 success: {
 border: 'border-emerald-200 bg-emerald-50/70',
 icon: CheckCircle2,
 iconClass: 'text-emerald-700',
 badge: 'outline' as const,
 },
};

const CATEGORY_LABELS = {
 sales: 'Jualan',
 stock: 'Stok',
 shift: 'Syif',
 staff: 'Staf',
 approval: 'Kelulusan',
 ops: 'Operasi',
};

interface AmInsightsPanelProps {
 insights: AmInsight[];
 summary: AmInsightsSummary;
}

export function AmInsightsPanel({ insights, summary }: AmInsightsPanelProps) {
 return (
 <section
 className="overflow-hidden rounded-2xl border shadow-sm"
 style={{
 borderColor: `${BRAND_COLORS.gold}44`,
 background: `linear-gradient(to bottom right, ${BRAND_COLORS.goldLight}88, white, ${BRAND_COLORS.cream})`,
 }}
 >
 <div
 className="flex flex-col gap-4 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
 style={{ borderColor: `${BRAND_COLORS.gold}33` }}
 >
 <div className="flex gap-3">
 <div
 className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#141414] shadow-md"
 style={{ backgroundColor: BRAND_COLORS.gold }}
 >
 <Sparkles className="h-5 w-5" />
 </div>
 <div>
 <p className="text-xs font-semibold uppercase tracking-wider text-primary">
 Bantuan AI Pengurus Kawasan
 </p>
 <h2 className="text-lg font-bold text-[#141414]">{summary.headline}</h2>
 <p className="mt-0.5 text-sm text-muted-foreground">
 Analisis automatik jualan, stok, syif & kehadiran staf - tindakan disyorkan ikut
 keutamaan.
 </p>
 </div>
 </div>
 <div className="flex flex-wrap gap-2">
 {summary.critical > 0 && (
 <Badge variant="destructive">{summary.critical} Kritikal</Badge>)}
 {summary.warning > 0 && (
 <Badge variant="secondary">{summary.warning} Perhatian</Badge>)}
 {summary.info > 0 && (
 <Badge variant="outline" className="border-sky-300 text-sky-800">
 {summary.info} Cadangan
 </Badge>)}
 </div>
 </div>

 <ul className="divide-y" style={{ borderColor: `${BRAND_COLORS.gold}22` }}>
 {insights.map((item) => {
 const style = SEVERITY_STYLES[item.severity];
 const Icon = style.icon;
 return (
 <li
 key={item.id}
 className={cn(
 'flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between',
 style.border,
 'border-x-0 border-t-0 border-b last:border-b-0')}
 >
 <div className="flex min-w-0 gap-3">
 <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', style.iconClass)} />
 <div className="min-w-0">
 <div className="flex flex-wrap items-center gap-2">
 <p className="font-semibold text-foreground">{item.title}</p>
 <Badge variant={style.badge} className="text-[10px] uppercase">
 {CATEGORY_LABELS[item.category]}
 </Badge>
 </div>
 <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
 {item.message}
 </p>
 </div>
 </div>
 {item.action_href && item.action_label && (
 <Link
 href={item.action_href}
 className={cn(
 buttonVariants({ size: 'sm', variant: 'outline' }),
 'shrink-0 gap-1 self-start border-primary/30 bg-white/90 hover:bg-[#FFF4D6]/50')}
 >
 {item.action_label}
 <ArrowRight className="h-3.5 w-3.5" />
 </Link>)}
 </li>);
 })}
 </ul>

 <div
 className="flex items-center gap-2 border-t px-5 py-2.5 text-xs text-muted-foreground"
 style={{
 borderColor: `${BRAND_COLORS.gold}33`,
 backgroundColor: `${BRAND_COLORS.goldLight}55`,
 }}
 >
 <TrendingUp className="h-3.5 w-3.5 text-primary" />
 AI rule-based - dikemas kini setiap kali papan pemuka dimuatkan
 </div>
 </section>);
}
