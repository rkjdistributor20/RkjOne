-- RKJ One HRMIS: official leave balances and leave ledger for local staff.

CREATE TABLE IF NOT EXISTS public.hr_leave_balances (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE SET NULL,
 staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
 profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 leave_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
 leave_type TEXT NOT NULL CHECK (leave_type IN ('ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID', 'REPLACEMENT')),
 entitlement_days NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (entitlement_days >= 0),
 carried_forward_days NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (carried_forward_days >= 0),
 used_days NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (used_days >= 0),
 pending_days NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (pending_days >= 0),
 adjustment_days NUMERIC(8,2) NOT NULL DEFAULT 0,
 remaining_days NUMERIC(8,2) GENERATED ALWAYS AS (
  entitlement_days + carried_forward_days + adjustment_days - used_days - pending_days
 ) STORED,
 notes TEXT,
 updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, staff_id, leave_year, leave_type)
);

CREATE TABLE IF NOT EXISTS public.hr_leave_transactions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 leave_balance_id UUID REFERENCES public.hr_leave_balances(id) ON DELETE CASCADE,
 staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
 profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 hr_service_request_id UUID REFERENCES public.hr_service_requests(id) ON DELETE SET NULL,
 leave_type TEXT NOT NULL CHECK (leave_type IN ('ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID', 'REPLACEMENT')),
 transaction_type TEXT NOT NULL CHECK (
  transaction_type IN (
   'ENTITLEMENT',
   'CARRY_FORWARD',
   'ADJUSTMENT',
   'PENDING',
   'APPROVED_USAGE',
   'REJECT_RELEASE',
   'CANCEL_RELEASE'
  )
 ),
 days NUMERIC(8,2) NOT NULL,
 balance_after_days NUMERIC(8,2),
 note TEXT,
 created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_leave_balances_org_staff_year
 ON public.hr_leave_balances(organization_id, staff_id, leave_year);
CREATE INDEX IF NOT EXISTS idx_hr_leave_balances_profile
 ON public.hr_leave_balances(profile_id, leave_year);
CREATE INDEX IF NOT EXISTS idx_hr_leave_balances_company
 ON public.hr_leave_balances(legal_entity_id, leave_year);
CREATE INDEX IF NOT EXISTS idx_hr_leave_transactions_staff
 ON public.hr_leave_transactions(staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_leave_transactions_request
 ON public.hr_leave_transactions(hr_service_request_id, transaction_type);

DROP TRIGGER IF EXISTS set_updated_at ON public.hr_leave_balances;
CREATE TRIGGER set_updated_at
 BEFORE UPDATE ON public.hr_leave_balances
 FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

ALTER TABLE public.hr_leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leave_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_leave_balances_select ON public.hr_leave_balances;
CREATE POLICY hr_leave_balances_select ON public.hr_leave_balances
FOR SELECT TO authenticated USING (
 organization_id = public.organization_id()
 AND (
  profile_id = auth.uid()
  OR public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'HR', 'OPERATION_MANAGER')
  OR EXISTS (
   SELECT 1
   FROM public.staff s
   WHERE s.id = hr_leave_balances.staff_id
    AND s.branch_id IS NOT NULL
    AND public.has_branch_access(s.branch_id)
  )
 )
);

DROP POLICY IF EXISTS hr_leave_balances_manage ON public.hr_leave_balances;
CREATE POLICY hr_leave_balances_manage ON public.hr_leave_balances
FOR ALL TO authenticated USING (
 organization_id = public.organization_id()
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'HR')
) WITH CHECK (
 organization_id = public.organization_id()
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'HR')
);

DROP POLICY IF EXISTS hr_leave_transactions_select ON public.hr_leave_transactions;
CREATE POLICY hr_leave_transactions_select ON public.hr_leave_transactions
FOR SELECT TO authenticated USING (
 organization_id = public.organization_id()
 AND (
  profile_id = auth.uid()
  OR public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'HR', 'OPERATION_MANAGER')
  OR EXISTS (
   SELECT 1
   FROM public.staff s
   WHERE s.id = hr_leave_transactions.staff_id
    AND s.branch_id IS NOT NULL
    AND public.has_branch_access(s.branch_id)
  )
 )
);

DROP POLICY IF EXISTS hr_leave_transactions_manage ON public.hr_leave_transactions;
CREATE POLICY hr_leave_transactions_manage ON public.hr_leave_transactions
FOR INSERT TO authenticated WITH CHECK (
 organization_id = public.organization_id()
 AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'HR')
);

GRANT SELECT, INSERT, UPDATE ON public.hr_leave_balances TO authenticated;
GRANT SELECT, INSERT ON public.hr_leave_transactions TO authenticated;

WITH leave_defaults(leave_type, entitlement_days) AS (
 VALUES
  ('ANNUAL', 8::NUMERIC),
  ('SICK', 14::NUMERIC),
  ('EMERGENCY', 2::NUMERIC),
  ('UNPAID', 0::NUMERIC),
  ('REPLACEMENT', 0::NUMERIC)
)
INSERT INTO public.hr_leave_balances (
 organization_id,
 legal_entity_id,
 staff_id,
 profile_id,
 leave_year,
 leave_type,
 entitlement_days,
 notes
)
SELECT
 s.organization_id,
 s.legal_entity_id,
 s.id,
 s.profile_id,
 EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
 d.leave_type,
 d.entitlement_days,
 'Default HRMIS leave entitlement seeded for active local staff.'
FROM public.staff s
CROSS JOIN leave_defaults d
WHERE s.status = 'ACTIVE'
 AND s.worker_type = 'LOCAL'
ON CONFLICT (organization_id, staff_id, leave_year, leave_type) DO NOTHING;

COMMENT ON TABLE public.hr_leave_balances IS
'Official HRMIS leave balance per local staff, year and leave type. Remaining days are generated from entitlement, carry forward, adjustment, used and pending.';
COMMENT ON TABLE public.hr_leave_transactions IS
'Audit ledger for HR leave balance movements and employee leave requests.';
