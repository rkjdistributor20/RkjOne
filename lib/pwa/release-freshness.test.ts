import { describe, expect, it } from 'vitest';
import {
 compareReleaseMetadata,
 isReleaseReloadSafe,
 isKnownPosActivityMarkerKey,
 parseOfflineQueueEntryCount,
 parseReleaseMetadata,
 POS_ACTIVE_MARKER_PREFIXES,
 type ReleaseMetadata,
 type ReleaseReloadSafety,
} from './release-freshness';

const currentRelease: ReleaseMetadata = {
 releaseId: 'rkj-11111111111111111111111111111111',
 commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

const safeState: ReleaseReloadSafety = {
 cartItemCount: 0,
 activeMarkerCount: 0,
 offlineQueueEntryCount: 0,
 storageReadable: true,
 documentVisible: true,
 online: true,
};

describe('release freshness comparison', () => {
 it('treats the same deployment and commit as unchanged', () => {
  expect(compareReleaseMetadata(currentRelease, { ...currentRelease })).toBe('same');
 });

 it('detects a redeployment even when the commit is unchanged', () => {
  expect(compareReleaseMetadata(currentRelease, {
   ...currentRelease,
   releaseId: 'rkj-22222222222222222222222222222222',
  })).toBe('different');
 });

 it('detects a changed commit and rejects malformed metadata', () => {
  expect(compareReleaseMetadata(currentRelease, {
   ...currentRelease,
   commitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  })).toBe('different');
  expect(compareReleaseMetadata(currentRelease, { releaseId: '', commitSha: 'secret' }))
   .toBe('invalid');
  expect(parseReleaseMetadata(null)).toBeNull();
 });
});

describe('release reload safety predicate', () => {
 it('allows a reload only for a visible, online and fully idle POS', () => {
  expect(isReleaseReloadSafe(safeState)).toBe(true);
 });

 it.each([
  ['non-empty cart', { cartItemCount: 1 }],
  ['active payment marker', { activeMarkerCount: 1 }],
  ['unsent offline sale', { offlineQueueEntryCount: 1 }],
  ['invalid offline queue', { offlineQueueEntryCount: null }],
  ['unreadable storage', { storageReadable: false }],
  ['hidden document', { documentVisible: false }],
  ['offline document', { online: false }],
 ] as const)('blocks a reload for %s', (_label, override) => {
  expect(isReleaseReloadSafe({ ...safeState, ...override })).toBe(false);
 });

 it('recognizes every durable POS payment marker and ignores unrelated keys', () => {
  for (const prefix of POS_ACTIVE_MARKER_PREFIXES) {
   expect(isKnownPosActivityMarkerKey(`${prefix}branch-or-shift`)).toBe(true);
  }
  expect(isKnownPosActivityMarkerKey('rkj-unrelated-setting')).toBe(false);
 });

 it('treats malformed queue state as unsafe instead of silently empty', () => {
  expect(parseOfflineQueueEntryCount(null)).toBe(0);
  expect(parseOfflineQueueEntryCount('[]')).toBe(0);
  expect(parseOfflineQueueEntryCount('[{"offlineId":"sale-1"}]')).toBe(1);
  expect(parseOfflineQueueEntryCount('{"offlineId":"sale-1"}')).toBeNull();
  expect(parseOfflineQueueEntryCount('not-json')).toBeNull();
 });
});
