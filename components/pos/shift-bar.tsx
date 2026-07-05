'use client';

import { Wifi, WifiOff, Lock, Unlock } from 'lucide-react';
import { formatRM } from '@/lib/pos/utils';
import { usePosStore } from '@/stores/pos-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ShiftBarProps {
 branchName?: string;
 onOpenShift: () => void;
 onCloseShift: () => void;
}

export function ShiftBar({ branchName, onOpenShift, onCloseShift }: ShiftBarProps) {
 const shift = usePosStore((s) => s.shift);
 const isOnline = usePosStore((s) => s.isOnline);
 const offlineCount = usePosStore((s) => s.offlineCount);
 const dailySummary = usePosStore((s) => s.dailySummary);

 return (
 <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2">
 <div className="flex flex-wrap items-center gap-2">
 {shift ? (
 <>
 <Badge className="gap-1 bg-green-600 hover:bg-green-600">
 <Unlock className="h-3 w-3" />
 Syif Terbuka
 </Badge>
 <span className="hidden text-sm font-medium sm:inline">
 {shift.shift_number}
 </span>
 <span className="text-sm tabular-nums text-muted-foreground">
 Syif: {formatRM(Number(shift.total_sales))} - {shift.transaction_count} tx
 </span>
 </>) : (
 <Badge variant="secondary" className="gap-1">
 <Lock className="h-3 w-3" />
 Tiada Syif
 </Badge>)}
 {branchName && (
 <Badge
 variant="outline"
 className="max-w-[min(100%,28rem)] whitespace-normal text-left text-xs leading-snug"
 title={branchName}
 >
 {branchName}
 </Badge>)}
 {dailySummary && (
 <span className="text-xs text-muted-foreground sm:hidden">
 Hari ini {formatRM(Number(dailySummary.total_sales))}
 </span>)}
 </div>

 <div className="flex flex-wrap items-center gap-2">
 <Badge
 variant={isOnline ? 'outline' : 'destructive'}
 className="gap-1 text-xs"
 >
 {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
 {isOnline ? 'Dalam talian' : 'Luar talian'}
 {offlineCount > 0 && ` - ${offlineCount} menunggu`}
 </Badge>

 {shift ? (
 <Button variant="outline" size="sm" onClick={onCloseShift}>
 Tutup Syif
 </Button>) : (
 <Button size="sm" onClick={onOpenShift}>
 <Unlock className="mr-1 h-4 w-4" />
 Buka Syif
 </Button>)}
 </div>
 </div>);
}
