'use client';

import { formatRM } from '@/lib/pos/utils';
import { usePosStore } from '@/stores/pos-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShiftMembersPanel } from '@/components/pos/shift-members-panel';

function formatTime(value?: string | null) {
 if (!value) return '-';
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return '-';
 return date.toLocaleTimeString('ms-MY', {
 hour: '2-digit',
 minute: '2-digit',
 });
}

export function DailySummaryPanel() {
 const summary = usePosStore((s) => s.dailySummary);
 const shift = usePosStore((s) => s.shift);
 const todayBusinessStartedAt =
 summary?.business_started_at ??
 shift?.business_started_at ??
 shift?.opening_stock_checked_at ??
 null;
 const todayPayrollStartedAt =
 summary?.payroll_started_at ??
 shift?.payroll_started_at ??
 todayBusinessStartedAt;
 const todayWorkEndedAt =
 summary?.actual_work_ended_at ??
 shift?.actual_work_ended_at ??
 null;

 if (!summary && !shift) {
 return (
 <p className="text-sm text-muted-foreground">Tiada data ringkasan</p>);
 }

 return (
 <div className="grid gap-3 sm:grid-cols-2">
 {shift && (
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium">Syif Semasa</CardTitle>
 </CardHeader>
 <CardContent className="space-y-1 text-sm">
 <div className="flex justify-between">
 <span className="text-muted-foreground">Syif dibuka</span>
 <span>{formatTime(shift.opened_at)}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">Mula perniagaan</span>
 <span>
 {shift.business_started_at
 ? formatTime(shift.business_started_at)
 : shift.opening_stock_checked_at
 ? formatTime(shift.opening_stock_checked_at)
 : 'Belum direkod'}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">Jualan pertama</span>
 <span>
 {shift.first_transaction_at
 ? formatTime(shift.first_transaction_at)
 : 'Belum ada transaksi'}
 </span>
 </div>
 <div className="my-2 border-t" />
 <div className="flex justify-between">
 <span className="text-muted-foreground">Tunai</span>
 <span>{formatRM(Number(shift.total_cash))}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">QR</span>
 <span>{formatRM(Number(shift.total_qr))}</span>
 </div>
 <div className="flex justify-between font-semibold">
 <span>Jumlah</span>
 <span>{formatRM(Number(shift.total_sales))}</span>
 </div>
 </CardContent>
 </Card>)}

 {summary && (
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium">
 Hari Ini - {summary.summary_date}
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-1 text-sm">
 <div className="flex justify-between">
 <span className="text-muted-foreground">Mula perniagaan</span>
 <span>
 {todayBusinessStartedAt
 ? formatTime(todayBusinessStartedAt)
 : 'Belum direkod'}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">Mula kira gaji</span>
 <span>
 {todayPayrollStartedAt
 ? formatTime(todayPayrollStartedAt)
 : 'Belum direkod'}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">Tamat kerja sebenar</span>
 <span>
 {todayWorkEndedAt
 ? formatTime(todayWorkEndedAt)
 : shift
 ? 'Belum tutup syif'
 : 'Belum direkod'}
 </span>
 </div>
 <div className="my-2 border-t" />
 <div className="flex justify-between">
 <span className="text-muted-foreground">Jualan</span>
 <span>{formatRM(Number(summary.total_sales))}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">Transaksi</span>
 <span>{summary.transaction_count}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">Batal / Bayar Balik</span>
 <span>
 {summary.void_count} / {summary.refund_count}
 </span>
 </div>
 </CardContent>
 </Card>)}

 <div className="sm:col-span-2">
 <ShiftMembersPanel />
 </div>
 </div>);
}
