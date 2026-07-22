'use client';

import { useEffect, useLayoutEffect } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { buildPermissionMap } from '@/lib/auth/permissions';
import { useAuthStore } from '@/stores/auth-store';
import type { ProfileWithBranch } from '@/types/database';
import type { PermissionLevel } from '@/types/enums';
import type { PosDeviceContext } from '@/lib/pos/device-auth';

interface AuthProviderProps {
 profile: ProfileWithBranch | null;
 permissions: Array<{ module: string; permission: PermissionLevel }>;
 children: React.ReactNode;
 posDeviceContext: PosDeviceContext;
 kioskBypassed: boolean;
}

function syncAuthStore(
 profile: ProfileWithBranch | null,
 permissions: Array<{ module: string; permission: PermissionLevel }>) {
 useAuthStore.setState({
 profile,
 branch: (profile?.branch as ProfileWithBranch['branch']) ?? null,
 region: (profile?.region as ProfileWithBranch['region']) ?? null,
 permissions: buildPermissionMap(permissions),
 isLoading: false,
 });
}

export function AuthProvider({
 profile,
 permissions,
 posDeviceContext,
 kioskBypassed,
 children,
}: AuthProviderProps) {
 useLayoutEffect(() => {
 syncAuthStore(profile, permissions);
 }, [profile, permissions]);

 useEffect(() => {
 syncAuthStore(profile, permissions);
 }, [profile, permissions]);

 return (
 <AppShell posDeviceContext={posDeviceContext} kioskBypassed={kioskBypassed}>
 {children}
 </AppShell>);
}
