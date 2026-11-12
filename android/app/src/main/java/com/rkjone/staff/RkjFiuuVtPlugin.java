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
    private static final String VOID_LAUNCHED = "void_launched";
    private static final String SALE_ACKNOWLEDGED = "sale_acknowledged";
    private static final String LAST_LAUNCH_AT = "last_launch_at";
    private static final String LAST_LAUNCH_OPERATION = "last_launch_operation";
    private static final String ACTIVE_ATTEMPT_ID = "active_attempt_id";
    private static final String ACTIVE_CALLBACK_HOST = "active_callback_host";
    private static final String ACTIVE_ATTEMPT_OPERATION = "active_attempt_operation";
    private static final String ACTIVE_CALLBACK_RECEIVED = "active_callback_received";
    private static final String CALLBACK_ATTEMPT_REGISTRY = "callback_attempt_registry";
    private static final int BRIDGE_API_VERSION = 6;
    private static final long MIN_LAUNCH_INTERVAL_MS = 3000L;
    private static final long STALE_VOID_RECOVERY_MS = 30000L;
    private static final int RESULT_QUEUE_LIMIT = 128;
    private static final int CALLBACK_ATTEMPT_REGISTRY_LIMIT = 128;
    private static final Pattern ORDER_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{4,64}$");
    private static final Pattern TRANSACTION_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{1,80}$");
    private static final Pattern ERROR_CODE_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{1,32}$");
    private static final Pattern ATTEMPT_ID_PATTERN = Pattern.compile(
        "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    );
    private static final Pattern CALLBACK_HOST_PATTERN = Pattern.compile(
        "^a-[0-9a-f]{32}\\.fiuu-vt\\.rkj\\.one$"
    );
    private static final Set<String> STATUS_CODES = new HashSet<>(
        Arrays.asList("00", "11", "22", "33", "44", "45", "55")
    );

    @PluginMethod
    public synchronized void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        SharedPreferences preferences = preferences();
        loadCallbackAttemptRegistry(preferences);
        String pendingOperation = recoverStaleVoidIfNeeded(preferences, System.currentTimeMillis());
        result.put("bridgeApiVersion", BRIDGE_API_VERSION);
        result.put("nativeAndroid", true);
        result.put("installed", isPackageInstalled(LEGACY_FIUU_PACKAGE));
        result.put("trustedInstall", isTrustedInstall(LEGACY_FIUU_PACKAGE));
        result.put("packageName", LEGACY_FIUU_PACKAGE);
        result.put("versionName", packageVersion(LEGACY_FIUU_PACKAGE));
        result.put("pendingOrderId", emptyToNull(preferences.getString(PENDING_ORDER, "")));
        result.put("pendingAmount", emptyToNull(preferences.getString(PENDING_AMOUNT, "")));
        result.put("pendingOperation", emptyToNull(pendingOperation));
        result.put(
            "activeCallbackAttemptId",
            emptyToNull(preferences.getString(ACTIVE_ATTEMPT_ID, ""))
        );
        result.put(
            "activeCallbackHost",
            emptyToNull(preferences.getString(ACTIVE_CALLBACK_HOST, ""))
        );
        result.put(
            "pendingOperationStartedAt",
            pendingOperationStartedAt(preferences, pendingOperation)
        );
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
        String attemptId = normalizedAttemptId(call.getString("attemptId", ""));
        String callbackHost = normalizedCallbackHost(call.getString("callbackHost", ""));
        Integer generation = call.getInt("generation");
        if (orderId == null || amount == null || generation == null || generation < 1
            || !isMatchingCallbackAttempt(attemptId, callbackHost)) {
            call.reject("Order ID, amaun atau cubaan callback Fiuu VT tidak sah.", "INVALID_FIUU_REQUEST");
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
            .appendQueryParameter("merchantHost", callbackHost)
            .appendQueryParameter("opType", "SALE")
            .appendQueryParameter("currency", "MYR")
            .appendQueryParameter("amount", amount.toPlainString())
            .appendQueryParameter("orderId", orderId)
            .appendQueryParameter("channel", CHANNEL)
            .appendQueryParameter("payType", "2")
            .build();
        boolean[] callbackAttemptRegistered = { false };
        launchFiuu(
            call,
            uri,
            "SALE",
            () -> callbackAttemptRegistered[0] = registerCallbackAttempt(
                preferences,
                attemptId,
                callbackHost,
                "SALE",
                orderId,
                amount.toPlainString(),
                generation,
                preferences.edit()
                    .putString(PENDING_ORDER, orderId)
                    .putString(PENDING_AMOUNT, amount.toPlainString())
                    .putString(PENDING_OPERATION, "SALE")
                    .putBoolean(SALE_LAUNCHED, true)
                    .putBoolean(STATUS_LAUNCHED, false)
                    .putBoolean(VOID_LAUNCHED, false)
                    .putBoolean(SALE_ACKNOWLEDGED, false)
            ),
            () -> {
                if (orderId.equals(preferences.getString(PENDING_ORDER, ""))) {
                    SharedPreferences.Editor rollbackEditor = preferences.edit()
                        .remove(PENDING_ORDER)
                        .remove(PENDING_AMOUNT)
                        .remove(PENDING_OPERATION)
                        .remove(SALE_LAUNCHED)
                        .remove(STATUS_LAUNCHED)
                        .remove(VOID_LAUNCHED)
                        .remove(SALE_ACKNOWLEDGED);
                    if (callbackAttemptRegistered[0]) {
                        removeCallbackAttempt(preferences, attemptId, rollbackEditor);
                    } else {
                        rollbackEditor.commit();
                    }
                }
            }
        );
    }

    @PluginMethod
    public synchronized void acknowledgeResult(PluginCall call) {
        String callbackAttemptId = normalizedAttemptId(call.getString("callbackAttemptId", ""));
        String orderId = normalizedOrderId(call.getString("orderId", ""));
        String opType = safe(call.getString("opType", "")).toUpperCase(Locale.ROOT);
        String transactionId = safe(call.getString("transactionId", ""));
        String status = safe(call.getString("status", ""));
        SharedPreferences preferences = preferences();
        if (callbackAttemptId == null
            || orderId == null
            || !("SALE".equals(opType) || "STATUS".equals(opType) || "VOID".equals(opType))
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
            "",
            callbackAttemptId
        );
        if (resultIndex < 0) {
            call.reject("Keputusan Fiuu VT tiada atau sudah diproses.", "FIUU_RESULT_MISSING");
            return;
        }

        queue.remove(resultIndex);
        SharedPreferences.Editor acknowledgementEditor = writeResultQueue(preferences.edit(), queue);
        if ("SALE".equals(opType) && orderId.equals(preferences.getString(PENDING_ORDER, ""))) {
            acknowledgementEditor
                .putBoolean(SALE_ACKNOWLEDGED, true)
                .putString(PENDING_OPERATION, "STATUS");
        } else if ("VOID".equals(opType) && orderId.equals(preferences.getString(PENDING_ORDER, ""))) {
            // A VOID callback is not authoritative payment evidence. Return
            // the bridge to STATUS mode so RKJ One can immediately reconcile
            // the original order instead of leaving the cashier stranded in
            // a permanent pendingOperation=VOID state.
            acknowledgementEditor
                .putString(PENDING_OPERATION, "STATUS")
                .putBoolean(VOID_LAUNCHED, false);
        }
        if (!removeCallbackAttempt(preferences, callbackAttemptId, acknowledgementEditor)) {
            call.reject("Keputusan Fiuu VT belum dapat disimpan dengan selamat.", "FIUU_RESULT_ACK_PERSIST_FAILED");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public synchronized void acknowledgeError(PluginCall call) {
        String callbackAttemptId = normalizedAttemptId(call.getString("callbackAttemptId", ""));
        String orderId = normalizedOrderId(call.getString("orderId", ""));
        String opType = safe(call.getString("opType", "")).toUpperCase(Locale.ROOT);
        String errorCode = safe(call.getString("errorCode", ""));
        SharedPreferences preferences = preferences();
        // STATUS and VOID errors are safe to consume for a retry. SALE may
        // already have reached Fiuu, so its ambiguous error must be retained.
        if (callbackAttemptId == null
            || orderId == null
            || !("STATUS".equals(opType) || "VOID".equals(opType))
            || !ERROR_CODE_PATTERN.matcher(errorCode).matches()) {
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
            errorCode,
            callbackAttemptId
        );
        if (resultIndex < 0) {
            call.reject("Ralat Fiuu VT tiada atau sudah diproses.", "FIUU_RESULT_MISSING");
            return;
        }
        queue.remove(resultIndex);
        SharedPreferences.Editor acknowledgementEditor = writeResultQueue(preferences.edit(), queue);
        if ("VOID".equals(opType) && orderId.equals(preferences.getString(PENDING_ORDER, ""))) {
            acknowledgementEditor
                .putString(PENDING_OPERATION, "STATUS")
                .putBoolean(VOID_LAUNCHED, false);
        }
        if (!removeCallbackAttempt(preferences, callbackAttemptId, acknowledgementEditor)) {
            call.reject("Ralat Fiuu VT belum dapat disimpan dengan selamat.", "FIUU_RESULT_ACK_PERSIST_FAILED");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public synchronized void checkStatus(PluginCall call) {
        String orderId = normalizedOrderId(call.getString("orderId", ""));
        BigDecimal requestedAmount = normalizedAmount(call.getString("amount", ""));
        String attemptId = normalizedAttemptId(call.getString("attemptId", ""));
        String callbackHost = normalizedCallbackHost(call.getString("callbackHost", ""));
        Integer generation = call.getInt("generation");
        SharedPreferences preferences = preferences();
        String pendingOrder = preferences.getString(PENDING_ORDER, "");
        BigDecimal pendingAmount = normalizedAmount(preferences.getString(PENDING_AMOUNT, ""));
        boolean recoveringWithoutPendingNativeState = pendingOrder.isEmpty()
            && preferences.getString(PENDING_AMOUNT, "").isEmpty();
        if (orderId == null || requestedAmount == null
            || generation == null || generation < 1
            || (!recoveringWithoutPendingNativeState
                && (!orderId.equals(pendingOrder)
                    || pendingAmount == null
                    || pendingAmount.compareTo(requestedAmount) != 0))
            || !isMatchingCallbackAttempt(attemptId, callbackHost)) {
            call.reject("Percubaan Fiuu VT tidak sepadan dengan transaksi aktif.", "FIUU_ATTEMPT_MISMATCH");
            return;
        }
        final BigDecimal statusAmount = recoveringWithoutPendingNativeState
            ? requestedAmount
            : pendingAmount;
        String pendingOperation = recoverStaleVoidIfNeeded(preferences, System.currentTimeMillis());
        if ("VOID".equals(pendingOperation)) {
            call.reject(
                "Pembatalan Fiuu VT masih diproses. Tunggu sebentar sebelum semak STATUS.",
                "FIUU_VOID_IN_PROGRESS"
            );
            return;
        }
        JSONArray queue = loadResultQueue(preferences);
        if (hasBlockingResultBeforeStatus(queue)) {
            call.reject("Keputusan Fiuu VT tersimpan mesti diproses sebelum semakan STATUS.", "FIUU_RESULT_PENDING");
            return;
        }

        String previousOrder = pendingOrder;
        String previousAmount = preferences.getString(PENDING_AMOUNT, "");
        String previousOperation = preferences.getString(PENDING_OPERATION, "SALE");
        boolean previousStatusLaunched = preferences.getBoolean(STATUS_LAUNCHED, false);
        Uri uri = new Uri.Builder()
            .scheme(FIUU_SCHEME)
            .authority(FIUU_HOST)
            .appendQueryParameter("merchantUrlScheme", getContext().getPackageName())
            .appendQueryParameter("merchantHost", callbackHost)
            .appendQueryParameter("opType", "STATUS")
            .appendQueryParameter("orderId", orderId)
            .build();
        boolean[] callbackAttemptRegistered = { false };
        launchFiuu(
            call,
            uri,
            "STATUS",
            () -> callbackAttemptRegistered[0] = registerCallbackAttempt(
                preferences,
                attemptId,
                callbackHost,
                "STATUS",
                orderId,
                statusAmount.toPlainString(),
                generation,
                preferences.edit()
                    .putString(PENDING_ORDER, orderId)
                    .putString(PENDING_AMOUNT, statusAmount.toPlainString())
                    .putString(PENDING_OPERATION, "STATUS")
                    .putBoolean(STATUS_LAUNCHED, true)
            ),
            () -> {
                SharedPreferences.Editor rollbackEditor = preferences.edit();
                if (recoveringWithoutPendingNativeState) {
                    rollbackEditor
                        .remove(PENDING_ORDER)
                        .remove(PENDING_AMOUNT)
                        .remove(PENDING_OPERATION)
                        .remove(STATUS_LAUNCHED);
                } else {
                    rollbackEditor
                        .putString(PENDING_ORDER, previousOrder)
                        .putString(PENDING_AMOUNT, previousAmount)
                        .putString(PENDING_OPERATION, previousOperation)
                        .putBoolean(STATUS_LAUNCHED, previousStatusLaunched);
                }
                if (callbackAttemptRegistered[0]) {
                    removeCallbackAttempt(preferences, attemptId, rollbackEditor);
                } else {
                    rollbackEditor.commit();
                }
            }
        );
    }

    @PluginMethod
    public synchronized void cancelSale(PluginCall call) {
        String orderId = normalizedOrderId(call.getString("orderId", ""));
        String attemptId = normalizedAttemptId(call.getString("attemptId", ""));
        String callbackHost = normalizedCallbackHost(call.getString("callbackHost", ""));
        Integer generation = call.getInt("generation");
        SharedPreferences preferences = preferences();
        String pendingOrder = preferences.getString(PENDING_ORDER, "");
        BigDecimal pendingAmount = normalizedAmount(preferences.getString(PENDING_AMOUNT, ""));
        if (orderId == null || !orderId.equals(pendingOrder)
            || pendingAmount == null
            || generation == null || generation < 1
            || !isMatchingCallbackAttempt(attemptId, callbackHost)) {
            call.reject("Percubaan Fiuu VT tidak sepadan dengan transaksi aktif.", "FIUU_ATTEMPT_MISMATCH");
            return;
        }
        JSONArray queue = loadResultQueue(preferences);
        if (hasBlockingResultBeforeStatus(queue)) {
            call.reject("Keputusan Fiuu VT tersimpan mesti diproses sebelum pembatalan.", "FIUU_RESULT_PENDING");
            return;
        }

        String previousOperation = preferences.getString(PENDING_OPERATION, "SALE");
        boolean previousVoidLaunched = preferences.getBoolean(VOID_LAUNCHED, false);
        Uri uri = new Uri.Builder()
            .scheme(FIUU_SCHEME)
            .authority(FIUU_HOST)
            .appendQueryParameter("merchantUrlScheme", getContext().getPackageName())
            .appendQueryParameter("merchantHost", callbackHost)
            .appendQueryParameter("opType", "VOID")
            .appendQueryParameter("orderId", orderId)
            .build();
        boolean[] callbackAttemptRegistered = { false };
        launchFiuu(
            call,
            uri,
            "VOID",
            () -> callbackAttemptRegistered[0] = registerCallbackAttempt(
                preferences,
                attemptId,
                callbackHost,
                "VOID",
                orderId,
                pendingAmount.toPlainString(),
                generation,
                preferences.edit()
                    .putString(PENDING_OPERATION, "VOID")
                    .putBoolean(VOID_LAUNCHED, true)
            ),
            () -> {
                SharedPreferences.Editor rollbackEditor = preferences.edit()
                    .putString(PENDING_OPERATION, previousOperation)
                    .putBoolean(VOID_LAUNCHED, previousVoidLaunched);
                if (callbackAttemptRegistered[0]) {
                    removeCallbackAttempt(preferences, attemptId, rollbackEditor);
                } else {
                    rollbackEditor.commit();
                }
            }
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
        if (hasBlockingResultBeforeStatus(loadResultQueue(preferences))) {
            call.reject("Keputusan Fiuu VT masih belum diproses.", "FIUU_RESULT_PENDING");
            return;
        }
        // Migrate any pre-registry ACTIVE_* identity while its order/amount
        // context is still available, then retain it for a possible late
        // provider callback after the payment state is cleared.
        loadCallbackAttemptRegistry(preferences);
        boolean cleared = preferences.edit()
            .remove(PENDING_ORDER)
            .remove(PENDING_AMOUNT)
            .remove(PENDING_OPERATION)
            .remove(RESULT_QUEUE)
            .remove(LAST_RESULT)
            .remove(LAST_RESULT_AT)
            .remove(SALE_LAUNCHED)
            .remove(STATUS_LAUNCHED)
            .remove(VOID_LAUNCHED)
            .remove(SALE_ACKNOWLEDGED)
            .remove(LAST_LAUNCH_AT)
            .remove(LAST_LAUNCH_OPERATION)
            .commit();
        if (!cleared) {
            call.reject("Keadaan terminal Fiuu VT belum dapat dibersihkan.", "FIUU_CLEAR_PERSIST_FAILED");
            return;
        }
        call.resolve();
    }

    public synchronized boolean handleDeepLink(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        if (uri == null || !getContext().getPackageName().equalsIgnoreCase(uri.getScheme())) {
            return false;
        }

        SharedPreferences preferences = preferences();
        String callbackHost = normalizedCallbackHost(uri.getHost());
        JSONObject callbackAttempt = callbackHost == null
            ? null
            : findCallbackAttemptByHost(loadCallbackAttemptRegistry(preferences), callbackHost);
        if (callbackAttempt == null || callbackAttempt.optBoolean("callbackReceived", false)) {
            // The manifest intentionally accepts every host for our private
            // scheme. Only a durable one-time host issued by this bridge is
            // trusted. Duplicate and foreign callbacks are consumed without
            // changing payment state.
            return true;
        }

        String callbackAttemptId = normalizedAttemptId(callbackAttempt.optString("attemptId"));
        String registeredCallbackHost = normalizedCallbackHost(callbackAttempt.optString("callbackHost"));
        String registeredOperation = callbackAttempt.optString("operation");
        String registeredOrder = normalizedOrderId(callbackAttempt.optString("orderId"));
        BigDecimal registeredAmount = normalizedAmount(callbackAttempt.optString("amount"));
        if (!isMatchingCallbackAttempt(callbackAttemptId, registeredCallbackHost)
            || !callbackHost.equals(registeredCallbackHost)
            || !isFiuuOperation(registeredOperation)
            || registeredOrder == null
            || registeredAmount == null) {
            return true;
        }

        String errorCode = safe(uri.getQueryParameter("errorCode"));
        String rawErrorMessage = safe(first(uri, "errorMsg", "errorMessage"));
        String errorMessage = normalizedErrorMessage(rawErrorMessage);
        if (!errorCode.isEmpty() || !rawErrorMessage.isEmpty()) {
            boolean validError = hasExactlyOne(uri, "errorCode")
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
            errorResult.put("opType", registeredOperation);
            errorResult.put("orderId", registeredOrder);
            errorResult.put("errorCode", errorCode);
            errorResult.put("errorMessage", errorMessage);
            errorResult.put("callbackAttemptId", callbackAttemptId);
            errorResult.put("callbackHost", registeredCallbackHost);
            errorResult.put("callbackValidation", "MATCHED");
            if (!enqueueResult(preferences, errorResult)) return true;
            markCallbackAttemptReceived(preferences, callbackAttemptId);
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

        boolean validPayload = ("SALE".equals(opType) || "STATUS".equals(opType) || "VOID".equals(opType))
            && hasExactlyOne(uri, "opType")
            && hasExactlyOne(uri, "orderId", "orderid")
            && hasExactlyOne(uri, "tranID", "tranId", "transactionId")
            && hasExactlyOne(uri, "status")
            && hasExactlyOne(uri, "amount")
            && hasExactlyOne(uri, "currency")
            && hasExactlyOne(uri, "channel")
            && hasAtMostOne(uri, "payDate", "paydate")
            && ORDER_PATTERN.matcher(orderId).matches()
            && TRANSACTION_PATTERN.matcher(transactionId).matches()
            && STATUS_CODES.contains(status)
            && "MYR".equals(currency)
            && CHANNEL.equals(channel)
            && amount != null;
        if (!validPayload) return true;

        boolean callbackMatchesRegisteredAttempt = registeredOperation.equals(opType)
            && orderId.equals(registeredOrder)
            && amount.compareTo(registeredAmount) == 0;

        JSObject result = new JSObject();
        result.put("opType", opType);
        result.put("orderId", orderId);
        result.put("tranID", transactionId);
        result.put("status", status);
        result.put("amount", amount.toPlainString());
        result.put("currency", currency);
        result.put("channel", channel);
        result.put("payDate", payDate.isEmpty() ? JSONObject.NULL : payDate);
        result.put("callbackAttemptId", callbackAttemptId);
        result.put("callbackHost", registeredCallbackHost);
        result.put("callbackValidation", callbackMatchesRegisteredAttempt ? "MATCHED" : "MISMATCH");
        if (!enqueueResult(preferences, result)) return true;
        markCallbackAttemptReceived(preferences, callbackAttemptId);
        notifyListeners("fiuuVtResult", result, true);
        return true;
    }

    /**
     * Fiuu may return SALE and STATUS callbacks only a few milliseconds apart.
     * Persist every distinct callback until JavaScript acknowledges that exact
     * item; a single last-result slot can silently discard STATUS=00.
     */
    private synchronized boolean enqueueResult(SharedPreferences preferences, JSObject result) {
        JSONArray queue = loadResultQueue(preferences);
        JSONObject value;
        try {
            value = new JSONObject(result.toString());
        } catch (JSONException error) {
            return false;
        }
        if (findEquivalentResultIndex(queue, value) >= 0) return true;

        JSONObject entry = new JSONObject();
        try {
            entry.put("receivedAt", System.currentTimeMillis());
            entry.put("result", value);
            queue.put(entry);
        } catch (JSONException error) {
            return false;
        }

        while (queue.length() > RESULT_QUEUE_LIMIT) {
            int removableIndex = findSafestResultToDrop(queue);
            // Never discard matched provider evidence merely to satisfy the
            // low-value queue cap. If every remaining item is authoritative,
            // retain the evidence even when the queue temporarily exceeds it.
            if (removableIndex < 0) break;
            queue.remove(removableIndex);
        }
        return saveResultQueue(preferences, queue);
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
        boolean queueWasTrimmed = false;
        while (cleanQueue.length() > RESULT_QUEUE_LIMIT) {
            int removableIndex = findSafestResultToDrop(cleanQueue);
            if (removableIndex < 0) break;
            cleanQueue.remove(removableIndex);
            queueWasTrimmed = true;
        }
        if (queueWasTrimmed) saveResultQueue(preferences, cleanQueue);
        return cleanQueue;
    }

    private boolean saveResultQueue(SharedPreferences preferences, JSONArray queue) {
        return writeResultQueue(preferences.edit(), queue).commit();
    }

    private SharedPreferences.Editor writeResultQueue(
        SharedPreferences.Editor editor,
        JSONArray queue
    ) {
        editor
            .remove(LAST_RESULT)
            .remove(LAST_RESULT_AT);
        if (queue.length() == 0) editor.remove(RESULT_QUEUE);
        else editor.putString(RESULT_QUEUE, queue.toString());
        return editor;
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
        int voidIndex = findNormalResultIndex(queue, "VOID", "");
        if (voidIndex >= 0) return voidIndex;
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
        String errorCode,
        String callbackAttemptId
    ) {
        for (int index = 0; index < queue.length(); index++) {
            JSONObject entry = queue.optJSONObject(index);
            JSONObject value = entry == null ? null : entry.optJSONObject("result");
            if (value == null
                || !callbackAttemptId.equals(value.optString("callbackAttemptId"))
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
        String candidateAttemptId = candidate.optString("callbackAttemptId");
        for (int index = 0; index < queue.length(); index++) {
            JSONObject entry = queue.optJSONObject(index);
            JSONObject value = entry == null ? null : entry.optJSONObject("result");
            if (value == null
                || !candidateKind.equals(value.optString("kind"))
                || !candidateAttemptId.equals(value.optString("callbackAttemptId"))
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
            if (!isAuthoritativeResult(value)) return index;
        }
        return -1;
    }

    private boolean isAuthoritativeResult(JSONObject value) {
        if (value == null || "ERROR".equals(value.optString("kind"))) return false;
        if (!"MATCHED".equals(value.optString("callbackValidation"))) return false;
        if (normalizedAttemptId(value.optString("callbackAttemptId")) == null) return false;
        return isFiuuOperation(value.optString("opType"));
    }

    private String recoverStaleVoidIfNeeded(SharedPreferences preferences, long now) {
        String pendingOperation = preferences.getString(PENDING_OPERATION, "");
        if (!"VOID".equals(pendingOperation)) return pendingOperation;

        long lastLaunchAt = preferences.getLong(LAST_LAUNCH_AT, 0L);
        String lastLaunchOperation = preferences.getString(LAST_LAUNCH_OPERATION, "");
        if ("VOID".equals(lastLaunchOperation)
            && isRecentLaunch(lastLaunchAt, now, STALE_VOID_RECOVERY_MS)) {
            return pendingOperation;
        }

        // A missing VOID callback must not strand the cashier indefinitely.
        // Preserve the original attempt and move only the bridge operation back
        // to STATUS so the authoritative payment state can be reconciled.
        preferences.edit()
            .putString(PENDING_OPERATION, "STATUS")
            .putBoolean(VOID_LAUNCHED, false)
            .commit();
        return "STATUS";
    }

    private Object pendingOperationStartedAt(
        SharedPreferences preferences,
        String pendingOperation
    ) {
        long lastLaunchAt = preferences.getLong(LAST_LAUNCH_AT, 0L);
        String lastLaunchOperation = preferences.getString(LAST_LAUNCH_OPERATION, "");
        return lastLaunchAt > 0L && pendingOperation.equals(lastLaunchOperation)
            ? lastLaunchAt
            : JSONObject.NULL;
    }

    private static boolean isFiuuOperation(String operation) {
        return "SALE".equals(operation) || "STATUS".equals(operation) || "VOID".equals(operation);
    }

    private static boolean isRecentLaunch(long launchedAt, long now, long windowMs) {
        return launchedAt > 0L && now >= launchedAt && now - launchedAt <= windowMs;
    }

    private static String normalizedAttemptId(String value) {
        String normalized = safe(value).toLowerCase(Locale.ROOT);
        return ATTEMPT_ID_PATTERN.matcher(normalized).matches() ? normalized : null;
    }

    private static String normalizedCallbackHost(String value) {
        String normalized = safe(value).toLowerCase(Locale.ROOT);
        return CALLBACK_HOST_PATTERN.matcher(normalized).matches() ? normalized : null;
    }

    private static boolean isMatchingCallbackAttempt(String attemptId, String callbackHost) {
        if (attemptId == null || callbackHost == null) return false;
        String expectedHost = "a-" + attemptId.replace("-", "") + ".fiuu-vt.rkj.one";
        return expectedHost.equals(callbackHost);
    }

    /**
     * Callback identities outlive the currently visible bridge operation. Fiuu
     * may return SALE after a STATUS/VOID launch (or vice versa), including
     * after Android recreates the process, so every issued one-time host must
     * remain independently resolvable until its exact result is acknowledged.
     */
    private JSONArray loadCallbackAttemptRegistry(SharedPreferences preferences) {
        JSONArray registry = new JSONArray();
        boolean changed = false;
        String rawRegistry = preferences.getString(CALLBACK_ATTEMPT_REGISTRY, "");
        if (!rawRegistry.isEmpty()) {
            try {
                JSONArray storedRegistry = new JSONArray(rawRegistry);
                for (int index = 0; index < storedRegistry.length(); index++) {
                    JSONObject entry = storedRegistry.optJSONObject(index);
                    if (!isValidCallbackAttempt(entry)) {
                        changed = true;
                        continue;
                    }
                    String attemptId = entry.optString("attemptId");
                    String callbackHost = entry.optString("callbackHost");
                    if (findCallbackAttemptById(registry, attemptId) != null
                        || findCallbackAttemptByHost(registry, callbackHost) != null) {
                        changed = true;
                        continue;
                    }
                    registry.put(entry);
                }
            } catch (JSONException ignored) {
                // SharedPreferences writes are atomic, but retain the legacy
                // mirror below as a recovery path for pre-registry installs.
                changed = true;
            }
        }

        String legacyAttemptId = normalizedAttemptId(preferences.getString(ACTIVE_ATTEMPT_ID, ""));
        String legacyCallbackHost = normalizedCallbackHost(
            preferences.getString(ACTIVE_CALLBACK_HOST, "")
        );
        String legacyOperation = preferences.getString(ACTIVE_ATTEMPT_OPERATION, "");
        String legacyOrderId = normalizedOrderId(preferences.getString(PENDING_ORDER, ""));
        BigDecimal legacyAmount = normalizedAmount(preferences.getString(PENDING_AMOUNT, ""));
        if (isMatchingCallbackAttempt(legacyAttemptId, legacyCallbackHost)
            && isFiuuOperation(legacyOperation)
            && legacyOrderId != null
            && legacyAmount != null
            && findCallbackAttemptById(registry, legacyAttemptId) == null
            && findCallbackAttemptByHost(registry, legacyCallbackHost) == null) {
            JSONObject legacyEntry = newCallbackAttempt(
                legacyAttemptId,
                legacyCallbackHost,
                legacyOperation,
                legacyOrderId,
                legacyAmount.toPlainString(),
                1,
                preferences.getBoolean(ACTIVE_CALLBACK_RECEIVED, false),
                preferences.getLong(LAST_LAUNCH_AT, System.currentTimeMillis())
            );
            if (legacyEntry != null) {
                registry.put(legacyEntry);
                changed = true;
            }
        }

        if (changed || !legacyMirrorMatchesRegistry(preferences, registry)) {
            saveCallbackAttemptRegistry(preferences, registry, preferences.edit());
        }
        return registry;
    }

    private boolean registerCallbackAttempt(
        SharedPreferences preferences,
        String attemptId,
        String callbackHost,
        String operation,
        String orderId,
        String amount,
        int generation,
        SharedPreferences.Editor editor
    ) {
        String normalizedOrder = normalizedOrderId(orderId);
        BigDecimal normalizedPaymentAmount = normalizedAmount(amount);
        if (!isMatchingCallbackAttempt(normalizedAttemptId(attemptId), normalizedCallbackHost(callbackHost))
            || !isFiuuOperation(operation)
            || normalizedOrder == null
            || normalizedPaymentAmount == null
            || generation < 1) {
            throw new IllegalStateException("Invalid Fiuu callback attempt");
        }

        JSONArray registry = loadCallbackAttemptRegistry(preferences);
        JSONObject existingAttempt = findCallbackAttemptById(registry, attemptId);
        JSONObject existingHost = findCallbackAttemptByHost(registry, callbackHost);
        if (existingAttempt != null || existingHost != null) {
            // A provider callback host is single-use. Reusing it for a retry
            // lets a late callback from the earlier launch consume the newer
            // result, so every retry must arrive with a fresh server identity.
            throw new IllegalStateException("Fiuu callback attempt collision");
        }

        JSONArray queuedResults = loadResultQueue(preferences);
        while (registry.length() >= CALLBACK_ATTEMPT_REGISTRY_LIMIT) {
            int removableIndex = findSafestCallbackAttemptToDrop(registry, queuedResults);
            // Never evict an unresolved host merely to admit a new launch. A
            // full unresolved registry fails closed instead of losing the only
            // identity capable of authenticating a late provider callback.
            if (removableIndex < 0) {
                throw new IllegalStateException("Fiuu callback registry is full");
            }
            registry.remove(removableIndex);
        }

        JSONObject entry = newCallbackAttempt(
            attemptId,
            callbackHost,
            operation,
            normalizedOrder,
            normalizedPaymentAmount.toPlainString(),
            generation,
            false,
            System.currentTimeMillis()
        );
        if (entry == null) throw new IllegalStateException("Unable to persist Fiuu callback attempt");
        registry.put(entry);
        if (!saveCallbackAttemptRegistry(preferences, registry, editor)) {
            throw new IllegalStateException("Unable to commit Fiuu callback attempt");
        }
        return true;
    }

    private boolean removeCallbackAttempt(
        SharedPreferences preferences,
        String callbackAttemptId
    ) {
        return removeCallbackAttempt(preferences, callbackAttemptId, preferences.edit());
    }

    private boolean removeCallbackAttempt(
        SharedPreferences preferences,
        String callbackAttemptId,
        SharedPreferences.Editor editor
    ) {
        JSONArray registry = loadCallbackAttemptRegistry(preferences);
        for (int index = registry.length() - 1; index >= 0; index--) {
            JSONObject entry = registry.optJSONObject(index);
            if (entry != null && callbackAttemptId.equals(entry.optString("attemptId"))) {
                registry.remove(index);
            }
        }
        return saveCallbackAttemptRegistry(preferences, registry, editor);
    }

    private boolean markCallbackAttemptReceived(
        SharedPreferences preferences,
        String callbackAttemptId
    ) {
        JSONArray registry = loadCallbackAttemptRegistry(preferences);
        JSONObject entry = findCallbackAttemptById(registry, callbackAttemptId);
        if (entry == null) return false;
        try {
            entry.put("callbackReceived", true);
            entry.put("receivedAt", System.currentTimeMillis());
        } catch (JSONException error) {
            return false;
        }
        return saveCallbackAttemptRegistry(preferences, registry, preferences.edit());
    }

    private boolean saveCallbackAttemptRegistry(
        SharedPreferences preferences,
        JSONArray registry,
        SharedPreferences.Editor editor
    ) {
        if (registry.length() == 0) editor.remove(CALLBACK_ATTEMPT_REGISTRY);
        else editor.putString(CALLBACK_ATTEMPT_REGISTRY, registry.toString());

        JSONObject newest = registry.length() == 0
            ? null
            : registry.optJSONObject(registry.length() - 1);
        if (isValidCallbackAttempt(newest)) {
            editor
                .putString(ACTIVE_ATTEMPT_ID, newest.optString("attemptId"))
                .putString(ACTIVE_CALLBACK_HOST, newest.optString("callbackHost"))
                .putString(ACTIVE_ATTEMPT_OPERATION, newest.optString("operation"))
                .putBoolean(ACTIVE_CALLBACK_RECEIVED, newest.optBoolean("callbackReceived", false));
        } else {
            editor
                .remove(ACTIVE_ATTEMPT_ID)
                .remove(ACTIVE_CALLBACK_HOST)
                .remove(ACTIVE_ATTEMPT_OPERATION)
                .remove(ACTIVE_CALLBACK_RECEIVED);
        }
        return editor.commit();
    }

    private boolean legacyMirrorMatchesRegistry(
        SharedPreferences preferences,
        JSONArray registry
    ) {
        JSONObject newest = registry.length() == 0
            ? null
            : registry.optJSONObject(registry.length() - 1);
        if (!isValidCallbackAttempt(newest)) {
            return preferences.getString(ACTIVE_ATTEMPT_ID, "").isEmpty()
                && preferences.getString(ACTIVE_CALLBACK_HOST, "").isEmpty()
                && preferences.getString(ACTIVE_ATTEMPT_OPERATION, "").isEmpty()
                && !preferences.getBoolean(ACTIVE_CALLBACK_RECEIVED, false);
        }
        return newest.optString("attemptId").equals(preferences.getString(ACTIVE_ATTEMPT_ID, ""))
            && newest.optString("callbackHost").equals(preferences.getString(ACTIVE_CALLBACK_HOST, ""))
            && newest.optString("operation").equals(preferences.getString(ACTIVE_ATTEMPT_OPERATION, ""))
            && newest.optBoolean("callbackReceived", false)
                == preferences.getBoolean(ACTIVE_CALLBACK_RECEIVED, false);
    }

    private JSONObject newCallbackAttempt(
        String attemptId,
        String callbackHost,
        String operation,
        String orderId,
        String amount,
        int generation,
        boolean callbackReceived,
        long registeredAt
    ) {
        try {
            JSONObject entry = new JSONObject();
            entry.put("attemptId", attemptId);
            entry.put("callbackHost", callbackHost);
            entry.put("operation", operation);
            entry.put("orderId", orderId);
            entry.put("amount", amount);
            entry.put("generation", generation);
            entry.put("callbackReceived", callbackReceived);
            entry.put("registeredAt", registeredAt > 0L ? registeredAt : System.currentTimeMillis());
            return entry;
        } catch (JSONException error) {
            return null;
        }
    }

    private boolean isValidCallbackAttempt(JSONObject entry) {
        if (entry == null) return false;
        String attemptId = normalizedAttemptId(entry.optString("attemptId"));
        String callbackHost = normalizedCallbackHost(entry.optString("callbackHost"));
        return isMatchingCallbackAttempt(attemptId, callbackHost)
            && isFiuuOperation(entry.optString("operation"))
            && normalizedOrderId(entry.optString("orderId")) != null
            && normalizedAmount(entry.optString("amount")) != null
            && entry.optInt("generation", 1) >= 1;
    }

    private JSONObject findCallbackAttemptById(JSONArray registry, String attemptId) {
        if (attemptId == null) return null;
        for (int index = registry.length() - 1; index >= 0; index--) {
            JSONObject entry = registry.optJSONObject(index);
            if (entry != null && attemptId.equals(entry.optString("attemptId"))) return entry;
        }
        return null;
    }

    private JSONObject findCallbackAttemptByHost(JSONArray registry, String callbackHost) {
        if (callbackHost == null) return null;
        for (int index = registry.length() - 1; index >= 0; index--) {
            JSONObject entry = registry.optJSONObject(index);
            if (entry != null && callbackHost.equals(entry.optString("callbackHost"))) return entry;
        }
        return null;
    }

    private int findSafestCallbackAttemptToDrop(JSONArray registry, JSONArray queuedResults) {
        for (int index = 0; index < registry.length(); index++) {
            JSONObject entry = registry.optJSONObject(index);
            if (entry != null
                && entry.optBoolean("callbackReceived", false)
                && hasQueuedResultForAttempt(queuedResults, entry.optString("attemptId"))) {
                return index;
            }
        }
        return -1;
    }

    private boolean hasQueuedResultForAttempt(JSONArray queue, String attemptId) {
        for (int index = 0; index < queue.length(); index++) {
            JSONObject entry = queue.optJSONObject(index);
            JSONObject value = entry == null ? null : entry.optJSONObject("result");
            if (value != null && attemptId.equals(value.optString("callbackAttemptId"))) return true;
        }
        return false;
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
                .commit();
            RkjDevicePolicyPlugin.runWithSystemDialogGuard(getActivity(), () -> getActivity().startActivity(intent));
            JSObject result = new JSObject();
            result.put("launched", true);
            call.resolve(result);
        } catch (RuntimeException error) {
            rollback.run();
            preferences.edit().remove(LAST_LAUNCH_AT).remove(LAST_LAUNCH_OPERATION).commit();
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
