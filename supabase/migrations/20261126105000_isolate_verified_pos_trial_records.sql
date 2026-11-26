-- Reporting-only classification. No sale, payment, receipt, stock, shift or
-- finance summary is written. Non-production organizations install the
-- schema with empty markers; changed evidence in the production scope fails.
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.pos_trial_sale_markers (
  transaction_id uuid PRIMARY KEY REFERENCES public.pos_transactions(id) ON DELETE RESTRICT,
  evidence_ref text NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  marked_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
CREATE TABLE public.pos_trial_payment_markers (
  payment_id uuid PRIMARY KEY REFERENCES public.pos_online_payments(id) ON DELETE RESTRICT,
  evidence_ref text NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  marked_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
CREATE TABLE public.pos_trial_shift_markers (
  shift_id uuid PRIMARY KEY REFERENCES public.pos_shifts(id) ON DELETE RESTRICT,
  evidence_ref text NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  marked_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

ALTER TABLE public.pos_trial_sale_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_trial_payment_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_trial_shift_markers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_trial_sale_markers, public.pos_trial_payment_markers,
  public.pos_trial_shift_markers FROM PUBLIC, anon, authenticated, service_role;
-- The views only need the entity keys. Evidence notes stay restricted.
GRANT SELECT (transaction_id) ON public.pos_trial_sale_markers TO authenticated;
GRANT SELECT (payment_id) ON public.pos_trial_payment_markers TO authenticated;
GRANT SELECT (shift_id) ON public.pos_trial_shift_markers TO authenticated;
GRANT SELECT ON public.pos_trial_sale_markers, public.pos_trial_payment_markers,
  public.pos_trial_shift_markers TO service_role;

CREATE POLICY pos_trial_sale_read ON public.pos_trial_sale_markers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pos_transactions t WHERE t.id = pos_trial_sale_markers.transaction_id
  ));
CREATE POLICY pos_trial_payment_read ON public.pos_trial_payment_markers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pos_online_payments p WHERE p.id = pos_trial_payment_markers.payment_id
      AND p.organization_id = public.organization_id() AND public.has_branch_access(p.branch_id)
  ));
CREATE POLICY pos_trial_shift_read ON public.pos_trial_shift_markers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pos_shifts s WHERE s.id = pos_trial_shift_markers.shift_id
  ));

