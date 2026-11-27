'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cancelTransfer } from '@/lib/inventory/api';

export function TransferCancelButton({ id, onCancelled }: { id: string; onCancelled: () => void }) {
 const [open, setOpen] = useState(false);
 const [reason, setReason] = useState('');
 const [busy, setBusy] = useState(false);

 async function submit(event: FormEvent) {
  event.preventDefault();
  if (!reason.trim() || busy) return;
  setBusy(true);
  try {
   await cancelTransfer(id, reason.trim());
   setOpen(false);
   toast.success('Pindahan dibatalkan');
   onCancelled();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Gagal membatalkan pindahan');
  } finally {
   setBusy(false);
  }
 }

 if (!open) return <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>Batal pindahan</Button>;
 return (
  <form className="flex flex-wrap gap-2" onSubmit={submit}>
   <Input className="h-8 w-48" aria-label="Sebab pembatalan" placeholder="Sebab pembatalan"
    value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required disabled={busy} />
   <Button size="sm" variant="destructive" disabled={busy || !reason.trim()}>Sahkan batal</Button>
   <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Tutup</Button>
  </form>
 );
}
