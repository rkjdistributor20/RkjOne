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

export function OpenShiftDialog({
  open,
  onOpenChange,
  branchId,
  onSuccess,
}: OpenShiftDialogProps) {
  const [openingCash, setOpeningCash] = useState('0');
  const [loading, setLoading] = useState(false);
  const setShift = usePosStore((s) => s.setShift);

  async function handleOpen() {
    setLoading(true);
    try {
      const { shift } = await openShift(branchId, Number(openingCash) || 0);
      setShift(shift);
      toast.success(`Shift ${shift.shift_number} opened`);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open shift');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open Shift</DialogTitle>
          <DialogDescription>
            Enter opening cash float before starting sales.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="opening-cash">Opening Cash (RM)</Label>
          <Input
            id="opening-cash"
            type="number"
            min="0"
            step="0.01"
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-amber-500 hover:bg-amber-600"
            onClick={handleOpen}
            disabled={loading}
          >
            {loading ? 'Opening…' : 'Open Shift'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
