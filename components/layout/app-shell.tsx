'use client';

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
 type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { COMPANY } from '@/lib/brand/company';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { createClient } from '@/lib/supabase/client';
import { getVisibleNavGroups, getNavLabelForPath } from '@/lib/auth/permissions';
import { isAreaManagerRole } from '@/lib/auth/area-manager-access';
import { navGroupKeys, navHrefKeys, type TranslationKey } from '@/lib/i18n/dictionary';
import { useAuthStore } from '@/stores/auth-store';
import { AreaManagerRouteGuard } from '@/components/layout/area-manager-route-guard';
import { ProfileAvatarReminder } from '@/components/profile/profile-avatar-reminder';
import { LanguageSwitcher } from '@/components/i18n/language-switcher';
import { useLanguage } from '@/components/i18n/language-provider';

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
};

interface AppShellProps {
 children: React.ReactNode;
}

function SidebarBrand() {
 const { t } = useLanguage();
 return (
 <div className="border-b border-sidebar-border px-4 py-5">
 <BrandLogo size="md" variant="light" />
 <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
 {t('layout.est')} {COMPANY.founded} - {COMPANY.hq}
 </p>
 <p className="mt-1 text-xs leading-relaxed text-sidebar-foreground/70">
 {COMPANY.tagline}
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
 <nav className="flex flex-col gap-4 px-2">
 {groups.map((group) => (
 <section key={group.group} className="space-y-1">
 <div className="px-3">
 <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/45">
 {navGroupKeys[group.group] ? t(navGroupKeys[group.group].label) : group.label}
 </p>
 <p className="truncate text-[11px] text-sidebar-foreground/35">
 {navGroupKeys[group.group] ? t(navGroupKeys[group.group].description) : group.description}
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
 className={cn(
 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
 active
 ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-black/10'
 : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground')}
 >
 <Icon className="h-4 w-4 shrink-0" />
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
 <div className="border-t border-sidebar-border p-4">
 <Link
 href="/profile"
 className="flex items-center gap-3 rounded-xl p-1 transition-colors hover:bg-sidebar-accent/60"
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
 className="mt-2 w-full justify-center border-sidebar-border bg-sidebar-accent/50 text-xs text-sidebar-foreground"
 >
 {branch.branch_code} - {branch.branch_name}
 </Badge>)}
 <Button
 variant="ghost"
 size="sm"
 className="mt-2 w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
 onClick={onLogout}
 >
 <LogOut className="mr-2 h-4 w-4" />
 {t('layout.logout')}
 </Button>
 </div>);
}

export function AppShell({ children }: AppShellProps) {
 const router = useRouter();
 const pathname = usePathname();
 const { profile } = useAuthStore();
 const { t } = useLanguage();

 async function handleLogout() {
 const supabase = createClient();
 await supabase.auth.signOut();
 useAuthStore.getState().reset();
 router.push('/login');
 router.refresh();
 }

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

 return (
 <div className="flex min-h-screen bg-background">
 <AreaManagerRouteGuard />
 <aside className="hidden w-64 shrink-0 bg-sidebar md:flex md:flex-col">
 <SidebarBrand />
 <div className="flex-1 overflow-y-auto py-4">
 <NavLinks />
 </div>
 <UserFooter onLogout={handleLogout} />
 </aside>

 <div className="flex flex-1 flex-col">
 <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-primary/20 bg-background/85 px-4 backdrop-blur-md md:px-6">
 <Sheet>
 <SheetTrigger
 type="button"
 className="inline-flex items-center justify-center rounded-xl p-2 text-foreground hover:bg-muted md:hidden"
 >
 <Menu className="h-5 w-5" />
 </SheetTrigger>
 <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
 <SidebarBrand />
 <div className="flex-1 overflow-y-auto py-4">
 <NavLinks />
 </div>
 <UserFooter onLogout={handleLogout} />
 </SheetContent>
 </Sheet>

 <div className="sm:hidden">
 <LanguageSwitcher compact />
 </div>

 <div className="min-w-0 flex-1">
 <p className="text-xs font-semibold uppercase tracking-wider text-primary">
 {pageTitle}
 </p>
 <h1 className="truncate text-lg font-bold md:text-xl">
 {t('layout.greeting')}, {greeting}
 </h1>
 </div>

 <div className="hidden items-center gap-2 sm:flex">
 <LanguageSwitcher compact />
 {profile && isAreaManagerRole(profile.role) ? (
 <Badge variant="secondary">{t('layout.areaManager')}</Badge>) : (
 <Badge variant="secondary">{COMPANY.branchCount} {t('layout.branches')}</Badge>)}
 </div>
 </header>

 <ProfileAvatarReminder />

 <main className="flex-1 overflow-y-auto bg-muted/20 p-4 md:p-6">{children}</main>
 </div>
 </div>);
}


