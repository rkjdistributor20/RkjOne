import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Banknote,
  Package,
  Truck,
} from 'lucide-react';
import type { DashboardStats } from '@/types/database';

async function getDashboardStats(): Promise<DashboardStats | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('dashboard_stats').select('*').maybeSingle();
  return data;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  variant = 'default',
}: {
  title: string;
  value: string;
  description?: string;
  icon: React.ElementType;
  variant?: 'default' | 'warning' | 'danger';
}) {
  const colors = {
    default: 'text-amber-600 bg-amber-50',
    warning: 'text-orange-600 bg-orange-50',
    danger: 'text-red-600 bg-red-50',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`rounded-lg p-2 ${colors[variant]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatRM(amount: number) {
  return `RM ${amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`;
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Overview for Roti Kaya Junus operations
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Sales Today"
          value={formatRM(stats?.sales_today ?? 0)}
          icon={TrendingUp}
        />
        <StatCard
          title="Sales This Week"
          value={formatRM(stats?.sales_this_week ?? 0)}
          icon={TrendingUp}
        />
        <StatCard
          title="Sales This Month"
          value={formatRM(stats?.sales_this_month ?? 0)}
          icon={TrendingUp}
        />
        <StatCard
          title="Outstanding Cash"
          value={formatRM(stats?.outstanding_cash ?? 0)}
          icon={Banknote}
          variant="warning"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Low Stock Items"
          value={String(stats?.low_stock_count ?? 0)}
          description="Below minimum threshold"
          icon={Package}
          variant="warning"
        />
        <StatCard
          title="Critical Stock"
          value={String(stats?.critical_stock_count ?? 0)}
          description="Immediate action required"
          icon={AlertTriangle}
          variant="danger"
        />
        <StatCard
          title="Pending Approvals"
          value={String(stats?.pending_approvals ?? 0)}
          description="Awaiting manager action"
          icon={CheckCircle2}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Fleet Status
            </CardTitle>
            <CardDescription>Delivery order status summary</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {['V001 Lori 5T', 'V002 Lori 3T', 'V003 Lori 1T', 'V004 Van', 'V005 Lori/Van'].map(
                (v) => (
                  <Badge key={v} variant="outline">
                    {v}
                  </Badge>
                )
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {[
              { label: 'Open POS Shift', href: '/pos' },
              { label: 'Stock Transfer', href: '/inventory' },
              { label: 'View Reports', href: '/reports' },
              { label: 'Pending Approvals', href: '/approvals' },
            ].map((action) => (
              <a
                key={action.href}
                href={action.href}
                className="rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
              >
                {action.label}
              </a>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
