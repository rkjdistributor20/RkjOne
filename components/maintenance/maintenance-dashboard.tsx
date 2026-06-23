'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, RefreshCw, UserRoundCheck, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  EmptyState,
  KpiCard,
  KpiGrid,
  ModuleHeader,
  ModuleLayout,
  PrimaryActionButton,
  RecordRow,
  SectionCard,
} from '@/components/shared/module-ui';
import { useAuthStore } from '@/stores/auth-store';

type BranchOption = {
  id: string;
  branch_code: string;
  branch_name: string;
  region_name: string | null;
};

type MaintenanceReport = {
  id: string;
  report_number: string;
  report_type: 'MAINTENANCE' | 'STAFF_SHORTAGE' | 'EMERGENCY';
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: string;
  title: string;
  description: string;
  substitute_required: boolean;
  substitute_status: string;
  preferred_visit_date: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  manager_notes: string | null;
  created_at: string;
  branch: { branch_code: string; branch_name: string } | null;
  reporter: { full_name: string; role: string } | null;
  assignee: { full_name: string } | null;
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Biasa',
  HIGH: 'Tinggi',
  URGENT: 'Segera',
};

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Baharu',
  REVIEWING: 'Semakan',
  ASSIGNED: 'Ditugaskan',
  IN_PROGRESS: 'Dalam Tindakan',
  WAITING_PARTS: 'Tunggu Barang',
  RESOLVED: 'Selesai',
  CANCELLED: 'Batal',
};

const CATEGORY_LABEL: Record<string, string> = {
  GENERAL: 'Umum',
  ELECTRICAL: 'Elektrik',
  PLUMBING: 'Paip/Air',
  EQUIPMENT: 'Peralatan',
  SIGNAGE: 'Signboard',
  CLEANLINESS: 'Kebersihan',
  SAFETY: 'Keselamatan',
  STAFFING: 'Kekurangan Staf',
};

