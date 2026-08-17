'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Bluetooth, CheckCircle2, RefreshCw, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import {
 clearReceiptPrinter,
 openAndroidBluetoothSettings,
 printReceiptTestPage,
 readReceiptPrinterStatus,
 requestReceiptPrinterPermission,
 selectReceiptPrinter,
 type ReceiptPrinterStatus,
} from '@/lib/pos/receipt-printer-client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ReceiptPrinterSettingsProps {
 initiallyExpanded?: boolean;
 expandRequest?: number;
 onStatusChange?: (status: ReceiptPrinterStatus) => void;
}

export function ReceiptPrinterSettings({ initiallyExpanded = false, expandRequest = 0, onStatusChange }: ReceiptPrinterSettingsProps) {
 const [status, setStatus] = useState<ReceiptPrinterStatus | null>(null);
 const [loading, setLoading] = useState(true);
 const [printing, setPrinting] = useState(false);
 const [expanded, setExpanded] = useState(initiallyExpanded);
 const headingId = useId();

 const updateStatus = useCallback((next: ReceiptPrinterStatus) => {
  setStatus(next);
  onStatusChange?.(next);
 }, [onStatusChange]);

 const refresh = useCallback(async (requestPermission = false) => {
  setLoading(true);
  try {
   const next = requestPermission
    ? await requestReceiptPrinterPermission()
    : await readReceiptPrinterStatus();
   updateStatus(next);
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Status printer tidak dapat dibaca.');
  } finally {
   setLoading(false);
  }
 }, [updateStatus]);

 useEffect(() => {
  void refresh();
 }, [refresh]);

 useEffect(() => {
  if (expandRequest > 0) setExpanded(true);
 }, [expandRequest]);

 async function choosePrinter(address: string) {
  setLoading(true);
  try {
   updateStatus(await selectReceiptPrinter(address));
   toast.success('Printer disimpan untuk tablet ini.');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Printer tidak dapat dipilih.');
  } finally {
   setLoading(false);
  }
 }

 async function testPrint() {
  setPrinting(true);
  try {
   const result = await printReceiptTestPage();
   toast.success(`Cetakan ujian dihantar ke ${result.printerName}.`);
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Cetakan ujian gagal.');
  } finally {
   setPrinting(false);
  }
 }

 async function forgetPrinter() {
  setLoading(true);
  try {
   updateStatus(await clearReceiptPrinter());
  } finally {
   setLoading(false);
  }
 }

 const selectedIsPaired = Boolean(
  status?.selectedPrinter
  && status.pairedPrinters.some((printer) => printer.address === status.selectedPrinter?.address),
 );
 const ready = Boolean(status?.nativeAndroid && status.permissionGranted && status.bluetoothEnabled && selectedIsPaired);

 return (
  <section className="rounded-xl border bg-muted/30 p-3" aria-labelledby={headingId}>
   <div className="flex items-start justify-between gap-3">
    <div>
     <p id={headingId} className="flex items-center gap-2 text-sm font-semibold">
      <Bluetooth className="h-4 w-4" aria-hidden="true" /> Printer resit 58 mm
     </p>
     <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
      {loading
       ? 'Memeriksa printer...'
       : ready
        ? `Sedia: ${status?.selectedPrinter?.name}`
        : status?.nativeAndroid
         ? 'Belum disambungkan pada tablet ini.'
         : 'Cetakan sistem tersedia untuk web dan iOS.'}
     </p>
    </div>
    {ready && <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Printer sedia" />}
   </div>

   <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 px-2" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
    <Settings2 className="mr-2 h-4 w-4" /> {expanded ? 'Tutup tetapan' : 'Tetapan printer'}
   </Button>

   {expanded && (
    <div className="mt-3 space-y-3 border-t pt-3">
     {!status ? (
      <p className="text-xs text-muted-foreground">Memeriksa sokongan printer pada peranti ini...</p>
     ) : !status.nativeAndroid ? (
      <p className="text-xs text-muted-foreground">Sambungan terus disediakan dalam aplikasi RKJ One Android 1.6. Pada web atau iOS, gunakan Cetak sistem.</p>
     ) : (
      <>
       {!status.permissionGranted && (
        <Button type="button" className="w-full" onClick={() => void refresh(true)} disabled={loading}>Benarkan Bluetooth</Button>
       )}
       {status.permissionGranted && !status.bluetoothEnabled && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Hidupkan Bluetooth, kemudian muat semula senarai.</p>
       )}

       <div className="space-y-2">
        {status.pairedPrinters.map((printer) => {
         const selected = printer.address === status.selectedPrinter?.address;
         return (
          <button
           key={printer.address}
           type="button"
           className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition ${selected ? 'border-emerald-500 bg-emerald-50' : 'bg-background hover:bg-muted'}`}
           onClick={() => void choosePrinter(printer.address)}
           disabled={loading}
          >
           <span className="min-w-0"><span className="block truncate font-medium">{printer.name}</span><span className="text-xs text-muted-foreground">Peranti telah dipasangkan</span></span>
           {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Dipilih" />}
          </button>
         );
        })}
       </div>

       {status.permissionGranted && status.pairedPrinters.length === 0 && (
        <p className="text-xs text-muted-foreground">Tiada peranti berpasangan. Hidupkan POS-5890U-L dan pasangkannya sekali dalam Tetapan Bluetooth Android.</p>
       )}

       <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void openAndroidBluetoothSettings()}><Bluetooth className="mr-2 h-4 w-4" /> Pasangkan</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Muat semula</Button>
       </div>

       {selectedIsPaired && (
        <div className="grid grid-cols-2 gap-2">
         <Button type="button" variant="outline" size="sm" onClick={() => void testPrint()} disabled={printing}>Cetak ujian</Button>
         <Button type="button" variant="ghost" size="sm" onClick={() => void forgetPrinter()} disabled={loading}>Lupakan printer</Button>
        </div>
       )}
       <p className="text-[11px] leading-relaxed text-muted-foreground">PIN pasangan bergantung pada unit pembekal. Rujuk pelekat/manual unit; RKJ One tidak meneka atau menyimpan PIN.</p>
      </>
     )}
    </div>
   )}
  </section>
 );
}

interface ReceiptPrinterSettingsDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
}

export function ReceiptPrinterSettingsDialog({ open, onOpenChange }: ReceiptPrinterSettingsDialogProps) {
 return (
  <Dialog open={open} onOpenChange={onOpenChange}>
   <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
    <DialogHeader><DialogTitle>Persediaan printer resit</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground">Pasangkan dan uji printer sebelum kaunter mula menerima pelanggan.</p>
    <ReceiptPrinterSettings initiallyExpanded />
   </DialogContent>
  </Dialog>
 );
}
