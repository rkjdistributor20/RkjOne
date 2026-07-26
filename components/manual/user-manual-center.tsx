'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
 AlertTriangle,
 ArrowRight,
 BookOpen,
 BriefcaseBusiness,
 CheckCircle2,
 CircleHelp,
 ClipboardCheck,
 ExternalLink,
 FileWarning,
 ListChecks,
 Search,
 ShieldCheck,
 Sparkles,
 UserRoundCheck,
 UsersRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
 ModuleHeader,
 ModuleLayout,
 SectionCard,
 SecondarySection,
} from '@/components/shared/module-ui';
import { useLanguage } from '@/components/i18n/language-provider';
import { useAuthStore } from '@/stores/auth-store';
import { getVisibleNavItems } from '@/lib/auth/permissions';
import {
 COMMON_SOP,
 MANUAL_FAQ,
 MODULE_GUIDES,
 ROLE_GUIDES,
 type LocalizedText,
 type ModuleGuide,
 type RoleGuide,
} from '@/lib/manual/content';
import type { UserRole } from '@/types/enums';

function localize(value: LocalizedText, locale: 'ms' | 'en') {
 return value[locale];
}

function orderedRoleGuides(currentRole: UserRole | undefined) {
 return [...ROLE_GUIDES].sort((a, b) => {
 if (a.role === currentRole) return -1;
 if (b.role === currentRole) return 1;
 return localize(a.title, 'ms').localeCompare(localize(b.title, 'ms'));
 });
}

function NumberedSteps({
 steps,
 locale,
}: {
 steps: LocalizedText[];
 locale: 'ms' | 'en';
}) {
 return (
 <ol className="space-y-2.5">
 {steps.map((step, index) => (
 <li key={`${step.ms}-${index}`} className="flex gap-3 text-sm leading-6 text-stone-700">
 <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-900">
 {index + 1}
 </span>
 <span>{localize(step, locale)}</span>
 </li>
 ))}
 </ol>
 );
}

function RoleGuideCard({
 guide,
 locale,
 isCurrent,
}: {
 guide: RoleGuide;
 locale: 'ms' | 'en';
 isCurrent?: boolean;
}) {
 return (
 <div className={isCurrent ? 'rounded-lg ring-2 ring-amber-400 ring-offset-2' : ''}>
 <SecondarySection
 title={localize(guide.title, locale)}
 description={localize(guide.purpose, locale)}
 defaultOpen={isCurrent}
 >
 <div className="grid gap-5 lg:grid-cols-2">
 <div>
 <div className="mb-3 flex items-center gap-2">
 <BriefcaseBusiness className="h-4 w-4 text-amber-700" />
 <h4 className="font-semibold text-stone-950">
 {locale === 'ms' ? 'Tanggungjawab utama' : 'Core responsibilities'}
 </h4>
 </div>
 <ul className="space-y-2.5">
 {guide.responsibilities.map((item, index) => (
 <li key={`${item.ms}-${index}`} className="flex gap-2.5 text-sm leading-6 text-stone-700">
 <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
 <span>{localize(item, locale)}</span>
 </li>
 ))}
 </ul>
 </div>
 <div>
 <div className="mb-3 flex items-center gap-2">
 <ListChecks className="h-4 w-4 text-amber-700" />
 <h4 className="font-semibold text-stone-950">
 {locale === 'ms' ? 'SOP kerja harian' : 'Daily work SOP'}
 </h4>
 </div>
 <NumberedSteps steps={guide.dailySop} locale={locale} />
 </div>
 </div>
 <div className="flex gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm leading-6 text-orange-950">
 <AlertTriangle className="mt-1 h-4 w-4 shrink-0" />
 <div>
 <span className="font-semibold">
 {locale === 'ms' ? 'Bila perlu eskalasi: ' : 'When to escalate: '}
 </span>
 {localize(guide.escalation, locale)}
 </div>
 </div>
 </SecondarySection>
 </div>
 );
}

