'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { OperationsReportReceipt, OperationsReportReceiptItem } from '@/lib/reports/operations-types';
import { reportUrl, type Filters } from './model';
import { count, ExportCsv, ReportError, ReportLoading, ReportTable, RM, statusLabel, time, useReport, type Column } from './report-ui';

const items: Column<OperationsReportReceiptItem>[] = [
 { id: 'name', label: 'Item', cell: (item) => item.name || '—' },
 { id: 'sku', label: 'SKU', cell: (item) => item.sku || '—' },
 { id: 'quantity', label: 'Kuantiti', numeric: true, cell: (item) => count(item.quantity) },
 { id: 'unit_price', label: 'Harga seunit', numeric: true, cell: (item) => RM(item.unit_price) },
 { id: 'line_total', label: 'Jumlah item', numeric: true, cell: (item) => RM(item.line_total) },
];

function ReceiptDetails({ receipt }: { receipt: OperationsReportReceipt }) {
 const fields = [
  ['No. resit', receipt.receipt_number || '—'],
  ['No. transaksi', receipt.transaction_number || '—'],
  ['Cawangan asal', [receipt.branch_name, receipt.branch_code].filter(Boolean).join(' · ') || '—'],
  ['Juruwang asal', receipt.cashier_name || '—'],
  ['Syif asal', receipt.shift_number || '—'],
  ['Status transaksi', statusLabel(receipt.status)],
  ['Masa jualan asal (MYT)', time(receipt.sold_at)],
  ['Masa bayaran disahkan (MYT)', time(receipt.payment_confirmed_at)],
  ...(receipt.reversed_at || receipt.reversal_reason ? [
   ['Masa batal / pulangan (MYT)', time(receipt.reversed_at)],
   ['Sebab batal / pulangan', receipt.reversal_reason || '—'],
  ] : []),
 ];
 const amounts = [
  ['Jumlah asal selepas diskaun', receipt.transaction_total], ['Diskaun asal', receipt.discount_amount],
  ['Jualan bersih direkodkan', receipt.recorded_sales],
  ['Jualan bersih disahkan', receipt.net_sales], ['Kutipan disahkan', receipt.confirmed],
  ['Tunai jualan', receipt.cash], ['QR disahkan', receipt.qr],
 ] as const;
 return <div className="min-w-0 space-y-4">
  <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-3">
   {fields.map(([label, value]) => <div key={label}>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="font-medium wrap-break-word">{value}</dd>
   </div>)}
  </dl>
  <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3 tabular-nums sm:grid-cols-3">
   {amounts.filter(([, value]) => value != null).map(([label, value]) => <div key={label}>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="font-semibold">{RM(value)}</dd>
   </div>)}
  </dl>
  <ReportTable title="Item resit" columns={items} rows={receipt.items} rowKey={(_, index) => String(index)}
   emptyText="Tiada item direkodkan untuk resit ini." />
  <p className="text-xs text-muted-foreground">
   Amaun item merujuk kepada baris resit asal. Ia bukan jumlah kutipan yang disahkan.
  </p>
 </div>;
}

function ReceiptBody({ transactionId, filters }: { transactionId: string; filters: Filters }) {
 const [revision, setRevision] = useState(0);
 const result = useReport(reportUrl('receipt', filters, { transactionId }), revision);
 if (!result) return <ReportLoading />;
 if (result.error || !result.data?.receipt) {
  return <ReportError error={result.error || 'Resit tidak dijumpai dalam skop laporan ini.'} retry={() => setRevision((n) => n + 1)} />;
 }
 return <>
  <ReceiptDetails receipt={result.data.receipt} />
  <p className="text-xs text-muted-foreground">Dijana: {time(result.data.generated_at)} MYT</p>
  <ExportCsv url={reportUrl('receipt', filters, { transactionId, csv: true })} />
 </>;
}

export function ReceiptDialog({ transactionId, filters, opener, close }: {
 transactionId: string | null;
 filters: Filters;
 opener?: HTMLButtonElement;
 close: () => void;
}) {
 return <Dialog open={Boolean(transactionId)} onOpenChange={(open) => { if (!open) close(); }}>
  <DialogContent showCloseButton={false} finalFocus={() => opener} className="min-w-0 sm:max-w-3xl">
   <DialogHeader className="flex-row items-start justify-between gap-3">
    <div className="space-y-2">
     <DialogTitle>Butiran resit</DialogTitle>
     <DialogDescription>Jualan asal dan masa pengesahan bayaran dipaparkan berasingan. Semua waktu dalam MYT.</DialogDescription>
    </div>
    <DialogClose render={<Button type="button" variant="outline" />}>Tutup</DialogClose>
   </DialogHeader>
   {transactionId && <ReceiptBody key={transactionId} transactionId={transactionId} filters={filters} />}
  </DialogContent>
 </Dialog>;
}
