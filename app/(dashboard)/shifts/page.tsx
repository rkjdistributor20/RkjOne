import { Suspense } from 'react';
import { ShiftManagement } from '@/components/shifts/shift-management';

export default function ShiftsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Memuatkan…</div>}>
      <ShiftManagement />
    </Suspense>
  );
}
