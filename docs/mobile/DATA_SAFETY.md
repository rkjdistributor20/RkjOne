# RKJ One Staff - Data Safety Draft

Dokumen ini ialah rujukan untuk Google Play Data Safety dan App Store Privacy.

## Jenis Data Yang Diproses

Data akaun:

- Nama staf
- Email login
- Telefon kerja jika diisi
- Peranan dan syarikat majikan
- Cawangan atau kawasan bertugas

Data operasi:

- Syif kerja
- Rekod POS dan transaksi jualan
- Kiraan stok
- Pengesahan penghantaran
- Laporan maintenance
- Dokumen syarikat/cawangan yang diberi akses
- Log kelulusan dan tindakan kerja

Data kewangan dalaman:

- Ringkasan jualan
- Rekod tunai/QR manual
- Payroll/gaji mengikut akses pentadbir

## Tujuan Penggunaan

- Authentication dan keselamatan akses
- Operasi POS dan stok kiosk
- HR, jadual kerja dan payroll
- Logistik dan penghantaran
- Audit dalaman dan laporan pengurusan
- Sokongan teknikal sistem

## Perkongsian Data

Data tidak dijual kepada pihak ketiga.

Data hanya dihantar kepada servis yang diperlukan untuk operasi sistem, contohnya:

- Vercel untuk hosting aplikasi
- Supabase untuk pangkalan data dan authentication
- Payment gateway hanya apabila pembayaran online diaktifkan

## Keselamatan

- HTTPS wajib.
- Service worker tidak cache halaman operasi sensitif.
- Android cleartext HTTP dimatikan.
- Android backup/cloud extraction dimatikan.
- Access dikawal mengikut syarikat, peranan dan cawangan.
- API health tidak mendedahkan konfigurasi dalaman.
- Keystore Android disimpan lokal dan tidak dimasukkan ke Git.

## Jawapan Draft Google Play

Data collected:

```text
Personal info: Name, email address, phone number, employee role.
Financial info: Internal sales and payroll records for authorized company users only.
App activity: POS transactions, shift records, stock counts, approvals and logistics records.
Files and docs: Company or branch documents uploaded by authorized admins.
```

Data shared:

```text
No sale of data. Data is processed by hosting, database and authentication service providers required to operate the app.
```

Security practices:

```text
Data is encrypted in transit.
Users can request data correction or deletion through company administrators.
App access is restricted to authorized staff accounts.
```
