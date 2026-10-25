import { getPosQrPaymentMode } from './fiuu';

export const FIUU_OPA_PILOT_BRANCH = 'BR001' as const;

const BRANCH_CODE_PATTERN = /^BR\d{3}$/;

export function getFiuuOpaPilotBranches(): ReadonlySet<string> {
 const configuredBranches = process.env.POS_FIUU_OPA_BRANCHES;
 if (!configuredBranches?.trim()) return new Set();

 const branches = new Set<string>();
 for (const raw of configuredBranches.split(',')) {
  const branchCode = raw.trim().toUpperCase();
  if (!branchCode || !BRANCH_CODE_PATTERN.test(branchCode)) {
   throw new Error(`Kod cawangan pilot Fiuu OPA tidak sah: ${branchCode.slice(0, 12) || '(kosong)'}`);
  }
  if (branchCode !== FIUU_OPA_PILOT_BRANCH) {
   throw new Error(`Pilot Fiuu OPA dikunci kepada ${FIUU_OPA_PILOT_BRANCH}`);
  }
  branches.add(branchCode);
 }
 return branches;
}

export function isFiuuOpaEnabledForBranch(branchCode: string): boolean {
 const normalizedBranchCode = branchCode.trim().toUpperCase();
 if (!BRANCH_CODE_PATTERN.test(normalizedBranchCode)) return false;

 return getPosQrPaymentMode() === 'fiuu'
  && getFiuuOpaPilotBranches().has(normalizedBranchCode);
}
