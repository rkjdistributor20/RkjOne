import { SALES_AGENT_EMPLOYER_CODE, getLegalEntityByCode } from '@/lib/brand/legal-entities';

/** Maklumat penerima bayaran — isi env / minta pemilik untuk live FPX */
export type MerchantProfile = {
  code: string;
  legalName: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  registrationNo: string | null;
  taxId: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
};

export function getRkjDistributorMerchantProfile(): MerchantProfile {
  const entity = getLegalEntityByCode(SALES_AGENT_EMPLOYER_CODE);
  return {
    code: SALES_AGENT_EMPLOYER_CODE,
    legalName: entity?.legalName ?? 'RKJ Distributor Sdn Bhd',
    name: entity?.name ?? 'RKJ Distributor',
    address: process.env.RKJ_DIST_COMPANY_ADDRESS?.trim() || null,
    phone: process.env.RKJ_DIST_COMPANY_PHONE?.trim() || null,
    email: process.env.RKJ_DIST_COMPANY_EMAIL?.trim() || null,
    registrationNo: process.env.RKJ_DIST_SSM?.trim() || null,
    taxId: process.env.RKJ_DIST_SST?.trim() || null,
    bankName: process.env.RKJ_DIST_BANK_NAME?.trim() || null,
    bankAccountName: process.env.RKJ_DIST_BANK_ACCOUNT_NAME?.trim() || null,
    bankAccountNo: process.env.RKJ_DIST_BANK_ACCOUNT_NO?.trim() || null,
  };
}

export function merchantProfileCompleteForLivePayments(profile: MerchantProfile): boolean {
  return Boolean(
    profile.bankName &&
      profile.bankAccountName &&
      profile.bankAccountNo &&
      process.env.SALES_AGENT_PAYMENT_MERCHANT_ID?.trim()
  );
}
