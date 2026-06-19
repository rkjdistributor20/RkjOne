'use client';

import { Wifi, WifiOff, Clock, Lock, Unlock } from 'lucide-react';
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        {shift ? (
          <>
            <Badge className="bg-green-600 hover:bg-green-600">
              <Unlock className="mr-1 h-3 w-3" />
              Shift Open
            </Badge>
            <span className="text-sm font-medium">{shift.shift_number}</span>
            <span className="text-sm text-muted-foreground">
              Sales: {formatRM(Number(shift.total_sales))} · {shift.transaction_count} tx
            </span>
          </>
        ) : (
          <Badge variant="secondary">
            <Lock className="mr-1 h-3 w-3" />
            No Active Shift
          </Badge>
        )}
        {branchName && (
          <Badge variant="outline">{branchName}</Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isOnline ? 'outline' : 'destructive'} className="gap-1">
          {isOnline ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          {isOnline ? 'Online' : 'Offline'}
          {offlineCount > 0 && ` · ${offlineCount} pending`}
        </Badge>

        {shift ? (
          <Button variant="outline" size="sm" onClick={onCloseShift}>
            <Clock className="mr-1 h-4 w-4" />
            Close Shift
          </Button>
        ) : (
          <Button
            size="sm"
            className="bg-amber-500 hover:bg-amber-600"
            onClick={onOpenShift}
          >
            <Unlock className="mr-1 h-4 w-4" />
            Open Shift
          </Button>
        )}
      </div>
    </div>
  );
}
