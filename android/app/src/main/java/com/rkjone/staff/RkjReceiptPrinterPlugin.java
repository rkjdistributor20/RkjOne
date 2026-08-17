package com.rkjone.staff;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "RkjReceiptPrinter",
    permissions = {
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class RkjReceiptPrinterPlugin extends Plugin {
    private static final String PREFERENCES = "rkj_receipt_printer";
    private static final String SELECTED_ADDRESS = "selected_address";
    private static final String SELECTED_NAME = "selected_name";
    private static final UUID SERIAL_PORT_PROFILE = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int MAX_PRINT_CHARACTERS = 16000;

    private final ExecutorService printExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void requestBluetoothPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || hasBluetoothPermission()) {
            call.resolve(buildStatus());
            return;
        }
        requestPermissionForAlias("bluetooth", call, "bluetoothPermissionCallback");
    }

    @PermissionCallback
    private void bluetoothPermissionCallback(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("Kebenaran Bluetooth diperlukan untuk mencetak resit.", "BLUETOOTH_PERMISSION_DENIED");
            return;
        }
        call.resolve(buildStatus());
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

        getPreferences().edit()
            .putString(SELECTED_ADDRESS, selected.getAddress())
            .putString(SELECTED_NAME, safeDeviceName(selected))
            .apply();
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void clearPrinter(PluginCall call) {
        getPreferences().edit().remove(SELECTED_ADDRESS).remove(SELECTED_NAME).apply();
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
        if (text.isBlank()) {
            call.reject("Kandungan resit kosong.", "EMPTY_RECEIPT");
            return;
        }
        if (text.length() > MAX_PRINT_CHARACTERS) {
            call.reject("Kandungan resit terlalu panjang.", "RECEIPT_TOO_LONG");
            return;
        }

        BluetoothAdapter adapter = getBluetoothAdapter();
        String selectedAddress = getPreferences().getString(SELECTED_ADDRESS, "");
        BluetoothDevice device = findBondedDevice(adapter, selectedAddress);
        if (device == null) {
            call.reject("Pilih semula printer yang telah dipasangkan.", "PRINTER_NOT_SELECTED");
            return;
        }

        printExecutor.execute(() -> printText(call, device, text));
    }

    private void printText(PluginCall call, BluetoothDevice device, String text) {
        BluetoothSocket socket = null;
        try {
            socket = device.createRfcommSocketToServiceRecord(SERIAL_PORT_PROFILE);
            socket.connect();
            OutputStream output = socket.getOutputStream();
            output.write(new byte[] { 0x1B, 0x40 });
            output.write(text.getBytes(StandardCharsets.US_ASCII));
            output.write(new byte[] { 0x0A, 0x0A, 0x0A });
            output.flush();

            JSObject result = new JSObject();
            result.put("printed", true);
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
        if (!selectedAddress.isBlank()) {
            JSObject selected = new JSObject();
            selected.put("address", selectedAddress);
            selected.put("name", selectedName.isBlank() ? "Printer Bluetooth" : selectedName);
            status.put("selectedPrinter", selected);
        }

        if (!available || !enabled || !permissionGranted) return status;

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
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || getPermissionState("bluetooth") == PermissionState.GRANTED;
    }

    private BluetoothDevice findBondedDevice(BluetoothAdapter adapter, String address) {
        if (adapter == null || address == null || address.isBlank()) return null;
        Set<BluetoothDevice> bondedDevices = adapter.getBondedDevices();
        for (BluetoothDevice device : bondedDevices) {
            if (address.equalsIgnoreCase(device.getAddress())) return device;
        }
        return null;
    }

    private String safeDeviceName(BluetoothDevice device) {
        String name = device.getName();
        return name == null || name.isBlank() ? "Printer Bluetooth" : name;
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
        printExecutor.shutdownNow();
        super.handleOnDestroy();
    }
}
