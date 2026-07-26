import type { UserRole } from '@/types/enums';

export type LocalizedText = {
 ms: string;
 en: string;
};

export type RoleGuide = {
 role: UserRole;
 title: LocalizedText;
 purpose: LocalizedText;
 responsibilities: LocalizedText[];
 dailySop: LocalizedText[];
 escalation: LocalizedText;
};

export type ModuleGuide = {
 href: string;
 title: LocalizedText;
 summary: LocalizedText;
 steps: LocalizedText[];
};

const text = (ms: string, en: string): LocalizedText => ({ ms, en });

export const ROLE_GUIDES: RoleGuide[] = [
 {
 role: 'SUPER_ADMIN',
 title: text('Pentadbir Utama', 'Main Administrator'),
 purpose: text('Menjaga keselamatan, struktur dan kesinambungan keseluruhan RKJ One.', 'Protect the security, structure and continuity of RKJ One.'),
 responsibilities: [
 text('Urus akaun, peranan, kebenaran dan skop syarikat pengguna.', 'Manage user accounts, roles, permissions and company scopes.'),
 text('Pantau kesihatan operasi tiga syarikat dan semua cawangan.', 'Monitor operating health across all three companies and branches.'),
 text('Pastikan data induk, konfigurasi dan jejak audit sentiasa tepat.', 'Keep master data, configuration and audit trails accurate.'),
 text('Selesaikan insiden akses dan eskalasi berimpak tinggi.', 'Resolve access incidents and high-impact escalations.'),
 ],
 dailySop: [
 text('Semak Pusat Kawalan untuk amaran, kelulusan dan data luar biasa.', 'Review Control Center alerts, approvals and unusual data.'),
 text('Semak permintaan akaun atau perubahan akses; guna prinsip akses minimum.', 'Review account or access requests; apply least privilege.'),
 text('Sahkan syarikat, cawangan dan peranan sebelum menyimpan perubahan pengguna.', 'Confirm company, branch and role before saving a user change.'),
 text('Uji perubahan kritikal menggunakan akaun peranan berkaitan.', 'Test critical changes using the relevant role account.'),
 text('Rekod sebab perubahan dan maklumkan pemilik proses terlibat.', 'Record the reason for changes and notify the relevant process owner.'),
 text('Tutup sesi pada peranti awam dan semak semula isu belum selesai.', 'Sign out from shared devices and revisit unresolved issues.'),
 ],
 escalation: text('Eskalasi segera jika akses tanpa kebenaran, kehilangan data atau operasi utama terhenti.', 'Escalate immediately for unauthorized access, data loss or a halted core operation.'),
 },
 {
 role: 'ADMIN',
 title: text('Pentadbir HQ', 'HQ Administrator'),
 purpose: text('Menyelaras pengguna, cawangan dan operasi harian di peringkat HQ.', 'Coordinate users, branches and daily operations at HQ level.'),
 responsibilities: [
 text('Daftar dan kemas kini pengguna yang telah diluluskan.', 'Register and update approved users.'),
 text('Pastikan pengguna dipautkan kepada syarikat dan lokasi yang betul.', 'Ensure users are linked to the correct company and location.'),
 text('Pantau isu operasi, inventori dan pematuhan data.', 'Monitor operational, inventory and data-compliance issues.'),
 text('Sokong pengguna serta salurkan isu teknikal dengan bukti lengkap.', 'Support users and route technical issues with complete evidence.'),
 ],
 dailySop: [
 text('Semak notifikasi, pengguna tidak aktif dan tugasan tertunggak.', 'Review notifications, inactive users and pending tasks.'),
 text('Sahkan arahan pengurus sebelum cipta, nyahaktif atau ubah akses.', 'Confirm management instruction before creating, disabling or changing access.'),
 text('Masukkan data pengguna, peranan dan lokasi dengan tepat.', 'Enter user, role and location data accurately.'),
 text('Semak hasil perubahan melalui profil atau paparan modul pengguna.', 'Verify the result through the user profile or module view.'),
 text('Bantu pertanyaan operasi mengikut pemilik modul.', 'Assist operational queries through the correct module owner.'),
 text('Simpan rujukan kelulusan dan status penyelesaian.', 'Retain the approval reference and resolution status.'),
 ],
 escalation: text('Rujuk Pentadbir Utama untuk perubahan akses luas, insiden keselamatan atau konfigurasi global.', 'Refer broad access changes, security incidents or global configuration to the Main Administrator.'),
 },
 {
 role: 'HR',
 title: text('Sumber Manusia', 'Human Resources'),
 purpose: text('Memastikan rekod pekerja, kehadiran dan urusan tenaga kerja lengkap serta sulit.', 'Keep workforce, attendance and employment records complete and confidential.'),
 responsibilities: [
 text('Selenggara profil dan status pekerjaan kakitangan.', 'Maintain employee profiles and employment status.'),
 text('Semak kehadiran, cuti, syif dan pengecualian HR.', 'Review attendance, leave, shifts and HR exceptions.'),
 text('Sediakan input gaji serta laporan tenaga kerja yang disahkan.', 'Prepare verified payroll inputs and workforce reports.'),
 text('Lindungi kerahsiaan data peribadi pekerja.', 'Protect employee personal-data confidentiality.'),
 ],
 dailySop: [
 text('Semak permohonan, ketidakhadiran dan rekod yang tidak lengkap.', 'Review requests, absences and incomplete records.'),
 text('Sahkan identiti pekerja, tarikh kuat kuasa dan dokumen sokongan.', 'Verify employee identity, effective date and supporting documents.'),
 text('Kemas kini hanya rekod yang telah disahkan.', 'Update only verified records.'),
 text('Semak semula ringkasan kehadiran dan input gaji sebelum dihantar.', 'Recheck attendance summaries and payroll inputs before submission.'),
 text('Maklumkan pekerja atau pengurus tentang keputusan dan tindakan susulan.', 'Notify the employee or manager of decisions and follow-up actions.'),
 text('Hadkan perkongsian maklumat kepada pihak yang dibenarkan.', 'Limit information sharing to authorized parties.'),
 ],
 escalation: text('Rujuk pengurusan bagi pertikaian disiplin, gaji, dokumen meragukan atau pendedahan data peribadi.', 'Escalate disciplinary or payroll disputes, suspicious documents or personal-data exposure to management.'),
 },
 {
 role: 'OPERATION_MANAGER',
 title: text('Pengurus Operasi', 'Operations Manager'),
 purpose: text('Memastikan operasi kilang, pengedaran dan cawangan berjalan mengikut sasaran.', 'Keep factory, distribution and branch operations running to target.'),
 responsibilities: [
 text('Pantau jualan, stok, syif, logistik dan gangguan operasi.', 'Monitor sales, stock, shifts, logistics and operating disruptions.'),
 text('Selaras tindakan antara HQ, kawasan dan pemilik modul.', 'Coordinate action between HQ, areas and module owners.'),
 text('Nilai serta luluskan tindakan operasi dalam had kuasa.', 'Assess and approve operational actions within authority.'),
 text('Pastikan tindakan pembetulan ditutup dan boleh diaudit.', 'Ensure corrective actions are closed and auditable.'),
 ],
 dailySop: [
 text('Mulakan hari dengan KPI, stok kritikal, POS dan kelulusan tertunggak.', 'Start with KPIs, critical stock, POS status and pending approvals.'),
 text('Utamakan isu keselamatan, jualan terhenti dan kekurangan stok.', 'Prioritize safety, halted sales and stock shortages.'),
 text('Tetapkan pemilik tindakan dan masa siap bagi setiap isu.', 'Assign an owner and due time for each issue.'),
 text('Sahkan bukti sebelum meluluskan pelarasan atau perbelanjaan.', 'Verify evidence before approving adjustments or spending.'),
 text('Pantau kemajuan pada tengah hari dan sebelum tamat operasi.', 'Check progress at midday and before end of operations.'),
 text('Catat keputusan, risiko berbaki dan serahan syif.', 'Record decisions, residual risks and shift handovers.'),
 ],
 escalation: text('Maklumkan pemilik bagi risiko kewangan besar, keselamatan, pematuhan atau operasi berpanjangan.', 'Notify the owner of major financial, safety, compliance or prolonged operational risk.'),
 },
 {
 role: 'CEO_FACTORY',
 title: text('CEO Kilang', 'Factory CEO'),
 purpose: text('Memimpin prestasi, kapasiti, kos dan pematuhan operasi kilang.', 'Lead factory performance, capacity, cost and compliance.'),
 responsibilities: [
 text('Pantau pengeluaran, bahan mentah, hasil dan varians.', 'Monitor production, raw materials, yield and variance.'),
 text('Pastikan rancangan pengeluaran sejajar dengan permintaan.', 'Align production plans with demand.'),
 text('Luluskan keputusan kilang mengikut had kuasa.', 'Approve factory decisions within delegated authority.'),
 text('Pastikan isu mutu dan keselamatan ditangani segera.', 'Ensure quality and safety issues are addressed promptly.'),
 ],
 dailySop: [
 text('Semak rancangan pengeluaran, stok kritikal dan kapasiti hari ini.', 'Review today’s production plan, critical stock and capacity.'),
 text('Bandingkan output sebenar dengan sasaran dan penggunaan bahan.', 'Compare actual output with target and material usage.'),
 text('Sahkan punca varians dengan bukti operasi.', 'Validate variance causes with operational evidence.'),
 text('Putuskan tindakan pembetulan atau kelulusan yang diperlukan.', 'Decide on corrective actions or required approvals.'),
 text('Semak kesiapsiagaan penghantaran dan keperluan hari berikutnya.', 'Review dispatch readiness and next-day requirements.'),
 text('Rekod keputusan dan risiko yang perlu dipantau.', 'Record decisions and risks requiring monitoring.'),
 ],
 escalation: text('Hentikan dan eskalasi proses yang menjejaskan keselamatan makanan, pekerja atau pematuhan.', 'Stop and escalate any process affecting food, worker or compliance safety.'),
 },
 {
 role: 'AREA_MANAGER',
 title: text('Pengurus Kawasan', 'Area Manager'),
 purpose: text('Menjamin prestasi dan pematuhan cawangan dalam kawasan yang ditetapkan.', 'Ensure performance and compliance across assigned branches.'),
 responsibilities: [
 text('Pantau jualan, tunai, stok, staf dan operasi setiap cawangan.', 'Monitor sales, cash, stock, staff and operations in each branch.'),
 text('Sahkan pelarasan dan permintaan cawangan dengan bukti.', 'Validate branch adjustments and requests with evidence.'),
 text('Bimbing ketua syif serta susun tindakan pemulihan.', 'Coach shift leads and organize recovery actions.'),
 text('Eskalasi risiko yang melebihi kuasa kawasan.', 'Escalate risks beyond area authority.'),
 ],
 dailySop: [
 text('Semak ringkasan semua cawangan dan kenal pasti pengecualian.', 'Review all branch summaries and identify exceptions.'),
 text('Hubungi cawangan terjejas untuk mengesahkan keadaan sebenar.', 'Contact affected branches to verify actual conditions.'),
 text('Semak bukti jualan, tunai, stok atau penyelenggaraan.', 'Review sales, cash, stock or maintenance evidence.'),
 text('Lulus, tolak atau pulangkan permintaan dengan alasan jelas.', 'Approve, reject or return requests with a clear reason.'),
 text('Pantau tindakan pembetulan sehingga selesai.', 'Monitor corrective actions through completion.'),
 text('Sediakan serahan ringkas kepada Pengurus Operasi.', 'Provide a concise handover to the Operations Manager.'),
 ],
 escalation: text('Eskalasi kehilangan tunai, stok besar, isu keselamatan atau cawangan tidak dapat beroperasi.', 'Escalate cash loss, major stock issues, safety incidents or an inoperable branch.'),
 },
 {
 role: 'DRIVER',
 title: text('Pemandu', 'Driver'),
 purpose: text('Menghantar barangan dengan selamat, tepat dan mempunyai bukti serahan lengkap.', 'Deliver goods safely, accurately and with complete proof of delivery.'),
 responsibilities: [
 text('Periksa kenderaan, muatan dan dokumen sebelum bergerak.', 'Inspect the vehicle, load and documents before departure.'),
 text('Ikut laluan dan jadual yang diluluskan.', 'Follow the approved route and schedule.'),
 text('Rekod status perjalanan dan bukti serahan.', 'Record trip status and proof of delivery.'),
 text('Laporkan kerosakan, kemalangan atau perbezaan muatan segera.', 'Report breakdowns, accidents or load discrepancies immediately.'),
 ],
 dailySop: [
 text('Daftar masuk dan semak tugasan serta kenderaan yang diberikan.', 'Check in and review the assigned task and vehicle.'),
 text('Lengkapkan pemeriksaan keselamatan sebelum perjalanan.', 'Complete the pre-trip safety inspection.'),
 text('Kira serta padankan muatan dengan dokumen penghantaran.', 'Count and match the load against dispatch documents.'),
 text('Kemas kini status pada setiap peringkat perjalanan.', 'Update status at each trip stage.'),
 text('Dapatkan pengesahan penerima dan bukti serahan.', 'Obtain recipient confirmation and proof of delivery.'),
 text('Laporkan baki, pemulangan dan keadaan kenderaan selepas tugasan.', 'Report balances, returns and vehicle condition after the task.'),
 ],
 escalation: text('Berhenti di lokasi selamat dan hubungi penyelia jika berlaku kemalangan, ancaman keselamatan atau kerosakan kenderaan.', 'Stop safely and contact a supervisor for an accident, safety threat or vehicle breakdown.'),
 },
 {
 role: 'STAFF',
 title: text('Staf Cawangan', 'Branch Staff'),
 purpose: text('Melaksanakan jualan dan operasi cawangan dengan tepat, bersih dan mesra pelanggan.', 'Run branch sales and operations accurately, cleanly and with good service.'),
 responsibilities: [
 text('Rekod semua jualan melalui POS dan ikut kaedah bayaran sebenar.', 'Record every sale in POS using the actual payment method.'),
 text('Jaga tunai, stok, kebersihan dan peralatan syif.', 'Safeguard cash, stock, cleanliness and shift equipment.'),
 text('Catat pembaziran, pelarasan dan kejadian dengan bukti.', 'Record waste, adjustments and incidents with evidence.'),
 text('Lengkapkan buka/tutup syif serta serahan kepada staf berikutnya.', 'Complete shift opening/closing and handover to the next staff member.'),
 ],
 dailySop: [
 text('Daftar masuk syif, semak terminal, tunai awal dan stok utama.', 'Check in, then verify the terminal, opening cash and key stock.'),
 text('Masukkan setiap pesanan dengan item, kuantiti dan bayaran yang betul.', 'Enter each order with the correct item, quantity and payment.'),
 text('Jangan kongsi akaun atau tinggalkan POS tanpa dikunci.', 'Do not share accounts or leave POS unlocked.'),
 text('Rekod stok masuk, penggunaan, pembaziran dan perbezaan semasa berlaku.', 'Record receipts, usage, waste and discrepancies when they occur.'),
 text('Kira tunai serta stok semasa penutupan dan catat perbezaan.', 'Count cash and stock at closing and record any difference.'),
 text('Serah status, isu dan bukti kepada ketua syif atau pengurus.', 'Hand over status, issues and evidence to the shift lead or manager.'),
 ],
 escalation: text('Hubungi pengurus segera untuk kekurangan tunai, transaksi mencurigakan, kecederaan atau peralatan tidak selamat.', 'Contact the manager immediately for cash shortages, suspicious transactions, injury or unsafe equipment.'),
 },
 {
 role: 'FINANCE',
 title: text('Kewangan', 'Finance'),
 purpose: text('Memastikan transaksi, rekonsiliasi dan laporan kewangan tepat serta boleh diaudit.', 'Keep transactions, reconciliations and financial reporting accurate and auditable.'),
 responsibilities: [
 text('Semak jualan, tunai, pembayaran dan dokumen sokongan.', 'Review sales, cash, payments and supporting documents.'),
 text('Laksanakan rekonsiliasi dan siasat varians.', 'Perform reconciliations and investigate variances.'),
 text('Sediakan laporan serta input kewangan yang disahkan.', 'Prepare verified financial reports and inputs.'),
 text('Jaga pemisahan tugas dan jejak kelulusan.', 'Maintain segregation of duties and approval trails.'),
 ],
 dailySop: [
 text('Semak transaksi baharu, tunai tertunggak dan pengecualian.', 'Review new transactions, outstanding cash and exceptions.'),
 text('Padankan amaun dengan sumber, tarikh, cawangan dan bukti.', 'Match amounts to source, date, branch and evidence.'),
 text('Tandakan varians dan dapatkan penjelasan pemilik transaksi.', 'Flag variances and obtain the transaction owner’s explanation.'),
 text('Hantar perkara yang memerlukan kelulusan kepada pegawai berkuasa.', 'Send items requiring approval to the authorized approver.'),
 text('Rekod pelarasan hanya selepas kelulusan dan simpan rujukannya.', 'Post adjustments only after approval and retain the reference.'),
 text('Sahkan ringkasan akhir dan senarai perkara tertunggak.', 'Confirm the final summary and outstanding-item list.'),
 ],
 escalation: text('Eskalasi transaksi luar biasa, bukti palsu, varians berulang atau potensi penipuan tanpa berlengah.', 'Escalate unusual transactions, false evidence, recurring variance or suspected fraud without delay.'),
 },
 {
 role: 'MAINTENANCE_MANAGER',
 title: text('Pengurus Penyelenggaraan', 'Maintenance Manager'),
 purpose: text('Memastikan aset selamat, tersedia dan dibaiki mengikut keutamaan operasi.', 'Keep assets safe, available and repaired according to operational priority.'),
 responsibilities: [
 text('Triage aduan dan tentukan tahap kritikal.', 'Triage requests and determine criticality.'),
 text('Agih juruteknik, alat ganti dan tarikh siap.', 'Assign technicians, parts and completion dates.'),
 text('Pastikan bukti sebelum/selepas serta kos direkod.', 'Ensure before/after evidence and costs are recorded.'),
 text('Pantau penyelenggaraan pencegahan dan isu berulang.', 'Monitor preventive maintenance and recurring issues.'),
 ],
 dailySop: [
 text('Semak tiket baharu, tertunggak dan aset kritikal.', 'Review new and overdue tickets and critical assets.'),
 text('Sahkan lokasi, gejala, risiko dan bukti aduan.', 'Verify location, symptoms, risk and request evidence.'),
 text('Tetapkan keutamaan serta pemilik kerja.', 'Set the priority and work owner.'),
 text('Kemas kini status, penggunaan alat ganti dan jangkaan siap.', 'Update status, parts usage and expected completion.'),
 text('Uji aset dan dapatkan pengesahan pengguna sebelum menutup tiket.', 'Test the asset and obtain user confirmation before closing.'),
 text('Analisis isu berulang untuk tindakan pencegahan.', 'Analyze recurring issues for preventive action.'),
 ],
 escalation: text('Asingkan aset dan eskalasi segera jika ada risiko elektrik, kebakaran, makanan atau kecederaan.', 'Isolate the asset and escalate immediately for electrical, fire, food or injury risk.'),
 },
 {
 role: 'SALES_AGENT',
 title: text('Ejen Jualan', 'Sales Agent'),
 purpose: text('Mengurus pesanan dan pelanggan ejen secara tepat dalam skop sendiri.', 'Manage agent orders and customers accurately within the assigned scope.'),
 responsibilities: [
 text('Daftar pesanan pelanggan dengan item, kuantiti dan harga yang betul.', 'Enter customer orders with the correct items, quantities and prices.'),
 text('Sahkan maklumat pelanggan, penghantaran dan pembayaran.', 'Verify customer, delivery and payment details.'),
 text('Pantau status pesanan serta maklumkan perubahan kepada pelanggan.', 'Monitor order status and communicate changes to customers.'),
 text('Lindungi data pelanggan dan gunakan akaun sendiri sahaja.', 'Protect customer data and use only the assigned account.'),
 ],
 dailySop: [
 text('Semak pesanan, jadual dan tindakan tertunggak.', 'Review orders, schedule and pending actions.'),
 text('Sahkan pelanggan, produk, kuantiti, harga dan tarikh diperlukan.', 'Confirm customer, product, quantity, price and required date.'),
 text('Masukkan pesanan sekali sahaja dan semak sebelum dihantar.', 'Enter the order once and review it before submission.'),
 text('Pantau penerimaan atau perubahan status daripada HQ.', 'Monitor acceptance or status changes from HQ.'),
 text('Kemas kini pelanggan menggunakan maklumat yang telah disahkan.', 'Update customers using verified information.'),
 text('Rekod pembatalan, pemulangan atau aduan dengan sebab dan bukti.', 'Record cancellations, returns or complaints with reasons and evidence.'),
 ],
 escalation: text('Rujuk HQ untuk harga luar senarai, stok tidak mencukupi, pertikaian bayaran atau pesanan luar biasa.', 'Refer off-list pricing, insufficient stock, payment disputes or unusual orders to HQ.'),
 },
];

