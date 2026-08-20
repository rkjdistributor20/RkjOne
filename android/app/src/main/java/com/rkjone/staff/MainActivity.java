package com.rkjone.staff;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RkjDevicePolicyPlugin.class);
        registerPlugin(RkjReceiptPrinterPlugin.class);
        super.onCreate(savedInstanceState);
        WindowCompat.enableEdgeToEdge(getWindow());

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.flush();

        WebSettings webSettings = bridge.getWebView().getSettings();
        webSettings.setDomStorageEnabled(true);
    }

    @Override
    public void onResume() {
        super.onResume();
        RkjDevicePolicyPlugin.enforceKiosk(this);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) RkjDevicePolicyPlugin.enforceKiosk(this);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != RkjReceiptPrinterPlugin.BLUETOOTH_PERMISSION_REQUEST_CODE) return;

        PluginHandle handle = bridge.getPlugin("RkjReceiptPrinter");
        if (handle != null && handle.getInstance() instanceof RkjReceiptPrinterPlugin) {
            ((RkjReceiptPrinterPlugin) handle.getInstance())
                .onBluetoothPermissionResult(permissions, grantResults);
        }
    }
}
