import type { DeliveryLegType } from '@/lib/fleet/types';

export const MAX_MANUAL_DELIVERY_INSTRUCTIONS = 10;

export type ManualDeliveryInstruction = {
  key: string;
  destId: string;
  itemId: string;
  qty: string;
};

export type ManualDeliveryInstructionInput = {
  destId: string;
  itemId: string;
  quantity: number;
};

export function aggregateInstructionItems(
  instructions: ManualDeliveryInstructionInput[]
): Array<{ stock_item_id: string; quantity: number }> {
  const totals = new Map<string, number>();
  for (const row of instructions) {
    if (!row.itemId || row.quantity <= 0) continue;
    totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + row.quantity);
  }
  return [...totals.entries()].map(([stock_item_id, quantity]) => ({
    stock_item_id,
    quantity,
  }));
}

export function buildManualDeliveryLegs(options: {
  stockOrigin: 'FROM_FACTORY' | 'FROM_HQ';
  factoryId?: string;
  hqId: string;
  fleetSlotId: string;
  driverId: string;
  vehicleId: string;
  instructions: ManualDeliveryInstructionInput[];
}): Array<{
  leg_sequence: number;
  leg_type: DeliveryLegType;
  from_location_id: string;
  to_location_id: string;
  driver_id: string;
  vehicle_id: string;
  items: Array<{ stock_item_id: string; quantity: number }>;
}> {
  const {
    stockOrigin,
    factoryId,
    hqId,
    fleetSlotId,
    driverId,
    vehicleId,
    instructions,
  } = options;

  const allItems = aggregateInstructionItems(instructions);
  const legMeta = { driver_id: driverId, vehicle_id: vehicleId };
  const legs: Array<{
    leg_sequence: number;
    leg_type: DeliveryLegType;
    from_location_id: string;
    to_location_id: string;
    driver_id: string;
    vehicle_id: string;
    items: Array<{ stock_item_id: string; quantity: number }>;
  }> = [];

  let seq = 1;

  if (stockOrigin === 'FROM_FACTORY') {
    if (!factoryId) throw new Error('Lokasi kilang tidak dijumpai');
    legs.push({
      leg_sequence: seq++,
      leg_type: 'FACTORY_TO_HQ',
      from_location_id: factoryId,
      to_location_id: hqId,
      ...legMeta,
      items: allItems,
    });
    legs.push({
      leg_sequence: seq++,
      leg_type: 'HQ_TO_VEHICLE',
      from_location_id: hqId,
      to_location_id: fleetSlotId,
      ...legMeta,
      items: allItems,
    });
  } else {
    legs.push({
      leg_sequence: seq++,
      leg_type: 'HQ_TO_VEHICLE',
      from_location_id: hqId,
      to_location_id: fleetSlotId,
      ...legMeta,
      items: allItems,
    });
  }

  for (const row of instructions) {
    legs.push({
      leg_sequence: seq++,
      leg_type: 'VEHICLE_TO_BRANCH',
      from_location_id: fleetSlotId,
      to_location_id: row.destId,
      ...legMeta,
      items: [{ stock_item_id: row.itemId, quantity: row.quantity }],
    });
  }

  return legs;
}

export function validateManualInstructions(
  instructions: ManualDeliveryInstructionInput[]
): { ok: true } | { ok: false; message: string } {
  if (!instructions.length) {
    return { ok: false, message: 'Tambah sekurang-kurangnya satu arahan penghantaran' };
  }
  if (instructions.length > MAX_MANUAL_DELIVERY_INSTRUCTIONS) {
    return {
      ok: false,
      message: `Maksimum ${MAX_MANUAL_DELIVERY_INSTRUCTIONS} arahan dalam satu pesanan`,
    };
  }
  for (let i = 0; i < instructions.length; i++) {
    const row = instructions[i];
    if (!row.destId) {
      return { ok: false, message: `Arahan ${i + 1}: pilih cawangan destinasi` };
    }
    if (!row.itemId) {
      return { ok: false, message: `Arahan ${i + 1}: pilih stok` };
    }
    if (!row.quantity || row.quantity <= 0) {
      return { ok: false, message: `Arahan ${i + 1}: kuantiti mesti lebih 0` };
    }
  }
  return { ok: true };
}
