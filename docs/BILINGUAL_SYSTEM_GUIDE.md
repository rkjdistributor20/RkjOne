# RKJ One - Panduan Dwi Bahasa

RKJ One kini mempunyai asas dwi bahasa `Bahasa Malaysia` dan `English`.

## Cara Penggunaan

- Pengguna boleh tukar bahasa melalui butang `BM / EN` di skrin login dan header sistem.
- Pilihan bahasa disimpan dalam browser pengguna melalui `localStorage`.
- Pilihan ini tidak mengubah data syarikat, rekod POS, gaji, stok atau laporan.

## Fail Utama

- `lib/i18n/dictionary.ts` - kamus BM/EN.
- `components/i18n/language-provider.tsx` - provider global bahasa.
- `components/i18n/language-switcher.tsx` - butang tukar bahasa.
- `components/providers.tsx` - membalut seluruh app dengan `LanguageProvider`.

## Skop Siap

- Login.
- Sidebar dan header global.
- Nama modul utama.
- Nama kumpulan menu.
- Label role pengguna.
- Metadata aplikasi asas.

## Cara Tambah Terjemahan Modul Baru

1. Tambah key BM dan EN dalam `lib/i18n/dictionary.ts`.
2. Dalam komponen client, import:

```tsx
import { useLanguage } from '@/components/i18n/language-provider';
```

3. Guna:

```tsx
const { t } = useLanguage();
return <h1>{t('nav.pos')}</h1>;
```

## Nota Penting

- Jangan simpan password, API key, token atau maklumat rahsia dalam kamus terjemahan.
- Untuk teks data sebenar seperti nama staf, nama cawangan dan nama syarikat, kekalkan data asal.
- Untuk modul yang sangat besar, terjemahkan secara berperingkat supaya tidak mengganggu SOP operasi.
