'use client';

import { useState } from 'react';
import { Loader2, Printer, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatRM } from '@/lib/pos/utils';
import type { SaleResult } from '@/lib/pos/types';
import { printReceiptDirect, type ReceiptPrinterStatus } from '@/lib/pos/receipt-printer-client';
import { ReceiptPrinterSettings } from '@/components/pos/receipt-printer-settings';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

interface ReceiptDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 receipt: SaleResult | null;
 branchName?: string;
}

export function ReceiptDialog({ open, onOpenChange, receipt, branchName }: ReceiptDialogProps) {
 const [printerStatus, setPrinterStatus] = useState<ReceiptPrinterStatus | null>(null);
 const [printing, setPrinting] = useState(false);

 if (!receipt) return null;

 const directPrinterReady = Boolean(
  printerStatus?.nativeAndroid
  && printerStatus.permissionGranted
  && printerStatus.bluetoothEnabled
  && printerStatus.selectedPrinter
  && printerStatus.pairedPrinters.some((printer) => printer.address === printerStatus.selectedPrinter?.address),
 );

 async function handlePrint() {
  if (!directPrinterReady) {
   window.print();
   return;
  }

  setPrinting(true);
  try {
   const result = await printReceiptDirect(receipt!, branchName);
   toast.success(`Resit dihantar ke ${result.printerName}.`);
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Cetakan Bluetooth gagal. Gunakan Cetak sistem.');
  } finally {
   setPrinting(false);
  }
 }

 async function handleShare() {
  const text = [
   'RKJ One - Roti Kaya Junus',
   branchName ?? '',
   `Receipt: ${receipt!.receipt_number}`,
   `TX: ${receipt!.transaction_number}`,
   '---',
   ...receipt!.items.map((item) => `${item.quantity}x ${item.name} - ${formatRM(item.line_total)}`),
   '---',
   `Total: ${formatRM(receipt!.total)}`,
   receipt!.change_amount > 0 ? `Change: ${formatRM(receipt!.change_amount)}` : '',
   'Terima kasih!',
  ].filter(Boolean).join('\n');

  try {
   if (navigator.share) {
    await navigator.share({ title: 'RKJ Receipt', text });
   } else {
    await navigator.clipboard.writeText(text);
    toast.success('Teks resit disalin.');
   }
  } catch (error) {
   if (error instanceof Error && error.name !== 'AbortError') toast.error('Resit tidak dapat dikongsi.');
  }
 }

 return (
  <Dialog open={open} onOpenChange={onOpenChange}>
   <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
    <DialogHeader><DialogTitle className="text-center">Resit pelanggan</DialogTitle></DialogHeader>

    <div id="pos-receipt" className="space-y-3 font-mono text-sm">
     <div className="text-center">
      <p className="font-bold">ROTI KAYA JUNUS</p>
      <p className="text-xs text-muted-foreground">{branchName}</p>
      <p className="text-xs">{receipt.receipt_number}</p>
      <p className="text-xs">{receipt.transaction_number}</p>
     </div>
     <Separator />
     {receipt.items.map((item, index) => (
      <div key={`${item.sku}-${index}`} className="flex justify-between gap-2">
       <span className="min-w-0 flex-1 break-words">{item.quantity}x {item.name}</span>
       <span>{formatRM(item.line_total)}</span>
      </div>
     ))}
     <Separator />
     {receipt.discount > 0 && (
      <>
       <div className="flex justify-between"><span>Subtotal</span><span>{formatRM(receipt.subtotal)}</span></div>
       <div className="flex justify-between"><span>Diskaun</span><span>-{formatRM(receipt.discount)}</span></div>
      </>
     )}
     <div className="flex justify-between font-bold"><span>JUMLAH</span><span>{formatRM(receipt.total)}</span></div>
     {receipt.change_amount > 0 && <div className="flex justify-between"><span>Baki</span><span>{formatRM(receipt.change_amount)}</span></div>}
     <p className="pt-2 text-center text-xs">Terima kasih!</p>
    </div>

    <ReceiptPrinterSettings onStatusChange={setPrinterStatus} />
    <p className="sr-only" aria-live="assertive">{printing ? 'Resit sedang dihantar ke printer.' : ''}</p>

    <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
     <Button variant="outline" onClick={() => void handleShare()}><Share2 className="mr-2 h-4 w-4" /> Kongsi</Button>
     <Button className="bg-amber-500 hover:bg-amber-600" onClick={() => void handlePrint()} disabled={printing}>
      {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
      {directPrinterReady ? 'Cetak terus' : 'Cetak sistem'}
     </Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
 );
}
