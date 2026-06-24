# ⏸ Sambung Di Sini — RKJ One ERP

> **🔔 CHECKPOINT — Ejen Bayar (Pilot + Live iPay88) · Rehat 24 Jun 2026**

**Tarikh save:** 24 Jun 2026  
**Branch:** `master` · commit **`a790def`**  
**Production:** https://rkj-one.vercel.app · deploy **`a790def`** ✓  
**Supabase:** `mtygxueknokcihofdttl` · migrations **00001–00081** ✓

---

## ✅ Siap setakat ini

| Modul | Status |
|-------|--------|
| Portal Ejen (order → bayar → resit AR → kilang) | ✓ |
| Langganan POS RM150/bulan + tamat tempoh auto | ✓ |
| Profil syarikat 3 entiti + bank (00080) | ✓ |
| iPay88 live wiring + webhook + payment-return | ✓ |
| **Mod pilot** (iPay88 belum set → bayar ujian OK) | ✓ `a790def` |
| UAT automatik `uat:sales-agent` + `:flow` | ✓ lulus |
| AM 36 cawangan + verify:all | ✓ |

---

## 🏪 Portal Ejen — bayaran

- **Login UAT:** `agent001@rkj.com` / `RkjOne@2026`
- **Mod pilot (sekarang):** tiada Merchant Code iPay88 → bayar disahkan dalam sistem, banner kuning di portal
- **Mod live (bila ready):** set di Vercel → FPX/kad → Maybank RKJ Distributor → pengesahan bank wajib
- **Docs:** [`docs/UAT_SALES_AGENT.md`](docs/UAT_SALES_AGENT.md) · [`docs/FPX_LIVE_SETUP.md`](docs/FPX_LIVE_SETUP.md)

```powershell
# UAT automatik
npm run uat:sales-agent
npm run uat:sales-agent:flow
npm run verify:all
```

---

## 👥 Area Manager (36 cawangan)

- **dist009@** Utara 12 · **dist001@** Tengah 10 · **dist010@** Selatan 14 · `RkjOne@2026`
- **Checklist:** [`docs/UAT_AM.md`](docs/UAT_AM.md)
- **Hari H:** [`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md)

---

## 🏢 Profil syarikat

| Kod | Bank |
|-----|------|
| RKJ_DIST | Maybank 564856315018 |
| RKJ_MFG | Maybank 564427518660 |
| RKJ | CIMB 8606268175 |

**Tetapan → Syarikat** (admin `matisa@rkj.com`)

---

## ⚠️ Bila sambung — manual

- [ ] UAT browser ejen — hard refresh → order + bayar → resit AR
- [ ] UAT browser AM (3 orang)
- [ ] **FPX live** — Merchant Code + Key iPay88 di Vercel
- [ ] Supabase Auth signup OFF (semak manual)
- [ ] Hari H 36 cawangan — [`GO_LIVE_36.md`](docs/GO_LIVE_36.md)

---

## 📦 Commit terkini (sesi ini)

```
a790def fix: allow agent payments in pilot mode when iPay88 not configured
69ebb7c fix: UAT agent payment fallback when iPay88 not configured
f8f9ec7 feat: require bank confirmation for agent payments and monthly POS expiry
8b378c2 feat: iPay88 live checkout, verify:all bundle, go-live docs
```

**Production:** https://rkj-one.vercel.app
