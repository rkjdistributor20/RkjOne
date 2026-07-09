export type GmpProductFamily = {
 code: string;
 name: string;
 shortName: string;
 batchPrefix: string;
 factoryProductType: 'ROTI' | 'SPREAD';
 stockItemCodes: string[];
 posMenuReferences: string[];
 lineOwner: string;
 targetRecords: string[];
 criticalChecks: string[];
 releaseCriteria: string[];
};

export type GmpRecordStage = {
 code: string;
 title: string;
 owner: string;
 evidence: string;
 timing: string;
};

export type ManufacturingStaffUnit = {
 unit: string;
 lead: string;
 members: string[];
 scope: string;
 gmpDuty: string;
 priority: 'Critical' | 'High' | 'Normal';
};

export type ManufacturingDataQualityAction = {
 issue: string;
 recommendation: string;
 impact: string;
};

export const MANUFACTURING_GMP_PRODUCTS: GmpProductFamily[] = [
 {
 code: 'GMP-PLANTA',
 name: 'Roti Planta',
 shortName: 'Planta',
 batchPrefix: 'RPL',
 factoryProductType: 'ROTI',
 stockItemCodes: ['ST-PLANTA', 'ST-PLASTIC-S', 'ST-PLASTIC-M'],
 posMenuReferences: ['Roti Kaya'],
 lineOwner: 'Line 1 - Roti Planta sebagai produk roti kilang',
 targetRecords: [
 'Batch Manufacturing Record',
 'rekod timbang dan adunan doh',
 'rekod proofing/baking/cooling',
 'rekod packing Roti Planta dan lot plastik',
 ],
 criticalChecks: ['berat doh', 'masa proofing', 'masa baking', 'cooling sebelum packing', 'label tarikh production'],
 releaseCriteria: ['tiada foreign matter', 'warna/tekstur normal', 'packing bersih', 'QC sign-off'],
 },
 {
 code: 'GMP-RKEL',
 name: 'Roti Kelapa',
 shortName: 'Kelapa',
 batchPrefix: 'RKEL',
 factoryProductType: 'ROTI',
 stockItemCodes: ['ST-KELAPA', 'ST-PLASTIC-S', 'ST-PLASTIC-M'],
 posMenuReferences: ['Roti Kelapa', 'Pelbagai'],
 lineOwner: 'Line 2 - Roti Kelapa dan packing kecil/sederhana',
 targetRecords: [
 'Batch Manufacturing Record',
 'rekod preparation inti kelapa',
 'rekod allergen/ingredient check',
 'rekod finished goods release',
 ],
 criticalChecks: ['keadaan inti', 'kawalan masa cooling', 'packing bersih', 'label batch'],
 releaseCriteria: ['bau/rasa normal', 'tiada bocor/rosak', 'kuantiti siap direconcile', 'release oleh QA/CEO'],
 },
 {
 code: 'GMP-RKAC',
 name: 'Roti Kacang',
 shortName: 'Kacang',
 batchPrefix: 'RKAC',
 factoryProductType: 'ROTI',
 stockItemCodes: ['ST-KACANG', 'ST-PLASTIC-S', 'ST-PLASTIC-M'],
 posMenuReferences: ['Roti Kacang', 'Pelbagai'],
 lineOwner: 'Line 3 - kacang merah dan allergen control',
 targetRecords: [
 'Batch Manufacturing Record',
 'rekod lot kacang merah',
 'rekod allergen cleaning',
 'rekod reject/rework',
 ],
 criticalChecks: ['lot kacang merah', 'asingkan alatan allergen', 'berat filling', 'visual defect check'],
 releaseCriteria: ['allergen area dibersihkan', 'defect reject direkod', 'packing cukup', 'QA sign-off'],
 },
 {
 code: 'GMP-BENG',
 name: 'Roti Benggali',
 shortName: 'Benggali',
 batchPrefix: 'BENG',
 factoryProductType: 'ROTI',
 stockItemCodes: ['ST-BENGGALI', 'ST-PLASTIC-B'],
 posMenuReferences: ['Roti Benggali', 'Pelbagai'],
 lineOwner: 'Line 4 - loaf/benggali dan slicing',
 targetRecords: [
 'Batch Manufacturing Record',
 'rekod baking loaf',
 'rekod slicing/cooling',
 'rekod packaging plastik B',
 ],
 criticalChecks: ['proofing loaf', 'suhu/masa baking', 'cooling sebelum packing', 'integriti plastik B'],
 releaseCriteria: ['loaf tidak lembap berlebihan', 'slice normal', 'packing bersih', 'batch trace lengkap'],
 },
 {
 code: 'GMP-KAYA',
 name: 'Kaya',
 shortName: 'Kaya',
 batchPrefix: 'KAYA',
 factoryProductType: 'SPREAD',
 stockItemCodes: ['ST-KAYA'],
 posMenuReferences: ['Roti Kaya', 'Roti Benggali', 'Pelbagai'],
 lineOwner: 'Line 5 - masak Kaya sebagai produk kilang',
 targetRecords: [
 'Batch Cooking Record',
 'rekod lot bahan mentah Kaya',
 'rekod suhu/masa masak Kaya',
 'rekod cooling, holding dan release',
 ],
 criticalChecks: ['lot bahan Kaya', 'suhu masak', 'masa cooking', 'tekstur/warna', 'cooling tertutup'],
 releaseCriteria: ['tekstur normal', 'tiada foreign matter', 'bekas/holding bersih', 'QA sign-off'],
 },
];

