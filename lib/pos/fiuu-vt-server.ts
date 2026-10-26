import { getPosQrPaymentMode } from './fiuu';

export const FIUU_VT_PILOT_BRANCH = 'BR001' as const;

const BRANCH_CODE_PATTERN = /^BR\d{3}$/;

export function getFiuuVtPilotBranches(): ReadonlySet<string> {
 const configuredBranches = process.env.POS_FIUU_VT_BRANCHES;
 if (!configuredBranches?.trim()) return new Set();

 const branches = new Set<string>();
 for (const raw of configuredBranches.split(',')) {
  const branchCode = raw.trim().toUpperCase();
  if (!branchCode || !BRANCH_CODE_PATTERN.test(branchCode)) {
   throw new Error(`Kod cawangan pilot Fiuu VT tidak sah: ${branchCode.slice(0, 12) || '(kosong)'}`);
  }
  if (branchCode !== FIUU_VT_PILOT_BRANCH) {
   throw new Error(`Pilot Fiuu VT dikunci kepada ${FIUU_VT_PILOT_BRANCH}`);
  }
  branches.add(branchCode);
 }
 return branches;
}

export function isFiuuVtEnabledForBranch(branchCode: string): boolean {
 const normalizedBranchCode = branchCode.trim().toUpperCase();
 if (!BRANCH_CODE_PATTERN.test(normalizedBranchCode)) return false;

 return getPosQrPaymentMode() === 'fiuu_vt'
  && getFiuuVtPilotBranches().has(normalizedBranchCode);
}

export function getFiuuVtValiditySeconds(): number {
 const value = Number(process.env.POS_FIUU_VT_VALIDITY_SECONDS ?? 900);
 return Number.isInteger(value) && value >= 60 && value <= 3600 ? value : 900;
}
