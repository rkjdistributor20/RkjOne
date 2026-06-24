# UAT Browser — Portal Ejen Jualan

**URL:** https://rkj-one.vercel.app/sales-agent  
**Akaun UAT:** `agent001@rkj.com` / `RkjOne@2026`  
**Syarikat:** Nur Aisha · RKJ Distributor Sdn Bhd

Automatik: `npm run uat:sales-agent` · `npm run uat:sales-agent:flow`

---

## 1. Login & dashboard

- [ ] Buka `/login` → log masuk `agent001@rkj.com`
- [ ] Menu **Portal Ejen** (`/sales-agent`) kelihatan
- [ ] KPI: order menunggu, dihantar kilang, cawangan POS
- [ ] Kad header **RKJ Distributor** dipaparkan

---

## 2. Order stok + bayaran + resit

- [ ] Tab **Order Stok** → pilih tarikh production terbuka (contoh 2026-06-25)
- [ ] Isi kuantiti (Roti Kaya / Kelapa / dll.) — jumlah > RM0
- [ ] Klik **Order & Terus Bayar**
- [ ] Dialog bayaran → pilih **FPX** → **Bayar**
- [ ] Mod simulate: resit **AR-xxxxx** muncul automatik
- [ ] Resit papar:
  - RKJ Distributor Sdn Bhd
  - Alamat Teluk Intan
  - SSM 1352838V/201901043508
  - Maybank 564856315018
- [ ] **Cetak** / **Kongsi** resit
- [ ] Tab **Sejarah** → order status **Dihantar Kilang**

---

## 3. Cawangan POS + langganan RM150

- [ ] Tab **Cawangan POS** → daftar cawangan (kod unik, nama, alamat)
- [ ] Klik **Bayar RM150** → resit langganan **AR-xxxxx**
- [ ] Badge **POS Aktif** pada cawangan
- [ ] Buka **POS** (`/pos`) — terminal load tanpa redirect ke portal

---

## 4. Semakan HQ (owner)

Login `matisa@rkj.com`:

- [ ] **Tetapan → Syarikat** — 3 profil (RKJ, RKJ_DIST, RKJ_MFG) dengan bank & SSM
- [ ] **Kilang** — antrian order ejen (factory queue) jika role CEO_FACTORY

---

## Rujukan automatik

| Semakan | Perintah |
|---------|----------|
| Asas ejen | `npm run uat:sales-agent` |
| Order + resit + kilang | `npm run uat:sales-agent:flow` |
| POS sahaja | `node scripts/uat-sales-agent.mjs --flow-pos` |
| Paut akaun ejen | `npm run provision:sales-agent` |
