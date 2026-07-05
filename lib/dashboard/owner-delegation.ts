import {
 Banknote,
 Building2,
 CheckSquare,
 Factory,
 FileText,
 ShieldCheck,
 Store,
 Truck,
 Users,
 Wrench,
 type LucideIcon,
} from 'lucide-react';

export type OwnerDelegationLane = {
 id: string;
 area: string;
 delegatedTo: string;
 company: string;
 dailyFocus: string;
 ownerRole: string;
 escalation: string;
 href: string;
 icon: LucideIcon;
 tone: 'amber' | 'emerald' | 'sky' | 'violet' | 'rose' | 'slate';
};

export type OwnerGovernanceRule = {
 title: string;
 description: string;
 href: string;
 icon: LucideIcon;
};

export const OWNER_DELEGATION_LANES: OwnerDelegationLane[] = [
 {
 id: 'retail-operations',
 area: 'Operasi cawangan, POS dan jualan',
 delegatedTo: 'OM Roti Kaya Junus + Area Manager',
 company: 'Roti Kaya Junus',
 dailyFocus:
 'Pastikan kiosk buka, staf cukup, stok POS sah, jualan berjalan dan isu cawangan diambil tindakan.',
 ownerRole:
 'Pantau prestasi, semak cawangan merah dan campur tangan hanya jika AM/OM gagal selesaikan.',
 escalation:
 'Jualan jatuh mendadak, POS tidak buka, stok kritikal berulang, atau cawangan tidak beroperasi.',
 href: '/branches',
 icon: Building2,
 tone: 'amber',
 },
 {
 id: 'manufacturing',
 area: 'Production, bahan mentah dan stok kilang',
 delegatedTo: 'CEO Kilang + Pengurus Operasi Kilang',
 company: 'RKJ Manufacturing Sdn Bhd',
 dailyFocus:
 'Terima order HQ, rancang production, rekod penggunaan bahan mentah dan sahkan serahan kepada distributor.',
 ownerRole:
 'Semak kapasiti, kos bahan, isu production besar dan keputusan supplier strategik.',
 escalation:
 'Production lewat, bahan mentah kritikal, batch reject tinggi, atau order HQ tidak boleh dipenuhi.',
 href: '/factory',
 icon: Factory,
 tone: 'sky',
 },
 {
 id: 'distributor',
 area: 'HQ Distributor, driver, ejen dan route',
 delegatedTo: 'OM Distributor + Driver Lead + Manager Maintenance',
 company: 'RKJ Distributor Sdn Bhd',
 dailyFocus:
 'Urus penerimaan dari kilang, dispatch ke kiosk/ejen, POD driver, group rate ejen dan langganan POS.',
 ownerRole:
 'Pantau route besar, margin ejen, isu driver berulang dan polisi harga distributor.',
 escalation:
 'Route gagal, driver tidak cukup, ejen khas bermasalah, atau group rate memberi kesan margin.',
 href: '/fleet',
 icon: Truck,
 tone: 'emerald',
 },
 {
 id: 'hr-payroll',
 area: 'HR, akses staf dan gaji',
 delegatedTo: 'HR Syarikat + Finance',
 company: 'Mengikut majikan legal',
 dailyFocus:
 'Tambah staf, lengkapkan profil HR, tetapkan role/access, proses payroll dan distribute payslip.',
 ownerRole:
 'Approve perubahan role sensitif, gaji pengurusan, payroll final dan kes disiplin berat.',
 escalation:
 'Staf salah syarikat, akses tidak betul, payroll luar biasa, atau pertukaran role berisiko.',
 href: '/hr',
 icon: Users,
 tone: 'violet',
 },
 {
 id: 'finance',
 area: 'Kutipan, QR manual, bank-in dan reconciliation',
 delegatedTo: 'Finance',
 company: 'Semua syarikat berkaitan',
 dailyFocus:
 'Sahkan QR manual, padan bank-in, semak tunai tertunggak dan sediakan laporan kewangan.',
 ownerRole:
 'Semak exception besar, approve polisi bayaran dan pastikan duit masuk akaun syarikat betul.',
 escalation:
 'Tunai tertunggak tinggi, mismatch bank-in, bayaran ejen tidak jelas, atau refund luar biasa.',
 href: '/finance',
 icon: Banknote,
 tone: 'rose',
 },
 {
 id: 'governance',
 area: 'Kelulusan, audit dan dokumen syarikat',
 delegatedTo: 'Admin HQ + HR + OM mengikut skop',
 company: 'Roti Kaya Junus Group',
 dailyFocus:
 'Pastikan kelulusan tidak tertangguh, dokumen syarikat/cawangan terkini dan audit trail lengkap.',
 ownerRole:
 'Menjadi pemutus akhir untuk perkara legal, delete/archive sensitif dan perubahan polisi sistem.',
 escalation:
 'Dokumen legal luput, kelulusan kritikal tertunda, atau tindakan delete/archive data penting.',
 href: '/approvals',
 icon: CheckSquare,
 tone: 'slate',
 },
];

export const OWNER_GOVERNANCE_RULES: OwnerGovernanceRule[] = [
 {
 title: 'Owner pantau, bukan buat semua',
 description:
 'Dashboard owner fokus exception: jualan jatuh, stok kritikal, tunai tertunggak, payroll luar biasa dan approval sensitif.',
 href: '/dashboard',
 icon: ShieldCheck,
 },
 {
 title: 'Kerja harian mesti ada pemilik role',
 description:
 'Setiap tugasan harian perlu jatuh kepada OM, AM, HR, Finance, Manager Maintenance, Driver atau staf cawangan.',
 href: '/settings',
 icon: Users,
 },
 {
 title: 'Semua tindakan besar ada audit',
 description:
 'Perubahan role, gaji, delete/archive dokumen, stock adjustment besar dan refund perlu ada rekod siapa, bila dan sebab.',
 href: '/reports',
 icon: FileText,
 },
 {
 title: 'AM ada scorecard, OM ada command center',
 description:
 'AM diukur melalui POS buka, staf hadir, stok terkawal, cash dikutip dan isu selesai; OM wajib kejar exception sebelum owner campur tangan.',
 href: '/dashboard#management-governance',
 icon: CheckSquare,
 },
 {
 title: 'Cash collection mesti ada bukti',
 description:
 'Kutipan cash cawangan wajib ada rekod pengutip, third party jika digunakan, rujukan/slip bank-in dan semakan Finance/OM.',
 href: '/finance',
 icon: Banknote,
 },
 {
 title: 'Maintenance dan emergency tidak tunggu owner',
 description:
 'Hanif/Manager Maintenance perlu terima dan susun tindakan segera, owner hanya dimaklumkan jika impak operasi tinggi.',
 href: '/maintenance',
 icon: Wrench,
 },
 {
 title: 'Agent dan harga dikawal distributor',
 description:
 'Group rate, ejen khas dan langganan POS diurus RKJ Distributor; owner semak margin dan polisi sahaja.',
 href: '/sales-agent',
 icon: Store,
 },
];
