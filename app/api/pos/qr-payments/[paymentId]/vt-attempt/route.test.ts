import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 assertActivePosShiftMember: vi.fn(),
 assertCanAccessPosBranch: vi.fn(),
 assertOfficialPosDevice: vi.fn(),
 createAdminClient: vi.fn(),
 getCurrentProfile: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
 getCurrentProfile: mocks.getCurrentProfile,
}));
vi.mock('@/lib/pos/access', () => ({
 assertActivePosShiftMember: mocks.assertActivePosShiftMember,
 assertCanAccessPosBranch: mocks.assertCanAccessPosBranch,
 posAccessErrorStatus: vi.fn(() => 403),
}));
vi.mock('@/lib/pos/device-auth', () => ({
 assertOfficialPosDevice: mocks.assertOfficialPosDevice,
}));
vi.mock('@/lib/pos/fiuu-vt', async () => ({
 ...await import('../../../../../../lib/pos/fiuu-vt'),
}));
vi.mock('@/lib/pos/fiuu-vt-server', () => ({
 normalizeFiuuVtBranchCode: vi.fn((value: unknown) => (
  typeof value === 'string' ? value.trim().toUpperCase() : null
 )),
}));
vi.mock('@/lib/security/rate-limit', () => ({
 enforceRateLimit: vi.fn(() => null),
}));
vi.mock('@/lib/supabase/admin', () => ({
 createAdminClient: mocks.createAdminClient,
}));

import { buildFiuuVtCallbackHost } from '../../../../../../lib/pos/fiuu-vt';
import { POST } from './route';

const PAYMENT_ID = '0122709a-a1f6-4c94-a8c7-dda63262a474';
const ATTEMPT_ID = '123e4567-e89b-42d3-a456-426614174000';
const CALLBACK_HOST = buildFiuuVtCallbackHost(ATTEMPT_ID);
const RETRY_ATTEMPT_ID = '223e4567-e89b-42d3-a456-426614174000';
const RETRY_CALLBACK_HOST = buildFiuuVtCallbackHost(RETRY_ATTEMPT_ID);
const ORDER_ID = 'RKJ_0122709AA1F64C94A8C7DDA63262A474';
const PROFILE = {
 id: '123e4567-e89b-42d3-a456-426614174111',
 organization_id: 'org-1',
};

type Row = Record<string, unknown>;
type RpcReply = {
 data: unknown;
 error: { message?: string } | null;
};
type RpcImplementation = (name: string, args: Row) => Promise<RpcReply>;

function payment(overrides: Row = {}): Row {
 return {
  id: PAYMENT_ID,
  organization_id: 'org-1',
  branch_id: 'branch-1',
  shift_id: 'shift-1',
  created_by: PROFILE.id,
  provider: 'fiuu_vt',
  status: 'PENDING',
  amount_rm: 2.5,
  sale_payload: {
   fiuu_branch_code: 'BR001',
   fiuu_device_id: 'device-1',
   fiuu_device_code: 'POS-BR001-TEST',
   fiuu_enrollment_generation: 1,
  },
  provider_order_id: ORDER_ID,
  provider_transaction_id: 'TX-FIUU-1',
  provider_sale_reported_at: new Date().toISOString(),
  fiuu_vt_review_required: false,
  ...overrides,
 };
}

function leaseAttempt(
 opType: 'SALE' | 'STATUS' | 'VOID',
 overrides: Row = {},
): Row {
 return {
  id: ATTEMPT_ID,
  callback_host: CALLBACK_HOST,
  expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  op_type: opType,
  state: 'LAUNCHED',
  lease_generation: 1,
  lease_expires_at: new Date(Date.now() + 25_000).toISOString(),
  ...overrides,
 };
}

function launchDecision(
 opType: 'SALE' | 'STATUS' | 'VOID',
 overrides: Row = {},
): RpcReply {
 return {
  data: {
   outcome: 'LAUNCH',
   attempt: leaseAttempt(opType, overrides),
   reused: Number(overrides.lease_generation ?? 1) > 1,
   reason: 'NEW_ATTEMPT',
  },
  error: null,
 };
}

function activeDecision(
 opType: 'SALE' | 'STATUS' | 'VOID',
 overrides: Row = {},
): RpcReply {
 return {
  data: {
   outcome: 'ACTIVE',
   active_operation: leaseAttempt(opType, overrides),
   retry_after_ms: 25_000,
   reason: 'LAUNCH_LEASE_ACTIVE',
  },
  error: null,
 };
}

function makeAdmin(
 rpcImplementation: RpcImplementation,
 initialPayment: Row = payment(),
) {
 const rpc = vi.fn(rpcImplementation);
 const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  maybeSingle: vi.fn(async () => ({ data: { ...initialPayment }, error: null })),
 };
 const admin = {
  from: vi.fn((table: string) => {
   if (table !== 'pos_online_payments') throw new Error(`Unexpected table ${table}`);
   return query;
  }),
  rpc,
 };
 return { admin, rpc };
}

