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
    private static final String QUARANTINED_RESULT_QUEUE = "quarantined_result_queue";
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
    private static final int BRIDGE_API_VERSION = 8;
    private static final long MIN_LAUNCH_INTERVAL_MS = 3000L;
    private static final long STALE_VOID_RECOVERY_MS = 30000L;
    private static final int RESULT_QUEUE_LIMIT = 128;
    private static final int QUARANTINED_RESULT_QUEUE_LIMIT = 32;
    private static final int CALLBACK_ATTEMPT_REGISTRY_LIMIT = 256;
    private static final long RELEASED_CALLBACK_RETENTION_MS = 30L * 24L * 60L * 60L * 1000L;
    private static final long LEGACY_PENDING_RECOVERY_GRACE_MS = 24L * 60L * 60L * 1000L;
    private static final Pattern ORDER_PATTERN = Pattern.compile("^RKJ_[A-F0-9]{32}$");
    private static final Pattern LEGACY_ORDER_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{4,64}$");
    private static final Pattern TRANSACTION_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{1,80}$");
    private static final Pattern PAY_DATE_PATTERN = Pattern.compile("^[0-9T:+.\\-/ ]{6,40}$");
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
    private static final Set<String> TERMINAL_STATUS_CODES = new HashSet<>(
        Arrays.asList("00", "11", "44", "55")
    );

    private static final class QueueLoadState {
        final JSONArray values;
        final boolean safeForMutation;

        QueueLoadState(JSONArray values, boolean safeForMutation) {
            this.values = values;
            this.safeForMutation = safeForMutation;
        }
    }

    @PluginMethod
    public synchronized void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        SharedPreferences preferences = preferences();
        quarantineInvalidPendingStateIfNeeded(preferences);
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
        JSONArray quarantine = loadQuarantinedResultQueue(preferences);
        result.put("quarantinedResultCount", quarantine.length());
        result.put(
            "quarantineBlocksRelease",
            hasBlockingQuarantinedResultForOrder(
                quarantine,
                preferences.getString(PENDING_ORDER, "")
            )
        );
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
        quarantineInvalidPendingStateIfNeeded(preferences);
        if (!preferences.getString(PENDING_ORDER, "").isEmpty()) {
            call.reject("Percubaan Fiuu VT terdahulu masih perlu direkonsiliasi.", "FIUU_ACTIVE_ATTEMPT_EXISTS");
            return;
        }
        QueueLoadState storedResults = loadResultQueueState(preferences);
        if (!storedResults.safeForMutation) {
            call.reject(
                "Storan keselamatan Fiuu VT perlu disahkan semula sebelum jualan baharu.",
                "FIUU_STORAGE_RECOVERY_REQUIRED"
            );
            return;
        }
        if (storedResults.values.length() > 0) {
            call.reject("Keputusan Fiuu VT terdahulu masih belum diproses.", "FIUU_RESULT_PENDING");
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
        if ("STATUS".equals(opType) && TERMINAL_STATUS_CODES.contains(status)) {
            JSONArray quarantine = removeBlockingQuarantinedResultsForOrder(
                loadQuarantinedResultQueue(preferences),
                orderId
            );
            writeQuarantinedResultQueue(acknowledgementEditor, quarantine);
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
        // The web layer acknowledges an error only after the server durably
        // records the exact callback attempt. A SALE error must therefore be
        // consumed and moved to STATUS reconciliation instead of permanently
        // blocking the native queue.
        if (callbackAttemptId == null
            || orderId == null
            || !("SALE".equals(opType) || "STATUS".equals(opType) || "VOID".equals(opType))
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
        if ("SALE".equals(opType) && orderId.equals(preferences.getString(PENDING_ORDER, ""))) {
            acknowledgementEditor
                .putBoolean(SALE_ACKNOWLEDGED, true)
                .putString(PENDING_OPERATION, "STATUS");
        } else if ("VOID".equals(opType) && orderId.equals(preferences.getString(PENDING_ORDER, ""))) {
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
        QueueLoadState storedResults = loadResultQueueState(preferences);
        if (!storedResults.safeForMutation) {
            call.reject(
                "Storan keselamatan Fiuu VT belum dapat dipulihkan dengan selamat.",
                "FIUU_STORAGE_RECOVERY_REQUIRED"
            );
            return;
        }
        if (storedResults.values.length() > 0) {
            call.reject("Keputusan Fiuu VT masih belum diproses.", "FIUU_RESULT_PENDING");
            return;
        }
        if (hasBlockingQuarantinedResultForOrder(
            loadQuarantinedResultQueue(preferences),
            orderId
        )) {
            call.reject(
                "Bukti callback Fiuu VT perlu direkonsiliasi melalui semakan STATUS.",
                "FIUU_RECONCILIATION_REQUIRED"
            );
            return;
        }
        // Migrate any pre-registry ACTIVE_* identity while its order/amount
        // context is still available, then retain it for a possible late
        // provider callback after the payment state is cleared.
        loadCallbackAttemptRegistry(preferences);
        SharedPreferences.Editor clearEditor = preferences.edit()
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
            .remove(LAST_LAUNCH_OPERATION);
        boolean cleared = markCallbackAttemptsReleased(
            preferences,
            orderId,
            clearEditor
        );
        if (!cleared) {
            call.reject("Keadaan terminal Fiuu VT belum dapat dibersihkan.", "FIUU_CLEAR_PERSIST_FAILED");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public synchronized void recoverLegacyPendingState(PluginCall call) {
        String requestedOrder = normalizedLegacyOrderId(call.getString("legacyOrderId", ""));
        String reviewReference = safe(call.getString("reviewReference", ""));
        boolean reviewed = Boolean.TRUE.equals(call.getBoolean("reviewed"));
        SharedPreferences preferences = preferences();
        String pendingOrder = preferences.getString(PENDING_ORDER, "");
        if (!reviewed
            || reviewReference.length() < 8
            || requestedOrder == null
            || normalizedOrderId(requestedOrder) != null
            || !requestedOrder.equals(pendingOrder)) {
            call.reject(
                "Pemulihan legacy memerlukan semakan manusia dan rujukan audit yang sah.",
                "FIUU_LEGACY_REVIEW_REQUIRED"
            );
            return;
        }

        QueueLoadState quarantineState = loadQuarantinedResultQueueState(preferences);
        QueueLoadState resultState = loadResultQueueState(preferences);
        JSONArray registry = loadCallbackAttemptRegistry(preferences);
        long now = System.currentTimeMillis();
        long latestEvidenceAt = latestLegacyRecoveryEvidenceAt(
            quarantineState.values,
            registry,
            pendingOrder,
            preferences.getLong(LAST_LAUNCH_AT, 0L)
        );
        if (!quarantineState.safeForMutation
            || !resultState.safeForMutation
            || resultState.values.length() > 0
            || latestEvidenceAt <= 0L
            || now - latestEvidenceAt < LEGACY_PENDING_RECOVERY_GRACE_MS) {
            call.reject(
                "Keadaan legacy masih terlalu baharu atau mempunyai keputusan yang belum diproses.",
                "FIUU_LEGACY_RECOVERY_BLOCKED"
            );
            return;
        }

        JSONArray reviewedQuarantine = loadQuarantinedResultQueue(preferences);
        if (!hasBlockingQuarantinedResultForOrder(reviewedQuarantine, pendingOrder)) {
            JSONObject evidence = new JSONObject();
            try {
                evidence.put("pendingOrder", pendingOrder);
                evidence.put("pendingAmount", preferences.getString(PENDING_AMOUNT, ""));
                evidence.put("pendingOperation", preferences.getString(PENDING_OPERATION, ""));
                evidence.put("lastLaunchAt", preferences.getLong(LAST_LAUNCH_AT, 0L));
                evidence.put("lastLaunchOperation", preferences.getString(LAST_LAUNCH_OPERATION, ""));
            } catch (JSONException ignored) {
                // Preserve an empty evidence object if a platform JSON
                // implementation unexpectedly rejects a primitive value.
            }
            appendQuarantinedResult(
                reviewedQuarantine,
                "INVALID_PENDING_ORDER",
                pendingOrder,
                evidence
            );
        }
        if (!markLegacyPendingQuarantineReviewed(
            reviewedQuarantine,
            pendingOrder,
            now,
            reviewReference
        )) {
            call.reject("Bukti legacy tidak dapat ditanda sebagai disemak.", "FIUU_LEGACY_RECOVERY_BLOCKED");
            return;
        }
        SharedPreferences.Editor recoveryEditor = legacyPendingReleaseEditor(preferences);
        writeQuarantinedResultQueue(recoveryEditor, reviewedQuarantine);
        if (!markCallbackAttemptsReleased(preferences, pendingOrder, recoveryEditor)) {
            call.reject("Pemulihan legacy belum dapat disimpan.", "FIUU_LEGACY_RECOVERY_PERSIST_FAILED");
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
        String registeredOrder = normalizedLegacyOrderId(callbackAttempt.optString("orderId"));
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
        String rawOrderId = first(uri, "orderId", "orderid");
        String callbackOrderId = normalizedLegacyOrderId(rawOrderId);
        String orderId = normalizedOrderId(rawOrderId);
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
            && callbackOrderId != null
            && TRANSACTION_PATTERN.matcher(transactionId).matches()
            && STATUS_CODES.contains(status)
            && "MYR".equals(currency)
            && CHANNEL.equals(channel)
            && (payDate.isEmpty() || PAY_DATE_PATTERN.matcher(payDate).matches())
            && amount != null;
        if (!validPayload) return true;

        boolean callbackMatchesRegisteredAttempt = registeredOperation.equals(opType)
            && callbackOrderId.equals(registeredOrder)
            && amount.compareTo(registeredAmount) == 0;

        if (orderId == null) {
            // Keep pre-v7 callback identities recognizable after an upgrade,
            // but never pass a legacy order reference into the web fulfilment
            // path. Preserve it as blocking evidence until support completes
            // an authoritative reconciliation.
            JSONObject evidence = new JSONObject();
            try {
                evidence.put("opType", opType);
                evidence.put("orderId", callbackOrderId);
                evidence.put("tranID", transactionId);
                evidence.put("status", status);
                evidence.put("amount", amount.toPlainString());
                evidence.put("currency", currency);
                evidence.put("channel", channel);
                evidence.put("payDate", payDate.isEmpty() ? JSONObject.NULL : payDate);
                evidence.put("callbackAttemptId", callbackAttemptId);
                evidence.put("callbackHost", registeredCallbackHost);
                evidence.put(
                    "callbackValidation",
                    callbackMatchesRegisteredAttempt ? "MATCHED" : "MISMATCH"
                );
            } catch (JSONException ignored) {
                // Primitive values above are safe; retain an empty evidence
                // object if a platform implementation rejects one.
            }
            JSONArray quarantine = loadQuarantinedResultQueue(preferences);
            appendQuarantinedResult(
                quarantine,
                "LEGACY_CALLBACK_REQUIRES_REVIEW",
                registeredOrder,
                evidence
            );
            if (writeQuarantinedResultQueue(preferences.edit(), quarantine).commit()) {
                markCallbackAttemptReceived(preferences, callbackAttemptId);
            }
            return true;
        }

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
        return loadResultQueueState(preferences).values;
    }

    private QueueLoadState loadResultQueueState(SharedPreferences preferences) {
        JSONArray cleanQueue = new JSONArray();
        QueueLoadState quarantineState = loadQuarantinedResultQueueState(preferences);
        JSONArray quarantine = quarantineState.values;
        String blockingOrder = safe(preferences.getString(PENDING_ORDER, ""));
        boolean safeForMutation = quarantineState.safeForMutation;
        boolean changed = false;
        String rawQueue = preferences.getString(RESULT_QUEUE, "");
        if (!rawQueue.isEmpty()) {
            try {
                JSONArray storedQueue = new JSONArray(rawQueue);
                for (int index = 0; index < storedQueue.length(); index++) {
                    JSONObject entry = storedQueue.optJSONObject(index);
                    if (isProcessableQueuedResult(entry)) {
                        cleanQueue.put(entry);
                    } else {
                        appendQuarantinedResult(
                            quarantine,
                            "RESULT_QUEUE_INVALID",
                            blockingOrder,
                            entry
                        );
                        changed = true;
                        safeForMutation = false;
                    }
                }
            } catch (JSONException ignored) {
                // Preserve forensic evidence, but fail this mutation attempt.
                // A subsequent call can proceed only after the repair itself
                // was durably committed and can be read back cleanly.
                appendQuarantinedResult(
                    quarantine,
                    "RESULT_QUEUE_MALFORMED",
                    blockingOrder,
                    rawQueue
                );
                changed = true;
                safeForMutation = false;
            }
        }

        String legacyResult = preferences.getString(LAST_RESULT, "");
        if (!legacyResult.isEmpty()) {
            try {
                JSONObject legacyValue = new JSONObject(legacyResult);
                JSONObject legacyEntry = new JSONObject();
                legacyEntry.put("receivedAt", preferences.getLong(LAST_RESULT_AT, System.currentTimeMillis()));
                legacyEntry.put("result", legacyValue);
                if (isProcessableQueuedResult(legacyEntry)
                    && findEquivalentResultIndex(cleanQueue, legacyValue) < 0) {
                    cleanQueue.put(legacyEntry);
                } else if (!isProcessableQueuedResult(legacyEntry)) {
                    appendQuarantinedResult(
                        quarantine,
                        "LEGACY_RESULT_INVALID",
                        blockingOrder,
                        legacyEntry
                    );
                    safeForMutation = false;
                }
            } catch (JSONException ignored) {
                appendQuarantinedResult(
                    quarantine,
                    "LEGACY_RESULT_MALFORMED",
                    blockingOrder,
                    legacyResult
                );
                safeForMutation = false;
            }
            // Migrate or quarantine the legacy slot exactly once.
            changed = true;
        }
        while (cleanQueue.length() > RESULT_QUEUE_LIMIT) {
            int removableIndex = findSafestResultToDrop(cleanQueue);
            if (removableIndex < 0) break;
            cleanQueue.remove(removableIndex);
            changed = true;
        }
        if (changed) {
            SharedPreferences.Editor editor = writeResultQueue(preferences.edit(), cleanQueue);
            if (!writeQuarantinedResultQueue(editor, quarantine).commit()) {
                safeForMutation = false;
            }
        }
        return new QueueLoadState(cleanQueue, safeForMutation);
    }

    private boolean isProcessableQueuedResult(JSONObject entry) {
        JSONObject value = entry == null ? null : entry.optJSONObject("result");
        if (value == null) return false;

        String orderId = normalizedOrderId(value.optString("orderId"));
        String opType = safe(value.optString("opType")).toUpperCase(Locale.ROOT);
        String attemptId = normalizedAttemptId(value.optString("callbackAttemptId"));
        String callbackHost = normalizedCallbackHost(value.optString("callbackHost"));
        String callbackValidation = value.optString("callbackValidation");
        if (orderId == null
            || !isFiuuOperation(opType)
            || !isMatchingCallbackAttempt(attemptId, callbackHost)
            || !("MATCHED".equals(callbackValidation) || "MISMATCH".equals(callbackValidation))) {
            return false;
        }

        if ("ERROR".equals(value.optString("kind"))) {
            return ERROR_CODE_PATTERN.matcher(value.optString("errorCode")).matches()
                && normalizedErrorMessage(value.optString("errorMessage")) != null;
        }
        if (!value.optString("kind").isEmpty()) return false;

        String payDate = safe(value.optString("payDate"));
        return TRANSACTION_PATTERN.matcher(value.optString("tranID")).matches()
            && STATUS_CODES.contains(value.optString("status"))
            && normalizedAmount(value.optString("amount")) != null
            && "MYR".equals(value.optString("currency"))
            && CHANNEL.equals(value.optString("channel"))
            && (payDate.isEmpty() || PAY_DATE_PATTERN.matcher(payDate).matches());
    }

    private JSONArray loadQuarantinedResultQueue(SharedPreferences preferences) {
        return loadQuarantinedResultQueueState(preferences).values;
    }

    private QueueLoadState loadQuarantinedResultQueueState(SharedPreferences preferences) {
        JSONArray quarantine = new JSONArray();
        boolean safeForMutation = true;
        boolean changed = false;
        String pendingOrder = safe(preferences.getString(PENDING_ORDER, ""));
        String rawQueue = preferences.getString(QUARANTINED_RESULT_QUEUE, "");
        if (!rawQueue.isEmpty()) {
            try {
                JSONArray storedQueue = new JSONArray(rawQueue);
                for (int index = 0; index < storedQueue.length(); index++) {
                    JSONObject entry = storedQueue.optJSONObject(index);
                    if (entry == null) {
                        appendQuarantinedResult(
                            quarantine,
                            "QUARANTINE_ENTRY_INVALID",
                            pendingOrder,
                            "entry-index:" + index
                        );
                        changed = true;
                        safeForMutation = false;
                        continue;
                    }
                    quarantine.put(entry);
                }
            } catch (JSONException ignored) {
                // Never interpret unreadable quarantine as "no evidence".
                // Persist a non-callback safety record and make the current
                // release/start attempt fail closed.
                appendQuarantinedResult(
                    quarantine,
                    "QUARANTINE_QUEUE_MALFORMED",
                    pendingOrder,
                    rawQueue
                );
                changed = true;
                safeForMutation = false;
            }
        }
        while (quarantine.length() > QUARANTINED_RESULT_QUEUE_LIMIT) {
            int removableIndex = findSafestQuarantinedResultToDrop(quarantine, pendingOrder);
            if (removableIndex < 0) break;
            quarantine.remove(removableIndex);
            changed = true;
        }
        if (changed) {
            if (!writeQuarantinedResultQueue(preferences.edit(), quarantine).commit()) {
                safeForMutation = false;
            }
        }
        return new QueueLoadState(quarantine, safeForMutation);
    }

    private int findSafestQuarantinedResultToDrop(JSONArray quarantine, String pendingOrder) {
        String currentOrder = safe(pendingOrder);
        for (int index = 0; index < quarantine.length(); index++) {
            JSONObject entry = quarantine.optJSONObject(index);
            if (entry != null && entry.optString("blockingOrderId").isEmpty()) return index;
        }
        for (int index = 0; index < quarantine.length(); index++) {
            JSONObject entry = quarantine.optJSONObject(index);
            if (entry != null && !currentOrder.equals(entry.optString("blockingOrderId"))) return index;
        }
        return -1;
    }

    private SharedPreferences.Editor writeQuarantinedResultQueue(
        SharedPreferences.Editor editor,
        JSONArray quarantine
    ) {
        if (quarantine.length() == 0) editor.remove(QUARANTINED_RESULT_QUEUE);
        else editor.putString(QUARANTINED_RESULT_QUEUE, quarantine.toString());
        return editor;
    }

    private void appendQuarantinedResult(
        JSONArray quarantine,
        String reason,
        Object evidence
    ) {
        appendQuarantinedResult(quarantine, reason, null, evidence);
    }

    private void appendQuarantinedResult(
        JSONArray quarantine,
        String reason,
        String blockingOrderId,
        Object evidence
    ) {
        try {
            JSONObject record = new JSONObject();
            record.put("quarantinedAt", System.currentTimeMillis());
            record.put("reason", reason);
            String normalizedBlockingOrder = safe(blockingOrderId);
            if (!normalizedBlockingOrder.isEmpty()) {
                record.put("blockingOrderId", normalizedBlockingOrder);
            }
            if (evidence instanceof JSONObject || evidence instanceof JSONArray) {
                record.put("evidence", evidence);
            } else {
                String rawEvidence = safe(evidence == null ? "" : evidence.toString());
                record.put(
                    "evidence",
                    rawEvidence.length() <= 4096 ? rawEvidence : rawEvidence.substring(0, 4096)
                );
            }
            quarantine.put(record);
        } catch (JSONException ignored) {
            // No provider callback is synthesized here. Callers that depend on
            // this record still fail closed when the durable repair cannot be
            // represented and committed.
        }
    }

    private boolean hasBlockingQuarantinedResultForOrder(
        JSONArray quarantine,
        String orderId
    ) {
        String expectedOrder = safe(orderId);
        if (expectedOrder.isEmpty()) return false;
        for (int index = 0; index < quarantine.length(); index++) {
            JSONObject entry = quarantine.optJSONObject(index);
            if (entry != null && expectedOrder.equals(entry.optString("blockingOrderId"))) {
                return true;
            }
        }
        return false;
    }

    private JSONArray removeBlockingQuarantinedResultsForOrder(
        JSONArray quarantine,
        String orderId
    ) {
        String expectedOrder = safe(orderId);
        if (expectedOrder.isEmpty()) return quarantine;
        for (int index = quarantine.length() - 1; index >= 0; index--) {
            JSONObject entry = quarantine.optJSONObject(index);
            if (entry != null && expectedOrder.equals(entry.optString("blockingOrderId"))) {
                quarantine.remove(index);
            }
        }
        return quarantine;
    }

    private void quarantineInvalidPendingStateIfNeeded(SharedPreferences preferences) {
        String pendingOrder = preferences.getString(PENDING_ORDER, "");
        if (pendingOrder.isEmpty() || normalizedOrderId(pendingOrder) != null) return;

        QueueLoadState quarantineState = loadQuarantinedResultQueueState(preferences);
        if (!quarantineState.safeForMutation) return;
        JSONArray quarantine = quarantineState.values;
        boolean providerLaunchRecorded = preferences.getBoolean(SALE_LAUNCHED, false)
            || preferences.getBoolean(STATUS_LAUNCHED, false)
            || preferences.getBoolean(VOID_LAUNCHED, false)
            || preferences.getLong(LAST_LAUNCH_AT, 0L) > 0L;
        JSONObject evidence = new JSONObject();
        try {
            evidence.put("pendingOrder", pendingOrder);
            evidence.put("pendingAmount", preferences.getString(PENDING_AMOUNT, ""));
            evidence.put("pendingOperation", preferences.getString(PENDING_OPERATION, ""));
            evidence.put("lastLaunchAt", preferences.getLong(LAST_LAUNCH_AT, 0L));
            evidence.put("lastLaunchOperation", preferences.getString(LAST_LAUNCH_OPERATION, ""));
        } catch (JSONException ignored) {
            // JSONObject values above are primitives; retain an empty evidence
            // object if a platform implementation unexpectedly rejects one.
        }
        if (!providerLaunchRecorded || !hasBlockingQuarantinedResultForOrder(quarantine, pendingOrder)) {
            appendQuarantinedResult(
                quarantine,
                "INVALID_PENDING_ORDER",
                providerLaunchRecorded ? pendingOrder : null,
                evidence
            );
        }

        if (providerLaunchRecorded) {
            // First persist the migration blocker. This call must remain
            // fail-closed even when the write fails; the raw pending order is
            // deliberately left untouched in that case.
            if (!writeQuarantinedResultQueue(preferences.edit(), quarantine).commit()) return;

            JSONArray registry = loadCallbackAttemptRegistry(preferences);
            long now = System.currentTimeMillis();
            long latestEvidenceAt = latestLegacyRecoveryEvidenceAt(
                quarantine,
                registry,
                pendingOrder,
                preferences.getLong(LAST_LAUNCH_AT, 0L)
            );
            if (latestEvidenceAt <= 0L || now - latestEvidenceAt < LEGACY_PENDING_RECOVERY_GRACE_MS) {
                return;
            }

            QueueLoadState resultState = loadResultQueueState(preferences);
            if (!resultState.safeForMutation
                || resultState.values.length() > 0
                || hasLegacyProviderEvidence(quarantine, registry, pendingOrder)) {
                return;
            }

            // An old legacy launch with no callback/result evidence is released
            // only after the grace period. Its callback hosts remain retained
            // as released registry entries so a genuinely late provider return
            // is still quarantined rather than treated as a new SALE result.
            if (!markLegacyPendingQuarantineReleased(quarantine, pendingOrder, now)) return;
            SharedPreferences.Editor recoveryEditor = legacyPendingReleaseEditor(preferences);
            writeQuarantinedResultQueue(recoveryEditor, quarantine);
            if (!markCallbackAttemptsReleased(preferences, pendingOrder, recoveryEditor)) return;
            return;
        }

        SharedPreferences.Editor editor = preferences.edit()
            .remove(PENDING_ORDER)
            .remove(PENDING_AMOUNT)
            .remove(PENDING_OPERATION)
            .remove(SALE_LAUNCHED)
            .remove(STATUS_LAUNCHED)
            .remove(VOID_LAUNCHED)
            .remove(SALE_ACKNOWLEDGED)
            .remove(LAST_LAUNCH_AT)
            .remove(LAST_LAUNCH_OPERATION);
        writeQuarantinedResultQueue(editor, quarantine).commit();
    }

    private long latestLegacyRecoveryEvidenceAt(
        JSONArray quarantine,
        JSONArray registry,
        String pendingOrder,
        long lastLaunchAt
    ) {
        long latest = lastLaunchAt;
        for (int index = 0; index < quarantine.length(); index++) {
            JSONObject entry = quarantine.optJSONObject(index);
            if (entry != null
                && pendingOrder.equals(entry.optString("blockingOrderId"))) {
                latest = Math.max(latest, entry.optLong("quarantinedAt", 0L));
            }
        }
        for (int index = 0; index < registry.length(); index++) {
            JSONObject entry = registry.optJSONObject(index);
            if (entry != null && pendingOrder.equals(entry.optString("orderId"))) {
                latest = Math.max(latest, entry.optLong("registeredAt", 0L));
                latest = Math.max(latest, entry.optLong("receivedAt", 0L));
            }
        }
        return latest;
    }

    private boolean hasLegacyProviderEvidence(
        JSONArray quarantine,
        JSONArray registry,
        String pendingOrder
    ) {
        for (int index = 0; index < quarantine.length(); index++) {
            JSONObject entry = quarantine.optJSONObject(index);
            if (entry == null || !pendingOrder.equals(entry.optString("blockingOrderId"))) continue;
            if (!"INVALID_PENDING_ORDER".equals(entry.optString("reason"))) return true;
        }
        for (int index = 0; index < registry.length(); index++) {
            JSONObject entry = registry.optJSONObject(index);
            if (entry != null
                && pendingOrder.equals(entry.optString("orderId"))
                && entry.optBoolean("callbackReceived", false)) {
                return true;
            }
        }
        return false;
    }

    private boolean markLegacyPendingQuarantineReleased(
        JSONArray quarantine,
        String pendingOrder,
        long releasedAt
    ) {
        for (int index = 0; index < quarantine.length(); index++) {
            JSONObject entry = quarantine.optJSONObject(index);
            if (entry == null
                || !pendingOrder.equals(entry.optString("blockingOrderId"))
                || !"INVALID_PENDING_ORDER".equals(entry.optString("reason"))) {
                continue;
            }
            try {
                entry.put("reason", "LEGACY_PENDING_RELEASED_AFTER_GRACE");
                entry.put("releasedAt", releasedAt);
                entry.remove("blockingOrderId");
            } catch (JSONException ignored) {
                return false;
            }
        }
        return true;
    }

    private boolean markLegacyPendingQuarantineReviewed(
        JSONArray quarantine,
        String pendingOrder,
        long releasedAt,
        String reviewReference
    ) {
        boolean reviewedEvidence = false;
        for (int index = 0; index < quarantine.length(); index++) {
            JSONObject entry = quarantine.optJSONObject(index);
            if (entry == null || !pendingOrder.equals(entry.optString("blockingOrderId"))) {
                continue;
            }
            try {
                if (!entry.has("originalReason")) {
                    entry.put("originalReason", entry.optString("reason", "UNKNOWN"));
                }
                entry.put("reason", "LEGACY_PENDING_RELEASED_AFTER_REVIEW");
                entry.put("releasedAt", releasedAt);
                entry.put("reviewReference", reviewReference);
                entry.remove("blockingOrderId");
                reviewedEvidence = true;
            } catch (JSONException ignored) {
                return false;
            }
        }
        return reviewedEvidence;
    }

    private SharedPreferences.Editor legacyPendingReleaseEditor(SharedPreferences preferences) {
        return preferences.edit()
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
            .remove(LAST_LAUNCH_OPERATION);
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
        String legacyOrderId = normalizedLegacyOrderId(preferences.getString(PENDING_ORDER, ""));
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
        String currentPendingOrder = preferences.getString(PENDING_ORDER, "");
        while (registry.length() >= CALLBACK_ATTEMPT_REGISTRY_LIMIT) {
            int removableIndex = findSafestCallbackAttemptToDrop(
                registry,
                queuedResults,
                currentPendingOrder
            );
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

    private boolean markCallbackAttemptsReleased(
        SharedPreferences preferences,
        String orderId,
        SharedPreferences.Editor editor
    ) {
        JSONArray registry = loadCallbackAttemptRegistry(preferences);
        long releasedAt = System.currentTimeMillis();
        for (int index = 0; index < registry.length(); index++) {
            JSONObject entry = registry.optJSONObject(index);
            if (entry == null || !orderId.equals(entry.optString("orderId"))) continue;
            try {
                entry.put("releasedAt", releasedAt);
            } catch (JSONException error) {
                return false;
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
            entry.put("releasedAt", 0L);
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
            && normalizedLegacyOrderId(entry.optString("orderId")) != null
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

    private int findSafestCallbackAttemptToDrop(
        JSONArray registry,
        JSONArray queuedResults,
        String currentPendingOrder
    ) {
        for (int index = 0; index < registry.length(); index++) {
            JSONObject entry = registry.optJSONObject(index);
            if (entry != null
                && !isProtectedCallbackAttempt(entry, currentPendingOrder)
                && entry.optBoolean("callbackReceived", false)
                && hasQueuedResultForAttempt(queuedResults, entry.optString("attemptId"))) {
                return index;
            }
        }
        long now = System.currentTimeMillis();
        for (int index = 0; index < registry.length(); index++) {
            JSONObject entry = registry.optJSONObject(index);
            long releasedAt = entry == null ? 0L : entry.optLong("releasedAt", 0L);
            if (entry != null
                && !isProtectedCallbackAttempt(entry, currentPendingOrder)
                && releasedAt > 0L
                && now - releasedAt >= RELEASED_CALLBACK_RETENTION_MS) {
                return index;
            }
        }

        // At the high-water mark, compact the oldest explicitly released
        // attempt even during the normal retention window. Active unresolved
        // attempts (releasedAt == 0) and every attempt for the current pending
        // order remain ineligible, so compaction can sustain normal checkout
        // volume without sacrificing the identity of an in-flight payment.
        int oldestReleasedIndex = -1;
        long oldestReleasedAt = Long.MAX_VALUE;
        for (int index = 0; index < registry.length(); index++) {
            JSONObject entry = registry.optJSONObject(index);
            if (entry == null || isProtectedCallbackAttempt(entry, currentPendingOrder)) continue;
            long releasedAt = entry.optLong("releasedAt", 0L);
            if (releasedAt > 0L && releasedAt < oldestReleasedAt) {
                oldestReleasedAt = releasedAt;
                oldestReleasedIndex = index;
            }
        }
        return oldestReleasedIndex;
    }

    private boolean isProtectedCallbackAttempt(JSONObject entry, String currentPendingOrder) {
        return entry.optLong("releasedAt", 0L) <= 0L
            || (!safe(currentPendingOrder).isEmpty()
                && safe(currentPendingOrder).equals(entry.optString("orderId")));
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
        String normalized = safe(value).toUpperCase(Locale.ROOT);
        return ORDER_PATTERN.matcher(normalized).matches() ? normalized : null;
    }

    private static String normalizedLegacyOrderId(String value) {
        String normalized = safe(value);
        return LEGACY_ORDER_PATTERN.matcher(normalized).matches() ? normalized : null;
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
