import { getFiuuOpaConfig, getPosQrPaymentMode, type FiuuOpaScope } from './fiuu';

// Kept for compatibility with the BR001-only reconciliation implementation.
export const FIUU_OPA_PILOT_BRANCH = 'BR001' as const;

const BRANCH_CODE_PATTERN = /^BR(?:00[1-9]|0[12]\d|03[0-6])$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBranchCode(branchCode: string): string {
 return branchCode.trim().toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
 return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getFiuuOpaMappedTargets(): ReadonlyMap<string, FiuuOpaScope> {
 const raw = process.env.POS_FIUU_APPLICATIONS_JSON?.trim();
 if (!raw) return new Map();

 let parsed: unknown;
 try {
  parsed = JSON.parse(raw);
 } catch {
  throw new Error('POS_FIUU_APPLICATIONS_JSON bukan JSON yang sah');
 }
 if (!isRecord(parsed)) throw new Error('POS_FIUU_APPLICATIONS_JSON mesti objek');

 const targets = new Map<string, FiuuOpaScope>();
 for (const [rawBranchCode, value] of Object.entries(parsed)) {
  const branchCode = normalizeBranchCode(rawBranchCode);
  if (rawBranchCode.trim() !== rawBranchCode || !BRANCH_CODE_PATTERN.test(branchCode)) {
   throw new Error(`Kod pemetaan cawangan Fiuu OPA tidak sah: ${branchCode.slice(0, 12) || '(kosong)'}`);
  }
  if (targets.has(branchCode)) {
   throw new Error(`Pemetaan cawangan Fiuu OPA berulang: ${branchCode}`);
  }
  if (!isRecord(value)) throw new Error(`Konfigurasi Fiuu ${branchCode} tidak sah`);
  const organizationId = typeof value.organizationId === 'string'
   ? value.organizationId.trim().toLowerCase()
   : '';
  const branchId = typeof value.branchId === 'string'
   ? value.branchId.trim().toLowerCase()
   : '';
  if (!UUID_PATTERN.test(organizationId) || !UUID_PATTERN.test(branchId)) {
   throw new Error(`Organization ID atau Branch ID Fiuu ${branchCode} tidak sah`);
  }
  targets.set(branchCode, { organizationId, branchId, branchCode });
 }
 return targets;
}

export function getFiuuOpaPilotBranches(): ReadonlySet<string> {
 const configuredBranches = process.env.POS_FIUU_OPA_BRANCHES;
 if (!configuredBranches?.trim()) return new Set();

 const branches = new Set<string>();
 for (const raw of configuredBranches.split(',')) {
  const branchCode = normalizeBranchCode(raw);
  if (!branchCode || !BRANCH_CODE_PATTERN.test(branchCode)) {
   throw new Error(`Kod cawangan pilot Fiuu OPA tidak sah: ${branchCode.slice(0, 12) || '(kosong)'}`);
  }
  branches.add(branchCode);
 }
 return branches;
}

function getValidatedFiuuOpaTargets(): ReadonlyMap<string, FiuuOpaScope> {
 const allowedBranches = getFiuuOpaPilotBranches();
 if (allowedBranches.size === 0) return new Map();
 const mappedTargets = getFiuuOpaMappedTargets();
 const configuredTargets = new Map<string, FiuuOpaScope>();

 for (const branchCode of allowedBranches) {
  const target = mappedTargets.get(branchCode);
  if (!target) throw new Error(`Pemetaan Fiuu OPA ${branchCode} tiada`);
  if (!getFiuuOpaConfig(target, { requireActiveMode: false })) {
   throw new Error(`Konfigurasi Fiuu OPA ${branchCode} tidak lengkap`);
  }
  configuredTargets.set(branchCode, target);
 }
 return configuredTargets;
}

export function isFiuuOpaConfiguredForBranch(scope: FiuuOpaScope): boolean {
 const normalizedBranchCode = normalizeBranchCode(scope.branchCode);
 if (!BRANCH_CODE_PATTERN.test(normalizedBranchCode)) return false;
 if (!getFiuuOpaPilotBranches().has(normalizedBranchCode)) return false;
 const mapped = getValidatedFiuuOpaTargets().get(normalizedBranchCode);
 if (!mapped
  || mapped.organizationId !== scope.organizationId.trim().toLowerCase()
  || mapped.branchId !== scope.branchId.trim().toLowerCase()) return false;
 return true;
}

export function getFiuuOpaConfiguredTargets(): readonly FiuuOpaScope[] {
 return [...getValidatedFiuuOpaTargets().values()];
}

export function getFiuuOpaConfiguredBranches(): readonly string[] {
 return getFiuuOpaConfiguredTargets().map((target) => target.branchCode);
}

export function isFiuuOpaEnabledForBranch(scope: FiuuOpaScope): boolean {
 if (getPosQrPaymentMode() !== 'fiuu') return false;

 return isFiuuOpaConfiguredForBranch(scope);
}
