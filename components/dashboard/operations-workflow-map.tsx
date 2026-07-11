"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Factory,
  FileCheck2,
  Handshake,
  MapPinned,
  Network,
  PackageCheck,
  Route,
  ShieldAlert,
  ShieldCheck,
  Store,
  Truck,
  UserCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/components/i18n/language-provider";
import { SectionCard } from "@/components/shared/module-ui";
import { translateLegacyUiText } from "@/lib/i18n/legacy-ui-text";
import { cn } from "@/lib/utils";

export type OperationsWorkflowFocus =
  | "overview"
  | "factory"
  | "hq"
  | "fleet"
  | "agent";

type PipelineStage = {
  title: string;
  owner: string;
  evidence: string;
  href: string;
  icon: LucideIcon;
};

type WorkflowLane = {
  id: Exclude<OperationsWorkflowFocus, "overview">;
  title: string;
  owner: string;
  purpose: string;
  href: string;
  icon: LucideIcon;
  tone: string;
  steps: string[];
  status: string[];
  evidence: string;
  exception: string;
};

type CommandChainNode = {
  title: string;
  owner: string;
  responsibility: string;
  output: string;
  href: string;
  icon: LucideIcon;
  tone: string;
  checks: string[];
};

type DispatchRule = {
  title: string;
  owner: string;
  scope: string;
  proof: string;
  href: string;
  icon: LucideIcon;
  tone: string;
};

type ReceivingLane = {
  title: string;
  receiver: string;
  preparation: string;
  confirmation: string;
  exception: string;
  href: string;
  icon: LucideIcon;
  tone: string;
};

const pipelineStages: PipelineStage[] = [
  {
    title: "Publish tarikh production",
    owner: "Kilang",
    evidence: "Tarikh, cutoff dan window order",
    href: "/factory",
    icon: CalendarClock,
  },
  {
    title: "Order cawangan dan ejen",
    owner: "HQ Distributor / Ejen",
    evidence: "Order number, item dan kuantiti",
    href: "/warehouse",
    icon: Store,
  },
  {
    title: "Production GMP",
    owner: "Kilang",
    evidence: "Batch, bahan mentah dan reject",
    href: "/factory",
    icon: Factory,
  },
  {
    title: "Route dan load driver",
    owner: "HQ Distributor",
    evidence: "Driver, kenderaan dan hentian",
    href: "/fleet",
    icon: Truck,
  },
  {
    title: "POD dan tutup order",
    owner: "Driver / Penerima",
    evidence: "Nama penerima, masa dan status",
    href: "/fleet",
    icon: ClipboardCheck,
  },
];

