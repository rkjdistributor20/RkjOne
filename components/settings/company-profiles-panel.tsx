'use client';

import { useEffect, useState } from 'react';
import { Building2, Landmark, Mail, MapPin, Phone, Receipt } from 'lucide-react';
import type { LegalEntityCompanyProfile } from '@/lib/brand/legal-entity-profile';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ModuleLoading, SectionCard } from '@/components/shared/module-ui';

export function CompanyProfilesPanel() {
  const [companies, setCompanies] = useState<LegalEntityCompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/legal-entities');
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Gagal muat profil syarikat');
        setCompanies(body.companies ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal muat');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <ModuleLoading rows={2} />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <SectionCard
      title="Profil Syarikat Kumpulan"
      description="Maklumat rasmi tiga entiti undang-undang — dipapar pada resit bayaran ejen dan dokumen syarikat."
    >
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {companies.map((c) => (
          <Card key={c.code} className="overflow-hidden border-muted/80">
            <CardHeader className="space-y-3 bg-muted/20 pb-4">
              <div className="flex items-start gap-3">
                <LegalEntityLogo size={44} />
                <div className="min-w-0 flex-1">
                  <Badge variant="outline" className="mb-1 font-mono text-[10px]">
                    {c.code}
                  </Badge>
                  <CardTitle className="text-base leading-snug">{c.legalName}</CardTitle>
                  {c.scope && <p className="mt-1 text-xs text-muted-foreground">{c.scope}</p>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-4 text-sm">
              {c.address && (
                <div className="flex gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p>{c.address}</p>
                </div>
              )}
              {c.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{c.phone}</span>
                </div>
              )}
              {c.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="break-all">{c.email}</span>
                </div>
              )}
              {c.registrationNo && (
                <div className="flex items-start gap-2">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>SSM: {c.registrationNo}</span>
                </div>
              )}
              {c.taxId && (
                <div className="flex items-start gap-2">
                  <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>SST: {c.taxId}</span>
                </div>
              )}
              {(c.bankName || c.bankAccountNo) && (
                <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold">
                    <Landmark className="h-3.5 w-3.5" />
                    Akaun Bank
                  </div>
                  {c.bankName && <p>Bank: {c.bankName}</p>}
                  {c.bankAccountName && <p>Nama: {c.bankAccountName}</p>}
                  {c.bankAccountNo && <p className="font-mono">No: {c.bankAccountNo}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </SectionCard>
  );
}
