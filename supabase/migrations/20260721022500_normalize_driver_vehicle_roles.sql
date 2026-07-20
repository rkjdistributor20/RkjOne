-- RKJ One: normalize the live operating fleet assignments.

UPDATE public.driver_vehicle_assignments dva
SET assignment_role = 'ASSISTANT',
 responsibility_notes = 'Bantu driver utama semak muatan, dokumen, handoff dan POD. Tidak boleh membawa kenderaan tanpa arahan OM/HQ dan lesen yang sah.'
FROM public.drivers d
WHERE d.id = dva.driver_id
 AND d.driver_code = 'DIST-AST-001'
 AND dva.is_active = true;

UPDATE public.driver_vehicle_assignments dva
SET is_active = false,
 unassigned_at = COALESCE(dva.unassigned_at, now()),
 responsibility_notes = 'Pool kecemasan sahaja. OM/HQ mesti memilih staf sebenar dan membuat assignment baharu sebelum kenderaan digunakan.'
FROM public.drivers d
WHERE d.id = dva.driver_id
 AND d.driver_code = 'MFG-DRV-POOL'
 AND dva.is_active = true;

UPDATE public.drivers
SET route_description = 'Pool kecemasan kilang. Bukan assignment tetap; OM/HQ mesti melantik staf sebenar sebelum perjalanan.',
 updated_at = now()
WHERE driver_code = 'MFG-DRV-POOL'
 AND status = 'ACTIVE';
