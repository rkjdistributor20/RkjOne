import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ProfileWithBranch } from '@/types/database';

export type SystemHealthStatus = 'PASS' | 'WARN' | 'FAIL';

export type SystemHealthCheck = {
 key: string;
 label: string;
 status: SystemHealthStatus;
 detail: string;
 action?: string;
};

export type SystemHealthSection = {
 key: string;
 title: string;
 description: string;
 checks: SystemHealthCheck[];
};

export type SystemHealthSnapshot = {
 generated_at: string;
 overall: SystemHealthStatus;
 profile: {
 id: string;
 name: string;
 role: string;
 legal_entity_id: string | null;
 };
 counters: {
 branches: number | null;
 legal_entities: number | null;
 active_profiles: number | null;
 migrations: number | null;
 };
 sections: SystemHealthSection[];
};

type DbClient = SupabaseClient<Database>;

function statusWeight(status: SystemHealthStatus) {
 if (status === 'FAIL') return 3;
 if (status === 'WARN') return 2;
 return 1;
}

function worstStatus(statuses: SystemHealthStatus[]): SystemHealthStatus {
 return statuses.reduce<SystemHealthStatus>(
 (worst, status) => statusWeight(status) > statusWeight(worst) ? status : worst,
 'PASS');
}

async function countTable(
 supabase: DbClient,
 table: string,
 eq?: { column: string; value: string }) {
 try {
 let query = supabase
 .from(table as keyof Database['public']['Tables'])
 .select('id', { count: 'exact', head: true });
 if (eq) query = query.eq(eq.column, eq.value);
 const { count, error } = await query;
 if (error) return null;
 return count ?? 0;
 } catch {
 return null;
 }
}

function check(
 key: string,
 label: string,
 status: SystemHealthStatus,
 detail: string,
 action?: string): SystemHealthCheck {
 return { key, label, status, detail, action };
}

function envReady(names: string[]) {
 return names.some((name) => Boolean(process.env[name]));
}

