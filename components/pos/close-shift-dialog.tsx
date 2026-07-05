'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { closeShift, fetchShiftMembers } from '@/lib/pos/api';
import { formatRM } from '@/lib/pos/utils';
import type { PosShiftStaffMember } from '@/lib/pos/types';
import { usePosStore } from '@/stores/pos-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';

interface CloseShiftDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onSuccess: () => void;
}

function toDateTimeLocalValue(date = new Date()) {
 const pad = (value: number) => String(value).padStart(2, '0');
 return [
 date.getFullYear(),
 '-',
 pad(date.getMonth() + 1),
 '-',
 pad(date.getDate()),
 'T',
 pad(date.getHours()),
 ':',
 pad(date.getMinutes()),
 ].join('');
}

export function CloseShiftDialog({
 open,
 onOpenChange,
 onSuccess,
}: CloseShiftDialogProps) {
 const shift = usePosStore((s) => s.shift);
 const branchId = usePosStore((s) => s.branchId);
 const setShift = usePosStore((s) => s.setShift);
 const offlineCount = usePosStore((s) => s.offlineCount);
 const [closingCash, setClosingCash] = useState('');
 const [actualWorkEndedAt, setActualWorkEndedAt] = useState(
 () => toDateTimeLocalValue());
 const [notes, setNotes] = useState('');
 const [loading, setLoading] = useState(false);
 const [activeMembers, setActiveMembers] = useState<PosShiftStaffMember[]>([]);

 const expectedCash = shift
 ? Number(shift.opening_cash) + Number(shift.total_cash)
 : 0;

 useEffect(() => {
 if (open) {
 setActualWorkEndedAt(toDateTimeLocalValue());
 }
 }, [open]);

 useEffect(() => {
 if (!open || !branchId || !shift?.id) return;
 fetchShiftMembers(branchId, shift.id)
 .then((res) => {
 setActiveMembers((res.members ?? []).filter((member) => member.status === 'ACTIVE'));
 })
 .catch(() => setActiveMembers([]));
 }, [branchId, open, shift?.id]);

 async function handleClose() {
 if (!shift) return;
 if (offlineCount > 0) {
 toast.error('Selesaikan sync jualan luar talian dahulu sebelum tutup syif');
 return;
 }
 const cash = Number(closingCash);
 if (!Number.isFinite(cash) || cash < 0) {
 toast.error('Masukkan jumlah tunai sebenar yang sah');
 return;
 }
 if (!actualWorkEndedAt) {
 toast.error('Masukkan waktu tamat bekerja sebenar');
 return;
 }
 const actualEndDate = new Date(actualWorkEndedAt);
 if (Number.isNaN(actualEndDate.getTime())) {
 toast.error('Waktu tamat bekerja sebenar tidak sah');
 return;
 }
 const payrollStartAt =
 shift.payroll_started_at ?? shift.business_started_at ?? shift.opened_at;
 const payrollStartDate = new Date(payrollStartAt);
 if (
 !Number.isNaN(payrollStartDate.getTime()) &&
 actualEndDate.getTime() < payrollStartDate.getTime()
 ) {
 toast.error('Waktu tamat bekerja tidak boleh lebih awal daripada mula perniagaan');
 return;
 }
 const variance = cash - expectedCash;
 if (Math.abs(variance) >= 0.01 && notes.trim().length < 5) {
 toast.error('Sila isi nota sebab beza tunai sebelum tutup syif');
 return;
 }
 setLoading(true);
 try {
 const { result } = await closeShift(
 shift.id,
 cash,
 notes || undefined,
 actualEndDate.toISOString());
 setShift(null);
 toast.success(
 `Syif ditutup. Bezaan: ${formatRM(Number(result.variance ?? 0))}`);
 onOpenChange(false);
 onSuccess();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal tutup syif');
 } finally {
 setLoading(false);
 }
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle>Tutup Syif</DialogTitle>
 <DialogDescription>
 Kira laci tunai dan tutup syif {shift?.shift_number}
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-3 rounded-lg bg-muted/50 p-4 text-sm">
 <div className="flex justify-between">
 <span>Float permulaan</span>
 <span>{formatRM(Number(shift?.opening_cash ?? 0))}</span>
 </div>
 <div className="flex justify-between">
 <span>Jualan tunai</span>
 <span>{formatRM(Number(shift?.total_cash ?? 0))}</span>
 </div>
 <div className="flex justify-between font-semibold">
 <span>Tunai dijangka</span>
 <span>{formatRM(expectedCash)}</span>
 </div>
 <div className="flex justify-between">
 <span>Jumlah jualan</span>
 <span>{formatRM(Number(shift?.total_sales ?? 0))}</span>
 </div>
 <div className="flex justify-between">
 <span>Transaksi</span>
 <span>{shift?.transaction_count ?? 0}</span>
 </div>
 </div>
 <div className="space-y-2">
 <Label htmlFor="closing-cash">Tunai sebenar dalam laci (RM)</Label>
 <Input
 id="closing-cash"
 type="number"
 min="0"
 step="0.01"
 className="h-12 text-lg"
 value={closingCash}
 onChange={(e) => setClosingCash(e.target.value)}
 placeholder={expectedCash.toFixed(2)}
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="actual-work-ended-at">Waktu tamat bekerja sebenar</Label>
 <Input
 id="actual-work-ended-at"
 type="datetime-local"
 className="h-12 text-lg"
 value={actualWorkEndedAt}
 onChange={(e) => setActualWorkEndedAt(e.target.value)}
 />
 <p className="text-xs text-muted-foreground">
 Waktu ini menjadi rekod tamat kerja sebenar untuk kiraan gaji syif.
 </p>
 </div>
 {activeMembers.length > 1 && (
 <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
 <p className="font-semibold">Ada {activeMembers.length} staf aktif dalam syif ini.</p>
 <p className="mt-1 text-xs">
 Tamatkan tugas setiap staf di tab Ringkasan dahulu, kemudian tutup syif. Ini memastikan masa gaji setiap staf tepat.
 </p>
 <div className="mt-2 flex flex-wrap gap-2">
 {activeMembers.map((member) => (
 <span key={member.id} className="rounded-full bg-white px-2 py-1 text-xs">
 {member.full_name}
 </span>))}
 </div>
 </div>)}
 <div className="space-y-2">
 <Label htmlFor="close-notes">Nota</Label>
 <Textarea
 id="close-notes"
 value={notes}
 onChange={(e) => setNotes(e.target.value)}
 rows={2}
 placeholder="Contoh: kurang RM2 sen"
 />
 {offlineCount > 0 && (
 <p className="text-xs font-medium text-red-600">
 Ada {offlineCount} jualan luar talian belum sync. Tutup syif akan dibenarkan selepas sync selesai.
 </p>)}
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => onOpenChange(false)}>
 Batal
 </Button>
 <Button
 variant="destructive"
 onClick={handleClose}
 disabled={loading || !closingCash || !actualWorkEndedAt}
 >
 {loading ? 'Menutup...' : 'Tutup Syif'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>);
}
