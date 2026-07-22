/** Peranan driver penghantaran RKJ */

export type DriverRouteRole = 'DIRECT' | 'HUB_PRIMARY' | 'HUB_RELAY';

export const DRIVER_ROLE_LABELS: Record<DriverRouteRole, string> = {
 DIRECT: 'HQ ke Kiosk (terus)',
 HUB_PRIMARY: 'Hub - hantar & sambut stok',
 HUB_RELAY: 'Sambut stok ke Kiosk',
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
 const code = driverCode.toUpperCase();
 if (['D001', 'DRV001', 'ROAD001', 'DIST-DRV-001', 'DIST-AST-001'].includes(code)) return 'HUB_PRIMARY';
 if (['D004', 'D005', 'DRV003', 'DRV004', 'ROAD004', 'ROAD005', 'ROAD006', 'DIST-DRV-004', 'DIST-DRV-005'].includes(code)) {
 return 'HUB_RELAY';
 }
 return 'DIRECT';
}

export function driversForRegion(
 drivers: Array<{ id: string; driver_code: string; full_name: string }>,
 region: string | null): typeof drivers {
 const codesByRegion: Record<string, string[]> = {
 UTARA: [
 'DIST-DRV-002',
 'DIST-DRV-003',
 'DIST-DRV-001',
 'DIST-AST-001',
 'MFG-DRV-POOL',
 'D001',
 'D002',
 'D003',
 'DRV001',
 'DRV002',
 'DRV006',
 'ROAD001',
 'ROAD002',
 'ROAD003',
 'ROAD007',
 'ROAD008',
 ],
 TENGAH: [
 'DIST-DRV-005',
 'DIST-DRV-001',
 'DIST-AST-001',
 'DIST-DRV-002',
 'DIST-DRV-003',
 'DIST-DRV-004',
 'MFG-DRV-POOL',
 'D002',
 'D003',
 'DRV005',
 'DRV006',
 'ROAD002',
 'ROAD004',
 ],
 SELATAN: [
 'DIST-DRV-004',
 'DIST-DRV-002',
 'DIST-DRV-003',
 'MFG-DRV-POOL',
 'D002',
 'D003',
 'DRV002',
 'DRV006',
 'ROAD002',
 'ROAD003',
 ],
 };
 const allowed = new Set(codesByRegion[(region ?? '').toUpperCase()] ?? []);
 const preferred: typeof drivers = [];
 const others: typeof drivers = [];

 for (const driver of drivers) {
 const code = driver.driver_code.toUpperCase();
 if (allowed.has(code)) preferred.push(driver);
 else others.push(driver);
 }

 // Jangan kosongkan dropdown. HQ/OM perlu boleh override driver kerana laluan
 // sebenar boleh berubah ikut cawangan, pickup point, jumlah stok dan cuti.
 return preferred.length > 0 ? [...preferred, ...others] : drivers;
}
