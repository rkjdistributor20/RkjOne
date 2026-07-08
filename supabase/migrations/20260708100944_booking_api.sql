-- RKJ One: Booking API backend
-- API-only booking records; no UI changes.

CREATE TABLE IF NOT EXISTS public.bookings (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
 created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 booking_number TEXT NOT NULL,
 booking_type TEXT NOT NULL DEFAULT 'GENERAL'
  CHECK (booking_type IN ('GENERAL', 'CUSTOMER', 'EVENT', 'MAINTENANCE', 'SALES_AGENT', 'DELIVERY', 'OTHER')),
 status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')),
 priority TEXT NOT NULL DEFAULT 'NORMAL'
  CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
 title TEXT NOT NULL,
 description TEXT,
 customer_name TEXT,
 customer_phone TEXT,
 customer_email TEXT,
 scheduled_date DATE NOT NULL,
 scheduled_time TIME,
 expected_pax INTEGER CHECK (expected_pax IS NULL OR expected_pax >= 0),
 source TEXT NOT NULL DEFAULT 'API',
 notes TEXT,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 confirmed_at TIMESTAMPTZ,
 cancelled_at TIMESTAMPTZ,
 completed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, booking_number)
);

CREATE INDEX IF NOT EXISTS idx_bookings_org_date
 ON public.bookings(organization_id, scheduled_date DESC, scheduled_time DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_branch_date
 ON public.bookings(branch_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status
 ON public.bookings(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_created_by
 ON public.bookings(created_by, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.bookings;
CREATE TRIGGER set_updated_at
 BEFORE UPDATE ON public.bookings
 FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bookings_select_scope ON public.bookings;
CREATE POLICY bookings_select_scope ON public.bookings
FOR SELECT USING (
 organization_id = public.organization_id()
 AND (
  created_by = auth.uid()
  OR public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY', 'MAINTENANCE_MANAGER')
  OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id))
 )
);

DROP POLICY IF EXISTS bookings_insert_scope ON public.bookings;
CREATE POLICY bookings_insert_scope ON public.bookings
FOR INSERT WITH CHECK (
 organization_id = public.organization_id()
 AND created_by = auth.uid()
 AND public.user_role() IN (
  'SUPER_ADMIN',
  'ADMIN',
  'OPERATION_MANAGER',
  'HR',
  'FINANCE',
  'CEO_FACTORY',
  'MAINTENANCE_MANAGER',
  'AREA_MANAGER',
  'STAFF',
  'SALES_AGENT'
 )
 AND (
  branch_id IS NULL
  OR public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY', 'MAINTENANCE_MANAGER')
  OR public.has_branch_access(branch_id)
 )
);

DROP POLICY IF EXISTS bookings_update_scope ON public.bookings;
CREATE POLICY bookings_update_scope ON public.bookings
FOR UPDATE USING (
 organization_id = public.organization_id()
 AND (
  public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY', 'MAINTENANCE_MANAGER')
  OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id))
  OR (created_by = auth.uid() AND status IN ('PENDING', 'CONFIRMED'))
 )
) WITH CHECK (
 organization_id = public.organization_id()
 AND (
  branch_id IS NULL
  OR public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY', 'MAINTENANCE_MANAGER')
  OR public.has_branch_access(branch_id)
 )
);

GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;

COMMENT ON TABLE public.bookings IS 'API-only booking records for RKJ One backend workflows.';