const workflowLanes: WorkflowLane[] = [
  {
    id: "factory",
    title: "Kilang",
    owner: "OM Kilang / CEO Factory",
    purpose:
      "Satukan order HQ dan order ejen mengikut tarikh production, kemudian hasilkan 5 produk kilang dengan rekod GMP.",
    href: "/factory",
    icon: Factory,
    tone: "border-emerald-200 bg-emerald-50/70 text-emerald-950",
    steps: [
      "Terbitkan jadual production dan cutoff order.",
      "Sahkan order muktamad daripada HQ serta order ejen yang sudah layak masuk kilang.",
      "Rekod batch GMP untuk Roti Planta, Roti Kelapa, Roti Kacang, Roti Benggali dan Kaya.",
      "Serah stok siap kepada HQ/driver untuk cross-dock dan route.",
    ],
    status: ["Menunggu Kilang", "Disahkan Kilang", "Selesai"],
    evidence: "Batch no, planned qty, actual qty, bahan mentah, deviation dan release time.",
    exception:
      "Bahan mentah kritikal, batch gagal, kuantiti tidak cukup atau production perlu ditunda.",
  },
  {
    id: "hq",
    title: "HQ Distributor",
    owner: "OM Distributor / Pentadbir HQ",
    purpose:
      "Kawal order stok cawangan, cross-dock, pecahan kuantiti dan route driver sebelum stok keluar.",
    href: "/warehouse",
    icon: PackageCheck,
    tone: "border-amber-200 bg-amber-50/75 text-amber-950",
    steps: [
      "Buat order ramalan untuk semua cawangan selepas tarikh production dibuka.",
      "Semak kuantiti per cawangan, stok kritikal dan keperluan ejen.",
      "Muktamadkan order ke kilang selepas laluan driver jelas.",
      "Pantau cross-dock supaya stok tidak tersangkut di HQ tanpa POD.",
    ],
    status: ["Ramalan", "Muktamad", "Route dirancang"],
    evidence: "Order HQ, branch matrix, route plan, driver, vehicle dan handoff record.",
    exception:
      "Cawangan tiada stok, kiosk tutup, driver tidak cukup atau kuantiti cawangan berubah selepas cutoff.",
  },
  {
    id: "fleet",
    title: "Driver / Logistik",
    owner: "OM -> HQ -> Driver + AM penerima",
    purpose:
      "Driver menerima route daripada OM/HQ, bergerak ikut cawangan dan pickup agent, kemudian lengkapkan POD untuk penerima sebenar.",
    href: "/fleet",
    icon: Route,
    tone: "border-sky-200 bg-sky-50/75 text-sky-950",
    steps: [
      "OM sahkan priority route, HQ sahkan load, AM sahkan cawangan boleh terima.",
      "Driver semak jadual kerja, kenderaan, helper dan jumlah stok sebelum bergerak.",
      "Update status untuk cawangan, HQ/hub relay dan pickup agent secara berasingan.",
      "Masukkan penerima, bukti POD dan catatan isu sebelum route ditutup.",
    ],
    status: ["Route sah", "Dalam perjalanan", "POD lengkap"],
    evidence: "Arahan OM/HQ, AM readiness, POD, nama penerima, masa sampai dan kuantiti diterima.",
    exception:
      "Kenderaan rosak, AM belum sah penerima, pickup agent tidak jelas, stok kurang atau delivery tertangguh.",
  },
  {
    id: "agent",
    title: "Order Ejen",
    owner: "Ejen / HQ Distributor",
    purpose:
      "Ejen order stok ikut katalog dan tarikh production. Order biasa masuk kilang selepas bayaran; Ejen Khas boleh terus masuk queue.",
    href: "/sales-agent",
    icon: Store,
    tone: "border-violet-200 bg-violet-50/70 text-violet-950",
    steps: [
      "Ejen semak katalog, harga group rate dan tarikh production yang masih dibuka.",
      "Order stok dibuat sebelum cutoff dengan kuantiti produk kilang yang jelas.",
      "Bayaran FPX/kad disahkan, atau bypass jika akaun Ejen Khas/payment exempt.",
      "Pickup point atau outlet POS dipadankan dengan route driver.",
    ],
    status: ["Menunggu Bayaran", "Dihantar Kilang", "Selesai"],
    evidence: "Order ejen, payment receipt, factory queue, pickup point dan status penerimaan.",
    exception:
      "Bayaran gagal, pickup point tidak lengkap, langganan POS tertangguh atau kuantiti diterima berbeza.",
  },
];

