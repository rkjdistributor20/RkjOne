package com.rkjone.staff;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.admin.DevicePolicyManager;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.view.View;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RkjDevicePolicy")
public class RkjDevicePolicyPlugin extends Plugin {
    private static final String PREFS = "rkj_device_policy";
    private static final String KIOSK_ENABLED = "kiosk_enabled";
    private static volatile boolean systemDialogActive = false;

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(readStatus(getActivity()));
    }

    @PluginMethod
    public void enableKiosk(PluginCall call) {
        Activity activity = getActivity();
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KIOSK_ENABLED, true)
            .apply();
        enforceKiosk(activity);
        call.resolve(readStatus(activity));
    }

    public static void enforceKiosk(Activity activity) {
        if (activity == null || systemDialogActive || !isKioskEnabled(activity)) return;

        activity.runOnUiThread(() -> enforceKioskOnUiThread(activity));
    }

    public static void runWithKioskSuspended(Activity activity, Runnable action) {
        if (activity == null) {
            action.run();
            return;
        }

        systemDialogActive = true;
        activity.runOnUiThread(() -> {
            try {
                ActivityManager activityManager = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
                if (activityManager != null
                    && activityManager.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE) {
                    activity.stopLockTask();
                }
            } catch (RuntimeException ignored) {
                // Permission UI must remain usable even when an OEM restricts lock-task changes.
            }
            action.run();
        });
    }

    public static void resumeKioskAfterSystemDialog(Activity activity) {
        systemDialogActive = false;
        enforceKiosk(activity);
    }

    private static void enforceKioskOnUiThread(Activity activity) {
        if (activity.isFinishing()
            || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1 && activity.isDestroyed())) {
            return;
        }

        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        activity.getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );

        DevicePolicyManager dpm = (DevicePolicyManager) activity.getSystemService(Context.DEVICE_POLICY_SERVICE);
        if (dpm != null && dpm.isLockTaskPermitted(activity.getPackageName())) {
            try {
                activity.startLockTask();
            } catch (RuntimeException ignored) {
                // Android will retry when the activity resumes.
            }
        }
    }

    private static boolean isKioskEnabled(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return preferences.getBoolean(KIOSK_ENABLED, false);
    }

    private static JSObject readStatus(Activity activity) {
        JSObject result = new JSObject();
        if (activity == null) return result;

        DevicePolicyManager dpm = (DevicePolicyManager) activity.getSystemService(Context.DEVICE_POLICY_SERVICE);
        KeyguardManager keyguard = (KeyguardManager) activity.getSystemService(Context.KEYGUARD_SERVICE);
        ActivityManager activityManager = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
        String packageName = activity.getPackageName();

        boolean deviceOwner = dpm != null && dpm.isDeviceOwnerApp(packageName);
        boolean lockTaskPermitted = dpm != null && dpm.isLockTaskPermitted(packageName);
        boolean lockTaskActive = false;
        if (activityManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            lockTaskActive = activityManager.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
        }

        result.put("nativeApp", true);
        result.put("packageName", packageName);
        result.put("manufacturer", Build.MANUFACTURER);
        result.put("model", Build.MODEL);
        result.put("androidVersion", Build.VERSION.RELEASE);
        result.put("sdkLevel", Build.VERSION.SDK_INT);
        result.put("deviceOwner", deviceOwner);
        result.put("lockTaskPermitted", lockTaskPermitted);
        result.put("lockTaskActive", lockTaskActive);
        result.put("screenLockSecure", keyguard != null && keyguard.isDeviceSecure());
        result.put("kioskRequested", isKioskEnabled(activity));
        return result;
    }
}
