-- Fix factory order report RPC: previous version referenced alias "o" without
-- declaring it, causing "missing FROM-clause entry for table o".

CREATE OR REPLACE FUNCTION get_factory_order_report(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_order RECORD;
 v_totals JSONB;
 v_branches JSONB;
 v_routes JSONB;
 v_base JSONB;
BEGIN
 SELECT o.* INTO v_order
 FROM hq_factory_orders o
 WHERE o.id = p_order_id;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Order tidak dijumpai';
 END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
 'item_code', si.item_code,
 'name', si.name,
 'category', si.category,
 'quantity', oi.quantity,
 'unit', oi.unit
 ) ORDER BY si.item_code), '[]'::jsonb)
 INTO v_totals
 FROM hq_factory_order_items oi
 JOIN stock_items si ON si.id = oi.stock_item_id
 WHERE oi.order_id = p_order_id;

 SELECT COALESCE(jsonb_agg(branch_row ORDER BY branch_row->>'branch_code'), '[]'::jsonb)
 INTO v_branches
 FROM (
 SELECT jsonb_build_object(
 'branch_id', b.id,
 'branch_code', b.branch_code,
 'branch_name', b.branch_name,
 'region_code', COALESCE(r.code::text, b.area),
 'driver_name', (
 SELECT d.full_name
 FROM drivers d
 WHERE d.id = (
 SELECT bi2.assigned_driver_id
 FROM hq_factory_order_branch_items bi2
 WHERE bi2.order_id = p_order_id
 AND bi2.branch_id = b.id
 LIMIT 1
 )
 ),
 'items', COALESCE((
 SELECT jsonb_agg(jsonb_build_object(
 'item_code', si.item_code,
 'name', si.name,
 'quantity', bi.quantity,
 'unit', bi.unit
 ) ORDER BY si.item_code)
 FROM hq_factory_order_branch_items bi
 JOIN stock_items si ON si.id = bi.stock_item_id
 WHERE bi.order_id = p_order_id
 AND bi.branch_id = b.id
 ), '[]'::jsonb)
 ) AS branch_row
 FROM (
 SELECT DISTINCT branch_id
 FROM hq_factory_order_branch_items
 WHERE order_id = p_order_id
 ) x
 JOIN branches b ON b.id = x.branch_id
 LEFT JOIN regions r ON r.id = b.region_id
 ) t;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
 'plan_id', p.id,
 'route_name', p.route_name,
 'region_code', p.region_code,
 'route_pattern', p.route_pattern,
 'status', p.status,
 'handoff_completed', p.handoff_completed_at IS NOT NULL,
 'driver', d.full_name,
 'vehicle', COALESCE(v.plate_number, v.vehicle_type),
 'stops', COALESCE((
 SELECT jsonb_agg(jsonb_build_object(
 'sequence', s.stop_sequence,
 'branch_code', COALESCE(b.branch_code, 'HANDOFF'),
 'branch_name', COALESCE(b.branch_name, 'Sambut Stok'),
 'is_handoff', s.is_handoff,
 'handoff_driver', (
 SELECT hd.full_name
 FROM drivers hd
 WHERE hd.id = s.handoff_driver_id
 ),
 'items', COALESCE((
 SELECT jsonb_agg(jsonb_build_object(
 'item_code', si.item_code,
 'name', si.name,
 'planned', si2.planned_quantity,
 'adjusted', si2.adjusted_quantity,
 'quantity', si2.quantity,
 'unit', si2.unit,
 'adjustment_reason', si2.adjustment_reason
 ))
 FROM hq_delivery_route_stop_items si2
 JOIN stock_items si ON si.id = si2.stock_item_id
 WHERE si2.stop_id = s.id
 ), '[]'::jsonb)
 ) ORDER BY s.stop_sequence)
 FROM hq_delivery_route_stops s
 LEFT JOIN branches b ON b.id = s.branch_id
 WHERE s.route_plan_id = p.id
 ), '[]'::jsonb)
 ) ORDER BY p.region_code, p.route_pattern), '[]'::jsonb)
 INTO v_routes
 FROM hq_delivery_route_plans p
 LEFT JOIN drivers d ON d.id = p.driver_id
 LEFT JOIN vehicles v ON v.id = p.vehicle_id
 WHERE p.factory_order_id = p_order_id
 AND p.status != 'CANCELLED';

 v_base := jsonb_build_object(
 'order_id', v_order.id,
 'order_number', v_order.order_number,
 'production_date', v_order.production_date,
 'status', v_order.status,
 'order_phase', v_order.order_phase,
 'cutoff_at', factory_order_cutoff_at(v_order.production_date),
 'totals', v_totals,
 'branches', v_branches,
 'routes', v_routes
 );

 RETURN v_base;
END;
$$;

GRANT EXECUTE ON FUNCTION get_factory_order_report(UUID) TO authenticated;