export async function buildSystemHealthSnapshot(
 supabase: DbClient,
 profile: ProfileWithBranch): Promise<SystemHealthSnapshot> {
 const now = new Date().toISOString();
 const branches = await countTable(supabase, 'branches');
 const legalEntities = await countTable(supabase, 'legal_entities');
 const activeProfiles = await countTable(
 supabase,
 'profiles',
 { column: 'status', value: 'ACTIVE' });
 const migrationRows = await countTable(supabase, 'schema_migrations');
 const hasSupabaseEnv = envReady(['NEXT_PUBLIC_SUPABASE_URL']) &&
 envReady(['SUPABASE_SERVICE_ROLE_KEY']);
 const hasPaymentEnv = envReady([
 'BILLPLZ_API_KEY',
 'FIUU_MERCHANT_ID',
 'RAZER_MERCHANT_ID',
 'IPAY88_MERCHANT_CODE',
 ]);

 const sections: SystemHealthSection[] = [
 {
 key: 'security',
 title: 'Keselamatan Aplikasi',
 description: 'Kawalan asas production tanpa memaparkan rahsia sistem.',
 checks: [
 check(
 'runtime-secrets',
 'Rahsia tidak dipaparkan',
 'PASS',
 'Dashboard ini hanya tunjuk status readiness, bukan nilai API key, token, password atau service role key.'),
 check(
 'supabase-env',
 'Sambungan Supabase admin',
 hasSupabaseEnv ? 'PASS' : 'FAIL',
 hasSupabaseEnv
 ? 'Konfigurasi Supabase production ditemui dalam runtime.'
 : 'Konfigurasi Supabase production tidak lengkap.',
 'Semak Vercel Environment Variables jika gagal.'),
 check(
 'build-security-audit',
 'Audit fail melalui CLI',
 'WARN',
 'Semakan fail seperti security headers, proxy, PWA dan AAB dijalankan melalui npm run system:audit supaya runtime production tidak membaca seluruh projek.',
 'Run npm run system:audit sebelum deploy besar.'),
 ],
 },
 {
 key: 'access',
 title: 'Akses Pengguna & Data Syarikat',
 description: 'Pastikan staf hanya nampak syarikat, cawangan dan modul yang berkaitan.',
 checks: [
 check(
 'active-profiles',
 'Profil aktif dipantau',
 activeProfiles !== null ? 'PASS' : 'WARN',
 activeProfiles !== null ? `${activeProfiles} profil aktif direkod dalam sistem.` : 'Tidak dapat kira profil aktif.',
 'Semak role staf baharu selepas daftar HR.'),
 check(
 'legal-entities',
 'Profil syarikat berasingan',
 legalEntities !== null && legalEntities >= 3 ? 'PASS' : 'WARN',
 legalEntities !== null ? `${legalEntities} syarikat legal direkod.` : 'Tidak dapat kira syarikat legal.',
 'Pastikan RKJ Manufacturing, RKJ Distributor dan Roti Kaya Junus tidak bercampur akses.'),
 check(
 'branch-scope',
 'Cawangan boleh diaudit',
 branches !== null && branches >= 36 ? 'PASS' : 'WARN',
 branches !== null ? `${branches} cawangan boleh dipantau.` : 'Tidak dapat kira cawangan.',
 'Owner boleh semak profile cawangan, dokumen, POS, staf dan stok dari dashboard cawangan.'),
 ],
 },
 {
 key: 'backup',
 title: 'Backup & Pemulihan',
 description: 'Database dan worklog perlu ada rujukan pemulihan sebelum kerja besar.',
 checks: [
 check(
 'schema-migrations',
 'Migrasi database boleh dikesan',
 migrationRows !== null && migrationRows > 0 ? 'PASS' : 'WARN',
 migrationRows !== null
 ? `${migrationRows} rekod migration dikesan dalam database.`
 : 'Tidak dapat membaca schema_migrations daripada database.',
 'Jika tidak dapat dikesan, jalankan npm run system:audit dan bundle migration secara manual.'),
 check(
 'checkpoint-process',
 'Checkpoint kerja wajib',
 'WARN',
 'Checkpoint fail disahkan melalui CLI audit, bukan melalui API live.',
 'Update CHECKPOINT.json dan RESUME.md selepas deploy atau perubahan besar.'),
 ],
 },
 {
 key: 'mobile',
 title: 'PWA & Mobile App',
 description: 'Persediaan Play Store dan App Store sementara menunggu D-U-N-S.',
 checks: [
 check(
 'pwa-policy',
 'PWA dikawal melalui build audit',
 'WARN',
 'Manifest, service worker, AAB dan readiness audit disemak melalui npm run system:audit.',
 'Run npm run mobile:readiness sebelum submit Play Store/App Store.'),
 check(
 'duns-status',
 'D-U-N-S masih proses luar',
 'WARN',
 'Sistem sudah boleh disiapkan, tetapi akaun Play Console/App Store organisasi masih bergantung pada nombor D-U-N-S 9 digit.',
 'Sambung pendaftaran store sebaik sahaja D-U-N-S diterima.'),
 ],
 },
 {
 key: 'operations',
 title: 'Operasi & Monitoring',
 description: 'Kawalan UAT, health endpoint dan payment status sebelum sistem digunakan real.',
 checks: [
 check(
 'uat-mode',
 'Testing owner tidak disekat',
 'PASS',
 'Pentadbir Utama boleh terus membuat tindakan testing, manakala sistem memberi amaran SOP yang sepatutnya.'),
 check(
 'payment-env',
 'Payment gateway belum dipaksa live',
 hasPaymentEnv ? 'PASS' : 'WARN',
 hasPaymentEnv
 ? 'Sekurang-kurangnya satu konfigurasi payment gateway ditemui.'
 : 'Payment gateway live belum lengkap dalam environment.',
 'Kekalkan QR/manual payment untuk testing sehingga merchant approved dan webhook diuji.'),
 ],
 },
 ];

 const allStatuses = sections.flatMap((section) => section.checks.map((item) => item.status));

 return {
 generated_at: now,
 overall: worstStatus(allStatuses),
 profile: {
 id: profile.id,
 name: profile.full_name,
 role: profile.role,
 legal_entity_id: profile.legal_entity_id ?? null,
 },
 counters: {
 branches,
 legal_entities: legalEntities,
 active_profiles: activeProfiles,
 migrations: migrationRows,
 },
 sections,
 };
}
