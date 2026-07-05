# RKJ One - Senarai Semak Go-Live

Panduan lengkap untuk siapkan sistem RKJ One - **go-live terus 36 cawangan** (pilot optional).

> **Keputusan semasa:** Operasi sebenar serentak 36 kiosk - rujuk **[GO_LIVE_36.md](./GO_LIVE_36.md)** untuk checklist hari go-live.

---

## Fasa 1: Setup Teknikal (IT / Programmer)

### 1.1 Supabase Production

- [ ] Cipta projek Supabase (region: **Singapore**)
- [ ] Catat **Project URL**, **anon key**, **service_role key**
- [ ] Salin `.env.example` ke `.env.local` dan isi semua key
- [ ] Set `NEXT_PUBLIC_APP_URL` (local: `http://localhost:3000`)

### 1.2 Migration pangkalan data

**Cara A - CLI (disyorkan):**

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

**Cara B - Windows PowerShell (automatik):**

```powershell
.\scripts\go-live.ps1 -ProjectRef YOUR_PROJECT_REF
```

**Cara C - Manual (jika `db push` gagal):**

1. Pastikan migration **00001-00018** sudah applied
2. Buka Supabase Dashboard ke **SQL Editor**
3. Paste & Run: `docs/sql/00019_00030_manual_bundle.sql`
4. Jana semula bundle jika perlu: `npm run bundle:migrations`

| Migration | Kandungan penting |
|-----------|-------------------|
| 00019 | RLS fleet master (drivers, vehicles) |
| 00020 | RLS status cawangan |
| 00021 | **Stok permulaan** HQ + setiap kiosk |
| 00022 | Staff profil yang hilang |
| 00023 | **Validasi stok POS** + `get_pos_product_availability` |
| 00024 | Kategori Benggali ke Roti Benggali |
| 00025 | RLS baca regions (fix profile) |
| 00026 | **Harga produk** POS |
| 00027-00028 | BOM + stok Roti Kaya (Planta) |
| 00029 | Stok + BOM Kelapa, Kacang, Benggali |
| 00030 | **4 menu POS sahaja** (Kaya, Kacang, Kelapa, Benggali) |

### 1.3 Auth Supabase

Dashboard ke **Authentication** ke **Settings**:

| Tetapan | Nilai |
|---------|-------|
| Site URL | URL production (contoh `https://app.rkj.com`) |
| Redirect URLs | `https://.../auth/callback`, `http://localhost:3000/auth/callback` |
| Enable email signup | **OFF** |

### 1.4 Storage buckets

Cipta dalam Supabase Storage:

- [ ] `delivery-proof` (private)
- [ ] `bank-slips` (private)
- [ ] `receipts` (private)
- [ ] `profile-avatars` (public - gambar profil pengguna)

### 1.5 Cipta login semua pengguna

```bash
npm install
npm run seed:users
```

Kata laluan lalai: **`[REDACTED_TEMP_PASSWORD]`** - **WAJIB tukar** selepas login pertama (rujuk `RESUME.md`).

Senarai penuh: `csv_import/login_users_generated.csv`

### 1.6 Semak sistem

```bash
npm run verify:go-live
```

Semua item **✓** = asas OK. Selesaikan **✗** sebelum go-live 36 cawangan.

### 1.7 Deploy Vercel

- [ ] Connect repo GitHub ke Vercel (root directory: `.`)
- [ ] Set env vars (sama seperti `.env.local`)
- [ ] `npm run build` lulus
- [ ] Deploy production + domain (optional)

### 1.8 Portal Ejen & FPX

- [x] Migration **00076-00080** (ejen, bayaran, resit, profil syarikat)
- [x] UAT automatik: `npm run uat:sales-agent` - `npm run uat:sales-agent:flow`
- [ ] UAT browser: [`UAT_SALES_AGENT.md`](./UAT_SALES_AGENT.md)
- [ ] FPX live (iPay88): [`FPX_LIVE_SETUP.md`](./FPX_LIVE_SETUP.md) - Merchant Code + Key di Vercel
- [ ] Bundle verify: `npm run verify:all`

---

## Fasa 2: Admin HQ - Data & Tetapan

Rujuk juga: [ADMIN_SETUP_GUIDE.md](../ADMIN_SETUP_GUIDE.md)

### 2.1 Semak master data

- [ ] 36 cawangan (Utara / Tengah / Selatan)
- [ ] 4 kategori menu POS + 16 SKU aktif
- [ ] 9 stock items (4 roti + Kaya + Butter + 3 plastik)
- [ ] BOM formula lengkap
- [ ] 5 pemandu + 5 kenderaan

### 2.2 Isi data kosong

- [ ] Email & telefon semua staf
- [ ] No plat lori
- [ ] Threshold stok min/critical (Kaya, Butter, roti, plastik)
- [ ] Semak harga produk ikut HQ

### 2.3 Login penting

