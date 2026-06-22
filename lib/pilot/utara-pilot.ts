/**
 * Pilot 14 hari — semua cawangan kawasan Utara (Pengurus Kawasan: Safuan)
 * Selepas stabil → rollout Tengah (Hakim) → Selatan (Yati)
 */
export const PILOT_DURATION_DAYS = 14;

export const PILOT_AREA_MANAGER = {
  name: 'Safuan',
  email: 'safuan@rkj.com',
  regionCode: 'UTARA' as const,
  regionName: 'Utara',
  branchCount: 12,
};

export type PilotBranch = {
  branch_code: string;
  branch_name: string;
};

/** 12 kiosk Utara — BR001–BR012 */
export const PILOT_UTARA_BRANCHES: readonly PilotBranch[] = [
  { branch_code: 'BR001', branch_name: 'RNR Juru Arah Selatan' },
  { branch_code: 'BR002', branch_name: 'RNR Gunung Semanggul Arah Selatan' },
  { branch_code: 'BR003', branch_name: 'RNR Gunung Semanggul Arah Utara' },
  { branch_code: 'BR004', branch_name: 'Hentian Sebelah Bukit Gantang Arah Utara' },
  { branch_code: 'BR005', branch_name: 'RNR Sg Perak Arah Selatan' },
  { branch_code: 'BR006', branch_name: 'RNR Sg Perak Arah Utara' },
  { branch_code: 'BR007', branch_name: 'RNR Simpang Pulai Arah Selatan' },
  { branch_code: 'BR008', branch_name: 'RNR Simpang Pulai Arah Utara' },
  { branch_code: 'BR009', branch_name: 'Plaza Tol Simpang Pulai' },
  { branch_code: 'BR010', branch_name: 'Plaza Tol WCE Taiping' },
  { branch_code: 'BR011', branch_name: 'RNR Sg Nyiur Arah Utara' },
  { branch_code: 'BR012', branch_name: 'Hentian Sebelah Bukit Gantang Arah Selatan' },
] as const;

export const PILOT_UTARA_BRANCH_CODES = PILOT_UTARA_BRANCHES.map((b) => b.branch_code);
