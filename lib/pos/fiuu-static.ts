const FIRST_FIUU_BRANCH = 1;
const LAST_FIUU_BRANCH = 36;

export const FIUU_STATIC_QR_VERSION = '2026-10-06';

export type FiuuStaticQrConfig = {
 branchCode: string;
 imageUrl: string;
 recipientName: 'ROTI KAYA JUNUS';
};

export function normalizeFiuuStaticBranchCode(value: string): string | null {
 const normalized = value.trim().toUpperCase();
 const match = /^BR(\d{3})$/.exec(normalized);
 if (!match) return null;

 const branchNumber = Number(match[1]);
 if (branchNumber < FIRST_FIUU_BRANCH || branchNumber > LAST_FIUU_BRANCH) {
  return null;
 }

 return `BR${String(branchNumber).padStart(3, '0')}`;
}

export function getFiuuStaticQrConfig(branchCode: string): FiuuStaticQrConfig | null {
 const normalized = normalizeFiuuStaticBranchCode(branchCode);
 if (!normalized) return null;

 return {
  branchCode: normalized,
  imageUrl: `/fiuu/duitnow-qr/${normalized}.png?v=${FIUU_STATIC_QR_VERSION}`,
  recipientName: 'ROTI KAYA JUNUS',
 };
}
