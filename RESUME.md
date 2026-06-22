# ⏸ Sambung Di Sini — RKJ One ERP

> **Buka fail ini bila buka semula projek.** Kemaskini tarikh bila selesai satu fasa.

**Tarikh kemaskini:** 22 Jun 2025 (dashboard AM AI, jadual staf, kredensial portal, backfill 54 staf)  
**Branch:** `master` (sync GitHub + Vercel)  
**Status LIVE:** https://rkj-one.vercel.app  
**Supabase:** `mtygxueknokcihofdttl` · migration sehingga **00064**

---

## ✅ Sudah siap (sesi terkini)

| Commit | Kandungan |
|--------|-----------|
| `00ec2a6` | Skrip `backfill:staff-credentials` + gitignore CSV |
| `966522a` | AM urus staf — auto login, edit, semak kredensial |
| `26e893e` | Fix roster RLS + timezone tarikh MY |
| `375d0b5` | Dashboard AM AI + jadual mingguan staf + reminder |
| `c92d5c7` | Inventori AM — satu URL `/inventory` server split |

### Modul AM siap
- **Dashboard** — AI insight, jualan h/m/b per cawangan, KPI syif & kehadiran
- **Jadual staf** — Syif → Jadual Mingguan, terbit sebelum Ahad, reminder harian
- **Tetapan staf** — tambah/edit, auto username `sxxx@rkj.com`, semak password
- **Inventori Kawasan** — kiosk sahaja, 1 dropdown
- **Backfill** — 54 staf aktif ada kredensial (`npm run backfill:staff-credentials`)

### Verify (automatik)
- `npm run verify:go-live` — **17/17** ✓
- `npm run verify:am` — **lulus** ✓
- `npm run verify:production` — **6/6** ✓
- `npm run verify:roster` — migration + RPC ✓

---

## ⚠️ Belum — WAJIB sebelum 36 cawangan

### A. Manual IT (~30 min)
- [ ] Supabase Auth — signup OFF, Site URL production
- [ ] Tukar kata laluan dari `RkjOne@2025`
- [ ] `npm run build` lulus

### B. UAT manual AM
- [ ] Safuan → Hakim → Yati ikut **`docs/UAT_AM.md`** (~15 min/orang)
- [ ] Hard refresh / Incognito — pastikan **Inventori Kawasan** bukan UI HQ

### C. Pilot 14 hari (3 cawangan)
Gombak · Dengkil Utara · Simpang Pulai Utara — `docs/GO_LIVE_CHECKLIST.md` Fasa 3

---

## 🔐 Akaun ujian

| Peranan | Email | Password |
|---------|-------|----------|
| AM Utara | safuan@rkj.com | RkjOne@2025 |
| AM Tengah | hakim@rkj.com | RkjOne@2025 |
| AM Selatan | yati@rkj.com | RkjOne@2025 |
| Staf contoh | s001@rkj.com | RkjOne@2025 |

---

## 📋 Prioriti bila sambung

1. **UAT manual AM** — `docs/UAT_AM.md`
2. **Supabase Auth** (A)
3. **Pilot 3 cawangan**
4. Rollout 36 cawangan

---

## Rujukan

| Item | Lokasi |
|------|--------|
| UAT AM | `docs/UAT_AM.md` |
| Go-live | `docs/GO_LIVE_CHECKLIST.md` |
| Kredensial staf (local) | `csv_import/staff_credentials_backfill.csv` |
