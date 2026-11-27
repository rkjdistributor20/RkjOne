import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ profile: vi.fn(), scope: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentProfile: mocks.profile }));
vi.mock('@/lib/auth/branch-scope', () => ({ resolveScopedBranches: mocks.scope }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock('@/lib/roster/actuals', () => import('../../../../lib/roster/actuals'));
vi.mock('@/lib/roster/server', () => import('../../../../lib/roster/server'));
vi.mock('@/lib/roster/week-utils', () => import('../../../../lib/roster/week-utils'));
import { GET } from './route';

const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';
const PROFILE = { role: 'AREA_MANAGER', organization_id: 'org' };
const get = (branch = '') => GET(new Request(`http://localhost/api/area-manager/schedule-actuals?week_start=2026-11-30${branch}`));

function queryFor(data: unknown[]) {
 return {
  select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(),
  then(resolve: (result: { data: unknown[]; error: null }) => void) { resolve({ data, error: null }); },
 };
}

beforeEach(() => {
 vi.resetAllMocks();
 mocks.profile.mockResolvedValue(PROFILE);
});

it('does not query shifts for denied or empty branch scopes', async () => {
 mocks.scope.mockRejectedValueOnce(new Error('Forbidden')).mockResolvedValueOnce({ branchIds: [] });
 expect((await get(`&branch_id=${B}`)).status).toBe(403);
 expect(await (await get()).json()).toEqual({ actuals: [] });
 expect(mocks.from).not.toHaveBeenCalled();
});

it('limits actuals and comparisons to tenant/branch and uses the MYT opening window', async () => {
 mocks.scope.mockResolvedValue({ branchIds: [A, B] });
 const actuals = queryFor([{ id: 'actual', branch_id: A, staff_id: 'staff', shift_number: 'POS1',
  opened_at: '2026-11-29T18:00:00Z', closed_at: null }]);
 const planned = queryFor([{ id: 'plan', branch_id: A, staff_id: 'staff', shift_date: '2026-11-29',
  scheduled_start: '22:00', scheduled_end: '06:00' }]);
 const branches = queryFor([{ id: A, branch_code: 'BR1', branch_name: 'Branch A' }]);
 const staff = queryFor([{ id: 'staff', full_name: 'Staff A' }]);
 mocks.from.mockImplementation((table: string) => ({
  pos_operational_shifts: actuals, roster_planned_shifts: planned, branches, staff,
 })[table as 'pos_operational_shifts']);
 const response = await get();
 expect(response.status).toBe(200);
 expect(actuals.eq).toHaveBeenCalledWith('organization_id', 'org');
 expect(actuals.in).toHaveBeenCalledWith('branch_id', [A, B]);
 expect(actuals.gte).toHaveBeenCalledWith('opened_at', '2026-11-29T16:00:00.000Z');
 expect(actuals.lt).toHaveBeenCalledWith('opened_at', '2026-12-06T16:00:00.000Z');
 expect(planned.in).toHaveBeenCalledWith('branch_id', [A]);
 expect(planned.eq).toHaveBeenCalledWith('status', 'PUBLISHED');
 expect(planned.gte).toHaveBeenCalledWith('shift_date', '2026-11-29');
 expect(staff.eq).toHaveBeenCalledWith('organization_id', 'org');
 expect(await response.json()).toMatchObject({ actuals: [{
  branch_label: 'BR1 · Branch A', staff_name: 'Staff A',
  opened_at: '2026-11-29T18:00:00Z', closed_at: null, comparison: 'DIFFERENT',
  planned: { starts_at: '2026-11-29T14:00:00.000Z', ends_at: '2026-11-29T22:00:00.000Z' },
 }] });
});
