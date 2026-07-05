'use client';

import { Crown } from 'lucide-react';
import type { HrStaffPerson } from '@/lib/hr/company-hr';
import { LEGAL_ENTITIES } from '@/lib/brand/legal-entities';
import { ROLE_LABELS } from '@/types/enums';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { Badge } from '@/components/ui/badge';
import { SectionCard, formatRM } from '@/components/shared/module-ui';

function roleLabel(role: HrStaffPerson['role']) {
 if (role === 'STAFF_RECORD') return 'Rekod Staf';
 return ROLE_LABELS[role] ?? role;
}

function payLine(amount: number | null | undefined, period: 'bulan' | 'minggu') {
 if (amount == null) return ' - ';
 return `${formatRM(Number(amount))}/${period}`;
}

export function HrGroupOwnerSection({ owners }: { owners: HrStaffPerson[] }) {
 if (owners.length === 0) return null;

 return (
 <SectionCard
 title={
 <span className="flex items-center gap-2">
 <Crown className="h-4 w-4 text-amber-600" />
 Pemilik Kumpulan - Profil Gabungan
 </span>
 }
 description="Satu profil HR merentas ketiga-tiga syarikat legal - gaji majikan dipapar mengikut syarikat dan jumlah keseluruhan."
 action={<Badge variant="secondary">{owners.length} pemilik</Badge>}
 >
 <div className="space-y-4">
 {owners.map((owner) => (
 <div
 key={owner.profile_id ?? owner.id}
 className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-background p-4"
 >
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <div className="flex flex-wrap items-center gap-2">
 <p className="text-base font-semibold text-foreground">{owner.full_name}</p>
 <Badge className="bg-amber-500 hover:bg-amber-500">Pemilik 3 Syarikat</Badge>
 {owner.status !== 'ACTIVE' && <Badge variant="secondary">{owner.status}</Badge>}
 </div>
 <p className="mt-1 text-xs text-muted-foreground">
 {owner.staff_code} - {roleLabel(owner.role)} - {owner.email ?? ' - '}
 </p>
 </div>
 <div className="text-right text-sm">
 <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
 Jumlah gaji kumpulan
 </p>
 <p className="text-lg font-bold text-foreground">
 {payLine(owner.total_monthly_amount, 'bulan')}
 </p>
 </div>
 </div>

 <div className="mt-4 grid gap-2 md:grid-cols-3">
 {(owner.employments ?? []).map((employment) => {
 const entity = LEGAL_ENTITIES.find((e) => e.code === employment.legal_entity_code);
 return (
 <div
 key={employment.staff_id}
 className="rounded-lg border bg-background/90 px-3 py-3 text-sm"
 >
 <div className="flex items-center gap-2">
 <LegalEntityLogo size={20} />
 <div className="min-w-0">
 <p className="truncate font-medium">{employment.legal_entity_name}</p>
 <p className="text-xs text-muted-foreground">
 {entity?.code ?? employment.legal_entity_code} - {employment.staff_code}
 </p>
 </div>
 </div>
 <p className="mt-2 font-semibold text-foreground">
 {payLine(employment.monthly_amount, 'bulan')}
 </p>
 <p className="text-xs text-muted-foreground">Managing Director / Pemilik</p>
 </div>);
 })}
 </div>
 </div>))}
 </div>
 </SectionCard>);
}