function ModuleGuideCard({
 guide,
 locale,
 isFallback,
}: {
 guide: ModuleGuide;
 locale: 'ms' | 'en';
 isFallback?: boolean;
}) {
 return (
 <div className="rkj-surface flex h-full flex-col rounded-lg p-4">
 <div className="flex items-start justify-between gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
 <BookOpen className="h-5 w-5" />
 </div>
 {isFallback && (
 <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-800">
 {locale === 'ms' ? 'Semakan kandungan diperlukan' : 'Content review needed'}
 </Badge>
 )}
 </div>
 <h3 className="mt-3 font-semibold text-stone-950">{localize(guide.title, locale)}</h3>
 <p className="mt-1 text-sm leading-6 text-muted-foreground">
 {localize(guide.summary, locale)}
 </p>
 <div className="mt-4">
 <NumberedSteps steps={guide.steps} locale={locale} />
 </div>
 <div className="mt-auto pt-4">
 <Button
 render={<Link href={guide.href} />}
 variant="outline"
 className="w-full justify-between"
 >
 {locale === 'ms' ? 'Buka modul' : 'Open module'}
 <ArrowRight className="h-4 w-4" />
 </Button>
 </div>
 </div>
 );
}

export function UserManualCenter() {
 const { locale } = useLanguage();
 const profile = useAuthStore((state) => state.profile);
 const branch = useAuthStore((state) => state.branch);
 const permissions = useAuthStore((state) => state.permissions);
 const [query, setQuery] = useState('');

 const visibleNavItems = useMemo(
 () => profile ? getVisibleNavItems(profile.role, permissions, profile) : [],
 [permissions, profile]);

 const currentRoleGuide = ROLE_GUIDES.find((guide) => guide.role === profile?.role);
 const normalizedQuery = query.trim().toLocaleLowerCase(locale === 'ms' ? 'ms-MY' : 'en-MY');

 const visibleModuleGuides = useMemo(() => visibleNavItems
 .filter((item) => item.href !== '/manual')
 .map((item) => {
 const detailed = MODULE_GUIDES.find((guide) => guide.href === item.href);
 if (detailed) return { guide: detailed, isFallback: false };
 return {
 isFallback: true,
 guide: {
 href: item.href,
 title: { ms: item.label, en: item.label },
 summary: {
 ms: 'Modul aktif dalam akses anda. Ikut arahan pada skrin dan sahkan data sebelum menyimpan.',
 en: 'An active module within your access. Follow on-screen instructions and verify data before saving.',
 },
 steps: [
 {
 ms: 'Pastikan syarikat, lokasi dan rekod yang dipilih adalah betul.',
 en: 'Confirm the selected company, location and record are correct.',
 },
 {
 ms: 'Semak semua medan dan bukti sebelum menyimpan.',
 en: 'Review all fields and evidence before saving.',
 },
 {
 ms: 'Jika tidak pasti, berhenti dan rujuk penyelia modul.',
 en: 'If unsure, stop and consult the module supervisor.',
 },
 ],
 },
 };
 }), [visibleNavItems]);

 const filteredModules = visibleModuleGuides.filter(({ guide }) => {
 if (!normalizedQuery) return true;
 return [
 localize(guide.title, locale),
 localize(guide.summary, locale),
 ...guide.steps.map((step) => localize(step, locale)),
 ].join(' ').toLocaleLowerCase(locale === 'ms' ? 'ms-MY' : 'en-MY').includes(normalizedQuery);
 });

 const filteredRoles = orderedRoleGuides(profile?.role).filter((guide) => {
 if (!normalizedQuery) return true;
 return [
 localize(guide.title, locale),
 localize(guide.purpose, locale),
 ...guide.responsibilities.map((item) => localize(item, locale)),
 ...guide.dailySop.map((item) => localize(item, locale)),
 localize(guide.escalation, locale),
 ].join(' ').toLocaleLowerCase(locale === 'ms' ? 'ms-MY' : 'en-MY').includes(normalizedQuery);
 });

 const filteredFaq = MANUAL_FAQ.filter((item) => {
 if (!normalizedQuery) return true;
 return `${localize(item.question, locale)} ${localize(item.answer, locale)}`
 .toLocaleLowerCase(locale === 'ms' ? 'ms-MY' : 'en-MY')
 .includes(normalizedQuery);
 });

 const companyName = profile?.legal_entity?.name;
 const contextBadges = [
 profile?.role && currentRoleGuide ? localize(currentRoleGuide.title, locale) : null,
 companyName ?? null,
 branch?.branch_name ?? null,
 ].filter(Boolean);

 return (
 <ModuleLayout className="space-y-4">
 <ModuleHeader
 title={locale === 'ms' ? 'Pusat Panduan Pengguna' : 'User Guide Center'}
 description={locale === 'ms'
 ? 'Manual sistem, tanggungjawab dan SOP kerja untuk setiap pengguna RKJ One.'
 : 'System instructions, responsibilities and work SOPs for every RKJ One user.'}
 icon={BookOpen}
 badges={(
 <>
 <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
 <Sparkles className="mr-1 h-3.5 w-3.5" />
 {locale === 'ms' ? 'Selaras dengan akses sistem semasa' : 'Synced to current system access'}
 </Badge>
 {contextBadges.map((label) => (
 <Badge key={label} variant="outline">{label}</Badge>
 ))}
 </>
 )}
 actions={(
 <Button render={<Link href="/profile" />} variant="outline">
 <UserRoundCheck className="h-4 w-4" />
 {locale === 'ms' ? 'Semak profil saya' : 'Review my profile'}
 </Button>
 )}
 />

 <div className="rkj-surface rounded-lg p-4">
 <label htmlFor="manual-search" className="mb-2 block text-sm font-medium text-stone-800">
 {locale === 'ms' ? 'Cari panduan, tanggungjawab atau SOP' : 'Search guides, responsibilities or SOPs'}
 </label>
 <div className="relative">
 <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
 <Input
 id="manual-search"
 value={query}
 onChange={(event) => setQuery(event.target.value)}
 placeholder={locale === 'ms'
 ? 'Contoh: tutup syif, stok, kelulusan, terlupa kata laluan...'
 : 'Example: close shift, stock, approval, forgot password...'}
 className="pl-9"
 />
 </div>
 </div>

 {currentRoleGuide && (
 <SectionCard
 title={locale === 'ms' ? 'Panduan untuk anda' : 'Your guide'}
 description={locale === 'ms'
 ? 'Tanggungjawab dan rutin kerja berdasarkan peranan aktif anda.'
 : 'Responsibilities and work routine based on your active role.'}
 >
 <RoleGuideCard guide={currentRoleGuide} locale={locale} isCurrent />
 </SectionCard>
 )}

 <Tabs defaultValue="modules">
 <TabsList className="w-full justify-start">
 <TabsTrigger value="modules">
 <BookOpen data-icon="inline-start" />
 {locale === 'ms' ? `Modul saya (${visibleModuleGuides.length})` : `My modules (${visibleModuleGuides.length})`}
 </TabsTrigger>
 <TabsTrigger value="roles">
 <UsersRound data-icon="inline-start" />
 {locale === 'ms' ? 'Semua peranan' : 'All roles'}
 </TabsTrigger>
 <TabsTrigger value="sop">
 <ClipboardCheck data-icon="inline-start" />
 {locale === 'ms' ? 'SOP umum' : 'General SOP'}
 </TabsTrigger>
 <TabsTrigger value="faq">
 <CircleHelp data-icon="inline-start" />
 FAQ
 </TabsTrigger>
 </TabsList>

 <TabsContent value="modules" className="pt-2">
 <div className="mb-3 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-950">
 <ShieldCheck className="mt-1 h-4 w-4 shrink-0" />
 <p>
 {locale === 'ms'
 ? 'Senarai ini dijana daripada peranan, syarikat dan kebenaran aktif anda. Perubahan akses sistem akan dikemas kini di sini secara automatik.'
 : 'This list is generated from your active role, company and permissions. System access changes update here automatically.'}
 </p>
 </div>
 {filteredModules.length > 0 ? (
 <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
 {filteredModules.map(({ guide, isFallback }) => (
 <ModuleGuideCard
 key={guide.href}
 guide={guide}
 locale={locale}
 isFallback={isFallback}
 />
 ))}
 </div>
 ) : (
 <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
 {locale === 'ms' ? 'Tiada panduan modul sepadan dengan carian.' : 'No module guide matches your search.'}
 </div>
 )}
 </TabsContent>

 <TabsContent value="roles" className="space-y-3 pt-2">
 <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
 {locale === 'ms'
 ? 'Panduan ini menerangkan sempadan kerja setiap peranan. Arahan rasmi pengurusan dan had kuasa syarikat tetap mengatasi panduan umum ini.'
 : 'These guides explain each role boundary. Official management instructions and company authority limits take precedence over this general guide.'}
 </div>
 {filteredRoles.length > 0 ? filteredRoles.map((guide) => (
 <RoleGuideCard
 key={guide.role}
 guide={guide}
 locale={locale}
 isCurrent={guide.role === profile?.role}
 />
 )) : (
 <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
 {locale === 'ms' ? 'Tiada panduan peranan sepadan dengan carian.' : 'No role guide matches your search.'}
 </div>
 )}
 </TabsContent>

 <TabsContent value="sop" className="pt-2">
 <div className="grid gap-3 lg:grid-cols-2">
 {COMMON_SOP.map((section) => (
 <SectionCard
 key={section.title.ms}
 title={localize(section.title, locale)}
 >
 <NumberedSteps steps={section.steps} locale={locale} />
 </SectionCard>
 ))}
 </div>
 <div className="mt-3 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-950">
 <FileWarning className="mt-1 h-5 w-5 shrink-0" />
 <div>
 <p className="font-semibold">
 {locale === 'ms' ? 'Hentikan kerja dan lapor segera' : 'Stop work and report immediately'}
 </p>
 <p>
 {locale === 'ms'
 ? 'Jika melibatkan keselamatan pekerja atau makanan, kehilangan tunai/data, penipuan, akses tanpa kebenaran atau kerosakan aset berbahaya.'
 : 'For worker or food safety, cash/data loss, fraud, unauthorized access or dangerous asset failure.'}
 </p>
 </div>
 </div>
 </TabsContent>

 <TabsContent value="faq" className="space-y-3 pt-2">
 {filteredFaq.length > 0 ? filteredFaq.map((item) => (
 <SecondarySection
 key={item.question.ms}
 title={localize(item.question, locale)}
 >
 <p className="text-sm leading-7 text-stone-700">{localize(item.answer, locale)}</p>
 </SecondarySection>
 )) : (
 <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
 {locale === 'ms' ? 'Tiada jawapan sepadan dengan carian.' : 'No answer matches your search.'}
 </div>
 )}
 </TabsContent>
 </Tabs>

 <div className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-stone-950 p-4 text-stone-100 sm:flex-row sm:items-center sm:justify-between">
 <div>
 <p className="font-semibold">
 {locale === 'ms' ? 'Jumpa panduan yang tidak selaras?' : 'Found an outdated guide?'}
 </p>
 <p className="mt-1 text-sm text-stone-300">
 {locale === 'ms'
 ? 'Catat halaman, peranan dan langkah yang berbeza, kemudian maklumkan Pentadbir HQ untuk pembetulan.'
 : 'Record the page, role and differing step, then notify the HQ Administrator for correction.'}
 </p>
 </div>
 <Button
 render={<Link href="/dashboard" />}
 className="shrink-0 bg-amber-400 text-stone-950 hover:bg-amber-300"
 >
 {locale === 'ms' ? 'Kembali ke Pusat Kawalan' : 'Return to Control Center'}
 <ExternalLink className="h-4 w-4" />
 </Button>
 </div>
 </ModuleLayout>
 );
}
