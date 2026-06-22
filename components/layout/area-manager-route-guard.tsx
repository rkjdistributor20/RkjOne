'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  isAreaManagerAllowedPath,
  isAreaManagerRole,
} from '@/lib/auth/area-manager-access';
import { useAuthStore } from '@/stores/auth-store';

/** Halang AM akses halaman bukan urusan kawasan (URL direct) */
export function AreaManagerRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);

  useEffect(() => {
    if (!profile || !isAreaManagerRole(profile.role)) return;
    if (isAreaManagerAllowedPath(pathname)) return;

    toast.message('Halaman ini urusan HQ — anda dihalakan ke papan pemuka');
    router.replace('/dashboard');
  }, [profile, pathname, router]);

  return null;
}