function canManage(role?: string | null) {
  return ['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'MAINTENANCE_MANAGER'].includes(role ?? '');
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export function MaintenanceDashboard() {
  const { profile } = useAuthStore();
  const managerMode = canManage(profile?.role);
  const [reports, setReports] = useState<MaintenanceReport[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    branch_id: '',
    report_type: 'MAINTENANCE',
    category: 'GENERAL',
    priority: 'MEDIUM',
    title: '',
    description: '',
    substitute_required: false,
    preferred_visit_date: '',
    contact_name: '',
    contact_phone: '',
  });

  async function load() {
    setLoading(true);
    try {
      const [reportData, branchData] = await Promise.all([
        fetchJson<{ reports: MaintenanceReport[] }>('/api/maintenance'),
        fetchJson<{ branches: BranchOption[] }>('/api/branches'),
      ]);
      setReports(reportData.reports);
      setBranches(branchData.branches);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan maintenance');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const open = reports.filter((r) => !['RESOLVED', 'CANCELLED'].includes(r.status));
    return {
      total: reports.length,
      open: open.length,
      urgent: open.filter((r) => r.priority === 'URGENT').length,
      substitute: open.filter((r) => r.substitute_required).length,
    };
  }, [reports]);

  async function submitReport() {
    if (!form.branch_id) {
      toast.error('Pilih cawangan');
      return;
    }
    if (!form.title.trim() || !form.description.trim()) {
      toast.error('Tajuk dan penerangan wajib diisi');
      return;
    }
    setSubmitting(true);
    try {
      await fetchJson('/api/maintenance', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      toast.success('Report maintenance dihantar kepada Hanif');
      setForm({
        branch_id: '',
        report_type: 'MAINTENANCE',
        category: 'GENERAL',
        priority: 'MEDIUM',
        title: '',
        description: '',
        substitute_required: false,
        preferred_visit_date: '',
        contact_name: '',
        contact_phone: '',
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal hantar report');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: string, status: string, substituteStatus?: string) {
    try {
      await fetchJson(`/api/maintenance/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          substitute_status: substituteStatus,
        }),
      });
      toast.success('Status dikemaskini');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal kemas kini status');
    }
  }

  return (
    <ModuleLayout>
      <ModuleHeader
        title="Maintenance Cawangan"
        description="Platform khas Hanif untuk menerima report maintenance semua cawangan Roti Kaya Junus dan urus staf ganti jika berlaku musibah atau kekurangan staf."
        icon={Wrench}
        actions={
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
        badges={
          <>
            <Badge variant="secondary">Manager Maintenance: Muhammad Hanif</Badge>
            <Badge variant="outline">RKJ Distributor</Badge>
          </>
        }
      />

      <KpiGrid cols={4}>
        <KpiCard title="Jumlah Report" value={summary.total} icon={ClipboardList} />
        <KpiCard title="Masih Terbuka" value={summary.open} icon={Wrench} variant="warning" />
        <KpiCard title="Segera" value={summary.urgent} icon={AlertTriangle} variant={summary.urgent ? 'danger' : 'default'} />
        <KpiCard title="Perlu Staf Ganti" value={summary.substitute} icon={UserRoundCheck} variant="success" />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.4fr]">
        <SectionCard
          title="Hantar Report"
          description="Staf cawangan dan Area Manager boleh hantar isu untuk tindakan Hanif."
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cawangan</Label>
              <Select value={form.branch_id} onValueChange={(value) => setForm((f) => ({ ...f, branch_id: String(value ?? '') }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih cawangan" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.branch_code} - {b.branch_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Jenis report</Label>
                <Select value={form.report_type} onValueChange={(value) => setForm((f) => ({ ...f, report_type: String(value ?? '') }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                    <SelectItem value="STAFF_SHORTAGE">Kekurangan Staf</SelectItem>
                    <SelectItem value="EMERGENCY">Musibah / Kecemasan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(value) => setForm((f) => ({ ...f, priority: String(value ?? '') }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Rendah</SelectItem>
                    <SelectItem value="MEDIUM">Biasa</SelectItem>
                    <SelectItem value="HIGH">Tinggi</SelectItem>
                    <SelectItem value="URGENT">Segera</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Kategori</Label>
              <Select value={form.category} onValueChange={(value) => setForm((f) => ({ ...f, category: String(value ?? '') }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tajuk</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Contoh: Lampu kiosk rosak" />
            </div>

            <div className="space-y-2">
              <Label>Penerangan</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Terangkan masalah, lokasi dalam kiosk, dan tindakan sementara." rows={5} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tarikh lawatan diminta</Label>
                <Input type="date" value={form.preferred_visit_date} onChange={(e) => setForm((f) => ({ ...f, preferred_visit_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>No. telefon contact</Label>
                <Input value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} placeholder="012..." />
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.substitute_required}
                onChange={(e) => setForm((f) => ({ ...f, substitute_required: e.target.checked }))}
              />
              <span>
                Perlu Hanif sebagai staf ganti kerana cawangan kekurangan staf / berlaku musibah.
              </span>
            </label>

            <PrimaryActionButton className="w-full" onClick={submitReport} disabled={submitting}>
              Hantar Report
            </PrimaryActionButton>
          </div>
        </SectionCard>

        <SectionCard
          title={managerMode ? 'Inbox Hanif' : 'Report Saya / Kawasan'}
          description={managerMode ? 'Hanif dan pengurusan boleh kemas kini status tindakan.' : 'Semak status report yang telah dihantar.'}
        >
          {reports.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Tiada report maintenance" description="Report baharu akan dipaparkan di sini." />
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <RecordRow key={report.id} className="items-start">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{report.report_number}</Badge>
                      <Badge>{STATUS_LABEL[report.status] ?? report.status}</Badge>
                      <Badge variant={report.priority === 'URGENT' ? 'destructive' : 'secondary'}>
                        {PRIORITY_LABEL[report.priority] ?? report.priority}
                      </Badge>
                      {report.substitute_required && (
                        <Badge variant="outline">Staf ganti: {report.substitute_status}</Badge>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold">{report.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {report.branch ? `${report.branch.branch_code} - ${report.branch.branch_name}` : 'Tiada cawangan'} · {CATEGORY_LABEL[report.category] ?? report.category}
                      </p>
                    </div>
                    <p className="text-sm leading-relaxed">{report.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Reporter: {report.reporter?.full_name ?? '-'} · {new Date(report.created_at).toLocaleString('ms-MY')}
                    </p>
                  </div>

                  {managerMode && (
                    <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                      <Button size="sm" variant="outline" onClick={() => updateStatus(report.id, 'REVIEWING')}>
                        Semak
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => updateStatus(report.id, 'IN_PROGRESS', report.substitute_required ? 'HANIF_ASSIGNED' : undefined)}>
                        Tindakan
                      </Button>
                      <Button size="sm" onClick={() => updateStatus(report.id, 'RESOLVED', report.substitute_required ? 'COVERED' : undefined)}>
                        Selesai
                      </Button>
                    </div>
                  )}
                </RecordRow>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </ModuleLayout>
  );
}
