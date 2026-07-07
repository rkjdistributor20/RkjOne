# ⏸ Sambung Di Sini — RKJ One ERP

## Update terbaru - 2026-07-07 17:16 MYT

- Commit kod terbaru: `3d2a663` (`feat: add workflow governance cockpit`)
- AI Proactive Cockpit kini ada SLA, exception flow, approval matrix dan audit bukti kerja untuk Owner/Admin, HQ Distributor, Driver, OM, AM, Staf Jualan, HR, Finance dan Ejen.
- Halaman Kelulusan dinaik taraf menjadi **Approval & Exception Center** dengan umur permintaan, SLA, owner tindakan, bukti wajib dan eskalasi.
- Label `POS_SHIFT_STAFF` kini dipaparkan sebagai `Staf Dalam Syif POS`, bukan kod teknikal.
- Semakan lulus: `npx tsc --noEmit --pretty false`, targeted ESLint, `npm run verify:ui-polish`, `npm run build`, `npm run verify:production`.
- Fail local/sensitif yang masih tidak dipush: `outputs/`, `scripts/reset-owner-password.mjs`, serta perubahan lama pada `components/auth/login-form.tsx` dan `package.json`.

---

> **🔔 REHAT — 6 Jul 2026 · Semua disimpan (GitHub + Vercel + Supabase)**

## Update terbaru - 2026-07-07 16:15 MYT

- Commit terbaru: `525b87d` (`feat: clarify role workflow cockpit`)
- Dashboard role dinaik taraf untuk jelaskan hubungan kerja HQ Distributor, Driver, OM, AM, Staf Jualan dan Ejen.
- AI Proactive Cockpit kini ada laluan kerja utama, ritma kerja harian, signal hari ini dan hubungan handoff antara role.
- Semakan lulus: `npx tsc --noEmit --pretty false`, targeted ESLint, `npm run verify:ui-polish`, `npm run build`.
- Nota: fail credential/output sensitif masih local dan tidak dipush.

**Branch:** `master`  
**GitHub:** `d2538f6` · kod `400941e` + checkpoint rehat  
**Production:** https://rkj-one.vercel.app · deploy **`dpl_9hkEfehyzVgdRz1CPGWmQBER35Wc`** ✓  
**Supabase:** `mtygxueknokcihofdttl` · migrations **00001–00111** applied

---

# Codex Resume - 2026-07-07 15:17 MYT

Status terbaru selepas sambung kerja:

- GitHub master: `f0ec65c` (`test: harden role and agent UAT login`)
- `npm run verify:login` lulus 14/14; akaun aktif utama setiap peranan boleh login.
- `npm run uat:sales-agent` lulus; Ejen Khas Muhammad `mfg010@rkj.com` berjaya login dan akses Portal Ejen/POS.
- `npm run verify:all` lulus 6/6: readiness, production, AM, sales agent, payroll dan go-live 36.
- Skrip UAT kini baca password go-live dari fail temp lokal baris pertama sahaja, tanpa simpan password dalam checkpoint.
- Skrip UAT Portal Ejen kini guna cookie Supabase SSR `base64url`, jadi API yang sebelum ini redirect 307 kini lulus.
- Folder `outputs/` masih local dan tidak dipush.

Sambung seterusnya: teruskan UAT browser/manual atau kerja dashboard baharu tanpa perlu ulang pembaikan login ejen.

---

## ✅ Siap (Codex + Cursor)

| Modul | Status |
|-------|--------|
| POS SOP (stok, presence, delivery, AI estimate) | ✓ live |
| AM governance (cash collection, vouchers, operations) | ✓ live |
| Bilingual BM/EN + legacy translation bridge | ✓ |
| Redesign visual global (shell, KPI, login, POS) | ✓ live |
| UI polish — tiada UUID/ID mentah di UI | ✓ `verify:ui-polish` |
| **Payroll Studio 3 syarikat** | ✓ |
| **Production Readiness Center** (Tetapan → Kesihatan Sistem) | ✓ 10 skor · `verify:readiness` 14/14 |
| Portal Ejen — mod pilot bayaran | ✓ |
| Mobile/PWA + Capacitor shell | ✓ `mobile:readiness` 54/54 |
| **HRMIS self-service pekerja** (cuti, profil, dokumen) | ✓ UAT automatik lulus |
| **Baki cuti pekerja** | ✓ migration leave balances |
| **UAT automatik penuh** | ✓ `verify:all` 6/6 · `uat:full` · `uat:sales-agent:flow` · `mobile:readiness` 54/54 |

---

## 🚀 Perintah pantas

