import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 createAdminClient: vi.fn(),
 getCurrentProfile: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentProfile: mocks.getCurrentProfile }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import { GET } from './route';

const PROFILE = {
 id: '11111111-1111-4111-8111-111111111111',
 organization_id: '22222222-2222-4222-8222-222222222222',
 role: 'FINANCE',
};

function adminWithRows(rows: Record<string, unknown>[]) {
 const eq = vi.fn();
 const query = {
 select: vi.fn(),
 eq,
 order: vi.fn(),
 limit: vi.fn(async () => ({ data: rows, error: null })),
 };
 query.select.mockReturnValue(query);
 eq.mockReturnValue(query);
 query.order.mockReturnValue(query);
 return { admin: { from: vi.fn(() => query) }, query };
}

describe('GET /api/finance/fiuu-vt-reviews', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 mocks.getCurrentProfile.mockResolvedValue(PROFILE);
 });

 it('returns only the organization-scoped unresolved quarantine queue and redacts secrets', async () => {
 const { admin, query } = adminWithRows([{
 id: '33333333-3333-4333-8333-333333333333',
 amount_rm: 2.5,
 status: 'QUARANTINED',
 provider_order_id: 'RKJ_ORDER_1',
 created_at: '2026-11-21T10:00:00.000Z',
 fiuu_vt_provider_error_code: 'STATUS_TIMEOUT',
 fiuu_vt_provider_error_count: 3,
 fiuu_vt_provider_error_at: '2026-11-21T10:10:00.000Z',
 fiuu_vt_reconciliation_state: 'PROVIDER_ERROR_REVIEW',
 fiuu_vt_review_evidence: { reason: 'timeout', secretKey: 'do-not-return' },
 provider_transaction_id: null,
 provider_result: { opType: 'VOID', errorCode: '5000', secretKey: 'not-in-summary' },
 provider_confirmed_at: null,
 provider_confirmed_by: null,
 paid_at: null,
 failed_at: null,
 transaction_id: null,
 branch: { branch_code: 'BR001', branch_name: 'Juru' },
 }]);
 mocks.createAdminClient.mockReturnValue(admin);

 const response = await GET(new Request('http://localhost/api/finance/fiuu-vt-reviews'));
 const body = await response.json();

 expect(response.status).toBe(200);
 expect(body.pending_count).toBe(1);
 expect(body.reviews[0]).toMatchObject({
 order_id: 'RKJ_ORDER_1',
 review_evidence: { reason: 'timeout', secretKey: '[DILINDUNGI]' },
 last_provider_evidence: { operation: 'VOID', error_code: '5000', status_code: null },
 });
 expect(JSON.stringify(body)).not.toContain('not-in-summary');
 expect(query.eq).toHaveBeenCalledWith('organization_id', PROFILE.organization_id);
 expect(query.eq).toHaveBeenCalledWith('provider', 'fiuu_vt');
 expect(query.eq).toHaveBeenCalledWith('status', 'QUARANTINED');
 expect(query.eq).toHaveBeenCalledWith('fiuu_vt_review_required', true);
 });

 it('rejects non-finance roles before creating a service client', async () => {
 mocks.getCurrentProfile.mockResolvedValue({ ...PROFILE, role: 'OPERATION_MANAGER' });

 const response = await GET(new Request('http://localhost/api/finance/fiuu-vt-reviews'));

 expect(response.status).toBe(403);
 expect(mocks.createAdminClient).not.toHaveBeenCalled();
 });
});