function request(opType: 'SALE' | 'STATUS' | 'VOID') {
 return new Request('http://localhost/vt-attempt', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ op_type: opType }),
 });
}

async function invoke(opType: 'SALE' | 'STATUS' | 'VOID') {
 return POST(request(opType), {
  params: Promise.resolve({ paymentId: PAYMENT_ID }),
 });
}

describe('Fiuu VT launch retry leases', () => {
 beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentProfile.mockResolvedValue(PROFILE);
  mocks.assertOfficialPosDevice.mockResolvedValue({
   id: 'device-1',
   deviceCode: 'POS-BR001-TEST',
   branchCode: 'BR001',
   enrollmentGeneration: 1,
  });
  mocks.assertCanAccessPosBranch.mockResolvedValue(undefined);
  mocks.assertActivePosShiftMember.mockResolvedValue(undefined);
 });

 it('claims a server-side lease before allowing a provider STATUS launch', async () => {
  const { admin, rpc } = makeAdmin(async () => launchDecision('STATUS'));
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke('STATUS');
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toMatchObject({
   attempt: {
    id: ATTEMPT_ID,
    callback_host: CALLBACK_HOST,
    op_type: 'STATUS',
    lease_generation: 1,
   },
   reused: false,
   retry_lease: { generation: 1 },
  });
  expect(rpc).toHaveBeenCalledTimes(1);
  const [name, args] = rpc.mock.calls[0] as [string, Row];
  expect(name).toBe('claim_pos_fiuu_vt_launch_lease');
  expect(args).toMatchObject({
   p_payment_id: PAYMENT_ID,
   p_op_type: 'STATUS',
   p_actor_id: PROFILE.id,
  });
  expect(args.p_callback_host).toBe(buildFiuuVtCallbackHost(String(args.p_attempt_id)));
 });

 it('returns one launch and one deterministic active response for concurrent retries', async () => {
  let leaseGranted = false;
  const { admin } = makeAdmin(async () => {
   if (!leaseGranted) {
    leaseGranted = true;
    await Promise.resolve();
    return launchDecision('STATUS');
   }
   return activeDecision('STATUS');
  });
  mocks.createAdminClient.mockReturnValue(admin);

  const responses = await Promise.all([invoke('STATUS'), invoke('STATUS')]);
  const statuses = responses.map((response) => response.status).sort();
  const bodies = await Promise.all(responses.map((response) => response.json()));

  expect(statuses).toEqual([200, 409]);
  expect(bodies.filter((body) => body.mode === 'FIUU_VT_OPERATION_ACTIVE')).toHaveLength(1);
  expect(bodies.every((body) => (
   body.attempt?.id === ATTEMPT_ID || body.active_operation?.id === ATTEMPT_ID
  ))).toBe(true);
 });

 it('rotates to a fresh STATUS callback identity after the bounded lease expires', async () => {
  let call = 0;
  const { admin } = makeAdmin(async () => {
   call += 1;
   if (call === 1) return launchDecision('STATUS');
   if (call === 2) return activeDecision('STATUS');
   return launchDecision('STATUS', {
    id: RETRY_ATTEMPT_ID,
    callback_host: RETRY_CALLBACK_HOST,
    lease_generation: 1,
    lease_expires_at: new Date(Date.now() + 25_000).toISOString(),
   });
  });
  mocks.createAdminClient.mockReturnValue(admin);

  const first = await invoke('STATUS');
  const blocked = await invoke('STATUS');
  const retry = await invoke('STATUS');
  const firstBody = await first.json();
  const blockedBody = await blocked.json();
  const retryBody = await retry.json();

  expect(first.status).toBe(200);
  expect(blocked.status).toBe(409);
  expect(blockedBody).toMatchObject({
   mode: 'FIUU_VT_OPERATION_ACTIVE',
   retry_after_ms: 25_000,
  });
  expect(retry.status).toBe(200);
  expect(retryBody).toMatchObject({
   reused: false,
   attempt: {
    id: RETRY_ATTEMPT_ID,
    callback_host: RETRY_CALLBACK_HOST,
    op_type: 'STATUS',
    lease_generation: 1,
   },
  });
  expect(retryBody.attempt.id).not.toBe(firstBody.attempt.id);
  expect(retryBody.attempt.callback_host).not.toBe(firstBody.attempt.callback_host);
 });

 it.each([
  ['STATUS', 'VOID'],
  ['VOID', 'STATUS'],
 ] as const)(
  'arbitrates requested %s behind active %s without launching another operation',
  async (requested, active) => {
   const { admin } = makeAdmin(async () => activeDecision(active, {
    lease_generation: 3,
   }));
   mocks.createAdminClient.mockReturnValue(admin);

   const response = await invoke(requested);

   expect(response.status).toBe(409);
   expect(await response.json()).toMatchObject({
    mode: 'FIUU_VT_OPERATION_ACTIVE',
    active_operation: { op_type: active, id: ATTEMPT_ID },
   });
  },
 );

 it('never converts a prior SALE into another provider launch', async () => {
  const { admin } = makeAdmin(async () => ({
   data: { outcome: 'STATUS_REQUIRED' },
   error: null,
  }), payment({
   provider_transaction_id: null,
   provider_sale_reported_at: null,
  }));
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke('SALE');

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
   mode: 'FIUU_VT_STATUS_REQUIRED',
  });
 });

 it('keeps a callback-owned RECEIVED attempt fail-closed', async () => {
  const { admin } = makeAdmin(async () => activeDecision('STATUS', {
   state: 'RECEIVED',
   lease_generation: 0,
   lease_expires_at: null,
  }));
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke('STATUS');

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
   mode: 'FIUU_VT_OPERATION_ACTIVE',
   active_operation: { state: 'RECEIVED' },
  });
 });

 it('fails closed when the lease RPC returns a malformed operation', async () => {
  const { admin } = makeAdmin(async () => ({
   data: { outcome: 'LAUNCH', attempt: { id: 'not-an-attempt' } },
   error: null,
  }));
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke('STATUS');

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
   error: 'Respons lease pelancaran Fiuu VT tidak sah',
  });
 });
});

