import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFiuuVtAttempt, createPosQrPayment, PosQrPaymentError } from './api';
import type { CreateSalePayload } from './types';

afterEach(() => {
 vi.unstubAllGlobals();
});

describe('POS API client', () => {
 it('uses same-origin credentials for QR payment requests', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
   new Response(JSON.stringify({
    payment: {
     id: 'payment-1',
     status: 'PENDING',
     amount_rm: 2.5,
     qr_image_url: null,
     gateway_ref: null,
     expires_at: null,
     environment: 'sandbox',
     integration: 'vt_app',
     provider_order_id: null,
     reused: false,
    },
   }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);

  await createPosQrPayment({} as CreateSalePayload, 'idempotency-1');

  expect(fetchMock).toHaveBeenCalledWith(
   '/api/pos/qr-payments',
   expect.objectContaining({
    method: 'POST',
    credentials: 'same-origin',
    body: JSON.stringify({ idempotency_key: 'idempotency-1' }),
   }),
  );
 });

 it('preserves the QR mode and HTTP status for structured provider errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
   new Response(JSON.stringify({
    error: 'QR dinamik belum tersedia',
    mode: 'MANUAL_QR_ONLY',
   }), { status: 409 }),
  ));

  const request = createPosQrPayment({} as CreateSalePayload, 'idempotency-2');

  await expect(request).rejects.toMatchObject({
   name: 'PosQrPaymentError',
   message: 'QR dinamik belum tersedia',
   status: 409,
   mode: 'MANUAL_QR_ONLY',
  });
  await expect(request).rejects.toBeInstanceOf(PosQrPaymentError);
 });

 it('preserves the exact active VOID attempt for crash-safe cashier release recovery', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
   new Response(JSON.stringify({
    error: 'Operasi VOID Fiuu VT masih aktif',
    mode: 'FIUU_VT_OPERATION_ACTIVE',
    retry_after_ms: 1_500,
    active_operation: {
     id: '11111111-1111-4111-8111-111111111111',
     callback_host: 'https://callback.example.test',
     expires_at: '2026-11-23T05:00:00.000Z',
     op_type: 'VOID',
     state: 'LAUNCHED',
     lease_generation: 3,
    },
   }), { status: 409 }),
  ));

  await expect(createFiuuVtAttempt('payment-1', 'VOID')).rejects.toMatchObject({
   name: 'PosQrPaymentError',
   status: 409,
   mode: 'FIUU_VT_OPERATION_ACTIVE',
   retryAfterMs: 1_500,
   activeOperation: {
    id: '11111111-1111-4111-8111-111111111111',
    callbackHost: 'https://callback.example.test',
    opType: 'VOID',
    state: 'LAUNCHED',
    generation: 3,
   },
  });
 });
});
