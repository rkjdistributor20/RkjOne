/**
 * Menu Pelbagai POS - spesifikasi rasmi RKJ (9 jenis - 21 SKU).
 * BOM tolakan stok: roti kiosk, kaya, butter dan plastik pembungkusan.
 */

export const PELBAGAI_SKUS = [
  'PLG-KBS-3',
  'PLG-KBS-1',
  'PLG-SCKB-111',
  'PLG-SCKB-211',
  'PLG-SCKB-212',
  'PLG-SCKB-121',
  'PLG-SCKB-112',
  'PLG-SCK-111',
  'PLG-SCK-211',
  'PLG-SCK-212',
  'PLG-SCK-121',
  'PLG-SCK-112',
  'PLG-SCK-113',
  'PLG-BSEP',
  'PLG-BBO',
  'PLG-BHKB',
  'PLG-BHK',
  'PLG-KACB-1',
  'PLG-KACB-3',
  'PLG-KELB-1',
  'PLG-KELB-3',
] as const;

export type PelbagaiSku = (typeof PELBAGAI_SKUS)[number];

export interface PelbagaiVariantDef {
  sku: PelbagaiSku;
  label: string;
  price: number;
  saleUnit: string;
  sortOrder: number;
  /** Kandungan set - papar pada kad produk */
  contents: string;
  /** Nota tolakan stok untuk varian ini */
  deductNote: string;
}

export interface PelbagaiMenuGroupDef {
  id: string;
  number: number;
  title: string;
  stockNote: string;
  variants: PelbagaiVariantDef[];
}

