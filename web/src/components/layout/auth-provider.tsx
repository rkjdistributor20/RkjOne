'use client';

import { useEffect } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { useAuthStore } from '@/stores/auth-store';
import type { ProfileWithBranch } from '@/types/database';
import type { PermissionLevel } from '@/types/enums';

interface AuthProviderProps {
  profile: ProfileWithBranch | null;
  permissions: Array<{ module: string; permission: PermissionLevel }>;
  children: React.ReactNode;
}

export function AuthProvider({
  profile,
  permissions,
  children,
}: AuthProviderProps) {
  const { setProfile, setBranch, setRegion, setPermissions, setLoading } =
    useAuthStore();

  useEffect(() => {
    setProfile(profile);
    setBranch((profile?.branch as ProfileWithBranch['branch']) ?? null);
    setRegion((profile?.region as ProfileWithBranch['region']) ?? null);
    setPermissions(permissions);
    setLoading(false);
  }, [
    profile,
    permissions,
    setProfile,
    setBranch,
    setRegion,
    setPermissions,
    setLoading,
  ]);

  return <AppShell>{children}</AppShell>;
}
