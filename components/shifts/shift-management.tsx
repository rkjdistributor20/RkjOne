'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Clock, Calendar, CheckCircle, Users, CalendarRange, UserCircle } from 'lucide-react';
import {
 fetchShiftTemplates,
 fetchStaffShifts,
 fetchAttendance,
 fetchStaffList,
 createStaffShift,
 approveShift,
 clockIn,
 clockOut,
} from '@/lib/shifts/api';
import type { ShiftTemplate, StaffShiftRow, AttendanceRow } from '@/lib/shifts/types';
import { useAuthStore } from '@/stores/auth-store';
import { needsBranchPicker } from '@/lib/auth/branch-scope';
import { BranchScopeSelect } from '@/components/shared/branch-scope-select';
import {
 ModuleLayout,
 ModuleHeader,
 ModuleLoading,
 BranchRequiredPrompt,
 moduleTabsListClass,
 moduleTabsTriggerClass,
} from '@/components/shared/module-ui';
import { StaffByRegionPanel } from '@/components/staff/staff-by-region-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { boundSelectValue } from '@/lib/ui/select-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WeeklyRosterPlanner } from '@/components/shifts/weekly-roster-planner';
import { StaffSchedulePanel } from '@/components/shifts/staff-schedule-panel';

export function ShiftManagement() {
 const searchParams = useSearchParams();
 const defaultTab = searchParams.get('tab') ?? undefined;
 const urlBranch = searchParams.get('branch') ?? '';

 const profile = useAuthStore((s) => s.profile);
 const isStaff = profile?.role === 'STAFF';
 const canManageRoster =
 profile &&
 ['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER'].includes(profile.role);
 const showBranchPicker = profile ? needsBranchPicker(profile) : false;
 const [selectedBranchId, setSelectedBranchId] = useState(
 urlBranch || (profile?.branch_id ?? ''));

 const branchId = showBranchPicker ? selectedBranchId : profile?.branch_id ?? undefined;

 const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
 const [staff, setStaff] = useState<Array<{ id: string; staff_code: string; full_name: string }>>([]);
 const [shifts, setShifts] = useState<StaffShiftRow[]>([]);
 const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
 const [loading, setLoading] = useState(true);

 const [newShift, setNewShift] = useState({
 staff_id: '',
 template_id: '',
 shift_date: new Date().toISOString().slice(0, 10),
 });

 const loadData = useCallback(async () => {
 if (showBranchPicker && !branchId) {
 setLoading(false);
 setStaff([]);
 setShifts([]);
 setAttendance([]);
 return;
 }

 setLoading(true);
 try {
 const [tpl, stf, shf, att] = await Promise.all([
 fetchShiftTemplates(),
 fetchStaffList(branchId),
 fetchStaffShifts(branchId),
 fetchAttendance(branchId),
 ]);
 setTemplates(tpl.templates);
 setStaff(stf.staff);
 setShifts(shf.shifts as StaffShiftRow[]);
 setAttendance(att.attendance as AttendanceRow[]);
 if (stf.staff[0]) {
 setNewShift((s) => ({...s, staff_id: stf.staff[0].id }));
 } else {
 setNewShift((s) => ({...s, staff_id: '' }));
 }
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan shift');
 } finally {
 setLoading(false);
 }
 }, [branchId, showBranchPicker]);

 useEffect(() => {
 loadData();
 }, [loadData]);

 async function handleCreateShift(e: React.FormEvent) {
 e.preventDefault();
 if (!branchId) {
 toast.error('Pilih cawangan dahulu');
 return;
 }
 try {
 await createStaffShift({
 staff_id: newShift.staff_id,
 branch_id: branchId,
 shift_date: newShift.shift_date,
 template_id: newShift.template_id || undefined,
 });
 toast.success('Permintaan shift dicipta');
 loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal cipta shift');
 }
 }

 const canApprove = ['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER'].includes(
 profile?.role ?? '');

 const staffSelectValue = boundSelectValue(
 newShift.staff_id,
 staff.map((s) => s.id));
 const templateSelectValue = boundSelectValue(
 newShift.template_id,
 templates.map((t) => t.id));
 const selectedStaffMember = staff.find((s) => s.id === newShift.staff_id);
 const selectedTemplate = templates.find((t) => t.id === newShift.template_id);

 const initialTab =
 defaultTab ??
 (isStaff ? 'my-schedule' : canManageRoster ? 'roster' : 'schedule');

 if (isStaff) {
 return (
 <ModuleLayout>
 <ModuleHeader
 title="Jadual Syif Saya"
 description="Lihat jadual mingguan yang ditetapkan pengurus kawasan"
 icon={UserCircle}
 />
 <StaffSchedulePanel />
 </ModuleLayout>);
 }

 return (
 <ModuleLayout>
 <ModuleHeader
 title="Pengurusan Syif"
 description="Jadual shift, kehadiran staf, dan kelulusan - ikut skop cawangan Area Manager"
 icon={Clock}
 />

 {showBranchPicker && (
 <BranchScopeSelect
 value={selectedBranchId}
 onChange={setSelectedBranchId}
 label="Pilih cawangan / kiosk"
 />)}

 {showBranchPicker && !branchId ? (
 <BranchRequiredPrompt message="Sila pilih cawangan untuk melihat jadual shift dan kehadiran." />) : loading ? (
 <ModuleLoading />) : (
 <Tabs defaultValue={initialTab} className="space-y-4">
 <TabsList className={moduleTabsListClass}>
 {canManageRoster && (
 <TabsTrigger value="roster" className="gap-1">
 <CalendarRange className="h-4 w-4" /> Jadual Mingguan
 </TabsTrigger>)}
 <TabsTrigger value="schedule" className="gap-1">
 <Calendar className="h-4 w-4" /> Syif
 </TabsTrigger>
 <TabsTrigger value="attendance" className="gap-1">
 <Clock className="h-4 w-4" /> Kehadiran
 </TabsTrigger>
 <TabsTrigger value="staff" className="gap-1">
 <Users className="h-4 w-4" /> Staf
 </TabsTrigger>
 <TabsTrigger value="templates" className="gap-1">
 Template
 </TabsTrigger>
 </TabsList>

 {canManageRoster && (
 <TabsContent value="roster" className="mt-4 space-y-4">
 {showBranchPicker && !branchId ? (
 <BranchRequiredPrompt message="Pilih cawangan untuk sediakan jadual staf mingguan." />) : branchId ? (
 <WeeklyRosterPlanner
 branchId={branchId}
 initialWeek={searchParams.get('week') ?? undefined}
 />) : null}
 </TabsContent>)}

 <TabsContent value="schedule" className="mt-4 space-y-6">
 <Card>
 <CardHeader>
 <CardTitle className="text-base">Mohon Shift</CardTitle>
 </CardHeader>
 <CardContent>
 <form onSubmit={handleCreateShift} className="flex flex-wrap gap-3">
 <div className="space-y-1">
 <Label>Staf</Label>
 <Select
 value={staffSelectValue ?? ''}
 onValueChange={(v) => v && setNewShift({...newShift, staff_id: v })}
 >
 <SelectTrigger className="w-[200px]">
 <SelectValue placeholder="Pilih staf">
 {selectedStaffMember?.full_name}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {staff.map((s) => (
 <SelectItem key={s.id} value={s.id}>
 {s.full_name}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1">
 <Label>Template</Label>
 <Select
 value={templateSelectValue ?? ''}
 onValueChange={(v) => setNewShift({ ...newShift, template_id: v ?? '' })}
 >
 <SelectTrigger className="w-[180px]">
 <SelectValue placeholder="Pilihan">
 {selectedTemplate?.name}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {templates.map((t) => (
 <SelectItem key={t.id} value={t.id}>
 {t.name}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1">
 <Label>Tarikh</Label>
 <Input
 type="date"
 value={newShift.shift_date}
 onChange={(e) =>
 setNewShift({...newShift, shift_date: e.target.value })
 }
 className="w-[160px]"
 />
 </div>
 <div className="flex items-end">
 <Button type="submit" disabled={!branchId || !staff.length}>
 Cipta Shift
 </Button>
 </div>
 </form>
 </CardContent>
 </Card>

 <div className="space-y-2">
 <h3 className="font-semibold">Shift Dijadualkan</h3>
 {shifts.length === 0 ? (
 <p className="text-sm text-muted-foreground">Tiada shift</p>) : (
 shifts.map((shift) => (
 <div key={shift.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
 <div>
 <p className="font-medium">{shift.staff.full_name}</p>
 <p className="text-xs text-muted-foreground">
 {shift.shift_date}
 {shift.template?.name && ` - ${shift.template.name}`}
 {shift.scheduled_hours && ` - ${shift.scheduled_hours}j`}
 {shift.actual_hours != null && ` - Kerja ${shift.actual_hours}j`}
 {shift.ot_hours != null && Number(shift.ot_hours) > 0 &&
 ` - OT ${shift.ot_hours}j`}
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Badge variant={shift.status === 'APPROVED' ? 'outline' : 'secondary'}>
 {shift.status}
 </Badge>
 {canApprove && shift.status === 'PENDING' && (
 <Button
 size="sm"
 variant="outline"
 onClick={async () => {
 await approveShift(shift.id);
 toast.success('Shift diluluskan');
 loadData();
 }}
 >
 <CheckCircle className="mr-1 h-3 w-3" />
 Lulus
 </Button>)}
 </div>
 </div>)))}
 </div>
 </TabsContent>

 <TabsContent value="attendance" className="mt-4 space-y-4">
 {branchId && staff.length > 0 && (
 <Card>
 <CardHeader>
 <CardTitle className="text-base">Clock In / Out</CardTitle>
 </CardHeader>
 <CardContent className="flex flex-wrap gap-2">
 {staff.slice(0, 8).map((s) => (
 <div key={s.id} className="flex gap-1">
 <Button
 size="sm"
 variant="outline"
 onClick={async () => {
 await clockIn(s.id, branchId);
 toast.success(`${s.full_name} clock in`);
 loadData();
 }}
 >
 In: {s.full_name.split(' ')[0]}
 </Button>
 <Button
 size="sm"
 variant="secondary"
 onClick={async () => {
 await clockOut(s.id);
 toast.success(`${s.full_name} clock out`);
 loadData();
 }}
 >
 Out
 </Button>
 </div>))}
 </CardContent>
 </Card>)}

 <div className="space-y-2">
 <h3 className="font-semibold">Rekod Kehadiran</h3>
 {attendance.map((a) => (
 <div key={a.id} className="rounded-lg border p-3 text-sm">
 <p className="font-medium">{a.staff.full_name}</p>
 <p className="text-xs text-muted-foreground">
 {a.attendance_date}
 {a.clock_in && ` - Masuk ${new Date(a.clock_in).toLocaleTimeString('ms-MY')}`}
 {a.clock_out && ` - Keluar ${new Date(a.clock_out).toLocaleTimeString('ms-MY')}`}
 {a.hours_worked != null && ` - ${a.hours_worked}j`}
 {a.ot_hours != null && Number(a.ot_hours) > 0 && ` - OT ${a.ot_hours}j`}
 </p>
 </div>))}
 </div>
 </TabsContent>

 <TabsContent value="staff" className="mt-4">
 <StaffByRegionPanel
 branchId={selectedBranchId}
 onBranchChange={setSelectedBranchId}
 showBranchPicker={false}
 />
 </TabsContent>

 <TabsContent value="templates" className="mt-4">
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
 {templates.map((t) => (
 <Card key={t.id}>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm">{t.name}</CardTitle>
 </CardHeader>
 <CardContent className="text-sm text-muted-foreground">
 {t.start_time && t.end_time
 ? `${t.start_time.slice(0, 5)} - ${t.end_time.slice(0, 5)}`
 : 'Custom'}
 {t.default_hours && ` - ${t.default_hours}j`}
 {t.crosses_midnight && ' - Lintas tengah malam'}
 </CardContent>
 </Card>))}
 </div>
 </TabsContent>
 </Tabs>)}
 </ModuleLayout>);
}
