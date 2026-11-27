import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
 new URL('../../supabase/migrations/20261123120000_make_offline_pos_sync_idempotent.sql', import.meta.url),
 'utf8',
);
const terminal = readFileSync(
 new URL('../../components/pos/pos-terminal.tsx', import.meta.url),
 'utf8',
);
const syncRoute = readFileSync(
 new URL('../../app/api/pos/sync/route.ts', import.meta.url),
 'utf8',
);
const offlineGuardMigration = readFileSync(
 new URL('../../supabase/migrations/20261123191000_harden_offline_pos_sync.sql', import.meta.url),
 'utf8',
);

describe('offline POS replay safety', () => {
 it('serializes an offline identity and returns its durable receipt on retry', () => {
  expect(migration).toContain('HAVING count(*) > 1');
  expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_tx_offline_org_unique');
  expect(migration).toContain('ON public.pos_transactions (organization_id, offline_id)');
  expect(migration).toContain('pg_advisory_xact_lock(');
  expect(migration).toContain("v_org_id::text || ':' || p_offline_id");
  expect(migration).toContain('WHERE tx.organization_id = v_org_id');
  expect(migration).toContain('AND tx.offline_id = p_offline_id');
  expect(migration).toContain('v_existing_items <> v_payload_items');
  expect(migration).toContain('Offline sale id was already used with a different payload');
  expect(migration).toContain("'transaction_id', v_existing.id");
  expect(migration).toContain('|| v_existing.stored_receipt_data');
  expect(migration.indexOf('IF FOUND THEN'))
   .toBeLessThan(migration.indexOf('RETURN public.process_pos_sale_internal('));
 });

 it('keeps the original offline id attached to every sync retry', () => {
  expect(syncRoute).toContain('process_registered_pos_cash_sale');
  expect(syncRoute).toContain('offline_id: sale.offlineId');
  expect(syncRoute).toContain('synced.push(offlineId)');
 });

 it('rejects provider-backed money and stale actor/tablet/shift bindings', () => {
  expect(syncRoute).toContain("sale.payment_method !== 'CASH'");
  expect(syncRoute).toContain('sale.actorId !== profile.id');
  expect(syncRoute).toContain('sale.deviceId !== verifiedDevice.id');
  expect(syncRoute).toContain('sale.enrollmentGeneration !== verifiedDevice.enrollmentGeneration');
  expect(syncRoute).toContain('assertActivePosShiftMember(');
  expect(offlineGuardMigration).toContain("NEW.payment_method <> 'CASH'");
  expect(offlineGuardMigration).toContain("COALESCE(NEW.qr_amount, 0) <> 0");
  expect(offlineGuardMigration).toContain("member.status = 'ACTIVE'");
  expect(offlineGuardMigration).toContain("shift.status = 'OPEN'");
 });

 it('runs one queue sync on mount, reconnect, focus and pageshow', () => {
  const syncStart = terminal.indexOf('const syncOffline = useCallback');
  const syncEnd = terminal.indexOf('useEffect(() => {', syncStart);
  const sync = terminal.slice(syncStart, syncEnd);
  const onlineEffectStart = terminal.indexOf('setOnline(navigator.onLine);');
  const onlineEffectEnd = terminal.indexOf('}, [setOnline, setOfflineCount, syncOffline]);', onlineEffectStart);
  const onlineEffect = terminal.slice(onlineEffectStart, onlineEffectEnd);

  expect(sync).toContain('offlineSyncInFlightRef.current');
  expect(sync).toContain('if (existing) return existing;');
  expect(sync).toContain('const tracked = work.finally(() => {');
  expect(onlineEffect).toContain('if (navigator.onLine) void syncOffline();');
  expect(onlineEffect).toContain("window.addEventListener('online', goOnline)");
  expect(onlineEffect).toContain("window.addEventListener('focus', retryVisibleQueue)");
  expect(onlineEffect).toContain("window.addEventListener('pageshow', retryVisibleQueue)");
  expect(onlineEffect).toContain("window.removeEventListener('focus', retryVisibleQueue)");
  expect(onlineEffect).toContain("window.removeEventListener('pageshow', retryVisibleQueue)");
 });
});
