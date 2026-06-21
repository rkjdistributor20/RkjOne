import { Suspense } from 'react';
import { SettingsDashboard } from '@/components/settings/settings-dashboard';
import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SettingsDashboard />
    </Suspense>
  );
}
