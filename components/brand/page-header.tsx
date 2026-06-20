import { cn } from '@/lib/utils';
import { BRAND_COLORS, COMPANY } from '@/lib/brand/company';

export function PageHeader({
  title,
  description,
  badge,
  className,
}: {
  title: string;
  description?: string;
  badge?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border px-5 py-5 md:px-6 md:py-6',
        className
      )}
      style={{
        borderColor: `${BRAND_COLORS.gold}55`,
        background: `linear-gradient(to bottom right, ${BRAND_COLORS.goldLight}, ${BRAND_COLORS.cream}, white)`,
      }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-2xl"
        style={{ backgroundColor: `${BRAND_COLORS.gold}33` }}
        aria-hidden
      />
      <div className="relative space-y-1">
        {badge && (
          <p className="text-xs font-bold uppercase tracking-wider text-primary/80">{badge}</p>
        )}
        <h2 className="text-2xl font-bold tracking-tight" style={{ color: BRAND_COLORS.black }}>
          {title}
        </h2>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{description}</p>
        )}
      </div>
    </div>
  );
}

export function BrandStatsStrip() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[
        { label: 'Ditubuhkan', value: String(COMPANY.founded) },
        { label: 'Cawangan', value: `${COMPANY.branchCount} kiosk` },
        { label: 'Wilayah', value: COMPANY.regions.join(' · ') },
        { label: 'Ibu Pejabat', value: 'Teluk Intan' },
      ].map((item) => (
        <div
          key={item.label}
          className="rounded-xl border bg-white/80 px-3 py-2.5 text-center backdrop-blur-sm"
          style={{ borderColor: `${BRAND_COLORS.gold}44` }}
        >
          <p className="text-lg font-bold text-primary">{item.value}</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
        </div>
      ))}
    </div>
  );
}
