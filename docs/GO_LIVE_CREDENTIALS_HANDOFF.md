# Edaran Kredensial Go-Live - Panduan AM

**URL:** https://rkj.one/login
**Fail eksport (local, gitignored):** `csv_import/go_live_credentials_export.csv` 
**Kata laluan sementara (local):** `csv_import/.go-live-temp-password.txt`

> ⚠️ Jangan commit atau hantar fail password melalui email awam / group WhatsApp besar.

---

## Cara edar kepada staf

1. Buka `go_live_credentials_export.csv` - tapis baris **STAF** ikut kawasan anda.
2. Hantar **per cawangan** atau **per staf** melalui WhatsApp peribadi:
 - Email login: `sxxx@rkj.com`
 - Kata laluan sementara: *(dari fail `.go-live-temp-password.txt` - owner/AM sahaja)*
3. Ingatkan staf: **login pertama wajib tukar password** (skrin akan keluar automatik).

---

## Skop AM

| AM | Kawasan | Cawangan |
|----|---------|----------|
| Safuan | Utara | 12 |
| Hakim | Tengah | 10 |
| Yati | Selatan | 14 |

---

## Selepas staf login

- [ ] Inventori - semak baki stok
- [ ] POS - buka syif
- [ ] UAT pantas - 1 transaksi setiap menu roti
- [ ] Tutup syif petang

---

## Reset password staf

AM boleh reset melalui **Tetapan ke Staf ke Edit (pensel)** - kredensial baharu auto dijana.

---

*Jana semula eksport: `npm run go-live:passwords` (hanya jika perlu putar semula)*
