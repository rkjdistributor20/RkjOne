'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
 Activity,
 AlertTriangle,
 CheckCircle2,
 DatabaseBackup,
 LockKeyhole,
 RefreshCw,
 ShieldCheck,
 Smartphone,
 ServerCog,
 XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
 KpiCard,
 KpiGrid,
 ModuleLoading,
 SectionCard,
} from '@/components/shared/module-ui';
import { fetchSystemHealth } from '@/lib/settings/api';
import type {
 SystemHealthCheck,
 SystemHealthSection,
 SystemHealthSnapshot,
 SystemHealthStatus,
} from '@/lib/system/health';

const sectionIcons: Record<string, typeof ShieldCheck> = {
 security: ShieldCheck,
 access: LockKeyhole,
 backup: DatabaseBackup,
 mobile: Smartphone,
 operations: ServerCog,
};

function statusTone(status: SystemHealthStatus) {
 if (status === 'PASS') return {
 label: 'OK',
 className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
 icon: CheckCircle2,
 };
 if (status === 'WARN') return {
 label: 'Perlu Pantau',
 className: 'border-amber-200 bg-amber-50 text-amber-700',
 icon: AlertTriangle,
 };
 return {
 label: 'Perlu Baiki',
 className: 'border-red-200 bg-red-50 text-red-700',
 icon: XCircle,
 };
}

function StatusBadge({ status }: { status: SystemHealthStatus }) {
 const tone = statusTone(status);
 const Icon = tone.icon;
 return (
 <Badge variant="outline" className={tone.className}>
 <Icon className="mr-1 h-3.5 w-3.5" />
 {tone.label}
 </Badge>);
}

function CheckRow({ item }: { item: SystemHealthCheck }) {
 return (
 <div className="grid gap-3 rounded-xl border bg-background/80 p-3 md:grid-cols-[180px_1fr_auto] md:items-start">
 <div className="space-y-1">
 <p className="text-sm font-semibold text-[#141414]">{item.label}</p>
 <StatusBadge status={item.status} />
 </div>
 <div className="space-y-1 text-sm">
 <p className="text-muted-foreground">{item.detail}</p>
 {item.action && (
 <p className="font-medium text-[#7c5a00]">{item.action}</p>)}
 </div>
 </div>);
}

function SectionBlock({ section }: { section: SystemHealthSection }) {
 const Icon = sectionIcons[section.key] ?? Activity;
 return (
 <SectionCard
 title={
 <span className="flex items-center gap-2">
 <Icon className="h-4 w-4 text-[#b88700]" />
 {section.title}
 </span>
 }
 description={section.description}
 >
 <div className="space-y-3">
 {section.checks.map((item) => (
 <CheckRow key={item.key} item={item} />
 ))}
 </div>
 </SectionCard>);
}

export function SystemHealthPanel() {
 const [snapshot, setSnapshot] = useState<SystemHealthSnapshot | null>(null);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);

 const load = useCallback(async (silent = false) => {
 if (silent) setRefreshing(true);
 else setLoading(true);
 try {
 const data = await fetchSystemHealth();
 setSnapshot(data.snapshot);
 if (silent) toast.success('Kesihatan sistem dikemas kini');
 } catch (err) {
 const msg = err instanceof Error ? err.message : 'Gagal muat kesihatan sistem';
 toast.error(msg);
 } finally {
 setLoading(false);
 setRefreshing(false);
 }
 }, []);

 useEffect(() => {
 load();
 }, [load]);

 const totals = useMemo(() => {
 const checks = snapshot?.sections.flatMap((section) => section.checks) ?? [];
 return {
 pass: checks.filter((item) => item.status === 'PASS').length,
 warn: checks.filter((item) => item.status === 'WARN').length,
 fail: checks.filter((item) => item.status === 'FAIL').length,
 total: checks.length,
 };
 }, [snapshot]);

 if (loading) return <ModuleLoading rows={2} />;

 if (!snapshot) {
 return (
 <SectionCard
 title="Kesihatan Sistem"
 description="Data belum dapat dimuatkan."
 action={
 <Button variant="outline" onClick={() => load(true)} disabled={refreshing}>
 <RefreshCw className="mr-2 h-4 w-4" />
 Cuba Semula
 </Button>
 }
 >
 <p className="text-sm text-muted-foreground">
 Semak sambungan database dan sesi pentadbir utama.
 </p>
 </SectionCard>);
 }

 return (
 <div className="space-y-5">
 <SectionCard
 title="Pusat Kesihatan Sistem"
 description="Audit ringkas untuk keselamatan, akses, backup, mobile app, payment dan operasi harian. Nilai rahsia tidak dipaparkan."
 action={
 <Button variant="outline" onClick={() => load(true)} disabled={refreshing}>
 <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
 Refresh
 </Button>
 }
 >
 <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
 <div>
 <div className="flex flex-wrap items-center gap-2">
 <StatusBadge status={snapshot.overall} />
 <Badge variant="secondary">{totals.total} semakan</Badge>
 <Badge variant="outline">Dijana {new Date(snapshot.generated_at).toLocaleString('ms-MY')}</Badge>
 </div>
 <p className="mt-2 text-sm text-muted-foreground">
 Fokus utama: pastikan staf hanya nampak modul mereka, backup wujud, mobile readiness lulus, dan payment gateway kekal manual sehingga merchant benar-benar approved.
 </p>
 </div>
 </div>
 </SectionCard>

 <KpiGrid cols={4}>
 <KpiCard
 title="Semakan OK"
 value={totals.pass}
 description="Kawalan berfungsi"
 icon={CheckCircle2}
 variant="success"
 />
 <KpiCard
 title="Perlu Pantau"
 value={totals.warn}
 description="Bukan gagal, tetapi perlu tindakan owner/admin"
 icon={AlertTriangle}
 variant="warning"
 />
 <KpiCard
 title="Perlu Baiki"
 value={totals.fail}
 description="Jangan deploy jika kritikal"
 icon={XCircle}
 variant={totals.fail > 0 ? 'danger' : 'success'}
 />
 <KpiCard
 title="Migrasi DB"
 value={snapshot.counters.migrations}
 description={`${snapshot.counters.branches ?? 0} cawangan, ${snapshot.counters.active_profiles ?? 0} profil aktif`}
 icon={DatabaseBackup}
 />
 </KpiGrid>

 <div className="grid gap-4 xl:grid-cols-2">
 {snapshot.sections.map((section) => (
 <SectionBlock key={section.key} section={section} />
 ))}
 </div>
 </div>);
}
