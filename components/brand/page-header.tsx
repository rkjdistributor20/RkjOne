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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: 'Ditubuhkan', value: String(COMPANY.founded), hint: 'Teluk Intan' },
        { label: 'Cawangan', value: `${COMPANY.branchCount}`, hint: 'kiosk aktif' },
        {
          label: 'Wilayah',
          value: String(COMPANY.regions.length),
          hint: COMPANY.regions.join(' · '),
        },
        { label: 'Tagline', value: 'Tradisi', hint: COMPANY.tagline },
      ].map((item) => (
        <div
          key={item.label}
          className="group relative overflow-hidden rounded-xl border bg-white/90 px-3 py-3 text-center shadow-sm transition-shadow hover:shadow-md"
          style={{ borderColor: `${BRAND_COLORS.gold}44` }}
        >
          <div
            className="absolute inset-x-0 top-0 h-0.5 opacity-80 transition-opacity group-hover:opacity-100"
            style={{ backgroundColor: BRAND_COLORS.gold }}
          />
          <p className="text-xl font-bold tabular-nums text-[#141414]">{item.value}</p>
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
            {item.label}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.hint}</p>
        </div>
      ))}
    </div>
  );
}
