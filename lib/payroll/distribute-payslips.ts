import type { SupabaseClient } from '@supabase/supabase-js';
import {
  companyForLine,
  flattenProposalLines,
  type AiPayrollProposal,
} from '@/lib/payroll/ai-proposal';
import { payslipFileName, renderPayslipHtml } from '@/lib/payroll/payslip-document';

const BUCKET = 'staff-payslips';

export type DistributeResult = {
  distributed: number;
  skipped: number;
  errors: string[];
  payslip_ids: string[];
};

export async function distributePayslipsFromProposal(
  service: SupabaseClient,
  organizationId: string,
  proposal: AiPayrollProposal,
  publishedBy: string,
  payrollRunId?: string | null
): Promise<DistributeResult> {
  const lines = flattenProposalLines(proposal);
  const result: DistributeResult = {
    distributed: 0,
    skipped: 0,
    errors: [],
    payslip_ids: [],
  };

  for (const line of lines) {
    if (!line.profile_id) {
      result.skipped += 1;
      continue;
    }
    if (line.net_pay <= 0 && line.gross_pay <= 0) {
      result.skipped += 1;
      continue;
    }

    const company = companyForLine(proposal, line.staff_id);
    if (!company) {
      result.errors.push(`${line.staff_code}: syarikat tidak dijumpai`);
      continue;
    }

    const fileName = payslipFileName(line.staff_code, proposal.period_label);
    const html = renderPayslipHtml({
      company_name: company.company_name,
      company_code: company.company_code,
      period_label: proposal.period_label,
      period_start: proposal.period_start,
      period_end: proposal.period_end,
      staff_name: line.full_name,
      staff_code: line.staff_code,
      branch_name: line.branch_name,
      worker_type: line.worker_type,
      line,
      generated_at: proposal.generated_at,
    });

    const buffer = Buffer.from(html, 'utf-8');
    const objectPath = `${line.profile_id}/system/${Date.now()}-${fileName}`;

    const { error: uploadErr } = await service.storage.from(BUCKET).upload(objectPath, buffer, {
      upsert: true,
      contentType: 'text/html',
    });

    if (uploadErr) {
      result.errors.push(`${line.staff_code}: ${uploadErr.message}`);
      continue;
    }

    const { data: legalEntity } = await service
      .from('legal_entities')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('code', company.company_code)
      .maybeSingle();

    const { data: inserted, error: insertErr } = await (service as SupabaseClient)
      .from('staff_payslips')
      .insert({
        organization_id: organizationId,
        profile_id: line.profile_id,
        staff_id: line.staff_id,
        legal_entity_id: legalEntity?.id ?? null,
        period_label: proposal.period_label,
        period_start: proposal.period_start,
        period_end: proposal.period_end,
        file_name: fileName,
        storage_path: objectPath,
        mime_type: 'text/html',
        file_size: buffer.length,
        notes: `Dihantar automatik — ${line.pay_basis}`,
        uploaded_by: publishedBy,
        published_by: publishedBy,
        source: 'SYSTEM',
        payroll_run_id: payrollRunId ?? null,
        gross_pay: line.gross_pay,
        net_pay: line.net_pay,
      })
      .select('id')
      .single();

    if (insertErr) {
      result.errors.push(`${line.staff_code}: ${insertErr.message}`);
      await service.storage.from(BUCKET).remove([objectPath]);
      continue;
    }

    result.distributed += 1;
    result.payslip_ids.push(inserted.id as string);
  }

  return result;
}
