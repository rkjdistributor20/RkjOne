-- Route Wilayah Tengah through the dedicated Sungkai relay driver.

CREATE OR REPLACE FUNCTION public.driver_route_role(p_driver_code TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
 SELECT CASE
  WHEN upper(p_driver_code) IN ('D001', 'DRV001', 'ROAD001', 'DIST-DRV-001', 'DIST-AST-001') THEN 'HUB_PRIMARY'
  WHEN upper(p_driver_code) IN ('D004', 'D005', 'DRV003', 'DRV004', 'ROAD004', 'ROAD005', 'ROAD006', 'DIST-DRV-004', 'DIST-DRV-005') THEN 'HUB_RELAY'
  ELSE 'DIRECT'
 END;
$$;

CREATE OR REPLACE FUNCTION public.default_driver_id_for_branch(
 p_org_id UUID,
 p_branch_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
 v_region region_code;
 v_rank INT;
 v_code TEXT;
 v_driver_code TEXT;
BEGIN
 SELECT COALESCE(r.code, b.area::region_code), b.branch_code
 INTO v_region, v_code
 FROM public.branches b
 LEFT JOIN public.regions r ON r.id = b.region_id
 WHERE b.id = p_branch_id;

 v_rank := COALESCE(NULLIF(regexp_replace(COALESCE(v_code, ''), '\D', '', 'g'), '')::int, 1);

 v_driver_code := CASE v_region
  WHEN 'UTARA' THEN CASE WHEN v_rank % 2 = 0 THEN 'DIST-DRV-002' ELSE 'DIST-DRV-003' END
  WHEN 'TENGAH' THEN 'DIST-DRV-005'
  ELSE 'DIST-DRV-004'
 END;

 RETURN (
  SELECT id
  FROM public.drivers
  WHERE organization_id = p_org_id
   AND driver_code = v_driver_code
   AND status = 'ACTIVE'
  LIMIT 1
 );
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_route_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.default_driver_id_for_branch(UUID, UUID) TO authenticated;
