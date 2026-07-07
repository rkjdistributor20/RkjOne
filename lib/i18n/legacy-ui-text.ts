import type { Locale } from "@/lib/i18n/dictionary";

const enText: Record<string, string> = {
  // Common
  Simpan: "Save",
  Batal: "Cancel",
  Tutup: "Close",
  Kemaskini: "Update",
  Edit: "Edit",
  Delete: "Delete",
  View: "View",
  Download: "Download",
  Tambah: "Add",
  Hantar: "Submit",
  Refresh: "Refresh",
  Cari: "Search",
  Status: "Status",
  Tindakan: "Actions",
  Ringkasan: "Summary",
  Sejarah: "History",
  Laporan: "Reports",
  Syif: "Shifts",
  Dokumen: "Documents",
  Kategori: "Category",
  Tempoh: "Period",
  Nota: "Notes",
  Jumlah: "Total",
  Gaji: "Payroll",
  Buka: "Open",
  Tiada: "None",
  Menunggu: "Waiting",
  Aktif: "Active",
  aktif: "active",
  "Tidak Aktif": "Inactive",
  Selesai: "Completed",
  Dirancang: "Planned",
  Kritikal: "Critical",
  kritikal: "critical",
  Rendah: "Low",
  rendah: "low",
  Lengkap: "Complete",
  Kawasan: "Area",
  Kehadiran: "Attendance",
  Bayaran: "Payment",
  "Laporan Jualan": "Sales Report",
  "Staf kiosk": "Kiosk staff",
  "Staf Kiosk": "Kiosk Staff",
  "POS buka": "POS open",
  "Menunggu terima": "Waiting to receive",
  "Pickup Ejen": "Agent pickup",
  "Paparan sahaja": "View only",
  "Tiada rekod": "No records",
  "Tiada sejarah": "No history",
  "Sebab (pilihan)": "Reason (optional)",
  "Pilih syarikat": "Select company",
  "Pilih cawangan": "Select branch",
  "Pilih kategori": "Select category",
  "Pilih item": "Select item",
  "Pilih sebab wajib": "Select required reason",
  "HR Syarikat": "Company HR",
  "Laluan kerja utama": "Main Work Path",
  "Ritma Kerja Harian": "Daily Work Rhythm",
  "Hubungan Kerja": "Work Relationships",
  "Terima route": "Receive route",
  "Hantar & POD": "Deliver & POD",
  "Lapor isu": "Report issue",
  "Pantau kawasan": "Monitor area",
  "Arah staf": "Guide staff",
  "Sahkan exception": "Approve exceptions",
  "Lapor OM": "Report to OM",
  "Buka syif": "Open shift",
  "Sahkan stok": "Confirm stock",
  "Semak harga": "Check pricing",
  "Order stok": "Order stock",
  "Terima stok": "Receive stock",
  "Urus POS": "Manage POS",
  "Terima kilang": "Receive factory output",
  "Rancang route": "Plan routes",
  "Arah driver": "Dispatch drivers",
  "Pantau ejen": "Monitor agents",
  "Terima order": "Receive orders",
  "Rancang production": "Plan production",
  "Rekod bahan": "Record materials",
  "Serah stok": "Hand off stock",
  "Pantau cawangan": "Monitor branches",
  "Arah AM": "Guide AM",
  "Lapor owner": "Report to owner",
  "Pantau exception": "Monitor exceptions",
  Delegate: "Delegate",
  "Sahkan risiko": "Approve risk",
  "Audit hasil": "Audit outcomes",
  "Semak tugas": "Review task",
  "Laksana SOP": "Execute SOP",
  "Rekod bukti": "Record evidence",
  "Sahkan selesai": "Confirm completion",
  "Handoff kilang ke HQ Distributor": "Factory handoff to Distributor HQ",
  "Arahan route kepada driver": "Route instructions to drivers",
  "Exception cawangan kepada AM/OM": "Branch exceptions to AM/OM",
  "Order dan group rate ejen": "Agent orders and group rates",
  "Route harian diterima": "Daily route received",
  "Serahan stok ke cawangan/ejen": "Stock handoff to branch/agent",
  "Beza stok perlu disahkan": "Stock differences need approval",
  "Isu kenderaan atau route": "Vehicle or route issue",
  "Sasaran harian kawasan": "Daily area targets",
  "Arahan operasi cawangan": "Branch operation instructions",
  "Pengesahan stok dan isu": "Stock and issue approval",
  "Escalation kepada OM": "Escalation to OM",
  "Arahan syif dan kiosk": "Shift and kiosk instructions",
  "Delivery masuk cawangan": "Incoming branch delivery",
  "Jualan dan stok POS": "POS sales and stock",
  "Laporan isu kepada AM": "Issue report to AM",
  "Order stok ejen": "Agent stock order",
  "Route ejen/pickup point": "Agent/pickup point route",
  "Penerimaan stok": "Stock receipt",
  "Staf jualan ejen": "Agent sales staff",
  "Order HQ masuk kilang": "HQ order enters factory",
  "Arahan production": "Production instructions",
  "Stok siap diserahkan": "Finished stock handed off",
  "Exception production": "Production exception",
  "Pelaksanaan kawasan": "Area execution",
  "Bukti dan laporan": "Evidence and reports",
  "Tugas utama role": "Main role task",
  "Rekod bukti kerja": "Record work evidence",
  "Fokus operasi": "Operational Focus",
  "Mula dari": "Start From",
  "Bukti akhir": "Final Evidence",
  "SOP Role": "Role SOP",
  "Baca arahan": "Read Instructions",
  "Pastikan skop syarikat, cawangan dan role betul sebelum mula.":
    "Confirm the company, branch and role scope before starting.",
  "Setiap tindakan penting perlu ada masa, staf dan catatan ringkas.":
    "Every important action needs a timestamp, staff record and short note.",
  "Naikkan exception": "Escalate Exception",
  "Jika luar SOP, hantar kepada AM, OM, HR, Finance atau owner mengikut skop.":
    "If it falls outside SOP, send it to AM, OM, HR, Finance or the owner according to scope.",
  "Langkah kerja": "Work Steps",
  "Ikut urutan dan rekod bukti sebelum tanda selesai.":
    "Follow the sequence and record evidence before marking it complete.",
  langkah: "steps",
  "Pemilik tugas": "Task Owner",
  "Bukti kerja": "Work Evidence",
  "Staf rekod terus, AM/OM sahkan exception.":
    "Staff record directly, AM/OM approve exceptions.",
  "AM/OM semak beza stok sebelum rasmi.":
    "AM/OM review stock differences before they become official.",
  "Driver update status, HQ Distributor pantau route.":
    "Driver updates status, Distributor HQ monitors the route.",
  "Perkara sensitif naik kepada AM, OM atau owner.":
    "Sensitive matters escalate to AM, OM or the owner.",
  "Rekod bukti wajib sebelum pembayaran disahkan.":
    "Evidence must be recorded before payment is confirmed.",
  "Kilang rekod batch, bahan dan serahan rasmi.":
    "Factory records batch, materials and official handoff.",
  "Ikut skop role dan rekod bukti kerja.":
    "Follow the role scope and record work evidence.",
  "Resit, kiraan stok dan status syif dikemaskini.":
    "Receipt, stock count and shift status are updated.",
  "Baki stok, sebab pelarasan dan kelulusan direkod.":
    "Stock balance, adjustment reason and approval are recorded.",
  "POD, masa hantar dan beza stok disahkan.":
    "POD, delivery time and stock differences are confirmed.",
  "Gambar isu, status tindakan dan kos direkod.":
    "Issue photos, action status and cost are recorded.",
  "Rekod staf, cuti, kehadiran dan payroll lengkap.":
    "Staff, leave, attendance and payroll records are complete.",
  "Order, batch production dan bahan mentah dipadankan.":
    "Orders, production batches and raw materials are matched.",
  "Laporan boleh diaudit dan dimuat turun.":
    "Reports are auditable and downloadable.",
  "Catatan kerja dan status tugasan dikemaskini.":
    "Work notes and task status are updated.",
  Pagi: "Morning",
  "Sebelum route": "Before route",
  "Tengah hari": "Midday",
  "Tutup hari": "End of day",
  "Kunci order dan stok masuk": "Lock orders and incoming stock",
  "Sahkan driver dan hentian": "Confirm drivers and stops",
  "Kejar exception": "Chase exceptions",
  "Semak POD dan laporan": "Review POD and reports",
  "Sebelum keluar": "Before departure",
  "Setiap hentian": "Every stop",
  "Jika kiosk tutup": "If kiosk is closed",
  "Tutup route": "Close route",
  "Semak load dan route": "Check load and route",
  "Update status & POD": "Update status & POD",
  "Tanda perlu sah staf": "Mark for staff confirmation",
  "Serah laporan akhir": "Submit final report",
  "Buka hari": "Start of day",
  Petang: "Evening",
  "POS dan staf hadir": "POS and staff attendance",
  "Stok dan request cawangan": "Stock and branch requests",
  "Cash dan isu operasi": "Cash and operation issues",
  "Roster dan kawalan kawasan": "Roster and area controls",
  "Mula syif": "Shift start",
  "Semasa jualan": "During sales",
  "Sahkan stok sebelum jualan": "Confirm stock before sales",
  "Jual ikut POS": "Sell through POS",
  "Kiraan ringkas": "Quick stock count",
  "Kiraan akhir dan tamat kerja": "Final count and work end",
  "Sebelum order": "Before ordering",
  "Semak katalog dan rate": "Check catalog and rates",
  "Pilih produk dan tarikh": "Select products and date",
  "Sahkan delivery": "Confirm delivery",
  "Operasi POS": "POS operations",
  kiosk: "kiosk",
  Kiosk: "Kiosk",
  "ejen jualan": "sales agent",
  "Ejen jualan": "Sales agent",
  "dokumen cawangan ini": "this branch document",
  "Dokumen cawangan ini": "This branch document",
  "syarikat lain": "another company",
  "Syarikat lain": "Another company",
  "Kod dan nama cawangan": "Branch code and name",
  "Outlet/POS": "Outlet/POS",
  "Ejen Khas ini": "this Special Agent",
  "ID pembayaran": "Payment ID",
  "ID staf": "Staff ID",
  "ID tugasan": "Task ID",
  "id dokumen": "document ID",
  "Fail slip gaji": "Payslip file",
  "Fail belum tersedia untuk download":
    "File is not available for download yet",
  "Dokumen Syarikat": "Company Document",
  "Dokumen tidak boleh dipaparkan": "Document cannot be displayed",
  "Gunakan butang Download untuk buka fail dalam aplikasi yang sesuai.":
    "Use the Download button to open the file in the appropriate app.",
  "Akses ditolak untuk syarikat lain": "Access denied for another company",
  "Akses dokumen cawangan ini tidak dibenarkan":
    "Access to this branch document is not allowed",
  "Cawangan wajib": "Branch is required",
  "Cawangan diperlukan": "Branch is required",
  "Cawangan, tajuk dan penerangan wajib":
    "Branch, title and description are required",
  "Daftar akaun ejen dahulu": "Register the agent account first",
  "Dokumen tidak dijumpai": "Document not found",
  "Ejen tidak dijumpai": "Agent not found",
  "Hanya Pentadbir Utama": "Main Administrator only",
  "Hanya ejen jualan": "Sales agent only",
  "Hanya pengguna peranan Ejen Jualan boleh daftar akaun. Minta admin cipta pengguna dengan peranan tersebut.":
    "Only users with the Sales Agent role can register an account. Ask an admin to create a user with that role.",
  "Kod dan nama cawangan diperlukan": "Branch code and name are required",
  "Outlet/POS tidak sah untuk Ejen Khas ini":
    "Outlet/POS is not valid for this Special Agent",
  "Staf tidak dijumpai": "Staff not found",
  "Staf hanya boleh lihat 3 transaksi terakhir. Sejarah penuh hanya untuk AM, OM dan Pentadbir.":
    "Staff can only view the latest 3 transactions. Full history is only for AM, OM and Administrators.",
  "Staf hanya boleh dikemaskini oleh Pentadbir, HR, OM atau Area Manager dalam skop kawasan.":
    "Staff can only be updated by Admin, HR, OM or Area Manager within their area scope.",
  "Masukkan kadar gaji bulanan untuk staf syarikat ini":
    "Enter the monthly salary rate for this company staff",
  "Masukkan kadar gaji mingguan untuk staf syarikat ini":
    "Enter the weekly salary rate for this company staff",
  "Kadar gaji staf tempatan tidak dijumpai dalam payroll rules":
    "Local staff salary rate was not found in payroll rules",
  "Akaun login dicipta - staf mesti tukar kata laluan pada log masuk pertama":
    "Login account created - staff must change the password on first login",
  "Akaun staf tidak aktif atau tidak dijumpai":
    "Staff account is inactive or not found",
  "Akaun ini bukan staf aktif cawangan yang dipilih.":
    "This account is not active staff for the selected branch.",
  "Akses dashboard dan modul akan diselaraskan automatik selepas rekod disimpan.":
    "Dashboard and module access will sync automatically after the record is saved.",
  "Hanya Pentadbir Utama boleh tukar tahap akses. Rekod tanpa email portal perlu dicipta sebagai pengguna dahulu.":
    "Only the Main Administrator can change access level. Records without portal email must be created as users first.",
  "Hanya Pentadbir Utama boleh tukar tahap akses staf":
    "Only the Main Administrator can change staff access level",
  "Hanya Pentadbir Utama/Admin boleh pindah syarikat":
    "Only the Main Administrator/Admin can transfer company",
  "Hanya AM/OM/HQ boleh urus perancangan operasi kawasan":
    "Only AM/OM/HQ can manage area operation planning",
  "Hanya Hanif/pengurusan boleh kemas kini maintenance":
    "Only Hanif/management can update maintenance",
  "Hanya kilang boleh sahkan order HQ":
    "Only the factory can confirm HQ orders",
  "Hanya kilang/HQ pentadbir boleh urus jadual production":
    "Only factory/HQ administrators can manage the production schedule",
  "Hanya kiosk cawangan dalam kawasan anda boleh diurus":
    "Only branch kiosks within your area can be managed",
  "Hanya pembuat order HQ boleh hantar order ke kilang":
    "Only the HQ order creator can submit orders to the factory",
  "Hanya pengurus boleh edit jadual": "Only managers can edit schedules",
  "Hanya pengurus boleh terbitkan jadual":
    "Only managers can publish schedules",
  "Hanya pentadbir boleh edit ambang stok":
    "Only administrators can edit stock thresholds",
  "Hanya rekod staf syif yang sudah diluluskan boleh ditamatkan tugas.":
    "Only approved shift staff records can be ended.",
  "Hanya staf yang ditetapkan di cawangan ini boleh didaftarkan dalam syif POS.":
    "Only staff assigned to this branch can be registered in the POS shift.",
  "Hanya staf aktif yang ditetapkan di cawangan ini boleh direkod. Jika dibuat oleh staf biasa, rekod akan menunggu kelulusan AM/ke atas sebelum sah dalam POS.":
    "Only active staff assigned to this branch can be recorded. If submitted by regular staff, the record will wait for AM or higher approval before becoming official in POS.",
  "Diluluskan terus oleh AM/ke atas semasa buka syif.":
    "Approved directly by AM or higher while opening shift.",
  "Jadual belum tersedia - pengurus akan terbitkan sebelum minggu bermula.":
    "Schedule is not available yet - the manager will publish it before the week starts.",
  "Jadual diterbitkan - staf boleh lihat":
    "Schedule published - staff can view it",
  "Jadual preorder belum dibuka. HQ/kilang perlu terbitkan tarikh production minggu akan datang dahulu sebelum ejen biasa dan Ejen Khas boleh buat order stok.":
    "The preorder schedule has not opened. HQ/factory must publish next week production dates before regular agents and Special Agents can place stock orders.",
  "Bayaran mesti melalui FPX/kad (iPay88). Pengesahan bank diperlukan - tempahan tidak disahkan tanpa bayaran berjaya.":
    "Payment must go through FPX/card (iPay88). Bank confirmation is required - the order is not confirmed until payment succeeds.",
  "Pengesahan bank masih diproses. Semak Sejarah bayaran dalam beberapa minit - tempahan belum disahkan sehingga status PAID.":
    "Bank confirmation is still processing. Check payment history in a few minutes - the order is not confirmed until the status is PAID.",
  "Gateway iPay88 belum dikonfigurasi - set MERCHANT_ID + API_KEY di Vercel":
    "iPay88 gateway is not configured - set MERCHANT_ID + API_KEY in Vercel",
  "Group rate Ejen Khas Syarikat belum tersedia":
    "Special Company Agent group rate is not available yet",
  "Email, nama penuh dan nama syarikat diperlukan":
    "Email, full name and company name are required",
  "Entiti RKJ_DIST tiada": "RKJ_DIST entity is missing",
  "Ejen baharu didaftarkan oleh pentadbir":
    "New agent registered by administrator",
  "Ejen dikeluarkan dari dashboard aktif oleh pentadbir":
    "Agent removed from the active dashboard by administrator",
  "Deleted dari dashboard Portal Ejen":
    "Deleted from the Agent Portal dashboard",
  "Dipautkan semasa tambah Ejen Khas oleh Pentadbir Utama":
    "Linked when the Main Administrator added the Special Agent",
  "Ejen Khas Syarikat dipautkan kepada staf sedia ada dan POS pickup/cawangan diaktifkan":
    "Special Company Agent linked to existing staff and POS pickup/branch activated",
  "Isi pickup point manual jika tiada cawangan POS":
    "Enter a manual pickup point if there is no POS branch",
  "Edit maklumat ejen, tetapkan group rate, atau nonaktifkan ejen.":
    "Edit agent information, set group rate, or deactivate the agent.",
  "Edit maklumat driver, telefon dan pilihan area/laluan berdasarkan cawangan serta pickup point ejen yang aktif.":
    "Edit driver information, phone and area/route selections based on active branches and agent pickup points.",
  "Edit status dan pindah staf ke cawangan yang dibenarkan.":
    "Edit status and transfer staff to allowed branches.",
  "Guna Cadangan Semua Cawangan": "Use Suggestions for All Branches",
  "Habiskan stok lama di cawangan asal":
    "Finish old stock at the original branch",
  "Hanif dan pengurusan boleh kemas kini status tindakan.":
    "Hanif and management can update action status.",
  "Hubungi admin HQ untuk setup kiosk supaya stok & jualan boleh dijejak.":
    "Contact HQ admin to set up the kiosk so stock and sales can be tracked.",
  "Semak/edit jumlah di atas sebelum sahkan":
    "Review/edit the amount above before confirming",
  "Semakan AI": "AI Review",
  "Semakan OK": "Review OK",
  "Perlu Tindakan": "Needs Action",
  "Buat Sekarang": "Do Now",
  "Kawalan berfungsi": "Controls are working",
  "Migrasi DB": "DB Migrations",
  Dijana: "Generated",
  semakan: "checks",
  tindakan: "actions",
  Tunggu: "Waiting",
  Pemilik: "Owner",
  "Kesihatan sistem dikemas kini": "System health updated",
  "Gagal muat kesihatan sistem": "Failed to load system health",
  "Kesihatan Sistem": "System Health",
  "Pusat Kesihatan Sistem": "System Health Center",
  "Launch Control & UAT Owner": "Launch Control & UAT Owner",
  "Status Go-Live": "Go-Live Status",
  "Senarai kerja sebenar sebelum go-live: apa sudah selesai, apa perlu dibuat sekarang dan apa masih menunggu pihak luar.":
    "A practical pre-go-live list: what is done, what needs action now and what is still waiting on external parties.",
  "Gunakan panel ini sebagai senarai semak harian owner sebelum sistem dibuka kepada staf real.":
    "Use this panel as the owner's daily checklist before the system is opened to real staff.",
  "Production Readiness Center": "Production Readiness Center",
  "10 kawasan wajib untuk menjadikan RKJ One lebih selamat, pantas, boleh diaudit dan bersedia untuk operasi sebenar.":
    "10 mandatory areas to make RKJ One safer, faster, auditable and ready for real operations.",
  "Skor kesiapan": "Readiness score",
  "UAT browser semua dashboard": "Browser UAT for all dashboards",
  "Pilot POS BR011 RNR Sg Nyiur Arah Utara":
    "BR011 RNR Sg Nyiur Northbound POS Pilot",
  "Payment gateway live": "Live payment gateway",
  "Play Store & App Store release": "Play Store & App Store release",
  "Kunci akses production": "Lock down production access",
  "Go-live 36 cawangan": "Go-live for 36 branches",
  "Checkpoint & backup kerja": "Work checkpoint & backup",
  "Owner / Pentadbir Utama": "Owner / Main Administrator",
  "AM / OM / Staf Testing": "AM / OM / Testing Staff",
  "Finance / Owner": "Finance / Owner",
  "Owner / Admin Teknikal": "Owner / Technical Admin",
  "Admin Teknikal": "Technical Admin",
  "Owner / OM / AM": "Owner / OM / AM",
  "Codex / Admin Teknikal": "Codex / Technical Admin",
  "Semak dashboard Owner, HQ Distributor, Kilang, OM, AM, Driver, Staf Jualan, HR, Finance dan Ejen supaya tiada teks pelik atau flow tersangkut.":
    "Check the Owner, Distributor HQ, Factory, OM, AM, Driver, Sales Staff, HR, Finance and Agent dashboards so no strange text or blocked flow remains.",
  "Login ikut role satu demi satu, buat rekod isu kecil, kemudian refresh production selepas fix.":
    "Log in role by role, record small issues, then refresh production after fixes.",
  "Uji SOP sebenar: buka syif, kira stok permulaan, sahkan stok driver jika ada, jualan tunai/QR manual, rehat, mid-shift, tutup syif dan payroll time.":
    "Test the real SOP: open shift, count opening stock, confirm driver stock if any, cash/manual QR sales, breaks, mid-shift, close shift and payroll time.",
  "Guna akaun staf testing, kekalkan QR payment manual, dan pastikan AM/OM sahkan exception stok.":
    "Use the testing staff account, keep QR payment manual, and ensure AM/OM approve stock exceptions.",
  "Konfigurasi payment ditemui, tetapi transaksi live masih perlu diuji dengan callback/webhook dan settlement company account.":
    "Payment configuration was found, but live transactions still need callback/webhook and company-account settlement testing.",
  "Payment online belum dibuka untuk operasi real sehingga merchant approved dan key rasmi dimasukkan.":
    "Online payment is not open for real operations until the merchant is approved and official keys are entered.",
  "Buat transaksi kecil, semak webhook, resit, laporan collection dan bank settlement.":
    "Run a small transaction and check webhook, receipt, collection report and bank settlement.",
  "Tunggu approval merchant Billplz/Fiuu/iPay88, kemudian masukkan merchant key di Vercel.":
    "Wait for Billplz/Fiuu/iPay88 merchant approval, then enter merchant keys in Vercel.",
  "PWA dan Android shell boleh disiapkan, tetapi akaun organisasi Google/Apple bergantung pada D-U-N-S 9 digit dan verification.":
    "The PWA and Android shell can be prepared, but Google/Apple organization accounts depend on the 9-digit D-U-N-S and verification.",
  "Sambung Google Play Console dan Apple Developer sebaik sahaja nombor D-U-N-S diterima.":
    "Resume Google Play Console and Apple Developer as soon as the D-U-N-S number is received.",
  "Sistem testing owner tidak disekat, tetapi sebelum go-live perlu pastikan signup awam OFF, RLS aktif dan role sensitif diuji.":
    "Owner testing is not blocked, but before go-live public signup must be OFF, RLS active and sensitive roles tested.",
  "Semak Supabase Auth, RLS policy, service role usage dan audit log sebelum buka kepada staf real.":
    "Check Supabase Auth, RLS policies, service-role usage and audit logs before opening to real staff.",
  "Data cawangan, staf, role dan profile syarikat perlu disahkan sebelum sistem digunakan di semua kiosk.":
    "Branch, staff, role and company-profile data must be verified before the system is used across all kiosks.",
  "Mulakan dari pilot 1 cawangan, kemudian tambah batch kawasan selepas SOP POS dan stock count stabil.":
    "Start with a one-branch pilot, then add area batches once POS SOP and stock counts are stable.",
  "Rekod kerja, migration dan resume perlu sentiasa dikemaskini supaya kerja boleh disambung tanpa kehilangan konteks.":
    "Work records, migrations and resume notes must stay updated so work can continue without losing context.",
  "Update CHECKPOINT.json dan RESUME.md selepas perubahan besar atau deploy.":
    "Update CHECKPOINT.json and RESUME.md after major changes or deployments.",
  "Role dashboard": "Role dashboard",
  "POS flow": "POS flow",
  "Branch profile": "Branch profile",
  "Manual QR": "Manual QR",
  "Shift SOP": "Shift SOP",
  "Merchant approval": "Merchant approval",
  Webhook: "Webhook",
  Settlement: "Settlement",
  "D-U-N-S": "D-U-N-S",
  "Play Console": "Play Console",
  "Apple Developer": "Apple Developer",
  "Supabase Auth": "Supabase Auth",
  RLS: "RLS",
  "Audit log": "Audit log",
  "36 cawangan": "36 branches",
  "AM area": "AM area",
  Training: "Training",
  schema_migrations: "schema_migrations",
  "UAT role sebenar": "Real role UAT",
  "Akses ikut syarikat": "Company-scoped access",
  "Audit perubahan sensitif": "Sensitive-change audit",
  "Backup dan pemulihan": "Backup and recovery",
  "POS, offline dan manual payment": "POS, offline and manual payment",
  "Payroll tiga syarikat": "Payroll for three companies",
  "PWA, Android dan iOS": "PWA, Android and iOS",
  "Monitoring dan alert": "Monitoring and alerts",
  "Training mode dan rollout staf": "Training mode and staff rollout",
  "Pentadbir Utama": "Main Administrator",
  "Admin / HR": "Admin / HR",
  "Admin / Owner": "Admin / Owner",
  "OM / AM": "OM / AM",
  "HR / Finance": "HR / Finance",
  "HR / AM": "HR / AM",
  "Login dan dashboard perlu diuji untuk owner, AM, OM, HR, Finance, staf POS, driver, kilang dan ejen.":
    "Login and dashboards must be tested for owner, AM, OM, HR, Finance, POS staff, driver, factory and agent.",
  "Jalankan UAT ikut peranan sebelum buka real operation.":
    "Run role-based UAT before opening real operations.",
  "Data perlu kekal berasingan antara RKJ Manufacturing, RKJ Distributor dan Roti Kaya Junus.":
    "Data must remain separated between RKJ Manufacturing, RKJ Distributor and Roti Kaya Junus.",
  "Semak role, legal entity dan branch scope selepas daftar staf baharu.":
    "Review role, legal entity and branch scope after registering new staff.",
  "Perubahan stok, staf, akses, gaji, dokumen dan delete/archive perlu ada rekod audit.":
    "Stock, staff, access, payroll, document and delete/archive changes need audit records.",
  "Pastikan setiap dialog sensitif meminta sebab dan simpan actor/time.":
    "Ensure every sensitive dialog asks for a reason and stores actor/time.",
  "Sebelum deploy besar, migration bundle dan checkpoint mesti dikemaskini.":
    "Before a major deploy, the migration bundle and checkpoint must be updated.",
  "Run npm run bundle:migrations, update CHECKPOINT.json dan RESUME.md.":
    "Run npm run bundle:migrations, update CHECKPOINT.json and RESUME.md.",
  "POS perlu boleh terus jualan selepas SOP stok disahkan, dengan manual QR/tunai semasa payment gateway belum live.":
    "POS must allow sales after stock SOP is confirmed, using manual QR/cash while the payment gateway is not live.",
  "Uji BR011 dan 2 cawangan lain: buka syif, kira stok, jual, refund, tutup syif.":
    "Test BR011 and 2 other branches: open shift, count stock, sell, refund and close shift.",
  "Online payment jangan dipaksa live sehingga merchant approved dan webhook disahkan.":
    "Do not force online payment live until the merchant is approved and webhook is verified.",
  "Kekalkan QR manual dahulu. Aktifkan online payment hanya selepas transaksi sandbox/live berjaya masuk laporan.":
    "Keep manual QR first. Activate online payment only after sandbox/live transactions enter reports successfully.",
  "Payroll perlu jelas ikut legal entity, staff type, elaun, potongan, cuti dan payslip.":
    "Payroll must be clear by legal entity, staff type, allowances, deductions, leave and payslip.",
  "Uji generate draft payroll untuk setiap syarikat dan preview payslip sebelum finalize.":
    "Test generating draft payroll for every company and preview payslips before finalizing.",
  "Aplikasi boleh disiapkan, tetapi store submission organisasi masih bergantung pada D-U-N-S dan akaun developer approved.":
    "The app can be prepared, but organization store submission still depends on D-U-N-S and approved developer accounts.",
  "Run npm run mobile:readiness selepas D-U-N-S diterima dan sebelum submit store.":
    "Run npm run mobile:readiness after D-U-N-S is received and before store submission.",
  "Owner perlu nampak status health, stok kritikal, payment tertunggak dan isu cawangan tanpa buka semua modul.":
    "The owner needs to see health status, critical stock, outstanding payments and branch issues without opening every module.",
  "Semak Tetapan > Kesihatan Sistem dan Dashboard Owner setiap hari semasa pilot.":
    "Check Settings > System Health and the Owner Dashboard every day during the pilot.",
  "Staf perlu dilatih guna SOP sebenar tanpa dedah rahsia syarikat atau mengganggu operasi real.":
    "Staff must be trained with real SOP without exposing company secrets or disrupting real operations.",
  "Buat pilot 1 cawangan, kemudian tambah 3 AM, kemudian buka ikut kawasan.":
    "Pilot 1 branch, then add 3 AMs, then open by area.",
  "legal entity": "legal entities",
  "profil aktif": "active profiles",
  "migration database": "database migrations",
  "Billplz/Fiuu/iPay88/Razer env": "Billplz/Fiuu/iPay88/Razer env",
  "Webhook paid status": "Webhook paid status",
  "PWA manifest": "PWA manifest",
  "Android shell": "Android shell",
  "App Store documents": "App Store documents",
  "Reviewer account": "Reviewer account",
  "Pilot BR011": "Pilot BR011",
  "Manual SOP POS": "Manual POS SOP",
  "Semak sambungan database dan sesi pentadbir utama.":
    "Check the database connection and Main Administrator session.",
  Pengeluaran: "Production",
  "Jualan & Retail": "Sales & Retail",
  "Cawangan / Kiosk": "Branch / Kiosk",
  "CEO Kilang": "Factory CEO",
  "CEO Kilang + Pengurus Operasi Kilang":
    "Factory CEO + Factory Operations Manager",
  "Cipta Shift": "Create Shift",
  "Cawangan report isu operasi": "Branch reports operation issues",
  "Jadual & kehadiran": "Schedule & attendance",
  "Isu cawangan": "Branch issues",
  "Jadual cawangan": "Branch schedule",
  "Jadual Mingguan": "Weekly Schedule",
  "Jadual Staf": "Staff Schedule",
  "Jadual Staf Mingguan": "Weekly Staff Schedule",
  "Jadual staf - clock-in - tutup syif":
    "Staff schedule - clock-in - close shift",
  "Jadual shift, kehadiran staf, dan kelulusan - ikut skop cawangan Area Manager":
    "Shift schedule, staff attendance and approvals - according to Area Manager branch scope",
  "Jadual spring cleaning bulanan dan meeting highway untuk satu atau banyak cawangan dalam kawasan.":
    "Monthly spring cleaning schedule and highway meetings for one or multiple branches in the area.",
  "Agent biasa dan Ejen Khas mesti dipisahkan kerana tahap akses dan bayaran tidak sama.":
    "Regular Agents and Special Agents must be separated because their access levels and payment rules are different.",
  "Agent dan fleet duduk bawah Distributor; akses ditentukan oleh role, branch, area dan jenis ejen.":
    "Agents and fleet sit under Distributor; access is determined by role, branch, area and agent type.",
  "Agregat order - cross-dock - terima dari kilang":
    "Aggregate orders - cross-dock - receive from factory",
  "AI cadang: spring cleaning dibuat sekurang-kurangnya sebulan sekali; meeting highway direkod jika melibatkan permit, kebersihan kawasan, laluan staf atau isu operasi cawangan.":
    "AI suggests spring cleaning at least once a month; highway meetings are recorded when they involve permits, area cleanliness, staff routes or branch operation issues.",
  "AM diukur melalui POS buka, staf hadir, stok terkawal, cash dikutip dan isu selesai; OM wajib kejar exception sebelum owner campur tangan.":
    "AM performance is measured through open POS, staff attendance, controlled stock, collected cash and resolved issues; OM must chase exceptions before the owner needs to intervene.",
  "AM kutip, rekod voucher jika cash digunakan, dan bank-in baki minimum 2 kali seminggu; sasaran terbaik 6 kali.":
    "AM collects cash, records vouchers when cash is used, and banks in the balance at least twice weekly; the best target is 6 times.",
  "AM wajib kawal stok, syif, collection cash, voucher penggunaan duit syarikat, pindahan stok dan isu cawangan dalam kawasan sendiri. OM/Admin hanya sahkan exception.":
    "AM must control stock, shifts, cash collection, company-cash usage vouchers, stock transfers and branch issues within their own area. OM/Admin only approve exceptions.",
  "AM/OM distributor susun tindakan, driver atau staf ganti.":
    "Distributor AM/OM arranges actions, drivers or relief staff.",
  "Approve perubahan role sensitif, gaji pengurusan, payroll final dan kes disiplin berat.":
    "Approve sensitive role changes, management salaries, final payroll and serious disciplinary cases.",
  "Batch, quantity, tarikh production dan penerimaan stok HQ.":
    "Batch, quantity, production date and HQ stock receipt.",
  "Beza AI: tiada": "AI difference: none",
  "Cawangan aktif bulan lalu tetapi jualan minggu ini sifar. Perlu semakan operasi & POS.":
    "Branch was active last month but has zero sales this week. Operation & POS review is required.",
  "collection number, request cawangan approved jika beli barang, resit/gambar, rujukan kenderaan jika fuel/maintenance, bank reference/slip dan baki bank-in.":
    "collection number, approved branch request if buying items, receipt/photo, vehicle reference for fuel/maintenance, bank reference/slip and bank-in balance.",
  "Dashboard owner fokus exception: jualan jatuh, stok kritikal, tunai tertunggak, payroll luar biasa dan approval sensitif.":
    "Owner dashboard focuses on exceptions: falling sales, critical stock, outstanding cash, unusual payroll and sensitive approvals.",
  "Data kilang tidak bercampur dengan Distributor kecuali melalui order dan handoff rasmi.":
    "Factory data does not mix with Distributor except through official orders and handoff.",
  "Data rasmi pekerja - seperti rekod HR syarikat besar":
    "Official employee data - like large-company HR records",
  "di Tetapan ke Pengguna (syarikat RKJ Distributor), kemudian ejen log masuk dan daftar syarikat di halaman ini.":
    "in Settings to Users (RKJ Distributor company), then the agent logs in and registers the company on this page.",
  "Digunakan hanya apabila OM/HQ melantik staf kilang sebagai driver ganti.":
    "Used only when OM/HQ appoints factory staff as relief drivers.",
  "Diset manual oleh pentadbir": "Set manually by administrator",
  "Dokumen legal luput, kelulusan kritikal tertunda, atau tindakan delete/archive data penting.":
    "Expired legal documents, delayed critical approvals, or delete/archive actions for important data.",
  "Dokumen syarikat dan cawangan mesti boleh view dahulu sebelum download.":
    "Company and branch documents must be viewable before download.",
  "Driver hub utama: ambil stok dari Teluk Intan dan bawa ke laluan utama Kuala Lumpur/Utara.":
    "Main driver hub: collect stock from Teluk Intan and bring it to the main Kuala Lumpur/North route.",
  "Driver kilang ganti: pool khas untuk staf kilang yang ditugaskan sementara sebagai driver tambahan atau backup.":
    "Relief factory driver: special pool for factory staff temporarily assigned as additional or backup drivers.",
  "Driver laluan Sungkai: urus penghantaran khas dan sokongan laluan tengah.":
    "Sungkai route driver: manages special delivery and central-route support.",
  "Driver laluan Utara: hantar stok ke cawangan/ejen Utara dan bantu sambungan dari Teluk Intan.":
    "North route driver: delivers stock to northern branches/agents and supports connections from Teluk Intan.",
  "Driver penghantaran aktif RKJ Distributor mengikut arahan HQ/OM.":
    "Active RKJ Distributor delivery driver according to HQ/OM instructions.",
  "Driver relay Kuala Lumpur: terima stok, pecahkan ikut kiosk/ejen dan lengkapkan penghantaran kawasan KL.":
    "Kuala Lumpur relay driver: receives stock, splits it by kiosk/agent and completes KL-area deliveries.",
  "Driver update route; branch confirm stok diterima dalam inventory.":
    "Driver updates route; branch confirms received stock in inventory.",
  "Ejen & group rate": "Agents & group rate",
  "Ejen biasa boleh guna fungsi daftar staf jualan selepas sekurang-kurangnya satu cawangan POS aktif. Daftar cawangan di tab Cawangan POS dan langgan POS syarikat RM":
    "Regular agents can use the sales-staff registration function after at least one POS branch is active. Register branches in the POS Branch tab and subscribe to the company POS at RM",
  "Ejen biasa perlu langgan POS RM200/cawangan untuk fungsi outlet/staf; Ejen Khas boleh order tanpa bayaran.":
    "Regular agents must subscribe to POS at RM200/branch for outlet/staff functions; Special Agents can order without payment.",
  "Ejen diasingkan daripada staf syarikat. Tukar jenis ejen untuk kawal access portal, harga, POS dan status tanpa bayaran.":
    "Agents are separated from company staff. Change agent type to control portal access, pricing, POS and no-payment status.",
  "Ejen order stok, guna group rate, langgan POS, urus outlet dan staf jualan jika layak.":
    "Agents order stock, use group rates, subscribe to POS, and manage outlets and sales staff when eligible.",
  "Fail dokumen tidak dapat dibaca dari storage":
    "Document file cannot be read from storage",
  "Fokus operasi cawangan, POS, shift, inventory kiosk, maintenance dan pengalaman pelanggan.":
    "Focuses on branch operations, POS, shifts, kiosk inventory, maintenance and customer experience.",
  "Gaji ikut struktur role": "Salary follows role structure",
  "Group rate - order stok - bayaran - outlet POS":
    "Group rate - stock order - payment - POS outlet",
  "Group rate, ejen khas dan langganan POS diurus RKJ Distributor; owner semak margin dan polisi sahaja.":
    "Group rates, special agents and POS subscriptions are managed by RKJ Distributor; the owner only reviews margin and policy.",
  "Hari coverage stok mesti 0-7": "Stock coverage days must be 0-7",
  "Hari coverage stok selepas terima": "Stock coverage days after receipt",
  "hari sebelum stok baharu": "days before new stock",
  "hentian baki -": "remaining stops -",
  "hentian selesai": "stops completed",
  "HQ akan gabungkan DO cawangan (max 20 hentian/arahan) selepas order kilang dirancang - susunan laluan dioptimumkan AI.":
    "HQ will combine branch DOs (max 20 stops/instructions) after factory orders are planned - route sequencing is optimized by AI.",
  "HQ Distributor tetapkan rate, route driver dan status bayaran.":
    "Distributor HQ sets rates, driver routes and payment status.",
  "HQ Distributor, driver, ejen dan route":
    "Distributor HQ, drivers, agents and routes",
  "HR dan Gaji bergerak dalam satu dashboard supaya majikan legal, role, gaji dan payslip selari.":
    "HR and Payroll run in one dashboard so legal employer, role, salary and payslip stay aligned.",
  "HR Syarikat + Finance": "Company HR + Finance",
  "HR, akses staf dan gaji": "HR, staff access and payroll",
  "ID pembayaran tiada": "Payment ID is missing",
  "ikut gaji bulanan rekod HR. Edit jumlah kasar/bersih sebelum sahkan.":
    "based on the HR monthly salary record. Edit gross/net amounts before confirming.",
  "ikut peraturan PR + komisen POS. Staf tempatan":
    "based on PR rules + POS commission. Local staff",
  "Isnin: OM semak scorecard AM, POS tidak buka, staf tidak cukup dan stok kritikal.":
    "Monday: OM reviews AM scorecards, closed POS, staff shortages and critical stock.",
  "item stok": "stock item",
  "- boleh ubah & rancang laluan.": "- can be changed & routes planned.",
  ". Roti dipantau ikut": ". Bread is monitored by",
  "(kaya/butter). Sistem auto tukar ke pcs/gram.":
    "(kaya/butter). The system automatically converts to pcs/grams.",
  "Ada jualan luar talian belum sync. Tutup syif akan dibenarkan selepas sync selesai.":
    "There are offline sales that have not synced. Shift close will be allowed after sync completes.",
  "Ada staf aktif dalam syif ini.": "There are active staff in this shift.",
  "Ada staf masih direkod keluar kiosk. Tekan kembali dahulu sebelum tutup syif.":
    "Some staff are still recorded away from the kiosk. Record their return before closing the shift.",
  "Akses admin sahaja": "Admin access only",
  "Auto jana jika kosong": "Auto-generate if empty",
  "Bekas Butter": "Butter Container",
  "Berdasarkan tutup syif terakhir": "Based on the last closed shift",
  "Buat kiraan stok": "Do stock count",
  "Contoh: Roti rosak, kaya basi, plastik koyak...":
    "Example: damaged bread, spoiled kaya, torn plastic...",
  "Data digunakan untuk pengesahan pengguna, kawalan akses, audit operasi, pengiraan stok, pemantauan tugasan, penyediaan laporan dan keselamatan sistem. Data tidak dipaparkan kepada pengguna yang tiada akses berkaitan.":
    "Data is used for user verification, access control, operational audit, stock calculation, task monitoring, reporting and system security. Data is not shown to users without the relevant access.",
  "Delete driver daripada dashboard logistik? Rekod akan ditanda inactive untuk laporan/audit.":
    "Delete this driver from the logistics dashboard? The record will be marked inactive for reporting/audit.",
  "Delete ejen dari dashboard aktif? Rekod laporan syarikat akan kekal.":
    "Delete this agent from the active dashboard? Company reporting records will remain.",
  "DO cawangan digabung per driver (max":
    "Branch DOs are grouped per driver (max",
  Draf: "Draft",
  "Format cadangan tidak sah": "Invalid suggestion format",
  "Gateway tidak tersedia": "Gateway is not available",
  Guna: "Use",
  "Guna / Keluar": "Use / Out",
  "Guna/Keluar": "Use/Out",
  "Hari bekerja seminggu": "Working days per week",
  "Hari bekerja seminggu mesti antara 1-7":
    "Working days per week must be between 1-7",
  "Hari coverage mesti 0-7": "Coverage days must be 0-7",
  "Hari production": "Production day",
  "Hubungi pentadbir sistem untuk konfigurasi lokasi HQ Distributor.":
    "Contact the system administrator to configure the HQ Distributor location.",
  "ID pembayaran tiada.": "Payment ID is missing.",
  "Jadual pembersihan mendalam kiosk setiap bulan.":
    "Monthly deep-cleaning schedule for the kiosk.",
  "Jadual yang diterbitkan sebelum ini sudah lepas atau sudah ditutup. Kilang perlu terbitkan minggu production akan datang dahulu, kemudian tarikh itu akan muncul di sini untuk HQ buat order ramalan/pre-order per cawangan.":
    "The previously published schedule has passed or is already closed. The factory must publish the next production week first, then the date will appear here for HQ to create forecast/pre-orders by branch.",
  "Jalan perniagaan agent": "Agent business channel",
  "Jana Gaji": "Generate Payroll",
  "Jana gaji, semak peraturan, komisyen, staf tempatan/asing dan pecahan gaji mengikut syarikat.":
    "Generate payroll, review rules, commissions, local/foreign staff and payroll breakdown by company.",
  "Jana Kata Laluan Baharu": "Generate New Password",
  "Jana Laporan Mingguan": "Generate Weekly Report",
  "Jangan deploy jika kritikal": "Do not deploy if critical",
  "Jenis kiraan stok tidak sah": "Invalid stock count type",
  "Jenis Staf &amp; Kadar Gaji": "Staff Type & Pay Rate",
  "Jenis tugasan operasi tidak sah": "Invalid operation task type",
  "Jika ada pembantu driver, pastikan pembahagian tugas dan masa serahan disahkan sebelum keluar.":
    "If there is an assistant driver, confirm the task split and handover time before departure.",
  "Jika ada pindahan menunggu, pastikan staf cawangan confirm stok diterima.":
    "If there are pending transfers, make sure branch staff confirm received stock.",
  "Jika cawangan tidak boleh beroperasi, buka report maintenance atau staffing.":
    "If the branch cannot operate, open a maintenance or staffing report.",
  "Jika driver hantar ketika kedai tutup, staf syif pertama wajib sahkan jumlah sebenar di sini dahulu. Selepas semua delivery disahkan, sistem akan buka kiraan stok pembukaan sebelum jualan POS dibenarkan.":
    "If the driver delivered while the shop was closed, the first-shift staff must confirm the actual quantity here first. After all deliveries are confirmed, the system will open the opening stock count before POS sales are allowed.",
  "Jika ejen tidak langgan POS, isi sekurang-kurangnya 1 pickup point manual. Contoh: Kedai Agen ABC, Jalan Besar Teluk Intan":
    "If the agent does not subscribe to POS, enter at least 1 manual pickup point. Example: Kedai Agen ABC, Jalan Besar Teluk Intan",
  "Jika isu operasi perlukan staf ganti, semak roster cawangan.":
    "If an operation issue needs replacement staff, check the branch roster.",
  "Jika order menunggu meningkat, risiko production delay naik.":
    "If waiting orders increase, production-delay risk rises.",
  "Jika staf belum hadir, susun pengganti atau maklumkan pengurus kawasan.":
    "If staff have not arrived, arrange a replacement or notify the Area Manager.",
  "Jika staf dipindahkan, dashboard staf dan syif akan ikut cawangan baru secara automatik selepas rekod disimpan.":
    "If staff are transferred, their dashboard and shifts will automatically follow the new branch after the record is saved.",
  "Jualan & prestasi": "Sales & performance",
  "Jualan harian, mingguan & bulanan setiap lokasi - klik cawangan untuk inventori":
    "Daily, weekly & monthly sales by location - click a branch for inventory",
  "Jualan jatuh mendadak, POS tidak buka, stok kritikal berulang, atau cawangan tidak beroperasi.":
    "Sales dropped sharply, POS did not open, critical stock repeated, or the branch is not operating.",
  "Jualan langsung dari kaunter tunai - disegerakkan ke papan pemuka":
    "Direct counter sales - synced to the dashboard",
  "Jualan masih boleh diteruskan supaya customer tidak menunggu. Bila ruang sesuai, kira Roti Kaya, Roti Kelapa, Roti Kacang, Roti Benggali, Kaya dan Butter mengikut production date.":
    "Sales can continue so customers do not wait. When there is room, count Roti Kaya, Roti Kelapa, Roti Kacang, Roti Benggali, Kaya and Butter by production date.",
  "Jumlah bayaran": "Payment total",
  "Jumlah bayaran tidak sah": "Invalid payment total",
  "Jumlah Bersih": "Net Total",
  "Jumlah Bulanan": "Monthly Total",
  "Jumlah diambil mesti sama dengan jumlah dihantar untuk setiap jenis stok.":
    "Picked-up quantity must match sent quantity for each stock type.",
  "JUMLAH DIBAYAR": "TOTAL PAID",
  "Jumlah gaji kumpulan": "Group payroll total",
  "Jumlah HR": "Total HR",
  "Jumlah jualan": "Total sales",
  "Jumlah Jualan": "Total Sales",
  "Jumlah Kilang": "Factory Total",
  "Jumlah Kuantiti": "Total Quantity",
  "Jumlah Mingguan": "Weekly Total",
  "Jumlah penggunaan melebihi baki cash collection":
    "Usage total exceeds cash collection balance",
  "Jumlah Report": "Total Reports",
  "Jumlah Staf": "Total Staff",
  "Kadar ini menggunakan formula payroll RKJ untuk staf cawangan.":
    "This rate uses the RKJ payroll formula for branch staff.",
  "Kadar shift (pilih satu)": "Shift rate (choose one)",
  "Kadar shift pekerja asing tidak dijumpai dalam payroll rules":
    "Foreign worker shift rate was not found in payroll rules",
  "Kata laluan semasa tidak betul.": "Current password is incorrect.",
  "Kaunter aktif": "Counter active",
  "Kaunter belum dibuka": "Counter not opened yet",
  "Kaunter lama tiada aktiviti": "Counter has been inactive for too long",
  "Kaunter Tunai": "Cash Counter",
  "Kaunter tunai - 4 menu roti - syif harian":
    "Cash counter - 4 bread menus - daily shift",
  "Kawal staf dan syif": "Control staff and shifts",
  "Kawalan Kilang": "Factory Control",
  Kaya: "Kaya",
  "Kaya / butter basi": "Spoiled kaya / butter",
  "Kaya & Butter": "Kaya & Butter",
  "Kaya ikut production date; Butter stok supplier untuk operasi jualan.":
    "Kaya follows production date; Butter is supplier stock for sales operations.",
  "Ke (cawangan / kenderaan)": "To (branch / vehicle)",
  "Ke cawangan": "To branch",
  "Kekurangan stok dari kilang": "Factory stock shortage",
  "Keluar kiosk direkod. Tekan kembali sebaik staf masuk semula.":
    "Kiosk exit recorded. Press return as soon as the staff comes back.",
  "Kelulusan Operasi": "Operation Approval",
  "Masuk menambah baki. Guna/Keluar menolak baki sebagai penggunaan production.":
    "Incoming increases balance. Use/Out deducts balance as production usage.",
  "Membaca data operasi cawangan...": "Reading branch operation data...",
  "Membuka dokumen...": "Opening document...",
  "Memuatkan staf syif...": "Loading shift staff...",
  "Padam dipilih": "Delete selected",
  "Penerimaan Stok Driver": "Driver Stock Receipt",
  "Preview tidak tersedia untuk jenis fail ini.":
    "Preview is not available for this file type.",
  "Sahkan Sambut Stok Selesai": "Confirm Stock Receipt Complete",
  "Semak internet peranti dan cuba semula. Data operasi tidak dipaparkan semasa offline untuk keselamatan akaun.":
    "Check the device internet connection and try again. Operation data is not displayed while offline for account security.",
  "Staf aktif dalam syif": "Active staff in shift",
  "Tamatkan tugas setiap staf di tab Ringkasan dahulu, kemudian tutup syif. Ini memastikan masa gaji setiap staf tepat.":
    "End each staff duty in the Summary tab first, then close the shift. This keeps each staff payroll time accurate.",
  "Tiada cawangan ambil - klik Tambah cawangan.":
    "No pickup branch - click Add branch.",
  "Tiada cawangan hantar - klik Tambah cawangan.":
    "No destination branch - click Add branch.",
  "Tiada dokumen cawangan": "No branch documents",
  "Tiada fail": "No file",
  "Tiada penghantaran driver yang menunggu pengesahan staf.":
    "No driver deliveries are waiting for staff confirmation.",
  "Tiada produk.": "No products.",
  "Tiada staf dipautkan kepada cawangan ini.":
    "No staff are linked to this branch.",
  "Tiada staf rasmi aktif dalam syif. Rekod staf cawangan dan dapatkan kelulusan AM/ke atas supaya masa kerja dan payroll tepat.":
    "No official staff are active in this shift. Record branch staff and get AM or higher approval so work time and payroll are accurate.",
  "Tidak berkaitan / HQ": "Not applicable / HQ",
  "Wajib susun laluan sebelum kilang sahkan order - stok akan auto dihantar ke cawangan mengikut hentian di bawah untuk production":
    "Routes must be arranged before the factory confirms the order - stock will be auto-delivered to branches based on the stops below for production",
  "Waktu ini menjadi rekod tamat kerja sebenar untuk kiraan gaji syif.":
    "This time becomes the actual work-end record for shift payroll calculation.",
  "- boleh ubah &amp; rancang laluan.": "- can be changed & routes planned.",
  "(roti/plastik) atau": "(bread/plastic) or",
  "= order sah - sahkan di bawah. Selepas sahkan, stok auto diterima HQ & dihantar terus ke cawangan; driver sahkan sampai di":
    "= confirmed order - approve below. After approval, stock is automatically received by HQ & sent directly to branches; driver confirms arrival at",
  "Action tidak dikenali": "Unknown action",
  "AM boleh guna cash collection hanya untuk barang keperluan cawangan yang berpunca daripada request staf yang sudah diluluskan, petrol/diesel route, atau service maintenance transport syarikat. Setiap penggunaan wajib ada bukti/resit. Sistem kira automatik baki bersih yang masih perlu bank-in.":
    "AM may use cash collection only for approved branch-necessity requests, route petrol/diesel, or company transport maintenance. Every usage must have proof/receipt. The system automatically calculates the net balance still requiring bank-in.",
  "Driver tidak dijumpai.": "Driver not found.",
  "GPS tidak tersedia": "GPS is not available",
  "Hanif/Manager Maintenance perlu terima dan susun tindakan segera, owner hanya dimaklumkan jika impak operasi tinggi.":
    "Hanif/Manager Maintenance must receive and arrange immediate action; the owner is only notified if the operational impact is high.",
  "Hari ini": "Today",
  "hari sebelum deadline": "days before deadline",
  "hari selepas terima stok + cuti umum, cuti sekolah, festif &amp; puncak hujung minggu lebuhraya.":
    "days after stock receipt + public holidays, school holidays, festive periods & highway weekend peaks.",
  "hari/minggu": "days/week",
  "Jadual Hari Ini": "Today Schedule",
  "Jadual minggu": "Weekly schedule",
  "Jenis lokasi": "Location type",
  "jualan bulanan dan": "monthly sales and",
  "Jualan dibatalkan": "Sale cancelled",
  "Jualan dibayar balik": "Sale refunded",
  "Jualan direkod. QR perlu pengesahan manual kewangan.":
    "Sale recorded. QR requires manual finance verification.",
  "Jualan kiosk, POS, stok cawangan, syif dan tugasan harian cawangan.":
    "Kiosk sales, POS, branch stock, shifts and daily branch tasks.",
  "jualan luar talian belum sync. Tutup syif akan dibenarkan selepas sync selesai.":
    "offline sales have not synced. Shift close will be allowed after sync completes.",
  "Jumaat: Owner semak exception sahaja - bukan kerja harian yang belum dibuat.":
    "Friday: Owner reviews exceptions only - not unfinished daily work.",
  jumlah: "total",
  "Jumlah bank-in melebihi baki selepas penggunaan cash":
    "Bank-in amount exceeds balance after cash usage",
  "Jumlah rasmi:": "Official total:",
  "Jumlah:": "Total:",
  "Kadar ini khusus untuk": "This rate is specific to",
  "Kata laluan baharu - staf mesti tukar pada log masuk pertama":
    "New password - staff must change it on first login",
  "Kawal berapa lama stok perlu dikekalkan selepas terima stok baharu, dan buffer keselamatan per kiosk. Cadangan AI di Order Kilang guna nilai ini bersama kalendar cuti Malaysia &amp; trafik lebuhraya.":
    "Control how long stock should be maintained after new stock is received, and the safety buffer per kiosk. AI suggestions in Factory Order use this value together with Malaysia holiday calendars & highway traffic.",
  "Kawal stok, POS buka, staf hadir, collection cash, pindahan stok dan maintenance kawasan.":
    "Control stock, open POS, staff attendance, cash collection, stock transfers and area maintenance.",
  "ke syarikat legal lain dalam kumpulan RKJ.":
    "to another legal company in the RKJ group.",
  "Kelulusan PIC buka syif POS": "PIC approval to open POS shift",
  "Kelulusan Pusat": "Central Approval",
  "Kelulusan staf masuk syif POS": "POS shift staff approval",
  "Kelulusan staf syif hanya boleh dibuat oleh AM dan ke atas.":
    "Shift staff approval can only be done by AM and above.",
  "Kelulusan, audit dan dokumen syarikat":
    "Approvals, audit and company documents",
  "Kemas kini maklumat tugasan, driver, pickup dan rujukan POS untuk ejen khas ini.":
    "Update task, driver, pickup and POS references for this Special Agent.",
  "Kemaskini maklumat HR untuk": "Update HR information for",
  "Kemaskini Profil Driver": "Update Driver Profile",
  "Kemaskini Stok": "Update Stock",
  "Kemaskini terakhir:": "Last updated:",
  "Kenderaan pemandu tiada lokasi logistik - daftar dalam inventori":
    "Driver vehicle has no logistics location - register it in inventory",
  "Keperluan mendesak di cawangan destinasi":
    "Urgent need at destination branch",
  "Keperluan rekod, kiraan dan operasi luar kiosk.":
    "Recording, counting and out-of-kiosk operation requirements.",
  "Kerja harian": "Daily work",
  "Kerja harian mesti ada pemilik role": "Daily work must have a role owner",
  "Kesan kewangan besar, payroll final, legal, polisi harga, fraud suspicion atau risiko reputasi.":
    "Major financial impact, final payroll, legal, pricing policy, fraud suspicion or reputation risk.",
  "Kilang & Pengeluaran": "Factory & Production",
  "Kilang & Production": "Factory & Production",
  "Kilang Terima": "Factory Received",
  "kiosk aktif": "active kiosk",
  "Kiosk Cawangan": "Branch Kiosk",
  "Kiosk stok rendah": "Low-stock kiosk",
  Kira: "Count",
  "Kira laci tunai dan tutup syif": "Count cash drawer and close shift",
  "Kiraan stok dihantar kepada AM/OM. Jualan boleh diteruskan sementara menunggu kelulusan stok rasmi.":
    "Stock count sent to AM/OM. Sales can continue while waiting for official stock approval.",
  "Kiraan stok disahkan. POS kembali ke Jualan.":
    "Stock count confirmed. POS returns to Sales.",
  "Kiraan stok diterima. Ada beza daripada anggaran AI, jadi AM/OM perlu sahkan sebelum stok menjadi rasmi.":
    "Stock count received. There is a difference from the AI estimate, so AM/OM must approve before stock becomes official.",
  "Kiraan stok POS perlu sah AM/OM": "POS stock count requires AM/OM approval",
  "Kiraan stok sebelum jualan wajib dibuat sebelum POS boleh mula jualan.":
    "Pre-sales stock count is required before POS can start sales.",
  "Kiraan stok tutup syif wajib dibuat dahulu di Stok & SOP.":
    "Close-shift stock count must be completed first in Stock & SOP.",
  "Kiraan stok wajib ikut production date":
    "Stock count must follow production date",
  "kiraan stok, rekod syif, bank-in cash, gambar/rujukan collection dan approval exception.":
    "stock counts, shift records, cash bank-in, collection photo/reference and exception approvals.",
  "Kod staf sudah wujud": "Staff code already exists",
  "Kod staf, gaji asas dan kredensial portal dijana terus.":
    "Staff code, base salary and portal credentials are generated immediately.",
  "Kongsi password sementara hanya sekali kepada staf. Staf akan diarah tukar kata laluan pada log masuk pertama.":
    "Share the temporary password only once with staff. Staff will be required to change the password on first login.",
  "Kounter Tunai": "Cash Counter",
  "Kuantiti penghantaran dikemas kini": "Delivery quantity updated",
  Kutipan: "Collection",
  "kutipan -": "collection -",
  "Kutipan cash cawangan wajib ada rekod pengutip, third party jika digunakan, rujukan/slip bank-in dan semakan Finance/OM.":
    "Branch cash collection must have collector records, third party if used, bank-in reference/slip and Finance/OM review.",
  "Kutipan ditanda sudah dikutip": "Collection marked as collected",
  "kutipan menunggu": "waiting collections",
  "Kutipan tunai cawangan perlu direkod. Jika cash digunakan untuk barang cawangan, minyak atau maintenance transport, AM wajib buat voucher dan bank-in baki bersih.":
    "Branch cash collection must be recorded. If cash is used for branch items, fuel or transport maintenance, AM must create a voucher and bank in the net balance.",
  "Kutipan, QR manual, bank-in dan reconciliation":
    "Collection, manual QR, bank-in and reconciliation",
  "Laluan belum dirancang oleh HQ.": "Route has not been planned by HQ.",
  "Langgan POS syarikat diperlukan untuk guna fungsi Staf Jualan":
    "Company POS subscription is required to use the Sales Staff function",
  "Langganan tamat - bayar untuk bulan seterusnya":
    "Subscription ended - pay for the next month",
  "Langganan tidak boleh dibayar": "Subscription cannot be paid",
  "Laporan Keluar Masuk Ejen": "Agent Entry/Exit Report",
  "Laporan Kilang": "Factory Report",
  "Laporan Mingguan Pekerja Asing (Auto)":
    "Foreign Worker Weekly Report (Auto)",
  "Laporan Production": "Production Report",
  "Legal entity tiada": "Legal entity is missing",
  "Lengkapkan kawasan, kod, dan nama cawangan":
    "Complete area, code and branch name",
  "Lengkapkan region, kod cawangan dan nama cawangan":
    "Complete region, branch code and branch name",
  "Lihat jadual mingguan yang ditetapkan pengurus kawasan":
    "View the weekly schedule set by the Area Manager",
  "Lihat Syif": "View Shift",
  "Log Hari Ini": "Today Log",
  "Log Stok Card Terkini": "Latest Stock Card Log",
  "Logistik & Pemandu": "Logistics & Drivers",
  "lokasi aktif telah dipautkan kepada driver.":
    "active locations have been linked to the driver.",
  "Lokasi asal": "Source location",
  "Lokasi destinasi": "Destination location",
  "Lokasi kiosk": "Kiosk location",
  "Lokasi kiosk belum disediakan": "Kiosk location is not set up yet",
  "lokasi perjalanan:": "trip locations:",
  "Lokasi semasa": "Current location",
  "Lokasi Stok": "Stock Location",
  "Lokasi stok cawangan belum didaftarkan":
    "Branch stock location has not been registered",
  "Maintenance Cawangan": "Branch Maintenance",
  "Maintenance dan emergency tidak tunggu owner":
    "Maintenance and emergencies do not wait for the owner",
  "Maintenance terbuka": "Open maintenance",
  "Maintenance ticket, shortage report, stock request dan roster issue.":
    "Maintenance tickets, shortage reports, stock requests and roster issues.",
  "Maklumat majikan 3 syarikat, gaji auto, slip dihantar HR dan muat turun untuk kegunaan peribadi.":
    "Employer information across 3 companies, auto payroll, payslips sent by HR and personal downloads.",
  "Maklumat Syarikat - Satu Pemilik": "Company Information - One Owner",
  "Manager Maintenance: Muhammad Hanif": "Maintenance Manager: Muhammad Hanif",
  "Masukkan dalam unit operasi kiosk - sistem auto tukar ke unit asas sebelum tolak baki. Stok masuk/keluar biasa dikawal HQ & Pengurus Kawasan.":
    "Enter in kiosk operation units - the system auto-converts to base units before deducting balance. Normal stock in/out is controlled by HQ & Area Manager.",
  "Masukkan float tunai permulaan. Selepas syif dibuka, staf wajib sahkan kiraan stok permulaan dahulu sebelum skrin jualan dibuka.":
    "Enter the opening cash float. After the shift is opened, staff must confirm the opening stock count before the sales screen opens.",
  "Masukkan item dan kuantiti kiraan stok":
    "Enter stock count item and quantity",
  "Masukkan item kiraan stok": "Enter stock count item",
  "Masukkan jumlah bank-in": "Enter bank-in amount",
  "Masukkan jumlah kutipan tunai": "Enter cash collection amount",
  "Masukkan jumlah penggunaan cash": "Enter cash usage amount",
  "Masukkan jumlah tunai sebenar yang sah":
    "Enter the valid actual cash amount",
  "Masukkan kuantiti stok": "Enter stock quantity",
  "Masukkan kuantiti stok sebenar yang sah":
    "Enter valid actual stock quantity",
  "Masukkan nama penerima di cawangan": "Enter recipient name at branch",
  "Masukkan nama staf jualan": "Enter sales staff name",
  "Masukkan nama syarikat": "Enter company name",
  "Masukkan sekurang-kurangnya satu rekod masuk atau guna":
    "Enter at least one in or use record",
  "Meeting bersama pihak highway untuk cawangan terlibat.":
    "Meeting with highway management for involved branches.",
  "melalui gateway bayaran rasmi (FPX / kad kredit / kad debit). Tempahan stok atau langganan POS hanya disahkan selepas bank mengesahkan bayaran.":
    "through the official payment gateway (FPX / credit card / debit card). Stock orders or POS subscriptions are confirmed only after the bank confirms payment.",
  "Memuat kadar payroll...": "Loading payroll rates...",
  "Memuatkan cadangan stok cawangan...": "Loading branch stock suggestions...",
  "Memuatkan item stok...": "Loading stock items...",
  "Memuatkan jadual mingguan...": "Loading weekly schedule...",
  "Memuatkan pecahan syarikat...": "Loading company breakdown...",
  "Memuatkan portal ejen...": "Loading agent portal...",
  "Memuatkan senarai ejen...": "Loading agent list...",
  "Memuatkan senarai staf...": "Loading staff list...",
  "Memuatkan SOP stok POS...": "Loading POS stock SOP...",
  "Menunggu AM/ke atas": "Waiting for AM or above",
  "Menunggu Bank": "Waiting for Bank",
  "Menunggu Pengesahan Bank": "Waiting for Bank Confirmation",
  "Menunggu pengesahan bank...": "Waiting for bank confirmation...",
  "Menunggu terima di kiosk": "Waiting to receive at kiosk",
  "menunggu tindakan": "waiting for action",
  "Menunggu tindakan": "Waiting for action",
  "Menunggu tindakan pengurus": "Waiting for manager action",
  "mesti dari jadual kilang yang diterbitkan. Expiry roti = production +":
    "must come from the published factory schedule. Bread expiry = production +",
  Minggu: "Week",
  "Mod pilot - payment gateway belum diaktifkan":
    "Pilot mode - payment gateway is not active yet",
  "Mode testing Pentadbir Utama": "Main Administrator testing mode",
  "Muktamadkan ke Kilang Sekarang": "Finalize to Factory Now",
  Mula: "Start",
  "Mula kira gaji": "Start payroll time",
  "Mula:": "Start:",
  "Nama driver tidak boleh kosong.": "Driver name cannot be empty.",
  "Nama driver wajib diisi.": "Driver name is required.",
  "Nama legal syarikat": "Legal company name",
  "Nama staf wajib diisi": "Staff name is required",
  "Nota kiraan, contoh: closing stok production 2026-06-30 disahkan oleh staf syif malam.":
    "Count notes, example: closing stock for production 2026-06-30 confirmed by night-shift staff.",
  "Nota minggu (pilihan)": "Week notes (optional)",
  "Nota staf (jika perlu)": "Staff notes (if needed)",
  "/bulan": "/month",
  "/hari": "/day",
  "/minggu": "/week",
  "0 staf aktif": "0 active staff",
  "9 item rasmi - Roti, Bahan & Packaging":
    "9 official items - Bread, Materials & Packaging",
  "Agent order dan pickup/delivery": "Agent orders and pickup/delivery",
  "Delivery order, driver route, POD dan branch stock received.":
    "Delivery order, driver route, POD and branch stock received.",
  "HQ: order dalam bag/tong - kiosk: terima melalui butang Terima di Kiosk":
    "HQ: order in bags/tubs - kiosk: receive through the Receive at Kiosk button",
  "Jenis Pekerja": "Worker Type",
  "Kod Pekerja": "Worker Code",
  "Memuatkan tetapan ramalan order...": "Loading order forecast settings...",
  "Menghubung ke iPay88 - pengesahan bank diperlukan.":
    "Connecting to iPay88 - bank confirmation is required.",
  "Menunggu Bayaran Bank": "Waiting for Bank Payment",
  "Menunggu kelulusan AM / OM / Admin": "Waiting for AM / OM / Admin approval",
  "Naik kepada Owner": "Escalate to Owner",
  "Nama Syarikat": "Company Name",
  "Nota order (pilihan)": "Order notes (optional)",
  "OM kilang sahkan output; OM Distributor sahkan received/cross-dock.":
    "Factory OM confirms output; Distributor OM confirms receipt/cross-dock.",
  "OM/Admin perlu kosongkan queue harian sebelum isu naik kepada owner.":
    "OM/Admin must clear the daily queue before issues escalate to the owner.",
  "Operasi cawangan, POS dan jualan": "Branch operations, POS and sales",
  "Orang yang boleh dihubungi jika berlaku kecemasan di tempat kerja":
    "Person to contact in case of workplace emergency",
  "Order / Pindahan Baharu": "New Order / Transfer",
  "Order & batch kilang": "Factory orders & batches",
  "Order dalam": "Order in",
  "Order dimuktamadkan ke kilang": "Order finalized to factory",
  "Order disahkan - stok auto dihantar ke cawangan, driver sahkan penghantaran":
    "Order confirmed - stock is auto-sent to branches, driver confirms delivery",
  "Order ditutup": "Order closed",
  "Order ikut tarikh production kilang - Bayaran FPX/Kad ke Maybank RKJ Distributor -":
    "Order by factory production date - FPX/Card payment to Maybank RKJ Distributor -",
  "Order Kilang": "Factory Order",
  "Order kilang - output harian - sahkan production":
    "Factory orders - daily output - confirm production",
  "Order kilang - pindahan stok - cross-dock":
    "Factory orders - stock transfer - cross-dock",
  "order muktamad menunggu pengesahan kilang":
    "confirmed orders waiting for factory approval",
  "order ramalan (rujukan awal - belum perlu disahkan)":
    "forecast orders (early reference - not yet required for approval)",
  "Order ramalan disimpan - driver boleh lihat jadual awal":
    "Forecast order saved - driver can view the early schedule",
  "Order sekali gus per cawangan:": "Bulk order by branch:",
  "Order tidak boleh dibayar": "Order cannot be paid",
  "Order untuk": "Order for",
  "Order, group rate, payment status, pickup point dan POS subscription.":
    "Orders, group rates, payment status, pickup points and POS subscription.",
  "Outlet/POS ejen ini": "This agent outlet/POS",
  "Owner pantau, bukan buat semua": "Owner monitors, not does everything",
  "Owner tidak perlu buat semua tugasan. Sistem akan tunjuk exception, risiko dan kelulusan penting; kerja harian mesti diselesaikan oleh OM, AM, HR, Finance, Manager Maintenance, Driver dan staf cawangan mengikut skop masing-masing.":
    "The owner does not need to do every task. The system shows exceptions, risks and important approvals; daily work must be completed by OM, AM, HR, Finance, Manager Maintenance, Drivers and branch staff within their own scope.",
  "Packaging Kilang": "Factory Packaging",
  "pada grid di bawah untuk urus stok kiosk.":
    "in the grid below to manage kiosk stock.",
  "Padam / Nonaktif": "Delete / Deactivate",
  "Padam arahan ini": "Delete this instruction",
  "Padam staf tanpa syif; rekod dengan syif akan dinonaktifkan.":
    "Delete staff without shifts; records with shifts will be deactivated.",
  "Pantau cawangan cover, stok, syif, POS dan isu operasi kawasan.":
    "Monitor covered branches, stock, shifts, POS and area operation issues.",
  "Pantau cawangan, POS, syif, inventori dan laporan operasi kiosk.":
    "Monitor branches, POS, shifts, inventory and kiosk operation reports.",
  "Pantau jualan": "Monitor sales",
  "Pantau kesan jualan": "Monitor sales impact",
  "Pantau prestasi kilang, kapasiti production, bahan mentah dan kelulusan operasi.":
    "Monitor factory performance, production capacity, raw materials and operation approvals.",
  "Pantau prestasi, semak cawangan merah dan campur tangan hanya jika AM/OM gagal selesaikan.":
    "Monitor performance, review red branches and intervene only if AM/OM fails to resolve.",
  "Pantau route besar, margin ejen, isu driver berulang dan polisi harga distributor.":
    "Monitor major routes, agent margins, recurring driver issues and distributor pricing policy.",
  "Pantau stok harian": "Monitor daily stock",
  "Paparan bag/pcs - klik Buka untuk urus stok penuh 9 item":
    "Bag/pcs view - click Open to manage full 9-item stock",
  "Pastikan jadual production selaras dengan permintaan HQ dan ejen.":
    "Ensure the production schedule aligns with HQ and agent demand.",
  "Pastikan kelulusan tidak tertangguh, dokumen syarikat/cawangan terkini dan audit trail lengkap.":
    "Ensure approvals are not delayed, company/branch documents are current and audit trails are complete.",
  "Pastikan kiosk buka, staf cukup, stok POS sah, jualan berjalan dan isu cawangan diambil tindakan.":
    "Ensure kiosks open, staff are sufficient, POS stock is approved, sales run and branch issues are acted on.",
  "Pastikan kiosk sedia terima stok - follow-up cawangan yang belum complete pindahan.":
    "Ensure kiosks are ready to receive stock - follow up branches that have not completed transfers.",
  "Pastikan pickup/POS aktif digunakan sebagai lokasi operasi agent.":
    "Ensure active pickup/POS points are used as agent operation locations.",
  "Pautkan Ejen Khas Syarikat kepada staf RKJ Distributor atau Manufacturing. Tugasan ini akan muncul pada dashboard staf tersebut.":
    "Link Special Company Agent to RKJ Distributor or Manufacturing staff. This task will appear on that staff dashboard.",
  "Payment gateway belum diaktifkan - bayaran ujian disahkan dalam sistem. Selepas credential merchant diset, bayaran sebenar ke Maybank RKJ Distributor akan digunakan.":
    "Payment gateway is not active yet - test payments are confirmed in the system. After merchant credentials are set, real payments to Maybank RKJ Distributor will be used.",
  "Payment POS/Agent hanya dianggap sah apabila ada callback/verification gateway atau rekod pengesahan rasmi.":
    "POS/Agent payments are only treated as valid when there is a gateway callback/verification or official confirmation record.",
  "pcs/hari": "pcs/day",
  "Pecahan 3 syarikat legal - gaji auto ikut peraturan - laporan mingguan pekerja asing":
    "Breakdown of 3 legal companies - auto payroll by rules - foreign worker weekly reports",
  pekerja: "workers",
  "pekerja asing": "foreign workers",
  "Pekerja Asing -": "Foreign Workers -",
  "Pekerja Asing - Gaji Mingguan (shift)":
    "Foreign Workers - Weekly Pay (shift)",
  "Pelarasan imbangan stok antara cawangan":
    "Stock balance adjustment between branches",
  "Pelarasan stok selepas pemeriksaan cawangan":
    "Stock adjustment after branch inspection",
  "Peluang penambahbaikan jualan": "Sales improvement opportunity",
  "Pemandu Distributor": "Distributor Driver",
  "Pembantu AI - Cadangan Gaji": "AI Assistant - Payroll Suggestion",
  "Pembayaran online belum diaktifkan. Staf hanya rekod QR selepas semak bukti bayaran pelanggan.":
    "Online payment is not active yet. Staff only record QR after checking the customer payment proof.",
  "Pembayaran tidak boleh diproses": "Payment cannot be processed",
  "Pembetulan penerimaan stok dari driver":
    "Correction of stock receipt from driver",
  "Pembetulan stok selepas closing POS": "Stock correction after POS closing",
  "Pemilik Kumpulan (3 Syarikat)": "Group Owner (3 Companies)",
  "Pengedaran - logistik - ejen jualan - 3 Pengurus Kawasan - HQ Distributor":
    "Distribution - logistics - sales agents - 3 Area Managers - Distributor HQ",
  "Pengeluaran roti - gudang kilang - order HQ":
    "Bread production - factory warehouse - HQ orders",
  "Pengesahan kata laluan tidak sepadan.":
    "Password confirmation does not match.",
  "Pengesahan QR Manual POS": "Manual POS QR Verification",
  Penghantaran: "Delivery",
  "Penghantaran - jadual driver - DO ke kiosk":
    "Delivery - driver schedule - DO to kiosk",
  "Penghantaran stok ke cawangan dan pickup point agent mengikut route harian.":
    "Stock delivery to branches and agent pickup points by daily route.",
  "Pengurus Kawasan:": "Area Manager:",
  "Pengurus Kawasan: urus akaun login": "Area Manager: manage login accounts",
  Pengurusan: "Management",
  "Pengurusan Kilang": "Factory Management",
  "Pengurusan Syif": "Shift Management",
  "Penolakan staf syif hanya boleh dibuat oleh AM dan ke atas.":
    "Shift staff rejection can only be done by AM and above.",
  Pentadbir: "Administrator",
  "Per Cawangan": "By Branch",
  "Peranan khas yang dipautkan oleh Pentadbir Utama untuk operasi RKJ Distributor / Manufacturing.":
    "Special role linked by the Main Administrator for RKJ Distributor / Manufacturing operations.",
  "Perancangan Order": "Order Planning",
  "Perancangan stok lebuhraya": "Highway stock planning",
  "Peraturan jualan RKJ": "RKJ sales rules",
  "Perjalanan Driver ke Cawangan": "Driver Trip to Branch",
  "Perkakas wajib untuk potong, sapu dan sedia roti.":
    "Required tools for cutting, spreading and preparing bread.",
  "Perlu dikejar": "Needs follow-up",
  "Perlu Hanif sebagai staf ganti kerana cawangan kekurangan staf / berlaku musibah.":
    "Hanif is needed as relief staff because the branch is short-staffed / affected by an incident.",
  "Perlu perhatian": "Needs attention",
  "Perlu sahkan": "Needs confirmation",
  "Perlu semak syarikat": "Company review needed",
  "Perlu Staf Ganti": "Needs Replacement Staff",
  "Perlu tukar password": "Password change required",
  "Permohonan staf masuk syif dihantar untuk kelulusan AM/ke atas":
    "Staff shift-entry request sent for AM or higher approval",
  "Pertengahan syif": "Mid-shift",
  "Perubahan cawangan akan diselaraskan automatik ke POS, Inventori, Syif, Laporan dan profil cawangan selepas simpan.":
    "Branch changes will sync automatically to POS, Inventory, Shifts, Reports and the branch profile after saving.",
  "Perubahan role, gaji, delete/archive dokumen, stock adjustment besar dan refund perlu ada rekod siapa, bila dan sebab.":
    "Role changes, salary changes, document delete/archive, major stock adjustments and refunds must record who, when and why.",
  "Pesanan Penghantaran Manual": "Manual Delivery Order",
  "Pesanan penghantaran manual (DO) dari HQ akan muncul di sini. Kongsi lokasi semasa dan tekan Susun AI.":
    "Manual delivery orders (DO) from HQ will appear here. Share current location and press AI Arrange.",
  "Peta kerja rasmi untuk pastikan Manufacturing, Distributor, Retail dan Agent tidak bercampur tetapi tetap bersambung.":
    "Official work map to ensure Manufacturing, Distributor, Retail and Agent do not mix but remain connected.",
  "PIC Syif": "Shift PIC",
  "Pindahan kecemasan antara cawangan": "Emergency transfer between branches",
  "pindahan menunggu": "pending transfers",
  "Pindahan stok": "Stock transfer",
  "Pisau Butter": "Butter Knife",
  Plastik: "Plastic",
  "Plastik dan bahan pembungkusan untuk production.":
    "Plastic and packaging materials for production.",
  "Plastik rosak / koyak": "Damaged / torn plastic",
  "Platform khas Hanif untuk menerima report maintenance semua cawangan Roti Kaya Junus dan urus staf ganti jika berlaku musibah atau kekurangan staf.":
    "Hanif special platform to receive maintenance reports from all Roti Kaya Junus branches and manage relief staff during incidents or staff shortages.",
  "Portal staf tersedia": "Staff portal available",
  "POS & Jualan": "POS & Sales",
  "POS belum dibuka. Pastikan staf buka syif dan terminal sebelum jualan bermula.":
    "POS has not opened. Make sure staff open the shift and terminal before sales begin.",
  "POS Cawangan": "Branch POS",
  "POS QR online belum diaktifkan. Gunakan bayaran QR manual di POS dan sahkan di dashboard Kewangan.":
    "Online POS QR is not active yet. Use manual QR payment at POS and verify it in the Finance dashboard.",
  "POS, stok dan maintenance berada dalam keadaan terkawal. Fokus kepada jualan dan servis.":
    "POS, stock and maintenance are under control. Focus on sales and service.",
  "Presence check tidak dijawab. Rekod dihantar untuk semakan AM/OM.":
    "Presence check was not answered. Record sent for AM/OM review.",
  "Prestasi Cawangan": "Branch Performance",
  "Prestasi cawangan - produk - harian/mingguan":
    "Branch performance - products - daily/weekly",
  "Production lewat, bahan mentah kritikal, batch reject tinggi, atau order HQ tidak boleh dipenuhi.":
    "Late production, critical raw materials, high batch rejection, or HQ orders cannot be fulfilled.",
  "Production, bahan mentah dan stok kilang":
    "Production, raw materials and factory stock",
  "Profil & Dokumen Cawangan": "Branch Profile & Documents",
  "Profil gabungan 3 syarikat - lihat seksyen Pemilik Kumpulan":
    "Combined 3-company profile - see the Group Owner section",
  "Profil Syarikat Kumpulan": "Group Company Profile",
  "Profil tidak dapat dimuatkan": "Profile could not be loaded",
  "Profile Cawangan Roti Kaya Junus": "Roti Kaya Junus Branch Profile",
  "Profile operasi lengkap untuk pantau kedai, staf, POS, inventory kiosk dan isu harian cawangan ini.":
    "Complete operation profile to monitor this branch shop, staff, POS, kiosk inventory and daily issues.",
  "Pulihkan stok kiosk": "Restore kiosk stock",
  "QR manual perlu online untuk rekod audit dan pengesahan kemudian.":
    "Manual QR requires online mode for audit records and later verification.",
  "QR manual perlu sahkan": "Manual QR requires verification",
  "QR/online gateway belum diaktifkan. Transaksi QR dari POS direkod sebagai jualan, tetapi kewangan perlu sahkan manual berdasarkan bukti bayaran sebelum dianggap selesai.":
    "QR/online gateway is not active yet. QR transactions from POS are recorded as sales, but finance must manually verify based on payment proof before they are treated as settled.",
  "Rabu: Admin semak audit akses, dokumen cawangan dan perubahan role/gaji.":
    "Wednesday: Admin reviews access audit, branch documents and role/salary changes.",
  "Ramalan & muktamad order dari HQ Distributor":
    "Forecast & finalized orders from Distributor HQ",
  "Ramalan Order": "Order Forecast",
  "Reconciliation jualan POS": "POS sales reconciliation",
  "Reconciliation stok harian": "Daily stock reconciliation",
  "Rehat/makan/solat/tandas digabung maksimum 1 jam sehari. Ambil stok tidak dipotong.":
    "Break/meal/prayer/toilet time is combined with a maximum of 1 hour per day. Stock pickup is not deducted.",
  "Reject stok (staf kaunter)": "Reject stock (counter staff)",
  "Reject stok dari POS hanya untuk staf kaunter. HQ & Pengurus Kawasan urus stok melalui modul Inventori.":
    "Reject stock from POS is only for counter staff. HQ & Area Manager manage stock through the Inventory module.",
  "Reject stok direkod - baki kiosk dikemas kini":
    "Rejected stock recorded - kiosk balance updated",
  "Reject stok hanya dibenarkan di cawangan anda":
    "Stock rejection is only allowed at your branch",
  "Relay driver (Fazil/Ridhuan) menunggu sambut stok dari hub sebelum boleh hantar ke kiosk.":
    "Relay driver (Fazil/Ridhuan) waits to receive stock from the hub before delivering to kiosks.",
  "Report maintenance dihantar kepada Hanif":
    "Maintenance report sent to Hanif",
  "Reset kata laluan staf? Staf mesti tukar semula pada log masuk seterusnya.":
    "Reset staff password? Staff must change it again on next login.",
  "Resit Bayaran Order Stok": "Stock Order Payment Receipt",
  "Resit tidak dijumpai atau bayaran belum selesai":
    "Receipt not found or payment not completed",
  "Roti (4 jenis) - shelf life": "Bread (4 types) - shelf life",
  "Roti / Bahan": "Bread / Materials",
  "roti + bahan + packaging": "bread + materials + packaging",
  "roti + bahan + packaging per cawangan":
    "bread + materials + packaging per branch",

  // Auth
  "Tukar Kata Laluan": "Change Password",
  "Kata Laluan Semasa": "Current Password",
  "Kata Laluan Baharu": "New Password",
  "Sahkan Kata Laluan Baharu": "Confirm New Password",
  "Minimum 8 aksara.": "Minimum 8 characters.",

  // Dashboard / owner / management
  "Papan Pemuka": "Dashboard",
  "Pusat Kawalan": "Control Center",
  "Pusat Kawalan Owner": "Owner Control Center",
  "Pusat Kawalan Kumpulan": "Group Control Center",
  "Jualan Hari Ini": "Today Sales",
  "Syif POS Buka": "Open POS Shifts",
  "POS Buka": "POS Open",
  "Penghantaran Aktif": "Active Deliveries",
  "Kelulusan Tertunda": "Pending Approvals",
  "Stok Rendah": "Low Stock",
  "Stok Kritikal": "Critical Stock",
  "Tunai Tertunggak": "Outstanding Cash",
  "Menunggu tindakan HQ": "Waiting for HQ action",
  "Semua cawangan RKJ": "All RKJ branches",
  "Tiga Syarikat - Mengikut Aliran Kerja": "Three Companies - By Workflow",
  "Kilang menghasilkan, Distributor edar, Roti Kaya Junus jual di kiosk":
    "Factory produces, Distributor delivers, Roti Kaya Junus sells at kiosks",
  "HR Syarikat Legal": "Legal Company HR",
  "Semua staf dan pengguna dikumpulkan mengikut majikan legal masing-masing":
    "All staff and users are grouped under their legal employer",
  "Jabatan Kumpulan - HQ Pemilik": "Group Departments - Owner HQ",
  "Fungsi merentas syarikat - kewangan, HR, kelulusan & tetapan sistem":
    "Cross-company functions - finance, HR, approvals & system settings",
  "Tiada kenderaan didaftarkan.": "No vehicle registered.",
  "Aliran Kerja Kumpulan - Kilang ke Kiosk ke Jualan":
    "Group Workflow - Factory to Kiosk to Sales",
  Jabatan: "Department",
  "Buka HR": "Open HR",
  "jumlah rekod HR": "total HR records",
  pengurusan: "management",
  "Statistik tidak dimuatkan - semak sambungan pangkalan data atau view":
    "Statistics could not be loaded - check the database connection or view",
  "Delegation Matrix Owner": "Owner Delegation Matrix",
  "Sistem ini asingkan kerja harian kepada role yang betul supaya owner fokus pantau, approve perkara besar dan buat keputusan strategik.":
    "The system separates daily work to the right roles so the owner can focus on monitoring, major approvals and strategic decisions.",
  "Prinsip operasi baru": "New operating principle",
  "Peranan owner": "Owner role",
  "Weekly SOP Review": "Weekly SOP Review",
  "Cadangan review supaya owner tidak jadi bottleneck.":
    "Suggested review rhythm so the owner does not become a bottleneck.",
  "Escalation Matrix": "Escalation Matrix",
  "Bila sesuatu isu perlu naik kepada siapa.":
    "When each issue should escalate and to whom.",
  "AI Proactive Cockpit": "AI Proactive Cockpit",
  "Dashboard ini disusun ikut role, syarikat, cawangan dan tugasan sebenar pengguna.":
    "This dashboard is arranged by role, company, branch and the user's real duties.",
  "Buka Fokus Utama": "Open Main Focus",
  "Operasi Harian": "Daily Operations",
  "Roti Kaya Junus Group - RKJ, RKJ Distributor dan RKJ Manufacturing":
    "Roti Kaya Junus Group - RKJ, RKJ Distributor and RKJ Manufacturing",
  "Pentadbir Utama / Pemilik Kumpulan": "Main Administrator / Group Owner",
  "Pantau prestasi syarikat, pastikan tugas harian dipegang role yang betul, dan buat keputusan strategik untuk perkara besar sahaja.":
    "Monitor company performance, ensure daily duties are owned by the right roles, and make strategic decisions only for major matters.",
  "AI cadang semak stok kritikal dahulu sebelum buka tugasan lain.":
    "AI recommends reviewing critical stock before opening other tasks.",
  "AI cadang selesaikan kelulusan tertunda supaya aliran kerja tidak tersekat.":
    "AI recommends clearing pending approvals so the workflow does not get blocked.",
  "AI cadang reconcile tunai tertunggak dan semak bank-in sebelum tutup hari.":
    "AI recommends reconciling outstanding cash and checking bank-ins before closing the day.",
  "Boleh pantau semua syarikat, tetapi tindakan tetap dipecahkan ikut legal entity, cawangan dan modul.":
    "You can monitor all companies, but actions are still separated by legal entity, branch and module.",
  "Fokus kepada cawangan dalam kawasan sendiri; data syarikat lain hanya muncul bila berkaitan tugasan rasmi.":
    "Focus on branches in your own area; other company data only appears when it is tied to an official task.",
  "Fokus kepada akaun ejen, order stok, payment, outlet POS dan staf jualan ejen sahaja.":
    "Focus only on agent accounts, stock orders, payments, POS outlets and agent sales staff.",
  "Fokus kilang, production, bahan mentah dan handoff stok. Data Distributor/Retail hanya melalui order rasmi.":
    "Focus on factory, production, raw materials and stock handoff. Distributor/Retail data only flows through official orders.",
  "Fokus HQ Distributor, logistik, driver, agent dan support cawangan. Data kilang/retail tidak bercampur tanpa tugasan.":
    "Focus on Distributor HQ, logistics, drivers, agents and branch support. Factory/retail data does not mix without an assigned task.",
  "Fokus cawangan, POS, syif, inventory kiosk dan pelanggan. Maklumat dalaman Distributor/Kilang tidak dipaparkan.":
    "Focus on branches, POS, shifts, kiosk inventory and customers. Internal Distributor/Factory information is not displayed.",
  "Dashboard ikut role, syarikat majikan dan skop branch yang ditetapkan oleh Pentadbir Utama.":
    "The dashboard follows the role, employer company and branch scope set by the Main Administrator.",
  "Operasi cawangan Roti Kaya Junus": "Roti Kaya Junus Branch Operations",
  "RKJ Distributor Sdn Bhd mengurus cawangan Roti Kaya Junus":
    "RKJ Distributor Sdn Bhd managing Roti Kaya Junus branches",
  "HR + Gaji": "HR + Payroll",
  "Kutipan + Reconciliation": "Collections + Reconciliation",
  "Route + POD": "Route + POD",
  "Ticket + Staf Ganti": "Tickets + Relief Staff",
  "Kawasan + Stok + Syif": "Area + Stock + Shifts",
  "Order + POS Outlet": "Orders + POS Outlets",
  "Production + Bahan Mentah": "Production + Raw Materials",
  "HQ + Logistik + Agent": "HQ + Logistics + Agents",
  "Cawangan + POS": "Branches + POS",
  "Signal Hari Ini": "Today's Signals",
  "Skop Cawangan": "Branch Scope",
  "Cawangan di bawah pantauan dashboard ini.":
    "Branches monitored by this dashboard.",
  "Perlu tindakan supaya operasi tidak tersekat.":
    "Action is needed so operations do not get stuck.",
  "Tiada kelulusan tertunda.": "No pending approvals.",
  "Semak stok sebelum jualan/production terganggu.":
    "Check stock before sales/production is disrupted.",
  "Tiada stok kritikal dikesan.": "No critical stock detected.",
  "Semak collection dan bank-in kawasan sendiri.":
    "Check collection and bank-ins for your own area.",
  "Semak collection dan bank-in.": "Check collection and bank-ins.",
  "Tugasan khas ejen aktif pada profile ini.":
    "Special agent assignments are active on this profile.",
  "Status Kerja": "Work Status",
  "Ikut SOP role dan selesaikan tugasan mengikut urutan.":
    "Follow the role SOP and complete tasks in order.",
  "Tindakan Seterusnya": "Next Actions",
  "Mula di sini": "Start here",
  "Semak exception kumpulan": "Review group exceptions",
  "Semak exception kumpulan, pastikan OM/AM/HR/Finance/Manager menjalankan tugas, dan luluskan hanya isu kritikal, legal, kewangan, payroll atau perubahan akses sensitif.":
    "Review group exceptions, ensure OM/AM/HR/Finance/Managers are carrying out their duties, and approve only critical, legal, finance, payroll or sensitive access-change issues.",
  "Fokus hanya kepada jualan jatuh, stok kritikal, tunai tertunggak, penghantaran gagal dan approval sensitif.":
    "Focus only on falling sales, critical stock, outstanding cash, failed deliveries and sensitive approvals.",
  "Semak kawalan AM, OM dan Admin": "Review AM, OM and Admin controls",
  "Lihat scorecard, cash proof, voucher penggunaan cash, audit akses dan escalation matrix supaya owner tidak jadi bottleneck kerja harian.":
    "Review scorecards, cash proof, cash usage vouchers, access audits and the escalation matrix so the owner does not become the daily work bottleneck.",
  "Pastikan pemilik tugas jelas": "Ensure task ownership is clear",
  "Semak Delegation Matrix supaya OM, AM, HR, Finance, Manager Maintenance dan Driver tidak menunggu owner untuk kerja harian.":
    "Review the Delegation Matrix so OM, AM, HR, Finance, Maintenance Manager and Drivers do not wait for the owner for daily work.",
  "Luluskan perkara berisiko tinggi": "Approve high-risk matters",
  "Approve hanya isu legal, payroll final, perubahan akses sensitif, refund besar, delete/archive dan polisi harga.":
    "Approve only legal issues, final payroll, sensitive access changes, large refunds, delete/archive actions and pricing policy.",
  "Audit HR syarikat": "Audit company HR",
  "Semak ringkasan HR mengikut majikan legal; HR yang lengkapkan profil, owner semak kes luar biasa sahaja.":
    "Review HR summaries by legal employer; HR completes profiles, while the owner only reviews exceptional cases.",
  "Semak laporan strategik": "Review strategic reports",
  "Bandingkan jualan, margin ejen, kutipan, payroll dan prestasi cawangan untuk keputusan pemilik.":
    "Compare sales, agent margins, collections, payroll and branch performance for owner decisions.",
  "Pengurus Operasi Kilang": "Factory Operations Manager",
  "Pengurus Operasi Distributor": "Distributor Operations Manager",
  "Pengurus Operasi Roti Kaya Junus": "Roti Kaya Junus Operations Manager",
  "Pentadbir HQ": "HQ Administrator",
  "Pengurus Operasi": "Operations Manager",
  "CEO Kilang / Pengeluaran": "Factory / Production CEO",
  "Pengurus Kawasan": "Area Manager",
  "Pemandu / Logistics": "Driver / Logistics",
  "Staf Kiosk / Staf Operasi": "Kiosk Staff / Operations Staff",
  "Manager Maintenance": "Maintenance Manager",
  "Ejen Jualan RKJ Distributor": "RKJ Distributor Sales Agent",
  "Syarikat majikan masing-masing": "Each legal employer company",
  "Mengikut cawangan dan syarikat majikan": "By branch and employer company",
  "Kewangan syarikat dan cawangan berkaitan":
    "Company finance and related branches",
  "RKJ Distributor Sdn Bhd untuk semua cawangan Roti Kaya Junus":
    "RKJ Distributor Sdn Bhd for all Roti Kaya Junus branches",
  "Semak operasi harian": "Review daily operations",
  "Lihat jualan, syif POS, stok rendah dan isu cawangan.":
    "Review sales, POS shifts, low stock and branch issues.",
  "Audit kerja AM/OM/Admin": "Audit AM/OM/Admin work",
  "Semak governance panel: scorecard AM, bukti collection, queue approval, dan tindakan yang perlu escalation.":
    "Review the governance panel: AM scorecards, collection proof, approval queue and actions requiring escalation.",
  "Urus pengguna dan cawangan": "Manage users and branches",
  "Tambah staf, tetapkan role, branch dan akses modul.":
    "Add staff, set roles, branches and module access.",
  "Semak kelulusan": "Review approvals",
  "Lulus atau tolak permintaan yang memerlukan tindakan HQ.":
    "Approve or reject requests that require HQ action.",
  "Pantau laporan": "Monitor reports",
  "Semak laporan jualan, staf, produk dan prestasi cawangan.":
    "Review sales, staff, product and branch performance reports.",
  "Semak rekod HR": "Review HR records",
  "Pastikan staf berada di group HR syarikat yang betul.":
    "Ensure staff are under the correct company HR group.",
  "Lengkapkan profil pekerja": "Complete employee profiles",
  "Kemaskini IC/passport, telefon, bank, jawatan, status kerja dan majikan.":
    "Update IC/passport, phone, bank, position, work status and employer.",
  "Proses payroll": "Process payroll",
  "Semak gaji, elaun, potongan dan slip gaji dalam tab Gaji & Payroll.":
    "Review salary, allowances, deductions and payslips in the Payroll tab.",
  "Pantau kehadiran": "Monitor attendance",
  "Rujuk syif dan kehadiran untuk isu gaji atau disiplin.":
    "Refer to shifts and attendance for payroll or discipline issues.",
  "Pantau prestasi cawangan": "Monitor branch performance",
  "Semak jualan, transaksi dan cawangan bermasalah.":
    "Review sales, transactions and problem branches.",
  "Semak stok kiosk": "Review kiosk stock",
  "Pastikan stok rendah dan kritikal diselesaikan melalui inventory.":
    "Ensure low and critical stock are resolved through inventory.",
  "Kawal jadual dan kehadiran": "Control schedules and attendance",
  "Semak syif staf, kekurangan tenaga kerja dan laporan pengurus kawasan.":
    "Review staff shifts, manpower shortages and area manager reports.",
  "Pantau maintenance": "Monitor maintenance",
  "Pastikan tiket cawangan diberi tindakan dan status dikemaskini.":
    "Ensure branch tickets are acted on and statuses are updated.",
  "Pastikan pengeluaran, bahan mentah, stok kilang dan serahan produk berjalan mengikut jadual production.":
    "Ensure production, raw materials, factory stock and product handoff run according to the production schedule.",
  "Mulakan hari dengan semak order masuk, jadual production, stock card bahan mentah, penggunaan harian dan handoff stok kepada RKJ Distributor.":
    "Start the day by reviewing incoming orders, the production schedule, raw material stock cards, daily usage and stock handoff to RKJ Distributor.",
  "Semak production queue": "Review production queue",
  "Pantau order masuk, tarikh production dan batch yang perlu disiapkan.":
    "Monitor incoming orders, production dates and batches that must be completed.",
  "Semak command center kilang": "Review factory command center",
  "Pantau exception production, bahan mentah kritikal, audit staf dan escalation kepada owner hanya bila impak besar.":
    "Monitor production exceptions, critical raw materials, staff audits and escalate to the owner only when the impact is major.",
  "Rekod bahan mentah": "Record raw materials",
  "Pastikan stok masuk/keluar bahan mentah direkod oleh staf bertugas mengikut kegunaan production.":
    "Ensure raw material stock in/out is recorded by assigned staff according to production usage.",
  "Semak stok kilang": "Review factory stock",
  "Pantau baki bahan mentah, stok siap dan isu reject/expired sebelum serahan.":
    "Monitor raw material balances, finished stock and rejected/expired issues before handoff.",
  "Laporan production": "Production report",
  "Semak prestasi produk, penggunaan bahan dan isu operasi kilang.":
    "Review product performance, material usage and factory operation issues.",
  "Pastikan HQ Distributor, logistik, driver, ejen, group rate dan pengedaran stok bergerak lancar.":
    "Ensure Distributor HQ, logistics, drivers, agents, group rates and stock distribution run smoothly.",
  "Semak stok HQ, order dari cawangan/ejen, jadual driver, status penghantaran, bayaran ejen dan isu maintenance/logistik.":
    "Review HQ stock, branch/agent orders, driver schedules, delivery status, agent payments and maintenance/logistics issues.",
  "Semak HQ Distributor": "Review Distributor HQ",
  "Pantau stok diterima dari kilang, cross-dock dan stok untuk dihantar ke kiosk/ejen.":
    "Monitor stock received from the factory, cross-dock stock and stock to be delivered to kiosks/agents.",
  "Semak command center distributor": "Review distributor command center",
  "Kawal driver, ejen, route, cash collection dan bukti kerja supaya operasi tidak perlu menunggu owner.":
    "Control drivers, agents, routes, cash collection and work proof so operations do not need to wait for the owner.",
  "Susun logistik": "Arrange logistics",
  "Pantau driver, kenderaan, route, dispatch dan POD penghantaran.":
    "Monitor drivers, vehicles, routes, dispatch and delivery POD.",
  "Pantau Portal Ejen": "Monitor Agent Portal",
  "Semak senarai ejen, group rate, order stok, langganan POS dan bayaran.":
    "Review agent list, group rates, stock orders, POS subscriptions and payments.",
  "Kelulusan distributor": "Distributor approvals",
  "Sahkan pindahan stok, isu penghantaran dan perkara operasi yang menunggu tindakan.":
    "Confirm stock transfers, delivery issues and operational matters waiting for action.",
  "Pastikan operasi cawangan, POS, syif, inventori kiosk dan maintenance cawangan berjalan lancar.":
    "Ensure branch operations, POS, shifts, kiosk inventory and branch maintenance run smoothly.",
  "Pastikan jualan, stok, syif, maintenance dan prestasi cawangan bergerak lancar.":
    "Ensure sales, stock, shifts, maintenance and branch performance run smoothly.",
  "Semak KPI cawangan, jualan, stok, syif dan isu maintenance. Fokus kepada kelancaran kiosk dan pengalaman pelanggan.":
    "Review branch KPIs, sales, stock, shifts and maintenance issues. Focus on smooth kiosk operations and customer experience.",
  "Semak KPI cawangan, bantu pengurus kawasan, kawal stok dan escalate isu maintenance atau staf ganti bila perlu.":
    "Review branch KPIs, support area managers, control stock and escalate maintenance or relief staff issues when needed.",
  "Semak command center OM": "Review OM command center",
  "Semak scorecard AM, cash collection, stok kritikal, syif dan escalation sebelum isu naik kepada owner.":
    "Review AM scorecards, cash collection, critical stock, shifts and escalation before issues reach the owner.",
  "Bandingkan scorecard AM, stok kritikal, collection cash, approval dan tugasan yang perlu diarah semula.":
    "Compare AM scorecards, critical stock, cash collection, approvals and tasks that need reassignment.",
  "Pantau kutipan tunai AM": "Monitor AM cash collection",
  "Pastikan AM kutip dan bank-in tunai cawangan sekurang-kurangnya 2 kali seminggu; sasaran terbaik 6 kali seminggu.":
    "Ensure AM collects and banks in branch cash at least 2 times per week; best target is 6 times per week.",
  "Kawal collection tunai AM": "Control AM cash collection",
  "Semak cawangan yang belum dikutip, pastikan baki bank-in dibuat, dan semak voucher penggunaan cash untuk barang cawangan, petrol/diesel atau maintenance transport.":
    "Review uncollected branches, ensure remaining bank-ins are made, and check cash usage vouchers for branch items, petrol/diesel or transport maintenance.",
  "Urus operasi HQ, akses user, laporan dan kelulusan pusat untuk semua cawangan.":
    "Manage HQ operations, user access, reports and central approvals for all branches.",
  "Mulakan hari dengan semakan dashboard, selesaikan kelulusan, pastikan POS dan inventori cawangan boleh digunakan tanpa gangguan.":
    "Start the day by reviewing the dashboard, clearing approvals and ensuring branch POS and inventory can run without interruption.",
  "Audit kutipan tunai AM": "Audit AM cash collection",
  "Semak jadual collection, bank-in dan bukti third party supaya cash cawangan tidak tertunggak.":
    "Review collection schedules, bank-ins and third-party proof so branch cash does not remain outstanding.",
  "Lengkapkan rekod pekerja, dokumen staf, payroll dan slip gaji mengikut syarikat legal.":
    "Complete employee records, staff documents, payroll and payslips by legal company.",
  "Pastikan profil pekerja aktif, maklumat bank/gaji lengkap, rekod HR kemas dan payslip tersedia mengikut tempoh gaji.":
    "Ensure employee profiles are active, bank/pay information is complete, HR records are tidy and payslips are ready for each payroll period.",
  "Kawal pengeluaran, stock card bahan mentah dan pesanan dari HQ/Distributor mengikut jadual.":
    "Control production, raw material stock cards and orders from HQ/Distributor according to schedule.",
  "Semak order masuk, jadual pengeluaran, rekod keluar/masuk bahan mentah, stok produk dan serahan kepada HQ Distributor.":
    "Review incoming orders, production schedules, raw material in/out records, product stock and handoff to Distributor HQ.",
  "Semak queue pengeluaran": "Review production queue",
  "Pantau pesanan factory dan status setiap batch.":
    "Monitor factory orders and every batch status.",
  "Rekod bahan mentah production": "Record production raw materials",
  "Catat bahan masuk dan bahan digunakan mengikut hari production serta staf perekod.":
    "Record incoming materials and materials used by production day and recording staff.",
  "Acknowledge order": "Acknowledge order",
  "Terima dan selesaikan pesanan mengikut production date.":
    "Receive and complete orders according to production date.",
  "Semak laporan produk": "Review product reports",
  "Lihat prestasi produk dan isu reject/expired untuk tindakan.":
    "View product performance and rejected/expired issues for action.",
  "Mengawal prestasi cawangan dalam kawasan, stok kiosk, jadual staf dan isu operasi harian.":
    "Control branch performance in the area, kiosk stock, staff schedules and daily operational issues.",
  "Mulakan hari dengan semak cawangan, pastikan staf cukup, POS buka, stok stabil dan laporan cawangan diberi tindakan.":
    "Start the day by checking branches, ensuring enough staff, POS is open, stock is stable and branch reports are acted on.",
  "Semak cawangan kawasan": "Review area branches",
  "Lihat jualan, stok kritikal, staf hadir dan syif terbuka.":
    "View sales, critical stock, staff attendance and open shifts.",
  "Update scorecard kawasan": "Update area scorecard",
  "Semak skor kawalan, cawangan merah, bukti collection, approval dan exception yang perlu dimaklumkan kepada OM.":
    "Review control scores, red branches, collection proof, approvals and exceptions that must be reported to OM.",
  "Kutip, guna sah dan bank-in tunai cawangan":
    "Collect, use approved cash and bank in branch cash",
  "Rekod kutipan cash, guna hanya untuk request cawangan approved/petrol/maintenance dengan bukti, kemudian bank-in baki bersih ke akaun syarikat.":
    "Record cash collection, use cash only for approved branch requests/petrol/maintenance with proof, then bank in the net balance to the company account.",
  "Sediakan jadual staf": "Prepare staff schedule",
  "Rancang roster mingguan dan pastikan semua cawangan ada staf cukup.":
    "Plan the weekly roster and ensure all branches have enough staff.",
  "Jadual spring cleaning bulanan": "Monthly spring cleaning schedule",
  "Tetapkan tarikh pembersihan mendalam untuk cawangan dalam kawasan.":
    "Set deep-cleaning dates for branches in the area.",
  "Meeting pengurusan highway": "Highway management meeting",
  "Rekod meeting highway untuk satu atau banyak cawangan yang terlibat.":
    "Record highway meetings for one or more involved branches.",
  "Pantau inventory kiosk": "Monitor kiosk inventory",
  "Selesaikan stok rendah, pindahan cawangan dan order ke HQ.":
    "Resolve low stock, branch transfers and orders to HQ.",
  "Laporkan maintenance/staf shortage": "Report maintenance/staff shortage",
  "Hantar laporan kepada Hanif untuk maintenance atau keperluan staf ganti.":
    "Send reports to Hanif for maintenance or relief staff needs.",
  "Laksanakan penghantaran mengikut route dan kenderaan rasmi RKJ Distributor, sahkan POD dan kemaskini status perjalanan.":
    "Carry out deliveries according to the official RKJ Distributor route and vehicle, confirm POD and update trip status.",
  "Semak route hari ini, kenderaan/plat bertugas, dispatch order, confirm setiap stop, upload bukti penghantaran dan lapor isu kenderaan atau kelewatan.":
    "Review today's route, assigned vehicle/plate, dispatch orders, confirm each stop, upload delivery proof and report vehicle or delay issues.",
  "Semak jadual delivery": "Review delivery schedule",
  "Lihat tugasan dan route yang diberikan.": "View assigned tasks and routes.",
  "Dispatch dan update status": "Dispatch and update status",
  "Kemaskini status keluar, dalam perjalanan dan selesai.":
    "Update status for departed, in transit and completed.",
  "Upload POD": "Upload POD",
  "Sahkan bukti penghantaran untuk setiap order/stop.":
    "Confirm delivery proof for each order/stop.",
  "Laporkan isu": "Report issue",
  "Maklumkan maintenance jika kenderaan atau route bermasalah.":
    "Notify maintenance if the vehicle or route has an issue.",
  "Jalankan syif, POS, stok kiosk dan laporan harian mengikut arahan pengurus.":
    "Run shifts, POS, kiosk stock and daily reports according to manager instructions.",
  "Clock-in, buka POS, jual produk, kemaskini stok/reject/expired dan lapor maintenance atau kekurangan staf dengan segera.":
    "Clock in, open POS, sell products, update stock/reject/expired items and report maintenance or staff shortages immediately.",
  "Semak jadual syif": "Review shift schedule",
  "Pastikan masa kerja, cawangan dan arahan harian jelas.":
    "Ensure work time, branch and daily instructions are clear.",
  "Clock-in dan buka POS": "Clock in and open POS",
  "Mulakan syif, buka kaunter dan rekod jualan harian.":
    "Start the shift, open the counter and record daily sales.",
  "Kira stok, rekod expired/reject dan maklumkan stok rendah.":
    "Count stock, record expired/rejected items and report low stock.",
  "Lapor isu cawangan": "Report branch issue",
  "Hantar report maintenance, emergency atau kekurangan staf.":
    "Submit maintenance, emergency or staff shortage reports.",
  "Reconcile kutipan, bank-in, pembayaran, payroll dan laporan kewangan.":
    "Reconcile collections, bank-ins, payments, payroll and finance reports.",
  "Semak tunai tertunggak, pastikan bank-in lengkap, reconcile pembayaran ejen dan sediakan laporan kewangan berkala.":
    "Review outstanding cash, ensure bank-ins are complete, reconcile agent payments and prepare periodic finance reports.",
  "Semak kutipan": "Review collections",
  "Pantau cash outstanding, voucher penggunaan cash AM, bukti bank-in dan transaksi yang belum reconcile.":
    "Monitor outstanding cash, AM cash usage vouchers, bank-in proof and unreconciled transactions.",
  "Reconcile bayaran": "Reconcile payments",
  "Padankan bank-in, payment gateway dan rekod jualan.":
    "Match bank-ins, payment gateway records and sales records.",
  "Semak payroll": "Review payroll",
  "Sahkan payroll bersama HR sebelum pembayaran.":
    "Confirm payroll with HR before payment.",
  "Laporan kewangan": "Finance report",
  "Sediakan ringkasan jualan, kutipan dan perbelanjaan.":
    "Prepare sales, collection and expense summaries.",
  "Dashboard Kawasan": "Area Dashboard",
  "Jadual Saya": "My Schedule",
  "Terima, tapis dan selesaikan report maintenance, emergency dan kekurangan staf semua cawangan.":
    "Receive, triage and resolve maintenance, emergency and staff shortage reports for all branches.",
  "Semak tiket baru, susun prioriti, kemaskini status, rekod tindakan dan aktifkan peranan staf ganti bila cawangan kekurangan staf.":
    "Review new tickets, prioritize, update status, record actions and activate relief staff duties when branches are short-staffed.",
  "Semak tiket baru": "Review new tickets",
  "Lihat report maintenance, staff shortage dan emergency dari staf/AM.":
    "View maintenance, staff shortage and emergency reports from staff/AM.",
  "Tetapkan prioriti tindakan": "Set action priority",
  "Utamakan isu safety, operasi POS, elektrik, equipment dan kekurangan staf.":
    "Prioritize safety, POS operations, electrical, equipment and staff shortage issues.",
  "Kemaskini status kerja": "Update work status",
  "Rekod tindakan, nota dan status IN_PROGRESS/RESOLVED.":
    "Record actions, notes and IN_PROGRESS/RESOLVED status.",
  "Bantu sebagai staf ganti": "Assist as relief staff",
  "Semak laporan kekurangan staf dan hadir ke cawangan yang memerlukan bantuan.":
    "Review staff shortage reports and attend branches that need support.",
  "Order stok mengikut group harga, pantau bayaran dan urus outlet/POS langganan jika diaktifkan.":
    "Order stock by price group, monitor payments and manage subscribed outlet/POS if activated.",
  "Semak katalog harga, buat order, sahkan bayaran, lihat status penghantaran dan aktifkan POS RM200 sebulan per cawangan jika mahu daftar staf jualan/outlet POS.":
    "Check the price catalog, create orders, confirm payment, view delivery status and activate POS at RM200 per month per branch if registering sales staff/POS outlets.",
  "Harga dipaparkan ikut group rate ejen yang ditetapkan RKJ Distributor.":
    "Prices are shown according to the agent group rate set by RKJ Distributor.",
  "Pilih produk, kuantiti dan jadual penghantaran.":
    "Select products, quantity and delivery schedule.",
  "Bayar online dan semak receipt/status payment.":
    "Pay online and check receipt/payment status.",
  "Tambah outlet, staf jualan dan langganan POS RM200/cawangan jika digunakan.":
    "Add outlets, sales staff and RM200/branch POS subscription if used.",

  // Branches
  "Pusat Cawangan Roti Kaya Junus": "Roti Kaya Junus Branch Center",
  "Pantau profil cawangan, POS, syif, staf, stok kiosk dan isu operasi dalam satu tempat.":
    "Monitor branch profiles, POS, shifts, staff, kiosk stock and operational issues in one place.",
  "Cawangan Aktif": "Active Branches",
  "Isu Stok": "Stock Issues",
  Maintenance: "Maintenance",
  "Tiada cawangan dalam skop akses": "No branches in your access scope",
  "Hubungi Pentadbir Utama untuk tetapkan cawangan, region atau tahap akses pengguna.":
    "Contact the Main Administrator to assign branches, region or user access level.",
  "Senarai Cawangan": "Branch List",
  "Pilih cawangan untuk lihat profil operasi penuh.":
    "Select a branch to view the full operating profile.",
  "Cari kod, nama, area atau pengurus...":
    "Search code, name, area or manager...",
  "Tiada cawangan sepadan": "No matching branches",
  "Cuba tukar carian atau tapisan.": "Try changing the search or filter.",
  "Cawangan Dipilih": "Selected Branch",
  "Kod Cawangan": "Branch Code",
  "Nama Cawangan": "Branch Name",
  "Region / Kawasan": "Region / Area",
  "Area / Zon": "Area / Zone",
  "Pengurus / AM": "Manager / AM",
  "Status Kedai": "Store Status",
  "Nama lokasi kiosk": "Kiosk location name",
  "Nama pengurus cawangan atau AM": "Branch manager or AM name",
  "Kod cawangan dikunci untuk elak rekod POS lama bercampur.":
    "Branch code is locked to prevent old POS records from mixing.",
  "Operasi Hari Ini": "Today Operations",
  "Ringkasan POS, jualan dan kehadiran staf.":
    "Summary of POS, sales and staff attendance.",
  "Prestasi bulan ini": "This Month Performance",
  "Stok, Pickup dan Maintenance": "Stock, Pickup and Maintenance",
  "Isu operasi yang perlu dipantau sebelum cawangan terganggu.":
    "Operational issues to monitor before the branch is disrupted.",
  "Cadangan Sistem": "System Suggestions",
  "Tindakan proaktif berdasarkan keadaan cawangan ini.":
    "Proactive actions based on this branch condition.",
  "Tindakan Cepat": "Quick Actions",
  "Pintu masuk terus ke modul yang berkaitan cawangan ini.":
    "Direct entry to modules related to this branch.",
  "Jualan dan QR payment": "Sales and QR payment",
  "Stok kiosk dan transfer": "Kiosk stock and transfers",
  "Roster dan attendance": "Roster and attendance",
  "Report dan tindakan": "Reports and actions",
  "Prestasi cawangan": "Branch performance",
  "Stok & Staf Cawangan": "Branch Stock & Staff",
  "Kemaskini stok semasa, semak staf bertugas dan pindah staf mengikut skop akses.":
    "Update current stock, check assigned staff and transfer staff according to access scope.",
  "Kiosk inventory aktif": "Kiosk inventory active",
  "Daftar lokasi kiosk dahulu": "Register kiosk location first",
  "Boleh kemaskini dengan reason": "Can update with reason",
  "Boleh edit dan pindah staf": "Can edit and transfer staff",
  "Stok Semasa Cawangan": "Current Branch Stock",
  "Staf Cawangan": "Branch Staff",
  "Tajuk dokumen": "Document Title",
  "Contoh: Lesen premis / LOO / Permit operasi":
    "Example: Premise license / LOO / operating permit",
  "Tarikh mula / isu": "Start / issue date",
  "Tarikh tamat": "End date",
  "Fail dokumen": "Document file",
  "PDF/gambar boleh View terus; Excel akan disediakan sebagai download.":
    "PDF/images can be viewed directly; Excel files are available for download.",
  "Nota rujukan": "Reference notes",
  "Contoh: dokumen sah untuk operasi kiosk, perlu semak semula sebelum tamat tempoh.":
    "Example: valid document for kiosk operations, review again before expiry.",
  "Belum ada dokumen cawangan": "No branch documents yet",
  "Kemaskini Stok Semasa Cawangan": "Update Current Branch Stock",
  "Item Stok": "Stock Item",
  "Stok Semasa Dalam Sistem": "Current System Stock",
  "Kuantiti Fizikal Sebenar": "Actual Physical Quantity",
  "Sebab Pelarasan": "Adjustment Reason",
  "Catatan Tambahan": "Additional Notes",
  "Contoh: kiraan fizikal selepas closing, disahkan oleh AM.":
    "Example: physical count after closing, confirmed by AM.",
  "Edit / Pindah Staf Cawangan": "Edit / Transfer Branch Staff",
  "Nama Staf": "Staff Name",
  "Cawangan Bertugas": "Assigned Branch",
  "Tiada lokasi stok": "No stock location",
  "Kelengkapan Profil": "Profile Completeness",

  // POS
  "Kaunter POS": "POS Counter",
  "Troli kosong": "Empty cart",
  "Ketik produk di sebelah kiri untuk mula jualan":
    "Tap a product on the left to start sales",
  "Baki stok kiosk dikemaskini setiap muat semula - ditolak automatik selepas jualan":
    "Kiosk stock updates on refresh and is deducted automatically after sales",
  "Syif Terbuka": "Shift Open",
  "Dalam talian": "Online",
  "Tutup Syif": "Close Shift",
  "Syif Semasa": "Current Shift",
  "Hari Ini": "Today",
  Tunai: "Cash",
  QR: "QR",
  Jualan: "Sales",
  Transaksi: "Transactions",
  "Batal / Bayar Balik": "Voids / Refunds",
  "Stok & SOP": "Stock & SOP",
  "Staf Dalam Syif": "Staff in Shift",
  "Tiada staf aktif direkod dalam syif. Rekod staf bertugas supaya masa kerja dan payroll lebih tepat.":
    "No active staff recorded in this shift. Record working staff so work time and payroll are more accurate.",
  "Tambah staf masuk syif": "Add staff to shift",
  Peranan: "Role",
  "Nama manual jika staf belum ada akaun":
    "Manual name if staff has no account",
  "Tambah manual": "Add manual",
  "Rekod saya mula bertugas": "Record me starting work",
  "Kiraan Baki Stok Syif": "Shift Stock Balance Count",
  "Jenis pengesahan": "Confirmation Type",
  "Production date": "Production date",
  "Guna anggaran AI": "Use AI estimate",
  "Anggaran AI hanya panduan awal daripada tutup syif terakhir atau stok semasa sistem. Staf tetap wajib kira stok fizikal dengan tepat sebelum confirm.":
    "AI estimate is only an initial guide from the last closed shift or current system stock. Staff must still count physical stock accurately before confirming.",
  "Tambah item kiraan": "Add count item",
  "Hantar kiraan stok": "Submit stock count",
  "AI Presence Check": "AI Presence Check",
  "Saya berada di POS": "I am at POS",
  "Rekod keluar kiosk": "Record leaving kiosk",
  "AI ingatkan kiraan stok": "AI stock count reminder",
  "Kira sekarang": "Count now",
  "Nanti, layan customer dulu": "Later, serve customer first",
  "Buka syif POS dahulu": "Open POS shift first",
  "Sahkan stok driver dahulu": "Confirm driver stock first",
  "Selesaikan tugasan POS": "Complete POS task",

  // Approvals
  Kelulusan: "Approvals",
  "Luluskan atau tolak permintaan syif, gaji, stok, dan penyelarasan tunai":
    "Approve or reject shift, payroll, stock and cash reconciliation requests",
  "Semua selesai": "All clear",
  "Tiada kelulusan menunggu": "No pending approvals",
  "Semua permintaan telah diproses. Rekod baharu akan muncul di sini.":
    "All requests have been processed. New records will appear here.",
  "Kelulusan yang telah diproses akan dipaparkan di sini.":
    "Processed approvals will be shown here.",
  "Kelulusan & Exception Center": "Approval & Exception Center",
  "Semak permintaan mengikut SLA, bukti wajib dan pemilik tugas supaya operasi tidak tersekat.":
    "Review requests by SLA, required proof and task owner so operations do not get stuck.",
  "Permintaan belum diputuskan": "Requests awaiting decision",
  "Lebih SLA": "Over SLA",
  "Perlu tindakan segera": "Immediate action required",
  "Hampir SLA": "Near SLA",
  "Jangan biar jadi lewat": "Do not let it become late",
  "Risiko Stok/Tunai": "Stock/Cash Risk",
  "Semak bukti sebelum lulus": "Check proof before approval",
  "Pemilik tindakan": "Action owner",
  SLA: "SLA",
  Eskalasi: "Escalation",
  "Bukti wajib sebelum keputusan": "Required proof before decision",
  Umur: "Age",
  Lulus: "Approve",
  Tolak: "Reject",
  "Sahkan Tolak": "Confirm Reject",
  "Gagal memuatkan kelulusan": "Failed to load approvals",
  "Gagal meluluskan": "Failed to approve",
  "Gagal menolak": "Failed to reject",
  "Pusat Exception & SLA": "Exception & SLA Center",
  "Setiap isu perlu bergerak ikut status, pemilik tugas dan masa sasaran supaya kerja tidak tersekat.":
    "Every issue must move by status, owner and target time so work does not stall.",
  "Audit hidup": "Live audit",
  Dikesan: "Detected",
  Disemak: "Reviewed",
  "Dalam tindakan": "In progress",
  "Perlu kelulusan": "Needs approval",
  Owner: "Owner",
  "Matriks Kelulusan": "Approval Matrix",
  "Bukti wajib": "Required proof",
  "Audit & Bukti Kerja": "Audit & Work Evidence",
  Risiko: "Risk",
  "Staf Dalam Syif POS": "POS Shift Staff",
  "Stok & Delivery": "Stock & Delivery",
  "Tunai & Risiko Jualan": "Cash & Sales Risk",
  "Route & POD": "Route & POD",
  "Ejen & POS Outlet": "Agent & POS Outlet",

  // HR / payroll
  "Sumber Manusia": "Human Resources",
  "HR & Gaji": "HR & Payroll",
  "Gaji & Payslip": "Payroll & Payslips",
  "Daftar Staf Baharu": "Register New Staff",
  "Tambah Staf Baharu": "Add New Staff",
  "Maklumat Staf": "Staff Information",
  "Kod Staf": "Staff Code",
  "Nama Penuh": "Full Name",
  "Syarikat Majikan & Penempatan": "Employer Company & Placement",
  "Syarikat Majikan": "Employer Company",
  "Lokasi / Cawangan": "Location / Branch",
  "Jenis Staf & Kadar Gaji": "Staff Type & Pay Rate",
  "Pekerja Asing": "Foreign Worker",
  "Staf Tempatan": "Local Staff",
  "Anggaran Gaji": "Estimated Pay",
  "Gaji Pokok": "Basic Salary",
  "Elaun Kehadiran": "Attendance Allowance",
  "Jumlah bulanan": "Monthly Total",
  "Gaji bulanan syarikat": "Company monthly salary",
  "Syarikat semasa": "Current company",
  "Syarikat destinasi": "Destination company",
  "Pilih Syarikat": "Select Company",

  // Finance
  Kewangan: "Finance",
  "Kutipan tunai kiosk, bank masuk, penyelarasan, dan laporan harian":
    "Kiosk cash collection, bank-in, reconciliation and daily reports",
  "Dikutip Hari Ini": "Collected Today",
  "Bank Masuk": "Banked In",
  Penyelarasan: "Reconciliation",
  Tertunggak: "Outstanding",
  "Kawalan Kutipan Tunai AM": "AM Cash Collection Control",
  "Arahan kerja penggunaan cash collection":
    "Cash collection usage work instructions",
  "Rekod / Assign Kutipan": "Record / Assign Collection",
  Cawangan: "Branch",
  "Jumlah cash": "Cash amount",
  Kaedah: "Method",
  "AM sendiri": "AM self",
  "Pihak ketiga": "Third party",
  "Nama third party": "Third party name",
  "Contoh: security / runner bank-in": "Example: security / bank-in runner",
  "Contoh: kutipan Isnin/Rabu, duit diambil jam 3 petang":
    "Example: Monday/Wednesday collection, cash picked up at 3 PM",
  "Voucher Guna Cash": "Cash Usage Voucher",
  "Cash collection": "Cash collection",
  "Pilih kutipan cash": "Select cash collection",
  "Jenis penggunaan": "Usage type",
  "Jumlah guna": "Usage amount",
  "Request staf cawangan yang diluluskan": "Approved branch staff request",
  "Pilih request approved": "Select approved request",
  "Rujukan kenderaan": "Vehicle reference",
  "Contoh: VAN AM / WXX 1234": "Example: AM VAN / WXX 1234",
  "Vendor / stesen": "Vendor / station",
  "Contoh: Petronas / bengkel": "Example: Petronas / workshop",
  "Catatan tujuan": "Purpose notes",
  "Contoh: beli plastik S untuk BR011 berdasarkan request staf":
    "Example: buy Plastic S for BR011 based on staff request",
  "Link bukti/resit": "Proof/receipt link",
  "URL gambar/resit": "Image/receipt URL",
  "No. resit": "Receipt no.",
  "No. resit jika ada": "Receipt no. if available",
  "Bank-in Baki Bersih": "Bank In Net Balance",
  "Rekod kutipan": "Collection record",
  "Pilih kutipan belum selesai": "Select pending collection",
  Formula: "Formula",
  "Jumlah bank-in": "Bank-in amount",
  Bank: "Bank",
  "Rujukan bank": "Bank reference",
  "Link gambar/slip": "Image/slip link",
  Terakhir: "Latest",
  "Baki bank-in": "Bank-in balance",
  "Voucher penggunaan cash terkini": "Latest cash usage vouchers",
  "Bank-in terkini": "Latest bank-ins",
  "Bukti slip disimpan": "Slip proof saved",

  // Fleet / factory / inventory
  Logistik: "Logistics",
  Pemandu: "Driver",
  Kenderaan: "Vehicle",
  Inventori: "Inventory",
  Kilang: "Factory",
  "Bahan Mentah": "Raw Materials",
  "Jadual Production": "Production Schedule",
  "Laporan Order HQ": "HQ Order Report",
  "Order Menunggu": "Pending Orders",
  "Order Disahkan": "Confirmed Orders",
  "Jumlah Order Aktif": "Total Active Orders",
  "Perlu pengesahan kilang": "Factory confirmation required",
  "Sedia untuk production": "Ready for production",
  "Auto-tugaskan driver ikut kawasan": "Auto-assign driver by area",
  "Pilih driver...": "Select driver...",
  Cadangan: "Suggestion",

  // Agents
  "Portal Ejen": "Agent Portal",
  "Portal Ejen Jualan": "Sales Agent Portal",
  "Tambah Ejen Baharu": "Add New Agent",
  "Senarai Ejen": "Agent List",
  "Ejen Aktif": "Active Agents",
  "Jumlah Ejen": "Total Agents",
  "Group Rate": "Group Rate",
  "Laporan Keluar": "Exit Reports",
  "Order Stok": "Stock Orders",
  "Cawangan POS": "POS Outlets",
  "Staf Jualan": "Sales Staff",
  "Langganan / cawangan": "Subscription / branch",

  // High-frequency legacy dashboard labels
  "Tindakan HR": "HR Actions",
  "Ejen / Agent Access RKJ Distributor": "Agent Access - RKJ Distributor",
  Ejen: "Agent",
  "Jenis Ejen / Access": "Agent Type / Access",
  "Ejen Biasa - Default sistem": "Standard Agent - System Default",
  "Ejen Biasa": "Standard Agent",
  "Ejen Khas": "Special Agent",
  "Ejen Khas Syarikat": "Company Special Agent",
  "1. Pilih Cawangan": "1. Select Branch",
  "2. Pilih Syarikat Majikan": "2. Select Employer Company",
  "3. Auto Login & Gaji": "3. Auto Login & Payroll",
  "Staf boleh diletakkan bawah cawangan kiosk atau lokasi yang dibenarkan.":
    "Staff can be assigned under a kiosk branch or an approved location.",
  "Kemaskini profil staf operasi atau pengguna HQ/pengurusan.":
    "Update operations staff or HQ/management user profiles.",
  "Pilih cawangan terlibat": "Select involved branches",
  "Tiada cawangan dalam skop.": "No branches in scope.",
  "Tajuk tugasan": "Task title",
  Tarikh: "Date",
  Masa: "Time",
  "Pihak highway / lokasi meeting": "Highway party / meeting location",
  "Nota / agenda": "Notes / agenda",
  "Senarai perancangan terbaru": "Latest planning list",
  "Memuat cawangan...": "Loading branches...",
  "Nota Pemandu": "Driver Notes",
  "Tambah arahan untuk pratonton": "Add instructions for preview",
  "2. Pemandu penghantaran": "2. Delivery driver",
  Stok: "Stock",
  Prestasi: "Performance",
  "Syif / Staf": "Shift / Staff",
  "Tiada kiosk": "No kiosk",
  "Syif tutup": "Shift closed",
  "Tiada rekod audit.": "No audit records.",
  "Kembali ke Portal Ejen": "Back to Agent Portal",
  "Buka Kilang > Jadual Production.": "Open Factory > Production Schedule.",
  "Pilih minggu akan datang dan hari production.":
    "Select the upcoming week and production days.",
  "Tekan Terbitkan ke HQ, kemudian kembali ke Order Kilang.":
    "Click Publish to HQ, then return to Factory Orders.",
  "Order Ramalan HQ ke Kilang (Semua Stok Per Cawangan)":
    "HQ Forecast Orders to Factory (All Stock by Branch)",
  "Kilang - Jadual Production Mingguan": "Factory - Weekly Production Schedule",
  "Kekurangan Staf": "Staff Shortage",
  "Laporan tidak dapat dimuatkan.": "Report could not be loaded.",
  "Bank Gaji": "Payroll Bank",
  "Urutan kerja disyorkan: Kilang, kemudian Ejen Khas, kemudian Logistik.":
    "Recommended workflow: Factory, then Special Agent, then Logistics.",
  "Sahkan batch, semak order/pickup Ejen Khas, kemudian pastikan driver cover lokasi yang betul.":
    "Confirm batches, review Special Agent orders/pickups, then ensure drivers cover the correct locations.",
  "Tiada staf dalam kategori ini.": "No staff in this category.",
  "Gaji (auto)": "Payroll (auto)",
  "Tiada pindahan lagi": "No transfers yet",
  "Tiada staf dijumpai": "No staff found",
  "Tiada staf": "No staff",
  "Dokumen tidak boleh dilihat.": "Document cannot be viewed.",
  "Jadual Mingguan Staf": "Weekly Staff Schedule",
  "Stok Roti - Cawangan": "Bread Stock - Branch",
  "Tiada data hari ini": "No data today",
  "Stok (9 jenis)": "Stock (9 types)",
  "Pelan Pindah Stok Antara Cawangan": "Inter-Branch Stock Transfer Plan",
  "Cawangan ambil": "Receiving branch",
  "Cawangan hantar": "Sending branch",
  "Pindahan Cawangan Terkini": "Latest Branch Transfers",
  Staf: "Staff",
  "Tiada shift": "No shift",
  "Tiada pengguna berdaftar.": "No registered users.",
  "Tambah Pengguna": "Add User",
  "Tiada / HQ": "None / HQ",
  "Tambah Item Stok": "Add Stock Item",
  "Tambah Produk POS": "Add POS Product",
  "Tambah Cawangan Kiosk": "Add Kiosk Branch",
  "Kawasan (Pengurus Kawasan)": "Area (Area Manager)",
  "Lapor Reject Stok": "Report Rejected Stock",
  "Tiada item stok dijumpai.": "No stock items found.",
  "Staf sahkan": "Staff confirmation",
  "AI Anggaran Stok POS": "AI POS Stock Estimate",
  "Staf belum ada akaun portal.": "Staff does not have a portal account yet.",
  "Jenis Staf": "Staff Type",
  "Gaji bulanan (RM)": "Monthly salary (RM)",
  "Gaji mingguan (RM)": "Weekly salary (RM)",
  "Maklumat Staf & Akses Sistem": "Staff Information & System Access",
  "Akaun Login Staf Dicipta": "Staff Login Account Created",
  "Stok Pelbagai": "Miscellaneous Stock",
  "Tiada profile syarikat.": "No company profile.",
  "Jumlah Dokumen": "Total Documents",
  "Cawangan berkaitan": "Related branch",
  "Tiada dokumen untuk pilihan ini.": "No documents for this selection.",
  "Tiada data ringkasan": "No summary data",
  "Syif dibuka": "Shift opened",
  "Jualan pertama": "First sale",
  "Jualan tunai": "Cash sales",
  "Buka Syif": "Open Shift",
  "Reject Stok": "Reject Stock",
  "Daftar Akaun Ejen": "Register Agent Account",
  "Nama Syarikat Ejen": "Agent Company Name",
  "Nama Staf Jualan": "Sales Staff Name",
  "Staf Jualan Outlet": "Outlet Sales Staff",
  "Runner Jualan": "Sales Runner",
  "Supervisor Outlet Ejen": "Agent Outlet Supervisor",
  "Password ini dipaparkan sekali sahaja. Simpan secara selamat dan minta ejen tukar selepas login.":
    "This password is shown only once. Store it securely and ask the agent to change it after login.",
  "Pilih staf sedia ada dan benarkan order/POS tanpa bayaran.":
    "Select an existing staff member and allow orders/POS without payment.",
  "Pilih Staf Ejen Khas": "Select Special Agent Staff",
  "Pilih staf": "Select staff",
  "Pilih driver, cawangan cover atau isi pickup point manual.":
    "Select drivers, covered branches or enter manual pickup points.",
  "Tiada driver aktif didaftarkan dalam syarikat.":
    "No active drivers are registered in the company.",
  "Tempat Pickup / Cawangan Cover": "Pickup Points / Covered Branches",
  "Cawangan syarikat": "Company branches",
  "Staf Bertugas": "Assigned Staff",
  "Edit Profil Ejen Khas": "Edit Special Agent Profile",
  "Simpan Profil Ejen Khas": "Save Special Agent Profile",
  "Jika tiada outlet POS, isi 1 pickup point manual":
    "If there is no POS outlet, enter 1 manual pickup point",
  "Tiada outlet POS. Isi pickup point manual di atas.":
    "No POS outlet. Enter the manual pickup point above.",
  "No. Pendaftaran Ejen": "Agent Registration No.",
  "Butiran Order Stok": "Stock Order Details",
  "Pilih item kiraan": "Select count item",
  "Baki kiosk": "Kiosk balance",
  "Baki kiosk (bag - pcs)": "Kiosk balance (bag - pcs)",
  "Baki kiosk (tong)": "Kiosk balance (tub)",
  "Jumlah rasmi": "Official total",
  "Mula Perniagaan": "Start Business",
  "Masa mula jualan": "Sales start time",
  "Masa mula kerja gaji": "Payroll work start time",
  "Masa tamat kerja sebenar": "Actual work end time",
  "Staf Dalam Syif - Menunggu Kelulusan": "Staff in Shift - Pending Approval",
  "Tambah staf dalam syif": "Add staff to shift",
  "Perlu kelulusan AM/HQ sebelum rasmi dalam POS.":
    "Requires AM/HQ approval before becoming official in POS.",
  "Hanya staf cawangan ini boleh dipilih.":
    "Only staff assigned to this branch can be selected.",
  "Maklumat akses": "Access information",
  "Akses Sistem": "System Access",
  "Tahap Akses": "Access Level",
  "SOP Kerja": "Work SOP",
  "Auto cipta dashboard khas ikut akses yang diberi.":
    "Automatically creates a role-specific dashboard based on granted access.",
  "Kadar syarikat sendiri": "Company-specific rate",
  "Kadar gaji syarikat sendiri": "Company-specific pay rate",
  "Kadar ini khusus untuk RKJ Distributor Sdn Bhd. Ia tidak guna formula kiosk Roti Kaya Junus.":
    "This rate is specific to RKJ Distributor Sdn Bhd. It does not use the Roti Kaya Junus kiosk formula.",
  "Kadar ini khusus untuk Roti Kaya Junus Manufacturing Sdn Bhd. Ia tidak guna formula kiosk Roti Kaya Junus.":
    "This rate is specific to Roti Kaya Junus Manufacturing Sdn Bhd. It does not use the Roti Kaya Junus kiosk formula.",
  "Staf akan direkod sebagai staf syarikat/HQ tanpa cawangan kiosk.":
    "Staff will be recorded as company/HQ staff without a kiosk branch.",
  "Pilih syarikat undang-undang sebenar untuk rekod HR dan payroll.":
    "Select the actual legal employer for HR and payroll records.",
  "Daftar staf baharu mengikut syarikat majikan.":
    "Register new staff according to employer company.",
  "Borang ringkas untuk tambah ejen, tetapkan group rate, PIC staf khas, driver dan pickup/cawangan cover.":
    "Simple form to add agents, set price group, special staff PIC, driver and pickup/branch cover.",
  "Aliran Kerja & SOP Harian": "Daily Workflow & SOP",
  "Buka Tugasan": "Open Tasks",
  "Semak katalog harga": "Check price catalog",
  "Buat order stok": "Create stock order",
  "Sahkan bayaran": "Confirm payment",
  "Urus outlet POS": "Manage POS outlets",
  Harian: "Daily",
  Mingguan: "Weekly",
  Bulanan: "Monthly",
  "Ikut Keperluan": "As needed",
  "Dalam Perjalanan": "In Transit",
  "Belum Dihantar": "Not Sent",
  Dihantar: "Sent",
  Diterima: "Received",
  Ditolak: "Rejected",
  Diluluskan: "Approved",
  "Menunggu Kelulusan": "Pending Approval",
  "Perlu Semakan": "Needs Review",
  "Sedang Diproses": "Processing",
  Dibatalkan: "Cancelled",
  "Bayaran Disahkan": "Payment Confirmed",
  "Bayaran Tidak Disahkan": "Payment Not Confirmed",
  "Bayaran berjaya": "Payment successful",
  "Bayaran gagal": "Payment failed",
  "Bayaran disahkan bank - tempahan / langganan aktif.":
    "Payment confirmed by bank - order / subscription is active.",
  "Bayaran gagal atau dibatalkan. Tempahan stok / langganan POS tidak disahkan - sila cuba semula.":
    "Payment failed or was cancelled. Stock order / POS subscription was not confirmed - please try again.",
  "Rujukan Tugasan / POS": "Task / POS Reference",
  "Alamat Perniagaan": "Business Address",
  "No. SSM / Rujukan": "SSM / Reference No.",
  "No. Telefon": "Phone No.",
  "Email Contact": "Contact Email",
  "Nama Penuh PIC": "PIC Full Name",
  "Email Login": "Login Email",
  "Password Awal": "Initial Password",
  "Tambah Ejen": "Add Agent",
  "Simpan Kemaskini": "Save Update",
  "Kiraan stok harian cawangan": "Daily branch stock count",
  "Kiraan stok lawatan Area Manager": "Area Manager visit stock count",
  "Stok rosak / expired di cawangan": "Damaged / expired stock at branch",
  "Stok rosak / expired disahkan": "Damaged / expired stock confirmed",
  "Cawangan di luar kawasan anda": "Branch is outside your area",
  "Cawangan di luar skop akses anda": "Branch is outside your access scope",
  "Cawangan tidak dijumpai": "Branch not found",
  "Pilih sekurang-kurangnya satu cawangan": "Select at least one branch",
  "Cawangan dipilih berada di luar kawasan anda":
    "Selected branch is outside your area",
  "Meeting Pengurusan Highway": "Highway Management Meeting",
  "Tugasan Operasi": "Operations Task",
  "Profil aktif dipantau": "Active profiles monitored",
  "Profil syarikat berasingan": "Separate company profiles",
  "Cawangan boleh diaudit": "Branches can be audited",
  "Akses Pengguna & Data Syarikat": "User Access & Company Data",
  "Pentadbir Utama boleh terus membuat tindakan testing, manakala sistem memberi amaran SOP yang sepatutnya.":
    "The Main Administrator can continue testing actions while the system shows the proper SOP warning.",
  "Tiada kebenaran urus stok masuk/keluar.":
    "No permission to manage stock in/out.",
  "Akses ditolak": "Access denied",
  "Akses cawangan ditolak": "Branch access denied",
  "Akses kiosk ditolak": "Kiosk access denied",
  "Akses modul ditolak": "Module access denied",
  "Akaun tidak dijumpai": "Account not found",
  "Akaun tidak aktif": "Account inactive",
  "Belum ditetapkan": "Not set",
  "belum ditetapkan": "not set",
  "Belum direkod": "Not recorded",
  "Belum disahkan": "Not confirmed",
  "Belum paut outlet": "Outlet not linked",
  "Muat semula": "Refresh",
  "Muat Semula": "Refresh",
  "Menghantar...": "Submitting...",
  "Mengesahkan...": "Confirming...",
  "Merekod...": "Recording...",
  "Memuatkan...": "Loading...",
  "Memproses...": "Processing...",
  "Gagal muat": "Failed to load",
  "Gagal simpan": "Failed to save",
  "Gagal padam": "Failed to delete",
  "Gagal tambah": "Failed to add",
  "Gagal daftar": "Failed to register",
  "Gagal kemaskini status": "Failed to update status",
  "Gagal memuatkan senarai stok": "Failed to load stock list",
  "Gagal memuatkan lokasi": "Failed to load locations",
  "Gagal memuatkan inventori": "Failed to load inventory",
  "Gagal memuatkan perancangan AM": "Failed to load AM planning",
  "Gagal memuatkan baki cawangan": "Failed to load branch balances",
  "Gagal memuatkan staf syif": "Failed to load shift staff",
  "Gagal baca operasi cawangan": "Failed to read branch operations",
  "Gagal hantar kiraan": "Failed to submit count",
  "Gagal hantar pelarasan": "Failed to submit adjustment",
  "Gagal hantar pindahan": "Failed to submit transfer",
  "Gagal hantar lupus stok": "Failed to submit stock write-off",
  "Gagal menerima stok": "Failed to receive stock",
  "Gagal cipta pindahan": "Failed to create transfer",
  "Gagal selesaikan pindahan": "Failed to complete transfer",
  "Gagal simpan dokumen": "Failed to save document",
  "Gagal simpan dokumen cawangan": "Failed to save branch document",
  "Gagal arkib dokumen": "Failed to archive document",
  "Gagal simpan tugasan": "Failed to save task",
  "Gagal susun laluan": "Failed to arrange route",
  "Gagal muat pengguna": "Failed to load users",
  "Gagal muat profil": "Failed to load profile",
  "Nama dan e-mel diperlukan": "Name and email are required",
  "Nama dan email diperlukan": "Name and email are required",
  "Nama penuh diperlukan": "Full name is required",
  "Email, nama penuh dan nama syarikat wajib diisi":
    "Email, full name and company name are required",
  "Tidak boleh padam akaun sendiri": "You cannot delete your own account",
  "Tidak dapat lokasi GPS - benarkan akses lokasi":
    "Unable to get GPS location - allow location access",
  "Tiada kebenaran": "No permission",
  "Tiada akses": "No access",
  "Tiada staf aktif direkod dalam syif.":
    "No active staff recorded in this shift.",
  "Tidak aktif": "Inactive",
  "Dalam perjalanan": "In transit",
  Diambil: "Picked up",
  Masuk: "In",
  Keluar: "Out",
  Pilihan: "Options",
  Profil: "Profile",
  Produk: "Products",
  Kod: "Code",
  Nama: "Name",
  Alamat: "Address",
  Lokasi: "Location",
  Bahagian: "Section",
  Bahan: "Materials",
  Baki: "Balance",
  Syarikat: "Company",
  Pengguna: "User",
  pengguna: "user",
  staf: "staff",
  ejen: "agent",
  syarikat: "company",
  cawangan: "branch",
  lokasi: "location",
  rekod: "records",
  bulan: "month",
  hari: "day",
  "Pilihan status": "Status options",
  "Item stok": "Stock item",
  "Tarikh production": "Production date",
  "HQ / Syarikat": "HQ / Company",
  "Detail Lokasi": "Location Details",
  "Rekod Staf": "Staff Records",
  "Syif & Kehadiran": "Shifts & Attendance",
  "Jadual Syif Saya": "My Shift Schedule",
  "HR & Gaji Saya": "My HR & Payroll",
  "Profil HR lengkap": "HR profile complete",
  "Profil belum lengkap": "Profile incomplete",
  "Syarikat majikan": "Employer company",
  "Lokasi / Cawangan (opsyenal)": "Location / Branch (optional)",
  "Hari/minggu": "Days/week",
  "Jumlah mingguan": "Weekly total",
  "Pemilik 3 Syarikat": "Owner of 3 Companies",
  Pentadbiran: "Administration",
  "Edit Pengguna": "Edit User",
  "Pengguna ditambah": "User added",
  "Pengguna dipadam": "User deleted",
  "Staf dipadam": "Staff deleted",
  "Maklumat staf dikemaskini": "Staff information updated",
  "Pindah Syarikat": "Transfer Company",
  "Pindah Cawangan": "Transfer Branch",
  "Operasi Cawangan": "Branch Operations",
  "Tambah staf baharu": "Add new staff",
  "Tambah Cawangan": "Add Branch",
  "Tambah cawangan": "Add branch",
  "Tambah Dokumen": "Add Document",
  "Simpan Dokumen": "Save Document",
  "Dokumen Cawangan": "Branch Documents",
  "Dokumen & Peralatan": "Documents & Equipment",
  "Peralatan Jualan": "Sales Equipment",
  "Rekod & Sokongan": "Records & Support",
  "SSM / Pendaftaran": "SSM / Registration",
  "Alamat pejabat / operasi": "Office / operations address",
  "Alamat pejabat, kedai atau pickup utama":
    "Office, shop or main pickup address",
  "Alamat semasa dan nombor telefon boleh dihubungi":
    "Current address and reachable phone number",
  "Akaun Bank Rasmi": "Official Bank Account",
  "Akaun Log Masuk Portal": "Portal Login Account",
  "Akaun login dicipta": "Login account created",
  "Akaun login baharu": "New login account",
  "Akaun ejen didaftarkan": "Agent account registered",
  "Akaun ejen baharu siap dicipta": "New agent account has been created",
  "Akaun ejen tiada": "No agent account",
  "Akaun ejen tidak dijumpai": "Agent account not found",
  "Akaun ejen ini tidak memerlukan bayaran online":
    "This agent account does not require online payment",
  "Akses POS akan diaktifkan terus untuk ejen khas syarikat.":
    "POS access will be activated immediately for the company special agent.",
  "Agent Khas Syarikat": "Company Special Agent",
  "Agent / Ejen Jualan": "Agent / Sales Agent",
  "Ejen Khas -": "Special Agent -",
  "Ejen Khas Syarikat -": "Company Special Agent -",
  "Aktifkan POS": "Activate POS",
  "Aktif hingga": "Active until",
  "Aktiviti ejen akan dipaparkan di sini.": "Agent activity will appear here.",
  "Auto: Ejen Khas - nama staf": "Auto: Special Agent - staff name",
  "Daftar Ejen Baharu": "Register New Agent",
  "Nama Syarikat / Tugasan": "Company / Assignment Name",
  "Driver / Area Bertugas": "Driver / Assigned Area",
  "Area / Laluan Bertugas": "Assigned Area / Route",
  "Driver/Area:": "Driver/Area:",
  "Driver:": "Driver:",
  "Pickup/Cawangan:": "Pickup/Branch:",
  "Aktifkan outlet POS": "Activate POS outlet",
  "Tanpa bayaran": "Without payment",
  "tanpa bayaran": "without payment",
  "Bayaran manual": "Manual payment",
  "Kaedah bayaran": "Payment method",
  "Jumlah perlu bayar": "Amount due",
  "Sahkan Bayaran": "Confirm Payment",
  "FPX (Online Banking)": "FPX (Online Banking)",
  "Record Bank In": "Record Bank-In",
  "Baki perlu bank-in": "Balance to bank in",
  "Baki collection terpilih:": "Selected collection balance:",
  "Akaun - tunai - bank slip": "Account - cash - bank slip",
  "Kutipan Tunai": "Cash Collection",
  "Kutipan Harian": "Daily Collection",
  "Tunai Dipegang AM": "Cash Held by AM",
  "Bukti collection": "Collection proof",
  "Bukti bank-in": "Bank-in proof",
  "Voucher penggunaan cash": "Cash usage voucher",
  "Kewangan Cawangan": "Branch Finance",
  "Semak SOP": "Review SOP",
  "Tindakan Pantas": "Quick Actions",
  "Perlu Pantau": "Needs Monitoring",
  "Perlu Baiki": "Needs Fix",
  "Semua cawangan kawasan saya": "All branches in my area",
  "Kiosk kritikal": "Critical kiosks",
  "Staf Hadir": "Staff Present",
  "Jualan Minggu Ini": "This Week Sales",
  "Jualan Bulan Ini": "This Month Sales",
  "Kaunter jualan": "Sales Counter",
  "POS Hari Ini": "Today POS",
  "POS Aktif": "Active POS",
  "Mula perniagaan": "Business start",
  "Mula perniagaan direkod": "Business start recorded",
  "Masa mula perniagaan": "Business start time",
  "Masa mula bertugas": "Work start time",
  "Masa mula dikira gaji": "Payroll start time",
  "Masa tamat bertugas": "Work end time",
  "Masa tamat sebenar": "Actual end time",
  "Kiraan stok": "Stock count",
  "Kiraan stok dihantar": "Stock count submitted",
  "Kiraan stok permulaan": "Opening stock count",
  "Kiraan stok pertengahan syif": "Mid-shift stock count",
  "Kiraan stok tutup syif": "Closing shift stock count",
  "Anggaran AI - staf wajib kira fizikal sebenar":
    "AI estimate - staff must count the actual physical stock",
  "Anggaran AI dimasukkan sebagai draf. Staf wajib kira stok fizikal sebenar sebelum hantar.":
    "AI estimates were entered as a draft. Staff must count the actual physical stock before submitting.",
  "AI hanya isi draf. Staf wajib kira stok fizikal sebenar sebelum hantar; beza daripada AI akan dihantar kepada AM/OM untuk pengesahan.":
    "AI only fills the draft. Staff must count actual physical stock before submitting; differences from AI will be sent to AM/OM for confirmation.",
  "AI Presence Check: sila sahkan staf berada di depan POS.":
    "AI Presence Check: please confirm staff are at the POS counter.",
  "AI minta pengesahan kaunter": "AI requests counter confirmation",
  "AI SOP stok syif": "AI shift stock SOP",
  "Baki 0 - Habis": "Balance 0 - Sold Out",
  "Baki 0": "Balance 0",
  "Baki tunai untuk pelanggan": "Cash balance for customers",
  "Bahagi sama - tunai + QR": "Split evenly - cash + QR",
  "Bahan & Packaging": "Materials & Packaging",
  "Kiraan bahan & packaging": "Materials & packaging count",
  "Peralatan kiosk": "Kiosk equipment",
  "Ambil stok": "Collect stock",
  "Baki elaun": "Allowance balance",
  "Dikira dalam elaun 1 jam": "Counted within the 1-hour allowance",
  "Staf masih keluar kiosk": "Staff is still away from kiosk",
  "pertengahan syif": "mid-shift",
  "tutup syif": "close shift",
  "Tutup syif": "Close shift",
  "Hari Ini -": "Today -",
  "Baki stok kiosk dikemas kini setiap muat semula - ditolak automatik selepas jualan":
    "Kiosk stock balance updates on each reload - automatically deducted after sales",
  "Stok rasmi (bag - pcs)": "Official stock (bag - pcs)",
  "Stok diterima": "Stock received",
  "Lupus stok dihantar": "Stock write-off submitted",
  "Pelarasan dihantar": "Adjustment submitted",
  "Pindahan dicipta": "Transfer created",
  "Pindahan dihantar": "Transfer submitted",
  "Pindahan selesai": "Transfer completed",
  "Pindahan HQ dalam perjalanan": "HQ transfer in transit",
  "Lokasi ini belum mempunyai baki stok. Terima stok dari tab Terima.":
    "This location has no stock balance yet. Receive stock from the Receive tab.",
  "ke Terima di Kiosk": "to Receive at Kiosk",
  "Sambut Stok ke": "Receive Stock to",
  "Terima di Kiosk": "Receive at Kiosk",
  "Terima Stok Cawangan": "Receive Branch Stock",
  "Bahan Mentah Kilang": "Factory Raw Materials",
  "Inventori Kiosk": "Kiosk Inventory",
  "Inventori Kawasan": "Area Inventory",
  "Inventori Cawangan": "Branch Inventory",
  "Inventori HQ": "HQ Inventory",
  "Alert Bahan Mentah": "Raw Material Alert",
  "Bahan Aktif": "Active Materials",
  "Baki Semasa": "Current Balance",
  "Stok Roti": "Bread Stock",
  "Stok Jualan": "Sales Stock",
  "Baki stok di HQ sepatutnya sifar selepas cross-dock selesai.":
    "HQ stock should be zero after cross-dock is complete.",
  "Draf jadual disimpan": "Schedule draft saved",
  "Simpan Draf": "Save Draft",
  "Laporan Order dari HQ": "Order Report from HQ",
  Ramalan: "Forecast",
  Muktamad: "Final",
  "Order disahkan": "Order confirmed",
  "Order menunggu": "Pending orders",
  "Jumlah order aktif": "Total active orders",
  "Bahan mentah": "Raw materials",
  "Spring Cleaning Bulanan": "Monthly Spring Cleaning",
  "Hantar Report": "Submit Report",
  "Report Maintenance": "Maintenance Report",
  "Tiket Maintenance": "Maintenance Tickets",
  "Pemandu bertugas": "Assigned driver",
  "Driver Kilang": "Factory Driver",
  "Pembantu Driver": "Assistant Driver",
  "Laluan driver": "Driver route",
  Dispatched: "Dispatched",
  "POD diterima": "POD received",
  "POD penghantaran": "Delivery POD",
  "Laporan driver": "Driver report",
  "staf jualan": "sales staff",
  "kenderaan aktif": "active vehicles",
  "lokasi kiosk": "kiosk location",
  dokumen: "documents",
  laporan: "reports",
  transaksi: "transactions",
  "request barang": "supply requests",
  "kiraan stok": "stock counts",
  "anggaran AI": "AI estimates",
  "area/laluan khusus": "specific area/route",
  order: "orders",
  login: "login",
  "Area belum ditetapkan": "Area not set",
  "Cawangan dipadam": "Branch deleted",
  "Bank:": "Bank:",
  "Nama:": "Name:",
  "Baki -": "Balance -",
  "baki.": "balance.",
  "staff:": "staff:",
  Staff: "Staff",
  "staf tempatan": "local staff",
  "AM kawasan sendiri": "AM own area",
  "AM Scorecard & Kawalan Kawasan": "AM Scorecard & Area Control",
  "AM Scorecard Harian": "Daily AM Scorecard",
  "Admin Audit & Akses": "Admin Audit & Access",
  "Admin boleh bantu operasi, tetapi perubahan akses, delete, gaji dan dokumen mesti ada sebab serta audit yang jelas.":
    "Admin can support operations, but access changes, deletions, payroll and documents must have clear reasons and audit records.",
  "Ada exception yang perlu owner/OM pantau.":
    "There are exceptions the owner/OM needs to monitor.",
  "Ada SOP yang belum selesai, tetapi Pentadbir Utama dibenarkan teruskan testing.":
    "There are unfinished SOP steps, but the Main Administrator is allowed to continue testing.",
  "Ada staf menunggu kelulusan AM/ke atas sebelum rekod POS menjadi rasmi.":
    "Some staff are waiting for AM or higher approval before the POS record becomes official.",
  "AI kawal staf di POS": "AI monitors staff at POS",
  "AI menilai peranan & syarikat (RKJ / RKJ_DIST / RKJ_MFG) untuk tentukan dashboard sesuai. Edit manual sebelum simpan.":
    "AI reviews the role and company (RKJ / RKJ_DIST / RKJ_MFG) to choose the right dashboard. Edit manually before saving.",
  "AI Presence Check disahkan.": "AI Presence Check confirmed.",
  "AI Presence Check hari ini": "Today AI Presence Check",
  "AI rule-based - dikemas kini setiap kali papan pemuka dimuatkan":
    "Rule-based AI - updated each time the dashboard loads",
  "AI sedang mengira cadangan gaji...":
    "AI is calculating payroll recommendations...",
  "AI cadangkan sahkan order paling awal, kemudian semak kapasiti jadual sebelum terima order tambahan.":
    "AI recommends confirming the earliest orders first, then checking schedule capacity before accepting extra orders.",
  "Akaun anda tidak dipautkan sebagai staf cawangan ini. Pentadbir Utama masih boleh urus syif, tetapi rekod staf rasmi mesti dipilih daripada staf cawangan.":
    "Your account is not linked as staff for this branch. The Main Administrator can still manage shifts, but official staff records must be selected from branch staff.",
  "Akaun ini boleh melihat dokumen cawangan. Kemaskini dokumen hanya untuk Pentadbir, OM, AM atau Branch Manager yang diberi skop.":
    "This account can view branch documents. Document updates are only for Admin, OM, AM or Branch Managers with the assigned scope.",
  "Akaun login baharu akan dijana dan dipaparkan selepas berjaya.":
    "A new login account will be generated and shown after success.",
  "Akaun Penerima (RKJ Distributor)": "Recipient Account (RKJ Distributor)",
  Aktifkan: "Activate",
  "Aliran kerja seperti Area Manager": "Workflow like Area Manager",
  "Ambang dikemaskini": "Threshold updated",
  "Ambang Stok": "Stock Threshold",
  Ambil: "Pick up",
  "Ambil (Pickup)": "Pick up",
  "Ambil bukti penghantaran/POD: penerima, nota isu, masa dan lokasi jika diperlukan.":
    "Capture delivery/POD proof: recipient, issue notes, time and location if needed.",
  "Analisis automatik jualan, stok, syif & kehadiran staf - tindakan disyorkan ikut keutamaan.":
    "Automatic analysis of sales, stock, shifts and staff attendance - actions are recommended by priority.",
  "Analisis kawasan": "Area Analysis",
  "Anda boleh hantar order per cawangan di tab Order Kilang.":
    "You can submit orders by branch in the Factory Order tab.",
  "Anggaran mingguan:": "Weekly estimate:",
  "Arahan Driver Hari Ini": "Today Driver Instructions",
  "Arahan Penghantaran Saya": "My Delivery Instructions",
  "Audit gudang dihantar": "Warehouse audit submitted",
  "audit log, reason perubahan akses, rekod dokumen lama/baharu dan siapa meluluskan.":
    "audit log, access-change reasons, old/new document records and approver.",
  "Audit ringkas untuk keselamatan, akses, backup, mobile app, payment dan operasi harian. Nilai rahsia tidak dipaparkan.":
    "Quick audit for security, access, backups, mobile app, payments and daily operations. Secret values are not displayed.",
  "Audit syarikat untuk ejen baharu, kemas kini, delete/archive dan tugasan Ejen Khas.":
    "Company audit for new agents, updates, delete/archive actions and Special Agent assignments.",
  "bahan mentah": "raw materials",
  "Baki & batch roti di": "Bread balance & batch at",
  "Baki & pergerakan stok": "Stock balances & movements",
  "Baki stok di HQ sepatutnya sifar (cross-dock). Jika ada baki, semak penghantaran yang belum disahkan driver.":
    "HQ stock should be zero after cross-dock. If there is a balance, check deliveries not yet confirmed by drivers.",
  "Baki:": "Balance:",
  "Bandingkan jualan hari ini dengan trend mingguan selepas stok dipulihkan.":
    "Compare today sales with the weekly trend after stock is restored.",
  "Bank-grade Control": "Bank-grade Control",
  "Bank-in tunai direkod": "Cash bank-in recorded",
  "Bank, Kecemasan & SOP Kerja": "Bank, Emergency & Work SOP",
  "Bantuan AI Pengurus Kawasan": "Area Manager AI Assistance",
  "Barang kebersihan dan keselamatan operasi kiosk.":
    "Cleaning and safety items for kiosk operations.",
  "Batch item ini disimpan ikut production date untuk semakan stok.":
    "This item batch is stored by production date for stock review.",
  Bayar: "Pay",
  "Bayar Balik": "Refund",
  "Bayar Balik Jualan": "Sales Refund",
  "Bayar Sekarang": "Pay Now",
  "Bayar semula untuk terus guna bulan seterusnya.":
    "Pay again to continue using next month.",
  "Bayaran berjaya - order dihantar ke kilang":
    "Payment successful - order sent to factory",
  "Bayaran berjaya - stok ditolak": "Payment successful - stock deducted",
  "Bayaran dihantar ke": "Payment sent to",
  "Bayaran kepada": "Payment to",
  "Bayaran mencukupi - sedia sahkan": "Payment sufficient - ready to confirm",
  "Bayaran Order": "Order Payment",
  "Belum ada anggaran AI daripada tutup syif terakhir. Buat kiraan fizikal dahulu.":
    "No AI estimate from the last closed shift yet. Do the physical count first.",
  "Belum ada rekod tutup syif untuk dijadikan anggaran. Staf perlu kira stok manual dahulu.":
    "No closed-shift record is available for an estimate. Staff must count stock manually first.",
  "Belum didaftarkan": "Not registered",
  "Belum padan dengan kod cawangan": "Not matched to branch code",
  "Belum rasmi": "Not official",
  "Belum Tetap": "Not fixed",
  "Belum tutup syif": "Shift not closed yet",
  "Belum wajib": "Not required yet",
  "Berdasarkan stok semasa sistem POS": "Based on current POS system stock",
  "Beza stok - tunggu AM/OM": "Stock difference - waiting for AM/OM",
  "Beza stok dihantar untuk kelulusan AM/OM":
    "Stock difference sent for AM/OM approval",
  "Bila berlaku konflik stok atau route, pecahkan ikut impak cawangan.":
    "When stock or route conflicts happen, break them down by branch impact.",
  "Buang item kiraan": "Remove count item",
  "Bukan gagal, tetapi perlu tindakan owner/admin":
    "Not failed, but owner/admin action is needed",
  "Bukti ditolak - perlu pembetulan atau bank-in semula":
    "Proof rejected - correction or new bank-in required",
  "Bukti Penghantaran (POD)": "Proof of Delivery (POD)",
  "Bukti penghantaran dihantar": "Delivery proof submitted",
  "Bukti wajib:": "Required proof:",
  "Bulanan:": "Monthly:",
  "Cadangan Bulanan (Tempatan)": "Monthly Proposal (Local)",
  "Cadangan Mingguan (Asing)": "Weekly Proposal (Foreign)",
  "Cash Belum Selesai": "Unresolved Cash",
  ": masuk": ": in",
  "cawangan -": "branches -",
  "- baki": "- balance",
  "- Tanpa bayaran": "- Without payment",
  "- tanpa bayaran": "- without payment",
  "| Pickup/Cawangan:": "| Pickup/Branch:",
  "- belum ditetapkan -": "- not set -",
  "- driver hantar ikut keperluan masing-masing kiosk. Bila kilang sahkan, stok auto dihantar terus ke kiosk. Susun laluan driver sebelum muktamad.":
    "- drivers deliver according to each kiosk requirement. Once the factory confirms, stock is automatically sent directly to kiosks. Arrange driver routes before final confirmation.",
  "- driver hantar ikut keperluan masing-masing kiosk. Klik":
    "- drivers deliver according to each kiosk requirement. Click",
  "- gaji dikira mengikut kadar shift mingguan.":
    "- payroll is calculated using weekly shift rates.",
  "- gaji mingguan ikut kadar shift. Sistem auto-cipta":
    "- weekly payroll follows shift rates. The system auto-creates",
  "- ikut jadual kilang (tab Jadual Kilang). Expiry = production +":
    "- follows the factory schedule (Factory Schedule tab). Expiry = production +",
  "- perlu disahkan sebelum masuk rekod POS rasmi":
    "- requires approval before entering official POS records",
  "- POS aktif": "- POS active",
  "- tutup": "- closed",
  ". Ia tidak guna formula kiosk Roti Kaya Junus.":
    ". It does not use the Roti Kaya Junus kiosk formula.",
  ". Jualan boleh diteruskan, tetapi staf perlu lengkapkan bila customer reda.":
    ". Sales may continue, but staff must complete it when customer traffic calms down.",
  ". Klik Muat Semula.": ". Click Refresh.",
  ". Resit rasmi akan dikeluarkan selepas bayaran disahkan.":
    ". The official receipt will be issued after payment is confirmed.",
  ". Selepas voucher ini, baki perlu bank-in akan ditolak automatik jika belum ditolak.":
    ". After this voucher, the balance to bank in will be deducted automatically if it has not been deducted.",
  ". Staf boleh ubah ikut kiraan sebenar di kiosk.":
    ". Staff can change it according to the actual kiosk count.",
  "(gaji bulanan rekod syarikat)": "(monthly payroll in company records)",
  "(peraturan jualan + komisen)": "(sales rules + commission)",
  "(pilihan)": "(optional)",
  "(stok sedia ada ke logistik)": "(existing stock to logistics)",
  "(tutup)": "(closed)",
  "(via Kilang & HQ)": "(via Factory & HQ)",
  ") - kongsi kredensial ini kepada staf. Mesti tukar kata laluan pada log masuk pertama.":
    ") - share these credentials with the staff member. Password must be changed on first login.",
  "). AI susun laluan: kritikal didahulukan ke arah jalan Utara/Barat/Selatan. Hub (D001) sambut stok relay dahulu.":
    "). AI arranges routes: critical stops are prioritized by North/West/South road direction. Hub (D001) receives relay stock first.",
  "). Hubungi pentadbir jika perlu pengecualian.":
    "). Contact the administrator if an exception is required.",
  "/cawangan/bulan.": "/branch/month.",
  "& kiosk telah disediakan.": "& kiosks have been prepared.",
  "+ Tambah Baris": "+ Add Row",
  "= perancangan awal HQ (boleh berubah).": "= early HQ planning (may change).",
  "0 = cukup untuk hari terima sahaja - 1 = default (1 hari selepas production) - tingkatkan sebelum cuti panjang.":
    "0 = enough for receiving day only - 1 = default (1 day after production) - increase before long holidays.",
  "1 Tarikh production kilang *": "1 Factory production date *",
  "1. Akaun & Syarikat": "1. Account & Company",
  "1. Asal stok": "1. Stock origin",
  "1. Rekod / Assign Kutipan": "1. Record / Assign Collection",
  "2. Logistik & Pickup": "2. Logistics & Pickup",
  "2. Voucher Guna Cash": "2. Cash Usage Voucher",
  "3. Arahan penghantaran (": "3. Delivery instructions (",
  "3. Bank-in Baki Bersih": "3. Bank in Net Balance",
  "4. Tarikh penghantaran": "4. Delivery date",
  "9 jenis - 21 varian - stok roti ditolak automatik ikut kandungan set":
    "9 types - 21 variants - bread stock is automatically deducted by set content",
  "akan direkod sebagai staf syarikat/HQ. Tiada maklumat cawangan diperlukan.":
    "will be recorded as company/HQ staff. No branch information is required.",
  "ambil -": "pickup -",
  "ambil (pickup)": "pickup",
  "arahan (hentian cawangan) sekali gus dalam satu pesanan - pilih berbilang baris untuk padam pukal.":
    "instructions (branch stops) at once in one order - select multiple rows for bulk delete.",
  "atau guna butang di atas.": "or use the button above.",
  "bank-in =": "bank-in =",
  "Bank-in failed": "Bank-in failed",
  "Bank-in recorded": "Bank-in recorded",
  "Banked:": "Banked:",
  "baris stok -": "stock rows -",
  "baris stok (roti + bahan + packaging)":
    "stock rows (bread + materials + packaging)",
  "baris telah disemak manual - jumlah dikemas kini automatik.":
    "rows manually reviewed - total updated automatically.",
  "batch tarikh production": "production date batch",
  Catatan: "Notes",
  "Catatan ringkas": "Short notes",
  "Catatan sebab bayaran QR tidak diterima / dibatalkan":
    "Notes on why QR payment was not received / was cancelled",
  "cawangan (ambil + hantar).": "branches (pickup + send).",
  "Cawangan (pilihan)": "Branch (optional)",
  "cawangan (roti + bahan + packaging)":
    "branches (bread + materials + packaging)",
  "Cawangan / POS": "Branch / POS",
  "Cawangan aktif": "Active branches",
  "Cawangan aktif POS": "Active POS branches",
  "Cawangan capai minimum": "Branches reaching minimum",
  "Cawangan capai terbaik": "Branches reaching best target",
  "cawangan dalam skop": "branches in scope",
  "Cawangan didaftarkan - langgan POS RM200/bulan":
    "Branch registered - POS subscription RM200/month",
  "cawangan dipantau dalam satu dashboard":
    "branches monitored in one dashboard",
  "cawangan kawasan.": "area branches.",
  "Cawangan Kiosk": "Kiosk Branch",
  "cawangan melalui": "branches through",
  "Cawangan Roti Kaya Junus": "Roti Kaya Junus Branches",
  "cawangan)": "branches)",
  "cawangan/hari - susunan laluan dioptimumkan AI (kritikal didahulukan, ikut arah jalan).":
    "branches/day - routes optimized by AI (critical stops first, by road direction).",
  "Checkout gagal": "Checkout failed",
  "Cipta Akaun Login": "Create Login Account",
  "Cipta akaun login baharu, tetapkan group rate dan caj biasa.":
    "Create a new login account, set group rate and normal charges.",
  "Clock-in hari ini": "Today clock-in",
  "Clock-in staf": "Staff clock-in",
  "Contact belum diisi": "Contact not filled",
  "cross-dock stok": "stock cross-dock",
  "cth. Minggu 1-7 Jun 2025": "e.g. Week 1-7 Jun 2025",
  "Cuba Semula": "Try Again",
  "Cuti / tiada syif hari ini": "Off day / no shift today",
  "Cuti Malaysia (90 hari akan datang)": "Malaysia holidays (next 90 days)",
  "Daftar & Mula": "Register & Start",
  "Daftar Staf": "Register Staff",
  "Dalam kawasan": "Within area",
  "dalam kawasan anda sahaja.": "within your area only.",
  "dalam tempoh ini.": "within this period.",
  "Dalam Tindakan": "In Progress",
  "dan tidak menggunakan kadar kiosk RKJ.": "and does not use RKJ kiosk rates.",
  "Dari Kilang (production baharu ke HQ ke logistik)":
    "From Factory (new production to HQ to logistics)",
  "dari stok semasa sistem": "from current system stock",
  "hari.": "days.",
  "pindahan HQ dalam perjalanan - pergi tab":
    "HQ transfer in transit - go to tab",
  "Bayaran disahkan dalam sistem untuk ujian. Selepas credential merchant payment gateway diset di Vercel, FPX/kad akan dihantar ke Maybank RKJ Distributor dengan pengesahan bank sebenar.":
    "Payment confirmed in the system for testing. After merchant gateway credentials are set in Vercel, FPX/card payments will go to RKJ Distributor Maybank with real bank confirmation.",
  "Bila kilang sahkan order muktamad, stok diterima automatik dan dihantar terus ke cawangan mengikut laluan driver. Tiada simpanan stok di HQ - driver sahkan penghantaran di tab":
    "When the factory confirms the final order, stock is automatically received and sent directly to branches by driver route. No stock is stored at HQ - drivers confirm delivery in the tab",
  "boleh melihat stok tetapi tidak boleh membuat pelarasan dari dashboard ini.":
    "can view stock but cannot make adjustments from this dashboard.",
  "Dashboard (AI)": "Dashboard (AI)",
  "Dashboard & SOP mengikut akses": "Dashboard & SOP by access",
  "Dashboard AI": "AI Dashboard",
  "Data bahan mentah belum tersedia.":
    "Raw material data is not available yet.",
  "Data belum dapat dimuatkan.": "Data could not be loaded yet.",
  "Data Rasmi": "Official Data",
  "Data tidak sah": "Invalid data",
  Dibayar: "Paid",
  "Dibayar Balik": "Refunded",
  Digunakan: "Used",
  "Dihantar HR": "Sent by HR",
  "Dihantar Kilang": "Sent to Factory",
  "Dikira dalam 1 jam harian.": "Counted within the daily 1-hour allowance.",
  "Disahkan Bank": "Bank Confirmed",
  "Disahkan di POS": "Confirmed in POS",
  "Disahkan manual oleh kewangan": "Manually confirmed by finance",
  "Disahkan melalui panel Staf Dalam Syif POS.":
    "Confirmed through the POS Shift Staff panel.",
  "disemak manual": "manually reviewed",
  "Disemak oleh": "Reviewed by",
  "Diset oleh pentadbir": "Set by administrator",
  "Disimpan luar talian - akan disegerak bila online":
    "Saved offline - will sync when online",
  "Ditolak melalui panel Staf Dalam Syif POS.":
    "Rejected through the POS Shift Staff panel.",
  Ditugaskan: "Assigned",
  "Ditugaskan oleh Pentadbir Utama melalui Portal Ejen":
    "Assigned by the Main Administrator through the Agent Portal",
  "Document Control Syarikat": "Company Document Control",
  "Dokumen boleh ditambah, dikemaskini, dipadankan dengan cawangan dan dimuat turun bila diperlukan.":
    "Documents can be added, updated, matched to branches and downloaded when needed.",
  "Dokumen diarkibkan": "Document archived",
  "Dokumen ini akan dipautkan terus kepada":
    "This document will be linked directly to",
  "Driver ditanda inactive dan dikeluarkan daripada laluan aktif":
    "Driver marked inactive and removed from active routes",
  "Driver update": "Driver update",
  "Driver, route & POD": "Driver, Route & POD",
  "ejen aktif": "active agents",
  "Ejen Biasa -": "Normal Agent -",
  "Ejen dikeluarkan dari dashboard aktif dan disimpan dalam laporan":
    "Agent removed from the active dashboard and saved in reports",
  "Ejen Jualan": "Sales Agent",
  "Ejen Khas akan dipautkan terus kepada staf yang dipilih.":
    "The Special Agent will be linked directly to the selected staff member.",
  "Ejen Khas berjaya dipautkan kepada staf":
    "Special Agent successfully linked to staff",
  "Ejen, order & POS": "Agents, Orders & POS",
  "Email portal belum ada": "Portal email not available yet",
  "Entiti legal aktif": "Active legal entities",
  "Fail dokumen PDF/Excel": "PDF/Excel document file",
  "Float permulaan": "Opening float",
  "Float Tunai Permulaan (RM)": "Opening Cash Float (RM)",
  "Fokus bahan yang perlu dibeli atau disemak sebelum production.":
    "Focus on materials that must be purchased or checked before production.",
  "Fokus harian: buka POS, pantau stok kiosk, semak staf hadir dan selesaikan maintenance sebelum operasi cawangan terganggu.":
    "Daily focus: open POS, monitor kiosk stock, check staff attendance and resolve maintenance before branch operations are disrupted.",
  "Fokus utama: pastikan staf hanya nampak modul mereka, backup wujud, mobile readiness lulus, dan payment gateway kekal manual sehingga merchant benar-benar approved.":
    "Main focus: ensure staff only see their modules, backups exist, mobile readiness passes, and payment gateway remains manual until merchant approval is real.",
  "Formula:": "Formula:",
  Gagal: "Failed",
  "Gaji & Komisyen": "Payroll & Commission",
  "Gaji Bersih": "Net Salary",
  "Gaji Bulanan": "Monthly Payroll",
  "Gaji bulanan - kadar sendiri": "Monthly payroll - custom rate",
  "Gaji bulanan + elaun": "Monthly salary + allowance",
  "Gaji bulanan + komisyen + EPF/SOCSO/EIS":
    "Monthly salary + commission + EPF/SOCSO/EIS",
  "Gaji bulanan:": "Monthly salary:",
  "gaji mengikut syarikat": "payroll by company",
  "Gaji Mingguan": "Weekly Payroll",
  "Gaji mingguan - bayaran shift + OT": "Weekly payroll - shift pay + OT",
  "Gaji mingguan - ikut shift": "Weekly payroll - by shift",
  "Gaji mingguan - kadar sendiri": "Weekly payroll - custom rate",
  "Gaji mingguan syarikat": "Company weekly payroll",
  "Gaji mingguan:": "Weekly salary:",
  "Gerbang bayaran tidak tersedia - hubungi HQ.":
    "Payment gateway is unavailable - contact HQ.",
  "Contoh: batch pagi, rekod oleh staf kilang, penggunaan untuk order HQ/ejen":
    "Example: morning batch, recorded by factory staff, usage for HQ/agent orders",
  "Contoh: bersih freezer, rak display, kaunter POS, semak peralatan kiosk.":
    "Example: clean freezer, display rack, POS counter, check kiosk equipment.",
  "Contoh: buka POS, rekod jualan harian, semak stok, lapor isu kepada Muhammad.":
    "Example: open POS, record daily sales, check stock, report issues to Muhammad.",
  "Contoh: driver hantar 10 bag, staf kira 9 bag sebab 1 bag rosak / tiada.":
    "Example: driver delivered 10 bags, staff counted 9 because 1 bag was damaged / missing.",
  "Contoh: Driver laluan Utara, cover BR001-BR012 dan pickup agent berdekatan.":
    "Example: North route driver, covers BR001-BR012 and nearby agent pickups.",
  "Contoh: isu lokasi stok, permit, laluan staf, kebersihan kawasan dan operasi kiosk.":
    "Example: stock location issues, permit, staff route, area cleanliness and kiosk operations.",
  "Contoh: Lampu kiosk rosak": "Example: kiosk light damaged",
  "Contoh: Maybank": "Example: Maybank",
  "Contoh: Pisau Butter rosak, perlu gantian sebelum syif petang.":
    "Example: Butter knife damaged, replacement needed before evening shift.",
  "Contoh: Promo hujung minggu - tambahan Kaya di Utara...":
    "Example: Weekend promo - extra Kaya in the North...",
  "Contoh: solat zohor / ambil stok di HQ":
    "Example: Zohor prayer / collect stock at HQ",
  "Daftar staf baharu mengikut syarikat majikan. Staf cawangan wajib pilih kiosk, manakala staf RKJ Distributor dan Manufacturing boleh didaftarkan sebagai staf syarikat/HQ.":
    "Register new staff by employer company. Branch staff must select a kiosk, while RKJ Distributor and Manufacturing staff can be registered as company/HQ staff.",
  "Daftar syarikat ejen jualan untuk order stok ke kilang (ikut jadual & cutoff) dan langgan POS RM200/cawangan/bulan.":
    "Register sales agent companies to order stock from the factory (by schedule & cutoff) and subscribe to POS at RM200/branch/month.",
  "dari tarikh production. Stok di bawah sudah luput - jangan dijual. Tolak melalui tab":
    "from the production date. The stock below has expired - do not sell it. Reject through the tab",
  "dari tutup syif terakhir": "from the last closed shift",
  "Semak Kelulusan": "Review Approvals",
  "Pemilik kerja": "Work owner",
  "Masuk campur bila": "Intervene when",
  "OM Roti Kaya Junus + Area Manager": "Roti Kaya Junus OM + Area Manager",
  "RKJ Manufacturing Sdn Bhd": "RKJ Manufacturing Sdn Bhd",
  "Terima order HQ, rancang production, rekod penggunaan bahan mentah dan sahkan serahan kepada distributor.":
    "Receive HQ orders, plan production, record raw material usage and confirm handoff to Distributor.",
  "Semak kapasiti, kos bahan, isu production besar dan keputusan supplier strategik.":
    "Review capacity, material costs, major production issues and strategic supplier decisions.",
  "OM Distributor + Driver Lead + Manager Maintenance":
    "Distributor OM + Driver Lead + Maintenance Manager",
  "Urus penerimaan dari kilang, dispatch ke kiosk/ejen, POD driver, group rate ejen dan langganan POS.":
    "Manage receiving from the factory, dispatch to kiosks/agents, driver POD, agent group rates and POS subscriptions.",
  "Route gagal, driver tidak cukup, ejen khas bermasalah, atau group rate memberi kesan margin.":
    "Route failure, insufficient drivers, problematic Special Agent, or group rate affecting margin.",
  "Mengikut majikan legal": "By legal employer",
  "Tambah staf, lengkapkan profil HR, tetapkan role/access, proses payroll dan distribute payslip.":
    "Add staff, complete HR profiles, set role/access, process payroll and distribute payslips.",
  "Staf salah syarikat, akses tidak betul, payroll luar biasa, atau pertukaran role berisiko.":
    "Staff under the wrong company, incorrect access, unusual payroll, or risky role changes.",
  "Semua syarikat berkaitan": "All related companies",
  "Sahkan QR manual, padan bank-in, semak tunai tertunggak dan sediakan laporan kewangan.":
    "Verify manual QR, match bank-ins, review outstanding cash and prepare finance reports.",
  "Semak exception besar, approve polisi bayaran dan pastikan duit masuk akaun syarikat betul.":
    "Review major exceptions, approve payment policies and ensure money goes into the correct company account.",
  "Tunai tertunggak tinggi, mismatch bank-in, bayaran ejen tidak jelas, atau refund luar biasa.":
    "High outstanding cash, bank-in mismatch, unclear agent payment, or unusual refund.",
  "Admin HQ + HR + OM mengikut skop": "HQ Admin + HR + OM by scope",
  "Roti Kaya Junus Group": "Roti Kaya Junus Group",
  "Menjadi pemutus akhir untuk perkara legal, delete/archive sensitif dan perubahan polisi sistem.":
    "Act as final decision-maker for legal matters, sensitive delete/archive actions and system policy changes.",
  "Semua tindakan besar ada audit": "All major actions have audit records",
  "AM ada scorecard, OM ada command center":
    "AM has a scorecard, OM has a command center",
  "Cash collection mesti ada bukti": "Cash collection must have proof",
  "Agent dan harga dikawal distributor":
    "Agents and pricing are controlled by Distributor",
  "Kawalan Pengurusan Owner": "Owner Management Control",
  "Owner hanya perlu nampak exception besar, skor AM/OM/Admin dan bukti kerja. Kerja harian diselesaikan oleh role yang betul.":
    "The owner only needs to see major exceptions, AM/OM/Admin scores and work evidence. Daily work is handled by the correct role.",
  "OM bukan sekadar lihat laporan; OM perlu memantau AM, sahkan exception, dan pastikan isu tidak sampai kepada owner tanpa tindakan awal.":
    "OM is not just reading reports; OM must monitor AMs, approve exceptions and ensure issues do not reach the owner without early action.",
  "Semak Laporan": "Review Reports",
  "Skor Kawalan": "Control Score",
  "Operasi terkawal. Teruskan review harian.":
    "Operations are under control. Continue the daily review.",
  "Semak status syif terbuka.": "Check open shift status.",
  "Liputan syif": "Shift coverage",
  "Stok Risiko": "Stock Risk",
  "stok rendah": "low stock",
  "AM perlu selesaikan sebelum jualan terganggu.":
    "AM must resolve it before sales are disrupted.",
  menunggu: "waiting",
  "dalam perjalanan": "in transit",
  "OM Command Center": "OM Command Center",
  "Semak semua AM, kejar cawangan merah, sahkan exception stok/cash/staf, dan pastikan isu selesai sebelum owner perlu campur tangan.":
    "Review all AMs, chase red branches, approve stock/cash/staff exceptions, and ensure issues are resolved before the owner needs to intervene.",
  "senarai tindakan harian, approval/reject, catatan follow-up dan status selesai.":
    "daily action list, approvals/rejections, follow-up notes and completed status.",
  "Urus user, dokumen, role dan tetapan tetapi setiap perubahan sensitif perlu ada sebab dan rekod audit.":
    "Manage users, documents, roles and settings, but every sensitive change needs a reason and audit record.",
  "Cash Collection & Voucher Proof": "Cash Collection & Voucher Proof",
  "Selasa/Khamis: AM lengkapkan kutipan cash, voucher penggunaan cash dan bank-in baki; Finance semak bukti.":
    "Tuesday/Thursday: AM completes cash collection, cash-use vouchers and balance bank-in; Finance checks the proof.",
  "Naik kepada AM": "Escalate to AM",
  "Naik kepada OM": "Escalate to OM",
  "Naik kepada Admin": "Escalate to Admin",
  "Stok rendah, staf tidak hadir, POS belum buka, delivery lewat bawah 1 hari.":
    "Low stock, staff absent, POS not opened, or delivery delayed under 1 day.",
  "Stok kritikal berulang, mismatch stok/cash, cawangan tutup, AM tidak bertindak.":
    "Repeated critical stock, stock/cash mismatch, closed branch, or AM not acting.",
  "Role/access salah, delete/update sensitif, dokumen tidak boleh dibuka atau data bercampur syarikat.":
    "Wrong role/access, sensitive delete/update, documents cannot be opened or company data is mixed.",
  "AI Operating Map RKJ One": "RKJ One AI Operating Map",
  "Pengguna Fokus": "Focus Users",
  "Sediakan produk, kawal bahan mentah, rekod stock card dan sahkan output production.":
    "Prepare products, control raw materials, record stock cards and confirm production output.",
  "Urus HQ Distributor, logistik, driver, agent, group rate dan aliran stok ke cawangan.":
    "Manage Distributor HQ, logistics, drivers, agents, group rates and stock flow to branches.",
  "Setiap cawangan ada profile sendiri; BM dan OM hanya update data bawah cawangan yang diberi.":
    "Each branch has its own profile; BM and OM only update data for assigned branches.",
  "Handoff Operasi": "Operations Handoff",
  "Setiap pindahan mesti ada bukti dan owner tindakan.":
    "Every handoff must have proof and an action owner.",
  Bukti: "Proof",
  "Production siap ke HQ Distributor": "Production ready for HQ Distributor",
  "Stok bergerak ke cawangan": "Stock moves to branches",
  "Control Guardrail": "Control Guardrail",
  "Rule owner supaya sistem kekal kemas dan boleh audit.":
    "Owner rules so the system stays tidy and auditable.",
  "Setiap pengguna hanya nampak syarikat legal yang berkaitan dengan profile mereka.":
    "Each user only sees legal companies related to their profile.",
  "Roti Kaya Junus perlu ada profile cawangan; dokumen cawangan duduk bawah profile cawangan.":
    "Roti Kaya Junus needs branch profiles; branch documents sit under each branch profile.",
  "Terima Stok": "Receive Stock",
  "Kiraan Stok": "Stock Count",
  "Jualan POS": "POS Sales",
  "Di Cawangan": "At Branch",
  "Pelarasan Stok": "Stock Adjustment",
  "Lupus Stok": "Stock Write-Off",
  "Pindah Stok": "Stock Transfer",
  "Batal Jualan": "Void Sale",
  "Bayaran Balik": "Refund",
  Bag: "Bag",
  Pcs: "Pcs",
  Tong: "Tub",
  Kg: "Kg",
};

