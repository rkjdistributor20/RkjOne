# ⏸ Sambung Di Sini — RKJ One ERP

> **🔔 CHECKPOINT — Go-Live Bundle Siap (Ejen + AM + 36 Cawangan)**

**Tarikh save:** 21 Jun 2026  
**Branch:** `master`  
**Production:** https://rkj-one.vercel.app  
**Supabase:** `mtygxueknokcihofdttl` · migrations **00001–00080** ✓

---

## ✅ Verify automatik (production)

| Perintah | Status |
|----------|--------|
| `npm run verify:production` | **6/6** |
| `npm run uat:am` | **3/3 AM** lulus |
| `npm run uat:sales-agent` | **Lulus** · profil + POS |
| `npm run uat:sales-agent:flow` | Order + resit + kilang + POS |
| `npm run verify:all` | Bundle production |

---

## 🏪 Portal Ejen

- **Login UAT:** `agent001@rkj.com` / `RkjOne@2026`
- **Browser checklist:** [`docs/UAT_SALES_AGENT.md`](docs/UAT_SALES_AGENT.md)
- **FPX live (iPay88):** [`docs/FPX_LIVE_SETUP.md`](docs/FPX_LIVE_SETUP.md)
- **Simulate (default):** `SALES_AGENT_PAYMENT_MODE=simulate`

---

## 👥 Area Manager (36 cawangan)

- **dist009@** Utara 12 · **dist001@** Tengah 10 · **dist010@** Selatan 14
- **Checklist:** [`docs/UAT_AM.md`](docs/UAT_AM.md)
- **Hari H:** [`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md)

---

## 🏢 Profil syarikat (3 entiti)

| Kod | Bank |
|-----|------|
| RKJ_DIST | Maybank 564856315018 |
| RKJ_MFG | Maybank 564427518660 |
| RKJ | CIMB 8606268175 |

**Tetapan → Syarikat** (admin)

---

## 🚀 Perintah pantas

```powershell
npm run verify:all              # bundle penuh
npm run uat:sales-agent:flow    # ejen order + POS
npm run uat:am                  # 3 AM
npm run verify:login            # semua peranan (+ agent001)
```

---

## ⚠️ Manual sebelum Hari H

- [ ] UAT browser ejen — [`UAT_SALES_AGENT.md`](docs/UAT_SALES_AGENT.md)
- [ ] UAT browser AM — [`UAT_AM.md`](docs/UAT_AM.md)
- [ ] Supabase Auth signup OFF
- [ ] FPX live — isi Merchant Code iPay88 di Vercel
- [ ] 36 cawangan buka syif — [`GO_LIVE_36.md`](docs/GO_LIVE_36.md)

**Production:** https://rkj-one.vercel.app