DO $seed$
DECLARE
  v_org constant uuid := '4c6a2501-151c-42b3-b63f-41ccfca29420';
  v_branch constant uuid := '88f37555-4326-4ace-963f-f5645bb60985';
  v_oct20 uuid := '238fd167-80dc-4162-9e72-5a4c40d9e623';
  v_oct21 uuid := 'ad0e0e29-3fd1-4007-b73e-321e64f3cc78';
  v_closed_shift uuid := '96331482-3acc-4d08-8521-be427a37556d';
  v_open_shift uuid := '1bce9981-6361-4a2b-a722-3dcfe940df26';
  v_ref record;
  v_entity uuid;
  v_closed_review_ids uuid[] := ARRAY[]::uuid[];
  v_snapshot_review_ids uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = v_org) THEN
    RETURN;
  END IF;
  PERFORM 1 FROM public.branches b
  WHERE (b.id,b.organization_id,b.branch_code) = (v_branch,v_org,'BR001')
  FOR SHARE OF b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verified production BR001 organization/branch identity no longer matches';
  END IF;

  FOR v_ref IN SELECT * FROM (VALUES
    (v_oct20, 'SH-20261020-0001', 'CLOSED', true),
    (v_oct21, 'SH-20261021-0001', 'CLOSED', false),
    (v_closed_shift, 'SH-20261111-0001', 'CLOSED', true),
    (v_open_shift, 'SH-20261125-0001', 'OPEN', true)
  ) AS expected(id, shift_number, status, mark_shift)
  LOOP
    PERFORM 1 FROM public.pos_shifts s
    WHERE (s.id, s.organization_id, s.branch_id) = (v_ref.id, v_org, v_branch)
      AND s.shift_number = v_ref.shift_number AND s.status::text = v_ref.status
    FOR SHARE OF s;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Verified trial shift no longer matches: %', v_ref.shift_number;
    END IF;
    IF v_ref.mark_shift THEN
      INSERT INTO public.pos_trial_shift_markers(shift_id, evidence_ref)
      VALUES (v_ref.id, 'BR001 verified trial shift ' || v_ref.shift_number);
    END IF;
  END LOOP;

  FOR v_ref IN SELECT * FROM (VALUES
    ('TX-20261020-00001', v_oct20, 30.00::numeric, 'QR', '2026-10-20 18:29:48.567037+08'::timestamptz, 'd6fab8e8-fb89-4441-bd3a-4ad203f507bb'::uuid),
    ('TX-20261020-00002', v_oct20, 10.00::numeric, 'CASH', '2026-10-20 18:30:23.477483+08'::timestamptz, '9f758b40-cd08-4583-9300-e302283f2686'::uuid),
    ('TX-20261020-00003', v_oct20, 10.00::numeric, 'CASH', '2026-10-20 18:31:03.414649+08'::timestamptz, '32a79a65-185e-44f9-abcb-eb3bc805637e'::uuid),
    ('TX-20261021-00001', v_oct21,  2.50::numeric, 'QR', '2026-10-21 23:58:59.419393+08'::timestamptz, '037dc3ff-6d9f-4af0-ba8c-f83988970ed5'::uuid),
    ('TX-20261112-00002', v_closed_shift, 2.50::numeric, 'QR', NULL::timestamptz, '338554ed-8d28-4c3d-80cb-90b597c8ccbe'::uuid),
    ('TX-20261112-00003', v_closed_shift, 2.50::numeric, 'QR', NULL::timestamptz, 'b28c5130-63e2-4edd-853f-ee6102965fd5'::uuid),
    ('TX-20261122-00001', v_closed_shift, 3.50::numeric, 'CASH', NULL::timestamptz, '1d86cd77-d16a-4c7a-b305-aa06a1aa425d'::uuid),
    ('TX-20261122-00002', v_closed_shift, 3.50::numeric, 'QR', NULL::timestamptz, '86731af9-8044-4850-9d21-6ab9ab23a5f9'::uuid),
    ('TX-20261123-00001', v_closed_shift, 7.00::numeric, 'QR', NULL::timestamptz, 'dd559d5d-ee73-4f76-825e-cf89ee3a36e6'::uuid),
    ('TX-20261124-00001', v_closed_shift, 2.50::numeric, 'QR', NULL::timestamptz, NULL::uuid),
    ('TX-20261125-00003', v_open_shift, 2.50::numeric, 'QR', NULL::timestamptz, NULL::uuid),
    ('TX-20261126-00001', v_open_shift, 2.50::numeric, 'QR', NULL::timestamptz, NULL::uuid),
    ('TX-20261126-00002', v_open_shift, 2.50::numeric, 'QR', NULL::timestamptz, NULL::uuid)
  ) AS expected(transaction_number, shift_id, amount, method, created_at, id)
  LOOP
    SELECT t.id INTO v_entity FROM public.pos_transactions t
    WHERE (t.organization_id, t.branch_id, t.shift_id) = (v_org, v_branch, v_ref.shift_id)
      AND t.transaction_number = v_ref.transaction_number
      AND t.status = 'COMPLETED' AND t.total = v_ref.amount
      AND t.payment_method::text = v_ref.method
      AND (v_ref.created_at IS NULL OR t.created_at = v_ref.created_at)
      AND (v_ref.id IS NULL OR t.id = v_ref.id)
    FOR SHARE OF t;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Verified trial sale no longer matches: %', v_ref.transaction_number;
    END IF;
    INSERT INTO public.pos_trial_sale_markers(transaction_id, evidence_ref)
    VALUES (v_entity, 'BR001 verified trial sale ' || v_ref.transaction_number);
  END LOOP;

  -- Do not tag either November shift as a whole if its proven sale set
  -- has changed before deployment.
  IF (SELECT count(*) FROM public.pos_transactions t
      WHERE (t.organization_id,t.branch_id,t.shift_id) = (v_org,v_branch,v_open_shift)) <> 3
     OR (SELECT count(*) FROM public.pos_transactions t
      WHERE (t.organization_id,t.branch_id,t.shift_id) = (v_org,v_branch,v_closed_shift)) <> 6 THEN
    RAISE EXCEPTION 'BR001 November trial shift has an unexpected sale set';
  END IF;

  FOR v_ref IN SELECT * FROM (VALUES
      ('49932916-a299-4f66-a199-91d13df38332'::uuid, 'RKJ_49932916A2994F66A19991D13DF38332', 'QUARANTINED', 2.5::numeric, NULL::text, NULL::text, v_closed_shift),
      ('7aea7720-5c17-4bd4-9405-cd140c7cc9b3'::uuid, 'RKJ_7AEA77205C174BD49405CD140C7CC9B3', 'QUARANTINED', 2.5::numeric, NULL::text, NULL::text, v_closed_shift),
      ('1ec4fe96-e093-4a1c-b2b2-3022b7fc6c7f'::uuid, 'RKJ_1EC4FE96E0934A1CB2B23022B7FC6C7F', 'QUARANTINED', 2.5::numeric, NULL::text, NULL::text, v_closed_shift),
      ('2b01e2be-8cec-4ac2-8352-061f48cd4928'::uuid, 'RKJ_2B01E2BE8CEC4AC28352061F48CD4928', 'QUARANTINED', 2.5::numeric, NULL::text, NULL::text, v_closed_shift),
      ('84435c6c-eff5-4db6-bc89-a1d73fa5b8e9'::uuid, 'RKJ_84435C6CEFF54DB6BC89A1D73FA5B8E9', 'QUARANTINED', 2.5::numeric, NULL::text, NULL::text, v_closed_shift),
      ('6e3cab95-fe36-4cd5-800f-d7cb6a5757ea'::uuid, 'RKJ_6E3CAB95FE364CD5800FD7CB6A5757EA', 'QUARANTINED', 2.5::numeric, NULL::text, NULL::text, v_closed_shift),
      ('99fa7802-e23a-49fa-b5a7-05617400477f'::uuid, 'RKJ_99FA7802E23A49FAB5A705617400477F', 'QUARANTINED', 2.5::numeric, NULL::text, NULL::text, v_closed_shift),
      ('aac058ea-a557-4e8d-93c4-a231bf04c3e6'::uuid, 'RKJ_AAC058EAA5574E8D93C4A231BF04C3E6', 'QUARANTINED', 3.5::numeric, NULL::text, NULL::text, v_closed_shift),
      ('19bbef80-1921-4164-b352-7d3d0f88597c'::uuid, 'RKJ_19BBEF8019214164B3527D3D0F88597C', 'QUARANTINED', 2.5::numeric, NULL::text, NULL::text, v_closed_shift),
      ('6983699c-fe1c-4cae-9e58-f4edbb9b917a'::uuid, 'RKJ_6983699CFE1C4CAE9E58F4EDBB9B917A', 'QUARANTINED', 2.5::numeric, NULL::text, NULL::text, v_closed_shift),
      ('d1f6dbd3-87e4-4f43-a7f5-ce504ed7fa9e'::uuid, 'RKJ_D1F6DBD387E44F43A7F5CE504ED7FA9E', 'QUARANTINED', 2.5::numeric, NULL::text, NULL::text, v_closed_shift),
      ('cead2dff-ad9c-4a87-971d-7dffb1b5c935'::uuid, 'RKJ_CEAD2DFFAD9C4A87971D7DFFB1B5C935', 'PAID', 2.5::numeric, '4182588915', 'TX-20261112-00002', v_closed_shift),
      ('b96aaaa1-4317-4a66-bc6a-e162ae1d8c6f'::uuid, 'RKJ_B96AAAA143174A66BC6AE162AE1D8C6F', 'PAID', 2.5::numeric, '4182596292', 'TX-20261112-00003', v_closed_shift),
      ('322ff2c6-0e4e-4774-a276-956997f15765'::uuid, 'RKJ_322FF2C60E4E4774A276956997F15765', 'PAID', 3.5::numeric, '4207301213', 'TX-20261122-00002', v_closed_shift),
      ('31004a66-1569-42cb-95ea-3cff70ffa679'::uuid, 'RKJ_31004A66156942CB95EA3CFF70FFA679', 'PAID', 7::numeric, '4209033595', 'TX-20261123-00001', v_closed_shift),
      ('cb2beb0f-5128-4112-bb9d-e27035871282'::uuid, 'RKJ_CB2BEB0F51284112BB9DE27035871282', 'PAID', 2.5::numeric, '4212843982', 'TX-20261124-00001', v_closed_shift),
      ('01d615e3-a4a4-46fd-b2d3-0fb1b8e3008c'::uuid, 'RKJ_01D615E3A4A446FDB2D30FB1B8E3008C', 'QUARANTINED', 2.5::numeric, NULL::text, NULL::text, v_open_shift),
      ('bcba67c4-818e-4f52-b7f7-ff5b0a22e75f'::uuid, 'RKJ_BCBA67C4818E4F52B7F7FF5B0A22E75F', 'QUARANTINED', 2.5::numeric, NULL::text, NULL::text, v_open_shift),
      ('927e5ef8-b660-4bb5-b041-8e5f7663c11b'::uuid, 'RKJ_927E5EF8B6604BB5B0418E5F7663C11B', 'PAID', 2.5::numeric, '4215785389', 'TX-20261125-00003', v_open_shift),
      ('a2a12651-6095-4d07-8095-1353406b3f64'::uuid, 'RKJ_A2A1265160954D0780951353406B3F64', 'QUARANTINED', 3.5::numeric, NULL::text, NULL::text, v_open_shift),
      ('faffcfd5-8ab0-41b7-8c67-59b0394c8440'::uuid, 'RKJ_FAFFCFD58AB041B78C6759B0394C8440', 'QUARANTINED', 2.5::numeric, NULL::text, NULL::text, v_open_shift),
      ('7be4cbc8-1bc9-49a2-8b49-5ec0ee09551c'::uuid, 'RKJ_7BE4CBC81BC949A28B495EC0EE09551C', 'PAID', 2.5::numeric, '4216394710', 'TX-20261126-00001', v_open_shift),
      ('8ae6c753-3d3f-4eaa-ad92-1e2b5d9fedeb'::uuid, 'RKJ_8AE6C7533D3F4EAAAD921E2B5D9FEDEB', 'PAID', 2.5::numeric, '4216402748', 'TX-20261126-00002', v_open_shift)
  ) AS expected(id, order_ref, status, amount, provider_ref, transaction_number, shift_id)
  LOOP
    SELECT p.id INTO v_entity
    FROM public.pos_online_payments p
    LEFT JOIN public.pos_transactions t
      ON (t.id,t.organization_id,t.branch_id,t.shift_id) =
         (p.transaction_id,p.organization_id,p.branch_id,p.shift_id)
    WHERE (p.id,p.organization_id,p.branch_id,p.shift_id) =
          (v_ref.id,v_org,v_branch,v_ref.shift_id)
      AND p.provider = 'fiuu_vt' AND p.provider_order_id = v_ref.order_ref
      AND p.status = v_ref.status AND p.amount_rm = v_ref.amount
      AND p.provider_transaction_id IS NOT DISTINCT FROM v_ref.provider_ref
      AND (v_ref.shift_id <> v_open_shift OR (
        p.sale_payload->>'payment_method' = 'QR'
        AND (p.sale_payload->>'cash_amount')::numeric = 0
      ))
      AND (
        (v_ref.status = 'PAID' AND p.paid_at IS NOT NULL AND p.provider_confirmed_at IS NOT NULL
         AND p.provider_result->>'status' = '00'
         AND t.transaction_number = v_ref.transaction_number
         AND EXISTS (SELECT 1 FROM public.pos_trial_sale_markers m WHERE m.transaction_id = t.id))
        OR
        (v_ref.status = 'QUARANTINED' AND p.transaction_id IS NULL AND p.paid_at IS NULL
         AND p.provider_confirmed_at IS NULL AND p.fiuu_vt_review_required)
      )
    FOR SHARE OF p;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Verified trial payment no longer matches: %', v_ref.order_ref;
    END IF;
    IF v_ref.shift_id = v_closed_shift AND v_ref.status = 'QUARANTINED' THEN
      v_closed_review_ids := array_append(v_closed_review_ids, v_entity);
    END IF;
    -- Legacy paid payments corroborate their exact sale markers; they do
    -- not require a second marker because they already have their sale.
    IF v_ref.shift_id = v_open_shift OR v_ref.status = 'QUARANTINED' THEN
      INSERT INTO public.pos_trial_payment_markers(payment_id, evidence_ref)
      VALUES (v_entity, 'BR001 verified trial payment ' || v_ref.order_ref);
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.pos_online_payments p
      WHERE (p.organization_id,p.branch_id,p.shift_id) = (v_org,v_branch,v_open_shift)) <> 7 THEN
    RAISE EXCEPTION 'BR001 open trial shift has an unexpected payment set';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pos_fiuu_vt_attempts a
    WHERE a.payment_id = 'faffcfd5-8ab0-41b7-8c67-59b0394c8440'
      AND a.op_type = 'VOID' AND a.state = 'CONSUMED' AND a.result_json->>'errorCode' = '5000'
  ) OR EXISTS (
    SELECT 1 FROM public.pos_fiuu_vt_attempts a
    WHERE a.payment_id = 'a2a12651-6095-4d07-8095-1353406b3f64' AND a.op_type = 'VOID'
  ) THEN
    RAISE EXCEPTION 'BR001 trial cancellation evidence differs from the reviewed C8440/3F64 evidence';
  END IF;

  SELECT c.review_payment_ids INTO v_snapshot_review_ids FROM public.pos_fiuu_vt_shift_closures c
  WHERE (c.shift_id,c.organization_id,c.branch_id) = (v_closed_shift,v_org,v_branch);
  IF NOT FOUND OR cardinality(v_snapshot_review_ids) <> 11
     OR NOT (v_snapshot_review_ids @> v_closed_review_ids) THEN
    RAISE EXCEPTION 'BR001 trial review set no longer matches the closed shift snapshot';
  END IF;