describe('Fiuu VT retry lease database contract', () => {
 const leaseMigration = readFileSync(
  resolve(
   process.cwd(),
   'supabase/migrations/20261112140000_arbitrate_fiuu_vt_retry_leases.sql',
  ),
  'utf8',
 );
 const rotationMigration = readFileSync(
  resolve(
   process.cwd(),
   'supabase/migrations/20261112160000_rotate_fiuu_vt_retry_callback_identity.sql',
  ),
  'utf8',
 );
 const attemptRoute = readFileSync(
  resolve(process.cwd(), 'app/api/pos/qr-payments/[paymentId]/vt-attempt/route.ts'),
  'utf8',
 );
 const resultRoute = readFileSync(
  resolve(process.cwd(), 'app/api/pos/qr-payments/[paymentId]/vt-result/route.ts'),
  'utf8',
 );

 it('serializes claims and bounds missing-callback retry to at most 25 seconds', () => {
  expect(leaseMigration).toContain('claim_pos_fiuu_vt_launch_lease');
  expect(rotationMigration).toContain('FOR UPDATE');
  expect(leaseMigration).toContain("interval '25 seconds'");
  expect(rotationMigration).toContain("'reason', 'MISSING_CALLBACK_ROTATED'");
  expect(attemptRoute).toContain("'claim_pos_fiuu_vt_launch_lease'");
 });

 it('enforces one STATUS-or-VOID reconciliation operation per payment', () => {
  const reconciliationIndex = leaseMigration.match(
   /CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_fiuu_vt_attempts_one_active_reconciliation[\s\S]*?;/,
  )?.[0];
  expect(reconciliationIndex).toContain('ON public.pos_fiuu_vt_attempts(payment_id)');
  expect(reconciliationIndex).toContain("op_type IN ('STATUS', 'VOID')");
  expect(reconciliationIndex).toContain("state IN ('PREPARED', 'LAUNCHED', 'RECEIVED')");
  expect(leaseMigration).toContain("'reason', 'OPERATION_CONFLICT'");
 });

 it('expires the old lease before inserting a retry with a fresh callback identity', () => {
  expect(rotationMigration).toContain("SET state = 'EXPIRED'");
  expect(rotationMigration).toContain('expires_at = LEAST(expires_at, v_now)');
  expect(rotationMigration).toContain("state IN ('PREPARED', 'LAUNCHED')");
  expect(rotationMigration).toContain('launch_lease_expires_at <= v_now');
  expect(rotationMigration).toContain('claim_pos_fiuu_vt_launch_lease_reused_identity(');
  expect(rotationMigration).toContain("'reused', false");
  expect(rotationMigration).not.toContain('launch_lease_generation = launch_lease_generation + 1');
 });

 it('keeps superseded callback identities processable and preserves lifecycle states', () => {
  expect(rotationMigration).not.toContain('DELETE FROM public.pos_fiuu_vt_attempts');
  expect(rotationMigration).not.toContain('SUPERSEDED');
  expect(rotationMigration).toContain("SET state = 'EXPIRED'");
  expect(resultRoute).toContain("['PREPARED', 'LAUNCHED', 'EXPIRED']");
  expect(attemptRoute).toContain("action: 'MARK_LAUNCHED' | 'ABANDON_UNLAUNCHED'");
  expect(attemptRoute).toContain(".eq('state', 'PREPARED')");
  expect(attemptRoute).toContain("['LAUNCHED', 'RECEIVED', 'CONSUMED']");
 });
});
