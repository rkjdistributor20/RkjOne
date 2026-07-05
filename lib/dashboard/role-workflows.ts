import type { UserRole } from '@/types/enums';
import type { LegalEntityCode } from '@/lib/brand/legal-entities';
import { LEGAL_ENTITIES } from '@/lib/brand/legal-entities';

export type WorkflowStep = {
 title: string;
 description: string;
 href: string;
 module: string;
 cadence: 'Harian' | 'Mingguan' | 'Bulanan' | 'Ikut Keperluan';
 ownerNote?: string;
};

export type RoleWorkflow = {
 label: string;
 companyScope: string;
 primaryObjective: string;
 sopSummary: string;
 steps: WorkflowStep[];
};

type WorkflowInput = {
 role: UserRole;
 legalEntityCode?: string | null;
 dashboardLabel?: string | null;
};

function companyLabel(code?: string | null) {
 const entity = LEGAL_ENTITIES.find((item) => item.code === code);
 return entity?.legalName ?? 'Roti Kaya Junus Group';
}

const GROUP_WORKFLOW: RoleWorkflow = {
 label: 'Pentadbir Utama / Pemilik Kumpulan',
 companyScope: 'Roti Kaya Junus Group - RKJ, RKJ Distributor dan RKJ Manufacturing',
 primaryObjective: 'Pantau prestasi syarikat, pastikan tugas harian dipegang role yang betul, dan buat keputusan strategik untuk perkara besar sahaja.',
 sopSummary: 'Semak exception kumpulan, pastikan OM/AM/HR/Finance/Manager menjalankan tugas, dan luluskan hanya isu kritikal, legal, kewangan, payroll atau perubahan akses sensitif.',
 steps: [
 { title: 'Semak exception kumpulan', description: 'Fokus hanya kepada jualan jatuh, stok kritikal, tunai tertunggak, penghantaran gagal dan approval sensitif.', href: '/dashboard', module: 'Papan Pemuka', cadence: 'Harian' },
 { title: 'Semak kawalan AM, OM dan Admin', description: 'Lihat scorecard, cash proof, voucher penggunaan cash, audit akses dan escalation matrix supaya owner tidak jadi bottleneck kerja harian.', href: '/dashboard#management-governance', module: 'Governance', cadence: 'Harian' },
 { title: 'Pastikan pemilik tugas jelas', description: 'Semak Delegation Matrix supaya OM, AM, HR, Finance, Manager Maintenance dan Driver tidak menunggu owner untuk kerja harian.', href: '/dashboard', module: 'Governance', cadence: 'Harian' },
 { title: 'Luluskan perkara berisiko tinggi', description: 'Approve hanya isu legal, payroll final, perubahan akses sensitif, refund besar, delete/archive dan polisi harga.', href: '/approvals', module: 'Kelulusan', cadence: 'Harian' },
 { title: 'Audit HR syarikat', description: 'Semak ringkasan HR mengikut majikan legal; HR yang lengkapkan profil, owner semak kes luar biasa sahaja.', href: '/hr', module: 'HR Syarikat', cadence: 'Mingguan' },
 { title: 'Semak laporan strategik', description: 'Bandingkan jualan, margin ejen, kutipan, payroll dan prestasi cawangan untuk keputusan pemilik.', href: '/reports', module: 'Laporan', cadence: 'Mingguan' },
 ],
};

