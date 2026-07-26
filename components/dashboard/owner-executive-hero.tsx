'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Crown, Package, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import type { DashboardStats } from '@/types/database';
import { COMPANY } from '@/lib/brand/company';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatRM } from '@/components/shared/module-ui';
import { DashboardHero, HeroBadge } from '@/components/dashboard/dashboard-brand-ui';
import { useLanguage } from '@/components/i18n/language-provider';

function OwnerHeroMetric({
 label,
 value,
 note,
 icon: Icon,
 tone = 'gold',
}: {
 label: string;
 value: string;
 note: string;
 icon: LucideIcon;
 tone?: 'gold' | 'green' | 'blue' | 'red';
}) {
 const toneClass = {
 gold: 'border-[#E5A812]/25 bg-[#E5A812]/12 text-[#FFE39A]',
 green: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
 blue: 'border-sky-300/20 bg-sky-400/10 text-sky-100',
 red: 'border-rose-300/25 bg-rose-400/10 text-rose-100',
 }[tone];

 return (
 <div className={cn('rounded-lg border p-3.5 shadow-sm backdrop-blur-sm', toneClass)}>
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0">
 <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
 {label}
 </p>
 <p className="mt-1 text-xl font-bold leading-tight text-white md:text-2xl">{value}</p>
 </div>
 <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-current">
 <Icon className="h-4 w-4" strokeWidth={2} />
 </span>
 </div>
 <p className="mt-2 text-xs leading-relaxed text-white/60">{note}</p>
 </div>);
}

type OwnerExecutiveHeroProps = {
 profileName: string;
 stats: DashboardStats | null;
};

export function OwnerExecutiveHero({
 profileName,
 stats,
}: OwnerExecutiveHeroProps) {
 const { locale, t } = useLanguage();
 const statsUnavailable = stats === null;
 const firstName = profileName.split(' ')[0] ?? 'Owner';
 const pendingApprovals = statsUnavailable ? 0 : stats!.pending_approvals ?? 0;
 const dateLocale = locale === 'en' ? 'en-MY' : 'ms-MY';
 const criticalStock = statsUnavailable ? 0 : stats!.critical_stock_count ?? 0;

 return (
 <DashboardHero
 variant="premium"
 dateLocale={dateLocale}
 eyebrow={t('owner.hero.eyebrow')}
 title={`${t('layout.greeting')}, ${firstName}`}
 subtitle={`${t('owner.hero.subtitlePrefix')} ${COMPANY.branchCount} ${t('owner.hero.subtitleSuffix')}`}
 badges={
 <>
 <HeroBadge>
 <span className="inline-flex items-center gap-1">
 <Crown className="h-3 w-3" />
 {t('role.SUPER_ADMIN')}
 </span>
 </HeroBadge>
 <HeroBadge tone="outline">3 {t('owner.hero.companies')}</HeroBadge>
 <HeroBadge tone="outline">{COMPANY.branchCount} {t('owner.hero.kiosks')}</HeroBadge>
 <HeroBadge tone="outline">{t('owner.hero.badgeControl')}</HeroBadge>
 </>
 }
 actions={
 <Link
 href="/reports"
 className={cn(
 buttonVariants({ size: 'sm' }),
 'border border-[#E5A812]/50 bg-[#E5A812] text-[#141414] shadow-md hover:bg-[#F0C030]')}
 >
 <Sparkles className="mr-1.5 h-4 w-4" />
 {t('owner.hero.openReport')}
 </Link>
 }
 >
 <div className="grid gap-3 pt-5 sm:grid-cols-2 xl:grid-cols-4">
 <OwnerHeroMetric
 label={t('owner.hero.salesToday')}
 value={statsUnavailable ? '-' : formatRM(stats!.sales_today ?? 0)}
 note={t('owner.hero.salesNote')}
 icon={TrendingUp}
 tone="gold"
 />
 <OwnerHeroMetric
 label={locale === 'en' ? 'Sales This Week' : 'Jualan Minggu Ini'}
 value={statsUnavailable ? '-' : formatRM(stats!.sales_this_week ?? 0)}
 note={locale === 'en' ? 'Current group performance' : 'Prestasi semasa kumpulan'}
 icon={TrendingUp}
 tone="green"
 />
 <OwnerHeroMetric
 label={locale === 'en' ? 'Critical Stock' : 'Stok Kritikal'}
 value={statsUnavailable ? '-' : String(criticalStock)}
 note={criticalStock > 0
 ? (locale === 'en' ? 'Immediate action required' : 'Perlu tindakan segera')
 : (locale === 'en' ? 'No critical stock alert' : 'Tiada amaran stok kritikal')}
 icon={Package}
 tone={criticalStock > 0 ? 'red' : 'blue'}
 />
 <OwnerHeroMetric
 label={t('owner.hero.pendingDecision')}
 value={statsUnavailable ? '-' : String(pendingApprovals)}
 note={
 pendingApprovals > 0
 ? t('owner.hero.pendingNoteActive')
 : t('owner.hero.pendingNoteClear')
 }
 icon={pendingApprovals > 0 ? AlertTriangle : ShieldCheck}
 tone={pendingApprovals > 0 ? 'red' : 'green'}
 />
 </div>
 <p className="mt-4 max-w-4xl text-xs leading-relaxed text-[#F7EBD0]/60">
 {t('owner.hero.groupNote')} {t('owner.hero.footerNote')}
 </p>
 </DashboardHero>);
}
