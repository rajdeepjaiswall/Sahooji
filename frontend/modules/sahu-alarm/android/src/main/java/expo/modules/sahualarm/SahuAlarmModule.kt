package expo.modules.sahualarm

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

/**
 * JS ↔ Native bridge for the Sahu alarm layer.
 *
 * Exposes:
 *   scheduleAlarms(list) / cancelAlarm(id) / cancelAllAlarms()
 *   getPermissionStatus()
 *   openExactAlarmSettings / openFullScreenIntentSettings / openNotificationSettings
 *   openOverlaySettings / openBatteryOptimizationSettings / openAutoStartSettings
 *   requestNotificationPermission (Android 13+)
 *   startKeepAliveService / stopKeepAliveService
 *   startFloatingBubble / stopFloatingBubble
 *   drainPendingActions
 */
class SahuAlarmModule : Module() {

    private val context: Context
        get() = requireNotNull(appContext.reactContext) { "React context missing" }
            .applicationContext

    override fun definition() = ModuleDefinition {
        Name("SahuAlarm")

        Function("scheduleAlarms") { items: List<Map<String, Any?>> ->
            val ctx = context
            var count = 0
            for (item in items) {
                val id = item["id"] as? String ?: continue
                val remindIso = item["remind_at"] as? String ?: continue
                val whenMs = parseIso(remindIso) ?: continue
                if (whenMs < System.currentTimeMillis() - 10_000L) continue
                val payload = JSONObject().apply {
                    put("id", id)
                    put("remind_at_ms", whenMs)
                    put("title", item["title"] as? String ?: "Reminder")
                    put("body", item["body"] as? String ?: "")
                    put("contact_name", item["contact_name"] as? String ?: "")
                    put("organisation", item["organisation"] as? String ?: "")
                    put("mobile", item["mobile"] as? String ?: "")
                    put("tag_name", item["tag_name"] as? String ?: "")
                    put("tag_color", item["tag_color"] as? String ?: "")
                    put("vibrate", item["vibrate"] as? Boolean ?: true)
                }
                AlarmScheduler.schedule(ctx, payload)
                count++
            }
            mapOf("scheduled" to count)
        }

        Function("cancelAlarm") { id: String ->
            AlarmScheduler.cancel(context, id)
        }

        Function("cancelAllAlarms") {
            AlarmScheduler.cancelAll(context)
        }

        AsyncFunction("getPermissionStatus") { promise: Promise ->
            val ctx = context
            val notifications = NotificationManagerCompat.from(ctx).areNotificationsEnabled()
            val exact = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
            } else true
            val fullScreen = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).canUseFullScreenIntent()
            } else true
            val overlay = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(ctx)
            } else true
            val battery = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager)
                    .isIgnoringBatteryOptimizations(ctx.packageName)
            } else true
            val autostart = Autostart.isProbablyEnabled()

            promise.resolve(mapOf(
                "notifications" to notifications,
                "exact_alarms" to exact,
                "full_screen" to fullScreen,
                "overlay" to overlay,
                "battery" to battery,
                "autostart" to autostart,
                "manufacturer" to Autostart.manufacturerKey(),
            ))
        }

        Function("openExactAlarmSettings") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val i = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(i)
            }
        }

        Function("openFullScreenIntentSettings") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                val i = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(i)
            }
        }

        Function("openNotificationSettings") {
            val i = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                }
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${context.packageName}")
                }
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        }

        Function("openOverlaySettings") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val i = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${context.packageName}")
                )
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(i)
            }
        }

        Function("openBatteryOptimizationSettings") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                try { context.startActivity(i) } catch (_: Throwable) {
                    val f = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                    f.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(f)
                }
            }
        }

        Function("openAutoStartSettings") {
            Autostart.open(context)
        }

        AsyncFunction("requestNotificationPermission") { promise: Promise ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val activity = appContext.currentActivity
                val granted = ContextCompat.checkSelfPermission(
                    context, Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
                if (granted) {
                    promise.resolve(true)
                    return@AsyncFunction
                }
                if (activity != null) {
                    ActivityCompat.requestPermissions(
                        activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4242
                    )
                }
                // We can't easily await the result here without registering a
                // callback; a simple check-after approach is fine — user can
                // recheck via the panel.
                promise.resolve(false)
            } else {
                promise.resolve(true)
            }
        }

        Function("startKeepAliveService") {
            val svc = Intent(context, KeepAliveService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(svc)
            } else {
                context.startService(svc)
            }
        }

        Function("stopKeepAliveService") {
            context.stopService(Intent(context, KeepAliveService::class.java))
        }

        Function("startFloatingBubble") {
            val svc = Intent(context, FloatingAssistantService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(svc)
            } else {
                context.startService(svc)
            }
        }

        Function("stopFloatingBubble") {
            context.stopService(Intent(context, FloatingAssistantService::class.java))
        }

        AsyncFunction("drainPendingActions") { promise: Promise ->
            val arr = AlarmScheduler.drainPendingActions(context)
            val out = mutableListOf<Map<String, Any?>>()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                out.add(mapOf(
                    "id" to o.optString("id"),
                    "reminder_id" to o.optString("reminder_id"),
                    "action" to o.optString("action"),
                    "snooze_minutes" to (if (o.has("snooze_minutes")) o.optInt("snooze_minutes") else null),
                    "ts" to o.optLong("ts"),
                ))
            }
            promise.resolve(out)
        }
    }

    private fun parseIso(iso: String): Long? = try {
        java.time.Instant.parse(iso).toEpochMilli()
    } catch (_: Throwable) {
        null
    }
}
