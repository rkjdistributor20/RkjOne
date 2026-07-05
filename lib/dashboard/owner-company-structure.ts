import type { LucideIcon } from 'lucide-react';
import {
 Factory,
 ClipboardList,
 Package,
 Warehouse,
 Truck,
 Users,
 CheckSquare,
 Building2,
 ShoppingCart,
 Monitor,
 Clock,
 BarChart3,
 Wallet,
 Banknote,
 Settings,
 Store,
} from 'lucide-react';
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';
import { LOGISTIK_LABEL } from '@/lib/fleet/logistics-label';
import { COMPANY } from '@/lib/brand/company';

export type OwnerDepartment = {
 id: string;
 label: string;
 description: string;
 href: string;
 icon: LucideIcon;
};

export type OwnerCompanyAccent = {
 gradient: string;
 border: string;
 iconBg: string;
 iconColor: string;
 badge: string;
 stepBg: string;
};

export type OwnerCompanyBlock = {
 code: 'RKJ_MFG' | 'RKJ_DIST' | 'RKJ';
 legalName: string;
 shortName: string;
 scope: string;
 workflowLabel: string;
 step: number;
 accent: OwnerCompanyAccent;
 departments: OwnerDepartment[];
 highlights?: string[];
};

/** Aliran rantaian bekalan: Kilang -> Distributor -> Ejen/Kiosk -> Jualan */
export const OWNER_SUPPLY_CHAIN = [
 { step: 1, label: 'Kilang', sub: 'Production', icon: Factory },
 { step: 2, label: HQ_DISTRIBUTOR_LABEL, sub: 'Cross-dock', icon: Warehouse },
 { step: 3, label: LOGISTIK_LABEL, sub: 'Penghantaran', icon: Truck },
 { step: 4, label: 'Ejen', sub: 'Group rate', icon: Store },
 { step: 5, label: 'Kiosk', sub: '36 cawangan', icon: Building2 },
 { step: 6, label: 'POS', sub: 'Jualan', icon: ShoppingCart },
] as const;

