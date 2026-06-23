import { BrandMark } from '@/components/brand/brand-logo';
import { cn } from '@/lib/utils';

/** Logo rasmi RKJ — dikongsi ketiga-tiga syarikat undang-undang kumpulan */
export function LegalEntityLogo({
  size = 40,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <BrandMark
      size={size}
      priority={priority}
      className={cn('shrink-0 shadow-sm ring-2 ring-[#E5A812]/40', className)}
    />
  );
}
