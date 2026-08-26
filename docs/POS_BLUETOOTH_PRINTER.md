# POS Bluetooth Receipt Printer

Last verified: 2026-08-17

## Supported RKJ Branch Printer

The photographed branch unit is labelled:

- Model: `POS-5890U-L`
- Interface: USB and Bluetooth
- Paper width: 58 mm
- Box claim: Android and iOS

The manufacturer, Bluetooth service specification, pairing PIN, iOS MFi status and official SDK are **To be confirmed**. RKJ One therefore uses the common Bluetooth Serial Port Profile and ESC/POS text commands on Android only. Every physical printer batch must pass the test-page check before branch rollout.

## Staff Setup (Android App 1.6.9)

1. Switch on the printer and confirm paper is loaded with the thermal side facing the print head.
2. On the official POS tablet, open POS and select **Tetapan printer** in the header.
3. Select **Benarkan Bluetooth** when Android asks.
4. Select **Pasangkan** to open Android Bluetooth settings.
5. Pair the printer once. Use only the PIN supplied with that unit; do not guess or share a PIN through chat.
6. Return to RKJ One, select **Muat semula**, then select the paired printer.
7. Select **Cetak ujian**. Confirm all lines are readable, the width fits 58 mm paper and no text is missing.
8. After the test page succeeds, enable **Auto-cetak selepas bayaran**.
9. The selected printer, verified-test state and auto-print choice are kept privately on that tablet. Each confirmed sale is printed automatically once; **Cetak terus** remains available for a customer copy.
10. If the receipt button says **Sedia printer**, open the displayed setup, reselect the printer and complete **Cetak ujian** before serving the next customer.
11. For a printer-driven cash drawer, connect the drawer cable to the printer port labelled **DK**, **Drawer** or **RJ11/RJ12**. Do not connect it to the tablet.
12. In **Tetapan printer**, select **Isyarat 1** and press **Uji buka laci**. If the physical drawer does not open, select **Isyarat 2** and test again.
13. Only after the physical test succeeds, activate **Cash drawer**. RKJ One then opens it once for a confirmed CASH or MIXED transaction with a positive cash amount; QR-only and training transactions never open it.

If direct printing fails, staff must keep the sale result on screen and use **Cetak sistem** or **Kongsi**. Reprinting does not create another sale and must never be used to confirm payment.

## Platform Behaviour

- Android RKJ One 1.6: direct Bluetooth printing to a previously paired printer.
- Web/PWA: operating-system print dialog, formatted for 58 mm paper.
- iOS: operating-system print/share fallback until the supplier confirms MFi/BLE compatibility or provides a verified SDK. The box statement alone is not sufficient evidence for direct iOS Bluetooth support.

## Technical Safety Controls

- RKJ One requests `BLUETOOTH_CONNECT` only on Android 12 and newer.
- Discovery is performed in Android settings, so RKJ One does not request location or Bluetooth scan permission.
- Only Android-bonded devices can be selected.
- The selected Bluetooth address is stored in private app preferences on the tablet and is not sent to RKJ servers.
- Each print creates a short RFCOMM connection and closes it after the job.
- Each connection mode has a six-second timeout. The app tries secure SPP, insecure SPP and finally the common RFCOMM channel 1 used by some generic POS-5890-class printers. Every attempt remains limited to the Android-bonded, explicitly selected device.
- Auto-print cannot be enabled until the selected printer passes the built-in test page. Selecting or forgetting a printer clears the verification and disables auto-print.
- A successful automatic receipt key is stored privately on the tablet to prevent the same confirmed transaction from being auto-printed twice. Manual reprint remains available.
- Printer failure never changes payment, sale, stock or receipt records.
- Receipt output is ASCII, 32 columns and uses ESC/POS initialization without a cutter command.
- Cash-drawer control uses the standard ESC/POS `ESC p` pulse through the selected Bluetooth printer. The setting and successful test are stored only on that tablet.
- Software cannot open a drawer that is locked manually, has no powered solenoid, or is not connected to a compatible printer DK/RJ11/RJ12 port.
- No customer data, payment credentials, Bluetooth PIN or printer address is logged.

## Branch Acceptance Test

- Pair and select the printer after a clean app install.
- Print the built-in test page three times.
- Print a cash receipt with a long product name.
- Print a discounted receipt and verify subtotal, discount, total and change.
- Print a DuitNow/manual QR receipt only after the sale is confirmed.
- Turn the printer off and confirm the app shows a safe error without changing the sale.
- Turn it on and confirm the next retry succeeds.
- Restart the tablet and confirm the selected printer remains available.
- Enable auto-print, complete one confirmed test sale and confirm exactly one receipt prints automatically.
- Reopen the same receipt and confirm it is not auto-printed again; use **Cetak terus** to verify an intentional customer copy still works.
- Confirm paper width, alignment and manual tear on the exact `POS-5890U-L` unit.
- Confirm browser system-print fallback and Android accessibility labels.

The printer, auto-print and cash-drawer sequence has passed an earlier physical tablet test. The consolidated 1.6.9 candidate must repeat that same pilot test from the exact Play-delivered bundle before Production promotion.
