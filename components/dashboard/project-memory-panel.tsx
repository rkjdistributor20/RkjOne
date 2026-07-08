import Link from 'next/link';
import {
 AlertTriangle,
 Bot,
 CheckCircle2,
 ClipboardList,
 Cloud,
 Database,
 ExternalLink,
 GitBranch,
 ListChecks,
 Rocket,
 ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { SectionCard } from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';
import {
 RKJ_ONE_PROJECT_MEMORY,
 type ProjectMemoryItem,
 type ProjectMemoryMetric,
} from '@/lib/dashboard/project-memory';

function MetricPill({ metric }: { metric: ProjectMemoryMetric }) {
 const toneClass =
  metric.tone === 'success'
   ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
   : metric.tone === 'warning'
    ? 'border-amber-200 bg-amber-50 text-amber-950'
    : 'border-border bg-background text-foreground';

 return (
  <div className={cn('rounded-lg border px-3 py-2', toneClass)}>
   <p className="text-[11px] font-semibold uppercase tracking-wide opacity-75">{metric.label}</p>
   <p className="mt-1 text-lg font-bold tabular-nums">{metric.value}</p>
   <p className="text-xs opacity-75">{metric.detail}</p>
  </div>
 );
}

function StatusIcon({ status }: { status: ProjectMemoryItem['status'] }) {
 if (status === 'done') {
  return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />;
 }
 if (status === 'watch') {
  return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />;
 }
 return <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />;
}

function MemoryList({ items }: { items: ProjectMemoryItem[] }) {
 return (
  <div className="space-y-2">
   {items.map((item) => (
    <div key={item.title} className="flex gap-2 rounded-lg border bg-background px-3 py-2.5">
     <StatusIcon status={item.status} />
     <div className="min-w-0">
      <p className="text-sm font-semibold text-foreground">{item.title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
     </div>
    </div>
   ))}
  </div>
 );
}

export function ProjectMemoryPanel() {
 const memory = RKJ_ONE_PROJECT_MEMORY;

 return (
  <SectionCard
   title={
    <span className="inline-flex items-center gap-2">
     <Bot className="h-4 w-4 text-primary" />
     RKJ One Project Memory
    </span>
   }
   description={`Disalin daripada ${memory.source}. Dikemas kini ${memory.updatedAt}.`}
   action={
    <Link href="/settings" className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'shrink-0')}>
     <ShieldCheck className="mr-1.5 h-4 w-4" />
     Kesihatan Sistem
    </Link>
   }
  >
   <div className="space-y-4">
    <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
     <div className="rounded-lg border border-amber-200/70 bg-amber-50/40 p-4">
      <div className="flex items-start gap-3">
       <Rocket className="mt-1 h-5 w-5 shrink-0 text-primary" />
       <div>
        <p className="text-sm font-semibold text-foreground">Tujuan projek</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{memory.purpose}</p>
       </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
       {memory.company.map((item) => (
        <Badge key={item} variant="outline" className="bg-white/70">
         {item}
        </Badge>
       ))}
      </div>
     </div>

     <div className="grid grid-cols-2 gap-2">
      {memory.metrics.map((metric) => (
       <MetricPill key={metric.label} metric={metric} />
      ))}
     </div>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
     <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
       <CheckCircle2 className="h-4 w-4 text-emerald-600" />
       Siap Dari Chat Cursor/Codex
      </p>
      <MemoryList items={memory.completed} />
     </div>
     <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
       <ClipboardList className="h-4 w-4 text-sky-600" />
       Baki Manual
      </p>
      <MemoryList items={memory.pending} />
     </div>
    </div>

    <div className="grid gap-3 lg:grid-cols-4">
     {memory.connections.map((connection) => {
      const Icon =
       connection.label === 'GitHub'
        ? GitBranch
        : connection.label === 'Vercel'
         ? Cloud
         : connection.label === 'Supabase'
          ? Database
          : Bot;

      const content = (
       <div className="h-full rounded-lg border bg-background p-3 transition-colors hover:border-primary/40">
        <div className="flex items-start justify-between gap-2">
         <Icon className="h-4 w-4 text-primary" />
         {connection.href && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
         {connection.label}
        </p>
        <p className="mt-1 break-words text-sm font-semibold">{connection.value}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{connection.detail}</p>
       </div>
      );

      return connection.href ? (
       <Link key={connection.label} href={connection.href} target="_blank" rel="noreferrer">
        {content}
       </Link>
      ) : (
       <div key={connection.label}>{content}</div>
      );
     })}
    </div>

    <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
     <div className="rounded-lg border bg-background p-3">
      <p className="text-sm font-semibold">Stack dan prinsip sistem</p>
      <div className="mt-2 flex flex-wrap gap-2">
       {memory.architecture.map((item) => (
        <Badge key={item} variant="secondary">
         {item}
        </Badge>
       ))}
      </div>
     </div>
     <div className="rounded-lg border bg-background p-3">
      <p className="text-sm font-semibold">Command verify pantas</p>
      <div className="mt-2 flex flex-wrap gap-2">
       {memory.verifyCommands.map((command) => (
        <code key={command} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
         {command}
        </code>
       ))}
      </div>
     </div>
    </div>

    <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-950">
     <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
     {memory.securityNote}
    </div>
   </div>
  </SectionCard>
 );
}
