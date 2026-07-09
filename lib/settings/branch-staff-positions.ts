export const SALES_STAFF_POSITION_PRESET = {
 id: 'SALES_POS',
 label: 'Staf Jualan / POS',
 jobTitle: 'Staf Jualan / POS',
 department: 'Cawangan / POS',
 workScope: 'Jualan kiosk, buka/tutup POS, layan pelanggan dan jaga kebersihan kaunter.',
} as const;

export const BRANCH_STAFF_POSITION_PRESETS = [
 SALES_STAFF_POSITION_PRESET,
 {
 id: 'PIC_BRANCH',
 label: 'PIC Cawangan / Shift Lead',
 jobTitle: 'PIC Cawangan',
 department: 'Operasi Cawangan',
 workScope: 'Pantau syif, susun staf bertugas, semak stok harian, buka/tutup POS dan lapor isu kepada AM.',
 },
 {
 id: 'STOCK_INVENTORY',
 label: 'Pembantu Stok / Inventori',
 jobTitle: 'Pembantu Stok Cawangan',
 department: 'Inventori Kiosk',
 workScope: 'Terima stok, semak baki roti/kaya/plastik, rekod reject dan bantu kira stok sebelum/selepas syif.',
 },
 {
 id: 'OPERATIONS_RUNNER',
 label: 'Runner / Pembantu Operasi',
 jobTitle: 'Runner Cawangan',
 department: 'Operasi Cawangan',
 workScope: 'Bantu operasi harian cawangan, ambil barang kecil, sokong staf POS dan bantu ketika waktu puncak.',
 },
 {
 id: 'CLEANING_SUPPORT',
 label: 'Kebersihan / Sokongan',
 jobTitle: 'Staf Kebersihan Cawangan',
 department: 'Kebersihan',
 workScope: 'Jaga kebersihan kiosk, peralatan, ruang pelanggan dan bantu checklist kebersihan harian.',
 },
] as const;

function normalizePositionText(value: string | null | undefined) {
 return String(value ?? '').trim().toLowerCase();
}

function isBlankOrExpected(value: string | null | undefined, expected: string) {
 const normalized = normalizePositionText(value);
 return !normalized || normalized === normalizePositionText(expected);
}

export function isSalesStaffPositionInput(input: {
 jobTitle?: string | null;
 department?: string | null;
 workScope?: string | null;
 remarks?: string | null;
}) {
 return (
 isBlankOrExpected(input.jobTitle, SALES_STAFF_POSITION_PRESET.jobTitle) &&
 isBlankOrExpected(input.department, SALES_STAFF_POSITION_PRESET.department) &&
 isBlankOrExpected(
 input.workScope ?? input.remarks,
 SALES_STAFF_POSITION_PRESET.workScope)
 );
}
