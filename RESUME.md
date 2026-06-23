# ⏸ Sambung Di Sini — RKJ One ERP

> **🔔 INGATKAN BUKA NANTI:** Dashboard owner 3 syarikat LIVE. Mat Isa guna **password baharu sendiri**. AM UAT → password dari `.go-live-temp-password.txt` · `npm run reset:am-uat` jika perlu.

> **Buka fail ini bila buka semula projek.** Kemaskini tarikh bila selesai satu fasa.

**Tarikh kemaskini:** 23 Jun 2025 (sesi tamat — save checkpoint)  
**Branch:** `master` · commit terkini **`053b36a`**  
**Production:** https://rkj-one.vercel.app · deploy **`e8fe2be`**+ ✓  
**Supabase:** `mtygxueknokcihofdttl` · migrations **00001–00069**

---

## 🚀 Keputusan operasi

| Item | Keputusan |
|------|-----------|
| Go-live | **Terus 36 cawangan** (tiada pilot wajib) |
| Checklist hari H | [`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md) |
| Delivery 36 | **36/36 stok OK** |

| Kawasan | AM | Email | Cawangan |
|---------|-----|-------|----------|
| Utara | Safuan | safuan@rkj.com | 12 |
| Tengah | Hakim | hakim@rkj.com | 10 |
| Selatan | Yati | yati@rkj.com | 14 |

---

## ✅ Siap (kumulatif sesi)

### Commits terkini

| Commit | Kandungan |
|--------|-----------|
| `053b36a` | `npm run reset:am-uat` — reset password AM dari fail go-live |
| `e8fe2be` | Logo RKJ dikongsi — 3 syarikat (dashboard + profil HR) |
| `d8c902b` | Dashboard owner — 3 syarikat · aliran kerja · jabatan |
| `4b3ef58` | `go-live:passwords` · eksport kredensial AM |
| `1319f08` | Label UI **Armada → Logistik** |
| `00067–69` | 3 syarikat undang-undang · AM RKJ Distributor · HQ Distributor |

### UI / skrip siap

- **Dashboard Owner** — Manufacturing → Distributor → Retail · logo RKJ sama · jabatan
- **Logistik** · **HQ Distributor** · profil HR 3 syarikat
- `npm run go-live:passwords` · `npm run reset:am-uat` · `npm run verify:go-live-36`

### Verify (23 Jun 2025)

| Perintah | Hasil |
|----------|--------|
| `verify:production` | **6/6** |
| `verify:go-live-36` | Auth ✓ · Safuan OK · **36/36 stok** |
| `verify:go-live` | **19/19** |
| `verify:am` | 12+10+14 cawangan |

---

## 🔐 Login

| Peranan | Email | Password |
|---------|-------|----------|
| **Owner (Mat Isa)** | matisa@rkj.com | **Password baharu sendiri** *(sudah tukar pada login pertama)* |
| **AM UAT** | safuan / hakim / yati @rkj.com | `csv_import/.go-live-temp-password.txt` → wajib tukar |
| **Staf kiosk** | s001@ … s057@rkj.com | sama (edar melalui AM) |

Reset AM jika login gagal: `npm run reset:am-uat`

---

## ⚠️ Belum — bila sambung

- [ ] **UAT AM** — Safuan → Hakim → Yati ([`docs/UAT_AM.md`](docs/UAT_AM.md))
- [ ] **Supabase Auth** — signup OFF ([`docs/SUPABASE_AUTH_SETUP.md`](docs/SUPABASE_AUTH_SETUP.md))
- [ ] **WhatsApp** — [`docs/WHATSAPP_GO_LIVE.txt`](docs/WHATSAPP_GO_LIVE.txt) + CSV ke 3 AM
- [ ] **Hari H** — 36 cawangan buka syif ([`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md))

---

## 📋 Rujukan pantas

| Item | Lokasi |
|------|--------|
| UAT AM | `docs/UAT_AM.md` |
| Hari go-live | `docs/GO_LIVE_36.md` |
| Password AM | `npm run reset:am-uat` |
| Verify | `npm run verify:go-live-36` |
| Kredensial local | `csv_import/.go-live-temp-password.txt` *(jangan commit)* |

---

## 🔄 Sambung sesi

Kata **"sambung"** → AI baca fail ini · teruskan **UAT Safuan** atau **go-live hari H**.

**Jangan commit:** `_restore/` · `login_users_generated.csv` · fail password/kredensial gitignored
