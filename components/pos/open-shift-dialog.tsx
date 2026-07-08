'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { openShift } from '@/lib/pos/api';
import { usePosStore } from '@/stores/pos-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';

interface OpenShiftDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 branchId: string;
 onSuccess: () => void;
}

const QUICK_FLOAT = [0, 50, 100, 200, 500];

export function OpenShiftDialog({
 open,
 onOpenChange,
 branchId,
 onSuccess,
}: OpenShiftDialogProps) {
 const [openingCash, setOpeningCash] = useState('100');
 const [loading, setLoading] = useState(false);
 const setShift = usePosStore((s) => s.setShift);
 const openingCashNumber = Number(openingCash);
 const openingCashError =
 openingCash.trim() === ''
 ? 'Masukkan float tunai permulaan.'
 : !Number.isFinite(openingCashNumber)
 ? 'Nilai float tunai tidak sah.'
 : openingCashNumber < 0
 ? 'Float tunai tidak boleh negatif.'
 : openingCashNumber > 10000
 ? 'Semak semula nilai float tunai.'
 : null;

 async function handleOpen() {
 if (openingCashError) {
 toast.error(openingCashError);
 return;
 }
 setLoading(true);
 try {
 const { shift } = await openShift(branchId, openingCashNumber);
 setShift(shift);
 toast.success(`Syif ${shift.shift_number} dibuka`);
 onOpenChange(false);
 onSuccess();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal buka syif');
 } finally {
 setLoading(false);
 }
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle>Buka Syif</DialogTitle>
 <DialogDescription>
 Masukkan float tunai permulaan. Selepas syif dibuka, staf wajib sahkan
 kiraan stok permulaan dahulu sebelum skrin jualan dibuka.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3">
 <Label htmlFor="opening-cash">Float Tunai Permulaan (RM)</Label>
 <Input
 id="opening-cash"
 type="number"
 min="0"
 step="0.01"
 aria-invalid={Boolean(openingCashError)}
 className="h-12 text-lg"
 value={openingCash}
 onChange={(e) => setOpeningCash(e.target.value)}
 />
 {openingCashError && (
 <p className="text-sm font-medium text-destructive">
 {openingCashError}
 </p>)}
 <div className="flex flex-wrap gap-2">
 {QUICK_FLOAT.map((amt) => (
 <Button
 key={amt}
 type="button"
 variant="outline"
 size="sm"
 onClick={() => setOpeningCash(String(amt))}
 >
 RM {amt}
 </Button>))}
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => onOpenChange(false)}>
 Batal
 </Button>
 <Button onClick={handleOpen} disabled={loading || Boolean(openingCashError)}>
 {loading ? 'Membuka...' : 'Buka Syif'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>);
}
