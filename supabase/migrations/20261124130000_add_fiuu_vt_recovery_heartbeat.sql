-- Prove that the dedicated Fiuu VT recovery scheduler is actually completing
-- successful runs before cashier release is advertised or first committed.
-- The singleton contains no credential material and is accessible only to the
-- service role through the two narrowly scoped RPCs below.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

CREATE TABLE IF NOT EXISTS public.pos_fiuu_vt_recovery_heartbeat (
  worker_name TEXT PRIMARY KEY,
  last_success_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pos_fiuu_vt_recovery_heartbeat_worker_check
    CHECK (worker_name = 'fiuu_vt_recovery')
);

ALTER TABLE public.pos_fiuu_vt_recovery_heartbeat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_fiuu_vt_recovery_heartbeat FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pos_fiuu_vt_recovery_heartbeat FROM PUBLIC;
REVOKE ALL ON TABLE public.pos_fiuu_vt_recovery_heartbeat FROM anon;
REVOKE ALL ON TABLE public.pos_fiuu_vt_recovery_heartbeat FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pos_fiuu_vt_recovery_heartbeat TO service_role;

CREATE OR REPLACE FUNCTION public.record_pos_fiuu_vt_recovery_success()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  INSERT INTO public.pos_fiuu_vt_recovery_heartbeat (
    worker_name,
    last_success_at,
    updated_at
  ) VALUES (
    'fiuu_vt_recovery',
    v_now,
    v_now
  )
  ON CONFLICT (worker_name) DO UPDATE
  SET last_success_at = EXCLUDED.last_success_at,
      updated_at = EXCLUDED.updated_at;

  RETURN v_now;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_recent_pos_fiuu_vt_recovery_success(
  p_max_age_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_max_age_seconds IS NULL
      OR p_max_age_seconds < 30
      OR p_max_age_seconds > 600 THEN FALSE
    ELSE COALESCE((
      SELECT heartbeat.last_success_at >= clock_timestamp()
        - make_interval(secs => p_max_age_seconds)
        AND heartbeat.last_success_at <= clock_timestamp() + interval '30 seconds'
      FROM public.pos_fiuu_vt_recovery_heartbeat AS heartbeat
      WHERE heartbeat.worker_name = 'fiuu_vt_recovery'
    ), FALSE)
  END;
$$;

REVOKE ALL ON FUNCTION public.record_pos_fiuu_vt_recovery_success() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_pos_fiuu_vt_recovery_success() FROM anon;
REVOKE ALL ON FUNCTION public.record_pos_fiuu_vt_recovery_success() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_pos_fiuu_vt_recovery_success() TO service_role;

REVOKE ALL ON FUNCTION public.has_recent_pos_fiuu_vt_recovery_success(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_recent_pos_fiuu_vt_recovery_success(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.has_recent_pos_fiuu_vt_recovery_success(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_recent_pos_fiuu_vt_recovery_success(INTEGER) TO service_role;

COMMENT ON TABLE public.pos_fiuu_vt_recovery_heartbeat IS
  'Service-role-only latest successful Fiuu VT recovery-worker heartbeat.';
COMMENT ON FUNCTION public.record_pos_fiuu_vt_recovery_success() IS
  'Records a heartbeat only after a successful bounded Fiuu VT recovery run.';
COMMENT ON FUNCTION public.has_recent_pos_fiuu_vt_recovery_success(INTEGER) IS
  'Fails closed unless the worker heartbeat is recent within a bounded 30-600 second window.';