const commandChainNodes: CommandChainNode[] = [
  {
    title: "OM Distributor",
    owner: "Pemilik arahan route",
    responsibility:
      "Kunci priority harian, kapasiti driver, laluan cawangan, order ejen dan escalation yang perlu keputusan operasi.",
    output: "Route plan rasmi",
    href: "/dashboard",
    icon: Network,
    tone: "border-amber-200 bg-amber-50 text-amber-950",
    checks: ["driver cukup", "kenderaan tersedia", "cutoff jelas"],
  },
  {
    title: "HQ Distributor",
    owner: "Pemilik cross-dock",
    responsibility:
      "Pecahkan stok mengikut cawangan, hub, driver dan pickup agent sebelum order dimuktamadkan ke kilang.",
    output: "Load sheet + handoff",
    href: "/warehouse",
    icon: PackageCheck,
    tone: "border-stone-200 bg-stone-50 text-stone-950",
    checks: ["branch matrix", "agent pickup", "handoff stok"],
  },
  {
    title: "AM Kawasan",
    owner: "Pemilik readiness cawangan",
    responsibility:
      "Sahkan cawangan dalam kawasan boleh terima stok: staf syif, waktu buka, receiver dan stok kritikal.",
    output: "Cawangan ready",
    href: "/dashboard",
    icon: UsersRound,
    tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
    checks: ["staf bertugas", "receiver jelas", "isu stok naik"],
  },
  {
    title: "Driver",
    owner: "Pemilik perjalanan",
    responsibility:
      "Ambil load yang disahkan, ikut route, update status setiap hentian dan lengkapkan POD.",
    output: "Delivery + POD",
    href: "/fleet",
    icon: Truck,
    tone: "border-sky-200 bg-sky-50 text-sky-950",
    checks: ["load sama", "masa sampai", "penerima"],
  },
  {
    title: "Cawangan / Kiosk",
    owner: "AM + staf penerima",
    responsibility:
      "Terima stok, kira kuantiti, sahkan production date dan lapor beza kepada AM sebelum stok rasmi berubah.",
    output: "Stok diterima",
    href: "/inventory",
    icon: Building2,
    tone: "border-lime-200 bg-lime-50 text-lime-950",
    checks: ["kiraan masuk", "batch betul", "beza direkod"],
  },
  {
    title: "Pickup Agent",
    owner: "HQ + PIC ejen",
    responsibility:
      "Pastikan pickup point, PIC, telefon, order payment/exempt dan lokasi POS ejen jelas sebelum driver keluar.",
    output: "Agent receive",
    href: "/sales-agent",
    icon: Store,
    tone: "border-violet-200 bg-violet-50 text-violet-950",
    checks: ["payment/exempt", "PIC pickup", "lokasi sah"],
  },
];

const dispatchRules: DispatchRule[] = [
  {
    title: "Arahan OM kepada driver",
    owner: "OM Distributor",
    scope:
      "Tetapkan driver utama, helper, kenderaan, area, priority cawangan dan pickup agent dalam satu route harian.",
    proof: "Route plan, driver assignment dan catatan priority.",
    href: "/fleet",
    icon: ClipboardList,
    tone: "border-amber-200 bg-amber-50 text-amber-950",
  },
  {
    title: "Readiness AM sebelum delivery",
    owner: "AM Kawasan",
    scope:
      "AM sahkan cawangan bawah kawasan ada staf, shift aktif, receiver dan arahan jika kiosk tutup.",
    proof: "Status cawangan ready, exception AM dan nama staf penerima.",
    href: "/dashboard",
    icon: UserCheck,
    tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
  },
  {
    title: "Load control HQ",
    owner: "HQ Distributor",
    scope:
      "HQ sahkan pecahan stok cawangan, hub relay, pickup agent dan kuantiti sebelum driver bergerak.",
    proof: "Load sheet, handoff, branch matrix dan route stop list.",
    href: "/warehouse",
    icon: PackageCheck,
    tone: "border-stone-200 bg-stone-50 text-stone-950",
  },
  {
    title: "POD driver wajib lengkap",
    owner: "Driver",
    scope:
      "Driver update keluar, sampai, serah, gagal serah, receiver dan catatan isu pada setiap stop.",
    proof: "POD, masa sampai, nama penerima, kuantiti diterima dan nota isu.",
    href: "/fleet",
    icon: ClipboardCheck,
    tone: "border-sky-200 bg-sky-50 text-sky-950",
  },
];

