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

import { createHash } from 'node:crypto';
import { buildFiuuVtCallbackHost } from '../../../../../../lib/pos/fiuu-vt';
import { POST } from './route';

const PAYMENT_ID = '0122709a-a1f6-4c94-a8c7-dda63262a474';
const ORDER_ID = 'RKJ_0122709AA1F64C94A8C7DDA63262A474';
const TRANSACTION_ID = 'TX-FIUU-1';
const ATTEMPT_ID = '123e4567-e89b-42d3-a456-426614174000';
const CALLBACK_HOST = buildFiuuVtCallbackHost(ATTEMPT_ID);
const PROFILE = {
 id: 'user-1',
 organization_id: 'org-1',
};

type Row = Record<string, unknown>;

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
  provider_transaction_id: null,
  provider_result: null,
  provider_sale_reported_at: new Date().toISOString(),
  provider_status_checked_at: null,
  fiuu_vt_review_required: false,
  fiuu_vt_reconciliation_state: null,
  ...overrides,
 };
}

function attempt(overrides: Row = {}): Row {
 return {
  id: ATTEMPT_ID,
  payment_id: PAYMENT_ID,
  provider_order_id: ORDER_ID,
  op_type: 'STATUS',
  callback_host: CALLBACK_HOST,
  state: 'PREPARED',
  result_fingerprint: null,
  result_json: null,
  processing_lease_token: null,
  processing_lease_expires_at: null,
  processing_lease_generation: 0,
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  ...overrides,
 };
}

function callback(
 opType: 'SALE' | 'STATUS' | 'VOID',
 status: string,
 overrides: Row = {},
): Row {
 return {
  callbackAttemptId: ATTEMPT_ID,
  callbackHost: CALLBACK_HOST,
  callbackValidation: 'MATCHED',
  opType,
  orderId: ORDER_ID,
  tranID: TRANSACTION_ID,
  status,
  amount: '2.50',
  currency: 'MYR',
  channel: 'RPP_DuitNowQR-Offline',
  payDate: status === '00' ? '2026-11-12 09:00:00' : null,
  ...overrides,
 };
}

function callbackFingerprint(result: Row): string {
 const safeResult = {
  callbackAttemptId: result.callbackAttemptId,
  callbackHost: result.callbackHost,
  opType: result.opType,
  orderId: result.orderId,
  transactionId: result.tranID,
  status: result.status,
  amountRm: Number(result.amount),
  currency: result.currency,
  channel: result.channel,
  payDate: result.payDate,
 };
 return createHash('sha256').update(JSON.stringify(safeResult), 'utf8').digest('hex');
}

