/** Peranan driver penghantaran RKJ */

export type DriverRouteRole = 'DIRECT' | 'HUB_PRIMARY' | 'HUB_RELAY';

export const DRIVER_ROLE_LABELS: Record<DriverRouteRole, string> = {
  DIRECT: 'HQ → Kiosk (terus)',
  HUB_PRIMARY: 'Hub — hantar & sambut stok',
  HUB_RELAY: 'Sambut stok → Kiosk',
};

export const STOP_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Menunggu kilang',
  IN_TRANSIT: 'Dalam perjalanan',
  DELIVERED: 'Disahkan',
  SKIPPED: 'Dilangkau',
};

export const ROUTE_STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Dirancang',
  WAITING_HANDOFF: 'Menunggu sambut stok',
  READY: 'Sedia hantar kiosk',
  DISPATCHED: 'Dalam perjalanan',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export function driverRoleFromCode(driverCode: string): DriverRouteRole {
  if (driverCode === 'D001') return 'HUB_PRIMARY';
  if (driverCode === 'D004' || driverCode === 'D005') return 'HUB_RELAY';
  return 'DIRECT';
}

export function driversForRegion(
  drivers: Array<{ id: string; driver_code: string; full_name: string }>,
  region: string | null
): typeof drivers {
  const codesByRegion: Record<string, string[]> = {
    UTARA: ['D001', 'D004', 'D005'],
    TENGAH: ['D002', 'D003'],
    SELATAN: ['D002', 'D003'],
  };
  const allowed = codesByRegion[region ?? ''] ?? ['D002', 'D003'];
  return drivers.filter((d) => allowed.includes(d.driver_code));
}
