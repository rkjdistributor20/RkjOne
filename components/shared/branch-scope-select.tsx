'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchScopedBranches } from '@/lib/staff/api';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { boundSelectValue } from '@/lib/ui/select-utils';

export interface ScopedBranchOption {
 id: string;
 branch_code: string;
 branch_name: string;
 region_name?: string | null;
 manager_name?: string | null;
}

interface BranchScopeSelectProps {
 value: string;
 onChange: (branchId: string) => void;
 label?: string;
 className?: string;
 allowAll?: boolean;
 allLabel?: string;
}

export function BranchScopeSelect({
 value,
 onChange,
 label = 'Cawangan / Kiosk',
 className,
 allowAll = false,
 allLabel = 'Semua cawangan (kawasan)',
}: BranchScopeSelectProps) {
 const [branches, setBranches] = useState<ScopedBranchOption[]>([]);
 const [loading, setLoading] = useState(true);

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const { branches: list } = await fetchScopedBranches();
 setBranches(list);
 if (!value && list.length === 1) {
 onChange(list[0].id);
 }
 } catch {
 setBranches([]);
 } finally {
 setLoading(false);
 }
 }, [value, onChange]);

 useEffect(() => {
 load();
 }, [load]);

 useEffect(() => {
 if (loading || !value || branches.length === 0) return;
 if (!branches.some((b) => b.id === value)) {
 onChange(allowAll ? '' : branches[0].id);
 }
 }, [branches, value, loading, allowAll, onChange]);

 const selected = branches.find((b) => b.id === value);
 const branchOptionIds = branches.map((b) => b.id);
 const selectValue = value
 ? boundSelectValue(value, branchOptionIds)
 : allowAll
 ? '__all__'
 : undefined;
 const managerHint =
 selected?.manager_name && selected?.region_name
 ? `${selected.region_name} - ${selected.manager_name}`
 : selected?.region_name;

 return (
 <div className={className}>
 {label && <Label className="mb-1.5 block text-sm">{label}</Label>}
 <Select
 value={selectValue ?? ''}
 onValueChange={(v) => {
 if (v === '__all__') onChange('');
 else if (v) onChange(v);
 }}
 disabled={loading || (!allowAll && branches.length === 0)}
 >
 <SelectTrigger className="w-full max-w-md">
 <SelectValue
 placeholder={
 loading
 ? 'Memuatkan cawangan...'
 : branches.length
 ? 'Pilih cawangan'
 : 'Tiada cawangan'
 }
 >
 {value && selected
 ? `${selected.branch_code} - ${selected.branch_name}`
 : allowAll && !value
 ? allLabel
 : undefined}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {allowAll && (
 <SelectItem value="__all__">{allLabel}</SelectItem>)}
 {branches.map((b) => (
 <SelectItem key={b.id} value={b.id}>
 {b.branch_code} - {b.branch_name}
 {b.region_name ? ` (${b.region_name})` : ''}
 </SelectItem>))}
 </SelectContent>
 </Select>
 {managerHint && (
 <p className="mt-1 text-xs text-muted-foreground">
 Area Manager: {managerHint}
 </p>)}
 </div>);
}
