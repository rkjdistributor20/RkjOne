'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
 LayoutDashboard,
 ShoppingCart,
 Clock,
 Package,
 Warehouse,
 Factory,
 Truck,
 Wallet,
 Banknote,
 BarChart3,
 Building2,
 CheckSquare,
 Settings,
 LogOut,
 Menu,
 UserCircle2,
 Wrench,
 Users,
 Store,
 CalendarDays,
 ShieldCheck,
 MonitorSmartphone,
 LockKeyhole,
 UnlockKeyhole,
 BookOpen,
 type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { COMPANY } from '@/lib/brand/company';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { createClient } from '@/lib/supabase/client';
import { getVisibleNavGroups, getNavLabelForPath } from '@/lib/auth/permissions';
import { isAreaManagerRole } from '@/lib/auth/area-manager-access';
import { navGroupKeys, navHrefKeys, type TranslationKey } from '@/lib/i18n/dictionary';
import { useAuthStore } from '@/stores/auth-store';
import { AreaManagerRouteGuard } from '@/components/layout/area-manager-route-guard';
import { ProfileAvatarReminder } from '@/components/profile/profile-avatar-reminder';
import { LanguageSwitcher } from '@/components/i18n/language-switcher';
import { useLanguage } from '@/components/i18n/language-provider';
import type { PosDeviceContext } from '@/lib/pos/device-auth';
import { toast } from 'sonner';

const ICONS: Record<string, LucideIcon> = {
 LayoutDashboard,
 ShoppingCart,
 Clock,
 Package,
 Warehouse,
 Factory,
 Truck,
 Wallet,
 Banknote,
 BarChart3,
 Building2,
 CheckSquare,
 Settings,
 Wrench,
 Users,
 Store,
 CalendarDays,
 ShieldCheck,
 BookOpen,
};

interface AppShellProps {
 children: React.ReactNode;
 posDeviceContext: PosDeviceContext;
 kioskBypassed: boolean;
}

function SidebarBrand() {
 const { t } = useLanguage();
 return (
 <div className="border-b border-white/10 px-4 py-4">
 <BrandLogo size="md" variant="light" />
 <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/70">
 {t('layout.est')} {COMPANY.founded} - {COMPANY.hq}
 </p>
 </div>);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
 const pathname = usePathname();
 const { profile, permissions } = useAuthStore();
 const { t } = useLanguage();

 if (!profile) return null;

 const groups = getVisibleNavGroups(profile.role, permissions, profile);

 return (
 <nav className="flex flex-col gap-3 px-3">
 {groups.map((group) => (
 <section key={group.group} className="space-y-1">
 <div className="px-3 pb-0.5">
 <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-100/45">
 {navGroupKeys[group.group] ? t(navGroupKeys[group.group].label) : group.label}
 </p>
 </div>
 <div className="space-y-1">
 {group.items.map((item) => {
 const Icon = ICONS[item.icon] ?? LayoutDashboard;
 const active =
 pathname === item.href || pathname.startsWith(`${item.href}/`);

 return (
 <Link
 key={item.href}
 href={item.href}
 onClick={onNavigate}
 aria-current={active ? 'page' : undefined}
 className={cn(
 'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
 active
 ? 'bg-amber-400 text-stone-950 shadow-sm shadow-amber-950/20'
 : 'text-sidebar-foreground/72 hover:bg-white/10 hover:text-white')}
 >
 <span
 className={cn(
 'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition-opacity',
 active ? 'bg-stone-950/70 opacity-100' : 'bg-amber-300 opacity-0 group-hover:opacity-60')}
 />
 <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-stone-950' : 'text-sidebar-foreground/55 group-hover:text-amber-200')} />
 <span className="truncate">
 {navHrefKeys[item.href] ? t(navHrefKeys[item.href]) : item.label}
 </span>
 </Link>);
 })}
 </div>
 </section>))}
 </nav>);
}

