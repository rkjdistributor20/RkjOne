import Link from 'next/link';
import {
 ArrowRight,
 BrainCircuit,
 Building2,
 Database,
 Factory,
 LockKeyhole,
 Network,
 ShieldCheck,
 Store,
 Truck,
 Users,
 type LucideIcon,
} from 'lucide-react';
import {
 RKJ_BANK_GRADE_GUARDRAILS,
 RKJ_OPERATING_HANDOFFS,
 RKJ_OPERATING_LANES,
 type OperatingLane,
 type OperatingLaneCode,
} from '@/lib/dashboard/rkj-operating-blueprint';
import { Badge } from '@/components/ui/badge';
import { buttonVariants, Button } from '@/components/ui/button';
import { SectionCard } from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';

const LANE_ICONS: Record<OperatingLaneCode, LucideIcon> = {
 RKJ_MFG: Factory,
 RKJ_DIST: Truck,
 RKJ: Building2,
 AGENT: Store,
};

const TONES: Record<OperatingLane['tone'], { card: string; icon: string; badge: string }> = {
 orange: {
 card: 'border-orange-200 bg-orange-50/55',
 icon: 'bg-orange-600 text-white',
 badge: 'border-orange-200 bg-orange-100 text-orange-950',
 },
 blue: {
 card: 'border-blue-200 bg-blue-50/60',
 icon: 'bg-blue-600 text-white',
 badge: 'border-blue-200 bg-blue-100 text-blue-950',
 },
 gold: {
 card: 'border-amber-300 bg-amber-50/70',
 icon: 'bg-[#141414] text-[#F0C030]',
 badge: 'border-amber-300 bg-amber-100 text-amber-950',
 },
 emerald: {
 card: 'border-emerald-200 bg-emerald-50/65',
 icon: 'bg-emerald-700 text-white',
 badge: 'border-emerald-200 bg-emerald-100 text-emerald-950',
 },
};

function LaneCard({ lane }: { lane: OperatingLane }) {
 const Icon = LANE_ICONS[lane.code];
 const tone = TONES[lane.tone];

 return (
 <article className={cn('rounded-xl border p-4 shadow-sm', tone.card)}>
 <div className="flex items-start gap-3">
 <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm', tone.icon)}>
 <Icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <div className="flex flex-wrap items-center gap-2">
 <Badge variant="outline" className={cn('text-[10px] font-semibold', tone.badge)}>
 {lane.code}
 </Badge>
 <p className="text-sm font-bold text-foreground">{lane.label}</p>
 </div>
 <p className="mt-1 text-xs font-medium text-muted-foreground">{lane.legalOwner}</p>
 </div>
 </div>

 <p className="mt-3 text-sm leading-relaxed text-foreground/85">{lane.mission}</p>

 <div className="mt-3 grid gap-2">
 <div className="rounded-lg border bg-background/80 p-2.5">
 <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
 <Users className="h-3.5 w-3.5" />
 Pengguna Fokus
 </p>
 <p className="text-xs leading-relaxed text-foreground">{lane.primaryUsers.join(', ')}</p>
 </div>
 <div className="rounded-lg border bg-background/80 p-2.5">
 <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
 <Database className="h-3.5 w-3.5" />
 Data Rasmi
 </p>
 <p className="text-xs leading-relaxed text-foreground">{lane.sourceOfTruth.join(', ')}</p>
 </div>
 </div>

 <div className="mt-3 flex flex-wrap gap-1.5">
 {lane.focusModules.map((module) => (
 <Link
 key={`${lane.code}-${module.label}`}
 href={module.href}
 className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'h-7 rounded-full px-2.5 text-xs')}
 >
 {module.label}
 </Link>))}
 </div>

 <div className="mt-3 rounded-lg border border-dashed bg-background/65 p-2.5">
 <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
 <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
 {lane.riskControl}
 </p>
 </div>
 </article>);
}

export function RkjOperatingMap() {
 return (
 <SectionCard
 title="AI Operating Map RKJ One"
 description="Peta kerja rasmi untuk pastikan Manufacturing, Distributor, Retail dan Agent tidak bercampur tetapi tetap bersambung."
 action={
 <Button size="sm" variant="outline" className="gap-1.5">
 <BrainCircuit className="h-4 w-4" />
 Bank-grade Control
 </Button>
 }
 >
 <div className="grid gap-3 xl:grid-cols-4">
 {RKJ_OPERATING_LANES.map((lane) => (
 <LaneCard key={lane.code} lane={lane} />))}
 </div>

 <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
 <div className="rounded-xl border bg-muted/20 p-4">
 <div className="mb-3 flex items-center gap-2">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <Network className="h-4 w-4" />
 </div>
 <div>
 <p className="text-sm font-semibold">Handoff Operasi</p>
 <p className="text-xs text-muted-foreground">Setiap pindahan mesti ada bukti dan owner tindakan.</p>
 </div>
 </div>
 <div className="grid gap-2">
 {RKJ_OPERATING_HANDOFFS.map((handoff) => (
 <div key={`${handoff.from}-${handoff.to}-${handoff.title}`} className="rounded-lg border bg-background p-3">
 <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
 <Badge variant="outline">{handoff.from}</Badge>
 <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
 <Badge variant="outline">{handoff.to}</Badge>
 <span className="text-foreground">{handoff.title}</span>
 </div>
 <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
 Bukti: {handoff.proof}
 </p>
 <p className="mt-1 text-xs leading-relaxed text-foreground/80">
 Tindakan: {handoff.ownerAction}
 </p>
 </div>))}
 </div>
 </div>

 <div className="rounded-xl border bg-background p-4">
 <div className="mb-3 flex items-center gap-2">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
 <ShieldCheck className="h-4 w-4" />
 </div>
 <div>
 <p className="text-sm font-semibold">Control Guardrail</p>
 <p className="text-xs text-muted-foreground">Rule owner supaya sistem kekal kemas dan boleh audit.</p>
 </div>
 </div>
 <div className="space-y-2">
 {RKJ_BANK_GRADE_GUARDRAILS.map((rule, index) => (
 <div key={rule} className="flex gap-2 rounded-lg border bg-muted/15 p-2.5 text-xs leading-relaxed">
 <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
 {index + 1}
 </span>
 <span>{rule}</span>
 </div>))}
 </div>
 </div>
 </div>
 </SectionCard>);
}
