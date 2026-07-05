export type ProductionReadinessStatus = 'READY' | 'NEEDS_ACTION' | 'BLOCKED';
export type ProductionReadinessPriority = 'P0' | 'P1' | 'P2';

export type ProductionReadinessArea = {
 key: string;
 title: string;
 owner: string;
 priority: ProductionReadinessPriority;
 status: ProductionReadinessStatus;
 summary: string;
 next_step: string;
 proof: string[];
};

export type ProductionReadinessSnapshot = {
 score: number;
 ready: number;
 needs_action: number;
 blocked: number;
 areas: ProductionReadinessArea[];
};

type ReadinessInput = {
 hasSupabaseEnv: boolean;
 hasPaymentEnv: boolean;
 branches: number | null;
 legalEntities: number | null;
 activeProfiles: number | null;
 migrationRows: number | null;
};

function area(
 key: string,
 title: string,
 owner: string,
 priority: ProductionReadinessPriority,
 status: ProductionReadinessStatus,
 summary: string,
 next_step: string,
 proof: string[]): ProductionReadinessArea {
 return { key, title, owner, priority, status, summary, next_step, proof };
}

function scoreStatus(status: ProductionReadinessStatus) {
 if (status === 'READY') return 1;
 if (status === 'NEEDS_ACTION') return 0.5;
 return 0;
}

export function buildProductionReadiness(input: ReadinessInput): ProductionReadinessSnapshot {
 const hasThreeEntities = (input.legalEntities ?? 0) >= 3;
 const hasBranches = (input.branches ?? 0) >= 36;
 const hasProfiles = (input.activeProfiles ?? 0) > 0;
 const hasMigrations = (input.migrationRows ?? 0) > 0;

 const areas: ProductionReadinessArea[] = [
 area(
 'uat-roles',
 'UAT role sebenar',
 'Pentadbir Utama',
 'P0',
 input.hasSupabaseEnv && hasProfiles ? 'READY' : 'BLOCKED',
 'Login dan dashboard perlu diuji untuk owner, AM, OM, HR, Finance, staf POS, driver, kilang dan ejen.',
 'Jalankan UAT ikut peranan sebelum buka real operation.',
 ['npm run verify:login', 'npm run uat:am', 'npm run uat:sales-agent']),
 area(
 'access-scope',
 'Akses ikut syarikat',
 'Admin / HR',
 'P0',
 hasThreeEntities && hasProfiles ? 'READY' : 'NEEDS_ACTION',
 'Data perlu kekal berasingan antara RKJ Manufacturing, RKJ Distributor dan Roti Kaya Junus.',
 'Semak role, legal entity dan branch scope selepas daftar staf baharu.',
 [`${input.legalEntities ?? 0} legal entity`, `${input.activeProfiles ?? 0} profil aktif`]),
 area(
 'audit-trail',
 'Audit perubahan sensitif',
 'Admin / Owner',
 'P0',
 hasMigrations ? 'READY' : 'NEEDS_ACTION',
 'Perubahan stok, staf, akses, gaji, dokumen dan delete/archive perlu ada rekod audit.',
 'Pastikan setiap dialog sensitif meminta sebab dan simpan actor/time.',
 [`${input.migrationRows ?? 0} migration database`]),
 area(
 'backup-restore',
 'Backup dan pemulihan',
 'Admin Teknikal',
 'P0',
 hasMigrations ? 'READY' : 'NEEDS_ACTION',
 'Sebelum deploy besar, migration bundle dan checkpoint mesti dikemaskini.',
 'Run npm run bundle:migrations, update CHECKPOINT.json dan RESUME.md.',
 ['npm run bundle:migrations', 'CHECKPOINT.json', 'RESUME.md']),
 area(
 'pos-offline',
 'POS, offline dan manual payment',
 'OM / AM',
 'P0',
 hasBranches ? 'READY' : 'NEEDS_ACTION',
 'POS perlu boleh terus jualan selepas SOP stok disahkan, dengan manual QR/tunai semasa payment gateway belum live.',
 'Uji BR011 dan 2 cawangan lain: buka syif, kira stok, jual, refund, tutup syif.',
 [`${input.branches ?? 0} cawangan`]),
 area(
 'payment-gateway',
 'Payment gateway live',
 'Finance / Owner',
 'P1',
 input.hasPaymentEnv ? 'READY' : 'NEEDS_ACTION',
 'Online payment jangan dipaksa live sehingga merchant approved dan webhook disahkan.',
 'Kekalkan QR manual dahulu. Aktifkan online payment hanya selepas transaksi sandbox/live berjaya masuk laporan.',
 ['Billplz/Fiuu/iPay88/Razer env', 'Webhook paid status']),
 area(
 'payroll-governance',
 'Payroll tiga syarikat',
 'HR / Finance',
 'P1',
 hasThreeEntities ? 'READY' : 'NEEDS_ACTION',
 'Payroll perlu jelas ikut legal entity, staff type, elaun, potongan, cuti dan payslip.',
 'Uji generate draft payroll untuk setiap syarikat dan preview payslip sebelum finalize.',
 ['npm run verify:payroll', 'HR & Gaji']),
 area(
 'mobile-store',
 'PWA, Android dan iOS',
 'Owner / Admin Teknikal',
 'P1',
 'NEEDS_ACTION',
 'Aplikasi boleh disiapkan, tetapi store submission organisasi masih bergantung pada D-U-N-S dan akaun developer approved.',
 'Run npm run mobile:readiness selepas D-U-N-S diterima dan sebelum submit store.',
 ['PWA manifest', 'Android shell', 'App Store documents']),
 area(
 'monitoring-alerts',
 'Monitoring dan alert',
 'Admin / Owner',
 'P1',
 input.hasSupabaseEnv ? 'READY' : 'NEEDS_ACTION',
 'Owner perlu nampak status health, stok kritikal, payment tertunggak dan isu cawangan tanpa buka semua modul.',
 'Semak Tetapan > Kesihatan Sistem dan Dashboard Owner setiap hari semasa pilot.',
 ['/api/health', '/api/system/health']),
 area(
 'training-rollout',
 'Training mode dan rollout staf',
 'HR / AM',
 'P2',
 'NEEDS_ACTION',
 'Staf perlu dilatih guna SOP sebenar tanpa dedah rahsia syarikat atau mengganggu operasi real.',
 'Buat pilot 1 cawangan, kemudian tambah 3 AM, kemudian buka ikut kawasan.',
 ['Reviewer account', 'Pilot BR011', 'Manual SOP POS']),
 ];

 const ready = areas.filter((item) => item.status === 'READY').length;
 const needsAction = areas.filter((item) => item.status === 'NEEDS_ACTION').length;
 const blocked = areas.filter((item) => item.status === 'BLOCKED').length;
 const score = Math.round(
 (areas.reduce((sum, item) => sum + scoreStatus(item.status), 0) / areas.length) * 100);

 return {
 score,
 ready,
 needs_action: needsAction,
 blocked,
 areas,
 };
}
