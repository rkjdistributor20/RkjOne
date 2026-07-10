"use client";

import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Factory,
  FileCheck2,
  Landmark,
  ListChecks,
  Package,
  PlayCircle,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type {
  RoleWorkflow,
  WorkflowStep,
} from "@/lib/dashboard/role-workflows";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/components/i18n/language-provider";
import { SectionCard } from "@/components/shared/module-ui";
import { translateLegacyUiText } from "@/lib/i18n/legacy-ui-text";
import { cn } from "@/lib/utils";

const MODULE_ICONS: Record<string, LucideIcon> = {
  Dashboard: ClipboardList,
  "Dashboard Kawasan": ClipboardList,
  "Papan Pemuka": ClipboardList,
  POS: ShoppingCart,
  Inventori: Package,
  Maintenance: Wrench,
  Syif: CalendarClock,
  "Jadual Saya": CalendarClock,
  "HR Syarikat": Users,
  Gaji: Banknote,
  Kewangan: Landmark,
  Reconciliation: Landmark,
  Laporan: ClipboardList,
  Kelulusan: CheckCircle2,
  Kilang: Factory,
  Warehouse: Factory,
  Logistik: Truck,
  POD: Truck,
  "Portal Ejen": Store,
  Order: Store,
  Bayaran: Banknote,
  "Outlet/POS": Store,
  Tetapan: ShieldCheck,
  Governance: ShieldCheck,
  "Perancangan AM": CalendarClock,
};

const CADENCE_TONES: Record<WorkflowStep["cadence"], string> = {
  Harian: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Mingguan: "border-sky-200 bg-sky-50 text-sky-800",
  Bulanan: "border-violet-200 bg-violet-50 text-violet-800",
  "Ikut Keperluan": "border-amber-200 bg-amber-50 text-amber-800",
};

const MAX_VISIBLE_STEPS = 4;

function getStepOwnerNote(step: WorkflowStep) {
  if (step.ownerNote) return step.ownerNote;

  const moduleName = step.module.toLowerCase();
  if (moduleName.includes("pos"))
    return "Staf rekod terus, AM/OM sahkan exception.";
  if (moduleName.includes("inventori"))
    return "AM/OM semak beza stok sebelum rasmi.";
  if (moduleName.includes("logistik") || moduleName.includes("pod")) {
    return "Driver update status, HQ Distributor pantau route.";
  }
  if (moduleName.includes("kelulusan"))
    return "Perkara sensitif naik kepada AM, OM atau owner.";
  if (moduleName.includes("kewangan") || moduleName.includes("gaji")) {
    return "Rekod bukti wajib sebelum pembayaran disahkan.";
  }
  if (moduleName.includes("kilang") || moduleName.includes("warehouse")) {
    return "Kilang rekod batch, bahan dan serahan rasmi.";
  }
  return "Ikut skop role dan rekod bukti kerja.";
}

function getStepEvidence(step: WorkflowStep) {
  const moduleName = step.module.toLowerCase();
  if (moduleName.includes("pos"))
    return "Resit, kiraan stok dan status syif dikemaskini.";
  if (moduleName.includes("inventori"))
    return "Baki stok, sebab pelarasan dan kelulusan direkod.";
  if (moduleName.includes("logistik") || moduleName.includes("pod")) {
    return "POD, masa hantar dan beza stok disahkan.";
  }
  if (moduleName.includes("maintenance"))
    return "Gambar isu, status tindakan dan kos direkod.";
  if (moduleName.includes("hr") || moduleName.includes("gaji")) {
    return "Rekod staf, cuti, kehadiran dan payroll lengkap.";
  }
  if (moduleName.includes("kilang") || moduleName.includes("warehouse")) {
    return "Order, batch production dan bahan mentah dipadankan.";
  }
  if (moduleName.includes("laporan"))
    return "Laporan boleh diaudit dan dimuat turun.";
  return "Catatan kerja dan status tugasan dikemaskini.";
}

