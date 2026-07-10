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
   'Jurang HR: Pengurusan vs Staf',
   'Tanggungjawab Pengurusan / HR',
   'Tanggungjawab Staf',
  ],
 },
 {
  file: 'components/settings/settings-dashboard.tsx',
  patterns: [
   'const canManageUsers = isAdmin;',
   'title: "Rekod Staf HR"',
   'title: "Login Sistem & Role"',
   'Staf HR',
   'Login & Role',
   'visible: canManageUsers',
   'AM gunakan bahagian ini sahaja untuk tambah staf jualan/POS.',
  ],
 },
 {
  file: 'components/settings/staff-settings-panel.tsx',
  patterns: [
   'rekod pekerja sebenar',
   'Login &amp; Role',
  ],
 },
 {
  file: 'components/settings/users-admin-panel.tsx',
  patterns: [
   'Panel ini hanya untuk kawal',
   'Tambah Akaun Login',
   'Tambah Akaun Login Sistem',
  ],
 },
 {
  file: 'app/api/settings/users/route.ts',
  patterns: [
   'assertSettingsAdmin(profile)',
   'assertSettingsAdmin(await getCurrentProfile())',
   'Cawangan tidak dijumpai dalam organisasi ini',
  ],
 },
 {
  file: 'app/api/settings/users/[id]/route.ts',
  patterns: [
   'assertSettingsAdmin(await getCurrentProfile())',
   ".eq('organization_id', profile.organization_id)",
   'Pengguna tidak dijumpai',
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
 {
 file: 'app/api/sales-agent/catalog/route.ts',
 patterns: [
  'canAccessSalesAgent(profile.role)',
  'Akses ditolak',
 ],
 },
 {
 file: 'app/api/sales-agent/price-groups/route.ts',
 patterns: [
  'canAccessSalesAgent(profile.role)',
  'Akses ditolak',
 ],
 },
 {
 file: 'app/api/sales-agent/orders/route.ts',
 patterns: [
  'canAccessSalesAgent(profile.role)',
  'Akses ditolak',
 ],
 },
 {
 file: 'app/api/sales-agent/payments/route.ts',
 patterns: [
  'canAccessSalesAgent(profile.role)',
  'Akses ditolak',
 ],
 },
 {
 file: 'app/api/sales-agent/payments/[paymentId]/status/route.ts',
 patterns: [
  'canAccessSalesAgent(profile.role)',
  'Akses ditolak',
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
