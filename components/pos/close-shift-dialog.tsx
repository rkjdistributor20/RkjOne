'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { closeShift } from '@/lib/pos/api';
import { formatRM } from '@/lib/pos/utils';
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

export function CloseShiftDialog({
  open,
  onOpenChange,
  onSuccess,
}: CloseShiftDialogProps) {
  const shift = usePosStore((s) => s.shift);
  const setShift = usePosStore((s) => s.setShift);
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const expectedCash = shift
    ? Number(shift.opening_cash) + Number(shift.total_cash)
    : 0;

  async function handleClose() {
    if (!shift) return;
    setLoading(true);
    try {
      const { result } = await closeShift(
        shift.id,
        Number(closingCash) || 0,
        notes || undefined
      );
      setShift(null);
      toast.success(
        `Syif ditutup. Bezaan: ${formatRM(Number(result.variance ?? 0))}`
      );
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
          <Label htmlFor="close-notes">Nota</Label>
          <Textarea
            id="close-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Contoh: kurang RM2 sen"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            variant="destructive"
            onClick={handleClose}
            disabled={loading || !closingCash}
          >
            {loading ? 'Menutup…' : 'Tutup Syif'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
