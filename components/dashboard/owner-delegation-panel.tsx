"use client";

import Link from "next/link";
import { ArrowRight, Route, ShieldCheck } from "lucide-react";
import {
  OWNER_DELEGATION_LANES,
  OWNER_GOVERNANCE_RULES,
  type OwnerDelegationLane,
} from "@/lib/dashboard/owner-delegation";
import { useLanguage } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/module-ui";
import { translateLegacyUiText } from "@/lib/i18n/legacy-ui-text";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<OwnerDelegationLane["tone"], string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-950",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
  sky: "border-sky-200 bg-sky-50 text-sky-950",
  violet: "border-violet-200 bg-violet-50 text-violet-950",
  rose: "border-rose-200 bg-rose-50 text-rose-950",
  slate: "border-slate-200 bg-slate-50 text-slate-950",
};

type UiText = (text: string) => string;

function DelegationLane({
  lane,
  ui,
}: {
  lane: OwnerDelegationLane;
  ui: UiText;
}) {
  return (
    <Link
      href={lane.href}
      className={cn(
        "group grid gap-3 rounded-xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md lg:grid-cols-[auto_1fr_auto]",
        TONE_CLASS[lane.tone],
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/75 shadow-sm">
        <lane.icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold leading-tight">{ui(lane.area)}</h3>
          <Badge variant="outline" className="bg-white/70 text-[11px]">
            {ui(lane.company)}
          </Badge>
        </div>
        <p className="mt-1 text-xs font-semibold opacity-85">
          {ui("Pemilik kerja")}: {ui(lane.delegatedTo)}
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-current/10 bg-white/60 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">
              {ui("Kerja harian")}
            </p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">
              {ui(lane.dailyFocus)}
            </p>
          </div>
          <div className="rounded-lg border border-current/10 bg-white/60 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">
              {ui("Peranan owner")}
            </p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">
              {ui(lane.ownerRole)}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed opacity-80">
          {ui("Masuk campur bila")}: {ui(lane.escalation)}
        </p>
      </div>
      <div className="flex items-center justify-end">
        <ArrowRight className="h-4 w-4 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
      </div>
    </Link>
  );
}

export function OwnerDelegationPanel() {
  const { locale } = useLanguage();
  const ui = (text: string) => translateLegacyUiText(text, locale);

  return (
    <SectionCard
      title={ui("Delegation Matrix Owner")}
      description={ui(
        "Sistem ini asingkan kerja harian kepada role yang betul supaya owner fokus pantau, approve perkara besar dan buat keputusan strategik.",
      )}
      action={
        <Link
          href="/approvals"
          className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
        >
          <ShieldCheck className="mr-1.5 h-4 w-4" />
          {ui("Semak Kelulusan")}
        </Link>
      }
    >
      <div className="grid gap-3">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm">
              <Route className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold">{ui("Prinsip operasi baru")}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {ui(
                  "Owner tidak perlu buat semua tugasan. Sistem akan tunjuk exception, risiko dan kelulusan penting; kerja harian mesti diselesaikan oleh OM, AM, HR, Finance, Manager Maintenance, Driver dan staf cawangan mengikut skop masing-masing.",
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          {OWNER_DELEGATION_LANES.map((lane) => (
            <DelegationLane key={lane.id} lane={lane} ui={ui} />
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {OWNER_GOVERNANCE_RULES.map((rule) => (
            <Link
              key={rule.title}
              href={rule.href}
              className="group rounded-xl border bg-background p-3 shadow-sm transition hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex items-start gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <rule.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">
                    {ui(rule.title)}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {ui(rule.description)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}
