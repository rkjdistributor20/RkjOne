# ⏸ Sambung Di Sini — RKJ One ERP

> **🔔 INGATKAN BUKA NANTI:** Password production **sudah diputar** (76 akaun). Buka `csv_import/.go-live-temp-password.txt` untuk login. Seterusnya → UAT AM Safuan · Supabase signup OFF · WhatsApp ke cawangan · hari H buka syif.

> **Buka fail ini bila buka semula projek.** Kemaskini tarikh bila selesai satu fasa.

**Tarikh kemaskini:** 22 Jun 2025 (dashboard owner 3 syarikat)  
**Branch:** `master` · commit terkini **`d8c902b`** (dashboard owner 3 syarikat)
**Production:** https://rkj-one.vercel.app · deploy **`1319f08`**+ (Logistik UI)  
**Supabase:** `mtygxueknokcihofdttl` · migrations **00001–00069**

---

## 🚀 Keputusan operasi

| Item | Keputusan |
|------|-----------|
| Go-live | **Terus 36 cawangan** (tiada pilot wajib) |
| Pilot 14 hari | Optional — [`docs/PILOT_14_UTARA.md`](docs/PILOT_14_UTARA.md) |
| Checklist hari H | [`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md) |
| Delivery 36 | [`docs/GO_LIVE_DELIVERY_36.md`](docs/GO_LIVE_DELIVERY_36.md) · **36/36 stok OK** |

| Kawasan | AM | Email | Cawangan |
|---------|-----|-------|----------|
| Utara | Safuan | safuan@rkj.com | 12 |
| Tengah | Hakim | hakim@rkj.com | 10 |
| Selatan | Yati | yati@rkj.com | 14 |

---

## ✅ Siap sesi ini (22 Jun 2025)

### Commits utama (urutan terkini)

| Commit | Kandungan |
|--------|-----------|
| `4b3ef58` | `npm run go-live:passwords` · eksport kredensial AM · gitignore secrets |
| `8ea6cfe` | Script rotate password · panduan Supabase Auth |
| `ff12ac6` | WhatsApp SOP · GO_LIVE_36 verify ticked |
| `1319f08` | Label UI **Armada → Logistik** |
| `569446b` | Peringatan buka projek — RESUME + cursor rule |
| `94c7076` | Go-live 36 · verify auth & delivery |

### Migration DB (di-push Supabase)

| Migration | Kandungan |
|-----------|-----------|
| **00067** | Jadual `legal_entities` · 3 syarikat |
| **00068** | AM majikan = RKJ Distributor |
| **00069** | Skop syarikat + HQ Distributor |

### Modul / UI / skrip siap

- **Dashboard Owner** — 3 syarikat · aliran Kilang → Distributor → Jualan · jabatan per syarikat
- **Logistik** — sidebar, dashboard, inventori, laporan (bukan Armada)
- **HQ Distributor** — ganti label Gudang HQ
- 3 syarikat undang-undang · profil HR · tetapan staf
- `npm run go-live:passwords` — jana + putar + eksport CSV AM
- `npm run verify:go-live-36` — auth + delivery 36

### Verify automatik (semua lulus terakhir)

| Perintah | Hasil |
|----------|--------|
| `verify:go-live` | **19/19** |
| `verify:production` | **6/6** · commit `1319f08`+ |
| `verify:am` | 12+10+14 · legal entities |
| `verify:go-live-36` | Auth ✓ · Safuan login OK · **36/36 stok** |

> ⚠️ **Jangan** jalankan `npm run verify:login` — boleh reset password ke `RkjOne@2025`.

### Password production (SUDAH DIJALANKAN)

| Item | Lokasi |
|------|--------|
| Kata laluan sementara | `csv_import/.go-live-temp-password.txt` *(local, gitignored)* |
| Eksport email staf/pengurus | `csv_import/go_live_credentials_export.csv` *(gitignored)* |
| Panduan edar AM | [`docs/GO_LIVE_CREDENTIALS_HANDOFF.md`](docs/GO_LIVE_CREDENTIALS_HANDOFF.md) |
| Akaun diputar | **76** · `must_change_password=true` |
| Dilangkau | 4 akaun legacy `@rkjone.com` |

---

## ⚠️ Belum — bila sambung semula

- [ ] **Baca password** — `csv_import/.go-live-temp-password.txt`
- [ ] **UAT AM** — Safuan → Hakim → Yati ([`docs/UAT_AM.md`](docs/UAT_AM.md))
- [ ] **Supabase Auth** — signup OFF ([`docs/SUPABASE_AUTH_SETUP.md`](docs/SUPABASE_AUTH_SETUP.md))
- [ ] **WhatsApp** — [`docs/WHATSAPP_GO_LIVE.txt`](docs/WHATSAPP_GO_LIVE.txt) + edar CSV ke 3 AM
- [ ] **Hari H** — 36 cawangan buka syif · POS · tutup syif ([`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md))

---

## 🔐 Login (selepas go-live:passwords)

| Peranan | Email | Password |
|---------|-------|----------|
| Owner | matisa@rkj.com | dari `.go-live-temp-password.txt` |
| AM | safuan / hakim / yati @rkj.com | sama · login pertama wajib tukar |
| Staf | s001@rkj.com … s057@rkj.com | sama · edar melalui AM |

~~`RkjOne@2025`~~ — **tidak sah** selepas putar password.

---

## 📋 Rujukan pantas

| Item | Lokasi |
|------|--------|
| Hari go-live | `docs/GO_LIVE_36.md` |
| UAT AM | `docs/UAT_AM.md` |
| Auth Supabase | `docs/SUPABASE_AUTH_SETUP.md` |
| WhatsApp cawangan | `docs/WHATSAPP_GO_LIVE.txt` |
| Edar kredensial AM | `docs/GO_LIVE_CREDENTIALS_HANDOFF.md` |
| Verify | `npm run verify:go-live-36` |
| Putar semula password | `npm run go-live:passwords` |

---

## 🔄 Sambung sesi — tanya AI

1. **UAT AM** — Safuan dahulu (Incognito + password dari fail local)
2. **Go-live hari H** — ikut `GO_LIVE_36.md`
3. **Edar WhatsApp + CSV** ke 3 AM

**Jangan commit:** `_restore/` · `csv_import/login_users_generated.csv` · `csv_import/.go-live-temp-password.txt` · `csv_import/go_live_credentials_export.csv`
