# ⏸ Sambung Di Sini - RKJ One ERP

> **🔔 REHAT — 5 Jul 2026 · Baca bahagian ini bila buka projek semula**

## ⚠️ INGATKAN BILA SAMBUNG (prioriti)

1. **Backup Git belum lengkap** — ~648 fail tempatan belum commit; GitHub masih `46e3347`.  
   → Tanya: *"commit & push semua ke GitHub"* (~5–15 min, skip build Android/iOS).

2. **Production live** — https://rkj-one.vercel.app (deploy terkini: `dpl_FkPHYqBiRczGcQZM2cwCjmyAtaoN`).

3. **Supabase** — migrations **00001–00109** (semak `db:push` jika perlu).

4. **Manual belum siap:**
   - UAT browser ejen (`agent001@rkj.com`) — order + bayar mod pilot
   - UAT browser AM — dist009@ / dist001@ / dist010@
   - FPX live — Merchant Code iPay88 di Vercel
   - Supabase Auth signup OFF
   - Hari H 36 cawangan — `docs/GO_LIVE_36.md`

5. **Gmail** — token expired; reconnect sebelum monitor D-U-N-S.

**Perintah pantas:** `npm run verify:production` · `npm run verify:all` · baca `CHECKPOINT.json`

---

> **CHECKPOINT — Ejen Bayar (Pilot + Live iPay88)**

**Tarikh save:** 25 Jun 2026
**Branch:** `master` - commit **`46e3347`**
**Production:** https://rkj-one.vercel.app - deploy **`46e3347`** ✓
**Verify:** `npm run verify:all` ke **4/4** lulus (25 Jun 2026)
**Supabase:** `mtygxueknokcihofdttl` - migrations **00001-00081** ✓

---

## ✅ Siap setakat ini

| Modul | Status |
|-------|--------|
| Portal Ejen (order ke bayar ke resit AR ke kilang) | ✓ |
| Langganan POS RM150/bulan + tamat tempoh auto | ✓ |
| Profil syarikat 3 entiti + bank (00080) | ✓ |
| iPay88 live wiring + webhook + payment-return | ✓ |
| **Mod pilot** (iPay88 belum set ke bayar ujian OK) | ✓ `a790def` |
| UAT automatik `uat:sales-agent` + `:flow` | ✓ lulus |
| AM 36 cawangan + verify:all | ✓ |

---

## 🏪 Portal Ejen - bayaran

- **Login UAT:** `agent001@rkj.com` / `[REDACTED_TEMP_PASSWORD]`
- **Mod pilot (sekarang):** tiada Merchant Code iPay88 ke bayar disahkan dalam sistem, banner kuning di portal
- **Mod live (bila ready):** set di Vercel ke FPX/kad ke Maybank RKJ Distributor ke pengesahan bank wajib
- **Docs:** [`docs/UAT_SALES_AGENT.md`](docs/UAT_SALES_AGENT.md) - [`docs/FPX_LIVE_SETUP.md`](docs/FPX_LIVE_SETUP.md)

```powershell
# UAT automatik
npm run uat:sales-agent
npm run uat:sales-agent:flow
npm run verify:all
```

---

## 👥 Area Manager (36 cawangan)

