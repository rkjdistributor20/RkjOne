'use client';

import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/components/i18n/language-provider';
import type { Locale } from '@/lib/i18n/dictionary';

const options: Array<{ locale: Locale; short: string; labelKey: 'common.bahasaMalaysia' | 'common.english' }> = [
 { locale: 'ms', short: 'BM', labelKey: 'common.bahasaMalaysia' },
 { locale: 'en', short: 'EN', labelKey: 'common.english' },
];

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
 const { locale, setLocale, t } = useLanguage();

 return (
 <div
 className={cn(
 'inline-flex items-center gap-1 rounded-full border bg-background/80 p-1 shadow-sm',
 compact ? 'text-xs' : 'text-sm')}
 aria-label={t('common.language')}
 >
 {!compact && <Languages className="ml-2 h-4 w-4 text-muted-foreground" />}
 {options.map((option) => (
 <Button
 key={option.locale}
 type="button"
 variant={locale === option.locale ? 'default' : 'ghost'}
 size={compact ? 'sm' : 'default'}
 className={cn(
 'h-8 rounded-full px-3 font-semibold',
 locale === option.locale
 ? 'bg-[#e9b127] text-black hover:bg-[#d19a10]'
 : 'text-muted-foreground hover:text-foreground')}
 onClick={() => setLocale(option.locale)}
 title={t(option.labelKey)}
 >
 {option.short}
 </Button>
 ))}
 </div>);
}
