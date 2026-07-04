package expo.modules.sahualarm

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat

/**
 * FloatingAssistantService — draws a draggable 52dp blue water-drop bubble
 * via WindowManager (TYPE_APPLICATION_OVERLAY) that stays on screen over
 * ALL apps. Tap opens the host app.
 */
class FloatingAssistantService : Service() {

    private var overlay: View? = null
    private var wm: WindowManager? = null

    override fun onCreate() {
        super.onCreate()
        Channels.ensureAlarmChannel(this)
        startForeground(43, buildForegroundNotification())
        addBubble()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        try { if (overlay != null && wm != null) wm!!.removeView(overlay) } catch (_: Throwable) { }
        overlay = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildForegroundNotification(): Notification {
        val icon = applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val pi = if (launch != null) PendingIntent.getActivity(
            this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        ) else null
        val b = NotificationCompat.Builder(this, "sahu_keepalive")
            .setSmallIcon(icon)
            .setContentTitle("Sahu floating assistant")
            .setContentText("Tap to open the app")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
        if (pi != null) b.setContentIntent(pi)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) b.build() else b.build()
    }

    private fun addBubble() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            stopSelf()
            return
        }
        wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager

        val size = dp(52)
        val root = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(size, size)
        }
        val drop = TextView(this).apply {
            text = "💧"
            textSize = 22f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#1565C0"))
                setStroke(dp(2), Color.parseColor("#0D47A1"))
            }
        }
        root.addView(drop, FrameLayout.LayoutParams(size, size))

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE

        val lp = WindowManager.LayoutParams(
            size, size, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dp(24); y = dp(120)
        }

        var initX = 0; var initY = 0
        var downX = 0f; var downY = 0f
        var moved = false
        root.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    initX = lp.x; initY = lp.y
                    downX = e.rawX; downY = e.rawY
                    moved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (e.rawX - downX).toInt()
                    val dy = (e.rawY - downY).toInt()
                    if (dx * dx + dy * dy > 20) moved = true
                    lp.x = initX + dx; lp.y = initY + dy
                    try { wm?.updateViewLayout(root, lp) } catch (_: Throwable) { }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) {
                        val launch = packageManager.getLaunchIntentForPackage(packageName)
                        if (launch != null) {
                            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            startActivity(launch)
                        }
                    }
                    true
                }
                else -> false
            }
        }

        try { wm?.addView(root, lp); overlay = root } catch (_: Throwable) { stopSelf() }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
