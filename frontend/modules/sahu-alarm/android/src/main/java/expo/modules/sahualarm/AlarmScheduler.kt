package expo.modules.sahualarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * AlarmScheduler
 *
 *  Persists alarm payloads to SharedPreferences and schedules them via
 *  AlarmManager.setAlarmClock() (exact, Doze-proof) when the OS + user
 *  permission allow it; otherwise falls back to setExactAndAllowWhileIdle /
 *  setAndAllowWhileIdle. After reboot BootReceiver calls rescheduleAll().
 */
object AlarmScheduler {

    private const val PREFS = "sahu_alarm_prefs"
    private const val KEY_ALARMS = "alarms_json"
    private const val KEY_PENDING_ACTIONS = "pending_actions"
    const val EXTRA_ID = "alarm_id"
    const val EXTRA_TITLE = "alarm_title"
    const val EXTRA_BODY = "alarm_body"
    const val EXTRA_CONTACT = "alarm_contact"
    const val EXTRA_ORG = "alarm_org"
    const val EXTRA_MOBILE = "alarm_mobile"
    const val EXTRA_TAG = "alarm_tag"
    const val EXTRA_TAG_COLOR = "alarm_tag_color"
    const val EXTRA_VIBRATE = "alarm_vibrate"
    const val EXTRA_REMIND_AT = "alarm_remind_at"

    fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun schedule(ctx: Context, payload: JSONObject) {
        val id = payload.getString("id")
        val remindAt = payload.getLong("remind_at_ms")
        upsertPayload(ctx, payload)
        doSchedule(ctx, id, remindAt, payload)
    }

    fun cancel(ctx: Context, id: String) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = pendingIntent(ctx, id, JSONObject().put("id", id))
        am.cancel(pi)
        val store = prefs(ctx)
        val arr = readAll(store)
        val filtered = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            if (o.optString("id") != id) filtered.put(o)
        }
        store.edit().putString(KEY_ALARMS, filtered.toString()).apply()
    }

    fun cancelAll(ctx: Context) {
        val store = prefs(ctx)
        val arr = readAll(store)
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            val pi = pendingIntent(ctx, o.getString("id"), o)
            am.cancel(pi)
        }
        store.edit().remove(KEY_ALARMS).apply()
    }

    fun rescheduleAll(ctx: Context) {
        val arr = readAll(prefs(ctx))
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            val id = o.optString("id") ?: continue
            val remindAt = o.optLong("remind_at_ms")
            if (remindAt > 0) doSchedule(ctx, id, remindAt, o)
        }
    }

    fun findById(ctx: Context, id: String): JSONObject? {
        val arr = readAll(prefs(ctx))
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            if (o.optString("id") == id) return o
        }
        return null
    }

    fun recordPendingAction(ctx: Context, action: JSONObject) {
        val store = prefs(ctx)
        val existing = store.getString(KEY_PENDING_ACTIONS, "[]") ?: "[]"
        val arr = JSONArray(existing)
        arr.put(action)
        store.edit().putString(KEY_PENDING_ACTIONS, arr.toString()).apply()
    }

    fun drainPendingActions(ctx: Context): JSONArray {
        val store = prefs(ctx)
        val existing = store.getString(KEY_PENDING_ACTIONS, "[]") ?: "[]"
        store.edit().remove(KEY_PENDING_ACTIONS).apply()
        return JSONArray(existing)
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------
    private fun upsertPayload(ctx: Context, payload: JSONObject) {
        val id = payload.getString("id")
        val store = prefs(ctx)
        val arr = readAll(store)
        val out = JSONArray()
        var replaced = false
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            if (o.optString("id") == id) {
                out.put(payload); replaced = true
            } else {
                out.put(o)
            }
        }
        if (!replaced) out.put(payload)
        store.edit().putString(KEY_ALARMS, out.toString()).apply()
    }

    private fun readAll(store: SharedPreferences): JSONArray {
        val raw = store.getString(KEY_ALARMS, "[]") ?: "[]"
        return try { JSONArray(raw) } catch (_: Throwable) { JSONArray() }
    }

    private fun pendingIntent(ctx: Context, id: String, payload: JSONObject): PendingIntent {
        val intent = Intent(ctx, AlarmReceiver::class.java).apply {
            action = "expo.modules.sahualarm.FIRE"
            putExtra(EXTRA_ID, id)
            putExtra(EXTRA_TITLE, payload.optString("title"))
            putExtra(EXTRA_BODY, payload.optString("body"))
            putExtra(EXTRA_CONTACT, payload.optString("contact_name"))
            putExtra(EXTRA_ORG, payload.optString("organisation"))
            putExtra(EXTRA_MOBILE, payload.optString("mobile"))
            putExtra(EXTRA_TAG, payload.optString("tag_name"))
            putExtra(EXTRA_TAG_COLOR, payload.optString("tag_color"))
            putExtra(EXTRA_VIBRATE, payload.optBoolean("vibrate", true))
            putExtra(EXTRA_REMIND_AT, payload.optLong("remind_at_ms"))
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getBroadcast(ctx, id.hashCode(), intent, flags)
    }

    private fun openAppPendingIntent(ctx: Context): PendingIntent {
        val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getActivity(ctx, 42, launch, flags)
    }

    private fun doSchedule(ctx: Context, id: String, whenMs: Long, payload: JSONObject) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = pendingIntent(ctx, id, payload)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am.canScheduleExactAlarms()) {
                val info = AlarmManager.AlarmClockInfo(whenMs, openAppPendingIntent(ctx))
                am.setAlarmClock(info, pi)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, whenMs, pi)
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, whenMs, pi)
            }
        } catch (t: SecurityException) {
            // Missing SCHEDULE_EXACT_ALARM permission: fall back to inexact.
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, whenMs, pi)
        }
    }
}
