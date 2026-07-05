# FPX Live - Portal Ejen (iPay88)

Bayaran order stok & langganan POS ejen dihantar ke **RKJ Distributor Sdn Bhd**.

| Item | Nilai |
|------|--------|
| Syarikat | RKJ Distributor Sdn Bhd |
| SSM | 1352838V/201901043508 |
| Bank | Maybank - 564856315018 |
| Email | rkjdistributor20@gmail.com |
| Tel | 016-4366302 |

---

## 1. Daftar merchant iPay88

1. Mohon akaun merchant iPay88 atas nama **RKJ Distributor Sdn Bhd**
2. Aktifkan **FPX**, **Kad Kredit**, **Kad Debit**
3. Catat **Merchant Code** dan **Merchant Key**

---

## 2. Environment Vercel (Production)

Project ke Settings ke Environment Variables:

| Variable | Nilai |
|----------|--------|
| `SALES_AGENT_PAYMENT_MODE` | *(jangan set - default live)* - `simulate` hanya dev/UAT |
| `SALES_AGENT_PAYMENT_PROVIDER` | `ipay88` |
| `SALES_AGENT_PAYMENT_MERCHANT_ID` | *(Merchant Code dari iPay88)* |
| `SALES_AGENT_PAYMENT_API_KEY` | *(Merchant Key - RAHASIA)* |
| `SALES_AGENT_PAYMENT_WEBHOOK_SECRET` | *(optional - webhook manual)* |
| `SALES_AGENT_PAYMENT_GATEWAY_URL` | `https://payment.ipay88.com.my/epayment/entry.asp` |
| `NEXT_PUBLIC_APP_URL` | `https://rkj-one.vercel.app` |

**Jangan** set mode `live` sebelum Merchant Code & Key sah - sistem akan fallback simulate jika key kosong.

---

## 3. URL iPay88 (Backend / Response)

Daftar dalam portal iPay88:

| URL | Nilai |
|-----|--------|
| **Response URL** | `https://rkj-one.vercel.app/sales-agent/payment-return?payment={id}` |
| **Backend URL** | `https://rkj-one.vercel.app/api/sales-agent/payments/webhook` |

Backend URL menerima POST iPay88 (form-urlencoded) dan mengesahkan tandatangan SHA256.

---

## 4. Aliran live (pengesahan bank wajib)

1. Ejen cipta order / langganan ke status **Menunggu Bayaran**
2. Sistem cipta `agent_online_payments` (**PENDING**)
3. Redirect ke `/sales-agent/checkout?payment={id}` ke auto-POST **iPay88**
4. Ejen bayar FPX / kad kredit / kad debit ke **Maybank RKJ Distributor**
5. iPay88 panggil **BackendURL** dengan status bank
6. **Status = 1 (berjaya):** RPC `confirm_agent_payment_and_fulfill` ke resit AR + kilang / POS aktif
7. **Status gagal:** RPC `fail_agent_payment` ke tempahan **tidak disahkan**
8. Ejen kembali ke `/sales-agent/payment-return?payment={id}` - poll status sehingga PAID/FAILED

**Default production:** mod live (tiada `SALES_AGENT_PAYMENT_MODE=simulate`).

---

## 5. UAT simulate (dev sahaja)

```powershell
SALES_AGENT_PAYMENT_MODE=simulate
```

Bayaran disahkan serta-merta - **jangan** set di production go-live.

---

## 6. Semak selepas live

```powershell
npm run uat:sales-agent
```

Uji manual: order kecil RM1-10 dengan FPX sandbox iPay88 (jika disediakan).

---

## Troubleshooting

| Masalah | Tindakan |
|---------|----------|
| Checkout redirect simulate | `live` mode + merchant keys belum set |
| Signature invalid | Semak Merchant Key - amount dalam sen |
| Webhook tidak panggil | Pastikan BackendURL boleh diakses public (Vercel) |
| Resit tiada bank | Profil syarikat dalam `legal_entities` (migration 00080) |
