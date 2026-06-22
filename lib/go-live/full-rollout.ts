/**
 * Go-live terus — 36 cawangan serentak (tiada fasa pilot wajib)
 */
export const GO_LIVE_BRANCH_TOTAL = 36;

export const GO_LIVE_BY_REGION = [
  { code: 'UTARA', name: 'Utara', am: 'Safuan', email: 'safuan@rkj.com', branches: 12 },
  { code: 'TENGAH', name: 'Tengah', am: 'Hakim', email: 'hakim@rkj.com', branches: 10 },
  { code: 'SELATAN', name: 'Selatan', am: 'Yati', email: 'yati@rkj.com', branches: 14 },
] as const;

export const GO_LIVE_PRODUCTION_URL = 'https://rkj-one.vercel.app';
