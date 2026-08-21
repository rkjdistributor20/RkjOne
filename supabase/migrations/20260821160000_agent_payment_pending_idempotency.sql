-- Prevent duplicate simultaneous gateway sessions for one agent order/subscription.
-- Historical rows are preserved. The migration deliberately fails if staging has
-- unresolved duplicate PENDING rows so Finance can reconcile them first.

DO $$
BEGIN
 IF EXISTS (
 SELECT 1
 FROM public.agent_online_payments
 WHERE status = 'PENDING'
 GROUP BY organization_id, agent_account_id, purpose, reference_id
 HAVING count(*) > 1
 ) THEN
 RAISE EXCEPTION
 'Duplicate PENDING agent payments exist; reconcile them before applying idempotency index';
 END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_online_payments_pending_reference
 ON public.agent_online_payments (
 organization_id,
 agent_account_id,
 purpose,
 reference_id
 )
 WHERE status = 'PENDING';

