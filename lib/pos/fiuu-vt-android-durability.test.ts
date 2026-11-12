import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const plugin = readFileSync(
 join(
  process.cwd(),
  'android/app/src/main/java/com/rkjone/staff/RkjFiuuVtPlugin.java',
 ),
 'utf8',
);

function methodBody(startMarker: string, endMarker: string) {
 const start = plugin.indexOf(startMarker);
 const end = plugin.indexOf(endMarker, start);
 expect(start).toBeGreaterThanOrEqual(0);
 expect(end).toBeGreaterThan(start);
 return plugin.slice(start, end);
}

describe('Fiuu VT Android callback durability', () => {
 it('synchronously commits critical bridge state', () => {
  expect(plugin).not.toContain('.apply()');
  expect(plugin).toContain('.commit()');
 });

 it('retains callback evidence when a new SALE starts', () => {
  const startSale = methodBody(
   'public synchronized void startSale(PluginCall call)',
   'public synchronized void acknowledgeResult(PluginCall call)',
  );

  expect(startSale).not.toContain('.remove(RESULT_QUEUE)');
  expect(startSale).not.toContain('.remove(LAST_RESULT)');
  expect(startSale).not.toContain('.remove(LAST_RESULT_AT)');
 });

 it('caps only low-value queue entries and never evicts authoritative evidence', () => {
  expect(plugin).toContain('private static final int RESULT_QUEUE_LIMIT = 128;');
  expect(plugin).toContain('if (removableIndex < 0) break;');
  expect(plugin).not.toContain('removableIndex < 0 ? 0 : removableIndex');

  const authoritative = methodBody(
   'private boolean isAuthoritativeResult(JSONObject value)',
   'private String recoverStaleVoidIfNeeded',
  );
  expect(authoritative).toContain('"MATCHED".equals(value.optString("callbackValidation"))');
  expect(authoritative).toContain('normalizedAttemptId(value.optString("callbackAttemptId"))');
  expect(authoritative).toContain('return isFiuuOperation(value.optString("opType"));');
 });
});
