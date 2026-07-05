import type { UserRole } from '@/types/enums';

export type LegalEntityScopedProfile = {
 role: string;
 legal_entity_id?: string | null;
 legal_entity?: { code?: string | null } | null;
};

const GROUP_WIDE_ROLES = new Set<UserRole>(['SUPER_ADMIN', 'ADMIN']);

export function canViewAllLegalEntities(role: string | null | undefined): boolean {
 return GROUP_WIDE_ROLES.has(role as UserRole);
}

export function getProfileLegalEntityCode(
 profile: LegalEntityScopedProfile | null | undefined): string | null {
 return profile?.legal_entity?.code ?? null;
}

export function getAllowedLegalEntityCodes(
 profile: LegalEntityScopedProfile | null | undefined): string[] | null {
 if (!profile) return [];
 if (canViewAllLegalEntities(profile.role)) return null;
 const code = getProfileLegalEntityCode(profile);
 return code ? [code] : [];
}

export function canAccessNavGroupForLegalEntity(
 group: string,
 profile: LegalEntityScopedProfile | null | undefined): boolean {
 if (!profile || canViewAllLegalEntities(profile.role)) return true;
 if (group === 'command' || group === 'governance') return true;

 const code = getProfileLegalEntityCode(profile);
 if (code === 'RKJ_MFG') return group === 'manufacturing';
 if (code === 'RKJ_DIST') return group === 'distributor';
 if (code === 'RKJ') return group === 'retail';

 return false;
}
