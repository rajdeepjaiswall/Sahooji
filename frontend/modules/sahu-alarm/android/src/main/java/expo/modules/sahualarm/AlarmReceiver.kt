package expo.modules.sahualarm

import android.Manifest
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.PixelFormat
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * AlarmReceiver
 *
 *  Fires when AlarmManager triggers our PendingIntent. In order:
 *   1) Short WAKE_LOCK to ensure the CPU stays on long enough to build
 *      the notification.
 *   2) Play the alarm sound DIRECTLY as a static looping Ringtone with
 *      USAGE_ALARM (independent of any notification channel).
 *   3) Vibrate a waveform.
 *   4) Build a HIGH-importance notification with setFullScreenIntent —
 *      this is what actually launches AlarmActivity when the OS forbids
 *      background activity starts (Android 10+).
 *   5) Also attempt a direct startActivity() in try/catch as an accelerator.
 *   6) Publish a Dynamic-Island-style pill overlay via WindowManager
 *      (if SYSTEM_ALERT_WINDOW granted).
 */
class AlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return
        val title = intent.getStringExtra(AlarmScheduler.EXTRA_TITLE) ?: "Reminder"
        val body = intent.getStringExtra(AlarmScheduler.EXTRA_BODY) ?: ""
        val contact = intent.getStringExtra(AlarmScheduler.EXTRA_CONTACT).orEmpty()
        val org = intent.getStringExtra(AlarmScheduler.EXTRA_ORG).orEmpty()
        val mobile = intent.getStringExtra(AlarmScheduler.EXTRA_MOBILE).orEmpty()
        val tag = intent.getStringExtra(AlarmScheduler.EXTRA_TAG).orEmpty()
        val tagColor = intent.getStringExtra(AlarmScheduler.EXTRA_TAG_COLOR).orEmpty()
        val vibrate = intent.getBooleanExtra(AlarmScheduler.EXTRA_VIBRATE, true)

        // Step 1: WakeLock
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        @Suppress("DEPRECATION")
        val wl = pm.newWakeLock(
            PowerManager.FULL_WAKE_LOCK or
                PowerManager.ACQUIRE_CAUSES_WAKEUP or
                PowerManager.ON_AFTER_RELEASE,
            "sahu:alarm-$id"
        )
        try {
            wl.acquire(30_000L)
        } catch (_: Throwable) { /* ignore */ }

        Channels.ensureAlarmChannel(context)

        // Step 2: play sound (static Ringtone)
        try { playAlarmSound(context) } catch (_: Throwable) { /* ignore */ }

        // Step 3: vibrate
        if (vibrate) try { vibrate(context) } catch (_: Throwable) { /* ignore */ }

        // Step 4: full-screen intent notification
        try { showNotification(context, id, title, body, contact, org, mobile, tag, tagColor) } catch (_: Throwable) { /* ignore */ }

        // Step 5: direct startActivity (best-effort)
        try {
            val i = Intent(context, AlarmActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra(AlarmScheduler.EXTRA_ID, id)
                putExtra(AlarmScheduler.EXTRA_TITLE, title)
                putExtra(AlarmScheduler.EXTRA_BODY, body)
                putExtra(AlarmScheduler.EXTRA_CONTACT, contact)
                putExtra(AlarmScheduler.EXTRA_ORG, org)
                putExtra(AlarmScheduler.EXTRA_MOBILE, mobile)
                putExtra(AlarmScheduler.EXTRA_TAG, tag)
                putExtra(AlarmScheduler.EXTRA_TAG_COLOR, tagColor)
            }
            context.startActivity(i)
        } catch (_: Throwable) { /* silently blocked on Android 10+ if in background — that's fine */ }

        // Step 6: Dynamic-Island pill overlay
        try { showIslandPill(context, id, title, contact) } catch (_: Throwable) { /* ignore */ }

        try { if (wl.isHeld) wl.release() } catch (_: Throwable) { /* ignore */ }
    }

    // -----------------------------------------------------------------------
    // Static looping ringtone (independent of channels).
    // -----------------------------------------------------------------------
    companion object {
        @Volatile private var currentRingtone: Ringtone? = null
        @Volatile private var overlayView: View? = null
        @Volatile private var overlayHandler: Handler? = null

        @JvmStatic
        fun stopAlarmSound(context: Context) {
            try { currentRingtone?.stop() } catch (_: Throwable) { }
            currentRingtone = null
            try { (context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.cancel() } catch (_: Throwable) { }
            hideIsland(context)
        }

        fun hideIsland(context: Context) {
            val wm = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
            val v = overlayView
            if (wm != null && v != null) {
                try { wm.removeView(v) } catch (_: Throwable) { }
            }
            overlayView = null
            overlayHandler?.removeCallbacksAndMessages(null)
            overlayHandler = null
        }
    }

    private fun playAlarmSound(context: Context) {
        val uri: Uri = try {
            Uri.parse("android.resource://${context.packageName}/raw/alarm")
        } catch (_: Throwable) {
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        }
        val ringtone = RingtoneManager.getRingtone(context, uri) ?: return
        ringtone.audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ringtone.isLooping = true
        }
        currentRingtone?.stop()
        currentRingtone = ringtone
        ringtone.play()
    }

    private fun vibrate(context: Context) {
        val v = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
        val pattern = longArrayOf(0, 800, 400, 800, 400, 800)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createWaveform(pattern, 0))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(pattern, 0)
        }
    }

    private fun showNotification(
        context: Context,
        id: String,
        title: String,
        body: String,
        contact: String,
        org: String,
        mobile: String,
        tag: String,
        tagColor: String,
    ) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Android 13+: POST_NOTIFICATIONS runtime check — guard notify().
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) return
        }

        val activityIntent = Intent(context, AlarmActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(AlarmScheduler.EXTRA_ID, id)
            putExtra(AlarmScheduler.EXTRA_TITLE, title)
            putExtra(AlarmScheduler.EXTRA_BODY, body)
            putExtra(AlarmScheduler.EXTRA_CONTACT, contact)
            putExtra(AlarmScheduler.EXTRA_ORG, org)
            putExtra(AlarmScheduler.EXTRA_MOBILE, mobile)
            putExtra(AlarmScheduler.EXTRA_TAG, tag)
            putExtra(AlarmScheduler.EXTRA_TAG_COLOR, tagColor)
        }
        val fullScreenPI = PendingIntent.getActivity(
            context, id.hashCode(), activityIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val snoozePI = PendingIntent.getBroadcast(
            context, id.hashCode() + 1,
            Intent(context, AlarmActionReceiver::class.java).apply {
                action = AlarmActionReceiver.ACTION_SNOOZE
                putExtra(AlarmScheduler.EXTRA_ID, id)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val cancelPI = PendingIntent.getBroadcast(
            context, id.hashCode() + 2,
            Intent(context, AlarmActionReceiver::class.java).apply {
                action = AlarmActionReceiver.ACTION_CANCEL
                putExtra(AlarmScheduler.EXTRA_ID, id)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val icon = context.applicationInfo.icon.takeIf { it != 0 }
            ?: android.R.drawable.ic_dialog_info
        val notif = NotificationCompat.Builder(context, "sahu_alarms")
            .setSmallIcon(icon)
            .setContentTitle(if (contact.isNotBlank()) contact else title)
            .setContentText(if (title.isNotBlank()) title else body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body.ifBlank { title }))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPI, true)
            .setContentIntent(fullScreenPI)
            .addAction(0, "Snooze 30 min", snoozePI)
            .addAction(0, "Cancel", cancelPI)
            .apply {
                if (tagColor.isNotBlank()) {
                    try { setColor(Color.parseColor(tagColor)); setColorized(true) } catch (_: Throwable) { }
                }
            }
            .build()
        nm.notify(id.hashCode(), notif)
    }

    // -----------------------------------------------------------------------
    // Dynamic-Island pill overlay (top-center).
    // -----------------------------------------------------------------------
    private fun showIslandPill(context: Context, id: String, title: String, contact: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!android.provider.Settings.canDrawOverlays(context)) return
        }
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

        val root = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(context, 14), dp(context, 8), dp(context, 14), dp(context, 8))
            background = pillBackground(context)
            gravity = Gravity.CENTER_VERTICAL
        }
        val text = TextView(context).apply {
            text = "🔔 " + (if (contact.isNotBlank()) contact else title)
            setTextColor(Color.WHITE)
            textSize = 13f
        }
        val snooze = TextView(context).apply {
            text = "  💤"
            setTextColor(Color.WHITE)
            textSize = 16f
            setOnClickListener {
                context.sendBroadcast(Intent(context, AlarmActionReceiver::class.java).apply {
                    action = AlarmActionReceiver.ACTION_SNOOZE
                    putExtra(AlarmScheduler.EXTRA_ID, id)
                    setPackage(context.packageName)
                })
                hideIsland(context)
            }
        }
        val end = TextView(context).apply {
            text = "  ❌"
            setTextColor(Color.WHITE)
            textSize = 16f
            setOnClickListener {
                context.sendBroadcast(Intent(context, AlarmActionReceiver::class.java).apply {
                    action = AlarmActionReceiver.ACTION_CANCEL
                    putExtra(AlarmScheduler.EXTRA_ID, id)
                    setPackage(context.packageName)
                })
                hideIsland(context)
            }
        }
        root.addView(text)
        root.addView(snooze)
        root.addView(end)
        root.setOnClickListener {
            val i = Intent(context, AlarmActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                putExtra(AlarmScheduler.EXTRA_ID, id)
            }
            context.startActivity(i)
        }

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE

        val lp = WindowManager.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = dp(context, 8)
        }
        try {
            overlayView?.let { wm.removeView(it) }
        } catch (_: Throwable) { }
        wm.addView(root, lp)
        overlayView = root
        val handler = Handler(Looper.getMainLooper())
        overlayHandler = handler
        handler.postDelayed({ hideIsland(context) }, 45_000L)
    }

    private fun pillBackground(context: Context): android.graphics.drawable.Drawable {
        val bg = android.graphics.drawable.GradientDrawable().apply {
            shape = android.graphics.drawable.GradientDrawable.RECTANGLE
            cornerRadius = dp(context, 26).toFloat()
            setColor(Color.parseColor("#0F172A"))
        }
        return bg
    }

    private fun dp(ctx: Context, v: Int): Int =
        (v * ctx.resources.displayMetrics.density).toInt()
}
