import { create } from 'zustand';
import type { PermissionLevel } from '@/types/enums';
import type { Branch, Profile, Region } from '@/types/database';
import { buildPermissionMap } from '@/lib/auth/permissions';

interface AuthState {
 profile: Profile | null;
 branch: Branch | null;
 region: Region | null;
 permissions: Map<string, PermissionLevel>;
 isLoading: boolean;
 setProfile: (profile: Profile | null) => void;
 setBranch: (branch: Branch | null) => void;
 setRegion: (region: Region | null) => void;
 setPermissions: (
 rows: Array<{ module: string; permission: PermissionLevel }>
 ) => void;
 setLoading: (loading: boolean) => void;
 reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
 profile: null,
 branch: null,
 region: null,
 permissions: new Map(),
 isLoading: true,
 setProfile: (profile) => set({ profile }),
 setBranch: (branch) => set({ branch }),
 setRegion: (region) => set({ region }),
 setPermissions: (rows) => set({ permissions: buildPermissionMap(rows) }),
 setLoading: (isLoading) => set({ isLoading }),
 reset: () =>
 set({
 profile: null,
 branch: null,
 region: null,
 permissions: new Map(),
 isLoading: false,
 }),
}));
