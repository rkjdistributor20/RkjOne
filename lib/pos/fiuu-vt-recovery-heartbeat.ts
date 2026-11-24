import { createAdminClient } from '../supabase/admin';

export const FIUU_VT_RECOVERY_HEARTBEAT_MAX_AGE_SECONDS = 180;

type HeartbeatClient = Pick<ReturnType<typeof createAdminClient>, 'rpc'>;

export async function recordFiuuVtRecoverySuccess(
 service?: HeartbeatClient,
): Promise<boolean> {
 try {
  const client = service ?? createAdminClient();
  const { data, error } = await client.rpc('record_pos_fiuu_vt_recovery_success');
  return !error && typeof data === 'string' && data.length > 0;
 } catch {
  return false;
 }
}

export async function hasRecentFiuuVtRecoverySuccess(
 service?: HeartbeatClient,
 maxAgeSeconds = FIUU_VT_RECOVERY_HEARTBEAT_MAX_AGE_SECONDS,
): Promise<boolean> {
 if (!Number.isInteger(maxAgeSeconds)
  || maxAgeSeconds < 30
  || maxAgeSeconds > 600) return false;

 try {
  const client = service ?? createAdminClient();
  const { data, error } = await client.rpc(
   'has_recent_pos_fiuu_vt_recovery_success',
   { p_max_age_seconds: maxAgeSeconds },
  );
  return !error && data === true;
 } catch {
  return false;
 }
}
