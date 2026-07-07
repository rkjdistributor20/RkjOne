"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  CheckSquare,
  Clock,
  FileCheck2,
  ShieldAlert,
  TimerReset,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  approveRequest,
  fetchApprovals,
  rejectRequest,
} from "@/lib/approvals/api";
import type { ApprovalRequest } from "@/lib/approvals/types";
import {
  EXCEPTION_STATUS_FLOW,
  deriveApprovalGovernance,
  summarizeApprovalGovernance,
  type GovernanceTone,
} from "@/lib/workflow/exception-governance";
import {
  APPROVAL_ENTITY_LABELS,
  APPROVAL_STATUS_LABELS,
  labelFor,
} from "@/lib/ui/labels";
import { useLanguage } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  KpiCard,
  KpiGrid,
  ModuleHeader,
  ModuleLayout,
  ModuleLoading,
  RecordRow,
  SectionCard,
  moduleTabsListClass,
  moduleTabsTriggerClass,
} from "@/components/shared/module-ui";
import { translateLegacyUiText } from "@/lib/i18n/legacy-ui-text";
import { cn } from "@/lib/utils";

const GOVERNANCE_TONE_CLASS: Record<GovernanceTone, string> = {
  default: "border-stone-200 bg-stone-50 text-stone-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
  danger: "border-red-200 bg-red-50 text-red-950",
  info: "border-sky-200 bg-sky-50 text-sky-950",
};

const SECTION_ACCENT: Record<GovernanceTone, string> = {
  default: "border-l-stone-300",
  success: "border-l-emerald-400",
  warning: "border-l-amber-400",
  danger: "border-l-red-400",
  info: "border-l-sky-400",
};

