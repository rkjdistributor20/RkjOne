/**
 * Tiga syarikat undang-undang di bawah jenama Roti Kaya Junus — pemilik sama, satu sistem RKJ One.
 * Staf jualan kiosk (semua staf cawangan) → Roti Kaya Junus.
 */
export const LEGAL_ENTITY_CODES = ['RKJ', 'RKJ_DIST', 'RKJ_MFG'] as const;

export type LegalEntityCode = (typeof LEGAL_ENTITY_CODES)[number];

export type LegalEntityDefinition = {
  code: LegalEntityCode;
  name: string;
  legalName: string;
  scope: string;
  sortOrder: number;
};

export const LEGAL_ENTITIES: readonly LegalEntityDefinition[] = [
  {
    code: 'RKJ',
    name: 'Roti Kaya Junus',
    legalName: 'Roti Kaya Junus',
    scope: 'Staf jualan kiosk · 36 cawangan · jenama Roti Kaya Junus',
    sortOrder: 1,
  },
  {
    code: 'RKJ_DIST',
    name: 'RKJ Distributor',
    legalName: 'RKJ Distributor Sdn Bhd',
    scope: 'Pengedaran · fleet · Pengurus Kawasan · HQ Distributor',
    sortOrder: 2,
  },
  {
    code: 'RKJ_MFG',
    name: 'RKJ Manufacturing',
    legalName: 'Roti Kaya Junus Manufacturing Sdn Bhd',
    scope: 'Kilang · pengeluaran roti · gudang kilang',
    sortOrder: 3,
  },
] as const;

/** Gudang pengedaran HQ — bawah RKJ Distributor (nama baharu menggantikan "Gudang HQ") */
export const HQ_DISTRIBUTOR_LABEL = 'HQ Distributor';

/** Lalai untuk staf jualan cawangan */
export const DEFAULT_SALES_LEGAL_ENTITY_CODE: LegalEntityCode = 'RKJ';

/** Pengurus Kawasan — majikan RKJ Distributor, urus operasi Roti Kaya Junus */
export const AREA_MANAGER_EMPLOYER_CODE: LegalEntityCode = 'RKJ_DIST';
export const AREA_MANAGER_OPERATING_CODE: LegalEntityCode = 'RKJ';

export const AREA_MANAGER_OPERATING_SCOPE =
  'Mengurus staf jualan dan cawangan kiosk di bawah syarikat Roti Kaya Junus';

export const LEGAL_ENTITY_GROUP_NOTE =
  'Ketiga-tiga syarikat ini menjalankan perniagaan di bawah jenama Roti Kaya Junus dengan pemilik yang sama — urusan disatukan dalam RKJ One.';

export function getLegalEntityByCode(code: string | null | undefined): LegalEntityDefinition | null {
  if (!code) return null;
  return LEGAL_ENTITIES.find((e) => e.code === code) ?? null;
}

export function legalEntityLabel(code: string | null | undefined, legalName?: string | null): string {
  const def = getLegalEntityByCode(code);
  if (legalName?.trim()) return legalName.trim();
  return def?.legalName ?? def?.name ?? '—';
}

export function defaultLegalEntityCodeForRole(role: string): LegalEntityCode | null {
  if (role === 'AREA_MANAGER' || role === 'DRIVER') return AREA_MANAGER_EMPLOYER_CODE;
  if (role === 'CEO_FACTORY') return 'RKJ_MFG';
  if (role === 'STAFF') return DEFAULT_SALES_LEGAL_ENTITY_CODE;
  return null;
}

export function operatingLegalEntityForRole(role: string): LegalEntityDefinition | null {
  if (role !== 'AREA_MANAGER') return null;
  return getLegalEntityByCode(AREA_MANAGER_OPERATING_CODE);
}
