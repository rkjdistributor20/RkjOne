package com.rkjone.staff;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "RkjReceiptPrinter")
public class RkjReceiptPrinterPlugin extends Plugin {
    public static final int BLUETOOTH_PERMISSION_REQUEST_CODE = 5890;
    private static final String PREFERENCES = "rkj_receipt_printer";
    private static final String SELECTED_ADDRESS = "selected_address";
    private static final String SELECTED_NAME = "selected_name";
    private static final String VERIFIED_ADDRESS = "verified_address";
    private static final String AUTO_PRINT_ENABLED = "auto_print_enabled";
    private static final String LAST_AUTO_PRINTED_RECEIPT = "last_auto_printed_receipt";
    private static final UUID SERIAL_PORT_PROFILE = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int MAX_PRINT_CHARACTERS = 16000;
    private static final int MAX_RECEIPT_KEY_CHARACTERS = 160;
    private static final long CONNECTION_TIMEOUT_SECONDS = 6;

    private final ExecutorService printExecutor = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService connectionTimeoutExecutor = Executors.newSingleThreadScheduledExecutor();
    private PluginCall pendingBluetoothPermissionCall;

    @PluginMethod
    public void getStatus(PluginCall call) {
        resolveStatusSafely(call);
    }

    @PluginMethod
    public void requestBluetoothPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || hasBluetoothPermission()) {
            resolveStatusSafely(call);
            return;
        }

        synchronized (this) {
            if (pendingBluetoothPermissionCall != null) {
                call.reject("Permintaan kebenaran Bluetooth sedang diproses.", "BLUETOOTH_PERMISSION_IN_PROGRESS");
                return;
            }
            pendingBluetoothPermissionCall = call;
        }

        try {
            RkjDevicePolicyPlugin.runWithSystemDialogGuard(getActivity(), this::requestBluetoothPermissionOnUiThread);
        } catch (RuntimeException | LinkageError error) {
            rejectPendingPermissionRequest(error);
        }
    }

    private void requestBluetoothPermissionOnUiThread() {
        try {
            androidx.core.app.ActivityCompat.requestPermissions(
                getActivity(),
                new String[] { Manifest.permission.BLUETOOTH_CONNECT },
                BLUETOOTH_PERMISSION_REQUEST_CODE
            );
        } catch (SecurityException error) {
            rejectPendingPermissionRequest(error);
        } catch (RuntimeException | LinkageError error) {
            rejectPendingPermissionRequest(error);
        }
    }

    private void rejectPendingPermissionRequest(Throwable error) {
        RkjDevicePolicyPlugin.resumeKioskAfterSystemDialog(getActivity());
        PluginCall call = takePendingBluetoothPermissionCall();
        if (call == null) return;
        if (error instanceof SecurityException) {
            call.reject("Kebenaran Bluetooth disekat oleh tetapan peranti.", "BLUETOOTH_PERMISSION_DENIED");
            return;
        }
        call.reject("Dialog kebenaran Bluetooth tidak dapat dibuka. Benarkan Nearby devices melalui Tetapan Aplikasi.", "BLUETOOTH_PERMISSION_FAILED");
    }

    public void onBluetoothPermissionResult(String[] permissions, int[] grantResults) {
        RkjDevicePolicyPlugin.resumeKioskAfterSystemDialog(getActivity());
        PluginCall call = takePendingBluetoothPermissionCall();
        if (call == null) return;
        try {
            if (!hasBluetoothPermission()) {
                call.reject("Kebenaran Bluetooth diperlukan untuk mencetak resit.", "BLUETOOTH_PERMISSION_DENIED");
                return;
            }
            resolveStatusSafely(call);
        } catch (SecurityException error) {
            call.reject("Kebenaran Bluetooth belum tersedia. Buka semula tetapan printer.", "BLUETOOTH_PERMISSION_DENIED");
        } catch (RuntimeException | LinkageError error) {
            call.reject("Status printer belum dapat dibaca. Buka semula tetapan printer.", "BLUETOOTH_STATUS_FAILED");
        }
    }

    private synchronized PluginCall takePendingBluetoothPermissionCall() {
        PluginCall call = pendingBluetoothPermissionCall;
        pendingBluetoothPermissionCall = null;
        return call;
    }

    private void resolveStatusSafely(PluginCall call) {
        try {
            call.resolve(buildStatus());
        } catch (SecurityException error) {
            call.reject("Kebenaran Bluetooth diperlukan untuk membaca printer berpasangan.", "BLUETOOTH_PERMISSION_DENIED");
        } catch (RuntimeException | LinkageError error) {
            call.reject("Status Bluetooth tidak dapat dibaca pada peranti ini.", "BLUETOOTH_STATUS_FAILED");
            return;
        }
    }

    @PluginMethod
    public void selectPrinter(PluginCall call) {
        if (!ensureBluetoothReady(call)) return;

        String address = call.getString("address", "").trim();
        BluetoothAdapter adapter = getBluetoothAdapter();
        BluetoothDevice selected = findBondedDevice(adapter, address);
        if (selected == null) {
            call.reject("Printer belum dipasangkan dalam Tetapan Bluetooth Android.", "PRINTER_NOT_PAIRED");
            return;
        }

        SharedPreferences preferences = getPreferences();
        String previousAddress = preferences.getString(SELECTED_ADDRESS, "");
        SharedPreferences.Editor editor = preferences.edit()
            .putString(SELECTED_ADDRESS, selected.getAddress())
            .putString(SELECTED_NAME, safeDeviceName(selected));
        if (!selected.getAddress().equalsIgnoreCase(previousAddress)) {
            editor.remove(VERIFIED_ADDRESS)
                .putBoolean(AUTO_PRINT_ENABLED, false)
                .remove(LAST_AUTO_PRINTED_RECEIPT);
        }
        editor.apply();
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void clearPrinter(PluginCall call) {
        getPreferences().edit()
            .remove(SELECTED_ADDRESS)
            .remove(SELECTED_NAME)
            .remove(VERIFIED_ADDRESS)
            .remove(AUTO_PRINT_ENABLED)
            .remove(LAST_AUTO_PRINTED_RECEIPT)
            .apply();
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void setAutoPrintEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        if (enabled) {
            if (!ensureBluetoothReady(call)) return;
            SharedPreferences preferences = getPreferences();
            String selectedAddress = preferences.getString(SELECTED_ADDRESS, "");
            String verifiedAddress = preferences.getString(VERIFIED_ADDRESS, "");
            if (isBlank(selectedAddress) || !selectedAddress.equalsIgnoreCase(verifiedAddress)) {
                call.reject("Jalankan Cetak ujian dengan jayanya sebelum mengaktifkan auto-cetak.", "PRINTER_TEST_REQUIRED");
                return;
            }
            if (findBondedDevice(getBluetoothAdapter(), selectedAddress) == null) {
                call.reject("Printer pilihan tidak lagi dipasangkan pada tablet ini.", "PRINTER_NOT_PAIRED");
                return;
            }
        }

        getPreferences().edit().putBoolean(AUTO_PRINT_ENABLED, enabled).apply();
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void print(PluginCall call) {
        if (!ensureBluetoothReady(call)) return;

        String text = call.getString("text", "");
        if (isBlank(text)) {
            call.reject("Kandungan resit kosong.", "EMPTY_RECEIPT");
            return;
        }
        if (text.length() > MAX_PRINT_CHARACTERS) {
            call.reject("Kandungan resit terlalu panjang.", "RECEIPT_TOO_LONG");
            return;
        }

        boolean testPage = Boolean.TRUE.equals(call.getBoolean("testPage", false));
        boolean automatic = Boolean.TRUE.equals(call.getBoolean("automatic", false));
        String receiptKey = call.getString("receiptKey", "").trim();
        SharedPreferences preferences = getPreferences();

        if (automatic) {
            if (!preferences.getBoolean(AUTO_PRINT_ENABLED, false)) {
                call.reject("Auto-cetak belum diaktifkan dalam tetapan printer.", "AUTO_PRINT_DISABLED");
                return;
            }
            if (isBlank(receiptKey) || receiptKey.length() > MAX_RECEIPT_KEY_CHARACTERS) {
                call.reject("Rujukan resit auto-cetak tidak sah.", "INVALID_RECEIPT_KEY");
                return;
            }
            String selectedAddress = preferences.getString(SELECTED_ADDRESS, "");
            String verifiedAddress = preferences.getString(VERIFIED_ADDRESS, "");
            if (!selectedAddress.equalsIgnoreCase(verifiedAddress)) {
                call.reject("Printer perlu diuji semula sebelum auto-cetak.", "PRINTER_TEST_REQUIRED");
                return;
            }
            if (receiptKey.equals(preferences.getString(LAST_AUTO_PRINTED_RECEIPT, ""))) {
                JSObject result = new JSObject();
                result.put("printed", false);
                result.put("skipped", true);
                result.put("printerName", preferences.getString(SELECTED_NAME, "Printer Bluetooth"));
                call.resolve(result);
                return;
            }
        }

        BluetoothAdapter adapter = getBluetoothAdapter();
        String selectedAddress = getPreferences().getString(SELECTED_ADDRESS, "");
        BluetoothDevice device = findBondedDevice(adapter, selectedAddress);
        if (device == null) {
            call.reject("Pilih semula printer yang telah dipasangkan.", "PRINTER_NOT_SELECTED");
            return;
        }

        printExecutor.execute(() -> printText(call, device, text, testPage, automatic, receiptKey));
    }

    private void printText(PluginCall call, BluetoothDevice device, String text, boolean testPage, boolean automatic, String receiptKey) {
        BluetoothSocket socket = null;
        try {
            if (automatic && receiptKey.equals(getPreferences().getString(LAST_AUTO_PRINTED_RECEIPT, ""))) {
                JSObject result = new JSObject();
                result.put("printed", false);
                result.put("skipped", true);
                result.put("printerName", safeDeviceName(device));
                call.resolve(result);
                return;
            }
            socket = connectPrinter(device);
            OutputStream output = socket.getOutputStream();
            output.write(new byte[] { 0x1B, 0x40 });
            output.write(text.getBytes(StandardCharsets.US_ASCII));
            output.write(new byte[] { 0x0A, 0x0A, 0x0A });
            output.flush();

            SharedPreferences.Editor editor = getPreferences().edit();
            if (testPage) editor.putString(VERIFIED_ADDRESS, device.getAddress());
            if (automatic) editor.putString(LAST_AUTO_PRINTED_RECEIPT, receiptKey);
            editor.apply();

            JSObject result = new JSObject();
            result.put("printed", true);
            result.put("skipped", false);
            result.put("printerName", safeDeviceName(device));
            call.resolve(result);
        } catch (SecurityException error) {
            call.reject("Kebenaran Bluetooth tidak tersedia.", "BLUETOOTH_PERMISSION_DENIED");
        } catch (IOException error) {
            call.reject("Tidak dapat menyambung ke printer. Pastikan printer hidup dan tidak digunakan peranti lain.", "PRINTER_CONNECTION_FAILED");
        } finally {
            if (socket != null) {
                try {
                    socket.close();
                } catch (IOException ignored) {
                    // The print attempt already has a definitive result.
                }
            }
        }
    }

    private BluetoothSocket connectPrinter(BluetoothDevice device) throws IOException {
        IOException secureFailure;
        try {
            return connectSocketWithTimeout(device.createRfcommSocketToServiceRecord(SERIAL_PORT_PROFILE));
        } catch (IOException error) {
            secureFailure = error;
        }

        IOException insecureFailure;
        try {
            return connectSocketWithTimeout(device.createInsecureRfcommSocketToServiceRecord(SERIAL_PORT_PROFILE));
        } catch (IOException error) {
            insecureFailure = error;
        }

        try {
            return connectSocketWithTimeout(createLegacyRfcommSocket(device));
        } catch (IOException error) {
            error.addSuppressed(secureFailure);
            error.addSuppressed(insecureFailure);
            throw error;
        }
    }

    private BluetoothSocket createLegacyRfcommSocket(BluetoothDevice device) throws IOException {
        try {
            Method method = device.getClass().getMethod("createRfcommSocket", int.class);
            Object socket = method.invoke(device, 1);
            if (socket instanceof BluetoothSocket) return (BluetoothSocket) socket;
            throw new IOException("Printer did not provide an RFCOMM socket.");
        } catch (NoSuchMethodException | IllegalAccessException | InvocationTargetException error) {
            throw new IOException("Legacy RFCOMM channel is unavailable.", error);
        }
    }

    private BluetoothSocket connectSocketWithTimeout(BluetoothSocket socket) throws IOException {
        ScheduledFuture<?> timeout = connectionTimeoutExecutor.schedule(() -> {
            try {
                socket.close();
            } catch (IOException ignored) {
                // Closing the socket is the timeout signal for the blocking connect call.
            }
        }, CONNECTION_TIMEOUT_SECONDS, TimeUnit.SECONDS);

        try {
            socket.connect();
            return socket;
        } catch (IOException error) {
            try {
                socket.close();
            } catch (IOException ignored) {
                // Preserve the original connection failure.
            }
            throw error;
        } finally {
            timeout.cancel(false);
        }
    }

    private JSObject buildStatus() {
        JSObject status = new JSObject();
        BluetoothAdapter adapter = getBluetoothAdapter();
        boolean permissionGranted = hasBluetoothPermission();
        boolean available = adapter != null;
        boolean enabled = available && permissionGranted && adapter.isEnabled();

        status.put("nativeAndroid", true);
        status.put("directSupported", available);
        status.put("bluetoothAvailable", available);
        status.put("bluetoothEnabled", enabled);
        status.put("permissionGranted", permissionGranted);
        status.put("pairedPrinters", new JSArray());

        SharedPreferences preferences = getPreferences();
        String selectedAddress = preferences.getString(SELECTED_ADDRESS, "");
        String selectedName = preferences.getString(SELECTED_NAME, "");
        String verifiedAddress = preferences.getString(VERIFIED_ADDRESS, "");
        boolean testPrintPassed = !isBlank(selectedAddress) && selectedAddress.equalsIgnoreCase(verifiedAddress);
        status.put("testPrintPassed", testPrintPassed);
        status.put("autoPrintEnabled", testPrintPassed && preferences.getBoolean(AUTO_PRINT_ENABLED, false));
        if (!isBlank(selectedAddress)) {
            JSObject selected = new JSObject();
            selected.put("address", selectedAddress);
            selected.put("name", isBlank(selectedName) ? "Printer Bluetooth" : selectedName);
            status.put("selectedPrinter", selected);
        }

        if (!available || !enabled || !permissionGranted) return status;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            return status;
        }

        List<BluetoothDevice> devices = new ArrayList<>(adapter.getBondedDevices());
        devices.sort(Comparator.comparing(this::safeDeviceName, String.CASE_INSENSITIVE_ORDER));
        JSArray paired = new JSArray();
        for (BluetoothDevice device : devices) {
            JSObject entry = new JSObject();
            entry.put("address", device.getAddress());
            entry.put("name", safeDeviceName(device));
            paired.put(entry);
        }
        status.put("pairedPrinters", paired);
        return status;
    }

    private boolean ensureBluetoothReady(PluginCall call) {
        BluetoothAdapter adapter = getBluetoothAdapter();
        if (adapter == null) {
            call.reject("Peranti ini tidak menyokong Bluetooth.", "BLUETOOTH_UNAVAILABLE");
            return false;
        }
        if (!hasBluetoothPermission()) {
            call.reject("Kebenaran Bluetooth diperlukan untuk mencetak resit.", "BLUETOOTH_PERMISSION_REQUIRED");
            return false;
        }
        if (!adapter.isEnabled()) {
            call.reject("Hidupkan Bluetooth sebelum mencetak.", "BLUETOOTH_DISABLED");
            return false;
        }
        return true;
    }

    private boolean hasBluetoothPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            || getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private BluetoothDevice findBondedDevice(BluetoothAdapter adapter, String address) {
        if (adapter == null || isBlank(address)) return null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            return null;
        }
        Set<BluetoothDevice> bondedDevices = adapter.getBondedDevices();
        for (BluetoothDevice device : bondedDevices) {
            if (address.equalsIgnoreCase(device.getAddress())) return device;
        }
        return null;
    }

    private String safeDeviceName(BluetoothDevice device) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            return "Printer Bluetooth";
        }
        String name = device.getName();
        return isBlank(name) ? "Printer Bluetooth" : name;
    }

    /**
     * Android's java.lang.String.isBlank() is unavailable before API 33 unless
     * core-library desugaring is enabled. RKJ One supports API 24+, so keep the
     * printer bridge on APIs that exist across the complete supported range.
     */
    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private SharedPreferences getPreferences() {
        return getContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private BluetoothAdapter getBluetoothAdapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager == null ? null : manager.getAdapter();
    }

    @Override
    protected void handleOnDestroy() {
        PluginCall pendingCall = takePendingBluetoothPermissionCall();
        if (pendingCall != null) {
            pendingCall.reject("Aplikasi ditutup sebelum kebenaran Bluetooth selesai.", "BLUETOOTH_PERMISSION_INTERRUPTED");
        }
        printExecutor.shutdownNow();
        connectionTimeoutExecutor.shutdownNow();
        super.handleOnDestroy();
    }
}
