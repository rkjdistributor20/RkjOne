"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  DatabaseBackup,
  FileCheck2,
  ListChecks,
  LockKeyhole,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Smartphone,
  ServerCog,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  KpiCard,
  KpiGrid,
  ModuleLoading,
  SectionCard,
} from "@/components/shared/module-ui";
import { fetchSystemHealth } from "@/lib/settings/api";
import type {
  LaunchControlItem,
  LaunchControlStatus,
  SystemHealthCheck,
  SystemHealthSection,
  SystemHealthSnapshot,
  SystemHealthStatus,
} from "@/lib/system/health";
import type {
  ProductionReadinessArea,
  ProductionReadinessStatus,
} from "@/lib/system/production-readiness";

const sectionIcons: Record<string, typeof ShieldCheck> = {
  security: ShieldCheck,
  access: LockKeyhole,
  backup: DatabaseBackup,
  mobile: Smartphone,
  operations: ServerCog,
};

function statusTone(status: SystemHealthStatus) {
  if (status === "PASS")
    return {
      label: "OK",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: CheckCircle2,
    };
  if (status === "WARN")
    return {
      label: "Perlu Pantau",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      icon: AlertTriangle,
    };
  return {
    label: "Perlu Baiki",
    className: "border-red-200 bg-red-50 text-red-700",
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
    </Badge>
  );
}

function readinessTone(status: ProductionReadinessStatus) {
  if (status === "READY")
    return {
      label: "Sedia",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: CheckCircle2,
    };
  if (status === "NEEDS_ACTION")
    return {
      label: "Perlu Tindakan",
      className: "border-amber-200 bg-amber-50 text-amber-800",
      icon: AlertTriangle,
    };
  return {
    label: "Tersekat",
    className: "border-red-200 bg-red-50 text-red-700",
    icon: XCircle,
  };
}

function ReadinessBadge({ status }: { status: ProductionReadinessStatus }) {
  const tone = readinessTone(status);
  const Icon = tone.icon;
  return (
    <Badge variant="outline" className={tone.className}>
      <Icon className="mr-1 h-3.5 w-3.5" />
      {tone.label}
    </Badge>
  );
}

function launchTone(status: LaunchControlStatus) {
  if (status === "DONE")
    return {
      label: "Selesai",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: CheckCircle2,
    };
  if (status === "ACTION")
    return {
      label: "Buat Sekarang",
      className: "border-amber-200 bg-amber-50 text-amber-800",
      icon: ListChecks,
    };
  return {
    label: "Menunggu",
    className: "border-sky-200 bg-sky-50 text-sky-700",
    icon: Clock3,
  };
}

function LaunchBadge({ status }: { status: LaunchControlStatus }) {
  const tone = launchTone(status);
  const Icon = tone.icon;
  return (
    <Badge variant="outline" className={tone.className}>
      <Icon className="mr-1 h-3.5 w-3.5" />
      {tone.label}
    </Badge>
  );
}

