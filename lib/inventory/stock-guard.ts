import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '@/types/database';
import {
 areaManagerMayManageLocation,
 canBranchKioskTransfer,
 canManageHqStockInOut,
 isAreaManagerRole,
 isHqLocationType,
 isKioskLocationType,
 isOperationManagerRole,
 isStaffRole,
 staffMayRejectAtKiosk,
 type StockMutationOperation,
} from '@/lib/auth/stock-access';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';

type LocationRow = {
 id: string;
 location_type: string;
 branch_id: string | null;
 organization_id: string;
 name: string;
};

async function loadLocation(
 supabase: SupabaseClient,
 locationId: string): Promise<LocationRow | null> {
 const { data } = await supabase.from('inventory_locations').select('id, location_type, branch_id, organization_id, name').eq('id', locationId).maybeSingle();
 return data as LocationRow | null;
}

function deny(message: string): never {
 throw new Error(message);
}

async function assertLocationAccess(
 supabase: SupabaseClient,
 profile: Profile,
 location: LocationRow,
 operation: StockMutationOperation): Promise<void> {
 if (location.organization_id !== profile.organization_id) {
 deny('Lokasi di luar organisasi');
 }

 const role = profile.role;

 if (isStaffRole(role)) {
 if (operation !== 'write_off') {
 deny('Stok masuk/keluar dikawal HQ & Pengurus Kawasan. Staf hanya boleh reject stok dari POS.');
 }
 if (
 !staffMayRejectAtKiosk(
 profile.branch_id,
 location.location_type,
 location.branch_id)) {
 deny('Reject stok hanya dibenarkan di kiosk cawangan anda');
 }
 return;
 }

 if (isAreaManagerRole(role)) {
 const scope = await resolveScopedBranches(supabase, profile);
 if (
 !areaManagerMayManageLocation(
 location.location_type,
 location.branch_id,
 scope.branchIds)) {
 if (isHqLocationType(location.location_type)) {
 deny(`Stok ${HQ_DISTRIBUTOR_LABEL} dikawal oleh HQ - Pengurus Kawasan urus kiosk kawasan sahaja`);
 }
 deny('Lokasi di luar kawasan anda');
 }
 if (
 operation !== 'write_off' &&
 isHqLocationType(location.location_type)) {
 deny(`Pengurus Kawasan tidak urus stok masuk/keluar ${HQ_DISTRIBUTOR_LABEL}`);
 }
 return;
 }

 if (isOperationManagerRole(role)) {
 if (!isKioskLocationType(location.location_type)) {
 deny(`Pengurus Operasi urus stok kiosk cawangan sahaja - bukan Kilang/${HQ_DISTRIBUTOR_LABEL}`);
 }
 return;
 }

 if (canManageHqStockInOut(role)) {
 return;
 }

 deny('Tiada kebenaran untuk operasi stok ini');
}

export function stockGuardErrorMessage(err: unknown): string {
 return err instanceof Error ? err.message : 'Akses ditolak';
}

/** Semak kebenaran mutasi stok - throw Error jika ditolak */
export async function assertStockMutationAllowed(
 supabase: SupabaseClient,
 profile: Profile,
 operation: StockMutationOperation,
 locationId: string): Promise<LocationRow> {
 const location = await loadLocation(supabase, locationId);
 if (!location) deny('Lokasi tidak dijumpai');
 await assertLocationAccess(supabase, profile, location, operation);
 return location;
}

export async function assertTransferMutationAllowed(
 supabase: SupabaseClient,
 profile: Profile,
 operation: 'transfer_create' | 'transfer_dispatch' | 'transfer_complete',
 transferId: string): Promise<void> {
 if (isStaffRole(profile.role)) {
 deny('Stok masuk/keluar dikawal HQ & Pengurus Kawasan');
 }

 const { data: transfer } = await supabase.from('stock_transfers').select(
 'id, from_location_id, to_location_id, organization_id').eq('id', transferId).maybeSingle();

 if (!transfer) deny('Pindahan tidak dijumpai');

 const from = await loadLocation(supabase, transfer.from_location_id);
 const to = await loadLocation(supabase, transfer.to_location_id);
 if (!from || !to) deny('Lokasi pindahan tidak dijumpai');

 if (operation === 'transfer_create') {
 await assertLocationAccess(supabase, profile, from, operation);
 if (isHqLocationType(from.location_type) && !canManageHqStockInOut(profile.role)) {
 deny(`Hanya HQ boleh keluarkan stok dari ${HQ_DISTRIBUTOR_LABEL}`);
 }
 if (
 isHqLocationType(to.location_type) &&
 !canManageHqStockInOut(profile.role)) {
 deny(`Hanya HQ urus stok masuk ${HQ_DISTRIBUTOR_LABEL}`);
 }
 return;
 }

 if (operation === 'transfer_dispatch') {
 await assertLocationAccess(supabase, profile, from, operation);
 if (isHqLocationType(from.location_type) && !canManageHqStockInOut(profile.role)) {
 deny(`Hanya HQ boleh hantar stok dari ${HQ_DISTRIBUTOR_LABEL}`);
 }
 return;
 }

 await assertLocationAccess(supabase, profile, to, operation);
}

export async function assertTransferCreateAllowed(
 supabase: SupabaseClient,
 profile: Profile,
 fromLocationId: string,
 toLocationId: string): Promise<void> {
 if (isStaffRole(profile.role)) {
 deny('Stok masuk/keluar dikawal HQ & Pengurus Kawasan');
 }

 const from = await loadLocation(supabase, fromLocationId);
 const to = await loadLocation(supabase, toLocationId);
 if (!from || !to) deny('Lokasi tidak dijumpai');

 if (canBranchKioskTransfer(profile.role)) {
 const kioskPair =
 isKioskLocationType(from.location_type) && isKioskLocationType(to.location_type);
 if (kioskPair) {
 if (from.branch_id && to.branch_id && from.branch_id === to.branch_id) {
 deny('Pilih cawangan destinasi yang berbeza');
 }
 await assertLocationAccess(supabase, profile, from, 'transfer_create');
 await assertLocationAccess(supabase, profile, to, 'transfer_create');
 return;
 }
 if (isOperationManagerRole(profile.role) || isAreaManagerRole(profile.role)) {
 deny('Pindahan cawangan hanya antara kiosk - pilih cawangan asal dan destinasi');
 }
 }

 await assertLocationAccess(supabase, profile, from, 'transfer_create');
 await assertLocationAccess(supabase, profile, to, 'transfer_create');

 if (isHqLocationType(from.location_type) && !canManageHqStockInOut(profile.role)) {
 deny(`Hanya HQ boleh keluarkan stok dari ${HQ_DISTRIBUTOR_LABEL} / kilang`);
 }
 if (isHqLocationType(to.location_type) && !canManageHqStockInOut(profile.role)) {
 deny(`Hanya HQ urus stok masuk ${HQ_DISTRIBUTOR_LABEL} / kilang`);
 }
}

export function isKioskToKioskTransfer(
 from: LocationRow,
 to: LocationRow): boolean {
 return (
 isKioskLocationType(from.location_type) && isKioskLocationType(to.location_type));
}
