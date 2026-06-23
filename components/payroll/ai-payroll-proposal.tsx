'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Bot, Building2, Download, Send, Sparkles, Users } from 'lucide-react';
import {
  distributePayslips,
  fetchAiPayrollProposal,
} from '@/lib/payroll/api';
import type { AiPayrollProposal, ProposalPeriodType } from '@/lib/payroll/ai-proposal';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { WorkerTypeBadge } from '@/components/payroll/worker-type-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatRM, KpiCard, KpiGrid } from '@/components/shared/module-ui';

function ProposalTable({
  lines,
  workerLabel,
}: {
  lines: AiPayrollProposal['companies'][0]['foreign_lines'];
  workerLabel: string;
}) {
  if (lines.length === 0) {
    return <p className="text-xs text-muted-foreground">Tiada {workerLabel} dalam tempoh ini.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-muted-foreground">
            <th className="p-2">Staf</th>
            <th className="p-2">Cawangan</th>
            <th className="p-2">Asas</th>
            <th className="p-2">Kasar</th>
            <th className="p-2">Bersih</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.staff_id} className="border-b">
              <td className="p-2">
                <p className="font-medium">{line.full_name}</p>
                <p className="text-muted-foreground">{line.staff_code}</p>
                {line.flags.length > 0 && (
                  <p className="mt-1 text-[10px] text-amber-600">{line.flags[0]}</p>
                )}
              </td>
              <td className="p-2">{line.branch_name ?? '—'}</td>
              <td className="p-2 max-w-[180px] text-muted-foreground">{line.pay_basis}</td>
              <td className="p-2 tabular-nums">{formatRM(line.gross_pay)}</td>
              <td className="p-2 font-medium tabular-nums">{formatRM(line.net_pay)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AiPayrollProposalSection() {
  const [periodType, setPeriodType] = useState<ProposalPeriodType>('WEEKLY');
  const [proposal, setProposal] = useState<AiPayrollProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [distributing, setDistributing] = useState(false);

  const loadProposal = useCallback(async (type: ProposalPeriodType) => {
    setLoading(true);
    try {
      const res = await fetchAiPayrollProposal(type);
      setProposal(res.proposal);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal jana cadangan AI');
      setProposal(null);
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleGenerate(type: ProposalPeriodType) {
    setPeriodType(type);
    await loadProposal(type);
  }

  async function handleDistribute() {
    if (!proposal) return;
    setDistributing(true);
    try {
      const res = await distributePayslips({
        period_type: periodType,
        period_start: proposal.period_start,
        period_end: proposal.period_end,
        period_label: proposal.period_label,
        proposal,
      });
      toast.success(
        `Slip dihantar ke ${res.distributed} dashboard staf` +
          (res.skipped ? ` · ${res.skipped} dilangkau` : '')
      );
      if (res.errors.length > 0) {
        toast.warning(`${res.errors.length} ralat — semak log`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal hantar slip');
    } finally {
      setDistributing(false);
    }
  }

  return (
    <Card className="border-violet-200 bg-gradient-to-br from-violet-50/80 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-5 w-5 text-violet-600" />
          Pembantu AI — Cadangan Gaji
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          AI menganalisis shift, peraturan PR001–PR005, komisen POS dan pecahkan ikut 3 syarikat.
          Selepas semak, hantar slip terus ke dashboard semua staf.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={periodType === 'WEEKLY' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleGenerate('WEEKLY')}
            disabled={loading}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            Cadangan Mingguan (Asing)
          </Button>
          <Button
            variant={periodType === 'MONTHLY' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleGenerate('MONTHLY')}
            disabled={loading}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            Cadangan Bulanan (Tempatan)
          </Button>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground">AI sedang mengira cadangan gaji…</p>
        )}

        {proposal && !loading && (
          <>
            <div className="rounded-lg border bg-white/80 p-3 text-sm">
              <p className="font-medium text-violet-900">{proposal.period_label}</p>
              <p className="mt-1 text-muted-foreground">{proposal.summary}</p>
              <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                {proposal.insights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {proposal.warnings.length > 0 && (
                <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                  {proposal.warnings.slice(0, 5).map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              )}
            </div>

            <KpiGrid cols={4}>
              <KpiCard title="Staf" value={proposal.totals.staff_count} icon={Users} />
              <KpiCard title="Pekerja Asing" value={proposal.totals.foreign_count} variant="warning" />
              <KpiCard title="Staf Tempatan" value={proposal.totals.local_count} />
              <KpiCard title="Jumlah Bersih" value={formatRM(proposal.totals.net)} />
            </KpiGrid>

            <Tabs defaultValue={proposal.companies[0]?.company_code ?? 'RKJ'}>
              <TabsList>
                {proposal.companies.map((c) => (
                  <TabsTrigger key={c.company_code} value={c.company_code} className="gap-1">
                    <Building2 className="h-3 w-3" />
                    {c.company_code}
                  </TabsTrigger>
                ))}
              </TabsList>
              {proposal.companies.map((company) => (
                <TabsContent key={company.company_code} value={company.company_code} className="mt-3 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <LegalEntityLogo size={22} />
                    <span className="font-semibold">{company.company_name}</span>
                    <Badge variant="outline">{formatRM(company.total_net)} bersih</Badge>
                  </div>

                  {company.foreign_lines.length > 0 && (
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                        <WorkerTypeBadge workerType="FOREIGN" />
                        Pekerja Asing — {formatRM(company.foreign_total_net)}
                      </p>
                      <ProposalTable lines={company.foreign_lines} workerLabel="pekerja asing" />
                    </div>
                  )}

                  {company.local_lines.length > 0 && (
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                        <WorkerTypeBadge workerType="LOCAL" />
                        Staf Tempatan — {formatRM(company.local_total_net)}
                      </p>
                      <ProposalTable lines={company.local_lines} workerLabel="staf tempatan" />
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>

            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <Button
                className="bg-violet-600 hover:bg-violet-700"
                onClick={handleDistribute}
                disabled={distributing || proposal.totals.staff_count === 0}
              >
                <Send className="mr-1.5 h-4 w-4" />
                {distributing ? 'Menghantar slip…' : 'Sahkan & Hantar Slip ke Dashboard Staf'}
              </Button>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Download className="h-3.5 w-3.5" />
                Staf boleh muat turun slip dari dashboard / profil mereka
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
