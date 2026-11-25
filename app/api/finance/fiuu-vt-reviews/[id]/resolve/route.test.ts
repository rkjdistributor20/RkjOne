import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 createAdminClient: vi.fn(),
 getCurrentProfile: vi.fn(),
 rpc: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentProfile: mocks.getCurrentProfile }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import { POST } from './route';

const PROFILE = {
 id: '11111111-1111-4111-8111-111111111111',
 organization_id: '22222222-2222-4222-8222-222222222222',
 role: 'FINANCE',
};
const PAYMENT_ID = '33333333-3333-4333-8333-333333333333';

function invoke(body: Record<string, unknown>, id = PAYMENT_ID) {
 return POST(new Request('http://localhost/resolve', {
 method: 'POST',
 body: JSON.stringify(body),
 }), { params: Promise.resolve({ id }) });
}

describe('POST /api/finance/fiuu-vt-reviews/[id]/resolve', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 mocks.getCurrentProfile.mockResolvedValue(PROFILE);
 mocks.rpc.mockResolvedValue({ data: { status: 'PAID' }, error: null });
 mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
 });

 it('requires a provider transaction ID before confirming a charge', async () => {
 const response = await invoke({
 outcome: 'CONFIRMED_CHARGED',
 notes: 'Disemak pada portal Fiuu.',
 });

 expect(response.status).toBe(400);
 expect(mocks.rpc).not.toHaveBeenCalled();
 });

 it('calls the service-role resolution RPC with the authenticated actor', async () => {
 const response = await invoke({
 outcome: 'CONFIRMED_CHARGED',
 providerTransactionId: 'FIUU-TX-12345',
 notes: 'Disemak pada portal Fiuu oleh pegawai HQ.',
 });

 expect(response.status).toBe(200);
 expect(mocks.rpc).toHaveBeenCalledWith('resolve_pos_fiuu_vt_review_for_shift', {
 p_payment_id: PAYMENT_ID,
 p_actor_id: PROFILE.id,
 p_outcome: 'CONFIRMED_CHARGED',
 p_provider_transaction_id: 'FIUU-TX-12345',
 p_notes: 'Disemak pada portal Fiuu oleh pegawai HQ.',
 });
 });

 it('rejects unauthorized roles before creating a service client', async () => {
 mocks.getCurrentProfile.mockResolvedValue({ ...PROFILE, role: 'STAFF' });

 const response = await invoke({
 outcome: 'CONFIRMED_NOT_CHARGED',
 notes: 'Tiada caj ditemui pada portal Fiuu.',
 });

 expect(response.status).toBe(403);
 expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });
});
