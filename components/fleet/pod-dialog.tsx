'use client';

import { useEffect, useState } from 'react';
import { Camera, CheckCircle2, Loader2, LocateFixed, MapPinOff } from 'lucide-react';
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
 const [gpsLoading, setGpsLoading] = useState(false);

 function captureGps() {
 if (!navigator.geolocation) {
 toast.error('GPS tidak tersedia');
 return;
 }
 setGpsLoading(true);
 navigator.geolocation.getCurrentPosition(
 (pos) => {
 setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
 toast.success('GPS direkod');
 setGpsLoading(false);
 },
 () => {
 toast.error('Gagal dapatkan GPS. POD masih boleh dihantar dengan catatan.');
 setGpsLoading(false);
 },
 { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 });
 }

 useEffect(() => {
 if (!open) return;
 const timer = window.setTimeout(captureGps, 0);
 return () => window.clearTimeout(timer);
 }, [open]);

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
 setGps({});
 onSuccess();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal hantar POD');
 } finally {
 setLoading(false);
 }
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>Bukti Penghantaran (POD)</DialogTitle>
 </DialogHeader>
 {leg && (
 <p className="text-sm text-muted-foreground">
 {leg.from_location.name} ke {leg.to_location.name}
 </p>)}
 <form onSubmit={handleSubmit} className="space-y-4">
 <div className={`flex items-center gap-3 rounded-md border p-3 text-sm ${gps.lat ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
 {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : gps.lat ? <CheckCircle2 className="h-4 w-4" /> : <MapPinOff className="h-4 w-4" />}
 <div>
 <p className="font-medium">{gpsLoading ? 'Mendapatkan lokasi...' : gps.lat ? 'Lokasi POD tersedia' : 'Lokasi belum tersedia'}</p>
 <p className="text-xs opacity-80">{gps.lat ? `${gps.lat.toFixed(5)}, ${gps.lng?.toFixed(5)} · akan disemak dengan geofence destinasi` : 'Tekan cuba semula atau tulis sebab dalam nota.'}</p>
 </div>
 </div>
 <div className="space-y-1">
 <Label>Nama Penerima</Label>
 <Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} required />
 </div>
 <div className="space-y-1">
 <Label>Nota Pemandu</Label>
 <Textarea value={driverNotes} onChange={(e) => setDriverNotes(e.target.value)} rows={2} />
 </div>
 <div className="space-y-1">
 <Label className="flex items-center gap-1.5"><Camera className="h-3.5 w-3.5" /> URL Gambar POD (pilihan)</Label>
 <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
 </div>
 <Button type="button" variant="outline" size="sm" onClick={captureGps} disabled={gpsLoading}>
 <LocateFixed className="mr-1.5 h-4 w-4" /> {gps.lat ? 'Segarkan Lokasi' : 'Cuba GPS Semula'}
 </Button>
 <DialogFooter>
 <Button type="submit" className="bg-amber-500 hover:bg-amber-600" disabled={loading}>
 {loading ? 'Menghantar...' : 'Sahkan Penghantaran'}
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>);
}
