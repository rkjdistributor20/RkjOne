import { getPosQrPaymentMode } from './fiuu';

export const FIUU_CLOUDECR_APP_PACKAGE = 'com.fiuu.cloudecrvt' as const;
export const FIUU_CLOUDECR_PILOT_BRANCH = 'BR001' as const;

const BRANCH_CODE_PATTERN = /^BR\d{3}$/;

export function getFiuuCloudEcrPilotBranches(): ReadonlySet<string> {
 const branches = new Set<string>();
 for (const raw of (process.env.POS_FIUU_CLOUDECR_BRANCHES ?? '').split(',')) {
  const branchCode = raw.trim().toUpperCase();
  if (!branchCode) continue;
  if (!BRANCH_CODE_PATTERN.test(branchCode)) {
   throw new Error(`Kod cawangan pilot Fiuu cloudECR tidak sah: ${branchCode.slice(0, 12)}`);
  }
  if (branchCode !== FIUU_CLOUDECR_PILOT_BRANCH) {
   throw new Error(`Pilot Fiuu cloudECR dikunci kepada ${FIUU_CLOUDECR_PILOT_BRANCH}`);
  }
  branches.add(branchCode);
 }
 return branches;
}

export function isFiuuCloudEcrEnabledForBranch(branchCode: string): boolean {
 return getPosQrPaymentMode() === 'fiuu_cloudecr'
  && getFiuuCloudEcrPilotBranches().has(branchCode.trim().toUpperCase());
}

export function getFiuuCloudEcrValiditySeconds(): number {
 const value = Number(process.env.POS_FIUU_CLOUDECR_VALIDITY_SECONDS ?? 180);
 return Number.isInteger(value) && value >= 90 && value <= 900 ? value : 180;
}
