'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Clock,
  Package,
  Warehouse,
  Truck,
  Wallet,
  Banknote,
  BarChart3,
  CheckSquare,
  Settings,
  LogOut,
  Menu,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { createClient } from '@/lib/supabase/client';
import { getVisibleNavItems } from '@/lib/auth/permissions';
import { ROLE_LABELS } from '@/types/enums';
import { useAuthStore } from '@/stores/auth-store';
const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  ShoppingCart,
  Clock,
  Package,
  Warehouse,
  Truck,
  Wallet,
  Banknote,
  BarChart3,
  CheckSquare,
  Settings,
};

interface AppShellProps {
  children: React.ReactNode;
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { profile, permissions } = useAuthStore();

  if (!profile) return null;

  const items = getVisibleNavItems(profile.role, permissions);

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-amber-100 text-amber-900'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const { profile, branch } = useAuthStore();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    useAuthStore.getState().reset();
    router.push('/login');
    router.refresh();
  }

  const initials = profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-card md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-sm font-bold text-white">
            RKJ
          </div>
          <div>
            <p className="text-sm font-semibold">RKJ One</p>
            <p className="text-xs text-muted-foreground">Teluk Intan HQ</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks />
        </div>
        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-amber-100 text-amber-800">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {profile ? ROLE_LABELS[profile.role] : ''}
              </p>
            </div>
          </div>
          {branch && (
            <Badge variant="outline" className="mt-2 w-full justify-center text-xs">
              {branch.branch_code}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center gap-4 border-b px-4 md:px-6">
          <Sheet>
            <SheetTrigger className="inline-flex md:hidden">
              <Button variant="ghost" size="icon" type="button">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="flex h-16 items-center gap-2 border-b px-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-sm font-bold text-white">
                  RKJ
                </div>
                <p className="font-semibold">RKJ One</p>
              </div>
              <div className="p-3">
                <NavLinks />
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex-1">
            <h1 className="text-lg font-semibold md:text-xl">
              Roti Kaya Junus
            </h1>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