export const MODULE_GUIDES: ModuleGuide[] = [
 {
 href: '/dashboard',
 title: text('Pusat Kawalan', 'Control Center'),
 summary: text('Lihat KPI, amaran dan tindakan penting mengikut skop anda.', 'View KPIs, alerts and important actions within your scope.'),
 steps: [
 text('Semak kad amaran dan nilai yang belum dimuatkan.', 'Review alert cards and values that have not loaded.'),
 text('Buka item yang memerlukan tindakan atau pengesahan.', 'Open items requiring action or verification.'),
 text('Gunakan ringkasan sebagai petunjuk; sahkan pada modul sumber sebelum membuat keputusan.', 'Use summaries as indicators; verify in the source module before deciding.'),
 ],
 },
 {
 href: '/admin',
 title: text('Pentadbiran Pengguna', 'User Administration'),
 summary: text('Urus akaun, peranan, lokasi dan status akses.', 'Manage accounts, roles, locations and access status.'),
 steps: [
 text('Pastikan permintaan akses telah diluluskan.', 'Ensure the access request is approved.'),
 text('Pilih peranan, syarikat dan lokasi paling minimum yang diperlukan.', 'Select the minimum required role, company and location.'),
 text('Sahkan perubahan dan simpan rujukan kelulusan.', 'Verify the change and retain the approval reference.'),
 ],
 },
 {
 href: '/factory',
 title: text('Kilang', 'Factory'),
 summary: text('Pantau rancangan pengeluaran, bahan, output dan varians.', 'Monitor production plans, materials, output and variance.'),
 steps: [
 text('Semak rancangan dan ketersediaan bahan.', 'Review the plan and material availability.'),
 text('Rekod output serta penggunaan sebenar pada masa kejadian.', 'Record actual output and usage when they occur.'),
 text('Siasat varians dan lampirkan bukti sebelum pelarasan.', 'Investigate variance and attach evidence before adjustment.'),
 ],
 },
 {
 href: '/warehouse',
 title: text('HQ Distributor', 'HQ Distributor'),
 summary: text('Kawal penerimaan, simpanan, pergerakan dan penghantaran stok HQ.', 'Control HQ stock receiving, storage, movement and dispatch.'),
 steps: [
 text('Padankan barang dengan dokumen sebelum penerimaan.', 'Match goods to documents before receiving.'),
 text('Rekod kuantiti dan lokasi simpanan yang sebenar.', 'Record the actual quantity and storage location.'),
 text('Sahkan pengeluaran dan baki dengan bukti serahan.', 'Confirm issues and balances with delivery evidence.'),
 ],
 },
 {
 href: '/fleet',
 title: text('Logistik', 'Logistics'),
 summary: text('Rancang perjalanan, kenderaan, pemandu dan bukti penghantaran.', 'Plan trips, vehicles, drivers and delivery evidence.'),
 steps: [
 text('Sahkan tugasan, muatan dan kelayakan kenderaan.', 'Verify the task, load and vehicle readiness.'),
 text('Pantau status perjalanan serta pengecualian.', 'Monitor trip status and exceptions.'),
 text('Tutup perjalanan selepas bukti serahan dan pemulangan lengkap.', 'Close the trip after delivery and return evidence is complete.'),
 ],
 },
 {
 href: '/sales-agent',
 title: text('Portal Ejen', 'Agent Portal'),
 summary: text('Urus pesanan, pelanggan dan prestasi ejen.', 'Manage agent orders, customers and performance.'),
 steps: [
 text('Semak pelanggan, item, harga dan tarikh.', 'Review customer, item, price and date.'),
 text('Hantar pesanan lengkap tanpa pendua.', 'Submit a complete, non-duplicate order.'),
 text('Pantau status dan rekod sebarang perubahan.', 'Monitor status and record any change.'),
 ],
 },
 {
 href: '/branches',
 title: text('Cawangan', 'Branches'),
 summary: text('Banding prestasi dan keadaan operasi cawangan.', 'Compare branch performance and operating condition.'),
 steps: [
 text('Pilih cawangan atau kawasan yang betul.', 'Select the correct branch or area.'),
 text('Semak jualan, stok, staf dan pengecualian bersama.', 'Review sales, stock, staff and exceptions together.'),
 text('Tetapkan tindakan, pemilik dan tarikh siap.', 'Assign an action, owner and due date.'),
 ],
 },
 {
 href: '/pos',
 title: text('POS', 'POS'),
 summary: text('Rekod jualan, bayaran dan pembatalan dengan tepat.', 'Record sales, payments and voids accurately.'),
 steps: [
 text('Sahkan terminal, syif dan pengguna sebelum transaksi.', 'Confirm terminal, shift and user before a transaction.'),
 text('Semak item, kuantiti, diskaun dan kaedah bayaran.', 'Review item, quantity, discount and payment method.'),
 text('Keluarkan resit; pembatalan mesti mempunyai sebab dan kebenaran.', 'Issue a receipt; voids require a reason and authorization.'),
 ],
 },
 {
 href: '/inventory',
 title: text('Inventori', 'Inventory'),
 summary: text('Kawal stok masuk, penggunaan, kiraan dan pelarasan.', 'Control receipts, usage, counts and adjustments.'),
 steps: [
 text('Pilih lokasi dan item yang betul.', 'Select the correct location and item.'),
 text('Rekod pergerakan pada masa sebenar dengan rujukan.', 'Record movement in real time with a reference.'),
 text('Kira semula dan dapatkan kelulusan sebelum pelarasan.', 'Recount and obtain approval before adjustment.'),
 ],
 },
 {
 href: '/shifts',
 title: text('Syif', 'Shifts'),
 summary: text('Urus buka/tutup syif, kehadiran dan serahan.', 'Manage shift opening/closing, attendance and handover.'),
 steps: [
 text('Daftar masuk menggunakan akaun sendiri.', 'Check in using your own account.'),
 text('Rekod kejadian dan perbezaan semasa syif.', 'Record incidents and discrepancies during the shift.'),
 text('Lengkapkan kiraan serta serahan sebelum menutup syif.', 'Complete counts and handover before closing the shift.'),
 ],
 },
 {
 href: '/maintenance',
 title: text('Penyelenggaraan', 'Maintenance'),
 summary: text('Lapor, triage, baiki dan sahkan isu aset.', 'Report, triage, repair and verify asset issues.'),
 steps: [
 text('Nyatakan aset, lokasi, gejala dan tahap risiko.', 'State the asset, location, symptom and risk level.'),
 text('Lampirkan gambar dan elakkan penggunaan aset tidak selamat.', 'Attach photos and avoid using unsafe assets.'),
 text('Tutup tiket hanya selepas ujian dan pengesahan pengguna.', 'Close only after testing and user confirmation.'),
 ],
 },
 {
 href: '/hr',
 title: text('HR & Gaji', 'HR & Payroll'),
 summary: text('Urus rekod pekerja, kehadiran dan input gaji secara sulit.', 'Manage employee records, attendance and payroll inputs confidentially.'),
 steps: [
 text('Sahkan pekerja dan tarikh kuat kuasa.', 'Verify the employee and effective date.'),
 text('Semak bukti sebelum mengubah rekod.', 'Review evidence before changing a record.'),
 text('Hadkan akses dan semak hasil sebelum dihantar.', 'Limit access and review the result before submission.'),
 ],
 },
 {
 href: '/finance',
 title: text('Kewangan', 'Finance'),
 summary: text('Semak transaksi, tunai, rekonsiliasi dan varians.', 'Review transactions, cash, reconciliations and variance.'),
 steps: [
 text('Padankan amaun, tarikh, cawangan dan bukti.', 'Match amount, date, branch and evidence.'),
 text('Siasat varians dengan pemilik transaksi.', 'Investigate variance with the transaction owner.'),
 text('Rekod pelarasan hanya selepas kelulusan.', 'Record adjustments only after approval.'),
 ],
 },
 {
 href: '/bookings',
 title: text('Jadual Operasi', 'Operations Schedule'),
 summary: text('Susun tempahan, tugasan dan penggunaan sumber.', 'Schedule bookings, tasks and resource use.'),
 steps: [
 text('Semak tarikh, lokasi, kapasiti dan pemilik.', 'Check date, location, capacity and owner.'),
 text('Elakkan pertindihan sebelum mengesahkan.', 'Avoid conflicts before confirmation.'),
 text('Maklumkan perubahan kepada semua pihak terlibat.', 'Notify all affected parties of changes.'),
 ],
 },
 {
 href: '/reports',
 title: text('Laporan', 'Reports'),
 summary: text('Tapis, semak dan eksport maklumat operasi.', 'Filter, verify and export operational information.'),
 steps: [
 text('Pilih tempoh, syarikat dan lokasi yang tepat.', 'Select the correct period, company and location.'),
 text('Semak jumlah dengan modul sumber.', 'Cross-check totals with the source module.'),
 text('Lindungi fail eksport dan kongsi kepada penerima dibenarkan sahaja.', 'Protect exported files and share only with authorized recipients.'),
 ],
 },
 {
 href: '/approvals',
 title: text('Kelulusan', 'Approvals'),
 summary: text('Nilai permintaan berdasarkan bukti dan had kuasa.', 'Assess requests against evidence and delegated authority.'),
 steps: [
 text('Semak pemohon, amaun, sebab dan dokumen.', 'Review requester, amount, reason and documents.'),
 text('Pastikan tiada konflik kepentingan dan had kuasa dipatuhi.', 'Ensure no conflict of interest and authority limits are observed.'),
 text('Lulus, tolak atau pulangkan dengan alasan yang jelas.', 'Approve, reject or return with a clear reason.'),
 ],
 },
 {
 href: '/settings',
 title: text('Tetapan', 'Settings'),
 summary: text('Urus konfigurasi yang mempengaruhi cara sistem beroperasi.', 'Manage configuration that affects system behavior.'),
 steps: [
 text('Kenal pasti kesan perubahan dan pihak yang terlibat.', 'Identify the change impact and affected parties.'),
 text('Dapatkan kelulusan serta rekod nilai asal.', 'Obtain approval and record the original value.'),
 text('Uji selepas simpan dan sediakan kaedah pemulihan.', 'Test after saving and retain a recovery method.'),
 ],
 },
];

