# Pilot 14 Hari - Kawasan Utara (OPTIONAL)

> **Nota:** RKJ memilih **go-live terus 36 cawangan** - dokumen ini kekal sebagai rujukan jika perlu ujian terhad kemudian. 
> Checklist utama: [`GO_LIVE_36.md`](./GO_LIVE_36.md)

**Tempoh:** 14 hari beroperasi 
**Pengurus Kawasan:** Safuan - `safuan@rkj.com` 
**Skop:** **12 cawangan** kiosk Utara (BR001-BR012) 
**Selepas pilot lulus:** rollout Tengah (Hakim, 10) ke Selatan (Yati, 14)

Password sementara (tukar selepas hari 1): `[REDACTED_TEMP_PASSWORD]`

---

## 12 cawangan pilot

| Kod | Cawangan | POS | Inventori | Syif | Catatan |
|-----|----------|-----|-----------|------|---------|
| BR001 | RNR Juru Arah Selatan | [ ] | [ ] | [ ] | |
| BR002 | RNR Gunung Semanggul Arah Selatan | [ ] | [ ] | [ ] | |
| BR003 | RNR Gunung Semanggul Arah Utara | [ ] | [ ] | [ ] | |
| BR004 | Hentian Sebelah Bukit Gantang Arah Utara | [ ] | [ ] | [ ] | |
| BR005 | RNR Sg Perak Arah Selatan | [ ] | [ ] | [ ] | |
| BR006 | RNR Sg Perak Arah Utara | [ ] | [ ] | [ ] | |
| BR007 | RNR Simpang Pulai Arah Selatan | [ ] | [ ] | [ ] | |
| BR008 | RNR Simpang Pulai Arah Utara | [ ] | [ ] | [ ] | |
| BR009 | Plaza Tol Simpang Pulai | [ ] | [ ] | [ ] | |
| BR010 | Plaza Tol WCE Taiping | [ ] | [ ] | [ ] | |
| BR011 | RNR Sg Nyiur Arah Utara | [ ] | [ ] | [ ] | |
| BR012 | Hentian Sebelah Bukit Gantang Arah Selatan | [ ] | [ ] | [ ] | |

---

## Peranan & tanggungjawab

| Peranan | Siapa | Pilot |
|---------|-------|-------|
| **AM Utara** | Safuan | Urus 12 cawangan - staf - inventori - syif - kelulusan |
| **HQ Operasi** | Ibrahim | HQ Distributor ke delivery ke kiosk Utara |
| **HQ Kilang** | Muhammad | Production order ikut permintaan pilot |
| **Staf kiosk** | s001, s002, ... | POS 4 menu - buka/tutup syif harian |
| **Owner** | Mat Isa | Pantau dashboard HQ + laporan harian Utara |

**Syarikat:** AM di bawah **RKJ Distributor Sdn Bhd** - staf jualan di bawah **Roti Kaya Junus**

---

## Aliran harian (setiap cawangan)

```
Kilang ke HQ Distributor ke Fleet ke Kiosk Utara ke POS
```

### Hari 1-3 (asas)

- [ ] Safuan login - semak **Inventori Kawasan** - 12 cawangan
- [ ] Setiap cawangan: staf login - **buka syif** - 1 transaksi ujian 4 menu
- [ ] HQ: delivery order ke kiosk pilot - staf sahkan stok masuk
- [ ] Safuan: jadual staf mingguan diterbitkan (Syif ke Jadual Mingguan)

### Hari 4-10 (operasi penuh)

- [ ] POS harian semua 12 cawangan (buka ke jual ke tutup syif)
- [ ] Inventori: pindah antar kiosk Utara jika perlu (AM sahaja)
- [ ] Safuan pantau dashboard AM - KPI jualan h/m/b - AI insight
- [ ] HQ pantau dashboard - jualan agregat Utara

### Hari 11-14 (kestabilan)

- [ ] Tiada isu stok kritikal / harga salah / login gagal
- [ ] Semua staf Utara tukar kata laluan dari default
- [ ] Safuan + HQ isi checklist cawangan (jadual atas)
- [ ] Mesyuarat review: teruskan Tengah atau baiki isu

---

## Ujian POS (ulang setiap cawangan)

1. Login staf cawangan - profile + nama cawangan betul 
2. Bar stok - 4 roti + Kaya / Butter / Plastik 
3. Buka syif (tunai permulaan) 
4. Jual Roti Kaya, Kacang, Kelapa, Benggali - bayar tunai/QR 
5. Baki stok turun - cuba jual melebihi stok ke sistem halang 
6. Tutup syif - jumlah jualan 
7. Dashboard Safuan - cawangan muncul dalam KPI 

---

## Kriteria lulus pilot Utara

- [ ] **12/12** cawangan operasi POS sekurang-kurangnya 10 hari dalam 14 hari 
- [ ] Delivery dari HQ Distributor sampai ke semua kiosk pilot 
- [ ] Safuan urus staf + inventori tanpa eskalasi kritikal ke HQ 
- [ ] Tiada kehilangan data syif / jualan 
- [ ] Staf majoriti sudah tukar password 

---

## Rujukan

- UAT AM: [`UAT_AM.md`](./UAT_AM.md) 
- Go-live penuh: [`GO_LIVE_CHECKLIST.md`](./GO_LIVE_CHECKLIST.md) Fasa 3-4 
- Verify automatik: `npm run verify:am` - `npm run verify:login`
