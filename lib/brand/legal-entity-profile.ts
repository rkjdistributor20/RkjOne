import type { SupabaseClient } from '@supabase/supabase-js';
import type { LegalEntityCode } from '@/lib/brand/legal-entities';
import { getLegalEntityByCode } from '@/lib/brand/legal-entities';

export type LegalEntityCompanyProfile = {
  code: LegalEntityCode | string;
  legalName: string;
  name: string;
  scope: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  registrationNo: string | null;
  taxId: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
};

export const LEGAL_ENTITY_PROFILE_SELECT =
  'code, name, legal_name, scope, office_address, phone, email, registration_no, tax_id, bank_name, bank_account_name, bank_account_no';

type LegalEntityProfileRow = {
  code: string;
  name: string;
  legal_name: string;
  scope: string | null;
  office_address: string | null;
  phone: string | null;
  email: string | null;
  registration_no: string | null;
  tax_id: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
};

/** Sandaran statik — selari dengan migration 00080 */
export const STATIC_LEGAL_ENTITY_PROFILES: Record<string, LegalEntityCompanyProfile> = {
  RKJ_DIST: {
    code: 'RKJ_DIST',
    legalName: 'RKJ Distributor Sdn Bhd',
    name: 'RKJ Distributor',
    scope: 'Pengedaran · logistik · fleet penghantaran',
    address: 'Level 1, NO. 233A, Jalan Industri 5, Taman Industri Anson, 36000 Teluk Intan, Perak',
    phone: '016-4366302',
    email: 'rkjdistributor20@gmail.com',
    registrationNo: '1352838V/201901043508',
    taxId: null,
    bankName: 'Maybank',
    bankAccountName: 'RKJ Distributor Sdn Bhd',
    bankAccountNo: '564856315018',
  },
  RKJ_MFG: {
    code: 'RKJ_MFG',
    legalName: 'Roti Kaya Junus Manufacturing Sdn Bhd',
    name: 'RKJ Manufacturing',
    scope: 'Kilang · pengeluaran roti · gudang kilang',
    address: 'NO. 233A, Jalan Industri 5, Taman Industri Anson, 36000 Teluk Intan, Perak',
    phone: '05-6214187',
    email: 'rkjunus@gmail.com',
    registrationNo: '1345255K/201901035925',
    taxId: null,
    bankName: 'Maybank',
    bankAccountName: 'Roti Kaya Junus Manufacturing Sdn Bhd',
    bankAccountNo: '564427518660',
  },
  RKJ: {
    code: 'RKJ',
    legalName: 'Roti Kaya Junus',
    name: 'Roti Kaya Junus',
    scope: 'Staf jualan kiosk · 36 cawangan · jenama Roti Kaya Junus',
    address: 'NO. 233A, Jalan Industri 5, Taman Industri Anson, 36000 Teluk Intan, Perak',
    phone: '05-6214187',
    email: 'rkjdistributor20@gmail.com',
    registrationNo: '201603227506 (IP0459147-D)',
    taxId: null,
    bankName: 'CIMB Bank',
    bankAccountName: 'Roti Kaya Junus',
    bankAccountNo: '8606268175',
  },
};

export function mapLegalEntityProfileRow(row: LegalEntityProfileRow): LegalEntityCompanyProfile {
  return {
    code: row.code,
    legalName: row.legal_name,
    name: row.name,
    scope: row.scope,
    address: row.office_address,
    phone: row.phone,
    email: row.email,
    registrationNo: row.registration_no,
    taxId: row.tax_id,
    bankName: row.bank_name,
    bankAccountName: row.bank_account_name,
    bankAccountNo: row.bank_account_no,
  };
}

export function getStaticLegalEntityProfile(code: string): LegalEntityCompanyProfile {
  const staticProfile = STATIC_LEGAL_ENTITY_PROFILES[code];
  if (staticProfile) return staticProfile;

  const entity = getLegalEntityByCode(code);
  return {
    code,
    legalName: entity?.legalName ?? code,
    name: entity?.name ?? code,
    scope: entity?.scope ?? null,
    address: null,
    phone: null,
    email: null,
    registrationNo: null,
    taxId: null,
    bankName: null,
    bankAccountName: null,
    bankAccountNo: null,
  };
}

export async function loadLegalEntityProfile(
  service: SupabaseClient,
  code: string,
  organizationId?: string
): Promise<LegalEntityCompanyProfile> {
  let query = service
    .from('legal_entities')
    .select(LEGAL_ENTITY_PROFILE_SELECT)
    .eq('code', code);

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data } = await query.maybeSingle();
  if (data) return mapLegalEntityProfileRow(data as LegalEntityProfileRow);
  return getStaticLegalEntityProfile(code);
}

export async function loadAllLegalEntityProfiles(
  service: SupabaseClient,
  organizationId: string
): Promise<LegalEntityCompanyProfile[]> {
  const { data } = await service
    .from('legal_entities')
    .select(LEGAL_ENTITY_PROFILE_SELECT)
    .eq('organization_id', organizationId)
    .eq('status', 'ACTIVE')
    .order('sort_order');

  if (!data?.length) {
    return Object.values(STATIC_LEGAL_ENTITY_PROFILES);
  }

  return data.map((row) => mapLegalEntityProfileRow(row as LegalEntityProfileRow));
}

export function profileToReceiptIssuer(profile: LegalEntityCompanyProfile) {
  return {
    code: profile.code,
    legal_name: profile.legalName,
    name: profile.name,
    address: profile.address,
    phone: profile.phone,
    email: profile.email,
    registration_no: profile.registrationNo,
    tax_id: profile.taxId,
    bank_name: profile.bankName,
    bank_account_name: profile.bankAccountName,
    bank_account_no: profile.bankAccountNo,
  };
}