export const COMMON_SOP = [
 {
 title: text('Mula kerja', 'Start work'),
 steps: [
 text('Log masuk menggunakan akaun sendiri dan jangan kongsi kata laluan.', 'Sign in with your own account and never share passwords.'),
 text('Sahkan nama, peranan, syarikat, cawangan dan tarikh pada skrin.', 'Confirm your name, role, company, branch and date on screen.'),
 text('Semak Pusat Kawalan, notifikasi dan tugasan tertunggak.', 'Review Control Center, notifications and pending tasks.'),
 ],
 },
 {
 title: text('Rekod transaksi atau kerja', 'Record a transaction or task'),
 steps: [
 text('Pilih rekod, lokasi dan tempoh yang betul sebelum menaip.', 'Select the correct record, location and period before entry.'),
 text('Masukkan maklumat berdasarkan kejadian sebenar; jangan anggar tanpa kebenaran.', 'Enter actual information; do not estimate without authorization.'),
 text('Semak angka, tarikh dan lampiran sebelum menekan Simpan atau Hantar.', 'Check figures, dates and attachments before Save or Submit.'),
 ],
 },
 {
 title: text('Pembetulan data', 'Correct data'),
 steps: [
 text('Jangan cipta rekod kedua untuk menutup kesilapan.', 'Do not create a second record to conceal an error.'),
 text('Catat sebab, bukti dan minta kelulusan jika pelarasan diperlukan.', 'Record the reason and evidence, and request approval when adjustment is needed.'),
 text('Semak laporan selepas pembetulan untuk memastikan kesannya tepat.', 'Review reports after correction to confirm the effect is accurate.'),
 ],
 },
 {
 title: text('Tamat kerja dan serahan', 'End work and handover'),
 steps: [
 text('Selesaikan atau tandakan semua tugas yang masih terbuka.', 'Complete or flag every open task.'),
 text('Serahkan isu, amaun, stok dan tindakan seterusnya kepada pengguna berikutnya.', 'Hand over issues, amounts, stock and next actions to the next user.'),
 text('Log keluar sepenuhnya, terutama pada peranti yang dikongsi.', 'Sign out fully, especially on shared devices.'),
 ],
 },
];

