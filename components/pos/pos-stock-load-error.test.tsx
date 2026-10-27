import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stockSopSource = readFileSync(
 new URL('./pos-stock-sop-panel.tsx', import.meta.url),
 'utf8',
);
const rejectStockSource = readFileSync(
 new URL('./reject-stock-panel.tsx', import.meta.url),
 'utf8',
);

function sourceSection(source: string, startMarker: string, endMarker: string) {
 const start = source.indexOf(startMarker);
 const end = source.indexOf(endMarker, start);
 expect(start).toBeGreaterThanOrEqual(0);
 expect(end).toBeGreaterThan(start);
 return source.slice(start, end);
}

describe('POS stock load failure UI', () => {
 it('clears stale SOP data and items after a load failure', () => {
 const catchBlock = sourceSection(stockSopSource, '} catch (err) {', '} finally {');

 expect(catchBlock).toContain('setData(null)');
 expect(catchBlock).toContain('setStockItems([])');
 expect(catchBlock).toContain('setReceiptQty({})');
 expect(catchBlock).toContain('setLoadError(message)');
 });

 it('renders the SOP load error before any shift-state inference', () => {
 const loadErrorGuard = stockSopSource.indexOf('if (loadError || !data)');
 const shiftInference = stockSopSource.indexOf('const shiftIsOpen = Boolean');
 const errorUi = sourceSection(
 stockSopSource,
 'function PosStockSopLoadError',
 'export function PosStockSopPanel',
 );

 expect(loadErrorGuard).toBeGreaterThanOrEqual(0);
 expect(loadErrorGuard).toBeLessThan(shiftInference);
 expect(errorUi).toContain('role="alert"');
 expect(errorUi).toContain('Status syif dan data stok tidak dapat disahkan');
 expect(errorUi).toContain('Cuba semula');
 });

 it('clears reject items and shows a locked retry state before the empty state', () => {
 const catchBlock = sourceSection(rejectStockSource, '} catch (error) {', '} finally {');
 const errorBranch = rejectStockSource.indexOf(': loadError ? (');
 const emptyBranch = rejectStockSource.indexOf(': stockItems.length === 0 ? (');
 const errorUi = sourceSection(
 rejectStockSource,
 'function RejectStockLoadError',
 'export function RejectStockPanel',
 );

 expect(catchBlock).toContain('setStockItems([])');
 expect(catchBlock).toContain('setLoadError(message)');
 expect(errorBranch).toBeGreaterThanOrEqual(0);
 expect(errorBranch).toBeLessThan(emptyBranch);
 expect(errorUi).toContain('Borang reject dikunci');
 expect(errorUi).toContain('disabled={retrying}');
 expect(errorUi).toContain('Mencuba semula...');
 expect(errorUi).toContain('Cuba semula');
 });
});
