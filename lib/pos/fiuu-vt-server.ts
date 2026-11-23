import { getPosQrPaymentMode } from './fiuu';

export const FIUU_VT_PREVIEW_LATE_RECOVERY_MS = 24 * 60 * 60 * 1000;

export const FIUU_VT_BRANCH_CODE_PATTERN = /^BR(00[1-9]|0[12]\d|03[0-6])$/;

export function normalizeFiuuVtBranchCode(value: unknown): string | null {
 if (typeof value !== 'string') return null;
 const branchCode = value.trim().toUpperCase();
 return FIUU_VT_BRANCH_CODE_PATTERN.test(branchCode) ? branchCode : null;
}

export function getFiuuVtBranches(): ReadonlySet<string> {
 const configuredBranches = process.env.POS_FIUU_VT_BRANCHES;
 if (!configuredBranches?.trim()) return new Set();

 const branches = new Set<string>();
 for (const raw of configuredBranches.split(',')) {
  const branchCode = normalizeFiuuVtBranchCode(raw);
  if (!branchCode) {
   const redacted = raw.trim().toUpperCase().slice(0, 12) || '(kosong)';
   throw new Error(`Kod cawangan Fiuu VT tidak sah: ${redacted}`);
  }
  if (branches.has(branchCode)) {
   throw new Error(`Kod cawangan Fiuu VT berulang: ${branchCode}`);
  }
  branches.add(branchCode);
 }
 return branches;
}

export function getFiuuVtCashierReleaseBranches(): ReadonlySet<string> {
 const configuredBranches = process.env.POS_FIUU_VT_CASHIER_RELEASE_BRANCHES;
 if (!configuredBranches?.trim()) return new Set();

 const branches = new Set<string>();
 for (const raw of configuredBranches.split(',')) {
  const branchCode = normalizeFiuuVtBranchCode(raw);
  if (!branchCode) {
   const redacted = raw.trim().toUpperCase().slice(0, 12) || '(kosong)';
   throw new Error(`Kod cawangan pelepasan kaunter Fiuu VT tidak sah: ${redacted}`);
  }
  if (branches.has(branchCode)) {
   throw new Error(`Kod cawangan pelepasan kaunter Fiuu VT berulang: ${branchCode}`);
  }
  branches.add(branchCode);
 }
 return branches;
}

// Preserve the original export for older server modules while the rollout
// moves from one pilot branch to an explicit per-branch allowlist.
export const getFiuuVtPilotBranches = getFiuuVtBranches;

export function isFiuuVtEnabledForBranch(branchCode: string): boolean {
 const normalizedBranchCode = normalizeFiuuVtBranchCode(branchCode);
 if (!normalizedBranchCode) return false;

 return getPosQrPaymentMode() === 'fiuu_vt'
  && getFiuuVtBranches().has(normalizedBranchCode);
}

export function isFiuuVtCashierReleaseRuntimeReady(): boolean {
 // Cashier release creates a detached PENDING payment that must be recovered
 // independently of the tablet. Require the dedicated gate (no legacy
 // fallback) and the Vercel Cron bearer secret before advertising the flow.
 return process.env.FIUU_VT_RECOVERY_ENABLED?.trim().toLowerCase() === 'true'
  && (process.env.CRON_SECRET ?? '').trim().length >= 32;
}

export function isFiuuVtCashierReleaseEnabledForBranch(branchCode: string): boolean {
 const normalizedBranchCode = normalizeFiuuVtBranchCode(branchCode);
 if (!normalizedBranchCode) return false;

 return isFiuuVtCashierReleaseRuntimeReady()
  && isFiuuVtEnabledForBranch(normalizedBranchCode)
  && getFiuuVtCashierReleaseBranches().has(normalizedBranchCode);
}

export function getFiuuVtValiditySeconds(): number {
 const value = Number(process.env.POS_FIUU_VT_VALIDITY_SECONDS ?? 180);
 return Number.isInteger(value) && value >= 60 && value <= 3600 ? value : 180;
}

export function getFiuuVtLateRecoveryMs(): number {
 // This exception exists only for Preview UAT, where a paid native SALE
 // may need to be re-attached after the WebView/session was replaced. Production
 // remains on the normal bounded callback grace.
 return process.env.VERCEL_ENV === 'preview'
  ? FIUU_VT_PREVIEW_LATE_RECOVERY_MS
  : 0;
}
