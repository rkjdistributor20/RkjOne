'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import type { StaffScheduleWeek } from '@/lib/roster/types';
import { fetchMySchedule } from '@/lib/roster/api';
import { getNextWeekStart, getThisWeekStart } from '@/lib/roster/week-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StaffSchedulePanelProps {
  /** Papar versi ringkas (login / dashboard) */
  compact?: boolean;
  className?: string;
}

function formatTime(t: string | null): string {
  if (!t) return '—';
  return t.slice(0, 5);
}

export function StaffSchedulePanel({ compact = false, className }: StaffSchedulePanelProps) {
  const [weekStart, setWeekStart] = useState(getThisWeekStart());
  const [schedule, setSchedule] = useState<StaffScheduleWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMySchedule(weekStart)
      .then((res) => {
        if (!cancelled) {
          setSchedule(res.schedule);
          setError(res.message ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal muat');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  const todayIso = new Date().toISOString().slice(0, 10);

  if (loading) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>Memuatkan jadual anda…</p>
    );
  }

  if (!schedule) {
    return (
      <div className={cn('rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground', className)}>
        {error ?? 'Jadual belum tersedia — pengurus akan terbitkan sebelum minggu bermula.'}
      </div>
    );
  }

  if (schedule.status !== 'PUBLISHED') {
    return (
      <div className={cn('rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900', className)}>
        Jadual minggu {schedule.week_range} belum diterbitkan oleh pengurus.
      </div>
    );
  }

  if (compact) {
    const today = schedule.days.find((d) => d.shift_date === todayIso);
    return (
      <div className={cn('rounded-xl border bg-white/90 p-4 shadow-sm', className)}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" />
          Jadual Hari Ini
          {schedule.branch_code && (
            <Badge variant="outline" className="ml-auto text-xs">
              {schedule.branch_code}
            </Badge>
          )}
        </div>
        {today ? (
          today.is_off ? (
            <p className="mt-2 text-muted-foreground">Cuti / tiada syif hari ini</p>
          ) : (
            <p className="mt-2 flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {today.template_name ?? 'Syif'} · {formatTime(today.scheduled_start)} –{' '}
              {formatTime(today.scheduled_end)}
            </p>
          )
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Tiada data hari ini</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Jadual Saya</h3>
          <p className="text-sm text-muted-foreground">
            {schedule.week_range}
            {schedule.branch_name && ` · ${schedule.branch_code} ${schedule.branch_name}`}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={weekStart === getThisWeekStart() ? 'default' : 'outline'}
            onClick={() => setWeekStart(getThisWeekStart())}
          >
            Minggu ini
          </Button>
          <Button
            size="sm"
            variant={weekStart === getNextWeekStart() ? 'default' : 'outline'}
            onClick={() => setWeekStart(getNextWeekStart())}
          >
            Minggu depan
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {schedule.days.map((d) => {
          const isToday = d.shift_date === todayIso;
          return (
            <div
              key={d.day_index}
              className={cn(
                'rounded-lg border p-3 text-sm',
                isToday && 'border-primary ring-1 ring-primary/30 bg-primary/5'
              )}
            >
              <p className="font-medium">{d.day_label}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(`${d.shift_date}T00:00:00`).toLocaleDateString('ms-MY', {
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
              {d.is_off ? (
                <Badge variant="secondary" className="mt-2">
                  Cuti
                </Badge>
              ) : (
                <div className="mt-2 space-y-0.5">
                  <p className="font-medium">{d.template_name ?? 'Syif'}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(d.scheduled_start)} – {formatTime(d.scheduled_end)}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
