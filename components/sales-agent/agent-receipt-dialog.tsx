'use client';

import { Printer, Share2 } from 'lucide-react';
import type { AgentPaymentReceipt } from '@/lib/sales-agent/types';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { formatRM } from '@/components/shared/module-ui';
import { Button } from '@/components/ui/button';
import {
 Dialog,
 DialogContent,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

const PURPOSE_LABEL: Record<string, string> = {
 STOCK_ORDER: 'Resit Bayaran Order Stok',
 POS_SUBSCRIPTION: 'Resit Langganan POS',
};

const METHOD_LABEL: Record<string, string> = {
 FPX: 'FPX (Online Banking)',
 CARD: 'Kad Kredit',
 DEBIT: 'Kad Debit',
};

type AgentReceiptDialogProps = {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 receipt: AgentPaymentReceipt | null;
};

function formatDateTime(iso: string) {
 try {
 return new Date(iso).toLocaleString('ms-MY', {
 dateStyle: 'medium',
 timeStyle: 'short',
 });
 } catch {
 return iso;
 }
}

export function AgentReceiptDialog({ open, onOpenChange, receipt }: AgentReceiptDialogProps) {
 if (!receipt) return null;

 async function handleShare() {
 const lines = [
 receipt!.issuer.legal_name,
 PURPOSE_LABEL[receipt!.purpose] ?? receipt!.purpose,
 `No. Resit: ${receipt!.receipt_number}`,
 receipt!.order ? `Order: ${receipt!.order.order_number}` : '',
 receipt!.subscription ? `Cawangan: ${receipt!.subscription.outlet_name}` : '',
 `Jumlah: ${formatRM(receipt!.payment.amount_rm)}`,
 `Kaedah: ${METHOD_LABEL[receipt!.payment.method] ?? receipt!.payment.method}`,
 receipt!.payment.gateway_ref ? `Rujukan: ${receipt!.payment.gateway_ref}` : '',
 ' - Resit rasmi RKJ Distributor Sdn Bhd',
 ].filter(Boolean);

 const text = lines.join('\n');
 if (navigator.share) {
 await navigator.share({ title: receipt!.receipt_number, text });
 } else {
 await navigator.clipboard.writeText(text);
 }
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
 <DialogHeader>
 <DialogTitle className="text-center">
 {PURPOSE_LABEL[receipt.purpose] ?? 'Resit Rasmi'}
 </DialogTitle>
 </DialogHeader>

 <div id="agent-official-receipt" className="space-y-4 text-sm">
 <div className="flex flex-col items-center gap-2 text-center">
 <LegalEntityLogo size={52} />
 <div>
 <p className="text-base font-bold">{receipt.issuer.legal_name}</p>
 {receipt.issuer.address && (
 <p className="text-xs text-muted-foreground">{receipt.issuer.address}</p>)}
 <div className="mt-1 flex flex-wrap justify-center gap-x-3 text-xs text-muted-foreground">
 {receipt.issuer.phone && <span>Tel: {receipt.issuer.phone}</span>}
 {receipt.issuer.email && <span>{receipt.issuer.email}</span>}
 </div>
 {(receipt.issuer.registration_no || receipt.issuer.tax_id) && (
 <p className="mt-1 text-xs text-muted-foreground">
 {[receipt.issuer.registration_no && `SSM: ${receipt.issuer.registration_no}`].concat(receipt.issuer.tax_id ? [`SST: ${receipt.issuer.tax_id}`] : []).join(' - ')}
 </p>)}
 </div>
 </div>

 <Separator />

 <div className="grid gap-1 text-xs">
 <div className="flex justify-between">
 <span className="text-muted-foreground">No. Resit</span>
 <span className="font-mono font-semibold">{receipt.receipt_number}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">Tarikh</span>
 <span>{formatDateTime(receipt.issued_at)}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">Ejen</span>
 <span className="text-right font-medium">{receipt.agent.company_name}</span>
 </div>
 {receipt.agent.registration_no && (
 <div className="flex justify-between">
 <span className="text-muted-foreground">No. Pendaftaran Ejen</span>
 <span>{receipt.agent.registration_no}</span>
 </div>)}
 </div>

 <Separator />

 {receipt.order && (
 <div className="space-y-2">
 <p className="font-semibold">Butiran Order Stok</p>
 <div className="rounded-lg border bg-muted/30 p-3 text-xs">
 <div className="mb-2 flex justify-between">
 <span>{receipt.order.order_number}</span>
 <span>Production {receipt.order.production_date}</span>
 </div>
 {receipt.order.items.map((item, idx) => (
 <div key={idx} className="flex justify-between gap-2 border-t py-1 first:border-t-0">
 <span>
 {item.quantity} {item.unit} - {item.item_name}
 </span>
 <span>{formatRM(item.line_total_rm)}</span>
 </div>))}
 </div>
 </div>)}

 {receipt.subscription && (
 <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-xs">
 <p className="font-semibold">Langganan POS</p>
 <p>
 {receipt.subscription.outlet_name} ({receipt.subscription.outlet_code})
 </p>
 <p className="text-muted-foreground">
 Tempoh {receipt.subscription.period_start} - {receipt.subscription.period_end}
 </p>
 </div>)}

 <Separator />

 <div className="space-y-1 text-xs">
 <div className="flex justify-between">
 <span className="text-muted-foreground">Kaedah bayaran</span>
 <span>{METHOD_LABEL[receipt.payment.method] ?? receipt.payment.method}</span>
 </div>
 {receipt.payment.gateway_ref && (
 <div className="flex justify-between">
 <span className="text-muted-foreground">Rujukan transaksi</span>
 <span className="font-mono text-[11px]">{receipt.payment.gateway_ref}</span>
 </div>)}
 <div className="flex justify-between text-base font-bold">
 <span>JUMLAH DIBAYAR</span>
 <span className="text-emerald-800">{formatRM(receipt.payment.amount_rm)}</span>
 </div>
 </div>

 {(receipt.issuer.bank_name || receipt.issuer.bank_account_no) && (
 <>
 <Separator />
 <div className="rounded-lg border border-dashed p-3 text-xs">
 <p className="font-semibold">Akaun Penerima (RKJ Distributor)</p>
 {receipt.issuer.bank_name && <p>Bank: {receipt.issuer.bank_name}</p>}
 {receipt.issuer.bank_account_name && <p>Nama: {receipt.issuer.bank_account_name}</p>}
 {receipt.issuer.bank_account_no && (
 <p className="font-mono">No. Akaun: {receipt.issuer.bank_account_no}</p>)}
 </div>
 </>)}

 <p className="text-center text-xs text-muted-foreground">
 Resit rasmi elektronik - RKJ One - {receipt.issuer.legal_name}
 </p>
 </div>

 <DialogFooter className="gap-2 sm:gap-0">
 <Button variant="outline" onClick={() => void handleShare()}>
 <Share2 className="mr-2 h-4 w-4" />
 Kongsi
 </Button>
 <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => window.print()}>
 <Printer className="mr-2 h-4 w-4" />
 Cetak Resit
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>);
}
