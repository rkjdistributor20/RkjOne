'use client';

import { useState, type ReactNode } from 'react';
import { CalendarDays, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { OperationsReportFilters } from '@/lib/reports/operations-types';
import { dateRangeError, mytToday, PRESETS, presetRange, type Filters, type Preset } from './model';
import { panelClass, selectClass } from './report-ui';

type Option = { id: string; label: string };
const emptyOptions: OperationsReportFilters = { branches: [], managers: [], staff: [], shifts: [] };

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
 return <div className="min-w-0 space-y-1.5">
  <label htmlFor={id} className="block text-sm font-medium">{label}</label>
  {children}
 </div>;
}

function ScopeSelect({ id, label, value, options, all, change }: {
 id: string;
 label: string;
 value: string;
 options: Option[];
 all: string;
 change: (value: string) => void;
}) {
 return <Field id={id} label={label}>
  <select id={id} className={selectClass} value={value} onChange={(event) => change(event.target.value)}>
   <option value="">{all}</option>
   {value && !options.some((option) => option.id === value) && <option value={value}>Pilihan tidak tersenarai</option>}
   {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select>
 </Field>;
}

function initialPreset(filters: Filters, today: string): Preset {
 for (const [id] of PRESETS) {
  if (id === 'custom') continue;
  const range = presetRange(id, today);
  if (range.from === filters.from && range.to === filters.to) return id;
 }
 return 'custom';
}

function Dates({ filters, today, change }: {
 filters: Filters;
 today: string;
 change: (filters: Partial<Filters>) => void;
}) {
 const [preset, setPreset] = useState(() => initialPreset(filters, today));
 const [from, setFrom] = useState(filters.from);
 const [to, setTo] = useState(filters.to);
 const [attempted, setAttempted] = useState(false);
 const error = attempted ? dateRangeError(from, to) : '';
 return <div className="space-y-2">
  <div className="max-w-xs">
   <Field id="operations-period" label="Tempoh laporan (MYT)">
    <select id="operations-period" className={selectClass} value={preset} onChange={(event) => {
     const next = event.target.value as Preset;
     setPreset(next);
     setAttempted(false);
     if (next !== 'custom') {
      const range = presetRange(next, mytToday());
      setFrom(range.from);
      setTo(range.to);
      change(range);
     }
    }}>
     {PRESETS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select>
   </Field>
  </div>
  {preset === 'custom' && <form noValidate onSubmit={(event) => {
   event.preventDefault();
   setAttempted(true);
   if (!dateRangeError(from, to)) change({ from, to });
  }} className="flex flex-wrap items-end gap-2">
   <Field id="operations-from" label="Dari (MYT)">
    <Input id="operations-from" type="date" className="min-h-10 min-w-36" value={from} onChange={(event) => setFrom(event.target.value)}
     required aria-invalid={Boolean(error)} aria-describedby={error ? 'operations-date-error' : undefined} />
   </Field>
   <Field id="operations-to" label="Hingga (MYT)">
    <Input id="operations-to" type="date" className="min-h-10 min-w-36" value={to} onChange={(event) => setTo(event.target.value)}
     required aria-invalid={Boolean(error)} aria-describedby={error ? 'operations-date-error' : undefined} />
   </Field>
   <Button type="submit" className="min-h-10">Guna julat</Button>
   {error && <p id="operations-date-error" role="alert" className="w-full text-sm text-destructive">{error}</p>}
  </form>}
 </div>;
}

export function FilterBar({ filters, today, catalog = emptyOptions, canFilterAm, change, reset, refresh, resetDates, locked }: {
 filters: Filters;
 today: string;
 catalog?: OperationsReportFilters;
 canFilterAm: boolean;
 change: (filters: Partial<Filters>) => void;
 reset: () => void;
 refresh: () => void;
 resetDates: number;
 locked?: boolean;
}) {
 const { managers, branches, staff, shifts } = catalog;
 const scopedShifts = filters.branchId ? shifts.filter((shift) => shift.branch_id === filters.branchId) : shifts;
 return <section aria-labelledby="operations-filter-title" className={panelClass}>
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h2 id="operations-filter-title" className="flex items-center gap-2 font-semibold">
    <SlidersHorizontal aria-hidden="true" className="size-4 text-amber-700" /> Penapis laporan
   </h2>
   <div className="flex flex-wrap gap-2">
    <Button type="button" variant="ghost" size="sm" disabled={locked} onClick={reset}>Tetapkan semula</Button>
    <Button type="button" variant="outline" size="sm" onClick={refresh}>
     <RefreshCw aria-hidden="true" /> Muat semula
    </Button>
   </div>
  </div>
  {locked && <p className="text-sm text-muted-foreground">Penapis asal dikekalkan. Pilih Kembali untuk mengubah penapis.</p>}
  <fieldset disabled={locked} aria-label="Penapis asal laporan" className="min-w-0 space-y-3 disabled:opacity-65">
  <Dates key={resetDates} filters={filters} today={today} change={change} />
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
   {canFilterAm && <ScopeSelect id="operations-am" label="Pengurus kawasan (AM)" value={filters.amId}
    all="Semua cawangan (termasuk tanpa AM)" options={managers.map((item) => ({ ...item, label: item.name }))}
    change={(amId) => change({ amId, branchId: '', staffId: '', shiftId: '' })} />}
   <ScopeSelect id="operations-branch" label="Cawangan" value={filters.branchId} all="Semua dalam skop"
    options={branches.map((item) => ({ ...item, label: [item.name, item.code].filter(Boolean).join(' · ') }))}
    change={(branchId) => change({ branchId, staffId: '', shiftId: '' })} />
   <ScopeSelect id="operations-staff" label="Staf / juruwang" value={filters.staffId} all="Semua staf"
    options={staff.map((item) => ({ ...item, label: item.name || 'Nama staf belum direkod' }))}
    change={(staffId) => change({ staffId })} />
   <ScopeSelect id="operations-shift" label="Syif" value={filters.shiftId} all="Semua syif"
    options={scopedShifts.map((item) => ({
     id: item.id,
     label: [item.number || 'Syif tanpa nombor', filters.branchId ? '' : branches.find((b) => b.id === item.branch_id)?.code]
      .filter(Boolean).join(' · '),
    }))}
    change={(shiftId) => change({ shiftId })} />
   <Field id="operations-data" label="Jenis data">
    <select id="operations-data" className={selectClass} value={filters.data} onChange={(event) =>
     change({ data: event.target.value === 'trial' ? 'trial' : 'operational', staffId: '', shiftId: '' })}>
     <option value="operational">Operasi</option>
     <option value="trial">Ujian berpenanda</option>
    </select>
   </Field>
  </div>
  </fieldset>
 </section>;
}

export function ActiveFilters({ filters, catalog = emptyOptions, scopedToBranches }: {
 filters: Filters;
 catalog?: OperationsReportFilters;
 scopedToBranches: boolean;
}) {
 const { from, to, amId, branchId, staffId, shiftId, data } = filters;
 const active = [
  `${from}${from === to ? '' : ' – ' + to} (MYT)`,
  data === 'trial' ? 'Rekod ujian sahaja' : 'Data operasi',
  amId && `AM: ${catalog.managers.find((option) => option.id === amId)?.name || 'dipilih'}`,
  branchId ? `Cawangan: ${catalog.branches.find((option) => option.id === branchId)?.name || 'dipilih'}`
   : scopedToBranches ? 'Semua cawangan jagaan' : 'Semua cawangan dalam skop',
  staffId && `Staf: ${catalog.staff.find((option) => option.id === staffId)?.name || 'dipilih'}`,
  shiftId && `Syif: ${catalog.shifts.find((option) => option.id === shiftId)?.number || 'dipilih'}`,
 ].filter(Boolean);
 return <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Penapis aktif">
  <span className="inline-flex items-center gap-1.5 font-semibold"><CalendarDays aria-hidden="true" className="size-3.5" /> Aktif</span>
  <ul className="flex flex-wrap gap-1.5">
   {active.map((label) => <li className="rounded-md border bg-muted/50 px-2 py-1" key={label}>{label}</li>)}
  </ul>
 </div>;
}