export function WorkflowSopPanel({ workflow }: { workflow: RoleWorkflow }) {
  const { locale } = useLanguage();
  const ui = (text: string) => translateLegacyUiText(text, locale);
  const primaryHref = workflow.steps[0]?.href ?? "/dashboard";
  const firstStep = workflow.steps[0];
  const finalStep = workflow.steps[workflow.steps.length - 1];
  const visibleSteps = workflow.steps.slice(0, MAX_VISIBLE_STEPS);
  const hiddenStepCount = Math.max(workflow.steps.length - visibleSteps.length, 0);
  const topSignals = [
    {
      label: "Fokus operasi",
      value: workflow.primaryObjective,
      icon: Sparkles,
    },
    {
      label: "Mula dari",
      value: firstStep?.title ?? "Papan Pemuka",
      icon: PlayCircle,
    },
    {
      label: "Bukti akhir",
      value: finalStep ? getStepEvidence(finalStep) : "Rekod bukti kerja",
      icon: FileCheck2,
    },
  ];
  const quickChecks = [
    {
      title: "Baca arahan",
      description:
        "Pastikan skop syarikat, cawangan dan role betul sebelum mula.",
      icon: PlayCircle,
    },
    {
      title: "Rekod bukti",
      description:
        "Setiap tindakan penting perlu ada masa, staf dan catatan ringkas.",
      icon: ClipboardCheck,
    },
    {
      title: "Naikkan exception",
      description:
        "Jika luar SOP, hantar kepada AM, OM, HR, Finance atau owner mengikut skop.",
      icon: ShieldCheck,
    },
  ];

  return (
    <SectionCard
      title={ui("Aliran Kerja & SOP Harian")}
      description={`${ui(workflow.label)} - ${ui(workflow.companyScope)}`}
      action={
        <Link
          href={primaryHref}
          className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
        >
          {ui("Buka Tugasan")}
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-3">
          {topSignals.map((signal) => {
            const Icon = signal.icon;
            return (
              <div
                key={signal.label}
                className="rounded-lg border border-amber-100 bg-gradient-to-br from-white via-amber-50/40 to-emerald-50/30 p-3 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-white text-amber-700 shadow-sm">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {ui(signal.label)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-stone-950">
                      {ui(signal.value)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
          <div className="rounded-lg border bg-muted/15 p-4">
            <Badge variant="secondary" className="mb-3 gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              {ui("SOP Role")}
            </Badge>
            <h3 className="text-base font-semibold text-foreground">
              {ui(workflow.primaryObjective)}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {ui(workflow.sopSummary)}
            </p>

            <div className="mt-4 grid gap-2">
              {quickChecks.map((check) => {
                const Icon = check.icon;
                return (
                  <div
                    key={check.title}
                    className="flex gap-3 rounded-lg border border-dashed bg-background/80 p-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {ui(check.title)}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {ui(check.description)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border bg-background p-3 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                  <ListChecks className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {ui("Langkah kerja")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ui("Ikut urutan dan rekod bukti sebelum tanda selesai.")}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="bg-white">
                {visibleSteps.length}/{workflow.steps.length} {ui("langkah")}
              </Badge>
            </div>

            <div className="grid gap-2">
              {visibleSteps.map((step, index) => {
                const Icon = MODULE_ICONS[step.module] ?? ClipboardList;
                const ownerNote = getStepOwnerNote(step);
                const evidence = getStepEvidence(step);
                return (
                  <Link
                    key={`${step.title}-${step.href}`}
                    href={step.href}
                    className="group rounded-lg border bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
                  >
                    <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-start">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 sm:hidden">
                          <p className="text-sm font-semibold text-foreground">
                            {index + 1}. {ui(step.title)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {ui(step.module)} - {ui(step.cadence)}
                          </p>
                        </div>
                      </div>
                      <div className="hidden min-w-0 sm:block">
                        <p className="text-sm font-semibold text-foreground">
                          {index + 1}. {ui(step.title)}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {ui(step.description)}
                        </p>
                        <div className="mt-2 grid gap-1.5 text-xs text-muted-foreground md:grid-cols-2">
                          <p className="rounded-md bg-stone-50 px-2 py-1">
                            <span className="font-semibold text-stone-700">
                              {ui("Pemilik tugas")}:
                            </span>{" "}
                            {ui(ownerNote)}
                          </p>
                          <p className="rounded-md bg-stone-50 px-2 py-1">
                            <span className="font-semibold text-stone-700">
                              {ui("Bukti kerja")}:
                            </span>{" "}
                            {ui(evidence)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px]",
                            CADENCE_TONES[step.cadence],
                          )}
                        >
                          {ui(step.cadence)}
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <div className="space-y-2 sm:hidden">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {ui(step.description)}
                        </p>
                        <div className="grid gap-1.5 text-xs text-muted-foreground">
                          <p className="rounded-md bg-stone-50 px-2 py-1">
                            <span className="font-semibold text-stone-700">
                              {ui("Pemilik tugas")}:
                            </span>{" "}
                            {ui(ownerNote)}
                          </p>
                          <p className="rounded-md bg-stone-50 px-2 py-1">
                            <span className="font-semibold text-stone-700">
                              {ui("Bukti kerja")}:
                            </span>{" "}
                            {ui(evidence)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
              {hiddenStepCount > 0 && (
                <div className="rounded-lg border border-dashed bg-muted/25 p-3 text-xs leading-relaxed text-muted-foreground">
                  {ui("Ringkasan pantas")}: {hiddenStepCount}{" "}
                  {ui("langkah tambahan disimpan sebagai SOP sokongan. Mulakan dengan empat tindakan utama dahulu; buka langkah sokongan ikut keperluan.")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