export const OWNER_COMPANY_BLOCKS: OwnerCompanyBlock[] = [
 {
 code: 'RKJ_MFG',
 legalName: 'Roti Kaya Junus Manufacturing Sdn Bhd',
 shortName: 'RKJ Manufacturing',
 scope: 'Pengeluaran roti - gudang kilang - order HQ',
 workflowLabel: '1 Pengeluaran',
 step: 1,
 accent: {
 gradient: 'linear-gradient(145deg, #fff7ed 0%, #ffedd5 45%, #ffffff 100%)',
 border: '#fdba74',
 iconBg: '#ffedd5',
 iconColor: '#c2410c',
 badge: 'bg-orange-100 text-orange-900 border-orange-200',
 stepBg: 'bg-orange-600 text-white',
 },
 highlights: ['Production order', '17 bahan mentah', 'Sahkan ke HQ'],
 departments: [
 {
 id: 'mfg-factory',
 label: 'Kilang & Production',
 description: 'Order kilang - output harian - sahkan production',
 href: '/factory',
 icon: Factory,
 },
 {
 id: 'mfg-planning',
 label: 'Perancangan Order',
 description: 'Ramalan & muktamad order dari HQ Distributor',
 href: '/factory',
 icon: ClipboardList,
 },
 {
 id: 'mfg-stock',
 label: 'Bahan Mentah Kilang',
 description: 'Stock card - keluar/masuk bahan - usage production',
 href: '/factory',
 icon: Package,
 },
 ],
 },
 {
 code: 'RKJ_DIST',
 legalName: 'RKJ Distributor Sdn Bhd',
 shortName: 'RKJ Distributor',
 scope: 'Pengedaran - logistik - ejen jualan - 3 Pengurus Kawasan - HQ Distributor',
 workflowLabel: '2 Pengedaran',
 step: 2,
 accent: {
 gradient: 'linear-gradient(145deg, #eff6ff 0%, #dbeafe 45%, #ffffff 100%)',
 border: '#93c5fd',
 iconBg: '#dbeafe',
 iconColor: '#1d4ed8',
 badge: 'bg-blue-100 text-blue-900 border-blue-200',
 stepBg: 'bg-blue-600 text-white',
 },
 highlights: ['3 AM - 36 cawangan', 'Cross-dock HQ', '5 pemandu', 'Ejen & group rate'],
 departments: [
 {
 id: 'dist-hq',
 label: HQ_DISTRIBUTOR_LABEL,
 description: 'Agregat order - cross-dock - terima dari kilang',
 href: '/warehouse',
 icon: Warehouse,
 },
 {
 id: 'dist-fleet',
 label: LOGISTIK_LABEL,
 description: 'Penghantaran - jadual driver - DO ke kiosk',
 href: '/fleet',
 icon: Truck,
 },
 {
 id: 'dist-am',
 label: 'Pengurus Kawasan',
 description: 'Safuan - Hakim - Yati - operasi 36 cawangan',
 href: '/branches',
 icon: Users,
 },
 {
 id: 'dist-agent',
 label: 'Agent / Ejen Jualan',
 description: 'Group rate - order stok - bayaran - outlet POS',
 href: '/sales-agent',
 icon: Store,
 },
 {
 id: 'dist-approvals',
 label: 'Kelulusan Operasi',
 description: 'Order kilang - pindahan stok - cross-dock',
 href: '/approvals',
 icon: CheckSquare,
 },
 ],
 },
 {
 code: 'RKJ',
 legalName: 'Roti Kaya Junus',
 shortName: COMPANY.name,
 scope: 'Staf jualan kiosk - 36 cawangan - jenama Roti Kaya Junus',
 workflowLabel: '3 Jualan & Retail',
 step: 3,
 accent: {
 gradient: 'linear-gradient(145deg, #FFF9E6 0%, #FFF4D6 40%, #ffffff 100%)',
 border: '#E5A812',
 iconBg: '#FFF4D6',
 iconColor: '#141414',
 badge: 'bg-amber-100 text-amber-950 border-amber-300',
 stepBg: 'bg-[#141414] text-[#F0C030]',
 },
 highlights: ['Utara 12 - Tengah 10 - Selatan 14', '4 menu POS', 'Staf kiosk'],
 departments: [
 {
 id: 'rkj-branches',
 label: '36 Cawangan Kiosk',
 description: 'Senarai cawangan R&R - plaza tol - OBR',
 href: '/branches',
 icon: Building2,
 },
 {
 id: 'rkj-pos',
 label: 'POS & Jualan',
 description: 'Kaunter tunai - 4 menu roti - syif harian',
 href: '/pos',
 icon: Monitor,
 },
 {
 id: 'rkj-inventory',
 label: 'Inventori Kiosk',
 description: 'Stok roti & bahan di setiap cawangan',
 href: '/inventory',
 icon: Package,
 },
 {
 id: 'rkj-shifts',
 label: 'Syif & Kehadiran',
 description: 'Jadual staf - clock-in - tutup syif',
 href: '/shifts',
 icon: Clock,
 },
 {
 id: 'rkj-reports',
 label: 'Laporan Jualan',
 description: 'Prestasi cawangan - produk - harian/mingguan',
 href: '/reports',
 icon: BarChart3,
 },
 ],
 },
];

/** Jabatan kumpulan - pemilik / pentadbir utama */
export const OWNER_GROUP_DEPARTMENTS: OwnerDepartment[] = [
 {
 id: 'grp-finance',
 label: 'Kewangan',
 description: 'Akaun - tunai - bank slip',
 href: '/finance',
 icon: Banknote,
 },
 {
 id: 'grp-payroll',
 label: 'HR & Gaji',
 description: 'Staf - gaji mingguan - profil HR - payslip',
 href: '/hr',
 icon: Wallet,
 },
 {
 id: 'grp-settings',
 label: 'Tetapan Sistem',
 description: 'Pengguna - peranan - konfigurasi',
 href: '/settings',
 icon: Settings,
 },
 {
 id: 'grp-approvals',
 label: 'Kelulusan Pusat',
 description: 'Semua permohonan menunggu HQ',
 href: '/approvals',
 icon: CheckSquare,
 },
];

export function isOwnerDashboardRole(role: string): boolean {
 return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

