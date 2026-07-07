"use client";

import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  Building2,
  CheckCircle2,
  Clock3,
  Handshake,
  LockKeyhole,
  Network,
  Radar,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { UserRole } from "@/types/enums";
import type { DashboardStats } from "@/types/database";
import type { RoleWorkflow } from "@/lib/dashboard/role-workflows";
import {
  buildRoleCockpit,
  type RoleCockpitHandoff,
  type RoleCockpitSignal,
} from "@/lib/dashboard/role-cockpit";
import { useLanguage } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/module-ui";
import { translateLegacyUiText } from "@/lib/i18n/legacy-ui-text";
import { cn } from "@/lib/utils";

const SIGNAL_TONES: Record<RoleCockpitSignal["tone"], string> = {
  default: "border-border bg-muted/25 text-foreground",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
  danger: "border-red-200 bg-red-50 text-red-950",
};

const HANDOFF_TONES: Record<RoleCockpitHandoff["tone"], string> = {
  default: "border-stone-200 bg-stone-50 text-stone-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
  danger: "border-red-200 bg-red-50 text-red-950",
  info: "border-sky-200 bg-sky-50 text-sky-950",
};

export function RoleProactiveCockpit({
  role,
  workflow,
  legalEntityCode,
  stats,
  branchCount,
  specialAssignmentCount,
}: {
  role: UserRole;
  workflow: RoleWorkflow;
  legalEntityCode?: string | null;
  stats?: DashboardStats | null;
  branchCount?: number | null;
  specialAssignmentCount?: number;
}) {
  const cockpit = buildRoleCockpit({
    role,
    workflow,
    legalEntityCode,
    stats,
    branchCount,
    specialAssignmentCount,
  });
  const { locale } = useLanguage();
  const ui = (text: string) => translateLegacyUiText(text, locale);
  const primaryHref = cockpit.actions[0]?.href ?? "/dashboard";

  return (
    <SectionCard
      title={ui("AI Proactive Cockpit")}
      description={ui(
        "Dashboard ini disusun ikut role, syarikat, cawangan dan tugasan sebenar pengguna.",
      )}
      action={
        <Link
          href={primaryHref}
          className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
        >
          {ui("Buka Fokus Utama")}
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-amber-200/70 bg-white shadow-sm">
          <div className="grid gap-4 bg-[linear-gradient(135deg,#101312_0%,#18201d_45%,#2d2210_100%)] p-4 text-white lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-amber-300/40 bg-amber-300/15 text-amber-50 hover:bg-amber-300/20">
                  <BrainCircuit className="mr-1 h-3.5 w-3.5" />
                  {ui(cockpit.focusMode)}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-white/20 bg-white/5 text-white/90"
                >
                  <Building2 className="mr-1 h-3.5 w-3.5" />
                  {ui(cockpit.companyScope)}
                </Badge>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-amber-50">
                  {ui(cockpit.title)}
                </h3>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/70">
                  {ui(cockpit.subtitle)}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/10 p-3">
                <p className="flex items-start gap-2 text-sm leading-relaxed text-amber-50">
                  <Radar className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <span>{ui(cockpit.prediction)}</span>
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/10 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-50">
                <Network className="h-4 w-4 text-emerald-300" />
                {ui("Laluan kerja utama")}
              </p>
              <div className="grid gap-2">
                {cockpit.commandPath.map((step, index) => (
                  <div
                    key={`${step}-${index}`}
                    className="grid grid-cols-[auto_1fr] gap-2"
                  >
                    <div className="flex flex-col items-center">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/20 text-xs font-semibold text-amber-50">
                        {index + 1}
                      </span>
                      {index < cockpit.commandPath.length - 1 && (
                        <span className="h-5 w-px bg-white/20" />
                      )}
                    </div>
                    <p className="pt-1 text-sm text-white/80">{ui(step)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-t border-amber-100/70 bg-gradient-to-r from-amber-50/70 via-white to-emerald-50/60 p-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-lg border border-dashed border-amber-300/70 bg-white/80 p-3">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-stone-700">
                <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                <span>{ui(cockpit.boundary)}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {cockpit.signals.slice(0, 2).map((signal) => (
                <Link
                  key={`${signal.label}-${signal.href}`}
                  href={signal.href}
                  className={cn(
                    "rounded-lg border p-3 transition hover:border-amber-300 hover:shadow-sm",
                    SIGNAL_TONES[signal.tone],
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">
                      {ui(signal.label)}
                    </span>
                    <span className="text-base font-bold tabular-nums">
                      {signal.value}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed opacity-80">
                    {ui(signal.description)}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                {ui("Signal Hari Ini")}
              </p>
              <div className="grid gap-2">
                {cockpit.signals.map((signal) => (
                  <Link
                    key={`${signal.label}-${signal.href}`}
                    href={signal.href}
                    className={cn(
                      "rounded-lg border p-3 transition hover:border-amber-300 hover:shadow-sm",
                      SIGNAL_TONES[signal.tone],
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">
                        {ui(signal.label)}
                      </span>
                      <span className="text-sm font-bold tabular-nums">
                        {signal.value}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed opacity-80">
                      {ui(signal.description)}
                    </p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Clock3 className="h-4 w-4 text-sky-700" />
                {ui("Ritma Kerja Harian")}
              </p>
              <div className="space-y-2">
                {cockpit.rhythm.map((item) => (
                  <Link
                    key={`${item.time}-${item.title}`}
                    href={item.href}
                    className="grid gap-3 rounded-lg border bg-stone-50/70 p-3 transition hover:border-sky-300 hover:bg-sky-50/50 sm:grid-cols-[5.5rem_1fr]"
                  >
                    <Badge
                      variant="outline"
                      className="h-fit justify-center border-sky-200 bg-white text-sky-800"
                    >
                      {ui(item.time)}
                    </Badge>
                    <div>
                      <p className="text-sm font-semibold">{ui(item.title)}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {ui(item.description)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Handshake className="h-4 w-4 text-amber-700" />
                {ui("Hubungan Kerja")}
              </p>
              <div className="grid gap-2">
                {cockpit.handoffs.map((handoff) => (
                  <Link
                    key={`${handoff.title}-${handoff.href}`}
                    href={handoff.href}
                    className={cn(
                      "group rounded-lg border p-3 transition hover:border-amber-300 hover:shadow-sm",
                      HANDOFF_TONES[handoff.tone],
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                      <span>{ui(handoff.from)}</span>
                      <ArrowRight className="h-3.5 w-3.5 opacity-60 transition group-hover:translate-x-0.5" />
                      <span>{ui(handoff.to)}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold">
                      {ui(handoff.title)}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed opacity-80">
                      {ui(handoff.description)}
                    </p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Target className="h-4 w-4 text-primary" />
                {ui("Tindakan Seterusnya")}
              </p>
              <div className="grid gap-2">
                {cockpit.actions.map((action, index) => (
                  <Link
                    key={`${action.title}-${action.href}`}
                    href={action.href}
                    className="group grid gap-2 rounded-lg border bg-white p-3 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/35 sm:grid-cols-[auto_1fr_auto] sm:items-center"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {ui(action.title)}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {ui(action.description)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant={index === 0 ? "default" : "outline"}
                        className="text-[11px]"
                      >
                        {ui(action.badge)}
                      </Badge>
                      {index === 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
