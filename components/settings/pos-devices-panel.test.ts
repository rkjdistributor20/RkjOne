import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/badge', () => ({ Badge: () => null }));
vi.mock('@/components/ui/button', () => ({ Button: () => null }));
vi.mock('@/components/ui/input', () => ({ Input: () => null }));
vi.mock('@/components/ui/label', () => ({ Label: () => null }));
vi.mock('@/lib/pos/official-tablets', () => ({
  matchOfficialTablet: () => ({ state: 'UNKNOWN', label: 'Tidak diketahui' }),
  POS_OFFICIAL_TABLETS: {},
}));

import { formatHostAppVersion } from './pos-devices-panel';

describe('formatHostAppVersion', () => {
  it('renders versionName and versionCode together for rollout verification', () => {
    expect(formatHostAppVersion({ versionName: '1.8.5', versionCode: 23 })).toBe('1.8.5 (23)');
  });

  it('keeps partial legacy reports useful', () => {
    expect(formatHostAppVersion({ versionName: '1.8.5', versionCode: null })).toBe('1.8.5');
    expect(formatHostAppVersion({ versionName: null, versionCode: 23 })).toBe('Kod 23');
    expect(formatHostAppVersion(null)).toBeNull();
  });
});
