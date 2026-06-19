'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Clock, Calendar, CheckCircle } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function ShiftManagement() {
  const profile = useAuthStore((s) => s.profile);
  const branchId = profile?.branch_id ?? undefined;

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
        setNewShift((s) => ({ ...s, staff_id: stf.staff[0].id }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load shifts');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateShift(e: React.FormEvent) {
    e.preventDefault();
    if (!branchId) {
      toast.error('Branch required to create shift');
      return;
    }
    try {
      await createStaffShift({
        staff_id: newShift.staff_id,
        branch_id: branchId,
        shift_date: newShift.shift_date,
        template_id: newShift.template_id || undefined,
      });
      toast.success('Shift request created');
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create shift');
    }
  }

  const canApprove = ['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER'].includes(
    profile?.role ?? ''
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Shift Management</h2>
        <p className="text-sm text-muted-foreground">
          Flexible shifts, attendance, working hours &amp; OT
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Tabs defaultValue="schedule">
          <TabsList>
            <TabsTrigger value="schedule" className="gap-1">
              <Calendar className="h-4 w-4" /> Schedule
            </TabsTrigger>
            <TabsTrigger value="attendance" className="gap-1">
              <Clock className="h-4 w-4" /> Attendance
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1">
              Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Request Shift</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateShift} className="flex flex-wrap gap-3">
                  <div className="space-y-1">
                    <Label>Staff</Label>
                    <Select
                      value={newShift.staff_id}
                      onValueChange={(v) => v && setNewShift({ ...newShift, staff_id: v })}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {staff.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Template</Label>
                    <Select
                      value={newShift.template_id}
                      onValueChange={(v) => setNewShift({ ...newShift, template_id: v ?? '' })}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Optional" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={newShift.shift_date}
                      onChange={(e) =>
                        setNewShift({ ...newShift, shift_date: e.target.value })
                      }
                      className="w-[160px]"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" className="bg-amber-500 hover:bg-amber-600">
                      Create Shift
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <h3 className="font-semibold">Scheduled Shifts</h3>
              {shifts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shifts scheduled</p>
              ) : (
                shifts.map((shift) => (
                  <div key={shift.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <div>
                      <p className="font-medium">{shift.staff.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {shift.shift_date}
                        {shift.template?.name && ` · ${shift.template.name}`}
                        {shift.scheduled_hours && ` · ${shift.scheduled_hours}h`}
                        {shift.actual_hours != null && ` · Worked ${shift.actual_hours}h`}
                        {shift.ot_hours != null && Number(shift.ot_hours) > 0 &&
                          ` · OT ${shift.ot_hours}h`}
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
                            toast.success('Shift approved');
                            loadData();
                          }}
                        >
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Approve
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="attendance" className="mt-4 space-y-4">
            {branchId && staff.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Clock In / Out</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {staff.slice(0, 5).map((s) => (
                    <div key={s.id} className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await clockIn(s.id, branchId);
                          toast.success(`${s.full_name} clocked in`);
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
                          toast.success(`${s.full_name} clocked out`);
                          loadData();
                        }}
                      >
                        Out
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <h3 className="font-semibold">Attendance Records</h3>
              {attendance.map((a) => (
                <div key={a.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{a.staff.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.attendance_date}
                    {a.clock_in && ` · In ${new Date(a.clock_in).toLocaleTimeString('ms-MY')}`}
                    {a.clock_out && ` · Out ${new Date(a.clock_out).toLocaleTimeString('ms-MY')}`}
                    {a.hours_worked != null && ` · ${a.hours_worked}h`}
                    {a.ot_hours != null && Number(a.ot_hours) > 0 && ` · OT ${a.ot_hours}h`}
                  </p>
                </div>
              ))}
            </div>
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
                      ? `${t.start_time.slice(0, 5)} – ${t.end_time.slice(0, 5)}`
                      : 'Custom'}
                    {t.default_hours && ` · ${t.default_hours}h`}
                    {t.crosses_midnight && ' · Cross midnight'}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
