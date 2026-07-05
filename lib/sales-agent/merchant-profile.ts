import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_AGENT_EMPLOYER_CODE } from '@/lib/brand/legal-entities';
import {
 type LegalEntityCompanyProfile,
 getStaticLegalEntityProfile,
 loadLegalEntityProfile,
} from '@/lib/brand/legal-entity-profile';

export type MerchantProfile = LegalEntityCompanyProfile;

export function getRkjDistributorMerchantProfile(): MerchantProfile {
 return getStaticLegalEntityProfile(SALES_AGENT_EMPLOYER_CODE);
}

export async function loadMerchantProfile(
 service: SupabaseClient,
 code: string = SALES_AGENT_EMPLOYER_CODE,
 organizationId?: string): Promise<MerchantProfile> {
 return loadLegalEntityProfile(service, code, organizationId);
}

export function merchantProfileCompleteForLivePayments(profile: MerchantProfile): boolean {
 return Boolean(
 profile.bankName &&
 profile.bankAccountName &&
 profile.bankAccountNo &&
 process.env.SALES_AGENT_PAYMENT_MERCHANT_ID?.trim());
}
