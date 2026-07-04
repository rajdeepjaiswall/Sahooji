package expo.modules.sahualarm

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * IMPORTANCE_MIN foreground service that keeps the process alive on OEM
 * killers (Xiaomi/Oppo/Vivo/etc). START_STICKY so the OS restarts it.
 */
class KeepAliveService : Service() {

    override fun onCreate() {
        super.onCreate()
        Channels.ensureAlarmChannel(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val icon = applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val pi = if (launch != null) PendingIntent.getActivity(
            this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        ) else null
        val notif: Notification = NotificationCompat.Builder(this, "sahu_keepalive")
            .setSmallIcon(icon)
            .setContentTitle("Sahu reminders active")
            .setContentText("Keeps your alarms reliable in the background")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .apply { if (pi != null) setContentIntent(pi) }
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                42, notif,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(42, notif)
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
