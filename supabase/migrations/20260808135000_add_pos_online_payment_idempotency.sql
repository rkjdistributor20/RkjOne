-- One client QR attempt must map to at most one payment intent per organization.

ALTER TABLE public.pos_online_payments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.pos_online_payments
  ADD CONSTRAINT pos_online_payments_idempotency_key_format
  CHECK (
    idempotency_key IS NULL
    OR idempotency_key ~ '^[A-Za-z0-9_-]{16,64}$'
  );

CREATE UNIQUE INDEX pos_online_payments_organization_idempotency_unique
  ON public.pos_online_payments (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
