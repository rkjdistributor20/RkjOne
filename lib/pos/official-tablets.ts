import type { PosOfficialHardwareProfile } from '@/lib/pos/types';

export const POS_OFFICIAL_TABLETS: Record<PosOfficialHardwareProfile, {
 label: string;
 brand: string;
 connectivity: string;
 storage: string;
 manufacturerTokens: string[];
 modelTokens: string[];
}> = {
 SAMSUNG_TAB_S10_LITE_5G_128: {
  label: 'Samsung Galaxy Tab S10 Lite 5G 128GB',
  brand: 'Samsung',
  connectivity: '5G',
  storage: '128GB',
  manufacturerTokens: ['samsung'],
  modelTokens: ['tab s10 lite', 's10 lite'],
 },
 HONOR_PAD_X8B_LTE_256: {
  label: 'HONOR Pad X8b LTE 256GB',
  brand: 'HONOR',
  connectivity: 'LTE',
  storage: '256GB',
  manufacturerTokens: ['honor'],
  modelTokens: ['pad x8b', 'x8b'],
 },
};

export function isOfficialHardwareProfile(value: unknown): value is PosOfficialHardwareProfile {
 return typeof value === 'string' && value in POS_OFFICIAL_TABLETS;
}

export function matchOfficialTablet(
 profile: PosOfficialHardwareProfile | null | undefined,
 manufacturer: string | null | undefined,
 model: string | null | undefined,
) {
 if (!profile) return { state: 'UNASSIGNED' as const, label: 'Model belum ditetapkan' };
 const expected = POS_OFFICIAL_TABLETS[profile];
 const manufacturerText = (manufacturer ?? '').toLowerCase();
 const modelText = (model ?? '').toLowerCase();
 const brandMatches = expected.manufacturerTokens.some((token) => manufacturerText.includes(token));
 const modelMatches = expected.modelTokens.some((token) => modelText.includes(token));
 if (brandMatches && modelMatches) return { state: 'MATCHED' as const, label: expected.label };
 if (brandMatches) return { state: 'BRAND_MATCHED' as const, label: expected.label };
 return { state: 'REVIEW' as const, label: expected.label };
}
