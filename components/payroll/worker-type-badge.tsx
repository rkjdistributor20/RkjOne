import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  inferWorkerType,
  workerTypeLabel,
  workerTypePayPeriod,
} from '@/lib/payroll/staff-pay-rates';
import type { WorkerType } from '@/lib/payroll/types';

type WorkerTypeInput = {
  worker_type?: WorkerType | null;
  weekly_amount?: number | null;
  monthly_amount?: number | null;
};

export function resolveWorkerType(staff: WorkerTypeInput): WorkerType {
  return inferWorkerType(staff);
}

export function WorkerTypeBadge({
  workerType,
  className,
  showPeriod = true,
}: {
  workerType: WorkerType | null;
  className?: string;
  showPeriod?: boolean;
}) {
  if (!workerType) {
    return (
      <Badge variant="secondary" className={cn('font-normal', className)}>
        Belum ditetapkan
      </Badge>
    );
  }

  const isForeign = workerType === 'FOREIGN';
  const period = workerTypePayPeriod(workerType);

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-normal',
        isForeign
          ? 'border-orange-300 bg-orange-50 text-orange-900'
          : 'border-sky-300 bg-sky-50 text-sky-900',
        className
      )}
    >
      {workerTypeLabel(workerType)}
      {showPeriod && period ? ` · ${period}` : ''}
    </Badge>
  );
}