const receivingLanes: ReceivingLane[] = [
  {
    title: "Cawangan syarikat",
    receiver: "Staf cawangan / AM",
    preparation:
      "AM pastikan jadual syif, waktu operasi dan penerima aktif sebelum driver sampai.",
    confirmation:
      "Staf kira stok, sahkan production date dan terima dalam inventory/POS.",
    exception:
      "Jika stok kurang atau cawangan tutup, AM sahkan tindakan sebelum OM tutup route.",
    href: "/inventory",
    icon: Building2,
    tone: "border-emerald-200 bg-emerald-50",
  },
  {
    title: "HQ / Hub relay",
    receiver: "HQ atau driver sambungan",
    preparation:
      "HQ susun stok relay mengikut driver, route pattern, helper dan lokasi handoff.",
    confirmation:
      "Driver sambungan sahkan handoff sebelum hantar ke cawangan seterusnya.",
    exception:
      "Jika relay tidak lengkap, route tidak boleh ditutup sebagai selesai.",
    href: "/warehouse",
    icon: Handshake,
    tone: "border-amber-200 bg-amber-50",
  },
  {
    title: "Tempat pickup agent",
    receiver: "PIC ejen / outlet POS ejen",
    preparation:
      "HQ pastikan payment/exempt, alamat pickup, nombor PIC dan driver bertugas jelas.",
    confirmation:
      "PIC ejen sahkan terima stok atau lapor beza untuk semakan HQ.",
    exception:
      "Jika PIC tiada atau lokasi tidak sah, order agent masuk status semakan HQ.",
    href: "/sales-agent",
    icon: Store,
    tone: "border-violet-200 bg-violet-50",
  },
];

const focusCopy: Record<OperationsWorkflowFocus, { title: string; description: string; href: string }> = {
  overview: {
    title: "Lihat semua aliran operasi",
    description:
      "Paparan ini menyatukan production, order cawangan, order ejen, driver dan POD supaya setiap modul bergerak ikut SOP yang sama.",
    href: "/dashboard",
  },
  factory: {
    title: "Fokus skrin ini: Kilang",
    description:
      "Pastikan order yang masuk dipisahkan antara order HQ dan order ejen, tetapi production dikira secara gabungan mengikut tarikh dan produk.",
    href: "/factory",
  },
  hq: {
    title: "Fokus skrin ini: HQ Distributor",
    description:
      "HQ mengunci kuantiti cawangan, muktamadkan order ke kilang dan susun driver sebelum stok keluar.",
    href: "/warehouse",
  },
  fleet: {
    title: "Fokus skrin ini: Driver dan Logistik",
    description:
      "Driver hanya perlu ikut arahan route, sahkan load, hantar stok dan lengkapkan POD setiap hentian.",
    href: "/fleet",
  },
  agent: {
    title: "Fokus skrin ini: Order Ejen",
    description:
      "Order ejen perlu jelas dari katalog hingga payment, kemudian masuk factory queue dan dihantar melalui route yang dipersetujui.",
    href: "/sales-agent",
  },
};

function focusTone(active: boolean) {
  return active
    ? "border-amber-400 bg-amber-50 shadow-sm ring-1 ring-amber-300/70"
    : "border-border bg-white";
}

