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
      toast.error('GPS not available');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success('GPS captured');
      },
      () => toast.error('Failed to get GPS')
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
      toast.success('Proof of delivery submitted');
      onOpenChange(false);
      setReceiverName('');
      setDriverNotes('');
      setImageUrl('');
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'POD failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Proof of Delivery</DialogTitle>
        </DialogHeader>
        {leg && (
          <p className="text-sm text-muted-foreground">
            {leg.from_location.name} → {leg.to_location.name}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Receiver Name</Label>
            <Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>Driver Notes</Label>
            <Textarea value={driverNotes} onChange={(e) => setDriverNotes(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Photo URL (optional)</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={captureGps}>
            Capture GPS {gps.lat ? `(${gps.lat.toFixed(4)}, ${gps.lng?.toFixed(4)})` : ''}
          </Button>
          <DialogFooter>
            <Button type="submit" className="bg-amber-500 hover:bg-amber-600" disabled={loading}>
              {loading ? 'Submitting…' : 'Confirm Delivery'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
