import type { LocationType } from '@/lib/inventory/types';
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';

export type TransferRouteMode = 'kiosk-kiosk' | 'hq-kiosk';

export const TRANSFER_ROUTE_LABELS: Record<TransferRouteMode, string> = {
 'kiosk-kiosk': 'Kiosk ke Kiosk',
 'hq-kiosk': 'HQ ke Kiosk',
};

export function isAllowedInventoryJourneyRoute(
 fromType: string | undefined,
 toType: string | undefined): boolean {
 if (!fromType || !toType) return false;
 const kioskKiosk =
 fromType === 'BRANCH_KIOSK' && toType === 'BRANCH_KIOSK';
 const hqKiosk = fromType === 'HQ_WAREHOUSE' && toType === 'BRANCH_KIOSK';
 return kioskKiosk || hqKiosk;
}

export function routeModeFromTransfer(
 fromType: string | undefined,
 toType: string | undefined): TransferRouteMode | null {
 if (fromType === 'BRANCH_KIOSK' && toType === 'BRANCH_KIOSK') {
 return 'kiosk-kiosk';
 }
 if (fromType === 'HQ_WAREHOUSE' && toType === 'BRANCH_KIOSK') {
 return 'hq-kiosk';
 }
 return null;
}

export function locationTypeLabel(type: LocationType | string): string {
 if (type === 'HQ_WAREHOUSE') return HQ_DISTRIBUTOR_LABEL;
 if (type === 'BRANCH_KIOSK') return 'Kiosk';
 return type;
}
