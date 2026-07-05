export type OperatingLaneCode = 'RKJ_MFG' | 'RKJ_DIST' | 'RKJ' | 'AGENT';

export type OperatingLane = {
 code: OperatingLaneCode;
 label: string;
 legalOwner: string;
 mission: string;
 primaryUsers: string[];
 sourceOfTruth: string[];
 focusModules: Array<{ label: string; href: string }>;
 riskControl: string;
 tone: 'orange' | 'blue' | 'gold' | 'emerald';
};

export type OperatingHandoff = {
 from: OperatingLaneCode;
 to: OperatingLaneCode;
 title: string;
 proof: string;
 ownerAction: string;
};

export const RKJ_OPERATING_LANES: OperatingLane[] = [
 {
 code: 'RKJ_MFG',
 label: 'Manufacturing',
 legalOwner: 'Roti Kaya Junus Manufacturing Sdn Bhd',
 mission: 'Sediakan produk, kawal bahan mentah, rekod stock card dan sahkan output production.',
 primaryUsers: ['CEO Kilang', 'Pengurus Operasi Kilang', 'Staf Production'],
 sourceOfTruth: ['Production order', 'Raw material stock card', 'Factory stock movement'],
 focusModules: [
 { label: 'Kilang', href: '/factory' },
 { label: 'Bahan Mentah', href: '/factory' },
 { label: 'Laporan Production', href: '/reports' },
 ],
 riskControl: 'Data kilang tidak bercampur dengan Distributor kecuali melalui order dan handoff rasmi.',
 tone: 'orange',
 },
 {
 code: 'RKJ_DIST',
 label: 'Distributor',
 legalOwner: 'RKJ Distributor Sdn Bhd',
 mission: 'Urus HQ Distributor, logistik, driver, agent, group rate dan aliran stok ke cawangan.',
 primaryUsers: ['Pengurus Operasi Distributor', 'Pengurus Kawasan', 'Driver', 'Manager Maintenance'],
 sourceOfTruth: ['HQ stock', 'Delivery order', 'Driver route', 'Agent account'],
 focusModules: [
 { label: 'HQ Distributor', href: '/warehouse' },
 { label: 'Logistik', href: '/fleet' },
 { label: 'Portal Ejen', href: '/sales-agent' },
 ],
 riskControl: 'Agent dan fleet duduk bawah Distributor; akses ditentukan oleh role, branch, area dan jenis ejen.',
 tone: 'blue',
 },
 {
 code: 'RKJ',
 label: 'Roti Kaya Junus Retail',
 legalOwner: 'Roti Kaya Junus',
 mission: 'Fokus operasi cawangan, POS, shift, inventory kiosk, maintenance dan pengalaman pelanggan.',
 primaryUsers: ['Operation Manager Retail', 'Branch Manager', 'Staf Kiosk', 'Finance'],
 sourceOfTruth: ['Branch profile', 'POS transaction', 'Shift roster', 'Kiosk inventory'],
 focusModules: [
 { label: 'Cawangan', href: '/branches' },
 { label: 'POS', href: '/pos' },
 { label: 'Inventori', href: '/inventory' },
 ],
 riskControl: 'Setiap cawangan ada profile sendiri; BM dan OM hanya update data bawah cawangan yang diberi.',
 tone: 'gold',
 },
 {
 code: 'AGENT',
 label: 'Agent Network',
 legalOwner: 'Diurus oleh RKJ Distributor Sdn Bhd',
 mission: 'Ejen order stok, guna group rate, langgan POS, urus outlet dan staf jualan jika layak.',
 primaryUsers: ['Ejen Biasa', 'Ejen Khas Syarikat', 'Staf Jualan Ejen'],
 sourceOfTruth: ['Agent profile', 'Price group', 'POS subscription', 'Pickup point'],
 focusModules: [
 { label: 'Portal Ejen', href: '/sales-agent' },
 { label: 'Group Rate', href: '/sales-agent' },
 { label: 'Outlet POS', href: '/sales-agent' },
 ],
 riskControl: 'Ejen biasa perlu langgan POS RM200/cawangan untuk fungsi outlet/staf; Ejen Khas boleh order tanpa bayaran.',
 tone: 'emerald',
 },
];

export const RKJ_OPERATING_HANDOFFS: OperatingHandoff[] = [
 {
 from: 'RKJ_MFG',
 to: 'RKJ_DIST',
 title: 'Production siap ke HQ Distributor',
 proof: 'Batch, quantity, tarikh production dan penerimaan stok HQ.',
 ownerAction: 'OM kilang sahkan output; OM Distributor sahkan received/cross-dock.',
 },
 {
 from: 'RKJ_DIST',
 to: 'RKJ',
 title: 'Stok bergerak ke cawangan',
 proof: 'Delivery order, driver route, POD dan branch stock received.',
 ownerAction: 'Driver update route; branch confirm stok diterima dalam inventory.',
 },
 {
 from: 'RKJ',
 to: 'RKJ_DIST',
 title: 'Cawangan report isu operasi',
 proof: 'Maintenance ticket, shortage report, stock request dan roster issue.',
 ownerAction: 'AM/OM distributor susun tindakan, driver atau staf ganti.',
 },
 {
 from: 'RKJ_DIST',
 to: 'AGENT',
 title: 'Agent order dan pickup/delivery',
 proof: 'Order, group rate, payment status, pickup point dan POS subscription.',
 ownerAction: 'HQ Distributor tetapkan rate, route driver dan status bayaran.',
 },
];

export const RKJ_BANK_GRADE_GUARDRAILS = [
 'Setiap pengguna hanya nampak syarikat legal yang berkaitan dengan profile mereka.',
 'Dokumen syarikat dan cawangan mesti boleh view dahulu sebelum download.',
 'Roti Kaya Junus perlu ada profile cawangan; dokumen cawangan duduk bawah profile cawangan.',
 'Agent biasa dan Ejen Khas mesti dipisahkan kerana tahap akses dan bayaran tidak sama.',
 'HR dan Gaji bergerak dalam satu dashboard supaya majikan legal, role, gaji dan payslip selari.',
 'Payment POS/Agent hanya dianggap sah apabila ada callback/verification gateway atau rekod pengesahan rasmi.',
];
