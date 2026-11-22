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
import java.util.regex.Matcher;
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
    private static final String CALLBACK_REGISTRY_RECOVERY_REQUIRED = "callback_registry_recovery_required";
    private static final String REVIEWED_CALLBACK_REGISTRY_ARCHIVE = "reviewed_callback_registry_archive";
    private static final String REVIEWED_CALLBACK_HOST_TOMBSTONES = "reviewed_callback_host_tombstones";
    private static final String REVIEWED_LATE_CALLBACK_ARCHIVE = "reviewed_late_callback_archive";
    private static final String STORED_STATE_SCHEMA_VERSION = "stored_state_schema_version";
    private static final String STATE_SCHEMA_UPGRADE_CUTOFF_AT = "state_schema_upgrade_cutoff_at";
    private static final String LEGACY_STATUS_ERROR_CODE = "5000";
    private static final int BRIDGE_API_VERSION = 11;
    private static final int STATE_SCHEMA_VERSION = 2;
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
    private static final Pattern RAW_CALLBACK_HOST_PATTERN = Pattern.compile(
        "\\\"callbackHost\\\"\\s*:\\s*\\\"(a-[0-9a-f]{32}\\.fiuu-vt\\.rkj\\.one)\\\"",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern RAW_ATTEMPT_ID_PATTERN = Pattern.compile(
        "\\\"attemptId\\\"\\s*:\\s*\\\"([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\\\"",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern ATTEMPT_ID_PATTERN = Pattern.compile(
        "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    );
    private static final Pattern CALLBACK_HOST_PATTERN = Pattern.compile(
        "^a-[0-9a-f]{32}\\.fiuu-vt\\.rkj\\.one$"
    );
    private static final Set<String> STATUS_CODES = new HashSet<>(
        Arrays.asList("00", "11", "22", "33", "44", "45", "55")
    );

    private static final class QueueLoadState {
        final JSONArray values;
        final boolean safeForMutation;

        QueueLoadState(JSONArray values, boolean safeForMutation) {
            this.values = values;
            this.safeForMutation = safeForMutation;
        }
    }

    private static final class RegistryLoadState {
        final JSONArray values;
        final boolean safeForMutation;

        RegistryLoadState(JSONArray values, boolean safeForMutation) {
            this.values = values;
            this.safeForMutation = safeForMutation;
        }
    }

    @PluginMethod
    public synchronized void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        SharedPreferences preferences = preferences();
        long now = System.currentTimeMillis();
        long upgradeCutoffAt = ensureStateSchemaUpgradeWindow(preferences, now);
        quarantineInvalidPendingStateIfNeeded(preferences);
        RegistryLoadState registryState = loadCallbackAttemptRegistryState(preferences);
        String pendingOperation = recoverStaleVoidIfNeeded(preferences, now);
        result.put("bridgeApiVersion", BRIDGE_API_VERSION);
        result.put("stateSchemaVersion", STATE_SCHEMA_VERSION);
        result.put("callbackRegistryRecoveryRequired", !registryState.safeForMutation);
        result.put("hostAppVersionCode", packageVersionCode(getContext().getPackageName()));
        result.put("hostAppVersionName", packageVersion(getContext().getPackageName()));
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
        releaseLegacyAcknowledgedStatusErrorAfterUpgradeIfSafe(
            preferences,
            registryState,
            upgradeCutoffAt
        );
        result.put(
            "stateSchemaMigrationComplete",
            preferences.getInt(STORED_STATE_SCHEMA_VERSION, 0) >= STATE_SCHEMA_VERSION
        );
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
        if (!loadCallbackAttemptRegistryState(preferences).safeForMutation) {
            call.reject(
                "Daftar callback Fiuu VT memerlukan pemulihan selamat.",
                "FIUU_STORAGE_RECOVERY_REQUIRED"
            );
            return;
        }
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
        boolean registryRecoveryReviewed = Boolean.TRUE.equals(
            call.getBoolean("registryRecoveryReviewed")
        );
        String reviewReference = safe(call.getString("reviewReference", ""));
        SharedPreferences preferences = preferences();
        if (callbackAttemptId == null
            || orderId == null
            || !("SALE".equals(opType) || "STATUS".equals(opType) || "VOID".equals(opType))
            || !TRANSACTION_PATTERN.matcher(transactionId).matches()
            || !STATUS_CODES.contains(status)) {
            call.reject("Pengesahan keputusan Fiuu VT tidak sah.", "INVALID_FIUU_RESULT_ACK");
            return;
        }
        if (registryRecoveryReviewed && reviewReference.length() < 8) {
            call.reject(
                "Rujukan semakan pemulihan daftar callback tidak sah.",
                "INVALID_FIUU_REVIEW_REFERENCE"
            );
            return;
        }

        boolean reviewedRegistryRecovery = registryRecoveryReviewed
            && callbackRegistryRequiresReviewedRecoveryWithoutMutation(preferences);
        JSONArray queue;
        if (reviewedRegistryRecovery) {
            QueueLoadState queueState = loadResultQueueForReviewedAcknowledgement(preferences);
            if (!queueState.safeForMutation) {
                call.reject(
                    "Storan keputusan Fiuu VT tidak selamat untuk pengesahan semakan.",
                    "FIUU_STORAGE_RECOVERY_REQUIRED"
                );
                return;
            }
            queue = queueState.values;
        } else {
            queue = loadResultQueue(preferences);
        }
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
        if (reviewedRegistryRecovery) {
            if (!acknowledgeQueuedResultAfterReviewedRegistryRecovery(
                preferences,
                queue,
                resultIndex,
                opType,
                orderId,
                "",
                callbackAttemptId,
                reviewReference
            )) {
                call.reject(
                    "Keputusan Fiuu VT belum dapat diarkib dan disahkan secara atomik.",
                    "FIUU_RESULT_ACK_PERSIST_FAILED"
                );
                return;
            }
            call.resolve();
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
        // A terminal STATUS acknowledges only this exact queued callback. It
        // must never erase other quarantined evidence for the same order.
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
        boolean registryRecoveryReviewed = Boolean.TRUE.equals(
            call.getBoolean("registryRecoveryReviewed")
        );
        String reviewReference = safe(call.getString("reviewReference", ""));
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
        if (registryRecoveryReviewed && reviewReference.length() < 8) {
            call.reject(
                "Rujukan semakan pemulihan daftar callback tidak sah.",
                "INVALID_FIUU_REVIEW_REFERENCE"
            );
            return;
        }

        boolean reviewedRegistryRecovery = registryRecoveryReviewed
            && callbackRegistryRequiresReviewedRecoveryWithoutMutation(preferences);
        JSONArray queue;
        if (reviewedRegistryRecovery) {
            QueueLoadState queueState = loadResultQueueForReviewedAcknowledgement(preferences);
            if (!queueState.safeForMutation) {
                call.reject(
                    "Storan ralat Fiuu VT tidak selamat untuk pengesahan semakan.",
                    "FIUU_STORAGE_RECOVERY_REQUIRED"
                );
                return;
            }
            queue = queueState.values;
        } else {
            queue = loadResultQueue(preferences);
        }
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
        if (reviewedRegistryRecovery) {
            if (!acknowledgeQueuedResultAfterReviewedRegistryRecovery(
                preferences,
                queue,
                resultIndex,
                opType,
                orderId,
                errorCode,
                callbackAttemptId,
                reviewReference
            )) {
                call.reject(
                    "Ralat Fiuu VT belum dapat diarkib dan disahkan secara atomik.",
                    "FIUU_RESULT_ACK_PERSIST_FAILED"
                );
                return;
            }
            call.resolve();
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
        if ("STATUS".equals(opType)) {
            // The exact STATUS error is acknowledged only after the server has
            // durably quarantined it. Retire only matching low-value STATUS
            // error evidence for that order in the same commit. Unrelated SALE,
            // successful STATUS and malformed evidence remain fail-closed.
            JSONArray quarantine = removeBlockingQuarantinedResultsForOrder(
                loadQuarantinedResultQueue(preferences),
                orderId,
                errorCode,
                callbackAttemptId,
                0L,
                "STATUS_ERROR_ACKNOWLEDGED"
            );
            writeQuarantinedResultQueue(acknowledgementEditor, quarantine);
        }
        boolean persisted = "STATUS".equals(opType)
            ? markStatusErrorAttemptAcknowledged(
                preferences,
                callbackAttemptId,
                errorCode,
                acknowledgementEditor
            )
            : removeCallbackAttempt(preferences, callbackAttemptId, acknowledgementEditor);
        if (!persisted) {
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
        if (!loadCallbackAttemptRegistryState(preferences).safeForMutation) {
            call.reject(
                "Daftar callback Fiuu VT memerlukan pemulihan selamat.",
                "FIUU_STORAGE_RECOVERY_REQUIRED"
            );
            return;
        }
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
        if (!loadCallbackAttemptRegistryState(preferences).safeForMutation) {
            call.reject(
                "Daftar callback Fiuu VT memerlukan pemulihan selamat.",
                "FIUU_STORAGE_RECOVERY_REQUIRED"
            );
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
        boolean registryRecoveryReviewed = Boolean.TRUE.equals(
            call.getBoolean("registryRecoveryReviewed")
        );
        String reviewReference = safe(call.getString("reviewReference", ""));
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
        QueueLoadState quarantineState = loadQuarantinedResultQueueState(preferences);
        if (!quarantineState.safeForMutation) {
            call.reject(
                "Storan bukti kuarantin Fiuu VT belum dapat dipulihkan dengan selamat.",
                "FIUU_STORAGE_RECOVERY_REQUIRED"
            );
            return;
        }
        boolean hasBlockingQuarantine = hasBlockingQuarantinedResultForOrder(
            quarantineState.values,
            orderId
        );
        if (hasBlockingQuarantine
            && (!registryRecoveryReviewed || reviewReference.length() < 8)) {
            call.reject(
                "Bukti callback Fiuu VT perlu direkonsiliasi melalui semakan STATUS.",
                "FIUU_RECONCILIATION_REQUIRED"
            );
            return;
        }
        JSONArray reviewedQuarantine = quarantineState.values;
        if (hasBlockingQuarantine) {
            reviewedQuarantine = markBlockingQuarantinedResultsReviewed(
                quarantineState.values,
                orderId,
                reviewReference
            );
            if (reviewedQuarantine == null) {
                call.reject(
                    "Bukti kuarantin Fiuu VT belum dapat ditanda sebagai disemak.",
                    "FIUU_CLEAR_PERSIST_FAILED"
                );
                return;
            }
        }
        // Migrate any pre-registry ACTIVE_* identity while its order/amount
        // context is still available, then retain it for a possible late
        // provider callback after the payment state is cleared.
        RegistryLoadState registryState = loadCallbackAttemptRegistryState(preferences);
        if (!registryState.safeForMutation
            && (!registryRecoveryReviewed || reviewReference.length() < 8)) {
            call.reject(
                "Daftar callback Fiuu VT memerlukan pengesahan pelayan sebelum dipulihkan.",
                "FIUU_STORAGE_RECOVERY_REQUIRED"
            );
            return;
        }
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
        writeQuarantinedResultQueue(clearEditor, reviewedQuarantine);
        boolean cleared = registryState.safeForMutation
            ? markCallbackAttemptsReleased(preferences, orderId, clearEditor)
            : archiveUnsafeCallbackRegistryForReviewedRecovery(
                preferences,
                reviewedQuarantine,
                orderId,
                reviewReference,
                clearEditor
            );
        if (!cleared) {
            call.reject("Keadaan terminal Fiuu VT belum dapat dibersihkan.", "FIUU_CLEAR_PERSIST_FAILED");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public synchronized void recoverOrphanedCallbackRegistry(PluginCall call) {
        boolean reviewed = Boolean.TRUE.equals(call.getBoolean("reviewed"));
        String reviewReference = safe(call.getString("reviewReference", ""));
        SharedPreferences preferences = preferences();
        if (!preferences.getString(PENDING_ORDER, "").isEmpty()) {
            call.reject(
                "Order Fiuu VT masih aktif; gunakan pemulihan transaksi tepat.",
                "FIUU_ORPHAN_RECOVERY_HAS_ORDER"
            );
            return;
        }
        if (!reviewed || reviewReference.length() < 8) {
            call.reject(
                "Pemulihan daftar callback tanpa order memerlukan rujukan semakan.",
                "FIUU_ORPHAN_RECOVERY_NOT_REVIEWED"
            );
            return;
        }

        QueueLoadState resultState = loadResultQueueState(preferences);
        QueueLoadState quarantineState = loadQuarantinedResultQueueState(preferences);
        if (!resultState.safeForMutation || resultState.values.length() > 0
            || !quarantineState.safeForMutation) {
            call.reject(
                "Bukti callback masih belum selamat untuk diarkib.",
                "FIUU_ORPHAN_RECOVERY_BLOCKED"
            );
            return;
        }
        // Historical order-specific quarantine evidence remains untouched and
        // auditable. It must not strand an unrelated, orderless corrupt
        // registry forever: reviewed recovery archives only the registry and
        // creates late-callback tombstones; it never marks those blockers safe.

        RegistryLoadState registryState = loadCallbackAttemptRegistryState(preferences);
        if (registryState.safeForMutation
            && !preferences.getBoolean(CALLBACK_REGISTRY_RECOVERY_REQUIRED, false)) {
            call.resolve();
            return;
        }
        SharedPreferences.Editor editor = preferences.edit();
        if (!archiveUnsafeCallbackRegistryForReviewedRecovery(
            preferences,
            quarantineState.values,
            "",
            reviewReference,
            editor
        )) {
            call.reject(
                "Bukti daftar callback tanpa order belum dapat diarkib.",
                "FIUU_ORPHAN_RECOVERY_PERSIST_FAILED"
            );
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
        RegistryLoadState registryState = loadCallbackAttemptRegistryState(preferences);
        JSONArray registry = registryState.values;
        long now = System.currentTimeMillis();
        long latestEvidenceAt = latestLegacyRecoveryEvidenceAt(
            quarantineState.values,
            registry,
            pendingOrder,
            preferences.getLong(LAST_LAUNCH_AT, 0L)
        );
        if (!quarantineState.safeForMutation
            || !resultState.safeForMutation
            || !registryState.safeForMutation
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
        RegistryLoadState registryState = loadCallbackAttemptRegistryState(preferences);
        if (!registryState.safeForMutation) {
            quarantineCallbackWhileRegistryUnsafe(preferences, callbackHost, uri);
            return true;
        }
        JSONObject callbackAttempt = callbackHost == null
            ? null
            : findCallbackAttemptByHost(registryState.values, callbackHost);
        if (callbackAttempt == null) {
            if (callbackHost != null && isReviewedCallbackHostTombstone(preferences, callbackHost)) {
                archiveLateCallbackForReviewedTombstone(preferences, callbackHost, uri);
            } else if (callbackHost != null && preferences.getBoolean(
                CALLBACK_REGISTRY_RECOVERY_REQUIRED,
                false
            )) {
                quarantineCallbackWhileRegistryUnsafe(preferences, callbackHost, uri);
            }
            // The manifest intentionally accepts every host for our private
            // scheme. Only a durable one-time host issued by this bridge is
            // trusted. Foreign callbacks are consumed without changing payment
            // state; reviewed hosts are retained in the dedicated evidence log.
            return true;
        }
        if (callbackAttempt.optBoolean("callbackReceived", false)) {
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

    private void quarantineCallbackWhileRegistryUnsafe(
        SharedPreferences preferences,
        String callbackHost,
        Uri uri
    ) {
        // An invalid/foreign host cannot be linked to our issued identity and
        // must not be allowed to create a blocking record (DoS). A syntactically
        // valid one-time host arriving while the registry is corrupt is kept as
        // forensic evidence instead of being silently swallowed.
        if (callbackHost == null) return;
        JSONArray quarantine = loadQuarantinedResultQueue(preferences);
        JSONObject evidence = new JSONObject();
        String rawCallback = uri == null ? "" : uri.toString();
        try {
            evidence.put("callbackHost", callbackHost);
            evidence.put("rawCallback", rawCallback.length() <= 4096
                ? rawCallback
                : rawCallback.substring(0, 4096));
            evidence.put("receivedAt", System.currentTimeMillis());
        } catch (JSONException ignored) {
            return;
        }
        appendQuarantinedResult(
            quarantine,
            "CALLBACK_WHILE_REGISTRY_UNSAFE",
            preferences.getString(PENDING_ORDER, ""),
            evidence
        );
        writeQuarantinedResultQueue(preferences.edit(), quarantine).commit();
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

    /**
     * Reviewed acknowledgement must not run the normal repair loader because
     * that loader may commit a quarantine migration before the acknowledgement
     * itself. Parse the complete queue strictly and leave every byte untouched
     * unless the caller's single atomic editor is committed.
     */
    private QueueLoadState loadResultQueueForReviewedAcknowledgement(
        SharedPreferences preferences
    ) {
        JSONArray queue = new JSONArray();
        String rawQueue = preferences.getString(RESULT_QUEUE, "");
        if (!rawQueue.isEmpty()) {
            try {
                JSONArray storedQueue = new JSONArray(rawQueue);
                for (int index = 0; index < storedQueue.length(); index++) {
                    JSONObject entry = storedQueue.optJSONObject(index);
                    if (!isProcessableQueuedResult(entry)) {
                        return new QueueLoadState(queue, false);
                    }
                    queue.put(entry);
                }
            } catch (JSONException error) {
                return new QueueLoadState(queue, false);
            }
        }

        String legacyResult = preferences.getString(LAST_RESULT, "");
        if (!legacyResult.isEmpty()) {
            try {
                JSONObject legacyValue = new JSONObject(legacyResult);
                JSONObject legacyEntry = new JSONObject();
                legacyEntry.put(
                    "receivedAt",
                    preferences.getLong(LAST_RESULT_AT, System.currentTimeMillis())
                );
                legacyEntry.put("result", legacyValue);
                if (!isProcessableQueuedResult(legacyEntry)) {
                    return new QueueLoadState(queue, false);
                }
                if (findEquivalentResultIndex(queue, legacyValue) < 0) {
                    queue.put(legacyEntry);
                }
            } catch (JSONException error) {
                return new QueueLoadState(queue, false);
            }
        }
        return new QueueLoadState(queue, true);
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

    private QueueLoadState loadQuarantinedResultQueueForReviewedAcknowledgement(
        SharedPreferences preferences
    ) {
        JSONArray quarantine = new JSONArray();
        String rawQueue = preferences.getString(QUARANTINED_RESULT_QUEUE, "");
        if (rawQueue.isEmpty()) return new QueueLoadState(quarantine, true);
        try {
            JSONArray storedQueue = new JSONArray(rawQueue);
            for (int index = 0; index < storedQueue.length(); index++) {
                JSONObject entry = storedQueue.optJSONObject(index);
                if (entry == null) return new QueueLoadState(quarantine, false);
                quarantine.put(entry);
            }
            return new QueueLoadState(quarantine, true);
        } catch (JSONException error) {
            return new QueueLoadState(quarantine, false);
        }
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
            int removableIndex = findSafestQuarantinedResultToDrop(quarantine);
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

    private int findSafestQuarantinedResultToDrop(JSONArray quarantine) {
        // Capacity pressure may discard only non-blocking diagnostics. Every
        // blockingOrderId is durable transaction evidence, including evidence
        // for a historical order when no order is currently pending. If all
        // entries block an order, allow the queue to exceed the soft cap.
        for (int index = 0; index < quarantine.length(); index++) {
            JSONObject entry = quarantine.optJSONObject(index);
            if (entry != null && entry.optString("blockingOrderId").isEmpty()) return index;
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

    /**
     * Version 1.8.2 removed an acknowledged STATUS error from RESULT_QUEUE and
     * CALLBACK_ATTEMPT_REGISTRY, but did not retire a matching quarantine entry.
     * After an in-place Play update the exact callback can no longer be
     * acknowledged again, leaving the next customer blocked forever.
     *
     * This migration deliberately does not clear PENDING_ORDER and never opens
     * Fiuu. It only makes old STATUS error 5000 evidence non-blocking when the
     * native queue is durably empty and no callback attempt for the order remains
     * unresolved. The web layer must still prove the server payment is durably
     * QUARANTINED before it calls clearPendingResult.
     */
    private void releaseLegacyAcknowledgedStatusErrorAfterUpgradeIfSafe(
        SharedPreferences preferences,
        RegistryLoadState registryState,
        long upgradeCutoffAt
    ) {
        if (preferences.getInt(STORED_STATE_SCHEMA_VERSION, 0) >= STATE_SCHEMA_VERSION
            || upgradeCutoffAt <= 0L) {
            return;
        }

        String rawPendingOrder = preferences.getString(PENDING_ORDER, "");
        String pendingOrder = normalizedOrderId(rawPendingOrder);
        if (rawPendingOrder.isEmpty()) {
            completeStateSchemaMigration(preferences);
            return;
        }
        if (pendingOrder == null
            || !"STATUS".equals(preferences.getString(PENDING_OPERATION, ""))
            || !preferences.getBoolean(STATUS_LAUNCHED, false)) {
            return;
        }

        QueueLoadState resultState = loadResultQueueState(preferences);
        if (!resultState.safeForMutation || resultState.values.length() > 0) return;

        if (!registryState.safeForMutation
            || hasUnresolvedCallbackAttemptForOrder(registryState.values, pendingOrder)) {
            return;
        }

        QueueLoadState quarantineState = loadQuarantinedResultQueueState(preferences);
        if (!quarantineState.safeForMutation) return;

        JSONArray quarantine = quarantineState.values;
        JSONArray migrated = removeBlockingQuarantinedResultsForOrder(
            quarantine,
            pendingOrder,
            LEGACY_STATUS_ERROR_CODE,
            null,
            upgradeCutoffAt,
            "STATUS_ERROR_5000_RELEASED_AFTER_1_8_2_UPGRADE"
        );
        // Identity equality is deliberate: the selective migration clones the
        // array only when it finds exact pre-upgrade evidence. Do not mark v2
        // complete merely because the queue happened to contain no match.
        if (migrated == quarantine) return;
        SharedPreferences.Editor migrationEditor = preferences.edit()
            .putInt(STORED_STATE_SCHEMA_VERSION, STATE_SCHEMA_VERSION)
            .remove(STATE_SCHEMA_UPGRADE_CUTOFF_AT);
        writeQuarantinedResultQueue(migrationEditor, migrated);
        migrationEditor.commit();
    }

    private long ensureStateSchemaUpgradeWindow(SharedPreferences preferences, long now) {
        if (preferences.getInt(STORED_STATE_SCHEMA_VERSION, 0) >= STATE_SCHEMA_VERSION) return 0L;
        long cutoffAt = preferences.getLong(STATE_SCHEMA_UPGRADE_CUTOFF_AT, 0L);
        if (cutoffAt > 0L) return cutoffAt;
        return preferences.edit().putLong(STATE_SCHEMA_UPGRADE_CUTOFF_AT, now).commit()
            ? now
            : 0L;
    }

    private boolean completeStateSchemaMigration(SharedPreferences preferences) {
        return preferences.edit()
            .putInt(STORED_STATE_SCHEMA_VERSION, STATE_SCHEMA_VERSION)
            .remove(STATE_SCHEMA_UPGRADE_CUTOFF_AT)
            .commit();
    }

    private JSONArray removeBlockingQuarantinedResultsForOrder(
        JSONArray quarantine,
        String orderId,
        String errorCode,
        String callbackAttemptId,
        long legacyUpgradeCutoffAt,
        String releaseReason
    ) {
        JSONArray updated = quarantine;
        long releasedAt = System.currentTimeMillis();
        for (int index = 0; index < quarantine.length(); index++) {
            JSONObject entry = quarantine.optJSONObject(index);
            if (!isMatchingStatusErrorQuarantine(
                entry,
                orderId,
                errorCode,
                callbackAttemptId,
                legacyUpgradeCutoffAt
            )) {
                continue;
            }
            if (updated == quarantine) {
                try {
                    updated = new JSONArray(quarantine.toString());
                } catch (JSONException ignored) {
                    return quarantine;
                }
            }
            JSONObject mutableEntry = updated.optJSONObject(index);
            if (mutableEntry == null) return quarantine;
            try {
                if (!mutableEntry.has("originalReason")) {
                    mutableEntry.put("originalReason", mutableEntry.optString("reason", "UNKNOWN"));
                }
                mutableEntry.put("reason", releaseReason);
                mutableEntry.put("releasedAt", releasedAt);
                mutableEntry.put("acknowledgedErrorCode", errorCode);
                if (callbackAttemptId != null) {
                    mutableEntry.put("acknowledgedCallbackAttemptId", callbackAttemptId);
                }
                mutableEntry.remove("blockingOrderId");
            } catch (JSONException ignored) {
                return quarantine;
            }
        }
        return updated;
    }

    private boolean isMatchingStatusErrorQuarantine(
        JSONObject entry,
        String orderId,
        String errorCode,
        String callbackAttemptId,
        long legacyUpgradeCutoffAt
    ) {
        if (entry == null || !orderId.equals(entry.optString("blockingOrderId"))) return false;
        String reason = entry.optString("reason");
        if (!("RESULT_QUEUE_INVALID".equals(reason) || "LEGACY_RESULT_INVALID".equals(reason))) {
            return false;
        }

        JSONObject evidence = entry.optJSONObject("evidence");
        JSONObject result = evidence == null ? null : evidence.optJSONObject("result");
        if (result == null && evidence != null && "ERROR".equals(evidence.optString("kind"))) {
            result = evidence;
        }
        if (result == null
            || !"ERROR".equals(result.optString("kind"))
            || !"STATUS".equals(result.optString("opType"))
            || !orderId.equals(normalizedOrderId(result.optString("orderId")))
            || !errorCode.equals(result.optString("errorCode"))) {
            return false;
        }

        String evidenceAttemptId = normalizedAttemptId(result.optString("callbackAttemptId"));
        if (callbackAttemptId != null) {
            return evidenceAttemptId != null && callbackAttemptId.equals(evidenceAttemptId);
        }
        long quarantinedAt = entry.optLong("quarantinedAt", 0L);
        return legacyUpgradeCutoffAt > 0L
            && quarantinedAt > 0L
            && quarantinedAt <= legacyUpgradeCutoffAt;
    }

    private boolean hasUnresolvedCallbackAttemptForOrder(JSONArray registry, String orderId) {
        for (int index = 0; index < registry.length(); index++) {
            JSONObject entry = registry.optJSONObject(index);
            if (entry != null
                && orderId.equals(entry.optString("orderId"))
                && entry.optLong("releasedAt", 0L) <= 0L) {
                return true;
            }
        }
        return false;
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

            RegistryLoadState registryState = loadCallbackAttemptRegistryState(preferences);
            if (!registryState.safeForMutation) return;
            JSONArray registry = registryState.values;
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

    private boolean acknowledgeQueuedResultAfterReviewedRegistryRecovery(
        SharedPreferences preferences,
        JSONArray queue,
        int resultIndex,
        String opType,
        String orderId,
        String errorCode,
        String callbackAttemptId,
        String reviewReference
    ) {
        if (resultIndex < 0 || resultIndex >= queue.length() || reviewReference.length() < 8) {
            return false;
        }
        JSONObject acceptedEntry = queue.optJSONObject(resultIndex);
        JSONObject acceptedResult = acceptedEntry == null
            ? null
            : acceptedEntry.optJSONObject("result");
        String acceptedCallbackHost = acceptedResult == null
            ? null
            : normalizedCallbackHost(acceptedResult.optString("callbackHost"));
        if (!isMatchingCallbackAttempt(callbackAttemptId, acceptedCallbackHost)) return false;

        QueueLoadState quarantineState =
            loadQuarantinedResultQueueForReviewedAcknowledgement(preferences);
        if (!quarantineState.safeForMutation) return false;
        JSONArray quarantine = quarantineState.values;
        if ("STATUS".equals(opType) && !errorCode.isEmpty()) {
            quarantine = removeBlockingQuarantinedResultsForOrder(
                quarantine,
                orderId,
                errorCode,
                callbackAttemptId,
                0L,
                "STATUS_ERROR_ACKNOWLEDGED"
            );
            if (hasMatchingStatusErrorQuarantine(
                quarantine,
                orderId,
                errorCode,
                callbackAttemptId
            )) {
                return false;
            }
        }

        // The exact callback was already accepted durably by the server. Keep
        // every unrelated queue entry and stage all native mutations together.
        queue.remove(resultIndex);
        SharedPreferences.Editor acknowledgementEditor = writeResultQueue(
            preferences.edit(),
            queue
        );
        if ("SALE".equals(opType) && orderId.equals(preferences.getString(PENDING_ORDER, ""))) {
            acknowledgementEditor
                .putBoolean(SALE_ACKNOWLEDGED, true)
                .putString(PENDING_OPERATION, "STATUS");
        } else if ("VOID".equals(opType)
            && orderId.equals(preferences.getString(PENDING_ORDER, ""))) {
            acknowledgementEditor
                .putString(PENDING_OPERATION, "STATUS")
                .putBoolean(VOID_LAUNCHED, false);
        }
        if (!stageUnsafeCallbackRegistryForReviewedRecovery(
            preferences,
            quarantine,
            orderId,
            reviewReference,
            acknowledgementEditor,
            callbackAttemptId,
            acceptedCallbackHost
        )) {
            return false;
        }
        // Sole persistence point for queue removal, operation state, STATUS
        // evidence, registry archive, tombstones, and unsafe-registry removal.
        return acknowledgementEditor.commit();
    }

    private boolean hasMatchingStatusErrorQuarantine(
        JSONArray quarantine,
        String orderId,
        String errorCode,
        String callbackAttemptId
    ) {
        for (int index = 0; index < quarantine.length(); index++) {
            if (isMatchingStatusErrorQuarantine(
                quarantine.optJSONObject(index),
                orderId,
                errorCode,
                callbackAttemptId,
                0L
            )) {
                return true;
            }
        }
        return false;
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
    private boolean callbackRegistryRequiresReviewedRecoveryWithoutMutation(
        SharedPreferences preferences
    ) {
        if (preferences.getBoolean(CALLBACK_REGISTRY_RECOVERY_REQUIRED, false)) return true;

        JSONArray registry = new JSONArray();
        String rawRegistry = preferences.getString(CALLBACK_ATTEMPT_REGISTRY, "");
        if (!rawRegistry.isEmpty()) {
            try {
                JSONArray storedRegistry = new JSONArray(rawRegistry);
                for (int index = 0; index < storedRegistry.length(); index++) {
                    JSONObject entry = storedRegistry.optJSONObject(index);
                    if (!isValidCallbackAttempt(entry)) return true;
                    String attemptId = entry.optString("attemptId");
                    String callbackHost = entry.optString("callbackHost");
                    if (findCallbackAttemptById(registry, attemptId) != null
                        || findCallbackAttemptByHost(registry, callbackHost) != null) {
                        return true;
                    }
                    registry.put(entry);
                }
            } catch (JSONException error) {
                return true;
            }
        }

        boolean hasLegacyMirror = preferences.contains(ACTIVE_ATTEMPT_ID)
            || preferences.contains(ACTIVE_CALLBACK_HOST)
            || preferences.contains(ACTIVE_ATTEMPT_OPERATION)
            || preferences.contains(ACTIVE_CALLBACK_RECEIVED);
        if (!hasLegacyMirror) return false;

        boolean hasCompleteLegacyMirror = preferences.contains(ACTIVE_ATTEMPT_ID)
            && preferences.contains(ACTIVE_CALLBACK_HOST)
            && preferences.contains(ACTIVE_ATTEMPT_OPERATION)
            && preferences.contains(ACTIVE_CALLBACK_RECEIVED);
        String legacyAttemptId = normalizedAttemptId(
            preferences.getString(ACTIVE_ATTEMPT_ID, "")
        );
        String legacyCallbackHost = normalizedCallbackHost(
            preferences.getString(ACTIVE_CALLBACK_HOST, "")
        );
        String legacyOperation = preferences.getString(ACTIVE_ATTEMPT_OPERATION, "");
        String legacyOrderId = normalizedLegacyOrderId(
            preferences.getString(PENDING_ORDER, "")
        );
        BigDecimal legacyAmount = normalizedAmount(preferences.getString(PENDING_AMOUNT, ""));
        boolean validLegacyMirror = isMatchingCallbackAttempt(
            legacyAttemptId,
            legacyCallbackHost
        ) && isFiuuOperation(legacyOperation)
            && legacyOrderId != null
            && legacyAmount != null;
        JSONObject existingById = findCallbackAttemptById(registry, legacyAttemptId);
        JSONObject existingByHost = findCallbackAttemptByHost(registry, legacyCallbackHost);
        if (!validLegacyMirror) {
            boolean releasedMirrorOnly = hasCompleteLegacyMirror
                && preferences.getString(PENDING_ORDER, "").isEmpty()
                && existingById != null
                && existingById == existingByHost
                && existingById.optLong("releasedAt", 0L) > 0L
                && legacyOperation.equals(existingById.optString("operation"));
            return !releasedMirrorOnly;
        }
        return (existingById == null) != (existingByHost == null)
            || (existingById != null && existingById != existingByHost);
    }

    private RegistryLoadState loadCallbackAttemptRegistryState(SharedPreferences preferences) {
        JSONArray registry = new JSONArray();
        boolean changed = false;
        boolean recoveryRequired = preferences.getBoolean(
            CALLBACK_REGISTRY_RECOVERY_REQUIRED,
            false
        );
        boolean unsafe = false;
        String rawRegistry = preferences.getString(CALLBACK_ATTEMPT_REGISTRY, "");
        if (!rawRegistry.isEmpty()) {
            try {
                JSONArray storedRegistry = new JSONArray(rawRegistry);
                for (int index = 0; index < storedRegistry.length(); index++) {
                    JSONObject entry = storedRegistry.optJSONObject(index);
                    if (!isValidCallbackAttempt(entry)) {
                        unsafe = true;
                        continue;
                    }
                    String attemptId = entry.optString("attemptId");
                    String callbackHost = entry.optString("callbackHost");
                    if (findCallbackAttemptById(registry, attemptId) != null
                        || findCallbackAttemptByHost(registry, callbackHost) != null) {
                        unsafe = true;
                        continue;
                    }
                    registry.put(entry);
                }
            } catch (JSONException ignored) {
                // Never rewrite malformed callback identity evidence into an
                // apparently empty registry. Losing an unresolved one-time host
                // could release a real provider callback as if it never existed.
                unsafe = true;
            }
        }

        boolean hasLegacyMirror = preferences.contains(ACTIVE_ATTEMPT_ID)
            || preferences.contains(ACTIVE_CALLBACK_HOST)
            || preferences.contains(ACTIVE_ATTEMPT_OPERATION)
            || preferences.contains(ACTIVE_CALLBACK_RECEIVED);
        boolean hasCompleteLegacyMirror = preferences.contains(ACTIVE_ATTEMPT_ID)
            && preferences.contains(ACTIVE_CALLBACK_HOST)
            && preferences.contains(ACTIVE_ATTEMPT_OPERATION)
            && preferences.contains(ACTIVE_CALLBACK_RECEIVED);
        String legacyAttemptId = normalizedAttemptId(preferences.getString(ACTIVE_ATTEMPT_ID, ""));
        String legacyCallbackHost = normalizedCallbackHost(
            preferences.getString(ACTIVE_CALLBACK_HOST, "")
        );
        String legacyOperation = preferences.getString(ACTIVE_ATTEMPT_OPERATION, "");
        String legacyOrderId = normalizedLegacyOrderId(preferences.getString(PENDING_ORDER, ""));
        BigDecimal legacyAmount = normalizedAmount(preferences.getString(PENDING_AMOUNT, ""));
        boolean validLegacyMirror = isMatchingCallbackAttempt(legacyAttemptId, legacyCallbackHost)
            && isFiuuOperation(legacyOperation)
            && legacyOrderId != null
            && legacyAmount != null;
        if (hasLegacyMirror && !validLegacyMirror) {
            JSONObject releasedById = findCallbackAttemptById(registry, legacyAttemptId);
            JSONObject releasedByHost = findCallbackAttemptByHost(registry, legacyCallbackHost);
            boolean releasedMirrorOnly = hasCompleteLegacyMirror
                && preferences.getString(PENDING_ORDER, "").isEmpty()
                && releasedById != null
                && releasedById == releasedByHost
                && releasedById.optLong("releasedAt", 0L) > 0L
                && legacyOperation.equals(releasedById.optString("operation"));
            if (releasedMirrorOnly) {
                // v1.8.4 and earlier mirrored the newest tombstone even after
                // PENDING_* was cleared. It is historical evidence, not an
                // unresolved callback, so let the canonical registry retain it
                // while saveCallbackAttemptRegistry clears the ACTIVE_* mirror.
                hasLegacyMirror = false;
                changed = true;
            } else {
            // A partial ACTIVE_* mirror can be the only surviving identity for
            // a real callback. Never normalize it into an empty registry.
                unsafe = true;
            }
        } else if (validLegacyMirror) {
            JSONObject existingById = findCallbackAttemptById(registry, legacyAttemptId);
            JSONObject existingByHost = findCallbackAttemptByHost(registry, legacyCallbackHost);
            if (existingById == null && existingByHost == null) {
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
                } else {
                    unsafe = true;
                }
            } else if (existingById == null
                || existingByHost == null
                || existingById != existingByHost) {
                // Conflicting id/host evidence cannot be repaired by choosing
                // one side. Preserve it for reviewed recovery.
                unsafe = true;
            }
        }

        if (recoveryRequired) {
            boolean everyRegistryEntryReleased = true;
            for (int index = 0; index < registry.length(); index++) {
                JSONObject entry = registry.optJSONObject(index);
                if (entry == null || entry.optLong("releasedAt", 0L) <= 0L) {
                    everyRegistryEntryReleased = false;
                    break;
                }
            }
            QueueLoadState resultState = loadResultQueueState(preferences);
            QueueLoadState quarantineState = loadQuarantinedResultQueueState(preferences);
            boolean hasAnyBlockingQuarantine = false;
            for (int index = 0; index < quarantineState.values.length(); index++) {
                JSONObject entry = quarantineState.values.optJSONObject(index);
                if (entry != null && !safe(entry.optString("blockingOrderId")).isEmpty()) {
                    hasAnyBlockingQuarantine = true;
                    break;
                }
            }
            boolean orphanedReleasedFlag = !unsafe
                && preferences.getString(PENDING_ORDER, "").isEmpty()
                && everyRegistryEntryReleased
                && resultState.safeForMutation
                && resultState.values.length() == 0
                && quarantineState.safeForMutation
                && !hasAnyBlockingQuarantine;
            if (orphanedReleasedFlag) {
                preferences.edit()
                    .remove(CALLBACK_REGISTRY_RECOVERY_REQUIRED)
                    .remove(ACTIVE_ATTEMPT_ID)
                    .remove(ACTIVE_CALLBACK_HOST)
                    .remove(ACTIVE_ATTEMPT_OPERATION)
                    .remove(ACTIVE_CALLBACK_RECEIVED)
                    .commit();
                changed = true;
            } else {
                unsafe = true;
            }
        }

        if (unsafe) {
            preferences.edit().putBoolean(CALLBACK_REGISTRY_RECOVERY_REQUIRED, true).commit();
            return new RegistryLoadState(registry, false);
        }

        if (changed || !legacyMirrorMatchesRegistry(preferences, registry)) {
            boolean persisted = saveCallbackAttemptRegistry(preferences, registry, preferences.edit());
            return new RegistryLoadState(registry, persisted);
        }
        return new RegistryLoadState(registry, true);
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

        RegistryLoadState registryState = loadCallbackAttemptRegistryState(preferences);
        if (!registryState.safeForMutation) {
            throw new IllegalStateException("Fiuu callback registry requires recovery");
        }
        JSONArray registry = registryState.values;
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
        RegistryLoadState registryState = loadCallbackAttemptRegistryState(preferences);
        if (!registryState.safeForMutation) return false;
        JSONArray registry = registryState.values;
        for (int index = registry.length() - 1; index >= 0; index--) {
            JSONObject entry = registry.optJSONObject(index);
            if (entry != null && callbackAttemptId.equals(entry.optString("attemptId"))) {
                registry.remove(index);
            }
        }
        return saveCallbackAttemptRegistry(preferences, registry, editor);
    }

    /**
     * A malformed/partial callback registry cannot be reconstructed safely on
     * device. Once the web layer has proved the matching server payment is
     * terminal or quarantined, archive every raw native identity as immutable,
     * non-blocking evidence and clear the corrupt mirror in the same commit as
     * the pending order. This is the only reviewed escape hatch; app data is
     * never cleared and unrelated quarantine blockers are never removed.
     */
    private boolean archiveUnsafeCallbackRegistryForReviewedRecovery(
        SharedPreferences preferences,
        JSONArray quarantine,
        String orderId,
        String reviewReference,
        SharedPreferences.Editor editor
    ) {
        if (!stageUnsafeCallbackRegistryForReviewedRecovery(
            preferences,
            quarantine,
            orderId,
            reviewReference,
            editor,
            null,
            null
        )) {
            return false;
        }
        return editor.commit();
    }

    private boolean stageUnsafeCallbackRegistryForReviewedRecovery(
        SharedPreferences preferences,
        JSONArray quarantine,
        String orderId,
        String reviewReference,
        SharedPreferences.Editor editor,
        String acknowledgedCallbackAttemptId,
        String acknowledgedCallbackHost
    ) {
        if (reviewReference.length() < 8) return false;
        boolean hasAcknowledgedIdentity = !safe(acknowledgedCallbackAttemptId).isEmpty()
            || !safe(acknowledgedCallbackHost).isEmpty();
        if (hasAcknowledgedIdentity && !isMatchingCallbackAttempt(
            normalizedAttemptId(acknowledgedCallbackAttemptId),
            normalizedCallbackHost(acknowledgedCallbackHost)
        )) {
            return false;
        }
        JSONArray archive = loadDurableEvidenceArrayWithoutMutation(
            preferences,
            REVIEWED_CALLBACK_REGISTRY_ARCHIVE
        );
        JSONArray tombstones = loadDurableEvidenceArrayWithoutMutation(
            preferences,
            REVIEWED_CALLBACK_HOST_TOMBSTONES
        );
        if (archive == null || tombstones == null) return false;

        JSONObject evidence = new JSONObject();
        String rawRegistry = preferences.getString(CALLBACK_ATTEMPT_REGISTRY, "");
        String activeAttemptId = preferences.getString(ACTIVE_ATTEMPT_ID, "");
        String activeCallbackHost = preferences.getString(ACTIVE_CALLBACK_HOST, "");
        long recoveredAt = System.currentTimeMillis();
        try {
            evidence.put("orderId", orderId);
            evidence.put("reviewReference", reviewReference);
            // This dedicated archive is intentionally not part of the capped
            // operational quarantine queue. Preserve every byte before the
            // live registry is removed so Finance/HQ can reconstruct identity.
            evidence.put("rawRegistry", rawRegistry);
            evidence.put("activeAttemptId", activeAttemptId);
            evidence.put("activeCallbackHost", activeCallbackHost);
            evidence.put("activeOperation", preferences.getString(ACTIVE_ATTEMPT_OPERATION, ""));
            evidence.put(
                "activeCallbackReceived",
                preferences.getBoolean(ACTIVE_CALLBACK_RECEIVED, false)
            );
            evidence.put("pendingAmount", preferences.getString(PENDING_AMOUNT, ""));
            evidence.put("pendingOperation", preferences.getString(PENDING_OPERATION, ""));
            if (hasAcknowledgedIdentity) {
                evidence.put("acknowledgedCallbackAttemptId", acknowledgedCallbackAttemptId);
                evidence.put("acknowledgedCallbackHost", acknowledgedCallbackHost);
            }
            evidence.put("recoveredAt", recoveredAt);
            archive.put(evidence);

            Set<String> callbackHosts = reviewedCallbackHosts(
                rawRegistry,
                activeAttemptId,
                activeCallbackHost
            );
            if (hasAcknowledgedIdentity) callbackHosts.add(acknowledgedCallbackHost);
            for (String callbackHost : callbackHosts) {
                if (hasReviewedCallbackHostTombstone(tombstones, callbackHost)) continue;
                JSONObject tombstone = new JSONObject();
                tombstone.put("callbackHost", callbackHost);
                tombstone.put("orderId", orderId);
                tombstone.put("reviewReference", reviewReference);
                tombstone.put("archivedAt", recoveredAt);
                tombstones.put(tombstone);
            }
        } catch (JSONException error) {
            return false;
        }

        JSONObject summary = new JSONObject();
        try {
            summary.put("orderId", orderId);
            summary.put("reviewReference", reviewReference);
            summary.put("archiveIndex", archive.length() - 1);
            summary.put("rawRegistryLength", rawRegistry.length());
            summary.put("recoveredAt", recoveredAt);
        } catch (JSONException error) {
            return false;
        }
        int quarantineLength = quarantine.length();
        appendQuarantinedResult(
            quarantine,
            "CALLBACK_REGISTRY_RECOVERY_REVIEWED",
            summary
        );
        if (quarantine.length() != quarantineLength + 1) return false;
        writeQuarantinedResultQueue(editor, quarantine)
            .putString(REVIEWED_CALLBACK_REGISTRY_ARCHIVE, archive.toString())
            .putString(REVIEWED_CALLBACK_HOST_TOMBSTONES, tombstones.toString())
            .remove(CALLBACK_ATTEMPT_REGISTRY)
            .remove(ACTIVE_ATTEMPT_ID)
            .remove(ACTIVE_CALLBACK_HOST)
            .remove(ACTIVE_ATTEMPT_OPERATION)
            .remove(ACTIVE_CALLBACK_RECEIVED)
            .remove(CALLBACK_REGISTRY_RECOVERY_REQUIRED);
        return true;
    }

    private JSONArray loadDurableEvidenceArray(SharedPreferences preferences, String key) {
        JSONArray evidence = loadDurableEvidenceArrayWithoutMutation(preferences, key);
        if (evidence != null) return evidence;
        preferences.edit().putBoolean(CALLBACK_REGISTRY_RECOVERY_REQUIRED, true).commit();
        return null;
    }

    private JSONArray loadDurableEvidenceArrayWithoutMutation(
        SharedPreferences preferences,
        String key
    ) {
        String raw = preferences.getString(key, "");
        if (raw.isEmpty()) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (JSONException error) {
            return null;
        }
    }

    private Set<String> reviewedCallbackHosts(
        String rawRegistry,
        String activeAttemptId,
        String activeCallbackHost
    ) {
        Set<String> hosts = new HashSet<>();
        String normalizedActiveHost = normalizedCallbackHost(activeCallbackHost);
        if (normalizedActiveHost != null) hosts.add(normalizedActiveHost);
        String normalizedActiveAttempt = normalizedAttemptId(activeAttemptId);
        if (normalizedActiveAttempt != null) {
            hosts.add("a-" + normalizedActiveAttempt.replace("-", "") + ".fiuu-vt.rkj.one");
        }

        try {
            JSONArray registry = new JSONArray(rawRegistry);
            for (int index = 0; index < registry.length(); index++) {
                JSONObject entry = registry.optJSONObject(index);
                if (entry == null) continue;
                String host = normalizedCallbackHost(entry.optString("callbackHost"));
                if (host != null) hosts.add(host);
                String attemptId = normalizedAttemptId(entry.optString("attemptId"));
                if (attemptId != null) {
                    hosts.add("a-" + attemptId.replace("-", "") + ".fiuu-vt.rkj.one");
                }
            }
        } catch (JSONException ignored) {
            // Raw evidence is scanned below even when the outer JSON is broken.
        }
        Matcher hostMatcher = RAW_CALLBACK_HOST_PATTERN.matcher(rawRegistry);
        while (hostMatcher.find()) {
            String host = normalizedCallbackHost(hostMatcher.group(1));
            if (host != null) hosts.add(host);
        }
        Matcher attemptMatcher = RAW_ATTEMPT_ID_PATTERN.matcher(rawRegistry);
        while (attemptMatcher.find()) {
            String attemptId = normalizedAttemptId(attemptMatcher.group(1));
            if (attemptId != null) {
                hosts.add("a-" + attemptId.replace("-", "") + ".fiuu-vt.rkj.one");
            }
        }
        return hosts;
    }

    private boolean hasReviewedCallbackHostTombstone(JSONArray tombstones, String callbackHost) {
        String expectedHost = normalizedCallbackHost(callbackHost);
        if (expectedHost == null) return false;
        for (int index = tombstones.length() - 1; index >= 0; index--) {
            JSONObject tombstone = tombstones.optJSONObject(index);
            if (tombstone != null
                && expectedHost.equals(tombstone.optString("callbackHost"))) return true;
        }
        return false;
    }

    private boolean isReviewedCallbackHostTombstone(
        SharedPreferences preferences,
        String callbackHost
    ) {
        JSONArray tombstones = loadDurableEvidenceArray(
            preferences,
            REVIEWED_CALLBACK_HOST_TOMBSTONES
        );
        return tombstones != null
            && hasReviewedCallbackHostTombstone(tombstones, callbackHost);
    }

    private void archiveLateCallbackForReviewedTombstone(
        SharedPreferences preferences,
        String callbackHost,
        Uri uri
    ) {
        JSONArray archive = loadDurableEvidenceArray(
            preferences,
            REVIEWED_LATE_CALLBACK_ARCHIVE
        );
        if (archive == null) {
            quarantineCallbackWhileRegistryUnsafe(preferences, callbackHost, uri);
            return;
        }
        try {
            JSONObject evidence = new JSONObject();
            evidence.put("callbackHost", callbackHost);
            evidence.put("rawCallback", uri == null ? "" : uri.toString());
            evidence.put("receivedAt", System.currentTimeMillis());
            archive.put(evidence);
        } catch (JSONException error) {
            preferences.edit().putBoolean(CALLBACK_REGISTRY_RECOVERY_REQUIRED, true).commit();
            quarantineCallbackWhileRegistryUnsafe(preferences, callbackHost, uri);
            return;
        }
        if (!preferences.edit()
            .putString(REVIEWED_LATE_CALLBACK_ARCHIVE, archive.toString())
            .commit()) {
            preferences.edit().putBoolean(CALLBACK_REGISTRY_RECOVERY_REQUIRED, true).commit();
            quarantineCallbackWhileRegistryUnsafe(preferences, callbackHost, uri);
        }
    }

    /**
     * Preserve every quarantined callback byte while making only the exact
     * server-reviewed order non-blocking. The web layer supplies this review
     * reference only after it has drained native callbacks and fetched a
     * terminal or quarantined payment from the server.
     */
    private JSONArray markBlockingQuarantinedResultsReviewed(
        JSONArray quarantine,
        String orderId,
        String reviewReference
    ) {
        String expectedOrder = safe(orderId);
        if (expectedOrder.isEmpty() || reviewReference.length() < 8) return null;

        JSONArray reviewed;
        try {
            reviewed = new JSONArray(quarantine.toString());
        } catch (JSONException error) {
            return null;
        }

        boolean changed = false;
        long reviewedAt = System.currentTimeMillis();
        for (int index = 0; index < reviewed.length(); index++) {
            JSONObject entry = reviewed.optJSONObject(index);
            if (entry == null || !expectedOrder.equals(entry.optString("blockingOrderId"))) {
                continue;
            }
            try {
                if (!entry.has("originalReason")) {
                    entry.put("originalReason", entry.optString("reason", "UNKNOWN"));
                }
                entry.put("originalBlockingOrderId", expectedOrder);
                entry.put("reason", "SERVER_PAYMENT_TERMINAL_REVIEWED");
                entry.put("reviewReference", reviewReference);
                entry.put("releasedAt", reviewedAt);
                entry.remove("blockingOrderId");
                changed = true;
            } catch (JSONException error) {
                return null;
            }
        }
        return changed ? reviewed : null;
    }

    private boolean markCallbackAttemptsReleased(
        SharedPreferences preferences,
        String orderId,
        SharedPreferences.Editor editor
    ) {
        RegistryLoadState registryState = loadCallbackAttemptRegistryState(preferences);
        if (!registryState.safeForMutation) return false;
        JSONArray registry = registryState.values;
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

    private boolean markStatusErrorAttemptAcknowledged(
        SharedPreferences preferences,
        String callbackAttemptId,
        String errorCode,
        SharedPreferences.Editor editor
    ) {
        RegistryLoadState registryState = loadCallbackAttemptRegistryState(preferences);
        if (!registryState.safeForMutation) return false;
        JSONArray registry = registryState.values;
        JSONObject entry = findCallbackAttemptById(registry, callbackAttemptId);
        if (entry != null) {
            long acknowledgedAt = System.currentTimeMillis();
            try {
                entry.put("errorAcknowledgedAt", acknowledgedAt);
                entry.put("acknowledgedErrorCode", errorCode);
                entry.put("releasedAt", acknowledgedAt);
            } catch (JSONException error) {
                return false;
            }
        }
        // Pre-registry callbacks can still be acknowledged exactly from their
        // queued identity. In that compatibility case the durable queue removal
        // remains authoritative even though no registry tombstone can be added.
        return saveCallbackAttemptRegistry(preferences, registry, editor);
    }

    private boolean markCallbackAttemptReceived(
        SharedPreferences preferences,
        String callbackAttemptId
    ) {
        RegistryLoadState registryState = loadCallbackAttemptRegistryState(preferences);
        if (!registryState.safeForMutation) return false;
        JSONArray registry = registryState.values;
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

        JSONObject newest = newestUnreleasedCallbackAttempt(registry);
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
        JSONObject newest = newestUnreleasedCallbackAttempt(registry);
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

    private JSONObject newestUnreleasedCallbackAttempt(JSONArray registry) {
        for (int index = registry.length() - 1; index >= 0; index--) {
            JSONObject entry = registry.optJSONObject(index);
            if (isValidCallbackAttempt(entry) && entry.optLong("releasedAt", 0L) <= 0L) {
                return entry;
            }
        }
        return null;
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

    @SuppressWarnings("deprecation")
    private long packageVersionCode(String packageName) {
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
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
        } catch (PackageManager.NameNotFoundException error) {
            return 0L;
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