```powershell
npm run verify:readiness      # 10 kawasan go-live
npm run verify:all            # bundle production
npm run verify:ui-polish      # guardrail UI/UUID
npm run verify:hr             # modul HR
npm run verify:payroll        # payroll 3 syarikat
npm run uat:full              # HR + HRMIS + payroll API + AM + ejen
npm run uat:sales-agent:flow  # order + bayaran + POS langganan
npm run uat:am                # 3 AM
npm run mobile:readiness      # Play/App store checklist
npm run db:push               # migrations (00111+)
```

---

## 📋 Manual belum siap

- [ ] UAT browser **semua dashboard** selepas redesign visual
- [ ] UAT browser manual — [`docs/UAT_SALES_AGENT.md`](docs/UAT_SALES_AGENT.md) · [`docs/UAT_AM.md`](docs/UAT_AM.md)
- [ ] FPX live — Merchant Code iPay88 di Vercel
- [ ] Supabase Auth signup OFF
- [ ] Hari H 36 cawangan — [`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md)
- [ ] Reconnect Gmail (D-U-N-S monitoring)

---

## 📚 Dokumentasi

| Topik | Fail |
|-------|------|
| Go-live readiness | [`docs/PRODUCTION_READINESS_PLAYBOOK.md`](docs/PRODUCTION_READINESS_PLAYBOOK.md) |
| System health UAT | [`docs/SYSTEM_HEALTH_AND_UAT.md`](docs/SYSTEM_HEALTH_AND_UAT.md) |
| Bilingual | [`docs/BILINGUAL_SYSTEM_GUIDE.md`](docs/BILINGUAL_SYSTEM_GUIDE.md) |
| Mobile release | [`docs/MOBILE_APP_RELEASE.md`](docs/MOBILE_APP_RELEASE.md) |
| FPX ejen | [`docs/FPX_LIVE_SETUP.md`](docs/FPX_LIVE_SETUP.md) |

---

## 🔑 Login rujukan

| Peranan | Email | Nota |
|---------|-------|------|
| Owner | matisa@rkj.com | Pentadbir Utama |
| Ejen UAT | agent001@rkj.com | Portal Ejen |
| AM Utara/Tengah/Selatan | dist009@ / dist001@ / dist010@ | 12/10/14 kiosk |
| Kata laluan UAT | `RkjOne@2026` | Tukar selepas go-live |

---

## 🏢 Profil syarikat (bank resit)

| Kod | Bank |
|-----|------|
| RKJ_DIST | Maybank 564856315018 |
| RKJ_MFG | Maybank 564427518660 |
| RKJ | CIMB 8606268175 |

---

## 🔄 Codex ↔ Cursor

Cursor **tidak** sync chat automatik dengan Codex. Continuity melalui:
- Fail ini (`RESUME.md`)
- `CHECKPOINT.json`
- Git commits di GitHub

**Bila buka di Codex atau Cursor:** taip **sambung** — baca bahagian atas fail ini + jalankan `npm run verify:readiness`.

---

## 😴 Rehat — apa sudah disimpan

| Connection | Status |
|------------|--------|
| **GitHub** | `d2538f6` on `master` — https://github.com/rkjdistributor20/RkjOne |
| **Vercel** | Live — https://rkj-one.vercel.app · `dpl_9hkEfehyzVgdRz1CPGWmQBER35Wc` |
| **Supabase** | `mtygxueknokcihofdttl` · migrations **00111** applied |
| **Codex ↔ Cursor** | Sync melalui Git + `RESUME.md` + `CHECKPOINT.json` (bukan chat) |

**Tidak di-commit (sengaja):** `_restore/`, `outputs/`, credential CSV.

---

*Sejarah checkpoint lama: lihat `CHECKPOINT.json` → `last_work` · `RESUME_2026-06-29_DRIVER_PRODUCTION.md`*
# Codex Resume - 2026-07-07 14:01 MYT

Semua connection utama sudah disemak dan disimpan untuk sambung kerja selepas rehat.

- Production URL: https://rkj-one.vercel.app
- Vercel live deployment: `dpl_5mf7Bgh9BwdJk8p7CeLW23MxLQPU` - status Ready
- GitHub master/code checkpoint: `8e39e76`
- Production verification: `npm run verify:production` lulus 6/6
- Supabase: project `mtygxueknokcihofdttl`, migrations 00001-00111 applied, health check ready melalui production
- Credential CSV, restore folder dan reviewer-account output dilindungi dalam `.gitignore`; jangan push fail sensitif.
- Folder `outputs/` masih local sebagai laporan/build artifact dan perlu disemak sebelum commit kerana ada fail release/credential.

---
