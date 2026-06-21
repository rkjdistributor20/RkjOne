import type { FleetDriver, FleetVehicle } from '@/lib/fleet/types';
import type { InventoryLocation, StockItemOption } from '@/lib/inventory/types';
import { LOCATION_TYPE_LABELS } from '@/lib/inventory/types';
import { getHqOrderUnitLabel } from '@/lib/production/hq-order-format';

/** Nama cawangan untuk paparan (bukan kod lokasi dalaman) */
export function formatBranchDestination(loc: InventoryLocation): string {
  if (loc.branch?.branch_name) {
    return loc.branch.branch_name;
  }
  return loc.name;
}

export function formatBranchDestinationDetail(loc: InventoryLocation): string | null {
  const parts: string[] = [];
  if (loc.branch?.branch_code) parts.push(loc.branch.branch_code);
  if (loc.name && loc.name !== loc.branch?.branch_name) parts.push(loc.name);
  return parts.length ? parts.join(' · ') : null;
}

export function formatDriverName(driver: FleetDriver | undefined | null): string {
  if (!driver) return '—';
  return driver.full_name;
}

export function formatDriverDetail(driver: FleetDriver | undefined | null): string | null {
  if (!driver) return null;
  return driver.route_description ?? null;
}

export function formatVehicleName(vehicle: FleetVehicle | undefined | null): string {
  if (!vehicle) return '—';
  if (vehicle.plate_number) {
    return `${vehicle.plate_number} (${vehicle.vehicle_type})`;
  }
  return vehicle.vehicle_type || 'Kenderaan';
}

export function formatVehicleDetail(vehicle: FleetVehicle | undefined | null): string | null {
  if (!vehicle?.capacity) return null;
  return `Kapasiti ${vehicle.capacity}`;
}

export function formatFleetSlot(
  loc: InventoryLocation | undefined | null,
  vehicle?: FleetVehicle | null
): string {
  if (vehicle) return formatVehicleName(vehicle);
  if (!loc) return '—';
  if (loc.vehicle?.vehicle_type) {
    return loc.vehicle.vehicle_type;
  }
  return LOCATION_TYPE_LABELS.FLEET_VEHICLE;
}

export function formatStockItemName(item: StockItemOption | undefined | null): string {
  if (!item) return '—';
  return item.name;
}

export function formatStockItemDetail(item: StockItemOption | undefined | null): string | null {
  if (!item) return null;
  const unit = getHqOrderUnitLabel(item.item_code);
  const cat = item.category;
  return [cat, unit ? `Order dalam ${unit}` : null].filter(Boolean).join(' · ') || null;
}

export function formatLocationNode(loc: InventoryLocation | undefined | null): string {
  if (!loc) return '—';
  if (loc.location_type === 'BRANCH_KIOSK') return formatBranchDestination(loc);
  if (loc.location_type === 'FLEET_VEHICLE') {
    if (loc.vehicle?.vehicle_type) return `Armada · ${loc.vehicle.vehicle_type}`;
    return 'Armada';
  }
  return LOCATION_TYPE_LABELS[loc.location_type] ?? loc.name;
}

export function fleetLocationForVehicle(
  vehicleId: string | undefined,
  fleetLocations: InventoryLocation[]
): InventoryLocation | undefined {
  if (!vehicleId) return undefined;
  return fleetLocations.find((l) => l.vehicle_id === vehicleId);
}

export function vehicleForDriver(
  driverId: string | undefined,
  vehicles: FleetVehicle[]
): FleetVehicle | undefined {
  if (!driverId) return undefined;
  return vehicles.find((v) => v.default_driver_id === driverId);
}

export function sortBranchesByName(locs: InventoryLocation[]): InventoryLocation[] {
  return [...locs].sort((a, b) => {
    const na = a.branch?.branch_name ?? a.name;
    const nb = b.branch?.branch_name ?? b.name;
    return na.localeCompare(nb, 'ms');
  });
}
