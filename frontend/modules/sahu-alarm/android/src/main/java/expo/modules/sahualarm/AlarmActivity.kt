package expo.modules.sahualarm

import android.app.Activity
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

/**
 * AlarmActivity — full-screen takeover.
 *
 *  Uses setShowWhenLocked / setTurnScreenOn so it appears over the lock screen.
 *  Provides END / SNOOZE / ASSIGN / WhatsApp / Call / SMS. Volume keys act as
 *  a PANIC MUTE — they silence sound/vibration but keep the screen visible.
 */
class AlarmActivity : Activity() {

    private var alarmId: String = ""
    private var mobile: String = ""
    private val stopReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == ACTION_STOP_ALARM) finish()
        }
    }

    companion object {
        const val ACTION_STOP_ALARM = "expo.modules.sahualarm.STOP_ALARM"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        alarmId = intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: ""
        val title = intent.getStringExtra(AlarmScheduler.EXTRA_TITLE) ?: "Reminder"
        val body = intent.getStringExtra(AlarmScheduler.EXTRA_BODY) ?: ""
        val contact = intent.getStringExtra(AlarmScheduler.EXTRA_CONTACT).orEmpty()
        val org = intent.getStringExtra(AlarmScheduler.EXTRA_ORG).orEmpty()
        mobile = intent.getStringExtra(AlarmScheduler.EXTRA_MOBILE).orEmpty()
        val tag = intent.getStringExtra(AlarmScheduler.EXTRA_TAG).orEmpty()
        val tagColorStr = intent.getStringExtra(AlarmScheduler.EXTRA_TAG_COLOR).orEmpty()
        val tagColor = try { Color.parseColor(tagColorStr) } catch (_: Throwable) { Color.parseColor("#1565C0") }

        setContentView(buildUi(title, body, contact, org, tag, tagColor))

        val filter = IntentFilter(ACTION_STOP_ALARM)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(stopReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(stopReceiver, filter)
        }
    }

    override fun onDestroy() {
        try { unregisterReceiver(stopReceiver) } catch (_: Throwable) { }
        super.onDestroy()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            // Panic mute — silence but stay on screen.
            AlarmReceiver.stopAlarmSound(this)
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    // -----------------------------------------------------------------------
    // UI (built programmatically to avoid layout XML in a library module).
    // -----------------------------------------------------------------------
    private fun buildUi(
        title: String,
        body: String,
        contact: String,
        org: String,
        tag: String,
        tagColor: Int,
    ): View {
        val bg = GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(tagColor, Color.parseColor("#0F172A"))
        )
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = bg
            setPadding(dp(20), dp(48), dp(20), dp(32))
            gravity = Gravity.CENTER_HORIZONTAL
        }

        val topLabel = TextView(this).apply {
            text = "REMINDER"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            letterSpacing = 0.2f
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }
        root.addView(topLabel)

        if (tag.isNotBlank()) {
            val tagBadge = TextView(this).apply {
                text = tag
                setTextColor(Color.WHITE)
                setPadding(dp(12), dp(6), dp(12), dp(6))
                background = pillBackground(Color.parseColor("#FFFFFF").and(0x40FFFFFF.toInt()))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                (layoutParams as? LinearLayout.LayoutParams ?: LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
                )).also { lp ->
                    lp.topMargin = dp(12); layoutParams = lp
                }
            }
            root.addView(tagBadge)
        }

        val contactText = TextView(this).apply {
            text = if (contact.isNotBlank()) contact else title
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 32f)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(0, dp(28), 0, 0)
        }
        root.addView(contactText)

        if (org.isNotBlank()) {
            val orgText = TextView(this).apply {
                text = org
                setTextColor(Color.parseColor("#DDF0FF"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            }
            root.addView(orgText)
        }

        if (body.isNotBlank()) {
            val bodyText = TextView(this).apply {
                text = body
                setTextColor(Color.parseColor("#BFD8F5"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
                setPadding(0, dp(16), 0, 0)
            }
            root.addView(bodyText)
        }

        // Quick action row (Call / WhatsApp / SMS)
        val quickRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(24), 0, 0)
        }
        quickRow.addView(quickButton("📞 Call") { open("tel:$mobile") })
        quickRow.addView(quickButton("💬 WhatsApp") { open("https://wa.me/${mobile.replace("+", "")}") })
        quickRow.addView(quickButton("✉️ SMS") { open("sms:$mobile") })
        root.addView(quickRow)

        // Spacer
        val spacer = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, 0, 1f)
        }
        root.addView(spacer)

        // Actions
        val actionRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        actionRow.addView(bigButton("END", Color.parseColor("#EF4444")) { endAlarm() })
        actionRow.addView(bigButton("SNOOZE", Color.parseColor("#EAB308")) { snoozeAlarm(30) })
        actionRow.addView(bigButton("MUTE", Color.parseColor("#1565C0")) {
            AlarmReceiver.stopAlarmSound(this)
        })
        root.addView(actionRow)

        return root
    }

    private fun quickButton(label: String, onClick: () -> Unit): View {
        val tv = TextView(this).apply {
            text = label
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            gravity = Gravity.CENTER
            setPadding(dp(10), dp(12), dp(10), dp(12))
            background = pillBackground(Color.parseColor("#33FFFFFF"))
            setOnClickListener { onClick() }
        }
        val lp = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        lp.setMargins(dp(4), 0, dp(4), 0)
        tv.layoutParams = lp
        return tv
    }

    private fun bigButton(label: String, color: Int, onClick: () -> Unit): View {
        val tv = TextView(this).apply {
            text = label
            setTextColor(Color.WHITE)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(18), dp(8), dp(18))
            background = pillBackground(color)
            setOnClickListener { onClick() }
        }
        val lp = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        lp.setMargins(dp(4), 0, dp(4), 0)
        tv.layoutParams = lp
        return tv
    }

    private fun pillBackground(color: Int): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(12).toFloat()
            setColor(color)
        }
    }

    private fun dp(v: Int): Int =
        (v * resources.displayMetrics.density).toInt()

    private fun open(uri: String) {
        try {
            val i = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(i)
        } catch (_: Throwable) { }
    }

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------
    private fun endAlarm() {
        AlarmReceiver.stopAlarmSound(this)
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .cancel(alarmId.hashCode())
        AlarmScheduler.recordPendingAction(this, org.json.JSONObject().apply {
            put("id", alarmId + "_ended_" + System.currentTimeMillis())
            put("reminder_id", alarmId)
            put("action", "ended")
            put("ts", System.currentTimeMillis())
        })
        AlarmScheduler.cancel(this, alarmId)
        finish()
    }

    private fun snoozeAlarm(minutes: Int) {
        AlarmReceiver.stopAlarmSound(this)
        val old = AlarmScheduler.findById(this, alarmId)
        val whenMs = System.currentTimeMillis() + minutes * 60_000L
        val updated = old ?: org.json.JSONObject().put("id", alarmId)
        updated.put("remind_at_ms", whenMs)
        AlarmScheduler.schedule(this, updated)
        AlarmScheduler.recordPendingAction(this, org.json.JSONObject().apply {
            put("id", alarmId + "_snoozed_" + System.currentTimeMillis())
            put("reminder_id", alarmId)
            put("action", "snoozed")
            put("snooze_minutes", minutes)
            put("ts", System.currentTimeMillis())
        })
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .cancel(alarmId.hashCode())
        finish()
    }
}
