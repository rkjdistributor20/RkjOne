-- Fix: kalendar production HQ kosong kerana STABLE function panggil UPDATE
-- get_published_production_dates tidak boleh jalankan close_expired (read-only txn)

CREATE OR REPLACE FUNCTION get_published_production_dates(
  p_from DATE DEFAULT CURRENT_DATE,
  p_to DATE DEFAULT (CURRENT_DATE + 90)
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id FROM profiles WHERE id = auth.uid();
  IF v_org_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'production_date', d.production_date,
          'week_start', w.week_start,
          'week_notes', w.notes,
          'day_notes', d.notes,
          'cutoff_at', factory_order_cutoff_at(d.production_date),
          'orders_locked', d.orders_locked,
          'window_open', is_factory_order_window_open(v_org_id, d.production_date),
          'order_id', o.id,
          'order_number', o.order_number,
          'order_phase', o.order_phase,
          'has_prediction', o.id IS NOT NULL AND o.order_phase = 'PREDICTION',
          'has_final_order', o.id IS NOT NULL AND o.order_phase = 'FINAL',
          'routes_planned', o.routes_planned_at IS NOT NULL,
          'days_until_cutoff', GREATEST(0, EXTRACT(day FROM factory_order_cutoff_at(d.production_date) - now())::int)
        )
        ORDER BY d.production_date
      )
      FROM factory_production_days d
      JOIN factory_production_weeks w ON w.id = d.week_id
      LEFT JOIN hq_factory_orders o ON o.organization_id = v_org_id
        AND o.production_date = d.production_date
        AND o.status NOT IN ('CANCELLED')
      WHERE w.organization_id = v_org_id
        AND w.status = 'PUBLISHED'
        AND d.production_date BETWEEN p_from AND p_to
    ),
    '[]'::jsonb
  );
END;
$$;
