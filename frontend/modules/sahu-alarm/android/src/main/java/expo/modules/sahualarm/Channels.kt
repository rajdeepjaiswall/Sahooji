package expo.modules.sahualarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object Channels {
    fun ensureAlarmChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel("sahu_alarms") == null) {
            val ch = NotificationChannel(
                "sahu_alarms",
                "Sahu Reminders",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Full-screen reminders"
                // Channel intentionally has NO sound — we play a static Ringtone directly.
                setSound(null, null)
                enableVibration(true)
                enableLights(true)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
            }
            nm.createNotificationChannel(ch)
        }
        if (nm.getNotificationChannel("sahu_keepalive") == null) {
            val ch = NotificationChannel(
                "sahu_keepalive",
                "Sahu Background",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Keeps reminders reliable"
                setShowBadge(false)
            }
            nm.createNotificationChannel(ch)
        }
        if (nm.getNotificationChannel("sahu_bubbles") == null) {
            val ch = NotificationChannel(
                "sahu_bubbles",
                "Sahu Bubbles",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Bubble reminders"
                setSound(null, null)
            }
            nm.createNotificationChannel(ch)
        }
    }
}
