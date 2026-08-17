# POS Bluetooth Receipt Printer

Last verified: 2026-08-17

## Supported RKJ Branch Printer

The photographed branch unit is labelled:

- Model: `POS-5890U-L`
- Interface: USB and Bluetooth
- Paper width: 58 mm
- Box claim: Android and iOS

The manufacturer, Bluetooth service specification, pairing PIN, iOS MFi status and official SDK are **To be confirmed**. RKJ One therefore uses the common Bluetooth Serial Port Profile and ESC/POS text commands on Android only. Every physical printer batch must pass the test-page check before branch rollout.

## Staff Setup (Android App 1.6)

1. Switch on the printer and confirm paper is loaded with the thermal side facing the print head.
2. On the official POS tablet, open a completed receipt and select **Tetapan printer**.
3. Select **Benarkan Bluetooth** when Android asks.
4. Select **Pasangkan** to open Android Bluetooth settings.
5. Pair the printer once. Use only the PIN supplied with that unit; do not guess or share a PIN through chat.
6. Return to RKJ One, select **Muat semula**, then select the paired printer.
7. Select **Cetak ujian**. Confirm all lines are readable, the width fits 58 mm paper and no text is missing.
8. The selected printer is kept locally on that tablet. Future receipts use **Cetak terus**.

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
- Receipt output is ASCII, 32 columns and uses ESC/POS initialization without a cutter command.
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
- Confirm paper width, alignment and manual tear on the exact `POS-5890U-L` unit.
- Confirm browser system-print fallback and Android accessibility labels.

Production/Play rollout of Android 1.6 remains gated by one successful physical-printer test at a pilot branch and normal mobile release approval.
