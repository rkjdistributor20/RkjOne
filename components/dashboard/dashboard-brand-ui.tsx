import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { CalendarDays } from 'lucide-react';
import { BRAND_COLORS, COMPANY } from '@/lib/brand/company';
import { BrandMark } from '@/components/brand/brand-logo';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function dashboardTodayLabel() {
  return new Date().toLocaleDateString('ms-MY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

type DashboardHeroProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  variant?: 'premium' | 'warm';
  showLogo?: boolean;
  showDate?: boolean;
  className?: string;
};

/** Hero papan pemuka — emas · hitam · tradisi RKJ */
export function DashboardHero({
  title,
  subtitle,
  eyebrow,
  badges,
  actions,
  variant = 'premium',
  showLogo = true,
  showDate = true,
  className,
}: DashboardHeroProps) {
  const isPremium = variant === 'premium';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border shadow-lg',
        isPremium ? 'border-[#E5A812]/30 text-white' : 'border-[#E5A812]/40',
        className
      )}
      style={
        isPremium
          ? {
              background: `linear-gradient(135deg, ${BRAND_COLORS.black} 0%, ${BRAND_COLORS.blackSoft} 45%, #1a1508 100%)`,
            }
          : {
              background: `linear-gradient(to bottom right, ${BRAND_COLORS.goldLight}, ${BRAND_COLORS.cream}, white)`,
            }
      }
    >
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full blur-3xl"
        style={{ backgroundColor: `${BRAND_COLORS.gold}28` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-10 left-1/4 h-40 w-40 rounded-full blur-2xl"
        style={{ backgroundColor: `${BRAND_COLORS.goldBright}18` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `repeating-linear-gradient(-45deg, ${BRAND_COLORS.gold} 0, ${BRAND_COLORS.gold} 1px, transparent 0, transparent 50%)`,
          backgroundSize: '12px 12px',
        }}
        aria-hidden
      />

      <div className="relative flex flex-col gap-5 px-5 py-6 md:px-7 md:py-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
          {showLogo && (
            <BrandMark
              size={64}
              priority
              className={cn(
                'ring-2 shadow-xl',
                isPremium ? 'ring-[#E5A812]/50' : 'ring-[#E5A812]/35'
              )}
            />
          )}
          <div className="min-w-0 space-y-2">
            {eyebrow && (
              <p
                className={cn(
                  'text-xs font-bold uppercase tracking-[0.2em]',
                  isPremium ? 'text-[#F0C030]' : 'text-primary'
                )}
              >
                {eyebrow}
              </p>
            )}
            {badges && <div className="flex flex-wrap gap-2">{badges}</div>}
            <h1
              className={cn(
                'text-2xl font-bold tracking-tight md:text-3xl',
                !isPremium && 'text-[#141414]'
              )}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className={cn(
                  'max-w-2xl text-sm leading-relaxed md:text-base',
                  isPremium ? 'text-white/75' : 'text-muted-foreground'
                )}
              >
                {subtitle}
              </p>
            )}
            {showDate && (
              <p
                className={cn(
                  'flex items-center gap-1.5 text-xs',
                  isPremium ? 'text-white/45' : 'text-muted-foreground'
                )}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {dashboardTodayLabel()}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function HeroBadge({
  children,
  tone = 'gold',
}: {
  children: React.ReactNode;
  tone?: 'gold' | 'outline' | 'danger';
}) {
  if (tone === 'danger') {
    return <Badge variant="destructive">{children}</Badge>;
  }
  if (tone === 'outline') {
    return (
      <Badge variant="outline" className="border-white/25 bg-white/5 text-white/90">
        {children}
      </Badge>
    );
  }
  return (
    <Badge
      className="border-[#E5A812]/40 bg-[#E5A812]/20 text-[#FFF4D6] hover:bg-[#E5A812]/30"
    >
      {children}
    </Badge>
  );
}

export function BrandProductStrip({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border bg-white shadow-sm',
        compact ? 'p-3' : 'p-4 md:p-5'
      )}
      style={{ borderColor: `${BRAND_COLORS.gold}44` }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            4 Menu POS
          </p>
          {!compact && (
            <p className="text-sm text-muted-foreground">
              Produk ikonik {COMPANY.name} — resepi asal dapur kayu
            </p>
          )}
        </div>
        <Badge variant="outline" className="shrink-0 border-primary/30 text-primary">
          Sejak {COMPANY.founded}
        </Badge>
      </div>
      <div className={cn('grid gap-2', compact ? 'grid-cols-2 sm:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-4')}>
        {COMPANY.products.map((product) => (
          <div
            key={product.name}
            className="rounded-xl border bg-gradient-to-br from-[#FFF4D6]/40 to-white px-3 py-3 transition-colors hover:border-primary/40"
            style={{ borderColor: `${BRAND_COLORS.gold}33` }}
          >
            <p className="font-semibold text-[#141414]">{product.name}</p>
            {!compact && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {product.desc}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function QuickActionGrid({
  actions,
}: {
  actions: Array<{ label: string; href: string; icon: LucideIcon; description?: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="group flex items-start gap-3 rounded-xl border bg-card px-4 py-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          style={{ borderColor: `${BRAND_COLORS.gold}33` }}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-sm transition-colors group-hover:brightness-105"
            style={{
              backgroundColor: `${BRAND_COLORS.gold}22`,
              color: BRAND_COLORS.gold,
            }}
          >
            <action.icon className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{action.label}</p>
            {action.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{action.description}</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

export function DashboardAlert({
  children,
  tone = 'warning',
}: {
  children: React.ReactNode;
  tone?: 'warning' | 'info';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 text-sm',
        tone === 'warning'
          ? 'border-amber-200/80 bg-amber-50/90 text-amber-950'
          : 'border-[#E5A812]/30 bg-[#FFF4D6]/50 text-[#141414]'
      )}
    >
      {children}
    </div>
  );
}
