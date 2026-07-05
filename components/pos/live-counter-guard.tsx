'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  ShieldAlert,
  TimerReset,
  Users,
} from 'lucide-react';
import type {
  PosShiftStockCheckType,
  PosShiftSummary,
  PosSopStatus,
} from '@/lib/pos/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function formatTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('ms-MY', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function idleText(lastActivityAt: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - lastActivityAt) / 60000));
  if (minutes < 1) return 'Baru sahaja';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  return `${hours}j ${remain}m`;
}

function stockCheckLabel(value: PosShiftStockCheckType | null) {
  if (value === 'OPENING') return 'Kiraan stok pembukaan';
  if (value === 'MID_SHIFT') return 'Kiraan stok pertengahan';
  if (value === 'CLOSE_SHIFT') return 'Kiraan stok tutup syif';
  return null;
}

type CounterTone = 'good' | 'watch' | 'danger' | 'info';

interface LiveCounterGuardProps {
  shift: PosShiftSummary | null;
  branchLabel?: string | null;
  activeStaffCount: number;
  pendingStaffCount: number;
  activePresenceLeave: PosSopStatus['active_leave'];
  pendingDeliveryCount: number;
  requiredStockCheck: PosShiftStockCheckType | null;
  presencePromptActive: boolean;
  presenceSaving: boolean;
  lastActivityAt: number;
  canBypassPosSop?: boolean;
  onConfirmPresence: () => void;
  onOpenSop: () => void;
  onOpenShift: () => void;
}

