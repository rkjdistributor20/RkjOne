import { getPosQrPaymentMode } from './fiuu';

const BRANCH_CODE_PATTERN = /^BR\d{3}$/;

export function getFiuuVtPilotBranches(): ReadonlySet<string> {
 const branches = new Set<string>();
 for (const raw of (process.env.POS_FIUU_VT_BRANCHES ?? '').split(',')) {
  const branchCode = raw.trim().toUpperCase();
  if (!branchCode) continue;
  if (!BRANCH_CODE_PATTERN.test(branchCode)) {
   throw new Error(`Kod cawangan pilot Fiuu VT tidak sah: ${branchCode.slice(0, 12)}`);
  }
  branches.add(branchCode);
 }
 return branches;
}

export function isFiuuVtEnabledForBranch(branchCode: string): boolean {
 return getPosQrPaymentMode() === 'fiuu_vt'
  && getFiuuVtPilotBranches().has(branchCode.trim().toUpperCase());
}

export function getFiuuVtValiditySeconds(): number {
 const value = Number(process.env.POS_FIUU_VT_VALIDITY_SECONDS ?? 900);
 return Number.isInteger(value) && value >= 60 && value <= 3600 ? value : 900;
}
