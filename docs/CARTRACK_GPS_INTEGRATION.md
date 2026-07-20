# Cartrack GPS Integration

RKJ One reads live transport GPS from Cartrack through a server-side API bridge. No Cartrack secret is sent to the browser.

## Required Env

```env
CARTRACK_API_BASE_URL=https://fleetapi-my.cartrack.com/rest
CARTRACK_API_USERNAME=
CARTRACK_API_TOKEN=
CARTRACK_FLEETWEB_URL=https://fleetweb-my.cartrack.com/map/fleet
```

## RKJ One Endpoint

`GET /api/fleet/gps/status`

Access: `SUPER_ADMIN`, `ADMIN`, `OPERATION_MANAGER`, `AREA_MANAGER`.

The endpoint:

1. Reads active RKJ One vehicles from Supabase.
2. Calls Cartrack `/vehicles/status` with Basic Auth.
3. Matches Cartrack vehicle registration to RKJ One `vehicles.plate_number`.
4. Returns normalized GPS, speed, ignition, odometer, driver and last update.
5. Uses short private cache so the dashboard stays fast and respects Cartrack rate limits.

## Matching Rule

Plate numbers are matched after removing spaces and symbols. Example:

- RKJ One: `ABC 1234`
- Cartrack: `ABC1234`

Both become `ABC1234`.

## FleetWeb Plates Checked

Chrome FleetWeb showed 11 active vehicle registrations for account `ROTI00002`:

- `ALL2224`
- `AMC2224`
- `AMC3919`
- `JUX2224`
- `SYP2224`
- `VCH7221`
- `VFL2224`
- `VFM2224`
- `VS4284`
- `WA1202J`
- `WB4631T`

Migration `00112_cartrack_vehicle_plate_sync.sql` keeps these plates in RKJ One vehicle master. The Cartrack-only plates with unknown vehicle type/driver are marked as `Kenderaan Cartrack` until HQ confirms the exact vehicle details.

## Official References

- Cartrack Fleet API authentication: https://developer.cartrack.com/docs/fleet-api-general/authentication
- Cartrack vehicle status endpoint: https://developer.cartrack.com/docs/fleet-api/get-vehicles-status-location-fuel-odometer-and-more
- Cartrack rate limiting: https://developer.cartrack.com/docs/fleet-api-general/rate-limiting

## Production Notes

- Store real Cartrack credentials in Vercel/server env only.
- Do not commit API username, token or password.
- If Cartrack returns different field names, RKJ One keeps a tolerant parser for common field variants.
- If persistent GPS history is required later, add a separate `vehicle_gps_snapshots` table with RLS and retention policy.

## Aliran Operasi

1. OM menyediakan order, kenderaan, driver dan urutan penghantaran dalam modul Logistik.
2. RKJ One membaca status GPS terkini daripada Cartrack dan memadankan nombor plat secara automatik.
3. HQ memantau kenderaan bergerak, berhenti, belum menerima GPS atau belum sepadan dengan rekod RKJ One.
4. AM melihat perjalanan yang melibatkan kawasan/cawangan di bawah pemantauan operasi mereka.
5. Driver melaksanakan arahan penghantaran dan POD dalam RKJ One; Cartrack kekal sebagai sumber lokasi kenderaan.
6. Jika lokasi meragukan, OM membuka FleetWeb atau pautan peta pada kenderaan sebelum menghubungi driver.

## Tanggungjawab

| Peranan | Tindakan utama |
|---|---|
| OM | Rancang perjalanan, tetapkan driver/kenderaan, pantau kelewatan dan susun semula laluan. |
| HQ Distributor | Sahkan muatan, pelepasan kenderaan, ketibaan semula dan isu padanan nombor plat. |
| AM | Pantau penghantaran ke kawasan, hubungi cawangan dan eskalasi kelewatan kepada OM. |
| Driver | Ikut arahan perjalanan, kemas kini status penghantaran dan lengkapkan POD. |
| Admin | Urus credential server, akses peranan dan master kenderaan. |

## Status dan Tindakan

| Paparan | Maksud | Tindakan |
|---|---|---|
| `Cartrack Live` | API aktif dan data diterima. | Pantau seperti biasa. |
| `Belum disambung` | Credential server belum lengkap. | Admin isi env Cartrack dan redeploy. |
| `Perlu semak` | API gagal, timeout atau credential ditolak. | Admin semak env; OM masih boleh buka FleetWeb. |
| `Belum padan` | Plat Cartrack tidak sepadan dengan master kenderaan. | HQ/Admin betulkan nombor plat, bukan cipta rekod pendua. |
| `GPS Aktif` | Koordinat terkini tersedia. | Gunakan pautan peta jika perlu. |
| `Bergerak` | Kelajuan semasa lebih daripada 0 km/j. | Pantau kemajuan laluan. |

## Checklist Go-Live

- Dapatkan API username dan token rasmi daripada Cartrack.
- Masukkan empat env Cartrack di Vercel untuk Production, Preview dan Development yang diperlukan.
- Jalankan migration `00112_cartrack_vehicle_plate_sync.sql` pada staging dahulu.
- Pastikan 11 nombor plat tidak menghasilkan rekod pendua.
- Redeploy aplikasi dan buka modul Logistik menggunakan akaun OM/Admin.
- Pastikan status `Cartrack Live`, bilangan kenderaan dan masa kemas kini dipaparkan.
- Uji pautan peta untuk sekurang-kurangnya satu kenderaan bergerak dan satu kenderaan berhenti.
- Sahkan AM hanya mempunyai akses pemantauan yang diluluskan dan tiada secret muncul dalam browser/network response.