function makeAdmin(
 initialPayment: Row = payment(),
 initialAttempt: Row | null = attempt(),
) {
 const state = {
  payment: { ...initialPayment } as Row | null,
  attempt: initialAttempt ? { ...initialAttempt } as Row : null,
  paymentUpdates: [] as Row[],
  attemptUpdates: [] as Row[],
  rpcCalls: [] as Array<{ name: string; args: Row }>,
 };

 function query(table: 'pos_online_payments' | 'pos_fiuu_vt_attempts') {
  let updateValue: Row | null = null;
  let executed = false;
  const filters: Array<(row: Row) => boolean> = [];

  const api = {
   select: vi.fn(() => api),
   update: vi.fn((value: Row) => {
    updateValue = value;
    return api;
   }),
   eq: vi.fn((field: string, value: unknown) => {
    filters.push((row) => row[field] === value);
    return api;
   }),
   in: vi.fn((field: string, values: unknown[]) => {
    filters.push((row) => values.includes(row[field]));
    return api;
   }),
   maybeSingle: vi.fn(() => execute()),
   then: (
    onFulfilled: (value: { data: Row | null; error: null }) => unknown,
    onRejected?: (reason: unknown) => unknown,
   ) => execute().then(onFulfilled, onRejected),
  };

  async function execute(): Promise<{ data: Row | null; error: null }> {
   if (executed) throw new Error('Supabase query executed twice');
   executed = true;
   const key = table === 'pos_online_payments' ? 'payment' : 'attempt';
   const row = state[key];
   if (!row || !filters.every((filter) => filter(row))) {
    return { data: null, error: null };
   }
   if (updateValue) {
    Object.assign(row, updateValue);
    (table === 'pos_online_payments'
     ? state.paymentUpdates
     : state.attemptUpdates).push({ ...updateValue });
   }
   return { data: { ...row }, error: null };
  }

  return api;
 }

 const admin = {
  from: vi.fn((table: 'pos_online_payments' | 'pos_fiuu_vt_attempts') => query(table)),
  rpc: vi.fn(async (name: string, args: Row) => {
   state.rpcCalls.push({ name, args: { ...args } });
   if (name === 'claim_pos_fiuu_vt_callback_processing') {
    const current = state.attempt;
    if (!current
     || current.id !== args.p_attempt_id
     || current.payment_id !== args.p_payment_id) {
     return { data: { outcome: 'NOT_FOUND' }, error: null };
    }
    if (current.state === 'CONSUMED') {
     return {
      data: current.result_fingerprint === args.p_result_fingerprint
       ? { outcome: 'CONSUMED' }
       : { outcome: 'CONFLICT', existing_result: current.result_json },
      error: null,
     };
    }
    if (current.state === 'RECEIVED') {
     if (current.result_fingerprint !== args.p_result_fingerprint) {
      return {
       data: { outcome: 'CONFLICT', existing_result: current.result_json },
       error: null,
      };
     }
     const leaseExpiresAt = typeof current.processing_lease_expires_at === 'string'
      ? Date.parse(current.processing_lease_expires_at)
      : Number.NaN;
     if (current.processing_lease_token && leaseExpiresAt > Date.now()) {
      return {
       data: {
        outcome: 'ACTIVE',
        retry_after_ms: Math.max(0, leaseExpiresAt - Date.now()),
       },
       error: null,
      };
     }
     const resumedUpdate = {
      processing_lease_token: args.p_processing_token,
      processing_lease_expires_at: new Date(Date.now() + 30_000).toISOString(),
      processing_lease_generation: Number(current.processing_lease_generation ?? 0) + 1,
     };
     Object.assign(current, resumedUpdate);
     state.attemptUpdates.push(resumedUpdate);
     return { data: { outcome: 'CLAIMED', resumed: true }, error: null };
    }
    const claimable = current.state === 'PREPARED'
     || current.state === 'LAUNCHED'
     || (current.state === 'EXPIRED' && args.p_allow_expired === true);
    if (!claimable) {
     return { data: { outcome: 'INELIGIBLE' }, error: null };
    }
    const claimedUpdate = {
     state: 'RECEIVED',
     result_fingerprint: args.p_result_fingerprint,
     result_json: args.p_result_json,
     received_at: new Date().toISOString(),
     processing_lease_token: args.p_processing_token,
     processing_lease_expires_at: new Date(Date.now() + 30_000).toISOString(),
     processing_lease_generation: Number(current.processing_lease_generation ?? 0) + 1,
    };
    Object.assign(current, claimedUpdate);
    state.attemptUpdates.push(claimedUpdate);
    return { data: { outcome: 'CLAIMED', resumed: false }, error: null };
   }
   if (name === 'complete_pos_fiuu_vt_callback_processing') {
    const current = state.attempt;
    if (!current
     || current.id !== args.p_attempt_id
     || current.payment_id !== args.p_payment_id) {
     return { data: { outcome: 'NOT_FOUND' }, error: null };
    }
    if (current.state === 'CONSUMED'
     && current.result_fingerprint === args.p_result_fingerprint) {
     return { data: { outcome: 'COMPLETED', already_completed: true }, error: null };
    }
    if (current.state !== 'RECEIVED'
     || current.result_fingerprint !== args.p_result_fingerprint
     || current.processing_lease_token !== args.p_processing_token) {
     return { data: { outcome: 'LOST_LEASE' }, error: null };
    }
    const completedUpdate = {
     state: 'CONSUMED',
     consumed_at: new Date().toISOString(),
     processing_lease_token: null,
     processing_lease_expires_at: null,
    };
    Object.assign(current, completedUpdate);
    state.attemptUpdates.push(completedUpdate);
    return { data: { outcome: 'COMPLETED', already_completed: false }, error: null };
   }
   if (name !== 'mark_pos_fiuu_vt_review'
    || !state.payment
    || state.payment.id !== args.p_payment_id) {
    return { data: null, error: { message: 'RPC not found' } };
   }
   const reviewUpdate = {
    fiuu_vt_review_required: true,
    fiuu_vt_reconciliation_state: args.p_state,
    fiuu_vt_reconciliation_evidence: args.p_evidence,
   };
   Object.assign(state.payment, reviewUpdate);
   state.paymentUpdates.push(reviewUpdate);
   return {
    data: {
     source_payment_id: state.payment.id,
     source_state: args.p_state,
    },
    error: null,
   };
  }),
 };
 return { admin, state };
}

