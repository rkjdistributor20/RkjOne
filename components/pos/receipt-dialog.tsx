'use client';

import { Printer, Share2 } from 'lucide-react';
import { formatRM } from '@/lib/pos/utils';
import type { SaleResult } from '@/lib/pos/types';
import { Button } from '@/components/ui/button';
import {
 Dialog,
 DialogContent,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

interface ReceiptDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 receipt: SaleResult | null;
 branchName?: string;
}

export function ReceiptDialog({
 open,
 onOpenChange,
 receipt,
 branchName,
}: ReceiptDialogProps) {
 if (!receipt) return null;

 function handlePrint() {
 window.print();
 }

 async function handleShare() {
 const text = [
 'RKJ One - Roti Kaya Junus',
 branchName ?? '',
 `Receipt: ${receipt!.receipt_number}`,
 `TX: ${receipt!.transaction_number}`,
 '---',...receipt!.items.map(
 (i) =>
 `${i.quantity}x ${i.name} - ${formatRM(i.line_total)}`),
 '---',
 `Total: ${formatRM(receipt!.total)}`,
 receipt!.change_amount > 0
 ? `Change: ${formatRM(receipt!.change_amount)}`
 : '',
 'Terima kasih!',
 ].filter(Boolean).join('\n');

 if (navigator.share) {
 await navigator.share({ title: 'RKJ Receipt', text });
 } else {
 await navigator.clipboard.writeText(text);
 }
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-sm">
 <DialogHeader>
 <DialogTitle className="text-center">Receipt</DialogTitle>
 </DialogHeader>

 <div id="pos-receipt" className="space-y-3 font-mono text-sm">
 <div className="text-center">
 <p className="font-bold">ROTI KAYA JUNUS</p>
 <p className="text-xs text-muted-foreground">{branchName}</p>
 <p className="text-xs">{receipt.receipt_number}</p>
 <p className="text-xs">{receipt.transaction_number}</p>
 </div>

 <Separator />

 {receipt.items.map((item, idx) => (
 <div key={idx} className="flex justify-between gap-2">
 <span className="flex-1">
 {item.quantity}x {item.name}
 </span>
 <span>{formatRM(item.line_total)}</span>
 </div>))}

 <Separator />

 <div className="flex justify-between font-bold">
 <span>TOTAL</span>
 <span>{formatRM(receipt.total)}</span>
 </div>

 {receipt.change_amount > 0 && (
 <div className="flex justify-between">
 <span>Change</span>
 <span>{formatRM(receipt.change_amount)}</span>
 </div>)}

 <p className="pt-2 text-center text-xs">Terima kasih!</p>
 </div>

 <DialogFooter className="gap-2 sm:gap-0">
 <Button variant="outline" onClick={handleShare}>
 <Share2 className="mr-2 h-4 w-4" />
 Share
 </Button>
 <Button
 className="bg-amber-500 hover:bg-amber-600"
 onClick={handlePrint}
 >
 <Printer className="mr-2 h-4 w-4" />
 Print
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>);
}