const patterns: Array<[RegExp, (...matches: string[]) => string]> = [
  [/^(\d+) transaksi hari ini$/i, (count) => `${count} transactions today`],
  [
    /^(\d+) transaksi direkod hari ini\.$/i,
    (count) => `${count} transactions recorded today.`,
  ],
  [
    /^(\d+) menunggu - (\d+) dalam perjalanan$/i,
    (pending, transit) => `${pending} waiting - ${transit} in transit`,
  ],
  [
    /^(\d+) menunggu, (\d+) dalam perjalanan\.$/i,
    (pending, transit) => `${pending} waiting, ${transit} in transit.`,
  ],
  [/^(\d+) pengurusan$/i, (count) => `${count} management`],
  [/^(\d+) jumlah rekod HR$/i, (count) => `${count} total HR records`],
  [/^(\d+) syarikat$/i, (count) => `${count} companies`],
  [/^(\d+) cawangan$/i, (count) => `${count} branches`],
  [/^(\d+) kiosk$/i, (count) => `${count} kiosks`],
  [/^(\d+) staf$/i, (count) => `${count} staff`],
  [/^(\d+) driver$/i, (count) => `${count} drivers`],
  [/^(\d+) pemandu$/i, (count) => `${count} drivers`],
  [/^(\d+) dokumen$/i, (count) => `${count} documents`],
  [/^(\d+) aktif$/i, (count) => `${count} active`],
  [
    /^(\d+) (.+)$/i,
    (count, label) => `${count} ${translateLegacyUiText(label, "en")}`,
  ],
  [/^(\d+) menunggu$/i, (count) => `${count} waiting`],
  [/^(\d+) dalam perjalanan$/i, (count) => `${count} in transit`],
  [/^(.+) transaksi hari ini$/i, (count) => `${count} transactions today`],
  [/^Jualan hari ini: (.+)$/i, (value) => `Today sales: ${value}`],
  [/^Syif: (.+)$/i, (value) => `Shift: ${value}`],
  [/^Minggu (.+)$/i, (value) => `Week ${value}`],
  [/^(.+) - (\d+) cawangan$/i, (area, count) => `${area} - ${count} branches`],
  [/^(.+) - (\d+) kiosk$/i, (area, count) => `${area} - ${count} kiosks`],
  [
    /^AI cadang (.+) dari tutup syif terakhir\. Ubah ikut kiraan sebenar di kiosk\.$/i,
    (value) =>
      `AI suggests ${value} from the last closed shift. Adjust according to the actual kiosk count.`,
  ],
  [
    /^AI cadang mulakan dengan "(.+)" dan ikut urutan SOP hingga selesai\.$/i,
    (step) =>
      `AI recommends starting with "${translateLegacyUiText(step, "en")}" and following the SOP sequence until complete.`,
  ],
  [
    /^Production date baris ini akan disimpan dalam nota kiraan supaya batch (.+) boleh dirujuk semula\.$/i,
    (item) =>
      `This row's production date will be saved in the count notes so the ${item} batch can be referenced later.`,
  ],
  [
    /^Berdasarkan tutup syif terakhir (.+), production (.+) oleh (.+)\.$/i,
    (countId, productionDate, staff) =>
      `Based on the last closed shift ${countId}, production ${productionDate} by ${staff}.`,
  ],
  [
    /^(.+) mesti bermula Isnin \(week_start=(.+)\)$/i,
    (message, date) => `${message} must start on Monday (week_start=${date})`,
  ],
  [
    /^Minggu mesti bermula Isnin \(week_start=(.+)\)$/i,
    (date) => `Week must start on Monday (week_start=${date})`,
  ],
  [
    /^Stok: (.+) - cadangan (.+)$/i,
    (stock, suggestion) => `Stock: ${stock} - suggestion ${suggestion}`,
  ],
  [
    /^Ramalan AI - jualan (.+) - (.+)$/i,
    (sales, note) => `AI forecast - sales ${sales} - ${note}`,
  ],
  [
    /^(.+) oleh Mat Isa Bin Mohd Junus\.$/i,
    (message) =>
      `${translateLegacyUiText(message, "en")} by Mat Isa Bin Mohd Junus.`,
  ],
  [/^(\d+) staf aktif$/i, (count) => `${count} active staff`],
  [
    /^(\d+) item rasmi - (.+)$/i,
    (count, note) =>
      `${count} official items - ${translateLegacyUiText(note, "en")}`,
  ],
  [
    /^Belum ada (.+)$/i,
    (thing) => `No ${translateLegacyUiText(thing, "en").toLowerCase()} yet`,
  ],
  [
    /^Belum (.+)$/i,
    (thing) => `Not ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Gagal (.+)$/i,
    (action) =>
      `Failed to ${translateLegacyUiText(action, "en").toLowerCase()}`,
  ],
  [
    /^Cari (.+)$/i,
    (thing) => `Search ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Tambah (.+)$/i,
    (thing) => `Add ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Simpan (.+)$/i,
    (thing) => `Save ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Semak (.+)$/i,
    (thing) => `Review ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Sahkan (.+)$/i,
    (thing) => `Confirm ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Hantar (.+)$/i,
    (thing) => `Submit ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Urus (.+)$/i,
    (thing) => `Manage ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Edit (.+)$/i,
    (thing) => `Edit ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Aktifkan (.+)$/i,
    (thing) => `Activate ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Bayar (.+)$/i,
    (thing) => `Pay ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Rekod (.+)$/i,
    (thing) => `Record ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Pindah (.+)$/i,
    (thing) => `Transfer ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Lupus (.+)$/i,
    (thing) => `Write off ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Terima (.+)$/i,
    (thing) => `Receive ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^(.+) dipadam$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} deleted`,
  ],
  [
    /^(.+) ditambah$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} added`,
  ],
  [
    /^(.+) dikemaskini$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} updated`,
  ],
  [
    /^(.+) direkod$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} recorded`,
  ],
  [
    /^(.+) dihantar$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} submitted`,
  ],
  [
    /^(.+) disahkan$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} confirmed`,
  ],
  [
    /^(.+) ditolak$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} rejected`,
  ],
  [
    /^(.+) diterima$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} received`,
  ],
  [
    /^(.+) menunggu kelulusan$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} pending approval`,
  ],
  [
    /^(.+) belum ditetapkan$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} not set`,
  ],
  [
    /^(.+) tidak dijumpai$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} not found`,
  ],
  [
    /^(.+) tidak dibenarkan$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} not allowed`,
  ],
  [
    /^(.+) tidak boleh dipaparkan$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} cannot be displayed`,
  ],
  [
    /^(.+) tidak sah untuk (.+)$/i,
    (thing, target) =>
      `${translateLegacyUiText(thing, "en")} is not valid for ${translateLegacyUiText(target, "en")}`,
  ],
  [
    /^(.+) diperlukan$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} is required`,
  ],
  [
    /^(.+) wajib$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} is required`,
  ],
  [
    /^(.+) belum tersedia$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} is not available yet`,
  ],
  [
    /^(.+) belum tersedia - (.+)$/i,
    (thing, note) =>
      `${translateLegacyUiText(thing, "en")} is not available yet - ${translateLegacyUiText(note, "en")}`,
  ],
  [/^Hanya (.+)$/i, (thing) => `${translateLegacyUiText(thing, "en")} only`],
  [
    /^(.+) dalam skop (.+)$/i,
    (thing, scope) =>
      `${translateLegacyUiText(thing, "en")} within ${translateLegacyUiText(scope, "en")}`,
  ],
  [
    /^(.+) boleh lihat$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} can view`,
  ],
  [
    /^(.+) boleh daftar (.+)$/i,
    (actor, thing) =>
      `${translateLegacyUiText(actor, "en")} can register ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^\? Belum (.+)$/i,
    (thing) => `? Not ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^(.+) - Tanpa bayaran$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} - Without payment`,
  ],
  [
    /^(.+) - tanpa bayaran$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} - without payment`,
  ],
  [
    /^(.+) - POS aktif$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} - POS active`,
  ],
  [
    /^Baki:? (.+)$/i,
    (value) => `Balance: ${translateLegacyUiText(value, "en")}`,
  ],
  [
    /^(.+) - baki$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} - balance`,
  ],
  [
    /^(.+) cawangan -$/i,
    (thing) => `${translateLegacyUiText(thing, "en")} branches -`,
  ],
  [/^(.+) hari\.$/i, (thing) => `${translateLegacyUiText(thing, "en")} days.`],
  [/^(.+) \/cawangan\/bulan\.$/i, (value) => `${value} /branch/month.`],
  [
    /^(.+) - perlu disahkan sebelum masuk rekod POS rasmi$/i,
    (thing) =>
      `${translateLegacyUiText(thing, "en")} - requires approval before becoming an official POS record`,
  ],
  [
    /^Buka (.+)$/i,
    (moduleName) => `Open ${translateLegacyUiText(moduleName, "en")}`,
  ],
  [
    /^Pilih (.+)$/i,
    (thing) => `Select ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
  [
    /^Tiada (.+)$/i,
    (thing) => `No ${translateLegacyUiText(thing, "en").toLowerCase()}`,
  ],
];

export function translateLegacyUiText(text: string, locale: Locale) {
  if (locale !== "en") return text;

  const prefix = text.match(/^\s*/)?.[0] ?? "";
  const suffix = text.match(/\s*$/)?.[0] ?? "";
  const body = text.slice(prefix.length, text.length - suffix.length);
  const normalized = body.replace(/\s+/g, " ").trim();
  if (!normalized) return text;

  const exact = enText[normalized];
  if (exact) return `${prefix}${exact}${suffix}`;

  for (const [pattern, translate] of patterns) {
    const patternMatch = normalized.match(pattern);
    if (patternMatch) {
      return `${prefix}${translate(...patternMatch.slice(1))}${suffix}`;
    }
  }

  return text;
}

export function hasLegacyTranslation(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return (
    Boolean(enText[normalized]) ||
    patterns.some(([pattern]) => pattern.test(normalized))
  );
}
