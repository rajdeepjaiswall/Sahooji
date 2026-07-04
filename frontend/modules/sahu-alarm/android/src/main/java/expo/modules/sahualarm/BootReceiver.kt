package expo.modules.sahualarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Re-schedules all persisted alarms after device boot. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON" -> {
                AlarmScheduler.rescheduleAll(context)
                // Optionally restart the keep-alive service.
                try {
                    val svc = Intent(context, KeepAliveService::class.java)
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                        context.startForegroundService(svc)
                    } else {
                        context.startService(svc)
                    }
                } catch (_: Throwable) { /* ignore */ }
            }
        }
    }
}
