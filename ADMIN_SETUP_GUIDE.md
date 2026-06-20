# Panduan Setup Admin HQ - RKJ One

## 1. Semak Master Data
Buka `RKJ_ONE_Master_Data_Template.xlsx`.

Semak sheet berikut:
1. HQ Users
2. Branches
3. Staff Master
4. Drivers
5. Vehicles
6. Products
7. Stock Items
8. BOM Formula
9. Shift Templates
10. Payroll Rules
11. Commission
12. Finance Flow
13. Role Permissions

## 2. Isi data kosong
Admin perlu isi:
- Email login semua HQ user, manager, driver, dan staff.
- No telefon.
- No plat lori.
- Stock threshold minimum dan critical.
- Worker type: Pekerja Asing / Tempatan / Part Time.
- Lokasi GPS cawangan jika diperlukan.

## 3. Import data
Programmer boleh import CSV dari folder `csv_import/` ke Supabase.

## 4. Tetapan penting sistem
- Harga produk boleh diubah oleh Admin HQ.
- Formula penggunaan stok boleh diubah oleh Admin HQ.
- Threshold stok boleh ditetapkan ikut cawangan dan item.
- Manager hanya boleh lihat cawangan bawah kawasan sendiri.
- Staff hanya boleh lihat kiosk sendiri.
- Driver hanya boleh lihat delivery sendiri.

## 5. Flow operasi
Factory → HQ Warehouse → Driver / Driver Transfer → Kiosk → Customer

## 6. Go Live

Pilot 14 hari — lihat **[docs/GO_LIVE_CHECKLIST.md](docs/GO_LIVE_CHECKLIST.md)** untuk langkah teknikal penuh.

```bash
npm run verify:go-live          # semak DB
npm run bundle:migrations       # SQL manual jika db push gagal
npm run seed:users              # cipta login
.\scripts\go-live.ps1           # Windows — automasi penuh
```

Pilot 3 cawangan:
- Gombak
- Dengkil Utara
- Simpang Pulai Utara

Selepas stabil, rollout ke semua 36 cawangan.
