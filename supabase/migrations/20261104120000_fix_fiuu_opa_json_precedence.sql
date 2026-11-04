-- Repair JSON extraction precedence in the Fiuu OPA configuration fingerprint.
--
-- PostgreSQL binds the JSON `->>` operator more loosely than the adjacent
-- text concatenation in these PL/pgSQL bodies.  Without explicit parentheses,
-- the runtime expression can be parsed as `text ->> key` and fail before an
-- issued payment is reconciled or fulfilled.  The affected rollout migration
-- is already installed in staging, so this is deliberately a forward-only
-- repair instead of rewriting migration history.
--
-- No rollout row, payment, receipt, stock row, branch, device or credential is
-- inserted or changed here.  CREATE OR REPLACE preserves the existing function
-- identities, owners, grants and trigger attachments.

BEGIN;

DO $repair$
DECLARE
  v_target REGPROCEDURE;
  v_definition TEXT;
  v_fixed_definition TEXT;
  v_targets REGPROCEDURE[] := ARRAY[
    'public.guard_pos_fiuu_opa_payment_identity()'::REGPROCEDURE,
    'public.claim_pos_fiuu_opa_inquiry(uuid,uuid,integer)'::REGPROCEDURE,
    'public.complete_pos_fiuu_opa_inquiry(uuid,uuid,text,text,jsonb,text)'::REGPROCEDURE,
    'public.report_pos_fiuu_payment(uuid,text,numeric,text,text,text,jsonb)'::REGPROCEDURE,
    'public.fulfill_pos_fiuu_payment(uuid,text,numeric,text,text)'::REGPROCEDURE,
    'public.report_pos_fiuu_opa_inquiry_success(uuid,uuid,text,numeric,text,text,text,jsonb,jsonb)'::REGPROCEDURE
  ];
BEGIN
  FOREACH v_target IN ARRAY v_targets LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_target);

    -- Parenthesize every sale_payload text extraction in the target body.  This
    -- is intentionally broader than the failing digest line: the parentheses
    -- are semantically neutral elsewhere and prevent the same precedence bug
    -- from being reintroduced by a neighbouring concatenation.
    v_fixed_definition := pg_catalog.regexp_replace(
      v_definition,
      $pattern$([A-Za-z_][A-Za-z0-9_]*\.sale_payload\s*->>\s*'[^']+')$pattern$,
      $replacement$(\1)$replacement$,
      'g'
    );

    IF v_fixed_definition IS NOT DISTINCT FROM v_definition THEN
      RAISE EXCEPTION
        'Fiuu OPA precedence repair found no JSON extraction in %',
        v_target::TEXT;
    END IF;

    IF v_fixed_definition ~
      $pattern$\|\|\s*[A-Za-z_][A-Za-z0-9_]*\.sale_payload\s*->>$pattern$ THEN
      RAISE EXCEPTION
        'Fiuu OPA precedence repair left an unparenthesized concatenation in %',
        v_target::TEXT;
    END IF;

    EXECUTE v_fixed_definition;
  END LOOP;
END
$repair$;

COMMIT;