END;
$seed$;

-- Finance still reads the original payment/transaction tables. If an exact
-- marked payment is later linked to a sale, only operational reads exclude it.
CREATE VIEW public.pos_operational_transactions WITH (security_invoker = true) AS
SELECT t.*
FROM public.pos_transactions t
WHERE NOT EXISTS (
  SELECT 1 FROM public.pos_trial_sale_markers m WHERE m.transaction_id = t.id
) AND NOT EXISTS (
  SELECT 1 FROM public.pos_trial_payment_markers m
  JOIN public.pos_online_payments p ON p.id = m.payment_id
  WHERE (p.transaction_id,p.organization_id,p.branch_id,p.shift_id) =
        (t.id,t.organization_id,t.branch_id,t.shift_id)
);

CREATE VIEW public.pos_operational_shifts WITH (security_invoker = true) AS
SELECT s.* FROM public.pos_shifts s
WHERE NOT EXISTS (
  SELECT 1 FROM public.pos_trial_shift_markers m WHERE m.shift_id = s.id
);

-- Private failure path. Do not silently use an unverified daily bucket,
-- double-subtract an after-midnight sale, or publish a guessed zero.
CREATE SCHEMA pos_trial_internal;
REVOKE ALL ON SCHEMA pos_trial_internal FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA pos_trial_internal TO authenticated, service_role;
CREATE FUNCTION pos_trial_internal.summary_basis_conflict(date)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $conflict$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'check_violation',
    MESSAGE = format('Cannot safely separate POS trial totals for summary date %s', $1);
