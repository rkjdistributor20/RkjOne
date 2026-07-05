import type { SupabaseClient } from '@supabase/supabase-js';
import {
 DEFAULT_SALES_LEGAL_ENTITY_CODE,
 LEGAL_ENTITY_CODES,
 defaultLegalEntityCodeForRole,
 type LegalEntityCode,
} from '@/lib/brand/legal-entities';

export type LegalEntityRow = {
 id: string;
 code: string;
 name: string;
 legal_name: string;
 scope: string | null;
 sort_order: number;
};

export async function loadLegalEntities(
 supabase: SupabaseClient,
 organizationId: string): Promise<LegalEntityRow[]> {
 const { data, error } = await supabase.from('legal_entities').select('id, code, name, legal_name, scope, sort_order').eq('organization_id', organizationId).eq('status', 'ACTIVE').order('sort_order');

 if (error) throw new Error(error.message);
 return (data ?? []) as LegalEntityRow[];
}

export async function resolveLegalEntityId(
 supabase: SupabaseClient,
 organizationId: string,
 code: string | null | undefined): Promise<string | null> {
 const normalized = (code ?? DEFAULT_SALES_LEGAL_ENTITY_CODE).trim().toUpperCase();
 if (!LEGAL_ENTITY_CODES.includes(normalized as LegalEntityCode)) {
 throw new Error('Syarikat majikan tidak sah');
 }

 const { data, error } = await supabase.from('legal_entities').select('id').eq('organization_id', organizationId).eq('code', normalized).maybeSingle();

 if (error) throw new Error(error.message);
 if (!data?.id) throw new Error('Rekod syarikat tidak dijumpai - jalankan migration 00067');
 return data.id as string;
}

export async function resolveLegalEntityIdForRole(
 supabase: SupabaseClient,
 organizationId: string,
 role: string): Promise<string | null> {
 const code = defaultLegalEntityCodeForRole(role);
 if (!code) return null;
 return resolveLegalEntityId(supabase, organizationId, code);
}
