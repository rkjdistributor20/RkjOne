'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { DeliveryLeg, PodPayload } from '@/lib/fleet/types';
import { submitPod } from '@/lib/fleet/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface PodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leg: DeliveryLeg | null;
  onSuccess: () => void;
}

export function PodDialog({ open, onOpenChange, leg, onSuccess }: PodDialogProps) {
  const [receiverName, setReceiverName] = useState('');
  const [driverNotes, setDriverNotes] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [gps, setGps] = useState<{ lat?: number; lng?: number }>({});

  function captureGps() {
    if (!navigator.geolocation) {
      toast.error('GPS tidak tersedia');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success('GPS direkod');
      },
      () => toast.error('Gagal dapatkan GPS')
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leg) return;
    setLoading(true);
    try {
      const payload: PodPayload = {
        receiver_name: receiverName,
        driver_notes: driverNotes || undefined,
        gps_latitude: gps.lat,
        gps_longitude: gps.lng,
        image_urls: imageUrl ? [imageUrl] : [],
      };
      await submitPod(leg.id, payload);
      toast.success('Bukti penghantaran dihantar');
      onOpenChange(false);
      setReceiverName('');
      setDriverNotes('');
      setImageUrl('');
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal hantar POD');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bukti Penghantaran (POD)</DialogTitle>
        </DialogHeader>
        {leg && (
          <p className="text-sm text-muted-foreground">
            {leg.from_location.name} → {leg.to_location.name}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Nama Penerima</Label>
            <Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>Nota Pemandu</Label>
            <Textarea value={driverNotes} onChange={(e) => setDriverNotes(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>URL Gambar (pilihan)</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={captureGps}>
            Tangkap GPS {gps.lat ? `(${gps.lat.toFixed(4)}, ${gps.lng?.toFixed(4)})` : ''}
          </Button>
          <DialogFooter>
            <Button type="submit" className="bg-amber-500 hover:bg-amber-600" disabled={loading}>
              {loading ? 'Menghantar…' : 'Sahkan Penghantaran'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
