# UAT Browser - Portal Ejen Jualan

**URL:** https://rkj.one/sales-agent
**Akaun UAT:** `agent001@rkj.com` / `[REDACTED_TEMP_PASSWORD]` 
**Syarikat:** Nur Aisha - RKJ Distributor Sdn Bhd

Automatik: `npm run uat:sales-agent` - `npm run uat:sales-agent:flow`

---

## Peraturan bayaran (penting)

1. **FPX / Kad Kredit / Kad Debit** ke iPay88 ke **Maybank RKJ Distributor** (564856315018)
2. **Pengesahan bank wajib** - order stok / langganan POS **tidak disahkan** sehingga status **Disahkan Bank**
3. Bayaran gagal / batal = tempahan **gagal** - ejen boleh cuba bayar semula
4. **Langganan POS tamat setiap bulan** - bayar RM150/cawangan untuk bulan seterusnya

Setup live: [`FPX_LIVE_SETUP.md`](./FPX_LIVE_SETUP.md)

---

## 1. Login & dashboard

- [ ] Buka `/login` ke log masuk `agent001@rkj.com`
- [ ] Menu **Portal Ejen** (`/sales-agent`) kelihatan
- [ ] KPI: order menunggu, dihantar kilang, cawangan POS
- [ ] Kad header **RKJ Distributor** + nota pengesahan bank

---

## 2. Order stok + bayaran + resit

- [ ] Tab **Order Stok** ke pilih tarikh production terbuka
- [ ] Isi kuantiti - jumlah > RM0
- [ ] Klik **Order & Terus Bayar**
- [ ] Dialog ke pilih **FPX** / **Kad Kredit** / **Kad Debit** ke **Bayar**
- [ ] Redirect ke **iPay88** (halaman bank)
- [ ] Selesai bayar ke halaman **Menunggu Pengesahan Bank**
- [ ] Status **Disahkan Bank** ke resit **AR-xxxxx**
- [ ] Resit papar Maybank 564856315018 - SSM RKJ Distributor
- [ ] Tab **Sejarah** ke order **Dihantar Kilang** (hanya selepas PAID)

**Uji gagal:** batal di bank ke kembali portal ke status bayaran **Gagal** - order masih **Menunggu Bayaran**

---

## 3. Cawangan POS + langganan RM150/bulan

- [ ] Tab **Cawangan POS** ke daftar cawangan
- [ ] **Bayar RM150** ke iPay88 ke pengesahan bank
- [ ] Badge **POS Aktif** + tarikh **Aktif hingga ...**
- [ ] Buka **POS** (`/pos`) - terminal load
- [ ] (Selepas tamat tempoh) badge **Tamat Tempoh** ke **Renew RM150**

---

## 4. Semakan HQ (owner)

Login `matisa@rkj.com`:

- [ ] **Tetapan ke Syarikat** - profil RKJ_DIST + bank
- [ ] **Kilang** - antrian order ejen selepas bayaran disahkan

---

## Rujukan automatik

| Semakan | Perintah |
|---------|----------|
| Asas ejen | `npm run uat:sales-agent` |
| Order + resit + kilang | `npm run uat:sales-agent:flow` |
| POS sahaja | `node scripts/uat-sales-agent.mjs --flow-pos` |
