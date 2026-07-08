# Go-Live Terus - 36 Cawangan (Operasi Sebenar)

**Keputusan:** Langkau pilot - semua kiosk guna RKJ One **hari go-live yang sama**. 
**URL:** https://rkj.one
**Verify automatik:** `npm run verify:go-live` - `npm run verify:login` - `npm run verify:am`

| Kawasan | AM | Email | Cawangan |
|---------|-----|-------|----------|
| Utara | Safuan | dist009@rkj.com | 12 |
| Tengah | Hakim | dist001@rkj.com | 10 |
| Selatan | Yati | dist010@rkj.com | 14 |
| **Jumlah** | | | **36** |

> **Nota:** Guna `dist009@` / `dist001@` / `dist010@` - bukan safuan/hakim/yati@ (legacy INACTIVE).

---

## Portal Ejen (RKJ Distributor)

- **URL:** `/sales-agent` - `agent001@rkj.com` / `[REDACTED_TEMP_PASSWORD]`
- **UAT browser:** [`docs/UAT_SALES_AGENT.md`](./UAT_SALES_AGENT.md)
- **FPX live:** [`docs/FPX_LIVE_SETUP.md`](./FPX_LIVE_SETUP.md) (selepas merchant iPay88)

---

## Sebelum hari go-live (IT - ~1 jam)

- [x] `npm run verify:go-live-36` - Auth + senarai delivery 36 cawangan *(22 Jun 2025)*
- [x] `npm run verify:go-live` - **19/19** lulus
- [x] `npm run verify:login` - **13/13** lulus
- [x] `npm run verify:production` - deploy terkini
- [x] `npm run uat:am` - 3 AM dist009/001/010
- [x] `npm run uat:sales-agent` - portal ejen + resit
- [ ] `npm run verify:all` - bundle penuh sebelum hari H
- [ ] Supabase Auth - **signup OFF**, Site URL = `https://rkj.one` *(verify automatik: signup blocked ✓ - semak manual Dashboard)*
- [ ] Redirect: `https://rkj.one/auth/callback`
- [ ] Backup Supabase diaktifkan (Dashboard ke Settings ke Database)
- [ ] Panduan Auth: [`docs/SUPABASE_AUTH_SETUP.md`](./SUPABASE_AUTH_SETUP.md)

---

## Hari go-live - pagi (HQ + kilang)

### Mat Isa / Admin HQ

- [ ] Umumkan URL & SOP ringkas ke 3 AM + semua cawangan (WhatsApp)
- [ ] Semak dashboard HQ - 36 cawangan aktif

### Ibrahim (Operasi) + HQ Distributor

- [ ] Delivery order / logistik - **stok ke 36 kiosk** (minimum: 4 roti + Kaya + Butter + plastik)
- [ ] Pastikan setiap kiosk ada baki > 0 sebelum staf buka syif

### Muhammad (Kilang)

- [ ] Production order ikut permintaan hari go-live

### 3 Area Manager (serentak)

| AM | Semak |
|----|--------|
| Safuan | 12 cawangan - staf login, inventori kiosk, jadual syif |
| Hakim | 10 cawangan - sama |
| Yati | 14 cawangan - sama |

---

## Hari go-live - setiap cawangan (staf kiosk)

1. [ ] Buka **https://rkj.one/login** (bookmark tablet/PC)
2. [ ] Login `sxxx@rkj.com` / kata laluan (tukar jika diminta)
3. [ ] **Inventori** - semak baki stok selepas delivery
4. [ ] **POS** - buka syif (tunai permulaan)
5. [ ] Jual minimum 1 transaksi setiap menu (Kaya, Kacang, Kelapa, Benggali) - ujian hari pertama
6. [ ] Tutup syif petang - jumlah jualan & tunai

---

## Hari go-live - petang (review)

- [ ] **Safuan, Hakim, Yati** - dashboard AM: KPI jualan harian per cawangan
- [ ] **Mat Isa** - dashboard HQ: jualan 36 cawangan
- [ ] Senarai cawangan yang **belum** buka syif / login gagal / stok kosong ke esok pagi follow-up
- [ ] Semua pengurus & staf **tukar kata laluan** dari `[REDACTED_TEMP_PASSWORD]`

---

## SOP ringkas (1 muka surat - edarkan ke cawangan)

```
1. Login ke POS ke Buka Syif
2. Jual 4 menu roti (tunai / QR)
3. Tutup Syif - kira tunai
4. Masalah: hubungi AM kawasan ke HQ Operasi
5. URL: https://rkj.one
```

---

## Kriteria “go-live berjaya” (hari 1)

- [ ] ≥ **30/36** cawangan buka & tutup syif
- [ ] ≥ **30/36** ada sekurang-kurangnya 1 transaksi POS
- [ ] Tiada isu kritikal: harga RM0, stok negative tanpa sebab, login mass failure
- [ ] 3 AM boleh akses Inventori Kawasan (bukan UI HQ)

---

## Minggu pertama (36 cawangan)

- [ ] Staf lengkapkan profil HR (`/profile`) - IC, alamat, kecemasan
- [ ] AM terbitkan jadual staf mingguan (Syif ke Jadual Mingguan)
- [ ] HQ pantau delivery harian ke kiosk
- [ ] Owner review laporan jualan harian / mingguan

---

## Jika ada isu

| Isu | Tindakan |
|-----|----------|
| Staf tidak boleh login | AM reset password (Tetapan ke Staf) |
| Stok kosong | HQ delivery ke kiosk tersebut |
| POS halang jualan | Semak baki inventori kiosk |
| AM nampak UI HQ | Logout ke Incognito ke login semula |

---

## Rujukan

- Setup teknikal penuh: [`GO_LIVE_CHECKLIST.md`](./GO_LIVE_CHECKLIST.md)
- UAT AM (optional pantas): [`UAT_AM.md`](./UAT_AM.md)
- Pilot 14 hari (optional - **tidak dipilih**): [`PILOT_14_UTARA.md`](./PILOT_14_UTARA.md)

---

*RKJ One - Roti Kaya Junus - 36 cawangan - satu sistem - tiga syarikat - pemilik sama*
