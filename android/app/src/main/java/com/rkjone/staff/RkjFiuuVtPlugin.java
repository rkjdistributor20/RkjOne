package com.rkjone.staff;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "RkjFiuuVt")
public class RkjFiuuVtPlugin extends Plugin {
    private static final String FIUU_PACKAGE = "com.rms.mobile.razervt";
    private static final String FIUU_SCHEME = "razervt";
    private static final String FIUU_HOST = "merchant.razer.com";
    private static final String CALLBACK_HOST = "fiuu-vt.rkj.one";
    private static final String CHANNEL = "RPP_DuitNowQR-Offline";
    private static final String PREFS = "rkj_fiuu_vt";
    private static final String PENDING_ORDER = "pending_order";
    private static final String PENDING_AMOUNT = "pending_amount";
    private static final String PENDING_OPERATION = "pending_operation";
    private static final String LAST_RESULT = "last_result";
    private static final String LAST_RESULT_AT = "last_result_at";
    private static final Pattern ORDER_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{4,64}$");
    private static final Pattern TRANSACTION_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{1,80}$");
    private static final Set<String> STATUS_CODES = new HashSet<>(
        Arrays.asList("00", "11", "22", "33", "44", "45", "55")
    );

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        SharedPreferences preferences = preferences();
        result.put("nativeAndroid", true);
        result.put("installed", isPackageInstalled(FIUU_PACKAGE));
        result.put("trustedInstall", isTrustedInstall(FIUU_PACKAGE));
        result.put("packageName", FIUU_PACKAGE);
        result.put("versionName", packageVersion(FIUU_PACKAGE));
        result.put("pendingOrderId", emptyToNull(preferences.getString(PENDING_ORDER, "")));
        result.put("pendingOperation", emptyToNull(preferences.getString(PENDING_OPERATION, "")));
        result.put("resultAvailable", !preferences.getString(LAST_RESULT, "").isEmpty());
        call.resolve(result);
    }

    @PluginMethod
    public void startSale(PluginCall call) {
        String orderId = normalizedOrderId(call.getString("orderId", ""));
        BigDecimal amount = normalizedAmount(call.getString("amount", ""));
        if (orderId == null || amount == null) {
            call.reject("Order ID atau amaun Fiuu VT tidak sah.", "INVALID_FIUU_REQUEST");
            return;
        }

        preferences().edit()
            .putString(PENDING_ORDER, orderId)
            .putString(PENDING_AMOUNT, amount.toPlainString())
            .putString(PENDING_OPERATION, "SALE")
            .remove(LAST_RESULT)
            .remove(LAST_RESULT_AT)
            .apply();

        Uri uri = new Uri.Builder()
            .scheme(FIUU_SCHEME)
            .authority(FIUU_HOST)
            .appendQueryParameter("merchantUrlScheme", getContext().getPackageName())
            .appendQueryParameter("merchantHost", CALLBACK_HOST)
            .appendQueryParameter("opType", "SALE")
            .appendQueryParameter("currency", "MYR")
            .appendQueryParameter("amount", amount.toPlainString())
            .appendQueryParameter("orderId", orderId)
            .appendQueryParameter("channel", CHANNEL)
            .appendQueryParameter("payType", "2")
            .build();
        launchFiuu(call, uri);
    }

    @PluginMethod
    public void checkStatus(PluginCall call) {
        String orderId = normalizedOrderId(call.getString("orderId", ""));
        SharedPreferences preferences = preferences();
        String pendingOrder = preferences.getString(PENDING_ORDER, "");
        if (orderId == null || !orderId.equals(pendingOrder)
            || normalizedAmount(preferences.getString(PENDING_AMOUNT, "")) == null) {
            call.reject("Percubaan Fiuu VT tidak sepadan dengan transaksi aktif.", "FIUU_ATTEMPT_MISMATCH");
            return;
        }

        preferences.edit().putString(PENDING_OPERATION, "STATUS").apply();
        Uri uri = new Uri.Builder()
            .scheme(FIUU_SCHEME)
            .authority(FIUU_HOST)
            .appendQueryParameter("merchantUrlScheme", getContext().getPackageName())
            .appendQueryParameter("merchantHost", CALLBACK_HOST)
            .appendQueryParameter("opType", "STATUS")
            .appendQueryParameter("orderId", orderId)
            .build();
        launchFiuu(call, uri);
    }

    @PluginMethod
    public void getPendingResult(PluginCall call) {
        JSObject response = new JSObject();
        String raw = preferences().getString(LAST_RESULT, "");
        if (raw.isEmpty()) {
            response.put("result", JSONObject.NULL);
            call.resolve(response);
            return;
        }
        try {
            response.put("result", new JSONObject(raw));
            response.put("receivedAt", preferences().getLong(LAST_RESULT_AT, 0));
            call.resolve(response);
        } catch (JSONException error) {
            preferences().edit().remove(LAST_RESULT).remove(LAST_RESULT_AT).apply();
            call.reject("Keputusan Fiuu VT tersimpan rosak.", "INVALID_FIUU_RESULT");
        }
    }

    @PluginMethod
    public void clearPendingResult(PluginCall call) {
        String orderId = normalizedOrderId(call.getString("orderId", ""));
        SharedPreferences preferences = preferences();
        if (orderId == null || !orderId.equals(preferences.getString(PENDING_ORDER, ""))) {
            call.reject("Order ID Fiuu VT tidak sepadan.", "FIUU_ATTEMPT_MISMATCH");
            return;
        }
        preferences.edit()
            .remove(PENDING_ORDER)
            .remove(PENDING_AMOUNT)
            .remove(PENDING_OPERATION)
            .remove(LAST_RESULT)
            .remove(LAST_RESULT_AT)
            .apply();
        call.resolve();
    }

    public boolean handleDeepLink(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        if (uri == null
            || !getContext().getPackageName().equalsIgnoreCase(uri.getScheme())
            || !CALLBACK_HOST.equalsIgnoreCase(uri.getHost())) {
            return false;
        }

        SharedPreferences preferences = preferences();
        String opType = safe(uri.getQueryParameter("opType")).toUpperCase(Locale.ROOT);
        String orderId = safe(first(uri, "orderId", "orderid"));
        String transactionId = safe(first(uri, "tranID", "tranId", "transactionId"));
        String status = safe(uri.getQueryParameter("status"));
        String currency = safe(uri.getQueryParameter("currency")).toUpperCase(Locale.ROOT);
        String channel = safe(uri.getQueryParameter("channel"));
        String payDate = safe(first(uri, "payDate", "paydate"));
        BigDecimal amount = normalizedAmount(uri.getQueryParameter("amount"));
        BigDecimal expectedAmount = normalizedAmount(preferences.getString(PENDING_AMOUNT, ""));

        boolean valid = ("SALE".equals(opType) || "STATUS".equals(opType))
            && hasExactlyOne(uri, "opType")
            && hasExactlyOne(uri, "orderId", "orderid")
            && hasExactlyOne(uri, "tranID", "tranId", "transactionId")
            && hasExactlyOne(uri, "status")
            && hasExactlyOne(uri, "amount")
            && hasExactlyOne(uri, "currency")
            && hasExactlyOne(uri, "channel")
            && hasAtMostOne(uri, "payDate", "paydate")
            && opType.equals(preferences.getString(PENDING_OPERATION, ""))
            && ORDER_PATTERN.matcher(orderId).matches()
            && orderId.equals(preferences.getString(PENDING_ORDER, ""))
            && TRANSACTION_PATTERN.matcher(transactionId).matches()
            && STATUS_CODES.contains(status)
            && "MYR".equals(currency)
            && CHANNEL.equals(channel)
            && amount != null
            && expectedAmount != null
            && amount.compareTo(expectedAmount) == 0;
        if (!valid) return true;

        JSObject result = new JSObject();
        result.put("opType", opType);
        result.put("orderId", orderId);
        result.put("tranID", transactionId);
        result.put("status", status);
        result.put("amount", amount.toPlainString());
        result.put("currency", currency);
        result.put("channel", channel);
        result.put("payDate", payDate.isEmpty() ? JSONObject.NULL : payDate);
        preferences.edit()
            .putString(LAST_RESULT, result.toString())
            .putLong(LAST_RESULT_AT, System.currentTimeMillis())
            .apply();
        notifyListeners("fiuuVtResult", result, true);
        return true;
    }

    private void launchFiuu(PluginCall call, Uri uri) {
        if (!isPackageInstalled(FIUU_PACKAGE)) {
            call.reject("Aplikasi Fiuu VT belum dipasang pada tablet ini.", "FIUU_VT_NOT_INSTALLED");
            return;
        }
        if (!isTrustedInstall(FIUU_PACKAGE)) {
            call.reject("Fiuu VT mesti dipasang melalui Managed Google Play.", "FIUU_VT_UNTRUSTED_INSTALL");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.setPackage(FIUU_PACKAGE);
        try {
            RkjDevicePolicyPlugin.runWithSystemDialogGuard(getActivity(), () -> getActivity().startActivity(intent));
            JSObject result = new JSObject();
            result.put("launched", true);
            call.resolve(result);
        } catch (RuntimeException error) {
            RkjDevicePolicyPlugin.resumeKioskAfterSystemDialog(getActivity());
            call.reject("Aplikasi Fiuu VT tidak dapat dibuka.", "FIUU_VT_LAUNCH_FAILED");
        }
    }

    private boolean isPackageInstalled(String packageName) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                getContext().getPackageManager().getPackageInfo(
                    packageName,
                    PackageManager.PackageInfoFlags.of(0)
                );
            } else {
                getContext().getPackageManager().getPackageInfo(packageName, 0);
            }
            return true;
        } catch (PackageManager.NameNotFoundException error) {
            return false;
        }
    }

    @SuppressWarnings("deprecation")
    private boolean isTrustedInstall(String packageName) {
        try {
            String installer;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                installer = getContext().getPackageManager()
                    .getInstallSourceInfo(packageName)
                    .getInstallingPackageName();
            } else {
                installer = getContext().getPackageManager().getInstallerPackageName(packageName);
            }
            return "com.android.vending".equals(installer);
        } catch (PackageManager.NameNotFoundException error) {
            return false;
        }
    }

    @SuppressWarnings("deprecation")
    private String packageVersion(String packageName) {
        try {
            PackageInfo info;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                info = getContext().getPackageManager().getPackageInfo(
                    packageName,
                    PackageManager.PackageInfoFlags.of(0)
                );
            } else {
                info = getContext().getPackageManager().getPackageInfo(packageName, 0);
            }
            return info.versionName == null ? "" : info.versionName;
        } catch (PackageManager.NameNotFoundException error) {
            return "";
        }
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String normalizedOrderId(String value) {
        String normalized = safe(value);
        return ORDER_PATTERN.matcher(normalized).matches() ? normalized : null;
    }

    private static BigDecimal normalizedAmount(String value) {
        try {
            BigDecimal amount = new BigDecimal(safe(value)).setScale(2, RoundingMode.UNNECESSARY);
            return amount.signum() > 0 && amount.compareTo(new BigDecimal("999999.99")) <= 0 ? amount : null;
        } catch (ArithmeticException | NumberFormatException error) {
            return null;
        }
    }

    private static String first(Uri uri, String... keys) {
        for (String key : keys) {
            String value = uri.getQueryParameter(key);
            if (value != null) return value;
        }
        return "";
    }

    private static boolean hasExactlyOne(Uri uri, String... keys) {
        int count = 0;
        for (String key : keys) count += uri.getQueryParameters(key).size();
        return count == 1;
    }

    private static boolean hasAtMostOne(Uri uri, String... keys) {
        int count = 0;
        for (String key : keys) count += uri.getQueryParameters(key).size();
        return count <= 1;
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private static Object emptyToNull(String value) {
        return value == null || value.isEmpty() ? JSONObject.NULL : value;
    }
}