const OPERATION_MANAGER_WORKFLOWS: Record<LegalEntityCode, RoleWorkflow> = {
 RKJ_MFG: {
 label: 'Pengurus Operasi Kilang',
 companyScope: 'Roti Kaya Junus Manufacturing Sdn Bhd',
 primaryObjective:
 'Pastikan pengeluaran, bahan mentah, stok kilang dan serahan produk berjalan mengikut jadual production.',
 sopSummary:
 'Mulakan hari dengan semak order masuk, jadual production, stock card bahan mentah, penggunaan harian dan handoff stok kepada RKJ Distributor.',
 steps: [
 { title: 'Semak production queue', description: 'Pantau order masuk, tarikh production dan batch yang perlu disiapkan.', href: '/factory', module: 'Kilang', cadence: 'Harian' },
 { title: 'Semak command center kilang', description: 'Pantau exception production, bahan mentah kritikal, audit staf dan escalation kepada owner hanya bila impak besar.', href: '/dashboard#management-governance', module: 'Governance', cadence: 'Harian' },
 { title: 'Rekod bahan mentah', description: 'Pastikan stok masuk/keluar bahan mentah direkod oleh staf bertugas mengikut kegunaan production.', href: '/factory', module: 'Kilang', cadence: 'Harian' },
 { title: 'Semak stok kilang', description: 'Pantau baki bahan mentah, stok siap dan isu reject/expired sebelum serahan.', href: '/factory', module: 'Kilang', cadence: 'Harian' },
 { title: 'Laporan production', description: 'Semak prestasi produk, penggunaan bahan dan isu operasi kilang.', href: '/reports', module: 'Laporan', cadence: 'Mingguan' },
 ],
 },
 RKJ_DIST: {
 label: 'Pengurus Operasi Distributor',
 companyScope: 'RKJ Distributor Sdn Bhd',
 primaryObjective:
 'Pastikan HQ Distributor, logistik, driver, ejen, group rate dan pengedaran stok bergerak lancar.',
 sopSummary:
 'Semak stok HQ, order dari cawangan/ejen, jadual driver, status penghantaran, bayaran ejen dan isu maintenance/logistik.',
 steps: [
 { title: 'Semak HQ Distributor', description: 'Pantau stok diterima dari kilang, cross-dock dan stok untuk dihantar ke kiosk/ejen.', href: '/warehouse', module: 'Warehouse', cadence: 'Harian' },
 { title: 'Semak command center distributor', description: 'Kawal driver, ejen, route, cash collection dan bukti kerja supaya operasi tidak perlu menunggu owner.', href: '/dashboard#management-governance', module: 'Governance', cadence: 'Harian' },
 { title: 'Susun logistik', description: 'Pantau driver, kenderaan, route, dispatch dan POD penghantaran.', href: '/fleet', module: 'Logistik', cadence: 'Harian' },
 { title: 'Pantau Portal Ejen', description: 'Semak senarai ejen, group rate, order stok, langganan POS dan bayaran.', href: '/sales-agent', module: 'Portal Ejen', cadence: 'Harian' },
 { title: 'Kelulusan distributor', description: 'Sahkan pindahan stok, isu penghantaran dan perkara operasi yang menunggu tindakan.', href: '/approvals', module: 'Kelulusan', cadence: 'Harian' },
 ],
 },
 RKJ: {
 label: 'Pengurus Operasi Roti Kaya Junus',
 companyScope: 'Roti Kaya Junus',
 primaryObjective:
 'Pastikan operasi cawangan, POS, syif, inventori kiosk dan maintenance cawangan berjalan lancar.',
 sopSummary:
 'Semak KPI cawangan, jualan, stok, syif dan isu maintenance. Fokus kepada kelancaran kiosk dan pengalaman pelanggan.',
 steps: [
 { title: 'Pantau prestasi cawangan', description: 'Semak jualan, transaksi dan cawangan bermasalah.', href: '/dashboard', module: 'Dashboard', cadence: 'Harian' },
 { title: 'Semak command center OM', description: 'Semak scorecard AM, cash collection, stok kritikal, syif dan escalation sebelum isu naik kepada owner.', href: '/dashboard#management-governance', module: 'Governance', cadence: 'Harian' },
 { title: 'Semak stok kiosk', description: 'Pastikan stok rendah dan kritikal diselesaikan melalui inventory.', href: '/inventory', module: 'Inventori', cadence: 'Harian' },
 { title: 'Kawal jadual dan kehadiran', description: 'Semak syif staf, kekurangan tenaga kerja dan laporan pengurus kawasan.', href: '/shifts', module: 'Syif', cadence: 'Harian' },
 { title: 'Pantau kutipan tunai AM', description: 'Pastikan AM kutip dan bank-in tunai cawangan sekurang-kurangnya 2 kali seminggu; sasaran terbaik 6 kali seminggu.', href: '/finance', module: 'Kewangan', cadence: 'Harian' },
 { title: 'Pantau maintenance', description: 'Pastikan tiket cawangan diberi tindakan dan status dikemaskini.', href: '/maintenance', module: 'Maintenance', cadence: 'Harian' },
 ],
 },
};

