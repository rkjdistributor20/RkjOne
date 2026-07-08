# RKJ One Checkpoint - 29 Jun 2026

Production: https://rkj.one
Latest deployment: dpl_APSsuRhwkQnhXc6mru4qFF3tnyDW
Health check: OK, Supabase connected, 36 cawangan terbaca.

## Siap Setakat Ini

- Jadual production mingguan kilang dibetulkan supaya `week_start` sentiasa bermula Isnin.
- State lama yang tersimpan sebagai Ahad dinormalize dengan selamat ke minggu Isnin yang betul.
- Dropdown driver HQ order dibetulkan untuk sokong kod driver lama dan baharu: `D`, `DRV`, dan `ROAD`.
- Fungsi `Auto-tugaskan driver ikut kawasan` dibetulkan supaya memilih driver aktif ikut kawasan walaupun `default_driver_id` cawangan kosong.
- Fungsi `Guna Cadangan Semua Cawangan` turut auto-pilih driver ikut kawasan bersama cadangan kuantiti.
- Driver aktif disahkan dalam Supabase: `DRV001` hingga `DRV006`.
- Build TypeScript lulus.
- Build production Next.js lulus.
- Deployment production telah dialias ke `rkj.one`.

## Bila Sambung

- Refresh browser dengan `Ctrl + F5`.
- Uji semula modul Kilang/HQ order:
  - buka cadangan order cawangan,
  - tekan `Auto-tugaskan driver ikut kawasan`,
  - pastikan setiap cawangan dapat driver,
  - terbitkan order dan semak jadual production.

## Fail Utama Terlibat

- `components/warehouse/hq-branch-order-matrix.tsx`
- `lib/production/driver-routing.ts`
- `components/warehouse/factory-production-schedule-panel.tsx`
- `app/api/production/weeks/route.ts`
- `lib/production/week-utils.ts`