export const GMP_RECORD_STAGES: GmpRecordStage[] = [
 {
 code: 'PRE-OP',
 title: 'Pre-operation sanitation',
 owner: 'GMP/QA + Cleaner',
 evidence: 'Checklist kebersihan kawasan, meja, mesin, tray dan handwash',
 timing: 'Sebelum production bermula',
 },
 {
 code: 'RM-LOT',
 title: 'Raw material lot trace',
 owner: 'Storekeeper / Clerk',
 evidence: 'Lot bahan, tarikh terima, pembekal, baki stok dan status bahan',
 timing: 'Sebelum bahan ditimbang',
 },
 {
 code: 'WEIGH',
 title: 'Weighing record',
 owner: 'Production Manager',
 evidence: 'Berat bahan sebenar, toleransi dan nama penimbang/semak',
 timing: 'Semasa timbang bahan',
 },
 {
 code: 'PROCESS',
 title: 'Process CCP/QC checks',
 owner: 'Line leader',
 evidence: 'Masa mixing, proofing, baking, cooling, suhu atau catatan kawalan proses',
 timing: 'Sepanjang production',
 },
 {
 code: 'PACK',
 title: 'Packing and label trace',
 owner: 'Packing lead',
 evidence: 'Jenis plastik, label batch, kuantiti siap, reject dan rework',
 timing: 'Semasa packing',
 },
 {
 code: 'RELEASE',
 title: 'Finished goods release',
 owner: 'CEO Factory / QA',
 evidence: 'Keputusan PASS/HOLD/REJECT, pemeriksa, masa release dan nota deviation',
 timing: 'Sebelum barang keluar kilang',
 },
 {
 code: 'NC-CAPA',
 title: 'Non-conformance and CAPA',
 owner: 'GMP/QA',
 evidence: 'Isu, containment, root cause, corrective action dan close-out',
 timing: 'Bila berlaku defect, complaint atau audit finding',
 },
];