export const PELBAGAI_MENU_GROUPS: PelbagaiMenuGroupDef[] = [
  {
    id: 'kaya-butter',
    number: 1,
    title: 'Roti Kaya (Butter Sahaja)',
    stockNote: 'Tolak Roti Kaya, butter dan plastik mengikut kuantiti',
    variants: [
      {
        sku: 'PLG-KBS-3',
        label: '3 pcs',
        price: 10,
        saleUnit: 'Set',
        sortOrder: 50,
        contents: '3 pcs Roti Kaya (Butter Sahaja)',
        deductNote: 'Tolak 3 Roti Kaya, 12g butter, 1 plastik M',
      },
      {
        sku: 'PLG-KBS-1',
        label: '1 pcs',
        price: 3.3,
        saleUnit: 'Pcs',
        sortOrder: 51,
        contents: '1 pcs Roti Kaya (Butter Sahaja)',
        deductNote: 'Tolak 1 Roti Kaya, 4g butter, 1 plastik S',
      },
    ],
  },
  {
    id: 'campur-kaya-butter',
    number: 2,
    title: 'Set Campur Kaya Butter',
    stockNote:
      'Tolak roti ikut set, 12g kaya, butter ikut bilangan roti butter dan 1 plastik M',
    variants: [
      {
        sku: 'PLG-SCKB-111',
        label: 'RM10',
        price: 10,
        saleUnit: 'Set',
        sortOrder: 52,
        contents: '1 Kaya Butter + 1 Kelapa (Kaya) + 1 Kacang (Kaya)',
        deductNote:
          'Tolak 1 Kaya, 1 Kelapa, 1 Kacang, 12g kaya, 4g butter, 1 plastik M',
      },
      {
        sku: 'PLG-SCKB-211',
        label: 'RM10',
        price: 10,
        saleUnit: 'Set',
        sortOrder: 53,
        contents: '2 Kaya Butter + 1 Kelapa (Kaya)',
        deductNote: 'Tolak 2 Kaya, 1 Kelapa, 12g kaya, 8g butter, 1 plastik M',
      },
      {
        sku: 'PLG-SCKB-212',
        label: 'RM11',
        price: 11,
        saleUnit: 'Set',
        sortOrder: 54,
        contents: '2 Kaya Butter + 1 Kacang (Kaya)',
        deductNote: 'Tolak 2 Kaya, 1 Kacang, 12g kaya, 8g butter, 1 plastik M',
      },
      {
        sku: 'PLG-SCKB-121',
        label: 'RM11',
        price: 11,
        saleUnit: 'Set',
        sortOrder: 55,
        contents: '2 Kelapa (Kaya) + 1 Kacang (Kaya)',
        deductNote: 'Tolak 2 Kelapa, 1 Kacang, 12g kaya, 1 plastik M',
      },
      {
        sku: 'PLG-SCKB-112',
        label: 'RM11',
        price: 11,
        saleUnit: 'Set',
        sortOrder: 56,
        contents: '2 Kacang (Kaya) + 1 Kaya Butter',
        deductNote: 'Tolak 2 Kacang, 1 Kaya, 12g kaya, 4g butter, 1 plastik M',
      },
    ],
  },
  {
    id: 'campur-kaya',
    number: 3,
    title: 'Set Campur Kaya',
    stockNote: 'Tolak roti ikut set, 12g kaya dan 1 plastik M',
    variants: [
      {
        sku: 'PLG-SCK-111',
        label: 'RM7',
        price: 7,
        saleUnit: 'Set',
        sortOrder: 57,
        contents: '1 Kaya Sahaja + 1 Kelapa + 1 Kacang',
        deductNote: 'Tolak 1 Kaya, 1 Kelapa, 1 Kacang, 12g kaya, 1 plastik M',
      },
      {
        sku: 'PLG-SCK-211',
        label: 'RM7',
        price: 7,
        saleUnit: 'Set',
        sortOrder: 58,
        contents: '2 Kaya + 1 Kelapa',
        deductNote: 'Tolak 2 Kaya, 1 Kelapa, 12g kaya, 1 plastik M',
      },
      {
        sku: 'PLG-SCK-212',
        label: 'RM8',
        price: 8,
        saleUnit: 'Set',
        sortOrder: 59,
        contents: '2 Kaya + 1 Kacang',
        deductNote: 'Tolak 2 Kaya, 1 Kacang, 12g kaya, 1 plastik M',
      },
      {
        sku: 'PLG-SCK-121',
        label: 'RM8',
        price: 8,
        saleUnit: 'Set',
        sortOrder: 60,
        contents: '2 Kelapa + 1 Kacang',
        deductNote: 'Tolak 2 Kelapa, 1 Kacang, 12g kaya, 1 plastik M',
      },
      {
        sku: 'PLG-SCK-112',
        label: 'RM8',
        price: 8,
        saleUnit: 'Set',
        sortOrder: 61,
        contents: '2 Kacang + 1 Kaya',
        deductNote: 'Tolak 2 Kacang, 1 Kaya, 12g kaya, 1 plastik M',
      },
      {
        sku: 'PLG-SCK-113',
        label: 'RM9',
        price: 9,
        saleUnit: 'Set',
        sortOrder: 62,
        contents: '2 Kacang + 1 Kaya',
        deductNote: 'Tolak 2 Kacang, 1 Kaya, 12g kaya, 1 plastik M',
      },
    ],
  },
  {
    id: 'benggali-separuh',
    number: 4,
    title: 'Set Benggali Separuh',
    stockNote: 'Tolak 1 Roti Benggali, kaya, butter dan 1 plastik B',
    variants: [
      {
        sku: 'PLG-BSEP',
        label: '1 Set',
        price: 12,
        saleUnit: 'Set',
        sortOrder: 63,
        contents: 'Separuh Kaya Sahaja + Separuh Kaya Butter',
        deductNote: 'Tolak 1 Benggali, 42.5g kaya, 22.5g butter, 1 plastik B',
      },
    ],
  },
  {
    id: 'benggali-butter-only',
    number: 5,
    title: 'Set Benggali Butter Only',
    stockNote: 'Tolak 1 Roti Benggali, butter dan 1 plastik B',
    variants: [
      {
        sku: 'PLG-BBO',
        label: '1 Set',
        price: 9,
        saleUnit: 'Set',
        sortOrder: 64,
        contents: 'Set Benggali Butter Only',
        deductNote: 'Tolak 1 Benggali, 45g butter, 1 plastik B',
      },
    ],
  },
  {
    id: 'benggali-half-kb',
    number: 6,
    title: 'Set Separuh Benggali Kaya Butter',
    stockNote: 'Tolak 0.5 Roti Benggali, kaya, butter dan 1 plastik B',
    variants: [
      {
        sku: 'PLG-BHKB',
        label: '1 Set',
        price: 7,
        saleUnit: 'Set',
        sortOrder: 65,
        contents: 'Separuh Benggali Kaya Butter',
        deductNote: 'Tolak 0.5 Benggali, 22.5g kaya, 22.5g butter, 1 plastik B',
      },
    ],
  },
  {
    id: 'benggali-half-k',
    number: 7,
    title: 'Set Separuh Benggali Kaya Sahaja',
    stockNote: 'Tolak 0.5 Roti Benggali, kaya dan 1 plastik B',
    variants: [
      {
        sku: 'PLG-BHK',
        label: '1 Set',
        price: 6,
        saleUnit: 'Set',
        sortOrder: 66,
        contents: 'Separuh Benggali Kaya Sahaja',
        deductNote: 'Tolak 0.5 Benggali, 20g kaya, 1 plastik B',
      },
    ],
  },
  {
    id: 'kacang-butter',
    number: 8,
    title: 'Set Kacang Butter',
    stockNote: 'Tolak Roti Kacang, butter dan plastik mengikut kuantiti',
    variants: [
      {
        sku: 'PLG-KACB-1',
        label: '1 pcs',
        price: 4.5,
        saleUnit: 'Pcs',
        sortOrder: 67,
        contents: '1 pcs Set Kacang Butter',
        deductNote: 'Tolak 1 Kacang, 4g butter, 1 plastik S',
      },
      {
        sku: 'PLG-KACB-3',
        label: '3 pcs',
        price: 11,
        saleUnit: 'Set',
        sortOrder: 68,
        contents: '3 pcs Set Kacang Butter',
        deductNote: 'Tolak 3 Kacang, 12g butter, 1 plastik M',
      },
    ],
  },
  {
    id: 'kelapa-butter',
    number: 9,
    title: 'Set Kelapa Butter',
    stockNote: 'Tolak Roti Kelapa, butter dan plastik mengikut kuantiti',
    variants: [
      {
        sku: 'PLG-KELB-1',
        label: '1 pcs',
        price: 3.5,
        saleUnit: 'Pcs',
        sortOrder: 69,
        contents: '1 pcs Set Kelapa Butter',
        deductNote: 'Tolak 1 Kelapa, 4g butter, 1 plastik S',
      },
      {
        sku: 'PLG-KELB-3',
        label: '3 pcs',
        price: 10,
        saleUnit: 'Set',
        sortOrder: 70,
        contents: '3 pcs Set Kelapa Butter',
        deductNote: 'Tolak 3 Kelapa, 12g butter, 1 plastik M',
      },
    ],
  },
];

const skuToVariant = new Map<PelbagaiSku, PelbagaiVariantDef>();
for (const group of PELBAGAI_MENU_GROUPS) {
  for (const v of group.variants) {
    skuToVariant.set(v.sku, v);
  }
}

export function getPelbagaiVariantBySku(
  sku: string
): PelbagaiVariantDef | undefined {
  return skuToVariant.get(sku as PelbagaiSku);
}

export function isPelbagaiSku(sku: string): sku is PelbagaiSku {
  return (PELBAGAI_SKUS as readonly string[]).includes(sku);
}

export function sortPelbagaiProducts<T extends { sku: string }>(
  items: T[]
): T[] {
  const order = new Map<string, number>(
    PELBAGAI_SKUS.map((sku, i) => [sku, i])
  );
  return [...items].sort(
    (a, b) => (order.get(a.sku) ?? 999) - (order.get(b.sku) ?? 999)
  );
}

/** Senarai SKU + harga untuk verify go-live */
export const PELBAGAI_VERIFY_PRICES: ReadonlyArray<[PelbagaiSku, number]> =
  PELBAGAI_MENU_GROUPS.flatMap((g) =>
    g.variants.map((v) => [v.sku, v.price] as [PelbagaiSku, number])
  );
