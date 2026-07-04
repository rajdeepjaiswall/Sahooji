package expo.modules.sahualarm

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject

/**
 * Handles Snooze / Cancel actions from the notification, bubble, and
 * Dynamic-Island pill. Writes a pending action to SharedPreferences so
 * the JS layer can sync it to the backend on next app open.
 */
class AlarmActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_SNOOZE = "expo.modules.sahualarm.SNOOZE"
        const val ACTION_CANCEL = "expo.modules.sahualarm.CANCEL"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return
        AlarmReceiver.stopAlarmSound(context)
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(id.hashCode())

        // Tell any live AlarmActivity to close.
        context.sendBroadcast(Intent(AlarmActivity.ACTION_STOP_ALARM).setPackage(context.packageName))

        when (intent.action) {
            ACTION_SNOOZE -> {
                val old = AlarmScheduler.findById(context, id)
                val whenMs = System.currentTimeMillis() + 30 * 60_000L
                val updated = old ?: JSONObject().put("id", id)
                updated.put("remind_at_ms", whenMs)
                AlarmScheduler.schedule(context, updated)
                AlarmScheduler.recordPendingAction(context, JSONObject().apply {
                    put("id", id + "_snoozed_" + System.currentTimeMillis())
                    put("reminder_id", id)
                    put("action", "snoozed")
                    put("snooze_minutes", 30)
                    put("ts", System.currentTimeMillis())
                })
            }
            ACTION_CANCEL -> {
                AlarmScheduler.cancel(context, id)
                AlarmScheduler.recordPendingAction(context, JSONObject().apply {
                    put("id", id + "_ended_" + System.currentTimeMillis())
                    put("reminder_id", id)
                    put("action", "ended")
                    put("ts", System.currentTimeMillis())
                })
            }
        }
    }
}