function UserFooter({ onLogout }: { onLogout: () => void }) {
 const { profile, branch } = useAuthStore();
 const { t } = useLanguage();

 const initials = profile?.full_name
 ?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

 return (
 <div className="border-t border-white/10 p-4">
 <Link
 href="/profile"
 className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/10"
 >
 <Avatar className="h-9 w-9 ring-2 ring-sidebar-primary/30">
 {profile?.avatar_url ? (
 <AvatarImage src={profile.avatar_url} alt={profile.full_name} />) : null}
 <AvatarFallback
 className={cn(
 'bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold',
 !profile?.avatar_url && 'ring-2 ring-amber-400 ring-offset-1 ring-offset-sidebar')}
 >
 {initials}
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-semibold text-sidebar-foreground">
 {profile?.full_name}
 </p>
 <p className="truncate text-xs text-sidebar-foreground/60">
 {profile ? t(`role.${profile.role}` as TranslationKey) : ''}
 </p>
 </div>
 <UserCircle2 className="h-4 w-4 shrink-0 text-sidebar-foreground/50" />
 </Link>
 {branch && (
 <Badge
 variant="outline"
 className="mt-2 w-full justify-center border-white/10 bg-white/5 text-xs text-sidebar-foreground"
 >
 {branch.branch_code} - {branch.branch_name}
 </Badge>)}
 <Button
 variant="ghost"
 size="sm"
 className="mt-2 w-full justify-start text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground"
 onClick={onLogout}
 >
 <LogOut className="mr-2 h-4 w-4" />
 {t('layout.logout')}
 </Button>
 </div>);
}

