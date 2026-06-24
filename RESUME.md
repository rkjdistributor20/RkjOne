# ⏸ Sambung Di Sini — RKJ One ERP

> **🔔 CHECKPOINT — Portal Ejen + Resit Rasmi + Profil Syarikat LIVE**

**Tarikh save:** 21 Jun 2026  
**Branch:** `master` · commit **`b2404db`** (pushed ✓)  
**Production:** https://rkj-one.vercel.app  
**Supabase:** `mtygxueknokcihofdttl` · migrations **00001–00080** ✓

---

## ✅ Status Go-Live

| Semakan | Hasil |
|---------|--------|
| `verify:production` | **6/6** |
| `verify:payroll` | **14/14** · **89 payslip** dihantar |
| `verify:am` | **Lulus** · 3 AM aktif |
| `uat:sales-agent` | **Lulus** · agent001 · order + resit + kilang |
| `uat:sales-agent --flow-pos` | **Lulus** · cawangan POS + RM150 + resit Maybank |
| Email staf | `{staffcode}@rkj.com` |
| Kata laluan | **`RkjOne@2026`** (94 auth users) |

---

## 🏪 Portal Ejen Jualan (RKJ Distributor)

- **URL:** `/sales-agent` · peranan **Ejen Jualan** (`SALES_AGENT`)
- **Ejen UAT:** `agent001@rkj.com` / `RkjOne@2026` · syarikat **Nur Aisha**
- **Order stok** → bayar → **resit rasmi AR-xxxxx** → hantar automatik ke kilang
- **POS cawangan ejen:** langganan **RM150/bulan** → resit → akses `/pos`
- **Profil syarikat:** Tetapan → **Syarikat** (3 entiti · SSM · bank)
- **Payment UAT:** `SALES_AGENT_PAYMENT_MODE=simulate` (default)
- **Payment live:** set `SALES_AGENT_PAYMENT_MODE=live` + merchant keys di Vercel

**Cipta ejen baru:** Tetapan → Pengguna → **Ejen Jualan** · syarikat **RKJ_DIST**  
**Paut semula akaun:** `npm run provision:sales-agent`

---

## 🏢 Profil Syarikat (legal_entities)

| Kod | Syarikat | Bank |
|-----|----------|------|
| RKJ_DIST | RKJ Distributor Sdn Bhd | Maybank · 564856315018 |
| RKJ_MFG | Roti Kaya Junus Manufacturing Sdn Bhd | Maybank · 564427518660 |
| RKJ | Roti Kaya Junus | CIMB · 8606268175 |

Alamat: NO. 233A, Jalan Industri 5, Taman Industri Anson, 36000 Teluk Intan, Perak

---

## 🔐 Login Pantas

| Peranan | Email | Password |
|---------|-------|----------|
| Owner | matisa@rkj.com | RkjOne@2026 |
| **Ejen UAT** | **agent001@rkj.com** | **RkjOne@2026** |
| HR | dist006@rkj.com | RkjOne@2026 |
| AM Utara | dist009@rkj.com | RkjOne@2026 |
| AM Tengah | dist001@rkj.com | RkjOne@2026 |
| AM Selatan | dist010@rkj.com | RkjOne@2026 |
| Staf kiosk | s001@rkj.com | RkjOne@2026 |

---

## 🚀 Perintah Verify / UAT

```powershell
npm run verify:production
npm run verify:payroll
npm run verify:am
npm run uat:sales-agent
npm run uat:sales-agent:flow          # order + bayar + resit + POS
node scripts/uat-sales-agent.mjs --flow-pos   # POS sahaja
npm run provision:sales-agent           # paut akaun ejen ke SALES_AGENT
```

---

## ⚠️ Belum (manual / seterusnya)

- [ ] **UAT browser ejen** — agent001 → order → resit cetak → POS cawangan
- [ ] **UAT browser AM** — [`docs/UAT_AM.md`](docs/UAT_AM.md)
- [ ] **FPX live** — merchant ID + API key iPay88/Billplz di Vercel
- [ ] **Supabase Auth** — signup OFF
- [ ] **Hari H 36 cawangan** — [`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md)

---

## Commits utama (sesi ejen)

| Commit | Ringkasan |
|--------|-----------|
| `7cdbdd9` | Portal ejen asas |
| `f972eed` | Harga katalog + provision script |
| `a856467` | RLS pembayaran ejen |
| `06168b1` | Aliran bayar + resit AR |
| `b2404db` | Profil syarikat 3 entiti |

---

## 🔄 Sambung — pilih satu

1. **UAT browser ejen** — agent001 → `/sales-agent` → order + resit + POS
2. **FPX live** — sediakan merchant gateway RKJ Distributor
3. **UAT AM / Hari H** — checklist sedia ada

**Production:** https://rkj-one.vercel.app
