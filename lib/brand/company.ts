/**
 * Maklumat jenama Roti Kaya Junus
 * Sumber: Facebook @rotikayajunus - Linktree HQ
 */
export const COMPANY = {
 name: 'Roti Kaya Junus',
 shortName: 'RKJ',
 systemName: 'RKJ One',
 tagline: 'Resepi Asal Dapur Kayu',
 taglineMs: 'Lembut. Hangat. Tradisi Teluk Intan sejak 1975.',
 founded: 1975,
 founder: 'Allahyarham Tuan Haji Junus',
 originAddress: 'Jalan Maharajalela, Teluk Intan, Perak',
 hq: 'Teluk Intan, Perak',
 branchCount: 36,
 regions: ['Utara', 'Tengah', 'Selatan'] as const,
 social: {
 facebook: 'https://www.facebook.com/rotikayajunus',
 tiktok: 'https://www.tiktok.com/@rotikayajunus',
 linktree: 'https://linktr.ee/rotikayajunus',
 },
 logoPath: '/brand/logo-premium.png',
 products: [
 { name: 'Roti Kaya', desc: 'Inti kaya buatan sendiri - stok roti Planta' },
 { name: 'Roti Kacang', desc: 'Kacang merah klasik' },
 { name: 'Roti Kelapa', desc: 'Kelapa parut segar' },
 { name: 'Roti Benggali', desc: 'Roti lembut ikonik' },
 ],
 highlights: [
 'Logo rasmi - emas, hitam & putih sejak 1975',
 'Resepi asal dapur kayu api tradisi',
 '4 menu POS: Roti Kaya - Kacang - Kelapa - Benggali',
 'Stok inventory: Roti, Bahan (Kaya/Butter), Packaging (plastik)',
 '36 cawangan kiosk - Utara - Tengah - Selatan',
 'Satu sistem - Roti Kaya Junus - RKJ Distributor (HQ Distributor) - RKJ Manufacturing',
 ],
} as const;

export const OFFICIAL_LOGO_PATH = COMPANY.logoPath;

/** Palet dari logo rasmi - emas "Roti Kaya", hitam "Junus", putih latar */
export const BRAND_COLORS = {
 gold: '#E5A812',
 goldBright: '#F0C030',
 goldLight: '#FFF4D6',
 goldMuted: '#F5E6B8',
 black: '#141414',
 blackSoft: '#2A2A2A',
 white: '#FFFFFF',
 cream: '#FAFAFA',
 gray: '#E8E8E8',
} as const;
