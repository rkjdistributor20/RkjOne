import Image from 'next/image';
import { cn } from '@/lib/utils';
import { COMPANY, OFFICIAL_LOGO_PATH } from '@/lib/brand/company';

export { OFFICIAL_LOGO_PATH };

type BrandLogoProps = {
 size?: 'sm' | 'md' | 'lg' | 'xl';
 showText?: boolean;
 layout?: 'compact' | 'sign' | 'mark';
 variant?: 'light' | 'dark' | 'color';
 className?: string;
};

const sizes = {
 sm: { img: 40, title: 'text-sm', sub: 'text-[10px]' },
 md: { img: 52, title: 'text-base', sub: 'text-xs' },
 lg: { img: 72, title: 'text-xl', sub: 'text-sm' },
 xl: { img: 120, title: 'text-2xl', sub: 'text-sm' },
};

export function BrandMark({
 size = 52,
 className,
 priority = false,
}: {
 size?: number;
 className?: string;
 priority?: boolean;
}) {
 return (
 <div
 className={cn(
 'relative shrink-0 overflow-hidden rounded-full bg-white shadow-md ring-2 ring-white/90',
 className)}
 style={{ width: size, height: size }}
 >
 <Image
 src={OFFICIAL_LOGO_PATH}
 alt={COMPANY.name}
 width={size}
 height={size}
 priority={priority}
 className="h-full w-full object-cover"
 />
 </div>);
}

export function BrandSign({
 className,
 width = 200,
 priority = false,
}: {
 className?: string;
 width?: number;
 priority?: boolean;
}) {
 return (
 <div className={cn('flex flex-col items-start gap-3', className)}>
 <BrandMark size={width} priority={priority} className="shadow-xl ring-4 ring-white/20" />
 <p className="text-xs font-semibold uppercase tracking-widest text-[#FFD100]">
 Sejak {COMPANY.founded} - Resepi asal dapur kayu
 </p>
 </div>);
}

export function BrandLogo({
 size = 'md',
 showText = true,
 layout = 'compact',
 variant = 'color',
 className,
}: BrandLogoProps) {
 const s = sizes[size];

 if (layout === 'sign') {
 return (
 <BrandSign
 width={size === 'xl' ? 140 : size === 'lg' ? 120 : 100}
 priority
 className={className}
 />);
 }

 if (layout === 'mark') {
 return <BrandMark size={s.img} className={className} priority />;
 }

 const textClass =
 variant === 'light'
 ? 'text-white'
 : variant === 'dark'
 ? 'text-[var(--foreground)]'
 : 'text-[var(--foreground)]';
 const subClass =
 variant === 'light' ? 'text-yellow-100/85' : 'text-muted-foreground';

 return (
 <div className={cn('flex items-center gap-3', className)}>
 <BrandMark size={s.img} />
 {showText && (
 <div className="min-w-0">
 <p className={cn('font-bold leading-tight tracking-tight', s.title, textClass)}>
 {COMPANY.systemName}
 </p>
 <p className={cn('truncate font-medium', s.sub, subClass)}>
 {COMPANY.name}
 </p>
 </div>)}
 </div>);
}