export function LiveCounterGuard({
  shift,
  branchLabel,
  activeStaffCount,
  pendingStaffCount,
  activePresenceLeave,
  pendingDeliveryCount,
  requiredStockCheck,
  presencePromptActive,
  presenceSaving,
  lastActivityAt,
  canBypassPosSop = false,
  onConfirmPresence,
  onOpenSop,
  onOpenShift,
}: LiveCounterGuardProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const idleMinutes = Math.max(0, Math.floor((now - lastActivityAt) / 60000));
  const stockLabel = stockCheckLabel(requiredStockCheck);

  const state = useMemo((): {
    tone: CounterTone;
    title: string;
    description: string;
    badge: string;
    icon: typeof CheckCircle2;
    actionLabel: string;
    action: () => void;
  } => {
    if (!shift) {
      return {
        tone: 'danger',
        title: 'Kaunter belum dibuka',
        description: 'Buka syif, sahkan stok permulaan, kemudian sistem benarkan jualan.',
        badge: 'Syif belum buka',
        icon: ShieldAlert,
        actionLabel: 'Buka syif',
        action: onOpenShift,
      };
    }
    if (activePresenceLeave) {
      return {
        tone: 'danger',
        title: 'Staf masih keluar kiosk',
        description: 'Rekod staf kembali dahulu supaya masa rehat dan payroll tepat.',
        badge: 'Keluar kiosk',
        icon: ShieldAlert,
        actionLabel: 'Rekod kembali',
        action: onOpenSop,
      };
    }
    if (pendingDeliveryCount > 0) {
      return {
        tone: 'danger',
        title: 'Stok driver belum disahkan',
        description: 'Sahkan penerimaan stok sebelum jualan supaya baki POS tidak salah.',
        badge: `${pendingDeliveryCount} penerimaan`,
        icon: AlertTriangle,
        actionLabel: 'Sahkan stok',
        action: onOpenSop,
      };
    }
    if (requiredStockCheck === 'OPENING') {
      return {
        tone: 'danger',
        title: 'Kiraan stok pembukaan wajib',
        description: 'Staf perlu sahkan baki stok sebenar sebelum kaunter mula jualan.',
        badge: 'Wajib sebelum jualan',
        icon: AlertTriangle,
        actionLabel: 'Kira stok',
        action: onOpenSop,
      };
    }
    if (presencePromptActive) {
      return {
        tone: 'watch',
        title: 'AI minta pengesahan kaunter',
        description: 'Tekan sahkan jika staf masih berada di depan POS ketika tiada customer.',
        badge: 'Perlu sahkan',
        icon: Eye,
        actionLabel: 'Saya di POS',
        action: onConfirmPresence,
      };
    }
    if (activeStaffCount <= 0 && pendingStaffCount > 0) {
      return {
        tone: 'watch',
        title: 'Staf syif belum rasmi',
        description: 'Ada staf menunggu kelulusan AM/ke atas sebelum rekod POS menjadi rasmi.',
        badge: `${pendingStaffCount} tunggu`,
        icon: Users,
        actionLabel: 'Semak staf syif',
        action: onOpenSop,
      };
    }
    if (activeStaffCount <= 0) {
      return {
        tone: canBypassPosSop ? 'info' : 'watch',
        title: 'Tiada staf rasmi aktif',
        description: canBypassPosSop
          ? 'Mode testing admin: jualan boleh diuji, tetapi operasi sebenar perlu rekod staf syif.'
          : 'Rekod staf cawangan dalam syif supaya masa kerja dan payroll tepat.',
        badge: '0 staf aktif',
        icon: Users,
        actionLabel: 'Rekod staf',
        action: onOpenSop,
      };
    }
    if (idleMinutes >= 10) {
      return {
        tone: 'watch',
        title: 'Kaunter lama tiada aktiviti',
        description: 'Sistem akan terus buat presence check jika staf tidak berinteraksi dengan POS.',
        badge: `${idleMinutes} min idle`,
        icon: Clock3,
        actionLabel: 'Saya di POS',
        action: onConfirmPresence,
      };
    }

    return {
      tone: 'good',
      title: 'Kaunter aktif',
      description: 'Staf rasmi direkod, POS dalam talian dan jualan boleh diteruskan.',
      badge: 'Aktif',
      icon: CheckCircle2,
      actionLabel: 'Semak SOP',
      action: onOpenSop,
    };
  }, [
    activePresenceLeave,
    activeStaffCount,
    canBypassPosSop,
    idleMinutes,
    onConfirmPresence,
    onOpenShift,
    onOpenSop,
    pendingDeliveryCount,
    pendingStaffCount,
    presencePromptActive,
    requiredStockCheck,
    shift,
  ]);

  const Icon = state.icon;
  const toneClass = {
    good: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    watch: 'border-amber-200 bg-amber-50 text-amber-950',
    danger: 'border-red-200 bg-red-50 text-red-950',
    info: 'border-sky-200 bg-sky-50 text-sky-950',
  }[state.tone];

  return (
    <section className={cn('rounded-2xl border p-4 shadow-sm', toneClass)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-[240px] flex-1 gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold">{state.title}</h3>
              <Badge variant="outline" className="border-current/20 bg-white/70">
                {state.badge}
              </Badge>
            </div>
            <p className="mt-1 text-sm opacity-85">{state.description}</p>
            {branchLabel && (
              <p className="mt-2 text-xs font-medium opacity-70">{branchLabel}</p>
            )}
          </div>
        </div>

        <Button
          type="button"
          variant={state.tone === 'danger' ? 'default' : 'outline'}
          className={cn(state.tone !== 'danger' && 'bg-white/80')}
          onClick={state.action}
          disabled={presenceSaving && presencePromptActive}
        >
          <TimerReset className="mr-2 h-4 w-4" />
          {presenceSaving && presencePromptActive ? 'Mengesahkan...' : state.actionLabel}
        </Button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Staf rasmi aktif" value={`${activeStaffCount}`} icon={Users} />
        <Metric label="Menunggu kelulusan" value={`${pendingStaffCount}`} icon={ShieldAlert} />
        <Metric label="Mula perniagaan" value={formatTime(shift?.business_started_at ?? shift?.opening_stock_checked_at)} icon={Activity} />
        <Metric label="Aktiviti terakhir" value={idleText(lastActivityAt, now)} icon={Clock3} />
      </div>

      {stockLabel && requiredStockCheck !== 'OPENING' && (
        <p className="mt-3 rounded-xl border border-current/10 bg-white/60 px-3 py-2 text-xs">
          AI ingatkan: {stockLabel}. Jualan boleh diteruskan, tetapi staf perlu lengkapkan bila customer reda.
        </p>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof CheckCircle2;
}) {
  return (
    <div className="rounded-xl border border-current/10 bg-white/60 px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-medium opacity-70">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
