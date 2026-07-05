'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, Store } from 'lucide-react';
import { fetchStaffGrouped } from '@/lib/staff/api';
import type { StaffRegionGroup } from '@/lib/staff/types';
import { BranchScopeSelect } from '@/components/shared/branch-scope-select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth-store';
import { isAreaManager, needsBranchPicker } from '@/lib/auth/branch-scope';

interface StaffByRegionPanelProps {
 /** Tapis staf ikut cawangan terpilih (kosong = semua dalam kawasan) */
 branchId?: string;
 onBranchChange?: (branchId: string) => void;
 showBranchPicker?: boolean;
 compact?: boolean;
}

export function StaffByRegionPanel({
 branchId: controlledBranchId,
 onBranchChange,
 showBranchPicker,
 compact = false,
}: StaffByRegionPanelProps) {
 const profile = useAuthStore((s) => s.profile);
 const [internalBranchId, setInternalBranchId] = useState('');
 const [groups, setGroups] = useState<StaffRegionGroup[]>([]);
 const [loading, setLoading] = useState(true);

 const branchId = controlledBranchId ?? internalBranchId;
 const setBranchId = onBranchChange ?? setInternalBranchId;
 const pickerVisible =
 showBranchPicker ??
 (profile ? needsBranchPicker(profile) : false);

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const data = await fetchStaffGrouped(branchId || undefined);
 setGroups(data.groups);
 } catch {
 setGroups([]);
 } finally {
 setLoading(false);
 }
 }, [branchId]);

 useEffect(() => {
 load();
 }, [load]);

 if (loading) {
 return <Skeleton className={compact ? 'h-32 w-full' : 'h-64 w-full'} />;
 }

 return (
 <div className="space-y-4">
 {pickerVisible && (
 <BranchScopeSelect
 value={branchId}
 onChange={setBranchId}
 allowAll={profile ? isAreaManager(profile.role) : false}
 allLabel="Semua cawangan kawasan saya"
 />)}

 {groups.length === 0 ? (
 <p className="text-sm text-muted-foreground">Tiada staf dijumpai</p>) : (
 groups.map((group) => (
 <Card key={group.region_id}>
 <CardHeader className="pb-2">
 <CardTitle className="flex flex-wrap items-center gap-2 text-base">
 <Users className="h-4 w-4 text-primary" />
 {group.region_name}
 {group.manager_name && (
 <Badge variant="secondary" className="font-normal">
 AM: {group.manager_name}
 </Badge>)}
 <Badge variant="outline" className="font-normal tabular-nums">
 {group.staff_count} staf
 </Badge>
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 {group.branches.map((branch) => (
 <div key={branch.branch_id} className="rounded-lg border bg-muted/20 p-3">
 <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
 <Store className="h-3.5 w-3.5 text-muted-foreground" />
 {branch.branch_code} - {branch.branch_name}
 <span className="text-xs font-normal text-muted-foreground">
 ({branch.staff.length} staf)
 </span>
 </p>
 {branch.staff.length === 0 ? (
 <p className="text-xs text-muted-foreground">Tiada staf</p>) : (
 <div
 className={
 compact
 ? 'flex flex-wrap gap-1.5'
 : 'grid gap-1 sm:grid-cols-2 lg:grid-cols-3'
 }
 >
 {branch.staff.map((s) => (
 <div
 key={s.id}
 className="flex items-center justify-between rounded-md border bg-background px-2 py-1.5 text-sm"
 >
 <span>
 <span className="font-medium">{s.full_name}</span>
 <span className="ml-1 text-xs text-muted-foreground">
 {s.staff_code}
 </span>
 </span>
 {s.status !== 'ACTIVE' && (
 <Badge variant="secondary" className="text-[10px]">
 {s.status}
 </Badge>)}
 </div>))}
 </div>)}
 </div>))}
 </CardContent>
 </Card>)))}
 </div>);
}
