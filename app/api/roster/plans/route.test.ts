import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 profile: vi.fn(), scope: vi.fn(), rpc: vi.fn(), load: vi.fn(), from: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ getCurrentProfile: mocks.profile }));
vi.mock('@/lib/auth/branch-scope', () => ({ resolveScopedBranches: mocks.scope }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock('@/lib/roster/queries', () => ({ loadRosterPlanner: mocks.load }));
vi.mock('@/lib/roster/server', () => import('../../../../lib/roster/server'));

import { GET, POST } from './route';
import { POST as publish } from './[id]/publish/route';

const PROFILE = { id: 'am', role: 'AREA_MANAGER', organization_id: 'org' };
const BRANCH = '10000000-0000-4000-8000-000000000001';
const PLAN = '10000000-0000-4000-8000-000000000002';
const STAFF = '10000000-0000-4000-8000-000000000003';
const WEEK = '2026-11-23';
const requestUrl = 'http://localhost/api/roster/plans';
const body = { branch_id: BRANCH, week_start: WEEK };
const entry = { staff_id: STAFF, day_index: 6, is_off: false, scheduled_start: '22:00', scheduled_end: '06:00' };
const save = (payload: unknown) => POST(new Request(requestUrl, { method: 'POST', body: JSON.stringify(payload) }));
const read = () => GET(new Request(`${requestUrl}?branch_id=${BRANCH}&week_start=${WEEK}`));

beforeEach(() => {
 vi.resetAllMocks();
 mocks.profile.mockResolvedValue(PROFILE);
 mocks.scope.mockResolvedValue({ branchIds: [BRANCH] });
 mocks.rpc.mockResolvedValue({ data: PLAN, error: null });
});

describe('weekly planner API', () => {
 it('rejects unauthenticated and STAFF reads and writes before querying data', async () => {
  mocks.profile.mockResolvedValueOnce(null);
  expect((await read()).status).toBe(401);
  mocks.profile.mockResolvedValue({ ...PROFILE, role: 'STAFF' });
  expect((await read()).status).toBe(403);
  expect((await save(body)).status).toBe(403);
  expect(mocks.scope).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
 });

 it('loads a missing week without creating a plan and scopes staff data to the branch and tenant', async () => {
  mocks.load.mockResolvedValue({ plan: null, staff: [], templates: [] });
  const response = await read();
  expect(await response.json()).toEqual({ plan: null, staff: [], templates: [] });
  expect(mocks.scope).toHaveBeenCalledWith(expect.anything(), PROFILE, BRANCH);
  expect(mocks.load).toHaveBeenCalledWith(expect.anything(), 'org', BRANCH, WEEK);
  expect(mocks.rpc).not.toHaveBeenCalled();
 });

 it('rejects out-of-scope branch reads and saves before querying slots', async () => {
  mocks.scope.mockRejectedValue(new Error('Cawangan di luar kawasan anda'));
  expect((await read()).status).toBe(403);
  expect((await save(body)).status).toBe(403);
  expect(mocks.load).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
 });

 it('validates dates, times, duplicate slots and copy arguments', async () => {
  for (const payload of [
   { ...body, week_start: '2026-11-24' },
   { ...body, entries: [{ ...entry, scheduled_end: '24:00' }] },
   { ...body, entries: [{ ...entry, scheduled_start: null }] },
   { ...body, entries: [entry, entry] },
   { ...body, copy_from_week: WEEK },
   { ...body, copy_from_week: '2026-11-16', entries: [entry] },
  ]) expect((await save(payload)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
 });

 it('passes only planned slot fields and routes copy through the same transactional RPC', async () => {
  expect((await save({ ...body, entries: [{ ...entry, actual_start: 'do not write' }] })).status).toBe(200);
  expect(mocks.rpc).toHaveBeenLastCalledWith('save_weekly_roster', {
   p_branch_id: BRANCH, p_week_start: WEEK, p_copy_from_week: null,
   p_entries: [{ ...entry, template_id: null }],
  });
  expect((await save({ ...body, copy_from_week: '2026-11-16' })).status).toBe(200);
  expect(mocks.rpc).toHaveBeenLastCalledWith('save_weekly_roster', {
   p_branch_id: BRANCH, p_week_start: WEEK, p_copy_from_week: '2026-11-16', p_entries: [],
  });
 });

 it('surfaces the database refusal for out-of-branch staff and protected attendance slots', async () => {
  mocks.rpc.mockResolvedValueOnce({ error: { code: '42501', message: 'Staff outside branch' } })
   .mockResolvedValueOnce({ error: { code: '23505', message: 'Attendance already used' } });
  expect((await save({ ...body, entries: [entry] })).status).toBe(403);
  const result = await save({ ...body, entries: [entry] });
  expect(result.status).toBe(409);
  expect(await result.json()).toEqual({ error: 'Attendance already used' });
 });

 it('checks the stored plan branch against common scope before publishing by ID', async () => {
  const query = {
   select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
   maybeSingle: vi.fn().mockResolvedValue({ data: { branch_id: BRANCH }, error: null }),
  };
  mocks.from.mockReturnValue(query);
  mocks.scope.mockRejectedValue(new Error('Out of scope'));
  const result = await publish(new Request(requestUrl), { params: Promise.resolve({ id: PLAN }) });
  expect(result.status).toBe(403);
  expect(query.eq).toHaveBeenCalledWith('organization_id', 'org');
  expect(mocks.scope).toHaveBeenCalledWith(expect.anything(), PROFILE, BRANCH);
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
