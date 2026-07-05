-- RKJ One HRMIS: expand employee self-service request catalogue.
ALTER TABLE public.hr_service_requests
 DROP CONSTRAINT IF EXISTS hr_service_requests_request_type_check;

ALTER TABLE public.hr_service_requests
 ADD CONSTRAINT hr_service_requests_request_type_check
 CHECK (
  request_type IN (
   'LEAVE',
   'PROFILE_UPDATE',
   'DOCUMENT',
   'PAYROLL',
   'TRANSFER',
   'ATTENDANCE',
   'UNIFORM_EQUIPMENT',
   'OVERTIME',
   'CLAIM',
   'TRAINING',
   'RESIGNATION',
   'DISCIPLINE',
   'ASSET',
   'LOAN_ADVANCE',
   'HR_HELP'
  )
 );

COMMENT ON COLUMN public.hr_service_requests.request_type IS
 'Employee HRMIS service type: leave, profile, document, payroll, transfer, attendance, uniform/equipment, overtime, claim, training, resignation, discipline, asset, loan/advance or HR help.';