export function OperationsWorkflowMap({
  focus = "overview",
  compact = false,
  className,
}: {
  focus?: OperationsWorkflowFocus;
  compact?: boolean;
  className?: string;
}) {
  const { locale } = useLanguage();
  const ui = (text: string) => translateLegacyUiText(text, locale);
  const copy = focusCopy[focus];

  return (
    <SectionCard
      title={ui("Aliran Operasi Bersepadu")}
      description={ui("Kilang, HQ Distributor, driver dan order ejen disusun sebagai satu rantaian kerja yang boleh diaudit.")}
      className={className}
      action={
        <Link href={copy.href} className={cn(buttonVariants({ size: "sm", variant: "outline" }), "shrink-0")}>
          {ui("Buka Fokus")}
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-gradient-to-r from-stone-950 via-stone-900 to-amber-950 p-4 text-white shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <div>
              <Badge className="border-amber-300/40 bg-amber-300/15 text-amber-50 hover:bg-amber-300/20">
                <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                {ui(copy.title)}
              </Badge>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/75">
                {ui(copy.description)}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-5">
              {pipelineStages.map((stage, index) => {
                const Icon = stage.icon;
                return (
                  <Link
                    href={stage.href}
                    key={stage.title}
                    className="group rounded-lg border border-white/10 bg-white/10 p-3 transition hover:border-amber-300/60 hover:bg-white/15"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-300 text-xs font-bold text-stone-950">
                        {index + 1}
                      </span>
                      <Icon className="h-4 w-4 text-amber-200" />
                    </div>
                    <p className="mt-2 text-xs font-semibold leading-snug text-amber-50">
                      {ui(stage.title)}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/60">
                      {ui(stage.owner)}
                    </p>
                    {!compact && (
                      <p className="mt-2 hidden text-[11px] leading-relaxed text-white/55 xl:block">
                        {ui(stage.evidence)}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-4">
          {workflowLanes.map((lane) => {
            const Icon = lane.icon;
            const active = focus === lane.id;
            return (
              <Link
                key={lane.id}
                href={lane.href}
                className={cn(
                  "group flex h-full flex-col rounded-lg border p-4 transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md",
                  focusTone(active),
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border", lane.tone)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-950">{ui(lane.title)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{ui(lane.owner)}</p>
                    </div>
                  </div>
                  {active && (
                    <Badge className="bg-amber-400 text-stone-950 hover:bg-amber-400">
                      {ui("Fokus")}
                    </Badge>
                  )}
                </div>

                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {ui(lane.purpose)}
                </p>

                <div className="mt-4 space-y-2">
                  {lane.steps.map((step, index) => (
                    <div key={step} className="grid grid-cols-[auto_1fr] gap-2 text-xs leading-relaxed">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-100 text-[10px] font-bold text-stone-700">
                        {index + 1}
                      </span>
                      <span className="text-stone-700">{ui(step)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {lane.status.map((status) => (
                    <Badge key={status} variant="outline" className="bg-white text-[11px]">
                      {ui(status)}
                    </Badge>
                  ))}
                </div>

                <div className="mt-auto pt-4">
                  <div className="rounded-lg border border-dashed bg-stone-50 p-3 text-xs leading-relaxed text-stone-700">
                    <p className="flex items-start gap-2">
                      <FileCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
                      <span>
                        <span className="font-semibold">{ui("Bukti")}:</span> {ui(lane.evidence)}
                      </span>
                    </p>
                    <p className="mt-2 flex items-start gap-2">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                      <span>
                        <span className="font-semibold">{ui("Exception")}:</span> {ui(lane.exception)}
                      </span>
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1 text-xs font-semibold text-primary">
                    {ui("Buka modul")}
                    <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-stone-950">
                <Network className="h-4 w-4 text-amber-700" />
                {ui("Command Chain Driver")}
              </p>
              <p className="mt-1 max-w-4xl text-xs leading-relaxed text-muted-foreground">
                {ui("Driver tidak bergerak sendiri. Arahan bermula daripada OM, disahkan oleh HQ, disokong oleh AM, kemudian diterima oleh cawangan atau pickup agent dengan bukti POD.")}
              </p>
            </div>
            <Badge variant="outline" className="border-amber-200 bg-amber-50">
              {ui("OM -> HQ -> AM -> Driver -> Penerima")}
            </Badge>
          </div>

          <div className="grid gap-3 xl:grid-cols-6">
            {commandChainNodes.map((node, index) => {
              const Icon = node.icon;
              return (
                <Link
                  key={node.title}
                  href={node.href}
                  className="group relative rounded-lg border bg-background p-3 transition hover:border-amber-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", node.tone)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-950 text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-stone-950">
                    {ui(node.title)}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                    {ui(node.owner)}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-stone-700">
                    {ui(node.responsibility)}
                  </p>
                  <div className="mt-3 rounded-md border border-dashed bg-stone-50 px-2 py-1.5 text-[11px] font-medium text-stone-700">
                    {ui("Output")}: {ui(node.output)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {node.checks.map((check) => (
                      <Badge key={check} variant="outline" className="bg-white text-[10px]">
                        {ui(check)}
                      </Badge>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-stone-950">
                  <Route className="h-4 w-4 text-sky-700" />
                  {ui("Dispatch Matrix")}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {ui("Matrix ini membezakan siapa beri arahan, siapa sahkan readiness, siapa kawal load dan siapa wajib lengkapkan POD.")}
                </p>
              </div>
              <Badge variant="outline" className="bg-white">
                {ui("No owner, no dispatch")}
              </Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {dispatchRules.map((rule) => {
                const Icon = rule.icon;
                return (
                  <Link
                    key={rule.title}
                    href={rule.href}
                    className={cn("rounded-lg border p-3 transition hover:border-amber-300 hover:shadow-sm", rule.tone)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-white/70">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{ui(rule.title)}</p>
                        <p className="mt-0.5 text-[11px] font-medium opacity-75">
                          {ui(rule.owner)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed opacity-85">
                      {ui(rule.scope)}
                    </p>
                    <p className="mt-2 rounded-md bg-white/70 px-2 py-1.5 text-[11px] leading-relaxed">
                      <span className="font-semibold">{ui("Bukti")}:</span> {ui(rule.proof)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-stone-950">
                  <MapPinned className="h-4 w-4 text-violet-700" />
                  {ui("Receiving Lane")}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {ui("Setiap penerima ada persediaan, cara sahkan dan exception owner yang berbeza.")}
                </p>
              </div>
              <Badge variant="outline" className="bg-white">
                {ui("Cawangan / HQ / Agent")}
              </Badge>
            </div>
            <div className="space-y-2">
              {receivingLanes.map((lane) => {
                const Icon = lane.icon;
                return (
                  <Link
                    key={lane.title}
                    href={lane.href}
                    className={cn("block rounded-lg border p-3 transition hover:border-amber-300 hover:shadow-sm", lane.tone)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-white/75">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-stone-950">{ui(lane.title)}</p>
                          <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                            {ui(lane.receiver)}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="mt-3 grid gap-2 text-[11px] leading-relaxed text-stone-700 sm:grid-cols-3">
                      <p className="rounded-md bg-white/75 px-2 py-1.5">
                        <span className="font-semibold">{ui("Sedia")}:</span> {ui(lane.preparation)}
                      </p>
                      <p className="rounded-md bg-white/75 px-2 py-1.5">
                        <span className="font-semibold">{ui("Sah")}:</span> {ui(lane.confirmation)}
                      </p>
                      <p className="rounded-md bg-white/75 px-2 py-1.5">
                        <span className="font-semibold">{ui("Exception")}:</span> {ui(lane.exception)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_0.85fr]">
          <div className="rounded-lg border bg-white p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-stone-950">
              <PackageCheck className="h-4 w-4 text-amber-700" />
              {ui("Queue Cawangan / HQ")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {ui("Order HQ Distributor ialah stok untuk kiosk/cawangan. Ia bermula sebagai ramalan, kemudian dimuktamadkan sebelum kilang produce dan driver hantar.")}
            </p>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-stone-950">
              <Store className="h-4 w-4 text-violet-700" />
              {ui("Queue Ejen")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {ui("Order ejen ialah order pelanggan/ejen luar. Order biasa masuk kilang selepas payment sah; Ejen Khas masuk terus mengikut status akaun.")}
            </p>
          </div>
          <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-sky-950">
              <MapPinned className="h-4 w-4" />
              {ui("Prinsip audit")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-sky-950/80">
              {ui("Setiap stok siap mesti ada production date, owner, route dan POD. Tanpa POD, stok belum dianggap diterima rasmi.")}
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
