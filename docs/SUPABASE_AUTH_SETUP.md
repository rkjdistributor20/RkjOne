# Supabase Auth — Setup Go-Live (5 minit)

**Projek:** `mtygxueknokcihofdttl`  
**Production:** https://rkj-one.vercel.app

---

## 1. Buka tetapan Auth

1. Login [Supabase Dashboard](https://supabase.com/dashboard)
2. Pilih projek **RKJ One**
3. Menu kiri: **Authentication** → **URL Configuration**  
   Direct link:  
   https://supabase.com/dashboard/project/mtygxueknokcihofdttl/auth/url-configuration

---

## 2. Site URL

| Medan | Nilai |
|-------|--------|
| **Site URL** | `https://rkj-one.vercel.app` |

Klik **Save** jika diubah.

---

## 3. Redirect URLs

Tambah **kedua-dua** (jika belum ada):

```
https://rkj-one.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

---

## 4. Matikan signup awam

1. **Authentication** → **Providers** → **Email**
2. Pastikan **Enable email signup** = **OFF** (disabled)
3. **Confirm email** boleh ON (pengguna dijana admin sudah confirmed)

Atau: **Authentication** → **Settings** → cari **Allow new users to sign up** → **OFF**

---

## 5. Semak automatik

```bash
npm run verify:go-live-36
```

Bahagian Auth patut tunjuk:
- ✓ Login production (Safuan)
- ✓ Signup blocked

---

## 6. Tukar kata laluan (selepas UAT)

**Dry-run** (senarai pengguna tanpa ubah):

```bash
npm run rotate:passwords -- --dry-run
```

**Putar semua akaun** (wajib `--confirm`):

```bash
npm run rotate:passwords -- --password "KataLaluanBaruAnda2025!" --confirm
```

- Minimum 10 aksara · **bukan** `RkjOne@2025`
- Set `must_change_password=true` — pengguna diminta tukar pada login pertama
- Log email (tanpa password): `csv_import/password_rotation_YYYY-MM-DD.csv`

**Hanya staf kiosk:**

```bash
npm run rotate:passwords -- --password "..." --confirm --role STAFF
```

**Kecuali owner semasa UAT:**

```bash
npm run rotate:passwords -- --password "..." --confirm --skip matisa@rkj.com
```

---

## 7. Backup database

**Settings** → **Database** → pastikan **Point-in-time Recovery** / backup aktif sebelum hari go-live.

---

## Checklist pantas

- [ ] Site URL = production Vercel
- [ ] Redirect URLs (production + localhost)
- [ ] Signup OFF
- [ ] `npm run verify:go-live-36` — Auth lulus
- [ ] UAT AM selesai
- [ ] `npm run rotate:passwords` — tukar dari kata laluan ujian
- [ ] Edarkan WhatsApp — [`WHATSAPP_GO_LIVE.txt`](./WHATSAPP_GO_LIVE.txt)

---

*Verify berkala: `npm run verify:auth` · `npm run verify:login`*
