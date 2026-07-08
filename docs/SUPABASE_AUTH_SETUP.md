# Supabase Auth - Setup Go-Live (5 minit)

**Projek:** `mtygxueknokcihofdttl` 
**Production:** https://rkj.one

---

## 1. Buka tetapan Auth

1. Login [Supabase Dashboard](https://supabase.com/dashboard)
2. Pilih projek **RKJ One**
3. Menu kiri: **Authentication** ke **URL Configuration** 
 Direct link: 
 https://supabase.com/dashboard/project/mtygxueknokcihofdttl/auth/url-configuration

---

## 2. Site URL

| Medan | Nilai |
|-------|--------|
| **Site URL** | `https://rkj.one` |

Klik **Save** jika diubah.

---

## 3. Redirect URLs

Tambah **kedua-dua** (jika belum ada):

```
https://rkj.one/auth/callback
http://localhost:3000/auth/callback
```

---

## 4. Matikan signup awam

1. **Authentication** ke **Providers** ke **Email**
2. Pastikan **Enable email signup** = **OFF** (disabled)
3. **Confirm email** boleh ON (pengguna dijana admin sudah confirmed)

Atau: **Authentication** ke **Settings** ke cari **Allow new users to sign up** ke **OFF**

---

## 5. Semak automatik

```bash
npm run verify:go-live-36
```

Bahagian Auth patut tunjuk:
- ✓ Login production (Safuan)
- ✓ Signup blocked

---

## 6. Tukar kata laluan (go-live)

**Automatik (disyorkan):**

```bash
npm run go-live:passwords
```

- Password ke `csv_import/.go-live-temp-password.txt` (gitignored)
- Eksport AM ke `csv_import/go_live_credentials_export.csv`
- Panduan edar ke [`GO_LIVE_CREDENTIALS_HANDOFF.md`](./GO_LIVE_CREDENTIALS_HANDOFF.md)

**Manual / semula:**

```bash
npm run rotate:passwords -- --dry-run
npm run rotate:passwords -- --password "..." --confirm
```

---

## 7. Backup database

**Settings** ke **Database** ke pastikan **Point-in-time Recovery** / backup aktif sebelum hari go-live.

---

## Checklist pantas

- [ ] Site URL = production Vercel
- [ ] Redirect URLs (production + localhost)
- [ ] Signup OFF
- [ ] `npm run verify:go-live-36` - Auth lulus
- [ ] UAT AM selesai
- [ ] `npm run rotate:passwords` - tukar dari kata laluan ujian
- [ ] Edarkan WhatsApp - [`WHATSAPP_GO_LIVE.txt`](./WHATSAPP_GO_LIVE.txt)

---

*Verify berkala: `npm run verify:auth` - `npm run verify:login`*
