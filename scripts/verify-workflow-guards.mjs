import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const checks = [
 {
 file: 'app/api/hr/self-service/requests/[id]/route.ts',
 patterns: [
  'HR_DECISION_ROLES',
  'OPERATIONS_REVIEW_ROLES',
  'Cuti AM perlu disemak dan di-cover oleh OM dahulu sebelum HR luluskan.',
  'AM/OM hanya boleh tandakan permohonan sebagai sedang disemak operasi.',
 ],
 },
 {
 file: 'app/api/hr/operations/am-leave-coverage/route.ts',
 patterns: [
  'COVER_ROLES',
  'am_leave_cover',
  "status: 'IN_REVIEW'",
  'OM tidak boleh cover permohonan sendiri.',
 ],
 },
 {
 file: 'components/hr/om-am-leave-coverage-panel.tsx',
 patterns: [
  'Cover Cuti Area Manager',
  'HR tidak boleh approve sehingga cover OM siap.',
  'Ambil cover',
 ],
 },
 {
 file: 'components/hr/company-hr-dashboard.tsx',
 patterns: [
  'Cuti AM perlu di-cover oleh OM dahulu sebelum HR boleh luluskan.',
  'Perlu cover OM',
 ],
 },
 {
 file: 'lib/auth/permissions.ts',
 patterns: [
  'canAccessBookings',
  "['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER']",
 ],
 },
 {
 file: 'lib/dashboard/role-workflows.ts',
 patterns: [
  'Cover cuti AM',
  'Semak cover OM untuk cuti AM',
  'Mohon cuti dengan cover OM',
 ],
 },
];

let failed = 0;

for (const check of checks) {
 const fullPath = path.join(root, check.file);
 const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
 if (!content) {
  console.error(`x ${check.file} missing or empty`);
  failed += 1;
  continue;
 }

 for (const pattern of check.patterns) {
  if (!content.includes(pattern)) {
   console.error(`x ${check.file} missing: ${pattern}`);
   failed += 1;
  }
 }
}

if (failed > 0) {
 console.error(`\nWorkflow guard check failed: ${failed} issue(s).`);
 process.exit(1);
}

console.log('Workflow guard check passed.');
