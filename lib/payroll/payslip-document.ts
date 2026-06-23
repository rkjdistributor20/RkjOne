import type { PayrollProposalLine } from '@/lib/payroll/ai-proposal';

export type PayslipDocumentInput = {
  company_name: string;
  company_code: string;
  period_label: string;
  period_start: string;
  period_end: string;
  staff_name: string;
  staff_code: string;
  branch_name: string | null;
  worker_type: 'LOCAL' | 'FOREIGN';
  line: PayrollProposalLine;
  generated_at: string;
};

function fmt(n: number) {
  return `RM ${n.toFixed(2)}`;
}

function row(label: string, amount: number, bold = false) {
  if (amount === 0) return '';
  return `<tr>
    <td style="padding:6px 0;color:#444">${label}</td>
    <td style="padding:6px 0;text-align:right;font-weight:${bold ? 700 : 400}">${fmt(amount)}</td>
  </tr>`;
}

export function renderPayslipHtml(input: PayslipDocumentInput): string {
  const { line } = input;
  const workerLabel = input.worker_type === 'FOREIGN' ? 'Pekerja Asing (Mingguan)' : 'Staf Tempatan (Bulanan)';

  const earnings =
    row('Gaji Pokok', line.basic_salary) +
    row('Elaun Kehadiran', line.attendance_allowance) +
    row('Bayaran Shift', line.shift_pay) +
    row('Bayaran OT', line.ot_pay) +
    row('Komisen', line.commission);

  const deductions =
    row('EPF (11%)', line.epf) +
    row('SOCSO', line.socso) +
    row('EIS', line.eis);

  return `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="utf-8"/>
  <title>Slip Gaji — ${input.staff_name} — ${input.period_label}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 720px; margin: 0 auto; padding: 32px; color: #111; }
    .header { border-bottom: 3px solid #ea580c; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 22px; font-weight: 700; color: #ea580c; }
    .meta { font-size: 13px; color: #666; margin-top: 4px; }
    h2 { font-size: 16px; margin: 24px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .total { border-top: 2px solid #111; font-size: 16px; }
    .footer { margin-top: 32px; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 12px; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">RKJ One — Slip Gaji</div>
    <div class="meta">${input.company_name} (${input.company_code})</div>
    <div class="meta">Tempoh: ${input.period_label} (${input.period_start} — ${input.period_end})</div>
  </div>

  <table>
    <tr><td style="width:140px;color:#666">Nama</td><td><strong>${input.staff_name}</strong></td></tr>
    <tr><td style="color:#666">Kod Staf</td><td>${input.staff_code}</td></tr>
    <tr><td style="color:#666">Cawangan</td><td>${input.branch_name ?? '—'}</td></tr>
    <tr><td style="color:#666">Kategori</td><td>${workerLabel}</td></tr>
    <tr><td style="color:#666">Asas Pengiraan</td><td>${line.pay_basis}</td></tr>
  </table>

  <h2>Pendapatan</h2>
  <table>${earnings || '<tr><td colspan="2">—</td></tr>'}</table>

  ${line.epf + line.socso + line.eis > 0 ? `<h2>Potongan</h2><table>${deductions}</table>` : ''}

  <h2>Ringkasan</h2>
  <table>
    ${row('Jumlah Kasar', line.gross_pay, true)}
    ${row('Jumlah Potongan', line.epf + line.socso + line.eis, true)}
    <tr class="total">
      <td style="padding:10px 0;font-weight:700">GAJI BERSIH</td>
      <td style="padding:10px 0;text-align:right;font-weight:700;font-size:18px;color:#ea580c">${fmt(line.net_pay)}</td>
    </tr>
  </table>

  <div class="footer">
    Dokumen dijana automatik oleh RKJ One Payroll AI · ${new Date(input.generated_at).toLocaleString('ms-MY')}
    · Untuk kegunaan peribadi pekerja sahaja. Cetak atau simpan sebagai PDF melalui pencetak browser.
  </div>
</body>
</html>`;
}

export function payslipFileName(staffCode: string, periodLabel: string) {
  const safe = periodLabel.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);
  return `slip-${staffCode}-${safe}.html`;
}