export const MANUAL_FAQ = [
 {
 question: text('Saya terlupa kata laluan. Apa perlu dibuat?', 'I forgot my password. What should I do?'),
 answer: text('Hubungi pentadbir yang sah. Jangan gunakan akaun rakan sekerja. Selepas kata laluan ditetapkan semula, tukar kepada kata laluan peribadi dan log keluar sesi lama.', 'Contact an authorized administrator. Never use a colleague’s account. After a reset, choose a private password and sign out old sessions.'),
 },
 {
 question: text('Saya tidak nampak modul atau cawangan yang diperlukan.', 'I cannot see the module or branch I need.'),
 answer: text('Semak peranan dan syarikat pada profil. Minta pengurus menghantar permintaan akses kepada pentadbir; akses hanya diberi mengikut keperluan kerja.', 'Check your profile role and company. Ask your manager to send an access request to an administrator; access is granted only as required.'),
 },
 {
 question: text('Data tidak dimuatkan atau paparan ralat.', 'Data does not load or an error appears.'),
 answer: text('Semak internet, muat semula sekali dan jangan hantar transaksi berulang. Jika berterusan, catat masa, halaman, tindakan terakhir dan tangkap layar untuk pentadbir.', 'Check connectivity, refresh once and do not resubmit a transaction repeatedly. If it persists, record the time, page and last action, then capture the screen for an administrator.'),
 },
 {
 question: text('Bagaimana hendak membuat keputusan kelulusan?', 'How should I make an approval decision?'),
 answer: text('Semak pemohon, sebab, amaun, had kuasa dan bukti. Pulangkan permintaan yang tidak lengkap. Nyatakan alasan bagi setiap kelulusan atau penolakan.', 'Review requester, reason, amount, authority limit and evidence. Return incomplete requests. State a reason for each approval or rejection.'),
 },
 {
 question: text('Bagaimana hendak menukar bahasa?', 'How do I change the language?'),
 answer: text('Gunakan suis BM/EN di bahagian atas. Pilihan anda digunakan pada navigasi dan kandungan panduan.', 'Use the BM/EN switch at the top. Your choice applies to navigation and guide content.'),
 },
];
