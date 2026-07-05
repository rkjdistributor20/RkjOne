'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, Save, TrendingUp } from 'lucide-react';
import {
 fetchStockPlanningSettings,
 updateStockPlanningSettings,
} from '@/lib/settings/api';
import type { SettingsStockPlanning, SettingsUpcomingHoliday } from '@/lib/settings/types';
import { formatHolidayDate, formatHolidayType } from '@/lib/production/holiday-labels';
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/module-ui';

interface StockPlanningSettingsPanelProps {
 canEdit: boolean;
}

export function StockPlanningSettingsPanel({ canEdit }: StockPlanningSettingsPanelProps) {
 const [settings, setSettings] = useState<SettingsStockPlanning | null>(null);
 const [holidays, setHolidays] = useState<SettingsUpcomingHoliday[]>([]);
 const [coverageDays, setCoverageDays] = useState('1');
 const [safetyBuffer, setSafetyBuffer] = useState('10');
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);

 async function load() {
 setLoading(true);
 try {
 const data = await fetchStockPlanningSettings();
 setSettings(data.settings);
 setHolidays(data.upcoming_holidays);
 setCoverageDays(String(data.settings.stock_coverage_days));
 setSafetyBuffer(String(data.settings.safety_buffer_pcs));
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan tetapan');
 } finally {
 setLoading(false);
 }
 }

 useEffect(() => {
 load();
 }, []);

 async function handleSave() {
 const coverage = Number(coverageDays);
 const buffer = Number(safetyBuffer);
 if (!Number.isInteger(coverage) || coverage < 0 || coverage > 7) {
 toast.error('Hari coverage stok mesti 0-7');
 return;
 }
 if (Number.isNaN(buffer) || buffer < 0 || buffer > 200) {
 toast.error('Buffer keselamatan mesti 0-200 pcs');
 return;
 }

 setSaving(true);
 try {
 const { settings: next } = await updateStockPlanningSettings({
 stock_coverage_days: coverage,
 safety_buffer_pcs: buffer,
 });
 setSettings(next);
 toast.success('Tetapan ramalan order dikemaskini');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal simpan');
 } finally {
 setSaving(false);
 }
 }

 if (loading) {
 return (
 <p className="text-sm text-muted-foreground">Memuatkan tetapan ramalan order...</p>);
 }

 if (!settings) {
 return (
 <EmptyState
 icon={CalendarDays}
 title="Tetapan tidak tersedia"
 description="Gagal memuatkan tetapan perancangan stok."
 />);
 }

 return (
 <div className="space-y-6">
 <div className="rounded-xl border bg-card p-5">
 <div className="mb-4 flex items-start gap-3">
 <TrendingUp className="mt-0.5 h-5 w-5 text-violet-600" />
 <div>
 <h3 className="font-semibold">Ramalan Order {HQ_DISTRIBUTOR_LABEL}</h3>
 <p className="mt-1 text-sm text-muted-foreground">
 Kawal berapa lama stok perlu dikekalkan selepas terima stok baharu, dan buffer
 keselamatan per kiosk. Cadangan AI di Order Kilang guna nilai ini bersama kalendar
 cuti Malaysia &amp; trafik lebuhraya.
 </p>
 </div>
 </div>

 <div className="grid gap-4 sm:grid-cols-2">
 <div className="space-y-2">
 <Label htmlFor="coverage-days">Hari coverage stok selepas terima</Label>
 <Input
 id="coverage-days"
 type="number"
 min={0}
 max={7}
 step={1}
 disabled={!canEdit}
 value={coverageDays}
 onChange={(e) => setCoverageDays(e.target.value)}
 />
 <p className="text-xs text-muted-foreground">
 0 = cukup untuk hari terima sahaja - 1 = default (1 hari selepas production) - 
 tingkatkan sebelum cuti panjang.
 </p>
 </div>

 <div className="space-y-2">
 <Label htmlFor="safety-buffer">Buffer keselamatan (pcs)</Label>
 <Input
 id="safety-buffer"
 type="number"
 min={0}
 max={200}
 step={1}
 disabled={!canEdit}
 value={safetyBuffer}
 onChange={(e) => setSafetyBuffer(e.target.value)}
 />
 <p className="text-xs text-muted-foreground">
 Stok tambahan minimum per jenis roti di setiap kiosk - elak kehabisan semasa
 lonjakan cuti/balik kampung.
 </p>
 </div>
 </div>

 {canEdit ? (
 <Button
 type="button"
 className="mt-4 gap-2"
 disabled={saving}
 onClick={handleSave}
 >
 <Save className="h-4 w-4" />
 {saving ? 'Menyimpan...' : 'Simpan Tetapan'}
 </Button>) : (
 <p className="mt-4 text-xs text-muted-foreground">
 Paparan sahaja - hubungi Operation Manager / Admin untuk ubah.
 </p>)}

 {settings.updated_at && (
 <p className="mt-2 text-[10px] text-muted-foreground">
 Kemaskini terakhir:{' '}
 {new Date(settings.updated_at).toLocaleString('ms-MY', {
 dateStyle: 'medium',
 timeStyle: 'short',
 })}
 </p>)}
 </div>

 <div className="rounded-xl border bg-card p-5">
 <div className="mb-3 flex items-center gap-2">
 <CalendarDays className="h-5 w-5 text-amber-600" />
 <h3 className="font-semibold">Cuti Malaysia (90 hari akan datang)</h3>
 </div>
 <p className="mb-3 text-sm text-muted-foreground">
 Sistem auto tingkatkan cadangan order semasa cuti umum, cuti sekolah, festif &amp;
 tempoh balik kampung di lebuhraya. Hujung minggu (Jumaat-Ahad) juga dikira.
 </p>

 {holidays.length === 0 ? (
 <p className="text-sm text-muted-foreground">Tiada cuti direkod dalam 90 hari.</p>) : (
 <div className="flex flex-wrap gap-2">
 {holidays.map((h) => (
 <Badge
 key={`${h.holiday_date}-${h.name}`}
 variant="outline"
 className="font-normal"
 title={`Pengganda permintaan ×${h.demand_multiplier}`}
 >
 {formatHolidayDate(h.holiday_date)} - {h.name} ({formatHolidayType(h.holiday_type)})
 <span className="ml-1 text-muted-foreground">×{h.demand_multiplier}</span>
 </Badge>))}
 </div>)}
 </div>
 </div>);
}
