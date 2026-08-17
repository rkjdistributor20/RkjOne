package com.rkjone.staff;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

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
}
