import { describe, expect, it } from 'vitest';
import {
 FIUU_STATIC_QR_VERSION,
 getFiuuStaticQrConfig,
 normalizeFiuuStaticBranchCode,
} from './fiuu-static';

describe('Fiuu static DuitNow QR mapping', () => {
 it('maps all approved RKJ branch codes to versioned assets', () => {
  for (let branch = 1; branch <= 36; branch += 1) {
   const code = `BR${String(branch).padStart(3, '0')}`;
   expect(getFiuuStaticQrConfig(code)).toEqual({
    branchCode: code,
    imageUrl: `/fiuu/duitnow-qr/${code}.png?v=${FIUU_STATIC_QR_VERSION}`,
    recipientName: 'ROTI KAYA JUNUS',
   });
  }
 });

 it('normalizes case and rejects branches outside the approved set', () => {
  expect(normalizeFiuuStaticBranchCode(' br001 ')).toBe('BR001');
  expect(normalizeFiuuStaticBranchCode('BR000')).toBeNull();
  expect(normalizeFiuuStaticBranchCode('BR037')).toBeNull();
  expect(normalizeFiuuStaticBranchCode('HQ001')).toBeNull();
 });
});