- **dist009@** Utara 12 - **dist001@** Tengah 10 - **dist010@** Selatan 14 - `[REDACTED_TEMP_PASSWORD]`
- **Checklist:** [`docs/UAT_AM.md`](docs/UAT_AM.md)
- **Hari H:** [`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md)

---

## 🏢 Profil syarikat

| Kod | Bank |
|-----|------|
| RKJ_DIST | Maybank 564856315018 |
| RKJ_MFG | Maybank 564427518660 |
| RKJ | CIMB 8606268175 |

**Tetapan ke Syarikat** (admin `matisa@rkj.com`)

---

## ⚠️ Bila sambung - manual

- [ ] UAT browser ejen - hard refresh ke order + bayar ke resit AR
- [ ] UAT browser AM (3 orang)
- [ ] **FPX live** - Merchant Code + Key iPay88 di Vercel
- [ ] Supabase Auth signup OFF (semak manual)
- [ ] Hari H 36 cawangan - [`GO_LIVE_36.md`](docs/GO_LIVE_36.md)

---

## 📦 Commit terkini (sesi ini)

```
a790def fix: allow agent payments in pilot mode when iPay88 not configured
69ebb7c fix: UAT agent payment fallback when iPay88 not configured
f8f9ec7 feat: require bank confirmation for agent payments and monthly POS expiry
8b378c2 feat: iPay88 live checkout, verify:all bundle, go-live docs
```

**Production:** https://rkj-one.vercel.app
# CHECKPOINT TERKINI - 2026-07-01 01:54 MYT

## Kerja terakhir sebelum rehat

- Dokumen cawangan sudah dipindahkan ke dashboard `Cawangan`, dalam seksyen `Profil & Dokumen Cawangan`.
- Dalam profile setiap cawangan, pengguna boleh `View`, `Download`, `Tambah Dokumen`, `Edit`, dan `Arkib/Delete` dokumen cawangan.
- Preview dokumen sudah ditukar kepada viewer dalaman yang fetch fail sebagai blob/object URL, supaya tidak lagi keluar isu `rkj-one.vercel.app refused to connect`.
- Endpoint dokumen kini stream fail dari Supabase Storage melalui app dengan header `inline`/`attachment` yang sesuai.
- Akses dokumen cawangan diselaraskan untuk Pentadbir, OM, AM dan Branch Manager mengikut skop cawangan.
- Semakan `npx tsc --noEmit --pretty false` lulus.

## Fail utama yang disentuh

- `components/branches/branches-dashboard.tsx`
- `components/shared/document-preview-dialog.tsx`
- `app/api/branches/[id]/operations/route.ts`
- `app/api/legal-entities/documents/[id]/download/route.ts`
- `app/api/legal-entities/documents/route.ts`
- `components/settings/company-profiles-panel.tsx`
- `next.config.ts`

## Status sambung nanti

- Belum deploy perubahan dokumen cawangan ini ke live selepas checkpoint ini.
- Local dev server sempat diuji dan respons `200` di `http://127.0.0.1:3000`.
- `npm run lint` penuh masih gagal kerana isu lama/terjana dalam projek, tetapi TypeScript compile untuk projek lulus.

# CHECKPOINT TERKINI - 2026-07-02 22:25 MYT

## Kerja terakhir

- Perubahan dokumen cawangan, POS security/performance dan mobile/PWA readiness sudah disimpan dalam projek.
- POS API kini semak skop branch untuk setiap permintaan penting: staf hanya branch sendiri, AM hanya kawasan sendiri, OM/Admin/Super Admin skop pengurusan.
- POS lebih ringan kerana sejarah transaksi hanya dimuat bila tab `Sejarah` dibuka.
- `.vercelignore` dikemas supaya `.next`, `.vercel/output`, `node_modules`, Android/iOS build dan output store tidak ter-upload semasa deploy.
- Production sudah deploy ke `https://rkj-one.vercel.app`.

## Deployment

- Deployment ID: `dpl_HWwBRwbYSqCtiLMA7q6Zif8k5M8J`
- Production alias: `https://rkj-one.vercel.app`
- Health check: `/api/health` kembali `200`
- Vercel inspect: `Ready`
- Vercel error log scan: tiada log error ditemui semasa semakan

## Mobile readiness

- `npm run mobile:readiness` lulus `54/54`
- PWA manifest, privacy page, offline fallback, Android AAB, store screenshots, reviewer account dan POS BR011 readiness semuanya lulus.

## Nota teknikal

- Local `npm run build` lulus.
- `npx vercel build --prod` tempatan gagal kerana OneDrive/Windows menolak symlink `.vercel/output`; deployment production berjaya melalui remote Vercel build.
- `npm run lint` penuh masih ada backlog lint lama dalam kod sumber, tetapi tidak menghalang build atau deploy production.

# CHECKPOINT TERKINI - 2026-07-02 22:48 MYT

## Kerja terakhir

- Isu owner bottleneck mula diselesaikan dengan `Owner Delegation Matrix` di dashboard Pentadbir Utama.
- Owner kini nampak bidang yang perlu dipegang oleh OM, AM, HR, Finance, Manager Maintenance dan Admin HQ mengikut syarikat/jabatan.
- Workflow Pentadbir Utama dikemaskini supaya fokus kepada exception, kelulusan risiko tinggi, audit dan laporan strategik; bukan lagi owner perlu buat semua kerja harian.

## Deployment

- Deployment ID: `dpl_8XYaLazvpv8kiif4xHUwBBuqXedP`
- Production alias: `https://rkj-one.vercel.app`
- Health check: `/api/health` kembali `200`
- Vercel inspect: `Ready`
- Vercel log scan: tiada log ditemui semasa semakan

# CHECKPOINT TERKINI - 2026-07-02 23:05 MYT

## Kerja terakhir

- POS ditambah `Live Counter Guard` di tab `Jualan`.
- Panel ini tunjuk status kaunter live: staf rasmi aktif, staf tunggu kelulusan, mula perniagaan, idle/aktiviti terakhir, staf keluar kiosk, stok driver belum disahkan dan kiraan stok wajib.

# CHECKPOINT TERKINI - 2026-07-04 22:08 MYT

## Kerja terakhir

- Ditambah tab admin `Tetapan > Kesihatan Sistem` untuk pantau keselamatan asas, akses syarikat, backup/pemulihan, mobile readiness, D-U-N-S/payment dan status operasi.
- Ditambah endpoint admin-only `/api/system/health` yang hanya memaparkan status readiness, bukan API key, token, password atau service role key.
- Ditambah skrip `npm run system:audit` yang jana laporan `outputs/system-hardening-audit.md`.
- Ditambah dokumen `docs/SYSTEM_HEALTH_AND_UAT.md` sebagai SOP audit, UAT POS, akses syarikat, backup, payment gateway dan mobile app.

## Deployment

- Deployment ID: `dpl_6XScWC9nzspRseRRhYodUUm8r2Em`
- Production alias: `https://rkj-one.vercel.app`
- Health check: `/api/health` kembali `{"ok":true,"status":"ready"}`
- Vercel inspect: `Ready`

## Verification

- `npm run build` lulus.
- `npm run mobile:readiness` lulus `54/54`.
- `npm run system:audit` berjaya jana laporan.
- `npm run lint` penuh masih gagal kerana backlog lint lama dalam banyak fail sedia ada dan `.vercel/output`; tidak berpunca daripada modul Kesihatan Sistem baharu.
- Tujuan: kawal staf sentiasa di depan POS tanpa menyusahkan jualan; AM/OM boleh rujuk rekod presence, leave dan staf dalam syif.

## Deployment

- Deployment ID: `dpl_2QD7JFzV3tGLKrP96AxbPYPHt2uE`
- Production alias: `https://rkj-one.vercel.app`
- Health check: `/api/health` kembali `200`
- Vercel inspect: `Ready`
- Vercel log scan: tiada log ditemui semasa semakan

# CHECKPOINT TERKINI - 2026-07-02 23:51 MYT

## Kerja terakhir

- SOP AM/OM/Admin untuk cash collection cawangan ditambah baik dalam sistem.
- Dashboard `Kewangan` kini ada `Kawalan Kutipan Tunai AM`: minimum kutipan 2 kali seminggu, sasaran terbaik 6 kali seminggu, status overdue, tunai belum bank-in dan status setiap cawangan.
- AM boleh rekod kutipan cash cawangan kawasan sendiri, pilih AM sendiri atau pihak ketiga, tandakan sudah dikutip, dan rekod bank-in yang dipautkan kepada kutipan.
- OM/Admin/Finance boleh audit jadual collection, third party, overdue dan bukti bank-in.
- Akses database dikunci: AM hanya boleh bank-in atau tandakan kutipan untuk cawangan dalam kawasan sendiri.

## Database

- `00107_staff_finance_permission_lockdown.sql` applied.
- `00108_am_cash_collection_control.sql` applied.

## Deployment

- Deployment ID: `dpl_EWzJYjgBKKyv36tsnSMxPD3YJm37`
- Production alias: `https://rkj-one.vercel.app`
- Local build: `npm run build` lulus.
- Targeted lint: `npx eslint components/finance/cash-collection-control.tsx components/finance/finance-dashboard.tsx` lulus.
- Health check: `/api/health` kembali `200`.
- Halaman `/finance` kembali `200`.

# CHECKPOINT TERKINI - 2026-07-03 00:18 MYT

## Kerja terakhir

- SOP AM, OM dan Admin ditambah baik dengan `Management Governance Command Center`.
- Dashboard Pentadbir Utama, AM, OM, Admin dan Finance kini ada scorecard kawalan: disiplin cash collection AM, command center OM, audit akses Admin, semakan SOP mingguan dan escalation matrix.
- Workflow dashboard dikemaskini supaya AM fokus kawasan sendiri, OM fokus operasi rentas cawangan, Admin fokus audit/akses/data, dan owner fokus exception serta keputusan strategik.
- Finance bank-in kini wajib ada rujukan bank atau link bukti/slip sebelum boleh disimpan; status bukti slip dipaparkan dalam audit kewangan.

## Deployment

- Deployment ID: `dpl_4PvUKEXjn9WYEiZATyNvSUGmzDT1`
- Production alias: `https://rkj-one.vercel.app`
- Local build: `npm run build` lulus.
- Targeted lint: fail sasaran dashboard/governance/finance lulus.
- Health check: `/api/health` kembali `ok/ready`.

# CHECKPOINT TERKINI - 2026-07-03 00:58 MYT

## Kerja terakhir

- SOP AM cash collection dinaik taraf kepada kawalan `Voucher Guna Cash Collection`.
- AM boleh guna tunai collection untuk 3 kategori sahaja: barangan keperluan cawangan yang dipautkan kepada request staf cawangan, petrol/diesel, dan service/maintenance transport syarikat.
- Setiap penggunaan wajib ada bukti: receipt/link bukti atau nombor resit; petrol/diesel dan maintenance wajib ada rujukan kenderaan.
- Untuk barangan cawangan, sistem wajibkan pautan kepada request cawangan yang sudah diluluskan/fulfilled supaya AM tidak boleh claim suka-suka daripada collection.
- Dashboard Kewangan kini kira automatik `baki perlu bank-in` = jumlah collection - voucher penggunaan - bank-in terdahulu.
- OM/Admin/Finance boleh semak, approve/reject voucher, dan audit penggunaan cash collection.

## Database

- `00109_am_cash_usage_vouchers.sql` applied.

## Deployment

- Deployment ID: `dpl_Ewt8kbeveBf9Jv1EyqJXqsfMHPPi`
- Production alias: `https://rkj-one.vercel.app`
- Local build: `npm run build` lulus.
- TypeScript: `npx tsc --noEmit` lulus.
- Targeted lint untuk fail cash voucher/API/dashboard lulus.
- Health check: `/api/health` kembali HTTP `200`.

# CHECKPOINT REHAT - 2026-07-03 01:03 MYT

- Semua kerja terakhir sudah disimpan dalam `CHECKPOINT.json` dan `RESUME.md`.
- Production terakhir kekal `https://rkj-one.vercel.app` deploy `dpl_Ewt8kbeveBf9Jv1EyqJXqsfMHPPi`.
- Nota sambung: pantauan email D-U-N-S tidak boleh berjalan sehingga Gmail reconnect/sign in semula kerana token Gmail sudah expired.

# CHECKPOINT TERKINI - 2026-07-04 22:25 MYT

## Kerja terakhir

- Sistem RKJ One dinaik taraf dengan asas dwi bahasa Bahasa Malaysia / English.
- `LanguageProvider` global ditambah supaya pilihan bahasa disimpan dalam browser dan `html lang` dikemaskini.
- Butang pilihan BM/EN ditambah di halaman log masuk dan app shell selepas pengguna masuk.
- Teks utama login, sidebar navigasi, kumpulan menu, role label, greeting dan app shell kini menggunakan kamus translation.
- Dokumentasi cara tambah translation baharu disimpan di `docs/BILINGUAL_SYSTEM_GUIDE.md`.

## Deployment

- Deployment ID: `dpl_8z4RZ7c5UfZM7fumtuyPDY8TmHm6`
- Production alias: `https://rkj-one.vercel.app`
- Local build: `npm run build` lulus.
- Mobile readiness: `npm run mobile:readiness` lulus 54/54.
- Health check live: `/api/health` kembali HTTP `200` dengan `{"ok":true,"status":"ready"}`.

# CHECKPOINT TERKINI - 2026-07-04 22:52 MYT

## Kerja terakhir

- Liputan dwi bahasa diperluas daripada shell/login kepada dashboard operasi utama.
- POS, Kilang, HR & Gaji, Portal Ejen dan Logistik kini menggunakan translation key untuk header utama, tab, KPI dan empty state penting.
- Portal Ejen admin kini ikut bahasa untuk tajuk konsol, KPI ejen, borang tambah ejen dan bahagian order/cawangan utama.
- Dashboard Logistik kini ikut bahasa untuk command center, tab driver, KPI route, manual delivery dan empty state kenderaan/status.

## Deployment

- Deployment ID: `dpl_HEspycnBCtbE95dhCTZPsftLxzjC`
- Production alias: `https://rkj-one.vercel.app`
- Local build: `npm run build` lulus.
- Mobile readiness: `npm run mobile:readiness` lulus 54/54.
- Vercel inspect: `Ready`.
- Health check live: `/api/health` kembali HTTP `200` dengan `{"ok":true,"status":"ready"}`.

# CHECKPOINT TERKINI - 2026-07-04 23:10 MYT

## Kerja terakhir

- Bahagian hero dashboard Pentadbir Utama dikemaskini supaya lebih premium, jelas dan tidak membosankan untuk owner.
- Ayat utama ditukar kepada gaya `Executive Command Center`, fokus kepada keputusan cepat, operasi lancar dan kawalan kumpulan.
- Hero kini ada ringkasan owner: jualan hari ini, syif POS berjalan, logistik aktif dan perkara yang perlukan keputusan.
- Warna dan kontras hero premium diperbaiki dengan kombinasi charcoal, emas, emerald dan biru lembut supaya tajuk tidak tenggelam.

## Deployment

- Deployment ID: `dpl_ELJWgw9kmqaBCTsk7oEBKm5gWSD2`
- Production alias: `https://rkj-one.vercel.app`
- Local build: `npm run build` lulus.
- Vercel inspect: `Ready`.
- Health check live: `/api/health` kembali HTTP `200` dengan `{"ok":true,"status":"ready"}`.

# CHECKPOINT TERKINI - 2026-07-04 23:26 MYT

## Kerja terakhir

- Punca switch English tidak menukar semua teks disahkan: hanya teks yang sudah disambung kepada `useLanguage().t(...)` dan `lib/i18n/dictionary.ts` akan bertukar; teks lama yang hard-coded dalam komponen masih kekal bahasa asal.
- Hero dashboard Pentadbir Utama dipisahkan kepada `OwnerExecutiveHero` yang client-aware supaya boleh ikut pilihan BM/English.
- Translation key BM/English ditambah untuk hero owner: tajuk, subtitle, badge, KPI sales/POS/logistik/keputusan dan nota owner.
- `DashboardHero` kini menyokong `dateLocale`/`dateLabel`, jadi tarikh boleh ikut `ms-MY` atau `en-MY` mengikut bahasa dipilih.

## Deployment

- Deployment ID: `dpl_4kxH4bP4VNk7VgSENBqzXDeFoA3X`
- Production alias: `https://rkj-one.vercel.app`
- Local build: `npm run build` lulus.
- Vercel inspect: `Ready`.
- Health check live: `/api/health` kembali `{"ok":true,"status":"ready"}`.

# CHECKPOINT TERKINI - 2026-07-04 23:44 MYT

## Kerja terakhir

- Liputan English diperluas untuk dashboard lama yang masih ada teks hard-coded.
- Ditambah `LegacyTranslationBridge` global yang menterjemah text node, placeholder, title dan aria-label selepas bahasa ditukar.
- Ditambah kamus legacy BM/EN untuk label, butang, status, SOP, POS, Cawangan, HR, Logistik, Kilang, Portal Ejen, Finance, Settings dan mesej dinamik biasa.
- Terjemahan sengaja tidak mengubah data sebenar seperti nama syarikat, nama staf, nama cawangan, kod BR/SKU, SSM, UUID/nilai sistem dan nilai jualan.

## Deployment

- Deployment ID: `dpl_EcPtRKPykGBjGuXYDJVsvrmHuYuv`
- Production alias: `https://rkj-one.vercel.app`
- Local build: `npm run build` lulus.
- Mobile readiness: `npm run mobile:readiness` lulus `54/54`.
- Vercel inspect: `Ready`.
- Login page: `/login` kembali HTTP `200`.
- Health check live: `/api/health` kembali `{"ok":true,"status":"ready"}`.

# CHECKPOINT TERKINI - 2026-07-05 00:07 MYT

## Kerja terakhir

- Punca `AI Proactive Cockpit` masih kekal BM selepas switch English dibetulkan: komponen `RoleProactiveCockpit` sebelum ini server/static dan tidak membaca pilihan bahasa semasa.
- `RoleProactiveCockpit` kini client-aware menggunakan `useLanguage()` dan semua title, description, AI prediction, boundary, signal dan next action disalurkan melalui `translateLegacyUiText`.
- Kamus legacy BM/EN ditambah untuk ayat owner cockpit, governance action, role boundary, signal harian dan workflow AM/OM/Admin, kilang, distributor, staf, finance, driver, maintenance dan sales-agent supaya bahagian AI ikut English dengan lebih menyeluruh.

## Deployment

- Deployment ID: `dpl_34nt7TzoKa3DpKdxQ7MfKfMK6j9B`
- Production alias: `https://rkj-one.vercel.app`
- Local build: `npm run build` lulus.
- Vercel inspect: `Ready`.
- Login page: `/login` kembali HTTP `200`.
- Health check live: `/api/health` kembali `{"ok":true,"status":"ready"}`.

# CHECKPOINT TERKINI - 2026-07-05 00:22 MYT

## Kerja terakhir

- Audit kedua dibuat untuk `AI Proactive Cockpit` dan role workflow selepas user nampak masih ada teks BM dalam mode English.
- `LegacyTranslationBridge` dikuatkan supaya bila user tukar bahasa, text node lama yang React recycle tidak lagi menyimpan original text yang salah.
- Terjemahan tambahan dimasukkan untuk label umum yang tertinggal: `HR Syarikat`, `Laporan`, `Syif` dan `Gaji`.
- Audit programatik role workflow/cockpit kini kembali `count: 0` untuk teks BM yang sepatutnya ditukar kepada English.

## Deployment

- Deployment ID: `dpl_FbcjjD8GadbhgxxG4A6RXPkaQzHf`
- Production alias: `https://rkj-one.vercel.app`
- Local build: `npm run build` lulus.
- Vercel inspect: `Ready`.
- Login page: `/login` kembali HTTP `200`.
- Health check live: `/api/health` kembali `{"ok":true,"status":"ready"}`.

# CHECKPOINT TERKINI - 2026-07-05 00:55 MYT

## Kerja terakhir

- Audit dwi bahasa dibuat dengan lebih luas merentas dashboard utama: POS, Cawangan, HR & Gaji, Portal Ejen, Logistik/Fleet, Finance, Warehouse/Kilang, Settings dan dashboard owner/AM.
- Kamus legacy BM/EN diperluas dengan label, toast/error, modal, status, placeholder, contoh SOP dan serpihan ayat React yang sebelum ini tidak bertukar semasa mode English.
- Pattern dinamik ditambah untuk frasa seperti `Belum ada...`, `Gagal...`, `Cari...`, `Tambah...`, `Sahkan...`, `... dihantar/dikemaskini/dipadam/disahkan`, supaya ayat data-driven lebih banyak ikut pilihan English.
- Terjemahan sengaja tidak menukar nama syarikat, produk, staff, cawangan, SKU, kod BR, SSM, UUID, ID atau nilai sistem.

## Deployment

- Deployment ID: `dpl_FkPHYqBiRczGcQZM2cwCjmyAtaoN`
- Production alias: `https://rkj-one.vercel.app`
- Local build: `npm run build` lulus.
- Vercel status: `READY`.
- Login page: `/login` kembali HTTP `200`.
- Health check live: `/api/health` kembali `{"ok":true,"status":"ready"}`.