| Peranan | Email contoh |
|---------|--------------|
| Super Admin | matisa@rkj.com |
| Admin HQ | norashikin@rkj.com |
| Operation | ibrahim@rkj.com |
| Area Utara | safuan@rkj.com |
| Staf kiosk | s001@rkj.com (ikut cawangan) |
| Pemandu | d001@rkj.com |

---

## Fasa 3: Go-Live Operasi Sebenar (36 cawangan)

**Checklist hari go-live:** [`GO_LIVE_36.md`](./GO_LIVE_36.md)

Semua **36 kiosk** (Utara 12 - Tengah 10 - Selatan 14) operasi POS serentak - **tiada fasa pilot wajib**.

### 3.1 Aliran bekalan stok

```
Kilang ke HQ Distributor ke Fleet Delivery ke Kiosk ke POS Jualan
```

| # | Langkah | Modul | Semak |
|---|---------|-------|-------|
| 1 | Receive stok dari kilang | Warehouse | Baki HQ naik |
| 2 | Buat delivery order (multi-item) | Fleet | Order created |
| 3 | Dispatch ke Complete delivery | Fleet | Stok masuk kiosk |
| 4 | Semak baki kiosk | Inventory / POS bar | Roti, Kaya (kg), Butter (kg), Plastik (pack) |

### 3.2 Ujian POS (setiap cawangan - 36 kiosk)

| # | Langkah | Semak |
|---|---------|-------|
| 1 | Login staf cawangan | Profile + nama cawangan betul |
| 2 | Bar stok - 4 roti + Kaya/Butter/Plastik | Baki > 0 selepas delivery |
| 3 | Buka syif (tunai permulaan) | Syif OPEN |
| 4 | Tab Roti Kaya - tambah ke troli | Harga RM betul, baki stok dipapar |
| 5 | Ulang tab Kacang, Kelapa, Benggali | 4 menu sahaja |
| 6 | Bayar (tunai / QR) | Resit keluar |
| 7 | Baki stok turun | Roti + bahan + plastik ditolak |
| 8 | Cuba jual melebihi stok | Sistem halang + mesej |
| 9 | Tutup syif | Jumlah jualan + tunai |
| 10 | Dashboard HQ | Jualan hari ini kelihatan |

### 3.3 Ujian peranan

- [ ] **SUPER_ADMIN** - semua modul
- [ ] **AREA_MANAGER** - cawangan kawasan sahaja; inventori **1 dropdown** sahaja (tiada ALL/UUID) - rujuk `docs/UAT_AM.md`
- [ ] **STAFF** - POS + inventory kiosk sendiri
- [ ] **DRIVER** - fleet / delivery sendiri
- [ ] **FINANCE** - kutipan & laporan (jika aktif)

---

## Fasa 4: Stabilisasi (minggu pertama)

- [ ] ≥ 30/36 cawangan buka syif setiap hari (hari 1-7)
- [ ] SOP bertulis: buka syif, delivery, tutup syif, hubungi HQ - edarkan ke 36 cawangan
- [ ] Tablet/komputer kiosk - bookmark `https://rkj-one.vercel.app`
- [ ] **Semua** staf & pengurus tukar kata laluan dari `[REDACTED_TEMP_PASSWORD]`
- [ ] Backup Supabase diaktifkan
- [ ] Profil HR staf dilengkapkan (`/profile`)
- [ ] Review mingguan: Mat Isa + 3 AM + Ibrahim

### Pilot 14 hari (optional - tidak dipilih)

Jika perlu rollback ke ujian terhad: [`PILOT_14_UTARA.md`](./PILOT_14_UTARA.md)

---

## Rujukan pantas

| Perintah | Fungsi |
|----------|--------|
| `npm run dev` | Dev local http://localhost:3000 |
| `npm run build` | Semak build production |
| `npm run seed:users` | Cipta login Auth + link profile |
| `npm run verify:go-live` | Semak DB + RPC + data asas |
| `npm run bundle:migrations` | Jana SQL manual 00019-00030 |
| `.\scripts\go-live.ps1` | Automasi penuh (Windows) |

| Dokumen | Kandungan |
|---------|-----------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Vercel + Supabase detail |
| [ADMIN_SETUP_GUIDE.md](../ADMIN_SETUP_GUIDE.md) | Data HQ admin |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Schema penuh |
| `docs/sql/00019_00030_manual_bundle.sql` | SQL paste manual |

---

## Troubleshooting

| Isu | Penyelesaian |
|-----|--------------|
| Profile not found | Jalankan migration 00025 |
| Tiada produk POS | Jalankan 00030; semak status ACTIVE |
| Harga RM 0 | Jalankan 00026 |
| Stok POS kosong | Jalankan 00021 + delivery ke kiosk |
| `get_pos_product_availability` tiada | Jalankan 00023 |
| `db push` gagal | Guna SQL bundle manual |
| Auth redirect loop | Semak Site URL + callback di Supabase |

---

*RKJ One - Roti Kaya Junus - Est. 1975 Teluk Intan*
