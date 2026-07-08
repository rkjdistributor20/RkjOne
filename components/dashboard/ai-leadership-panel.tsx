import {
 AlertTriangle,
 Bot,
 CalendarCheck,
 CheckCircle2,
 Crown,
 ListChecks,
 ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SectionCard } from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';
import {
 AI_PROJECT_MANAGER_OFFICE,
 type AiLeader,
 type AiUpgradeRitual,
} from '@/lib/dashboard/ai-leadership';

const leaderTones: Record<AiLeader['tone'], string> = {
 gold: 'border-amber-200 bg-amber-50 text-amber-950',
 emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
 sky: 'border-sky-200 bg-sky-50 text-sky-950',
 violet: 'border-violet-200 bg-violet-50 text-violet-950',
 rose: 'border-rose-200 bg-rose-50 text-rose-950',
 slate: 'border-slate-200 bg-slate-50 text-slate-950',
};

function LeaderCard({ leader, compact = false }: { leader: AiLeader; compact?: boolean }) {
 return (
  <article className={cn('rounded-lg border p-4', leaderTones[leader.tone])}>
   <div className="flex items-start gap-3">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-current/10 bg-white/65">
     <leader.icon className="h-5 w-5" />
    </div>
    <div className="min-w-0 flex-1">
     <p className="text-sm font-bold text-foreground">{leader.title}</p>
     <p className="mt-0.5 text-xs font-medium opacity-75">{leader.scope}</p>
    </div>
   </div>
   <p className="mt-3 text-xs leading-relaxed opacity-85">{leader.mission}</p>
   {!compact && (
    <div className="mt-3 flex flex-wrap gap-1.5">
     {leader.owns.map((item) => (
      <Badge key={item} variant="outline" className="border-current/20 bg-white/60 text-[11px]">
       {item}
      </Badge>
     ))}
    </div>
   )}
   <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide opacity-70">{leader.cadence}</p>
  </article>
 );
}

function RitualStatusIcon({ status }: { status: AiUpgradeRitual['status'] }) {
 if (status === 'active') {
  return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />;
 }
 if (status === 'watch') {
  return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />;
 }
 return <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />;
}

export function AiLeadershipPanel() {
 const office = AI_PROJECT_MANAGER_OFFICE;

 return (
  <SectionCard
   title={
    <span className="inline-flex items-center gap-2">
     <Crown className="h-4 w-4 text-primary" />
     AI Project Manager Office
    </span>
   }
   description={`Barisan kepimpinan AI untuk check, susun dan upgrade RKJ One. Dikemas kini ${office.updatedAt}.`}
  >
   <div className="space-y-5">
    <div className="grid gap-3 lg:grid-cols-[1fr_0.85fr]">
     <div className="rounded-lg border border-amber-200/70 bg-amber-50/45 p-4">
      <div className="flex items-start gap-3">
       <Bot className="mt-1 h-5 w-5 shrink-0 text-primary" />
       <div>
        <p className="text-sm font-semibold text-foreground">{office.headline}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{office.mission}</p>
       </div>
      </div>
      <div className="mt-3 rounded-md border border-amber-200 bg-white/70 px-3 py-2 text-xs leading-relaxed text-amber-950">
       <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
       {office.operatingModel}
      </div>
     </div>

     <div className="grid gap-2">
      {office.governance.map((rule) => (
       <div key={rule.label} className="rounded-lg border bg-background px-3 py-2.5">
        <p className="text-sm font-semibold text-foreground">{rule.label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{rule.detail}</p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-primary">{rule.owner}</p>
       </div>
      ))}
     </div>
    </div>

    <div>
     <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
      <Crown className="h-4 w-4 text-primary" />
      Command Team
     </p>
     <div className="grid gap-3 lg:grid-cols-3">
      {office.topCommand.map((leader) => (
       <LeaderCard key={leader.id} leader={leader} />
      ))}
     </div>
    </div>

    <div>
     <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
      <Bot className="h-4 w-4 text-primary" />
      Leadership Lineup Lengkap
     </p>
     <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {office.leaders.map((leader) => (
       <LeaderCard key={leader.id} leader={leader} compact />
      ))}
     </div>
    </div>

    <div>
     <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
      <CalendarCheck className="h-4 w-4 text-primary" />
      Ritma Check & Upgrade
     </p>
     <div className="grid gap-2 lg:grid-cols-5">
      {office.rituals.map((ritual) => (
       <div key={ritual.label} className="rounded-lg border bg-background p-3">
        <div className="flex gap-2">
         <RitualStatusIcon status={ritual.status} />
         <div className="min-w-0">
          <p className="text-sm font-semibold">{ritual.label}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{ritual.cadence}</p>
         </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{ritual.outcome}</p>
        <p className="mt-2 text-[11px] font-medium text-muted-foreground">{ritual.owner}</p>
       </div>
      ))}
     </div>
    </div>
   </div>
  </SectionCard>
 );
}