export const MANUFACTURING_STAFF_UNITS: ManufacturingStaffUnit[] = [
 {
 unit: 'Accountable leadership',
 lead: 'MFG010 Muhammad Bin Mohd Junus',
 members: ['MFG008 Mat Isa Bin Mohd Junus', 'MFG003 Isa Bin Mohd Junus'],
 scope: 'Keputusan production, release batch kritikal, audit GMP dan kapasiti mingguan.',
 gmpDuty: 'Pastikan setiap batch ada sign-off dan tiada produk keluar tanpa release.',
 priority: 'Critical',
 },
 {
 unit: 'Production control',
 lead: 'MFG012 Mujefur Rahman',
 members: ['MFG002 Farahanim', 'MFG011 Muhammad Farriz', 'MFG014 Nur Asiah', 'MFG015 Noor Azian', 'MFG020 Siti Khatijah'],
 scope: 'Operasi line 1 hingga line 5, timbang bahan, proses, packing dan reconciliation output.',
 gmpDuty: 'Isi batch record harian untuk Roti Planta, Roti Kelapa, Roti Kacang, Roti Benggali dan Kaya.',
 priority: 'Critical',
 },
 {
 unit: 'GMP, QA and safety',
 lead: 'MFG016 Norhayati Binti Mohd Junus',
 members: ['Backup: MFG012 Production Manager', 'Verifier: MFG010 CEO Factory'],
 scope: 'Pre-op hygiene, allergen control, QC release, audit finding dan CAPA.',
 gmpDuty: 'Semak checklist, tahan batch bermasalah dan tutup non-conformance.',
 priority: 'Critical',
 },
 {
 unit: 'Store, stock card and lot trace',
 lead: 'MFG007 Mashalini A/P Keshavan',
 members: ['MFG013 Nor Syazwin', 'MFG019 Sufiana'],
 scope: 'Raw material receiving, stock card, lot label, packaging stock dan dokumen sokongan.',
 gmpDuty: 'Pastikan bahan mentah ada lot trace sebelum digunakan dalam batch.',
 priority: 'High',
 },
 {
 unit: 'HR, training and document control',
 lead: 'MFG018 Rahimah Binti Alias',
 members: ['MFG013 Nor Syazwin', 'MFG019 Sufiana'],
 scope: 'Training GMP, rekod medical/typhoid jika ada, uniform/PPE dan kawalan dokumen.',
 gmpDuty: 'Simpan rekod latihan dan jadual kompetensi staf kilang.',
 priority: 'High',
 },
 {
 unit: 'Finance and costing',
 lead: 'MFG017 Nur Aisha Binti Mohd Junus',
 members: ['Support: MFG007 Clerk'],
 scope: 'Kos bahan, variance penggunaan, wastage dan laporan kos production.',
 gmpDuty: 'Banding penggunaan sebenar dengan BOM untuk kawal pembaziran.',
 priority: 'Normal',
 },
 {
 unit: 'Hygiene and sanitation',
 lead: 'MFG004 Kanagavalli A/P Murugan',
 members: ['Verifier: MFG016 Safety Officer'],
 scope: 'Kebersihan kawasan proses, peralatan, tong sampah, pest sighting dan closing cleaning.',
 gmpDuty: 'Log sanitasi mesti lengkap sebelum batch release.',
 priority: 'High',
 },
];

export const MANUFACTURING_DATA_QUALITY_ACTIONS: ManufacturingDataQualityAction[] = [
 {
 issue: 'Kod MFG001, MFG005, MFG006 dan MFG009 ialah logistik/driver tetapi berada di bawah RKJ Distributor.',
 recommendation: 'Kekalkan mereka bawah RKJ Distributor untuk route/DO, tetapi tag sebagai "Factory Logistics Support" bila ambil stok kilang.',
 impact: 'Elak payroll dan akses kilang bercampur dengan kerja delivery.',
 },
 {
 issue: 'DIST012 berada bawah RKJ Manufacturing walaupun kod bermula DIST.',
 recommendation: 'Semak HR: jika kerja sebenar logistik Distributor, pindahkan legal entity; jika kerja kilang, tukar kod staf kepada siri MFG.',
 impact: 'Memudahkan audit staf mengikut syarikat dan laporan HR/payroll.',
 },
 {
 issue: 'Staf production belum ada assignment rasmi per 5 produk.',
 recommendation: 'Guna overlay GMP line assignment sebelum ubah staff master. Sahkan dengan HR selepas UAT.',
 impact: 'Boleh jalankan GMP record tanpa risiko tersalah pindah staf.',
 },
];

export function getManufacturingGmpSummary() {
 return {
 productCount: MANUFACTURING_GMP_PRODUCTS.length,
 recordStageCount: GMP_RECORD_STAGES.length,
 staffUnitCount: MANUFACTURING_STAFF_UNITS.length,
 criticalStaffUnits: MANUFACTURING_STAFF_UNITS.filter((unit) => unit.priority === 'Critical').length,
 dataQualityActionCount: MANUFACTURING_DATA_QUALITY_ACTIONS.length,
 requiredDailySignoffs: ['Pre-op', 'Raw material', 'Process', 'Packing', 'Release'],
 };
}
