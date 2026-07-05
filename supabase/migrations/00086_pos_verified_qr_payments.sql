CREATE TABLE IF NOT EXISTS pos_online_payments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 shift_id UUID NOT NULL REFERENCES pos_shifts(id) ON DELETE CASCADE,
 amount_rm NUMERIC(12,2) NOT NULL CHECK (amount_rm > 0),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED')),
 provider TEXT NOT NULL DEFAULT 'billplz',
 gateway_ref TEXT,
 checkout_url TEXT,
 sale_payload JSONB NOT NULL,
 transaction_id UUID REFERENCES pos_transactions(id) ON DELETE SET NULL,
 paid_at TIMESTAMPTZ,
 failed_at TIMESTAMPTZ,
 created_by UUID REFERENCES profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_online_payments_branch
 ON pos_online_payments(organization_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_online_payments_gateway
 ON pos_online_payments(provider, gateway_ref);
CREATE INDEX IF NOT EXISTS idx_pos_online_payments_status
 ON pos_online_payments(status, created_at DESC);

ALTER TABLE pos_online_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_online_payments_branch ON pos_online_payments;
CREATE POLICY pos_online_payments_branch ON pos_online_payments FOR ALL USING (
 organization_id = public.organization_id()
 AND (
 public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'OPERATION_MANAGER', 'AREA_MANAGER')
 OR public.has_branch_access(branch_id)
 )
) WITH CHECK (
 organization_id = public.organization_id()
 AND (
 public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'OPERATION_MANAGER', 'AREA_MANAGER')
 OR public.has_branch_access(branch_id)
 )
);
