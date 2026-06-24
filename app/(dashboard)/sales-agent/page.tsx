import { Suspense } from 'react';
import { SalesAgentDashboard } from '@/components/sales-agent/sales-agent-dashboard';

export default function SalesAgentPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Memuatkan portal ejen…</p>}>
      <SalesAgentDashboard />
    </Suspense>
  );
}
