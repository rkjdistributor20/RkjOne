package com.rkjone.staff;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
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
import org.json.JSONArray;
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
    private static final String LEGACY_FIUU_PACKAGE = "com.rms.mobile.razervt";
    private static final String FIUU_VT_PLUS_PACKAGE = "com.fiuu.cloudecrvt";
    private static final String FIUU_SCHEME = "razervt";
    private static final String FIUU_HOST = "merchant.razer.com";
    private static final String CALLBACK_HOST = "fiuu-vt.rkj.one";
    private static final String CHANNEL = "RPP_DuitNowQR-Offline";
    private static final String PREFS = "rkj_fiuu_vt";
    private static final String PENDING_ORDER = "pending_order";
    private static final String PENDING_AMOUNT = "pending_amount";
    private static final String PENDING_OPERATION = "pending_operation";
    private static final String RESULT_QUEUE = "result_queue";
    private static final String LAST_RESULT = "last_result";
    private static final String LAST_RESULT_AT = "last_result_at";
    private static final String SALE_LAUNCHED = "sale_launched";
    private static final String STATUS_LAUNCHED = "status_launched";
    private static final String SALE_ACKNOWLEDGED = "sale_acknowledged";
    private static final String LAST_LAUNCH_AT = "last_launch_at";
    private static final String LAST_LAUNCH_OPERATION = "last_launch_operation";
    private static final long MIN_LAUNCH_INTERVAL_MS = 3000L;
    private static final int RESULT_QUEUE_LIMIT = 16;
    private static final Pattern ORDER_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{4,64}$");
    private static final Pattern TRANSACTION_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{1,80}$");
    private static final Pattern ERROR_CODE_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{1,32}$");
    private static final Set<String> STATUS_CODES = new HashSet<>(
        Arrays.asList("00", "11", "22", "33", "44", "45", "55")
    );

    @PluginMethod
    public synchronized void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        SharedPreferences preferences = preferences();
        result.put("bridgeApiVersion", 2);
        result.put("nativeAndroid", true);
        result.put("installed", isPackageInstalled(LEGACY_FIUU_PACKAGE));
        result.put("trustedInstall", isTrustedInstall(LEGACY_FIUU_PACKAGE));
        result.put("packageName", LEGACY_FIUU_PACKAGE);
        result.put("versionName", packageVersion(LEGACY_FIUU_PACKAGE));
        result.put("pendingOrderId", emptyToNull(preferences.getString(PENDING_ORDER, "")));
        result.put("pendingAmount", emptyToNull(preferences.getString(PENDING_AMOUNT, "")));
        result.put("pendingOperation", emptyToNull(preferences.getString(PENDING_OPERATION, "")));
        JSONObject queuedResult = peekQueuedResult(preferences);
        result.put("resultAvailable", queuedResult != null);
        long resultReceivedAt = queuedResult == null ? 0L : queuedResult.optLong("receivedAt", 0L);
        result.put("resultReceivedAt", resultReceivedAt > 0L ? resultReceivedAt : JSONObject.NULL);
        call.resolve(result);
    }

    /**
     * Reports readiness for the current Fiuu VT+ application used by cloudECR.
     * This is intentionally separate from getStatus(), whose contract describes
     * the legacy razervt App-to-App integration.
     */
    @PluginMethod
    public void getVtPlusStatus(PluginCall call) {
        call.resolve(vtPlusStatus());
    }

    /**
     * Opens Fiuu VT+ without sending legacy razervt transaction parameters.
     * cloudECR transaction requests remain server-to-server and must never be
     * routed through the legacy deep-link flow below.
     */
    @PluginMethod
    public void launchVtPlus(PluginCall call) {
        JSObject status = vtPlusStatus();
        if (!Boolean.TRUE.equals(status.getBool("installed"))) {
            call.reject("Aplikasi Fiuu VT+ belum dipasang pada tablet ini.", "FIUU_VT_PLUS_NOT_INSTALLED");
            return;
        }
        if (!Boolean.TRUE.equals(status.getBool("trustedInstall"))) {
            call.reject("Fiuu VT+ mesti dipasang melalui Google Play.", "FIUU_VT_PLUS_UNTRUSTED_INSTALL");
            return;
        }
        if (!Boolean.TRUE.equals(status.getBool("enabled"))) {
            call.reject("Aplikasi Fiuu VT+ dinyahdayakan pada tablet ini.", "FIUU_VT_PLUS_DISABLED");
            return;
        }

        Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(FIUU_VT_PLUS_PACKAGE);
        if (intent == null || intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("Aplikasi Fiuu VT+ tiada skrin pelancaran yang boleh dibuka.", "FIUU_VT_PLUS_NOT_LAUNCHABLE");
            return;
        }

        intent.setPackage(FIUU_VT_PLUS_PACKAGE);
        intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            RkjDevicePolicyPlugin.runWithSystemDialogGuard(getActivity(), () -> getActivity().startActivity(intent));
            JSObject result = new JSObject();
            result.put("launched", true);
            result.put("packageName", FIUU_VT_PLUS_PACKAGE);
            call.resolve(result);
        } catch (RuntimeException error) {
            RkjDevicePolicyPlugin.resumeKioskAfterSystemDialog(getActivity());
            call.reject("Aplikasi Fiuu VT+ tidak dapat dibuka.", "FIUU_VT_PLUS_LAUNCH_FAILED");
        }
    }

    @PluginMethod
    public synchronized void startSale(PluginCall call) {
        String orderId = normalizedOrderId(call.getString("orderId", ""));
        BigDecimal amount = normalizedAmount(call.getString("amount", ""));
        if (orderId == null || amount == null) {
            call.reject("Order ID atau amaun Fiuu VT tidak sah.", "INVALID_FIUU_REQUEST");
            return;
        }

        SharedPreferences preferences = preferences();
        if (!preferences.getString(PENDING_ORDER, "").isEmpty()) {
            call.reject("Percubaan Fiuu VT terdahulu masih perlu direkonsiliasi.", "FIUU_ACTIVE_ATTEMPT_EXISTS");
            return;
        }

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
        launchFiuu(
            call,
            uri,
            "SALE",
            () -> preferences.edit()
                .putString(PENDING_ORDER, orderId)
                .putString(PENDING_AMOUNT, amount.toPlainString())
                .putString(PENDING_OPERATION, "SALE")
                 .putBoolean(SALE_LAUNCHED, true)
                 .putBoolean(STATUS_LAUNCHED, false)
                 .putBoolean(SALE_ACKNOWLEDGED, false)
                 .remove(RESULT_QUEUE)
                .remove(LAST_RESULT)
                .remove(LAST_RESULT_AT)
                .apply(),
            () -> {
                if (orderId.equals(preferences.getString(PENDING_ORDER, ""))) {
                    preferences.edit()
                        .remove(PENDING_ORDER)
                        .remove(PENDING_AMOUNT)
                        .remove(PENDING_OPERATION)
                         .remove(SALE_LAUNCHED)
                         .remove(STATUS_LAUNCHED)
                         .remove(SALE_ACKNOWLEDGED)
                        .apply();
                }
            }
        );
    }

    @PluginMethod
    public synchronized void acknowledgeResult(PluginCall call) {
        String orderId = normalizedOrderId(call.getString("orderId", ""));
        String opType = safe(call.getString("opType", "")).toUpperCase(Locale.ROOT);
        String transactionId = safe(call.getString("transactionId", ""));
        String status = safe(call.getString("status", ""));
        SharedPreferences preferences = preferences();
        if (orderId == null || !orderId.equals(preferences.getString(PENDING_ORDER, ""))) {
            call.reject("Percubaan Fiuu VT tidak sepadan dengan transaksi aktif.", "FIUU_ATTEMPT_MISMATCH");
            return;
        }
        if (!("SALE".equals(opType) || "STATUS".equals(opType))
            || !TRANSACTION_PATTERN.matcher(transactionId).matches()
            || !STATUS_CODES.contains(status)) {
            call.reject("Pengesahan keputusan Fiuu VT tidak sah.", "INVALID_FIUU_RESULT_ACK");
            return;
        }

        JSONArray queue = loadResultQueue(preferences);
        int resultIndex = findQueuedResultIndex(
            queue,
            opType,
            orderId,
            transactionId,
            status,
            ""
        );
        if (resultIndex < 0) {
            call.reject("Keputusan Fiuu VT tiada atau sudah diproses.", "FIUU_RESULT_MISSING");
            return;
        }

        queue.remove(resultIndex);
        saveResultQueue(preferences, queue);
        if ("SALE".equals(opType)) {
            preferences.edit()
                .putBoolean(SALE_ACKNOWLEDGED, true)
                .putString(PENDING_OPERATION, "STATUS")
                .apply();
        }
        call.resolve();
    }

    @PluginMethod
    public synchronized void acknowledgeError(PluginCall call) {
        String orderId = normalizedOrderId(call.getString("orderId", ""));
        String opType = safe(call.getString("opType", "")).toUpperCase(Locale.ROOT);
        String errorCode = safe(call.getString("errorCode", ""));
        SharedPreferences preferences = preferences();
        if (orderId == null || !orderId.equals(preferences.getString(PENDING_ORDER, ""))) {
            call.reject("Percubaan Fiuu VT tidak sepadan dengan transaksi aktif.", "FIUU_ATTEMPT_MISMATCH");
            return;
        }
        // Only a STATUS error is safe to consume: SALE may already have reached
        // Fiuu, so dropping that error could allow an unsafe second charge.
        if (!"STATUS".equals(opType) || !ERROR_CODE_PATTERN.matcher(errorCode).matches()) {
            call.reject("Pengesahan ralat Fiuu VT tidak sah.", "INVALID_FIUU_ERROR_ACK");
            return;
        }

        JSONArray queue = loadResultQueue(preferences);
        int resultIndex = findQueuedResultIndex(
            queue,
            opType,
            orderId,
            "",
            "",
            errorCode
        );
        if (resultIndex < 0) {
            call.reject("Ralat Fiuu VT tiada atau sudah diproses.", "FIUU_RESULT_MISSING");
            return;
        }
        queue.remove(resultIndex);
        saveResultQueue(preferences, queue);
        call.resolve();
    }

    @PluginMethod
    public synchronized void checkStatus(PluginCall call) {
        String orderId = normalizedOrderId(call.getString("orderId", ""));
        SharedPreferences preferences = preferences();
        String pendingOrder = preferences.getString(PENDING_ORDER, "");
        if (orderId == null || !orderId.equals(pendingOrder)
            || normalizedAmount(preferences.getString(PENDING_AMOUNT, "")) == null) {
            call.reject("Percubaan Fiuu VT tidak sepadan dengan transaksi aktif.", "FIUU_ATTEMPT_MISMATCH");
            return;
        }
        JSONArray queue = loadResultQueue(preferences);
        if (hasBlockingResultBeforeStatus(queue)) {
            call.reject("Keputusan Fiuu VT tersimpan mesti diproses sebelum semakan STATUS.", "FIUU_RESULT_PENDING");
            return;
        }

        String previousOperation = preferences.getString(PENDING_OPERATION, "SALE");
        boolean previousStatusLaunched = preferences.getBoolean(STATUS_LAUNCHED, false);
        Uri uri = new Uri.Builder()
            .scheme(FIUU_SCHEME)
            .authority(FIUU_HOST)
            .appendQueryParameter("merchantUrlScheme", getContext().getPackageName())
            .appendQueryParameter("merchantHost", CALLBACK_HOST)
            .appendQueryParameter("opType", "STATUS")
            .appendQueryParameter("orderId", orderId)
            .build();
        launchFiuu(
            call,
            uri,
            "STATUS",
            () -> preferences.edit()
                .putString(PENDING_OPERATION, "STATUS")
                .putBoolean(STATUS_LAUNCHED, true)
                .apply(),
            () -> preferences.edit()
                .putString(PENDING_OPERATION, previousOperation)
                .putBoolean(STATUS_LAUNCHED, previousStatusLaunched)
                .apply()
        );
    }

    @PluginMethod
    public synchronized void getPendingResult(PluginCall call) {
        JSObject response = new JSObject();
        SharedPreferences preferences = preferences();
        JSONObject queuedResult = peekQueuedResult(preferences);
        if (queuedResult == null) {
            response.put("result", JSONObject.NULL);
            call.resolve(response);
            return;
        }
        response.put("result", queuedResult.optJSONObject("result"));
        response.put("receivedAt", queuedResult.optLong("receivedAt", 0L));
        call.resolve(response);
    }

    @PluginMethod
    public synchronized void clearPendingResult(PluginCall call) {
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
            .remove(RESULT_QUEUE)
            .remove(LAST_RESULT)
            .remove(LAST_RESULT_AT)
            .remove(SALE_LAUNCHED)
            .remove(STATUS_LAUNCHED)
            .remove(SALE_ACKNOWLEDGED)
            .remove(LAST_LAUNCH_AT)
            .remove(LAST_LAUNCH_OPERATION)
            .apply();
        call.resolve();
    }

    public synchronized boolean handleDeepLink(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        if (uri == null
            || !getContext().getPackageName().equalsIgnoreCase(uri.getScheme())
            || !CALLBACK_HOST.equalsIgnoreCase(uri.getHost())) {
            return false;
        }

        SharedPreferences preferences = preferences();
        String pendingOperation = preferences.getString(PENDING_OPERATION, "");
        String pendingOrder = preferences.getString(PENDING_ORDER, "");
        String errorCode = safe(uri.getQueryParameter("errorCode"));
        String rawErrorMessage = safe(first(uri, "errorMsg", "errorMessage"));
        String errorMessage = normalizedErrorMessage(rawErrorMessage);
        if (!errorCode.isEmpty() || !rawErrorMessage.isEmpty()) {
            boolean validError = ("SALE".equals(pendingOperation) || "STATUS".equals(pendingOperation))
                && ORDER_PATTERN.matcher(pendingOrder).matches()
                && hasExactlyOne(uri, "errorCode")
                && hasExactlyOne(uri, "errorMsg", "errorMessage")
                && hasNone(
                    uri,
                    "opType", "orderId", "orderid", "tranID", "tranId", "transactionId",
                    "status", "amount", "currency", "channel", "payDate", "paydate"
                )
                && ERROR_CODE_PATTERN.matcher(errorCode).matches()
                && errorMessage != null;
            if (!validError) return true;

            JSObject errorResult = new JSObject();
            errorResult.put("kind", "ERROR");
            errorResult.put("opType", pendingOperation);
            errorResult.put("orderId", pendingOrder);
            errorResult.put("errorCode", errorCode);
            errorResult.put("errorMessage", errorMessage);
            enqueueResult(preferences, errorResult);
            notifyListeners("fiuuVtResult", errorResult, true);
            return true;
        }

        String opType = safe(uri.getQueryParameter("opType")).toUpperCase(Locale.ROOT);
        String orderId = safe(first(uri, "orderId", "orderid"));
        String transactionId = safe(first(uri, "tranID", "tranId", "transactionId"));
        String status = safe(uri.getQueryParameter("status"));
        String currency = safe(uri.getQueryParameter("currency")).toUpperCase(Locale.ROOT);
        String channel = safe(uri.getQueryParameter("channel"));
        String payDate = safe(first(uri, "payDate", "paydate"));
        BigDecimal amount = normalizedAmount(uri.getQueryParameter("amount"));
        BigDecimal expectedAmount = normalizedAmount(preferences.getString(PENDING_AMOUNT, ""));

        boolean operationWasLaunched = "SALE".equals(opType)
            ? preferences.getBoolean(SALE_LAUNCHED, false)
            : preferences.getBoolean(STATUS_LAUNCHED, false);
        boolean valid = ("SALE".equals(opType) || "STATUS".equals(opType))
            && hasExactlyOne(uri, "opType")
            && hasExactlyOne(uri, "orderId", "orderid")
            && hasExactlyOne(uri, "tranID", "tranId", "transactionId")
            && hasExactlyOne(uri, "status")
            && hasExactlyOne(uri, "amount")
            && hasExactlyOne(uri, "currency")
            && hasExactlyOne(uri, "channel")
            && hasAtMostOne(uri, "payDate", "paydate")
            && operationWasLaunched
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
        enqueueResult(preferences, result);
        notifyListeners("fiuuVtResult", result, true);
        return true;
    }

    /**
     * Fiuu may return SALE and STATUS callbacks only a few milliseconds apart.
     * Persist every distinct callback until JavaScript acknowledges that exact
     * item; a single last-result slot can silently discard STATUS=00.
     */
    private synchronized void enqueueResult(SharedPreferences preferences, JSObject result) {
        JSONArray queue = loadResultQueue(preferences);
        JSONObject value;
        try {
            value = new JSONObject(result.toString());
        } catch (JSONException error) {
            return;
        }
        if (findEquivalentResultIndex(queue, value) >= 0) return;

        JSONObject entry = new JSONObject();
        try {
            entry.put("receivedAt", System.currentTimeMillis());
            entry.put("result", value);
            queue.put(entry);
        } catch (JSONException error) {
            return;
        }

        while (queue.length() > RESULT_QUEUE_LIMIT) {
            int removableIndex = findSafestResultToDrop(queue);
            queue.remove(removableIndex < 0 ? 0 : removableIndex);
        }
        saveResultQueue(preferences, queue);
    }

    private JSONArray loadResultQueue(SharedPreferences preferences) {
        JSONArray cleanQueue = new JSONArray();
        String rawQueue = preferences.getString(RESULT_QUEUE, "");
        if (!rawQueue.isEmpty()) {
            try {
                JSONArray storedQueue = new JSONArray(rawQueue);
                for (int index = 0; index < storedQueue.length(); index++) {
                    JSONObject entry = storedQueue.optJSONObject(index);
                    if (entry != null && entry.optJSONObject("result") != null) cleanQueue.put(entry);
                }
            } catch (JSONException ignored) {
                // Discard only the malformed queue. The legacy slot below may
                // still contain the callback saved by an older RKJ One build.
            }
        }

        String legacyResult = preferences.getString(LAST_RESULT, "");
        if (!legacyResult.isEmpty()) {
            try {
                JSONObject legacyValue = new JSONObject(legacyResult);
                if (findEquivalentResultIndex(cleanQueue, legacyValue) < 0) {
                    JSONObject legacyEntry = new JSONObject();
                    legacyEntry.put("receivedAt", preferences.getLong(LAST_RESULT_AT, System.currentTimeMillis()));
                    legacyEntry.put("result", legacyValue);
                    cleanQueue.put(legacyEntry);
                }
            } catch (JSONException ignored) {
                // A malformed legacy value is ignored and removed on the next
                // successful queue write or explicit attempt clear.
            }
        }
        return cleanQueue;
    }

    private void saveResultQueue(SharedPreferences preferences, JSONArray queue) {
        SharedPreferences.Editor editor = preferences.edit()
            .remove(LAST_RESULT)
            .remove(LAST_RESULT_AT);
        if (queue.length() == 0) editor.remove(RESULT_QUEUE);
        else editor.putString(RESULT_QUEUE, queue.toString());
        editor.apply();
    }

    private JSONObject peekQueuedResult(SharedPreferences preferences) {
        JSONArray queue = loadResultQueue(preferences);
        if (queue.length() == 0) return null;
        boolean saleAcknowledged = preferences.getBoolean(SALE_ACKNOWLEDGED, false);
        int selectedIndex = selectResultIndex(queue, saleAcknowledged);
        return selectedIndex < 0 ? null : queue.optJSONObject(selectedIndex);
    }

    private int selectResultIndex(JSONArray queue, boolean saleAcknowledged) {
        if (!saleAcknowledged) {
            int saleIndex = findNormalResultIndex(queue, "SALE", "");
            if (saleIndex >= 0) return saleIndex;
        }
        int successIndex = findNormalResultIndex(queue, "STATUS", "00");
        if (successIndex >= 0) return successIndex;
        int statusIndex = findNormalResultIndex(queue, "STATUS", "");
        if (statusIndex >= 0) return statusIndex;
        int saleIndex = findNormalResultIndex(queue, "SALE", "");
        if (saleIndex >= 0) return saleIndex;
        return queue.length() == 0 ? -1 : 0;
    }

    private int findNormalResultIndex(JSONArray queue, String opType, String status) {
        for (int index = 0; index < queue.length(); index++) {
            JSONObject entry = queue.optJSONObject(index);
            JSONObject value = entry == null ? null : entry.optJSONObject("result");
            if (value == null || "ERROR".equals(value.optString("kind"))) continue;
            if (!opType.equals(value.optString("opType"))) continue;
            if (status.isEmpty() || status.equals(value.optString("status"))) return index;
        }
        return -1;
    }

    private boolean hasBlockingResultBeforeStatus(JSONArray queue) {
        for (int index = 0; index < queue.length(); index++) {
            JSONObject entry = queue.optJSONObject(index);
            JSONObject value = entry == null ? null : entry.optJSONObject("result");
            if (value != null && !"ERROR".equals(value.optString("kind"))) return true;
        }
        return false;
    }

    private int findQueuedResultIndex(
        JSONArray queue,
        String opType,
        String orderId,
        String transactionId,
        String status,
        String errorCode
    ) {
        for (int index = 0; index < queue.length(); index++) {
            JSONObject entry = queue.optJSONObject(index);
            JSONObject value = entry == null ? null : entry.optJSONObject("result");
            if (value == null
                || !opType.equals(value.optString("opType"))
                || !orderId.equals(value.optString("orderId"))) continue;
            if (!errorCode.isEmpty()) {
                if ("ERROR".equals(value.optString("kind"))
                    && errorCode.equals(value.optString("errorCode"))) return index;
                continue;
            }
            if (!"ERROR".equals(value.optString("kind"))
                && transactionId.equals(value.optString("tranID"))
                && status.equals(value.optString("status"))) return index;
        }
        return -1;
    }

    private int findEquivalentResultIndex(JSONArray queue, JSONObject candidate) {
        String candidateKind = candidate.optString("kind");
        for (int index = 0; index < queue.length(); index++) {
            JSONObject entry = queue.optJSONObject(index);
            JSONObject value = entry == null ? null : entry.optJSONObject("result");
            if (value == null
                || !candidateKind.equals(value.optString("kind"))
                || !candidate.optString("opType").equals(value.optString("opType"))
                || !candidate.optString("orderId").equals(value.optString("orderId"))) continue;
            if ("ERROR".equals(candidateKind)) {
                if (candidate.optString("errorCode").equals(value.optString("errorCode"))) return index;
            } else if (candidate.optString("tranID").equals(value.optString("tranID"))
                && candidate.optString("status").equals(value.optString("status"))) {
                return index;
            }
        }
        return -1;
    }

    private int findSafestResultToDrop(JSONArray queue) {
        for (int index = 0; index < queue.length(); index++) {
            JSONObject entry = queue.optJSONObject(index);
            JSONObject value = entry == null ? null : entry.optJSONObject("result");
            if (value == null || "ERROR".equals(value.optString("kind"))) return index;
            if ("STATUS".equals(value.optString("opType")) && !"00".equals(value.optString("status"))) {
                return index;
            }
        }
        return -1;
    }

    private void launchFiuu(
        PluginCall call,
        Uri uri,
        String operation,
        Runnable prepare,
        Runnable rollback
    ) {
        if (!isPackageInstalled(LEGACY_FIUU_PACKAGE)) {
            call.reject("Aplikasi Fiuu VT belum dipasang pada tablet ini.", "FIUU_VT_NOT_INSTALLED");
            return;
        }
        if (!isTrustedInstall(LEGACY_FIUU_PACKAGE)) {
            call.reject("Fiuu VT mesti dipasang melalui Managed Google Play.", "FIUU_VT_UNTRUSTED_INSTALL");
            return;
        }
        SharedPreferences preferences = preferences();
        long now = System.currentTimeMillis();
        long lastLaunchAt = preferences.getLong(LAST_LAUNCH_AT, 0L);
        if (lastLaunchAt > 0L && now - lastLaunchAt < MIN_LAUNCH_INTERVAL_MS) {
            call.reject("Fiuu VT sedang dibuka. Tunggu sebentar sebelum cuba semula.", "FIUU_VT_LAUNCH_IN_PROGRESS");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.setPackage(LEGACY_FIUU_PACKAGE);
        try {
            prepare.run();
            preferences.edit()
                .putLong(LAST_LAUNCH_AT, now)
                .putString(LAST_LAUNCH_OPERATION, operation)
                .apply();
            RkjDevicePolicyPlugin.runWithSystemDialogGuard(getActivity(), () -> getActivity().startActivity(intent));
            JSObject result = new JSObject();
            result.put("launched", true);
            call.resolve(result);
        } catch (RuntimeException error) {
            rollback.run();
            preferences.edit().remove(LAST_LAUNCH_AT).remove(LAST_LAUNCH_OPERATION).apply();
            RkjDevicePolicyPlugin.resumeKioskAfterSystemDialog(getActivity());
            call.reject("Aplikasi Fiuu VT tidak dapat dibuka.", "FIUU_VT_LAUNCH_FAILED");
        }
    }

    private JSObject vtPlusStatus() {
        boolean installed = isPackageInstalled(FIUU_VT_PLUS_PACKAGE);
        boolean trustedInstall = installed && isTrustedInstall(FIUU_VT_PLUS_PACKAGE);
        boolean enabled = installed && isPackageEnabled(FIUU_VT_PLUS_PACKAGE);
        boolean launchable = enabled && isPackageLaunchable(FIUU_VT_PLUS_PACKAGE);

        JSObject result = new JSObject();
        result.put("nativeAndroid", true);
        result.put("packageName", FIUU_VT_PLUS_PACKAGE);
        result.put("installed", installed);
        result.put("trustedInstall", trustedInstall);
        result.put("enabled", enabled);
        result.put("launchable", launchable);
        result.put("ready", installed && trustedInstall && enabled && launchable);
        result.put("versionName", installed ? packageVersion(FIUU_VT_PLUS_PACKAGE) : "");
        return result;
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

    private boolean isPackageEnabled(String packageName) {
        try {
            PackageManager packageManager = getContext().getPackageManager();
            ApplicationInfo applicationInfo;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                applicationInfo = packageManager.getApplicationInfo(
                    packageName,
                    PackageManager.ApplicationInfoFlags.of(0)
                );
            } else {
                applicationInfo = packageManager.getApplicationInfo(packageName, 0);
            }

            int enabledSetting = packageManager.getApplicationEnabledSetting(packageName);
            return applicationInfo.enabled
                && enabledSetting != PackageManager.COMPONENT_ENABLED_STATE_DISABLED
                && enabledSetting != PackageManager.COMPONENT_ENABLED_STATE_DISABLED_USER
                && enabledSetting != PackageManager.COMPONENT_ENABLED_STATE_DISABLED_UNTIL_USED;
        } catch (PackageManager.NameNotFoundException error) {
            return false;
        }
    }

    private boolean isPackageLaunchable(String packageName) {
        Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(packageName);
        return intent != null && intent.resolveActivity(getContext().getPackageManager()) != null;
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

    private static boolean hasNone(Uri uri, String... keys) {
        for (String key : keys) {
            if (!uri.getQueryParameters(key).isEmpty()) return false;
        }
        return true;
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private static String normalizedErrorMessage(String value) {
        String normalized = safe(value).replaceAll("[\\p{Cntrl}]", " ").replaceAll("\\s+", " ").trim();
        if (normalized.isEmpty() || normalized.length() > 160) return null;
        return normalized;
    }

    private static Object emptyToNull(String value) {
        return value == null || value.isEmpty() ? JSONObject.NULL : value;
    }
}