const ROLE_WORKFLOWS: Record<UserRole, RoleWorkflow> = {
 SUPER_ADMIN: GROUP_WORKFLOW,
 ADMIN: {
 label: 'Pentadbir HQ',
 companyScope: 'Roti Kaya Junus Sdn Bhd',
 primaryObjective: 'Urus operasi HQ, akses user, laporan dan kelulusan pusat untuk semua cawangan.',
 sopSummary: 'Mulakan hari dengan semakan dashboard, selesaikan kelulusan, pastikan POS dan inventori cawangan boleh digunakan tanpa gangguan.',
 steps: [
 { title: 'Semak operasi harian', description: 'Lihat jualan, syif POS, stok rendah dan isu cawangan.', href: '/dashboard', module: 'Dashboard', cadence: 'Harian' },
 { title: 'Audit kerja AM/OM/Admin', description: 'Semak governance panel: scorecard AM, bukti collection, queue approval, dan tindakan yang perlu escalation.', href: '/dashboard#management-governance', module: 'Governance', cadence: 'Harian' },
 { title: 'Audit kutipan tunai AM', description: 'Semak jadual collection, bank-in dan bukti third party supaya cash cawangan tidak tertunggak.', href: '/finance', module: 'Kewangan', cadence: 'Harian' },
 { title: 'Urus pengguna dan cawangan', description: 'Tambah staf, tetapkan role, branch dan akses modul.', href: '/settings', module: 'Tetapan', cadence: 'Ikut Keperluan' },
 { title: 'Semak kelulusan', description: 'Lulus atau tolak permintaan yang memerlukan tindakan HQ.', href: '/approvals', module: 'Kelulusan', cadence: 'Harian' },
 { title: 'Pantau laporan', description: 'Semak laporan jualan, staf, produk dan prestasi cawangan.', href: '/reports', module: 'Laporan', cadence: 'Mingguan' },
 ],
 },
 HR: {
 label: 'HR Syarikat',
 companyScope: 'Syarikat majikan masing-masing',
 primaryObjective: 'Lengkapkan rekod pekerja, dokumen staf, payroll dan slip gaji mengikut syarikat legal.',
 sopSummary: 'Pastikan profil pekerja aktif, maklumat bank/gaji lengkap, rekod HR kemas dan payslip tersedia mengikut tempoh gaji.',
 steps: [
 { title: 'Semak rekod HR', description: 'Pastikan staf berada di group HR syarikat yang betul.', href: '/hr', module: 'HR Syarikat', cadence: 'Harian' },
 { title: 'Lengkapkan profil pekerja', description: 'Kemaskini IC/passport, telefon, bank, jawatan, status kerja dan majikan.', href: '/hr', module: 'HR Syarikat', cadence: 'Ikut Keperluan' },
 { title: 'Proses payroll', description: 'Semak gaji, elaun, potongan dan slip gaji dalam tab Gaji & Payroll.', href: '/hr', module: 'Gaji', cadence: 'Bulanan' },
 { title: 'Pantau kehadiran', description: 'Rujuk syif dan kehadiran untuk isu gaji atau disiplin.', href: '/shifts', module: 'Syif', cadence: 'Mingguan' },
 ],
 },
 OPERATION_MANAGER: {
 label: 'Pengurus Operasi',
 companyScope: 'Operasi cawangan Roti Kaya Junus',
 primaryObjective: 'Pastikan jualan, stok, syif, maintenance dan prestasi cawangan bergerak lancar.',
 sopSummary: 'Semak KPI cawangan, bantu pengurus kawasan, kawal stok dan escalate isu maintenance atau staf ganti bila perlu.',
 steps: [
 { title: 'Pantau prestasi cawangan', description: 'Semak jualan, transaksi dan cawangan bermasalah.', href: '/dashboard', module: 'Dashboard', cadence: 'Harian' },
 { title: 'Semak command center OM', description: 'Bandingkan scorecard AM, stok kritikal, collection cash, approval dan tugasan yang perlu diarah semula.', href: '/dashboard#management-governance', module: 'Governance', cadence: 'Harian' },
 { title: 'Semak stok kiosk', description: 'Pastikan stok rendah dan kritikal diselesaikan melalui inventory.', href: '/inventory', module: 'Inventori', cadence: 'Harian' },
 { title: 'Kawal jadual dan kehadiran', description: 'Semak syif staf, kekurangan tenaga kerja dan laporan pengurus kawasan.', href: '/shifts', module: 'Syif', cadence: 'Harian' },
 { title: 'Kawal collection tunai AM', description: 'Semak cawangan yang belum dikutip, pastikan baki bank-in dibuat, dan semak voucher penggunaan cash untuk barang cawangan, petrol/diesel atau maintenance transport.', href: '/finance', module: 'Kewangan', cadence: 'Harian' },
 { title: 'Pantau maintenance', description: 'Pastikan tiket cawangan diberi tindakan dan status dikemaskini.', href: '/maintenance', module: 'Maintenance', cadence: 'Harian' },
 ],
 },
 CEO_FACTORY: {
 label: 'CEO Kilang / Pengeluaran',
 companyScope: 'RKJ Manufacturing Sdn Bhd',
 primaryObjective: 'Kawal pengeluaran, stock card bahan mentah dan pesanan dari HQ/Distributor mengikut jadual.',
 sopSummary: 'Semak order masuk, jadual pengeluaran, rekod keluar/masuk bahan mentah, stok produk dan serahan kepada HQ Distributor.',
 steps: [
 { title: 'Semak queue pengeluaran', description: 'Pantau pesanan factory dan status setiap batch.', href: '/factory', module: 'Kilang', cadence: 'Harian' },
 { title: 'Rekod bahan mentah production', description: 'Catat bahan masuk dan bahan digunakan mengikut hari production serta staf perekod.', href: '/factory', module: 'Kilang', cadence: 'Harian' },
 { title: 'Acknowledge order', description: 'Terima dan selesaikan pesanan mengikut production date.', href: '/factory', module: 'Kilang', cadence: 'Harian' },
 { title: 'Semak laporan produk', description: 'Lihat prestasi produk dan isu reject/expired untuk tindakan.', href: '/reports', module: 'Laporan', cadence: 'Mingguan' },
 ],
 },
 AREA_MANAGER: {
 label: 'Pengurus Kawasan',
 companyScope: 'RKJ Distributor Sdn Bhd mengurus cawangan Roti Kaya Junus',
 primaryObjective: 'Mengawal prestasi cawangan dalam kawasan, stok kiosk, jadual staf dan isu operasi harian.',
 sopSummary: 'Mulakan hari dengan semak cawangan, pastikan staf cukup, POS buka, stok stabil dan laporan cawangan diberi tindakan.',
 steps: [
 { title: 'Semak cawangan kawasan', description: 'Lihat jualan, stok kritikal, staf hadir dan syif terbuka.', href: '/dashboard', module: 'Dashboard Kawasan', cadence: 'Harian' },
 { title: 'Update scorecard kawasan', description: 'Semak skor kawalan, cawangan merah, bukti collection, approval dan exception yang perlu dimaklumkan kepada OM.', href: '/dashboard#management-governance', module: 'Governance', cadence: 'Harian' },
 { title: 'Kutip, guna sah dan bank-in tunai cawangan', description: 'Rekod kutipan cash, guna hanya untuk request cawangan approved/petrol/maintenance dengan bukti, kemudian bank-in baki bersih ke akaun syarikat.', href: '/finance', module: 'Kewangan', cadence: 'Harian' },
 { title: 'Sediakan jadual staf', description: 'Rancang roster mingguan dan pastikan semua cawangan ada staf cukup.', href: '/shifts?tab=roster', module: 'Syif', cadence: 'Mingguan' },
 { title: 'Jadual spring cleaning bulanan', description: 'Tetapkan tarikh pembersihan mendalam untuk cawangan dalam kawasan.', href: '/dashboard#am-operations-planner', module: 'Perancangan AM', cadence: 'Bulanan' },
 { title: 'Meeting pengurusan highway', description: 'Rekod meeting highway untuk satu atau banyak cawangan yang terlibat.', href: '/dashboard#am-operations-planner', module: 'Perancangan AM', cadence: 'Ikut Keperluan' },
 { title: 'Pantau inventory kiosk', description: 'Selesaikan stok rendah, pindahan cawangan dan order ke HQ.', href: '/inventory', module: 'Inventori', cadence: 'Harian' },
 { title: 'Laporkan maintenance/staf shortage', description: 'Hantar laporan kepada Hanif untuk maintenance atau keperluan staf ganti.', href: '/maintenance', module: 'Maintenance', cadence: 'Ikut Keperluan' },
 ],
 },
 DRIVER: {
 label: 'Pemandu / Logistics',
 companyScope: 'RKJ Distributor Sdn Bhd',
 primaryObjective: 'Laksanakan penghantaran mengikut route dan kenderaan rasmi RKJ Distributor, sahkan POD dan kemaskini status perjalanan.',
 sopSummary: 'Semak route hari ini, kenderaan/plat bertugas, dispatch order, confirm setiap stop, upload bukti penghantaran dan lapor isu kenderaan atau kelewatan.',
 steps: [
 { title: 'Semak jadual delivery', description: 'Lihat tugasan dan route yang diberikan.', href: '/fleet', module: 'Logistik', cadence: 'Harian' },
 { title: 'Dispatch dan update status', description: 'Kemaskini status keluar, dalam perjalanan dan selesai.', href: '/fleet', module: 'Logistik', cadence: 'Harian' },
 { title: 'Upload POD', description: 'Sahkan bukti penghantaran untuk setiap order/stop.', href: '/fleet', module: 'POD', cadence: 'Harian' },
 { title: 'Laporkan isu', description: 'Maklumkan maintenance jika kenderaan atau route bermasalah.', href: '/maintenance', module: 'Maintenance', cadence: 'Ikut Keperluan' },
 ],
 },
 STAFF: {
 label: 'Staf Kiosk / Staf Operasi',
 companyScope: 'Mengikut cawangan dan syarikat majikan',
 primaryObjective: 'Jalankan syif, POS, stok kiosk dan laporan harian mengikut arahan pengurus.',
 sopSummary: 'Clock-in, buka POS, jual produk, kemaskini stok/reject/expired dan lapor maintenance atau kekurangan staf dengan segera.',
 steps: [
 { title: 'Semak jadual syif', description: 'Pastikan masa kerja, cawangan dan arahan harian jelas.', href: '/dashboard', module: 'Jadual Saya', cadence: 'Harian' },
 { title: 'Clock-in dan buka POS', description: 'Mulakan syif, buka kaunter dan rekod jualan harian.', href: '/pos', module: 'POS', cadence: 'Harian' },
 { title: 'Semak stok kiosk', description: 'Kira stok, rekod expired/reject dan maklumkan stok rendah.', href: '/inventory', module: 'Inventori', cadence: 'Harian' },
 { title: 'Lapor isu cawangan', description: 'Hantar report maintenance, emergency atau kekurangan staf.', href: '/maintenance', module: 'Maintenance', cadence: 'Ikut Keperluan' },
 ],
 },
 FINANCE: {
 label: 'Kewangan',
 companyScope: 'Kewangan syarikat dan cawangan berkaitan',
 primaryObjective: 'Reconcile kutipan, bank-in, pembayaran, payroll dan laporan kewangan.',
 sopSummary: 'Semak tunai tertunggak, pastikan bank-in lengkap, reconcile pembayaran ejen dan sediakan laporan kewangan berkala.',
 steps: [
 { title: 'Semak kutipan', description: 'Pantau cash outstanding, voucher penggunaan cash AM, bukti bank-in dan transaksi yang belum reconcile.', href: '/finance', module: 'Kewangan', cadence: 'Harian' },
 { title: 'Reconcile bayaran', description: 'Padankan bank-in, payment gateway dan rekod jualan.', href: '/finance', module: 'Reconciliation', cadence: 'Harian' },
 { title: 'Semak payroll', description: 'Sahkan payroll bersama HR sebelum pembayaran.', href: '/hr', module: 'Gaji', cadence: 'Bulanan' },
 { title: 'Laporan kewangan', description: 'Sediakan ringkasan jualan, kutipan dan perbelanjaan.', href: '/reports', module: 'Laporan', cadence: 'Mingguan' },
 ],
 },
 MAINTENANCE_MANAGER: {
 label: 'Manager Maintenance',
 companyScope: 'RKJ Distributor Sdn Bhd untuk semua cawangan Roti Kaya Junus',
 primaryObjective: 'Terima, tapis dan selesaikan report maintenance, emergency dan kekurangan staf semua cawangan.',
 sopSummary: 'Semak tiket baru, susun prioriti, kemaskini status, rekod tindakan dan aktifkan peranan staf ganti bila cawangan kekurangan staf.',
 steps: [
 { title: 'Semak tiket baru', description: 'Lihat report maintenance, staff shortage dan emergency dari staf/AM.', href: '/maintenance', module: 'Maintenance', cadence: 'Harian' },
 { title: 'Tetapkan prioriti tindakan', description: 'Utamakan isu safety, operasi POS, elektrik, equipment dan kekurangan staf.', href: '/maintenance', module: 'Maintenance', cadence: 'Harian' },
 { title: 'Kemaskini status kerja', description: 'Rekod tindakan, nota dan status IN_PROGRESS/RESOLVED.', href: '/maintenance', module: 'Maintenance', cadence: 'Harian' },
 { title: 'Bantu sebagai staf ganti', description: 'Semak laporan kekurangan staf dan hadir ke cawangan yang memerlukan bantuan.', href: '/shifts', module: 'Syif', cadence: 'Ikut Keperluan' },
 ],
 },
 SALES_AGENT: {
 label: 'Ejen Jualan RKJ Distributor',
 companyScope: 'RKJ Distributor Sdn Bhd',
 primaryObjective: 'Order stok mengikut group harga, pantau bayaran dan urus outlet/POS langganan jika diaktifkan.',
 sopSummary: 'Semak katalog harga, buat order, sahkan bayaran, lihat status penghantaran dan aktifkan POS RM200 sebulan per cawangan jika mahu daftar staf jualan/outlet POS.',
 steps: [
 { title: 'Semak katalog harga', description: 'Harga dipaparkan ikut group rate ejen yang ditetapkan RKJ Distributor.', href: '/sales-agent', module: 'Portal Ejen', cadence: 'Harian' },
 { title: 'Buat order stok', description: 'Pilih produk, kuantiti dan jadual penghantaran.', href: '/sales-agent', module: 'Order', cadence: 'Ikut Keperluan' },
 { title: 'Sahkan bayaran', description: 'Bayar online dan semak receipt/status payment.', href: '/sales-agent', module: 'Bayaran', cadence: 'Ikut Keperluan' },
 { title: 'Urus outlet POS', description: 'Tambah outlet, staf jualan dan langganan POS RM200/cawangan jika digunakan.', href: '/sales-agent', module: 'Outlet/POS', cadence: 'Bulanan' },
 ],
 },
};

export function getRoleWorkflow(input: WorkflowInput): RoleWorkflow {
 if (input.role === 'OPERATION_MANAGER') {
 const code = input.legalEntityCode as LegalEntityCode | null | undefined;
 const scoped = code && OPERATION_MANAGER_WORKFLOWS[code] ? OPERATION_MANAGER_WORKFLOWS[code] : ROLE_WORKFLOWS.OPERATION_MANAGER;
 return {...scoped,
 label: input.dashboardLabel ?? scoped.label,
 };
 }
 const base = ROLE_WORKFLOWS[input.role] ?? ROLE_WORKFLOWS.STAFF;
 return {...base,
 label: input.dashboardLabel ?? base.label,
 companyScope: base.companyScope.includes('masing-masing') || base.companyScope.includes('Mengikut')
 ? companyLabel(input.legalEntityCode)
 : base.companyScope,
 };
}

