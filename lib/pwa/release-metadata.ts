import { createHash } from 'node:crypto';
import type { ReleaseMetadata } from './release-freshness';

function normalizedCommitSha(): string {
 const value = process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? '';
 return /^[0-9a-f]{7,64}$/.test(value) ? value : 'unknown';
}

export function getReleaseMetadata(): ReleaseMetadata {
 const commitSha = normalizedCommitSha();
 const deploymentIdentity = process.env.VERCEL_DEPLOYMENT_ID?.trim()
  || process.env.VERCEL_URL?.trim()
  || process.env.RKJ_RELEASE_ID?.trim()
  || `commit:${commitSha}`;
 const releaseId = `rkj-${createHash('sha256')
  .update(deploymentIdentity)
  .digest('hex')
  .slice(0, 32)}`;
 return { releaseId, commitSha };
}