export function AppShell({ children, posDeviceContext, kioskBypassed }: AppShellProps) {
 const router = useRouter();
 const pathname = usePathname();
 const { profile } = useAuthStore();
 const { t } = useLanguage();
 const [changingKiosk, setChangingKiosk] = useState(false);
 const [mobileNavOpen, setMobileNavOpen] = useState(false);

 const officialDevice = posDeviceContext.mode === 'PRODUCTION' ? posDeviceContext.device : null;
 const kioskMode = Boolean(officialDevice && !kioskBypassed);
 const canOpenManagement = profile
 ? ['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER'].includes(profile.role)
 : false;

 useEffect(() => {
 if (kioskMode && pathname !== '/pos') router.replace('/pos');
 }, [kioskMode, pathname, router]);

 async function handleLogout() {
 const supabase = createClient();
 await supabase.auth.signOut();
 useAuthStore.getState().reset();
 router.push('/login');
 router.refresh();
 }

 async function openManagementMode() {
 setChangingKiosk(true);
 try {
 const response = await fetch('/api/pos/kiosk', { method: 'POST' });
 const data = await response.json();
 if (!response.ok) throw new Error(data.error ?? 'Mod pengurusan tidak dapat dibuka');
 toast.success('Mod pengurusan dibuka selama 15 minit');
 router.push('/dashboard');
 router.refresh();
 } catch (error) {
 toast.error(error instanceof Error ? error.message : 'Mod pengurusan tidak dapat dibuka');
 } finally {
 setChangingKiosk(false);
 }
 }

 async function returnToKiosk() {
 setChangingKiosk(true);
 try {
 await fetch('/api/pos/kiosk', { method: 'DELETE' });
 router.push('/pos');
 router.refresh();
 } finally {
 setChangingKiosk(false);
 }
 }

 useEffect(() => {
  if (!officialDevice || !kioskBypassed) return;

  const timeout = window.setTimeout(() => {
   void fetch('/api/pos/kiosk', { method: 'DELETE' }).finally(() => {
    router.push('/pos');
    router.refresh();
   });
  }, 15 * 60 * 1000);

  return () => window.clearTimeout(timeout);
 }, [officialDevice, kioskBypassed, router]);

 const greeting = profile?.full_name?.split(' ')[0] ?? t('layout.staffFallback');
 const navLabel = getNavLabelForPath(pathname);
 const navKey = navHrefKeys[pathname] ??
 Object.entries(navHrefKeys).find(([href]) => href !== '/dashboard' && pathname.startsWith(`${href}/`))?.[1];
 const pageTitle =
 pathname === '/profile' || pathname.startsWith('/profile/')
 ? t('layout.myProfile')
 : navKey
 ? t(navKey)
 : navLabel;

 if (kioskMode) {
 if (pathname !== '/pos') {
 return (
 <div className="flex h-dvh items-center justify-center bg-stone-950 text-white">
 <div className="text-center">
 <MonitorSmartphone className="mx-auto h-9 w-9 text-amber-400" />
 <p className="mt-3 font-semibold">Membuka POS rasmi...</p>
 </div>
 </div>);
 }

 const initials = profile?.full_name
 ?.split(' ').map((name) => name[0]).join('').slice(0, 2).toUpperCase();
 return (
 <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
 <header className="flex min-h-16 items-center gap-3 border-b border-amber-300 bg-stone-950 px-3 text-white sm:px-5">
 <BrandLogo size="sm" variant="light" />
 <div className="hidden h-8 w-px bg-white/15 sm:block" />
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2">
 <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">POS Rasmi</Badge>
 <span className="truncate text-xs text-white/60">{officialDevice?.deviceCode}</span>
 </div>
 <p className="mt-0.5 truncate text-sm font-semibold">
 {officialDevice?.branchCode} - {officialDevice?.branchName}
 </p>
 </div>
 <div className="hidden min-w-0 items-center gap-2 sm:flex">
 <Avatar className="h-8 w-8 border border-white/15">
 {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={profile.full_name} /> : null}
 <AvatarFallback className="bg-amber-400 text-xs font-bold text-stone-950">{initials}</AvatarFallback>
 </Avatar>
 <div className="min-w-0">
 <p className="max-w-40 truncate text-xs font-semibold">{profile?.full_name}</p>
 <p className="text-[11px] text-white/55">Sedang bertugas</p>
 </div>
 </div>
 <LanguageSwitcher compact />
 {canOpenManagement && (
 <Button variant="outline" size="sm" className="hidden gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white lg:flex" onClick={openManagementMode} disabled={changingKiosk}>
 <UnlockKeyhole className="h-4 w-4" /> Mod Pengurusan
 </Button>)}
 <Button variant="ghost" size="sm" className="gap-2 text-white/75 hover:bg-white/10 hover:text-white" onClick={handleLogout}>
 <LockKeyhole className="h-4 w-4" /> <span className="hidden md:inline">Kunci POS</span>
 </Button>
 </header>
 {canOpenManagement && (
 <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-right lg:hidden">
 <Button variant="outline" size="sm" className="gap-2 bg-white" onClick={openManagementMode} disabled={changingKiosk}>
 <UnlockKeyhole className="h-4 w-4" /> Mod Pengurusan 15 minit
 </Button>
 </div>)}
 <main className="rkj-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4">{children}</main>
 </div>);
 }

 return (
 <div className="flex h-dvh min-h-0 overflow-hidden bg-background">
 <a
 href="#main-content"
 className="sr-only z-[100] rounded-md bg-background px-4 py-2 font-medium focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
 >
 Langkau ke kandungan utama
 </a>
 <AreaManagerRouteGuard />
 <aside className="hidden min-h-0 w-64 shrink-0 border-r border-white/10 bg-[linear-gradient(180deg,#111411_0%,#17130f_48%,#0f1b17_100%)] md:flex md:flex-col">
 <SidebarBrand />
 <div className="rkj-scrollbar flex-1 overflow-y-auto py-4">
 <NavLinks />
 </div>
 <UserFooter onLogout={handleLogout} />
 </aside>

 <div className="flex min-h-0 min-w-0 flex-1 flex-col">
 <header className="sticky top-0 z-20 flex min-h-16 items-center gap-4 border-b border-amber-200/40 bg-background/88 px-4 shadow-sm backdrop-blur-xl md:px-6">
 <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
 <SheetTrigger
 type="button"
 aria-label="Buka menu navigasi"
 className="inline-flex items-center justify-center rounded-lg p-2 text-foreground hover:bg-muted md:hidden"
 >
 <Menu className="h-5 w-5" />
 </SheetTrigger>
 <SheetContent side="left" className="w-64 border-sidebar-border bg-[linear-gradient(180deg,#111411_0%,#17130f_48%,#0f1b17_100%)] p-0">
 <SheetTitle className="sr-only">Menu navigasi RKJ One</SheetTitle>
 <SidebarBrand />
 <div className="flex-1 overflow-y-auto py-4">
 <NavLinks onNavigate={() => setMobileNavOpen(false)} />
 </div>
 <UserFooter onLogout={handleLogout} />
 </SheetContent>
 </Sheet>

 <div className="sm:hidden">
 <LanguageSwitcher compact />
 </div>

 <div className="min-w-0 flex-1">
 <h1 className="truncate text-base font-semibold text-stone-950 sm:text-lg">
 {pageTitle}
 </h1>
 <p className="hidden truncate text-xs text-muted-foreground sm:block">
 {greeting} · {profile?.role?.replaceAll('_', ' ') ?? t('layout.staffFallback')}
 </p>
 </div>

 <div className="hidden items-center gap-2 sm:flex">
 {officialDevice && kioskBypassed && (
 <Button size="sm" className="gap-2" onClick={returnToKiosk} disabled={changingKiosk}>
 <MonitorSmartphone className="h-4 w-4" /> Kembali ke POS
 </Button>)}
 <LanguageSwitcher compact />
 {profile && isAreaManagerRole(profile.role) ? (
 <Badge variant="secondary">{t('layout.areaManager')}</Badge>) : (
 <Badge variant="secondary">{COMPANY.branchCount} {t('layout.branches')}</Badge>)}
 </div>
 </header>

 <ProfileAvatarReminder />

 <main id="main-content" tabIndex={-1} className="rkj-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-transparent p-4 md:p-6">{children}</main>
 </div>
 </div>);
}