function LaunchControlRow({ item }: { item: LaunchControlItem }) {
  return (
    <div className="rounded-2xl border bg-background/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="bg-stone-100 text-stone-700">
              {item.priority}
            </Badge>
            <h4 className="font-semibold text-[#141414]">{item.title}</h4>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Pemilik: {item.owner}
          </p>
        </div>
        <LaunchBadge status={item.status} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {item.summary}
      </p>
      <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/55 p-3 text-sm font-medium leading-relaxed text-[#7c5a00]">
        {item.next_step}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {item.proof.map((proof) => (
          <Badge key={proof} variant="outline" className="bg-white/75 text-xs">
            {proof}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function ReadinessRow({ area }: { area: ProductionReadinessArea }) {
  return (
    <div className="rounded-xl border bg-background/85 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{area.priority}</Badge>
            <h4 className="font-semibold text-[#141414]">{area.title}</h4>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Pemilik tindakan: {area.owner}
          </p>
        </div>
        <ReadinessBadge status={area.status} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{area.summary}</p>
      <p className="mt-2 text-sm font-medium text-[#7c5a00]">
        {area.next_step}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {area.proof.map((proof) => (
          <Badge key={proof} variant="outline" className="bg-white/70 text-xs">
            {proof}
          </Badge>
        ))}
      </div>
    </div>
  );
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
          <p className="font-medium text-[#7c5a00]">{item.action}</p>
        )}
      </div>
    </div>
  );
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
    </SectionCard>
  );
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
      if (silent) toast.success("Kesihatan sistem dikemas kini");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal muat kesihatan sistem";
      toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const totals = useMemo(() => {
    const checks =
      snapshot?.sections.flatMap((section) => section.checks) ?? [];
    return {
      pass: checks.filter((item) => item.status === "PASS").length,
      warn: checks.filter((item) => item.status === "WARN").length,
      fail: checks.filter((item) => item.status === "FAIL").length,
      total: checks.length,
    };
  }, [snapshot]);
  const readiness = snapshot?.production_readiness;

  if (loading) return <ModuleLoading rows={2} />;

  if (!snapshot) {
    return (
      <SectionCard
        title="Kesihatan Sistem"
        description="Data belum dapat dimuatkan."
        action={
          <Button
            variant="outline"
            onClick={() => load(true)}
            disabled={refreshing}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Cuba Semula
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          Semak sambungan database dan sesi pentadbir utama.
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Pusat Kesihatan Sistem"
        description="Audit ringkas untuk keselamatan, akses, backup, mobile app, payment dan operasi harian. Nilai rahsia tidak dipaparkan."
        action={
          <Button
            variant="outline"
            onClick={() => load(true)}
            disabled={refreshing}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={snapshot.overall} />
              <Badge variant="secondary">{totals.total} semakan</Badge>
              <Badge variant="outline">
                Dijana {new Date(snapshot.generated_at).toLocaleString("ms-MY")}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Fokus utama: pastikan staf hanya nampak modul mereka, backup
              wujud, mobile readiness lulus, dan payment gateway kekal manual
              sehingga merchant benar-benar approved.
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
          variant={totals.fail > 0 ? "danger" : "success"}
        />
        <KpiCard
          title="Migrasi DB"
          value={snapshot.counters.migrations}
          description={`${snapshot.counters.branches ?? 0} cawangan, ${snapshot.counters.active_profiles ?? 0} profil aktif`}
          icon={DatabaseBackup}
        />
      </KpiGrid>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-[#b88700]" />
            Launch Control & UAT Owner
          </span>
        }
        description="Senarai kerja sebenar sebelum go-live: apa sudah selesai, apa perlu dibuat sekarang dan apa masih menunggu pihak luar."
      >
        <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
          <div className="rounded-2xl border bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950 p-5 text-white shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/35 bg-amber-300/10 text-amber-200">
              <Rocket className="h-6 w-6" />
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/75">
              Status Go-Live
            </p>
            <p className="mt-2 text-3xl font-semibold">
              {snapshot.launch_control.action} tindakan
            </p>
            <p className="mt-2 text-sm leading-relaxed text-stone-200">
              Gunakan panel ini sebagai senarai semak harian owner sebelum
              sistem dibuka kepada staf real.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                <p className="text-lg font-semibold text-emerald-200">
                  {snapshot.launch_control.done}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-stone-300">
                  Selesai
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                <p className="text-lg font-semibold text-amber-200">
                  {snapshot.launch_control.action}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-stone-300">
                  Tindakan
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                <p className="text-lg font-semibold text-sky-200">
                  {snapshot.launch_control.waiting}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-stone-300">
                  Tunggu
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {snapshot.launch_control.items.map((item) => (
              <LaunchControlRow key={item.key} item={item} />
            ))}
          </div>
        </div>
      </SectionCard>

      {readiness && (
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-[#b88700]" />
              Production Readiness Center
            </span>
          }
          description="10 kawasan wajib untuk menjadikan RKJ One lebih selamat, pantas, boleh diaudit dan bersedia untuk operasi sebenar."
        >
          <div className="grid gap-3 md:grid-cols-[220px_1fr]">
            <div className="rounded-xl border bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700 shadow-sm">
                <ClipboardCheck className="h-6 w-6" />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Skor kesiapan
              </p>
              <p className="mt-1 text-4xl font-semibold tabular-nums text-stone-950">
                {readiness.score}%
              </p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sedia</span>
                  <span className="font-semibold text-emerald-700">
                    {readiness.ready}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Perlu tindakan</span>
                  <span className="font-semibold text-amber-700">
                    {readiness.needs_action}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tersekat</span>
                  <span className="font-semibold text-red-700">
                    {readiness.blocked}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {readiness.areas.map((area) => (
                <ReadinessRow key={area.key} area={area} />
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {snapshot.sections.map((section) => (
          <SectionBlock key={section.key} section={section} />
        ))}
      </div>
    </div>
  );
}