function request(result: Row) {
 return new Request('http://localhost/vt-result', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ result }),
 });
}

async function invoke(result: Row) {
 return POST(request(result), {
  params: Promise.resolve({ paymentId: PAYMENT_ID }),
 });
}

describe('Fiuu VT one-time callback reconciliation', () => {
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

 it('releases an expired QR immediately from authoritative STATUS=55', async () => {
  const { admin, state } = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('STATUS', '55'));

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
   payment: { id: PAYMENT_ID, status: 'EXPIRED' },
   next_action: 'COMPLETE',
  });
  expect(state.payment).toMatchObject({ status: 'EXPIRED' });
  expect(state.attempt).toMatchObject({ state: 'CONSUMED' });
 });

 it('never treats VOID=00 as payment success', async () => {
  const { admin, state } = makeAdmin(payment(), attempt({ op_type: 'VOID' }));
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('VOID', '00'));

  expect(await response.json()).toMatchObject({
   payment: { status: 'PENDING' },
   next_action: 'CHECK_STATUS',
  });
  expect(state.payment).toMatchObject({ status: 'PENDING' });
  expect(state.paymentUpdates[0]).not.toHaveProperty('status');
 });

 it('stores STATUS=00 as durable REPORTED evidence', async () => {
  const { admin, state } = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('STATUS', '00'));

  expect(await response.json()).toMatchObject({
   payment: { status: 'REPORTED' },
   next_action: 'AUTO_CONFIRMATION',
  });
  expect(state.payment).toMatchObject({
   status: 'REPORTED',
   provider_transaction_id: TRANSACTION_ID,
   provider_result: expect.objectContaining({
    callbackAttemptId: ATTEMPT_ID,
    callbackHost: CALLBACK_HOST,
    opType: 'STATUS',
    status: '00',
   }),
  });
  expect(state.attempt).toMatchObject({ state: 'CONSUMED' });
 });

 it('accepts an authentic matching STATUS=00 just after attempt expiry', async () => {
  const { admin, state } = makeAdmin(
   payment(),
   attempt({
    state: 'EXPIRED',
    expires_at: new Date(Date.now() - 10_000).toISOString(),
   }),
  );
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('STATUS', '00'));

  expect(await response.json()).toMatchObject({
   payment: { id: PAYMENT_ID, status: 'REPORTED' },
   next_action: 'AUTO_CONFIRMATION',
  });
  expect(state.payment).toMatchObject({
   status: 'REPORTED',
   provider_transaction_id: TRANSACTION_ID,
   fiuu_vt_review_required: false,
  });
  expect(state.attempt).toMatchObject({
   state: 'CONSUMED',
   result_fingerprint: expect.any(String),
  });
  expect(state.rpcCalls.filter((call) => call.name === 'mark_pos_fiuu_vt_review')).toHaveLength(0);
 });

 it('quarantines STATUS=00 beyond the bounded late-callback grace', async () => {
  const { admin, state } = makeAdmin(
   payment(),
   attempt({
    state: 'EXPIRED',
    expires_at: new Date(Date.now() - (2 * 60 * 1000 + 1_000)).toISOString(),
   }),
  );
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('STATUS', '00'));

  expect(await response.json()).toMatchObject({
   payment: { status: 'PENDING' },
   next_action: 'ACK_AND_QUARANTINE',
  });
  expect(state.payment).toMatchObject({
   status: 'PENDING',
   fiuu_vt_review_required: true,
   fiuu_vt_reconciliation_state: 'LATE_SUCCESS_REVIEW',
  });
  expect(state.attempt).toMatchObject({ state: 'QUARANTINED' });
 });

 it('requires native MATCHED validation for late STATUS=00 recovery', async () => {
  const { admin, state } = makeAdmin(
   payment(),
   attempt({
    state: 'EXPIRED',
    expires_at: new Date(Date.now() - 10_000).toISOString(),
   }),
  );
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('STATUS', '00', {
   callbackValidation: undefined,
  }));

  expect((await response.json()).next_action).toBe('ACK_AND_QUARANTINE');
  expect(state.payment).toMatchObject({
   status: 'PENDING',
   fiuu_vt_review_required: true,
  });
  expect(state.attempt).toMatchObject({ state: 'QUARANTINED' });
 });

 it('quarantines a late STATUS=00 whose amount does not match', async () => {
  const { admin, state } = makeAdmin(
   payment(),
   attempt({
    state: 'EXPIRED',
    expires_at: new Date(Date.now() - 10_000).toISOString(),
   }),
  );
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('STATUS', '00', { amount: '2.51' }));

  expect((await response.json()).next_action).toBe('ACK_AND_QUARANTINE');
  expect(state.payment).toMatchObject({
   status: 'PENDING',
   fiuu_vt_review_required: true,
   fiuu_vt_reconciliation_state: 'FOREIGN_CALLBACK_REVIEW',
  });
  expect(state.attempt).toMatchObject({ state: 'QUARANTINED' });
 });

 it('quarantines a late callback whose order identity does not match', async () => {
  const { admin, state } = makeAdmin(
   payment(),
   attempt({
    state: 'EXPIRED',
    expires_at: new Date(Date.now() - 10_000).toISOString(),
   }),
  );
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('STATUS', '00', {
   orderId: 'RKJ_FOREIGN_ORDER_0001',
  }));

  expect((await response.json()).next_action).toBe('ACK_AND_QUARANTINE');
  expect(state.payment).toMatchObject({
   status: 'PENDING',
   fiuu_vt_review_required: true,
   fiuu_vt_reconciliation_state: 'FOREIGN_CALLBACK_REVIEW',
  });
  expect(state.attempt).toMatchObject({ state: 'QUARANTINED' });
 });

 it('quarantines a stale non-success callback without changing payment status', async () => {
  const { admin, state } = makeAdmin(
   payment(),
   attempt({
    state: 'EXPIRED',
    expires_at: new Date(Date.now() - 10_000).toISOString(),
   }),
  );
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('STATUS', '44'));

  expect(await response.json()).toMatchObject({
   payment: { status: 'PENDING' },
   next_action: 'ACK_AND_QUARANTINE',
  });
  expect(state.payment).toMatchObject({
   status: 'PENDING',
   fiuu_vt_review_required: false,
  });
  expect(state.attempt).toMatchObject({ state: 'QUARANTINED' });
  expect(state.rpcCalls).toHaveLength(0);
 });

 it('does not process an exact replay while the first request owns RECEIVED', async () => {
  const result = callback('STATUS', '00');
  const { admin, state } = makeAdmin(
   payment(),
   attempt({
    state: 'RECEIVED',
    result_fingerprint: callbackFingerprint(result),
    result_json: result,
    processing_lease_token: '123e4567-e89b-42d3-a456-426614174111',
    processing_lease_expires_at: new Date(Date.now() + 30_000).toISOString(),
    processing_lease_generation: 1,
   }),
  );
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(result);

  expect(response.status).toBe(409);
  expect(state.payment).toMatchObject({ status: 'PENDING' });
  expect(state.paymentUpdates).toHaveLength(0);
  expect(state.attempt).toMatchObject({ state: 'RECEIVED' });
 });

 it('resumes an exact RECEIVED callback after its processing lease expires', async () => {
  const result = callback('STATUS', '00');
  const { admin, state } = makeAdmin(
   payment(),
   attempt({
    state: 'RECEIVED',
    result_fingerprint: callbackFingerprint(result),
    result_json: result,
    processing_lease_token: '123e4567-e89b-42d3-a456-426614174222',
    processing_lease_expires_at: new Date(Date.now() - 1_000).toISOString(),
    processing_lease_generation: 1,
   }),
  );
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(result);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
   payment: { status: 'REPORTED' },
   next_action: 'AUTO_CONFIRMATION',
  });
  expect(state.payment).toMatchObject({ status: 'REPORTED' });
  expect(state.attempt).toMatchObject({
   state: 'CONSUMED',
   processing_lease_generation: 2,
   processing_lease_token: null,
  });
  expect(state.rpcCalls.map((call) => call.name)).toEqual([
   'claim_pos_fiuu_vt_callback_processing',
   'complete_pos_fiuu_vt_callback_processing',
  ]);
 });

 it('finishes a stale RECEIVED attempt after payment evidence was already persisted', async () => {
  const result = callback('STATUS', '00');
  const { admin, state } = makeAdmin(
   payment({ status: 'REPORTED', provider_transaction_id: TRANSACTION_ID }),
   attempt({
    state: 'RECEIVED',
    result_fingerprint: callbackFingerprint(result),
    result_json: result,
    processing_lease_token: '123e4567-e89b-42d3-a456-426614174333',
    processing_lease_expires_at: new Date(Date.now() - 1_000).toISOString(),
    processing_lease_generation: 1,
   }),
  );
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(result);

  expect(await response.json()).toMatchObject({
   payment: { status: 'REPORTED' },
   next_action: 'ACK_ONLY',
  });
  expect(state.paymentUpdates).toHaveLength(0);
  expect(state.attempt).toMatchObject({
   state: 'CONSUMED',
   processing_lease_generation: 2,
  });
 });

 it('acknowledges an exact replay without mutating payment twice', async () => {
  const result = callback('STATUS', '22');
  const { admin, state } = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);

  const firstResponse = await invoke(result);
  expect((await firstResponse.json()).next_action).toBe('CHECK_STATUS_LATER');
  const paymentMutationCount = state.paymentUpdates.length;

  const secondResponse = await invoke(result);
  expect(await secondResponse.json()).toMatchObject({
   payment: { status: 'PENDING' },
   next_action: 'ACK_ONLY',
  });
  expect(state.paymentUpdates).toHaveLength(paymentMutationCount);
 });

 it('quarantines a conflicting replay and preserves prior success', async () => {
  const first = callback('STATUS', '00');
  const { admin, state } = makeAdmin(
   payment({ status: 'REPORTED', provider_transaction_id: TRANSACTION_ID }),
   attempt({
    state: 'CONSUMED',
    result_fingerprint: callbackFingerprint(first),
    result_json: first,
   }),
  );
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('STATUS', '44'));

  expect(await response.json()).toMatchObject({
   payment: { status: 'REPORTED' },
   next_action: 'ACK_AND_QUARANTINE',
  });
  expect(state.payment).toMatchObject({
   status: 'REPORTED',
   fiuu_vt_review_required: true,
   fiuu_vt_reconciliation_state: 'FOREIGN_CALLBACK_REVIEW',
  });
  expect(state.attempt).toMatchObject({ state: 'QUARANTINED' });
 });

 it('quarantines a callback whose server attempt is unknown', async () => {
  const { admin, state } = makeAdmin(payment(), null);
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('STATUS', '22'));

  expect(await response.json()).toMatchObject({
   payment: { status: 'PENDING' },
   next_action: 'ACK_AND_QUARANTINE',
  });
  expect(state.payment).toMatchObject({
   status: 'PENDING',
   fiuu_vt_review_required: true,
   fiuu_vt_reconciliation_state: 'FOREIGN_CALLBACK_REVIEW',
  });
 });

 it('quarantines a native callback-host mismatch', async () => {
  const { admin, state } = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('STATUS', '22', {
   callbackValidation: 'MISMATCH',
  }));

  expect((await response.json()).next_action).toBe('ACK_AND_QUARANTINE');
  expect(state.payment).toMatchObject({
   fiuu_vt_review_required: true,
   fiuu_vt_reconciliation_state: 'FOREIGN_CALLBACK_REVIEW',
  });
  expect(state.attempt).toMatchObject({ state: 'QUARANTINED' });
 });

 it('records a bridge error and leaves recovery on STATUS', async () => {
  const errorResult = {
   callbackAttemptId: ATTEMPT_ID,
   callbackHost: CALLBACK_HOST,
   callbackValidation: 'MATCHED',
   kind: 'ERROR',
   opType: 'STATUS',
   orderId: ORDER_ID,
   errorCode: 'FIUU_TIMEOUT',
   errorMessage: 'No callback received',
  };
  const { admin, state } = makeAdmin();
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(errorResult);

  expect(await response.json()).toMatchObject({
   payment: { status: 'PENDING' },
   next_action: 'CHECK_STATUS_LATER',
  });
  expect(state.payment).toMatchObject({ status: 'PENDING' });
  expect(state.attempt).toMatchObject({ state: 'CONSUMED' });
 });

 it('preserves PAID and flags a later VOID for reversal review', async () => {
  const { admin, state } = makeAdmin(
   payment({ status: 'PAID', provider_transaction_id: TRANSACTION_ID }),
   attempt({ op_type: 'VOID' }),
  );
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('VOID', '44'));

  expect(await response.json()).toMatchObject({
   payment: { status: 'PAID' },
   next_action: 'ACK_AND_QUARANTINE',
  });
  expect(state.payment).toMatchObject({
   status: 'PAID',
   fiuu_vt_review_required: true,
   fiuu_vt_reconciliation_state: 'REVERSAL_REVIEW',
  });
 });

 it('flags even a just-expired success when the payment was already closed', async () => {
  const { admin, state } = makeAdmin(
   payment({ status: 'EXPIRED' }),
   attempt({
    state: 'EXPIRED',
    expires_at: new Date(Date.now() - 10_000).toISOString(),
   }),
  );
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('STATUS', '00'));

  expect(await response.json()).toMatchObject({
   payment: { status: 'EXPIRED' },
   next_action: 'ACK_AND_QUARANTINE',
  });
  expect(state.payment).toMatchObject({
   status: 'EXPIRED',
   fiuu_vt_review_required: true,
   fiuu_vt_reconciliation_state: 'LATE_SUCCESS_REVIEW',
  });
 });

 it('acknowledges duplicate success on REPORTED without triggering fulfilment again', async () => {
  const { admin, state } = makeAdmin(
   payment({ status: 'REPORTED', provider_transaction_id: TRANSACTION_ID }),
   attempt(),
  );
  mocks.createAdminClient.mockReturnValue(admin);

  const response = await invoke(callback('STATUS', '00'));

  expect(await response.json()).toMatchObject({
   payment: { status: 'REPORTED' },
   next_action: 'ACK_ONLY',
  });
  expect(state.paymentUpdates).toHaveLength(0);
  expect(state.attempt).toMatchObject({ state: 'CONSUMED' });
 });
});
