export type ReleaseMetadata = {
 releaseId: string;
 commitSha: string;
};

export type ReleaseComparison = 'same' | 'different' | 'invalid';

export type ReleaseReloadSafety = {
 cartItemCount: number;
 activeMarkerCount: number;
 offlineQueueEntryCount: number | null;
 storageReadable: boolean;
 documentVisible: boolean;
 online: boolean;
};

export const POS_ACTIVE_MARKER_PREFIXES = [
 'rkj-pos-active-qr:',
 'rkj-pos-fiuu-vt-deferred-finalization:',
 'rkj-pos-fiuu-vt-cashier-release:',
 'rkj-pos-fiuu-vt-native-cleanup:',
] as const;

export const POS_OFFLINE_QUEUE_STORAGE_KEY = 'rkj-pos-offline-queue';

const RELEASE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{7,127}$/i;
const COMMIT_SHA_PATTERN = /^(?:[0-9a-f]{7,64}|unknown)$/i;

export function isKnownPosActivityMarkerKey(key: string): boolean {
 return POS_ACTIVE_MARKER_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function parseOfflineQueueEntryCount(raw: string | null): number | null {
 if (raw === null) return 0;
 try {
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.length : null;
 } catch {
  return null;
 }
}

export function parseReleaseMetadata(value: unknown): ReleaseMetadata | null {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
 const releaseId = Reflect.get(value, 'releaseId');
 const commitSha = Reflect.get(value, 'commitSha');
 if (typeof releaseId !== 'string'
  || typeof commitSha !== 'string'
  || !RELEASE_ID_PATTERN.test(releaseId)
  || !COMMIT_SHA_PATTERN.test(commitSha)) return null;
 return { releaseId, commitSha: commitSha.toLowerCase() };
}

export function compareReleaseMetadata(
 current: ReleaseMetadata,
 candidateValue: unknown,
): ReleaseComparison {
 const candidate = parseReleaseMetadata(candidateValue);
 const normalizedCurrent = parseReleaseMetadata(current);
 if (!candidate || !normalizedCurrent) return 'invalid';
 return candidate.releaseId === normalizedCurrent.releaseId
  && candidate.commitSha === normalizedCurrent.commitSha
  ? 'same'
  : 'different';
}

export function isReleaseReloadSafe(state: ReleaseReloadSafety): boolean {
 return state.storageReadable
  && state.documentVisible
  && state.online
  && state.cartItemCount === 0
  && state.activeMarkerCount === 0
  && state.offlineQueueEntryCount === 0;
}
