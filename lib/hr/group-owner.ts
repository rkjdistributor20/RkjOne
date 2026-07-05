import type { LegalEntityCode } from '@/lib/brand/legal-entities';

/** Login rasmi pemilik kumpulan - satu profil merentas 3 syarikat legal */
export const GROUP_OWNER_EMAIL = 'matisa@rkj.com';

export type HrEmployment = {
 staff_id: string;
 staff_code: string;
 legal_entity_code: string;
 legal_entity_name: string;
 monthly_amount: number | null;
 weekly_amount: number | null;
 status: string;
};

export type GroupOwnerMetadata = {
 group_owner?: boolean;
 legal_entities?: LegalEntityCode[];
 position?: string;
 merged_into?: string;
};

export function parseGroupOwnerMetadata(metadata: unknown): GroupOwnerMetadata {
 if (!metadata || typeof metadata !== 'object') return {};
 return metadata as GroupOwnerMetadata;
}

export function isGroupOwnerMetadata(metadata: unknown): boolean {
 return parseGroupOwnerMetadata(metadata).group_owner === true;
}

export function isMergedProfile(metadata: unknown): boolean {
 return Boolean(parseGroupOwnerMetadata(metadata).merged_into);
}

export function sumMonthlyEmployments(employments: HrEmployment[]): number | null {
 const amounts = employments.map((e) => e.monthly_amount).filter((n): n is number => n != null && !Number.isNaN(n));
 return amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) : null;
}

export function sumWeeklyEmployments(employments: HrEmployment[]): number | null {
 const amounts = employments.map((e) => e.weekly_amount).filter((n): n is number => n != null && !Number.isNaN(n));
 return amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) : null;
}