function formatRequestDate(value: string) {
  return new Date(value).toLocaleString("ms-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ApprovalsDashboard() {
  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  const [resolved, setResolved] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const { locale } = useLanguage();
  const ui = useCallback(
    (text: string) => translateLegacyUiText(text, locale),
    [locale],
  );
  const summary = summarizeApprovalGovernance(pending);

  const loadData = useCallback(async () => {
    try {
      const [p, approved, rejected] = await Promise.all([
        fetchApprovals("PENDING"),
        fetchApprovals("APPROVED"),
        fetchApprovals("REJECTED"),
      ]);
      setPending(p.approvals);
      const history = [...approved.approvals, ...rejected.approvals]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 30);
      setResolved(history);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : ui("Gagal memuatkan kelulusan"),
      );
    } finally {
      setLoading(false);
    }
  }, [ui]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  async function handleApprove(id: string) {
    try {
      await approveRequest(id);
      toast.success(ui("Diluluskan"));
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ui("Gagal meluluskan"));
    }
  }

  async function handleReject(id: string) {
    try {
      await rejectRequest(id, rejectReason || undefined);
      toast.success(ui("Ditolak"));
      setRejectId(null);
      setRejectReason("");
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ui("Gagal menolak"));
    }
  }

  return (
    <ModuleLayout>
      <ModuleHeader
        title={ui("Kelulusan & Exception Center")}
        description={ui(
          "Semak permintaan mengikut SLA, bukti wajib dan pemilik tugas supaya operasi tidak tersekat.",
        )}
        icon={CheckSquare}
        badges={
          pending.length > 0 ? (
            <Badge variant="destructive">
              {pending.length} {ui("menunggu tindakan")}
            </Badge>
          ) : (
            <Badge variant="outline">{ui("Semua selesai")}</Badge>
          )
        }
      />

      {loading ? (
        <ModuleLoading rows={1} />
      ) : (
        <Tabs defaultValue="pending" className="space-y-4">
          <KpiGrid cols={4}>
            <KpiCard
              title={ui("Menunggu")}
              value={summary.total}
              description={ui("Permintaan belum diputuskan")}
              icon={Clock}
              variant={summary.total > 0 ? "warning" : "success"}
            />
            <KpiCard
              title={ui("Lebih SLA")}
              value={summary.overdue}
              description={ui("Perlu tindakan segera")}
              icon={ShieldAlert}
              variant={summary.overdue > 0 ? "danger" : "success"}
            />
            <KpiCard
              title={ui("Hampir SLA")}
              value={summary.dueSoon}
              description={ui("Jangan biar jadi lewat")}
              icon={TimerReset}
              variant={summary.dueSoon > 0 ? "warning" : "success"}
            />
            <KpiCard
              title={ui("Risiko Stok/Tunai")}
              value={summary.stock + summary.cashRisk}
              description={ui("Semak bukti sebelum lulus")}
              icon={AlertTriangle}
              variant={
                summary.stock + summary.cashRisk > 0 ? "danger" : "success"
              }
            />
          </KpiGrid>

          <TabsList className={moduleTabsListClass}>
            <TabsTrigger value="pending" className={moduleTabsTriggerClass}>
              <Clock className="h-4 w-4" />
              {ui("Menunggu")} ({pending.length})
            </TabsTrigger>
            <TabsTrigger value="history" className={moduleTabsTriggerClass}>
              <CheckCircle className="h-4 w-4" /> {ui("Sejarah")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-2 space-y-3">
            {pending.length === 0 ? (
              <EmptyState
                icon={CheckCircle}
                title={ui("Tiada kelulusan menunggu")}
                description={ui(
                  "Semua permintaan telah diproses. Rekod baharu akan muncul di sini.",
                )}
              />
            ) : (
              pending.map((req) => {
                const governance = deriveApprovalGovernance(req);
                return (
                  <SectionCard
                    key={req.id}
                    className={cn(
                      "border-l-4",
                      SECTION_ACCENT[governance.tone],
                    )}
                  >
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{ui(req.title)}</p>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[11px]",
                                GOVERNANCE_TONE_CLASS[governance.tone],
                              )}
                            >
                              {ui(governance.category)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {ui(
                              labelFor(
                                APPROVAL_ENTITY_LABELS,
                                req.entity_type,
                                req.entity_type,
                              ),
                            )}
                            {req.branch && ` - ${req.branch.branch_name}`}
                            {req.requester && ` - ${req.requester.full_name}`}
                          </p>
                          {req.description && (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {ui(req.description)}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatRequestDate(req.created_at)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            {ui(labelFor(APPROVAL_STATUS_LABELS, req.status))}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "bg-white text-[11px]",
                              governance.overdue &&
                                "border-red-300 text-red-700",
                              governance.dueSoon &&
                                !governance.overdue &&
                                "border-amber-300 text-amber-700",
                            )}
                          >
                            {ui("Umur")}: {ui(governance.ageLabel)}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border bg-stone-50 p-3">
                          <p className="text-xs font-semibold text-muted-foreground">
                            {ui("Pemilik tindakan")}
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {ui(governance.owner)}
                          </p>
                        </div>
                        <div className="rounded-lg border bg-stone-50 p-3">
                          <p className="text-xs font-semibold text-muted-foreground">
                            {ui("SLA")}
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {ui(governance.slaLabel)}
                          </p>
                        </div>
                        <div className="rounded-lg border bg-stone-50 p-3">
                          <p className="text-xs font-semibold text-muted-foreground">
                            {ui("Eskalasi")}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed">
                            {ui(governance.escalation)}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-lg border border-dashed bg-white p-3">
                        <p className="flex items-center gap-2 text-xs font-semibold">
                          <FileCheck2 className="h-4 w-4 text-emerald-700" />
                          {ui("Bukti wajib sebelum keputusan")}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {ui(governance.evidence)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {EXCEPTION_STATUS_FLOW.map((status, index) => (
                          <span
                            key={`${req.id}-${status}`}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px]",
                              index <= 2
                                ? "border-amber-200 bg-amber-50 text-amber-900"
                                : "border-stone-200 bg-stone-50 text-muted-foreground",
                            )}
                          >
                            {index + 1}. {ui(status)}
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleApprove(req.id)}
                        >
                          <CheckCircle className="mr-1 h-4 w-4" /> {ui("Lulus")}
                        </Button>
                        {rejectId === req.id ? (
                          <>
                            <Input
                              className="h-8 w-56"
                              placeholder={ui("Sebab (pilihan)")}
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                            />
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleReject(req.id)}
                            >
                              {ui("Sahkan Tolak")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setRejectId(null)}
                            >
                              {ui("Batal")}
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRejectId(req.id)}
                          >
                            <XCircle className="mr-1 h-4 w-4" /> {ui("Tolak")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </SectionCard>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-2 space-y-2">
            {resolved.length === 0 ? (
              <EmptyState
                icon={Clock}
                title={ui("Tiada sejarah")}
                description={ui(
                  "Kelulusan yang telah diproses akan dipaparkan di sini.",
                )}
              />
            ) : (
              resolved.map((req) => {
                const governance = deriveApprovalGovernance(req);
                return (
                  <RecordRow key={req.id}>
                    <div className="min-w-0">
                      <p className="font-medium">{ui(req.title)}</p>
                      <p className="text-xs text-muted-foreground">
                        {ui(
                          labelFor(
                            APPROVAL_ENTITY_LABELS,
                            req.entity_type,
                            req.entity_type,
                          ),
                        )}{" "}
                        - {ui(governance.category)}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Badge variant="outline">
                        {ui(labelFor(APPROVAL_STATUS_LABELS, req.status))}
                      </Badge>
                      <Badge variant="secondary" className="text-[11px]">
                        {formatRequestDate(req.created_at)}
                      </Badge>
                    </div>
                  </RecordRow>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      )}
    </ModuleLayout>
  );
}
