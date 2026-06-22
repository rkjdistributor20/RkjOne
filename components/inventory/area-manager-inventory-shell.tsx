'use client';

import type { ReactNode } from 'react';
import { ArrowLeftRight, MapPinned } from 'lucide-react';
import { cn } from '@/lib/utils';
import { moduleTabsListClass, moduleTabsTriggerClass } from '@/components/shared/module-ui';

type AmView = 'location' | 'branch-transfer';

interface AreaManagerInventoryShellProps {
  view: AmView;
  onViewChange: (view: AmView) => void;
  showBranchTransfer: boolean;
  locationPanel: ReactNode;
  branchTransferPanel: ReactNode;
}

export function AreaManagerInventoryShell({
  view,
  onViewChange,
  showBranchTransfer,
  locationPanel,
  branchTransferPanel,
}: AreaManagerInventoryShellProps) {
  return (
    <div className="space-y-4">
      {showBranchTransfer && (
        <div className={moduleTabsListClass}>
          <button
            type="button"
            className={cn(moduleTabsTriggerClass, view === 'location' && 'bg-background shadow-sm')}
            onClick={() => onViewChange('location')}
          >
            <MapPinned className="h-4 w-4" /> Detail Lokasi
          </button>
          <button
            type="button"
            className={cn(
              moduleTabsTriggerClass,
              view === 'branch-transfer' && 'bg-background shadow-sm'
            )}
            onClick={() => onViewChange('branch-transfer')}
          >
            <ArrowLeftRight className="h-4 w-4" /> Pindah Cawangan
          </button>
        </div>
      )}

      {view === 'location' ? locationPanel : branchTransferPanel}
    </div>
  );
}