END;
$conflict$;
REVOKE ALL ON FUNCTION pos_trial_internal.summary_basis_conflict(date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pos_trial_internal.summary_basis_conflict(date)
  TO authenticated, service_role;

-- Keep the published branch/date and use the original aggregation basis that
-- reconciles to the raw row. Normal VT checkout calls refresh for a MYT date
-- but does not set TimeZone (UTC for the ledger connection); the late closed-
-- shift posting explicitly sets TimeZone to Asia/Kuala_Lumpur. The raw refresh
-- compares created_at::date, with refund/void changing counts, not paid sums.
-- A dual match is safe only when both produce the same trial adjustment.
CREATE VIEW public.pos_operational_daily_summaries WITH (security_invoker = true) AS
WITH trial_transactions AS MATERIALIZED (
  SELECT t.id, t.organization_id, t.branch_id, t.created_at
  FROM public.pos_transactions t
  JOIN (
    SELECT m.transaction_id FROM public.pos_trial_sale_markers m
    UNION
    SELECT p.transaction_id FROM public.pos_trial_payment_markers m
    JOIN public.pos_online_payments p ON p.id = m.payment_id
    JOIN public.pos_transactions linked
      ON (linked.id,linked.organization_id,linked.branch_id,linked.shift_id) =
         (p.transaction_id,p.organization_id,p.branch_id,p.shift_id)
  ) marked ON marked.transaction_id = t.id
),
affected_dates AS MATERIALIZED (
  SELECT DISTINCT t.organization_id, t.branch_id, day.summary_date
  FROM trial_transactions t CROSS JOIN LATERAL (VALUES
    ((t.created_at AT TIME ZONE 'UTC')::date),
    ((t.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
  ) day(summary_date)
)
SELECT d.id, d.organization_id, d.branch_id, d.summary_date,
  (CASE WHEN affected.summary_date IS NULL THEN d.total_sales
        WHEN adjustment.matches = 1 THEN d.total_sales - adjustment.sales
        ELSE pos_trial_internal.summary_basis_conflict(d.summary_date) END)::numeric(12,2) AS total_sales,
  (CASE WHEN affected.summary_date IS NULL THEN d.total_cash
        WHEN adjustment.matches = 1 THEN d.total_cash - adjustment.cash
        ELSE pos_trial_internal.summary_basis_conflict(d.summary_date) END)::numeric(12,2) AS total_cash,
  (CASE WHEN affected.summary_date IS NULL THEN d.total_qr
        WHEN adjustment.matches = 1 THEN d.total_qr - adjustment.qr
        ELSE pos_trial_internal.summary_basis_conflict(d.summary_date) END)::numeric(12,2) AS total_qr,
  (CASE WHEN affected.summary_date IS NULL THEN d.transaction_count
        WHEN adjustment.matches = 1 THEN d.transaction_count - adjustment.sales_count
        ELSE pos_trial_internal.summary_basis_conflict(d.summary_date) END)::integer AS transaction_count,
  (CASE WHEN affected.summary_date IS NULL THEN d.void_count
        WHEN adjustment.matches = 1 THEN d.void_count - adjustment.voids
        ELSE pos_trial_internal.summary_basis_conflict(d.summary_date) END)::integer AS void_count,
  (CASE WHEN affected.summary_date IS NULL THEN d.refund_count
        WHEN adjustment.matches = 1 THEN d.refund_count - adjustment.refunds
        ELSE pos_trial_internal.summary_basis_conflict(d.summary_date) END)::integer AS refund_count,
  d.shift_count, d.created_at, d.updated_at
FROM public.pos_daily_summaries d
LEFT JOIN affected_dates affected USING (organization_id, branch_id, summary_date)
LEFT JOIN LATERAL (
  SELECT count(*) AS matches, max(m.sales) AS sales, max(m.cash) AS cash, max(m.qr) AS qr,
    max(m.sales_count) AS sales_count, max(m.voids) AS voids, max(m.refunds) AS refunds
  FROM (
    SELECT DISTINCT a.sales, a.cash, a.qr, a.sales_count, a.voids, a.refunds
    FROM (VALUES ('UTC'), ('Asia/Kuala_Lumpur')) AS basis(zone_name)
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(sum(t.total) FILTER (WHERE t.status = 'COMPLETED'),0) AS raw_sales,
        COALESCE(sum(t.cash_amount) FILTER (WHERE t.status = 'COMPLETED'),0) AS raw_cash,
        COALESCE(sum(t.qr_amount) FILTER (WHERE t.status = 'COMPLETED'),0) AS raw_qr,
        count(*) FILTER (WHERE t.status = 'COMPLETED') AS raw_count,
        count(*) FILTER (WHERE t.status = 'VOIDED') AS raw_voids,
        count(*) FILTER (WHERE t.status = 'REFUNDED') AS raw_refunds,
        COALESCE(sum(t.total) FILTER (WHERE t.status = 'COMPLETED' AND trial.id IS NOT NULL),0) AS sales,
        COALESCE(sum(t.cash_amount) FILTER (WHERE t.status = 'COMPLETED' AND trial.id IS NOT NULL),0) AS cash,
        COALESCE(sum(t.qr_amount) FILTER (WHERE t.status = 'COMPLETED' AND trial.id IS NOT NULL),0) AS qr,
        count(*) FILTER (WHERE t.status = 'COMPLETED' AND trial.id IS NOT NULL) AS sales_count,
        count(*) FILTER (WHERE t.status = 'VOIDED' AND trial.id IS NOT NULL) AS voids,
        count(*) FILTER (WHERE t.status = 'REFUNDED' AND trial.id IS NOT NULL) AS refunds
      FROM public.pos_transactions t
      LEFT JOIN trial_transactions trial ON (trial.id,trial.organization_id,trial.branch_id) =
                                           (t.id,t.organization_id,t.branch_id)
      WHERE affected.summary_date IS NOT NULL
        AND (t.organization_id,t.branch_id) = (d.organization_id,d.branch_id)
        AND t.created_at >= (d.summary_date::timestamp AT TIME ZONE basis.zone_name)
        AND t.created_at < ((d.summary_date + 1)::timestamp AT TIME ZONE basis.zone_name)
    ) a
    WHERE affected.summary_date IS NOT NULL
      AND (a.raw_sales, a.raw_cash, a.raw_qr, a.raw_count, a.raw_voids, a.raw_refunds) =
          (d.total_sales, d.total_cash, d.total_qr, d.transaction_count, d.void_count, d.refund_count)
  ) m
) adjustment ON affected.summary_date IS NOT NULL;

REVOKE ALL ON public.pos_operational_transactions, public.pos_operational_daily_summaries,
  public.pos_operational_shifts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.pos_operational_transactions, public.pos_operational_daily_summaries,
  public.pos_operational_shifts TO authenticated, service_role;

DO $activate$
DECLARE
  v_dashboard_oid regprocedure := 'public.get_dashboard_snapshot(uuid,uuid[])'::regprocedure;
  v_definition text;
BEGIN
  -- The view reads only these identity columns under the existing RLS.
  -- Do not add raw-payment grants to make an unexpected environment pass.
  IF EXISTS (
    SELECT 1 FROM (VALUES ('authenticated'), ('service_role')) AS roles(role_name)
    CROSS JOIN (VALUES ('id'), ('transaction_id'), ('organization_id'), ('branch_id'), ('shift_id')) AS needed(column_name)
    WHERE NOT pg_catalog.has_column_privilege(
      roles.role_name, 'public.pos_online_payments', needed.column_name, 'SELECT'
    )
  ) THEN
    RAISE EXCEPTION 'Existing POS payment identity-column SELECT grants are required by the operational views';
  END IF;

  -- Force attribution for all existing affected days before switching reads.
  PERFORM s.total_sales FROM public.pos_operational_daily_summaries s
  WHERE EXISTS (
    SELECT 1 FROM public.pos_trial_sale_markers m
    JOIN public.pos_transactions t ON t.id = m.transaction_id
    WHERE (t.organization_id,t.branch_id) = (s.organization_id,s.branch_id)
      AND s.summary_date IN ((t.created_at AT TIME ZONE 'UTC')::date,
                             (t.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
  );

  -- Only the known SQL body is eligible; CREATE OR REPLACE retains owner/ACL.
  SELECT pg_get_functiondef(p.oid) INTO v_definition
  FROM pg_catalog.pg_proc p
  WHERE p.oid = v_dashboard_oid
    -- The same source body was stored with CRLF locally and LF in production.
    AND md5(replace(p.prosrc, E'\r\n', E'\n')) = 'a1ccd37041d42d3f0afd93198266580e'
    AND p.provolatile = 's' AND NOT p.prosecdef
    AND p.proconfig = ARRAY['search_path=public'];
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dashboard snapshot definition differs from the reviewed version';
  END IF;
  EXECUTE replace(v_definition, 'FROM public.pos_daily_summaries pds',
                                'FROM public.pos_operational_daily_summaries pds');
END;
$activate$;
